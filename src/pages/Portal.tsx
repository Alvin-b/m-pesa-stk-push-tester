import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, Loader2, CheckCircle2, Clock, Zap, KeyRound } from "lucide-react";

interface Package {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  speed_limit: string;
}

type Step = "packages" | "login" | "payment" | "success";

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

    // Check if it's a voucher code
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

    // Check if it's an M-Pesa receipt
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

      // Poll for payment completion
      let attempts = 0;
      const maxAttempts = 30;
      const poll = setInterval(async () => {
        attempts++;
        const { data: queryData } = await supabase.functions.invoke("daraja-stk-query", {
          body: { checkoutRequestId },
        });

        if (queryData?.success) {
          clearInterval(poll);
          // Fetch the voucher created by the edge function
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
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)} Day${minutes >= 2880 ? 's' : ''}`;
    return `${Math.floor(minutes / 60)} Hour${minutes >= 120 ? 's' : ''}`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 glow-primary">
            <Wifi className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight font-mono text-foreground">
            WiFi Connect
          </h1>
          <p className="text-muted-foreground text-sm">
            Choose a package and get connected instantly
          </p>
        </div>

        {/* Login Code Section */}
        {step === "packages" && (
          <Card className="border-border">
            <CardContent className="pt-5 pb-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter voucher or M-Pesa code"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  className="font-mono bg-muted/50"
                />
                <Button
                  onClick={handleLoginCode}
                  disabled={!loginCode.trim() || loading}
                  variant="outline"
                  className="shrink-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                </Button>
              </div>
              {error && step === "packages" && (
                <p className="text-destructive text-xs mt-2 font-mono">{error}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Package Selection */}
        {step === "packages" && (
          <div className="space-y-3">
            <h2 className="text-sm font-mono font-semibold text-muted-foreground uppercase tracking-wider">
              Select a Package
            </h2>
            {packages.map((pkg) => (
              <Card
                key={pkg.id}
                className="cursor-pointer border-border hover:border-primary/50 transition-colors"
                onClick={() => {
                  setSelectedPkg(pkg);
                  setStep("payment");
                  setError("");
                }}
              >
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-mono font-semibold text-foreground">{pkg.name}</p>
                      <p className="text-xs text-muted-foreground">{pkg.speed_limit} speed</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-primary text-lg">KES {pkg.price}</p>
                    <p className="text-xs text-muted-foreground">{formatDuration(pkg.duration_minutes)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Payment Step */}
        {step === "payment" && selectedPkg && (
          <Card className="glow-primary-strong border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Pay with M-Pesa
              </CardTitle>
              <CardDescription>
                {selectedPkg.name} — KES {selectedPkg.price}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground font-mono">
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
                  onClick={() => { setStep("packages"); setError(""); }}
                  className="font-mono"
                >
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
              <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
              <div>
                <h2 className="text-xl font-bold font-mono text-foreground">You're Connected!</h2>
                <p className="text-muted-foreground text-sm mt-1">Use this code to login to the WiFi</p>
              </div>
              <div className="bg-muted rounded-xl p-4">
                <p className="text-4xl font-mono font-bold tracking-[0.3em] text-primary">
                  {voucherCode}
                </p>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Enter this code as both username and password on the login page
              </p>
              <Button
                variant="outline"
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

        <p className="text-center text-xs text-muted-foreground font-mono">
          Powered by M-Pesa · Daraja API
        </p>
      </div>
    </div>
  );
};

export default Portal;
