# Splash Screens iOS — TODO

Documentazione delle immagini splash necessarie per chiudere la **PWA Fase 0** (roadmap 1.1) e completare l'esperienza "Aggiungi a Home" su iPad/iPhone. Vedi `docs/refactor_monorepo.md` §3 R2 step 4.

## Stato

- ✅ `apple-touch-icon-*.png` (11 risoluzioni) — già presenti in `frontend/public/icons/`
- ✅ `manifest.webmanifest` valido — già presente
- ✅ Service worker network-first attivo — sessione 28
- ❌ **Splash screens iOS** — DA GENERARE (questo file)

## Cosa serve

iOS richiede una matrice di immagini splash con **dimensioni esatte** per ogni device + orientamento. Senza queste, l'app installata da Safari mostra uno splash bianco vuoto.

### Matrice standard 2024-2026 (10 device)

| Device | Risoluzione | Tag HTML media query |
|--------|-------------|----------------------|
| iPhone 14 Pro Max | 1290×2796 | `(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)` |
| iPhone 14 Pro / 15 / 15 Pro | 1179×2556 | `(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)` |
| iPhone 14 Plus / 15 Plus | 1284×2778 | `(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)` |
| iPhone 14 / 13 | 1170×2532 | `(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)` |
| iPhone 13 mini / 12 mini | 1080×2340 | `(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)` |
| iPhone SE 3rd | 750×1334 | `(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)` |
| iPad Pro 12.9 | 2048×2732 | `(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)` |
| iPad Pro 11 / Air 5 | 1668×2388 | `(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)` |
| iPad 10th gen | 1640×2360 | `(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2)` |
| iPad mini 6 | 1488×2266 | `(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2)` |

Aggiungere anche le versioni **landscape** (swap width/height + `(orientation: landscape)`).

Totale: ~20 immagini PNG.

## Specifica di design per Tre Gobbi

- **Sfondo**: `#F4F1EC` (brand-cream)
- **Logo centrale**: `TRGB-02-icon-color.svg` (gobbette+T) renderizzato a 30-40% della larghezza dell'immagine
- **Wordmark sotto al logo**: "TRGB" in Helvetica Neue 800, color `#111111`, dimensione coerente
- **Margine**: ~20% di safe area attorno al logo per evitare crop
- **Niente testo aggiuntivo** ("Caricamento...", ecc.) — Apple penalizza splash con testo dinamico

## Come generarli (3 opzioni)

### Opzione 1 — Tool online (consigliato per primo giro)
- [PWA Builder Image Generator](https://www.pwabuilder.com/imageGenerator)
- [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator) (CLI Node)
- Carica `TRGB-02-splash.svg` come master + sfondo `#F4F1EC`, scarica zip con tutte le risoluzioni

### Opzione 2 — Script CLI con sharp (Node)
```bash
cd frontend
npm install --save-dev pwa-asset-generator
npx pwa-asset-generator src/assets/brand/TRGB-02-splash.svg public/icons/splash \
  --background "#F4F1EC" \
  --padding "calc(50vh - 25%)" \
  --opaque true \
  --type "png" \
  --quality 90
```
Genera anche le `<meta>` HTML pronte da incollare in `index.html`.

### Opzione 3 — Figma + export manuale
Usa il template Figma di iOS PWA splash, esporta a PNG.

## Dove vanno

Dopo la generazione:
- File PNG → `frontend/public/icons/splash/` (o `locali/tregobbi/assets/splash/` post R7)
- Tag HTML `<link rel="apple-touch-startup-image" ...>` → `frontend/index.html` (o generati a build-time da template, R2-bis)

## Aggiornare branding.json dopo la generazione

In `locali/tregobbi/branding.json`, sostituire:
```json
"_splash_ios_TODO": "..."
```
Con:
```json
"splash_ios": [
  {"size": "1290x2796", "src": "/icons/splash/iphone-14-pro-max.png", "media": "..."},
  ...
]
```

## Riferimenti

- Apple HIG Splash Screen: https://developer.apple.com/design/human-interface-guidelines/launching
- PWA Builder docs: https://www.pwabuilder.com/
- Roadmap TRGB 1.1 (PWA Fase 0): `docs/roadmap.md`
