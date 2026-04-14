# TRGB — Archivio mini-sessioni (39 / 36 / 35 / 34 / 32)
> File archivio: dettaglio cronologico delle singole mini-sessioni appese in cima a `sessione.md` durante lo sviluppo 39.
> **Per il briefing della prossima sessione leggi `docs/sessione.md`** (riepilogo consolidato + piano prossimi passi).
> Questo file è solo "storia dettagliata" utile per ricostruire decisioni, parole di Marco e numeri di commit.
>
> **Sessione 39 — Navigazione — Eliminazione hub `*Menu.jsx`, entry role-aware diretto su Dashboard:**
> - Marco: _"questi menu di ogni modulo vanno eliminati"_ (screenshot di ViniMenu e DipendentiMenu) + _"i redirect deve sempre role-aware altrimenti aprire pagina che dice che non si hanno i privilegi per aprirla"_.
> - ✅ **Nuovo `components/ModuleRedirect.jsx`**: riceve `module` + lista ordinata `targets`, usa `useModuleAccess` per scegliere il primo path accessibile; se nessuno → pagina "nessun privilegio". Tutte le route hub in `App.jsx` sostituite con questo componente (App v5.1).
> - ✅ **Default ingresso modulo**: Vini→dashboard, Ricette→dashboard, Vendite→dashboard, Flussi→dashboard, CG→dashboard, Statistiche→dashboard, Prenotazioni→planning oggi, Clienti→dashboard, Dipendenti→dashboard.
> - ✅ **DashboardDipendenti nuova** (v1.0 placeholder): KPI headcount/scadenze/buste paga mese + 4 shortcut, usa endpoint esistenti, nessun backend nuovo.
> - ✅ **Vini**: `ViniNav` riordinato Dashboard→Cantina→Carta→Vendite→Impostazioni (v2.2), tab iPratico eliminata. `iPraticoSync` ora accetta prop `embedded` (v2.1) → renderizzato come sezione interna di `ViniImpostazioni` (v3.2), route `/vini/ipratico` redirige a `/vini/settings`. Decisione Claude: Marco aveva proposto "Import/Export come 2 voci", ma il workflow iPratico e' unificato → scelto **singola voce integrata** per non duplicare codice.
> - ✅ **DipendentiNav** v1.1: tab "Home" (hub) → "Dashboard".
> - ✅ **12 file `*Menu.jsx` hub eliminati fisicamente** (ViniMenu, RicetteMenu, CorrispettiviMenu, FattureMenu, AdminMenu, entrambi i DipendentiMenu, FlussiCassaMenu, ControlloGestioneMenu, StatisticheMenu, PrenotazioniMenu, ClientiMenu).
> - ✅ `modulesMenu.js`: aggiunta voce "Dashboard" nel sub dipendenti.
> - ✅ `versions.jsx`: bump vini/ricette/corrispettivi/fatture/flussiCassa/dipendenti/statistiche/controlloGestione/clienti/prenotazioni/sistema.
> - ❗ **Follow-up**: Dashboard Cucina (ricette) oggi e' scarna, da sistemare. Valutare se i link "← Home" nelle `*Nav.jsx` siano ridondanti col logo TRGB nell'header.
>
> **Sessione 39 — UI — Impostazioni uniformi al pattern Clienti + MieiTurni step:**
> - Marco: _"Quel selettore 4/8/12 settimane e' inguardabile. Metti due scorrimenti, uno sulla settimana e uno sul mese"_ + _"Uniforma la grafica a quella di Impostazioni gestione clienti"_.
> - ✅ **MieiTurni selettore a step**: rimosso `<select>` 4/8/12, sostituito da 5 bottoni compatti `⏪ mese / ◀ sett / Oggi / sett ▶ / mese ⏩`. Finestra resta 4 settimane, cambia solo la settimana di partenza.
> - ✅ **5 pagine Impostazioni uniformate al pattern Clienti** (sidebar w-56 + content, heading uppercase, items icona+label+desc, bg-neutral-50, max-w-7xl):
>   - Vini (amber) v3.0→v3.1
>   - Vendite (indigo) v4.0→v4.1
>   - Acquisti / FattureImpostazioni (teal) v2.0→v2.1
>   - **Cucina / RicetteSettings** (orange) v1.0→v1.1 — **rinominata "Strumenti Ricette" → "Impostazioni Cucina"** (titolo, nav tab, card menu); sezioni collassabili sostituite da sidebar (Export JSON, Schede PDF, Import JSON, Macellaio, Tipi Servizio)
>   - Flussi Cassa / BancaImpostazioni (emerald) v1.0→v1.1 — tab orizzontali → sidebar
> - Ogni modulo conserva la propria tinta brand. Dipendenti e Prenotazioni gia' uniformi, non toccati.
> - `versions.jsx`: vini, ricette, corrispettivi, fatture, flussiCassa, dipendenti bump.
>
> **Sessione 39 — Dipendenti Turni — Oggi uniforme + selettore reparto nella griglia:**
> - Marco: _"il tasto 'oggi' non ha lo sfondo sembra appoggiato a caso. Il tasto dei reparti incastralo nella tabella"_.
> - ✅ **Oggi uniformato** nelle 3 viste (Settimana/Mese/Dipendente): `bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 min-h-[44px]`.
> - ✅ **Tab reparti → dropdown dentro la griglia**:
>   - FoglioSettimana: dropdown nella cella top-left della tabella (rowSpan=2), prima colonna 80→140px. Fallback mobile sopra `VistaGiornoMobile`.
>   - VistaMensile: nuova riga thead colSpan=7 sopra i giorni.
>   - PerDipendente: inline a sinistra del selettore dipendente con divisore.
> - Bordo dropdown colorato con `reparto.colore` → identita' visiva coerente.
> - `versions.jsx`: dipendenti `2.20 → 2.21`.
>
> **Sessione 39 — Auth — Matrice ruoli per modulo + endpoint reset-to-seed:**
> - ⚠️ **Bug storico noto (B1 rivisitato)**: Marco ha segnalato che **dopo il riavvio del backend i privilegi moduli tornavano a valori hardcoded vecchi**. Causa: `DEFAULT_MODULES` nel router Python non era mai stato allineato al seed, e ogni bootstrap "pulito" (quando `modules.runtime.json` manca) ripristinava lo stato obsoleto.
> - ✅ **Matrice ruoli definitiva di Marco applicata in 3 livelli** (anti-regressione):
>   1. Seed `app/data/modules.json` — tracciato in git, bootstrap al primo boot.
>   2. `DEFAULT_MODULES` hardcoded in `app/routers/modules_router.py` — allineato 1:1 col seed, fallback ultima istanza.
>   3. **Nuovo endpoint `POST /settings/modules/reset-to-seed`** (admin-only) — riscrive `modules.runtime.json` copiando il seed. Se il runtime diverge di nuovo, basta una chiamata (no SSH, no cancellazione manuale).
> - ✅ **Matrice applicata**: Vini admin+sommelier+sala (iPratico admin), Acquisti admin+contabile, Ricette admin+chef (+sala/sommelier per macellaio), Vendite admin+sala+sommelier+contabile, Flussi Cassa admin+contabile (mance a tutti), Controllo Gestione admin+contabile, Statistiche solo admin, Dipendenti admin (+tutti per Turni), Prenotazioni admin+sala+sommelier, Clienti admin+sala+sommelier+contabile, Impostazioni globali solo admin.
> - ✅ **`modulesMenu.js` riorganizzato** (dropdown header + Home):
>   - Vini: rimosso iPratico Sync (resta route `/vini/ipratico`).
>   - Ricette: "Strumenti" → "Impostazioni".
>   - Clienti: rimosso "Import" (resta route), aggiunto "Impostazioni".
>   - Dipendenti: aggiunti "Costi" e "Impostazioni".
>   - Campo `check` marcato cosmetico/legacy nel commento in testa (la source of truth è modules.json via useModuleAccess).
> - ✅ **Versions**: auth v2.0 → **v2.1**, sistema v5.6 → **v5.7**.
>
> **Sessione 39 — Auth — Auto-sync modules.json + iPratico in Impostazioni Vini:**
> - Marco: _"occhio che c'e' sempre il problema di git sul modules.. ragionaci su anche ieri al riavvio aveva ripristinato hardcoded dei privilegi"_ + _"non riesco a fare quella cosa della console.. possiamo evitarlo?"_ + _"mettere ipratico sync dentro impostazioni vini. Mettere l'import di clienti dentro impostazioni clienti"_.
> - ✅ **Auto-sync seed→runtime hash-based** in `app/routers/modules_router.py`:
>   - Helper `_seed_hash()` (SHA-256 di `modules.json`) + `_read_applied_hash()`/`_write_applied_hash()` su `modules.runtime.meta.json` (gitignored).
>   - `_load()` riscritto: se hash seed ≠ hash applicato → ricopia seed in runtime e aggiorna meta alla prima richiesta dopo restart. Altrimenti legge runtime normale (permessi modificati via UI sopravvivono). Fallback ultima istanza su `DEFAULT_MODULES`.
>   - **Niente piu' console DevTools**: push.sh -m sincronizza il seed, il backend auto-applica al primo request. Verificato con smoke test Python (6 asserzioni).
> - ✅ **`.gitignore`**: aggiunto `app/data/modules.runtime.meta.json`.
> - ✅ **iPratico Sync in sidebar ViniImpostazioni**: `ViniImpostazioni.jsx` MENU con voce `{ key: "ipratico", label: "iPratico Sync", icon: "🔄", go: "/vini/ipratico" }`. Rendering differenzia voci `go` (navigate con freccia `→`) da voci sezione. Approccio link-based senza refactor di iPraticoSync.jsx (672 righe).
> - ✅ **Import Clienti già embedded**: verificato — `ClientiImpostazioni.jsx` montava già `<ClientiImport embedded />` alla sezione `"import"`. Nessuna modifica.
> - ✅ **Nuova procedura post-push (zero manual step)**:
>   1. `./push.sh "testo"` (auto-rileva hash modules.json e applica -m).
>   2. Prima richiesta dopo restart backend → auto-sync del runtime dal seed.
>   3. Ctrl+Shift+R FE per refresh cache.
> - **TODO follow-up**:
>   - Valutare se refactorare `iPraticoSync.jsx` con prop `embedded` (come ClientiImport/GestioneReparti) per rendering inline in ViniImpostazioni invece di navigate.
>   - Aggiungere bottone "Ripristina ruoli di default" in Impostazioni → Moduli & Permessi (wrapper endpoint `/settings/modules/reset-to-seed`, emergenza only).
>   - Eventuale auto-refresh FE di `useModuleAccess` dopo un PUT lato admin (oggi serve Ctrl+Shift+R).
>
> **Sessione 39 — Dipendenti — Cleanup titoli viste Turni:**
> - ✅ **FoglioSettimana.jsx**: rimosso "← Dipendenti" e titolo "📅 Foglio Settimana". Motivazione Marco: _"tanto ora c'e' il menu sopra, e Foglio Settimana con loghetto e' inutile"_.
> - ✅ **VistaMensile.jsx**: rimosso titolo "🗓 Vista Mensile" (back gia' assente). Intestazione PRINT-ONLY intatta.
> - ✅ **PerDipendente.jsx**: rimosso titolo "👤 Vista per Dipendente". Intestazione PRINT-ONLY intatta.
> - ✅ **Versions**: dipendenti → **v2.20**.
> - Rationale: `DipendentiNav` in cima copre gia' breadcrumb/titolo modulo; i titoli duplicavano il segnale visivo e sprecavano riga verticale (critico su portrait iPad).
>

> Ultima sessione: 2026-04-14 (sessione 39 — Dipendenti "Utente collegato" UI + "I miei turni" self-service + stampa Mese/PerDip + Preventivi v2.0 Menu alternativi + Libreria Menu Template (mig 080) + **DipendentiNav + Impostazioni sidebar + fix Anagrafica**).
>
> **Sessione 39 — Dipendenti — Barra menu DipendentiNav + Impostazioni con sidebar:**
> - ✅ **Polish UX richiesto da Marco**: _"nella sezione dipendenti manca la barra menu (guarda gestione vini per esempio)"_ + _"Non funziona il tasto 'Crea dipendente'"_ + _"Sistema un po' la pagina c'e' moltissimo spazio a destra e zero a sinistra"_ + _"impostazioni dipendenti, metti tutto in un'unica pagina, con un sidebar menu a sinistra non spezzare su piu tile"_. Allineamento al pattern ViniNav/ClientiNav.
> - ✅ **`DipendentiNav.jsx` v1.0** (nuovo file): tab navigation persistente tema viola (Home/Anagrafica/Buste Paga/Turni/Scadenze/Costi/Impostazioni), pattern identico a ViniNav.
> - ✅ **Integrata in tutte le pagine admin Dipendenti**: DipendentiMenu, DipendentiAnagrafica, DipendentiBustePaga, DipendentiScadenze, DipendentiCosti, DipendentiTurni, FoglioSettimana, VistaMensile, PerDipendente, GestioneReparti, DipendentiImpostazioni. Esclusa MieiTurni (accessibile a tutti i ruoli, non solo admin). Nelle pagine con @media print wrappata in `print:hidden`.
> - ✅ **Fix bug "Crea dipendente"** (`DipendentiAnagrafica.jsx` v2.4 → v2.5-nav-layout-fix): dopo `handleNew()` form era EMPTY con `id=null` e `codice=""` → la condizione placeholder `!form.id && !form.codice` restava vera e il form non si mostrava mai. Aggiunto stato `isCreating` che distingue "nessuna selezione" da "nuova creazione". Placeholder ora usa `!form.id && !isCreating`. `setIsCreating(true)` in handleNew, `false` in handleSelect e dopo POST success.
> - ✅ **Fix layout Anagrafica sbilanciato**: da `max-w-3xl` a `max-w-5xl mx-auto`, root container a `flex flex-col` con `flex-1 min-h-0` sull'area lista+dettaglio. Sostituito `height: calc(100dvh - 49px)` con flex layout per sfruttare tutta la larghezza.
> - ✅ **`DipendentiImpostazioni.jsx` v1.0 → v2.0-impostazioni-sidebar**: consolidato da layout a tile a layout **sidebar+content** (modello ClientiImpostazioni). Sezione "Reparti" monta `<GestioneReparti embedded />` direttamente nel pannello destro; "Soglie CCNL" e "Template WhatsApp" restano placeholder "Prossimamente" nella sidebar. Niente piu' salto a `/dipendenti/reparti`: tutto vive in `/dipendenti/impostazioni`.
> - ✅ **`GestioneReparti.jsx` v1.0 → v1.1-embeddable**: aggiunta prop `embedded` (default false). Modalita' embedded rende solo il contenuto dentro `flex flex-col h-full min-h-0`. Route standalone `/dipendenti/reparti` resta funzionante con DipendentiNav. Sostituito height calc con flex.
> - ✅ **Turni — allineamento pranzo/cena griglia settimanale** (MieiTurni + PerDipendente): polish UX per cui il pranzo va sempre in alto e la cena sempre in basso nelle celle giorno, anche se un giorno ha solo uno dei due servizi. Separazione in `pranziTurni`/`ceneTurni`/`altriTurni` + `SlotPlaceholder` invisibile per preservare altezza.
> - ✅ **Versions bump**: dipendenti 2.18 → **2.19**.
>

> **Sessione 39 — Clienti — Libreria Menu Template (mig 080):**
> - ✅ **Feature**: Marco chiede _"ok il menu generato posso recuperarlo in altri preventivi?"_. Scelta Opzione **B** (libreria completa, non duplicazione inline). Snapshot copy semantics: righe applicate sono copie locali, non referenze.
> - ✅ **Mig 080 `080_menu_templates.py`**: tabelle `clienti_menu_template` (id, nome, descrizione, service_type_id, prezzo_persona, sconto, created_at, updated_at) + `clienti_menu_template_righe` (id, template_id FK cascade, recipe_id, sort_order, category_name, name, description, price, created_at). Indici `idx_cmt_service_type` e `idx_cmtr_template`. `service_type_id` è soft-FK verso foodcost.db.service_types.
> - ✅ **Service `menu_templates_service.py`**: CRUD template + righe + bridge `salva_menu_come_template(preventivo_id, menu_id, nome, descrizione, service_type_id)` e `applica_template_a_menu(preventivo_id, menu_id, template_id, sostituisci_righe, aggiorna_nome, aggiorna_prezzo)`. `applica` invoca `preventivi_service._ricalcola_menu_e_totale(conn, menu_id)` inline nella stessa conn per consistenza transazionale. Ownership check su preventivo_id.
> - ✅ **Router `menu_templates_router.py`**: due APIRouter esportati — `router` (prefix `/menu-templates`, CRUD) + `preventivi_bridge_router` (prefix `/preventivi`, endpoint bridge). Tutte scritture admin-only. `main.py` registra entrambi dopo preventivi_router.
> - ✅ **FE `PreventivoMenuComposer.jsx` v2.1**: pulsanti "📂 Carica template" (barra superiore, amber, con dialog filtro+search+sostituisci) e "💾 Salva template" (area tab, emerald, disabilitato se menu vuoto, dialog nome+descrizione+service_type).
> - ✅ **FE `ClientiMenuTemplates.jsx` v1.0** (nuovo file): CRUD completo 2-colonne — lista filtrabile a sinistra, editor metadati + righe (picker ricettario, add veloce, reorder, remove) a destra. Prop `embedded` per usarla dentro Impostazioni.
> - ✅ **FE `ClientiImpostazioni.jsx`**: nuova tile "🍽️ Menu Template" che monta `<ClientiMenuTemplates embedded />`.
> - ✅ **Versions bump**: clienti 2.7 → **2.8**.
> - ⚠️ **Da testare in prod**: salvataggio da composer, caricamento con sostituisci=true/false, CRUD standalone, ricalcolo totale menu dopo applica.
>

> **Sessione 39 — Dipendenti — Campo "Utente collegato" in anagrafica:**
> - ✅ **Problema risolto**: il link utente ↔ dipendente (introdotto nella stessa sessione per `/miei-turni`) finora richiedeva SSH + script CLI + restart backend. Marco: _"aggiungi un campo in anagrafica dipendenti che mi permetta di selezionarlo"_.
> - ✅ **Backend `auth_service.py`**: `list_users()` ora espone `display_name` + `dipendente_id`. Nuova `set_dipendente(username, dipendente_id|None)` con unicita' 1:1 forzata (se il dipendente_id era assegnato ad altro utente, quel link viene rimosso prima di applicare il nuovo).
> - ✅ **Backend `users_router.py`**: nuovo endpoint `PUT /auth/users/{username}/dipendente` (admin only), body `{"dipendente_id": int | null}` — null scollega.
> - ✅ **FE `DipendentiAnagrafica.jsx` v2.3 → v2.4-utente-collegato**: nuova sezione "Account app — utente collegato" nel form dettaglio. Select dropdown caricata da `GET /auth/users/` (admin-only; per non-admin si nasconde con nota "🔒 Solo gli amministratori..."). Opzioni annotate "— collegato a Nome Cognome" se l'utente e' gia' linkato altrove. `handleSave` esteso: dopo save del dipendente, se `utente_username !== utenteInitial` chiama PUT per scollegare il vecchio e collegare il nuovo; errori nel link mostrano banner senza rollbackare il save.
> - ✅ **Versions bump**: dipendenti 2.17 → **2.18**.
> - ✅ **Impatto operativo**: lo script `scripts/set_dipendente_id.py` resta disponibile per bootstrap/emergency, ma il workflow normale ora e' Dipendenti → dettaglio → select → Salva. Niente piu' SSH per ogni mapping.
>
> **Sessione 39 — Dipendenti — Pagina "I miei turni" (Option A, fix notifica turni):**
> - ✅ **Bug fix**: la notifica "turni pubblicati" (globale, tutti i ruoli) puntava a `/dipendenti/turni?...` ma `ProtectedRoute module="dipendenti"` rediriggeva a `/` i ruoli non-admin. Scelta **Option A**: nuova vista self-service `/miei-turni` accessibile a TUTTI i ruoli autenticati.
> - ✅ **Backend `auth_service.py`**: campo opzionale `dipendente_id` nel round-trip users.json; `get_current_user()` ritorna `{username, role, dipendente_id}`. Back-compat con utenti senza il campo.
> - ✅ **Backend `turni_router.py`**: nuovo `GET /turni/miei-turni?settimana_inizio&num_settimane` — risolve dipendente dall'utente loggato, 404 chiaro se non collegato. Riusa `turni_service.build_vista_dipendente()`.
> - ✅ **Backend `turni_service.py:1415`**: notifica pubblicazione ora linka a `/miei-turni?settimana=YYYY-Www` (messaggio: "Apri per vedere i tuoi turni").
> - ✅ **FE `MieiTurni.jsx` v1.0**: nuova pagina che riusa UX di PerDipendente (CardSettimana/TotaliPeriodo) senza tab reparti né selettore dipendente. Toolbar 2-sezioni: LEFT nav periodo / RIGHT 4-8-12w + 🖨️ Stampa + (solo admin) `📋 Foglio Settimana` deep-link. Deep-link `?settimana=` dall'URL. Card "🔗 Utente non collegato" quando 404. Stampa `@media print` friendly con `breakInside: avoid`.
> - ✅ **FE `App.jsx`**: route `/miei-turni` **senza ProtectedRoute** (solo auth gate top-level).
> - ✅ **Mapping utenti**: `users.json` dev aggiornato (marco→1, iryna→7, paolo→4). Script `scripts/set_dipendente_id.py` per applicare il mapping sul VPS (users.json è .gitignored, va lanciato in prod: `python3 scripts/set_dipendente_id.py --apply && sudo systemctl restart trgb-backend`).
> - ✅ **Versions bump**: dipendenti 2.16 → **2.17**.
> - ⚠️ **Post-deploy obbligatorio**: Marco deve SSH sul VPS e lanciare lo script `set_dipendente_id.py --apply` (o editare manualmente users.json) + restart del backend, altrimenti iryna/paolo vedranno la card "Utente non collegato".
>
> **Sessione 39 — Preventivi v2.0 — Menu multipli alternativi (Opzione A/B/C):**
> - ✅ **Problema/feature**: un preventivo può ora presentare al cliente N menu **alternativi** (non compresenti). Il cliente ne sceglie uno. Regole totale: 0 menu → solo Extra; 1 menu → `prezzo_persona × pax + Extra`; ≥2 menu → NESSUN totale aggregato (il cliente sceglie prima).
> - ✅ **Mig 079 `preventivi_menu_multipli.py`**: nuova tabella `clienti_preventivi_menu` (id, preventivo_id FK cascade, nome, sort_order, sconto, subtotale, prezzo_persona) + `clienti_preventivi_menu_righe.menu_id` + indici. Backfill: per ogni preventivo con righe esistenti crea record "Menu" sort_order=0 copiando denorma dalla testata, assegna menu_id a tutte le sue righe.
> - ✅ **Backend service**: helper `_menu_table_exists`/`_conta_menu`/`_resolve_menu_id`/`_get_or_create_primary_menu`/`_sync_testata_menu_cache`/`_ricalcola_menu_e_totale`; `_ricalcola_totale` implementa la nuova regola; CRUD menu (`lista/crea/aggiorna/elimina/duplica/riordina`); CRUD righe ora risolvono menu_id (fallback primario); `get_preventivo` ritorna `menu_list[]` con righe annidate + `n_menu`, `menu_righe` flat retro-compat sul primo menu; `duplica_preventivo` copia anche menu + righe; `lista_preventivi` include `n_menu`.
> - ✅ **Backend router**: Pydantic `MenuCreateIn/UpdateIn/DuplicaIn`; endpoint `/preventivi/{id}/menu` (GET/POST), `/menu/{menu_id}` (PUT/DELETE), `/menu/{menu_id}/duplica` (POST), `/menu-ordine` (PUT), `/menu/{menu_id}/righe` (GET/POST), `/menu/{menu_id}/righe-ordine` (PUT). Endpoint legacy `/menu-righe/{riga_id}` mantenuti.
> - ✅ **PDF template `preventivo.html`**: 3 branch — ≥2 menu "Menu proposti — alternative" con Opzione A/B/C e prezzo/persona per ciascuno + totale "da definire in base al menu scelto"; 1 menu rendering classico; fallback pre-mig 079 su `prev.menu_righe`.
> - ✅ **FE `PreventivoMenuComposer.jsx` v2.0**: composer riscritto con tab per menu (◀▶ riordino, ✎ rinomina inline, ✕ elimina con conferma, ➕ aggiungi, ⎘ duplica menu). Auto-naming: primo "Menu", poi "Opzione A/B/C…". Banner giallo warning quando ≥2 menu. Callback parent via useRef per evitare re-render loop.
> - ✅ **FE `ClientiPreventivi.jsx`**: colonna Totale mostra badge ambra "**N alternative**" quando `n_menu ≥ 2`, altrimenti `€ totale_calcolato`.
> - ✅ **Versions bump**: clienti 2.6 → **2.7**.
> - ⚠️ **Da testare in produzione**: flusso completo con 2+ menu (creazione, rinomina, riordino, duplica, PDF). Verificare retro-compat preventivi esistenti (backfill deve creare 1 menu "Menu" per preventivo esistente).
>
> **Sessione 36 — Preventivi v1.3 — Componi menu operativo anche su /nuovo (Opzione A):**
> - ✅ **Problema risolto**: il pannello "🪄 Componi menu dal ricettario" prima era bloccato su `/preventivi/nuovo` con banner "salva prima". Marco lo voleva sempre attivo, anche prima del primo Salva.
> - ✅ **Soluzione scelta (Opzione A = auto-save silenzioso)**: quando Marco tocca il composer su `/nuovo`, il FE crea in backend una **bozza automatica** (`is_bozza_auto=1`) senza toast né cambio URL. Marco continua a comporre, le righe vengono snapshottate su quel preventivo embrione. Al click "Crea preventivo" la bozza auto viene promossa a bozza utente normale (`is_bozza_auto=0`, stato resta `bozza`).
> - ✅ **Migrazione 076** `preventivi_bozza_auto.py`: `clienti_preventivi.is_bozza_auto INTEGER DEFAULT 0` + indice.
> - ✅ **Backend `preventivi_service`**: `crea_preventivo` accetta flag + titolo opzionale (placeholder "Preventivo in compilazione"); `aggiorna_preventivo` promuove la bozza; `lista_preventivi` e `stats_preventivi` escludono `is_bozza_auto=1` di default → bozze auto invisibili nella lista e nelle stats.
> - ✅ **Router**: `PreventivoCreate.titolo` Optional, flag `is_bozza_auto`; `GET /preventivi?includi_bozze_auto=bool` per eventuali tool di pulizia.
> - ✅ **FE `ClientiPreventivoScheda` v1.3**: `ensureSaved()` (useRef dedup) crea POST silenzioso; `handleSalva` usa PUT con `is_bozza_auto=0` per promuovere. Banner "⏳ Bozza in compilazione" visibile finché l'utente non clicca "Crea preventivo".
> - ✅ **FE `PreventivoMenuComposer` v1.1**: nuovo prop `onEnsureSaved`, helper `resolvePid()`, `loadWithId(pid)` per evitare closure stale. Rimosso early-return "salva prima".
> - ✅ **Versions bump**: clienti 2.4 → **2.5**.
> - ⚠️ **Aperto**: cleanup orfani (bozze auto create e mai promosse) da rimandare a job schedulato — oggi sono invisibili ma restano in DB.
>
> **Sessione 36 — Preventivi v1.2 — Componi menu da Cucina (snapshot immutabile):**
> - ✅ **Fase 1 backend Cucina**: migrazione **074_recipes_menu_servizi.py** (ADD `recipes.menu_name`/`menu_description`/`kind`, nuove tabelle `service_types` + `recipe_service_types` M:N, seed 4 tipi servizio "Alla carta / Banchetto / Pranzo di lavoro / Aperitivo"). `foodcost_recipes_router.py` esteso: filtri `kind`/`service_type_id`/`search` in `list_ricette`, `service_type_ids[]` in create/update, endpoint `POST /foodcost/ricette/quick`, `PUT /foodcost/ricette/{id}/servizi`, CRUD `/foodcost/service-types`
> - ✅ **Fase 2 FE Cucina**: `RicetteNuova.jsx` + `RicetteModifica.jsx` con sezione "Menu & servizi" (menu_name, menu_description, chip selector tipi servizio, visibile solo se !is_base). `RicetteSettings.jsx` nuova sezione "🍽️ Tipi servizio (menu preventivi)" con CRUD full
> - ✅ **Fase 3 backend preventivi**: migrazione **075_preventivi_menu_righe.py** (nuova tabella snapshot `clienti_preventivi_menu_righe` + colonne `menu_sconto`/`menu_subtotale` su `clienti_preventivi`). `preventivi_service.py`: helper `_ricalcola_menu` (subtotale = Σprice, prezzo/persona = (sub−sconto)/pax), `_snapshot_recipe` cross-DB, CRUD righe + `set_menu_sconto`. Router: 6 endpoint sotto `/preventivi/{id}/menu-righe` e `/menu-sconto`
> - ✅ **Fase 4 FE wizard**: nuovo componente `PreventivoMenuComposer.jsx` (picker piatti con filtro tipo servizio + search, quick-create "⚡ Piatto veloce", righe raggruppate per categoria con ▲▼✕ e edit prezzo inline, riepilogo subtotale/sconto/totale/prezzo a persona). Integrato in `ClientiPreventivoScheda.jsx` (v1.2): il campo `menu_prezzo_persona` testata diventa 🔒 auto quando ci sono righe snapshot; il payload save esclude il campo per non sovrascrivere il valore calcolato dal backend
> - ✅ **Regola granitica salvata**: "Config sempre in Impostazioni, mai hardcoded" (feedback memory) — applicata a service_types e luoghi preventivi
> - Versions bump: ricette 3.1→3.2, clienti 2.3→2.4
>
> **Sessione 36 — Turni v2 Fase 4 — CRUD reparti UI + colore dipendente:**
> - ✅ Nuova pagina `GestioneReparti.jsx` (CRUD reparti: codice/nome/icona/colore/ordine, orari pranzo+cena, pause staff, attivo). Lista sidebar + form dettaglio, palette emoji+colori suggeriti.
> - ✅ `DipendentiAnagrafica.jsx` v2.1: campi `reparto_id` (select) + `colore` (input color + HEX + palette 20 colori) con warning colori duplicati. Sidebar lista: pallino colore + badge reparto.
> - ✅ `DipendentiMenu.jsx` v2.2: tile "Reparti" teal attiva (al posto del placeholder "Contratti").
> - ✅ `App.jsx`: route `/dipendenti/reparti`.
> - ✅ versions.jsx: dipendenti 2.3 → 2.4.
>
> **Sessione 36 — Fase 1+2+3 (stesso giorno di Fase 0):**
> - ✅ Migrazione 072 `turni_v2_slot_index.py`: `turni_calendario.slot_index` per persistere colonna foglio
> - ✅ Service `turni_service.py`: `build_foglio_settimana`, `calcola_ore_nette_giorno` (deduce pause staff da reparto), `ore_nette_settimana_per_reparto` (semaforo 40/48), `copia_settimana`, `giorni_chiusi_nella_settimana` (legge `get_closures_config()` da Vendite — NO duplicazione)
> - ✅ Router `/turni`: GET foglio, POST/PUT/DELETE slot, GET ore-nette, POST copia-settimana, GET chiusure
> - ✅ `FoglioSettimana.jsx` live: tab reparto colorato, matrice 7×(P1..Pn + C1..Cn), pillola colore dipendente, ★ CHIAMATA, riga chiuso grigia, popover assegna/modifica/rimuovi, dialog copia settimana, pannello ore laterale con semaforo + totali. Sostituisce legacy su `/dipendenti/turni`. Touch 44pt, navigazione ←/→ + Oggi.
> - ⏭️ **Fase 4 prossima**: UI CRUD reparti (impostazioni) + picker colore dipendenti
>
> **Cosa è stato fatto in sessione 36 (Fase 0 di Turni v2):**
> - ✅ Piano completo in `docs/modulo_dipendenti_turni_v2.md` (12 fasi, Fase 4 assenze rimossa → va nel modulo Presenze v2.3)
> - ✅ Mockup "Foglio Settimana" in `docs/mockups/turni_v2_foglio_settimana.html` — replica Excel di Marco, tab reparto SALA/CUCINA, righe lun-dom, colonne P1..P4 + C1..C4 (estendibili a 6+6), pillola colorata per dipendente, asterisco giallo per stato CHIAMATA, riga grigia per giorno chiuso, pannello ore nette laterale
> - ✅ Migrazione **071_turni_v2_schema.py** su `dipendenti.sqlite3`:
>   - Nuova tabella `reparti` + seed SALA (10:30-15:30 / 18:00-24:00) e CUCINA (09:30-15:30 / 17:30-23:00) con pause staff 30+30 min configurabili
>   - `dipendenti.reparto_id` + `dipendenti.colore` (HEX univoco, palette 14 tinte) con backfill automatico dal campo `ruolo`
>   - `turni_tipi` esteso: `categoria` (LAVORO/RIPOSO/ASSENZA), `ore_lavoro` REAL, `icona`, `servizio` (PRANZO/CENA)
>   - `turni_calendario` esteso: `ore_effettive`, `origine` (MANUALE/COPIA/TEMPLATE), `origine_ref_id`. Il campo `stato` accetta anche `CHIAMATA` (nessuna migration: campo TEXT libero)
>   - Backfill ore_lavoro calcolate da ora_inizio/ora_fine + backfill heuristico servizio (da nome o da orario)
>   - Indici su turni_calendario(data), (dipendente_id, data), dipendenti(reparto_id)
>   - NIENTE seed RIPOSO/FERIE/MALATTIA (workflow Marco: chi non compare = a casa; assenze → modulo Presenze v2.3)
>   - Tabelle template `turni_template` + `turni_template_righe` (per Fase 10)
> - ✅ `dipendenti_db.py` in sync con la migration (per DB nuovi)
> - ✅ Router `dipendenti.py`: pydantic DipendenteBase + TurnoTipoBase estesi; SELECT/INSERT/UPDATE dipendenti e turni_tipi espongono e accettano i nuovi campi
> - ✅ Nuovo router **`app/routers/reparti.py`** (`/reparti/` CRUD: GET list + GET {id} + POST + PUT + DELETE soft con guard "dipendenti attivi associati"). Incluso in main.py
> - ✅ **Chiusure settimanali non duplicate**: il Foglio Settimana leggerà da `app/data/closures_config.json` via `GET /settings/closures-config` (modulo Vendite)
> - ✅ **Pause staff**: 30 min pranzo + 30 min cena scalati dal calcolo ore lavorate, configurabili per reparto (`reparti.pausa_pranzo_min`, `reparti.pausa_cena_min`). Logica effettiva verrà implementata in Fase 2 (servizio `turni_service.py`, campo API `ore_nette`)
> - ⏭️ **Fase 1 prossima sessione**: componente `FoglioSettimana.jsx` (tab reparto, matrice slot, popover click-to-assign con toggle CHIAMATA, riga chiuso da closures_config)
>
> **Test migration**: idempotente su copia DB produzione (seconda esecuzione no-op). 8/13 dipendenti auto-mappati al reparto dal ruolo; 2 con ruolo ambiguo (aiuto cuoc., operaia) restano `reparto_id NULL` — Marco li sistemerà da anagrafica.
>
> **Sessione precedente (35 — Preventivi v1.1):**
> - ✅ **Crea cliente al volo dal form preventivo**: toggle "🔍 Esistente / ＋ Nuovo" in `ClientiPreventivoScheda.jsx`. Se Marco sceglie "Nuovo" compila nome/cognome/telefono/email (4 campi minimi) e il cliente viene creato con `origine='preventivo'` contestualmente al save del preventivo
> - ✅ **Luoghi configurabili**: rimossi hardcoded sala/terrazza/esterno/altro → ora lista dinamica caricata da `GET /preventivi/config/luoghi`, default `["Sala","Giardino","Dehor"]` seedati in `clienti_impostazioni.preventivi_luoghi`. Nuova sezione "📍 Luoghi Preventivi" in `ClientiImpostazioni.jsx` con CRUD (aggiungi/rimuovi/rinomina/riordina) e PUT autenticato (admin). Il form scheda preventivo preserva i valori legacy (es. "terrazza") marcati come "(non configurato)"
> - ✅ **Menu ristorante separato dagli extra**: aggiunte 3 colonne a `clienti_preventivi` (`menu_nome`, `menu_prezzo_persona`, `menu_descrizione`). Nuova sezione "🍽 Menu proposto" nel form con composizione a textarea (placeholder Bergamasca: Casoncelli, Polenta taragna…). La vecchia sezione righe è stata rinominata "➕ Extra" per elementi liberi (noleggio attrezzatura, tovagliato, supplementi, sconti). Totale ricalcolato come `menu_prezzo_persona × n_persone + extra_righe`
> - ✅ **Migrazione 070** `070_preventivi_menu_luoghi.py`: ALTER TABLE su `clienti_preventivi` per 3 colonne menu + seed `preventivi_luoghi`. `clienti_db.py` aggiornato in parallelo (CREATE TABLE nuova DB + ALTER try/except per retro-compatibilità)
> - ✅ Backend service: `_crea_cliente_inline()` helper, `_ricalcola_totale()` aggiornato, `get_luoghi()`/`set_luoghi()` con normalizzazione/dedup, `duplica_preventivo()` copia campi menu, `crea_preventivo`/`aggiorna_preventivo` accettano `nuovo_cliente` opzionale
> - ✅ Router: `NuovoClienteIn`/`LuoghiIn` pydantic, `GET/PUT /preventivi/config/luoghi` (posizionati PRIMA di `/{preventivo_id}` per evitare collisione path param), `menu_*` + `nuovo_cliente` in PreventivoCreate/Update
> - Versions bump: clienti 2.2→2.3
>
> **Sessione precedente (34):**
> - ✅ Mattone **M.B PDF brand** completato: `app/services/pdf_brand.py` con 2 API (`genera_pdf_html` per nuovo content, `wrappa_html_brand` per migrare endpoint HTML esistenti)
> - ✅ Template Jinja2: `app/templates/pdf/base.html` (layout brand: logo SVG data-uri + wordmark + striscia gobbette + footer @page)
> - ✅ Template Jinja2 specifici: `preventivo.html`, `ricetta.html`
> - ✅ Endpoint nuovo: `GET /preventivi/{id}/pdf` con bottone "📥 Scarica PDF" in `ClientiPreventivoScheda.jsx`
> - ✅ Migrati 5 endpoint inventario cantina da `HTML().write_pdf()` inline a `wrappa_html_brand()` (stesso branding del resto dell'app)
> - ✅ Ricetta PDF migrata da ReportLab (140 righe) a WeasyPrint + `ricetta.html` (20 righe)
> - 🚫 **Carta Vini NON toccata** (come richiesto da Marco): `carta_vini_service.py` e `/vini/carta/pdf*` hanno motore separato
> - Versions bump: clienti 2.1→2.2, vini 3.8→3.9, ricette 3.0→3.1
>
> **Roadmap sbloccata con M.B:** ora si possono fare rapidamente 4.5 (P&L PDF), 3.8 (cash flow PDF), 6.2 (cedolini PDF) riusando `genera_pdf_html`.
> Mattoni ancora da fare: M.D Email, M.E Calendar, M.F Alert engine, M.G Permessi, M.H Import engine.
>
> **Smoke test OK** (sintassi Python + render Jinja2 templates). La verifica PDF reale va fatta in produzione dopo il push (WeasyPrint non è nel sandbox).
>
> **Sessione precedente (32):** Modulo Preventivi 10.1+10.2 — DB 3 tabelle, backend service+router (14 endpoint), frontend lista+scheda, template riutilizzabili, tab preventivi in scheda cliente.
>
> **Patch 2026-04-13 (fine sessione 32)** — Fix P1 "Import TheFork senza nome" (vedi `problemi.md`). Migrazione 068 aggiunge `nome_ospite`/`cognome_ospite` a `clienti_prenotazioni`. Import TheFork ora salva lo snapshot del nome dall'XLSX (`Customer first name`/`Customer last name`), `get_planning` e query TavoliMappa usano `COALESCE(c.nome, p.nome_ospite)`. Marco deve rilanciare l'import completo del file XLSX per popolare le prenotazioni gia' in DB.

