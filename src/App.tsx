import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { PlatformProvider, usePlatform } from "@/lib/platform";
import Launchpad from "./pages/Launchpad";
import Portal from "./pages/Portal";
import AdminLogin from "./pages/AdminLogin";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import TenantWorkspace from "./pages/TenantWorkspace";
import PlatformAdmin from "./pages/PlatformAdmin";
import BillingLockPreview from "./pages/BillingLockPreview";
import TenantBilling from "./pages/TenantBilling";
import { useAuth } from "@/lib/auth";

const queryClient = new QueryClient();

const TenantAppRoute = ({ allowBillingRecovery = false, children }: { allowBillingRecovery?: boolean; children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, loading: platformLoading, isPlatformAdmin } = usePlatform();

  if (authLoading || platformLoading) return null;
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowBillingRecovery && !isPlatformAdmin && activeTenant?.billingStatus === "suspended") {
    return <Navigate to="/workspace/billing-lock" replace />;
  }

  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PlatformProvider>
            <Routes>
              <Route path="/" element={<Launchpad />} />
              <Route path="/launchpad" element={<Launchpad />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/portal/:tenantSlug" element={<Portal />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/login" element={<AdminLogin />} />
              <Route path="/signup" element={<AdminLogin />} />
              <Route path="/admin" element={<TenantAppRoute><Admin /></TenantAppRoute>} />
              <Route path="/isp-admin" element={<TenantAppRoute><Admin /></TenantAppRoute>} />
              <Route path="/workspace" element={<TenantAppRoute><TenantWorkspace /></TenantAppRoute>} />
              <Route path="/dashboard" element={<TenantAppRoute><TenantWorkspace /></TenantAppRoute>} />
              <Route path="/workspace/billing" element={<TenantAppRoute allowBillingRecovery><TenantBilling /></TenantAppRoute>} />
              <Route path="/billing" element={<TenantAppRoute allowBillingRecovery><TenantBilling /></TenantAppRoute>} />
              <Route path="/workspace/billing-lock" element={<TenantAppRoute allowBillingRecovery><BillingLockPreview /></TenantAppRoute>} />
              <Route path="/billing-lock" element={<TenantAppRoute allowBillingRecovery><BillingLockPreview /></TenantAppRoute>} />
              <Route path="/orchestra/control-room" element={<PlatformAdmin />} />
              <Route path="/control-room" element={<PlatformAdmin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PlatformProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
