---
name: guardiano
description: Audit pre/post deploy del progetto TRGB Gestionale (osteria di Marco Carminati). Da invocare ogni volta che Marco scrive "/guardiano", "guardiano", "audit", "check guardiano", "controllo prima del push", oppure quando chiede di pushare modifiche al gestionale ("pusha", "commit", "deploy", "push.sh"). La skill esegue un controllo intelligente prima del deploy (legge git diff, verifica coerenza con roadmap/problemi/controllo_design, controlla regressioni potenziali, suggerisce commit message), orchestra l'esecuzione di push.sh, fa il post-audit (probe HTTP, verifica restart, aggiornamento docs di sessione/changelog/roadmap/problemi). È il complemento intelligente del modulo guardiano L1 già implementato in push.sh — qui aggiunge il livello semantico che bash non sa fare.
---

# Guardiano TRGB — Skill di audit pre/post deploy

## Quando invocarla

Marco usa questa skill quando vuole un controllo qualitativo prima/dopo un deploy del gestionale TRGB. Trigger comuni:

- `/guardiano` (o varianti: `guardiano`, `audit`, `check guardiano`, `controllo`)
- `/guardiano check` — audit informativo, no push
- `/guardiano push "messaggio"` — pre-audit + push.sh + post-audit + update docs
- `/guardiano status` — mini-dashboard rapido (cosa è in pending, cosa è stantio)
- Marco scrive "facciamo il push" / "pusha questa modifica" / "deploy" → suggerisci di passare per `/guardiano push` invece di lanciare `push.sh` diretto

Il guardiano completa il modulo guardiano L1 già attivo in `push.sh` (debounce, probe HTTP, accessi nginx). I check L1 restano sempre validi anche se il guardiano non viene invocato — ma il guardiano aggiunge il livello semantico che bash non sa fare.

## Repo e path principali

- **Workspace**: `/Users/underline83/trgb`
- **Docs critici (leggere SEMPRE in apertura)**:
  - `docs/sessione.md` (diario sessioni — ultime 3 entry)
  - `docs/problemi.md` (bug aperti)
  - `docs/controllo_design.md` (scelte UX pendenti)
  - `docs/inventario_pulizia.md` (codice morto da pulire)
  - `docs/architettura_pattern.md` (registry pattern uniformi)
  - `docs/roadmap.md` (consultare per ID stabili)
  - `CLAUDE.md` (regole di base — già in context come project instructions)
- **Script deploy**: `/Users/underline83/trgb/push.sh`
- **Memoria persistente Claude**: `/Users/underline83/Library/Application Support/Claude/local-agent-mode-sessions/.../spaces/.../memory/`

## Sub-comando: `status` (mini-dashboard)

Quando Marco scrive `/guardiano status` o solo `/guardiano` senza altro contesto:

1. Leggi `git status` + `git log --oneline -5`
2. Leggi le prime 50 righe di `docs/sessione.md` (per vedere ultime sessioni)
3. Conta voci aperte in `docs/problemi.md` (sezione "Aperti"), `docs/controllo_design.md`, `docs/inventario_pulizia.md`
4. Restituisci un mini-dashboard formato:
   ```
   📊 Stato TRGB Gestionale
   
   Repo: <branch>, ultima modifica: <commit + autore + tempo>
   File modificati non committati: N
   
   Ultime sessioni: [titoli ultime 3]
   
   Bug aperti: N (tra cui: [primi 2])
   Voci controllo design: N
   Voci inventario pulizia: N
   
   Ultimo push: <timestamp da .last_push>
   
   → Vuoi che approfondisca qualcosa?
   ```
5. Stop. Niente azioni di scrittura.

## Sub-comando: `check` (pre-audit informativo)

Quando Marco scrive `/guardiano check` o vuole verificare prima di decidere se pushare.

### Step 1 — Stato repo
- `git status --short` per file modificati/aggiunti/rimossi
- `git diff --stat` per dimensione modifiche
- `git diff` mirato sui file Python e JSX modificati (NO sui file binari/lock)

### Step 2 — Lettura docs critici
- Leggi le ultime 3 entry di `docs/sessione.md` (per capire contesto recente)
- Leggi `docs/problemi.md` sezione "Aperti"
- Leggi `docs/controllo_design.md` per scelte UX in sospeso
- Leggi `docs/inventario_pulizia.md` per cleanup pendente

### Step 3 — Analisi semantica del diff
Verifica per ogni file modificato:

**Backend (`.py` in `app/`):**
- Se modifichi un router con `@router.get("/")` o `@router.post("/")`, verifica che i call site frontend usino il **trailing slash** (`/endpoint/`, non `/endpoint`).
- Se modifichi `app/models/*_db.py` o `app/core/database.py`, verifica i 3 PRAGMA WAL (`journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=30000`).
- Se aggiungi `CREATE TABLE` o `CREATE INDEX` in init function, verifica che ci sia il check `SELECT 1 FROM sqlite_master` prima (regola anti-corruzione S52-1).
- Se aggiungi UPDATE/INSERT in funzioni esistenti, verifica che non si crei una transazione lunga (commit principale subito, log in transazione separata).
- Se modifichi `app/services/auth_service.py`, fai un controllo extra: niente PIN hardcoded, niente segreti in chiaro.

**Frontend (`.jsx`/`.js` in `frontend/src/`):**
- Se modifichi una scheda di dettaglio (`SchedaVino`, `FattureDettaglio`, `MenuCartaDettaglio`, ecc.), verifica che usi il pattern testa+tab + `Btn` da `components/ui` (mattone M.I).
- Se modifichi una pagina, verifica che `bg-brand-cream` sia il background (non `bg-neutral-100` o `bg-gray-50`).
- Se modifichi una `apiFetch(...)`, controlla trailing slash su endpoint root.
- Se aggiungi un nuovo modulo o pagina, verifica che sia registrato in `frontend/src/config/modulesMenu.js` e in `App.jsx` route.
- Per WhatsApp: deve usare `import { openWhatsApp, ... } from "../utils/whatsapp"`, MAI costruire `wa.me/` a mano.

**Migrazioni (`app/migrations/NNN_*.py`):**
- Verifica numerazione consecutiva (no buchi, no duplicati).
- Verifica idempotenza: try/except su `ALTER TABLE`, `CREATE TABLE IF NOT EXISTS`, niente DDL distruttivo non protetto.
- Se la migrazione fa backfill di dati, verifica che ci sia opzione dry-run o backup pre-update.

**Documentazione (`docs/*.md`):**
- Se hanno modificato `docs/sessione.md` o `docs/changelog.md`, verifica coerenza versioni.
- Se hanno chiuso un bug (sposta da Aperti a Risolti in `problemi.md`), verifica che la roadmap rifletta lo stato.

### Step 4 — Cross-check con voci pending nei docs
- Per ogni file modificato, verifica se chiude voci in `controllo_design.md` o `inventario_pulizia.md`. Esempio: "stai toccando `ClientiScheda.jsx` → questo è uno dei 2 file segnalati nel controllo_design §1 come 'da migrare al pattern testa+tab'. Vuoi farlo opportunisticamente in questo push?"
- Se la modifica chiude un punto roadmap (es. risolve un bug aperto, o implementa una voce DA FARE), suggerisci di aggiornare anche `roadmap.md` e `problemi.md`.

### Step 5 — Output del check
Restituisci un report formato:

```
🛡️  Guardiano Pre-Audit

📁 File modificati: N (B + .py, F frontend .jsx, D docs .md)

✓ Verifiche passate:
  - Trailing slash API OK
  - Pattern WAL OK
  - Sintassi Python (py_compile) OK
  - ...

⚠ Attenzioni (non bloccanti):
  - [Modifica X] tocca pattern Y in controllo_design — vuoi aggiornare?
  - [File Z] non aggiorna versions.jsx ma cambia un modulo — verifica se serve bump

🔴 Errori (bloccanti):
  - [se ci sono]

📋 Suggerimenti commit message:
  "..."

📋 Suggerimenti update docs post-push:
  - sessione.md: nuova entry "..."
  - changelog.md: voce sotto "..."
  - problemi.md: chiude D1? Sposta in Risolti?
  - roadmap.md: voce X.Y diventa ✅?

→ Procedi con il push? (Marco lancia /guardiano push o ./push.sh)
```

## Sub-comando: `push "messaggio"` (orchestrato)

### Step 1 — Pre-audit completo
Esegui tutto il flusso del sub-comando `check` sopra. Se ci sono **errori bloccanti** (sintassi rotta, regressioni `.gitignore`, ecc.), STOP e chiedi a Marco se vuole risolvere o forzare.

### Step 2 — Conferma esplicita
Mostra il report e chiedi: `Procedo con il push? Commit message proposto: "..." [y/N]`

### Step 3 — Lancia push.sh via Bash
Usa il Bash tool per lanciare:
```bash
cd /Users/underline83/trgb && ./push.sh "<messaggio confermato>"
```

Cattura l'output (sarà lungo: include i check L1 di push.sh + sync DB + commit + push + restart).

### Step 4 — Parse output
Verifica nell'output:
- "Deploy completato" o "Già aggiornato" → OK
- "Annullato dall'utente" → guardiano L1 ha bloccato (debounce o servizio attivo). Riferiscilo a Marco.
- Errori sync DB → segnala (se 1-2 DB falliscono è non bloccante; se molti, è sospetto).
- Output del post-receive hook (righe `remote: ▶`).

### Step 5 — Post-audit
Dopo il push completato:
1. Probe HTTP: `curl -sI -o /dev/null -w "%{http_code}" --max-time 5 https://trgb.tregobbi.it/` → atteso 1xx/2xx/3xx/4xx.
2. Per i file che hanno toccato endpoint critici, fai un curl mirato sull'endpoint specifico (con auth dummy se serve) e riporta status code + tempo.
3. Verifica che `git log -1 --oneline` rifletta il commit appena fatto.

### Step 6 — Aggiornamento docs (chiedi conferma)
Proponi a Marco gli update docs basati sulle modifiche:

```
📝 Suggerimento aggiornamento docs:

docs/sessione.md (nuova entry "S<NN> mini" o continuazione):
─────────────────────────────────────
## SESSIONE <N> mini (<data>) — <titolo derivato dal commit>

### Cosa è stato fatto
- [punti dal git diff]

### File modificati
- [lista]

### Verifica post-push
- HTTP probe: <status>
- Endpoint <X>: <status, ms>

### Commit
`<commit_msg>` (commit `<hash_short>`)
─────────────────────────────────────

docs/changelog.md (sezione voce "## <data> mini"):
[voce sintetica]

docs/roadmap.md:
- Voce X.Y: status DA FARE → ✅ FATTO <data>
- [se la modifica ha chiuso un punto]

docs/problemi.md:
- [se ha risolto un bug aperto, sposta in Risolti con data]

→ Aggiorno [tutto / solo sessione.md / niente]?
```

Se Marco conferma, fai gli edit con `Edit` tool. Mai sovrascrivere docs in modo distruttivo: sempre INSERT al posto giusto.

### Step 7 — Riepilogo finale
```
✅ Push completato
Commit: <hash> "<msg>"
HTTP post-restart: <status>
Docs aggiornati: [lista]
.guardiano_state.json aggiornato.

Da verificare manualmente (Ctrl+Shift+R):
- [checklist contestuale dai file modificati]
```

## Stato condiviso (`.guardiano_state.json`)

A fine `push` o `check`, scrivi/aggiorna `/Users/underline83/trgb/.guardiano_state.json`:

```json
{
  "last_audit_ts": "2026-04-25T22:30:00",
  "last_audit_type": "push",
  "last_commit_hash": "abc1234",
  "last_commit_msg": "...",
  "files_modified_count": 8,
  "warnings_raised": 2,
  "blocking_errors": 0,
  "post_push_http_status": 200,
  "pending_docs_update": false,
  "next_session_focus": "..."  // opzionale: nota per la prossima sessione
}
```

Aggiungi `.guardiano_state.json` al `.gitignore` se non già presente (è runtime, non va versionato).

## Regole di comportamento

- **Mai pushare senza conferma esplicita di Marco** (anche se il pre-audit passa pulito).
- **Mai sovrascrivere `docs/sessione.md` o `docs/changelog.md`** in modo distruttivo: leggi prima, poi inserisci la nuova entry nella posizione giusta (sotto l'header, sopra la sessione precedente).
- **Mai cancellare voci da `problemi.md` / `roadmap.md`**: sposta da Aperti a Risolti, marca come ✅ FATTO con data, ma il testo storico resta.
- **Sessione parallele**: Marco usa più finestre Claude in contemporanea. Se trovi entry recenti in `sessione.md`/`changelog.md` che NON hai scritto tu (es. "S58" mentre tu sei nella S57 cont.), prendi atto e inserisci la tua entry SOTTO la più recente, non sovrascrivere.
- **Workspace Cowork ha mount FUSE read-only sui `rm`**: se devi cancellare file (orfani, worktree), prepara per Marco i comandi shell e chiedi a lui di lanciarli da terminale Mac. Non tentare `rm` da Bash tool.
- **Lingua**: italiano. Marco è italiano, parla italiano, risposte in italiano.
- **Tono**: diretto, asciutto, niente fronzoli. Marco apprezza diagnostica accurata sopra le ipotesi spavalde. CAPS LOCK = enfasi non rabbia.

## Anti-pattern (cose da NON fare)

- ❌ Lanciare `push.sh` automaticamente senza conferma esplicita di Marco.
- ❌ Modificare il codice durante un audit (l'audit è solo lettura). Le modifiche le facciamo in una sessione di sviluppo separata, dopo aver chiarito cosa va fatto.
- ❌ Riscrivere intere sezioni di docs (sessione/changelog) — solo INSERT mirate.
- ❌ Eseguire git commit/push direttamente — solo via push.sh.
- ❌ Eseguire chiamate di rete (curl/wget verso endpoint esterni al VPS Marco) durante l'audit. L'unica chiamata permessa è il probe HTTP a https://trgb.tregobbi.it/ per verificare che il backend risponda.
- ❌ Cancellare file dal Bash tool (mount FUSE read-only) — sempre preparare comandi per Marco.
- ❌ Toccare i .sqlite3 in `/Users/underline83/trgb/app/data/` (sono backup locali del VPS, modificarli è non senso).
- ❌ Inventare voci roadmap o problemi che non sono mai stati discussi.

## Esempi di output ottimali

### Esempio 1 — Marco scrive `/guardiano status`

```
📊 Stato TRGB Gestionale (2026-04-26 10:30)

Repo: main, ultimo commit: 461d9b4 "S57 cont.: modulo guardiano L1+L2+L3..." (Marco, 12h fa)
File modificati non committati: 0 (tree pulito)

Ultime 3 sessioni:
  • S57 cont. — Modulo guardiano L1+L2+L3 + cleanup + S52-1 chiuso
  • S58 — Vini quick wins + carta cliente pubblica /carta
  • S57 — Modulo Menu Carta + import MEP cucina

Bug aperti (1): D1 storni difettosi Flussi Cassa (serve caso concreto).
Controllo design (6 voci): 2 testa+tab pendenti, dark mode, tool config stampe M.B, Home widget per ruolo, PWA priorità alta, WAL esteso a tutti DB.
Inventario pulizia (4 voci attive): WAL coverage 6 DB rimanenti, run_server.py legacy, bozze auto preventivi TTL, migrazioni DB unificate.

Ultimo push: 12 ore fa.

Cosa ti serve oggi? Suggerimenti di priorità:
- 🔴 PWA Fase 0 (1.1, alta priorità Marco)
- 🟡 Pattern testa+tab a ClientiScheda (controllo_design §1)
- 🟢 D1 storni — quando hai un caso concreto
```

### Esempio 2 — Marco modifica un file e scrive `/guardiano check`

```
🛡️ Guardiano Pre-Audit (2026-04-26 14:15)

📁 File modificati: 2
  - app/routers/vini_pricing_router.py (+12, -3 righe)
  - frontend/src/pages/vini/SchedaVino.jsx (+8, -2 righe)

✓ Verifiche passate:
  - Sintassi Python (py_compile vini_pricing_router.py) OK
  - Trailing slash API: gli endpoint modificati sono /vini/pricing/calcola e /vini/pricing/ricalcola-tutti — i 3 call site in DashboardVini, MagazzinoVini, SchedaVino usano tutti lo slash finale ✓
  - Pattern testa+tab: SchedaVino già migrato (S55) ✓
  - bg-brand-cream: invariato ✓
  - Niente import morti introdotti
  - Niente DDL su sqlite_master (no schema change)

⚠ Attenzioni:
  - Stai modificando autoCalcPrezzo() in SchedaVino — la S58 ha messo un fix ricalcolo PREZZO_CALICE qui. Verifica che il tuo cambio non rompa quella logica.
  - versions.jsx NON modificato. Modulo Vini è a 3.24 dopo S58. Vuoi bumparlo a 3.25 con questa modifica?

🔴 Errori bloccanti: nessuno

📋 Commit message suggerito:
  "Vini v3.25: fix calcolo ricarico in /vini/pricing/calcola"

📋 Update docs post-push:
  - sessione.md: entry mini "S<N> mini — fix calcolo ricarico vini"
  - changelog.md: voce sotto "Modulo Vini"
  - versions.jsx: vini 3.24 → 3.25
  - controllo_design.md: nessun cambiamento
  - roadmap.md: nessuna voce chiusa direttamente

→ Procedi con `/guardiano push "Vini v3.25: fix calcolo ricarico in /vini/pricing/calcola"`?
```

## Setup script (opzionale, una tantum)

Il file `.guardiano_state.json` viene creato a primo uso. Se non esiste ancora, alla prima invocazione crearlo vuoto:

```bash
cd /Users/underline83/trgb && [ ! -f .guardiano_state.json ] && echo '{}' > .guardiano_state.json
```

Aggiungere a `.gitignore` se non già presente:
```
.guardiano_state.json
```
