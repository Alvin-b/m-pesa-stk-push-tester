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
      .select('*, packages(duration_minutes)')
      .eq('checkout_request_id', checkoutRequestId)
      .eq('status', 'pending')
      .maybeSingle();

    if (vErr || !voucher) {
      // Check if already activated (idempotent — safe to call twice)
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
    const sessionTimeout = voucher.session_timeout ||
      (voucher.packages?.duration_minutes ? voucher.packages.duration_minutes * 60 : 3600);

    // Activate the voucher
    await sb.from('vouchers').update({
      status: 'active',
      mpesa_receipt: mpesaReceipt || null,
      activated_at: new Date().toISOString(),
    }).eq('id', voucher.id);

    // Create RADIUS credentials now that payment is confirmed
    // Check if radcheck already exists (avoid duplicates)
    const { data: existingRadcheck } = await sb
      .from('radcheck')
      .select('id')
      .eq('username', code)
      .maybeSingle();

    if (!existingRadcheck) {
      await sb.from('radcheck').insert([
        { username: code, attribute: 'Cleartext-Password', op: ':=', value: code },
      ]);

      await sb.from('radreply').insert([
        { username: code, attribute: 'Session-Timeout', op: ':=', value: String(sessionTimeout) },
      ]);
    }

    console.log(`Voucher ${code} activated for checkout ${checkoutRequestId}`);

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
