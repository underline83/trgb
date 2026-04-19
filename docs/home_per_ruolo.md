# Home per ruolo — punto 8.x Brand/UX

**Versione:** v1  
**Stato:** in costruzione — sessione 49 (2026-04-19)  
**Obiettivo:** permettere ad admin di configurare da Impostazioni i **pulsanti rapidi** che ogni ruolo vede in Home, senza toccare codice. Sostituisce gli array hardcoded `ADMIN_ACTIONS` (in `Home.jsx`) e `SALA_ACTIONS` (in `DashboardSala.jsx`).

Coerente con la regola granitica del CLAUDE.md: _"Config sempre in Impostazioni, mai hardcoded"_.

---

## 1. Scope v1 — cosa SI fa, cosa NO

### Dentro v1
- Pulsanti rapidi della Home (quelli oggi in `ADMIN_ACTIONS` e `SALA_ACTIONS`) configurabili per ruolo da Impostazioni Sistema.
- 9 ruoli supportati: `admin, superadmin, contabile, sommelier, chef, sous_chef, commis, sala, viewer`.
- Seed iniziale cloniamo la **config attuale** — nessuno vede cambi al day-1.
- Tendina route: solo route **esistenti** (derivate da `modulesMenu.js`) — niente campo libero per evitare refusi.
- Admin e superadmin vedono la stessa lista (superadmin eredita admin, cfr. feedback memory).
- Fallback FE: se il fetch fallisce, Home usa gli array hardcoded attuali (zero rischio di regressione).

### Fuori v1 — rimandato
- Pinning per utente (ogni dipendente si personalizza): tabella `user_preferences`, UI aggiuntiva. Rimandato — prima facciamo funzionare la config per-ruolo.
- Widget configurabili (Incasso, Coperti, Alert, Bacheca, Macellaio): restano uguali per tutti in v1. Stessa infrastruttura estendibile in v2 aggiungendo `home_widgets` con schema analogo.
- Hero card (Prenotazioni span-2 su pagina Moduli): resta hardcoded come oggi. Può diventare config in v2.
- Modifica moduli: già esiste il flusso `/settings/modules/` con sotto-moduli — non tocchiamo.

---

## 2. Schema DB (foodcost.db)

Tabella `home_actions`:

```sql
CREATE TABLE home_actions (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ruolo   TEXT    NOT NULL,       -- admin|superadmin|contabile|sommelier|chef|sous_chef|commis|sala|viewer
    ordine  INTEGER NOT NULL DEFAULT 0,
    key     TEXT    NOT NULL,       -- slug stabile (es. "chiusura-turno"), usato come React key
    label   TEXT    NOT NULL,       -- "Chiusura Turno"
    sub     TEXT,                   -- sottotitolo "Fine servizio"
    emoji   TEXT    NOT NULL,       -- "💵"
    route   TEXT    NOT NULL,       -- "/vendite/fine-turno"
    color   TEXT,                   -- classi Tailwind (es. "bg-indigo-50 border-indigo-200 text-indigo-900")
    attivo  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_home_actions_ruolo ON home_actions(ruolo, ordine);
```

**Perché `color` in tabella:** la palette brand resta centralizzata (brand-ink/cream/red/green/blue), ma la tinta specifica di ogni pulsante (es. amber per Vini) arriva dal modulo di destinazione. La teniamo come campo opzionale: se vuoto, il frontend deriva dalla `modulesMenu.js` via lookup della `route`.

**Perché `key` stringa slug:** serve come React key e come identificatore stabile per migrazioni/seed idempotenti. Non è un id numerico perché nella UI è più facile editarlo.

**Perché `attivo`:** nascondere un pulsante senza cancellarlo (rapido rollback, storicità).

---

## 3. Backend — router `/settings/home-actions/`

File: `app/routers/home_actions_router.py`  
Mountato in `main.py` accanto agli altri `settings/*`.

Endpoint (tutti con trailing slash dove serve, come da regola CLAUDE.md):

| Metodo | Path | Auth | Descrizione |
|--------|------|------|-------------|
| `GET` | `/settings/home-actions/?ruolo=chef` | autenticati | Lista azioni del ruolo, ordinate. Se `ruolo` omesso → restituisce lista del ruolo corrente dell'utente (self). |
| `GET` | `/settings/home-actions/all/` | admin | Mappa `{ruolo: [azioni]}` per tutti i ruoli, usata dalla UI Impostazioni. |
| `POST` | `/settings/home-actions/` | admin | Crea una nuova azione. Body: `{ruolo, key, label, sub, emoji, route, color, ordine, attivo}`. |
| `PUT` | `/settings/home-actions/{id}` | admin | Aggiorna campi dell'azione. |
| `DELETE` | `/settings/home-actions/{id}` | admin | Elimina azione. |
| `POST` | `/settings/home-actions/reorder/` | admin | Batch reorder: body `{ruolo, ids: [id1, id2, ...]}` → riassegna `ordine` in base all'array. |
| `POST` | `/settings/home-actions/reset/` | admin | Ripristina seed di default per un ruolo (body `{ruolo}`). Per "pulsante d'emergenza". |

**Regole:**
- `is_admin(current_user["role"])` → gate su tutti gli endpoint di scrittura.
- `ruolo` validato contro `VALID_ROLES` (stesso set del modules_router).
- `route` validato: deve essere presente nella lista route esistenti (derivata da `modulesMenu.js` via `ALLOWED_ROUTES`) — lista hardcoded BE per ora, oppure si legge il JSON se c'è. Meglio hardcoded BE così sappiamo cosa accettiamo.
- `superadmin` non è un ruolo a sé per le azioni home: quando l'utente è superadmin, il BE restituisce le azioni di `admin`.

---

## 4. Seed iniziale (in migrazione 090)

**Per ogni ruolo non-sala (`admin, superadmin, contabile, sommelier, chef, sous_chef, commis, viewer`):**
Clone di ADMIN_ACTIONS attuali:

| ord | key | label | sub | emoji | route | color |
|-----|-----|-------|-----|-------|-------|-------|
| 0 | chiusura-turno | Chiusura Turno | Fine servizio | 💵 | /vendite/fine-turno | indigo |
| 1 | prenotazioni | Prenotazioni | Planning completo | 📅 | /prenotazioni | indigo |
| 2 | cantina-vini | Cantina Vini | Magazzino | 🍷 | /vini/magazzino | amber |
| 3 | food-cost | Food Cost | Ricette e costi | 📘 | /ricette/archivio | orange |
| 4 | controllo-gestione | Controllo Gestione | Dashboard P&L | 📊 | /controllo-gestione/dashboard | emerald |

NOTA: `superadmin` non viene seedato — il BE ribalta a `admin` a runtime per ereditarietà.

NOTA 2: la route `prenotazioni` attuale include la data di oggi (`/prenotazioni/planning/YYYY-MM-DD`): è calcolata in JS al render. In DB salviamo la route statica `/prenotazioni` e il FE, se riconosce un pattern speciale, può arricchirla. Per v1: salviamo `/prenotazioni` e basta — è già una route valida.

**Per sala:**

| ord | key | label | sub | emoji | route | color |
|-----|-----|-------|-----|-------|-------|-------|
| 0 | chiusura-turno | Chiusura Turno | Fine servizio | 💵 | /vendite/fine-turno | indigo |
| 1 | prenotazioni | Prenotazioni | Planning completo | 📅 | /prenotazioni | indigo |
| 2 | carta-vini | Carta dei Vini | Cerca vini | 🍷 | /vini/carta | amber |
| 3 | mance | Mance | Registra mance | 💰 | /flussi-cassa/mance | emerald |

Migrazione idempotente: `INSERT OR IGNORE` usando indice unico `(ruolo, key)` o check esistenza prima di insert.

---

## 5. Frontend

### 5.1 Hook `useHomeActions(role)`
File: `frontend/src/hooks/useHomeActions.js`

```js
import { useEffect, useState } from "react";
import { API_BASE, apiFetch } from "../config/api";

// Fallback hardcoded = valore attuale di ADMIN_ACTIONS/SALA_ACTIONS
import { ADMIN_ACTIONS_FALLBACK, SALA_ACTIONS_FALLBACK } from "../config/homeActionsFallback";

export default function useHomeActions(role) {
  const [actions, setActions] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/settings/home-actions/?ruolo=${encodeURIComponent(role || "admin")}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => { if (!cancelled) setActions(data); })
      .catch(() => {
        if (!cancelled) {
          setError("fallback");
          setActions(role === "sala" ? SALA_ACTIONS_FALLBACK : ADMIN_ACTIONS_FALLBACK);
        }
      });
    return () => { cancelled = true; };
  }, [role]);

  return { actions: actions || [], loading: actions === null, error };
}
```

Fallback: `frontend/src/config/homeActionsFallback.js` contiene gli stessi dati degli array attuali — zero regressione se il BE casca.

### 5.2 Refactor `Home.jsx`
- Rimuove costante `ADMIN_ACTIONS`.
- Usa `const { actions: quickActions } = useHomeActions(role);`
- Mappa `quickActions` dove prima c'era `ADMIN_ACTIONS`.

### 5.3 Refactor `DashboardSala.jsx`
- Stesso pattern, rimuove `SALA_ACTIONS`.

### 5.4 UI Impostazioni — tab "Home per ruolo"
- Nuovo tab in `ImpostazioniSistema.jsx`, dopo "Moduli & Permessi", prima di "Notifiche".
- Selettore ruolo (segmented control o select).
- Lista azioni del ruolo scelto:
  - Per ciascuna: emoji, label, sub, route (mostrata come chip non editabile in v1, editabile via modal).
  - Toggle attivo/spento.
  - Drag-and-drop per riordinare (v1: bottoni ↑ ↓ se drag è troppo lavoro — decisione runtime).
  - Bottoni "Modifica" e "Elimina".
- Pulsante "+ Aggiungi azione": modal con form (label obbligatoria, sub opzionale, emoji, route da tendina di route esistenti).
- Pulsante "Ripristina default" per il ruolo corrente (chiama `POST /reset/`).
- Usa `Btn`, `StatusBadge`, `EmptyState` di M.I UI primitives.

---

## 6. Rollout

1. Migrazione 090 + router `/settings/home-actions/` deployati insieme.
2. FE pubblica: `Home.jsx` e `DashboardSala.jsx` usano `useHomeActions`. Se il BE non ha ancora la tabella, il fallback JS evita errori (nessuno vede cambi).
3. UI Impostazioni deployata nello stesso push.
4. Marco testa su prod: cambia un pulsante per chef → verifica che chef veda la nuova Home dopo refresh.

---

## 7. Test manuali post-deploy

- [ ] Migrazione applicata: `sqlite3 app/data/foodcost.db "SELECT COUNT(*) FROM home_actions;"` → almeno 36 righe (8 ruoli × 5 azioni) + 4 (sala) = 44 righe.
- [ ] `GET /settings/home-actions/?ruolo=admin` → 5 azioni ordinate.
- [ ] `GET /settings/home-actions/?ruolo=sala` → 4 azioni ordinate.
- [ ] `GET /settings/home-actions/?ruolo=superadmin` → 5 azioni (ereditate da admin).
- [ ] Login come admin → Home.jsx mostra gli stessi 5 pulsanti di oggi.
- [ ] Login come sala → DashboardSala mostra gli stessi 4 pulsanti di oggi.
- [ ] Impostazioni Sistema → tab "Home per ruolo" → seleziona chef → modifica label di un pulsante → salva → refresh Home di un utente chef → label aggiornata.
- [ ] Elimina tutti i pulsanti di viewer → viewer vede Home con EmptyState ("Nessuna azione rapida configurata").
- [ ] Ripristina default → torna il seed.
- [ ] BE off: Home funziona lo stesso (fallback).

---

## 8. Estensioni future (v2+)

- **Widget per ruolo**: tabella `home_widgets(ruolo, key, ordine, attivo, config)` sullo stesso pattern.
- **Pinning per utente**: `user_home_preferences(user_id, actions_pinned: JSON, actions_hidden: JSON)` + UI "modalità modifica Home".
- **Hero card configurabile**: campo `hero_key` nella riga del ruolo o in `home_settings(ruolo)`.
- **Home template "copia da ruolo X"**: comodo per creare nuovi ruoli rapidamente.

---

## 9. File toccati

### Nuovi
- `docs/home_per_ruolo.md` (questo file)
- `app/migrations/090_home_actions.py`
- `app/routers/home_actions_router.py`
- `frontend/src/hooks/useHomeActions.js`
- `frontend/src/config/homeActionsFallback.js`

### Modificati
- `main.py` (+ include_router)
- `frontend/src/pages/Home.jsx` (rimuove ADMIN_ACTIONS, usa hook)
- `frontend/src/pages/DashboardSala.jsx` (rimuove SALA_ACTIONS, usa hook)
- `frontend/src/pages/admin/ImpostazioniSistema.jsx` (aggiunge tab "Home per ruolo")
- `frontend/src/config/versions.jsx` (bump home a 3.5)
- `docs/changelog.md`
- `docs/sessione.md`
- `docs/roadmap.md`
