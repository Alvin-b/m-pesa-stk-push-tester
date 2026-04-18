import { useState, useEffect, useMemo } from "react";
import networkBg from "@/assets/network-bg.png";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { APP_BRAND } from "@/lib/brand";
import { usePlatform } from "@/lib/platform";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Users, Package, Settings, LogOut, Wifi, Key, Plus, Trash2, Download,
  Loader2, Activity, TrendingUp, DollarSign, BarChart3, Ban, Ticket, RefreshCw,
  Calendar, ArrowUpRight, Shield, Copy, CheckCircle2, LayoutDashboard, CreditCard,
  Radio, Menu, X, ChevronRight, Bell, FileText, Wrench, Server, Globe, Network
} from "lucide-react";
import { format, subDays, startOfDay, parseISO, isToday, isThisWeek, isThisMonth } from "date-fns";
import { buildMikroTikShellHtml } from "@/lib/mikrotik";

interface VoucherRow {
  id: string;
  code: string;
  phone_number: string;
  status: string;
  created_at: string;
  mpesa_receipt: string | null;
  packages: { name: string; duration_minutes: number; price: number } | null;
}

interface PackageRow {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  speed_limit: string | null;
  is_active: boolean;
}

interface SessionRow {
  id: string;
  started_at: string;
  expires_at: string;
  is_active: boolean;
  ip_address: string | null;
  mac_address: string | null;
  vouchers: { code: string; phone_number: string; packages: { name: string } | null } | null;
}

interface RouterSettingsRow {
  id: string;
  router_name: string;
  router_ip: string | null;
  dns_name: string | null;
  hotspot_interface: string | null;
  radius_server_ip: string | null;
  radius_secret: string | null;
  radius_auth_port: number | null;
  radius_acct_port: number | null;
  api_username: string | null;
  api_password: string | null;
  api_port: string | null;
}

interface TenantRouterRow {
  id: string;
  name: string;
  site_name: string | null;
  host: string | null;
  provisioning_status: string | null;
  last_seen_at: string | null;
  last_error: string | null;
}

interface PaymentGatewayRow {
  id: string;
  provider_id: string;
  status: "disabled" | "test" | "active";
  display_name: string | null;
  config: {
    secret_key?: string;
  } | null;
  public_config: {
    public_key?: string;
  } | null;
}

type DurationUnit = "hours" | "days" | "weeks" | "months";
const DURATION_UNIT_MINUTES: Record<DurationUnit, number> = {
  hours: 60,
  days: 1440,
  weeks: 10080,
  months: 43200,
};

const CHART_COLORS = [
  "hsl(145, 63%, 42%)",
  "hsl(145, 63%, 55%)",
  "hsl(145, 63%, 30%)",
  "hsl(200, 60%, 50%)",
  "hsl(35, 80%, 55%)",
  "hsl(0, 60%, 50%)",
];

type ActiveSection = "overview" | "analytics" | "vouchers" | "sessions" | "packages" | "setup";

interface RouterScriptConfig {
  wan_interface: string;
  lan_cidr: string;
  dhcp_pool_start: string;
  dhcp_pool_end: string;
  dns_servers: string;
  bridge_ports: string;
}

const DEFAULT_ROUTER_SCRIPT_CONFIG: RouterScriptConfig = {
  wan_interface: "ether1",
  lan_cidr: "10.10.0.1/24",
  dhcp_pool_start: "10.10.0.10",
  dhcp_pool_end: "10.10.0.250",
  dns_servers: "8.8.8.8,1.1.1.1",
  bridge_ports: "",
};

const Admin = () => {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const { activeTenant, tenantMembershipRole, loading: platformLoading } = usePlatform();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [routers, setRouters] = useState<TenantRouterRow[]>([]);
  const [routerSettings, setRouterSettings] = useState<RouterSettingsRow | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const requestedSection = searchParams.get("section");
  const initialSection: ActiveSection = requestedSection === "analytics" || requestedSection === "vouchers" || requestedSection === "sessions" || requestedSection === "packages" || requestedSection === "setup"
    ? requestedSection
    : "overview";
  const [activeSection, setActiveSection] = useState<ActiveSection>(initialSection);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [newPkg, setNewPkg] = useState({ name: "", description: "", duration_value: 1, duration_unit: "hours" as DurationUnit, price: 20, speed_limit: "", device_limit: 1 });
  const [savingPkg, setSavingPkg] = useState(false);
  const [routerForm, setRouterForm] = useState({ 
    router_name: "Main Router", 
    router_ip: "10.10.0.1", 
    dns_name: "wifi.local", 
    hotspot_interface: "bridge-hotspot",
    api_username: "",
    api_password: "",
    api_port: "8728",
    radius_server_ip: "207.126.167.78",
    radius_secret: "mikrotik_radius_secret",
    radius_auth_port: 1812,
    radius_acct_port: 1813
  });
  const [routerScriptConfig, setRouterScriptConfig] = useState<RouterScriptConfig>(DEFAULT_ROUTER_SCRIPT_CONFIG);
  const [savingRouter, setSavingRouter] = useState(false);
  const [paystackGateway, setPaystackGateway] = useState<PaymentGatewayRow | null>(null);
  const [mpesaGateway, setMpesaGateway] = useState<PaymentGatewayRow | null>(null);
  const [mpesaForm, setMpesaForm] = useState({
    display_name: "M-Pesa",
    status: "disabled" as "disabled" | "test" | "active",
    consumer_key: "",
    consumer_secret: "",
    passkey: "",
    shortcode: "",
  });
  const [paystackForm, setPaystackForm] = useState({
    display_name: "Paystack",
    status: "disabled" as "disabled" | "test" | "active",
    public_key: "",
    secret_key: "",
  });
  const [savingGateway, setSavingGateway] = useState(false);

  const [genPkgId, setGenPkgId] = useState("");
  const [genPhone, setGenPhone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const canAccessAdmin = isAdmin || !!tenantMembershipRole;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login", { replace: true });
      return;
    }

    if (!authLoading && !platformLoading && user && !canAccessAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [authLoading, platformLoading, user, canAccessAdmin, navigate]);

  useEffect(() => {
    if (user) loadData();
  }, [user, activeTenant?.id]);

  useEffect(() => {
    const storageKey = activeTenant?.id ? `router-script-config:${activeTenant.id}` : null;
    if (!storageKey) {
      setRouterScriptConfig(DEFAULT_ROUTER_SCRIPT_CONFIG);
      return;
    }

    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      setRouterScriptConfig(DEFAULT_ROUTER_SCRIPT_CONFIG);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Partial<RouterScriptConfig>;
      setRouterScriptConfig({ ...DEFAULT_ROUTER_SCRIPT_CONFIG, ...parsed });
    } catch {
      setRouterScriptConfig(DEFAULT_ROUTER_SCRIPT_CONFIG);
    }
  }, [activeTenant?.id]);

  useEffect(() => {
    if (!activeTenant?.id) return;
    localStorage.setItem(`router-script-config:${activeTenant.id}`, JSON.stringify(routerScriptConfig));
  }, [activeTenant?.id, routerScriptConfig]);

  useEffect(() => {
    if (requestedSection === "analytics" || requestedSection === "vouchers" || requestedSection === "sessions" || requestedSection === "packages" || requestedSection === "setup" || requestedSection === "overview") {
      setActiveSection(requestedSection);
    }
  }, [requestedSection]);

  const hasScopedTenant = !!activeTenant?.id && activeTenant.id !== "legacy-fallback";

  const loadData = async () => {
    setLoadingData(true);
    if (!hasScopedTenant) {
      setVouchers([]);
      setPackages([]);
      setSessions([]);
      setRouters([]);
      setRouterSettings(null);
      setPaystackGateway(null);
      setMpesaGateway(null);
      setPaystackForm({
        display_name: "Paystack",
        status: "disabled",
        public_key: "",
        secret_key: "",
      });
      setMpesaForm({
        display_name: "M-Pesa",
        status: "disabled",
        consumer_key: "",
        consumer_secret: "",
        passkey: "",
        shortcode: "",
      });
      setLoadingData(false);
      return;
    }

    let vouchersQuery = supabase
      .from("vouchers")
      .select("*, packages(name, duration_minutes, price)")
      .eq("tenant_id", activeTenant.id)
      .order("created_at", { ascending: false })
      .limit(500);

    let packagesQuery = supabase
      .from("packages")
      .select("*")
      .eq("tenant_id", activeTenant.id)
      .order("price");

    let sessionsQuery = supabase
      .from("sessions")
      .select("*, vouchers(code, phone_number, packages(name))")
      .eq("tenant_id", activeTenant.id)
      .order("started_at", { ascending: false })
      .limit(200);

    let routerSettingsQuery = supabase
      .from("router_settings")
      .eq("tenant_id", activeTenant.id)
      .select("*")
      .limit(1);
    let routersQuery = supabase
      .from("routers")
      .select("id, name, site_name, host, provisioning_status, last_seen_at, last_error")
      .eq("tenant_id", activeTenant.id)
      .order("name");
    let gatewayQuery = supabase
      .from("tenant_payment_gateways")
      .select("id, provider_id, status, display_name, config, public_config")
      .eq("tenant_id", activeTenant.id);

    const [vRes, pRes, sRes, rRes, routerRes, gRes] = await Promise.all([
      vouchersQuery,
      packagesQuery,
      sessionsQuery,
      routerSettingsQuery.maybeSingle(),
      routersQuery,
      gatewayQuery,
    ]);
    if (vRes.data) setVouchers(vRes.data as unknown as VoucherRow[]);
    if (pRes.data) setPackages(pRes.data as PackageRow[]);
    if (sRes.data) setSessions(sRes.data as unknown as SessionRow[]);
    setRouters((routerRes.data as TenantRouterRow[] | null) ?? []);
    if (rRes.data) {
      setRouterSettings(rRes.data as RouterSettingsRow);
      setRouterForm({
        router_name: rRes.data.router_name || "Main Router",
        router_ip: rRes.data.router_ip || "",
        dns_name: rRes.data.dns_name || "",
        hotspot_interface: rRes.data.hotspot_interface || "wlan1",
        api_username: rRes.data.api_username || "",
        api_password: rRes.data.api_password || "",
        api_port: String(rRes.data.api_port || "8728"),
        radius_server_ip: rRes.data.radius_server_ip || "",
        radius_secret: rRes.data.radius_secret || "",
        radius_auth_port: rRes.data.radius_auth_port || 1812,
        radius_acct_port: rRes.data.radius_acct_port || 1813,
      });
      setRouterScriptConfig((current) => ({
        ...current,
        lan_cidr: rRes.data.router_ip ? `${rRes.data.router_ip}/24` : current.lan_cidr,
      }));
    }
    const gatewayRows = (gRes.data as unknown as PaymentGatewayRow[] | null) ?? [];
    const paystackGatewayRow = gatewayRows.find((gateway) => gateway.provider_id === "paystack") ?? null;
    const mpesaGatewayRow = gatewayRows.find((gateway) => gateway.provider_id === "mpesa") ?? null;

    if (paystackGatewayRow) {
      const gateway = paystackGatewayRow;
      setPaystackGateway(gateway);
      setPaystackForm({
        display_name: gateway.display_name || "Paystack",
        status: gateway.status,
        public_key: gateway.public_config?.public_key || "",
        secret_key: gateway.config?.secret_key || "",
      });
    } else {
      setPaystackGateway(null);
      setPaystackForm({
        display_name: "Paystack",
        status: "disabled",
        public_key: "",
        secret_key: "",
      });
    }
    if (mpesaGatewayRow) {
      const gateway = mpesaGatewayRow;
      setMpesaGateway(gateway);
      setMpesaForm({
        display_name: gateway.display_name || "M-Pesa",
        status: gateway.status,
        consumer_key: gateway.config?.consumer_key || "",
        consumer_secret: gateway.config?.consumer_secret || "",
        passkey: gateway.config?.passkey || "",
        shortcode: gateway.config?.shortcode || "",
      });
    } else {
      setMpesaGateway(null);
      setMpesaForm({
        display_name: "M-Pesa",
        status: "disabled",
        consumer_key: "",
        consumer_secret: "",
        passkey: "",
        shortcode: "",
      });
    }
    setLoadingData(false);
  };

  const revenueStats = useMemo(() => {
    const paid = vouchers.filter(v => v.status !== "revoked" && v.packages?.price);
    const total = paid.reduce((s, v) => s + (v.packages?.price || 0), 0);
    const today = paid.filter(v => isToday(parseISO(v.created_at)));
    const todayRev = today.reduce((s, v) => s + (v.packages?.price || 0), 0);
    const week = paid.filter(v => isThisWeek(parseISO(v.created_at)));
    const weekRev = week.reduce((s, v) => s + (v.packages?.price || 0), 0);
    const month = paid.filter(v => isThisMonth(parseISO(v.created_at)));
    const monthRev = month.reduce((s, v) => s + (v.packages?.price || 0), 0);
    return { total, todayRev, weekRev, monthRev, todayCount: today.length, weekCount: week.length, monthCount: month.length };
  }, [vouchers]);

  const dailyChartData = useMemo(() => {
    const days: { date: string; revenue: number; sales: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dayStr = format(day, "yyyy-MM-dd");
      const dayVouchers = vouchers.filter(v => v.status !== "revoked" && v.created_at.startsWith(dayStr));
      days.push({
        date: format(day, "MMM dd"),
        revenue: dayVouchers.reduce((s, v) => s + (v.packages?.price || 0), 0),
        sales: dayVouchers.length,
      });
    }
    return days;
  }, [vouchers]);

  const packageBreakdown = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};
    vouchers.filter(v => v.status !== "revoked" && v.packages).forEach(v => {
      const name = v.packages!.name;
      if (!map[name]) map[name] = { name, count: 0, revenue: 0 };
      map[name].count++;
      map[name].revenue += v.packages!.price;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [vouchers]);

  const tenantPortalPath = activeTenant?.slug ? `/portal/${activeTenant.slug}` : "/portal";
  const isSuperAdminTenantView = isAdmin && tenantMembershipRole === "platform_admin";

  const routerNodes = useMemo(() => {
    if (routers.length > 0) {
      return routers.map((router) => {
        const status =
          router.provisioning_status === "active" || router.provisioning_status === "successful"
            ? "online"
            : router.provisioning_status === "failed"
              ? "offline"
              : "warning";

        return {
          id: router.id,
          name: router.name,
          subtitle: router.site_name || router.host || "Tenant router",
          status,
          statusLabel: status === "online" ? "Online" : status === "offline" ? "Offline" : "Pending",
          uptimeLabel: router.last_seen_at
            ? `Seen ${format(parseISO(router.last_seen_at), "MMM dd, HH:mm")}`
            : router.last_error
              ? "Needs attention"
              : "Awaiting sync",
        };
      });
    }

    if (routerSettings) {
      return [
        {
          id: routerSettings.id,
          name: routerSettings.router_name || "Main Router",
          subtitle: routerSettings.router_ip || routerSettings.dns_name || "Router endpoint pending",
          status: "warning" as const,
          statusLabel: "Configured",
          uptimeLabel: "Awaiting first live sync",
        },
      ];
    }

    return [];
  }, [routers, routerSettings]);

  const routerSummary = useMemo(() => {
    return routerNodes.reduce(
      (acc, router) => {
        if (router.status === "online") acc.online += 1;
        if (router.status === "offline") acc.offline += 1;
        if (router.status === "warning") acc.warning += 1;
        return acc;
      },
      { online: 0, offline: 0, warning: 0 },
    );
  }, [routerNodes]);

  const activeVoucherCount = vouchers.filter((voucher) => voucher.status === "active").length;
  const expiredVoucherCount = vouchers.filter((voucher) => voucher.status === "expired" || voucher.status === "revoked").length;
  const activeSessions = sessions.filter(s => s.is_active && new Date(s.expires_at) > new Date());
  const totalOnlineUsers = activeSessions.length;
  const routerViewCards = [
    {
      id: "tenant-summary",
      name: activeTenant?.name || "ISP Summary",
      online: routerSummary.online,
      active: activeVoucherCount,
      expired: expiredVoucherCount,
    },
  ];
  const dashboardCards = [
    {
      label: "Income Today",
      value: `Ksh. ${revenueStats.todayRev.toLocaleString()}`,
      sub: `${revenueStats.todayCount} sale${revenueStats.todayCount === 1 ? "" : "s"} recorded today`,
      color: "from-[#3768ea] to-[#2d5ad1]",
      icon: <CreditCard className="h-9 w-9 text-white/20" />,
    },
    {
      label: "Income This Month",
      value: `Ksh. ${revenueStats.monthRev.toLocaleString()}`,
      sub: `${revenueStats.monthCount} sale${revenueStats.monthCount === 1 ? "" : "s"} this month`,
      color: "from-[#13a36f] to-[#0f9a6a]",
      icon: <BarChart3 className="h-9 w-9 text-white/20" />,
    },
    {
      label: "Active/Expired",
      value: `${activeVoucherCount}/${expiredVoucherCount}`,
      sub: "Voucher lifecycle right now",
      color: "from-[#ef9206] to-[#e07d00]",
      icon: <Users className="h-9 w-9 text-white/20" />,
    },
    {
      label: "Live Sessions",
      value: totalOnlineUsers.toLocaleString(),
      sub: `${sessions.length.toLocaleString()} total session record${sessions.length === 1 ? "" : "s"}`,
      color: "from-[#1d9dc3] to-[#168aae]",
      icon: <Wifi className="h-9 w-9 text-white/20" />,
    },
    {
      label: "Routers Online",
      value: routerSummary.online.toLocaleString(),
      sub: `${routerNodes.length.toLocaleString()} router${routerNodes.length === 1 ? "" : "s"} registered`,
      color: "from-[#8a3ffc] to-[#7a2cf6]",
      icon: <Radio className="h-9 w-9 text-white/20" />,
    },
    {
      label: "Routers Pending",
      value: routerSummary.warning.toLocaleString(),
      sub: `${routerSummary.offline.toLocaleString()} offline`,
      color: "from-[#1ea39b] to-[#1a958e]",
      icon: <Network className="h-9 w-9 text-white/20" />,
    },
  ];

  const addPackage = async () => {
    setSavingPkg(true);
    const durationMinutes = newPkg.duration_value * DURATION_UNIT_MINUTES[newPkg.duration_unit];
    await supabase.from("packages").insert([{
      name: newPkg.name,
      description: newPkg.description || null,
      duration_minutes: durationMinutes,
      price: newPkg.price,
      speed_limit: newPkg.speed_limit || null,
      device_limit: newPkg.device_limit,
      ...(hasScopedTenant && activeTenant?.id ? { tenant_id: activeTenant.id } : {}),
    }]);
    setNewPkg({ name: "", description: "", duration_value: 1, duration_unit: "hours", price: 20, speed_limit: "", device_limit: 1 });
    setSavingPkg(false);
    loadData();
  };

  const deletePackage = async (id: string) => {
    let query = supabase.from("packages").update({ is_active: false }).eq("id", id);
    if (hasScopedTenant && activeTenant?.id) {
      query = query.eq("tenant_id", activeTenant.id);
    }
    await query;
    loadData();
  };

  const generateVoucher = async () => {
    if (!genPkgId) return;
    setGenerating(true);
    setGeneratedCode("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-voucher", {
        body: { packageId: genPkgId, phoneNumber: genPhone || undefined, tenantId: activeTenant?.id },
      });
      if (error) throw error;
      if (data?.code) setGeneratedCode(data.code);
      loadData();
    } catch (err: any) {
      console.error(err);
    }
    setGenerating(false);
  };

  const revokeVoucher = async (id: string, code: string) => {
    setRevoking(id);
    try {
      await supabase.functions.invoke("revoke-voucher", { body: { voucherId: id, code, tenantId: activeTenant?.id } });
      loadData();
    } catch (err: any) {
      console.error(err);
    }
    setRevoking(null);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const saveRouterSettings = async () => {
    setSavingRouter(true);
    if (routerSettings?.id) {
      let query = supabase.from("router_settings").update(routerForm).eq("id", routerSettings.id);
      if (hasScopedTenant && activeTenant?.id) {
        query = query.eq("tenant_id", activeTenant.id);
      }
      await query;
    } else {
      await supabase.from("router_settings").insert([{
        ...routerForm,
        created_by: user?.id,
        ...(hasScopedTenant && activeTenant?.id ? { tenant_id: activeTenant.id } : {}),
      }]);
    }
    setSavingRouter(false);
    loadData();
  };

  const savePaystackGateway = async () => {
    if (!hasScopedTenant || !activeTenant?.id) {
      return;
    }

    setSavingGateway(true);

    const payload = {
      tenant_id: activeTenant.id,
      provider_id: "paystack" as const,
      display_name: paystackForm.display_name.trim() || "Paystack",
      status: paystackForm.status,
      config: {
        secret_key: paystackForm.secret_key.trim(),
      },
      public_config: {
        public_key: paystackForm.public_key.trim(),
      },
    };

    let response;
    if (paystackGateway?.id) {
      response = await supabase
        .from("tenant_payment_gateways")
        .update(payload)
        .eq("id", paystackGateway.id)
        .eq("tenant_id", activeTenant.id);
    } else {
      response = await supabase.from("tenant_payment_gateways").insert(payload);
    }

    if (response.error) {
      console.error(response.error);
    }

    setSavingGateway(false);
    loadData();
  };

  const saveMpesaGateway = async () => {
    if (!hasScopedTenant || !activeTenant?.id) {
      return;
    }

    setSavingGateway(true);

    const payload = {
      tenant_id: activeTenant.id,
      provider_id: "mpesa" as const,
      display_name: mpesaForm.display_name.trim() || "M-Pesa",
      status: mpesaForm.status,
      config: {
        consumer_key: mpesaForm.consumer_key.trim(),
        consumer_secret: mpesaForm.consumer_secret.trim(),
        passkey: mpesaForm.passkey.trim(),
        shortcode: mpesaForm.shortcode.trim(),
      },
      public_config: {},
    };

    let response;
    if (mpesaGateway?.id) {
      response = await supabase
        .from("tenant_payment_gateways")
        .update(payload)
        .eq("id", mpesaGateway.id)
        .eq("tenant_id", activeTenant.id);
    } else {
      response = await supabase.from("tenant_payment_gateways").insert(payload);
    }

    if (response.error) {
      console.error(response.error);
    }

    setSavingGateway(false);
    loadData();
  };

  const formatDuration = (minutes: number) => {
    if (minutes >= 43200) return `${Math.floor(minutes / 43200)} Month${minutes >= 86400 ? "s" : ""}`;
    if (minutes >= 10080) return `${Math.floor(minutes / 10080)} Week${minutes >= 20160 ? "s" : ""}`;
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)} Day${minutes >= 2880 ? "s" : ""}`;
    if (minutes >= 60) return `${Math.floor(minutes / 60)} Hour${minutes >= 120 ? "s" : ""}`;
    return `${minutes} Min`;
  };

  const timeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
  };

  const generateRscScript = () => {
    const portalPath = activeTenant?.slug ? `/portal/${activeTenant.slug}` : "/portal";
    const portalUrl = window.location.origin + portalPath;
    const assetBaseUrl = `${window.location.origin}/captive`;
    const iface = routerForm.hotspot_interface || "bridge-hotspot";
    const dns = routerForm.dns_name || "wifi.local";
    const lanCidr = routerScriptConfig.lan_cidr.trim() || DEFAULT_ROUTER_SCRIPT_CONFIG.lan_cidr;
    const wanInterface = routerScriptConfig.wan_interface.trim() || DEFAULT_ROUTER_SCRIPT_CONFIG.wan_interface;
    const dnsServers = routerScriptConfig.dns_servers.trim() || DEFAULT_ROUTER_SCRIPT_CONFIG.dns_servers;
    const bridgePorts = routerScriptConfig.bridge_ports
      .split(",")
      .map((port) => port.trim())
      .filter(Boolean);
    const hotspotUrl = new URL(portalUrl);
    const assetUrl = new URL(assetBaseUrl);
    const portalHost = hotspotUrl.hostname;
    const assetHost = assetUrl.hostname;
    const radiusIp = routerForm.radius_server_ip || "207.126.167.78";
    const radiusSecret = routerForm.radius_secret || "mikrotik_radius_secret";
    const authPort = routerForm.radius_auth_port || 1812;
    const acctPort = routerForm.radius_acct_port || 1813;
    const [lanIp, prefixText] = lanCidr.split("/");
    const prefix = Number(prefixText || 24);
    const poolStart = routerScriptConfig.dhcp_pool_start.trim() || DEFAULT_ROUTER_SCRIPT_CONFIG.dhcp_pool_start;
    const poolEnd = routerScriptConfig.dhcp_pool_end.trim() || DEFAULT_ROUTER_SCRIPT_CONFIG.dhcp_pool_end;

    const ipToInt = (ipAddress: string) => ipAddress.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
    const intToIp = (value: number) => [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = intToIp(ipToInt(lanIp) & mask);
    const subnet = `${network}/${prefix}`;

    const script = [
      "# ==========================================",
      "# MikroTik Complete Hotspot Billing Setup",
      `# Generated for ${activeTenant?.name || APP_BRAND}`,
      "# ==========================================",
      "",
      "# --- 1. Create Bridge for Hotspot ---",
      "/interface bridge add name=\"" + iface + "\" comment=\"" + (activeTenant?.name || APP_BRAND) + " Hotspot Bridge\"",
      ...bridgePorts.map((port) => `/interface bridge port add bridge="${iface}" interface="${port}"`),
      "",
      "# --- 2. IP Addressing ---",
      "/ip address add address=" + lanCidr + " interface=\"" + iface + "\"",
      "",
      "# --- 3. DHCP Server ---",
      "/ip pool add name=hotspot-pool ranges=" + poolStart + "-" + poolEnd,
      "/ip dhcp-server add name=hotspot-dhcp interface=\"" + iface + "\" address-pool=hotspot-pool disabled=no",
      "/ip dhcp-server network add address=" + subnet + " gateway=" + lanIp + " dns-server=" + dnsServers,
      "",
      "# --- 4. DNS ---",
      "/ip dns set allow-remote-requests=yes servers=" + dnsServers,
      "",
      "# --- 5. NAT Masquerade ---",
      "/ip firewall nat add chain=srcnat out-interface=\"" + wanInterface + "\" action=masquerade comment=\"Hotspot NAT\"",
      "",
      "# --- 6. RADIUS Server ---",
      "/radius add service=hotspot address=" + radiusIp + " secret=\"" + radiusSecret + "\" authentication-port=" + authPort + " accounting-port=" + acctPort + " timeout=3000ms",
      "/radius incoming set accept=yes port=3799",
      "",
      "# --- 7. Hotspot Profile ---",
      "/ip hotspot profile add name=\"billing-profile\" hotspot-address=" + lanIp + " dns-name=\"" + dns + "\" \\",
      "    html-directory=hotspot login-by=http-chap,http-pap,cookie http-cookie-lifetime=1d \\",
      "    use-radius=yes radius-interim-update=00:05:00",
      "",
      "# --- 8. Hotspot Server ---",
      "/ip hotspot add name=\"billing-hotspot\" interface=\"" + iface + "\" profile=\"billing-profile\" disabled=no",
      "",
      "# --- 9. Walled Garden (allow billing portal and authentication bridge) ---",
      "/ip hotspot walled-garden ip add dst-host=" + portalHost + " action=accept comment=\"" + (activeTenant?.name || APP_BRAND) + " Portal\"",
      "/ip hotspot walled-garden add dst-host=" + portalHost + " action=allow comment=\"" + (activeTenant?.name || APP_BRAND) + " Portal\"",
      ...(assetHost !== portalHost ? [
        "/ip hotspot walled-garden ip add dst-host=" + assetHost + " action=accept comment=\"Portal Shell Assets\"",
        "/ip hotspot walled-garden add dst-host=" + assetHost + " action=allow comment=\"Portal Shell Assets\"",
      ] : []),
      "/ip hotspot walled-garden add dst-host=*.supabase.co action=allow comment=\"Supabase Backend\"",
      "",
      "# --- 10. Firewall - Allow RADIUS Traffic ---",
      "/ip firewall filter add chain=input protocol=udp dst-port=3799 action=accept comment=\"Allow RADIUS CoA\"",
      "",
      ":log info \"" + (activeTenant?.name || APP_BRAND) + " hotspot configuration applied successfully\"",
    ].join("\n");
    const blob = new Blob([script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "hotspot-setup.rsc"; a.click();
    URL.revokeObjectURL(url);
  };

  const generateLoginHtml = () => {
    const portalPath = activeTenant?.slug ? `/portal/${activeTenant.slug}` : "/portal";
    const portalUrl = window.location.origin + portalPath;
    const assetBaseUrl = `${window.location.origin}/captive`;
    const html = buildMikroTikShellHtml({
      portalUrl,
      title: `${activeTenant?.name || APP_BRAND} Captive Portal`,
      assetBaseUrl,
    });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "login.html"; a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || platformLoading || loadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-mono">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    revenue: { label: "Revenue (KES)", color: "hsl(145, 63%, 42%)" },
    sales: { label: "Sales", color: "hsl(145, 63%, 55%)" },
  };

  const sidebarItems: { section: ActiveSection; icon: React.ReactNode; label: string; badge?: string }[] = [
    { section: "overview", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
    { section: "sessions", icon: <Users className="h-4 w-4" />, label: "Customers" },
    { section: "vouchers", icon: <Ticket className="h-4 w-4" />, label: "Vouchers" },
    { section: "packages", icon: <Package className="h-4 w-4" />, label: "Packages" },
    { section: "analytics", icon: <BarChart3 className="h-4 w-4" />, label: "Reports" },
    { section: "setup", icon: <Network className="h-4 w-4" />, label: "Router Setup" },
  ];

  const navigateTo = (section: ActiveSection) => {
    setActiveSection(section);
    setSidebarOpen(false);
  };

  return (
    <div
      className="relative flex min-h-screen overflow-hidden bg-[#0a1222] text-white"
      style={{ backgroundImage: `linear-gradient(rgba(8, 15, 30, 0.96), rgba(8, 15, 30, 0.98)), url(${networkBg})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}
    >
      <div className="absolute inset-x-0 top-0 z-20 h-4 bg-[#aa1559]" />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed left-0 top-0 z-50 flex h-screen w-[230px] flex-col border-r border-white/10 bg-[#10192c] transition-transform lg:sticky lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center border-b border-white/10 px-4 pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a2740] text-cyan-300">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{APP_BRAND}</p>
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">ISP Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-0 py-3">
          {sidebarItems.map((item) => (
            <div key={`${item.label}-${item.section}`}>
              <button
                onClick={() => navigateTo(item.section)}
                className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-md px-4 py-3 text-left text-[15px] transition-colors ${
                  activeSection === item.section
                    ? "bg-[#17233c] text-white"
                    : "text-slate-100 hover:bg-[#17233c]/80"
                }`}
              >
                <span className="text-slate-300">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded bg-[#14b866] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                    {item.badge}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-3 flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#17233c]">
              <Shield className="h-4 w-4 text-cyan-300" />
            </div>
            <span className="flex-1 truncate text-[11px] text-slate-400">{user?.email}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-xs text-slate-300 hover:bg-[#17233c] hover:text-white">
            <LogOut className="mr-2 h-3.5 w-3.5" /> Sign Out
          </Button>
        </div>
      </aside>

      <main className="relative z-10 min-h-screen flex-1 bg-[#0d1527] pt-4">
        <header className="sticky top-0 z-30 flex items-center border-b border-white/10 bg-[#0d1527]/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-1.5 hover:bg-white/5 lg:hidden">
              <Menu className="h-5 w-5 text-slate-300" />
            </button>
            <div>
              <h1 className="text-3xl font-semibold text-white">{activeSection === "overview" ? "Dashboard" : activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}</h1>
              <p className="text-[11px] text-slate-400">
                {APP_BRAND} / {activeTenant?.name || "Legacy ISP"} / {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isSuperAdminTenantView && (
              <span className="hidden rounded-full bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300 md:inline-flex">
                Scoped Tenant Session
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(tenantPortalPath, "_blank", "noopener,noreferrer")}
              className="text-xs text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> Portal
            </Button>
            <Button variant="ghost" size="sm" onClick={loadData} className="text-xs text-slate-300 hover:bg-white/5 hover:text-white">
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </header>

        <div className="space-y-5 p-4 md:p-6">
          {activeSection === "overview" && (
            <>
              <Card className="overflow-hidden border border-[#243252] bg-[#121a2f] text-white shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
                <CardHeader className="border-b border-white/10 bg-[#21336b] px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <CardTitle className="flex items-center gap-2 text-[20px] font-semibold">
                      <Radio className="h-5 w-5 text-white" /> Router View
                    </CardTitle>
                    <div className="w-full max-w-[340px] rounded-sm border border-white/15 bg-[#24375d] px-4 py-2 text-sm text-white/95">
                      {activeTenant?.name || "This ISP"} Router Summary
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    {(routerViewCards.length > 0 ? routerViewCards : [{
                      id: "fallback-router",
                      name: activeTenant?.name || "Main Router",
                      online: routerSummary.online,
                      active: activeVoucherCount,
                      expired: expiredVoucherCount,
                    }]).map((router) => (
                      <div key={`${router.id}-summary`} className="rounded-lg border border-white/10 bg-[#192238] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <p className="text-[13px] font-semibold uppercase tracking-wide text-[#26a4ff]">{router.name}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                          <span className="text-[#2fd06d]">Online {router.online}</span>
                          <span className="text-[#4ea0ff]">Active {router.active}</span>
                          <span className="text-[#ff4141]">Expired {router.expired}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {routerNodes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
                      <Radio className="mx-auto h-8 w-8 text-slate-500" />
                      <p className="mt-4 font-medium text-white">No routers registered for this ISP yet.</p>
                      <p className="mt-2 text-sm text-slate-400">
                        Add routers in setup so each ISP dashboard shows its own network instead of a shared system view.
                      </p>
                    </div>
                  ) : (
                    <div className="hidden grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {routerNodes.map((router) => (
                        <div key={router.id} className="rounded-2xl border border-white/10 bg-[#19233a] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                          <p className="font-mono text-sm font-semibold uppercase tracking-wide text-cyan-200">{router.name}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
                            <span className={router.status === "online" ? "text-emerald-300" : router.status === "offline" ? "text-rose-300" : "text-amber-200"}>
                              ● {router.statusLabel}
                            </span>
                            <span>• {router.subtitle}</span>
                          </div>
                          <p className="mt-3 text-xs text-slate-400">{router.uptimeLabel}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {dashboardCards.map((card) => (
                  <Card key={card.label} className={`overflow-hidden border-0 bg-gradient-to-r ${card.color} text-white shadow-[0_14px_30px_rgba(0,0,0,0.16)]`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85">{card.label}</p>
                          <p className="mt-3 text-4xl font-semibold leading-none">{card.value}</p>
                        </div>
                        <div>{card.icon}</div>
                      </div>
                      <div className="mt-5 border-t border-white/20 pt-3 text-sm text-white/90">{card.sub}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="rounded border border-white/10 bg-[#1a2334] px-4 py-4 text-white">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#34d67b]">M-Pesa STK Push Service</p>
                    <p className="mt-1 text-sm text-[#7fe5a6]">
                      Live - Safaricom is working
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => window.open(tenantPortalPath, "_blank", "noopener,noreferrer")}
                    >
                      <ArrowUpRight className="mr-2 h-4 w-4" />
                      Open Portal
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => navigate("/billing" + (isSuperAdminTenantView && activeTenant?.slug ? `?tenant=${encodeURIComponent(activeTenant.slug)}` : ""))}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      View Invoices
                    </Button>
                  </div>
                </div>
              </div>

              <Card className="overflow-hidden border border-[#243252] bg-[#121a2f] text-white">
                <CardHeader className="border-b border-white/10 bg-[#21336b] px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <CardTitle className="flex items-center gap-2 text-[20px] font-semibold">
                      <Activity className="h-5 w-5 text-white" /> Router Status
                    </CardTitle>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded bg-[#22c55e] px-3 py-1 text-white">{routerSummary.online} Online</span>
                      <span className="rounded bg-[#ff6b4a] px-3 py-1 text-white">{routerSummary.offline} Offline</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {routerNodes.length === 0 ? (
                    <p className="text-sm text-slate-400">Router health will appear once this ISP adds routers.</p>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-3">
                      {routerNodes.map((router) => (
                        <div key={`${router.id}-status`} className="rounded-xl border border-white/10 bg-[#141d31] p-4 shadow-[inset_3px_0_0_0_#20cf67]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#1fda73] text-[#0c3520]">
                                <CheckCircle2 className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-base font-semibold text-white">{router.name}</p>
                                <p className="mt-1 text-xs text-slate-400">{router.statusLabel} - Up: {router.uptimeLabel}</p>
                              </div>
                            </div>
                            <div className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                              {router.subtitle}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-[#121a2f] text-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Button onClick={() => setActiveSection("packages")} className="h-12 bg-[#3768ea] text-xs hover:bg-[#2d5ad1]">
                      <Plus className="h-4 w-4 mr-1.5" /> Add Plan
                    </Button>
                    <Button onClick={() => setActiveSection("vouchers")} variant="outline" className="h-12 border-white/15 bg-white/5 text-xs text-white hover:bg-white/10">
                      <Ticket className="h-4 w-4 mr-1.5" /> Generate Code
                    </Button>
                    <Button onClick={() => setActiveSection("analytics")} variant="outline" className="h-12 border-white/15 bg-white/5 text-xs text-white hover:bg-white/10">
                      <BarChart3 className="h-4 w-4 mr-1.5" /> Reports
                    </Button>
                    <Button onClick={() => setActiveSection("setup")} variant="outline" className="h-12 border-white/15 bg-white/5 text-xs text-white hover:bg-white/10">
                      <Settings className="h-4 w-4 mr-1.5" /> Router Setup
                    </Button>
                    <Button onClick={() => navigate("/billing" + (isSuperAdminTenantView && activeTenant?.slug ? `?tenant=${encodeURIComponent(activeTenant.slug)}` : ""))} variant="outline" className="h-12 border-white/15 bg-white/5 text-xs text-white hover:bg-white/10">
                      <CreditCard className="h-4 w-4 mr-1.5" /> Invoices
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ANALYTICS */}
          {activeSection === "analytics" && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Total Revenue</p>
                    <p className="text-2xl font-bold font-mono text-foreground mt-1">KES {revenueStats.total.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">Today</p>
                    <p className="text-2xl font-bold font-mono text-foreground mt-1">KES {revenueStats.todayRev.toLocaleString()}</p>
                    <p className="text-[10px] text-primary font-mono">{revenueStats.todayCount} sales</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">This Week</p>
                    <p className="text-2xl font-bold font-mono text-foreground mt-1">KES {revenueStats.weekRev.toLocaleString()}</p>
                    <p className="text-[10px] text-primary font-mono">{revenueStats.weekCount} sales</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">This Month</p>
                    <p className="text-2xl font-bold font-mono text-foreground mt-1">KES {revenueStats.monthRev.toLocaleString()}</p>
                    <p className="text-[10px] text-primary font-mono">{revenueStats.monthCount} sales</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-mono text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" /> Revenue (Last 14 Days)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer config={chartConfig} className="h-[280px] w-full">
                      <BarChart data={dailyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
                         <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(215, 16%, 47%)" }} />
                         <YAxis tick={{ fontSize: 10, fill: "hsl(215, 16%, 47%)" }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="revenue" fill="hsl(145, 63%, 42%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="font-mono text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" /> Package Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {packageBreakdown.length === 0 ? (
                      <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
                    ) : (
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={packageBreakdown} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                              {packageBreakdown.map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="space-y-1.5 mt-2">
                      {packageBreakdown.slice(0, 4).map((p, i) => (
                        <div key={p.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="text-muted-foreground font-mono">{p.name}</span>
                          </div>
                          <span className="font-mono text-foreground">KES {p.revenue.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* VOUCHERS */}
          {activeSection === "vouchers" && (
            <div className="space-y-4">
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-primary" /> Generate Voucher
                  </CardTitle>
                  <CardDescription className="text-xs">Manually create a voucher code for a customer</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Select value={genPkgId} onValueChange={setGenPkgId}>
                      <SelectTrigger className="font-mono bg-muted/50 text-xs flex-1">
                        <SelectValue placeholder="Select package" />
                      </SelectTrigger>
                      <SelectContent>
                        {packages.filter(p => p.is_active).map(p => (
                          <SelectItem key={p.id} value={p.id} className="font-mono text-xs">
                            {p.name} — KES {p.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Phone (optional)" value={genPhone} onChange={e => setGenPhone(e.target.value)} className="font-mono bg-muted/50 text-xs flex-1" />
                    <Button onClick={generateVoucher} disabled={generating || !genPkgId} className="font-mono text-xs shrink-0">
                      {generating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Generate
                    </Button>
                  </div>
                  {generatedCode && (
                    <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Generated code:</p>
                        <p className="font-mono font-bold text-lg text-primary tracking-[0.2em]">{generatedCode}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyCode(generatedCode)} className="font-mono text-xs">
                        {copiedCode ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-mono text-sm">All Vouchers</CardTitle>
                    <span className="text-xs font-mono text-muted-foreground">{vouchers.length} total</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-mono text-xs">Code</TableHead>
                          <TableHead className="font-mono text-xs">Phone</TableHead>
                          <TableHead className="text-xs">Package</TableHead>
                          <TableHead className="font-mono text-[10px]">Receipt</TableHead>
                          <TableHead className="text-[10px] text-muted-foreground">Created</TableHead>
                          <TableHead className="font-mono text-xs">Status</TableHead>
                          <TableHead className="font-mono text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vouchers.filter(v => v.status !== "revoked").length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-xs">No vouchers yet</TableCell></TableRow>
                        ) : vouchers.filter(v => v.status !== "revoked").map(v => (
                          <TableRow key={v.id}>
                            <TableCell className="font-mono font-bold text-primary text-xs">{v.code}</TableCell>
                            <TableCell className="font-mono text-xs">{v.phone_number}</TableCell>
                            <TableCell className="text-xs">{v.packages?.name}</TableCell>
                            <TableCell className="font-mono text-[10px] text-muted-foreground">{v.mpesa_receipt || "—"}</TableCell>
                            <TableCell className="text-[10px] text-muted-foreground">{format(parseISO(v.created_at), "MMM dd, HH:mm")}</TableCell>
                            <TableCell>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                                v.status === "active" ? "bg-primary/10 text-primary" :
                                v.status === "used" ? "bg-muted text-muted-foreground" :
                                "bg-destructive/10 text-destructive"
                              }`}>{v.status}</span>
                            </TableCell>
                            <TableCell>
                              {v.status === "active" && (
                                <Button variant="ghost" size="sm" onClick={() => revokeVoucher(v.id, v.code)} disabled={revoking === v.id} className="text-destructive hover:text-destructive h-7 text-[10px] font-mono">
                                  {revoking === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3 mr-1" />}
                                  Revoke
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* SESSIONS */}
          {activeSection === "sessions" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-mono text-sm">Active Sessions</CardTitle>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">{activeSessions.length} online</span>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono text-xs">Code</TableHead>
                      <TableHead className="font-mono text-xs">Phone</TableHead>
                      <TableHead className="font-mono text-xs">Package</TableHead>
                      <TableHead className="text-[10px] text-muted-foreground">Started</TableHead>
                      <TableHead className="font-mono text-xs">Time Left</TableHead>
                      <TableHead className="font-mono text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-xs">No sessions yet</TableCell></TableRow>
                    ) : sessions.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono font-bold text-primary text-xs">{s.vouchers?.code}</TableCell>
                        <TableCell className="font-mono text-xs">{s.vouchers?.phone_number}</TableCell>
                        <TableCell className="text-xs">{s.vouchers?.packages?.name}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{format(parseISO(s.started_at), "MMM dd, HH:mm")}</TableCell>
                        <TableCell className="font-mono text-xs">{s.is_active ? timeRemaining(s.expires_at) : "—"}</TableCell>
                        <TableCell>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${s.is_active && new Date(s.expires_at) > new Date() ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {s.is_active && new Date(s.expires_at) > new Date() ? "Online" : "Offline"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* PACKAGES */}
          {activeSection === "packages" && (
            <div className="space-y-4">
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" /> Add New Package
                  </CardTitle>
                  <CardDescription className="text-xs">Create hourly, daily, weekly, or monthly packages. Speed limit is optional.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Package Name</label>
                      <Input placeholder="e.g. 1 Hour WiFi" value={newPkg.name} onChange={e => setNewPkg({ ...newPkg, name: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Description</label>
                      <Input placeholder="Optional" value={newPkg.description} onChange={e => setNewPkg({ ...newPkg, description: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Duration</label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={newPkg.duration_value}
                          onChange={e => setNewPkg({ ...newPkg, duration_value: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="font-mono bg-muted/50 text-sm w-20"
                        />
                        <Select value={newPkg.duration_unit} onValueChange={(val: DurationUnit) => setNewPkg({ ...newPkg, duration_unit: val })}>
                          <SelectTrigger className="font-mono bg-muted/50 text-sm flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hours" className="font-mono text-sm">Hours</SelectItem>
                            <SelectItem value="days" className="font-mono text-sm">Days</SelectItem>
                            <SelectItem value="weeks" className="font-mono text-sm">Weeks</SelectItem>
                            <SelectItem value="months" className="font-mono text-sm">Months</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Price (KES)</label>
                      <Input type="number" value={newPkg.price} onChange={e => setNewPkg({ ...newPkg, price: parseFloat(e.target.value) || 0 })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Speed Limit</label>
                      <Input placeholder="e.g. 5M/5M (optional)" value={newPkg.speed_limit} onChange={e => setNewPkg({ ...newPkg, speed_limit: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Device Limit</label>
                      <Input type="number" min={1} max={10} value={newPkg.device_limit} onChange={e => setNewPkg({ ...newPkg, device_limit: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                  </div>
                  <Button onClick={addPackage} disabled={savingPkg || !newPkg.name} className="font-mono text-xs">
                    {savingPkg ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                    Add Package
                  </Button>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {packages.filter(p => p.is_active).map(p => (
                  <Card key={p.id} className="group hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Wifi className="h-5 w-5 text-primary" />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deletePackage(p.id)} className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      <h3 className="font-mono font-bold text-foreground text-sm">{p.name}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{p.description || formatDuration(p.duration_minutes)}</p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <span className="font-mono font-bold text-primary">KES {p.price}</span>
                        {p.speed_limit && <span className="text-[10px] font-mono text-muted-foreground">{p.speed_limit}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* SETUP */}
          {activeSection === "setup" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm flex items-center gap-2">
                    <Settings className="h-4 w-4 text-primary" /> Captive Portal Setup
                  </CardTitle>
                  <CardDescription className="text-xs">Configure your MikroTik hotspot to redirect users to this captive portal</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Router Name</label>
                      <Input value={routerForm.router_name} onChange={e => setRouterForm({ ...routerForm, router_name: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Router IP</label>
                      <Input placeholder="192.168.88.1" value={routerForm.router_ip} onChange={e => setRouterForm({ ...routerForm, router_ip: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">DNS Name</label>
                      <Input placeholder="wifi.local" value={routerForm.dns_name} onChange={e => setRouterForm({ ...routerForm, dns_name: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Hotspot Interface</label>
                      <Input value={routerForm.hotspot_interface} onChange={e => setRouterForm({ ...routerForm, hotspot_interface: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                  </div>

                  <div className="border-t border-border pt-4 mt-4">
                    <h3 className="text-xs font-mono font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Network className="h-3.5 w-3.5 text-primary" /> Router Script Inputs
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">WAN Interface</label>
                        <Input value={routerScriptConfig.wan_interface} onChange={e => setRouterScriptConfig({ ...routerScriptConfig, wan_interface: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">LAN CIDR</label>
                        <Input value={routerScriptConfig.lan_cidr} onChange={e => setRouterScriptConfig({ ...routerScriptConfig, lan_cidr: e.target.value })} placeholder="10.10.0.1/24" className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">DHCP Pool Start</label>
                        <Input value={routerScriptConfig.dhcp_pool_start} onChange={e => setRouterScriptConfig({ ...routerScriptConfig, dhcp_pool_start: e.target.value })} placeholder="10.10.0.10" className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">DHCP Pool End</label>
                        <Input value={routerScriptConfig.dhcp_pool_end} onChange={e => setRouterScriptConfig({ ...routerScriptConfig, dhcp_pool_end: e.target.value })} placeholder="10.10.0.250" className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">DNS Servers</label>
                        <Input value={routerScriptConfig.dns_servers} onChange={e => setRouterScriptConfig({ ...routerScriptConfig, dns_servers: e.target.value })} placeholder="8.8.8.8,1.1.1.1" className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Bridge Member Ports</label>
                        <Input value={routerScriptConfig.bridge_ports} onChange={e => setRouterScriptConfig({ ...routerScriptConfig, bridge_ports: e.target.value })} placeholder="ether2,ether3,wlan1" className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Router API Username</label>
                        <Input value={routerForm.api_username || ""} onChange={e => setRouterForm({ ...routerForm, api_username: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Router API Port</label>
                        <Input value={String(routerForm.api_port || "8728")} onChange={e => setRouterForm({ ...routerForm, api_port: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3">
                      These fields are used to generate an ISP-specific `hotspot-setup.rsc` script with the correct LAN, DHCP, NAT, DNS, bridge, and portal allow-list values.
                    </p>
                  </div>
                  
                  <div className="border-t border-border pt-4 mt-4">
                    <h3 className="text-xs font-mono font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-primary" /> RADIUS Server Configuration
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">RADIUS Server IP</label>
                        <Input placeholder="e.g. radius.yourdomain.com or IP" value={routerForm.radius_server_ip} onChange={e => setRouterForm({ ...routerForm, radius_server_ip: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">RADIUS Secret</label>
                        <Input type="password" placeholder="Shared secret key" value={routerForm.radius_secret} onChange={e => setRouterForm({ ...routerForm, radius_secret: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Auth Port</label>
                        <Input type="number" placeholder="1812" value={routerForm.radius_auth_port} onChange={e => setRouterForm({ ...routerForm, radius_auth_port: parseInt(e.target.value) || 1812 })} className="font-mono bg-muted/50 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Accounting Port</label>
                        <Input type="number" placeholder="1813" value={routerForm.radius_acct_port} onChange={e => setRouterForm({ ...routerForm, radius_acct_port: parseInt(e.target.value) || 1813 })} className="font-mono bg-muted/50 text-sm" />
                      </div>
                    </div>
                  </div>
                  <Button onClick={saveRouterSettings} disabled={savingRouter} className="font-mono text-xs">
                    {savingRouter ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Save Settings
                  </Button>
                </CardContent>
              </Card>
              {hasScopedTenant && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="font-mono text-sm flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" /> Payment Gateway Setup
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Each ISP chooses which gateways to enable and enters its own credentials so payments go to the right account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                      <div>
                        <h3 className="text-xs font-mono font-semibold text-foreground uppercase tracking-wider">M-Pesa Daraja</h3>
                        <p className="mt-1 text-[10px] text-muted-foreground">Configure the tenant's own Daraja app credentials and till/shortcode.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Display Name</label>
                          <Input
                            value={mpesaForm.display_name}
                            onChange={(e) => setMpesaForm({ ...mpesaForm, display_name: e.target.value })}
                            className="font-mono bg-muted/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</label>
                          <Select
                            value={mpesaForm.status}
                            onValueChange={(value: "disabled" | "test" | "active") => setMpesaForm({ ...mpesaForm, status: value })}
                          >
                            <SelectTrigger className="font-mono bg-muted/50 text-sm">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="disabled">Disabled</SelectItem>
                              <SelectItem value="test">Test Mode</SelectItem>
                              <SelectItem value="active">Active</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Consumer Key</label>
                          <Input
                            value={mpesaForm.consumer_key}
                            onChange={(e) => setMpesaForm({ ...mpesaForm, consumer_key: e.target.value })}
                            className="font-mono bg-muted/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Consumer Secret</label>
                          <Input
                            type="password"
                            value={mpesaForm.consumer_secret}
                            onChange={(e) => setMpesaForm({ ...mpesaForm, consumer_secret: e.target.value })}
                            className="font-mono bg-muted/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Passkey</label>
                          <Input
                            type="password"
                            value={mpesaForm.passkey}
                            onChange={(e) => setMpesaForm({ ...mpesaForm, passkey: e.target.value })}
                            className="font-mono bg-muted/50 text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Shortcode / Till</label>
                          <Input
                            value={mpesaForm.shortcode}
                            onChange={(e) => setMpesaForm({ ...mpesaForm, shortcode: e.target.value })}
                            className="font-mono bg-muted/50 text-sm"
                          />
                        </div>
                      </div>
                      <Button onClick={saveMpesaGateway} disabled={savingGateway} className="font-mono text-xs">
                        {savingGateway ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Save M-Pesa Settings
                      </Button>
                    </div>

                    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                      <div>
                        <h3 className="text-xs font-mono font-semibold text-foreground uppercase tracking-wider">Paystack</h3>
                        <p className="mt-1 text-[10px] text-muted-foreground">Configure the tenant's own Paystack keys for redirect checkout.</p>
                      </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Display Name</label>
                        <Input
                          value={paystackForm.display_name}
                          onChange={(e) => setPaystackForm({ ...paystackForm, display_name: e.target.value })}
                          className="font-mono bg-muted/50 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</label>
                        <Select
                          value={paystackForm.status}
                          onValueChange={(value: "disabled" | "test" | "active") => setPaystackForm({ ...paystackForm, status: value })}
                        >
                          <SelectTrigger className="font-mono bg-muted/50 text-sm">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="disabled">Disabled</SelectItem>
                            <SelectItem value="test">Test Mode</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Paystack Public Key</label>
                        <Input
                          value={paystackForm.public_key}
                          onChange={(e) => setPaystackForm({ ...paystackForm, public_key: e.target.value })}
                          placeholder="pk_live_..."
                          className="font-mono bg-muted/50 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Paystack Secret Key</label>
                        <Input
                          type="password"
                          value={paystackForm.secret_key}
                          onChange={(e) => setPaystackForm({ ...paystackForm, secret_key: e.target.value })}
                          placeholder="sk_live_..."
                          className="font-mono bg-muted/50 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Webhook URL: {typeof window !== "undefined" ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paystack-webhook` : "/functions/v1/paystack-webhook"}
                    </p>
                    <Button onClick={savePaystackGateway} disabled={savingGateway} className="font-mono text-xs">
                      {savingGateway ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Save Paystack Settings
                    </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm">Captive Portal Files</CardTitle>
                  <CardDescription className="text-xs">Download and upload these to your MikroTik router's hotspot directory</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <div>
                      <p className="font-mono font-semibold text-xs">hotspot-setup.rsc</p>
                      <p className="text-[10px] text-muted-foreground">Complete hotspot config with DHCP, NAT, RADIUS</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={generateRscScript} className="font-mono text-xs">
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <div>
                      <p className="font-mono font-semibold text-xs">login.html</p>
                      <p className="text-[10px] text-muted-foreground">Thin router shell that opens the hosted captive portal with MikroTik session params intact</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={generateLoginHtml} className="font-mono text-xs">
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Admin;
