CREATE POLICY "Anyone can check radcheck by username"
ON public.radcheck FOR SELECT
TO public
USING (true);