# 🍷 Modulo Vini — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-08
**Stato:** stabile — gestione completa Carta Vini

---

# 1. Obiettivo del modulo

Il modulo **Vini** gestisce:

- importazione Excel del listino (foglio “VINI”)
- normalizzazione e validazione colonne
- caricamento in `vini.sqlite3`
- ordinamento strutturato (tipologia → nazione → regione → produttore)
- generazione Carta Vini in:
  - HTML
  - PDF cliente
  - PDF staff
  - DOCX

Funziona in integrazione con:
- **Modulo Magazzino Vini**
- **Modulo Settings Vini** (ordini tipologie, nazioni e regioni)

---

# 2. Flusso dati

1. Upload Excel da UI  
2. Normalizzazione (header, valori, formati)  
3. Validazione (tipologia, formati bottiglia, annata)  
4. Inserimento in DB SQLite  
5. Caricamento con repository `load_vini_ordinati()`  
6. Generazione carta (HTML/PDF/DOCX)

---

# 3. Endpoint principali

### `POST /vini/upload`
Importa Excel → salva DB → ritorna errori e statistiche.

### `GET /vini/carta`
Anteprima web HTML.

### `GET /vini/carta/pdf`
PDF cliente.

### `GET /vini/carta/pdf-staff`
PDF staff con prezzi.

### `GET /vini/carta/docx`
Documento Word.

---

# 4. Componenti tecnici

- `app/models/vini_model.py` — normalizzazione, inserimento DB
- `app/models/vini_db.py` — schema e init database
- `app/repositories/vini_repository.py` — ordering, filtri, query `load_vini_ordinati()`
- `app/routers/vini_router.py` — API (2 endpoint protetti con `get_current_user`)
- `app/services/carta_vini_service.py` — builder HTML/PDF (funzioni `build_carta_body_*`)
- `app/static/css/carta_pdf.css` — stile PDF WeasyPrint (font Cormorant Garamond)

⚠️ **Nota:** `pdf_service.py` non esiste — la generazione PDF è in `carta_vini_service.py`

⚠️ **Bug noto (task #11 Roadmap):** nella preview HTML, `if prezzo:` esclude vini con prezzo = 0; il ramo PDF usa correttamente `if prezzo not in (None, "")`. Da allineare.  

---

# 5. Roadmap modulo Vini

- Editor dei filtri in UI per anteprima carta  
- Ordinamento drag&drop delle tipologie  
- Generazione PDF storicizzata (versioni della carta)  
- Versioni diversificate per eventi/menù speciali  

