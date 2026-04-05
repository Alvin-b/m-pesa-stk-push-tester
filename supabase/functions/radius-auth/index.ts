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
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    // FreeRADIUS REST module sends username/password
    const username = body.username || body["User-Name"];
    const password = body.password || body["User-Password"];

    if (!username || !password) {
      return new Response(JSON.stringify({ "Reply-Message": "Missing credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check radcheck for valid credentials
    const { data: radcheck } = await supabase
      .from("radcheck")
      .select("*")
      .eq("username", username)
      .eq("attribute", "Cleartext-Password")
      .single();

    if (!radcheck || radcheck.value !== password) {
      return new Response(JSON.stringify({ "Reply-Message": "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check voucher status
    const { data: voucher } = await supabase
      .from("vouchers")
      .select("*, packages(duration_minutes, speed_limit)")
      .eq("code", username)
      .in("status", ["active", "used"])
      .single();

    if (!voucher) {
      // Remove from radcheck if voucher expired/revoked
      return new Response(JSON.stringify({ "Reply-Message": "Voucher expired or revoked" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry
    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      return new Response(JSON.stringify({ "Reply-Message": "Voucher expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get session timeout from radreply
    const { data: radreply } = await supabase
      .from("radreply")
      .select("*")
      .eq("username", username)
      .eq("attribute", "Session-Timeout")
      .single();

    const sessionTimeout = radreply?.value || String((voucher.packages?.duration_minutes || 60) * 60);
    const speedLimit = voucher.packages?.speed_limit || "5M/5M";

    // FreeRADIUS REST module expects this format
    const response: Record<string, any> = {
      "control:Auth-Type": "Accept",
      "reply:Session-Timeout": parseInt(sessionTimeout),
      "reply:Reply-Message": "Welcome! Connected successfully.",
    };

    // Add speed limit if configured (MikroTik rate-limit format)
    if (speedLimit) {
      response["reply:Mikrotik-Rate-Limit"] = speedLimit;
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("RADIUS auth error:", err);
    return new Response(JSON.stringify({ "Reply-Message": "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
