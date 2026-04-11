import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { superAdminMetrics, tenants } from "@/data/platform-demo";
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
} from "lucide-react";

const statusTone = {
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  watch: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  suspended: "border-rose-400/30 bg-rose-400/10 text-rose-100",
};

const PlatformAdmin = () => {
  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(46,121,255,0.18),_transparent_32%),radial-gradient(circle_at_75%_18%,_rgba(0,227,180,0.12),_transparent_22%),linear-gradient(180deg,_#050816_0%,_#081024_52%,_#050816_100%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="border-fuchsia-300/30 bg-fuchsia-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-fuchsia-100">
                Private Super Admin
              </Badge>
              <h1 className="mt-4 font-mono text-3xl font-semibold tracking-tight md:text-5xl">
                Platform control room for every ISP, invoice, and router job.
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                This route is the hidden operator surface you asked for. It is separated from tenant-facing admin and
                can evolve into the full command layer for onboarding, automated provisioning, and revenue oversight.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="h-11 rounded-full bg-white text-slate-950 hover:bg-slate-100">
                <Rocket className="mr-2 h-4 w-4" />
                New Onboarding Flow
              </Button>
              <Button variant="outline" className="h-11 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10">
                <ServerCog className="mr-2 h-4 w-4" />
                Provision Jobs
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {superAdminMetrics.map((metric) => (
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
              {tenants.map((tenant) => (
                <div key={tenant.slug} className="rounded-2xl border border-white/10 bg-[#0d1729] p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-mono text-lg text-white">{tenant.name}</p>
                        <Badge className={`border ${statusTone[tenant.billingStatus]}`}>{tenant.billingStatus}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">/{tenant.slug}</p>
                    </div>
                    <Button variant="ghost" className="justify-start text-white hover:bg-white/10 md:justify-center">
                      Open tenant
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
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
              <CardHeader>
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
                    <p className="mt-1 text-sm text-slate-400">32 successful, 3 retries, 2 blocked pending credentials.</p>
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
      </div>
    </div>
  );
};

export default PlatformAdmin;
