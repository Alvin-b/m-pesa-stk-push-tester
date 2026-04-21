import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { APP_BRAND } from "@/lib/brand";
import { usePlatform } from "@/lib/platform";
import { supabase } from "@/integrations/supabase/client";
import { buildMikroTikShellHtml } from "@/lib/mikrotik";
import {
  ArrowUpRight,
  BellRing,
  CreditCard,
  FileSpreadsheet,
  Globe,
  Loader2,
  Network,
  ReceiptText,
  Router,
  ShieldAlert,
  Sparkles,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const toneClasses = {
  positive: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  neutral: "text-sky-200 border-sky-300/30 bg-sky-400/10",
  warning: "text-amber-200 border-amber-300/30 bg-amber-300/10",
};

const routerTone = {
  healthy: "bg-emerald-400",
  warning: "bg-amber-300",
  offline: "bg-rose-400",
};

const invoiceTone = {
  paid: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
  due: "bg-sky-400/15 text-sky-100 border-sky-400/30",
  overdue: "bg-rose-400/15 text-rose-100 border-rose-400/30",
};

interface WorkspaceStats {
  grossSales: number;
  purchases: number;
  overdueInvoices: number;
  routerHealth: number;
  paidRevenueThisMonth: number;
  activeRouters: number;
  totalRouters: number;
}

interface WorkspaceCustomer {
  code: string;
  phoneNumber: string;
  packageName: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

const TenantWorkspace = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, loading: platformLoading } = usePlatform();
  const { toast } = useToast();
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [liveInvoices, setLiveInvoices] = useState<Array<{
    id: string;
    period: string;
    amount: string;
    usage: string;
    status: "paid" | "due" | "overdue";
    dueDate: string;
  }>>([]);
  const [liveRouters, setLiveRouters] = useState<Array<{
    id: string;
    name: string;
    site: string;
    status: "healthy" | "warning" | "offline";
    clients: number;
    revenueToday: string;
    lastSync: string;
  }>>([]);
  const [recentCustomers, setRecentCustomers] = useState<WorkspaceCustomer[]>([]);
  const [newStation, setNewStation] = useState({ name: "", siteName: "", host: "" });
  const [savingStation, setSavingStation] = useState(false);
  const [stationError, setStationError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!activeTenant?.id || activeTenant.id === "legacy-fallback") return;

    const loadWorkspace = async () => {
      try {
        const [voucherRes, routerRes, invoiceRes] = await Promise.all([
          supabase
            .from("vouchers")
            .select("code, phone_number, status, created_at, expires_at, packages(name, price), tenant_id")
            .eq("tenant_id", activeTenant.id)
            .order("created_at", { ascending: false })
            .limit(2000),
          supabase
            .from("routers")
            .select("id, name, site_name, provisioning_status, last_seen_at, last_error")
            .eq("tenant_id", activeTenant.id)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("billing_invoices")
            .select("id, invoice_number, billing_period_start, total, status, due_date, purchase_count")
            .eq("tenant_id", activeTenant.id)
            .order("created_at", { ascending: false })
            .limit(6),
        ]);

        const voucherRows = (voucherRes.data ?? []) as Array<{
          code: string;
          phone_number: string;
          status: string;
          created_at: string;
          expires_at?: string | null;
          tenant_id?: string | null;
          packages?: { name?: string | null; price?: number | null } | null;
        }>;

        setRecentCustomers(
          voucherRows.slice(0, 8).map((row) => ({
            code: row.code,
            phoneNumber: row.phone_number,
            packageName: row.packages?.name || "Custom package",
            status: row.status,
            createdAt: row.created_at,
            expiresAt: row.expires_at || null,
          })),
        );

        const totalRevenue = voucherRows
          .filter((row) => row.status !== "revoked")
          .reduce((sum, row) => sum + (row.packages?.price ?? 0), 0);

        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthRevenue = voucherRows
          .filter((row) => row.status !== "revoked" && row.created_at.startsWith(currentMonth))
          .reduce((sum, row) => sum + (row.packages?.price ?? 0), 0);

        const routerRows = (routerRes.data ?? []) as Array<{
          id: string;
          name: string;
          site_name?: string | null;
          provisioning_status?: string | null;
          last_seen_at?: string | null;
          last_error?: string | null;
        }>;

        const invoiceRows = (invoiceRes.data ?? []) as Array<{
          id: string;
          invoice_number: string;
          billing_period_start: string;
          total: number;
          status: "draft" | "paid" | "due" | "overdue";
          due_date?: string | null;
          purchase_count?: number | null;
        }>;

        if (invoiceRows.length) {
          setLiveInvoices(
            invoiceRows.map((row) => ({
              id: row.invoice_number || row.id,
              period: new Date(row.billing_period_start).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
              amount: `KES ${row.total.toLocaleString()}`,
              usage: `${row.purchase_count ?? 0} paid purchases`,
              status: row.status === "draft" ? "due" : row.status,
              dueDate: row.due_date
                ? new Date(row.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                : "Pending",
            })),
          );
        } else {
          setLiveInvoices([]);
        }

        if (routerRows.length) {
          const healthyRouters = routerRows.filter((router) => router.provisioning_status === "active" || router.provisioning_status === "successful").length;
          setLiveRouters(
            routerRows.map((router) => ({
              id: router.id.slice(0, 8).toUpperCase(),
              name: router.name,
              site: router.site_name || "Unassigned site",
              status:
                router.provisioning_status === "failed"
                  ? "offline"
                  : router.provisioning_status === "pending"
                    ? "warning"
                    : "healthy",
              clients: 0,
              revenueToday: "KES 0",
              lastSync: router.last_seen_at
                ? `${Math.max(1, Math.round((Date.now() - new Date(router.last_seen_at).getTime()) / 60000))} min ago`
                : router.last_error
                  ? "Needs attention"
                  : "Awaiting first sync",
            })),
          );

          setStats({
            grossSales: totalRevenue,
            purchases: voucherRows.length,
            overdueInvoices: invoiceRows.filter((row) => row.status === "overdue").length,
            routerHealth: routerRows.length ? Math.round((healthyRouters / routerRows.length) * 100) : 100,
            paidRevenueThisMonth: monthRevenue,
            activeRouters: healthyRouters,
            totalRouters: routerRows.length,
          });
          return;
        }

        setLiveRouters([]);

        setStats({
          grossSales: totalRevenue,
          purchases: voucherRows.length,
          overdueInvoices: invoiceRows.filter((row) => row.status === "overdue").length,
          routerHealth: 100,
          paidRevenueThisMonth: monthRevenue,
          activeRouters: 0,
          totalRouters: 0,
        });
      } catch (error) {
        console.warn("Workspace failed to load live data:", error);
      }
    };

    void loadWorkspace();
  }, [activeTenant?.id, reloadKey]);

  const tenantView = activeTenant
    ? {
        name: activeTenant.name,
        plan:
          activeTenant.monthlyBaseFee || activeTenant.perPurchaseFee
            ? `KES ${activeTenant.monthlyBaseFee.toLocaleString()} base + KES ${activeTenant.perPurchaseFee.toLocaleString()} / purchase`
            : "Usage-based billing",
        monthlyVolume: `${stats?.purchases.toLocaleString() ?? "0"} purchases`,
        mrr: `KES ${stats?.paidRevenueThisMonth.toLocaleString() ?? "0"}`,
        routersOnline: `${stats?.activeRouters ?? 0} / ${stats?.totalRouters ?? 0} routers`,
      }
    : {
        name: "ISP",
        plan: "Usage-based billing",
        monthlyVolume: "0 purchases",
        mrr: "KES 0",
        routersOnline: "0 / 0 routers",
      };

  const metricCards = useMemo(() => {
    if (!stats) {
      return [
        { label: "Gross Sales", value: "KES 0", change: "Tenant-scoped voucher revenue", tone: "positive" as const },
        { label: "Purchases", value: "0", change: "Successful + pending voucher volume", tone: "positive" as const },
        { label: "Overdue Invoices", value: "0", change: "Billing lock triggers at 2 overdue invoices", tone: "neutral" as const },
        { label: "Router Health", value: "0%", change: "Derived from live router provisioning status", tone: "neutral" as const },
      ];
    }
    return [
      { label: "Gross Sales", value: `KES ${stats.grossSales.toLocaleString()}`, change: "Tenant-scoped voucher revenue", tone: "positive" as const },
      { label: "Purchases", value: stats.purchases.toLocaleString(), change: "Successful + pending voucher volume", tone: "positive" as const },
      { label: "Overdue Invoices", value: stats.overdueInvoices.toString(), change: "Billing lock triggers at 2 overdue invoices", tone: stats.overdueInvoices > 0 ? "warning" as const : "neutral" as const },
      { label: "Router Health", value: `${stats.routerHealth}%`, change: "Derived from live router provisioning status", tone: "neutral" as const },
    ];
  }, [stats]);

  const portalPath = activeTenant?.slug ? `/portal/${activeTenant.slug}` : "/portal";
  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}${portalPath}` : portalPath;

  const downloadLoginHtml = () => {
    const assetBaseUrl = `${window.location.origin}/captive`;
    const html = buildMikroTikShellHtml({
      portalUrl,
      title: `${activeTenant?.name || APP_BRAND} Captive Portal`,
      assetBaseUrl,
    });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTenant?.slug || "tenant"}-login.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addStation = async () => {
    if (!activeTenant?.id || !newStation.name.trim()) {
      return;
    }

    setSavingStation(true);
    setStationError("");

    const { data: router, error } = await supabase.from("routers").insert([
      {
        tenant_id: activeTenant.id,
        name: newStation.name.trim(),
        site_name: newStation.siteName.trim() || null,
        host: newStation.host.trim() || null,
        provisioning_status: "pending",
      },
    ]).select("id").single();

    if (error) {
      setStationError(error.message || "Unable to save station");
      setSavingStation(false);
      return;
    }

    if (newStation.host.trim() && router?.id) {
      const { error: syncError } = await supabase.functions.invoke("sync-radius-nas", {
        body: {
          tenantId: activeTenant.id,
          routerId: router.id,
        },
      });

      if (syncError) {
        console.error("sync-radius-nas failed:", syncError);
        toast({
          title: "Station saved",
          description: "The station was saved, but its RADIUS NAS mapping still needs attention until the sync function is deployed.",
        });
      }
    }

    setNewStation({ name: "", siteName: "", host: "" });
    setSavingStation(false);
    setReloadKey((value) => value + 1);
  };

  if (authLoading || platformLoading) {
    return <div className="min-h-screen bg-[#08111f]" />;
  }

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(24,119,242,0.28),_transparent_34%),radial-gradient(circle_at_85%_15%,_rgba(10,196,164,0.18),_transparent_30%),linear-gradient(180deg,_#09111f_0%,_#0b1629_48%,_#08111f_100%)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:90px_90px] opacity-10" />

        <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8">
          <div className="flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.35)] md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <Badge className="border-cyan-300/30 bg-cyan-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-100">
                  {APP_BRAND} Tenant Command Center
                </Badge>
                <div>
                  <h1 className="max-w-3xl font-mono text-3xl font-semibold tracking-tight text-white md:text-5xl">
                    {tenantView.name} command center for stations, customers, and billing.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
                    Each ISP now has its own tenant portal, station fleet, and voucher space inside {APP_BRAND}. Use
                    this workspace to manage your MikroTik rollout, open your tenant admin tools, and hand off the
                    captive-portal files.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button className="h-11 rounded-full bg-white text-slate-950 hover:bg-slate-100" onClick={() => navigate("/admin")}>
                    <Router className="mr-2 h-4 w-4" />
                    Open ISP Admin
                  </Button>
                  <Button variant="outline" className="h-11 rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate("/workspace/billing")}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Open Billing Desk
                  </Button>
                  <Button variant="outline" className="h-11 rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={downloadLoginHtml}>
                    <ReceiptText className="mr-2 h-4 w-4" />
                    Download login.html
                  </Button>
                  <Button variant="outline" className="h-11 rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => window.open(portalUrl, "_blank", "noopener,noreferrer")}>
                    <Globe className="mr-2 h-4 w-4" />
                    Open Portal
                  </Button>
                </div>
              </div>

              <div className="grid min-w-[280px] gap-3 md:grid-cols-2 lg:w-[420px]">
                <Card className="border-white/10 bg-[#0d1a30]/80 text-white">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Current Plan</p>
                        <p className="mt-2 text-lg font-semibold">{tenantView.plan}</p>
                      </div>
                      <Sparkles className="h-5 w-5 text-cyan-200" />
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{tenantView.monthlyVolume}</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-[#0d1a30]/80 text-white">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Network Reach</p>
                        <p className="mt-2 text-lg font-semibold">{tenantView.routersOnline}</p>
                      </div>
                      <Globe className="h-5 w-5 text-emerald-200" />
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{tenantView.mrr} billed this cycle</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {metricCards.map((metric) => (
                <Card key={metric.label} className="border-white/10 bg-white/5 text-white">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{metric.value}</p>
                      </div>
                      <Badge className={`border ${toneClasses[metric.tone]} rounded-full px-2.5 py-1 text-[10px] font-medium`}>
                        Live
                      </Badge>
                    </div>
                    <p className="mt-4 text-sm text-slate-300">{metric.change}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="font-mono text-xl">Router Fleet</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">Register each MikroTik station under your ISP and monitor the fleet from one tenant.</p>
                </div>
                <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate("/admin")}>
                  <Network className="mr-2 h-4 w-4" />
                  Voucher Tools
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#0d1729] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Add station</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Input
                      placeholder="Station name"
                      value={newStation.name}
                      onChange={(event) => setNewStation((current) => ({ ...current, name: event.target.value }))}
                      className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                    />
                    <Input
                      placeholder="Site / town"
                      value={newStation.siteName}
                      onChange={(event) => setNewStation((current) => ({ ...current, siteName: event.target.value }))}
                      className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                    />
                    <Input
                      placeholder="Router public IP / DNS (NAS-IP)"
                      value={newStation.host}
                      onChange={(event) => setNewStation((current) => ({ ...current, host: event.target.value }))}
                      className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button onClick={addStation} disabled={savingStation || !newStation.name.trim()} className="bg-white text-slate-950 hover:bg-slate-100">
                      {savingStation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Router className="mr-2 h-4 w-4" />}
                      Save Station
                    </Button>
                    {stationError && <p className="text-sm text-rose-200">{stationError}</p>}
                  </div>
                </div>

                {liveRouters.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                    <Router className="mx-auto h-8 w-8 text-slate-500" />
                    <p className="mt-4 font-medium text-white">No stations added yet.</p>
                    <p className="mt-2 text-sm text-slate-400">
                      Add your first MikroTik above, then upload the tenant `login.html` shell so customers land on your hosted portal through the local router entry point.
                    </p>
                  </div>
                ) : liveRouters.map((router) => (
                  <div
                    key={router.id}
                    className="rounded-2xl border border-white/10 bg-[#0d1729] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${routerTone[router.status]}`} />
                          <p className="font-mono text-base text-white">{router.name}</p>
                          <Badge className="border-white/10 bg-white/5 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                            {router.id}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-400">{router.site}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm md:min-w-[320px]">
                        <div className="rounded-xl bg-white/5 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Clients</p>
                          <p className="mt-2 font-semibold text-white">{router.clients}</p>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Today</p>
                          <p className="mt-2 font-semibold text-white">{router.revenueToday}</p>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Last Sync</p>
                          <p className="mt-2 font-semibold text-white">{router.lastSync}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-white/10 bg-white/[0.04] text-white">
                <CardHeader>
                  <CardTitle className="font-mono text-xl">Billing Lock Logic</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                    <div className="flex items-center gap-2 text-amber-100">
                      <ShieldAlert className="h-4 w-4" />
                      <p className="font-medium">Auto-suspension policy</p>
                    </div>
                    <p className="mt-2 text-sm text-amber-50/80">
                      One overdue invoice triggers warnings. Two overdue invoices place the tenant in hard-lock mode
                      until payment is captured.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                        <span>Invoice compliance</span>
                        <span>84%</span>
                      </div>
                      <Progress value={84} className="h-2 bg-white/10" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-[#0d1729] p-4">
                        <BellRing className="h-4 w-4 text-cyan-200" />
                        <p className="mt-3 text-sm text-slate-300">Grace reminders</p>
                        <p className="mt-1 text-xl font-semibold text-white">D-5, D-2, D+1</p>
                      </div>
                      <div className="rounded-2xl bg-[#0d1729] p-4">
                        <CreditCard className="h-4 w-4 text-emerald-200" />
                        <p className="mt-3 text-sm text-slate-300">Next draft formula</p>
                        <p className="mt-1 text-xl font-semibold text-white">Base + usage</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.04] text-white">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="font-mono text-xl">Invoices</CardTitle>
                    <p className="mt-1 text-sm text-slate-400">Tenant-visible billing history and payment state.</p>
                  </div>
                  <FileSpreadsheet className="h-5 w-5 text-slate-400" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {liveInvoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-2xl border border-white/10 bg-[#0d1729] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-sm text-white">{invoice.id}</p>
                          <p className="mt-1 text-sm text-slate-400">{invoice.period}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{invoice.usage}</p>
                        </div>
                        <Badge className={`border ${invoiceTone[invoice.status]}`}>
                          {invoice.status}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div>
                          <p className="text-xl font-semibold text-white">{invoice.amount}</p>
                          <p className="text-sm text-slate-400">Due {invoice.dueDate}</p>
                        </div>
                        <Button
                          variant="ghost"
                          className="text-white hover:bg-white/10"
                          onClick={() => navigate(`/workspace/billing?invoice=${encodeURIComponent(invoice.id)}`)}
                        >
                          Open
                          <ArrowUpRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-6">
                <Users className="h-5 w-5 text-cyan-200" />
                <h3 className="mt-4 font-mono text-lg">Multi-ISP Foundation</h3>
                <p className="mt-2 text-sm text-slate-400">
                  We are introducing tenancy, invoice state, and router ownership without touching the current portal
                  routes your existing ISP depends on.
                </p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-6">
                <Wifi className="h-5 w-5 text-emerald-200" />
                <h3 className="mt-4 font-mono text-lg">Router Ops</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Remote provisioning is being shaped as a job system so changes are auditable, retryable, and safe for
                  large router fleets.
                </p>
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-6">
                <Zap className="h-5 w-5 text-amber-200" />
                <h3 className="mt-4 font-mono text-lg">Billing Enforcement</h3>
                <p className="mt-2 text-sm text-slate-400">
                  Billing suspension is route-enforced now, so suspended tenants land in the billing desk until
                  overdue invoices are resolved.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantWorkspace;
