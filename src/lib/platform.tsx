import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

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
  loading: boolean;
  refresh: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined);

const LEGACY_TENANT: PlatformTenant = {
  id: "legacy-fallback",
  name: "Legacy ISP",
  slug: "legacy-isp",
  billingStatus: "active",
  monthlyBaseFee: 0,
  perPurchaseFee: 0,
  portalTitle: "WiFi Access Portal",
  portalSubtitle: "Fast, reliable internet access",
};

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [activeTenant, setActiveTenant] = useState<PlatformTenant | null>(null);
  const [tenantMembershipRole, setTenantMembershipRole] = useState<string | null>(null);
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
      const membershipQuery = await supabase
        .from("tenant_memberships")
        .select("role, tenant:tenant_id(id, name, slug, billing_status, monthly_base_fee, per_purchase_fee, portal_title, portal_subtitle)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      const membership = membershipQuery.data as {
        role?: string;
        tenant?: {
          id: string;
          name: string;
          slug: string;
          billing_status: PlatformTenant["billingStatus"];
          monthly_base_fee: number | null;
          per_purchase_fee: number | null;
          portal_title: string | null;
          portal_subtitle: string | null;
        } | null;
      } | null;

      if (membership?.tenant) {
        setActiveTenant({
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
          billingStatus: membership.tenant.billing_status ?? "active",
          monthlyBaseFee: membership.tenant.monthly_base_fee ?? 0,
          perPurchaseFee: membership.tenant.per_purchase_fee ?? 0,
          portalTitle: membership.tenant.portal_title,
          portalSubtitle: membership.tenant.portal_subtitle,
        });
        setTenantMembershipRole(membership.role ?? null);
        setLoading(false);
        return;
      }

      const legacyQuery = await supabase
        .from("tenants")
        .select("id, name, slug, billing_status, monthly_base_fee, per_purchase_fee, portal_title, portal_subtitle")
        .eq("slug", "legacy-isp")
        .maybeSingle();

      const legacyTenant = legacyQuery.data as {
        id: string;
        name: string;
        slug: string;
        billing_status: PlatformTenant["billingStatus"];
        monthly_base_fee: number | null;
        per_purchase_fee: number | null;
        portal_title: string | null;
        portal_subtitle: string | null;
      } | null;

      if (legacyTenant) {
        setActiveTenant({
          id: legacyTenant.id,
          name: legacyTenant.name,
          slug: legacyTenant.slug,
          billingStatus: legacyTenant.billing_status ?? "active",
          monthlyBaseFee: legacyTenant.monthly_base_fee ?? 0,
          perPurchaseFee: legacyTenant.per_purchase_fee ?? 0,
          portalTitle: legacyTenant.portal_title,
          portalSubtitle: legacyTenant.portal_subtitle,
        });
        setTenantMembershipRole(isAdmin ? "owner" : null);
      } else {
        setActiveTenant(LEGACY_TENANT);
        setTenantMembershipRole(isAdmin ? "owner" : null);
      }
    } catch (error) {
      console.warn("Platform context falling back to legacy tenant:", error);
      setActiveTenant(LEGACY_TENANT);
      setTenantMembershipRole(isAdmin ? "owner" : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    void loadPlatform();
  }, [authLoading, user?.id, isAdmin]);

  const value = useMemo(
    () => ({
      activeTenant,
      tenantMembershipRole,
      isPlatformAdmin: isAdmin,
      loading: authLoading || loading,
      refresh: loadPlatform,
    }),
    [activeTenant, tenantMembershipRole, isAdmin, authLoading, loading],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}
