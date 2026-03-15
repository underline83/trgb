# TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-15 (sessione 9 — Modulo Statistiche v1.0)

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro e' selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-15c, sessione 9)

### Modulo Statistiche v1.0 — import iPratico + analytics vendite

#### Backend
1. **Migration 018** (`018_ipratico_vendite.py`) — 3 tabelle in `foodcost.db`: `ipratico_imports`, `ipratico_categorie`, `ipratico_prodotti`
2. **Parser iPratico** (`app/services/ipratico_parser.py`) — parsa export .xls (HTML) con `pd.read_html()`, gestisce encoding variabile
3. **Router Statistiche** (`app/routers/statistiche_router.py` v1.0) — 7 endpoint: import-ipratico, mesi, categorie, prodotti, top-prodotti, trend, elimina mese
4. **Wired up** in `main.py` con `include_router(statistiche_router.router)`

#### Frontend
5. **StatisticheMenu.jsx** — menu principale con tile colorate
6. **StatisticheNav.jsx** — tab navigation (Dashboard, Prodotti, Import)
7. **StatisticheDashboard.jsx** — KPI fatturato/pezzi, categorie con barra %, top 15, trend mensile bar chart CSS
8. **StatisticheProdotti.jsx** — tabella con filtri anno/mese/categoria/ricerca + paginazione
9. **StatisticheImport.jsx** — upload .xls con selettore anno/mese, storico import, delete mese

#### Configurazione
10. Route in `App.jsx` v3.8: `/statistiche`, `/statistiche/dashboard`, `/statistiche/prodotti`, `/statistiche/import`
11. `modules.json` — modulo `statistiche` (admin, viewer)
12. `versions.jsx` — `statistiche: v1.0 beta`
13. `Home.jsx` — tile Statistiche in Home

#### Documentazione
14. Aggiornati: changelog.md, sessione.md, architettura.md

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-15b, sessione 8)

### Unificazione loader carta + DOCX tabelle + fix cancellazione movimenti
1. Eliminata `_load_vini_cantina_ordinati()`, loader unificato
2. DOCX con tabelle senza bordi a 3 colonne
3. Fix `delete_movimento()` con inversione del delta

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-15, sessione 7)

### Eliminazione vecchio DB vini.sqlite3 + fix carta PDF/HTML
1. `vini_router.py` v3.0, `vini_cantina_tools_router.py` v3.0 — rimosso vecchio DB
2. `ViniCarta.jsx` v3.3 — rimosso tasto import Excel, carta legge da magazzino
3. `carta_html.css` v3.1 + `carta_pdf.css` v3.1 — allineamento stili, fix page-break
4. Documentazione aggiornata (7 file)

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-14, sessione 6)

### Chiusure Turno — modulo completo + Cambio PIN
1. Modulo Chiusure Turno completo (backend + frontend + DB)
2. Cambio PIN self-service + reset admin
3. Documentazione aggiornata

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-14a, sessione 5c)

### Cantina & Vini v3.7
1. Filtri locazione gerarchici (cascading) — 3 gruppi con 6 select
2. Dashboard KPI valore acquisto/carta + liste espandibili
3. Modifica massiva ordinabile con dropdown locazioni configurate

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-13, sessione 5b)

### Modulo Banca v1.0 + Conversioni unita' + Smart Create UX
1. Modulo Banca completo (migration 014, banca_router.py, 7 pagine frontend)
2. Conversioni unita' personalizzate per ingrediente (migration 013)
3. Smart Create UX: select/deselect all, default tutti deselezionati

---

## Stato attuale del codice — cose critiche da sapere

### Modulo Chiusure Turno (NUOVO)
- **Backend**: `chiusure_turno.py` con endpoint POST/GET per chiusure + pre-conti + spese
- **Frontend**: `ChiusuraTurno.jsx` (form), `ChiusureTurnoLista.jsx` (lista admin)
- **DB**: `admin_finance.sqlite3` con tabelle shift_closures, shift_preconti, shift_spese
- **Logica cena**: staff inserisce totali giornalieri, sistema sottrae pranzo per parziali

### Cambio PIN
- **Frontend**: `CambioPIN.jsx` a `/cambio-pin`
- **Backend**: usa endpoint esistente `PUT /auth/users/{username}/password`
- **Header**: icona chiave per accesso rapido

### NON ANCORA TESTATO IN PRODUZIONE
Chiusure Turno e Cambio PIN sono committati ma non ancora deployati e testati.

### FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

### `.env` non esiste sul VPS
Il file `.env` con `SECRET_KEY` e' stato creato in locale (gitignored). Sul VPS va creato manualmente.

---

## Mappa versioni moduli

Fonte di verita': `frontend/src/config/versions.jsx`

| Modulo | Versione | Stato |
|--------|----------|-------|
| Cantina & Vini | v3.7 | stabile |
| Gestione Acquisti | v2.0 | stabile |
| Ricette & Food Cost | v3.0 | beta |
| Gestione Vendite | v2.0 | stabile |
| Statistiche | v1.0 | beta |
| Banca | v1.0 | beta |
| Finanza | v1.0 | beta |
| Dipendenti | v1.0 | stabile |
| Login & Ruoli | v2.0 | stabile |
| Sistema | v4.3 | stabile |

---

## Task aperti prioritizzati

Vai su `docs/roadmap.md` per la lista completa.

| # | Task | Stato |
|---|------|-------|
| 26 | Checklist fine turno configurabile | Da fare |
| 20 | Carta Vini pagina web pubblica | Da fare |
| 25 | Sistema permessi centralizzato | TODO |
| 28 | Riconciliazione banca migliorata | Da fare |
| 17 | Flag DISCONTINUATO UI per vini | Da fare |

---

## Prossima sessione — TODO

1. **Test cancellazione movimenti** — verificare che delete VENDITA ripristini giacenza correttamente
2. **Test DOCX carta** — aprire in Word e verificare allineamento colonne
3. **Checklist fine turno** — seed dati default pranzo/cena, UI configurazione
4. **Carta Vini web pubblica** — pagina internet aggiornata automaticamente
5. **Riconciliazione banca** — migliorare cross-ref, eliminare scadenza mista BPM
6. **Flag DISCONTINUATO** — UI edit + filtro in dashboard vini

---

## File chiave — dove trovare le cose

```
main.py                                — entry point, include tutti i router
app/services/auth_service.py           — auth PIN sha256_crypt
app/data/users.json                    — store utenti (marco/iryna/paolo/ospite)

# --- CHIUSURE TURNO ---
app/routers/chiusure_turno.py          — backend, prefix /chiusure-turno
frontend/src/pages/admin/ChiusuraTurno.jsx  — form fine servizio
frontend/src/pages/admin/ChiusureTurnoLista.jsx — lista chiusure admin

# --- VINI ---
app/routers/vini_router.py               — carta vini + movimenti (v3.0, solo magazzino)
app/routers/vini_magazzino_router.py     — magazzino vini CRUD
app/routers/vini_cantina_tools_router.py — strumenti cantina (v3.1, loader unificato)
app/models/vini_magazzino_db.py          — DB unico vini + fix delete_movimento
app/services/carta_vini_service.py       — builder HTML/PDF/DOCX carta vini
app/repositories/vini_repository.py      — load_vini_ordinati() da magazzino (usato da tutti)

# --- RICETTE & FOOD COST ---
app/routers/foodcost_recipes_router.py    — ricette + calcolo food cost
app/routers/foodcost_matching_router.py   — matching fatture → ingredienti
app/routers/foodcost_ingredients_router.py — ingredienti + conversioni

# --- STATISTICHE ---
app/routers/statistiche_router.py        — import iPratico + analytics (v1.0)
app/services/ipratico_parser.py          — parser export .xls (HTML)
frontend/src/pages/statistiche/          — Menu, Nav, Dashboard, Prodotti, Import

# --- BANCA ---
app/routers/banca_router.py              — movimenti, dashboard, categorie, cross-ref

# --- VENDITE ---
app/routers/admin_finance.py              — corrispettivi legacy
frontend/src/pages/admin/VenditeNav.jsx   — navigazione

# --- FRONTEND ---
frontend/src/App.jsx                   — tutte le route (50+)
frontend/src/config/api.js             — API_BASE + apiFetch()
frontend/src/config/versions.jsx       — versioni moduli
frontend/src/components/Header.jsx     — header + cambio PIN
frontend/src/pages/CambioPIN.jsx       — self-service + admin reset
```

---

## DB — mappa rapida

| Database | Moduli |
|----------|--------|
| ~~`vini.sqlite3`~~ | ELIMINATO v3.0 — carta ora da magazzino |
| `vini_magazzino.sqlite3` | Cantina moderna |
| `vini_settings.sqlite3` | Settings carta |
| `foodcost.db` | FoodCost + FE XML + Ricette + Banca + Finanza + Statistiche (migraz. 001-018) |
| `admin_finance.sqlite3` | Vendite + Chiusure turno |
| `dipendenti.sqlite3` | Dipendenti (runtime) |

---

## Deploy — PROCEDURA OBBLIGATORIA

> **IMPORTANTE PER CLAUDE:** Dopo ogni commit, ricorda SEMPRE a Marco di fare il deploy
> con `push.sh`. Lo script nella root del progetto fa TUTTO automaticamente.

```bash
./push.sh "messaggio commit"       # deploy rapido
./push.sh "messaggio commit" -f    # deploy completo (pip + npm)
```

### NOTA: Claude NON puo' eseguire push.sh
Lo script richiede accesso SSH al VPS. Marco deve lanciarlo dal terminale del Mac.

---

## Aggiorna questo file a fine sessione

Sostituisci la sezione "Cosa abbiamo fatto" con i task completati oggi.
Aggiorna la tabella dei task se ne hai chiusi.
