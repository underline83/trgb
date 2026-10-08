// Mappa versioni moduli TRGB Gestionale
// Aggiornare qui ad ogni rilascio significativo

const MODULE_VERSIONS = {
  vini: {
    // 3.93 (2026-10-06): Vendite — «📷 Scansiona QR» legge l'etichetta e
    //   seleziona il vino (components/QrScanner.jsx, jsQR vendorizzato).
    // 3.92 (2026-10-06): Etichette QR bottiglie (/vini/etichette) per Brother
    //   QL-820NWB — 29×62 e 62 continuo, QR verso la scheda mobile.
    // 3.91 (2026-09-27): Ordini fornitori — la riga «Da ordinare» ha le
    //   stesse informazioni del widget alert della dashboard: giacenza +
    //   copertura in evidenza, ritmo per esteso con «venduto/finito Xgg fa»,
    //   «comprato X mesi fa» su qualunque annata. Badge estratti in
    //   pages/vini/RiordinoBadges.jsx e usati da entrambe le pagine. Flag
    //   ⛔ Non ricomprare / 🗓️ Annata esaurita sulla riga (tolgono il vino
    //   anche dal carrello) e ↩︎ ripristina in «Messi da parte».
    // 3.90 (2026-09-20): Vendite — pulsante ↻ «rigenera tempo di apertura»
    //   nella card Calici disponibili. POST /vini/magazzino/{id}/
    //   bottiglia-aperta/rigenera riporta DATA_APERTURA ad adesso (il
    //   contatore «aperta da» riparte da zero) e traccia un MODIFICA
    //   [CALICI-RESET] nello storico. Riservato ad admin/superadmin
    //   (richiede_ruoli("admin") + isViniTimerAdminRole lato FE): sala e
    //   sommelier aprono/chiudono la bottiglia ma non riscrivono il dato su
    //   cui si basa l'alert «aperta da troppo». Solo in /vini/vendite
    //   (prop showResetTimer), non in Dashboard Sala.
    // 3.89 (2026-09-10): invariante Matrice — QTA_LOC3 ≡ celle in griglia.
    //   Nato dal #607 Toscana 50 e 50: 1 bt in matrice con zero celle
    //   (residuo della mig 134 del cutover di maggio, che saltava i vini in
    //   matrice), posti tutti a 0 e totale 1, impossibile da togliere.
    //   Backend: i movimenti su loc3 passano SOLO dalle celle (CARICO =
    //   celle libere, SCARICO/VENDITA = celle del vino, una per bottiglia;
    //   unica eccezione lo scarico di un residuo senza celle); delete di un
    //   movimento, PATCH, creazione vino e import Excel non scrivono più
    //   QTA_LOC3 a mano. Nuovi GET /{id}/coerenza-giacenza e POST
    //   /{id}/riallinea-giacenza (RETTIFICA nello storico) + checker M.F
    //   `vini_giacenze_incoerenti` (mig 176). Frontend: Movimenti in scheda
    //   con scelta celle, banner «Giacenza da sistemare» con Riallinea in
    //   Giacenze, ViniVendite guidata dalle celle vere (non dal testo).
    // 3.88 (2026-09-10): Cantina mobile, «Per scaffale» → Matrice: le
    //   etichette seguono la posizione (colonna, poi riga — la prima cella
    //   del vino) invece dell'ordine alfabetico, e ogni riga mostra le celle
    //   «(3,6) (3,7)». Senza celle leggibili in fondo. Solo frontend.
    // 3.87 (2026-09-01): la mescita torna reversibile. Aprire una bottiglia
    //   per i calici accendeva anche VENDITA_CALICE=1 (flag di ANAGRAFICA,
    //   permanente) in due flussi: ViniVendite → DecidiPrezzoCalice e
    //   SchedaVino.toggleBottigliaAperta. Chiudendo la mescita si spegneva
    //   solo BOTTIGLIA_APERTA → il vino perdeva il tag «in mescita» ma
    //   restava nella sezione Al calice della carta finche' aveva giacenza
    //   (21 bottiglie in questo stato al momento del fix). Il set era anche
    //   inutile: load_vini_calici include gia' `VENDITA_CALICE = 1 OR
    //   BOTTIGLIA_APERTA = 1`, quindi l'apertura entra in carta da sola.
    //   Ora tutti i flussi di mescita scrivono SOLO BOTTIGLIA_APERTA;
    //   VENDITA_CALICE resta la scelta esplicita «sempre al calice» e si
    //   cambia solo in anagrafica. DecidiPrezzoCalice: nuova prop opzionale
    //   `prezzoIniziale` (precompila il PREZZO_CALICE gia' deciso in
    //   un'apertura precedente, senza spostare le soglie di nota
    //   obbligatoria, che restano su PREZZO_CARTA/5). Testi di conferma
    //   allineati. Nessuna modifica backend, nessuna migrazione.
    // 3.86 (2026-08-21): Cantina mobile v1.2 — la scheda del vino smette di
    //   essere sola lettura. Barra azioni fissa in fondo (venduta −1 / carico /
    //   conta) con toast «Annulla» 8s (DELETE del movimento, stesso pattern di
    //   CartaStaff), righe di «Dove si trova» toccabili → sheet azioni sul
    //   singolo posto (vendita, scarico, carico, conta), timeline movimenti
    //   aperta e raggruppata per giorno con chi/origine/giacenza risultante e
    //   annulla sull'ultimo, toggle mescita in scheda. Scrittura riservata a
    //   admin/superadmin/sommelier (nuovo `isViniManagerRole` in authHelpers,
    //   specchio di is_vini_manager); la sala mantiene il toggle mescita.
    //   La conta corregge per DELTA sul posto (CARICO/SCARICO con nota
    //   [CONTA]), MAI con RETTIFICA: quella è assoluta e globale e non tocca
    //   le QTA per locazione → sfaserebbe totale e somma dei posti. Matrice
    //   (loc3) resta read-only da mobile: senza griglia celle si sfaserebbero
    //   QTA_LOC3 e matrice_celle. Tipografia e contrasto alzati per l'uso su
    //   iPhone in cantina. Nessuna modifica backend.
    // 3.85 (2026-08-21): Cantina mobile, modo «Per scaffale» — filtro per
    //   trovare la locazione da guardare: searchbar sul nome locazione (cerca
    //   anche dentro le etichette contenute) + chip categoria Scaffali/Frigo/
    //   Matrice/Altro + accordion (una locazione aperta per volta, apertura
    //   automatica se ne resta una sola). Prima srotolava tutta la cantina.
    // 3.84 (2026-08-08, RD.6): il widget «Riordini per fornitore» e' stato
    //   ASSORBITO dalla pagina /vini/ordini (chiude il buco B3 del piano O).
    //   Migrate di la': listino inline editabile con storico prezzi, duplica
    //   nuova annata (che mette la bottiglia nuova in bozza), ordinamenti
    //   (urgenza/ritmo/giacenza/listino/date), tracciamento A/X nella sezione
    //   "Messi da parte" (nuovo GET /vini/ordini/archivio/).
    //   Rimossi: 536 righe da DashboardVini.jsx (2233→1697) e la query
    //   riordini_per_fornitore da get_dashboard_stats (~940 righe di payload,
    //   dashboard 25→19 ms). `includi_giacenza_positiva` deprecato/ignorato.
    //   In dashboard il blocco "📦 Ordini" mostra i fornitori con lavoro.
    // 3.83 (2026-08-08, RD.2): contesto annate nel Monitor riordino. Marco:
    //   "se un vino ha un'annata nuova dovresti aiutarmi a capirlo per decidere".
    //   10 righe su 48 erano falsi allarmi: annata finita ma vendemmia dopo gia'
    //   in cantina. Ogni riga porta ora il chip "➡️ 2023 in cantina · 30 bt"
    //   (cliccabile) e "📥 comprato ~N mesi fa". Restano in lista per scelta di
    //   Marco: sparisce quando marca lui "Annata esaurita".
    //   vini_riordino_service.arricchisci_annate(), 1 query per tutte le righe.
    // 3.82 (2026-08-08, RD.1.1): il flag "Da ordinare" ora fa quello che dice.
    //   Marco: "ho flaggato, ma restano li". Il widget elenca SOLO i vini su cui
    //   non hai ancora deciso: 'D' e 'Ordinato' mettono il vino nella bozza del
    //   fornitore e lo tolgono dalla lista (prima 'D' era solo un colore e il
    //   vino restava). Chi decidi resta a schermo come riga verde "Sistemati
    //   adesso" fino al refresh, con chip "in bozza · fornitore · N bt"; se
    //   ri-clicchi il flag la riga viene tolta anche dal carrello.
    // 3.81 (2026-08-08, RD.1): il widget dashboard diventa il primo selettore
    //   del riordino. Chi entra non e' piu' "giacenza = 0" ma la COPERTURA in
    //   giorni (giacenza / consumo recente < N gg, default 21): 1 bt di un vino
    //   che gira e' un alert, 1 bt di un vino fermo no. Logica unica in
    //   app/services/vini_riordino_service.py, condivisa con /vini/ordini.
    //   Flag "Ordinato" mette il vino nella bozza del suo fornitore. Righe
    //   colorate per stato riordino su widget fornitori e pagina Ordini.
    //   Mig 165: sync chiavi vini_widget_settings (soglia + 4 chiavi O5 che
    //   erano nel service ma non in tabella, quindi non editabili da UI).
    // 3.80 (2026-08-03, V.9 fase 1): "Cantina da iPhone" — nuova pagina
    //   mobile-first /vini/cantina-mobile (CantinaMobile.jsx): finder
    //   «trova la bottiglia» (ricerca + filtro per categoria (scaffali/frigo/matrice) + vista per
    //   scaffale) e scheda mobile read-only. Solo consultazione, zero
    //   modifiche backend (riusa /vini/v2/bottiglie/).
    // 3.79 (2026-08-03): "Pubblica la carta sul sito" in Impostazioni > Carta
    //   (mattone M.J): la carta CLIENTE va da sola sull'FTP dell'hosting, con
    //   nome fisso. La versione staff resta interna e non e' pubblicabile.
    // 3.78 (2026-08-02): bottone "⛔ Annulla" sugli ordini in viaggio.
    //   Endpoint e modello c'erano dalla 3.75, mancava il modo di premerli:
    //   gli ordini si potevano solo ricevere, mai disdire.
    // 3.77 (2026-08-02): rinominare un distributore ora propaga anche alle
    //   bottiglie orfane (senza madre agganciata) e agli ordini ANCORA APERTI.
    //   Gli ordini chiusi tengono il nome storico: sono documenti.
    // 3.76 (2026-08-02): flag `attivo` sui distributori (mig 160). Interruttore
    //   in Anagrafiche > Distributori; i non attivi spariscono dalla pagina
    //   Ordini (ma restano se hanno un ordine aperto, altrimenti diventerebbe
    //   irraggiungibile). I loro vini restano in cantina e nello storico.
    // 3.75 (2026-08-02): Ordini ai fornitori (O3-O6). Migrazioni 158 (tabelle
    //   vini_ordini + vini_ordini_righe) e 159 (travaso dei pending residui).
    //   Nuova pagina /vini/ordini master-detail fornitore-centrica: da
    //   ordinare con qta suggerita e ritmo, carrello con totali, invio
    //   WhatsApp col template configurabile, ricezione anche parziale,
    //   storico ordini con lead time. La dashboard diventa un riepilogo che
    //   linka alla pagina. Doc: docs/modulo_vini_ordini.md.
    // 3.74 (2026-08-02): Anagrafiche > Distributori — modalita' contatti
    //   (O1): edit inline di rappresentante/telefono/email in tabella,
    //   Invio scende alla riga sotto, barra di completezza, filtro "solo
    //   senza telefono". Prerequisito dell'invio ordini via WhatsApp
    //   (v. docs/modulo_vini_ordini.md). Backend: il PATCH fornitore non
    //   fa piu' il cascade sync se tocca solo campi non denormalizzati.
    // 3.73 (2026-08-02): Carta Bevande — flag `analcolica` sulle voci (mig 157):
    //   badge "0.0" brand-blue accanto al nome + legenda, su HTML web, HTML
    //   preview e DOCX/PDF. Gemello del flag gluten_free (mig 106).
    // 3.72 (2026-07-20): CartaStaff v2.0 "banco di servizio" (V.22) — vista
    //   sommelier operativa: Preparazione + Servizio, vendita one-tap con
    //   undo, toggle mescita. Endpoint carta-staff: locazioni con `slot`.
    version: "3.93",
    label: "Cantina & Vini",
    status: "stabile",     // stabile | beta | alpha | dev
    color: "green",
  },
  ricette: {
    version: "3.33",
    label: "Ricette & Food Cost",
    status: "beta",
    color: "blue",
  },
  cucinaDashboard: {
    version: "1.0",
    label: "Dashboard Cucina chef",
    status: "alpha",
    color: "orange",
  },
  listaSpesa: {
    version: "1.0",
    label: "Lista Spesa Cucina",
    status: "alpha",
    color: "orange",
  },
  cucinaScorte: {
    // 1.8 (2026-10-03): la sotto-app diventa «Gestione Frigoriferi e scorte»
    //   (barra: Frigo, Scorte); Oggi e Spesa pagine a sé dalla Home cucina.
    // 1.7 (2026-10-02): scheda articolo su una pagina a scorrimento — quantità,
    //   gesti, dove si trova, lotti, DETTAGLI modificabili in linea (sparisce
    //   ✏️ Modifica; «Salva modifiche» compare solo se cambia qualcosa), movimenti.
    // 1.6 (2026-10-02): gate temperature — chi apre per primo la Cucina iPhone
    //   inserisce le temperature di oggi (voci TEMPERATURA agganciate ai frigo
    //   via checklist_item.ubicazione_id, scritte nel registro HACCP del Task
    //   Manager); «Ignora per oggi» solo admin/superadmin/chef, tracciato come
    //   SALTATA. Congelatori col «−» già messo. Tasks: ubicazione_id negli item.
    // 1.5 (2026-10-02): sugli articoli a MOVIMENTI il pallino segue la quantità
    //   (0 → rosso + spesa se il totale è zero, ≤ scorta minima → giallo, sopra
    //   → verde), riallineato dopo ogni movimento/spostamento/annulla/conta/
    //   modifica. Tocco sul pallino = «Quanti ce ne sono?»; PATCH semaforo
    //   rifiutato (409) su questi articoli. Scorta minima da ✏️ Modifica.
    // 1.4 (2026-10-01): congelatori. ↔ Sposta fra ripiani e fra frigo (due
    //   movimenti TRASFERIMENTO legati, undo insieme, i lotti viaggiano con la
    //   roba); il Carico chiede «congelato il / scade il» e crea un lotto
    //   (scadenza proposta da config scadenza_congelato_gg = 180); scarichi e
    //   rettifiche in meno consumano i lotti FIFO; ＋ Aggiungi su ogni ripiano
    //   del giro (cerca prima fra gli esistenti); scadenza più vicina nel giro.
    //   Famiglia freschezza CONGELATO (60 gg). Alert scadenze: soglia da config.
    // 1.3 (2026-09-28): si corregge dal telefono. Scheda articolo → ✏️ Modifica
    //   (nome, unità, confezione, regime, natura) e tap su una riga di «Dove si
    //   trova» → «quanti ce ne sono?» = RETTIFICA tracciata con qta_precedente.
    //   PATCH articolo aperto a tutta la brigata (decisione Marco); disattivare
    //   resta admin/chef. Dalla scheda aperta da un frigo si torna al frigo.
    // 1.2 (2026-09-08): pannello di SETUP in Impostazioni Cucina → Frigoriferi.
    //   Finalmente si possono creare i posti, i loro ripiani (codice locale +
    //   destinazione d'uso) e popolare la dotazione incollando una lista, con
    //   anteprima obbligatoria ESISTE/NUOVO/SIMILE. Prima l'unico modo era lo
    //   script di seed sul VPS.
    //   Fix layout: la pagina mobile scorre nel documento invece di essere un
    //   overlay fixed che finiva sotto l'Header globale; i tab stanno anche in
    //   alto in flusso (sotto i 768px resta la barra in fondo, per il pollice).
    // 1.1 (2026-09-07): «Cucina da iPhone» — la sotto-app mobile a 4 tab
    //   (Oggi / Scorte / Frigo / Spesa) su /cucina/mobile. Oggi e Spesa girano
    //   su /tasks e /lista-spesa che esistevano già; Scorte e Frigo sulla 171.
    //   Il gesto principale è il giro del frigo: pallino ciclico verde→giallo→
    //   rosso, undo 8s, e sul rosso nasce la riga di spesa.
    // 1.0 (2026-09-07): infrastruttura a ripiani (mig 171). 11 tabelle
    //   cucina_*, 40 endpoint, nessuna UI.
    //   Doc: docs/modulo_scorte_cucina.md
    //   Mockup: docs/mockups/cucina_mobile_scorte_frigo.html
    version: "1.8",
    label: "Scorte & Frigoriferi",
    status: "alpha",
    color: "orange",
  },
  pranzo: {
    // 1.8 (2026-08-03): "Pubblica il menu sul sito" nel compositore (mattone
    //   M.J): il PDF cliente della settimana finisce da solo sull'FTP
    //   dell'hosting, nome remoto fisso -> link su WordPress invariato.
    version: "1.8",
    label: "Menu Pranzo del Giorno",
    status: "beta",
    color: "blue",
  },
  menuCarta: {
    // 1.3 (2026-08-07): multilingua it/en/fr/es/de/uk [core]. Tabella
    //   `menu_translations` (mig 163), servizio `menu_i18n_service.py`,
    //   `?lang=` su /menu-carta/public/today (retrocompatibile), selettore
    //   lingua sulla pagina pubblica, tab Traduzioni nel backoffice.
    //   Incluso fix: la sezione 'dolci' non era in SEZIONI_ORDINE della
    //   pagina pubblica — 5 dolci invisibili al QR da 1.2 (2026-07-19).
    // 1.2 (2026-07-19): sezione 'dolci' [core] (router+FE+PDF+MEP) +
    //   edizione Estate 2026 in carta via mig 154 [locale:tregobbi].
    //   Nel push b8c96816 il bump era stato sovrascritto da una sessione
    //   parallela — riapplicato.
    version: "1.3",
    label: "Menu Carta",
    status: "beta",
    color: "blue",
  },
  corrispettivi: {
    // 4.9 (2026-09-03): OMAGGI nell'imponibile (mig 170). Campo `omaggi` in
    //   chiusura turno = voce "TOTALE GIORNO OMAGGI" della chiusura RT.
    //   Il corrispettivo fiscale diventa una derivata (preconto − annulli +
    //   omaggi) e il PDF commercialista scorpora su quella, con colonna
    //   "di cui omaggi". Prima scorporava sull'incassato: sul 28/08/2026
    //   dichiarava imponibile 2.252,73 invece dei 2.260,00 risultanti all'AdE
    //   (il <NonRiscossoOmaggio> è incluso nell'ammontare imponibile: la
    //   cessione gratuita è operazione imponibile, l'IVA la versa l'esercente).
    //   Omaggi e annulli si comportano in modo opposto: entrambi fuori dalla
    //   cassa, ma gli annulli si sottraggono dall'imponibile e gli omaggi si
    //   sommano. Quadratura di cassa invariata. Fix collaterale: il PDF ora
    //   sottrae gli annulli/resi, che ignorava (admin_finance.py li toglieva
    //   già, corrispettivi_export.py no). Vedi docs/modulo_vendite.md §9.5.1.
    // 4.8 (2026-07-17, V.1): fix semantica "giorno chiuso" in
    //   `_is_effectively_closed()`. Prima: giorno con corr=0 era "aperto
    //   con €0" se non in config giorni_chiusi/giorno_chiusura_settimanale.
    //   Ora: nessun dato → chiuso di fatto. Fixa YoY sgonfio: Q2 2025 va da
    //   78gg "aperti" a 62-64gg reali, media €/gg passa da €1.325 a €1.667,
    //   YoY €/gg da +51% gonfiato a +17% reale. Config resta per altri
    //   consumer (CalendarView shading). Nessuna migrazione DB.
    version: "4.9",
    label: "Gestione Vendite",
    status: "stabile",
    color: "green",
  },
  fatture: {
    // v3.2 (2026-10-02): note di credito (TD04) importate da FIC (A.1 fase 1) —
    //   visibili in Elenco/Dettaglio con badge NC, escluse da totali, filtri
    //   pagamento, scadenzario, dashboard, statistiche, matching e alert.
    version: "3.2",
    label: "Gestione Acquisti",
    status: "stabile",
    color: "green",
  },
  flussiCassa: {
    // v1.22 (2026-10-02): Riconciliazione mostrava solo i 500 movimenti più recenti (default limit backend) — ora tutti.
    version: "1.22",
    label: "Flussi di Cassa",
    status: "beta",
    color: "blue",
  },
  dipendenti: {
    // 2.30 (2026-07-30): sotto-area Intermittenti — comunicazione preventiva
    //   UNI-Intermittenti generata dai turni, invio email, registro con prova,
    //   annullamento, checker M.F a 48h. Migrazione 156.
    // 2.31 (2026-08-03): multi-reparto — chi lavora in piu' reparti compare in
    //   ogni foglio, e ogni turno finisce nel foglio del reparto del suo tipo.
    // 2.32 (2026-09-01): permessi. 59 guardie di ruolo sui 4 router del modulo
    //   (prima: qualsiasi ruolo autenticato leggeva buste paga, IBAN e codici
    //   fiscali), sub= sulle route, tab filtrati, Foglio Settimana in sola
    //   lettura per chi non e' admin. Vedi modulo_dipendenti.md §9.
    // 2.33 (2026-09-18): Intermittenti -> tab "Riepilogo mese": giornate
    //   lavorate per dipendente incrociate col registro invii (lavorato vs
    //   comunicato), export CSV per il consulente. Solo lettura, nessuna
    //   migrazione. Vedi modulo_intermittenti.md C-D-210.
    version: "2.33",
    label: "Dipendenti",
    status: "stabile",
    color: "green",
  },
  auth: {
    // 2.2 (2026-07-10): lockout brute-force login (A1-04, backoff progressivo,
    // soglie in auth_settings.json) + PIN minimo 6 cifre per admin/contabile.
    version: "2.2.2",
    label: "Login & Ruoli",
    status: "stabile",
    color: "green",
  },
  statistiche: {
    // 1.2 (2026-07-02): modulo potenziato — tab Storico (YoY 2021→oggi da
    //   daily_closures+shift_closures con cutover dinamico, media per giorno
    //   settimana con split pranzo/cena), "Cosa consuma un coperto" in
    //   Coperti & Incassi (€/coperto per categoria iPratico), movimenti
    //   prodotti in Dashboard (crescita/calo vs mese precedente), trend
    //   mensile per prodotto cliccabile in Prodotti. Endpoint 8-11 nel router.
    // 1.2.1 (2026-07-02): fix semantica cumulativa shift_closures — la riga
    //   cena contiene la Z DI GIORNATA (include il pranzo): fatturato giorno
    //   = cena.preconto + fatture, non pranzo+cena (raddoppiava). Esclusi
    //   shift_preconti per omogeneità con daily-era. Marzo 104k→71.6k
    //   (iPratico 71.5k). + fallback pre-cutover in Coperti & Incassi
    //   (gen/feb da registro corrispettivi, endpoint 12 /storico/giorni).
    version: "1.2.1",
    label: "Statistiche",
    status: "beta",
    color: "blue",
  },
  controlloGestione: {
    // 2.21 (2026-07-17, U3+U4): pagina Analisi Utenze (upload bollette A2A,
    //   KPI, grafici fasce/gas/potenza) + 2 checker M.F (rinegoziazione
    //   condizioni, autolettura gas). Spec docs/spec_utenze.md.
    // 2.18 (2026-06-30, BP.1-4): nuova pagina "Batch pagamenti".
    // 2.19 (2026-06-30, RC.1+RC.3): auto-close rateizzazioni completate.
    //   Endpoint POST /rateizzazioni/{sf_id}/auto-close + POST /auto-close-all
    //   che chiude spese fisse RATEIZZAZIONE con tutte rate pagate, aggiorna
    //   uscita origine + fe_fatture (via set_stato force=True) applicando la
    //   Regola A (Marco): forza minima delle rate → PAGATO se tutte le rate
    //   riconciliate banca, PAGATO_MANUALE se almeno una manuale.
    //   UI: bottone "✓ Auto-chiudi rateizzazioni completate" in header
    //   ControlloGestioneSpeseFisse. Sul VPS Tre Gobbi: 7 rateizzazioni
    //   completate al 100% da chiudere (4 Ristoteam + Ambrogio + Philarmonica
    //   + Marenzi). RC.2 (hook post-pagamento strutturale) rimandato.
    // 2.20 (2026-07-02, RC.1.fix): fix SELECT su cg_uscite — non esiste
    //   la colonna `numero_rata` (è di cg_piano_rate). Rimosso dalla query
    //   raccogli-date-rate; usiamo solo periodo_riferimento come identificatore.
    // 2.22 (2026-09-12, M.4b): la data di scadenza di una rata e' editabile
    //   anche dal modale "Storico addebiti" delle spese fisse (prima solo dal
    //   modale "Piano"). Per affitti/utenze lo Storico e' il modale naturale e
    //   dallo Scadenzario le uscite SPESA_FISSA rimbalzano su questa pagina:
    //   spostare una rata arretrata era un vicolo cieco. Riusa
    //   PUT /uscite/{id}/scadenza (G.7 SPOSTATO, periodo_riferimento
    //   invariato). Aggiunta colonna Stato nello Storico e i badge mancanti
    //   SPOSTATO/VERIFICARE/RATEIZZATO.
    // v2.23 (2026-10-02): proiettore spese fisse rispetta il piano rate — rate "YYYY-MM-rN" generate, mesi senza rata dentro il piano non generati (e residui rimossi); CE competenza su substr(periodo,1,7).
    // v2.24 (2026-10-02): wizard «Rateizza fatture» invia fatture_ids → fattura origine agganciata + RATEIZZATO; POST /spese-fisse/{id}/collega-fatture (+auto-close).
    // v2.25 (2026-10-02): note di credito (TD04) nel Conto Economico col segno meno, nel mese della loro data (A.1 fase 2); stesso criterio in «Dove appare nel CE» del dettaglio fattura e nei KPI acquisti della dashboard CG.
    // v2.26 (2026-10-02): Scadenzario mostra di default anche i PARZIALE (residuo da pagare, es. saldo stipendio); residuo nei KPI «Da pagare»/«Scaduto» in base alla scadenza.
    version: "2.26",
    label: "Controllo Gestione",
    status: "beta",
    color: "blue",
  },
  clienti: {
    // 3.1 (2026-08-08): Gift Card — emissione (a valore o esperienza), codice
    //   univoco leggibile, verifica al banco per codice, scarico a uso unico,
    //   annullo/riattiva con storico movimenti, PDF buono A5 con identita'
    //   del locale, alert M.F sulle card in scadenza. Nessun impatto su
    //   corrispettivi/chiusure: registro informativo separato dalla cassa.
    version: "3.1",
    label: "Gestione Clienti",
    status: "beta",
    color: "blue",
  },
  prenotazioni: {
    version: "2.2",
    label: "Prenotazioni",
    status: "beta",
    color: "blue",
  },
  selezioni: {
    version: "1.2",
    label: "Selezioni del Giorno",
    status: "beta",
    color: "blue",
  },
  tasks: {
    // 1.5 (2026-10-04): voci padre con sotto-voci (mig 182, campo «Voce padre»
    //   nel TemplateEditor); il padre si spunta da solo, toccarlo spunta tutte.
    //   Oggi (Cucina iPhone): scadute non più spuntabili (prima HTTP 400 muto),
    //   errori col messaggio del backend. Duplica copia anche ubicazione_id.
    version: "1.5",
    label: "Task Manager",
    status: "beta",
    color: "blue",
  },
  pratiche: {
    // 1.1 (2026-10-08): strumenti per il connettore MCP (M.K); messaggio
    //   «Per chiudere serve l'esito» al posto di quello ridondante.
    // 1.0 (2026-10-08): nascita. Elenco Scadute / Tocca a me / Tocca a loro,
    //   scheda con storia dei passi, nuovo passo (stato, termine, allegato),
    //   collegamenti manuali ad altri moduli, avviso pratiche_termini.
    version: "1.1",
    label: "Pratiche",
    status: "beta",
    color: "blue",
  },
  haccp: {
    version: "1.0",
    label: "Report HACCP",
    status: "alpha",
    color: "orange",
  },
  home: {
    // 3.7 (2026-07-27): widget Bacheca sostituito da "La Lavagna" — briefing
    // di servizio auto-composto (coperti, tavoli da segnalare, selezioni,
    // turni, task) + nota del turno a frizione zero + strato eventi che
    // assorbe la vecchia card Alert. Stesso widget anche in DashboardSala,
    // dove il ruolo sala lo vede in sola lettura.
    version: "3.7",
    label: "Home",
    status: "beta",
    color: "blue",
  },
  cartaCredito: {
    // Sub-modulo banca — sub-modulo COMPLETO end-to-end con CC.5.b
    // (2026-06-02 notte): vista riepilogo mensile spese carta per categoria.
    // Endpoint GET /banca/carta/riepilogo con mappa MCC→categoria hardcoded
    // (ALIMENTARI/TRASPORTI/SOFTWARE/ALBERGHI/RISTORANTI/FINANZIARI/SERVIZI/VARIE).
    // Nuova pagina CartaRiepilogoPage.jsx con filtri carta+range, 4 stat
    // card, bar chart stacked per categoria (recharts), tabella mesi×cat
    // con riga totali. Bottone "📊 Riepilogo mensile" in CartaCreditoPage.
    //
    // CC.6 (2026-06-13): fix coerenza carta vs CC bancario. 4 endpoint
    // banca escludono pseudo-mov carta dal saldo (filtro EXCLUDE_CARTA_SQL).
    // /banca/cross-ref include is_carta + match_uscita_id (LEFT JOIN
    // cg_uscite). BancaCrossRef: toggle "💳 Mostra movimenti carta", badge
    // "💳 carta" sulle righe carta, chip "🔗 Già su CG #N" se matchato A.
    //
    // CC.6.fix (2026-06-13 notte): hotfix LEFT JOIN duplicava i movimenti
    // multi-link (es. mov #1416 con 6 uscite CG appariva 6 volte). Sostituito
    // con subquery scalari LIMIT 1 + GROUP_CONCAT/COUNT per portare aggregato.
    // Aggiunto badge "CC *XXXX" (multi-conto ready) accanto al badge carta.
    // Chip "Già su CG" mostra "+M altre" se count > 1.
    //
    // CC.7 (2026-06-13 notte): "Chiudi senza fattura" — bottone nei tab
    // "senza"/"parcheggiati" che crea cg_uscite (tipo_uscita='SPESA_NON_FATTURATA',
    // stato='PAGATO') + marca riconciliazione_chiusa. Reversibile via riapri.
    // 2 endpoint POST/DELETE /cross-ref/chiudi-senza-fattura/{id}.
    // v1.9 (2026-10-02): parser PDF accetta righe senza MCC (QUOTA ANNUA) e storni "16,44-" (importo positivo, esclusi da automatch).
    // v1.10 (2026-10-02): ricerca manuale nel modale Cerca senza vincolo metodo=CARTA/tolleranze, anche per importo.
    // v1.11 (2026-10-02): fix TextInput ricerca Cerca (onChange riceve il valore); candidati anche uscite NULL non pagate scadute; tolleranza commissione (mig 178) + nota al link.
    version: "1.11",
    label: "Carta di Credito",
    status: "beta",
    color: "blue",
  },
  sistema: {
    // 5.42 (2026-10-02): riallineamento versione di sistema, ferma a 5.41 dal
    //   01/09 nonostante mig 170→179 e una ventina di rilasci: omaggi
    //   nell'imponibile (170), Scorte & Frigoriferi + Cucina da iPhone (171),
    //   pagamenti parziali e bonifica riconciliazione (172-174), Cantina
    //   mobile in Home e invariante matrice (175-176), formaggi (177),
    //   commissioni carta (178), storico pre-estratti chiuso (179).
    //   Nessun codice nuovo in questo bump: solo VERSION + docs.
    // 5.41 (2026-09-01): M.G fase 1 + APPLICAZIONE a 37 router. Endpoint con un
    //   check di ruolo: da 200/836 (24%) a 776/836 (92%); aperti a qualsiasi
    //   ruolo autenticato da 636 a 60, e tutti e 60 sono voluti (letture di
    //   servizio, QR pubblico, chiusura cassa sala, notifiche di tutti).
    //   M.G ha ora anche `richiede_ruoli_con(getter, *ruoli)`: serve dove il
    //   token arriva in query e non nell'header (stampe con window.open,
    //   iframe carta cantina). Senza, la guardia di router mandava in 401
    //   le stampe inventario per TUTTI, admin compreso.
    //   Chiusi: banca, banca carta, CG, utenze, admin_finance, fe_import,
    //   fe_categorie, fe_proforme, FIC, statistiche, alerts, iPratico, clienti,
    //   gift card, preventivi, prenotazioni, lista spesa, ingredienti, HACCP,
    //   menu carta, le 4 scelta_* + piatti del giorno.
    //   NON toccati per decisione di Marco: modulo Vini (sala e sommelier
    //   scrivono davvero) e chiusure_turno (la chiusura di cassa serale la fa
    //   la sala — sta in un router SEPARATO da admin_finance nonostante il
    //   prefisso quasi identico /admin/finance/shift-closures).
    //   Selezioni: lettura + toggle venduto a sala/sommelier, scritture alla
    //   cucina; ZonaPanel nasconde i bottoni (nuovo isCucinaWriterRole).
    //   M.G fase 1 — app/services/permessi.py, guardie di
    //   ruolo riutilizzabili (richiede_ruoli/solo_admin/verifica_ruoli/
    //   ha_ruoli). superadmin implicito dove c'e' admin, nomi ruolo validati
    //   all'import (un typo fa fallire il boot, non apre una porta).
    //   Chiusi i 3 endpoint PUBBLICI trovati dall'audit: /foodcost/ingredienti
    //   e /foodcost/ingredient/{id} (listino costi fornitori, senza token) +
    //   /menu/ legacy, ora admin e deprecated. Vedi docs/audit_permessi_2026-09-01.md.
    //   NB: il file VERSION era rimasto a 5.39 mentre qui c'era 5.40 — riallineati.
    // 5.40 (2026-08-03): canale email configurabile dal gestionale
    //   (Impostazioni Sistema → Email), password cifrata, .env come fallback.
    // 5.46 (2026-10-08): mattone M.K — connettore MCP di claude.ai su /mcp
    //   (OAuth 2.1 con utente e PIN TRGB, solo admin), strumenti pratiche,
    //   connettore.sqlite3 (schema al boot). Doc: docs/connettore_mcp.md.
    // 5.45 (2026-10-08): modulo nuovo «pratiche» — pratiche.sqlite3 (schema al
    //   boot, niente migrazione numerata), router /pratiche (solo admin),
    //   checker M.F pratiche_termini, card Home. Doc: docs/modulo_pratiche.md.
    // 5.44 (2026-10-04): mig 182 — checklist_item.gruppo: voce padre con
    //   sotto-voci nelle checklist (Task Manager 1.5, Linea Antipasti).
    // 5.43 (2026-10-04): mig 180 — edizione Menu Carta «Autunno 2026» (ott-nov-dic)
    //   [locale:tregobbi], seed da PDF, traduzioni copiate per le voci invariate;
    //   mig 181 — traduzioni EN/FR/ES/DE/UK delle voci nuove.
    version: "5.46",
    label: "Sistema",
    status: "stabile",
    color: "green",
  },
};

export default MODULE_VERSIONS;

// Componente badge versione riutilizzabile
export function VersionBadge({ modulo, className = "" }) {
  const m = MODULE_VERSIONS[modulo];
  if (!m) return null;

  const statusColors = {
    stabile: "bg-green-100 text-green-700 border-green-300",
    beta: "bg-blue-100 text-blue-700 border-blue-300",
    alpha: "bg-yellow-100 text-yellow-700 border-yellow-300",
    dev: "bg-red-100 text-red-700 border-red-300",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-mono border rounded-full px-2 py-0.5 ${statusColors[m.status] || statusColors.dev} ${className}`}>
      v{m.version}
      {m.status !== "stabile" && (
        <span className="font-sans font-semibold uppercase tracking-wider" style={{ fontSize: "0.6rem" }}>
          {m.status}
        </span>
      )}
    </span>
  );
}
