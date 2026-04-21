ALTER TABLE public.radcheck
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE public.radreply
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE public.radacct
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'radcheck_tenant_id_fkey') THEN
      ALTER TABLE public.radcheck
        ADD CONSTRAINT radcheck_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'radreply_tenant_id_fkey') THEN
      ALTER TABLE public.radreply
        ADD CONSTRAINT radreply_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'radacct_tenant_id_fkey') THEN
      ALTER TABLE public.radacct
        ADD CONSTRAINT radacct_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'vouchers'
  ) THEN
    UPDATE public.radcheck rc
    SET tenant_id = v.tenant_id
    FROM public.vouchers v
    WHERE rc.tenant_id IS NULL
      AND v.code = rc.username
      AND v.tenant_id IS NOT NULL;

    UPDATE public.radreply rr
    SET tenant_id = v.tenant_id
    FROM public.vouchers v
    WHERE rr.tenant_id IS NULL
      AND v.code = rr.username
      AND v.tenant_id IS NOT NULL;

    UPDATE public.radacct ra
    SET tenant_id = v.tenant_id
    FROM public.vouchers v
    WHERE ra.tenant_id IS NULL
      AND v.code = ra.username
      AND v.tenant_id IS NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_radcheck_tenant_username ON public.radcheck(tenant_id, username);
CREATE INDEX IF NOT EXISTS idx_radreply_tenant_username ON public.radreply(tenant_id, username);
CREATE INDEX IF NOT EXISTS idx_radacct_tenant_username ON public.radacct(tenant_id, username);
CREATE INDEX IF NOT EXISTS idx_radacct_tenant_nas ON public.radacct(tenant_id, nasipaddress);

CREATE TABLE IF NOT EXISTS public.radius_nas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  router_id UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  nasname TEXT NOT NULL,
  shortname TEXT,
  secret TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nasname),
  UNIQUE (router_id)
);

ALTER TABLE public.radius_nas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radius_nas' AND policyname = 'Tenant members can view radius nas'
  ) THEN
    CREATE POLICY "Tenant members can view radius nas"
    ON public.radius_nas
    FOR SELECT
    USING (public.is_tenant_member(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radius_nas' AND policyname = 'Tenant managers can manage radius nas'
  ) THEN
    CREATE POLICY "Tenant managers can manage radius nas"
    ON public.radius_nas
    FOR ALL
    USING (public.is_tenant_manager_role(tenant_id, auth.uid()))
    WITH CHECK (public.is_tenant_manager_role(tenant_id, auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_radius_nas_updated_at'
  ) THEN
    CREATE TRIGGER update_radius_nas_updated_at
    BEFORE UPDATE ON public.radius_nas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_radius_nas_tenant ON public.radius_nas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_radius_nas_router ON public.radius_nas(router_id);
