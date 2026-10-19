# Redesign Clienti e Prenotazioni

> 📄 progetto · avviato 2026-10-19 · bozzetti: artifact «TRGB Clienti e Prenotazioni — bozzetti» (claude.ai, privato di Marco)

## Perché

Audit del 2026-10-18 su iPad e iPhone (Marco: navigazione confusa, scomodo su iPad/iPhone, stile non uniforme, troppa roba per pagina):

1. Le prenotazioni stanno in due posti: Clienti › Prenotazioni (tabella di tutte) e il modulo Prenotazioni.
2. Clienti si apre sulla Dashboard invece che sulla ricerca.
3. Su iPad le linguette dei menu si tagliano; su iPhone diventano una tendina.
4. Scheda cliente su iPhone: testata enorme (5 riquadri + 7 etichette), linguette accavallate, prima cosa l'anagrafica; «ultima visita» contava le prenotazioni future.
5. Lista clienti: voci spazzatura («?», «.») in cima, email quasi sempre vuota, azioni massive sempre in vista.
6. Mappa tavoli su iPad piccola e illeggibile.
7. Stile misto: date in due formati, riquadri di colori diversi, emoji a caso.

## Decisioni di Marco (2026-10-19)

Organizzazione approvata:

- **Prenotazioni** = lavoro di sala: Oggi · Sala (mappa a tutto schermo) · Settimana · Recensioni · Impostazioni (con l'editor tavoli). La ricerca nell'archivio prenotazioni sta qui (sostituisce Clienti › Prenotazioni).
- **Clienti** = CRM: si apre sulla ricerca; poi Preventivi · Gift card · Statistiche (ex Dashboard) · Impostazioni.
- Ogni modulo ha il suo colore (quello di `modulesMenu.js`): Clienti verde petrolio (teal), Prenotazioni indaco.

Bozzetti scelti (tre versioni per schermata, scelte tutte **A**):

| Schermata | Versione scelta | In breve |
|---|---|---|
| Scheda cliente (iPhone) | A · Fascia e linea del tempo | fascia teal con iniziali, nome, 3 numeri (visite, a visita, ultima volta); Chiama/WhatsApp/Prenota sospesi; «Da sapere in sala» (allergie, in arrivo, prende di solito, preferenze, ultima nota); linguette Visite/Note/Preventivi/Altro; visite su linea del tempo con prenotazione + conto |
| Prenotazioni › Oggi (iPhone) | A · Per orario | indaco; giorno + Pranzo/Cena come due bottoni con i coperti; prenotazioni raggruppate per orario con barra di riempimento; riga: pallino stato, nome, note/allergie, persone, tavolo; «+» tondo; barra in basso Oggi · Sala · Settimana · Cerca |
| Clienti (iPad/Mac) | A · Lista e anteprima | ricerca + filtri rapidi (Abituali, Tutti, VIP, Da ricontattare, Compleanni), lista con visite/ultima/media; a destra l'anteprima del cliente; voci spazzatura nascoste |

Scartate (per memoria): scheda B «carta dell'osteria» e C «cruscotto»; Oggi B «tavoli nel tempo» (Gantt scuro) e C «arrivi e seduti»; lista B «schede» e C «tabella con filtri».

## Avanzamento

| Passo | Stato |
|---|---|
| 1. Scheda cliente (A) | ✅ pushata 2026-10-19 (c249a4b8, clienti 3.7) |
| 2. Lista clienti iPad (A) + Clienti si apre sulla lista + menu rinominato + rank/frequenza colorati + ordine dalle intestazioni | ✅ scritta 2026-10-19 (clienti 3.8), da pushare |
| 3. Prenotazioni › Oggi (A) + barra in basso su iPhone | da fare |
| 4. Archivio prenotazioni dentro Prenotazioni | ✅ scritto 2026-10-19 (prenotazioni 2.16, `GET /prenotazioni/archivio/`), da pushare. Decisione di Marco: in Clienti lo storico sta nella scheda, la lista di tutte le prenotazioni sta in Prenotazioni |
| 5. Sala (mappa) a tutto schermo su iPad | da fare |
| 6. Pulizia stile (date, colori, emoji) nelle pagine restanti | da fare |

## Scontrino nella scheda (2026-10-19)

Richiesta di Marco: lo scontrino scritto in fila «è poco funzionale». Ora ogni visita mostra **Mangiato** e **Bevuto** (affiancati su schermo largo, uno sotto l'altro su iPhone e nell'anteprima della lista), ciascuno diviso per tipo con quantità, prezzo e totale. I tipi vengono dalla categoria della cassa iPratico: Degustazioni, Pranzo, Antipasti, Primi, Secondi, Contorni, Dolci, Speciali («Fuori carta»), il resto «Altro»; da bere: Vini (Bottiglie, Calici, «Vino» a prezzo libero), Birre, Amari e distillati (Alcolici, Bev Alcoliche, Grappe), Acqua bibite e caffè (il resto). Le voci a 0 € (portate della degustazione, pane, stuzzico) non compaiono; la riga «no_name» della cassa (totale con sconto) non è un piatto. «Prende di solito» usa gli stessi tipi.
