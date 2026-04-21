import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clearRadiusCredentials, upsertRadiusCredentials } from "../_shared/radius.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code, mpesaReceipt, tenantId } = await req.json();
    if (!code && !mpesaReceipt) {
      return new Response(JSON.stringify({ error: "code or mpesaReceipt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    let voucherQuery = sb
      .from("vouchers")
      .select("id, code, status, expires_at, session_timeout, mpesa_receipt, packages(duration_minutes, speed_limit)")
      .eq("status", "active");

    if (tenantId) {
      voucherQuery = voucherQuery.eq("tenant_id", tenantId);
    }

    if (code) {
      voucherQuery = voucherQuery.eq("code", String(code).trim().toUpperCase());
    } else {
      voucherQuery = voucherQuery.eq("mpesa_receipt", String(mpesaReceipt).trim().toUpperCase());
    }

    const { data: voucher, error: voucherError } = await voucherQuery.maybeSingle();
    if (voucherError || !voucher) {
      return new Response(JSON.stringify({ error: "Active voucher not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!voucher.expires_at) {
      return new Response(JSON.stringify({ error: "Voucher has no expiry and cannot be synced safely" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiresAt = new Date(voucher.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await sb.from("vouchers").update({ status: "expired" }).eq("id", voucher.id);
      await clearRadiusCredentials(sb, { tenantId, username: voucher.code });

      return new Response(JSON.stringify({ error: "Voucher has expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remainingSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    const speedLimit =
      voucher.packages && typeof voucher.packages === "object" && "speed_limit" in voucher.packages
        ? voucher.packages.speed_limit as string | null
        : null;

    await upsertRadiusCredentials(sb, {
      tenantId,
      username: voucher.code,
      password: voucher.code,
      sessionTimeout: remainingSeconds,
      expiresAt,
      speedLimit,
    });

    return new Response(JSON.stringify({
      success: true,
      code: voucher.code,
      repaired: true,
      sessionTimeout: remainingSeconds,
      expiresAt: voucher.expires_at,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-voucher-radius error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
