
-- Profiles table for admin users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- WiFi Packages
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  speed_limit TEXT DEFAULT '5M/5M',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages" ON public.packages FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage packages" ON public.packages FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Vouchers (generated after successful payment)
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  package_id UUID REFERENCES public.packages(id) NOT NULL,
  phone_number TEXT NOT NULL,
  mpesa_receipt TEXT,
  checkout_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check voucher by code" ON public.vouchers FOR SELECT USING (true);
CREATE POLICY "Admins can manage vouchers" ON public.vouchers FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert vouchers" ON public.vouchers FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update vouchers" ON public.vouchers FOR UPDATE USING (true);

-- Active sessions (tracks connected users)
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES public.vouchers(id) NOT NULL,
  mac_address TEXT,
  ip_address TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  bytes_up BIGINT DEFAULT 0,
  bytes_down BIGINT DEFAULT 0
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sessions" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "Admins can manage sessions" ON public.sessions FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert sessions" ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update sessions" ON public.sessions FOR UPDATE USING (true);

-- Router settings
CREATE TABLE public.router_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  router_name TEXT NOT NULL DEFAULT 'Main Router',
  router_ip TEXT,
  api_port TEXT DEFAULT '8728',
  api_username TEXT,
  api_password TEXT,
  dns_name TEXT,
  hotspot_interface TEXT DEFAULT 'wlan1',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.router_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view router settings" ON public.router_settings FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage router settings" ON public.router_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- FreeRADIUS compatible tables
CREATE TABLE public.radcheck (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  attribute TEXT NOT NULL DEFAULT '',
  op TEXT NOT NULL DEFAULT ':=',
  value TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.radcheck ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage radcheck" ON public.radcheck FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert radcheck" ON public.radcheck FOR INSERT WITH CHECK (true);

CREATE TABLE public.radacct (
  radacctid BIGSERIAL PRIMARY KEY,
  acctsessionid TEXT NOT NULL DEFAULT '',
  acctuniqueid TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  nasipaddress TEXT NOT NULL DEFAULT '',
  nasportid TEXT,
  nasporttype TEXT,
  acctstarttime TIMESTAMPTZ,
  acctupdatetime TIMESTAMPTZ,
  acctstoptime TIMESTAMPTZ,
  acctinputoctets BIGINT DEFAULT 0,
  acctoutputoctets BIGINT DEFAULT 0,
  calledstationid TEXT NOT NULL DEFAULT '',
  callingstationid TEXT NOT NULL DEFAULT '',
  acctterminatecause TEXT NOT NULL DEFAULT '',
  framedipaddress TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.radacct ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view radacct" ON public.radacct FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_router_settings_updated_at BEFORE UPDATE ON public.router_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default packages
INSERT INTO public.packages (name, description, duration_minutes, price, speed_limit) VALUES
  ('1 Hour', 'Browse for 1 hour', 60, 20.00, '5M/5M'),
  ('3 Hours', 'Browse for 3 hours', 180, 50.00, '10M/10M'),
  ('24 Hours', 'Full day access', 1440, 100.00, '15M/15M');
