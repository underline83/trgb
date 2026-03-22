# Modulo Fatture Elettroniche (XML) — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-22
**Stato:** Operativo (integrato nel modulo Gestione Acquisti v2.1)
**Data introduzione:** 2025-12-05
**Dominio funzionale:** Acquisti & Controllo di Gestione

> Questo modulo e' ora parte del modulo **Gestione Acquisti** (v2.0). Per la documentazione completa del modulo Acquisti, vedere `docs/Modulo_Acquisti.md`.

Il modulo consente di importare file FatturaPA in formato XML e trasformarli in dati strutturati per analisi acquisti, matching ingredienti e controllo di gestione.

---

# 1. Funzionalita'

### Implementate
- Import XML singolo, multiplo o ZIP
- Parsing intestazione e righe fattura (namespace-agnostic)
- Anti-duplicazione via hash SHA-256
- Dashboard acquisti con drill-down interattivo
- Elenco fatture con filtri e paginazione
- Elenco fornitori con KPI
- Categorizzazione a 2 livelli (categorie + sottocategorie)
- Esclusione fornitori (autofatture, non pertinenti)
- **Matching ingredienti**: collegamento righe fattura → ingredienti con fuzzy search, auto-match, Smart Create
- **FattureInCloud (FIC) API v2 Sync** (v2.1): sincronizzazione automatica con XML enrichment (quando FIC API ritorna `is_detailed: false`, il sistema tenta di aggiungere righe da XML importati)

### Da fare
- Gestione Note di Credito XML
- Carichi magazzino automatici da fatture

---

# 2. Backend

Router: `app/routers/fe_import.py` + `fe_categorie_router.py`
Prefix: `/contabilita/fe`
Auth: JWT (tutte le route)

Per la lista completa degli endpoint, vedere `docs/Modulo_Acquisti.md` sezione 4.

---

# 3. Database

Posizione: `app/data/foodcost.db`

Tabelle principali:
- `fe_fatture` — fatture importate con hash anti-duplicazione
- `fe_righe` — righe fattura con descrizione, quantita', prezzi
- `fe_categorie` / `fe_sottocategorie` — albero categorizzazione
- `fe_fornitore_categoria` — assegnazione fornitore → categoria
- `fe_fornitore_esclusione` — esclusioni (autofatture, ecc.)

Schema dettagliato → `docs/database.md`

---

# 4. Frontend

Route migrate da `/admin/fatture/*` a `/acquisti/*` (2026-03-10).
Vedere `docs/Modulo_Acquisti.md` per dettagli pagine e routing.

---

# 5. Matching Ingredienti (Fase 2 — completata 2026-03-13)

Il matching collega righe fatture XML agli ingredienti del modulo FoodCost.

### Flusso
1. Import fatture XML dal modulo Acquisti
2. Righe appaiono in `/ricette/matching` come "da associare"
3. Tab "Smart Create" suggerisce nuovi ingredienti da creare in blocco
4. Conferma match → salva mapping + aggiorna prezzo ingrediente
5. Auto-match per le prossime fatture dello stesso fornitore

### Componenti
- Router: `foodcost_matching_router.py`
- Frontend: `RicetteMatching.jsx` (4 tab: Da associare, Smart Create, Mappings, Fornitori)
- Tabelle: `ingredient_supplier_map`, `matching_description_exclusions`, `matching_ignored_righe`
