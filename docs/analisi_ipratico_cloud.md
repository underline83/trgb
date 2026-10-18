# Analisi iPratico Cloud — cosa si può leggere per TRGB

> 2026-10-18 · analisi in sola lettura del back office `www.ipraticocloud.com` (login di Marco), fatta da Claude nel browser.
> Nessun dato è stato modificato. Qui non ci sono token né dati personali dei clienti.

## 1. In breve

Il back office web di iPratico non calcola niente da solo: ogni pagina chiede i dati a un'**API interna**, `https://apiportal.ipraticocloud.com`, con un header `Authorization: <token utente>`. Il token (40 caratteri, opaco) è scritto nella pagina come `window.idUsr`. Con quella stessa API si legge **ogni conto chiuso, riga per riga, con tavolo, sala, coperti e orari**. È esattamente il dato che serve per «Marco, tavolo 10, ha mangiato X, Y, Z e ha speso N €».

- **Non è un'API ufficiale né documentata**: la usa il loro sito. Può cambiare senza preavviso, e prima di farla leggere in automatico a TRGB va verificato il contratto con iPratico.
- **Lo storico parte da settembre 2024** (il primo conto trovato è del 2024-09-01). Prima non c'è niente: probabile cambio di versione o migrazione su Couchbase.
- **Orari in UTC** (`...Z`): in Italia +2 d'estate, +1 d'inverno.

## 2. Il conto chiuso: `GET /statistics/closed-payment-sessions`

Parametri: `channel=lct_10254` (il locale), `application=eat`, `training=0`, `dateFrom=AAAA-MM-GG HH:MM:SS`, `dateTo=…`, facoltativo `businessActorId` (un solo cliente iPratico).
Risposta: `{ moneyTypes, paymentSessions[] }`. Un mese (settembre 2026): 413 conti, 9,9 MB, circa 1,6 s.

Per ogni conto (`paymentSession`):

| Campo | Cosa contiene |
|---|---|
| `billNumber`, `documentType` | numero scontrino (`fiscal.bill`) o fattura (`invoice`, es. `2026/203`) |
| `table.name`, `table.room.name` | tavolo e sala com'erano in cassa (`Tavolo 10` / `Sala`, `18` / `Giardino`) |
| `table.currentSittings` | **coperti** (coincide con la quantità della riga «Servizio, pane e stuzzico») |
| `table.stayingDuration` | secondi passati al tavolo |
| `originalOrderLogCreatedDate` → `closureDate` | apertura del tavolo → chiusura Z |
| `paymentsTotal`, `payments[]` | totale e metodo di pagamento (`money_type:credit-card`, …) |
| `discountsTotal`, `surchargesTotal`, `vatResume` | sconti, maggiorazioni, IVA |
| `isDutch`, `dutchDivider`, `orderId` | conto **alla romana**: più scontrini con lo stesso `orderId` vanno sommati |
| `businessActorId`, `businessActor` | cliente iPratico associato (oggi quasi solo per le fatture) |
| `printedOrderItems[]` | le righe |

Ogni riga (`printedOrderItems[]`): `orderItemName`, `quantity`, `finalPrice`, `course` (portata 0-n), `product.productId`, `product.category.name` (Antipasti, Primi, Secondi, Calici…), `product.category.family.name` (food / beverage), `dateSend` (invio in cucina), `log.createdBy` (palmare che l'ha battuta, es. `SALA`), sconti di riga, varianti.

## 3. Prova di collegamento con le prenotazioni TRGB (sabato 17/10/2026)

La regola: **data + turno + tavolo (normalizzato) + ora di apertura del tavolo vicina all'ora della prenotazione + coperti**.

| Conto iPratico (ora italiana) | Prenotazione TRGB | Esito |
|---|---|---|
| Tavolo 10, aperto 13:27, 5 coperti, 275 € | 13:15, tavolo 10, 5 coperti | ✅ |
| Tavolo 11, 3 scontrini alla romana da 60 €, 3 coperti | 13:15, tavolo 11, 3 coperti (cliente con 22 visite) | ✅ sommando per `orderId` |
| Tavolo 10, aperto 20:01, 13 coperti, 800 € | 19:30, tavoli 7+9+8+10, 13 coperti | ✅ (tavolo unito: in cassa ne usano uno) |
| Tavolo 11, aperto 20:24, 4 coperti, 250 € | 20:00, tavolo 11, 4 coperti | ✅ |
| «14» Giardino, 6 coperti, 451 € | 20:30, tavoli 15+14+16, 6 coperti | ✅ |
| «18» Giardino, aperto 19:30, 4 coperti, 254 € | 19:30, tavoli 18+17, 4 coperti | ✅ |
| «18» Giardino, aperto 21:51, 2 coperti, 149 € | — | ⚠️ walk-in non registrato in TRGB |

Su 25 conti del giorno, quelli con una prenotazione in TRGB si collegano senza ambiguità.

**Tabella di corrispondenza dei tavoli** (da tenere in Impostazioni, non scritta nel codice):

| iPratico | TRGB |
|---|---|
| Sala: `Tavolo 00`…`Tavolo 11`, `Tavolo 03C`, `Tavolo 04C`, `Tavolo 10C` | Osteria: `0`…`11`, `3C`, `4C` (o `4A/4B` divisi), `10C` da creare? |
| Giardino: `14`…`19` | Veranda: `14`…`18` (`19` manca in TRGB) |
| Dehor: `20`…`39`, `Appoggio` | Dehor: `20`…`32` (`33`-`39` mancano in TRGB) |
| Bottiglieria `Tavolone`, Sala `Bancone`, `The Boss Table` | — |
| Sala «Conti»: `Signor Sergio`, `Signor Beppe`, `Sara` | conti a nome (sospesi/personale), da escludere |

Le prenotazioni TheFork arrivano anche in iPratico (`/reservations`, 231 da giugno 2026, con l'id TheFork), ma **nessuna viene mai assegnata a un tavolo in cassa**: il collegamento si fa da TRGB, che i tavoli li ha.

## 4. Mappa delle pagine del back office e dei dati sotto

**Statistiche (sotto ci sono i dati)**

| Pagina | Endpoint | Utile a TRGB? |
|---|---|---|
| Statistiche per clienti | `/business-actors`, `/statistics/closed-payment-sessions` | ⭐ è la fonte del dettaglio conti |
| Statistiche tavoli / prenotazioni | `/statistics/closed-payment-sessions` | idem |
| Venduto e sconti (per operatore) | `closed-payment-sessions`, `/product-categories`, export xls | venduto per cameriere |
| Report fasce orarie | `closed-payment-sessions`, `/custom-time-slot` | ritmo del servizio |
| Dashboard / Totalizzazioni / Comparazioni | `/statistics/data` | sostituisce l'import manuale `.xls` di Statistiche |
| Dashboard realtime, Ordini ai tavoli | `/statistics/realtime-data`, `/statistics/rooms`, `/statistics/orders` | ⭐ sala in tempo reale |
| Chiusure / Chiusure di giornata | `/statistics/closures` (+ `/details`, `/closures/xml/{id}`) | ⭐ chiusura Z: coperti, incasso, categorie, IVA, pagamenti |
| Corrispettivi | `/statistics/closures/accounting` | per IVA e reparto |
| Fatture | `/statistics/closed-payment-sessions/accounting` | fatture emesse dalla cassa |
| Storni e operazioni di cassa, Operazioni tavoli | `/business-member-operations` | ⭐ controllo: righe tolte, tavoli svuotati, cassetto |
| Margine lordo prodotti | `/statistics/closed-payment-sessions/profit-margin` | vuoto: in iPratico non ci sono i costi (li ha TRGB) |
| Preferenze / Presenze clienti, Fidelity, Promo, Partner | `/statistics/business-actors-*`, `/fidelity-cards…` | poco usati all'osteria |
| Sospesi, Ticket, Quadrature di cassa | `closed-payment-sessions`, `/payments`, `/statistics/v2/…` | `/payments` e `cash-movements` rispondono errore 500 senza i parametri giusti |
| Turni di lavoro | `/business-member-operations` | da verificare |
| Pos Pro (`stats/…`, `statistiche/…`) | — | pagine della vecchia cassa, vuote |

**Anagrafiche**

| Pagina | Endpoint | Note |
|---|---|---|
| Prodotti, Ingredienti, Menù componibili | `/products` (2.764, di cui 1.088 nascosti), `/warehouse-items` | id prodotto, categoria, prezzi per listino, `isHidden`, **allergeni** |
| Categorie, Listini, Reparti, Tags, Varianti | `/product-categories`, `/price-lists`, `/vat-record-categories`, … | |
| Sale, Tavoli | `/rooms`, `/tables` (48) | stato del tavolo in tempo reale (`currentSittings`, `isCurrentlyOpenedInPayment`) |
| Clienti | `/business-actors` (2.377) | quasi tutti anagrafiche di **fatturazione** (dal 2020); 394 con telefono; non è un CRM |
| Prenotazioni tavoli | `/reservations` | arrivano da TheFork, mai assegnate a tavoli |
| Operatori, Permessi, Dispositivi, Stampanti, POS | `/business-members`, `/devices`, `/printer-setups`, `/pos-terminal` | configurazione |
| Integrazioni esterne | `/external-integration` | solo Satispay e Dojo. **Nessuna API per terzi.** |

## 5. Cosa ci può fare TRGB

> In roadmap come sezione **IP** (IP.1-IP.10), con effort e priorità proposte.

1. **Scheda cliente → «cosa ha mangiato e speso»** (la richiesta di partenza). Import notturno dei conti del giorno, abbinamento con la prenotazione, storico nella scheda: piatti, vini, spesa, durata, portate. Si recuperano anche i due anni passati (da settembre 2024). Apre la strada a: spesa media e totale del cliente (la M di RFM che oggi manca, CL.10), «ultima volta ha preso…», vini preferiti, i piatti che riordina.
2. **Statistiche senza import a mano.** Oggi si carica un `.xls` mensile aggregato. Con l'API: vendite per giorno, turno, ora, tavolo, cameriere e portata. Si sblocca anche ST.2 (giorno della settimana sui prodotti, oggi impossibile).
3. **Chiusura turno precompilata.** Z, coperti, incasso, IVA e categorie arrivano da `/statistics/closures`. Da valutare col refactor corrispettivi K.12.
4. **Food cost reale per conto e per piatto.** `productId` iPratico ↔ ricetta TRGB: margine per conto, per tavolo, per cliente.
5. **Vini venduti → scarico cantina.** Le righe Calici/Bottiglie con l'ora: scarico automatico dei movimenti (V.10).
6. **Sala in tempo reale.** Mappa serale con i tavoli aperti in cassa, i coperti seduti, la portata a cui sono, i minuti dall'ultimo invio. Prenotazione SEATED/BILL in automatico.
7. **Ritmo della cucina.** `dateSend` per portata: tempi tra antipasto, primo e secondo per servizio e giorno.
8. **Controllo cassa** (con l'alert engine M.F). Righe tolte (236 in 6 settimane), tavoli svuotati (35), cassetto aperto senza vendita, ristampe.
9. **Allergeni dei piatti** già in `/products`: da confrontare con quelli della carta TRGB.

## 6. Cose notate

- **Metodo di pagamento**: sabato 17/10 tutti i 25 conti risultano pagati con `credit-card`. Possibile che in cassa si prema sempre «carta». Per i contanti la fonte resta la chiusura turno TRGB, non iPratico.
- **Coperti**: `table.numberOfGuests` è sempre 0. Quello giusto è `table.currentSittings`.
- **Tavoli uniti**: in cassa il gruppo va su un tavolo solo (13 persone su «Tavolo 10»). L'abbinamento deve accettare «uno dei tavoli della prenotazione».
- **Walk-in**: i conti senza prenotazione restano anonimi, a meno che il cliente non venga associato in cassa.

## 7. Prossimi passi

**Stato al 2026-10-18:** verificato che il token cambia a ogni login (quindi il server fa il login da solo) e che basta il token, senza la sessione del sito. Fasi «scaricare i conti» e «abbinare alla Chiusura turno» scritte (K.15, `modulo_vendite.md` §12), da pushare. I conti sono leggibili ~40 secondi dopo il pagamento, prima della chiusura Z.

1. **Contratto/ToS iPratico**: si può leggere `apiportal` con le proprie credenziali da un proprio gestionale? In alternativa, chiedere a iPratico un accesso ufficiale, ora che sappiamo cosa chiedere.
2. **Accesso automatico**: verificare se il token `idUsr` è fisso o cambia a ogni login, e come fa login il server (form, captcha, 2FA). Credenziali solo nell'`.env` del VPS.
3. **Modulo**: `cassa` (`modulo_vendite.md`); le tabelle nuove avranno il prefisso del modulo. Il collegamento al cliente passa da un servizio platform (regola 4 dell'architettura modulare).
4. **Prototipo**: import di un giorno → tabella conti + righe → abbinamento → scheda cliente. Poi lo storico da settembre 2024.
