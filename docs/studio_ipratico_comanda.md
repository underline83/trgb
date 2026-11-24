# Studio iPratico per la Comanda — come lo usa l'osteria e cosa copiare

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — studio del 2026-11-24, prima delle proposte di schermata · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [modulo_comande.md](modulo_comande.md), [analisi_ipratico_cloud.md](analisi_ipratico_cloud.md), [operativo/rete.md](operativo/rete.md)

Chiesto da Marco il 24/11/2026 dopo aver visto la Comanda 1.0: «primo sistema molto molto basico… studia iPratico, le schermate e le documentazioni che trovi, così copiamo un po' e poi personalizziamo». Regola collegata (Q #389): sui moduli grossi prima proposte e schermate da vedere, poi codice.

## 1. Fonti, e cosa NON ho potuto vedere

| Fonte | Cosa dà | Limite |
|---|---|---|
| Conti iPratico già in TRGB (`cassa_conti`, 1.176 conti e 12.856 righe dall'1/9/2026) | Come si lavora davvero: cosa si batte, in che ordine, da quale dispositivo, a che ora parte ogni invio | Solo conti chiusi: non si vedono storni, messaggi alla cucina, spostamenti |
| Pagine pubbliche iPratico (App Store di Eat e Waiter, sito) | Elenco delle funzioni | Nessun manuale pubblico di Eat; i manuali in rete sono del vecchio iPratico POS (2012-2013) |
| Rivenditori (scheda iPratico POS) | Funzioni storiche: uscite temporizzate, separa conto, romana, sposta/unisci | Vecchia app |
| **Schermate dell'app Eat/Waiter** | — | **Non viste**: servono screenshot da iPad e iPhone |
| **Back office ipraticocloud.com** (categorie, varianti, reparti, stampanti, menù componibili, permessi) | La configurazione vera dell'osteria | **Non letto**: nel browser di Claude la sessione è scaduta, serve il login di Marco |

## 2. Come l'osteria usa iPratico (dai conti, 1/9 → 23/11/2026)

1. **La comanda va a ondate, non tutta insieme.** Un tavolo riceve di solito 3-5 invii (mediana 4; fino a 8-9). Ogni invio prende il numero di portata successivo: 0 all'apertura (acqua, stuzzico), poi 1, 2, 3… Il numero dice «quale ondata», non «che tipo di piatto»: gli antipasti stanno quasi tutti nella 2, ma i primi si dividono fra 2 (458) e 3 (782), i dolci fra 3, 4 e 5.
   Esempio vero, tavolo 3 del 21/11 (4 coperti): 20:18 due acque → 20:28 «Stuzzico ×4» → 20:41 «Pane e Grissini ×2» → 20:46 due antipasti e due primi → 21:13 primi, secondi, contorni e una bottiglia → 21:59 un caffè → 22:44 un'acqua.
2. **Il coperto è una riga automatica**: «Servizio, pane e stuzzico» a 5 €, quantità = coperti (1.024 conti; 128 volte la versione «omaggio»).
3. **«Stuzzico» e «Pane e Grissini» sono righe a 0 €** che servono solo a dire alla cucina di farli partire (1.140 e 1.131 volte, praticamente ogni tavolo). C'è anche «Pane senza glutine» (30) e «Rimpiazzo Pane» (14).
4. **I calici si battono a prezzo, non a vino**: «Calice 7 €» (295), 8 € (226), 9 € (157), 10 € (94), 11 €… fino a 18 €. Mai il nome del vino.
5. **Le bottiglie invece col vino vero** (codice a 4 cifre in testa al nome, come esce dall'export TRGB).
6. **Pranzo**: «Pranzo - Una/Due/Tre Portate» per il prezzo (23/66/9) più «Piatto Pranzo» a 0 € (220) per dire i piatti; esiste anche «Piatto pranzo 15» (74) per il piatto singolo.
7. **Piatti del giorno a prezzo**: «Secondo del giorno 30» e simili, non col nome del piatto.
8. **Menu gruppi**: i piatti del menu passano come righe a 0 € in maiuscolo («CASONCELLI (7)», «ANTIPASTO MISTO OSTERIA», «GUANCETTO O CONIGLIO», «TIRAMISU», «LIBERO»).
9. **Righe libere** ci sono: «no_name» 387 volte, più «Vino», «Torta», «Menu» scritti a mano.
10. **Chi batte**: il palmare «SALA» fa quasi tutto il cibo (4.617 righe su 7.770); la «Cassa» fa bevande, caffè, acque e chiusura (2.035 bevande); «Marco» poche.
11. **Varianti: mai usate** (nessuna riga su 101.263 in due anni). Le eccezioni passano come nota a voce o come riga libera.
12. **Conti senza tavolo**: «Bancone», «Tavolone» e conti a nome esistono ma sono rari.

## 3. Cosa fa iPratico in più (dalle pagine pubbliche)

Mappa dei tavoli disegnata; tavoli assegnati al cameriere; menù composti (menù del giorno, di lavoro) con piatti modificabili; varianti e ingredienti; invio a stampante termica e a «Cook» (schermo cucina) con stato di avanzamento visibile al cameriere; ordini a voce; nella vecchia app anche uscite temporizzate, «vai/attendi», separa conto, conto alla romana, sposta e unisci tavolo, cinque listini, prezzo tavolo e prezzo banco, PIN per operatore.

## 4. Dove la Comanda 1.0 di TRGB è diversa da come lavora la sala

| Tema | iPratico in osteria | Comanda 1.0 | Da fare |
|---|---|---|---|
| Uscite | A ondate: batti quello che deve uscire ora e invii; il numero sale da solo | Tutto prima, con uscita scelta per riga, poi «Via la Nª» | **Scelta di fondo, da decidere con Marco** (§5) |
| Coperto | Riga automatica con quantità = coperti | Solo il numero dei coperti, il coperto è un articolo come gli altri | Riga automatica |
| Stuzzico e pane | Due tasti a 0 € | Non ci sono | Tasti rapidi «alla cucina» |
| Calici | Tasti a prezzo | Solo i 3 vini segnati a calice | Tasti a prezzo (con, se si vuole, il vino scelto dopo) |
| Pranzo | N portate + «Piatto Pranzo» | N portate + piatti della settimana a 0 € | Simile: confermare |
| Piatti del giorno | A prezzo | Col nome vero, da TRGB | Meglio TRGB: confermare |
| Menu gruppi | Piatti a 0 € in maiuscolo | Solo l'articolo «Menù gruppi X» | Il menu apre i suoi piatti a 0 € (i template li hanno già) |
| Bevande di tutti i giorni | Acque, caffè, bibite in «Bevande» | Mancano se non sono in Carta Bevande | Verificare cosa manca nel catalogo |
| Cassa e sala | Due modi d'uso: palmare per il cibo, iPad per il resto | Una pagina sola | Vista telefono e vista iPad |
| Varianti | Non usate | Campo pronto, non usato | Lasciare la nota libera |

## 5. La scelta di fondo: come escono i piatti

- **A — A ondate (come oggi).** Batti e invii quello che deve uscire adesso. Niente uscite da scegliere, niente «via». La cucina vede arrivare un foglio alla volta. Pro: è già il vostro modo, zero formazione. Contro: la cucina non vede cosa arriverà dopo; il cameriere deve ricordarsi di mandare il resto.
- **B — Tutto subito, con le uscite (Comanda 1.0).** Si prende l'ordine intero, diviso in uscite, e si chiama «via la 2ª». Pro: la cucina vede tutto il tavolo e si prepara; un tocco per far partire l'uscita. Contro: cambia l'abitudine; più tocchi alla presa.
- **C — Misto.** Si batte tutto, ma parte solo la prima ondata; il resto resta «in attesa» sul tavolo e il cameriere lo fa partire con un tocco («manda il seguito»), potendo ancora cambiarlo. La cucina può vedere, se lo si vuole, anche cosa aspetta. Pro: un tocco invece di ribattere, niente dimenticanze. Contro: da costruire bene.

## 6. Cosa serve da Marco per chiudere lo studio

1. Screenshot dell'app: sala/tavoli, tavolo aperto, presa comanda (categorie e prodotti), invio, una comanda stampata in cucina e una in sala, il conto; da iPad e dal palmare.
2. Login nel back office `ipraticocloud.com` dal browser di Claude, per leggere categorie, tasti rapidi, reparti, stampanti e menù componibili (sola lettura).
3. La scelta A, B o C.
