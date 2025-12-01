# TRGB – Database `vini.sqlite3`
_Versione schema: v2.0+ (allineato a `vini_db.py` 2025)_

## Obiettivo del database

`vini.sqlite3` gestisce l’intero sistema **Carta dei Vini** dell’Osteria Tre Gobbi:

- anagrafica completa bottiglie
- tipologia, regione, nazione e formati
- giacenze (frigo, locazioni varie)
- prezzi di vendita e listino
- filtri per la generazione della Carta
- integrazione con:
  - upload Excel (foglio “VINI”)
  - motore carta (HTML / PDF / DOCX)
  - ordinamenti personalizzabili via `vini_settings.sqlite3`

È un database **operazionale**, sovrascritto ad ogni import Excel (tramite `clear_vini_table()`).

---

## Panoramica tabelle

Il DB contiene **una tabella principale**, `vini`, con tutte le informazioni necessarie per:

- generazione carta
- ricerca vini
- ordinamento
- gestione scorte

Le tabelle accessorie (`tipologia_order`, `regioni_order`, ecc.) NON stanno qui → sono in `vini_settings.sqlite3`.

---

# 1. `vini`
Tabella principale dei vini caricati da Excel.

| Colonna         | Tipo   | Note                                                    |
|-----------------|--------|---------------------------------------------------------|
| id              | INT PK | Autoincrement                                           |
| TIPOLOGIA       | TEXT   | Categoria macro (es. BIANCHI ITALIA)                    |
| NAZIONE         | TEXT   | Italia, Francia…                                        |
| CODICE          | TEXT   | Codice regione (IT01, FR05…)                            |
| REGIONE         | TEXT   | Regione vino (Lombardia, Champagne, Mosel…)             |
| CARTA           | TEXT   | 'SI' o 'NO' (inclusione nella carta)                    |
| DESCRIZIONE     | TEXT   | Nome vino / denominazione                               |
| ANNATA          | TEXT   | Anno o “s.a.”                                           |
| PRODUTTORE      | TEXT   | Produttore                                              |
| PREZZO          | REAL   | Prezzo ristorante                                       |
| FORMATO         | TEXT   | MN, DM, MG, CL… (validato con CHECK)                    |
| N_FRIGO         | INT    | Bottiglie in frigorifero                                |
| N_LOC1          | INT    | Bottiglie in locazione 1                                |
| N_LOC2          | INT    | Bottiglie in locazione 2                                |
| QTA             | INT    | Totale disponibile                                      |
| IPRATICO        | TEXT   | Campo aggiuntivo (interno gestionale)                   |
| DENOMINAZIONE   | TEXT   | Denominazione ufficiale                                 |
| FRIGORIFERO     | TEXT   | Testo libero                                            |
| LOCAZIONE_1     | TEXT   | Nome locazione 1                                        |
| LOCAZIONE_2     | TEXT   | Nome locazione 2                                        |
| DISTRIBUTORE    | TEXT   | Nome distributore                                       |
| EURO_LISTINO    | REAL   | Prezzo listino                                          |
| SCONTO          | REAL   | % sconto                                                |

---

## Note sullo schema

- La tabella è creata tramite `init_database()` in `vini_db.py`.
- I vincoli CHECK garantiscono che:
  - `TIPOLOGIA` sia una delle categorie standard
  - `FORMATO` sia uno dei formati ammessi o NULL
- I valori numerici vengono coercizzati a int/real in fase di import Excel.

---

# Processo di importazione (Excel → Database)

Il processo completo è gestito da `vini_model.py`:

1. **Upload Excel**  
   Endpoint: `POST /vini/upload`

2. **Parsing Excel**  
   - Foglio obbligatorio: `VINI`
   - Rimozione righe vuote
   - Normalizzazione intestazioni

3. **Normalizzazione dati**  
   Funzione: `normalize_dataframe()`  
   - uppercase intestazioni  
   - mapping colonne Excel → DB  
   - coercizione numeri  
   - pulizia stringhe  
   - validazioni tipologia / formato  

4. **Svuotamento tabella**  
   `clear_vini_table(conn)`

5. **Inserimento righe**  
   `insert_vini_rows(conn, df)`  
   - validazione riga per riga  
   - raccolta errori leggibili  
   - inserimento atomico con commit finale

6. **Risultato**  
   - totale righe lette  
   - righe inserite  
   - errori con preview vino  

---

# Ordinamento e filtri (integrazione con `vini_settings.sqlite3`)

Lo schema `vini.sqlite3` è *intenzionalmente semplice*.  
Tutta la logica avanzata risiede in:

### ▸ `vini_settings.sqlite3`  
contiene:
- ordinamento TIPOLOGIE (`tipologia_order`)
- ordinamento NAZIONI (`nazioni_order`)
- ordinamento REGIONI (`regioni_order`)
- filtri carta (`filtri_carta`)

Questi valori vengono caricati in:

```
vini_repository.py
```

e determinano:
- quali vini includere nella carta
- come ordinarli
- eventuali esclusioni (QTA minima, negativi, senza prezzo)

---

# Query principali

## 1. `load_vini_ordinati()`
Definisce la query ufficiale della carta:

- include solo:
  - `CARTA = 'SI'`
  - `TIPOLOGIA != 'ERRORE'`
- applica filtri:
  - `min_qta_stampa`
  - `mostra_negativi`
  - `mostra_senza_prezzo`
- ordina in base a:
  - tipologia (`tipologia_order`)
  - nazione (`nazioni_order`)
  - regione (`regioni_order`)
  - produttore
  - descrizione
  - annata

Restituisce **dizionari Python** già pronti per essere consumati da:

- HTML carta
- PDF carta
- DOCX carta

---

# Generazione Carta dei Vini

## 1. HTML
Endpoint:

```
GET /vini/carta
```

Usa:

- `build_carta_body_html_htmlsafe()`
- CSS: `static/css/carta_html.css`

---

## 2. PDF
Endpoints:

```
GET /vini/carta/pdf
GET /vini/carta/pdf-staff
```

Motore:
- **WeasyPrint**
- Font locali (woff2) su Mac
- Font sistema Linux su VPS:
  - `/usr/local/share/fonts/tre_gobbi/*.ttf`

Stile:
- `static/css/carta_pdf.css`
- frontespizio + indice + corpo
- numerazione pagine (no frontespizio)

---

## 3. DOCX
Endpoint:

```
GET /vini/carta/docx
```

Generatore:
- `python-docx`
- Stile semplice
- Struttura:
  - Tipologia
  - Regione
  - Produttore
  - Vini

---

# Convenzioni operative

### Tipologie
- Standardizzate in `TIPOLOGIA_VALIDE`
- Mai introdurre nuove senza aggiornarle anche in:
  - `vini_db.py`
  - `vini_settings.py`
  - `tipologia_order`

### Formati
- Codici come `MN`, `MG`, `DM`, `CL` ecc.
- Validati tramite CHECK

### Prezzi
- `PREZZO` = prezzo ristorante
- `EURO_LISTINO` = prezzo listino fornitore
- `SCONTO` = percentuale

### Giacenze
- Campi N_FRIGO / N_LOC* sono per uso interno, non visibili al cliente.

---

# Note future (estensioni previste)

- Tabella storica movimenti cantina  
- Inventario automatico tramite import DDT  
- Collegamento a scansione barcode  
- Sistema multiproduttore / multiarticolo  

---

Questo documento è la **fonte di verità** per `vini.sqlite3`.  
Ogni modifica allo schema richiede:

1. aggiornamento di `vini_db.py`  
2. aggiornamento del presente documento  
3. verifica upload Excel  
4. verifica rendering PDF (Mac + VPS)  
5. commit con versione aggiornata nel file (`@version:`)