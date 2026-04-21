import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  LEGACY_PORTAL_NAME,
  LEGACY_PORTAL_SUBTITLE,
  LEGACY_TENANT_ID,
  LEGACY_TENANT_SLUG,
  getBackendCapabilities,
  isMissingSchemaError,
} from "@/lib/backend";
import { useLocation } from "react-router-dom";

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  billingStatus: "active" | "watch" | "suspended";
  monthlyBaseFee: number;
  perPurchaseFee: number;
  portalTitle: string | null;
  portalSubtitle: string | null;
}

interface PlatformContextType {
  activeTenant: PlatformTenant | null;
  tenantMembershipRole: string | null;
  isPlatformAdmin: boolean;
  multitenantEnabled: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined);

const LEGACY_PLATFORM_TENANT: PlatformTenant = {
  id: LEGACY_TENANT_ID,
  name: "Legacy ISP",
  slug: LEGACY_TENANT_SLUG,
  billingStatus: "active",
  monthlyBaseFee: 0,
  perPurchaseFee: 0,
  portalTitle: LEGACY_PORTAL_NAME,
  portalSubtitle: LEGACY_PORTAL_SUBTITLE,
};

type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  billing_status: PlatformTenant["billingStatus"];
  monthly_base_fee: number | null;
  per_purchase_fee: number | null;
  portal_title: string | null;
  portal_subtitle: string | null;
};

type MembershipRecord = {
  role?: string;
  tenant?: TenantRecord | null;
} | null;

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const location = useLocation();
  const [activeTenant, setActiveTenant] = useState<PlatformTenant | null>(null);
  const [tenantMembershipRole, setTenantMembershipRole] = useState<string | null>(null);
  const [multitenantEnabled, setMultitenantEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPlatform = async () => {
    if (!user) {
      setActiveTenant(null);
      setTenantMembershipRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const capabilities = await getBackendCapabilities();
      setMultitenantEnabled(capabilities.multitenant);

      if (!capabilities.multitenant) {
        setActiveTenant(isAdmin ? LEGACY_PLATFORM_TENANT : null);
        setTenantMembershipRole(isAdmin ? "platform_admin" : null);
        setLoading(false);
        return;
      }

      const requestedTenantSlug = isAdmin
        ? new URLSearchParams(location.search).get("tenant")?.trim().toLowerCase() || null
        : null;

      const mapTenant = (tenant: TenantRecord): PlatformTenant => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        billingStatus: tenant.billing_status ?? "active",
        monthlyBaseFee: tenant.monthly_base_fee ?? 0,
        perPurchaseFee: tenant.per_purchase_fee ?? 0,
        portalTitle: tenant.portal_title,
        portalSubtitle: tenant.portal_subtitle,
      });

      const loadMembership = async (): Promise<MembershipRecord> => {
        const membershipQuery = await supabase
          .from("tenant_memberships")
          .select("role, tenant:tenant_id(id, name, slug, billing_status, monthly_base_fee, per_purchase_fee, portal_title, portal_subtitle)")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (membershipQuery.error) {
          throw membershipQuery.error;
        }

        return membershipQuery.data as MembershipRecord;
      };

      let membership = await loadMembership();

      if (!isAdmin && !membership?.tenant) {
        const { error: provisionError } = await supabase.rpc("ensure_current_user_tenant_workspace");

        if (provisionError && !isMissingSchemaError(provisionError)) {
          console.warn("Failed to auto-provision tenant workspace:", provisionError);
        }

        if (!provisionError) {
          membership = await loadMembership();
        }
      }

      if (requestedTenantSlug) {
        const overrideQuery = await supabase
          .from("tenants")
          .select("id, name, slug, billing_status, monthly_base_fee, per_purchase_fee, portal_title, portal_subtitle")
          .eq("slug", requestedTenantSlug)
          .maybeSingle();

        const overrideTenant = overrideQuery.data as {
          id: string;
          name: string;
          slug: string;
          billing_status: PlatformTenant["billingStatus"];
          monthly_base_fee: number | null;
          per_purchase_fee: number | null;
          portal_title: string | null;
          portal_subtitle: string | null;
        } | null;

        if (overrideTenant) {
          setActiveTenant(mapTenant(overrideTenant));
          setTenantMembershipRole(
            membership?.tenant?.slug === overrideTenant.slug ? membership.role ?? "platform_admin" : "platform_admin",
          );
          setLoading(false);
          return;
        }
      }

      if (membership?.tenant) {
        setActiveTenant(mapTenant(membership.tenant));
        setTenantMembershipRole(membership.role ?? null);
        setLoading(false);
        return;
      }

      setActiveTenant(null);
      setTenantMembershipRole(null);
    } catch (error) {
      console.warn("Platform context failed to load tenant context:", error);
      setMultitenantEnabled(false);
      setActiveTenant(null);
      setTenantMembershipRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    void loadPlatform();
  }, [authLoading, user?.id, isAdmin, location.search]);

  const value = useMemo(
    () => ({
      activeTenant,
      tenantMembershipRole,
      isPlatformAdmin: isAdmin,
      multitenantEnabled,
      loading: authLoading || loading,
      refresh: loadPlatform,
    }),
    [activeTenant, tenantMembershipRole, isAdmin, multitenantEnabled, authLoading, loading],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}
