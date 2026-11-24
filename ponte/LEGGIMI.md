# TRGB — il ponte di stampa

Un programma piccolo che gira su un computer nella rete del locale e porta alle stampanti
quello che TRGB manda in stampa (oggi le comande). Mattone platform M.M: `docs/architettura_mattoni.md`.

## Come gira

1. Ogni pochi secondi il ponte chiede a TRGB «c'è da stampare?» (`GET /ponte/lavori/`).
2. TRGB risponde coi fogli già impaginati e con l'indirizzo della stampante.
3. Il ponte li manda alla stampante (porta 9100) e riferisce com'è andata (`POST /ponte/lavori/esito`).

È sempre il ponte a chiamare TRGB: sul router del locale non si apre nessuna porta. Il ponte
non sa niente di comande e stampa solo verso indirizzi della rete del locale.

## Avviarlo sul Mac

1. In TRGB: **Comanda › Impostazioni › Stampa › «Crea il token»** e copia il token (si vede una volta sola).
2. Doppio clic su `avvia_ponte.command` (la prima volta: tasto destro › Apri).
3. La prima volta chiede l'indirizzo di TRGB (Invio per quello proposto) e il token.
   Li scrive in `~/.trgb_ponte.json`, leggibile solo da te e fuori dal repo.
4. Tieni aperta la finestra: chiudendola la stampa si ferma. Finché gira, il Mac non va in stop.

In Impostazioni la riga «Ponte collegato» dice che TRGB lo sente. Poi si accende la stampante
che serve («accesa» + «Salva la stampa»): da quel momento le comande di quel reparto escono.

## Se qualcosa non va

- **«TRGB non riconosce il token»**: crea un token nuovo in Impostazioni, cancella
  `~/.trgb_ponte.json` e riavvia il ponte.
- **«stampante non raggiungibile»**: il computer non è sulla rete delle stampanti, o la
  stampante è spenta. Il ponte riprova da solo; in Comanda › Invii il foglio resta «non riesce».
- **Un foglio vecchio non esce**: dopo i minuti scelti in Impostazioni un foglio non esce più
  da solo. Si rimanda da Comanda › Invii con «Ristampa».
- **Per cambiare computer**: stesso token (lo copi dal file) o uno nuovo; un ponte solo per volta.

## Opzioni

    python3 ponte.py --una-volta      chiede una volta, stampa, esce (per provare)
    python3 ponte.py --config FILE    usa un altro file di impostazioni

Serve solo Python 3 (libreria standard). Stampanti provate: SOL801, ESC/POS, 48 colonne
(`docs/operativo/rete.md`).
