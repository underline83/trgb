# Modulo Fatture Elettroniche (XML) — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_acquisti.md](modulo_acquisti.md) (modulo padre, doc completo), [modulo_fatture_in_cloud.md](modulo_fatture_in_cloud.md)

**Stato:** Operativo (integrato nel modulo Gestione Acquisti, v3.1 in `versions.jsx`)
**Data introduzione:** 2025-12-05
**Dominio funzionale:** Acquisti & Controllo di Gestione

> Questo modulo e' ora parte del modulo **Gestione Acquisti** (v2.0). Per la documentazione completa del modulo Acquisti, vedere [modulo_acquisti.md](modulo_acquisti.md).

Il modulo consente di importare file FatturaPA in formato XML e trasformarli in dati strutturati per analisi acquisti, matching ingredienti e controllo di gestione.

---

# 1. Funzionalita'

### Implementate
- Import XML singolo, multiplo o ZIP (anche ZIP annidati un livello)
- Parsing intestazione e righe fattura (namespace-agnostic), inclusi anagrafica completa fornitore (`CedentePrestatore`) e blocco `DatiPagamento` (condizioni, modalità MP01-23, scadenza, importo)
- Anti-duplicazione via hash SHA-256 + dedup cross-fonte con fatture FIC (arricchimento del record FIC con hash/importi/righe XML)
- Dashboard acquisti con drill-down interattivo
- Elenco fatture con filtri (lato client, fetch unico)
- Elenco fornitori con KPI
- Categorizzazione a 2 livelli (categorie + sottocategorie)
- Esclusione fornitori (autofatture, non pertinenti)
- **Matching ingredienti**: collegamento righe fattura → ingredienti con fuzzy search, auto-match, Smart Create
- **FattureInCloud (FIC) API v2 Sync**: router dedicato `/fic/*` con XML enrichment (quando FIC API ritorna `is_detailed: false`, il sistema recupera le righe dall'XML SDI allegato) — vedi [modulo_fatture_in_cloud.md](modulo_fatture_in_cloud.md)

### Da fare
- Gestione Note di Credito XML (oggi il `tipo_documento` TD04 viene salvato ed escluso da alcune query CE/candidates, ma non è gestito come storno con segno)
- Carichi magazzino automatici da fatture

---

# 2. Backend

Router: `app/routers/fe_import.py` (20 endpoint) + `fe_categorie_router.py` (16) + `fe_proforme_router.py` (9)
Prefix: `/contabilita/fe` (il sync FIC è nel router dedicato `fattureincloud_router.py` con prefix `/fic`)
Auth: JWT a livello router (tutte le route)

Per la lista completa degli endpoint, vedere `docs/modulo_acquisti.md` sezione 8.

---

# 3. Database

Posizione: `locali/tregobbi/data/foodcost.db` (path tenant-aware, R6.5; `app/data/` è fallback legacy vuoto)

Tabelle principali:
- `fe_fatture` — fatture importate con hash anti-duplicazione (+ VIEW `fe_fatture_with_stato` per lo stato pagamento, mig 112)
- `fe_righe` — righe fattura con descrizione, quantita', prezzi
- `fe_categorie` / `fe_sottocategorie` — categorizzazione a 2 livelli (due tabelle)
- `fe_fornitore_categoria` — assegnazione fornitore → categoria; le esclusioni sono le sue colonne `escluso` (Ricette/Matching) ed `escluso_acquisti` (Acquisti) — NON esiste una tabella `fe_fornitore_esclusione`
- `fe_prodotto_categoria_map` — mapping prodotto → categoria per auto-categorizzazione

Schema dettagliato → `docs/modulo_acquisti.md` §9 e `docs/database.md`

---

# 4. Frontend

Route migrate da `/admin/fatture/*` a `/acquisti/*` (2026-03-10).
Vedere `docs/modulo_acquisti.md` per dettagli pagine e routing.

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
- Router: `foodcost_matching_router.py` (18 endpoint, prefix `/matching`, auth JWT a livello router)
- Frontend: `frontend/src/pages/ricette/RicetteMatching.jsx` (4 tab: pending "Da associare", Smart Create, Mappings, Fornitori)
- Tabelle: `ingredient_supplier_map`, `matching_description_exclusions`, `matching_ignored_righe`
