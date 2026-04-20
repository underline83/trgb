# Mattone Housekeeping — Guardiano del progetto TRGB

**Stato**: proposta v1 (2026-04-20), in attesa approvazione Marco
**Pattern**: seguire il modello di `docs/architettura_mattoni.md` (M.A Notifiche, M.B PDF, ecc.)
**Posizione finale proposta**: `docs/mattone_housekeeping.md` + implementazione in `scripts/housekeeping/`

---

## 0. Obiettivo

Impedire che il progetto accumuli di nuovo quello che l'audit 2026-04-20 ha trovato:
- file TODO "fantasma" (scritti ma mai spuntati dopo l'implementazione)
- mockup storici dimenticati in root
- worktree git effimeri non rimossi
- router/componenti orfani dopo refactor
- memorie Claude datate
- `__pycache__`, `.DS_Store`, CSV di dryrun committati per errore
- docs non aggiornati dopo un rilascio

Il guardiano agisce a **tre livelli**, che si rinforzano reciprocamente:
1. **Prevenzione** — hook pre-commit in `push.sh` che blocca/avverte su pattern sospetti.
2. **Riparazione on-demand** — skill `trgb:housekeeping` invocabile da Cowork con `/audit` o simili.
3. **Controllo periodico** — scheduled task mensile che produce un report automatico.

---

## 1. Livello 1 — Prevenzione (hook in `push.sh`)

### Quando scatta
Alla chiamata di `./push.sh "messaggio"`, prima che `git commit` venga eseguito. L'hook legge `git diff --cached --name-only` e `git diff --cached` e applica check.

### Check implementati

#### 1.1 Blocco duro (exit non-zero, si ferma)
Pattern che non devono mai finire in un commit:
- File root che corrispondono a: `__pycache__/`, `*.pyc`, `.DS_Store`, `*.bak`, `*_dryrun*.csv`, `*_test_output*.csv`, `*_debug*.json`.
- File `.env`, `.env.local`, `.env.production` non in `.gitignore`.
- Directory `app/data/` o file sqlite3 di produzione (doppio check).
- `frontend.zip` o archivi `*.zip` in root.

Messaggio:
```
[housekeeping] BLOCCO: {file} è un artefatto non tracciabile.
  Aggiungi a .gitignore o rimuovi con: git rm --cached {file}
  Per forzare: ./push.sh "msg" --skip-housekeeping
```

#### 1.2 Avviso morbido (stampa warning, chiede conferma y/N)

**Fantasma TODO** — se un file `docs/**/*_todo.md` è stato modificato:
- conta `[ ]` e `[x]` prima/dopo
- se aggiunte nuove `[ ]` ma **zero `[ ]` → `[x]`**, warning:
  ```
  [housekeeping] ATTENZIONE: {file} ha aggiunto N nuove task [ ] senza spuntare niente.
  Verifica di non creare un file fantasma. Continuare? [y/N]
  ```

**Docs non aggiornati** — se modifiche a `app/routers/` o `frontend/src/pages/` MA **non** a `docs/changelog.md`:
```
[housekeeping] ATTENZIONE: modifiche a codice senza update changelog.
Ricorda feedback_docs_post_commit.md. Continuare? [y/N]
```

**Sessione.md non aggiornata** — se il commit tocca ≥5 file di codice e `docs/sessione.md` non è nello stage, warning analogo.

**Mockup in root** — se nuovo `mockup-*.html` in root:
```
[housekeeping] CONVENZIONE: i mockup vanno in docs/mockups/ (fresh) o docs/archive/mockups/ (storici).
Stai aggiungendo {file} in root. Continuare? [y/N]
```

**Nuova dipendenza npm/pip** — se `package.json`, `package-lock.json`, `requirements.txt` modificati:
```
[housekeeping] ATTENZIONE: modificata una lista dipendenze.
Ricorda: ambiente senza rete. Il lock va allineato al VPS. Continuare? [y/N]
```

#### 1.3 Solo log informativo (niente prompt)
- Conta file toccati, LOC aggiunte/rimosse.
- Elenca worktree in `.claude/worktrees/` come promemoria.

### Implementazione

File: `scripts/housekeeping/pre_push_checks.sh`
Chiamato da `push.sh`:
```bash
if [ "${1:-}" != "--skip-housekeeping" ]; then
  ./scripts/housekeeping/pre_push_checks.sh || { echo "housekeeping ha bloccato"; exit 1; }
fi
```

Flag `--skip-housekeeping` per bypass in emergenza.

---

## 2. Livello 2 — Riparazione on-demand (skill `trgb:housekeeping`)

### Trigger
Invocabile da Cowork/Claude Code quando:
- "fai ordine", "fai pulizia", "audit del progetto"
- "/audit", "/housekeeping"
- "il progetto è sporco", "troviamo cosa c'è da ripulire"

### Comportamento
Riproduce l'audit di oggi in forma automatica:

1. **Inventario** — contatori file per area.
2. **Scansione root** — file legacy candidati (pattern noti: `*.zip`, `run_server*.py`, `run_servers.command`, `update_vps.sh`, `ISTRUZIONI_SERVER.md`, `*_dryrun.csv`, cartelle vuote).
3. **Scansione mockup** — tutti i `mockup-*.html`/`mockup-*.jsx` + `frontend/public/` — propone archive per quelli non citati in `docs/sessione.md` o `docs/changelog.md`.
4. **Scansione backend** — grep router vs `main.py`, service vs import, `__pycache__` anomalie.
5. **Scansione frontend** — grep componenti vs import, asset SVG vs import, hook vs usage.
6. **Scansione TODO** — per ogni `docs/**/*_todo.md`: conta `[x]`/`[ ]`, confronta con changelog per file fantasma.
7. **Scansione worktree** — `git worktree list` + "ha commit non in main?".
8. **Scansione memoria** — legge ogni file in `~/…/memory/` e cross-check vs realtà.

### Output
In `outputs/audit_<data>/` produce gli stessi 8 file di oggi (01..08) + `00_REPORT_FINALE.md` con:
- stato complessivo
- piano pulizia per priorità 🔴/🟡/🟢
- comandi `./push.sh` pronti
- domande ambigue

### Forma tecnica
Una skill Cowork. Contiene:
- `SKILL.md` con istruzioni per Claude
- `scripts/scan_root.sh`, `scripts/scan_backend.py`, `scripts/scan_frontend.py`, `scripts/scan_todo.py`, `scripts/scan_memory.py` — riusabili
- `templates/report_template.md`

La skill sa **leggere** ma **non modifica nulla**. Pulizia vera la fa Marco via `./push.sh`.

---

## 3. Livello 3 — Controllo periodico (scheduled task)

### Cadenza
Primo lunedì del mese, 08:00 Europe/Rome.

### Azione
Esegue la skill `trgb:housekeeping` in dry-run, genera report in `outputs/audit_<yyyy-mm>/`, e produce sommario markdown per notifica.

### Canale di notifica (da decidere)
- **Bacheca Staff via M.A** (immediato, già fatto) — entry "Housekeeping report di {mese}" con link al file.
- **Email a marco@carminati.org** — richiede M.D Email (aperto, bloccante).
- **Solo file** in `~/trgb_housekeeping_reports/` consultato on-demand.

### Implementazione
Tool: `mcp__scheduled-tasks__create_scheduled_task` (disponibile).

```json
{
  "name": "trgb-housekeeping-monthly",
  "schedule": "first monday of month at 08:00",
  "prompt": "Esegui skill trgb:housekeeping in dry-run. Salva report in outputs/audit_<yyyy-mm>/. Scrivi sommario 15 righe e pubblica come notifica Bacheca Staff TRGB via M.A.",
  "timezone": "Europe/Rome"
}
```

---

## 4. Convenzioni preventive (parte testuale del mattone)

### 4.1 TODO
- File `*_todo.md` vive **solo mentre la fase è aperta**. Quando chiusa:
  - spuntare tutte le `[x]` completate
  - archiviare in `docs/archive/fase_<nome>/`
  - aggiornare `changelog.md` e `sessione.md`
- Pattern virtuoso: `carta_bevande_todo.md` (94/27, aggiornato continuamente).

### 4.2 Mockup
- Fase attiva: `docs/mockups/` (se documentano fase) o root (se Marco li apre in browser).
- Superati: `docs/archive/mockups/` con `README.md` che indica la versione finale che li ha superati.

### 4.3 Docs
- Dopo ogni rilascio significativo: `changelog.md` + `sessione.md` + modulo specifico.
- Major version: bump `frontend/src/config/versions.jsx`.
- Cambio struttura dati: aggiornare `docs/database.md`.

### 4.4 Worktree Claude Code
- Al termine merge: `git worktree remove .claude/worktrees/<nome>`.
- Aperto da >7 giorni: avviso.

### 4.5 Memorie Claude
- Dopo rilascio significativo: aggiornare `project_trgb.md` (sessione, versioni, riassunto).
- Prima di costruire un mattone: creare `project_mattone_<nome>.md`.
- Periodicamente: cross-check memoria.

### 4.6 Root
Solo:
- entry point: `main.py`, `push.sh`, `requirements.txt`
- config: `.env*`, `.gitignore`, `CLAUDE.md`
- setup one-time: `setup-backup-and-security.sh`
- cartelle: `app/`, `frontend/`, `docs/`, `scripts/`, `static/` (se usata), `tools/`, `.claude/`, `.git/`, `venv/`
- Tutto il resto va mosso o archiviato.

---

## 5. Roadmap di implementazione

### Fase 1 — Pulizia retroattiva (una tantum, `00_REPORT_FINALE.md`)
Stima: 2 push.
- Push 🔴: file legacy, router orfani, PDF vuoto, archivio v2.0-todo, `__pycache__`.
- Push 🟡: mockup storici, componenti frontend orfani, worktree safe, docs superati.

### Fase 2 — Livello 1 (hook `push.sh`)
Stima: 1 push.
- Scrivi `scripts/housekeeping/pre_push_checks.sh`.
- Integra in `push.sh` con flag `--skip-housekeeping`.
- Test su 2-3 scenari.

### Fase 3 — Livello 2 (skill housekeeping)
Stima: 1-2 sessioni.
- Estrai 7 sub-audit in script riusabili `scripts/housekeeping/scan_*.{sh,py}`.
- Crea plugin `trgb:housekeeping` con `SKILL.md`.
- Test: "/audit" riproduce output di oggi.

### Fase 4 — Livello 3 (scheduled task)
Stima: 30 minuti.
- Configura task mensile.
- Collega a M.A per notifica.
- Prima esecuzione: maggio 2026, primo lunedì.

---

## 6. Decisioni da prendere con Marco

1. **Canale notifica mensile**: Bacheca Staff (M.A, immediato) vs email (attende M.D) vs solo file?
2. **Livello 1 — blocco o solo avviso?** Default proposto: blocco duro su pattern certi, avviso y/N sul resto.
3. **Nome skill**: `trgb:housekeeping`, `trgb:audit`, `trgb:ordine`, altro?
4. **Posizione finale**: scrivo `docs/mattone_housekeeping.md` nel repo ora o vuoi rivederlo prima?
5. **Scope livello 3**: anche warning su docs non toccati >30 giorni, o solo audit strutturale?

---

## 7. Perché questo design è "il più potente"

Alternative valutate:
- **Solo skill on-demand**: richiede che tu la chiami. Inevitabile dimenticarsene. Non previene.
- **Solo hook**: blocca nel momento, ma non offre quadro d'insieme. Non ripara.
- **Solo scheduled task**: rileva troppo tardi (fantasma già in repo da settimane). Non previene real-time, non richiamabile al volo.

L'ibrido:
- **Hook** ferma il rumore al momento della creazione.
- **Skill** permette audit profondi quando si sente che "qualcosa si è accumulato".
- **Task periodico** garantisce controllo anche nei periodi caotici.

E tutti e tre condividono gli stessi script di scansione (`scripts/housekeeping/scan_*`), così investimento codice è unico e triplica in valore.

---

## 8. Note di implementazione tecniche

- Gli script di scansione devono essere **rapidi** (< 10 secondi totali), altrimenti il hook rallenta push.sh.
- Il hook **non deve fallire silenziosamente**: errore di parsing → logga e passa (conservativo).
- Gli script **testabili** in isolamento (input: root path, output: JSON).
- La skill **non scrive nulla** nel repo: solo report in `outputs/`. Pulizia vera tramite Marco.

---

**Status**: pronto per approvazione. Alla luce verde su §6, procedo con Fase 1 (pulizia retroattiva 🔴 + 🟡) e parallelamente scrivo `docs/mattone_housekeeping.md` finale + scripts Fase 2.
