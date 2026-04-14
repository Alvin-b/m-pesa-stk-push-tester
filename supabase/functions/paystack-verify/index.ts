import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateVoucher } from "../_shared/activate-voucher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reference, tenantId } = await req.json();
    if (!reference) {
      return new Response(JSON.stringify({ error: "reference is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let transactionQuery = supabase
      .from("payment_transactions")
      .select("id, tenant_id, gateway_id, voucher_id, status, provider_reference")
      .eq("provider_id", "paystack")
      .eq("provider_reference", reference);

    if (tenantId) {
      transactionQuery = transactionQuery.eq("tenant_id", tenantId);
    }

    const { data: transaction, error: transactionError } = await transactionQuery.maybeSingle();
    if (transactionError || !transaction) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!transaction.voucher_id) {
      throw new Error("Transaction is missing voucher linkage");
    }

    let secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    if (transaction.gateway_id) {
      const { data: gateway } = await supabase
        .from("tenant_payment_gateways")
        .select("config")
        .eq("id", transaction.gateway_id)
        .maybeSingle();

      const gatewayConfig = gateway?.config && typeof gateway.config === "object" ? gateway.config as Record<string, unknown> : {};
      if (typeof gatewayConfig.secret_key === "string" && gatewayConfig.secret_key.trim()) {
        secretKey = gatewayConfig.secret_key.trim();
      }
    }

    if (!secretKey) {
      throw new Error("Paystack secret key is not configured");
    }

    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });
    const verifyData = await verifyResponse.json();

    if (!verifyResponse.ok || !verifyData?.status) {
      return new Response(JSON.stringify({ error: "Unable to verify Paystack transaction", details: verifyData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paid = verifyData.data?.status === "success";
    if (!paid) {
      await supabase
        .from("payment_transactions")
        .update({
          status: verifyData.data?.status === "abandoned" ? "cancelled" : "failed",
          metadata: {
            verify_status: verifyData.data?.status || "unknown",
          },
        })
        .eq("id", transaction.id);

      return new Response(JSON.stringify({
        success: false,
        status: verifyData.data?.status || "failed",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: voucher, error: voucherError } = await supabase
      .from("vouchers")
      .select("id, code, status, expires_at, session_timeout, packages(duration_minutes, speed_limit)")
      .eq("id", transaction.voucher_id)
      .maybeSingle();

    if (voucherError || !voucher) {
      throw new Error("Voucher not found for verified transaction");
    }

    const activation = await activateVoucher(supabase, voucher, null);

    await supabase
      .from("payment_transactions")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        voucher_id: voucher.id,
        metadata: {
          paystack_status: verifyData.data?.status,
          paid_at: verifyData.data?.paid_at || null,
          channel: verifyData.data?.channel || null,
        },
      })
      .eq("id", transaction.id);

    await supabase.from("payment_events").upsert({
      transaction_id: transaction.id,
      provider_id: "paystack",
      provider_event_id: verifyData.data?.id ? String(verifyData.data.id) : reference,
      event_type: "transaction.verify",
      status: verifyData.data?.status || "success",
      payload: verifyData,
    }, { onConflict: "provider_id,provider_event_id" });

    return new Response(JSON.stringify({
      success: true,
      code: activation.code,
      alreadyActivated: activation.alreadyActive,
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
