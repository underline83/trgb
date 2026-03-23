# Modulo Gestione Vendite — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-23
**Stato:** operativo — v4.0 con Dashboard unificata 3 modalita'
**Sezione top-level:** `/vendite`
**Backend:** `admin_finance.py` (prefix `/admin/finance`) + `chiusure_turno.py` (prefix `/chiusure-turno`) + `closures_config_router.py` (prefix `/settings`)
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
- **Dashboard unificata** con 3 modalita' (mensile/trimestrale/annuale) e confronto YoY
- **Riepilogo** mensile multi-anno
- **Configurazione chiusure** — giorno chiusura settimanale + giorni festivi/ferie

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

# 3. Dashboard unificata v4.0 (2026-03-23)

La dashboard supporta tre modalita' di visualizzazione con navigazione e confronti appropriati:

### Modalita' Mensile
- KPI: totale corrispettivi, media giornaliera, confronto YoY (smart con cutoff)
- Grafico linea giornaliero con anno precedente tratteggiato
- Calendario con colori per performance vs media del giorno della settimana
- Composizione pagamenti (pie chart + dettaglio metodi)
- Tabella giornaliera completa
- Top/bottom days (esclusi giorni chiusura)

### Modalita' Trimestrale
- Aggrega 3 mesi del trimestre selezionato
- Stessi KPI con confronto pari trimestre anno precedente (smart cutoff)
- Grafico giornaliero aggregato
- Composizione pagamenti aggregata
- Tabella giornaliera trimestre completo

### Modalita' Annuale
- Grafico a barre mensili (anno corrente vs precedente)
- Tabella mensile dettagliata con variazioni
- KPI con totali annuali e confronto YoY

### Confronto YoY smart
Quando il periodo e' in corso (mese/trimestre/anno corrente), il confronto limita i dati dell'anno precedente allo stesso giorno del calendario, evitando confronti falsati da giorni in piu'.

---

# 4. Configurazione chiusure (2026-03-23)

### File configurazione
`app/data/closures_config.json`:
- `giorno_chiusura_settimanale`: 0=Lunedi..6=Domenica, null=nessuno
- `giorni_chiusi`: array di date ISO (ferie, festivita')

### Logica priorita' chiusura
1. Flag `is_closed` nel DB → sempre chiuso
2. Dati reali presenti (corrispettivi > 0 o incassi > 0) → sempre aperto
3. Data in `giorni_chiusi` configurati → chiuso
4. Giorno della settimana configurato → chiuso

### UI Calendario Chiusure
`CalendarioChiusure.jsx` dentro Vendite > Impostazioni:
- Pulsanti per selezionare il giorno di chiusura settimanale
- Calendario mensile per toggle singoli giorni
- Lista date chiuse con rimozione
- Salvataggio automatico ad ogni modifica

---

# 5. Pre-conti (superadmin only, 2026-03-23)

Il pannello Pre-conti e' stato nascosto dalla navigazione principale e spostato nella sezione Impostazioni del menu Vendite, visibile solo a superadmin. Il filtro di default mostra il mese corrente.

---

# 6. Endpoint Backend

## Chiusure Turno (`chiusure_turno.py`)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/chiusure-turno` | Crea/aggiorna chiusura turno (con pre-conti e spese) |
| GET | `/chiusure-turno/{date}/{turno}` | Lettura chiusura con pre-conti e spese |
| GET | `/chiusure-turno` | Lista chiusure con filtri (date_from, date_to, turno) |

## Corrispettivi & Stats (`admin_finance.py`)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/admin/finance/import` | Import Excel corrispettivi |
| GET | `/admin/finance/chiusure/{year}/{month}` | Chiusure mensili |
| GET/POST/PUT | `/admin/finance/chiusura/{date}` | Chiusura giornaliera CRUD |
| GET | `/admin/finance/stats/monthly` | Statistiche mensili |
| GET | `/admin/finance/stats/annual-compare` | Confronto annuale (2 anni) |
| GET | `/admin/finance/stats/top-days` | Top/bottom giorni |

## Configurazione Chiusure (`closures_config_router.py`)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/settings/closures-config/` | Leggi configurazione chiusure |
| PUT | `/settings/closures-config/` | Aggiorna configurazione chiusure |

Ruoli: scrittura chiusure turno = admin, sommelier, sala. Lista/stats = solo admin. Config chiusure = admin.

---

# 7. Database

DB: `app/data/admin_finance.sqlite3`

### Tabelle chiusure turno
- `shift_closures` — dati chiusura con fondo_cassa_inizio/fine, created_by
- `shift_preconti` — pre-conti: tavolo + importo per chiusura
- `shift_spese` — spese: tipo + descrizione + importo per chiusura
- `shift_checklist_config` — configurazione checklist (predisposta, non ancora popolata)
- `shift_checklist_responses` — risposte checklist (predisposta)

### Tabelle legacy
- `daily_closures` — chiusure giornaliere da import Excel

### File configurazione
- `app/data/closures_config.json` — giorno chiusura settimanale + giorni chiusi

---

# 8. Frontend

| File | Route | Funzione |
|------|-------|----------|
| `ChiusuraTurno.jsx` | `/vendite/fine-turno` | Form chiusura fine servizio |
| `ChiusureTurnoLista.jsx` | `/vendite/chiusure` | Lista chiusure (admin) — espansione diretta |
| `CorrispettiviMenu.jsx` | `/vendite` | Hub Gestione Vendite |
| `CorrispettiviRiepilogo.jsx` | `/vendite/riepilogo` | Riepilogo mensile multi-anno |
| `CorrispettiviDashboard.jsx` | `/vendite/dashboard` | Dashboard unificata 3 modalita' |
| `CorrispettiviImport.jsx` | `/vendite/impostazioni` | Impostazioni con sidebar (Chiusure + Import) |
| `CalendarioChiusure.jsx` | — | Componente calendario chiusure (dentro Impostazioni) |
| `PrecontiAdmin.jsx` | `/vendite/preconti` | Pre-conti (superadmin, nascosto) |
| `VenditeNav.jsx` | — | Barra navigazione con visibilita' per ruolo |

### Navigazione per ruolo
- **Fine Turno**: visibile a tutti (staff inserisce la chiusura)
- **Chiusure, Riepilogo, Dashboard, Impostazioni**: solo admin
- **Pre-conti**: solo superadmin (nascosto in Impostazioni menu)

### Pagine rimosse (v4.0)
- `CorrispettiviAnnual.jsx` — confronto annuale ora integrato nella dashboard unificata
- Route `/vendite/annual` → redirect a `/vendite/dashboard?mode=annuale`

---

# 9. Servizi backend

| File | Contenuto |
|------|-----------|
| `services/admin_finance_db.py` | Query dirette su `daily_closures` |
| `services/admin_finance_stats.py` | Calcolo statistiche mensili, annuali, top-days |
| `services/admin_finance_import.py` | Parsing e import da Excel |
| `services/corrispettivi_import.py` | Helper parsing Excel |
| `routers/closures_config_router.py` | GET/PUT configurazione chiusure |

---

# 10. Concetti chiave

### Dati fiscali puliti (v3.0+)
- La dashboard mostra SOLO corrispettivi (dati dichiarati fiscalmente)
- Contanti calcolati come residuo: `corrispettivi - pagamenti_elettronici`
- Questo garantisce che i totali quadrino sempre
- Rimossi: "Totale Incassi", colonna differenze, alert discrepanze

### Ruoli e gerarchia
- `superadmin` > `admin` > `sala/sommelier` > `viewer/chef`
- `is_admin(role)` → True per admin e superadmin
- `is_superadmin(role)` → True solo per superadmin

---

# 11. Roadmap modulo

- [ ] Checklist fine turno configurabile (seed dati default pranzo/cena)
- [ ] Integrazione cross-check chiusura turno vs daily_closures (import Excel)
- [ ] Export PDF riepilogo giornaliero/settimanale
- [ ] Coperti e scontrino medio nella dashboard
- [ ] Integrazione vendite vini (cross-query tra DB)
- [ ] Analisi pranzo vs cena
- [ ] P&L semplificato (vendite - acquisti)
