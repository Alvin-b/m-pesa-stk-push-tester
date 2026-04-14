import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function isPlatformAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });

  if (error) {
    throw error;
  }

  return !!data;
}

export async function isTenantManager(supabase: SupabaseClient, userId: string, tenantId: string) {
  if (await isPlatformAdmin(supabase, userId)) {
    return true;
  }

  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !!data;
}

export async function assertTenantManager(supabase: SupabaseClient, userId: string, tenantId?: string | null) {
  if (!tenantId) {
    const admin = await isPlatformAdmin(supabase, userId);
    if (!admin) {
      throw new Error("Forbidden");
    }
    return;
  }

  const hasAccess = await isTenantManager(supabase, userId, tenantId);
  if (!hasAccess) {
    throw new Error("Forbidden");
  }
}
