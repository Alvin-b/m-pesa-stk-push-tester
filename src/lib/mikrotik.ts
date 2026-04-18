export const buildMikroTikShellHtml = ({
  portalUrl,
  title,
}: {
  portalUrl: string;
  title: string;
}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(14, 165, 233, 0.22), transparent 30%),
        radial-gradient(circle at bottom right, rgba(249, 115, 22, 0.16), transparent 26%),
        linear-gradient(180deg, #081426 0%, #0b1d35 100%);
      color: #f8fafc;
    }
    .shell {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .panel {
      width: min(1120px, 100%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      overflow: hidden;
      background: rgba(10, 19, 34, 0.92);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(14px);
    }
    .hero {
      padding: 18px 22px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: space-between;
      align-items: center;
    }
    .eyebrow {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.26em;
      color: rgba(125, 211, 252, 0.9);
      margin-bottom: 6px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
    }
    p {
      margin: 4px 0 0;
      color: rgba(226, 232, 240, 0.78);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: white;
      border-radius: 999px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
    }
    .btn.primary {
      border: none;
      background: linear-gradient(135deg, #0ea5e9, #2563eb);
    }
    .frame-wrap {
      position: relative;
      min-height: 78vh;
      background: rgba(255, 255, 255, 0.03);
    }
    iframe {
      width: 100%;
      min-height: 78vh;
      border: 0;
      background: transparent;
    }
    .status {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .status-card {
      text-align: center;
      padding: 18px 22px;
      border-radius: 20px;
      background: rgba(8, 15, 28, 0.82);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .spinner {
      width: 28px;
      height: 28px;
      margin: 0 auto 10px;
      border-radius: 999px;
      border: 3px solid rgba(255,255,255,0.16);
      border-top-color: #38bdf8;
      animation: spin .9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 720px) {
      .hero { padding: 16px; }
      h1 { font-size: 18px; }
      p { font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="panel">
      <div class="hero">
        <div>
          <div class="eyebrow">MikroTik Captive Portal</div>
          <h1>${title}</h1>
          <p>This router shell keeps the entry point local while the hosted portal UI stays up to date.</p>
        </div>
        <div class="actions">
          <a class="btn primary" id="openPortalLink" href="${portalUrl}" target="_blank" rel="noreferrer">Open portal</a>
          <button class="btn" id="reloadPortalButton" type="button">Reload portal</button>
        </div>
      </div>
      <div class="frame-wrap">
        <div class="status" id="loadingState">
          <div class="status-card">
            <div class="spinner"></div>
            <strong>Loading captive portal...</strong>
            <p>Your router session details are being passed to the hosted portal.</p>
          </div>
        </div>
        <iframe id="portalFrame" title="${title}" referrerpolicy="origin-when-cross-origin"></iframe>
      </div>
    </div>
  </div>
  <script>
    (function () {
      var remoteUrl = new URL(${JSON.stringify(portalUrl)});
      var localParams = new URLSearchParams(window.location.search);
      localParams.forEach(function (value, key) {
        remoteUrl.searchParams.set(key, value);
      });
      remoteUrl.searchParams.set("shell", "mikrotik");

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
  </script>
</body>
</html>`;
