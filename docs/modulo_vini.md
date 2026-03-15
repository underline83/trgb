# Modulo Carta Vini — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-15
**Stato:** stabile — generazione carta da DB magazzino unico
**Router:** `app/routers/vini_router.py`
**DB:** `vini_magazzino.sqlite3` (unico DB, vecchio `vini.sqlite3` eliminato in v3.0)

---

# 1. Obiettivo del modulo

Il modulo **Carta Vini** gestisce:

- Generazione Carta Vini in: HTML, PDF cliente, PDF staff, DOCX
- Ordinamento strutturato (tipologia → nazione → regione → produttore → descrizione → annata)
- Filtri carta (quantita' minima, mostra negativi, mostra senza prezzo)
- Anteprima live embedded nel gestionale

Legge i dati dal **DB magazzino** (`vini_magazzino.sqlite3`) tramite `vini_repository.py`.

Funziona in integrazione con:
- **Modulo Cantina & Magazzino Vini** (`docs/modulo_magazzino_vini.md`)
- **Modulo Settings Vini** (ordini tipologie, nazioni e regioni)

---

# 2. Flusso dati

1. `load_vini_ordinati()` legge da `vini_magazzino.sqlite3` (WHERE CARTA='SI')
2. Applica filtri quantita'/prezzo da `vini_settings.sqlite3`
3. Normalizza tipologie (vecchie → nuove) con `_TIPOLOGIA_MAP`
4. Ordina per tipologia → nazione → regione → produttore → descrizione → annata
5. Genera carta (HTML/PDF/DOCX) tramite `carta_vini_service.py`

---

# 3. Endpoint principali

### Carta Vini (`vini_router.py` v3.0)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/vini/carta` | Anteprima web HTML |
| GET | `/vini/carta/html` | Alias compatibilita' |
| GET | `/vini/carta/pdf` | PDF cliente |
| GET | `/vini/carta/pdf-staff` | PDF staff |
| GET | `/vini/carta/docx` | Documento Word |
| GET | `/{vino_id}/movimenti` | Lista movimenti vino |
| POST | `/{vino_id}/movimenti` | Registra movimento |

### Strumenti Cantina (`vini_cantina_tools_router.py` v3.1)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/vini/cantina-tools/import-excel` | Import Excel diretto → magazzino |
| GET | `/vini/cantina-tools/export-excel` | Download .xlsx da magazzino |
| GET | `/vini/cantina-tools/locazioni-config` | Locazioni configurate |

> **Rimossi in v3.0:** `/vini/upload` (import Excel vecchio), `/vini/cantina-tools/sync-from-excel` (sync vecchio DB)

---

# 4. Componenti tecnici

- `app/repositories/vini_repository.py` — ordering, filtri, query `load_vini_ordinati()` da magazzino
- `app/routers/vini_router.py` — API carta + movimenti
- `app/services/carta_vini_service.py` — builder HTML/PDF/DOCX (WeasyPrint, python-docx, font Cormorant Garamond)
- `app/models/vini_settings.py` — settings + `_TIPOLOGIA_MAP` per normalizzazione runtime
- `static/css/carta_pdf.css` — stile PDF con page-break-after:avoid su intestazioni
- `static/css/carta_html.css` — stile preview HTML allineato al PDF

### File deprecated (ancora presenti)
- `app/models/vini_db.py` — vecchio schema DB, non piu' importato
- `app/models/vini_model.py` — contiene `normalize_dataframe()` usata da import-excel

---

# 5. Impostazioni Carta (`vini_settings_router.py`)

- Ordine tipologie (lista riordinabile con frecce)
- Ordine nazioni (lista riordinabile)
- Ordine regioni per nazione
- Filtri carta: quantita' minima, mostra negativi, mostra senza prezzo

---

# 6. Gerarchia carta

```
Tipologia (GRANDI FORMATI, BOLLICINE, BIANCHI, ROSATI, ROSSI, PASSITI, ANALCOLICI)
  └── Nazione (Italia, Francia, Germania, Austria, Spagna...)  [filetti decorativi]
       └── Regione (Lombardia, Piemonte, Champagne...)
            └── Produttore (bold)
                 └── Vino: descrizione | annata | prezzo
```

---

# 7. Roadmap modulo Carta Vini

- [x] Eliminazione vecchio DB vini.sqlite3 — 2026-03-15
- [x] Raggruppamento per nazione con filetti decorativi — 2026-03-14
- [x] Allineamento CSS HTML ↔ PDF — 2026-03-15
- [x] Fix salti pagina PDF (intestazioni orfane) — 2026-03-15
- [x] DOCX con tabelle allineate (desc|annata|prezzo) — 2026-03-15
- [x] Unificazione loader carta (eliminato codice duplicato) — 2026-03-15
- [x] Fix cancellazione movimenti (delta inverso) — 2026-03-15
- [ ] PDF con indici cliccabili (TOC con link interni)
- [ ] Versioning della carta (storico PDF)
- [ ] Template multipli (eventi, degustazioni)
