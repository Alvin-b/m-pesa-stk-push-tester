import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantManager } from "../_shared/tenant-access.ts";
import { upsertRadiusCredentials } from "../_shared/radius.ts";
import { generateUniqueVoucherCode } from "../_shared/vouchers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");
    const { packageId, phoneNumber, tenantId } = await req.json();
    if (!packageId) throw new Error("Package ID required");
    await assertTenantManager(supabase, user.id, tenantId);

    // Get package details
    let packageQuery = supabase
      .from("packages")
      .select(tenantId ? "duration_minutes, speed_limit, tenant_id" : "duration_minutes, speed_limit")
      .eq("id", packageId);
    if (tenantId) {
      packageQuery = packageQuery.eq("tenant_id", tenantId);
    }

    const { data: pkg, error: pkgErr } = await packageQuery.single();
    if (pkgErr || !pkg) throw new Error("Package not found");

    const code = await generateUniqueVoucherCode(supabase);
    const durationSeconds = pkg.duration_minutes * 60;

    // Calculate expiry datetime
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    const voucherInsert = await supabase.from("vouchers").insert({
      code,
      package_id: packageId,
      phone_number: phoneNumber || "ADMIN-GENERATED",
      status: "active",
      expires_at: expiresAt.toISOString(),
      session_timeout: durationSeconds,
      ...(tenantId ? { tenant_id: tenantId || pkg.tenant_id || null } : {}),
    }).select().single();

    const { data: voucher, error: vErr } = voucherInsert;

    if (vErr) throw vErr;

    await upsertRadiusCredentials(supabase, {
      tenantId: tenantId || pkg.tenant_id || null,
      username: code,
      password: code,
      sessionTimeout: durationSeconds,
      expiresAt,
      speedLimit: pkg.speed_limit || null,
    });

    return new Response(JSON.stringify({ code, voucher }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
