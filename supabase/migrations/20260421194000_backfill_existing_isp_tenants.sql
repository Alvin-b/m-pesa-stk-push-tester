DO $$
DECLARE
  user_row RECORD;
  requested_tenant_name TEXT;
  requested_tenant_slug TEXT;
  requested_support_phone TEXT;
  normalized_slug TEXT;
  candidate_slug TEXT;
  resolved_tenant_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tenants'
  ) AND EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tenant_memberships'
  ) THEN
    FOR user_row IN
      SELECT
        id,
        email,
        raw_user_meta_data
      FROM auth.users
    LOOP
      requested_tenant_name := NULLIF(trim(COALESCE(user_row.raw_user_meta_data->>'tenant_name', '')), '');
      requested_tenant_slug := NULLIF(trim(COALESCE(user_row.raw_user_meta_data->>'tenant_slug', '')), '');
      requested_support_phone := NULLIF(trim(COALESCE(user_row.raw_user_meta_data->>'support_phone', '')), '');

      IF requested_tenant_name IS NULL THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.tenant_memberships
        WHERE user_id = user_row.id
      ) THEN
        CONTINUE;
      END IF;

      normalized_slug := lower(
        regexp_replace(COALESCE(requested_tenant_slug, requested_tenant_name), '[^a-zA-Z0-9]+', '-', 'g')
      );
      normalized_slug := regexp_replace(normalized_slug, '(^-+|-+$)', '', 'g');

      IF normalized_slug IS NULL OR normalized_slug = '' THEN
        normalized_slug := 'tenant';
      END IF;

      SELECT id
      INTO resolved_tenant_id
      FROM public.tenants
      WHERE support_email = user_row.email
         OR slug = normalized_slug
      ORDER BY CASE WHEN support_email = user_row.email THEN 0 ELSE 1 END, created_at
      LIMIT 1;

      IF resolved_tenant_id IS NULL THEN
        candidate_slug := normalized_slug;

        IF EXISTS (
          SELECT 1
          FROM public.tenants
          WHERE slug = candidate_slug
        ) THEN
          candidate_slug := normalized_slug || '-' || left(replace(user_row.id::text, '-', ''), 6);
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
        RETURNING id INTO resolved_tenant_id;
      ELSE
        UPDATE public.tenants
        SET
          support_email = COALESCE(public.tenants.support_email, user_row.email),
          support_phone = COALESCE(public.tenants.support_phone, requested_support_phone)
        WHERE id = resolved_tenant_id;
      END IF;

      INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
      VALUES (resolved_tenant_id, user_row.id, 'owner')
      ON CONFLICT (tenant_id, user_id) DO NOTHING;
    END LOOP;
  ELSE
    RAISE NOTICE 'Skipping ISP tenant backfill because multitenant tables are not present yet.';
  END IF;
END
$$;
