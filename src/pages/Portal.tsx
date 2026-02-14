import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, Loader2, CheckCircle2, Clock, Zap, KeyRound, ArrowLeft, Signal } from "lucide-react";

interface Package {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  speed_limit: string | null;
}

type Step = "packages" | "payment" | "success";

const Portal = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [step, setStep] = useState<Step>("packages");
  const [phone, setPhone] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("packages").select("*").eq("is_active", true).order("price").then(({ data }) => {
      if (data) setPackages(data as Package[]);
    });
  }, []);

  const handleLoginCode = async () => {
    setLoading(true);
    setError("");
    const code = loginCode.trim().toUpperCase();

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

    setError("Invalid code. Please check and try again.");
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

      let attempts = 0;
      const maxAttempts = 30;
      const poll = setInterval(async () => {
        attempts++;
        const { data: queryData } = await supabase.functions.invoke("daraja-stk-query", {
          body: { checkoutRequestId },
        });

        if (queryData?.success) {
          clearInterval(poll);
          const { data: voucher } = await supabase
            .from("vouchers")
            .select("code")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle();

          setVoucherCode(voucher?.code || "CHECK ADMIN");
          setStep("success");
          setLoading(false);
        } else if (attempts >= maxAttempts || (queryData?.resultCode && queryData.resultCode !== 0)) {
          clearInterval(poll);
          setError(queryData?.meaning || "Payment was not completed");
          setLoading(false);
        }
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes >= 43200) return `${Math.floor(minutes / 43200)} Month${minutes >= 86400 ? 's' : ''}`;
    if (minutes >= 10080) return `${Math.floor(minutes / 10080)} Week${minutes >= 20160 ? 's' : ''}`;
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)} Day${minutes >= 2880 ? 's' : ''}`;
    if (minutes >= 60) return `${Math.floor(minutes / 60)} Hour${minutes >= 120 ? 's' : ''}`;
    return `${minutes} Min`;
  };

  const getDurationIcon = (minutes: number) => {
    if (minutes >= 10080) return "🗓️";
    if (minutes >= 1440) return "📅";
    if (minutes >= 60) return "⏰";
    return "⏱️";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 glow-primary">
            <Wifi className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight font-mono text-foreground">
            WiFi Connect
          </h1>
          <p className="text-muted-foreground text-xs">
            Select a plan to get online
          </p>
        </div>

        {/* Already have a code */}
        {step === "packages" && (
          <div className="flex gap-2">
            <Input
              placeholder="Have a voucher or M-Pesa code?"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              className="font-mono text-sm bg-muted/50"
            />
            <Button
              onClick={handleLoginCode}
              disabled={!loginCode.trim() || loading}
              variant="outline"
              size="icon"
              className="shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {error && step === "packages" && (
          <p className="text-destructive text-xs font-mono text-center">{error}</p>
        )}

        {/* Package Cards */}
        {step === "packages" && (
          <div className="grid grid-cols-2 gap-3">
            {packages.map((pkg) => (
              <Card
                key={pkg.id}
                className="cursor-pointer border-border hover:border-primary/60 hover:shadow-[0_0_20px_hsl(145_63%_42%/0.15)] transition-all duration-200 group"
                onClick={() => {
                  setSelectedPkg(pkg);
                  setStep("payment");
                  setError("");
                }}
              >
                <CardContent className="p-4 flex flex-col items-center text-center space-y-3">
                  <span className="text-3xl">{getDurationIcon(pkg.duration_minutes)}</span>
                  <div className="space-y-1">
                    <p className="font-mono font-bold text-foreground text-sm group-hover:text-primary transition-colors">
                      {pkg.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatDuration(pkg.duration_minutes)}
                    </p>
                  </div>
                  {pkg.speed_limit && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Signal className="h-3 w-3" />
                      <span className="text-[10px] font-mono">{pkg.speed_limit}</span>
                    </div>
                  )}
                  <div className="w-full pt-2 border-t border-border">
                    <p className="font-mono font-bold text-primary text-lg">
                      KES {pkg.price}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Payment Step */}
        {step === "payment" && selectedPkg && (
          <Card className="glow-primary-strong border-primary/20">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-mono font-bold text-foreground">Pay with M-Pesa</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedPkg.name} — KES {selectedPkg.price}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground font-mono">
                  Safaricom Phone Number
                </label>
                <Input
                  type="tel"
                  placeholder="0712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="font-mono bg-muted/50"
                />
              </div>
              {error && <p className="text-destructive text-xs font-mono">{error}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setStep("packages"); setError(""); }}
                  className="font-mono"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button
                  onClick={handlePayment}
                  disabled={loading || !phone}
                  className="flex-1 font-mono font-semibold glow-primary"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Pay KES ${selectedPkg.price}`
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success */}
        {step === "success" && (
          <Card className="border-primary/40 bg-primary/5 glow-primary-strong">
            <CardContent className="py-8 text-center space-y-4">
              <CheckCircle2 className="h-14 w-14 text-primary mx-auto" />
              <div>
                <h2 className="text-lg font-bold font-mono text-foreground">You're Connected!</h2>
                <p className="text-muted-foreground text-xs mt-1">Use this code to login to the WiFi</p>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">
                  {voucherCode}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                Enter this code as both username and password
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep("packages");
                  setVoucherCode("");
                  setLoginCode("");
                  setPhone("");
                  setError("");
                }}
                className="font-mono"
              >
                Buy Another Package
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-[10px] text-muted-foreground font-mono">
          Powered by M-Pesa · Daraja API
        </p>
      </div>
    </div>
  );
};

export default Portal;
