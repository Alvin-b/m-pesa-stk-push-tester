import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Smartphone, Loader2, CheckCircle2, XCircle, Zap } from "lucide-react";

const Index = () => {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { phone, amount: parseInt(amount) },
      });

      if (error) {
        setResult({ success: false, message: error.message || "Request failed" });
      } else if (data?.error) {
        setResult({ success: false, message: data.error + (data.details ? `: ${JSON.stringify(data.details)}` : "") });
      } else {
        setResult({
          success: true,
          message: `STK Push sent! Check your phone. (CheckoutRequestID: ${data?.data?.CheckoutRequestID || "N/A"})`,
        });
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Something went wrong" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary font-mono">
            <Zap className="h-3.5 w-3.5" />
            Daraja API Tester
          </div>
          <h1 className="text-3xl font-bold tracking-tight font-mono text-foreground">
            M-Pesa STK Push
          </h1>
          <p className="text-muted-foreground text-sm">
            Test your Daraja API credentials by sending an STK push to any Safaricom number
          </p>
        </div>

        {/* Form Card */}
        <Card className="glow-primary-strong border-primary/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Payment Request
            </CardTitle>
            <CardDescription>
              Enter a phone number to receive the STK push prompt
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground font-mono">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  placeholder="0712345678 or 254712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="font-mono bg-muted/50 border-border focus:border-primary focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground font-mono">
                  Amount (KES)
                </label>
                <Input
                  type="number"
                  min="1"
                  placeholder="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="font-mono bg-muted/50 border-border focus:border-primary focus:ring-primary"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !phone}
                className="w-full font-mono font-semibold glow-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending STK Push...
                  </>
                ) : (
                  "Send STK Push"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Result */}
        {result && (
          <Card className={`border ${result.success ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                )}
                <p className="text-sm font-mono break-all">{result.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground font-mono">
          Using Safaricom Daraja Sandbox API
        </p>
      </div>
    </div>
  );
};

export default Index;
