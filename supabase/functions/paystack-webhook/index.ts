import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer))
  .map((value) => value.toString(16).padStart(2, "0"))
  .join("");

async function signPayload(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");
    const payload = JSON.parse(rawBody || "{}");
    const reference = payload?.data?.reference;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let expectedSecret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    if (reference) {
      const { data: transaction } = await supabase
        .from("payment_transactions")
        .select("gateway_id")
        .eq("provider_id", "paystack")
        .eq("provider_reference", reference)
        .maybeSingle();

      if (transaction?.gateway_id) {
        const { data: gateway } = await supabase
          .from("tenant_payment_gateways")
          .select("config")
          .eq("id", transaction.gateway_id)
          .maybeSingle();

        const gatewayConfig = gateway?.config && typeof gateway.config === "object" ? gateway.config as Record<string, unknown> : {};
        if (typeof gatewayConfig.secret_key === "string" && gatewayConfig.secret_key.trim()) {
          expectedSecret = gatewayConfig.secret_key.trim();
        }
      }
    }

    if (!expectedSecret || !signature) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const computedSignature = await signPayload(expectedSecret, rawBody);
    if (computedSignature !== signature) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transaction } = await supabase
      .from("payment_transactions")
      .select("id")
      .eq("provider_id", "paystack")
      .eq("provider_reference", reference)
      .maybeSingle();

    if (transaction?.id) {
      await supabase.from("payment_events").upsert({
        transaction_id: transaction.id,
        provider_id: "paystack",
        provider_event_id: payload?.data?.id ? String(payload.data.id) : reference,
        event_type: payload?.event || "webhook",
        status: payload?.data?.status || null,
        payload,
      }, { onConflict: "provider_id,provider_event_id" });
    }

    return new Response(JSON.stringify({ received: true }), {
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
