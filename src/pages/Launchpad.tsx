import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { APP_BRAND, APP_PLATFORM_NAME, APP_TAGLINE } from "@/lib/brand";
import { usePlatform } from "@/lib/platform";
import {
  ArrowRight,
  CreditCard,
  Globe,
  LayoutDashboard,
  LogIn,
  Rocket,
  Shield,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

interface RouteCard {
  title: string;
  path: string;
  description: string;
  visibility: "Public" | "Protected";
  cta: string;
  icon: LucideIcon;
}

const visibilityTone: Record<RouteCard["visibility"], string> = {
  Public: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  Protected: "border-amber-300/30 bg-amber-300/10 text-amber-100",
};

const Launchpad = () => {
  const { user } = useAuth();
  const { activeTenant } = usePlatform();

  const tenantPortalPath = activeTenant?.slug ? `/portal/${activeTenant.slug}` : "/portal";

  const routeCards: RouteCard[] = [
    {
      title: "Customer Portal",
      path: tenantPortalPath,
      description: "Open the public captive portal where customers buy packages and redeem access codes.",
      visibility: "Public",
      cta: activeTenant?.slug ? "Open active tenant portal" : "Open default portal",
      icon: Globe,
    },
    {
      title: "Create ISP Account",
      path: "/signup",
      description: "Create a new ISP owner account and provision a tenant slug during signup.",
      visibility: "Public",
      cta: "Start ISP onboarding",
      icon: Rocket,
    },
    {
      title: "ISP Dashboard",
      path: "/dashboard",
      description: "Open the SaaS workspace for router fleet, billing, and tenant operations.",
      visibility: "Protected",
      cta: user ? "Open dashboard" : "Sign in for dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "ISP Admin",
      path: "/admin",
      description: "Manage packages, vouchers, sessions, router setup, and tenant payment gateways.",
      visibility: "Protected",
      cta: user ? "Open ISP admin" : "Sign in for admin",
      icon: Wifi,
    },
    {
      title: "Billing Desk",
      path: "/billing",
      description: "Review invoices, overdue balances, and tenant recovery actions from one place.",
      visibility: "Protected",
      cta: user ? "Open billing desk" : "Sign in for billing",
      icon: CreditCard,
    },
    {
      title: "Control Room",
      path: "/control-room",
      description: "Platform-level BROADCOM operations view for tenant onboarding and multi-ISP oversight.",
      visibility: "Protected",
      cta: user ? "Open control room" : "Sign in for control room",
      icon: Shield,
    },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(35,111,255,0.26),_transparent_32%),radial-gradient(circle_at_80%_18%,_rgba(0,196,167,0.18),_transparent_30%),linear-gradient(180deg,_#07111f_0%,_#0a1629_48%,_#07111f_100%)]" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:88px_88px] opacity-10" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_35px_120px_rgba(0,0,0,0.35)] md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <Badge className="border-cyan-300/30 bg-cyan-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-100">
                {APP_BRAND} Route Launchpad
              </Badge>
              <div>
                <h1 className="font-mono text-3xl font-semibold tracking-tight text-white md:text-5xl">
                  See every major route, onboard an ISP, and jump straight into the SaaS dashboard.
                </h1>
                <p className="mt-4 max-w-2xl text-sm text-slate-300 md:text-base">
                  {APP_PLATFORM_NAME} now has separate surfaces for customer access, ISP onboarding, tenant operations,
                  and platform-wide control. This launchpad makes those routes visible in Lovable instead of hiding
                  them behind exact URLs.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="h-11 rounded-full bg-white text-slate-950 hover:bg-slate-100">
                  <Link to="/signup">
                    <Rocket className="mr-2 h-4 w-4" />
                    Create ISP Account
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10">
                  <Link to={tenantPortalPath}>
                    <Globe className="mr-2 h-4 w-4" />
                    Open Customer Portal
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10">
                  <Link to={user ? "/dashboard" : "/login"}>
                    <LogIn className="mr-2 h-4 w-4" />
                    {user ? "Open My Dashboard" : "Sign In"}
                  </Link>
                </Button>
              </div>
            </div>

            <Card className="min-w-[280px] border-white/10 bg-[#0d1a30]/80 text-white lg:w-[360px]">
              <CardHeader>
                <CardTitle className="font-mono text-xl">{APP_PLATFORM_NAME}</CardTitle>
                <CardDescription className="text-slate-300">{APP_TAGLINE}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Session</p>
                  <p className="mt-2 text-sm text-white">{user?.email || "Not signed in"}</p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Active Tenant</p>
                  <p className="mt-2 text-sm text-white">{activeTenant?.name || "No tenant loaded yet"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {activeTenant?.slug ? `Portal path: /portal/${activeTenant.slug}` : "Create or sign into an ISP account to load a tenant workspace."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {routeCards.map((route) => {
              const Icon = route.icon;
              return (
                <Card key={route.path} className="border-white/10 bg-white/[0.04] text-white">
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                          <Icon className="h-5 w-5 text-cyan-100" />
                        </div>
                        <div>
                          <CardTitle className="font-mono text-lg">{route.title}</CardTitle>
                          <p className="mt-1 text-xs text-slate-400">{route.path}</p>
                        </div>
                      </div>
                      <Badge className={`border ${visibilityTone[route.visibility]}`}>{route.visibility}</Badge>
                    </div>
                    <CardDescription className="text-slate-300">{route.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <Button asChild variant="ghost" className="px-0 text-white hover:bg-transparent hover:text-cyan-100">
                      <Link to={route.path}>
                        {route.cta}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="space-y-6">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader>
                <CardTitle className="font-mono text-xl">Recommended Flow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p className="font-medium text-white">1. Create the ISP account</p>
                  <p className="mt-2">Use `/signup` to create an owner account, tenant name, and portal slug in one step.</p>
                </div>
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p className="font-medium text-white">2. Open the ISP dashboard</p>
                  <p className="mt-2">After sign-in, the app now lands the owner in `/dashboard` so the SaaS workspace is the default experience.</p>
                </div>
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p className="font-medium text-white">3. Configure packages and payments</p>
                  <p className="mt-2">Use `/admin` for plans, vouchers, router setup, and tenant payment gateway settings.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader>
                <CardTitle className="font-mono text-xl">Alias Routes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p>`/login` and `/signup` now expose onboarding directly.</p>
                </div>
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p>`/dashboard`, `/billing`, and `/control-room` mirror the deeper workspace URLs with friendlier names.</p>
                </div>
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p>The original URLs still work, so existing links and internal navigation stay intact.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Launchpad;
