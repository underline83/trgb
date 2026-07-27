# Modulo Vendite / Cassa — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** parziale · **Ultima verifica:** 2026-07-25 (vs codice)
> **Vedi anche:** `modulo_selezioni_giorno.md` (NOMEN-1) · `modulo_banca.md` (Flussi di Cassa) · `modulo_statistiche.md` · `roadmap.md` §K
> **Non verificato (assente dallo snapshot):** `frontend/src/App.jsx` (registrazione route) e `core/moduli/*/module.json` — le route FE sono confermate solo indirettamente da `VenditeNav.jsx` e dalle `navigate()` nelle pagine.

**Ultimo aggiornamento:** 2026-07-25 (verifica vs codice; 2026-05-19 rinominato da `modulo_selezioni.md` dopo audit autonomo — NOMEN-1)
**Stato:** Fase 1 completata. Fase 2 parzialmente realizzata lato chiusure turno (coperti + stats). Fase 3-5 in roadmap.
**Versione modulo (`versions.jsx`):** chiave `corrispettivi` **v4.8** — label "Gestione Vendite", status `stabile` (`frontend/src/config/versions.jsx:48-60`; non esiste una chiave `vendite`)
**Sezione top-level:** `/vendite/*`
**Backend prefix:** `/admin/finance/*` (invariato — evita breaking changes)
**DB:** `locali/<TRGB_LOCALE>/data/admin_finance.sqlite3` — path tenant-aware via `locale_data_path` (R6.5, `app/routers/chiusure_turno.py:22`)
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

Route vive (verificate 2026-07-25 su `VenditeNav.jsx:8-15` + pagine; `App.jsx` assente dallo snapshot, registrazione route non verificabile direttamente):

```
/vendite                      — redirect role-aware via ModuleRedirect.jsx (hub VenditeMenu rimosso)
/vendite/fine-turno           — Form chiusura turno pranzo/cena (ChiusuraTurno.jsx)
/vendite/chiusure             — Lista chiusure turno (ChiusureTurnoLista.jsx, admin)
/vendite/riepilogo            — Riepilogo mensile multi-anno (CorrispettiviRiepilogo.jsx, admin)
/vendite/dashboard            — Dashboard unificata 3 modalità (CorrispettiviDashboard.jsx, admin)
/vendite/impostazioni         — Impostazioni: Import Excel + Calendario chiusure (CorrispettiviImport.jsx, admin)
/vendite/preconti             — Pre-conti storici (PrecontiAdmin.jsx, superadmin, nascosto dal menu)
/vendite/chiusura             — Chiusura Cassa giornaliera legacy su daily_closures (CorrispettiviGestione.jsx — file presente, route non più in VenditeNav)
/vendite/annuale              — (rimosso) v4.0: confronto annuale integrato nella dashboard (`?mode=annuale`)
/vendite/analisi              — [FUTURO] Analisi avanzate (coperti, servizi, categorie)
```

## 3.2 Backend API

API esistenti invariate (`/admin/finance/*`). Nuovi endpoint progressivi (⚠️ verifica 2026-07-25: **nessuno di questi è ancora implementato** — restano pianificati):

| Endpoint | Fase | Descrizione |
|----------|------|-------------|
| `GET /admin/finance/stats/weekly` | 2 | Statistiche settimanali (pianificato) |
| `GET /admin/finance/stats/covers` | 2 | Coperti e scontrino medio (pianificato) |
| `GET /admin/finance/stats/by-service` | 3 | Analisi pranzo vs cena (pianificato) |
| `GET /admin/finance/stats/wine-revenue` | 3 | Fatturato vini (cross-query con `vini_magazzino.sqlite3`) (pianificato) |
| `GET /admin/finance/stats/forecast` | 4 | Previsioni basate su storico (pianificato) |

🆕 In parte la Fase 2 è già coperta dalle chiusure turno: esiste `GET /admin/finance/shift-closures/stats/daily` (coperti, incassato, scontrino medio per giorno con split pranzo/cena — `app/routers/chiusure_turno.py:399`), consumato dal modulo Statistiche (`StatisticheCoperti.jsx:166`).

---

# 4. Navigazione — `VenditeNav`

Barra persistente con tab (verifica 2026-07-25, `frontend/src/pages/admin/VenditeNav.jsx:8-15` — @version v2.1-vendite-nav-indigo):
- Chiusura Turno (`/vendite/fine-turno`) — visibile a tutti i ruoli
- Chiusure (`/vendite/chiusure`) — admin
- Riepilogo (`/vendite/riepilogo`) — admin
- Dashboard (`/vendite/dashboard`) — admin
- Impostazioni (`/vendite/impostazioni`) — admin

> **Nota (2026-03-30):** Le sezioni Gestione Contanti e Mance sono state spostate nel modulo Flussi di Cassa (`/flussi-cassa/contanti` e `/flussi-cassa/mance`, vedi `modulo_banca.md`). I redirect per i vecchi URL non sono più in `VenditeNav` (oggi resta solo il commento "Mance e Contanti spostati in Flussi di Cassa", `VenditeNav.jsx:13`); l'eventuale redirect a livello route non è verificabile senza `App.jsx`.

---

# 5. Fasi di Sviluppo

## Fase 1 — Migrazione strutturale ✅ COMPLETATA

- [x] Promuovere a sezione top-level `/vendite/*`
- [x] Creare `VenditeNav` (barra navigazione persistente)
- [x] Creare `VenditeMenu` hub con KPI rapidi — *(poi rimosso: gli hub `*Menu.jsx` sono stati sostituiti dal redirect role-aware `components/ModuleRedirect.jsx`)*
- [x] Aggiungere tile "Gestione Vendite" nella Home
- [x] Rimuovere Corrispettivi da AdminMenu
- [x] Aggiornare `modules.json`, `versions.jsx`, docs

## Fase 2 — Coperti e Scontrino Medio (in roadmap)

> 🆕 **Parzialmente realizzata via chiusure turno (verifica 2026-07-25):** il campo `coperti` esiste in `shift_closures` (`app/routers/chiusure_turno.py:50`) e lo scontrino medio per giorno è calcolato da `GET /admin/finance/shift-closures/stats/daily` (`chiusure_turno.py:399-516`), consumato dal modulo Statistiche. Resta in roadmap la parte su `daily_closures` / dashboard Vendite (K.1; superata in prospettiva da K.12 — unificazione tabelle).

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
frontend/src/pages/admin/CorrispettiviMenu.jsx     → (rimosso) hub sostituito da components/ModuleRedirect.jsx
frontend/src/pages/admin/CorrispettiviGestione.jsx → /vendite/chiusura (legacy daily_closures, fuori da VenditeNav)
frontend/src/pages/admin/CorrispettiviDashboard.jsx → /vendite/dashboard
frontend/src/pages/admin/CorrispettiviAnnual.jsx   → (rimosso dalla nav in v4.0; file ancora presente, non referenziato)
frontend/src/pages/admin/CorrispettiviImport.jsx   → /vendite/impostazioni
```

## Nuovi
```
frontend/src/pages/admin/VenditeNav.jsx            — Barra navigazione persistente (⚠️ vive in pages/admin/, NON in pages/vendite/)
frontend/src/pages/vendite/VenditeMenu.jsx         — (rimosso) sostituito da ModuleRedirect; la cartella pages/vendite/ non esiste
```

> ⚠️ NOMEN-1 inverso: `frontend/src/pages/selezioni/` contiene SOLO Selezioni del Giorno (`SelezioniDelGiorno.jsx`, `ZonaPanel.jsx`) — nessun file Vendite/Cassa.

## Backend (verifica 2026-07-25)
```
app/routers/admin_finance.py            — Router /admin/finance (corrispettivi, stats, export, cash/*)
app/routers/chiusure_turno.py           — Router /admin/finance/shift-closures (chiusure turno)
app/routers/closures_config_router.py   — Router /settings/closures-config
app/services/admin_finance_db.py        — Query DB
app/services/admin_finance_closure_utils.py — 🆕 utility pure chiusure giornaliere (is_effectively_closed, validazioni)
app/services/corrispettivi_import.py    — Import Excel
app/services/corrispettivi_export.py    — 🆕 export Excel + template + PDF commercialista, _merge_shift_and_daily
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
- 🆕 DB e config vivono in `locali/<TRGB_LOCALE>/data/` (R6.5, fail-loud senza fallback — `app/utils/locale_data.py`); i router usano `locale_data_path("admin_finance.sqlite3")` (`chiusure_turno.py:22`)
- Integrazione vendite vini (Fase 3) richiede cross-query tra due DB (`admin_finance.sqlite3` e `vini_magazzino.sqlite3`) — pattern da considerare quando si fa lo split DB cucina (`inventario_pulizia.md` §"Split DB cucina")

---

# 9. Chiusure Turno (operativo, dal 2026-03-14)

> Sezione assorbita da `modulo_corrispettivi.md` (cancellato in consolidamento docs 2026-05-08).

## 9.1 Flusso operativo

1. Lo staff seleziona data e turno (pranzo/cena)
2. Inserisce dati di chiusura: contanti, POS BPM, POS Sella, TheForkPay, altri e-payments, bonifici, mance
3. Inserisce il preconto (etichetta "Chiusura Parziale" a pranzo, "Chiusura (giorno)" a cena — `ChiusuraTurno.jsx:565`)
4. Inserisce le fatture emesse, i coperti e 🆕 gli **annulli/resi** (scontrini battuti ma mai incassati, migrazione 146 — campo `annulli_resi`, `chiusure_turno.py:49,97-99`)
5. Aggiunge **pre-conti**: righe dinamiche tavolo + importo per ogni tavolo non battuto
6. Aggiunge **spese**: righe dinamiche tipo (scontrino/fattura/personale/altro) + descrizione + importo
7. Inserisce fondo cassa inizio e fine servizio
8. Sistema calcola automaticamente totale incassi (senza mance — solo metodi di incasso reali, `chiusure_turno.py:1130-1140`), totale spese, quadratura

## 9.2 Logica cena cumulativa

A cena, lo staff inserisce **totali giornalieri** (la chiusura RT, i POS, ecc. sono già cumulativi). Il sistema:
- Carica i dati pranzo (se esistono)
- Sottrae pranzo da ogni valore per ottenere i parziali cena
- Mostra hint "pranzo X → parz. cena Y" sotto ogni campo
- Se pranzo non esiste, valori trattati come solo-cena con avviso

## 9.3 Quadratura

Calcolata **lato backend** nella lista chiusure (campi `saldo`, `diff_grezzo`, `spese_giorno` in `ShiftClosureOut` — `chiusure_turno.py:229-232, 870-900`):

- `entrate = totale_incassi + fondo_cassa_inizio − fondo_cassa_fine`
- `giustificato = chiusura RT (preconto) + Σ pre-conti + fatture − annulli/resi`
- `diff_grezzo = entrate − giustificato` · `saldo = diff_grezzo + Σ spese`
- A cena i campi principali sono giornalieri, ma pre-conti, spese, fatture e annulli del **pranzo** vengono sommati separatamente (`chiusure_turno.py:821-897`)

## 9.4 Backend — `chiusure_turno.py`

Prefix reale del router: **`/admin/finance/shift-closures`** (`chiusure_turno.py:135-139`), NON `/chiusure-turno`. Tutti gli 11 endpoint (verifica 2026-07-25):

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/admin/finance/shift-closures/` | Crea/aggiorna chiusura turno con pre-conti, spese e checklist (`:1103`) |
| GET | `/admin/finance/shift-closures/` | Lista chiusure con filtri `from_date`, `to_date`, `turno` + quadratura server-side (`:745`) |
| GET | `/admin/finance/shift-closures/{date}/{turno}` | Lettura chiusura con pre-conti e spese (`:937`) |
| DELETE | `/admin/finance/shift-closures/{closure_id}` | Elimina chiusura + dati collegati — admin (`:1459`) |
| GET | `/admin/finance/shift-closures/preconti` | 🆕 Storico pre-conti — superadmin (`:266`) |
| GET | `/admin/finance/shift-closures/spese` | 🆕 Storico spese fine turno — superadmin; usato da Flussi di Cassa/GestioneContanti (`:326`) |
| GET | `/admin/finance/shift-closures/stats/daily` | 🆕 Statistiche giornaliere coperti/incassi, split pranzo-cena (`:399`) |
| GET | `/admin/finance/shift-closures/config/all` | 🆕 Lista checklist config (`:534`) |
| POST | `/admin/finance/shift-closures/config` | 🆕 Crea item checklist — admin (`:578`) |
| PATCH | `/admin/finance/shift-closures/config/{id}` | 🆕 Aggiorna item checklist — admin (`:640`) |
| DELETE | `/admin/finance/shift-closures/config/{id}` | 🆕 Soft-delete item checklist (attivo=0) — admin (`:708`) |

⚠️ Il **trailing slash conta**: chiamare `/shift-closures` senza slash produce un 307 redirect che in alcuni contesti perde l'Authorization header (`ChiusureTurnoLista.jsx:76-78`).

Ruoli (dal codice): scrittura superadmin/admin/sommelier/sala (`check_allowed_role`, `:240-253`); lista, lettura singola e stats richiedono **solo autenticazione** lato backend (il limite "solo admin" è applicato dal frontend); pre-conti e spese storici solo superadmin; delete e config-write solo admin/superadmin.

> **Nota** (chiude il gap CRIT-3/DH.4 dell'audit 2026-05-19): la tabella sopra è ora il mapping completo endpoint:linea degli 11 endpoint reali.

## 9.5 DB — tabelle chiusure turno

In `admin_finance.sqlite3` (DDL in `ensure_shift_closures_tables`, `chiusure_turno.py:25-128`):
- `shift_closures` — dati chiusura con `fondo_cassa_inizio/fine`, `created_by`, 🆕 `annulli_resi` (mig 146) e `coperti`; UNIQUE(date, turno)
- `shift_preconti` — pre-conti: tavolo + importo per chiusura
- `shift_spese` — spese: tipo + descrizione + importo per chiusura
- `shift_checklist_config` — config checklist (predisposta, non ancora popolata)
- `shift_checklist_responses` — risposte checklist (predisposta)

> 🆕 **Rettifica pre-conti (luglio 2026) — id volatili:** l'upsert `POST /shift-closures/` fa sempre **DELETE + reinsert** delle righe `shift_preconti` e `shift_spese` della chiusura (`chiusure_turno.py:1283-1315`). Gli `id` di `shift_preconti`/`shift_spese` NON sono quindi stabili tra un salvataggio e l'altro: nessun consumer deve usarli come riferimento persistente (l'endpoint storico `/preconti` infatti non li espone, `:288-320`).

Tabella legacy: `daily_closures` — chiusure giornaliere da import Excel (tuttora supportate; unificazione decisa in roadmap §K.12).

## 9.6 Pre-conti (superadmin only, 2026-03-23)

Pannello Pre-conti nascosto dalla navigazione principale (`VenditeNav` non ha il tab), visibile solo a superadmin (check backend `is_superadmin`, `chiusure_turno.py:276-281`). Filtro default: mese corrente (1° del mese → oggi, `PrecontiAdmin.jsx:15-20`).

Pagina: `PrecontiAdmin.jsx` → `/vendite/preconti` (nascosto dal menu; route non verificabile direttamente — `App.jsx` assente dallo snapshot).

---

# 10. Dashboard unificata v4.0 (dal 2026-03-23)

> Capitolo assorbito da `modulo_corrispettivi.md`. Versione file attuale: v4.1-mattoni (`CorrispettiviDashboard.jsx:2`); modulo `corrispettivi` v4.8 in `versions.jsx` (fix V.1 semantica "giorno chiuso", vedi §11.2).

La dashboard supporta tre modalità (`mensile | trimestrale | annuale`, switch via query param `mode` — `CorrispettiviDashboard.jsx:53-56`) con navigazione e confronti appropriati:

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

- `CorrispettiviAnnual.jsx` — confronto annuale ora integrato nella dashboard unificata (⚠️ il file esiste ancora in `pages/admin/` ma non risulta importato da nessuna pagina; candidato a cleanup)
- Route `/vendite/annual` → redirect a `/vendite/dashboard?mode=annuale` (redirect non verificabile — `App.jsx` assente dallo snapshot)

---

# 11. Configurazione chiusure (giorno settimanale + festivi)

## 11.1 File configurazione

`locali/<TRGB_LOCALE>/data/closures_config.json` (R6.5: non più `app/data/` — `closures_config_router.py:24-25` via `locale_data_path`):
```json
{
  "giorno_chiusura_settimanale": 2,   // 0=Lunedì .. 6=Domenica, null=nessuno
  "giorni_chiusi": ["2026-12-25", "2026-08-15"],   // ferie, festività (giorno intero)
  "turni_chiusi": [{ "data": "2026-04-05", "turno": "pranzo", "motivo": "Pasqua" }]   // 🆕 chiusure parziali di singolo turno (closures_config_router.py:30-38)
}
```

⚠️ **Nota Marco (memoria `user_marco_osteria_orari`):** la domenica è APERTA in osteria (NON inserire 6 in `giorno_chiusura_settimanale`). Default tipico: mercoledì (= 2).

## 11.2 Logica priorità chiusura

⚠️ **Aggiornata dal fix V.1 (2026-07-17, corrispettivi v4.8)** — `_is_effectively_closed()` in `admin_finance.py:966-1016`:

1. Flag `is_closed` nel DB → sempre chiuso
2. Dati reali presenti (corrispettivi > 0 o incassi > 0) → aperto
3. **Nessun dato reale → chiuso di fatto**, a prescindere dalla config

La config `giorni_chiusi` / `giorno_chiusura_settimanale` NON entra più in questa logica (prima del fix un giorno a €0 fuori config era contato "aperto con €0", gonfiando i giorni aperti e sgonfiando lo YoY €/giorno). Resta usata dagli altri consumer (shading del calendario in dashboard, avvisi nel form fine turno).

## 11.3 Endpoint config chiusure — `closures_config_router.py`

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/settings/closures-config/` | Leggi configurazione chiusure |
| PUT | `/settings/closures-config/` | Aggiorna configurazione chiusure (admin) |

## 11.4 UI — `CalendarioChiusure.jsx` (dentro Vendite > Impostazioni)

- Pulsanti per selezionare il giorno di chiusura settimanale
- Calendario mensile per toggle singoli giorni
- Lista date chiuse con rimozione
- 🆕 Gestione **turni chiusi** (chiusure parziali): aggiunta data + turno + motivo, con rimozione (`CalendarioChiusure.jsx:97-118`)
- Salvataggio automatico ad ogni modifica (PUT immediato, `CalendarioChiusure.jsx:46-58`)

---

# 12. Endpoint Backend (riepilogo completo)

## 12.1 Corrispettivi & Stats — `admin_finance.py`

Verifica 2026-07-25 (righe di `app/routers/admin_finance.py`):

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/admin/finance/import-corrispettivi-file` | Import Excel corrispettivi (`:204`; era documentato come `/import` — path errato) |
| GET | `/admin/finance/export-corrispettivi` | 🆕 Export Excel corrispettivi per anno (`:270`) |
| GET | `/admin/finance/template-corrispettivi` | 🆕 Download template Excel (`:303`) |
| GET | `/admin/finance/export-corrispettivi-pdf` | PDF prospetto corrispettivi per il commercialista (mensile, fonte unita shift+daily via `_merge_shift_and_daily`, mattone M.B — `:326`) |
| GET | `/admin/finance/daily-closures/{date_str}` | Lettura chiusura giornaliera (`:360`) |
| POST | `/admin/finance/daily-closures` | Crea/aggiorna chiusura giornaliera (`:436`) |
| POST | `/admin/finance/daily-closures/{date_str}/set-closed` | 🆕 Marca giorno chiuso (`:633`) |
| GET | `/admin/finance/stats/monthly` | Statistiche mensili — fonte primaria `shift_closures` aggregata per data, fallback `daily_closures` (`:1048`) |
| GET | `/admin/finance/stats/annual` | 🆕 Statistiche annuali (usato dal Riepilogo — `:1371`) |
| GET | `/admin/finance/stats/annual-compare` | Confronto annuale (2 anni — `:1386`) |
| GET | `/admin/finance/stats/top-days` | Top/bottom giorni (`:1427`) |

> (rimosso/mai esistiti con questi path) `GET /admin/finance/chiusure/{year}/{month}` e `GET/POST/PUT /admin/finance/chiusura/{date}`: le chiusure giornaliere passano dagli endpoint `daily-closures` qui sopra.

> Nota: `admin_finance.py` ospita anche gli endpoint `/admin/finance/cash/*` (fondo cassa, versamenti, spese contanti, categorie, saldo iniziale — `:1599-2688`). Appartengono al modulo **Flussi di Cassa**: documentati in `modulo_banca.md`.

## 12.2 Servizi backend

| File | Contenuto |
|------|-----------|
| `services/admin_finance_db.py` | Query dirette su `daily_closures` |
| `services/admin_finance_closure_utils.py` | 🆕 Utility pure chiusure giornaliere: `is_effectively_closed` (variante service), normalizzazione e validazione input |
| `services/vendite_aggregator.py` | Merge `shift_closures` + `daily_closures` per consumer esterni (CG, Statistiche) — fonte unica di verità vendite |
| `services/admin_finance_import.py` | Parsing e import da Excel |
| `services/corrispettivi_import.py` | Helper parsing Excel |
| `services/corrispettivi_export.py` | 🆕 Export Excel, template, PDF commercialista (`build_corrispettivi_pdf`), `_merge_shift_and_daily` (campi canonici = fonte di verità) |

---

# 13. Frontend — file completi

Tutti i file vivono in `frontend/src/pages/admin/` (verifica 2026-07-25; route confermate via `VenditeNav.jsx` e `navigate()` — `App.jsx` assente dallo snapshot):

| File | Route | Funzione |
|------|-------|----------|
| `ChiusuraTurno.jsx` | `/vendite/fine-turno` | Form chiusura fine servizio |
| `ChiusureTurnoLista.jsx` | `/vendite/chiusure` | Lista chiusure (admin) — espansione diretta |
| `CorrispettiviMenu.jsx` | `/vendite` | (rimosso) hub sostituito da `components/ModuleRedirect.jsx` — redirect role-aware al primo tab accessibile |
| `CorrispettiviRiepilogo.jsx` | `/vendite/riepilogo` | Riepilogo mensile multi-anno (usa `GET /stats/annual`) |
| `CorrispettiviDashboard.jsx` | `/vendite/dashboard` | Dashboard unificata 3 modalità (v4.1-mattoni) |
| `CorrispettiviImport.jsx` | `/vendite/impostazioni` | Impostazioni con sidebar (Chiusure + Import) |
| `CorrispettiviGestione.jsx` | `/vendite/chiusura` | 🆕 Form chiusura cassa giornaliera legacy su `daily_closures` (fuori da VenditeNav; `CorrispettiviGestione.jsx:78,159`) |
| `CorrispettiviAnnual.jsx` | — | (rimosso dalla nav in v4.0) file presente ma non referenziato |
| `CalendarioChiusure.jsx` | — | Componente calendario chiusure + turni chiusi (dentro Impostazioni) |
| `PrecontiAdmin.jsx` | `/vendite/preconti` | Pre-conti (superadmin, nascosto) |
| `VenditeNav.jsx` | — | Barra navigazione con visibilità per ruolo (v2.1-vendite-nav-indigo) |

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
- 🆕 Ruoli validi complessivi (verifica 2026-07-25, `auth_service.py:236-240`): `superadmin, admin, contabile, chef, sous_chef, commis, sommelier, sala, viewer` — `contabile` NON è tra i ruoli abilitati alla scrittura chiusure turno (`chiusure_turno.py:246`)
- `is_admin(role)` → True per admin e superadmin (`auth_service.py:243`)
- `is_superadmin(role)` → True solo per superadmin (`auth_service.py:248`)

---

# 15. Roadmap modulo (sintesi — dettaglio in `roadmap.md` §K)

- Checklist fine turno configurabile (K.3 — DB + endpoint config pronti, serve seed + UI)
- Integrazione cross-check chiusura turno vs `daily_closures` (import Excel) (K.6)
- ✅ Export PDF prospetto corrispettivi per il commercialista — mensile, dalla Dashboard Vendite (2026-05-21)
- Export PDF riepilogo giornaliero/settimanale (K.4, dipendenza M.B PDF brand)
- Coperti e scontrino medio nella dashboard (K.1 / Fase 2 — dati già pronti in `shift_closures`)
- Integrazione vendite vini (cross-query, Fase 3)
- Analisi pranzo vs cena (K.5)
- P&L semplificato (vendite − acquisti, Fase 5 — vedi anche roadmap §G.3)
- 🆕 Unificare import Excel → `shift_closures` e dismettere `daily_closures` (K.12 — 🔴 ALTA, deciso Marco 2026-05-21)
- 🆕 Import XML corrispettivi telematici AdE come fonte aggiuntiva (K.13 — MEDIA)
