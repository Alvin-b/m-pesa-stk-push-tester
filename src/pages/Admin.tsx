import { useState, useEffect, useMemo } from "react";
import networkBg from "@/assets/network-bg.png";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
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
  Radio, Menu, X
} from "lucide-react";
import { format, subDays, startOfDay, parseISO, isToday, isThisWeek, isThisMonth } from "date-fns";

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

const Admin = () => {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [routerSettings, setRouterSettings] = useState<RouterSettingsRow | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [activeSection, setActiveSection] = useState<ActiveSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [newPkg, setNewPkg] = useState({ name: "", description: "", duration_value: 1, duration_unit: "hours" as DurationUnit, price: 20, speed_limit: "" });
  const [savingPkg, setSavingPkg] = useState(false);
  const [routerForm, setRouterForm] = useState({ 
    router_name: "Main Router", 
    router_ip: "", 
    dns_name: "", 
    hotspot_interface: "wlan1",
    radius_server_ip: "",
    radius_secret: "",
    radius_auth_port: 1812,
    radius_acct_port: 1813
  });
  const [savingRouter, setSavingRouter] = useState(false);

  const [genPkgId, setGenPkgId] = useState("");
  const [genPhone, setGenPhone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/admin/login");
    if (!authLoading && user && !isAdmin) navigate("/admin/login");
  }, [authLoading, user, isAdmin, navigate]);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoadingData(true);
    const [vRes, pRes, sRes, rRes] = await Promise.all([
      supabase.from("vouchers").select("*, packages(name, duration_minutes, price)").order("created_at", { ascending: false }).limit(500),
      supabase.from("packages").select("*").order("price"),
      supabase.from("sessions").select("*, vouchers(code, phone_number, packages(name))").order("started_at", { ascending: false }).limit(200),
      supabase.from("router_settings").select("*").limit(1).maybeSingle(),
    ]);
    if (vRes.data) setVouchers(vRes.data as unknown as VoucherRow[]);
    if (pRes.data) setPackages(pRes.data as PackageRow[]);
    if (sRes.data) setSessions(sRes.data as unknown as SessionRow[]);
    if (rRes.data) {
      setRouterSettings(rRes.data as RouterSettingsRow);
      setRouterForm({
        router_name: rRes.data.router_name || "Main Router",
        router_ip: rRes.data.router_ip || "",
        dns_name: rRes.data.dns_name || "",
        hotspot_interface: rRes.data.hotspot_interface || "wlan1",
        radius_server_ip: rRes.data.radius_server_ip || "",
        radius_secret: rRes.data.radius_secret || "",
        radius_auth_port: rRes.data.radius_auth_port || 1812,
        radius_acct_port: rRes.data.radius_acct_port || 1813,
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

  const addPackage = async () => {
    setSavingPkg(true);
    const durationMinutes = newPkg.duration_value * DURATION_UNIT_MINUTES[newPkg.duration_unit];
    await supabase.from("packages").insert([{
      name: newPkg.name,
      description: newPkg.description || null,
      duration_minutes: durationMinutes,
      price: newPkg.price,
      speed_limit: newPkg.speed_limit || null,
    }]);
    setNewPkg({ name: "", description: "", duration_value: 1, duration_unit: "hours", price: 20, speed_limit: "" });
    setSavingPkg(false);
    loadData();
  };

  const deletePackage = async (id: string) => {
    await supabase.from("packages").update({ is_active: false }).eq("id", id);
    loadData();
  };

  const generateVoucher = async () => {
    if (!genPkgId) return;
    setGenerating(true);
    setGeneratedCode("");
    try {
      const { data, error } = await supabase.functions.invoke("generate-voucher", {
        body: { packageId: genPkgId, phoneNumber: genPhone || undefined },
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
      await supabase.functions.invoke("revoke-voucher", { body: { voucherId: id, code } });
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
      await supabase.from("router_settings").update(routerForm).eq("id", routerSettings.id);
    } else {
      await supabase.from("router_settings").insert([{ ...routerForm, created_by: user?.id }]);
    }
    setSavingRouter(false);
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
    const portalUrl = window.location.origin + "/portal";
    const iface = routerForm.hotspot_interface || "wlan1";
    const dns = routerForm.dns_name || "wifi.local";
    const ip = routerForm.router_ip || "10.10.0.1";
    const hostname = new URL(portalUrl).hostname;
    const radiusIp = routerForm.radius_server_ip || "YOUR_RADIUS_SERVER_IP";
    const radiusSecret = routerForm.radius_secret || "YOUR_RADIUS_SECRET";
    const authPort = routerForm.radius_auth_port || 1812;
    const acctPort = routerForm.radius_acct_port || 1813;
    
    const script = [
      "# ==========================================",
      "# MikroTik Complete Hotspot Billing Setup",
      "# Generated by WiFi Billing System",
      "# ==========================================",
      "",
      "# --- 1. IP Addressing ---",
      `/ip address`,
      `add address=${ip}/24 interface=${iface}`,
      "",
      "# --- 2. DHCP Server ---",
      `/ip pool`,
      `add name=hotspot-pool ranges=${ip.replace(/\.\d+$/, ".10")}-${ip.replace(/\.\d+$/, ".200")}`,
      "",
      `/ip dhcp-server`,
      `add name=hotspot-dhcp interface=${iface} address-pool=hotspot-pool disabled=no`,
      "",
      `/ip dhcp-server network`,
      `add address=${ip.replace(/\.\d+$/, ".0")}/24 gateway=${ip} dns-server=8.8.8.8,8.8.4.4`,
      "",
      "# --- 3. DNS ---",
      `/ip dns`,
      `set allow-remote-requests=yes`,
      "",
      "# --- 4. NAT Masquerade (change ether1 to your WAN interface) ---",
      `/ip firewall nat`,
      `add chain=srcnat out-interface=ether1 action=masquerade comment="Hotspot NAT"`,
      "",
      "# --- 5. Hotspot Profile ---",
      `/ip hotspot profile`,
      `add name="billing-profile" hotspot-address=${ip} dns-name=${dns} \\`,
      `    html-directory=hotspot login-by=http-chap,http-pap,cookie http-cookie-lifetime=1d \\`,
      `    use-radius=yes radius-interim-update=00:05:00`,
      "",
      "# --- 6. Hotspot Server ---",
      `/ip hotspot`,
      `add name="billing-hotspot" interface=${iface} profile=billing-profile disabled=no`,
      "",
      "# --- 7. Walled Garden (allow billing portal) ---",
      `/ip hotspot walled-garden ip`,
      `add dst-host=${hostname} action=accept comment="WiFi Billing Portal"`,
      `/ip hotspot walled-garden`,
      `add dst-host=${hostname} action=allow comment="WiFi Billing Portal"`,
      "",
      "# --- 8. RADIUS Server ---",
      `/radius`,
      `add service=hotspot address=${radiusIp} secret=${radiusSecret} \\`,
      `    authentication-port=${authPort} accounting-port=${acctPort}`,
      "",
      "# --- 9. Firewall - Allow RADIUS Traffic ---",
      `/ip firewall filter`,
      `add chain=output protocol=udp dst-port=${authPort},${acctPort} action=accept comment="Allow RADIUS"`,
      "",
      `:log info "WiFi Billing hotspot configuration applied successfully"`,
    ].join("\n");
    const blob = new Blob([script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "hotspot-setup.rsc"; a.click();
    URL.revokeObjectURL(url);
  };

  const generateLoginHtml = () => {
    const portalUrl = window.location.origin + "/portal";
    const html = `<!DOCTYPE html><html><head><title>WiFi Login</title><meta http-equiv="refresh" content="0;url=${portalUrl}"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><p>Redirecting...</p><script>window.location.href="${portalUrl}";</script></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "login.html"; a.click();
    URL.revokeObjectURL(url);
  };

  const activeSessions = sessions.filter(s => s.is_active && new Date(s.expires_at) > new Date());

  if (authLoading || loadingData) {
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

  const sidebarItems: { section: ActiveSection; icon: React.ReactNode; label: string; category?: string }[] = [
    { section: "overview", icon: <LayoutDashboard className="h-4 w-4" />, label: "Overview", category: "DASHBOARD" },
    { section: "analytics", icon: <BarChart3 className="h-4 w-4" />, label: "Analytics" },
    { section: "vouchers", icon: <Ticket className="h-4 w-4" />, label: "Vouchers", category: "MANAGEMENT" },
    { section: "sessions", icon: <Users className="h-4 w-4" />, label: "Sessions" },
    { section: "packages", icon: <Package className="h-4 w-4" />, label: "Plans" },
    { section: "setup", icon: <Radio className="h-4 w-4" />, label: "Router Setup", category: "NETWORK" },
  ];

  const navigateTo = (section: ActiveSection) => {
    setActiveSection(section);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-background flex relative"
      style={{ backgroundImage: `url(${networkBg})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}
    >
      <div className="absolute inset-0 bg-background/92" />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-56 bg-card/95 backdrop-blur-md border-r border-border z-50 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-primary" />
            </div>
            <span className="font-mono font-bold text-foreground text-sm">WiFi Pro</span>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {sidebarItems.map((item) => (
            <div key={item.section}>
              {item.category && (
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-3 pt-4 pb-1.5">
                  {item.category}
                </p>
              )}
              <button
                onClick={() => navigateTo(item.section)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-mono transition-colors ${
                  activeSection === item.section
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          ))}
        </nav>

        {/* User / Logout */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground font-mono truncate flex-1">{user?.email}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start font-mono text-xs text-muted-foreground hover:text-destructive">
            <LogOut className="h-3.5 w-3.5 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen relative z-10">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-lg px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg hover:bg-muted/50">
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-lg font-bold font-mono text-foreground capitalize">{activeSection === "overview" ? "Dashboard Overview" : activeSection}</h1>
              <p className="text-[10px] text-muted-foreground font-mono">Dashboard / {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={loadData} className="font-mono text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </header>

        <div className="p-4 md:p-6 space-y-6">
          {/* OVERVIEW */}
          {activeSection === "overview" && (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "TOTAL USERS", value: vouchers.length, icon: <Users className="h-5 w-5" />, sub: `+${revenueStats.todayCount} today`, color: "border-t-[hsl(200,80%,55%)]" },
                  { label: "ACTIVE USERS", value: activeSessions.length, icon: <Wifi className="h-5 w-5" />, sub: `${activeSessions.length} sessions`, color: "border-t-primary" },
                  { label: "TOTAL REVENUE", value: `KES ${revenueStats.total.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, sub: `+${revenueStats.todayRev.toLocaleString()} today`, color: "border-t-[hsl(35,80%,55%)]" },
                  { label: "SUCCESSFUL PAYMENTS", value: vouchers.filter(v => v.status !== "revoked").length, icon: <CreditCard className="h-5 w-5" />, sub: `${revenueStats.todayCount} today`, color: "border-t-[hsl(330,70%,55%)]" },
                ].map((stat) => (
                  <Card key={stat.label} className={`border-t-2 ${stat.color}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          {stat.icon}
                        </div>
                      </div>
                      <p className="text-2xl font-bold font-mono text-foreground">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-1">{stat.label}</p>
                      <p className="text-[10px] text-primary font-mono mt-1">{stat.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Button onClick={() => setActiveSection("packages")} className="h-12 font-mono text-xs bg-primary hover:bg-primary/90">
                      <Plus className="h-4 w-4 mr-1.5" /> Add Plan
                    </Button>
                    <Button onClick={() => setActiveSection("vouchers")} variant="outline" className="h-12 font-mono text-xs border-primary/30 hover:bg-primary/10">
                      <Ticket className="h-4 w-4 mr-1.5" /> Generate Code
                    </Button>
                    <Button onClick={() => setActiveSection("analytics")} variant="outline" className="h-12 font-mono text-xs border-primary/30 hover:bg-primary/10">
                      <BarChart3 className="h-4 w-4 mr-1.5" /> View Reports
                    </Button>
                    <Button onClick={() => setActiveSection("setup")} variant="outline" className="h-12 font-mono text-xs border-primary/30 hover:bg-primary/10">
                      <Settings className="h-4 w-4 mr-1.5" /> Configure
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="bg-muted/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xl font-bold font-mono text-foreground">{activeSessions.length}</p>
                      <p className="text-[10px] text-muted-foreground">Online Now</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Key className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xl font-bold font-mono text-foreground">{vouchers.filter(v => v.status === "active").length}</p>
                      <p className="text-[10px] text-muted-foreground">Active Vouchers</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xl font-bold font-mono text-foreground">{packages.filter(p => p.is_active).length}</p>
                      <p className="text-[10px] text-muted-foreground">Active Plans</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Wifi className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xl font-bold font-mono text-foreground">{sessions.length}</p>
                      <p className="text-[10px] text-muted-foreground">Total Sessions</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
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
                        {vouchers.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-xs">No vouchers yet</TableCell></TableRow>
                        ) : vouchers.map(v => (
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
                      <p className="text-[10px] text-muted-foreground">Redirect page for captive portal</p>
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
