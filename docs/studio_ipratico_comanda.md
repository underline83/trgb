# Studio per la Comanda — iPratico, i concorrenti e cosa copiare

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — studio del 2026-11-24, in corso (mancano le schermate vere di iPratico e il suo back office) · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [modulo_comande.md](modulo_comande.md), [analisi_ipratico_cloud.md](analisi_ipratico_cloud.md), [operativo/rete.md](operativo/rete.md)

Chiesto da Marco il 24/11/2026 dopo aver visto la Comanda 1.0: «primo sistema molto molto basico… studia iPratico, le schermate e le documentazioni che trovi, così copiamo un po' e poi personalizziamo», e poi «valutiamo anche altri concorrenti, non abbiamo fretta, facciamo le cose bene». Regola collegata (Q #389): sui moduli grossi prima proposte e schermate da vedere, poi codice. **Finché Marco non sceglie, la Comanda non si tocca.**

## 1. Fonti, e cosa NON ho potuto vedere

| Fonte | Cosa dà | Limite |
|---|---|---|
| Conti iPratico già in TRGB (`cassa_conti`: 1.177 conti e 12.856 righe dall'1/9 al 23/11/2026) | Come si lavora davvero: cosa si batte, in che ordine, da quale dispositivo, a che ora parte ogni invio | Solo conti chiusi: non si vedono storni, messaggi alla cucina, spostamenti, varianti |
| Pagine pubbliche iPratico (App Store di Eat e Waiter, sito, scheda di un rivenditore) | Elenco delle funzioni | Nessun manuale pubblico di Eat; i manuali in rete sono del vecchio iPratico POS (2012-2013) |
| Guide in linea dei concorrenti (§4) | Come funzionano uscite, invio, stati delle righe | Lette le pagine sulle portate e sulla presa dell'ordine, non tutto il prodotto; nessuna prova dal vivo |
| **Schermate dell'app iPratico Eat/Waiter** | — | **Non viste**: servono screenshot da iPad e palmare |
| **Back office ipraticocloud.com** (categorie, varianti, reparti, stampanti, menù componibili, permessi) | La configurazione vera dell'osteria | **Non letto**: nel browser di Claude la sessione è scaduta, serve il login di Marco |

## 2. Come l'osteria usa iPratico (dai conti, 1/9 → 23/11/2026)

1. **La comanda va a ondate, non tutta insieme.** Un tavolo riceve di solito 3-5 invii (il più frequente è 4; fino a 8-9). Ogni invio prende il numero di portata successivo: 0 all'apertura (acqua, stuzzico), poi 1, 2, 3… Il numero dice «quale ondata», non «che tipo di piatto»: gli antipasti stanno quasi tutti nella 2, ma i primi si dividono fra 2 (458) e 3 (782), i dolci fra 3, 4 e 5.
   Esempio vero, tavolo 3 del 21/11 (4 coperti): 20:18 due acque → 20:28 «Stuzzico ×4» → 20:41 «Pane e Grissini ×2» → 20:46 due antipasti e due primi → 21:13 primi, secondi, contorni e una bottiglia → 21:59 un caffè → 22:44 un'acqua.
2. **Il coperto è una riga automatica**: «Servizio, pane e stuzzico» a 5 €, quantità = coperti (1.024 conti; 128 volte la versione «omaggio»).
3. **«Stuzzico» e «Pane e Grissini» sono righe a 0 €** che servono solo a dire alla cucina di farli partire (1.140 e 1.131 volte, praticamente ogni tavolo). Ci sono anche «Pane senza glutine» (30) e «Rimpiazzo Pane» (14).
4. **I calici si battono a prezzo, non a vino**: «Calice 7 €» (295), 8 € (226), 9 € (157), 10 € (94), 11 €… fino a 18 €. Mai il nome del vino.
5. **Le bottiglie invece col vino vero** (codice a 4 cifre in testa al nome, come esce dall'export TRGB).
6. **Pranzo**: «Pranzo - Una/Due/Tre Portate» per il prezzo (23/66/9) più «Piatto Pranzo» a 0 € (220), che in cassa porta una variante col nome del piatto (detto da Marco; nei dati scaricati la variante non si legge); esiste anche «Piatto pranzo 15» (74) per il piatto singolo.
7. **Piatti del giorno a prezzo**: «Secondo del giorno 30» e simili, non col nome del piatto.
8. **Menu gruppi**: i piatti del menu passano come righe a 0 € in maiuscolo («CASONCELLI (7)», «ANTIPASTO MISTO OSTERIA», «GUANCETTO O CONIGLIO», «TIRAMISU», «LIBERO»).
9. **Righe libere** ci sono: «no_name» 387 volte, più «Vino», «Torta», «Menu» scritti a mano.
10. **Chi batte**: il palmare «SALA» fa quasi tutto il cibo (4.617 righe su 7.770); la «Cassa» fa bevande, caffè, acque e chiusura (2.035 bevande); «Marco» poche.
11. **Varianti: non si vedono nei dati.** La colonna è vuota su tutte le 101.263 righe scaricate, ma almeno per il «Piatto Pranzo» si usano: lo scarico non le legge. Quanto si usino sugli altri piatti va visto nell'app o nel back office.
12. **Conti senza tavolo**: «Bancone», «Tavolone» e conti a nome esistono ma sono rari.

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
| **iPratico in osteria** | Nessuna: l'ondata è l'uscita | Si ribatte e si invia | Solo l'ondata | — |

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

- **A — A ondate (iPratico oggi in osteria).** Batti e invii quello che deve uscire adesso; il resto lo ribatti dopo. Pro: è già il vostro modo. Contro: la cucina non sa cosa arriva dopo; se il cameriere si scorda il seguito, il tavolo aspetta.
- **B — Tutto subito, poi si chiama** (Passepartout «chiamata uscita», Lightspeed O con la campanella; è la Comanda 1.0). La cucina riceve l'intero tavolo diviso per uscite; alla chiamata esce solo «prepara la 2ª del tavolo 3». Pro: la cucina si organizza su tutto il tavolo. Contro: se il cliente cambia il secondo, il foglio in cucina è già vecchio; due fogli per uscita.
- **C — Tieni e manda** (Square, Toast, Passepartout «Invia prossima uscita»). Si batte tutto il tavolo, parte la prima uscita, le altre restano tenute e modificabili; un tocco fa partire la prossima, che esce in cucina in quel momento. Si può scegliere se la cucina vede anche le uscite tenute («in attesa», in piccolo). Pro: un tocco invece di ribattere, niente dimenticanze, ciò che non è partito si cambia senza storni. Contro: la sala deve prendere l'abitudine di battere tutto subito.
- **D — Da sola** (Toast): l'uscita dopo parte a tempo, o quando la cucina segna finita quella prima. Serve uno schermo in cucina. Per l'osteria è un dopo, se mai.

**Cosa propongo:** **C**, con due aggiunte che vengono dallo studio. (1) Chi vuole continua a lavorare a ondate: se batti solo quello che esce adesso e invii, è il modo A, senza cambiare impostazioni. (2) L'uscita si sceglie alla Passepartout: c'è un'«uscita corrente» in alto e un tasto «Segue →», così non si sceglie piatto per piatto. È una proposta: decide Marco.

## 6. Altre scelte che lo studio apre (da decidere con le schermate davanti)

1. Coperto automatico a 5 € a coperto, con «omaggio»: sì come oggi?
2. «Stuzzico» e «Pane»: due tasti fissi in alto nel conto?
3. Calici: tasti a prezzo come oggi, o tasto a prezzo + il vino scelto (per scaricare la cantina)?
4. Piatti del giorno: col nome vero preso da TRGB (proposta) o a prezzo come oggi?
5. Menu gruppi e degustazioni: l'articolo apre da solo i suoi piatti a 0 € per la cucina?
6. Pranzo: N portate + scelta dei piatti della settimana (già così nella 1.0)?
7. Schermata di partenza: griglia (1.0), elenco, o la mappa di Prenotazioni?
8. Palmare e iPad: due viste diverse (cibo in sala, bevande e chiusura in cassa)?
9. Cosa stampa la cucina: solo ciò che parte, o anche «in attesa»? Una stampa per tutto il tavolo al passe?

## 7. Cosa serve da Marco per chiudere lo studio

1. Screenshot dell'app iPratico: sala/tavoli, tavolo aperto, presa comanda (categorie e prodotti), invio, una comanda stampata in cucina e una in sala, il conto; da iPad e dal palmare.
2. Login nel back office `ipraticocloud.com` dal browser di Claude, per leggere categorie, tasti rapidi, reparti, stampanti e menù componibili (sola lettura).
3. Poi: le schermate disegnate in 2-3 varianti (tavoli, conto, aggiunta dei piatti, foglio della cucina) per scegliere A/B/C e i punti del §6.

## Fonti

- iPratico: [Eat su App Store](https://apps.apple.com/it/app/ipratico-eat/id1469187554), [Waiter su App Store](https://apps.apple.com/it/app/ipratico-waiter/id1557483127), [scheda iPratico POS di AGTech](https://89-97-55-178.ip16.fastwebnet.it/?product=ipratico)
- Passepartout Menu: [gestione uscite](https://www.edupass.it/manuali/manualistica-menu/manuale-prodotto?a=manuale-menu%2Futilizzo%2Fcomanda%2Fgestione-uscite), [modalità chiamata uscita](https://www.edupass.it/manuali/manualistica-menu/manuale-prodotto?a=manuale-menu%2Futilizzo%2Fcomanda%2Fmodalita-chiamata-uscita-), [tasti funzione](https://www.edupass.it/manuali/manualistica-plan/manuale-prodotto?a=manuale-plan%2Futilizzo-menu%2Fcomanda%2Ftasti-funzione)
- Lightspeed: [serie K, ordini al tavolo](https://k-series-support.lightspeedhq.com/hc/articles/360051089273), [serie O, portate](https://o-series-support.lightspeedhq.com/hc/articles/31329455138203), [serie O, tavoli](https://o-series-support.lightspeedhq.com/hc/articles/31329411093659)
- Square: [coursing](https://squareup.com/help/us/en/article/6428-coursing-with-square-for-restaurants), [hold and fire](https://squareup.com/help/article/8172-hold-and-fire-courses-with-square-kds-and-square-for-restaurants)
- Toast: [server item firing](https://support.toasttab.com/en/article/Using-Server-Item-Firing?lang=en_US), [ritmo automatico](https://support.toasttab.com/en/article/Automated-and-Expediter-Course-Firing?lang=en_US), [schermate d'ordine](https://support.toasttab.com/en/article/New-POS-Experience-Ordering-Screens?lang=en_US)
- Cassa in Cloud: [gestione comande](https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/gestione-comande/), [aggiornamento 8.0](https://www.teamsystem.com/horeca/cassa-in-cloud/risorse-utili/aggiornamenti-cassa-in-cloud/aggiornamento-80/)
- Tilby: [guide, sezione Orders](https://support.tilby.com/hc/en-gb/sections/202261925-Orders)
- Revolut POS: [gestione delle portate](https://help.revolut.com/it-IT/help/more/revolut-pro/accept-payments-with-revolut-pos/question-how-manage-courses-in-revolut-pos-pro/) (letto solo l'estratto di ricerca)
- Dati interni: `cassa_conti.sqlite3` del locale
