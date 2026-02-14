import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Wifi, Shield } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 space-y-8">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 glow-primary-strong">
          <Wifi className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight font-mono text-foreground">
          WiFi Billing
        </h1>
        <p className="text-muted-foreground max-w-md">
          Automated WiFi hotspot billing with M-Pesa payments and MikroTik integration
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          size="lg"
          onClick={() => navigate("/portal")}
          className="font-mono font-semibold glow-primary px-8"
        >
          <Wifi className="mr-2 h-5 w-5" />
          Connect to WiFi
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => navigate("/admin/login")}
          className="font-mono font-semibold px-8"
        >
          <Shield className="mr-2 h-5 w-5" />
          Admin Portal
        </Button>
      </div>

      <p className="text-xs text-muted-foreground font-mono">
        Powered by M-Pesa Daraja API · MikroTik · FreeRADIUS
      </p>
    </div>
  );
};

export default Index;
