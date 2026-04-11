CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_tenant_name TEXT;
  requested_tenant_slug TEXT;
  normalized_slug TEXT;
  final_slug TEXT;
  created_tenant_id UUID;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');

  requested_tenant_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'tenant_name', '')), '');
  requested_tenant_slug := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'tenant_slug', '')), '');

  IF requested_tenant_name IS NOT NULL THEN
    normalized_slug := lower(regexp_replace(COALESCE(requested_tenant_slug, requested_tenant_name), '[^a-zA-Z0-9]+', '-', 'g'));
    normalized_slug := regexp_replace(normalized_slug, '(^-+|-+$)', '', 'g');

    IF normalized_slug IS NULL OR normalized_slug = '' THEN
      normalized_slug := 'tenant';
    END IF;

    final_slug := normalized_slug;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = final_slug) THEN
      final_slug := normalized_slug || '-' || left(replace(NEW.id::text, '-', ''), 6);
    END IF;

    INSERT INTO public.tenants (
      name,
      slug,
      portal_title,
      portal_subtitle,
      status,
      billing_status
    )
    VALUES (
      requested_tenant_name,
      final_slug,
      requested_tenant_name || ' WiFi Portal',
      'Purchase internet access and manage hotspot sessions',
      'active',
      'active'
    )
    RETURNING id INTO created_tenant_id;

    INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
    VALUES (created_tenant_id, NEW.id, 'owner')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
