import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { Loader2, Shield } from "lucide-react";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (isSignUp) {
      const { error } = await signUp(email, password, fullName);
      if (error) {
        setError(error);
      } else {
        setSuccess("Account created! Please check your email to verify your account before signing in.");
        setIsSignUp(false);
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error);
      } else {
        navigate("/admin");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-mono text-foreground">Admin Portal</h1>
          <p className="text-muted-foreground text-sm">Sign in to manage your WiFi network</p>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-mono">
              {isSignUp ? "Create Account" : "Sign In"}
            </CardTitle>
            <CardDescription>
              {isSignUp ? "Register a new admin account" : "Enter your credentials"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground font-mono">Full Name</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required={isSignUp}
                    className="font-mono bg-muted/50"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground font-mono">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="font-mono bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground font-mono">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="font-mono bg-muted/50"
                />
              </div>
              {error && <p className="text-destructive text-xs font-mono">{error}</p>}
              {success && <p className="text-primary text-xs font-mono">{success}</p>}
              <Button type="submit" disabled={loading} className="w-full font-mono font-semibold glow-primary">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSignUp ? "Create Account" : "Sign In"}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccess(""); }}
                className="text-xs text-muted-foreground hover:text-primary font-mono transition-colors"
              >
                {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;
