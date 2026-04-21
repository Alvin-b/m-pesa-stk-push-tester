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
    const { invoiceId, phone } = await req.json();

    if (!invoiceId || !phone) {
      return new Response(JSON.stringify({ error: 'Invoice ID and phone are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get the invoice to verify amount
    const { data: invoice, error: invoiceErr } = await sb
      .from('billing_invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('status', 'draft')
      .single();

    if (invoiceErr || !invoice) {
      return new Response(JSON.stringify({ error: 'Valid unpaid invoice not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amount = Math.ceil(parseFloat(invoice.total || '0'));
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invoice amount must be greater than zero' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Platform M-Pesa credentials for the SaaS owner (KCB Paybill 7718913)
    // Falls back to standard MPESA_ variables if PLATFORM_ specific ones aren't set
    const consumerKey = Deno.env.get('PLATFORM_MPESA_CONSUMER_KEY')?.trim() || Deno.env.get('MPESA_CONSUMER_KEY')?.trim() || '';
    const consumerSecret = Deno.env.get('PLATFORM_MPESA_CONSUMER_SECRET')?.trim() || Deno.env.get('MPESA_CONSUMER_SECRET')?.trim() || '';
    const passkey = Deno.env.get('PLATFORM_MPESA_PASSKEY')?.trim() || Deno.env.get('MPESA_PASSKEY')?.trim() || '';
    const shortcode = Deno.env.get('PLATFORM_MPESA_SHORTCODE')?.trim() || Deno.env.get('MPESA_SHORTCODE')?.trim() || '7718913';

    const partyB = shortcode;
    const callbackUrl = `${supabaseUrl}/functions/v1/platform-confirm-payment`;

    if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
      return new Response(JSON.stringify({ error: 'Platform M-Pesa credentials are not configured' }), {
        status: 400,
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

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: partyB,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: invoice.invoice_number,
      TransactionDesc: 'Platform SaaS Fee',
    };

    console.log('Sending platform STK push:', { ...stkPayload, Password: '***' });

    const pushRes = await fetch(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stkPayload),
      }
    );

    const pushBody = await pushRes.text();
    if (!pushRes.ok) {
      console.error('STK Push Error:', pushBody);
      return new Response(JSON.stringify({ error: 'STK push failed', details: pushBody }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pushData = JSON.parse(pushBody);

    if (pushData.ResponseCode === '0') {
      const checkoutRequestId = pushData.CheckoutRequestID;
      
      // Update invoice metadata with checkout request ID to match on callback
      const metadata = typeof invoice.formula_snapshot === 'object' ? invoice.formula_snapshot : {};
      await sb
        .from('billing_invoices')
        .update({
          formula_snapshot: { ...metadata, platform_checkout_id: checkoutRequestId }
        })
        .eq('id', invoice.id);

      return new Response(JSON.stringify({ success: true, checkoutRequestId }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: pushData.CustomerMessage || 'STK push rejected', details: pushData }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Error in platform-stk-push:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});