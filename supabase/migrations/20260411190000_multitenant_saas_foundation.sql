DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_billing_status') THEN
    CREATE TYPE public.tenant_billing_status AS ENUM ('active', 'watch', 'suspended');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  billing_status public.tenant_billing_status NOT NULL DEFAULT 'active',
  monthly_base_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  per_purchase_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'KES',
  portal_title TEXT,
  portal_subtitle TEXT,
  primary_color TEXT,
  accent_color TEXT,
  support_phone TEXT,
  support_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Admins can manage tenants'
  ) THEN
    CREATE POLICY "Admins can manage tenants"
    ON public.tenants
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'Admins can manage tenant memberships'
  ) THEN
    CREATE POLICY "Admins can manage tenant memberships"
    ON public.tenant_memberships
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.routers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  site_name TEXT,
  host TEXT,
  api_port INTEGER DEFAULT 8728,
  ssh_port INTEGER DEFAULT 22,
  username TEXT,
  encrypted_secret TEXT,
  provisioning_status TEXT NOT NULL DEFAULT 'pending',
  last_seen_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routers' AND policyname = 'Admins can manage routers'
  ) THEN
    CREATE POLICY "Admins can manage routers"
    ON public.routers
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.router_provisioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  router_id UUID NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES auth.users(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.router_provisioning_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'router_provisioning_jobs' AND policyname = 'Admins can manage router jobs'
  ) THEN
    CREATE POLICY "Admins can manage router jobs"
    ON public.router_provisioning_jobs
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  formula_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'billing_invoices' AND policyname = 'Admins can manage billing invoices'
  ) THEN
    CREATE POLICY "Admins can manage billing invoices"
    ON public.billing_invoices
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.billing_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.billing_invoices(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.billing_invoice_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'billing_invoice_items' AND policyname = 'Admins can manage billing invoice items'
  ) THEN
    CREATE POLICY "Admins can manage billing invoice items"
    ON public.billing_invoice_items
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.router_settings ADD COLUMN IF NOT EXISTS tenant_id UUID;

DO $$
DECLARE
  legacy_tenant_id UUID;
BEGIN
  INSERT INTO public.tenants (name, slug, portal_title, portal_subtitle, primary_color, accent_color)
  VALUES (
    'Legacy ISP',
    'legacy-isp',
    'WiFi Access Portal',
    'Fast, reliable internet access',
    '#3b82f6',
    '#14b8a6'
  )
  ON CONFLICT (slug) DO UPDATE
  SET updated_at = now()
  RETURNING id INTO legacy_tenant_id;

  UPDATE public.packages
  SET tenant_id = legacy_tenant_id
  WHERE tenant_id IS NULL;

  UPDATE public.vouchers
  SET tenant_id = legacy_tenant_id
  WHERE tenant_id IS NULL;

  UPDATE public.sessions s
  SET tenant_id = COALESCE(
    s.tenant_id,
    (SELECT v.tenant_id FROM public.vouchers v WHERE v.id = s.voucher_id)
  )
  WHERE s.tenant_id IS NULL;

  UPDATE public.router_settings
  SET tenant_id = legacy_tenant_id
  WHERE tenant_id IS NULL;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packages_tenant_id_fkey') THEN
    ALTER TABLE public.packages
      ADD CONSTRAINT packages_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_tenant_id_fkey') THEN
    ALTER TABLE public.vouchers
      ADD CONSTRAINT vouchers_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_tenant_id_fkey') THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'router_settings_tenant_id_fkey') THEN
    ALTER TABLE public.router_settings
      ADD CONSTRAINT router_settings_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_packages_tenant_id ON public.packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_tenant_id ON public.vouchers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_id ON public.sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_router_settings_tenant_id ON public.router_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_routers_tenant_id ON public.routers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant_id ON public.billing_invoices(tenant_id);
