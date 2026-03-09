# 📄 TRGB Gestionale — CHANGELOG
**Formato:** Keep a Changelog

---

## 2026-03-09 — Hub Vendite & Scarichi + Locazione obbligatoria (v2026.03.09d)

### Added
- `ViniVendite.jsx` (v1.0): riscritta da placeholder a hub operativo completo:
  - **Registrazione rapida**: ricerca vino con autocomplete, selezione tipo (VENDITA/SCARICO/CARICO/RETTIFICA), **locazione obbligatoria** per vendita/scarico, quantità, note, registrazione in un click
  - **Storico movimenti globale**: tabella paginata di tutti i movimenti della cantina con filtri per tipo, testo, range date
  - **KPI rapidi**: vendite oggi, 7gg, 30gg, bottiglie totali in cantina
  - Click su vino nello storico → navigazione a scheda dettaglio
  - Badge `#id` e stile coerente con il resto del modulo
- `vini_magazzino_db.py`: nuove funzioni:
  - `list_movimenti_globali()`: query cross-vino con filtri tipo/testo/date e paginazione (LIMIT/OFFSET + COUNT)
  - `search_vini_autocomplete()`: ricerca rapida per form registrazione (id, descrizione, produttore, QTA, prezzi)
- `vini_magazzino_router.py`: nuovi endpoint:
  - `GET /vini/magazzino/movimenti-globali` — movimenti globali con filtri e paginazione
  - `GET /vini/magazzino/autocomplete?q=...` — autocomplete vini per registrazione rapida
  - Entrambi dichiarati prima di `/{vino_id}` per evitare conflitti path FastAPI
- `MagazzinoSubMenu.jsx`: aggiunto link "🛒 Vendite & Scarichi" → `/vini/vendite`

### Changed
- **`registra_movimento()` — locazione reale**: ora aggiorna anche la colonna `QTA_<LOC>` corrispondente. Per VENDITA e SCARICO la locazione è **obbligatoria** (validazione backend + frontend)
- **`MovimentiCantina.jsx`**: campo locazione da testo libero a dropdown (frigo/loc1/loc2/loc3), obbligatorio per VENDITA/SCARICO, disabilitato per RETTIFICA
- **`MagazzinoViniDettaglio.jsx`**: stessa modifica al form movimenti nella scheda dettaglio

---

## 2026-03-09 — Dashboard Vini operativa, analytics vendite, UX miglioramenti (v2026.03.09c)

### Added
- `DashboardVini.jsx` (v2.0 → v2.1): riscritta completamente da placeholder a dashboard operativa:
  - **Riga KPI Stock** (4 tile): bottiglie in cantina, vini in carta, senza prezzo listino, vini fermi 30gg
  - **Riga KPI Vendite** (2 tile): bottiglie vendute ultimi 7gg / 30gg
  - **Drill-down interattivo**: click su tile "senza listino" → tabella inline con tutti i vini da completare; click su tile "vini fermi" → lista con giacenza e data ultimo movimento; click di nuovo chiude il pannello
  - **Vendite recenti** (viola): ultimi 8 movimenti di tipo VENDITA, con vino e data
  - **Movimenti operativi** (neutro): ultimi 6 tra CARICO / SCARICO / RETTIFICA con badge tipo colorato
  - **Top venduti 30gg**: ranking a barre dei vini più venduti nell'ultimo mese, a larghezza piena
  - **Distribuzione tipologie**: barre proporzionali per tipologia con contatore referenze
  - **Accesso rapido**: link a Magazzino, Nuovo vino, Carta vini, Impostazioni
  - Badge `#id` in stile `bg-slate-700` su alert e drill-down
- `vini_magazzino_db.py`: aggiunte query per `get_dashboard_stats()`:
  - `kpi_vendite`: vendute_7gg, vendute_30gg (WHERE tipo='VENDITA')
  - `vendite_recenti`: ultimi 8 movimenti VENDITA con join su descrizione vino
  - `movimenti_operativi`: ultimi 6 CARICO/SCARICO/RETTIFICA
  - `top_venduti_30gg`: top 8 per SUM(qta) su VENDITA ultimi 30gg
  - `vini_fermi`: vini con QTA_TOTALE > 0 e nessun movimento negli ultimi 30 giorni (LEFT JOIN + HAVING)
- `vini_magazzino_router.py`: aggiunto endpoint `GET /dashboard` (dichiarato prima di `/{vino_id}` per evitare conflitti di routing FastAPI)
- Dashboard raggiungibile da: NavLink `MagazzinoSubMenu.jsx`, card `ViniMenu.jsx`, route `/vini/dashboard` in `App.jsx`

### Changed
- `MagazzinoVini.jsx`: pannello destro semplificato — rimosso bottone "📦 Movimenti" separato; rinominato unico bottone in "🍷 Apri scheda completa" (movimenti ora integrati nella scheda dettaglio)
- Badge `#id` standardizzato a `bg-slate-700 text-white` su tutte le pagine (era `bg-amber-900` — conflitto visivo con i bottoni ambra)

### Fixed
- `vini_magazzino_router.py`: rimossi 12 caratteri smart quote (U+201C/U+201D) nelle stringhe — causavano `SyntaxError: invalid character` al boot del backend
- `scripts/deploy.sh`: corretto mode bit git a `100755` (era `100644`) — risolto `Permission denied` ad ogni deploy
- `push.sh`: riscritto per usare comandi SSH diretti invece di `./scripts/deploy.sh` — più robusto e non dipende dal mode bit
- Sudoers configurato sul VPS per `systemctl restart` senza password — deploy non-interattivo da SSH

### Docs
- `modulo_magazzino_vini.md`: aggiornato con sezioni Movimenti, Dashboard, Scheda dettaglio v3.0
- `Roadmap.md`: aggiunti task #23 (dashboard vini), #24 (badge ID); marcati come chiusi

---

## 2026-03-09 — Magazzino vini: edit, note, movimenti, role check (v2026.03.09b)

### Security
- `vini_magazzino_router.py`: aggiunto role check su `DELETE /movimenti/{id}` — solo admin o sommelier possono eliminare movimenti (#12 chiuso)
- Rimosso endpoint `/vini/magazzino/duplicate-check` ridondante (#10 chiuso) — mantenuto solo `POST /check-duplicati` (più pulito, usa `find_potential_duplicates` DB-side)

### Added
- `vini_magazzino_db.py`: aggiunta funzione `delete_nota(nota_id)` per eliminare note operative
- `vini_magazzino_router.py`: aggiunto `DELETE /{vino_id}/note/{nota_id}` — elimina nota e ritorna lista aggiornata
- `MagazzinoViniDettaglio.jsx` (v2.0): riscritta con tre sezioni:
  - **Anagrafica** — view + edit mode inline (PATCH `/vini/magazzino/{id}`) con tutti i campi
  - **Giacenze per locazione** — view + edit separato; salvataggio registra automaticamente RETTIFICA nello storico movimenti se QTA_TOTALE cambia
  - **Note operative** — add + delete note (usa `GET/POST/DELETE /note`)
- `MovimentiCantina.jsx` (v2.0): migrato da `fetch` grezzo ad `apiFetch` (redirect 401 automatico); aggiunto bottone elimina movimento (visibile solo ad admin/sommelier)

### Changed
- `MagazzinoVini.jsx`: rimosso bottone logout locale (gestito globalmente da `Header.jsx`)
- `MagazzinoViniDettaglio.jsx`: rimosso bottone logout locale

### Docs
- `roadmap.md`: aggiornati task #10, #12 come chiusi; aggiornate feature #17 (Magazzino Vini)

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
