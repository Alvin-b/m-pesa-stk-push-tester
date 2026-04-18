(function () {
  var config = window.PORTAL_CONFIG || {};
  var app = document.getElementById("app");

  if (!app || !config.portalUrl) {
    return;
  }

  app.innerHTML = [
    '<div class="shell">',
    '  <div class="panel">',
    '    <div class="hero">',
    '      <div>',
    '        <div class="eyebrow">MikroTik Captive Portal</div>',
    '        <h1 class="title">' + (config.title || "WiFi Portal") + "</h1>",
    '        <p class="copy">This thin shell keeps the router entry local while the hosted portal stays up to date.</p>',
    "      </div>",
    '      <div class="actions">',
    '        <a class="btn primary" id="openPortalLink" href="#" target="_blank" rel="noreferrer">Open portal</a>',
    '        <button class="btn" id="reloadPortalButton" type="button">Reload portal</button>',
    "      </div>",
    "    </div>",
    '    <div class="frame-wrap">',
    '      <div class="status" id="loadingState">',
    '        <div class="status-card">',
    '          <div class="spinner"></div>',
    "          <strong>Loading captive portal...</strong>",
    '          <p class="copy">Router session details are being passed to the hosted portal.</p>',
    "        </div>",
    "      </div>",
    '      <iframe class="portal-frame" id="portalFrame" title="' + (config.title || "WiFi Portal") + '" referrerpolicy="origin-when-cross-origin"></iframe>',
    "    </div>",
    "  </div>",
    "</div>",
  ].join("");

  var remoteUrl = new URL(config.portalUrl);
  var passthroughParams = {
    mac: config.mac || "",
    ip: config.ip || "",
    dst: config.dst || "",
    "link-login-only": config.loginUrl || "",
    "router-id": config.routerId || "",
    shell: "cdn-loader",
  };

  Object.keys(passthroughParams).forEach(function (key) {
    if (passthroughParams[key]) {
      remoteUrl.searchParams.set(key, passthroughParams[key]);
    }
  });

  var frame = document.getElementById("portalFrame");
  var loadingState = document.getElementById("loadingState");
  var openPortalLink = document.getElementById("openPortalLink");
  var reloadPortalButton = document.getElementById("reloadPortalButton");

  var applyTarget = function () {
    var target = remoteUrl.toString();
    frame.src = target;
    openPortalLink.href = target;
  };

  frame.addEventListener("load", function () {
    loadingState.style.display = "none";
  });

  reloadPortalButton.addEventListener("click", function () {
    loadingState.style.display = "flex";
    applyTarget();
  });

  applyTarget();
})();
