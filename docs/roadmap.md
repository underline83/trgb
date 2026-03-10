# 🛠️ TRGB Gestionale — Roadmap & TO-DO
**Ultimo aggiornamento:** 2026-03-09

Roadmap ufficiale per lo sviluppo progressivo del gestionale.

---

# 🔴 CRITICI — Sicurezza & Bug bloccanti

## 1. Auth reale (sostituire mock)
- [x] Rimosso `USERS` dict con password in chiaro — 2026-03-09
- [x] Implementati hash `sha256_crypt` (via `passlib.CryptContext`) — `security.verify_password()` — 2026-03-09
- [x] `SECRET_KEY` letta da `.env` via `python-dotenv` (fallback al valore hardcoded per retrocompatibilità) — 2026-03-09
- [x] `get_current_user()` funzionante con nuovi hash — 2026-03-09
- [x] `scripts/gen_passwords.py` — utility per rigenerate hash al cambio password — 2026-03-09

> ✅ **Chiuso** — `auth_service.py` ora usa `sha256_crypt` hash. `.env` gitignored, `python-dotenv` in requirements.

## 2. HTTPS in produzione
- [x] Aggiornato `.env.production`: `http://80.211.131.156:8000` → `https://trgb.tregobbi.it` — 2026-03-09
- [ ] Verificare che Nginx faccia correttamente da reverse proxy per il backend
- [ ] Testare login e chiamate API dopo il deploy

## 3. Endpoint senza autenticazione
- [x] `admin_finance.py` — `dependencies=[Depends(get_current_user)]` su router — 2026-03-08
- [x] `fe_import.py` — idem — 2026-03-08
- [x] `foodcost_ingredients_router.py` — idem — 2026-03-08
- [x] `foodcost_recipes_router.py` — idem — 2026-03-08
- [x] `vini_settings_router.py` — idem — 2026-03-08

> ✅ **Chiuso** — tutti i router ora protetti a livello router.

## 4. `pyxlsb` mancante in `requirements.txt`
- [x] Aggiunto `pyxlsb` a `requirements.txt` — commit `9a34957` — 2026-03-08
- [ ] Verificare con `./scripts/deploy.sh -f` sul VPS (primo deploy completo)

---

# 🟡 FUNZIONALI — Bug visibili

## 5. Bug pie chart pagamenti (`CorrispettiviDashboard.jsx`)
- [x] Corretto `pag.pos` → `pag.pos_bpm` — 2026-03-08
- [x] Corretto `pag.sella` → `pag.pos_sella` — 2026-03-08
- [x] Deployato in produzione — commit `0d7987b` — 2026-03-08

## 6. Route `/admin/corrispettivi/annual` mancante
- [x] Aggiunta route in `App.jsx` — commit `b5d282a` — 2026-03-08
- [x] Creata pagina `CorrispettiviAnnual.jsx` — confronto annuale con grafico e tabella mensile

## 7. Gestione token scaduto nel frontend
- [x] `apiFetch()` centralizzato in `api.js` — wrapper di `fetch` con auto-inject token e redirect 401 — 2026-03-08
- [x] Rimossa gestione 401 duplicata da: `ViniCarta`, `MagazzinoVini`, `MagazzinoViniDettaglio`, `MagazzinoViniNuovo`, `DipendentiAnagrafica`, `CorrispettiviAnnual` — 2026-03-08

> ✅ **Chiuso** — sostituito con `apiFetch()` (no Axios, usa native fetch)

## 8. `console.log` di debug in produzione
- [x] Rimosso `console.log("API_BASE:", API_BASE)` da `LoginForm.jsx` — commit `9a34957` — 2026-03-08

---

# 🟠 PULIZIA CODICE

## 9. `slugify` duplicata
- [x] Rimossa copia da `vini_router.py` — commit `b5d282a` — 2026-03-08
- [x] Importata da `carta_vini_service.py` — rimossi import `unicodedata` e `re` inutilizzati

## 10. Endpoint duplicate-check duplicati (magazzino)
- [x] Rimosso `/duplicate-check` ridondante — mantenuto solo `POST /check-duplicati` — 2026-03-09

> ✅ **Chiuso** — endpoint consolidato.

## 11. Bug prezzo=0 nella preview HTML carta vini
- [x] `carta_vini_service.py`: allineato `if prezzo:` → `if prezzo not in (None, "")` — commit `b5d282a` — 2026-03-08

## 12. DELETE movimento senza check ruolo
- [x] `vini_magazzino_router.py`: aggiunto role check su `DELETE /movimenti/{id}` — solo `admin` o `sommelier` — 2026-03-09

> ✅ **Chiuso** — 403 Forbidden per tutti gli altri ruoli.

---

# 🔵 DOCUMENTAZIONE

## 13. `version.json` non valido
- [x] Eliminato — 2026-03-08

## 14. Changelog fermo a dicembre 2025
- [x] `changelog.md` aggiornato con tutte le modifiche di marzo 2026 — 2026-03-09
- [x] `VersionMap.md` eliminato, contenuto integrato in `architettura.md` — 2026-03-08

## 15. `sistema-vini.md` duplicato
- [x] Eliminato — 2026-03-08

---

# ⚪ NUOVE FUNZIONALITÀ (Roadmap)

## 16. Modulo Fatture Elettroniche — Fase 2 (matching ingredienti)
- [ ] Collegamento riga FE ↔ ingrediente
- [ ] Algoritmo fuzzy per matching automatico
- [ ] UI di conferma match
- [ ] Aggiornamento prezzo ingrediente automatico
- [ ] Creazione tabella `fe_righe_match`
- [ ] Gestione Note di Credito XML
- [ ] Dashboard acquisti con grafici

## 17. Modulo Magazzino Vini
- [x] Pagina Movimenti Cantina con storico e delete (admin/sommelier) — 2026-03-09
- [x] Edit vino da UI (anagrafica + prezzi + flag) — `MagazzinoViniDettaglio.jsx` v2.0 — 2026-03-09
- [x] Note operative per vino (add + delete) — 2026-03-09
- [x] Giacenze per locazione editabili da UI — 2026-03-09
- [x] Dashboard Vini operativa (KPI stock + vendite, alert, analytics, drill-down) — `DashboardVini.jsx` v2.1 — 2026-03-09
- [x] Badge `#id` standardizzato su tutte le pagine del modulo — 2026-03-09
- [ ] Flag `DISCONTINUATO` (vini da non ricomprare) — colonna DB + edit da UI + filtro in dashboard — task #23
- [ ] Drill-down "carta senza giacenza" con toggle DISCONTINUATO inline — task #24
- [ ] Filtri lato server per dataset grandi
- [ ] Sincronizzazione storico prezzi
- [ ] Import Excel con diff interattivo
- [ ] Integrazione carichi automatici da Fatture XML

## 18. Calcolo food cost nelle ricette
- [ ] Implementare calcolo costo porzione in `foodcost_recipes_router.py`
- [ ] Calcolo automatico al salvataggio ricetta (somma ingredienti × quantità)
- [ ] Esportazione PDF ricette con costi

## 19. Migrazioni DB mancanti
- [ ] Creare sistema migrazioni per `dipendenti.sqlite3`
- [ ] Creare `006_fe_import.py` per `fe_fatture`/`fe_righe`

## 20. Carta Vini — miglioramenti UI
- [x] Ordinamento tipologie/nazioni/regioni — UI con frecce ▲▼ in Strumenti — 2026-03-10
- [x] Filtri carta configurabili (qta minima, mostra negativi, mostra senza prezzo) — 2026-03-10
- [ ] **Pagina web pubblica aggiornata** — generare una pagina internet con la carta vini sempre aggiornata (da cantina)
- [ ] **PDF con indici cliccabili** — TOC con link interni che portano alle sezioni tipologia/regione
- [ ] Anteprima carta con filtri dinamici
- [ ] Versioning della carta vini (storico PDF)
- [ ] Template multipli (eventi, degustazioni)

## 21. Modulo FoodCost — UI e dashboard
- [ ] Nuova UI ingredienti
- [ ] Dashboard per reparto (cucina / pasticceria / cocktail)
- [ ] Storico variazione costi ricette
- [ ] Collegamento consumi ↔ magazzino

## 22. Dipendenti — allegati
- [ ] La tabella `dipendenti_allegati` esiste nel DB ma non ha endpoint né pagina frontend
- [ ] Decidere se implementare o rimuovere la tabella

## 25. Sistema permessi centralizzato per ruolo
> Oggi i check ruolo sono sparsi nei router (`if role not in ("admin", "sommelier", "sala")`) e nel frontend (`canDelete`). Serve un sistema unico che permetta di configurare chi può fare cosa, e di escludere ruoli da funzioni specifiche senza toccare N file.

- [ ] Creare `app/core/permissions.py` con matrice permessi (ruolo → azioni consentite)
- [ ] Creare dependency FastAPI `require_role(*roles)` e `require_permission(action)` da usare nei router
- [ ] Definire azioni granulari: `vini.vendita`, `vini.delete_movimento`, `vini.edit_anagrafica`, `vini.strumenti`, `admin.utenti`, etc.
- [ ] Configurazione permessi in file JSON o tabella DB (modificabile da UI admin in futuro)
- [ ] Migrare tutti i check ruolo esistenti al nuovo sistema
- [ ] Frontend: endpoint `GET /auth/permissions` che restituisce le azioni consentite per il ruolo corrente
- [ ] Frontend: hook `usePermissions()` → sostituisce i check `role === "admin"` sparsi nei componenti
- [ ] Prevedere esclusione per ruolo (es. sala può fare vendita ma NON strumenti cantina)
- [ ] Pagina admin per gestire la matrice permessi (fase futura)

---

# 📅 Rilasci

| Versione | Contenuto | Stato |
|---------|-----------|--------|
| **2025.12** | FE XML — import + stats + dashboard | ✅ Completato |
| **2026.01** | Magazzino — movimenti + filtri server-side | ⏸ In sospeso |
| **2026.03** | Fix sicurezza + bug critici (punti 1–8) | 🔄 In corso |
| **2026.04** | Pulizia codice + documentazione (punti 9–15) | Pianificata |
| **2026.05** | FE XML matching ingredienti | Pianificata |
| **2026.06** | Food cost + movimenti cantina | Pianificata |

---

# ✅ Completati (storico)

| # | Task | Data | Commit |
|---|------|------|--------|
| 23 | Dashboard Vini v2.1 — KPI vendite, analytics, drill-down, top venduti | 2026-03-09 | `7143356` |
| 24 | Badge `#id` standardizzato (`bg-slate-700`) su tutte le pagine modulo vini | 2026-03-09 | `7143356` |
| 1 | Auth reale — sha256_crypt hash + python-dotenv + SECRET_KEY da .env | 2026-03-09 | — |
| 3 | `Depends(get_current_user)` su 5 router pubblici | 2026-03-08 | — |
| 13 | `version.json` eliminato | 2026-03-08 | — |
| 14 | `changelog.md` aggiornato a marzo 2026 | 2026-03-09 | — |
| 15 | `sistema-vini.md` eliminato | 2026-03-08 | — |
| 4 | `pyxlsb` aggiunto a `requirements.txt` | 2026-03-08 | `9a34957` |
| 5 | Bug pie chart pagamenti (`pos_bpm`, `pos_sella`) | 2026-03-08 | `0d7987b` |
| 6 | Route `/annual` + pagina `CorrispettiviAnnual.jsx` | 2026-03-08 | `b5d282a` |
| 7 | `apiFetch()` centralizzato — rimossa gestione 401 da 6 pagine | 2026-03-08 | — |
| 8 | Rimosso `console.log` debug da `LoginForm.jsx` | 2026-03-08 | `9a34957` |
| 9 | `slugify` deduplicata — importata da `carta_vini_service` | 2026-03-08 | `b5d282a` |
| 11 | Bug prezzo=0 HTML preview carta vini | 2026-03-08 | `b5d282a` |
| 10 | Endpoint duplicate-check duplicati — rimosso `/duplicate-check` | 2026-03-09 | — |
| 12 | Role check su delete movimento — solo admin/sommelier | 2026-03-09 | — |

---

# 🧭 Note operative

- Aggiornare **Roadmap.md** a ogni milestone (spuntare i task completati, spostarli nella sezione ✅)
- Inserire i completamenti nel **changelog.md**
- Per ogni commit fare riferimento al numero del task (es. `fix: #6 route annual corrispettivi`)
- I tag `⚠️ Confermato aperto` indicano task verificati via ispezione del codice in questa sessione
