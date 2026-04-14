CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_id = _tenant_id
      AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_manager_role(_tenant_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships
      WHERE tenant_id = _tenant_id
        AND user_id = _user_id
        AND role IN ('owner', 'admin')
    )
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Tenant members can view own tenant'
  ) THEN
    CREATE POLICY "Tenant members can view own tenant"
    ON public.tenants
    FOR SELECT
    USING (public.is_tenant_member(id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'Users can view own or managed memberships'
  ) THEN
    CREATE POLICY "Users can view own or managed memberships"
    ON public.tenant_memberships
    FOR SELECT
    USING (
      auth.uid() = user_id
      OR public.is_tenant_manager_role(tenant_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_memberships' AND policyname = 'Tenant managers can manage memberships'
  ) THEN
    CREATE POLICY "Tenant managers can manage memberships"
    ON public.tenant_memberships
    FOR ALL
    USING (public.is_tenant_manager_role(tenant_id, auth.uid()))
    WITH CHECK (public.is_tenant_manager_role(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routers' AND policyname = 'Tenant members can view routers'
  ) THEN
    CREATE POLICY "Tenant members can view routers"
    ON public.routers
    FOR SELECT
    USING (public.is_tenant_member(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routers' AND policyname = 'Tenant managers can manage routers'
  ) THEN
    CREATE POLICY "Tenant managers can manage routers"
    ON public.routers
    FOR ALL
    USING (public.is_tenant_manager_role(tenant_id, auth.uid()))
    WITH CHECK (public.is_tenant_manager_role(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'router_provisioning_jobs' AND policyname = 'Tenant members can view router jobs'
  ) THEN
    CREATE POLICY "Tenant members can view router jobs"
    ON public.router_provisioning_jobs
    FOR SELECT
    USING (public.is_tenant_member(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'router_provisioning_jobs' AND policyname = 'Tenant managers can manage router jobs'
  ) THEN
    CREATE POLICY "Tenant managers can manage router jobs"
    ON public.router_provisioning_jobs
    FOR ALL
    USING (public.is_tenant_manager_role(tenant_id, auth.uid()))
    WITH CHECK (public.is_tenant_manager_role(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'billing_invoices' AND policyname = 'Tenant members can view billing invoices'
  ) THEN
    CREATE POLICY "Tenant members can view billing invoices"
    ON public.billing_invoices
    FOR SELECT
    USING (public.is_tenant_member(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'billing_invoice_items' AND policyname = 'Tenant members can view billing invoice items'
  ) THEN
    CREATE POLICY "Tenant members can view billing invoice items"
    ON public.billing_invoice_items
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.billing_invoices invoices
        WHERE invoices.id = invoice_id
          AND public.is_tenant_member(invoices.tenant_id, auth.uid())
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'packages' AND policyname = 'Tenant members can view own packages'
  ) THEN
    CREATE POLICY "Tenant members can view own packages"
    ON public.packages
    FOR SELECT
    USING (
      tenant_id IS NOT NULL
      AND public.is_tenant_member(tenant_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'packages' AND policyname = 'Tenant managers can manage own packages'
  ) THEN
    CREATE POLICY "Tenant managers can manage own packages"
    ON public.packages
    FOR ALL
    USING (
      tenant_id IS NOT NULL
      AND public.is_tenant_manager_role(tenant_id, auth.uid())
    )
    WITH CHECK (
      tenant_id IS NOT NULL
      AND public.is_tenant_manager_role(tenant_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'router_settings' AND policyname = 'Tenant members can view router settings'
  ) THEN
    CREATE POLICY "Tenant members can view router settings"
    ON public.router_settings
    FOR SELECT
    USING (
      tenant_id IS NOT NULL
      AND public.is_tenant_member(tenant_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'router_settings' AND policyname = 'Tenant managers can manage router settings'
  ) THEN
    CREATE POLICY "Tenant managers can manage router settings"
    ON public.router_settings
    FOR ALL
    USING (
      tenant_id IS NOT NULL
      AND public.is_tenant_manager_role(tenant_id, auth.uid())
    )
    WITH CHECK (
      tenant_id IS NOT NULL
      AND public.is_tenant_manager_role(tenant_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vouchers' AND policyname = 'Tenant members can view own vouchers'
  ) THEN
    CREATE POLICY "Tenant members can view own vouchers"
    ON public.vouchers
    FOR SELECT
    USING (
      tenant_id IS NOT NULL
      AND public.is_tenant_member(tenant_id, auth.uid())
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sessions' AND policyname = 'Tenant members can view own sessions'
  ) THEN
    CREATE POLICY "Tenant members can view own sessions"
    ON public.sessions
    FOR SELECT
    USING (
      tenant_id IS NOT NULL
      AND public.is_tenant_member(tenant_id, auth.uid())
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.payment_providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  flow_type TEXT NOT NULL DEFAULT 'redirect',
  is_active BOOLEAN NOT NULL DEFAULT true,
  supported_currencies TEXT[] NOT NULL DEFAULT ARRAY['KES'],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_providers' AND policyname = 'Anyone can view payment providers'
  ) THEN
    CREATE POLICY "Anyone can view payment providers"
    ON public.payment_providers
    FOR SELECT
    USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_providers' AND policyname = 'Admins can manage payment providers'
  ) THEN
    CREATE POLICY "Admins can manage payment providers"
    ON public.payment_providers
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenant_payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES public.payment_providers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'test', 'active')),
  display_name TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id)
);

ALTER TABLE public.tenant_payment_gateways ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_payment_gateways' AND policyname = 'Tenant members can view payment gateways'
  ) THEN
    CREATE POLICY "Tenant members can view payment gateways"
    ON public.tenant_payment_gateways
    FOR SELECT
    USING (public.is_tenant_member(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_payment_gateways' AND policyname = 'Tenant managers can manage payment gateways'
  ) THEN
    CREATE POLICY "Tenant managers can manage payment gateways"
    ON public.tenant_payment_gateways
    FOR ALL
    USING (public.is_tenant_manager_role(tenant_id, auth.uid()))
    WITH CHECK (public.is_tenant_manager_role(tenant_id, auth.uid()));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_id UUID REFERENCES public.tenant_payment_gateways(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL REFERENCES public.payment_providers(id) ON DELETE RESTRICT,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,
  internal_reference TEXT NOT NULL UNIQUE,
  provider_checkout_id TEXT,
  provider_reference TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_transactions' AND policyname = 'Tenant members can view payment transactions'
  ) THEN
    CREATE POLICY "Tenant members can view payment transactions"
    ON public.payment_transactions
    FOR SELECT
    USING (public.is_tenant_member(tenant_id, auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_transactions' AND policyname = 'Tenant managers can manage payment transactions'
  ) THEN
    CREATE POLICY "Tenant managers can manage payment transactions"
    ON public.payment_transactions
    FOR ALL
    USING (public.is_tenant_manager_role(tenant_id, auth.uid()))
    WITH CHECK (public.is_tenant_manager_role(tenant_id, auth.uid()));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES public.payment_providers(id) ON DELETE RESTRICT,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_events_provider_id_provider_event_id_key'
  ) THEN
    ALTER TABLE public.payment_events
      ADD CONSTRAINT payment_events_provider_id_provider_event_id_key
      UNIQUE (provider_id, provider_event_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_events' AND policyname = 'Tenant members can view payment events'
  ) THEN
    CREATE POLICY "Tenant members can view payment events"
    ON public.payment_events
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.payment_transactions transactions
        WHERE transactions.id = transaction_id
          AND public.is_tenant_member(transactions.tenant_id, auth.uid())
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_events' AND policyname = 'Admins can manage payment events'
  ) THEN
    CREATE POLICY "Admins can manage payment events"
    ON public.payment_events
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenant_payment_gateways_updated_at'
  ) THEN
    CREATE TRIGGER update_tenant_payment_gateways_updated_at
    BEFORE UPDATE ON public.tenant_payment_gateways
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_payment_transactions_updated_at'
  ) THEN
    CREATE TRIGGER update_payment_transactions_updated_at
    BEFORE UPDATE ON public.payment_transactions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON public.tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_routers_tenant_status ON public.routers(tenant_id, provisioning_status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant_status ON public.billing_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_tenant_id ON public.tenant_payment_gateways(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant_id ON public.payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_checkout_id ON public.payment_transactions(provider_checkout_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_transaction_id ON public.payment_events(transaction_id);

INSERT INTO public.payment_providers (id, display_name, flow_type, supported_currencies, metadata)
VALUES
  ('mpesa', 'M-Pesa', 'stk_push', ARRAY['KES'], '{"region":"KE"}'::jsonb),
  ('paystack', 'Paystack', 'redirect', ARRAY['KES','NGN','GHS','USD','ZAR'], '{"region":"Africa"}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  flow_type = EXCLUDED.flow_type,
  supported_currencies = EXCLUDED.supported_currencies,
  metadata = EXCLUDED.metadata,
  is_active = true;
