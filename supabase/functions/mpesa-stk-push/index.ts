import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateUniqueVoucherCode } from "../_shared/vouchers.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, amount, packageId, tenantId } = await req.json();

    if (!phone || !amount) {
      return new Response(JSON.stringify({ error: 'Phone and amount are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const useLegacyGateway = !tenantId;
    let gatewayId: string | null = null;
    let consumerKey = '';
    let consumerSecret = '';
    let passkey = '';
    let shortcode = '';

    if (useLegacyGateway) {
      consumerKey = Deno.env.get('MPESA_CONSUMER_KEY')?.trim() || '';
      consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET')?.trim() || '';
      passkey = Deno.env.get('MPESA_PASSKEY')?.trim() || '';
      shortcode = Deno.env.get('MPESA_SHORTCODE')?.trim() || '';
    } else {
      const { data: gateway } = await sb
        .from('tenant_payment_gateways')
        .select('id, config, status')
        .eq('tenant_id', tenantId)
        .eq('provider_id', 'mpesa')
        .in('status', ['test', 'active'])
        .maybeSingle();

      const gatewayConfig = gateway?.config && typeof gateway.config === 'object'
        ? gateway.config as Record<string, unknown>
        : {};

      gatewayId = gateway?.id || null;
      consumerKey = typeof gatewayConfig.consumer_key === 'string' ? gatewayConfig.consumer_key.trim() : '';
      consumerSecret = typeof gatewayConfig.consumer_secret === 'string' ? gatewayConfig.consumer_secret.trim() : '';
      passkey = typeof gatewayConfig.passkey === 'string' ? gatewayConfig.passkey.trim() : '';
      shortcode = typeof gatewayConfig.shortcode === 'string' ? gatewayConfig.shortcode.trim() : '';
    }

    const partyB = shortcode;
    const callbackUrl = `${supabaseUrl}/functions/v1/confirm-payment`;

    if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
      return new Response(JSON.stringify({ error: useLegacyGateway ? 'M-Pesa credentials are not configured' : 'M-Pesa is not configured for this ISP' }), {
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
      PartyB: partyB,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
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

    // Create voucher as PENDING — activated by confirm-payment after polling succeeds
    if (packageId) {
      let packageQuery = sb
        .from('packages')
        .select(tenantId ? 'duration_minutes, tenant_id' : 'duration_minutes')
        .eq('id', packageId);

      if (tenantId) {
        packageQuery = packageQuery.eq('tenant_id', tenantId);
      }

      const { data: pkg, error: pkgError } = await packageQuery.single();
      if (pkgError || !pkg) {
        throw new Error('Package not found for this ISP portal');
      }

      const sessionTimeout = pkg?.duration_minutes ? pkg.duration_minutes * 60 : 3600;
      const code = await generateUniqueVoucherCode(sb);
      const internalReference = crypto.randomUUID();

      const voucherInsert = await sb.from('vouchers').insert({
        code,
        package_id: packageId,
        phone_number: formattedPhone,
        checkout_request_id: stkData.CheckoutRequestID,
        status: 'pending',
        session_timeout: sessionTimeout,
        ...(!useLegacyGateway ? { tenant_id: tenantId || pkg.tenant_id || null } : {}),
      }).select(useLegacyGateway ? 'id' : 'id, tenant_id').single();

      const { data: voucher, error: voucherError } = voucherInsert;

      if (voucherError) {
        throw voucherError;
      }

      const transactionTenantId = tenantId || pkg.tenant_id || voucher?.tenant_id || null;
      if (!useLegacyGateway && transactionTenantId) {
        const { error: paymentError } = await sb.from('payment_transactions').insert({
          tenant_id: transactionTenantId,
          gateway_id: gatewayId,
          provider_id: 'mpesa',
          package_id: packageId,
          voucher_id: voucher?.id ?? null,
          internal_reference: internalReference,
          provider_checkout_id: stkData.CheckoutRequestID,
          customer_phone: formattedPhone,
          amount,
          currency_code: 'KES',
          status: 'processing',
          metadata: {
            gateway: 'mpesa-stk-push',
            checkout_request_id: stkData.CheckoutRequestID,
            phone: formattedPhone,
            tenant_id: transactionTenantId,
          },
        });

        if (paymentError) {
          throw paymentError;
        }
      }

      // Do NOT create radcheck/radreply here.
      // They are created in confirm-payment after payment is verified.
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
