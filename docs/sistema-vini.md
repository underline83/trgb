# 🍷 TRGB Gestionale — Documentazione Modulo Vini

Modulo dedicato a gestione completa della Carta dei Vini.

---

# 1. Database principale — `vini.sqlite3`

Campi principali:

| Campo | Tipo |
|-------|------|
| id | PK |
| TIPOLOGIA | TEXT |
| NAZIONE | TEXT |
| REGIONE | TEXT |
| PRODUTTORE | TEXT |
| DESCRIZIONE | TEXT |
| PREZZO | REAL |
| QTA | INTEGER |
| … | … |

---

# 2. Database impostazioni — `vini_settings.sqlite3`

Tabelle:
- `tipologia_order`
- `nazioni_order`
- `regioni_order`
- `filtri_carta`

Filtri inclusi:
- quantità minima
- “mostra negativi”
- “mostra senza prezzo”

---

# 3. Import Excel — `/vini/upload`

Flow:
1. Upload Excel foglio “VINI”
2. Normalizzazione colonne
3. Validazione valori
4. Pulizia tabella
5. Inserimento righe
6. Generazione report

---

# 4. Repository — `load_vini_ordinati()`

Applica:
1. Ordine tipologia
2. Ordine nazioni
3. Regioni
4. Produttore
5. Descrizione
6. Annata

---

# 5. Output Carta Vini

### HTML:
`GET /vini/carta`

### PDF Cliente:
`GET /vini/carta/pdf`

### PDF Staff:
`GET /vini/carta/pdf-staff`

### DOCX:
`GET /vini/carta/docx`

---

# 6. CSS PDF (WeasyPrint)

- Font Cormorant Garamond integrati  
- Frontespizio + indice  
- Anti-spezzatura produttori  
- Layout elegante TRGB  

---

# Fine SISTEMA_VINI.md
