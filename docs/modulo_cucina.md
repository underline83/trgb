# Modulo Cucina — MVP

**Versione:** 1.0 (MVP, sessione 43 — 2026-04-17)
**Stato:** ✅ rilasciato
**Ruoli destinatari:** admin/superadmin/chef (pieno controllo), sala (agenda + task), viewer (solo lettura)

Modulo per la gestione operativa di cucina e bar: **checklist ricorrenti** (apertura, chiusura, HACCP, pulizie) e **task singoli** non ricorrenti (chiamate, consegne, riparazioni).

---

## Scopo

Sostituire il registro cartaceo HACCP e le checklist "a memoria" con un sistema digitale usabile da iPad in cucina/bar. Il chef attiva i template di checklist che gli interessano, lo scheduler genera l'istanza ogni giorno automaticamente, gli operatori tappano OK/FAIL/N.A. sui singoli item. Le temperature frigorifere hanno un numpad touch-friendly e un range atteso che forza FAIL automatico fuori soglia.

### Cosa risolve
- **Tracciabilità HACCP**: ogni completamento ha utente, timestamp, valore numerico (temperature), eventuale nota.
- **Responsabilizzazione**: score di compliance calcolato a fine checklist (% di item OK).
- **Visibilità direzione**: agenda settimanale con pallini colorati stato, oggi evidenziato, scadute in rosso.
- **Task volanti**: "chiama il pesce domani alle 8", "sistemare la lavastoviglie" — non serve più inventarsi un posto dove tracciarli.

### Cosa NON fa in MVP (rimandato a V1)
- Foto e firma digitale
- Alert engine integrato (il mattone **M.F** esiste ma non è ancora agganciato)
- Dashboard KPI storica / export PDF
- Corrective action automatico su FAIL
- Frequenze settimanale/mensile
- Notifiche push / WA su checklist in scadenza

---

## Entità principali

**DB dedicato**: `app/data/cucina.sqlite3` (6 tabelle)

| Tabella | Scopo |
|---------|-------|
| `checklist_template` | Definizione ricorrente (nome, reparto, turno, ora_scadenza, attivo) |
| `checklist_item` | Voci del template ordinate (CHECKBOX / NUMERICO / TEMPERATURA / TESTO) |
| `checklist_instance` | Istanza generata dallo scheduler per un giorno (UNIQUE su template+data+turno) |
| `checklist_execution` | Esito singola voce (OK / FAIL / SKIPPED / PENDING) |
| `task_singolo` | Task non ricorrente con priorità, assegnato, scadenza |
| `cucina_alert_log` | **Scaffold V1** (vuoto in MVP) — log di alert inviati |

### Ciclo di vita di un'istanza

```
APERTA  ──  primo tap-to-complete  ──▶  IN_CORSO
   │                                        │
   │ scadenza_at passata                    │ tutti gli item fatti
   ▼                                        ▼
SCADUTA                                COMPLETATA  (score calcolato)
   │
   └─── oppure SALTATA (con motivo, solo admin/chef)
```

### Ciclo di vita di un task singolo

```
APERTO  ──▶  IN_CORSO  ──▶  COMPLETATO (con note)
   │
   ├─ data_scadenza < oggi ──▶ SCADUTO (auto su read)
   └─ admin/chef annulla ──▶ ANNULLATO
```

---

## Scheduler

`app/services/cucina_scheduler.py`

- **`genera_istanze_per_data(conn, data)`** — per ogni template attivo GIORNALIERA crea un'istanza (INSERT OR IGNORE → idempotente). Calcola `scadenza_at` combinando data + `ora_scadenza_entro`. Orari 00:00-03:59 sono interpretati come giorno successivo (chiusura oltre mezzanotte).
- **`check_scadenze(conn)`** — marca SCADUTE le istanze APERTA/IN_CORSO con `scadenza_at < NOW`.
- **`calcola_score_compliance(conn, instance_id)`** — 100 × `count(OK)` / `count(items)`. FAIL e SKIPPED contano come 0.
- **`trigger_scheduler(days_ahead=1)`** — chiamato fire-and-forget da `/dashboard/home` ogni apertura Home. Idempotente.

**Niente sveglia autonoma**: lo scheduler gira "pigramente" su GET di `/dashboard/home`, `/cucina/agenda/*` e via endpoint admin `/cucina/scheduler/*`. Sufficiente per un locale che apre ogni giorno.

---

## Endpoint

Tutti richiedono JWT. Ruoli:
- **admin/superadmin**: tutto
- **chef**: tutto tranne CRUD template (può solo leggere/eseguire)
- **sala**: agenda, instances, tasks
- **viewer**: solo lettura (middleware backend blocca le scritture)

### Template (CRUD)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/templates/` | admin, chef | Filtri: `reparto`, `turno`, `attivo` |
| GET | `/cucina/templates/{id}` | admin, chef | Dettaglio + items |
| POST | `/cucina/templates/` | admin | Crea template + items |
| PUT | `/cucina/templates/{id}` | admin | Modifica; `items` opzionale = replace-all |
| DELETE | `/cucina/templates/{id}` | admin | Cascade su items / instances / executions |
| POST | `/cucina/templates/{id}/duplica` | admin | Crea copia attivo=0, suffisso "(copia)" |

### Agenda

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/agenda/` | tutti | `data=YYYY-MM-DD`, `turno=...` opzionali |
| GET | `/cucina/agenda/settimana` | tutti | `data_inizio=YYYY-MM-DD` (auto-shift al lunedì FE) |
| POST | `/cucina/agenda/genera` | admin | `{data_da, data_a}` max 62 gg |

### Instance / Execution

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/instances/{id}` | tutti | Dettaglio + items denormalizzati |
| POST | `/cucina/instances/{id}/assegna` | tutti | `{user}` |
| POST | `/cucina/instances/{id}/completa` | tutti | Calcola score |
| POST | `/cucina/instances/{id}/salta` | admin, chef | `{motivo}` |
| POST | `/cucina/execution/item/{item_id}/check` | tutti | `{instance_id, stato, valore_numerico?, valore_testo?, note?}` |

### Task singoli

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/tasks/` | tutti | Filtri: `user`, `data`, `stato`. Auto-scadenza su read |
| POST | `/cucina/tasks/` | tutti | origine=MANUALE |
| PUT | `/cucina/tasks/{id}` | tutti | Blocca update su COMPLETATO (serve stato=APERTO per riaprire) |
| POST | `/cucina/tasks/{id}/completa` | tutti | `{note_completamento?}` |
| DELETE | `/cucina/tasks/{id}` | admin, chef | |

### Scheduler (admin)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| POST | `/cucina/scheduler/genera-giornaliere` | admin | Oggi + domani |
| POST | `/cucina/scheduler/check-scadute` | admin, chef | Marca SCADUTE |

**Trailing slash obbligatorio** su root dei gruppi (`/templates/`, `/agenda/`, `/tasks/`) — senza lo slash FastAPI fa 307 e il browser perde l'Authorization header.

---

## Frontend

Tutte le pagine in `frontend/src/pages/cucina/`:

| File | Rotta | Ruoli |
|------|-------|-------|
| `CucinaHome.jsx` | `/cucina` | tutti (con accesso al modulo) |
| `CucinaNav.jsx` | (componente condiviso) | — |
| `CucinaAgendaGiornaliera.jsx` | `/cucina/agenda` | tutti |
| `CucinaAgendaSettimana.jsx` | `/cucina/agenda/settimana` | tutti |
| `CucinaInstanceDetail.jsx` | `/cucina/instances/:id` | tutti |
| `CucinaTaskList.jsx` | `/cucina/tasks` | tutti |
| `CucinaTaskNuovo.jsx` | (modal usato da TaskList) | — |
| `CucinaTemplateList.jsx` | `/cucina/templates` | admin, chef |
| `CucinaTemplateEditor.jsx` | `/cucina/templates/nuovo` e `/:id` | admin |

### Convenzioni UI
- **Palette**: rosso (`bg-red-50/100` / `border-red-200/300/400` / `text-red-700/900`) — fornelli/fuoco, non collide con altri moduli
- **Sfondo**: `bg-brand-cream` come da regola
- **Icona menu**: 🍳
- **Touch target**: min 44pt, bottoni azione 48pt, numpad 60pt
- **Stati visivi**:
  - APERTA → cream neutro
  - IN_CORSO → blu
  - COMPLETATA → verde
  - SCADUTA → rosso scuro
  - SALTATA → neutro line-through
  - FAIL (item) → rosso chiaro
- **Numpad touch** per TEMPERATURA/NUMERICO con range atteso in cima; fuori range → FAIL automatico con nota

---

## Seed iniziale

La migrazione 084 crea 3 template di esempio, tutti `attivo=0`:

1. **Apertura cucina** (CUCINA / APERTURA, entro 10:30) — 5 item CHECKBOX
2. **Chiusura cucina** (CUCINA / CHIUSURA, entro 23:45) — 4 CHECKBOX + 2 TEMPERATURA (0..4°C)
3. **Pulizia bar fine giornata** (BAR / CHIUSURA, entro 00:30) — 4 item CHECKBOX

L'admin li attiva da `/cucina/templates`. Una volta attivi, il giorno dopo compaiono automaticamente nell'agenda.

---

## Integrazione con altri moduli

| Modulo | Come |
|--------|------|
| **Dashboard Home** | Fire-and-forget trigger dello scheduler su ogni GET `/dashboard/home` (pattern M.F) |
| **Notifiche (M.A)** | NON USATO in MVP, previsto in V1 per alert scadenze imminenti |
| **Alert Engine (M.F)** | NON USATO in MVP, previsto in V1 con checker `cucina_checklist_pending` |
| **Dipendenti** | Il campo `assegnato_user` è un username string libero, non FK — integrazione con anagrafica dipendenti è un evolutivo V1 |

---

## Roadmap evolutiva

### V1 (prossima sessione dedicata)
- Foto+firma su item FAIL (obbligatoria per HACCP)
- Checker `@register_checker("cucina_checklist_pending")` per M.F: notifica admin se alle 11:00 l'apertura non è completata
- Frequenza settimanale/mensile (es. "pulizia cappa" ogni lunedì)
- Corrective action automatica: se TEMPERATURA fuori range → task singolo auto-generato al chef
- Integrazione `assegnato_user` con tabella dipendenti (dropdown username attivi)
- Endpoint `GET /cucina/stats` per dashboard KPI

### V2 (backlog)
- PDF export registro HACCP mensile (mattone M.B)
- Notifiche WA al chef su scadenza imminente (mattone M.C)
- iPad kiosk mode senza header (una sola istanza attiva mostrata fullscreen)
- Drag & drop ordinamento items (ora bottoni ▲▼)
- Foto raccolte per item in una galleria mensile per audit

---

## File principali

### Backend
- `app/migrations/084_cucina_mvp.py` — DDL 6 tabelle + 3 seed
- `app/models/cucina_db.py` — connessione + init difensivo
- `app/schemas/cucina_schema.py` — Pydantic models + costanti enum
- `app/routers/cucina_router.py` — 18 endpoint
- `app/services/cucina_scheduler.py` — generazione + check scadenze + score

### Frontend
- `frontend/src/pages/cucina/*.jsx` — 8 file (vedi tabella sopra)
- `frontend/src/config/modulesMenu.js` — voce `cucina`
- `frontend/src/config/versions.jsx` — `cucina v1.0 beta`
- `frontend/src/App.jsx` — 7 rotte protette

### Config
- `app/data/modules.json` — entry `cucina` con ruoli e sub
- `.gitignore` — `app/data/cucina/` (scaffold runtime futura)
