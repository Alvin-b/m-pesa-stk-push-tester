import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, amount, packageId } = await req.json();

    if (!phone || !amount) {
      return new Response(JSON.stringify({ error: 'Phone and amount are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY');
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET');
    const passkey = Deno.env.get('MPESA_PASSKEY');
    const shortcode = Deno.env.get('MPESA_SHORTCODE');

    if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
      return new Response(JSON.stringify({ error: 'M-Pesa credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get OAuth token
    const authString = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenRes = await fetch(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${authString}` } }
    );

    const tokenBody = await tokenRes.text();
    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to get M-Pesa access token', details: tokenBody }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenData = JSON.parse(tokenBody);
    const access_token = tokenData.access_token?.trim();
    if (!access_token) {
      return new Response(JSON.stringify({ error: 'No access token in response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format timestamp
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const password = btoa(`${shortcode}${passkey}${timestamp}`);

    // Format phone number
    let formattedPhone = phone.replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');
    if (!formattedPhone.startsWith('254')) {
      formattedPhone = '254' + formattedPhone;
    }

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: '4159923',
      PhoneNumber: formattedPhone,
      CallBackURL: `${Deno.env.get('SUPABASE_URL')}/functions/v1/confirm-payment`,
      AccountReference: 'WiFi',
      TransactionDesc: 'WiFi Package Purchase',
    };

    const stkRes = await fetch(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stkPayload),
      }
    );

    const stkData = await stkRes.json();

    if (!stkRes.ok || stkData.errorCode) {
      return new Response(JSON.stringify({ error: 'STK Push failed', details: stkData }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create voucher in pending state if packageId provided
    if (packageId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, supabaseKey);

      // Get package duration for session timeout
      const { data: pkg } = await sb.from('packages').select('duration_minutes, speed_limit').eq('id', packageId).single();
      const sessionTimeout = pkg?.duration_minutes ? pkg.duration_minutes * 60 : 3600;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + sessionTimeout * 1000);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const expiration = `${monthNames[expiresAt.getMonth()]} ${String(expiresAt.getDate()).padStart(2, '0')} ${expiresAt.getFullYear()} ${String(expiresAt.getHours()).padStart(2, '0')}:${String(expiresAt.getMinutes()).padStart(2, '0')}:${String(expiresAt.getSeconds()).padStart(2, '0')}`;

      const code = generateVoucherCode();
      await sb.from('vouchers').insert({
        code,
        package_id: packageId,
        phone_number: formattedPhone,
        checkout_request_id: stkData.CheckoutRequestID,
        expires_at: expiresAt.toISOString(),
        status: 'active',
      });

      // Add RADIUS credentials and expiration
      await sb.from('radcheck').insert([
        { username: code, attribute: 'Cleartext-Password', op: ':=', value: code },
        { username: code, attribute: 'Session-Timeout', op: ':=', value: String(sessionTimeout) },
        { username: code, attribute: 'Expiration', op: ':=', value: expiration },
      ]);

      const replyRows = [
        { username: code, attribute: 'Session-Timeout', op: '=', value: String(sessionTimeout) },
      ];
      if (pkg?.speed_limit) {
        replyRows.push({ username: code, attribute: 'Mikrotik-Rate-Limit', op: '=', value: pkg.speed_limit });
      }
      await sb.from('radreply').insert(replyRows);
    }

    return new Response(JSON.stringify({ success: true, data: stkData }), {
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
