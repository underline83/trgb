# TRGB — Briefing sessione

**Ultimo aggiornamento:** 2026-10-10 — **DA PUSHARE: campo accisa nel calcolo prezzo (mig 184, sistema 5.48, vini 3.95)** — mig 184, `bevande_prezzi_service.py` 1.1, `bevande_router.py` 1.5, `bevande_db.py` 1.5, `CalcoloPrezzoBox.jsx` 1.1, `CartaSezioneEditor.jsx` 1.5. **Dopo il push:** riaprire le due grappe Marolo e separare l'accisa (12 anni 40,86 + 3,67 · 9 anni 37,49 + 3,68); impostare il costo tonica del G&T in «🧮 Parametri prezzo».

> **Regola dell'intestazione** (da `CLAUDE.md`): qui stanno SOLO (1) cosa è da pushare adesso, (2) cosa va fatto/verificato dopo l'ultimo push, (3) le pendenze aperte che contano. Quando una voce è pushata o chiusa si TOGLIE da qui (resta nel corpo della sessione). Massimo ~15 righe.

**Sistema:** 5.48 · **Migrazione più recente:** 184

**Da verificare dopo gli ultimi push**
- Menu Autunno: /carta/menu (anche ?lang=en/de), allergeni dei 9 piatti nuovi, approvare le traduzioni nuove (tab Traduzioni).
- Home cucina: `POST /settings/home-actions/reset/` per chef, sous_chef, commis (se non già fatto).
- Cucina iPhone: salvataggio temperature dal gate e spunta nel tab Oggi (fix `tasks_db.py` 1.4).
- iPhone: menu moduli e `<ModuleNav>` su Vini, Dipendenti, Clienti, Statistiche.

**Aperto**
- Linea Primi / Linea Secondi: proposta inviata a Marco, attendo quantità. Vecchi template «MEP Carta · … · estate-2026» ancora attivi: chiedere se disattivarli.
- Formaggi/salumi in checklist collegati alle Selezioni: idea di Marco, design proposto, 2 domande aperte (disattivare in Selezioni su «finito»? alternative anche per i salumi?).
- Abaco 5155: rate 7–10 + piano 5155 r1 pagate con carta il 02/10 → collegare con l'estratto carta di ottobre.
- Pregis: mastrino chiesto il 02/10 (85 fatture aperte 2024-25, 17.321 €). Risto Team: mastrino da chiedere (RiBa 30/04 1.266,56 non collegata) + uscita doppia 896/V marzo 2026 da eliminare a mano.
- Fatture mancanti: Amazon 20,48 (marzo ×2), Il Post mar–ago 2026, Aruba settembre.
- Formaggi: collegare gli ingredienti all'arrivo della fattura Real Group.
- `ModuleNav`: lista voce per voce `mobile: false` da decidere con Marco.
- Uscite rimaste dopo mig 179: 73 PAGATO_MANUALE + BLC/FZ/Lara in VERIFICARE.


### 2026-10-03 (cont.) — fix Lavagna dopo push 4abd6897
- `lavagna_service._staff_in_turno`: reparto da `turni_tipi.ruolo` → `reparti.codice` (fallback reparto del dipendente), servizio da `turni_tipi.servizio` (fallback SOGLIA_TURNO), esclusi tipi non LAVORO.
- `_lede`: stringa vuota se pax=0; `Lavagna.jsx` e `_testo_whatsapp` non mostrano la riga vuota.
- `cucina_scorte_service.trasferisci`: se l'origine va a 0 e non ha lotti residui, la riga giacenza d'origine si cancella e la destinazione eredita in_dotazione. Testato su copia del DB (andata/ritorno/parziale).
- Regime CONTA contato a 0 → `togli_finito` (RETTIFICA ref_modulo='finito', riga giacenza cancellata); registro `GET /cucina/scorte/finiti/` (admin/chef/sous_chef); annulla ricrea la riga. Testato su copia DB. Registro = tab «Registro» in DentroFrigo (CucinaMobile, `RegistroFiniti`, ruoli superadmin/admin/chef/sous_chef, filtro ubicazione_id, «Rimetti» = DELETE movimento). UI conta (S3) non esiste ancora.
- `riallinea_semaforo` (MOVIMENTI): righe a 0 senza lotti tolte se il totale > 0; `annulla_movimento` fa sempre assicura_giacenza. Testato su copia DB.
- `set_semaforo`: regime CONTA + FINITO → togli_finito + spesa (`uscito: True`); undo entro 2 min annulla l'uscita. Testato su copia DB.
- Da pushare.

## SESSIONE 2026-10-10 (2) — Carta Bevande: campo accisa `[core]`

Marco (dopo il push di b7596aa8 e due grappe inserite, bolla Marolo con l'accisa su riga a parte): «mettimi il campo accisa, così non sto a sommare a mano, me la danno sempre staccata».

- Mig 184: `bevande_voci.accisa_bottiglia REAL` (solo ADD COLUMN). Seed `bevande_db.py` 1.5.
- `bevande_prezzi_service` 1.1: costo = costo_bottiglia + accisa; `calcolo` espone `accisa` e `costo_bottiglia_totale`; l'accisa è tolta ai ruoli fuori da `RUOLI_COSTI` come il costo.
- Router 1.5 (campo su create/update/anteprima), `CalcoloPrezzoBox` 1.1 (campo «Accisa €»), `CartaSezioneEditor` 1.5 (normalizza e duplica il campo).
- Prove su copia del DB: migrazioni 183+184 (184 due volte), somma (40,86 + 3,67 → 44,53, 2,54 a dose), chef non vede accisa né costo, anteprima sala; JSX esbuild ok.

Commit: `./push.sh "[core] Carta Bevande: campo accisa nel calcolo prezzo, sommato al costo bottiglia (mig 184, vini 3.95, sistema 5.48)"`

---

## SESSIONE 2026-10-10 — Carta Bevande: calcolo prezzo distillati `[core]`

Marco: «sezione carta, distillati, mettimi la possibilità di inserire il prezzo della bottiglia, così riusciamo a calcolare meglio il prezzo». Decisioni: formula a incidenza obiettivo (proposta Claude), costo IVA esclusa, costi visibili anche alla sala, modifica da sommelier in su.

- **DB (mig 183, solo ADD COLUMN):** `bevande_voci.costo_bottiglia/bottiglia_cl/dose_cl`, `bevande_sezioni.calcolo_prezzo` (JSON). Distillati attivati con 25% / IVA 22 / 0,50 / 70 cl / 4 cl, G&T sul Gin 5 cl + costo extra 0 (da impostare). Seed `bevande_db.py` v1.4 allineato.
- **Service:** `app/services/bevande_prezzi_service.py` — parametri, validazione, `calcola`, `arricchisci_voci` (toglie costo e calcolo ai ruoli fuori da `RUOLI_COSTI` = admin/sommelier/sala, via M.G `ha_ruoli`).
- **Router `bevande_router` v1.4:** campi nuovi su create/update, `calcolo` nelle letture, `PUT /bevande/sezioni/{key}/calcolo-prezzo` (admin/sommelier), `POST /bevande/calcolo-prezzo/anteprima` (RUOLI_COSTI).
- **FE:** riquadro «🧮 Calcolo prezzo» nel form voce (anteprima dal backend con debounce, «Usa questo prezzo»), colonna «Costo dose», filtro «Sopra obiettivo», modale «🧮 Parametri prezzo».
- **Prove:** su copia del DB (migrazione due volte, calcolo, miscelato, permessi admin/sommelier/superadmin/sala/chef/contabile, validazione parametri); sintassi JSX con esbuild. UI non provata nel browser.
- **Nota:** `docs/roadmap.md` era già modificato da un'altra sessione (sezione ML — Posta nel connettore MCP), non toccato da questa.

Commit: `./push.sh "[core] Carta Bevande: calcolo prezzo distillati dal costo bottiglia (mig 183, vini 3.94, sistema 5.47)"`

---

## SESSIONE 2026-10-08 (2) — Connettore MCP di claude.ai, mattone M.K `[core]`

Marco: «partirei dal 4.. creiamo il connettore, testiamo il passaggio da te a pratiche». Documento `docs/connettore_mcp.md` scritto sul modello del connettore del brain (`~/brain/app/connettore.py`, `oauth.py`), poi decisioni: `[core]` platform M.K (sistema 5.46), autorizzano solo admin/superadmin, autore dei passi `claude (<utente>)`, conferma prima di creare/chiudere e passo semplice senza chiedere.

- **Codice:** `app/connettore/server.py` (4 strumenti sopra `pratiche_service`, istruzioni, `Smista`, `sicurezza`), `app/connettore/oauth.py` (fornitore OAuth adattato dal brain: utente+PIN con `auth_service.authenticate_user`, utente riletto a ogni chiamata), `app/models/connettore_db.py` (`connettore.sqlite3`), `scripts/connettore.py` (elenca/revoca), `main.py` (`lifespan=_vita`, connettore costruito in fondo, mai bloccante), `requirements.txt` (`mcp==2.3.0`), manifesto platform.
- **Pratiche 1.1:** «Per chiudere serve l'esito» invece di «Esito (obbligatorio per chiudere) obbligatorio».
- **Prove** (pacchetti `mcp` copiati dalla venv del brain nel scratchpad, niente rete, locale temporaneo): OAuth completo (19 controlli, compresi riuso del codice e del rinnovo e utente declassato), strumenti (8 controlli), avvio di `main.py` su copia dei DB con e senza `mcp`; prove di service e router di Pratiche ancora verdi. Non provato il giro da claude.ai vero.
- **Nota:** la venv locale non ha `email_validator` (già prima): per far partire `main.py` in locale serve un finto pacchetto, solo per le prove.
- **Push dal worktree:** questa volta prima `git merge --ff-only main` nel worktree, poi a fine lavoro `merge --ff-only` su `main` e `push.sh` dalla cartella principale.

Commit: `./push.sh "[core] Connettore MCP di claude.ai: /mcp con OAuth utente+PIN, strumenti pratiche (mattone M.K, sistema 5.46)"`

---

## SESSIONE 2026-10-08 — Modulo Pratiche `[core]`

Marco: implementare il modulo `pratiche` seguendo `docs/modulo_pratiche.md` (modello deciso il 2026-10-08). Punti aperti del §7 confermati: «vai coi default» (termine solo da passo, preavviso 3 giorni, riapertura possibile, un allegato per passo max 20 MB PDF/immagini).

- **Backend:** `app/models/pratiche_db.py` (`pratiche.sqlite3`, schema al boot), `app/services/pratiche_service.py` (tutta la logica, senza Request: `crea_pratica`, `aggiungi_passo`, `chiudi`, `riapri`, `sposta_termine`, `collega`, `scollega`, `elenco`, `leggi`, più `aggiorna_testata`, `percorso_allegato`, `contatori`, `termini_da_avvisare`), `app/routers/pratiche_router.py` (prefix `/pratiche`, `solo_admin` su tutto il router, manifesto in testa), montato in `main.py` con `_mount`.
- **Avviso:** checker `pratiche_termini` in `alert_engine.py`; riga `alert_config` (3 giorni, 24 ore) creata da `init_notifiche_db` con INSERT OR IGNORE; etichetta in `alerts_router.CHECKER_LABELS` e in `NotificheImpostazioni.jsx`.
- **Home:** `dashboard_router._pratiche_summary` aggiunto a `moduli[]` solo per admin.
- **Permessi FE:** `pratiche` in `DEFAULT_MODULES` e nel seed `app/data/modules.json`; `modules_router._aggiungi_moduli_nuovi` lo aggiunge al runtime del VPS se manca (il seed sul VPS non è in git). Route con `roles={["admin"]}`.
- **Frontend:** `pages/pratiche/PraticheElenco.jsx`, `PraticaScheda.jsx`, `praticheUtils.js`; voce 📂 in `modulesMenu.js`; fallback card in `Home.jsx`.
- **Versioni:** `VERSION` e `sistema.version` 5.45, voce `pratiche` 1.0. Manifesto `core/moduli/pratiche/module.json`. Docs: Capability C-P-001…012 in `modulo_pratiche.md`, `index.md`, `roadmap.md` (sezione PRT), `changelog.md`, `CLAUDE.md` (14 moduli), `refactor_monorepo.md` (tabella R8).
- **Prove:** service su DB temporaneo (31 casi: scaduta/ferma calcolate, tre gruppi del checker, errori, chiusura/riapertura, backfill, collegamenti); router con TestClient (multipart, download, 400/404, 403 per contabile/viewer/sala, superadmin ok); checker in dry-run; build Vite ok. UI non provata nel browser.
- **Nessun dato inserito:** le 6 pratiche aperte le mette Marco dalla UI.

Commit: `d5db69d6` — in produzione il 2026-10-08 22:15. NB: il primo `push.sh` lanciato dal worktree aveva committato sul ramo del worktree e non su `main` («Già aggiornato»); risolto con `merge --ff-only` su `main` e nuovo push dalla cartella principale.

---

## SESSIONE 2026-10-06 (2) — Scarico da fotocamera in Vendite `[core]`

Marco: «aggiungi la possibilità di usare la fotocamera per scaricare nella sezione vendite». Bottone «📷 Scansiona QR» nel box Registra vendita: legge l'etichetta (`…/vini/cantina-mobile/{id}` o solo il numero), carica il vino con `GET /vini/magazzino/{id}`, lo seleziona e preimposta la locazione se è unica. Non registra da solo: la conferma resta su «Registra» (scelta celle Matrice e calici invariati). Scanner riusabile `components/QrScanner.jsx` + jsQR 1.4.0 (Apache-2.0) in `utils/vendor/`, perché Safari non ha BarcodeDetector. Prova end-to-end in Chromium con fotocamera finta che inquadra un'etichetta: lettura ok via jsQR.

Commit: `./push.sh "[core] Vini: Vendite, scansione QR etichetta con la fotocamera (vini 3.93)"`

---

## SESSIONE 2026-10-06 — Etichette QR per le bottiglie `[core]`

Marco ha collegato la Brother QL-820NWB (rotoli in prova: DK-11209 29×62 e DK-22205 62 continuo) e vuole partire dal QR per le bottiglie. Il QR punta alla scheda mobile esistente (`/vini/cantina-mobile/{id}`), così la scansione porta dritta a vendita/carico/conta: è la prima parte di V.13. Pagina `/vini/etichette`, stampa da browser con `@page` alla misura dell'etichetta (provata in Chromium: PDF 62×29 e 62×40 mm, una etichetta per pagina). QR in locale con qrcode-generator 1.4.4 copiato in `frontend/src/utils/vendor/` (niente npm install, niente api.qrserver.com). Da fare dopo: conta a tappeto da scansione; eventuali altre etichette (preparazioni cucina) quando Marco le chiede.

Commit: `./push.sh "[core] Vini: etichette QR bottiglie per Brother QL-820NWB (vini 3.92)"`

---

## SESSIONE 2026-10-03 — Home della cucina `[core]`

Marco: «lavoriamo sulla sezione cucina per cuochi e aiutocuochi.. quando entrano vedono la bacheca va bene, non devono vedere il fatturato del giorno prima né i coperti né le prenotazioni.. facciamo un widget con i turni del dipendente, la lavagna e sotto i tasti che useranno».

- **`frontend/src/pages/HomeCucina.jsx`** (nuovo; il nome `DashboardCucina` è già preso da `/cucina/dashboard`): card «I miei turni» (oggi + 6 giorni da `GET /turni/miei-turni`, 2 settimane ISO; 404 = utente non collegato a un dipendente → messaggio), `Lavagna` sola lettura, griglia tasti da `useHomeActions(role)`.
- **`Home.jsx` v9.4**: chef/sous_chef/commis → `<HomeCucina/>` sempre (niente `?full=1`, a differenza della sala).
- **`dashboard_router.py`**: `GET /dashboard/home` legge l'utente; per `RUOLI_CUCINA` prenotazioni/incasso/coperti/fatture tornano vuoti.
- **Tasti default**: `CUCINA_ACTIONS_DEFAULTS` (Cucina iPhone, Frigo e congelatori, Lista spesa, Ricette, I miei turni) per sous_chef/commis, `CHEF_ACTIONS_DEFAULTS` + Selezioni del giorno (solo lo chef ha il modulo). Specchio in `homeActionsFallback.js`.
- **Lasciato com'è, apposta:** la Lavagna mostra i coperti del turno e i tavoli con allergie — Marco ha detto «la bacheca va bene» e in cucina servono.
- Babel ok su HomeCucina/Home/fallback; ast ok sui due .py.
- **Tasti Home cucina rivisti** (Marco: «per cuochi e aiutocuochi metti i pulsanti: cucina (iphone), lista spesa, ricette, menu carta, selezioni»). Dati già applicati via API il 03/10 per chef/sous_chef/commis (DELETE + POST `/settings/home-actions/`). Codice allineato: `CUCINA_ACTIONS_DEFAULTS` unica per i 3 ruoli (tolto `CHEF_ACTIONS_DEFAULTS`), fallback FE specchio. **Selezioni a sous_chef/commis**: router-level `richiede_ruoli` dei 4 `scelta_*_router.py` + `modules_router.DEFAULT_MODULES` + seed `app/data/modules.json`; runtime modules già aggiornato via `PUT /settings/modules/` (03/10). Scrittura selezioni resta admin/chef. Finché non si pusha, il tasto Selezioni per sous/commis apre la pagina ma il backend risponde 403.
- **«Cucina iPhone» → «Gestione Frigoriferi e scorte»** (Marco: «oggi lo separiamo e anche spesa»). `CucinaMobile.jsx` v1.6: `TABS` = frigo, scorte; `PAGINE_A_SE` = oggi, spesa (stesse route, senza `Modi`/`TabBar`, classe `a-se`); route senza tab → frigo. `modulesMenu.js` e `RicetteNav.jsx`: «Oggi» + «Frigoriferi e scorte». Tasti Home cucina via API (03/10): Oggi, Gestione Frigoriferi e scorte, Lista spesa, Ricette, Menu Carta, Selezioni; defaults BE/FE allineati. cucinaScorte 1.8.
- **Commis senza Selezioni / Menu Pranzo / Menu Carta** (Marco: «mettigli solo due link alla visualizzazione dei menu»). Backend: `scelta_*_router` senza commis; `menu_carta_router` router-level senza commis (public_router `/menu-carta/public/today` intatto); `pranzo_router` resta leggibile ai commis ma scritture/pubblica/margine/settings con `GESTIONE_PRANZO` (admin, chef, sous_chef). Seed `modules.json` + `DEFAULT_MODULES` + runtime (PUT 03/10): selezioni e `ricette/pranzo` senza commis. Frontend: `ProtectedRoute` accetta `roles` (usato su `/menu-carta*`), `modulesMenu` voci con `roles` (Header le filtra), `RicetteNav` «Menu» solo admin/chef/sous_chef, nuova pagina **`/pranzo/vista`** (`PranzoVista.jsx`, sola lettura da `/pranzo/menu/oggi/`), HomeCucina apre `/carta/*` con caricamento pieno. Tasti commis via API: Oggi, Frigoriferi e scorte, Lista spesa, Ricette, Menu del pranzo, Menu alla carta (`COMMIS_ACTIONS_DEFAULTS` + fallback).
- **Dati demo tolti** (Marco: «togli tutti i dati demo») via API il 03/10: 18 articoli [DEMO] disattivati, «[DEMO] Dispensa secco» disattivata, 4 righe spesa [DEMO] cancellate. Sono soft-delete (attivo=0); per sparire anche dal DB: `python3 scripts/seed_cucina_demo.py --rimuovi` sul VPS.
- **Lista spesa scrivibile** (Marco: «aggiungi in spesa la possibilità di scrivere»): `CucinaMobile.jsx` v1.7, form in testa a TabSpesa → `POST /lista-spesa/items/` (titolo, quantità libera, urgente).
- **Lista personale «cose da fare»** (Marco: «una lista di cose da fare personale … io come superadmin una board, loro vedono solo la propria, widget in Home per ciascun dipendente»; poi «non sono veri task, puoi usare lo schema» e «possono metterle come vogliono, una nota organizzata personale»). Tabella `todo_personali` in tasks.sqlite3 (init `tasks_db.py`, nessuna migrazione: tabella nuova), **separata da `task_singolo`**. `app/routers/todo_router.py` (montato in main.py, classificato in `core/moduli/task_manager/module.json`): `GET/POST /todo/`, `PATCH/DELETE /todo/{id}`, `POST /todo/riordina/`, proprietà = username del token (404 su righe altrui); `GET /todo/board/` con `solo_superadmin`. Fatte visibili 7 gg (costante `GIORNI_FATTE_VISIBILI` nel router: è una regola di vista, non operativa). Frontend: `components/widgets/TodoPersonale.jsx` (aggiungi in cima, spunta, ×, tocco = modifica testo, ▲▼ = riordina) in HomeCucina, DashboardSala, Home; `pages/TodoBoard.jsx` su `/todo/board` (solo superadmin). Provato SQL d'ordine su copia del DB.
- **Lavagna** (Marco: «togli la notifica Prenotazioni e Fatture da registrare, mostra le selezioni complete senza tagliarle»): `lavagna_service._eventi` senza il blocco «prenotazioni entrate oggi» (disdette restano); `_selezioni_flat` senza `[:2]`; `GET /dashboard/lavagna` filtra gli alert `tipo == "fatture"`. Vale per tutti i ruoli. Verificato `_selezioni_flat` e `build_lavagna` in locale.
- **Logout irraggiungibile su iPhone** (Marco): `Header.jsx` v6.1 — griglia `auto | minmax(0,1fr) | auto` (prima `1fr` cresceva col titolo e spingeva fuori la colonna destra), titolo modulo `truncate`, colonna destra `flex-shrink-0`; voce «Esci (logout)» in fondo al dropdown moduli (nascosta durante la ricerca).

## SESSIONE 2026-10-02 — Docs e versioni rimessi in pari `[core]`

Marco: «ci stiamo dimenticando della regola di aggiornare i documenti leggimi, versioni etc.. mi sembra tutto fermo». Controllo su git: changelog, sessione, versioni dei moduli e `modulo_*.md` toccati venivano aggiornati; fermi davvero erano `VERSION` (5.41 dal 01/09, mig 170→179 passate senza bump), `roadmap.md` (19/05), `readme.md` §13 (tabella versioni ricopiata, Vini 3.8 / Sistema 5.3) e l'intestazione di questo file (decine di «DA PUSHARE» già in produzione).

**Fatto (solo docs + numero di versione):**
- `VERSION` e `sistema.version` → 5.42, con commento di cosa è entrato.
- `roadmap.md`: voci chiuse/aggiunte giugno–ottobre in M, V, K, B, G, D, C, MC; B-DEBT1 e C-DEBT1 chiusi; M.J doppio → Housekeeping rinominato **HK**.
- `readme.md`: §13 diventa un rimando a `VERSION`/`versions.jsx`, §1 Ubuntu 24.04, §9 con Scorte cucina, Ordini vini, Intermittenti, Gift Card, multilingua.
- `modulo_cucina.md`: rimando a `modulo_scorte_cucina.md`.
- Intestazione di questo file riscritta; la vecchia è conservata in `archive/sessione_archivio_2026-06.md`. Sessioni e rilasci fino al 2026-06-30 archiviati (`archive/sessione_archivio_2026-06.md`, `archive/changelog_archivio_2026-06.md`), link in `## Storico` e `index.md`.
- `index.md`: aggiunta `pec_archivio_spec.md` (unico warning del lint, ora a zero).
- `CLAUDE.md`: regola del bump di sistema (migrazione/mattone/modulo nuovo = minor), roadmap da aggiornare a ogni voce chiusa, intestazione di sessione da ripulire a inizio sessione, archiviazione log.

In parallelo un'altra sessione lavorava alle note di credito FIC (fatture 3.2): i suoi file non sono stati toccati, le sue righe in testa a changelog/sessione/versions sono state preservate.

## SESSIONE 2026-10-02 (notte) — Fatture mancanti da FIC e note di credito `[core]`

**Fatture mancanti:** non era un bug di TRGB. 71 documenti erano fermi in FIC «Da registrare» (il sync legge solo le spese registrate). Marco ha forzato la registrazione (43 ok + 28 sistemate a mano), poi sync. Confronto con l'esportazione FIC 2026 (446 XML in `~/Downloads/Fatture in Cloud`): **tutte le 438 fatture presenti**, differenze solo di centesimi (Amazon), 28 righe TRGB non nell'esportazione = registrate dopo l'export. **Mancavano tutte le 8 note di credito** (1.126,30 €, imponibile 929,70): mai importate, zero TD04 nel DB.

**Fase 1 fatta (da pushare):** vedi riga in testa. Punti toccati: `fattureincloud_router` (loop su 2 tipi, TD04 su insert/update, dedup XML per genere di documento in fase 1 e 2, `note_credito` nel risultato), `fatture_filtri.py` nuovo, `escludi_nc` in dashboard_router (3), controllo_gestione_router (5, KPI dashboard), alert_engine (2), banca_router (4 candidati link), foodcost_matching_router (4, nel JOIN), fe_categorie_router (fornitori: NC nel gruppo ma fuori da conteggio e spesa; stats), fe_import (where list, `_EXCL_WHERE`, top righe, totale elenco), `fatture_stato_service` (nessuna cg_uscite per TD04, errore leggibile su set_stato). Provato su copia DB: filtri, CASE, dedup per genere, guardia cg_uscite. py_compile + babel ok.

**Decisioni Marco:** NC non collegata a una fattura = nessun effetto in CG («quando comparirà il collegamento la gestiamo»). Fase 2 **confermata**: NC in negativo nel CE alla data della NC (`competenza_anno_mese` per spostarla), categoria del fornitore/righe, su imponibile, anche per le NC non collegate. Da fare dopo la verifica del sync.

**Fase 1 verificata:** dopo il push il sync ha importato le note di credito («sono entrate», Marco). **Fase 2 fatta** (v. riga in testa).

**Da verificare dopo il push:** il nome del tipo FIC `passive_credit_note` (non verificabile senza rete): se sbagliato il sync segna «Fase1 API errore» e le spese restano ok. `GET /fic/sync/count` conta ancora solo le spese (non usato dalla pagina nuova).

## SESSIONE 2026-10-02 — Carta di credito, rate Abaco, Riconciliazione completa `[core]`

Tutto PUSHATO da Marco in giornata (parser carta + commissioni + mig 178, generatore spese fisse, cross-ref senza limit). Dati sistemati via API dal browser, sempre ricontrollando lo stato live prima di ogni scrittura (Marco lavorava in parallelo sulla Riconciliazione).

**Codice**
- `carta_pdf_parser.py`: righe senza MCC (QUOTA ANNUA) e storni «16,44-» (importo negativo); router salva `-mov.importo`, dettaglio/riepilogo con segno, automatch esclude storni (cartaCredito 1.9).
- `carta_match_service.py`: ricerca manuale nel «Cerca» senza vincolo CARTA/tolleranze (fornitore, n. documento, importo per prefisso); candidati automatici anche uscite `metodo NULL` non pagate e scadute; `tolerance_commissione_eur` (mig 178, default 2 €) con nota «Pagata con carta X € (commissione +Y €)» al link; `apply_link` accetta uscite non CARTA non pagate e le marca CARTA (1.10, 1.11). Fix `CercaUscitaModal`: `TextInput.onChange` riceve il valore → la ricerca non aveva mai funzionato.
- `controllo_gestione_router.import_uscite`: dentro l'intervallo del piano rate i mesi senza rata non generano uscite (residui mai toccati eliminati) e le righe `YYYY-MM-rN` generano la loro uscita; CE competenza su `substr(periodo,1,7)` (controlloGestione 2.23). Testato su copia DB: cambia solo Abaco.
- `banca_router.get_cross_ref`: niente più `limit=500` di default — la Riconciliazione nascondeva 1.212 movimenti su 1.712 (227 da riconciliare) (flussiCassa 1.22).

**Dati**
- Caricati estratti carta giu–set 2026 (tutti quadrano), match B coi 4 addebiti CARTIMPRONTA.
- Abaco 5155/rateizzazione: rate 1–6 collegate (5 carta + CC 08/01 241,16), rate 7–10 + piano 5155 r1 segnate «paga con carta» 02/10 (ricevute salvate in OneDrive `01-Amministrazione/06-Tasse-Fiscale/rateizzazioni/abaco/`). Da chiudere con l'estratto di ottobre.
- Riconciliazione: 7 Amazon/Leroy/Aruba collegati, 3 Bugan/Coffee Lab, Sector Alarm 473,36 in 3 tranche carta, Aruba 1,22 riordinati (addebito inizio mese ↔ fattura fine mese), scollegato Amazon 24/03 → fattura 2025 (rimessa PAGATO_MANUALE), Risto Team 1391/A scambio RiBa 02/03 ↔ 31/03, piani Risto 463/V-1383/A-1391/A-896/V rinumerati (rata di febbraio mancante). Il Post 2024-25: data pagamento = 12 del mese.

- Mig 179 (DA PUSHARE): PAGATO_MANUALE senza movimento con data documento < primo movimento CC → PAGATO + nota «[Chiusa: storico anteriore agli estratti bancari in TRGB]». Nessuna colonna (Marco: «chiuse come la banca, senza un altro flag»). Copia DB: 1.236 chiuse, restano 73. Metro fuori rateizzazione (18) → PAGATO_MANUALE prima, quindi chiuse anche loro; BLC/FZ/Lara → VERIFICARE (non toccate dalla 179).

**Aperto**
- Pregis: mail mastrino inviata 02/10 da marco@tregobbi.it a info@pregis.it (85 fatture aperte 2024-25, 17.321 €).
- Risto Team: RiBa 30/04 1.266,56 non collegata (ipotesi acconto 911/V) — Marco chiede il mastrino; uscita doppia 896/V marzo 2026 (378,20, PAGATO_MANUALE) da eliminare a mano (non esiste endpoint delete uscita).
- Fatture mancanti: Amazon 20,48 (marzo ×2), Il Post mar–ago 2026, Aruba settembre.
- `create_link`/`riconcilia_uscita` non annotano la commissione sui pagamenti dal conto (solo il match carta lo fa).

## SESSIONE 2026-10-02 (sera) — Scheda articolo su una pagina sola `[core]`

Marco: «senza cliccare su Modifica quei dati mostriamoli tutti su un'unica pagina a scorrimento verticale: prima la quantità, i pulsanti per i movimenti, i dettagli dell'articolo, e sotto i movimenti». Fatto in `CucinaMobile.jsx` v1.5: lo sheet `mod` diventa una card «Dettagli» inline (stessi campi), bozza re-inizializzata dall'articolo a ogni load, `modCambiato` mostra Salva/Annulla. «Dove si trova» e «Lotti» restano subito sotto i gesti (sono la quantità spezzata per posto), prima dei dettagli. Bottone ✏️ Modifica rimosso. Babel ok. Da guardare dall'iPhone dopo il push.

## SESSIONE 2026-10-02 (pomeriggio) — «Failed to fetch» salvando le temperature `[core]`

Marco: «al momento di salvare mi da Failed to fetch». Riprodotto dal browser con una scrittura reale (`POST /tasks/execution/item/38/check` stato SKIPPED → «Failed to fetch», cioè 500 senza header CORS; con stato invalido invece 400 regolare). Causa: `_check_instance_visibility` (tasks_router, Phase A.3) legge `COALESCE(i.reparto, t.reparto)` ma `checklist_instance` in produzione NON ha la colonna `reparto` (mig 085): il `tasks.sqlite3` vivo è quello ricreato da `init_tasks_db()` a maggio (S60-INC1), stesso drift già visto per `livello_cucina` (mig 155). Quindi **ogni** check/completa/salta checklist andava in 500, non solo il gate. Le istanze si creavano perché lo scheduler controlla la colonna prima di usarla.

Fix in `app/models/tasks_db.py` v1.4: `HEAL_COLUMNS` + `checklist_instance.reparto`, `task_singolo.reparto` (TEXT nullable, non NOT NULL DEFAULT: v. feedback SQLite) e `checklist_item.ubicazione_id`; CREATE allineati; backfill `reparto` dal template (istanze) / 'cucina' (task). Gira all'import di `tasks_router` (= a ogni restart). Provato sulla copia locale: colonne aggiunte, 62 istanze → 'cucina', query della guardia ok, integrity_check ok. Nessuna migrazione nuova (init difensivo = pattern v1.3).

Da verificare dopo il push: salvataggio temperature dal gate; la spunta nel tab Oggi.

## SESSIONE 2026-10-02 — Il pallino segue la quantità; ripiani dei frigoriferi `[core]`

Marco: «Frigo 1 ha 6 ripiani, Frigo 2 ha 4, Frigo 3 ha 6» → i Frigorifero 1/2/3 (id 6/7/8, creati da lui il 28/09, 4 ripiani, soglie 0,5–6 °C) esistevano già: aggiunti via app i ripiani 5 e 6 a id 6 e 8. I posti `[DEMO] Frigo carne/latticini` non risultano più attivi; resta `[DEMO] Dispensa secco`.

Poi: «come funziona il semaforo negli articoli movimentati?» → era scollegato dalla quantità (difetto). Deciso: su MOVIMENTI il colore lo decide il numero.
- `services/cucina_scorte_service.py`: nuova `riallinea_semaforo()` (regole in `modulo_scorte_cucina.md` §3.0-bis); chiamata a fine `chiudi_ripiano`.
- `routers/cucina_scorte_router.py`: riallinea dopo `post_movimento` (TRASFERIMENTO a gambe finite), `delete_movimento`, `update_articolo`; `patch_semaforo` → 409 su MOVIMENTI.
- `CucinaMobile.jsx` v1.3: `CorreggiSheet` estratto e condiviso (scheda + giro, tasto «finito»); nel giro il tocco sul pallino di un articolo MOVIMENTI apre la correzione; ✏️ Modifica ha la scorta minima.
- Provato su copia DB: 4→2 con minima 3 = giallo, →0 = rosso + riga spesa, carico 5 = verde.
- `versions.jsx` 1.4 → **1.5**, changelog, doc §3.0-bis.

**Temperature («la temperatura com'è la segnalo?»).** Non c'era modo: 0 voci TEMPERATURA in `tasks.sqlite3` (v. TASKS-1) e nessun aggancio item→frigo. Marco: «il primo che apre quel tab deve inserire la temperatura, solo admin super admin e chef hanno tastino ignora». Fatto (interpretato: il gate copre tutta la Cucina iPhone, qualunque tab si apra per primo):
- `schemas/tasks_schema.py` + `routers/tasks_router.py`: `ubicazione_id` in `ChecklistItemIn/Out` e in `_insert_items`; `TemplateEditor.jsx` lo conserva in load/save.
- `services/haccp_letture.py`: `temperature_oggi()` (sola lettura), `salta_temperature()` (scrive SALTATA con nome e motivo).
- `routers/cucina_ubicazioni_router.py`: `GET /temperature/oggi` e `POST /temperature/oggi/ignora` (verifica_ruoli admin/chef), dichiarati prima di `/{ubicazione_id}`.
- `CucinaMobile.jsx` v1.4: `TemperatureGate` a tutto schermo, segno «−» precompilato dove soglia max ≤ 0, FAIL se fuori soglia + banner, completa l'istanza; «Ignora per oggi» solo se `puo_ignorare`.
- Dopo il push (dati, dall'app): template GIORNALIERA cucina «Temperature frigo e congelatori», voci Frigorifero 1-3 (0,5/6) e Congelatore 1-2 (−25/−18) con `ubicazione_id` 6,7,8,4,5; `POST /tasks/agenda/genera` per oggi.

## SESSIONE 2026-10-01 — Formaggi del giorno: francesi + orobici, ordine di servizio, alternative, link ingrediente `[core]` + `[locale:tregobbi]`

Marco ha mandato 18 formaggi (7 francesi Real Group, listino set. 2026; 11 orobici comprati di persona) con racconto, gusto, ruolo base/alternativa e ordine di servizio, più 4 composizioni di tagliere. Decisioni: **gusto** in coda a `descrizione`; **tipologia → categoria** (nuove Crosta fiorita / Crosta lavata / Semistagionati, create via API); **ruolo/posizione** con migrazione; **costi** non sul formaggio ma tramite **link a un ingrediente** Food cost, da creare all'arrivo della fattura; **taglieri** solo come nota (`docs/modulo_selezioni_giorno.md` §5-bis).

### Codice `[core]`
- `app/migrations/177_formaggi_posizione_ruolo_ingrediente.py`: `posizione`, `ruolo`, `alternativa_di_id`, `ingredient_id` su `formaggi_tagli` (nullable, backfill `ruolo='base'`, indici con check su sqlite_master).
- `app/routers/scelta_formaggi_router.py` v1.2: nuovi campi in In/Out; INSERT/UPDATE costruiti sulle colonne presenti (`_colonne()`, rimosso `_has_paese_column` ormai inutilizzato); validazioni alternativa (422) e delete di un base con alternative (409); `PUT` tocca i campi mig 177 solo se inviati; lista ordinata per posizione → base → nome; `costo_corrente` da `services/prezzi_ingredienti` solo per admin/chef.
- `frontend/src/pages/selezioni/zonaConfig.js` + `ZonaPanel.jsx`: flag `ordineServizio` / `linkIngrediente`; form con posizione, ruolo, «Sostituisce», IngredientPicker (riusato da Ricette) + Scollega; tabella con numero di posizione, alternative rientrate, «🔗 ingrediente · €/kg». Errori del backend mostrati nel toast.
- `versions.jsx` selezioni 1.1 → **1.2**.

### Dati `[locale:tregobbi]`
- `locali/tregobbi/seeds/formaggi_set_2026.json` (i dati di Marco, tali e quali) + `tools/import_formaggi_set2026.py` (solo API, idempotente, match per nome senza accenti/DOP/AOP: Taleggio→Taleggio DOP, Strachitunt→Strachitunt DOP). Base in carta, alternative in archivio. Bagoss/Fontina/Formagella/Pecorino di Pienza **eliminati** (decisione Marco «i vecchi puoi toglierli»), via `DELETE /formaggi/{id}` con elenco esplicito per nome (`DA_TOGLIERE`).

### Verifica
Su copia del DB (non committata, `claude/`): mig 177 applicata due volte, integrity ok; backend vero (router formaggi via TestClient): prova → esecuzione → rilancio a 0 modifiche; 13 in carta (7 FR + 6 IT), 5 alternative in archivio, 4 vecchi eliminati (18 righe totali); validazioni 422/409 ok, sala non vede costi e riceve 403 su POST, link ingrediente restituisce €/kg. JSX: babel parse ok.

### Esito
Pushato e import applicato in produzione il 2026-10-01 (prova → `--vai` → rilancio a «invariati 18»). La migrazione 177 era già live (in prova `ruolo` del Taleggio risultava già `base`).

### Da fare (storico)
1. Ok di Marco sull'elenco → /guardiano → `./push.sh "[mixed] Formaggi: ordine di servizio, alternative e link ingrediente (selezioni 1.2, mig 177) + import formaggi set. 2026"`.
2. Dopo il push: `python3 tools/import_formaggi_set2026.py --url https://trgb.tregobbi.it --utente <admin>` (prova), poi con `--vai`. Aprire /selezioni/formaggi.
3. All'arrivo della fattura Real Group: creare/abbinare gli ingredienti e collegarli dal form. Orobici: prezzo e fornitore da Marco.

## SESSIONE 2026-10-01 — Congelatori: sposta, date e scadenze, aggiungi dal telefono `[core]`

Marco ha scelto 1 (sposta), 2 (date e scadenze), 4 (aggiungi dal telefono). Decisioni: scadenza proposta **180 gg**; i 59 articoli dei congelatori passano a **MOVIMENTI** (lo fa Claude via app dopo il push, perché `famiglia_freschezza=CONGELATO` è valida solo col nuovo backend).

### Backend
- `models/cucina_scorte_db.py`: `CONFIG_DEFAULT` + `scadenza_congelato_gg`=180, `freschezza_congelato_gg`=60, `scadenza_avviso_gg`=5; `FAMIGLIE_FRESCHEZZA` + `CONGELATO`.
- `services/cucina_scorte_service.py`: `soglia_freschezza` gestisce CONGELATO; nuove `crea_lotto`, `consuma_lotti` (FIFO per scadenza, poi arrivo), `trasferisci` (due TRASFERIMENTO legati via ref_id, controllo disponibilità, lotti spostati/divisi); `annulla_movimento` annulla anche la gamba gemella; `alert_scorte` legge la soglia da config ed esclude lotti a residuo 0.
- `routers/cucina_scorte_router.py`: `MovimentoIn` + `data_lotto`, `data_scadenza`; `post_movimento` gestisce TRASFERIMENTO, crea lotto sul CARICO con date, consuma lotti sui delta negativi; `POST /articoli/` e `POST /dotazione/` aperti alla brigata.
- `routers/cucina_ubicazioni_router.py`: `_dotazione_ripiano` aggiunge `prossima_scadenza` e `giorni_scadenza` per riga.
- Provato su copia del DB (non committata): carico+lotti, consumo FIFO, trasferimento con split del lotto, undo a due gambe, rifiuto oltre disponibilità, alert.

### Frontend — `CucinaMobile.jsx` v1.2
Helper date (`oggiIso`, `piuGiorni`, `fmtData`), `useScorteConfig` (una chiamata per sessione), `CampiData`. Scheda: bottone ↔ Sposta + sheet (da / quanti / posto → ripiano), carico con date, lotti «dentro dal · scade». Giro: «＋ Aggiungi» per ripiano → `AggiungiSheet` (ricerca debounce sugli esistenti, esclude [DEMO], «＋ Nuovo», UM/confezione, quantità, date). Righe con scadenza più vicina. Verifica: babel parse + traverse ok.

`versions.jsx` cucinaScorte 1.3 → **1.4** · `docs/modulo_scorte_cucina.md` §9-quinquies.

### Dopo il push (`88b18905`, 01/10)
1. ✅ FATTO 01/10 da Claude via app (sessione di Marco): 59/59 articoli dei congelatori 4 e 5 → regime MOVIMENTI + famiglia CONGELATO. Config live verificata (scadenza_congelato_gg 180, freschezza_congelato_gg 60, scadenza_avviso_gg 5). Visto da mobile: giro con «＋ Aggiungi» per ripiano, scheda con Scarico/Carico/Scarto/Sposta, Carico con «congelato il 01/10/2026 · scade il 30/03/2027»
2. Marco dall'iPhone: Congelatore 1 → ＋ Aggiungi su un ripiano con quantità; scheda di un articolo → Carico (date proposte), Sposta su Congelatore 2, Scarico.

## SESSIONE 2026-09-28 — Scorte cucina: i congelatori veri e le correzioni dal telefono `[core]`

Marco: «come siamo messi sulla gestione dei frigo della cucina?» → stato: S1+S2 live, solo dati `[DEMO]`, nessun item HACCP agganciato a un frigo. Poi: «ti carico due freezer» (PDF inventario cartaceo, 2 congelatori × 6 livelli) → «mettimeli dentro».

### Dati caricati in produzione (dall'app, non da codice)
Dal browser integrato con la sessione di Marco, via gli stessi endpoint del pannello Frigoriferi: `POST /cucina/ubicazioni/` × 2 (**Congelatore 1** id 4, **Congelatore 2** id 5, tipo FREEZER, −25/−18, 6 ripiani: 10-15 e 16-21) + `POST /cucina/scorte/dotazione/testo` per ripiano, prima anteprima (tutto NUOVO, zero SIMILE) poi conferma. 59 articoli creati (granita al limone condivisa tra i due), tutti a regime SEMAFORO, UM PZ salvo dove il foglio diceva kg/confezioni. Da sistemare a mano: «Verdure per risotto 200» e «Acqua di vongole 156» (unità incerta), «Paglia», «Ruby», «Cocco» (nomi da precisare).

### Decisioni di Marco
- Prima le **quantità**, poi le date (lotti/FIFO = S4).
- «Le quantità e le modifiche le fanno **tutti**».
- Preparazioni a **pezzi + confezione**, non a peso.

### Cosa è cambiato nel codice
- **`app/routers/cucina_scorte_router.py`** — `update_articolo`: tolto `verifica_ruoli(GESTIONE)`, basta la guardia di router (admin/chef/sous_chef/commis). Se il payload tocca `attivo` torna la verifica GESTIONE.
- **`frontend/src/pages/cucina/CucinaMobile.jsx` v1.1** — `SchedaArticolo`: bottone ✏️ Modifica → sheet (nome, UM a pill dalla lista chiusa, confezione, regime con spiegazione, natura); righe di «Dove si trova» toccabili → sheet «Quanti ce ne sono?» → `POST /movimenti/` `RETTIFICA` con `qta` = delta e `qta_precedente` esplicita. `apriArticolo(aid, da)` passa `{path,label}` in `location.state`: dal frigo si torna al frigo.
- `versions.jsx` cucinaScorte 1.2 → **1.3** · `docs/modulo_scorte_cucina.md` (§7 permessi, nuovo §9-quater) · `docs/changelog.md`.

Nessuna migrazione, nessun build. Verifica: `@babel/parser` + `@babel/traverse` su CucinaMobile.jsx (0 identificatori irrisolti), `ast.parse` sul router.

### Fix menu moduli su iPhone (`frontend/src/components/Header.jsx`) `[core]`
Marco: «sull'iPhone il menu sopra, quello a discesa verticale, è inutilizzabile perché non si vede». Causa: l'autofocus sulla ricerca partiva anche su touch → tastiera iOS sopra la lista + zoom automatico di Safari (input a 14px, sotto la soglia dei 16px). Fix: autofocus solo con `(hover: hover) and (pointer: fine)`; input `text-base sm:text-sm`; su mobile il dropdown si ancora all'header sticky (`left-3 right-3`, niente translate), da `sm` in su resta centrato sul pulsante a 380px; `overscroll-contain` sulla lista. Non riprodotto nel browser (sessione scaduta): verificare dall'iPhone dopo il push, anche su una pagina diversa da Cucina.

### Menu di sezione su iPhone — mattone `<ModuleNav>` (M.I) `[core]`
Marco: «anche alcuni menu orizzontali non funzionano molto bene… far vedere solo alcune cose sull'iPhone?». Deciso: (1) un solo componente al posto di 11 copie, (2) poi etichetta telefono sì/no per voce. Fatto il punto 1.
- **Nuovo** `frontend/src/components/ui/ModuleNav.jsx` (+ export in `index.js`): desktop = markup identico alle vecchie Nav + `overflow-x-auto` sulla fila; `<sm` = titolo + pulsante «icona voce attuale ▾» (44pt) → bottom sheet z-[110] con tutte le voci, pallino ambra se un badge sta su un'altra voce, gruppo «Meglio dal computer» per `mobile:false` (nessuna voce marcata ancora), Home TRGB, Chiudi. Stile sheet ripreso da `tasks/Nav.jsx`.
- **Convertite** (solo il `return`, TABS/filtri ruolo/isActive invariati): FattureNav, VenditeNav, BancaNav, FlussiCassaNav, ClientiNav (badge diff import passato come `badge`), ControlloGestioneNav, DipendentiNav, PrenotazioniNav, RicetteNav, StatisticheNav (voci `soon`), ViniNav. `tasks/Nav.jsx` NON toccata. Copia pre-modifica fuori repo.
- `docs/architettura_mattoni.md` §M.I aggiornato.
- Verifica: `@babel/parser`+`@babel/traverse` su tutte le 12 Nav + ModuleNav, 0 identificatori irrisolti. Non visto nel browser (login scaduto): dopo il push aprire da iPhone Vini, Dipendenti, Clienti (badge) e Statistiche (voci «prossimamente»); da computer controllare che la fila sia uguale a prima.
- **Punto 2 aperto:** compilare con Marco la lista voce per voce `mobile: false` (proposta: CG, fatture, banca, anagrafiche, impostazioni, statistiche → computer).

### Voce «📱 Cucina iPhone» nel menu di Gestione Cucina
Marco (dopo il push `3a0f8279`): «nel menu da iPhone "gestione cucina" non vedo la cucina iphone». La sotto-app era raggiungibile solo dal menu moduli in alto (`modulesMenu.js`). Aggiunta la tab `cucina-mobile` → `/cucina/mobile` in `RicetteNav.jsx`, subito dopo «Cucina», come «Cantina mobile» in ViniNav.

### Prossimi passi (ordine concordato)
1. Dopo il push: Marco sistema i congelatori dal telefono.
2. Gesto «sposta su un altro ripiano» (`TRASFERIMENTO` c'è già nel backend).
3. Stessa modifica nel pannello al computer (righe del ripiano in `CucinaFrigoriferiPanel`).
4. S4 lotti: data di congelamento + scadenza per le preparazioni di casa.
5. Agganciare le voci temperatura HACCP ai congelatori (`checklist_item.ubicazione_id`).
6. Rimuovere il seed `[DEMO]` quando ci sono anche i frigo veri.

## SESSIONE 2026-09-27 — Ordini fornitori vini: la riga ha le stesse info della dashboard `[core]`

Marco: «ordini ai fornitori vini: mi mancano delle info per farlo funzionare meglio.. la dashboard mi porta all'ordine, ma la dashboard è più completa.. posso flaggare il "Non riordino"; ho miglior visualizzazione sulle vendite (ultima vendita etc), vedo meglio le disponibilità».

Chiarito con Marco: «disponibilità» = giacenza + copertura più in vista; flag sulla riga solo ⛔ Non ricomprare e 🗓️ Annata esaurita (Da ordinare/Ordinato li fa il carrello).

### Cosa è cambiato
- **`frontend/src/pages/vini/RiordinoBadges.jsx`** (nuovo): `GiacenzaChip`, `RitmoVenditaBadge`, `UltimoAcquistoBadge`, estratti dal `VinoRow` della dashboard. Li usano DashboardVini e OrdiniVini — niente doppioni.
- **OrdiniVini v1.2** — `RigaDaOrdinare` a tre righe: vino + giacenza/copertura grande + annata nuova + segnali; produttore + listino inline; ritmo per esteso con «venduto/finito Xgg fa», «comprato X mesi fa» (qualunque annata), flag ⛔/🗓️. Il flag fa PATCH `STATO_RIORDINO` e, se il vino era nel carrello, toglie la riga dalla bozza (id preso da `GET /vini/ordini/{bozza.id}`, la lista non porta le righe). «Messi da parte»: data ultima vendita + ↩︎ ripristina (STATO_RIORDINO → null). Pulsante nuova annata ora 🗓️➕.
- **DashboardVini** — stessi badge via componente; unico cambio visibile: «finito Xgg fa» solo se la giacenza è 0, altrimenti «venduto Xgg fa» (prima diceva «Finito» anche ai vini in esaurimento).

Backend invariato: `da-ordinare` restituiva già `ultima_vendita`, `ultimo_acquisto`, `ritmo_vendita`, `copertura_giorni`.

### File toccati
`frontend/src/pages/vini/RiordinoBadges.jsx` (nuovo) · `frontend/src/pages/vini/OrdiniVini.jsx` · `frontend/src/pages/vini/DashboardVini.jsx` · `frontend/src/config/versions.jsx` (vini 3.90 → **3.91**) · `docs/modulo_vini_ordini.md` (§ 2-quinquies).

Nessuna migrazione, nessun build. Verifica: `@babel/parser` + `@babel/traverse` sui 3 file, nessun identificatore irrisolto.

### Da fare dopo il push
`/vini/ordini` → un fornitore con vini da ordinare: controllare le tre righe, poi ⛔ su un vino nel carrello (deve sparire da lista e carrello, comparire in «Messi da parte») e ↩︎ ripristina. Dashboard Vini → alert espanso: badge identici a prima.

---

## SESSIONE 2026-09-20 — Vendite: rigenerare il tempo di apertura di una bottiglia in mescita `[core]`

Marco: « sezione vini, zona vendite, aggiungi un pulsanino per "rigenerare" il tempo di apertura della bottiglia, visibile solo x Admin/Superadmin ».

### Il problema
`DATA_APERTURA` (mig 121) si scrive da sola quando `BOTTIGLIA_APERTA` va a 1 e torna NULL alla chiusura — e nient'altro la tocca. Se la data non corrisponde alla realtà (bottiglia finita e sostituita con una nuova dello stesso vino, apertura registrata il giorno dopo, mescita riattivata su un residuo vecchio) la riga resta rossa «aperta da 4g» con dentro un vino stappato ieri, e l'unico modo di rimetterla a posto era spegnere e riaccendere la mescita — che però sporca lo storico con una coppia di eventi finti.

### La feature
Backend, `vini_magazzino_router.py`: `POST /{vino_id}/bottiglia-aperta/rigenera`, guardia `richiede_ruoli("admin")` (superadmin implicito). 404 se il vino non esiste, **409 se la bottiglia non è in mescita** (non c'è nessun timer da rigenerare). Scrive solo `DATA_APERTURA = adesso` via `db.update_vino(..., origine="CALICI-RESET")` — giacenze, prezzi e `BOTTIGLIA_APERTA` non si toccano — e registra un MODIFICA `[CALICI-RESET]` con l'età che la bottiglia aveva prima («era aperta da 52h»), così il reset resta leggibile nei movimenti del vino.

Frontend, `CaliciDisponibiliCard.jsx` (v1.2): pulsante **↻** accanto alla ✕, con `window.confirm` che ricorda l'età attuale. Doppio cancello: prop `showResetTimer` (la passa **solo** `ViniVendite`, quindi in Dashboard Sala non compare) **e** ruolo admin/superadmin via il nuovo helper `isViniTimerAdminRole` in `utils/authHelpers.js`.

### Perché admin e non `is_vini_manager`
Aprire e chiudere una bottiglia è un'azione di servizio e la fa anche la sala; riscrivere la data di apertura è un'altra cosa — è il dato su cui si basa l'alert «aperta da troppo», quindi rigenerarlo significa silenziare un allarme. Lato FE serviva un helper nuovo: `isViniManagerRole` include il sommelier, che il backend qui esclude → bottone visibile e 403 al click (l'anti-pattern già documentato in `authHelpers.js`).

### File toccati
`app/routers/vini_magazzino_router.py` · `frontend/src/components/widgets/CaliciDisponibiliCard.jsx` · `frontend/src/pages/vini/ViniVendite.jsx` · `frontend/src/utils/authHelpers.js` · `frontend/src/config/versions.jsx` (vini 3.89 → **3.90**) · `docs/modulo_vini.md` (§ endpoint, § permessi, § toggle mescita).

Nessuna migrazione. Nessun build (il frontend lo serve Vite). Verifica: `py_compile` sul router OK, `@babel/parser` sui 4 file frontend OK.

### Da fare dopo il push
`/vini/vendite` → card «Calici disponibili» → ↻ su una bottiglia in zona rossa: deve tornare verde «aperta da <1h». Poi aprire la scheda di quel vino → Movimenti e verificare la riga `[CALICI-RESET]`. Con un utente sala/sommelier il pulsante non deve comparire.

---

## SESSIONE 2026-09-18 — Intermittenti: riepilogo mese «lavorato ↔ comunicato» `[core]`

Marco: « a fine mese quando lo studio mi dirà in quali giorni ho fatto le chiamate? tu riesci a darmi una lista per dipendente? ».

### Contesto (lavoro sui dati, prima del codice)
Assunzione di **Nicoli Paolo** (intermittente 02/09→31/12/2026, liv. 4 cameriere) inserita in anagrafica: CF, indirizzo, flag `intermittente`, codice comunicazione `1000026217805616`, contratto nelle note (il modulo non ha una scheda contratto: `dipendenti_contratti` esiste nel DB ma senza endpoint né UI). Aggiornati i codici comunicazione degli altri 4 intermittenti con gli ultimi UNILAV (proroghe al 30/09/2026, trasmesse il 30/06): Lentini `1000026217067372`, Albuquerque `1000026217067530`, Gamuvka `1000026217068505`, Vasilevskaya `1000026217068610`. I 3 PDF che mancavano sono stati archiviati in OneDrive `03-Dipendenti/06-Dipendenti-Attivi/`.

**Il modulo Intermittenti è stato usato per la prima volta in produzione**: canale email collaudato (email di prova ricevuta) e primo invio reale il 17/09 alle 23:53 — 1 modulo, 8 giornate dal 18 al 27/09, registro riga 1, esito INVIATA, hash allegato `8ee011dc…fd5deffd5`.

### La feature
Backend, `uni_intermittenti_service.py`:
- `_giorni_comunicati()` diventa `_mappa_comunicati()` e ritorna **quale** invio copre ogni giornata (`comunicazione_id`, `inviata_at`) invece di un semplice sì/no; `_giorni_comunicati()` resta come wrapper di una riga, quindi `chiamate_da_comunicare()` non cambia comportamento. Unica fonte di verità per la regola «un ANNULLAMENTO riapre la giornata».
- nuova `riepilogo_mese(anno, mese)`: giornate lavorate degli intermittenti nel mese (solo turni `CONFERMATO`, doppio turno = una giornata) incrociate con la mappa. A differenza della preview d'invio **non** scarta le giornate passate (qui sono il dato, non un'anomalia) e include chi è stato disattivato dopo aver lavorato quel mese.

Router: `GET /intermittenti/riepilogo/?anno=&mese=`, admin via M.G (`_require_admin`), trailing slash come gli altri endpoint root.

Frontend, `Intermittenti.jsx` (terza tab **Riepilogo mese**): selettore mese, tabella per dipendente (giornate / comunicate / scoperte), espansione con i chip giorno per giorno verdi o rossi (tooltip: numero invio e data), banner rosso se ci sono giornate scoperte, export **CSV** con `;` e BOM per Excel italiano — una riga per giornata, da allegare all'email del consulente.

### Verifica
`riepilogo_mese(2026, 9)` lanciato sulla copia locale del DB: 42 giornate, ripartizione per dipendente coerente con quella letta dall'API turni live (Gamuvka 17, Vasilevskaya 15, Lentini 7, Albuquerque 3; Nicoli manca solo perché la copia locale è del 12/09, prima del flag). `comunicate = 0` sulla copia locale è corretto: l'invio è di stanotte, sul VPS saranno 8. JSX compilato con esbuild: nessun errore.

### Da fare dopo il push
Dipendenti → Intermittenti → **Riepilogo mese** su settembre: le 8 giornate comunicate ieri devono risultare verdi, tutte le altre rosse. Scaricare il CSV e verificare che Excel lo apra in colonne.

### Aperto
- Campo **«copia a»** sull'invio (`uni_cc` + Impostazioni + passaggio a `email_service.invia_email(cc=...)`, che già lo supporta): Marco lo ha chiesto, non è stato fatto in questa sessione.
- **Le 4 proroghe scadono il 30/09/2026.**
- Da chiarire con lo studio Zamblera chi manda le chiamate, ora che il gestionale ne manda davvero.

---

## SESSIONE 2026-09-12 — Spese fisse: la data della rata si cambia anche dallo Storico `[core]`

Marco: « spesa fissa (affitto) mi è rimasta indietro una rata di un mese, ma non riesco a cambiare la data ».

### Diagnosi
La scadenza di una singola uscita era riprogrammabile **solo** dal modale «Piano». Per l'affitto Marco apre lo «Storico», che è il modale naturale per le spese ricorrenti senza rateizzazione — e lì la colonna Scadenza era testo in sola lettura. Gli altri due percorsi sono vicoli ciechi per costruzione:
- **«Modifica»** sulla spesa fissa cambia `giorno_scadenza`/`data_inizio`, ma `update_spesa_fissa` propaga alle uscite già generate **solo** per `UNA_TANTUM` (per le ricorrenti la `data_inizio` è l'inizio del piano, non la scadenza della rata). Quindi «non succede niente».
- Dallo **Scadenzario**, una uscita `SPESA_FISSA` non apre il modale scadenza: `apriDettaglio` la rimbalza su `/controllo-gestione/spese-fisse?highlight=...` (caso 3). Il modale data è riservato a STIPENDIO/ALTRO/fatture orfane.

Dati (copia locale del DB, 10/09): `cg_spese_fisse` #1 *Ristorante — Via Broseta 20/C*, mensile giorno 20. Rate 2026-02→2026-06 PAGATO, **2026-01 SCADUTO con `importo_pagato = 0`** — è la rata «indietro di un mese». Aperte anche 2026-07 e 2026-08, su entrambi gli affitti (#1 e #2).

### Fix (controlloGestione 2.21 → 2.22, solo frontend)
`ControlloGestioneSpeseFisse.jsx`:
- Nel modale Storico la colonna **Scadenza è un `input type="date"`** per le rate aperte; il salvataggio parte `onChange` (con guardia sul formato: l'input date emette valori parziali mentre si digita) e chiama `PUT /uscite/{id}/scadenza`, lo **stesso** endpoint del Piano — quindi logica G.7 già rodata: `data_scadenza_originale` tracciata, stato → `SPOSTATO`, ripristino disponibile. `periodo_riferimento` non cambia: la competenza nel Conto Economico resta sul mese originale, si sposta solo la scadenza di cassa.
- Editabile solo se `!isChiuso(stato) && stato !== "PARZIALE"` — stessa regola del Piano. Il backend rifiuta comunque le `PAGATO` («già riconciliata con banca»). Per riaprire una rata chiusa resta il percorso «riapri rata» del Piano.
- Aggiunta colonna **Stato** allo Storico (prima si vedeva solo la riconciliazione bancaria, non lo stato di pagamento: impossibile capire perché una riga non fosse editabile).
- `statoBadge` non conosceva `SPOSTATO`/`VERIFICARE`/`RATEIZZATO` e li mostrava come testo grezzo in grigio, anche nel Piano. Aggiunti, con la palette di `ControlloGestioneUscite.STATO_STYLE` (SPOSTATO = fuchsia).

### Verifica
`@babel/parser` + `@babel/traverse` sul file: parse OK, nessun identificatore non risolto oltre ai global del browser (`Error`, `FileReader`, `URL`, `FormData`). Nessun backend toccato, nessuna migrazione, nessun build (Vite).

### Da fare dopo il push
Controllo Gestione → Spese Fisse → **Storico** sull'affitto Broseta 20/C: cambiare la data della rata 2026-01, verificare che diventi «Spostato» e che compaia con la nuova data nello Scadenzario.

---

## SESSIONE 2026-09-10 (ter) — Bottiglia fantasma in matrice: invariante `QTA_LOC3 ≡ celle` `[core]`

Marco (screenshot #607 Toscana 50 e 50): «questa bottiglia non riesco a toglierla». Posti 0/0/0, «Matrice — 0 bottiglie», totale 1.

### Diagnosi (DB locale, copia del 10/09 11:56)
- #607: `QTA_LOC3=1`, `LOCAZIONE_3='(8,3)'`, **zero righe in `matrice_celle`** (la cella riga 3/colonna 8 è libera; la (3,8) nel senso riga 8/col 3 è del #619). VENDITA del 16/05 21:52 (paolo, 158 €) registrata ma riga mai scalata: `UPDATED_AT` fermo al 14/05, come altre 680 righe.
- Causa storica: **mig 134** (riallineo post-cutover 19/05) salta di proposito i vini con `LOCAZIONE_3` in formato matrice («Marco sistemerà a mano») → mai fatto. Stessa origine: #675, #1237 (totale > posti), #731 (cella ancora occupata, totale 0). Marco li ha sistemati a mano il 10/09.
- Perché era *bloccata*: Modifica giacenze non manda loc3, la griglia non aveva celle da cliccare, RETTIFICA non tocca le locazioni (al primo ricalcolo la bottiglia tornava). Unica via: SCARICO 1 da «Matrice» nei Movimenti.
- Buchi strutturali trovati: movimenti loc3 senza celle (SchedaVino non mandava mai `celle_matrice`; CARICO su loc3 creava orfani), `delete_movimento` ripristinava `QTA_LOC3` per differenza, PATCH accettava `QTA_LOC3`, creazione/import Excel scrivevano `QTA_LOC3` senza celle, ViniVendite decideva la griglia dal testo di `LOCAZIONE_3`.

### Fix (vini 3.89)
- `vini_magazzino_db.py` v1.7: sezione «INVARIANTE MATRICE» — `_valida_celle_movimento_loc3`, `_sync_loc3_da_matrice` (non tocca il totale, non committa), `_prepara_loc3_creazione`, `verifica_coerenza_giacenze`, `riallinea_giacenza_vino`. Toccati `registra_movimento`, `delete_movimento` (entrambi i rami), `update_vino`, `create_vino`. `vini_anagrafiche_db.create_bottiglia` usa lo stesso helper.
- Router magazzino v1.6: `GET /{id}/coerenza-giacenza`, `POST /{id}/riallinea-giacenza` (guardia di router admin/sala/sommelier; il pulsante in UI solo ai manager).
- M.F: checker `vini_giacenze_incoerenti` (alert_engine v1.2) + label in alerts_router + hint in NotificheImpostazioni; **mig 176** seed `alert_config` (attivo, admin, anti-dup 24h).
- Frontend: SchedaVino v2.1 (scelta celle nei Movimenti, banner + Riallinea in Giacenze), MatricePicker v1.1 (`defaultExpanded`), ViniVendite v2.4 (griglia dalle celle vere).
- Non toccati di proposito: RETTIFICA resta assoluta/globale; CARICO senza locazione (arrivo ordini) resta ammesso → ora compare come «N bt senza posizione». Assegna/rimuovi cella da griglia non registra movimenti (comportamento storico). `matrice_recalc_all` itera ancora solo i vini con celle.

### Verifica
Script su copia del DB (`~/scratch/test.sqlite3` nella VM): #607 scarico diretto → 0/0/NULL e coerente; #619 vendita senza celle / celle ≠ qta / cella altrui → 3 errori attesi; vendita con cella giusta ok; carico senza celle / cella occupata / fuori griglia → errori, carico cella libera ok; delete vendita → «1 bt senza posizione», Riallinea → RETTIFICA 7→6 e coerente; PATCH con `QTA_LOC3=50` ignorato; `create_vino` con 2 bt senza celle → errore, con 2 celle libere → loc3=2. `py_compile` ok, 4 JSX parse ok con esbuild (container). Lint docs ok.

---

## SESSIONE 2026-09-10 (bis) — Tasto Cantina mobile in Home `[core]`

Marco: «nella home aggiungi il tasto cantina mobile».

- I tasti rapidi della Home non sono nel codice ma in `home_actions` (foodcost.db, per ruolo, configurabili da Impostazioni → Home per ruolo). Quindi: **mig 175** `175_home_action_cantina_mobile.py` che inserisce `cantina-mobile` → `/vini/cantina-mobile`.
- Ruoli: solo `superadmin/admin/sommelier/sala`, cioè chi ha `vini/magazzino` in `modules.json` (la route è protetta da quel sub). Chef/contabile/commis/viewer esclusi apposta — hanno già un «Cantina Vini» che per loro porta ad accesso negato, non ne ho aggiunto un secondo.
- Posizione dopo `cantina-vini`, shift di +1 sulle successive; in coda se manca; skip se la key esiste già (rispetta le personalizzazioni da UI, anche un tasto spento).
- Allineati `home_actions_defaults.py` (nuovo `VINI_ACTIONS_DEFAULTS` per admin/superadmin/sommelier, sala dopo Carta dei Vini) e `homeActionsFallback.js` (`VINI_FALLBACK`), così «Ripristina default» e il fallback a BE giù danno lo stesso risultato.
- Verifica: migrazione girata su copia del foodcost.db locale — 4 ruoli inseriti (admin/superadmin/sommelier in posizione 3, sala in 4), secondo giro tutto «già presente», `integrity_check` ok, chef invariato. `py_compile` e `@babel/parser` ok.
- Nota: dal 2026-08-02 non esiste build frontend (Vite servito direttamente) — la frase «lanciare npm run build» nelle note vecchie è sbagliata.

---

## SESSIONE 2026-09-10 — Cantina mobile: matrice in ordine (colonna, riga) `[core]`

Marco: nella matrice le etichette non sono in ordine, vanno ordinate per colonna e poi riga (primo numero = colonna, come su Excel).

- Convenzione verificata sul codice: `LOCAZIONE_3` è scritta come `(colonna,riga)` da `vini_magazzino_db` (ricalcolo con `ORDER BY colonna, riga`) e `MatricePicker` mostra `(${colonna},${riga})`. Confermata.
- `CantinaMobile.jsx`, `Finder.shelves`: il gruppo con `cat === "matrice"` ordina per la prima cella del vino (colonna, poi riga, poi descrizione come spareggio); vini senza celle parsabili in fondo, alfabetici. Gli altri gruppi restano alfabetici.
- Nuovi helper `celleMatrice()` (celle ordinate) e `celleLabel()` (max 3 celle a vista, poi «+N»); badge `.cm-sr-cella` davanti al nome nella riga.
- Verifica: parse JSX con `@babel/parser` OK, ordinamento provato su casi misti (multi-cella, colonna a due cifre, senza celle). `esbuild` in `node_modules` è il binario macOS, non gira nella VM.
- vini 3.87 → 3.88. Nessun backend, nessuna migrazione.

---

## SESSIONE 2026-09-08 (notte) — Regressione: i link nati a quota zero `[core]`

Marco, screenshot alla mano, poche ore dopo il deploy dei parziali: *«guarda dove lavare e balan?»*. Due bonifici del 30/06 con «⚡ Parziale: € 0,00 su € 174,22 — residuo € 174,22»: collegati e insieme vuoti.

### Cosa avevo sbagliato
In `create_link` avevo scritto il filtro delle rate da allocare come `stato NOT IN ('PAGATO','PAGATO_MANUALE')`. Letto ad alta voce suona corretto — "prendi quelle non ancora pagate" — ma `PAGATO_MANUALE` **è il caso normale** della riconciliazione: la fattura viene segnata pagata quando la si paga, e il movimento bancario arriva a confermare giorni dopo. Filtrandola via, `_alloca_su_uscite` riceveva una lista vuota, l'allocazione tornava `[]`, e `quota_link = sum([]) = 0` finiva dritto in `importo_applicato`.

Doppio effetto: il documento spariva dal conto del movimento (che restava a residuo pieno) e la fattura non era ricollegabile, perché il link esisteva già → 409 "Collegamento già esistente". Un vicolo cieco.

**La regola che mancava, ora scritta in `modulo_banca.md` §6:** in questo modulo lo *stato* dell'uscita dice cosa ha dichiarato l'utente, `banca_movimento_id` dice cosa ha visto la banca. Per decidere dove allocare vale il secondo.

### Fix
- `create_link`: criterio `banca_movimento_id IS NULL OR stato = 'PARZIALE'`.
- Guardia: se non c'è nulla da allocare, `importo_applicato` resta **NULL** (= vale il totale, come i link storici) invece di essere scritto a 0. Uno zero esplicito è peggio di un'assenza: dice "questo documento non conta".
- **Mig 174**: ripara i link già a zero (quota → NULL) e completa le uscite rimaste a metà — l'hook di stato le aveva portate a `PAGATO` ma senza `banca_movimento_id`, senza `importo_pagato` e senza data.

### Verifica
Bug riprodotto su copia del DB con la fixture esatta del caso di Marco (fattura `PAGATO_MANUALE` + movimento libero): prima → «coll 0,00 / res 1212,17 / non riconciliato», dopo la 174 → «coll 1212,17 / res 0,00 / riconciliato», uscita agganciata con data 30/06. Migrazione idempotente. Aggiunto il **caso 5c** allo smoke test (`claude/smoke_riconciliazione_parziale.py`) così non ci si ricasca: tutti gli altri casi restano verdi.

### Nota di metodo
Lo smoke test della sessione precedente copriva 8 scenari e nessuno partiva da una fattura `PAGATO_MANUALE` — cioè dallo stato in cui si trova la maggioranza delle fatture di Marco quando arriva l'estratto conto. I casi di prova erano tutti "puliti": fattura nuova, mai toccata. È lì che è passato il bug.

---

## SESSIONE 2026-09-08 (sera) — Bonifica dati: 3 riconciliazioni sbagliate + 65 entrate orfane `[core]`

Seguito diretto della sessione precedente: Marco ha pushato i parziali e ha chiesto di andare a fondo sulle due cose lasciate aperte. DB locali aggiornati dal push, quindi analisi sui dati veri.

### A — Le tre riconciliazioni sbagliate
La prova che regge tutto: **535,82 + 887,37 = 1.423,19**, esatto al centesimo. Il bonifico Bugan del 23/05 pagava le due arretrate (fatt. 14 e 20), non la fatt. 40 + una Coffee Lab da 88 € come risultava. La 40 è pagata dalla RiBa del 30/06 (mov 1683, orfano), coerente con tutta la serie Bugan (27→1464, 49→1716, 57→1824). E non esiste nessun altro movimento da 887,37 in archivio.

Effetto: **fattura 20 = debito fantasma di 887,37**, unica Bugan aperta; fattura 40 con data pagamento sbagliata di un mese.

Cercando lo stesso pattern su tutti i 1.278 movimenti (movimento libero il cui importo coincide con una fattura già collegata altrove, stesso fornitore nella descrizione) sono emersi altri due casi e **solo** due: **Tris Moka** con le RiBa sfasate di un mese (1092/020 marcata "pagata a mano", il suo addebito preso dalla 1388/020, l'addebito del 30/06 orfano) e **Amazon 8/04**, dove la fattura da 92,05 è finita sull'addebito da 94,81 (chiuso a mano per i 2,76) mentre accanto c'era quello da 92,04.

Tutto in `scripts/rettifica_riconciliazioni_2026_09_08.py`: dry-run di default, backup, **precondizioni verificate una per una** (se il DB non è nello stato atteso si ferma senza toccare nulla — testato: al secondo lancio si blocca da solo), transazione con `integrity_check` + `foreign_key_check` + residuo zero su ogni movimento toccato prima del commit.

Scelta presa in autonomia: la Coffee Lab da 88 € torna `PAGATO_MANUALE`, come le altre **30** fatture di quel fornitore (si paga al banco). Se salta fuori il movimento vero si ricollega da UI in due clic.

### B — Le 65 entrate POS orfane (mig 173)
Causa trovata: il 31/03/2026 alle **20:40** registrazione in blocco degli incassi POS di feb-mar; alle **21:15** la mig 046 cancella i movimenti duplicati da doppio import CSV, spostando `cg_uscite` e `banca_fatture_link` ma **non `cg_entrate`** — tabella nata il giorno prima (mig 044). La mig 058 imparerà a gestirle tre settimane dopo, troppo tardi.

Il caso era già stato visto il **2026-07-10** (audit FK) e lasciato lì. Quello che mancava era la verifica fatta ora: **tutte e 65 hanno una gemella valida** (stessa data, stesso importo, collegata al movimento sopravvissuto). Sono copie morte, non incassi persi. La migrazione cancella solo quelle con gemella; una senza gemella verrebbe conservata e segnalata a video.

`foreign_key_check` di `foodcost.db`: **65 → 0**. Marzo 2026 passa da 108 entrate POS (104.506 €, quasi doppio degli altri mesi) a 68 (64.653 €).

### Fix di codice collaterale
`banca_router`: il flag `parziale` sul link confrontava con `0.01` invece che con la tolleranza — l'addebito Amazon da 92,04 su fattura 92,05 sarebbe stato mostrato come pagamento parziale per un centesimo. Nessun bump di versione (`versions.jsx` era in mano a una sessione parallela sulla cucina).

### Come si esegue
1. `./push.sh` — la **mig 173 gira da sola** al boot del backend.
2. `ssh trgb` → `cd /home/marco/trgb/trgb/` → `python3 scripts/rettifica_riconciliazioni_2026_09_08.py` (dry-run) e poi `--apply`. Lo script **non** parte da solo ed è l'unico pezzo che va lanciato a mano.

### Terzo cantiere, aperto e non toccato
**36 uscite aperte da oltre 60 giorni dentro il periodo coperto dalla banca, per 30.529,63 €** (Orobica Pesca 8.255,07 · Marenzi 1.130+868+2.368 · Cazzaniga 1.252 · Malowine 1.442 · le rateizzazioni Abaco/Metro/Fondo Est · affitto gennaio 2.416,65). Alcune saranno debiti veri, altre potrebbero essere altri pagamenti mai riconciliati. Serve Marco per separarli: non è deducibile dai dati.

---

## SESSIONE 2026-09-08 — Pagamenti parziali in Riconciliazione `[core]`

Marco, guardando un movimento da −577,56 collegato a una fattura MGM da 417,06: *«è saltato qualcosa in riconciliazione oppure qualcosa hc enon ho capito.. ho riconciliato con una fattura ma doveva fare una parziale»*.

### Cosa c'era davvero sotto
Non era un bug isolato, erano tre cose sovrapposte:

1. **Il parziale non esisteva.** `create_link` scriveva `stato='PAGATO', importo_pagato = totale` senza mai confrontare l'importo del movimento con quello della fattura. Nessun punto del backend scriveva `PARZIALE`: lo stato era **visualizzabile** (badge, filtri CG) ma **non producibile**. Un bonifico più piccolo della fattura la dichiarava saldata, in silenzio.
2. **Il tab «Collegati» mentiva.** `isFullyLinked` includeva `match_uscite_count > 0`: bastava una `cg_uscite` agganciata per dichiarare il movimento riconciliato, importi o non importi. Il contatore in fondo alla pagina usava invece il residuo — per questo la stessa riga era «Collegata» sopra e «1 parziale» sotto.
3. **Lo «0» sotto Scollega** era `{m.riconciliazione_chiusa && (...)}` con lo 0 di SQLite: React stampa lo zero invece di non renderizzare.

### Cosa è stato fatto
- **Allocazione vera** (`_alloca_su_uscite` + `_totale_gia_allocato` in `banca_router`): ogni documento prende `min(quel che resta del movimento, quel che gli manca)`. Scoperto sotto tolleranza → `PAGATO`; sopra → `PARZIALE` con `importo_pagato` reale. L'hook `on_riconciliazione_added` viene **saltato** quando l'esito è parziale (forzava «pagato»).
- **`banca_fatture_link.importo_applicato`** (mig 172): la quota di quel movimento su quella fattura. La chiedeva `spec_riconciliazione.md` da aprile. Senza, due bonifici sulla stessa fattura risultano due pagamenti interi. NULL = link storico = totale pieno, quindi retrocompatibile.
- **Soglia configurabile** `carta_match_settings.tolerance_residuo_eur` (default 1,00 €), UI in Flussi di Cassa → Impostazioni → «Soglie riconciliazione». Prima l'1 € era hardcoded in tre punti diversi, FE e BE.
- **`is_riconciliato` calcolato dal backend** ed esposto in `/banca/cross-ref`: unica fonte di verità per il tab. Il FE tiene solo un fallback per backend più vecchi.
- **UI**: avviso ambra al momento del collegamento parziale, link mostrato come «€ 400 su € 500», nota «pagamento parziale» nel tab Collegati, badge rosso «sovra-collegato» quando i documenti valgono più del movimento (lì si toglie, non si aggiunge), contatore «N con pagamento parziale», `!!` sui due zeri fantasma.
- **`delete_link`** ricalcola invece di azzerare: staccando un bonifico da una fattura pagata in due tranche si torna a `PARZIALE`, non a «da pagare».

### Decisioni di Marco
- Tolleranza: *«avevamo già questo sistema, guarda come avevamo fatto»* → riuso del pattern `carta_match_settings` (singleton + endpoint + UI), non una tabella nuova.
- I 3 movimenti storici che sarebbero riemersi (112 Reepack, 986 MALOWINE — bonifici parziali della mig 110 — e 285 con residuo 112 € accettato): **chiusi dalla migrazione**, con nota e guardia su importo + data oltre che sull'id.

### Verifica
`claude/smoke_riconciliazione_parziale.py` su **copia** del DB (nessun dato reale toccato): bonifico esatto · più piccolo · scarto 40 cent · cumulativo su due fatture · fattura in due tranche + scollegamento · uscita CG con importo diverso · migrazione idempotente · integrity_check e nessuna nuova violazione FK. **Confronto vecchia/nuova regola su tutti i 1.278 movimenti: 0 cambiano tab.**

### Due cose emerse e NON toccate
- **Fattura Bugan 40 (810,09 €)**: risulta pagata perché il 13/06 è stata collegata al movimento **1522** del 23/05 (−1.423,19, insieme alla fattura 14 e a un'uscita da 88 €), mentre il bonifico vero — mov **1683** del 30/06, −810,09 — resta senza match. Non è un bug del codice: è un collegamento sbagliato, fatto probabilmente proprio per far quadrare a mano un cumulativo. Il 1522 ha `riconciliazione_chiusa=1`. Va sistemato a mano da Marco (scollegare la 40 dal 1522, collegarla al 1683, e decidere cosa copre davvero il 1522).
- **65 violazioni FK preesistenti** in `foodcost.db`: `cg_entrate` che puntano a `banca_movimenti` cancellati. Nulla a che vedere con questa sessione, ma vanno guardate prima o poi.

---

## SESSIONE 2026-09-07 — Scorte & Frigoriferi cucina: infrastruttura `[core]`

Marco: *«come stiamo lavorando per una sotto-app per la gestione da iPhone della cantina, dobbiamo fare lo stesso per la cucina. Per gestire i task, le check list, le scorte e i frigoriferi»*.

### Come è andata la sessione (metodo, vale per le prossime)
Ero partito a scrivere backend. Marco mi ha fermato due volte: **«prima di scrivere codice, creiamo le infrastrutture»** e poi **«parti sempre troppo veloce, io partirei con dei mockup per capire come gestirlo nell'operativo»**. Aveva ragione: i mockup hanno cambiato lo schema in un punto che a tavolino non avrei visto (i ripiani). Il codice scritto prima è finito in `claude/scorte_cucina_parcheggio/` ed è stato **buttato e riscritto**, non riciclato.

### Cosa esisteva e cosa mancava
Task, checklist e report HACCP ci sono già (`tasks_router`, `haccp_router`). La Lista Spesa c'è ma è testuale. **Mancava tutto il magazzino**: cosa c'è, dove, quanto vale, quando scade, che storia ha un frigo. Nella sotto-app a 4 tab, due (Oggi, Spesa) girano su endpoint esistenti: il lavoro è sui due centrali.

### Le tre idee che reggono lo schema
1. **Il regime.** Ogni articolo dichiara UN modo di essere gestito — `SEMAFORO` / `CONTA` / `MOVIMENTI` — e la conta periodica vale per tutti e tre. È ciò che permette di avere tutti i metodi (Marco li voleva tutti e quattro) senza che il dato menta.
2. **Il ripiano è l'unità.** La giacenza ha per chiave `(articolo, ripiano)`, non `(articolo, ubicazione)`. **Ogni ubicazione ha almeno un ripiano**, anche la dispensa: ne ha uno, si chiama `1`. Niente campo nullable, niente doppio modo di navigare. Corollario: *la giacenza di un articolo è sempre una somma*.
3. **La dotazione.** `in_dotazione = 1` = «questa roba sta qui di norma», anche a zero. Senza, il giro del frigo nasconderebbe proprio il buco che stai cercando.

### Il prezzo del «tanti, ma va fatto»
Marco ha scelto molti articoli a regime `MOVIMENTI` sapendo che è impegnativo. Il rischio non è ipotetico: prima o poi qualcuno non scarica e il sistema mostra un numero preciso e falso. La risposta non è chiedere disciplina, è che **il sistema ammetta di non sapere più**: oltre la finestra di freschezza (5 gg fresco / 21 gg secco, in `cucina_scorte_config`) la giacenza si mostra come stima. Gli articoli fermi si autodenunciano: o non girano (regime sbagliato), o nessuno li scarica (processo rotto).

### Decisioni prese con Marco
Endpoint `/cucina/scorte` + `/cucina/ubicazioni` · schema multi-reparto, UI cucina-only · UI a 4 tab · gesto principale = il giro del frigo · ripiani con codice **locale** (`1`,`2`,`3`) e destinazione d'uso · un articolo su più ripiani · conta a ripiani · fornitore doppio (tabellato dalle 161 P.IVA in `fe_fornitore_categoria` + libero) · dotazione a incolla-testo · `SCARTO` tipo a sé · UM da lista chiusa + `confezione` libero.

**Preso in autonomia** (Marco era via): crudo su ripiano cotto **si segnala, non si blocca** — chiave `blocca_incompatibilita_ripiano = 0`, si gira senza toccare codice se l'ASL pretende il blocco.

### File
- nuovi: `app/models/cucina_scorte_db.py` (schema = single source of truth, 11 tabelle) · `app/services/cucina_scorte_service.py` (logica) · `app/services/prezzi_ingredienti.py` (servizio platform) · `app/routers/cucina_scorte_router.py` + `app/routers/cucina_ubicazioni_router.py` (40 endpoint) · `app/services/haccp_letture.py` (ponte read-only verso il Task Manager) · `app/migrations/171_cucina_scorte_frigoriferi.py`
- nuovi docs: `docs/modulo_scorte_cucina.md` · `docs/mockups/cucina_mobile_scorte_frigo.html` (9 schermate, il giro del frigo è interattivo)
- modificati: `main.py` (import + `_mount` + init di boot) · `core/moduli/cucina/module.json` (v2.0) · `frontend/src/config/versions.jsx` (nuova chiave `cucinaScorte` 1.0) · `docs/index.md`

### Disciplina modulare rispettata
`# Modulo: cucina` in testa a ogni file, tabelle prefissate `cucina_*`, **nessun import fra router di moduli diversi**. Le temperature NON sono duplicate: restano `checklist_execution` nel Task Manager e si leggono via servizio platform (il ponte è `checklist_item.ubicazione_id`, aggiunta dalla mig 171). Il prezzo ingrediente è stato promosso a `app/services/prezzi_ingredienti.py` invece di importarlo da `foodcost_recipes_router`.

⚠️ **Debito dichiarato:** `foodcost_recipes_router.prezzo_corrente_ingrediente()` è ora un gemello del servizio platform. Non l'ho toccato — è modulo ricette e questa era una sessione cucina. Va collassato in una prossima sessione ricette; fino ad allora **la copia canonica è il servizio**.

### Verifica
- `compileall` sui 7 file + `main.py`.
- **Giro operativo completo su DB di prova** (`/tmp/smoke_scorte.py`, nessun DB reale toccato): schema idempotente e `integrity_check` ok · ripiano `1` che nasce da solo · `UNIQUE(ubicazione,codice)` che tiene mentre `'2'` esiste in due posti diversi · semaforo FINITO → riga spesa, e due volte non fa doppioni · giacenza su 2 ripiani = somma 6,4 · undo che ripristina e lascia il movimento marcato · **rettifica a delta ZERO scritta lo stesso** (il bug vini del 18/7 non si ripete) · freschezza 5/21 e stato `DA_VERIFICARE` a 9 giorni · conta a ripiani con baseline esplicita e valorizzazione · alert completo · `foreign_key_check` pulito.
- Statica: tutti i nomi importati esistono nei moduli sorgente, 40 route enumerate, trailing slash sui root corretti, guardie M.G presenti su entrambi i router (1 di router + 17 `verifica_ruoli` nel corpo).
- ⚠️ **Non testato**: il boot vero di FastAPI. Il venv è del Mac, nel mio ambiente non c'è `fastapi`. Il primo `push.sh` è la prima esecuzione reale — guardare il log post-deploy.

### Cosa resta
- **La UI.** Nessuna schermata scritta: la sotto-app mobile è la prossima sessione, e il mockup è la specifica.
- **Seed Tre Gobbi** `[locale:tregobbi]`: i frigo veri e la loro dotazione. Commit separato, e la dotazione si popola dall'incolla-testo.
- Due decisioni aperte in `docs/modulo_scorte_cucina.md` §10.2: se una conta a 24 ripiani si può spalmare su più giorni, e la taratura vera di 5/21 dopo qualche settimana d'uso.

### Parte 2 — «Cucina da iPhone» (stessa sessione)

`frontend/src/pages/cucina/CucinaMobile.jsx`, 1.250 righe, gemella di `CantinaMobile.jsx`. Rotte `/cucina/mobile/:tab?/:id?` (i deep link servono al tasto Indietro del telefono), voce **«Cucina da iPhone»** nel dropdown sotto Gestione Cucina.

**Quattro tab, due dei quali su endpoint preesistenti:**
- **Oggi** → `/tasks/agenda/`. Checklist con tap-to-complete sui singoli item e task del giorno. Le voci TEMPERATURA/NUMERICO **non** si spuntano al volo: senza valore l'endpoint rifiuta, ed è giusto — una temperatura va letta, non spuntata.
- **Scorte** → `/cucina/scorte/articoli/`. Ricerca con debounce, filtri «da comprare / da verificare / tutti», scheda articolo con azioni rapide precompilate e sheet per la quantità.
- **Frigo** → `/cucina/ubicazioni/`. **Il giro**: card per posto con temperatura, mancanti e guasti; dentro, i ripiani dall'alto in basso con la destinazione d'uso e i pallini.
- **Spesa** → `/lista-spesa/items/`, raggruppata per fornitore.

**Prefisso classi `km-`**, non `cm-`: CantinaMobile convive nella stessa app e le regole si sovrascriverebbero. Palette TRGB-02, safe-area iOS su header e tab bar, touch target 38-44px.

**Il rispetto di `stato_dato` è nel codice, non nelle intenzioni:** `fmtGiacenza()` è l'unico posto che decide come si scrive una quantità — `4,2` se fresca, `≈ 4,2` con chip «fermo da N gg» se stantia, `—` se ignota. Se qualcuno la aggira, il modulo torna a mentire.

**Verifica frontend:** `@babel/parser` su tutti i file toccati; `@babel/traverse` per hook condizionali (nessuno) e identificatori non risolti (nessuno); **cross-check delle 13 chiamate HTTP contro le route reali dei 4 router coinvolti — 13/13 esistono**. ⚠️ `esbuild` e il venv nel repo sono binari macOS: non girano nel mio ambiente, quindi **`npm run build` va lanciato da te prima del push**.

### Suggested commit
`./push.sh "[core] Cucina da iPhone — magazzino a ripiani (mig 171: 11 tabelle cucina_*, 2 router/40 endpoint con guardie M.G, ponte HACCP checklist_item.ubicazione_id) + sotto-app mobile 4 tab su /cucina/mobile. Zero dati: invisibile finche non si configurano i frigo. npm run build prima del push"`

---

## SESSIONE 2026-09-03 — Omaggi: incassato ≠ corrispettivo ≠ imponibile `[core]`

Marco, partendo dalla chiusura RT del 28/08: *«c'è una cosa che sballa l'imponibile, degli omaggi che non avevamo previsto»*.

### La premessa iniziale era sbagliata (di entrambi)
L'ipotesi di partenza — «gli omaggi non alzano l'imponibile, quindi non vanno considerati» — è stata verificata e **smentita**. Il tracciato dei corrispettivi telematici include `<NonRiscossoOmaggio>` nell'ammontare da assoggettare a IVA: la cessione gratuita è operazione imponibile, l'imposta la versa l'esercente. Quindi iPratico e AdE erano corretti, **era il gestionale a sbagliare**. Il primo tentativo di analisi aveva fatto tornare il conto dal lato cassa (2.252,73 × 1,10 = 2.478 incassati) invece che dal lato fiscale: errore riconosciuto e corretto prima di scrivere codice.

### Le 3 grandezze (28/08/2026)
| | € | dove sta |
|---|---:|---|
| incassato | 2.478,00 | `shift_closures.preconto` |
| omaggi | 8,00 | 🆕 `shift_closures.omaggi` |
| corrispettivo fiscale | 2.486,00 | derivata: `preconto − annulli + omaggi` |
| imponibile | 2.260,00 | scorporo del corrispettivo |
| imposta | 226,00 | di cui 0,73 a carico dell'esercente |

**Omaggi e annulli sono opposti:** entrambi fuori dalla cassa, ma gli annulli si **sottraggono** dall'imponibile e gli omaggi si **sommano**. Documentato in `modulo_vendite.md §9.5.1`.

### Scelte di design
- **`preconto` non cambia semantica.** Ha anni di dati dentro: resta l'incassato. Il corrispettivo fiscale è una derivata calcolata, non un campo riscritto. Con `omaggi = 0` (tutto lo storico) il calcolo è bit-identico a prima.
- **Quadratura di cassa non toccata.** `giustificato` ignora gli omaggi: soldi mai entrati, niente da giustificare. `cash_diff` invariato.
- **Due campi distinti nell'aggregazione**: `corrispettivi` (incassato, usato da cassa e dashboard) e `corrispettivi_fiscali` (base dello scorporo, usato dal PDF). Separati apposta per non far regredire nessuna schermata esistente.

### Fix collaterale trovato strada facendo
`corrispettivi_export.py` **non sottraeva `annulli_resi`** dal corrispettivo, mentre `admin_finance.py` lo faceva dalla mig 146: i due percorsi divergevano sul PDF. Allineato. Le SELECT su `annulli_resi`/`omaggi` sono ora difensive (`PRAGMA table_info`): un DB non ancora migrato non fa esplodere l'export.

### Verifica
- Migrazione simulata su copia del DB live: `integrity_check` ok.
- Ricalcolo end-to-end del 28/08 con `omaggi = 8,00` → corrispettivo 2.486,00, imponibile **2.260,00**, imposta **226,00**: allineato ad AdE/iPratico.
- Non-regressione su giorno senza omaggi (29/08): corrispettivo fiscale identico al corrispettivo.
- `ast.parse` sui 4 file Python, `@babel/core` su `ChiusuraTurno.jsx`.

### Cosa resta a Marco
1. Correggere a mano le chiusure passate con omaggi (dato mai registrato, non recuperabile dal gestionale) e ristampare i PDF.
2. Valutare col commercialista se battere gli omaggi come **sconto a pagare** invece che come omaggio: abbatte corrispettivo e imponibile, ma è un trattamento fiscale diverso.
3. `npm run build` prima del push.

## SESSIONE 2026-09-03 — M.G completato (92%) + un 401 sfuggito in produzione `[core]`

⚠️ **Nota sulle date:** i blocchi qui sotto marcati "2026-09-01" e il file `docs/audit_permessi_2026-09-01.md` sono in realta' del **3 settembre**. Ho ereditato la data dall'ultimo blocco di `sessione.md` invece di leggere quella di sistema. Il file andrebbe rinominato `audit_permessi_2026-09-03.md` con i link aggiornati (`index.md`, `modulo_dipendenti.md`, `architettura_mattoni.md`, i commenti nei router): rimandato per non moltiplicare i conflitti con le sessioni parallele.

### 🚨 Il problema urgente
Il commit `ada50c12` (pushato da una sessione parallela, che con `push.sh` ha raccolto anche il mio lavoro in corso) ha portato in produzione la guardia di router su `vini_cantina_tools_router` nella versione **header-only**.

`richiede_ruoli` poggia su `get_current_user` → `OAuth2PasswordBearer`, che legge **solo** l'header `Authorization`. Ma 7 endpoint di quel router si autenticano con `?token=` in query, perche' aperti con `window.open()` o dentro un `<iframe>`: li' l'header non si puo' impostare. Risultato in produzione, adesso:

- PDF inventario, inventario giacenza, inventario locazioni (da Gestione Vino 2) → **401**
- export xlsx cantina e template-v2 (da Impostazioni Vini) → **401**
- iframe carta cantina → **401**

**Per tutti, admin compreso.** Non e' un problema di permessi: sono endpoint che smettono di rispondere.

**Fix pronto in locale, da pushare.** Nuova `richiede_ruoli_con(dipendenza_utente, *ruoli)` in `app/services/permessi.py`: stessa guardia, costruita su un getter di autenticazione diverso. In `vini_cantina_tools_router` si aggancia con `router.dependencies.append(...)` subito dopo `_get_user_flessibile` (header **o** `?token=`) e prima del primo endpoint — ordine verificato da un controllo AST. Stesso trattamento per `/vini/carta/pdf-staff`.

**Regola da ricordare:** prima di mettere una guardia a livello router, cercare `Query(None)` con nome `token` e i `Depends(_get_user_*)` nelle firme. Se ci sono, serve `richiede_ruoli_con`. Verificato: non ce ne sono altri.

**Lezione di metodo:** la verifica incrociata aveva trovato questo bug, ma nel frattempo un `push.sh` di un'altra sessione aveva gia' portato via il lavoro non ancora corretto. Con sessioni parallele attive, `push.sh` non pusha "la mia roba": pusha **tutto quello che trova modificato**. Chi lavora su un fix in due tempi deve mettere in conto che il primo tempo puo' partire da solo.

### Il resto dell'ondata (contenuto gia' in `ada50c12`)
7 router vini (ruoli invariati: admin, sala, sommelier — chiude solo a cucina, contabile, viewer), `pranzo_router`, `menu_templates_router`, `foodcost_matching_router` (admin), `foodcost_recipes_router` (lettura larga per il composer preventivi, 16 scritture chiuse alla cucina), `GET /dashboard/cucina`, `PUT /settings/closures-config/`.

**Copertura finale: 776/836 endpoint con un check di ruolo (92%).** Aperti: 60, tutti voluti — elenco in [audit_permessi_2026-09-01.md §5.4](audit_permessi_2026-09-01.md).

### Contraddizioni PREESISTENTI emerse (decisione PO aperta)
Il router Vini ammette `sala`, ma guardie interne piu' vecchie la escludono lo stesso perche' usano `is_vini_manager` (admin/superadmin/sommelier):
- `vini_magazzino_router` `PATCH /{id}` — usato da `ViniVendite.jsx:407` per il prezzo custom al calice, su una pagina aperta alla sala. **La sala prende gia' 403 li' oggi.**
- `vini_anagrafiche_router`, scritture — `NuovoVinoV2.jsx` (sub `magazzino`, quindi sala) crea produttori/madre/bottiglia.
- `vini_ordini_router`, scritture — stessa forma.

Non sono regressioni: o si toglie `sala` da quelle pagine, o si allarga `is_vini_manager`.

## SESSIONE 2026-09-01 (terza parte) — M.G applicato: 25 router chiusi `[core]`

Marco: *«applica dove serve»*. Non era meccanico.

### Perche' non bastava applicare modules.json alla lettera
La mappatura di cosa il frontend fa **davvero** ha trovato **30 trappole**: punti dove `modules.json` dice "solo admin" ma l'app lascia fare quella cosa alla sala tutti i giorni. Le peggiori: il widget calici nella home della sala, la chiusura di cassa serale, la creazione di vini da Cantina 2, l'editing della carta bevande, le gift card, il merge clienti. Applicare la matrice alla lettera avrebbe rotto il servizio in una trentina di punti, tutti su pagine che il personale apre ogni giorno.

Da qui il criterio adottato: **ruoli del MODULO, non del sotto-modulo.** Se un ruolo non vede il modulo nell'interfaccia, non sta gia' usando quelle pagine — chiudergli l'API non cambia il lavoro di nessuno e toglie il buco. Le restrizioni piu' fini (sotto-modulo) solo dove il codice le reggeva senza ambiguita'.

### Fatto — 25 router, guardia a livello router
Tabella completa in [audit_permessi_2026-09-01.md §5.2](audit_permessi_2026-09-01.md). In sintesi: banca + carta + CG + utenze + admin_finance + fatture (import/categorie/proforme) → admin+contabile; FIC + statistiche + alert + iPratico → admin; clienti + gift card + preventivi → admin/contabile/sala/sommelier; prenotazioni → + contabile (v. sotto); lista spesa + ingredienti → cucina; HACCP → chef; menu carta → cucina; selezioni → lettura a sala/sommelier, scritture a cucina.

**Copertura: da 200/836 endpoint con un check di ruolo (24%) a 613/836 (73%).** Aperti a qualsiasi ruolo autenticato: da 636 a 223, e i 223 sono in larga parte voluti (vini, letture turni, dashboard/notifiche/auth, chiusura di cassa).

### Decisioni di Marco che il codice non poteva dedurre
- **Chiusura di cassa serale: la fa la sala.** Sta in `chiusure_turno.py`, router separato da `admin_finance` nonostante il prefisso quasi identico (`/admin/finance/shift-closures/*`). Non toccato. Era la trappola numero uno: un `solo_admin` su `admin_finance` senza accorgersi della distinzione avrebbe bloccato la cassa ogni sera.
- **Gift card e merge clienti restano alla sala.** Preventivi: la sala legge, non scrive (le scritture erano gia' admin).
- **Modulo Vini: tutto come oggi.** Sala e sommelier scrivono davvero — carta staff, cantina mobile, vendite, creazione vini. Non toccato niente.
- **Selezioni: le prepara la cucina.** Sala e sommelier consultano e segnano venduto/archiviato — azione di servizio, resta loro — ma non creano ne' cancellano. `ZonaPanel.jsx` nasconde i tre bottoni e mostra «👁️ Sola lettura»; nuovo `isCucinaWriterRole()` in authHelpers, specchio delle guardie backend.

### Falso allarme corretto
L'audit dava comunicazioni e nota della Lavagna come scrivibili da chiunque, perche' guardava le chiamate del frontend (la route `/comunicazioni` non ha `ProtectedRoute` e la nota parte dalla Home). In realta' tutte e cinque le scritture avevano gia' `_require_admin` **nel corpo**: erano gia' chiuse. Nessuna modifica funzionale, solo un commento che lo documenta — e la domanda che avevo fatto a Marco era basata su una premessa sbagliata. Se vuole che anche chef e sommelier scrivano la nota di servizio, e' una riga.

### Errore mio, intercettato prima del push
Il primo passaggio ha inserito `from app.services.permessi import richiede_ruoli` **dopo** la riga `router = APIRouter(...)` in 6 file su 11 — lo script prendeva l'ultimo import `app.*` del file. Sarebbe stato un `NameError` all'import del modulo, cioe' **il backend non sarebbe partito**. Trovato con un controllo AST che confronta la riga dell'import con la riga dell'uso, ora parte della verifica standard.

### Verifica
- `compileall` su `app/routers`, `app/services`, `main.py`: pulito. `pyflakes`: nessun nome indefinito introdotto (restano 2 warning preesistenti, `logging` in `fattureincloud_router.py:345` e una ridefinizione in `vini_pricing_router.py:140`).
- Controllo AST su tutti i router toccati: import sempre prima dell'uso, nessun router con doppia `dependencies=`, nessun `Depends(get_current_user)` orfano.
- `menu_carta_router.public_router` verificato come oggetto distinto, montato a parte: **il QR cliente resta pubblico**. Stessa verifica su `pranzo_router`.
- Revisione incrociata (subagent) su tutti i chiamanti frontend: Home, DashboardSala, Header, widget e hook non toccano nessuno dei router chiusi.
- Nomi ruolo validati dal mattone al boot: se ne avessi scritto uno male, il backend non sarebbe partito invece di aprire una porta.

### Due regressioni trovate in verifica e sistemate
1. **Contabile** perdeva la ricerca cliente dentro la scheda preventivo (`GET /prenotazioni/clienti/search`, chiamata da una pagina del modulo clienti che lo include). Risolto ammettendo `contabile` su prenotazioni: non e' un allargamento reale, gli stessi nominativi li vede gia' dal modulo Clienti.
2. **Sala e sommelier** perdono `/vendite/chiusure-old` (`CorrispettiviGestione`), vecchia pagina corrispettivi non linkata da nessuna nav e raggiungibile solo digitando l'URL. Regressione formale accettata, documentata nel router.

### Cosa resta
- `foodcost_recipes` (28 endpoint) e `foodcost_matching` (18): servono due decisioni. L'archivio ricette e' letto anche dal composer preventivi, che e' aperto a sala/sommelier/contabile — quindi la lettura non puo' essere solo cucina.
- Le route in `App.jsx` che **non passano il `sub`**: `/prenotazioni/tavoli`, `/prenotazioni/impostazioni`, `/acquisti/proforme`. Dichiarate admin in `modules.json`, di fatto aperte a sala/sommelier/contabile. **E' lo stesso identico bug del modulo Dipendenti, in altri due moduli.** Marco non ha ancora deciso se stringerle: sistemarle toglie alla sala i tavoli e la config prenotazioni.
- La coda: `menu_templates`, il residuo di `tasks` e `bevande`, il seed `modules.json` orfano.

## SESSIONE 2026-09-01 (seconda parte) — M.G fase 1 + i 3 endpoint pubblici `[core]`

Seguito diretto della sessione qui sotto: chiusi i due prerequisiti prima di toccare gli altri moduli.

### M.G fase 1 — `app/services/permessi.py` (mattone platform)
Il mattone permessi era in `architettura_mattoni.md` da sempre, mai costruito. L'audit ha dato la spinta: 8 helper di guardia diversi reinventati router per router, e 636 endpoint fermi a `Depends(get_current_user)`.

Quattro forme d'uso, per coprire i casi veri trovati nell'audit:
- `user=Depends(richiede_ruoli("admin","contabile"))` nella firma — sta in OpenAPI e si vede senza leggere il corpo
- `APIRouter(dependencies=[Depends(solo_admin())])` su tutto il router — il default diventa chiuso, si aprono le eccezioni
- `verifica_ruoli(user, "admin", cosa="…")` nel corpo — quando il permesso dipende da un dato a runtime
- `ha_ruoli(user, "admin")` — per decidere **cosa** restituire invece che **se** (è il caso di `list_dipendenti`, che ai non-admin esce ridotto)

Due scelte deliberate:
- **`superadmin` implicito dove c'è `admin`**, specchio di `is_admin()` e di `roleMatch()` nel frontend. Dimenticarlo taglierebbe fuori il superadmin, ed è un errore che si fa una volta ogni due router.
- **Nomi ruolo validati all'import**, contro `VALID_ROLES`. `richiede_ruoli("sommellier")` fa fallire il boot con un messaggio chiaro. È il vantaggio vero su un `if` a mano: lì un typo diventa un permesso che non matcha mai, o — in un `not in` scritto storto — una porta aperta che nessuno nota. Testato: typo e lista vuota sollevano, `solo_superadmin()` esclude davvero `admin`.

**Le 59 guardie di Dipendenti ora delegano qui.** I `_require_admin()` / `_require_turni_write()` restano nei router come nomi parlanti, ma il corpo è una riga verso M.G: la logica del 403 vive in un posto solo. Rimossi gli `is_admin`/`_role_of` diventati morti.

**Fase 2 (matrice ruolo × azione configurabile da UI + `<CanDo>`) resta da fare.** Quando arriverà cambierà l'implementazione di `verifica_ruoli`, non le chiamate già scritte nei router — che è il motivo per cui conviene passare di qui da subito.

### I 3 endpoint pubblici
- **`foodcost_router.py`** era un `APIRouter()` nudo e `main.py` non aggiunge dependency: i suoi due endpoint erano **su internet senza token**, e restituivano l'ultimo prezzo pagato di ogni ingrediente attivo — il listino costi dei fornitori. Chiuso ai ruoli di `ricette/ingredienti` (admin, chef, sous_chef, commis) con `dependencies=` sul router. Verificato prima: nessun chiamante, né frontend né backend.
- **`menu_router.py`**: dict hardcoded con ruoli obsoleti, nessun chiamante, la navigazione vera passa da `modules.json`. Chiuso ad admin e marcato `deprecated` **invece che cancellato** — rimuovere un router è una decisione di Marco, non un effetto collaterale di un fix di sicurezza. Se confermi, si cancellano il file e la riga `_mount("menu_router", …)` in `main.py`.

### Versione prodotto: trovato e riparato un drift
`VERSION` era fermo a **5.39** mentre `versions.jsx` diceva **5.40** (probabilmente il bump della sessione email non ha toccato il file). CLAUDE.md dice che devono coincidere: allineati entrambi a **5.41**.

### Verifica
- `python3 -m compileall` su `app/routers`, `app/services`, `main.py`: pulito.
- `pyflakes` sui 7 file toccati: solo 3 warning **preesistenti e non correlati** (`_Path` non usato in `dipendenti.py:3311`, f-string senza placeholder in `turni_router.py:810`, `List` non usato in `reparti.py:19`). Nessun nome indefinito, nessun import morto introdotto.
- Logica di `permessi.py` testata con `fastapi` stubbato (il venv del repo ha i binari macOS, qui non gira): superadmin implicito, esclusione di admin da `solo_superadmin`, typo e lista vuota che sollevano, messaggi 403 corretti nei 4 casi.
- `docs_lint.py`: zero link rotti, index completo.

### Cosa resta (invariato, ora sbloccato)
Il piano in `docs/audit_permessi_2026-09-01.md` §6: passi 1 e 2 fatti, restano PII clienti/prenotazioni (3), banca e CG (4), fiscale (5), riparazione seed `modules.json` (6), il resto degli ALTI (7). Ogni modulo ora è "applicare M.G", non "inventare la guardia".

## SESSIONE 2026-09-01 — Permessi modulo Dipendenti: il sommelier vedeva le buste paga `[core]`

**Segnalazione (Marco):** *«Il modulo dipendenti non è ben protetto nei moduli. Nonostante faccia esempio il sommelier possa vedere solo i propri turni in realtà vede tutte le buste paga»*.

### Diagnosi — tre livelli aperti, non uno

1. **`DipendentiNav.jsx`** mostrava tutti e 8 i tab a chiunque vedesse il modulo. Il sommelier entrava da «Turni» e trovava «📋 Buste Paga» lì da cliccare: non doveva nemmeno inventarsi l'URL. (Il dropdown dell'header invece filtrava — `check: "admin"` in `modulesMenu.js`.)
2. **`App.jsx`**: tutte e 12 le route erano `<ProtectedRoute module="dipendenti">` **senza `sub=`**. In `modules.json` i sotto-moduli `buste-paga`/`anagrafica`/`scadenze`/`costi` erano già dichiarati solo admin, ma quel permesso non veniva mai letto. Il modulo Vini lo fa correttamente da sempre: svista di quando è nato Dipendenti.
3. **Backend**: 60 endpoint fra `dipendenti.py` e `turni_router.py` con solo `Depends(get_current_user)` = qualsiasi ruolo autenticato. `modules.json` è letto **solo** dal frontend: nasconde la voce di menu, non chiude l'endpoint. Anche sistemando 1 e 2, l'API restava aperta a chiunque avesse un token.

### Decisioni (Marco)
- Buste paga e costi: **solo admin + superadmin** (il contabile resta fuori).
- Il personale vede i **turni di tutti**, non solo i propri.
- Estendere l'audit a tutti i router.

### Fatto — dipendenti 2.32 (DA PUSHARE, nessuna migrazione)

**Backend — 59 guardie.** Helper locali `_require_admin()` / `_require_turni_write()` per router, coerenti col pattern già usato da `users_router` e `vini_magazzino_router`.
- **`dipendenti.py` (33)** — admin su buste paga, cedolini PDF, import paghe, scadenze, documenti, costi, impostazioni, scrittura anagrafica. `GET /dipendenti/` resta aperto (le viste turni hanno bisogno dei nomi) ma ai non-admin **toglie** iban, codice fiscale, telefono, email, indirizzi, note, codice comunicazione, is_amministratore (`CAMPI_ANAGRAFICA_RISERVATI`) e ignora `include_inactive`.
- **`turni_router.py` (14)** — scrittura admin (template compresi, sono uno strumento di redazione), 10 letture aperte, `/riepilogo-dipendenti` admin (restituisce i telefoni). `/miei-turni` resta self-service.
- **`intermittenti_router.py` (9)** — tutto admin: l'elenco ha CF e codici comunicazione, e `POST /comunica/` manda la comunicazione UNI al **Ministero** — un atto legale che partiva col token di un commis.
- **`reparti.py` (3)** — lettura aperta (filtri turni), scrittura admin.

**Frontend.**
- `App.jsx`: `sub=` su tutte le 12 route + sui target di `ModuleRedirect` (senza, il redirect mandava tutti sulla Dashboard).
- `DipendentiNav.jsx` v1.2: ogni tab dichiara il suo `sub` e si nasconde via `canAccessSub`.
- `FoglioSettimana.jsx`: flag `puoModificare`, celle e dot assenze inerti, chip «👁️ Sola lettura», nascosti Pubblica / Invia WA / Copia settimana / Template.
- `authHelpers.js`: nuovo `isTurniWriterRole()`, specchio di `RUOLI_SCRITTURA_TURNI`. **Non** `isAdminRole`, che include `contabile` (escluso dal backend) → bottone visibile e 403 garantito. Stesso motivo per cui esiste `isViniManagerRole`.
- `Header.jsx`: il dropdown deduceva la chiave del sotto-modulo dal path. Per `/dipendenti/dashboard` deduceva `"dashboard"`, che non è un sub di `modules.json` → `canAccessSub` ricadeva sui permessi del **modulo** (= tutti) e la voce restava visibile a chiunque, per poi rimbalzare. Ora una voce può dichiarare `sub` esplicito.

### Verifica
- Parse: AST Python sui 4 router, `@babel/parser` sui 6 file frontend. Tutti OK.
- Posizione delle guardie verificata via AST su tutte le funzioni toccate: sempre statement top-level, subito dopo la docstring, mai dentro un `if`/`try`, mai dopo una query.
- Coerenza `sub` chiave per chiave contro `app/data/modules.json` **e** `DEFAULT_MODULES`: nessuna chiave inesistente, la protezione non salta in silenzio da nessuna parte.
- Revisione incrociata (subagent) sui consumatori frontend: nessuna pagina non-admin legge i campi ora rimossi da `GET /dipendenti/`; nessuna chiamata HTTP backend→backend verso gli endpoint protetti; gli alert M.F che linkano `/dipendenti/scadenze` hanno già `dest_ruolo='admin'`.
- Tre regressioni trovate dalla revisione e sistemate nella stessa sessione: dot assenze cliccabili in `OrePanel`, voce Dashboard morta nel dropdown, `/dipendenti/turni-legacy` (editor senza gating) spostato ad admin.

### ⚠️ Trappola da ricordare: il seed `modules.json` è orfano
`MODULES_SEED_FILE = locale_data_path("modules.json")` punta a `locali/tregobbi/data/modules.json`, che **non esiste**. Il file `app/data/modules.json` non viene più letto da nessuno: in produzione vale il `modules.runtime.json` già scritto (o `DEFAULT_MODULES` hardcoded). **Conseguenza: aggiungere un sotto-modulo nuovo a `modules.json` oggi non ha effetto**, e una chiave `sub` inesistente fa ricadere `canAccessSub` sui permessi del modulo — cioè tutti, in silenzio. Per questo qui sono state usate solo chiavi già esistenti (`/dipendenti/dashboard` → `buste-paga`, Intermittenti e Reparti → `impostazioni`).

### Audit collaterale su tutti i 56 router → `docs/audit_permessi_2026-09-01.md`
**836 endpoint, 636 (76%) aperti a qualsiasi ruolo autenticato.** Con 9 ruoli in `VALID_ROLES`, oggi un `viewer` ha gli stessi poteri di un `superadmin` su banca, controllo gestione, clienti, prenotazioni e fatture. I tre peggiori: `GET /clienti/export/google-csv` (nome, email, telefono, compleanno di ~5.900 clienti in un CSV), `PUT /controllo-gestione/uscite/{id}/iban` (riscrive l'IBAN beneficiario di un pagamento fornitore), `POST /fic/connect` (sovrascrive il token Fatture in Cloud). E **3 endpoint pubblici per errore**, senza alcun token: `GET /foodcost/ingredienti` e `/foodcost/ingredient/{id}` espongono il listino costi fornitori; `GET /menu/` è codice morto da cancellare.

**Nota storica:** `banca_router` e `fe_import` erano già CRIT nell'audit 2026-06-12 come «pubblici senza auth». L'autenticazione è stata aggiunta a livello router, il **ruolo** no: quel fix si è fermato a metà.

**Decisioni PO aperte:**
1. Da dove ripartire — i 3 pubblici sono i più urgenti (non serve nemmeno un account), ma il vero sblocco è il mattone **M.G**: una dependency `require_roles()` invece di 8 helper reinventati router per router. Senza, ogni fix successivo è un'altra guardia scritta a mano.
2. La scrittura turni: oggi è admin. Se il responsabile di sala compila il foglio, servono `"sala"` in tre punti (le due `RUOLI_SCRITTURA_TURNI` + `isTurniWriterRole`).
3. Il contabile e le buste paga: escluso per decisione, ma il drill-down da Conto Economico verso `/dipendenti/buste-paga` ora gli rimbalza alla Home.

## SESSIONE 2026-09-01 — Mescita reversibile: la ✕ toglie il vino dalla carta `[core]`

**Segnalazione (Marco):** *«quando in vendita apro un vino per i calici questo viene messo in carta con il flag "in mescita" perfetto. quando viene finita la bottiglia io manualmente vado a cliccare sulla ✕ dei vini aperti, e il vino andrebbe tolto dalla carta (è finito, non è più in mescita) ma in realtà rimane, resta in lista ma viene tolto il tag "In mescita"».*

### Diagnosi
`vini_repository.load_vini_calici` include `VENDITA_CALICE = 1 OR BOTTIGLIA_APERTA = 1`. Due flussi di apertura accendevano **entrambi** i flag:
- `ViniVendite.jsx` — conferma di `DecidiPrezzoCalice`: `if (vino.VENDITA_CALICE !== 1) extra.VENDITA_CALICE = 1`
- `SchedaVino.jsx` — `toggleBottigliaAperta`: stesso set all'accensione

La ✕ (widget Calici, Regia calici, CartaStaff, Cantina mobile) manda solo `BOTTIGLIA_APERTA: 0`. Risultato: spariva il tag, ma `VENDITA_CALICE=1` — che è **anagrafica permanente**, non stato del momento — teneva il vino in carta al calice finché aveva giacenza.

Il set era anche **ridondante**: la carta prende già le bottiglie aperte, l'apertura ci entrava da sola. Non serviva nemmeno al fix 2026-06-24 (Marco #1310) che l'aveva introdotto: quello riguardava il widget Calici, che filtra su `BOTTIGLIA_APERTA` e basta.

### Decisione (Marco)
Non sporcare l'anagrafica: i flussi di mescita scrivono **solo `BOTTIGLIA_APERTA`**. `VENDITA_CALICE` resta la scelta esplicita «questo vino sta sempre al calice» e si cambia solo in anagrafica. Nessuna bonifica automatica dello storico — Marco ripulisce a mano dalla lista qui sotto.

### Fatto — vini 3.87 (DA PUSHARE, solo frontend)
- **`ViniVendite.jsx`** — rimosso il set di `VENDITA_CALICE`. Aggiunto `prezzoCaliceSalvato()` che precompila il modale con il `PREZZO_CALICE` già deciso; `defaultPrezzoCalice()` resta `PREZZO_CARTA/5` perché è il riferimento delle soglie.
- **`SchedaVino.jsx`** — `toggleBottigliaAperta` manda solo `BOTTIGLIA_APERTA`; testi del riquadro mescita riscritti (non promettono più l'ingresso in anagrafica).
- **`DecidiPrezzoCalice.jsx`** — nuova prop **opzionale** `prezzoIniziale` (retrocompatibile): precompila il campo **senza spostare** `defaultPrezzo`, così le zone «nota obbligatoria» (−, +40%, +50%) restano ancorate a `PREZZO_CARTA/5` come prima. Testo del modale ripulito dal gergo `VENDITA_CALICE ≠ SI`.
- **`CartaVini.jsx` (Regia calici) + `CaliciDisponibiliCard.jsx`** — le conferme dicevano «sparirà se non ha giacenza», ora dicono la verità: esce dalla carta, a meno che non sia un vino sempre al calice.
- **Nessuna modifica backend, nessuna migrazione.** `CartaStaff` e `CantinaMobile` erano già corretti (mandavano solo `BOTTIGLIA_APERTA`).

### Verifica
- Parse `@babel/parser` (jsx) sui 5 file toccati: OK.
- Grep di controllo: nessuna scrittura residua di `VENDITA_CALICE` fuori dall'edit anagrafica (`SchedaVino` FlagToggle + `saveAnagrafica`, wizard NuovoVinoV2, import xlsx).
- Query sul DB locale: **31 bottiglie** con `VENDITA_CALICE=1` e mescita spenta — cioè in carta al calice senza calice. Tutte con `PREZZO_CALICE_MANUALE=1` tranne una (id 1317, Blauburgunder), impronta dell'apertura estemporanea.
- Script di bonifica provato su copia del DB: dry-run (nessuna scrittura), apply (15 flag spenti, 15 movimenti tracciati, giacenze e bottiglie aperte invariate, `integrity_check ok`), rilancio (0 da fare — idempotente), e tre casi di abort forzati (descrizione diversa, produttore diverso, bottiglia aperta) che escono senza scrivere e senza creare backup.

⚠️ **Nota di metodo:** a metà sessione il DB locale è stato risincronizzato da un push di un'altra sessione (file riscritto alle 14:30). La prima lista mostrata a Marco era di uno snapshot vecchio: 21 vini invece di 31, con giacenze diverse. **Rileggere il DB al momento di decidere, non fidarsi di una query fatta 20 minuti prima** — vale per qualunque lavoro su dati mentre girano sessioni parallele.

### Bonifica dello storico — `scripts/bonifica_calici_2026-09.py` (DA LANCIARE SUL VPS dopo il push)
Marco ha rivisto i 31 uno per uno. **15 da spegnere**, 16 restano al calice fissi.

Da spegnere: 1187 Bakkanali KANI · 1238 Lagrein St. Michael · 1303 Bordeaux Lavergne · 1316 Champagne Jaffelin · 1185 Bakkanali ROSA · 1251 Pinot Nero Maculan · 1307 Crémant Limoux · 1318 Chardonnay Festival Merano · 1206 Pinot Grigio Lapis Argentum · 1320 Chardonnay Martina Magri · 559 Pinot Nero Colterenzio · 1285 Côtes du Rhône Pasquiers · 1197 Champagne Brut Tradition · 1312 Vieris Vie di Romans · 1243 Cabernet Franc Brandolini.

Restano al calice: 1317, 1294, 107, 1214, 1264, 1310, 1241, 818, 1240, 1250, 1059, 1242, 1192, 1296, 1222, 1266, 1295, 1313 e gli altri già in mescita. (1311 Lugana Montunal risultava già spento tra i due giri.)

Lo script: dry-run di default, `--apply` per scrivere, backup WAL-safe prima di toccare, validazione id+descrizione+produttore, abort se una bottiglia è aperta in quel momento, traccia in timeline come movimento `MODIFICA` con nota `[BONIFICA-CALICI]`, sanity check finale su `ATTESI_DOPO = 16` (se ne restano di più, il fix 3.87 non è in produzione).

## SESSIONE 2026-08-21 — Cantina mobile: filtro scaffali + movimentazione in scheda `[core]`

**Richieste (Marco), in ordine:** *«gestione vino / cantina mobile. se clicco su "scaffale" mettimi un filtro per cercare lo scaffale o il frigo da vedere»* → *«ricordati che la cantina mobile è utilizzata sugli iPhone, migliorami la grandezza del testo, anche i colori»* → *«se clicco sul vino dobbiamo migliorare l'esperienza d'uso di quella pagina. Ok dove si trova, ma va migliorata la parte della movimentazione..fammi proposte»*.

**Decisioni prese da Marco sulle proposte:** pacchetto operativo (barra azioni + righe locazione operative + timeline leggibile + toggle mescita); scrittura riservata a **sommelier + admin**; il tasto «venduta» scrive **VENDITA** (entra nelle statistiche di vendita).

### Fatto — vini 3.85 (già pushato, commit `7d437a2b`)
Modo «Per scaffale» del finder: searchbar sul nome locazione (matcha anche le etichette contenute, così «barbera» mostra in quali scaffali sta), chip categoria Scaffali/Frigo/Matrice/Altro con conteggio locazioni, accordion con una locazione aperta per volta (prima srotolava tutta la cantina), totale bottiglie nel titolo di ogni locazione.

### Fatto — vini 3.86 (DA PUSHARE)
- **`CantinaMobile.jsx` v1.2** — la scheda registra movimenti. Barra azioni fissa in fondo (venduta −1 / carico / conta) con `env(safe-area-inset-bottom)`, bottom sheet «da dove?» quando i posti sono più d'uno, stepper quantità a tasti grandi (66px) con tastierino numerico, toast **Annulla 8s** che chiama `DELETE /vini/magazzino/movimenti/{id}`. Righe di «Dove si trova» toccabili → sheet azioni sul posto (vendita / scarico / carico / conta). Timeline movimenti aperta, raggruppata per giorno, con ora, utente, origine e **giacenza risultante** ricostruita a ritroso dal totale attuale (`saldiMovimenti`), più «annulla» sull'ultimo movimento. Toggle mescita in scheda (`PATCH /bottiglia-aperta`, che il backend concede anche a `sala`).
- **`utils/authHelpers.js`** — nuovo `isViniManagerRole(role)`, specchio esatto di `is_vini_manager()` (admin/superadmin/sommelier). Serviva perché `isAdminRole` include `contabile` ed esclude `sommelier`: usarlo qui avrebbe dato i permessi alla persona sbagliata in entrambe le direzioni.
- **Tipografia/colori** per l'uso su iPhone in cantina: corpi +2px circa (il Cormorant ha occhio piccolo), secondari da `#8a7a65` a `#6b5c46`, terracotta da `#a04000` a `#8f3800`, touch target 44–56pt, `font-size:17px` di base sul root e 18px sugli input (sotto i 16px iOS zooma da solo al focus).
- **Nessuna modifica backend**: usa `POST /vini/magazzino/{id}/movimenti`, `DELETE /movimenti/{id}`, `PATCH /{id}/bottiglia-aperta` così com'erano.

### Due invarianti di sicurezza dati (decise qui, motivate)
1. **La conta corregge per DELTA sul posto**, con `CARICO`/`SCARICO` e nota `[CONTA]` — **mai con RETTIFICA**. In `registra_movimento` la RETTIFICA è un valore assoluto **globale** e nel ramo `else` lascia le `QTA_<LOC>` invariate: usarla dal telefono avrebbe sfasato `QTA_TOTALE` dalla somma dei posti, cioè esattamente il dato che questa pagina serve a tenere in ordine.
2. **La matrice (loc3) resta read-only da mobile.** Un CARICO su loc3 muove `QTA_LOC3` senza toccare `matrice_celle`, e uno SCARICO senza `celle_matrice` fa lo stesso al contrario: senza griglia a schermo si accumulerebbe drift silenzioso. Dal telefono la matrice si legge; per spostarla c'è il gestionale.

### Verifica
- Parse con `sucrase` su `CantinaMobile.jsx` e `authHelpers.js` dopo ogni blocco di modifiche.
- `saldiMovimenti` provata a mano su una sequenza mista (vendita, carico, vendita, modifica, rettifica, carico): saldi `[5,6,0,2,8,null]` — la catena si chiude sotto la RETTIFICA invece di inventare un numero, `MODIFICA` è no-op. `giornoLabel` verificata su oggi/ieri/data vecchia/null.
- **Doppio tap**: la guardia era su stato React (`busy`), che si aggiorna al render successivo → due tap nello stesso frame passavano entrambi (= doppia vendita). Aggiunta `busyRef` che si alza prima della fetch, su tutte e tre le scritture.
- Dopo il POST si **ricarica da `/vini/v2/bottiglie/{id}`** invece di usare `data.vino` della risposta: quella è la riga grezza di `vini_bottiglie` e non ha i campi in join (produttore, regione, denominazione) che l'hero mostra — l'avrebbe svuotato a schermo.
- `npm run build` **non lanciabile da remoto**: da fare prima del push.

### Resta da fare
Fase 3 «conta d'inventario a tappeto» (giro completo con lista di spunta), che è cosa diversa dalla conta sul singolo posto fatta qui.

## SESSIONE 2026-08-08 — Gift Card `[core]`

**Richiesta (Marco):** *«Ho bisogno di una funzione nel modulo clienti per creare delle gift card, soprattutto per gestirle con dei codici e con uno "scarico/annullamento" della gift card usata. Attualmente usavo un Excel.»*

**Decisioni prese da Marco in apertura:**
1. **Uso unico**, non saldo residuo multi-uso.
2. **Entrambi i tipi**: a valore e a esperienza.
3. Scarico da **pagina dedicata con ricerca per codice**.
4. Extra richiesti: **scadenza + alert**, **PDF stampabile**. Gift card anonima non richiesta (risolta con `intestatario_nome` testo libero, che serve comunque per l'import dello storico).
5. **Contabilità: registro separato dalla cassa.** Né emissione né scarico toccano corrispettivi o chiusure turno.

### Fatto
- **`app/models/clienti_db.py`** — `clienti_giftcard` + `clienti_giftcard_movimenti` (log append-only), indici, trigger updated_at, 4 impostazioni in `clienti_impostazioni`. Create da `init_clienti_db()` con IF NOT EXISTS, nessuna migrazione di schema. **UNIQUE index sulla forma normalizzata del codice** oltre al UNIQUE di colonna: `TG-1234` e `tg1234` sono lo stesso buono in mano al cliente, il vincolo di colonna da solo li accetterebbe entrambi.
- **`app/routers/clienti_giftcard_router.py` (NUOVO)** — prefix `/clienti/giftcard`. Lista+filtri, `stats`, `impostazioni`, `lookup/{codice}`, dettaglio con movimenti, POST emissione, PUT modifica (il **codice non è modificabile**: è già stampato sul buono), `scarica`, `annulla`, `riattiva` (solo admin), `pdf`, DELETE (solo admin). `lookup` risponde **sempre 200** con `trovata`: "codice inesistente" è un esito da mostrare al banco, non un errore HTTP.
- **`app/services/giftcard_pdf_service.py` (NUOVO)** — A5 orizzontale, identità del locale da `branding.json` → `client_pdf`. **Non usa M.B `pdf_brand`**: quello è il brand del gestionale, il buono va in mano al cliente (stessa logica della carta vini). Degrada a buono neutro se `branding.json` manca, invece di 500 al banco.
- **`alert_engine.py`** — checker `giftcard_scadenza` + **mig 166** per il seed `alert_config` (30 giorni, antidup 168h). Una notifica riepilogativa, non una per card.
- **`ClientiGiftCard.jsx` (NUOVO)** — banco (campo codice grande, autofocus, verdetto a colori, scarica + auto-reset) e ufficio (numeri, filtri, elenco, emissione, dettaglio con storico) nella stessa pagina. Primitives M.I riusati. Tab in `ClientiNav`, route in `App.jsx`, voce in `modulesMenu.js`, sub `giftcard` in `modules.json` **e** in `DEFAULT_MODULES`.

### Nota semantica (applicata la lezione degli stati pagamento)
`stato` = ciclo di vita (`attiva`/`usata`/`annullata`). La **scadenza è una dimensione separata**, derivata da `data_scadenza` in `scaduta`/`spendibile`. **Non esiste `stato='scaduta'`**: una card scaduta resta `attiva`, così è prorogabile senza resuscitare uno stato e i filtri restano query sulla data. Nella UI sono due chip distinti.

### Verifica
- `compileall` su 7 file backend; schema eseguito su DB temporaneo (tabelle, indici, trigger, FK, `integrity_check ok`).
- **19 asserzioni verdi** su DB di prova con 6 card in tutti gli stati (spendibile, in scadenza, scaduta-ma-attiva, usata, annullata, senza scadenza), eseguendo le SQL vere del router: filtri lista, conteggi stats, `valore_spendibile` = 150 (esclude correttamente la scaduta da 75 e l'annullata da 30), `in_scadenza` a 30 giorni, lookup normalizzato su 4 grafie diverse dello stesso codice, campi derivati `scaduta`/`spendibile` su tutti i casi, query del checker alert. Verificato anche che l'indice UNIQUE normalizzato **rifiuta** `tgaaaa1111` quando esiste `TG-AAAA-1111`.
- PDF: `weasyprint` non è installabile nell'ambiente remoto, quindi generazione provata con il motore mockato — verificati HTML e CSS prodotti su 3 casi (valore intero, valore con decimali, esperienza), branding letto davvero da `locali/tregobbi/branding.json`, escaping HTML sulle note, font Cormorant trovati. **Il rendering vero va guardato dopo il push.**
- Parse JSX con `@babel/parser` su 4 file. `npm run build` **non lanciabile da remoto** — serve prima del push.

### Storico Excel (CL.16) — prima come feature, poi travaso one-shot

⚠️ **Due commit sullo stesso lavoro, leggere in ordine.** `547f9761` aveva introdotto un import da UI (service + endpoint + modale con anteprima). Marco: *«no no togli l'import da excel»* e poi *«importa tu ora i dati e stop, è solo one shot»*. Il commit successivo **rimuove** service, endpoint e modale, e mette i dati in una **migrazione one-shot 167** (`TRGB_SPECIFIC`, record embedded). Motivo: era un trasloco, non una funzione di prodotto.

Nota operativa: `push.sh` **scarica** i DB dal VPS, non li carica. Scrivere sul `clienti.sqlite3` locale non sarebbe arrivato in produzione: la migrazione è l'unico modo per far entrare i dati al deploy.

Cosa resta della modifica al modello: **l'importo si conserva anche su `tipo='esperienza'`** (era in `547f9761`, mantenuta). Serve proprio a queste card: 85 delle 90 importate sono esperienze con un valore incassato.

**Marco:** *«la logica della gift è A1 seguito dall'anno - numero progressivo»*. Questa informazione ha cambiato il taglio dell'import: la serie **A124 è stata aperta a dicembre 2023** per i regali di Natale, quindi 26 buoni hanno data 2023 ma codice 2024. Filtrando per data si sarebbero persi **18 buoni ancora attivi per 3.535 €**. Marco ha scelto di far vincere l'anno del codice.

**5 regole decise da Marco:** anno dal codice (soglia 2024) · importo obbligatorio, dedotto dalla descrizione se la colonna è vuota (`deg 130` → 130 €) · righe senza importo fuori · codici doppi: vince l'importo più alto · importate senza scadenza.

**Codici delle card nuove (correzione in corsa).** Marco: *«la creazione di nuove gift segue la logica che ci siamo detti?»* — no: il generatore faceva codici casuali `TG-4KMP-9XQD`. Rifatto sullo schema reale `<lettera>1<AA>-<progressivo>` (`B126-354`): lettera da impostazione (bollettario, la cambia solo Marco), anno corrente, progressivo `MAX+1` su **tutte** le card comprese usate e annullate — un numero gia' stampato non va riassegnato. Il progressivo **non si azzera a Capodanno** (281 nel 2024, 341 nel 2025, 353 nel 2026). Mig **168**: `giftcard_prefisso` da `TG` a `B`, solo se non gia' personalizzato. `GET /impostazioni` espone `prossimo_codice`, mostrato in emissione.

**Scadenza retroattiva — mig 169.** Marco: *«flagga come scadute tutte quelle prima del 1/01/2025»* → **non** uno stato inventato (non esiste `stato='scaduta'`), ma `data_scadenza='2024-12-31'` sulle attive emesse prima del 2025: **56 card per 10.540 €** scadute, **18 per 2.285 €** ancora spendibili. Restano `attiva`, quindi prorogabili dalla scheda invece che da resuscitare. Le usate non si toccano.

> **Perché una migrazione separata e non una modifica alla 167:** la 167 era già stata deployata (`510ae547`) quando è arrivata la richiesta. Una migrazione applicata non viene rieseguita, quindi modificarla non avrebbe avuto effetto in produzione — oltre a essere vietato dalle convenzioni. Prima stesura dei dati con la scadenza dentro la 167 → annullata e rifatta come 169.

**Esito:** 90 card entrate (74 attive, 16 usate), 84 righe escluse (46 pre-2024, 35 senza importo, 1 doppio, 1 senza codice, 1 senza anno). Ogni card ha un movimento `import` che conserva il perché delle interpretazioni.

**Verificato sulla COPIA del `clienti.sqlite3` reale** (25.008 clienti, 32.513 prenotazioni): mig 167 e 168 eseguite due volte di fila → idempotenti; risultato **18 spendibili (2.285 €), 56 scadute, 16 usate**; `integrity_check ok`; clienti e prenotazioni intatti; lettera di serie `TG → B`; generatore che propone `B126-354` sul DB con lo storico dentro, e `B126-359` dopo un codice manuale fuori sequenza. Casi sporchi: `20/'5/2'23` → 20/05/2023, `29/02/2023` (data che non esiste, il 2023 non è bisestile) → segnalata invece che inventata, la card entra con l'anno del codice.

### Grafica del PDF — vista davvero e corretta (3 difetti)

Marco: *«com'è la grafica del pdf?»*. Finora il PDF non era mai stato **guardato**: `weasyprint` non era disponibile in ambiente remoto e la verifica era stata fatta col motore mockato (HTML/CSS prodotti, non il risultato). Installato weasyprint nel sandbox e generato per davvero → tre difetti, tutti corretti e verificati sul PDF finale:

1. **Font mai applicato.** `@font-face` da `file://` ignorato in silenzio: `pdffonts` mostrava Liberation Serif, non Cormorant. Rimedio: dichiarare anche la famiglia di sistema in `font-family`, come fa il CSS del menu pranzo con Sabon. Ora `pdffonts` dice `Cormorant-Garamond` + `Bold` + `Italic`.
2. **Contenuto schiacciato in alto**, un terzo di pagina vuoto: `display:table` + `vertical-align:middle` **non centra** su WeasyPrint (testo a y=22 su 350px). Rifatto con flexbox → centro del testo a y=300 su pagina 320.
3. **`€ 100` si leggeva `€ IOO`**: Cormorant usa cifre old-style. `font-feature-settings: "lnum" 1` su importo, codice e date.

Sistemata anche la cornice, che con `@page margin:0` + `outline-offset` finiva tagliata dal bordo foglio: ora margine di pagina 7mm e filetto doppio interno.

**Lezione generalizzabile:** un PDF non è verificato finché non lo si è guardato. Il mock del motore di rendering conferma solo che le stringhe sono giuste. Vale per i prossimi PDF del progetto.

### Bug preso in produzione — PDF `{"detail":"Not authenticated"}`
`apriPdf` usava `window.open(${API_BASE}/clienti/giftcard/{id}/pdf)`: una scheda nuova non porta l'header Authorization, quindi l'endpoint autenticato rispondeva 401 in JSON. Rifatto con `apiFetch` + blob + download, come il PDF preventivi. Scartata l'alternativa `?token=` (usata in `RicetteSettings` e `ViniImpostazioni`): mette il JWT nella cronologia del browser.

### Aperto
- Nessun tab Gift Card nella scheda cliente (CL.17).
- Restano nel repo altri `window.open` su endpoint autenticati con `?token=` in URL (`RicetteSettings.jsx:284`, `ViniImpostazioni.jsx:314,327`, `GestioneVino2.jsx:78`, `CantinaTools_legacy.jsx:237`): funzionano, ma è JWT in chiaro nella cronologia. Da valutare se uniformare al pattern blob.
- Le 35 righe senza importo (per lo più "BOX" o vuote) restano fuori per scelta di Marco: se ritrova gli scontrini si inseriscono dalla UI, il campo codice accetta il codice originale.
- Le card importate non hanno intestatario: l'Excel non lo registrava (la colonna Utente è chi ha venduto). Al banco si riconoscono dal codice.
- **`A125-330` da controllare a mano:** serie 2025 ma data 08/12/2024 (la gemella scartata diceva 08/12/2025), quindi è finita fra le scadute. Se è del dicembre 2025 va prorogata dalla scheda.
- **Da controllare dopo il deploy:** migrazioni 167 e 168 in `schema_migrations`, pagina che mostra **18 spendibili per 2.285 €** e 56 scadute, e che una card nuova esca `B126-354`.
- **Trovato di passaggio:** `modules_router.MODULES_SEED_FILE` punta a `locali/<id>/data/modules.json`, ma in git è tracciato solo `app/data/modules.json`. Il sub `giftcard` è stato messo in entrambi per sicurezza, ma va chiarito quale è davvero il seed letto in produzione (§15.6 di `modulo_clienti_crm.md`).

### Commit
`[mixed] CL.16 storico via mig 167 + scadenza retroattiva + codici di serie (mig 168) + rimozione import da UI` (questo)
`[core] CL.16 import da Excel` → **547f9761** (poi rimosso, vedi sopra)
`./push.sh "[core] CL.15 Gift Card — emissione a valore/esperienza, codici leggibili al telefono, verifica al banco e scarico a uso unico, annullo/riattiva tracciati, PDF A5 con identita' del locale, alert scadenza M.F (mig 166), clienti 3.1"`

---

## SESSIONE 2026-08-08 — RD.1: il widget vini diventa il selettore del riordino `[core]`

**Richiesta (Marco):** *«il widget "vini attivi in carta senza giacenza" deve diventare un primo selettore sul riordino. Se flaggo da ordinare lo evidenzi nel widget ordini e nel widget riordini per fornitore; se flaggo ordinato dovrebbe già metterlo in ordine che poi vado a riprendere; se flaggo annata esaurita o non ricomprare non viene più proposto.»*

**Correzione in corsa (Marco, importante):** la prima versione usava una soglia in bottiglie (`QTA_TOTALE <= N`). *«La soglia numerica non mi serve a nulla, ci sono vini importanti che è normale avere in una sola bottiglia. Il senso va ragionato sul consumo.»* Rifatto su **copertura in giorni** = giacenza × finestra ÷ vendite nella finestra. Chi non vende nella finestra non entra mai.

### Fatto
- **`app/services/vini_riordino_service.py` (NUOVO)** — fonte unica di "cosa riordino": `sql_da_riordinare()` (condizione SQL con subquery inline, sta in un `WHERE` senza wrapping), `parametri_riordino()`, `copertura_giorni()`. Sostituisce `QTA_TOTALE = 0` copiato in 4 query: widget alert + `riordini_per_fornitore` (`vini_magazzino_db`), `fornitori_con_lavoro` + `da_ordinare` (`vini_ordini_db`). Aritmetica intera (`qta * finestra < copertura * vendite`) per non dividere per zero.
- **Setting `alert_carta_giorni_copertura`** (default 21) + **migrazione 165**: sync `INSERT OR IGNORE` di `vini_widget_settings` su `WIDGET_DEFAULTS`. Recupera anche le 4 chiavi ordini di O5 che erano nel service ma non in tabella — quindi leggibili in codice e **non editabili da UI**, perché `set_widget_setting` rifiuta le chiavi assenti. Gruppo "🛒 Widget riordino" + "📦 Ordini ai fornitori" in `ViniImpostazioni`.
- **Flag `0` Ordinato → riga in bozza** del fornitore con `qta_suggerita`, via `POST /vini/ordini/riga/`. Nuovo campo `preserva_qta` su `RigaPayload` (default `false`): l'automatismo non sovrascrive una qta già scelta a mano nel carrello. Non bloccante: se fallisce, lo stato resta salvato e il toast dice cosa non è successo. Il semaforo 📦 Ordini si ricarica da solo (`refreshKey`).
- **Colori per stato riordino** (da `viniConstants`, non reinventati) su widget riordini per fornitore e `RigaDaOrdinare` in `/vini/ordini`, + chip «📝 da ordinare» / «📦 segnato ordinato». Ogni riga porta giacenza **e** copertura (`🍷 2 bt · ~9gg`). Banner rosso solo se c'è un esaurito, altrimenti ambra.
- `setStatoRiordino` ora aggiorna lo stato locale di **entrambe** le liste (prima solo `alert_carta_senza_giacenza`: il chip nel widget fornitori restava indietro).

### Verifica
- `compileall` su 5 file backend; parse JSX (`@babel/parser`) su 3 pagine. `npm run build` **non lanciabile da remoto** — serve prima del push.
- Query sul DB reale (`locali/tregobbi/data/vini_magazzino.sqlite3`, 1316 vini in carta, 423 bt/60gg): copertura 0→55 righe, 14→56, **21→60 (54 esauriti + 6 in esaurimento)**, 30→61, 45→67. Con 21gg entra p.es. Pinot Nero AA 2024 (1 bt, 7 vendute/60gg, ~9gg) e restano fuori **116 vini con 1 bt ma fermi**. Una soglia in bottiglie a 1 li avrebbe presi tutti (176 righe). Tempi 0-2 ms.
- Migrazione 165 provata su **copia** del `vini_settings.sqlite3` reale: run 1 aggiunge 5 chiavi, run 2 zero (idempotente), valori già personalizzati intatti (`calici_fresh_hours` resta 12).

### Aperto
- Il widget `riordini_per_fornitore` non espone `copertura_giorni` (la sua query non calcola la finestra vendite): la colonna Giac. resta un numero secco. Da valutare se serve.
- Resta il codice morto del vecchio modale ordine in `DashboardVini.jsx` (~145 righe, già censito in `inventario_pulizia.md`).

### Commit
`[core] RD.1 — widget vini = selettore riordino: copertura in giorni ... vini 3.81` → **PUSHATO** `f6f1cfcc`

### RD.1.1 (stesso giorno, dopo prova in produzione) — «ho flaggato, ma restano lì»

Marco ha flaggato ~10 vini col nuovo widget e la lista non si è mossa: `D` era solo un colore. Il widget non era una coda che si smaltisce e il flag più naturale da premere non portava il vino da nessuna parte.

- Il widget ora esclude **ogni** `STATO_RIORDINO` non nullo (prima solo `0/A/X`): è la lista dei non decisi.
- `D` fa quello che fa `0`: riga nella bozza del fornitore con `qta_suggerita`.
- Il vino deciso **non sparisce sotto il dito**: blocco verde «Sistemati adesso (N)» con chip `📦 in bozza · fornitore · N bt`, e sparisce al ricaricamento. Il contatore del banner scende subito (filtro locale allineato al backend).
- **Annullabile:** `bozzaRighe` tiene `{vinoId → {rigaId, fornitore, qta}}`; ri-cliccando il flag parte anche `DELETE /vini/ordini/riga/{id}`. Tocca solo le righe aggiunte da questo widget, non i carrelli composti a mano.

**Verifica del ciclo completo** su copia del DB reale (locale temporaneo `TRGB_LOCALE`): widget = 48 righe con solo stato `None`; flag `D` su #900 → bozza «Davide Previtali» 1 bt → il vino **esce dal widget** (47) e **compare in `/vini/ordini`** con `in_bozza=1`; annullo (DELETE riga + stato `NULL`) → **torna nel widget**. Cartella temporanea rimossa.

Vini 3.81 → **3.82**. Solo `vini_magazzino_db.py` + `DashboardVini.jsx`: nessuna migrazione, ma **serve `npm run build`**.

### RD.2 (stesso giorno) — contesto annate nel Monitor

Marco: *«se un vino ha un'annata nuova dovresti aiutarmi a capirlo per decidere in questo Monitor.»*

**Il dato che giustifica la feature:** 10 righe su 48 erano falsi allarmi. Non mancava il vino, era finita *quell'annata*, e la vendemmia dopo era già in cantina e in carta (Valcalepio Lyr 2022 a zero → 2023 con 30 bt; Fiano d'Avellino 2017 → 2021 con 5 bt). Quelle vanno marcate «Annata esaurita», non ordinate.

- `vini_riordino_service.arricchisci_annate(cur, righe)`: `annata_successiva` (`{id, annata, qta, in_carta}` della bottiglia più recente della stessa `madre_id`, con giacenza in cima), `altre_annate`, `ultimo_acquisto` (ultimo `CARICO` su qualunque annata della madre). **Una query per tutte le righe**, non una per vino.
- UI Monitor: chip verde cliccabile `➡️ 2023 in cantina · 30 bt` (apre la bottiglia nuova), chip neutro `➡️ esiste 2023 (0 bt)` quando anche quella è a zero, chip `📥 comprato ~14 mesi fa` / `nessun carico registrato`. Contatore nel banner: «N hanno già l'annata nuova in cantina».
- **Scelta di Marco:** restano in lista, spariscono solo quando marca lui «Annata esaurita». Niente gruppo separato, niente esclusione automatica.
- Annate non numeriche (`s.a.`, vuote — 6 righe su 48) non partecipano al confronto: verificato che nessuna riceve `annata_successiva`.

**Verifica** su copia del DB reale: 48 righe monitor in **25 ms** (con la query annate dentro), 11 righe con annata successiva in anagrafica di cui **10 con bottiglie**, `ultimo_acquisto` valorizzato su 12/48 (i carichi sono tracciati dal 03/2026 → per le altre il chip dice "nessun carico registrato", non "mai comprato", e il tooltip spiega perché). Nessun campo mancante su nessuna riga.

Vini 3.82 → **3.83**. Nessuna migrazione. **Serve `npm run build`.**

### RD.6 (stesso giorno) — il widget «Riordini per fornitore» viene assorbito dalla pagina Ordini

Marco: *«il widget riordini per fornitore lo integri con il modulo ordini? ragiona su come farli coesistere.»* → scelta: **assorbimento**.

Era il buco **B3** del piano O, che O6 aveva chiuso solo a metà: widget e pagina facevano la stessa cosa sugli stessi dati, ma solo la pagina ha carrello, invio, ricezione, storico. Il widget però era l'unico posto con tre funzioni che servono col rappresentante davanti — quindi prima si migrano, poi si spegne.

**Migrato in `/vini/ordini`:**
- **listino inline editabile** sulla riga da-ordinare (click sul prezzo → input, Invio salva, Esc annulla); il `PATCH EURO_LISTINO` alimenta `vini_prezzi_storico` da solo, niente codice nuovo lato storico;
- **duplica nuova annata** (bottone 🗓️ + modale): crea la bottiglia nuova (giacenza 0, fuori carta, `STATO_RIORDINO='0'`) **e la mette in bozza** con la qta suggerita;
- **ordinamenti** (barra «Ordina per»): urgenza (copertura crescente — nuovo), ritmo, giacenza, listino, ult. carico, ult. vendita;
- **tracciamento `A`/`X`** → sezione **«Messi da parte (N)»** chiusa di default. Nuovi: `GET /vini/ordini/archivio/?fornitore_nome=` + `vini_ordini_db.archivio_fornitore()`;
- **contesto annate RD.2** anche qui (chip `➡️ 2023 c'è (30)`), e `ultimo_carico` aggiunto a `da_ordinare`.

**Rimosso:**
- `DashboardVini.jsx` **−536 righe** (widget 328 + modale duplica 74 + state/handler orfani 134): **2233 → 1697**. Rimossi `riordSort`/`toggleRiordSort`, `mostraGiacPositiva`, i tre handler duplica e i tre listino;
- la query `riordini_per_fornitore` da `get_dashboard_stats` (**~940 righe di payload** a ogni apertura dashboard) e il campo dalla risposta;
- `includi_giacenza_positiva` **deprecato**: resta accettato e ignorato (firma + query param) perché un browser col JS in cache lo manderebbe ancora. `fetchStats()` non prende più argomenti.

**In dashboard restano due blocchi con ruoli distinti:** Monitor (si decide, per vino) e **📦 Ordini** (si vede lo stato e si sceglie con chi lavorare) — il semaforo di O6 più i **fornitori con lavoro** come chip (`nome · N da ordinare · 🛒 · 🚚`, primi 8) da `GET /vini/ordini/fornitori/`: **32 fornitori invece di 940 bottiglie**.

**Verifica** su copia del DB reale: `riordini_per_fornitore` non è più nel payload; dashboard **25 → 19 ms**; chiamata legacy con `includi_giacenza_positiva=true` non rompe e torna gli stessi dati; `da_ordinare` 332 righe in 11 ms con tutti i campi nuovi (`ultimo_carico`, `copertura_giorni`, `annata_successiva`, `PREZZO_CARTA`); `archivio_fornitore` 7 righe sui primi 6 fornitori. `compileall` + parse JSX su 3 file OK.

**⚠️ Nota che pesa adesso (RD.3):** il Monitor filtra `STATO_VENDITA >= 2`, la pagina Ordini no — «0,75 di Valentino Rossi» mostra **332 righe da ordinare**. Disallineamento pre-esistente, ma da oggi la pagina è l'unica lista per fornitore, quindi va deciso: allinearla al filtro del Monitor o tenerla larga? **Da chiedere a Marco.**

Vini 3.83 → **3.84**. Nessuna migrazione. **Serve `npm run build`.**

### Suggested commit
Due push separati, o uno solo se si preferisce (nessuna migrazione in mezzo):

`./push.sh "[core] RD.1.1 — il widget riordino e' una coda: elenca solo i vini non decisi, il flag Da ordinare mette in bozza come Ordinato, blocco verde Sistemati adesso con annullo (toglie anche la riga dal carrello), vini 3.82"`

`./push.sh "[core] RD.2 — contesto annate nel Monitor: annata_successiva + ultimo_acquisto da arricchisci_annate() (1 query), chip 'gia in cantina' cliccabile e contatore nel banner — 10 falsi allarmi su 48 smascherati, vini 3.83"` → **PUSHATO** `d7774b89` (insieme a RD.1.1)

`./push.sh "[core] RD.6 — assorbimento widget Riordini per fornitore nella pagina Ordini (chiude B3): listino inline con storico, duplica annata che mette in bozza, ordinamenti, sezione Messi da parte + endpoint archivio; via 536 righe da DashboardVini e la query riordini_per_fornitore (dashboard 25->19ms), includi_giacenza_positiva deprecato, vini 3.84"`

---

## SESSIONE 2026-08-07 — Fix: turni multi-reparto non assegnabili `[core]`

**Sintomo (Marco):** flaggato "Sala" fra i reparti extra in anagrafica, ma assegnando a sé stesso un turno in sala → 400 *"Dipendente non appartiene a questo reparto"*.

**Causa:** mig 162 ha reso multi-reparto le query di lettura (`turni_service.py`, tre costanti SQL), ma le validazioni **inline** di `turni_router.py` confrontavano ancora `dipendenti.reparto_id` secco, ignorando `dipendenti_reparti`. Limite già annotato in `modulo_dipendenti_turni.md` il 03/08 come "non ancora capitato": è capitato appena Marco ha spuntato la casella.

**Fatto:**
- nuovo helper `turni_service.dipendente_in_reparto(conn, dipendente_id, reparto_id)` — unica fonte di verità per "questa persona può avere un turno qui?" (principale OR aggiuntivo);
- `POST /turni/foglio/assegna` e `PUT /turni/foglio/{id}` (cambio dipendente) passano dall'helper;
- **bug latente sistemato di rimbalzo:** il check "slot già occupato" in `assegna` filtrava `d.reparto_id = ?`, quindi non vedeva i turni di chi sta nel reparto come aggiuntivo → due persone potevano finire sullo stesso slot senza 409. Ora usa `SQL_DIP_D_DEL_REPARTO` + `SQL_TURNO_DEL_REPARTO`, gli stessi criteri con cui il foglio decide cosa mostrare.

**Verifica:** su DB in memoria con lo schema minimo — Marco cucina+sala assegnabile in entrambi, senza il flag extra resta rifiutato, dipendente inesistente rifiutato; il suo turno di tipo SALA occupa lo slot del foglio sala e non quello di cucina. Nessuna migrazione (`dipendenti_reparti` esiste da mig 162, l'helper la crea `IF NOT EXISTS` per sicurezza).

**Nota:** solo backend, `npm run build` non serve.

## SESSIONE 2026-08-07 — Menu Carta multilingua (motore i18n) `[core]`

### Contesto
La pagina pubblica `/carta/menu` esisteva solo in italiano. Obiettivo: aggiungere la dimensione lingua a tutto lo stack (DB, API, pagina ospite, backoffice) per **it, en, fr, es, de, uk**, con l'italiano lingua madre e le altre come traduzioni. Sostituisce nel tempo il PDF stampato come canale digitale; il PDF resta italiano e non è stato toccato.

### Le tre decisioni prese con Marco prima di scrivere codice
1. **Tabella `menu_translations`**, non `menu_carta_translations`. La regola 3 del CLAUDE.md vuole il prefisso `<modulo>_*`, ma le 4 tabelle esistenti del modulo (mig 098) sono tutte `menu_*`: quello *è* il prefisso reale di `menu_carta`, e a R8 il manifesto ne dichiarerà uno solo invece di due.
2. **Il `nome` delle degustazioni resta italiano.** *"Fidati dell'oste"* è la firma della casa; "Trust the innkeeper" perde il tono e suona da traduzione. Il sottotitolo, che è discorsivo e spiega il percorso, viene tradotto e fa il lavoro.
3. **La Storia dell'oste è testo di locale**, non di edizione: andrà in `locali/tregobbi/strings.<lang>.json`. ⚠️ Emerso durante la ricognizione: **oggi quella pagina non esiste** — non è in `CartaMenuPubblica.jsx` e `menu_editions` non ha nessuna colonna `storia`. L'entità è predisposta in `menu_translations` ma inutilizzata: va progettata in sessione dedicata.

### Cosa è stato fatto — `[core]`
- **Mig 163** `menu_translations`: chiave `(entita, entita_id, lang, campo)` + `valore`, `rivisto`, `updated_at`. Una tabella sola per piatti, degustazioni ed edizioni. L'alternativa scartata (`titolo_en`, `titolo_fr`, …) sarebbe stata 6 lingue × 4 campi = 24 colonne e un `ALTER TABLE` su DB live a ogni lingua nuova. Idempotente, solo `CREATE ... IF NOT EXISTS`.
- **`app/services/menu_i18n_service.py`**: `normalizza_lang()`, `traduci()` (una query per entità per pagina, mai N+1), `applica()`/`applica_riga()` con fallback a cascata traduzione→italiano, `upsert()`. Più il dizionario statico delle **etichette di sezione** e del micro-copy, con **gemello** `frontend/src/config/menuI18n.js`.
- **`?lang=` su `/menu-carta/public/today`**, sull'endpoint esistente e non su uno parallelo. Retrocompatibile: le traduzioni si scrivono *dentro* i campi originali (`titolo_override`, …), quindi la forma della risposta non cambia e i soli campi nuovi sono `lang` e `lingue_disponibili`.
- **Selettore lingua** sulla pagina pubblica: sei sigle testuali, **niente bandiere** (una bandiera è uno stato, non una lingua). Priorità `?lang=` URL → `localStorage` → `navigator.language` → it; il cambio riscrive l'URL con `replaceState`, così il link è condivisibile senza intasare la cronologia. Un solo QR in sala.
- **Tab Traduzioni** in `MenuCartaDettaglio.jsx`: italiano a sinistra in sola lettura, lingua a destra editabile, checkbox *Approvata* (`rivisto`), barra di copertura per lingua, filtri (da tradurre / da rivedere / non approvate), salvataggio massivo con toast. Mattoni M.I, `bg-brand-cream`, `API_BASE`.
- **`/translations/`** (GET/PUT) e **`/translations/coverage/`** sotto il router autenticato, con trailing slash.

### 🐛 Bug trovato e sistemato di rimbalzo
**La sezione 'dolci' non compariva sulla pagina pubblica.** `SEZIONI_ORDINE` in `CartaMenuPubblica.jsx` non era stata aggiornata quando la sezione è nata (2026-07-19, mig 154 + router v1.2): 5 dolci `is_visible=1` in `foodcost.db` (*La piantina del tiramisù*, *Cheesecake ai frutti di bosco*, *Ti ricordi il "Solero"?*, *Panna cotta dell'Ingegner Danisi*, *Pesca Melba*) erano **invisibili a chiunque inquadrasse il QR da tre settimane**. Il backoffice e il PDF li mostravano regolarmente, per questo non è saltato all'occhio. Risolto: l'ordine sezioni ora è unico e vive in `menuI18n.js`.

### Scelte di dettaglio che vale la pena ricordare
- **Traduzione vuota = cancellazione**, non riga vuota: è l'unico modo per dire "questa traduzione era sbagliata" e tornare al fallback italiano. Una riga con valore `''` darebbe un buco in carta.
- **Il clone di un'edizione porta con sé le traduzioni** (`ON CONFLICT DO NOTHING`, mantiene `rivisto`). Senza, ogni cambio di carta stagionale butterebbe via sei lingue di lavoro sui piatti riportati.
- **Cleanup orfani esplicito** su delete di publication/tasting path/edition: `entita_id` è polimorfico, quindi niente FK e il cascade di SQLite non lo raggiunge; un id riciclato da AUTOINCREMENT erediterebbe le traduzioni di un piatto morto.
- **`?lang=` sbagliato non è un errore**: un QR stampato male deve dare il menu in italiano, non un 400 a un ospite seduto al tavolo. Verificato anche con `../../etc/passwd`.

### Verifica
Su copia di `foodcost.db` (edizione *Estate 2026*, 44 piatti, 89 campi traducibili), con stub di fastapi/pydantic perché la VM non ha rete:
- migrazione rilanciata due volte → no-op, `integrity_check` ok;
- **retrocompatibilità**: risposta di `public/today` senza `lang` e con `lang=it` **identica** al baseline pre-traduzioni (confronto JSON serializzato) anche dopo aver inserito traduzioni EN;
- fallback: piatto senza traduzione e piatto con traduzione di soli spazi → entrambi in italiano;
- `normalizza_lang` allineata fra Python e JS su 10 input; dizionari IT/EN/FR/ES confrontati chiave per chiave fra i due gemelli → allineati;
- upsert: insert/update/cancellazione su vuoto/scarto di lingua madre, entità e campi non ammessi;
- clone → 4 traduzioni trasferite; delete edizione → 0 righe orfane residue.

### ⚠️ Da fare prima del push
- **`npm run build`**: tocco 3 file frontend e non posso lanciarlo (il `node_modules` ha i binari per macOS, la VM è Linux). Sintassi verificata con `@babel/parser` su tutti i file toccati.

### Seed Tre Gobbi — FATTO (mig 164, `[locale:tregobbi]`)
I testi sono arrivati in serata, e con **cinque** lingue invece di tre: EN, FR, ES + **DE e UK**. Sorgente `locali/tregobbi/seeds/menu_traduzioni_lug_set_2026.py` (generato) coi sorgenti accanto in `sorgenti_menu_lug_set_2026/`.

**Copertura piena: 44/44 publications, 2/2 degustazioni, 400 righe** (80 per lingua), tutte `rivisto=0`. Le tre discrepanze cartaceo↔DB risolte nel matching: tag dietetici `(NG)(NL)` nel titolo, `(prezzo per 2 persone)` nel titolo (riusato per tradurre `prezzo_label`), `PRIMO PIATTO` vs `Primo piatto bambini`.

Due cose non ovvie: `da 14 a 26` dei piatti del giorno non era nel seed tradotto (lì il prezzo è una stringa condivisa fra lingue) → preso **dai PDF consegnati**, non inventato; `<i>…</i>` nei due testi tedeschi strippato perché React lo stamperebbe letterale e non vale un renderer HTML su pagina pubblica senza auth.

⚠️ **Debito**: `(NG)`/`(NL)` = senza glutine / senza lattosio, che è un "adatto a" e non un allergene presente. Non esiste un campo a DB e l'italiano non lo porta, quindi è stato tolto ovunque. Il QR resta alla pari con l'italiano di oggi ma più povero del cartaceo: **un celiaco al tavolo non trova col telefono quello che vede sul menù di carta.** È la prima cosa da fare dopo.

## SESSIONE 2026-08-04 — Verifica docs vs codice TOTALE: tutti i moduli restanti (Blocco 2)

### Contesto
Marco, dopo la conversione leggera: "vorrei che li facessi tutti 1 ad uno verificando il codice in maniera approfondita e non a campione". Fatto: 13 pagine modulo verificate contro il codice reale (riconciliazione bidirezionale: ogni endpoint/pagina reale → documentato?; ogni claim del doc → ancora vero?), con 8 agenti su domini disgiunti. Il Blocco 1 (vini, CG, menu carta, pranzo, vendite) non è stato rifatto: check drift OK (vini e pranzo aggiornati il 3/8 con cantina mobile e M.J).

### Risultato: 13 doc promossi ad `attuale · 2026-08-03`
acquisti, fatture_xml, fatture_in_cloud (riscritto: era stub con ~6 fatti falsi), dipendenti, dipendenti_turni, intermittenti, prenotazioni (riscritto: era fermo a "in progettazione", 27 endpoint censiti), preventivi (30 endpoint vs 12 documentati), ricette_foodcost (63 endpoint), selezioni_giorno (da stub a pagina completa, 57 endpoint), banca (riscritto: il vecchio doc citava router e 6 tabelle MAI esistiti), clienti_crm (33 endpoint vs 3 documentati), cucina (path API tutti corretti: `/tasks/*` non `/cucina/*`, DB `tasks.sqlite3`), statistiche (12/12, mode=ro e cutover dinamico confermati).

### 🐛 Bug REALI trovati nel codice durante la verifica (docs li riportano come limiti noti; fix in sessioni dedicate)
1. **`menu_templates_router.py:34`** — `is_admin(user)` riceve il dict invece del ruolo → **salva/carica template menu = 403 per tutti, admin compreso** (conferma: tabella `clienti_menu_template` vuota).
2. **`giorno_chiusura` UI↔backend incoerente** — UI 0=nessuno/1=domenica…, backend 0=dom…6=sab: la UI mostra "Martedì" per il mercoledì del backend (`PrenotazioniImpostazioni.jsx:17` vs `prenotazioni_router.py:283-287`).
3. **Multi-reparto turni, bug latente** — `turni_router.py:215` (assegna) e `:340` (cambio dipendente) validano solo il reparto principale: appena si userà `dipendenti_reparti` (mig 162, oggi vuota), l'assegnazione di un aggiuntivo fallirà con 400.
4. **"+ Nuovo Cliente" rotto** — `ClientiLista.jsx:267` naviga a `/clienti/nuovo` che non ha route; `POST /clienti/` non ha alcun caller FE. I clienti oggi nascono solo da import TheFork.

(minori: 2 redirect legacy `/cucina/*` parametrici con `:id` letterale in `App.jsx:522-523`; `POST /intermittenti/test-email/` doppione senza UI dopo `/email/test/`; card Home "Flussi di Cassa" legge la legacy `finanza_movimenti`.)

### ✅ Verifiche di sicurezza confermate
- **CRIT A1 audit 2026-06-12 RISOLTO**: `banca_router.py:41-45` auth a livello router, `banca_carta` per-endpoint — verificato oggi, nessun `/banca/*` raggiungibile senza JWT.
- Ancora aperto invece: `foodcost_router.py` legacy con 2 GET **senza auth** (`/foodcost/ingredienti`, `/foodcost/ingredient/{id}`) — decisione PO sotto.

### Decisioni PO aperte (per Marco)
1. A R8 le **Selezioni del Giorno** vanno nel modulo vendibile `ricette` (come dice CLAUDE.md) o `cucina` (come dicono i commenti nel codice)?
2. `foodcost_router.py` legacy senza auth: proteggere o rimuovere?
3. Creazione manuale cliente: implementare la route `/clienti/nuovo` o i clienti nascono solo da import?
4. Roadmap disallineata in 2 punti (non toccata): A.5/A.6 proforme "IN PAUSA" ma implementate; CL.7 note rapide "MEDIA" ma già fatta.

### Nota metodo
"Ultima verifica: 2026-08-03" nei 13 header = data di inizio verifica (a cavallo di mezzanotte). Lint finale: ✅ zero warning. Solo `docs/` toccato, nessun codice.

## SESSIONE 2026-08-03 — Docs→wiki: conversione completata (le 25 pagine rimaste)

### Contesto
Marco: "Abbiamo ancora lasciato indietro i file docs, e la conversione in wiki". La struttura wiki (index, convenzioni, lint, archivi) era già pushata dal 24/7, ma 25 pagine su ~50 erano ancora senza header di stato. Deciso con Marco: **conversione leggera di tutte** (header onesto + link veri), deroga una-tantum alla regola "solo al tocco" di [convenzioni_wiki.md](convenzioni_wiki.md); la verifica vs codice resta a blocchi futuri (Blocco 1 già fatto: vini, CG, menu carta, pranzo, vendite).

### Cosa è stato fatto (solo `docs/`, nessun codice)
- **Header di stato su tutte le 25 pagine** rimanenti: 14 modulo_*.md, 7 spec/analisi, 3 operative (readme, sicurezza_backup, installazione_nuovo_server), 1 stub (modulo_selezioni).
- **Criterio "Ultima verifica" onesto**: data git dell'ultimo aggiornamento sostanziale, NON la data di oggi. Stato `parziale` per tutto ciò che non è mai stato verificato vs codice; `attuale` solo per modulo_intermittenti e spec_utenze (scritti insieme al codice, luglio/agosto); `storico` per analisi_app_apple, analisi_hardening_vps, spec_riconciliazione, refactor_anagrafiche_vini (chiuso col cutover, rimando a modulo_vini) e lo stub modulo_selezioni.
- **Riferimenti testuali → link veri** negli attacchi pagina ("Documenti correlati"/"Doc collegato" assorbiti nel "Vedi anche"); righe "Ultimo aggiornamento" ridondanti rimosse (le sostituisce l'header; la data vera la dice git).
- **readme.md §11 corretto**: i DB vivono in `locali/tregobbi/data/` (path canonico da R6.5), non in `app/data/` (solo fallback legacy). Fatto noto, era rimasto indietro.

### Verifica
`python3 scripts/docs_lint.py` → ✅ nessun link rotto, index completo, **zero pagine senza header** (prima: 25). Diff: 25 file, tutti in `docs/`, +87/−22.

### Da fare (futuro)
- Blocchi di verifica vs codice per promuovere le pagine `parziale` → `attuale` (candidati: dipendenti+turni+intermittenti, acquisti+fatture, prenotazioni che è ferma alla progettazione).
- Gli stub dichiarati restano stub: modulo_fatture_in_cloud, modulo_selezioni_giorno.

## SESSIONE 2026-08-03 — Vini: "Cantina da iPhone" fase 1 «trova la bottiglia»

### Contesto
Marco, dopo la CartaStaff v2.0: "la pagina sommelier dovremmo ottimizzarla anche per un uso della cantina da iphone". Deciso insieme (3 mockup): tre funzioni — 1 trova la bottiglia (sola lettura), 2 correggi giacenze (+/−, = V.9 scritture), 3 conta inventario. Partiti dalla **fase 1**, rischio zero. Casa scelta: **pagina dedicata** `/vini/cantina-mobile` (non terza modalità di sommelier), così cresce con le fasi 2-3 senza gonfiare lo strumento di sala.

### Cosa è stato fatto ([core], vini 3.80, V.9 fase 1)
- **`CantinaMobile.jsx`** (nuova): finder mobile-first — modo Cerca (ricerca + filtro per categoria: scaffali/frigo/matrice) e Per scaffale (vista inversa), scheda mobile read-only con «Dove si trova» + griglia matrice (parsata da `LOCAZIONE_3`), anagrafica, movimenti collassabili. Un solo componente: `useParams().id` → scheda, altrimenti finder.
- Route `/vini/cantina-mobile` + `/:id` (sub=magazzino), tab **📱 Cantina mobile** in ViniNav.
- **Zero backend**: riuso `/vini/v2/bottiglie/?only_positive_stock=true` (tutte le bottiglie in giacenza — verificato: oggi le 380 in giacenza sono comunque tutte carta), dettaglio `/vini/v2/bottiglie/{id}`, movimenti `/vini/magazzino/{id}/movimenti`.

### Verifica
esbuild parse OK. Endpoint verificati sul router v2. Nessuna scrittura in questa fase.

### Da fare
- Provare sul telefono in cantina; poi valutare **fase 2** (+/− giacenze — attenzione ai movimenti, lezione RETTIFICA fantasma) e **fase 3** (conta inventario). Vendita/scrittura da loc3/matrice resta esclusa.

## SESSIONE 2026-08-03 — Pubblicare i PDF sul sito dall'app (mattone M.J)

### Contesto
Marco: *"riusciamo a incollare un file su un ftp?"*, poi il vero bisogno: *"se devo aggiornare un menu sul sito possiamo farlo da app?"*. Il sito è un WordPress su hosting Aruba, ma i PDF pubblici (menu del pranzo settimanale, carta vini) sono **file statici in `www.tregobbi.it/privata/`**, caricati a mano col client FTP. L'app li generava già: mancava solo l'ultimo metro.

### Cosa è stato fatto
Mattone **M.J Pubblicazione web**: `ftp_publish_service.py` (backend, `ftplib` da stdlib — nessuna dipendenza nuova), router platform `/pubblicazione/`, componente `<PubblicaSulSito>` riusabile. Endpoint di pubblicazione **dentro i router dei rispettivi moduli** (pranzo, vini) che chiamano il servizio platform: regola 2 dell'architettura modulare, niente import tra router di moduli diversi.

### Le decisioni
1. **Nome remoto fisso** (`menu-pranzo.pdf`, `carta-vini.pdf`). Marco ha confermato che già oggi sovrascrive con nome fisso: il link su WordPress non va più toccato. Era la condizione perché l'automazione avesse senso.
2. **Upload atomico** (`.part` + RENAME). Senza, una linea che cade a metà lascia ai clienti un PDF troncato. Con il RENAME rifiutato su destinazione esistente (capita su certi server) si cancella e si ritenta.
3. **Solo la carta CLIENTE è pubblicabile.** Per `pdf-staff` non esiste endpoint di pubblicazione: la versione interna non deve poter finire su un server pubblico per distrazione. La generazione del PDF cliente è stata estratta in `_render_carta_pdf_cliente()` così download e pubblicazione usano lo stesso codice.
4. **Config in `.env`, niente hardcode**: host, utente, password, cartella e persino i nomi file sono variabili. Il servizio è `[core]`, i valori sono `[locale:tregobbi]`.
5. **Storico in `web_publish_log`** creata on-demand in `notifiche.sqlite3`: nessuna migrazione, zero rischio con le sessioni parallele in corso.

### Test
Tre suite con server FTP finti in sandbox (`claude/test_ftp_publish_mj*.py`): pubblicazione, sovrascrittura, nessun residuo, rifiuto dei file da 0 byte, errore di rete che ritorna esito invece di eccezione, storico, sonda di scrittura, utente in sola lettura smascherato, path traversal nel nome file. I due che contano: **con il server irraggiungibile a metà il PDF già sul sito resta quello buono**, e **con un server che rifiuta il RENAME per permessi il file pubblicato viene ripristinato** invece di sparire.

### Cosa ha trovato la review avversariale (tutto corretto prima del push)
2 bloccanti: il rollback del rename **cancellava il file vivo** lasciando il sito a 404 quando l'errore non era "destinazione esistente"; e `FTP_TLS=auto` ricadeva in chiaro anche su errore di login, **rispedendo la password vera in cleartext** su un server che invece parla TLS. Più: notifica di fallimento intestata a `dest_ruolo="admin"` che a un `superadmin` non arriva; `static/carta_vini.pdf` condiviso fra tutte le richieste (una generazione concorrente poteva riscriverlo mentre la pubblicazione lo leggeva); host/utente FTP leggibili da qualsiasi utente loggato; "Prova connessione" che passava anche con FTP in sola lettura.

**Falla pre-esistente chiusa per strada:** `static/` è servito senza auth e la carta vini **staff** ci veniva parcheggiata come `carta_vini_staff.pdf` — scaricabile da chiunque indovinasse l'URL (A4 aveva protetto l'endpoint, non il file). Ora cliente e staff ritornano bytes, niente file su disco.

### Da fare / attenzione
- **Sul VPS: cancellare `static/carta_vini.pdf` e `static/carta_vini_staff.pdf`** — i residui delle generazioni precedenti restano lì e sono pubblici finché non si eliminano.
- **Decisione aperta per Marco:** `GET /vini/carta/pdf` è tuttora **senza autenticazione** (chiunque scarica la carta cliente completa). Non l'ho toccato perché i bottoni la aprono con `window.open` senza token: metterci l'auth richiede passare da `?token=` come già si fa per `pdf-staff`. Da decidere.
- **Prima del push serve `npm run build`** (tocca il frontend), e **le variabili `FTP_*` in `.env` sul VPS**: finché mancano, il bottone appare disabilitato con scritto cosa manca. Servono host, utente, password FTP di Aruba e la cartella esatta (`FTP_DIR=/privata` o il path che il client FTP mostra come radice).
- **Verificare se Aruba accetta FTPS**: se sì, `FTP_TLS=1`. Con `auto` su hosting senza TLS **la password viaggia in chiaro**.
- Dopo il primo test reale: mettere il link fisso su WordPress (`/privata/menu-pranzo.pdf`, `/privata/carta-vini.pdf`) e non toccarlo più.
- Possibile passo successivo: pubblicazione automatica del menu quando si salva la settimana (`tasks_scheduler`). Non fatto: prima si guarda che il manuale funzioni.

## SESSIONE 2026-08-02 (bis) — Ordini ai fornitori: O3-O6 in un colpo

### Contesto
Marco carica i telefoni dei distributori che usa di piu' e dice: "tutto, nell'ordine che ti e' piu' semplice, iniziamo oggi finiamo oggi". Sui prezzi: "il prezzo e' gia' all'interno della madre, se ci sono sconti e' dentro" -> `EURO_LISTINO` e' gia' il netto, niente campo sconto, O7 rimandata.

### Cosa e' stato fatto
Migrazione 158 (`vini_ordini` + `vini_ordini_righe`), model, router `/vini/ordini`, pagina `OrdiniVini.jsx`, template WhatsApp configurabile, dashboard ridotta a riepilogo. **O2 assorbito in O6**: costruire i quick wins sul widget vecchio e poi rifarli nella pagina nuova lo stesso giorno non aveva senso.

### La cosa che ha cambiato il piano in corsa
La review avversariale ha trovato il rischio grosso: **i due sistemi d'ordine convivevano**. Un vino con pending aperto ha `STATO_RIORDINO='0'`, quindi ricompariva nella nuova lista "da ordinare" senza segnale -> doppio ordine; e confermando l'arrivo da entrambi i sistemi `QTA_TOTALE` veniva incrementata **due volte**. In piu', da quando la dashboard rimanda alla pagina nuova, i 2 pending residui non erano piu' chiudibili da nessuna schermata: mine pronte a sparare un carico fantasma. Il piano rimandava il travaso a UI verificata; erano 2 righe e 3 bottiglie, quindi ho scritto la **migrazione 159** e l'ho fatto subito.

### Decisioni
1. **Chiave di raggruppamento = `DISTRIBUTORE`** (testo sulla bottiglia), non il nome dell'anagrafica: c'e' un doppione reale (`Emanuele Poloni` / `Emanuele Polloni`, 20 e 27 vini) che avrebbe mandato le righe in una bozza invisibile dal gruppo in cui si e' cliccato.
2. **Qta nel carrello si sostituisce**, qta in ricezione sono **incrementi** con tetto al doppio dell'ordinato (60 al posto di 6 viene rifiutato).
3. **Ricevere una bozza e' vietato**: salterebbe `inviato` e quindi la data di partenza, cioe' il lead time.
4. **Vino cancellato in ricezione**: la riga NON viene marcata ricevuta. Meglio un ordine che resta `parziale` e si vede, che uno chiuso che dichiara arrivata merce mai caricata.

### Aggiunta a fine sessione — flag `attivo` sui distributori (mig 160)
Marco: "così posso togliere il flag a quelli inattivi da cui non sto comprando". Interruttore in Anagrafiche > Distributori, i non attivi spariscono dalla pagina Ordini. **Eccezione voluta:** se un distributore non attivo ha un ordine aperto resta visibile (in fondo, in corsivo) — nasconderlo renderebbe l'ordine irraggiungibile, lo stesso errore dei pending orfani.

### Da fare / attenzione
- **Prima cosa dopo il push:** aprire `/vini/ordini`. I 2 ordini travasati (SOGEGROSS, aprile e maggio) compariranno come **fermi da oltre 30 giorni** — vanno chiusi o annullati, e' merce vecchia.
- **Fondere `Emanuele Poloni` / `Emanuele Polloni`** in Anagrafiche > Distributori.
- **2 bottiglie disallineate** (il `DISTRIBUTORE` scritto sopra non combacia col fornitore della loro madre): id 1034 Franciacorta Blanc de Blanc, id 1313 Salento IGT Calafuria. Nessun cascade le raggiunge: producono un gruppo fantasma nella pagina Ordini. La Calafuria va decisa da Marco (SOGEGROSS o Poloni?).
- **Codice morto** in `DashboardVini.jsx` (modale ordine, ~145 righe) e endpoint pending senza gate di ruolo: censiti in `inventario_pulizia.md`, push dedicato.
- Testato end-to-end su copia del DB di produzione. Niente build (Vite serve i sorgenti), verifica con `@babel/parser`.

## SESSIONE 2026-08-02 — Ordini vini: il piano, e il primo pezzo

### Contesto
Marco: "dashboard vini, rivediamo un attimo i riordini per fornitore, devo avere un modo per lavorarci meglio, dammi proposte". Alla domanda su dove ordina davvero: **col rappresentante davanti, oppure mandando un messaggio WhatsApp**. Questa risposta ha deciso tutta l'architettura del piano: fornitore-centrico e WhatsApp-first, il vino e' una riga dentro un ordine e non l'unita' di lavoro.

### La ricognizione, prima delle proposte
Tre buchi nel sistema attuale:
1. **Non esiste il concetto di ordine.** Solo `vini_ordini_pending` con `UNIQUE(vino_id)`: una riga per vino, nessuna testata, nessuno stato, nessuna data di invio.
2. **Non esiste storico.** `conferma_arrivo_ordine_pending()` **cancella** il record quando la merce arriva. Impossibile sapere cosa si e' ordinato a un distributore, quando, e quanto ci ha messo ad arrivare.
3. **Due widget sovrapposti** in DashboardVini: "Riordini per fornitore" e "Vini in carta senza giacenza" hanno entrambi `+ ordina` ed entrambi raggruppano per distributore.

### Il numero che ha ribaltato l'ordine delle fasi
L'invio WhatsApp era fermo dal 2026-04-24 come "punto 7 differito" perche' mancava il telefono del rappresentante. Query sul DB scaricato dal VPS: il campo **esiste dalla mig 125**, ma e' compilato su **0 fornitori su 40**. Non era piu' un problema di schema, era data entry — quindi O1 diventa "rendere indolore riempire quei 40 contatti", non una rifinitura di fine piano.

Nella stessa ricognizione, due conferme che tolgono rischio: **1273/1275 bottiglie** (99,8%) risolvono `bottiglia -> madre -> fornitore_id`, e **40/40** distributori testuali matchano `vini_fornitori.nome`. Nessuna riconciliazione anagrafica da fare prima di partire.

### Cosa e' stato fatto (`[core]`)
- **`docs/modulo_vini_ordini.md`** — piano canonico O1–O7 (contatti, quick wins widget, schema ordini, composizione+ricezione, invio WA, pagina `/vini/ordini` fornitore-centrica, condizioni fornitore).
- **O1 implementato** — modalita' contatti in Anagrafiche > Distributori: edit inline, `Invio` scende alla riga sotto, barra di completezza, filtro "solo senza telefono".
- **Fix backend fuori piano** — il `PATCH /fornitori/{id}` lanciava il cascade sync a ogni chiamata: su una schermata di data entry sono ~120 riscritture di centinaia di bottiglie che non cambiano un valore. Ora parte solo se il patch tocca `nome` o `rappresentante_nome`, gli unici due campi del fornitore denormalizzati sulle bottiglie.

### Decisioni
1. **La pagina `/vini/ordini` viene DOPO il modello dati (O6 dopo O3/O4)**, non prima. Farla adesso significherebbe riscriverla.
2. **Telefono salvato come lo si scrive**, non normalizzato: `buildWaLink()` normalizza gia' all'uso, e un numero leggibile vale piu' di uno canonico. La cella segnala con ⚠️ quelli che `normalizePhone()` non sa interpretare.
3. **Colonne contatto non ordinabili** in modalita' contatti: ordinare su una colonna che si sta compilando fa saltare la riga a ogni Invio.
4. La whitelist dei campi che scatenano il cascade vive in `vini_anagrafiche_sync.py`, non copiata nel router: la fonte di verita' e' `_compute_synced_values()`, che sta li'.

### Da fare / attenzione
- **Niente build da lanciare** (verificato 2026-08-02): `frontend/dist/` non e' tracciato, `push.sh` non compila, il post-receive fa `npm install` solo se cambia `package.json` e riavvia `trgb-frontend`, che serve Vite. Verifica fatta con `@babel/parser` — un import rotto si vedrebbe solo a runtime, quindi aprire la pagina Distributori dopo il push.
- **Prima cosa dopo il push:** Marco riempie i 40 contatti. Senza quelli O5 (invio WhatsApp) non parte.
- **4 domande aperte** in fondo al piano, da chiudere prima di O4. La piu' pesante: il totale € dell'ordine va sul listino o sul netto scontato? Se i distributori applicano sconti fissi, `sconto_std_pct` va anticipato da O7 a O4.
- I numeri della ricognizione vengono dalla copia locale del DB: **riverificarli sul VPS** prima di partire con O2.

## SESSIONE 2026-08-03 — Intermittenti: rifinitura, flag unico, canale email dal gestionale

**Configurazione in Impostazioni, flag in Anagrafica.** I dati del datore sono una sezione della sidebar di `DipendentiImpostazioni.jsx`; flag, CF e codice comunicazione stanno nella scheda del dipendente. Backend: i tre campi in modello/SELECT/INSERT/UPDATE di `dipendenti.py`, con COALESCE su CF e codice comunicazione perche' un form che non li manda non azzeri il CF che arriva dai cedolini. Rimossi `PUT /intermittenti/lavoratori/{id}` e `set_lavoratore()`: un solo scrittore.

**Un solo flag (mig 161).** `trasmissione_telematica` significava gia' "intermittente": dati travasati su `intermittente`, casella vecchia tolta dall'anagrafica, colonna lasciata nel DB (niente DDL distruttivo).

**Canale email dal gestionale.** Config in `email_settings.json` del locale (+ .env fallback), password cifrata con chiave nel .env, tab Email in Impostazioni Sistema con destinatario di prova. Niente scrittura nel .env dall'app: si leggerebbe solo al restart, e il restart e' la finestra di corruzione SQLite.

**Multi-reparto (mig 162).** Marco lavora in sala e in cucina: caselle "Lavora anche in" in anagrafica + tabella `dipendenti_reparti`. Il punto vero non era il flag: il foglio mostrava i turni delle PERSONE del reparto, non i turni DEL reparto. Ora filtra per il reparto del TIPO di turno (`turni_tipi.ruolo` = `reparti.codice`), con rete di sicurezza per chi ha un reparto solo. Otto query aggiornate in `turni_service`, test end-to-end su copia del DB.

**Da fare:** `.env` del VPS con `TRGB_SECRET_KEY` (la genera il backend al primo salvataggio con password), poi CF azienda + email datore in Impostazioni Dipendenti, poi la verifica col consulente.

## SESSIONE 2026-07-30 — Intermittenti: le chiamate si comunicano dai turni

### Contesto
Marco chiede il modello per le chiamate degli intermittenti, poi: "vorrei che creassimo il sistema da abbinare al nostro sistema turni". Risposta chiave alle domande di scoping: **oggi quelle chiamate non vengono comunicate a nessuno**. Da qui la priorita' e anche il rischio (400-2.400 EUR per giornata omessa, non sanabile a posteriori).

### Il pezzo difficile: il tracciato
Del file XML **non esiste alcuna specifica pubblica**. Il campione del commercialista si e' rivelato la chiave: e' un XFA Adobe, e il suo bottone "Genera XML e invia via email" fa `<submit format="xml">`, quindi l'allegato che parte E' il packet `datasets` dell'XFA. Estratto con pikepdf: struttura esatta, e soprattutto il JavaScript interno del modulo, che vale piu' di qualsiasi guida (email obbligatoria con regex propria, `data_inizio >= data_fine` = errore quindi giornata singola con data fine VUOTA, max 10 righe, un modulo per email).

**Formato date `DD/MM/YYYY`**: dedotto dal `<bind><picture>` presente su tutti e 20 i campi data. Lo script del modulo confronta le date come ISO perche' legge `rawValue`, che e' ISO *in memoria*: non e' una contraddizione. Resta comunque un setting, non una costante.

### Cosa e' stato fatto (`[core]`)
Migrazione 156, `email_service.py` (M.D minimo), `uni_intermittenti_service.py`, `intermittenti_router.py`, pagina `Intermittenti.jsx`, checker M.F, doc `modulo_intermittenti.md`. Logica del generatore testata: sequenza degli elementi XML identica al campione reale, compattazione dei soli giorni consecutivi, split a 10, tutte le regole di validazione del modulo.

### Decisioni
1. **`intermittente` e' un campo NUOVO**, non un riuso di `a_chiamata` (che Marco ha confermato significare "extra del turismo"). Rinominare la semantica di una colonna viva e' il drift gia' costato caro.
2. **Invio manuale** in prima battuta (scelta di Marco): l'aggancio automatico a "Pubblica settimana" viene dopo.
3. **Le righe le ricalcola il server** dal periodo: il client non dichiara nulla al Ministero.
4. Turni `OPZIONALE` esclusi: comunicarli sarebbe dichiarare prestazioni che potrebbero non esserci.

### Rifinitura (stessa sessione, dopo la prima passata)
**Configurazione in Impostazioni, flag in Anagrafica** (richiesta di Marco). I dati del datore + stato SMTP sono una sezione nuova della sidebar di `DipendentiImpostazioni.jsx`; flag `intermittente`, CF e codice comunicazione stanno nella scheda del dipendente in Anagrafica. Backend: i tre campi aggiunti a modello/SELECT/INSERT/UPDATE di `dipendenti.py`, con **COALESCE** su CF e codice comunicazione perche' un salvataggio senza quei campi non azzeri il CF che arriva dai cedolini. Rimossi `PUT /intermittenti/lavoratori/{id}` e `set_lavoratore()`: un solo scrittore.

### Da fare / attenzione
- **`npm run build` non lanciato** (node_modules con binario rollup macOS) — obbligatorio prima del push.
- Serve `.env` con SMTP_HOST/PORT/USER/PASS, poi CF azienda + email in pagina, poi la spunta di chi e' intermittente e i codici comunicazione (li ha il consulente).
- **Verifica col consulente del tipo di contratto reale** prima di usarlo davvero: se sono extra del turismo la comunicazione non e' dovuta.
- Il Ministero non manda ricevute: primo mese in doppio binario col consulente.
- Trappola M.I trovata: `TextInput` passa a `onChange` il VALORE, non l'evento, ed e' controllato (`defaultValue` inutile).

## SESSIONE 2026-07-27 — La Lavagna: la Bacheca diventa un briefing di servizio

### Contesto
Marco: "dai un'occhiata alla bacheca nella homepage… al momento non viene utilizzata, ripensiamo al suo uso". Due risposte hanno cambiato il problema: **la Home non la apre nessuno con regolarità**, e la direzione voluta era la somma di briefing automatico + nota a frizione zero + feed unico.

Diagnosi: la Bacheca era l'unico blocco della Home che si riempiva solo con lavoro umano, circondato da card che si riempiono da sole (Alert, Selezioni, notifiche M.A). Per pubblicare servivano titolo + messaggio + destinatari + urgenza + scadenza in `/comunicazioni` — cinque campi per dire una cosa che in osteria si dice a voce. Vuota → non la guardi → non ci scrivi.

### Cosa è stato fatto (`[core]`)
Fatto prima un mockup HTML a parte per decidere se tenerla; approvato, poi implementata.

- **`app/services/lavagna_service.py`** — servizio platform che compone il briefing del turno: lede in italiano, tavoli da segnalare (allergie → occasioni → gruppi ≥8 → note, in quest'ordine), selezioni, turni, task, eventi, testo WhatsApp. Selezioni e alert **iniettati dal router**, non ricalcolati: dipendenza router → service, mai il contrario.
- **Endpoint** `GET /dashboard/lavagna` (separato da `/home` così la nota non ricarica tutto) e `GET/POST/DELETE /comunicazioni/nota`.
- **Frontend** `Lavagna.jsx` + `useLavagna.js`; innestato in **Home.jsx (v9.3)** e **DashboardSala.jsx (v5.3)**.
- **Schema:** soft-migration `ADD COLUMN` idempotente su `comunicazioni` (`tipo`, `data_riferimento`, `turno`), nessuna migrazione già girata toccata. Le 3 query della bacheca classica filtrano `tipo='bacheca'`.

### Decisioni prese (Marco ha detto "procedi", quindi le ho prese io — reversibili)
1. **Dove vive:** servizio platform in `app/services/`, non un modulo nuovo. È un aggregatore cross-modulo come `statistiche`, e CLAUDE.md §2 vuole i dati cross-modulo via servizio platform.
2. **La card Alert è stata assorbita** nello strato eventi: nella stessa colonna era un doppione concettuale.
3. **Anche in DashboardSala** — non era richiesto, ma con ruolo `sala` l'utente atterra lì e la Home non la vede mai: mettere il briefing solo nella Home significava non farlo vedere a chi serve. Sola lettura per la sala.

### Da fare / attenzione
- **`npm run build` non l'ho potuto eseguire**: il `node_modules` ha il binario rollup per macOS e la VM remota è Linux. Sintassi e identificatori verificati con `@babel/parser` sui 4 file (tutti OK), ma **la build va lanciata prima del push**.
- **Il bottone "Copia" non invia**: `wa.me` non funziona sui gruppi, prepara solo il testo negli appunti. Se si vuole l'invio vero serve un'altra strada (M.D email, o API WhatsApp Business).
- **Il problema vero resta aperto:** un widget migliore non crea il rituale di aprire la Home. La leva è portare il briefing dove lo staff già sta.
- Task manager e checklist: le tabelle locali sono vuote, quindi lo strato task non l'ho potuto vedere con dati veri — la query c'è ed è difensiva.
- Nome "La Lavagna": nativo d'osteria, ma da rivedere se il prodotto deve girare fuori da Tre Gobbi.

## SESSIONE 2026-07-25 — Verifica contenuti docs vs codice — Blocco 1 (vini, CG, menu carta, vendite)

### Contesto
Marco, primo giro di lettura sul wiki: "mi sembrano pieni di errori e non aggiornati". Vero — la conversione wiki aveva sistemato la struttura, non i contenuti. Avviata la verifica sistematica dei modulo_*.md contro il codice (4 verificatori in parallelo su snapshot fresco del repo). Il codice fa fede, sempre.

### Cosa è stato fatto (6 doc corretti in place, [core])
- **modulo_vini.md + widget_dashboard** — ~26 problemi: versioni ferme a 3.67 (reale 3.72/sistema 5.38), V-BUG1 dichiarato aperto ma chiuso da maggio, endpoint iPratico e carta-staff con path sbagliati, rotte carta bevande rimosse ancora documentate, ~25 endpoint vivi mai documentati (bulk, matrice, backup, pricing), payload conferma-arrivo sbagliato, pagine _legacy citate come vive.
- **modulo_controllo_gestione.md** — ~17 problemi: stati pagamento VECCHI ovunque (DA_PAGARE/… al posto dell'enum 8 valori), 3 endpoint rimossi documentati attivi, nav "3 tab" (reali 8), KPI dashboard obsoleti, riconciliazione banca/contanti/carta documentata "FUTURO" ma implementata, ~40 endpoint mancanti aggiunti (adeguamenti ISTAT mai documentati), versione 2.19→2.21.
- **modulo_menu_carta.md** — IL PEGGIORE: diceva ancora "Stato: PROPOSTA, niente codice" per un modulo in produzione da mesi. Sezione dolci assente, endpoint di fantasia mai esistiti, migrazione init sbagliata (097→098), route FE sbagliata. + modulo_pranzo.md (endpoint pdf-esterno, versioni).
- **modulo_vendite.md** — prefix chiusure turno sbagliato in tutta la tabella (reale /admin/finance/shift-closures, 11 endpoint riscritti con file:riga — chiude il gap CRIT-3/DH.4), endpoint admin_finance inesistenti, versione "v1.x" (reale corrispettivi 4.8), logica giorni chiusi obsoleta (fix V.1), path config pre-R6.5, nota id preconti volatili.
- Tutti e 6 con header **"Ultima verifica: 2026-07-25 (vs codice)"**, stato "parziale" dove restano zone non verificabili dallo snapshot (App.jsx, migrazioni, template PDF — dichiarate nell'header).

### Da fare / attenzione
- **Blocco 2** (prossimi): acquisti+fatture, ricette, banca, cucina/tasks. **Blocco 3**: prenotazioni+preventivi, clienti, dipendenti+turni, statistiche + spec_*.
- Le sezioni "parziale" si chiudono verificando App.jsx e migrazioni (bastano nel prossimo snapshot).
- Incoerenza segnalata: CorrispettiviAnnual.jsx presente su disco ma dichiarato rimosso in v4.0 (v. modulo_vendite §10.5) — candidato inventario_pulizia.

## SESSIONE 2026-07-24 — Docs → wiki completo (index, convenzioni, conversione, lint, archivi)

### Contesto
Marco porta il gist "LLM wiki" di Karpathy e chiede come applicarlo a TRGB. Deciso: per TRGB il problema non è l'accumulo ma navigabilità e coerenza → `docs/` diventa un wiki per convenzioni, senza riorganizzazioni. Poi "procediamo" su tutti e 4 i passi successivi.

### Cosa è stato fatto (docs + 2 file infra, [core])
**Fase 1 — fondamenta:**
- **`docs/convenzioni_wiki.md` (nuovo, ⚙ schema)** — 3 tipi di pagina (📓 log / 📄 wiki / ⚙ schema) + 4 regole: home=index, un fatto una pagina, link relativi, header di stato (`Stato` + `Ultima verifica`). Adozione opt-in stile M.I; vietato big-bang di rinomine. + regola log ~3 mesi e sezione Lint.
- **`docs/index.md` (nuovo)** — home del wiki: catalogo completo per argomento, una riga per pagina.
- **`docs/readme.md`** — §12 tabella docs → link a index.md.

**Fase 2 — conversione + lint + archivi + duplicazioni:**
- **14 pagine convertite** (header di stato + ~150 riferimenti testuali trasformati in link cliccabili): roadmap, refactor_monorepo, architettura_locale/mattoni/pattern, stack_tecnico, database, deploy, stato_pagamento_unificato, GUIDA-RAPIDA, controllo_design, checklist_visione_insieme, inventario_pulizia, styleguide. "Ultima verifica: —" (i contenuti NON sono stati riverificati sul codice: il trattino lo dice onestamente).
- **`scripts/docs_lint.py` (nuovo, solo stdlib)** — link relativi rotti in docs/+CLAUDE.md, pagine fuori da index.md, info pagine senza header. `--warn-only` per push.sh. Al primo giro ha trovato **4 link rotti veri** in sessione.md (home_per_ruolo/menu_carta rinominati, archivio spostato, memoria Cowork linkata come file) → fixati.
- **`push.sh`** — hook docs lint nel Guardiano L1 pre-push, warning-only MAI bloccante, skip silenzioso se python3/script mancano (`bash -n` ok). Primo pezzo di DH.7.
- **Log archiviati (~3 mesi vivi):** sessione.md 500→~250KB (sessioni ~39→59 + vecchie mappe pre-refactor superate → `archive/sessione_archivio_59.md`); changelog.md 700→~200KB (dic 2025–apr 2026 → `archive/changelog_archivio_2026-04.md`). File d'archivio con nota storica in testa; sezione "## Storico" con link in coda ai file vivi.
- **Duplicazione palette sanata** — era pure una CONTRADDIZIONE: styleguide (pre-sessione 28) diceva ancora `bg-neutral-100`, CLAUDE.md impone `bg-brand-cream`. Ora `styleguide.md` §Palette è canonica (tabella hex TRGB-02 + regola cream + nota storica sugli snippet); CLAUDE.md tiene link + minimo operativo. Stato pagina: `parziale` (onesto: gli snippet layout restano da aggiornare).
- **`readme.md` §9** — descrizioni moduli → tabella una-riga-per-modulo + link alle pagine wiki.
- **`CLAUDE.md`** — riga in §Ambiente: mappa docs = index.md, regole = convenzioni_wiki.md.

### Verifica
`python3 scripts/docs_lint.py` → ✅ 0 link rotti, index completo (l'albero locale simulava tutti i file del repo); `bash -n push.sh` ok; ogni link di index/convenzioni validato contro l'elenco reale dei file.

### Da fare / attenzione
- ⚠️ Dopo il push, primo `./push.sh` mostra l'esito del docs lint: 30 pagine risultano ancora senza header (info, non errore) — si convertono al primo tocco.
- Duplicazione residua: readme §11 tabella DB ↔ database.md (piccola, al primo tocco).
- `/guardiano lint` semantico (contraddizioni roadmap↔problemi, "Ultima verifica" stantia) resta concept.
- Le "Ultima verifica: —" si compilano quando si verifica DAVVERO una pagina sul codice.

## SESSIONE 2026-07-20 — Vini: Vista Sommelier v2.0 "banco di servizio" (V.22)

### Contesto
Marco: "Pagina sommelier, da rivedere … rivediamone il senso, così è inutilizzata, che idee abbiamo?". Proposte 3 direzioni con mockup HTML (banco di servizio / strumento di vendita / pre-servizio); Marco: "prova a svilupparlo così" → implementate 1+3 combinate (la 2, abbinamenti/da spingere, rinviata: richiede dati nuovi nel Menu Carta).

### Cosa è stato fatto ([core], modulo vini, chiude V.22/#136)
- **`CartaStaff.jsx` riscritto (v2.0)** — due modalità con switch in header:
  - **Preparazione**: checklist pre-turno client-side — ultima bottiglia (qta 1, ancora in carta), calici aperti (chiusura inline), frigo da rifornire (≤2 in frigo con stock altrove, dice da dove prendere).
  - **Servizio**: ricerca/filtri invariati + per riga "📍 prendi da" e azioni one-tap: Vendi −1 (VENDITA dalla locazione; picker inline se multiple; undo 10s = DELETE movimento, delta inverso) e toggle mescita (endpoint bottiglia-aperta, già aperto a sala). Nome vino → /vini/v2/bottiglia/:id.
- **`carta-staff/` endpoint**: `locazioni[]` con campo additivo `slot` (frigo|loc1|loc2|loc3) — serve al FE per indicare la locazione della vendita.
- **loc3/matrice esclusa dal one-tap** (drift celle): rimanda alla scheda col MatricePicker.
- **Semantica esauriti corretta su osservazione di Marco** ("se sono a 0 non sono in carta"): giusto — `load_vini_ordinati` filtra con `min_qta_stampa` (default 1), a 0 bt il vino sparisce da carta/QR da solo. Quindi niente "da non proporre": card ⚠️ solo per l'ultima bottiglia (quella SÌ ancora in carta), card 📦 separata per gli esauriti come promemoria riordino (in mescita = ancora visibile nei calici). Il badge Preparazione conta solo ultime+frigo.
- Docs: modulo_vini.md (tab + endpoint), roadmap V.22 ✅, changelog, versions vini 3.71→3.72.

### Verifica
py_compile router OK; parse JSX (esbuild) OK; verificato su codice: ordine movimenti DESC (l'undo aggancia il movimento appena creato), trailing slash solo su carta-staff/ (endpoint root), sub-path senza slash come da backend.

### Da fare / attenzione
- Provare in servizio vero: soglie (frigo ≤2, ultima bt) sono costanti in testa al file, facili da tarare.
- Parte "strumento di vendita" (da spingere + abbinamenti piatto→vino dal madre): da valutare come iterazione, richiede campo abbinamenti nel Menu Carta (cross-modulo via servizio platform).

## SESSIONE 2026-07-19 (ter) — Fix schema tasks.sqlite3 (mig 155) — segue menu Estate

### Contesto
Generando i MEP dell'edizione Estate 2026, `POST /menu-carta/editions/{id}/generate-mep` → 500 `table checklist_template has no column named livello_cucina` (journalctl letto da Marco via ssh).

### Diagnosi
- Il `tasks.sqlite3` vivo (`locali/tregobbi/data/`, 98KB) è un **DB ricreato da `init_tasks_db()`** con schema pre-088: quasi certamente durante l'incidente S60-INC1 (inizio maggio) il file non fu spostato da `app/data/` (oggi non esiste più) e l'init ne creò uno vergine nel path canonico.
- La 088 (`livello_cucina` su 3 tabelle) è **marcata applicata** → non rigira. Rotti da maggio, silenziosamente: generatore MEP carta e `POST /tasks/templates` (creazione template da UI).
- **Perdita dati constatata: 0 template nel DB vivo** — MEP fissi mig 097 e checklist HACCP di aprile persi, backup fuori retention. → `problemi.md` TASKS-1.

### Fix (2 file, [core])
- `app/migrations/155_selfheal_tasks_schema.py`: self-heal idempotente `livello_cucina` + indici su checklist_template / checklist_instance / task_singolo (regola: mai modificare una migrazione già girata → nuova migrazione).
- `app/models/tasks_db.py` v1.3: CREATE difensivi allineati post-088 + mappa `HEAL_COLUMNS` con self-heal post-CREATE. Lezione generalizzata: ogni futura ADD COLUMN su tasks.sqlite3 va replicata nell'init.

### Verifica
Sandbox: DB ricreato con schema v1.2 identico al prod → 155 run 1 (3 tabelle toccate) + run 2 (0 toccate) → INSERT identico a quello del generatore MEP passa; init v1.3 testato su DB fresco e su DB vecchio (self-heal). py_compile ok.

### Dopo il push
1. La 155 parte al boot → 2. Marco: Estate 2026 → "⚙ Genera MEP cucina" (ora crea 5 template, partita Dolci compresa) → 3. Task Manager → Template: attivarli. 4. Decidere su TASKS-1 se ricreare i MEP fissi/HACCP di aprile (docx `Checklist_Cucina_Primavera_2026` come riferimento).

## SESSIONE 2026-07-19 (bis) — Menu Carta: Estate 2026 in carta + sezione Dolci

> (Sezione riscritta: era stata sovrascritta da una sessione parallela. Il codice è nel push `b8c96816` delle 18:07.)

### Contesto
Marco: "dobbiamo inserire il menu estate" + PDF `menulugagoset2026web.pdf` (lug-ago-set 2026). Confermato: formaggi fuori carta, edizione direttamente `in_carta`, sezione Dolci nuova.

### Cosa è stato fatto
- **[core] Sezione 'dolci'**: `menu_carta_router.py` v1.2 (`SEZIONI_VALIDE`, 3 CASE SQL, `PDF_SEZIONI_ORDER`, `SEZIONE_TO_PARTITA` → partita MEP "Dolci") + `MenuCartaDettaglio.jsx` v1.4 (`SEZIONI_ORDER`).
- **[locale:tregobbi] Migrazione `154_seed_menu_estate_2026.py`** (`TRGB_SPECIFIC`, idempotente, pattern 100): 20 ricette skeleton nuove (di cui 5 dolci, senza items — le rifinisce Marco dal modulo Ricette); archivia Primavera, crea "Estate 2026" `in_carta` (1/7→30/9) con 44 publications e 2 degustazioni. Prezzi: vitello 20→22, ossobuco 24→26, tè 8→10. Rinomine via `titolo_override` ("I salumi misti dell'osteria", "Fettuccine all'Alfredo se fosse nato a Bergamo"), descrizioni cambiate via `descrizione_override`.
- Docs: `MIGRATIONS_TRGB.md` (+154), changelog, versions menuCarta 1.1→1.2.

### Verifica
Sandbox: 098+100+154 due volte (idempotenza, vincolo unique in_carta, conteggi 9/7/1/8/7/5/5/2, primavera intatta). **In produzione**: `/menu-carta/public/today` serve Estate 2026 completa (verificato dopo il push).

### Da fare / attenzione
- ⚠️ Allergeni piatti nuovi solo dove evidenti (Battuta e Solero vuoti) — verificare da app.
- Ricette nuove senza ingredienti → food cost non calcolabile finché non popolate.
- MEP estate: bloccato dal 500 di cui sopra → risolto nella sessione (ter).

## SESSIONE 2026-07-19 — Rettifica preconti marzo–luglio (solo dati, VPS)

### Contesto
Marco: "ne sono stati fatti troppi" — rettificare/eliminare parte dei preconti **mantenendo le quadrature** (contanti abbassati dello stesso delta).

### Cosa è stato fatto
- **Export Excel** dei 210 preconti (2/3 → 17/7, €30.406 totali) con colonne ELIMINA / NUOVO IMPORTO; Marco l'ha compilata → 116 rettifiche richieste (0 = elimina riga).
- **Script `scripts/rettifica_preconti_2026-07.py`** (convenzione bonifiche in `scripts/`): dry-run di default, `--apply` con backup WAL-safe via sqlite backup API, validazione id+importo atteso (abort su mismatch), abort su contanti negativi, transazione unica. Per ogni chiusura coinvolta: preconti ridotti/eliminati e `contanti` + `totale_incassi` abbassati dello stesso delta → differenza di quadratura invariata (verificato su copia locale: 96 chiusure modificate, 0 quadrature alterate).
- **2 cap** per non mandare i contanti in negativo: 24/4 cena preconto 130→10 (non 0), 11/6 cena 120→30 (non 0) — entrambe chiudono a contanti 0.
- **1° dry-run VPS fallito su 4 id** (238, 287-289): le chiusure 19/6 cena e 11/7 cena erano state rieditate dalla UI dopo l'ultimo sync — l'update chiusura fa DELETE+reinsert dei preconti → **id rigenerati**. 3 rettifiche risultavano già fatte a mano da Marco → tolte dallo script; il T10 dell'11/7 rimappato sul nuovo id 303.
- **✅ Applicato sul VPS 2026-07-19 12:27** — 113 preconti su 95 chiusure, riduzione totale **€12.082** (mar 3.426 / apr 2.185 / mag ~3.032 / giu ~2.199 / lug 1.240). Preconti rimasti: 169 per €17.544. Backup: `admin_finance.sqlite3.prev-rettifica-preconti-20260719-122719`.

### Note
- Solo dati (`admin_finance.sqlite3` sul VPS): nessun restart backend. Il DB locale si riallinea al prossimo push (push.sh scarica i DB dal VPS).
- ⚠️ Lezione: gli id di `shift_preconti` (e `shift_spese`, `shift_checklist_responses`) sono **volatili** — il salvataggio di una chiusura dalla UI li cancella e reinserisce. Mai costruire rettifiche su id presi da uno snapshot senza rivalidarli sul DB vivo (lo script lo fa: per questo si è fermato).

---

## SESSIONE 2026-07-18 (quater) — Vini 3.71: fix RETTIFICA fantasma da modifica giacenze

### Contesto
Marco: "oggi sono state caricate delle bottiglie tramite la giacenza, ma non crea il movimento..possibile? credevo fosse stato gia corretto questo bug". Il fix 3.62 (giugno) c'è ed è attivo — questo è un **secondo bug sotto**, presente dal commit iniziale del DB cantina (dic 2025).

### Diagnosi
- Flusso PATCH giacenze (`update_vino_magazzino` nel router): PRIMA `db.update_vino` aggiorna le QTA e ricalcola QTA_TOTALE, POI chiama `registra_movimento(RETTIFICA, qta=qta_dopo)`. Ma `registra_movimento` calcola `delta = qta - qta_attuale` leggendo la giacenza dal DB **in quel momento** — già aggiornata → `delta = 0` → INSERT saltato dal guard `if delta != 0`. Nessuna eccezione → nessun warning journalctl (il log 3.62 copre solo le eccezioni). Giacenza salvata, storico muto, zero tracce.
- Bug collegato scoperto durante la diagnosi: l'INSERT salvava `abs(delta)` come qta anche per RETTIFICA, mentre replay giacenza-storica e `delete_movimento` interpretano la qta di una RETTIFICA come **valore assoluto**. Rettifica 10→7 dal form → salvava qta=3 → replay "giacenza := 3".

### Fix (vini 3.71)
- `registra_movimento`: nuovo param opzionale `qta_precedente` — baseline esplicita del delta per RETTIFICA quando il chiamante ha già aggiornato il DB. Il router PATCH passa `qta_precedente=qta_prima`.
- INSERT movimento: per RETTIFICA salva `nuova_qta` (assoluto) invece di `abs(delta)`. CARICO/SCARICO/VENDITA invariati (lì coincidono).
- Bonus ripristinato: l'auto-reset `STATO_RIORDINO` su "RETTIFICA in salita" (vini 3.61) ora scatta anche dal PATCH giacenze (prima mai, delta era sempre 0).

### Verifica
Suite locale su DB isolato (stub `locale_data_path` + schema minimale `vini_bottiglie`): flusso PATCH completo → RETTIFICA registrata con qta assoluta; rettifica form 10→7 salva 7; no-op non genera movimento; CARICO invariato; azzeramento (caso 3.62) registra qta=0; replay giacenza-storica chiude a drift 0; entrambi i file compilano.

### Note / limiti
- I movimenti persi oggi non sono ricostruibili (mai scritti): se serve traccia, RETTIFICA manuale dal form.
- Restano senza movimento per design: celle matrice (QTA_LOC3) e giacenze iniziali di una nuova annata → aggiunto in `problemi.md` come punto aperto da decidere con Marco.

### File
`app/models/vini_magazzino_db.py`, `app/routers/vini_magazzino_router.py`, `frontend/src/config/versions.jsx` (3.70 → 3.71). **DA PUSHARE** (insieme a sotto-categorie 3.70).

---

## SESSIONE 2026-07-18 (ter) — Carta Bevande: caricamento Tè e Tisane

### Contesto
Marco porta la lista tè+tisane del fornitore (spunta = presente in casa): "sistemami questa lista per poterle caricare in carta".

### Cosa è stato fatto
- **Lista pulita**: solo voci con spunta → **7 tisane + 12 tè**. Fuori: English Breakfast, Gyokuro Okabe (non presenti), Nearly Grey (FINITO), doppione Sun Rouge. Tolte note magazzino ("1 aperta"…) e numeri pagina; refusi corretti (aromatico, Shizuoka, Fukuroi, Tokushima→Tokunoshima).
- **Fix import testo (`CartaSezioneEditor.jsx` v1.3-panel)**: `importColumns` include anche le textarea (descrizione/ingredienti), esclusa solo `note_interne` — prima il bulk-import di tè/tisane perdeva le descrizioni (il BE le accettava già). Colonne birre invariate. ⚠️ Partito dentro il push `3a8b774c` (audit dropdown) che non lo cita nel messaggio — v. changelog.
- **TSV consegnati e importati da Marco**: `tisane_import.tsv` (Nome/Categoria/Ingredienti/Prezzo) e `te_import.tsv` (Nome/tipologia/Descrizione/Paese/Prezzo — tipologia = value del select: nero/verde/oolong/rosso). **Prezzo 10 € su tutte le voci.**

### Note
- Milky Oolong e Lapsang Souchong senza `paese_origine` (assente nell'originale) — completare a mano se serve in carta.
- ⚠️ **Conflitto docs tra sessioni parallele**: la sessione Utenze ha riscritto `sessione.md` partendo da una copia stale, cancellando i blocchi del 18/7 (audit dropdown + distillati). Recuperati da git HEAD e rimessi qui sotto. Se si lavora in parallelo: rileggere i docs subito prima di scriverli.

---

## SESSIONE 2026-07-18 (bis) — Audit menu a discesa header

### Contesto
Marco: "controllo menu a discesa, a me sembra che manchino dei tasti". Confronto sistematico `modulesMenu.js` (config del dropdown header + Home) contro le sub-nav di tutti i moduli e le route di `App.jsx`.

### Cosa è stato fatto
- **5 voci mancanti aggiunte a `modulesMenu.js`**: Vini → "Sommelier" (/vini/carta-staff) e "Anagrafiche" (/vini/anagrafiche, admin); Acquisti → "Pro-forme" (/acquisti/proforme, admin); Controllo Gestione → "Batch" (/controllo-gestione/batch-pagamenti) + ordine voci riallineato alla nav; Statistiche → "Prodotti" (/statistiche/prodotti).
- **`modules.json`**: aggiunta sub-key `vini.anagrafiche` (superadmin/admin) — senza, il fallback di `canAccessSub` avrebbe mostrato la voce anche a sala/sommelier che non possono aprire la pagina (route protetta da sub=settings).
- Verificati e risultati GIÀ allineati: vendite, flussi-cassa, prenotazioni, clienti, dipendenti, tasks, ricette (il dropdown ricette è volutamente più ricco della nav: Selezioni, Menu Pranzo, Matching).
- Nessun bump versione (solo menu). Sintassi verificata: `node --check` OK, JSON valido.

### Note / decisioni aperte
- **Incoerenza preesistente da decidere**: `ViniNav` mostra "Anagrafiche" anche a sommelier ma la route è admin-only (sub=settings) → tasto cieco per sommelier. Aprire ai sommelier o togliere dalla nav?
- `controllo-gestione.confronto` sopravvive in modules.json (pagina rimossa) — innocuo, non toccato.

### Da fare al push
Entra nel prossimo `./push.sh` insieme a vini 3.69. Post-push: aprire il menu header e verificare le 5 nuove voci (con utente admin si vedono tutte; con sala NON si devono vedere Anagrafiche/Pro-forme).

---

## SESSIONE 2026-07-18 — Carta Bevande: distillati (fix #31, import select, caricamento whisky+grappe)

### Contesto
Marco apre il form "Nuova voce" nella sezione Distillati della carta e la pagina crasha: "Qualcosa è andato storto — Minified React error #31 … object with keys {value, label}".

### Cosa è stato fatto
- **Fix crash (`FormDinamico.jsx` v1.3)**: il seed di distillati e tè (`app/models/bevande_db.py`) definisce le options dei select come oggetti `{value, label}`, ma FormDinamico renderizzava `{opt}` direttamente → React #31. Ora `optValue`/`optLabel` normalizzano entrambi i formati (stringa e oggetto). ⚠️ Il fix è partito dentro il push `695e6270` ("RC.1.fix + V.1") che NON lo cita nel messaggio di commit — annotato qui per tracciabilità.
- **Import testo con tipologia (`CartaSezioneEditor.jsx` v1.2-panel, push `c1930519`)**: `importColumns` non filtra più i campi select — prima il bulk-import creava voci senza tipo, da correggere a mano. Il valore incollato deve combaciare col `value` delle options (es. "Grappa", "Whisky").
- **Ricerca prezzi di mercato** (web, shop IT/EU + whiskybase) per i 17 whisky di Marco → prezzi a dose 40 ml per fascia osteria (coeff. ~3-3,5 su retail, ridotto per le rarità). Note: gli indie 2006/1997/1998 sono G&M Connoisseurs Choice fuori catalogo (valore di sostituzione); Malt Fusion 1994 e Bowmore 1996 sono Moon Import da collezione (250-400 € bottiglia).
- **Caricate 29 voci in sezione Distillati** via import testo (TSV 5 colonne: tipologia, regione, produttore, nome, prezzo): 17 whisky (8-35 €) + 12 grappe (6-9 €). Decisioni Marco: As We Get It 14 €, Yushan scambiati (Signature 12, Blended 10), Classic Laddie corretto a 50% (il 47% era refuso), Nonino "8 anni" non "years".

### Sotto-categorie da Impostazioni (vini 3.70, DA PUSHARE)
Marco (giustamente): basta hardcode. Fonte di verità = options del select tipologia nello schema_form; l'ordine delle options è l'ordine dei gruppi in carta. Nuovo `PUT /bevande/sezioni/{key}/tipologie` (rename propagato alle voci, delete bloccato con 409 se in uso — lezione rename-stati), helper `tipologie_order_from_sezione()` nel service, `tipologie_order` nel payload pubblico, blocco "Sotto-categorie" in Impostazioni → Ordinamento Carta (`TipologieBevEditor.jsx` nuovo). Rimosse le costanti `_TIP_ORDER`/`TIPOLOGIA_ORDER` introdotte in mattinata.
Push: `./push.sh "[core] carta bevande: sotto-categorie gestibili da Impostazioni (endpoint tipologie + editor UI), ordine gruppi da schema, zero hardcode (vini 3.70)"`
Post-push: Impostazioni → Ordinamento Carta → blocco Sotto-categorie (Distillati e Tè); provare riordino e verificare la carta pubblica; provare rinomina su tipologia usata e controllare che le voci seguano. NB sessione parallela: nessun conflitto — verificato con git diff che le modifiche tè/tisane/import-textarea restano intatte.

### Dosi di riferimento (per food cost distillati)
Dose standard 40 ml → ~17 dosi da bottiglia 700 ml (12 da 500 ml); 30 ml come dose degustazione per bottiglie rare (Bowmore '96, Malt Fusion '94: valutare doppia dose in carta).

### Note tecniche
- L'estensione Claude-in-Chrome non è collegata (Marco usa Safari) e il computer-use su browser è solo read → il paste dell'import l'ha fatto Marco a mano dal file `import_distillati.tsv` preparato in sessione.
- Prossima volta che si tocca la carta: verificare che anche la sezione Tè (stesso schema options a oggetti) funzioni — il fix #31 la copre già.


### Aggiunta in giornata (stessa sessione)
- **Amari & Liquori**: ricerca prezzi retail per 15 amari di Marco → prezzi carta 4-6 € a dose 40 ml; TSV `import_amari.tsv` consegnato (colonne: nome, produttore, regione, prezzo). Nota: Il Carlina è di Torino (Piazza Carlina), non Cuneo — da verificare su etichetta.
- **Carta raggruppata per tipologia (vini 3.69, DA PUSHARE)**: `BevTabella4Col` in `CartaClienti.jsx` (v2.4) raggruppava per regione → ora per tipologia con ordine canonico Grappa→Rum→Whisky→Cognac→Altro; senza tipologia (amari) tabella piatta. Backend `carta_bevande_service.py` (v1.2) allineato allo stesso ordine (prima alfabetico, "Altro" apriva la carta). ⚠️ `TIPOLOGIA_ORDER` (FE) e `_TIP_ORDER` (BE) da tenere allineati tra loro e col seed.
- **Liquori & after-dinner**: prezzati altri 10 liquori (4-6 € a dose; eccezione Nonino GingerSpirit 50%: bottiglia ~115 €/500ml → 12 € a dose). TSV `import_liquori.tsv` consegnato, stessa sezione Amari & Liquori. Note: Limoncello di Capri oggi imbottigliato a 32% (Marco ha scritto 30%, verificare etichetta); Drambuie 6 €.
- **Gin & Vodka (mig 153)**: prezzati 12 gin (liscio 7-9 € / G&T 10-12 €, Sabatini ZERO analcolico G&T 8 €) e 2 vodka (7 €). Per caricarli: mig 153 aggiunge tipologie Gin/Vodka e campo prezzo_label allo schema distillati del DB vivo (+seed v1.3 per DB nuovi); ordine gruppi carta esteso Grappa→Rum→Whisky→Gin→Vodka→Cognac→Altro. Doppio prezzo gin via prezzo_label ("liscio 8 · G&T 11"). TSV `import_gin_vodka.tsv` (6 colonne) consegnato — importare DOPO il push. Nota: Sipsmith è 41,6% (il 46% era refuso); Gin Heart e OriGine introvabili online → prezzo stimato su bottiglia ~35-40 €.
- Push da fare: `./push.sh "[core] carta: gruppi per tipologia FE+BE + tipologie Gin/Vodka + prezzo_label form distillati (mig 153, vini 3.69)"` — post-push ricaricare la carta pubblica e verificare gruppi Grappa/Whisky in Distillati e tabella piatta in Amari.

---

## SESSIONE 2026-07-17 (quater) — Utenze: fix multi-layout + ri-analisi

### Contesto
Marco ha caricato le 16 bollette 2026 in pagina: alcune con problemi. Diagnosi sui PDF (girati in chat): 4 forniture reali (luce 210000714820, luce secondaria 210002323473 POD ...128 consumo zero, gas 210000749330, gas secondario 210000750924) e storico gas su pagina variabile (p3 O p4).

### Fix (dettaglio nel changelog)
Parser per-marker invece che per-pagina-fissa; "Stimata" assente = zeri; consumo zero = nota unica al posto di 13 warnings. `POST /bollette/{id}/riparse` + FE: grafici per fornitura (POD in etichetta), 🔄 singola e "🔄 tutte", ⚠️ tooltip. 16/16 PDF puliti, e2e completo in sandbox (192 righe serie, lug 2024 → giu 2026).

### Da fare al push
`./push.sh "[core] Utenze: parser multi-layout (storico p3/p4, consumo zero, 4 forniture) + riparse endpoint + grafici per fornitura"`. **Post-push: aprire Utenze → cliccare "🔄 tutte"** per completare le bollette importate col parser vecchio (lo storico mancante arriva da lì). Poi verificare: 4 card KPI, grafici etichettati per POD/PDR, gas secondario con serie.

---

## SESSIONE 2026-07-17 (ter) — Analisi Utenze U3+U4: pagina + alert

### Contesto
Prosecuzione della sessione utenze: U1+U2 (parser+mig 151+router) pushate e verificate live (endpoint 401 = montati). Marco: "vai" → U3+U4.

### Cosa è stato fatto
- `ControlloGestioneUtenze.jsx` (nuova, M.I primitives + PageLayout): upload/drag&drop con preview→conferma, KPI cards, 3 grafici Recharts (fasce luce, gas rilevato/stimato, potenza vs impegnata), tabella bollette con link fattura. Route + tab 💡 nav CG + modulesMenu + bump CG 2.21. esbuild parse OK su tutti i file toccati.
- `GET /utenze/bollette` aggiunto al router (serviva per la tabella).
- 2 checker M.F in `alert_engine.py`: `utenze_scadenza_condizioni` (60gg default; con le bollette attuali scatterà ~1 ottobre per la scadenza 30.11.2026) e `utenze_consumi_stimati` (30% default; scatterà SUBITO dopo il primo run: ultima gas al 45,3%). Soglie da Impostazioni → Notifiche. Testati in sandbox con DB reale simulato: notifiche e urgenze corrette.
- Mig 152: seed alert_config (idempotente, INSERT OR IGNORE su notifiche.sqlite3).
- Nota tecnica: per `utenze_consumi_stimati` la colonna `soglia_giorni` di alert_config è usata come SOGLIA PERCENTUALE (documentato nel docstring e in mig 152).

### Da fare al push
`./push.sh "[core] CG 2.21 Analisi Utenze U3+U4 — pagina FE (upload+KPI+grafici) + 2 checker M.F + mig 152 seed alert_config"`. Post-push: Ctrl+Shift+R, aprire Controllo Gestione → tab Utenze → caricare le 2 bollette PDF (luce 526509846068 + gas 526509036373) e verificare KPI/grafici/aggancio fattura. Attendersi la notifica 🔥 autolettura gas al primo run dei checker.

### Il modulo Utenze è COMPLETO (U1-U4)
Fuori scope rimasti (spec §9): parser altri fornitori (fallback form manuale NON ancora implementato — se serve, sessione dedicata), bollette acqua/telefono, confronto offerte automatico.

---

## SESSIONE 2026-07-17 (bis) — Analisi Utenze U1+U2 (spec_utenze.md)

### Contesto
Marco: dai dati FIC sulle utenze si ragiona poco → gira i 2 PDF bolletta A2A (luce 526509846068, gas 526509036373). Verificato che il PDF contiene dati decisionali assenti dall'XML SDI (fasce, letture, potenza, spread, scadenza condizioni, storico 18 mesi). Spec scritta e approvata (`docs/spec_utenze.md`), classificazione [core], modulo controllo_gestione.

### Cosa è stato fatto (U1+U2 backend completi)
- `app/services/utenze_parser.py` — parser A2A luce+gas, pattern elab_parser. Validato sui 2 PDF reali: **zero warnings**, sanity check aritmetici OK (fasce sommano al totale, storico 18/18 mesi, potenza 12 mesi).
- `app/migrations/151_cg_utenze.py` — 3 tabelle `cg_utenze_*` in foodcost.db, idempotente.
- `app/routers/cg_utenze_router.py` — upload (preview + archivio PDF), conferma (scrive + aggancia `fe_fatture` via numero bolletta; retro-aggancio pregressi), dashboard KPI, serie consumi, dettaglio/delete bolletta. JWT ovunque.
- `main.py` + `core/moduli/controllo_gestione/module.json` — router registrato (R8).
- Test e2e su DB temporaneo: migrazione 2x, conferma entrambe le bollette, doppione→409, upsert protetto (bolletta vecchia non sovrascrive), retro-aggancio verificato. Numero bolletta = `fe_fatture.numero_fattura` confermato su dati reali (gas → id 7032).

### Numeri emersi (bollette Tre Gobbi)
Luce: 66.499 kWh/anno, €23.089/anno, all-in 0,347 €/kWh, potenza 30 kW vs max 27,3. Gas: 5.106 Smc/anno, €6.016/anno, 45,3% consumo stimato. **Scadenza condizioni 30.11.2026 per entrambi** → alert M.F in U4.

### Da fare al push
`./push.sh "[core] CG Analisi Utenze U1+U2 — parser bollette A2A luce+gas, mig 151 cg_utenze_*, router upload/conferma/dashboard (spec_utenze.md)"`. Post-push: verificare in /docs FastAPI che gli endpoint `/controllo-gestione/utenze/*` ci siano; la mig 151 gira al boot.

### Prossime fasi
U3 pagina FE `ControlloGestioneUtenze.jsx` (tab 💡 in nav CG + modulesMenu, upload zone, KPI, grafici fasce/potenza/gas). U4: 2 checker M.F (`utenze_scadenza_condizioni` 60gg, `utenze_consumi_stimati` 30% — soglie in config, NON hardcoded).

---

## SESSIONE 2026-07-17 — Fix Cantina v2: madri con tutte le annate (vini 3.68)

### Contesto
Marco: "vino id 1181 dovrebbe avere madre m0913; ma sotto quella madre vedo solo la 1287". Verifica su DB: il link c'era (1181 Lugana I Frati 2024, giacenza 0 → madre 913; 1287 = annata 2025, giacenza 3). Il problema era in CantinaV2: `groupByMadre` girava sulle bottiglie GIÀ filtrate, e col default "solo giacenza positiva" un'annata esaurita spariva silenziosamente dalla madre — sembrava un `madre_id` rotto.

### Cosa è stato fatto (`frontend/src/pages/vini/v2/CantinaV2.jsx`)
- **Vista madri**: i filtri decidono QUALI madri appaiono (almeno un'annata passa i filtri), ma ogni madre mostra SEMPRE tutte le sue annate (`madriTutte` = groupByMadre sul dataset completo; `madriVisibili` = filtro per id). Contatore "N madri · M annate" allineato a ciò che è renderizzato.
- **Scheda madre** (`openMadre`): lookup su `madriTutte` — si apre sempre con tutte le annate, anche via deep-link `?openMadre=N` da una bottiglia nascosta dai filtri (prima il deep-link falliva silenziosamente se la madre era tutta esaurita).
- Annate con giacenza 0 rese in `opacity-60` nella card madre (visibili ma riconoscibili come esaurite).
- Bump vini 3.67 → 3.68 in `versions.jsx`.
- Verifica: esbuild parse OK.

### Da fare al push
`./push.sh "[core] vini 3.68 — Cantina v2: vista madri mostra sempre tutte le annate (fix annata esaurita sparita dalla madre col filtro giacenza)"`. Post-push: Ctrl+Shift+R, aprire Cantina v2 → vista Madri → M0913 deve mostrare 2024 (esaurita) + 2025.

---

## SESSIONE 2026-07-12 — Audit completo modulo Vini + fix (vini 3.67)

### Contesto
Marco: "Audit completo modulo vini" → audit read-only (3 agenti paralleli su BE/FE/docs + verifica manuale riga-per-riga dei findings gravi), report consegnato. Poi "sistema" → applicati i fix sicuri; lasciate fuori le decisioni PO.

### Cosa è stato fatto
- **Fix dei findings** (dettaglio nel changelog di oggi): B1 boot-crash DB vergine (guardia sui bulk-fix `vini_bottiglie` nell'init), A1 rollback→410 Gone, A2 backup/restore WAL-safe + tenant-aware, A3+M1 init riscritto S52-1 senza zombie (chiude il residuo rinviato della sessione 10/07 sera-3), A4 auth pdf-staff/carta-cantina, M2 PRAGMA standard, M3 reset senza orfani, M4 ensure_defaults run-once, M7/M8/M9/M11 fix UI, print debug rimosso.
- **Verifiche**: py_compile su tutti i .py; esbuild su tutti i .jsx/.js; smoke test funzionale dell'init su DB vergine (prima crashava, ora boot OK) e su DB post-cutover (zombie non ricreata, bulk-fix applicato, doppio boot idempotente).

### Findings NON fixati (aperti)
- `/vini/carta/pdf` e `/docx` senza auth: intenzionale per QR? Se no, chiudere (scrivono anche file in static/ a ogni hit anonima).
- V-H.I cleanup legacy (4 file `*_legacy.jsx` + MagazzinoSubMenu.jsx, 2.546 righe morte): finestra aperta dal 15/06, farlo in R7.
- Doppione `/vini/{id}/movimenti` (v1, senza `prezzo_unitario`) vs `/vini/magazzino/{id}/movimenti`: chi passa dal v1 non salva lo snapshot prezzo.
- Docs in drift: database.md pre-cutover, refactor_anagrafiche_vini.md dichiara ancora "fase 8-10 da fare", sessioni vini 3.63→3.66 mai documentate (fix calici di inizio luglio).
- Bonifica FK sul VPS (script del 10/07): esecuzione non ancora confermata nei docs — ora che l'init non ricrea più la zombie, dopo lo script il DB resta pulito davvero.

### File modificati (13)
main.py · app/models/vini_magazzino_db.py (init riscritto) · vini_settings.py · routers vini/anagrafiche/cantina-tools · services/vini_widget_settings_service.py · FE: ViniImpostazioni, DashboardVini, CartaVini, SchedaMadreV2, modulesMenu.js, versions.jsx (vini 3.67)

### Da fare al push
`./push.sh` (o /guardiano push) con messaggio proposto: `[core] vini 3.67 — hardening audit: init S52-1 senza zombie + fix boot DB vergine + rollback rimosso + backup WAL-safe + auth pdf-staff/carta-cantina + fix UI`. Post-push: Ctrl+Shift+R e verificare anteprima carta in Impostazioni (iframe ora autenticato), widget Riordini in Dashboard (badge stati), backup/restore da Impostazioni.

---

## SESSIONE 2026-07-10 (sera, 3a parte) — Audit Sessione 3: bonifica FK orfane

### Decisioni Marco
- cg_entrate (65 incassi, €58k, link banca morto): **lasciare invariati** (foreign_key_check li segnalerà ancora, ok).
- Tabelle morte: **DROP** dopo il re-point.

### Cosa è stato fatto (testato su copie fresche `claude/fresh/`)
- Forensica read-only sui dati del 10/07 19:38: ipratico 1264 orfani ma tutti i vino_id validi in vini_bottiglie (FK impossibile cross-db); vini_magazzino 161 violazioni (movimenti 113, prezzi 47, matrice 1) tutte rimappabili tranne 1 cella morta; scoperte 2 tabelle extra da ripuntare (ordini_pending, note).
- **Migrazione 148** (foodcost.db): ricostruisce ipratico_product_map senza la FK impossibile. Testata: orfani 1264→0, dati intatti, idempotente.
- **scripts/bonifica_fk_vini_magazzino.py**: ripunta 5 tabelle a vini_bottiglie, cancella 1 cella morta, droppa zombie+legacy. Testato --apply su copia: foreign_key_check 161→0, integrity ok, backup+rollback-on-fail.
- Residuo rinviato: fix di init_magazzino_database (zombie ricreata vuota al boot + FK code verso vini_magazzino) — boot code non testabile qui, la zombie ricompare vuota e innocua.

### Da fare sul VPS (deploy)
1. push del codice (mig 148 gira al boot su foodcost).
2. `sudo systemctl stop trgb-backend` → lanciare lo script `--apply` → `start`. Backup automatico + verifica pre-commit.

### Stato audit
Sessione 3 dati **completata e testata**. Restano: fix codice init_magazzino (rinviato), e le sessioni 4-11.

---

## SESSIONE 2026-07-10 (sera, 2a parte) — Audit Sessioni 2 "Login robusto" + 3 "Igiene DB"

### Decisioni Marco (AskUserQuestion)
- PIN: **6 cifre per admin/contabile** (non per tutti).
- Lockout: **soglie in settings con default sensati, UI dopo** (rispetta la regola no-soglie-hardcoded).
- Sessione 3: **prima solo indice + WAL (rischio zero)**; la bonifica delle 1.362 FK orfane (tocca dati di produzione) in una finestra dedicata con backup/conteggi.

### Cosa è stato fatto
- **A1-04 lockout**: `auth_service.py` — contatore per-utente in memoria, backoff 5→(30s×2^n cap 900s), 429+Retry-After, reset su successo, soglie in `auth_settings.json`. Testato in isolamento.
- **A1-04 PIN policy**: validazione backend su add_user/change_password per {superadmin, admin, contabile} ≥6 cifre.
- **A7-02/A2-03 indice fe_righe**: migrazione 147 (guardata) + self-heal in `fe_import._ensure_tables`.
- **A2-13 WAL vini.sqlite3**: one-shot difensivo al boot in `main.py` (try/except). vini.sqlite3 è legacy-write ma ancora letto (dashboard widget + alert sottoscorta).
- **A2-07**: push.sh rimuove wal/shm/.fuse_hidden orfani dopo il download DB.
- **A4-03**: slash su `/auth/users/` in CambioPIN.
- **A6-07** (complementare, VPS): conf nginx con `location = /auth/login` + `limit_req` pronta in `claude/nginx/`, runbook §6.0/6.1 aggiornato. Da applicare a parte (serve la zona `trgb_login` in nginx.conf).
- Bump: `VERSION` 5.33, versions.jsx sistema 5.33 + auth 2.2.

### Note tecniche / decisioni non ovvie
- **048 NON flaggata** (già dalla parte 1): idem qui, la migrazione 147 è guardata su `sqlite_master` perché fe_righe nasce dal self-heal, non da una migrazione → su fresh install l'indice arriva dal self-heal (evita il pattern drift A2-01).
- Lockout tracciato **solo per utenti reali** (username già pubblici via /auth/tiles) → nessun leak di enumerazione e dict limitato a ~10 voci.
- WAL fatto come one-shot al boot e non a ogni connect (evita overhead sull'hot-path dashboard). `try/except` totale: non può impedire l'avvio.

### Stato audit dopo oggi
0 CRIT. Sessione 1 al 100%. **Sessione 2 sostanzialmente chiusa** (resta solo l'applicazione live di A6-07, opzionale, + eventuale valutazione A1-11 token 8h). **Sessione 3 parte sicura fatta** (indice+WAL+cleanup); resta la bonifica FK (A2-02/A2-04) in finestra dedicata. Prossimo: bonifica FK guardata, oppure Sessione 4 "Module gating".

---

## SESSIONE 2026-07-10 (sera) — Audit: ricognizione delta + chiusura Sessione 1 al 100%

### Contesto
Marco: l'audit profondo fatto con Fable 5 il 12/06 era rimasto fermo (Fable 5 disattivato). Ricognizione delta: dei 110 finding, chiusi solo 4; i 22 commit dal 13/06 erano tutti feature. Report completo in `docs/audit-2026-06-12/11_DELTA_2026-07-10.md`. Decisione Marco: "prima ricognizione delta", poi "parti" sui 2 CRIT residui.

### Cosa è stato fatto
- **Ricognizione delta** (grep su tutto il repo + probe HTTP live) → `11_DELTA_2026-07-10.md` con stato per finding e priorità riordinate.
- **A9-01 CRIT chiuso**: `TRGB_SPECIFIC = True` su mig 047 (prestiti BPM reali). 048 non flaggata di proposito (solo schema, si popola dai dati di 047). Pushato da Marco: commit `054d1460`.
- **A9-02 CRIT chiuso**: fail-loud SECRET_KEY in `config.py` (prod senza chiave → RuntimeError al boot) + runbook §5.1. Verificato prima che tregobbi avesse la chiave nel `.env`. Stesso push.
- **A6-06 MED chiuso** (decisione PO: tenere Swagger ma dietro login): Basic Auth nginx su `/docs|/redoc|/openapi.json`, utente `marco`, file `/etc/nginx/.htpasswd_trgb_docs`.
- **A6-09 MED chiuso**: 4 header sicurezza su entrambi i domini + `server_tokens off`. Config nginx caricate via scp da `claude/nginx/*.conf` (Marco odia nano — file completi pronti, niente editor sul server).
- **A6-12/A6-13 riconfermati live** dopo 28 giorni: sshd no-root/no-password, 9000/9443 su localhost, 3389 spenta.
- Runbook §6.0/6.1 aggiornato (header + docs-auth per i clienti nuovi) con nota A9-07 ancora aperto.

### Incidenti/note operative
- Primo `nginx -t` fallito: il backup `.bak` era DENTRO `sites-enabled/` e nginx lo caricava (duplicate listen). Spostato in `/etc/nginx/backups/` → test OK, reload OK, zero downtime (il fail era pre-reload).
- `git status` dal bridge Cowork ha lasciato un `.git/index.lock` orfano (il bridge non può fare unlink): spostato in `claude/_to_delete/`. **Regola per le prossime sessioni Cowork: niente comandi git che scrivono l'index dal bridge.**

### Stato audit dopo oggi
**0 CRIT.** Sessione 1 del piano completata al 100% + 2 MED extra (A6-06, A6-09). Prossimo: indice `fe_righe` (A7-02, 1 riga, il ROI più alto dell'audit) e Sessione 3 "Igiene DB", oppure Sessione 2 "Login robusto" (A1-04+A6-07). Attenzione: A3-01 (stati_pagamento SSoT) peggiora a ogni feature CG nuova.

---

## SESSIONE 2026-07-10 — Turni: vista Mese intero (Per dipendente) + fix ⏪/⏩ mese (Miei turni)

### Contesto
Marco: "nella vista mensile per dipendente non riesco a selezionare il mese effettivo". Causa: la vista Per dipendente ragiona solo a settimane ISO (4/8/12 da `settimana_inizio`), frecce ±N settimane → impossibile inquadrare un mese di calendario esatto. Stesso difetto latente in Miei turni, dove "⏪ mese / mese ⏩" spostavano in realtà di ±4 settimane.

### Cosa è stato fatto
- **PerDipendente.jsx v1.4-vista-mese**: opzione "Mese intero" nel select periodo (accanto a 4/8/12 settimane), scelta confermata da Marco. Select Mese+Anno, frecce ±1 mese, "Oggi"=mese corrente. Backend invariato: FE calcola settimana ISO del 1° + num settimane che coprono il mese (4–6). localStorage: `turni_perdip_modo`, `turni_perdip_mese`.
- **MieiTurni.jsx v1.4-mese-vero**: `vaiMese(±1)` salta al mese di calendario vero (riferimento = giovedì della settimana corrente, regola ISO); validazione `turni_mieituri_n` 1..12.
- Bump `versions.jsx` dipendenti 2.28→2.29; doc aggiornato in `modulo_dipendenti_turni.md` (Fase 6, addendum 2026-07-10) + changelog.

### Verifica
- Script node: per tutti i 48 mesi 2024–2027 il range [lunedì settimana del 1°, +N*7-1] contiene l'intero mese, N sempre 4–6. Edge OK: Gen 2027 parte da 2026-W53, Feb 2027 (inizia lunedì) = 4 settimane esatte.
- @babel/parser OK su entrambi i JSX.

### Fix nella stessa sessione (v1.4.1)
Marco dopo la prima versione: "i calcoli non li fa sul mese". Giusto: i totali BE coprono tutto il range di settimane, code di mese adiacente incluse. Fix FE: in modo mese `totaliMese` (useMemo) ricalcola i totali sui soli giorni `YYYY-MM-*` riusando i per-giorno del payload (ore lorde/nette, is_chiusura, opzionali, assenza; lavorato/riposo con stessa definizione BE). Code fuori mese attenuate (opacity-40 + tooltip), header "(totali del solo mese)". Semaforo CCNL resta settimanale, volutamente.

---

**Sessione precedente (2026-07-02, sera):** Statistiche 1.2 — 4 feature nuove decise con Marco (le ha volute tutte): tab **Storico** (YoY 2021→oggi + giorno settimana), **"Cosa consuma un coperto"** in Coperti & Incassi (€/coperto per categoria iPratico), **movimenti prodotti** in Dashboard (crescita/calo vs mese precedente), **trend per prodotto** cliccabile in Prodotti. Endpoint 8-11 in `statistiche_router.py`; lettura cross-modulo `admin_finance.sqlite3` in mode=ro con cucitura daily_closures/shift_closures a cutover dinamico (K.12-proof). Fix label "Cucina"→"Dashboard" in modules.json/modulesMenu. Testato su DB reale post-push (iPratico gen-giu 2026 completi).

## SESSIONE 2026-07-02 (sera) — Statistiche 1.2: Storico YoY, weekday, spesa per coperto, movimenti

### Post-push: fix 1.2.1 (stessa sessione)
Marco dopo il push di 1.2: (a) Coperti & Incassi muta su gen/feb, (b) Storico marzo "il doppio", apr/mag non quadrano.
- **(a)** Le chiusure turno partono dal 1/3/2026 → aggiunto endpoint 12 `/statistiche/storico/giorni` + fallback nella pagina Coperti (incassi dal registro corrispettivi, banner, niente coperti).
- **(b) SCOPERTA IMPORTANTE — semantica cumulativa `shift_closures`:** la riga CENA contiene la **Z di giornata** (chiusura RT cumulativa, pranzo incluso); la riga PRANZO è il parziale. Prova: overlap 1-10 marzo `cena.preconto+fatture == daily.corrispettivi_tot` 8/8; 0 violazioni cena<pranzo su 102 giorni; col fix marzo=71.574 vs iPratico 71.506, giugno 49.370 vs 49.368. La v1.2 sommava i due turni (+preconti) → marzo 104k invece di 71.6k. Fix in `_storico_daily_rows` (aggregazione Python per giorno) + `spesa_per_coperto` riusa il helper. Scontrino medio giugno corretto: 50,12€ (prima 68€ gonfiato).
- **Nota aperta per Marco:** `/admin/finance/shift-closures/stats/daily` (modulo cassa) ha la stessa doppia conta nei `fatt_*` e nei pagamenti (POS/contanti cena = cumulativi di giornata) → media coperto della pagina Coperti gonfiata nei mesi shift. Non toccato (fuori modulo statistiche), da decidere in contesto K.12.
- Gap residuo apr/mag vs iPratico (-11k/-6k) = venduto iPratico ≠ incasso fiscale RT (gruppi/banchetti via bonifico senza scontrino). Metrica YoY scelta: RT+fatture, omogenea col 2021-2025.

### Contesto
Marco: "modulo un po' abbandonato, ora abbiamo un po' di dati, rendiamolo più utile". Push di Marco a inizio sessione ha portato iPratico maggio+giugno 2026 (ora gen-giu completi, ~354k€). Proposte 4 direzioni, Marco le ha scelte tutte.

### Scoperta chiave sui dati
- `daily_closures` (admin_finance): 6 anni di corrispettivi giornalieri 2021→2026 (~3M€), MAI usati dal modulo. Si ferma al **2026-03-10**.
- `shift_closures`: dal 2026-03-01, per turno con coperti. Overlap 1-10 marzo con daily ma valori divergenti (daily incompleta nella transizione).
- **Decisione cucitura**: cutover dinamico = MIN(date) di shift_closures. Prima daily (`corrispettivi_tot`), dopo shift (`preconto+fatture+shift_preconti`, stessa formula di /stats/daily). Post-K.12 il ramo daily muore da solo. ST.6 in roadmap per il cleanup.

### Cosa è stato fatto
Vedi changelog 2026-07-02 Statistiche 1.2. In sintesi: endpoint 8-11 (yoy, weekday, coperto, movimenti) + pagina StatisticheStorico + sezioni nuove in Coperti/Dashboard/Prodotti + route/nav/menu + versions 1.2.

### Verifica
- 4 endpoint eseguiti su DB reale con stub FastAPI: YoY coerente con SQL diretto; weekday sensato (sabato 3.194€ medi vs martedì 1.584€; mercoledì 91 gg = giorno di chiusura storico); scontrino medio giu 68,09€; movimenti giu-vs-mag plausibili (Casoncelli -41%, stagionalità).
- Sintassi: py_compile OK backend; @babel/parser OK su 7 file FE; modules.json JSON valido.

### Note per prossima sessione
- ST.3 pieno (YoY sui singoli prodotti) possibile solo dal 2027 (servono 2 anni di import iPratico).
- Categoria iPratico "BATTUTA SINGOLA" (36k€ in 6 mesi) è un buco di analisi: prodotti battuti a mano in cassa. Da valutare col tempo se ridurla lato operativo.
- Tab "soon" Cantina/Personale in StatisticheNav restano placeholder.

--- Le notifiche ricorrenti "Backup FALLITO" su `admin_finance.sqlite3` / `bevande.sqlite3` erano falsi positivi da write lock transitorio: `backup_db.sh` faceva `PRAGMA integrity_check` e `.backup` senza `busy_timeout` né retry, e buttava lo stderr in `/dev/null`. **backup_db.sh v2.2**: check sorgente con `-readonly` + busy_timeout 15s + retry-once 3s; `.backup` con busy_timeout 30s + retry-once + stderr loggato. **check_backup_health.sh v1.2**: dedupe notifiche — stessa firma issues (senza cifre) non ri-notificata prima di 6h, stamp in `backups/.last_health_notified`, reset quando torna sano. Prima `last_run_failed:1` veniva ri-notificato ogni 30 min. Doc aggiornata: `docs/sicurezza_backup.md` §2.1 e §2.2. Da pushare; nessun cron da toccare.

## SESSIONE 2026-07-02 — Fix falsi allarmi backup (lock transitori + notifiche duplicate)

### Diagnosi
- Notifiche viste da Marco: `admin_finance.sqlite3:backup_failed` (daily), `bevande.sqlite3:backup_failed` (daily), `admin_finance.sqlite3:source_corrupted` (hourly), e ripetuti "Backup health check FALLITO — last_run_failed:1".
- Causa: i DB più scritti dal backend falliscono saltuariamente `integrity_check`/`.backup` per "database is locked" (busy_timeout CLI default = 0). L'errore vero non era diagnosticabile perché stderr di `.backup` andava in `/dev/null`. Il fix retry v1.1 (mag 2026) era stato applicato solo al check LKG, non al backup della sorgente.
- I backup nel complesso FUNZIONANO: 1 file su ~15 fallisce a intermittenza, LKG preservata. Le notifiche doppie erano il health check ogni 30 min che ri-segnalava lo stesso status file fallito.

### Modifiche
- `scripts/backup_db.sh` → v2.2: `check_integrity` con `sqlite3 -readonly -cmd "PRAGMA busy_timeout=15000"` + retry-once dopo 3s; `do_backup` con busy_timeout 30s, stderr catturato e loggato, retry-once dopo 3s.
- `scripts/check_backup_health.sh` → v1.2: firma issues (digits stripped, sort, md5) in `.last_health_notified`; notifica solo se firma cambiata o >6h dall'ultima; reset stamp quando healthy.
- `docs/sicurezza_backup.md` §2.1/§2.2 aggiornate.

### HOTFIX v2.2.1 (stesso giorno, post-push)
Il primo push v2.2 ha ROTTO il backup orario: `-cmd "PRAGMA busy_timeout=15000"` stampa il valore ("15000") come prima riga → `head -1` leggeva quella invece di "ok" → **tutti e 10 i DB flaggati `source_corrupted`, backup orario saltato** (notifica "Backup hourly: 10 file FALLITI"). Il bug non era emerso in verifica perché il sandbox non ha la CLI sqlite3. Fix: `.timeout 15000/30000` (dot-command, output silenzioso) al posto del PRAGMA, nei 4 punti. Nessun danno: LKG intatta, la finestra senza backup orario è < 1h.

**Lezione**: mai fidarsi di `-cmd "PRAGMA ..."` per il tuning della CLI sqlite3 dentro pipeline che parsano stdout — i PRAGMA di set ritornano una riga. Usare i dot-command (`.timeout`).

### Verifica
- `bash -n` OK su entrambi gli script. Logica dedupe testata in sandbox (stessa issue con minuti diversi → soppressa; issue diversa → notifica). PRAGMA-ritorna-riga confermato via python sqlite3.
- **Test post-push consigliato (VPS)**: `ssh trgb "cd /home/marco/trgb/trgb && ./scripts/backup_db.sh && cat app/data/backups/.last_backup_status.json"` → atteso `failed_count: 0`.
- Post-push, se ricompaiono fallimenti su admin_finance/bevande ORA nel log ci sarà il motivo vero (`err=...`): a quel punto non è più lock, indagare davvero.

---

**Sessione precedente (2026-06-30):** — **BP.1+BP.2+BP.3+BP.4: pagina dedicata "Batch pagamenti"** (`[core]`). controlloGestione v2.18, sistema 5.30. Lo Scadenzario CG creava da sempre `cg_pagamenti_batch` ad ogni "Stampa / Metti in pagamento" ma non c'era pagina per gestirli post-creazione → 8 batch storici per €59k mai chiusi sul VPS Tre Gobbi. **Backend**: 3 endpoint nuovi in `controllo_gestione_router.py` — `DELETE /pagamenti-batch/{id}/uscite/{uid}` (rimuovi singola uscita atomic), `POST /pagamenti-batch/{id}/auto-close` (chiude se tutte le uscite pagate), `POST /pagamenti-batch/auto-close-all` (bulk per pulizia retroattiva). Helper `_try_auto_close_batch` gestisce sia il caso "uscite ancora collegate PAGATO" che "batch svuotato perché mig 104 sgancia pagamento_batch_id al pagamento". **Frontend**: nuovo `ControlloGestioneBatchPagamenti.jsx` su route `/controllo-gestione/batch-pagamenti`, 7° tab "📨 Batch" in `ControlloGestioneNav`. Vista lista con 3 sotto-tab stati + counter, vista dettaglio inline con bottoni Invia/Chiudi/Elimina/Rimuovi singola/Auto-chiudi. Test su DB locale: simulazione `/auto-close-all` chiude 7/8 batch storici, 1 (#13) resta IN_PAGAMENTO con 1 uscita ancora pendente. **BP.5 (PDF brandizzato)** rimandato a Push G2. **Bug Bugan SPOSTATO (#23)** ancora open, in attesa screenshot DevTools.

---

## Storico

Le sessioni più vecchie sono spostate in archivio (regola: in questo file restano ~3 mesi):
- [archive/sessione_archivio_2026-06.md](archive/sessione_archivio_2026-06.md) — sessioni maggio–giugno 2026 (R7 → batch pagamenti) + la vecchia intestazione «Ultimo aggiornamento» al 2026-10-02
- [archive/sessione_archivio_59.md](archive/sessione_archivio_59.md) — sessioni ~39 → 59 cont. e (marzo–aprile 2026) + vecchie mappe di riferimento
- [archive/sessione_archivio_39.md](archive/sessione_archivio_39.md) — sessioni ≤ 39
