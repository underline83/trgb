# TRGB — Architettura Pattern (Registry)

> **Cosa**: registro centrale dei pattern uniformi che TUTTI i nuovi sviluppi devono seguire.
>
> **Scopo**: evitare di reinventare la ruota a ogni sessione. Quando si scrive codice nuovo, si controlla qui prima.
>
> **Mantenuto da**: il modulo guardiano. Aggiornato a ogni nuova convenzione.
>
> **Creato**: 2026-04-25 (sessione 57 cont.)

---

## 1. API Frontend → Backend

### Trailing slash OBBLIGATORIO sui router root
Endpoint con `@router.get("/")` su un router con prefix richiedono lo **slash finale** dal frontend.

```js
// SBAGLIATO
const r = await apiFetch(`${API_BASE}/vini/magazzino`);  // ❌ FastAPI fa 307 redirect
                                                          // → header Authorization perso → 401 → crash

// GIUSTO
const r = await apiFetch(`${API_BASE}/vini/magazzino/`);  // ✅
```

### URL mai hardcoded
```js
// SBAGLIATO
fetch("http://127.0.0.1:8000/vini/magazzino/")  // ❌

// GIUSTO
import { API_BASE, apiFetch } from "../config/api";
apiFetch(`${API_BASE}/vini/magazzino/`)  // ✅
```

### Auth: sempre via apiFetch
`apiFetch` inietta `Authorization: Bearer <token>`, gestisce 401 → logout, refresh token automatico ogni 30min.

---

## 2. Database SQLite

### WAL mode su tutti i DB
PRAGMA standard in ogni `get_*_connection()`:

```python
def get_xxx_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    return conn
```

**Why**: protegge da SIGTERM mid-write durante restart push.sh. Vedi memoria/feedback corruzioni S51-S53.

**Coverage attuale** (2026-04-25):
- ✅ vini_magazzino_db.py
- ✅ notifiche_db.py
- ✅ foodcost_db.py
- ✅ core/database.py (vini.sqlite3, vini_settings.sqlite3)
- ⏳ Da fare: bevande, clienti, tasks, settings, dipendenti, admin_finance (roadmap 1.11.2)

### Mai DDL su sqlite_master a regime
```python
# SBAGLIATO (scrittura su sqlite_master a ogni boot del router)
def init_xxx_database():
    conn.execute("CREATE TABLE IF NOT EXISTS new_table (...)")  # ❌

# GIUSTO (check prima)
def init_xxx_database():
    cur = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='new_table'")
    if not cur.fetchone():
        conn.execute("CREATE TABLE new_table (...)")  # ✅ una volta sola
```

### Mai transazioni lunghe se può arrivare un SIGTERM
```python
# SBAGLIATO: tutto in una transazione, SIGTERM mid-write → corrompe
def update_qualcosa(...):
    cur.execute("UPDATE main_table SET ...")
    cur.execute("INSERT INTO log_table ...")  # ❌
    conn.commit()

# GIUSTO: commit principale subito, log separato best-effort
def update_qualcosa(...):
    cur.execute("UPDATE main_table SET ...")
    conn.commit()  # ✅ stato principale salvo
    try:
        log_conn = get_xxx_connection()
        log_conn.execute("INSERT INTO log_table ...")
        log_conn.commit()
    except Exception as e:
        # log fallito ma il dato principale è salvo
        log.warning(f"log failed: {e}")
```

### Migrazioni
- File: `app/migrations/NNN_nome.py`. Numero progressivo (al 2026-04-25 siamo a 100).
- Tracciate in `schema_migrations` (foodcost.db) — una migrazione eseguita NON viene rieseguita.
- Per correggere una migrazione applicata: crea NUOVA migrazione (es. 096_repair_*).
- Prima di ogni `ALTER TABLE ... ADD COLUMN`, try/except per skip se già esiste (idempotenza).
- Per CREATE INDEX/TABLE: SELECT 1 FROM sqlite_master prima (vedi sopra).

---

## 3. Mattoni condivisi

**Regola**: prima di scrivere logica, controlla se esiste un mattone che la copre.

| Mattone | Stato | Import |
|---|---|---|
| **M.A Notifiche** | ✅ FATTO | BE: `from app.services.notifiche_service import crea_notifica`<br>FE: `useNotifiche()` hook |
| **M.B PDF brand** | ✅ FATTO | BE: `from app.services.pdf_brand import genera_pdf_html, wrappa_html_brand`<br>**ECCEZIONE**: Carta Vini ha motore separato `carta_vini_service.py`, NON usare M.B per `7.3` |
| **M.C WhatsApp** | ✅ FATTO | FE: `import { openWhatsApp, buildWaLink, fillTemplate, WA_TEMPLATES } from "../utils/whatsapp"`<br>BE: `from app.utils.whatsapp import build_wa_link, normalize_phone, fill_template`<br>**MAI** `wa.me/` a mano, MAI `.replace(" ","")` su telefoni |
| **M.E Calendar** | ✅ FATTO | FE: `import { CalendarView } from "../../components/calendar"`<br>Vedi `docs/mattone_calendar.md` |
| **M.F Alert engine** | ✅ FATTO | BE: `from app.services.alert_engine import run_all_checks, run_check`<br>Decoratore: `@register_checker("nome")` |
| **M.I UI primitives** | ✅ FATTO | FE: `import { Btn, PageLayout, StatusBadge, EmptyState } from "../../components/ui"`<br>Touch target 44pt su `Btn size="md\|lg"` |
| M.D Email service | ⏳ DA FARE | — |
| M.G Permessi centralizzati | ⏳ DA FARE | — (oggi check ruolo sparsi `if role==`) |
| M.H Import engine | ⏳ DA FARE | — (pattern in `clienti_router.py` da estrarre) |

---

## 4. Schede di dettaglio — pattern testa+tab

**Riferimento**: `SchedaVino.jsx` (S55), `FattureDettaglio.jsx` (S56), `MenuCartaDettaglio.jsx` (S57).

Struttura:
1. **Testa colorata sticky**: badge identità + titolo + 4 KPI in `grid-cols-2 md:grid-cols-4` (2×2 portrait iPad, 1×4 landscape).
2. **Tab bar** orizzontale: `overflow-x-auto whitespace-nowrap` su portrait stretto.
3. **Tab content**: rendering condizionale `{activeTab === "x" && (...)}`.
4. **Footer sticky** con azioni primarie (`Btn size="md"`).

Anti-matrioska: lo state di apertura sub-scheda vive nel **container**, mai nidificato. Per navigazione 3-livelli usare prop `breadcrumb` (Array<{label, onClick?}>).

Dirty-check al cambio tab: se ci sono editing in corso, chiedere conferma prima di switch.

---

## 5. Palette TRGB-02 (sessione 28)

| Variabile | Hex | Uso |
|---|---|---|
| `brand-red` | #E8402B | errori, alert, gobbetta 1 |
| `brand-green` | #2EB872 | successo, conferme, gobbetta 2 |
| `brand-blue` | #2E7BE8 | link, azioni primarie, gobbetta 3 |
| `brand-ink` | #111111 | testo principale |
| `brand-cream` | #F4F1EC | **SEMPRE** sfondo pagine (mai bg-neutral-100/gray-50) |
| `brand-night` | #0E0E10 | sfondo dark mode (futuro) |

**Colori ruolo invariati**: amber (admin), cyan (contabile), purple (sommelier), rose (sala), emerald (chef), slate (viewer).

**Recharts**: serie anno corrente `#2E7BE8` (brand-blue), serie precedente `#d1d5db`. Categorie partono da red/green/blue brand.

**Logo**: `<TrgbIcon>` per header, wordmark inline composito (NON usare file SVG wordmark, ha viewBox buggy).

---

## 6. Campi `escluso` — REGOLA CRITICA

- `fe_fornitore_categoria.escluso` → **SOLO** modulo Ricette/Matching.
- `fe_fornitore_categoria.escluso_acquisti` → **SOLO** modulo Acquisti.
- **NON mescolare mai i due campi.**

---

## 7. Auth & Permessi

- JWT con `Depends(get_current_user)` su ogni endpoint sensibile.
- Ruoli: superadmin, admin, contabile, chef, sous_chef, commis, sommelier, sala, viewer.
- Matrice in `app/data/modules.json` (seed) + `modules.runtime.json` (runtime, gitignored).
- Auto-sync hash-based (SHA-256) seed→runtime al boot.
- `ReadOnlyViewerMiddleware` blocca POST/PUT/PATCH/DELETE per `role="viewer"`.

---

## 8. File system (cartelle scritte dal backend)

Tutte in `.gitignore`, cartelle preservate da `push.sh`:
- `app/data/cedolini/` — PDF buste paga
- `app/data/documenti_dipendenti/` — scansioni
- `app/data/uploads/` — upload generici
- `app/data/ipratico_uploads/` — export iPratico
- `app/data/cucina/` — media task HACCP
- `app/data/menu_carta/foto/` — foto piatti menu (decisione S57 cont., 2026-04-25)

---

## 9. Documentazione di sessione

Dopo ogni sessione:
- `docs/sessione.md` (sempre): cosa fatto, file toccati, verifiche, da-verificare-dopo-push, commit suggerito.
- `docs/changelog.md` se rilascio significativo.
- `frontend/src/config/versions.jsx` se cambia versione di un modulo.
- `docs/problemi.md` se bug trovati o risolti (sposta da Aperti a Risolti con data + commit).
- `docs/roadmap.md` se un punto chiuso o spostato di stato.
- `docs/controllo_design.md` se emerge una scelta UX da tracciare.
- `docs/inventario_pulizia.md` se emerge codice morto/orfano da pulire.

---

## 9-bis. Visione d'insieme su nuove pagine/sub-moduli (regola Marco, sessione 58 cont.)

> Marco: "se aggiungi qualcosa in un modulo devi rispettarne l'insieme — grafica,
> pulsanti, menu, dropdown, barra menu, docs" e "non perdere mai la visione
> dell'insieme".

Ogni pagina nuova o sub-modulo aggiunto a un macro-modulo TRGB DEVE rispettare la
checklist a 7 punti documentata in `docs/checklist_visione_insieme.md`:

1. Sub-nav del modulo aggiornata (es. `RicetteNav.jsx` per Gestione Cucina)
2. Voce nel dropdown header (`frontend/src/config/modulesMenu.js`)
3. `app/data/modules.json` — sub key + ruoli
4. `frontend/src/config/versions.jsx` — bump o entry dedicata
5. `docs/modulo_<nome>.md` per sotto-moduli grossi + blocco in `docs/sessione.md`
6. Coerenza visiva (palette, primitives Btn/EmptyState, wrapper bg-brand-cream + card shadow-2xl rounded-3xl) — MAI inventare un mini-design system
7. Le impostazioni del sotto-modulo vivono come voce nella sidebar di
   `<Modulo>Settings.jsx` (es. `RicetteSettings.MENU`), NON come tab nella
   pagina del sotto-modulo. La pagina linka `/ricette/settings` con un piccolo
   "↗ Impostazioni Cucina"

Il guardiano applica questa checklist nello Step 4-bis del pre-audit. Mancanze a livello 1, 2, 3 → BLOCK. Mancanze a livello 4, 5, 6, 7 → WARN.

---

## 10. Push & deploy

- **MAI** `git commit/push/add` direttamente. Solo Marco lancia `./push.sh "msg"`.
- **MAI** chiamate di rete (curl, wget, pip install, npm install) durante sviluppo.
- Prima del push, push.sh fa: pre-check soft (debounce, probe servizio attivo), sync DB dal VPS (.prev backup), commit, push, restart se -m, deploy full se -f.
- Post-receive hook VPS: git checkout + git clean -fd + restart trgb-backend/frontend.
- **Mai** push durante servizio (12-14:30 / 19-23). I check L1 di push.sh chiedono conferma se il sito ha accessi recenti.
