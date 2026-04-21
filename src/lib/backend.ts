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

let capabilityPromise: Promise<BackendCapabilities> | null = null;

const detectBackendCapabilities = async (): Promise<BackendCapabilities> => {
  const [tenantsResult, packageTenantResult, gatewayResult] = await Promise.all([
    supabase.from("tenants").select("id").limit(1),
    supabase.from("packages").select("tenant_id").limit(1),
    supabase.from("tenant_payment_gateways").select("id").limit(1),
  ]);

  const tenantsTable = !isMissingSchemaError(tenantsResult.error);
  const packagesHaveTenantId = !isMissingSchemaError(packageTenantResult.error);
  const tenantPaymentGatewaysTable = !isMissingSchemaError(gatewayResult.error);

  return {
    multitenant: tenantsTable && packagesHaveTenantId,
    packagesHaveTenantId,
    tenantPaymentGatewaysTable,
    tenantsTable,
  };
};

export const getBackendCapabilities = () => {
  if (!capabilityPromise) {
    capabilityPromise = detectBackendCapabilities();
  }

  return capabilityPromise;
};
