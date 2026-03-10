# Modulo Ricette & Food Cost v2 — Design Document
**Data:** 2026-03-10
**Stato:** BOZZA — da approvare prima dello sviluppo

---

# 1. Obiettivi

1. **Raccogliere ricette** — cucina e pasticceria, con sub-ricette (una crema base diventa ingrediente di N dolci)
2. **Food cost preciso** — costo porzione + % sul prezzo di vendita, aggiornato automaticamente quando cambiano i prezzi
3. **Prezzi da fatture XML** — aggancio automatico riga fattura → ingrediente, con gestione multi-fornitore (codici diversi, prezzi diversi, unità diverse)

---

# 2. Concetti chiave

## 2.1 Ingrediente vs Ricetta-base
Un **ingrediente** è una materia prima che compri (farina, burro, latte).
Una **ricetta-base** è qualcosa che produci e che diventa componente di altre ricette (crème pâtissière, brodo, pasta frolla).

Nella tabella `recipe_items`, ogni riga punta a un ingrediente OPPURE a una sub-ricetta. Questo permette di annidare a N livelli: una ricetta usa una base che usa un'altra base.

## 2.2 Prezzo ingrediente = ultimo prezzo fattura
Il costo di un ingrediente è l'**ultimo prezzo unitario** ricavato dall'ultima fattura importata per quell'ingrediente. Non una media — il prezzo reale attuale.

Il sistema tiene tutto lo storico, quindi puoi vedere le variazioni, ma il food cost usa sempre il prezzo più recente.

## 2.3 Costo ricetta-base = somma ingredienti / resa
Se la "Crema Pasticcera" rende 2 kg e usa 3€ di ingredienti, il suo costo è 1,50 €/kg. Quando la usi in un dolce (es. 200g), il costo di quella riga è 0,30€.

## 2.4 Matching fatture → ingredienti (il pezzo smart)
Ogni fornitore chiama gli ingredienti a modo suo:
- Fornitore A: "FARINA 00 MOLINO SPADONI KG 25" → Farina 00
- Fornitore B: "FARINA T.00 SACCO 25KG" → Farina 00

Serve una **tabella di mapping** che collega la descrizione/codice del fornitore al tuo ingrediente. La prima volta confermi manualmente, poi il sistema ricorda.

---

# 3. Schema Database (nuovo, su `foodcost.db`)

```
TABELLE ESISTENTI (non si toccano):
├── suppliers              — anagrafica fornitori (da fatture XML)
├── fe_fatture             — fatture XML importate
├── fe_righe              — righe fatture XML

TABELLE DA RICREARE (clean):
├── ingredient_categories  — categorie ingredienti
├── ingredients            — anagrafica ingredienti base
├── ingredient_prices      — storico prezzi (da fatture)
├── recipes                — ricette (cucina, pasticceria, basi)
├── recipe_items           — righe ricetta (ingrediente O sub-ricetta)

TABELLE NUOVE:
├── ingredient_supplier_map — mapping fornitore→ingrediente (il pezzo smart)
```

## 3.1 `ingredient_categories`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT UNIQUE | Latticini, Farine, Carni, Verdure, Spezie... |
| description | TEXT | |

## 3.2 `ingredients`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | Nome standard interno (es. "Farina 00") |
| category_id | INT FK | → ingredient_categories |
| default_unit | TEXT | Unità base: kg, g, L, ml, pz |
| allergeni | TEXT | Glutine, Lattosio, Uova... |
| note | TEXT | |
| is_active | INT | Default 1 |
| created_at | TEXT | |
| updated_at | TEXT | |

## 3.3 `ingredient_supplier_map` ⭐ (NUOVO)
> La chiave di volta. Collega una riga fattura al tuo ingrediente.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| ingredient_id | INT FK | → ingredients |
| supplier_id | INT FK | → suppliers (da fatture XML) |
| codice_fornitore | TEXT | Codice articolo del fornitore (se presente in fattura) |
| descrizione_fornitore | TEXT | Come il fornitore lo chiama (es. "FARINA 00 MOLINO SPADONI") |
| unita_fornitore | TEXT | Unità di misura usata dal fornitore (es. "CF", "PZ", "KG") |
| fattore_conversione | REAL | Moltiplicatore per convertire in unità base (es. CF da 25kg → 25.0) |
| is_default | INT | 1 = fornitore preferito per quest'ingrediente |
| confirmed_by | TEXT | Username che ha confermato il match |
| created_at | TEXT | |

**Esempio concreto:**
Il fornitore "Molino Spadoni" ti vende "FARINA 00 KG 25" a 18€ per confezione.
- `ingredient_id` → il tuo ingrediente "Farina 00"
- `codice_fornitore` → "ART-4521" (dal XML)
- `descrizione_fornitore` → "FARINA 00 MOLINO SPADONI KG 25"
- `unita_fornitore` → "CF" (confezione)
- `fattore_conversione` → 25.0 (1 CF = 25 kg)
- Prezzo convertito: 18€ / 25 = 0,72 €/kg → salvato in `ingredient_prices`

## 3.4 `ingredient_prices`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| ingredient_id | INT FK | → ingredients |
| supplier_id | INT FK | → suppliers |
| unit_price | REAL | Prezzo per unità base (€/kg, €/L, €/pz) — DOPO conversione |
| original_price | REAL | Prezzo originale in fattura (prima della conversione) |
| original_unit | TEXT | Unità originale fattura |
| original_qty | REAL | Quantità originale fattura |
| fattura_id | INT FK | → fe_fatture.id |
| riga_fattura_id | INT FK | → fe_righe.id |
| price_date | TEXT | Data fattura |
| note | TEXT | |
| created_at | TEXT | |

## 3.5 `recipes`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | "Crème brûlée", "Brodo vegetale", "Risotto zafferano" |
| category | TEXT | ANTIPASTO, PRIMO, SECONDO, CONTORNO, DOLCE, BASE, SALSA, IMPASTO |
| is_base | INT | 1 = ricetta-base (usabile come sub-ricetta), 0 = piatto finale |
| yield_qty | REAL | Resa: 4 (porzioni), 2 (kg), 500 (ml) |
| yield_unit | TEXT | "porzioni", "kg", "g", "L", "ml" |
| selling_price | REAL | Prezzo di vendita al cliente (NULL per basi) |
| prep_time | INT | Minuti di preparazione |
| note | TEXT | |
| is_active | INT | Default 1 |
| created_at | TEXT | |
| updated_at | TEXT | |

## 3.6 `recipe_items`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| recipe_id | INT FK | → recipes (la ricetta "padre") |
| ingredient_id | INT FK | → ingredients (NULL se è sub-ricetta) |
| sub_recipe_id | INT FK | → recipes (NULL se è ingrediente) |
| qty | REAL | Quantità usata |
| unit | TEXT | Unità (g, kg, ml, L, pz) |
| sort_order | INT | Ordine visualizzazione |
| note | TEXT | |
| created_at | TEXT | |

> **Vincolo**: esattamente UNO tra `ingredient_id` e `sub_recipe_id` deve essere valorizzato.

---

# 4. Calcolo Food Cost

## 4.1 Costo ingrediente base
```
costo = ultimo prezzo da ingredient_prices (ORDER BY price_date DESC LIMIT 1)
```

## 4.2 Costo sub-ricetta (ricorsivo)
```
costo_ricetta = Σ (costo_riga per ogni item)
costo_per_unità = costo_ricetta / yield_qty

dove costo_riga =
  - se ingrediente: qty × prezzo_unitario_ingrediente (convertito nell'unità giusta)
  - se sub-ricetta: qty × costo_per_unità_sub_ricetta (ricorsivo)
```

## 4.3 Food cost % su vendita
```
food_cost_pct = (costo_porzione / selling_price) × 100
```

## 4.4 Esempio concreto

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

**Crème Brûlée** (piatto finale, resa: 4 porzioni, vendita: 10€)
| Ingrediente | Qty | Unità | Costo/unità | Costo riga |
|-------------|-----|-------|-------------|------------|
| **Crema Pasticcera** (sub) | 400 | g | 1,94 €/kg | 0,78 € |
| Zucchero di canna | 40 | g | 2,10 €/kg | 0,08 € |
| Panna fresca | 200 | ml | 4,50 €/L | 0,90 € |
| **Totale** | | | | **1,76 €** |
| **Costo/porzione** | | | | **0,44 €** |
| **Food cost %** | | | | **4,4%** |

Se il fornitore alza il prezzo del latte da 1,20 a 1,50 → la crema pasticcera si aggiorna → la crème brûlée si aggiorna → tutto a cascata.

---

# 5. Flusso matching fattura → ingrediente

```
IMPORT XML
  │
  ▼
Per ogni riga fattura (fe_righe):
  │
  ├─ 1. Cerca match ESATTO in ingredient_supplier_map
  │     (supplier_id + codice_fornitore O descrizione_fornitore)
  │     ├─ TROVATO → aggiorna prezzo automaticamente ✅
  │     └─ NON TROVATO → vai a 2
  │
  ├─ 2. Cerca match FUZZY (Levenshtein su descrizione)
  │     ├─ Match > 80% → suggerisci all'utente
  │     └─ Nessun match → mostra come "non abbinata"
  │
  └─ 3. L'utente conferma/corregge il match
        ├─ Salva in ingredient_supplier_map (la prossima volta sarà automatico)
        └─ Crea record in ingredient_prices con prezzo convertito
```

**Dopo la prima conferma**, tutte le fatture future di quel fornitore per quell'articolo saranno agganciate automaticamente → prezzo aggiornato senza intervento.

---

# 6. Pagine Frontend (previste)

| Pagina | Funzione |
|--------|----------|
| `/ricette` | Menu principale modulo |
| `/ricette/nuova` | Crea/modifica ricetta con ingredienti + sub-ricette inline |
| `/ricette/archivio` | Lista ricette con ricerca, filtri, food cost in tempo reale |
| `/ricette/:id` | Scheda ricetta dettagliata con costi calcolati |
| `/ricette/ingredienti` | Anagrafica ingredienti + categorie |
| `/ricette/ingredienti/:id` | Dettaglio ingrediente con storico prezzi |
| `/ricette/matching` | UI per abbinare righe fattura → ingredienti (il pezzo smart) |
| `/ricette/dashboard` | Dashboard food cost: alert costi alti, variazioni, trend |

---

# 7. Cosa si elimina

- `app/routers/ricette.py` — router orfano, mai registrato
- `app/models/ricette_db.py` — model orfano, DB inesistente
- Tabelle vecchie in foodcost.db: `invoices`, `invoice_lines` (duplicate di fe_fatture/fe_righe)
- Tabelle `recipes` e `recipe_items` attuali → ricreate con nuovo schema

Le tabelle `suppliers`, `fe_fatture`, `fe_righe` restano intatte — sono la base dati su cui si costruisce il matching.

---

# 8. Fasi di sviluppo proposte

| Fase | Contenuto | Priorità |
|------|-----------|----------|
| **1** | DB nuovo schema + CRUD ingredienti/categorie + API | Alta |
| **2** | CRUD ricette con sub-ricette + calcolo food cost | Alta |
| **3** | Matching fatture → ingredienti + aggiornamento prezzi | Alta |
| **4** | Frontend: form ricetta + archivio + scheda costi | Alta |
| **5** | Dashboard food cost + alert | Media |
| **6** | Export PDF scheda ricetta | Media |
