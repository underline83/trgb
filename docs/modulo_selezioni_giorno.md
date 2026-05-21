# Modulo Selezioni del Giorno — TRGB Gestionale

**Creato:** 2026-05-19 (audit autonomo — gap CRIT-2)
**Stato doc:** STUB strutturato. Da estendere in sessione docs dedicata.
**Modulo tecnico:** sub-modulo di `ricette` (per `core/moduli/<id>/module.json`)
**Backend prefix:** `/macellaio/`, `/salumi/`, `/formaggi/`, `/pescato/`, `/piatti-giorno/`
**Frontend route:** `/selezioni/*`
**Doc collegato:** `docs/modulo_ricette_foodcost.md` (modulo padre), `docs/modulo_vendite.md` (non confondere — quello è il modulo Cassa)

---

## 0. Disambiguazione (NOMEN-1)

⚠️ Non confondere con il modulo **Vendite/Cassa** (`docs/modulo_vendite.md`). Quello tratta corrispettivi, chiusure cassa, chiusure turno. Questo tratta **proposte cucina del giorno**: macellaio, salumi, formaggi, pescato, piatti del giorno.

---

## 1. Cos'è

Sotto-modulo di Ricette / FoodCost che gestisce le "Selezioni del Giorno": **5 categorie quasi-gemelle** di proposte cucina che lo chef propone giorno per giorno e il sommelier/sala mostra al cliente.

Le 5 categorie sono strutturalmente identiche (CRUD taglio + categoria + config + flag attivo/venduto) ma vivono in 5 router separati per chiarezza semantica nel routing FE.

---

## 2. Le 5 categorie

| Categoria | Router backend | Tabelle DB | Range capability audit |
|---|---|---|---|
| **Scelta del Macellaio** (carne) | `app/routers/scelta_macellaio_router.py` (~166-388) | `macellaio_*` | C-R-039 … C-R-043 |
| **Scelta dei Salumi** | `app/routers/scelta_salumi_router.py` (~200-476) | `salumi_*` | C-R-044 … C-R-048 |
| **Scelta dei Formaggi** | `app/routers/scelta_formaggi_router.py` (~206-513) | `formaggi_*` | C-R-049 … C-R-053 |
| **Scelta del Pescato** (pesce/crostacei/molluschi) | `app/routers/scelta_pescato_router.py` (~177-406) | `pescato_*` | C-R-054 … C-R-058 |
| **Piatti del Giorno** | `app/routers/piatti_giorno_router.py` (~174-407) | `piatti_giorno_*` (mig 107) | C-R-059 … C-R-062 |

> **Fonte di dettaglio capability:** `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` modulo Ricette §Sub-modulo Selezioni del Giorno.

---

## 3. Pattern comune ai 5 router

Ogni router espone (struttura ripetuta, da auditare endpoint-by-endpoint in sessione dedicata):

- `GET /` — lista taglio/scelta del giorno, filtrabile per data
- `POST /` — crea taglio/scelta
- `PUT /{id}` — modifica taglio
- `DELETE /{id}` — elimina taglio
- `GET /categorie` — lista categorie (sotto-tipi: bovino/maiale/agnello per macellaio, ecc.)
- `POST /categorie` — crea categoria
- `PUT /categorie/{id}` — modifica categoria
- `DELETE /categorie/{id}` — elimina categoria
- `GET /config` — configurazione (flag attivo/venduto, sort_order, visibilità)
- `PUT /config` — aggiorna configurazione

**Flag comuni (varianti):**
- `attivo` — il taglio è disponibile oggi
- `venduto` — il taglio è esaurito (resta in lista ma marcato)

---

## 4. Frontend

Pagine sotto `frontend/src/pages/selezioni/` (da auditare per inventario file completo). Pattern UI: lista filtrabile per categoria + form CRUD inline.

Sono pagine accessibili a chef (CRUD) e sala/sommelier (read-only) — autorizzazione tramite `Depends(get_current_user)` con check ruolo nei router.

---

## 5. Concetti chiave

- **Quotidianità**: a differenza delle ricette stabili (modulo Ricette/FoodCost padre), le Selezioni del Giorno hanno ciclo di vita giornaliero — vengono inserite la mattina, marcate venduto/esaurito durante il servizio.
- **No foodcost calcolato**: le Selezioni del Giorno non passano dal motore foodcost (sono proposte verbali, costo non calcolato in tempo reale). Vivono separate dalle `recipes` con foodcost.
- **Pescato è speciale**: include sotto-categorie distinte (pesce / crostacei / molluschi). Vedi `scelta_pescato_router.py` per dettaglio enum.
- **Piatti del Giorno** (mig 107) è la 5ª categoria aggiunta dopo, generalizza il pattern per piatti finiti (non solo materia prima).

---

## 6. Capability audit (sintesi — 24 capability)

Da `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md`:

- **C-R-039 … C-R-043** — Macellaio (5 capability: lista, CRUD taglio, CRUD categoria, config, flag venduto)
- **C-R-044 … C-R-048** — Salumi (5 capability, identico pattern + flag `attivo`)
- **C-R-049 … C-R-053** — Formaggi (5 capability, identico pattern)
- **C-R-054 … C-R-058** — Pescato (5 capability + sotto-categorie pesce/crostacei/molluschi)
- **C-R-059 … C-R-062** — Piatti del Giorno (4 capability — pattern semplificato, no categorie)

**Totale: 24 capability**, quasi-gemelle salvo per il dominio di applicazione.

---

## 7. Roadmap

Voci pendenti pertinenti a questo modulo (sintetizzate da `docs/roadmap.md` §R/C):

- Doc endpoint:linea completa per ognuno dei 5 router (estensione di questo stub)
- Pattern testa+tab per la pagina dettaglio (vedi `docs/controllo_design.md` §1)
- Eventuale generalizzazione DRY dei 5 router quasi-gemelli (S, low priority)

---

## 8. Riferimenti

- Audit canonico capability: `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` (modulo Ricette)
- Modulo padre: `docs/modulo_ricette_foodcost.md`
- Gap report origine: `docs/audit-2026-05-19/02_GAP_REPORT.md` CRIT-2
- Decisione PO Marco: 2026-05-19 (sessione "audit + riallineamento")
