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
  tenantMembershipsTable: boolean;
}

type SupabaseLikeError = {
  code?: string | null;
  message?: string | null;
} | null | undefined;

const missingSchemaCodes = new Set(["42703", "42P01", "PGRST202", "PGRST205"]);

let cachedCapabilities: BackendCapabilities | null = null;
let capabilitiesPromise: Promise<BackendCapabilities> | null = null;

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

export const getBackendCapabilities = async (forceRefresh = false): Promise<BackendCapabilities> => {
  if (!forceRefresh && cachedCapabilities) {
    return cachedCapabilities;
  }

  if (!forceRefresh && capabilitiesPromise) {
    return capabilitiesPromise;
  }

  capabilitiesPromise = (async () => {
    const [tenantsResult, membershipsResult, packagesResult, gatewaysResult] = await Promise.all([
      supabase.from("tenants").select("id").limit(1),
      supabase.from("tenant_memberships").select("id").limit(1),
      supabase.from("packages").select("tenant_id").limit(1),
      supabase.from("tenant_payment_gateways").select("id").limit(1),
    ]);

    const tenantsTable = !isMissingSchemaError(tenantsResult.error);
    const tenantMembershipsTable = !isMissingSchemaError(membershipsResult.error);
    const packagesHaveTenantId = !isMissingSchemaError(packagesResult.error);
    const tenantPaymentGatewaysTable = !isMissingSchemaError(gatewaysResult.error);

    const capabilities: BackendCapabilities = {
      multitenant: tenantsTable && tenantMembershipsTable && packagesHaveTenantId,
      packagesHaveTenantId,
      tenantPaymentGatewaysTable,
      tenantsTable,
      tenantMembershipsTable,
    };

    cachedCapabilities = capabilities;
    return capabilities;
  })();

  try {
    return await capabilitiesPromise;
  } finally {
    capabilitiesPromise = null;
  }
};
