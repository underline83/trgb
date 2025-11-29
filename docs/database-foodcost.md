# TRGB – Database `foodcost.db`
_Versione schema: migrazione 004_foodcost_full_schema_

## Obiettivo del database

`foodcost.db` gestisce tutto ciò che riguarda:

- **ingredienti** (anagrafica unica, categorie, unità di misura)
- **fornitori**
- **storico prezzi** multi-fornitore
- **fatture elettroniche** (XML) e relative righe
- **ricette** e collegamento ricette ↔ ingredienti
- integrazione con:
  - interfaccia web (React)
  - import XML da fatture elettroniche
  - GPT (generazione JSON ricette/ingredienti importabili)

---

## Panoramica tabelle

---

## 1. `suppliers`
Anagrafica fornitori.

| Colonna         | Tipo   | Note                                |
|-----------------|--------|-------------------------------------|
| id              | INT PK | Autoincrement                       |
| name            | TEXT   | Nome fornitore                      |
| codice_fiscale  | TEXT   | Opzionale                           |
| partita_iva     | TEXT   | Opzionale                           |
| codice_sdi      | TEXT   | SdI                                 |
| pec             | TEXT   | PEC                                 |
| note            | TEXT   | Note                                |
| created_at      | TEXT   | Timestamp                           |

---

## 2. `ingredient_categories`
Categorie standard degli ingredienti.

| Colonna      | Tipo   | Note                   |
|--------------|--------|------------------------|
| id           | INT PK | Autoincrement          |
| name         | TEXT   | Nome univoco           |
| description  | TEXT   | Descrizione libera     |

---

## 3. `ingredients`
Anagrafica principale ingredienti.

| Colonna        | Tipo   | Note                                              |
|----------------|--------|---------------------------------------------------|
| id             | INT PK | Autoincrement                                     |
| name           | TEXT   | Nome ingrediente                                  |
| codice_interno | TEXT   | Codice SKU interno                                |
| category_id    | INT FK | → ingredient_categories.id                        |
| default_unit   | TEXT   | Unità base (kg, g, L, ml, pz…)                    |
| allergeni      | TEXT   | Testo libero                                      |
| note           | TEXT   | Note operative                                    |
| is_active      | INT    | Default 1                                         |
| created_at     | TEXT   | Timestamp                                         |

---

## 4. `ingredient_prices`
Storico prezzi reali, multi-fornitore.

| Colonna        | Tipo   | Note                                                     |
|----------------|--------|----------------------------------------------------------|
| id             | INT PK |                                                        |
| ingredient_id  | INT FK | → ingredients.id                                        |
| supplier_id    | INT FK | → suppliers.id                                          |
| price_date     | TEXT   | Data prezzo (tipicamente data fattura)                 |
| unit_price     | REAL   | Prezzo per `default_unit`                               |
| quantity       | REAL   | Quantità confezione (5 kg, 1 L…)                        |
| unit           | TEXT   | Unità confezione                                        |
| invoice_id     | INT FK | → invoices.id                                           |
| note           | TEXT   | Note                                                     |
| created_at     | TEXT   | Timestamp                                               |

---

## 5. `invoices`
Fatture elettroniche importate.

| Colonna       | Tipo   | Note                                    |
|---------------|--------|-----------------------------------------|
| id            | INT PK |                                         |
| supplier_id   | INT FK | → suppliers.id                          |
| numero        | TEXT   | Numero fattura                          |
| data_fattura  | TEXT   | Data fattura                            |
| imponibile    | REAL   | Opzionale                               |
| totale        | REAL   | Opzionale                               |
| currency      | TEXT   | Default EUR                             |
| xml_filename  | TEXT   | Nome/percorso file XML                  |
| created_at    | TEXT   | Timestamp                               |

---

## 6. `invoice_lines`
Dettagli righe fattura.

| Colonna        | Tipo   | Note                                  |
|----------------|--------|---------------------------------------|
| id             | INT PK |                                       |
| invoice_id     | INT FK | → invoices.id                         |
| ingredient_id  | INT FK | Nullable (non mappata ancora)         |
| descrizione    | TEXT   | Descrizione riga                      |
| qty            | REAL   | Quantità                              |
| unit           | TEXT   | Unit (kg, L, pz…)                     |
| unit_price     | REAL   | Prezzo unitario                       |
| total_line     | REAL   | Totale riga                           |
| note           | TEXT   | Note (mapping, note operative)        |
| created_at     | TEXT   | Timestamp                             |

---

## 7. `recipes`
Anagrafica ricette.

| Colonna       | Tipo   | Note                                  |
|---------------|--------|----------------------------------------|
| id            | INT PK |                                        |
| name          | TEXT   | Nome ricetta                           |
| category      | TEXT   | ANTIPASTO, PRIMO, DOLCE…               |
| yield_qty     | REAL   | Resa                                   |
| yield_unit    | TEXT   | Unità resa                             |
| notes         | TEXT   | Note tecniche                          |
| is_active     | INT    | Default 1                              |
| created_at    | TEXT   | Timestamp                              |

---

## 8. `recipe_items`
Dettagli ingredienti ricetta.

| Colonna        | Tipo   | Note                                  |
|----------------|--------|---------------------------------------|
| id             | INT PK |                                       |
| recipe_id      | INT FK | → recipes.id                          |
| ingredient_id  | INT FK | → ingredients.id                      |
| qty            | REAL   | Quantità riferita alla resa           |
| unit           | TEXT   | Unità (g, kg, L, pz…)                 |
| note           | TEXT   | Note operative                        |
| order_index    | INT    | Ordine riga                           |
| created_at     | TEXT   | Timestamp                             |

---

## Relazioni principali

- `suppliers` → `ingredient_prices`, `invoices`
- `ingredient_categories` → `ingredients`
- `ingredients` → `ingredient_prices`, `recipe_items`, `invoice_lines`
- `invoices` → `invoice_lines`
- `recipes` → `recipe_items`

---

## Convenzioni operative

### Unità
- `default_unit` negli ingredienti = unità di base per calcolo costi.
- `ingredient_prices.unit` = unità reale della confezione.

### Categorie
- Gestite in `ingredient_categories` per evitare duplicati.
- UI: dropdown fisso, non testo libero.

### Prezzi
- Mai sovrascritti → ogni fattura crea una nuova riga storico.
- Possibile calcolare:
  - ultimo prezzo
  - media 30/90 giorni

### Ricette
- `yield_qty` + `yield_unit` definiscono la resa base.
- `qty` degli ingredienti sempre riferito a questa resa.

---

## Note future (estensioni previste)

- `recipe_components` (ricette composte)
- automatismi import XML → ingredient_prices
- sistema mapping semiautomatico descrizione→ingrediente
- supporto multi-magazzino (opzionale)

---

Questo documento è la **fonte di verità** per `foodcost.db`.  
Ogni modifica allo schema richiede:

1. una nuova migrazione `00X_nome.py`,  
2. aggiornamento di questo documento,  
3. verifica backend + frontend.