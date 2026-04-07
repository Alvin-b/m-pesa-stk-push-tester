import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import SupportChat from "@/components/SupportChat";

interface Package {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  speed_limit: string | null;
}

const PROCESSING_CODES = new Set([4999, "4999"]);

const FAILURE_CODES: Record<string, string> = {
  "1": "Insufficient funds in your M-Pesa account.",
  "1032": "Transaction cancelled. You dismissed the M-Pesa prompt.",
  "1037": "Your phone was unreachable. Please try again.",
  "1025": "M-Pesa server error. Please try again.",
  "1019": "Transaction expired. Please try again.",
  "2001": "Wrong M-Pesa PIN entered.",
  "1001": "Unable to process your request. Please try again.",
};

type Step = "packages" | "payment" | "waiting" | "success" | "connecting" | "failed";

// ── MikroTik detection ────────────────────────────────────────────────────────
const detectMikroTik = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const has = params.has("link-login-only") || params.has("link-login") ||
    params.has("chap-id") || params.has("mac") || params.has("link-orig");
  if (has) {
    sessionStorage.setItem("mikrotik_params", window.location.search);
    return true;
  }
  return !!sessionStorage.getItem("mikrotik_params");
};

const getMikroTikParams = () => {
  let search = window.location.search;
  const saved = sessionStorage.getItem("mikrotik_params");
  if (!new URLSearchParams(search).has("link-login-only") && saved) search = saved;
  const p = new URLSearchParams(search);
  return {
    linkLoginOnly: p.get("link-login-only") || p.get("link-login"),
    linkOrig: p.get("link-orig") || p.get("link-redirect"),
    mac: p.get("mac"),
    chapId: p.get("chap-id"),
    chapChallenge: p.get("chap-challenge"),
    linkLogin: p.get("link-login"),
  };
};

// ── Auto-connect: redirect to login.html with credentials ────────────────────
// Avoids HTTPS→HTTP mixed-content block by bouncing through the local
// login.html (served from the router over plain HTTP) which then POSTs
// the credentials to MikroTik.
const loginToMikroTik = (code: string): void => {
  const mt = getMikroTikParams();
  if (!mt.linkLoginOnly && !mt.linkLogin) return;

  const loginPageUrl = new URL("http://njuwa.wifi/login");
  loginPageUrl.searchParams.set("username", code);
  loginPageUrl.searchParams.set("password", code);
  if (mt.linkLoginOnly) loginPageUrl.searchParams.set("link-login-only", mt.linkLoginOnly);
  if (mt.linkOrig) loginPageUrl.searchParams.set("dst", mt.linkOrig);
  if (mt.chapId) loginPageUrl.searchParams.set("chap-id", mt.chapId);
  if (mt.chapChallenge) loginPageUrl.searchParams.set("chap-challenge", mt.chapChallenge);
  if (mt.mac) loginPageUrl.searchParams.set("mac", mt.mac);

  window.location.href = loginPageUrl.toString();
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDuration = (minutes: number) => {
  if (minutes >= 43200) return `${Math.floor(minutes / 43200)}mo`;
  if (minutes >= 10080) return `${Math.floor(minutes / 10080)}wk`;
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}hr`;
  return `${minutes}min`;
};

const formatDurationLong = (minutes: number) => {
  if (minutes >= 43200) { const v = Math.floor(minutes / 43200); return `${v} Month${v > 1 ? "s" : ""}`; }
  if (minutes >= 10080) { const v = Math.floor(minutes / 10080); return `${v} Week${v > 1 ? "s" : ""}`; }
  if (minutes >= 1440) { const v = Math.floor(minutes / 1440); return `${v} Day${v > 1 ? "s" : ""}`; }
  if (minutes >= 60) { const v = Math.floor(minutes / 60); return `${v} Hour${v > 1 ? "s" : ""}`; }
  return `${minutes} Minutes`;
};

// ── Inline styles (matching login.html dark theme) ────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: "#0a0f1e",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#fff",
    position: "relative" as const,
    overflowX: "hidden" as const,
  },
  circle1: {
    position: "fixed" as const, borderRadius: "50%", opacity: 0.15,
    width: 500, height: 500, background: "#6c63ff", top: -150, right: -150, pointerEvents: "none" as const,
  },
  circle2: {
    position: "fixed" as const, borderRadius: "50%", opacity: 0.15,
    width: 400, height: 400, background: "#00c896", bottom: -100, left: -100, pointerEvents: "none" as const,
  },
  content: {
    position: "relative" as const, zIndex: 1,
    maxWidth: 440, margin: "0 auto", padding: "32px 20px 80px",
  },
  header: { textAlign: "center" as const, paddingTop: 32, paddingBottom: 28 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20,
    background: "linear-gradient(135deg, #6c63ff, #00c896)",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 20px",
  },
  h1: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 6, lineHeight: 1.5 },

  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20, padding: "24px",
    marginBottom: 16, backdropFilter: "blur(12px)",
  },
  cardLabel: { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, marginBottom: 12 },

  pkgGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 },
  pkgCard: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16, padding: "18px 16px", cursor: "pointer",
    transition: "all 0.2s", textAlign: "left" as const,
  },
  pkgCardHover: {
    background: "rgba(108,99,255,0.15)",
    border: "1px solid rgba(108,99,255,0.5)",
    transform: "translateY(-2px)",
  },
  pkgDuration: {
    display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    background: "rgba(108,99,255,0.25)", color: "#a89fff",
    borderRadius: 50, padding: "3px 10px", marginBottom: 10,
  },
  pkgName: { fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4, textTransform: "capitalize" as const },
  pkgPrice: { fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 },
  pkgPriceSub: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 },
  pkgFeature: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, display: "flex", alignItems: "center", gap: 5 },

  divider: { display: "flex", alignItems: "center", gap: 12, margin: "20px 0" },
  dividerLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)" },
  dividerText: { fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, letterSpacing: "0.08em", whiteSpace: "nowrap" as const },

  input: {
    width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12, padding: "13px 16px", color: "#fff", fontSize: 14,
    outline: "none", boxSizing: "border-box" as const, fontFamily: "inherit",
  },
  inputLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 8, display: "block" },

  btnPrimary: {
    width: "100%", padding: "14px", borderRadius: 12,
    background: "linear-gradient(135deg, #6c63ff, #00c896)",
    border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
    cursor: "pointer", letterSpacing: "0.02em", marginTop: 12,
  },
  btnSecondary: {
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12, padding: "12px 20px", color: "rgba(255,255,255,0.7)",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  btnRow: { display: "flex", gap: 10, marginTop: 12 },

  error: {
    background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.25)",
    borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#ff8080", marginTop: 10,
  },

  spinnerWrap: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 16, padding: "40px 0" },
  pulse: {
    width: 80, height: 80, borderRadius: "50%",
    background: "linear-gradient(135deg, #6c63ff, #00c896)",
    display: "flex", alignItems: "center", justifyContent: "center",
    animation: "pulse 2s ease-in-out infinite",
  },
  statusText: { fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4, textAlign: "center" as const },

  codeBox: {
    background: "rgba(108,99,255,0.1)", border: "1px solid rgba(108,99,255,0.3)",
    borderRadius: 16, padding: "24px", textAlign: "center" as const, margin: "16px 0",
  },
  codeLabel: { fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 },
  codeValue: { fontSize: 32, fontWeight: 800, letterSpacing: "0.25em", color: "#a89fff", fontFamily: "monospace" },

  infoRow: {
    display: "flex", alignItems: "center", gap: 10,
    background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "11px 14px", marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },

  tag: {
    display: "inline-flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,0.06)", borderRadius: 50, padding: "5px 12px",
    fontSize: 12, color: "rgba(255,255,255,0.6)", marginRight: 6, marginBottom: 6,
  },
  brand: { textAlign: "center" as const, fontSize: 11, color: "rgba(255,255,255,0.2)", paddingBottom: 24, position: "relative" as const, zIndex: 1 },
};

export default function Portal() {
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
  const [mikrotikDetected, setMikrotikDetected] = useState(false);
  const [hoveredPkg, setHoveredPkg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.from("packages").select("*").eq("is_active", true).order("price").then(({ data }) => {
      if (data) setPackages(data as Package[]);
    });
    setMikrotikDetected(detectMikroTik());
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const connectUser = async (code: string) => {
    setVoucherCode(code);
    if (mikrotikDetected) {
      setStep("connecting");
      await new Promise(r => setTimeout(r, 1800));
      loginToMikroTik(code);
      // Fallback: if still on page after 4s, show success
      await new Promise(r => setTimeout(r, 4000));
      setStep("success");
    } else {
      setStep("success");
    }
  };

  const handleAccessInput = async () => {
    setLoading(true);
    setError("");
    const code = accessInput.trim().toUpperCase();

    let { data: voucher } = await supabase
      .from("vouchers").select("*, packages(*)")
      .eq("code", code).eq("status", "active").maybeSingle();

    if (!voucher) {
      const { data: r } = await supabase.from("vouchers").select("*, packages(*)")
        .eq("mpesa_receipt", code).eq("status", "active").maybeSingle();
      voucher = r;
    }

    if (!voucher) {
      setError("Invalid code. Please check your access code or M-Pesa receipt and try again.");
      setLoading(false); return;
    }

    const { data: radcheck } = await supabase.from("radcheck").select("username")
      .eq("username", voucher.code).maybeSingle();

    if (!radcheck) {
      setError("Your code is valid but RADIUS credentials are missing. Please contact support.");
      setLoading(false); return;
    }

    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      setError("This code has expired. Please purchase a new package.");
      setLoading(false); return;
    }

    setLoading(false);
    await connectUser(voucher.code);
  };

  const handlePayment = async () => {
    if (!selectedPkg || !phone) return;
    setLoading(true); setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { phone, amount: selectedPkg.price, packageId: selectedPkg.id },
      });

      if (fnError || data?.error) {
        setError(fnError?.message || data?.error || "Payment failed");
        setLoading(false); return;
      }

      const checkoutRequestId = data?.data?.CheckoutRequestID;
      if (!checkoutRequestId) {
        setError("No checkout ID received"); setLoading(false); return;
      }

      setStep("waiting"); setLoading(false); setPollCount(0);
      let attempts = 0;

      pollRef.current = setInterval(async () => {
        attempts++;
        setPollCount(attempts);

        const { data: queryData } = await supabase.functions.invoke("daraja-stk-query", {
          body: { checkoutRequestId },
        });

        const resultCode = queryData?.resultCode;
        if (PROCESSING_CODES.has(resultCode)) return;

        if (queryData?.success === true || resultCode === 0 || resultCode === "0") {
          if (pollRef.current) clearInterval(pollRef.current);

          const { data: confirmData, error: confirmError } = await supabase.functions.invoke("confirm-payment", {
            body: { checkoutRequestId, mpesaReceipt: queryData?.data?.MpesaReceiptNumber || null },
          });

          const code = confirmData?.code || "CHECK ADMIN";
          if (!confirmError && code !== "CHECK ADMIN") {
            await connectUser(code);
          } else {
            const { data: v } = await supabase.from("vouchers").select("code")
              .eq("checkout_request_id", checkoutRequestId).maybeSingle();
            setVoucherCode(v?.code || "CHECK ADMIN");
            setStep("success");
          }
          return;
        }

        if (resultCode !== undefined && !PROCESSING_CODES.has(resultCode)) {
          if (pollRef.current) clearInterval(pollRef.current);
          const reason = FAILURE_CODES[String(resultCode)] || queryData?.meaning || "Payment was not completed.";
          setFailureReason(reason); setStep("failed"); return;
        }

        if (attempts >= 40) {
          if (pollRef.current) clearInterval(pollRef.current);
          setFailureReason("Payment timed out. If money was deducted, please contact support.");
          setStep("failed");
        }
      }, 3000);

    } catch (err: any) {
      setError(err.message || "Something went wrong"); setLoading(false);
    }
  };

  const reset = () => {
    setStep("packages"); setVoucherCode(""); setAccessInput("");
    setPhone(""); setError(""); setFailureReason(""); setPollCount(0);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  return (
    <div style={S.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(108,99,255,0.4); } 50% { box-shadow: 0 0 0 20px rgba(108,99,255,0); } }
        @keyframes ping { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.35s ease forwards; }
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus { border-color: rgba(108,99,255,0.6) !important; box-shadow: 0 0 0 3px rgba(108,99,255,0.15); }
        button:active { transform: scale(0.98); }
        .pkg-card:hover { background: rgba(108,99,255,0.15) !important; border-color: rgba(108,99,255,0.5) !important; transform: translateY(-2px); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      {/* Background circles */}
      <div style={S.circle1} />
      <div style={S.circle2} />

      <div style={S.content}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.iconWrap}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
              <circle cx="12" cy="20" r="1" fill="#fff" stroke="none"/>
            </svg>
          </div>
          <h1 style={S.h1}>Njuwa WiFi</h1>
          <p style={S.subtitle}>Fast, reliable internet — connect in seconds</p>
        </div>

        {/* ── Packages ── */}
        {step === "packages" && (
          <div className="fade-in">
            {/* Access code card */}
            <div style={S.card}>
              <div style={S.cardLabel}>Already have a code?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...S.input, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "monospace" }}
                  placeholder="Enter access code or M-Pesa receipt"
                  value={accessInput}
                  onChange={e => setAccessInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAccessInput()}
                />
                <button
                  onClick={handleAccessInput}
                  disabled={!accessInput.trim() || loading}
                  style={{ ...S.btnPrimary, width: "auto", padding: "0 20px", margin: 0, opacity: (!accessInput.trim() || loading) ? 0.5 : 1, flexShrink: 0 }}
                >
                  {loading ? "…" : "Go"}
                </button>
              </div>
              {error && <div style={S.error}>{error}</div>}
            </div>

            <div style={S.divider}>
              <div style={S.dividerLine} />
              <span style={S.dividerText}>or choose a plan</span>
              <div style={S.dividerLine} />
            </div>

            {/* Package grid */}
            <div style={S.pkgGrid}>
              {packages.map(pkg => (
                <div
                  key={pkg.id}
                  className="pkg-card"
                  style={{ ...S.pkgCard, transition: "all 0.2s" }}
                  onClick={() => { setSelectedPkg(pkg); setStep("payment"); setError(""); }}
                >
                  <div style={S.pkgDuration}>{formatDuration(pkg.duration_minutes)}</div>
                  <div style={S.pkgName}>{pkg.name}</div>
                  <div style={S.pkgPrice}>KES {pkg.price % 1 === 0 ? pkg.price.toFixed(0) : pkg.price.toFixed(2)}</div>
                  {pkg.speed_limit && (
                    <div style={S.pkgFeature}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00c896" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {pkg.speed_limit}
                    </div>
                  )}
                  <div style={S.pkgFeature}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {formatDurationLong(pkg.duration_minutes)} access
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payment ── */}
        {step === "payment" && selectedPkg && (
          <div className="fade-in">
            <div style={S.card}>
              {/* Selected package summary */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px", background: "rgba(108,99,255,0.1)", borderRadius: 12, marginBottom: 20, border: "1px solid rgba(108,99,255,0.2)" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#6c63ff,#00c896)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>{selectedPkg.name}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{formatDurationLong(selectedPkg.duration_minutes)}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#a89fff" }}>KES {selectedPkg.price}</div>
              </div>

              <label style={S.inputLabel}>Safaricom phone number</label>
              <input
                style={S.input}
                type="tel"
                placeholder="07XX XXX XXX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePayment()}
              />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>You'll receive an M-Pesa STK push on this number</div>

              {error && <div style={S.error}>{error}</div>}

              <div style={S.btnRow}>
                <button style={S.btnSecondary} onClick={() => { setStep("packages"); setError(""); }}>← Back</button>
                <button
                  style={{ ...S.btnPrimary, margin: 0, flex: 1, opacity: (loading || !phone.trim()) ? 0.5 : 1 }}
                  onClick={handlePayment}
                  disabled={loading || !phone.trim()}
                >
                  {loading ? "Sending prompt…" : `Pay KES ${selectedPkg.price}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Waiting ── */}
        {step === "waiting" && (
          <div className="fade-in" style={S.card}>
            <div style={S.spinnerWrap}>
              <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", border: "2px solid rgba(108,99,255,0.3)", animation: "ping 2s ease-out infinite" }} />
                <div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", border: "2px solid rgba(108,99,255,0.2)", animation: "ping 2s ease-out infinite 0.4s" }} />
                <div style={S.pulse}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Waiting for Payment</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Enter your M-Pesa PIN on your phone</div>
              </div>
            </div>

            {[
              { label: "STK push sent to your phone", done: true, color: "#00c896" },
              { label: "Enter your M-Pesa PIN when prompted", done: false, color: "#6c63ff" },
              { label: "Access code generated automatically", done: false, color: "#6c63ff" },
            ].map((item, i) => (
              <div key={i} style={S.infoRow}>
                <div style={{ ...S.dot, background: item.done ? item.color : "rgba(255,255,255,0.15)" }} />
                <span style={{ fontSize: 13, color: item.done ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)" }}>{item.label}</span>
              </div>
            ))}

            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "2px solid rgba(108,99,255,0.6)", borderTopColor: "#6c63ff", animation: "spin 0.9s linear infinite", marginRight: 6, verticalAlign: "middle" }} />
              Checking payment status{pollCount > 0 ? ` · ${pollCount * 3}s` : ""}
            </div>
          </div>
        )}

        {/* ── Connecting ── */}
        {step === "connecting" && (
          <div className="fade-in" style={S.card}>
            <div style={S.spinnerWrap}>
              <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", border: "2px solid rgba(0,200,150,0.3)", animation: "ping 1.5s ease-out infinite" }} />
                <div style={{ ...S.pulse, background: "linear-gradient(135deg,#00c896,#6c63ff)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                    <circle cx="12" cy="20" r="1" fill="#fff" stroke="none"/>
                  </svg>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Connecting to WiFi…</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Authenticating with the network</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#6c63ff", borderRightColor: "#00c896", animation: "spin 0.9s linear infinite" }} />
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {step === "success" && (
          <div className="fade-in">
            <div style={S.card}>
              <div style={S.spinnerWrap}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg,#00c896,#6c63ff)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {mikrotikDetected ? "You're Connected! 🎉" : "Payment Successful! 🎉"}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
                    {mikrotikDetected
                      ? "Your device has been authenticated — enjoy browsing!"
                      : "Use the code below to log in to the WiFi network"}
                  </div>
                </div>
              </div>

              <div style={S.codeBox}>
                <div style={S.codeLabel}>Your Access Code</div>
                <div style={S.codeValue}>{voucherCode}</div>
                <button
                  onClick={() => { navigator.clipboard.writeText(voucherCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  style={{ background: "none", border: "none", color: copied ? "#00c896" : "rgba(255,255,255,0.35)", fontSize: 12, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", gap: 5, margin: "10px auto 0" }}
                >
                  {copied
                    ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                    : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy code</>
                  }
                </button>
              </div>

              {mikrotikDetected ? (
                <div style={{ ...S.infoRow, justifyContent: "center", background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.2)" }}>
                  <div style={{ ...S.dot, background: "#00c896" }} />
                  <span style={{ fontSize: 13, color: "#00c896" }}>Auto-connected via captive portal</span>
                </div>
              ) : (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>How to connect:</div>
                  {["Select the WiFi network", "Enter the code above as username", "Use same code as password", "Tap Connect / Login"].map((step, i) => (
                    <div key={i} style={S.infoRow}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(108,99,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#a89fff", flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{step}</span>
                    </div>
                  ))}
                </div>
              )}

              <button style={{ ...S.btnSecondary, width: "100%", marginTop: 16, textAlign: "center" as const }} onClick={reset}>
                ↩ Buy Another Package
              </button>
            </div>
          </div>
        )}

        {/* ── Failed ── */}
        {step === "failed" && (
          <div className="fade-in" style={S.card}>
            <div style={S.spinnerWrap}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,80,80,0.15)", border: "2px solid rgba(255,80,80,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff8080" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>Payment Failed</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 6, maxWidth: 280, margin: "6px auto 0" }}>{failureReason}</div>
              </div>
            </div>
            <div style={S.btnRow}>
              <button style={{ ...S.btnPrimary, margin: 0, flex: 1 }} onClick={() => { setStep("payment"); setFailureReason(""); }}>Try Again</button>
              <button style={S.btnSecondary} onClick={reset}>Change Plan</button>
            </div>
          </div>
        )}
      </div>

      <p style={S.brand}>Powered by M-Pesa · Daraja API</p>
      <SupportChat />
    </div>
  );
}
