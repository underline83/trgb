# 📊 Design Document — Modulo Gestione Vendite v1.0
**Data:** 2026-03-10
**Stato:** In sviluppo
**Precedente:** Modulo Corrispettivi v1.5

---

# 1. Visione

Evoluzione del modulo Corrispettivi in un sistema completo di gestione vendite per l'Osteria Tre Gobbi. Il modulo diventa una sezione di primo livello nella Home, con navigazione persistente e integrazione dati da piu' sorgenti (chiusure cassa, vendite vini, fatture attive).

---

# 2. Cosa eredita dal modulo Corrispettivi

Tutto il codice backend e frontend viene mantenuto e migrato:

- **Chiusura Cassa giornaliera** — form con corrispettivi, IVA, fatture, metodi pagamento
- **Import Excel** — archivio storico + import annuale
- **Dashboard mensile** — KPI, trend giornaliero, calendario, pie pagamenti, alert
- **Confronto annuale** — grafico e tabella anno su anno
- **DB**: `daily_closures` in `admin_finance.sqlite3`
- **Backend**: router `admin_finance.py` prefix `/admin/finance`

---

# 3. Architettura Nuova

## 3.1 Routing Frontend

```
/vendite                      — Menu Gestione Vendite (hub + KPI)
/vendite/chiusura             — Chiusura Cassa giornaliera (ex CorrispettiviGestione)
/vendite/dashboard            — Dashboard mensile (ex CorrispettiviDashboard)
/vendite/annuale              — Confronto annuale (ex CorrispettiviAnnual)
/vendite/import               — Import Excel (ex CorrispettiviImport)
/vendite/analisi              — [FUTURO] Analisi avanzate (coperti, servizi, categorie)
```

## 3.2 Backend API

Le API esistenti restano invariate (`/admin/finance/*`).
Nuovi endpoint verranno aggiunti progressivamente:

| Endpoint | Fase | Descrizione |
|----------|------|-------------|
| `GET /admin/finance/stats/weekly` | 2 | Statistiche settimanali |
| `GET /admin/finance/stats/covers` | 2 | Coperti e scontrino medio |
| `GET /admin/finance/stats/by-service` | 3 | Analisi pranzo vs cena |
| `GET /admin/finance/stats/wine-revenue` | 3 | Fatturato vini (da vendite vini) |
| `GET /admin/finance/stats/forecast` | 4 | Previsioni basate su storico |

## 3.3 Navigazione

**VenditeNav** — barra persistente con tab:
- Chiusura Cassa
- Dashboard
- Annuale
- Import (admin only)
- Analisi (futuro)

> **Nota (2026-03-30):** Le sezioni Gestione Contanti e Mance sono state spostate nel modulo Flussi di Cassa (`/flussi-cassa/contanti` e `/flussi-cassa/mance`). VenditeNav include redirect automatici per i vecchi URL.

---

# 4. Fasi di Sviluppo

## Fase 1 — Migrazione strutturale (CORRENTE)
- [x] Promuovere a sezione top-level `/vendite/*`
- [x] Creare VenditeNav (barra navigazione persistente)
- [x] Creare VenditeMenu hub con KPI rapidi
- [x] Aggiungere tile "Gestione Vendite" nella Home
- [x] Rimuovere Corrispettivi da AdminMenu
- [x] Aggiornare modules.json, versions.jsx, docs

## Fase 2 — Coperti e Scontrino Medio
- Aggiungere campo `coperti` alla chiusura giornaliera
- Migrazione DB: `ALTER TABLE daily_closures ADD COLUMN coperti INTEGER DEFAULT 0`
- Calcolo scontrino medio: `corrispettivi_tot / coperti`
- KPI dashboard: scontrino medio, coperti medi, trend
- Confronto annuale esteso con coperti

## Fase 3 — Integrazione Vendite Vini
- Cross-query tra `daily_closures` e movimenti vini (tipo=VENDITA)
- Percentuale fatturato vini vs totale
- Trend vendita vini nel tempo
- Analisi bottiglie vs calici per giorno
- Analisi pranzo vs cena (se dato disponibile)

## Fase 4 — Analisi Avanzate
- Pagina `/vendite/analisi` dedicata
- Giorno della settimana piu' redditizio
- Stagionalita' (mese su mese, trend annuale)
- Previsioni basate su media mobile
- Budget vs actual (se configurato)
- Export report PDF/Excel

## Fase 5 — Conto Economico
- Integrazione con Gestione Acquisti (costi)
- Margine operativo: vendite - acquisti
- Food cost % calcolato su dati reali
- P&L mensile semplificato

---

# 5. File Coinvolti

## Esistenti (da migrare)
```
frontend/src/pages/admin/CorrispettiviMenu.jsx    → VenditeMenu.jsx (riscritto)
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
app/routers/admin_finance.py       — Router /admin/finance (nessuna modifica)
app/services/admin_finance_db.py   — Query DB
app/services/admin_finance_stats.py — Statistiche
app/services/corrispettivi_import.py — Import Excel
```

---

# 6. Database — Evoluzioni Pianificate

### Fase 2: Coperti
```sql
ALTER TABLE daily_closures ADD COLUMN coperti INTEGER DEFAULT 0;
ALTER TABLE daily_closures ADD COLUMN scontrino_medio REAL DEFAULT 0;
```

### Fase 4: Budget
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

# 7. Note Tecniche

- Il backend prefix `/admin/finance` rimane invariato per evitare breaking changes
- Il frontend cambia route da `/admin/corrispettivi/*` a `/vendite/*`
- I file JSX vengono spostati da `pages/admin/` a una nuova cartella `pages/vendite/` (opzionale, per ora restano in admin/)
- L'integrazione con vendite vini (Fase 3) richiedera' una cross-query tra due DB diversi (`admin_finance.sqlite3` e `vini_magazzino.sqlite3`)
