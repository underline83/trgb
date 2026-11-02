# Guida — collegare WhatsApp a TRGB (sola lettura, coexistence Meta)

> Modulo `clienti` · doc tecnico: [modulo_clienti_crm.md](modulo_clienti_crm.md) §17 · creata 2026-11-02.
> Fonti Meta (lette il 2026-11-02): «Onboarding WhatsApp Business app users», «Embedded Signup — implementation», «Pricing», «Get started for Tech Providers» su developers.facebook.com.

Il numero dell'osteria resta sull'app **WhatsApp Business** del telefono e si continua a scrivere da lì. TRGB riceve una copia dei messaggi e **non manda niente**.

## 0. Prima di tutto

- Sul telefono: app **WhatsApp Business** (icona con la «B») versione **2.24.17 o più nuova**, col numero dell'osteria. Se oggi è WhatsApp normale, prima si passa a Business (e si verifica che le chat restino).
- Un account Meta Business (business.facebook.com) dell'osteria, con te amministratore. Meta può chiedere la **verifica dell'azienda** (Centro sicurezza): tieni a portata visura/partita IVA.
- **Cosa cambia sull'app dopo il collegamento** (Meta): messaggi effimeri e «visualizza una volta» spenti, liste broadcast solo in lettura, i dispositivi collegati (WhatsApp sul Mac) si scollegano e vanno ricollegati — WhatsApp per **Windows** non è supportato. L'app va **aperta almeno ogni ~13 giorni**, altrimenti Meta scollega (TRGB manda una notifica).
- **Cosa TRGB non vedrà:** chat di gruppo, foto/file (solo la didascalia).

## 1. L'app su Meta (developers.facebook.com)

1. **Crea app** → caso d'uso WhatsApp («Connettiti con i clienti tramite WhatsApp») → collegala al portfolio business dell'osteria.
2. **Impostazioni app › Di base:** annota l'**ID app** (`WA_APP_ID`) e la **chiave segreta** (`WA_APP_SECRET` — non incollarla in chat).
3. **Facebook Login for Business › Impostazioni:** Sì a Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Strict Mode, Login with the JavaScript SDK. In **Allowed domains** e **Valid OAuth redirect URIs**: `https://app.tregobbi.it/`.
4. **Facebook Login for Business › Configurazioni:** «Crea da modello» → *WhatsApp Embedded Signup Configuration* → salva e annota l'**ID configurazione** (`WA_CONFIG_ID`).

## 2. Le chiavi sul VPS (dopo il push con la mig 224)

Nel `.env` del backend sul VPS (lo stesso dei `THEFORK_*`), da Mac con `ssh trgb`:

```
WA_APP_ID=<id app>
WA_APP_SECRET=<chiave segreta>
WA_CONFIG_ID=<id configurazione>
WA_VERIFY_TOKEN=<una parola lunga scelta da te>
# WA_GRAPH_VERSION=v26.0   (solo se Meta dice di cambiarla)
```

Poi `sudo systemctl restart trgb-backend`. In app.tregobbi.it › Clienti › Impostazioni › WhatsApp deve sparire «Configurazione .env incompleta».

## 3. Il webhook (pannello Meta › WhatsApp › Configurazione)

- **Callback URL:** `https://trgb.tregobbi.it/clienti/whatsapp/webhook`
- **Verify token:** la stessa parola di `WA_VERIFY_TOKEN` → «Verifica e salva» (se dà errore: backend non riavviato o parola diversa).
- **Campi da attivare:** `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync`, `account_update`.

⚠️ Il webhook deve funzionare **prima** del collegamento: lo storico di 6 mesi arriva una volta sola, nelle 24 ore dopo.

## 4. La prova: «Collega WhatsApp»

Dal computer, su app.tregobbi.it › Clienti › Impostazioni › WhatsApp → **Collega WhatsApp**.

1. Si apre la finestra di Meta: entra col tuo profilo Facebook, scegli il portfolio dell'osteria.
2. **Il punto della prova:** deve comparire l'opzione per **collegare un account WhatsApp Business esistente** (l'app). 
   - Se c'è → avanti: numero dell'osteria, conferma dall'app sul telefono (codice o QR), **accetta di condividere la cronologia**.
   - Se non c'è (o Meta chiede di essere Tech Provider/partner) → fermati, fai uno screenshot: la strada «fai-da-te» non passa e si decide fra Tech Provider (revisione app) o provider.
3. Tornato su TRGB compaiono i passi: scambio codice, account, numero, iscrizione webhook, rubrica, storico. «coexistence: sì» è il segnale giusto.

## 5. Verifica

- Entro qualche minuto: «Ultimo webhook» si aggiorna e «storico fase … %» avanza; l'archivio conta messaggi e chat.
- Da un telefono personale scrivi al numero dell'osteria e rispondi dall'app: in «Chat recenti» la chat passa da «Da rispondere» a «Risposto».
- Dal giro / Claude: `whatsapp_conversazioni` e `whatsapp_cerca` («ho mandato la proposta a …?»).

## 6. Se qualcosa non va

- Errori di un passo: sono scritti nella pagina, con il messaggio di Meta.
- Webhook non elaborati: segnalati in «Archivio» (il contenuto grezzo si tiene solo in quel caso, per capire, e si cancella da solo).
- App in modalità sviluppo: se i webhook veri non arrivano può servire mettere l'app «Live» (da verificare alla prova).
- Costi: nessuno da Meta finché TRGB non scrive (e non scrive). I messaggi dall'app restano gratuiti.
