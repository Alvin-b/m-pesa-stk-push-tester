CREATE OR REPLACE FUNCTION public.ensure_current_user_tenant_workspace()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  user_row RECORD;
  membership_row RECORD;
  resolved_tenant RECORD;
  requested_tenant_name TEXT;
  requested_tenant_slug TEXT;
  requested_support_phone TEXT;
  normalized_slug TEXT;
  candidate_slug TEXT;
  workspace_created BOOLEAN := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in before a workspace can be provisioned.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tenants'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tenant_memberships'
  ) THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'multitenant_schema_missing'
    );
  END IF;

  SELECT
    memberships.role,
    tenants.id AS tenant_id,
    tenants.name AS tenant_name,
    tenants.slug AS tenant_slug
  INTO membership_row
  FROM public.tenant_memberships AS memberships
  JOIN public.tenants ON tenants.id = memberships.tenant_id
  WHERE memberships.user_id = current_user_id
  ORDER BY
    CASE memberships.role
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END,
    memberships.created_at
  LIMIT 1;

  IF membership_row.tenant_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'available', true,
      'created_workspace', false,
      'membership_role', membership_row.role,
      'tenant_id', membership_row.tenant_id,
      'tenant_name', membership_row.tenant_name,
      'tenant_slug', membership_row.tenant_slug
    );
  END IF;

  SELECT
    id,
    email,
    raw_user_meta_data
  INTO user_row
  FROM auth.users
  WHERE id = current_user_id;

  IF user_row.id IS NULL THEN
    RAISE EXCEPTION 'The signed-in user record could not be loaded.';
  END IF;

  requested_tenant_name := NULLIF(trim(COALESCE(user_row.raw_user_meta_data->>'tenant_name', '')), '');
  requested_tenant_slug := NULLIF(trim(COALESCE(user_row.raw_user_meta_data->>'tenant_slug', '')), '');
  requested_support_phone := NULLIF(trim(COALESCE(user_row.raw_user_meta_data->>'support_phone', '')), '');

  IF requested_tenant_name IS NULL THEN
    requested_tenant_name := COALESCE(
      NULLIF(trim(COALESCE(user_row.raw_user_meta_data->>'full_name', '')), ''),
      NULLIF(split_part(COALESCE(user_row.email, ''), '@', 1), '')
    );
  END IF;

  IF requested_tenant_name IS NULL THEN
    requested_tenant_name := 'ISP Workspace';
  END IF;

  normalized_slug := lower(
    regexp_replace(COALESCE(requested_tenant_slug, requested_tenant_name), '[^a-zA-Z0-9]+', '-', 'g')
  );
  normalized_slug := regexp_replace(normalized_slug, '(^-+|-+$)', '', 'g');

  IF normalized_slug IS NULL OR normalized_slug = '' THEN
    normalized_slug := 'isp-' || left(replace(current_user_id::text, '-', ''), 8);
  END IF;

  SELECT
    id,
    name,
    slug
  INTO resolved_tenant
  FROM public.tenants
  WHERE support_email = user_row.email
     OR slug = normalized_slug
  ORDER BY
    CASE WHEN support_email = user_row.email THEN 0 ELSE 1 END,
    created_at
  LIMIT 1;

  IF resolved_tenant.id IS NULL THEN
    candidate_slug := normalized_slug;

    IF EXISTS (
      SELECT 1
      FROM public.tenants
      WHERE slug = candidate_slug
    ) THEN
      candidate_slug := normalized_slug || '-' || left(replace(current_user_id::text, '-', ''), 6);
    END IF;

    INSERT INTO public.tenants (
      name,
      slug,
      portal_title,
      portal_subtitle,
      status,
      billing_status,
      support_email,
      support_phone
    )
    VALUES (
      requested_tenant_name,
      candidate_slug,
      requested_tenant_name || ' WiFi Portal',
      'Purchase internet access and manage hotspot sessions',
      'active',
      'active',
      user_row.email,
      requested_support_phone
    )
    RETURNING id, name, slug
    INTO resolved_tenant;

    workspace_created := true;
  ELSE
    UPDATE public.tenants
    SET
      support_email = COALESCE(public.tenants.support_email, user_row.email),
      support_phone = COALESCE(requested_support_phone, public.tenants.support_phone),
      updated_at = now()
    WHERE id = resolved_tenant.id;
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
  VALUES (resolved_tenant.id, current_user_id, 'owner')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'available', true,
    'created_workspace', workspace_created,
    'membership_role', 'owner',
    'tenant_id', resolved_tenant.id,
    'tenant_name', resolved_tenant.name,
    'tenant_slug', resolved_tenant.slug
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.ensure_current_user_tenant_workspace() TO authenticated;
