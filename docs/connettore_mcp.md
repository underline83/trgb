# Connettore MCP di TRGB — Claude dentro il gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale — implementato il 2026-10-08 (mattone M.K, sistema 5.46) · **Ultima verifica:** 2026-10-08
> **Vedi anche:** [modulo_pratiche.md](modulo_pratiche.md), [architettura_mattoni.md](architettura_mattoni.md) (M.G permessi), [refactor_monorepo.md](refactor_monorepo.md)

**Classificazione:** `[core]`, platform, mattone **M.K** (Marco, 2026-10-08). Ogni locale che compra TRGB può collegare Claude al suo gestionale; quali strumenti vede dipende dai moduli attivi e dal ruolo di chi autorizza.
**Origine:** decisione di Marco del 2026-10-08: prima il modulo Pratiche, poi il connettore. Il primo uso è passare le pratiche da Claude a TRGB («segna che è arrivata la PEC di Col d'Orcia»).
**Modello:** il connettore del brain (`~/brain/app/connettore.py` e `oauth.py`, in produzione dal 2026-10-08 su `brain.carminati.org/mcp`). Stesso SDK, stesso schema OAuth, stesso principio: gli strumenti chiamano le funzioni del service, niente copie.

---

## 1. Cosa fa

TRGB diventa un **connettore personalizzato di claude.ai**. Da qualsiasi chat (web, desktop, iPhone) Claude può leggere e scrivere le pratiche senza che Marco incolli un token. Si aggiunge una volta da claude.ai → Impostazioni → Connettori, con l'indirizzo `https://trgb.tregobbi.it/mcp`. Al primo uso si apre una pagina di TRGB che chiede **utente e PIN**, gli stessi del gestionale.

## 2. Come è fatto

- **Stesso processo del backend**, sulla rotta `POST /mcp` (Streamable HTTP, SDK ufficiale `mcp` 2.3.0, come il brain). Nessun servizio nuovo sul VPS. Un middleware manda a MCP solo le sue rotte (`/mcp`, `/.well-known/oauth-*`, `/oauth/*`); il resto va alla FastAPI com'è oggi.
- **Avvio:** il server MCP ha bisogno del `lifespan` di FastAPI. Oggi `main.py` non ha hook di avvio, quindi si aggiunge senza toccare altro.
- **File:**
  - `app/connettore/server.py`: gli strumenti, le istruzioni per Claude, il middleware `Smista` e la protezione dal DNS rebinding;
  - `app/connettore/oauth.py`: il fornitore OAuth (adattato da quello del brain) e la pagina `/oauth/pin`;
  - `app/models/connettore_db.py`: le tabelle `connettore_oauth_clienti`, `connettore_oauth_codici`, `connettore_oauth_token` in `connettore.sqlite3` (codici e token salvati come sha256, ognuno con lo username), schema creato al boot;
  - `scripts/connettore.py`: elenca e revoca le autorizzazioni;
  - `main.py`: `lifespan` (`_vita`) e, in fondo, la costruzione del server.
- **Indirizzo pubblico:** `TRGB_PUBLIC_URL`, altrimenti `https://<dominio>` da `locali/<id>/locale.json`. Il nome del locale («Osteria Tre Gobbi») compare sulla pagina di autorizzazione.
- **Mai un blocco del gestionale:** se `mcp` non è installato o il connettore dà un errore all'avvio, il backend parte lo stesso e `/mcp` risponde 404. Nel log c'è «⚠️ Connettore MCP non attivo».
- **Moduli:** gli strumenti di un modulo esistono solo se il modulo è attivo per il locale (`module_loader`).
- **Dipendenza nuova:** `mcp==2.3.0` in `requirements.txt` (si porta dietro httpx2, sse-starlette, PyJWT, jsonschema, opentelemetry-api). Il hook del VPS fa `pip install` da solo quando `requirements.txt` cambia; `push.sh … -f` lo forza.
- **nginx sul VPS:** `trgb.tregobbi.it` passa già tutto al backend, quindi `/mcp` dovrebbe arrivarci senza toccare niente. Se le risposte di Claude arrivano a scatti o in ritardo, si aggiunge un `location /mcp` con `proxy_buffering off`, come per il brain.

## 3. Accesso

- **OAuth 2.1** come il brain: metadata `.well-known`, registrazione dinamica, PKCE S256, accesso di **1 ora**, rinnovo di **30 giorni** che ruota.
- **Indirizzi di ritorno ammessi:** solo claude.ai / claude.com e localhost (per l'MCP Inspector).
- **La pagina di autorizzazione** chiede utente e PIN e li controlla con `authenticate_user` di `auth_service`: stesso blocco dopo i tentativi sbagliati, stessa politica PIN del login.
- **Chi può autorizzare:** solo admin e superadmin, perché oggi gli strumenti sono soltanto pratiche. Il token porta con sé l'utente: ogni strumento rifà il controllo dei ruoli con M.G (`verifica_ruoli`), come il router. Se domani il connettore apre altri moduli, ogni strumento dichiara i suoi ruoli.
- **Revoca:** `scripts/connettore.py --revoca` sul VPS. Togliere un utente o cambiargli ruolo blocca anche i suoi token alla chiamata successiva, perché ruolo e stato dell'utente si rileggono a ogni chiamata.

## 4. Strumenti (prima versione: solo pratiche)

| Strumento | Cosa fa | Funzione del service | Tipo |
|---|---|---|---|
| `pratiche_elenco` | aperte (o chiuse, o tutte), filtri `stato`, `scadute`, `ferme`, `q` | `elenco` | sola lettura |
| `pratica_leggi` | una pratica con passi e collegamenti | `leggi` | sola lettura |
| `pratica_crea` | nuova pratica con il primo passo (data di apertura anche passata, termine facoltativo) | `crea_pratica` | scrive |
| `pratica_passo` | il gesto di tutti i giorni: testo, data, cambio di stato (anche chiudere con esito o riaprire), nuovo termine o nessun termine | `aggiungi_passo` | scrive |

Fuori dalla prima versione, apposta:
- **allegati**: si caricano dalla UI; dalla chat non c'è un file da passare in modo pulito;
- **collegamenti** e **correzione della testata**: rari, si fanno dalla UI;
- **cancellazioni**: nel modulo non esistono, e il connettore non le aggiunge.

**Autore dei passi:** `claude (marco)`, cioè «claude» più l'utente che ha autorizzato. Nella storia si vede che il passo è arrivato dalla chat e per conto di chi.

**Errori:** `PraticaErrore` e `PraticaNonTrovata` arrivano a Claude come errore dello strumento, con lo stesso messaggio che darebbe l'API («Per chiudere serve l'esito»…).

### Istruzioni per Claude (scritte nel server, in italiano)

- Una pratica è uno scambio formale con qualcuno di esterno che aspetta un esito. Un evento con un cliente è un preventivo, un lavoro interno è un task, un pagamento è un'uscita: non vanno nelle pratiche.
- Tre stati: `tocca_a_me`, `tocca_a_loro`, `chiusa` (con esito). Il tempo non cambia lo stato: una pratica scaduta resta nel suo stato finché qualcuno non la muove.
- Prima di creare una pratica cerca con `pratiche_elenco` se esiste già.
- Prima di **creare** o **chiudere**, riepiloga a Marco cosa scriverai e aspetta il suo sì. Un passo semplice («è arrivata la PEC») si scrive e si conferma dopo.
- Le date dei passi sono quelle vere dei fatti, anche passate.

## 5. Prove previste

- Le prove del service esistono già (31 casi). Si aggiungono:
  - strumenti chiamati in locale con l'MCP Inspector (registrazione, pagina del PIN, `pratiche_elenco`, `pratica_crea`, `pratica_passo`);
  - OAuth: ritorno estraneo rifiutato, PIN sbagliato e blocco, utente non admin rifiutato, token scaduto → 401 con `WWW-Authenticate`, rinnovo che ruota;
  - l'API di TRGB risponde come prima: stesse rotte, nessun cambio per il frontend.
- In produzione: metadata e 401 verificati da fuori, poi Marco aggiunge il connettore in claude.ai e si prova il passaggio di una pratica vera dalla chat.

## 6. Dopo

- Skill sb: una pratica va in TRGB attraverso il connettore, in sb resta una riga di diario (PRT.3).
- Altri strumenti, modulo per modulo, quando servono (per esempio scadenzario CG, preventivi). Ognuno con i suoi ruoli M.G e una riga in questa pagina.

## 7. Decisioni di Marco (2026-10-08)

1. `[core]` platform, mattone **M.K Connettore MCP**, sistema 5.45 → 5.46.
2. Autorizzano solo admin e superadmin.
3. Autore dei passi: `claude (<utente>)`, per esempio `claude (marco)`.
4. Prima di creare o chiudere una pratica Claude chiede conferma; un passo semplice lo scrive e lo dice dopo.

## 8. Prove fatte (2026-10-08)

In locale, con `mcp` 2.3.0 (pacchetti presi dalla venv del brain, senza rete) e un locale temporaneo:
- OAuth: metadata, 401 con `WWW-Authenticate`, ritorno estraneo rifiutato, PIN sbagliato 401, utente `sala` 403, richiesta già usata, codice riusato che chiude anche i token aperti, rinnovo che ruota, vecchio accesso chiuso, rinnovo riusato che chiude la famiglia, utente declassato → 401;
- strumenti: elenco dei 4, `pratica_crea` con autore `claude (marco)`, ricerca, chiusura senza esito con errore leggibile, passo con stato e termine, 404, chiusura con esito;
- avvio di `main.py` su una copia dei DB: con `mcp` il connettore è attivo e il resto risponde come prima; senza `mcp` il backend parte e `/mcp` dà 404.

Non provato: il giro da claude.ai vero, che si fa dopo il push.

## 9. Dopo il push (Marco)

1. Controllare nel log del backend «🔌 Connettore MCP attivo su https://trgb.tregobbi.it/mcp».
2. claude.ai → Impostazioni → Connettori → Aggiungi connettore personalizzato → `https://trgb.tregobbi.it/mcp`.
3. Autorizzare con utente e PIN di TRGB.
4. In una chat: «che pratiche ho aperte?», poi un passo vero («segna che oggi ho mandato la PEC a …»).
5. Per vedere o revocare le autorizzazioni, sul VPS: `python3 scripts/connettore.py`.
