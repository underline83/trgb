# Modulo Gestione Vendite — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-14
**Stato:** operativo — v2.0 con Chiusure Turno
**Sezione top-level:** `/vendite`
**Backend:** `admin_finance.py` (prefix `/admin/finance`) + `chiusure_turno.py` (prefix `/chiusure-turno`)
**DB:** `app/data/admin_finance.sqlite3`

---

# 1. Obiettivo del modulo

Il modulo Gestione Vendite (ex Corrispettivi) gestisce:

- **Chiusure turno** (pranzo/cena) — form fine servizio per lo staff
- **Logica cena cumulativa** — valori giornalieri con sottrazione automatica pranzo
- **Pre-conti** — tracking tavoli non battuti (tavolo + importo)
- **Spese** — lista dinamica (scontrino/fattura/personale/altro)
- **Fondo cassa** — inizio e fine servizio
- **Import corrispettivi** da file Excel
- **Chiusure giornaliere** (legacy) — apertura/chiusura cassa
- **Statistiche** mensili, annuali e confronto annuale
- **Dashboard** con grafici e KPI
- **Riepilogo** mensile multi-anno

---

# 2. Chiusure Turno (2026-03-14)

### Flusso operativo
1. Lo staff seleziona data e turno (pranzo/cena)
2. Inserisce i dati di chiusura: contanti, POS BPM, POS Sella, TheForkPay, altri e-payments, bonifici, mance
3. Inserisce il preconto (rinominato "Chiusura Parziale" a pranzo, "Chiusura" a cena)
4. Inserisce le fatture emesse e i coperti
5. Aggiunge pre-conti: righe dinamiche tavolo + importo per ogni tavolo non battuto
6. Aggiunge spese: righe dinamiche tipo (scontrino/fattura/personale/altro) + descrizione + importo
7. Inserisce fondo cassa inizio e fine servizio
8. Il sistema calcola automaticamente totale incassi, totale spese, quadratura

### Logica cena cumulativa
A cena, lo staff inserisce i **totali giornalieri** (la chiusura RT, i POS, ecc. sono gia' cumulativi per natura). Il sistema:
- Carica i dati pranzo (se esistono)
- Sottrae pranzo da ogni valore per ottenere i parziali cena
- Mostra hint "pranzo X → parz. cena Y" sotto ogni campo
- Se pranzo non esiste, i valori sono trattati come solo-cena con avviso

### Quadratura
- Pranzo: `incassi + preconti = chiusura_parziale`
- Cena: `incassi_cena + preconti_cena + preconti_pranzo = parziale_cena`

---

# 3. Endpoint Backend

## Chiusure Turno (`chiusure_turno.py`)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/chiusure-turno` | Crea/aggiorna chiusura turno (con pre-conti e spese) |
| GET | `/chiusure-turno/{date}/{turno}` | Lettura chiusura con pre-conti e spese |
| GET | `/chiusure-turno` | Lista chiusure con filtri (date_from, date_to, turno) |

Ruoli autorizzati per scrittura: admin, sommelier, sala.
Lista chiusure: solo admin.

## Corrispettivi legacy (`admin_finance.py`)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/admin/finance/import` | Import Excel corrispettivi |
| GET | `/admin/finance/chiusure/{year}/{month}` | Chiusure mensili |
| GET/POST/PUT | `/admin/finance/chiusura/{date}` | Chiusura giornaliera CRUD |
| GET | `/admin/finance/stats/{year}/{month}` | Statistiche mensili |
| GET | `/admin/finance/stats/{year}` | Statistiche annuali |

Tutti gli endpoint protetti con JWT.

---

# 4. Database

DB: `app/data/admin_finance.sqlite3`

### Tabelle chiusure turno
- `shift_closures` — dati chiusura con fondo_cassa_inizio/fine, created_by
- `shift_preconti` — pre-conti: tavolo + importo per chiusura
- `shift_spese` — spese: tipo + descrizione + importo per chiusura
- `shift_checklist_config` — configurazione checklist (predisposta, non ancora popolata)
- `shift_checklist_responses` — risposte checklist (predisposta)

### Tabelle legacy
- `daily_closures` — chiusure giornaliere da import Excel

---

# 5. Frontend

| File | Route | Funzione |
|------|-------|----------|
| `ChiusuraTurno.jsx` | `/vendite/fine-turno` | Form chiusura fine servizio |
| `ChiusureTurnoLista.jsx` | `/vendite/chiusure` | Lista chiusure (admin) |
| `CorrispettiviMenu.jsx` | `/vendite` | Hub Gestione Vendite |
| `CorrispettiviRiepilogo.jsx` | `/vendite/riepilogo` | Riepilogo mensile multi-anno |
| `CorrispettiviDashboard.jsx` | `/vendite/dashboard` | Dashboard mensile |
| `CorrispettiviAnnual.jsx` | `/vendite/annual` | Confronto annuale |
| `CorrispettiviImport.jsx` | `/vendite/import` | Import Excel |
| `VenditeNav.jsx` | — | Barra navigazione con visibilita' per ruolo |

### Navigazione per ruolo
- **Fine Turno**: visibile a tutti (staff inserisce la chiusura)
- **Chiusure, Riepilogo, Dashboard, Annuale, Import**: solo admin

---

# 6. Servizi backend

| File | Contenuto |
|------|-----------|
| `services/admin_finance_db.py` | Query dirette su `daily_closures` |
| `services/admin_finance_stats.py` | Calcolo statistiche mensili, annuali, top-days |
| `services/admin_finance_import.py` | Parsing e import da Excel |
| `services/corrispettivi_import.py` | Helper parsing Excel |

---

# 7. Roadmap modulo

- [ ] Checklist fine turno configurabile (seed dati default pranzo/cena)
- [ ] Integrazione cross-check chiusura turno vs daily_closures (import Excel)
- [ ] Export PDF riepilogo giornaliero/settimanale
- [ ] Coperti e scontrino medio nella dashboard
- [ ] Integrazione vendite vini (cross-query tra DB)
- [ ] Analisi pranzo vs cena
- [ ] P&L semplificato (vendite - acquisti)
