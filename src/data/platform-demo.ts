export interface PlatformMetric {
  label: string;
  value: string;
  change: string;
  tone: "positive" | "neutral" | "warning";
}

export interface RouterNode {
  id: string;
  name: string;
  site: string;
  status: "healthy" | "warning" | "offline";
  clients: number;
  revenueToday: string;
  lastSync: string;
}

export interface InvoiceSnapshot {
  id: string;
  period: string;
  amount: string;
  usage: string;
  status: "paid" | "due" | "overdue";
  dueDate: string;
}

export interface TenantSnapshot {
  name: string;
  slug: string;
  plan: string;
  billingStatus: "active" | "watch" | "suspended";
  monthlyVolume: string;
  mrr: string;
  routersOnline: string;
}

export const tenantSummary: TenantSnapshot = {
  name: "BROADCOM Demo ISP",
  slug: "legacy-isp",
  plan: "Usage Billing v1",
  billingStatus: "active",
  monthlyVolume: "1,284 purchases",
  mrr: "KES 86,420",
  routersOnline: "11 / 12 routers",
};

export const workspaceMetrics: PlatformMetric[] = [
  { label: "Gross Sales", value: "KES 382,410", change: "+18.4% vs last month", tone: "positive" },
  { label: "Purchases", value: "1,284", change: "+121 this week", tone: "positive" },
  { label: "Overdue Invoices", value: "1", change: "1 invoice due in 3 days", tone: "warning" },
  { label: "Router Health", value: "91.7%", change: "1 node needs attention", tone: "neutral" },
];

export const routerNodes: RouterNode[] = [
  {
    id: "RTR-001",
    name: "Westlands Core",
    site: "Nairobi CBD",
    status: "healthy",
    clients: 128,
    revenueToday: "KES 14,200",
    lastSync: "1 min ago",
  },
  {
    id: "RTR-002",
    name: "Kilimani Edge",
    site: "Kilimani Plaza",
    status: "warning",
    clients: 74,
    revenueToday: "KES 8,540",
    lastSync: "9 min ago",
  },
  {
    id: "RTR-003",
    name: "Ngong Road Hub",
    site: "Prestige Annex",
    status: "offline",
    clients: 0,
    revenueToday: "KES 2,130",
    lastSync: "43 min ago",
  },
];

export const invoices: InvoiceSnapshot[] = [
  {
    id: "INV-2026-04-001",
    period: "April 2026",
    amount: "KES 24,880",
    usage: "1,244 paid purchases",
    status: "due",
    dueDate: "18 Apr 2026",
  },
  {
    id: "INV-2026-03-001",
    period: "March 2026",
    amount: "KES 22,310",
    usage: "1,117 paid purchases",
    status: "paid",
    dueDate: "18 Mar 2026",
  },
  {
    id: "INV-2026-02-001",
    period: "February 2026",
    amount: "KES 21,040",
    usage: "1,052 paid purchases",
    status: "paid",
    dueDate: "18 Feb 2026",
  },
];

export const superAdminMetrics: PlatformMetric[] = [
  { label: "Live ISPs", value: "12", change: "+2 in onboarding", tone: "positive" },
  { label: "Platform Billings", value: "KES 612,700", change: "+22.1% MRR", tone: "positive" },
  { label: "Suspended Accounts", value: "2", change: "Auto-lock active", tone: "warning" },
  { label: "Provisioning Jobs", value: "37", change: "32 successful today", tone: "neutral" },
];

export const tenants: TenantSnapshot[] = [
  tenantSummary,
  {
    name: "MetroFi Networks",
    slug: "metrofi",
    plan: "Base + Usage",
    billingStatus: "watch",
    monthlyVolume: "842 purchases",
    mrr: "KES 41,200",
    routersOnline: "6 / 6 routers",
  },
  {
    name: "SkyMesh Fibre",
    slug: "skymesh",
    plan: "Growth Tier",
    billingStatus: "suspended",
    monthlyVolume: "2,904 purchases",
    mrr: "KES 123,880",
    routersOnline: "14 / 16 routers",
  },
];
