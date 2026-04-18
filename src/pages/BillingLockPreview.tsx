import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePlatform } from "@/lib/platform";
import { AlertTriangle, CreditCard, FileText, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";

const BillingLockPreview = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, loading: platformLoading } = usePlatform();
  const [balance, setBalance] = useState("KES 48,920");
  const [overdueCount, setOverdueCount] = useState(2);
  const [latestDueDate, setLatestDueDate] = useState("Pending");
  const [latestInvoiceId, setLatestInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/admin/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!activeTenant?.id || activeTenant.id === "legacy-fallback") return;

    const loadBalance = async () => {
      try {
        const { data } = await supabase
          .from("billing_invoices")
          .select("id, invoice_number, total, status, due_date")
          .eq("tenant_id", activeTenant.id)
          .in("status", ["overdue", "due"])
          .order("due_date", { ascending: true });

        const rows = (data ?? []) as Array<{
          id: string;
          invoice_number: string;
          total: number;
          status: string;
          due_date?: string | null;
        }>;
        if (!rows.length) return;

        const overdue = rows.filter((row) => row.status === "overdue");
        const amount = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
        setOverdueCount(Math.max(1, overdue.length));
        setBalance(`KES ${amount.toLocaleString()}`);
        setLatestInvoiceId(rows[0].id);
        setLatestDueDate(
          rows[0].due_date
            ? new Date(rows[0].due_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "Pending",
        );
      } catch (error) {
        console.warn("Billing lock preview using fallback amounts:", error);
      }
    };

    void loadBalance();
  }, [activeTenant?.id]);

  if (authLoading || platformLoading) {
    return <div className="min-h-screen bg-[#09101d]" />;
  }

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
                {activeTenant?.name || "Your account"} is locked until overdue invoices are cleared.
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
                  <p className="font-medium text-rose-100">{overdueCount} invoices are overdue</p>
                  <p className="mt-1 text-sm text-rose-50/80">
                    Settle the outstanding balance to restore access to routers, packages, clients, and analytics.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Outstanding Balance</p>
                <p className="mt-3 text-3xl font-semibold text-white">{balance}</p>
                <p className="mt-2 text-sm text-slate-400">Next invoice action window closes on {latestDueDate}.</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">What remains open</p>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <p>Invoice history</p>
                  <p>Settlement summary</p>
                  <p>Billing contact handoff</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="h-12 flex-1 rounded-full bg-white text-slate-950 hover:bg-slate-100" onClick={() => navigate(latestInvoiceId ? `/workspace/billing?invoice=${encodeURIComponent(latestInvoiceId)}` : "/workspace/billing")}>
                <CreditCard className="mr-2 h-4 w-4" />
                Open Billing Desk
              </Button>
              <Button variant="outline" className="h-12 flex-1 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate("/workspace/billing")}>
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
