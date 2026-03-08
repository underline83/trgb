# 💰 Modulo Corrispettivi — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-08
**Stato:** operativo
**Router:** `app/routers/admin_finance.py` — prefix `/admin/finance`
**DB:** `app/data/foodcost.db` (tabella `daily_closures` in foodcost.db)

---

# 1. Obiettivo del modulo

Il modulo Corrispettivi gestisce:

- import giornaliero dei corrispettivi da file Excel
- gestione delle chiusure giornaliere (apertura/chiusura cassa)
- statistiche mensili, annuali e confronto annuale
- dashboard con grafici (breakdown pagamenti, trend mensile, top giorni)

---

# 2. Flusso operativo

1. L'utente importa il file Excel corrispettivi (`POST /admin/finance/import-corrispettivi-file`)
2. Il sistema parsifica il file e popola `daily_closures`
3. L'utente verifica/corregge le chiusure giornaliere dalla pagina Gestione
4. La Dashboard mostra statistiche aggregate con grafici

---

# 3. Endpoint Backend

⚠️ **Nessun endpoint è protetto da `get_current_user` (task #3 Roadmap — APERTO)**

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| `POST` | `/admin/finance/import-corrispettivi-file` | Import Excel corrispettivi |
| `GET` | `/admin/finance/daily-closures/{date_str}` | Lettura chiusura giornaliera |
| `POST` | `/admin/finance/daily-closures` | Creazione/aggiornamento chiusura |
| `POST` | `/admin/finance/daily-closures/{date_str}/set-closed` | Chiude una giornata |
| `GET` | `/admin/finance/stats/monthly` | Statistiche mensili |
| `GET` | `/admin/finance/stats/annual` | Statistiche annuali |
| `GET` | `/admin/finance/stats/annual-compare` | Confronto anno corrente vs precedente |
| `GET` | `/admin/finance/stats/top-days` | Top giorni per incasso |

---

# 4. Struttura dati — chiusura giornaliera

Ogni record `daily_closures` contiene:

- data (YYYY-MM-DD)
- totale incasso
- breakdown pagamenti: contanti, pos_bpm, pos_sella, bonifico, altro
- flag `is_closed` (giornata chiusa = non più modificabile)
- note operative

---

# 5. Frontend

Pagine React in `src/pages/admin/`:

| File | Route | Funzione |
|------|-------|----------|
| `CorrispettiviMenu.jsx` | `/admin/corrispettivi` | Menu modulo |
| `CorrispettiviImport.jsx` | `/admin/corrispettivi/import` | Upload e import Excel |
| `CorrispettiviGestione.jsx` | `/admin/corrispettivi/gestione` | Vista calendario, chiusure, editing |
| `CorrispettiviDashboard.jsx` | `/admin/corrispettivi/dashboard` | Grafici: mensile, pie pagamenti, top giorni |

⚠️ **Route mancante (task #6 Roadmap):** il pulsante "Confronto Annuale" esiste ma `/admin/corrispettivi/annual` non è definita in `App.jsx`. L'endpoint backend `/admin/finance/stats/annual-compare` esiste già.

---

# 6. Servizi backend

| File | Contenuto |
|------|-----------|
| `services/admin_finance_db.py` | Query dirette su `daily_closures` |
| `services/admin_finance_stats.py` | Calcolo statistiche mensili, annuali, top-days |
| `services/admin_finance_import.py` | Parsing e import da Excel |
| `services/corrispettivi_import.py` | Helper parsing Excel |
| `services/admin_finance_closure_utils.py` | Utility calcolo chiusure |

---

# 7. Roadmap modulo

- Aggiungere `Depends(get_current_user)` a tutti gli endpoint (task #3)
- Creare route `/admin/corrispettivi/annual` in `App.jsx` (task #6)
- Creare pagina frontend per il confronto annuale
