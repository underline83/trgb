# Database — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-08

Il progetto usa **SQLite** con un file per dominio funzionale. Tutti i file sono in `app/data/`.

| File | Moduli | Schema |
|------|--------|--------|
| `vini.sqlite3` | Carta Vini, Magazzino Vini | v2.1 — creato da `vini_db.py` |
| `vini_settings.sqlite3` | Settings Carta Vini | v1.4 — creato da `vini_settings.py` |
| `foodcost.db` | FoodCost, Fatture XML | v1.6 — gestito da `migration_runner.py` (migrazioni 001–005) |
| `dipendenti.sqlite3` | Dipendenti & Turni | v1.0 — creato a runtime da `dipendenti_db.py` |

---

# 1. `vini.sqlite3`
_Gestisce la Carta dei Vini. È un DB operazionale: sovrascritto ad ogni import Excel._

## Tabella `vini`
Tabella unica con tutte le informazioni per generazione carta, ricerca, ordinamento, scorte.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | Autoincrement |
| TIPOLOGIA | TEXT | Categoria macro (es. BIANCHI ITALIA) |
| NAZIONE | TEXT | Italia, Francia… |
| CODICE | TEXT | Codice regione (IT01, FR05…) |
| REGIONE | TEXT | Regione vino (Lombardia, Champagne…) |
| CARTA | TEXT | 'SI' o 'NO' — inclusione nella carta |
| DESCRIZIONE | TEXT | Nome vino / denominazione |
| ANNATA | TEXT | Anno o "s.a." |
| PRODUTTORE | TEXT | Produttore |
| PREZZO | REAL | Prezzo ristorante |
| FORMATO | TEXT | MN, DM, MG, CL… (validato con CHECK) |
| N_FRIGO | INT | Bottiglie in frigorifero |
| N_LOC1 | INT | Bottiglie in locazione 1 |
| N_LOC2 | INT | Bottiglie in locazione 2 |
| QTA | INT | Totale disponibile |
| IPRATICO | TEXT | Campo interno |
| DENOMINAZIONE | TEXT | Denominazione ufficiale |
| FRIGORIFERO | TEXT | Testo libero |
| LOCAZIONE_1 | TEXT | Nome locazione 1 |
| LOCAZIONE_2 | TEXT | Nome locazione 2 |
| DISTRIBUTORE | TEXT | Nome distributore |
| EURO_LISTINO | REAL | Prezzo listino fornitore |
| SCONTO | REAL | % sconto |

Le tabelle di ordinamento (`tipologia_order`, `nazioni_order`, `regioni_order`, `filtri_carta`) stanno in `vini_settings.sqlite3`, non qui.

## Import Excel
Gestito da `vini_model.py` — endpoint `POST /vini/upload`. Foglio obbligatorio: `VINI`.
Sequenza: parsing → normalizzazione (`normalize_dataframe()`) → `clear_vini_table()` → insert atomico.

## Generazione Carta
- HTML: `GET /vini/carta` — `build_carta_body_html_htmlsafe()`
- PDF: `GET /vini/carta/pdf` — WeasyPrint, font locali Mac / font sistema VPS
- DOCX: `GET /vini/carta/docx` — python-docx

## Convenzioni
- `TIPOLOGIA` va aggiornata anche in `TIPOLOGIA_VALIDE` (vini_db.py e vini_settings.py)
- `PREZZO` = prezzo ristorante, `EURO_LISTINO` = listino fornitore
- Ogni modifica schema richiede: aggiornare `vini_db.py` + questo file + verificare upload + PDF

---

# 2. `vini_settings.sqlite3`
_Ordinamenti e filtri della carta vini. Gestito da `vini_settings.py`._

| Tabella | Contenuto |
|---------|-----------|
| `tipologia_order` | Ordine tipologie nella carta |
| `nazioni_order` | Ordine nazioni |
| `regioni_order` | Ordine regioni |
| `filtri_carta` | Filtri attivi (min_qta, mostra_negativi, mostra_senza_prezzo) |

---

# 3. `foodcost.db`
_FoodCost + Fatture Elettroniche XML. Gestito da `migration_runner.py` (migrazioni 001–005)._

> ⚠️ Le tabelle `fe_fatture` e `fe_righe` sono create a runtime da `fe_import.py`, non da una migrazione dedicata (task #19 Roadmap).

## Tabella `suppliers`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | Nome fornitore |
| codice_fiscale | TEXT | Opzionale |
| partita_iva | TEXT | |
| codice_sdi | TEXT | |
| pec | TEXT | |
| note | TEXT | |
| created_at | TEXT | Timestamp |

## Tabella `ingredient_categories`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | Nome univoco |
| description | TEXT | |

## Tabella `ingredients`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | Nome ingrediente |
| codice_interno | TEXT | SKU interno |
| category_id | INT FK | → ingredient_categories.id |
| default_unit | TEXT | Unità base (kg, g, L, ml, pz…) |
| allergeni | TEXT | |
| note | TEXT | |
| is_active | INT | Default 1 |
| created_at | TEXT | |

## Tabella `ingredient_prices`
Storico prezzi multi-fornitore. Mai sovrascritti — ogni fattura aggiunge una riga.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| ingredient_id | INT FK | → ingredients.id |
| supplier_id | INT FK | → suppliers.id |
| price_date | TEXT | Data fattura |
| unit_price | REAL | Prezzo per default_unit |
| quantity | REAL | Quantità confezione |
| unit | TEXT | Unità confezione |
| invoice_id | INT FK | → fe_fatture.id (campo legacy: `invoices.id`) |
| note | TEXT | |
| created_at | TEXT | |

## Tabella `fe_fatture`
> ⚠️ Si chiama `fe_fatture`, NON `invoices` (nome vecchio della pianificazione).

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| fornitore_nome | TEXT | |
| fornitore_piva | TEXT | |
| numero_fattura | TEXT | |
| data_fattura | TEXT | YYYY-MM-DD |
| imponibile_totale | REAL | |
| iva_totale | REAL | |
| totale_fattura | REAL | |
| valuta | TEXT | Default EUR |
| xml_hash | TEXT | SHA-256 anti-duplicazione |
| xml_filename | TEXT | Nome file originale |
| data_import | TEXT | Timestamp |

## Tabella `fe_righe`
> ⚠️ Si chiama `fe_righe`, NON `invoice_lines`.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| fattura_id | INT FK | → fe_fatture.id |
| numero_linea | INT | |
| descrizione | TEXT | |
| quantita | REAL | |
| unita_misura | TEXT | |
| prezzo_unitario | REAL | |
| prezzo_totale | REAL | |
| aliquota_iva | REAL | |
| categoria_grezza | TEXT | Facoltativa |
| note_analisi | TEXT | |

## Tabella `recipes`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| name | TEXT | |
| category | TEXT | ANTIPASTO, PRIMO, DOLCE… |
| yield_qty | REAL | Resa |
| yield_unit | TEXT | |
| notes | TEXT | |
| is_active | INT | Default 1 |
| created_at | TEXT | |

## Tabella `recipe_items`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | |
| recipe_id | INT FK | → recipes.id |
| ingredient_id | INT FK | → ingredients.id |
| qty | REAL | Riferita alla resa |
| unit | TEXT | |
| note | TEXT | |
| order_index | INT | |
| created_at | TEXT | |

## Relazioni
`suppliers` → `ingredient_prices` ← `ingredients` ← `ingredient_categories`
`fe_fatture` → `fe_righe`
`recipes` → `recipe_items` ← `ingredients`

> Collegamento `fe_righe` → `ingredients` non ancora implementato — previsto Fase 2 (task #16 Roadmap)

## Convenzioni
- Prezzi mai sovrascritti, sempre storicizzati
- Categorie gestite in tabella, non testo libero
- Ogni modifica schema → nuova migrazione `00X_nome.py` + aggiornare questo file

---

# 4. `dipendenti.sqlite3`
_Dipendenti e turni. Creato a runtime da `init_dipendenti_db()` in `dipendenti_db.py`._

| Tabella | Contenuto |
|---------|-----------|
| `dipendenti` | Anagrafica (nome, ruolo, contratto, ore, costo) |
| `turni` | Turni lavorativi (data, ora_inizio, ora_fine) |
| `presenze` | Presenze effettive |
| `allegati` | Allegati dipendente (tabella creata, endpoint non ancora implementato — task #22) |
