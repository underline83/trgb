# Prompt Claude Code — MVP Modulo "Gestione Cucina"

> Generato da Cowork (sessione design prodotto, 2026-04-17). Incolla questo prompt in Claude Code dentro `/Users/underline83/trgb` per avviare l'implementazione dell'MVP.

---

## 🎯 Contesto

Stai costruendo un nuovo modulo di TRGB chiamato **Gestione Cucina** su un gestionale FastAPI + React + SQLite già in produzione. TRGB è l'app di Marco (Osteria Tre Gobbi, Bergamo) deployata su VPS Aruba. Il modulo serve a:

1. Definire **template di checklist ricorrenti** (apertura cucina, chiusura bar, pulizia frigo settimanale, HACCP)
2. Generare automaticamente **istanze giornaliere** di queste checklist
3. Permettere al personale (chef, sala) di **completare i task da iPad** tap-to-complete
4. Gestire **task singoli** (non ricorrenti) assegnati a persone specifiche
5. Offrire una **agenda giornaliera** con vista per turno

**Questo è l'MVP. Lasciamo fuori: foto, firma, alert/escalation, KPI dashboard, PDF export, corrective action automatico, frequenze settimanale/mensile.** Solo frequenza GIORNALIERA e item tipo CHECKBOX/NUMERICO/TEMPERATURA/TESTO.

## 📚 Documenti da leggere PRIMA di scrivere codice

```
docs/architettura_mattoni.md         # M.A Notifiche è pronto, lo usiamo
docs/architettura.md                 # Stack, struttura DB, convenzioni
docs/database.md                     # Come funzionano i 5 DB separati
docs/modulo_dipendenti_v2.md         # Pattern agenda settimanale da replicare
CLAUDE.md                            # Regole del progetto (VINCOLANTI)
```

Leggi anche 1-2 router esistenti per assorbire il pattern:
```
app/routers/turni_router.py          # pattern FastAPI + JWT + ruoli
app/routers/notifiche_router.py      # pattern notifiche
app/services/alert_engine.py         # solo per ispirazione scheduler-like
```

Leggi 1 pagina React esistente:
```
frontend/src/pages/admin/DipendentiTurni.jsx   # pattern UI turni
frontend/src/config/modulesMenu.js             # come si registra un modulo
frontend/src/config/api.js                     # apiFetch, API_BASE
```

## 🧱 Vincoli non negoziabili (da CLAUDE.md)

- **Git**: NON fare `git commit` / `git push` / `git add -A`. Marco usa `push.sh`. Al termine di ogni blocco di modifiche suggerisci `./push.sh "testo"`.
- **Trailing slash** obbligatorio su endpoint root (`/cucina/` non `/cucina`). FastAPI 307 redirect → browser perde Auth → 401.
- **API**: sempre `API_BASE` + `apiFetch` da `config/api.js`. Mai URL hardcoded.
- **Colori**: palette `brand-*` (brand-red, brand-green, brand-blue, brand-ink, brand-cream). MAI `bg-neutral-100`/`bg-gray-50`.
- **Mobile-aware**: touch target min 44pt, bottoni 48pt, no hover-only, safe-area. La cucina usa iPad, Marco apre mobile.
- **Emoji + colori `modulesMenu.js`** per card Home — NO icone SVG nei moduli Home.
- **Mattoni**: se serve notifica → `from app.services.notifiche_service import crea_notifica` (M.A). Se serve WA → `utils/whatsapp.js` (M.C). Non reinventare.
- **Config in DB, non in codice**: liste, soglie, template di seed configurabili vivono in DB, non hardcoded.
- **Ruoli**: `superadmin` eredita `admin`. Check ereditarietà su qualsiasi `role in ("admin", ...)`.
- **Cartelle runtime in .gitignore**: `app/data/cucina/` (se creata) deve finire in `.gitignore` altrimenti `git clean -fd` del post-receive VPS la cancella a ogni push.

## 🏗️ Architettura da realizzare

### Backend (FastAPI + SQLite)

**Nuovo DB `app/data/cucina.sqlite3`** (non estendere altri DB). 6 tabelle:

1. `checklist_template` — nome, reparto, frequenza=GIORNALIERA (solo MVP), turno, ora_scadenza_entro, attivo, created_by
2. `checklist_item` — template_id FK, ordine, titolo, tipo (CHECKBOX/NUMERICO/TEMPERATURA/TESTO), obbligatorio, min_valore, max_valore, unita_misura
3. `checklist_instance` — template_id FK, data_riferimento, turno, scadenza_at, stato (APERTA/IN_CORSO/COMPLETATA/SCADUTA/SALTATA), assegnato_user, completato_at, score_compliance. `UNIQUE(template_id, data_riferimento, turno)` per scheduler idempotente
4. `checklist_execution` — instance_id FK, item_id FK, stato (OK/FAIL/SKIPPED/PENDING), valore_numerico, valore_testo, completato_at, completato_da, note
5. `task_singolo` — titolo, descrizione, data_scadenza, ora_scadenza, assegnato_user, priorita, stato, completato_at, completato_da, note_completamento, origine=MANUALE (solo MVP)
6. `cucina_alert_log` — schema pronto ma NON popolato in MVP (lasciare tabella vuota, serve solo come scaffold per V1)

**Migrazione**: nuovo file `app/migrations/NNN_cucina_mvp.py` (usa prossimo numero libero — verifica con `ls app/migrations/`). Segui pattern esistente: try/except per idempotenza, registra in `schema_migrations`.

**Router**: `app/routers/cucina_router.py` con prefix `/cucina`. Tutti gli endpoint `Depends(get_current_user)`. Pattern check ruolo inline:

```python
def _require_admin_or_chef(user: dict):
    if user["role"] not in ("admin", "superadmin", "chef"):
        raise HTTPException(status_code=403, detail="Permesso negato")
```

**Endpoint MVP** (trailing slash obbligatorio su root):

```
# Template (admin only)
GET    /cucina/templates/
GET    /cucina/templates/{id}
POST   /cucina/templates/
PUT    /cucina/templates/{id}
DELETE /cucina/templates/{id}
POST   /cucina/templates/{id}/duplica

# Agenda (tutti operativi)
GET    /cucina/agenda/?data=YYYY-MM-DD&turno=
GET    /cucina/agenda/settimana?data_inizio=YYYY-MM-DD
POST   /cucina/agenda/genera           # admin, body {data_da, data_a}

# Istanze
GET    /cucina/instances/{id}
POST   /cucina/instances/{id}/assegna  # body {user}
POST   /cucina/instances/{id}/completa
POST   /cucina/instances/{id}/salta    # body {motivo}

# Esecuzione item
POST   /cucina/execution/item/{item_id}/check   # body {instance_id, stato, valore_numerico?, valore_testo?, note?}

# Task singoli
GET    /cucina/tasks/?user=&data=&stato=
POST   /cucina/tasks/
PUT    /cucina/tasks/{id}
POST   /cucina/tasks/{id}/completa
DELETE /cucina/tasks/{id}

# Scheduler lazy (chiamato fire-and-forget da GET /dashboard/home)
POST   /cucina/scheduler/genera-giornaliere   # genera oggi+1 se manca
POST   /cucina/scheduler/check-scadute        # marca SCADUTE
```

**Service**: crea `app/services/cucina_scheduler.py` con:
- `genera_istanze_per_data(conn, data: date) -> int`: legge template attivi, match GIORNALIERA, `INSERT OR IGNORE` per idempotenza
- `check_scadenze(conn, ora_corrente: datetime) -> int`: cerca instances con `scadenza_at < now AND stato IN ('APERTA','IN_CORSO')` → stato=SCADUTA

Aggancia lo scheduler a `dashboard_router._home()` come già fa l'alert engine (fire-and-forget in thread, time budget 2s max, try/except che non blocca la response).

**Registrazione**: `main.py` → `app.include_router(cucina_router)`. Init DB al boot via `init_cucina_db()`.

### Frontend (React + Tailwind)

**File nuovi in `frontend/src/pages/cucina/`**:

1. `CucinaHome.jsx` — dashboard entry (4 card: Agenda, Template, Task, Impostazioni) colori coordinati con `modulesMenu.js`
2. `CucinaAgendaGiornaliera.jsx` — vista giorno raggruppata per turno, card instance+task
3. `CucinaAgendaSettimana.jsx` — tabella 7 colonne stile `FoglioSettimana`
4. `CucinaInstanceDetail.jsx` — tap-to-complete item per item, numpad per TEMPERATURA, stato visibile con colore brand
5. `CucinaTemplateList.jsx` — admin, lista template con filtri
6. `CucinaTemplateEditor.jsx` — admin, form + items drag-sortable (riuso qualsiasi pattern drag già presente, altrimenti bottoni su/giù)
7. `CucinaTaskList.jsx` — tabella task singoli con filtri
8. `CucinaTaskNuovo.jsx` — modal o form per creare task

**Rotte** in `App.jsx`:
```jsx
<Route path="/cucina" element={<CucinaHome />} />
<Route path="/cucina/agenda" element={<CucinaAgendaGiornaliera />} />
<Route path="/cucina/agenda/settimana" element={<CucinaAgendaSettimana />} />
<Route path="/cucina/instances/:id" element={<CucinaInstanceDetail />} />
<Route path="/cucina/templates" element={<CucinaTemplateList />} />
<Route path="/cucina/templates/:id" element={<CucinaTemplateEditor />} />
<Route path="/cucina/templates/nuovo" element={<CucinaTemplateEditor />} />
<Route path="/cucina/tasks" element={<CucinaTaskList />} />
```

**`modulesMenu.js`** — aggiungi entry:
```javascript
cucina: {
  title: "Gestione Cucina",
  icon: "🍳",
  color: "bg-orange-50 border-orange-200 text-orange-900",
  go: "/cucina",
  sub: [
    { label: "Agenda giornaliera", go: "/cucina/agenda" },
    { label: "Agenda settimana",   go: "/cucina/agenda/settimana" },
    { label: "Task",               go: "/cucina/tasks" },
    { label: "Template",           go: "/cucina/templates", check: "admin" },
  ],
},
```

**`modules.json`** — aggiungi `cucina` con ruoli: `admin`, `superadmin`, `chef` piena visibilità; `sala`, `viewer` solo agenda; altri bloccati.

**`versions.jsx`** — nuovo modulo `cucina: "1.0.0"`.

### Seed iniziale

Nel migration script, dopo create tables, inserisci 3 template seed (disattivabili):
- "Apertura cucina" (turno=APERTURA, 5 item CHECKBOX)
- "Chiusura cucina" (turno=CHIUSURA, 6 item di cui 2 TEMPERATURA range 0-4°C)
- "Pulizia bar fine giornata" (turno=CHIUSURA, 4 item CHECKBOX)

Tutti `attivo=0` di default: Marco decide se attivarli.

## 📋 Istruzioni step-by-step

Procedi in quest'ordine, **facendo un commit-point logico ogni step** (suggerisci testo `./push.sh "..."` al termine di ogni step). Non accoppiare più cambiamenti infrastrutturali (memoria: `feedback_no_blocchi_accoppiati`).

### Step 1 — Backend: DB + migrazione

- Crea `app/migrations/NNN_cucina_mvp.py` con CREATE TABLE delle 6 tabelle + seed 3 template
- Crea `app/models/cucina_db.py` con `get_cucina_conn()` e `init_cucina_db()`
- Aggiungi init al boot di `main.py`
- Aggiungi `app/data/cucina/` e `app/data/cucina.sqlite3*` al `.gitignore`
- **Test locale**: avvia backend, verifica tabelle create con `sqlite3 app/data/cucina.sqlite3 ".schema"`

Commit: `./push.sh "cucina: migrazione MVP + 6 tabelle + 3 template seed"`

### Step 2 — Backend: router CRUD template + items

- Crea `app/routers/cucina_router.py` con endpoint template (GET list, GET one, POST, PUT, DELETE, duplica)
- Schemi Pydantic in `app/schemas/cucina_schema.py`
- Registra router in `main.py`
- **Test**: Postman o curl locale, verifica CRUD completo + check ruolo

Commit: `./push.sh "cucina: API CRUD template e items"`

### Step 3 — Backend: scheduler + istanze + esecuzione

- Crea `app/services/cucina_scheduler.py` (`genera_istanze_per_data`, `check_scadenze`)
- Aggiungi endpoint `/cucina/scheduler/genera-giornaliere` e `/check-scadute`
- Aggiungi endpoint agenda (`/cucina/agenda/`, `/settimana`)
- Aggiungi endpoint instances (`/{id}`, `/assegna`, `/completa`, `/salta`)
- Aggiungi endpoint execution item (`/cucina/execution/item/{id}/check`)
- Aggancia scheduler a `dashboard_router` fire-and-forget
- **Test**: chiama `POST /cucina/scheduler/genera-giornaliere`, verifica che attivando un template seed vengano create instances su data odierna e che sia idempotente (chiamata ripetuta non duplica)

Commit: `./push.sh "cucina: scheduler + agenda + esecuzione checklist"`

### Step 4 — Backend: task singoli

- Endpoint CRUD `/cucina/tasks/`
- Endpoint `/tasks/{id}/completa`

Commit: `./push.sh "cucina: API task singoli"`

### Step 5 — Frontend: voce menu + Home modulo

- Aggiungi `cucina` a `modulesMenu.js` + `modules.json`
- Crea `frontend/src/pages/cucina/CucinaHome.jsx`
- Registra rotte in `App.jsx`
- Aggiungi modulo a `versions.jsx`
- **Test**: verifica che la voce appaia nel menu header per admin/chef e che il click porti a `/cucina`

Commit: `./push.sh "cucina: voce menu + home modulo"`

### Step 6 — Frontend: agenda giornaliera + instance detail

- `CucinaAgendaGiornaliera.jsx` — fetch `/cucina/agenda/?data=today`, raggruppa per turno
- `CucinaInstanceDetail.jsx` — tap-to-complete item, POST `/cucina/execution/item/{id}/check` per ogni tap, bottone Completa checklist
- Gestione stato visivo con colori brand (APERTA=cream, IN_CORSO=blue, COMPLETATA=green, FAIL=red, SCADUTA=red scuro)
- Touch target 48pt minimi

Commit: `./push.sh "cucina: agenda giornaliera + esecuzione tap-to-complete"`

### Step 7 — Frontend: editor template

- `CucinaTemplateList.jsx` — lista con filtri reparto/frequenza/attivo
- `CucinaTemplateEditor.jsx` — form template + items ordinabili con su/giù (drag nice-to-have)
- Supporto tipi item: CHECKBOX (solo titolo), NUMERICO (range), TEMPERATURA (range °C pre-riempito), TESTO

Commit: `./push.sh "cucina: editor template admin"`

### Step 8 — Frontend: task singoli + agenda settimanale

- `CucinaTaskList.jsx` — tabella task filtrabile
- `CucinaTaskNuovo.jsx` — form nuovo task (modal)
- `CucinaAgendaSettimana.jsx` — replica pattern `FoglioSettimana` con 7 colonne

Commit: `./push.sh "cucina: task singoli + agenda settimana"`

### Step 9 — Aggiornamento docs

- `docs/sessione.md` — mini-sessione MVP Cucina
- `docs/roadmap.md` — aggiungi V1 e V2 in backlog
- `docs/changelog.md` — entry release
- `docs/modulo_cucina.md` — nuovo doc modulo (scopo, entità, endpoint, ruoli)

Commit: `./push.sh "cucina: docs MVP completati"`

## ✅ Criteri di accettazione (Definition of Done)

Al termine dell'MVP deve essere vero che:

1. Marco può **loggarsi come admin**, andare in `/cucina/templates`, creare un template "Apertura cucina" con 5 item CHECKBOX e 2 item TEMPERATURA range 0-4°C, salvarlo, attivarlo.
2. Il giorno dopo (o chiamando manualmente `POST /cucina/scheduler/genera-giornaliere`) appare **automaticamente** un'istanza nella sua agenda.
3. Marco può **loggarsi come chef** (account test), aprire `/cucina/agenda` da iPad, vedere l'istanza "Apertura cucina" aperta, tappare gli item uno per uno, inserire le temperature, completare → l'istanza passa a COMPLETATA e lo score viene calcolato.
4. Marco può creare un **task singolo** "Chiama fornitore pesce" assegnato a sé, con scadenza oggi → appare nell'agenda.
5. Se Marco passa la scadenza senza completare, **l'istanza diventa SCADUTA** (al prossimo trigger scheduler).
6. La voce "Gestione Cucina" appare nel menu header con emoji 🍳 e colore brand coordinato; sparisce per il ruolo `contabile` (niente permessi).
7. **Non si rompe nulla** del resto di TRGB: prenotazioni, fatture, CG, dipendenti, tutto continua a funzionare.
8. Codice pulito: niente URL hardcoded, niente `bg-neutral-100`, tutti gli endpoint con trailing slash dove serve.

## 📂 File attesi in output

**Backend**:
- `app/migrations/NNN_cucina_mvp.py`
- `app/models/cucina_db.py`
- `app/routers/cucina_router.py`
- `app/services/cucina_scheduler.py`
- `app/schemas/cucina_schema.py`
- Modifiche: `main.py`, `app/routers/dashboard_router.py`, `.gitignore`

**Frontend**:
- `frontend/src/pages/cucina/CucinaHome.jsx`
- `frontend/src/pages/cucina/CucinaAgendaGiornaliera.jsx`
- `frontend/src/pages/cucina/CucinaAgendaSettimana.jsx`
- `frontend/src/pages/cucina/CucinaInstanceDetail.jsx`
- `frontend/src/pages/cucina/CucinaTemplateList.jsx`
- `frontend/src/pages/cucina/CucinaTemplateEditor.jsx`
- `frontend/src/pages/cucina/CucinaTaskList.jsx`
- `frontend/src/pages/cucina/CucinaTaskNuovo.jsx`
- Modifiche: `frontend/src/App.jsx`, `frontend/src/config/modulesMenu.js`, `frontend/src/config/versions.jsx`, `frontend/public/modules.json` (o dove vive la matrice)

**Docs**:
- `docs/modulo_cucina.md` (nuovo)
- `docs/sessione.md`, `docs/roadmap.md`, `docs/changelog.md` (aggiornati)

## 🚫 Cosa NON fare in questo MVP

- Non implementare foto/firma (lo faremo in V1)
- Non integrare M.F Alert Engine (V1)
- Non creare dashboard KPI (V1)
- Non fare PDF export (V1)
- Non creare checker `@register_checker` (V1)
- Non toccare altri moduli o DB
- Non aggiungere dipendenze Python/npm nuove
- Non fare commit/push manuali (regola di Marco)

## 🎙️ Stile comunicazione con Marco

- Risposte in italiano
- Quando hai dubbi su ambiguità del design: **chiedi prima di codare**
- A fine di ogni step: riassunto molto conciso delle modifiche + `./push.sh "..."` pronto da copiare
- Se qualcosa non gira dopo il push: chiedi di refreshare con Ctrl+Shift+R e di guardare log VPS (`journalctl -u trgb-backend -n 100 --no-pager`)
