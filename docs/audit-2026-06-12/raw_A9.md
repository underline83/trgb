# Audit A9 — Readiness prodotto vendibile

**Data:** 2026-06-12 · **Metodo:** analisi statica (nessuna esecuzione, nessuna rete) · **Scope:** istanza pulita `locali/trgb/`, template `locali/_template/`, onboarding cliente #1, multi-tenancy, legale/GDPR.

File letti come base: `docs/architettura_locale.md`, `docs/refactor_monorepo.md` (§3/§6/§9), `docs/installazione_nuovo_server.md`, `push.sh`, `scripts/backup_db.sh`, `scripts/check_backup_health.sh`, `app/platform/module_loader.py`, `app/migrations/migration_runner.py` + scan delle 146 migrazioni, `main.py`, `app/core/config.py`, `app/core/security.py`, `app/services/auth_service.py`, `frontend/.env.production`, tutti i file di `locali/{trgb,_template,test_demo,tregobbi}/`, `deploy/sites/`, `.gitignore`, `docs/roadmap.md` sezione S.

---

## 1. Istanza `locali/trgb/` davvero pulita? — SÌ (con 2 note)

Verifica grep `tre gobbi|tregobbi|bergamo|carminati|P.IVA` su `locali/trgb/` e `locali/_template/`: **zero residui Tre Gobbi nei valori**. Le uniche occorrenze sono commenti/documentazione (`locali/trgb/branding.json:2` `_comment` esplicativo, `locali/trgb/README.md`, `locali/trgb/deploy/env.production:21-25` note di porta/servizio).

| File | Stato | Evidenza |
|---|---|---|
| `locali/trgb/locale.json` | ✅ coerente | id=trgb, dominio=trgb.it, valuta EUR |
| `locali/trgb/branding.json` | ✅ completo | Palette TRGB-02 = branding del PRODOTTO (scelta deliberata e documentata: "come Shopify resta Shopify"), tagline=null, pwa.name prodotto, client_pdf neutro |
| `locali/trgb/strings.json` | ✅ completo | pdf/wa/page tutti generici "TRGB" |
| `locali/trgb/moduli_attivi.json` | ✅ coerente | `{"moduli": ["*"]}` (demo full), nota su test_demo per config à la carte |
| `locali/trgb/data/` | ✅ vuota | solo `.gitkeep` |
| `locali/trgb/deploy/env.production` | ✅ pronto (go-live non fatto) | porta 8001, service `trgb-backend-trgb`, stesso VPS/repo di tregobbi |
| `locali/_template/` | ✅ pulito | 4 `.template` + `deploy/env.production.template`, placeholder `<...>` ovunque |
| `locali/test_demo/` | ⚠️ minimale | SOLO `moduli_attivi.json` (`["vini","cassa"]`) — manca locale.json/branding.json/strings.json → cade nei fallback tregobbi (vedi A9-08) |

**Note:** (1) `locali/_template/` non contiene `manifest.template.json` citato come struttura standard in `docs/architettura_locale.md:36`; (2) il workflow §5 Passo 1 di `architettura_locale.md:100-107` rinomina locale/branding/strings/env ma **dimentica `mv moduli_attivi.json.template moduli_attivi.json`** → vedi A9-14.

---

## 2. Checklist onboarding cliente #1 (workflow doc vs realtà del codice)

Riferimenti: `docs/architettura_locale.md` §5 + `docs/installazione_nuovo_server.md` (runbook 659 righe, **mai testato end-to-end**: roadmap S.2 "Test runbook installazione_nuovo_server (su trgb.it)" ancora aperto, `docs/roadmap.md:678`).

| # | Passo | Stato | Evidenza |
|---|---|---|---|
| 1 | Scaffold `cp -r locali/_template locali/<id>` + rename | 🟡 quasi pronto | Template completo, ma doc dimentica rename moduli_attivi (A9-14) |
| 2 | Personalizzazione config (branding/strings/locale/moduli) | 🔴 doc fuorviante | Gli esempi JSON del runbook §4.2 NON corrispondono agli schemi reali; `moduli_attivi` con chiave sbagliata = tutti i moduli attivi (A9-04) |
| 3 | Asset cliente in `locali/<id>/assets/` | ✅ pronto | Meccanismo `branding.json.assets` + endpoint `/locale/branding.json` (main.py:456) |
| 4 | Init DB vuoti da migrazioni (`run_migrations()` con TRGB_LOCALE nuovo) | 🔴 contaminato | Skip TRGB_SPECIFIC funziona (runner v1.3) ma copre SOLO 097/099/100; mig 047+048 inserirebbero i prestiti BPM reali di Marco nel DB del cliente (A9-01). Solo foodcost.db passa dal runner; gli altri 9 DB si auto-creano via `init_*_database()` al primo import (ok) |
| 5 | Build frontend per il locale | 🔴 bloccante | `frontend/.env.production:1` hardcoda `VITE_API_BASE_URL=https://trgb.tregobbi.it` → la build di QUALSIASI cliente chiama il backend dell'osteria (A9-03). Runbook §3.3 fa solo `npm run build` senza override |
| 6 | `./push.sh -l <locale>` | 🟡 parziale | Flag `-l` + source env.production funzionano (push.sh:41-75), ma 4 punti restano hardcoded tregobbi (A9-06) |
| 7 | Systemd service | 🟡 manuale documentato | Runbook §5.1 ok, ma la unit NON setta `SECRET_KEY` → JWT firmato con chiave di default nota (A9-02) |
| 8 | Nginx + SSL | 🟡 documentato ma incoerente | Vhost §6.1 proxya solo `/api/`, `/locale/`, `/carta` mentre il FE chiama gli endpoint SENZA prefisso `/api` (A9-07) |
| 9 | Git remote + hook post-receive | ✅ documentato (manuale) | Runbook §7, ~10 min |
| 10 | Backup + cron | 🔴 script non parametrizzati | `backup_db.sh:28-30` e `check_backup_health.sh:28-36` hardcodano `/home/marco/trgb/trgb` e `locali/tregobbi/data` (A9-05) |
| 11 | Primo utente admin | ✅ pronto | Auto-bootstrap con PIN random a 6 cifre stampato a log (`auth_service.py:31-46`) + procedura manuale runbook §9 |
| 12 | Consegna cliente | 🟡 incompleto | Manuale utente "TODO: scrivere" (runbook §12, riga 584); zero documenti legali (A9-11, A9-13) |

**Verdetto sintetico:** l'architettura locale (R1-R8) è solida e quasi tutto è parametrizzato via `TRGB_LOCALE` + helper; quello che manca per il cliente #1 sono **4 bloccanti tecnici puntuali** (seed 047, SECRET_KEY, VITE_API_BASE_URL, script backup) + **un runbook da testare davvero** + **il pacchetto legale (assente al 100%)**.

---

## 3. Multi-tenancy: parametrizzato vs hardcoded

Modello attuale: **un processo per locale** (`TRGB_LOCALE` env), 2 topologie previste: (a) VPS dedicato per cliente (runbook), (b) più locali sullo stesso VPS (piano trgb.it, env.production trgb: stesso `VPS_DIR`, porta 8001).

**Già parametrizzato (✅):**
- `TRGB_LOCALE` letto da backend (`main.py`), migration runner, module_loader, uploads (`app/utils/uploads.py` v1.1), DB path (`app/utils/locale_data.py` — path canonico unico `locali/<id>/data/`, fail-loud, no fallback dal push 3 R6.5)
- `push.sh -l <locale>` sourcea `locali/<id>/deploy/env.production` (VPS_HOST, VPS_DIR, DOMAIN, PROBE_URL, BACKEND_SERVICE, BACKEND_PORT, TRGB_UPLOADS_DIR) — push.sh:64-84
- Branding/strings/moduli via endpoint runtime (`/locale/branding.json`, `/locale/strings.json`, `/system/modules`)
- Discovery dinamica DB in push.sh e backup_db.sh (niente liste hardcoded di file)

**Ancora hardcoded tregobbi/marco (❌):**
| Dove | Cosa | Riga |
|---|---|---|
| `push.sh` | auto-detect modules.json: path locale E remoto `locali/tregobbi/data/modules.json` | 416, 422 |
| `push.sh` | ripristino runtime files: `cd $VPS_DIR/app/data` (path legacy) | 498, 511 |
| `push.sh` | restart con `-m`: `systemctl restart trgb-backend` (non `$BACKEND_SERVICE`) | 528 |
| `push.sh` | deploy FULL `-f`: restart `trgb-backend`/`trgb-frontend` fissi | 543-544 |
| `push.sh` | stato backup letto da `$VPS_DIR/app/data/backups/` (legacy) | 195 |
| `scripts/backup_db.sh` | `PROJECT_DIR=/home/marco/trgb/trgb`, `LOCALE_DATA_DIR=.../locali/tregobbi/data` | 28-30 |
| `scripts/check_backup_health.sh` | `PROJECT_DIR=/home/marco/trgb/trgb`, `VENV_PYTHON=/home/marco/...` | 28-36 |
| `scripts/setup/setup-backup-and-security.sh` | `TRGB_DIR=/home/marco/trgb/trgb` | 15-17 |
| hook post-receive (doc runbook §7.2) | `sudo systemctl restart trgb-backend` fisso | riga 379 doc |
| `main.py` | CORS origins solo domini tregobbi | 486-491 |
| `main.py` / `locale_strings.py` | fallback branding/strings → tregobbi | main.py:442-444, locale_strings.py:35 |
| `frontend/.env.production` | `VITE_API_BASE_URL=https://trgb.tregobbi.it` | 1 |

**Per 5 clienti** (scenario VPS dedicato, il più sano col codice attuale): 5 VPS × (setup 90-120 min dichiarati + fix script backup a mano) + 5 cron + 5 rclone OAuth + 5 snapshot manuali settimanali Aruba (runbook §11) + cert/DNS per ciascuno. Tutto manuale, zero provisioning scriptato (lo `scripts/setup/setup-backup-and-security.sh` esiste ma è hardcoded marco). Scenario stesso-VPS (trgb.it): irrisolto il problema **un solo `frontend/dist` condiviso** tra due locali (stesso VPS_DIR) + hook che riavvia solo il backend tregobbi → vedi A9-09.

---

## 4. Legale / operativo (GDPR, licenza, contratti)

Il sistema tratta: anagrafiche clienti CRM (nomi, telefoni, email, compleanni, storico prenotazioni TheFork), dipendenti (anagrafica, **cedolini PDF** in `documenti_dipendenti/`, contratti), dati finanziari. Ricerca in `docs/` e nel codice (`gdpr|privacy|trattament|retention|licenza|contratto|sla|cifratur|encrypt`):

- **Privacy policy:** assente (unica menzione: requisito futuro App Store, `analisi_app_apple.md:261`; checkbox GDPR solo come idea futura in `modulo_prenotazioni.md:358`)
- **Registro trattamenti / DPA / nomina responsabile:** assenti
- **Data retention policy:** esiste solo retention BACKUP (48h/7gg, `sicurezza_backup.md:87`), non retention DATI personali
- **Cifratura at-rest:** assente (SQLite in chiaro, cedolini PDF in chiaro, backup in chiaro su Google Drive)
- **Backup contrattuale/SLA/ToS:** assenti
- **LICENSE:** nessun file nel repo; `docs/installazione_nuovo_server.md:8` parla di "vendere una licenza" mai definita
- **Materiale commerciale:** esiste solo `docs/commerciale_brochure_v5.docx`
- **Backup su Drive:** il runbook §0 dice "Account Google del cliente per Drive backup (**o account aziendale tuo**)" → se si usa il Drive di Marco per i dati del cliente serve DPA, oggi inesistente

Per il cliente zero (= se stesso) va bene così. Per il cliente #1 pagante è materiale necessario PRIMA della firma, non dopo.

---

## 5. Finding

```
[A9-01] SEVERITÀ: CRIT
Titolo: Migrazioni 047/048 inseriscono i prestiti BPM reali di Marco in ogni DB nuovo (non flaggate TRGB_SPECIFIC)
Evidenza: app/migrations/047_prestiti_bpm.py (nessun TRGB_SPECIFIC; INSERT INTO cg_spese_fisse + ~192 cg_uscite con importi reali "€152.351,27 / residuo €34.404,71"); 048_cg_piano_rate.py:32 "Popola piano rate dai prestiti BPM già inseriti"; locali/tregobbi/seeds/MIGRATIONS_TRGB.md dichiara solo 3 mig flaggate (097/099/100); migration_runner.py:127 salta solo le flaggate.
Impatto: ogni locale nuovo (incluso il demo trgb.it visibile a clienti potenziali) parte con i dati finanziari personali di Marco nel Controllo Gestione: leak privacy + contabilità del cliente sporcata dal giorno 1.
Fix proposto: aggiungere TRGB_SPECIFIC=True a 047 e 048 + ri-audit completo delle 44 migrazioni con INSERT (es. 110/113/115 sono update-only e innocue su DB vuoto, 033/069/091/092/094/127 sono seed generici legittimi) + aggiornare MIGRATIONS_TRGB.md. — Effort: S
Modulo: controllo_gestione / platform
```

```
[A9-02] SEVERITÀ: CRIT
Titolo: SECRET_KEY JWT con default hardcoded nel repo, mai settata in deploy
Evidenza: app/core/config.py:4 `SECRET_KEY = os.getenv("SECRET_KEY", "trgb_secret_key_2025")`; la unit systemd del runbook (installazione_nuovo_server.md §5.1, righe 239-256) setta solo PYTHONPATH e TRGB_LOCALE; locali/*/deploy/env.production non contengono SECRET_KEY.
Impatto: tutte le installazioni (osteria, demo, futuri clienti) firmano i JWT con la stessa chiave presente nel codice (repo anche su GitHub come backup): chiunque la legga può forgiare token superadmin per qualsiasi cliente.
Fix proposto: generare SECRET_KEY per-installazione (env in systemd unit o file secret in locali/<id>/data/ gitignored), fail-loud al boot in produzione se manca, aggiungerla al runbook §5.1 e al template env. — Effort: S
Modulo: platform
```

```
[A9-03] SEVERITÀ: HIGH
Titolo: Build frontend di qualsiasi cliente punta al backend dell'osteria
Evidenza: frontend/.env.production:1 `VITE_API_BASE_URL=https://trgb.tregobbi.it`; frontend/src/config/api.js:2 `API_BASE = import.meta.env.VITE_API_BASE_URL`; runbook §3.3 fa `npm run build` senza alcun override.
Impatto: il cliente #1 che segue il runbook ottiene una SPA che manda login e dati a trgb.tregobbi.it. Onboarding bloccato (o peggio: dati del cliente verso il server di Marco).
Fix proposto: derivare VITE_API_BASE_URL dal locale (es. window.location.origin di default, o build con env per-locale documentata nel runbook §3.3 insieme a VITE_TRGB_LOCALE). — Effort: S
Modulo: platform
```

```
[A9-04] SEVERITÀ: HIGH
Titolo: Runbook installazione con schemi config sbagliati — moduli_attivi.json esempio attiva TUTTO
Evidenza: installazione_nuovo_server.md §4.2 (righe 205-211) esempio `{"modules": [...], "platform_extras": [...]}` ma module_loader.py:78 legge `data.get("moduli", ["*"])` → chiave assente = wildcard = tutti i moduli attivi. Stessa sezione: branding.json esempio flat (`primary_color`, `logo_url`) incompatibile con schema reale (`colors.brand_red`, `assets.icon` — vedi _template/branding.json.template); strings.json esempio (`header.title`, `login.welcome`) con chiavi inesistenti (reali: `pdf.*`, `wa.template.*`, `page.*`); §4.2 edita file `branding.json` che dopo `cp -r _template` si chiama ancora `branding.json.template` (rename mai menzionato). Runbook mai testato: roadmap.md:678 S.2 aperto.
Impatto: cliente che compra "solo Vini" si ritrova tutti i 13 moduli attivi (vendita modulare vanificata); branding/strings non applicati; onboarding fallisce in più punti seguendo il doc alla lettera.
Fix proposto: riallineare §4.2 agli schemi reali (copiare dai .template), aggiungere step rename, validare moduli_attivi.json al boot (warn se chiave "moduli" assente ma file presente); eseguire S.2 (test runbook su trgb.it). — Effort: M
Modulo: docs / platform
```

```
[A9-05] SEVERITÀ: HIGH
Titolo: Script backup hardcodati su /home/marco + locali/tregobbi — per il cliente #1 i backup non girano
Evidenza: scripts/backup_db.sh:28-30 `PROJECT_DIR="/home/marco/trgb/trgb"`, `LOCALE_DATA_DIR="$PROJECT_DIR/locali/tregobbi/data"`; scripts/check_backup_health.sh:28-36 idem; scripts/setup/setup-backup-and-security.sh:15-17 idem. Il runbook §8.4-8.5 installa cron e chmod ma non dice mai di editare questi path.
Impatto: su un VPS con <USER>≠marco o <LOCALE>≠tregobbi il cron gira ma non trova nulla (o backuppa la dir sbagliata): perdita dati silenziosa per il cliente — esattamente lo scenario dell'incidente 4 maggio, senza rete di salvataggio.
Fix proposto: parametrizzare PROJECT_DIR/LOCALE via env o auto-detect (`$(dirname $0)/..` + TRGB_LOCALE da env.production); check_backup_health già notifica via M.A → farlo fallire rumorosamente se la dir non esiste. — Effort: M
Modulo: infra
```

```
[A9-06] SEVERITÀ: HIGH
Titolo: push.sh -l <locale> deploya ma 4 sezioni restano hardcoded tregobbi/trgb-backend
Evidenza: push.sh:416+422 (auto-detect modules.json su `locali/tregobbi/data/` locale e remoto), :498+511 (`cd $VPS_DIR/app/data` per restore runtime files), :528 (`systemctl restart trgb-backend` con -m invece di `$BACKEND_SERVICE`), :543-544 (restart trgb-backend/trgb-frontend con -f), :195 (backup status da `app/data/backups/` legacy).
Impatto: `./push.sh -l cliente_x` con -m/-f riavvierebbe il servizio SBAGLIATO (o nessuno) e confronterebbe/ripristinerebbe i runtime file di tregobbi; su VPS condiviso multi-locale riavvia l'osteria invece del cliente.
Fix proposto: sostituire i 4 punti con `$BACKEND_SERVICE`/`$FRONTEND_SERVICE`/`$DB_LOCAL`/`$DB_REMOTE` già disponibili post-source. — Effort: S
Modulo: infra
```

```
[A9-07] SEVERITÀ: MED
Titolo: Vhost nginx del runbook incompatibile con come il frontend chiama le API
Evidenza: installazione_nuovo_server.md §6.1 proxya solo `/api/`, `/locale/`, `/carta`; ma API_BASE è l'origin nudo (frontend/.env.production) e gli endpoint backend NON hanno prefisso /api (es. `/auth/login`, `/vini/magazzino/`) → col vhost documentato ogni chiamata API cade nel `try_files` statico. Lo smoke test §10 (`curl https://<DOMAIN>/system/info` atteso 200) passerebbe per il motivo sbagliato (index.html).
Impatto: installazione nuova non funzionante anche eseguendo il runbook alla perfezione; debugging lungo per chi non conosce la config reale del VPS tregobbi.
Fix proposto: copiare nel runbook la config nginx REALE di trgb.tregobbi.it (proxy_pass per gli endpoint backend effettivi) o introdurre prefisso /api uniforme. Parte del test S.2. — Effort: S
Modulo: docs / infra
```

```
[A9-08] SEVERITÀ: MED
Titolo: Fallback branding e strings → tregobbi: un locale mal configurato mostra "Osteria Tre Gobbi" al cliente
Evidenza: main.py:442-444 `candidate_paths = [locali/<locale>/branding.json, locali/tregobbi/branding.json]`; app/utils/locale_strings.py:35 `candidates = [<locale>, "tregobbi"]`. Caso reale già nel repo: locali/test_demo/ non ha branding.json/strings.json → eredita brand e firme WA/PDF dell'osteria.
Impatto: demo o cliente nuovo con typo nel locale id si presenta brandizzato Tre Gobbi (incluse firme nei messaggi WhatsApp e nei PDF) — figuraccia commerciale e leak identità cliente zero.
Fix proposto: cambiare il fallback da tregobbi a `locali/trgb/` (branding del prodotto, semanticamente corretto) in entrambi gli helper. — Effort: S
Modulo: platform
```

```
[A9-09] SEVERITÀ: MED
Titolo: Due locali sullo stesso VPS (piano trgb.it): frontend/dist unico e hook che riavvia solo tregobbi
Evidenza: locali/trgb/deploy/env.production: stesso `VPS_DIR=/home/marco/trgb/trgb` di tregobbi, `FRONTEND_SERVICE=trgb-frontend-trgb` "da creare al go-live"; refactor_monorepo.md §7 "Build separato per locale (TRGB_LOCALE=<id> npm run build)" ma un solo working dir = un solo `frontend/dist`; hook post-receive (runbook §7.2:379) riavvia solo `trgb-backend`.
Impatto: il go-live di trgb.it (Tappa 3 §9, prerequisito demo per clienti) non ha runbook praticabile: build frontend collidono, push per un locale lascia l'altro backend su codice vecchio.
Fix proposto: decidere e documentare la topologia dual-service (dist per-locale es. `frontend/dist-<id>` + outDir vite parametrico, hook che riavvia entrambi i backend o quello giusto via env) prima del go-live trgb.it. — Effort: M
Modulo: infra
```

```
[A9-10] SEVERITÀ: MED
Titolo: Router non mappati in module.json sono attivi di default per TUTTI i locali
Evidenza: app/platform/module_loader.py:135-145 `is_router_active()` → `if module_id is None: return True` ("default safe: monta tutto quello che non è esplicitamente classificato").
Impatto: scelta giusta per la transizione R8, ma a regime ogni router nuovo dimenticato fuori da module.json viene esposto anche ai clienti che NON hanno comprato quel modulo → erosione silenziosa della vendita modulare.
Fix proposto: warning al boot (boot_banner) con elenco router non classificati + check guardiano L1 in push.sh (diff tocca app/routers/ ma nessun module.json) come da roadmap DH.7. — Effort: S
Modulo: platform
```

```
[A9-11] SEVERITÀ: MED
Titolo: GDPR/legale: zero documenti per trattare dati personali di un cliente pagante
Evidenza: nessun match per privacy policy/registro trattamenti/DPA/ToS/SLA/data-retention-dati in docs/ e nel codice (uniche menzioni: requisito App Store futuro analisi_app_apple.md:261; idea checkbox GDPR modulo_prenotazioni.md:358). DB SQLite e cedolini PDF in chiaro; backup in chiaro su Google Drive; runbook §0 ammette Drive "account aziendale tuo" per i dati del cliente (= Marco responsabile/sub-processor senza DPA).
Impatto: per il cliente zero (tratta i propri dati) è accettabile; vendere a un cliente #1 senza privacy policy, DPA e nomine espone Marco a responsabilità GDPR dirette (dati dipendenti del cliente = categoria delicata: cedolini).
Fix proposto: pacchetto minimo con consulente: privacy policy, DPA Marco↔cliente, registro trattamenti template, retention dichiarata, decisione cifratura backup (es. rclone crypt). Non è codice: è prerequisito commerciale. — Effort: L (1-2 settimane elapsed con consulente, parallelo allo sviluppo)
Modulo: docs
```

```
[A9-12] SEVERITÀ: MED
Titolo: Dati personali reali hardcoded nel codice sorgente distribuito a ogni installazione
Evidenza: app/migrations/060_pulizia_stipendi_duplicati.py:9-19 nomi e stipendi reali ("Marco Carminati €2509", "Dos Santos Mirla Stefane Albuquerque €209"); 061_escludi_fornitori_fittizi.py:8-11 nomi locatori privati (CATTANEO SILVIA, BANA MARIA DOLORES = affitti); 110_bonifica_fatture_audit_marco.py importi e fornitori reali. Il repo va su GitHub (push.sh:472-480) e verrà clonato su ogni VPS cliente.
Impatto: dati personali (anche di terzi: dipendenti, locatori) viaggiano nel codice verso ogni cliente futuro; igiene GDPR e immagine prodotto.
Fix proposto: per il futuro, niente PII nei docstring delle migrazioni (riferire "vedi problemi.md A2"); per l'esistente valutare riscrittura docstring in una migrazione di housekeeping (i file storici restano nella history git — accettato, ma smettere di aggiungerne). — Effort: S
Modulo: platform / docs
```

```
[A9-13] SEVERITÀ: LOW
Titolo: Nessuna licenza del codice né bozza contratto di vendita/canone
Evidenza: nessun file LICENSE* in root; nessuna bozza contratto in docs/ (ricerca "licenza|contratto|canone"); esiste solo docs/commerciale_brochure_v5.docx; installazione_nuovo_server.md:8 parla di "vendere una licenza TRGB" mai definita; roadmap S.3 (pricing) e S.5 (onboarding standard) aperti, nessuna voce per contratto/licenza.
Impatto: al primo "sì" di un cliente non c'è nulla da firmare: prezzo, SLA, proprietà dati, recesso, responsabilità tutti indefiniti.
Fix proposto: aggiungere a roadmap S una voce "pacchetto contrattuale" (contratto canone + condizioni licenza, anche EULA proprietaria semplice) da preparare col consulente insieme ad A9-11. — Effort: M (elapsed, non-dev)
Modulo: docs
```

```
[A9-14] SEVERITÀ: LOW
Titolo: Workflow scaffold in architettura_locale.md dimentica moduli_attivi.json (e manifest.template.json non esiste)
Evidenza: docs/architettura_locale.md:100-107 (Passo 1: rinomina locale/branding/strings/env ma non `moduli_attivi.json.template`); module_loader.py:72-74 file mancante → wildcard tutti attivi; architettura_locale.md:36 cita `manifest.template.json` che in locali/_template/ non c'è.
Impatto: cliente modulare creato seguendo il doc canonico parte con tutti i moduli attivi finché qualcuno non se ne accorge.
Fix proposto: aggiungere il rename al Passo 1 (+ riga in _template/README.md) e togliere o creare manifest.template.json. — Effort: S
Modulo: docs
```

```
[A9-15] SEVERITÀ: LOW
Titolo: CORS origins hardcoded ai domini tregobbi
Evidenza: main.py:486-491 `origins = [localhost, app.tregobbi.it, trgb.tregobbi.it]`.
Impatto: irrilevante nella topologia attuale (nginx same-origin), ma trgb.it o qualsiasi cliente con FE/BE su origin diversi verrebbe bloccato dal CORS in modo non ovvio.
Fix proposto: aggiungere il DOMAIN del locale corrente (da locale.json/env) alla lista al boot. — Effort: S
Modulo: platform
```

```
[A9-16] SEVERITÀ: LOW
Titolo: Boot/migrazioni da zero per un locale nuovo mai verificati end-to-end (S.2 aperto)
Evidenza: roadmap.md:678 S.2 "Test runbook installazione_nuovo_server (su trgb.it)" stato BASSA/aperto; la verifica R3 (refactor_monorepo.md §6 riga R3) ha testato solo lo SKIP delle 3 mig flaggate, non una catena completa 001→146 su DB vergine; runbook §4.4 copre solo foodcost.db (gli altri 9 DB nascono dagli init_*_database() al primo boot — non documentato).
Impatto: il primo vero test della catena di onboarding avverrebbe a casa del cliente #1. Rischio di migrazioni che assumono dati esistenti (oltre ad A9-01) o di ordine init non deterministico.
Fix proposto: eseguire S.2 come prova generale: locale fittizio, DB da zero, boot, smoke test moduli — prima di firmare il cliente #1. — Effort: M (1 giornata)
Modulo: infra / docs
```

---

## 6. Stima effort "da oggi a cliente #1 onboardato" (stime, non misure)

| Blocco | Contenuto | Effort stimato |
|---|---|---|
| Fix tecnici bloccanti | A9-01 (flag 047/048 + ri-audit INSERT), A9-02 (SECRET_KEY), A9-03 (VITE_API_BASE_URL), A9-05 (script backup), A9-06 (push.sh) | **2-3 giornate dev** |
| Runbook e fallback | A9-04 + A9-07 + A9-08 + A9-14 (riallineare doc, fallback a trgb) | **1 giornata dev** |
| Prova generale | A9-16: test S.2 completo su locale fittizio/trgb.it (che chiude anche A9-09 se si va su VPS condiviso) | **1-2 giornate** |
| Legale | A9-11 + A9-13: privacy/DPA/contratto/licenza con consulente | **1-2 settimane elapsed (parallelo)** |
| Onboarding per-cliente a regime | runbook post-fix (90-120 min dichiarati diventano credibili) + branding cliente + DNS/SSL/rclone | **0,5-1 giornata/cliente** |

**Totale realistico: ~5-7 giornate di lavoro tecnico + pacchetto legale in parallelo → cliente #1 onboardabile in 2-4 settimane di calendario.** L'architettura (locali/, module_loader, migration flags, runbook) è all'80%: non servono refactor, servono chiusure puntuali e UN test vero.

---

## 7. Riassunto per severità

| Severità | Count | Finding |
|---|---|---|
| CRIT | 2 | A9-01 (seed prestiti BPM in DB nuovi), A9-02 (SECRET_KEY condivisa hardcoded) |
| HIGH | 4 | A9-03 (API_BASE → osteria), A9-04 (runbook schemi errati / moduli wildcard), A9-05 (backup script hardcoded), A9-06 (push.sh 4 punti tregobbi) |
| MED | 6 | A9-07 (nginx runbook), A9-08 (fallback brand tregobbi), A9-09 (dual-locale stesso VPS), A9-10 (router unmapped attivi), A9-11 (GDPR assente), A9-12 (PII nel sorgente) |
| LOW | 4 | A9-13 (licenza/contratto), A9-14 (scaffold moduli_attivi), A9-15 (CORS), A9-16 (catena onboarding mai testata) |

**Totale: 16 finding.**
