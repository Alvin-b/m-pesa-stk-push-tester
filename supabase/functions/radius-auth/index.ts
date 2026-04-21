import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isMissingSchemaError, resolveTenantIdFromNas } from "../_shared/radius.ts";

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
    const { username, password, tenantId, nasIp } = await req.json();
    const normalizedUsername = String(username ?? "").trim().toUpperCase();
    const normalizedPassword = String(password ?? "").trim().toUpperCase();

    if (!normalizedUsername || !normalizedPassword) {
      return reject("Invalid credentials", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const resolvedTenantId = await resolveTenantIdFromNas(supabase, tenantId, nasIp);

    let voucherQuery = supabase
      .from("vouchers")
      .select("id, code, status, expires_at, tenant_id")
      .eq("code", normalizedUsername);

    if (resolvedTenantId) {
      voucherQuery = voucherQuery.eq("tenant_id", resolvedTenantId);
    }

    let { data: voucher, error: voucherError } = await voucherQuery.maybeSingle();
    if (voucherError && isMissingSchemaError(voucherError)) {
      ({ data: voucher, error: voucherError } = await supabase
        .from("vouchers")
        .select("id, code, status, expires_at")
        .eq("code", normalizedUsername)
        .maybeSingle());
    }
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

    let radcheckQuery = supabase
      .from("radcheck")
      .select("value")
      .eq("username", normalizedUsername)
      .eq("attribute", "Cleartext-Password");

    if (resolvedTenantId) {
      radcheckQuery = radcheckQuery.eq("tenant_id", resolvedTenantId);
    }

    let { data: radcheck, error: radcheckError } = await radcheckQuery.maybeSingle();

    if (radcheckError && isMissingSchemaError(radcheckError)) {
      ({ data: radcheck, error: radcheckError } = await supabase
        .from("radcheck")
        .select("value")
        .eq("username", normalizedUsername)
        .eq("attribute", "Cleartext-Password")
        .maybeSingle());
    }

    if (radcheckError || !radcheck || String(radcheck.value ?? "").trim().toUpperCase() !== normalizedPassword) {
      return reject("Invalid credentials");
    }

    let radreplyQuery = supabase
      .from("radreply")
      .select("attribute, value")
      .eq("username", normalizedUsername);

    if (resolvedTenantId) {
      radreplyQuery = radreplyQuery.eq("tenant_id", resolvedTenantId);
    }

    let { data: radreplyRows, error: radreplyError } = await radreplyQuery;
    if (radreplyError && isMissingSchemaError(radreplyError)) {
      ({ data: radreplyRows, error: radreplyError } = await supabase
        .from("radreply")
        .select("attribute, value")
        .eq("username", normalizedUsername));
    }

    if (radreplyError) {
      return reject("Radius reply lookup failed", 500);
    }

    const responsePayload: Record<string, string> = {
      "control:Auth-Type": "Accept",
    };

    for (const row of radreplyRows ?? []) {
      const attribute = typeof row.attribute === "string" ? row.attribute.trim() : "";
      const value = typeof row.value === "string" ? row.value.trim() : "";

      if (attribute && value) {
        responsePayload[`reply:${attribute}`] = value;
      }
    }

    return new Response(
      JSON.stringify(responsePayload),
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
