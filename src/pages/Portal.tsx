import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Wifi, Loader2, CheckCircle2, XCircle, Zap, KeyRound,
  ArrowLeft, Check, Smartphone, Copy, RefreshCw
} from "lucide-react";
import SupportChat from "@/components/SupportChat";
import networkBg from "@/assets/network-bg.png";

interface Package {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  speed_limit: string | null;
}

// These result codes mean "still processing" – keep polling
const PROCESSING_CODES = new Set([4999, "4999"]);

// Terminal failure codes
const FAILURE_CODES: Record<string, string> = {
  "1": "Insufficient funds in your M-Pesa account.",
  "1032": "Transaction cancelled. You dismissed the M-Pesa prompt.",
  "1037": "Your phone was unreachable. Please try again.",
  "1025": "M-Pesa server error. Please try again.",
  "1019": "Transaction expired. Please try again.",
  "2001": "Wrong M-Pesa PIN entered.",
  "1001": "Unable to process your request. Please try again.",
};

type Step = "packages" | "payment" | "waiting" | "success" | "failed";

const Portal = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [step, setStep] = useState<Step>("packages");
  const [phone, setPhone] = useState("");
  const [accessInput, setAccessInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [error, setError] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    supabase.from("packages").select("*").eq("is_active", true).order("price").then(({ data }) => {
      if (data) setPackages(data as Package[]);
    });
  }, []);

  const handleAccessInput = async () => {
    setLoading(true);
    setError("");
    const code = accessInput.trim().toUpperCase();

    // Try as access code first (5-letter codes)
    const { data: voucher } = await supabase
      .from("vouchers")
      .select("*, packages(*)")
      .eq("code", code)
      .eq("status", "active")
      .maybeSingle();

    if (voucher) {
      setVoucherCode(code);
      setStep("success");
      setLoading(false);
      return;
    }

    // Try as M-Pesa receipt
    const { data: receipt } = await supabase
      .from("vouchers")
      .select("*, packages(*)")
      .eq("mpesa_receipt", code)
      .eq("status", "active")
      .maybeSingle();

    if (receipt) {
      setVoucherCode(receipt.code);
      setStep("success");
      setLoading(false);
      return;
    }

    setError("Code not found. Check your access code or M-Pesa transaction code.");
    setLoading(false);
  };

  const handlePayment = async () => {
    if (!selectedPkg || !phone) return;
    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { phone, amount: selectedPkg.price, packageId: selectedPkg.id },
      });

      if (fnError || data?.error) {
        setError(fnError?.message || data?.error || "Payment failed");
        setLoading(false);
        return;
      }

      const checkoutRequestId = data?.data?.CheckoutRequestID;
      if (!checkoutRequestId) {
        setError("No checkout ID received");
        setLoading(false);
        return;
      }

      // Switch to animated waiting screen
      setStep("waiting");
      setLoading(false);
      setPollCount(0);

      let attempts = 0;
      const maxAttempts = 40; // ~2 minutes
      const poll = setInterval(async () => {
        attempts++;
        setPollCount(attempts);

        const { data: queryData } = await supabase.functions.invoke("daraja-stk-query", {
          body: { checkoutRequestId },
        });

        const resultCode = queryData?.resultCode;

        // Still processing – keep waiting
        if (PROCESSING_CODES.has(resultCode)) {
          return;
        }

        // Payment successful
        if (queryData?.success === true || resultCode === 0 || resultCode === "0") {
          clearInterval(poll);
          const { data: voucher } = await supabase
            .from("vouchers")
            .select("code")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle();

          setVoucherCode(voucher?.code || "CHECK ADMIN");
          setStep("success");
          return;
        }

        // Known terminal failure
        if (resultCode !== undefined && !PROCESSING_CODES.has(resultCode)) {
          const codeStr = String(resultCode);
          const reason = FAILURE_CODES[codeStr] || queryData?.meaning || "Payment was not completed. Please try again.";
          clearInterval(poll);
          setFailureReason(reason);
          setStep("failed");
          return;
        }

        // Timeout
        if (attempts >= maxAttempts) {
          clearInterval(poll);
          setFailureReason("Payment timed out. If money was deducted, please contact support.");
          setStep("failed");
        }
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(voucherCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetToPackages = () => {
    setStep("packages");
    setVoucherCode("");
    setAccessInput("");
    setPhone("");
    setError("");
    setFailureReason("");
    setPollCount(0);
  };

  const formatDuration = (minutes: number) => {
    if (minutes >= 43200) return `${Math.floor(minutes / 43200)} Month${Math.floor(minutes / 43200) > 1 ? 's' : ''}`;
    if (minutes >= 10080) return `${Math.floor(minutes / 10080)} Week${Math.floor(minutes / 10080) > 1 ? 's' : ''}`;
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)} Day${Math.floor(minutes / 1440) > 1 ? 's' : ''}`;
    if (minutes >= 60) return `${Math.floor(minutes / 60)} Hour${Math.floor(minutes / 60) > 1 ? 's' : ''}`;
    return `${minutes} Min`;
  };

  const getFeatures = (pkg: Package) => {
    const features = [`${formatDuration(pkg.duration_minutes)} Access`];
    if (pkg.speed_limit) features.push(`Speed: ${pkg.speed_limit}`);
    else features.push("High Speed Internet");
    features.push("Multiple Device Support");
    return features;
  };

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{
        backgroundImage: `url(${networkBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Light overlay */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm" />

      {/* Header */}
      <div className="relative z-10 text-center pt-8 pb-4 px-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border-2 border-primary/20 mb-3 shadow-lg">
          <Wifi className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          WiFi Access Portal
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect to high-speed internet in seconds
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative z-10 px-4 pb-8">

        {/* ── Packages Step ── */}
        {step === "packages" && (
          <div className="max-w-2xl mx-auto space-y-5 mt-2">
            {/* Unified code input at top */}
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/5">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Already have a code? Enter it below to connect instantly</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Access code or M-Pesa transaction code (e.g. ABCDE or QGH7X0KL2P)"
                      value={accessInput}
                      onChange={(e) => setAccessInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAccessInput()}
                      className="font-mono pl-10 bg-secondary/50 h-11 border-border text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleAccessInput}
                    disabled={!accessInput.trim() || loading}
                    className="h-11 px-5 font-semibold shrink-0"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
                  </Button>
                </div>
                {error && (
                  <p className="text-destructive text-xs font-mono bg-destructive/10 rounded-lg px-3 py-2 mt-2">{error}</p>
                )}
              </CardContent>
            </Card>

            {/* Plans */}
            <div>
              <h2 className="text-base font-semibold text-foreground px-1 mb-3">Choose a Plan to Get Started</h2>
              <div className="space-y-3">
                {packages.map((pkg, idx) => {
                  const accentColors = [
                    "hsl(217, 91%, 55%)",
                    "hsl(262, 83%, 58%)",
                    "hsl(145, 63%, 42%)",
                    "hsl(38, 92%, 50%)",
                    "hsl(0, 72%, 51%)",
                  ];
                  const accentColor = accentColors[idx % accentColors.length];
                  return (
                    <Card
                      key={pkg.id}
                      className="cursor-pointer border-border hover:border-primary/40 bg-card/90 backdrop-blur transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 group overflow-hidden"
                      onClick={() => {
                        setSelectedPkg(pkg);
                        setStep("payment");
                        setError("");
                      }}
                    >
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          <div className="w-1.5 shrink-0" style={{ backgroundColor: accentColor }} />
                          <div className="flex-1 p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors capitalize">
                                  {pkg.name}
                                </h3>
                                <span className="inline-block mt-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full text-white font-semibold" style={{ backgroundColor: accentColor }}>
                                  {formatDuration(pkg.duration_minutes)}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-foreground text-xl">
                                  KES {pkg.price % 1 === 0 ? pkg.price.toFixed(0) : pkg.price.toFixed(2)}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">one-time</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3 mt-2">
                              {getFeatures(pkg).map((feature, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="text-xs text-muted-foreground">{feature}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center pr-4">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                              <ArrowLeft className="h-4 w-4 text-primary rotate-180" />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Payment Step ── */}
        {step === "payment" && selectedPkg && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/10">
              <CardContent className="p-6 space-y-5">
                {/* Package summary */}
                <div className="rounded-xl bg-primary/5 border border-primary/15 p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md">
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground capitalize">{selectedPkg.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDuration(selectedPkg.duration_minutes)} ·{" "}
                      <span className="text-primary font-bold text-base">KES {selectedPkg.price}</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Safaricom Phone Number
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder="0712 345 678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handlePayment()}
                      className="font-mono pl-10 bg-secondary/50 h-12 text-base border-border focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You'll receive an M-Pesa prompt on this number
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-destructive text-sm">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => { setStep("packages"); setError(""); }}
                    className="font-mono border-border hover:bg-secondary/80"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    onClick={handlePayment}
                    disabled={loading || !phone.trim()}
                    className="flex-1 font-semibold h-12 text-base bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white shadow-lg shadow-primary/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending prompt…
                      </>
                    ) : (
                      <>
                        <Smartphone className="mr-2 h-4 w-4" />
                        Pay KES {selectedPkg.price}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Waiting / Processing Step ── */}
        {step === "waiting" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/10">
              <CardContent className="py-12 text-center space-y-6">
                {/* Pulsing rings animation */}
                <div className="relative flex items-center justify-center mx-auto w-28 h-28">
                  <div className="absolute w-28 h-28 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: "2s" }} />
                  <div className="absolute w-20 h-20 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.3s" }} />
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30">
                    <Smartphone className="h-7 w-7 text-white" />
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-foreground">Waiting for Payment</h2>
                  <p className="text-muted-foreground text-sm mt-2">
                    Check your phone and enter your M-Pesa PIN to complete the payment
                  </p>
                </div>

                {/* Steps */}
                <div className="bg-secondary/50 rounded-xl p-4 text-left space-y-3">
                  {[
                    { label: "STK push sent to your phone", done: true },
                    { label: "Enter your M-Pesa PIN when prompted", done: false },
                    { label: "Access code will appear automatically", done: false },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${item.done ? "bg-primary text-primary-foreground" : "bg-muted border-2 border-border"}`}>
                        {item.done ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}
                      </div>
                      <span className={`text-sm ${item.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Checking payment status
                  {pollCount > 0 && <span className="opacity-60">({pollCount * 3}s)</span>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Success Step ── */}
        {step === "success" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/10 overflow-hidden">
              {/* Gradient top bar */}
              <div className="h-2 bg-gradient-to-r from-primary to-accent" />
              <CardContent className="py-10 text-center space-y-5">
                {/* Success icon with animated ring */}
                <div className="relative flex items-center justify-center mx-auto w-20 h-20">
                  <div className="absolute w-20 h-20 rounded-full bg-primary/10 animate-[scale-in_0.5s_ease-out]" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 animate-[scale-in_0.4s_ease-out]">
                    <CheckCircle2 className="h-8 w-8 text-white" />
                  </div>
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-foreground">Payment Successful! 🎉</h2>
                  <p className="text-muted-foreground text-sm mt-1">You're all set — use the code below to connect</p>
                </div>

                {/* Voucher code box */}
                <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl p-5 border-2 border-primary/20">
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">Your Access Code</p>
                  <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">
                    {voucherCode}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyCode}
                    className="mt-3 text-xs text-muted-foreground hover:text-primary gap-1.5"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy code"}
                  </Button>
                </div>

                {/* Instructions */}
                <div className="bg-secondary/50 rounded-xl p-4 text-left">
                  <p className="text-sm font-semibold text-foreground mb-2">How to connect:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Select the WiFi network</li>
                    <li>Enter the code above as your <strong>username</strong></li>
                    <li>Enter the same code as your <strong>password</strong></li>
                    <li>Click Connect / Login</li>
                  </ol>
                </div>

                <Button
                  variant="outline"
                  onClick={resetToPackages}
                  className="w-full border-border hover:bg-secondary/80"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Buy Another Package
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Failed Step ── */}
        {step === "failed" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl overflow-hidden">
              {/* Red top bar */}
              <div className="h-2 bg-destructive" />
              <CardContent className="py-10 text-center space-y-5">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-foreground">Payment Failed</h2>
                  <p className="text-muted-foreground text-sm mt-2 max-w-xs mx-auto">
                    {failureReason}
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={() => {
                      setStep("payment");
                      setFailureReason("");
                    }}
                    className="flex-1 bg-gradient-to-r from-primary to-accent text-white hover:opacity-90"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetToPackages}
                    className="flex-1 border-border"
                  >
                    Change Package
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <p className="relative z-10 text-center text-[10px] text-muted-foreground pb-4">
        Powered by M-Pesa · Daraja API
      </p>
      <div className="relative z-10">
        <SupportChat />
      </div>
    </div>
  );
};

export default Portal;
