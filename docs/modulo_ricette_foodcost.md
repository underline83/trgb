# Modulo Ricette & Food Cost — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_selezioni_giorno.md](modulo_selezioni_giorno.md), [modulo_acquisti.md](modulo_acquisti.md) (matching fatture), [modulo_menu_carta.md](modulo_menu_carta.md) (pubblicazione piatti), [modulo_cucina.md](modulo_cucina.md) (MEP/dashboard cucina)

**Stato:** stabile, in produzione
**Versione modulo (`versions.jsx`):** ricette v3.33 (beta) · selezioni v1.1 (vedi pagina dedicata)
**Router:** `foodcost_recipes_router.py`, `foodcost_matching_router.py`, `foodcost_ingredients_router.py` + `foodcost_router.py` (legacy, vedi §3.1)
**DB:** `foodcost.db` — live in `locali/tregobbi/data/` (in `app/data/` solo fallback legacy). Migrazioni parte ricette: 001-013 (v1/v2), poi 074 (menu/servizi), 098 (cache allergeni + campi menu carta), 136 (placeholder), 137 (procedimento), 138 (drop FK invoices), 145 (foodcost_settings)
**Roadmap:** sezione `R.` di `docs/roadmap.md`

---

# 0. Indice

1. Panoramica e obiettivi
2. Concetti chiave (ingrediente vs ricetta-base, prezzo, sub-ricetta)
3. Architettura backend
4. Schema database
5. Calcolo Food Cost (algoritmo + esempio)
6. Matching fatture XML → ingredienti
7. Conversioni unità di misura
8. Frontend (pagine + funzioni)
9. Esclusioni e modulo cooperante con Acquisti
10. Roadmap e debt

---

# 1. Panoramica e obiettivi

Il modulo **Ricette & Food Cost** copre 3 filoni operativi:

1. **Anagrafica ricette** — cucina, pasticceria, basi (sub-ricette riusabili). Una crema base diventa ingrediente di N dolci. Annidamento a profondità arbitraria con cycle detection.
2. **Food cost preciso** — costo per porzione + % sul prezzo di vendita, calcolato in real-time, aggiornato automaticamente quando cambia un prezzo a monte (a cascata su tutte le ricette che usano quell'ingrediente).
3. **Aggancio prezzi da fatture XML** — match automatico riga fattura → ingrediente, multi-fornitore (codici diversi, prezzi diversi, unità diverse). Prima conferma manuale, poi automatico per le fatture future.

Il modulo lavora **in tandem con Acquisti**: quest'ultimo importa fatture XML/FIC, popola `fe_fatture`/`fe_righe`, il modulo Ricette le legge per matching e prezzi.

Attorno al nucleo si sono aggiunti (2026): **allergeni calcolati ricorsivi** (Modulo C), **storico Food Cost** per ricetta (Modulo F.2), **import ricette da JSON** con risoluzione ingredienti, **tipi servizio** per il wizard preventivi, **export PDF scheda ricetta** (mattone M.B), **merge ingredienti placeholder**.

---

# 2. Concetti chiave

## 2.1 Ingrediente vs Ricetta-base

- **Ingrediente** = materia prima che compri (farina, burro, latte). Vive in `ingredients`.
- **Ricetta-base** = qualcosa che produci e che diventa componente di altre ricette (crema pasticcera, brodo, pasta frolla). Vive in `recipes` con flag `is_base=1` (equivalente `kind='base'`, mig 074).

Nella tabella `recipe_items`, ogni riga punta a UN ingrediente OPPURE a UNA sub-ricetta (mai entrambi). Il vincolo è applicato dalla validazione backend (400 se entrambi o nessuno valorizzati).

## 2.2 Prezzo corrente ingrediente = MEDIANA della finestra (fix Sedano 2026-06-08)

> (storico, superato: fino a giugno 2026 il costo era "l'ultimo prezzo fattura, non una media". Il caso Sedano — ultimo 8,27 €/kg da acquisto retail vs 2,60 €/kg abituale — ha mostrato che un singolo acquisto anomalo inquinava food cost e KPI.)

Il "prezzo corrente" di un ingrediente è la **MEDIANA dei `unit_price` registrati negli ultimi N giorni** (default 90, configurabile da `foodcost_settings.prezzo_finestra_giorni` — UI: Impostazioni Cucina · Prezzi & Food Cost). La mediana neutralizza gli outlier (acquisti occasionali/retail).

- **Fallback:** se nessun prezzo cade nella finestra, si usa l'ultimo prezzo disponibile in assoluto (meglio un dato vecchio che nessun dato).
- Implementazione: `prezzo_corrente_ingrediente()` in `app/routers/foodcost_recipes_router.py:409`; usata da `_get_ingredient_unit_cost` (food cost ricorsivo, riga 459) e replicata nella lista ingredienti (`foodcost_ingredients_router.py:386-436`, una query sola, no N+1).
- `foodcost_settings.prezzo_strategia` esiste (default `'mediana'`) ma il calcolo oggi usa SEMPRE la mediana: il campo non è ancora letto come switch.
- Lo storico è tenuto integralmente in `ingredient_prices` (mai sovrascritto). "Medio storico" nella scheda ingrediente = media di tutti i prezzi.

## 2.3 Costo ricetta-base = somma ingredienti / resa

Se "Crema Pasticcera" rende 2 kg e usa 3 € di ingredienti, il costo è 1,50 €/kg. Quando la usi in un dolce (es. 200 g), il costo di quella riga è 0,30 €.

## 2.4 Matching fatture → ingredienti (il pezzo smart)

Ogni fornitore chiama gli ingredienti a modo suo:
- Fornitore A: "FARINA 00 MOLINO SPADONI KG 25" → Farina 00
- Fornitore B: "FARINA T.00 SACCO 25KG" → Farina 00

Serve una **tabella di mapping** che collega la descrizione/codice del fornitore al tuo ingrediente. La prima volta confermi manualmente; poi il sistema ricorda (auto-match per fatture successive).

## 2.5 Voci "qb" (quanto basta)

Nell'import JSON (e nel tracciato) gli ingredienti a piacere (sale, pepe, olio per condire) si dichiarano con `unita: "qb"`: vengono salvati in `recipe_items` con `qty=0` e unità canonica `"qb"` → elencati nella ricetta ma **esclusi dal food cost**. Sinonimi riconosciuti: q.b., quanto basta, a piacere, qs… (`_QB_UNITS`, `foodcost_recipes_router.py:1434`).

---

# 3. Architettura backend

## 3.1 Router (FastAPI)

| Router | File | Prefix effettivo | Auth | Funzione |
|--------|------|------------------|------|----------|
| Ricette | `app/routers/foodcost_recipes_router.py` | `/foodcost` | `Depends(get_current_user)` a livello router (riga 43) | CRUD ricette, food cost, settings, import JSON, allergeni, service-types, storico FC, clone, PDF |
| Matching | `app/routers/foodcost_matching_router.py` | `/foodcost/matching` | router-level (riga 37-41) | Matching fatture → ingredienti, Smart Create, conversioni prezzi, esclusioni |
| Ingredienti | `app/routers/foodcost_ingredients_router.py` | `/foodcost/ingredients` | router-level (riga 37) | CRUD ingredienti, prezzi, conversioni custom, merge |
| Legacy | `app/routers/foodcost_router.py` | `/foodcost` | ⚠️ **NESSUNA auth** | 2 endpoint di sola lettura v1 (riepilogo costi), via `app/repositories/foodcost_repository.py` |

Registrazione in `main.py:635-638`. I 5 router delle Selezioni del Giorno (prefix `/macellaio/`, `/salumi/`, `/formaggi/`, `/pescato/`, `/piatti-giorno/`, `main.py:728-732`) sono documentati in [modulo_selezioni_giorno.md](modulo_selezioni_giorno.md).

⚠️ Il router legacy espone `GET /foodcost/ingredienti` (lista ingredienti + ultimo prezzo) e `GET /foodcost/ingredient/{id}` (ultimo prezzo + medie 30/90gg) **senza `Depends(get_current_user)`** — unico punto non autenticato del modulo, candidato a fix/rimozione (verificare se il FE lo usa ancora).

## 3.2 Endpoint (censimento completo, righe = `foodcost_*_router.py`)

### Ricette (`foodcost_recipes_router.py`)
- `GET /foodcost/ricette` (:1028) — lista con food cost calcolato in real-time. Filtri: `solo_basi`, `solo_piatti`, `kind` (dish|base), `service_type_id`, `search` (name/menu_name). Include `allergeni_calcolati` e `service_type_ids`
- `GET /foodcost/ricette/{id}` (:1202) — dettaglio con items arricchiti (`unit_cost`, `line_cost`), service_types, allergeni
- `POST /foodcost/ricette` (:1215) — crea ricetta con items (valida ingredient_id XOR sub_recipe_id); trigger ricalcolo allergeni
- `PUT /foodcost/ricette/{id}` (:1916) — aggiorna header (solo campi forniti) + replace items + replace servizi; trigger allergeni
- `DELETE /foodcost/ricette/{id}` (:2362) — soft delete (`is_active=0`)
- `DELETE /foodcost/ricette/{id}/hard` (:2386) — eliminazione DEFINITIVA (2026-06-07). 409 se usata come sub-ricetta o pubblicata su menu carta (`menu_dish_publications`). Cancella `recipe_items` + `recipe_service_types`, scollega `pranzo_menu_righe`/`pranzo_piatti` (snapshot storico intatto), poi DELETE `recipes`. UI: bottone "🗑 Elimina" in RicetteDettaglio + barra batch RicetteArchivio
- `POST /foodcost/ricette/{id}/clone` (:2468) — duplica ricetta ("<nome> (copia)"): header + items + service_types, ricalcolo allergeni, transazione atomica (Modulo L)
- `POST /foodcost/ricette/quick` (:2053) — crea piatto minimal dal wizard preventivi (resa 1 porzione, kind dish, servizi opzionali)
- `GET /foodcost/ricette/per-ingrediente/{ingredient_id}` (:1151) — ricette che usano un ingrediente, con qty, costo riga e incidenza % sul FC (tab "Ricette" della scheda ingrediente)
- `GET /foodcost/ricette/basi` (:1008) — lista ricette base per il selettore sub-ricette
- `GET /foodcost/ricette/categorie` (:825) / `POST` (:835) — categorie ricetta (POST idempotente per nome)
- `GET /foodcost/ricette/stats/dashboard` (:868) — KPI dashboard FC: totale ricette/basi, FC medio, critiche (>45%), buone (≤30%), top 5 FC alto, top 5 miglior margine
- `GET /foodcost/ricette/export/json` (:938) — export tutte le ricette attive (download JSON)
- `GET /foodcost/ricette/import/tracciato` (:1468) — tracciato JSON di esempio con istruzioni (riferimenti per NOME, procedimento come lista passi, voci "qb")
- `POST /foodcost/ricette/import/analizza` (:1564) — dry-run import: valida ricette, aggrega ingredienti/sotto-ricette referenziati con stato trovato / da_confermare (fuzzy ≥84) / nuovo + candidati (score ≥60)
- `POST /foodcost/ricette/import/conferma` (:1711) — esegue import: crea ingredienti placeholder decisi dall'utente, poi ricette in 2 passate (header + voci), risolve sotto-ricette anche interne al file; warnings per voci saltate
- `PUT /foodcost/ricette/{id}/servizi` (:2133) — sostituisce i tipi servizio associati al piatto
- `POST /foodcost/ricette/{id}/ricalcola-allergeni` (:2176) — ricalcolo cache allergeni singola ricetta
- `POST /foodcost/ricette/ricalcola-allergeni-tutti` (:2197) — batch su tutte le attive; **riservato superadmin/admin/chef** (403 altrimenti)
- `GET /foodcost/ricette/{id}/storico-fc` (:2214) — storico FC su finestra (default 180gg, `intervallo=mese|settimana`), delta 30/90gg, alert se variazione ≥20% (Modulo F.2, `app/services/foodcost_history_service.py`: snapshot con i prezzi vigenti a quella data)
- `GET /foodcost/ricette/{id}/pdf` (:2581) — scheda ricetta PDF con food cost, via mattone **M.B** (`pdf_brand.genera_pdf_html`, template `ricetta.html`)
- `GET /foodcost/settings` (:779) / `PUT` (:795) — `prezzo_strategia` + `prezzo_finestra_giorni` (1-730), self-heal tabella pre-mig 145. UI: Impostazioni Cucina · Prezzi & Food Cost
- `GET /foodcost/service-types` (:2237) / `POST` (:2260) / `PUT /{id}` (:2301) / `DELETE /{id}` (:2339, soft: active=0) — tipi servizio (Alla carta, Banchetto…) per menu/preventivi. UI: Impostazioni Cucina · Tipi Servizio

### Matching (`foodcost_matching_router.py`, prefix `/foodcost/matching`)
- `GET /pending` (:247) — righe fattura non associate (esclude: righe già a prezzo, righe ignorate, descrizioni escluse, fornitori con `escluso=1`). Filtri `fornitore`, `q` (testo), `escludi_collegati=1`
- `GET /suggest?riga_id=X` (:327) — suggerimenti per una riga: match sui mapping dello stesso fornitore (reason `exact_desc` se score >90, `same_supplier` se >50) + fuzzy su tutti gli ingredienti (score >40); top 10 arricchiti con fattore di conversione indovinato
- `POST /confirm` (:428) — conferma match → upsert `ingredient_supplier_map` + salva prezzo. Se il fattore non è passato viene indovinato (`_guess_conversion_factor`). Se l'unità non è convertibile, il match si salva ma il prezzo NO (detail esplicito)
- `POST /collega-multiplo` (:563) — collega N righe a un ingrediente in blocco (dalla pagina ingrediente); righe già a prezzo saltate; ritorna `prezzi_saltati` + `unita_da_configurare`
- `GET /fattore?riga_id&ingredient_id` (:689) — fattore di conversione suggerito (`safe=false` = da impostare a mano)
- `POST /correggi-conversione` (:731) — nuovo fattore su un mapping: ricalcola i prezzi storici del collegamento ripartendo da `original_price`
- `GET /converti-in-base?ingredient_id&qty&unit` (:804) — converte un contenuto dichiarato ("1 kg") nell'unità base via conversioni standard+custom (400 se impossibile)
- `POST /ricalcola-prezzi/{ingredient_id}` (:853) — fix 2026-06-07: ricalcola tutti i prezzi da fattura con le regole correnti (fattore mapping → conversioni standard/custom → parsing descrizione se safe). I non convertibili restano e vengono segnalati con le unità. UI: bottone "↻ Ricalcola prezzi" nella tab Prezzi della scheda ingrediente
- `POST /auto` (:972) — auto-match batch: match ESATTO supplier + descrizione (case-insensitive) sui mapping esistenti → salva prezzi
- `GET /mappings` (:1068, filtro `ingredient_id`) / `DELETE /mappings/{id}` (:1108) — mapping attivi
- `GET /suppliers` (:1140) — fornitori con righe pending + stato esclusione / `POST /suppliers/toggle-exclusion` (:1195) — scrive `fe_fornitore_categoria.escluso` (+`motivo_esclusione`)
- `POST /ignore-description` (:1255) / `GET /ignored-descriptions` (:1306) / `DELETE /ignored-descriptions/{id}` (:1326) — descrizioni non-ingrediente (trasporto, consulenze…): tabelle `matching_description_exclusions` + `matching_ignored_righe`
- `GET /smart-suggest` (:1655) — Smart Create: raggruppa le pending per descrizione pulita (`_clean_ingredient_name`, noise patterns), suggerisce nome/unità/categoria (keyword hints), segnala ingrediente simile esistente (fuzzy >60), flag BIO/DOP-IGP, fattore di conversione stimato per gruppo
- `POST /bulk-create` (:1821) — crea ingredienti in blocco (riusa se il nome esiste) + mapping + prezzi per tutte le righe collegate

### Ingredienti (`foodcost_ingredients_router.py`, prefix `/foodcost/ingredients`)
- `GET /foodcost/ingredients/` (:328) — lista con categoria, prezzo corrente (mediana finestra, fallback ultimo), ultimo fornitore, flag `placeholder` e `conversione_da_verificare` (mapping con unità di famiglia diversa e fattore=1). `inattivi=1` → i disattivati
- `POST /foodcost/ingredients/` (:444) — crea ingrediente (+ categoria al volo via `category_name`, + primo prezzo opzionale)
- `PUT /foodcost/ingredients/{id}` (:563) — aggiorna (anche `is_active`, `placeholder`); robusto a colonne mancanti
- `GET /foodcost/ingredients/{id}` (:696) — dettaglio (con flag placeholder)
- `POST /foodcost/ingredients/{id}/merge` (:612) — unisce un ingrediente (tipicamente placeholder da import) in un altro: ripunta recipe_items, prezzi, mapping, conversioni, poi elimina l'origine
- `GET /foodcost/ingredients/units` (:254) — unità suggerite (kg, g, L, ml, pz, cl)
- `GET /foodcost/ingredients/categories` (:270) / `POST` (:287) — categorie ingrediente
- `GET /foodcost/ingredients/suppliers` (:683) — fornitori (da `suppliers`)
- `GET /foodcost/ingredients/{id}/prezzi` (:738) / `POST` (:757) — storico prezzi / inserimento prezzo manuale
- `DELETE /foodcost/ingredients/prezzi/{prezzo_id}` (:803) — elimina una riga di prezzo
- `GET /foodcost/ingredients/{id}/conversions` (:843) / `POST` (:860, upsert) / `DELETE /conversions/{id}` (:916) — conversioni unità custom

### Legacy (`foodcost_router.py`, senza auth)
- `GET /foodcost/ingredienti` (:65) — lista ingredienti attivi + ultimo prezzo
- `GET /foodcost/ingredient/{id}` (:92) — ultimo prezzo + media 30gg + media 90gg

**Regole conversione prezzi fattura (fix 2026-06-07, caso Capperi 12,50 €/g):**
- ELIMINATO il fallback silenzioso in `_compute_unit_price` (matching_router:149): se l'unità fattura non è convertibile (PZ/CT/CF/NR/VS…) il prezzo NON viene salvato (prima entrava il prezzo a collo come €/unità-base). `collega-multiplo` e `confirm` riportano `prezzi_saltati` + `unita_da_configurare`.
- `convert_qty` (recipes_router:219): famiglie STRETTE (peso↔peso, volume↔volume, pz↔pz) — prima `pz` convertiva implicitamente a peso come 1 pz = 1 kg. pz→peso richiede conversione custom.
- Sinonimi unità fattura: GR, HG, LT, LIT + normalizzazione punti ("KG." → kg) via `_norm_unit`.
- Scheda ingrediente: fattore visibile e "Correggi" su OGNI collegamento (non solo sospetti) + hint ⚠ multipack se descrizione contiene X12/12x e fattore=1.
- Ingredienti a numero pesabili (base "n", es. tuorli): conversione custom "1 n = 20 g" → catena standard+custom converte da sola le fatture a peso (1 KG = 50 n) e le ricette a grammi. pz→n resta manuale (ambiguo). Catena lato destinazione in `_get_custom_conversion` (recipes_router:271), `_standard_convert` allineato a famiglie strette.

---

# 4. Schema database (`foodcost.db`)

Le connessioni del modulo passano da `get_cucina_connection()` (`app/models/cucina_db.py`) — oggi alias 1:1 di `get_foodcost_connection()` (Fase 0 dello split DB cucina, 2026-04-27; la Fase 1 punterà a `cucina.sqlite3`). Il matching usa direttamente `get_foodcost_connection()` per le query cross-cluster su `fe_*`.

## 4.1 Tabelle preesistenti (non si toccano — vive in Acquisti)

- `suppliers` — anagrafica fornitori (auto-creati da fatture XML; il matching li crea/riusa via `_get_or_create_supplier`)
- `fe_fatture` — fatture XML importate
- `fe_righe` — righe fatture XML
- `fe_fornitore_categoria` — qui vive il flag `escluso` usato dal matching (vedi §9)

## 4.2 Tabelle del modulo

| Tabella | Contenuto |
|---------|-----------|
| `ingredient_categories` | Categorie ingredienti (id, name, description) |
| `ingredients` | Anagrafica ingredienti (`name`, `codice_interno`, `default_unit`, `allergeni`, `note`, `is_active`, `placeholder` mig 136) |
| `ingredient_prices` | Storico prezzi multi-fornitore (mai sovrascritto) |
| `ingredient_supplier_map` | ⭐ La chiave di volta — mapping fornitore → ingrediente per auto-match |
| `ingredient_unit_conversions` | Conversioni unità personalizzate per ingrediente |
| `recipe_categories` | Categorie ricette (8 default: Antipasto, Primo, Secondo, Contorno, Dolce, Base, Salsa, Impasto) |
| `recipes` | Ricette (vedi §4.3) |
| `recipe_items` | Righe ricetta (`ingredient_id` OR `sub_recipe_id`, mutuamente esclusivi) |
| `service_types` | Tipi servizio (mig 074): Alla carta, Banchetto… (`name`, `sort_order`, `active`) |
| `recipe_service_types` | M:N ricetta ↔ tipo servizio (mig 074) |
| `foodcost_settings` | Riga singola id=1 (mig 145): `prezzo_strategia`, `prezzo_finestra_giorni` |
| `matching_description_exclusions` | Descrizioni ignorate nel matching |
| `matching_ignored_righe` | Righe fattura ignorate (FK a exclusions) |

Nello stesso DB vivono anche le tabelle delle **Selezioni del Giorno** (`macellaio_*`, `salumi_*`, `formaggi_*`, `pescato_*`, `piatti_giorno*`) e del menu carta/pranzo — documentate rispettivamente in [modulo_selezioni_giorno.md](modulo_selezioni_giorno.md), [modulo_menu_carta.md](modulo_menu_carta.md) e [modulo_pranzo.md](modulo_pranzo.md).

## 4.3 Schema dettaglio — tabelle principali (verificato via PRAGMA 2026-08-03)

### `ingredients`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | Nome standard interno (es. "Farina 00") |
| codice_interno | TEXT | Facoltativo |
| category_id | INT FK | → `ingredient_categories` |
| default_unit | TEXT | Unità base: kg, g, L, ml, pz, cl (+ basi custom tipo "n") |
| allergeni | TEXT | CSV libero (es. "glutine, latte") — sorgente della cache ricorsiva |
| note | TEXT | |
| is_active | INT | Default 1 |
| placeholder | INT | 1 = creato da import ricette, da completare/mergiare (mig 136) |
| created_at | TEXT | ⚠️ non esiste `updated_at` (il router lo gestisce con detect colonne) |

### `ingredient_supplier_map` ⭐ (tabella chiave)

> Collega una riga fattura al tuo ingrediente. Senza di lei il matching automatico non esiste.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| ingredient_id | INT FK | → `ingredients` |
| supplier_id | INT FK | → `suppliers` |
| codice_fornitore | TEXT | Codice articolo del fornitore (se in fattura) |
| descrizione_fornitore | TEXT | "FARINA 00 MOLINO SPADONI KG 25" |
| unita_fornitore | TEXT | Unità del fornitore (es. "CF", "PZ", "KG") |
| fattore_conversione | REAL | Quante unità base stanno in 1 unità fattura (CF da 25kg → 25.0) |
| is_default | INT | 1 = fornitore preferito per questo ingrediente |
| confirmed_by | TEXT | Username che ha confermato il match |
| created_at | TEXT | |

**Esempio concreto:** Molino Spadoni vende "FARINA 00 KG 25" a 18€/CF.
- `fattore_conversione` → 25.0 (1 CF = 25 kg)
- Prezzo convertito: 18 € / 25 = **0,72 €/kg** → salvato in `ingredient_prices`

### `ingredient_prices`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| ingredient_id | INT FK | |
| supplier_id | INT FK | |
| price_date | TEXT | Data fattura (o data inserimento manuale) |
| unit_price | REAL | Prezzo per unità base (€/kg, €/L, €/pz) — DOPO conversione |
| quantity, unit | REAL, TEXT | Usati dall'inserimento prezzo manuale (POST prezzi) |
| invoice_id | INT | Legacy v1 (FK sganciata con mig 138) |
| original_price | REAL | Prezzo originale fattura |
| original_unit | TEXT | Unità originale fattura |
| original_qty | REAL | Quantità originale fattura |
| fattura_id | INT FK | → `fe_fatture` |
| riga_fattura_id | INT FK | → `fe_righe` (chiave dell'idempotenza: riga già a prezzo = non più pending) |
| note | TEXT | es. "Auto da fattura #123" |
| created_at | TEXT | |

### `recipes`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | |
| category_id | INT FK | → `recipe_categories` (⚠️ non esiste una colonna testo `category`) |
| is_base | INT | 1 = ricetta-base usabile come sub-ricetta |
| yield_qty | REAL | Resa (4 porzioni, 2 kg, 500 ml) |
| yield_unit | TEXT | "porzioni", "kg", "g", "L", "ml" |
| selling_price | REAL | Prezzo vendita (NULL per basi) |
| prep_time | INT | Minuti preparazione |
| note | TEXT | |
| is_active | INT | Default 1 |
| menu_name, menu_description | TEXT | Nome/descrizione per menu e preventivi (mig 074) |
| kind | TEXT | 'dish' \| 'base' — derivato/derivante da `is_base` (mig 074) |
| allergeni_calcolati | TEXT | Cache CSV ricorsiva allergeni (Modulo C, mig 098) |
| istruzioni_impiattamento, tempo_servizio_minuti | TEXT, INT | Campi MEP/menu carta (mig 098) — usati dal modulo Cucina |
| procedimento | TEXT | Metodo di preparazione, un passo per riga (mig 137) |
| created_at, updated_at | TEXT | |

### `recipe_items`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| recipe_id | INT FK | → `recipes` (padre) |
| ingredient_id | INT FK | NULL se sub-ricetta |
| sub_recipe_id | INT FK | NULL se ingrediente |
| qty | REAL | Quantità usata (0 per voci "qb") |
| unit | TEXT | g, kg, ml, L, pz, "qb" |
| sort_order | INT | Ordine visualizzazione |
| note | TEXT | |
| created_at | TEXT | |

> ⚠️ **Vincolo:** esattamente UNO tra `ingredient_id` e `sub_recipe_id` deve essere valorizzato (validazione backend, non constraint SQL).

---

# 5. Calcolo Food Cost

## 5.1 Algoritmo (ricorsivo con cycle detection)

Implementazione: `_calc_recipe_cost` / `_calc_item_cost` (`foodcost_recipes_router.py:477-565`).

```
costo_ricetta = Σ (costo_riga per ogni item)
costo_per_unita = costo_ricetta / yield_qty

dove costo_riga =
  - se ingrediente: convert_qty(qty, unit, default_unit) × prezzo_corrente
                    (se la conversione fallisce: fallback qty × prezzo_corrente, es. "pz")
  - se sub-ricetta: convert_qty(qty, unit, yield_unit_sub) × (costo_sub / yield_qty_sub)
                    (chiamata ricorsiva)
```

**Cycle detection:** il set `visited` dei recipe_id già attraversati blocca i cicli (ricetta A usa B che usa A): il ramo ciclico ritorna `None` → quel costo risulta non calcolabile (nessun loop infinito; non viene sollevato un errore esplicito all'utente).

**Righe senza prezzo:** se un ingrediente non ha prezzi, la riga vale `None`; il totale ricetta resta calcolato con le righe prezzabili (>0) — il grado di completezza è visibile nello storico FC (`completezza_pct`).

## 5.2 Formule chiave

```
prezzo_corrente = MEDIANA(unit_price negli ultimi N giorni)   ← N da foodcost_settings, default 90
                  fallback: ultimo prezzo in assoluto

food_cost_pct = (costo_porzione / selling_price) × 100
```

## 5.3 Esempio concreto

**Crema Pasticcera** (ricetta-base, resa: 2 kg)

| Ingrediente | Qty | Unità | Costo/unità | Costo riga |
|-------------|-----|-------|-------------|------------|
| Latte intero | 1 | L | 1,20 €/L | 1,20 € |
| Zucchero | 250 | g | 0,90 €/kg | 0,23 € |
| Tuorli | 6 | pz | 0,15 €/pz | 0,90 € |
| Farina 00 | 80 | g | 0,72 €/kg | 0,06 € |
| Vaniglia | 1 | pz | 1,50 €/pz | 1,50 € |
| **Totale** | | | | **3,89 €** |
| **Costo/kg** | | | | **1,94 €/kg** |

**Crème Brûlée** (piatto finale, resa: 4 porzioni, vendita: 10 €)

| Ingrediente | Qty | Unità | Costo/unità | Costo riga |
|-------------|-----|-------|-------------|------------|
| **Crema Pasticcera** (sub) | 400 | g | 1,94 €/kg | 0,78 € |
| Zucchero di canna | 40 | g | 2,10 €/kg | 0,08 € |
| Panna fresca | 200 | ml | 4,50 €/L | 0,90 € |
| **Totale** | | | | **1,76 €** |
| **Costo/porzione** | | | | **0,44 €** |
| **Food cost %** | | | | **4,4%** |

**Cascata:** se il prezzo corrente del latte sale da 1,20 a 1,50 €/L → la crema pasticcera si aggiorna automaticamente → la crème brûlée si aggiorna → ogni dolce con quella crema si aggiorna. Tutto in real-time a ogni GET, senza job batch (nessun costo è persistito).

## 5.4 Auto-normalizzazione prezzi

`_save_price_from_riga` (matching_router:200) salva in `ingredient_prices` il prezzo già convertito nell'unità base dell'ingrediente, calcolato da `_compute_unit_price` (:149): prima il fattore esplicito del mapping (prezzo/fattore), poi la conversione automatica unità fattura → `default_unit` (standard + custom), infine — se l'unità fattura coincide con la base — il prezzo così com'è. In tutti gli altri casi il prezzo NON viene salvato (vedi fix Capperi, §3.2).

## 5.5 Storico FC (Modulo F.2) e allergeni (Modulo C)

- **Storico:** `compute_recipe_fc_history` (`app/services/foodcost_history_service.py`) ricostruisce il FC a snapshot mensili/settimanali usando per ogni data l'**ultimo prezzo vigente a quella data** (non la mediana) — serve al grafico trend nella scheda ricetta e ai delta 30/90gg con flag alert ≥20%.
- **Allergeni:** `app/services/allergeni_service.py` — pipeline `ingredients.allergeni` (CSV libero) → `recipes.allergeni_calcolati` (unione ricorsiva con protezione cicli, CSV lowercase ordinato) → `menu_dish_publications.allergeni_dichiarati` (override per-pubblicazione lato Menu Carta). Ricalcolo automatico su POST/PUT/clone ricetta, on-demand singolo o batch (endpoint §3.2).

---

# 6. Matching fatture XML → ingredienti

## 6.1 Pipeline

```
IMPORT XML (modulo Acquisti)
  │
  ▼
Per ogni riga fattura (fe_righe) pending:
  │   (pending = senza prezzo, non ignorata, descrizione non esclusa,
  │    fornitore non escluso)
  │
  ├─ 1. POST /auto — match ESATTO in ingredient_supplier_map
  │     (supplier_id + descrizione_fornitore, case-insensitive)
  │     ├─ TROVATO → prezzo salvato automaticamente ✅
  │     └─ NON TROVATO → resta pending
  │
  ├─ 2. UI "Da associare": GET /suggest per riga
  │     (mapping stesso fornitore score>50; fuzzy su ingredienti score>40;
  │      "match sicuro" reason exact_desc quando score>90)
  │
  └─ 3. L'utente conferma/corregge (confirm / collega-multiplo / Smart Create)
        ├─ Salva in ingredient_supplier_map (la prossima volta auto)
        └─ Crea record in ingredient_prices con prezzo convertito
           (o segnala prezzo saltato se unità non convertibile)
```

**Smart Create** (`/smart-suggest` + `/bulk-create`): pipeline di pulizia nomi (rimozione codici, lotti, pesi, date, BIO/DOP come flag) + grouping per descrizione normalizzata + suggerimenti unità/categoria (keyword) + fattore confezione stimato dalla descrizione. Permette di creare 10+ ingredienti in batch invece che uno alla volta.

**Auto-match per fatture successive:** dopo la prima conferma, tutte le fatture future di quel fornitore per quell'articolo sono agganciate da `POST /auto`. Prezzo aggiornato senza intervento.

## 6.2 Tab UI `/ricette/matching` (4 tab — chiavi interne `pending|smart|mappings|fornitori`)

1. **Da associare** — righe fattura "non abbinate", con suggerimenti
2. **Smart Create** — grouping di descrizioni simili, creazione batch
3. **Mappings** — lista mapping attivi, possibilità di eliminare
4. **Fornitori** — toggle esclusione fornitori non pertinenti (servizi, attrezzature, ecc.)

---

# 7. Conversioni unità di misura

Sistema a **3 livelli** (`convert_qty`, recipes_router:219):

1. **Custom per ingrediente** (tabella `ingredient_unit_conversions`):
   - Diretta: `1 CF → 25 kg` — Inversa automatica: `1/fattore`
   - **Chain resolution lato origine:** `pz → kg` via `pz → g (custom) × g → kg (standard)`
   - **Chain resolution lato destinazione** (fix 2026-06-07): `kg → n` via `kg → g (standard) × g → n (custom inversa)` — copre gli ingredienti contati a numero comprati a peso
2. **Standard:**
   - Peso: kg=1, g=0.001, mg, + sinonimi fattura gr/hg
   - Volume: L=1, ml=0.001, cl=0.01, + sinonimi lt/lit
   - Conta: pz=1
3. **Compatibilità STRETTA per famiglia** (fix 2026-06-07): solo peso↔peso, volume↔volume, pz↔pz. Mai peso↔volume senza densità (non implementato — richiederebbe campo `densita`, voce roadmap). pz↔peso/volume SOLO via conversione custom.

**UI conversioni:** `/ricette/ingredienti/:id/prezzi` — sezione conversioni custom con add/remove inline (upsert su coppia from/to).

---

# 8. Frontend

Cartella: `frontend/src/pages/ricette/` (route in `App.jsx:289-321`).

| Pagina | Route | Funzione |
|--------|-------|----------|
| — (redirect) | `/ricette` | `ModuleRedirect`: smista su dashboard/archivio/ingredienti/matching/settings in base ai permessi sub-modulo (non esiste più una pagina hub `RicetteMenu`) |
| `RicetteNuova.jsx` | `/ricette/nuova` | Form creazione con sub-ricette |
| `RicetteArchivio.jsx` | `/ricette/archivio` | Lista con FC%, filtri, azioni batch: stampa PDF, clone, cambia categoria, export JSON, disattiva/elimina |
| `RicetteDettaglio.jsx` | `/ricette/:id` | Costi calcolati, grafico storico FC, ricalcolo allergeni, hard delete |
| `RicetteModifica.jsx` | `/ricette/modifica/:id` | Form modifica |
| `RicetteImport.jsx` | `/ricette/import` | Import JSON: upload → analizza (dry-run) → conferma con risoluzione ingredienti/sotto-ricette |
| `RicetteIngredienti.jsx` | `/ricette/ingredienti` | Anagrafica ingredienti (prezzo corrente mediana, placeholder, sospetti conversione) |
| `RicetteIngredientiPrezzi.jsx` | `/ricette/ingredienti/:id/prezzi` | Scheda ingrediente: storico prezzi, collegamenti+fattori, conversioni, ricalcolo, merge, tab Ricette |
| `RicetteMatching.jsx` | `/ricette/matching` | 4 tab matching (vedi §6.2) |
| `RicetteDashboard.jsx` | `/ricette/dashboard` | 5 KPI + tabelle top FC e margini (da `/ricette/stats/dashboard`) |
| `RicetteSettings.jsx` | `/ricette/settings` | Impostazioni Cucina (admin) — **sidebar a sezioni, non tab**: Export JSON, Schede PDF, Import JSON, Scelta Macellaio/Pescato/Salumi/Formaggi (categorie+widget), Widget Home, Tipi Servizio, Menu Pranzo (`PranzoSettingsPanel`), Prezzi & Food Cost (`FoodcostSettingsPanel`), Allergeni (batch), QR Carta Menu |

Componenti condivisi del modulo: `RicetteNav.jsx` (sub-nav persistente: Cucina / Ricette / Ingredienti / Spesa / Menu / Food Cost (admin+sommelier) / Impostazioni (admin)), `MenuToggle.jsx`. Le route `/menu-carta`, `/pranzo`, `/cucina/dashboard`, `/cucina/spesa` sono agganciate ai permessi del modulo `ricette` ma documentate nelle rispettive pagine wiki.

Dropdown header (`config/modulesMenu.js`, key `ricette` "Gestione Cucina"): Dashboard Cucina, Lista Spesa, Archivio, Ingredienti, Matching (admin), Dashboard FC, Selezioni · Macellaio/Pescato/Salumi/Formaggi, Menu Carta, Menu Pranzo, Impostazioni (admin).

**Pattern UI consolidati TRGB:** sidebar filtri a sinistra, `SortTh` per colonne ordinabili, toast per feedback, palette `bg-brand-cream`. Touch target 44pt minimo.

---

# 9. Esclusioni e cooperazione con Acquisti

⚠️ **REGOLA CRITICA (vedi `CLAUDE.md`):**
- `fe_fornitore_categoria.escluso` → SOLO per modulo Ricette/Matching (esclude fornitori non pertinenti da pending/smart-suggest). Letto in `foodcost_matching_router.py:312` e :1685, scritto da `POST /suppliers/toggle-exclusion` (:1195)
- `fe_fornitore_categoria.escluso_acquisti` → SOLO per modulo Acquisti (esclude da dashboard/KPI). MAI toccato da questo modulo
- **NON mescolare mai** i due campi.

**Flusso operativo cooperante:**
1. Acquisti importa XML/FIC → `fe_fatture` + `fe_righe`
2. Ricette/Matching legge `fe_righe`, filtra per fornitori non esclusi (`COALESCE(fc.escluso,0)=0`)
3. Smart Create grouping + fuzzy suggest
4. Conferma match → `ingredient_supplier_map` + `ingredient_prices`

---

# 10. Roadmap modulo (sintesi — dettaglio in `roadmap.md` §R)

- ✅ FATTO — Storico variazione costi ricette (Modulo F.2: endpoint storico-fc + grafico in scheda ricetta)
- ✅ FATTO — Export PDF ricette con costi (mattone M.B `pdf_brand`, endpoint `/ricette/{id}/pdf` + sezione "Schede PDF" in Impostazioni)
- Dashboard per reparto (cucina / pasticceria / cocktail)
- Collegamento consumi → magazzino (scarico ingredienti da ricetta)
- Sistema permessi centralizzato (M.G)
- Voci R.12, R.13, R.15 della vecchia roadmap **ELIMINATE** (decisione Marco, Batch 2)
- Voce R.5 vive nel modulo Cucina (gestione vendite)

## 10.1 Debt tecnico

- Nessuna densità ingredienti → impossibile peso↔volume (workaround: conversione custom per ingrediente)
- Allergeni sorgente come stringa libera su `ingredients.allergeni` (no tabella lookup UE) — la cache `allergeni_calcolati` normalizza solo lowercase/ordinamento, non i sinonimi
- `foodcost_router.py` legacy: 2 endpoint pubblici senza auth (§3.1) — da proteggere o rimuovere
- `foodcost_settings.prezzo_strategia` presente a schema ma non letto dal calcolo (mediana hardwired)
- Mappings molti-a-uno potenzialmente confondenti se più fornitori hanno articoli con stesso `codice_fornitore` (collisione gestita ma da loggare)

## 10.2 Storia / context

Il modulo è stato **riscritto v2 a marzo 2026** per introdurre lo schema multi-fornitore con `ingredient_supplier_map`. La v1 aveva `recipes`/`recipe_items` con schema diverso, è stata buttata via (clean rebuild, mig 004/007). Le tabelle `suppliers`, `fe_fatture`, `fe_righe` sono rimaste intatte (sono la base dati di Acquisti).

Le tabelle `invoices`/`invoice_lines` (vecchio schema duplicato in `foodcost.db`) sono state eliminate (residuo: colonna `ingredient_prices.invoice_id`, FK sganciata con mig 138). Anche `app/routers/ricette.py` (router orfano, mai registrato) e `app/models/ricette_db.py` (model orfano, DB inesistente) sono stati rimossi.
