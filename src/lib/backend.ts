import { supabase } from "@/integrations/supabase/client";

export const LEGACY_TENANT_ID = "legacy-fallback";
export const LEGACY_TENANT_SLUG = "legacy-isp";
export const LEGACY_PORTAL_NAME = "WiFi Access Portal";
export const LEGACY_PORTAL_SUBTITLE = "Fast, reliable internet access";

export interface BackendCapabilities {
  multitenant: boolean;
  packagesHaveTenantId: boolean;
  tenantPaymentGatewaysTable: boolean;
  tenantsTable: boolean;
}

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
} | null | undefined;

const missingSchemaCodes = new Set(["42703", "42P01", "PGRST205"]);

export const isMissingSchemaError = (error: SupabaseLikeError) => {
  if (!error) return false;
  if (error.code && missingSchemaCodes.has(error.code)) return true;

  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
};

export const getBackendCapabilities = async (): Promise<BackendCapabilities> => {
  return {
    multitenant: true,
    packagesHaveTenantId: true,
    tenantPaymentGatewaysTable: true,
    tenantsTable: true,
  };
};
