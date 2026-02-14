
-- Fix overly permissive policies by dropping and recreating with service_role context
-- Vouchers: only service_role (edge functions) should insert/update, public can SELECT
DROP POLICY IF EXISTS "System can insert vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "System can update vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "System can insert sessions" ON public.sessions;
DROP POLICY IF EXISTS "System can update sessions" ON public.sessions;
DROP POLICY IF EXISTS "System can insert radcheck" ON public.radcheck;

-- For vouchers, sessions, radcheck: edge functions use service_role key which bypasses RLS
-- So we don't need permissive insert/update policies for anon
-- The portal needs to SELECT vouchers by code (already covered by public read)
