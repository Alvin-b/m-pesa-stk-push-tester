import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { packageId, phoneNumber } = await req.json();
    if (!packageId) throw new Error("Package ID required");

    // Get package details
    const { data: pkg, error: pkgErr } = await supabase.from("packages").select("duration_minutes, speed_limit").eq("id", packageId).single();
    if (pkgErr || !pkg) throw new Error("Package not found");

    const code = Array.from({ length: 5 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
    const durationSeconds = pkg.duration_minutes * 60;

    // Calculate expiry datetime
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);
    // Format for FreeRADIUS Expiration attribute: "Mon DD YYYY HH:MI:SS"
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const expirationStr = `${months[expiresAt.getMonth()]} ${String(expiresAt.getDate()).padStart(2,'0')} ${expiresAt.getFullYear()} ${String(expiresAt.getHours()).padStart(2,'0')}:${String(expiresAt.getMinutes()).padStart(2,'0')}:${String(expiresAt.getSeconds()).padStart(2,'0')}`;

    const { data: voucher, error: vErr } = await supabase.from("vouchers").insert({
      code,
      package_id: packageId,
      phone_number: phoneNumber || "ADMIN-GENERATED",
      status: "active",
      expires_at: expiresAt.toISOString(),
      session_timeout: durationSeconds,
    }).select().single();

    if (vErr) throw vErr;

    // radcheck: Password + Session-Timeout + Expiration
    await supabase.from("radcheck").insert([
      { username: code, attribute: "Cleartext-Password", op: ":=", value: code },
      { username: code, attribute: "Session-Timeout", op: ":=", value: String(durationSeconds) },
      { username: code, attribute: "Expiration", op: ":=", value: expirationStr },
    ]);

    // radreply: Session-Timeout + Mikrotik-Rate-Limit
    const radreplyRows: { username: string; attribute: string; op: string; value: string }[] = [
      { username: code, attribute: "Session-Timeout", op: "=", value: String(durationSeconds) },
    ];
    if (pkg.speed_limit) {
      radreplyRows.push({ username: code, attribute: "Mikrotik-Rate-Limit", op: "=", value: pkg.speed_limit });
    }
    await supabase.from("radreply").insert(radreplyRows);

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
