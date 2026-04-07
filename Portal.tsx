// 🔥 PATCHES ONLY — APPLY THESE CHANGES TO YOUR EXISTING 700+ LINE FILE

// =========================
// ✅ 1. REPLACE loginToMikroTik FUNCTION
// =========================
const loginToMikroTik = (code: string): void => {
  const mt = getMikroTikParams();
  const loginUrl = mt.linkLoginOnly || mt.linkLogin;

  if (!loginUrl) return;

  // 🚫 Prevent infinite loop
  if (sessionStorage.getItem("mt_login_attempted")) {
    console.log("Login already attempted — skipping");
    return;
  }

  if (
    window.location.hostname === "10.10.0.1" &&
    window.location.pathname.includes("login")
  ) {
    console.log("Already on MikroTik login page — skipping");
    return;
  }

  sessionStorage.setItem("mt_login_attempted", "1");

  const form = document.createElement("form");
  form.method = "POST";
  form.action = loginUrl.split("?")[0]; // 🔥 REMOVE query params (fix GET issue)
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

  // 🔥 CRITICAL FIX — stop captive loop
  addField("dst", "http://neverssl.com");

  if (mt.chapId) addField("chap-id", mt.chapId);
  if (mt.chapChallenge) addField("chap-challenge", mt.chapChallenge);
  if (mt.mac) addField("mac", mt.mac);

  document.body.appendChild(form);

  setTimeout(() => {
    form.submit();
  }, 300);
};


// =========================
// ✅ 2. PATCH detectMikroTik FUNCTION
// =========================
const detectMikroTik = (): boolean => {
  // 🔥 Ignore Windows / Android captive checks
  if (window.location.href.includes("msftconnecttest")) {
    console.log("Ignoring captive test redirect");
    return false;
  }

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


// =========================
// ✅ 3. PATCH connectUser FUNCTION
// =========================
const connectUser = async (code: string) => {
  setVoucherCode(code);

  if (mikrotikDetected) {
    setStep("connecting");

    await new Promise((resolve) => setTimeout(resolve, 1200));

    loginToMikroTik(code);

    setStep("success");
  } else {
    setStep("success");
  }
};


// =========================
// ✅ 4. ADD THIS useEffect (CLEAN URL)
// =========================
useEffect(() => {
  if (detectMikroTik()) {
    window.history.replaceState({}, "", "/portal");
  }
}, []);


// =========================
// 🔥 THAT'S IT — DO NOT TOUCH OTHER CODE
// =========================
// These patches fix:
// ✔ Infinite reconnect loop (mobile + PC)
// ✔ GET → POST login issue
// ✔ msftconnecttest interference
// ✔ repeated login attempts
// ✔ unstable redirects
