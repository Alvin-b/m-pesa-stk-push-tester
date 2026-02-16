import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Wifi, Loader2, CheckCircle2, Zap, KeyRound, ArrowLeft, Signal, Clock, CalendarDays, CalendarRange, Check } from "lucide-react";
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
  const [mpesaCode, setMpesaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [error, setError] = useState("");
  const [mpesaError, setMpesaError] = useState("");

  useEffect(() => {
    supabase.from("packages").select("*").eq("is_active", true).order("price").then(({ data }) => {
      if (data) setPackages(data as Package[]);
    });
  }, []);

  const handleAccessCode = async () => {
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

    setError("Invalid access code. Please check and try again.");
    setLoading(false);
  };

  const handleMpesaCode = async () => {
    setMpesaLoading(true);
    setMpesaError("");
    const code = mpesaCode.trim().toUpperCase();

    const { data: receipt } = await supabase
      .from("vouchers")
      .select("*, packages(*)")
      .eq("mpesa_receipt", code)
      .eq("status", "active")
      .maybeSingle();

    if (receipt) {
      setVoucherCode(receipt.code);
      setStep("success");
      setMpesaLoading(false);
      return;
    }

    setMpesaError("Transaction not found. Please check your M-Pesa code.");
    setMpesaLoading(false);
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

  const getFeatures = (pkg: Package) => {
    const features = [`${formatDuration(pkg.duration_minutes)} Access`];
    if (pkg.speed_limit) {
      features.push(`Speed: ${pkg.speed_limit}`);
    } else {
      features.push("High Speed Internet");
    }
    features.push("Multiple Device Support");
    return features;
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col relative"
      style={{ backgroundImage: `url(${networkBg})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}
    >
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />
      
      {/* Header */}
      <div className="relative z-10 text-center pt-8 pb-4 px-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-3">
          <Wifi className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-mono text-foreground">
          WiFi Access Portal
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect to high-speed internet in seconds
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative z-10 px-4 pb-8">
        {step === "packages" && (
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6 mt-4">
            {/* Left Column - Code Entry */}
            <div className="lg:col-span-2">
              <Card className="border-border bg-card/80 backdrop-blur">
                <CardContent className="p-6 space-y-6">
                  {/* Access Code Section */}
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold text-foreground">Already have a code?</h2>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground font-mono">Access Code</label>
                      <Input
                        placeholder="Enter your access code"
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value)}
                        className="font-mono bg-muted/50 h-11"
                      />
                    </div>
                    <Button
                      onClick={handleAccessCode}
                      disabled={!loginCode.trim() || loading}
                      className="w-full font-mono font-semibold h-11"
                    >
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                      Connect with Access Code
                    </Button>
                    {error && step === "packages" && (
                      <p className="text-destructive text-xs font-mono">{error}</p>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground font-mono">OR</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* M-Pesa Transaction Code */}
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground font-mono">M-Pesa Transaction Code</label>
                      <Input
                        placeholder="Enter M-Pesa transaction code"
                        value={mpesaCode}
                        onChange={(e) => setMpesaCode(e.target.value)}
                        className="font-mono bg-muted/50 h-11"
                      />
                    </div>
                    <Button
                      onClick={handleMpesaCode}
                      disabled={!mpesaCode.trim() || mpesaLoading}
                      variant="outline"
                      className="w-full font-mono font-semibold h-11 border-primary/30 hover:bg-primary/10"
                    >
                      {mpesaLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Verify Transaction
                    </Button>
                    {mpesaError && (
                      <p className="text-destructive text-xs font-mono">{mpesaError}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Plans */}
            <div className="lg:col-span-3 space-y-3">
              <h2 className="text-lg font-semibold text-primary font-mono px-1">Choose a Plan</h2>
              <div className="space-y-3">
                {packages.map((pkg) => (
                  <Card
                    key={pkg.id}
                    className="cursor-pointer border-border hover:border-primary/40 bg-card/80 backdrop-blur transition-all duration-200 group"
                    onClick={() => {
                      setSelectedPkg(pkg);
                      setStep("payment");
                      setError("");
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-mono font-bold text-foreground text-base group-hover:text-primary transition-colors">
                            {pkg.name}
                          </h3>
                          <span className="inline-block mt-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {formatDuration(pkg.duration_minutes)}
                          </span>
                        </div>
                        <p className="font-mono font-bold text-foreground text-xl">
                          KES {pkg.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="space-y-2 mt-4">
                        {getFeatures(pkg).map((feature, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <Check className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-sm text-muted-foreground">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Payment Step */}
        {step === "payment" && selectedPkg && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-primary/20 bg-card/80 backdrop-blur">
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
                    className="flex-1 font-mono font-semibold h-12 text-base"
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
          </div>
        )}

        {/* Success */}
        {step === "success" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-primary/40 bg-card/80 backdrop-blur">
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
                    setMpesaCode("");
                    setPhone("");
                    setError("");
                    setMpesaError("");
                  }}
                  className="font-mono"
                >
                  Buy Another Package
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <p className="relative z-10 text-center text-[10px] text-muted-foreground font-mono pb-4">
        Powered by M-Pesa · Daraja API
      </p>
      <div className="relative z-10">
        <SupportChat />
      </div>
    </div>
  );
};

export default Portal;
