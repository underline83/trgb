# 🧾 Modulo Fatture Elettroniche (XML) — TRGB Gestionale  
**Stato:** Prima versione operativa  
**Data introduzione:** 2025-12-05  
**Dominio funzionale:** Acquisti & Controllo di Gestione  

Il modulo **Fatture Elettroniche (XML)** consente di importare file FatturaPA in formato XML e trasformarli in dati strutturati per analisi acquisti, statistiche e futura integrazione con foodcost e magazzino.

---

# 1. Obiettivi del Modulo

### Funzioni implementate (versione attuale)
- Import XML singolo o multiplo  
- Parsing intestazione fattura  
- Parsing righe fattura  
- Salvataggio DB con doppia tabella (`fe_fatture` + `fe_righe`)  
- Anti-duplicazione via hash SHA-256  
- Dashboard acquisti:
  - totale acquisti per fornitore
  - andamento mensile
  - filtro anni dinamico

### Evoluzioni future
- Collegamento automatico righe ↔ ingredienti  
- Aggiornamento prezzo ingrediente da fattura  
- Carichi magazzino automatici  
- Dashboard grafica completa  
- Migrazioni DB dedicate (`schema_migrations`)

---

# 2. Architettura

### Database
Posizione: `app/data/foodcost.db`

#### Tabella `fe_fatture`
Campi principali:
- id  
- fornitore_nome  
- fornitore_piva  
- numero_fattura  
- data_fattura  
- imponibile_totale  
- iva_totale  
- totale_fattura  
- valuta  
- xml_hash (SHA-256)  
- xml_filename  
- data_import  

#### Tabella `fe_righe`
Campi principali:
- id  
- fattura_id (FK)  
- numero_linea  
- descrizione  
- quantita  
- unita_misura  
- prezzo_unitario  
- prezzo_totale  
- aliquota_iva  
- categoria_grezza  
- note_analisi  

### Anti-duplicazione
Ogni XML genera un hash SHA-256.  
Se già presente in DB → l'import viene saltato.

---

# 3. Backend — Router `fe_import.py`

## 3.1 Importazione XML  
`POST /contabilita/fe/import`

Processo:
1. Lettura file XML  
2. Calcolo hash  
3. Parsing intestazione  
4. Parsing righe  
5. Inserimento in DB  
6. Ritorno elenco importati + duplicati  

Output:
```json
{
  "importate": [...],
  "gia_presenti": [...]
}
```

---

## 3.2 Consultazione fatture

### Lista fatture  
`GET /contabilita/fe/fatture`

- ordinamento: `data_fattura DESC, id DESC`

### Dettaglio fattura  
`GET /contabilita/fe/fatture/{id}`

Ritorna:
- intestazione completa  
- elenco righe  

---

## 3.3 Statistiche acquisti

### Per fornitore  
`GET /contabilita/fe/stats/fornitori?year=YYYY`

Ritorna:
- totale acquisti  
- n. fatture  
- primo e ultimo acquisto  

### Mensile  
`GET /contabilita/fe/stats/mensili?year=YYYY`

Ritorna:
- mese  
- n. fatture  
- totale per mese  

---

# 4. Frontend — Modulo Amministrazione Fatture

Il frontend dispone di tre pagine dedicate, tutte accessibili dal menu **Amministrazione**.

## 4.1 `FattureMenu.jsx`
Schermata centrale del modulo FE:
- Accesso import XML  
- Accesso dashboard acquisti  

---

## 4.2 `FattureImport.jsx`
Funzionalità:
- **Drag & Drop** XML multipli  
- Upload multiplo nativo  
- Import verso `/contabilita/fe/import`  
- Gestione duplicati (XML già presenti)  
- Lista fatture importate  
- Dettaglio singola fattura:
  - fornitore
  - data
  - numero
  - totali
  - tabella righe

---

## 4.3 `FattureDashboard.jsx`
Funzionalità:
- Filtro anno (dinamico)
- Box “Top fornitori per totale acquisti”
- Box “Andamento mensile”
- Link rapido all’import XML

---

# 5. Routing Frontend

```jsx
<Route path="/admin/fatture" element={<FattureMenu />} />
<Route path="/admin/fatture/import" element={<FattureImport />} />
<Route path="/admin/fatture/dashboard" element={<FattureDashboard />} />
```

Menu Admin aggiornato con card dedicata:
- “Fatture Elettroniche (XML)”
- link a `/admin/fatture`

---

# 6. Flusso Operativo Completo

1. L’utente apre **Amministrazione → Fatture → Import XML**  
2. Trascina o seleziona 1..N file XML  
3. L’import processa:
   - nuovi file → salvati  
   - duplicati → ignorati  
4. L’utente consulta:
   - elenco fatture  
   - dettaglio singola fattura  
5. L’utente analizza acquisti nella dashboard

---

# 7. Roadmap Modulo FE

## Fase 2 — Matching Ingredienti
- fuzzy matching righe ↔ ingredienti  
- suggerimenti automatici  
- UI di conferma match  
- salvataggio mapping  
- aggiornamento prezzi ingredienti da XML  

## Fase 3 — Integrazione Magazzino
- carichi automatici  
- storicizzazione giacenze  
- valorizzazione magazzino  

## Fase 4 — Migrazioni DB
- introduzione `006_fe_import.py`  
- rimozione creazione tabelle runtime  

## Fase 5 — UI Avanzata
- filtri per fornitore / importo / intervallo date  
- ricerca descrizione riga  
- dashboard grafica con charts  

---

# 8. Changelog Modulo (2025-12-05)

- NEW — Router completo import XML  
- NEW — Parsing intestazione + righe  
- NEW — Hash anti-duplicazione  
- NEW — Dashboard acquisti (fornitori / mensile)  
- NEW — Drag&Drop import massivo  
- NEW — Pagina menu modulo FE  
- UPDATE — Admin menu  
- TODO — Matching ingredienti + Magazzino  
