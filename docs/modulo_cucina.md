# Modulo Cucina & Task Manager — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_pranzo.md](modulo_pranzo.md), [modulo_menu_carta.md](modulo_menu_carta.md), [modulo_vendite.md](modulo_vendite.md), [modulo_selezioni_giorno.md](modulo_selezioni_giorno.md), [problemi.md](problemi.md) (TASKS-1)

**Perimetro pagina.** Questa pagina copre DUE moduli R8 distinti (split docs previsto in roadmap DH.5):

| Modulo R8 | Manifest | Router | Prefix | Contenuto |
|---|---|---|---|---|
| **`task_manager`** | `core/moduli/task_manager/module.json` | `tasks_router` + `haccp_router` | `/tasks`, `/haccp` | Checklist ricorrenti (apertura/chiusura/HACCP/MEP), task singoli, report HACCP mensile |
| **`cucina`** | `core/moduli/cucina/module.json` | `lista_spesa_router` | `/lista-spesa` | Lista Spesa cucina. Il manifest dichiara: "Dashboard cucina e HACCP vivono in platform/task_manager" |

⚠️ **Ambiguità storica di naming** (importante per lo split DH.5): l'ex "modulo Cucina" MVP (sessione 41-43) è stato **rinominato Task Manager** in Phase B (sessione 46): router, DB, pagine e menu oggi si chiamano `tasks`. Invece la voce di menu "Gestione Cucina" nel dropdown header è il modulo **ricette**, sotto cui vivono Dashboard Cucina (`/cucina/dashboard`) e Lista Spesa (`/cucina/spesa`).

**Stato:** MVP rilasciato (sessione 43, 2026-04-17), rinominato Task Manager (sessione 46). Phase A multi-reparto, A.2 (livelli) e A.3 (brigata) implementate. Report HACCP + Lista Spesa aggiunti sessione 59 cont. (2026-04-27). Incidente TASKS-1 (DB ricreato vergine) sanato a livello schema il 2026-07-19 (mig 155), dati storici persi — vedi §7.
**Versioni (`versions.jsx`):** `tasks` v1.4 beta · `haccp` v1.0 alpha · `cucinaDashboard` v1.0 alpha · `listaSpesa` v1.0 alpha. (La chiave `cucina` non esiste più in versions.jsx.)
**Roadmap:** sezione `C.` di [roadmap.md](roadmap.md) ("CUCINA: task + HACCP + pranzo + selezioni + lista spesa").

---

# 0. Indice

1. Scopo del modulo
2. Entità principali (DB)
3. Scheduler giornaliero
4. Endpoint
5. Frontend
6. Convenzioni UI
7. Template: seed storici e stato attuale (incidente TASKS-1)
8. Integrazione con altri moduli
9. Phase A.2 — Livelli cucina (chef / sous_chef / commis)
10. Phase A.3 — Brigata cucina (ruoli utente reali)
11. Roadmap evolutiva post-MVP (stato aggiornato)
12. File principali (BE + FE)

---

# 1. Scopo del modulo

**Task Manager** (ex-Cucina) — gestione operativa multi-reparto (cucina, bar, sala, pulizia, manutenzione):

- **Checklist ricorrenti** — apertura, chiusura, HACCP, MEP. Generate giornalmente dallo scheduler.
- **Task singoli** non ricorrenti — chiamate, consegne, riparazioni, micro-azioni quotidiane.
- **Report HACCP mensile** — compliance %, eventi critici (temperature fuori soglia), top FAIL, gap nel registro.

**Modulo cucina** (in senso R8) — **Lista Spesa**: lista testuale delle cose da comprare (titolo + quantità libera + urgente + fornitore freeform), con toggle "fatto" e bulk delete. In più, la **Dashboard Cucina** chef (endpoint platform `/dashboard/cucina`) aggrega pranzo del giorno, carta attiva, alert allergeni e KPI ricette.

**Ruoli destinatari:**
- admin/superadmin → pieno controllo (unico che fa CRUD template)
- chef/sous_chef/commis (brigata cucina, vedi §10) → esecuzione + gestione task; lettura template; sous_chef/commis vedono solo il proprio livello
- sala → agenda, istanze, task
- viewer → sola lettura (il middleware `ReadOnlyViewerMiddleware` in `main.py:542` blocca POST/PUT/PATCH/DELETE per ruolo viewer su tutta l'app)

**Cosa risolve:**
- **Tracciabilità HACCP**: ogni completamento ha utente, timestamp, valore numerico (temperature), eventuale nota. Il report mensile (`/haccp/report/{anno}/{mese}`) evidenzia i valori fuori soglia.
- **Responsabilizzazione**: score di compliance calcolato a fine checklist (% di item OK).
- **Visibilità direzione**: agenda giornaliera/settimanale con stati colorati, report HACCP mensile.
- **Task volanti**: posto unico per "chiama il pesce domani alle 8" o "sistemare la lavastoviglie".

**Cosa NON fa ancora** (vedi §11):
- Foto e firma digitale sugli item
- Alert engine M.F integrato (nessun checker `cucina_*`/`tasks_*` registrato in `alert_engine.py` — verificato 2026-08-03)
- Export PDF registro HACCP (il report JSON c'è, il PDF è l'iterazione I.4)
- Corrective action automatico su FAIL
- Frequenze settimanale/mensile (`FREQUENZE = {"GIORNALIERA"}` in `tasks_schema.py:13`)
- Notifiche push / WA su checklist in scadenza

---

# 2. Entità principali

## 2.1 DB Task Manager

**DB dedicato:** `tasks.sqlite3` nel path tenant-aware `locali/<TRGB_LOCALE>/data/` (via `locale_data_path`, R6.5 — `app/models/tasks_db.py:27`). Nato come `app/data/cucina.sqlite3` (mig 084), rinominato `tasks.sqlite3` dalla mig 086, spostato nel path locale a R6.5. Connessione con WAL + `synchronous=NORMAL` + `busy_timeout` 30s (fix 1.11.2, sessione 52).

| Tabella | Scopo |
|---------|-------|
| `checklist_template` | Definizione ricorrente (nome, reparto, turno, `ora_scadenza_entro`, attivo, `livello_cucina`) |
| `checklist_item` | Voci del template ordinate (CHECKBOX / NUMERICO / TEMPERATURA / TESTO) |
| `checklist_instance` | Istanza generata dallo scheduler per un giorno (UNIQUE su `template+data+turno`; copia denormalizzata di `reparto` e `livello_cucina`) |
| `checklist_execution` | Esito singola voce (OK / FAIL / SKIPPED / PENDING), UNIQUE su `instance+item`, upsert |
| `task_singolo` | Task non ricorrente con priorità, reparto, assegnato, scadenza, `livello_cucina`, `origine`/`ref_modulo`/`ref_id` |
| `task_alert_log` | **Scaffold V1** (vuoto) — ex `cucina_alert_log`, rinominata dalla mig 086 |

`init_tasks_db()` (`tasks_db.py:41`) è l'init difensivo al boot: CREATE IF NOT EXISTS **con schema completo post-088** + mappa `HEAL_COLUMNS` che ri-aggiunge `livello_cucina` se manca (v1.3, 2026-07-19, lezione TASKS-1 — vedi §7).

## 2.2 DB Lista Spesa

**Tabella `lista_spesa_items` in `foodcost.db`** (via `get_foodcost_connection` — `lista_spesa_router.py:28`), creata dalla mig 105. Campi: titolo, quantita_libera, urgente, fatto, fornitore_freeform, `ingredient_id` FK nullable (predisposto per Fase 2, UI non fatta), note, created_by/completato_da/created_at/completato_at.

## 2.3 Ciclo di vita di un'istanza

```
APERTA  ──  primo tap-to-complete  ──▶  IN_CORSO
   │                                        │
   │ scadenza_at passata                    │ POST /completa
   ▼                                        ▼
SCADUTA                                COMPLETATA  (score calcolato)
   │
   └─── oppure SALTATA (con motivo, admin/brigata)
```

## 2.4 Ciclo di vita di un task singolo

```
APERTO  ──▶  IN_CORSO  ──▶  COMPLETATO (con note)
   │
   ├─ data_scadenza < oggi ──▶ SCADUTO (auto su read)
   └─ ANNULLATO (via PUT stato)
```

---

# 3. Scheduler giornaliero

File: `app/services/tasks_scheduler.py` (ex `cucina_scheduler.py`, rinominato Phase B)

- **`genera_istanze_per_data(conn, data)`** — per ogni template attivo GIORNALIERA crea un'istanza (`INSERT OR IGNORE` → idempotente), copiando `reparto` e `livello_cucina` dal template. Calcola `scadenza_at` combinando data + `ora_scadenza_entro`. Orari 00:00–03:59 interpretati come giorno successivo (chiusura oltre mezzanotte).
- **`genera_istanze_range(conn, da, a)`** — loop sul range.
- **`check_scadenze(conn)`** — marca SCADUTE le istanze APERTA/IN_CORSO con `scadenza_at < NOW`.
- **`calcola_score_compliance(conn, instance_id)`** — `100 × count(OK) / count(items)`. FAIL e SKIPPED contano 0.
- **`trigger_scheduler(days_ahead=1)`** — chiamato fire-and-forget da `GET /dashboard/home` a ogni apertura Home (`dashboard_router.py:1524`). Idempotente.

**Niente sveglia autonoma:** lo scheduler gira "pigramente" su GET di `/dashboard/home`, `GET /tasks/agenda/` (genera anche le istanze del giorno richiesto) e via endpoint admin `/tasks/scheduler/*`. Sufficiente per un locale che apre ogni giorno. Conseguenza pratica (vista con TASKS-1): se nessuno apre il modulo e nessun template è attivo, il registro resta vuoto senza che nessun alert lo segnali.

---

# 4. Endpoint

Tutti richiedono JWT. Prefissi reali: **`/tasks`** (non più `/cucina`), `/haccp`, `/lista-spesa`. Ruoli (vedi §10 per la parità della brigata):
- **admin/superadmin** → tutto
- **chef** → tutto tranne CRUD template (legge/esegue); vede tutti i livelli
- **sous_chef / commis** → come chef ma filtro auto server-side sul proprio `livello_cucina` + anti-escalation sulle scritture
- **sala** → agenda, istanze, task (nessun accesso ai template: 403)
- **viewer** → sola lettura (middleware globale blocca le scritture)

## 4.1 Template (`tasks_router.py`)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/tasks/templates/` | admin, brigata | Filtri: `reparto`, `turno`, `attivo`, `livello_cucina`. Per sous_chef/commis filtro auto sul livello (`tasks_router.py:226`) |
| GET | `/tasks/templates/{id}` | admin, brigata | Dettaglio + items; 404 se livello superiore al proprio (`:278`) |
| POST | `/tasks/templates/` | admin | Crea template + items (`:306`) |
| PUT | `/tasks/templates/{id}` | admin | Modifica; `items` presente = replace-all (`:348`) |
| DELETE | `/tasks/templates/{id}` | admin | Cascade FK su items / instances / executions (`:409`) |
| POST | `/tasks/templates/{id}/duplica` | admin | Copia con `attivo=0`, suffisso "(copia)" (`:429`) |

## 4.2 Agenda

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/tasks/agenda/` | tutti | `data=YYYY-MM-DD`, `turno`, `reparto` opzionali. Lazy: genera istanze del giorno + marca scadute. Ritorna `{data, turni[], tasks[]}` (`:602`) |
| GET | `/tasks/agenda/settimana` | tutti | `data_inizio=YYYY-MM-DD` + `reparto`; 7 giorni con istanze e task (`:704`) |
| POST | `/tasks/agenda/genera` | admin | `{data_da, data_a}` max 62 gg (`:773`) |

## 4.3 Instance / Execution

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/tasks/instances/{id}` | tutti | Dettaglio + items denormalizzati; 404 per brigata se livello superiore (`:799`) |
| POST | `/tasks/instances/{id}/assegna` | tutti (no viewer) | `{user}`; rifiuta se COMPLETATA/SALTATA (`:821`) |
| POST | `/tasks/instances/{id}/completa` | tutti (no viewer) | Calcola e salva score (`:847`) |
| POST | `/tasks/instances/{id}/salta` | admin, brigata | `{motivo}` (`:874`) |
| POST | `/tasks/execution/item/{item_id}/check` | tutti (no viewer) | `{instance_id, stato OK/FAIL/SKIPPED, valore_numerico?, valore_testo?, note?}`. Upsert; APERTA→IN_CORSO al primo check; rifiuta su COMPLETATA/SALTATA/SCADUTA (`:905`) |

## 4.4 Task singoli

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/tasks/tasks/` | tutti | Filtri: `user`, `data`, `stato`, `reparto`, `livello_cucina`. Auto-scadenza su read (`:1061`) |
| POST | `/tasks/tasks/` | tutti (no viewer) | `origine=MANUALE`. Forza `livello_cucina=NULL` se `reparto != cucina`; anti-escalation (`:1134`) |
| PUT | `/tasks/tasks/{id}` | tutti (no viewer) | Blocca update su COMPLETATO salvo passare `stato` (riapertura); anti-escalation (`:1183`) |
| POST | `/tasks/tasks/{id}/completa` | tutti (no viewer) | `{note_completamento?}` (`:1251`) |
| DELETE | `/tasks/tasks/{id}` | admin, brigata | Anti-escalation sul livello (`:1294`) |

## 4.5 Scheduler (admin)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| POST | `/tasks/scheduler/genera-giornaliere` | admin | Oggi + domani, idempotente (`:980`) |
| POST | `/tasks/scheduler/check-scadute` | admin, brigata | Marca SCADUTE (`:996`) |

## 4.6 Report HACCP (`haccp_router.py`, Modulo I sessione 59 cont.)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/haccp/report/recent-events` | JWT | `?giorni=7` (1-90). Eventi critici recenti (TEMPERATURA/NUMERICO fuori [min,max]) per widget (`haccp_router.py:32`) |
| GET | `/haccp/report/{anno}/{mese}` | JWT | Report mensile aggregato read-only: KPI (compliance %, item OK/FAIL/SKIPPED, eventi critici, task singoli), breakdown per reparto, compliance giornaliera, top 5 item FAIL, max 50 eventi critici, giornate senza dati. Mese futuro → 400 (`:45`) |

Service: `app/services/haccp_report_service.py` — legge `tasks.sqlite3`. Il PDF firmabile (WeasyPrint) è previsto come iterazione I.4, non implementato.

## 4.7 Lista Spesa (`lista_spesa_router.py`, Modulo J Fase 1 sessione 59 cont. c)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/lista-spesa/items/` | JWT | Filtri `stato=tutti\|da_fare\|fatti`, `solo_urgenti`, `fornitore` (LIKE), `limit`. Ritorna `{items[], kpi{tot, da_fare, fatti, urgenti_aperti}}` (`lista_spesa_router.py:61`) |
| POST | `/lista-spesa/items/` | JWT | Crea item (`:123`) |
| PUT | `/lista-spesa/items/{id}` | JWT | Update parziale; toggle `fatto` scrive/pulisce `completato_at/da` (`:151`) |
| DELETE | `/lista-spesa/items/{id}` | JWT | Elimina singolo (`:203`) |
| DELETE | `/lista-spesa/items/` | JWT | Bulk delete dei completati ("svuota lista") (`:215`) |

Fase 2+ rimandata (roadmap C.10-C.14): FK ingrediente + storico prezzi, vista per fornitore + WA, generazione da menu pranzo, template ricorrenti, workflow ordinato/ricevuto.

## 4.8 Dashboard Cucina (platform, `dashboard_router.py`)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/dashboard/cucina` | JWT | Vista operativa chef: pranzo di oggi + prossimi 7gg, carta cliente attiva (edizione `in_carta` + count publications), alert allergeni, KPI ricette (attive/basi/piatti/senza prezzo), ricette modificate 7gg, ingredienti senza prezzo (`dashboard_router.py:1572`). Legge **foodcost.db**, non tasks.sqlite3 |

⚠️ **Trailing slash obbligatorio** su root dei gruppi (`/tasks/templates/`, `/tasks/agenda/`, `/tasks/tasks/`, `/lista-spesa/items/`) — senza slash FastAPI fa 307 e il browser perde l'header `Authorization`.

---

# 5. Frontend

## 5.1 Task Manager — `frontend/src/pages/tasks/`

Route protette con `module="tasks"` (`App.jsx:504-513`):

| File | Rotta | Sub modules.json | Note |
|------|-------|------|------|
| `TasksHome.jsx` | `/tasks` | — | 4 card KPI + istanze del giorno + task; `StatoBadge` inline |
| `Nav.jsx` | (componente condiviso) | — | Responsive: top-nav sm+, bottom tab bar iOS-style `<sm` con sheet "Altri" (P2-BIS, sessione 44) |
| `AgendaGiornaliera.jsx` | `/tasks/agenda` | `agenda` | Istanze per turno + task del giorno, filtro reparto |
| `AgendaSettimana.jsx` | `/tasks/agenda/settimana` | `agenda` | Griglia 7 giorni |
| `InstanceDetail.jsx` | `/tasks/instances/:id` | `agenda` | Tap-to-complete: modali brand, progress ring SVG, state-bar, numpad IT, footer safe-area (P1, sessione 44) |
| `TaskList.jsx` | `/tasks/tasks` | `tasks` | Mobile-first iPhone: FAB, pills stato, swipe-left completa, bottom-sheet (P2-BIS, sessione 44) |
| `TaskNuovo.jsx` | (modale/full-screen da TaskList) | — | Create/edit; full-screen su mobile |
| `TemplateList.jsx` | `/tasks/templates` | `templates` | Lista template (admin/chef) |
| `TemplateEditor.jsx` | `/tasks/templates/nuovo` e `/:id` | `templates` | Editor items ▲▼ (solo admin per salvare) |
| `ReportHACCP.jsx` | `/tasks/haccp` | `haccp` | Report mensile: compliance, eventi critici, top FAIL, gap (Modulo I) |

Componente condiviso: `frontend/src/components/tasks/TaskSheet.jsx` — bottom-sheet dettaglio/completamento task.

**Redirect legacy** `/cucina/*` → `/tasks/*` (`App.jsx:516-523`) per i bookmark utenti.

Nota: `pages/tasks/` ospita anche `SceltaMacellaio/SceltaSalumi/SceltaFormaggi.jsx` per retrocompatibilità storica — sono modulo **Selezioni del Giorno**, documentate in [modulo_selezioni_giorno.md](modulo_selezioni_giorno.md).

## 5.2 Modulo cucina — `frontend/src/pages/cucina/`

Route protette con `module="ricette"` (stanno sotto "Gestione Cucina" nel menu):

| File | Rotta | Sub | Note |
|------|-------|-----|------|
| `DashboardCucina.jsx` | `/cucina/dashboard` | `cucina_dashboard` | Vista operativa chef su `GET /dashboard/cucina`; `RicetteNav`; palette orange (`App.jsx:318`) |
| `ListaSpesa.jsx` | `/cucina/spesa` | `spesa` | CRUD lista spesa su `/lista-spesa/items/` (`App.jsx:321`) |

`MenuCartaElenco.jsx` / `MenuCartaDettaglio.jsx` vivono nella stessa cartella ma sono modulo **Menu Carta** → [modulo_menu_carta.md](modulo_menu_carta.md).

## 5.3 Menu e config

- `modulesMenu.js` — voce `tasks` "Task Manager" 📋 palette indigo, sub: Agenda giornaliera, Agenda settimana, Task, Report HACCP, Template (admin). "Dashboard Cucina" e "Lista Spesa" sono sub della voce `ricette` "Gestione Cucina" 📘 orange.
- `modules.json` (store tenant-aware `locali/<id>/data/`, letto da `modules_router.py:27`): modulo `tasks` roles `superadmin/admin/chef/sous_chef/commis/sala/viewer`; sub `agenda` (tutti), `tasks` (tutti tranne viewer), `haccp` (superadmin/admin/chef/sous_chef), `templates` (superadmin/admin/chef/sous_chef/commis).
- `config/reparti.js` — `REPARTI` (cucina 🍳 red, bar 🍸 amber, sala 🍽️ rose, pulizia 🧹 emerald, manutenzione 🔧 slate) + `LIVELLI_CUCINA` (chef 👨‍🍳 red, sous_chef 🥘 orange, commis 🔪 yellow) + helper `getReparto` / `getLivelloCucina`.

---

# 6. Convenzioni UI

- **Palette Task Manager:** rosso (fornelli/fuoco) dentro le pagine (`Nav.jsx`: border-red, attivo `bg-red-100 text-brand-red`); icona menu dropdown però 📋 indigo (`modulesMenu.js`).
- **Palette Dashboard Cucina / Lista Spesa:** orange (coordinata con "Gestione Cucina").
- **Sfondo:** `bg-brand-cream`
- **Touch target:** min 44pt, bottoni azione 48pt, tasti numpad 60pt; safe-area inset su tab bar e footer.
- **Stati istanza (visuale attuale in `TasksHome.jsx:276`):**
  - APERTA → brand-cream neutro
  - IN_CORSO → blu
  - COMPLETATA → verde
  - SCADUTA → rosso
  - SALTATA → neutro line-through
- **Numpad touch** per TEMPERATURA/NUMERICO con range atteso in cima; fuori range → warning live e FAIL con nota.
- **Doppio target device:** iPad (landscape) = flusso checklist/istanza; iPhone (portrait) = flusso task singoli, mobile-first (implementato P2-BIS, vedi §11).
- **M.I primitives:** le pagine tasks usano `Btn`/`EmptyState` da `components/ui` (`@version v1.1-mattoni`).

---

# 7. Template: seed storici e stato attuale (incidente TASKS-1)

## 7.1 Seed storici (non più presenti nel DB live)

- **Mig 084** creava 3 template demo, tutti `attivo=0`: Apertura cucina (5 CHECKBOX, entro 10:30), Chiusura cucina (4 CHECKBOX + 2 TEMPERATURA 0..4°C, entro 23:45), Pulizia bar fine giornata (4 CHECKBOX, entro 00:30).
- **Mig 097** (sessione 57, `TRGB_SPECIFIC=True` — saltata se `TRGB_LOCALE != "tregobbi"`) importava i **5 template MEP fissi** dal docx `Checklist_Cucina_Primavera_2026`: MEP · Basi & Fondi (09:00) e MEP · Partita Antipasti / Primi / Secondi / Contorni (11:30), tutti CHECKBOX, `attivo=0`, `livello_cucina=NULL`.

## 7.2 Incidente TASKS-1 (2026-07-19) — cosa è successo e stato attuale

> Dettaglio completo in [problemi.md](problemi.md) § TASKS-1.

Il `tasks.sqlite3` vivo in `locali/tregobbi/data/` **non è il file storico**: è stato ricreato da zero da `init_tasks_db()` (schema pre-088) nel giro dell'incidente R6.5 S60-INC1 (inizio maggio). Conseguenze:

1. **Schema drift** — mancava `livello_cucina` su 3 tabelle → 500 su `POST /tasks/templates/` e sul generatore MEP di Menu Carta da maggio a luglio. **Sanato** il 2026-07-19 con:
   - **mig 155** (`155_selfheal_tasks_schema.py`) — ri-esegue il self-heal della 088 sul DB vivo (PRAGMA check + ADD COLUMN + indice, idempotente);
   - **`tasks_db.py` v1.3** — l'init difensivo ora include le colonne nel CREATE **e** ha la mappa `HEAL_COLUMNS` post-CREATE (`tasks_db.py:164`), così questa classe di drift non si ripresenta. Regola: ogni colonna aggiunta da migrazioni successive alla 084 va dichiarata ANCHE lì.
2. **Dati persi, non recuperabili** — 0 template nel DB: spariti i 3 demo (084), i 5 MEP fissi (097) e le checklist HACCP configurate ad aprile. Le migrazioni sono marcate applicate e non rigirano.

**Stato attuale del meccanismo template:**
- I **template MEP "carta"** si rigenerano dal modulo Menu Carta: `POST /menu-carta/editions/{id}/generate-mep` (fatto post-155 per l'edizione Estate 2026) — documentato in [modulo_menu_carta.md](modulo_menu_carta.md).
- I **template HACCP apertura/chiusura** vanno ricreati a mano da Task Manager → Template (decisione PO in problemi.md: propensione (a) MEP carta + eventualmente (b) HACCP a mano quando serve; il re-import (c) della 097 richiederebbe rilancio manuale ed è legato al menu Primavera, ormai superato).
- Lo scheduler è invariato: finché non esistono template `attivo=1`, non genera nulla e il registro HACCP resta vuoto (il report mensile mostra tutte "giornate senza dati").

---

# 8. Integrazione con altri moduli

| Modulo | Come |
|--------|------|
| **Dashboard Home** (platform) | Trigger fire-and-forget dello scheduler su ogni `GET /dashboard/home` (`dashboard_router.py:1524`) |
| **La Lavagna** (platform) | Il briefing di servizio in Home/DashboardSala include i titoli dei task del giorno (APERTO/SCADUTO, max 6) letti da `task_singolo` (`app/services/lavagna_service.py:289`). La Lavagna è servizio platform, non capability di questo modulo |
| **Menu Carta** | Il generatore MEP scrive `checklist_template` "MEP ·" in tasks.sqlite3 per l'edizione (`menu_carta_router.py:891`) → [modulo_menu_carta.md](modulo_menu_carta.md) |
| **Ricette / Gestione Cucina** | Dashboard Cucina e Lista Spesa vivono sotto la voce menu "Gestione Cucina" (module `ricette` nelle route FE) |
| **Notifiche (M.A)** | NON usato, previsto V1 per alert scadenze imminenti |
| **Alert Engine (M.F)** | NON usato: nessun checker registrato per tasks/cucina (verificato in `alert_engine.py`) — previsto V1 (`cucina_checklist_pending`) |
| **Dipendenti** | `assegnato_user` è username string libero, non FK — integrazione anagrafica è evolutivo V1 (dipendenza opzionale dichiarata nel manifest task_manager) |
| **Pranzo di lavoro** | Modulo separato ([modulo_pranzo.md](modulo_pranzo.md)); la Dashboard Cucina ne mostra lo stato del giorno |

**Module loader (R8):** i router sono montati condizionalmente via `_mount()` (`main.py:616`) in base a `locali/<id>/moduli_attivi.json` + manifest `core/moduli/{task_manager,cucina}/module.json`.

---

# 9. Phase A.2 — Livelli cucina (chef / sous_chef / commis)

> **Sessione 46 (2026-04-18).** Sotto-categorizzazione dei task della cucina per livello di brigata. Decisione: **opzione B gerarchica** — campo `livello_cucina` nullable, attivo SOLO se `reparto='cucina'`. NULL = "tutta la brigata cucina".

## 9.1 Modello dati

**Campo:** `livello_cucina TEXT NULL` su 3 tabelle (DB `tasks.sqlite3`): `task_singolo`, `checklist_template`, `checklist_instance`.

**Valori ammessi:** `chef`, `sous_chef`, `commis` (`LIVELLI_CUCINA` in `tasks_schema.py:15`). NULL = tutta la brigata.

**Vincolo cross-field:** `livello_cucina` può essere NOT NULL solo se `reparto='cucina'`. Validato backend (model_validator Pydantic + check nel router) e FE (UI nasconde il dropdown).

**Backward compat:** task esistenti con `livello_cucina=NULL` → comportamento "tutta la brigata".

## 9.2 File chiave

**Backend:**
- `app/migrations/088_livello_cucina.py` — pattern self-heal (PRAGMA check prima di ALTER), idempotente. ⚠️ Ri-applicata al DB vivo dalla mig 155 dopo TASKS-1 (vedi §7.2)
- `app/schemas/tasks_schema.py` — costante `LIVELLI_CUCINA` + campo `Optional[str]` sugli schemi template/instance/task + validator anti-cross-reparto
- `app/routers/tasks_router.py` — POST/PUT/GET su `/tasks/tasks/` e `/tasks/templates/` accettano `livello_cucina`; GET supporta `?livello_cucina=...`

**Frontend:**
- `frontend/src/config/reparti.js` — `LIVELLI_CUCINA` con palette + `getLivelloCucina(key)` (chef red 👨‍🍳, sous_chef orange 🥘, commis yellow 🔪)
- `pages/tasks/TaskNuovo.jsx` + `TemplateEditor.jsx` — select "Livello (opzionale)" visibile solo se `reparto === "cucina"`; reset su cambio reparto
- `pages/tasks/TaskList.jsx` — filtro livello in sidebar + badge nelle card
- `components/tasks/TaskSheet.jsx` — badge livello, confirm su cambio reparto

**Versions:** modulo `tasks` bumpato 1.1 → 1.2.

---

# 10. Phase A.3 — Brigata cucina (ruoli utente reali)

> **Sessione 46 (2026-04-18).** `sous_chef` e `commis` diventano **ruoli utente reali**: l'admin assegna un utente al ruolo, il backend filtra automaticamente le liste in base al ruolo di chi guarda, i nuovi ruoli hanno parità di accesso ai moduli del chef.

## 10.1 Decisioni architetturali (scelta Marco)

- **Q1 — Permessi moduli:** parità con `chef`: `sous_chef` e `commis` vedono gli stessi moduli.
- **Q2 — Filtro task:** **automatico server-side**. Chef vede tutto cucina, `sous_chef` vede `livello_cucina IN ('sous_chef', NULL)`, `commis` vede `IN ('commis', NULL)`.

## 10.2 Modello dati

**Nessuna migrazione DB.** Gli utenti sono in `users.json` — path tenant-aware `locali/<TRGB_LOCALE>/data/users.json` (post R6.5 push 3, non più `app/data/`).

`VALID_ROLES` (`auth_service.py:236`):
```python
{"superadmin", "admin", "contabile", "chef", "sous_chef", "commis", "sommelier", "sala", "viewer"}
```

**Backward-compat totale:** utenti con ruolo `chef` funzionano come prima.

## 10.3 File chiave

**Backend:**
- `app/services/auth_service.py` — `VALID_ROLES` esteso + helper `is_cucina_brigade(role)` (`:253`, True per chef/sous_chef/commis)
- `app/routers/modules_router.py:30` — stessa estensione di `VALID_ROLES` (duplicazione pre-esistente, allineata)
- `modules.json` — dove c'è `"chef"` nei roles, aggiunti `"sous_chef"` e `"commis"`. ⚠️ NON toccare `modules.runtime.json` (auto-generato)
- `app/routers/tasks_router.py` — filtro auto su TUTTE le letture (templates, agenda giorno/settimana, instances, tasks) via `_livello_auto_for_role()` (`:61`):
  ```python
  if role == "sous_chef":  auto = "sous_chef"
  elif role == "commis":   auto = "commis"
  else:                    auto = None   # chef/admin: rispetta query param
  ```
  SQL generato sui task: `(livello_cucina IS NULL OR livello_cucina = ?)` — i task non-cucina hanno sempre `livello_cucina=NULL` per costruzione, quindi restano visibili senza clausole aggiuntive sul reparto. Sulle istanze la clausola usa `COALESCE(i.livello_cucina, t.livello_cucina)`.

## 10.4 Visibilità inter-reparto

`sous_chef`/`commis` vedono ANCHE i task di altri reparti (bar, sala, ecc.). Il filtro auto tocca SOLO la dimensione `livello_cucina`. Il ruolo definisce la brigata, non il reparto.

## 10.5 Anti-privilege escalation

- Query param `?livello_cucina=chef` da sous_chef → **ignorato silenziosamente** (il filtro auto prevale).
- POST/PUT: `sous_chef`/`commis` non possono creare/modificare task con livello superiore → 403 `"Non puoi assegnare task a un livello superiore al tuo"` (`_enforce_livello_write`, `tasks_router.py:86`).
- Accesso diretto per id a istanze/task cucina di livello superiore → **404** (stessa risposta di id inesistente, niente information leak — `_check_instance_visibility`, `:101`).
- `chef` può creare task a qualsiasi livello.

## 10.6 Frontend

- `GestioneUtenti.jsx` — ROLES esteso; ROLE_LABELS `🥘 Sous Chef`, `🔪 Commis`; palette orange/yellow.
- `LoginForm.jsx` — palette tile login coordinata.
- `TaskList.jsx` — se ruolo ∈ {sous_chef, commis} nasconde il dropdown livello (backend forza il filtro).
- `TaskNuovo.jsx` + `TemplateEditor.jsx` — dropdown livello limitato alle opzioni ammesse per ruolo (backend resta fonte di verità).

**Versions:** modulo `tasks` bumpato 1.2 → 1.3. (Il bump successivo a 1.4 coincide con l'adozione delle M.I primitives sulle pagine tasks — header `@version: v1.1-mattoni` su TasksHome/TaskList/Agende/TemplateEditor.)

---

# 11. Roadmap evolutiva post-MVP (stato aggiornato 2026-08-03)

> Le priorità P1/P2/P2-BIS descritte in dettaglio nella versione precedente di questa pagina (assorbite da `interventi_cucina_post_mvp.md`, 2026-05-08) sono state in gran parte **implementate in sessione 44**. Qui lo stato verificato sul codice; le voci operative restano in [roadmap.md](roadmap.md) §C.

## 11.1 ✅ FATTO — P1: refactor UX tap-to-complete (`InstanceDetail.jsx`, sessione 44)

Implementato come da mockup `docs/mockups/cucina_instance_mockup.html`: modali brand al posto di `window.prompt/confirm/alert`, progress ring SVG 84px, state-bar segmentata OK/FAIL, item cards con bordo sinistro per stato, numpad con range atteso + live warning fuori range + virgola decimale IT, footer fisso safe-area, breadcrumb + gobbette, toast brand (header `InstanceDetail.jsx:1-12`).

## 11.2 ✅ FATTO — P2-BIS: mobile-first iPhone (sessione 44)

- `Nav.jsx` responsive: bottom tab bar iOS-style `<sm` (Oggi/Settimana/Task/Menu-sheet), top-nav sm+.
- `TaskList.jsx`: FAB 56pt, pills stato scrollabili, card con bordo priorità, swipe-left "✓ Fatto", tap → `TaskSheet` bottom-sheet.
- `TaskNuovo.jsx`: full-screen mobile / modale sm+, footer sticky safe-area.
- `components/tasks/TaskSheet.jsx`: sheet dettaglio con azioni e sub-sheet note completamento.

## 11.3 ❌ APERTO — P2: gerarchia urgenza in TasksHome

`TasksHome.jsx` usa ancora lo `StatoBadge` inline con APERTA → `bg-brand-cream` (uguale allo sfondo, l'urgente "sparisce") — `TasksHome.jsx:276`. Il componente condiviso `StatoBadge` per stati checklist con APERTA amber + pallino pulse NON esiste (quello in `pages/prenotazioni/components/` è di un altro modulo). KPI cards e raggruppamento per turno restano nella versione MVP.

## 11.4 Stato voci V1

| Voce | Stato |
|---|---|
| Report/dashboard KPI storica HACCP | ✅ FATTO come Report HACCP mensile (Modulo I, §4.6), senza PDF |
| Dashboard operativa chef | ✅ FATTO come `GET /dashboard/cucina` + pagina (Modulo H, §4.8) — il vecchio `GET /cucina/stats` non è mai nato |
| Foto+firma su item FAIL | ❌ da fare |
| Checker M.F `cucina_checklist_pending` (notifica se alle 11 l'apertura non è completata) | ❌ da fare — dopo TASKS-1 sarebbe anche il guardrail contro registri silenziosamente vuoti |
| Frequenza settimanale/mensile | ❌ da fare (solo GIORNALIERA) |
| Corrective action automatica su TEMPERATURA fuori range | ❌ da fare (oggi il fuori-range è tracciato dal report HACCP, §4.6) |
| `assegnato_user` → dropdown dipendenti reali | ❌ da fare |

## 11.5 V2 (backlog)

- PDF export registro HACCP mensile (mattone M.B / WeasyPrint, iterazione I.4 citata in `haccp_router.py:10`)
- Notifiche WA al chef su scadenza imminente (mattone M.C)
- iPad kiosk mode senza header
- Drag & drop ordinamento items (ora bottoni ▲▼)
- Foto raccolte per item in galleria mensile per audit
- Lista Spesa Fase 2+ (roadmap C.10-C.14, vedi §4.7)

---

# 12. File principali

## Backend
- `app/routers/tasks_router.py` — 21 endpoint `/tasks/*` (template, agenda, instances, execution, scheduler, task singoli)
- `app/routers/haccp_router.py` — 2 endpoint `/haccp/report/*`
- `app/routers/lista_spesa_router.py` — 5 endpoint `/lista-spesa/items/*` (modulo cucina)
- `app/routers/dashboard_router.py` — `GET /dashboard/cucina` (platform) + trigger scheduler in `GET /dashboard/home`
- `app/models/tasks_db.py` — connessione WAL + init difensivo con self-heal colonne (v1.3)
- `app/schemas/tasks_schema.py` — Pydantic models + costanti enum (`FREQUENZE`, `REPARTI`, `TURNI`, `ITEM_TIPI`, `LIVELLI_CUCINA`, stati)
- `app/services/tasks_scheduler.py` — generazione istanze + check scadenze + score
- `app/services/haccp_report_service.py` — aggregati report mensile + eventi critici recenti
- `app/services/auth_service.py` — `VALID_ROLES` + `is_cucina_brigade()`
- Migrazioni: `084_cucina_mvp` (DDL+seed), `085_reparto_task` (multi-reparto), `086_rename_cucina_to_tasks` (rename DB+tabella), `087_tasks_db_self_heal` (fix incidente 18/04), `088_livello_cucina` (A.2), `097_import_mep_templates` (MEP fissi, TRGB-specific), `105_lista_spesa` (foodcost.db), `155_selfheal_tasks_schema` (post TASKS-1)

I file `app/routers/cucina_router.py`, `app/services/cucina_scheduler.py`, `app/schemas/cucina_schema.py`, `app/models/cucina_db.py` **non esistono più** (rinominati `tasks_*` in Phase B).

## Frontend
- `frontend/src/pages/tasks/*.jsx` — 10 file Task Manager (vedi §5.1; Scelta* sono di Selezioni del Giorno)
- `frontend/src/pages/cucina/DashboardCucina.jsx` + `ListaSpesa.jsx` — modulo cucina (vedi §5.2)
- `frontend/src/components/tasks/TaskSheet.jsx` — bottom-sheet
- `frontend/src/config/reparti.js` — `REPARTI` + `LIVELLI_CUCINA`
- `frontend/src/config/modulesMenu.js` — voce `tasks` (+ sub Dashboard Cucina/Lista Spesa sotto `ricette`)
- `frontend/src/config/versions.jsx` — `tasks` 1.4, `haccp` 1.0, `cucinaDashboard` 1.0, `listaSpesa` 1.0
- `frontend/src/App.jsx` — 9 route `/tasks/*` + 2 route `/cucina/{dashboard,spesa}` + redirect legacy

## Config / manifest
- `core/moduli/task_manager/module.json` — id, router, prefix, tabelle (checklist_*, task_singolo, task_alert_log)
- `core/moduli/cucina/module.json` — id, lista_spesa_router, tabelle lista_spesa_*
- `locali/<id>/data/modules.json` + `users.json` — store ruoli/utenti tenant-aware
- `.gitignore` riga `app/data/cucina/` — residuo legacy pre-R6.5, innocuo
