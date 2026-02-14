import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Package, Settings, LogOut, Wifi, Clock, Key, Plus, Trash2, Download,
  Loader2, Activity
} from "lucide-react";

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

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/admin/login");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoadingData(true);
    const [vRes, pRes, sRes, rRes] = await Promise.all([
      supabase.from("vouchers").select("*, packages(name, duration_minutes, price)").order("created_at", { ascending: false }).limit(100),
      supabase.from("packages").select("*").order("price"),
      supabase.from("sessions").select("*, vouchers(code, phone_number, packages(name))").order("started_at", { ascending: false }).limit(100),
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

  const addPackage = async () => {
    setSavingPkg(true);
    const pkg = {
      name: newPkg.name,
      description: newPkg.description || null,
      duration_minutes: newPkg.duration_minutes,
      price: newPkg.price,
      speed_limit: newPkg.speed_limit || null,
    };
    await supabase.from("packages").insert([pkg]);
    setNewPkg({ name: "", description: "", duration_minutes: 60, price: 20, speed_limit: "" });
    setSavingPkg(false);
    loadData();
  };

  const deletePackage = async (id: string) => {
    await supabase.from("packages").update({ is_active: false }).eq("id", id);
    loadData();
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
    if (minutes >= 43200) return `${Math.floor(minutes / 43200)} Month${minutes >= 86400 ? 's' : ''}`;
    if (minutes >= 10080) return `${Math.floor(minutes / 10080)} Week${minutes >= 20160 ? 's' : ''}`;
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)} Day${minutes >= 2880 ? 's' : ''}`;
    if (minutes >= 60) return `${Math.floor(minutes / 60)} Hour${minutes >= 120 ? 's' : ''}`;
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

    const script = `# MikroTik Hotspot Configuration Script
# Generated by WiFi Billing System

/ip hotspot profile
add name="billing-profile" hotspot-address=${routerForm.router_ip || "10.10.0.1"} dns-name=${dns} \\
    html-directory=hotspot login-by=http-chap,http-pap,cookie http-cookie-lifetime=1d

/ip hotspot
add name="billing-hotspot" interface=${iface} profile=billing-profile disabled=no

/ip hotspot walled-garden ip
add dst-host=${new URL(portalUrl).hostname} action=accept comment="WiFi Billing Portal"

/ip hotspot walled-garden
add dst-host=${new URL(portalUrl).hostname} action=allow comment="WiFi Billing Portal"

/radius
add service=hotspot address=YOUR_RADIUS_SERVER_IP secret=YOUR_RADIUS_SECRET

/ip hotspot profile
set billing-profile use-radius=yes radius-interim-update=00:05:00

:log info "WiFi Billing hotspot configuration applied successfully"
`;
    const blob = new Blob([script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hotspot-setup.rsc";
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateLoginHtml = () => {
    const portalUrl = window.location.origin + "/portal";
    const html = `<!DOCTYPE html>
<html>
<head>
<title>WiFi Login</title>
<meta http-equiv="refresh" content="0;url=${portalUrl}">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<p>Redirecting to WiFi portal...</p>
<script>window.location.href="${portalUrl}";</script>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "login.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeSessions = sessions.filter(s => s.is_active && new Date(s.expires_at) > new Date());

  if (authLoading || loadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wifi className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold font-mono text-foreground">WiFi Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono">{user?.email}</span>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-foreground">{activeSessions.length}</p>
                <p className="text-xs text-muted-foreground">Active Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-foreground">{vouchers.filter(v => v.status === "active").length}</p>
                <p className="text-xs text-muted-foreground">Active Vouchers</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-foreground">{vouchers.length}</p>
                <p className="text-xs text-muted-foreground">Total Vouchers</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-foreground">{packages.filter(p => p.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Packages</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="sessions" className="space-y-4">
          <TabsList className="font-mono">
            <TabsTrigger value="sessions"><Users className="h-4 w-4 mr-1" /> Sessions</TabsTrigger>
            <TabsTrigger value="vouchers"><Key className="h-4 w-4 mr-1" /> Vouchers</TabsTrigger>
            <TabsTrigger value="packages"><Package className="h-4 w-4 mr-1" /> Packages</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1" /> MikroTik</TabsTrigger>
          </TabsList>

          {/* Sessions Tab */}
          <TabsContent value="sessions">
            <Card>
              <CardHeader>
                <CardTitle className="font-mono">Active Sessions</CardTitle>
                <CardDescription>Currently connected users</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono">Code</TableHead>
                      <TableHead className="font-mono">Phone</TableHead>
                      <TableHead className="font-mono">Package</TableHead>
                      <TableHead className="font-mono">Started</TableHead>
                      <TableHead className="font-mono">Time Left</TableHead>
                      <TableHead className="font-mono">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No sessions yet
                        </TableCell>
                      </TableRow>
                    ) : sessions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono font-bold text-primary">{s.vouchers?.code}</TableCell>
                        <TableCell className="font-mono text-sm">{s.vouchers?.phone_number}</TableCell>
                        <TableCell className="text-sm">{s.vouchers?.packages?.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(s.started_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.is_active ? timeRemaining(s.expires_at) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-mono ${s.is_active && new Date(s.expires_at) > new Date() ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {s.is_active && new Date(s.expires_at) > new Date() ? "Active" : "Expired"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vouchers Tab */}
          <TabsContent value="vouchers">
            <Card>
              <CardHeader>
                <CardTitle className="font-mono">Voucher Codes</CardTitle>
                <CardDescription>All generated voucher codes</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono">Code</TableHead>
                      <TableHead className="font-mono">Phone</TableHead>
                      <TableHead className="font-mono">Package</TableHead>
                      <TableHead className="font-mono">M-Pesa Receipt</TableHead>
                      <TableHead className="font-mono">Created</TableHead>
                      <TableHead className="font-mono">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vouchers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No vouchers generated yet
                        </TableCell>
                      </TableRow>
                    ) : vouchers.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono font-bold text-primary">{v.code}</TableCell>
                        <TableCell className="font-mono text-sm">{v.phone_number}</TableCell>
                        <TableCell className="text-sm">{v.packages?.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{v.mpesa_receipt || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(v.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-mono ${
                            v.status === "active" ? "bg-primary/10 text-primary" :
                            v.status === "used" ? "bg-muted text-muted-foreground" :
                            "bg-destructive/10 text-destructive"
                          }`}>
                            {v.status}
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
              <Card>
                <CardHeader>
                  <CardTitle className="font-mono">Add New Package</CardTitle>
                  <CardDescription>Create hourly, daily, weekly, or monthly packages. Speed limit is optional.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground">Package Name</label>
                      <Input placeholder="e.g. 1 Hour WiFi" value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground">Description (optional)</label>
                      <Input placeholder="e.g. Basic browsing" value={newPkg.description} onChange={(e) => setNewPkg({ ...newPkg, description: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground">Duration</label>
                      <Select
                        value={String(newPkg.duration_minutes)}
                        onValueChange={(val) => setNewPkg({ ...newPkg, duration_minutes: parseInt(val) })}
                      >
                        <SelectTrigger className="font-mono bg-muted/50">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_PRESETS.map((d) => (
                            <SelectItem key={d.value} value={String(d.value)} className="font-mono">
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground">Price (KES)</label>
                      <Input type="number" placeholder="20" value={newPkg.price} onChange={(e) => setNewPkg({ ...newPkg, price: parseFloat(e.target.value) || 0 })} className="font-mono bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-mono text-muted-foreground">Speed Limit (optional)</label>
                      <Input placeholder="e.g. 5M/5M" value={newPkg.speed_limit} onChange={(e) => setNewPkg({ ...newPkg, speed_limit: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                  </div>
                  <Button onClick={addPackage} disabled={savingPkg || !newPkg.name} className="font-mono glow-primary">
                    {savingPkg ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Add Package
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-mono">Current Packages</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-mono">Name</TableHead>
                        <TableHead className="font-mono">Duration</TableHead>
                        <TableHead className="font-mono">Price</TableHead>
                        <TableHead className="font-mono">Speed</TableHead>
                        <TableHead className="font-mono">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packages.filter(p => p.is_active).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono font-semibold">{p.name}</TableCell>
                          <TableCell className="font-mono">{formatDuration(p.duration_minutes)}</TableCell>
                          <TableCell className="font-mono text-primary">KES {p.price}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">{p.speed_limit || "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => deletePackage(p.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="font-mono">MikroTik Router Settings</CardTitle>
                  <CardDescription>Configure your router connection details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-mono text-muted-foreground">Router Name</label>
                      <Input value={routerForm.router_name} onChange={(e) => setRouterForm({ ...routerForm, router_name: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-mono text-muted-foreground">Router IP</label>
                      <Input placeholder="192.168.88.1" value={routerForm.router_ip} onChange={(e) => setRouterForm({ ...routerForm, router_ip: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-mono text-muted-foreground">API Port</label>
                      <Input value={routerForm.api_port} onChange={(e) => setRouterForm({ ...routerForm, api_port: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-mono text-muted-foreground">DNS Name</label>
                      <Input placeholder="wifi.local" value={routerForm.dns_name} onChange={(e) => setRouterForm({ ...routerForm, dns_name: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-mono text-muted-foreground">Hotspot Interface</label>
                      <Input value={routerForm.hotspot_interface} onChange={(e) => setRouterForm({ ...routerForm, hotspot_interface: e.target.value })} className="font-mono bg-muted/50" />
                    </div>
                  </div>
                  <Button onClick={saveRouterSettings} disabled={savingRouter} className="font-mono glow-primary">
                    {savingRouter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Settings
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-mono">Downloadable Files</CardTitle>
                  <CardDescription>Configuration files for your MikroTik router</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <div>
                      <p className="font-mono font-semibold text-sm">hotspot-setup.rsc</p>
                      <p className="text-xs text-muted-foreground">MikroTik RouterOS configuration script</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={generateRscScript} className="font-mono">
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <div>
                      <p className="font-mono font-semibold text-sm">login.html</p>
                      <p className="text-xs text-muted-foreground">Hotspot redirect page (upload to MikroTik /hotspot)</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={generateLoginHtml} className="font-mono">
                      <Download className="h-4 w-4 mr-1" /> Download
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
