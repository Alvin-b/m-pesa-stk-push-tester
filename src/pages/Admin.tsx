import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Users, Package, Settings, LogOut, Wifi, Key, Plus, Trash2, Download,
  Loader2, Activity, TrendingUp, DollarSign, BarChart3, Ban, Ticket, RefreshCw,
  Calendar, ArrowUpRight, ArrowDownRight, Shield, Copy, CheckCircle2
} from "lucide-react";
import { format, subDays, startOfDay, startOfWeek, startOfMonth, parseISO, isToday, isThisWeek, isThisMonth } from "date-fns";

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
  api_port: string | null;
  dns_name: string | null;
  hotspot_interface: string | null;
}

const DURATION_PRESETS = [
  { label: "1 Hour", value: 60 },
  { label: "2 Hours", value: 120 },
  { label: "3 Hours", value: 180 },
  { label: "6 Hours", value: 360 },
  { label: "12 Hours", value: 720 },
  { label: "1 Day", value: 1440 },
  { label: "3 Days", value: 4320 },
  { label: "1 Week", value: 10080 },
  { label: "2 Weeks", value: 20160 },
  { label: "1 Month", value: 43200 },
];

const CHART_COLORS = [
  "hsl(145, 63%, 42%)",
  "hsl(145, 63%, 55%)",
  "hsl(145, 63%, 30%)",
  "hsl(200, 60%, 50%)",
  "hsl(35, 80%, 55%)",
  "hsl(0, 60%, 50%)",
];

const Admin = () => {
  const { user, isAdmin, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [routerSettings, setRouterSettings] = useState<RouterSettingsRow | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [newPkg, setNewPkg] = useState({ name: "", description: "", duration_minutes: 60, price: 20, speed_limit: "" });
  const [savingPkg, setSavingPkg] = useState(false);
  const [routerForm, setRouterForm] = useState({ router_name: "Main Router", router_ip: "", api_port: "8728", dns_name: "", hotspot_interface: "wlan1" });
  const [savingRouter, setSavingRouter] = useState(false);

  // Voucher generation
  const [genPkgId, setGenPkgId] = useState("");
  const [genPhone, setGenPhone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/admin/login");
  }, [authLoading, user, navigate]);

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
        api_port: rRes.data.api_port || "8728",
        dns_name: rRes.data.dns_name || "",
        hotspot_interface: rRes.data.hotspot_interface || "wlan1",
      });
    }
    setLoadingData(false);
  };

  // Revenue calculations
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

  // Daily chart data (last 14 days)
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

  // Package breakdown for pie chart
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
    await supabase.from("packages").insert([{
      name: newPkg.name,
      description: newPkg.description || null,
      duration_minutes: newPkg.duration_minutes,
      price: newPkg.price,
      speed_limit: newPkg.speed_limit || null,
    }]);
    setNewPkg({ name: "", description: "", duration_minutes: 60, price: 20, speed_limit: "" });
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
    const script = `# MikroTik Hotspot Configuration Script\n/ip hotspot profile\nadd name="billing-profile" hotspot-address=${routerForm.router_ip || "10.10.0.1"} dns-name=${dns} \\\n    html-directory=hotspot login-by=http-chap,http-pap,cookie http-cookie-lifetime=1d\n/ip hotspot\nadd name="billing-hotspot" interface=${iface} profile=billing-profile disabled=no\n/ip hotspot walled-garden ip\nadd dst-host=${new URL(portalUrl).hostname} action=accept comment="WiFi Billing Portal"\n/ip hotspot walled-garden\nadd dst-host=${new URL(portalUrl).hostname} action=allow comment="WiFi Billing Portal"\n/radius\nadd service=hotspot address=YOUR_RADIUS_SERVER_IP secret=YOUR_RADIUS_SECRET\n/ip hotspot profile\nset billing-profile use-radius=yes radius-interim-update=00:05:00\n:log info "WiFi Billing hotspot configuration applied successfully"`;
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-mono text-foreground">WiFi Admin</h1>
              <p className="text-[10px] text-muted-foreground font-mono">Dashboard & Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={loadData} className="font-mono text-xs">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <div className="h-6 w-px bg-border" />
            <span className="text-[10px] text-muted-foreground font-mono hidden sm:block">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Revenue Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary">Total</span>
              </div>
              <p className="text-2xl font-bold font-mono text-foreground">KES {revenueStats.total.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{vouchers.length} total vouchers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div className="flex items-center gap-1 text-primary text-[10px] font-mono">
                  <ArrowUpRight className="h-3 w-3" /> Today
                </div>
              </div>
              <p className="text-2xl font-bold font-mono text-foreground">KES {revenueStats.todayRev.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{revenueStats.todayCount} sales today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">This Week</span>
              </div>
              <p className="text-2xl font-bold font-mono text-foreground">KES {revenueStats.weekRev.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{revenueStats.weekCount} sales</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">This Month</span>
              </div>
              <p className="text-2xl font-bold font-mono text-foreground">KES {revenueStats.monthRev.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{revenueStats.monthCount} sales</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-3">
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
                <p className="text-[10px] text-muted-foreground">Active Packages</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Revenue (Last 14 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={dailyChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(160, 10%, 18%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(150, 10%, 50%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(150, 10%, 50%)" }} />
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
                <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
              ) : (
                <div className="h-[250px]">
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

        {/* Main Tabs */}
        <Tabs defaultValue="vouchers" className="space-y-4">
          <TabsList className="font-mono bg-muted/50 p-1">
            <TabsTrigger value="vouchers" className="text-xs"><Key className="h-3.5 w-3.5 mr-1" /> Vouchers</TabsTrigger>
            <TabsTrigger value="sessions" className="text-xs"><Users className="h-3.5 w-3.5 mr-1" /> Sessions</TabsTrigger>
            <TabsTrigger value="packages" className="text-xs"><Package className="h-3.5 w-3.5 mr-1" /> Packages</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs"><Settings className="h-3.5 w-3.5 mr-1" /> MikroTik</TabsTrigger>
          </TabsList>

          {/* Vouchers Tab */}
          <TabsContent value="vouchers">
            <div className="space-y-4">
              {/* Generate Voucher */}
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
                    <Button onClick={generateVoucher} disabled={generating || !genPkgId} className="font-mono glow-primary text-xs shrink-0">
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

              {/* Voucher Table */}
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
                          <TableHead className="font-mono text-xs">Package</TableHead>
                          <TableHead className="font-mono text-xs">Receipt</TableHead>
                          <TableHead className="font-mono text-xs">Created</TableHead>
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
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions">
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
                      <TableHead className="font-mono text-xs">Started</TableHead>
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
          </TabsContent>

          {/* Packages Tab */}
          <TabsContent value="packages">
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
                      <Select value={String(newPkg.duration_minutes)} onValueChange={val => setNewPkg({ ...newPkg, duration_minutes: parseInt(val) })}>
                        <SelectTrigger className="font-mono bg-muted/50 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DURATION_PRESETS.map(d => (
                            <SelectItem key={d.value} value={String(d.value)} className="font-mono text-sm">{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <Button onClick={addPackage} disabled={savingPkg || !newPkg.name} className="font-mono glow-primary text-xs">
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
          </TabsContent>

          {/* MikroTik Settings Tab */}
          <TabsContent value="settings">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm flex items-center gap-2">
                    <Settings className="h-4 w-4 text-primary" /> Router Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Router Name</label>
                      <Input value={routerForm.router_name} onChange={e => setRouterForm({ ...routerForm, router_name: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Router IP</label>
                      <Input placeholder="192.168.88.1" value={routerForm.router_ip} onChange={e => setRouterForm({ ...routerForm, router_ip: e.target.value })} className="font-mono bg-muted/50 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">API Port</label>
                      <Input value={routerForm.api_port} onChange={e => setRouterForm({ ...routerForm, api_port: e.target.value })} className="font-mono bg-muted/50 text-sm" />
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
                  <Button onClick={saveRouterSettings} disabled={savingRouter} className="font-mono glow-primary text-xs">
                    {savingRouter ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Save Settings
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm">Configuration Files</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <div>
                      <p className="font-mono font-semibold text-xs">hotspot-setup.rsc</p>
                      <p className="text-[10px] text-muted-foreground">RouterOS config script</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={generateRscScript} className="font-mono text-xs">
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                    <div>
                      <p className="font-mono font-semibold text-xs">login.html</p>
                      <p className="text-[10px] text-muted-foreground">Redirect page for hotspot</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={generateLoginHtml} className="font-mono text-xs">
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
