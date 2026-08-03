# TRGB — Briefing sessione

**Ultimo aggiornamento:** 2026-08-03 — **DA PUSHARE: docs→wiki, conversione COMPLETATA — header di stato sulle ultime 25 pagine, lint a zero warning (solo docs/, nessun codice)**; **DA PUSHARE: mattone M.J Pubblicazione web (FTP) — bottone "Pubblica sul sito" su menu pranzo e carta vini, sistema 5.39 (richiede le variabili `FTP_*` in `.env` sul VPS, senza quelle il bottone resta disabilitato)**; **DA PUSHARE: Ordini ai fornitori O3–O6 + flag attivo sui distributori — pagina /vini/ordini, invio WhatsApp, migrazioni 158+159+160 (vini 3.77)**; **DA PUSHARE: Intermittenti UNI (comunicazione chiamate dai turni) + mattone M.D email, migrazione 156 — lanciare `npm run build` prima del push**; **DA PUSHARE: La Lavagna** (widget Bacheca sostituito da briefing di servizio in Home + DashboardSala; lanciare `npm run build` prima del push); **DA PUSHARE: verifica docs Blocco 1 — 6 modulo_*.md corretti vs codice (vini, CG, menu carta+pranzo, vendite)**; **PUSHATO: docs→wiki completo (index, convenzioni, 14 pagine, lint in push.sh, log archiviati — v. sessione 2026-07-24)**; **DA PUSHARE: Vista Sommelier v2.0 (vini 3.72, V.22 chiuso)**; e inoltre (dal 19/7): **migrazione 155 self-heal tasks.sqlite3** (il generatore MEP va in 500 finché non parte), **DA PUSHARE: migrazione 155 self-heal tasks.sqlite3** (il generatore MEP va in 500 finché non parte — scoperta perdita template HACCP di aprile, v. TASKS-1 in problemi.md); inoltre restano DA PUSHARE: script rettifica preconti, Vini 3.71, sotto-categorie bevande 3.70, utenze multi-layout (v. sessioni 17-18/7). ⚠️ Nota alle sessioni parallele: changelog/sessione/versions sono stati sovrascritti una volta oggi — rileggere il file da disco PRIMA di scriverci.

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

## SESSIONE 2026-06-30 — BP.1+BP.2+BP.3+BP.4: pagina batch pagamenti

### Contesto
Marco lavora sui batch pagamenti: oggi capita di voler "modificare un batch, togliere una singola uscita che non doveva starci". Non era possibile — l'unica modifica era DELETE dell'intero batch. Inoltre nessuna pagina per gestire i batch dopo la creazione: 8 batch storici rimasti `IN_PAGAMENTO` (totale €59k) da maggio-giugno, mai marcati `INVIATO_CONTABILE` né `CHIUSO` perché manca UI per farlo.

### Decisioni di design (concordate)
- **A** Pagina dedicata (no sotto-vista in Scadenzario): nuovo tab in `ControlloGestioneNav`, route propria, vista lista + dettaglio inline
- **B** PDF: rimandato a BP.5 / Push G2 (M.B `pdf_brand.py`), oggi riuso stampa HTML+Cmd+P esistente
- **C** Cleanup retroattivo 8 batch storici: tramite bottone "Auto-chiudi batch completati" che Marco preme una volta
- **D** Auto-close batch: sì, ma solo on-demand via endpoint POST (non automatico/trigger)
- **E** "Aggiungi uscita a batch esistente": NO, Marco preferisce crearne uno nuovo

### Test su DB locale (snapshot post-push CC.8.c)
Simulazione `auto-close-all` sui 8 batch IN_PAGAMENTO: 7 si chiudono (uscite originali tutte pagate, `pagamento_batch_id` sgangiato), 1 resta aperto (#13 ha 1 uscita PROGRAMMATO ancora collegata).

### Frontend
- `ControlloGestioneBatchPagamenti.jsx`: componente unico con stato interno `selectedId` (null = lista, valorizzato = dettaglio inline). Sub-componenti `BatchList`, `BatchDetail`, `Stat`.
- 3 sotto-tab stato con counter (chiamate parallele a `/pagamenti-batch?stato=X`).
- Dettaglio: header con stat cards + chip status + bottoni transizione (Invia/Chiudi/Auto-chiudi/Elimina), tabella uscite con bottone "✕ Rimuovi" per riga (nascosto se PAGATO o batch CHIUSO).
- Helper `_try_auto_close_batch` consultabile via endpoint POST `/auto-close` singolo (mostra motivo "X/Y uscite pagate" se non chiudibile).

### Cose intenzionalmente NON fatte ora
- BP.5 export PDF brandizzato (Push G2): la stampa HTML esistente in `ControlloGestioneUscite.jsx::apriFinestraStampa` resta utilizzabile dallo Scadenzario; nel dettaglio batch nuovo non l'ho ancora portata (per non duplicare codice — refactor in modulo condiviso da fare quando arriva BP.5).
- "Aggiungi uscita a batch esistente" (E): Marco preferisce crearne uno nuovo.

### File toccati
- `app/routers/controllo_gestione_router.py` (+200 righe — 3 endpoint + helper)
- `frontend/src/pages/controllo-gestione/ControlloGestioneBatchPagamenti.jsx` (nuovo, ~440 righe)
- `frontend/src/pages/controllo-gestione/ControlloGestioneNav.jsx` (+1 voce)
- `frontend/src/App.jsx` (+1 lazy import + 1 route)
- `frontend/src/config/versions.jsx` (controlloGestione 2.17→2.18, sistema 5.29→5.30)
- `VERSION` (5.29 → 5.30)
- `docs/modulo_controllo_gestione.md` (sezione AGGIORNAMENTO 2026-06-30 + bump header)
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-13 notte 2):** **CC.6.fix: hotfix duplicazione + badge conto multi-account** (`[core]`). Carta v1.7 beta, sistema 5.25, flussiCassa 1.16. Marco ha segnalato che dopo unlink di un movimento questo appariva DUPLICATO nella riconciliazione. **Bug**: il LEFT JOIN su `cg_uscite` introdotto in CC.6 moltiplica le righe per ogni uscita CG linkata al movimento (es. mov #1416 = bonifico multi-stipendio paga 6 uscite → 6 righe). **Fix**: sostituito con subquery scalari `(SELECT ... FROM cg_uscite WHERE banca_movimento_id=m.id ORDER BY id LIMIT 1)` per i campi rappresentativi + `COUNT(*)` per `match_uscite_count` + `GROUP_CONCAT(id, ',')` per `match_uscite_ids`. Frontend: chip "🔗 Già su CG #N — fornitore" ora mostra "+M altre" se count > 1. **Punto 3 di Marco**: aggiunto badge "🏦 BPM *2200" su movimenti NON carta (multi-conto ready — quando aggiungerà un secondo CC es. Sella, mostrerà "🏦 SELLA *xxxx"). Badge emerald, accanto a "💳 carta" (ambra) per i carta.

## SESSIONE 2026-06-13 (notte 2) — CC.6.fix: duplicazione + badge conto

### Bug riportato
Screenshot di Marco: mov del 23 mag €-1423,19 appariva 2 volte, una con "🔗 Già su CG #88 — Bugan Farina" e l'altra con "🔗 Già su CG #2330 — Bugan Farina". Aveva fatto unlink di una delle due ma il sistema le mostrava ancora entrambe.

### Diagnosi
Query DB locale: 6 movimenti bancari hanno >1 cg_uscite linkate:
- mov #1416 (6 uscite — stipendi Mohammad+altri €9416)
- mov #1012 (5 uscite — stipendi €4965)
- mov #1077 (2 uscite — G.B. Marenzi + altra)
- mov #1414 (2 uscite — stipendi)
- mov #1023, #1027 (2 uscite ciascuno)

Il LEFT JOIN in CC.6 moltiplicava le righe. Test query VECCHIA su mov #1416 → 6 righe. Test query NUOVA con subquery → 1 riga con count=6.

### Fix backend (`/banca/cross-ref`)
Sostituito LEFT JOIN cg_uscite con subquery scalari:
```sql
SELECT m.*,
       CASE WHEN m.banca LIKE 'CARTA_%' THEN 1 ELSE 0 END AS is_carta,
       (SELECT COUNT(*) FROM cg_uscite u WHERE u.banca_movimento_id = m.id) AS match_uscite_count,
       (SELECT GROUP_CONCAT(u.id, ',') FROM cg_uscite u WHERE u.banca_movimento_id = m.id) AS match_uscite_ids,
       (SELECT u.id FROM cg_uscite u WHERE u.banca_movimento_id = m.id ORDER BY u.id LIMIT 1) AS match_uscita_id,
       (SELECT u.fornitore_nome FROM cg_uscite u WHERE u.banca_movimento_id = m.id ORDER BY u.id LIMIT 1) AS match_uscita_fornitore,
       (SELECT u.totale FROM cg_uscite u WHERE u.banca_movimento_id = m.id ORDER BY u.id LIMIT 1) AS match_uscita_totale
FROM banca_movimenti m
```

### Punto 3 di Marco — badge conto multi-account ready
Aggiunto in `BancaCrossRef.jsx`: accanto al badge "💳 carta" (ambra) sui movimenti carta, ora un badge "🏦 BANCA *ULT4" (emerald) sui movimenti NON carta. Esempio: "🏦 BPM *2200" per il CC Tre Gobbi. Quando un giorno apri Sella, mostrerà "🏦 SELLA *xxxx" automaticamente — il label viene da `m.banca` + ultime 4 di `m.rapporto`. Tooltip completo: "Conto: BPM · 000000012200".

### Chip "Già su CG" esteso per multi-match
Mostra il PRIMO match + "(+M altre)" se count > 1: es. "🔗 Già su CG #2305 — Mohammad Sab Uddin (+5 altre)". Tooltip mostra tutti gli id concatenati.

### Bump versioni
- `VERSION` 5.24 → 5.25
- `cartaCredito` 1.6 → 1.7
- `flussiCassa` 1.15 → 1.16
- `sistema` 5.24 → 5.25

### File toccati in questo push
- `app/routers/banca_router.py` (query /cross-ref con subquery scalari)
- `frontend/src/pages/banca/BancaCrossRef.jsx` (badge conto + chip multi-match)
- `VERSION`
- `frontend/src/config/versions.jsx`
- `docs/modulo_banca.md`
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-13 notte):** **CC.6: fix coerenza CC bancario ↔ pseudo-movimenti carta** (`[core]`). Carta v1.6 beta, sistema 5.24, flussiCassa 1.15. Marco ha notato che i movimenti carta importati dal PDF apparivano nella Riconciliazione (BancaCrossRef): è desiderato per il flusso "categorizza ogni spesa", ma serve coerenza visiva e i saldi CC devono escluderli. **Backend**: 4 endpoint banca ora applicano filtro `banca NOT LIKE 'CARTA_%'` via costanti `EXCLUDE_CARTA_SQL` / `EXCLUDE_CARTA_SQL_NO_ALIAS`: `/banca/movimenti`, `/banca/dashboard` (saldo+breakdown+ultimi via where[] condiviso), `/banca/andamento` (serie temporale), `/banca/duplicati` (tipo 1+2). `/banca/cross-ref` mantiene i movimenti carta (utile per registrare come categoria spesa) ma li annota con `is_carta=1` e `match_uscita_id` (LEFT JOIN cg_uscite per dedup col match A). **Frontend** `BancaCrossRef.jsx`: nuovo toggle sidebar "💳 Mostra movimenti carta" (default ON), badge "💳 carta" prima della descrizione delle righe carta, riga "🔗 Già su CG #N — {fornitore}" emerald sotto la descrizione quando il movimento è già riconciliato via match A (evita doppia registrazione).

## SESSIONE 2026-06-13 (notte) — CC.6: fix coerenza carta vs CC

### Contesto
Post-CC.5.b di 11 giorni fa (2026-06-02), Marco apre `/flussi-cassa/cc/crossref` e vede tra i movimenti CC anche i 127 movimenti dell'estratto carta. Domanda: separarli o lasciarli? Avevo dichiarato nel docstring di mig 140 "vanno esclusi dal saldo CC via WHERE banca NOT LIKE 'CARTA_%'" ma NON avevo applicato il filtro agli endpoint banca esistenti — bug di design originale.

### Decisione presa con Marco
**Lasciarli visibili nella riconciliazione, escluderli dal saldo CC.** Due piani semantici distinti:
- **Riconciliare** (= collegare a fattura o categorizzare spesa) → vale per QUALUNQUE movimento, sia CC che carta. Flusso unico.
- **Saldo CC bancario** → solo movimenti CC veri. Niente pseudo-carta.

### Backend (`app/routers/banca_router.py`)
Aggiunte costanti riusabili:
```python
EXCLUDE_CARTA_SQL = "(m.banca IS NULL OR m.banca NOT LIKE 'CARTA_%')"
EXCLUDE_CARTA_SQL_NO_ALIAS = "(banca IS NULL OR banca NOT LIKE 'CARTA_%')"
```

Applicato a 4 endpoint: `/banca/movimenti` (lista CC), `/banca/dashboard` (saldo + breakdown + ultimi via `where[]` condiviso), `/banca/andamento` (serie temporale), `/banca/duplicati` (tipo 1 classico + tipo 2 preautorizzazioni).

`/banca/cross-ref` esteso: query principale ora include LEFT JOIN su cg_uscite per portare `match_uscita_id`/`match_uscita_fornitore`/`match_uscita_totale` + flag `is_carta` derivato da `banca LIKE 'CARTA_%'`.

### Frontend (`frontend/src/pages/banca/BancaCrossRef.jsx`)
- `mostraCarta: true` aggiunto a `DEFAULT_FILTERS`.
- Nuovo toggle nella sidebar Filters sotto "Tipo link": checkbox "💳 Mostra movimenti carta" con sottotitolo "Spese carta di credito importate dal PDF estratto (non sul CC)".
- Memo `movimentiVisibili` derivato da `movimenti` con filtro `is_carta`/`banca LIKE 'CARTA_'` lato client → propagato a `parcheggiati/linked/unlinked/withSugg/noMatch`.
- Memo `nCartaHidden` per contare i carta nascosti.
- Badge chip ambra `💳 carta` prima della descrizione su righe carta.
- Riga aggiuntiva sotto la descrizione: chip emerald `🔗 Già su CG #N — {fornitore}` se `match_uscita_id` presente → segnala dedup col match A senza nascondere gli altri bottoni (backward-compat).

### Bump versioni
- `VERSION` 5.23 → 5.24
- `cartaCredito` 1.5 → 1.6
- `flussiCassa` 1.14 → 1.15
- `sistema` 5.23 → 5.24

### File toccati in questo push
- `app/routers/banca_router.py` (costanti + 5 endpoint)
- `frontend/src/pages/banca/BancaCrossRef.jsx` (toggle + memo filtro + badge + chip)
- `VERSION`
- `frontend/src/config/versions.jsx`
- `docs/modulo_banca.md`
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-12 sera):** **Sessione 1 piano audit: sicurezza urgente** `[core]` + hardening VPS. Pushato `1e4a8ac9`: auth router-level su `banca_router` e `ipratico_products_router` (erano PUBBLICI, verificato 401 live post-deploy). Sul VPS (manuale, no commit): sshd `PermitRootLogin no` + `PasswordAuthentication no` (servizio = `ssh`, non `sshd`); Portainer ricreato con bind `127.0.0.1:9000/9443` (Docker scavalca ufw, chiudere via firewall NON basta — accesso futuro via `ssh -L 9443:localhost:9443 trgb`); xrdp disabilitato + regole ufw 3389 e 5900 rimosse. Verifica esterna `nc`: 9443/9000/3389/5900 tutte chiuse. Esposti ora solo 22/80/443. **Restano della Sessione 1:** punto 5 (flag TRGB_SPECIFIC su mig 047/048 + SECRET_KEY default) e analisi log nginx per accessi storici a `/banca/*` nel periodo esposto.

## SESSIONE 2026-06-12 (sera) — Sicurezza urgente post-audit `[core]`

- **Fix codice** (commit `1e4a8ac9`): `dependencies=[Depends(get_current_user)]` a livello router su `app/routers/banca_router.py` e `app/routers/ipratico_products_router.py` (pattern già in uso in dashboard/haccp/scelta_*). FE invariato: le pagine usano già `apiFetch` col Bearer token. Verifica live: `GET /banca/movimenti` → **401** ✅ (prima: 200 con 929 movimenti senza token).
- **VPS (manuale):** sshd hardening attivo e verificato (`sshd -T`); Portainer solo localhost (dati nel volume `portainer_data`, intatti); xrdp spento (usato una sola volta, si riattiva via tunnel se serve); porte verificate chiuse dall'esterno con `nc` dal Mac.
- **Chiude:** CRIT A1 (banca), iPratico, sshd, porte esposte — 4 dei 5 punti urgenti del `10_PIANO_AZIONE.md`.

---

**Aggiornamento precedente:** 2026-06-12 — **Audit totale sistema** (`[core]`, solo docs). Audit completo 10 aree (sicurezza, dati, backend, frontend, architettura, infra VPS live, performance, docs delta, readiness prodotto, verifica avversaria) eseguito con 13 subagenti paralleli + verifiche live ssh/curl. Report in `docs/audit-2026-06-12/` (00_EXECUTIVE_SUMMARY → 10_PIANO_AZIONE + 99_VERIFICA_AVVERSARIA). **Voto 63/100 · 110 finding (3 CRIT, 18 HIGH)**. CRIT: modulo Banca SENZA AUTH confermato live (929 movimenti pubblici), mig 047/048 con dati personali non flaggate TRGB_SPECIFIC, SECRET_KEY default per nuove installazioni. Live: backup post-S60-INC1 TUTTI VERDI ✅, ma SSH PermitRootLogin/Password yes e porte 3389/9000/9443 esposte. Health docs 73→72 stabile. Piano in 11 sessioni (~1 sera) in `10_PIANO_AZIONE.md` — Sessione 1 "sicurezza" è effort S e chiude CRIT+2 HIGH. Nessuna modifica a codice/DB. Da pushare.

## SESSIONE 2026-06-12 — Audit totale TRGB v5.24

- **Perimetro:** tutto il sistema (estende l'audit solo-docs del 19/05). Metodo: 9 subagenti di area + verifica live VPS/HTTP dell'orchestratore + subagente avversario indipendente (22 finding ricontrollati, 82% confermati, 1 smentito e rimosso).
- **Output:** `docs/audit-2026-06-12/` — 12 deliverable + 11 report grezzi + AUDIT_STATE.md.
- **Voti area:** sicurezza 48 · dati 72 · backend 74 · frontend 78 · architettura 70 · infra 58 · performance 68 · docs 72 · prodotto 55 → **complessivo 63/100** (pesi in 00_EXECUTIVE_SUMMARY).
- **Da fare subito (Sessione 1 del piano, effort S):** auth su `banca_router` + `ipratico_products_router`, `PermitRootLogin no`+`PasswordAuthentication no`, firewall 3389/9000/9443, flag TRGB_SPECIFIC su mig 047/048 + SECRET_KEY esplicita nel runbook.
- **Conferme positive live:** backend sano (NRestarts=0, VPS allineato 5.24/1f5f9c17), TLS ok fino 29/08, backup cron 4 job attivi con LKG fresco e health "SANO", integrity check 10/10 DB ok.
- Nota: `AUDIT_STATE_FULL.md` nella root è scratch di un tentativo precedente, cancellabile.

---
 Nuovo campo `annulli_resi` sulla chiusura, sottratto da quadratura e contanti fiscali: uno scontrino annullato resta nel totale RT ma non è incassato, generava ammanco fittizio nella quadratura e sovrastima nei versamenti. Mig 146 + chiusure_turno.py + admin_finance.py + ChiusuraTurno/ChiusureTurnoLista. Verificato sul caso reale cena 8/6 (saldo −460 → 0). Da pushare. Vedi sezione sotto.

## SESSIONE 2026-06-09 — Cassa: scontrini annullati/resi (quadratura + versamenti) `[core]`

### Problema (caso cena 8/6/2026, Marco)
Uno scontrino battuto e poi **annullato** resta nel totale fiscale del registratore (Chiusura RT) ma non viene mai incassato. Conseguenze viste sul DB reale:
- **Quadratura fine turno** → ammanco fittizio. Cena 8/6: `saldo = −460,00 €` = esattamente lo scontrino annullato (nota chiusura: "Scontrino annullato 460,00€").
- **Contanti da versare** → sovrastima: `contanti_fiscali = corrispettivi − elettronici` e i corrispettivi includono l'annullato.

### Soluzione (scelta Marco: campo dedicato + fix completo)
Nuovo campo **`annulli_resi`** sulla chiusura, sottratto dal giustificato (quadratura) e dal corrispettivo RT (contanti fiscali/dashboard). Per-turno (non cumulativo): a cena si somma anche l'annulli del pranzo.

### File toccati
- **Migration 146** `146_cassa_annulli_resi.py`: ADD COLUMN `annulli_resi REAL DEFAULT 0` su `shift_closures` + `daily_closures` (admin_finance.sqlite3). Idempotente, apre la sua connessione tenant-aware.
- `app/routers/chiusure_turno.py`: campo in CREATE/self-heal, models Pydantic, INSERT/UPDATE, SELECT, e **quadratura** (`giustificato −= annulli_giorno`, con `pranzo_annulli` a cena).
- `app/routers/admin_finance.py`: `_aggregate_shift_closures_by_date` e `_contanti_fiscali_by_date` + `cash/daily` → corrispettivo RT **netto** degli annulli.
- `frontend/src/pages/admin/ChiusuraTurno.jsx`: input "❌ Annulli / Resi", draft/load/payload/reset, `totaleGiustificato −= annulliGiorno`, chip "− annulli" nel breakdown.
- `frontend/src/pages/admin/ChiusureTurnoLista.jsx`: giustificato giorno + totali periodo al netto degli annulli (saldo già da backend).
- `versions.jsx`: Gestione Vendite 4.5→4.6, Flussi di Cassa 1.13→1.14.

### Verifica (DB copia, replica codice reale)
Con `annulli_resi=460` sulla cena 8/6: **quadratura saldo 0,00** (era −460) e **contanti da versare 460 → 0**. ✅

### Da fare dopo deploy
Marco valorizza `annulli_resi=460` sulla cena 8/6 dal form. Caso confermato da Marco: scontrino battuto → annullato → **rifatturato** e pagato per bonifico. Quindi i 460 in bonifici sono incasso vero (pagamento della fattura), i 460 in `annulli_resi` tolgono lo scontrino fantasma dall'RT, la fattura (in `fatture`) resta. Tassato una volta sola, quadratura 0. Possibile follow-up: scontrino medio in `stats/daily` non sottrae ancora gli annulli (revenue/coperti) — fuori scope, da valutare.

### Aggiunta (stessa sessione) — PDF commercialista: tabella Note
Marco: le note delle chiusure devono comparire nel PDF corrispettivi per il commercialista, dopo i riepiloghi IVA, come tabella (se presenti). `build_corrispettivi_pdf` ora raccoglie `note` (già unite P:/C: da `_merge_shift_and_daily`, incluse giorni chiusi) e appende una `<table>` Data | Nota dopo il Riepilogo IVA, con HTML-escape. Verificato su giugno 2026: compare "C: Scontrino annullato 460,00€" dell'8/6. Corrispettivi 4.6 → 4.7. Fix bug crash form fine turno (hint NumberField passato come stringa → `fmt(undefined)`) + self-heal colonna `daily_closures.annulli_resi`.

---

## SESSIONE 2026-06-08 (cont.) — Pranzo PDF Proposta 2 + idee storia IG

### PDF leggibilità (fatto)
3 proposte mostrate (minuscolo+aria / filetti / gerarchia 2 pesi). Marco sceglie **filetti** (richiama le pagine interne del menu A5). Implementato in pranzo_pdf_service v3.3 + menu_pranzo_pdf.css v2.4. Test builder: 3 categorie con filetti OK.

### Template storia Instagram pranzo — FATTO (Pranzo 1.7)
Brand context confermato: solo grafica/testo (no foto), giornaliera "oggi a pranzo", CTA vieni a trovarci + telefono + indirizzo. Panel marketing: 7 mockup valutati /100, scelta variante **Antracite** (86). Implementata **client-side su canvas** (no dipendenze server): `PranzoStoryCanvas.jsx` disegna 1080×1920 e scarica PNG. Bottone "📱 Storia" in toolbar Pranzo. Recapiti in `pranzo_settings.ig_telefono`/`ig_indirizzo` (soft-migration testata) + campi in PranzoSettingsPanel. Font: Playfair (caricato) + monospace sistema. Marco: "proviamo quella anche se non finisce di piacermi" → da provare sul campo. **Roadmap v2:** variante foto+overlay (food appeal più alto), eventuale 2° template (Hero piatto del giorno, 88/100). Pranzo 1.6 → 1.7.

### File toccati (storia IG)
- `frontend/src/pages/pranzo/PranzoStoryCanvas.jsx` (nuovo)
- `frontend/src/pages/pranzo/PranzoMenu.jsx` (bottone + fetch settings + render modale)
- `frontend/src/pages/ricette/PranzoSettingsPanel.jsx` (campi recapiti)
- `app/repositories/pranzo_repository.py` (colonne ig_telefono/ig_indirizzo + allowed)
- `app/routers/pranzo_router.py` (SettingsUpdate)
- `frontend/src/config/versions.jsx` (pranzo 1.7), changelog, sessione

### Aggiornamento precedente stessa giornata — Ricette 3.33: prezzo corrente robusto (mediana finestra) (`[core]`). Caso Sedano: "prezzo attuale" 8,27 €/kg perché un acquisto occasionale di cuore di sedano Esselunga (retail) scavalcava per DATA il Milesi a 2,60, e quel prezzo entrava nel food cost (`_get_ingredient_unit_cost` usava l'ultimo prezzo). Scelta Marco: **mediana ultimi N giorni** (default 90, configurabile). Mig 145 `foodcost_settings` + `GET/PUT /foodcost/settings`. `prezzo_corrente_ingrediente()` (mediana finestra, fallback ultimo) usata dal food cost ricorsivo. Lista ingredienti + KPI scheda ("Prezzo attuale" → "Prezzo corrente · mediana Ngg") allineati. Pannello "Prezzi & Food Cost" in Impostazioni Cucina (preset 30/60/90/180/365). Verifica DB reale: Sedano food cost 8,27 → 2,60 €/kg. Ricette 3.32 → 3.33. Da pushare.

## SESSIONE 2026-06-08 — Ricette 3.33: prezzo corrente mediana

### Problema (caso Sedano, Marco 2026-06-07)
KPI "prezzo attuale" e food cost usavano l'ULTIMO prezzo in ordine di data. Un acquisto occasionale Esselunga ("cuore di sedano" vaschetta, 8,27 €/kg, prodotto retail diverso) scavalcava il Milesi abituale (2,60 €/kg). Stesso pattern su Carote. `_get_ingredient_unit_cost` (food cost ricorsivo) e la lista ingredienti erano contaminati.

### Soluzione (scelta Marco: mediana 90gg)
- **Mig 145** `foodcost_settings` (id=1): `prezzo_finestra_giorni` 90, `prezzo_strategia` 'mediana'. Self-heal `_ensure_foodcost_settings`.
- **`prezzo_corrente_ingrediente(cur, iid, finestra=None)`** in foodcost_recipes_router: mediana dei `unit_price` con `date(price_date) >= date('now', -Ngg)`; fallback ultimo prezzo se finestra vuota (ingredienti comprati di rado). `_get_ingredient_unit_cost` la richiama.
- **`GET/PUT /foodcost/settings`** (range 1–730). Helper `_foodcost_finestra_giorni` (recipes) + `_foodcost_finestra_giorni_ing` (ingredients).
- Lista ingredienti: una sola query aggregata sui prezzi della finestra → mediana per ingrediente in Python (no N+1). `last_price` ora = prezzo corrente, fallback ultimo.
- FE scheda (v4.2): `prezzoCorrente` = mediana finestra calcolata sui prezzi già caricati (finestra letta da `/foodcost/settings` nel load). KPI "Prezzo attuale" → "Prezzo corrente" + "mediana Ngg" + tooltip. "Medio storico" invariato (media di tutti).
- `FoodcostSettingsPanel.jsx` in RicetteSettings (voce "💶 Prezzi & Food Cost"): preset + campo libero + spiegazione.

### Test
- Mig idempotente (2 run, no crash). Mediana Sedano: ULTIMO 8,27 → 90gg/180gg/365gg tutti 2,60 €/kg (l'outlier nella finestra viene neutralizzato dalla mediana, non serve nemmeno escluderlo). Ricetta 49 usa il sedano → food cost corretto.

### File toccati
- `app/migrations/145_foodcost_settings.py` (nuovo)
- `app/routers/foodcost_recipes_router.py` (helper mediana + settings endpoints + _get_ingredient_unit_cost)
- `app/routers/foodcost_ingredients_router.py` (prezzo corrente in lista + helper finestra)
- `frontend/src/pages/ricette/RicetteIngredientiPrezzi.jsx` (v4.2 KPI + fetch settings)
- `frontend/src/pages/ricette/FoodcostSettingsPanel.jsx` (nuovo)
- `frontend/src/pages/ricette/RicetteSettings.jsx` (voce menu + render)
- `frontend/src/config/versions.jsx` (ricette 3.33)
- `docs/changelog.md`, `docs/modulo_ricette_foodcost.md`, `docs/sessione.md`

### Nota per Marco (bonifica)
Il prezzo corrente si sistema da solo (è una mediana, non serve scollegare il cuore di sedano). Se però "cuore di sedano" per te è un ingrediente DIVERSO dal sedano, scollegalo a mano dalla scheda. La finestra è cambiabile in Impostazioni Cucina · Prezzi & Food Cost.

---

**Aggiornamento precedente (2026-06-07):** **Vini 3.62: fix andamento giacenza — finestra adattiva + calibrazione** (`[core]`). Marco vede la curva "Andamento giacenza" del #1205 (Lugana Montunal) in NEGATIVO (Min −10, Max −7, Oggi 2 bt). Causa: il vino esisteva prima del primo movimento storico (15/03/2026) — le bottiglie iniziali non sono mai apparse come CARICO → replay forward dà drift −12 e curva sotto zero. Due fix in `giacenza_storica_vino()`. (1) **Finestra adattiva**: `days=30` ora è il minimo; se il primo movimento è più vecchio la finestra si estende fino a lì. Per #1205 chart 15/03→07/06 (85gg) invece di solo 30gg. (2) **Calibrazione**: serie shiftata di `−drift` così che l'ultimo punto = QTA_TOTALE. Per #1205 curva 12→2 bt (era −7→−10 nel raw). Badge `🔧 ricalibrata +12` con tooltip. Titolo box ora "📈 Andamento giacenza — dal primo movimento". Versione vini 3.61 → 3.62. Da pushare.

**Aggiornamento precedente:** 2026-06-07 — **Pranzo 1.6: restyle PDF sistema menu A5 + flusso "Entrambi"** (`[mixed]`). Sistema 5.24. Ripresa modulo Pranzo dopo audit (fermo da fine aprile: 4 menu totali, ultimi 2 vuoti, pool di 6 ricette). Cause individuate con Marco: PDF esteticamente incoerente col brand + inserimento piatti troppo rigido. PDF v3.0 "Proposta A — Pagina di sezione" allineato al MENU A5 stagionale (Sabon LT Pro + Courier Prime, verificati dai BaseFont del PDF di studio; fallback Cormorant finché i font non sono in `static/fonts/`). Nuovo `POST /pranzo/promuovi-ricetta/` + bottone "+ pool" sulle righe ad-hoc. Mig 144 default testata ("PRANZO" / "la cucina del mercato"). `docs/modulo_pranzo.md` riscritto da zero (era fermo al v1.0 giornaliero).

## SESSIONE 2026-06-07 — Pranzo 1.6: restyle PDF + flusso piatti

### Audit di apertura (richiesto da Marco)
- Codice solido ma modulo NON usato: 4 menu (ultimo 18/5), i 2 più recenti con 0 righe. Pool fermo a 6 ricette "Pranzo di lavoro".
- Debito schema D2 invariato: colonne legacy v1.0 su `pranzo_menu` (`data` NOT NULL UNIQUE ecc.), `pranzo_piatti` viva, riga sporca `settimana_inizio=2026-04-26` (domenica). **Mig 103 recreate-table resta DEFERITA** — backup pre-DDL quando si farà.
- "Clona settimana" della roadmap era già fatto (bottone "Copia prec.").

### Decisioni di Marco
1. Riferimento estetico = **menu A5 primavera 2026** (file di studio, font embedded: SabonLTPro Roman/Bold, CourierPrime Regular/Bold, Milliard-Light), NON carta vini.
2. Proposta **A "Pagina di sezione"** scelta fra 3 mockup. Formato **A4 verticale**.
3. Flusso piatti: **"Entrambi"** — scrittura libera + promozione riga a ricetta del pool.

### Backend
- `pranzo_repository.promuovi_riga_a_ricetta(nome, categoria)`: dedup case-insensitive su `name`/`menu_name` di ricette attive; se nuova → INSERT recipes scheletro (kind dish, 1 porzione, category_id da mappa inversa antipasto→Antipasto…) + `INSERT OR IGNORE recipe_service_types`. Test su copia DB: nuovo/dedup/esistente-non-taggata/pool/nome-vuoto/integrità → tutti OK.
- `pranzo_router`: `POST /promuovi-ricetta/` con `_check_admin`, 400 su ValueError.
- Mig 144: nuovi default `pranzo_settings` SOLO se ancora uguali ai vecchi (mai personalizzati). Idempotente, testata su copia (run 1 aggiorna, run 2 no-op).
- Default allineati anche in `_ensure_schema` (CREATE TABLE + backfill) per installazioni fresche.

### PDF v3.0 (`[locale:tregobbi]`)
- `menu_pranzo_pdf.css` v2.0: @font-face Sabon/Courier con fallback a catena (`static/fonts/` → `/usr/local/share/fonts/tre_gobbi/` → Cormorant → Times). Titolo 30pt spacing 0.18em, etichette categoria 10.5pt spacing 0.28em, piatti Courier Bold 13pt, business 118mm centrato, footer corsivo. Pagina singola A4 flex (eredita anti-overflow v1.1).
- `pranzo_pdf_service.py` v3.0: `_build_piatti_html` raggruppa per categoria con etichette plurali (LABEL_CATEGORIA, "altro"→"Dal mercato"); `_format_settimana` minuscolo con elisione articolo (dell'8, dell'11); `_format_prezzo` nudo senza € ("15", "14,50"); sottotitolo unico "sottotitolo · settimana…". HTML builder testato (assert su categorie presenti, niente asterischi/OGGI).
- ⚠ **AZIONE MARCO**: caricare in `static/fonts/` → `SabonLTPro-Roman.ttf/woff2`, `SabonLTPro-Bold`, `SabonLTPro-Italic`, `CourierPrime-Regular`, `CourierPrime-Bold` (idealmente anche sul VPS in `/usr/local/share/fonts/tre_gobbi/`). Senza, il PDF esce in Cormorant (leggibile ma non fedele).

### Frontend
- `PranzoMenu.jsx` v3.6: handler `promuoviRiga(i)` (apiFetchSafe POST, aggiorna recipe_id in riga, ricarica pool, toast con esito creata/collegata) + bottone "+ pool" sulle righe ad-hoc con nome non vuoto (hover arancione, title esplicativo).
- Form "⚡ Nuova ricetta veloce" in `PoolPiatti` (richiesta Marco a fine sessione): input nome (submit con Enter) + select categoria + Btn Crea con loading → `creaPlaceholder` nel root (stesso endpoint promuovi-ricetta, ricarica pool, toast "creato nel pool / esisteva già"). Mostrato in fondo alla card pool E nel ramo pool vuoto (dove serve di più). Il form si svuota solo a successo.
- Eliminazione dal pool (v3.7, richiesta Marco): ✕ accanto a ogni chip → confirm → `DELETE /pranzo/pool/{id}/`. Backend `rimuovi_ricetta_dal_pool`: untag SEMPRE; disattiva la ricetta SOLO se placeholder vuoto (0 recipe_items + 0 altri service_types + mai sub_recipe_id + mai in menu_dish_publications). Decisione Marco: opzione "intelligente". NB: le 6 ricette pranzo esistenti (id 43-48) hanno 0 ingredienti → se tolte dal pool verrebbero disattivate; il toast lo dice esplicitamente. Test su copia DB: ricetta con items → solo untag; placeholder → untag+disattiva; id inesistente → 404; doppia rimozione → no-op.

### Versioni e docs
- `VERSION` + `versions.jsx sistema` 5.23 → 5.24; pranzo 1.5 → 1.6 (alpha → beta).
- `docs/modulo_pranzo.md` riscritto v3.0 (schema reale + legacy D2 + capability C-P-001..007).
- `docs/changelog.md` entry 2026-06-07.

### File toccati in questo push
- `static/css/menu_pranzo_pdf.css` (riscritto)
- `app/services/pranzo_pdf_service.py` (riscritto)
- `app/migrations/144_pranzo_settings_restyle.py` (nuovo)
- `app/repositories/pranzo_repository.py` (promuovi_riga_a_ricetta + default settings)
- `app/routers/pranzo_router.py` (endpoint promuovi-ricetta)
- `frontend/src/pages/pranzo/PranzoMenu.jsx` (v3.5)
- `VERSION`, `frontend/src/config/versions.jsx`
- `docs/modulo_pranzo.md` (riscritto), `docs/changelog.md`, `docs/sessione.md`

### Aggiunta fine sessione — Elimina definitiva in Gestione Ricette (ricette 3.31, `[core]`)
Marco: "manca la possibilità di eliminare una ricetta" (in Ricette esisteva solo Disattiva = soft delete via `DELETE /ricette/{id}`).
- Nuovo `DELETE /foodcost/ricette/{id}/hard` in `foodcost_recipes_router.py`: 409 se sub-ricetta altrove (elenca fino a 5 ricette che la usano) o pubblicata su menu carta; altrimenti transazione con DELETE espliciti (recipe_items, recipe_service_types) + scollega `pranzo_menu_righe.recipe_id`/`pranzo_piatti.recipe_id` a NULL (snapshot storico intatto, FK CASCADE non affidabili senza PRAGMA foreign_keys) + DELETE recipes. Rollback su errore.
- FE: `RicetteDettaglio.jsx` bottone "🗑 Elimina" (confirm forte, alert col detail su 409, navigate ad archivio) + `RicetteArchivio.jsx` `batchElimina` nella barra batch (conta eliminate/protette, alert con i primi 3 motivi di blocco).
- Test su copia DB: 409 sub-ricetta ("Fondo al Valcalepio rosso" usata da 5 ricette), 409 pubblicata, delete amatriciana → recipes/items/tags spariti, riga menu pranzo scollegata ma snapshot nome intatto, 404 su id inesistente.
- Correlato: ✕ "intelligente" nel pool pranzo (untag + disattiva se placeholder vuoto) — vedi sopra. I due livelli convivono: pool = togli dal pranzo; Ricette = elimina dal sistema.

### Aggiunta fine sessione 2 — logo PDF + date picker settimana
- **Logo nel PDF** (pdf service v3.1 + css v2.1): Marco non vedeva il logo (Proposta A ne era priva by design, ma lo voleva). Creato `static/img/logo_tregobbi_trim.png` con PIL (bbox crop del 5000×5000 originale → 4719×2154 + 4% padding, NUOVO FILE da committare). `.menu-logo` 56mm centrato, margine 9mm sotto. Fallback al PNG originale se il trim manca.
- **Date picker settimana** (PranzoMenu v3.8): `<input type="date">` dentro il box del label settimana in toolbar; `setSettimana` normalizza già al lunedì ISO. PDF/salva/elimina seguono la settimana selezionata (apriPdf default = state settimana, era già corretto — mancava solo un modo rapido di saltare a settimane future senza cliccare ▶ N volte).

### Aggiunta fine sessione 3 — fix calcolo prezzo ingrediente (ricette 3.32, `[core]`)
Marco: "c'è qualcosa che non quadra nel calcolo prezzo ingrediente" → casi reali: Capperi sott'aceto 12,50 €/g, Sale fino 0,0075 €/g (= 7,5 €/kg), Zucchero oscillazione 0,001–0,0159.

**Tre bug concatenati trovati e fixati:**
1. `_compute_unit_price` (matching router): fallback silenzioso — unità non convertibile → prezzo a collo salvato come €/unità-base. ORA ritorna None (prezzo non salvato) salvo unità == base. Caso Capperi: vasi a 12,50 €/PZ entrati come 12,50 €/g.
2. `convert_qty` (recipes router): check famiglie lasco — `pz` convertiva a peso come 1 pz = 1 kg (entrambi 1.0 in UNIT_TO_BASE). ORA famiglie strette, pz→peso solo via conversione custom.
3. Unità fattura non riconosciute: aggiunti sinonimi GR/HG/LT/LIT + `_norm_unit` (toglie punti, "KG." → kg).

**Caso multipack (Sale fino "KG1 X12", Zucchero "KG1 X10"):** unità dichiarata KG regolare ma prezzo a collo → conversione kg→g formalmente corretta, prezzo 12x. Non rilevabile dall'euristica `collegamentoSospetto` (famiglie uguali). Soluzione UI: fattore ora VISIBILE e correggibile su ogni collegamento (prima "Correggi" appariva solo sui sospetti) + hint ⚠ se descrizione matcha /X\s?\d+|\d+\s?x/i con fattore=1.

**Nuovo endpoint** `POST /matching/ricalcola-prezzi/{id}`: per ogni prezzo con riga_fattura: fattore mapping (≠1) → `_compute_unit_price` (standard+custom) → `_guess_conversion_factor` se safe → altrimenti lasciato e contato in `non_convertibili` (prima versione lo eliminava — cambiato: il delete avrebbe impedito il recovery via "Correggi" che ricalcola da original_price). UI: bottone "↻ Ricalcola prezzi" in tab Prezzi (RicetteIngredientiPrezzi v4.1).

**Reporting**: `collega-multiplo` → `prezzi_saltati` + `unita_da_configurare` nel response, msg FE con istruzioni; `confirm` → detail esplicito se prezzo non importato.

**Dettaglio prezzo in conferma collegamento** (richiesta Marco, v4.1): card articolo nel flusso collegaReview mostra prezzo fattura (range min–max se variabile, ultima riga qty × prezzo = totale, data) + anteprima live `prezzo ÷ fattore = €/unità-base` ricalcolata a ogni digitazione del fattore. I dati erano già nel payload `/pending` (prezzo_unitario, quantita, prezzo_totale, data_fattura), solo non mostrati.

**Conversione "peso del pezzo" per ingredienti a numero** (caso Tuorlo d'uovo, base "n"): Marco chiede una seconda conversione tipo "1 n = 20 g" per definire le cose pesabili. Implementato:
- `_get_custom_conversion`: nuova catena lato DESTINAZIONE (standard prima, custom dopo) — KG→n = std(kg→g)=1000 ÷ custom(n→g)=20 → 50. Copre fatture a peso per ingredienti a numero e ricette dosate in g su ingredienti a numero (e viceversa). pz→n resta non risolvibile automaticamente (corretto: pz è ambiguo) — serve fattore manuale o custom diretta "1 pz = 50 n".
- `_standard_convert` aveva lo STESSO bug famiglie lasco di convert_qty (pz→peso 1:1) e tramite la nuova catena lo propagava: allineato a famiglie strette + sinonimi + _norm_unit.
- FE: "n" nelle opzioni from-unit della tab Conversioni, copy aggiornato con l'esempio tuorli.
- Spiegato a Marco il caso Tuorlo: base "n" perché le ricette contano i tuorli (olandese 4 n, tonnata 2 n); fatture in bottiglie KG.1 → o fattore 50 per collegamento, o conversione "1 n = 20 g" che automatizza tutto.
- **Follow-up 2** (Marco: "in conversioni pretende la conversione a n, dovrei scegliere io che unità dargli"): il fattore di Correggi/Conferma era obbligato in unità base → l'utente doveva fare la divisione a mente (1 conf = 50 n). Ora: selettore unità accanto al campo fattore in entrambi i flussi + endpoint `GET /matching/converti-in-base?ingredient_id&qty&unit` (usa convert_qty con catena standard+custom). FE: `convertiInBase()` + `aggiornaFactorBase()` per anteprima live "= 50 n" e prezzo risultante; risoluzione del fattore al salvataggio con errore parlante se manca la conversione. correggiDraft esteso con `unita_scelta`.
- **Follow-up**: Marco ha cambiato base a "pz" perché "n" mancava dal dropdown Anagrafica → trappola: PZ fattura (collo/bottiglia) == base pz → 1 bottiglia = 1 tuorlo + fattori 1000 legacy sui mapping. Fix: "n" aggiunta a TUTTE le liste unità FE (RicetteIngredientiPrezzi UNITA, IngredientPicker, RicetteImport, RicetteModifica, RicetteNuova, RicetteIngredienti). "n" resta fuori da UNIT_TO_BASE → mai auto-conversione, solo custom/fattore (safe by design). Procedura recovery Tuorlo comunicata: Anagrafica base→n, custom "1 n = 20 g" (eliminare quella su pz), Correggi fattore 50 sui collegamenti KG/conf/PZ.

**Test** (esecuzione diretta delle funzioni via exec, fastapi non disponibile in sandbox): PZ bloccato, KG ok, GR sinonimo, CT+fattore 12000 ok, custom pz=720g ok, unità esotica VS bloccata, g==g passa. JSX bilanciato.

**Bonifica dati esistenti (da fare da UI dopo push):** Capperi → Correggi fattore sui collegamenti PZ (o conversione 1 pz = 720 g) → prezzi si ricalcolano. Sale/Zucchero → Correggi su righe X12/X10 con fattore 12000/10000. Poi "↻ Ricalcola prezzi" su ogni ingrediente per verificare. La diagnosi globale (`claude/diagnosi_prezzi_ingredienti.py`) resta pronta per trovare TUTTI gli ingredienti inquinati appena i DB si sincronizzano col push.

### Prossimi passi modulo Pranzo
1. Font in `static/fonts/` + push + stampa di prova del PDF reale.
2. Mig 103 cleanup schema (sessione dedicata, backup pre-DDL).
3. C.P2 allergeni su PDF, QR pubblico, notifica M.A (roadmap).

---

## SESSIONE 2026-06-02 (notte) — CC.5.b: riepilogo mensile + chiusura sub-modulo carta

### Backend (`/banca/carta/riepilogo`)
- Aggregazione Python (la query SQL ritorna mese/MCC/imp grezzi, l'aggregazione per categoria sta in `_mcc_to_categoria()`).
- Filtri: `carta_id` (join via `rapporto = codice_posizione`), `from`/`to` su `data_contabile`.
- Risposta: `{mesi: [...], categorie: [...]}` con categorie ordinate per totale globale desc (così le colonne più importanti sono a sinistra in tabella).

### Frontend (`CartaRiepilogoPage.jsx`)
- Layout: FlussiCassaNav + filtri card + 4 stat card + bar chart stacked + tabella + legenda chip.
- Bar chart: `<BarChart>` recharts con 1 `<Bar>` per categoria, `stackId="totale"` per stacking, colori coordinati con palette TRGB-02 (emerald alimentari, blue trasporti, violet software, ecc.).
- Tabella: prima colonna sticky (mese), riga finale "Totale" sticky-bottom logico (no CSS sticky perché dentro overflow-x-auto). Ultima colonna "Mov." con conteggi.
- Date default: ultimi 12 mesi dalla data odierna (calcolata client-side al mount).

### File toccati in questo push
- `app/routers/banca_carta_router.py` — sezione CC.5.b: mappa MCC + endpoint
- `frontend/src/pages/banca/CartaRiepilogoPage.jsx` (nuovo)
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — import navigate + bottone "📊 Riepilogo mensile"
- `frontend/src/App.jsx` — lazy import + route `/flussi-cassa/carta/riepilogo`
- `VERSION` 5.22 → 5.23
- `frontend/src/config/versions.jsx` — cartaCredito 1.4 → 1.5, sistema 5.22 → 5.23
- `docs/modulo_banca.md` — CC.5.b → ✅, sub-modulo chiuso
- `docs/sessione.md` (questa entry)

### Sub-modulo carta — riepilogo end-to-end
Tutta la riga CC.* è verde: parser PDF (CC.1) + schema/endpoint (CC.2) + UI base (CC.3) + match A manuale (CC.4 D1) + auto-match bulk (CC.4 D2) + UI soglie (CC.4.e) + match B (CC.5.a) + riepilogo (CC.5.b) + hotfix mig 143. Roadmap futura: tabella categorie MCC editabile (rinviata), affinamento score fornitore (tokenizer), spese amministratore non-fatturate (flag/categoria).

---

**Aggiornamento precedente (2026-06-02 notte, post-CC.5.a):** **Hotfix mig 143: safety net per ALTER ADD COLUMN NOT NULL DEFAULT in SQLite** (`[core]`). Post-deploy CC.5.a, il guardiano L1 ha segnalato `CORRUPT foodcost.db` perché `PRAGMA integrity_check` ha trovato NULL nelle 2 colonne `tolerance_cc_*` aggiunte da mig 142 — in SQLite l'`ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT X` su una tabella con righe preesistenti NON popola il default sulle righe vecchie, lascia NULL e viola il vincolo. Fix manuale sul VPS via `UPDATE ... COALESCE(...)` (idempotente). Mig 143 aggiunta come backfill safety net per qualunque deploy futuro (clienti nuovi, staging). Memoria persistente salvata. Nessun bump versione (hotfix infrastrutturale, niente cambia lato UI). DB integrity ripristinata, sanity check tornerà verde al prossimo health check.

## SESSIONE 2026-06-02 (notte, post-CC.5.a) — Hotfix mig 143

### Cosa è successo
Push CC.5.a → deploy OK → restart backend → mig 142 applicata → `PRAGMA integrity_check` → `NULL value in carta_match_settings.tolerance_cc_importo_eur`. Backend non crashava (il service ha fallback ai DEFAULTS in codice), ma il sanity check di push.sh ha segnalato corruzione.

### Causa esatta
SQLite, su `ALTER TABLE x ADD COLUMN y REAL NOT NULL DEFAULT 0.10` quando la tabella ha già righe, NON popola le righe esistenti col default. Le lascia NULL, violando il NOT NULL. Quirk noto ma facile da dimenticare.

### Fix
1. **Sul VPS (manuale, immediato):** `UPDATE carta_match_settings SET tolerance_cc_importo_eur = COALESCE(...), tolerance_cc_data_days = COALESCE(...) WHERE id = 1`. Restituisce subito `integrity_check = ok`.
2. **Nel codice (safety net):** mig 143 idempotente con COALESCE — no-op sul VPS già fixato, ma copre qualunque altro deploy.
3. **Memoria persistente:** `feedback_sqlite_alter_add_column_not_null.md` (memoria Cowork, non file del repo).

### Lezione per le prossime migrazioni
Mai più `ALTER TABLE ADD COLUMN NOT NULL DEFAULT` su tabella con righe esistenti. Sempre: ADD nullable + UPDATE backfill esplicito.

### File toccati in questo push
- `app/migrations/143_carta_match_settings_backfill.py` (nuovo)
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-02 notte):** **CC.5.a: match livello B (estratto ↔ addebito CC bancario)** (`[core]`). Carta v1.4 beta, sistema 5.22. Mig 142 estende `carta_match_settings` con `tolerance_cc_importo_eur` (default 0.10€) e `tolerance_cc_data_days` (default 3). Service ampliato con `find_candidati_cc` (filtri banca NOT LIKE 'CARTA_%', importo opposto entro tolleranza, data ±tol; score 70% importo + 30% data), `apply_link_cc` (UPDATE `carta_estratti.banca_movimento_id`), `remove_link_cc`. 3 nuovi endpoint `/estratti/{id}/candidati-cc`, POST/DELETE `/estratti/{id}/link-cc`. Frontend: `CercaAddebitoCcModal.jsx`, chip Match B nella riga estratto ora cliccabile per aprire la modale. UI soglie estesa con 2 campi extra (tolleranze CC). Test backend OK su DB sintetico (match esatto, blocchi su mov già usati o su movimenti CARTA). Resta solo **CC.5.b** (riepilogo mensile per categoria/MCC) per chiudere il sub-modulo carta.

## SESSIONE 2026-06-02 (notte) — CC.5.a: match livello B

### Concetto
Ogni estratto carta dichiara `addebito_totale_cc` e `data_valuta_addebito`. Sul CC bancario (banca BPM `000000012200`) c'è UN movimento di uscita che è il bonifico/addebito automatico mensile. Riconciliazione **1:1 esatta**, tolleranze molto strette.

### Decisioni
- Tolleranze CC: **importo 0.10€** (solo arrotondamenti), **data ±3gg** (banca può slittare 1-2 gg di valuta).
- **No auto-match all'upload**: il match B è sempre esplicito (click utente). Più sicuro, evita riconciliazioni silenziose sbagliate.
- Categorizzazione spese: hardcoded in CC.5.b. Tabella editabile in roadmap futura.
- Score: 70% importo + 30% data (no fornitore_score perché la descrizione "ADDEBITO CARTE BPM" non aggiunge segnale).

### File nuovi
- `app/migrations/142_carta_match_settings_cc.py` — ALTER carta_match_settings + 2 colonne
- `frontend/src/components/carta/CercaAddebitoCcModal.jsx` — modale con info estratto sorgente, lista candidate CC, link/unlink

### File modificati
- `app/services/carta_match_service.py` — `DEFAULTS` esteso, 3 nuove funzioni `_fetch_estratto`, `find_candidati_cc`, `apply_link_cc`, `remove_link_cc`
- `app/routers/banca_carta_router.py` — 3 nuovi endpoint match B + 2 nuove valid_keys per PUT /match-settings
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — stato `matchBEstratto`, render `CercaAddebitoCcModal`, chip Match B in riga estratto ora cliccabile (stopPropagation per non espandere) con messaggio diverso linkato/non-linkato
- `frontend/src/pages/banca/BancaImpostazioni.jsx` — sezione "Match livello B" nel tab Soglie con 2 campi (tolerance_cc_importo_eur / _data_days), body PUT esteso, reset defaults esteso
- `VERSION` 5.21 → 5.22
- `frontend/src/config/versions.jsx` — cartaCredito 1.3 → 1.4, sistema 5.21 → 5.22
- `docs/modulo_banca.md` — CC.5.a → ✅
- `docs/sessione.md` (questa entry)

### Test backend (DB sintetico)
- 1 estratto €2958.67 valuta 22/01
- 4 movimenti CC: 1 candidato perfetto (BPM −2958.67 il 22/01), 1 distrattore stesso giorno ma importo lontano (−500), 1 stesso importo ma data lontana (feb), 1 movimento CARTA (escluso da filtro)
- `find_candidati_cc` ritorna SOLO il candidato perfetto con score 1.000 ✓
- `apply_link_cc` salva `banca_movimento_id` ✓
- Tentativo di linkare mov già usato → ValueError bloccante ✓
- Tentativo di linkare un movimento CARTA → ValueError bloccante ("non è un addebito sul CC") ✓
- `remove_link_cc` azzera il link ✓

### Comportamento UI
1. Click sulla chip "🔍 Cerca" nella colonna "Match B (CC)" di un estratto → modale apre
2. Backend cerca candidate, mostra info estratto sorgente + tabella
3. Click "Linka" su una candidata → POST link-cc → chip diventa "✓ CC #N" + toast info
4. Click sulla chip "✓ CC #N" di un estratto già matchato → modale apre in stato "già linkato" con bottone "🔓 Stacca link"
5. Stacca → torna chip "🔍 Cerca"

### Cosa resta per chiudere Carta
**Solo CC.5.b**: riepilogo mensile delle spese carta per categoria (mappa MCC → categoria hardcoded). Backend GET /banca/carta/riepilogo + nuova vista frontend. ~1h di lavoro.

---

**Aggiornamento precedente (2026-06-02 sera):** **CC.4 chiuso: D2 auto-match bulk + .e UI soglie** (`[core]`). Carta v1.3 beta, sistema 5.21. D2: endpoint `POST /banca/carta/estratti/{id}/automatch?dry_run=true|false` + nuova `<AutomatchModal>` con anteprima checkbox (default ≥85%) + bottone "🔗 Auto-match CG (N)" nell'header dettaglio estratto. .e: endpoint `PUT /banca/carta/match-settings` con validazione somma pesi=1.0 + nuovo tab "Soglie match carta" in `BancaImpostazioni` (sidebar) con form 6 campi (tolleranze importo €/giorni, 3 pesi, soglia auto-apply), reset defaults, indicatore live somma pesi. Match A ora **completo end-to-end + configurabile**. Resta solo CC.5 (livello B + riepilogo).

## SESSIONE 2026-06-02 (sera) — CC.4 chiuso: D2 + .e

### D2 — Auto-match bulk
- Backend già pronto da D1 (`automatch_dry_run`, `automatch_apply` nel service). Wrapper endpoint `POST /banca/carta/estratti/{id}/automatch`:
  - `?dry_run=true` (default): ritorna `{preview: [{movimento_id, mov_data, mov_descrizione, mov_importo, uscita_id, uscita_fornitore, uscita_totale, uscita_data_pagamento, score, imp_score, data_score, forn_score, auto_select}, ...]}`
  - `?dry_run=false` + body `{mov_ids: [int]}`: applica solo i match selezionati (re-validation server-side al momento dell'apply per evitare race condition)
- Frontend: `AutomatchModal.jsx` con 4 fasi (loading/preview/applying/done). Default checkbox = `auto_select` (server marca true se score ≥ soglia da settings). Azioni rapide "Tutti / Nessuno / Solo ≥85%". `skipped` non blocca (es. uscita linkata da altrove nel frattempo).
- Bottone "🔗 Auto-match CG (N)" appare nel header `EstrattoDetail` solo se `nNonMatchati > 0`.

### .e — UI soglie matching
- Endpoint `PUT /banca/carta/match-settings` con validazione:
  - `tolerance_importo_eur > 0`
  - `0 <= tolerance_data_days <= 60`
  - `0 <= weight_* <= 1`
  - **Somma `weight_importo + weight_data + weight_fornitore` ≈ 1.0** (tolleranza 0.01). Merge sui valori correnti per validare anche update parziali.
  - `0 <= auto_apply_threshold <= 1`
  - Salva `updated_at` e `updated_by` automaticamente.
- Frontend: nuova sezione `TabCartaMatch` in `BancaImpostazioni` (voce sidebar "💳 Soglie match carta"). Layout:
  - Card "Tolleranze pre-filtro" (importo €, giorni)
  - Card "Pesi del punteggio" con indicatore live somma + chip ✓/⚠
  - Card "Soglia auto-apply"
  - Bottoni: Salva (disabled se !dirty o !pesiOk), Annulla modifiche, Ripristina default
  - Mostra ultima modifica (timestamp + user)

### File nuovi
- `frontend/src/components/carta/AutomatchModal.jsx`

### File modificati
- `app/routers/banca_carta_router.py` — POST `/automatch` + PUT `/match-settings`
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — bottone "🔗 Auto-match CG (N)" + render `AutomatchModal`
- `frontend/src/pages/banca/BancaImpostazioni.jsx` — nuova voce menu "carta-match" + componente `TabCartaMatch` + helper `SettingField`
- `VERSION` 5.19 → 5.21 (skip 5.20 perché D2+e combinato in un push)
- `frontend/src/config/versions.jsx` — cartaCredito 1.1 → 1.3, sistema 5.19 → 5.21
- `docs/modulo_banca.md` — CC.4 D2 + .e → ✅
- `docs/sessione.md` (questa entry)

### Cosa resta
Solo **CC.5** (riconciliazione livello B + riepilogo mensile). Probabilmente 2 sotto-push (match B + riepilogo). Conclude la riga "carta_credito" sulla roadmap.

---

**Aggiornamento precedente (2026-06-02 sera):** **CC.4 D1: match manuale livello A** (`[core]`). Carta v1.1 beta. Mig 141 (`carta_match_settings` singleton con tolleranze 0,50€/10gg + pesi 50/30/20 + soglia auto 0.85). Nuovo service `app/services/carta_match_service.py` con algoritmo scoring (importo+data+fornitore). 4 nuovi endpoint backend (`/movimenti/{id}/candidati`, POST/DELETE `/link`, GET `/match-settings`). Frontend: nuova `<CercaUscitaModal>` + colonna "Match CG" nella sub-tabella dell'estratto espanso con bottone "🔍 Cerca" e bottone "stacca" sui matchati.

## SESSIONE 2026-06-02 (sera) — CC.4 D2: auto-match bulk

### Sintesi
Backend già pronto da D1 (service aveva `automatch_dry_run` e `automatch_apply`). Push D2 ha:
- Aggiunto wrapper endpoint `POST /banca/carta/estratti/{id}/automatch` con flag `dry_run` (default true) + body opzionale `{mov_ids: [int]}` per l'apply selettivo
- Creato nuovo componente frontend `AutomatchModal.jsx` con 4 fasi (loading / preview / applying / done)
- Inserito bottone "🔗 Auto-match CG (N)" nell'header del dettaglio estratto, visibile solo se ci sono movimenti non matchati. Il counter N mostra quanti

### Comportamento UI
1. Click su "🔗 Auto-match CG (N)" → modale apre con `dry_run=true`
2. Backend ritorna lista best-match per ogni movimento non linkato, con score breakdown
3. Modale mostra tabella: checkbox / score chip + breakdown / movimento sorgente / → / uscita CG candidata
4. Default: checkbox spuntate per score ≥ 0.85 (`auto_apply_threshold` di settings)
5. Utente può cambiare selezione (Tutti / Nessuno / Solo ≥85% / manuale)
6. Click "Applica N match" → POST `dry_run=false` con `mov_ids` selezionati
7. Backend richiama `apply_link` per ognuno (re-validation), accumula `applied`/`skipped`
8. Modale phase "done" con riepilogo + dettagli applicati
9. onClose → refresh detail estratto (per aggiornare chip Match CG)

### Decisioni di design
- **Re-validation in apply**: l'`automatch_apply` ricalcola il best candidate corrente al momento dell'apply (non si fida del dry_run server-side). Protegge da race condition se nel frattempo qualcosa è cambiato in CG.
- **Skipped non bloccante**: se un movimento ha ora 0 candidati (es. uscita già linkata da altra azione), viene saltato silenziosamente con motivo, non blocca l'intera operazione.
- **Selezione manuale possibile sotto soglia**: l'utente può sempre spuntare match a basso score se vuole revisionarli e applicarli.
- **Bottone visibile solo se serve**: il chip "🔗 Auto-match" appare solo se `nNonMatchati > 0`. Se l'estratto è completamente riconciliato, il bottone non c'è.

### File nuovi
- `frontend/src/components/carta/AutomatchModal.jsx` (modale anteprima + apply)

### File modificati
- `app/routers/banca_carta_router.py` — nuovo endpoint POST /automatch
- `frontend/src/pages/banca/CartaCreditoPage.jsx` — import + stato `automatchEstrattoId` + render modale + prop `onAutomatch` su EstrattoRow/Detail + bottone in header detail
- `VERSION` 5.19 → 5.20
- `frontend/src/config/versions.jsx` — cartaCredito 1.1 → 1.2, sistema 5.19 → 5.20
- `docs/modulo_banca.md` — CC.4 D2 → ✅
- `docs/sessione.md` (questa entry)

### Cosa manca per chiudere Carta
- **CC.4.e** UI soglie (15 min, form 6 campi in Impostazioni)
- **CC.5** match livello B (estratto ↔ addebito mensile su CC) + riepilogo mensile per categoria/MCC

---

**Aggiornamento precedente (2026-06-02 sera):** **CC.4 D1: match manuale livello A** (`[core]`). Carta v1.1 beta. Mig 141 (`carta_match_settings` singleton con tolleranze 0,50€/10gg + pesi 50/30/20 + soglia auto 0.85). Nuovo service `app/services/carta_match_service.py` con algoritmo scoring (importo+data+fornitore). 4 nuovi endpoint backend (`/movimenti/{id}/candidati`, POST/DELETE `/link`, GET `/match-settings`). Frontend: nuova `<CercaUscitaModal>` + colonna "Match CG" nella sub-tabella dell'estratto espanso con bottone "🔍 Cerca" e bottone "stacca" sui matchati.

## SESSIONE 2026-06-02 (sera) — CC.4 D1: match manuale livello A

### Ricognizione iniziale
45 uscite CG già presenti con `metodo_pagamento='CARTA' AND banca_movimento_id IS NULL AND stato='PAGATO_MANUALE'` — sono quelle dove Marco ha già cliccato "Paga con carta" su Fatture. Match temporale corretto: `mov.data_contabile ↔ uscita.data_pagamento` (non `data_scadenza`). Esempi: ARUBA, Coffee Lab, Il Post, Unieuro.

### Decisioni di design
- **Soglie non hardcoded**: tabella `carta_match_settings` singleton (mig 141) con default in codice + UI in CC.4.e (push successivo). Difesa contro la regola Marco "vietato hardcodare soglie operative".
- **Score**: 50% importo + 30% data + 20% fornitore (substring case-insensitive).
- **Pre-filtri**: |importo| < 0,50€, |giorni| < 10 (più ampi = più rumore; più stretti = match persi).
- **Transizione stato**: link riuscito → `PAGATO_MANUALE → PAGATO`; unlink → torna `PAGATO_MANUALE`.
- **Soglia auto-apply**: 0.85 (sotto si vede ma checkbox non spuntata — sarà rilevante in CC.4 D2).

### File nuovi
- `app/migrations/141_carta_match_settings.py` — singleton (id=1 forced via CHECK).
- `app/services/carta_match_service.py` — `get_match_settings`, `find_candidati`, `apply_link`, `remove_link`, `automatch_dry_run`, `automatch_apply` (già pronto per CC.4 D2).
- `frontend/src/components/carta/CercaUscitaModal.jsx` — modale con info movimento sorgente, ricerca libera per fornitore, lista candidate ordinate per score, chip score color-coded + breakdown imp/data/forn, bottone "Linka" per ciascun candidato.

### File modificati
- `app/routers/banca_carta_router.py`:
  - GET `/banca/carta/movimenti/{id}/candidati?search=&limit=` — wrap su `find_candidati`
  - POST `/banca/carta/movimenti/{id}/link` body `{uscita_id}` — wrap su `apply_link`, 409 su collisioni
  - DELETE `/banca/carta/movimenti/{id}/link` — wrap su `remove_link`, idempotente
  - GET `/banca/carta/match-settings` — espone le settings correnti
  - GET `/banca/carta/estratti/{id}` esteso con LEFT JOIN su `cg_uscite` per esporre `match_uscita_id`/`match_uscita_fornitore`/`match_uscita_totale`
  - DELETE `/banca/carta/estratti/{id}` con check anche su `cg_uscite.banca_movimento_id` (oltre a `banca_fatture_link`)
- `frontend/src/pages/banca/CartaCreditoPage.jsx`:
  - Stato `cercaUscita: {movimento, estrattoId} | null`
  - Funzioni `refreshAfterMatch(estrattoId)` e `unlinkMovimento(movId, estrattoId)`
  - `EstrattoDetail` esteso con colonna "Match CG (livello A)": chip verde `✓ #N {fornitore}` + bottone "stacca" sui matchati; bottone `🔍 Cerca` sui non matchati
  - `loadDetail` accetta `force=true` per invalidare la cache dopo match/unlink

### Test (DB sintetico)
- Mig 140 + 141 idempotenti ✓
- 3 candidati ESSELUNGA/ARUBA/IL POST trovati con score 1.0/0.97/1.0 ✓
- `apply_link` cambia stato a PAGATO, setta `banca_movimento_id`, `importo_pagato`, popola `data_pagamento` se NULL ✓
- `remove_link` torna a PAGATO_MANUALE, azzera `banca_movimento_id` ✓
- `automatch_dry_run` esclude FORNITORE INESISTENTE (score 0) ✓
- `automatch_apply` linka 3/3, nessuno skipped ✓

### Bump versioni
- `VERSION` 5.18 → 5.19
- `cartaCredito` 1.0 beta → 1.1 beta
- `sistema` 5.18 → 5.19

### File toccati in questo push
- `app/migrations/141_carta_match_settings.py` (nuovo)
- `app/services/carta_match_service.py` (nuovo)
- `app/routers/banca_carta_router.py`
- `frontend/src/components/carta/CercaUscitaModal.jsx` (nuovo)
- `frontend/src/pages/banca/CartaCreditoPage.jsx`
- `frontend/src/config/versions.jsx`
- `VERSION`
- `docs/modulo_banca.md`
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-02 pomeriggio):** **CC.3: UI Carta di Credito vera** (`[core]`). `CartaCreditoPage.jsx` da scheletro v0.1 a v1.0: anagrafica carta (multi-carta ready via dropdown), drop-zone upload PDF con feedback specifico per 422/409, lista estratti con riga espandibile, sub-tabella movimenti dentro l'estratto espanso con badge USD per i movimenti esteri, delete estratto. Promosso a `cartaCredito v1.0 beta`. Sistema 5.17→5.18. Manca solo la riconciliazione (CC.4 livello A, CC.5 livello B + riepilogo mensile).

## SESSIONE 2026-06-02 — CC.3: UI Carta di Credito vera

### Sintesi
Mockup HTML statico costruito e validato con Marco (`claude/cc3_mockup_carta_credito.html`). Layout approvato: anagrafica in alto, drop-zone sotto, lista estratti con riga espandibile che mostra dettaglio movimenti inline. Nessuna tab separata. Nessuna logica di riconciliazione in CC.3 (rinviata a CC.4/CC.5) — la UI mostra solo READ-ONLY lo stato match A/B di ogni movimento/estratto.

### File modificati
- **`frontend/src/pages/banca/CartaCreditoPage.jsx`** (riscritto, ~450 righe). Componenti interni: `DropZone`, `Stat`, `LegendItem`, `EstrattoRow`, `EstrattoDetail`. Stati: `carte`, `cartaCorrenteId`, `estratti`, `expandedId`, `details` (cache lazy per estratto), `uploading`, `dragOver`, `error`, `info`. Endpoint chiamati: GET `/banca/carta/carte`, GET `/banca/carta/estratti?carta_id=`, GET `/banca/carta/estratti/{id}`, POST `/banca/carta/upload`, DELETE `/banca/carta/estratti/{id}`.
- **Feedback errori specifici:**
  - 409 (dup PDF) → "Questo PDF è già stato importato (estratto #N). Per ri-importare, elimina prima l'estratto esistente."
  - 422 (non quadra) → mostra delta_quadratura + delta_addebito + warnings parser.
  - Default → `json.detail` o `Errore HTTP {status}`.
- **Drag&drop nativo**: `onDragOver` / `onDragLeave` / `onDrop`. Visual feedback con bordo blu + bg blu quando `dragOver`. Alternativa "Scegli file" via input nascosto + ref.
- **Multi-carta**: se >1 carta, la riga anagrafica diventa `<select>` con la lista; se =1 mostra il nickname statico. PK funzionale `codice_posizione`.
- **Match A/B**: in CC.3 sono **read-only**. Match A non viene mostrato sui singoli movimenti (richiede una JOIN su cg_uscite cross-DB che non c'è nell'endpoint attuale → arriverà in CC.4 con worklist dedicata). Match B mostrato sulla riga estratto come chip success/warning.
- **Lazy load movimenti**: i movimenti vengono caricati solo all'espansione (`GET /estratti/{id}`), cached in `details[id]` per evitare re-fetch a click successivi.

### Bump versioni
- `VERSION` 5.17 → 5.18
- `cartaCredito` 0.2 alpha → **1.0 beta** (UI completa, manca solo riconciliazione)
- `sistema` 5.17 → 5.18

### Cose volutamente NON in CC.3
- Auto-match livello A (movimento carta ↔ uscita CG con `metodo='CARTA' AND banca_movimento_id IS NULL`) → **CC.4**.
- UI di matching manuale singolo movimento ("Cerca uscita") → **CC.4**.
- Match B (estratto ↔ addebito CC mensile) automatico/manuale → **CC.5**.
- Riepilogo mensile per categoria + confronto budget → **CC.5**.
- Filtri / ricerca movimenti / paginazione (se servirà con >100 mov/estratto) → da valutare.

### File toccati in questo push
- `frontend/src/pages/banca/CartaCreditoPage.jsx`
- `frontend/src/config/versions.jsx`
- `VERSION`
- `docs/modulo_banca.md` (CC.3 → ✅ FATTO)
- `docs/sessione.md` (questa entry)

---

**Aggiornamento precedente (2026-06-02 mattina):** **CC.1+CC.2: backend Carta di Credito in produzione** (`[core]`). Parser PDF Banco BPM (`app/services/carta_pdf_parser.py`), migration 140 (carte_credito, carta_estratti, +8 colonne carta su banca_movimenti), router `app/routers/banca_carta_router.py` con upload PDF + lista carte/estratti/movimenti. Validato sui 5 estratti gen→mag 2026 (127 movimenti, quadratura ai centesimi). Sistema 5.16→5.17, nuovo modulo `cartaCredito v0.2 alpha`. Anche fixato `backup_router.py` (entrato dentro commit ricette di sessione parallela). UI ancora scheletro v0.1 — CC.3 ne farà uno vero.

## SESSIONE 2026-06-02 — CC.1+CC.2: backend Carta di Credito

### Contesto
Marco vuole riconciliare l'estratto carta di credito Banco BPM (carta corporate Tre Gobbi *623, codice posizione 9000856980) con le uscite del Controllo di Gestione. Decisioni architetturali concordate prima di scrivere codice:

1. **Storage riuso vs nuovo:** riuso `banca_movimenti` con `banca='CARTA_<EMITT>_<ULT3>'` (es. `CARTA_BPM_623`) ed esclusione dal saldo CC via `WHERE banca NOT LIKE 'CARTA_%'`. Scartata nuova tabella `carta_movimenti` per non duplicare parser/dedup/categorizzazione/UI.
2. **Multi-carta day-1:** anagrafica `carte_credito` con PK funzionale `codice_posizione`. Oggi 1 sola carta, predisposto per N.
3. **Doppio livello di riconciliazione:**
   - **Livello A** — movimento singolo carta ↔ uscita CG con `metodo_pagamento='CARTA' AND banca_movimento_id IS NULL`. CC.4.
   - **Livello B** — estratto mensile ↔ addebito unico sul CC bancario (`carta_estratti.banca_movimento_id`). CC.5.

### CC.1 — Parser PDF (`app/services/carta_pdf_parser.py`, 492 righe)
Banco BPM produce PDF testuale 4 pagine. Estrazione via `pdftotext -layout` + regex. Header layout colonnare a 3 colonne con barcode/junk frapposto → helper `_find_value_after_label(label, value_re, max_chars, same_line=False)`. Default `same_line=False` salta la riga della label e cerca dalla riga successiva (necessario perché la colonna del valore della label X coincide con la riga della label Y+1).

Regex chiave:
- **Riga normale:** `^\s*(\d{23})\s+(\d{8})\s+(GG/MM/AAAA)\s+(GG/MM/AAAA)\s+(.+?)\s+(IMPORTO)\s*$`
- **Riga estera:** stessa + `(IMP_ESTERO)\s+([A-Z]{3})\s+(CAMBIO 5 decimali)\s+(IMP_EUR)`
- **Riga MAGG:** `MAGG\.\s+CIRCUITO\s+€\s+(X,XX)\s+MAGG\.\s+CAMBIO\s+€\s+(Y,YY)` (riga successiva all'estera)

Validazione: 2 equazioni di chiusura (somma_movimenti == totale_movimenti; addebito_cc == totale_mov + bollo + spese + residuo_prec − addebitato_prec).

**Sanity 5 PDF (gen→mag 2026):** 35+19+20+31+22 = 127 movimenti, **tutti i delta a 0.00**. Codici riferimento 23-cifre: 127 unici (dedup naturale perfetto).

### CC.2 — Schema + endpoint (mig 140 + `banca_carta_router.py`, 442 righe)

**Mig 140** crea:
- `carte_credito` (id, nickname, emittente, `codice_posizione UNIQUE`, carta_numero_mask, ultime_visibili, intestatario, titolare, codice_titolare, cc_addebito, abi, cab, piva, limite_utilizzo, `banca_tag UNIQUE`, attiva, ...)
- `carta_estratti` (id, carta_id FK, data_chiusura, data_valuta_addebito, debito_residuo_precedente, totale_addebitato_precedente, totale_movimenti, imposta_bollo, spese_invio, addebito_totale_cc, banca_movimento_id FK NULL (match B), pdf_filename, `pdf_sha256 UNIQUE` (dedup re-upload), n_movimenti, quadra, warnings JSON, imported_at)
- ALTER `banca_movimenti` ADD: `carta_codice_riferimento` (+ UNIQUE INDEX WHERE NOT NULL), `carta_mcc`, `carta_estratto_id`, `valuta_estera`, `importo_estero`, `cambio_valuta`, `magg_circuito`, `magg_cambio`. Tutte idempotenti via PRAGMA table_info.

**Endpoint `/banca/carta/*`:**
- `POST /upload` — riceve PDF, parse, find_or_create_carta, insert estratto + movimenti (dedup su codice_riferimento). Rifiuta con 422 se non quadra (delta > 0.02€). Rifiuta con 409 se `pdf_sha256` già visto. Movimenti inseriti con `importo` NEGATIVO (è uscita), `banca=banca_tag` della carta, `rapporto=codice_posizione`, `hashtag=mcc[:4]`.
- `GET /carte` — lista carte con conteggio estratti/movimenti per carta.
- `GET /carte/{id}` — dettaglio.
- `GET /estratti?carta_id=` — lista estratti.
- `GET /estratti/{id}` — dettaglio + movimenti.
- `DELETE /estratti/{id}` — rollback (bloccato se ci sono `banca_fatture_link` attivi).

Registrato in `main.py` come `banca_carta_router` accanto a `banca_router`.

### Anomalia tracciabilità (memo per il futuro)
Commit `cd9f49ba` ha messaggio "fix backup_router.py" ma il payload reale è CC.2 backend (4 file nuovi). Causa: il working tree era già dirty con CC.2 quando Marco ha lanciato push.sh col messaggio del fix backup → `git add -A` ha incluso tutto. Il fix backup vero (1 file) è invece entrato dentro `26d4fb10` (commit ricette di sessione parallela). Nessun problema funzionale, solo tracciabilità: `git blame` sui file CC.2 punterà al commit sbagliato. Lezione: prima di dare il messaggio di un push spezzato, verificare che il working tree contenga SOLO i file di quell'argomento.

### Push successivi previsti
- Questo (Push B): bump versioni + docs CC.2 (chiude pulito il commit precedente).
- Push C: CC.3 UI vera (`CartaCreditoPage.jsx` da scheletro v0.1 a v1.0).
- Push D: CC.4 riconciliazione livello A.
- Push E: CC.5 riconciliazione livello B + riepilogo mensile.

### File toccati in questo push
- `VERSION` 5.16 → 5.17
- `frontend/src/config/versions.jsx` — nuovo `cartaCredito v0.2 alpha`, `sistema` 5.16 → 5.17
- `docs/modulo_banca.md` — nuova sezione "11.1 Sub-modulo Carta di Credito"
- `docs/sessione.md` — questa entry

---

**Penultimo aggiornamento:** 2026-05-30 — **Vini 3.61: STATO_RIORDINO si azzera in automatico all'arrivo dello stock** (`[core]`). Auto-reset di `STATO_RIORDINO='0'` (Ordinato) in `registra_movimento` (CARICO sempre + RETTIFICA delta>0) e in `conferma_arrivo_ordine_pending`. Ogni transizione è loggata come MODIFICA con utente/origine. `duplicate_vino` accetta ora `utente` e logga lo stato iniziale. Migration 139 cleanup one-shot dei vini orfani (`STATO_RIORDINO='0'` senza pending). Da pushare.

## SESSIONE 2026-05-30 — Vini 3.61: STATO_RIORDINO auto-reset all'arrivo stock

### Sintesi
Marco ha segnalato che il widget "vini senza giacenza" della Dashboard Vini non mostrava il vino ID 1239 (Pinot Nero Alto Adige Sogegross, giacenza 0). Diagnosi: il widget esclude per design `STATO_RIORDINO='0'` (Ordinato), ma né i CARICO né la conferma arrivo ordine pending azzeravano mai questo stato — quindi i vini ordinati→arrivati→rivenduti restavano marcati Ordinato per sempre. Marco ha chiesto di gestirlo per bene + di tracciare in archivio chi/quando/perché.

### Implementazione
- **`registra_movimento`**: aggiunto `STATO_RIORDINO` alla SELECT iniziale; dopo le UPDATE delle qta, se `sr='0'` AND (`tipo='CARICO'` OR (`tipo='RETTIFICA'` AND `delta>0`)) → UPDATE STATO_RIORDINO=NULL + INSERT movimento `MODIFICA` con `origine='AUTO-CARICO' | 'AUTO-RETTIFICA'` e `utente` corrente.
- **`conferma_arrivo_ordine_pending`**: stesso reset dentro la transazione atomica (tra l'INSERT CARICO e il DELETE pending), `origine='ORDINE_ARRIVO'`.
- **`duplicate_vino`**: accetta ora `utente` (default `"system"`). Dopo l'INSERT, se la copia ha `STATO_RIORDINO` valorizzato, log `MODIFICA` con `origine='DUPLICATE-NUOVA-ANNATA'`. `duplicate_vino_endpoint` e `bulk_duplicate_vini` aggiornati per passarlo.
- **Migration 139** `139_reset_stato_riordino_orfani.py`: cleanup one-shot opzione B confermata da Marco — reset `'0' → NULL` per i vini SENZA riga in `vini_ordini_pending`. Ogni reset loggato come `MODIFICA` con `origine='MIG-139-CLEANUP'`. Backup file `.pre-mig139-<ts>`. Idempotente. Sandbox: 14 candidati locale.

### Verifica
`PY_OK` su `vini_magazzino_db.py`, `vini_magazzino_router.py`, `139_reset_stato_riordino_orfani.py`. esbuild OK su `versions.jsx`. Dry-run mig 139 conferma 14 candidati in locale, query funzionante. Versione vini 3.60 → **3.61**.

### Commit suggerito
`./push.sh "[core] vini 3.61 — STATO_RIORDINO auto-reset su CARICO/RETTIFICA+ e su conferma arrivo ordine; log MODIFICA per ogni transizione (utente/origine); duplicate_vino con utente; mig 139 cleanup orfani"`

---

## SESSIONE 2026-05-24 — Ricette 3.30: scheda ingrediente ridisegnata a tab

### Sintesi
Marco vuole iniziare a usare davvero il modulo Ricette/Food Cost. Dopo aver migliorato matching e lista ingredienti nelle sessioni precedenti, la pagina di **dettaglio ingrediente** era ancora una pagina a scorrimento unico, fuori dallo stile del sistema. Dopo un giro di mockup approvati da Marco, la pagina è stata ricomposta in stile TRGB sul modello della scheda vino.

### Implementazione
- **Backend** — `foodcost_recipes_router.py`: nuovo endpoint `GET /foodcost/ricette/per-ingrediente/{ingredient_id}` → elenca le ricette che usano un ingrediente con qty impiegata, costo riga e incidenza % sul food cost (riusa `_calc_item_cost`/`_calc_recipe_cost`). Modello `RicettaPerIngredienteOut`. Registrato prima di `/ricette/{recipe_id}` (comunque path a 2 segmenti, nessun conflitto).
- **Frontend** — `RicetteIngredientiPrezzi.jsx` riscritto (v4.0): testa con badge categoria/stato + nome + 4 KPI, tab bar a 5 linguette (`border-b-2 border-brand-red` sull'attiva, come la scheda vino).
  - **Prezzi**: grafico Recharts andamento prezzo (media mensile per fornitore), storico, form "aggiungi prezzo" a comparsa.
  - **Collegamenti**: collegamenti fattura raggruppati per fornitore; sospetti in ambra con "Correggi" inline; ricerca/collega righe.
  - **Conversioni**: come prima, ora in tab dedicata.
  - **Ricette**: nuova — incidenza % colorata per soglia, riga → scheda ricetta.
  - **Anagrafica**: vista dati + form di modifica completo; per i placeholder "Completa ingrediente".
- `versions.jsx`: ricette `3.29 → 3.30`.

### Anche — fix flag conversione sospetta + lista ingredienti (stesso push)
- Marco ha segnalato che dopo «Correggi» la conversione "non cambia": il collegamento restava giallo. Diagnosi: `collegamentoSospetto` (e il flag `conversione_da_verificare` nella lista) guardavano solo la famiglia dell'unità (PZ vs g), mai il fattore. Risultato: una riga PZ→g restava "sospetta" anche dopo aver impostato un fattore corretto. Il ricalcolo del prezzo in `correggi-conversione` era invece corretto (formula `original_price / fattore`, coerente con `_compute_unit_price`). Fix: il flag ora è sospetto solo se famiglia diversa **e** fattore assente/=1; appena si corregge (fattore ≠ 1) torna verde. Toccati `collegamentoSospetto` (FE) e `list_ingredients` (BE). Messaggio post-correzione arricchito col nuovo prezzo.
- **Lista ingredienti** `RicetteIngredienti.jsx` riscritta v4.0 sul modello Cantina vini (Marco: "la lavorerei più simile alla cantina, filtri a sinistra e sopra"): chip categorie in cima con conteggi, sidebar filtri a sinistra (ricerca, unità base, "da sistemare", disattivati), tabella ordinabile via hook condiviso `useSortableTable`.

### Note / aperto
- Resta da capire se, con tutti i collegamenti PZ corretti, i KPI «prezzo attuale / medio» dell'ingrediente Capperi tornano sensati. Il ricalcolo è corretto: il medio era sballato perché inquinato da più collegamenti PZ non ancora corretti (correggerne uno non basta).

## SESSIONE 2026-05-21 — Vini 3.60: permessi catalogo aperti al sommelier

### Sintesi
Marco, testando il modulo Vini come **sommelier**, ha segnalato che non gli era permesso modificare un vino madre. Diagnosi: l'endpoint `PATCH /vini/anagrafiche/madre/{id}` (e tutta la scrittura del catalogo) era gatato a `_require_admin` (solo admin/superadmin). Emersa anche un'incoerenza: `PATCH /vini/magazzino/{id}` (scheda bottiglia) **non aveva alcun check** → anche `viewer` poteva scrivere. La doc `modulo_vini.md §11` prevedeva già il sommelier per il CRUD: era un drift doc/codice.

Decisione di Marco: **opzione 3** — l'intero catalogo vini è gestito da sommelier + admin; `sala` solo lettura, niente modifica.

### Implementazione
- **`auth_service.py`** — nuovo helper `is_vini_manager(role)` → `admin | superadmin | sommelier`.
- **`vini_anagrafiche_router.py`** — nuovo `_require_vini_manager`. 17 endpoint catalogo (CRUD produttori/fornitori/denominazioni/vitigni/madre/bottiglia + promote-composto) → `_require_vini_manager`. Restano `_require_admin` le 8 operazioni distruttive di massa: merge ×3, migrate-from-legacy, denominazioni/sync, sync-all, rollback.
- **`vini_magazzino_router.py`** — `update_vino_magazzino`, `create_vino_magazzino`, `duplica` → check `is_vini_manager`. `delete-vino` da admin-only a `is_vini_manager`. Bulk-update/bulk-duplicate restano admin-only.
- **Frontend** — `SchedaVino.jsx`: `roReadOnly` derivato dal ruolo, nasconde Modifica anagrafica/giacenze, toggle mescita, Duplica, Elimina ai non-manager. `MagazzinoSubMenu.jsx` + `DashboardVini.jsx`: voce "Nuovo vino" nascosta a `sala`/`viewer`.

### Note
- I **movimenti** (registra/elimina carico-scarico-vendita) restano accessibili a `sala`: azioni operative di servizio, non gestione catalogo. Invariati di proposito.

### Anche — creazione madre senza denominazione (stesso push)
Marco ha segnalato che il wizard "Nuovo Vino" obbligava a scegliere una denominazione, ma ci sono vini che non ne hanno (vino da tavola, IGT generici). Corretta la validazione `confirmNewMadre` in `NuovoVinoV2.jsx`: ora serve **denominazione _oppure_ nome etichetta** (anchor per la descrizione composta), non più la denominazione obbligatoria. Campo rietichettato "Denominazione (opzionale)". Backend già OK (`MadreBase.denominazione_id` Optional). Allineato anche il messaggio d'errore del box "promuovi madre legacy".

### Anche — bottiglia senza annata (stesso push)
Marco: "nel figlio potrebbe non esserci annata". Discusso il modello: un vino senza annata = **1 madre + 1 bottiglia con annata vuota** (modello A, confermato da Marco). La giacenza resta sulla bottiglia, nessuna modifica al modello dati — il vincolo era solo una validazione artificiale. Annata resa opzionale su 3 livelli: `canAdvance` step 3 in `NuovoVinoV2.jsx` (blocca solo su anno invalido futuro/<1900), `BottigliaCreate.ANNATA` da `Field(..., min_length=1)` a `Optional[str]`, `create_bottiglia()` (rimosso `raise ValueError`). La colonna `vini_bottiglie.ANNATA` era già nullable (7 bottiglie senza annata già esistenti nel DB). FieldLabel "Annata (opzionale)", preview mostra "senza annata".

### Anche — modifica del vino madre dalla Cantina (stesso push)
Marco: "ho bisogno di modificare la madre anche dalla cantina, ora si può solo dalla creazione del vino". La scheda madre in Cantina (`SchedaMadreV2`, vista raggruppata) era read-only. Aggiunto bottone **✎ Modifica** gated `is_vini_manager`. Per riuso senza import circolare, `MadreEditModal` + helper `Field` **estratti** da `AnagraficheVini.jsx` nel nuovo file `frontend/src/components/vini/MadreEditModal.jsx` (importato da Anagrafiche e da SchedaMadreV2). Il modale ora fa self-fetch del madre completo via `GET /madre/{id}` (necessario perché da `groupByMadre` il madre arriva senza FK). Al salvataggio `CantinaV2` rifà `fetchData()`.

### Anche — controllo annata duplicata nel wizard (stesso push)
Marco: "se scelgo un madre e creo un figlio con la stessa annata di uno esistente deve dirmelo (idem se lascio vuoto)". `submitWizard` ora, se il madre è esistente, fa `GET /madre/{id}/bottiglie` e se trova un'annata già presente (vuota inclusa) mostra un `confirm` con i dati della bottiglia esistente. Stesso anno + formato diverso è legittimo → avviso, non blocco. Check non bloccante su errore di rete.

### Anche — andamento giacenza giorno-per-giorno nella scheda vino (stesso push)
Marco: "riesci a ricostruire le giacenze di un determinato vino giorno per giorno? e mettere nella sua anagrafica?". Risposta: sì, replay forward di `vini_magazzino_movimenti` (`CARICO +`, `SCARICO/VENDITA −`, `RETTIFICA :=` assoluto, `MODIFICA` no-op). Backend: nuova `giacenza_storica_vino(vino_id, days=30)` in `vini_magazzino_db.py` + endpoint `GET /vini/magazzino/{id}/giacenza-storica?days=30`. Frontend: box "📈 Andamento giacenza — ultimi 30 giorni" nella tab **Giacenze** della scheda vino (dove ha chiesto Marco — non una nuova tab). Grafico recharts line `stepAfter` brand-blue + KPI Min/Max/Oggi + data primo movimento. Badge "dati parziali" se la finestra precede il primo movimento, badge "⚠ drift N" se la giacenza ricostruita diverge da `QTA_TOTALE` (= modifica diretta che ha bypassato i movimenti). Refresh automatico al salvataggio di movimenti/giacenze/modifica-data. Sulla SchedaMadreV2 (sommatoria annate) Marco ha detto "sarebbe bello" — rimandato a un secondo push.

### Fix regressione — toggle mescita calici tornato accessibile a sala (stesso push)
Marco: "il widget dei calici non permette a quelli di sala di cancellare le bottiglie aperte". Causa: gatando `PATCH /vini/magazzino/{id}` a `is_vini_manager` ho gatato anche il toggle "bottiglia in mescita" che passava da lì. Marco ha chiesto la **mappa completa dei permessi del modulo** (vedi `modulo_vini.md` §11, ora dettagliata con colonna enforcement) e ha confermato **opzione 1**: endpoint dedicato. Creato `PATCH /vini/magazzino/{id}/bottiglia-aperta` (gate `is_vini_manager OR sala`), accetta solo i campi del servizio al calice (`BOTTIGLIA_APERTA`, `VENDITA_CALICE`, `PREZZO_CALICE`, `PREZZO_CALICE_MANUALE`, `NOTE`). `PATCH /{id}` resta `is_vini_manager`. Migrati i 4 call site (`CaliciDisponibiliCard`, `CartaVini`, `ViniVendite.patchAttivaCalice`, `SchedaVino.toggleBottigliaAperta` con nuovo `canCalici`).
**Rimaste aperte 2 domande a Marco** (gruppo E permessi): se gatare gli endpoint vini oggi senza alcun controllo ruolo (settings, `matrice/assegna|rimuovi`, ordine-pending, note — chiunque loggato può usarli, viewer compreso) e se limitare `POST /{id}/movimenti`. Da decidere.

### Verifica
`PY_OK` sui file backend. Per il frontend la verifica vite locale ora fallisce per node_modules con sole binarie macOS (nessun `@rollup/rollup-linux-arm64-gnu` / `@esbuild/linux-arm64` in node_modules — Marco ha reinstallato sul Mac, le ottimizzazioni opzionali platform-specific non sono presenti per Linux). Sostituito con **@babel/parser → OK** sul file modificato (`SchedaVino.jsx`), la build reale girerà su push.sh sulla macchina di Marco. Versione vini 3.59 → 3.60.

### Commit suggerito
`./push.sh "[core] vini 3.60 — permessi catalogo al sommelier + denominazione/annata opzionali + modifica madre dalla Cantina + controllo annata duplicata + endpoint dedicato toggle calici + andamento giacenza 30gg nella scheda vino"`

---

## SESSIONE 2026-05-21 — Export PDF corrispettivi per il commercialista

### Sintesi
Marco aveva bisogno di un PDF da consegnare al commercialista per il controllo dei corrispettivi. Deciso insieme: periodo mensile, solo prospetto fiscale (niente metodi di pagamento), funzione nel modulo Vendite.

### Implementazione
- **`app/services/corrispettivi_export.py`** — nuova `build_corrispettivi_pdf(year, month)`: legge la fonte unita (`_merge_shift_and_daily`), costruisce tabella giornaliera (Data, Giorno, Corrispettivo lordo, Imponibile, IVA, Fatture, Totale) con scorporo IVA (`_scorpora_imponibile`, half-up) + riga totali mese + summary box + **riepilogo IVA per aliquota**. Genera PDF col mattone M.B. Helper `_fmt_euro_it` per i numeri in formato italiano.
- **`app/routers/admin_finance.py`** — endpoint `GET /admin/finance/export-corrispettivi-pdf?year=&month=` (404 se il mese è vuoto, 500 su errore di rendering).
- **`frontend/src/pages/admin/CorrispettiviDashboard.jsx`** — bottone "📄 PDF commercialista" nella barra navigazione, solo in modalità mensile; usa `openAuthedInNewTab` (download JWT-protetto).

### Note tecniche
- Sorgente = fonte unita shift+daily (`_merge_shift_and_daily`, stesso pattern di dashboard ed export Excel). I giorni dalle chiusure turno non hanno lo split IVA → trattati come 100% IVA 10% (somministrazione pura, decisione Marco).
- Il PDF dà la sostanza fiscale (lordo + scorporo imponibile/imposta per aliquota), NON riproduce il tracciato XML 7.0 dei corrispettivi telematici (è un formato di trasmissione del RT).
- Classificazione `[core]`: ogni ristorante ha un commercialista; il branding PDF arriva già dalle stringhe locale.
- Verificato in sandbox: PDF di Gennaio/Marzo/Aprile 2026 generati correttamente. Aprile passa da € 0 (bug: leggeva solo `daily_closures`) a € 49.057 lordo / € 44.597,28 imponibile / € 4.459,72 IVA via merge.

### Refactor pianificato (sessione dedicata, deciso 2026-05-21)
Marco ha segnalato che `daily_closures` (import Excel) e `shift_closures` (chiusure turno) sono **due sistemi che si incrociano male**. Direzione concordata: l'import Excel deve scrivere in `shift_closures`, `daily_closures` viene **migrata interamente** (tutti i 6 anni, ~1.400 giornate con dati) e poi dismessa — `roadmap.md` §K.12. In aggiunta (§K.13): import dei file XML dei corrispettivi telematici dal portale AdE come fonte dati in più. Da fare in sessione "refactor" separata, non mescolata al commit del PDF.

### Fix Dashboard Vendite (stessa sessione, segnalati da Marco)
Due bug della Dashboard Vendite corretti insieme al PDF (tutto `[core]`, modulo Vendite):
- **Giorni migliori/peggiori**: `GET /admin/finance/stats/top-days` ordinava per `totale_incassi` (deprecato, spesso 0) e includeva i giorni a zero → liste senza senso. Ora ordina per `corrispettivi_tot` ed esclude i giorni a zero; il frontend usa direttamente `top_best`/`top_worst`.
- **Click sul calendario**: la cella rimandava a `/vendite/chiusure?date=X` ma `ChiusureTurnoLista.jsx` ignorava `?date=`. Ora legge il parametro, si posiziona sul mese giusto, espande il giorno e ci fa scroll.

### Commit suggerito
`./push.sh "[core] PDF corrispettivi commercialista + fix Dashboard Vendite (top-days, click calendario)"`

---

## SESSIONE 2026-05-19 (cont. notte) — riferimento storico

**Audit autonomo Claude Code + riallineamento decisioni PO**. Sessione di sola docs: l'audit autonomo del pomeriggio (committato in `90f1b73` insieme a vini 3.54) ha prodotto 8 file in `docs/audit-2026-05-19/` con verdetto adversarial **87/100**. Marco ha risposto alle 5 decisioni PO. Commit `[mixed]` di docs hardening: rinomina `modulo_selezioni.md` → `modulo_vendite.md`, nuovi stub `modulo_selezioni_giorno.md` (CRIT-2) e `modulo_fatture_in_cloud.md` (CRIT-1, 17 endpoint), disciplina docs in `CLAUDE.md`.

## SESSIONE 2026-05-19 (cont. notte) — Audit autonomo + decisioni PO + docs hardening

### Sintesi
Marco ha caricato in sessione i deliverable di un audit autonomo che ha fatto fare a Claude Code nel pomeriggio (8 file, 2.655 righe, durata dichiarata ~1.5h). L'audit ha prodotto: inventario stack, audit 416 capability su 14 moduli, gap report (5 CRIT + 20 MED + 10 MIN + 5 anomalie strutturali), refactoring plan docs, manuale utente di ~6.000 parole, executive summary. Una sessione adversarial separata (Claude Code) ha dato verdetto **87/100** (≥85 = "audit affidabile, usabile come deliverable"), con riserva su CRIT-3 e CRIT-4 sovrastimati nella priorità.

### Decisioni PO Marco (5 in sospeso, tutte chiuse)
1. **NOMEN-1 — "Selezioni"** → **DISAMBIGUIAMO**. Rinomina `docs/modulo_selezioni.md` → `docs/modulo_vendite.md`. Nuovo stub `docs/modulo_selezioni_giorno.md` per i 5 router `scelta_*` di cucina.
2. **V-H.I cleanup `*_legacy.jsx` vini** → "non prima del 15 giugno" (rimosso vincolo settimanale, niente data limite).
3. **Endpoint `/menu/`** → "nel cassetto, poi lo faremo" — segnato in `inventario_pulizia.md`.
4. **MORT-2 turni vecchio + v2** → "lo vediamo quando sistemiamo meglio il modulo Dipendenti" — segnato in `controllo_design.md`.
5. **Mattone email M.D** → "non prioritario" — segnato in `architettura_mattoni.md`.

### Modifiche docs in questo commit
- `docs/modulo_vendite.md` (nuovo, contiene tutto il contenuto storico di `modulo_selezioni.md` + sezione 0 disambiguazione)
- `docs/modulo_selezioni.md` (svuotato → stub redirect verso `modulo_vendite.md` e `modulo_selezioni_giorno.md`)
- `docs/modulo_selezioni_giorno.md` (nuovo stub: 5 router gemelli, 24 capability, pattern comune)
- `docs/modulo_fatture_in_cloud.md` (nuovo stub: 17 endpoint reali — audit dichiarava 12)
- 5 docs con link interni aggiornati: `modulo_cucina.md`, `modulo_banca.md`, `readme.md`, `database.md` (2 occorrenze)
- `docs/roadmap.md` — nuova sezione "Docs hardening" con i 5 CRIT (CRIT-3 e CRIT-4 declassati a MED) + V-H.I tempistica aggiornata
- `docs/controllo_design.md` — voce MORT-2 turni rinviata
- `docs/inventario_pulizia.md` — voce `/menu/` "nel cassetto"
- `docs/architettura_mattoni.md` — M.D segnato "non prioritario (Marco 2026-05-19)"
- `CLAUDE.md` — nuova sezione "Disciplina docs": ogni nuova capability in un router → riga in tabella Capability del relativo `modulo_*.md`

### Cosa NON è in questo commit (per evitare scope creep)
- Tabella Capability standardizzata in cima a ogni `modulo_*.md` (4-6h, sessione dedicata futura)
- Split `modulo_cucina.md` → `cucina.md` + `task_manager.md` (CRIT-4 declassato, sessione dedicata)
- Estensione `push.sh` con warning router→docs (enhancement L1 guardiano, sessione tecnica separata)
- Verifica spot dei 3 claim del manuale (PIN 60s, JWT 30min, vini esauriti) — sessione dedicata
- Refactor strutturale `docs/{moduli, specs, adr}/` (2 giorni, non urgente)

### Riferimenti chiave
- Cartella audit: `docs/audit-2026-05-19/` (8 file, già committati in `90f1b73`)
- Verdetto adversarial: `docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md` (87/100)
- Executive summary: `docs/audit-2026-05-19/05_EXECUTIVE_SUMMARY.md`
- Manuale utente: `docs/audit-2026-05-19/04_MANUALE_UTENTE.md` (~6.000 parole)

### Verifica post-deploy attesa
Nessuna verifica runtime (sessione di sola docs). Da verificare manualmente:
- I link interni nei 5 docs aggiornati puntano correttamente.
- `modulo_vendite.md` è leggibile end-to-end.
- `modulo_selezioni.md` (stub redirect) non lascia broken link.

### Prossimi step suggeriti
- Verifica spot 3 claim manuale prima di darlo allo staff.
- Tabella Capability standardizzata (sessione docs L, distribuita).
- Split `modulo_cucina.md` (sessione docs S).

---

## SESSIONE 2026-05-19 (cont. sera) — CG/Fatture redesign + modello stati 3D

### Sintesi
Sessione parallela alla F11 vini. Apertura: Marco lamenta che il dettaglio fattura ha bottoni e chip stato sparsi e confusi. Identificata la radice del problema: l'enum `cg_uscite.stato` a 8 valori schiaccia 3 dimensioni semantiche ortogonali, e nessuno aveva mai disambiguato. Sistemata la cosa "granitica" sui docs + memoria + codice, poi redesign vero del dettaglio fattura con tab CE dedicato + editor categoria/sottocategoria bidirezionale con vista Fornitori.

### Modello 3D stati pagamento (chiusura semantica)
Aggiunta sezione §15 in `docs/stato_pagamento_unificato.md` come modello canonico:
- **D1 — PAGAMENTO** (business, 3 valori): PAGATA / NON PAGATA / PARZIALMENTE PAGATA
- **D2 — Modificatori tecnici** (CG-only): `*` non riconciliata, `?` da verificare
- **D3 — SCADENZA/TEMPO**: in scadenza / scaduta / rateizzata / spostata

Regole: nel modulo Fatture D1 e D3 vanno SEPARATI (2 chip distinti). Nel modulo CG si possono UNIRE. D3 irrilevante se D1=PAGATA. RATEIZZATA/SPOSTATA sono D3, non D1.

Aggiunto richiamo in `CLAUDE.md` + memoria persistente `feedback_stati_pagamento_3_dimensioni.md`. Commenti allineati in `StatoPagamentoBadge.jsx`, `statoPagamento.js`, `fatture_stato_service.py`.

### Componenti nuovi/aggiornati
- **`StatoScadenzaBadge.jsx` v1.0** (nuovo): badge dedicato a D3 con 4 chip (💤 in_scadenza, ⚠ scaduta, 📆 rateizzata, ↩ spostata). Export `deriveStatoScadenza(uscitaStato, scadenzaISO)` + `giorniLabel(scadenzaISO)`.
- **`StatoPagamentoBadge.jsx` v1.3**: gestisce SOLO D1+D2. RATEIZZATO/SPOSTATO proiettati su `da_pagare` (D1=NON PAGATA).
- **`fatture_stato_service.py` v2.1**: `set_stato()` scrive SOLO D1+D2. Mutazioni D3 passano da endpoint dedicati.

### FattureDettaglio v3.1 — redesign secondo il modello 3D
1. **Header**: 2 chip distinti D1+D3 in cima. Rimossi i 2 bottoni inline "📅 sposta competenza" / "📆 spalma su N mesi" dal sottotitolo (spostati nel tab CE). I 2 chip read-only restano come segnale rapido.
2. **Tab Pagamenti**: riquadro "Stato pagamento attuale" in cima, con chip D1+D2 grande + bottoni di cambio (`Da pagare` / `❓ Da verificare` / `Pagato*`) sotto label "Cambia stato →". Banner verde "🔒 Stato definitivo" se riconciliato. Riquadro nascosto per fatture rateizzate.
3. **Tab "Conto Economico"** (NUOVO, 4° tab): 3 sezioni:
   - **📅 Competenza P&L**: 2 card "Mese singolo" + "Spalmatura" con bottoni di modifica.
   - **🏷 Categoria nel CE**: aggregato read-only + tabella per riga con dropdown editabili (bidirezionale con Fornitori).
   - **📊 Dove appare nel CE**: fetch lazy, mostra importo P&L, mese, categoria, % ricavi, % categoria, link al CE.
4. **Footer ripulito**: rimossa label "STATO:" + i 3 bottoni di cambio (erano fuorvianti). Ora solo "Modifica anagrafica fornitore" + "Chiudi".

### Bidirezionalità categoria fatture ↔ fornitori
La nuova tabella "Modifica per riga" nel tab CE riusa **lo stesso endpoint** di `FattureFornitoriElenco`: `POST /contabilita/fe/categorie/fornitori/prodotti/assegna`. Effetto by design: modificare qui aggiorna anche tutte le righe esistenti con stessa descrizione di quel fornitore + il mapping `fe_prodotto_categoria_map` + la vista Fornitori. Zero rischio di drift fra moduli.

### Endpoint backend
- **NUOVO** `GET /contabilita/fe/fatture/{id}/ce-impatto`: ritorna impatto P&L per il tab CE.
- **ESTESO** `GET /contabilita/fe/fatture/{id}`: response aggiunta `categoria_aggregata[]` + `escluso_acquisti` + righe con `categoria_id/sottocategoria_id/categoria_nome/sottocategoria_nome/categoria_auto`.

### File modificati
**Backend:** `app/routers/fe_import.py` (get_fattura_detail esteso + endpoint ce-impatto), `app/services/fatture_stato_service.py` (v2.1), `frontend/src/pages/admin/FattureElenco.jsx` (guardia cambiaStato ristretta a STATI_MANUALI).

**Frontend:** `frontend/src/components/StatoScadenzaBadge.jsx` (nuovo), `StatoPagamentoBadge.jsx` (v1.3), `utils/statoPagamento.js` (commenti), `pages/admin/FattureDettaglio.jsx` (v3.1 redesign).

**Docs/config:** `docs/stato_pagamento_unificato.md` (§15), `docs/modulo_controllo_gestione.md` (aggiornamento), `CLAUDE.md` (richiamo §3D), `versions.jsx` (3 bump), `VERSION` (5.15→5.16), `docs/sessione.md` (questa entry).

**Memoria persistente:** `feedback_stati_pagamento_3_dimensioni.md`, `feedback_coordinamento_sessioni_parallele.md`.

### Note di coordinamento sessioni parallele
Marco mi ha richiamato a metà sessione: avevo dichiarato che il refactor vini era "Fasi 1-7 chiuse, restano 8/9/10" basandomi sulla memoria del 14 maggio, mentre dal `git log` si vedeva che l'altro agente in parallelo aveva già fatto il cutover (`ba344e2`) + vini 3.46→3.53. Scritta memoria comportamentale: PRIMA di dichiarare stato corrente a Marco, verificare SEMPRE `git log --oneline -15` + `git status --short`. La memoria personale può essere stantia di giorni, il `.guardiano_state.json` è fermo al 28 aprile e non è canale real-time.

### Verifiche post-deploy attese
- Aprire una fattura: header mostra 2 chip distinti D1+D3.
- Tab Pagamenti: riquadro stato pagamento con chip + 3 bottoni cambio.
- Tab Conto Economico: 3 sezioni renderizzate, fetch lazy "Dove appare" funzionante.
- Cambio categoria su una riga del tab CE → in Fornitori la stessa descrizione mostra la categoria aggiornata.
- Fattura PAGATA: tab Pagamenti mostra banner "🔒 Stato definitivo".
- Fattura rateizzata: niente riquadro stato (banner viola "Rateizzata in spesa fissa X" resta).

### Roadmap CG aggiornata (codici brevi C1-C6)
- **C1** (G.3.2) Spalmatura competenza — ✅ FATTO
- **C2** (G.3.4) Vendite per tipo food/beverage — 🟡 in pausa (8 domande pending per Marco sul tracciato iPratico)
- **C3** Ammortamenti — stand-by
- **C4** Food cost vero per categoria — da pianificare
- **C5** Budget vs consuntivo — da pianificare
- **C6** Export PDF CE — bloccato (manca M.B PDF brand)

### Prossima sessione
Marco userà la nuova UI fatture in produzione. Quando vorrà rispondere alle 8 domande iPratico pending, si attacca C2 (vendite per tipo).

---

## SESSIONE 2026-05-19 — F11 Hotfix giornata di test ad osteria chiusa

### Sintesi
Marco apre la Cantina post-cutover S3 e mi segnala bug man mano che li trova. Risolti uno alla volta con piccoli push frequenti (vini 3.47 → 3.53). Tutti i bug derivano da lettori che il sed S3 aveva mancato + banner di transizione che erano rimasti.

### Fix lato backend (sed esteso `vini_magazzino → vini_bottiglie` su altri 5 file)
1. **`vini_cantina_tools_router.py`** (matrice + stampe inventario PDF + locazioni). Senza questo: stampe PDF 500, matrice "non configurata".
2. **`vini_magazzino_db.py`** (modulo core legacy con 133 occorrenze, riusato da molti endpoint). Senza questo: matrice/operazioni varie 500.
3. **`vini_magazzino_router.py`** (`/dashboard`, `/movimenti-globali`). Senza questo: vendite e dashboard vuote.
4. **`vini_xlsx_v2.py`** (import/export Excel).
5. **`vini_settings.py`** (NAZIONE/REGIONE distinct).

### Fix lato frontend
6. **Banner READ-ONLY rimossi** in 4 punti (Cantina classica deprecata):
   - `SchedaVino.jsx` footer (riga 1617)
   - `SchedaVinoV2.jsx` top (riga 31)
   - `CantinaV2.jsx` scheda inline (riga 300)
   - `GestioneVino2.jsx` header (riga 135-138)
7. **`SchedaVinoV2` + `CantinaV2` inline**: `readOnly={true}` → `readOnly={false}` (cantina v2 ora scrivibile).
8. **BulkActionBar Cantina v2**: rimossi bottoni "Modifica" + "Duplica" deprecati (erano disabilitati).
9. **Wizard Step 4**: rimossa 4° LocCard "Locazione 3" (gestita SOLO dalla matrice, come SchedaVino). Le celle matrice ora contano nel totale + nello sblocco "Avanti".
10. **Wizard Step 3**: aggiunto auto-calcolo Prezzo Carta da Listino via `onBlur` (replica MagazzinoViniNuovo legacy, endpoint `/vini/pricing/calcola`).
11. **Bottone "🗑️ Elimina vino"** nella SchedaVino (doppia conferma + cascade movimenti/note/celle). Visibile solo se `!readOnly`. Endpoint backend già esistente `DELETE /vini/magazzino/delete-vino/{id}`.
12. **Bottone "🍷 Vai al madre"** nel footer SchedaVino: prop opzionale `onOpenMadre(mid)` passata da Cantina v2 inline (`handleMadreClick`) e da SchedaVinoV2 route (`navigate('/vini/v2/cantina?vista=madri&openMadre={mid}')`). Effetto auto-apertura nella CantinaV2 via deep-link.
13. **Stale cache fix**: dopo edit in SchedaVino, Cantina v2 ricarica la lista via `onVinoUpdated={fetchData}` (prima un edit del prezzo non si rifletteva nella scheda madre senza Ctrl+Shift+R).

### Versioni post-giornata
- **vini 3.53** (3.47 + 3.48 + 3.49 + 3.50 + 3.51 + 3.52 + 3.53)
- **sistema 5.15** (Marco mi ha ricordato di bumpare anche `VERSION` root)

### Task pending registrati durante la giornata (per future sessioni)
- **Task #2 / V.20** — Import/Export Vini v3 (template strutturato 3 fogli Produttori/Madri/Bottiglie con FK + auto-creazione + diff). Sessione dedicata (~1 intera).
- **Task #3 / V.21** — Bulk delete da BulkActionBar Cantina v2 (XS, backend già pronto).
- **Task #136 / V.22** — Refactor UX Vista Sommelier (CartaStaff) — mobile-first per servizio in sala.

### Decisioni operative confermate durante la giornata
- **Cancellazione vino**: bottone scheda con doppia conferma + cascade DB. Bulk delete rimandato.
- **Carico senza locazione**: convenzione "📦 DA POSIZIONARE" come voce in Locazione 1 dei settings (no schema change). Marco l'aggiunge manualmente.
- **Template import/export Excel**: resta v2 "piatto" per ora, refactor v3 a 3 fogli rimandato a sessione dedicata.

### Verifiche post-deploy
- ✓ DB rinominato correttamente: 14 tabelle finali, conteggi corretti (1287 bottiglie, 995 madre, 350 produttori, 40 fornitori, 1637 denominazioni, 68 vitigni, archivio legacy 1287).
- ✓ Backup automatico mig 133 esistente: `vini_magazzino.sqlite3.pre-cutover-20260518-231936` (2.2M).
- ✓ Cantina, schede bottiglia/madre, wizard, carta PDF cliente, iPratico, vendite, stampe PDF inventario, matrice — tutti operativi.

### Aggiornamenti docs (oggi)
- `docs/roadmap.md` §V: V.6+V.7+V.8 marcati CHIUSI con sotto-tabella Fasi 1-10. Aggiunte V.20/V.21/V.22 da rivedere.
- `docs/modulo_vini.md`: nuova sezione "📌 STATO POST-CUTOVER (2026-05-19)" all'inizio (~200 righe) con: schema DB, relazioni, concetti semantici critici, UI post-cutover, wizard, endpoint principali. Header bumpato a 3.53. Sezioni storiche legacy mantenute per riferimento.
- `docs/sessione.md`: questa entry.
- Memoria interna: `project_refactor_anagrafiche_vini.md` aggiornata da "fasi 1-7 chiuse" a "CHIUSO 2026-05-19".

### Prossima sessione
Marco domani inserisce vini reali nell'osteria. Se emergono altri bug li fixiamo. Altrimenti si riapre la roadmap V.1/V.2/V.3 (priorità top: DISCONTINUATO UI + alert sottoscorta + storico prezzi grafico) o si attacca uno dei nuovi V.20/V.21/V.22.

---

## SESSIONE 2026-05-18 (parte 4) — CUTOVER: S1+S2+S3 in giornata

### Sintesi
Marco vuole chiudere il refactor anagrafiche oggi in 3 sessioni: wizard scritto + Cantina classica spenta + rename atomico. Domani osteria chiusa → giornata di test e fix se serve. Backup automatico nella mig 133 + raccomandazione backup VPS manuale prima del push.

### S1 — Attivazione wizard
- Backend `POST /vini/anagrafiche/bottiglia/` con schema `BottigliaCreate` (~30 campi annata) + `create_bottiglia()` nel model + sync cascade automatico al madre.
- Frontend `submitWizard()` in `NuovoVinoV2.jsx`: orchestra 4-5 POST sequenziali (produttore se _new → madre se _new → bottiglia → loop celle matrice).
- `PreviewModal` evoluto da "preview senza scrittura" a "Riepilogo prima della creazione" con bottone "✓ Conferma e crea". Schermata successo post-submit con ID generati + opzione "+ Nuovo vino".

### S2 — Spegnimento Cantina classica
- `vini_repository.py` (carta/calici/storico) + `ipratico_products_router.py` (sync) refactorati per leggere `vini_bottiglie_v2`. Sed mirato preservando i path file SQLite.
- `App.jsx`: 6 route `/vini/magazzino/*` ora redirect a `/vini/v2/*`. Helper `RedirectMagazzinoToV2` preserva `:id` nelle scheda dettaglio.
- `ViniNav.jsx` v3.0: tab "Cantina" punta direttamente a v2. Tab "Cantina 2" rimosso (era ridondante).
- **9 file FE rinominati `_legacy.jsx`** (MagazzinoVini, MagazzinoViniNuovo, MagazzinoViniDettaglio, MagazzinoAdmin, RegistroMovimenti, CantinaTools, MovimentiCantina, MagazzinoSubMenu, ViniDatabase). I file restano nel repo come archivio.

### S3 — Cutover atomico
- **Mig 133** `app/migrations/133_cutover_rename_tabelle_v2.py`: backup file `.pre-cutover-YYYYMMDD-HHMMSS` prima del rename + transazione atomica BEGIN/COMMIT con 7 ALTER (1 legacy → _legacy_YYYYMMDD + 6 _v2 → senza suffisso). Idempotente: skip se cutover già applicato. ABORT pulito se 6 `_v2` mancanti o nome destinazione già esistente.
- **Sed `_v2 → ""` nei 7 file backend runtime**: `vini_anagrafiche_db.py` (dict TABELLE), `vini_anagrafiche_sync.py`, `vini_anagrafiche_migrate.py`, `vini_anagrafiche_router.py` (schemi + commenti runtime), `vini_v2_router.py`, `vini_repository.py`, `ipratico_products_router.py`. Migrations 125-131 INTOCCATE (storia).
- **Tabelle satellite restano col nome attuale**: `vini_magazzino_movimenti`, `vini_magazzino_note`, `matrice_celle`. Refactor separato eventuale post-cutover.

### Verifiche
- `py_compile` OK su tutti i 7 file refactorati + mig 133.
- `esbuild` OK su App.jsx + ViniNav.jsx + NuovoVinoV2.jsx + tutti i pages/vini/v2/*.
- **Smoke test sandbox mig 133**: prima run = 1 backup + 7 rename atomici + 14 tabelle finali con conteggi corretti (995 madre, 1287 bottiglie, 350 produttori, 40 fornitori, 1637 denominazioni, 68 vitigni). Seconda run = skip idempotente.

### Bump versione
- vini 3.43 → 3.44 (S1) → 3.45 (S2) → **3.46 (S3)**.

### File toccati (commit pendente — TRE COMMIT consecutivi)

**S1 — Attivazione wizard (`vini 3.44`)**:
- Backend nuovo: nessuno
- Backend modificato: `app/models/vini_anagrafiche_db.py` (+create_bottiglia, +get_bottiglia, +BOTTIGLIA_FIELDS, +_now_iso), `app/routers/vini_anagrafiche_router.py` (+BottigliaCreate, +POST /bottiglia/)
- Frontend modificato: `frontend/src/pages/vini/v2/NuovoVinoV2.jsx` (+submitWizard, +stato saving/result/error, +parseNum helper, PreviewModal con onConfirm/saving/result)
- Versioni: `frontend/src/config/versions.jsx`

**S2 — Spegnimento Cantina classica (`vini 3.45`)**:
- Backend modificato: `app/repositories/vini_repository.py` (4 SELECT), `app/routers/ipratico_products_router.py` (5 SELECT)
- Frontend modificato: `frontend/src/App.jsx` (route redirect, helper RedirectMagazzinoToV2, import lazy rimossi), `frontend/src/pages/vini/ViniNav.jsx` v3.0
- Frontend rinominati: 9 file `*_legacy.jsx` (MagazzinoVini, MagazzinoViniNuovo, MagazzinoViniDettaglio, MagazzinoAdmin, RegistroMovimenti, CantinaTools, MovimentiCantina, MagazzinoSubMenu, ViniDatabase)
- Versioni: `frontend/src/config/versions.jsx`

**S3 — Cutover atomico (`vini 3.46`)**:
- Backend nuovo: `app/migrations/133_cutover_rename_tabelle_v2.py`
- Backend modificato (sed `_v2 → ""`): `app/models/vini_anagrafiche_db.py`, `app/services/vini_anagrafiche_sync.py`, `app/services/vini_anagrafiche_migrate.py`, `app/routers/vini_anagrafiche_router.py`, `app/routers/vini_v2_router.py`, `app/repositories/vini_repository.py`, `app/routers/ipratico_products_router.py`
- Versioni: `frontend/src/config/versions.jsx`
- Docs: `docs/sessione.md`, `docs/changelog.md`

### Commit suggeriti (3 push consecutivi)
```
./push.sh "[core] vini 3.44 — S1 wizard attivato (POST bottiglia + submitWizard FE) → la cantina ora scrive sulle _v2"
./push.sh "[core] vini 3.45 — S2 Cantina classica spenta (route redirect + 9 file _legacy + vini_repository/ipratico leggono _v2)"
./push.sh "[core] vini 3.46 — S3 CUTOVER ATOMICO (mig 133 backup + rename _v2→\"\" + sed 7 file backend)"
```

### ⚠️ Procedura backup PRIMA del push S3
Sul VPS, prima di lanciare `./push.sh` per S3:
```bash
ssh trgb
cd /home/marco/trgb/trgb
zip -r /home/marco/backups_cutover_$(date +%Y%m%d-%H%M%S).zip locali/tregobbi/data/
```
Doppio livello di sicurezza: backup VPS manuale + backup automatico mig 133.

### Smoke test post-deploy S3
1. Aprire Cantina → vedere 1287 bottiglie + nomi madre coerenti.
2. Aprire una scheda bottiglia → tab Anagrafica/Prezzi/Movimenti/Stats funzionano.
3. Creare un vino nuovo dal wizard → toast successo + bottiglia visibile in cantina.
4. Aprire carta cliente PDF → 1287 vini stampati correttamente.
5. iPratico sync (`/ipratico/products/missing` o `/match`) → risponde.

### Rollback in caso di problema
- Restore del file `app/data/vini_magazzino.sqlite3.pre-cutover-YYYYMMDD-HHMMSS` → stato pre-cutover ripristinato.
- Git revert dei 3 commit (S1+S2+S3).

---

## SESSIONE 2026-05-18 (parte 3) — M2.9-ter: matrice scaffali anche in creazione

## SESSIONE 2026-05-18 (parte 3) — M2.9-ter: matrice scaffali anche in creazione

### Sintesi
Marco voleva poter scegliere già in creazione la posizione fisica delle bottiglie sugli scaffali (cella riga × colonna della matrice), invece di rimandarla alla scheda → tab Giacenze post-creazione. Decisione operativa: se l'utente lo sa, deve poterlo mettere — la tabella è la stessa.

**Regola che mi sono preso (e memorizzato)**: prima di scrivere un componente nuovo, grep nel repo per pattern simili. Riusare `MatricePicker.jsx` esistente con un'estensione retrocompatibile, niente fork. Marco: *"non farei cose diverse, usa stesso codice, smetti di riscrivere"*.

### Fatto `[core]`
- **`MatricePicker.jsx`** estensione minima: 2 prop opzionali `pendingCells` + `onPendingChange`. Quando passate (con `vinoId=null`), entra in modalità "draft": click pre-seleziona celle nella lista controllata invece di POST API. Comportamento storico invariato per SchedaVino. ~25 righe aggiunte, render esistente riusato.
- **Wizard Step 4** — sezione "🗄️ Posizione scaffali (opzionale)" che monta `<MatricePicker vinoId={null} pendingCells={annata.MATRICE_CELLE} onPendingChange={...} />`. L'utente vede l'occupazione e pre-seleziona. Rimosso il banner-testo che diceva "si farà dopo".
- **`PreviewModal`** — riga "🗄️ Posizione scaffali" con le celle pre-selezionate formato `(col,riga)`.
- **emptyAnnata()** — campo `MATRICE_CELLE: []` di default.

### Decisione di design
- La matrice è M:N condivisa: non importa quando l'utente la compila, il dato finale è lo stesso. Non c'è motivo di forzare un solo punto.
- Modalità draft = niente scrittura DB nel wizard (è ancora preview-only). Al cutover scrittura, le celle preselezionate vanno chiamate via `matrice_assegna_cella` per ognuna.

### Verifiche
- `esbuild` OK su MatricePicker (8.1 KB) + NuovoVinoV2 (67.8 KB).
- Render Step 4: griglia compatta, click su cella libera la colora con tag amber, click rimuove. Celle occupate da altri vini bloccate (con tooltip vino occupante).

### Bump versione
- vini 3.42 → **3.43**.

### File toccati (commit pendente)
- Frontend modificato: `frontend/src/pages/vini/MatricePicker.jsx` (estensione draft), `frontend/src/pages/vini/v2/NuovoVinoV2.jsx` (Step 4 + PreviewModal + emptyAnnata), `frontend/src/config/versions.jsx`.
- Docs: `docs/sessione.md`, `docs/changelog.md`.
- Memoria: `feedback_riusa_non_riscrivere.md` (nuova regola operativa per me).

### Commit suggerito
```
./push.sh "[core] vini 3.43 — M2.9-ter posizione scaffali matrice anche in creazione (riuso MatricePicker con modalità draft)"
```

---

## SESSIONE 2026-05-18 (parte 2) — M2.9-bis: vitigni strutturati sul madre (mig 131)

## SESSIONE 2026-05-18 (parte 2) — M2.9-bis: vitigni strutturati sul madre (mig 131)

### Sintesi
Esteso M2.9-bis con persistenza strutturata dei vitigni "tipici" sul madre (Marco: "ho 10 campi vitigni nella tabella bottiglie, perché sul madre li hai solo stringa?"). Decisione: i 5+5 slot sul madre = blend tipico di riferimento, quelli sulla bottiglia = blend effettivo per annata, NON si sincronizzano. UI dinamica unificata tra wizard e anagrafiche: autocomplete + righe `[nome][% input][×]`, max 5, zero campi vuoti pre-allocati.

### Fatto `[core]`
- **Mig 131** — `app/migrations/131_madre_vitigni_strutturati.py`: ADD COLUMN x10 su vini_madre_v2 (`vitigno_1_id..vitigno_5_id` INTEGER + `vitigno_1_pct..vitigno_5_pct` REAL). Backfill: copia dalla bottiglia più recente di ogni madre (ANNATA DESC, id DESC). Idempotente. Smoke test sandbox: 32/995 popolati (gli altri 963 hanno bottiglie senza vitigni strutturati, lascia NULL).
- **Backend model** `app/models/vini_anagrafiche_db.py`: `MADRE_FIELDS` esteso con 10 nuovi campi. `get_madre()` decora con `vitigni_list: [{vitigno_id, vitigno_label, pct}]` via JOIN. `promote_madre_a_composto` accetta `vitigni: List[{vitigno_id, pct}]` (preferita) — risolve nomi via JOIN, scrive i 5 slot, ricostruisce la stringa per la composizione descrizione.
- **Backend router** `app/routers/vini_anagrafiche_router.py`: `VitignoSlot` schema + `MadrePromotePayload.vitigni`. `MadreBase`/`MadreUpdate` estesi con i 10 campi (PATCH `/madre/{id}` accetta direttamente i vitigni strutturati).
- **FE wizard `NuovoVinoV2.jsx`**: `PromuoviMadreModal` inizializza la lista vitigni dai dati del madre (madre.vitigni_list), submit manda `vitigni: [...]` strutturata.
- **FE anagrafiche `AnagraficheVini.jsx`**: import `vitigniToString`. `MadreEditModal` con sezione "🍇 Vitigni tipici (max 5)" — caricamento via GET `/madre/{id}`, autocomplete + righe compatte, save esplode in `vitigno_1_id..pct` con null espliciti sui rimossi. Preview descrizione composta ora include i vitigni come 4° ingrediente. `isCompostaMode` true anche se l'utente ha solo aggiunto vitigni (senza nome_etichetta/grado).

### Decisione di design
- **Vitigni madre = tipici / riferimento.** Vitigni bottiglia = effettivi per annata. Possono divergere senza sync — sono semantiche diverse.
- **UI dinamica, zero campi vuoti**: pattern unificato tra wizard e anagrafiche.

### Verifiche
- `py_compile` OK su mig 131 + model + router.
- `esbuild` OK su NuovoVinoV2 (66.9 KB) + AnagraficheVini (75.6 KB).
- Mig 131 in sandbox: prima run aggiunge 10 colonne + backfilla 32 madri, seconda run skippa entrambe le operazioni (idempotente).

### Bump versione
- vini 3.40 → 3.41.

### File toccati (commit pendente)
- Backend nuovo: `app/migrations/131_madre_vitigni_strutturati.py`
- Backend modificato: `app/models/vini_anagrafiche_db.py`, `app/routers/vini_anagrafiche_router.py`
- Frontend modificato: `frontend/src/pages/vini/v2/NuovoVinoV2.jsx`, `frontend/src/pages/vini/AnagraficheVini.jsx`, `frontend/src/config/versions.jsx`
- Docs: `docs/sessione.md`, `docs/changelog.md`

### Commit suggerito
```
./push.sh "[core] vini 3.41 — M2.9-bis vitigni strutturati sul madre (mig 131 + 5 slot + UI dinamica anagrafiche/wizard)"
```

---

## SESSIONE 2026-05-18 — M2.9-bis Promozione madri legacy → descrizione composta

### Sintesi
Chiusura del modello "descrizione composta" iniziato in M2.9. I 1287 madri legacy (descrizione testuale libera) ora possono essere promossi uno a uno al modello composto (descrizione_auto=1, ricomposta dai 4 ingredienti: denominazione + nome_etichetta + vitigni + grado). Triggers di promozione: bottone in wizard Step 3 quando si crea un'annata su madre legacy; oppure modifica diretta del madre in Anagrafiche se vengono valorizzati gli ingredienti. Badge 📜 OLD sui legacy (no badge sui composti = standard, scelta UX di Marco: "il nuovo è lo standard, l'OLD è l'eccezione").

### Fatto `[core]`
- **Backend model** — `app/models/vini_anagrafiche_db.py`: nuova funzione `promote_madre_a_composto(mid, denominazione_id, nome_etichetta, grado_alcolico_tipico, vitigni_stringa)` che aggiorna i 4 ingredienti, ricompone descrizione via `componi_descrizione` e setta `descrizione_auto=1`. Idempotente. Raise ValueError se la composizione sarebbe vuota. `MADRE_FIELDS` esteso con `nome_etichetta` + `descrizione_auto`.
- **Backend router** — `app/routers/vini_anagrafiche_router.py`: nuovo endpoint admin `POST /vini/anagrafiche/madre/{mid}/promote-composto`. Payload `MadrePromotePayload` con i 4 ingredienti opzionali. Verifica FK denominazione, chiama model, cascade sync su bottiglie. `MadreBase`/`MadreUpdate` estesi con `nome_etichetta` + `descrizione_auto`.
- **Frontend wizard `NuovoVinoV2.jsx`**:
  - Step 2 — badge 📜 OLD inline sui madri legacy nella lista (descrizione_auto=0). Anche sulla card "vino madre selezionato" sotto.
  - Step 3 — banner warning grosso con bottone "🔧 Sistema il madre" quando si lavora su un madre legacy. Non bloccante: si può proseguire senza promuovere.
  - Nuovo componente `PromuoviMadreModal` con form 4 ingredienti (autocomplete denominazioni + nome_etichetta + lista vitigni con %, fino a 5 + grado), preview live "Nuova descrizione" (helper JS `componiDescrizione` gemello del backend), descrizione attuale legacy mostrata read-only in alto. Submit → POST endpoint backend.
- **Frontend anagrafiche `AnagraficheVini.jsx`**:
  - `MadrePanel` (lista madri): badge 📜 OLD inline accanto alla descrizione. Filtro "📜 Solo legacy" per scoprire tutti i madri da promuovere.
  - `MadreEditModal`: campo `nome_etichetta` aggiunto. Badge 📜 OLD / ✓ COMPOSTA in header. Preview "Descrizione composta (anteprima)" live se attivata la modalità composta (denominazione + nome_etichetta o grado). Campo descrizione testuale si auto-disabilita in modalità composta. Al save, se modalità composta, descrizione viene ricomposta e `descrizione_auto=1` settato.

### Decisioni di design
- **Default = "nuovo standard"**: la convenzione è che i madri nuovi (creati via wizard) e quelli promossi hanno `descrizione_auto=1` = no badge. Il badge 📜 OLD esiste solo sui legacy `descrizione_auto=0` per ricordare che vanno "sistemati". Marco: "sulle new non mettere un bollino, dovrebbe essere lo standard, piuttosto mettile su tutte le attuali che partono come OLD". Convenzione coerente: il nuovo è lo standard, l'eccezione è l'OLD.
- **Promozione non bloccante**: il wizard mostra il banner ma permette comunque di creare l'annata su un madre legacy. Marco: "se non viene usato va bene lo stesso perché il sistema li leggerà sulla stampa PDF e sulla carta html comunque corretti". La descrizione testuale legacy continua a funzionare ovunque.
- **Promozione progressiva**: i 1287 madri legacy si sistemano man mano che l'utente li tocca, senza job batch. Migrazione organica.

### Versione
- frontend `versions.jsx`: vini 3.39 → 3.40 (stabile, color green)
- VERSION root: invariato (modulo vini bump indipendente)

### Verifiche
- `py_compile` OK su router + model + service descrizione
- esbuild OK su NuovoVinoV2.jsx (66 KB) + AnagraficheVini.jsx (70 KB) — JSX/import puliti
- Smoke flow logico: wizard Step 3 su madre legacy → modal con preview live, save → POST endpoint → cascade sync su bottiglie → madre re-fetched in parent con descrizione_auto=1 → banner sparisce.

### Prossima sessione possibile
- Push M2.9-bis + verifica live con click manuale su un madre legacy reale (es. quello "Langhe DOC Rossj-Bass" citato come riferimento)
- Eventuale promozione massiva semi-automatica per madri dove la regex riesce a separare denominazione + nome etichetta + vitigni dalla descrizione testuale (sondaggio: quanti dei 1287 si auto-promuoverebbero in modo affidabile?)
- M2.10 — riepilogo finale architettura Cantina 2 prima di considerarla "pronta per cutover" parallelo a Cantina 1

### File toccati (commit pendente)
- Backend: `app/routers/vini_anagrafiche_router.py`, `app/models/vini_anagrafiche_db.py`
- Frontend: `frontend/src/pages/vini/v2/NuovoVinoV2.jsx`, `frontend/src/pages/vini/AnagraficheVini.jsx`, `frontend/src/config/versions.jsx`
- Docs: `docs/sessione.md`, `docs/changelog.md`

### Commit suggerito
```
./push.sh "[core] vini 3.40 — M2.9-bis Promozione madri legacy → descrizione composta (backend promote endpoint + modal wizard + badge OLD)"
```

---

## SESSIONE 2026-05-16 — G.3 Fase E parte 1/2: schema DB + parser PDF (storico)

**Header originale (pre-M2.9-bis):** G.3 Fase E parte 1/2: schema DB costo personale (mig 132 — `dipendenti_costo_consuntivo` + `f24_versamenti`) + parser ELAB pdf + parser F24 pdf — testati su PDF reali Aprile 2026 con saldi al centesimo. + G.3 Fase D Conto Economico fix cascata (drill-down righe + % sui ricavi + RATEIZZAZIONE_TASSE + aggregazione per RIGA con fallback). + lato Vini: M2.4-5 prezzo_unitario snapshot + M2.5-arch nav refactor + SchedaMadreV2 full-frame + M2.5.1 Produttori + M2.5.2 Distributori/Denominazioni. Versione modulo vini 3.28 → 3.30.

## SESSIONE 2026-05-16 — G.3 Fase E parte 1/2: schema DB + parser PDF

### Sintesi
Marco ha fornito 3 PDF mensili campione del consulente paghe (LUL già importato, ELAB e F24 nuovi). Confermato: solo il netto bonificato in `cg_uscite` non basta — il costo aziendale vero (lordo + carico ditta INPS + ratei 13ª/14ª/ferie + TFR + INAIL) sta nell'ELAB pagina 8 "COSTO CONSUNTIVO". Per Aprile 2026: netto bonificato € 12.140 vs costo vero € 20.489 → utile sovrastimato di € 8.349/mese.

Sessione dedicata a porre le fondamenta: schema DB + parser PDF. Niente UI / niente refactor del service CE: rimandati a sessione successiva. Tutto a basso impatto sul sistema in produzione (tabelle nuove vuote, parser non chiamati da nessun endpoint).

### Fatto
- **Mig 132** `[core]` — `app/migrations/132_g3_fase_e_costo_personale.py`. Crea tabella `dipendenti_costo_consuntivo` in dipendenti.sqlite3 (21 colonne) e `f24_versamenti` in foodcost.db (25 colonne). UNIQUE su (anno, mese, dipendente) e (anno, mese, matricola) per anti-doppio. 5 indici sul costo, 6 sul F24 (compresi raggruppamento, banca_movimento_id, hash). Pattern cross-DB via PRAGMA database_list (riusato dalla mig 060). Idempotente.
- **Parser ELAB** `[core]` — `app/services/elab_parser.py`. Estrae:
  - meta: anno/mese (da titolo "DAL MESE DI X Y"), azienda (codice + ragione sociale), sha256 del PDF
  - 10 dipendenti con dettaglio costo (matricola, nome, ore, lordo, contributi, straord, ratei, TFR, totale)
  - riga "T O T A L I AZIENDA" come totale aggregato
  - INAIL del mese (pagina 2 sezione POSIZIONE INAIL → tot 92,14€ Aprile)
  - lista warnings su righe parziali/totali mancanti
  Test 3GOBBI_ELAB_4.pdf: 10 dipendenti + totale azienda € 20.488,88 = somma costo dipendenti, ZERO discrepanza.
- **Parser F24** `[core]` — `app/services/f24_parser.py`. Multi-pagina (ogni pagina = una delega F24 separata). Riconosce 5 sezioni (Erario / INPS / Regioni / IMU+Tributi Locali / INAIL) tramite regex specifiche. Codici tributo mappati con descrizione human-readable. Formato importi Entratel "compresso" (rimuovi punti, dividi per 100). `CODICI_CREDITO` whitelist (1704, 6781) per riconoscere compensazioni come crediti anche senza segno "-" esplicito. Test 3GOBBI_F24_4.pdf: 3 deleghe, saldi 90,00 / 5.483,90 / 0,00 = saldi PDF attesi al centesimo.

### Decisioni di design
- **Tabella `dipendenti_costo_consuntivo` in dipendenti.sqlite3** (non in foodcost.db). Coerente con disciplina modulare (CLAUDE.md): prefisso `dipendenti_*`. Il CE leggerà via apertura connection separata (pattern già esistente per vendite_conn).
- **Tabella `f24_versamenti` in foodcost.db**. Cross-modulo: collegata a CE (cassa) e banca_movimenti (riconciliazione). Non solo dipendenti.
- **Anti-doppio import** via campo `fonte_hash` (sha256 del PDF) — se stesso file ricaricato, l'import lato app skip-pa.
- **Match dipendente_id best-effort**: la tabella ha sia `matricola` (chiave certa) sia `dipendente_id` (FK soft, NULL ammesso). L'import del PDF associa matricola → dipendente_id via lookup nome.
- **Whitelist codici credito F24**: codici 1704 e 6781 sono SEMPRE crediti (compensazioni). Altri codici Erario (1001, 1040, 1075) sono SEMPRE debiti. Eventuali futuri segni espliciti "-" continuano a essere riconosciuti.

### Verifiche
- py_compile pulito su mig 132, elab_parser, f24_parser.
- Mig 132 testata in sandbox `/tmp/mig132_test/`: tabelle create con 21 + 25 colonne, 5 + 6 indici. Re-run senza errori (CREATE IF NOT EXISTS).
- Parser ELAB Aprile 2026: 10 dipendenti, INAIL 92,14€, totale azienda 20.488,88€. Somma dei `costo_totale` per dipendente coincide con `totale_azienda` al centesimo.
- Parser F24 Aprile 2026: 3 deleghe con saldi 90,00 + 5.483,90 + 0,00. Compensazioni 6781 (375,86€ credito) e 1704 (1.237,42€ credito su 4 mesi) riconosciute. 16 righe estratte totali (Erario + INPS + Regioni + 4 comuni + INAIL).

### File toccati (commit pendente)
- Backend nuovo: `app/migrations/132_g3_fase_e_costo_personale.py`, `app/services/elab_parser.py`, `app/services/f24_parser.py`
- Docs: `docs/changelog.md`, `docs/sessione.md`, `docs/roadmap.md` (già aggiornata in commit precedente)

### Prossima sessione (G.3 Fase E parte 2/2)
- E.4: UI Dipendenti "Carica buste paga del mese" — dropzone per i 3 file LUL+ELAB+F24
- E.5: refactor `_aggregate_stipendi` in `conto_economico.py` (legge da `dipendenti_costo_consuntivo` se mese presente, fallback netti)
- E.6: nuovo tipo `F24_STIPENDI` in `cg_spese_fisse` (anti-doppio competenza vs cassa)
- E.7: mig 133 retro import gen-apr 2026 dagli 8 PDF archiviati (4 ELAB + 4 F24)
- E.8: tab "Costi mensili" in Dipendenti — vista per consultare costo aziendale per mese
- E.9: rimozione warning banner CE "costo personale parziale" — solo dopo verifica Marco

---

## SESSIONE 2026-05-16 — G.3 Conto Economico Fase D (cascata fix) + bug aggregazione

### Sintesi
Chiusa Fase D di G.3 con verifica sui dati reali di Aprile 2026. Trovati e fixati 4 bug a cascata. Aggregazione del CE per categoria reimplementata sul livello RIGA (era a livello fornitore, perdeva categorizzazioni granulari come A2A). Aggiunto drill-down 3 livelli + percentuali sui ricavi (convenzione ristorazione). Programmata Fase E (costo personale completo via import ELAB+F24).

### Fatto (in più commit aggregati lungo la sessione)
- **Bug 1 — Load failed CE**: `f.escluso_acquisti` → `ffc.escluso_acquisti` in `conto_economico.py` (regola CLAUDE.md: escluso_acquisti vive su `fe_fornitore_categoria`).
- **Bug 2 — Stipendi invisibili**: `app/routers/dipendenti.py:1478` salvava `periodo_riferimento` come "Aprile 2026" testuale. Fix: `f"{anno}-{int(mese):02d}"`. Mig 130 normalizza retroattivamente 35 record storici.
- **Bug 3 — Rateizzazioni pregresse**: nuovo tipo `RATEIZZAZIONE_TASSE` su `cg_spese_fisse`, distinto da `TASSA` (correnti) e `RATEIZZAZIONE` (rate generiche). Mig 131 riclassifica id=22,23 (Abaco, Fondo Est). Escluso in competenza, incluso in cassa.
- **Bug 4 — Aggregazione per fornitore vs per riga**: il CE raggruppava solo per `fe_fornitore_categoria.categoria_id`, perdendo i fornitori con righe categorizzate ma senza categoria a livello fornitore (es. A2A: 62 righe UTENZE 100% ma `categoria_id=NULL` perché escluso da ricette). Fix: aggregazione per `fe_righe.categoria_id` con fallback gerarchico (1. riga → 2. fornitore → 3. "Non categorizzato"). Per Aprile: "Non categorizzato" passa da € 6.677 a € 3.269 (-51%), UTENZE da € 70 a € 3.160.
- **Drill-down 3 livelli**: il CE ora espande categoria → sottocategoria → righe singole. Click su una riga apre `/acquisti/dettaglio/:id` (fattura), `/controllo-gestione/spese-fisse?highlight=:id` (spesa fissa) o `/dipendenti/buste-paga` (stipendio).
- **Percentuali sui ricavi**: sostituito `pct_su_spese` con `pct_su_ricavi` (convenzione ristorazione: food cost % = costo merce / ricavi). Barra orizzontale "Ripartizione dei ricavi" a 3 fette. Gestione caso perdita.
- **Warning banner CE**: "Costo personale parziale — STAFF mostra solo netti bonificati. Mancano carico ditta + ratei + TFR + INAIL. Per Aprile 2026 il costo reale è ~€ 20.500 vs € 12.140 attualmente conteggiati → utile sovrastimato di ~€ 8.000/mese". Da rimuovere a chiusura Fase E.
- **Roadmap G.3 Fase E**: sezione dedicata in `docs/roadmap.md` con piano completo (mig 132 nuove tabelle, parser PDF ELAB + F24, UI upload, refactor `_aggregate_stipendi`, anti-doppio F24_STIPENDI, mig 133 retro gen-apr 2026).

### Decisioni (Marco 2026-05-16)
- **Food cost % calcolato sui RICAVI, non sul totale spese**. Convenzione universale ristorazione. Per Aprile: food cost 26,4%, costi op 59,8%, utile 13,9% (somma 100%).
- **F24 stipendi: importeremo anche il PDF** per riconciliazione cassa + validazione cross-check + sblocco modalità Cassa del CE.
- **Storico Fase E**: solo 2026 (gen-apr). Anni precedenti li abbiamo ma non ci interessano.
- **F24 mai inseriti in cg_spese_fisse**: nessun rischio doppio conteggio.

### Numeri reali di Aprile 2026 (post-fix, pre-Fase E)
- Ricavi:           € 49.057
- Costo merce:      € 12.936 (26,4%)
- Margine lordo:    € 36.121 (73,6%)
- Costi op:         € 29.324 (59,8%) — di cui STAFF solo netti
- Utile netto:      € 6.797 (13,9%) ⚠ sovrastimato di ~€ 8.000/mese (Fase E lo correggerà)
- "Non categorizzato" Aprile: € 3.985 (era € 7.393 prima del fix per riga)

### Verifiche
- py_compile pulito su conto_economico, controllo_gestione_router, mig 129/130/131.
- JSX braces bilanciate su ControlloGestioneContoEconomico.jsx (664 lines, 295 `{` = 295 `}`).
- Conservazione importi: per ognuna delle 52 fatture di Aprile, somma degli split del CE == imponibile DB (3 fatture con scarto 0,08-0,18€ da arrotondamento XML SDI, totale 0,13€ su 23.349€).
- Test sample fattura Sogegross 6934 (475€) spezzata correttamente: 95,24 MATERIE PRIME + 222,70 BEVANDE + 157,24 Non categorizzato.

### File toccati (sessione completa, multi-push)
- Backend: `app/services/conto_economico.py`, `app/routers/controllo_gestione_router.py`, `app/routers/dipendenti.py`, `app/services/auth_service.py` (PIN random — sicurezza)
- Migration: `app/migrations/129_conto_economico_fase_a.py` (mapping aggiornato), `app/migrations/130_normalizza_periodo_riferimento_stipendi.py` (nuovo), `app/migrations/131_riclassifica_tasse_arretrate.py` (nuovo)
- Frontend: `frontend/src/pages/controllo-gestione/ControlloGestioneContoEconomico.jsx` (v1.1: drill-down, % ricavi, deep-link, warning banner), `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx`, `frontend/src/pages/banca/BancaCrossRef.jsx`
- Docs: `docs/roadmap.md` (sezione G.3 Fase E)

### Prossimo
- **G.3 Fase E — Costo personale completo** (sessione dedicata): parser ELAB+F24, nuove tabelle DB, UI upload, refactor `_aggregate_stipendi`, mig retro gen-apr 2026.

---

## SESSIONE 2026-05-16 — M2.4-5 prezzo_unitario + M2.5-arch nav refactor

### Sintesi
Due cambi atomici, stessa sessione.

**M2.4-5 — prezzo_unitario snapshot:** finora `vini_magazzino_movimenti` salvava solo qta+tipo, il ricavo era una stima (qta × prezzo carta attuale, impreciso se il prezzo è cambiato). Da oggi snapshot del prezzo per ogni movimento → ricavo reale, costo acquisto storico, margine effettivo, ricarico %.

**M2.5-arch — ristrutturazione nav Vini:** Marco ha proposto di rinominare "Gestione 2" in "Cantina 2" (è una cantina alternativa, non un modulo generico) e di liberare lo spazio per un nuovo tab dedicato alle entità master (produttori, distributori, denominazioni, vitigni, vini madre), oggi sepolto sotto Impostazioni → "🧪 Anagrafiche (beta)". Promosso a tab di primo livello "📚 Anagrafiche".

### Decisioni M2.5-arch
- **Nome del nuovo tab**: "Anagrafiche" (non "Gestione"). Coerente con backend `/vini/anagrafiche/*`, file `AnagraficheVini.jsx`, modulo `vini_anagrafiche_db.py`, docs `refactor_anagrafiche_vini.md`. Termine standard nel mondo gestionali italiani.
- **Destino del pannello beta**: rimosso da Impostazioni Vini (non sono impostazioni vere e proprie). Vive solo nella nuova tab.
- **Cantina 2**: rinomina solo della label UI ("Gestione 2" → "Cantina 2") e dell'header interno di GestioneVino2.jsx. Path `/vini/v2` e nome file invariati (no rotture su link/routing).
- **Sub-rename UI "Fornitori" → "Distributori"**: vocabolario di osteria. La tabella DB resta `vini_fornitori_v2` (mappa 1:1, no rinomina backend).
- **Approccio operativo**: M2.5-arch fa solo l'ossatura (rename + promozione + spostamento). Le sessioni successive (M2.5.1 Produttori, M2.5.2 Distributori, M2.5.3 Denominazioni, M2.5.4 Vitigni) rilavorano una sotto-tab alla volta.

### Fatto M2.4-5 (prezzo_unitario)
- `app/migrations/129_movimenti_prezzo_unitario.py`: ADD COLUMN `prezzo_unitario REAL` + backfill best-effort (VENDITA→PREZZO_CARTA, CARICO→EURO_LISTINO). Idempotente.
- `app/models/vini_magazzino_db.py`: `registra_movimento()` accetta `prezzo_unitario` con autopop server-side (None → SELECT del prezzo carta/listino).
- `app/routers/vini_magazzino_router.py`: `MovimentoCreate.prezzo_unitario: Optional[float]` + propagazione.
- `app/routers/vini_v2_router.py`: `/madre/{id}/stats` ora usa `COALESCE(m.prezzo_unitario, b.PREZZO_CARTA, 0)`, espone nuovi KPI `qta_acquisti` + `costo_acquisti_totale`. `/madre/{id}/movimenti` espone `prezzo_unitario`.
- `frontend/src/pages/vini/SchedaVino.jsx`: form "Aggiungi movimento" con input `€/bt` autopop (VENDITA→PREZZO_CARTA, CARICO→EURO_LISTINO), editabile. Tabella movimenti con colonne €/bt e Totale.
- `frontend/src/components/vini/SchedaMadreV2.jsx`: tab Movimenti distingue prezzo reale vs stima (asterisco + italic). Tab Statistiche aggiunge riga Acquisti: Bt acquistate, Costo acquisti, Margine lordo, Ricarico %.

### Fatto M2.5-arch (nav refactor)
- `frontend/src/pages/vini/ViniNav.jsx`: rename "Gestione 2" → "Cantina 2"; nuovo tab "📚 Anagrafiche" → `/vini/anagrafiche` (admin/sommelier).
- `frontend/src/pages/vini/v2/GestioneVino2.jsx`: header interno "🧪 Cantina 2".
- `frontend/src/pages/vini/anagrafiche/AnagraficheHub.jsx` (NUOVO): pagina contenitore con ViniNav globale + montaggio AnagraficheVini.
- `frontend/src/pages/vini/AnagraficheVini.jsx`: header rebrand "📚 Anagrafiche Vini" (rimosso "🧪 beta"). Sotto-tab "Fornitori" → "Distributori" (UI only).
- `frontend/src/pages/vini/ViniImpostazioni.jsx`: rimossa voce "🧪 Anagrafiche (beta)" da MENU + dal renderer (import commentato).
- `frontend/src/App.jsx`: lazy import `AnagraficheHub` + Route `/vini/anagrafiche` con `sub="settings"`.
- `frontend/src/config/versions.jsx`: vini 3.28 → 3.29.

### Verifiche
- Sintassi JS: i file editati hanno tutti corpo coerente (no JSX in `.js`, import puliti).
- Routing: nuovo path `/vini/anagrafiche` non collide con path esistenti. ViniNav `current="anagrafiche"` matcha.
- Le link legacy non sono toccate: `/vini/v2` continua a funzionare, `/vini/settings` non ha più la sezione anagrafiche ma il default `import` apre senza errori.

### Fatto SchedaMadreV2 full-frame
- `frontend/src/components/vini/SchedaMadreV2.jsx`: altezza fissa `78vh` sul wrapper interno + `flex-1 overflow-auto min-h-0` sul contenitore tab. Header e TabBar sticky, contenuto tab scrolla internamente. Coerente con SchedaVino classica in modalità inline.

### Fatto M2.5.1 Produttori (CRUD + counts + merge)
- **Backend**: `vini_anagrafiche_db.py` con `list_produttori(with_counts, only_orphans, nazione)` + `count_vini_per_produttore` + `list_madri_per_produttore` + `merge_produttori`. Router con GET arricchito (`?with_counts`, `?with_madri`) + POST `/produttori/{src}/merge?target_id={dst}` (admin, cascade sync).
- **Frontend**: nuovo file `pages/vini/anagrafiche/ProduttoriPanel.jsx`. Sostituisce CrudList generica nella sotto-tab Produttori. KPI riepilogativi (totali + n.orfani), tabella con colonne ordinabili (Nome / Nazione / Regione / Madri / Btg / Giac.), filtri (ricerca + nazione + checkbox "solo orfani"). Click su riga → modale dettaglio con lista vini madre. Modali Edit/Nuovo, modale Merge duplicati con radio destinazione + doppia conferma.
- Versione modulo vini 3.29 → 3.30.

### Verifiche
- `py_compile` OK su `vini_anagrafiche_db.py` + `vini_anagrafiche_router.py`.
- Endpoint compatibili indietro: chi chiamava `/produttori/` senza query param riceve la stessa lista di prima (campi nuovi solo se `with_counts=true`).

### Prossimo
- M2.5.2 — Distributori: stesso pattern + colonna rappresentante + contatti.
- M2.5.3 — Denominazioni: gestione casi extra non in eAmbrosia/MASAF.
- M2.5.4 — Vitigni: aggiunta vitigni custom oltre ai ~60 canonici.

---

## SESSIONE 2026-05-15 (notte) — M2 sessione 1 (Modulo Gestione Vino 2)

### Sintesi
Marco ha proposto di rigirare la strategia post-cutover: invece della UI beta "Anagrafiche" minimale + cutover atomico, vuole **un modulo parallelo completo** (Gestione Vino 2) che legga dalle tabelle `_v2`. Lo prova read-only per qualche settimana, poi se gli piace si fa il cutover. Strategia "Piano B" (4 viste essenziali, no duplicazione di Dashboard/Carta/Calici/Vendite che restano sul modulo classico).

### Decisioni
- **Read-only durante test parallelo**: modifiche solo da Cantina classica (scrive su `vini_magazzino`). Modulo v2 mostra solo `_v2`. Niente sync delta, niente rischio drift.
- **Ambito Piano B**: 4 viste — Cantina v2 (lista + raggruppato per madre), Scheda Vino v2 (anagrafica con campi madre 🔗), Per Produttore v2, Nuovo Vino v2 (wizard 3-step preview-only). Le altre pagine Vini (Dashboard, Carta cliente, Calici, Vendite) restano sul classico.
- **3 sessioni**: 1) backend + nav + Cantina (oggi), 2) Scheda v2 + tab Anagrafica refactor, 3) Per Produttore + Nuovo 3-step + docs/push finale.

### Fatto in sessione 1
- `app/routers/vini_v2_router.py` (~270 righe): 4 endpoint read-only `/vini/v2/bottiglie/`, `/bottiglie/{id}`, `/madri-raggruppate/`, `/dashboard/`. JOIN bottiglia + madre + produttore + fornitore + denominazione. Filtri replica MagazzinoVini.jsx (search, tipologia, produttore, distributore, 4 stati, 4 flag, giacenza, listino).
- `main.py`: import + `_mount(vini_v2_router)`.
- `frontend/src/pages/vini/ViniNav.jsx`: voce "🧪 Gestione 2" (admin/sommelier).
- `frontend/src/App.jsx`: route `/vini/v2/*` con splat per subroute.
- `frontend/src/pages/vini/v2/GestioneVino2.jsx`: entry point con sub-nav 4 viste + banner test parallelo.
- `frontend/src/pages/vini/v2/CantinaV2.jsx` (~450 righe): vista funzionante. Sidebar filtri identica + riepilogo tipologie chip + tabella bottiglie con badge slate-700/sfondo tipologia/chip Flag + toggle Bottiglie/Madri.
- `frontend/src/pages/vini/v2/{PerProduttoreV2,NuovoVinoV2,SchedaVinoV2}.jsx`: placeholder stub.

### Verifiche
- `py_compile` OK su `vini_v2_router.py` + `main.py`.
- Routing: App.jsx ha import GestioneVino2 + Route splat `/vini/v2/*`. ViniNav ha la voce. Zero modifiche a codice esistente del modulo classico.

### Prossimo
- M2.4 SchedaVinoV2 con modal madre
- M2.5 PerProduttoreV2 funzionante
- M2.6 NuovoVinoV2 wizard 3-step preview

---

## SESSIONE 2026-05-15 (sera) — V-H.F STATO_VENDITA INTEGER

### Sintesi
Marco ha chiesto di non avere 6 codici lettera per STATO_VENDITA (eccessivi) — analisi sul DB reale ha confermato: 3 codici (N/T/S) mai usati su 1287 vini, 1 (F) usato 1 volta. Schema ridotto a 4 livelli numerici 0..3 con ordinamento naturale (intensity-ordered).

### Schema finale
| Livello | Nome | Note |
|---|---|---|
| 0 | NON_VENDERE | bloccato in carta |
| 1 | CONTROLLARE | verifica annata/conservazione |
| 2 | VENDERE | default nuovi vini |
| 3 | SPINGERE | promuovere attivamente |

### Mig 128 — rebuild colonna su vini_magazzino + vini_bottiglie_v2
Pattern: ADD COLUMN nuova INTEGER DEFAULT 2 + UPDATE backfill via CASE + DROP COLUMN vecchia + RENAME COLUMN. Backup esplicito pre-mig. Idempotente. Mapping: V→2, C→1, F→3, S→3, T→1, N→0, NULL→2. Testata su copia DB locale: 1287 record → 901 livello 1, 385 livello 2, 1 livello 3.

### Refactor codice
- BE: vini_magazzino_db.py (KPI query, ORDER BY, bulk-fix), vini_magazzino_router.py (Pydantic Optional[int] con ge=0/le=3), vini_xlsx_v2.py (template Excel hint + esempio).
- FE: viniConstants.js (oggetto 4 chiavi numero), SchedaVino.jsx (badge fix per "0" falsy), MagazzinoVini.jsx (filter String() per coerenza int/string), AnagraficheVini.jsx (mostra label).

### File toccati
- `app/migrations/128_stato_vendita_int.py` (NEW)
- `app/migrations/125_refactor_anagrafiche_setup.py` (commento DDL)
- `app/models/vini_magazzino_db.py`
- `app/routers/vini_magazzino_router.py`
- `app/services/vini_xlsx_v2.py`
- `frontend/src/config/viniConstants.js`
- `frontend/src/pages/vini/SchedaVino.jsx`
- `frontend/src/pages/vini/MagazzinoVini.jsx`
- `frontend/src/pages/vini/AnagraficheVini.jsx`
- `docs/modulo_vini.md` §3.5
- `docs/changelog.md`

### Verifiche
- `py_compile` OK su 5 file backend
- Mig 128 testata su copia DB locale + idempotenza verificata
- Distribuzione post-mig: 1 livello 1 (901 record), livello 2 (385), livello 3 (1) — coerente con pre-mig

### Status backlog Vini
- V-H.F (rename STATO_VENDITA): chiuso ✓
- V-H.I (cleanup vini_model.py legacy): pending, basso priority

---

## SESSIONE 2026-05-15 — Discovery dinamica DB

### Sintesi
Marco ha richiesto 3 cose: (1) procedere con V-H.F rename stati Vini, (2) verificare che i DB v2 siano scaricabili localmente post-push, (3) fixare push.sh per scaricare TUTTI i DB della cartella + UI Backup per mostrarli tutti. Fatti i punti 2 e 3 in questo push, V-H.F nel prossimo.

### Risultato P2 (check DB locali)
DB v2 effettivamente scaricati dal push, ma nel path vecchio `app/data/` invece del nuovo `locali/tregobbi/data/`. Conteggi tornano: 1287 bottiglie, 995 madre, 68 vitigni, 1637 denominazioni. Sintomo: push.sh ancora puntato al path legacy.

### Risultato P3 (fix push.sh + backup)
- **push.sh**: `DB_LOCAL`/`DB_REMOTE` cambiati a `locali/$LOCALE/data/`. Lista DB scoperta via SSH una volta sola (`ls *.sqlite3 *.db | grep -vE 'wal|shm|prev|bak'`) e riusata in sanity check + sync + post-deploy. Niente più liste hardcoded.
- **`app/routers/backup_router.py`**: rimossa `DATABASES` hardcoded. `_discover_databases()` scansiona `locale_data_dir()`. `/backup/info` ritorna tutti i DB scoperti → UI Impostazioni→Backup mostra l'elenco completo automaticamente.
- **`scripts/backup_db.sh`**: lista `DBS` scoperta dinamicamente cercando in `$LOCALE_DATA_DIR` poi `$DATA_DIR` (dedup per nome). Cron notturno backuppa automaticamente qualsiasi DB nuovo.

### File toccati
- `push.sh` (DB_LOCAL/REMOTE canonical, discovery DBS via SSH, sanity + post-deploy adattati)
- `app/routers/backup_router.py` (DATA_DIR da locale_data_dir, `_discover_databases()`, usato in download/info/list)
- `scripts/backup_db.sh` (DBS array popolato dinamicamente con dedup)

### Verifiche
- `bash -n` OK su push.sh + backup_db.sh
- `py_compile` OK su backup_router.py
- Test runtime sandbox: discovery scopre i 10 DB attesi (admin_finance, bevande, clienti, dipendenti, notifiche, tasks, vini, vini_magazzino, vini_settings, foodcost.db)

### Prossimo (separato in commit dedicato)
- V-H.F: rename codici STATO_VENDITA lettera → parlanti. Stile G.6 (mig + censimento + refactor backend + frontend).

---

## SESSIONE 2026-05-14 (sera) — Fase 8 opzione C (vista esplorativa annate)

### Sintesi
Marco ha richiesto la Fase 8 "workflow inserimento 3-step", ma ho identificato un'ambiguità di design nel doc canonico: dove vanno scritte le nuove bottiglie? Tre opzioni proposte (A sandbox `_v2`, B dual-write con `ADD COLUMN madre_id` su `vini_magazzino`, C read-only vista esplorativa). Marco ha scelto **C** — test UI senza rischio, decisione su A/B rimandata al post-testing.

### Implementazione Fase 8 (opz. C)
- **Backend**: `list_bottiglie_by_madre(mid)` in `vini_anagrafiche_db.py` + endpoint `GET /vini/anagrafiche/madre/{id}/bottiglie` che ritorna le annate con campi annata-specifici (formato, prezzi, qta, stato, locazioni, vitigni 5 slot). I campi anagrafici esclusi: sono ridondanza sincronizzata, accessibili via GET /madre/{mid}.
- **Frontend**: bottone 🍷 nella riga del MadrePanel (accanto al ✏️ di edit) apre `AnnateModal`. Modal mostra header con info del madre (descrizione, produttore, tipologia, nazione/regione) + riepilogo aggregato (n. bottiglie, pezzi totali, annate disponibili, formati) + tabella read-only con ID, annata, formato, prezzo carta/calice/listino, qta totale, stato vendita+riordino, locazioni. Footer chiarisce: per editare usa Magazzino classico.

### File toccati
- `app/models/vini_anagrafiche_db.py` (+`list_bottiglie_by_madre`)
- `app/routers/vini_anagrafiche_router.py` (+endpoint GET madre/{id}/bottiglie)
- `frontend/src/pages/vini/AnagraficheVini.jsx` (+state viewAnnate, +bottone 🍷, +componente AnnateModal)

### Verifiche
- `py_compile` OK su model+router.
- Frontend logico: state `viewAnnate` + setter + bottone + render + componente AnnateModal in scope, 6 ricorrenze.

### Decisione tecnica
- Fase 8 originale (inserimento 3-step) RIMANDATA. Per ora Marco testa la vista nuova "madre + annate" e valida la migrazione clustering. Quando l'UI è solida, decideremo A o B per il workflow inserimento.

---

---

## SESSIONE 2026-05-14 — Refactor anagrafiche vini (Fase 7) + fix Fase 6

### Sintesi
Sessione di consolidamento. Chiuso il refactor del campo `nazione_origine` sui vitigni (rimosso, fuorviante per vitigni multi-nazione). Poi implementata l'intera Fase 7 del refactor: service `vini_anagrafiche_sync.py` che propaga i campi anagrafici dal `vini_madre_v2` (+ produttori/fornitori/denominazioni) alle bottiglie collegate, agganciato automaticamente ai 4 PATCH del router. Aggiunti endpoint admin `/sync-all` (safety net contro drift) e `/rollback` (drop tabelle `_v2` con backup esplicito e confirm string). Bottone "Risincronizza tutto" nella tab Panoramica dell'UI beta.

### Fase 6 fix — Rimozione `nazione_origine` da vitigni
- Marco ha notato che il seed metteva Gewürztraminer come "Francia" ma è coltivato in Italia/Germania/Alsazia. Estesa l'osservazione a tutti i vitigni multi-nazione (Pinot Nero, Cannonau/Grenache, Primitivo/Zinfandel, ecc.).
- Decisione: rimuovere la colonna. L'info nazione storica eventuale finisce in `note` come testo libero ("Francia (Bordeaux). Coltivato in tutto il mondo").
- Codice aggiornato: `VITIGNI_FIELDS` in models, Pydantic `VitignoBase/Update` senza nazione, `VITIGNO_FIELDS` in `AnagraficheVini.jsx` con placeholder note esplicativo.
- Mig 127 riscritta: tuple `(nome, note)` e INSERT su 2 colonne. 60 vitigni canonici aggiornati con note descrittive.
- Comando SQL one-shot dato a Marco: `ALTER TABLE vini_vitigni_v2 DROP COLUMN nazione_origine;` (eseguito post-push, ok su VPS).

### Fase 7 — Sync runtime + rollback

#### A. Service `app/services/vini_anagrafiche_sync.py` (~230 righe)
- 5 funzioni esposte:
  - `sync_bottiglie_from_madre(mid) -> int` (n righe aggiornate)
  - `sync_bottiglie_from_produttore(pid) -> {n_madre, n_bottiglie}` (cascade)
  - `sync_bottiglie_from_fornitore(fid) -> {n_madre, n_bottiglie}` (cascade)
  - `sync_bottiglie_from_denominazione(did) -> {n_madre, n_bottiglie}` (cascade)
  - `sync_all_bottiglie() -> {n_madre_processati, n_bottiglie_aggiornate, n_orfani_skippati, durata_sec}`
- Una sola query JOIN per madre: `vini_madre_v2 ⨝ produttori_v2 ⟕ fornitori_v2 ⟕ denominazioni_v2`. Fallback intelligenti: `madre.nazione || produttore.nazione`, denominazione_id NULL → `DENOMINAZIONE = NULL`.
- Campi sincronizzati (9): PRODUTTORE, DESCRIZIONE, DENOMINAZIONE, TIPOLOGIA, NAZIONE, REGIONE, DISTRIBUTORE, RAPPRESENTANTE, ABBINAMENTI.
- Campi non toccati: annata-specifici, stati operativi, locazioni/qta, vitigni (5 slot + TEXT legacy).
- Bottiglie orfane (`madre_id IS NULL`) saltate — restano con TEXT free-form originale.

#### B. Aggancio nei 4 PATCH del router
- `PATCH /madre/{id}` → `sync_bottiglie_from_madre(mid)` → return include `_sync: {n_bottiglie}`.
- `PATCH /produttori/{id}` → `sync_bottiglie_from_produttore(pid)` (cascade su tutti i madre).
- `PATCH /fornitori/{id}` → idem.
- `PATCH /denominazioni/{id}` → idem.
- Sostituiti tutti i `TODO Fase 7` con codice vivo.

#### C. Endpoint `POST /vini/anagrafiche/sync-all` (admin)
- Safety net contro drift. Idempotente.
- Esposto via bottone "🔄 Risincronizza tutto" in tab Panoramica di `AnagraficheVini.jsx`, con conferma `window.confirm` e report inline (madre, bottiglie, orfani, durata).

#### D. Endpoint `POST /vini/anagrafiche/rollback?confirm=YES_DROP_V2_TABLES` (admin)
- DISTRUTTIVO: droppa le 6 tabelle `_v2` (bottiglie → madre → vitigni/denominazioni/fornitori/produttori).
- Backup esplicito pre-drop: copia file DB con suffisso `.pre-rollback-<timestamp>`.
- Confirm string obbligatorio (no click accidentali). NESSUN bottone UI: solo via curl admin.
- Use case: finestra rollback fino a 24h dopo lo swap atomico (Fase 10).

### File toccati
- `app/services/vini_anagrafiche_sync.py` (NUOVO)
- `app/routers/vini_anagrafiche_router.py` (4 PATCH aggiornati + 2 endpoint nuovi)
- `app/migrations/127_seed_vitigni_base.py` (tuple e SQL senza nazione_origine)
- `app/models/vini_anagrafiche_db.py` (VITIGNI_FIELDS senza nazione_origine)
- `frontend/src/pages/vini/AnagraficheVini.jsx` (Pydantic-free, panel SyncAll)

### Verifiche smoke test
- `python3 -m py_compile` OK su service, router, mig 127.
- Import `from app.services.vini_anagrafiche_sync` OK — 5 funzioni esposte come previsto.
- `app.utils.locale_data.locale_data_path('vini_magazzino.sqlite3')` risolve correttamente al path locale (assente sul Mac per problema noto push.sh non scarica `_v2`, presente sul VPS).

### Prossimi step
- Marco testa: PATCH madre/produttore/fornitore/denominazione → controlla che le bottiglie collegate riflettano i nuovi valori in real-time.
- Bottone "Risincronizza tutto" come safety net dopo eventuali sessioni di pulizia manuale.
- Fase 8: workflow inserimento nuovo vino 3-step (produttore → madre → bottiglia). Da fare quando le anagrafiche sono state validate dall'uso.

---

## SESSIONE 2026-05-13 — Refactor anagrafiche vini (Fasi 1-4)

### Sintesi
Sessione lunga: progettazione iterativa dello schema del refactor strutturale del modulo Vini (V.6 anagrafiche + V.7 vino madre + V.8 vitigni con %), discusso poco alla volta su richiesta di Marco. Strategia blue-green rinforzata. 4 fasi su 6 completate. Domani si parte da Fase 5 (migrazione dati clustering dei 1287 vini esistenti).

### Decisioni di schema (tutte in `docs/refactor_anagrafiche_vini.md`)
- **6 tabelle nuove** con suffisso `_v2` nello stesso file `vini_magazzino.sqlite3`:
  - `vini_produttori_v2` (cantine, indirizzo validato)
  - `vini_fornitori_v2` (distributori con rappresentante inline come campi `rappresentante_nome/telefono/email`)
  - `vini_denominazioni_v2` (DOC/DOCG/IGT/AOC, codice_eambrosia UNIQUE come chiave naturale)
  - `vini_vitigni_v2` (anagrafica canonica vitigni)
  - `vini_madre_v2` (etichetta stabile, FK a produttori/fornitori/denominazioni)
  - `vini_bottiglie_v2` (ex `vini_magazzino` + `madre_id` + 5 slot vitigno colonna)
- **Decisione chiave**: scartato il "modulo Vini duplicato completo" — la blue-green è già abbastanza sicura, modulo duplicato avrebbe introdotto sync delta movimenti al cutover.
- **Fornitore sul madre** (non sulla bottiglia): 1 vino = 1 distributore.
- **Vitigni come 5 colonne** in `vini_bottiglie_v2` (non tabella di link): più snello, basta per il caso d'uso.
- **Campi anagrafici duplicati e sincronizzati**: la fonte di verità è il madre, ma anche le bottiglie hanno copia coerente (sync via service Python, niente trigger SQLite).
- **API eAmbrosia** trovata e validata: `GET /api/v1/geographical-indications` ritorna ~3995 voci EU. Per le italiane si arricchisce con menzione DOC/DOCG/IGT dai PDF MASAF.

### Fase 1 — Setup impalcatura (mig 125)
- Backup esplicito pre-mig + CREATE TABLE delle 6 tabelle `_v2` + copia 1287 vini da `vini_magazzino` → `vini_bottiglie_v2` (`madre_id` e 5 slot vitigno NULL).
- Verifica: 6 tabelle create in produzione, `vini_bottiglie_v2` con 1287 righe.

### Fase 2 — Backend CRUD anagrafiche
- `app/models/vini_anagrafiche_db.py` (~440 righe): funzioni CRUD per le 5 anagrafiche.
- `app/routers/vini_anagrafiche_router.py`: 26 endpoint REST su prefix `/vini/anagrafiche/`. Admin guard sulle scritture, FK validation su madre, DELETE protetto con 409 se record collegati.
- Mappa nomi tabella centralizzata in costante `TABELLE` per facilitare lo swap finale.
- Router registrato in `main.py`.

### Fase 3 — Seed denominazioni
- `app/services/vini_denominazioni_sync.py` (~280 righe): pipeline fetch eAmbrosia API → parse PDF MASAF italiani → compose con mapping euristico per nazioni non italiane (Francia AOC/IGP, Germania QbA/Landwein, Austria DAC/Landwein, Spagna DO/VdT, Portogallo DOC/Vinho Regional) → upsert su `codice_eambrosia` UNIQUE.
- PDF MASAF copiati in `app/data/seed_denominazioni/` come asset di seed (490KB DOP + 426KB IGP).
- Endpoint admin `POST /vini/anagrafiche/denominazioni/sync?dry_run=true|false`.
- **Risultato**: 1637 denominazioni vino UE inserite. 523 italiane (di cui 505 con DOC/DOCG/IGT dal MASAF), 440 francesi, 149 spagnole, 147 greche, 54 rumene, 54 bulgare, 46 tedesche, 44 portoghesi, ecc.
- **Fix necessari emersi in sessione**:
  - Mig 126: rimosso vincolo `UNIQUE(nazione, nome, tipo)` su `vini_denominazioni_v2` perché eAmbrosia ha 5 casi rumeni con stesso nome+tipo ma codici diversi (es. "Dealu Mare" PDO x4). Chiave naturale corretta = `codice_eambrosia`.
  - Regex `P[DG]O-IT-` corretto a `(?:PDO|PGI)-IT-` (matchava solo DOP, non IGP perché PGI ha P+G+I, non P+G+O).
  - Mapping nazioni esteso con NL/BE/DK/SE/FI/PL/EE/LV/LT/IE.

### Fase 4 — Seed vitigni base (mig 127)
- 60 vitigni canonici: 33 italiani (Nebbiolo, Sangiovese, Glera, Trebbiano, ecc.) + 27 internazionali (Pinot Noir, Cabernet Sauvignon, Chardonnay, Syrah, ecc.).
- Note descrittive su ogni vitigno (es. Cannonau = Grenache, Primitivo = Zinfandel).
- INSERT OR IGNORE su `nome` UNIQUE — idempotente. L'utente può aggiungere altri via CRUD `POST /vini/anagrafiche/vitigni/`.

### Fase 5 — Migrazione dati clustering ✅
- Service `vini_anagrafiche_migrate.py` + endpoint `POST /vini/anagrafiche/migrate-from-legacy?dry_run=true|false`. Pipeline 6 step (produttori → fornitori → denominazioni match → madre clustering → link bottiglie → parser vitigni).
- Fix preferenza canonical naming: non-uppercase prima di uppercase (es. "Camperchi" vs "CAMPERCHI" sceglie il primo).
- **Risultati produzione 2026-05-13**:
  - 350 produttori distinct creati (solo 3 multi-variante banali case-sensitive)
  - 40 fornitori (con rappresentanti inline)
  - 995 vini madre clusterizzati
  - 270 denominazioni linkate automaticamente (exact match) / 725 no_match (compileranno a mano in Fase 6 UI)
  - 1285 bottiglie linkate al madre, 2 orfane (senza produttore)
  - 37 vitigni assegnati su 44 bottiglie con campo VITIGNI valorizzato (campo poco usato da Marco)
- Vitigni non riconosciuti (~13): Clairette, Verdeca, Susumaniello, Vernaccia, Catarratto, Zibibbo, Gewürztraminer, ecc. — da aggiungere all'anagrafica.

### Stato DB post sessione
```
vini_produttori_v2     0    (popolato in Fase 5)
vini_fornitori_v2      0    (popolato in Fase 5)
vini_denominazioni_v2  1637 (sync eAmbrosia + MASAF)
vini_vitigni_v2        60   (seed mig 127)
vini_madre_v2          0    (popolato in Fase 5 via clustering)
vini_bottiglie_v2      1287 (copia da vini_magazzino mig 125, madre_id NULL)
```

### Fasi rimaste (domani / sessioni successive)
- **Fase 5** — Migrazione dati esistenti (PRIORITARIA domani). Algoritmo di clustering: estrae produttori distinct + fornitori + cluster `(produttore, descrizione)` → vini madre + link bottiglie → madre. Parser vitigni TEXT → 5 slot. Endpoint admin `POST /vini/anagrafiche/migrate-from-legacy?dry_run=true|false` con report cluster sospetti.
- **Fase 6** — UI gestione anagrafiche "🧪 beta" in `ViniImpostazioni.jsx` (sub-menu nuovo).
- **Fase 7** — Service `vini_anagrafiche_sync.py` (sync runtime campi ridondanti dal madre alle bottiglie) + endpoint admin rollback rapido.
- **Fase 8** — Workflow nuovo inserimento vino 3-step (Scegli produttore → Scegli madre → Annata).
- **Fase 10** — Cutover atomico (swap tabelle in transazione).

### Note operative
- **Backup automatico DB**: la mig 125 ha già creato `vini_magazzino.sqlite3.pre-mig-125-<ts>` come safety net.
- **Marco superadmin**, login via `POST /auth/login` con `{"username":"marco","password":"5261"}`.
- **Python venv**: `/home/marco/trgb/venv-trgb/bin/python` (non `/venv/`, è `/venv-trgb/`).
- **Path DB**: `locali/tregobbi/data/vini_magazzino.sqlite3` (R6.5 layout).
- **Auth service**: `create_access_token` vive in `app.core.security`, NON in `app.services.auth_service`.
- **Endpoint API**: niente prefix `/api/` (path diretti tipo `https://trgb.tregobbi.it/vini/anagrafiche/stats/`).
- **Push.sh non scarica DB v2 sul Mac**: nota di Marco da indagare in sessione futura (non urgente).

### Memorie persistenti salvate
- `reference_trgb_api_no_prefix.md` — niente `/api/` nelle URL.
- (esistenti, non toccate oggi)

---

## SESSIONE 2026-05-12 — Audit modulo Vini + V-H.A/H/B chiusi

---

## SESSIONE 2026-05-12 — Audit modulo Vini + V-H.A/H/B chiusi

### Sintesi
Sessione di audit profondo del modulo Vini, con piano di hardening tecnico in 8 task (V-H.A..H). Conclusione: V-BUG1 era un falso positivo. Iniziati i lavori di pulizia, restano 5 task tecnici (C, D, G, E, F) prima di poter affrontare la roadmap V prioritaria (V.1, V.2, V.3, V.6, V.7, V.8, V.5).

### Riprogrammazione priorità roadmap V
Marco ha rivisto le priorità della sezione V (Vini) di roadmap.md:
- **Prioritari** (in quest'ordine): V.1 → V.2 → V.3 → V.6 → V.7 → V.8 → V.5
- **Basso**: V.4 (note degustative AI, declassato da ALTA), V.9, V.10, V.11, V.12
- **Da valutare**: V.13-V.18

### V-H.A — Fix bug FORMATO droppato dalla CRUD `[core]`
Il campo `FORMATO` esisteva nel DB e nel FE ma **non era nei Pydantic** `VinoMagazzinoBase`/`VinoMagazzinoUpdate`. FastAPI lo droppava silenziosamente. Aggiunto a entrambi gli schema in `vini_magazzino_router.py:54-57` e `:150`. Bug invisibile da quando esiste il campo. Effort: 2 righe.

### V-H.B — V-BUG1 falso positivo `[doc]`
V-BUG1 in `problemi.md` dichiarava un endpoint `POST /vini/magazzino/import` con FORCE senza admin guard. **Quell'endpoint non esiste**. Verificati uno per uno tutti gli endpoint massivi reali: hanno tutti `_require_admin`/`is_admin`. Voce chiusa in `problemi.md` come falso positivo.

### V-H.H — Allineamento docs `[doc]`
- `modulo_vini.md` §3.5: elenco campi DB completo e categorizzato (anagrafica, prezzi, flag, stati, locazioni, metadati). Era fermo a 26 campi storici, ora i 35 reali.
- `roadmap.md` sezione V: priorità ridefinite. Aggiunta sezione "Hardening tecnico modulo Vini" con i task V-H.A..H. V-DEBT1 marcato obsoleto, V-DEBT2 confermato.
- `problemi.md` V-BUG1: chiuso come falso positivo con verifica endpoint per endpoint.

### V-H.C — Trailing slash uniformati `[doc]`
Censiti tutti gli endpoint backend del modulo Vini con `/` finale dichiarato (5 in `vini_magazzino_router.py`, 3 in `bevande_router.py`) e relative chiamate FE. **Nessun mismatch**: tutte le chiamate FE hanno già lo slash giusto. Verosimilmente effetto positivo della disciplina post-fix Chiusure Turno. Modulo Vini conforme alla regola CLAUDE.md.

### V-H.D — QTA_TOTALE read-only via API + cintura+bretelle DB `[core]`
Audit: Pydantic `VinoMagazzinoBase`/`Update` **non avevano** `QTA_TOTALE` → era già impossibile patcharlo via API (mio audit precedente era impreciso). FE usa `QTA_TOTALE` solo in lettura (display, filtri, sort), mai in payload. Aggiunto `data.pop("QTA_TOTALE", None)` in `update_vino` (`vini_magazzino_db.py:893`) come safety contro chiamate dirette future. Nessuna modifica FE necessaria.

### V-H.G — Soglie configurabili Vini (mig 123 + UI Impostazioni) `[core]`
**12 soglie operative** estratte dal codice e migrate a `vini_widget_settings` (DB `vini_settings.sqlite3`, tabella key/value/tipo/descrizione/updated_at, seed via mig 123). Pattern coerente con `dipendenti_settings` (mig 118). Lavoro completo in un solo commit:

- **Migration 123** — `app/migrations/123_vini_widget_settings.py`. Idempotente (INSERT OR IGNORE). 12 default seedati.
- **Service `vini_widget_settings_service.py`** — single source of truth dei default (importati anche dalla migration), cache process-life invalidabile, helper `calcola_prezzo_calice_default(prezzo_carta)` riusato da 4 punti.
- **Endpoint** in `vini_settings_router.py`: `GET /settings/vini/widget/`, `PUT /settings/vini/widget/` (batch update), `POST /settings/vini/widget/reset` (admin only).
- **Hook FE** `useViniWidgetSettings.js` — cache process-life, expone `get(key, default)`.
- **Refactor consumer**:
  - BE: `vini_metrics.py` (ritmo top/medio), `vini_magazzino_db.py` (vini_fermi 30gg, top_vendute 30gg, qta_suggerita 60gg/2), `vini_magazzino_router.py`+`vini_repository.py`+`vini_pricing_router.py` (prezzo calice via helper)
  - FE: `CaliciDisponibiliCard.jsx` (fresh/alert hours), `DecidiPrezzoCalice.jsx` (soglie warn/block %)
- **UI**: nuova sezione "Widget e soglie" in `ViniImpostazioni.jsx`, raggruppata per area (Calici / Dashboard / Riordino / Ritmo / Prezzo calice). Edit inline + Salva batch + Reset default (admin).

Le 12 soglie sono: `calici_fresh_hours` (12), `calici_alert_hours` (36), `vini_fermi_giorni` (30), `top_vendute_giorni` (30), `qta_suggerita_giorni_storico` (60), `qta_suggerita_divisore` (2), `ritmo_soglia_top` (5), `ritmo_soglia_medio` (1), `decidi_calice_soglia_warn_pct` (40), `decidi_calice_soglia_block_pct` (50), `prezzo_calice_divisore` (5), `prezzo_calice_step_round` (0.5).

### V-H.E — Normalizzazione 4 flag SI/NO → INTEGER 0/1 + eliminazione DISCONTINUATO `[core]`

**Migrazione 124** (single shot atomico, backup esplicito):
- Backup `vini_magazzino.sqlite3.pre-mig-124-YYYYMMDD-HHMMSS` salvato nello stesso path del DB prima di toccarlo (recovery: rinominare).
- Consolidamento `DISCONTINUATO='SI'` → `STATO_RIORDINO='X'` (decisione Marco: i due erano sinonimi semantici, DISCONTINUATO eredità Excel).
- ADD COLUMN `<flag>_INT` per i 4 flag (CARTA, IPRATICO, BIOLOGICO, VENDITA_CALICE).
- Backfill: `'SI'→1`, `'NO'→0`, NULL→NULL/default 0.
- DROP COLUMN delle 4 colonne TEXT vecchie + DISCONTINUATO (richiede SQLite >= 3.35, OK su Python 3.12).
- RENAME COLUMN `<flag>_INT` → nome canonico.
- Idempotente (check tipo PRAGMA all'ingresso). Re-run no-op.

**Refactor backend** (5 file):
- `vini_magazzino_db.py`: schema CREATE TABLE aggiornato (INTEGER), commenti, query SQL `CARTA = 'SI'` → `CARTA = 1`, default `"NO"` → 0, ALTER TABLE DISCONTINUATO rimosso.
- `vini_repository.py`: query WHERE + compare `(r["VENDITA_CALICE"] or "") == "SI"` → `bool(r["VENDITA_CALICE"] or 0)`.
- `vini_magazzino_router.py`: Pydantic `Optional[str]` → `Optional[int]`, default `"NO"` → `0`, rimossa Pydantic DISCONTINUATO, compare, output dict.
- `vini_cantina_tools_router.py`: helper `_yn_to_int` e `_int_to_yn` per import/export Excel (Marco lascia file Excel leggibile con SI/NO, il DB resta INTEGER). DISCONTINUATO param Query deprecato. SELECT senza DISCONTINUATO.
- `vini_router.py`: commenti aggiornati.

**Refactor frontend** (5 file):
- `MagazzinoVini.jsx`: select option `value="1"/"0"`, filtri client-side con `String(v.CARTA ?? "") === sel`, badge tabella `=== 1`, bulk select con coerce Number, rimosso filtro DISCONTINUATO.
- `MagazzinoAdmin.jsx`: colonne grid `options: ["","1","0"]` con `optionLabels` per visual "SI"/"NO", `fSoloCarta` filtro `=== 1`, rimossa colonna DISCONTINUATO.
- `MagazzinoViniNuovo.jsx`: state init `CARTA: 1` etc, save coerce `? 1 : 0`, helper `flagToggle` aggiornato a INTEGER 0/1 con compat retroattiva.
- `SchedaVino.jsx`: FlagBadge `=== 1`, FlagToggle accetta INTEGER 0/1, save senza DISCONTINUATO, FlagToggle "Forza Prezzo" semplificato (era SI/NO→1/0, ora diretto).
- `ViniVendite.jsx`: compare `VENDITA_CALICE === 1` (era `(v.VENDITA_CALICE || "") === "SI"`).

**Da fare in coda (V-H.I):** tabella `vini` legacy (`vini_model.py`) — 3 occorrenze `CARTA='SI'` in staging import Excel. Lascio TEXT perché Marco ha detto di sistemare l'import dopo.

### V-H.J — Import/Export Vini v2 (vecchia logica eliminata) `[core]`

Sostituita la vecchia logica import/export Excel (eredità Excel originale) con un nuovo formato unificato. Decisione Marco: "passato, elimina, ormai mesi che usiamo nuovo sistema".

**Nuovi endpoint** (`vini_cantina_tools_router.py`):
- `GET /vini/cantina-tools/template-v2` → scarica il template `.xlsx` ufficiale
- `POST /vini/cantina-tools/import-v2` → importa dal nuovo formato (skip se ID esiste)
- `GET /vini/cantina-tools/export-v2` → esporta tutti i vini nello stesso formato

**Service `app/services/vini_xlsx_v2.py`** (nuovo, ~450 righe):
- `TEMPLATE_COLUMNS`: schema autoritativo (single source of truth) con tipo + obbligatorio + valori validi per ogni colonna.
- `generate_template_xlsx()`: 4 fogli (Vini, Locazioni dinamiche dal DB locazioni-config, Riferimento valori dinamici, Istruzioni).
- `generate_export_xlsx()`: stesso layout del template, dati popolati con tutti i vini del DB → **round-trip pulito**.
- `parse_import_xlsx()`: valida header, salta righe esempio, gestisce SI/NO → 0/1, INSERT solo se ID vuoto, SKIP se ID esiste, errore di riga se ID inesistente.
- Costanti `TIPOLOGIA_VALIDE`, `FORMATO_VALIDI`, `STATO_VENDITA_VALIDI`, `STATO_RIORDINO_VALIDI`, `STATO_CONSERVAZIONE_VALIDI` promosse qui da `vini_model.py`.

**Chiave d'unicità**: `id` (vini_magazzino.id, auto-increment). Marco: "la chiave per me è l'ID; se esiste non va sovrascritto". Per modificare un vino esistente → scheda gestionale, mai import.

**Eliminato**:
- `POST /vini/cantina-tools/import-excel` → rimosso del tutto
- `GET /vini/cantina-tools/export-excel` → rimosso del tutto
- `app/models/vini_model.py`: `normalize_dataframe`, `init_database`, `clear_vini_table`, `_clean_str` → file ridotto a stub deprecati con `NotImplementedError` (impedisce regressioni silenti se import legacy sopravvive). DB legacy `vini.sqlite3` resta intoccato (V-H.I lo pulirà se vuoto).

**UI Impostazioni Vini → sezione "Import / Export" rifatta**:
- 4 card a griglia 2×2: 📥 Scarica template / 📤 Importa vini / 💾 Esporta tutto / 📖 Guida (in-page con i punti chiave).
- Risultato import dettagliato (inseriti, saltati, errori con riga + motivo).
- Card "⚠ Azione admin: Azzera database cantina" come `<details>` collassato sotto, con doppia conferma (richiede sia "sicuro?" sia "hai fatto export di backup?").

### V.6+V.7+V.8 — Refactor anagrafiche vini (Fase 1: setup impalcatura) `[core]`

Inizio del refactor strutturale grosso. Schema concordato iterativamente con Marco in sessione (vedi `docs/refactor_anagrafiche_vini.md` per il design completo). Strategia: **blue-green rinforzata** (tabelle `_v2` parallele nello stesso file `vini_magazzino.sqlite3`, swap atomico finale, 3 rinforzi: snapshot esplicito, endpoint rollback rapido, UI nuova etichettata "beta").

**Decisione architetturale**: scartato il "modulo Vini duplicato completo" (frontend+backend separati su `/vini-test/...`) perché introduceva sync delta movimenti al cutover senza ridurre la complessità vera del refactor (clustering, sync anagrafiche, parser vitigni).

**Mig 125 (Fase 1)**: backup esplicito pre-mig + CREATE TABLE delle 6 tabelle `_v2` (`vini_produttori_v2`, `vini_fornitori_v2`, `vini_denominazioni_v2`, `vini_vitigni_v2`, `vini_madre_v2`, `vini_bottiglie_v2`) + copia 1287 vini da `vini_magazzino` → `vini_bottiglie_v2`. Le tabelle `_v2` sono pronte ma vuote (eccetto bottiglie). Marco continua a usare il modulo Vini normalmente, nessun impatto sull'utente.

**Prossime fasi pianificate** (file `docs/refactor_anagrafiche_vini.md` §4):
- Fase 2: backend service + endpoint CRUD scheletro `/vini/anagrafiche/...`
- Fase 3: seed denominazioni (eAmbrosia API + parsing PDF MASAF)
- Fase 4: seed vitigni base (~50)
- Fase 5: migrazione dati (clustering produttori → madre → bottiglie + parser vitigni)
- Fase 6: UI gestione anagrafiche (sezione "🧪 beta" in `ViniImpostazioni.jsx`)
- Fase 7: service sync + endpoint rollback rapido
- Fase 8: workflow nuovo inserimento 3-step (produttore → madre → annata)
- Fase 10: cutover atomico (rename tabelle in transazione)

Effort totale stimato: 12-14h distribuite su 3-4 sessioni di sviluppo + 1 di verifica Marco.

### Task di hardening tecnico ancora aperti (per la prossima sessione)
- **V-H.F** Rename STATO_VENDITA codici lettera → parlanti + CHECK constraint (decisione: dopo il refactor anagrafiche per non mescolare 2 refactor strutturali)
- **V-H.I** Cleanup completo file legacy `vini_model.py` (eliminare definitivamente) + valutare se eliminare DB `vini.sqlite3` se vuoto in produzione

### Memoria persistente salvata
- `feedback_soglie_hardcoded.md`: vietato hardcodare soglie operative. Prima di scrivere `const SOGLIA = 12`, fermarsi e proporre `*_settings` + UI Impostazioni.

---

## SESSIONE 2026-05-11 — G.7 + G.8 + 5 bug fix + ripristino dati audit

### Sintesi
Sessione lunga, 4 fasi consecutive:
1. **G.7 Sposta data** chiuso (UX 2-celle + endpoint /uscite/{id}/scadenza esteso + /ripristina-data + chip Spostato)
2. **5 bug operativi** scovati a catena (Chiusure pagina vuota, widget Home double-count, riapri rata UI, filtro Scadenzario, filtri speciali UX)
3. **Bug critico storico**: scoperto che 138 fatture VERIFICARE erano state distrutte da un re-import perché `/uscite/import` non proteggeva quegli stati. Mig 115 di ripristino + fix endpoint.
4. **G.8 — Stato macro/sotto** end-to-end (backend + frontend): tassonomia CHIUSO/APERTO sopra i sotto-stati. Architettura difensiva contro futuri bug di omissione.

### G.7 — UX "Sposta data" + completamento stato SPOSTATO `[core]`
- Backend: `PUT /controllo-gestione/uscite/{id}/scadenza` esteso (auto-setta `SPOSTATO` se data nuova ≠ originale + preserva `data_scadenza_originale` alla prima rinegoziazione). Nuovo endpoint `PUT /controllo-gestione/uscite/{id}/ripristina-data`.
- Frontend `FattureDettaglio.jsx`: card scadenza ridisegnata in 2 sotto-celle ("Scadenza iniziale" read-only + "Programmata" editabile con bottoni "Sposta data"/"Ripristina originale" + badge "spost.").
- Chip "Spostato" aggiunto in `FattureElenco.jsx` (drill-down filtro pagamento) e `ControlloGestioneUscite.jsx` (palette fuchsia).

### Bug 1 — Chiusure Turno: pagina vuota da settimane `[core]`
`ChiusureTurnoLista.jsx` faceva fetch a `${API}/admin/finance/shift-closures?from_date=...` SENZA trailing slash. FastAPI 307 redirect → proxy strippava l'`Authorization` → 401 silente → array vuoto (file usa `fetch()` direct, non `apiFetch()` che gestirebbe il 401). Fix: aggiunto `/` prima del `?` + commento esplicativo.

### Bug 2 — Widget Home "Incasso ieri" double-counting `[core]`
`_incasso_ieri()` in `dashboard_router.py` faceva `SUM(totale_incassi)` su pranzo+cena. Ma nel form Chiusura Turno i campi della CENA sono inseriti come **valori CUMULATIVI giornalieri** (commento UI a riga 591 di `ChiusuraTurno.jsx`: "valori giornalieri — i parziali cena sono calcolati"). Sommare conta due volte il pranzo. Per il 10/05: 1.963 + 2.866 = 4.829 mostrato vs reale 2.866. Fix: `COALESCE(MAX(cena), MAX(pranzo), 0)` invece di SUM. Coerente con `vendite_aggregator.giorni_merged()` riga 89.

### Bug 3 — Riapri rata pagata in modale Piano Rate `[core]`
Marco aveva marcato per errore una rata di FAMIGLIA COTARELLA come pagata, senza modo di riaprirla dalla UI. Aggiunta funzione `riapriRata` + colonna "Azioni" in tabella. Bottone "↺ Riapri" condizionale, esteso poi con prompt nuova data (default 1° mese prossimo) che attiva SPOSTATO automaticamente — semantica coerente con G.7.

### Bug 4 — Scadenzario Uscite: filtro periodo iterato 2 volte `[core]`
Marco voleva vedere la rata Cotarella scaduta a marzo mentre filtra Maggio. Prima tentativo: SCADUTO bypassa filtroDa → troppo permissivo, trascinava archivio 2024. Secondo tentativo: cap 60gg → arbitrario, non rispetta la semantica del filtro. **Rollback definitivo a strict**: il filtro è chiaro per costruzione; se ci sono scaduti vecchi visibili dove non vorresti è perché sono **dati sporchi** (61 SCADUTO pre-2026 da bonificare), non si nasconde il sintomo via UI. Marco mi ha ripreso giustamente: "perché stai facendo caos? quelle fatture non hanno data di scadenza quindi trascini il dubbio?". Lesson learned, memoria salvata.

### Bug 5 — Filtri speciali Scadenzario: ripulizia `[core]`
Mostra escluse: 0 fornitori con `escluso_acquisti=1` in DB → toggle morto, rimosso da UI. Mostra rateizzate: aggiunto count "(45)" + tooltip esplicativo. Solo in pagamento: aggiunto tooltip su quando si popola (post batch). Pulita clausola SQL morta `u.stato <> 'RATEIZZATO'` nel backend post-G.6 (0 hit reali, ridondante con `rateizzata_in_spesa_fissa_id IS NULL`).

### Chip KPI con doppio numero "filtrato / totale" `[core]`
Confusione tra count chip top (filtrato) e sidebar (globale). Implementata opzione B dei mockup: chip mostra `(n_filtrato / n_totale_globale)`. Es: con filtro Mag → "Scaduto € 3.942 (5 / 85)". Quando non c'è filtro periodo, i due numeri coincidono e mostra solo `n`.

### BUG CRITICO storico — /uscite/import distruggeva VERIFICARE/SPOSTATO/RATEIZZATO `[core]`
Marco nota: "0 verificare ma ieri ne avevamo gestite 138". Diagnosi: il branch protetto in `/uscite/import` (riga 534) era `if ex["stato"] in ("PAGATO","PAGATO_MANUALE","PARZIALE")`. Per gli altri stati "decisi dall'utente" (VERIFICARE, SPOSTATO, RATEIZZATO) il re-import sovrascriveva con uno stato calcolato `PROGRAMMATO`/`SCADUTO`. Bug **preesistente** per DA_VERIFICARE, amplificato da G.6/G.7 con i nuovi stati. Le 138 fatture VERIFICARE ripristinate da mig 113 erano state travolte da un re-import successivo. **Mig 115** rifa il ripristino (120 CONTROLLARE + 18 RISTO TEAM → VERIFICARE).

### G.8 — Stato macro/sotto a 2 livelli `[core]`
Architettura difensiva strutturale. Marco ha proposto: 2 livelli, macro (CHIUSO/APERTO) sopra sotto-stato. Implementato come **mig 116** con `cg_uscite.stato_macro` come `GENERATED ALWAYS AS (...) VIRTUAL`: si autocalcola da `stato` ad ogni read, invariante DB-level. Service Python centralizzato `app/services/stati_pagamento.py` (STATI_CHIUSI, STATI_APERTI, is_chiuso, is_aperto, derive_macro). Refactor `/uscite/import` come **whitelist invariante**: `STATI_DERIVATI_DA_DATA = {PROGRAMMATO, SCADUTO}` — solo questi 2 sono ricalcolabili, tutti gli altri (presenti e futuri) sono protetti per costruzione. Mai più un bug di omissione su questa logica. Mirror frontend in `frontend/src/utils/statoPagamento.js` + refactor 5 punti chiave (FattureDettaglio, ControlloGestioneUscite, ControlloGestioneSpeseFisse).

### File modificati
**Backend**
- `app/routers/controllo_gestione_router.py` — endpoint G.7 (scadenza esteso + ripristina-data), refactor /uscite/import whitelist invariante, espone stato_macro in GET /uscite, pulita clausola SQL morta
- `app/routers/dashboard_router.py` — fix double-counting widget Home
- `app/services/stati_pagamento.py` — **nuovo**, costanti+helper centralizzati
- `app/migrations/115_ripristina_verificare_post_g6.py` — **nuovo**, mig ripristino 138 VERIFICARE
- `app/migrations/116_stato_macro_generated.py` — **nuovo**, GENERATED VIRTUAL column + VIEW aggiornata

**Frontend**
- `frontend/src/utils/statoPagamento.js` — **nuovo**, mirror JS del service
- `frontend/src/pages/admin/FattureDettaglio.jsx` — 2-celle scadenza + isChiuso refactor
- `frontend/src/pages/admin/FattureElenco.jsx` — chip Spostato
- `frontend/src/pages/admin/ChiusureTurnoLista.jsx` — trailing slash fix
- `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx` — chip Spostato + chip KPI doppio numero + filtri ripuliti + refactor stato_macro
- `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx` — bottone Riapri rata + isChiuso refactor

**Docs**
- `docs/stato_pagamento_unificato.md` — §12 G.6 + §13 G.7 + §14 G.8 livello macro/sotto
- `docs/roadmap.md` — G.7 ✅ + G.8 ✅
- `docs/changelog.md` — voci dettagliate

### Verifica post-deploy
Su VPS dopo push.sh:
- HTTP 200 OK, backend up, niente errori in log
- `schema_migrations`: 115 applicata alle 14:15, 116 alle 14:37 ✓
- `SELECT COUNT(*) FROM cg_uscite WHERE stato='VERIFICARE'` → **138** ✓ (i 120 CONTROLLARE + 18 RISTO TEAM ripristinati)
- `GROUP BY stato_macro` → APERTO 388 / CHIUSO 1746 ✓ (totale 2134 = 2089 visibili + 45 fatture rateizzate nascoste)

### Lezioni operative salvate in memoria
- **Rename stati richiede verifica semantica**, non solo testuale. Conta gli hit delle clausole post-rename: se 0, la clausola era pensata per un significato che non vale più — segnalare/rimuovere/aggiornare. Salvato in `feedback_rename_semantica.md`.
- **Sessione TRGB si chiude con docs**: a fine sessione aggiornare sessione.md + changelog.md SEMPRE, non aspettare. Marco mi ha definito "bambino genio che si dimentica di allacciarsi le scarpe". Salvato in `feedback_chiudere_sessione.md`.

### Note operative aperte (non urgenti)
- **1291 "Da riconciliare"** nel chip CG Uscite: 1118 fatture + 166 spese fisse + 7 stipendi PAGATO_MANUALE senza match banca. 521 da Fatture in Cloud, 754 senza data_scadenza. Da decidere se filtrare per orizzonte temporale.
- **61 SCADUTO pre-2026** (PREGIS 40, METRO 9, ecc.): dati operativi storici mai aggiornati. Bonifica con audit Excel + mig 117 quando serve. **Marco ha detto "sono già state sistemate, non urgente"**.
- **Discrepanza RT vs canali Chiusura Turno** (€2.143 sul 10/05): chiusura RT 2.686 vs incassi canali 2.866. Non è bug software, è errore di battitura registratore o pre-conti aperti. Da chiarire con chi chiude i turni.
- **FastAPI deprecation warning** in `banca_router.py:2064` (`regex=` → `pattern=`). Non bloccante.
- `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx` — chip Spostato + filtro SCADUTO bypassa filtroDa
- `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx` — bottone Riapri rata
- `docs/stato_pagamento_unificato.md` — §12 G.6 + §13 G.7
- `docs/roadmap.md` — G.7 ✅ FATTO
- `docs/changelog.md` — voci sessione 2026-05-11

### Commit suggeriti
```
[core] G.6+G.7: rename stati al maschile + SPOSTATO + UX Sposta data
[core] Fix Chiusure Turno: trailing slash mancante in ChiusureTurnoLista.jsx
[core] Fix widget Home Incasso ieri: SUM faceva double-count del pranzo
[core] CG Spese Fisse: bottone 'Riapri' nella modale Piano Rate
[core] CG Scadenzario: filtro periodo lascia passare SCADUTO sopra filtroDa
```

### Note operative aperte
- **1291 Da riconciliare**: chip CG Uscite gonfio. 1118 fatture + 166 spese fisse + 7 stipendi, 521 da Fatture in Cloud (`fic_pagato_raw=1`), 754 senza `data_scadenza`. Da rivedere: filtro orizzonte temporale del chip (es. ultimi 24 mesi) per renderlo azionabile.
- **Discrepanza RT vs canali Chiusure Turno**: per 10/05 il delta è € 2.143 (RT 2.686 vs incassi canali 4.829-1.963=2.866). Vale la pena indagare se è errore di battitura sul registratore o se ci sono pre-conti aperti non ancora battuti. Non è bug software.

---

## SESSIONE 2026-05-08 — Fix Home dashboard: 4 query rotte (Vendite, Vini, Ricette, Flussi-cassa)

### Cosa ha mostrato Marco
"In Acquisti vedo `1250 da pagare`, vero? In Vendite `incasso ieri 0`, falso." Marco chiedeva un audit dato per dato di tutte le card dei moduli sulla Home.

### Diagnosi (dataset locale, DB freschi del giorno)
Audit `app/routers/dashboard_router.py` (endpoint `GET /dashboard/home`) — 4 bug nascosti dietro `try/except` silenziosi che cadevano in fallback statico:

1. **Vendite — `_incasso_ieri()`**: cercava `shift_closures` in `foodcost.db`, ma la tabella vive in `admin_finance.sqlite3` (modulo cassa, locale-aware). Eccezione swallowed → IncassoIeri() = zero. Realtà ieri: €1.348 / 21 coperti su 2 turni.
2. **Coperti mese — `_coperti_mese()`**: stesso bug DB sbagliato → 0 falso, mostrato anche dentro la card Controllo Gestione. Realtà: 172 coperti maggio 2026.
3. **Vini — blocco in `_alerts()` e `_moduli_summary()`**: query usavano `attivo` e `scorta_minima` che NON esistono nel DB Tre Gobbi. Le colonne reali sono in MAIUSCOLO (QTA, PREZZO, …). Eccezione → fallback statico "Cantina & Vini". Realtà: 1.238 etichette, 1.261 bottiglie.
4. **Ricette — blocco in `_moduli_summary()`**: cercava tabella `ricette` con `attiva` e `food_cost_pct`. Tabella reale: `recipes` con `is_active`. Niente `food_cost_pct` (calcolo costoso, va via join recipe_ingredients × ingredient_prices). Fallback statico "Gestione Cucina". Realtà: 48 schede, 34 piatti, 5 senza prezzo vendita.
5. **Flussi cassa — blocco in `_moduli_summary()`**: tabella `flussi_cassa` non esiste in nessun DB (mai creata). Fonte vera: `finanza_movimenti` in foodcost.db con colonne `dare`/`avere`/`data` (`dare` già negativo). 2.643 movimenti totali, 23 nel mese corrente.

Caso a parte: **Acquisti `1250 fatture / €588.608`** — dato VERO, ma fuorviante. 1249 su 1250 fatture hanno `stato_pagamento='da_pagare'` (default all'import SDI), solo 1 marcata pagata manualmente. 3 anni di backlog SDI mai aggiornato. Non è bug del codice, è workflow operativo. Lasciato invariato: decisione separata se cambiare semantica del badge.

### Cosa è stato fatto — `[core]`
Modifiche solo a `app/routers/dashboard_router.py` (modulo: platform, dashboard aggregatore generico):
- `_incasso_ieri()`: `sqlite3.connect(locale_data_path("admin_finance.sqlite3"))` invece di `get_foodcost_connection()`. Stessa query.
- `_coperti_mese()`: stesso refit di DB.
- `_alerts()` blocco vini: `PRAGMA table_info(vini)` per detectare dinamicamente le colonne reali (case-insensitive). Se non c'è `qta` o `scorta_minima`, no alert (silenzioso, non errore).
- `_moduli_summary()` blocco vini: stesso pattern dinamico. Conta tutte le etichette + somma `QTA` come "bottiglie in giacenza".
- `_moduli_summary()` blocco ricette: query su `recipes` con breakdown is_base 0/1 + selling_price > 0. Line2: "X piatti · Y senza prezzo" o "X piatti · Y basi". Badge = piatti senza prezzo vendita.
- `_moduli_summary()` blocco flussi-cassa: query su `finanza_movimenti` con `SUM(avere + dare)`. Line2: "+€E / −€U · N mov.".

Nessuna migration DB. Nessun nuovo file. Nessuna dipendenza nuova.

### File modificati
- `app/routers/dashboard_router.py` (5 punti — 4 fix + 1 helper dinamico colonne vini)

### Commit
`[core] fix dashboard Home: 4 query rotte (vendite, vini, ricette, flussi-cassa)`

### Verifica post-deploy
Marco deve fare Ctrl+Shift+R sulla Home e controllare che le 5 card mostrino numeri reali (vedi tabella in changelog). Se restano statiche, problema di cache CDN/browser (pulire/forzare reload).

### Note operative aperte
- **Acquisti `1250 fatture`**: workflow da decidere — o marca pagate, o cambia semantica badge a "ultimi 30/60gg".
- **Saldo Flussi cassa "tutto uscite"**: `finanza_movimenti` contiene solo movimenti banca, non corrispettivi. Per saldo "vero" (incassi netti − uscite) servirebbe unire shift_closures + finanza_movimenti. Fix successivo se serve.
- **Coperti maggio 2025 = 0**: dato storico mancante (modulo cassa post-2025), non bug.

---

## SESSIONE 2026-05-07 (II) — Fix falsi positivi `lkg_corrupt` da race check vs backup orario

### Cosa ha mostrato Marco
Dopo il push del fix UI backup (parser timestamp duale), la pagina mostrava correttamente l'ultimo backup di ~1h fa con dimensione 34.93 MB. Però appariva un nuovo problema: il riquadro era passato da rosso ("88 ore") a rosso diverso ("PROBLEMI RILEVATI") con `Issues attive (3): lkg_corrupt:foodcost.db / vini.sqlite3 / clienti.sqlite3`. Contraddizione interna: le 4 card sopra mostravano tutto verde, "Last known good 15/15 integri".

### Diagnosi
- L'endpoint `/system/backup-health` (Python) apre i file LKG con `sqlite3.connect("file:...?mode=ro", uri=True)` → read-only puro → 15/15 ok.
- Lo script `check_backup_health.sh` (bash, cron `*/30`) apriva i file LKG con `sqlite3 "$f" "PRAGMA integrity_check"` → modalità RW default. Su un file con `journal_mode=WAL` ereditato dal source, SQLite crea `<db>-shm` e `<db>-wal` accanto. Visto già nell'output `=== 7. LKG ===` precedente: i `-shm`/`-wal` avevano mtime alle `19:50` (da check), mentre i `.sqlite3` avevano mtime alle `19:00` (da backup orario).
- Confronto fra il log delle 19:30 (`OK: 10/10`) e quello delle 20:00 (`Corrotti: 3`): il check ha trovato corrupt **esattamente al minuto :00**, in concomitanza con il cron del backup orario. La causa è una race tra `cp -f` di `update_lkg()` (non atomico — `clienti.sqlite3` da 25 MB richiede centinaia di ms) e `sqlite3 integrity_check` del check. I 3 DB sospetti erano i 3 più grandi e più scritti (foodcost 7 MB, vini 0.8 MB ma write-heavy, clienti 25 MB).
- Conferma: test manuale fuori finestra cron (`sqlite3 PRAGMA integrity_check` su tutti e 3, sia RW che read-only) → tutti `ok`.

### Cosa è stato fatto — `[core]`

**A. `scripts/check_backup_health.sh` v1.1**
- Estratto `check_lkg_integrity()` come helper.
- `sqlite3 -readonly "$f"` invece di `sqlite3 "$f"` → no creazione di `-shm`/`-wal` accidentali.
- Retry-once dopo 3 secondi se la prima passata non ritorna `ok`. Tre secondi sono sufficienti perché `cp -f` di un DB da 25 MB su disco SSD finisca. Se anche il retry fallisce → corruption reale, segnaliamo.
- Aggiornato docstring con nota sulla v1.1 e cambio di cron suggerito (`15,45 * * * *`).

**B. `scripts/backup_db.sh::update_lkg()`**
- Dopo `cp -f`, `rm -f` su `<db>-shm` e `<db>-wal` orfani. Pulizia idempotente, non rompe nulla se non presenti.
- Motivo: ripulire i residui esistenti (creati dai check pre-A) e blindare contro tool esterni futuri che aprissero la LKG in RW.

**C. NON modificato** `setup-backup-and-security.sh`: è uno scaffold del first-time setup che ha solo 2 cron base (hourly + daily 03:30), mentre la crontab reale del VPS ha 4 job (orario, daily 03:00, daily 18:00, health check). Quel file è già fuori sync, sistemarlo qui sarebbe fuori scope. La crontab del VPS va aggiornata a mano (vedi punto sotto).

### Da fare manualmente sul VPS dopo il push
Sfasare il cron del check da `*/30` a `15,45` per non sovrapporsi mai ai cron di backup (`0 * * * *` orario, `0 3,18 * * *` daily):
```
crontab -e
```
Cambiare la riga:
```
*/30 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh ...
```
in:
```
15,45 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh ...
```
Anche senza questo cambio, il fix A (readonly + retry) dovrebbe già azzerare i falsi positivi, ma la sfasatura è cintura+bretelle.

### File modificati
- `scripts/check_backup_health.sh` (helper + readonly + retry + docstring)
- `scripts/backup_db.sh` (cleanup -shm/-wal in update_lkg)
- `VERSION` (5.13 → 5.14)
- `frontend/src/config/versions.jsx` (sistema 5.13 → 5.14)
- `docs/changelog.md` (entry "2026-05-07 (II)")
- `docs/sessione.md` (questa sezione)

### File NON modificati
- `app/routers/backup_router.py` — già fixato nel push precedente
- `setup-backup-and-security.sh` — scaffold obsoleto, fuori scope
- `main.py::system_backup_health` — già usa read-only correttamente

### Verifica suggerita post-deploy
1. Aspettare il prossimo run del check (ogni :15 e :45 dopo aver sfasato il cron, o ogni :00 e :30 se non sfasato).
2. Hard refresh `/impostazioni/sistema?tab=backup`.
3. Box deve diventare verde "SISTEMA SANO" e restare tale anche al run successivo.
4. Sul VPS: `cat /home/marco/trgb/trgb/app/data/backups/.last_health_status.json` → `"status":"healthy"`, `"issues":[]`.
5. Sul VPS: `ls /home/marco/trgb/trgb/app/data/backups/last_known_good/*-shm /home/marco/trgb/trgb/app/data/backups/last_known_good/*-wal 2>&1` → dopo il prossimo backup orario non ci devono più essere file `-shm`/`-wal` (rm -f li ha puliti, e con readonly nessuno li ricrea).

### Commit suggerito
`./push.sh "[core] Fix falsi positivi lkg_corrupt: sqlite3 -readonly + retry nel check + cleanup -shm/-wal"`

---

## SESSIONE 2026-05-07 — Fix UI Backup: parser timestamp dual-format + DATABASES allineato

### Cosa ha chiesto Marco
Marco ha aperto la pagina "Impostazioni → Backup" e ha visto due segnali in contraddizione: il box verde "SISTEMA SANO" diceva backup orario 50 min fa / daily 1h fa / Drive sync 1h fa / LKG 15/15 integri, mentre subito sotto un box rosso urlava "Ultimo backup di 88 ore fa — verifica il cron". Domanda: tutto a posto o devo preoccuparmi?

### Diagnosi
Diagnosi remota via `ssh trgb`:
- **Crontab**: tutti e 4 i job attivi (orario, daily 03:00, daily 18:00, health check ogni 30 min). OK.
- **Script `backup_db.sh`**: versione v2 post-incidente (commit `aefc9b73`), eseguibile, ultimo run hourly del 7 mag 19:00 con 15 OK / 0 falliti.
- **Cartelle daily reali sul VPS**: 14 cartelle, l'ultima `20260507180001` di 1h fa. Backup giornalieri **regolari**.
- **Dati LKG**: tutti i 10 DB + 5 JSON config aggiornati al 7 mag 19:00.
- **Drive sync**: OK al 7 mag 18:00 (DB + LKG + runbook).

Quindi il sistema di backup era ed è perfettamente sano. Bug nella UI:
- Le cartelle daily nuove (dal 5 mag) hanno il formato `YYYYMMDDHHMMSS` (14 cifre, da `date +%Y%m%d%H%M%S` dello script v2).
- Le 3 cartelle storiche del 2/3/4 mag hanno il vecchio formato `YYYYMMDD_HHMMSS` (con underscore).
- `app/routers/backup_router.py::_parse_folder_timestamp` parsava SOLO il vecchio formato → ignorava 11 cartelle nuove → "ultimo backup" interpretato come 4 mag 03:30 → allarme 88h.
- Le dimensioni "0.03 MB" mostrate per il 3-4 mag erano probabilmente rumore: il parser non riconosceva le cartelle nuove e si limitava a misurare residui orfani.

### Cosa è stato fatto — `[core]`
- **`backup_router.py::_parse_folder_timestamp`** riscritta per accettare entrambi i formati. Tenta prima il nuovo (`%Y%m%d%H%M%S`, 14 cifre, `isdigit()`) per evitare il costo dell'eccezione sul caso comune; in fallback prova il vecchio (`%Y%m%d_%H%M%S`, 15 char con underscore in posizione 8). Tutto il resto respinto. Test su nomi reali del VPS: 14/14 OK.
- **`DATABASES` allineata a `scripts/backup_db.sh::DBS`**: aggiunti `notifiche.sqlite3`, `tasks.sqlite3`, `bevande.sqlite3` che il cron già copiava ma che mancavano nel download on-demand `/backup/download`. Ordine concettuale (foodcost → finance → vini → tenant DB) coerente con lo script.
- Aggiornati commenti/docstring del router per documentare i due formati timestamp e la motivazione della modifica.
- Bumpato `VERSION` 5.12 → 5.13 e allineato `versions.jsx` `sistema.version` (era rimasto indietro a 5.11 dalla sessione precedente — fix dell'allineamento approfittando del bump).

### File modificati
- `app/routers/backup_router.py` (parser duale + DATABASES + commenti)
- `VERSION` (5.12 → 5.13)
- `frontend/src/config/versions.jsx` (`sistema: 5.11 → 5.13`)
- `docs/changelog.md` (entry 2026-05-07)
- `docs/sessione.md` (questa sezione)

### File NON modificati (volutamente)
- `scripts/backup_db.sh` — la v2 sul VPS è già corretta, è il client (router) che leggeva male.
- `frontend/src/pages/admin/ImpostazioniSistema.jsx` — il `TabBackup` legge gli endpoint `/backup/info` + `/backup/list` + `/system/backup-health` invariati; basta che il backend ritorni dati giusti, niente da toccare lato React.

### Verifica suggerita post-deploy
1. Hard refresh `/impostazioni/sistema?tab=backup` (Ctrl+Shift+R).
2. Box rosso "Ultimo backup di X ore fa" deve sparire (l'età deve risultare ~1h o meno, non più 88h).
3. La sezione "Backup giornalieri sul server" deve mostrare ~14 cartelle con dimensioni realistiche (~30-35 MB ciascuna, non 0.03 MB).
4. Cliccare "Scarica backup completo": il `.tar.gz` deve contenere ora 10 DB (non 7) — verificabile con `tar tzf trgb-backup-*.tar.gz | wc -l`.
5. Il box verde "SISTEMA SANO" deve restare verde (legge `/system/backup-health`, non toccato).

### Commit suggerito
`./push.sh "[core] Fix UI Backup: parser timestamp dual-format + DATABASES allineato (10 DB)"`

---

## SESSIONE 2026-05-04 — Selezioni: 5a zona Piatti del giorno + categoria madre paese formaggi + widget salumi mostra prodotti

### Cosa ha chiesto Marco
1. Aggiungere sezione "Piatti del giorno" dentro Selezioni (separata, ma 5a tab della pagina).
2. Nel widget Salumi della Home mostrare i nomi dei prodotti, non i totali per categoria.
3. Nei Formaggi aggiungere "Formaggi Italiani" e "Formaggi Francesi" come categoria madre, dentro le quali stanno le categorie figlie esistenti (Vaccino, Caprino, Ovino, Misto).

### Cosa è stato fatto

#### A) Piatti del Giorno (5a zona di Selezioni) — `[mixed]`
- **mig 107** crea `piatti_giorno`, `piatti_giorno_categorie`, `piatti_giorno_config` (pattern salumi). Seed 6 categorie generiche: Antipasto / Primo / Secondo / Contorno / Dolce / Speciale.
- **router** `app/routers/piatti_giorno_router.py` — CRUD + categorie + config (gemello di `scelta_salumi_router.py`). Prefix `/piatti-giorno/`. Stato attivo/archivio.
- **main.py** importa e monta il router via `_mount("piatti_giorno_router", piatti_giorno_router)`. Backward-compat: nessun module.json esplicito → loader default-attivo.
- **frontend** `zonaConfig.js` aggiunge zona `"piatti-giorno"` con icona 🍽️, accent verde-emerald, `showPesoPrezzo: true` (override esplicito perché stato="attivo" ma il prezzo serve), descrizione textarea. `ZONA_ORDER` esteso da 4 a 5 zone.
- **`SelezioniDelGiorno.jsx`** non tocca nulla: la sidebar legge `ZONA_ORDER` e `ZONA_CONFIG` → la 5a tab compare automaticamente. Stesso `ZonaPanel` riusato.

#### B) Widget Salumi/Formaggi mostra prodotti — `[core]`
- **`SelezioniCard.jsx` v1.1**: per zone `stato === "attivo"` (Salumi, Formaggi) il mini-blocco appiattisce `categorie[].tagli[]` e mostra i primi 3 NOMI dei prodotti. Per zone `stato === "venduto"` (Macellaio, Pescato) resta la preview categoria + count come prima (perché ce ne sono tanti per categoria, l'aggregato ha più senso).
- Niente modifiche backend: `dashboard_router._salumi_widget` e `_formaggi_widget` già passano 2 tagli per categoria → il widget Home ne mostra 3 totali appiattendo, OK.

#### C) Categoria madre paese sui Formaggi — `[core]`
- **mig 107** ALTER TABLE `formaggi_tagli` ADD COLUMN `paese` TEXT (idempotente, NULL ammesso). Indice `idx_formaggi_paese`.
- **`scelta_formaggi_router.py`**: aggiunto `paese` in `TaglioIn`/`TaglioOut`. Helper `_has_paese_column()` per detect a runtime (pattern preventivo dal feedback "schema_drift_legacy_columns" in memoria). INSERT/UPDATE branchano in base alla colonna presente, fallback graceful se mig 107 non ancora applicata.
- **`zonaConfig.js`** formaggi: nuovo campo extra `paese` come SELECT (Italia 🇮🇹, Francia 🇫🇷, Altro), e `raggruppaPer: { campo: "paese", label: "Paese", emojiMap }`.
- **`ZonaPanel.jsx`**:
  - supporto generico per `campiExtra[].options` → renderizza `<select>` invece di `<input>`.
  - supporto generico per `cfg.raggruppaPer` → la tabella raggruppa le righe per il campo indicato, con header di gruppo (es. "🇮🇹 Italia · 5"). Ordering: prima i valori noti dell'emojiMap, poi gli altri alfabetici, infine "Senza paese" alla fine.
  - supporto generico per `cfg.showPesoPrezzo` come override esplicito.

### File creati
- `app/migrations/107_piatti_giorno_e_formaggi_paese.py` (3 tabelle nuove + 1 ADD COLUMN, idempotente)
- `app/routers/piatti_giorno_router.py` (~365 righe, gemello di scelta_salumi_router)

### File modificati
- `main.py` — import + `_mount` del nuovo router piatti_giorno
- `app/routers/scelta_formaggi_router.py` — campo paese + INSERT/UPDATE branchati
- `frontend/src/pages/selezioni/zonaConfig.js` — 5a zona + select paese formaggi + raggruppaPer
- `frontend/src/pages/selezioni/ZonaPanel.jsx` — supporto select / raggruppamento / showPesoPrezzo override
- `frontend/src/components/widgets/SelezioniCard.jsx` — preview prodotti per zone "attivo"
- `frontend/src/config/versions.jsx` — `selezioni: 1.0 → 1.1`
- `VERSION` — `5.11 → 5.12`

### Verifica suggerita post-deploy
1. `/selezioni/piatti-giorno` mostra la 5a tab con CRUD funzionante (creare 1 piatto di test, archiviarlo, riattivarlo).
2. Widget Selezioni in Home: mini-blocco Salumi e Formaggi mostrano i nomi dei prodotti, non più "Insaccati · 5".
3. `/selezioni/formaggi` mostra il dropdown Paese nel form di creazione/modifica. Tabella raggruppata per "🇮🇹 Italia" / "🇫🇷 Francia" / "Senza Paese" finché Marco non assegna i paesi ai formaggi esistenti.

### Cose volutamente NON fatte (rinviate)
- Integrazione "Piatti del giorno" altrove (Home widget, modulo Cucina, menu carta) — Marco ha detto "ti spiegherò il passo successivo dopo".
- Aggiornamento `_salumi_widget` / `_formaggi_widget` per portare più di 2 tagli per categoria: il widget Home ne mostra 3 appiattendo da più categorie, sufficiente in pratica.
- Modifica delle categorie salumi/formaggi figlie esistenti: restano "Vaccino", "Caprino" ecc. condivise tra i due paesi (Marco: "le categorie di prima esistenti vanno bene").

---

## SESSIONE R8b + R8c (2026-05-02 nottata) — Module loader backend + filtro menu frontend

### Cosa è stato fatto
- **R8b backend**: nuovo modulo `app/platform/module_loader.py` (221 righe). Legge `locali/<TRGB_LOCALE>/moduli_attivi.json` + i 14 `core/moduli/<id>/module.json` per costruire la mappa `router_file → module_id` (46 router classificati). Espone `is_router_active()`, `is_module_active()`, `get_module_info()`, `boot_banner()`. Default backward-compat assoluta: `"*"` o file mancante → tutti attivi. Cache via `lru_cache`.
- **main.py integrato**: 47 `app.include_router(...)` wrappati in helper `_mount(router_file, router, **kwargs)` che fa il check del loader. Banner finale al boot stampa moduli attivi + eventuali skip. Endpoint nuovo `GET /system/modules` per esporre lo stato al frontend.
- **R8c frontend**: nuovo `frontend/src/utils/activeModules.js` (139 righe). Pattern speculare a `localeStrings.js`: load al boot in `main.jsx` (parallelo a brand+strings), cache, hook `useActiveModules()`. Esporta `isMenuKeyActive()`, `isModuleActive()`, `filterMenuByActive()`.
- **Header.jsx + Home.jsx aggiornati**: filtro `MODULES_MENU` (Header dropdown navigazione + Home grid moduli) per `isMenuKeyActive(k)`. Su tregobbi (wildcard "*") = no-op visivo, niente cambia.
- **Mismatch chiavi risolti**: `cassa.module.json` `frontend_menu_key: "cassa"→"vendite"` (allineato a MODULES_MENU.vendite), `task_manager.module.json` `"task_manager"→"tasks"` (allineato a MODULES_MENU.tasks).
- **`/system/modules` espone** anche `frontend_menu_keys` (lista chiavi MODULES_MENU dei moduli attivi) per filtro facile lato FE.
- **TabHomeActions.jsx NON filtrato**: pannello admin per config azioni rapide deve mostrare tutte le route esistenti (anche di moduli temporaneamente disattivati) per non perdere config.

### File creati
- `app/platform/__init__.py` (1 riga)
- `app/platform/module_loader.py` (221 righe)
- `frontend/src/utils/activeModules.js` (139 righe)

### File modificati
- `main.py`: import loader, helper `_mount`, 47 include sostituite con `_mount(...)`, endpoint `/system/modules`, banner boot
- `core/moduli/cassa/module.json`: frontend_menu_key
- `core/moduli/task_manager/module.json`: frontend_menu_key
- `frontend/src/main.jsx`: import + load `loadActiveModules()` in parallelo
- `frontend/src/components/Header.jsx`: hook `useActiveModules()` + filtro `visibleKeys`
- `frontend/src/pages/Home.jsx`: hook + filtro `visibleModules`

### Verifica
- `python -m compileall app/platform main.py` → OK
- `node --check frontend/src/utils/activeModules.js` → OK
- Test loader con `TRGB_LOCALE=tregobbi`: 14 moduli attivi (wildcard), 46/46 router montati, `frontend_menu_keys` espone le 13 chiavi MODULES_MENU del FE.
- Test loader con `TRGB_LOCALE=test_demo` + `{"moduli": ["vini","cassa"]}`: 18/46 router montati (vini 7 + cassa 3 + platform 8), banca/ricette/tasks/etc DISATTIVATI.

### Backward-compat assoluta su tregobbi
- moduli_attivi.json ha `"*"` → tutti attivi → comportamento IDENTICO a pre-R8.
- `is_router_active()` su nome non mappato → True (default safe).
- Frontend: se `/system/modules` non risponde → fallback wildcard, niente filtro applicato, tutto visibile.

### Punti di attenzione (non bloccanti)
- 4 moduli backend (`banca`, `controllo_gestione`, `menu_carta`, `cucina`) hanno `frontend_menu_key` impostato ma NON c'è una chiave corrispondente in MODULES_MENU oggi. Le voci di questi moduli vivono come sub-menu di altri (ricette/vendite/...) o sono raggiungibili solo via URL. Quando in futuro si aggiungono chiavi top-level in `modulesMenu.js`, il filtro le riconosce automaticamente.
- `TabHomeActions.jsx` mostra tutte le route, anche di moduli disattivi (volutamente — pannello admin di config).

### Suggested commit
`./push.sh "[core] R8b+R8c — module loader backend (app/platform/module_loader.py) + endpoint /system/modules + filtro menu frontend (useActiveModules hook). Default wildcard, no behavior change su tregobbi. Test demo locale [vini,cassa]: 18/46 router montati."`

---

## SESSIONE R8a (2026-05-02) — Manifesti moduli dichiarativi (zero rischio runtime)

### Cosa è stato fatto
- Creati 13 `core/moduli/<id>/module.json` (uno per modulo vendibile) + 1 `core/moduli/platform/module.json` per i servizi infrastrutturali sempre attivi.
- Mappati i 46 router esistenti ai 13 moduli + platform: vini (7 router), ricette (8), acquisti (4), controllo_gestione (1), banca (1), dipendenti (3), prenotazioni (3), clienti (1), cassa (3), menu_carta (3), cucina (1), task_manager (2), statistiche (1), platform (8).
- Creato `locali/tregobbi/moduli_attivi.json` = `{"moduli": ["*"]}` (wildcard backward-compat).
- Creato `locali/trgb/moduli_attivi.json` = idem (demo completa).
- Creato `locali/_template/moduli_attivi.json.template` con documentazione inline (lista moduli disponibili + 3 esempi configurazione).

### File modificati / creati
- nuovi: `core/moduli/{vini,ricette,acquisti,controllo_gestione,banca,dipendenti,prenotazioni,clienti,cassa,menu_carta,cucina,task_manager,statistiche,platform}/module.json` (14 file)
- nuovi: `locali/{tregobbi,trgb}/moduli_attivi.json`, `locali/_template/moduli_attivi.json.template`

### Schema module.json
Ogni manifesto contiene: `id`, `nome` (UI), `versione`, `descrizione`, `vendibile` (bool), `dipendenze_platform` (lista mattoni M.A-M.I), `dipendenze_opzionali` (altri moduli che potenziano questo), `router_files` (lista file in `app/routers/`), `endpoint_prefix` (lista prefissi FastAPI), `tabelle_db` (lista tabelle SQL), `frontend_route` (lista route), `frontend_menu_key` (chiave in `modulesMenu.js`).

Per `platform`: in più `always_active: true` e mappa stato `mattoni` (M.A...M.I).

### Verifica
- Nessuno legge questi file ancora → zero impatto runtime → backend del ristorante intoccato. Sicuro anche di sabato sera.
- I file servono come contratto per R8b (backend module_loader) e R8c (frontend filter menu).

### Cosa NON ho fatto (R8b/R8c)
- Backend: `app/platform/module_loader.py` da scrivere in R8b. Oggi `main.py` continua a montare i 46 router come sempre.
- Frontend: filtro menu da scrivere in R8c. Oggi `modulesMenu.js` mostra tutto come sempre.

### Suggested commit
`./push.sh "[core] R8a — manifesti dichiarativi 13 moduli vendibili + platform (core/moduli/<id>/module.json) + moduli_attivi.json per locale (tregobbi/trgb='*' backward-compat) + template documentato. Nessun cambio runtime, scaffold per R8b loader."`

---

## SESSIONE R6.5 push 1 (2026-05-02) — Path tenant-aware su tutti i DB SQLite

### Cosa è stato fatto
- Applicato `app/utils/locale_data.locale_data_path()` a tutti i 10 DB SQLite operativi (sorpresa: 10, non 9 — `vini.sqlite3` ancora attivo via `vini_model.py`, `dashboard_router.py`, `alert_engine.py`).
- I file DB restano fisicamente in `app/data/` (push 2 li sposta).
- Zero behavior change su tregobbi: l'helper trova i DB nel legacy path `app/data/` via fallback storico.
- Disciplina forzata: ogni modulo pre-R8 punta al locale corrente via `TRGB_LOCALE` env (default `tregobbi`).

### File modificati (~52)
**Modelli (8):** `foodcost_db`, `vini_magazzino_db`, `settings_db`, `notifiche_db`, `tasks_db`, `bevande_db`, `clienti_db`, `dipendenti_db`.
**Core (1):** `core/database.py` (MAIN_DB_PATH + SETTINGS_DB_PATH).
**Migration runner:** `migration_runner.py` (CRITICO — punto di ingresso al boot).
**Router (~12):** `banca_router`, `fe_import`, `fe_categorie_router`, `fe_proforme_router`, `fattureincloud_router`, `controllo_gestione_router`, `admin_finance` (FOODCOST_DB_PATH), `chiusure_turno`, `dipendenti` (cross-DB foodcost queries), `ipratico_products_router`, `menu_carta_router` (TASKS_DB), `dashboard_router` (vini.sqlite3 in 2 punti).
**Servizi (4):** `corrispettivi_export`, `corrispettivi_import` (DB_PATH importato anche da admin_finance), `vendite_aggregator`, `alert_engine`.
**Migrazioni (22):** 050, 068, 070-073, 075-088, 090, 096, 097.
- Escluse: 057 (CSV output), 060 (self-aware via PRAGMA database_list), 064 (bug originale `.db` no-op safe), 089/095/101 (solo docstring, usano modelli già aggiornati).
**Config locale (2):** `auth_service.py` (USERS_FILE), `closures_config_router.py` (CONFIG_FILE).
**TODO inline:** 9 tools/scripts one-shot + 4 cartelle uploads/backups (app/data/uploads, ipratico_uploads, documenti_dipendenti, backups) — fuori scope R6.5, marcati per Modulo K-bis post-R6.5.

### Verifica
- `python -m compileall` su `app/{models,core,migrations,routers,services,utils}` → zero errori sintassi.
- Smoke test import: tutti i path si risolvono correttamente. Sul VPS dove i DB esistono in `app/data/`, il fallback storico li trova → zero behavior change.
- Grep finale `app/data/X.sqlite3|.db|.json`: zero match in codice eseguibile (solo docstring storiche e bug noto migrazione 064).

### Note tecniche
- `vini.sqlite3` è ancora attivo (era stato erroneamente censito come 9 DB nel piano §3 R6.5; sono 10): aggiornata tabella §6.
- `settings_db.py` e `core/database.py` puntavano entrambi a `vini_settings.sqlite3` con costanti diverse — ora entrambi via `locale_data_path()`, stesso file. Riconciliazione implicita.
- `cucina_db.py` non toccato: è solo alias di `get_foodcost_connection()` (Fase 0 split).
- Migrazione 064 mantiene il bug `dipendenti.db` (non esiste, no-op safe). Migrazione 060 è già self-aware via PRAGMA.

### Push 2 (separato, prossimo)
Spostamento fisico file DB da `app/data/` a `locali/tregobbi/data/` sul VPS, sotto `[locale:tregobbi]`. Zero downtime: l'helper è già pronto per entrambi i path (lookup #1 tenant → fallback #2 legacy).

### Suggested commit
`./push.sh "[core] R6.5 push 1 — locale_data_path() su 10 DB SQLite (modelli + core + migration_runner + router + servizi + 22 migrazioni + users.json + closures_config.json)"`

---

## SESSIONE R7 (2026-05-02) — Chiusura prima fase refactor monorepo

### Cosa è stato fatto
- Push R7: scaffold `locali/_template/` completo (assets/data/seeds con `.gitkeep`) + `docs/architettura_locale.md` (doc canonico multi-tenant) + sync stato §6 `refactor_monorepo.md` + `roadmap.md` §0 + fix logo gobbette SVG su `deploy/sites/trgb.it/index.html`
- Fix `.git/index.lock` orfano (processo git precedente crashato)
- Rimossi `trgb_reel.mp4` e `trgb_reel_v2.mp4` (file temporanei altro agente)

### File modificati
- `docs/architettura_locale.md` (NUOVO — doc canonico)
- `locali/_template/assets|data|seeds/.gitkeep` (NUOVI — scaffold)
- `locali/_template/branding|locale|strings|deploy/env.production.template` (NUOVI)
- `docs/refactor_monorepo.md` (§6 stato R7 aggiornato con hash `936a5e6`)
- `docs/roadmap.md` (§0 stato R7 ✅ FATTO)
- `deploy/sites/trgb.it/index.html` (gobbette SVG path reali + rimosso link prototipo)

### Verifica post-push
- HTTP probe `trgb.tregobbi.it` → 405 (backend vivo, 136ms)
- Commit `936a5e6` confermato su `main`

### Stato refactor
R1✅ R2✅ R3✅ R4✅ R5✅ R6✅ R7✅ — R6.5 DA FARE — R8 DA FARE

### Prossima sessione
- R6.5: applica `locale_data_path()` ai 9 DB SQLite operativi (prerequisito R8)
- R8: architettura modulare + feature flags (sessione lunga)

### Commit
`[mixed] R7 — scaffold locali/_template/ + docs/architettura_locale.md + sync stato §6 refactor_monorepo + roadmap §0 + trgb.it gobbette SVG` (commit `936a5e6`)

---

---

## Storico

Le sessioni più vecchie sono spostate in archivio (regola: in questo file restano ~3 mesi):
- [archive/sessione_archivio_59.md](archive/sessione_archivio_59.md) — sessioni ~39 → 59 cont. e (marzo–aprile 2026) + vecchie mappe di riferimento
- [archive/sessione_archivio_39.md](archive/sessione_archivio_39.md) — sessioni ≤ 39
