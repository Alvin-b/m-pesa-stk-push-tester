import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
  loading: boolean;
  refresh: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const location = useLocation();
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
      const requestedTenantSlug = isAdmin
        ? new URLSearchParams(location.search).get("tenant")?.trim().toLowerCase() || null
        : null;

      const mapTenant = (tenant: {
        id: string;
        name: string;
        slug: string;
        billing_status: PlatformTenant["billingStatus"];
        monthly_base_fee: number | null;
        per_purchase_fee: number | null;
        portal_title: string | null;
        portal_subtitle: string | null;
      }): PlatformTenant => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        billingStatus: tenant.billing_status ?? "active",
        monthlyBaseFee: tenant.monthly_base_fee ?? 0,
        perPurchaseFee: tenant.per_purchase_fee ?? 0,
        portalTitle: tenant.portal_title,
        portalSubtitle: tenant.portal_subtitle,
      });

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
