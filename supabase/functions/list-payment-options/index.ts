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

    const mpesaConfigured = !!(
      Deno.env.get("MPESA_CONSUMER_KEY") &&
      Deno.env.get("MPESA_CONSUMER_SECRET") &&
      Deno.env.get("MPESA_PASSKEY") &&
      Deno.env.get("MPESA_SHORTCODE")
    );

    if (mpesaConfigured) {
      options.push({
        providerId: "mpesa",
        displayName: "M-Pesa",
        flowType: "stk_push",
        requiresPhone: true,
        requiresEmail: false,
      });
    }

    let paystackEnabled = !!Deno.env.get("PAYSTACK_SECRET_KEY");
    let paystackDisplayName = "Paystack";

    if (tenantId) {
      const { data: gateway } = await supabase
        .from("tenant_payment_gateways")
        .select("display_name, status, config, public_config")
        .eq("tenant_id", tenantId)
        .eq("provider_id", "paystack")
        .in("status", ["test", "active"])
        .maybeSingle();

      const gatewayConfig = gateway?.config && typeof gateway.config === "object" ? gateway.config as Record<string, unknown> : {};
      paystackEnabled = paystackEnabled || !!gatewayConfig.secret_key;
      paystackDisplayName = gateway?.display_name || paystackDisplayName;
    }

    if (paystackEnabled) {
      options.push({
        providerId: "paystack",
        displayName: paystackDisplayName,
        flowType: "redirect",
        requiresPhone: true,
        requiresEmail: true,
      });
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
