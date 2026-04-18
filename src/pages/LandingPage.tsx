import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APP_BRAND, APP_PLATFORM_NAME, APP_TAGLINE } from "@/lib/brand";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Globe,
  Router,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import networkBg from "@/assets/network-bg.png";

const valuePoints = [
  "Tenant signup automatically provisions an ISP account and portal slug.",
  "MikroTik captive portals can use a local router shell with your hosted portal UI.",
  "Superadmin can monitor onboarding and jump into tenant setup for router rollout.",
];

const featureCards = [
  {
    title: "Own-branded portal",
    copy: "Every ISP gets its own `/portal/your-slug` experience immediately after signup.",
    icon: Globe,
  },
  {
    title: "Payments and vouchers",
    copy: "Run M-Pesa, Paystack, voucher access, and RADIUS-backed activation from one platform.",
    icon: CreditCard,
  },
  {
    title: "MikroTik onboarding",
    copy: "Generate router setup assets and manage onboarding from the platform admin command room.",
    icon: Router,
  },
];

const steps = [
  "Create your ISP account and choose your portal slug.",
  "Your tenant admin dashboard and captive portal are provisioned automatically.",
  "Use the admin setup tools to configure MikroTik and start selling access.",
];

const LandingPage = () => (
  <div
    className="min-h-screen text-white"
    style={{ backgroundImage: `linear-gradient(rgba(5, 11, 22, 0.92), rgba(5, 11, 22, 0.96)), url(${networkBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
  >
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-300">{APP_BRAND}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">{APP_PLATFORM_NAME}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">{APP_TAGLINE}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link to="/signup">Create ISP account</Link>
          </Button>
        </div>
      </header>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden border-white/10 bg-white/[0.05] text-white shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
          <CardContent className="grid gap-8 p-6 md:p-8">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg">
                <Wifi className="h-8 w-8 text-white" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200">Launch Faster</p>
                <h2 className="mt-2 text-2xl font-semibold md:text-3xl">A public landing page, instant tenant provisioning, and a cleaner MikroTik handoff.</h2>
              </div>
            </div>

            <div className="grid gap-3">
              {valuePoints.map((point) => (
                <div key={point} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  <p className="text-sm leading-6 text-slate-200">{point}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                <Link to="/signup">
                  Start onboarding <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                <Link to="/portal">Preview portal</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#091425]/90 text-white">
          <CardContent className="space-y-5 p-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-orange-200">What happens after signup</p>
              <h2 className="mt-3 text-2xl font-semibold">Your portal is created automatically.</h2>
            </div>
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={step} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{step}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-200" />
                <p className="text-sm leading-6 text-emerald-50">
                  New tenants appear in the superadmin dashboard so the team can reach out, confirm onboarding details,
                  and guide MikroTik setup.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {featureCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Icon className="h-5 w-5 text-cyan-200" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{card.copy}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  </div>
);

export default LandingPage;
