# Modulo Carta Vini — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-14
**Stato:** stabile — generazione carta + integrazione con Cantina v3.7
**Router:** `app/routers/vini_router.py` + `vini_cantina_tools_router.py`
**DB:** `app/data/vini.sqlite3` (legacy), generazione anche da `vini_magazzino.sqlite3`

---

# 1. Obiettivo del modulo

Il modulo **Vini** gestisce:

- Importazione Excel del listino (foglio "VINI")
- Normalizzazione e validazione colonne
- Caricamento in `vini.sqlite3`
- Ordinamento strutturato (tipologia → nazione → regione → produttore)
- Generazione Carta Vini in: HTML, PDF cliente, PDF staff, DOCX
- Generazione Carta anche dal DB Cantina (`vini_magazzino.sqlite3`)

Funziona in integrazione con:
- **Modulo Cantina & Magazzino Vini** (`docs/modulo_magazzino_vini.md`)
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

### Carta Vini (`vini_router.py`)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/vini/upload` | Import Excel → salva DB |
| GET | `/vini/carta` | Anteprima web HTML |
| GET | `/vini/carta/pdf` | PDF cliente |
| GET | `/vini/carta/pdf-staff` | PDF staff con prezzi |
| GET | `/vini/carta/docx` | Documento Word |

### Strumenti Cantina (`vini_cantina_tools_router.py`)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/vini/cantina-tools/sync-from-excel` | Sync vini.sqlite3 → cantina |
| POST | `/vini/cantina-tools/import-excel` | Import Excel diretto → cantina |
| GET | `/vini/cantina-tools/export-excel` | Download .xlsx da cantina |
| GET | `/vini/cantina-tools/carta-cantina` | HTML carta da cantina |
| GET | `/vini/cantina-tools/carta-cantina/pdf` | PDF carta da cantina |
| GET | `/vini/cantina-tools/carta-cantina/docx` | DOCX carta da cantina |
| GET | `/vini/cantina-tools/locazioni-config` | Locazioni configurate |

---

# 4. Componenti tecnici

- `app/models/vini_model.py` — normalizzazione, inserimento DB
- `app/models/vini_db.py` — schema e init database
- `app/repositories/vini_repository.py` — ordering, filtri, query `load_vini_ordinati()`
- `app/routers/vini_router.py` — API protette con JWT
- `app/services/carta_vini_service.py` — builder HTML/PDF (WeasyPrint, font Cormorant Garamond)
- `app/static/css/carta_pdf.css` — stile PDF
- `app/static/css/carta_html.css` — stile preview HTML

---

# 5. Impostazioni Carta (`vini_settings_router.py`)

- Ordine tipologie (lista riordinabile con frecce)
- Ordine nazioni (lista riordinabile)
- Ordine regioni per nazione
- Filtri carta: quantita' minima, mostra negativi, mostra senza prezzo

---

# 6. Roadmap modulo Vini

- [ ] **Pagina web pubblica** — carta vini sempre aggiornata accessibile da internet
- [ ] PDF con indici cliccabili (TOC con link interni)
- [ ] Versioning della carta (storico PDF)
- [ ] Template multipli (eventi, degustazioni)
- [ ] Anteprima carta con filtri dinamici
