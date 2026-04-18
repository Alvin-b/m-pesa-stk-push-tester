import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_BRAND } from "@/lib/brand";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-lg">
        <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary">{APP_BRAND}</p>
        <h1 className="mt-4 text-4xl font-bold">404</h1>
        <p className="mt-3 text-xl text-muted-foreground">That route does not exist.</p>
        <p className="mt-4 text-sm text-muted-foreground">
          Use the login, super admin, or tenant portal routes directly to move between ISP and platform views.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
          <a href="/" className="text-primary underline hover:text-primary/90">
            Open login
          </a>
          <a href="/super-admin" className="text-primary underline hover:text-primary/90">
            Open super admin
          </a>
          <a href="/signup" className="text-primary underline hover:text-primary/90">
            Create ISP account
          </a>
          <a href="/portal" className="text-primary underline hover:text-primary/90">
            Open portal
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
