# Spec: Livelli Cucina (Phase A.2 — sessione 46)

**Contesto:** Phase A (sessione 45) ha introdotto il campo `reparto` sui task. Ora serve sotto-categorizzare i task della cucina per livello di brigata.

**Decisione:** Opzione B gerarchica — nuovo campo `livello_cucina` nullable su task_singolo/checklist_template/checklist_instance, attivo SOLO se `reparto='cucina'`. NULL = "tutta la brigata cucina".

---

## Modello dati

**Campo nuovo:** `livello_cucina TEXT NULL` su 3 tabelle (DB `tasks.sqlite3`):
- `task_singolo`
- `checklist_template`
- `checklist_instance`

**Valori ammessi:** `chef`, `sous_chef`, `commis`. NULL = tutta la brigata.

**Vincolo cross-field:** `livello_cucina` può essere NOT NULL solo se `reparto='cucina'`. Su altri reparti deve restare NULL. Validato sia backend (Pydantic validator) che FE (UI nasconde il dropdown).

**Backward compat:** task esistenti hanno `livello_cucina=NULL` → comportamento "tutta la brigata cucina" (equivalente a prima).

---

## File da creare/modificare

### Backend

**1. `app/migrations/088_livello_cucina.py` (NUOVO)**
- Pattern: 087 (self-heal style, PRAGMA check prima di ALTER)
- Aggiunge colonna + index a 3 tabelle su `tasks.sqlite3`
- Idempotente
- Riferimento DB: `app/data/tasks.sqlite3` (post-Phase B)

**2. `app/schemas/tasks_schema.py`**
- Aggiungere costante `LIVELLI_CUCINA = {"chef", "sous_chef", "commis"}`
- Campo `livello_cucina: Optional[str] = None` su:
  - `ChecklistTemplateIn`, `ChecklistTemplateUpdate`, `ChecklistTemplateOut`
  - `ChecklistInstanceOut` (read-only)
  - `TaskSingoloIn`, `TaskSingoloUpdate`, `TaskSingoloOut` (trovare le classi esistenti)
- Validator Pydantic su Template/Task: se `reparto != 'cucina'` → `livello_cucina` deve essere None, altrimenti in LIVELLI_CUCINA o None

**3. `app/routers/tasks_router.py`**
- POST `/tasks/tasks/` accetta `livello_cucina` nel body
- PUT `/tasks/tasks/{id}/` accetta aggiornamento
- GET `/tasks/tasks/` supporta query param `?livello_cucina=chef|sous_chef|commis`
- Stesso pattern per POST/PUT/GET `/tasks/templates/`
- Stesso pattern per lettura `/tasks/agenda/` e `/tasks/instances/` (emit solo, no filter obbligatorio su instance)
- Quando il router cambia `reparto` di un record a non-cucina, forza `livello_cucina=NULL`

### Frontend

**4. `frontend/src/config/reparti.js`**
Aggiungere dopo `getReparto`:
```js
export const LIVELLI_CUCINA = [
  { key: "chef",      label: "Chef",      icon: "👨‍🍳", color: "bg-red-100 border-red-300 text-red-900" },
  { key: "sous_chef", label: "Sous Chef", icon: "🥘",   color: "bg-orange-100 border-orange-300 text-orange-900" },
  { key: "commis",    label: "Commis",    icon: "🔪",   color: "bg-yellow-100 border-yellow-300 text-yellow-900" },
];

export const LIVELLI_CUCINA_KEYS = LIVELLI_CUCINA.map(l => l.key);

export function getLivelloCucina(key) {
  return LIVELLI_CUCINA.find(l => l.key === key) || null;
}
```

**5. `frontend/src/pages/tasks/TaskNuovo.jsx`**
- Import `LIVELLI_CUCINA` da `config/reparti`
- State nuovo: `livelloCucina` (default `task?.livello_cucina || ""`)
- Sotto il select reparto, aggiungere select secondario "Livello (opzionale)" che appare con CSS transition SOLO se `reparto === "cucina"`
- Opzioni: "Tutta la brigata" (value=""), mappate da LIVELLI_CUCINA
- useEffect su cambio reparto: se `reparto !== "cucina"` → `setLivelloCucina("")`
- Payload POST/PUT: `livello_cucina: reparto === "cucina" ? (livelloCucina || null) : null`

**6. `frontend/src/pages/tasks/TemplateEditor.jsx`**
Stesso pattern di TaskNuovo per i template.

**7. `frontend/src/pages/tasks/TaskList.jsx`**
- Import `LIVELLI_CUCINA` da `config/reparti`
- State nuovo: `filterLivello` (default "")
- Sidebar filtri: aggiungere `<select>` "Livello cucina" SOLO se `filterReparto === "cucina"` o `filterReparto === ""` (vuoto = tutti)
- Quando `filterReparto` cambia a non-cucina → `setFilterLivello("")`
- Passare `livello_cucina` come query param in apiFetch
- Badge nella card: sotto/accanto al badge reparto, se `task.livello_cucina`, mostrare piccolo badge con icon + label (palette da getLivelloCucina)

**8. `frontend/src/components/tasks/TaskSheet.jsx`**
- Mostrare badge livello sotto il badge reparto, se presente
- Se UI permette edit reparto inline: cambio a non-cucina → confirm "Il livello verrà rimosso" + reset

**9. `frontend/src/config/versions.jsx`**
Bump versione modulo `tasks` a `1.2` (da 1.1).

---

## Test manuali (VPS dopo deploy)

1. Creare task reparto=cucina SENZA livello → deve salvarsi, DB mostra `livello_cucina IS NULL`
2. Creare task reparto=cucina CON livello=sous_chef → deve salvarsi correttamente
3. Creare task reparto=bar → dropdown livello non visibile nel form, payload `livello_cucina: null`
4. Filtrare lista per reparto=cucina + livello=commis → vedere solo task commis
5. Filtrare per reparto=cucina + livello="" (tutta la brigata) → vedere TUTTI i task cucina (inclusi quelli con livello valorizzato? decisione: sì, "tutta la brigata" = nessun filtro livello)
6. Editare task cucina-commis cambiando reparto a bar → dopo salva il DB deve avere `livello_cucina=NULL`
7. Rilanciare migrazione 088 due volte → secondo run stampa "0 tabelle toccate" (idempotenza)
8. Task esistenti pre-Phase-A.2 continuano a vedersi con badge reparto generico (senza badge livello)

---

## Vincoli operativi

- **Worktree obbligatorio:** Code deve creare `git worktree add .claude/worktrees/livelli-cucina -b feat/livelli-cucina`. Zero modifiche su main.
- **NO commit locali, NO push:** Marco gestisce con `push.sh` dopo merge del worktree.
- **Aggiornare docs:** `docs/changelog.md` + `docs/sessione.md` + questa spec può essere archiviata/aggiornata.
- **Mobile-first:** il dropdown livello deve avere touch target ≥ 44pt (memoria `feedback_mobile_aware`).
- **Palette brand:** usare solo classi Tailwind documentate in CLAUDE.md (brand-red/green/blue/ink/cream).
- **Build check:** Vite build clean prima di consegnare (nessun modulo rotto).
- **Verifica finale:** grep `livello_cucina` deve tornare tutti i punti coerenti (config, schema, router, migration, FE forms/filters/badges).
