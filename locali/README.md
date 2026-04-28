# `locali/` — Installazioni del prodotto TRGB

Questa cartella contiene le **personalizzazioni per locale** del prodotto TRGB.

Mentre `core/` (futuro, da R7) ospita la **logica di prodotto generica**, qui in `locali/<id>/` vivono brand, dati, deploy config, traduzioni e seed di ciascuna installazione.

## Struttura

| Cartella | Scopo |
|----------|-------|
| `tregobbi/` | Cliente zero — l'**Osteria Tre Gobbi** di Marco, su `trgb.tregobbi.it` |
| `trgb/` | Istanza pulita del prodotto — futuro deploy su `trgb.it` (demo navigabile + presentazione prodotto) |
| `_template/` | Scaffold neutro per creare un nuovo locale cliente |

## Cosa va in `locali/<id>/`

A regime (post R1-R7):

```
locali/<id>/
├── locale.json              # id, nome, dominio, lingua, timezone
├── branding.json            # palette, logo, wordmark, font, theme-color  (R2)
├── strings.json             # override testi UI specifici locale  (R5)
├── moduli_attivi.json       # quali moduli del prodotto sono accesi  (R8)
├── manifest.template.json   # template manifest PWA  (R2)
├── assets/                  # logo, favicon, apple-touch, splash, gobbette  (R2)
├── seeds/
│   └── migrations/          # migrazioni dati specifici del locale  (R3)
├── data/                    # DB del locale (gitignored, vedi .gitignore)  (R6)
├── deploy/
│   ├── env.production       # VPS_HOST, VPS_DIR, DOMAIN, PROBE_URL  (R4)
│   └── nginx.conf           # config nginx specifica
└── README.md                # come è configurato questo locale
```

## Come si seleziona il locale

Variabile d'ambiente **`TRGB_LOCALE`**:

- Backend (`main.py`): default `"tregobbi"` se non impostato. Esposto in `GET /system/info`.
- Frontend (`vite.config.js`): legge `VITE_TRGB_LOCALE` a build-time, lo inietta come costante globale `__TRGB_LOCALE__`.
- Deploy (`push.sh`): da R4, accetterà flag `-l <locale>` per scegliere quale installazione deployare.

## Come si crea un locale nuovo

Da R7 in poi:

```bash
cp -r locali/_template locali/cliente_pinco
# modifica locali/cliente_pinco/locale.json (id, nome, dominio)
# modifica locali/cliente_pinco/branding.json (palette, logo)
# crea locali/cliente_pinco/deploy/env.production con VPS, dominio, ecc.
TRGB_LOCALE=cliente_pinco npm run build  # build frontend per quel locale
TRGB_LOCALE=cliente_pinco python main.py  # run backend per quel locale
```

## Documenti correlati

- `docs/refactor_monorepo.md` — piano completo del refactor R1-R8
- `docs/architettura_mattoni.md` — mattoni condivisi della platform
- `CLAUDE.md` sezione "Refactor monorepo" e "Architettura modulare" — regole di disciplina codice
