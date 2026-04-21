import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertRadiusCredentials } from "./radius.ts";

interface VoucherPackage {
  duration_minutes?: number | null;
  speed_limit?: string | null;
}

interface VoucherRow {
  id: string;
  code: string;
  status: string;
  session_timeout?: number | null;
  expires_at?: string | null;
  tenant_id?: string | null;
  packages?: VoucherPackage | VoucherPackage[] | null;
}

export async function activateVoucher(
  supabase: SupabaseClient,
  voucher: VoucherRow,
  mpesaReceipt?: string | null,
) {
  if (voucher.status === "active" && voucher.expires_at) {
    return {
      code: voucher.code,
      expiresAt: voucher.expires_at,
      alreadyActive: true,
    };
  }

  const packageData = Array.isArray(voucher.packages) ? voucher.packages[0] : voucher.packages;
  const durationSeconds = voucher.session_timeout ||
    (packageData?.duration_minutes ? packageData.duration_minutes * 60 : 3600);
  const speedLimit = packageData?.speed_limit || null;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000);
  await supabase.from("vouchers").update({
    status: "active",
    mpesa_receipt: mpesaReceipt || null,
    activated_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  }).eq("id", voucher.id);

  await upsertRadiusCredentials(supabase, {
    tenantId: voucher.tenant_id ?? null,
    username: voucher.code,
    password: voucher.code,
    sessionTimeout: durationSeconds,
    expiresAt,
    speedLimit,
  });

  return {
    code: voucher.code,
    expiresAt: expiresAt.toISOString(),
    alreadyActive: false,
  };
}
