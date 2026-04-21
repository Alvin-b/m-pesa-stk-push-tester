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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Default to generating for the previous month, unless specified
    const payload = await req.json().catch(() => ({}));
    const targetMonthOffset = payload.monthOffset !== undefined ? parseInt(payload.monthOffset) : 1; 

    const date = new Date();
    date.setMonth(date.getMonth() - targetMonthOffset);
    
    // Billing Period Start (1st of the target month)
    const periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const startStr = periodStart.toISOString().split('T')[0];
    
    // Billing Period End (last day of the target month)
    const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const endStr = periodEnd.toISOString().split('T')[0];
    
    const invoicePrefix = `INV-${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}`;

    console.log(`Generating invoices for period: ${startStr} to ${endStr}`);

    // Fetch all active tenants
    const { data: tenants, error: tenantsErr } = await sb
      .from('tenants')
      .select('id, name, monthly_base_fee, per_purchase_fee, currency_code, status, billing_status')
      .in('status', ['active']);

    if (tenantsErr) throw tenantsErr;

    const results = [];

    for (const tenant of tenants || []) {
      // Create a unique invoice number per tenant-period
      const shortId = tenant.id.split('-')[0].toUpperCase();
      const invoiceNumber = `${invoicePrefix}-${shortId}`;

      // Check if invoice already exists
      const { data: existing } = await sb
        .from('billing_invoices')
        .select('id')
        .eq('invoice_number', invoiceNumber)
        .maybeSingle();

      if (existing) {
        results.push({ tenant: tenant.name, status: 'skipped', reason: 'already exists', invoice: invoiceNumber });
        continue;
      }

      // Count paid transactions for this tenant in this period
      const { count: purchaseCount, error: txErr } = await sb
        .from('payment_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('status', 'paid')
        .gte('paid_at', periodStart.toISOString())
        .lt('paid_at', new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString());

      if (txErr) {
        console.error(`Error fetching transactions for tenant ${tenant.name}:`, txErr);
        continue;
      }

      const purchases = purchaseCount || 0;
      
      // Check if this is the first invoice for this tenant (to apply installation fee)
      const { count: previousInvoices } = await sb
        .from('billing_invoices')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

      const isFirstInvoice = previousInvoices === 0;
      const installationFee = isFirstInvoice ? 3000 : 0; // Configurable installation fee of 3000 KES

      // Formula: For every 60 purchases, charge 500 shillings -> (purchases / 60) * 500
      const usageFee = Math.round((purchases / 60) * 500 * 100) / 100;
      const baseFee = parseFloat(tenant.monthly_base_fee || 0); // Keep base fee if still needed, else it is 0
      
      const total = baseFee + usageFee + installationFee;

      const formulaSnapshot = {
        base_fee: baseFee,
        installation_fee: installationFee,
        purchases: purchases,
        usage_fee: usageFee,
        formula: '500 KES per 60 purchases',
        currency: tenant.currency_code || 'KES',
      };

      // Set due date to 15th of the current month
      const dueDate = new Date();
      dueDate.setDate(15);

      // Create invoice
      const { data: invoice, error: invoiceErr } = await sb
        .from('billing_invoices')
        .insert({
          tenant_id: tenant.id,
          invoice_number: invoiceNumber,
          billing_period_start: startStr,
          billing_period_end: endStr,
          purchase_count: purchases,
          formula_snapshot: formulaSnapshot,
          subtotal: total,
          total: total,
          status: 'draft',
          due_date: dueDate.toISOString().split('T')[0]
        })
        .select()
        .single();

      if (invoiceErr) {
        console.error(`Error creating invoice for tenant ${tenant.name}:`, invoiceErr);
        results.push({ tenant: tenant.name, status: 'error', error: invoiceErr.message });
      } else {
        // Create an invoice item for Installation Fee
        if (installationFee > 0) {
          await sb.from('billing_invoice_items').insert({
            invoice_id: invoice.id,
            description: 'Router Setup & Installation Fee',
            quantity: 1,
            unit_price: installationFee,
            total_price: installationFee,
          });
        }
        // Create an invoice item for Base Fee
        if (baseFee > 0) {
          await sb.from('billing_invoice_items').insert({
            invoice_id: invoice.id,
            description: 'Monthly Base SaaS Fee',
            quantity: 1,
            unit_price: baseFee,
            total_price: baseFee,
          });
        }
        // Create an invoice item for Usage Fee
        if (usageFee > 0) {
          await sb.from('billing_invoice_items').insert({
            invoice_id: invoice.id,
            description: `Per-purchase transaction fee (500 KES per 60 purchases)`,
            quantity: purchases,
            unit_price: usageFee / purchases,
            total_price: usageFee,
          });
        }

        results.push({ tenant: tenant.name, status: 'created', invoice: invoiceNumber, total });
      }
    }

    return new Response(JSON.stringify({ success: true, period: { start: startStr, end: endStr }, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating invoices:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});