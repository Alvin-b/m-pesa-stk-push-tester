import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { PlatformProvider, usePlatform } from "@/lib/platform";
import Portal from "./pages/Portal";
import AdminLogin from "./pages/AdminLogin";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import TenantWorkspace from "./pages/TenantWorkspace";
import PlatformAdmin from "./pages/PlatformAdmin";
import BillingLockPreview from "./pages/BillingLockPreview";
import TenantBilling from "./pages/TenantBilling";
import { useAuth } from "@/lib/auth";
import LandingPage from "./pages/LandingPage";

const queryClient = new QueryClient();

const HomeRoute = () => {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { activeTenant, loading: platformLoading } = usePlatform();

  if (authLoading || platformLoading) return null;
  if (!user) {
    return <LandingPage />;
  }

  if (isAdmin) {
    return <Navigate to="/super-admin" replace />;
  }

  if (activeTenant?.billingStatus === "suspended") {
    return <Navigate to="/workspace/billing-lock" replace />;
  }

  return <Navigate to="/admin" replace />;
};

const TenantAppRoute = ({ allowBillingRecovery = false }: { allowBillingRecovery?: boolean }) => {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, loading: platformLoading, isPlatformAdmin } = usePlatform();

  if (authLoading || platformLoading) return null;
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowBillingRecovery && !isPlatformAdmin && activeTenant?.billingStatus === "suspended") {
    return <Navigate to="/workspace/billing-lock" replace />;
  }

  return <Outlet />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<HomeRoute />} />
    <Route path="/portal" element={<Portal />} />
    <Route path="/portal/:tenantSlug" element={<Portal />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/login" element={<AdminLogin />} />
    <Route path="/signup" element={<AdminLogin />} />

    <Route element={<TenantAppRoute />}>
      <Route path="/admin" element={<Admin />} />
      <Route path="/isp-admin" element={<Admin />} />
      <Route path="/workspace" element={<TenantWorkspace />} />
      <Route path="/dashboard" element={<TenantWorkspace />} />
    </Route>

    <Route element={<TenantAppRoute allowBillingRecovery />}>
      <Route path="/workspace/billing" element={<TenantBilling />} />
      <Route path="/billing" element={<TenantBilling />} />
      <Route path="/workspace/billing-lock" element={<BillingLockPreview />} />
      <Route path="/billing-lock" element={<BillingLockPreview />} />
    </Route>

    <Route path="/orchestra/control-room" element={<PlatformAdmin />} />
    <Route path="/super-admin" element={<PlatformAdmin />} />
    <Route path="/control-room" element={<PlatformAdmin />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PlatformProvider>
            <AppRoutes />
          </PlatformProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
