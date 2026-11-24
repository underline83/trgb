# Spec — Notifiche push sui dispositivi (mattone M.A) — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** in corso — fase 1 scritta il 2026-11-24 (backend in produzione, frontend da pushare) · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [architettura_mattoni.md](architettura_mattoni.md) §M.A · [analisi_app_apple.md](analisi_app_apple.md) (la strada verso l'app nativa) · [connettore_mcp.md](connettore_mcp.md)

**Classificazione:** `[core]`, platform, estensione del mattone **M.A** (notifiche). Nessun modulo vendibile nuovo.
**Origine:** Marco, 24/11/2026. Il giro mail dell'osteria gli arriva nell'app di Claude e su Telegram; chiede se può arrivare «anche sull'app», cioè TRGB. Il campanello (M.A) c'è, ma si vede solo aprendo TRGB: non avvisa sul telefono.

---

## 1. Decisioni di Marco (24/11/2026)

1. **«Lavoriamo la A; ma ricordiamoci che l'obiettivo è sempre C.»** A = push vere dalla PWA (web push, le manda TRGB, senza canoni). C = app nativa (Capacitor, push Apple). Scartato Telegram per lo staff: resta fuori dal prodotto vendibile.
2. **Struttura approvata sul mockup** («sì, proviamolo così»): la notifica sul telefono apre la pagina giusta; ognuno attiva le notifiche sul proprio dispositivo; Marco decide da Impostazioni › Notifiche quali tipi diventano push e a chi.
3. Sul suo iPhone TRGB, aperto dall'icona sulla Home, parte a tutto schermo: le web app dalla Home funzionano, quindi le push hanno le condizioni per arrivare. La conferma è la prima push di prova.

Q: #406 (A adesso, C obiettivo), #396 (Telegram del giro, strumento `avvisa` di Q).

## 2. Come è fatto

**La push sta nel mattone notifiche, non nel giro.** Chi crea una notifica continua a chiamare `crea_notifica`; sarà il mattone a decidere se farla diventare push (fase 2). Il giro è un tipo fra gli altri.

**A canali.** Ogni dispositivo registrato ha un `canale`: `webpush` oggi, `apns` quando ci sarà l'app Capacitor (nella WebView nativa il web push non c'è: lì si usa il plugin delle push e il token del dispositivo). `notifiche_push.CANALI` è la mappa canale → funzione d'invio: l'app nativa aggiunge una voce, senza toccare chi chiama `manda_a_utente`, gli interruttori o chi crea le notifiche.

**Un punto solo nel frontend:** `frontend/src/utils/push.js` (`statoPush`, `attivaPush`, `disattivaPush`, `provaPush`). Oggi parla col browser; con l'app nativa cambia solo quel file.

**Nessuna libreria nuova.** Cifratura del messaggio (RFC 8291, `aes128gcm`) e firma del mittente (VAPID, RFC 8292) scritte con `cryptography`, che c'è già; l'invio con `httpx`. La cifratura è provata contro l'esempio dell'RFC, byte per byte.

**Chiavi del locale (VAPID):** generate da sole al primo uso, in `notifiche_push_config`, cifrate con `TRGB_SECRET_KEY` quando c'è (come le password delle caselle). Nessun passaggio a mano sul VPS. Se `TRGB_SECRET_KEY` cambia non si decifrano più (lo dice `errore` in `/notifiche/push/stato`): si toglie la riga `vapid_privata`, TRGB ne genera di nuove e i dispositivi vanno riattivati.

## 3. Dati (`notifiche.sqlite3`, tabelle create al boot da `init_notifiche_db`)

| Tabella | Cosa tiene |
|---|---|
| `notifiche_dispositivi` | un dispositivo di un utente: `username`, `canale`, `indirizzo` (endpoint web push o, domani, token dell'app; UNIQUE), `p256dh`, `auth`, `nome`, `user_agent`, `attivo`, `errori_di_fila`, `ultimo_ok`, `ultimo_errore`, `creato_il`, `visto_il` |
| `notifiche_push_config` | chiave/valore: `vapid_privata` e i valori che Marco può cambiare |

Valori cambiabili (predefiniti in `notifiche_push.PREDEFINITI`, niente numeri sparsi nel codice):

| Chiave | Predefinito | Cosa fa |
|---|---|---|
| `ttl_ore` | 12 | per quante ore il servizio push tiene una notifica se il dispositivo è spento |
| `errori_max` | 5 | dopo quanti invii falliti di fila un dispositivo viene spento |

Oggi si cambiano solo dal DB; la pagina arriva con la fase 2.

## 4. Capability

| Codice | Cosa fa | Dove | Chi | Stato |
|---|---|---|---|---|
| C-MA-P01 | Attiva le notifiche su questo dispositivo | `POST /notifiche/push/dispositivi` · `NotifichePush.jsx` | tutti i ruoli, ognuno i suoi | 🆕 fase 1 |
| C-MA-P02 | Vede i propri dispositivi e toglie quelli vecchi | `GET /notifiche/push/stato` · `DELETE /notifiche/push/dispositivi/{id}` | tutti i ruoli | 🆕 fase 1 |
| C-MA-P03 | Push di prova sui propri dispositivi | `POST /notifiche/push/prova` | tutti i ruoli | 🆕 fase 1 |
| C-MA-P04 | Tocco sulla notifica → pagina giusta di TRGB | `frontend/public/sw.js` (`push`, `notificationclick`) · `utils/push.js` `ascoltaTocchiNotifica` | — | 🆕 fase 1 |

Permessi (M.G): le quattro rotte dichiarano tutti i ruoli (`_OGNUNO` in `notifiche_router.py`) perché ognuno gestisce solo i propri dispositivi; il service filtra sempre per `username`.

## 5. Sicurezza

- **L'indirizzo arriva dal dispositivo, non va seguito alla cieca:** TRGB chiama solo i servizi push noti (`SERVIZI_PUSH`: Apple, Google, Mozilla, Microsoft), solo in https.
- **Il link della notifica è sempre una pagina del gestionale** (comincia con `/`): controllato dal backend, dal service worker e da `ascoltaTocchiNotifica`.
- **Le risposte non portano mai indirizzo e chiavi del dispositivo:** solo un'`impronta` per riconoscere «questo dispositivo».
- **«Vedi come»:** il riquadro non compare, altrimenti il dispositivo finirebbe registrato a nome dell'utente guardato.
- Lo stesso dispositivo che si iscrive con un altro utente passa a lui (una riga per indirizzo): un iPad condiviso riceve le push dell'ultimo che le ha attivate.

## 6. Limiti noti

- **iPhone e iPad:** servono iOS/iPadOS 16.4 o successivi, TRGB sulla schermata Home, e ognuno attiva le notifiche una volta per dispositivo con un tocco. Da Safari normale il riquadro lo spiega.
- **Europa:** le fonti si contraddicono sul fatto che le push delle web app funzionino nei paesi UE. Si chiude con la prova sull'iPhone di Marco (§8).
- Il service worker mostra sempre una notifica per ogni push: su Safari chi riceve push senza mostrarle perde il permesso.
- Niente contatore sull'icona (badge) e niente push silenziose: fase 3.

## 7. Fasi

| Fase | Cosa | Stato |
|---|---|---|
| **1** | Dispositivi, chiavi, invio web push, attiva/spegni/prova dal campanello | scritta il 2026-11-24 — backend in produzione (uscito col push 85878008), frontend da pushare |
| **2** | Interruttori per tipo e destinatari (Impostazioni › Notifiche), aggancio a `crea_notifica`, strumento `notifica_crea` nel connettore per il giro | da fare, dopo la prova sull'iPhone |
| **3** | Contatore sull'icona, pagina dei valori (`ttl_ore`, `errori_max`), elenco dispositivi di tutti per l'admin | da fare |
| **C** | Canale `apns` con l'app Capacitor | obiettivo |

**Da decidere con Marco in fase 2:** quali tipi nascono con la push accesa (la proposta del mockup: giro, risposte ai preventivi, posto liberato, evento confermato; spente scadenze e turni — negli ultimi 30 giorni il campanello ha ricevuto circa 450 notifiche, quasi tutte avvisi di scadenze); chi riceve il giro (solo admin o anche capo sala, e con quale testo); cosa si legge sul blocco schermo (il testo intero o solo il titolo: sul blocco schermo compaiono nomi di clienti). Attenzione all'inciampo dei ruoli: nel campanello `dest_ruolo` si confronta per uguaglianza esatta, quindi «admin» non raggiunge un superadmin.

## 8. Prove

**Fatte (2026-11-24):** `tests/test_notifiche_push.py`, 19 prove — cifratura contro l'esempio dell'RFC 8291, firma VAPID verificata con la chiave pubblica, dispositivi (registrazione, stesso dispositivo due volte, indirizzi rifiutati, ognuno i suoi), invio (riuscito, dispositivo sparito tolto, errori di fila che spengono, rete giù, canale ignoto, valori cambiati), chiavi (una volta sola, cifrate, chiave del locale cambiata). In produzione: `/notifiche/push/stato` risponde con la chiave pubblica (commit 85878008). I quattro file del frontend passano il parser.

**Non fatte:** il riquadro nel browser, e soprattutto **una push vera su un dispositivo** — è la prova che decide se la strada regge su iPhone in Italia.

**Dopo il push (Marco):**
1. Sull'iPhone apri TRGB dall'icona sulla Home, chiudilo del tutto e riaprilo (serve a caricare il service worker nuovo).
2. Campanello → in fondo «Notifiche su questo dispositivo» → **Attiva** → iOS chiede il permesso → Consenti.
3. **Prova** → blocca lo schermo: entro qualche secondo arriva «Notifica di prova». Toccandola si apre TRGB.
4. Se non arriva: il riquadro mostra l'errore del servizio push; il testo va riportato in chat.
