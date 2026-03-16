# TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-16 (sessione 10 — Cantina & Vini v4.0: filtro unificato, stampa selezionati, SchedaVino sidebar)

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro e' selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-16, sessione 10)

### Cantina & Vini v4.0 — filtro unificato, stampa selezionati, SchedaVino sidebar

#### Backend
1. **Nuovo endpoint** `POST /vini/cantina-tools/inventario/selezione/pdf` — accetta lista ID via Body, genera PDF con WeasyPrint e ritorna Response con bytes (autenticazione Bearer token)

#### Frontend
2. **MagazzinoVini.jsx** v4.0 — **filtro locazioni unificato**: 8 state vars e 6 select cascading sostituiti con 2 dropdown (Locazione + Spazio), logica di filtro cross-colonna su tutte e 4 le colonne DB
3. **handlePrintSelection()** — entrambi i pulsanti "Stampa selezionati" ora chiamano direttamente il nuovo endpoint POST (fetch+blob+createObjectURL), senza aprire StampaFiltrata
4. **SchedaVino.jsx** v5.0 — layout completamente riscritto da scroll verticale a **sidebar+main** con CSS grid `grid-cols-[260px_1fr]`:
   - Sidebar (260px): gradiente dinamico per TIPOLOGIA (ROSSI=rosso, BIANCHI=ambra, BOLLICINE=giallo, ROSATI=rosa, ecc.), nome vino, badge #id, 4 stat box, lista info, pulsanti azione
   - Main: area scrollabile con sezioni Anagrafica, Giacenze, Movimenti, Note
5. **Mappa `TIPOLOGIA_SIDEBAR`** — 8 gradients che corrispondono ai colori categoria della tabella MagazzinoVini

#### Note
- StampaFiltrata mantiene i propri filtri per-locazione separati (server-side) — è intenzionale
- Modifiche non ancora testate nel browser

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-15c, sessione 9)

### Modulo Statistiche v1.0 — import iPratico + analytics vendite
1. Migration 018, parser iPratico, router Statistiche (7 endpoint)
2. 5 componenti frontend: Menu, Nav, Dashboard, Prodotti, Import
3. Route, modules.json, versions.jsx, Home tile

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
| Cantina & Vini | v4.0 | stabile |
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

1. **Test SchedaVino sidebar+main** — verificare rendering, colori tipologia, responsive, edit mode
2. **Test filtro locazioni unificato** — verificare che il filtro cross-colonna funzioni correttamente
3. **Test stampa selezionati** — verificare generazione PDF e apertura in nuovo tab
4. **Aggiornare versions.jsx** — bumpa Cantina & Vini a v4.0
5. **Checklist fine turno** — seed dati default pranzo/cena, UI configurazione
6. **Sistema design/tema centralizzato** — Marco ha chiesto ma rimandato a dopo il dettaglio vino
7. **Flag DISCONTINUATO** — UI edit + filtro in dashboard vini

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
