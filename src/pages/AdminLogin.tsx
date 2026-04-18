import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { APP_BRAND, APP_OPERATOR_CONSOLE, APP_PLATFORM_NAME } from "@/lib/brand";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wifi, LogIn, UserPlus } from "lucide-react";
import networkBg from "@/assets/network-bg.png";

const AdminLogin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const signUpRequested = location.pathname === "/signup" || searchParams.get("mode") === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessSlug, setBusinessSlug] = useState("");
  const [isSignUp, setIsSignUp] = useState(signUpRequested);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { signIn, signUp } = useAuth();

  useEffect(() => {
    setIsSignUp(signUpRequested);
  }, [signUpRequested]);

  const switchMode = (nextMode: "login" | "signup") => {
    setError("");
    setSuccess("");
    setIsSignUp(nextMode === "signup");
    navigate(nextMode === "signup" ? "/signup" : "/login");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (isSignUp) {
      const { error: signUpError } = await signUp(email, password, fullName, businessName, businessSlug);
      if (signUpError) {
        setError(signUpError);
      } else {
        setSuccess(`Account created. Verify your email, then sign in to open your ${APP_BRAND} ISP dashboard.`);
        setIsSignUp(false);
        navigate("/login");
      }
    } else {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(signInError);
      } else {
        const { data: authUser } = await supabase.auth.getUser();
        const userId = authUser.user?.id;

        if (userId) {
          const { data: adminRole } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "admin")
            .maybeSingle();

          navigate(adminRole ? "/super-admin" : "/workspace");
        } else {
          navigate("/workspace");
        }
      }
    }

    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ backgroundImage: `url(${networkBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      <Card className="w-full max-w-md relative z-10 border-border bg-card/90 backdrop-blur-md shadow-2xl">
        <CardContent className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-primary">{APP_BRAND}</p>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mx-auto">
              <Wifi className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-mono text-foreground tracking-wide uppercase">{APP_OPERATOR_CONSOLE}</h1>
              <p className="text-sm text-muted-foreground">Create an ISP account or sign in to the ISP dashboard or super admin dashboard in {APP_PLATFORM_NAME}.</p>
            </div>
          </div>

          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => switchMode("login")}
              className={`flex-1 py-2.5 text-sm font-mono font-medium flex items-center justify-center gap-2 transition-colors ${
                !isSignUp ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              <LogIn className="h-4 w-4" /> Login
            </button>
            <button
              onClick={() => switchMode("signup")}
              className={`flex-1 py-2.5 text-sm font-mono font-medium flex items-center justify-center gap-2 transition-colors ${
                isSignUp ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="h-4 w-4" /> Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground font-mono">Full Name</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required={isSignUp}
                    className="font-mono bg-muted/30 h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground font-mono">ISP / Business Name</label>
                  <Input
                    value={businessName}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setBusinessName(nextName);
                      if (!businessSlug.trim()) {
                        setBusinessSlug(
                          nextName
                            .toLowerCase()
                            .trim()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-+|-+$/g, ""),
                        );
                      }
                    }}
                    placeholder="Nairobi Fibre Connect"
                    required={isSignUp}
                    className="font-mono bg-muted/30 h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground font-mono">Portal Slug</label>
                  <Input
                    value={businessSlug}
                    onChange={(e) =>
                      setBusinessSlug(
                        e.target.value
                          .toLowerCase()
                          .trim()
                          .replace(/[^a-z0-9-]+/g, "-")
                          .replace(/^-+|-+$/g, ""),
                      )
                    }
                    placeholder="nairobi-fibre-connect"
                    required={isSignUp}
                    className="font-mono bg-muted/30 h-11"
                  />
                  <p className="text-[10px] text-muted-foreground font-mono">
                    This becomes your portal path: `/portal/{businessSlug || "your-slug"}`
                  </p>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground font-mono">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                className="font-mono bg-muted/30 h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground font-mono">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
                minLength={6}
                className="font-mono bg-muted/30 h-11"
              />
            </div>

            {error && <p className="text-destructive text-xs font-mono">{error}</p>}
            {success && <p className="text-primary text-xs font-mono">{success}</p>}

            <Button type="submit" disabled={loading} className="w-full font-mono font-semibold h-11 text-base">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSignUp ? "Create ISP Account" : "Sign In"}
            </Button>
          </form>
          <p className="text-center text-[11px] font-mono text-muted-foreground">
            Customer portals stay tenant-specific at `/portal/your-isp-slug`.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
