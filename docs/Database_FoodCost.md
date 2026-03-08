# TRGB – Database `foodcost.db`
_Versione schema: migrazione 005 (ultima applicata)_
_Ultimo aggiornamento: 2026-03-08_

## Obiettivo del database

`foodcost.db` gestisce tutto ciò che riguarda:

- **ingredienti** (anagrafica unica, categorie, unità di misura)
- **fornitori**
- **storico prezzi** multi-fornitore
- **fatture elettroniche XML** (`fe_fatture` + `fe_righe`)
- **ricette** e collegamento ricette ↔ ingredienti

Le tabelle `fe_fatture` e `fe_righe` sono create a runtime da `fe_import.py` (NON da migrazione dedicata — task #19 Roadmap).

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

## 5. `fe_fatture`
Fatture elettroniche XML importate (tabella reale — creata a runtime da `fe_import.py`).

> ⚠️ Questa tabella si chiama `fe_fatture`, NON `invoices`. Il nome `invoices` era nella pianificazione iniziale ma non è stato mai implementato.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | Autoincrement |
| fornitore_nome | TEXT | Nome fornitore estratto dall'XML |
| fornitore_piva | TEXT | Partita IVA fornitore |
| numero_fattura | TEXT | Numero documento |
| data_fattura | TEXT | Data (YYYY-MM-DD) |
| imponibile_totale | REAL | Imponibile totale |
| iva_totale | REAL | IVA totale |
| totale_fattura | REAL | Totale fattura |
| valuta | TEXT | Default EUR |
| xml_hash | TEXT | SHA-256 del file XML (anti-duplicazione) |
| xml_filename | TEXT | Nome file originale |
| data_import | TEXT | Timestamp import |

---

## 6. `fe_righe`
Righe delle fatture elettroniche (tabella reale — creata a runtime da `fe_import.py`).

> ⚠️ Questa tabella si chiama `fe_righe`, NON `invoice_lines`.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| fattura_id | INT FK | → fe_fatture.id |
| numero_linea | INT | Progressivo riga |
| descrizione | TEXT | Descrizione riga fattura |
| quantita | REAL | Quantità |
| unita_misura | TEXT | Unità (kg, pz, L…) |
| prezzo_unitario | REAL | Prezzo per unità |
| prezzo_totale | REAL | Totale riga |
| aliquota_iva | REAL | % IVA |
| categoria_grezza | TEXT | Categoria estratta (facoltativa) |
| note_analisi | TEXT | Note operative |

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

- `suppliers` → `ingredient_prices`
- `ingredient_categories` → `ingredients`
- `ingredients` → `ingredient_prices`, `recipe_items`
- `fe_fatture` → `fe_righe`
- `recipes` → `recipe_items`

> Nota: non esiste ancora un collegamento tra `fe_righe` e `ingredients` — è previsto nella Fase 2 del Modulo FE XML (task #16 Roadmap)

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