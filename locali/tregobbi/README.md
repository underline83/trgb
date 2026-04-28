# `locali/tregobbi/` — Osteria Tre Gobbi

Cliente zero del prodotto TRGB. L'osteria di Marco Carminati a Bergamo.

**Dominio produzione:** `trgb.tregobbi.it`
**Build:** `TRGB_LOCALE=tregobbi npm run build` (frontend), `TRGB_LOCALE=tregobbi python main.py` (backend)
**Deploy:** `./push.sh "msg"` (default tregobbi). Da R4 in poi anche `./push.sh -l tregobbi "msg"`.

## Stato sessione 60 (R1) — 2026-04-28

Solo lo **scaffolding** è stato creato:
- `locale.json` — questo file di identità
- `README.md` — questo file

Tutti gli altri file (`branding.json`, `strings.json`, `seeds/`, `data/`, `deploy/`, `assets/`, ecc.) sono pianificati per le sessioni R2-R7. Vedi `docs/refactor_monorepo.md` §3.

Fino a R2, il branding è ancora hardcoded nel codice frontend (palette TRGB-02 in `frontend/src/index.css`, wordmark in `TrgbWordmark.jsx`, ecc.). Da R2 verrà letto da `locali/tregobbi/branding.json`.
