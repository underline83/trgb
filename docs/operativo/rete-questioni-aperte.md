> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-24
> Spostato dal second brain dell'osteria (12-SecondBrain/wiki/infrastruttura/rete-questioni-aperte.md) il 2026-10-16. Da qui in avanti si aggiorna qui.

# Rete — questioni aperte

Ultimo aggiornamento: 2026-08-24. Vedi `wiki/infrastruttura/rete.md` per com'è fatta la rete.

## 1. Perché la stampante fiscale dà noie (la più importante)

È l'apparato che si pianta più spesso. È su cavo e in rete risponde bene (0% di pacchetti persi, 6 ms), quindi il Wi-Fi non c'entra.

Ipotesi da verificare: le Epson fiscali accettano **una sola connessione TCP per volta**. Se la sessione dell'iPad si interrompe male — l'iPad passa da un access point all'altro, va in stop, l'app finisce in background — la stampante la considera ancora aperta e rifiuta le successive finché non scade il suo timeout. Da fuori sembra sparita, poi torna da sola.

**Come accertarlo:** lanciare `monitor_fiscale.command` durante un servizio e guardare cosa succede quando si pianta.

- Risponde al ping ma **rifiuta la porta 9100** → sessione bloccata, problema di stampante/iPad, nessun intervento sulla rete lo risolve.
- **Non risponde nemmeno al ping** → rete, cavo o alimentazione.

Sono due strade opposte e finché non si sa quale sia, ogni intervento è a caso.

Indizio raccolto: il 2026-08-22 la stampante risultava riavviata due volte, alle 13:22 e alle 23:31 — orari da servizio, compatibili con qualcuno che la spegne e riaccende perché si è piantata.

## 2. Lo switch Netgear non è mai stato guardato

`http://192.168.86.5`, è un modello **gestito**: tiene le statistiche di ogni porta, errori e numero di cadute del collegamento. La stampante fiscale è su cavo e quasi certamente attaccata lì.

È la fonte di prova migliore disponibile e nessuno l'ha ancora aperta. Se la porta della fiscale mostra errori o link che cade e risale, la diagnosi si chiude in cinque minuti.

Da capire anche: chi l'ha installato, se ha una password nota, e cosa c'è attaccato a ogni porta.

## 3. Manca una misura a sala piena

Tutte le misure finora sono a locale chiuso o quasi vuoto. Serve lanciare `controllo_osteria.command` **giovedì o venerdì sera nel pieno del servizio**, con i telefoni dei clienti attaccati e le comande che girano.

È l'unico dato che manca per dire se la rete è a posto davvero. Se regge, non si tocca più niente. Se i picchi riesplodono, allora ha senso spostare gli access point Aruba sui canali liberi.

## 4. La copertura del dehors dopo il cambio di canale — DA VERIFICARE STASERA

Il 2026-08-24 l'access point esterno è stato spostato dal canale 116 (radar) al 149. Sul 149 la potenza consentita è molto più bassa: da 29,5 a 13,5 dBm.

**Verifica pratica: stasera, con gente ai tavoli fuori, guardare se il Wi-Fi al dehors regge.** Se regge, la configurazione attuale è la più sicura e non si tocca. Se non regge, riabilitare **solo il canale 100** nella gestione radio del portale Instant On — è DFS ma sta fuori dalla banda dei radar meteo, a differenza del 116.

## 5. Sonos e POS che si disconnettono — due cause rimosse, da verificare l'esito

Il 2026-08-24 sono state trovate e corrette due sovrapposizioni:

- l'access point esterno stava sul canale radar 116 (spostato sul 149)
- **SonosNet e l'access point della sala erano entrambi sul canale 2.4 GHz 11** (l'access point spostato sul canale 1)

Sono due cause plausibili e indipendenti, entrambe eliminate. **Ora serve solo osservare qualche giorno** se Sonos e terminali PAX smettono di cadere, senza toccare altro: se si cambiano più cose insieme non si capisce più cosa ha funzionato.

Se le disconnessioni continuano, il prossimo elemento da guardare sono i contatori di errori radio dei Sonos, che il 2026-08-24 erano molto alti (1,9 milioni su .15 e 9,2 milioni su .20) — vanno però riletti a distanza di giorni per capire se crescono ancora, perché sono contatori cumulativi dall'accensione.

## 5. L'iPad cassa cambia indirizzo da solo

Usa l'indirizzo Wi-Fi privato di iOS, che viene rigenerato ogni tanto. Oggi non è un problema perché è l'iPad a cercare le stampanti e non viceversa. Diventerebbe un problema il giorno che qualcosa debba raggiungere l'iPad per indirizzo.

Se servisse fissarlo: prima disattivare "Indirizzo Wi-Fi privato" nelle impostazioni Wi-Fi dell'iPad per la rete dell'osteria, **poi** fare la prenotazione sul router — altrimenti la prenotazione smette di funzionare al primo cambio.

## 6. Nessun accesso da fuori (CGNAT)

TIM assegna un indirizzo condiviso, quindi nessun apparato dell'osteria è raggiungibile da internet. Finché non serve, va bene così. Il giorno che servisse — telecamere da remoto, gestionale da casa, un NAS — va chiesto a TIM l'indirizzo IP pubblico, che spesso viene dato senza costi aggiuntivi.

## 7. Cose minori rimaste in sospeso

- Rinominare le due voci sul router TIM da `stampante-comande-1/2` a `stampante-sala` e `stampante-cucina`: la numerazione si presta a confondere le due.
- Impostare i DNS del router TIM su 1.1.1.1 e 9.9.9.9: le risoluzioni stanno sui 40 ms passando per TIM, si dimezzerebbero. Non cambia la velocità della linea, ma le pagine si aprono prima.
- Verificare che l'intervallo di indirizzi assegnati automaticamente dal router non si sovrapponga a quelli fissi delle stampanti.
