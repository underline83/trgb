# Database — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-28

Il progetto usa **SQLite** con un file per dominio funzionale. Tutti i file sono in `app/data/`.

## Database attivi

| File | Moduli | Schema |
|------|--------|--------|
| `foodcost.db` | FoodCost, FE XML, Banca, Controllo Gestione, iPratico, FIC | v5.0 — gestito da `migration_runner.py` (001–032) |
| `vini_magazzino.sqlite3` | Cantina (magazzino vini) | v3.7 — creato da `vini_magazzino_db.py` |
| `vini_settings.sqlite3` | Settings Carta Vini | v1.4 — creato da `vini_settings.py` |
| `admin_finance.sqlite3` | Vendite, Chiusure Turno | v2.0 — chiusure turno con pre-conti e spese |
| `dipendenti.sqlite3` | Dipendenti & Turni | v1.0 — creato a runtime da `dipendenti_db.py` |
| `vini.sqlite3` | Import Excel legacy (vini_raw) | Solo per ponte import, non usato direttamente |

## Eliminati (2026-03-28)

| File | Motivo |
|------|--------|
| `ingredients.sqlite3` | Vuoto (1 byte), mai usato — ingredienti gestiti in foodcost.db |
| `vini.db` | Residuo legacy con 1 tabella ingredients, non importato da nessun modulo |
| `app/models/vini_db.py` | Model legacy del vecchio DB vini — sostituito da vini_magazzino_db.py |
| `app/models/ingredients_db.py` | Model per ingredients.sqlite3 — mai usato |
| `app/models/ingredients.py` | Model legacy che puntava a vini.db — mai importato |

---

# 1. `vini.sqlite3` — ELIMINATO (v3.0, 2026-03-15)
_Era il DB della Carta Vini, sovrascritto ad ogni import Excel. Eliminato: la carta ora legge direttamente da `vini_magazzino.sqlite3`._

## Tabella `vini`
Tabella unica con tutte le informazioni per generazione carta, ricerca, ordinamento, scorte.

| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | Autoincrement |
| TIPOLOGIA | TEXT | Categoria macro (es. BIANCHI ITALIA) |
| NAZIONE | TEXT | Italia, Francia... |
| CODICE | TEXT | Codice regione (IT01, FR05...) |
| REGIONE | TEXT | Regione vino |
| CARTA | TEXT | 'SI' o 'NO' |
| DESCRIZIONE | TEXT | Nome vino / denominazione |
| ANNATA | TEXT | Anno o "s.a." |
| PRODUTTORE | TEXT | |
| PREZZO | REAL | Prezzo ristorante |
| FORMATO | TEXT | MN, DM, MG, CL... |
| N_FRIGO, N_LOC1, N_LOC2 | INT | Bottiglie per locazione |
| QTA | INT | Totale disponibile |
| FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2 | TEXT | Nomi locazioni |
| EURO_LISTINO | REAL | Prezzo listino fornitore |
| SCONTO | REAL | % sconto |

---

# 2. `vini_magazzino.sqlite3`
_Magazzino vini — unico DB vini dal v3.0. Vecchio `vini.sqlite3` eliminato._

## Tabella `vini_magazzino`
| Colonna | Tipo | Note |
|---------|------|------|
| id | INT PK | ID interno (immutabile) |
| id_excel | TEXT | Origine Excel |
| DESCRIZIONE, PRODUTTORE, REGIONE, NAZIONE, TIPOLOGIA | TEXT | Anagrafica |
| ANNATA, DENOMINAZIONE, FORMATO, GRADI | TEXT | |
| FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2 | TEXT | Nomi locazioni |
| QTA_FRIGO, QTA_LOC1, QTA_LOC2, QTA_LOC3 | INT | Bottiglie per locazione |
| QTA_TOTALE | INT | Calcolata automaticamente |
| EURO_LISTINO, EURO_CARTA | REAL | Prezzi |
| CARTA, IPRATICO | TEXT | Flag SI/NO |
| STATO_VENDITA, STATO_RIORDINO, STATO_CONSERVAZIONE | TEXT | Stati operativi |
| DISCONTINUATO | INT | Flag vino da non ricomprare |
| ORIGINE | TEXT | 'EXCEL' o 'MANUALE' |
| NOTE | TEXT | |

## Tabella `movimenti_cantina`
| id | vino_id (FK) | tipo | qta | note | utente | data_mov | locazione |

## Tabella `vini_magazzino_note`
| id | vino_id (FK) | testo | utente | data |

---

# 3. `vini_settings.sqlite3`
_Ordinamenti e filtri della carta vini._

| Tabella | Contenuto |
|---------|-----------|
| `tipologia_order` | Ordine tipologie nella carta |
| `nazioni_order` | Ordine nazioni |
| `regioni_order` | Ordine regioni per nazione |
| `filtri_carta` | Filtri attivi (min_qta, mostra_negativi, mostra_senza_prezzo) |

---

# 4. `foodcost.db`
_FoodCost + Fatture XML + Banca + Controllo Gestione + iPratico Products. Gestito da `migration_runner.py` (001–032)._

## Tabelle FoodCost

### `suppliers`
| id | name | codice_fiscale | partita_iva | codice_sdi | pec | note | created_at |

### `ingredient_categories`
| id | name | description |

### `ingredients`
| id | name | codice_interno | category_id (FK) | default_unit | allergeni | note | is_active | created_at |

### `ingredient_prices`
Storico prezzi multi-fornitore. Mai sovrascritti — ogni fattura aggiunge una riga.
| id | ingredient_id (FK) | supplier_id (FK) | price_date | unit_price | quantity | unit | invoice_id | note | created_at |

### `ingredient_supplier_map`
Mapping descrizione fornitore → ingrediente per auto-match.
| ingredient_id | supplier_id | codice_fornitore | unita_fornitore | fattore_conversione |

### `ingredient_unit_conversions`
Conversioni unita' personalizzate per ingrediente (migrazione 013).
| ingredient_id | from_unit | to_unit | fattore_conversione | note |

### `recipe_categories`
| id | name | sort_order |

### `recipes`
| id | name | category_id (FK) | is_base | yield_qty | yield_unit | selling_price | prep_time | note | is_active | created_at |

### `recipe_items`
| id | recipe_id (FK) | ingredient_id (FK) | sub_recipe_id (FK) | qty | unit | note |

## Tabelle Fatture Elettroniche

### `fe_fatture`
| id | fornitore_nome | fornitore_piva | numero_fattura | data_fattura | imponibile_totale | iva_totale | totale_fattura | valuta | xml_hash | xml_filename | data_import |

### `fe_righe`
| id | fattura_id (FK) | numero_linea | descrizione | quantita | unita_misura | prezzo_unitario | prezzo_totale | aliquota_iva | categoria_grezza | note_analisi |

### `fe_categorie` / `fe_sottocategorie`
Categorie a 2 livelli per classificazione fornitori.

### `fe_fornitore_categoria`
| fornitore_piva | fornitore_nome | categoria_id | sottocategoria_id | note |

### `fe_fornitore_esclusione`
| fornitore_piva | fornitore_nome | escluso | motivo_esclusione | alias_di |

### Tabelle matching
- `matching_description_exclusions` — descrizioni non-ingrediente da ignorare
- `matching_ignored_righe` — righe fattura ignorate nel matching

## Tabelle Banca (migrazione 014)

### `banca_movimenti`
| id | data_contabile | data_valuta | causale | importo | saldo | categoria_banca | sottocategoria_banca | tipo | dedup_hash (UNIQUE) |

### `banca_categorie_map`
| id | categoria_banca | sottocategoria_banca | categoria_custom | colore | icona | tipo |

### `banca_fatture_link`
| id | movimento_id (FK) | fattura_id (FK) | note |

### `banca_import_log`
| id | filename | data_import | num_movimenti |

## Tabelle Finanza (RIMOSSO — v1.0 2026-03-30)

Modulo Finanza completamente rimosso. Le sue funzionalità sono state integrate in Controllo Gestione.

## Relazioni principali

```
suppliers → ingredient_prices ← ingredients ← ingredient_categories
fe_fatture → fe_righe → ingredient_supplier_map → ingredients
recipes → recipe_items ← ingredients (o sub_recipe_id → recipes)
banca_movimenti → banca_fatture_link ← fe_fatture
```

## Tabelle iPratico Products (migrazioni 020–022)

### `ipratico_product_map`
Mapping prodotti iPratico ↔ vini TRGB. Il codice 4 cifre nel Name iPratico = `vini_magazzino.id`.
| id | ipratico_uuid | ipratico_wine_id | ipratico_name | ipratico_category | vino_id (FK→vini_magazzino) | match_status (auto/manual/unmatched/ignored) | last_sync_at | created_at | updated_at |

### `ipratico_sync_log`
Storico importazioni/esportazioni.
| id | direction (import/export) | filename | n_matched | n_unmatched | n_updated_qty | n_updated_price | created_at |

### `ipratico_export_defaults`
Valori default configurabili per campi vini nuovi nell'export (editabili da frontend).
| id | field_name | field_value | field_group (general/reparti/listini) | label | updated_at |

## Convenzioni
- Prezzi mai sovrascritti, sempre storicizzati
- Categorie gestite in tabella, non testo libero
- Ogni modifica schema → nuova migrazione `0XX_nome.py` + aggiornare questo file

---

# 5. `admin_finance.sqlite3`
_Vendite e chiusure turno._

### `daily_closures`
| date (PK) | corrispettivi | iva_10 | iva_22 | fatture | contanti_finali | pos_bpm | pos_sella | theforkpay | other_e_payments | bonifici | mance | note | is_closed |

### `shift_closures`
Chiusure per turno (pranzo/cena) con logica cumulativa.
| id | date | turno | fondo_cassa_inizio | fondo_cassa_fine | contanti | pos_bpm | pos_sella | theforkpay | other_e_payments | bonifici | mance | preconto | fatture | coperti | totale_incassi | note | created_by | created_at | updated_at |

### `shift_checklist_config`
| id | turno | label | ordine | attivo |

### `shift_checklist_responses`
| id | shift_closure_id (FK) | checklist_item_id (FK) | checked | note |

### `shift_preconti`
Pre-conti (tavoli non battuti): tavolo + importo per chiusura.
| id | shift_closure_id (FK) | tavolo | importo | note |

### `shift_spese`
Spese per chiusura: scontrino/fattura/personale/altro.
| id | shift_closure_id (FK) | tipo | descrizione | importo |

---

# 6. `dipendenti.sqlite3`
_Dipendenti e turni. Creato a runtime da `init_dipendenti_db()` in `dipendenti_db.py`._

| Tabella | Contenuto |
|---------|-----------|
| `dipendenti` | Anagrafica (nome, cognome, ruolo, contratto, dati personali, IBAN) |
| `turno_tipo` | Tipologie turno (codice, nome, orari, colore) |
| `turno_calendario` | Assegnazioni turno per data |
| `dipendenti_costi` | Costi dipendente (stipendio, periodo) |
| `dipendenti_allegati` | Allegati (tabella creata, endpoint non implementato — task #22) |
