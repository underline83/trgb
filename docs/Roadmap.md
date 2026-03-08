# 🛠️ TRGB Gestionale — Roadmap & TO-DO
**Ultimo aggiornamento:** 2026-03-08

Roadmap ufficiale per lo sviluppo progressivo del gestionale.

---

# 🔴 CRITICI — Sicurezza & Bug bloccanti

## 1. Auth reale (sostituire mock)
- [ ] Rimuovere `USERS` dict con password in chiaro da `app/services/auth_service.py`
- [ ] Implementare utenti con password hashate (`sha256_crypt` già presente in `security.py`)
- [ ] Caricare credenziali da `.env` o file di configurazione protetto
- [ ] Verificare che `get_current_user()` funzioni correttamente post-refactor

> ⚠️ **Confermato aperto** — `auth_service.py` riga 21: `USERS = {"admin": {"password": "admin", ...}}`

## 2. HTTPS in produzione
- [ ] Aggiornare `.env.production`: `http://80.211.131.156:8000` → `https://trgb.tregobbi.it`
- [ ] Verificare che Nginx faccia correttamente da reverse proxy per il backend
- [ ] Testare login e chiamate API dopo il cambio

## 3. Endpoint senza autenticazione
Aggiungere `Depends(get_current_user)` a tutti gli endpoint dei seguenti router:
- [ ] `admin_finance.py` — dati finanziari completamente pubblici (nessun `Depends` presente)
- [ ] `fe_import.py` — import fatture e statistiche acquisti
- [ ] `foodcost_ingredients_router.py`
- [ ] `foodcost_recipes_router.py`
- [ ] `vini_settings_router.py` — incluso il `POST /settings/vini/reset`

> ⚠️ **Confermato aperto** — nessuno dei router sopra ha `get_current_user` nei decorator

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
- [ ] Aggiungere la route in `App.jsx` (il pulsante esiste ma la route no)
- [ ] Creare o collegare il componente pagina annual compare

> ⚠️ **Confermato aperto** — `App.jsx` ha solo `/corrispettivi`, `/import`, `/gestione`, `/dashboard`; manca `/annual`

## 7. Gestione token scaduto nel frontend
- [ ] Aggiungere interceptor Axios centralizzato (attualmente ogni pagina gestisce 401 in modo indipendente)
- [ ] Redirect automatico al login + pulizia `localStorage`
- [ ] Messaggio utente "Sessione scaduta, effettua di nuovo il login"

> ⚠️ **Confermato parzialmente aperto** — gestione 401 scattered in singole pagine (MagazzinoViniNuovo, ViniCarta, ecc.) ma nessun interceptor globale

## 8. `console.log` di debug in produzione
- [x] Rimosso `console.log("API_BASE:", API_BASE)` da `LoginForm.jsx` — commit `9a34957` — 2026-03-08

---

# 🟠 PULIZIA CODICE

## 9. `slugify` duplicata
- [ ] Rimuovere la copia da `vini_router.py`
- [ ] Importare da `carta_vini_service.py` (o estrarre in `app/utils/`)

## 10. Endpoint duplicate-check duplicati (magazzino)
- [ ] Valutare quale logica tenere tra `/check-duplicati` e `/duplicate-check`
- [ ] Rimuovere il duplicato, aggiornare eventuali chiamate frontend

## 11. Bug prezzo=0 nella preview HTML carta vini
- [ ] `carta_vini_service.py`: allineare la condizione `if prezzo:` a `if prezzo not in (None, "")` come nel ramo PDF
- [ ] Verificare che vini a prezzo zero appaiano coerentemente in HTML e PDF

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
| 4 | `pyxlsb` aggiunto a `requirements.txt` | 2026-03-08 | `9a34957` |
| 5 | Bug pie chart pagamenti (`pos_bpm`, `pos_sella`) | 2026-03-08 | `0d7987b` |
| 8 | Rimosso `console.log` debug da `LoginForm.jsx` | 2026-03-08 | `9a34957` |

---

# 🧭 Note operative

- Aggiornare **Roadmap.md** a ogni milestone (spuntare i task completati, spostarli nella sezione ✅)
- Inserire i completamenti nel **changelog.md**
- Per ogni commit fare riferimento al numero del task (es. `fix: #6 route annual corrispettivi`)
- I tag `⚠️ Confermato aperto` indicano task verificati via ispezione del codice in questa sessione
