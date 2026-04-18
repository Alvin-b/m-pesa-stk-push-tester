import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const options: Array<Record<string, unknown>> = [];

    if (!tenantId) {
      return new Response(JSON.stringify({ options }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: gateways } = await supabase
      .from("tenant_payment_gateways")
      .select("provider_id, display_name, status, config, public_config")
      .eq("tenant_id", tenantId)
      .in("status", ["test", "active"]);

    for (const gateway of gateways ?? []) {
      const gatewayConfig = gateway?.config && typeof gateway.config === "object"
        ? gateway.config as Record<string, unknown>
        : {};

      if (gateway.provider_id === "mpesa") {
        const mpesaReady = !!(
          typeof gatewayConfig.consumer_key === "string" &&
          gatewayConfig.consumer_key.trim() &&
          typeof gatewayConfig.consumer_secret === "string" &&
          gatewayConfig.consumer_secret.trim() &&
          typeof gatewayConfig.passkey === "string" &&
          gatewayConfig.passkey.trim() &&
          typeof gatewayConfig.shortcode === "string" &&
          gatewayConfig.shortcode.trim()
        );

        if (mpesaReady) {
          options.push({
            providerId: "mpesa",
            displayName: gateway.display_name || "M-Pesa",
            flowType: "stk_push",
            requiresPhone: true,
            requiresEmail: false,
          });
        }
      }

      if (gateway.provider_id === "paystack") {
        const paystackReady = !!(
          typeof gatewayConfig.secret_key === "string" &&
          gatewayConfig.secret_key.trim()
        );

        if (paystackReady) {
          options.push({
            providerId: "paystack",
            displayName: gateway.display_name || "Paystack",
            flowType: "redirect",
            requiresPhone: true,
            requiresEmail: true,
          });
        }
      }
    }

    return new Response(JSON.stringify({ options }), {
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
