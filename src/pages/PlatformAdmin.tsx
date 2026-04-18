import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { APP_BRAND, APP_PLATFORM_NAME } from "@/lib/brand";
import { usePlatform } from "@/lib/platform";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CircleAlert,
  Cpu,
  CreditCard,
  Fingerprint,
  Globe2,
  LayoutDashboard,
  Lock,
  LucideIcon,
  PanelsTopLeft,
  Radar,
  Rocket,
  Rows3,
  ScrollText,
  ServerCog,
  Shield,
  Sparkles,
  Loader2,
  Wallet,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

const statusTone = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  watch: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  suspended: "border-rose-400/30 bg-rose-400/10 text-rose-100",
};

const healthTone = {
  healthy: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  review: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  urgent: "border-rose-400/25 bg-rose-400/10 text-rose-100",
} as const;

interface PlatformTenantRow {
  name: string;
  slug: string;
  plan: string;
  billingStatus: "active" | "watch" | "suspended";
  monthlyVolume: string;
  mrr: string;
  routersOnline: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  setupStatus?: "needs_setup" | "ready";
}

const PlatformAdmin = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { loading: platformLoading } = usePlatform();
  const [tenantRows, setTenantRows] = useState<PlatformTenantRow[]>([]);
  const [metricRows, setMetricRows] = useState([
    { label: "Live ISPs", value: "0", change: "Tenant records in the platform", tone: "positive" as const },
    { label: "Platform Billings", value: "KES 0", change: "Paid invoice volume to date", tone: "positive" as const },
    { label: "Suspended Accounts", value: "0", change: "Two-invoice auto-lock candidates", tone: "neutral" as const },
    { label: "Provisioning Jobs", value: "0", change: "Router setup activity", tone: "neutral" as const },
  ]);
  const [jobRows, setJobRows] = useState<Array<{ id: string; status: string }>>([]);
  const [savingTenant, setSavingTenant] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [newTenant, setNewTenant] = useState({
    name: "",
    slug: "",
    monthlyBaseFee: "0",
    perPurchaseFee: "0",
  });

  const tenantStatusSummary = useMemo(() => {
    const active = tenantRows.filter((tenant) => tenant.billingStatus === "active").length;
    const watch = tenantRows.filter((tenant) => tenant.billingStatus === "watch").length;
    const suspended = tenantRows.filter((tenant) => tenant.billingStatus === "suspended").length;

    return { active, watch, suspended };
  }, [tenantRows]);

  const recentJobs = jobRows.length ? jobRows.slice(0, 5) : [{ id: "demo-job", status: "pending" }];
  const successfulJobs = jobRows.filter((job) => job.status === "successful").length;
  const failedJobs = jobRows.filter((job) => job.status === "failed").length;
  const pendingJobs = jobRows.filter((job) => job.status === "pending").length;

  const platformSignals: Array<{
    title: string;
    description: string;
    icon: LucideIcon;
    tone: keyof typeof healthTone;
  }> = [
    {
      title: "Tenant isolation",
      description: "Super admin remains a separate control room while ISP operations stay tenant-scoped.",
      icon: Fingerprint,
      tone: "healthy",
    },
    {
      title: "Billing enforcement",
      description: tenantStatusSummary.suspended
        ? `${tenantStatusSummary.suspended} suspended tenant${tenantStatusSummary.suspended > 1 ? "s require" : " requires"} billing action before admin access can resume.`
        : "No tenants are blocked by billing enforcement right now.",
      icon: Wallet,
      tone: tenantStatusSummary.suspended ? "urgent" : "healthy",
    },
    {
      title: "Provisioning pipeline",
      description: jobRows.length
        ? `${successfulJobs} successful, ${pendingJobs} pending, ${failedJobs} failed router jobs are visible from one queue.`
        : "Router provisioning will appear here once jobs start flowing from tenant onboarding.",
      icon: Cpu,
      tone: failedJobs > 0 ? "review" : "healthy",
    },
  ];

  const platformLanes: Array<{
    id: string;
    title: string;
    copy: string;
    icon: LucideIcon;
    actions: Array<{ label: string; onClick: () => void; variant?: "default" | "ghost" | "outline" }>;
  }> = [
    {
      id: "fleet-lane",
      title: "ISP fleet control",
      copy: "Inspect tenant health, jump into ISP admin setup, or review billing without exposing superadmin controls inside the ISP dashboard.",
      icon: Building2,
      actions: [
        {
          label: "Review tenant grid",
          onClick: () => document.getElementById("tenant-grid")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        },
        {
          label: "Open onboarding",
          onClick: () => document.getElementById("tenant-onboarding")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          variant: "outline",
        },
      ],
    },
    {
      id: "billing-lane",
      title: "Billing command",
      copy: "Track account pressure early so invoice recovery is handled from the platform layer before a tenant gets locked out.",
      icon: CreditCard,
      actions: [
        {
          label: "Open billing desk",
          onClick: () => navigate("/billing"),
        },
        {
          label: "View guardrails",
          onClick: () => document.getElementById("system-gates")?.scrollIntoView({ behavior: "smooth", block: "start" }),
          variant: "outline",
        },
      ],
    },
    {
      id: "automation-lane",
      title: "Automation spine",
      copy: "Keep router provisioning, auditability, and security gates coordinated from one place instead of scattering them across tenant screens.",
      icon: ServerCog,
      actions: [
        {
          label: "Inspect jobs",
          onClick: () => document.getElementById("provision-jobs")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        },
      ],
    },
  ];

  const loadPlatformAdmin = async () => {
    try {
      const [tenantRes, routerJobRes, invoiceRes, routerRes, routerSettingsRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, name, slug, billing_status, monthly_base_fee, per_purchase_fee, support_email, support_phone")
          .order("created_at", { ascending: false }),
        supabase
          .from("router_provisioning_jobs")
          .select("id, status")
          .order("created_at", { ascending: false })
          .limit(250),
        supabase
          .from("billing_invoices")
          .select("id, total, status"),
        supabase
          .from("routers")
          .select("tenant_id"),
        supabase
          .from("router_settings")
          .select("tenant_id"),
      ]);

      const tenantData = (tenantRes.data ?? []) as Array<{
        id: string;
        name: string;
        slug: string;
        billing_status: "active" | "watch" | "suspended";
        monthly_base_fee?: number | null;
        per_purchase_fee?: number | null;
        support_email?: string | null;
        support_phone?: string | null;
      }>;

      const jobData = (routerJobRes.data ?? []) as Array<{ id: string; status: string }>;
      const invoiceData = (invoiceRes.data ?? []) as Array<{ id: string; total: number; status: string }>;
      const routerData = (routerRes.data ?? []) as Array<{ tenant_id: string }>;
      const routerSettingsData = (routerSettingsRes.data ?? []) as Array<{ tenant_id: string | null }>;
      const routerCounts = new Map<string, number>();

      routerData.forEach((router) => {
        routerCounts.set(router.tenant_id, (routerCounts.get(router.tenant_id) ?? 0) + 1);
      });
      routerSettingsData.forEach((settings) => {
        if (!settings.tenant_id) return;
        routerCounts.set(settings.tenant_id, Math.max(1, routerCounts.get(settings.tenant_id) ?? 0));
      });

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
            routersOnline: `${routerCounts.get(tenant.id) ?? 0} router${(routerCounts.get(tenant.id) ?? 0) === 1 ? "" : "s"} connected`,
            supportEmail: tenant.support_email ?? null,
            supportPhone: tenant.support_phone ?? null,
            setupStatus: (routerCounts.get(tenant.id) ?? 0) > 0 ? "ready" : "needs_setup",
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
          { label: "Live ISPs", value: `${tenantData.length}`, change: "Tenant records in the platform", tone: "positive" },
          { label: "Platform Billings", value: `KES ${paidRevenue.toLocaleString()}`, change: "Paid invoice volume to date", tone: "positive" },
          { label: "Suspended Accounts", value: `${suspended}`, change: "Two-invoice auto-lock candidates", tone: suspended > 0 ? "warning" : "neutral" },
          { label: "Provisioning Jobs", value: `${jobData.length}`, change: `${successfulJobs} marked successful`, tone: "neutral" },
        ]);
      }
    } catch (error) {
      console.warn("Platform admin failed to load live data:", error);
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
    <div className="min-h-screen bg-[#120d0a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_26%),radial-gradient(circle_at_80%_10%,_rgba(34,197,94,0.14),_transparent_24%),linear-gradient(180deg,_#120d0a_0%,_#1f1410_44%,_#0b1118_100%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(39,24,18,0.96),rgba(16,23,31,0.94))] shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="grid gap-8 px-6 py-7 md:px-8 md:py-8 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <Badge className="border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-amber-100">
                Techflix Control Room
              </Badge>
              <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Superadmin operations for onboarding, billing, and MikroTik rollout.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                A sharper platform view for Techflix Softwares. Review tenants, contact new signups, push onboarding
                forward, and hand each ISP into its own admin dashboard without mixing privileges.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {platformLanes.map((lane) => {
                  const Icon = lane.icon;
                  return (
                    <div key={lane.id} className="rounded-[1.6rem] border border-white/10 bg-black/15 p-5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h2 className="mt-4 text-lg font-semibold text-white">{lane.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{lane.copy}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {lane.actions.map((action) => (
                          <Button
                            key={action.label}
                            variant={action.variant ?? "default"}
                            className={action.variant === "outline"
                              ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                              : action.variant === "ghost"
                                ? "text-white hover:bg-white/10"
                                : "bg-amber-300 text-slate-950 hover:bg-amber-200"}
                            onClick={action.onClick}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Command overview</p>
                  <p className="mt-2 text-2xl font-semibold text-white">Daily operating picture</p>
                </div>
                <BriefcaseBusiness className="h-6 w-6 text-amber-200" />
              </div>
              {platformSignals.map((signal) => {
                const Icon = signal.icon;
                return (
                  <div key={signal.title} className={`rounded-2xl border p-4 ${healthTone[signal.tone]}`}>
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium text-white">{signal.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-200">{signal.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="rounded-2xl border border-white/10 bg-[#17110d] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">Tenant status mix</p>
                  <Rows3 className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-emerald-400/10 p-3">
                    <p className="text-2xl font-semibold text-emerald-100">{tenantStatusSummary.active}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">Healthy</p>
                  </div>
                  <div className="rounded-2xl bg-amber-300/10 p-3">
                    <p className="text-2xl font-semibold text-amber-100">{tenantStatusSummary.watch}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-amber-200/80">Watch</p>
                  </div>
                  <div className="rounded-2xl bg-rose-400/10 p-3">
                    <p className="text-2xl font-semibold text-rose-100">{tenantStatusSummary.suspended}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-rose-200/80">Suspended</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricRows.map((metric) => (
            <Card key={metric.label} className="overflow-hidden border-white/10 bg-[rgba(18,12,10,0.86)] text-white">
              <CardContent className="p-0">
                <div className="h-1 w-full bg-gradient-to-r from-amber-300 via-orange-300 to-emerald-300" />
                <div className="p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{metric.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
                  <p className="mt-4 text-sm leading-6 text-slate-300">{metric.change}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card id="tenant-grid" className="border-white/10 bg-[rgba(15,12,11,0.7)] text-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Tenant Grid</CardTitle>
                <p className="mt-1 text-sm text-slate-400">Tenant operations stay here so the superadmin surface remains separate from ISP admin navigation.</p>
              </div>
              <PanelsTopLeft className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent className="space-y-4">
              {tenantRows.map((tenant) => (
                <div key={tenant.slug} className="rounded-[1.5rem] border border-white/10 bg-[#0d1729] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.16)]">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-semibold text-white">{tenant.name}</p>
                        <Badge className={`border ${statusTone[tenant.billingStatus]}`}>{tenant.billingStatus}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">/{tenant.slug}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" className="justify-start text-white hover:bg-white/10 md:justify-center" onClick={() => navigate(`/admin?tenant=${encodeURIComponent(tenant.slug)}`)}>
                        Open ISP Admin
                        <LayoutDashboard className="ml-2 h-4 w-4" />
                      </Button>
                      <Button variant="ghost" className="justify-start text-white hover:bg-white/10 md:justify-center" onClick={() => navigate(`/admin?tenant=${encodeURIComponent(tenant.slug)}&section=setup`)}>
                        Open ISP Setup
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
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Contact</p>
                      <p className="mt-2 text-sm text-white">{tenant.supportEmail || "Awaiting signup email sync"}</p>
                      <p className="mt-1 text-xs text-slate-400">{tenant.supportPhone || "No onboarding phone captured yet"}</p>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Setup</p>
                      <p className="mt-2 text-sm text-white">{tenant.setupStatus === "needs_setup" ? "Needs MikroTik onboarding" : "Router setup started"}</p>
                      <p className="mt-1 text-xs text-slate-400">{tenant.routersOnline}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tenant.supportEmail && (
                      <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                        <a href={`mailto:${tenant.supportEmail}?subject=${encodeURIComponent(`BROADCOM onboarding for ${tenant.name}`)}`}>
                          Reach out by email
                        </a>
                      </Button>
                    )}
                    {tenant.supportPhone && (
                      <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                        <a href={`tel:${tenant.supportPhone}`}>Call onboarding contact</a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-white/10 bg-[rgba(15,12,11,0.7)] text-white">
              <CardHeader id="provision-jobs">
                <CardTitle className="text-xl">Automation Spine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
                  <div className="flex items-center gap-2 text-cyan-100">
                    <Sparkles className="h-4 w-4" />
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
                        ? `${successfulJobs} successful, ${pendingJobs} pending, ${failedJobs} failed.`
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
                    <p className="mt-3 font-medium text-white">Security rail</p>
                    <p className="mt-1 text-sm text-slate-400">Platform control stays isolated here, while tenant admin remains scoped to each ISP workspace.</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recent jobs</p>
                  <div className="mt-3 space-y-2">
                    {recentJobs.map((job) => (
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

            <Card className="border-white/10 bg-[rgba(15,12,11,0.7)] text-white">
              <CardHeader id="system-gates">
                <CardTitle className="text-xl">System Gates</CardTitle>
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
                <div className="flex items-start gap-3 rounded-2xl bg-[#0d1729] p-4">
                  <CircleAlert className="mt-0.5 h-4 w-4 text-amber-200" />
                  <div>
                    <p className="font-medium text-white">Route discipline</p>
                    <p className="mt-1 text-sm text-slate-400">The ISP admin screen should not surface a path back into superadmin, which reduces accidental privilege crossover.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card id="tenant-onboarding" className="border-white/10 bg-[rgba(15,12,11,0.7)] text-white">
            <CardHeader>
              <CardTitle className="text-xl">Tenant Onboarding</CardTitle>
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

          <Card className="border-white/10 bg-[rgba(15,12,11,0.7)] text-white">
            <CardHeader>
              <CardTitle className="text-xl">Operator Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl bg-[#0d1729] p-4">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-200" />
                  <p className="font-medium text-white">Suggested rollout</p>
                </div>
                <p className="mt-2">
                  Create the tenant shell here, invite the owner account, seed packages, then let the tenant add its
                  first router from the ISP admin dashboard so jobs and invoices become tenant-scoped immediately.
                </p>
              </div>
              <div className="rounded-2xl bg-[#0d1729] p-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-cyan-200" />
                  <p className="font-medium text-white">Billing enforcement</p>
                </div>
                <p className="mt-2">
                  Suspended tenants now land in the billing desk instead of reaching the ISP admin dashboard, which keeps
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
