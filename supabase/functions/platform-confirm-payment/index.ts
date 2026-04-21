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
    const payload = await req.json();
    let checkoutRequestId = payload.checkoutRequestId;
    let mpesaReceipt = payload.mpesaReceipt;

    // Handle M-Pesa STK Push webhook payload format
    if (payload.Body && payload.Body.stkCallback) {
      const stkCallback = payload.Body.stkCallback;
      checkoutRequestId = stkCallback.CheckoutRequestID;
      
      if (stkCallback.ResultCode === 0 && stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item) {
        const receiptItem = stkCallback.CallbackMetadata.Item.find(
          (item: { Name: string; Value: string | number }) => item.Name === 'MpesaReceiptNumber'
        );
        if (receiptItem) {
          mpesaReceipt = receiptItem.Value;
        }
      } else {
        // Payment failed or was cancelled according to M-Pesa callback
        console.log(`Platform STK Push failed for CheckoutRequestID ${checkoutRequestId}, ResultCode: ${stkCallback.ResultCode}`);
        return new Response(JSON.stringify({ success: false, message: 'Payment failed in callback' }), {
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

    // Find the pending invoice for this checkout ID
    // We stored platform_checkout_id in the formula_snapshot JSONB
    const { data: invoice, error: invoiceErr } = await sb
      .from('billing_invoices')
      .select('*')
      .contains('formula_snapshot', { platform_checkout_id: checkoutRequestId })
      .eq('status', 'draft')
      .single();

    if (invoiceErr || !invoice) {
      console.log(`Could not find unpaid platform invoice for checkout: ${checkoutRequestId}`);
      return new Response(JSON.stringify({ error: 'Invoice not found for this checkout' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark invoice as paid
    const metadata = typeof invoice.formula_snapshot === 'object' ? invoice.formula_snapshot : {};
    
    await sb
      .from('billing_invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        formula_snapshot: {
          ...metadata,
          mpesa_receipt: mpesaReceipt || 'MANUAL_CONFIRM',
          payment_method: 'mpesa_stk_push'
        }
      })
      .eq('id', invoice.id);

    console.log(`Platform Invoice ${invoice.invoice_number} paid via ${mpesaReceipt} for checkout ${checkoutRequestId}`);

    return new Response(JSON.stringify({ success: true, message: 'Platform invoice paid successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error confirming platform payment:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});