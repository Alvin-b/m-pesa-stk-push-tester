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

type Step = "packages" | "payment" | "waiting" | "connecting" | "success" | "failed";

interface Package {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  speed_limit: string | null;
}

/* =========================
   MIKROTIK HELPERS
========================= */

// Detect hotspot environment
const detectMikroTik = () => {
  const params = new URLSearchParams(window.location.search);

  const hasParams =
    params.has("link-login-only") ||
    params.has("link-login") ||
    params.has("chap-id") ||
    params.has("mac");

  if (hasParams) {
    sessionStorage.setItem("mt_params", window.location.search);
    return true;
  }

  return !!sessionStorage.getItem("mt_params");
};

// Get MikroTik params
const getMT = () => {
  const saved = sessionStorage.getItem("mt_params") || "";
  const params = new URLSearchParams(saved);

  return {
    login: params.get("link-login-only") || params.get("link-login"),
    dst: params.get("link-orig"),
    mac: params.get("mac"),
    chapId: params.get("chap-id"),
    chapChallenge: params.get("chap-challenge"),
  };
};

// Prevent login loop
const alreadyLoggedIn = () => {
  return document.cookie.includes("mikrotik") ||
         window.location.href.includes("status");
};

// Login using POST (SAFE)
const loginToMikroTik = (code: string) => {
  const mt = getMT();
  if (!mt.login) return;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = mt.login;
  form.style.display = "none";

  const add = (name: string, value: string) => {
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = name;
    i.value = value;
    form.appendChild(i);
  };

  add("username", code);
  add("password", code);

  if (mt.dst) add("dst", mt.dst);
  if (mt.mac) add("mac", mt.mac);
  if (mt.chapId) add("chap-id", mt.chapId);
  if (mt.chapChallenge) add("chap-challenge", mt.chapChallenge);

  document.body.appendChild(form);
  form.submit();
};

/* =========================
   MAIN COMPONENT
========================= */

const Portal = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [step, setStep] = useState<Step>("packages");

  const [phone, setPhone] = useState("");
  const [accessCode, setAccessCode] = useState("");

  const [voucherCode, setVoucherCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [mikrotik, setMikrotik] = useState(false);

  /* =========================
     INIT
  ========================= */

  useEffect(() => {
    setMikrotik(detectMikroTik());

    supabase
      .from("packages")
      .select("*")
      .eq("is_active", true)
      .order("price")
      .then(({ data }) => {
        if (data) setPackages(data);
      });
  }, []);

  /* =========================
     CONNECT USER (SAFE)
  ========================= */

  const connectUser = async (code: string) => {
    setVoucherCode(code);

    // prevent loop
    if (mikrotik && !alreadyLoggedIn()) {
      setStep("connecting");

      await new Promise(r => setTimeout(r, 1200));

      loginToMikroTik(code);
      return;
    }

    setStep("success");
  };

  /* =========================
     ACCESS CODE LOGIN
  ========================= */

  const handleCodeLogin = async () => {
    setLoading(true);
    setError("");

    const code = accessCode.trim().toUpperCase();

    const { data } = await supabase
      .from("vouchers")
      .select("*")
      .eq("code", code)
      .eq("status", "active")
      .maybeSingle();

    if (!data) {
      setError("Invalid or expired code");
      setLoading(false);
      return;
    }

    setLoading(false);
    connectUser(code);
  };

  /* =========================
     PAYMENT
  ========================= */

  const handlePayment = async () => {
    if (!selectedPkg || !phone) return;

    setLoading(true);
    setError("");

    try {
      const { data } = await supabase.functions.invoke("mpesa-stk-push", {
        body: {
          phone,
          amount: selectedPkg.price,
          packageId: selectedPkg.id,
        },
      });

      const id = data?.data?.CheckoutRequestID;

      if (!id) {
        setError("Payment failed");
        setLoading(false);
        return;
      }

      setStep("waiting");
      setLoading(false);

      let attempts = 0;

      const interval = setInterval(async () => {
        attempts++;

        const { data: res } = await supabase.functions.invoke("daraja-stk-query", {
          body: { checkoutRequestId: id },
        });

        if (res?.resultCode === 0) {
          clearInterval(interval);

          const { data: confirm } = await supabase.functions.invoke("confirm-payment", {
            body: { checkoutRequestId: id },
          });

          const code = confirm?.code;
          if (code) connectUser(code);
        }

        if (attempts > 40) {
          clearInterval(interval);
          setStep("failed");
        }
      }, 3000);

    } catch {
      setError("Error processing payment");
      setLoading(false);
    }
  };

  /* =========================
     UI
  ========================= */

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `url(${networkBg})`,
        backgroundSize: "cover",
      }}
    >
      <div className="p-6 text-center">
        <Wifi className="mx-auto mb-2" />
        <h1 className="text-xl font-bold">WiFi Portal</h1>
      </div>

      <div className="p-4 flex-1">

        {/* PACKAGES */}
        {step === "packages" && (
          <div className="space-y-4 max-w-md mx-auto">

            <Input
              placeholder="Enter code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
            />

            <Button onClick={handleCodeLogin} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Login"}
            </Button>

            {error && <p className="text-red-500">{error}</p>}

            {packages.map(pkg => (
              <Card key={pkg.id} onClick={() => {
                setSelectedPkg(pkg);
                setStep("payment");
              }}>
                <CardContent>
                  <p>{pkg.name}</p>
                  <p>KES {pkg.price}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* PAYMENT */}
        {step === "payment" && selectedPkg && (
          <div className="max-w-md mx-auto space-y-4">
            <p>{selectedPkg.name}</p>

            <Input
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <Button onClick={handlePayment}>
              Pay KES {selectedPkg.price}
            </Button>
          </div>
        )}

        {/* WAITING */}
        {step === "waiting" && (
          <div className="text-center">
            <Loader2 className="animate-spin mx-auto" />
            <p>Waiting for payment...</p>
          </div>
        )}

        {/* CONNECTING */}
        {step === "connecting" && (
          <div className="text-center">
            <Loader2 className="animate-spin mx-auto" />
            <p>Connecting...</p>
          </div>
        )}

        {/* SUCCESS */}
        {step === "success" && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto text-green-500" />
            <p>Connected!</p>
            <p className="font-mono">{voucherCode}</p>
          </div>
        )}

        {/* FAILED */}
        {step === "failed" && (
          <div className="text-center">
            <XCircle className="mx-auto text-red-500" />
            <p>Payment failed</p>
          </div>
        )}

      </div>

      <SupportChat />
    </div>
  );
};

export default Portal;
