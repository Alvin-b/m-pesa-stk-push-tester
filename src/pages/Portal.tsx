import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getBackendCapabilities } from "@/lib/backend";
import { APP_BRAND, APP_PORTAL_NAME } from "@/lib/brand";
import {
  Wifi, Loader2, CheckCircle2, XCircle, Zap, KeyRound,
  ArrowLeft, Check, Smartphone, Copy, RefreshCw, Clock
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
  tenant_id?: string | null;
}

interface PaymentOption {
  providerId: "mpesa" | "paystack";
  displayName: string;
  flowType: string;
  requiresPhone: boolean;
  requiresEmail: boolean;
}

const LEGACY_PAYMENT_OPTIONS: PaymentOption[] = [
  {
    providerId: "mpesa",
    displayName: "M-Pesa",
    flowType: "stk_push",
    requiresPhone: true,
    requiresEmail: false,
  },
];

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
const LEGACY_TENANT_SLUG = "legacy-isp";
const MIKROTIK_STORAGE_KEY = "mt_params";
const DEFAULT_MIKROTIK_LOGIN_URL = "http://wifi.local/login";
const RADIUS_AUTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/radius-auth`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const getActiveCodeStorageKey = (tenantSlug?: string | null) => `active_code:${tenantSlug || LEGACY_TENANT_SLUG}`;

interface RadiusAuthResult {
  status: "accepted" | "rejected" | "unreachable";
  message: string;
  shouldForgetCode: boolean;
}

interface RadiusSyncResult {
  success: boolean;
  message?: string;
}

const DEFAULT_RADIUS_ERROR = "We couldn't verify your access code right now. Please try again.";
const INVALID_CODE_ERROR = "Invalid code. Please check your access code or M-Pesa transaction code and try again.";
const EXPIRED_CODE_ERROR = "This voucher has expired. Please buy a new package.";
const REVOKED_CODE_ERROR = "This voucher was revoked by the administrator. Please buy a new package or contact support.";
const INACTIVE_CODE_ERROR = "This saved voucher is no longer valid. Please enter a new code or buy a package.";

const getRadiusReplyMessage = (payload: Record<string, unknown> | null): string => {
  const directMessage = payload?.["Reply-Message"];
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage;
  }

  const replyMessage = payload?.["reply:Reply-Message"];
  if (typeof replyMessage === "string" && replyMessage.trim()) {
    return replyMessage;
  }

  return "";
};

const mapRadiusReplyMessage = (replyMessage: string): RadiusAuthResult => {
  const normalized = replyMessage.toLowerCase();
  if (!normalized) {
    return {
      status: "unreachable",
      message: DEFAULT_RADIUS_ERROR,
      shouldForgetCode: false,
    };
  }
  if (normalized.includes("invalid credentials")) {
    return {
      status: "rejected",
      message: INVALID_CODE_ERROR,
      shouldForgetCode: true,
    };
  }
  if (normalized.includes("expired") || normalized.includes("revoked")) {
    return {
      status: "rejected",
      message: "This voucher has expired or was revoked. Please buy a new package or contact support.",
      shouldForgetCode: true,
    };
  }
  return {
    status: "rejected",
    message: replyMessage,
    shouldForgetCode: false,
  };
};

const getVoucherLifecycleMessage = (status?: string | null, expired = false): string => {
  if (status === "revoked") return REVOKED_CODE_ERROR;
  if (status === "expired" || expired) return EXPIRED_CODE_ERROR;
  return "";
};

const validateRadiusCode = async (code: string, tenantId?: string | null): Promise<RadiusAuthResult> => {
  try {
    const response = await fetch(RADIUS_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ username: code, password: code, tenantId }),
    });

    let payload: Record<string, unknown> | null = null;
    try {
      const json = await response.json();
      if (json && typeof json === "object") {
        payload = json as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }

    if (response.ok && payload?.["control:Auth-Type"] === "Accept") {
      return { status: "accepted", message: "", shouldForgetCode: false };
    }

    const replyMessage = getRadiusReplyMessage(payload);
    if (replyMessage) {
      return mapRadiusReplyMessage(replyMessage);
    }

    if (!response.ok) {
      return {
        status: "rejected",
        message: INVALID_CODE_ERROR,
        shouldForgetCode: true,
      };
    }

    return { status: "unreachable", message: DEFAULT_RADIUS_ERROR, shouldForgetCode: false };
  } catch (error) {
    console.error("radius-auth failed:", error);
    return { status: "unreachable", message: DEFAULT_RADIUS_ERROR, shouldForgetCode: false };
  }
};

const syncVoucherRadius = async (code: string, tenantId?: string | null): Promise<RadiusSyncResult> => {
  const { data, error } = await supabase.functions.invoke("sync-voucher-radius", {
    body: { code, tenantId },
  });

  if (error) {
    console.error("sync-voucher-radius failed:", error);
    return { success: false, message: "We found your voucher, but couldn't sync it with the network right now." };
  }

  if (data?.success) {
    return { success: true };
  }

  return {
    success: false,
    message: typeof data?.error === "string" && data.error.trim()
      ? data.error
      : "We found your voucher, but couldn't sync it with the network right now.",
  };
};

const findVoucherByCodeOrReceipt = async (value: string, statuses?: string[], tenantId?: string | null) => {
  let query = supabase
    .from("vouchers")
    .select("*, packages(*)")
    .eq("code", value);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  if (statuses?.length) {
    query = query.in("status", statuses);
  }

  let { data: voucher } = await query.maybeSingle();

  if (!voucher) {
    let checkoutQuery = supabase
      .from("vouchers")
      .select("*, packages(*)")
      .eq("checkout_request_id", value);

    if (tenantId) {
      checkoutQuery = checkoutQuery.eq("tenant_id", tenantId);
    }

    if (statuses?.length) {
      checkoutQuery = checkoutQuery.in("status", statuses);
    }

    const { data: checkoutVoucher } = await checkoutQuery.maybeSingle();
    voucher = checkoutVoucher;
  }

  if (!voucher) {
    let receiptQuery = supabase
      .from("vouchers")
      .select("*, packages(*)")
      .eq("mpesa_receipt", value);

    if (tenantId) {
      receiptQuery = receiptQuery.eq("tenant_id", tenantId);
    }

    if (statuses?.length) {
      receiptQuery = receiptQuery.in("status", statuses);
    }

    const { data: receiptVoucher } = await receiptQuery.maybeSingle();
    voucher = receiptVoucher;
  }

  return voucher;
};

/* ============================
   MIKROTIK HELPERS — persistent params
============================ */
const hasMikroTikHints = (search: string) => {
  const params = new URLSearchParams(search);
  return (
    params.has("from-mikrotik") ||
    params.has("link-login-only") ||
    params.has("link-login") ||
    params.has("chap-id") ||
    params.has("chap-challenge") ||
    params.has("mac") ||
    params.has("link-orig") ||
    params.has("link-redirect") ||
    params.has("dst") ||
    params.has("popup")
  );
};

const saveParams = () => {
  const search = window.location.search;
  if (hasMikroTikHints(search)) {
    sessionStorage.setItem(MIKROTIK_STORAGE_KEY, search);
  }
};

const getParams = () => {
  let search = window.location.search;
  const saved = sessionStorage.getItem(MIKROTIK_STORAGE_KEY);
  if (!hasMikroTikHints(search) && saved) {
    search = saved;
  }
  const p = new URLSearchParams(search);
  return {
    loginOnly: p.get("link-login-only") || "",
    login: p.get("link-login") || "",
    orig: p.get("link-orig") || p.get("link-redirect") || p.get("dst") || "",
    mac: p.get("mac") || "",
    ip: p.get("ip") || "",
    chapId: p.get("chap-id") || "",
    chapChallenge: p.get("chap-challenge") || "",
    popup: p.get("popup") || "",
    fromMikroTik: p.get("from-mikrotik") === "1",
  };
};

const loginMikroTik = (code: string) => {
  const mt = getParams();
  const loginTarget = mt.loginOnly || mt.login || DEFAULT_MIKROTIK_LOGIN_URL;
  let loginUrl: URL;
  try {
    loginUrl = new URL(loginTarget);
  } catch (error) {
    console.warn("Invalid MikroTik login URL, falling back to default:", loginTarget, error);
    loginUrl = new URL(DEFAULT_MIKROTIK_LOGIN_URL);
  }
  loginUrl.searchParams.set("username", code);
  loginUrl.searchParams.set("password", code);
  loginUrl.searchParams.set("autologin", "1");
  if (mt.orig) loginUrl.searchParams.set("dst", mt.orig);
  if (mt.mac) loginUrl.searchParams.set("mac", mt.mac);
  if (mt.chapId) loginUrl.searchParams.set("chap-id", mt.chapId);
  if (mt.chapChallenge) loginUrl.searchParams.set("chap-challenge", mt.chapChallenge);
  loginUrl.searchParams.set("popup", "false");
  setTimeout(() => {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = loginUrl.toString();
        return;
      }
    } catch (error) {
      console.warn("Unable to access top window, falling back to local redirect:", error);
    }
    window.location.href = loginUrl.toString();
  }, 1000);
};

/* ============================
   COMPONENT
============================ */
const Portal = () => {
  const { tenantSlug } = useParams();
  const scopedTenantSlug = tenantSlug || LEGACY_TENANT_SLUG;
  const activeCodeStorageKey = getActiveCodeStorageKey(scopedTenantSlug);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [step, setStep] = useState<Step>("packages");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [accessInput, setAccessInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [error, setError] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [mikrotikDetected, setMikrotikDetected] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [tenantName, setTenantName] = useState(APP_PORTAL_NAME);
  const [tenantPortalId, setTenantPortalId] = useState<string | null>(null);
  const [tenantResolved, setTenantResolved] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<PaymentOption["providerId"]>("mpesa");

  /* Init — save params, detect MikroTik, auto-reconnect, cleanup expired */
  useEffect(() => {
    saveParams();
    const mt = getParams();
    if (mt.loginOnly || mt.login || mt.fromMikroTik) setMikrotikDetected(true);

    // Trigger cleanup of expired sessions (fire-and-forget)
    supabase.functions.invoke("cleanup-expired", { body: {} }).catch(() => {});

    void (async () => {
      const capabilities = await getBackendCapabilities();
      const multitenantEnabled = capabilities.multitenant;
      let resolvedTenantId: string | null = null;
      let resolvedTenantName = APP_PORTAL_NAME;

      if (multitenantEnabled) {
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .select("id, name, portal_title")
          .eq("slug", scopedTenantSlug)
          .maybeSingle();

        if (tenantError) {
          console.error("Failed to resolve tenant portal:", tenantError);
        }

        const resolvedTenant = tenant as { id: string; name: string; portal_title?: string | null } | null;
        if (resolvedTenant) {
          resolvedTenantId = resolvedTenant.id;
          resolvedTenantName = resolvedTenant.portal_title || resolvedTenant.name || APP_PORTAL_NAME;
        }

        if (!resolvedTenantId) {
          setTenantResolved(false);
          setTenantPortalId(null);
          setTenantName(tenantSlug ? "Portal Not Found" : APP_PORTAL_NAME);
          setPackages([]);
          setPaymentOptions([]);
          setError(
            tenantSlug
              ? "This ISP portal could not be found. Please use the exact portal link shared by the ISP."
              : "Choose a valid ISP portal link to browse packages and pay."
          );
          setStep("packages");
          return;
        }

        setTenantResolved(true);
        setTenantPortalId(resolvedTenantId);
        setTenantName(resolvedTenantName);
        setError("");

        const { data: paymentOptionData } = await supabase.functions.invoke("list-payment-options", {
          body: { tenantId: resolvedTenantId },
        });
        const resolvedPaymentOptions = (paymentOptionData?.options as PaymentOption[] | undefined) || [];
        setPaymentOptions(resolvedPaymentOptions);
        if (resolvedPaymentOptions.length > 0) {
          setSelectedProvider(resolvedPaymentOptions[0].providerId);
        }
      } else {
        setTenantResolved(true);
        setTenantPortalId(null);
        setTenantName(APP_PORTAL_NAME);
        setError("");
        setPaymentOptions(LEGACY_PAYMENT_OPTIONS);
        setSelectedProvider("mpesa");
      }

      let packagesQuery = supabase
        .from("packages")
        .select("*")
        .eq("is_active", true)
        .order("price");
      if (multitenantEnabled && resolvedTenantId) {
        packagesQuery = packagesQuery.eq("tenant_id", resolvedTenantId);
      }

      const { data, error: packageError } = await packagesQuery;
      if (packageError) {
        console.error("Failed to load portal packages:", packageError);
      }
      setPackages((data as Package[]) || []);

      const queryParams = new URLSearchParams(window.location.search);
      const paystackReference = queryParams.get("reference") || queryParams.get("trxref");
      const paystackStatus = queryParams.get("status");

      if (multitenantEnabled && paystackReference && (!paystackStatus || paystackStatus === "success")) {
        setSelectedProvider("paystack");
        setStep("waiting");
        setLoading(true);

        const { data: verifyData, error: verifyError } = await supabase.functions.invoke("paystack-verify", {
          body: { reference: paystackReference, tenantId: resolvedTenantId },
        });

        if (verifyError || verifyData?.error || !verifyData?.success) {
          setLoading(false);
          setStep("failed");
          setFailureReason(
            verifyError?.message ||
            verifyData?.error ||
            "We couldn't confirm your Paystack payment yet. If you were charged, contact support.",
          );
        } else if (verifyData?.code) {
          setLoading(false);
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("reference");
          nextUrl.searchParams.delete("trxref");
          nextUrl.searchParams.delete("status");
          window.history.replaceState({}, "", nextUrl.toString());
          await connectUser(verifyData.code);
          return;
        }

        return;
      }

      const stored =
        localStorage.getItem(activeCodeStorageKey) ||
        (scopedTenantSlug === LEGACY_TENANT_SLUG ? localStorage.getItem("active_code") : null);

      if (!stored || (!mt.loginOnly && !mt.login && !mt.fromMikroTik)) {
        return;
      }

      const voucher = await findVoucherByCodeOrReceipt(stored, undefined, resolvedTenantId);
      const status = voucher?.status as string | undefined;
      const expiresAtValue = typeof voucher?.expires_at === "string" ? voucher.expires_at : null;
      const expired = expiresAtValue ? new Date(expiresAtValue) < new Date() : false;
      const lifecycleMessage = getVoucherLifecycleMessage(status, expired);

      if (!voucher || status === "revoked" || status === "expired" || expired) {
        localStorage.removeItem(activeCodeStorageKey);
        localStorage.removeItem("active_code");
        setError(lifecycleMessage || INACTIVE_CODE_ERROR);
        setStep("packages");
        return;
      }

      const radiusCheck = await validateRadiusCode(stored, resolvedTenantId);
      if (radiusCheck.status !== "accepted") {
        if (radiusCheck.shouldForgetCode || radiusCheck.status === "rejected") {
          localStorage.removeItem(activeCodeStorageKey);
          localStorage.removeItem("active_code");
        }
        setError(lifecycleMessage || radiusCheck.message || DEFAULT_RADIUS_ERROR);
        setStep("packages");
        return;
      }

      if (expiresAtValue) {
        setExpiresAt(new Date(expiresAtValue));
      }

      loginMikroTik(stored);
    })();
  }, [activeCodeStorageKey, scopedTenantSlug]);

  /* Session countdown timer */
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const diff = expiresAt.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expired");
        localStorage.removeItem(activeCodeStorageKey);
        localStorage.removeItem("active_code");
        clearInterval(interval);
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (hours > 0) setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      else setTimeLeft(`${mins}m ${secs}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCodeStorageKey, expiresAt]);

  /* ============================
     CONNECT USER — core logic with MAC binding
  ============================ */
  const connectUser = async (voucher: string) => {
    const mt = getParams();

    // MAC binding check
    if (mt.mac) {
      let existingQuery = supabase
        .from("vouchers")
        .select("mac_address")
        .eq("code", voucher);

      if (tenantPortalId) {
        existingQuery = existingQuery.eq("tenant_id", tenantPortalId);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing?.mac_address && existing.mac_address !== mt.mac) {
        setError("This voucher is already used on another device.");
        setStep("packages");
        setLoading(false);
        return;
      }

      // Save MAC address to voucher
      let updateQuery = supabase
        .from("vouchers")
        .update({ mac_address: mt.mac })
        .eq("code", voucher);

      if (tenantPortalId) {
        updateQuery = updateQuery.eq("tenant_id", tenantPortalId);
      }

      await updateQuery;
    }

    // Get expiry for countdown
    let voucherQuery = supabase
      .from("vouchers")
      .select("expires_at")
      .eq("code", voucher);

    if (tenantPortalId) {
      voucherQuery = voucherQuery.eq("tenant_id", tenantPortalId);
    }

    const { data: voucherData } = await voucherQuery.maybeSingle();

    if (voucherData?.expires_at) {
      setExpiresAt(new Date(voucherData.expires_at));
    }

    // Store for auto-reconnect
    localStorage.setItem(activeCodeStorageKey, voucher);
    localStorage.removeItem("active_code");
    setVoucherCode(voucher);

    // Login to MikroTik
    if (mikrotikDetected) {
      setStep("connecting");
      loginMikroTik(voucher);
    } else {
      setStep("success");
    }
  };

  /* ============================
     MANUAL CODE / RECEIPT LOGIN
  ============================ */
  const handleAccessInput = async () => {
    setLoading(true);
    setError("");
    const code = accessInput.trim().toUpperCase();
    const initialRadiusCheck = await validateRadiusCode(code, tenantPortalId);

    if (initialRadiusCheck.status === "accepted") {
      setLoading(false);
      await connectUser(code);
      return;
    }

    // Try as access code first (active or pending)
    let voucher = await findVoucherByCodeOrReceipt(code, ["active", "pending"], tenantPortalId);

    if (!voucher) {
      const inactiveVoucher = await findVoucherByCodeOrReceipt(code, undefined, tenantPortalId);
      const inactiveStatus = inactiveVoucher?.status as string | undefined;
      const inactiveExpired = inactiveVoucher?.expires_at
        ? new Date(inactiveVoucher.expires_at) < new Date()
        : false;
      const lifecycleMessage = getVoucherLifecycleMessage(inactiveStatus, inactiveExpired);

      if (inactiveVoucher && lifecycleMessage) {
        setError(lifecycleMessage);
        setLoading(false);
        return;
      }

      setError(initialRadiusCheck.status === "rejected" ? initialRadiusCheck.message : INVALID_CODE_ERROR);
      setLoading(false);
      return;
    }

    let resolvedCode = voucher.code;

    // If voucher is pending, activate it now (payment was confirmed but activation didn't complete)
    if (voucher.status === "pending") {
      const looksLikePaystackReference =
        !!voucher.checkout_request_id &&
        code === String(voucher.checkout_request_id).trim().toUpperCase();

      if (looksLikePaystackReference) {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke("paystack-verify", {
          body: {
            reference: voucher.checkout_request_id || code,
            tenantId: tenantPortalId,
          },
        });

        if (verifyError || !verifyData?.success) {
          setError("Your Paystack payment is still pending or could not be verified yet.");
          setLoading(false);
          return;
        }

        if (typeof verifyData?.code === "string" && verifyData.code.trim()) {
          resolvedCode = verifyData.code.trim().toUpperCase();
        }
      } else {
        const { data: confirmData, error: confirmErr } = await supabase.functions.invoke("confirm-payment", {
          body: { checkoutRequestId: voucher.checkout_request_id || code, mpesaReceipt: voucher.mpesa_receipt, tenantId: tenantPortalId },
        });
        if (confirmErr || !confirmData?.success) {
          setError("Failed to activate your voucher. Please try again or contact support.");
          setLoading(false);
          return;
        }

        if (typeof confirmData?.code === "string" && confirmData.code.trim()) {
          resolvedCode = confirmData.code.trim().toUpperCase();
        }
      }
    }

    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      setError("This code has expired. Please purchase a new package.");
      setLoading(false);
      return;
    }

      const radiusCheck = resolvedCode === code && voucher.status !== "pending"
      ? initialRadiusCheck
      : await validateRadiusCode(resolvedCode, tenantPortalId);

    let finalRadiusCheck = radiusCheck;
    if (finalRadiusCheck.status === "rejected") {
      const syncResult = await syncVoucherRadius(resolvedCode, tenantPortalId);
      if (syncResult.success) {
        finalRadiusCheck = await validateRadiusCode(resolvedCode, tenantPortalId);
      } else if (voucher.status === "active") {
        setError(syncResult.message || "We found your voucher, but couldn't sync it with the network right now.");
        setLoading(false);
        return;
      }
    }

    if (finalRadiusCheck.status === "rejected") {
      setError(finalRadiusCheck.message || DEFAULT_RADIUS_ERROR);
      setLoading(false);
      return;
    }

    setLoading(false);
    await connectUser(resolvedCode);
  };

  /* ============================
     PAYMENT FLOW
  ============================ */
  const handleMpesaPayment = async () => {
    if (!selectedPkg || !phone) return;
    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("mpesa-stk-push", {
        body: { phone, amount: selectedPkg.price, packageId: selectedPkg.id, tenantId: tenantPortalId },
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

      setStep("waiting");
      setLoading(false);
      setPollCount(0);

      let attempts = 0;
      const maxAttempts = 40;
      const poll = setInterval(async () => {
        attempts++;
        setPollCount(attempts);

        const { data: queryData } = await supabase.functions.invoke("daraja-stk-query", {
          body: { checkoutRequestId, tenantId: tenantPortalId },
        });

        const resultCode = queryData?.resultCode;

        if (PROCESSING_CODES.has(resultCode)) return;

        if (queryData?.success === true || resultCode === 0 || resultCode === "0") {
          clearInterval(poll);

          // Activate voucher & create RADIUS credentials via confirm-payment
          const mpesaReceipt = queryData?.data?.CallbackMetadata?.Item?.find(
            (i: any) => i.Name === "MpesaReceiptNumber"
          )?.Value || queryData?.data?.MpesaReceiptNumber || null;

          const { data: confirmRes, error: confirmErr } = await supabase.functions.invoke("confirm-payment", {
            body: { checkoutRequestId, mpesaReceipt, tenantId: tenantPortalId },
          });

          console.log("confirm-payment result:", confirmRes, confirmErr);

          const code = confirmRes?.code;
          if (code) {
            await connectUser(code);
          } else {
            // Fallback: look up voucher
            let voucherLookup = supabase
              .from("vouchers")
              .select("code")
              .eq("checkout_request_id", checkoutRequestId);

            if (tenantPortalId) {
              voucherLookup = voucherLookup.eq("tenant_id", tenantPortalId);
            }

            const { data: voucher } = await voucherLookup.maybeSingle();
            if (voucher?.code) {
              await connectUser(voucher.code);
            } else {
              setVoucherCode("CHECK ADMIN");
              setStep("success");
            }
          }
          return;
        }

        if (resultCode !== undefined && !PROCESSING_CODES.has(resultCode)) {
          const codeStr = String(resultCode);
          const reason = FAILURE_CODES[codeStr] || queryData?.meaning || "Payment was not completed. Please try again.";
          clearInterval(poll);
          setFailureReason(reason);
          setStep("failed");
          return;
        }

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

  const handlePaystackPayment = async () => {
    if (!selectedPkg || !phone || !email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const callbackUrl = `${window.location.origin}/portal/${scopedTenantSlug}`;
      const { data, error: fnError } = await supabase.functions.invoke("paystack-initiate", {
        body: {
          email: email.trim(),
          phone,
          amount: selectedPkg.price,
          packageId: selectedPkg.id,
          tenantId: tenantPortalId,
          callbackUrl,
        },
      });

      if (fnError || data?.error || !data?.authorizationUrl) {
        setError(fnError?.message || data?.error || "Unable to start Paystack checkout");
        setLoading(false);
        return;
      }

      try {
        if (window.top && window.top !== window) {
          window.top.location.href = data.authorizationUrl as string;
          return;
        }
      } catch (error) {
        console.warn("Unable to access top window for Paystack redirect:", error);
      }
      window.location.href = data.authorizationUrl as string;
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (selectedProvider === "paystack") {
      await handlePaystackPayment();
      return;
    }

    await handleMpesaPayment();
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
    setEmail("");
    setError("");
    setFailureReason("");
    setPollCount(0);
    setExpiresAt(null);
    setTimeLeft("");
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
      <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background/95 backdrop-blur-sm" />

      {/* Header */}
      <div className="relative z-10 text-center pt-10 pb-6 px-4">
        <p className="mb-3 text-[11px] font-mono uppercase tracking-[0.35em] text-primary">{APP_BRAND}</p>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-4 shadow-xl shadow-primary/25">
          <Wifi className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          {tenantName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5 max-w-xs mx-auto">
          Fast, reliable internet — connect in seconds
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative z-10 px-4 pb-8">

        {/* ── Packages Step ── */}
        {step === "packages" && (
          <div className="max-w-lg mx-auto space-y-6 mt-2">
            {/* Code input */}
            <Card className="border-primary/20 bg-card/95 backdrop-blur-md shadow-xl shadow-primary/10 overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-primary to-accent" />
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Already have a code?</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter access code, M-Pesa receipt, or Paystack reference"
                    value={accessInput}
                    onChange={(e) => setAccessInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAccessInput()}
                    className="font-mono bg-secondary/50 h-12 border-border text-sm tracking-wide uppercase"
                  />
                  <Button
                    onClick={handleAccessInput}
                    disabled={!accessInput.trim() || loading}
                    className="h-12 px-6 font-semibold shrink-0 bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 shadow-md shadow-primary/20"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
                  </Button>
                </div>
                {error && (
                  <p className="text-destructive text-xs font-mono bg-destructive/10 rounded-lg px-3 py-2 mt-2">{error}</p>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center gap-3 px-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">or choose a plan</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Plans */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className="cursor-pointer border-border hover:border-primary/40 bg-card/95 backdrop-blur-md transition-all duration-200 hover:shadow-xl hover:shadow-primary/15 hover:-translate-y-1 group overflow-hidden"
                  onClick={() => {
                    setSelectedPkg(pkg);
                    setStep("payment");
                    setError("");
                  }}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center group-hover:from-primary/25 group-hover:to-accent/25 transition-colors">
                        <Zap className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                        {formatDuration(pkg.duration_minutes)}
                      </span>
                    </div>
                    <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors capitalize">
                      {pkg.name}
                    </h3>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-foreground">KES {pkg.price % 1 === 0 ? pkg.price.toFixed(0) : pkg.price.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                      {getFeatures(pkg).map((feature, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-primary shrink-0" />
                          <span className="text-[11px] text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {tenantResolved && packages.length === 0 && (
              <Card className="border-border bg-card/95 backdrop-blur-md">
                <CardContent className="p-5 text-center">
                  <p className="text-sm font-semibold text-foreground">No packages published yet for this ISP.</p>
                  <p className="mt-2 text-sm text-muted-foreground">The ISP admin needs to add packages before customers can buy access.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Payment Step ── */}
        {step === "payment" && selectedPkg && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/10">
              <CardContent className="p-6 space-y-5">
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
                  <label className="text-sm font-medium text-foreground">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentOptions.map((option) => (
                      <Button
                        key={option.providerId}
                        type="button"
                        variant={selectedProvider === option.providerId ? "default" : "outline"}
                        onClick={() => setSelectedProvider(option.providerId)}
                        className={`justify-center ${selectedProvider === option.providerId ? "bg-gradient-to-r from-primary to-accent text-white" : ""}`}
                      >
                        {option.displayName}
                      </Button>
                    ))}
                  </div>
                  {paymentOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No payment gateways are configured for this ISP yet.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {selectedProvider === "paystack" ? "Phone Number" : "Safaricom Phone Number"}
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
                    {selectedProvider === "paystack"
                      ? "We use this to prefill your Paystack checkout details."
                      : "You'll receive an M-Pesa prompt on this number."}
                  </p>
                </div>

                {selectedProvider === "paystack" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Email Address</label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handlePayment()}
                      className="bg-secondary/50 h-12 text-base border-border focus:border-primary"
                    />
                    <p className="text-xs text-muted-foreground">Paystack requires an email to open the checkout page.</p>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-destructive text-sm">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setStep("packages"); setError(""); }} className="font-mono border-border hover:bg-secondary/80">
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button
                    onClick={handlePayment}
                    disabled={paymentOptions.length === 0 || loading || !phone.trim() || (selectedProvider === "paystack" && !email.trim())}
                    className="flex-1 font-semibold h-12 text-base bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white shadow-lg shadow-primary/20"
                  >
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {selectedProvider === "paystack" ? "Opening checkout…" : "Sending prompt…"}</>
                    ) : (
                      <><Smartphone className="mr-2 h-4 w-4" /> {selectedProvider === "paystack" ? `Continue to Paystack` : `Pay KES ${selectedPkg.price}`}</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Waiting Step ── */}
        {step === "waiting" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/10">
              <CardContent className="py-12 text-center space-y-6">
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
                    {selectedProvider === "paystack"
                      ? "Confirming your Paystack payment and preparing your access code"
                      : "Check your phone and enter your M-Pesa PIN"}
                  </p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-4 text-left space-y-3">
                  {(selectedProvider === "paystack"
                    ? [
                        { label: "Payment detected from Paystack", done: true },
                        { label: "Verifying the transaction", done: false },
                        { label: "Activating your WiFi access", done: false },
                      ]
                    : [
                        { label: "STK push sent to your phone", done: true },
                        { label: "Enter your M-Pesa PIN when prompted", done: false },
                        { label: "Auto-connect after payment", done: false },
                      ]).map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${item.done ? "bg-primary text-primary-foreground" : "bg-muted border-2 border-border"}`}>
                        {item.done ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}
                      </div>
                      <span className={`text-sm ${item.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {selectedProvider === "paystack" ? "Verifying payment status" : "Checking payment status"}
                  {pollCount > 0 && <span className="opacity-60">({pollCount * 3}s)</span>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Connecting Step ── */}
        {step === "connecting" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/10">
              <CardContent className="py-12 text-center space-y-6">
                <div className="relative flex items-center justify-center mx-auto w-28 h-28">
                  <div className="absolute w-28 h-28 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: "1.5s" }} />
                  <div className="absolute w-20 h-20 rounded-full bg-primary/15 animate-ping" style={{ animationDuration: "1.5s", animationDelay: "0.2s" }} />
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30">
                    <Wifi className="h-7 w-7 text-white animate-pulse" />
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Connecting to WiFi...</h2>
                  <p className="text-muted-foreground text-sm mt-2">Authenticating with the network</p>
                </div>
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Success Step ── */}
        {step === "success" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl shadow-primary/10 overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-primary to-accent" />
              <CardContent className="py-10 text-center space-y-5">
                <div className="relative flex items-center justify-center mx-auto w-20 h-20">
                  <div className="absolute w-20 h-20 rounded-full bg-primary/10" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                    <CheckCircle2 className="h-8 w-8 text-white" />
                  </div>
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-foreground">
                    {mikrotikDetected ? "You're Connected! 🎉" : "Payment Successful! 🎉"}
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {mikrotikDetected
                      ? "Your device has been authenticated — enjoy the internet!"
                      : "Use the credentials below to log in to the WiFi network"}
                  </p>
                </div>

                {/* Session countdown */}
                {timeLeft && (
                  <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-2">
                    <Clock className="h-4 w-4 text-accent" />
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {timeLeft === "Expired" ? "Session Expired" : `Expires in: ${timeLeft}`}
                    </span>
                  </div>
                )}

                {/* Voucher code box */}
                <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl p-5 border-2 border-primary/20">
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-2">Your Access Code</p>
                  <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">{voucherCode}</p>
                  <Button variant="ghost" size="sm" onClick={handleCopyCode} className="mt-3 text-xs text-muted-foreground hover:text-primary gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy code"}
                  </Button>
                </div>

                {mikrotikDetected ? (
                  <div className="bg-primary/5 rounded-xl p-4 text-center">
                    <p className="text-sm text-foreground font-medium">✅ Auto-connected via captive portal</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      If you still can't browse, try opening a new tab or refreshing.
                    </p>
                  </div>
                ) : (
                  <div className="bg-secondary/50 rounded-xl p-4 text-left">
                    <p className="text-sm font-semibold text-foreground mb-2">How to connect:</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Select the WiFi network</li>
                      <li>Enter the code above as your <strong>username</strong></li>
                      <li>Enter the same code as your <strong>password</strong></li>
                      <li>Click Connect / Login</li>
                    </ol>
                  </div>
                )}

                <Button variant="outline" onClick={resetToPackages} className="w-full border-border hover:bg-secondary/80">
                  <RefreshCw className="h-4 w-4 mr-2" /> Buy Another Package
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Failed Step ── */}
        {step === "failed" && (
          <div className="max-w-md mx-auto mt-4">
            <Card className="border-border bg-card/90 backdrop-blur shadow-xl overflow-hidden">
              <div className="h-2 bg-destructive" />
              <CardContent className="py-10 text-center space-y-5">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Payment Failed</h2>
                  <p className="text-muted-foreground text-sm mt-2 max-w-xs mx-auto">{failureReason}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={() => { setStep("payment"); setFailureReason(""); }}
                    className="flex-1 bg-gradient-to-r from-primary to-accent text-white hover:opacity-90"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" /> Try Again
                  </Button>
                  <Button variant="outline" onClick={resetToPackages} className="flex-1 border-border">
                    Change Package
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <p className="relative z-10 text-center text-[10px] text-muted-foreground pb-4">
          Powered by {APP_BRAND}, M-Pesa, Paystack, and your Mikrotik billing cloud
      </p>
      <div className="relative z-10">
      <SupportChat tenantId={tenantPortalId} />
      </div>
    </div>
  );
};

export default Portal;
