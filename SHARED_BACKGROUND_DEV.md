# Shared Background - Kurz-Guide

## Pflicht für neue Seiten
1. `html` braucht die Klasse `shared-bg-html`.
2. `body` braucht die Klasse `shared-bg-body`.
3. Im `<head>`:
   - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`
   - `<meta name="theme-color" content="#7cffd1" />` (First Paint auf iOS)
4. Assets einbinden:
   - `/assets/shared-background.css`
   - `/assets/shared-background.js`
5. Direkt nach `<body>`:
   - `<div class="ambient" aria-hidden="true"></div>`
   - `<div class="cursor-glow" aria-hidden="true"></div>`
6. JS initialisieren: `initSharedBackground()`

## Minimal-Template
```html
<!DOCTYPE html>
<html lang="en" class="shared-bg-html">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#7cffd1" />
  <link rel="stylesheet" href="/assets/shared-background.css" />
</head>
<body class="shared-bg-body">
  <div class="ambient" aria-hidden="true"></div>
  <div class="cursor-glow" aria-hidden="true"></div>

  <!-- content -->

  <script src="/assets/shared-background.js"></script>
  <script>initSharedBackground();</script>
</body>
</html>
```

## Optional
- Eigene Theme-Farbe:
  - JS: `initSharedBackground({ themeColor: "#7cffd1" })`
  - oder CSS: `html.shared-bg-html { --shared-theme-color: #7cffd1; }`
- Mobile Safe-Area bei eigenem Body-Padding mit `env(safe-area-inset-*)` berücksichtigen.
- Kein `html/body`-Override auf weiße Vollfläche setzen (`background: #fff`), sonst gehen iOS-Farbtints kaputt.
