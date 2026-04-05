import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Update ALLOWED_ORIGINS with your production domain
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'https://your-domain.com', 'https://*.lovable.dev', 'https://lovable.dev'];

function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.some(allowed => {
    if (allowed.includes('*')) {
      const regex = new RegExp(allowed.replace('*', '.*'));
      return regex.test(origin);
    }
    return allowed === origin;
  }) ? origin : ALLOWED_ORIGINS[2];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  };
}

const resultCodeMap: Record<number, string> = {
  0: 'Transaction successful',
  1: 'Insufficient funds',
  1032: 'Transaction cancelled by user',
  1037: 'Timeout - Phone unreachable',
  1025: 'Server error',
  1019: 'Transaction expired',
  2001: 'Wrong PIN entered',
  1001: 'Unable to lock subscriber',
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin') || undefined);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { checkoutRequestId } = await req.json();

    if (!checkoutRequestId) {
      return new Response(JSON.stringify({ error: 'CheckoutRequestID is required' }), {
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
      return new Response(JSON.stringify({ error: 'Failed to get access token', details: tokenBody }), {
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

    // Generate timestamp and password
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const password = btoa(`${shortcode}${passkey}${timestamp}`);

    const queryPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    console.log('Query payload:', JSON.stringify(queryPayload));

    const queryRes = await fetch(
      'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryPayload),
      }
    );

    const queryData = await queryRes.json();
    console.log('Query response:', JSON.stringify(queryData));

    if (!queryRes.ok || queryData.errorCode) {
      return new Response(JSON.stringify({ error: 'Query failed', details: queryData }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resultCode = queryData.ResultCode;
    const meaning = resultCodeMap[resultCode] ?? `Unknown result code: ${resultCode}`;

    return new Response(JSON.stringify({
      success: resultCode === 0,
      resultCode,
      meaning,
      data: queryData,
    }), {
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
