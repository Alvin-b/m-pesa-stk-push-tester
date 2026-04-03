import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const lastUserMsg = messages[messages.length - 1]?.content || "";

    // ── Extract identifiers from the latest message ──
    const codeMatch = lastUserMsg.match(/\b([A-Z]{5})\b/);
    const receiptMatch = lastUserMsg.match(/\b([A-Z]{2}[A-Z0-9]{8,})\b/);
    const phoneMatch = lastUserMsg.match(/(?:0|\+?254)\d{9}/);

    let systemContext = "";
    let foundVoucher: any = null;

    // ── Look up voucher by code or receipt ──
    const lookupCode = codeMatch?.[1] || receiptMatch?.[1];
    if (lookupCode) {
      const { data: v } = await supabase
        .from("vouchers")
        .select("*, packages(*)")
        .or(`code.eq.${lookupCode},mpesa_receipt.eq.${lookupCode}`)
        .maybeSingle();
      foundVoucher = v;
    }

    // ── Look up by phone if no voucher yet ──
    if (!foundVoucher && phoneMatch) {
      const phone = phoneMatch[0].replace(/^0/, "254").replace(/^\+/, "");
      const { data: vlist } = await supabase
        .from("vouchers")
        .select("*, packages(*)")
        .eq("phone_number", phone)
        .order("created_at", { ascending: false })
        .limit(1);
      foundVoucher = vlist?.[0] || null;
    }

    if (foundVoucher) {
      const pkg = (foundVoucher as any).packages;
      systemContext += `VOUCHER: code=${foundVoucher.code}, status=${foundVoucher.status}, package="${pkg?.name}" KES ${pkg?.price}, phone=${foundVoucher.phone_number}, created=${foundVoucher.created_at}, receipt=${foundVoucher.mpesa_receipt || "none"}`;

      // Sessions
      const { data: sessions } = await supabase
        .from("sessions")
        .select("is_active,started_at,expires_at,ip_address,mac_address")
        .eq("voucher_id", foundVoucher.id)
        .order("started_at", { ascending: false })
        .limit(3);
      systemContext += sessions?.length
        ? `\nSESSIONS: ${JSON.stringify(sessions)}`
        : `\nSESSIONS: none`;

      // RADIUS
      const { data: radcheck } = await supabase
        .from("radcheck")
        .select("username")
        .eq("username", foundVoucher.code)
        .maybeSingle();
      systemContext += radcheck
        ? `\nRADIUS: credentials present ✓`
        : `\nRADIUS: MISSING – user cannot authenticate`;
    }

    // ── Packages list ──
    const { data: packages } = await supabase
      .from("packages")
      .select("name,price,duration_minutes,speed_limit")
      .eq("is_active", true)
      .order("price");
    if (packages?.length) {
      systemContext += `\nPACKAGES: ${packages.map(p => `${p.name} KES${p.price} ${p.duration_minutes}min ${p.speed_limit || ""}`).join(" | ")}`;
    }

    // ── System prompt: terse, action-oriented, agent with powers ──
    const systemPrompt = `WiFi support agent. READ-ONLY backend access. Be ULTRA concise.

WHAT YOU CAN DO:
- Check voucher status, sessions, RADIUS credentials, packages
- Diagnose connection issues from system data instantly
- RADIUS missing → "Re-enter your code on the WiFi login page"
- Expired → "Your plan expired. Buy a new one."
- Paid but no voucher → "Share your M-Pesa receipt code so I can check"
- Forgot code → tell them (verify phone first)

ABSOLUTE RESTRICTIONS — NEVER VIOLATE:
- You CANNOT create, modify, or generate vouchers, codes, or RADIUS credentials.
- You CANNOT grant, extend, or restore WiFi access for anyone under ANY circumstances.
- You CANNOT bypass payment. Every connection requires a valid paid voucher.
- If asked to give free access, reconnect expired vouchers, or generate codes, REFUSE and say: "I can only help troubleshoot — all access requires a valid purchase."
- Do NOT suggest workarounds that bypass payment.

RULES:
- 1-2 sentences max per response. No filler, no greetings after first message.
- Use system data immediately — never ask for info you already have.
- Bullet points only when listing steps.
- If user describes a problem, ask for their code/receipt/phone in ONE short sentence.

DATA:
${systemContext || "No identifiers yet. Ask: 'What's your voucher code, M-Pesa receipt, or phone number?'"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests. Try again in a moment." }), {
          status: 429,
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
