# Spec: Brigata Cucina (Phase A.3 — sessione 46)

**Contesto:** Phase A.2 ha introdotto il campo `livello_cucina` sui task (chef/sous_chef/commis/NULL). Ora serve **rendere sous_chef e commis ruoli utente reali**, così che:
- L'admin può assegnare un utente al ruolo corretto
- Il backend filtra automaticamente la lista task in base al ruolo di chi guarda
- I nuovi ruoli hanno accesso agli stessi moduli del chef (parità, per ora)

**Decisione architetturale (scelta Marco):**
- **Q1 — Permessi moduli:** parità con `chef`. sous_chef e commis vedono **gli stessi moduli** del chef attuale. Tagli granulari in futuro.
- **Q2 — Filtro task:** **filtro automatico server-side**. Chef vede tutto cucina, sous_chef vede `livello_cucina IN ('sous_chef', NULL)`, commis vede `IN ('commis', NULL)`.

---

## Modello dati

**Nessuna migrazione DB.** Gli utenti sono in `app/data/users.json` (file, non SQLite).

**VALID_ROLES esteso** da:
```python
{"superadmin", "admin", "contabile", "chef", "sommelier", "sala", "viewer"}
```
a:
```python
{"superadmin", "admin", "contabile", "chef", "sous_chef", "commis", "sommelier", "sala", "viewer"}
```

**Backward-compat totale:** utenti esistenti con ruolo `chef` continuano a funzionare esattamente come prima (vedono tutto, come il chef attuale). Solo gli utenti a cui l'admin assegna esplicitamente `sous_chef` o `commis` cambiano comportamento.

---

## File da creare/modificare

### Backend

**1. `app/services/auth_service.py`**
- Estendere `VALID_ROLES` con `sous_chef` e `commis`
- Aggiungere helper:
  ```python
  def is_cucina_brigade(role: str) -> bool:
      """True per chef, sous_chef, commis — i 3 ruoli della brigata cucina."""
      return role in ("chef", "sous_chef", "commis")
  ```

**2. `app/routers/modules_router.py`**
- **Stessa estensione di VALID_ROLES** (duplicazione pre-esistente, non consolidare ora — solo tenere allineato)

**3. `app/data/modules.json`**
- Ovunque c'è `"chef"` nei `roles` (sia a livello modulo che sub-modulo), aggiungere anche `"sous_chef"` e `"commis"` — parità completa.
- **NON** toccare `app/data/modules.runtime.json` (è auto-generato, runtime, non in git — memoria `feedback_modules_json`).

**4. `app/routers/tasks_router.py` — filtro auto su letture**
Nei handler che restituiscono task/instance al frontend:
- `GET /tasks/tasks/` (lista task singoli)
- `GET /tasks/agenda/` (agenda del giorno)
- `GET /tasks/instances/` (istanze checklist)
- Eventuali altri endpoint di lettura che mostrano task cucina

Logica:
```python
role = current_user["role"]
if role == "sous_chef":
    # forza il filtro indipendentemente dal query param passato
    query_livelli = ["sous_chef", None]
elif role == "commis":
    query_livelli = ["commis", None]
else:
    # chef, admin, superadmin, altri: nessun filtro auto
    # (rispetta il query param ?livello_cucina=... se presente)
    query_livelli = None
```
SQL generato (con `IS NULL` per il NULL):
```sql
WHERE (reparto = 'cucina' AND (livello_cucina = 'sous_chef' OR livello_cucina IS NULL))
   OR reparto != 'cucina'   -- nota: i task non-cucina restano sempre visibili
```

**Decisione visibilità inter-reparto:** sous_chef/commis vedono ANCHE i task di altri reparti (bar, sala, ecc.) se l'admin glieli assegna. Il filtro auto tocca SOLO la dimensione `livello_cucina` per i task cucina. Questo perché il ruolo definisce la brigata, non il reparto.

**5. Security hardening — no privilege escalation:**
- Se sous_chef passa manualmente `?livello_cucina=chef`, il backend IGNORA silenziosamente (override con il filtro auto).
- Stesso pattern su endpoint POST/PUT: sous_chef NON può creare/modificare un task con `livello_cucina='chef'`. Se ci prova → 403 `"Non puoi assegnare task a un livello superiore al tuo"`.
- Commis idem: può creare task solo con `livello_cucina IN ('commis', None)`.
- Chef può creare task a qualsiasi livello.

### Frontend

**6. `frontend/src/pages/admin/GestioneUtenti.jsx`**
- Estendere `ROLES` array:
  ```js
  const ROLES = ["admin", "chef", "sous_chef", "commis", "sommelier", "sala", "viewer"];
  ```
- Estendere `ROLE_LABELS`:
  ```js
  sous_chef: "🥘 Sous Chef",
  commis:    "🔪 Commis",
  ```
- Se esistono `ROLE_COLORS` o badge colorati per ruolo → aggiungere coordinati:
  - `sous_chef` → `bg-orange-100 border-orange-300 text-orange-900` (coordinato con LIVELLI_CUCINA palette A.2)
  - `commis` → `bg-yellow-100 border-yellow-300 text-yellow-900`
  - `chef` resta come è (emerald attuale)

**7. `frontend/src/components/LoginForm.jsx`**
- Se le tile di login hanno palette ruolo → aggiungere i 2 nuovi (stessi colori del punto 6).

**8. `frontend/src/pages/tasks/TaskList.jsx`**
- Se user.role ∈ {`sous_chef`, `commis`} → **nascondere** il dropdown "Livello cucina" dalla sidebar filtri (il backend forza già il filtro, il controllo UI sarebbe inutile/confondente).
- Mostrare un piccolo hint nell'header: "Visualizzi i task della tua brigata (commis + tutta la brigata)" o simile.
- Chef vede il dropdown normalmente.

**9. `frontend/src/pages/tasks/TaskNuovo.jsx` + `TemplateEditor.jsx`**
- Validazione FE anti-escalation: se user.role = sous_chef → opzioni dropdown livello limitate a `["", "sous_chef"]` ("" = tutta la brigata).
- Se user.role = commis → opzioni limitate a `["", "commis"]`.
- Chef vede tutte le opzioni (chef/sous_chef/commis/"").
- Backend fa lo stesso check (fonte di verità), FE è UX.

**10. `frontend/src/config/versions.jsx`**
- Bump modulo `tasks` a `1.3` (da 1.2).

---

## Test manuali (VPS dopo deploy)

1. **Assegnazione ruolo:** Admin va su Gestione Utenti → cambia ruolo utente test a `sous_chef` → logout/login → utente vede Task Manager
2. **Parità moduli:** sous_chef vede Ricette, Mance, Turni, Dipendenti (stessi del chef attuale)
3. **Filtro auto chef:** utente chef apre TaskList → vede task di ogni livello
4. **Filtro auto sous_chef:** utente sous_chef apre TaskList → vede solo task con `livello_cucina='sous_chef'` o NULL
5. **Filtro auto commis:** utente commis → vede solo `livello_cucina='commis'` o NULL
6. **Anti-escalation URL:** sous_chef prova `/tasks?livello_cucina=chef` → backend ignora, vede sempre solo sous_chef+NULL
7. **Anti-escalation creazione:** sous_chef prova a creare task con livello=chef via API diretta → 403
8. **Anti-escalation FE:** sous_chef apre form Nuovo task con reparto=cucina → dropdown livello mostra solo "Tutta la brigata" + "Sous Chef"
9. **Task non-cucina visibili:** commis vede task reparto=bar/sala se presenti (filtro tocca solo dimensione livello, non reparto)
10. **Utente chef pre-A.3:** utente con ruolo chef già esistente continua a vedere tutto (backward-compat)

---

## Vincoli operativi

- **Worktree obbligatorio:** `git worktree add .claude/worktrees/brigata-cucina -b feat/brigata-cucina`. Zero modifiche su main.
- **NO commit locali, NO push:** come sempre, Marco gestisce con push.sh dopo merge.
- **modules.runtime.json:** NON toccare, è runtime auto-generato. Toccare SOLO `modules.json` (sorgente).
- **Aggiornare docs:** `docs/changelog.md` + `docs/sessione.md`.
- **Mobile-first:** hint sidebar sous_chef/commis deve avere touch target ≥ 44pt (memoria `feedback_mobile_aware`).
- **Palette brand:** orange/yellow Tailwind coordinati con LIVELLI_CUCINA della A.2 (già in `frontend/src/config/reparti.js`).
- **Build check:** Vite build clean prima di consegnare.
- **Verifica finale:** grep `sous_chef\|commis` deve tornare tutti i punti coerenti (auth + modules + router + GestioneUtenti + LoginForm + TaskList + TaskNuovo + TemplateEditor).
- **Backward-compat:** nessun utente esistente con ruolo `chef` deve cambiare comportamento. Solo chi viene promosso manualmente a sous_chef/commis vede la differenza.
