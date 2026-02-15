import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Gather system context for the AI
    let systemContext = "";

    // If user provides a voucher code or phone or receipt, look it up
    const lastUserMsg = messages[messages.length - 1]?.content || "";
    
    // Extract potential codes (5-letter uppercase, mpesa receipts, phone numbers)
    const codeMatch = lastUserMsg.match(/\b([A-Z]{5,10})\b/);
    const phoneMatch = lastUserMsg.match(/(?:0|\+?254)\d{9}/);
    const receiptMatch = lastUserMsg.match(/\b([A-Z0-9]{10,})\b/);

    if (codeMatch) {
      const code = codeMatch[1];
      const { data: voucher } = await supabase
        .from("vouchers")
        .select("*, packages(*)")
        .or(`code.eq.${code},mpesa_receipt.eq.${code}`)
        .maybeSingle();
      
      if (voucher) {
        systemContext += `\n\nVOUCHER FOUND: Code=${voucher.code}, Status=${voucher.status}, Package=${(voucher as any).packages?.name || 'unknown'}, Price=KES ${(voucher as any).packages?.price || '?'}, Phone=${voucher.phone_number}, Created=${voucher.created_at}, MpesaReceipt=${voucher.mpesa_receipt || 'none'}`;
        
        // Check sessions for this voucher
        const { data: sessions } = await supabase
          .from("sessions")
          .select("*")
          .eq("voucher_id", voucher.id)
          .order("started_at", { ascending: false })
          .limit(3);
        
        if (sessions && sessions.length > 0) {
          systemContext += `\nSESSIONS: ${JSON.stringify(sessions.map(s => ({ active: s.is_active, started: s.started_at, expires: s.expires_at, ip: s.ip_address, mac: s.mac_address })))}`;
        } else {
          systemContext += `\nNO SESSIONS found for this voucher.`;
        }

        // Check radcheck entry
        const { data: radcheck } = await supabase
          .from("radcheck")
          .select("*")
          .eq("username", voucher.code);
        
        systemContext += radcheck && radcheck.length > 0
          ? `\nRADIUS CREDENTIALS: Active (found in radcheck)`
          : `\nRADIUS CREDENTIALS: MISSING from radcheck - user cannot authenticate!`;
      }
    }

    if (phoneMatch && !systemContext.includes("VOUCHER FOUND")) {
      const phone = phoneMatch[0].replace(/^0/, "254").replace(/^\+/, "");
      const { data: vouchers } = await supabase
        .from("vouchers")
        .select("code, status, created_at, mpesa_receipt, packages(name, price)")
        .eq("phone_number", phone)
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (vouchers && vouchers.length > 0) {
        systemContext += `\n\nVOUCHERS FOR PHONE ${phone}: ${JSON.stringify(vouchers)}`;
      }
    }

    // Available packages info
    const { data: packages } = await supabase
      .from("packages")
      .select("name, price, duration_minutes, speed_limit")
      .eq("is_active", true)
      .order("price");
    
    if (packages) {
      systemContext += `\n\nAVAILABLE PACKAGES: ${JSON.stringify(packages)}`;
    }

    const systemPrompt = `You are a friendly WiFi support assistant for a captive portal hotspot system. You help customers who have purchased WiFi access and are experiencing issues.

CAPABILITIES:
- You can look up voucher codes, M-Pesa receipts, and phone numbers to check transaction status
- You can see if a user's RADIUS credentials exist (needed to connect)
- You can see session history (active connections, expiry times)
- You can tell users their voucher code if they lost it (by phone number lookup)
- You can explain available WiFi packages and pricing

IMPORTANT RULES:
- NEVER give free internet access or create vouchers
- NEVER modify any system data - you are read-only
- If a user's voucher is active but their RADIUS credentials are missing, tell them to contact admin or try re-entering their code
- If a user paid but no voucher exists, advise them to check with admin or try their M-Pesa receipt code
- Be concise, helpful, and friendly
- Use simple language, many users may not be tech-savvy
- If you find their voucher code, remind them: "Use this code as both your username AND password to connect"

TROUBLESHOOTING STEPS:
1. Ask for their voucher code, M-Pesa receipt, or phone number
2. Look up their transaction
3. Check if RADIUS credentials exist
4. Check session status (active/expired)
5. Provide clear next steps

SYSTEM DATA:${systemContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Support chat unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("support-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
