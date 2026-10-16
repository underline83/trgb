> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-24
> Spostato dal second brain dell'osteria (12-SecondBrain/wiki/infrastruttura/rete.md) il 2026-10-16. Da qui in avanti si aggiorna qui.

# Rete dell'osteria

Ultimo aggiornamento: 2026-08-24

## Come è fatta

Linea TIM in fibra → router TIM → switch Netgear → due access point Aruba per il Wi-Fi, apparati critici su cavo.

Il Wi-Fi del router TIM è **spento di proposito** (2026-08-23): copriva la stessa area degli Aruba senza coordinarsi con loro e causava lentezza e cadute. Spegnerlo ha ridotto i picchi di latenza da 315 ms a 20 ms. **Non riaccenderlo.**

## Indirizzi

Sottorete **192.168.86.x**, che non è quella di fabbrica del router TIM (sarebbe 192.168.1.x). È stata impostata a mano perché eredita quella del vecchio Google Wifi: la cassa fiscale ha l'indirizzo scritto dentro e non è riconfigurabile senza il concessionario. **Se il router TIM viene sostituito o resettato, va rimessa 192.168.86.x o la cassa sparisce dalla rete.**

| Apparato | IP | MAC | Note |
|---|---|---|---|
| Router TIM (gateway, DHCP, DNS) | 192.168.86.1 | — | pannello `http://192.168.86.1` |
| Switch Netgear GS308EP (gestito, PoE) | 192.168.86.5 | 28:94:01:83:e9:d9 | ha statistiche per porta, utile per diagnosi |
| Telecamera Nest | 192.168.86.14 | 18:b4:30:8b:ce:fc | |
| Telefono IP Cisco | 192.168.86.27 | 54:8a:ba:94:d8:95 | |
| iPad cassa | 192.168.86.100 | variabile | usa l'indirizzo Wi-Fi privato, cambia da solo |
| **Stampante fiscale Epson** | 192.168.86.150 | 38:1a:52:08:ba:3c | su cavo, porta 9100 |
| **Stampante comande SALA** | 192.168.86.153 | 00:2e:74:1f:69:b3 | SOL801, IP statico, porta 9100 |
| **Stampante comande CUCINA** | 192.168.86.154 | 00:2e:7b:40:69:b3 | SOL801, IP statico, porta 9100 |

Le prenotazioni DHCP stanno **sul router TIM** (LAN → Indirizzi IP statici), non sugli Aruba: sono gli Aruba a fare solo da ponte radio. Le tre stampanti hanno comunque l'indirizzo statico scritto al loro interno (DHCP disattivato), quindi la prenotazione serve solo a impedire che il router assegni quegli indirizzi a qualcun altro.

Nota: la prenotazione della stampante di sala conteneva un MAC sbagliato (`2a` invece di `2e`), corretto il 2026-08-24. Quando si aggiunge una prenotazione conviene usare **"Selezionare tra i dispositivi associati"** invece di digitare il MAC a mano.

## Stampanti comande — pannello di configurazione

Entrambe sono **SOL801** con modulo di rete cinese, pannello web sull'indirizzo della stampante (`http://192.168.86.153`). Prima schermata: scelta lingua, c'è **English** nella tendina. Menu a sinistra: `网口IP` rete, `打印机参数` parametri stampa, `设置参数` impostazioni.

Configurazione corretta al 2026-08-24, identica sulle due salvo l'allarme sonoro:

| Parametro | Valore |
|---|---|
| Larghezza di stampa | 72mm |
| Orientamento | normale (正常) |
| Carattere | 12*24 |
| Taglierina | attiva |
| Ristampa se finisce la carta | **attiva** |
| Cicalino | solo su errore |
| Allarme all'arrivo comanda | **sala: spento — cucina: acceso** |
| DHCP | disattivato (IP statico) |
| Set comandi / codepage | ESC/POS, WCP1252 |

Attenzione: nel pannello le tendine si modificano scorrendo con il trackpad se il cursore ci passa sopra. È già successo di cambiare per sbaglio larghezza, orientamento e carattere della stampante di sala. Dopo ogni modifica **ricaricare la pagina** per vedere i valori davvero salvati, e **fare una comanda di prova**.

## Wi-Fi — access point Aruba Instant On

Gestiti dal cloud: app Instant On sul telefono di Marco, oppure `portal.instant-on.hpe.com` da browser (stesse credenziali). Sito: **OsteriaTreGobbi**. Il pannello locale sull'IP dell'apparato mostra solo stato e manutenzione, non i canali.

| | Modello | IP | Serial | Posizione |
|---|---|---|---|---|
| AP25 | Instant On AP25 (interno) | 192.168.86.6 | CNTSKD57JV | sala |
| AP27 | Instant On AP27 (esterno) | 192.168.86.7 | VNVXM2G06H | dehors |

Software 3.4.0.0 su entrambi. L'AP27 è collegato tramite un secondo apparato Netgear a 192.168.86.10.

Due reti wireless: **TreGobbi-Privata** (192.168.86.x, quella di servizio) e **TreGobbi-Pubblica** per i clienti, che va su una sottorete separata 172.30.1.x — quindi i clienti non vedono cassa, stampanti e telecamere. Configurazione corretta, lasciarla così.

### Canali, dal 2026-08-24

| | 2.4 GHz | 5 GHz |
|---|---|---|
| AP25 interno | canale **1** (fissato) | canale **36**, 80 MHz |
| AP27 esterno | canale **6** (fissato) | canale **149**, 80 MHz |
| *SonosNet* | *canale **11*** | — |

I tre canali del 2.4 GHz sono assegnati uno per trasmettitore e **fissati a mano**: non devono sovrapporsi. Il terzo trasmettitore è **SonosNet**, la rete mesh che i quattro Sonos si creano tra loro: non compare in nessuna scansione ma occupa un canale a tempo pieno. Prima del 2026-08-24 stava sul canale 11 insieme all'access point della sala.

Il canale di SonosNet si legge senza l'app aprendo `http://192.168.86.15:1400/status/proc/ath_rincon/status` — la riga «Home channel». Si cambia dall'app Sonos, ma è più semplice spostare l'access point.

Sonos presenti: **192.168.86.13, .15, .19, .20**. Nelle scansioni ne compaiono solo alcuni perché gli altri si appoggiano alla mesh invece che agli access point.

**I canali DFS (52, 100, 116) sono stati disabilitati di proposito.** L'AP esterno stava sul 116 a 80 MHz, che occupa fino al canale 128 e finisce dentro la banda dei radar meteorologici: ogni rilevamento radar obbliga l'apparato a liberare la frequenza e scarica tutti i client collegati. Con Bergamo e Orio al Serio vicini è una fonte plausibile di disconnessioni improvvise. Non riabilitarli senza una ragione.

**La congestione dei canali NON è un problema qui.** Gli access point misurano l'occupazione reale dell'aria: 13-37%, valori bassi. Contare le reti visibili nelle scansioni sovrastima moltissimo il problema — non usare quel criterio per decidere.

### Conseguenza da tenere presente

Sul canale 149 la normativa europea impone un limite di potenza molto più basso: l'AP esterno è passato da 29,5 a **13,5 dBm** sul 5 GHz. La copertura del dehors sul 5 GHz è quindi ridotta. Il 2.4 GHz è rimasto a piena potenza.

I canali bassi (36-64) in Europa sono riservati all'uso interno, quindi l'apparato esterno non può usarli: le sue uniche alternative sono i canali radar o il 149 a bassa potenza.

Se il dehors risultasse scoperto, la via di mezzo è riabilitare **solo il canale 100**: è DFS ma un blocco da 80 MHz che parte dal 100 arriva al 112 e non tocca la banda dei radar meteo, a differenza del 116.

## Linea

Fibra TIM, misurata 580-650 Mbps in download e 650-740 in upload. L'operatore assegna un **indirizzo IP condiviso (CGNAT)**: non c'è IP pubblico, quindi nessun apparato è raggiungibile da fuori. Se un giorno servisse l'accesso da remoto (telecamere, gestionale da casa), va chiesto a TIM l'indirizzo pubblico.

## Appartamento sopra l'osteria

Linea a parte, fibra di altro operatore (Fastweb), router ZTE su 192.168.1.254, rete `UnderlineNET`. Il 2026-08-24 spostata dal canale 100 (DFS, a rischio di interruzione da radar) al **canale 44 a 80 MHz**, 2.4 GHz sul canale 1. Verificata a 852/678 Mbps. Le due reti dell'edificio non devono finire sullo stesso canale.

## Strumenti di diagnosi

Gli script preparati il 2026-08-23/24 stanno nella cartella di lavoro di Claude (`controllo_osteria.command`, `monitor_fiscale.command`, `trova_mac.command`, `verifica_stampanti.command`). Vanno lanciati **a Wi-Fi stabile da qualche minuto**, altrimenti i dati sono falsati.
