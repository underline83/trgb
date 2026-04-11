# TRGB — Briefing per Nuova Sessione
> File scritto da Claude a Claude. Leggilo per intero prima di iniziare a lavorare.
> **Aggiornalo alla fine di ogni sessione.**
> Ultima sessione: 2026-04-11 (sessione 27 — **B.1 Header touch-compatibile ✓**. Ripartenza ordinata dopo il disastro di sessione 26: una sola modifica, un solo file (`Header.jsx` v4.2 → v4.3), commit isolato come da protocollo cap. 10 `piano_responsive_3target.md`. Tap-toggle flyout su iPad/iPhone, click-outside esteso a touchstart, handler mouse condizionali su `!isTouch`. Testato su Mac + iPad reale. Nessun tocco a `useAppHeight`, SW, file pagina responsive. Prossimo passo: scegliere tra B.2/B.3/B.4/B.5/B.6 indipendenti da `useAppHeight`, oppure attaccare C.3 bisezione `useAppHeight` seguendo il workflow obbligatorio.)

---

## PROBLEMI APERTI — LEGGERE SUBITO

> 📋 Lista bug/anomalie segnalati da Marco in attesa di intervento: **`docs/problemi.md`**
> Da leggere a inizio sessione insieme a questo file. Se Marco chiede "cosa c'è da fare?", la priorità è quella lista.

---

## REGOLE OPERATIVE — LEGGERE PRIMA DI TUTTO

### Git & Deploy
- **NON fare `git commit`**. Le modifiche le fai nei file, ma il commit lo gestisce `push.sh` che lancia Marco dal suo terminale. Se committi tu, push.sh non chiede piu' il messaggio e Marco si confonde.
- **NON fare `git push`**. L'ambiente Cowork non ha accesso alla rete (SSH/internet). Il push fallira' sempre.
- **NON fare `git add -A`**. Rischi di includere file sensibili. Lascia che push.sh faccia tutto.
- **Workflow corretto**: tu modifichi i file → scrivi a Marco il testo suggerito per il commit → lui lancia `./push.sh "testo"` dal suo terminale.
- **Suggerisci SEMPRE il testo del commit** quando dici a Marco di fare il push. Formato: una riga breve in italiano/inglese che descrive cosa cambia.
- Se devi annullare le tue modifiche a un file: `git checkout -- <file>` (ma chiedi prima).

### Ambiente Cowork
- Non hai accesso alla rete. Niente curl, wget, npm install da remoto, pip install da remoto, push, fetch.
- I database `.sqlite3` e `.db` sono nella cartella `app/data/`. Puoi leggerli con sqlite3 per debug.
- push.sh scarica i DB dal VPS prima di committare, quindi i DB locali sono aggiornati solo dopo un push.

### Comunicazione con Marco
- Marco parla in italiano. Rispondi in italiano.
- Marco usa spesso CAPS LOCK per enfasi, non si sta arrabbiando.
- Quando Marco dice "caricato" significa che ha fatto il push e il VPS e' aggiornato.
- Se qualcosa non funziona dopo il push, chiedi a Marco di refreshare la pagina (Ctrl+Shift+R).

### Stile codice
- Frontend: React + Tailwind CSS, no CSS separati. Componenti funzionali con hooks.
- Backend: FastAPI + SQLite. Migrazioni numerate in `app/migrations/`.
- Pattern UI consolidati: `SortTh`/`sortRows` per colonne ordinabili, toast per feedback, sidebar filtri a sinistra.
- Colori: teal per primario, amber per warning, emerald per successo, red per errore.

### Migrazioni DB
- Le migrazioni sono in `app/migrations/NNN_nome.py` e vengono tracciate in `schema_migrations`.
- Una migrazione gia' eseguita NON verra' rieseguita. Se serve correggere, crea una nuova migrazione.
- Controlla sempre se la colonna esiste prima di ALTER TABLE (try/except).

---

## Chi sei e dove sei

Sei l'assistente AI che lavora sul gestionale interno dell'**Osteria Tre Gobbi (Bergamo)**.
Il progetto si chiama **TRGB Gestionale** — un'app web FastAPI + React in produzione su VPS Aruba.
L'utente si chiama **Marco** (mac: `underline83`, win: `mcarm`).

La cartella di lavoro e' selezionata come workspace Cowork. Puoi leggere e scrivere direttamente tutti i file del progetto.

---

## Cosa abbiamo fatto nella sessione 27 (2026-04-11) — **B.1 Header touch-compatibile ✓ (commit isolato, primo test della nuova disciplina)**

Sessione brevissima, focalizzata, con una sola sigla della scaletta eseguita secondo il protocollo post-mortem di sessione 26. Un solo file toccato, un solo commit, test su Mac + iPad reale, tutto verde. **Prima conferma che il workflow "un blocco alla volta, commit isolato, test specifico" funziona.**

### Cosa è stato fatto e lasciato in produzione

**B.1 — Header touch-compatibile** (`frontend/src/components/Header.jsx` da v4.2 → v4.3):
- Detection touch via `matchMedia("(hover: none) and (pointer: coarse)")` con listener `change` (regge anche il toggle Device Mode di Chrome DevTools)
- Tap-toggle sul row del modulo: su touch + modulo con sotto-voci, primo tap apre il flyout (`activateHover(key)`), secondo tap sullo stesso row naviga al path principale (`goTo(cfg.go)`). Moduli senza sotto-voci navigano al primo tap
- Click-outside esteso a `touchstart` oltre `mousedown` → tap fuori dal dropdown lo chiude su iPad
- `onMouseEnter`/`onMouseLeave` di row, container lista, flyout sub-menu e "ponte invisibile" condizionali su `!isTouch` → evita che gli eventi mouse sintetici post-touch dei browser mobile inneschino l'intent-detection desktop
- Desktop completamente invariato (intent-detection, hover safe-zone, intent timer 80ms tutti preservati)

### Cosa NON è stato toccato (di proposito, per rispettare il protocollo)
- `useAppHeight` → resta orfano, C.3 ancora da bisezionare
- I 6 file pagina responsive → restano `calc(100vh - Npx)` originali
- Service Worker / `main.jsx` → resta il blocco difensivo unregister
- Qualunque altro componente

### Test eseguiti
- **Mac desktop** Chrome/Safari: dropdown + hover + flyout + click = comportamento storico invariato
- **Mac Chrome DevTools Device Mode iPad**: tap-toggle funziona, click-outside funziona, moduli senza sotto-voci navigano al primo tap
- **iPad reale**: tutti i moduli con sotto-voci (Cantina, Ricette, Acquisti, Controllo Gestione, ecc.) ora accessibili via tap. Cantina e RicetteNuova aprono correttamente → **conferma indiretta che il crash di sessione 26 non dipendeva dal touch handling dell'header ma dall'hook `useAppHeight`**

### Stato scaletta B/C/D/E dopo sessione 27
Vedi "Scaletta lavori" più sotto nella sezione sessione 26 (master list aggiornata inline: B.1 marcata ✓).

### Lezione di sessione
Il protocollo post-mortem cap. 10 funziona. Un solo file, un solo commit, test specifico, push singolo → zero regressioni, zero rollback. Questo è il pattern da replicare per tutte le prossime sigle della scaletta B, e sarà OBBLIGATORIO per la bisezione di C.3.

---

## Cosa abbiamo fatto nella sessione 26 (2026-04-11) — **App Apple roadmap + tentativo PWA Fase 0 + tentativo Punto 1 useAppHeight (entrambi rollback)**

Sessione "ambiziosa che è esplosa". Aperta con l'analisi sull'evoluzione di TRGB in app Apple, finita con due rollback in produzione e una lezione operativa importante sul commit a blocchi accoppiati. Stato finale: codice in produzione **identico a fine sessione 25** + qualche file di docs/scaffold mai attivato + un blocco difensivo in `main.jsx` per ripulire eventuali service worker registrati.

### Cosa è stato lavorato e LASCIATO IN PRODUZIONE
- **`docs/analisi_app_apple.md`** (NUOVO, 331 righe) — analisi completa dello sforzo per portare TRGB su Apple. 5 scenari (A-E), pitfall Apple Review Guidelines 4.2 e 2.5.2, stime costi/tempi
- **`docs/roadmap.md` §33 "App Apple standalone"** (NUOVO) — Fase 0 PWA + Fase 1 Capacitor + Fase 2 SwiftUI. Vedi nota più sotto: la checklist Fase 0 è da rivedere perché contrassegnata "x" su cose poi rollbackate
- **`docs/piano_responsive_3target.md`** (NUOVO, riscritto due volte) — piano in 7 punti per ottimizzare Mac+iPad. Marco ha messo iPhone esplicitamente FUORI SCOPE: "la voglio vedere a progetto quasi finito, pensarci ora e poi cambiare architettura non ha senso". Il piano è ancora valido come riferimento futuro per **B.1-B.6**, ma il **Punto 1 va rivisto** (vedi sotto)
- **`frontend/src/main.jsx`** — blocco difensivo `serviceWorker.getRegistrations().then(unregister)` + `caches.delete()`. Lasciato attivo perché ripulisce automaticamente client (Mac/iPad) dove era stato registrato il sw.js durante il tentativo PWA. Si può togliere quando saremo sicuri che nessun client ha più SW vecchio (qualche giorno)
- **`frontend/src/hooks/useAppHeight.js`** (NUOVO) — file presente sul disco ma **non importato da nessuna parte**. Lasciato per riutilizzo dopo debug. Non è in produzione, non viene compilato nel bundle perché orfano

### Cosa è stato fatto e poi ROLLBACKATO

**Tentativo 1 — PWA Fase 0** (manifest, sw.js, icone, meta iOS):
- Implementato in pieno: 19 icone Apple/PWA generate da `logo_tregobbi.png` 5000x5000 in `frontend/public/icons/`, `manifest.webmanifest`, `sw.js` con strategia stale-while-revalidate per app shell + bypass per cross-origin API, meta tag Apple in `index.html`, fix `.gitignore` per il pattern `Icon?` che match-ava silenziosamente `/icons/`
- Caricato sul VPS (push #1)
- Sintomo: su iPad crash aprendo Cantina (MagazzinoVini) e Nuova Ricetta (RicetteNuova). Su Mac inizialmente OK
- Diagnosi sospetta: cache stale-while-revalidate del sw.js servita male da iOS Safari al primo deploy, oppure incoerenza tra index.html nuovo e chunk Vite vecchi
- **Rollback (push #3):** registrazione SW disabilitata in `main.jsx`, sostituita con blocco unregister difensivo. **Manifest, icone, meta tag iOS, .gitignore fix RIMASTI sul disco** ma inerti senza il SW

**Tentativo 2 — Punto 1 piano responsive (`useAppHeight` hook)**:
- Hook creato in `src/hooks/useAppHeight.js`: misura `window.innerHeight - <header>.offsetHeight`, setta `--app-h` su `<html>`, ricalcola su resize/orientationchange/ResizeObserver del banner viewer
- Importato + chiamato in `App.jsx` prima del return condizionale (per rispettare regole hook React)
- 6 file pagina convertiti da `calc(100vh - Npx)` a `var(--app-h, 100dvh)` con eventuali sottrazioni per sub-nav locali (FattureElenco, FattureFornitoriElenco, ControlloGestioneUscite, DipendentiAnagrafica, MagazzinoVini, ControlloGestioneRiconciliazione)
- Caricato sul VPS (push #1, insieme alla PWA)
- Sintomo dopo rollback PWA: Cantina **continuava a crashare anche su Mac**, anche dopo rollback puntuale di MagazzinoVini al `calc(100vh - 88px)` originale. RicetteNuova (che non era stata toccata dal Punto 1!) crashava lo stesso → la causa era l'hook globale, non il CSS pagina-per-pagina
- Ipotesi mai verificata: ResizeObserver loop sul `<header>` o interazione con tabelle `position: sticky` di MagazzinoVini su iOS WebKit
- **Rollback (push #4):** import + chiamata `useAppHeight` rimossi da `App.jsx`, tutti i 6 file pagina ripristinati ai valori originali `calc(100vh - Npx)`. Il file `useAppHeight.js` rimane sul disco come orfano per riutilizzo dopo debug

### Lezione di sessione — workflow per tentativi futuri di useAppHeight e PWA
**Mai più commit a blocchi accoppiati su modifiche infrastrutturali rischiose.** Il tentativo di oggi mescolava 3 cambiamenti incrociati (PWA SW + hook globale + 6 file CSS) in un push solo. Quando è esploso non c'era modo di bisezionare la causa senza rollback completo. Strategia per la prossima volta (vedi C.3 e D.4 nella scaletta più sotto):

**Per il `useAppHeight`** (C.3):
1. Commit isolato 1 — solo `useAppHeight.js` + chiamata in `App.jsx`. NESSUN file pagina toccato. L'hook setta `--app-h` ma nessuno lo usa. Marco testa: tutte le pagine devono andare come prima. Se crasha qui → bug nell'hook stesso (sospetto: ResizeObserver loop, fallback iOS Safari < 15.4 senza dvh, race header non ancora montato)
2. Commit isolato 2 — UNA pagina sostituita, la più semplice (DipendentiAnagrafica, struttura piatta senza sub-nav)
3. Commit 3-7 — una pagina alla volta nell'ordine: FattureElenco → FattureFornitoriElenco → ControlloGestioneUscite → ControlloGestioneRiconciliazione → MagazzinoVini (la più complessa per ultima)

**Per la PWA Fase 0** (D.4):
- Riprogettare `sw.js` con strategia diversa: `CACHE_NAME` legato a `BUILD_VERSION` (cache buster automatico a ogni deploy), strategia network-first per app shell (no SWR), nessun precache di chunk Vite
- Testare prima in dev tools desktop con throttling network e modalità "Offline" prima di toccare il VPS
- Su iPad: testare con Safari devtools collegato (Mac → Safari → Develop → iPad) per vedere errori console reali

### Stato file dopo questa sessione

| File | Stato | Note |
|---|---|---|
| `docs/analisi_app_apple.md` | ✅ in produzione | Riferimento Fase 0/1/2 Apple |
| `docs/piano_responsive_3target.md` | ✅ in produzione | Piano 7 punti, valido per B.1-B.6, **Punto 1 da rifare con bisezione** |
| `docs/roadmap.md §33` | ⚠️ da rivedere | Checklist Fase 0 marca [x] cose poi rollbackate |
| `frontend/public/manifest.webmanifest` | 🟡 sul disco ma inerte | Nessuno lo carica perché meta link manifest in index.html è ancora attivo ma il SW è disabilitato |
| `frontend/public/icons/` (19 file) | 🟡 sul disco ma non usati | Verranno usati quando rifaremo la PWA |
| `frontend/public/sw.js` | 🟡 sul disco ma non registrato | Lasciato come riferimento, ma il file ha il bug originale, da riscrivere |
| `frontend/src/main.jsx` | ⚠️ con blocco difensivo unregister SW | Tenere finché non si è certi che nessun client ha SW vecchio (qualche giorno), poi semplificare |
| `frontend/src/hooks/useAppHeight.js` | 🟡 orfano sul disco | Da reinvestigare con C.3 prima di reimportare |
| `frontend/src/App.jsx` | ⚠️ ha import commentato `// import useAppHeight ...` | Riga 12, riga 130 |
| 6 file pagina (FattureElenco, FattureFornitoriElenco, CGUscite, DipendentiAnagrafica, MagazzinoVini, CGRiconciliazione) | ✅ identici a sessione 25 | Tutti tornati a `calc(100vh - Npx)` originale |

### Scaletta lavori per le prossime sessioni (master list)

**B — Piano responsive Mac+iPad (resto, dopo aver risolto C.3)**
- ~~B.1~~ ✅ **FATTA SESSIONE 27** — Header touch-compatibile: `matchMedia("(hover: none) and (pointer: coarse)")`, tap-toggle flyout, click-outside esteso a touchstart, handler mouse condizionali su `!isTouch`. File toccato: `Header.jsx` v4.2 → v4.3. Testato Mac + iPad reale, tutto verde
- B.2 Punto 3 — Tooltip popover componente (sostituisce `title=` nativo che non funziona su iPad). 15-20 occorrenze critiche. ⏱ ~30 min, rischio basso
- B.3 Punto 4 — Input font-size 16px su touch (`@media (pointer: coarse)` in `index.css`, no zoom iOS). ⏱ 5 min, rischio basso
- B.4 Punto 5 — Tap target 40-44px su sidebar filtri (~30-40 sostituzioni Tailwind). ⏱ ~45 min, rischio basso
- B.5 Punto 6 (opzionale) — Sidebar width → variabile `w-sidebar` in `tailwind.config.js`. ⏱ 15 min
- B.6 Punto 7 (CONDIZIONALE) — Tabelle critiche `hidden xl:table-cell` su colonne secondarie. SOLO se test iPad reale conferma scroll orizzontale dopo B.1-B.4. Approvazione tabella per tabella

**C — Debito tecnico**
- C.1 `FattureDettaglio.jsx:253` `inline ? "78vh" : "88vh"` — viewer dentro dialog. Da migrare a `var(--app-h)` quando avremo certezza che è sicuro
- C.2 `SchedaVino.jsx:523` — gemello di C.1, stesso pattern
- **C.3 (NUOVO) Reinvestigare `useAppHeight`**: bisezione step-by-step come descritto sopra. Pre-requisito per qualunque uso di `var(--app-h)`. Probabili sospetti: ResizeObserver loop, race header non montato, fallback iOS < 15.4 senza dvh, interazione con tabelle sticky di MagazzinoVini

**D — App Apple roadmap §33**
- D.1 Test PWA Fase 0 su iPad reale — **bloccato fino a D.4**
- D.2 Decisione Fase 1 Capacitor (richiede iscrizione Apple Developer $99/anno)
- D.3 Versione iPhone lite — **bloccato fino a "progetto quasi finito"** per decisione esplicita di Marco (sessione 26)
- **D.4 (NUOVO) Re-implementare PWA Fase 0** con strategia cache safe per iOS: CACHE_NAME legato a BUILD_VERSION, network-first per app shell, no precache di chunk Vite, test in dev tools prima di pushare. Pre-requisito di D.1

**E — Backlog generale (preesistente)**
- E.1 Mailchimp sync (vedi `project_backlog.md` in memoria)
- E.2 Google Contacts API
- E.3 Modulo Prenotazioni — 5 fasi, obiettivo eliminare TF Manager (`docs/modulo_prenotazioni.md`, `docs/prenotazioni_todo.md`)

---

## Cosa abbiamo fatto nella sessione 23 (2026-04-10 notte) — **Incident backup + refactor FattureDettaglio + Scadenzario sidebar**

Sessione di "pulizia e cleanup" dopo la chiusura della v2.0 CG aggregatore. Partita come piccolo giro di refactor, finita come sessione lunga con un incident backup critico risolto + 3 refactor UX importanti + fix infrastrutturale permanente.

### Incident backup — fermo da 12 giorni, risolto e blindato
- **Scoperta** — `scripts/backup_db.sh` aveva perso il bit `+x` (quasi certamente dopo un push.sh precedente: git non sempre preserva la mode bit quando il file viene riscritto). Il cron hourly+daily falliva con `Permission denied` senza entrare nello script. Ultimo backup hourly riuscito: 2026-03-29 22:33. La cartella `daily/` era completamente vuota
- **Fix immediato** — `chmod +x` sul VPS, test con `--daily`: tutti i DB backuppati, rotazione OK, sync Google Drive OK
- **Architettura — `backup_router.py` v2** — scoperto che il router leggeva da `/home/marco/trgb/backups/*.tar.gz` (Sistema B, residuo morto) mentre il cron vero scrive in `/home/marco/trgb/trgb/app/data/backups/daily/YYYYMMDD_HHMMSS/` (Sistema A). Riscritto per puntare al sistema reale, nuova helper `_list_daily_snapshots()`, download on-the-fly via tarfile in memoria, nuovo campo `last_backup_age_hours`
- **UX — banner warning 3 livelli** in `TabBackup`: verde ≤30h, amber 30-48h, red >48h. Se il bit `+x` sparisce di nuovo Marco lo vede subito invece di accorgersene settimane dopo
- **Bug fix — `clienti.sqlite3` escluso dal backup da sempre** — trovato durante la verifica UI. Né `backup_db.sh` né `backup_router.py` lo elencavano. Aggiunto in entrambi
- **Cleanup** — rimosso `backup.sh` orfano dalla root, riscritto `setup-backup-and-security.sh` con le crontab corrette, aggiornati `docs/deploy.md` + `docs/GUIDA-RAPIDA.md` + questo file
- **Fix permanente idempotente** — aggiunto step "Verifica bit +x script critici" dentro `push.sh` che itera un array `EXEC_SCRIPTS=("scripts/backup_db.sh" "push.sh")` e se il mode letto da `git ls-files --stage` non è `100755` esegue `git update-index --chmod=+x`. Idempotente: quando tutto è ok non fa nulla. Così è impossibile rilasciare una versione con gli script critici non eseguibili

### Acquisti v2.2 → v2.3 — Unificazione FattureDettaglio (Fase H)
- **Fine dei "due moduli fatture"** — prima di oggi il dettaglio fattura aveva due implementazioni parallele: il componente riutilizzabile `FattureDettaglio` (usato in `/acquisti/dettaglio/:id` e nello split-pane dello Scadenzario) e un `DetailView` locale dentro `FattureElenco.jsx` (~130 righe) con stile suo proprio. La nuova grafica "sidebar colorata + SectionHeader" di v2.1b non appariva in Acquisti → Fatture perché quella vista continuava a usare la vecchia DetailView
- **`FattureElenco.jsx` riscritto** — `DetailView` locale eliminato. Il ramo "dettaglio aperto" ora renderizza `<FattureDettaglio fatturaId={openId} inline={true} onClose={...} onSegnaPagata={...} onFatturaUpdated={...}>`. State locale semplificato: rimossi `dettaglio` e `detLoading`, resta solo `openId`
- **Nuova prop `onSegnaPagata`** in `FattureDettaglio` — se passata, la sidebar colorata mostra il bottone "✓ Segna pagata" in ambra (solo se non pagata/non rateizzata/stato ≠ PAGATA). Il componente chiama la callback del parent e poi esegue `refetch()` automaticamente. Funzionalità "segna pagata manuale" preservata dal vecchio DetailView ma ora disponibile ovunque

### Dettaglio Fornitore v3.2 — Sidebar colorata + FattureDettaglio inline (Acquisti v2.3)
- **Refactor grafico `FornitoreDetailView`** — allineato a `FattureDettaglio`/`SchedaVino`. Nuovo layout due colonne `grid-cols-1 lg:grid-cols-[300px_1fr]` con sidebar colorata a sinistra. Top bar ("Torna alla lista", "Nascondi da acquisti / Ripristina") sopra, fuori dalla griglia
- **Sidebar colorata con stato semantico** — gradiente teal (ATTIVO), amber (IN SOSPESO se `nDaPagare > 0`), slate (ESCLUSO se `fornitore_escluso = 1`). Costante `FORNITORE_SIDEBAR` + helper `getFornitoreSidebar()`. Contenuti: header (nome+P.IVA+CF+badge), box totale spesa grande, 4 KPI compatti, box "Da pagare" (rosso se scadute), info list primo/ultimo acquisto, sede, distribuzione categorie, ID tecnico
- **`SectionHeader` uniforme** — helper locale per delimitare "Categoria generica fornitore" e "Condizioni di pagamento" nell'area principale
- **Unificazione — dettaglio fattura inline usa FattureDettaglio** — eliminato il subcomponente `FatturaInlineDetail` (~130 righe) che duplicava il rendering. Sostituito da `<FattureDettaglio fatturaId={openFatturaId} inline={true} ... />`. Cleanup state (`fatturaDetail`/`fatturaDetLoading` rimossi), `openFattura(id)` ora è un semplice toggle. `onSegnaPagata`/`onFatturaUpdated` triggerano `reloadFatture()` + `handleFatturaUpdatedInline()` per sync sidebar+tabella

### Controllo Gestione v2.1c — Rewrite sidebar Scadenzario
- **Problemi identificati** — 7 palette diverse nei blocchi filtro (white/sky/indigo/purple/amber/violet/neutral) = rumore visivo; filtri impilati verticalmente sprecavano spazio (Stato: 4 bottoni × ~28px = 112px); pulsanti Pulisci/Aggiorna dentro il flusso scrollabile, sparivano appena scorrevi
- **Nuova struttura flat 240px** — outer `flex flex-col` con body `flex-1 overflow-y-auto` + footer sticky `flex-shrink-0`. Una sola palette neutra con accenti semantici solo dove servono. Sezioni separate da `border-b border-neutral-100`, header `text-[10px] uppercase tracking-wider`
- **Stato come griglia 2×2** — `grid-cols-2 gap-1.5`, ogni stato assume il suo colore semantico quando attivo (Tutti neutral-800, Da pagare amber-100, Scadute red-100, Pagate emerald-100)
- **Tipo come segment control** — pill group orizzontale `flex rounded-md bg-neutral-50 p-0.5`, pill attivo `bg-white shadow-sm`. Molto più compatto
- **Periodo preset in 3 colonne** + Da/A date inline nella riga sotto
- **Filtri speciali fusi** — Rateizzate + Solo in pagamento come toggle con dot-indicator, "Gestisci batch" come dashed-border nello stesso blocco, Riconciliazione come badge violet condizionale
- **Footer sticky** con Pulisci (disabled quando nessun filtro attivo) + Aggiorna sempre visibili

### Versioning
- **`versions.jsx`** — `fatture` v2.2 → v2.3 (unificazione + dettaglio fornitore v3.2), `controlloGestione` v2.1b → v2.1c (sidebar Scadenzario)

### Workflow lessons apprese
- **Bit +x è un single point of failure infrastrutturale** — perdere il bit eseguibile su uno script cron significa zero allerta e zero backup finché qualcuno non guarda manualmente. Soluzione: fix idempotente dentro `push.sh` + banner warning nella UI
- **"Due implementazioni parallele di X" è un debito da estinguere subito** — appena ci si rende conto che un componente locale e un componente riutilizzabile fanno la stessa cosa con stile diverso, bisogna eliminare il locale. Altrimenti ogni miglioria fatta sul riutilizzabile non arriva mai all'altra vista
- **Sidebar con 7 colori diversi è peggio di una con 1 colore** — il colore deve veicolare informazione (stato semantico), non "fare carino". Flat + spazio bianco + accenti mirati batte sempre il carnevale

---

## Cosa abbiamo fatto nella sessione 22 (2026-04-10) — **v2.0 CG aggregatore completata**

Sessione lunga (mattina → notte). Divisa in due tempi: backfill sospeso al pomeriggio, poi ripreso e completato con tutta la parte backend + frontend v2.0.

### v2.0 CG aggregatore — Fase A (schema + backfill)

1. **Mig 055** `fe_fatture.rateizzata_in_spesa_fissa_id` + indice parziale — APPLICATA
2. **Mig 056** `fe_fatture.data_prevista_pagamento`, `data_effettiva_pagamento`, `iban_beneficiario`, `modalita_pagamento_override` + 4 indici — APPLICATA
3. **Mig 057** dry-run CSV del backfill rateizzazioni — APPLICATA
4. **`scripts/apply_backfill_057.py`** — backup automatico + transazione atomica. **Backfill applicato: 43/43 fatture flaggate** (compreso Metro Italia risolto con `find_metro.py`)
5. **`docs/v2.0-decisioni.md`** — consolidate le decisioni architetturali (F4 insight: analitico vs finanziario, 3 campi data)

### v2.0 CG aggregatore — Fase B (backend)

- **B.1** — `GET /controllo-gestione/uscite` riscritto come vista JOIN su `fe_fatture`. COALESCE chain per `data_scadenza_effettiva`, `modalita_pagamento_effettiva`, `iban_beneficiario_effettivo`. CASE per normalizzare stato → `RATEIZZATA`/`PAGATA`. Query param `includi_rateizzate` (default OFF) che nasconde le 43 righe rateizzate. Retrocompat piena sul payload JSON
- **B.1.1** — toggle sidebar "Mostra rateizzate" nello Scadenzario + sfondo viola righe RATEIZZATA + badge permanente `STATO_STYLE.RATEIZZATA`
- **B.2** — `PUT /uscite/{id}/scadenza` riscritto come **smart dispatcher 2-rami**: FATTURA con `fattura_id` → `fe_fatture.data_prevista_pagamento`; altro → `cg_uscite.data_scadenza` (legacy). Delta calcolato da `fe_fatture.data_scadenza` XML per fatture v2. **Nota**: `cg_piano_rate` non ha `data_scadenza`, quindi dispatcher 2-rami (non 3 come in roadmap originaria). Frontend `apriModaleScadenza` inietta `data_scadenza_originale` semantica (XML per fatture, cg_uscite per il resto)
- **B.3** — nuovi endpoint `PUT /uscite/{id}/iban` e `PUT /uscite/{id}/modalita-pagamento` (dispatcher). FATTURA → `fe_fatture.iban_beneficiario` / `fe_fatture.modalita_pagamento_override`; SPESA_FISSA → `cg_spese_fisse.iban`; altri → 422. Helper `_normalize_iban` (upper+strip), `_normalize_mp_code`. Risposta con `fonte_modifica` per tracciamento

### v2.0 CG aggregatore — Fase D (FattureDettaglio arricchito)

- **`GET /contabilita/fe/fatture/{id}` esteso** con tutti i campi v2.0 (scadenze, IBAN, mp override, rateizzata flag, sub-oggetto `uscita` con batch) + COALESCE chain Python-side
- **`FattureDettaglio.jsx`** — nuova card "Pagamenti & Scadenze" tra header e righe con:
  - Badge stato uscita + badge rateizzata/batch
  - Banner viola + link alla spesa fissa se rateizzata
  - 3 tile editabili (Scadenza / Modalità / IBAN) con flag "override", edit inline → endpoint B.2/B.3
  - Modifica bloccata se PAGATA o RATEIZZATA
  - Breadcrumb `?from=scadenzario` → "Torna allo Scadenzario"
  - Toast feedback emerald/red

### v2.0 CG aggregatore — Fase E (Scadenzario click-through)

- **`handleRowClick` intelligente** nello Scadenzario: FATTURA → FattureDettaglio; SPESA_FISSA → SpeseFisse con highlight; altri → modale legacy. Tooltip dinamico
- **`ControlloGestioneSpeseFisse.jsx`** supporta `?highlight=<id>&from=scadenzario`: scrollIntoView + `animate-pulse ring-amber`, param rimosso dopo 4s, bottone "← Torna allo Scadenzario" teal in header

### Workflow lessons apprese

- **push.sh SOLO dal main working dir** (`/Users/underline83/trgb`). MAI dai worktree `.claude/worktrees/*` — committa sul branch sbagliato e il push non arriva in main (salvato come memory `feedback_push_sh_cwd.md`)
- **VPS git status sporco è cosmetico**: il post-receive hook usa `--git-dir=$BARE --work-tree=$WORKING_DIR checkout -f` che scrive i file ma non aggiorna il `.git/` locale. L'indicatore vero del deploy è `deploy.log` sul VPS (salvato come memory `project_vps_cosmetic_git.md`)
- **Non fidarsi del titolo del commit**: quando B.1 era "già pushato" secondo il messaggio, in realtà il commit conteneva solo i docs. Il router era in un worktree non committato. Lezione: sempre `git show --stat <hash>` per verificare

---

## Cosa abbiamo fatto nella sessione 21 (2026-04-06)

### Gestione Clienti v1.1: Merge duplicati, protezione dati, export
1. **Merge duplicati** — UI 3-step (principale → secondari → conferma), batch merge, trasferimento prenotazioni/note/tag/alias
2. **Filtri duplicati** — 3 modalità: telefono, email, nome+cognome; esclusione "non sono duplicati"
3. **Protezione dati CRM** — campo `protetto`, tag `auto/manual`, alias merge per import sicuro
4. **Import intelligente** — protetti: riempimento campi vuoti + aggiornamento rank/spending; non protetti: sovrascrittura completa
5. **Export Google Contacts** — CSV per Gmail con nome, email, telefoni, compleanno, allergie, tag come gruppi
6. **push.sh refactoring** — flag -f/-m/-d, aggiunto clienti.sqlite3 a sync DB

### Sessione 20: Gestione Clienti v1.0 (CRM completo)
1. **DB dedicato** `clienti.sqlite3` — 7 tabelle con trigger e indici
2. **Backend completo** `clienti_router.py` (~1200 righe) — tutti gli endpoint CRM
3. **Import TheFork** — clienti (30 colonne XLSX) + prenotazioni (37 colonne XLSX)
4. **Anagrafica (Lista)** — tabella ordinabile, sidebar filtri, paginazione
5. **Scheda cliente** — layout 3 colonne, edit inline, tag toggle, diario note, storico prenotazioni
6. **Dashboard CRM** — KPI, compleanni, top clienti, distribuzione, andamento mensile
7. **Dashboard CRM** — 8 KPI card, compleanni 7gg, top 20 clienti, rank/tag/canale distribution, andamento mensile 12 mesi, copertura contatti
8. **Vista Prenotazioni** — tabella globale con filtri (stato, canale, date), badge colorati, paginazione
9. **Import UI** — due sezioni (clienti + prenotazioni) con istruzioni step-by-step, drag & drop XLSX

### Sessione 19 (2026-04-05)
10. Vendite v4.2: turni chiusi parziali, fix DELETE chiusura
11. Sistema v5.3: logging strutturato, centralizzazione DB, error handler globale

### Sessione 18 (2026-04-01/02)
12. Vendite v4.1, Controllo Gestione v1.4, Flussi di Cassa v1.3-1.4, Dipendenti v2.1

---

## Cosa abbiamo fatto nella sessione 17 (2026-03-29)

### Controllo Gestione v1.0: Nuovo modulo, dashboard, tabellone uscite

#### Nuovo modulo Controllo Gestione
1. **Modulo top-level** integra Finanza (rimosso) — colore sky/cyan, icona 🎯
2. **Dashboard unificata** — KPI vendite/acquisti/banca/margine, andamento annuale, top fornitori, categorie acquisti
3. **Tabellone Uscite** — importa fatture da Acquisti, calcola scadenze, gestisce stati (DA_PAGARE, SCADUTA, PAGATA, PARZIALE)
4. **Confronto Periodi** — placeholder per confronto mesi/anni

#### Estrazione DatiPagamento da XML FatturaPA
5. **fe_import.py** — aggiunta funzione `_extract_dati_pagamento()` che estrae DatiPagamento/DettaglioPagamento (condizioni, modalità, scadenza, importo) dall'XML
6. **Migration 031** — aggiunge `condizioni_pagamento`, `modalita_pagamento`, `data_scadenza`, `importo_pagamento` a `fe_fatture` + `modalita_pagamento_default`, `giorni_pagamento`, `note_pagamento` a `suppliers`

#### Tabelle Controllo Gestione
7. **Migration 032** — crea `cg_uscite` (fatture importate con stato pagamento), `cg_spese_fisse` (affitti, tasse, stipendi), `cg_uscite_log`

#### Import uscite e logica scadenze
8. **POST /controllo-gestione/uscite/import** — importa fatture da fe_fatture → cg_uscite, calcola scadenza (XML > default fornitore > NULL), aggiorna stati
9. **GET /controllo-gestione/uscite** — tabellone con filtri (stato, fornitore, range date, ordinamento)
10. **GET /controllo-gestione/uscite/senza-scadenza** — fatture senza scadenza (da configurare)

#### Condizioni pagamento fornitore
11. **FattureFornitoriElenco.jsx** — aggiunta sezione "Condizioni di pagamento" nella scheda fornitore (modalità, giorni, note)
12. **PUT /controllo-gestione/fornitore/{piva}/pagamento** — salva condizioni pagamento default per fornitore

#### Ancora da fare (prossime sessioni)
- **Punto 5**: Cross-ref pagamenti con Banca (matching uscite ↔ movimenti)
- **Spese Fisse**: sezione per affitti, tasse, stipendi, prestiti, rateizzazioni
- **Gestione contanti**: matching pagamenti cash
- Finanza: RIMOSSO in sessione 18

---

## Cosa abbiamo fatto nella sessione 15 (2026-03-28)

### Acquisti v2.2: Filtro categoria sidebar, fix fornitori mancanti, dettaglio migliorato

#### Fix fornitori mancanti (sessione 14+15)
1. **stats_fornitori query riscritta** — il vecchio LEFT JOIN con `escluso` filter nel WHERE nascondeva fornitori legittimi. Ora usa NOT EXISTS subquery per esclusione + JOIN separato per categoria
2. **forn_key fix** — COALESCE non gestiva fornitore_piva="" (empty string vs NULL). Ora usa CASE WHEN

#### Filtro categoria sidebar
3. **FattureFornitoriElenco.jsx** — aggiunto dropdown "Categoria fornitore" nella sidebar sinistra (filtra per categoria assegnata al fornitore, oppure "Senza categoria")
4. **stats_fornitori** — ora ritorna `categoria_id` e `categoria_nome` dal JOIN con fe_fornitore_categoria + fe_categorie

#### Dettaglio fornitore migliorato
5. **KPI arricchiti** — aggiunto "Media fattura" e "Da pagare" (importo rosso, solo se ci sono fatture non pagate)
6. **Layout header** — P.IVA e C.F. su stessa riga, piu' compatto
7. **Pulsante "Escludi" ridisegnato** — grigio discreto, diventa rosso solo al hover

#### Sessione 14 (2026-03-25/27) — riepilogo
8. **Toast feedback** per azioni massive in MagazzinoVini.jsx
9. **Categoria fornitore propagata** ai prodotti (con flag `categoria_auto`)
10. **Righe descrittive nascoste** (prezzo_totale=0 filtrate da prodotti e cat_status)
11. **Colonne ordinabili** sia nella tabella fornitori che nella tab fatture del dettaglio
12. **Esclusione fornitori** (Cattaneo/Bana come affitti) con filtro in stats_fornitori
13. **Migrazione 027** (fe_righe.categoria_auto) + **028** (reset valori errati)

---

## Cosa abbiamo fatto nella sessione 13 (2026-03-23)

### Gestione Vendite v4.0: Dashboard unificata 3 modalita', chiusure configurabili, cleanup fiscale
- Fix home page vuota per superadmin (modules.json + Home.jsx)
- Pre-conti nascosti in Impostazioni (solo superadmin)
- Dashboard fiscale pulita: contanti come residuo, rimossi alert/differenze
- Confronto YoY con smart cutoff (giorno corrente se mese in corso)
- Chiusure configurabili: closures_config.json + CalendarioChiusure.jsx
- Dashboard unificata 3 modalita' (Mensile/Trimestrale/Annuale) in una pagina

---

## Cosa abbiamo fatto nella sessione 12 (2026-03-22)

### Gestione Acquisti v2.1: FIC API v2 enrichment, SyncResult tracking, fix UI escluso

#### Backend — fe_import.py (fatture list/import)
1. **Rimosso `escluso` field da query `/fatture`** — il flag e' solo per product matching module, non per acquisti
2. **Rimosso LEFT JOIN con `fe_fornitore_categoria`** dalla list endpoint e stats (fornitori, mensili)
3. **Import XML arricchisce fatture FIC** — quando import XML matcha una fattura FIC esistente, aggiunge le righe XML se FIC ritorna `is_detailed: false`
4. **Import XML aggiorna importi** — da XML SdI: imponibile, IVA, totale quando arricchisce

#### Backend — fattureincloud_router.py (FIC sync)
5. **SyncResult tracking v2.0** — include `items` list e `senza_dettaglio` list
6. **Debug endpoint** — `GET /fic/debug-detail/{fic_id}`
7. **Phase 2 XML preservation** — se FIC `items_list` vuoto, righe da XML non vengono cancellate

#### Frontend
8. **FattureElenco.jsx** — rimosso badge/filtro "Escluse", anno default = current year
9. **FattureImpostazioni.jsx** — sync result table + warning box + 10-min timeout
10. **FattureDashboard.jsx** — anno default = current year

---

## Cosa abbiamo fatto nella sessione precedente (2026-03-20, sessione 11)

### Infrastruttura: backup, sicurezza, multi-PC, Google Drive

1. **ChiusuraTurno.jsx** — autosave localStorage completo
2. **ChiusureTurnoLista.jsx** — fix formula quadratura
3. **VPS Recovery** — fail2ban whitelist, backup automatico notturno
4. **Git ibrido** — origin=VPS + github=GitHub, push.sh
5. **Windows configurato** — SSH + Git + VS Code
6. **backup_router.py** — download backup on-demand dall'app
7. **rclone + Google Drive** — upload automatico backup

---

## Sessioni precedenti (3-11)

| # | Data | Tema |
|---|------|------|
| 10 | 2026-03-16 | Cantina & Vini v4.0 — filtro unificato, stampa selezionati, SchedaVino sidebar |
| 9 | 2026-03-15c | Modulo Statistiche v1.0 — import iPratico + analytics vendite |
| 8 | 2026-03-15b | Unificazione loader carta + DOCX tabelle + fix cancellazione movimenti |
| 7 | 2026-03-15 | Eliminazione vecchio DB vini.sqlite3 + fix carta PDF/HTML |
| 6 | 2026-03-14 | Chiusure Turno — modulo completo + Cambio PIN |
| 5c | 2026-03-14a | Cantina & Vini v3.7 — filtri locazione gerarchici |
| 5b | 2026-03-13 | Modulo Banca v1.0 + Conversioni unita' + Smart Create UX |

---

## Stato attuale del codice — cose critiche da sapere

### Backup & Sicurezza (CONFIGURATO)
- **Backup notturno** alle 3:00 → `/home/marco/trgb/backups/` + upload Google Drive (`TRGB-Backup/`)
- **Download dall'app**: Admin → Impostazioni → tab Backup
- **fail2ban**: whitelist reti private, bantime 10 minuti
- **Snapshot Aruba**: da configurare settimanalmente dal pannello

### Git & Deploy (CONFIGURATO)
- **Mac** (`~/trgb`): origin=VPS, github=GitHub, push.sh
- **Windows** (`C:\Users\mcarm\trgb`): origin=VPS, github=GitHub
- **VPS**: bare repo + post-receive hook per deploy automatico
- **Flusso**: `./push.sh "msg"` oppure `git push origin main && git push github main`

### Modulo Chiusure Turno
- **Backend**: `chiusure_turno.py` con endpoint POST/GET per chiusure + pre-conti + spese
- **Frontend**: `ChiusuraTurno.jsx` (form con autosave localStorage), `ChiusureTurnoLista.jsx` (lista admin con quadratura corretta)
- **DB**: `admin_finance.sqlite3` con tabelle shift_closures, shift_preconti, shift_spese

### Dashboard Vendite v4.0
- **3 modalita'**: Mensile / Trimestrale / Annuale in un'unica pagina
- **Confronto YoY smart**: cutoff al giorno corrente se periodo in corso
- **Dati fiscali puliti**: solo corrispettivi, contanti come residuo
- **Chiusure configurabili**: giorno settimanale + festivi in closures_config.json

### Cambio PIN
- **Frontend**: `CambioPIN.jsx` a `/cambio-pin`
- **Backend**: usa endpoint esistente `PUT /auth/users/{username}/password`

### Modulo Acquisti — Fornitori (v2.2)
- **Categorizzazione a 3 livelli**: prodotto manuale > fornitore manuale > import automatico
- **`auto_categorize_righe()`** in `fe_categorie_router.py`: shared helper usato da import XML e FIC sync
- **`categoria_auto` flag** su `fe_righe`: 0=manuale, 1=ereditata da import
- **Badge cat_status**: ok (tutte manuali), auto (ha ereditate), partial, none, empty
- **Filtri sidebar**: ricerca testo, anno, categoria fornitore, stato prodotti
- **Pattern UI**: SortTh/sortRows su tutte le tabelle, toast per feedback

### REGOLA CRITICA: campi `escluso` e `escluso_acquisti` in fe_fornitore_categoria
- `escluso` → usato SOLO dal modulo **Ricette/Matching** (RicetteMatching.jsx). Nasconde fornitori irrilevanti dal matching fatture-ingredienti.
- `escluso_acquisti` → usato SOLO dal modulo **Acquisti**. Nasconde fornitori da dashboard/KPI/grafici (es. affitti Cattaneo/Bana).
- **NON mescolare mai i due campi**. Ogni modulo usa il suo.
- Le query acquisti (`_EXCL_WHERE`) filtrano: `is_autofattura = 0 AND escluso_acquisti = 0`
- Toggle nel dettaglio fornitore: "Nascondi da acquisti" / "Ripristina"
- Nell'elenco fornitori: esclusi nascosti di default, checkbox "Mostra esclusi" nella sidebar

### FORCE IMPORT SENZA CHECK RUOLO
`vini_magazzino_router.py` riga ~403: commento `# per ora nessun controllo di ruolo`.

---

## Mappa versioni moduli

Fonte di verita': `frontend/src/config/versions.jsx`

| Modulo | Versione | Stato |
|--------|----------|-------|
| Cantina & Vini | v3.8 | stabile |
| Gestione Acquisti | v2.3 | stabile |
| Ricette & Food Cost | v3.0 | beta |
| Gestione Vendite | v4.2 | stabile |
| Statistiche | v1.0 | beta |
| Flussi di Cassa | v1.5 | beta |
| Controllo Gestione | v2.1c | beta |
| Gestione Clienti | v2.0 | beta |
| Prenotazioni | v2.0 | beta |
| Dipendenti | v2.1 | stabile |
| Login & Ruoli | v2.0 | stabile |
| Sistema | v5.3 | stabile |

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
| 29 | DNS dinamico rete casa (DDNS) | In standby |
| 30 | Snapshot Aruba settimanale | Da configurare |

---

## Prossima sessione — TODO

1. **Completare refactoring DB** — Code ha saltato ipratico_products_router (2 conn), corrispettivi_export (1 conn), dipendenti (1 conn)
2. **Testare wizard rateizzazione** — creare una rateizzazione di prova con spese legali e rate variabili
3. **Configurare snapshot Aruba settimanale** dal pannello
4. **DNS dinamico casa** (DDNS) — rimandato
5. **Checklist fine turno** — seed dati default pranzo/cena, UI configurazione
6. **Flag DISCONTINUATO** — UI edit + filtro in dashboard vini

---

## File chiave — dove trovare le cose

```
main.py                                — entry point, include tutti i router
app/services/auth_service.py           — auth PIN sha256_crypt
app/data/users.json                    — store utenti (marco/iryna/paolo/ospite)

# --- BACKUP ---
app/routers/backup_router.py           — download backup on-demand, lista, info, age warning
scripts/backup_db.sh                   — backup orario + giornaliero (cron) + sync Google Drive
setup-backup-and-security.sh           — setup cron + fail2ban (one-time)

# --- CHIUSURE TURNO ---
app/routers/chiusure_turno.py          — backend, prefix /chiusure-turno
frontend/src/pages/admin/ChiusuraTurno.jsx  — form fine servizio (con autosave)
frontend/src/pages/admin/ChiusureTurnoLista.jsx — lista chiusure admin (quadratura corretta)

# --- VENDITE ---
app/routers/admin_finance.py              — corrispettivi legacy + stats + chiusure configurabili
app/routers/closures_config_router.py     — GET/PUT config chiusure
app/data/closures_config.json             — config giorno settimanale + giorni chiusi
frontend/src/pages/admin/VenditeNav.jsx   — navigazione (senza tab Annuale)
frontend/src/pages/admin/CorrispettiviDashboard.jsx — dashboard unificata 3 modalita'
frontend/src/pages/admin/CorrispettiviImport.jsx    — impostazioni sidebar (chiusure + import)
frontend/src/pages/admin/CalendarioChiusure.jsx     — UI calendario chiusure

# --- VINI ---
app/routers/vini_router.py               — carta vini + movimenti (v3.0, solo magazzino)
app/routers/vini_magazzino_router.py     — magazzino vini CRUD
app/routers/vini_cantina_tools_router.py — strumenti cantina (v3.1, loader unificato)
app/models/vini_magazzino_db.py          — DB unico vini + fix delete_movimento
app/services/carta_vini_service.py       — builder HTML/PDF/DOCX carta vini
app/repositories/vini_repository.py      — load_vini_ordinati() da magazzino (usato da tutti)

# --- ACQUISTI (FATTURE ELETTRONICHE) ---
app/routers/fe_import.py                    — import XML/ZIP, stats fornitori, dashboard, drill
app/routers/fe_categorie_router.py          — categorie, assegnazione prodotti/fornitori, auto_categorize
app/routers/fattureincloud_router.py        — sync FIC API v2
frontend/src/pages/admin/FattureFornitoriElenco.jsx — lista fornitori con sidebar filtri + dettaglio inline
frontend/src/pages/admin/FattureDashboard.jsx       — dashboard acquisti
frontend/src/pages/admin/FattureElenco.jsx          — lista fatture
frontend/src/pages/admin/FattureCategorie.jsx       — gestione categorie
frontend/src/pages/admin/FattureImpostazioni.jsx    — import + sync settings

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

# --- IMPOSTAZIONI ---
frontend/src/pages/admin/ImpostazioniSistema.jsx — tab Utenti + Moduli + Backup (standalone, /impostazioni)

# --- CLIENTI CRM ---
app/models/clienti_db.py                 — init DB clienti.sqlite3 (5 tabelle, trigger, indici)
app/routers/clienti_router.py            — CRUD + import TheFork + dashboard + prenotazioni (~900 righe)
frontend/src/pages/clienti/              — Menu, Nav, Lista, Scheda, Dashboard, Import, Prenotazioni

# --- FRONTEND ---
frontend/src/App.jsx                   — tutte le route (50+), /admin redirect a /impostazioni
frontend/src/config/api.js             — API_BASE + apiFetch()
frontend/src/config/versions.jsx       — versioni moduli
frontend/src/config/modulesMenu.js     — config moduli/sotto-menu (usata da Home + Header)
frontend/src/components/Header.jsx     — header flyout v4.1 + cambio PIN
frontend/src/pages/Home.jsx            — home con card moduli (usa modulesMenu.js)
frontend/src/pages/CambioPIN.jsx       — self-service + admin reset
```

---

## DB — mappa rapida

| Database | Moduli |
|----------|--------|
| ~~`vini.sqlite3`~~ | ELIMINATO v3.0 — carta ora da magazzino |
| `vini_magazzino.sqlite3` | Cantina moderna |
| `vini_settings.sqlite3` | Settings carta |
| `foodcost.db` | FoodCost + FE XML + Ricette + Banca + Statistiche + CG (migraz. 001-049, include cg_entrate, cg_piano_rate) |
| `admin_finance.sqlite3` | Vendite + Chiusure turno |
| `clienti.sqlite3` | Clienti CRM (anagrafica, tag, note, prenotazioni) |
| `dipendenti.sqlite3` | Dipendenti (runtime) |

### Backup database
- **Automatico orario**: ogni ora al minuto 0 → `app/data/backups/hourly/YYYYMMDD_HHMMSS/` (retention 48h)
- **Automatico giornaliero**: ore 03:30 → `app/data/backups/daily/YYYYMMDD_HHMMSS/` + sync Google Drive `TRGB-Backup/db-daily` (retention 7gg)
- **Script**: `scripts/backup_db.sh --hourly | --daily` — usa `sqlite3 .backup` (copia atomica)
- **Manuale da app**: Admin → Impostazioni → tab Backup (banner rosso se ultimo backup > 48h)
- **Manuale da CLI**: `ssh trgb "/home/marco/trgb/trgb/scripts/backup_db.sh --daily"`
- ⚠️ **Attenzione**: il bit `+x` sullo script può sparire dopo un push.sh. Fix: `chmod +x scripts/backup_db.sh`.

---

## Deploy — PROCEDURA OBBLIGATORIA

> **IMPORTANTE PER CLAUDE:** Dopo ogni commit, ricorda SEMPRE a Marco di fare il deploy
> con `push.sh`. Lo script nella root del progetto fa TUTTO automaticamente.

```bash
./push.sh "messaggio commit"       # deploy rapido
./push.sh "messaggio commit" -f    # deploy completo (pip + npm)
```

### NOTA: Claude NON puo' eseguire push.sh
Lo script richiede accesso SSH al VPS. Marco deve lanciarlo dal terminale del Mac o Windows.

---

## Aggiorna questo file a fine sessione

Sostituisci la sezione "Cosa abbiamo fatto" con i task completati oggi.
Aggiorna la tabella dei task se ne hai chiusi.
