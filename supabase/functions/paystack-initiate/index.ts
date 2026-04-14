import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateUniqueVoucherCode } from "../_shared/vouchers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, phone, amount, packageId, tenantId, callbackUrl } = await req.json();

    if (!email || !amount || !packageId || !callbackUrl) {
      return new Response(JSON.stringify({ error: "email, amount, packageId, and callbackUrl are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    let gatewayId: string | null = null;

    if (tenantId) {
      const { data: gateway } = await supabase
        .from("tenant_payment_gateways")
        .select("id, config, status")
        .eq("tenant_id", tenantId)
        .eq("provider_id", "paystack")
        .in("status", ["test", "active"])
        .maybeSingle();

      const gatewayConfig = gateway?.config && typeof gateway.config === "object" ? gateway.config as Record<string, unknown> : {};
      if (typeof gatewayConfig.secret_key === "string" && gatewayConfig.secret_key.trim()) {
        secretKey = gatewayConfig.secret_key.trim();
      }
      gatewayId = gateway?.id || null;
    }

    if (!secretKey) {
      return new Response(JSON.stringify({ error: "Paystack is not configured for this tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let packageQuery = supabase
      .from("packages")
      .select("id, duration_minutes, tenant_id")
      .eq("id", packageId);

    if (tenantId) {
      packageQuery = packageQuery.eq("tenant_id", tenantId);
    }

    const { data: pkg, error: pkgError } = await packageQuery.single();
    if (pkgError || !pkg) {
      throw new Error("Package not found for this ISP portal");
    }

    const reference = crypto.randomUUID();
    const internalReference = crypto.randomUUID();
    const sessionTimeout = pkg.duration_minutes ? pkg.duration_minutes * 60 : 3600;
    const code = await generateUniqueVoucherCode(supabase);

    const { data: voucher, error: voucherError } = await supabase.from("vouchers").insert({
      code,
      package_id: packageId,
      phone_number: String(phone || "PAYSTACK"),
      checkout_request_id: reference,
      status: "pending",
      session_timeout: sessionTimeout,
      tenant_id: tenantId || pkg.tenant_id || null,
    }).select("id, tenant_id").single();

    if (voucherError) {
      throw voucherError;
    }

    const transactionTenantId = tenantId || pkg.tenant_id || voucher?.tenant_id || null;
    if (!transactionTenantId) {
      throw new Error("Unable to resolve tenant for this payment");
    }

    const { error: paymentError } = await supabase.from("payment_transactions").insert({
      tenant_id: transactionTenantId,
      gateway_id: gatewayId,
      provider_id: "paystack",
      package_id: packageId,
      voucher_id: voucher?.id ?? null,
      internal_reference: internalReference,
      provider_checkout_id: null,
      provider_reference: reference,
      customer_phone: phone || null,
      customer_email: email,
      amount,
      currency_code: "KES",
      status: "processing",
      metadata: {
        callback_url: callbackUrl,
        package_id: packageId,
      },
    });

    if (paymentError) {
      throw paymentError;
    }

    const initializeResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: Math.round(Number(amount) * 100),
        reference,
        callback_url: callbackUrl,
        metadata: {
          tenant_id: transactionTenantId,
          voucher_id: voucher?.id ?? null,
          package_id: packageId,
        },
      }),
    });

    const initializeData = await initializeResponse.json();
    if (!initializeResponse.ok || !initializeData?.status) {
      await supabase
        .from("payment_transactions")
        .update({ status: "failed", metadata: { stage: "initialize", response: initializeData } })
        .eq("provider_id", "paystack")
        .eq("provider_reference", reference);

      return new Response(JSON.stringify({ error: "Paystack initialization failed", details: initializeData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("payment_transactions")
      .update({
        provider_checkout_id: initializeData.data?.access_code || null,
        metadata: {
          authorization_url: initializeData.data?.authorization_url || null,
        },
      })
      .eq("provider_id", "paystack")
      .eq("provider_reference", reference);

    return new Response(JSON.stringify({
      success: true,
      authorizationUrl: initializeData.data?.authorization_url,
      reference,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
