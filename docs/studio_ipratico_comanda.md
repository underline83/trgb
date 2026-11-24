# Studio per la Comanda — iPratico, i concorrenti e cosa copiare

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — studio del 2026-11-24, aggiornato la sera del 24/11 con gli 83 screen dell'app e le 5 foto degli scontrini di cucina mandati da Marco; manca solo il back office web · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [modulo_comande.md](modulo_comande.md), [analisi_ipratico_cloud.md](analisi_ipratico_cloud.md), [operativo/rete.md](operativo/rete.md)

Chiesto da Marco il 24/11/2026 dopo aver visto la Comanda 1.0: «primo sistema molto molto basico… studia iPratico, le schermate e le documentazioni che trovi, così copiamo un po' e poi personalizziamo», e poi «valutiamo anche altri concorrenti, non abbiamo fretta, facciamo le cose bene». Regola collegata (Q #389): sui moduli grossi prima proposte e schermate da vedere, poi codice. Marco ha scelto il 24/11 (conto a elenco, mappa dei tavoli): la proposta del §5 è diventata la **Comanda 2.0** ([modulo_comande.md](modulo_comande.md)).

> **Correzione del 24/11 (sera), dopo gli screen e gli scontrini.** Nella prima stesura avevo scritto che l'osteria lavora «a ondate» (si batte e si invia solo ciò che deve uscire adesso). **Era sbagliato**: l'avevo dedotto dagli orari d'invio dei conti. L'app è impostata su «vai e attendi»: la comanda parte intera, divisa per uscite, e la sala chiama ogni uscita con «Vai con la preparazione», che ristampa in cucina i piatti di quell'uscita. Il §2 punto 1 e il §5 sono riscritti, la proposta «C — tieni e manda» cade, e il §8 descrive l'app schermata per schermata.

## 1. Fonti, e cosa NON ho potuto vedere

| Fonte | Cosa dà | Limite |
|---|---|---|
| Conti iPratico già in TRGB (`cassa_conti`: 1.177 conti e 12.856 righe dall'1/9 al 23/11/2026) | Come si lavora davvero: cosa si batte, in che ordine, da quale dispositivo, a che ora parte ogni invio | Solo conti chiusi: non si vedono storni, messaggi alla cucina, spostamenti, varianti |
| Pagine pubbliche iPratico (App Store di Eat e Waiter, sito, scheda di un rivenditore) | Elenco delle funzioni | Nessun manuale pubblico di Eat; i manuali in rete sono del vecchio iPratico POS (2012-2013) |
| Guide in linea dei concorrenti (§4) | Come funzionano uscite, invio, stati delle righe | Lette le pagine sulle portate e sulla presa dell'ordine, non tutto il prodotto; nessuna prova dal vivo |
| **Schermate dell'app iPratico (iPad, versione 7.6.0)** | 83 screen di Marco del 24/11 (cartella `Desktop/ipratico`): login, tutte le categorie, tavoli, apertura tavolo, presa comanda, varianti, Clienti, Prenotazioni, Notifiche, Gestione e Impostazioni (§8) | Non visti: la Mappa dei tavoli, il menu «…» della comanda e il «⋮» del tavolo, storno, sposta e unisci tavolo, conto alla romana, il palmare |
| **Scontrini di cucina** | 5 foto di Marco del 24/11: la comanda intera e quattro «Vai con la preparazione» (§8.9) | Non visti: la stampa in sala, il sollecito, l'«attendi», lo storno |
| **Back office web ipraticocloud.com** | — | Non letto (serve il login di Marco). Buona parte c'è già nella Gestione dell'app |

## 2. Come l'osteria usa iPratico (dai conti, 1/9 → 23/11/2026)

1. **La comanda parte intera, divisa per uscite; poi la sala chiama.** In Impostazioni › Tavoli è acceso «Utilizza vai e attendi per gestione comande in cucina». Nei conti: 976 su 1.157 hanno almeno un invio con più uscite insieme; un conto ha di solito 3-5 invii (il più frequente 4), perché l'acqua all'inizio, i dolci e i caffè alla fine si battono dopo. La sala usa le uscite sempre allo stesso modo: **Uscita 1 = stuzzico** (e l'acqua), **Uscita 2 = pane**, **Uscita 3 = primo giro di piatti** (antipasti 1.100, primi 460, secondi 227), **Uscita 4 = secondo giro** (primi 782, secondi 688), **Uscite 5-6 = dolci**. I piatti su due o più uscite nello stesso invio (cioè «tengo i secondi») ci sono in 170 conti su 1.157: si fa, ma più spesso il giro dopo si batte dopo. Nei dati scaricati la «portata» parte da 0 (portata 0 = Uscita 1) e l'orario è quello dell'invio della comanda, non della chiamata.
   Esempio vero, tavolo 31 dell'1/9 (2 coperti): 20:40 un'acqua → 21:01 un solo invio con Uscita 1 «Stuzzico ×2», Uscita 2 «Pane e Grissini ×1», Uscita 3 guancetta e risotto, Uscita 4 un calice → 21:58 Uscita 5 due dolci.
2. **Il coperto è una riga automatica**: «Servizio, pane e stuzzico» a 5 €, quantità = coperti (1.024 conti; 128 volte la versione «omaggio»).
3. **«Stuzzico» e «Pane e Grissini» sono righe a 0 €** che servono solo a dire alla cucina di farli partire (1.140 e 1.131 volte, praticamente ogni tavolo). Ci sono anche «Pane senza glutine» (30) e «Rimpiazzo Pane» (14).
4. **I calici si battono a prezzo, non a vino**: «Calice 7 €» (295), 8 € (226), 9 € (157), 10 € (94), 11 €… fino a 18 €. Mai il nome del vino.
5. **Le bottiglie invece col vino vero** (codice a 4 cifre in testa al nome, come esce dall'export TRGB).
6. **Pranzo**: «Pranzo - Una/Due/Tre Portate» per il prezzo (15/25/35 €; 23/66/9 volte) più «Piatto Pranzo» a 0 € (220), a cui si attacca la variante **«Pranzo»** col piatto della settimana (sei opzioni al 24/11: torta salata, flan, tagliatella, risotto, cotoletta, coda); «Piatto pranzo 14/15/16/18/20» per il piatto singolo (il 15: 74 volte).
7. **Piatti del giorno a prezzo + variante**: «Antipasto / Primo / Secondo del giorno NN» (tessere scure, da 16 a 30 €) e la variante **«Piatti del giorno»** col nome vero (tre opzioni al 24/11). Sul conto esce il prezzo, in cucina il nome.
8. **Menu gruppi**: i piatti del menu passano come righe a 0 € in maiuscolo («CASONCELLI (7)», «ANTIPASTO MISTO OSTERIA», «GUANCETTO O CONIGLIO», «TIRAMISU», «LIBERO»).
9. **Righe libere** ci sono: «no_name» 387 volte, più «Vino», «Torta», «Menu» scritti a mano.
10. **Chi batte**: il palmare «SALA» fa quasi tutto il cibo (4.617 righe su 7.770); la «Cassa» fa bevande, caffè, acque e chiusura (2.035 bevande); «Marco» poche.
11. **Varianti: si usano, a gruppi.** «Varianti senza costo» in Gestione: Allergeni (No Glutine, No Crostacei, No Uova, No Pesce, No Arachidi, No Soia, No Lattosio…), Cottura (Al sangue, Media, Ben cotta), Divisa in piatti (due, tre, quattro, cinque), Formato pasta, Panna Cotta, Piatti del giorno, Pranzo. Nei dati scaricati non ci sono (lo scarico non le legge: 0 righe su 101.318), quindi non si può contare quanto si usino.
12. **Conti senza tavolo**: «Bancone», «Tavolone» e conti a nome esistono ma sono rari.
13. **L'omaggio del coperto è quasi tutto del menù del pranzo.** A pranzo 111 omaggi contro 337 coperti pagati, a cena 21 contro 689. Dei 111 omaggi del pranzo, 102 sono in conti con articoli della categoria «Pranzo»; dei 337 pagati, solo 36. Il costo di servizio si sceglie all'apertura del tavolo.
14. **In cucina i piatti hanno un altro nome**, corto e in maiuscolo: «Selezione 6 Formaggi ITA» → FORMAGGI 6 ITA, «I Casoncelli di Mamma e Papà» → CASONCELLI, «Coniglio alla bergamasca» → CONIGLIO E POLENTA.

## 3. Cosa fa iPratico in più (dalle pagine pubbliche)

Mappa dei tavoli disegnata; tavoli assegnati al cameriere; menù composti (menù del giorno, di lavoro) con piatti modificabili; varianti e ingredienti; invio a stampante termica e a «Cook» (schermo cucina) con stato di avanzamento visibile al cameriere; ordini a voce. Nella vecchia app (scheda del rivenditore AGTech): uscite gestite e temporizzate, comande condivise fra centri di produzione, destinazioni di stampa per categoria e per prodotto, separa conto e conto alla romana, sposta e unisci tavolo, cinque listini, prezzo tavolo e prezzo banco, PIN per operatore.

## 4. I concorrenti: come fanno uscire i piatti

Letti: le guide di **Passepartout Menu** (Italia, la più dettagliata), **Lightspeed Restaurant** serie K e serie O, **Square for Restaurants**, **Toast**, più le pagine di **Cassa in Cloud** (TeamSystem), **Tilby** (Zucchetti) e **Revolut POS**. Di Cassa in Cloud e Tilby ho solo le pagine di presentazione e l'indice delle guide; SumUp non pubblica niente di utile sulle comande.

| Sistema | Come si assegna l'uscita | Come parte il seguito | Cosa vede la cucina | Stati della riga per il cameriere |
|---|---|---|---|---|
| **Passepartout Menu** | Tre modi: automatica (per categoria), a richiesta (la chiede a ogni piatto), numero fisso con tasto **«Segue →»** che passa all'uscita dopo | «Invia tutto», «Invia uscite» (scelgo quali), **«Invia prossima uscita»** con un tocco; oppure **«chiamata uscita»**: tutta la comanda subito, poi solo il messaggio «prepara l'uscita N» | A scelta per reparto: solo ciò che parte, oppure anche le uscite in attesa stampate in carattere diverso con «NON INVIATE»; stampante «coordinatore» con la comanda intera | Giallo = non inviata; verde = in attesa; accanto all'uscita l'ora d'invio; dopo l'invio la riga si può solo eliminare |
| **Lightspeed serie O** | Automatica per categoria (di base tutto in «Now» = subito), cambiabile sul singolo piatto | «Send», poi **campanella** per chiamare un'uscita o un piatto solo | Tre impostazioni: stampa tutto subito e si chiama a voce; stampa tutto subito e la campanella stampa l'avviso; stampa ogni uscita solo quando è chiamata. Foglio a parte con le modifiche | Campanella per uscita |
| **Lightspeed serie K** | Tutto in «Course 1», «Add a course», tocco sul nome dell'uscita per riempirla; vista per uscita o per posto | «Send», poi Actions › **Fire course** | Solo i piatti nuovi a ogni invio | Freccia bianca = non partita, fiamma arancione = partita, spunta verde = fatta |
| **Square for Restaurants** | Uscite nel carrello, «Add Course» | Su ogni uscita icona **fuoco** (parte) o **stop** (tieni); più tardi fuoco + Send | A scelta: partite e tenute insieme, o solo le partite; alla partenza un «fire ticket». Si può far partire anche dallo schermo del passe | Icone fuoco/stop per uscita |
| **Toast** | Uscite facoltative; oppure piatto per piatto | Tasti **Send / Hold**: mando alcuni piatti e gli altri restano tenuti, o il contrario. In alternativa ritmo automatico: a tempo o quando la cucina chiude l'uscita prima (serve lo schermo cucina) | Solo ciò che è partito | Rosso = tenuto, giallo = inviato |
| **Revolut POS** | Prodotti assegnati alle uscite, trascinabili | Fiamma = manda l'ordine; campanella accanto a ogni uscita | — | Icona arancione sugli inviati; l'uscita inviata si richiude |
| **Cassa in Cloud** | «Quantità e numero di portate» | Avanzamento delle portate dal palmare | Stampanti per centro di produzione o schermo cucina | — |
| **iPratico in osteria** | Uscite libere e numerate; «Nuova uscita»; si batte in quella corrente | «Invia comanda» manda tutto, la prima uscita va; poi «Vai con la preparazione» per uscita; «Attendi», «Invia sollecito» | Subito la comanda intera per uscite; a ogni chiamata un foglio che ripete i piatti (§8.9) | Freccia = parte, mano = attende; sul tavolo «Uscita 1 di 6» |

**Altre cose che fanno tutti o quasi, e che alla Comanda 1.0 mancano:**

1. Coperti chiesti all'apertura (c'è) e **coperto messo in conto da solo**.
2. **Mappa della sala** come schermata di partenza, con lo stato del tavolo a colpo d'occhio (TRGB la mappa ce l'ha già in Prenotazioni).
3. **Riga bloccata dopo l'invio**: si può solo togliere, e il reparto riceve l'avviso (c'è, come «storno»).
4. **Righe uguali raggruppate** in una sola (c'è, se senza nota).
5. **Ristampa** della comanda o di un reparto.
6. **Funziona senza rete**: Cassa in Cloud e Tilby tengono gli ordini e li stampano quando torna il Wi-Fi.
7. **Chiudere e liberare il tavolo dal palmare** (Cassa in Cloud).
8. **Piatti per posto** (Lightspeed, Toast, Cassa in Cloud coi «sottoconti»): serve a dividere il conto; all'osteria da valutare, oggi si fa alla romana.
9. **Variante «non inviare»** (Passepartout): la riga sta sul conto ma non va in cucina.
10. **Uscita urgente**: un tasto che marca «SUBITO» tutta l'uscita (Passepartout).
11. **Foglio delle modifiche** per la cucina quando cambia qualcosa di non ancora uscito (Lightspeed O).

## 5. La scelta di fondo: come escono i piatti

Messi in fila, i sistemi usano quattro modi.

- **A — A ondate.** Si batte e si invia solo quello che deve uscire adesso; il resto dopo.
- **B — Tutto subito, poi si chiama** (Passepartout «chiamata uscita», Lightspeed O con la campanella, **iPratico «vai e attendi»**; è anche la Comanda 1.0). La cucina riceve l'intero tavolo diviso per uscite; alla chiamata esce un secondo foglio.
- **C — Tieni e manda** (Square, Toast, Passepartout «Invia prossima uscita»). In cucina arriva solo l'uscita che parte; le altre restano sul palmare.
- **D — Da sola** (Toast): l'uscita dopo parte a tempo o quando la cucina chiude quella prima. Serve uno schermo in cucina.

**L'osteria lavora già in B, nella versione di iPratico.** «Invia comanda» manda tutto: la prima uscita va, le altre attendono. Poi, per ogni uscita, «Vai con la preparazione»; su quella partita ci sono «Attendi» e «Invia sollecito». La chiamata **ristampa i piatti dell'uscita con le varianti** (§8.9): il difetto che davo al modo B, «il foglio in cucina è già vecchio», qui non c'è. E il modo A resta possibile senza cambiare niente: «Nuova uscita», si batte, «Invia comanda».

**Cosa propongo ora: copiare questo, com'è.** La sala e la cucina lo conoscono, e la Comanda 1.0 è già dello stesso tipo. La proposta C della prima stesura cade: toglierebbe alla cucina la vista del tavolo intero, che oggi ha. Cosa cambia rispetto alla Comanda 1.1:

| | iPratico in osteria | Comanda 1.1 |
|---|---|---|
| Uscite | libere e numerate; «Nuova uscita»; si batte nell'uscita corrente (in grassetto) | «Subito» più 4 uscite fisse, proposte per famiglia e scelte nel catalogo |
| Stuzzico e pane | righe dell'Uscita 1 e dell'Uscita 2 | tasti rapidi in «Subito» |
| Invio | «Invia comanda»: tutto parte, la prima uscita va, le altre attendono | «Invia»: tutto parte, senza stato «va / attende» |
| Chiamata | «Vai con la preparazione» per uscita, col foglio che ripete i piatti | «Via la Nª»: solo l'avviso |
| Ripensamenti | «Attendi», «Invia sollecito» | non ci sono |
| Tavolo | «Uscita 1 di 6» sulla card | totale e righe da inviare |
| Varianti | gruppi a scelta più testo libero | solo nota libera |
| Nome in cucina | corto, in maiuscolo | quello della carta |

Decide Marco, sulle schermate disegnate.

## 6. Altre scelte che lo studio apre (da decidere con le schermate davanti)

> **Aggiornamento del 24/11/2026 (sera).** Marco: «mettiamo i calici così perché al momento non sono linkati col sistema; in futuro tramite TRGB selezioneremmo il calice aperto. Sistema quello che già hai capito». I punti 1, 2 e 3 sono **chiusi e fatti** nella Comanda 1.1 ([modulo_comande.md](modulo_comande.md)); gli altri aspettano gli screen di iPratico.

1. ~~Coperto automatico a 5 € a coperto, con «omaggio»: sì come oggi?~~ ✅ Fatto (1.1): entra in conto all'apertura, segue i coperti, omaggio dal tasto dei coperti; nome e prezzo in Impostazioni.
2. ~~«Stuzzico» e «Pane»: due tasti fissi in alto nel conto?~~ ✅ Fatto (1.1): tasti rapidi a 0 € in cima al conto, quantità proposta dai coperti (stuzzico = coperti, pane = uno ogni due, come nei conti). Resta da vedere se devono partire da soli al tocco invece che col prossimo «Invia».
3. ~~Calici: tasti a prezzo come oggi, o tasto a prezzo + il vino scelto?~~ ✅ Deciso da Marco e fatto (1.1): si sceglie il calice aperto, cioè una delle bottiglie in mescita di TRGB (9 al 24/11, da 7 a 18 €: le stesse fasce dei tasti «Calice N €» di iPratico). Lo scarico della cantina arriva con la Cassa.
4. Piatti del giorno: col nome vero preso da TRGB (proposta) o a prezzo come oggi?
5. Menu gruppi e degustazioni: l'articolo apre da solo i suoi piatti a 0 € per la cucina?
6. Pranzo: N portate + scelta dei piatti della settimana (già così nella 1.0)?
7. Schermata di partenza: griglia (1.0), elenco, o la mappa di Prenotazioni?
8. Palmare e iPad: due viste diverse (cibo in sala, bevande e chiusura in cassa)?
9. Cosa stampa la cucina: solo ciò che parte, o anche «in attesa»? Una stampa per tutto il tavolo al passe?

**Dopo gli screen e gli scontrini (24/11 sera):**

- Punto 4, piatti del giorno: iPratico li batte a prezzo e mette il nome con una variante; TRGB ha già nome e prezzo di ogni piatto del giorno, quindi la proposta resta il nome vero.
- Punto 5, menu gruppi e degustazioni: in iPratico sono tessere a prezzo più una trentina di tessere a 0 € in maiuscolo, battute a mano una per una. Far aprire i piatti dal menu resta da decidere.
- Punto 6, pranzo: «Piatto Pranzo» più variante col piatto, in TRGB articoli a 0 € coi piatti della settimana. È la stessa cosa.
- Punto 7, schermata di partenza: iPratico parte dal Monitor a card per sala, non dalla mappa (che è una seconda vista). La griglia della 1.0 è già quello; le mancano «Miei», lo stato dell'uscita e il timer.
- Punto 9, cosa stampa la cucina: chiuso dagli scontrini (§8.9).
- **Nuovi:** (10) il nome corto per la cucina, che in TRGB oggi non c'è; (11) coperto in omaggio da solo quando nel conto entra il menù del pranzo (§2 punto 13); (12) varianti a gruppi (allergeni, cottura, divisa in piatti) al posto della sola nota; (13) i coperti a 0 si possono aprire, come in iPratico.

## 7. Cosa serve da Marco per chiudere lo studio

Gli screen e gli scontrini sono arrivati il 24/11. Resta poco, e niente blocca le schermate disegnate:

1. Cosa succede alle uscite di una **seconda comanda** sullo stesso tavolo (i dolci battuti dopo partono da soli o vanno chiamati?).
2. Il «⋮» del tavolo è arrivato (§8.4). Restano il menu «…» della comanda (storno, conto separato) e la voce Mappa, che non ho visto: Marco dice che «su iPratico non c'è una mappa, è un limite».
3. Lo scontrino della stampante di **sala** e quello di un **sollecito** e di uno **storno**.
4. Il **palmare**: se è la stessa schermata dell'iPad in piccolo.
5. **Schermate disegnate (24/11):** [Comanda TRGB — schermate da scegliere](https://claude.ai/artifact/BqLwPeqGhBusqkLEuxS3Y2) (canvas in claude.ai, privato di Marco). Sette tavole: il conto su iPad in due varianti (A a tessere come iPratico, B a elenco), i tavoli, il palmare (conto e aggiunta), le varianti di un piatto, i due fogli di cucina. Dentro ci sono tre cose che iPratico non ha: «va / attende» scritto su ogni uscita del foglio di cucina, gli allergeni in negativo, le uscite già andate richiuse sul palmare. Marco ha scelto la **B, a elenco** («la tessera ha senso quando ci sono le foto dei piatti, ma io non la uso») e ha chiesto la mappa: è la Comanda 2.0.

## 8. L'app iPratico, schermata per schermata (screen e scontrini del 24/11/2026)

### 8.1 Struttura
App per iPad, versione 7.6.0. Si entra toccando la tessera dell'operatore (Cassa, Marco, SALA, i camerieri per nome, Tecnico). In basso sei sezioni: **Cassa, Tavoli, Clienti, Prenotazioni, Notifiche, Gestione**.

### 8.2 Cassa
A sinistra una griglia 5 × 3 di tessere prodotto: fascia colorata per categoria, nome, prezzo (nella vista «Prodotti» anche la categoria), pagine a puntini, ricerca «Prodotti, categorie, PLU e tag», e in basso la striscia delle categorie che scorre. In alto Banco / Tavolo / Asporto / Delivery, il listino («Ristorante»), il tasto PLU, il tasto che apre i tavoli aperti, «+». A destra il conto: cliente, righe (quantità, nome, prezzo, varianti sotto la riga), subtotale, Preconto / Sc. Fiscale / Fattura / Sc. Parlante, Portafoglio, Cassetto, «Stampa € 104,00».

### 8.3 Categorie (23, nell'ordine della striscia)
Servizio (Stuzzico, Pane e Grissini, Rimpiazzo Pane, Pane senza glutine: tutti a 0 €) · Bevande (11) · Antipasti (13 piatti più «Antipasto del giorno» 16/18/20/22) · Primi (6 «Bimbo», 7 piatti, «Primo del giorno» da 16 a 24) · Secondi (2 «Bimbo», 9 piatti, «Macellaio» da 70 a 180 €, «Secondo del giorno» da 18 a 30) · Contorni (7) · Dolci (8) · Degustazioni (45 tessere: tre percorsi a 50/60/75 €, dieci «Menù gruppi» da 50 a 70 €, e 32 voci a 0 € in maiuscolo per la cucina, fra cui Stuzzico e Pane Degustazione) · Calici («Abbinamento Calici» da 25 a 70 €, «Calice N€» da 6 a 25) · Birre (7) · Alcolici (Amaro/Liquore 5-7-10, Cocktail 10-14, «Distillato N€» da 4 a 20) · Bottiglie (10 pagine, col codice TRGB nel nome) · Vendita (gift card, panettoni) · Pranzo («Piatto Pranzo» 0 €, «Piatto pranzo» 14-20, Una/Due/Tre Portate) · Amari della casa · Amari e liquori · Gin · Grappe · Rum · Tisane · Tè · Vodka · Whisky (queste ultime dalla Carta Bevande di TRGB).

In Gestione › Categorie i conteggi sono molto più alti (Secondi 167, Antipasti 148, Primi 145, Degustazioni 358, Bottiglie 1.437): dentro restano i prodotti non più in vendita.

### 8.4 Tavoli
Due viste, **Monitor** (a card) e Mappa (non vista). Filtro «Stato tavolo» e sale a pastiglie, anche più d'una insieme: Tutti, Miei, Sala, Giardino, Dehor, Bottiglieria, Conti. La card: icona di stato (verde libero, rossa occupato), numero, «Coperti 0 di 2», totale, e sotto «Disponibile» oppure **«Uscita 1 di 6»** col numero in un bollo blu; iniziale di chi l'ha aperto; «⋮». Dopo 15 minuti la card mostra da quanto il tavolo è aperto, dopo 60 cambia colore.

**Il «⋮» del tavolo** (4 screen del 24/11, dopo le tavole disegnate). Si apre un pannello con: **Preconto**; **Ordine / Dettagli** (stato dell'ordine — nello screen «In attesa di validazione», che non so cosa voglia dire —, aperto da, ultima modifica, **Cameriere**); gli **acconti**; **Sposta ordine su altro tavolo**; **Unisci ordine**; **Libera tavolo**. Nella Comanda 2.0 ci sono «Sposta» e la chiusura del tavolo; unisci e cameriere sono da decidere, preconto e acconti sono cosa della Cassa.

**La mappa.** Marco, 24/11: «su iPratico non c'è una mappa, è un limite». Nella Comanda 2.0 i tavoli si vedono anche sulla piantina che TRGB ha già (Prenotazioni › Editor Tavoli).

### 8.5 Apertura del tavolo
Foglio «Apri tavolo»: cliente (dall'anagrafica o nome libero), nota tavolo, coperti a pastiglie (0, 1, 2…), «Numero di coperti diverso da numero di ospiti», **Costo di servizio** (già su «Servizio, pane e stuzzico» e modificabile: con ogni probabilità l'omaggio si mette da qui, ma le opzioni non le ho viste), partner. I coperti non sono obbligatori.

### 8.6 Presa della comanda
A sinistra la stessa griglia della cassa (4 righe × 5), a destra la comanda: «N coperti», il numero del tavolo in grande, e le **uscite una sotto l'altra**, con quella corrente in grassetto. Un tocco sul prodotto lo mette nell'uscita corrente; «Nuova uscita» ne apre un'altra; sotto ogni uscita c'è «Invia uscita»; in fondo «Invia comanda». Ogni riga ha quantità, nome e un'icona: freccia = parte, mano = attende. Scorrendo la riga esce la matita, che apre le Opzioni. I prezzi nella comanda non si vedono (impostazione spenta).

### 8.7 Dopo l'invio
Sull'uscita partita: «Attendi» e «Invia sollecito». Sulle altre: «Vai con la preparazione». Nel Monitor il tavolo dice «Uscita 1 di 6».

### 8.8 Varianti («Opzioni»)
Si aprono dalla riga («aggiungi per 1 Prodotto», con un menu a tendina che non ho aperto). Due linguette, «Varianti +» e «Ingredienti −»; «Lista completa varianti»; «Variante personalizzata» a testo libero con prezzo in più o in meno; e le tessere dei gruppi (Allergeni, Cottura, Divisa in piatti) che aprono le scelte. Sulla comanda la variante sta sotto la riga: «Cottura: Media», «Divisa in piatti: due piatti».

### 8.9 Cosa esce in cucina
**La comanda** (un foglio solo, alle 17:02:51): in testa e in coda il numero del tavolo in grande, «SALA Dehor», «Stampante: Cucina»; operatore, data e ora; poi una fascia `******* USCITA N *******` per ogni uscita non vuota, coi piatti a carattere doppio e nome corto in maiuscolo; le varianti sotto il piatto, rientrate con `>> *`; in fondo i coperti.

**Le chiamate** (un foglio per uscita, alle 17:12:40, :45, :50 e :54): stessa testa, una fascia in negativo «VAI CON LA PREPARAZIONE : USCITA 2», **i piatti di quell'uscita ripetuti con le varianti**, la fascia ripetuta, e di nuovo il tavolo. Ogni chiamata si legge da sola, senza cercare il primo foglio.

L'uscita vuota (la 3 nella prova) non si stampa.

### 8.10 Impostazioni che contano
- **Tavoli:** costo del servizio di default «Servizio, pane e stuzzico»; coperto non obbligatorio; «vai e attendi» acceso; «Personalizza titoli uscite» (non aperto); timer 15 e 60 minuti; modifica del tavolo dalla cassa accesa.
- **Dispositivi:** Cucina 192.168.86.154 e Sala 192.168.86.153, ESC/POS porta 9100, 48 caratteri per riga (la Sala in modalità grafica); Fiscale **Epson FP81II** a 192.168.86.150, firmware 07.02, pilotata dal suo webservice. Il modello era da verificare nello studio di fattibilità: è quello che serve alla strada A.
- **Pagamenti:** Bonifico, Carta di credito, Contante, Pagamento online, Sospeso, The Fork, Voucher; il conto alla romana esce come «Menu», l'acconto come «Acconto».

### 8.11 Il resto (serve alla Cassa, non alla Comanda)
Clienti (anagrafiche, statistiche, documenti, punti); Prenotazioni (calendario, prenotazioni TheFork del giorno, asporto e delivery); Notifiche (prenotazioni TheFork da accettare); Gestione › Archivio: Documenti del giorno con le righe e «Reso merce», Chiusura fiscale, Chiusura al buio, Movimenti di cassa, Report di giornata (vendite, dipendenti, reparti, categorie, prodotti, varianti, borderò, operazioni camerieri), Scontrino telematico, Fattura elettronica, Documenti di trasporto. Un solo reparto IVA al 10%.

## Fonti

- iPratico: [Eat su App Store](https://apps.apple.com/it/app/ipratico-eat/id1469187554), [Waiter su App Store](https://apps.apple.com/it/app/ipratico-waiter/id1557483127), [scheda iPratico POS di AGTech](https://89-97-55-178.ip16.fastwebnet.it/?product=ipratico)
- Passepartout Menu: [gestione uscite](https://www.edupass.it/manuali/manualistica-menu/manuale-prodotto?a=manuale-menu%2Futilizzo%2Fcomanda%2Fgestione-uscite), [modalità chiamata uscita](https://www.edupass.it/manuali/manualistica-menu/manuale-prodotto?a=manuale-menu%2Futilizzo%2Fcomanda%2Fmodalita-chiamata-uscita-), [tasti funzione](https://www.edupass.it/manuali/manualistica-plan/manuale-prodotto?a=manuale-plan%2Futilizzo-menu%2Fcomanda%2Ftasti-funzione)
- Lightspeed: [serie K, ordini al tavolo](https://k-series-support.lightspeedhq.com/hc/articles/360051089273), [serie O, portate](https://o-series-support.lightspeedhq.com/hc/articles/31329455138203), [serie O, tavoli](https://o-series-support.lightspeedhq.com/hc/articles/31329411093659)
- Square: [coursing](https://squareup.com/help/us/en/article/6428-coursing-with-square-for-restaurants), [hold and fire](https://squareup.com/help/article/8172-hold-and-fire-courses-with-square-kds-and-square-for-restaurants)
- Toast: [server item firing](https://support.toasttab.com/en/article/Using-Server-Item-Firing?lang=en_US), [ritmo automatico](https://support.toasttab.com/en/article/Automated-and-Expediter-Course-Firing?lang=en_US), [schermate d'ordine](https://support.toasttab.com/en/article/New-POS-Experience-Ordering-Screens?lang=en_US)
- Cassa in Cloud: [gestione comande](https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/gestione-comande/), [aggiornamento 8.0](https://www.teamsystem.com/horeca/cassa-in-cloud/risorse-utili/aggiornamenti-cassa-in-cloud/aggiornamento-80/)
- Tilby: [guide, sezione Orders](https://support.tilby.com/hc/en-gb/sections/202261925-Orders)
- Revolut POS: [gestione delle portate](https://help.revolut.com/it-IT/help/more/revolut-pro/accept-payments-with-revolut-pos/question-how-manage-courses-in-revolut-pos-pro/) (letto solo l'estratto di ricerca)
- Dati interni: `cassa_conti.sqlite3` del locale; 83 screen dell'app e 5 foto di scontrini di Marco (24/11/2026, non nel repo)
