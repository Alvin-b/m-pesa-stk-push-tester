import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { checkoutRequestId, mpesaReceipt } = await req.json();

    if (!checkoutRequestId) {
      return new Response(JSON.stringify({ error: 'checkoutRequestId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Find the pending voucher for this checkout
    const { data: voucher, error: vErr } = await sb
      .from('vouchers')
      .select('*, packages(duration_minutes, speed_limit)')
      .eq('checkout_request_id', checkoutRequestId)
      .eq('status', 'pending')
      .maybeSingle();

    if (vErr || !voucher) {
      // Check if already activated (idempotent)
      const { data: existing } = await sb
        .from('vouchers')
        .select('code, status')
        .eq('checkout_request_id', checkoutRequestId)
        .maybeSingle();

      if (existing?.status === 'active') {
        return new Response(JSON.stringify({ success: true, code: existing.code, alreadyActivated: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Voucher not found for this checkout' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const code = voucher.code;
    const durationSeconds = voucher.session_timeout ||
      (voucher.packages?.duration_minutes ? voucher.packages.duration_minutes * 60 : 3600);
    const speedLimit = voucher.packages?.speed_limit || null;

    // Calculate expiry
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const expirationStr = `${months[expiresAt.getMonth()]} ${String(expiresAt.getDate()).padStart(2,'0')} ${expiresAt.getFullYear()} ${String(expiresAt.getHours()).padStart(2,'0')}:${String(expiresAt.getMinutes()).padStart(2,'0')}:${String(expiresAt.getSeconds()).padStart(2,'0')}`;

    // Activate the voucher
    await sb.from('vouchers').update({
      status: 'active',
      mpesa_receipt: mpesaReceipt || null,
      activated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    }).eq('id', voucher.id);

    // Create RADIUS credentials (check for duplicates)
    const { data: existingRadcheck } = await sb
      .from('radcheck')
      .select('id')
      .eq('username', code)
      .maybeSingle();

    if (!existingRadcheck) {
      // radcheck: Password + Session-Timeout + Expiration
      await sb.from('radcheck').insert([
        { username: code, attribute: 'Cleartext-Password', op: ':=', value: code },
        { username: code, attribute: 'Session-Timeout', op: ':=', value: String(durationSeconds) },
        { username: code, attribute: 'Expiration', op: ':=', value: expirationStr },
      ]);

      // radreply: Session-Timeout + Mikrotik-Rate-Limit
      const radreplyRows: { username: string; attribute: string; op: string; value: string }[] = [
        { username: code, attribute: 'Session-Timeout', op: '=', value: String(durationSeconds) },
      ];
      if (speedLimit) {
        radreplyRows.push({ username: code, attribute: 'Mikrotik-Rate-Limit', op: '=', value: speedLimit });
      }
      await sb.from('radreply').insert(radreplyRows);
    }

    console.log(`Voucher ${code} activated with ${durationSeconds}s timeout, expiry ${expirationStr}`);

    return new Response(JSON.stringify({ success: true, code }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
