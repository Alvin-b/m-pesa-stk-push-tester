import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { PlatformProvider, usePlatform } from "@/lib/platform";
import Portal from "./pages/Portal";
import AdminLogin from "./pages/AdminLogin";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import TenantWorkspace from "./pages/TenantWorkspace";
import PlatformAdmin from "./pages/PlatformAdmin";
import BillingLockPreview from "./pages/BillingLockPreview";

const queryClient = new QueryClient();

const WorkspaceRoute = () => {
  const { activeTenant, loading } = usePlatform();

  if (loading) return null;
  if (activeTenant?.billingStatus === "suspended") {
    return <Navigate to="/workspace/billing-lock" replace />;
  }

  return <TenantWorkspace />;
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
              <Route path="/" element={<Navigate to="/portal" replace />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/portal/:tenantSlug" element={<Portal />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/workspace" element={<WorkspaceRoute />} />
              <Route path="/workspace/billing-lock" element={<BillingLockPreview />} />
              <Route path="/orchestra/control-room" element={<PlatformAdmin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PlatformProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
