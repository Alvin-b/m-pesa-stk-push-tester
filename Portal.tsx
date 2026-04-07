// ONLY CHANGED PARTS ARE MARKED WITH 🔥
// Everything else is your original code

// ─── FIX 1: MikroTik detection (UNCHANGED) ─────────────────
const detectMikroTik = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  const hasMikroTikParams =
    params.has("link-login-only") ||
    params.has("link-login") ||
    params.has("chap-id") ||
    params.has("mac") ||
    params.has("link-orig");

  if (hasMikroTikParams) {
    sessionStorage.setItem("mikrotik_params", window.location.search);
    return true;
  }

  return !!sessionStorage.getItem("mikrotik_params");
};

// ─── FIX 2: CLEAN PARAMS 🔥 ─────────────────────────────────
const getMikroTikParams = () => {
  let search = window.location.search;
  const saved = sessionStorage.getItem("mikrotik_params");

  if (!new URLSearchParams(search).has("link-login-only") && saved) {
    search = saved;
  }

  const params = new URLSearchParams(search);

  const clean = (url: string | null) => {
    if (!url) return null;
    return url.split("?")[0]; // 🔥 REMOVE query params
  };

  return {
    linkLoginOnly: clean(params.get("link-login-only")),
    linkLogin: clean(params.get("link-login")),
    linkOrig: params.get("link-orig") || params.get("link-redirect"),
    mac: params.get("mac"),
    chapId: params.get("chap-id"),
    chapChallenge: params.get("chap-challenge"),
  };
};

// ─── FIX 3: REAL POST LOGIN 🔥 (MAIN FIX) ──────────────────
const loginToMikroTik = (code: string): void => {
  // 🚨 BLOCK LOOP
  if (window.location.href.includes("10.10.0.1/login")) {
    console.log("⚠️ Preventing login loop");
    return;
  }

  if (!code || code.length < 5) {
    console.log("⚠️ Invalid code, blocking login");
    return;
  }

  const mt = getMikroTikParams();
  let loginUrl = mt.linkLoginOnly || mt.linkLogin;

  if (!loginUrl) {
    console.log("⚠️ No MikroTik login URL");
    return;
  }

  // 🔥 CRITICAL FIX
  loginUrl = loginUrl.split("?")[0];

  console.log("✅ Clean login URL:", loginUrl);

  const form = document.createElement("form");
  form.method = "POST";
  form.action = loginUrl;
  form.style.display = "none";

  const addField = (name: string, value: string) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  addField("username", code);
  addField("password", code);

  // 🔥 FORCE STABLE REDIRECT (prevents loop)
  addField("dst", "http://neverssl.com");

  if (mt.chapId) addField("chap-id", mt.chapId);
  if (mt.chapChallenge) addField("chap-challenge", mt.chapChallenge);
  if (mt.mac) addField("mac", mt.mac);

  document.body.appendChild(form);

  setTimeout(() => {
    form.submit();
  }, 300);
};

// ─── FIX 4: CONNECT FLOW 🔥 (NO DOUBLE LOGIN) ──────────────
const connectUser = async (code: string) => {
  setVoucherCode(code);

  if (mikrotikDetected) {
    setStep("connecting");

    await new Promise((resolve) => setTimeout(resolve, 1200));

    // 🔥 CALL ONLY ONCE
    loginToMikroTik(code);

    return; // 🔥 STOP HERE (prevents duplicate calls)
  }

  setStep("success");
};
