# 📄 TRGB Gestionale — CHANGELOG
**Formato:** Keep a Changelog

---

## 2026-03-09 — Gestione utenti, permessi moduli, sicurezza auth (v2026.03.09)

### Security
- `auth_service.py`: sostituito USERS dict con password in chiaro con hash `sha256_crypt` via `passlib.CryptContext`
- `authenticate_user()` usa `security.verify_password()` — nessuna password in chiaro nel codice
- `SECRET_KEY` caricata da `.env` via `python-dotenv` (fallback al valore hardcoded)
- `scripts/gen_passwords.py`: utility CLI per rigenerare hash al cambio password

### Added
- `app/data/users.json`: store persistente utenti (caricato a boot, aggiornato ad ogni modifica)
- `app/routers/users_router.py`: CRUD utenti — `GET/POST /auth/users`, `DELETE /{username}`, `PUT /{username}/password`, `PUT /{username}/role`. Admin: accesso totale; non-admin: solo propria password con verifica
- `app/data/modules.json`: permessi moduli per ruolo (`roles[]` per modulo)
- `app/routers/modules_router.py`: `GET /settings/modules` (tutti autenticati), `PUT /settings/modules` (admin only). Admin sempre incluso, modulo admin non disabilitabile
- `frontend/src/pages/admin/ImpostazioniSistema.jsx`: pagina unica con due tab — **Utenti** (crea/modifica/elimina/cambio password/cambio ruolo) e **Moduli & Permessi** (griglia checkbox ruolo × modulo)
- Logout button cablato in `Header.jsx` — visibile su tutte le pagine post-login
- `Home.jsx` dinamica: mostra solo i moduli accessibili al ruolo dell'utente corrente

### Changed
- `AdminMenu.jsx`: due card separate (Impostazioni + Gestione Utenti) → una sola card **Impostazioni** → `/admin/impostazioni`
- `LoginForm.jsx`: salva `username` in localStorage (necessario per UI "Tu" in gestione utenti)
- `App.jsx`: `Header` montato globalmente con `onLogout`; route `/admin/impostazioni` aggiunta

### Docs
- `roadmap.md`: aggiornato con task #1, #3, #7 chiusi
- `sessione.md`: aggiornato con lavoro della sessione 2026-03-09

---

## 2026-03-08 — Fix sicurezza, bug e refactor frontend (v2026.03.08)

### Security
- `Depends(get_current_user)` aggiunto a livello router su 5 endpoint pubblici: `admin_finance`, `fe_import`, `foodcost_ingredients`, `foodcost_recipes`, `vini_settings`

### Fixed
- Bug pie chart pagamenti in `CorrispettiviDashboard.jsx`: `pag.pos` → `pag.pos_bpm`, `pag.sella` → `pag.pos_sella`
- `carta_vini_service.py`: `if prezzo:` → `if prezzo not in (None, "")` — fix prezzo=0 in preview HTML
- `vini_router.py`: rimossa funzione `slugify` duplicata, importata da `carta_vini_service`
- Rimosso `console.log("API_BASE:", API_BASE)` da `LoginForm.jsx`

### Added
- `pyxlsb` aggiunto a `requirements.txt` (necessario per import Excel .xlsb)
- `frontend/src/config/api.js`: `apiFetch()` — wrapper centralizzato di `fetch` con auto-inject token Authorization e redirect automatico al login su 401
- `frontend/src/pages/admin/CorrispettiviAnnual.jsx`: nuova pagina confronto annuale con grafico e tabella mensile
- Route `/admin/corrispettivi/annual` in `App.jsx`
- Setup git bare repo VPS (`/home/marco/trgb/trgb.git`) con post-receive hook per auto-deploy su `git push`
- `scripts/setup_git_server.sh`: script one-time setup VPS

### Changed
- Gestione 401 rimossa da 6 pagine (ViniCarta, MagazzinoVini, MagazzinoViniDettaglio, MagazzinoViniNuovo, DipendentiAnagrafica, CorrispettiviAnnual) — ora centralizzata in `apiFetch()`

### Docs
- Docs consolidati da 18 a 13 file, tutti in minuscolo
- `database.md`: unificato da `Database_Vini.md` + `Database_FoodCost.md`
- `architettura.md`: merge di `VersionMap.md`
- `deploy.md`: merge di `troubleshooting.md`
- Eliminati: `sistema-vini.md`, `to-do.md`, `version.json`, `Index.md`

---

## 2025-12-05 — Modulo FE XML esteso (v2025.12.05-1)
### Added
- Sezione documentazione completa nel README  
- Descrizione architetturale + routing + frontend  
- Dettaglio endpoints e flusso operativo  

### Updated
- Modulo FE XML porta versione → `v2025.12.05-1`
- Documentazione `/docs/Modulo_FattureXML.md` integrata  

### Notes
- Il modulo è ora ufficialmente considerato "prima release operativa"


# 🗓️ 2025-12-05 — Versione 2025.12.05 (Master Integrato)

## ✨ Aggiunto

### Modulo Fatture Elettroniche (FE XML)
- Nuovo router `fe_import.py`
- Funzioni:
  - parsing XML (FatturaPA)
  - hashing SHA-256 anti-duplicati
  - estrazione fornitori, numeri fattura, date, imponibili, IVA, totale
  - estrazione righe (descrizione, quantità, prezzo, IVA)
- Endpoint:
  - `POST /contabilita/fe/import`  
  - `GET /contabilita/fe/fatture`
  - `GET /contabilita/fe/fatture/{id}`
  - `GET /contabilita/fe/stats/fornitori`
  - `GET /contabilita/fe/stats/mensili`
- Creazione tabelle nel DB:
  - `fe_fatture`  
  - `fe_righe`
- Dashboard acquisti frontend:
  - top fornitori
  - andamento mensile
  - filtro anno dinamico
- UI:
  - pagina `FattureElettroniche.jsx`
  - uploading multiplo
  - gestione duplicati
  - dettaglio righe completo
  - formattazione prezzi, valute e date

---

## 🛠️ Modulo Magazzino Vini — Refactor completo

### Nuove funzionalità frontend
- Filtri dinamici dipendenti (tipologia/nazione/regione/produttore)
- Filtri testuali multi-campo:
  - descrizione
  - denominazione
  - produttore
  - codice
  - regione
  - nazione
- Filtri numerici avanzati:
  - giacenza totale (>, <, tra)
  - checkbox "solo positivi"
  - prezzo carta
- Ordinamenti migliorati
- Prestazioni ottimizzate con `useMemo`

### Backend — Struttura magazzino
- Aggiunto campo `id_excel`
- Reintroduzione struttura coerente di locazioni:
  - frigo
  - loc1
  - loc2
  - loc3 (future use)
- Calcolo automatico `qta_totale`
- Refactor funzioni:
  - `create_vino()`
  - `update_vino()`
- Migliorata coerenza dati dopo aggiornamenti multipli

### Import Excel
- Modalità SAFE introdotta:
  - evita sovrascrittura ID
  - aggiorna solo campi consentiti
  - mantiene allineamento storico
- Modalità FORCE (solo admin) — predisposta

---

## 🧹 Miglioramenti UI/UX

- Nuova sezione **/admin**
- Interfaccia vini backend migliorata
- Stile grafico omogeneo con TRGB design
- Pannelli più leggibili e uniformati

---

## 🗄️ Documentazione (grande aggiornamento)

- Riscritto completamente il README principale
- Creato sistema documentazione modulare:
  - `Modulo_Vini.md`
  - `Modulo_MagazzinoVini.md`
  - `Modulo_FoodCost.md`
  - `Modulo_FattureXML.md`
- Creati file DB dedicati:
  - `DATABASE_Vini.md`
  - `DATABASE_FoodCost.md`
- Creato `INDEX.md`
- Creato `ROADMAP.md`
- Creato `CHANGELOG.md` (esteso)
- Creato `PROMPT_CANVAS.md`

---

## 🔧 Backend & DevOps

- Aggiornata configurazione systemd:
  - `trgb-backend.service`
  - `trgb-frontend.service`
- Migliorato `deploy.sh`:
  - quick deploy
  - full deploy
  - safe deploy
  - rollback
- Aggiornati file `.env` + separazione produzione/sviluppo
- Rifinito reverse proxy Nginx:
  - `trgb.tregobbi.it` (backend)
  - `app.tregobbi.it` (frontend)
- UFW:
  - bloccate porte 8000 e 5173 dall'esterno
  - aggiunta apertura loopback per Vite

---

## 🐞 Bugfix importanti

### Magazzino vini
- Rimossi duplicati storici
- Ripristinati **1186 record reali**
- Eliminati ID corrotti
- Ripuliti import precedenti non coerenti

### Backend generale
- Fix encoding PDF
- Fix salvare prezzi carta vs listino
- Fix ordinamento produttori con apostrofi
- Fix annate stringa/numero

---

# 🗓️ 2025-12-03 — Versione 2025.12.03

## ✨ Aggiunto
- Prima versione documentation system  
- Prima versione modulo Magazzino Vini rifattorizzato

## 🐞 Risolto
- Duplicati magazzino storici  
- QTA negative generate da import errati

---

# 🗓️ 2025-11 — Versioni preliminari

## ✨ Aggiunto
- Carta Vini stabile (HTML/PDF/DOCX)
- Template PDF unificato
- Generatore PDF staff/cliente
- Funzioni base foodcost (ricette + ingredienti)
- Deploy su VPS + servizi systemd

## 🔧 Migliorato
- Vite configurato per VPS
- Backend ottimizzato per caricamenti Excel
- Repository vini riscritto per prestazioni

## 🐞 Risolti
- Problemi CORS
- Loop infinito Vite reload
- Reset porta 8000 al deploy
