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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { voucherId, code } = await req.json();
    if (!voucherId) throw new Error("Voucher ID required");

    // Update voucher status
    await supabase.from("vouchers").update({ status: "revoked" }).eq("id", voucherId);

    // Deactivate sessions
    await supabase.from("sessions").update({ is_active: false }).eq("voucher_id", voucherId);

    if (code) {
      // Remove RADIUS credentials — FreeRADIUS will reject any new auth attempts
      await supabase.from("radcheck").delete().eq("username", code);
      await supabase.from("radreply").delete().eq("username", code);

      // Mark active accounting sessions as terminated so FreeRADIUS knows
      // the session is done. This sets acctstoptime which causes the NAS
      // to see the session as closed on next interim update.
      await supabase.from("radacct").update({
        acctstoptime: new Date().toISOString(),
        acctterminatecause: "Admin-Reset",
      }).eq("username", code).is("acctstoptime", null);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
