# TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-03-15 (sessione 7 — Eliminazione vecchio DB + fix carta PDF/HTML)

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro e' selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nell'ultima sessione (2026-03-15, sessione 7)

### Eliminazione vecchio DB vini.sqlite3 + fix carta PDF/HTML

#### Eliminazione vecchio DB (v3.0)
1. **`vini_router.py`** v3.0 — rimosso endpoint `/vini/upload`, movimenti ora su `vini_magazzino_db`
2. **`vini_cantina_tools_router.py`** v3.0 — rimosso endpoint `sync-from-excel`
3. **`vini_settings.py`** — rimosso codice migrazione vecchio DB
4. **Frontend** — 4 file aggiornati: ViniCarta, ViniDatabase, CantinaTools, ViniImpostazioni
5. **`mockup_nazione.html`** eliminato

#### Fix carta (v3.1)
6. **`ViniCarta.jsx`** v3.3 — rimosso tasto "Importa file Excel" (non serve, carta legge da magazzino)
7. **`carta_html.css`** v3.1 — allineato a PDF: filetti nazione, spaziature, Google Fonts
8. **`carta_pdf.css`** v3.1 — `page-break-after: avoid` su tipologia, nazione, regione, produttore
9. **Documentazione** — aggiornati tutti i file docs/ per riflettere eliminazione vecchio DB

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

1. **Deploy completo** — `./push.sh "Chiusure turno + cambio PIN + docs" -f`
2. **Test Chiusure Turno** — verificare form pranzo/cena, logica cumulativa, pre-conti, spese
3. **Test Cambio PIN** — verificare self-service e reset admin
4. **Checklist fine turno** — seed dati default pranzo/cena, UI configurazione
5. **Carta Vini web pubblica** — pagina internet aggiornata automaticamente
6. **Riconciliazione banca** — migliorare cross-ref, eliminare scadenza mista BPM
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
app/routers/vini_cantina_tools_router.py — strumenti cantina (v3.0, senza sync)
app/models/vini_magazzino_db.py          — DB unico vini
app/repositories/vini_repository.py      — load_vini_ordinati() da magazzino

# --- RICETTE & FOOD COST ---
app/routers/foodcost_recipes_router.py    — ricette + calcolo food cost
app/routers/foodcost_matching_router.py   — matching fatture → ingredienti
app/routers/foodcost_ingredients_router.py — ingredienti + conversioni

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
| `foodcost.db` | FoodCost + FE XML + Ricette + Banca + Finanza (migraz. 001-017) |
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
