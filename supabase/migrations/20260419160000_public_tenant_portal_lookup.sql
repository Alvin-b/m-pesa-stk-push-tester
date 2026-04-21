DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tenants'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND policyname = 'Anyone can view active tenant portals'
  ) THEN
    CREATE POLICY "Anyone can view active tenant portals"
    ON public.tenants
    FOR SELECT
    USING (status = 'active');
  END IF;
END
$$;
