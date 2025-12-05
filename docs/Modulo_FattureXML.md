# 🧾 Modulo Fatture Elettroniche (XML) — TRGB Gestionale  
**Ultimo aggiornamento:** 2025-12-05  
**Stato:** prima versione operativa (import + statistiche)

---

# 1. Obiettivo del modulo

### Completato:
- importazione file XML FatturaPA  
- anti-duplicazione via hash SHA-256  
- salvataggio intestazioni + righe  
- dashboard acquisti per fornitore  
- dashboard mensile  

### In sviluppo:
- collegamento automatico ingredienti  
- carichi magazzino automatici  
- classificazione articoli  

---

# 2. Tabelle database

### `fe_fatture`
- id  
- fornitore_nome  
- fornitore_piva  
- numero_fattura  
- data_fattura  
- imponibile_totale  
- iva_totale  
- totale_fattura  
- xml_hash  
- xml_filename  
- data_import  

### `fe_righe`
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

---

# 3. Endpoint backend

### `POST /contabilita/fe/import`
- importa XML multipli  
- blocca duplicati via hash  

### `GET /contabilita/fe/fatture`
Lista fatture → ordine per data.

### `GET /contabilita/fe/fatture/{id}`
Dettaglio completo con righe.

### `GET /contabilita/fe/stats/fornitori?year=YYYY`
Statistiche per fornitore.

### `GET /contabilita/fe/stats/mensili?year=YYYY`
Statistiche per mese.

---

# 4. Frontend — `FattureElettroniche.jsx`

### Funzionalità:
- upload XML multipli  
- lista fatture  
- dettaglio righe (quantità, prezzi, IVA)  
- dashboard acquisti:  
  - top fornitori  
  - andamento mensile  
  - filtro anno  

---

# 5. Limiti attuali

- niente migrazioni schema dedicate  
- nessun collegamento ingredienti  
- nessuna classificazione automatica righe  
- dashboard senza grafici (fase 2)

---

# 6. Roadmap modulo FE

### Prossime milestone:
- matching riga → ingrediente  
- fuzzy search descrizioni  
- aggiornamento prezzi automatico ingrediente  
- carichi magazzino automatici  
- gestione note di credito XML  
- dashboard grafica completa  

