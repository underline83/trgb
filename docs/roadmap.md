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
- [ ] Valutare quale logica tenere tra `/check-duplicati` e `/duplicate-check`
- [ ] Rimuovere il duplicato, aggiornare eventuali chiamate frontend

## 11. Bug prezzo=0 nella preview HTML carta vini
- [x] `carta_vini_service.py`: allineato `if prezzo:` → `if prezzo not in (None, "")` — commit `b5d282a` — 2026-03-08

## 12. FORCE import senza check ruolo
- [ ] In `vini_magazzino_router.py`: aggiungere controllo `if current_user.role != "admin": raise HTTPException(403)`
- [ ] Allineare comportamento con quanto documentato in `Modulo_MagazzinoVini.md`

> ⚠️ **Confermato aperto** — riga 403: `# per ora nessun controllo di ruolo`

---

# 🔵 DOCUMENTAZIONE

## 13. `version.json` non valido
- [ ] Il file contiene due oggetti JSON concatenati senza array wrapper — correggere o eliminare
- [ ] Decidere se mantenere il versionamento in JSON o solo in `VersionMap.md`

## 14. Changelog fermo a dicembre 2025
- [ ] Aggiornare `changelog.md` con le modifiche di gennaio–marzo 2026
- [ ] Aggiornare `VersionMap.md` (fermo a `2025.12.05`)

## 15. `sistema-vini.md` duplicato
- [ ] Eliminare `sistema-vini.md` (contenuto già coperto da `Modulo_Vini.md`)
- [ ] Aggiornare `Index.md` se necessario

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
- [ ] Pagina Movimenti Cantina (carichi/scarichi con storico)
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
- [ ] Ordinamento drag&drop tipologie
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
| 1 | Auth reale — sha256_crypt hash + python-dotenv + SECRET_KEY da .env | 2026-03-09 | — |
| 3 | `Depends(get_current_user)` su 5 router pubblici | 2026-03-08 | — |
| 4 | `pyxlsb` aggiunto a `requirements.txt` | 2026-03-08 | `9a34957` |
| 5 | Bug pie chart pagamenti (`pos_bpm`, `pos_sella`) | 2026-03-08 | `0d7987b` |
| 6 | Route `/annual` + pagina `CorrispettiviAnnual.jsx` | 2026-03-08 | `b5d282a` |
| 7 | `apiFetch()` centralizzato — rimossa gestione 401 da 6 pagine | 2026-03-08 | — |
| 8 | Rimosso `console.log` debug da `LoginForm.jsx` | 2026-03-08 | `9a34957` |
| 9 | `slugify` deduplicata — importata da `carta_vini_service` | 2026-03-08 | `b5d282a` |
| 11 | Bug prezzo=0 HTML preview carta vini | 2026-03-08 | `b5d282a` |

---

# 🧭 Note operative

- Aggiornare **Roadmap.md** a ogni milestone (spuntare i task completati, spostarli nella sezione ✅)
- Inserire i completamenti nel **changelog.md**
- Per ogni commit fare riferimento al numero del task (es. `fix: #6 route annual corrispettivi`)
- I tag `⚠️ Confermato aperto` indicano task verificati via ispezione del codice in questa sessione
