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
| 1. Scheda cliente (A) | ✅ scritta 2026-10-19 (clienti 3.7), da pushare |
| 2. Lista clienti iPad (A) + Clienti si apre sulla ricerca + menu Clienti senza «Prenotazioni» | da fare |
| 3. Prenotazioni › Oggi (A) + barra in basso su iPhone | da fare |
| 4. Archivio prenotazioni dentro Prenotazioni (Cerca) | da fare |
| 5. Sala (mappa) a tutto schermo su iPad | da fare |
| 6. Pulizia stile (date, colori, emoji) nelle pagine restanti | da fare |
