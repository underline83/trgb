# `locali/trgb/` — Istanza pulita del prodotto TRGB

Questa è l'**istanza prodotto** — la versione "pulita" senza personalizzazioni cliente. Futuro deploy su `trgb.it` come:
- Demo navigabile aperta a chiunque voglia provare TRGB
- Vetrina del prodotto per clienti potenziali
- Test bench per Marco per verificare che `core/` resti generico (zero contaminazioni Tre Gobbi)

**Dominio produzione (futuro):** `trgb.it`
**Build:** `TRGB_LOCALE=trgb npm run build` (frontend), `TRGB_LOCALE=trgb python main.py` (backend)
**Deploy effettivo:** Tappa 3 a fine R4 (vedi `docs/refactor_monorepo.md` §9).

## Stato sessione 60 (R1) — 2026-04-28

Solo lo **scaffolding** è stato creato:
- `locale.json` — identità del locale prodotto
- `README.md` — questo file

Tutti gli altri file arrivano nelle sessioni successive:
- `branding.json` (R2): palette neutra prodotto (no gobbette TRGB-02)
- `assets/` (R2): logo TRGB neutro, manifest PWA generico
- `strings.json` (R5): vuoto (l'istanza pulita usa fallback in italiano generico dal codice)
- `data/` (R6): vuoto / DB seed neutri di esempio
- `deploy/env.production` (R4): config deploy con VPS_HOST, DOMAIN=trgb.it, ecc.

Fino al deploy effettivo (R4), questa cartella serve per:
1. **Dev mode locale:** `TRGB_LOCALE=trgb npm run dev` per vedere come si comporta il codice quando il locale NON è tregobbi (smaschera contaminazioni hardcoded).
2. **Disciplina:** ogni feature aggiunta a TRGB deve poter girare anche con `TRGB_LOCALE=trgb` senza dipendere da brand/dati/seed Tre Gobbi.
