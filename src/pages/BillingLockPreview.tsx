import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CreditCard, FileText, LockKeyhole } from "lucide-react";

const BillingLockPreview = () => {
  return (
    <div className="min-h-screen bg-[#09101d] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,94,94,0.16),_transparent_28%),linear-gradient(180deg,_#09101d_0%,_#0f172a_55%,_#09101d_100%)]" />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-2xl border-rose-300/20 bg-[#111a2e]/95 text-white shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <CardContent className="space-y-8 p-8 md:p-10">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-400/15">
              <LockKeyhole className="h-9 w-9 text-rose-200" />
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] text-rose-200/80">Account Suspended</p>
              <h1 className="mt-3 font-mono text-3xl font-semibold tracking-tight md:text-4xl">
                Your dashboard is locked until overdue invoices are cleared.
              </h1>
              <p className="mt-4 text-sm text-slate-300 md:text-base">
                This is the hard-stop experience for tenants with two unpaid invoices. The lock has no dismiss action,
                only billing recovery actions.
              </p>
            </div>
            <div className="rounded-3xl border border-rose-300/20 bg-rose-400/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-200" />
                <div>
                  <p className="font-medium text-rose-100">2 invoices are overdue</p>
                  <p className="mt-1 text-sm text-rose-50/80">
                    Settle the outstanding balance to restore access to routers, packages, clients, and analytics.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Outstanding Balance</p>
                <p className="mt-3 text-3xl font-semibold text-white">KES 48,920</p>
                <p className="mt-2 text-sm text-slate-400">Covering March 2026 and April 2026 usage invoices.</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">What remains open</p>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <p>Invoice history</p>
                  <p>Payment checkout</p>
                  <p>Billing contact updates</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="h-12 flex-1 rounded-full bg-white text-slate-950 hover:bg-slate-100">
                <CreditCard className="mr-2 h-4 w-4" />
                Pay Now
              </Button>
              <Button variant="outline" className="h-12 flex-1 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10">
                <FileText className="mr-2 h-4 w-4" />
                View Invoices
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BillingLockPreview;
