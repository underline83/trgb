# Architettura locale (multi-tenant via filesystem)

**Data ultimo aggiornamento:** 2026-04-30 (R7 — chiusura prima fase refactor monorepo)
**Documento canonico per la separazione `core/` vs `locali/<id>/`**
**Documenti correlati:** `docs/refactor_monorepo.md` · `CLAUDE.md` (sezioni "Refactor monorepo" e "Architettura modulare")

---

## 1. Modello concettuale

TRGB è un **monorepo** con due tipi di codice:

- **`core/`** (futuro, post R7) — il PRODOTTO TRGB generico, riusabile per qualsiasi ristoratore. Oggi questa logica vive in `app/` e `frontend/src/` direttamente; quando R7 sarà cleanup completo si farà la copertura concettuale `core/` (l'unico cambio formale è il path).
- **`locali/<id>/`** — una directory per ogni "installazione" del prodotto (cliente). Contiene SOLO le personalizzazioni di quel cliente: brand, dati seed, deploy config, override testi.

I "locali" oggi presenti:

| ID | Tipo | Dominio | Note |
|----|------|---------|------|
| `tregobbi` | Cliente zero (osteria di Marco) | `trgb.tregobbi.it` | Default storico. `TRGB_LOCALE=tregobbi` se non specificato |
| `trgb` | Istanza prodotto pulita | `trgb.it` (futuro) | Demo navigabile + presentazione prodotto a clienti potenziali |
| `_template/` | Scaffold per cliente nuovo | — | Si copia per creare un locale nuovo |

---

## 2. Cosa vive in `locali/<id>/`

Struttura standard, identica per ogni locale:

```
locali/<id>/
├── locale.json              # id, nome, dominio, lingua, timezone, valuta
├── branding.json            # palette TRGB-02 / palette cliente, logo, font, theme-color, PWA name+description
├── strings.json             # override testi UI (chiavi dot-notation, lette via t(key, fallback) helper)
├── manifest.template.json   # template manifest PWA (opzionale, generato da branding.json)
├── assets/                  # logo, favicon, apple-touch icons, splash iOS, gobbette SVG
│   └── splash/              # iOS launch images (matrice device-specific)
├── seeds/
│   └── migrations/          # migrazioni con dati specifici cliente (flag TRGB_SPECIFIC)
├── data/                    # DB SQLite del locale (gitignored, gestito a R6.5 da locale_data_path)
├── deploy/
│   ├── env.production       # VPS_HOST, VPS_DIR, DOMAIN, PROBE_URL, TRGB_LOCALE, BACKEND_PORT, ...
│   └── nginx.conf           # config nginx per il dominio del locale (opzionale)
└── README.md                # come è configurato questo locale + storia
```

Tutti i file sono **letti da helper centralizzati** che esistono in `app/utils/` e `frontend/src/utils/`. Vedi sezione 3.

---

## 3. Helper centralizzati (single source of truth)

Mai hardcodare path o stringhe specifici di un cliente nel codice di prodotto. Sempre via uno di questi helper:

### Backend (Python)

| Helper | Cosa | Da quando |
|--------|------|-----------|
| `app/utils/uploads.py::get_uploads_dir()` | Path uploads utenti per locale corrente | R4 (sessione 60) |
| `app/utils/locale_data.py::locale_data_path(filename)` | Path DB SQLite per locale corrente (lookup `locali/<id>/data/` → fallback `app/data/`) | R6 (sessione 60) — applicato ai 9 DB attivi a R6.5 |
| `app/utils/locale_strings.py::t(key, fallback)` | Stringhe UI tenant-aware (PDF brand, WA templates, page titles) | R5 (sessione 60) |
| Endpoint `GET /system/info` | `{locale, product, version, commit}` esposto a frontend e probe esterni | R1+R4+R6 (sessione 60) |
| Endpoint `GET /locale/branding.json` | Palette + asset paths del locale corrente | R2 (sessione 60) |
| Endpoint `GET /locale/strings.json` | Strings UI del locale corrente | R5 (sessione 60) |

### Frontend (React)

| Helper | Cosa |
|--------|------|
| `frontend/src/utils/brandConfig.js::useBranding()` / `t(path)` / `loadBrandConfig()` | Hook React per branding tenant-aware (palette CSS vars, wordmark, font, asset paths) |
| `frontend/src/utils/localeStrings.js::useLocaleStrings()` / `t(key, fallback)` / `loadLocaleStrings()` | Hook React per strings UI tenant-aware |

Entrambi vengono caricati in **parallelo al boot** (`frontend/src/main.jsx`) PRIMA del primo render React.

---

## 4. Variabile ambiente `TRGB_LOCALE`

L'identificatore del locale corrente è una env var:

```bash
TRGB_LOCALE=tregobbi   # default — osteria di Marco
TRGB_LOCALE=trgb        # istanza prodotto pulita
TRGB_LOCALE=cliente_pinco  # cliente nuovo
```

Letta da:
- **Backend** (`main.py`): banner di boot `🏠 TRGB_LOCALE: <id>`, esposta in `/system/info`, usata dagli helper.
- **Frontend** (`vite.config.js`): legge `VITE_TRGB_LOCALE` a build-time, iniettata come costante globale `__TRGB_LOCALE__`.
- **Deploy** (`push.sh -l <locale>`): legge `locali/<id>/deploy/env.production` che setta `TRGB_LOCALE` per il backend production.

---

## 5. Workflow onboarding cliente nuovo

Quando arriva un cliente nuovo (es. "Osteria da Mario"), per crearlo come locale si fa:

### Passo 1 — Scaffold

```bash
cp -r locali/_template locali/da_mario
cd locali/da_mario
mv locale.json.template locale.json
mv branding.json.template branding.json
mv strings.json.template strings.json
mv deploy/env.production.template deploy/env.production
```

### Passo 2 — Personalizzazione

Editare i file appena copiati con i valori reali del cliente:

- `locale.json` — id, nome, dominio, lingua, timezone, valuta
- `branding.json` — palette del cliente, logo, wordmark, font, PWA config
- `strings.json` — override testi (es. firma WA "Osteria da Mario", footer PDF)
- `deploy/env.production` — VPS_HOST, VPS_DIR, DOMAIN, BACKEND_PORT (consigliato 8000+N)
- `assets/` — copia logo, favicon, icone PWA, splash iOS del cliente

### Passo 3 — Deploy

```bash
./push.sh -l da_mario "init: locale da_mario"
```

Il backend del cliente partirà con `TRGB_LOCALE=da_mario`, leggerà i suoi file `locali/da_mario/*`, e sarà completamente isolato dall'osteria di Marco.

### Passo 4 — Provisioning operativo VPS

Sul VPS (operazione manuale una tantum):

```bash
sudo systemctl edit --full --force trgb-backend-da_mario.service  # nuovo systemd service per il cliente
sudo nginx -t && sudo systemctl reload nginx                       # nginx vhost per il dominio
sudo certbot --nginx -d <dominio>                                  # certificato SSL
```

A regime: ogni cliente = un systemd service + un nginx vhost + un set di DB in `locali/<id>/data/` (post R6.5).

---

## 6. Cosa NON va in `locali/<id>/`

Per disciplina, NON mettere qui:
- Codice di prodotto (router, modelli, mattoni — vivono in `core/`/`app/`)
- Migrazioni schema generiche (vivono in `app/migrations/` con flag `TRGB_SPECIFIC=False` di default)
- Componenti React riusabili
- Mattoni condivisi (M.A-M.I)

Se ti trovi a duplicare codice tra due `locali/`, vuol dire che quella logica appartiene a `core/`.

---

## 7. Stato evolutivo dell'architettura locale

Vedi `docs/refactor_monorepo.md` §6 per stato sessione per sessione.

| Fase | Sessioni | Stato |
|------|----------|-------|
| Architettura locale base (R1-R7) | R1, R2, R3, R4, R5, R6, R7 | ✅ in corso di chiusura |
| DB separation completa (R6.5) | dedicata, prima di R8 | DA FARE |
| Architettura modulare con feature flags (R8) | sessione lunga | DA FARE |

L'architettura modulare di R8 è ortogonale all'architettura locale: i "moduli" (vini, ricette, dipendenti, ecc.) sono concetti del PRODOTTO; i "locali" sono installazioni del prodotto. Un locale può avere alcuni moduli attivi e altri no — feature flags.

---

## 8. Vedi anche

- `docs/refactor_monorepo.md` — piano completo refactor R1-R8
- `CLAUDE.md` sezione "Refactor monorepo — gestione operativa" e "Architettura modulare — disciplina codice DA OGGI"
- `docs/roadmap.md` §0 — stato sessione per sessione
- `locali/README.md` — overview rapida della cartella
- `locali/<id>/README.md` — documentazione specifica per ogni locale
