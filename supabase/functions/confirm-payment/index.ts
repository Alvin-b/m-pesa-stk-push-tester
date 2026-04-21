import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { activateVoucher } from "../_shared/activate-voucher.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    let checkoutRequestId = payload.checkoutRequestId;
    let mpesaReceipt = payload.mpesaReceipt;
    const tenantId = payload.tenantId;

    // Handle M-Pesa STK Push webhook payload format
    if (payload.Body && payload.Body.stkCallback) {
      const stkCallback = payload.Body.stkCallback;
      checkoutRequestId = stkCallback.CheckoutRequestID;
      
      if (stkCallback.ResultCode === 0 && stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item) {
        const receiptItem = stkCallback.CallbackMetadata.Item.find(
          (item: { Name: string; Value: string | number }) => item.Name === 'MpesaReceiptNumber'
        );
        if (receiptItem) mpesaReceipt = receiptItem.Value;
      } else {
        // Payment failed or was cancelled according to M-Pesa callback
        console.log(`STK Push failed for CheckoutRequestID ${checkoutRequestId}, ResultCode: ${stkCallback.ResultCode}`);
        
        // Find voucher to fail it
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);
        
        if (checkoutRequestId) {
          await sb.from('vouchers')
            .update({ status: 'failed' })
            .eq('checkout_request_id', checkoutRequestId)
            .eq('status', 'pending');
            
          await sb.from('payment_transactions')
            .update({ status: 'failed', metadata: { ...payload, reason: stkCallback.ResultDesc } })
            .eq('provider_checkout_id', checkoutRequestId)
            .eq('status', 'processing');
        }

        return new Response(JSON.stringify({ success: true, message: 'Failure callback received' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

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
    let pendingVoucherQuery = sb
      .from('vouchers')
      .select('*, packages(duration_minutes, speed_limit)')
      .eq('checkout_request_id', checkoutRequestId)
      .eq('status', 'pending');

    if (tenantId) {
      pendingVoucherQuery = pendingVoucherQuery.eq('tenant_id', tenantId);
    }

    const { data: voucher, error: vErr } = await pendingVoucherQuery.maybeSingle();

    if (vErr || !voucher) {
      // Check if already activated (idempotent)
      let existingVoucherQuery = sb
        .from('vouchers')
        .select('code, status')
        .eq('checkout_request_id', checkoutRequestId);

      if (tenantId) {
        existingVoucherQuery = existingVoucherQuery.eq('tenant_id', tenantId);
      }

      const { data: existing } = await existingVoucherQuery.maybeSingle();

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

    const activation = await activateVoucher(sb, voucher, mpesaReceipt || null);
    const code = activation.code;

    // Use tenantId from payload or voucher
    const effectiveTenantId = tenantId || voucher.tenant_id;

    if (effectiveTenantId) {
      await sb
        .from('payment_transactions')
        .update({
          voucher_id: voucher.id,
          provider_reference: mpesaReceipt || null,
          status: 'paid',
          paid_at: new Date().toISOString(),
          metadata: {
            checkout_request_id: checkoutRequestId,
            voucher_code: code,
            activated_via: 'confirm-payment',
          },
        })
        .eq('provider_id', 'mpesa')
        .eq('provider_checkout_id', checkoutRequestId);
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