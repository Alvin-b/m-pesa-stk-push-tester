import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { APP_BRAND } from "@/lib/brand";
import { usePlatform } from "@/lib/platform";
import {
  ArrowLeft,
  Copy,
  CreditCard,
  FileText,
  Loader2,
  Mail,
  ReceiptText,
  ShieldAlert,
} from "lucide-react";

interface BillingInvoice {
  id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  purchase_count: number;
  formula_snapshot: Record<string, unknown> | null;
  subtotal: number;
  total: number;
  status: "draft" | "paid" | "due" | "overdue";
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

interface BillingInvoiceItem {
  id: string;
  label: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  metadata: Record<string, unknown> | null;
}

const statusTone: Record<BillingInvoice["status"], string> = {
  draft: "border-slate-400/30 bg-slate-400/10 text-slate-200",
  paid: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  due: "border-sky-400/30 bg-sky-400/10 text-sky-100",
  overdue: "border-rose-400/30 bg-rose-400/10 text-rose-100",
};

const currency = (amount: number) => `KES ${amount.toLocaleString()}`;

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Pending";

const TenantBilling = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, loading: platformLoading, isPlatformAdmin } = usePlatform();
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<Record<string, BillingInvoiceItem[]>>({});
  
  const [payPhone, setPayPhone] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [paySuccess, setPaySuccess] = useState("");
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const handlePayDebt = async (invoiceId: string) => {
    if (!payPhone) {
      setPayError("Please enter your M-Pesa phone number");
      return;
    }
    setPaying(true);
    setPayError("");
    setPaySuccess("");
    try {
      const res = await supabase.functions.invoke("platform-stk-push", {
        body: { invoiceId, phone: payPhone }
      });
      if (res.error) throw new Error(res.error.message || "Failed to initiate payment");
      setPaySuccess("STK Push sent to " + payPhone + ". Please check your phone to confirm payment.");
      // Note: we're not automatically closing so they can read the success message
    } catch (err: any) {
      setPayError(err.message || "Something went wrong.");
    } finally {
      setPaying(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!activeTenant?.id || activeTenant.id === "legacy-fallback") {
      setLoading(false);
      return;
    }

    const loadBilling = async () => {
      setLoading(true);

      const { data: invoiceData, error: invoiceError } = await supabase
        .from("billing_invoices")
        .select(
          "id, invoice_number, billing_period_start, billing_period_end, purchase_count, formula_snapshot, subtotal, total, status, due_date, paid_at, created_at",
        )
        .eq("tenant_id", activeTenant.id)
        .order("billing_period_start", { ascending: false });

      if (invoiceError) {
        console.error(invoiceError);
        setInvoices([]);
        setLoading(false);
        return;
      }

      const nextInvoices = (invoiceData ?? []) as BillingInvoice[];
      setInvoices(nextInvoices);

      if (nextInvoices.length > 0) {
        const { data: itemData, error: itemError } = await supabase
          .from("billing_invoice_items")
          .select("id, invoice_id, label, quantity, unit_amount, amount, metadata")
          .in(
            "invoice_id",
            nextInvoices.map((invoice) => invoice.id),
          );

        if (!itemError) {
          const grouped = ((itemData ?? []) as Array<BillingInvoiceItem & { invoice_id: string }>).reduce<Record<string, BillingInvoiceItem[]>>(
            (acc, item) => {
              acc[item.invoice_id] = acc[item.invoice_id] ?? [];
              acc[item.invoice_id].push({
                id: item.id,
                label: item.label,
                quantity: item.quantity,
                unit_amount: item.unit_amount,
                amount: item.amount,
                metadata: item.metadata,
              });
              return acc;
            },
            {},
          );
          setInvoiceItems(grouped);
        }
      }

      setLoading(false);
    };

    void loadBilling();
  }, [activeTenant?.id]);

  const selectedInvoiceId = searchParams.get("invoice");
  const selectedInvoice = useMemo(() => {
    if (!invoices.length) return null;
    return invoices.find((invoice) => invoice.id === selectedInvoiceId || invoice.invoice_number === selectedInvoiceId) ?? invoices[0];
  }, [invoices, selectedInvoiceId]);

  useEffect(() => {
    if (!selectedInvoice || searchParams.get("invoice") === selectedInvoice.id) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("invoice", selectedInvoice.id);
    setSearchParams(nextParams, { replace: true });
  }, [selectedInvoice, searchParams, setSearchParams]);

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, invoice) => {
        acc.total += invoice.total ?? 0;
        if (invoice.status === "paid") acc.paid += invoice.total ?? 0;
        if (invoice.status === "due") acc.due += invoice.total ?? 0;
        if (invoice.status === "overdue") {
          acc.overdue += invoice.total ?? 0;
          acc.overdueCount += 1;
        }
        return acc;
      },
      { total: 0, paid: 0, due: 0, overdue: 0, overdueCount: 0 },
    );
  }, [invoices]);

  const selectedItems = selectedInvoice ? invoiceItems[selectedInvoice.id] ?? [] : [];
  const formulaSnapshot = (selectedInvoice?.formula_snapshot ?? {}) as Record<string, unknown>;
  const settlementEmail =
    activeTenant?.portalSubtitle && activeTenant.portalSubtitle.includes("@")
      ? activeTenant.portalSubtitle
      : activeTenant?.name
        ? `billing@${activeTenant.slug}.local`
        : "billing@platform.local";

  const copySettlementSummary = async () => {
    if (!selectedInvoice) return;

    const summary = [
      `Tenant: ${activeTenant?.name ?? "Tenant"}`,
      `Invoice: ${selectedInvoice.invoice_number}`,
      `Status: ${selectedInvoice.status}`,
      `Billing period: ${formatDate(selectedInvoice.billing_period_start)} - ${formatDate(selectedInvoice.billing_period_end)}`,
      `Due date: ${formatDate(selectedInvoice.due_date)}`,
      `Amount due: ${currency(selectedInvoice.total)}`,
      `Purchases: ${selectedInvoice.purchase_count ?? 0}`,
    ].join("\n");

    setCopying(true);
    try {
      await navigator.clipboard.writeText(summary);
    } finally {
      window.setTimeout(() => setCopying(false), 1200);
    }
  };

  if (authLoading || platformLoading || loading) {
    return (
      <div className="min-h-screen bg-[#08111f] text-white">
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-200" />
        </div>
      </div>
    );
  }

  const suspended = activeTenant?.billingStatus === "suspended" && !isPlatformAdmin;

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(24,119,242,0.24),_transparent_32%),radial-gradient(circle_at_80%_15%,_rgba(10,196,164,0.14),_transparent_28%),linear-gradient(180deg,_#08111f_0%,_#0b1629_48%,_#08111f_100%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <Badge className="border-cyan-300/30 bg-cyan-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-100">
                {APP_BRAND} Billing Desk
              </Badge>
              <div>
                <h1 className="font-mono text-3xl font-semibold tracking-tight md:text-5xl">
                  {activeTenant?.name || "Tenant"} billing, invoices, and recovery.
                </h1>
                <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
                  This is the tenant-safe billing desk inside {APP_BRAND}. It stays available during suspension so
                  finance actions and invoice visibility never disappear behind the lock wall.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate(suspended ? "/billing-lock" : "/admin")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {suspended ? "Back to lock screen" : "Back to admin"}
                </Button>
                <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={copySettlementSummary} disabled={!selectedInvoice}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copying ? "Copied" : "Copy settlement summary"}
                </Button>
              </div>
            </div>

            <div className="grid min-w-[280px] gap-3 md:grid-cols-2 lg:w-[420px]">
              <Card className="border-white/10 bg-[#0d1a30]/80 text-white">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Outstanding</p>
                  <p className="mt-3 text-3xl font-semibold">{currency(totals.due + totals.overdue)}</p>
                  <p className="mt-2 text-sm text-slate-300">{totals.overdueCount} overdue invoices need attention</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-[#0d1a30]/80 text-white">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Plan Formula</p>
                  <p className="mt-3 text-lg font-semibold">
                    {currency(activeTenant?.monthlyBaseFee ?? 0)} base + {currency(activeTenant?.perPurchaseFee ?? 0)} / purchase
                  </p>
                  <p className="mt-2 text-sm text-slate-300">Historical invoices keep their own snapshots.</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {suspended && (
            <div className="mt-6 rounded-3xl border border-rose-300/20 bg-rose-400/10 p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-200" />
                <div>
                  <p className="font-medium text-rose-100">Workspace tools are locked until overdue invoices are cleared.</p>
                  <p className="mt-1 text-sm text-rose-50/80">
                    Billing recovery stays open here. Once payment is recorded, tenant access can be restored without losing invoice history.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-mono text-xl">Invoice Ledger</CardTitle>
                <p className="mt-1 text-sm text-slate-400">Every tenant invoice, with status, period, and usage snapshot.</p>
              </div>
              <ReceiptText className="h-5 w-5 text-slate-400" />
            </CardHeader>
            <CardContent className="space-y-3">
              {invoices.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-500" />
                  <p className="mt-4 font-medium text-white">No invoices yet.</p>
                  <p className="mt-2 text-sm text-slate-400">
                    Billing records will appear here once the first platform invoice is generated for this tenant.
                  </p>
                </div>
              ) : (
                invoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => {
                      const nextParams = new URLSearchParams(searchParams);
                      nextParams.set("invoice", invoice.id);
                      setSearchParams(nextParams);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.06] ${
                      selectedInvoice?.id === invoice.id ? "border-cyan-300/30 bg-[#0d1729]" : "border-white/10 bg-[#0d1729]/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-sm text-white">{invoice.invoice_number}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          {formatDate(invoice.billing_period_start)} - {formatDate(invoice.billing_period_end)}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {invoice.purchase_count ?? 0} purchases
                        </p>
                      </div>
                      <Badge className={`border ${statusTone[invoice.status]}`}>{invoice.status}</Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div>
                        <p className="text-xl font-semibold text-white">{currency(invoice.total)}</p>
                        <p className="text-sm text-slate-400">Due {formatDate(invoice.due_date)}</p>
                      </div>
                      {invoice.status !== "paid" && (
                        <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                          Recovery open
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader>
                <CardTitle className="font-mono text-xl">Selected Invoice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedInvoice ? (
                  <p className="text-sm text-slate-400">Select an invoice to review its charges and settlement details.</p>
                ) : (
                  <>
                    <div className="rounded-2xl bg-[#0d1729] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm text-white">{selectedInvoice.invoice_number}</p>
                          <p className="mt-1 text-sm text-slate-400">
                            Issued {formatDate(selectedInvoice.created_at)} • Due {formatDate(selectedInvoice.due_date)}
                          </p>
                        </div>
                        <Badge className={`border ${statusTone[selectedInvoice.status]}`}>{selectedInvoice.status}</Badge>
                      </div>
                      <p className="mt-4 text-3xl font-semibold text-white">{currency(selectedInvoice.total)}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {selectedInvoice.purchase_count ?? 0} tenant purchases billed for this period.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-[#0d1729] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Line Items</p>
                      <div className="mt-3 space-y-3">
                        {selectedItems.length > 0 ? (
                          selectedItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="text-white">{item.label}</p>
                                <p className="text-slate-400">
                                  {item.quantity} x {currency(item.unit_amount)}
                                </p>
                              </div>
                              <p className="font-medium text-white">{currency(item.amount)}</p>
                            </div>
                          ))
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="text-white">Platform base fee</p>
                                <p className="text-slate-400">Monthly tenant subscription</p>
                              </div>
                              <p className="font-medium text-white">{currency(selectedInvoice.subtotal || selectedInvoice.total)}</p>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="text-white">Usage billing</p>
                                <p className="text-slate-400">{selectedInvoice.purchase_count ?? 0} purchases in this period</p>
                              </div>
                              <p className="font-medium text-white">{currency(Math.max(0, selectedInvoice.total - selectedInvoice.subtotal))}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#0d1729] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Formula Snapshot</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-white/5 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Base fee</p>
                          <p className="mt-2 text-sm text-white">
                            {currency(Number(formulaSnapshot.monthly_base_fee ?? activeTenant?.monthlyBaseFee ?? 0))}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Usage fee</p>
                          <p className="mt-2 text-sm text-white">
                            {currency(Number(formulaSnapshot.per_purchase_fee ?? activeTenant?.perPurchaseFee ?? 0))} / purchase
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader>
                <CardTitle className="font-mono text-xl">Settlement Flow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4">
                  <div className="flex items-center gap-2 text-cyan-100">
                    <CreditCard className="h-4 w-4" />
                    <p className="font-medium">Gateway-ready billing desk</p>
                  </div>
                  <p className="mt-2 text-sm text-cyan-50/80">
                    Online gateways can plug in here later. For now, the billing desk keeps the invoice ledger, totals,
                    and settlement summary ready so finance can clear the account without losing auditability.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#0d1729] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recovery Checklist</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-300">
                    <p>1. Review the selected invoice amount and period.</p>
                    <p>2. Click Pay My Debt to initiate a payment prompt.</p>
                    <p>3. Once payment is recorded, tenant access restores automatically.</p>
                  </div>
                </div>
                <Separator className="bg-white/10" />
                <div className="flex flex-wrap gap-3">
                  {selectedInvoice && selectedInvoice.status !== "paid" && (
                    <Dialog open={payDialogOpen} onOpenChange={(open) => { setPayDialogOpen(open); if(!open){ setPayError(""); setPaySuccess(""); } }}>
                      <DialogTrigger asChild>
                        <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                          <CreditCard className="mr-2 h-4 w-4" />
                          Pay My Debt ({currency(selectedInvoice.total)})
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="border-white/10 bg-slate-900 text-white sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Pay Platform Invoice</DialogTitle>
                          <DialogDescription className="text-slate-400">
                            Amount due: <strong className="text-white">{currency(selectedInvoice.total)}</strong>. This will be paid to KCB Paybill 7718913.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4 py-4">
                          {payError && <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400">{payError}</div>}
                          {paySuccess && <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-400">{paySuccess}</div>}
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium">M-Pesa Phone Number</label>
                            <Input
                              placeholder="0712 345 678"
                              value={payPhone}
                              onChange={(e) => setPayPhone(e.target.value)}
                              className="border-white/10 bg-white/5 text-white"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => handlePayDebt(selectedInvoice.id)}
                            disabled={paying || !!paySuccess}
                            className="w-full bg-cyan-600 text-white hover:bg-cyan-500"
                          >
                            {paying ? "Sending STK Push..." : "Send Payment Prompt"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" asChild>
                    <a href={`mailto:${settlementEmail}?subject=${encodeURIComponent(`Invoice support for ${activeTenant?.name ?? "tenant"}`)}`}>
                      <Mail className="mr-2 h-4 w-4" />
                      Contact billing
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantBilling;
