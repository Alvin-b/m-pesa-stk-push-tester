import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
      // FIX: Token failure = still processing, not a fatal error
      // Return resultCode 4999 so the portal keeps polling
      console.error('Failed to get token:', tokenBody);
      return new Response(JSON.stringify({
        success: false,
        resultCode: 4999,
        meaning: 'Still processing — token fetch failed, will retry',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenData = JSON.parse(tokenBody);
    const access_token = tokenData.access_token?.trim();
    if (!access_token) {
      return new Response(JSON.stringify({
        success: false,
        resultCode: 4999,
        meaning: 'Still processing — no access token, will retry',
      }), {
        status: 200,
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

    // FIX: If Safaricom returns an errorCode, check if it means "still processing"
    // errorCode 500.001.1001 = request still being processed
    if (queryData.errorCode) {
      const isProcessing =
        queryData.errorCode === '500.001.1001' ||
        queryData.errorCode?.toString().includes('500.001') ||
        queryData.errorMessage?.toLowerCase().includes('process') ||
        queryData.errorMessage?.toLowerCase().includes('pending');

      if (isProcessing) {
        return new Response(JSON.stringify({
          success: false,
          resultCode: 4999,
          meaning: 'Still processing',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Real error from Safaricom
      return new Response(JSON.stringify({
        success: false,
        resultCode: queryData.errorCode,
        meaning: queryData.errorMessage || 'Query failed',
        data: queryData,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resultCode = Number(queryData.ResultCode);
    const meaning = resultCodeMap[resultCode] ?? `Unknown result code: ${resultCode}`;

    // FIX: Always return 200 with structured data — never return 502 for query results.
    // The portal's polling logic handles success/failure based on resultCode, not HTTP status.
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
    // FIX: On unexpected errors, return 4999 so portal keeps polling instead of failing
    return new Response(JSON.stringify({
      success: false,
      resultCode: 4999,
      meaning: 'Temporary error — retrying',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
