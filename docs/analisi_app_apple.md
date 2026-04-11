# TRGB Gestionale — Analisi: trasformare TRGB in app Apple standalone

**Autore:** Claude, sessione 26
**Data:** 2026-04-11
**Target richiesto da Marco:** iPad (primario) + Mac (secondario) + iPhone versione "lite", distribuzione interna poi App Store pubblico.

---

## 1. Punto di partenza — cos'è oggi TRGB

Prima di parlare di "app Apple" conviene fotografare onestamente cos'è TRGB adesso, perché le dimensioni cambiano radicalmente la risposta.

**Backend (FastAPI / Python 3.12)**
- 29 router, **393 endpoint** HTTP
- ~39.300 righe di Python
- 64 migrazioni SQL già eseguite
- 9 database SQLite separati (`foodcost.db`, `vini_magazzino.sqlite3`, `dipendenti.sqlite3`, `admin_finance.sqlite3`, `clienti.sqlite3`, `vini.db`, `vini_settings.sqlite3`, `vini.sqlite3`, `dipendenti.db`)
- Librerie "pesanti": pandas, openpyxl, pyxlsb, weasyprint (genera PDF carta vini/cedolini), pdfplumber + pikepdf (parser LUL buste paga), python-docx, jinja2, httpx
- Integrazioni esterne: **Fatture in Cloud API v2**, **iPratico** (import .xls HTML), **Mailchimp**
- Auth JWT con PIN, ruolo `viewer` read-only gestito in middleware
- Deploy: VPS Aruba Ubuntu, systemd (`trgb-backend`, `trgb-frontend`), nginx, HTTPS Certbot, `push.sh` → post-receive hook

**Frontend (React 18 + Vite + Tailwind)**
- ~52.500 righe di JSX/JS
- **121 pagine React** distribuite su 11 moduli (Vini, Foodcost/Ricette, Acquisti/FE, Corrispettivi, Dipendenti, Banca, Controllo Gestione, Statistiche, Clienti CRM, Prenotazioni, Settings/Backup)
- Pattern consolidati: `SortTh/sortRows`, sidebar filtri SX, toast, SectionHeader, FattureDettaglio, SchedaVino, FornitoreDetailView, Scadenzario
- Router: `react-router-dom@7`, fetch via `apiFetch` wrapper + `API_BASE` centralizzato
- Grafici: recharts
- Nessun state manager globale (no Redux/Zustand), no service worker, no offline, no bundle code-splitting aggressivo

**Traduzione in linguaggio umano:** TRGB non è una "piccola app". È un ERP verticale da ristorazione con ~92.000 righe di codice, 11 moduli funzionanti in produzione, e tocca filesystem, PDF, parser Excel, API esterne e 9 database. Questo è cruciale per capire le stime che seguono.

---

## 2. Lessico — le quattro strade, spiegate

Marco, qui ti spiego le parole che il resto del documento usa di continuo. Non conoscerle è la parte più faticosa, il resto è decisione informata.

### 2.1 "Nativa" vs "Web app" vs "Ibrida" — definizioni

**App web** (oggi). È un sito che gira nel browser. L'utente apre Chrome/Safari, digita `trgb.tregobbi.it`, logina. Non c'è nessuna "app" installata. Pro: un solo codice, aggiornamenti istantanei, niente Apple. Contro: sembra un sito, non un'app; richiede internet; su iPad non hai icona in home, non hai notifiche push vere, non hai accesso ai "pezzi nativi" (camera, NFC, stampanti Bluetooth sistema).

**App nativa**. È un programma scritto in un linguaggio pensato apposta per Apple (Swift o Objective-C). Vive sul dispositivo, ha la sua icona, usa i controlli grafici "veri" (le tabelle di iOS, i menu di macOS, le tastiere specializzate). È quello che sono Numbers, Messaggi, Photos. Pro: UX perfetta, accesso a TUTTO l'hardware Apple, performance massime, può funzionare offline. Contro: devi riscrivere l'interfaccia da zero (quelle 121 pagine React non si riciclano), devi imparare (o farmi imparare) Swift e SwiftUI.

**Wrapper web (Capacitor/Tauri/WKWebView)**. È un "guscio nativo minimale" che dentro ospita il tuo sito. Il wrapper è un'app vera, firmata, distribuibile su App Store; ma quando la apri vede una WebView a schermo intero che carica il tuo React. In pratica: Safari-senza-barra dentro un'icona con scritto TRGB. Pro: riusi TUTTO il frontend che hai (quelle 121 pagine continuano a funzionare), ottieni icona + splash + un po' di integrazione nativa (camera, stampanti, notifiche). Contro: l'UX resta "da web", le tabelle scrollano come nel browser non come su iPad, le gesture non sono perfette, Apple in review storicamente è diffidente verso wrapper "vuoti" (vedi §6).

**App ibrida**. Come il wrapper, ma con UNA DIFFERENZA: alcune parti sono native vere (es. la dashboard sala, lo scanner codici a barre, la stampa scontrino) e altre restano WebView. È la scelta di molti ERP reali: non riscrivono tutto, ma buttano nativo le schermate "che contano" dove la differenza di UX è drammatica.

### 2.2 "Backend sul VPS" vs "backend embedded" vs "ibrido offline-first"

Questa è una decisione SEPARATA da quella del frontend. Posso avere frontend nativo e backend che resta sul VPS, oppure tutto embedded. Sono assi indipendenti.

**Backend cloud (stato attuale)**. FastAPI continua a girare su Aruba. L'app iPad è un "client" che chiama `https://app.tregobbi.it/...`. Se cade internet, l'app non funziona. È quello che fanno Slack, Notion, Gmail. Pro: zero cambiamenti al backend, DB singolo condiviso tra tutti i dispositivi, un solo posto dove aggiornare la logica. Contro: richiede connessione sempre viva, latenza 50-300ms su ogni azione, se cade il VPS il servizio muore.

**Backend embedded**. FastAPI + SQLite dentro l'app stessa. Quando Marco apre TRGB su iPad, Python parte sul dispositivo e serve localmente. Pro: offline totale, latenza zero, zero dipendenza dal VPS. Contro: Apple **non permette di eseguire interpreti di codice arbitrario** sulla App Store (vedi §6). Python embedded su iOS è tecnicamente fattibile (BeeWare, Kivy, Pyodide) ma non è supportato ufficialmente e rischi il rifiuto in review. Inoltre: ogni dispositivo ha il SUO SQLite → **problema di sincronizzazione**. Se tu e una cameriera lavorate in parallelo, chi vince? Apri un baratro.

**Ibrido offline-first**. Backend vive sul VPS (fonte di verità) ma l'app tiene una **cache locale** dei dati essenziali. Quando c'è rete sincronizza in background; quando non c'è, lavori sulla cache e le modifiche vengono mandate al VPS appena torna il segnale. È il modello di **Things, GoodNotes, Apple Notes, Fantastical**. Pro: funziona in sala anche col wifi che balla, latenza percepita zero. Contro: sync conflicts da gestire (due dispositivi modificano la stessa prenotazione), più complesso da costruire.

### 2.3 Come arriva un'app sull'iPad — App Store, TestFlight, sideload

Per capire quanto lavoro Apple aggiunge al progetto:

- **Apple Developer Program**: $99/anno, obbligatorio per qualunque app nativa. Serve anche per TestFlight.
- **Firma e certificati**: ogni build deve essere firmata con il tuo certificato. Se non è firmata, iOS non la lancia.
- **Sideload "diretto"**: tecnicamente possibile ma limitato (certificati enterprise solo per aziende ≥100 dipendenti, oppure developer profile 7 giorni che scade). **Sconsigliato per uso reale**: ogni settimana dovresti reinstallare.
- **TestFlight**: via preferita per uso privato. Carichi la build, inviti te stesso + fino a 10.000 utenti. Ogni build scade dopo 90 giorni. Review minimale, molto più veloce dell'App Store. Tu dalla tua parte ottieni una vera app Apple, installata da TestFlight come qualsiasi beta.
- **App Store**: review Apple completa (2-14 giorni), guidelines da rispettare, rifiuti possibili. Serve se vuoi vendere TRGB ad altri ristoratori.

**Raccomandazione sottotraccia:** fase 1 TestFlight, fase 2 App Store. Mai sideload "manuale".

---

## 3. Scenari — quanto lavoro servirebbe davvero

Qui arriva la parte operativa. Ti presento cinque scenari ordinati dal più economico al più costoso. Per ognuno: cosa ottieni, cosa ti costa, cosa resta fuori.

### Scenario A — PWA (Progressive Web App) — "sembra un'app ma non lo è"

**Cos'è.** Aggiungi al tuo React attuale un manifest JSON e un service worker. Il risultato: su iPad Safari puoi fare "Aggiungi a Home" e ottieni **un'icona sulla home che lancia TRGB a schermo intero, senza barra Safari**. Visivamente è quasi indistinguibile da un'app. Può cachare asset (JS/CSS) per avvio veloce, e con un po' di lavoro anche risposte API (offline base).

**Cosa NON è.** Non è un'app Apple. Non passa da App Store. Niente notifiche push vere su iOS (Apple ha aperto parzialmente nel 2023 ma è limitato). Niente accesso sistema avanzato.

**Lavoro stimato:** 1-3 giorni di lavoro mio + test.
- Creare `manifest.webmanifest` con icone TRGB (1024, 512, 180, 167…)
- Aggiungere service worker (Workbox) per cache shell app + cache API GET
- Aggiustare il viewport e i meta tag Apple-specific
- Splash screens per iPad/iPhone (immagini per ogni risoluzione)
- Test su iPad reale e fix degli angoli smussati / safe area

**Costo ricorrente:** zero. Nessun Apple Developer Program, niente review.

**Quando sceglierla:** se il punto è "voglio un'icona sulla home dell'iPad e un'apertura veloce senza barra Safari", la PWA è il 90% della strada a costo zero. È il primo passo che raccomanderei comunque fare, anche se poi passi a qualcos'altro — i miglioramenti fatti qui (cache, icone, manifest) si riusano.

**Verdetto:** ottimo "livello 0". Non è davvero un'app Apple, ma per uso interno dell'osteria potrebbe bastarti a lungo.

---

### Scenario B — Wrapper Capacitor (React dentro shell nativa iOS/iPadOS/macOS)

**Cos'è.** Capacitor è un progetto open source di Ionic che prende la tua web app e la impacchetta dentro un progetto Xcode. Concretamente: cloniamo il tuo `frontend/`, aggiungiamo Capacitor, `npx cap add ios`, si genera una cartella `ios/` con un progetto Xcode che al lancio apre `https://app.tregobbi.it` dentro una WKWebView a schermo intero. La build risultante è un'**app `.ipa` firmata**, installabile via TestFlight e pubblicabile su App Store.

**Cosa ci guadagni davvero:**
- Icona + splash nativi, firma Apple, distribuzione TestFlight/App Store.
- **Accesso a plugin nativi**: fotocamera (per foto piatti o scansione codici), condivisione file, notifiche push, biometria (FaceID/TouchID per il login al posto del PIN), stampa AirPrint, file system nativo per export Excel/PDF.
- Nessuna riscrittura del frontend. Le 121 pagine React continuano a funzionare identiche.
- Build macOS via Mac Catalyst: stesso progetto Xcode, target in più, ottieni una versione Mac "gratis" con qualche aggiustamento.

**Cosa NON ti guadagna:**
- La UX resta "da web". Le tabelle di Acquisti/Fatture scrollano come nel browser, non come una vera tabella iPad. I popup non sono sheet nativi. Le gesture non sono native.
- Performance: stesse del sito web (WKWebView è lo stesso motore di Safari, è veloce, ma non è Swift).
- **Rischio review Apple**: la guideline 4.2 ("Minimum Functionality") dice che Apple può rifiutare app che sono "solo un sito web impacchettato". In pratica bisogna aggiungere almeno 2-3 feature native che non si potrebbero fare sul solo browser (push notifications, FaceID, scan barcode), altrimenti il rischio di rifiuto è reale.

**Lavoro stimato:** 3-6 settimane di lavoro mio.
- Settimana 1: setup Capacitor, progetto Xcode, icone, splash, build primo test locale
- Settimana 2: integrazione plugin nativi minimi (camera, biometria, print, share)
- Settimana 3: fix safe area, tastiera, scroll momentum, toast → `Haptics`, fix vini Tailwind che su iPadOS a volte glitcha
- Settimana 4: versione iPhone "lite" → nascondere moduli che non servono su schermo piccolo (CG, Statistiche, Banca) e tenere solo quelli usabili (Prenotazioni, Clienti, Chiusure Turno, Dashboard Sala)
- Settimana 5: build Mac Catalyst, aggiustamenti desktop (menu bar, shortcut tastiera)
- Settimana 6: iscrizione Apple Developer, primi test TestFlight, fix cose emerse sul dispositivo reale

**Costo ricorrente:** $99/anno Apple Developer.

**Quando sceglierla:** è la scelta **pragmaticamente più sensata** per TRGB oggi, se l'obiettivo è "voglio un'app Apple vera ma non ho tempo/voglia di riscrivere il frontend". Ti porta a un'app `.ipa` firmata in poche settimane anziché mesi/anni, con il backend che NON tocchi.

---

### Scenario C — Ibrido Capacitor + schermate critiche in SwiftUI

**Cos'è.** Scenario B + alcune pagine chiave riscritte native SwiftUI. Tipicamente:
- **Dashboard Sala** (nativa): usata in sala dai camerieri, tap veloce, deve essere reattiva al tocco
- **Prenotazioni** (nativa): form rapido, scroll lista, integrazione con Contatti iOS, condivisione conferma via Messaggi/WhatsApp
- **Scan fatture / import documenti** (nativa): accesso a VisionKit per riconoscere codici
- Tutto il resto (Foodcost, Controllo Gestione, Acquisti, Dipendenti, Vini, Banca) resta React dentro Capacitor

**Perché farlo.** Perché le schermate dove "si tocca tanto in sala" meritano l'UX nativa, ma i moduli gestionali da ufficio (che usi sul Mac o sul portatile seduto) vanno benissimo in WebView.

**Lavoro stimato:** 2-4 mesi di lavoro mio, oltre allo Scenario B.
- Scelta del framework di comunicazione WebView ↔ Swift (Capacitor Custom Plugin o WKScriptMessageHandler)
- Riscrittura di 4-6 schermate in SwiftUI, con il loro modello dati
- Sync dello stato tra la parte React e la parte nativa (non banale: lo stesso cliente modificato in due viste deve restare coerente)
- Ti insegno/ti mostro SwiftUI base mentre lavoriamo

**Costo ricorrente:** $99/anno.

**Quando sceglierla:** è la strada "nativa dove conta, web dove non conta". Compromesso forte se alcune schermate sono davvero critiche (Dashboard Sala, Prenotazioni) ma riscrivere TUTTO è fuori budget. La guideline Apple 4.2 qui è MENO rischiosa perché hai funzionalità native reali.

---

### Scenario D — Riscrittura totale in SwiftUI (frontend nativo, backend VPS)

**Cos'è.** Cancelliamo `frontend/`. Ricreo da zero l'interfaccia in **SwiftUI** (il framework UI moderno di Apple, funziona per iOS + iPadOS + macOS con lo stesso codice, grazie a Swift). Il backend FastAPI resta dov'è, l'app SwiftUI fa chiamate REST a `https://app.tregobbi.it` esattamente come fa React oggi. Nessun Python nell'app.

**Cosa ottieni:**
- UX **perfetta**: tabelle native iPad, drag & drop nativo, menu contestuali, menu bar Mac, shortcut tastiera, full keyboard nav, VoiceOver, Dark Mode automatico, Dynamic Type
- Zero WebView. Performance massime. 60fps sempre.
- App "vera" agli occhi di Apple: nessun rischio review 4.2
- Code sharing 90% tra iPad e Mac (SwiftUI gira su entrambi)
- iPhone "lite" fattibile nello stesso progetto, compilando per target diverso
- Su Mac: menu bar, finestre multiple, drag file dal Finder, tutto "per default"

**Cosa costa:**
- **Riscrivere da zero 121 pagine**. Non è "portare", è ricostruire. Anche se la logica business resta nel backend, la UI va reinventata pensando ai controlli nativi.
- Serve imparare SwiftUI + modello dati (SwiftData / Combine / async-await Swift). Io posso aiutare e scrivere io il codice, ma tu dovrai capire cosa leggi quando rivediamo i diff.
- Lo stack sviluppo cambia: serve Xcode (solo su Mac), simulatore iOS, device fisico per test pro.

**Lavoro stimato:** **8-14 mesi** se lavoriamo come fatto finora (sessioni concentrate, io scrivo, tu testi, push via VPS). Breakdown:
- Mese 1-2: progetto Xcode, routing, auth JWT, API layer, componenti di base (table, form, sidebar, toast, sort)
- Mese 3-4: moduli "bassi" — Settings, Vini, Clienti (sono i più semplici)
- Mese 5-6: Prenotazioni, Chiusure Turno, Dashboard Sala
- Mese 7-8: Foodcost, Ricette, Matching fatture
- Mese 9-10: Acquisti, Fatture XML, Scadenzario
- Mese 11: Dipendenti, Banca
- Mese 12-13: Controllo Gestione (il più complesso, con aggregatori e grafici)
- Mese 14: Statistiche, Backup UI, iPhone lite, rifinitura, TestFlight

**Costo ricorrente:** $99/anno.

**Quando sceglierla:** se vuoi vendere TRGB ad altri ristoratori sull'App Store come prodotto commerciale vero. A quel punto un wrapper non basta, hai bisogno di qualcosa che competa con Plateform, TheFork Manager, Cassa in Cloud, e in quel mercato l'UX è il primo filtro.

**Verdetto onesto:** questo scenario è *ambizioso*. 8-14 mesi sono realistici solo se TRGB diventa il tuo progetto principale e ci dedichi tempo ogni settimana. Se resta "quando ho tempo la sera", metti pure 18-24 mesi.

---

### Scenario E — Tutto nativo + offline-first con sync

**Cos'è.** Come Scenario D **più**: dentro l'app non c'è solo la UI, c'è anche una cache locale in **SwiftData** (il DB locale moderno di Apple, sostituto di Core Data) che replica i dati essenziali. Quando c'è rete si sincronizza col backend VPS via REST + WebSocket. Quando non c'è, lavori sulla cache e al ritorno del segnale i delta vengono spediti al VPS.

**Perché è significativo.** TRGB in sala — Dashboard, Prenotazioni, Chiusura turno — deve funzionare anche se il wifi dell'osteria fa i capricci. Un'app che ha bisogno di internet costante per cambiare lo stato di una prenotazione è frustrante.

**Cosa costa in più rispetto a D:**
- Architettura sync: "ultimo scrittore vince" è semplice ma sbagliato (perdi dati). Servono strategie tipo per-record vector clock, oppure operazioni idempotenti con ID client. Non è un weekend di lavoro, è un mese di progettazione + implementazione per ogni modulo che vuole offline.
- Backend va esteso: endpoint di sync, gestione conflitti, endpoint delta (`GET /since=<timestamp>`), migrazioni coordinate client/server
- Testing pesante: ogni modulo va provato in condizioni di rete degradata

**Lavoro stimato:** Scenario D + **3-6 mesi aggiuntivi**, solo per i moduli che vale davvero la pena rendere offline (Dashboard Sala, Prenotazioni, Chiusure Turno, Clienti base). Mettere offline l'intero Controllo Gestione è tempo sprecato: quello lo usi dall'ufficio con fibra.

**Costo ricorrente:** $99/anno.

**Quando sceglierla:** solo se hai deciso di fare lo Scenario D e vuoi davvero entrare nel mercato "gestionale ristorazione" come prodotto professionale. Altrimenti è overkill.

---

## 4. Riassunto scenari

Per fissare le idee, riepilogo in modo compatto:

- **A — PWA.** 1-3 giorni. Icona home + schermo intero. Non è davvero un'app Apple ma è il primo passo a costo zero.
- **B — Wrapper Capacitor.** 3-6 settimane. App Apple vera, App Store compatibile, riusa tutto React. Rischio review lieve se non aggiungi feature native.
- **C — Ibrido Capacitor + SwiftUI.** 2-4 mesi oltre a B. Schermate critiche native, resto in WebView. Compromesso intelligente.
- **D — Nativa SwiftUI completa.** 8-14 mesi. UX perfetta, backend resta sul VPS. Base per prodotto commerciale.
- **E — Nativa SwiftUI + offline.** D + 3-6 mesi. Offline-first sui moduli di sala. Professionale.

---

## 5. La mia raccomandazione motivata

Considerato il contesto reale (osteria che lavora, tu sei il solo manutentore, obiettivo iPad/Mac primario con iPhone lite, fase privata → fase App Store pubblica), la strada che consiglio è:

### Fase 0 — PWA subito (1 settimana di lavoro)

Qualsiasi cosa faremo dopo, partiamo con manifest + service worker + splash screens + icone alta risoluzione. Costo: zero. Effetto immediato: tu e chi in osteria usa TRGB può mettere un'icona in home dell'iPad e aprire a schermo intero. Nessun rischio, nessun impegno futuro, nessun Apple Developer. Tutto ciò che facciamo qui (icone, manifest, offline cache base) ti rimane anche se domani decidi di non andare oltre.

### Fase 1 — Wrapper Capacitor per iPad/iPhone/Mac (2-3 mesi di lavoro)

Se dopo la PWA senti il bisogno di "avere l'app vera su App Store", questo è il passo giusto. Investimento contenuto, rischio basso, risultato concreto: `.ipa` firmata, TestFlight privato, poi submission App Store. Prendi $99 di Apple Developer, facciamo il progetto Xcode insieme, io ti faccio vedere come si compila.

Aggiungiamo almeno queste feature native per passare la review Apple 4.2 senza discussioni:
- **FaceID/TouchID** al posto del PIN per login (drastica migliora UX sull'iPad)
- **AirPrint** per carte vini, cedolini, PDF (già li generi backend, basta aprirli con il share sheet iOS)
- **Share sheet iOS** per prenotazioni (manda conferma via Messaggi o Mail direttamente)
- **Notifiche push** per nuove prenotazioni o avvisi sistema (vedi backup che non gira)
- **Scanner codici a barre** per l'import prodotti iPratico (opzionale ma impressiona in review)

Per iPhone facciamo un build separato che mostra solo Dashboard, Prenotazioni, Chiusure Turno, Clienti (nascondiamo Controllo Gestione, Foodcost, Acquisti che sono inusabili su 6").

### Fase 2 — decisione dopo un anno di uso reale

Solo a quel punto, con dati veri in mano ("l'app Capacitor è abbastanza? cosa manca? dove l'UX fa schifo?"), decidiamo:
- Se stai vendendo TRGB ad altri ristoratori e la concorrenza ha app native → passa a Scenario C o D
- Se sta benissimo così → stai fermo, risparmi soldi e tempo

**Perché non partire subito da SwiftUI nativa.** Tre motivi duri:
1. **Bruci 8-14 mesi** per rimettere in produzione le stesse funzionalità che oggi funzionano. Nel frattempo bloccheresti tutto lo sviluppo di features nuove (Mailchimp sync, Google Contacts, fasi Prenotazioni aperte).
2. **Rischio grosso** di scoprire a metà che una libreria Python di cui dipendi (es. parser LUL buste paga con pdfplumber) non ha equivalente Swift → ti ritrovi comunque a chiamare il backend, quindi tanto vale lasciare il backend com'è.
3. **SwiftUI è ancora giovane su alcune cose**: tabelle grandi con sort/filter custom come quelle di Acquisti sono ancora un po' acerbe rispetto a quello che il tuo React fa già bene.

---

## 6. Cose che Apple ti farà scoprire quando ci arrivi

Elenco in prosa di sorprese che incontrerai solo in fase di submission, perché nessuno le dice prima:

**Guideline 4.2 — Minimum Functionality.** Apple ha iniziato dal 2022 circa a rifiutare app che sono "un sito web impacchettato" senza valore aggiunto. La soluzione è aggiungere almeno 3 feature che non potresti avere nel browser: push notifications, FaceID, biometria, integrazione camera, AirPrint, share sheet nativa. Nello Scenario B di sopra le ho già suggerite apposta.

**Guideline 2.5.2 — No downloaded executable code.** Le app non possono scaricare ed eseguire codice eseguibile (tipo interpreti Python, JavaScript arbitrario). Per questo lo Scenario con FastAPI+Python dentro l'app è rischioso: Apple potrebbe considerare l'interprete Python come "codice eseguibile scaricato" e rifiutare. Wrapper WebView è invece esplicitamente permesso purché la WebView usi WKWebView (e Capacitor lo fa).

**Account Apple Developer individuale vs Business.** $99/anno. Puoi iscriverti come persona fisica (Marco Carminati) oppure come azienda (Osteria Tre Gobbi srl). Con persona fisica sei limitato nelle API (es. niente CarPlay, niente DriverKit), ma per TRGB va benissimo. Con account business devi mandare documenti D-U-N-S che richiedono 1-2 settimane.

**Certificati e profili.** Ogni build firmata richiede: un certificato sviluppatore, un App ID, un profilo di provisioning, un certificato di distribuzione, un profilo di distribuzione. Xcode oggi gestisce automaticamente quasi tutto con "Automatic signing", ma la prima volta è comunque un'ora di clic e panico.

**Screenshot store e privacy.** La submission App Store richiede: 6.5" iPhone screenshot, 6.7" iPhone screenshot, iPad Pro 12.9" screenshot, 13" Mac screenshot, descrizione corta (30 chars), descrizione lunga (4000 chars), URL privacy policy, URL marketing, URL supporto, categorie, keywords. Tre giorni di lavoro commerciale, non tecnico.

**TestFlight build scadute.** Ogni build TestFlight scade in 90 giorni. Devi ricordarti di ri-uploadare una nuova build almeno ogni 80 giorni, altrimenti i tester non la vedono più.

**iPhone lite come "stesso progetto" o "app separata".** Tecnicamente puoi fare **un solo bundle** `com.tregobbi.trgb` che su iPhone mostra una UI diversa rispetto a iPad (rilevi `UIDevice.userInterfaceIdiom`). Questo è meglio che avere due app separate: un solo progetto, una sola submission, un solo account, backup condivisi. Nello Scenario B con Capacitor questo è facile.

---

## 7. Stima economica complessiva (tempo + soldi vivi)

**Fase 0 (PWA).** Tempo: 1 settimana mia. Soldi vivi: 0 €.

**Fase 1 (Wrapper Capacitor + feature native minime + TestFlight + App Store).** Tempo: 3-6 settimane mie (realisticamente 2-3 mesi se lavoriamo a sessioni concentrate, tu testi tra una e l'altra). Soldi vivi:
- Apple Developer Program: **99 $/anno** (~90 €)
- Icona + splash professionali: se ce li fai tu con Figma, 0 €. Se li commissioni, 200-500 €.
- Foto/screenshot professionali per App Store: simili, 0 o 200-400 €.
- **Totale prima submission:** 90-900 € una tantum + 90 €/anno.

**Fase 2 (eventuale SwiftUI).** Se mai. Tempo: vedi Scenario D. Soldi vivi: gli stessi più un Mac decente se non ne hai uno aggiornato (Xcode pretende macOS recente).

---

## 8. Domande ancora aperte su cui decidere insieme

Queste sono le cose che non ho potuto decidere da solo e che cambierebbero il piano. Non servono oggi, ma quando si parte andranno chiarite:

La cache offline nella PWA deve tenere quali moduli? Dashboard Sala è ovvio. Ma cosa succede se una cameriera modifica offline una prenotazione e dal Mac in ufficio tu la modifichi contemporaneamente? Serve una strategia di conflitto anche per la sola PWA, oppure acceppamo "offline solo lettura".

Push notifications: le vuoi davvero? Se sì, cosa dovrebbero notificare? Nuova prenotazione, backup fallito, fattura in scadenza, cliente compleanno. Ogni notifica richiede un endpoint backend che la triggera.

La versione iPhone "lite" deve permettere la modifica o solo la lettura? Se sola lettura è molto più semplice (nessun conflitto con desktop). Se scrittura, quali schermate? La mia proposta: Dashboard + Prenotazioni (read+write) + Clienti (read+write) + Chiusure Turno (read+write) + tutto il resto read-only.

Il dominio cambia? Oggi il backend è `app.tregobbi.it`. Se passi ad App Store pubblico, vorrai un dominio neutro tipo `api.trgb.app` o simili per non legare il brand del gestionale al ristorante? Decisione commerciale, non tecnica.

Gestione multi-ristorante / multi-tenant. Oggi TRGB è pensato per una sola osteria. Se lo vendi ad altri su App Store, ogni ristorante vuole i SUOI dati isolati. Questo non è lavoro iPad, è lavoro backend — va fatto PRIMA di pubblicare su App Store o dovrai rifarlo dopo.

---

## 9. Il primo passo concreto, se vuoi partire

Se l'analisi ti convince, la cosa che farei domani mattina è **Fase 0 — PWA**. Concretamente, una giornata di lavoro:

1. Aggiungiamo `frontend/public/manifest.webmanifest` con nome, icona, colori TRGB, display `standalone`
2. Generiamo 10-12 icone (1024, 512, 192, 180, 167, 152, 120, 87, 80, 60, 40, 29) a partire dal logo TRGB che hai già in `frontend/public/`
3. Aggiungiamo meta tag Apple nel `index.html`: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, splash screens per iPad Pro/Air/mini
4. Service worker Workbox che cacha gli asset statici (shell app) per avvio offline veloce
5. Test su iPad reale: "Aggiungi a schermata Home" da Safari, verifica che l'icona sia giusta, l'avvio sia a schermo intero, lo splash sia il tuo

Dopo questa giornata hai già metà del risultato percepito senza aver toccato Apple Developer.

Se vuoi partire, il primo commit suggerito sarebbe:

```
./push.sh "pwa: manifest, icone Apple, splash iPad, service worker base"
```

---

## 10. TL;DR per Marco

- TRGB è grosso (~92k LOC, 11 moduli, 9 DB, 393 endpoint). Riscriverlo nativo completo richiede **8-14 mesi**.
- Per il tuo caso (uso interno + futura App Store), la strada sensata è: **PWA ora → Capacitor tra qualche settimana → eventualmente SwiftUI tra un anno**, non "SwiftUI subito".
- Il backend FastAPI **NON va toccato**. Resta sul VPS, l'app è un client.
- Costo vivo minimo: **99 €/anno Apple Developer** quando passi alla Fase 1.
- Il primo passo concreto è una giornata di lavoro e zero soldi: PWA su iPad per avere già l'icona in home.

Fammi sapere quale scenario ti convince e partiamo dal primo tassello.

---

*Fine analisi. Questo documento può essere aggiornato man mano che decidiamo fasi o cambiamo strategia.*
