import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // Find all active vouchers that have expired
    const { data: expired } = await sb
      .from("vouchers")
      .select("id, code")
      .eq("status", "active")
      .lt("expires_at", now);

    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({ cleaned: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cleaned = 0;

    for (const v of expired) {
      // Mark voucher as expired
      await sb.from("vouchers").update({ status: "expired" }).eq("id", v.id);

      // Deactivate sessions
      await sb.from("sessions").update({ is_active: false }).eq("voucher_id", v.id);

      // Remove RADIUS credentials so user can't re-auth
      await sb.from("radcheck").delete().eq("username", v.code);
      await sb.from("radreply").delete().eq("username", v.code);

      // Close accounting sessions
      await sb.from("radacct").update({
        acctstoptime: now,
        acctterminatecause: "Session-Timeout",
      }).eq("username", v.code).is("acctstoptime", null);

      cleaned++;
    }

    console.log(`Cleaned up ${cleaned} expired vouchers`);

    return new Response(JSON.stringify({ cleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Cleanup error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
