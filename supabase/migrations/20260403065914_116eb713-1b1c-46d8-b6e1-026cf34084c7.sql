ALTER TABLE public.router_settings ADD COLUMN IF NOT EXISTS radius_auth_port integer DEFAULT 1812;
ALTER TABLE public.router_settings ADD COLUMN IF NOT EXISTS radius_acct_port integer DEFAULT 1813;