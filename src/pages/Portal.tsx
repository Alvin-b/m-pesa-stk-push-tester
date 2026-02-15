import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, Loader2, CheckCircle2, Zap, KeyRound, ArrowLeft, Signal, Clock, CalendarDays, CalendarRange, Calendar } from "lucide-react";
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
    if (minutes >= 10080) return <CalendarRange className="h-6 w-6" />;
    if (minutes >= 1440) return <CalendarDays className="h-6 w-6" />;
    if (minutes >= 60) return <Clock className="h-6 w-6" />;
    return <Clock className="h-5 w-5" />;
  };

  const getAccentClass = (index: number) => {
    const accents = [
      "from-primary/20 to-primary/5 border-primary/30",
      "from-primary/15 to-transparent border-primary/20",
      "from-primary/10 to-transparent border-primary/15",
      "from-primary/20 to-primary/5 border-primary/25",
    ];
    return accents[index % accents.length];
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center p-4 pt-8 relative"
      style={{ backgroundImage: `url(${networkBg})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}
    >
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />
      <div className="w-full max-w-lg space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 glow-primary">
            <Wifi className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight font-mono text-foreground">
            WiFi Connect
          </h1>
          <p className="text-muted-foreground text-sm">
            Choose a plan and get connected instantly
          </p>
        </div>

        {/* Already have a code */}
        {step === "packages" && (
          <Card className="border-border bg-card/50 backdrop-blur">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-mono mb-2">Already have a code?</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter voucher or M-Pesa code"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  className="font-mono text-sm bg-muted/50"
                />
                <Button
                  onClick={handleLoginCode}
                  disabled={!loginCode.trim() || loading}
                  variant="outline"
                  size="icon"
                  className="shrink-0 border-primary/30 hover:bg-primary/10"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                </Button>
              </div>
              {error && step === "packages" && (
                <p className="text-destructive text-xs font-mono mt-2">{error}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Package Cards */}
        {step === "packages" && (
          <div className="space-y-3">
            <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest px-1">Available Plans</h2>
            <div className="grid grid-cols-2 gap-3">
              {packages.map((pkg, index) => (
                <Card
                  key={pkg.id}
                  className={`cursor-pointer bg-gradient-to-br ${getAccentClass(index)} hover:shadow-[0_0_30px_hsl(145_63%_42%/0.2)] transition-all duration-300 group relative overflow-hidden`}
                  onClick={() => {
                    setSelectedPkg(pkg);
                    setStep("payment");
                    setError("");
                  }}
                >
                  {/* Decorative glow circle */}
                  <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-colors duration-300" />
                  
                  <CardContent className="p-5 flex flex-col items-center text-center space-y-3 relative">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-300">
                      {getDurationIcon(pkg.duration_minutes)}
                    </div>
                    <div className="space-y-1">
                      <p className="font-mono font-bold text-foreground text-sm group-hover:text-primary transition-colors">
                        {pkg.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDuration(pkg.duration_minutes)}
                      </p>
                    </div>
                    {pkg.speed_limit && (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border">
                        <Signal className="h-3 w-3 text-primary" />
                        <span className="text-[10px] font-mono text-muted-foreground">{pkg.speed_limit}</span>
                      </div>
                    )}
                    <div className="w-full pt-3 border-t border-border/50">
                      <p className="font-mono font-bold text-primary text-xl">
                        KES {pkg.price}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Payment Step */}
        {step === "payment" && selectedPkg && (
          <Card className="glow-primary-strong border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-mono font-bold text-foreground text-lg">Pay with M-Pesa</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedPkg.name} — <span className="text-primary font-semibold">KES {selectedPkg.price}</span>
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
                  className="font-mono bg-muted/50 h-12 text-base"
                />
              </div>
              {error && <p className="text-destructive text-xs font-mono">{error}</p>}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setStep("packages"); setError(""); }}
                  className="font-mono"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button
                  onClick={handlePayment}
                  disabled={loading || !phone}
                  className="flex-1 font-mono font-semibold glow-primary h-12 text-base"
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
          <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent glow-primary-strong">
            <CardContent className="py-10 text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold font-mono text-foreground">You're Connected!</h2>
                <p className="text-muted-foreground text-sm mt-1">Use this code to login to the WiFi</p>
              </div>
              <div className="bg-muted rounded-2xl p-5 border border-border">
                <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">
                  {voucherCode}
                </p>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Enter this code as both username and password
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

        <p className="text-center text-[10px] text-muted-foreground font-mono">
          Powered by M-Pesa · Daraja API
        </p>
      </div>
      <div className="relative z-10">
        <SupportChat />
      </div>
    </div>
  );
};

export default Portal;
