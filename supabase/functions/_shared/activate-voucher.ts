import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatExpiration = (date: Date) =>
  `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")} ${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;

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
  const expirationStr = formatExpiration(expiresAt);

  await supabase.from("vouchers").update({
    status: "active",
    mpesa_receipt: mpesaReceipt || null,
    activated_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  }).eq("id", voucher.id);

  const { data: existingRadcheck } = await supabase
    .from("radcheck")
    .select("id")
    .eq("username", voucher.code)
    .maybeSingle();

  if (!existingRadcheck) {
    await supabase.from("radcheck").insert([
      { username: voucher.code, attribute: "Cleartext-Password", op: ":=", value: voucher.code },
      { username: voucher.code, attribute: "Session-Timeout", op: ":=", value: String(durationSeconds) },
      { username: voucher.code, attribute: "Expiration", op: ":=", value: expirationStr },
    ]);

    const radreplyRows: { username: string; attribute: string; op: string; value: string }[] = [
      { username: voucher.code, attribute: "Session-Timeout", op: "=", value: String(durationSeconds) },
    ];

    if (speedLimit) {
      radreplyRows.push({ username: voucher.code, attribute: "Mikrotik-Rate-Limit", op: "=", value: speedLimit });
    }

    await supabase.from("radreply").insert(radreplyRows);
  }

  return {
    code: voucher.code,
    expiresAt: expiresAt.toISOString(),
    alreadyActive: false,
  };
}
