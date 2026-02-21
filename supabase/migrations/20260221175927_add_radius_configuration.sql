
-- Add RADIUS server configuration fields to router_settings
ALTER TABLE public.router_settings
ADD COLUMN radius_server_ip TEXT,
ADD COLUMN radius_secret TEXT,
ADD COLUMN radius_auth_port INTEGER DEFAULT 1812,
ADD COLUMN radius_acct_port INTEGER DEFAULT 1813;

-- Create radreply table for FreeRADIUS session attributes
CREATE TABLE public.radreply (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  attribute TEXT NOT NULL DEFAULT '',
  op TEXT NOT NULL DEFAULT ':=',
  value TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.radreply ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view radreply" ON public.radreply FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage radreply" ON public.radreply FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create index on username for faster lookups
CREATE INDEX idx_radcheck_username ON public.radcheck(username);
CREATE INDEX idx_radreply_username ON public.radreply(username);
CREATE INDEX idx_radacct_username ON public.radacct(username);
CREATE INDEX idx_radacct_session ON public.radacct(acctsessionid);

-- Add comment
COMMENT ON TABLE public.radreply IS 'FreeRADIUS reply attributes for session control (e.g., Session-Timeout)';
