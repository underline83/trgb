# Modulo Cucina — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-08 (consolidamento docs)
**Stato:** MVP rilasciato (sessione 43, 2026-04-17). Phase A.2 (livelli) e A.3 (brigata) implementate. Roadmap evolutiva V1+V2 in `roadmap.md` §C.
**Versione modulo (`versions.jsx`):** cucina v1.0 beta · tasks v1.3
**Roadmap:** sezione `C.` di `docs/roadmap.md`
**Documenti correlati:** `modulo_pranzo.md`, `modulo_menu_carta.md`, `modulo_selezioni.md`

---

# 0. Indice

1. Scopo del modulo
2. Entità principali (DB cucina)
3. Scheduler giornaliero
4. Endpoint
5. Frontend
6. Convenzioni UI
7. Seed iniziale (3 template demo)
8. Integrazione con altri moduli
9. Phase A.2 — Livelli cucina (chef / sous_chef / commis)
10. Phase A.3 — Brigata cucina (ruoli utente reali)
11. Roadmap evolutiva post-MVP (priorità da `interventi_cucina_post_mvp.md`)
12. File principali (BE + FE)

---

# 1. Scopo del modulo

Modulo per la gestione operativa di cucina e bar:

- **Checklist ricorrenti** — apertura, chiusura, HACCP, pulizie. Generate giornalmente dallo scheduler.
- **Task singoli** non ricorrenti — chiamate, consegne, riparazioni, micro-azioni quotidiane.

**Ruoli destinatari:**
- admin/superadmin/chef → pieno controllo
- sala → agenda + task
- viewer → solo lettura

**Cosa risolve:**
- **Tracciabilità HACCP**: ogni completamento ha utente, timestamp, valore numerico (temperature), eventuale nota.
- **Responsabilizzazione**: score di compliance calcolato a fine checklist (% di item OK).
- **Visibilità direzione**: agenda settimanale con pallini colorati stato, oggi evidenziato, scadute in rosso.
- **Task volanti**: posto unico per "chiama il pesce domani alle 8" o "sistemare la lavastoviglie".

**Cosa NON fa in MVP** (rimandato a V1, vedi §11):
- Foto e firma digitale
- Alert engine integrato (M.F esiste ma non è ancora agganciato)
- Dashboard KPI storica / export PDF
- Corrective action automatico su FAIL
- Frequenze settimanale/mensile (oggi solo giornaliera)
- Notifiche push / WA su checklist in scadenza

---

# 2. Entità principali

**DB dedicato:** `app/data/cucina.sqlite3` (6 tabelle).

| Tabella | Scopo |
|---------|-------|
| `checklist_template` | Definizione ricorrente (nome, reparto, turno, `ora_scadenza_entro`, attivo, `livello_cucina`) |
| `checklist_item` | Voci del template ordinate (CHECKBOX / NUMERICO / TEMPERATURA / TESTO) |
| `checklist_instance` | Istanza generata dallo scheduler per un giorno (UNIQUE su `template+data+turno`) |
| `checklist_execution` | Esito singola voce (OK / FAIL / SKIPPED / PENDING) |
| `task_singolo` | Task non ricorrente con priorità, assegnato, scadenza, `livello_cucina` |
| `cucina_alert_log` | **Scaffold V1** (vuoto in MVP) — log di alert inviati |

## 2.1 Ciclo di vita di un'istanza

```
APERTA  ──  primo tap-to-complete  ──▶  IN_CORSO
   │                                        │
   │ scadenza_at passata                    │ tutti gli item fatti
   ▼                                        ▼
SCADUTA                                COMPLETATA  (score calcolato)
   │
   └─── oppure SALTATA (con motivo, solo admin/chef)
```

## 2.2 Ciclo di vita di un task singolo

```
APERTO  ──▶  IN_CORSO  ──▶  COMPLETATO (con note)
   │
   ├─ data_scadenza < oggi ──▶ SCADUTO (auto su read)
   └─ admin/chef annulla ──▶ ANNULLATO
```

---

# 3. Scheduler giornaliero

File: `app/services/cucina_scheduler.py`

- **`genera_istanze_per_data(conn, data)`** — per ogni template attivo GIORNALIERA crea un'istanza (`INSERT OR IGNORE` → idempotente). Calcola `scadenza_at` combinando data + `ora_scadenza_entro`. Orari 00:00–03:59 sono interpretati come giorno successivo (chiusura oltre mezzanotte).
- **`check_scadenze(conn)`** — marca SCADUTE le istanze APERTA/IN_CORSO con `scadenza_at < NOW`.
- **`calcola_score_compliance(conn, instance_id)`** — `100 × count(OK) / count(items)`. FAIL e SKIPPED contano come 0.
- **`trigger_scheduler(days_ahead=1)`** — chiamato fire-and-forget da `/dashboard/home` ogni apertura Home. Idempotente.

**Niente sveglia autonoma:** lo scheduler gira "pigramente" su GET di `/dashboard/home`, `/cucina/agenda/*` e via endpoint admin `/cucina/scheduler/*`. Sufficiente per un locale che apre ogni giorno.

---

# 4. Endpoint

Tutti richiedono JWT. Ruoli (vedi anche §10 per parità sous_chef/commis):
- **admin/superadmin** → tutto
- **chef/sous_chef/commis** → tutto tranne CRUD template (può solo leggere/eseguire)
- **sala** → agenda, instances, tasks
- **viewer** → solo lettura (middleware backend blocca le scritture)

## 4.1 Template (CRUD)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/templates/` | admin, chef | Filtri: `reparto`, `turno`, `attivo` |
| GET | `/cucina/templates/{id}` | admin, chef | Dettaglio + items |
| POST | `/cucina/templates/` | admin | Crea template + items |
| PUT | `/cucina/templates/{id}` | admin | Modifica; `items` opzionale = replace-all |
| DELETE | `/cucina/templates/{id}` | admin | Cascade su items / instances / executions |
| POST | `/cucina/templates/{id}/duplica` | admin | Crea copia attivo=0, suffisso "(copia)" |

## 4.2 Agenda

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/agenda/` | tutti | `data=YYYY-MM-DD`, `turno=...` opzionali |
| GET | `/cucina/agenda/settimana` | tutti | `data_inizio=YYYY-MM-DD` (auto-shift al lunedì FE) |
| POST | `/cucina/agenda/genera` | admin | `{data_da, data_a}` max 62 gg |

## 4.3 Instance / Execution

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/instances/{id}` | tutti | Dettaglio + items denormalizzati |
| POST | `/cucina/instances/{id}/assegna` | tutti | `{user}` |
| POST | `/cucina/instances/{id}/completa` | tutti | Calcola score |
| POST | `/cucina/instances/{id}/salta` | admin, chef | `{motivo}` |
| POST | `/cucina/execution/item/{item_id}/check` | tutti | `{instance_id, stato, valore_numerico?, valore_testo?, note?}` |

## 4.4 Task singoli

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| GET | `/cucina/tasks/` | tutti | Filtri: `user`, `data`, `stato`, `livello_cucina`. Auto-scadenza su read |
| POST | `/cucina/tasks/` | tutti | `origine=MANUALE`. Forza `livello_cucina=NULL` se `reparto != cucina` |
| PUT | `/cucina/tasks/{id}` | tutti | Blocca update su COMPLETATO (serve stato=APERTO per riaprire) |
| POST | `/cucina/tasks/{id}/completa` | tutti | `{note_completamento?}` |
| DELETE | `/cucina/tasks/{id}` | admin, chef | |

## 4.5 Scheduler (admin)

| Metodo | Path | Ruoli | Note |
|--------|------|-------|------|
| POST | `/cucina/scheduler/genera-giornaliere` | admin | Oggi + domani |
| POST | `/cucina/scheduler/check-scadute` | admin, chef | Marca SCADUTE |

⚠️ **Trailing slash obbligatorio** su root dei gruppi (`/templates/`, `/agenda/`, `/tasks/`) — senza lo slash FastAPI fa 307 e il browser perde l'`Authorization` header.

---

# 5. Frontend

Tutte le pagine in `frontend/src/pages/cucina/`:

| File | Rotta | Ruoli |
|------|-------|-------|
| `CucinaHome.jsx` | `/cucina` | tutti |
| `CucinaNav.jsx` | (componente condiviso) | — |
| `CucinaAgendaGiornaliera.jsx` | `/cucina/agenda` | tutti |
| `CucinaAgendaSettimana.jsx` | `/cucina/agenda/settimana` | tutti |
| `CucinaInstanceDetail.jsx` | `/cucina/instances/:id` | tutti |
| `CucinaTaskList.jsx` | `/cucina/tasks` | tutti |
| `CucinaTaskNuovo.jsx` | (modal usato da TaskList) | — |
| `CucinaTemplateList.jsx` | `/cucina/templates` | admin, chef |
| `CucinaTemplateEditor.jsx` | `/cucina/templates/nuovo` e `/:id` | admin |

---

# 6. Convenzioni UI

- **Palette:** rosso (`bg-red-50/100`, `border-red-200/300/400`, `text-red-700/900`) — fornelli/fuoco, non collide con altri moduli
- **Sfondo:** `bg-brand-cream`
- **Icona menu:** 🍳
- **Touch target:** min 44pt, bottoni azione 48pt, numpad 60pt
- **Stati visivi:**
  - APERTA → cream neutro
  - IN_CORSO → blu
  - COMPLETATA → verde
  - SCADUTA → rosso scuro
  - SALTATA → neutro line-through
  - FAIL (item) → rosso chiaro
- **Numpad touch** per TEMPERATURA/NUMERICO con range atteso in cima; fuori range → FAIL automatico con nota

⚠️ **Doppio target device** (vedi §11 per le priorità mobile-first):
- **iPad** (landscape 1024-1366px) = flusso checklist/istanza, dispositivo fisso al banco
- **iPhone** (portrait 375-430px) = flusso task singoli, in tasca dei cuochi mentre cucinano. **Tutto ciò che riguarda i task DEVE essere mobile-first**.

---

# 7. Seed iniziale

La migrazione 084 crea 3 template di esempio, tutti `attivo=0`:

1. **Apertura cucina** (CUCINA / APERTURA, entro 10:30) — 5 item CHECKBOX
2. **Chiusura cucina** (CUCINA / CHIUSURA, entro 23:45) — 4 CHECKBOX + 2 TEMPERATURA (0..4°C)
3. **Pulizia bar fine giornata** (BAR / CHIUSURA, entro 00:30) — 4 item CHECKBOX

L'admin li attiva da `/cucina/templates`. Una volta attivi, il giorno dopo compaiono automaticamente nell'agenda.

---

# 8. Integrazione con altri moduli

| Modulo | Come |
|--------|------|
| **Dashboard Home** | Fire-and-forget trigger dello scheduler su ogni GET `/dashboard/home` (pattern M.F) |
| **Notifiche (M.A)** | NON USATO in MVP, previsto in V1 per alert scadenze imminenti |
| **Alert Engine (M.F)** | NON USATO in MVP, previsto in V1 con checker `cucina_checklist_pending` |
| **Dipendenti** | Il campo `assegnato_user` è username string libero, non FK — integrazione con anagrafica dipendenti è evolutivo V1 |
| **Pranzo di lavoro** | Modulo separato (`modulo_pranzo.md`), parallelo |
| **Menu Carta** | Modulo separato (`modulo_menu_carta.md`), parallelo |

---

# 9. Phase A.2 — Livelli cucina (chef / sous_chef / commis)

> **Sessione 46 (2026-04-18).** Sotto-categorizzazione dei task della cucina per livello di brigata. Decisione: **opzione B gerarchica** — campo `livello_cucina` nullable, attivo SOLO se `reparto='cucina'`. NULL = "tutta la brigata cucina".

## 9.1 Modello dati

**Campo nuovo:** `livello_cucina TEXT NULL` su 3 tabelle (DB `tasks.sqlite3`):
- `task_singolo`
- `checklist_template`
- `checklist_instance`

**Valori ammessi:** `chef`, `sous_chef`, `commis`. NULL = tutta la brigata.

**Vincolo cross-field:** `livello_cucina` può essere NOT NULL solo se `reparto='cucina'`. Su altri reparti deve restare NULL. Validato sia backend (Pydantic validator) che FE (UI nasconde il dropdown).

**Backward compat:** task esistenti hanno `livello_cucina=NULL` → comportamento "tutta la brigata cucina" (equivalente a prima).

## 9.2 File chiave

**Backend:**
- `app/migrations/088_livello_cucina.py` — pattern self-heal (PRAGMA check prima di ALTER), idempotente
- `app/schemas/tasks_schema.py` — costante `LIVELLI_CUCINA = {"chef", "sous_chef", "commis"}` + campo `Optional[str]` su `ChecklistTemplateIn/Update/Out`, `ChecklistInstanceOut`, `TaskSingoloIn/Update/Out` + validator anti-cross-reparto
- `app/routers/tasks_router.py` — POST/PUT/GET su `/tasks/tasks/` e `/tasks/templates/` accettano `livello_cucina`. GET supporta query param `?livello_cucina=...`

**Frontend:**
- `frontend/src/config/reparti.js` — costante `LIVELLI_CUCINA` con palette + helper `getLivelloCucina(key)`:
  - chef → red palette + 👨‍🍳
  - sous_chef → orange + 🥘
  - commis → yellow + 🔪
- `frontend/src/pages/tasks/TaskNuovo.jsx` + `TemplateEditor.jsx` — select secondario "Livello (opzionale)" con CSS transition, visibile solo se `reparto === "cucina"`. `useEffect` su cambio reparto: se non cucina → reset livello
- `frontend/src/pages/tasks/TaskList.jsx` — sidebar filtri con `<select>` "Livello cucina" condizionale + badge nella card sotto/accanto al badge reparto
- `frontend/src/components/tasks/TaskSheet.jsx` — badge livello sotto reparto, confirm "Il livello verrà rimosso" su cambio reparto inline

**Versions:** modulo `tasks` bumpato da 1.1 → 1.2.

---

# 10. Phase A.3 — Brigata cucina (ruoli utente reali)

> **Sessione 46 (2026-04-18).** Phase A.2 ha introdotto `livello_cucina` sui task. Ora `sous_chef` e `commis` diventano **ruoli utente reali**: l'admin assegna un utente al ruolo corretto, il backend filtra automaticamente la lista task in base al ruolo di chi guarda, i nuovi ruoli hanno parità di accesso ai moduli del chef.

## 10.1 Decisioni architetturali (scelta Marco)

- **Q1 — Permessi moduli:** parità con `chef`. `sous_chef` e `commis` vedono **gli stessi moduli** del chef attuale. Tagli granulari in futuro.
- **Q2 — Filtro task:** **filtro automatico server-side**. Chef vede tutto cucina, `sous_chef` vede `livello_cucina IN ('sous_chef', NULL)`, `commis` vede `IN ('commis', NULL)`.

## 10.2 Modello dati

**Nessuna migrazione DB.** Gli utenti sono in `app/data/users.json` (file, non SQLite).

`VALID_ROLES` esteso da:
```python
{"superadmin", "admin", "contabile", "chef", "sommelier", "sala", "viewer"}
```
a:
```python
{"superadmin", "admin", "contabile", "chef", "sous_chef", "commis", "sommelier", "sala", "viewer"}
```

**Backward-compat totale:** utenti esistenti con ruolo `chef` continuano a funzionare esattamente come prima. Solo gli utenti a cui l'admin assegna esplicitamente `sous_chef` o `commis` cambiano comportamento.

## 10.3 File chiave

**Backend:**
- `app/services/auth_service.py` — `VALID_ROLES` esteso + helper `is_cucina_brigade(role: str) -> bool` (True per chef/sous_chef/commis)
- `app/routers/modules_router.py` — stessa estensione di `VALID_ROLES` (duplicazione pre-esistente, lasciata allineata)
- `app/data/modules.json` — ovunque c'è `"chef"` nei `roles` (livello modulo + sub-modulo), aggiunti `"sous_chef"` e `"commis"`. ⚠️ **NON toccare** `app/data/modules.runtime.json` (auto-generato)
- `app/routers/tasks_router.py` — filtro auto su letture (`/tasks/tasks/`, `/tasks/agenda/`, `/tasks/instances/` e simili):
  ```python
  role = current_user["role"]
  if role == "sous_chef":
      query_livelli = ["sous_chef", None]
  elif role == "commis":
      query_livelli = ["commis", None]
  else:
      query_livelli = None  # chef, admin, superadmin: rispetta query param
  ```
  Generated SQL:
  ```sql
  WHERE (reparto = 'cucina' AND (livello_cucina = 'sous_chef' OR livello_cucina IS NULL))
     OR reparto != 'cucina'   -- task non-cucina sempre visibili
  ```

## 10.4 Visibilità inter-reparto

**Decisione:** `sous_chef`/`commis` vedono ANCHE i task di altri reparti (bar, sala, ecc.) se l'admin glieli assegna. Il filtro auto tocca SOLO la dimensione `livello_cucina` per i task cucina. Il ruolo definisce la brigata, non il reparto.

## 10.5 Anti-privilege escalation

- Se `sous_chef` passa manualmente `?livello_cucina=chef`, il backend **IGNORA silenziosamente** (override con il filtro auto).
- Stesso pattern su POST/PUT: `sous_chef` NON può creare/modificare un task con `livello_cucina='chef'`. → 403 `"Non puoi assegnare task a un livello superiore al tuo"`.
- `commis` idem: può creare task solo con `livello_cucina IN ('commis', None)`.
- `chef` può creare task a qualsiasi livello.

## 10.6 Frontend

- `GestioneUtenti.jsx` — ROLES esteso: `["admin", "chef", "sous_chef", "commis", "sommelier", "sala", "viewer"]`. ROLE_LABELS: `🥘 Sous Chef`, `🔪 Commis`. Palette `sous_chef` orange, `commis` yellow.
- `LoginForm.jsx` — palette tile login coordinata.
- `TaskList.jsx` — se user.role ∈ {sous_chef, commis} → nasconde dropdown "Livello cucina" (il backend forza il filtro). Hint header: "Visualizzi i task della tua brigata".
- `TaskNuovo.jsx` + `TemplateEditor.jsx` — validazione FE anti-escalation: dropdown livello limitato a opzioni ammesse per ruolo. Backend è fonte di verità, FE è UX.

**Versions:** modulo `tasks` bumpato da 1.2 → 1.3.

---

# 11. Roadmap evolutiva post-MVP

> Riassunto delle priorità descritte in dettaglio precedentemente in `interventi_cucina_post_mvp.md` (assorbito qui 2026-05-08). Le voci concrete per la roadmap operativa sono in `roadmap.md` §C.

## 11.1 Priorità 1 — `CucinaInstanceDetail.jsx`: refactor UX tap-to-complete

**Mockup:** `docs/mockups/cucina_instance_mockup.html`

Cosa fare:
1. **Rimuovere tutti `window.prompt`/`confirm`/`alert`** sostituiti con 4 modali brand-style (`<ModalTesto>`, `<ModalSalta>`, `<ModalMancanti>`, `<ModalAssegna>`).
2. **Progress ring 84px** nell'header card (SVG inline, raggio 36, stroke 8, verde TRGB al 100%, numero in Playfair 22 al centro, anim `stroke-dashoffset` 350ms).
3. **State-bar segmentata** sotto l'header: barra orizzontale 10px che mostra OK in verde + FAIL in rosso. Micro-testo `{ok} OK · {fail} FAIL · {pending} da fare`.
4. **Item cards ridisegnate**: bordo sx 4px colorato per stato, gradient solo a sx, nome in Playfair 16-17px, ordinale Playfair muted, chip tipo + chip "obbligatoria", range atteso in `font-mono` pill grigio, valore compilato Playfair 22 bold.
5. **Azioni per item**: 3 bottoni 56×56 rounded (CHECKBOX), pill 56pt + N.A. (TEMP/NUM), pill ✎ + N.A. (TESTO).
6. **Numpad modal**: display Playfair 36, box "range atteso" amber-50 sopra, live warning "⚠ Fuori range — sarà registrato come FAIL" sotto, griglia 3×5 tasti 60pt, virgola decimale italiana.
7. **Footer azioni**: `fixed bottom-0`, `safe-area-inset-bottom`, struttura `[👤 Assegna] [Salta…] [✓ Completa]` (primary 56pt, shadow rosso).
8. **Breadcrumb top** + **gobbette decorative** angolo head-card.
9. **Micro-toast brand** (`<Toast>` ink bg, white, rounded-xl, auto-hide 1800ms) per feedback OK/FAIL/N.A.

**Criteri accettazione:** usabile su iPad senza pinch-zoom, zero `window.prompt/confirm/alert`, completion 100% mostra toast "score 100%", item TEMP fuori range genera FAIL automatico con nota, viewer disabilitato silenzioso.

## 11.2 Priorità 2 — `CucinaHome.jsx`: gerarchia urgenza

Oggi APERTA usa `bg-brand-cream` (uguale allo sfondo) → urgente "sparisce", COMPLETATA è verde pieno. Gerarchia invertita.

Cosa fare:
1. **`StatoBadge` condiviso** (`components/cucina/StatoBadge.jsx`):
   - APERTA → amber-50 + pallino 🟡 pulse animato
   - IN_CORSO → blue-50
   - COMPLETATA → green-50 (più soft)
   - SCADUTA → red-100 (invariato)
   - SALTATA → neutral-100 line-through
2. **KPI cards armonizzate**: numero Playfair 700, accento gobbette strip 20% opacità in alto, card task con `border-red-400` se `scaduti > 0`.
3. **Lista istanze raggruppata per turno**: stesso item-card di InstanceDetail, chip score / chip scadenza al posto del "→".

## 11.3 Priorità 2-BIS — TaskList + TaskNuovo: mobile-first iPhone (**flusso critico**)

> Più importante della Priorità 3 stilistica. È un blocco **di esperienza**, non di stile.

**Mockup:** `docs/mockups/cucina_tasks_iphone_mockup.html`

Cosa fare:
1. **`CucinaNav` responsive**: `< sm` bottom tab bar iOS-style 4 tab (🍳 Oggi, 📅 Settimana, ✅ Task, ⚙️ Menu), `safe-area-inset-bottom`. `>= sm` nav top attuale. Tab "Menu" mobile apre sheet con Template + Scheduler.
2. **`CucinaTaskList` mobile-first**:
   - Header compatto: titolo Playfair 24 + bottone "+" 48pt rosso top-right
   - Filtri stato come **pills scrollabili orizzontalmente** (overflow-x-auto, no wrap)
   - Lista task: card full-width, bordo sx 4px per priorità (red/amber/neutral), nome Playfair 17, riga 2 chip stato + scadenza ⏱ + `@user`, min-height 72pt
   - **Swipe gesture**: swipe-left rivela ✓ Completa 56pt verde
   - Tap apre **bottom-sheet** con dettaglio (no swipe-only)
   - **FAB +** galleggiante 56pt rosso → full-screen modal nuovo task
3. **`CucinaTaskNuovo` full-screen mobile**: `fixed inset-0 bg-brand-cream`, header ← + Playfair 20, campi grandi 48pt, priorità pill 48pt, scadenza `type="date"`, footer fisso "Crea task" 56pt + safe-area
4. **`<TaskSheet>` bottom-sheet**: slide-up, drag handle, metadata + note, azioni in footer (Inizia/Completa/Riapri), tap fuori o swipe-down chiude

## 11.4 Priorità 3 — Dettaglio fattura → ricerca + filtri (decoupled, vedi `modulo_acquisti.md`)

Non strettamente cucina, ma dipendenza UI consistency.

## 11.5 Priorità 4-5+ — backlog di micro-fix UI

Dettagli storici non ricopiati qui (mockup + commit messages tracciano il resto). Si aprono quando necessario, dopo P1+P2+P2-BIS.

## 11.6 V1 (prossima sessione dedicata)

- Foto+firma su item FAIL (obbligatoria per HACCP)
- Checker `@register_checker("cucina_checklist_pending")` per M.F: notifica admin se alle 11:00 l'apertura non è completata
- Frequenza settimanale/mensile (es. "pulizia cappa" ogni lunedì)
- Corrective action automatica: se TEMPERATURA fuori range → task singolo auto-generato al chef
- Integrazione `assegnato_user` con tabella dipendenti (dropdown username attivi)
- Endpoint `GET /cucina/stats` per dashboard KPI

## 11.7 V2 (backlog)

- PDF export registro HACCP mensile (mattone M.B)
- Notifiche WA al chef su scadenza imminente (mattone M.C)
- iPad kiosk mode senza header (una sola istanza attiva mostrata fullscreen)
- Drag & drop ordinamento items (ora bottoni ▲▼)
- Foto raccolte per item in galleria mensile per audit

---

# 12. File principali

## Backend
- `app/migrations/084_cucina_mvp.py` — DDL 6 tabelle + 3 seed
- `app/migrations/088_livello_cucina.py` — Phase A.2
- `app/models/cucina_db.py` — connessione + init difensivo
- `app/schemas/cucina_schema.py` — Pydantic models + costanti enum
- `app/schemas/tasks_schema.py` — Phase A.2 (`LIVELLI_CUCINA`) + validator
- `app/routers/cucina_router.py` — 18 endpoint
- `app/routers/tasks_router.py` — Phase A.3 filtro auto + anti-escalation
- `app/services/cucina_scheduler.py` — generazione + check scadenze + score
- `app/services/auth_service.py` — Phase A.3 `VALID_ROLES` esteso + `is_cucina_brigade()`

## Frontend
- `frontend/src/pages/cucina/*.jsx` — 8 file (vedi §5)
- `frontend/src/pages/tasks/*.jsx` — TaskList, TaskNuovo, TemplateEditor con dropdown livello + filtri
- `frontend/src/components/tasks/TaskSheet.jsx` — bottom-sheet
- `frontend/src/config/reparti.js` — `LIVELLI_CUCINA` (Phase A.2)
- `frontend/src/config/modulesMenu.js` — voce `cucina`
- `frontend/src/config/versions.jsx` — `cucina v1.0 beta`, `tasks v1.3`
- `frontend/src/App.jsx` — 7 rotte protette

## Config
- `app/data/modules.json` — entry `cucina` con ruoli (chef, sous_chef, commis)
- `app/data/users.json` — utenti con ruolo (NON SQLite, file)
- `.gitignore` — `app/data/cucina/` (scaffold runtime futura)
