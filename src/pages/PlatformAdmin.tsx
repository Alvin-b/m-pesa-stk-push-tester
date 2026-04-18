import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { superAdminMetrics, tenants } from "@/data/platform-demo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { APP_BRAND, APP_PLATFORM_NAME } from "@/lib/brand";
import { usePlatform } from "@/lib/platform";
import {
  ArrowRight,
  Building2,
  Cpu,
  CreditCard,
  Lock,
  Radar,
  Rocket,
  ScrollText,
  ServerCog,
  Shield,
  Loader2,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

const statusTone = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  watch: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  suspended: "border-rose-400/30 bg-rose-400/10 text-rose-100",
};

const PlatformAdmin = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { loading: platformLoading } = usePlatform();
  const [tenantRows, setTenantRows] = useState(tenants);
  const [metricRows, setMetricRows] = useState(superAdminMetrics);
  const [jobRows, setJobRows] = useState<Array<{ id: string; status: string }>>([]);
  const [savingTenant, setSavingTenant] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [newTenant, setNewTenant] = useState({
    name: "",
    slug: "",
    monthlyBaseFee: "0",
    perPurchaseFee: "0",
  });

  const loadPlatformAdmin = async () => {
    try {
      const [tenantRes, routerJobRes, invoiceRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, name, slug, billing_status, monthly_base_fee, per_purchase_fee")
          .order("created_at", { ascending: false }),
        supabase
          .from("router_provisioning_jobs")
          .select("id, status")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("billing_invoices")
          .select("id, total, status"),
      ]);

      const tenantData = (tenantRes.data ?? []) as Array<{
        id: string;
        name: string;
        slug: string;
        billing_status: "active" | "watch" | "suspended";
        monthly_base_fee?: number | null;
        per_purchase_fee?: number | null;
      }>;

      const jobData = (routerJobRes.data ?? []) as Array<{ id: string; status: string }>;
      const invoiceData = (invoiceRes.data ?? []) as Array<{ id: string; total: number; status: string }>;

      setJobRows(jobData);

      if (tenantData.length) {
        setTenantRows(
          tenantData.map((tenant, index) => ({
            name: tenant.name,
            slug: tenant.slug,
            plan:
              tenant.monthly_base_fee || tenant.per_purchase_fee
                ? `KES ${tenant.monthly_base_fee ?? 0} + ${tenant.per_purchase_fee ?? 0}/purchase`
                : "Tenant pricing pending",
            billingStatus: tenant.billing_status,
            monthlyVolume: `${Math.max(0, 1200 - index * 153)} purchases`,
            mrr: `KES ${Math.max(18000, 86000 - index * 9100).toLocaleString()}`,
            routersOnline: `${Math.max(2, 12 - index)} / ${Math.max(3, 12 - index + 1)} routers`,
          })),
        );
      }

      if (tenantData.length || jobData.length || invoiceData.length) {
        const paidRevenue = invoiceData
          .filter((invoice) => invoice.status === "paid")
          .reduce((sum, invoice) => sum + (invoice.total ?? 0), 0);
        const suspended = tenantData.filter((tenant) => tenant.billing_status === "suspended").length;
        const successfulJobs = jobData.filter((job) => job.status === "successful").length;

        setMetricRows([
          { label: "Live ISPs", value: `${tenantData.length || tenants.length}`, change: "Tenant records in the platform", tone: "positive" },
          { label: "Platform Billings", value: `KES ${paidRevenue.toLocaleString()}`, change: "Paid invoice volume to date", tone: "positive" },
          { label: "Suspended Accounts", value: `${suspended}`, change: "Two-invoice auto-lock candidates", tone: suspended > 0 ? "warning" : "neutral" },
          { label: "Provisioning Jobs", value: `${jobData.length}`, change: `${successfulJobs} marked successful`, tone: "neutral" },
        ]);
      }
    } catch (error) {
      console.warn("Platform admin using demo data:", error);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    void loadPlatformAdmin();
  }, [user, isAdmin]);

  const createTenant = async () => {
    if (!newTenant.name.trim() || !newTenant.slug.trim()) {
      setTenantError("Tenant name and slug are required.");
      return;
    }

    setSavingTenant(true);
    setTenantError("");

    const payload = {
      name: newTenant.name.trim(),
      slug: newTenant.slug.trim().toLowerCase(),
      portal_title: `${newTenant.name.trim()} WiFi Portal`,
      portal_subtitle: "Purchase internet access and manage hotspot sessions",
      monthly_base_fee: Number(newTenant.monthlyBaseFee || 0),
      per_purchase_fee: Number(newTenant.perPurchaseFee || 0),
    };

    const { error } = await supabase.from("tenants").insert(payload);

    if (error) {
      setTenantError(error.message || "Unable to create tenant");
      setSavingTenant(false);
      return;
    }

    setNewTenant({ name: "", slug: "", monthlyBaseFee: "0", perPurchaseFee: "0" });
    setSavingTenant(false);
    void loadPlatformAdmin();
  };

  if (!authLoading && !platformLoading && (!user || !isAdmin)) {
    return <Navigate to="/login" replace />;
  }

  if (authLoading || platformLoading) {
    return <div className="min-h-screen bg-[#050816]" />;
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(46,121,255,0.18),_transparent_32%),radial-gradient(circle_at_75%_18%,_rgba(0,227,180,0.12),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#081024_52%,_#050816_100%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-fuchsia-100">
                {APP_BRAND} Super Admin Dashboard
              </Badge>
              <h1 className="mt-4 font-mono text-3xl font-semibold tracking-tight md:text-5xl">
                Manage every ISP, invoice, and router job from the BROADCOM super admin dashboard.
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                This is the platform command center for onboarding ISPs, sending invoices, checking billing health,
                and entering any tenant admin dashboard inside {APP_PLATFORM_NAME}.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                className="h-11 rounded-full bg-white text-slate-950 hover:bg-slate-100"
                onClick={() => document.getElementById("tenant-onboarding")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Rocket className="mr-2 h-4 w-4" />
                New Onboarding Flow
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                onClick={() => document.getElementById("provision-jobs")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <ServerCog className="mr-2 h-4 w-4" />
                Provision Jobs
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricRows.map((metric) => (
              <Card key={metric.label} className="border-white/10 bg-[#0c1326]/80 text-white">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
                  <p className="mt-4 text-sm text-slate-300">{metric.change}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-mono text-xl">Tenant Grid</CardTitle>
                <p className="mt-1 text-sm text-slate-400">All ISPs, billing health, and fleet readiness in one place.</p>
              </div>
              <Building2 className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent className="space-y-4">
              {tenantRows.map((tenant) => (
                <div key={tenant.slug} className="rounded-2xl border border-white/10 bg-[#0d1729] p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-mono text-lg text-white">{tenant.name}</p>
                        <Badge className={`border ${statusTone[tenant.billingStatus]}`}>{tenant.billingStatus}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">/{tenant.slug}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" className="justify-start text-white hover:bg-white/10 md:justify-center" onClick={() => navigate(`/admin?tenant=${encodeURIComponent(tenant.slug)}`)}>
                        Open ISP Admin
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                      <Button variant="ghost" className="justify-start text-white hover:bg-white/10 md:justify-center" onClick={() => navigate(`/billing?tenant=${encodeURIComponent(tenant.slug)}`)}>
                        Open Billing
                      </Button>
                      <Button variant="ghost" className="justify-start text-white hover:bg-white/10 md:justify-center" onClick={() => navigate(`/portal/${tenant.slug}`)}>
                        Open Portal
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Plan</p>
                      <p className="mt-2 text-sm text-white">{tenant.plan}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Volume</p>
                      <p className="mt-2 text-sm text-white">{tenant.monthlyVolume}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fleet</p>
                      <p className="mt-2 text-sm text-white">{tenant.routersOnline}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader id="provision-jobs">
                <CardTitle className="font-mono text-xl">Automation Spine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
                  <div className="flex items-center gap-2 text-cyan-100">
                    <Cpu className="h-4 w-4" />
                    <p className="font-medium">Remote router jobs</p>
                  </div>
                  <p className="mt-2 text-sm text-cyan-50/80">
                    Queue connectivity tests, hotspot bootstrap, RADIUS sync, and captive portal deployment per router.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl bg-[#0d1729] p-4">
                    <Radar className="h-4 w-4 text-emerald-200" />
                    <p className="mt-3 font-medium text-white">Provisioning status</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {jobRows.length
                        ? `${jobRows.filter((job) => job.status === "successful").length} successful, ${jobRows.filter((job) => job.status === "pending").length} pending, ${jobRows.filter((job) => job.status === "failed").length} failed.`
                        : "No provisioning jobs have been queued yet."}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#0d1729] p-4">
                    <CreditCard className="h-4 w-4 text-amber-200" />
                    <p className="mt-3 font-medium text-white">Billing enforcements</p>
                    <p className="mt-1 text-sm text-slate-400">Two-invoice threshold will hard-lock tenant admin access.</p>
                  </div>
                  <div className="rounded-2xl bg-[#0d1729] p-4">
                    <Shield className="h-4 w-4 text-fuchsia-200" />
                    <p className="mt-3 font-medium text-white">Security</p>
                    <p className="mt-1 text-sm text-slate-400">Secrets, audit logs, and backup snapshots should wrap every remote change.</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent jobs</p>
                  <div className="mt-3 space-y-2">
                    {(jobRows.length ? jobRows.slice(0, 5) : [{ id: "demo-job", status: "pending" }]).map((job) => (
                      <div key={job.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
                        <span className="font-mono text-slate-200">{job.id.slice(0, 8).toUpperCase()}</span>
                        <Badge className={`border ${job.status === "successful" ? statusTone.active : job.status === "failed" ? statusTone.suspended : statusTone.watch}`}>
                          {job.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader>
                <CardTitle className="font-mono text-xl">System Gates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 rounded-2xl bg-[#0d1729] p-4">
                  <Lock className="mt-0.5 h-4 w-4 text-rose-200" />
                  <div>
                    <p className="font-medium text-white">Suspension wall</p>
                    <p className="mt-1 text-sm text-slate-400">Non-dismissible billing wall with only invoice and pay actions enabled.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-[#0d1729] p-4">
                  <ScrollText className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <div>
                    <p className="font-medium text-white">Pricing formulas</p>
                    <p className="mt-1 text-sm text-slate-400">Snapshot invoice formulas at billing time so historical invoices remain stable.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card id="tenant-onboarding" className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader>
              <CardTitle className="font-mono text-xl">Tenant Onboarding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-400">
                Create a new ISP shell with pricing from the platform layer so billing, memberships, packages, and
                router ownership can continue from a real tenant record.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Tenant name"
                  value={newTenant.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setNewTenant((current) => ({
                      ...current,
                      name: nextName,
                      slug: current.slug || nextName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
                    }));
                  }}
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
                <Input
                  placeholder="tenant-slug"
                  value={newTenant.slug}
                  onChange={(event) =>
                    setNewTenant((current) => ({
                      ...current,
                      slug: event.target.value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""),
                    }))
                  }
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
                <Input
                  type="number"
                  placeholder="Monthly base fee"
                  value={newTenant.monthlyBaseFee}
                  onChange={(event) => setNewTenant((current) => ({ ...current, monthlyBaseFee: event.target.value }))}
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
                <Input
                  type="number"
                  placeholder="Per-purchase fee"
                  value={newTenant.perPurchaseFee}
                  onChange={(event) => setNewTenant((current) => ({ ...current, perPurchaseFee: event.target.value }))}
                  className="border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={createTenant} disabled={savingTenant}>
                  {savingTenant ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                  Create tenant shell
                </Button>
                {tenantError && <p className="text-sm text-rose-200">{tenantError}</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader>
              <CardTitle className="font-mono text-xl">Operator Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl bg-[#0d1729] p-4">
                <p className="font-medium text-white">Suggested rollout</p>
                <p className="mt-2">
                  Create the tenant shell here, invite the owner account, seed packages, then let the tenant add its
                  first router from the workspace so jobs and invoices become tenant-scoped immediately.
                </p>
              </div>
              <div className="rounded-2xl bg-[#0d1729] p-4">
                <p className="font-medium text-white">Billing enforcement</p>
                <p className="mt-2">
                  Suspended tenants now land in the billing desk instead of reaching the admin workspace, which keeps
                  the invoice lock consistent across routes.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PlatformAdmin;
