# Modulo Vendite / Cassa — TRGB Gestionale

**Ultimo aggiornamento:** 2026-05-19 (rinominato da `modulo_selezioni.md` dopo audit autonomo — NOMEN-1)
**Stato:** Fase 1 completata. Fase 2-5 in roadmap.
**Versione modulo (`versions.jsx`):** vendite v1.x
**Sezione top-level:** `/vendite/*`
**Backend prefix:** `/admin/finance/*` (invariato — evita breaking changes)
**Roadmap:** sezione `K` di `docs/roadmap.md`

> **Modulo `cassa`** secondo la classificazione di `core/moduli/<id>/module.json`. Internamente Marco lo chiama spesso "Selezioni" (selezioni dei piatti dal menu carta che diventano corrispettivi venduti), ma il modulo tecnico è "Gestione Vendite / Cassa" che ha sostituito il vecchio "Corrispettivi".

---

## 0. Disambiguazione (NOMEN-1, audit 2026-05-19)

Storicamente "Selezioni" è stato usato per due cose semanticamente diverse, generando confusione:

| Termine | Modulo tecnico | Cosa | Doc canonico |
|---|---|---|---|
| **Vendite / Cassa** (questo file) | `cassa` | Corrispettivi, chiusure giornaliere, chiusure turno (pranzo/cena), pre-conti, spese fine turno, dashboard mensile/trimestrale/annuale, calendario chiusure | `docs/modulo_vendite.md` (era `modulo_selezioni.md`) |
| **Selezioni del Giorno** | `ricette` (sub-modulo) | Macellaio, Salumi, Formaggi, Pescato, Piatti del Giorno — proposte cucina visualizzate al cliente | `docs/modulo_selezioni_giorno.md` |

**Backend prefix:** Vendite/Cassa sta sotto `/admin/finance/*` (invariato per non rompere). Selezioni del Giorno sta sotto `/macellaio/`, `/salumi/`, `/formaggi/`, `/pescato/`, `/piatti-giorno/`.

**Frontend route:** Vendite sta sotto `/vendite/*`. Selezioni del Giorno sta sotto `/selezioni/*`.

---

# 1. Indice

1. Visione e contesto storico (eredità da Corrispettivi)
2. Architettura nuova (routing FE + BE)
3. Navigazione (`VenditeNav`)
4. Fasi di sviluppo (1 fatta, 2-5 in roadmap)
5. File coinvolti (esistenti + nuovi)
6. Database — evoluzioni pianificate
7. Note tecniche
8. Chiusure Turno (operativo, dal 2026-03-14)
9. Dashboard unificata v4.0 (dal 2026-03-23)
10. Configurazione chiusure (giorno settimanale + festivi)
11. Endpoint Backend (riepilogo completo)
12. Frontend — file completi
13. Concetti chiave
14. Roadmap modulo

---

# 2. Visione

Evoluzione del modulo Corrispettivi in un sistema completo di gestione vendite per l'Osteria Tre Gobbi. Diventa una sezione di primo livello nella Home, con navigazione persistente e integrazione dati da più sorgenti (chiusure cassa, vendite vini, fatture attive).

## 2.1 Cosa eredita dal modulo Corrispettivi

Tutto il codice backend e frontend è migrato:

- **Chiusura Cassa giornaliera** — form con corrispettivi, IVA, fatture, metodi pagamento
- **Import Excel** — archivio storico + import annuale
- **Dashboard mensile** — KPI, trend giornaliero, calendario, pie pagamenti, alert
- **Confronto annuale** — grafico e tabella anno su anno
- **DB**: `daily_closures` in `admin_finance.sqlite3`
- **Backend**: router `admin_finance.py`, prefix `/admin/finance` (invariato)

---

# 3. Architettura

## 3.1 Routing Frontend

```
/vendite                      — Menu Vendite (hub + KPI)
/vendite/chiusura             — Chiusura Cassa giornaliera (ex CorrispettiviGestione)
/vendite/dashboard            — Dashboard mensile (ex CorrispettiviDashboard)
/vendite/annuale              — Confronto annuale (ex CorrispettiviAnnual)
/vendite/import               — Import Excel (ex CorrispettiviImport)
/vendite/analisi              — [FUTURO] Analisi avanzate (coperti, servizi, categorie)
```

## 3.2 Backend API

API esistenti invariate (`/admin/finance/*`). Nuovi endpoint progressivi:

| Endpoint | Fase | Descrizione |
|----------|------|-------------|
| `GET /admin/finance/stats/weekly` | 2 | Statistiche settimanali |
| `GET /admin/finance/stats/covers` | 2 | Coperti e scontrino medio |
| `GET /admin/finance/stats/by-service` | 3 | Analisi pranzo vs cena |
| `GET /admin/finance/stats/wine-revenue` | 3 | Fatturato vini (cross-query con `vini_magazzino.sqlite3`) |
| `GET /admin/finance/stats/forecast` | 4 | Previsioni basate su storico |

---

# 4. Navigazione — `VenditeNav`

Barra persistente con tab:
- Chiusura Cassa
- Dashboard
- Annuale
- Import (admin only)
- Analisi (futuro)

> **Nota (2026-03-30):** Le sezioni Gestione Contanti e Mance sono state spostate nel modulo Flussi di Cassa (`/flussi-cassa/contanti` e `/flussi-cassa/mance`). `VenditeNav` include redirect automatici per i vecchi URL.

---

# 5. Fasi di Sviluppo

## Fase 1 — Migrazione strutturale ✅ COMPLETATA

- [x] Promuovere a sezione top-level `/vendite/*`
- [x] Creare `VenditeNav` (barra navigazione persistente)
- [x] Creare `VenditeMenu` hub con KPI rapidi
- [x] Aggiungere tile "Gestione Vendite" nella Home
- [x] Rimuovere Corrispettivi da AdminMenu
- [x] Aggiornare `modules.json`, `versions.jsx`, docs

## Fase 2 — Coperti e Scontrino Medio (in roadmap)

- Aggiungere campo `coperti` alla chiusura giornaliera
- Migrazione DB: `ALTER TABLE daily_closures ADD COLUMN coperti INTEGER DEFAULT 0`
- Calcolo scontrino medio: `corrispettivi_tot / coperti`
- KPI dashboard: scontrino medio, coperti medi, trend
- Confronto annuale esteso con coperti

## Fase 3 — Integrazione Vendite Vini (in roadmap)

- Cross-query tra `daily_closures` e movimenti vini (`tipo=VENDITA`)
- Percentuale fatturato vini vs totale
- Trend vendita vini nel tempo
- Analisi bottiglie vs calici per giorno
- Analisi pranzo vs cena (se dato disponibile)

## Fase 4 — Analisi Avanzate (in roadmap)

- Pagina `/vendite/analisi` dedicata
- Giorno della settimana più redditizio
- Stagionalità (mese su mese, trend annuale)
- Previsioni basate su media mobile
- Budget vs actual (se configurato)
- Export report PDF/Excel (dipendenza M.B PDF brand)

## Fase 5 — Conto Economico (in roadmap)

- Integrazione con Gestione Acquisti (costi)
- Margine operativo: vendite − acquisti
- Food cost % calcolato su dati reali
- P&L mensile semplificato

---

# 6. File coinvolti

## Esistenti (migrati da Corrispettivi)
```
frontend/src/pages/admin/CorrispettiviMenu.jsx     → VenditeMenu.jsx (riscritto)
frontend/src/pages/admin/CorrispettiviGestione.jsx → migrato a /vendite/chiusura
frontend/src/pages/admin/CorrispettiviDashboard.jsx → migrato a /vendite/dashboard
frontend/src/pages/admin/CorrispettiviAnnual.jsx   → migrato a /vendite/annuale
frontend/src/pages/admin/CorrispettiviImport.jsx   → migrato a /vendite/import
```

## Nuovi
```
frontend/src/pages/vendite/VenditeNav.jsx          — Barra navigazione persistente
frontend/src/pages/vendite/VenditeMenu.jsx         — Hub con KPI rapidi
```

## Backend (invariato per Fase 1)
```
app/routers/admin_finance.py            — Router /admin/finance (nessuna modifica)
app/services/admin_finance_db.py        — Query DB
app/services/corrispettivi_import.py    — Import Excel
app/services/vendite_aggregator.py      — Merge shift+daily per consumer esterni (CG, future dashboard)
```

---

# 7. Database — evoluzioni pianificate

## Fase 2: Coperti
```sql
ALTER TABLE daily_closures ADD COLUMN coperti INTEGER DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN scontrino_medio REAL DEFAULT 0;
```

## Fase 4: Budget
```sql
CREATE TABLE monthly_budget (
    id INTEGER PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    budget_corrispettivi REAL DEFAULT 0,
    budget_coperti INTEGER DEFAULT 0,
    note TEXT,
    UNIQUE(year, month)
);
```

---

# 8. Note tecniche

- Backend prefix `/admin/finance` rimane invariato per evitare breaking changes
- Frontend cambia route da `/admin/corrispettivi/*` a `/vendite/*`
- File JSX restano per ora in `pages/admin/` (eventuale spostamento a `pages/vendite/` opzionale, in futuro)
- Integrazione vendite vini (Fase 3) richiede cross-query tra due DB (`admin_finance.sqlite3` e `vini_magazzino.sqlite3`) — pattern da considerare quando si fa lo split DB cucina (`inventario_pulizia.md` §"Split DB cucina")

---

# 9. Chiusure Turno (operativo, dal 2026-03-14)

> Sezione assorbita da `modulo_corrispettivi.md` (cancellato in consolidamento docs 2026-05-08).

## 9.1 Flusso operativo

1. Lo staff seleziona data e turno (pranzo/cena)
2. Inserisce dati di chiusura: contanti, POS BPM, POS Sella, TheForkPay, altri e-payments, bonifici, mance
3. Inserisce il preconto (rinominato "Chiusura Parziale" a pranzo, "Chiusura" a cena)
4. Inserisce le fatture emesse e i coperti
5. Aggiunge **pre-conti**: righe dinamiche tavolo + importo per ogni tavolo non battuto
6. Aggiunge **spese**: righe dinamiche tipo (scontrino/fattura/personale/altro) + descrizione + importo
7. Inserisce fondo cassa inizio e fine servizio
8. Sistema calcola automaticamente totale incassi, totale spese, quadratura

## 9.2 Logica cena cumulativa

A cena, lo staff inserisce **totali giornalieri** (la chiusura RT, i POS, ecc. sono già cumulativi). Il sistema:
- Carica i dati pranzo (se esistono)
- Sottrae pranzo da ogni valore per ottenere i parziali cena
- Mostra hint "pranzo X → parz. cena Y" sotto ogni campo
- Se pranzo non esiste, valori trattati come solo-cena con avviso

## 9.3 Quadratura

- Pranzo: `incassi + preconti = chiusura_parziale`
- Cena: `incassi_cena + preconti_cena + preconti_pranzo = parziale_cena`

## 9.4 Backend — `chiusure_turno.py`

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/chiusure-turno` | Crea/aggiorna chiusura turno (con pre-conti e spese) |
| GET | `/chiusure-turno/{date}/{turno}` | Lettura chiusura con pre-conti e spese |
| GET | `/chiusure-turno` | Lista chiusure con filtri (date_from, date_to, turno) |

Ruoli: scrittura admin/sommelier/sala. Lista/stats solo admin.

> **Nota mapping endpoint:linea** (gap CRIT-3 audit 2026-05-19 — declassato a MED): il router `chiusure_turno.py` espone 11 endpoint reali (lista completa in `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` modulo Cassa). Da estendere questa tabella in sessione docs dedicata.

## 9.5 DB — tabelle chiusure turno

In `admin_finance.sqlite3`:
- `shift_closures` — dati chiusura con `fondo_cassa_inizio/fine`, `created_by`
- `shift_preconti` — pre-conti: tavolo + importo per chiusura
- `shift_spese` — spese: tipo + descrizione + importo per chiusura
- `shift_checklist_config` — config checklist (predisposta, non ancora popolata)
- `shift_checklist_responses` — risposte checklist (predisposta)

Tabella legacy: `daily_closures` — chiusure giornaliere da import Excel (tuttora supportate).

## 9.6 Pre-conti (superadmin only, 2026-03-23)

Pannello Pre-conti nascosto dalla navigazione principale, spostato in `Vendite > Impostazioni`, visibile solo a superadmin. Filtro default: mese corrente.

Pagina: `PrecontiAdmin.jsx` → `/vendite/preconti` (nascosto dal menu).

---

# 10. Dashboard unificata v4.0 (dal 2026-03-23)

> Capitolo assorbito da `modulo_corrispettivi.md`.

La dashboard supporta tre modalità con navigazione e confronti appropriati:

## 10.1 Modalità Mensile
- KPI: totale corrispettivi, media giornaliera, confronto YoY (smart con cutoff)
- Grafico linea giornaliero con anno precedente tratteggiato
- Calendario con colori per performance vs media del giorno della settimana
- Composizione pagamenti (pie chart + dettaglio metodi)
- Tabella giornaliera completa
- Top/bottom days (esclusi giorni chiusura)

## 10.2 Modalità Trimestrale
- Aggrega 3 mesi del trimestre selezionato
- Stessi KPI con confronto pari trimestre anno precedente (smart cutoff)
- Grafico giornaliero aggregato
- Composizione pagamenti aggregata
- Tabella giornaliera trimestre completo

## 10.3 Modalità Annuale
- Grafico a barre mensili (anno corrente vs precedente)
- Tabella mensile dettagliata con variazioni
- KPI con totali annuali e confronto YoY

## 10.4 Confronto YoY smart

Quando il periodo è in corso (mese/trimestre/anno corrente), il confronto limita i dati dell'anno precedente allo stesso giorno del calendario, evitando confronti falsati da giorni in più.

## 10.5 Pagine rimosse (v4.0)

- `CorrispettiviAnnual.jsx` — confronto annuale ora integrato nella dashboard unificata
- Route `/vendite/annual` → redirect a `/vendite/dashboard?mode=annuale`

---

# 11. Configurazione chiusure (giorno settimanale + festivi)

## 11.1 File configurazione

`app/data/closures_config.json`:
```json
{
  "giorno_chiusura_settimanale": 2,   // 0=Lunedì .. 6=Domenica, null=nessuno
  "giorni_chiusi": ["2026-12-25", "2026-08-15"]   // ferie, festività
}
```

⚠️ **Nota Marco (memoria `user_marco_osteria_orari`):** la domenica è APERTA in osteria (NON inserire 6 in `giorno_chiusura_settimanale`). Default tipico: mercoledì (= 2).

## 11.2 Logica priorità chiusura

1. Flag `is_closed` nel DB → sempre chiuso
2. Dati reali presenti (corrispettivi > 0 o incassi > 0) → sempre aperto
3. Data in `giorni_chiusi` configurati → chiuso
4. Giorno della settimana configurato → chiuso

## 11.3 Endpoint config chiusure — `closures_config_router.py`

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/settings/closures-config/` | Leggi configurazione chiusure |
| PUT | `/settings/closures-config/` | Aggiorna configurazione chiusure (admin) |

## 11.4 UI — `CalendarioChiusure.jsx` (dentro Vendite > Impostazioni)

- Pulsanti per selezionare il giorno di chiusura settimanale
- Calendario mensile per toggle singoli giorni
- Lista date chiuse con rimozione
- Salvataggio automatico ad ogni modifica

---

# 12. Endpoint Backend (riepilogo completo)

## 12.1 Corrispettivi & Stats — `admin_finance.py`

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/admin/finance/import` | Import Excel corrispettivi |
| GET | `/admin/finance/export-corrispettivi-pdf` | PDF prospetto corrispettivi per il commercialista (mensile, fonte unita shift+daily, mattone M.B) |
| GET | `/admin/finance/chiusure/{year}/{month}` | Chiusure mensili |
| GET/POST/PUT | `/admin/finance/chiusura/{date}` | Chiusura giornaliera CRUD |
| GET | `/admin/finance/stats/monthly` | Statistiche mensili |
| GET | `/admin/finance/stats/annual-compare` | Confronto annuale (2 anni) |
| GET | `/admin/finance/stats/top-days` | Top/bottom giorni |

## 12.2 Servizi backend

| File | Contenuto |
|------|-----------|
| `services/admin_finance_db.py` | Query dirette su `daily_closures` |
| `services/vendite_aggregator.py` | Merge `shift_closures` + `daily_closures` per consumer esterni (CG, future dashboard) |
| `services/admin_finance_import.py` | Parsing e import da Excel |
| `services/corrispettivi_import.py` | Helper parsing Excel |

---

# 13. Frontend — file completi

| File | Route | Funzione |
|------|-------|----------|
| `ChiusuraTurno.jsx` | `/vendite/fine-turno` | Form chiusura fine servizio |
| `ChiusureTurnoLista.jsx` | `/vendite/chiusure` | Lista chiusure (admin) — espansione diretta |
| `CorrispettiviMenu.jsx` | `/vendite` | Hub Gestione Vendite |
| `CorrispettiviRiepilogo.jsx` | `/vendite/riepilogo` | Riepilogo mensile multi-anno |
| `CorrispettiviDashboard.jsx` | `/vendite/dashboard` | Dashboard unificata 3 modalità |
| `CorrispettiviImport.jsx` | `/vendite/impostazioni` | Impostazioni con sidebar (Chiusure + Import) |
| `CalendarioChiusure.jsx` | — | Componente calendario chiusure (dentro Impostazioni) |
| `PrecontiAdmin.jsx` | `/vendite/preconti` | Pre-conti (superadmin, nascosto) |
| `VenditeNav.jsx` | — | Barra navigazione con visibilità per ruolo |

## 13.1 Visibilità per ruolo

- **Fine Turno:** visibile a tutti (staff inserisce la chiusura)
- **Chiusure, Riepilogo, Dashboard, Impostazioni:** solo admin
- **Pre-conti:** solo superadmin (nascosto in Impostazioni menu)

---

# 14. Concetti chiave

## 14.1 Dati fiscali puliti (v3.0+)

- La dashboard mostra SOLO corrispettivi (dati dichiarati fiscalmente)
- Contanti calcolati come residuo: `corrispettivi - pagamenti_elettronici`
- Garantisce che i totali quadrino sempre
- Rimossi: "Totale Incassi", colonna differenze, alert discrepanze

## 14.2 Ruoli e gerarchia

- `superadmin` > `admin` > `sala/sommelier` > `viewer/chef`
- `is_admin(role)` → True per admin e superadmin
- `is_superadmin(role)` → True solo per superadmin

---

# 15. Roadmap modulo (sintesi — dettaglio in `roadmap.md` §K e §S)

- Checklist fine turno configurabile (seed dati default pranzo/cena)
- Integrazione cross-check chiusura turno vs `daily_closures` (import Excel)
- ✅ Export PDF prospetto corrispettivi per il commercialista — mensile, dalla Dashboard Vendite (2026-05-21)
- Export PDF riepilogo giornaliero/settimanale (dipendenza M.B PDF brand)
- Coperti e scontrino medio nella dashboard (Fase 2)
- Integrazione vendite vini (cross-query, Fase 3)
- Analisi pranzo vs cena
- P&L semplificato (vendite − acquisti, Fase 5)
