import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, amount } = await req.json();

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
      {
        headers: { Authorization: `Basic ${authString}` },
      }
    );

    const tokenBody = await tokenRes.text();
    console.log('Token response status:', tokenRes.status, 'body:', tokenBody);

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to get M-Pesa access token', details: tokenBody }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenData = JSON.parse(tokenBody);
    const access_token = tokenData.access_token?.trim();
    if (!access_token) {
      return new Response(JSON.stringify({ error: 'No access token in response', details: tokenBody }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('Access token obtained, length:', access_token.length, 'token:', access_token.substring(0, 8) + '...');

    // Format timestamp
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const password = btoa(`${shortcode}${passkey}${timestamp}`);

    // Format phone number (ensure 254 prefix)
    let formattedPhone = phone.replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');
    if (!formattedPhone.startsWith('254')) {
      formattedPhone = '254' + formattedPhone;
    }

    console.log('Using shortcode:', shortcode, 'timestamp:', timestamp, 'phone:', formattedPhone);

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: 'https://example.com/callback',
      AccountReference: 'Test',
      TransactionDesc: 'Daraja API Test',
    };

    console.log('STK Payload:', JSON.stringify(stkPayload));

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
    console.log('STK Push response status:', stkRes.status, 'body:', JSON.stringify(stkData));

    if (!stkRes.ok || stkData.errorCode) {
      return new Response(JSON.stringify({ error: 'STK Push failed', details: stkData }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
