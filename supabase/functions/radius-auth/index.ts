import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const reject = (message: string, status = 401) =>
  new Response(
    JSON.stringify({
      "reply:Reply-Message": message,
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, password, tenantId } = await req.json();
    const normalizedUsername = String(username ?? "").trim().toUpperCase();
    const normalizedPassword = String(password ?? "").trim().toUpperCase();

    if (!normalizedUsername || !normalizedPassword) {
      return reject("Invalid credentials", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let voucherQuery = supabase
      .from("vouchers")
      .select("id, code, status, expires_at, tenant_id")
      .eq("code", normalizedUsername);

    if (tenantId) {
      voucherQuery = voucherQuery.eq("tenant_id", tenantId);
    }

    const { data: voucher, error: voucherError } = await voucherQuery.maybeSingle();
    if (voucherError || !voucher) {
      return reject("Invalid credentials");
    }

    if (voucher.status === "revoked") {
      return reject("Voucher revoked");
    }

    if (voucher.status === "expired") {
      return reject("Voucher expired");
    }

    if (voucher.expires_at && new Date(voucher.expires_at) <= new Date()) {
      await supabase.from("vouchers").update({ status: "expired" }).eq("id", voucher.id);
      return reject("Voucher expired");
    }

    const { data: radcheck, error: radcheckError } = await supabase
      .from("radcheck")
      .select("value")
      .eq("username", normalizedUsername)
      .eq("attribute", "Cleartext-Password")
      .maybeSingle();

    if (radcheckError || !radcheck || String(radcheck.value ?? "").trim().toUpperCase() !== normalizedPassword) {
      return reject("Invalid credentials");
    }

    return new Response(
      JSON.stringify({
        "control:Auth-Type": "Accept",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("radius-auth error:", error);
    return new Response(
      JSON.stringify({
        "reply:Reply-Message": "Radius validation is unavailable right now.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
