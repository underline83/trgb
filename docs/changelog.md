# 📄 TRGB Gestionale — CHANGELOG
**Formato:** Keep a Changelog

---

## 2026-10-04 — Checklist: voci padre con sotto-voci `[core]`

Task Manager 1.5, mig 182, sistema 5.44. Nelle checklist una voce può avere una **voce padre** (es. «Rosa di zucca» → «6 rose scongelate in linea», «scorta gelo min 18», …): il padre si spunta da solo quando le sotto-voci sono tutte fatte, toccandolo le spunti tutte (o le togli). Campo «Voce padre» nel TemplateEditor; raggruppamento in dettaglio checklist e nel tab Oggi della Cucina iPhone. Oggi: le checklist scadute non si possono più spuntare (prima davano «HTTP 400» senza spiegazione). Duplica template ora copia anche il collegamento al frigo. Provato su copia del DB (crea, duplica, genera istanza). Nuovi template «Linea Antipasti · Pranzo» (entro 12:30) e «· Sera» (entro 23:59) creati da UI.

---

## 2026-10-04 — Menu Carta «Autunno 2026» in carta `[locale:tregobbi]`

Caricato il menu ottobre-novembre-dicembre dal PDF `menu-ott-nov-dic-2026-web.pdf` (mig 180, sistema 5.43). «Estate 2026» archiviata. 46 voci + 2 degustazioni (Prima volta 60, Fidati dell'oste 75). Nuovi: Rosa di zucca, Battuta porcini e nocciola, Risotto stracchino all'antica e mela Kissabel, Pasta mista e fagioli gialèt, Pipe rigate e bisque, Anatra barbabietola rosa canina e caffè, Rognone trifolato, «Lucia di Lammermoor», Torta di nocciole. Rientrano formaggi italiani/francesi, Lasagnetta (al ragù bianco dei Tre Gobbi), Filetto alla Donizetti (nuova ricetta in carta). Ossobuco 26 → 28. Le traduzioni delle voci rimaste identiche sono copiate dall'Estate; quelle delle voci nuove le carica la **mig 181** (EN/FR/ES/DE/UK, 140 righe, `rivisto = 0`, da rivedere e approvare dal tab Traduzioni): sorgenti in `locali/tregobbi/seeds/sorgenti_menu_ott_dic_2026/`, seed generato `menu_traduzioni_ott_dic_2026.py`. Provate 180+181 su copia del DB: 46/46 voci tradotte in tutte le lingue, rilancio della 181 = 0 righe. I tag dietetici del cartaceo (8 codici, legenda tradotta) stanno ora nel seed come dato separato (`tag`), pronti per il campo dedicato. Allergeni dei piatti nuovi da verificare.

---

## 2026-10-04 — Scorte a movimenti: zero su un ripiano ma presente altrove = esce `[core]`

Se un articolo a movimenti arriva a 0 su un ripiano ma ce n'è ancora su un altro, la riga vuota esce da sola: non è finito, è solo da un'altra parte. Succede qualunque sia il gesto (correzione a mano, scarico, conta), non solo con lo Sposta. Il caso: il pancotto in Congelatore 1, rip. 2 a 0 e rip. 3 a 7 dopo due correzioni al posto dello Sposta. Quando il totale arriva a 0 resta in rosso e va in Lista spesa, come prima. Annullare un movimento rimette la riga se era uscita.

Nella correzione a mano («Quanti ce ne sono?»), confermare **0 quando era già 0** ora viene registrato (prima la finestra si chiudeva senza salvare). Così una riga vuota rimasta da prima si toglie con un tocco.

---

## 2026-10-04 — Scorte: a regime «conta», finito = esce dal ripiano `[core]`

Gli articoli a regime **conta** che alla conta risultano a **0** non restano sul ripiano in rosso: escono e finiscono nel **registro dei finiti** (cosa, dove, quanto c'era prima, chi e quale conta). Il registro lo vedono chef e sous chef. Semaforo e movimenti non cambiano: lì il finito resta sul ripiano in rosso. Vale anche per il **pallino**: portare a rosso un articolo a regime conta lo toglie dal ripiano, lo scrive nel registro e lo mette in Lista spesa (con l'annulla a 8 secondi che lo rimette). Il registro è il terzo tab in ogni frigo/congelatore (**Tutti i ripiani · Solo mancanti · Registro**), visibile a chef e sous chef; ogni riga ha **↩︎ Rimetti**, che riporta l'articolo al suo posto.

---

## 2026-10-03 — Frigo e congelatori: «Sposta» tutto = cambia ripiano `[core]`

Se con **↔ Sposta** si porta via **tutta** la quantità, l'articolo sparisce dal ripiano di partenza invece di restarci a zero (rosso «finito»). Prima, spostando il brasato e rimettendolo a posto, risultava su tutti e due i ripiani. Se se ne sposta solo una parte, resta su entrambi, con le quantità giuste.

---

## 2026-10-03 — Lavagna: «In turno» per reparto del turno, via «Nessuna prenotazione» `[core]`

- **In turno:** chi lavora compare sotto il reparto del **turno** di quel giorno (Sala Cena → Sala), non sotto il suo reparto principale. Prima Marco, che ha Cucina come principale, risultava in cucina anche quando era di sala. Anche pranzo/cena si legge dal tipo di turno; l'orario resta solo come ripiego. I turni non di lavoro (ferie, riposo) non compaiono.
- **Apertura:** quando non ci sono prenotazioni la riga «Nessuna prenotazione per la cena» non compare più (anche nel testo WhatsApp).

---

## 2026-10-03 — «Le mie cose da fare»: una lista personale in Home `[core]`

Ogni persona ha in Home il riquadro **📝 Le mie cose da fare**: scrive una riga e preme +, la spunta quando è fatta, la cancella con ×, tocca il testo per correggerlo e la sposta su o giù con ▲▼ — ognuno se la organizza come vuole. È personale: ciascuno vede solo la propria. Non sono i compiti del Task Manager (quelli si assegnano e hanno scadenze): è il foglietto in tasca. Le righe chiuse restano visibili una settimana, poi escono dalla vista.

Il superadmin ha in più **«Board di tutti →»**: una pagina con una colonna per persona, quante cose ha da fare e quelle chiuse di recente (sola lettura).

C'è nella Home di tutti: cucina, sala, admin.

---

## 2026-10-03 — La Lavagna più pulita `[core]`

Dalla Lavagna spariscono le righe **«Prenotazione oggi — …»** (le prenotazioni entrate in giornata) e l'avviso **«fatture da registrare»**. Le **Selezioni del giorno** ora si vedono tutte, non più solo le prime due per tipo. Restano i coperti del turno in apertura e le disdette di oggi.

---

## 2026-10-03 — Aiuto cuochi: solo la lettura dei menu; Lista spesa scrivibile; via i dati di prova `[core]`

- **Commis (aiuto cuoco):** niente più Selezioni del giorno, gestione del Menu Pranzo e del Menu Carta, né dalla Home, né dai menu, né aprendo l'indirizzo a mano (il server risponde «non autorizzato»). Al loro posto due tasti per **leggere** i menu: **Menu del pranzo** (la settimana corrente, solo piatti, senza prezzi né costi) e **Menu alla carta** (la stessa pagina che vede il cliente col QR).
- **Lista spesa:** in cima c'è un campo per scrivere a mano cosa serve, con quantità facoltativa e «⚡ urgente».
- **Dati di prova tolti:** la «[DEMO] Dispensa secco», i 18 articoli [DEMO] e le loro righe in lista spesa.

---

## 2026-10-03 — «Cucina iPhone» diventa «Gestione Frigoriferi e scorte» `[core]`

La sotto-app da telefono ora si chiama **Gestione Frigoriferi e scorte** e in basso ha solo due tab: **Frigo** e **Scorte**. **Oggi** (checklist e compiti del giorno) e **Lista spesa** sono pagine a sé, con il loro tasto nella Home della cucina. I tasti della Home cucina sono: Oggi, Gestione Frigoriferi e scorte, Lista spesa, Ricette, Menu Carta, Selezioni. Anche nel menu di Gestione Cucina le voci sono «Oggi» e «Frigoriferi e scorte».

---

## 2026-10-03 — Cucina: i tasti della Home e le Selezioni anche agli aiutocuochi `[core]`

Nella Home della cucina i tasti ora sono cinque, uguali per cuochi e aiutocuochi: **Cucina** (la sotto-app da iPhone), **Lista spesa**, **Ricette**, **Menu Carta**, **Selezioni**. Sous chef e commis possono ora aprire le Selezioni del giorno (macellaio, salumi, formaggi, pescato) in lettura, come la sala; modificarle resta ad admin e chef.

---

## 2026-10-03 — iPhone: il Logout si raggiunge sempre `[core]`

Su iPhone il tasto Logout in alto a destra poteva finire fuori dallo schermo quando il nome della sezione era lungo. Ora il nome della sezione si accorcia con i puntini e il Logout resta al suo posto; in più **«Esci (logout)»** c'è anche in fondo al menu delle sezioni.

---

## 2026-10-03 — Home della cucina: turni, Lavagna e tasti `[core]`

Cuochi e aiutocuochi (ruoli chef, sous chef, commis) entrando nel gestionale trovano una Home loro:

- **🗓️ I miei turni** — oggi, domani e i cinque giorni dopo, con gli orari di pranzo e cena (riposo e chiusura scritti chiari); «Tutto il mese →» porta alla pagina completa;
- **La Lavagna** — il briefing di servizio di sempre, in sola lettura;
- **i tasti** — Cucina iPhone, Frigo e congelatori, Lista spesa, Ricette, I miei turni (lo chef anche Selezioni del giorno). Si cambiano da Impostazioni → Home per ruolo.

Non vedono più l'incasso del giorno prima, i coperti del mese, la lista delle prenotazioni né le fatture: spariscono dalla pagina e il server non glieli manda proprio.

---

## 2026-10-02 — Conto economico: le note di credito riducono i costi `[core]`

Le note di credito ora contano nel **Conto Economico** col segno meno, nella categoria del fornitore (o delle righe) e nel **mese della loro data**, come fa il commercialista. Se una va spostata, si usa la competenza della singola nota di credito, come per le fatture. Effetto sul 2026: −929,67 € di costi (gennaio −381,60, febbraio −75,61, luglio −421,97, settembre −50,49). Stesso criterio nel riquadro «Dove appare nel Conto Economico» del dettaglio fattura e nei totali acquisti della dashboard Controllo Gestione.

Le statistiche di Acquisti (per fornitore, per categoria) e lo scadenzario restano come prima.

---

## 2026-10-02 — Rateizzazioni: la fattura d'origine si aggancia davvero `[core]`

Creando una rateizzazione dal wizard «Rateizza fatture», le fatture scelte non venivano agganciate alla rateizzazione: così, a rate finite, la fattura non si chiudeva mai e restava «pagata a mano» tra le uscite da riconciliare (è successo con Orobica Pesca 203567/FTM, divisa in 2 rate già pagate). Ora la fattura viene agganciata subito e risulta «rateizzata»; quando l'ultima rata è pagata, si chiude da sola. Per le rateizzazioni già create c'è un comando per agganciare le fatture dopo.

---

## 2026-10-02 — Docs e versioni rimessi in pari (sistema 5.42) `[core]`

Nessun cambio di codice. La versione di sistema era ferma a 5.41 dal 1° settembre nonostante 10 migrazioni (170→179): ora **5.42** in `VERSION` e `versions.jsx`. `roadmap.md` era ferma al 19 maggio: aggiunte/chiuse le voci di giugno–ottobre (M.G, M.J Pubblicazione web, carta di credito, pagamenti parziali, Intermittenti, Scorte & Frigoriferi, Cantina mobile, Ordini fornitori, Menu multilingua, omaggi, utenze, formaggi); l'ID M.J era doppio, l'Housekeeping diventa **HK**. `readme.md`: tolta la tabella versioni ricopiata (era ferma a Vini 3.8 / Sistema 5.3), Ubuntu 24.04, moduli nuovi in §9. Intestazione di `sessione.md` riscritta (era una riga da 15.000 caratteri di «DA PUSHARE» già in produzione). Sessioni e rilasci di maggio–giugno spostati in `archive/*_archivio_2026-06.md`. Nuove regole in `CLAUDE.md`: quando si alza la versione di sistema, aggiornare la roadmap, ripulire l'intestazione della sessione.

## 2026-10-02 — Note di credito: ora arrivano da Fatture in Cloud `[core]`

Il confronto con l'esportazione FIC del 2026 ha trovato tutte le fatture, ma **nessuna delle 8 note di credito** (1.126,30 €): il sync chiedeva a FIC solo le spese. Ora scarica anche le note di credito e le mostra in Acquisti → Fatture con il badge **NC** (filtro «Note credito», chip in alto, intestazione «NC» nel dettaglio).

Per ora **non cambiano i numeri**: le note di credito restano fuori da totali, conto economico, scadenzario, dashboard, statistiche per categoria, matching ingredienti, alert scadenze e candidati di riconciliazione, e non hanno uno stato di pagamento. Contarle in negativo nei costi e collegarle alla fattura che stornano sono i passi successivi (roadmap A.1).

---

## 2026-10-02 — Scadenzario: chiuso lo storico prima degli estratti bancari `[core]`

Il riquadro «da riconciliare» dello Scadenzario contava circa 1.300 uscite pagate a mano senza movimento bancario: quasi tutte fatture e rate del 2024-2025, precedenti al primo estratto del conto caricato in TRGB, che non si potranno mai collegare. Ora sono **chiuse come pagate**, con la nota «storico anteriore agli estratti bancari» (migrazione 179). La data limite è quella del primo movimento del conto, ricavata dai dati. Restano da riconciliare solo le uscite recenti, circa 70.

---

## 2026-10-02 — Cucina iPhone: la scheda dell'articolo su una pagina sola `[core]`

Niente più «✏️ Modifica» da aprire: la scheda di un articolo si legge scorrendo — in alto quanti ce ne sono, poi i tasti (Scarico, Carico, Scarto, Sposta), dove si trova e i lotti, poi i **dettagli** (nome, unità, confezione, come lo seguiamo, scorta minima, cos'è) già modificabili lì, e in fondo la storia dei movimenti. Se cambi un dettaglio compaiono «Salva modifiche» e «Annulla».

---

## 2026-10-02 — Riconciliazione: ora si vedono tutti i movimenti `[core]`

La pagina Riconciliazione mostrava solo i **500 movimenti più recenti**, senza avvisare. Il 2 ottobre voleva dire che tutto quello prima del 7 luglio 2026 non compariva: 1.212 movimenti su 1.712, di cui **227 ancora da riconciliare**. Ora la pagina carica tutti i movimenti; i filtri per data e importo funzionano come prima.

---

## 2026-10-02 — Rateizzazioni: due rate nello stesso mese `[core]`

Quando un piano rate (Abaco, Agenzia Entrate, PagoPA) ha due scadenze nello stesso mese, lo scadenziario ne creava una sola, e nei mesi senza rata inventava un'uscita all'importo medio. Con Abaco succedeva così:

- mancavano le rate del 31/03, 30/06, 30/11 (e le successive dello stesso tipo);
- c'erano uscite da 211,77 € a gennaio, maggio, ottobre 2026 e gennaio 2027 che non corrispondono a nessuna rata.

Ora lo scadenziario segue il piano: crea tutte le rate, anche due nello stesso mese, e toglie le uscite inventate se non sono mai state pagate né collegate. Gli affitti e le altre spese senza un piano completo non cambiano. Il Conto Economico conta la seconda rata nel suo mese.

Le correzioni si applicano al prossimo aggiornamento dello scadenziario (Controllo Gestione → aggiorna/importa uscite).

---

## 2026-10-02 — Carta di credito: commissioni PagoPA e casella «Cerca» riparata `[core]`

- **La casella di ricerca nel «Cerca» ora accetta il testo.** Non era mai stato possibile scriverci: ogni tasto andava in errore.
- **Proposte automatiche più ampie**: oltre alle uscite segnate «carta», il «Cerca» propone anche le uscite **non pagate e già scadute** senza metodo di pagamento (fatture come Tecnograph, rate Abaco).
- **Commissioni**: se la carta addebita fino a 2,00 € in più del documento (es. rata 211,00 € pagata 211,95 € via PagoPA), l'uscita viene proposta con «+0,95 € commissione». Collegandola resta pagata per il suo totale, e sull'uscita viene annotato «Pagata con carta 211,95 € (commissione +0,95 €)». La soglia si cambia in Flussi di Cassa → Impostazioni → Commissioni carta (migrazione 178).

---

## 2026-10-02 — Carta di credito: «Cerca» trova anche le uscite non segnate carta `[core]`

Nella finestra «Cerca» di un movimento carta, la ricerca ora:

- trova **tutte le uscite non ancora pagate**, non solo quelle già segnate «carta» (es. le rate Abaco pagate con PagoPA);
- cerca anche per **importo** e numero documento: «211» trova le rate da 211,00, 211,77, 211,95;
- non applica le tolleranze di importo e data: una rata da 211,00 pagata 211,95 con la commissione si trova lo stesso.

Collegando un'uscita così, diventa pagata con carta. Senza testo di ricerca la lista dei candidati resta quella di prima.

---

## 2026-10-02 — Carta di credito: estratti con quota annua e storni `[core]`

Il caricamento dei PDF della carta rifiutava due casi perché l'estratto «non quadrava»:

- **Quota annua** (riga senza codice categoria): ora viene letta come spesa.
- **Storni e rimborsi** (importo col meno in fondo, es. «16,44-»): ora entrano come accredito, non come spesa. Nel dettaglio estratto compaiono in negativo, nel riepilogo mensile si sottraggono e l'abbinamento automatico alle uscite li salta.

Verificato sugli estratti di giugno, luglio, agosto e settembre 2026: tutti e 4 quadrano al centesimo.

---

## 2026-10-01 — Formaggi: ordine di servizio, alternative e collegamento all'ingrediente `[core]`

Nella zona Formaggi di Selezioni del Giorno:

- **Posizione di servizio**: ogni formaggio ha il suo numero, dal più delicato al più intenso. La lista segue quell'ordine, divisa per Italia e Francia.
- **Base e alternative**: un formaggio può essere «alternativa» di un altro. In elenco compare rientrato sotto il suo posto («↳ alternativa a Gorgonzola DOP piccante») e di solito sta in archivio, pronto da riattivare quando sostituisce il base.
- **Ingrediente Food cost**: dal form si collega un formaggio al suo ingrediente; da lì arriva il costo al kg, visibile solo a cucina e admin. Si collega quando arriva la prima fattura del fornitore.
- Nuove categorie: Crosta fiorita, Crosta lavata, Semistagionati.

Caricati (dopo il push, con lo script di import) 7 formaggi francesi e 11 orobici con racconto e gusto per la sala; tolti i 4 vecchi formaggi di prova (Bagoss, Fontina, Formagella, Pecorino di Pienza).

---

## 2026-10-02 — Fix: le checklist non si potevano spuntare («Failed to fetch») `[core]`

Salvando le temperature dalla Cucina iPhone compariva «Failed to fetch». Non era la rete: il server rispondeva con un errore interno, e lo stesso succedeva a **ogni** spunta, completamento o «salta» di una checklist del Task Manager. Causa: al database delle checklist, ricreato da zero durante l'incidente di maggio, mancava la colonna del reparto sulle istanze. Ora il gestionale la rimette da solo all'avvio (e la riempie dal modello della checklist), insieme alle altre due colonne perse nello stesso modo. Nessun dato perso.

---

## 2026-10-02 — Cucina iPhone: le temperature di oggi all'apertura `[core]`

Il primo che apre la Cucina iPhone nella giornata trova la schermata **🌡 Temperature di oggi**: una riga per ogni frigorifero e congelatore, con la soglia accanto. Si scrivono i gradi (nei congelatori il «−» è già messo) e si preme «Registra». Se una temperatura è fuori soglia la riga diventa rossa: si registra lo stesso e compare l'avviso di chiamare l'oste. Le letture vanno nel registro HACCP di sempre e la scheda di ogni frigo mostra l'ultima. Admin e oste/cuoco hanno anche «Ignora per oggi», che resta scritto nel registro con il loro nome.

---

## 2026-10-02 — Scorte cucina: il pallino segue la quantità `[core]`

Sugli articoli che seguiamo «a movimenti» (tutti quelli dei congelatori) il pallino non si cambia più a mano: lo decide il numero. A zero diventa **rosso** e l'articolo va in lista spesa (se non ce n'è più da nessuna parte); sotto la **scorta minima** diventa **giallo**; con un carico torna **verde** da solo. Toccare il pallino apre «Quanti ce ne sono?», con un tasto «finito» per lo zero. La scorta minima si imposta da ✏️ Modifica. Gli articoli a semaforo (sale, carta forno…) restano col tocco a mano.

---

## 2026-10-01 — Scorte cucina: congelatori con date, spostamenti e aggiunte dal telefono `[core]`

Tre cose nuove nella Cucina da iPhone:

- **↔ Sposta**: dalla scheda di un articolo lo sposti su un altro ripiano, anche di un altro frigo o congelatore. Scegli da dove, quanti e dove; la storia mostra lo spostamento e l'Annulla lo disfa tutto insieme.
- **Date e scadenze**: quando carichi qualcosa in congelatore, l'app chiede «congelato il» (oggi) e propone «scade il» a **180 giorni**, che puoi cambiare. Nel giro del congelatore ogni riga mostra la scadenza più vicina, colorata quando mancano 5 giorni o meno. Quando usi o butti qualcosa, esce per prima la roba che scade prima.
- **＋ Aggiungi** su ogni ripiano: scrivi cosa metti, l'app cerca prima fra gli articoli che ci sono già (niente doppioni), altrimenti lo crea. Puoi mettere subito la quantità e le date.

Creare articoli e metterli su un ripiano ora lo può fare tutta la brigata. Togliere un articolo da un ripiano o disattivarlo resta ad admin e oste/cuoco.

---

## 2026-09-28 — Scorte cucina: si corregge dal telefono `[core]`

Aprendo un congelatore dall'iPhone (Cucina → Frigo) si vedevano gli articoli ma non si poteva sistemare niente. Adesso, toccando il nome di un articolo:

- **✏️ Modifica** in alto: nome, unità (pz, cf, kg, g, l, ml), confezione («vaschetta 500 g»), come lo seguiamo (semaforo / conta / movimenti) e cos'è (crudo, cotto, semilavorato…).
- **Quanti ce ne sono?** toccando la riga del ripiano in «Dove si trova»: scrivi il numero vero. Non sovrascrive: resta nella storia come rettifica, con chi l'ha fatta e da quanto a quanto.
- **‹ Congelatore 1**: dalla scheda si torna al congelatore da cui si era entrati, non più alle Scorte.

Le modifiche le può fare tutta la brigata (admin, chef, sous chef, commis). Disattivare un articolo resta ad admin e chef.

**Menu in alto su iPhone.** Il menu a tendina dei moduli (quello al centro dell'intestazione) su iPhone non si riusciva a usare: all'apertura metteva il cursore nella ricerca, si apriva la tastiera sopra la lista e Safari zoomava sul campo. Ora su telefono la ricerca non si attiva da sola (la tastiera esce solo se tocchi il campo, e senza zoom), e il menu è largo quanto lo schermo, agganciato sotto l'intestazione. Su computer non cambia niente.

**Menu delle sezioni su iPhone.** La fila di voci sotto l'intestazione (Vini: Dashboard, Cantina, Ordini…; Dipendenti, Controllo Gestione, Banca, Clienti e le altre) su telefono finiva fuori dallo schermo e le ultime voci non si raggiungevano. Ora sul telefono c'è un solo pulsante con la voce in cui sei («🍷 Cantina ▾»): toccandolo si apre dal basso l'elenco completo, con voci grandi. Su computer e iPad la fila resta com'era (e se non ci sta, scorre di lato). Vale per 11 sezioni; il Task Manager aveva già la sua barra in basso e non cambia.

Nel menu della sezione **Gestione Cucina** c'è ora la voce **📱 Cucina iPhone**, che porta alla sotto-app da telefono (prima si trovava solo nel menu in alto).

Caricati in produzione (dall'app, non da codice) i due congelatori reali: **Congelatore 1** e **Congelatore 2**, 6 ripiani ciascuno, freezer −25/−18 °C, 59 articoli dall'inventario cartaceo.

---

## 2026-09-27 — Vini: la pagina Ordini ha le stesse informazioni della dashboard `[core]`

In **Vini → Ordini**, ogni vino della lista «Da ordinare» ora mostra quello che prima si vedeva solo nell'avviso della dashboard:

- **giacenza e giorni di copertura** in evidenza accanto al nome («🍷 2 bt · ~9gg»), con l'annata nuova se è già in cantina;
- **vendite**: ritmo per esteso («Vende · 3.2 bt/mese») e quando è uscita l'ultima bottiglia («venduto 4gg fa», oppure «finito» se è a zero);
- **ultimo acquisto** del vino, su qualunque annata («comprato ~5 mesi fa»).

Sulla riga ci sono anche **⛔ Non ricomprare** e **🗓️ Annata esaurita**: il vino esce dalla lista (e dal carrello, se c'era) e finisce in **Messi da parte**, dove ora c'è **↩︎ ripristina** per tornare indietro. Il pulsante per creare la nuova annata diventa 🗓️➕.

Dashboard e pagina Ordini usano adesso gli stessi badge. Unica differenza visibile in dashboard: «finito» compare solo per i vini a zero bottiglie, per gli altri si legge «venduto».

---

## 2026-09-20 — Vini: rigenerare il tempo di apertura di una bottiglia al calice `[core]`

Nella card **Calici disponibili** di **Vini → Vendite** ogni bottiglia mostra da quanto è aperta, e diventa gialla e poi rossa col passare delle ore. Finora quel contatore partiva da solo all'apertura e non si poteva correggere: se la bottiglia veniva finita e sostituita con una nuova dello stesso vino, o se l'apertura veniva registrata il giorno dopo, la riga restava rossa «aperta da 4 giorni» con dentro un vino stappato ieri.

Da adesso c'è un pulsante **↻** accanto alla ✕: chiede conferma (ricordando da quanto risulta aperta) e fa ripartire il contatore da adesso. Non cambia giacenze, prezzi, né lo stato «in mescita»: riscrive solo la data.

Il pulsante è **riservato ad admin e superadmin** e compare **solo in Vini → Vendite** — non nella Dashboard Sala, nemmeno per un admin. Aprire e chiudere una bottiglia resta un'azione di servizio che fa anche la sala; rigenerare il timer no, perché vuol dire spegnere l'avviso di bottiglia vecchia.

Ogni reset resta scritto nello storico movimenti del vino come `[CALICI-RESET]`, con l'età che la bottiglia aveva prima.

**Nota:** se la bottiglia non è in mescita non c'è niente da rigenerare — il pulsante non c'è e l'API risponde 409.

---

## 2026-09-18 — Intermittenti: il riepilogo del mese, dipendente per dipendente `[core]`

A fine mese il consulente chiede in quali giorni sono state fatte le chiamate. Fino a ieri bisognava ricostruirlo a mano dal Foglio Settimana, e non c'era modo di sapere quali giornate fossero state davvero comunicate all'Ispettorato.

In **Dipendenti → Intermittenti** c'è ora la tab **Riepilogo mese**: scegli il mese e vedi, per ogni intermittente, quante giornate ha lavorato, quante risultano comunicate e quante no. Aprendo un nome escono i giorni uno per uno, verdi se comunicati (col numero dell'invio e la data) e rossi se scoperti. Se c'è anche una sola giornata scoperta compare un avviso in cima.

Il bottone **Scarica CSV** produce la lista da allegare all'email del consulente: una riga per giornata, con codice comunicazione e comunicata sì/no. Si apre in colonne anche con l'Excel italiano.

Attenzione a cosa sono questi numeri: **turni programmati, non presenze timbrate**. Se un turno salta e il Foglio Settimana non viene aggiornato, il riepilogo conta una giornata che non c'è stata.

Nota: il modulo Intermittenti è entrato davvero in funzione il **17 settembre**, col primo invio reale all'Ispettorato (8 giornate, dal 18 al 27 settembre).

---

## 2026-09-12 — Spese fisse: la data di una rata si sposta dallo Storico `[core]`

L'affitto era rimasto indietro di una rata e non c'era modo di spostarne la data: nello **Storico addebiti** la scadenza si poteva solo leggere, e «Modifica» sulla spesa fissa cambia il giorno delle rate future, non quelle già in elenco.

Da adesso, in **Controllo Gestione → Spese Fisse → Storico**, la data di scadenza è un campo: la cambi e si salva subito. Vale per le rate ancora da pagare; quelle già pagate o parziali restano bloccate (per riaprirle c'è «riapri rata» dentro **Piano**).

La rata spostata si marca **Spostato**, come già succede nello Scadenzario, e resta la possibilità di rimetterla alla data originale. Il mese di competenza **non** cambia: una rata di gennaio pagata a ottobre pesa sempre su gennaio nel Conto Economico, si sposta solo la data in cui esce il denaro.

In più lo Storico mostra ora anche la colonna **Stato** (Programmato / Scaduto / Spostato / Pagato), che prima non c'era.

---

## 2026-09-10 — Bottiglie fantasma in matrice: non si possono più creare `[core]`

Il Toscana 50 e 50 (#607) risultava con **1 bottiglia** ma frigo, locazioni e matrice erano tutti a zero, e non c'era verso di toglierla: «Modifica giacenze» non tocca la matrice e in griglia non c'era nessuna cella da cliccare. La bottiglia era già stata venduta il 16 maggio; il conteggio era rimasto indietro con il passaggio alla nuova Cantina di maggio, che aveva lasciato fuori di proposito i vini in matrice. Stessa storia per il Sagrantino 25 anni, il Barolo Bric Fiasc e il Gevrey-Chambertin, già sistemati a mano.

Da oggi la **matrice conta solo le celle**: una cella = una bottiglia, sempre.

- **Movimenti in scheda:** scegliendo «Matrice» si toccano le celle — quelle del vino per vendita e scarico, quelle libere (griglia già aperta) per il carico. La quantità è il numero di celle scelte. Senza celle il movimento viene rifiutato con un messaggio chiaro, invece di scalare un numero che poi non torna.
- **Annullare un movimento** della matrice non inventa più una bottiglia in griglia: la rimette nel totale «senza posizione», e la scheda te lo dice.
- **Nuovi vini e import Excel:** la matrice nasce dalle celle scritte in LOCAZIONE_3, es. (3,6), (3,7). Se il numero non torna o la cella è già occupata, la riga va in errore.
- **Vendite:** la griglia si apre solo se il vino ha celle vere; un vino rimasto con la posizione scritta ma senza celle si vende lo stesso, senza restare bloccato.
- **Se qualcosa non torna, lo vedi:** in **Giacenze** compare il riquadro rosso **«Giacenza da sistemare»** con il motivo (es. «1 bt senza posizione») e il pulsante **Riallinea**, che porta il totale ai posti reali e lascia una rettifica nello storico. In più, una volta al giorno, una notifica ad admin se c'è almeno un vino in queste condizioni (configurabile da Impostazioni → Notifiche → «Giacenze vini da sistemare»).

---

## 2026-09-10 — Cantina mobile ha il suo tasto in Home `[core]`

Fra le azioni rapide della Home adesso c'è **📱 Cantina mobile**, subito dopo Cantina Vini: un tocco e sei nella pagina da telefono per trovare e muovere le bottiglie, senza passare dal menu Vini.

Compare a chi la pagina la può aprire davvero — **admin, superadmin, sommelier e sala** (nella dashboard di sala, dopo Cantina Vini). Cucina, contabile e gli altri ruoli non lo vedono: per loro sarebbe un tasto che porta ad «accesso negato».

Come gli altri tasti si sposta, si rinomina o si spegne da **Impostazioni → Home per ruolo**. Anche «Ripristina default» ora lo include.

---

## 2026-09-10 — Cantina mobile: la matrice in ordine di posizione `[core]`

In **Cantina mobile → Per scaffale → Matrice** le etichette erano in ordine alfabetico: per fare il giro dello scaffale a griglia bisognava saltare avanti e indietro. Ora seguono la posizione, **colonna per colonna e, dentro la colonna, riga per riga** — la stessa convenzione di sempre, primo numero la colonna e secondo la riga, come su Excel. Un vino che occupa più celle si mette al posto della sua prima cella.

Ogni riga mostra davanti al nome le sue celle, es. **(3,6) (3,7)**; oltre tre si legge «+N». I vini in matrice senza celle leggibili finiscono in fondo, in ordine alfabetico. Gli altri scaffali e il frigo restano alfabetici.

---

## 2026-09-08 (notte) — Fix: i collegamenti che valevano zero `[core]`

Poche ore dopo il rilascio dei parziali, Marco ha visto due bonifici del 30 giugno con scritto **«Parziale: € 0,00 su € 174,22»**: collegati, ma come se il collegamento non contasse niente. E non si potevano rifare, perché il collegamento c'era già.

Colpa di una riga di codice troppo letterale. Per capire quanto di un bonifico assegnare a una fattura, il sistema cercava le fatture "non ancora pagate" — escludendo quelle che avevi già segnato pagate a mano. Ma è proprio quello il caso più comune: segni la fattura come pagata quando la paghi, e la banca lo conferma giorni dopo. Non trovando niente da assegnare, il collegamento nasceva a zero.

Ora il criterio è quello giusto: conta se la fattura è già stata **vista dalla banca**, non se tu l'hai già segnata pagata. Fra i due, sulla riconciliazione, ha ragione la banca.

I collegamenti già nati a zero vengono riparati da soli al primo avvio: tornano a valere l'intera fattura e l'uscita viene agganciata al suo movimento, con la data giusta.

---

## 2026-09-08 (sera) — Tre bonifici rimessi al posto giusto, e 65 incassi fantasma `[core]`

Con i parziali appena fatti, siamo andati a vedere cosa avevano lasciato indietro gli anni in cui non c'erano.

**Il bonifico Bugan del 23 maggio non pagava quello che sembrava.** 535,82 + 887,37 fa esattamente 1.423,19: quel bonifico saldava le due fatture arretrate, non la fattura di maggio e un caffè da 88 €. Conseguenza: **la fattura da 887,37 risultava ancora da pagare** — un debito che non esisteva — mentre la fattura di maggio veniva data per pagata un mese prima del vero. Il suo bonifico, quello vero del 30 giugno, era lì da due mesi senza nessuno che lo reclamasse.

Cercando lo stesso schema su tutti i movimenti sono saltati fuori altri due casi: le **RiBa di Tris Moka sfasate di un mese**, e una **fattura Amazon** finita sull'addebito da 94,81 invece che su quello da 92,04 che le corrispondeva al centesimo. Tutti e tre rimessi a posto, con i movimenti che ora quadrano da soli senza bisogno di chiuderli a mano.

**E i 65 incassi POS che non erano mai esistiti.** Il 31 marzo, alle 20:40, hai registrato gli incassi di febbraio e marzo. Trentacinque minuti dopo, una pulizia automatica ha cancellato dei movimenti bancari entrati due volte — e si è dimenticata di portarsi dietro gli incassi collegati. Sono rimaste 65 righe appese al nulla per 58.433 €, tutte copie di incassi già registrati correttamente. Non si vedevano da nessuna parte e non falsavano nessun conto, ma erano le uniche 65 crepe nell'integrità del database: **ora sono zero**.

---

## 2026-09-08 — I pagamenti parziali esistono `[core]`

Fino a ieri, collegare un bonifico a una fattura in Riconciliazione voleva dire una cosa sola: **pagata, tutta**. Anche quando il bonifico era più piccolo della fattura. Il sistema non lo diceva, non lo chiedeva, non lasciava traccia: la fattura risultava saldata e la differenza spariva.

**Ora il collegamento guarda le cifre.** Bonifico da 400 € su una fattura da 500 €: la fattura resta aperta per 100 €, marcata «parziale», e un avviso in giallo te lo dice nel momento in cui colleghi. Se invece ballano pochi centesimi (bolli, spese banca) resta pagata: sotto **1 €** lo scarto è arrotondamento — e quel limite ora si cambia da **Flussi di Cassa → Impostazioni → Soglie riconciliazione**, senza toccare il codice.

**Una fattura si può pagare in due bonifici.** Il primo la lascia a metà, il secondo la chiude. Se ne stacchi uno, torna parziale invece di tornare «da pagare» come se non avessi mai pagato niente.

**Il tab «Collegati» dice la verità.** Bastava che una fattura fosse agganciata a un movimento perché finisse fra i riconciliati, importi o non importi: per questo capitava di leggere «Collegati» in cima e «1 parziale» in fondo alla stessa pagina. Ora la riga resta da lavorare finché i conti non tornano, e chi ha più documenti che soldi usciti viene segnalato come **sovra-collegato** — lì il problema è togliere, non aggiungere.

**Nessun movimento vecchio cambia posto**: i tre casi storici che sarebbero riemersi (i bonifici parziali Reepack e MALOWINE, più un residuo di 112 € accettato a gennaio) sono stati chiusi con la loro nota.

Sistemato anche lo **0 che compariva sotto il pulsante Scollega**: uno zero di troppo, stampato per un dettaglio di come React tratta i numeri.

---

## 2026-09-07 — La cucina comincia ad avere un magazzino `[core]`

Come la cantina dal telefono, ma per la cucina. Per ora c'è solo il motore: **nessuna schermata, nessun dato dentro**, quindi in osteria oggi non cambia niente. Serviva prima decidere come funziona.

**I frigoriferi diventano cose vere.** Non più una riga di testo dentro una checklist: un frigo ha i suoi ripiani numerati, le sue soglie di temperatura, i suoi guasti, la sua storia. Un giorno potrà dirti «è la terza volta in dieci giorni che va sotto zero» — una frase che oggi nessuno può dirti.

**Si parte dal posto, non dall'articolo.** Apri il frigo carne, vedi i ripiani dall'alto in basso, spunti cosa manca. La roba finita resta elencata: se sparisse dalla lista quando finisce, la lista nasconderebbe proprio quello che stai cercando.

**Ogni cosa si gestisce come merita.** Il sale ha un pallino verde/giallo/rosso e basta. La dispensa si conta ogni tanto. La carne, se vuoi, si scarica ogni volta. Tre modi diversi che convivono senza pestarsi.

**E quando il dato invecchia, te lo dice.** Se un articolo che dovresti scaricare resta fermo cinque giorni (ventuno per la roba secca), il numero smette di essere scritto secco e diventa «≈ 4,2, da verificare». Perché un numero preciso e sbagliato è peggio di nessun numero: ci prendi decisioni sopra.

**Quello che segni finito finisce nella spesa da solo**, con scritto da che frigo viene. E se lo segni per sbaglio, hai otto secondi per tornare indietro.

**Le temperature restano dove sono sempre state**, dentro le checklist HACCP. Non ne ho fatto un secondo registro: due registri prima o poi divergono, e quello sbagliato lo scopri davanti all'ASL.

**E la parte che si vede c'è già.** Quattro schede sul telefono, sotto Gestione Cucina → **Cucina da iPhone**:

- **Oggi** — le checklist del giorno e i task, da spuntare col pollice.
- **Scorte** — cerchi una cosa e la trovi, con dove sta e quanto ne resta.
- **Frigo** — il giro: apri un frigo, vedi i ripiani dall'alto in basso, spunti cosa manca.
- **Spesa** — la lista, raggruppata per fornitore.

**Prima di usarla vanno configurati i frigo**: quali sono, quanti ripiani, cosa ci sta dentro. Finché non lo fai le schermate sono vuote, e va bene così — nessuno rischia di trovarsi dati inventati.

## 2026-09-03 — Gli omaggi tornano nell'imponibile `[core]`

Hai trovato tu lo scarto: il prospetto che mando al commercialista non tornava con quello che l'Agenzia già sapeva. Il 28 agosto il gestionale dichiarava **2.252,73** di imponibile, l'Agenzia ne aveva **2.260,00**. Sette euro e ventisette. La causa: gli omaggi.

**Chi sbagliava era il gestionale, non il registratore.** Quando regali un piatto, quel piatto per l'IVA è venduto lo stesso: l'imposta esiste, semplicemente la paghi tu invece del cliente. Il registratore lo sa e lo scrive («non riscosso omaggio»), e trasmette il numero giusto per conto suo. Il gestionale invece partiva dall'incassato — dove l'omaggio, ovviamente, non c'è — e scorporava da lì.

**Cosa cambia in chiusura turno:** un campo in più, 🎁 **Omaggi**, dove batti la voce «TOTALE GIORNO OMAGGI» che hai già davanti sullo scontrino. Nient'altro da fare.

**Cosa NON cambia:** la quadratura di cassa. Gli omaggi non sono entrati in cassa e non devi giustificarli. È la differenza con gli annulli, che si comportano al contrario: entrambi restano fuori dalla cassa, ma un annullo sparisce anche dall'imponibile, un omaggio no.

Il PDF per il commercialista ora ha una colonna «di cui omaggi», così lo scarto tra imponibile e incassato si legge invece di doverlo spiegare.

**Da sapere:** lo storico non si recupera da solo, il dato non è mai stato registrato. Le chiusure vecchie le correggi tu a mano con lo scontrino in mano, e ristampi i PDF. E se non ti va di pagare l'IVA sugli omaggi, la strada è battere quei piatti come **sconto** invece che come omaggio — cambia il trattamento fiscale, quindi chiedi prima al commercialista.

Nel farlo è saltato fuori un secondo difetto, più vecchio: il PDF **non toglieva gli scontrini annullati** dal corrispettivo, mentre il resto del gestionale lo faceva. Ora anche quello è allineato.

## 2026-09-03 — Finito il giro, con una toppa da mettere subito `[core]`

Chiuso anche il resto: cantina, ordini, prezzi, anagrafiche vini, menu pranzo, archivio ricette, matching fatture. Su **836 indirizzi interni, 776 ora chiedono chi sei prima di rispondere.** I 60 che restano aperti lo sono apposta: il menu col QR al tavolo, il login, i turni che tutti devono poter guardare, le notifiche, la chiusura di cassa della sala. Nel modulo Vini non cambia niente per chi ci lavora.

**Ma c'è una cosa da sistemare adesso.** Le stampe dell'inventario si aprono in una finestra nuova, e in quel caso la password viaggia dentro l'indirizzo invece che nascosta nella richiesta. La serratura che ho messo guardava solo il posto nascosto: **in questo momento, sul gestionale vero, le stampe dell'inventario e l'export della cantina rispondono "non autorizzato" a tutti, te compreso.** Il rimedio è pronto e aspetta solo di essere caricato — dopo, la serratura sa guardare in entrambi i posti.

Era stata intercettata dal controllo prima del push, ma nel frattempo un caricamento partito da un altro lavoro si era già portato via la versione vecchia.

**Un paio di stranezze che c'erano già.** In alcuni punti della cantina la sala vede la pagina ma il gestionale le dice di no — quando sceglie un prezzo al calice fuori standard, o quando prova a inserire un vino nuovo. Non viene da oggi: o quelle pagine non devono essere aperte alla sala, o la sala deve poterle usare davvero. Dimmi tu.

## 2026-09-01 — Ogni porta ha di nuovo una serratura `[core]`

Il gestionale aveva 836 indirizzi interni. Fino a stamattina, **636 di questi rispondevano a chiunque avesse una password valida** — qualunque password, di qualunque ruolo. Il conto corrente, il conto economico, le fatture, i dati di 5.900 clienti, gli incassi storici: tutto raggiungibile da un account con i permessi più bassi che esistano, bastava conoscere l'indirizzo. Adesso ne restano 223, e sono quasi tutti aperti apposta.

**Non ho applicato le regole alla cieca.** Prima ho mappato cosa fa davvero l'app, e sono saltate fuori trenta situazioni in cui la regola scritta dice una cosa e il lavoro vero ne dice un'altra: la home della sala che legge i calici aperti, la chiusura di cassa della sera, i vini che il sommelier inserisce dal telefono, le gift card al banco. Applicare le regole alla lettera avrebbe bloccato il servizio in trenta punti. Quindi le ho applicate dove non cambiano il lavoro di nessuno, e ti ho chiesto delle altre.

**Cosa cambia per chi lavora:** quasi niente, ed è il punto. La sala continua a chiudere la cassa, a emettere gift card, a muovere le bottiglie, a unire le schede cliente. La cucina continua a fare la sua parte. L'unica differenza visibile è nelle **selezioni del giorno**: le prepara la cucina, e sala e sommelier ora le consultano e segnano il venduto, ma non le modificano più — come avevi deciso. Vedono una targhetta «Sola lettura» al posto dei bottoni.

**Cosa cambia per chi non lavora qui:** un account rubato, o uno vecchio mai disattivato, non apre più il conto corrente.

Il modulo Vini l'ho lasciato esattamente com'era: lì sala e sommelier scrivono davvero, ed è il flusso giusto.

Restano da decidere due cose sull'archivio ricette, e una piccola sorpresa: **le pagine dei tavoli e della configurazione prenotazioni hanno lo stesso identico difetto che avevi trovato tu sulle buste paga** — sono dichiarate riservate ma non lo sono. Aspetto di sapere se la sala deve poter spostare i tavoli prima di toccarle.

## 2026-09-01 — Il listino dei costi non è più su internet `[core]`

Due indirizzi del gestionale rispondevano **a chiunque, senza password**: restituivano l'elenco completo degli ingredienti con l'ultimo prezzo pagato a ogni fornitore. Il tuo listino costi, leggibile da un browser qualsiasi. Non li usava nessuno — né il gestionale né tu — erano rimasti aperti da quando il modulo food cost è nato. Chiusi. Un terzo indirizzo, un vecchio menu per ruolo che nessuna pagina apriva più, è chiuso anche lui: l'ho lasciato al suo posto invece di cancellarlo, buttare via un pezzo di codice è una decisione tua.

**E ho costruito il pezzo che mancava.** Fino a ieri, ogni volta che si doveva dire «questo lo fa solo l'amministratore», il controllo si riscriveva a mano nel punto in cui serviva: otto versioni diverse della stessa cosa, sparse per il gestionale, ognuna con la sua possibilità di sbagliare. Adesso c'è un posto solo dove si dichiara chi può fare cosa. Proteggere una funzione è diventata una riga.

Con un dettaglio che vale il lavoro: se qualcuno scrive male il nome di un ruolo — «sommellier» invece di «sommelier» — il gestionale **si rifiuta di partire** e dice dov'è l'errore. Prima un errore così passava inosservato e lasciava la porta aperta, senza che niente lo segnalasse.

Non risolve il resto della casa, che resta da fare modulo per modulo. Ma da qui in avanti il lavoro è applicare una regola, non inventarla ogni volta.

## 2026-09-01 — Le buste paga le vede solo chi deve `[core]`

Chi lavora in osteria entrava nel modulo Dipendenti per guardare i turni e si trovava lì, nella barra in alto, il tab **Buste Paga**. Un clic e leggeva i cedolini di tutti. Sotto, l'anagrafica restituiva IBAN e codici fiscali a chiunque fosse loggato, con qualsiasi ruolo.

**Adesso** sommelier, sala, cucina vedono un tab solo: **Turni**. Il foglio settimana si apre in sola lettura — i turni della squadra si guardano, non si toccano — con una targhetta «👁️ Sola lettura» che lo dice chiaro. Buste paga, costi, scadenze documenti, anagrafica e la comunicazione al Ministero per gli intermittenti restano a te.

**La differenza vera è sotto il cofano.** Prima la protezione era solo grafica: nascondeva la voce di menu, ma l'indirizzo web funzionava lo stesso per chiunque lo conoscesse. Ora sono i **59 controlli nel motore** a rifiutare la richiesta, e la pagina nascosta è solo la cortesia in cima. Anche l'elenco del personale, che serve alle viste turni per i nomi, adesso a chi non è amministratore arriva senza IBAN, codice fiscale, telefono, email e indirizzo.

**Una cosa da sapere:** il **contabile** perde l'accesso a buste paga e costi — è la scelta che hai fatto. Se dal Conto Economico clicca la riga stipendi, torna alla Home.

**Controllando il resto della casa** è venuto fuori che il problema non era solo qui: su 836 indirizzi del gestionale, 636 sono ancora aperti a chiunque abbia una password valida, e 3 sono aperti pure senza. Il quadro completo, ordinato per danno, sta in `docs/audit_permessi_2026-09-01.md`.

## 2026-09-01 — Quando la bottiglia in mescita finisce, il vino esce davvero dalla carta `[core]`

Aprivi un vino per i calici, e finita la bottiglia cliccavi la ✕ sui vini aperti. Spariva il tag **«in mescita»**, ma il vino restava nella sezione **Al calice** della carta. Con un prezzo al calice per un calice che non c'è più.

**Perché succedeva.** Aprire una bottiglia accendeva due cose invece di una: lo stato del momento (*c'è una bottiglia stappata adesso*) e il flag di anagrafica (*questo vino sta sempre al calice*). La ✕ spegneva solo il primo. Il secondo restava acceso per sempre, e da solo bastava a tenere il vino in carta finché aveva giacenza.

Il flag di anagrafica non serviva nemmeno: la carta al calice prende sia i vini flaggati sia le bottiglie aperte, quindi l'apertura ci entrava già per conto suo.

**Adesso** aprire e chiudere la mescita tocca solo lo stato del momento. Apri → il vino compare al calice; chiudi → esce. Il flag «sempre al calice» resta una tua scelta esplicita in anagrafica, e nessuna apertura estemporanea te lo cambia più alle spalle.

**Una conseguenza voluta:** alla bottiglia successiva ti richiede di nuovo il prezzo del calice — giusto, è una decisione per apertura — ma te lo propone già scritto uguale all'ultima volta.

**Ripulite anche le bottiglie rimaste così dalle aperture vecchie.** Erano 31: le hai riviste una per una e ne sono state spente 15 (Bakkanali KANI e ROSA, Lagrein, Bordeaux Lavergne, Champagne Jaffelin, Pinot Nero Maculan, Crémant Limoux, Chardonnay Festival, Lapis Argentum, Chardonnay Martina, Pinot Nero Colterenzio, Côtes du Rhône, Champagne Brut Tradition, Vieris, Cabernet Franc). Le altre 16 restano al calice perché è quello che vuoi. La pulizia si fa con `scripts/bonifica_calici_2026-09.py` sul VPS: fa un backup prima di toccare, si rifiuta di lavorare su una bottiglia aperta in quel momento e lascia una riga nella storia di ogni vino.

## 2026-08-21 — Cantina mobile: la bottiglia si muove dal telefono `[core]`

La scheda del vino in **Cantina mobile** non è più solo da guardare. In fondo allo schermo, dove arriva il pollice, ci sono tre tasti: **🍷 venduta −1**, **➕ carico**, **✏️ conta**. Se la bottiglia sta in un posto solo, il tasto fa e basta; se sta in due posti, chiede prima da dove — che è poi la stessa domanda che fa il gestionale.

**Ogni movimento si può annullare per otto secondi.** Compare la striscia scura in basso con «Annulla»: un tocco e il movimento sparisce davvero, non viene compensato con un movimento contrario. Stessa meccanica della vista sommelier al banco.

**I posti sono diventati toccabili.** Nella card «Dove si trova», tocchi «Frigo sala» e ti si apre il menu di quel posto: venduta, scarico (rotta, omaggio, assaggio: esce senza contare come vendita), carico, conta. La conta chiede quante ce ne sono davvero lì e sistema la differenza da sola.

**I movimenti ora si leggono.** Prima erano un pannello chiuso con otto righe minuscole. Adesso sono aperti, divisi per giorno (Oggi, Ieri, lun 18 agosto), con l'ora, chi l'ha fatto, da che parte del sistema arriva il movimento e — la cosa che serve davvero in cantina — **quante bottiglie restavano dopo**. Sull'ultimo movimento c'è «annulla», anche a distanza di giorni.

**🥂 Apri in mescita** si fa dalla scheda, senza passare dalla carta staff.

**Chi può muovere le bottiglie:** tu e il sommelier. La sala vede la scheda in sola lettura, ma può ancora aprire e chiudere la mescita, che è servizio.

**Due cose che il telefono di proposito non fa**, per non sballare i numeri: non usa la rettifica (quella è un valore assoluto sul totale e non tocca i singoli posti: totale e somma degli scaffali finirebbero per non tornare più), e non sposta lo **scaffale a matrice**, che ha bisogno delle celle e quelle si scelgono dal gestionale.

**Testi più grandi e colori più decisi** su tutta la pagina: sotto le luci calde della cantina il grigio chiaro spariva.

---

## 2026-08-08 — Gift Card: i buoni regalo escono dall'Excel `[core]`

Nuova sezione **Clienti → 🎁 Gift Card**. Sostituisce il file Excel con cui i buoni venivano tenuti finora.

**Al banco è una cosa sola: digiti il codice e sai.** Campo grande in cima alla pagina, con il focus già dentro. Maiuscole, spazi e trattini non contano: `tg4kmp9xqd` trova `TG-4KMP-9XQD`. Il verdetto è a colori — verde spendibile con importo e intestatario, ambra se c'è qualcosa che non va (già usata il 3/5, scaduta il 12/7), rosso se il codice non esiste. Se è buona, un bottone **Scarica** e il campo si ripulisce da solo pronto per il prossimo, senza dover cliccare.

**Uso unico, come da tua scelta:** una card si emette, si scarica in un colpo, o si annulla. Niente residui parziali da rincorrere. Chi ha sbagliato al banco può farla riattivare da un admin, e l'operazione resta scritta nello storico con nome e ora.

**Due tipi di buono.** A **valore** (l'importo compare grande sul buono) o a **esperienza** ("Cena degustazione per due"), e in quel caso l'importo **non compare**: chi riceve il regalo non deve leggere quanto è stato speso per lui.

**I codici sono fatti per essere letti al telefono.** Formato `TG-4KMP-9XQD`, senza caratteri che si confondono a voce o a mano: niente `0/O`, `1/I/L`, `5/S`, `8/B`. In emissione il codice si può anche scrivere a mano, così i buoni già in circolazione si registrano com'erano.

**Il buono si stampa.** PDF A5 orizzontale con l'identità dell'osteria (non il brand del gestionale: quello resta sui documenti interni), leggibile anche fotocopiato in bianco e nero. Si scarica da solo appena emetti la card, e dall'elenco col bottone PDF.

**Un alert quando stanno per scadere**, riepilogativo una volta a settimana: sono soldi già incassati, la cosa utile è chiamare quella gente prima della scadenza, non ricevere dodici notifiche. Soglia (30 giorni) e destinatari da Impostazioni → Notifiche.

**Sulla cassa non tocca niente**, come deciso: né all'emissione né allo scarico. È un registro che dice quanto valore è ancora in giro (`valore_spendibile` nei numeri in testata), i corrispettivi li metti tu dove servono.

**I codici seguono la tua serie**: `B126-354`, cioè lettera del bollettario + anno + progressivo. Il progressivo prosegue da dove eri arrivato (353) e non si azzera a Capodanno; la lettera è un'impostazione che cambi tu quando cambi bollettario. In emissione vedi il numero che sta per uscire prima di confermare, e puoi sempre scriverne uno a mano.

**Lo storico dell'Excel è già dentro**, travasato una volta sola con la migrazione 167: **90 buoni**. Nessuna funzione di import nell'app — era un trasloco, non una feature.

**I buoni emessi prima del 2025 risultano scaduti** (scadenza al 31/12/2024): 56 card per 10.540 €. Restano **18 buoni spendibili per 2.285 €**. Se decidi di onorarne uno vecchio, dalla sua scheda sposti la scadenza e torna verde: non sono stati cancellati né annullati, solo messi fuori validità.

Restano fuori i 46 precedenti al 2024 e le 35 righe senza importo (le "BOX" e le celle vuote). Il taglio segue la **serie del codice, non la data**: `A125-330` è serie 2025 anche se la cella dice un altro anno. Serviva, perché la serie A124 è stata aperta a dicembre 2023 per i regali di Natale — filtrando per data si sarebbero persi 18 buoni ancora validi per 3.535 €. Dove l'importo mancava ma la descrizione diceva `deg 130`, il valore è stato dedotto e la cosa resta scritta nello storico della card. Le date scritte a mano sono state interpretate (`20/'5/2'23` → 20/05/2023), tranne quelle impossibili come `29/02/2023`, segnalate invece che inventate.

Clienti 3.0 → 3.1. Migrazioni 166 (config alert) e 167 (storico). Doc: [modulo_clienti_crm.md](modulo_clienti_crm.md) §16.

---

## 2026-08-08 — Il widget vini diventa il selettore del riordino `[core]`

Il widget «vini attivi in carta senza giacenza» era una lista da guardare. Ora è il punto dove si decide cosa ordinare, e i flag che premi hanno conseguenze.

**Chi entra nella lista non è più "giacenza a zero" ma la copertura in giorni.** La giacenza divisa il consumo delle ultime settimane dice quanti giorni di scorta restano: sotto 21 (configurabile) il vino compare. Una bottiglia sola di un vino che si vende 3 volte al mese è un buco fra dieci giorni ed è un alert; una bottiglia sola di un vino fermo da mesi è la sua giacenza normale e resta fuori. Sui dati del 08/08: 60 vini segnalati, di cui 6 in esaurimento; 116 vini con una bottiglia sola ma fermi correttamente ignorati.

**I flag ora fanno qualcosa.** 📦 *Ordinato* mette il vino nella bozza d'ordine del suo fornitore con la quantità suggerita, pronto da riprendere in `/vini/ordini` (senza sovrascrivere una quantità già scelta a mano). 📝 *Da ordinare* colora la riga nel widget riordini per fornitore e nella pagina Ordini. 🗓️ *Annata esaurita* e ⛔ *Non ricomprare* fanno sparire il vino da tutte le liste di riordino.

**Colori coerenti su tutte le viste** e ogni riga porta i due numeri che servono a decidere: giacenza e copertura (`🍷 2 bt · ~9gg`). Il banner è rosso se c'è un vino esaurito, ambra se è solo riordino preventivo.

Nuova soglia in **Impostazioni Vini → Widget e soglie → 🛒 Widget riordino**. La migrazione 165 rende configurabili anche le 4 impostazioni ordini di O5, che esistevano nel codice ma non comparivano nella UI.

Vini 3.80 → 3.81. Doc: [modulo_vini_ordini.md](modulo_vini_ordini.md) §RD.1.

**Il widget «Riordini per fornitore» è stato assorbito dalla pagina Ordini (3.84).** Faceva la stessa cosa di `/vini/ordini` sugli stessi dati, ma senza carrello, invio né storico: due liste per lo stesso lavoro. Le tre cose che aveva in più — e che servono col rappresentante davanti — sono ora nella pagina: il **prezzo di listino si modifica cliccandolo** (con storico prezzi automatico), il bottone **🗓️ nuova annata** crea la bottiglia dell'annata nuova e la mette subito in bozza, e la lista si può **ordinare** per urgenza, ritmo, giacenza, listino o date. I vini messi da parte (annata esaurita, non ricomprare) stanno in una sezione «Messi da parte» chiusa, per quando il rappresentante chiede "e questo non lo prendi più?". In dashboard resta il blocco **📦 Ordini** con i distributori che hanno lavoro in sospeso: un click e sei sul fornitore giusto. La dashboard carica 940 righe in meno (25 → 19 ms).

**Il Monitor ora ti dice se c'è l'annata nuova (3.83).** Dieci vini su 48 erano falsi allarmi: non mancava il vino, era finita quell'annata — e la vendemmia dopo era già in cantina, in carta, con le bottiglie (il Valcalepio Lyr 2022 a zero, la 2023 con 30 bt). Ora sulla riga compare `➡️ 2023 in cantina · 30 bt`, cliccabile per aprire la bottiglia nuova, più `📥 comprato ~14 mesi fa` per capire se conviene farsi portare direttamente l'annata nuova dal rappresentante. Restano in lista finché non li marchi tu «Annata esaurita».

**Aggiornamento in giornata (3.82):** flaggare «📝 Da ordinare» non lasciava il vino in lista — adesso il widget mostra **solo i vini su cui non hai ancora deciso** e sia *Da ordinare* sia *Ordinato* mettono il vino nella bozza del fornitore. Quello che decidi resta a schermo in verde sotto «Sistemati adesso» col nome del fornitore e le bottiglie, e sparisce al prossimo aggiornamento; se ri-clicchi il flag lo togli anche dal carrello.

---

## 2026-08-07 — Menu Estate 2026 tradotto in cinque lingue `[locale:tregobbi]`

Il motore i18n aveva la carta vuota. Ora ha i testi: **EN, FR, ES, DE, UK**, revisionati da madrelingua, per l'edizione lug/ago/set 2026.

### ➕ Aggiunto
- **Mig 164** (`TRGB_SPECIFIC`): seed di `menu_translations`. **44/44 publications e 2/2 degustazioni abbinate, 400 righe** (80 per lingua). Tutte con `rivisto = 0`, da approvare dal tab Traduzioni.
- `locali/tregobbi/seeds/menu_traduzioni_lug_set_2026.py` + i **sorgenti** in `sorgenti_menu_lug_set_2026/`: se cambia la carta si rigenera con `costruisci_seed.py`, non si edita a mano.

### Le tre discrepanze fra cartaceo e DB, e come sono state risolte
1. **Tag dietetici** `(NG)`/`(NL)` e traduzioni: nel cartaceo stanno nel titolo, a DB no. Tolti da chiave e valore.
2. **`(prezzo per 2 persone)`** nel titolo: a DB è già in `prezzo_label`. Tolto dal titolo e **riusato** per tradurre `prezzo_label` (*45 (price for two)*, *45 (Preis für 2 Personen)*…).
3. **`PRIMO PIATTO`** vs **`Primo piatto bambini`**: il cartaceo abbrevia. Mappa esplicita.

### Note tecniche
- **`da 14 a 26`** dei piatti del giorno non era tradotto nel seed (lì il prezzo è una stringa condivisa fra lingue): le versioni sono state prese **dai PDF consegnati**, non inventate. Un `prezzo_label` nuovo non coperto viene segnalato a video dalla migrazione.
- **`<i>...</i>`** nei due testi tedeschi viene strippato: React stamperebbe il markup come testo. Niente renderer HTML su una pagina pubblica senza auth per due corsivi.
- `ON CONFLICT DO NOTHING` + `rivisto=0`: rilanciare la migrazione **non** sovrascrive le correzioni fatte a mano dal backoffice — verificato.

### ⚠️ Debito dichiarato
`(NG)`/`(NL)` vogliono dire *senza glutine* / *senza lattosio*: sono un "adatto a", non allergeni presenti. A DB non c'è un campo per questa informazione e il titolo italiano non la porta, quindi è stata tolta ovunque per non avere due carte diverse. Il digitale resta alla pari con l'italiano di oggi ma **più povero del cartaceo**: un celiaco col QR non trova quello che vede sul menù di carta. Da modellare come campo dedicato.

### File
`app/migrations/164_seed_menu_traduzioni_tregobbi.py` (nuova), `locali/tregobbi/seeds/menu_traduzioni_lug_set_2026.py` (nuovo) + `sorgenti_menu_lug_set_2026/` (4 file), `docs/modulo_menu_carta.md` (§ 11.7).

---

## 2026-08-07 — Menu Carta multilingua: il menù dell'ospite in sei lingue `[core]`

La pagina che il cliente apre col QR al tavolo esisteva solo in italiano. Ora parla **it, en, fr, es, de, uk**, con un solo QR in sala: la lingua la sceglie l'ospite.

### ➕ Aggiunto
- **`menu_translations`** (mig 163): una tabella sola che traduce qualsiasi riga del modulo — piatti, degustazioni, edizioni. Chiave `(entita, entita_id, lang, campo)`, più `rivisto` per distinguere ciò che Marco ha approvato da ciò che è entrato con un seed.
- **`app/services/menu_i18n_service.py`**: motore i18n generico (normalizzazione lingua, lettura in blocco, fallback) + dizionario statico delle etichette di sezione, con gemello `frontend/src/config/menuI18n.js`.
- **`?lang=`** su `GET /menu-carta/public/today`. Sull'endpoint esistente, non su uno parallelo.
- **Selettore lingua** su `/carta/menu`: sei sigle testuali in header. Lingua iniziale da `?lang=` in URL → `localStorage` → lingua del telefono → italiano.
- **Tab Traduzioni** nel dettaglio edizione: italiano a sinistra in sola lettura, lingua a destra editabile, copertura per lingua ("EN 48/89"), filtri, checkbox *Approvata*, salvataggio massivo.
- **`GET/PUT /menu-carta/translations/`** e **`GET /menu-carta/translations/coverage/`**.

### 🐛 Corretto
- **I dolci non si vedevano dal QR.** `SEZIONI_ORDINE` nella pagina pubblica non era stata aggiornata quando la sezione 'dolci' è nata (2026-07-19): 5 dolci in carta erano invisibili al cliente da tre settimane, mentre backoffice e PDF li mostravano regolarmente. L'ordine sezioni ora è uno solo e vive in `menuI18n.js`.

### Le scelte che contano
1. **Tabella, non colonne.** Sei lingue × quattro campi sarebbero state 24 colonne su `menu_dish_publications` e un `ALTER TABLE` su DB live a ogni lingua nuova. Con la tabella, aggiungere l'ucraino è un INSERT.
2. **Fallback a cascata, sempre.** Manca la traduzione di un piatto? L'ospite legge l'italiano. Non è un errore ed è per questo che il motore si può pubblicare prima dei testi. Verso il tavolo non esce mai una riga vuota.
3. **Retrocompatibilità verificata.** Le traduzioni si scrivono dentro i campi di sempre (`titolo_override`, …), non in campi paralleli: chi chiama `public/today` senza `lang` riceve una risposta **identica** a prima (confronto JSON serializzato), e il frontend non ha dovuto imparare regole nuove.
4. **Selettore: bandiera + sigla**, mai la bandiera da sola — su Windows le emoji bandiera non renderizzano, e lo screen reader deve leggere *Français*, non "bandiera della Francia". Sul pulsante ucraino la sigla è **UA** e non "UK": accanto a 🇺🇦 chiunque leggerebbe United Kingdom, benché `uk` sia il codice ISO dell'ucraino. Il codice interno resta `uk`; `?lang=ua` è accettato come alias.
5. **Il nome delle degustazioni resta italiano.** *"Fidati dell'oste"* è la firma della casa; è il sottotitolo, discorsivo, a essere tradotto e a spiegare il percorso.
6. **Traduzione svuotata = cancellata**, così si torna al fallback italiano invece di stampare una riga bianca.

### Note tecniche
- Il **clone di un'edizione** porta con sé le traduzioni: senza, ogni cambio di carta stagionale butterebbe via sei lingue di lavoro sui piatti riportati.
- `entita_id` è polimorfico → nessuna FK possibile → **cleanup orfani esplicito** su delete di publication / degustazione / edizione.
- `?lang=` non riconosciuto → italiano, mai un errore: un QR stampato male non deve dare 400 a un ospite seduto.
- Il **PDF stampabile resta italiano** (non toccato). `CartaClienti` (vini & bevande) ha la stessa esigenza: sessione separata.

### File
`app/migrations/163_menu_carta_i18n.py` (nuova), `app/services/menu_i18n_service.py` (nuovo), `app/routers/menu_carta_router.py`, `frontend/src/config/menuI18n.js` (nuovo), `frontend/src/pages/public/CartaMenuPubblica.jsx`, `frontend/src/pages/cucina/MenuCartaDettaglio.jsx`, `frontend/src/config/versions.jsx` (menuCarta 1.2→1.3), `docs/modulo_menu_carta.md` (§ 11).

---

## 2026-08-03 — Vini: "Cantina da iPhone" fase 1 «trova la bottiglia» `[core]`

Prima pagina mobile-first del modulo vini, per l'uso col telefono in mano tra gli scaffali (V.9 fase 1). Solo consultazione, nessuna scrittura.

### ➕ Aggiunto
- **`CantinaMobile.jsx`** (nuova; route `/vini/cantina-mobile` + `/:id`, ProtectedRoute sub=magazzino): finder «trova la bottiglia» con modo **Cerca** (ricerca testo + **filtro per categoria di locazione**: Scaffali / Frigo / Matrice) e modo **Per scaffale** (vista inversa: cosa contiene ogni posto). Le righe aprono una **scheda mobile read-only**: identità, «Dove si trova» in evidenza con **griglia matrice** (posizione parsata da `LOCAZIONE_3`), anagrafica e movimenti collassabili.
- Voce **📱 Cantina mobile** in `ViniNav`.

### Note tecniche
- **Zero modifiche backend**: riusa `GET /vini/v2/bottiglie/?only_positive_stock=true` (tutte le bottiglie in giacenza, non solo carta), `GET /vini/v2/bottiglie/{id}` e `GET /vini/magazzino/{id}/movimenti`.
- Solo bottiglie fisicamente presenti (giacenza > 0). Righe → scheda mobile, non quella gestionale densa. Base per le fasi 2 (+/− giacenze) e 3 (conta inventario).

### File
`frontend/src/pages/vini/CantinaMobile.jsx` (nuova), `frontend/src/App.jsx` (lazy+route), `frontend/src/pages/vini/ViniNav.jsx` (tab), `frontend/src/config/versions.jsx` (vini 3.79→3.80), `docs/modulo_vini.md`, `docs/roadmap.md` (V.9 fase 1).

---

## 2026-08-03 — Mattone M.J: pubblicare i PDF sul sito senza client FTP `[core]`

Marco: *"se devo aggiornare un menu sul sito possiamo farlo da app?"*. Il sito è un WordPress, ma menu del pranzo e carta vini non stanno nel CMS: sono file statici in `/privata/` sull'hosting Aruba, caricati a mano via FTP. Il PDF lo generava già l'app — mancava solo l'ultimo metro.

### Aggiunto
- **`app/services/ftp_publish_service.py`** (mattone M.J): prende dei bytes e li mette sull'FTP. `ftplib` da standard library, zero dipendenze nuove. Config in `.env` sul VPS, riletta a ogni chiamata.
- **Bottone "Pubblica sul sito"** nel compositore Pranzo e in Impostazioni Vini → Carta, con la data dell'ultima pubblicazione riuscita accanto (`PubblicaSulSito.jsx`, riusabile).
- **`/pubblicazione/stato|test|storico`** per verificare la connessione senza pubblicare niente.

### Le tre scelte che contano
1. **Upload atomico**: si carica su un temporaneo e si fa RENAME solo a trasferimento finito. Se cade la linea, sul sito resta il PDF vecchio **integro** — mai un file troncato davanti ai clienti. Testato: con il server FTP irraggiungibile a metà, il file pubblicato resta quello buono.
2. **Nome remoto fisso** (`menu-pranzo.pdf`, `carta-vini.pdf`): il link su WordPress si mette una volta e non si tocca più. Era la condizione per rendere la cosa davvero automatica.
3. **Solo la carta CLIENTE è pubblicabile.** `/vini/carta/pdf-staff` è interna e non ha nessun endpoint di pubblicazione: un PDF con i dati interni su un server pubblico non deve poter succedere per distrazione.

### Corretto in review (prima del push)
Una review avversariale sul codice appena scritto ha trovato due cose che sarebbero diventate incidenti:

- **Il "rollback" cancellava il file vivo.** Se il server rifiutava il RENAME, la prima stesura cancellava la destinazione e ritentava: quando il rifiuto non era "file già esistente" ma permessi o quota, il link del sito restava a **404**, in silenzio. Ora prima di toccare qualsiasi cosa si scarica in memoria il PDF pubblicato, e se la promozione fallisce lo si rimette su. C'è un test che simula esattamente questo server ostile.
- **`FTP_TLS=auto` poteva rispedire la password in chiaro.** Il fallback copriva anche il login, non solo la negoziazione TLS: una password sbagliata su un server che *supporta* TLS faceva riconnettere in cleartext e ritrasmettere la password vera. Ora il fallback scatta solo sul comando `AUTH`.
- Inoltre: notifica di fallimento che non sarebbe mai arrivata (`dest_ruolo="admin"` mentre Marco è `superadmin` — stesso inciampo già documentato in `turni_service.py`); `static/carta_vini.pdf` condiviso da tutte le richieste, che una generazione concorrente poteva riscrivere **mentre** la pubblicazione lo leggeva; host e utente FTP visibili a qualsiasi utente loggato; "Prova connessione" che diceva OK anche con un utente FTP in sola lettura (ora scrive una sonda e la cancella).

### Falla pre-esistente chiusa per strada
`static/` è servito **senza autenticazione**: la carta vini **staff** ci veniva scritta come `carta_vini_staff.pdf` ed era scaricabile da chiunque ne indovinasse l'URL. L'audit A4 del 2026-07-12 aveva protetto l'endpoint, non il file. Ora carta cliente e staff ritornano bytes nella risposta HTTP e non lasciano niente su disco. **Sul VPS vanno cancellati i due file residui** in `static/`.

### Note
- `FTP_TLS=auto` prova FTPS e, se l'hosting non lo supporta, ricade su FTP in chiaro — **la password viaggia leggibile**. Se Aruba accetta FTPS, mettere `FTP_TLS=1` (con `1` un server senza TLS viene rifiutato invece di ripiegare).
- Fallimento → notifica M.A agli admin: una pubblicazione fallita in silenzio è peggio di una fallita.
- Se davanti al sito c'è una cache/CDN, il PDF nuovo può restare invisibile per un po': è fuori dal controllo dell'app.

---

## 2026-08-03 — Ordini: il bottone per annullare `[core]`

Marco: *"come si annullano gli ordini"*. Non si annullavano: l'endpoint `POST /vini/ordini/{id}/annulla`, la funzione `annulla()` e lo stato `annullato` (disegnato nella mappa STATI e già incluso nel filtro dello storico) c'erano dalla 3.75 — **mancava il bottone**. Gli ordini si potevano solo ricevere, mai disdire, e i due travasati da aprile/maggio restavano lì per sempre.

### Aggiunto
- **`⛔ Annulla`** sulle card degli ordini in viaggio, accanto a "📥 È arrivato", con conferma che dice cosa succede: l'ordine resta nello storico, **le giacenze non vengono toccate** (la merce non è mai arrivata). Il vino torna disponibile in "da ordinare" senza il badge "già ordinate", perché quello conta solo gli ordini aperti.
- Guard sul ri-annullamento: senza, un secondo annullamento riscriveva `data_chiusura` e lo storico avrebbe detto che l'ordine è stato annullato oggi invece che allora.

### Lezione
Endpoint, modello e persino lo stile del badge di stato erano pronti: sembrava fatto. Vale la pena, a fine sessione, ripercorrere ogni stato del modello e chiedersi **da quale click ci si arriva** — `annullato` non era raggiungibile da nessuno.

---

## 2026-08-02 (quater) — Rinominare un distributore: completare il cascade `[core]`

Marco: *"se modifico in quella tabella, modifico anche le anagrafiche sui singoli vini?"* — chiedendo del caso "nome distributore sbagliato". Sì per `nome` e `rappresentante_nome`, no per tutto il resto. Ma provandolo sono venuti fuori due punti scoperti.

Il cascade (`sync_bottiglie_from_fornitore`) raggiunge le bottiglie **solo** via `madre_id → vini_madre.fornitore_id`. Restavano indietro:

1. **Le bottiglie orfane** — hanno `DISTRIBUTORE` scritto a mano ma nessuna madre agganciata (2 su 1275 al 2026-08-02): conservavano il nome vecchio.
2. **Gli ordini ancora aperti** — `vini_ordini.fornitore_nome` è uno snapshot e la pagina Ordini raggruppa per nome: dopo la rinomina il carrello restava intestato al nome vecchio, **separato dai suoi vini**, come due distributori distinti in colonna.

### Aggiunto
- **`vini_anagrafiche_sync.propaga_rinomina_fornitore()`**, chiamata dal `PATCH /fornitori/{id}` quando cambia il `nome`. Sistema le orfane con quel nome e riallinea gli ordini in stato `bozza`/`inviato`/`parziale`.

**Gli ordini `chiuso` e `annullato` NON vengono toccati**: sono documenti storici, devono restare con il nome che avevano il giorno in cui sono stati fatti. È la stessa ragione per cui `descrizione` e `prezzo_unit` sulle righe sono snapshot.

### Disallineamenti trovati nei dati (da sistemare a mano, 2 righe)
Bottiglie il cui `DISTRIBUTORE` non combacia col fornitore della loro madre — restano fuori da qualsiasi cascade, per costruzione, e producono un gruppo fantasma nella pagina Ordini:

| id | vino | sulla bottiglia | dalla madre |
|----|------|-----------------|-------------|
| 1034 | Franciacorta DOCG Blanc de Blanc | `Emanuele Poloni` | `Emanuele Polloni` |
| 1313 | Salento IGT Calafuria | `SOGEGROSS` | `Emanuele Poloni` |

Il primo è il doppione anagrafico già noto. Il secondo è una scelta che spetta a Marco: la Calafuria si compra da SOGEGROSS o da Poloni? Non la decide il codice.

---

## 2026-08-02 (ter) — Distributori: flag "attivo" `[core]`

Marco: *"aggiungi un flag in anagrafica sui fornitori «attivo» così posso togliere il flag a quelli inattivi da cui non sto comprando"*. In cantina restano i vini di distributori con cui non si lavora più: le loro bottiglie continuavano a comparire fra i "da ordinare" e a occupare la colonna dei fornitori, che ha 38 nomi.

### Aggiunto
- **Migrazione 160** — `vini_fornitori.attivo INTEGER NOT NULL DEFAULT 1`. Tutti i distributori esistenti nascono attivi: disattivare è una scelta esplicita, non qualcosa che decide una migrazione.
- **Interruttore in Anagrafiche → Distributori** — colonna "Attivo", un click, nessuna conferma (è reversibile). Le righe non attive restano in lista in grigio barrato: l'anagrafica è l'archivio. Nuovo KPI "Non attivi" e filtro "Solo attivi".
- **Pagina Ordini** — i distributori non attivi sono nascosti; checkbox "Mostra anche quelli non attivi" per riaverli.

### Nota di progetto
Un distributore non attivo **resta visibile nella pagina Ordini se ha un ordine ancora aperto**, in fondo alla lista e in corsivo. Nasconderlo renderebbe quell'ordine irraggiungibile da qualsiasi schermata — esattamente l'errore che i pending orfani hanno appena fatto pagare con la migrazione 159.

Un flag e non una cancellazione: i vini restano collegati al loro distributore (lo storico ordini deve restare leggibile) e riattivarlo è un click. `attivo` non è denormalizzato sulle bottiglie, quindi non fa partire il cascade sync.

---

## 2026-08-02 (bis) — Ordini ai fornitori: il modello vero, dal carrello al WhatsApp `[core]`

Marco: *"tutto, nell'ordine che ti è più semplice, iniziamo oggi finiamo oggi"*. Fatte O3, O4, O5 e O6 del piano ([modulo_vini_ordini.md](modulo_vini_ordini.md)); O2 assorbito in O6 per non costruire due volte la stessa UI; O7 rimandata su indicazione di Marco.

Da oggi **un ordine esiste come documento**: ha un fornitore, uno stato, una data di invio, delle righe con quantità ordinata e ricevuta, e non sparisce quando la merce arriva. Prima esisteva solo una riga pending per vino, cancellata alla conferma d'arrivo — di quello che era stato ordinato non restava niente.

### Aggiunto
- **Migrazione 158** — `vini_ordini` (testata: fornitore, stato `bozza/inviato/parziale/chiuso/annullato`, canale, date) + `vini_ordini_righe` (con `qta_ricevuta` per riga, che è l'unico modo di gestire un arrivo parziale). `fornitore_nome` denormalizzato e `descrizione`/`prezzo_unit` come snapshot: un ordine è un documento storico, deve restare leggibile anche se il vino viene cancellato o il listino cambia.
- **Migrazione 159** — travaso dei pending residui (2 righe) in ordini `inviato` e svuotamento della vecchia tabella. **Anticipata rispetto al piano**: vedi Note oneste.
- **`app/models/vini_ordini_db.py`** — bozza per fornitore, risoluzione del fornitore con tre livelli di fallback, ricezione atomica (riga + giacenza + movimento `CARICO` + reset `STATO_RIORDINO` + ricalcolo stato testata in una transazione sola).
- **`app/routers/vini_ordini_router.py`** (prefix `/vini/ordini`) — lettura per chiunque sia loggato, scrittura gated `is_vini_manager`.
- **Pagina `/vini/ordini`** (`OrdiniVini.jsx`, tab "📦 Ordini") — master-detail fornitore-centrica: a sinistra i distributori con quanto c'è da ordinare, a destra il fornitore scelto con da-ordinare (qta suggerita precompilata, ritmo di vendita, ricerca, filtro tipologia), carrello con totale €, invio WhatsApp, ordini in arrivo con badge "fermo da N giorni", e **storico ordini con il lead time reale** — il dato che prima non esisteva.
- **Template WhatsApp configurabile** in `vini_widget_settings` (`ordine_wa_template`, `ordine_wa_riga_template`, `ordine_wa_locale`) + soglia `ordine_fermo_alert_giorni`. Il messaggio è modificabile nel modale prima di partire.

### Modificato
- **`DashboardVini.jsx`** — i due widget sovrapposti non compongono più ordini: `openOrdine` porta alla pagina nuova, sul fornitore giusto (`?fornitore=`). Aggiunto un riepilogo cliccabile in testa. Tenere due sistemi d'ordine vivi sugli stessi vini significava poter ordinare — e caricare — due volte la stessa bottiglia.
- **`ViniNav.jsx`**, **`App.jsx`**, **`main.py`**, **`core/moduli/vini/module.json`**, **`versions.jsx`** (vini 3.74 → 3.75), **`modulo_vini.md`** (tabella endpoint).

### Note oneste
- **Il travaso dei pending (159) era pianificato per dopo, l'ho anticipato.** La review avversariale ha mostrato che la convivenza dei due sistemi era il rischio più grosso del blocco: un vino con pending aperto ha `STATO_RIORDINO='0'` e ricompariva nella lista "da ordinare" senza alcun segnale, e confermando l'arrivo da entrambe le parti la giacenza veniva incrementata due volte. Erano 2 righe e 3 bottiglie: rimandare costava più che farlo.
- **Il codice del vecchio modale ordine in `DashboardVini.jsx` è morto ma è ancora lì** (~145 righe). Toglierlo nello stesso push di due migrazioni sarebbe stato il blocco accoppiato che si è già pagato caro. Censito in [inventario_pulizia.md](inventario_pulizia.md).
- **Gli endpoint pending sono ancora senza gate di ruolo** e conferma-arrivo tocca la giacenza. La tabella ora è vuota, ma finché esistono restano l'unica scrittura non gated sulle giacenze.
- **Doppione in anagrafica**: `Emanuele Poloni` e `Emanuele Polloni` sono due fornitori distinti (20 e 27 vini). Il codice ora regge il disallineamento, ma i due vanno fusi.
- Testato end-to-end su copia del DB di produzione: bozza → invio → arrivo parziale → completamento → chiusura, con giacenze e movimenti verificati. **Nessun build** (il frontend è servito da Vite, non si compila); verifica con `@babel/parser`.

---

## 2026-08-02 — Ordini vini: piano O1–O7 + contatti distributori `[core]`

Marco: "rivediamo un attimo i riordini per fornitore, devo avere un modo per lavorarci meglio". La ricognizione ha trovato tre buchi: **non esiste il concetto di ordine** (solo una riga pending per vino, `UNIQUE(vino_id)`), **non esiste storico** (`conferma_arrivo_ordine_pending()` cancella il record quando la merce arriva), e **due widget della dashboard fanno lo stesso lavoro**. Piano completo a fasi in [`modulo_vini_ordini.md`](modulo_vini_ordini.md).

Marco ordina in due situazioni, entrambe centrate sul fornitore e non sul vino: col rappresentante davanti, o mandando un messaggio WhatsApp. Da lì l'ordine delle fasi.

### Aggiunto
- **`docs/modulo_vini_ordini.md`** — doc canonico: diagnosi, ricognizione dati, modello `vini_ordini` + `vini_ordini_righe`, fasi O1–O7, fuori scope dichiarato, 4 domande aperte.
- **Modalità contatti (O1)** in Anagrafiche > Distributori — `rappresentante_nome`, telefono ed email editabili **inline in tabella**: `Invio` salva e scende alla riga sotto, `Esc` annulla, salvataggio ottimistico con rollback. Barra di completezza e filtro "Solo senza telefono". Serve a riempire i 40 contatti in una seduta.

### Modificato
- **`app/routers/vini_anagrafiche_router.py`** — `PATCH /fornitori/{id}` non lancia più il cascade sync quando il patch tocca solo campi non denormalizzati sulle bottiglie. Del fornitore solo `nome` (→ `DISTRIBUTORE`) e `rappresentante_nome` (→ `RAPPRESENTANTE`) finiscono sulle bottiglie: patchare un telefono riscriveva comunque tutte le bottiglie di tutti i vini madre di quel distributore. Aggiunto anche il corto circuito sul PATCH a corpo vuoto.
- **`app/services/vini_anagrafiche_sync.py`** — esportata `FORNITORE_CAMPI_DENORMALIZZATI`, accanto alla funzione che la determina: il router la importa invece di riscriversela.
- **`versions.jsx`** — vini 3.73 → 3.74. **`docs/index.md`** — riga per la pagina nuova.

### Il dato che ha deciso l'ordine delle fasi
L'invio ordini via WhatsApp era fermo dal 2026-04-24 come "punto 7 differito" perché mancava il telefono del rappresentante. Il campo **esiste dalla migrazione 125** — ma la ricognizione sul DB dice **0 fornitori su 40 lo hanno compilato**. Non era più un problema di schema, era data entry: da qui O1 come prima fase invece che come rifinitura. Nella stessa ricognizione: 1273 bottiglie su 1275 risolvono `bottiglia → madre → fornitore_id` (99,8%) e tutti e 40 i distributori testuali matchano `vini_fornitori.nome`, quindi nessun lavoro di riconciliazione anagrafica prima di partire.

### Note oneste
- **Nessun build da lanciare**: il frontend in produzione è servito da Vite (`trgb-frontend`), `frontend/dist/` non è tracciato e il post-receive fa `npm install` solo se cambia `package.json`. Verifica fatta con `@babel/parser` (sintassi + identificatori non risolti); un import rotto si vedrebbe comunque solo a runtime nel browser, quindi conviene aprire la pagina Distributori subito dopo il push.
- Il telefono si salva **come lo si scrive**, non normalizzato: `buildWaLink()` normalizza già al momento dell'uso, e un numero leggibile vale più di uno canonico. La cella segnala con `⚠️` i numeri che `normalizePhone()` non sa interpretare.
- O2–O7 non sono iniziate. Le 4 domande aperte in fondo al piano vanno chiuse prima di O4 — in particolare se il totale € dell'ordine va calcolato sul listino o sul netto scontato.

---

## 2026-08-03 (ter) — Multi-reparto: chi lavora in sala e in cucina (mig 162) `[core]`

Marco: «c'è un caso particolare (io) che posso lavorare sia in sala che in cucina — prevedi la possibilità di flaggare da quel menu in modo da utilizzare in entrambi gli orari».

Il flag da solo non bastava, e il motivo è il pezzo interessante: **il foglio di un reparto mostrava i turni delle PERSONE del reparto, non i turni DEL reparto**. Il turno non sapeva dove appartenere, lo si deduceva da chi lo faceva. Con una persona in due reparti sarebbero comparsi tutti i suoi turni in entrambi i fogli, con le ore contate due volte.

La chiave era già nei dati: i tipi turno (`SALA-PRANZO`, `CUCINA-CENA`…) portano il reparto in `turni_tipi.ruolo`, che combacia con `reparti.codice`. Quindi ora il foglio filtra per il reparto **del turno**.

### Aggiunto
- **Migrazione 162** — tabella `dipendenti_reparti` con i reparti IN PIÙ (`reparto_id` resta il principale: non si duplica, due posti che dicono la stessa cosa divergono).
- **Anagrafica** — caselle "Lavora anche in", una per reparto diverso dal principale.
- **`turni_service`** — due costanti SQL condivise (`SQL_DIP_*_DEL_REPARTO`, `SQL_TURNO_DEL_REPARTO`) applicate a tutte le 8 query che dicevano `d.reparto_id = ?`: foglio settimana, vista mese, copia settimana, crea/applica template, pubblica settimana, riepilogo WhatsApp, assenze.

### Retrocompatibilità
La regola sul turno ha una rete di sicurezza: se il tipo del turno non appartiene a nessun ALTRO reparto della persona, il turno resta dove stava. Così a chi ha un reparto solo non sparisce niente dal foglio, anche se qualcuno gli aveva assegnato un turno di un altro reparto. Verificato sui dati reali: 582 turni cucina e 457 sala, nessun disallineamento.

### Verifica
Test end-to-end su copia del DB: prima Marco (cucina) con un turno di sala lo vedeva comparire **nel foglio cucina** — sbagliato, ed era così anche prima di questa modifica; dopo, compare in entrambi i fogli e il turno di sala sta nel foglio sala, quello di cucina in cucina, con i conteggi degli altri invariati.

---

## 2026-08-03 (bis) — Canale email configurabile dal gestionale `[core]`

Marco: «non possiamo configurarli dal gestionale in modo che in altre installazioni possano gestirli dalla configurazione? e scrivere dal gestionale in env?». Sì alla prima parte, no alla seconda.

**Perché non si scrive nel `.env` dall'app:** le variabili d'ambiente si leggono all'avvio, quindi ogni salvataggio richiederebbe un restart del backend — che è la finestra in cui i DB SQLite si sono già corrotti — e daremmo al processo web il permesso di riscrivere il file che contiene *tutti* gli altri segreti.

### Aggiunto
- **`app/routers/email_router.py`** (`/email/config/`, `/email/test/`, solo admin) + tab **📧 Email** in Impostazioni Sistema. Host, porta, utente, password, mittente, nome mittente e **destinatario dell'email di prova**, con il bottone che la manda davvero.
- **`email_service`** ora legge la config da `email_settings.json` nella cartella dati **del locale** — quindi ogni installazione ha la sua casella senza toccare il server — con il `.env` come fallback campo per campo: chi era già configurato così continua a funzionare.
- **Password cifrata** (Fernet, `cryptography` già presente via python-jose). La chiave sta in `TRGB_SECRET_KEY` nel `.env`: i DB e i file dati finiscono nei backup e i backup escono dalla macchina, la chiave no. Se manca, il salvataggio si rifiuta e restituisce la riga pronta da incollare. La password **non torna mai** dall'API: la UI mostra "impostata" e può solo sostituirla.

---

## 2026-08-03 — Un solo flag per gli intermittenti (mig 161) `[core]`

Marco: «in anagrafica avevamo già previsto il flag "trasmissione dati telematici" che era quello che intendevo per contratto intermittente». Due caselle per la stessa cosa prima o poi divergono, e chi resta spuntato solo di là sparisce dalle comunicazioni senza che nessuno se ne accorga.

- **Migrazione 161** — travaso `trasmissione_telematica = 1` → `intermittente = 1` (al momento 4 persone, tutte `a_chiamata` e con CF). La colonna vecchia **non viene rimossa**: niente DDL distruttivo in produzione, semplicemente non la legge né la scrive più nessuno.
- **`dipendenti.py` e `DipendentiAnagrafica.jsx`** — `trasmissione_telematica` sparisce da modello, query, payload e form. Resta la sola casella "Contratto intermittente".

Sopravvive `intermittente` e non il nome vecchio perché dice cosa *è* (contratto ex art. 15) invece del mezzo con cui lo si comunica, ed è il campo su cui girano service, checker M.F, router e documentazione.

---

## 2026-07-30 — Intermittenti: le chiamate si comunicano dai turni `[core]`

Marco: "aggiungiamo un flag intermittenti… il mattone email va fatto". Le chiamate dei lavoratori intermittenti **non venivano comunicate a nessuno**: ogni giornata omessa e' una sanzione da 400 a 2.400 EUR, e una giornata passata non e' piu' sanabile perche' la comunicazione e' per definizione preventiva.

Del tracciato XML del modello UNI-Intermittenti **non esiste alcuna specifica pubblica**: ne' XSD, ne' documentazione. E' stato ricavato dal modulo PDF del commercialista, che e' un XFA Adobe: il bottone "Genera XML e invia via email" fa `<submit format="xml">`, quindi l'allegato che parte e' il packet `datasets` dell'XFA. Struttura, formato date e regole di validazione sono documentati in [`modulo_intermittenti.md`](modulo_intermittenti.md).

### Aggiunto
- **`app/services/uni_intermittenti_service.py`** — raccoglie le giornate degli intermittenti dai turni CONFERMATO, compatta i giorni **strettamente consecutivi** in periodi (chi lavora lun-mer-ven ha tre righe: un periodo dichiarerebbe come lavorati anche i riposi), spezza in moduli da 10, genera l'XML, valida con le stesse regole del JavaScript interno del modulo, invia, archivia allegato + `.eml` con hash.
- **`app/services/email_service.py`** — mattone M.D, strato basso: SMTP da `.env`, allegati, esito come dato (non eccezione), `.eml` per la prova, email di prova.
- **`app/routers/intermittenti_router.py`** (prefix `/intermittenti`) — preview, invio con `dry_run`, registro, download allegato, annullamento, settings, configurazione lavoratori, test email. **Le righe le ricalcola sempre il server dal periodo:** il client dice quale periodo, non cosa dichiarare al Ministero.
- **`frontend/src/pages/dipendenti/Intermittenti.jsx`** + tab nella nav dipendenti + rotta `/dipendenti/intermittenti`.
- **Checker M.F `intermittenti_non_comunicati`** — avvisa se un turno di intermittente entro 48h non e' comunicato. E' questo, piu' dell'invio, che protegge dalla sanzione.
- **Migrazione 156** — `dipendenti.intermittente` (flag NUOVO: `a_chiamata` significa gia' "extra del turismo pagato a ore", riusarlo sarebbe stato semantic drift), `dipendenti.codice_comunicazione`, `dipendenti_uni_comunicazioni` + `_righe`, seed settings e `alert_config`.

### Modificato
- **Configurazione spostata in Impostazioni** (richiesta di Marco): i dati del datore, il destinatario e lo stato SMTP stanno in **Impostazioni → Intermittenti** (`DipendentiImpostazioni.jsx`, nuova sezione in sidebar); il **flag intermittente, il codice fiscale e il codice comunicazione sono in Anagrafica**, sulla scheda del dipendente. La pagina Intermittenti resta con due schede: da comunicare e registro.
- **`app/routers/dipendenti.py`** — il modello e le query dell'anagrafica ora portano `codice_fiscale`, `intermittente`, `codice_comunicazione`. Nell'UPDATE i due campi testo usano `COALESCE(?, colonna)`: un form che non li manda **non deve azzerare** il CF popolato dal parser cedolini. Rimossi `PUT /intermittenti/lavoratori/{id}` e `set_lavoratore()`: quei campi hanno un solo scrittore, l'anagrafica.
- **`versions.jsx`** — dipendenti 2.29 -> 2.30. **`architettura_mattoni.md`** — M.D da DA FARE a PARZIALE.

### Note oneste
- Il **formato delle date** (`DD/MM/YYYY`) e' dedotto dal `bind picture` del modulo, non letto in una specifica: resta un setting (`uni_formato_data`). Se il consulente segnala comunicazioni non acquisite, e' il primo sospettato.
- Il Ministero **non manda ricevute**: l'unico riscontro possibile e' farsi confermare dal consulente che le comunicazioni risultino acquisite. Primo mese in doppio binario.
- I moduli PDF in circolazione puntano ancora a `intermittenti@mailcert.lavoro.gov.it`, sostituito dal 1/6/2015 da `intermittenti@pec.lavoro.gov.it`. Per questo il destinatario e' configurabile.
- **Prima dell'uso vero serve la verifica col consulente** che quelle persone abbiano davvero un contratto intermittente: se sono extra del turismo la comunicazione non e' dovuta.
- Trappola incontrata: il primitivo `TextInput` passa a `onChange` **il valore, non l'evento**, ed e' un input controllato (`defaultValue` non funziona). La pagina e' stata corretta di conseguenza.

---

## 2026-07-27 — La Lavagna: il widget Bacheca diventa un briefing di servizio `[core]`

Marco: "la bacheca non viene utilizzata, ripensiamo al suo uso". Diagnosi: era l'unico blocco della Home che richiedeva lavoro umano per riempirsi, in mezzo a card che si riempiono da sole; per pubblicare servivano 5 campi in `/comunicazioni`. Restava vuota → nessuno la guardava → nessuno ci scriveva. In più Marco ha confermato che **la Home non la apre nessuno con regolarità**, quindi il widget da solo non bastava.

### ➕ Aggiunto
- **`app/services/lavagna_service.py`** (servizio platform) — compone il briefing del turno corrente: lede in italiano (coperti/tavoli/fascia di picco), tavoli da segnalare (allergie, occasioni, gruppi ≥8, note), selezioni del giorno, chi è in turno, task aperti, eventi di oggi, testo pronto per WhatsApp. Ogni query è difensiva: se un DB non risponde sparisce il blocco, non la Home. **Non ricalcola selezioni e alert: glieli inietta `dashboard_router`**, così la dipendenza resta router → service (CLAUDE.md §2).
- **`GET /dashboard/lavagna`** — endpoint separato da `/dashboard/home` di proposito: la Lavagna si ricarica da sola quando si scrive la nota, senza rifare tutta la Home.
- **`GET/POST/DELETE /comunicazioni/nota`** — la "nota di servizio": una riga, niente form. Dichiarate **prima** di `/{com_id}`, altrimenti FastAPI leggerebbe `nota` come id.
- **`frontend/src/components/widgets/Lavagna.jsx` + `hooks/useLavagna.js`** — tre strati in una card: nota del turno (gialla, in cima), briefing auto, eventi. Bottone "Copia" per il gruppo staff.

### 🔧 Modificato
- **`Home.jsx` v9.3** — la Lavagna prende il posto della Bacheca; **la card "⚠️ Attenzione" è stata assorbita** (gli alert scorrono nello strato eventi: erano un doppione nella stessa colonna). Rimossi gli helper rimasti orfani.
- **`DashboardSala.jsx` v5.3** — stessa sostituzione. **Qui conta più che nella Home:** con ruolo `sala` l'utente atterra su questa pagina e la Home non la vede mai. In sola lettura (`isAdmin={false}`): briefing e nota si vedono, il campo di scrittura no.
- **`notifiche_db.py`** — soft-migration `ADD COLUMN` idempotente su `comunicazioni`: `tipo` ('bacheca' | 'nota_servizio'), `data_riferimento`, `turno`. Nessuna migrazione già girata è stata toccata.
- **`notifiche_service.py`** — tutte e tre le query della bacheca classica ora filtrano `COALESCE(tipo,'bacheca') = 'bacheca'`, così le note non inquinano `/comunicazioni` né il contatore dei non letti.
- **`versions.jsx`** — home 3.6 → 3.7.

### ⚠️ Nota onesta
Il bottone "Copia" **non invia**: i link `wa.me` del mattone M.C non funzionano sui gruppi. Prepara il testo negli appunti, l'invio nel gruppo resta manuale.

### File
`app/services/lavagna_service.py` (nuovo), `frontend/src/components/widgets/Lavagna.jsx` (nuovo), `frontend/src/hooks/useLavagna.js` (nuovo), `app/models/notifiche_db.py`, `app/services/notifiche_service.py`, `app/routers/dashboard_router.py`, `app/routers/notifiche_router.py`, `frontend/src/pages/Home.jsx`, `frontend/src/pages/DashboardSala.jsx`, `frontend/src/config/versions.jsx`.

---

## 2026-07-25 — Docs: verifica contenuti vs codice, Blocco 1 `[core]`

Primo blocco della verifica sistematica dei doc modulo contro il codice (il codice fa fede). ~60 discrepanze corrette in 6 doc, tutte con riferimento file:riga.

### 🐞 Risolti (nei docs)
- **modulo_menu_carta.md** dichiarava il modulo "PROPOSTA, niente codice": è in produzione da mesi. Riscritte tabelle endpoint reali, sezione dolci, mig 098, route FE.
- **modulo_controllo_gestione.md**: stati pagamento pre-refactor ovunque, endpoint rimossi documentati attivi, riconciliazione documentata "FUTURO" ma implementata, ~40 endpoint aggiunti.
- **modulo_vendite.md**: prefix /admin/finance/shift-closures corretto su 11 endpoint (chiude gap CRIT-3/DH.4), versioni e logica chiusure allineate.
- **modulo_vini.md (+widget)**: versioni 3.67→3.72, bug chiusi dichiarati aperti, ~25 endpoint mancanti, payload e route corretti. **modulo_pranzo.md**: allineamenti minori.
- Tutti con "Ultima verifica: 2026-07-25 (vs codice)"; zone non verificabili dichiarate nell'header (stato "parziale").

### File
6 × `docs/modulo_*.md`, `docs/sessione.md`, `docs/changelog.md`.

---

## 2026-07-24 — Docs → wiki: index, convenzioni, conversione, lint, archivi `[core]`

Da discussione sul modello "LLM wiki" di Karpathy, adattato: per TRGB il problema dei docs è navigabilità e coerenza, non accumulo.

### ➕ Aggiunto
- **`docs/index.md`** — home del wiki: catalogo completo di `docs/` per argomento.
- **`docs/convenzioni_wiki.md`** — 3 tipi di pagina + 4 regole (home, un fatto una pagina, link relativi, header di stato); adozione opt-in; regola log ~3 mesi.
- **`scripts/docs_lint.py`** — lint del wiki (link rotti, pagine fuori index), solo stdlib. Hook warning-only nel Guardiano L1 di `push.sh` (primo pezzo di DH.7). Al primo giro: 4 link rotti veri trovati e fixati in sessione.md.
- **Archivi log:** `docs/archive/sessione_archivio_59.md` (sessioni ~39→59) e `docs/archive/changelog_archivio_2026-04.md` (rilasci dic 2025–apr 2026).

### 🔧 Modificato
- **14 pagine convertite al formato wiki** (header di stato + ~150 link): roadmap, refactor_monorepo, architettura_*, stack_tecnico, database, deploy, stato_pagamento_unificato, GUIDA-RAPIDA, controllo_design, checklist_visione_insieme, inventario_pulizia, styleguide.
- **`docs/styleguide.md`** ora canonica per la palette TRGB-02 (sanata duplicazione/contraddizione `bg-neutral-100` vs `bg-brand-cream`); `CLAUDE.md` tiene link + minimo operativo.
- **`docs/readme.md`** — §9 moduli a tabella con link; §12 → link a index.md.
- **`docs/sessione.md` / `docs/changelog.md`** — snelliti a ~3 mesi vivi (500→250KB / 700→200KB).

### File
`docs/index.md`, `docs/convenzioni_wiki.md`, `scripts/docs_lint.py`, `push.sh`, `CLAUDE.md`, `docs/readme.md`, 14 pagine docs, 2 file archivio, `docs/sessione.md`, `docs/changelog.md`.

---

## 2026-07-20 — Vini: Vista Sommelier v2.0 "banco di servizio" (V.22) `[core]`

Ripensamento completo di `/vini/carta-staff` (Marco: "rivediamone il senso, così è inutilizzata"): da elenco read-only a pagina operativa del servizio. Chiude il task V.22 / #136 della roadmap.

### ➕ Aggiunto
- **`CartaStaff.jsx` v2.0** — due modalità:
  - **Preparazione** (pre-turno): checklist client-side sui dati live — "Ultima bottiglia" (ancora in carta: al primo tavolo finisce), card secondaria "Esauriti — già usciti dalla carta" (a 0 bt il filtro min_qta_stampa li nasconde già da carta/QR → solo promemoria riordino), "Calici di stasera" (mescite aperte, chiudibili inline), "Frigo da rifornire" (vini da calice/mescita con frigo ≤ 2 e stock altrove, con indicazione da dove prendere).
  - **Servizio**: ricerca e filtri come prima, ma ogni riga ha la locazione in evidenza ("📍 prendi da") e azioni one-tap: **Vendi −1** (movimento VENDITA dalla locazione scelta — diretta se unica, picker inline se multiple — annullabile per 10s via toast) e **toggle mescita 🥂**. Nome vino → scheda bottiglia v2.
- **`vini_magazzino_router.py`** — `GET /carta-staff/`: ogni voce di `locazioni[]` ora include `slot` (frigo|loc1|loc2|loc3), la chiave che il frontend passa a `POST /{id}/movimenti`. Campo additivo, nessun consumer esistente impattato.

### Note tecniche
- Nessun endpoint nuovo: la pagina riusa movimenti (VENDITA + DELETE per undo, delta inverso già gestito dal 3.62/3.71) e `PATCH /{id}/bottiglia-aperta` (già aperto a sala).
- **Vendita da loc3/matrice volutamente esclusa** dal one-tap (decrementerebbe QTA_LOC3 senza svuotare `matrice_celle` → drift): se lo stock è solo in matrice il bottone porta alla scheda con MatricePicker.
- Auto-refresh 60s, in pausa mentre il toast-undo è visibile.

### File
`frontend/src/pages/vini/CartaStaff.jsx` (riscritto), `app/routers/vini_magazzino_router.py`, `frontend/src/config/versions.jsx` (vini 3.71 → 3.72), `docs/modulo_vini.md`, `docs/roadmap.md` (V.22 chiuso).

---

## 2026-07-19 — Task Manager: self-heal schema tasks.sqlite3 (mig 155) + init blindato `[core]`

Scoperto generando i MEP del menu Estate 2026: il generatore andava in 500 con `table checklist_template has no column named livello_cucina`.

### 🐞 Risolti
- **Schema drift su `tasks.sqlite3` di produzione**: il DB vivo in `locali/tregobbi/data/` NON è il file storico passato dalle migrazioni 084→088 — è stato **ricreato da zero da `init_tasks_db()`** (schema pre-088, quasi certamente nel giro dell'incidente S60-INC1 di inizio maggio: il file non fu spostato da `app/data/` e l'init ne creò uno nuovo nel path canonico). La 088 (`livello_cucina`) è marcata applicata → non rigira mai. Ogni INSERT con `livello_cucina` esplodeva: generatore MEP carta **e** creazione template da UI (`POST /tasks/templates`), rotta silenziosamente da maggio.
- **Migrazione `155_selfheal_tasks_schema.py`** `[core]`: self-heal idempotente (PRAGMA check + ADD COLUMN + indice) di `livello_cucina` su `checklist_template`, `checklist_instance`, `task_singolo` — stessa semantica della 088, sul path canonico.
- **`tasks_db.py` v1.3**: init difensivo allineato allo schema post-088 (colonne nel CREATE) + blocco self-heal post-CREATE con mappa `HEAL_COLUMNS` — se in futuro l'init ricrea un DB, converge comunque allo schema pieno.

### ⚠️ Perdita dati constatata (non recuperabile)
Il tasks.sqlite3 vivo ha **0 template**: i 5 MEP fissi della mig 097 e le checklist HACCP configurate ad aprile sono persi (retention backup 48h/7gg ampiamente superata). Censito in `problemi.md` TASKS-1. I MEP di carta si rigenerano dal bottone dell'edizione Estate 2026; i MEP fissi/HACCP eventualmente da ricreare a mano o re-importare dal docx.

### File
`app/migrations/155_selfheal_tasks_schema.py` (nuova), `app/models/tasks_db.py`.

---

## 2026-07-19 — Menu Carta: edizione Estate 2026 in carta `[locale:tregobbi]`

Marco ha portato il PDF del menu estivo (`menulugagoset2026web.pdf`, lug-ago-set 2026). Seed completo via migrazione, come per la Primavera 2026. (Sezione riscritta: era stata sovrascritta da una sessione parallela — il codice era già nel push `b8c96816`.)

### ➕ Aggiunto
- **Migrazione `154_seed_menu_estate_2026.py`** (`TRGB_SPECIFIC`, idempotente): crea **20 ricette skeleton nuove** (4 antipasti, 5 primi, 5 secondi, 1 contorno, **5 dolci** — solo name/menu_name/descrizione/prezzo, niente recipe_items: le grammature le rifinisce Marco dal modulo Ricette), archivia Primavera 2026, crea edizione **"Estate 2026" `in_carta`** (1/7 → 30/9) con 44 publications (36 da ricetta + 8 documentali) e le 2 degustazioni aggiornate ("Prima volta" 60 con Coniglio o Guancetta a scelta; "Fidati dell'oste" 75 con Battuta, Cozze in blu, Risotto all'albicocca, Anatra).
- Prezzi ritoccati: Vitello tonnato **20→22**, Ossobuco **24→26**, Tè e tisane **8→10**. Rinominati in carta via `titolo_override` (ricette invariate): "I salumi misti dell'osteria", "Fettuccine all'Alfredo se fosse nato a Bergamo".
- Fuori carta (restano in archivio primavera): Tegamino asparagi, Tartare dell'Oste, selezioni formaggi, Risotto Vignarola, Lasagnetta, Pasta mista sarda, Trippa, Faraona, Filetto Donizetti, Brasato, Arrosto di coniglio e agretti.

### Note
- ⚠️ Allergeni dei piatti nuovi dichiarati solo dove evidenti — **da verificare da app** (Battuta e Solero lasciati vuoti).
- Verificato in produzione: `/menu-carta/public/today` serve Estate 2026 completa di tutte le sezioni.
- Docs: `locali/tregobbi/seeds/MIGRATIONS_TRGB.md` aggiornato con la 154.

### File
`app/migrations/154_seed_menu_estate_2026.py` (nuova), `locali/tregobbi/seeds/MIGRATIONS_TRGB.md`, `frontend/src/config/versions.jsx` (menuCarta 1.1 → 1.2).

---

## 2026-07-19 — Menu Carta: nuova sezione "Dolci" `[core]`

Il menu Estate 2026 introduce per la prima volta i dolci in carta: la sezione non esisteva nel modulo (la primavera non li archiviava).

### ➕ Aggiunto
- **`menu_carta_router.py` v1.2**: `'dolci'` in `SEZIONI_VALIDE`, nei 3 CASE SQL di ordinamento sezioni (dettaglio edizione, PDF, preview), in `PDF_SEZIONI_ORDER` (tra Contorni e Bambini) e in `SEZIONE_TO_PARTITA` (partita MEP "Dolci").
- **`MenuCartaDettaglio.jsx` v1.4**: `{ key: "dolci", label: "Dolci" }` in `SEZIONI_ORDER` → la sezione appare in tab Sezioni, Anteprima e nel select della modale pubblicazione.

### Note
- Nessuna migrazione schema: `sezione` è TEXT libero, la validazione era solo applicativa.

### File
`app/routers/menu_carta_router.py`, `frontend/src/pages/cucina/MenuCartaDettaglio.jsx`.

---

## 2026-07-19 — Rettifica preconti marzo–luglio (solo dati VPS) `[locale:tregobbi]`

Troppi preconti registrati nelle chiusure turno: rettifica massiva mantenendo le quadrature.

### 🔧 Dati
- **113 preconti rettificati/eliminati su 95 chiusure** (2/3 → 17/7), riduzione totale **€12.082**: per ogni chiusura, `shift_preconti` ridotti/cancellati e `contanti` + `totale_incassi` abbassati dello stesso delta → differenza di quadratura invariata su tutte le chiusure. Preconti rimasti: 169 per €17.544 (erano 210+ per €30.406).
- Eseguito con `scripts/rettifica_preconti_2026-07.py` (nuovo, in repo): dry-run default, `--apply` con backup WAL-safe (`admin_finance.sqlite3.prev-rettifica-preconti-20260719-122719` sul VPS), validazione id+importi contro il DB vivo, transazione unica. Nessun restart backend.

### Note
- Il 1° dry-run sul VPS ha intercettato 4 id non più esistenti: il salvataggio di una chiusura dalla UI fa DELETE+reinsert dei preconti → id rigenerati. 3 rettifiche erano già state fatte a mano, la quarta è stata rimappata sul nuovo id.

---

## 2026-07-18 — Vini 3.71: fix RETTIFICA fantasma da modifica giacenze + qta assoluta `[core]`

Marco: "oggi sono state caricate delle bottiglie tramite la giacenza, ma non crea il movimento". Credeva fosse il bug 3.62 tornato — è un **secondo bug, presente dal commit iniziale (dic 2025)** e mai visto prima perché mascherato.

### 🐞 Risolti
- **RETTIFICA fantasma dal PATCH giacenze** (`vini_magazzino_db.py` + `vini_magazzino_router.py`): il router aggiorna PRIMA le giacenze (`update_vino` → `_recalc_qta_totale`) e POI chiama `registra_movimento(RETTIFICA, qta=qta_dopo)`. Ma `registra_movimento` calcola il delta contro la giacenza letta dal DB **in quel momento** — che è già quella nuova → `delta = 0` → l'INSERT del movimento veniva saltato dal guard `if delta != 0`, **senza eccezione e senza warning** (per questo il journalctl era muto: il fix 3.62 loggava solo le eccezioni, qui non ce n'era). Fix: nuovo parametro `qta_precedente` in `registra_movimento`; il router passa `qta_prima` come baseline esplicita del delta. Il fix 3.62 (ValueError su qta=0) resta valido — questo era il livello sotto.
- **Qta RETTIFICA salvata come |delta| invece che assoluta** (`registra_movimento`, INSERT): veniva salvato `abs(delta)` per tutti i tipi, ma tutto il resto del codice interpreta la qta di una RETTIFICA come **valore assoluto nuovo** (replay `giacenza_storica_vino`: `g := qta`; replay conservativo in `delete_movimento`: `qta_tot = q`). Una rettifica 10→7 dal form movimenti salvava qta=3 e il replay la rileggeva come "giacenza := 3". Ora per RETTIFICA si salva `nuova_qta` (assoluto); per CARICO/SCARICO/VENDITA `abs(delta)` == qta passata, invariato.

### Note
- Il movimento delle bottiglie caricate oggi **non è recuperabile automaticamente** (mai scritto su DB): se serve traccia, registrare a mano una RETTIFICA o un CARICO dal form movimenti della scheda vino.
- Le RETTIFICHE storiche fatte dal form movimenti (POST) hanno qta=|delta| nel DB → il replay giacenza-storica le interpreta male, ma la calibrazione automatica (3.62) maschera il drift. Non migrate: non distinguibili a posteriori con certezza.
- Restano DUE percorsi che cambiano giacenza **senza** movimento, per design attuale: assegnazione/rimozione **celle matrice** (`matrice_assegna_cella`/`rimuovi`/`set-celle` → QTA_LOC3) e **creazione nuova annata** con giacenze iniziali (wizard V2 / POST bottiglia — nessun CARICO iniziale). Se si vuole tracciarli, è un intervento separato → segnalato in `problemi.md`.
- Test: suite locale su DB isolato (7 test: PATCH-flusso, rettifica assoluta, no-op, CARICO invariato, azzeramento 3.62, replay drift=0, compile).

### File
`app/models/vini_magazzino_db.py`, `app/routers/vini_magazzino_router.py`, `frontend/src/config/versions.jsx` (vini 3.70 → 3.71).

---

## 2026-07-18 — Carta Bevande: Tè e Tisane caricati + import testo con textarea `[core]`

Marco porta la lista del fornitore di tè e tisane (spunte = presenti in casa). Pulita, prezzata e caricata in carta via "📋 Importa da testo".

### 🔧 Migliorato
- **`CartaSezioneEditor.jsx` v1.3-panel — `importColumns`**: incluse anche le colonne textarea (descrizione/ingredienti/abbinamenti), esclusa solo `note_interne`. Prima l'import testo di tè/tisane perdeva descrizioni e ingredienti (textarea filtrate via — il backend `bulk-import` le accettava già). Colonne birre invariate (le prime 6 restano identiche). ⚠️ Il fix è partito dentro il push `3a8b774c` (audit dropdown) che NON lo cita nel messaggio — annotato qui per tracciabilità.

### 📦 Dati caricati (sezioni Tisane e Tè)
- **7 tisane** con categoria (anti-stress/digestiva/dopo pasto/calmante) e ingredienti.
- **12 tè** con tipologia (nero/verde/oolong/rosso), descrizione e paese. Esclusi dalla lista fornitore: English Breakfast e Gyokuro Okabe (non presenti), Nearly Grey (finito); dedup del doppione Sun Rouge. Refusi corretti (Shizuoka, Fukuroi, Tokushima→Tokunoshima).
- **Prezzo 10 € su tutte le voci** (deciso da Marco). Milky Oolong e Lapsang Souchong senza paese (assente in origine).

### File
`frontend/src/pages/vini/CartaSezioneEditor.jsx`.

---

## 2026-07-18 — Dropdown header: audit voci mancanti vs sub-nav dei moduli `[core]`

Marco: "controllo menu a discesa, a me sembra che manchino dei tasti". Audit completo `modulesMenu.js` vs le sub-nav di tutti i 12 moduli e vs le route in `App.jsx`: 5 pagine reali erano raggiungibili dalla nav del modulo ma assenti dal menu a discesa dell'header (e dalla Home, che usa lo stesso config).

### 🐞 Risolti (voci mancanti nel dropdown)
- **Vini**: aggiunte "Sommelier" (`/vini/carta-staff`) e "Anagrafiche" (`/vini/anagrafiche`, solo admin).
- **Acquisti**: aggiunta "Pro-forme" (`/acquisti/proforme`, solo admin — sub-key già in modules.json).
- **Controllo Gestione**: aggiunta "Batch" (`/controllo-gestione/batch-pagamenti`) e riallineato l'ordine delle voci a quello di `ControlloGestioneNav` (Utenze → Batch → Riconciliazione).
- **Statistiche**: aggiunta "Prodotti" (`/statistiche/prodotti`).

### 🔧 Migliorato
- **`modules.json`**: nuova sub-key `vini.anagrafiche` (superadmin/admin) così la voce non compare a sala/sommelier — la route è comunque protetta da `sub=settings`. Nessun'altra modifica ai permessi.

### Note
- Nessun bump versione: solo allineamento menu, zero logica.
- Incoerenza preesistente NON toccata: `ViniNav` mostra "Anagrafiche" anche a sommelier, ma la route `/vini/anagrafiche` è protetta da `sub=settings` (solo admin) → per il sommelier il tasto in nav resta un vicolo cieco. Da decidere con Marco se aprire ai sommelier o nascondere in nav.
- `modules.json` contiene ancora la sub-key `controllo-gestione.confronto` (pagina rimossa, route ora redirect) — innocua, lasciata.

### File
`frontend/src/config/modulesMenu.js`, `app/data/modules.json`.

---

## 2026-07-18 — Sotto-categorie bevande gestibili da Impostazioni, zero hardcode (vini 3.70) `[core]`

Richiesta Marco: "stai facendo queste modifiche hardcoded, forse gestire le sotto-categorie nelle impostazioni avrebbe senso". Fonte di verità unica: le options del select tipologia nello schema_form della sezione — l'ordine delle options È l'ordine dei gruppi in carta.

### ✨ Aggiunto
- **`PUT /bevande/sezioni/{key}/tipologie`** (bevande_router v1.3): riceve {options, renames}. Rinomina propagata alle voci (`UPDATE bevande_voci`), eliminazione bloccata con 409 se la tipologia è usata (guardia PRIMA di ogni scrittura). Validazioni: no vuoti, no duplicati, rename coerenti.
- **`TipologieBevEditor.jsx`** (nuovo, components/vini): blocco "Sotto-categorie" in Impostazioni → Ordinamento Carta — riordino ▲▼, rinomina ✏️ (con badge "era: X"), elimina 🗑️, aggiungi; un pannello per ogni sezione con select tipologia (Distillati, Tè). Integrato in ViniImpostazioni v3.4.

### 🔧 Migliorato
- **`carta_bevande_service.py` v1.3**: `_render_tabella_4col` prende `tip_order` da `tipologie_order_from_sezione()` (nuovo helper) — eliminata la costante `_TIP_ORDER` hardcoded di stamattina.
- **`CartaClienti.jsx` v2.5**: ordine gruppi da `sezione.tipologie_order` nel payload (aggiunto da vini_router a `/carta-cliente/data`) — eliminata `TIPOLOGIA_ORDER` hardcoded.
- Bump vini 3.69 → 3.70.

### File
`app/routers/bevande_router.py`, `app/routers/vini_router.py`, `app/services/carta_bevande_service.py`, `frontend/src/pages/public/CartaClienti.jsx`, `frontend/src/pages/vini/ViniImpostazioni.jsx`, `frontend/src/components/vini/TipologieBevEditor.jsx` (nuovo), `frontend/src/config/versions.jsx`.

---

## 2026-07-18 — Carta: tabella_4col per tipologia + tipologie Gin/Vodka + prezzo_label nel form distillati (mig 153, vini 3.69) `[core]`

Approvato da Marco dopo il caricamento dei 29 distillati: la pagina React pubblica raggruppava la tabella per REGIONE (gruppi geografici che frammentavano grappe e whisky), mentre il PDF/HTML backend raggruppava già per tipologia ma in ordine alfabetico ("Altro" apriva la carta).

### 🔧 Migliorato
- **`CartaClienti.jsx` v2.4 — `BevTabella4Col`**: raggruppa per tipologia con ordine canonico `TIPOLOGIA_ORDER` (Grappa → Rum → Whisky → Cognac → Altro); sezioni senza tipologia (Amari & Liquori) → tabella piatta senza header, regione resta come colonna di riga.
- **`carta_bevande_service.py` v1.2 — `_render_tabella_4col`**: stesso ordine canonico `_TIP_ORDER` al posto dell'alfabetico. ⚠️ Le due costanti vanno tenute allineate tra loro e con le options del seed distillati (`bevande_db.py`).
- Bump vini 3.68 → 3.69.

### ✨ Aggiunto (stessa giornata, per caricare gin e vodka)
- **Mig 153** (`153_distillati_gin_vodka_prezzo_label.py`): aggiorna `schema_form` della sezione distillati nel DB vivo — options tipologia +Gin +Vodka (dopo Whisky) e campo `prezzo_label` ("Prezzo in carta", testo) dopo `prezzo_eur`. Idempotente; apre bevande.sqlite3 (pattern mig 152). La colonna DB e la precedenza nei renderer esistevano già: mancava solo dal form.
- **`bevande_db.py` v1.3**: stesse modifiche nel seed per i DB nuovi.
- **Ordine gruppi carta**: Grappa → Rum → Whisky → Gin → Vodka → Cognac → Altro (aggiornati `_TIP_ORDER` BE e `TIPOLOGIA_ORDER` FE, da tenere allineati).
- Con `prezzo_label` l'import testo dei distillati passa a 6 colonne (tipologia, regione, produttore, nome, prezzo €, prezzo in carta) — usato per il doppio prezzo dei gin "liscio 8 · G&T 11".

### File
`frontend/src/pages/public/CartaClienti.jsx`, `app/services/carta_bevande_service.py`, `frontend/src/config/versions.jsx`, `app/models/bevande_db.py`, `app/migrations/153_distillati_gin_vodka_prezzo_label.py` (nuova).

---

## 2026-07-18 — Carta Bevande: fix crash form distillati (React #31) + import testo con tipologia `[core]`

Marco apriva "Nuova voce" nella sezione Distillati e la pagina crashava (React error #31).

### 🐞 Risolti
- **`FormDinamico.jsx` v1.3**: le options dei select possono essere oggetti `{value, label}` (seed distillati/tè in `bevande_db.py`) oltre che stringhe; prima l'oggetto veniva renderizzato come child React → crash. Ora `optValue`/`optLabel` normalizzano entrambi i formati. ⚠️ Fix incluso nel push `695e6270` il cui messaggio di commit non lo cita.

### ✨ Aggiunto
- **`CartaSezioneEditor.jsx` v1.2-panel** (push `c1930519`): l'import testo include anche le colonne select (es. tipologia) — prima il bulk-import creava voci senza tipo, da correggere una per una. Il valore incollato deve combaciare col `value` delle options.
- **Contenuti**: caricate via import 29 voci in sezione Distillati (17 whisky + 12 grappe) con prezzi a dose 40 ml da ricerca di mercato (fascia osteria, coeff. ~3-3,5 su retail; ridotto per rarità Moon Import / G&M fuori catalogo).

### File
`frontend/src/components/vini/carta/FormDinamico.jsx`, `frontend/src/pages/vini/CartaSezioneEditor.jsx`.

---

## 2026-07-17 — Utenze: fix multi-layout + 4 forniture + ri-analisi (CG 2.21) `[core]`

Marco ha caricato tutte le 16 bollette 2026: emerse **4 forniture** (non 2) — luce ristorante, luce secondaria POD ...128 (3 kW, consumo zero, solo quota fissa), gas cucina, gas secondario — e 2 varianti di layout che il parser non gestiva. Fix validati su tutti e 16 i PDF: **16/16 puliti** (le 3 bollette a consumo zero portano una sola nota esplicativa).

- **Parser**: le sezioni "Informazioni storiche" / letture / Box Offerta si cercano per marker su tutte le pagine, non più a pagina fissa (lo storico gas scivola su p4 nelle bollette lunghe → era il grosso dei "campi non trovati"); riga "Stimata" assente nello storico gas = zeri impliciti, niente warning; bollette a consumo zero → i warnings fisiologici (niente Box Offerta/storico/prezzi) collassano in una nota unica.
- **Router**: `POST /bollette/{id}/riparse` — ri-analizza il PDF archiviato e aggiorna bolletta+fornitura+serie (per completare gli import fatti col parser vecchio senza cancellare/ricaricare).
- **FE**: grafici per FORNITURA (etichettati col POD/PDR) invece che per tipo — con 2 luci le serie si sovrascrivevano; bottone 🔄 per bolletta + "🔄 tutte" in testata tabella; ⚠️ con tooltip warnings per riga.

Test e2e in sandbox: 16 conferme, 2 duplicati respinti, riparse su tutte, 4 forniture in dashboard, 192 righe serie, copertura lug 2024 → giu 2026.

### File
`app/services/utenze_parser.py`, `app/routers/cg_utenze_router.py`, `frontend/src/pages/controllo-gestione/ControlloGestioneUtenze.jsx`.

---

## 2026-07-17 — Analisi Utenze U3+U4: pagina FE + alert (mig 152, CG 2.21) `[core]`

Completa il modulo Analisi Utenze (spec `docs/spec_utenze.md`): ora ha l'interfaccia e gli alert. Chiude U3+U4.

- **Pagina** `ControlloGestioneUtenze.jsx` (M.I primitives, route `/controllo-gestione/utenze`, tab 💡 in nav CG + voce nel menu moduli): upload/drag&drop PDF → modal preview con campi estratti e warnings → conferma; card KPI per fornitura (€/kWh–€/Smc all-in, consumo e spesa annua, countdown scadenza condizioni rosso sotto 60gg, % stimato gas, potenza max vs impegnata, formula indice+spread); grafici Recharts (luce stacked F1/F2/F3, gas rilevato/stimato, potenza max mensile con ReferenceLine sulla impegnata); tabella bollette con link 🔗 alla fattura in Acquisti.
- **Backend**: nuovo `GET /controllo-gestione/utenze/bollette` (elenco per la tabella).
- **Alert M.F** (2 checker in `alert_engine.py`): `utenze_scadenza_condizioni` (preavviso rinegoziazione, default 60gg, urgente sotto 14; include condizioni già scadute) e `utenze_consumi_stimati` (ultima bolletta gas con stimato > soglia %, default 30% → "fai l'autolettura"). Soglie e canali in `alert_config` (Impostazioni → Notifiche), **niente hardcode**; per `utenze_consumi_stimati` il campo `soglia_giorni` è interpretato come percentuale (interpretazione per-checker prevista dallo schema).
- **Mig 152**: seed `alert_config` per i 2 checker (60 / 30, antidup 168h) — idempotente, apre notifiche.sqlite3.
- Bump controlloGestione 2.20 → 2.21.

### File
`frontend/src/pages/controllo-gestione/ControlloGestioneUtenze.jsx` (nuovo), `ControlloGestioneNav.jsx`, `App.jsx`, `modulesMenu.js`, `versions.jsx`, `app/routers/cg_utenze_router.py`, `app/services/alert_engine.py`, `app/migrations/152_alert_config_utenze.py` (nuova).

---

## 2026-07-17 — Analisi Utenze U1+U2: parser bollette A2A + serie storica (mig 151) `[core]`

Nuovo sub-modulo di Controllo di Gestione (spec `docs/spec_utenze.md`, approvata da Marco in giornata): upload del PDF bolletta A2A (luce e gas) → parser → serie storica consumi/costi + KPI. Layer di sola analisi: la contabilità resta su `fe_fatture` (zero doppio conteggio nel CE). Validato sui 2 PDF reali di Tre Gobbi (luce giu 2026, gas apr-mag 2026) con zero warnings.

- **Parser** `app/services/utenze_parser.py` (pattern elab_parser: non scrive DB, ritorna dati+warnings+sha256): autodetect LUCE/GAS, scontrino energia (€/kWh–€/Smc, split vendita/rete, quote fisse/potenza, accise), Box Offerta (indice PUN/PSVDA + spread + scadenza condizioni), fasce F1/F2/F3, letture gas rilevate/stimate, cos(φ), **storico 18 mesi** e potenza mensile 12 mesi presenti in ogni bolletta.
- **Mig 151**: `cg_utenze_forniture` / `cg_utenze_bollette` / `cg_utenze_consumi_mensili` (UNIQUE fornitura+mese+fascia, upsert "vince la bolletta più recente").
- **Router** `app/routers/cg_utenze_router.py` (`/controllo-gestione/utenze`): `/upload` (preview, archivia PDF in `locali/<id>/data/uploads/utenze/`), `/conferma` (upsert fornitura + insert bolletta + serie + aggancio automatico a `fe_fatture` via numero bolletta, con retro-aggancio dei pregressi), `GET /` dashboard KPI (€/unità all-in, % stimato gas, giorni a scadenza condizioni, potenza max 12m), `GET /consumi`, `GET`/`DELETE /bollette/{id}`.
- Registrato in `main.py` + `core/moduli/controllo_gestione/module.json` (R8).

Prossime fasi: U3 pagina FE (tab Utenze in CG), U4 checker M.F (rinegoziazione condizioni 30.11.2026, autolettura gas se stimato >30%).

### File
`app/services/utenze_parser.py`, `app/migrations/151_cg_utenze.py`, `app/routers/cg_utenze_router.py`, `main.py`, `core/moduli/controllo_gestione/module.json`, `docs/spec_utenze.md`.

---

## 2026-07-17 — Cantina v2: le madri mostrano sempre tutte le annate (vini 3.68) `[core]`

Fix segnalazione Marco: bottiglia 1181 (Lugana I Frati 2024, giacenza 0) non compariva sotto la madre M0913, che mostrava solo la 1287 (2025). Il link `madre_id` era corretto: era `groupByMadre` in CantinaV2 che raggruppava le bottiglie già filtrate, e col default "solo giacenza positiva" le annate esaurite sparivano dalla madre.

- **Vista madri**: i filtri sidebar/chip decidono quali madri appaiono (almeno un'annata passa i filtri), ma ogni madre elenca sempre TUTTE le sue annate. Annate a giacenza 0 in `opacity-60`. Contatore annate allineato al renderizzato.
- **Scheda madre**: `openMadre` cerca nel dataset completo → si apre sempre con tutte le annate; fix anche del deep-link `?openMadre=N` che falliva se i filtri nascondevano l'intera madre.

### File
`frontend/src/pages/vini/v2/CantinaV2.jsx`, `frontend/src/config/versions.jsx` (vini 3.67→3.68).

---

## 2026-07-12 — Audit completo modulo Vini: hardening backend + fix UI (vini 3.67) `[core]`

Audit completo del modulo (136 endpoint su 7 router, ~34.500 righe BE+FE, 3 agenti paralleli + verifica manuale dei findings gravi), poi fix applicati in giornata. Chiude anche il residuo "init zombie" rinviato dalla sessione del 10/07 sera.

### Sicurezza / robustezza backend
- **B1 — boot crash su DB vergine**: `init_magazzino_database()` faceva `UPDATE vini_bottiglie` senza guardia, a import-time (prima di `run_migrations()`) → su un locale nuovo il backend non partiva. Ora i bulk-fix girano solo se la tabella esiste. Sblocca le istanze prodotto (`locali/`).
- **A1 — endpoint `/vini/anagrafiche/rollback` RIMOSSO** (risponde 410 Gone): post-cutover avrebbe droppato le tabelle LIVE (`vini_bottiglie`, `vini_madre`, ...). La finestra di rollback era chiusa dal 19/05.
- **A2 — backup/restore Impostazioni Vini WAL-safe**: backup via `sqlite3 Connection.backup` (prima `shutil.copy2` del solo file → transazioni nel `-wal` perse); path via `locale_data_path()` (prima `app/data` hardcoded, rotto post-R6.5); restore con `wal_checkpoint(TRUNCATE)` pre-overwrite + rimozione `-wal`/`-shm` residui (un WAL stale rigiocato sul file ripristinato = corruzione, stesso vettore S52-1).
- **A3+M1 — init riscritto in stile S52-1**: ogni CREATE TABLE/INDEX passa da check esplicito su `sqlite_master` (zero scritture a regime); la zombie `vini_magazzino` NON viene più ricreata al boot (A2-02 audit giugno — la bonifica FK del 10/07 ora resta pulita); probe INSERT/DELETE sostituito da ispezione DDL; FK dei DDL nuovi → `vini_bottiglie(id)`. Smoke-testato su DB vergine e post-cutover (idempotente).
- **A4 — auth su `/vini/carta/pdf-staff` e `/vini/cantina-tools/carta-cantina`** (header Bearer o `?token=`); l'iframe anteprima in Impostazioni passa il token.
- **M2 — PRAGMA standard ovunque**: `vini_widget_settings_service` (4 connect nudi → factory WAL/NORMAL/busy 30000); `main.py` A2-13 su vini.sqlite3 allineato (busy 5000→30000 + synchronous NORMAL).
- **M3 — `/reset-database` svuota anche `matrice_celle`, `vini_ordini_pending`, `vini_prezzi_storico`** (prima lasciava orfani).
- **M4 — `ensure_settings_defaults()` run-once per processo** (prima scan+UPDATE su vini_bottiglie a OGNI generazione carta, con errori silenziati).

### Fix UI
- **M7** ViniImpostazioni: sfondo `bg-brand-cream` (era `bg-neutral-50`, unica pagina vini fuori palette).
- **M8** SchedaMadreV2: useMemo spostato prima dell'early-return (violazione Rules of Hooks latente).
- **M9** DashboardVini: SR_LABELS/SR_CLS ora derivano da `viniConstants.STATO_RIORDINO` (label/colori divergevano nella stessa pagina).
- **M11** menu e CartaVini puntano diretti a `/vini/v2/cantina` e `/vini/v2/bottiglia/{id}` (prima doppio redirect S2).
- Rimosso print di debug al load di vini_router.

### Non fatto (aperti, decisioni PO)
`/vini/carta/pdf`+`/docx` restano pubblici (servono al QR? da decidere); cleanup `*_legacy.jsx` (V-H.I, finestra aperta dal 15/06) e dedup componenti → R7; token in query per i PDF → R8; TrgbLoader nelle pagine vini.

### File
`main.py`, `app/models/vini_magazzino_db.py`, `app/models/vini_settings.py`, `app/routers/vini_router.py`, `app/routers/vini_anagrafiche_router.py`, `app/routers/vini_cantina_tools_router.py`, `app/services/vini_widget_settings_service.py`, `frontend/src/pages/vini/{ViniImpostazioni,DashboardVini,CartaVini}.jsx`, `frontend/src/components/vini/SchedaMadreV2.jsx`, `frontend/src/config/{modulesMenu.js,versions.jsx}` (vini 3.66→3.67).

---

## 2026-07-10 (sera) — Audit Sessione 3: bonifica FK orfane (foodcost + vini_magazzino) `[core]`

Chiusura della parte dati di Sessione 3 (audit A2-02/A2-04/A2-10), tutta testata su copie fresche dei DB di produzione prima dell'applicazione. Sistema 5.36.

### foodcost.db (via migrazione 148, al boot)
- **`ipratico_product_map`**: la FK `vino_id → vini_magazzino(id)` era impossibile (tabella `vini_magazzino` inesistente in foodcost.db; i vini stanno in `vini_bottiglie`, altro file) → foreign_key_check segnalava 1264 falsi orfani su dati sani. Ricostruita la tabella SENZA quella FK. Orfani 1264→0, 1267 righe intatte, indici ricreati, idempotente. `cg_entrate` (65 incassi con link banca morto) lasciata invariata per scelta PO.

### vini_magazzino.sqlite3 (via script one-shot `scripts/bonifica_fk_vini_magazzino.py`, a backend fermo)
- 5 tabelle ripuntate da `vini_magazzino_legacy_20260518`/`vini_magazzino_old` a `vini_bottiglie`: `vini_magazzino_movimenti` (1133), `vini_prezzi_storico` (162), `matrice_celle` (180, −1 cella morta id=193), `vini_ordini_pending` (2), `vini_magazzino_note` (0).
- Cancellata 1 cella orfana (vino_id 1288 non più esistente). DROP delle tabelle morte `vini_magazzino_legacy_20260518` e della zombie `vini_magazzino`. foreign_key_check del file: da 161 violazioni → 0.
- Sicurezza script: backup timestamp + transazione con verifica foreign_key_check+integrity_check PRIMA del commit (rollback automatico se non tornano); default dry-run, serve --apply.

### Residuo noto (rinviato)
- `init_magazzino_database()` (vini_magazzino_db.py) ricrea ancora la zombie vuota `vini_magazzino` al boot e dichiara le FK verso `vini_magazzino` invece di `vini_bottiglie`: dopo la bonifica la zombie ricompare VUOTA e innocua (nessuno la referenzia). Il fix del codice (per installazioni nuove + stop rigenerazione) è rinviato: tocca una funzione di boot non testabile qui. foreign_key_check di tregobbi resta pulito.

### File
`app/migrations/148_fk_ipratico_product_map.py` (nuovo), `scripts/bonifica_fk_vini_magazzino.py` (nuovo), `VERSION`, `frontend/src/config/versions.jsx`.

---

## 2026-07-12 — G.3 Conto Economico: fatture nei ricavi, ripartizione vendite (C2), export PDF + indagine discrepanza iPratico `[core]`

Giornata dedicata a G.3 (priorità TOP). Sistema 5.37, controlloGestione 2.21.

### Indagine discrepanza iPratico vs CE (prerequisito C2 — RISOLTA)
La "discrepanza €14.930" di aprile confrontava iPratico coi soli corrispettivi. Verificato sui dati: la formula incassi (Z cumulativa cena + fatture) è CORRETTA — marzo quadra con iPratico a +€68, giugno a +€3. Il buco vero è **aprile −€11.210 e maggio −€5.917**, e coincide con un campo `fatture` anomalo in chiusura in quei mesi (apr €3.7k, mag €1.7k vs mar €6.3k, giu €6.0k): quasi certamente **fatture emesse (eventi/banchetti via iPratico) non riportate nella chiusura turno**. Indizio a supporto: dentro BATTUTA SINGOLA di aprile c'è "Acconto cena 17/04 €750". Report dei giorni da verificare in `claude/verifica_fatture_apr_mag.md` (Marco incrocia con iPratico; poi backfill assistito del campo fatture).

### Aggiunto
- **Ricavi CE = corrispettivi + fatture emesse** (decisione Marco 2026-07-12). Prima solo corrispettivi → su giugno mancavano €5.982 di fatturato dall'utile. Il KPI Ricavi mostra lo split. `conto_economico.py` + payload `ricavi.fatture_emesse`.
- **C2 / G.3.4 — Composizione del venduto**: mig 149 `ipratico_categoria_tipo` (mapping categoria iPratico → FOOD/VINO/BEVANDE/COPERTO/ALTRO/IGNORA, seed dalle decisioni Marco: Degustazioni→food, vino unico bt+calici, caffè in Bevande, BATTUTA SINGOLA→coperto, Servizio ignorata). Sezione nel CE con barra + drill-down categorie; categorie nuove → DA_CLASSIFICARE con select inline per assegnarle (endpoint GET/PUT `/controllo-gestione/ipratico-tipi`). Test su dati reali: giugno Cucina 68,4% / Coperto 14% / Vino 11,8% / Bevande 5,8%, zero da classificare.
- **G.3.7b — Export PDF del CE** (mattone M.B): template `conto_economico.html` (KPI, waterfall, breakdown costi, composizione venduto, warning) + endpoint `GET /controllo-gestione/conto-economico/pdf` + bottone 🖨 PDF nella pagina (fetch+blob, niente token in URL — pattern A1-08 compliant).

### Corretto (richiesta Marco, stessa sessione)
- **Costi del personale sotto "DIPENDENTI"**: il service etichettava stipendi/consuntivi con la label sintetica `'STAFF'` mentre in `fe_categorie` la categoria si chiama `DIPENDENTI` (id 3) → nel CE comparivano DUE categorie separate. Rename semantico verificato punto-per-punto (`conto_economico.py` ×3 + docstring, `dashboard_router` KPI personale con STAFF legacy in whitelist, color map JSX, tooltip DipendentiAnagrafica; migrazioni storiche NON toccate). Verificato su dati reali: giugno = una sola voce DIPENDENTI €16.610,36 (netti+INPS+F24/ratei/TFR+INAIL), STAFF assente anche nel fallback senza ELAB.

### Note
- Il venduto iPratico è lordo IVA e include le fatture: la composizione è una vista di STRUTTURA, non di quadratura col CE (nota esplicita in UI e PDF).
- Scoperto e documentato: "BATTUTA SINGOLA" è il tasto a prezzo libero (coperto "Servizio, pane e stuzzico" €5 + rari acconti eventi/asporto).

### File modificati
`app/migrations/149_ipratico_categoria_tipo.py` (nuovo), `app/services/conto_economico.py`, `app/routers/controllo_gestione_router.py`, `app/templates/pdf/conto_economico.html` (nuovo), `frontend/src/pages/controllo-gestione/ControlloGestioneContoEconomico.jsx`, `frontend/src/config/versions.jsx`, `VERSION`, docs.

---

## 2026-07-10 (sera) — HOTFIX login 2: invio automatico per ruolo + atterraggio su Home `[core]`

Rifiniture dopo il fix del pad: (1) rimesso l'**invio automatico** del PIN alla lunghezza attesa per ruolo — 6 cifre per admin/superadmin/contabile, 4 per gli altri — così non serve premere ✓ (che resta come conferma manuale/fallback, con Invio da tastiera); i pallini indicatori si adattano alla lunghezza attesa. (2) Dopo il login si va **sempre alla Home**, non all'ultima pagina aperta (`window.history.replaceState` prima di settare il token). Sistema 5.35, auth 2.2.2. File: `frontend/src/components/LoginForm.jsx`.

---

## 2026-07-10 (sera) — HOTFIX login: PIN pad supporta 4-6 cifre (era bloccato a 4) `[core]`

Regressione emersa subito dopo S2: il PIN pad di `LoginForm.jsx` si auto-inviava a 4 cifre, quindi chi (admin/contabile) aveva impostato un PIN a 6 non riusciva più ad accedere (mandava solo le prime 4 → errore). Fix: niente auto-invio, si accumulano 4-6 cifre e si conferma con tasto ✓ verde (o Invio). Dot indicator portato a 6. Sistema 5.34, auth 2.2.1. File: `frontend/src/components/LoginForm.jsx`.

---

## 2026-07-10 (sera) — Audit Sessioni 2+3: lockout login, PIN 6 cifre, indice fe_righe, WAL vini `[core]`

Ripresa del piano audit — Sessione 2 "Login robusto" + Sessione 3 "Igiene DB" (parte a rischio zero). Sistema 5.32→5.33, auth 2.1→2.2.

### Aggiunto
- **Lockout brute-force login (A1-04)**: contatore tentativi per-utente in memoria con backoff progressivo (default: 5 tentativi liberi, poi 30s che raddoppiano fino a 15 min). Soglie configurabili in `locali/<locale>/data/auth_settings.json` (create con default al primo avvio); UI in Impostazioni prevista dopo. Login bloccato → HTTP 429 con `Retry-After`. Reset al primo login riuscito. Tracciato solo per utenti reali (le tile sono già pubbliche → nessun leak, dict limitato).
- **PIN minimo 6 cifre per admin/contabile (A1-04, §3.9)**: validazione backend su `add_user`/`change_password` per i ruoli `superadmin/admin/contabile`. Gli altri ruoli restano 4-6.
- **Indice `fe_righe(fattura_id)` (A7-02/A2-03)**: migrazione 147 (idempotente, additiva) + creazione anche nel self-heal di `fe_import._ensure_tables` (copre installazioni nuove). Elenco fatture / conto economico / matching ricette non fanno più full-scan di 11.392 righe.

### Corretto / Igiene
- **WAL su vini.sqlite3 (A2-13)**: one-shot difensivo al boot (`main.py`, try/except non bloccante) — allinea l'unico DB rimasto in rollback mode; è legacy in scrittura ma ancora letto da dashboard/alert.
- **push.sh cleanup (A2-07)**: dopo il download DB rimuove i `*-wal/-shm/.fuse_hidden` orfani locali che potevano disallineare i file scaricati.
- **A4-03**: `CambioPIN.jsx` chiamava `/auth/users` senza slash finale (307 con rischio perdita header) → aggiunto slash.

### Infra (VPS, complementare — da applicare a parte)
- **A6-07**: rate-limit nginx su `/auth/login` (5r/m per IP, complementa il lockout applicativo). Conf pronta in `claude/nginx/` + runbook §6.0/6.1 aggiornato per i clienti nuovi.

### Verifica
- Logica lockout testata in isolamento (progressione 30→60→120…→900s cap, reset su successo). `py_compile` OK su tutti i file Python, `bash -n push.sh` OK, `@babel/parser` OK su CambioPIN.jsx. Migrazione 147 guardata su esistenza tabella (fresh install → indice dal self-heal).

### File modificati
`app/migrations/147_fe_righe_index.py` (nuovo), `app/routers/fe_import.py`, `app/services/auth_service.py`, `main.py`, `push.sh`, `frontend/src/pages/CambioPIN.jsx`, `frontend/src/config/versions.jsx`, `VERSION`, `docs/installazione_nuovo_server.md`, `docs/audit-2026-06-12/AUDIT_STATE.md`.

---

## 2026-07-10 — Audit: ripresa piano 2026-06-12 — chiusi i 2 CRIT residui + /docs protetto + header sicurezza `[core]`

Ricognizione delta sull'audit del 12/06 (fermo da 28 giorni): dei 110 finding risultavano chiusi solo 4. Report in `docs/audit-2026-06-12/11_DELTA_2026-07-10.md`. Nella stessa giornata chiusi i residui della Sessione 1.

### Sicurezza
- **A9-01 (CRIT)**: `047_prestiti_bpm.py` marcata `TRGB_SPECIFIC = True` — i prestiti BPM reali (importi e residui personali) non vengono più inseriti nei DB dei locali nuovi né nel demo. La 048 NON flaggata di proposito: crea solo lo schema `cg_piano_rate` (universale) e senza la 047 resta vuota da sola. `MIGRATIONS_TRGB.md` aggiornata. Zero effetto su tregobbi (047 già in `schema_migrations`).
- **A9-02 (CRIT)**: `app/core/config.py` fail-loud — in produzione (`TRGB_ENV=production` o path `/home/marco/trgb`) se `SECRET_KEY` non è nell'ambiente il backend NON parte, invece di firmare JWT con la chiave default pubblica del repo. Runbook §5.1: `Environment="SECRET_KEY=..."` + `TRGB_ENV=production` + comando per generare la chiave. Verificato pre-push che tregobbi ha la chiave nel `.env` (nessun impatto).
- **A6-06 (MED, decisione PO: "dietro login")**: Swagger `/docs`, `/redoc`, `/openapi.json` protetti da HTTP Basic Auth a livello nginx sul VPS (`.htpasswd_trgb_docs`). Anonimo → 401, con credenziali → 200.
- **A6-09 (MED)**: header di sicurezza (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) su trgb.tregobbi.it e app.tregobbi.it + `server_tokens off`. Config replicate nel runbook §6.0/6.1 per i clienti nuovi.
- **A6-12/A6-13 riconfermati live**: sshd `PermitRootLogin no` + `PasswordAuthentication no`; porte 9000/9443 solo su 127.0.0.1, 3389 spenta.

### Verifica
- Probe live: `/banca/movimenti` e `/vini/ipratico/stats` senza token → 401; `/docs` anonimo → 401; `/system/info` → 200; header presenti su entrambi i domini, versione nginx non esposta.
- `config.py` testato nei 3 casi: dev boota, prod-senza-chiave solleva RuntimeError, prod-con-chiave boota. `py_compile` OK su 047 e config.

### File modificati
`app/migrations/047_prestiti_bpm.py`, `app/core/config.py`, `locali/tregobbi/seeds/MIGRATIONS_TRGB.md`, `docs/installazione_nuovo_server.md` (§5.1 + §6.0/6.1), `docs/audit-2026-06-12/{11_DELTA_2026-07-10.md (nuovo), AUDIT_STATE.md}` + config nginx sul VPS (fuori repo, backup in `/etc/nginx/backups/`).

---

## 2026-07-10 — Turni: vista "Mese intero" in Per dipendente + fix nav mese in Miei turni `[core]`

Segnalazione Marco: nella vista Per dipendente non si riusciva a selezionare il mese effettivo (solo 4/8/12 settimane, frecce ±N settimane che derapano dai mesi di calendario).

### Aggiunto
- **PerDipendente.jsx v1.4.1-vista-mese**: quarta opzione "Mese intero" nel select periodo. In modo mese: select Mese+Anno (anno corrente ±2), frecce ◀▶ = ±1 mese vero, "Oggi" = mese corrente. Il FE calcola `settimana_inizio` (settimana ISO del 1° del mese) e `num_settimane` (settimane ISO che intersecano il mese, 4–6) — backend `/turni/dipendente` invariato. Persistenza: `turni_perdip_modo`, `turni_perdip_mese`.
- **Totali sul mese esatto (v1.4.1, segnalazione Marco post-prima-versione)**: i totali del backend coprono l'intero range di settimane (incluse le code del mese adiacente, es. 29-30 giu in "Luglio"); in modo mese il FE li ricalcola sui SOLI giorni del mese, riusando i valori per-giorno del payload (somme additive, stessa definizione BE di lavorato/riposo). Le code fuori mese restano visibili ma attenuate (opacity-40 + tooltip "escluso dai totali"); header totali etichettato "(totali del solo mese)". Il semaforo CCNL resta settimanale (corretto così).

### Corretto
- **MieiTurni.jsx v1.4-mese-vero**: i bottoni "⏪ mese / mese ⏩" spostavano di ±4 settimane (etichetta ingannevole); ora saltano al mese di calendario precedente/successivo coprendo il mese intero. Validazione `turni_mieituri_n` allargata a 1..12.

### Verifica
- Copertura mese testata programmaticamente su tutti i 48 mesi 2024–2027 (0 fail), incl. cavallo d'anno (Gen 2027 → 2026-W53) e Feb 2027 che inizia di lunedì (4 settimane esatte). @babel/parser OK su entrambi i file.

### File modificati
`frontend/src/pages/dipendenti/{PerDipendente.jsx, MieiTurni.jsx}`, `frontend/src/config/versions.jsx`, `docs/{modulo_dipendenti_turni.md, changelog.md, sessione.md}`.

---

## 2026-07-02 — Statistiche 1.2.1: fix semantica cumulativa shift_closures + fallback pre-cutover in Coperti `[core]`

Due bug segnalati da Marco subito dopo il push di 1.2.

### Corretto
- **Storico gonfiato (marzo "il doppio")**: la v1.2 sommava `preconto` di pranzo+cena, ma la riga CENA contiene la **chiusura RT cumulativa di giornata** (la Z include il pranzo) → il pranzo veniva contato due volte, più `shift_preconti` sommati a sproposito. Verifica sui dati: overlap 1-10 marzo `cena.preconto + fatture == daily.corrispettivi_tot` in 8/8 giorni; 0 violazioni cena<pranzo su 102 giorni; col fix marzo=71.574€ vs iPratico 71.506€ (+68), giugno 49.370€ vs 49.368€ (+2). Nuova formula in `_storico_daily_rows`: giorno = `cena.preconto + SUM(fatture)`; split pranzo/cena per differenza; coperti (reali per turno) invariati; `shift_preconti` esclusi per omogeneità con la metrica daily-era. Corretti a cascata YoY, weekday, spesa per coperto (scontrino medio giugno: 68→50€, realistico).
- **Coperti & Incassi muta su gennaio/febbraio**: le chiusure turno esistono solo dal 1/3/2026; per i mesi precedenti la pagina ora fa fallback sul registro corrispettivi (nuovo endpoint 12 `GET /statistiche/storico/giorni`) con banner esplicativo: solo incassi giornalieri, niente coperti/turni.

### Nota aperta (decisione Marco)
`/admin/finance/shift-closures/stats/daily` (modulo cassa, usato dalla stessa pagina Coperti per i mesi shift) somma ancora pranzo+cena+preconti nei campi `fatt_*` e nei pagamenti → media coperto e fatturati giornalieri gonfiati allo stesso modo. Da sistemare nel modulo cassa (contesto K.12): non toccato perché fuori dal modulo statistiche.

### File modificati
`app/routers/statistiche_router.py`, `frontend/src/pages/statistiche/StatisticheCoperti.jsx`, `frontend/src/config/versions.jsx`, `docs/{modulo_statistiche.md, changelog.md, sessione.md}`.

---

## 2026-07-02 — Statistiche 1.2: modulo potenziato — Storico YoY, giorno settimana, spesa per coperto, movimenti prodotti `[core]`

Il modulo Statistiche era fermo al solo import iPratico mensile. Ora è l'aggregatore cross-modulo read-only: sblocca 6 anni di incassi giornalieri (`daily_closures` 2021→2026 + `shift_closures`, ~3M€) che nessuna pagina mostrava.

### Aggiunto
- **Backend** (`statistiche_router.py` v1.2, endpoint 8-11):
  - `GET /statistiche/storico/yoy` — fatturato annuale + matrice mese×anno su tutta la storia. Cucitura daily_closures/shift_closures con **cutover dinamico** = MIN(date) shift_closures (K.12-proof). Lettura `admin_finance.sqlite3` in **mode=ro** (eccezione modulare: statistiche = aggregatore read-only).
  - `GET /statistiche/storico/weekday?anno=` — media incassi per giorno settimana sui giorni aperti; coperti e split pranzo/cena solo era shift_closures.
  - `GET /statistiche/coperto?anno=` — €/coperto e pezzi/coperto per categoria iPratico, mese per mese (venduto iPratico ÷ coperti chiusure turno).
  - `GET /statistiche/movimenti?anno=&mese=&min_euro=&n=` — prodotti in crescita/calo/nuovi/spariti vs mese precedente importato; soglia `min_euro` esposta come parametro API (default 50), non nascosta hardcoded.
- **Frontend**:
  - Nuova pagina `StatisticheStorico.jsx` (tab "Storico" 🕰️): barre fatturato per anno con delta %, matrice mese×anno con delta vs stesso mese anno precedente + riga "Parziale" YTD omogeneo, giorno della settimana con filtro anno e tabella turni.
  - `StatisticheCoperti.jsx`: sezione "Cosa consuma un coperto" — €/coperto per categoria del mese con delta vs mese precedente.
  - `StatisticheDashboard.jsx`: card "In crescita"/"In calo" (vista Mese) dai movimenti prodotti.
  - `StatisticheProdotti.jsx`: click su riga → modal trend mensile del prodotto (endpoint trend già esistente, mai usato da UI).

### Corretto
- Label sub-modulo dashboard Statistiche: era "Cucina" (copy-paste) → "Dashboard" in `modules.json` e `modulesMenu.js`.

### Note
- iPratico è aggregato mensile: weekday sui singoli prodotti impossibile, l'analisi weekday usa incassi/coperti.
- Verifica: 4 endpoint testati su DB reale (YoY 2021-2026 coerente con SQL diretto, scontrino medio giugno 68,09€, movimenti giu-vs-mag plausibili). Sintassi FE verificata con @babel/parser su tutti i file toccati.

### File modificati
`app/routers/statistiche_router.py`, `frontend/src/pages/statistiche/{StatisticheStorico.jsx (nuovo), StatisticheCoperti.jsx, StatisticheDashboard.jsx, StatisticheProdotti.jsx, StatisticheNav.jsx}`, `frontend/src/App.jsx`, `frontend/src/config/{modulesMenu.js, versions.jsx}`, `app/data/modules.json`, `docs/{modulo_statistiche.md, roadmap.md, changelog.md, sessione.md}`.

---

---

## Storico

I rilasci più vecchi sono spostati in archivio (regola: in questo file restano ~3 mesi):
- [archive/changelog_archivio_2026-06.md](archive/changelog_archivio_2026-06.md) — rilasci maggio–giugno 2026
- [archive/changelog_archivio_2026-04.md](archive/changelog_archivio_2026-04.md) — rilasci dicembre 2025 → aprile 2026
