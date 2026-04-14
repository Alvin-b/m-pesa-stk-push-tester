import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VOUCHER_LENGTH = 6;

export function randomVoucherCode(length = VOUCHER_LENGTH) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += VOUCHER_ALPHABET.charAt(Math.floor(Math.random() * VOUCHER_ALPHABET.length));
  }
  return code;
}

export async function generateUniqueVoucherCode(supabase: SupabaseClient, attempts = 25) {
  for (let index = 0; index < attempts; index += 1) {
    const code = randomVoucherCode();
    const { data, error } = await supabase.from("vouchers").select("id").eq("code", code).maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return code;
    }
  }

  throw new Error("Unable to generate a unique voucher code");
}
