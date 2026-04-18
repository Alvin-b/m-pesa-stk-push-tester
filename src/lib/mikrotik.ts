export const buildMikroTikShellHtml = ({
  portalUrl,
  title,
  assetBaseUrl,
}: {
  portalUrl: string;
  title: string;
  assetBaseUrl: string;
}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="${assetBaseUrl}/portal-shell.css" />
</head>
<body>
  <div id="app"></div>
  <script>
    window.PORTAL_CONFIG = {
      title: ${JSON.stringify(title)},
      portalUrl: ${JSON.stringify(portalUrl)},
      mac: '$(mac)',
      ip: '$(ip)',
      dst: '$(link-orig)',
      loginUrl: '$(link-login-only)',
      routerId: '$(router-id)'
    };
  </script>
  <script src="${assetBaseUrl}/portal-shell.js"></script>
</body>
</html>`;
