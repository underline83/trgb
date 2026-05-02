# TRGB Gestionale — Roadmap
**Ultimo aggiornamento:** 2026-04-25 (sessione 58 — Vini quick wins + carta cliente pubblica `/carta` + vista sommelier `/vini/carta-staff` + ridisegno Centro Carta)
**Legenda effort:** S = mezza sessione (~1h), M = 1 sessione (~2-3h), L = 2+ sessioni

> Roadmap concordata tra Marco e Claude. Ogni punto ha un ID stabile (sezione.numero).
> Quando un punto viene completato, spostarlo in "Completati" in fondo con data.
> **Architettura a mattoni:** vedi `docs/architettura_mattoni.md` per dipendenze e ordine sviluppo a Wave.
> Mattoni condivisi: ✅ M.A Notifiche, ✅ M.B PDF brand (sessione 34), ✅ M.C WA composer, ✅ **M.E Calendar** (sessione 48), ✅ M.F Alert engine (sessione 40), ✅ M.I UI primitives (2026-04-18), M.D Email, M.G Permessi, M.H Import engine
> **Nota M.B:** la Carta Vini resta con motore separato (`carta_vini_service.py`), non usare M.B per 7.3 PDF — è già stato escluso esplicitamente.

---

## 0 — Refactor monorepo (`core/` + `locali/`) — STRATEGICO

> **Documento completo:** `docs/refactor_monorepo.md`
> **Razionale:** separare prodotto vendibile (`core/`) da personalizzazioni Tre Gobbi (`locali/tregobbi/`) e introdurre l'istanza pulita prodotto (`locali/trgb/` su futuro `trgb.it`). Prerequisito per: app pubblicata su App Store, primo cliente paying, vendita modulare per modulo.
> **Decisione:** 2026-04-27 / 28 (Marco + Claude). **Stima totale:** 7-10 giornate effettive in 8 sessioni.
> **Architettura:** monolite modulare con feature flags per locale. 13 moduli vendibili + platform sempre inclusa.

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 0.R1 | Scaffolding `locali/{tregobbi,trgb,_template}/` + env `TRGB_LOCALE` | S | ✅ FATTO 2026-04-28 (`8876603`) | Endpoint `/system/info` ritorna `{locale: "tregobbi"}`. Vedi `docs/refactor_monorepo.md` §3 R1 |
| 0.R2 | Branding centralizzato `locali/<id>/branding.json` + Splash iOS | M | ✅ FATTO 2026-04-29 (`753019a`) | Branding tenant-aware live + collab marker. Splash iOS pre-generati (TRGB-02-final) da integrare in commit dedicato |
| 0.R3 | Seed migrations TRGB-specific isolate | M | ✅ FATTO 2026-04-29 (`503c88f`) | `migration_runner.py` v1.3 locale-aware. Flag `TRGB_SPECIFIC = True` sulle 3 mig seed (097, 099, 100). Doc razionale in `locali/tregobbi/seeds/MIGRATIONS_TRGB.md`. Sorpresa: erano 3 non 12-15, le altre erano schema-only o seed universali |
| 0.R4 | `push.sh -l locale` + `locali/<id>/deploy/env.production` | S | ✅ FATTO 2026-04-29 (`f200781` + `77b3430`) | Deploy parametrizzabile + uploads locale-aware + versioning unificato (VERSION file, commit hash in /system/info) |
| 0.R5 | Override testi UI in `locali/<id>/strings.json` | M | ✅ FATTO 2026-04-29 (`ba46536`) | Helper `t()` BE+FE + endpoint `/locale/strings.json` + 18 stringhe sostituite in 9 file (PDF brand, WA templates, page titles, DOCX). Sorpresa: erano 18 non 40 — molte erano docstring/path già non-runtime |
| 0.R6 | Cleanup `vini.db` legacy + helper `locale_data_path()` ready | S | ✅ FATTO 2026-04-29 (`90e1fe7`) | `app/utils/locale_data.py` con lookup tenant-aware ready. NON applicato ai 9 DB (rimandato a R6.5 per separare il rischio) |
| 0.R6.5 (NEW) | Applica `locale_data_path()` a tutti i 9 DB + sposta fisici in tenant | M | DA FARE — prima di R8 | Sostituisce 10 costanti hardcoded `Path("app/data/...")` in core/database.py + models + migrazioni + router. 2 push separati (codice + sposta files) |
| 0.R7 | Cleanup + docs + scaffold `locali/_template/` | S | ✅ FATTO 2026-04-30 (TBD post-push) | Scaffold completo + nuovo `docs/architettura_locale.md`. Pronto per cliente nuovo. Sequenza riallineata: R7 chiude prima fase, R6.5 e R8 dopo |
| 0.R8 | Architettura modulare con feature flags per locale | L | DA FARE — DOPO R6.5 | `module_loader` + `moduli_attivi.json` per locale. 13 moduli + platform. Permette vendere "solo Vini" |

**Effetto su roadmap esistente:**
- 1.1 (PWA Fase 0) confluisce in R2: gli splash screens iOS si fanno mentre si centralizza il branding locale.
- 1.3 (Capacitor wrapper) resta DA VALUTARE post-R7.
- 1.11.2 (WAL coverage altri DB) si può fare opportunisticamente in R3 quando si toccano i modelli DB.
- Modulo K (upload fuori repo, già fatto in c7aaa4a) è già un primo passo del pattern locale-aware. R4 lo generalizza al `TRGB_LOCALE`.
- Da R1 in poi, ogni feature nuova va classificata `[core]`/`[locale:tregobbi]`/`[mixed]` nel commit (vedi `CLAUDE.md`).
- Da OGGI le 5 regole disciplina codice modulare in `CLAUDE.md` §"Architettura modulare" sono attive (a prescindere da R8).

---

## 1 — Infrastruttura / App

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 1.1 | PWA Fase 0: riscrivere sw.js network-first | S | **DA FARE — PRIORITÀ ALTA** | Marco S57 cont. (2026-04-25): alzare priorità ("la parte pwa verso app ufficiale è importante"). Asset già pronti, serve solo SW + registrazione. Tracciato anche in `docs/controllo_design.md` §5 |
| 1.2 | Test PWA su iPad reale | S | BLOCCATO | Bloccato da 1.1 |
| 1.3 | Fase 1 Capacitor wrapper nativo | L | DA VALUTARE | Marco S57 cont.: alzata priorità. Costo Apple Developer $99/anno. Decidere dopo che 1.1+1.2 sono in produzione |
| 1.4 | Migrazioni DB per dipendenti.sqlite3 | S | DA FARE | Pulizia tecnica |
| 1.5 | Riorganizzazione foodcost.db in DB separati | L | FUTURO | Solo se diventa collo di bottiglia |
| 1.6 | Snapshot Aruba settimanale | S | DA FARE | Da configurare dal pannello |
| 1.7 | DNS dinamico rete casa | S | IN STANDBY | |
| 1.8 | Notifiche push browser (scadenze, prenotazioni, backup) | M | DA FARE | Web Push API, Safari 16.4+ |
| 1.9 | Health check endpoint + uptime monitor | S | DA FARE | /health + UptimeRobot/Betterstack gratis |
| 1.10 | Aggiornamento automatico frontend (banner nuova versione) | S | DA FARE | Polling BUILD_VERSION ogni 5 min |
| 1.11 | WAL mode in init_*_database() per `vini_magazzino`, `foodcost`, `notifiche` + fix `.gitignore` `-wal`/`-shm` | S | ⚠️ PARZIALE 2026-04-21 | **Causa radice iniziale trovata MA insufficiente.** Mancavano `app/data/*.sqlite3-wal` e `*.sqlite3-shm` nel `.gitignore` → `git clean -fd` del post-receive VPS cancellava WAL → corruzione al restart. Fix applicato. **Tuttavia alle 00:53 4ª corruzione PRIMA del push** → esiste secondo vettore ancora ignoto (S52-1). Il fix resta necessario ma non sufficiente. |
| 1.11.2 | Coprire con WAL gli altri DB SQLite | S | DA FARE | `bevande.sqlite3`, `clienti.sqlite3`, `tasks.sqlite3`, `settings.sqlite3`, `dipendenti.sqlite3`, `admin_finance.sqlite3`. Tracciato in `docs/inventario_pulizia.md` con tabella di coverage e in `docs/controllo_design.md` §6. Marco S57 cont.: applichiamo a tutto in batch quando si fa cleanup tecnico |
| 1.12 | push.sh: debounce anti-doppio-push | S | ✅ FATTO 2026-04-25 (S57 cont.) | Modulo guardiano L1 implementato in push.sh: timestamp `.last_push`, debounce ≥30s (configurabile), conferma soft `[y/N]` se sotto soglia |
| 1.13 | Pulizia backup forensi vini_magazzino | S | DA FARE | S52-1 chiuso 2026-04-25: ora si possono archiviare. Comando in `docs/inventario_pulizia.md`. Marco esegue da terminale Mac quando vuole |
| 1.14 | Metodo anti-conflitto push ↔ uso attivo | M | ⚠️ PARZIALE | Modulo guardiano L1 (1.14.a) ✅ fatto. L2-L3 documentazione ✅ fatti. L4 endpoint maintenance (1.14.b) DA FARE in sessione dedicata |
| 1.14.a | push.sh: soft-check servizio attivo + conferma | XS | ✅ FATTO 2026-04-25 (S57 cont.) | In push.sh: probe HTTP `https://trgb.tregobbi.it/` + lettura accessi nginx ultimi 60s via SSH → se attività, conferma `[y/N]` |
| 1.14.b | Endpoint `/system/maintenance` + banner FE | M | DA FARE | Da sessione dedicata. Backend espone `GET/POST /system/maintenance/status` (auth admin). FE polla ogni 30s, se `active=true` mostra modale di sola lettura. `push.sh` lo attiva prima del push, lo disattiva dopo startup confermato |
| 1.14.c | Quiet-mode WebSocket per form FE | M | FUTURO | WS server-push `maintenance-imminent` → form salvano bozza in stato locale + mostrano "gestionale in aggiornamento, riprova tra 10s". Fattibile dopo 1.14.b |
| 1.15 | Pulire import morti `from app.models import vini_db` | XS | ✅ FATTO 2026-04-25 (S57 cont.) | Già rimossi nelle sessioni 52-53 (commenti `# Nota 2026-04-21 (sessione 52): rimosso import fantasma` in dashboard_router.py:738 e alert_engine.py:403). Voce roadmap era obsoleta — chiusa dopo verifica grep |
| 1.16 | Modulo guardiano L2 (architettura_pattern.md) | XS | ✅ FATTO 2026-04-25 (S57 cont.) | Registry pattern uniformi creato in `docs/architettura_pattern.md`. Da consultare a inizio di ogni sessione di sviluppo |
| 1.17 | Modulo guardiano L3 (inventario_pulizia.md) | XS | ✅ FATTO 2026-04-25 (S57 cont.) | Lista viva codice morto/orfani creata in `docs/inventario_pulizia.md`. Aggiornata a tornata con cleanup batch |
| 1.18 | Cleanup file morti (`run_server.py`, `update_vps.sh` orfano) | XS | DA FARE | Tracciato in `docs/inventario_pulizia.md`. Marco decide se eliminare/aggiornare |
| 1.19 | Migrazioni DB unificate (anche fuori foodcost.db) | M | DA FARE | Estendere migration_runner ai 9 DB non-foodcost. Tracciato in `docs/inventario_pulizia.md`. Marco S57 cont.: "uniformiamo, modulo guardiano aiuta a tenere logica comune" |
| 1.20 | PIN admin di default → random 6 cifre | XS | ✅ FATTO 2026-04-25 (S57 cont.) | `app/services/auth_service.py`: invece di "0000" hardcoded, genera PIN random 6 cifre con `secrets.randbelow` e lo stampa in console al primo boot se `users.json` manca |

---

## 2 — Prenotazioni (modulo nuovo)

> Specifica completa: `docs/modulo_prenotazioni.md`
> Checklist operativa: `docs/prenotazioni_todo.md`
> Obiettivo strategico: eliminare TheFork Manager, commissioni zero sulle dirette.

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 2.1 | Fase 1: Agenda prenotazioni | L | DA FARE | Planning giorno, form con CRM, stati, mini-calendario. Usa **M.E** calendar, **M.G** permessi |
| 2.2 | Fase 2: Mappa tavoli | L | DA FARE | Editor drag&drop, layout salvabili, responsive iPad |
| 2.3 | Fase 3: Widget pubblico tregobbi.it/prenota | M | DA FARE | Slot cena, CAPTCHA Turnstile, conferma |
| 2.4 | Fase 4: Conferme e notifiche | M | DA FARE | Usa **M.C** WA + **M.D** email. Email transazionali + link WA |
| 2.5 | Fase 5: Distacco TheFork Manager | M | DA FARE | Usa **M.H** import engine. Import TF, periodo parallelo |
| 2.6 | No-show tracking + alert scheda CRM | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. Contatore no-show, alert quando prenota |
| 2.7 | Lista d'attesa con notifica | S | DA FARE | Usa **M.A** notifiche + **M.C** WA. Serata piena → coda → WA se si libera |
| 2.8 | Report coperti previsti (prenotati + stima walk-in) | S | DA FARE | Utile per la cucina |

---

## 3 — Flussi di Cassa / Banca

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 3.1 | Bug storni difettoso | S | DA FARE | Serve caso concreto da Marco. Vedi docs/problemi.md D1 |
| 3.2 | Migliorare riconciliazione cross-ref | M | DA FARE | Match automatico piu' intelligente |
| 3.3 | Multi-conto corrente | M | DA FARE | Struttura predisposta, UI da implementare |
| 3.4 | Carta di credito: import + riconciliazione | M | DA FARE | Usa **M.H** import engine. Scheletro UI gia' pronto |
| 3.5 | Movimenti contanti: annullamento + filtri | S | ⚠️ PARZIALE 2026-04-22 | **Filtro data da/a fatto** (sessione 54) sui tab Pagamenti spese e Versamenti in banca. Resta da fare: annullamento movimenti. |
| 3.10 | Flusso contanti (vista cronologica cumulativa) | S | ✅ FATTO 2026-04-22 | Sessione 54 — nuovo tab `📊 Flusso contanti` con entrate (contanti fiscali) − uscite (spese CONTANTI) − versamenti in banca + baseline data+valore modificabile da Impostazioni Banca. |
| 3.11 | Flusso spese varie (pre-conti + spese varie) | S | ✅ FATTO 2026-04-22 | Sessione 54 — unificazione menu Pre-conti+Spese varie con 3 tab (Pre-conti / Spese varie / Flusso spese). Baseline saldo data+valore modificabile direttamente nel tab Flusso spese (admin/superadmin). |
| 3.6 | Dashboard grafici Recharts (banca) | S | DA FARE | Sostituire barre CSS |
| 3.7 | Scadenziario unificato con alert (calendario) | M | DA FARE | Usa **M.E** calendar + **M.A** notifiche + **M.F** alert. Vista calendario: fatture, rate, stipendi, F24 |
| 3.8 | Cash flow previsionale 30/60/90 giorni | M | DA FARE | Usa **M.B** PDF per export. Proiezione saldo banca basata su scadenze + storico |
| 3.9 | Import automatico movimenti banca | M-L | FUTURO | Usa **M.H** import engine. PSD2/aggregatori o watch cartella CSV |

---

## 4 — Controllo Gestione / FoodCost

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 4.1 | Note di credito XML | M | DA FARE | Unico punto aperto del matching fatture |
| 4.2 | Esportazione PDF ricette con costi | S | DA FARE | Usa **M.B** PDF brand |
| 4.3 | Dashboard food cost per reparto | M | DA FARE | Cucina / pasticceria / cocktail |
| 4.4 | Storico variazione costi ricette | M | DA FARE | |
| 4.5 | Conto economico mensile P&L automatico | M | DA FARE | Usa **M.B** PDF per export. Ricavi - costi = margine, mese per mese, confronto YoY |
| 4.6 | Alert food cost fuori soglia | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. Badge rosso se ricetta supera soglia % |
| 4.7 | Margine per piatto su menu (ranking) | S | DA FARE | Food cost x prezzo vendita, top/bottom 5. Serve prezzo in DB |
| 4.8 | **Lista della Spesa Cucina** — Fase 1 MVP testuale | S | ✅ FATTO 2026-04-27 (S59 cont. c) | Sub-voce Gestione Cucina. Mig 105 + /lista-spesa/items + /cucina/spesa. CRUD, urgente, filtri stato/urgenti/fornitore, raggruppamento per fornitore, bulk delete completati |
| 4.9 | Lista Spesa Fase 2 — link ingrediente + storico prezzi | S | DA FARE | FK opz. `ingredient_id`. Click item → storico prezzi + ultimo fornitore. Pre-requisito: 4.8 |
| 4.10 | Lista Spesa Fase 2 — vista per fornitore + WhatsApp veloce | S | DA FARE | Raggruppa items per fornitore preferito, bottone WA via **M.C** composer. Pre-requisito: 4.9 |
| 4.11 | Lista Spesa Fase 2 — generazione automatica da menu pranzo | M | DA FARE | "Genera spesa per W18" legge ricette del menu, somma yields ingredienti, sottrae stima scorta. Bottone in compositore Pranzo |
| 4.12 | Lista Spesa Fase 2 — template ricorrenti | S | DA FARE | "Spesa lunedì" si auto-crea ogni N giorni. Usa **schedule** skill |
| 4.13 | Lista Spesa Fase 2 — workflow ordinato/in_arrivo/ricevuto | M | DA FARE | Stato espanso. Matching automatico con righe fatture XML in arrivo |

---

## 5 — Clienti / CRM

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 5.1 | Mailchimp sync | M | DA FARE | API key in .env, batch sync bidirectional, UI in Import/Export |
| 5.2 | WhatsApp link rapido (scheda + compleanni) | S | DA FARE | Usa **M.C** WA composer. wa.me gratis |
| 5.3 | Compleanni con azione rapida WA/email | S | DA FARE | Usa **M.C** WA + **M.D** email. Template personalizzabile |
| 5.4 | Note rapide dalla lista clienti | S | DA FARE | Popup inline senza aprire scheda |
| 5.5 | Preview merge side-by-side | M | DA FARE | Affiancamento + scelta campo per campo |
| 5.6 | Filtri combinati avanzati (campagne) | M | DA FARE | Dopo 5.1. Query builder per segmenti marketing |
| 5.7 | Audit log modifiche CRM | S | DA FARE | Tabella clienti_audit_log |
| 5.8 | Google Contacts API | M | FUTURO | Bassa priorita', CSV funziona bene |
| 5.9 | Segmentazione RFM automatica | M | DA FARE | Recency/Frequency/Monetary da storico |
| 5.10 | Timeline cliente unificata | S | DA FARE | Cronologia: prenotazioni, note, email, no-show |
| 5.11 | Import clienti da TheFork | S | DA FARE | Usa **M.H** import engine. Dopo 2.5. CSV export da TF |

---

## 6 — Dipendenti

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 6.1 | Template WA personalizzabile buste paga | S | DA FARE | Usa **M.C** WA composer (migrare codice esistente). Textarea in Impostazioni con preview live |
| 6.2 | Allegato PDF reale via URL firmato | M | DA FARE | Usa **M.B** PDF brand. Link temporaneo 7gg nel testo WA |
| 6.3 | Checklist fine turno configurabile | M | DA FARE | Seed dati default pranzo/cena |
| 6.4 | Calendario turni visuale drag&drop | M | DA FARE | Usa **M.E** calendar. Vista mensile/settimanale |
| 6.5 | Scadenze documenti con alert | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. HACCP, contratti, permessi, visite mediche. Alert 30/15/7 gg |
| 6.6 | Costo orario e analisi produttivita' | S | DA FARE | Stipendio / ore = costo orario, costo per coperto |

---

## 7 — Cantina / Vini

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 7.1 | Flag DISCONTINUATO UI + filtro | S | DA FARE | Colonna DB gia' aggiunta, serve solo UI |
| 7.2 | Carta Vini pagina web pubblica | M | ✅ FATTO 2026-04-25 (S58) | Pagina pubblica `/carta` (no auth) con identita' osteria (Cormorant Garamond + palette beige/marrone), indice iniziale raggruppato VINI/BEVANDE + drill-down per sezione, search globale e per sezione, badge "in mescita" per bottiglie aperte, prezzo bottiglia + calice. Include anche le 8 sezioni bevande con i 3 pattern di rendering (tabella distillati, scheda birre/aperitivi, badge tisane/te'). Ottimizzata iPhone + iPad portrait/landscape. Endpoint pubblico `GET /vini/carta-cliente/data`. |
| 7.3 | PDF carta con TOC cliccabile | S | DA FARE | Usa **M.B** PDF brand |
| 7.4 | iPratico test end-to-end completo | S | DA FARE | Import → verifica → export → reimport |
| 7.5 | Import Excel con diff interattivo | M | DA FARE | Usa **M.H** import engine |
| 7.6 | Alert sottoscorta | S | DA FARE | Usa **M.A** notifiche + **M.F** alert. Soglia minima configurabile per vino |
| 7.7 | Storico prezzi fornitore (grafico) | S | DA FARE | Dati gia' in fe_righe |
| 7.8 | Inventario rapido da iPad | M | DA FARE | Lista per locazione, +/- giacenza, conferma batch |
| 7.9 | Potenziamento widget "Vini in carta senza giacenza" | M | DA FARE | Spec completa in `docs/modulo_vini_alert_widget.md`. 6 fasi approvate (Ordina inline, qta suggerita, ultima vendita, badge stato 3-click, filtro tipologia, raggruppa per distributore). Punto 7 (export lista WhatsApp) teorizzato e differito — dipende da anagrafica distributori con telefono + template configurabili + mattone M.B PDF |
| 7.10 | Bottiglia in mescita (BOTTIGLIA_APERTA) | S | ✅ FATTO 2026-04-25 (S58) | Nuova colonna su `vini_magazzino`. Toggle in scheda vino tab Giacenze. Auto-on quando si registra vendita CALICI. Widget "🥂 Calici disponibili" in `ViniVendite` e `DashboardSala`. Endpoint `GET /vini/magazzino/calici-disponibili/`. Migrazione 101. |
| 7.11 | Vista sommelier (`/vini/carta-staff`) | S | ✅ FATTO 2026-04-25 (S58) | Pagina staff loggata con identita' osteria + tabella densa: codice, vino, prezzi (bottiglia + calice), **locazioni con qta**, giacenza, badge status (in mescita/scarsa/in carta/esaurita). Filtri rapidi + search + auto-refresh 30s. Click apre scheda gestionale. Endpoint `GET /vini/magazzino/carta-staff/`. |
| 7.12 | Centro Carta gestionale ridisegno | S | ✅ FATTO 2026-04-25 (S58) | `/vini/carta` rifondato: rimossi pulsanti ridondanti ("Aggiorna anteprima" / "Apri HTML" / 3 set duplicati di export). Header con 4 azioni globali sulla carta master vini+bevande: PDF cliente / PDF staff / Word / Vedi come cliente. CartaVini diventa pannello informativo. CartaAnteprima diventa redirect. (Iter 6 aveva split-pane con anteprima inline, iter 7 l'ha rimossa per scelta UX di Marco.) |
| 7.13 | Ritmo vendite include SCARICO | XS | ✅ FATTO 2026-04-25 (S58) | Query `get_vino_stats()` cambia da `tipo='VENDITA'` a `tipo IN ('VENDITA','SCARICO')`. Razionale: bottiglia non c'e' piu' = venduta ai fini del ritmo. Statistiche scheda vino mostrano "di cui mescita N · scaricate M". |
| 7.14 | Validazioni annata + grado alcolico | XS | ✅ FATTO 2026-04-25 (S58) | Annata: type=number, regex `^\d{4}$`, range 1900-(anno+2). Grado: range 0-25%. Hard validation in `saveEdit()`. |
| 7.15 | Fix auto-calcolo prezzo calice | XS | ✅ FATTO 2026-04-25 (S58) | `autoCalcPrezzo()` ora ricalcola anche `PREZZO_CALICE` quando `PREZZO_CALICE_MANUALE=0`. Bug: prima il calice si aggiornava solo se prezzo carta digitato a mano. |
| 7.16 | Note degustative cliente per vino | M | DA FARE | Marco S58: vuole farle generare a Claude (AI) e poi personalizzarle. Richiede campo `NOTE_DEGUSTAZIONE TEXT` su `vini_magazzino` + editor in scheda vino + rendering nella carta cliente al click sulla voce. |
| 7.17 | Più distributori/rappresentanti/listini per vino | L | DA FARE | Strutturale. Tabella `vino_distributori` con record per coppia. Marco S58 lo ha listato come prossimo step grosso. |
| 7.18 | Famiglia vino che raggruppa annate | M-L | DA FARE | Tabella `vini_famiglie` + foreign key. Statistiche cross-annata (andamento vendite, andamento prezzi). |
| 7.19 | Anagrafiche normalizzate (produttori, distributori, denominazioni) | M | DA FARE | Tabelle dedicate con autocomplete + dedup automatico su nome esistente. |
| 7.20 | Vitigni con percentuali | M | DA FARE | Tabella `vini_vitigni_anagrafica` + join `vino_vitigni` con percentuale (somma=100%). |

---

## 8 — Brand / UX

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 8.1 | Pattern gobbette in empty state | S | DA FARE | Watermark decorativo |
| 8.2 | Colori tavoli editor → brand | S | BLOCCATO | Bloccato da 2.2 |
| 8.3 | About/version panel con logo | S | DA FARE | |
| 8.4 | Dark mode | L | FUTURO | Switch dark: su tutto il FE |
| 8.5 | PDF/export con header brand | M | DA FARE | Backend Python |
| 8.6 | Email template brand | S | BLOCCATO | Bloccato da 2.4 |
| 8.7 | Sistema permessi centralizzato | M | DA FARE | Matrice ruolo/azione, hook usePermissions |
| 8.8 | Shortcut tastiera + Command Palette Cmd+K | M | DA FARE | useKeyNav + palette fuzzy |
| 8.9 | Onboarding guidato nuovo utente | S | DA FARE | Wizard primo login per ruolo |
| 8.10 | Dashboard Home personalizzata per ruolo | S | DA FARE | Card filtrate per ruolo utente |
| 8.11 | Tema stagionale / branding eventi | S | FUTURO | Nice-to-have cosmetico |
| 8.12 | Dropdown Header M2 — deep search globale | M | DA FARE | Estendere ricerca del dropdown (già M1 in prod, sessione 32) anche a entità: vini per nome, clienti per cognome, fatture per numero, prenotazioni per data. Endpoint backend `/search/global?q=` che restituisce risultati raggruppati per tipo. Sezione dedicata nel dropdown sotto i moduli |
| 8.13 | Dropdown Header M3 — preview panel a 2 colonne | M | FUTURO | Layout espanso: colonna sinistra gruppi moduli, colonna destra preview del modulo selezionato (ultima attività, shortcut recenti, mini-stats). Evoluzione di M1 per desktop wide (≥1024px), fallback M1 su mobile |
| 8.14 | Tool configurazione/personalizzazione stampe (M.B estensione) | M | DA FARE | UI dedicata (probabile in Impostazioni) per personalizzare i PDF del mattone M.B: scelta logo (wordmark attuale / icon only / nascosto), testo organizzazione (nome+sub), testo footer `@page`, colori accent, toggle strip gobbette, toggle "Generato il ...", campo note libero. Persistenza in tabella `pdf_settings` (org-wide). Preview live. Endpoint `GET/PUT /pdf-settings`. Il servizio `pdf_brand._context_base` legge da DB invece che hardcoded. Include anche selettore per-tipo-documento (preventivo, ricetta, inventario) così ogni tipo può avere override. Valore: Marco vuole poter cambiare copy/brand senza toccare codice — es. logo natalizio, promo, cambio indirizzo |

---

## 9 — Notifiche & Comunicazioni (nuovo)

> Infrastruttura trasversale: notifiche automatiche dal sistema + bacheca comunicazioni staff.
> Pre-requisito per preventivi, alert prenotazioni, scadenze dipendenti, e qualsiasi modulo che debba avvisare lo staff.

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 9.1 | Infrastruttura notifiche: tabella + badge header + pannello | M | ✅ FATTO | Sessione 31. DB `notifiche.sqlite3`, servizio `notifiche_service.py`, campanello Header con badge, pannello dropdown |
| 9.2 | Comunicazioni fissate (bacheca admin → staff) | S | ✅ FATTO | Sessione 31. Pagina `/comunicazioni`, CRUD admin, lettura per ruolo, urgenze, scadenze, archiviazione |
| 9.3 | Hook notifiche su Preventivi | S | DA FARE | 10.1 completato. Notifica automatica quando preventivo cambia stato (usa M.A) |
| 9.4 | Hook notifiche su Prenotazioni | S | BLOCCATO | Bloccato da 9.1 + 2.1. Nuova prenotazione, no-show, cancellazione |
| 9.5 | Hook notifiche su Scadenze dipendenti | S | BLOCCATO | Bloccato da 9.1 + 6.5. Alert documenti in scadenza |
| 9.6 | Hook notifiche su Cantina (sottoscorta) | S | BLOCCATO | Bloccato da 9.1 + 7.6 |
| 9.7 | Notifiche push browser (Web Push API) | M | FUTURO | Evoluzione di 1.8, usa infrastruttura 9.1 |

---

## 10 — Preventivi (nuovo, sotto Clienti/CRM)

> Aggregatore preventivi per eventi privati, cene aziendali, gruppi.
> Collegato al CRM (cliente) e alle Prenotazioni (conferma → prenotazione).
> Specifica completa: `docs/modulo_preventivi.md`

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 10.1 | Fase A: DB + CRUD backend + lista/scheda frontend | M | FATTO ✅ | Sessione 32. Tabelle DB + service + router + lista filtri + scheda form + righe editabili |
| 10.2 | Fase B: Template riutilizzabili + righe editabili + totale live | S | FATTO ✅ | Sessione 32. Template in Impostazioni CRM, applicazione template a preventivi, totale live |
| 10.3 | Fase C: Generazione PDF brandizzato + invio WA/email | M | DA FARE | Usa **M.B** PDF + **M.C** WA + **M.D** email. PDF server-side con logo TRGB |
| 10.4 | Fase D: Versioning + collegamento prenotazione + badge menu | S | DA FARE | Usa **M.A** notifiche. Storico versioni PDF, conferma → crea prenotazione, badge "N in attesa" |

---

## 11 — Cucina (nuovo)

> Specifica completa: `docs/modulo_cucina.md`
> Obiettivo: sostituire registro cartaceo HACCP e task "a memoria" con sistema tap-to-complete iPad-ready.
> MVP completato sessione 43. V1/V2 evolutivi sotto.

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| 11.1 | MVP: DB + 18 API + 8 pagine FE + scheduler lazy | L | ✅ FATTO | Sessione 43. Template CRUD, tap-to-complete, numpad TEMPERATURA, agenda giorno/settimana, task singoli |
| 11.2 | Foto + firma su item FAIL | M | DA FARE | Obbligatoria per HACCP a norma. Upload su `app/data/cucina/`, thumbnail in registro |
| 11.3 | Integrazione M.F Alert Engine | S | DA FARE | Checker `cucina_checklist_pending`: notifica admin se apertura non completata entro `ora_scadenza_entro - 30min` (usa **M.A** + **M.F**) |
| 11.4 | Frequenze settimanale/mensile | S | DA FARE | Oggi solo GIORNALIERA. Estendere scheduler con giorno settimana / giorno mese |
| 11.5 | Corrective action automatico | S | DA FARE | Se item TEMPERATURA → FAIL auto-range, genera task singolo al chef con titolo precompilato |
| 11.6 | Dropdown `assegnato_user` da dipendenti | S | DA FARE | Oggi è string libero. Popolare da tabella dipendenti attivi |
| 11.7 | Dashboard KPI cucina cross-module | M | FUTURO | Score medio mensile, trend compliance, FAIL per item, utenti più attivi. Nuovo endpoint `GET /cucina/stats` |
| 11.8 | PDF export registro HACCP mensile | M | DA FARE | Usa **M.B** PDF brand. Scaricabile da `/cucina/tasks` → "Esporta registro mese" |
| 11.9 | Notifiche WA scadenze checklist | S | DA FARE | Usa **M.C** WA composer. Opzionale per admin/chef |
| 11.10 | iPad kiosk mode fullscreen | S | FUTURO | Modalità senza header/nav, solo l'istanza del turno attivo. PWA display-mode standalone |
| 11.11 | Drag & drop ordinamento items editor | S | FUTURO | Sostituire bottoni ▲▼ con drag nativo. Nice-to-have |
| 11.12 | Unificazione label "Gestione Cucina" | S | DA FARE | Oggi "Gestione Cucina" è del modulo ricette e "Cucina" del nuovo. Decidere: rename ricette → "Ricette & FoodCost", o merge dei due moduli sotto un unico "Gestione Cucina" con sub |

---

## Completati — Sessione 51 (2026-04-20/21)

| Cosa | Note |
|------|------|
| **Refactor widget "📦 Riordini per fornitore"** — Fase 7 + Fase 8 (chiusura 8/8 fasi) | v3.20: colonna Listino editabile inline in DashboardVini (pattern identico a Prezzo Carta di Fase 5). v3.21: sezione "Storico prezzi" in SchedaVino (`v1.3-riordini-fase8`) con filtro pill (listino/acquisto/ricarico/tutti), tabella Data/Campo/Prima/Dopo/Δ/Origine/Utente/Note, Δ colorato ▲red/▼green (tolleranza 0.005). Endpoint `/vini/magazzino/{id}/prezzi-storico/` già esistente da Fase 6. Refresh storico automatico dopo ogni `saveEdit()`. Tutti gli 8 step del refactor ora in produzione. |
| **Recovery TRIPLO corruzione SQLite `vini_magazzino.sqlite3`** | Tre crash consecutivi per `malformed database schema` durante la sessione (22:29, 22:51, 23:13). Tutti recuperati con `.dump \| sqlite3 NEW` da `BACKUP-20260420-223719.sqlite3` (647KB, 1261 vini, integrity ok ogni volta). |
| **Post-mortem: causa radice delle 3 corruzioni** (2026-04-21 00:55) | **Bug sistemico trovato.** Il `.gitignore` copriva `app/data/*.db-wal`/`-shm` (foodcost) ma NON `app/data/*.sqlite3-wal`/`-shm` (vini, notifiche, ecc.). Ad ogni push, il post-receive VPS eseguiva `git clean -fd` → cancellava i file `-wal`/`-shm` del DB vini → `systemctl restart trgb-backend` → sqlite_master corrotto. Match perfetto con deploy.log (3 push = 3 corruzioni). Foodcost mai corrotto perché i suoi `-wal`/`-shm` erano gia' gitignored. |
| **Fix 1.11 applicato** | 1) `.gitignore`: aggiunte `app/data/*.sqlite3-wal` e `*.sqlite3-shm` con commento storico. 2) `vini_magazzino_db.py` → v1.6-wal-protected: WAL + synchronous=NORMAL + busy_timeout in `get_magazzino_connection()`. 3) `notifiche_db.py` → v1.1-wal-protected: idem. 4) `foodcost_db.py`: aggiunto `synchronous=NORMAL` (WAL gia' c'era). Pattern recovery aggiornato in `.auto-memory/feedback_sqlite_corruption_recovery.md`. Follow-up residui: 1.11.2 (coprire altri DB), 1.12 (debounce push.sh), 1.13 (cleanup backup forensi). |

---

## Completati — Sessione 48 (2026-04-19)

| Cosa | Note |
|------|------|
| **Mattone M.E Calendar** — componente React condiviso | Nuovo mattone `frontend/src/components/calendar/`: `<CalendarView>` stateless controllato con 3 viste (mese 6×7, settimana 7 col, giorno lista). Palette brand 6 colori, tastiera ←/→/T/M/S/G, drill-down "+N altri" → vista giorno, render prop per custom cell/event. Zero dipendenze esterne (pure React). Demo su `/calendario-demo` (admin only, non linkata) con ~20 eventi finti che coprono i 4 casi d'uso roadmap (2.1 Prenotazioni blu, 3.7 Scadenziario rosso/amber, 6.4 Turni verde, 6.5 Scadenze doc slate, checklist viola). Spec completa in `docs/mattone_calendar.md`. Sblocca 2.1, 3.7, 6.4 senza dover prima costruire il mattone in ogni modulo. Effort: 1 sessione (5 commit atomici). |

---

## Completati — Sessione 47 (2026-04-19)

| Cosa | Note |
|------|------|
| Carta Bevande v1.0 — Fase 3 Export unificato | Estensione Carta Vini a 7 sezioni bevande (Aperitivi, Birre, Amari casa, Amari & Liquori, Distillati, Tisane, Tè). Nuovo service `carta_bevande_service.py` con 3 layout dispatcher (`tabella_4col` / `scheda_estesa` / `nome_badge_desc`) + sezione `vini_dinamico` delegata a `carta_vini_service`. Router `bevande_router.py` v1.1 con 5 endpoint (HTML preview, PDF cliente, PDF staff, DOCX, preview per-sezione). CSS `.bev-*` allineato HTML/PDF con page-break-avoid su scheda/badge items e fix doppio page-break sezione vini. Frontend `CartaAnteprima.jsx` v1.1, warning rimosso. Retro-compat assoluta: endpoint `/vini/carta*` invariati, DB `bevande.sqlite3` isolato. Resta Fase 4 (popolamento voci, task Marco) |

---

## Completati — Sessione 43 (2026-04-17)

| Cosa | Note |
|------|------|
| Modulo Cucina MVP v1.0 | Nuovo modulo con DB dedicato (6 tabelle), 18 endpoint, 8 pagine FE, scheduler lazy fire-and-forget su dashboard. Checklist ricorrenti giornaliere + task singoli. Tap-to-complete tap-friendly iPad con numpad touch per TEMPERATURA (range 0..4°C, fuori→FAIL). Agenda giorno/settimana, editor template admin, 3 template seed (Apertura/Chiusura/Bar). Integrato in modules.json con ruoli admin/chef/sala/viewer. Versione cucina v1.0 beta |

---

## Completati — Sessione 42 (2026-04-17)

| Cosa | Note |
|------|------|
| CG Liquidita' v2.10 — tassonomia uscite classificate | `classify_uscita()` nel service con 11 tag (Fornitori/Stipendi/Affitti/Utenze/Tasse/Carta/Banca/Assicurazioni/Bonifici/Servizi/Altro). Funzioni simmetriche `uscite_mensili_anno` + `ultime_uscite`. Frontend: Pie uscite, BarChart stacked mensili uscite, tabella ultime uscite. 135 uscite prima non categorizzate ridotte a 33 "Altro" (~12% vs ~38%). Versione CG 2.9 → 2.10 |
| CG — sezione "Liquidita'" (principio di cassa) | Nuovo service `liquidita_service.py` + endpoint `/controllo-gestione/liquidita` + pagina `ControlloGestioneLiquidita.jsx`. Tassonomia entrate custom (POS/Contanti/Bonifici/Altro) che bypassa i buchi del feed BPM. KPI + trend saldo 90gg + YoY + uscite per categoria + ultime entrate. Versione CG 2.8 → 2.9 |

---

## Completati — Sessione 41 (2026-04-17)

| Cosa | Note |
|------|------|
| CG vendite shift+daily merge | Nuovo `vendite_aggregator.py`, dashboard CG legge da qui. Fix bug "marzo poche entrate". Versione CG 2.7 → 2.8 |
| Cleanup `admin_finance_stats.py` | Codice morto rimosso, refs docs puliti |

---

## Completati — Navigazione diretta (sessione 39)

| Cosa | Note |
|------|------|
| Eliminazione hub `*Menu.jsx` | 12 file rimossi, ingresso diretto al modulo (Dashboard o equivalente) |
| `ModuleRedirect.jsx` role-aware | Prima rotta accessibile in base a `useModuleAccess`, fallback "no privileges" |
| `DashboardDipendenti.jsx` nuova | KPI reali + 4 shortcut, nessun nuovo endpoint |
| Vini — Impostazioni unificate | iPratico embedded in `ViniImpostazioni`, nav riordinato |
| iPad tooltip fix Header | bell + key con `placement="bottom"` |
| Versioni bump 11 moduli | vini 3.11, ricette 3.4, vendite 4.4, acquisti 2.5, flussi 1.9, dipendenti 2.23, statistiche 1.1, CG 2.5, clienti 2.9, prenotazioni 2.1, sistema 5.8 |

### Follow-up emersi (sessione 39)
- `DashboardCucina` dedicata (oggi Ricette→Archivio di default)
- Link "← Home" consistente in tutti i `*Nav.jsx`
- `DashboardDipendenti` v2 con grafici/trend reali
- Refactor `IPraticoSync` per componente davvero embeddable
- `useModuleAccess` auto-refresh sui cambi permessi
- Pulsante UI "reset to seed" (oggi solo API)

---

## Completati — Piano Responsive Mac+iPad (sessioni 27-28)

| ID | Cosa | Sessione |
|----|------|----------|
| B.1 | Header touch tap-toggle | 27 |
| B.2 | Tooltip popover (88 wrapping, 38 file) | 27+28 |
| B.3 | Input 16px no-zoom iOS | 27 |
| B.4 | Tap target ~40px sidebar filtri | 28 |
| B.5 | Sidebar width variabile (w-sidebar) | 28 |
| B.6 | Colonne nascoste iPad (hidden xl:table-cell) | 28 |
| P.1 | 100vh → 100dvh (fix iOS Safari URL bar) | 28 |

## Completati — Brand TRGB-02 (sessione 28)

| Cosa | Note |
|------|------|
| Palette Tailwind brand.* | red/green/blue/ink/cream/night |
| Favicon + icone PWA | 19 file in public/icons/ |
| Header v5.0 con logo gobbette | |
| Login + Home wordmark composto | |
| TrgbLoader animato | 6 dashboard |
| Grafici Recharts brand colors | 3 dashboard |
| bg-brand-cream su 90 pagine | |

## Completati — Storico rilasci

| Versione | Contenuto |
|---------|-----------|
| 2025.12 | FE XML import + Magazzino base |
| 2026.03.09 | Fix sicurezza + Auth reale + Dashboard Vini |
| 2026.03.10 | Ricette v2 + Acquisti v2 + Vendite v2 |
| 2026.03.13 | Banca v1.0 + Smart Create + Conversioni unita' |
| 2026.03.14 | Cantina v3.7 + Chiusure Turno + Cambio PIN |
| 2026.03.15 | Statistiche v1.0 + unificazione loader |
| 2026.03.16 | Cantina v4.0: filtro unificato + stampa + SchedaVino sidebar |
| 2026.03.21 | iPratico Sync v2.0 |
| 2026.03.30 | Dipendenti v2.1, CG v1.2, Flussi di Cassa v1.1, Sistema v5.0 |
| 2026.04.06 | Clienti CRM v2.0 (coppie, duplicati, segmenti, impostazioni) |
| 2026.04.11 | Bug fix batch (A1 non-fatture FIC, A2 stipendi duplicati, D2 riconciliazione parziale, D3 doppioni banca) + Dipendenti WA cedolini + CG v2.0 aggregatore completo |
| 2026.04.12 | Brand TRGB-02 integrazione completa + Piano responsive 7/7 + Tooltip migration 88 wrapping |

---

## Note operative

- Aggiornare **roadmap.md** quando un punto cambia stato
- Inserire completamenti anche in **changelog.md**
- Aggiornare `versions.jsx` come fonte di verita' per le versioni dei moduli
- Per bug/anomalie usare **problemi.md**, non questo file
