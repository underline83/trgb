# 📄 TRGB Gestionale — CHANGELOG
**Formato:** Keep a Changelog

---

## 2026-08-03 — Vini: "Cantina da iPhone" fase 1 «trova la bottiglia» `[core]`

Prima pagina mobile-first del modulo vini, per l'uso col telefono in mano tra gli scaffali (V.9 fase 1). Solo consultazione, nessuna scrittura.

### ➕ Aggiunto
- **`CantinaMobile.jsx`** (nuova; route `/vini/cantina-mobile` + `/:id`, ProtectedRoute sub=magazzino): finder «trova la bottiglia» con modo **Cerca** (ricerca testo + **filtro per categoria di locazione**: Scaffali / Frigo / Matrice) e modo **Per scaffale** (vista inversa: cosa contiene ogni posto). Le righe aprono una **scheda mobile read-only**: identità, «Dove si trova» in evidenza con **griglia matrice** (posizione parsata da `LOCAZIONE_3`), anagrafica e movimenti collassabili.
- Voce **📱 Cantina mobile** in `ViniNav`.

### Note tecniche
- **Zero modifiche backend**: riusa `GET /vini/v2/bottiglie/?only_positive_stock=true` (tutte le bottiglie in giacenza, non solo carta), `GET /vini/v2/bottiglie/{id}` e `GET /vini/magazzino/{id}/movimenti`.
- Solo bottiglie fisicamente presenti (giacenza > 0). Righe → scheda mobile, non quella gestionale densa. Base per le fasi 2 (+/− giacenze) e 3 (conta inventario).

### File
`frontend/src/pages/vini/CantinaMobile.jsx` (nuova), `frontend/src/App.jsx` (lazy+route), `frontend/src/pages/vini/ViniNav.jsx` (tab), `frontend/src/config/versions.jsx` (vini 3.79→3.80), `docs/modulo_vini.md`, `docs/roadmap.md` (V.9 fase 1).

---

## 2026-08-03 — Mattone M.J: pubblicare i PDF sul sito senza client FTP `[core]`

Marco: *"se devo aggiornare un menu sul sito possiamo farlo da app?"*. Il sito è un WordPress, ma menu del pranzo e carta vini non stanno nel CMS: sono file statici in `/privata/` sull'hosting Aruba, caricati a mano via FTP. Il PDF lo generava già l'app — mancava solo l'ultimo metro.

### Aggiunto
- **`app/services/ftp_publish_service.py`** (mattone M.J): prende dei bytes e li mette sull'FTP. `ftplib` da standard library, zero dipendenze nuove. Config in `.env` sul VPS, riletta a ogni chiamata.
- **Bottone "Pubblica sul sito"** nel compositore Pranzo e in Impostazioni Vini → Carta, con la data dell'ultima pubblicazione riuscita accanto (`PubblicaSulSito.jsx`, riusabile).
- **`/pubblicazione/stato|test|storico`** per verificare la connessione senza pubblicare niente.

### Le tre scelte che contano
1. **Upload atomico**: si carica su un temporaneo e si fa RENAME solo a trasferimento finito. Se cade la linea, sul sito resta il PDF vecchio **integro** — mai un file troncato davanti ai clienti. Testato: con il server FTP irraggiungibile a metà, il file pubblicato resta quello buono.
2. **Nome remoto fisso** (`menu-pranzo.pdf`, `carta-vini.pdf`): il link su WordPress si mette una volta e non si tocca più. Era la condizione per rendere la cosa davvero automatica.
3. **Solo la carta CLIENTE è pubblicabile.** `/vini/carta/pdf-staff` è interna e non ha nessun endpoint di pubblicazione: un PDF con i dati interni su un server pubblico non deve poter succedere per distrazione.

### Corretto in review (prima del push)
Una review avversariale sul codice appena scritto ha trovato due cose che sarebbero diventate incidenti:

- **Il "rollback" cancellava il file vivo.** Se il server rifiutava il RENAME, la prima stesura cancellava la destinazione e ritentava: quando il rifiuto non era "file già esistente" ma permessi o quota, il link del sito restava a **404**, in silenzio. Ora prima di toccare qualsiasi cosa si scarica in memoria il PDF pubblicato, e se la promozione fallisce lo si rimette su. C'è un test che simula esattamente questo server ostile.
- **`FTP_TLS=auto` poteva rispedire la password in chiaro.** Il fallback copriva anche il login, non solo la negoziazione TLS: una password sbagliata su un server che *supporta* TLS faceva riconnettere in cleartext e ritrasmettere la password vera. Ora il fallback scatta solo sul comando `AUTH`.
- Inoltre: notifica di fallimento che non sarebbe mai arrivata (`dest_ruolo="admin"` mentre Marco è `superadmin` — stesso inciampo già documentato in `turni_service.py`); `static/carta_vini.pdf` condiviso da tutte le richieste, che una generazione concorrente poteva riscrivere **mentre** la pubblicazione lo leggeva; host e utente FTP visibili a qualsiasi utente loggato; "Prova connessione" che diceva OK anche con un utente FTP in sola lettura (ora scrive una sonda e la cancella).

### Falla pre-esistente chiusa per strada
`static/` è servito **senza autenticazione**: la carta vini **staff** ci veniva scritta come `carta_vini_staff.pdf` ed era scaricabile da chiunque ne indovinasse l'URL. L'audit A4 del 2026-07-12 aveva protetto l'endpoint, non il file. Ora carta cliente e staff ritornano bytes nella risposta HTTP e non lasciano niente su disco. **Sul VPS vanno cancellati i due file residui** in `static/`.

### Note
- `FTP_TLS=auto` prova FTPS e, se l'hosting non lo supporta, ricade su FTP in chiaro — **la password viaggia leggibile**. Se Aruba accetta FTPS, mettere `FTP_TLS=1` (con `1` un server senza TLS viene rifiutato invece di ripiegare).
- Fallimento → notifica M.A agli admin: una pubblicazione fallita in silenzio è peggio di una fallita.
- Se davanti al sito c'è una cache/CDN, il PDF nuovo può restare invisibile per un po': è fuori dal controllo dell'app.

---

## 2026-08-03 — Ordini: il bottone per annullare `[core]`

Marco: *"come si annullano gli ordini"*. Non si annullavano: l'endpoint `POST /vini/ordini/{id}/annulla`, la funzione `annulla()` e lo stato `annullato` (disegnato nella mappa STATI e già incluso nel filtro dello storico) c'erano dalla 3.75 — **mancava il bottone**. Gli ordini si potevano solo ricevere, mai disdire, e i due travasati da aprile/maggio restavano lì per sempre.

### Aggiunto
- **`⛔ Annulla`** sulle card degli ordini in viaggio, accanto a "📥 È arrivato", con conferma che dice cosa succede: l'ordine resta nello storico, **le giacenze non vengono toccate** (la merce non è mai arrivata). Il vino torna disponibile in "da ordinare" senza il badge "già ordinate", perché quello conta solo gli ordini aperti.
- Guard sul ri-annullamento: senza, un secondo annullamento riscriveva `data_chiusura` e lo storico avrebbe detto che l'ordine è stato annullato oggi invece che allora.

### Lezione
Endpoint, modello e persino lo stile del badge di stato erano pronti: sembrava fatto. Vale la pena, a fine sessione, ripercorrere ogni stato del modello e chiedersi **da quale click ci si arriva** — `annullato` non era raggiungibile da nessuno.

---

## 2026-08-02 (quater) — Rinominare un distributore: completare il cascade `[core]`

Marco: *"se modifico in quella tabella, modifico anche le anagrafiche sui singoli vini?"* — chiedendo del caso "nome distributore sbagliato". Sì per `nome` e `rappresentante_nome`, no per tutto il resto. Ma provandolo sono venuti fuori due punti scoperti.

Il cascade (`sync_bottiglie_from_fornitore`) raggiunge le bottiglie **solo** via `madre_id → vini_madre.fornitore_id`. Restavano indietro:

1. **Le bottiglie orfane** — hanno `DISTRIBUTORE` scritto a mano ma nessuna madre agganciata (2 su 1275 al 2026-08-02): conservavano il nome vecchio.
2. **Gli ordini ancora aperti** — `vini_ordini.fornitore_nome` è uno snapshot e la pagina Ordini raggruppa per nome: dopo la rinomina il carrello restava intestato al nome vecchio, **separato dai suoi vini**, come due distributori distinti in colonna.

### Aggiunto
- **`vini_anagrafiche_sync.propaga_rinomina_fornitore()`**, chiamata dal `PATCH /fornitori/{id}` quando cambia il `nome`. Sistema le orfane con quel nome e riallinea gli ordini in stato `bozza`/`inviato`/`parziale`.

**Gli ordini `chiuso` e `annullato` NON vengono toccati**: sono documenti storici, devono restare con il nome che avevano il giorno in cui sono stati fatti. È la stessa ragione per cui `descrizione` e `prezzo_unit` sulle righe sono snapshot.

### Disallineamenti trovati nei dati (da sistemare a mano, 2 righe)
Bottiglie il cui `DISTRIBUTORE` non combacia col fornitore della loro madre — restano fuori da qualsiasi cascade, per costruzione, e producono un gruppo fantasma nella pagina Ordini:

| id | vino | sulla bottiglia | dalla madre |
|----|------|-----------------|-------------|
| 1034 | Franciacorta DOCG Blanc de Blanc | `Emanuele Poloni` | `Emanuele Polloni` |
| 1313 | Salento IGT Calafuria | `SOGEGROSS` | `Emanuele Poloni` |

Il primo è il doppione anagrafico già noto. Il secondo è una scelta che spetta a Marco: la Calafuria si compra da SOGEGROSS o da Poloni? Non la decide il codice.

---

## 2026-08-02 (ter) — Distributori: flag "attivo" `[core]`

Marco: *"aggiungi un flag in anagrafica sui fornitori «attivo» così posso togliere il flag a quelli inattivi da cui non sto comprando"*. In cantina restano i vini di distributori con cui non si lavora più: le loro bottiglie continuavano a comparire fra i "da ordinare" e a occupare la colonna dei fornitori, che ha 38 nomi.

### Aggiunto
- **Migrazione 160** — `vini_fornitori.attivo INTEGER NOT NULL DEFAULT 1`. Tutti i distributori esistenti nascono attivi: disattivare è una scelta esplicita, non qualcosa che decide una migrazione.
- **Interruttore in Anagrafiche → Distributori** — colonna "Attivo", un click, nessuna conferma (è reversibile). Le righe non attive restano in lista in grigio barrato: l'anagrafica è l'archivio. Nuovo KPI "Non attivi" e filtro "Solo attivi".
- **Pagina Ordini** — i distributori non attivi sono nascosti; checkbox "Mostra anche quelli non attivi" per riaverli.

### Nota di progetto
Un distributore non attivo **resta visibile nella pagina Ordini se ha un ordine ancora aperto**, in fondo alla lista e in corsivo. Nasconderlo renderebbe quell'ordine irraggiungibile da qualsiasi schermata — esattamente l'errore che i pending orfani hanno appena fatto pagare con la migrazione 159.

Un flag e non una cancellazione: i vini restano collegati al loro distributore (lo storico ordini deve restare leggibile) e riattivarlo è un click. `attivo` non è denormalizzato sulle bottiglie, quindi non fa partire il cascade sync.

---

## 2026-08-02 (bis) — Ordini ai fornitori: il modello vero, dal carrello al WhatsApp `[core]`

Marco: *"tutto, nell'ordine che ti è più semplice, iniziamo oggi finiamo oggi"*. Fatte O3, O4, O5 e O6 del piano ([modulo_vini_ordini.md](modulo_vini_ordini.md)); O2 assorbito in O6 per non costruire due volte la stessa UI; O7 rimandata su indicazione di Marco.

Da oggi **un ordine esiste come documento**: ha un fornitore, uno stato, una data di invio, delle righe con quantità ordinata e ricevuta, e non sparisce quando la merce arriva. Prima esisteva solo una riga pending per vino, cancellata alla conferma d'arrivo — di quello che era stato ordinato non restava niente.

### Aggiunto
- **Migrazione 158** — `vini_ordini` (testata: fornitore, stato `bozza/inviato/parziale/chiuso/annullato`, canale, date) + `vini_ordini_righe` (con `qta_ricevuta` per riga, che è l'unico modo di gestire un arrivo parziale). `fornitore_nome` denormalizzato e `descrizione`/`prezzo_unit` come snapshot: un ordine è un documento storico, deve restare leggibile anche se il vino viene cancellato o il listino cambia.
- **Migrazione 159** — travaso dei pending residui (2 righe) in ordini `inviato` e svuotamento della vecchia tabella. **Anticipata rispetto al piano**: vedi Note oneste.
- **`app/models/vini_ordini_db.py`** — bozza per fornitore, risoluzione del fornitore con tre livelli di fallback, ricezione atomica (riga + giacenza + movimento `CARICO` + reset `STATO_RIORDINO` + ricalcolo stato testata in una transazione sola).
- **`app/routers/vini_ordini_router.py`** (prefix `/vini/ordini`) — lettura per chiunque sia loggato, scrittura gated `is_vini_manager`.
- **Pagina `/vini/ordini`** (`OrdiniVini.jsx`, tab "📦 Ordini") — master-detail fornitore-centrica: a sinistra i distributori con quanto c'è da ordinare, a destra il fornitore scelto con da-ordinare (qta suggerita precompilata, ritmo di vendita, ricerca, filtro tipologia), carrello con totale €, invio WhatsApp, ordini in arrivo con badge "fermo da N giorni", e **storico ordini con il lead time reale** — il dato che prima non esisteva.
- **Template WhatsApp configurabile** in `vini_widget_settings` (`ordine_wa_template`, `ordine_wa_riga_template`, `ordine_wa_locale`) + soglia `ordine_fermo_alert_giorni`. Il messaggio è modificabile nel modale prima di partire.

### Modificato
- **`DashboardVini.jsx`** — i due widget sovrapposti non compongono più ordini: `openOrdine` porta alla pagina nuova, sul fornitore giusto (`?fornitore=`). Aggiunto un riepilogo cliccabile in testa. Tenere due sistemi d'ordine vivi sugli stessi vini significava poter ordinare — e caricare — due volte la stessa bottiglia.
- **`ViniNav.jsx`**, **`App.jsx`**, **`main.py`**, **`core/moduli/vini/module.json`**, **`versions.jsx`** (vini 3.74 → 3.75), **`modulo_vini.md`** (tabella endpoint).

### Note oneste
- **Il travaso dei pending (159) era pianificato per dopo, l'ho anticipato.** La review avversariale ha mostrato che la convivenza dei due sistemi era il rischio più grosso del blocco: un vino con pending aperto ha `STATO_RIORDINO='0'` e ricompariva nella lista "da ordinare" senza alcun segnale, e confermando l'arrivo da entrambe le parti la giacenza veniva incrementata due volte. Erano 2 righe e 3 bottiglie: rimandare costava più che farlo.
- **Il codice del vecchio modale ordine in `DashboardVini.jsx` è morto ma è ancora lì** (~145 righe). Toglierlo nello stesso push di due migrazioni sarebbe stato il blocco accoppiato che si è già pagato caro. Censito in [inventario_pulizia.md](inventario_pulizia.md).
- **Gli endpoint pending sono ancora senza gate di ruolo** e conferma-arrivo tocca la giacenza. La tabella ora è vuota, ma finché esistono restano l'unica scrittura non gated sulle giacenze.
- **Doppione in anagrafica**: `Emanuele Poloni` e `Emanuele Polloni` sono due fornitori distinti (20 e 27 vini). Il codice ora regge il disallineamento, ma i due vanno fusi.
- Testato end-to-end su copia del DB di produzione: bozza → invio → arrivo parziale → completamento → chiusura, con giacenze e movimenti verificati. **Nessun build** (il frontend è servito da Vite, non si compila); verifica con `@babel/parser`.

---

## 2026-08-02 — Ordini vini: piano O1–O7 + contatti distributori `[core]`

Marco: "rivediamo un attimo i riordini per fornitore, devo avere un modo per lavorarci meglio". La ricognizione ha trovato tre buchi: **non esiste il concetto di ordine** (solo una riga pending per vino, `UNIQUE(vino_id)`), **non esiste storico** (`conferma_arrivo_ordine_pending()` cancella il record quando la merce arriva), e **due widget della dashboard fanno lo stesso lavoro**. Piano completo a fasi in [`modulo_vini_ordini.md`](modulo_vini_ordini.md).

Marco ordina in due situazioni, entrambe centrate sul fornitore e non sul vino: col rappresentante davanti, o mandando un messaggio WhatsApp. Da lì l'ordine delle fasi.

### Aggiunto
- **`docs/modulo_vini_ordini.md`** — doc canonico: diagnosi, ricognizione dati, modello `vini_ordini` + `vini_ordini_righe`, fasi O1–O7, fuori scope dichiarato, 4 domande aperte.
- **Modalità contatti (O1)** in Anagrafiche > Distributori — `rappresentante_nome`, telefono ed email editabili **inline in tabella**: `Invio` salva e scende alla riga sotto, `Esc` annulla, salvataggio ottimistico con rollback. Barra di completezza e filtro "Solo senza telefono". Serve a riempire i 40 contatti in una seduta.

### Modificato
- **`app/routers/vini_anagrafiche_router.py`** — `PATCH /fornitori/{id}` non lancia più il cascade sync quando il patch tocca solo campi non denormalizzati sulle bottiglie. Del fornitore solo `nome` (→ `DISTRIBUTORE`) e `rappresentante_nome` (→ `RAPPRESENTANTE`) finiscono sulle bottiglie: patchare un telefono riscriveva comunque tutte le bottiglie di tutti i vini madre di quel distributore. Aggiunto anche il corto circuito sul PATCH a corpo vuoto.
- **`app/services/vini_anagrafiche_sync.py`** — esportata `FORNITORE_CAMPI_DENORMALIZZATI`, accanto alla funzione che la determina: il router la importa invece di riscriversela.
- **`versions.jsx`** — vini 3.73 → 3.74. **`docs/index.md`** — riga per la pagina nuova.

### Il dato che ha deciso l'ordine delle fasi
L'invio ordini via WhatsApp era fermo dal 2026-04-24 come "punto 7 differito" perché mancava il telefono del rappresentante. Il campo **esiste dalla migrazione 125** — ma la ricognizione sul DB dice **0 fornitori su 40 lo hanno compilato**. Non era più un problema di schema, era data entry: da qui O1 come prima fase invece che come rifinitura. Nella stessa ricognizione: 1273 bottiglie su 1275 risolvono `bottiglia → madre → fornitore_id` (99,8%) e tutti e 40 i distributori testuali matchano `vini_fornitori.nome`, quindi nessun lavoro di riconciliazione anagrafica prima di partire.

### Note oneste
- **Nessun build da lanciare**: il frontend in produzione è servito da Vite (`trgb-frontend`), `frontend/dist/` non è tracciato e il post-receive fa `npm install` solo se cambia `package.json`. Verifica fatta con `@babel/parser` (sintassi + identificatori non risolti); un import rotto si vedrebbe comunque solo a runtime nel browser, quindi conviene aprire la pagina Distributori subito dopo il push.
- Il telefono si salva **come lo si scrive**, non normalizzato: `buildWaLink()` normalizza già al momento dell'uso, e un numero leggibile vale più di uno canonico. La cella segnala con `⚠️` i numeri che `normalizePhone()` non sa interpretare.
- O2–O7 non sono iniziate. Le 4 domande aperte in fondo al piano vanno chiuse prima di O4 — in particolare se il totale € dell'ordine va calcolato sul listino o sul netto scontato.

---

## 2026-08-03 (ter) — Multi-reparto: chi lavora in sala e in cucina (mig 162) `[core]`

Marco: «c'è un caso particolare (io) che posso lavorare sia in sala che in cucina — prevedi la possibilità di flaggare da quel menu in modo da utilizzare in entrambi gli orari».

Il flag da solo non bastava, e il motivo è il pezzo interessante: **il foglio di un reparto mostrava i turni delle PERSONE del reparto, non i turni DEL reparto**. Il turno non sapeva dove appartenere, lo si deduceva da chi lo faceva. Con una persona in due reparti sarebbero comparsi tutti i suoi turni in entrambi i fogli, con le ore contate due volte.

La chiave era già nei dati: i tipi turno (`SALA-PRANZO`, `CUCINA-CENA`…) portano il reparto in `turni_tipi.ruolo`, che combacia con `reparti.codice`. Quindi ora il foglio filtra per il reparto **del turno**.

### Aggiunto
- **Migrazione 162** — tabella `dipendenti_reparti` con i reparti IN PIÙ (`reparto_id` resta il principale: non si duplica, due posti che dicono la stessa cosa divergono).
- **Anagrafica** — caselle "Lavora anche in", una per reparto diverso dal principale.
- **`turni_service`** — due costanti SQL condivise (`SQL_DIP_*_DEL_REPARTO`, `SQL_TURNO_DEL_REPARTO`) applicate a tutte le 8 query che dicevano `d.reparto_id = ?`: foglio settimana, vista mese, copia settimana, crea/applica template, pubblica settimana, riepilogo WhatsApp, assenze.

### Retrocompatibilità
La regola sul turno ha una rete di sicurezza: se il tipo del turno non appartiene a nessun ALTRO reparto della persona, il turno resta dove stava. Così a chi ha un reparto solo non sparisce niente dal foglio, anche se qualcuno gli aveva assegnato un turno di un altro reparto. Verificato sui dati reali: 582 turni cucina e 457 sala, nessun disallineamento.

### Verifica
Test end-to-end su copia del DB: prima Marco (cucina) con un turno di sala lo vedeva comparire **nel foglio cucina** — sbagliato, ed era così anche prima di questa modifica; dopo, compare in entrambi i fogli e il turno di sala sta nel foglio sala, quello di cucina in cucina, con i conteggi degli altri invariati.

---

## 2026-08-03 (bis) — Canale email configurabile dal gestionale `[core]`

Marco: «non possiamo configurarli dal gestionale in modo che in altre installazioni possano gestirli dalla configurazione? e scrivere dal gestionale in env?». Sì alla prima parte, no alla seconda.

**Perché non si scrive nel `.env` dall'app:** le variabili d'ambiente si leggono all'avvio, quindi ogni salvataggio richiederebbe un restart del backend — che è la finestra in cui i DB SQLite si sono già corrotti — e daremmo al processo web il permesso di riscrivere il file che contiene *tutti* gli altri segreti.

### Aggiunto
- **`app/routers/email_router.py`** (`/email/config/`, `/email/test/`, solo admin) + tab **📧 Email** in Impostazioni Sistema. Host, porta, utente, password, mittente, nome mittente e **destinatario dell'email di prova**, con il bottone che la manda davvero.
- **`email_service`** ora legge la config da `email_settings.json` nella cartella dati **del locale** — quindi ogni installazione ha la sua casella senza toccare il server — con il `.env` come fallback campo per campo: chi era già configurato così continua a funzionare.
- **Password cifrata** (Fernet, `cryptography` già presente via python-jose). La chiave sta in `TRGB_SECRET_KEY` nel `.env`: i DB e i file dati finiscono nei backup e i backup escono dalla macchina, la chiave no. Se manca, il salvataggio si rifiuta e restituisce la riga pronta da incollare. La password **non torna mai** dall'API: la UI mostra "impostata" e può solo sostituirla.

---

## 2026-08-03 — Un solo flag per gli intermittenti (mig 161) `[core]`

Marco: «in anagrafica avevamo già previsto il flag "trasmissione dati telematici" che era quello che intendevo per contratto intermittente». Due caselle per la stessa cosa prima o poi divergono, e chi resta spuntato solo di là sparisce dalle comunicazioni senza che nessuno se ne accorga.

- **Migrazione 161** — travaso `trasmissione_telematica = 1` → `intermittente = 1` (al momento 4 persone, tutte `a_chiamata` e con CF). La colonna vecchia **non viene rimossa**: niente DDL distruttivo in produzione, semplicemente non la legge né la scrive più nessuno.
- **`dipendenti.py` e `DipendentiAnagrafica.jsx`** — `trasmissione_telematica` sparisce da modello, query, payload e form. Resta la sola casella "Contratto intermittente".

Sopravvive `intermittente` e non il nome vecchio perché dice cosa *è* (contratto ex art. 15) invece del mezzo con cui lo si comunica, ed è il campo su cui girano service, checker M.F, router e documentazione.

---

## 2026-07-30 — Intermittenti: le chiamate si comunicano dai turni `[core]`

Marco: "aggiungiamo un flag intermittenti… il mattone email va fatto". Le chiamate dei lavoratori intermittenti **non venivano comunicate a nessuno**: ogni giornata omessa e' una sanzione da 400 a 2.400 EUR, e una giornata passata non e' piu' sanabile perche' la comunicazione e' per definizione preventiva.

Del tracciato XML del modello UNI-Intermittenti **non esiste alcuna specifica pubblica**: ne' XSD, ne' documentazione. E' stato ricavato dal modulo PDF del commercialista, che e' un XFA Adobe: il bottone "Genera XML e invia via email" fa `<submit format="xml">`, quindi l'allegato che parte e' il packet `datasets` dell'XFA. Struttura, formato date e regole di validazione sono documentati in [`modulo_intermittenti.md`](modulo_intermittenti.md).

### Aggiunto
- **`app/services/uni_intermittenti_service.py`** — raccoglie le giornate degli intermittenti dai turni CONFERMATO, compatta i giorni **strettamente consecutivi** in periodi (chi lavora lun-mer-ven ha tre righe: un periodo dichiarerebbe come lavorati anche i riposi), spezza in moduli da 10, genera l'XML, valida con le stesse regole del JavaScript interno del modulo, invia, archivia allegato + `.eml` con hash.
- **`app/services/email_service.py`** — mattone M.D, strato basso: SMTP da `.env`, allegati, esito come dato (non eccezione), `.eml` per la prova, email di prova.
- **`app/routers/intermittenti_router.py`** (prefix `/intermittenti`) — preview, invio con `dry_run`, registro, download allegato, annullamento, settings, configurazione lavoratori, test email. **Le righe le ricalcola sempre il server dal periodo:** il client dice quale periodo, non cosa dichiarare al Ministero.
- **`frontend/src/pages/dipendenti/Intermittenti.jsx`** + tab nella nav dipendenti + rotta `/dipendenti/intermittenti`.
- **Checker M.F `intermittenti_non_comunicati`** — avvisa se un turno di intermittente entro 48h non e' comunicato. E' questo, piu' dell'invio, che protegge dalla sanzione.
- **Migrazione 156** — `dipendenti.intermittente` (flag NUOVO: `a_chiamata` significa gia' "extra del turismo pagato a ore", riusarlo sarebbe stato semantic drift), `dipendenti.codice_comunicazione`, `dipendenti_uni_comunicazioni` + `_righe`, seed settings e `alert_config`.

### Modificato
- **Configurazione spostata in Impostazioni** (richiesta di Marco): i dati del datore, il destinatario e lo stato SMTP stanno in **Impostazioni → Intermittenti** (`DipendentiImpostazioni.jsx`, nuova sezione in sidebar); il **flag intermittente, il codice fiscale e il codice comunicazione sono in Anagrafica**, sulla scheda del dipendente. La pagina Intermittenti resta con due schede: da comunicare e registro.
- **`app/routers/dipendenti.py`** — il modello e le query dell'anagrafica ora portano `codice_fiscale`, `intermittente`, `codice_comunicazione`. Nell'UPDATE i due campi testo usano `COALESCE(?, colonna)`: un form che non li manda **non deve azzerare** il CF popolato dal parser cedolini. Rimossi `PUT /intermittenti/lavoratori/{id}` e `set_lavoratore()`: quei campi hanno un solo scrittore, l'anagrafica.
- **`versions.jsx`** — dipendenti 2.29 -> 2.30. **`architettura_mattoni.md`** — M.D da DA FARE a PARZIALE.

### Note oneste
- Il **formato delle date** (`DD/MM/YYYY`) e' dedotto dal `bind picture` del modulo, non letto in una specifica: resta un setting (`uni_formato_data`). Se il consulente segnala comunicazioni non acquisite, e' il primo sospettato.
- Il Ministero **non manda ricevute**: l'unico riscontro possibile e' farsi confermare dal consulente che le comunicazioni risultino acquisite. Primo mese in doppio binario.
- I moduli PDF in circolazione puntano ancora a `intermittenti@mailcert.lavoro.gov.it`, sostituito dal 1/6/2015 da `intermittenti@pec.lavoro.gov.it`. Per questo il destinatario e' configurabile.
- **Prima dell'uso vero serve la verifica col consulente** che quelle persone abbiano davvero un contratto intermittente: se sono extra del turismo la comunicazione non e' dovuta.
- Trappola incontrata: il primitivo `TextInput` passa a `onChange` **il valore, non l'evento**, ed e' un input controllato (`defaultValue` non funziona). La pagina e' stata corretta di conseguenza.

---

## 2026-07-27 — La Lavagna: il widget Bacheca diventa un briefing di servizio `[core]`

Marco: "la bacheca non viene utilizzata, ripensiamo al suo uso". Diagnosi: era l'unico blocco della Home che richiedeva lavoro umano per riempirsi, in mezzo a card che si riempiono da sole; per pubblicare servivano 5 campi in `/comunicazioni`. Restava vuota → nessuno la guardava → nessuno ci scriveva. In più Marco ha confermato che **la Home non la apre nessuno con regolarità**, quindi il widget da solo non bastava.

### ➕ Aggiunto
- **`app/services/lavagna_service.py`** (servizio platform) — compone il briefing del turno corrente: lede in italiano (coperti/tavoli/fascia di picco), tavoli da segnalare (allergie, occasioni, gruppi ≥8, note), selezioni del giorno, chi è in turno, task aperti, eventi di oggi, testo pronto per WhatsApp. Ogni query è difensiva: se un DB non risponde sparisce il blocco, non la Home. **Non ricalcola selezioni e alert: glieli inietta `dashboard_router`**, così la dipendenza resta router → service (CLAUDE.md §2).
- **`GET /dashboard/lavagna`** — endpoint separato da `/dashboard/home` di proposito: la Lavagna si ricarica da sola quando si scrive la nota, senza rifare tutta la Home.
- **`GET/POST/DELETE /comunicazioni/nota`** — la "nota di servizio": una riga, niente form. Dichiarate **prima** di `/{com_id}`, altrimenti FastAPI leggerebbe `nota` come id.
- **`frontend/src/components/widgets/Lavagna.jsx` + `hooks/useLavagna.js`** — tre strati in una card: nota del turno (gialla, in cima), briefing auto, eventi. Bottone "Copia" per il gruppo staff.

### 🔧 Modificato
- **`Home.jsx` v9.3** — la Lavagna prende il posto della Bacheca; **la card "⚠️ Attenzione" è stata assorbita** (gli alert scorrono nello strato eventi: erano un doppione nella stessa colonna). Rimossi gli helper rimasti orfani.
- **`DashboardSala.jsx` v5.3** — stessa sostituzione. **Qui conta più che nella Home:** con ruolo `sala` l'utente atterra su questa pagina e la Home non la vede mai. In sola lettura (`isAdmin={false}`): briefing e nota si vedono, il campo di scrittura no.
- **`notifiche_db.py`** — soft-migration `ADD COLUMN` idempotente su `comunicazioni`: `tipo` ('bacheca' | 'nota_servizio'), `data_riferimento`, `turno`. Nessuna migrazione già girata è stata toccata.
- **`notifiche_service.py`** — tutte e tre le query della bacheca classica ora filtrano `COALESCE(tipo,'bacheca') = 'bacheca'`, così le note non inquinano `/comunicazioni` né il contatore dei non letti.
- **`versions.jsx`** — home 3.6 → 3.7.

### ⚠️ Nota onesta
Il bottone "Copia" **non invia**: i link `wa.me` del mattone M.C non funzionano sui gruppi. Prepara il testo negli appunti, l'invio nel gruppo resta manuale.

### File
`app/services/lavagna_service.py` (nuovo), `frontend/src/components/widgets/Lavagna.jsx` (nuovo), `frontend/src/hooks/useLavagna.js` (nuovo), `app/models/notifiche_db.py`, `app/services/notifiche_service.py`, `app/routers/dashboard_router.py`, `app/routers/notifiche_router.py`, `frontend/src/pages/Home.jsx`, `frontend/src/pages/DashboardSala.jsx`, `frontend/src/config/versions.jsx`.

---

## 2026-07-25 — Docs: verifica contenuti vs codice, Blocco 1 `[core]`

Primo blocco della verifica sistematica dei doc modulo contro il codice (il codice fa fede). ~60 discrepanze corrette in 6 doc, tutte con riferimento file:riga.

### 🐞 Risolti (nei docs)
- **modulo_menu_carta.md** dichiarava il modulo "PROPOSTA, niente codice": è in produzione da mesi. Riscritte tabelle endpoint reali, sezione dolci, mig 098, route FE.
- **modulo_controllo_gestione.md**: stati pagamento pre-refactor ovunque, endpoint rimossi documentati attivi, riconciliazione documentata "FUTURO" ma implementata, ~40 endpoint aggiunti.
- **modulo_vendite.md**: prefix /admin/finance/shift-closures corretto su 11 endpoint (chiude gap CRIT-3/DH.4), versioni e logica chiusure allineate.
- **modulo_vini.md (+widget)**: versioni 3.67→3.72, bug chiusi dichiarati aperti, ~25 endpoint mancanti, payload e route corretti. **modulo_pranzo.md**: allineamenti minori.
- Tutti con "Ultima verifica: 2026-07-25 (vs codice)"; zone non verificabili dichiarate nell'header (stato "parziale").

### File
6 × `docs/modulo_*.md`, `docs/sessione.md`, `docs/changelog.md`.

---

## 2026-07-24 — Docs → wiki: index, convenzioni, conversione, lint, archivi `[core]`

Da discussione sul modello "LLM wiki" di Karpathy, adattato: per TRGB il problema dei docs è navigabilità e coerenza, non accumulo.

### ➕ Aggiunto
- **`docs/index.md`** — home del wiki: catalogo completo di `docs/` per argomento.
- **`docs/convenzioni_wiki.md`** — 3 tipi di pagina + 4 regole (home, un fatto una pagina, link relativi, header di stato); adozione opt-in; regola log ~3 mesi.
- **`scripts/docs_lint.py`** — lint del wiki (link rotti, pagine fuori index), solo stdlib. Hook warning-only nel Guardiano L1 di `push.sh` (primo pezzo di DH.7). Al primo giro: 4 link rotti veri trovati e fixati in sessione.md.
- **Archivi log:** `docs/archive/sessione_archivio_59.md` (sessioni ~39→59) e `docs/archive/changelog_archivio_2026-04.md` (rilasci dic 2025–apr 2026).

### 🔧 Modificato
- **14 pagine convertite al formato wiki** (header di stato + ~150 link): roadmap, refactor_monorepo, architettura_*, stack_tecnico, database, deploy, stato_pagamento_unificato, GUIDA-RAPIDA, controllo_design, checklist_visione_insieme, inventario_pulizia, styleguide.
- **`docs/styleguide.md`** ora canonica per la palette TRGB-02 (sanata duplicazione/contraddizione `bg-neutral-100` vs `bg-brand-cream`); `CLAUDE.md` tiene link + minimo operativo.
- **`docs/readme.md`** — §9 moduli a tabella con link; §12 → link a index.md.
- **`docs/sessione.md` / `docs/changelog.md`** — snelliti a ~3 mesi vivi (500→250KB / 700→200KB).

### File
`docs/index.md`, `docs/convenzioni_wiki.md`, `scripts/docs_lint.py`, `push.sh`, `CLAUDE.md`, `docs/readme.md`, 14 pagine docs, 2 file archivio, `docs/sessione.md`, `docs/changelog.md`.

---

## 2026-07-20 — Vini: Vista Sommelier v2.0 "banco di servizio" (V.22) `[core]`

Ripensamento completo di `/vini/carta-staff` (Marco: "rivediamone il senso, così è inutilizzata"): da elenco read-only a pagina operativa del servizio. Chiude il task V.22 / #136 della roadmap.

### ➕ Aggiunto
- **`CartaStaff.jsx` v2.0** — due modalità:
  - **Preparazione** (pre-turno): checklist client-side sui dati live — "Ultima bottiglia" (ancora in carta: al primo tavolo finisce), card secondaria "Esauriti — già usciti dalla carta" (a 0 bt il filtro min_qta_stampa li nasconde già da carta/QR → solo promemoria riordino), "Calici di stasera" (mescite aperte, chiudibili inline), "Frigo da rifornire" (vini da calice/mescita con frigo ≤ 2 e stock altrove, con indicazione da dove prendere).
  - **Servizio**: ricerca e filtri come prima, ma ogni riga ha la locazione in evidenza ("📍 prendi da") e azioni one-tap: **Vendi −1** (movimento VENDITA dalla locazione scelta — diretta se unica, picker inline se multiple — annullabile per 10s via toast) e **toggle mescita 🥂**. Nome vino → scheda bottiglia v2.
- **`vini_magazzino_router.py`** — `GET /carta-staff/`: ogni voce di `locazioni[]` ora include `slot` (frigo|loc1|loc2|loc3), la chiave che il frontend passa a `POST /{id}/movimenti`. Campo additivo, nessun consumer esistente impattato.

### Note tecniche
- Nessun endpoint nuovo: la pagina riusa movimenti (VENDITA + DELETE per undo, delta inverso già gestito dal 3.62/3.71) e `PATCH /{id}/bottiglia-aperta` (già aperto a sala).
- **Vendita da loc3/matrice volutamente esclusa** dal one-tap (decrementerebbe QTA_LOC3 senza svuotare `matrice_celle` → drift): se lo stock è solo in matrice il bottone porta alla scheda con MatricePicker.
- Auto-refresh 60s, in pausa mentre il toast-undo è visibile.

### File
`frontend/src/pages/vini/CartaStaff.jsx` (riscritto), `app/routers/vini_magazzino_router.py`, `frontend/src/config/versions.jsx` (vini 3.71 → 3.72), `docs/modulo_vini.md`, `docs/roadmap.md` (V.22 chiuso).

---

## 2026-07-19 — Task Manager: self-heal schema tasks.sqlite3 (mig 155) + init blindato `[core]`

Scoperto generando i MEP del menu Estate 2026: il generatore andava in 500 con `table checklist_template has no column named livello_cucina`.

### 🐞 Risolti
- **Schema drift su `tasks.sqlite3` di produzione**: il DB vivo in `locali/tregobbi/data/` NON è il file storico passato dalle migrazioni 084→088 — è stato **ricreato da zero da `init_tasks_db()`** (schema pre-088, quasi certamente nel giro dell'incidente S60-INC1 di inizio maggio: il file non fu spostato da `app/data/` e l'init ne creò uno nuovo nel path canonico). La 088 (`livello_cucina`) è marcata applicata → non rigira mai. Ogni INSERT con `livello_cucina` esplodeva: generatore MEP carta **e** creazione template da UI (`POST /tasks/templates`), rotta silenziosamente da maggio.
- **Migrazione `155_selfheal_tasks_schema.py`** `[core]`: self-heal idempotente (PRAGMA check + ADD COLUMN + indice) di `livello_cucina` su `checklist_template`, `checklist_instance`, `task_singolo` — stessa semantica della 088, sul path canonico.
- **`tasks_db.py` v1.3**: init difensivo allineato allo schema post-088 (colonne nel CREATE) + blocco self-heal post-CREATE con mappa `HEAL_COLUMNS` — se in futuro l'init ricrea un DB, converge comunque allo schema pieno.

### ⚠️ Perdita dati constatata (non recuperabile)
Il tasks.sqlite3 vivo ha **0 template**: i 5 MEP fissi della mig 097 e le checklist HACCP configurate ad aprile sono persi (retention backup 48h/7gg ampiamente superata). Censito in `problemi.md` TASKS-1. I MEP di carta si rigenerano dal bottone dell'edizione Estate 2026; i MEP fissi/HACCP eventualmente da ricreare a mano o re-importare dal docx.

### File
`app/migrations/155_selfheal_tasks_schema.py` (nuova), `app/models/tasks_db.py`.

---

## 2026-07-19 — Menu Carta: edizione Estate 2026 in carta `[locale:tregobbi]`

Marco ha portato il PDF del menu estivo (`menulugagoset2026web.pdf`, lug-ago-set 2026). Seed completo via migrazione, come per la Primavera 2026. (Sezione riscritta: era stata sovrascritta da una sessione parallela — il codice era già nel push `b8c96816`.)

### ➕ Aggiunto
- **Migrazione `154_seed_menu_estate_2026.py`** (`TRGB_SPECIFIC`, idempotente): crea **20 ricette skeleton nuove** (4 antipasti, 5 primi, 5 secondi, 1 contorno, **5 dolci** — solo name/menu_name/descrizione/prezzo, niente recipe_items: le grammature le rifinisce Marco dal modulo Ricette), archivia Primavera 2026, crea edizione **"Estate 2026" `in_carta`** (1/7 → 30/9) con 44 publications (36 da ricetta + 8 documentali) e le 2 degustazioni aggiornate ("Prima volta" 60 con Coniglio o Guancetta a scelta; "Fidati dell'oste" 75 con Battuta, Cozze in blu, Risotto all'albicocca, Anatra).
- Prezzi ritoccati: Vitello tonnato **20→22**, Ossobuco **24→26**, Tè e tisane **8→10**. Rinominati in carta via `titolo_override` (ricette invariate): "I salumi misti dell'osteria", "Fettuccine all'Alfredo se fosse nato a Bergamo".
- Fuori carta (restano in archivio primavera): Tegamino asparagi, Tartare dell'Oste, selezioni formaggi, Risotto Vignarola, Lasagnetta, Pasta mista sarda, Trippa, Faraona, Filetto Donizetti, Brasato, Arrosto di coniglio e agretti.

### Note
- ⚠️ Allergeni dei piatti nuovi dichiarati solo dove evidenti — **da verificare da app** (Battuta e Solero lasciati vuoti).
- Verificato in produzione: `/menu-carta/public/today` serve Estate 2026 completa di tutte le sezioni.
- Docs: `locali/tregobbi/seeds/MIGRATIONS_TRGB.md` aggiornato con la 154.

### File
`app/migrations/154_seed_menu_estate_2026.py` (nuova), `locali/tregobbi/seeds/MIGRATIONS_TRGB.md`, `frontend/src/config/versions.jsx` (menuCarta 1.1 → 1.2).

---

## 2026-07-19 — Menu Carta: nuova sezione "Dolci" `[core]`

Il menu Estate 2026 introduce per la prima volta i dolci in carta: la sezione non esisteva nel modulo (la primavera non li archiviava).

### ➕ Aggiunto
- **`menu_carta_router.py` v1.2**: `'dolci'` in `SEZIONI_VALIDE`, nei 3 CASE SQL di ordinamento sezioni (dettaglio edizione, PDF, preview), in `PDF_SEZIONI_ORDER` (tra Contorni e Bambini) e in `SEZIONE_TO_PARTITA` (partita MEP "Dolci").
- **`MenuCartaDettaglio.jsx` v1.4**: `{ key: "dolci", label: "Dolci" }` in `SEZIONI_ORDER` → la sezione appare in tab Sezioni, Anteprima e nel select della modale pubblicazione.

### Note
- Nessuna migrazione schema: `sezione` è TEXT libero, la validazione era solo applicativa.

### File
`app/routers/menu_carta_router.py`, `frontend/src/pages/cucina/MenuCartaDettaglio.jsx`.

---

## 2026-07-19 — Rettifica preconti marzo–luglio (solo dati VPS) `[locale:tregobbi]`

Troppi preconti registrati nelle chiusure turno: rettifica massiva mantenendo le quadrature.

### 🔧 Dati
- **113 preconti rettificati/eliminati su 95 chiusure** (2/3 → 17/7), riduzione totale **€12.082**: per ogni chiusura, `shift_preconti` ridotti/cancellati e `contanti` + `totale_incassi` abbassati dello stesso delta → differenza di quadratura invariata su tutte le chiusure. Preconti rimasti: 169 per €17.544 (erano 210+ per €30.406).
- Eseguito con `scripts/rettifica_preconti_2026-07.py` (nuovo, in repo): dry-run default, `--apply` con backup WAL-safe (`admin_finance.sqlite3.prev-rettifica-preconti-20260719-122719` sul VPS), validazione id+importi contro il DB vivo, transazione unica. Nessun restart backend.

### Note
- Il 1° dry-run sul VPS ha intercettato 4 id non più esistenti: il salvataggio di una chiusura dalla UI fa DELETE+reinsert dei preconti → id rigenerati. 3 rettifiche erano già state fatte a mano, la quarta è stata rimappata sul nuovo id.

---

## 2026-07-18 — Vini 3.71: fix RETTIFICA fantasma da modifica giacenze + qta assoluta `[core]`

Marco: "oggi sono state caricate delle bottiglie tramite la giacenza, ma non crea il movimento". Credeva fosse il bug 3.62 tornato — è un **secondo bug, presente dal commit iniziale (dic 2025)** e mai visto prima perché mascherato.

### 🐞 Risolti
- **RETTIFICA fantasma dal PATCH giacenze** (`vini_magazzino_db.py` + `vini_magazzino_router.py`): il router aggiorna PRIMA le giacenze (`update_vino` → `_recalc_qta_totale`) e POI chiama `registra_movimento(RETTIFICA, qta=qta_dopo)`. Ma `registra_movimento` calcola il delta contro la giacenza letta dal DB **in quel momento** — che è già quella nuova → `delta = 0` → l'INSERT del movimento veniva saltato dal guard `if delta != 0`, **senza eccezione e senza warning** (per questo il journalctl era muto: il fix 3.62 loggava solo le eccezioni, qui non ce n'era). Fix: nuovo parametro `qta_precedente` in `registra_movimento`; il router passa `qta_prima` come baseline esplicita del delta. Il fix 3.62 (ValueError su qta=0) resta valido — questo era il livello sotto.
- **Qta RETTIFICA salvata come |delta| invece che assoluta** (`registra_movimento`, INSERT): veniva salvato `abs(delta)` per tutti i tipi, ma tutto il resto del codice interpreta la qta di una RETTIFICA come **valore assoluto nuovo** (replay `giacenza_storica_vino`: `g := qta`; replay conservativo in `delete_movimento`: `qta_tot = q`). Una rettifica 10→7 dal form movimenti salvava qta=3 e il replay la rileggeva come "giacenza := 3". Ora per RETTIFICA si salva `nuova_qta` (assoluto); per CARICO/SCARICO/VENDITA `abs(delta)` == qta passata, invariato.

### Note
- Il movimento delle bottiglie caricate oggi **non è recuperabile automaticamente** (mai scritto su DB): se serve traccia, registrare a mano una RETTIFICA o un CARICO dal form movimenti della scheda vino.
- Le RETTIFICHE storiche fatte dal form movimenti (POST) hanno qta=|delta| nel DB → il replay giacenza-storica le interpreta male, ma la calibrazione automatica (3.62) maschera il drift. Non migrate: non distinguibili a posteriori con certezza.
- Restano DUE percorsi che cambiano giacenza **senza** movimento, per design attuale: assegnazione/rimozione **celle matrice** (`matrice_assegna_cella`/`rimuovi`/`set-celle` → QTA_LOC3) e **creazione nuova annata** con giacenze iniziali (wizard V2 / POST bottiglia — nessun CARICO iniziale). Se si vuole tracciarli, è un intervento separato → segnalato in `problemi.md`.
- Test: suite locale su DB isolato (7 test: PATCH-flusso, rettifica assoluta, no-op, CARICO invariato, azzeramento 3.62, replay drift=0, compile).

### File
`app/models/vini_magazzino_db.py`, `app/routers/vini_magazzino_router.py`, `frontend/src/config/versions.jsx` (vini 3.70 → 3.71).

---

## 2026-07-18 — Carta Bevande: Tè e Tisane caricati + import testo con textarea `[core]`

Marco porta la lista del fornitore di tè e tisane (spunte = presenti in casa). Pulita, prezzata e caricata in carta via "📋 Importa da testo".

### 🔧 Migliorato
- **`CartaSezioneEditor.jsx` v1.3-panel — `importColumns`**: incluse anche le colonne textarea (descrizione/ingredienti/abbinamenti), esclusa solo `note_interne`. Prima l'import testo di tè/tisane perdeva descrizioni e ingredienti (textarea filtrate via — il backend `bulk-import` le accettava già). Colonne birre invariate (le prime 6 restano identiche). ⚠️ Il fix è partito dentro il push `3a8b774c` (audit dropdown) che NON lo cita nel messaggio — annotato qui per tracciabilità.

### 📦 Dati caricati (sezioni Tisane e Tè)
- **7 tisane** con categoria (anti-stress/digestiva/dopo pasto/calmante) e ingredienti.
- **12 tè** con tipologia (nero/verde/oolong/rosso), descrizione e paese. Esclusi dalla lista fornitore: English Breakfast e Gyokuro Okabe (non presenti), Nearly Grey (finito); dedup del doppione Sun Rouge. Refusi corretti (Shizuoka, Fukuroi, Tokushima→Tokunoshima).
- **Prezzo 10 € su tutte le voci** (deciso da Marco). Milky Oolong e Lapsang Souchong senza paese (assente in origine).

### File
`frontend/src/pages/vini/CartaSezioneEditor.jsx`.

---

## 2026-07-18 — Dropdown header: audit voci mancanti vs sub-nav dei moduli `[core]`

Marco: "controllo menu a discesa, a me sembra che manchino dei tasti". Audit completo `modulesMenu.js` vs le sub-nav di tutti i 12 moduli e vs le route in `App.jsx`: 5 pagine reali erano raggiungibili dalla nav del modulo ma assenti dal menu a discesa dell'header (e dalla Home, che usa lo stesso config).

### 🐞 Risolti (voci mancanti nel dropdown)
- **Vini**: aggiunte "Sommelier" (`/vini/carta-staff`) e "Anagrafiche" (`/vini/anagrafiche`, solo admin).
- **Acquisti**: aggiunta "Pro-forme" (`/acquisti/proforme`, solo admin — sub-key già in modules.json).
- **Controllo Gestione**: aggiunta "Batch" (`/controllo-gestione/batch-pagamenti`) e riallineato l'ordine delle voci a quello di `ControlloGestioneNav` (Utenze → Batch → Riconciliazione).
- **Statistiche**: aggiunta "Prodotti" (`/statistiche/prodotti`).

### 🔧 Migliorato
- **`modules.json`**: nuova sub-key `vini.anagrafiche` (superadmin/admin) così la voce non compare a sala/sommelier — la route è comunque protetta da `sub=settings`. Nessun'altra modifica ai permessi.

### Note
- Nessun bump versione: solo allineamento menu, zero logica.
- Incoerenza preesistente NON toccata: `ViniNav` mostra "Anagrafiche" anche a sommelier, ma la route `/vini/anagrafiche` è protetta da `sub=settings` (solo admin) → per il sommelier il tasto in nav resta un vicolo cieco. Da decidere con Marco se aprire ai sommelier o nascondere in nav.
- `modules.json` contiene ancora la sub-key `controllo-gestione.confronto` (pagina rimossa, route ora redirect) — innocua, lasciata.

### File
`frontend/src/config/modulesMenu.js`, `app/data/modules.json`.

---

## 2026-07-18 — Sotto-categorie bevande gestibili da Impostazioni, zero hardcode (vini 3.70) `[core]`

Richiesta Marco: "stai facendo queste modifiche hardcoded, forse gestire le sotto-categorie nelle impostazioni avrebbe senso". Fonte di verità unica: le options del select tipologia nello schema_form della sezione — l'ordine delle options È l'ordine dei gruppi in carta.

### ✨ Aggiunto
- **`PUT /bevande/sezioni/{key}/tipologie`** (bevande_router v1.3): riceve {options, renames}. Rinomina propagata alle voci (`UPDATE bevande_voci`), eliminazione bloccata con 409 se la tipologia è usata (guardia PRIMA di ogni scrittura). Validazioni: no vuoti, no duplicati, rename coerenti.
- **`TipologieBevEditor.jsx`** (nuovo, components/vini): blocco "Sotto-categorie" in Impostazioni → Ordinamento Carta — riordino ▲▼, rinomina ✏️ (con badge "era: X"), elimina 🗑️, aggiungi; un pannello per ogni sezione con select tipologia (Distillati, Tè). Integrato in ViniImpostazioni v3.4.

### 🔧 Migliorato
- **`carta_bevande_service.py` v1.3**: `_render_tabella_4col` prende `tip_order` da `tipologie_order_from_sezione()` (nuovo helper) — eliminata la costante `_TIP_ORDER` hardcoded di stamattina.
- **`CartaClienti.jsx` v2.5**: ordine gruppi da `sezione.tipologie_order` nel payload (aggiunto da vini_router a `/carta-cliente/data`) — eliminata `TIPOLOGIA_ORDER` hardcoded.
- Bump vini 3.69 → 3.70.

### File
`app/routers/bevande_router.py`, `app/routers/vini_router.py`, `app/services/carta_bevande_service.py`, `frontend/src/pages/public/CartaClienti.jsx`, `frontend/src/pages/vini/ViniImpostazioni.jsx`, `frontend/src/components/vini/TipologieBevEditor.jsx` (nuovo), `frontend/src/config/versions.jsx`.

---

## 2026-07-18 — Carta: tabella_4col per tipologia + tipologie Gin/Vodka + prezzo_label nel form distillati (mig 153, vini 3.69) `[core]`

Approvato da Marco dopo il caricamento dei 29 distillati: la pagina React pubblica raggruppava la tabella per REGIONE (gruppi geografici che frammentavano grappe e whisky), mentre il PDF/HTML backend raggruppava già per tipologia ma in ordine alfabetico ("Altro" apriva la carta).

### 🔧 Migliorato
- **`CartaClienti.jsx` v2.4 — `BevTabella4Col`**: raggruppa per tipologia con ordine canonico `TIPOLOGIA_ORDER` (Grappa → Rum → Whisky → Cognac → Altro); sezioni senza tipologia (Amari & Liquori) → tabella piatta senza header, regione resta come colonna di riga.
- **`carta_bevande_service.py` v1.2 — `_render_tabella_4col`**: stesso ordine canonico `_TIP_ORDER` al posto dell'alfabetico. ⚠️ Le due costanti vanno tenute allineate tra loro e con le options del seed distillati (`bevande_db.py`).
- Bump vini 3.68 → 3.69.

### ✨ Aggiunto (stessa giornata, per caricare gin e vodka)
- **Mig 153** (`153_distillati_gin_vodka_prezzo_label.py`): aggiorna `schema_form` della sezione distillati nel DB vivo — options tipologia +Gin +Vodka (dopo Whisky) e campo `prezzo_label` ("Prezzo in carta", testo) dopo `prezzo_eur`. Idempotente; apre bevande.sqlite3 (pattern mig 152). La colonna DB e la precedenza nei renderer esistevano già: mancava solo dal form.
- **`bevande_db.py` v1.3**: stesse modifiche nel seed per i DB nuovi.
- **Ordine gruppi carta**: Grappa → Rum → Whisky → Gin → Vodka → Cognac → Altro (aggiornati `_TIP_ORDER` BE e `TIPOLOGIA_ORDER` FE, da tenere allineati).
- Con `prezzo_label` l'import testo dei distillati passa a 6 colonne (tipologia, regione, produttore, nome, prezzo €, prezzo in carta) — usato per il doppio prezzo dei gin "liscio 8 · G&T 11".

### File
`frontend/src/pages/public/CartaClienti.jsx`, `app/services/carta_bevande_service.py`, `frontend/src/config/versions.jsx`, `app/models/bevande_db.py`, `app/migrations/153_distillati_gin_vodka_prezzo_label.py` (nuova).

---

## 2026-07-18 — Carta Bevande: fix crash form distillati (React #31) + import testo con tipologia `[core]`

Marco apriva "Nuova voce" nella sezione Distillati e la pagina crashava (React error #31).

### 🐞 Risolti
- **`FormDinamico.jsx` v1.3**: le options dei select possono essere oggetti `{value, label}` (seed distillati/tè in `bevande_db.py`) oltre che stringhe; prima l'oggetto veniva renderizzato come child React → crash. Ora `optValue`/`optLabel` normalizzano entrambi i formati. ⚠️ Fix incluso nel push `695e6270` il cui messaggio di commit non lo cita.

### ✨ Aggiunto
- **`CartaSezioneEditor.jsx` v1.2-panel** (push `c1930519`): l'import testo include anche le colonne select (es. tipologia) — prima il bulk-import creava voci senza tipo, da correggere una per una. Il valore incollato deve combaciare col `value` delle options.
- **Contenuti**: caricate via import 29 voci in sezione Distillati (17 whisky + 12 grappe) con prezzi a dose 40 ml da ricerca di mercato (fascia osteria, coeff. ~3-3,5 su retail; ridotto per rarità Moon Import / G&M fuori catalogo).

### File
`frontend/src/components/vini/carta/FormDinamico.jsx`, `frontend/src/pages/vini/CartaSezioneEditor.jsx`.

---

## 2026-07-17 — Utenze: fix multi-layout + 4 forniture + ri-analisi (CG 2.21) `[core]`

Marco ha caricato tutte le 16 bollette 2026: emerse **4 forniture** (non 2) — luce ristorante, luce secondaria POD ...128 (3 kW, consumo zero, solo quota fissa), gas cucina, gas secondario — e 2 varianti di layout che il parser non gestiva. Fix validati su tutti e 16 i PDF: **16/16 puliti** (le 3 bollette a consumo zero portano una sola nota esplicativa).

- **Parser**: le sezioni "Informazioni storiche" / letture / Box Offerta si cercano per marker su tutte le pagine, non più a pagina fissa (lo storico gas scivola su p4 nelle bollette lunghe → era il grosso dei "campi non trovati"); riga "Stimata" assente nello storico gas = zeri impliciti, niente warning; bollette a consumo zero → i warnings fisiologici (niente Box Offerta/storico/prezzi) collassano in una nota unica.
- **Router**: `POST /bollette/{id}/riparse` — ri-analizza il PDF archiviato e aggiorna bolletta+fornitura+serie (per completare gli import fatti col parser vecchio senza cancellare/ricaricare).
- **FE**: grafici per FORNITURA (etichettati col POD/PDR) invece che per tipo — con 2 luci le serie si sovrascrivevano; bottone 🔄 per bolletta + "🔄 tutte" in testata tabella; ⚠️ con tooltip warnings per riga.

Test e2e in sandbox: 16 conferme, 2 duplicati respinti, riparse su tutte, 4 forniture in dashboard, 192 righe serie, copertura lug 2024 → giu 2026.

### File
`app/services/utenze_parser.py`, `app/routers/cg_utenze_router.py`, `frontend/src/pages/controllo-gestione/ControlloGestioneUtenze.jsx`.

---

## 2026-07-17 — Analisi Utenze U3+U4: pagina FE + alert (mig 152, CG 2.21) `[core]`

Completa il modulo Analisi Utenze (spec `docs/spec_utenze.md`): ora ha l'interfaccia e gli alert. Chiude U3+U4.

- **Pagina** `ControlloGestioneUtenze.jsx` (M.I primitives, route `/controllo-gestione/utenze`, tab 💡 in nav CG + voce nel menu moduli): upload/drag&drop PDF → modal preview con campi estratti e warnings → conferma; card KPI per fornitura (€/kWh–€/Smc all-in, consumo e spesa annua, countdown scadenza condizioni rosso sotto 60gg, % stimato gas, potenza max vs impegnata, formula indice+spread); grafici Recharts (luce stacked F1/F2/F3, gas rilevato/stimato, potenza max mensile con ReferenceLine sulla impegnata); tabella bollette con link 🔗 alla fattura in Acquisti.
- **Backend**: nuovo `GET /controllo-gestione/utenze/bollette` (elenco per la tabella).
- **Alert M.F** (2 checker in `alert_engine.py`): `utenze_scadenza_condizioni` (preavviso rinegoziazione, default 60gg, urgente sotto 14; include condizioni già scadute) e `utenze_consumi_stimati` (ultima bolletta gas con stimato > soglia %, default 30% → "fai l'autolettura"). Soglie e canali in `alert_config` (Impostazioni → Notifiche), **niente hardcode**; per `utenze_consumi_stimati` il campo `soglia_giorni` è interpretato come percentuale (interpretazione per-checker prevista dallo schema).
- **Mig 152**: seed `alert_config` per i 2 checker (60 / 30, antidup 168h) — idempotente, apre notifiche.sqlite3.
- Bump controlloGestione 2.20 → 2.21.

### File
`frontend/src/pages/controllo-gestione/ControlloGestioneUtenze.jsx` (nuovo), `ControlloGestioneNav.jsx`, `App.jsx`, `modulesMenu.js`, `versions.jsx`, `app/routers/cg_utenze_router.py`, `app/services/alert_engine.py`, `app/migrations/152_alert_config_utenze.py` (nuova).

---

## 2026-07-17 — Analisi Utenze U1+U2: parser bollette A2A + serie storica (mig 151) `[core]`

Nuovo sub-modulo di Controllo di Gestione (spec `docs/spec_utenze.md`, approvata da Marco in giornata): upload del PDF bolletta A2A (luce e gas) → parser → serie storica consumi/costi + KPI. Layer di sola analisi: la contabilità resta su `fe_fatture` (zero doppio conteggio nel CE). Validato sui 2 PDF reali di Tre Gobbi (luce giu 2026, gas apr-mag 2026) con zero warnings.

- **Parser** `app/services/utenze_parser.py` (pattern elab_parser: non scrive DB, ritorna dati+warnings+sha256): autodetect LUCE/GAS, scontrino energia (€/kWh–€/Smc, split vendita/rete, quote fisse/potenza, accise), Box Offerta (indice PUN/PSVDA + spread + scadenza condizioni), fasce F1/F2/F3, letture gas rilevate/stimate, cos(φ), **storico 18 mesi** e potenza mensile 12 mesi presenti in ogni bolletta.
- **Mig 151**: `cg_utenze_forniture` / `cg_utenze_bollette` / `cg_utenze_consumi_mensili` (UNIQUE fornitura+mese+fascia, upsert "vince la bolletta più recente").
- **Router** `app/routers/cg_utenze_router.py` (`/controllo-gestione/utenze`): `/upload` (preview, archivia PDF in `locali/<id>/data/uploads/utenze/`), `/conferma` (upsert fornitura + insert bolletta + serie + aggancio automatico a `fe_fatture` via numero bolletta, con retro-aggancio dei pregressi), `GET /` dashboard KPI (€/unità all-in, % stimato gas, giorni a scadenza condizioni, potenza max 12m), `GET /consumi`, `GET`/`DELETE /bollette/{id}`.
- Registrato in `main.py` + `core/moduli/controllo_gestione/module.json` (R8).

Prossime fasi: U3 pagina FE (tab Utenze in CG), U4 checker M.F (rinegoziazione condizioni 30.11.2026, autolettura gas se stimato >30%).

### File
`app/services/utenze_parser.py`, `app/migrations/151_cg_utenze.py`, `app/routers/cg_utenze_router.py`, `main.py`, `core/moduli/controllo_gestione/module.json`, `docs/spec_utenze.md`.

---

## 2026-07-17 — Cantina v2: le madri mostrano sempre tutte le annate (vini 3.68) `[core]`

Fix segnalazione Marco: bottiglia 1181 (Lugana I Frati 2024, giacenza 0) non compariva sotto la madre M0913, che mostrava solo la 1287 (2025). Il link `madre_id` era corretto: era `groupByMadre` in CantinaV2 che raggruppava le bottiglie già filtrate, e col default "solo giacenza positiva" le annate esaurite sparivano dalla madre.

- **Vista madri**: i filtri sidebar/chip decidono quali madri appaiono (almeno un'annata passa i filtri), ma ogni madre elenca sempre TUTTE le sue annate. Annate a giacenza 0 in `opacity-60`. Contatore annate allineato al renderizzato.
- **Scheda madre**: `openMadre` cerca nel dataset completo → si apre sempre con tutte le annate; fix anche del deep-link `?openMadre=N` che falliva se i filtri nascondevano l'intera madre.

### File
`frontend/src/pages/vini/v2/CantinaV2.jsx`, `frontend/src/config/versions.jsx` (vini 3.67→3.68).

---

## 2026-07-12 — Audit completo modulo Vini: hardening backend + fix UI (vini 3.67) `[core]`

Audit completo del modulo (136 endpoint su 7 router, ~34.500 righe BE+FE, 3 agenti paralleli + verifica manuale dei findings gravi), poi fix applicati in giornata. Chiude anche il residuo "init zombie" rinviato dalla sessione del 10/07 sera.

### Sicurezza / robustezza backend
- **B1 — boot crash su DB vergine**: `init_magazzino_database()` faceva `UPDATE vini_bottiglie` senza guardia, a import-time (prima di `run_migrations()`) → su un locale nuovo il backend non partiva. Ora i bulk-fix girano solo se la tabella esiste. Sblocca le istanze prodotto (`locali/`).
- **A1 — endpoint `/vini/anagrafiche/rollback` RIMOSSO** (risponde 410 Gone): post-cutover avrebbe droppato le tabelle LIVE (`vini_bottiglie`, `vini_madre`, ...). La finestra di rollback era chiusa dal 19/05.
- **A2 — backup/restore Impostazioni Vini WAL-safe**: backup via `sqlite3 Connection.backup` (prima `shutil.copy2` del solo file → transazioni nel `-wal` perse); path via `locale_data_path()` (prima `app/data` hardcoded, rotto post-R6.5); restore con `wal_checkpoint(TRUNCATE)` pre-overwrite + rimozione `-wal`/`-shm` residui (un WAL stale rigiocato sul file ripristinato = corruzione, stesso vettore S52-1).
- **A3+M1 — init riscritto in stile S52-1**: ogni CREATE TABLE/INDEX passa da check esplicito su `sqlite_master` (zero scritture a regime); la zombie `vini_magazzino` NON viene più ricreata al boot (A2-02 audit giugno — la bonifica FK del 10/07 ora resta pulita); probe INSERT/DELETE sostituito da ispezione DDL; FK dei DDL nuovi → `vini_bottiglie(id)`. Smoke-testato su DB vergine e post-cutover (idempotente).
- **A4 — auth su `/vini/carta/pdf-staff` e `/vini/cantina-tools/carta-cantina`** (header Bearer o `?token=`); l'iframe anteprima in Impostazioni passa il token.
- **M2 — PRAGMA standard ovunque**: `vini_widget_settings_service` (4 connect nudi → factory WAL/NORMAL/busy 30000); `main.py` A2-13 su vini.sqlite3 allineato (busy 5000→30000 + synchronous NORMAL).
- **M3 — `/reset-database` svuota anche `matrice_celle`, `vini_ordini_pending`, `vini_prezzi_storico`** (prima lasciava orfani).
- **M4 — `ensure_settings_defaults()` run-once per processo** (prima scan+UPDATE su vini_bottiglie a OGNI generazione carta, con errori silenziati).

### Fix UI
- **M7** ViniImpostazioni: sfondo `bg-brand-cream` (era `bg-neutral-50`, unica pagina vini fuori palette).
- **M8** SchedaMadreV2: useMemo spostato prima dell'early-return (violazione Rules of Hooks latente).
- **M9** DashboardVini: SR_LABELS/SR_CLS ora derivano da `viniConstants.STATO_RIORDINO` (label/colori divergevano nella stessa pagina).
- **M11** menu e CartaVini puntano diretti a `/vini/v2/cantina` e `/vini/v2/bottiglia/{id}` (prima doppio redirect S2).
- Rimosso print di debug al load di vini_router.

### Non fatto (aperti, decisioni PO)
`/vini/carta/pdf`+`/docx` restano pubblici (servono al QR? da decidere); cleanup `*_legacy.jsx` (V-H.I, finestra aperta dal 15/06) e dedup componenti → R7; token in query per i PDF → R8; TrgbLoader nelle pagine vini.

### File
`main.py`, `app/models/vini_magazzino_db.py`, `app/models/vini_settings.py`, `app/routers/vini_router.py`, `app/routers/vini_anagrafiche_router.py`, `app/routers/vini_cantina_tools_router.py`, `app/services/vini_widget_settings_service.py`, `frontend/src/pages/vini/{ViniImpostazioni,DashboardVini,CartaVini}.jsx`, `frontend/src/components/vini/SchedaMadreV2.jsx`, `frontend/src/config/{modulesMenu.js,versions.jsx}` (vini 3.66→3.67).

---

## 2026-07-10 (sera) — Audit Sessione 3: bonifica FK orfane (foodcost + vini_magazzino) `[core]`

Chiusura della parte dati di Sessione 3 (audit A2-02/A2-04/A2-10), tutta testata su copie fresche dei DB di produzione prima dell'applicazione. Sistema 5.36.

### foodcost.db (via migrazione 148, al boot)
- **`ipratico_product_map`**: la FK `vino_id → vini_magazzino(id)` era impossibile (tabella `vini_magazzino` inesistente in foodcost.db; i vini stanno in `vini_bottiglie`, altro file) → foreign_key_check segnalava 1264 falsi orfani su dati sani. Ricostruita la tabella SENZA quella FK. Orfani 1264→0, 1267 righe intatte, indici ricreati, idempotente. `cg_entrate` (65 incassi con link banca morto) lasciata invariata per scelta PO.

### vini_magazzino.sqlite3 (via script one-shot `scripts/bonifica_fk_vini_magazzino.py`, a backend fermo)
- 5 tabelle ripuntate da `vini_magazzino_legacy_20260518`/`vini_magazzino_old` a `vini_bottiglie`: `vini_magazzino_movimenti` (1133), `vini_prezzi_storico` (162), `matrice_celle` (180, −1 cella morta id=193), `vini_ordini_pending` (2), `vini_magazzino_note` (0).
- Cancellata 1 cella orfana (vino_id 1288 non più esistente). DROP delle tabelle morte `vini_magazzino_legacy_20260518` e della zombie `vini_magazzino`. foreign_key_check del file: da 161 violazioni → 0.
- Sicurezza script: backup timestamp + transazione con verifica foreign_key_check+integrity_check PRIMA del commit (rollback automatico se non tornano); default dry-run, serve --apply.

### Residuo noto (rinviato)
- `init_magazzino_database()` (vini_magazzino_db.py) ricrea ancora la zombie vuota `vini_magazzino` al boot e dichiara le FK verso `vini_magazzino` invece di `vini_bottiglie`: dopo la bonifica la zombie ricompare VUOTA e innocua (nessuno la referenzia). Il fix del codice (per installazioni nuove + stop rigenerazione) è rinviato: tocca una funzione di boot non testabile qui. foreign_key_check di tregobbi resta pulito.

### File
`app/migrations/148_fk_ipratico_product_map.py` (nuovo), `scripts/bonifica_fk_vini_magazzino.py` (nuovo), `VERSION`, `frontend/src/config/versions.jsx`.

---

## 2026-07-12 — G.3 Conto Economico: fatture nei ricavi, ripartizione vendite (C2), export PDF + indagine discrepanza iPratico `[core]`

Giornata dedicata a G.3 (priorità TOP). Sistema 5.37, controlloGestione 2.21.

### Indagine discrepanza iPratico vs CE (prerequisito C2 — RISOLTA)
La "discrepanza €14.930" di aprile confrontava iPratico coi soli corrispettivi. Verificato sui dati: la formula incassi (Z cumulativa cena + fatture) è CORRETTA — marzo quadra con iPratico a +€68, giugno a +€3. Il buco vero è **aprile −€11.210 e maggio −€5.917**, e coincide con un campo `fatture` anomalo in chiusura in quei mesi (apr €3.7k, mag €1.7k vs mar €6.3k, giu €6.0k): quasi certamente **fatture emesse (eventi/banchetti via iPratico) non riportate nella chiusura turno**. Indizio a supporto: dentro BATTUTA SINGOLA di aprile c'è "Acconto cena 17/04 €750". Report dei giorni da verificare in `claude/verifica_fatture_apr_mag.md` (Marco incrocia con iPratico; poi backfill assistito del campo fatture).

### Aggiunto
- **Ricavi CE = corrispettivi + fatture emesse** (decisione Marco 2026-07-12). Prima solo corrispettivi → su giugno mancavano €5.982 di fatturato dall'utile. Il KPI Ricavi mostra lo split. `conto_economico.py` + payload `ricavi.fatture_emesse`.
- **C2 / G.3.4 — Composizione del venduto**: mig 149 `ipratico_categoria_tipo` (mapping categoria iPratico → FOOD/VINO/BEVANDE/COPERTO/ALTRO/IGNORA, seed dalle decisioni Marco: Degustazioni→food, vino unico bt+calici, caffè in Bevande, BATTUTA SINGOLA→coperto, Servizio ignorata). Sezione nel CE con barra + drill-down categorie; categorie nuove → DA_CLASSIFICARE con select inline per assegnarle (endpoint GET/PUT `/controllo-gestione/ipratico-tipi`). Test su dati reali: giugno Cucina 68,4% / Coperto 14% / Vino 11,8% / Bevande 5,8%, zero da classificare.
- **G.3.7b — Export PDF del CE** (mattone M.B): template `conto_economico.html` (KPI, waterfall, breakdown costi, composizione venduto, warning) + endpoint `GET /controllo-gestione/conto-economico/pdf` + bottone 🖨 PDF nella pagina (fetch+blob, niente token in URL — pattern A1-08 compliant).

### Corretto (richiesta Marco, stessa sessione)
- **Costi del personale sotto "DIPENDENTI"**: il service etichettava stipendi/consuntivi con la label sintetica `'STAFF'` mentre in `fe_categorie` la categoria si chiama `DIPENDENTI` (id 3) → nel CE comparivano DUE categorie separate. Rename semantico verificato punto-per-punto (`conto_economico.py` ×3 + docstring, `dashboard_router` KPI personale con STAFF legacy in whitelist, color map JSX, tooltip DipendentiAnagrafica; migrazioni storiche NON toccate). Verificato su dati reali: giugno = una sola voce DIPENDENTI €16.610,36 (netti+INPS+F24/ratei/TFR+INAIL), STAFF assente anche nel fallback senza ELAB.

### Note
- Il venduto iPratico è lordo IVA e include le fatture: la composizione è una vista di STRUTTURA, non di quadratura col CE (nota esplicita in UI e PDF).
- Scoperto e documentato: "BATTUTA SINGOLA" è il tasto a prezzo libero (coperto "Servizio, pane e stuzzico" €5 + rari acconti eventi/asporto).

### File modificati
`app/migrations/149_ipratico_categoria_tipo.py` (nuovo), `app/services/conto_economico.py`, `app/routers/controllo_gestione_router.py`, `app/templates/pdf/conto_economico.html` (nuovo), `frontend/src/pages/controllo-gestione/ControlloGestioneContoEconomico.jsx`, `frontend/src/config/versions.jsx`, `VERSION`, docs.

---

## 2026-07-10 (sera) — HOTFIX login 2: invio automatico per ruolo + atterraggio su Home `[core]`

Rifiniture dopo il fix del pad: (1) rimesso l'**invio automatico** del PIN alla lunghezza attesa per ruolo — 6 cifre per admin/superadmin/contabile, 4 per gli altri — così non serve premere ✓ (che resta come conferma manuale/fallback, con Invio da tastiera); i pallini indicatori si adattano alla lunghezza attesa. (2) Dopo il login si va **sempre alla Home**, non all'ultima pagina aperta (`window.history.replaceState` prima di settare il token). Sistema 5.35, auth 2.2.2. File: `frontend/src/components/LoginForm.jsx`.

---

## 2026-07-10 (sera) — HOTFIX login: PIN pad supporta 4-6 cifre (era bloccato a 4) `[core]`

Regressione emersa subito dopo S2: il PIN pad di `LoginForm.jsx` si auto-inviava a 4 cifre, quindi chi (admin/contabile) aveva impostato un PIN a 6 non riusciva più ad accedere (mandava solo le prime 4 → errore). Fix: niente auto-invio, si accumulano 4-6 cifre e si conferma con tasto ✓ verde (o Invio). Dot indicator portato a 6. Sistema 5.34, auth 2.2.1. File: `frontend/src/components/LoginForm.jsx`.

---

## 2026-07-10 (sera) — Audit Sessioni 2+3: lockout login, PIN 6 cifre, indice fe_righe, WAL vini `[core]`

Ripresa del piano audit — Sessione 2 "Login robusto" + Sessione 3 "Igiene DB" (parte a rischio zero). Sistema 5.32→5.33, auth 2.1→2.2.

### Aggiunto
- **Lockout brute-force login (A1-04)**: contatore tentativi per-utente in memoria con backoff progressivo (default: 5 tentativi liberi, poi 30s che raddoppiano fino a 15 min). Soglie configurabili in `locali/<locale>/data/auth_settings.json` (create con default al primo avvio); UI in Impostazioni prevista dopo. Login bloccato → HTTP 429 con `Retry-After`. Reset al primo login riuscito. Tracciato solo per utenti reali (le tile sono già pubbliche → nessun leak, dict limitato).
- **PIN minimo 6 cifre per admin/contabile (A1-04, §3.9)**: validazione backend su `add_user`/`change_password` per i ruoli `superadmin/admin/contabile`. Gli altri ruoli restano 4-6.
- **Indice `fe_righe(fattura_id)` (A7-02/A2-03)**: migrazione 147 (idempotente, additiva) + creazione anche nel self-heal di `fe_import._ensure_tables` (copre installazioni nuove). Elenco fatture / conto economico / matching ricette non fanno più full-scan di 11.392 righe.

### Corretto / Igiene
- **WAL su vini.sqlite3 (A2-13)**: one-shot difensivo al boot (`main.py`, try/except non bloccante) — allinea l'unico DB rimasto in rollback mode; è legacy in scrittura ma ancora letto da dashboard/alert.
- **push.sh cleanup (A2-07)**: dopo il download DB rimuove i `*-wal/-shm/.fuse_hidden` orfani locali che potevano disallineare i file scaricati.
- **A4-03**: `CambioPIN.jsx` chiamava `/auth/users` senza slash finale (307 con rischio perdita header) → aggiunto slash.

### Infra (VPS, complementare — da applicare a parte)
- **A6-07**: rate-limit nginx su `/auth/login` (5r/m per IP, complementa il lockout applicativo). Conf pronta in `claude/nginx/` + runbook §6.0/6.1 aggiornato per i clienti nuovi.

### Verifica
- Logica lockout testata in isolamento (progressione 30→60→120…→900s cap, reset su successo). `py_compile` OK su tutti i file Python, `bash -n push.sh` OK, `@babel/parser` OK su CambioPIN.jsx. Migrazione 147 guardata su esistenza tabella (fresh install → indice dal self-heal).

### File modificati
`app/migrations/147_fe_righe_index.py` (nuovo), `app/routers/fe_import.py`, `app/services/auth_service.py`, `main.py`, `push.sh`, `frontend/src/pages/CambioPIN.jsx`, `frontend/src/config/versions.jsx`, `VERSION`, `docs/installazione_nuovo_server.md`, `docs/audit-2026-06-12/AUDIT_STATE.md`.

---

## 2026-07-10 — Audit: ripresa piano 2026-06-12 — chiusi i 2 CRIT residui + /docs protetto + header sicurezza `[core]`

Ricognizione delta sull'audit del 12/06 (fermo da 28 giorni): dei 110 finding risultavano chiusi solo 4. Report in `docs/audit-2026-06-12/11_DELTA_2026-07-10.md`. Nella stessa giornata chiusi i residui della Sessione 1.

### Sicurezza
- **A9-01 (CRIT)**: `047_prestiti_bpm.py` marcata `TRGB_SPECIFIC = True` — i prestiti BPM reali (importi e residui personali) non vengono più inseriti nei DB dei locali nuovi né nel demo. La 048 NON flaggata di proposito: crea solo lo schema `cg_piano_rate` (universale) e senza la 047 resta vuota da sola. `MIGRATIONS_TRGB.md` aggiornata. Zero effetto su tregobbi (047 già in `schema_migrations`).
- **A9-02 (CRIT)**: `app/core/config.py` fail-loud — in produzione (`TRGB_ENV=production` o path `/home/marco/trgb`) se `SECRET_KEY` non è nell'ambiente il backend NON parte, invece di firmare JWT con la chiave default pubblica del repo. Runbook §5.1: `Environment="SECRET_KEY=..."` + `TRGB_ENV=production` + comando per generare la chiave. Verificato pre-push che tregobbi ha la chiave nel `.env` (nessun impatto).
- **A6-06 (MED, decisione PO: "dietro login")**: Swagger `/docs`, `/redoc`, `/openapi.json` protetti da HTTP Basic Auth a livello nginx sul VPS (`.htpasswd_trgb_docs`). Anonimo → 401, con credenziali → 200.
- **A6-09 (MED)**: header di sicurezza (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) su trgb.tregobbi.it e app.tregobbi.it + `server_tokens off`. Config replicate nel runbook §6.0/6.1 per i clienti nuovi.
- **A6-12/A6-13 riconfermati live**: sshd `PermitRootLogin no` + `PasswordAuthentication no`; porte 9000/9443 solo su 127.0.0.1, 3389 spenta.

### Verifica
- Probe live: `/banca/movimenti` e `/vini/ipratico/stats` senza token → 401; `/docs` anonimo → 401; `/system/info` → 200; header presenti su entrambi i domini, versione nginx non esposta.
- `config.py` testato nei 3 casi: dev boota, prod-senza-chiave solleva RuntimeError, prod-con-chiave boota. `py_compile` OK su 047 e config.

### File modificati
`app/migrations/047_prestiti_bpm.py`, `app/core/config.py`, `locali/tregobbi/seeds/MIGRATIONS_TRGB.md`, `docs/installazione_nuovo_server.md` (§5.1 + §6.0/6.1), `docs/audit-2026-06-12/{11_DELTA_2026-07-10.md (nuovo), AUDIT_STATE.md}` + config nginx sul VPS (fuori repo, backup in `/etc/nginx/backups/`).

---

## 2026-07-10 — Turni: vista "Mese intero" in Per dipendente + fix nav mese in Miei turni `[core]`

Segnalazione Marco: nella vista Per dipendente non si riusciva a selezionare il mese effettivo (solo 4/8/12 settimane, frecce ±N settimane che derapano dai mesi di calendario).

### Aggiunto
- **PerDipendente.jsx v1.4.1-vista-mese**: quarta opzione "Mese intero" nel select periodo. In modo mese: select Mese+Anno (anno corrente ±2), frecce ◀▶ = ±1 mese vero, "Oggi" = mese corrente. Il FE calcola `settimana_inizio` (settimana ISO del 1° del mese) e `num_settimane` (settimane ISO che intersecano il mese, 4–6) — backend `/turni/dipendente` invariato. Persistenza: `turni_perdip_modo`, `turni_perdip_mese`.
- **Totali sul mese esatto (v1.4.1, segnalazione Marco post-prima-versione)**: i totali del backend coprono l'intero range di settimane (incluse le code del mese adiacente, es. 29-30 giu in "Luglio"); in modo mese il FE li ricalcola sui SOLI giorni del mese, riusando i valori per-giorno del payload (somme additive, stessa definizione BE di lavorato/riposo). Le code fuori mese restano visibili ma attenuate (opacity-40 + tooltip "escluso dai totali"); header totali etichettato "(totali del solo mese)". Il semaforo CCNL resta settimanale (corretto così).

### Corretto
- **MieiTurni.jsx v1.4-mese-vero**: i bottoni "⏪ mese / mese ⏩" spostavano di ±4 settimane (etichetta ingannevole); ora saltano al mese di calendario precedente/successivo coprendo il mese intero. Validazione `turni_mieituri_n` allargata a 1..12.

### Verifica
- Copertura mese testata programmaticamente su tutti i 48 mesi 2024–2027 (0 fail), incl. cavallo d'anno (Gen 2027 → 2026-W53) e Feb 2027 che inizia di lunedì (4 settimane esatte). @babel/parser OK su entrambi i file.

### File modificati
`frontend/src/pages/dipendenti/{PerDipendente.jsx, MieiTurni.jsx}`, `frontend/src/config/versions.jsx`, `docs/{modulo_dipendenti_turni.md, changelog.md, sessione.md}`.

---

## 2026-07-02 — Statistiche 1.2.1: fix semantica cumulativa shift_closures + fallback pre-cutover in Coperti `[core]`

Due bug segnalati da Marco subito dopo il push di 1.2.

### Corretto
- **Storico gonfiato (marzo "il doppio")**: la v1.2 sommava `preconto` di pranzo+cena, ma la riga CENA contiene la **chiusura RT cumulativa di giornata** (la Z include il pranzo) → il pranzo veniva contato due volte, più `shift_preconti` sommati a sproposito. Verifica sui dati: overlap 1-10 marzo `cena.preconto + fatture == daily.corrispettivi_tot` in 8/8 giorni; 0 violazioni cena<pranzo su 102 giorni; col fix marzo=71.574€ vs iPratico 71.506€ (+68), giugno 49.370€ vs 49.368€ (+2). Nuova formula in `_storico_daily_rows`: giorno = `cena.preconto + SUM(fatture)`; split pranzo/cena per differenza; coperti (reali per turno) invariati; `shift_preconti` esclusi per omogeneità con la metrica daily-era. Corretti a cascata YoY, weekday, spesa per coperto (scontrino medio giugno: 68→50€, realistico).
- **Coperti & Incassi muta su gennaio/febbraio**: le chiusure turno esistono solo dal 1/3/2026; per i mesi precedenti la pagina ora fa fallback sul registro corrispettivi (nuovo endpoint 12 `GET /statistiche/storico/giorni`) con banner esplicativo: solo incassi giornalieri, niente coperti/turni.

### Nota aperta (decisione Marco)
`/admin/finance/shift-closures/stats/daily` (modulo cassa, usato dalla stessa pagina Coperti per i mesi shift) somma ancora pranzo+cena+preconti nei campi `fatt_*` e nei pagamenti → media coperto e fatturati giornalieri gonfiati allo stesso modo. Da sistemare nel modulo cassa (contesto K.12): non toccato perché fuori dal modulo statistiche.

### File modificati
`app/routers/statistiche_router.py`, `frontend/src/pages/statistiche/StatisticheCoperti.jsx`, `frontend/src/config/versions.jsx`, `docs/{modulo_statistiche.md, changelog.md, sessione.md}`.

---

## 2026-07-02 — Statistiche 1.2: modulo potenziato — Storico YoY, giorno settimana, spesa per coperto, movimenti prodotti `[core]`

Il modulo Statistiche era fermo al solo import iPratico mensile. Ora è l'aggregatore cross-modulo read-only: sblocca 6 anni di incassi giornalieri (`daily_closures` 2021→2026 + `shift_closures`, ~3M€) che nessuna pagina mostrava.

### Aggiunto
- **Backend** (`statistiche_router.py` v1.2, endpoint 8-11):
  - `GET /statistiche/storico/yoy` — fatturato annuale + matrice mese×anno su tutta la storia. Cucitura daily_closures/shift_closures con **cutover dinamico** = MIN(date) shift_closures (K.12-proof). Lettura `admin_finance.sqlite3` in **mode=ro** (eccezione modulare: statistiche = aggregatore read-only).
  - `GET /statistiche/storico/weekday?anno=` — media incassi per giorno settimana sui giorni aperti; coperti e split pranzo/cena solo era shift_closures.
  - `GET /statistiche/coperto?anno=` — €/coperto e pezzi/coperto per categoria iPratico, mese per mese (venduto iPratico ÷ coperti chiusure turno).
  - `GET /statistiche/movimenti?anno=&mese=&min_euro=&n=` — prodotti in crescita/calo/nuovi/spariti vs mese precedente importato; soglia `min_euro` esposta come parametro API (default 50), non nascosta hardcoded.
- **Frontend**:
  - Nuova pagina `StatisticheStorico.jsx` (tab "Storico" 🕰️): barre fatturato per anno con delta %, matrice mese×anno con delta vs stesso mese anno precedente + riga "Parziale" YTD omogeneo, giorno della settimana con filtro anno e tabella turni.
  - `StatisticheCoperti.jsx`: sezione "Cosa consuma un coperto" — €/coperto per categoria del mese con delta vs mese precedente.
  - `StatisticheDashboard.jsx`: card "In crescita"/"In calo" (vista Mese) dai movimenti prodotti.
  - `StatisticheProdotti.jsx`: click su riga → modal trend mensile del prodotto (endpoint trend già esistente, mai usato da UI).

### Corretto
- Label sub-modulo dashboard Statistiche: era "Cucina" (copy-paste) → "Dashboard" in `modules.json` e `modulesMenu.js`.

### Note
- iPratico è aggregato mensile: weekday sui singoli prodotti impossibile, l'analisi weekday usa incassi/coperti.
- Verifica: 4 endpoint testati su DB reale (YoY 2021-2026 coerente con SQL diretto, scontrino medio giugno 68,09€, movimenti giu-vs-mag plausibili). Sintassi FE verificata con @babel/parser su tutti i file toccati.

### File modificati
`app/routers/statistiche_router.py`, `frontend/src/pages/statistiche/{StatisticheStorico.jsx (nuovo), StatisticheCoperti.jsx, StatisticheDashboard.jsx, StatisticheProdotti.jsx, StatisticheNav.jsx}`, `frontend/src/App.jsx`, `frontend/src/config/{modulesMenu.js, versions.jsx}`, `app/data/modules.json`, `docs/{modulo_statistiche.md, roadmap.md, changelog.md, sessione.md}`.

---

## 2026-06-24 — Vini 3.66: revert 3.64 — ripristinato bottone "↩ Annulla" sulla riga ATTIVAZIONE `[core]`

Marco chiarisce di aver inteso, in 3.64, "togli la TAB Attivazione dal form" (risolto in 3.65 separando `MODALITA` da `BADGE_TIPI`), non "togli il bottone Annulla sulla riga". Il bottone "↩ Annulla" sulla riga ATTIVAZIONE è effettivamente utile: cancella in atomico il movimento `[CALICI-RESIDUO]` e chiude la bottiglia. Lo rimetto.

### Modificato
- `frontend/src/pages/vini/ViniVendite.jsx`: ripristinati handler `annullaAttivazione`, state `annullandoAttivazioneId`, bottone "↩ Annulla" sulla riga ATTIVAZIONE (visibile solo quando `mod === "ATTIVAZIONE"`).

### File modificati
`frontend/src/pages/vini/ViniVendite.jsx`, `frontend/src/config/versions.jsx`, `docs/changelog.md`.

---

## 2026-06-24 — Vini 3.65: fix regressione 3.63 — terza tab "Attivazione" comparsa nel form Registra vendita `[core]`

Effetto collaterale di 3.63: aggiungendo `ATTIVAZIONE` alla costante `MODALITA` in `ViniVendite.jsx` è apparsa una terza tab "🥂↻ Attivazione" nel form **Registra vendita** (oltre a Bottiglia e Calici), perché la stessa costante è iterata in due posti — `MODALITA[mod]` per i badge della tabella Storico vendite **e** `Object.entries(MODALITA).map(...)` per generare le tab del form. Marco lo ha intercettato sullo screenshot del #1310.

### Modificato
- `frontend/src/pages/vini/ViniVendite.jsx`: separate due costanti. `MODALITA` torna a contenere solo BOTTIGLIA + CALICI (usata per le tab del form di registrazione). Nuova `BADGE_TIPI = { ...MODALITA, ATTIVAZIONE }` usata SOLO per il rendering del badge nella tabella Storico vendite. Cambiata la lookup nel render della tabella da `MODALITA[mod]` a `BADGE_TIPI[mod]`. Il form torna a mostrare due tab, lo storico vendite mostra il badge "🥂↻ Attivazione" sui MODIFICA `[CALICI-RESIDUO]` come previsto da 3.63.

### File modificati
`frontend/src/pages/vini/ViniVendite.jsx`, `frontend/src/config/versions.jsx`, `docs/changelog.md`.

---

## 2026-06-24 — Vini 3.64: rimosso bottone "↩ Annulla" ridondante sulla riga ATTIVAZIONE `[core]`

Follow-up dopo prova di Marco su 3.63: il bottone "↩ Annulla" sulla riga ATTIVAZIONE nello storico vendite era ridondante. L'annullamento dell'attivazione si fa già dal 🗑 sul movimento (tab Movimenti della scheda vino o ovunque ci sia il delete movimento standard) — e il backend chiude la bottiglia in atomico grazie a `delete_movimento` di 3.63. La riga ATTIVAZIONE resta come traccia visibile (badge "🥂↻ Attivazione", qta "—") ma senza azione doppia.

### Modificato
- `frontend/src/pages/vini/ViniVendite.jsx`: rimossi bottone "↩ Annulla", handler `annullaAttivazione`, state `annullandoAttivazioneId`. La cella azione mostra solo "+🥂" sulle righe BOTTIGLIA (come prima).

### File modificati
`frontend/src/pages/vini/ViniVendite.jsx`, `frontend/src/config/versions.jsx`, `docs/changelog.md`.

---

## 2026-06-24 — Vini 3.63: vendita al calice tracciata + attivazione "calici da residuo" reversibile `[core]`

Due bug correlati intorno al servizio al calice, segnalati dal caso del #1310 (Lugana DOC Montunal, Tenimenti Civa).

### Bug 1 — Vendita al calice non apriva la bottiglia in mescita
**Sintomo**: Claudio registra una vendita dal tab "Calici" del form Vendite su un vino non ancora al calice. Il modale `DecidiPrezzoCalice` chiede il prezzo, lui conferma, la vendita viene registrata con nota `[CALICI]` (e badge "🥂 Calici" nello storico) — ma `BOTTIGLIA_APERTA` resta 0 e il widget Calici non mostra il vino.

**Causa**: nel branch "vendita normale" del modale, dopo la conferma del prezzo veniva chiamato solo `eseguiVendita()`. Il branch "soloAttivazione" chiamava correttamente `patchAttivaCalice()`, quello "vendita normale" lo dimenticava. Risultato: vendita registrata ma il flag `BOTTIGLIA_APERTA` mai acceso.

**Fix** (`frontend/src/pages/vini/ViniVendite.jsx`): dopo `eseguiVendita(...)` nel branch normale, ora viene chiamato anche `patchAttivaCalice(vino.id, extra)` con `PREZZO_CALICE` + `PREZZO_CALICE_MANUALE=1` e `VENDITA_CALICE=1` se non già impostato. Best-effort: se l'attivazione fallisce la vendita resta valida e si segnala l'errore.

### Bug 2 — L'attivazione "calici da residuo" non era tracciata né reversibile
**Razionale (Marco)**: "questo movimento non è tracciato né nei movimenti né nello storico vendite nella dashboard. Io lo traccerei, in entrambi; non crea una vendita; ma il movimento è tracciato e si può anche cancellare e ripristinare eventualmente."

**Implementazione (zero modifiche schema)**:
- **Backend** (`vini_magazzino_router.py` + `vini_magazzino_db.py`): quando `update_bottiglia_aperta` registra una transizione `BOTTIGLIA_APERTA` 0→1, inserisce un `MODIFICA` (qta=0, locazione=NULL) con nota `[CALICI-RESIDUO]` e origine `CALICI-RESIDUO`. Nuovo helper `db.registra_evento(vino_id, utente, nota, origine)` per eventi opachi senza delta.
- **Storico vendite** (`/movimenti-globali`): il filtro `tipo=VENDITA` include automaticamente anche i `MODIFICA` con marker `[CALICI-RESIDUO]`. Compaiono nello storico con badge dedicato (`🥂↻ Attivazione`, ambra) e qta visualizzata come "—" (non concorre ai totali).
- **Cancellazione = annullamento atomico**: in `delete_movimento`, se il movimento è `MODIFICA` con `[CALICI-RESIDUO]`, oltre al delete viene chiamato `db.update_vino(BOTTIGLIA_APERTA=0)` sul vino → la bottiglia torna chiusa (DATA_APERTURA → NULL via il layer DB). Origine `CALICI-RESIDUO-UNDO`.
- **Ripristina**: nessun endpoint dedicato. La VENDITA bottiglia originale ricompare con il tasto `+🥂` → ricliccare riattiva. Pattern semplice, niente soft-delete da gestire.
- **Frontend**:
  - `ViniVendite.jsx` Storico vendite: badge "🥂↻ Attivazione" + bottone "↩ Annulla" sulla riga ATTIVAZIONE (DELETE con confirm).
  - `SchedaVino.jsx` tab Movimenti: stesso badge per i `MODIFICA` con `[CALICI-RESIDUO]`, nota visualizzata senza il marker. Il bottone 🗑 esistente sfrutta automaticamente la stessa logica di annullamento atomico.

### File modificati
`app/models/vini_magazzino_db.py`, `app/routers/vini_magazzino_router.py`, `frontend/src/pages/vini/ViniVendite.jsx`, `frontend/src/pages/vini/SchedaVino.jsx`, `frontend/src/config/versions.jsx`, `docs/changelog.md`.

---

## 2026-06-12 — SECURITY: auth su modulo Banca e iPratico + hardening VPS `[core]`

Dall'audit totale 2026-06-12 (`docs/audit-2026-06-12/`, finding CRIT A1): `banca_router` e `ipratico_products_router` erano montati **senza autenticazione** — `GET /banca/movimenti` rispondeva pubblicamente con i movimenti bancari reali, inclusi endpoint di scrittura/cancellazione e upload.

### Sicurezza
- `banca_router.py` + `ipratico_products_router.py`: `dependencies=[Depends(get_current_user)]` a livello router — tutti gli endpoint ora richiedono JWT. Verificato live post-deploy: 401 senza token. Nessun impatto FE (le pagine usavano già `apiFetch` con Bearer).
- VPS (fuori repo): sshd `PermitRootLogin no` + `PasswordAuthentication no`; Portainer ribindato su `127.0.0.1` (Docker bypassa ufw); xrdp disabilitato; regole ufw 3389/5900 rimosse. Porte esposte residue: 22/80/443.

---

## 2026-06-09 — Cassa: scontrini annullati/resi (quadratura + versamenti) `[core]`

Caso cena 8/6/2026 (Marco): uno scontrino battuto e poi **annullato** resta nel totale fiscale del registratore (Chiusura RT) ma non viene mai incassato. Risultato sul DB reale: la quadratura del fine turno segnava `saldo = −460,00 €` (= esattamente lo scontrino annullato) e i "contanti da versare" sovrastimavano di 460 € (`contanti_fiscali = corrispettivi − elettronici`, coi corrispettivi che includevano l'annullato). Scelta Marco: campo dedicato + fix su entrambi i sintomi.

### Aggiunto
- **Migration 146** `146_cassa_annulli_resi.py`: `ADD COLUMN annulli_resi REAL DEFAULT 0` su `shift_closures` e `daily_closures` (admin_finance.sqlite3). Idempotente (PRAGMA check), connessione tenant-aware propria.
- **Campo "❌ Annulli / Resi"** nel form fine turno (`ChiusuraTurno.jsx`): draft autosave, load, payload, reset; incluso nel calcolo quadratura e mostrato come chip "− annulli" nel breakdown giustificato.
- **PDF commercialista — tabella Note** (`corrispettivi_export.py`): dopo il Riepilogo IVA, se ci sono note nelle chiusure del mese, una tabella Data | Nota (prefisso P/C per pranzo/cena, HTML-escaped). Corrispettivi 4.6 → 4.7.

### Modificato
- `chiusure_turno.py`: `annulli_resi` in CREATE/self-heal, model Pydantic, INSERT/UPDATE, tutte le SELECT, e **quadratura** — `giustificato −= annulli_giorno` (turno corrente + annulli pranzo a cena). Saldo ora al netto.
- `admin_finance.py`: corrispettivo RT **netto** degli annulli in `_aggregate_shift_closures_by_date`, `_contanti_fiscali_by_date` e `cash/daily` → versamenti/dashboard corretti.
- `ChiusureTurnoLista.jsx`: giustificato per giorno e totali periodo al netto degli annulli (il saldo per riga arriva già corretto dal backend).
- `versions.jsx`: Gestione Vendite 4.5 → 4.6, Flussi di Cassa 1.13 → 1.14.

### Verifica
Replica del codice reale su copia del DB con `annulli_resi=460` sulla cena 8/6: **quadratura saldo 0,00** (era −460) e **contanti da versare 460 → 0**. ✅ Modello per-turno (non cumulativo): a cena si somma anche l'annulli del pranzo.

---

## 2026-06-08 — Pranzo 1.7: storia Instagram «oggi a pranzo» (canvas client-side) `[locale:tregobbi]`

Marco vuole generare la storia IG del pranzo. Scelta (panel marketing, 7 mockup valutati /100): variante **Antracite** "oggi a pranzo" (86/100), solo grafica/testo (no foto), cadenza giornaliera. Implementata client-side: il browser disegna la storia 1080×1920 su `<canvas>` e la scarica come PNG, zero dipendenze server.

### Aggiunto
- `PranzoStoryCanvas.jsx`: canvas 1080×1920, fondo antracite, gobbette (path logo), data odierna + "OGGI A PRANZO", piatti della settimana corrente (font adattivo, fino a 6), menù business coi prezzi da settings, CTA recapiti. Safe zone IG 250px top/bottom rispettate. Download `pranzo-tregobbi-AAAA-MM-GG.png`.
- Bottone "📱 Storia" nella toolbar compositore Pranzo (quando ci sono piatti).
- `pranzo_settings.ig_telefono` + `ig_indirizzo` (soft-migration in `_ensure_schema`, testata) + campi in PranzoSettingsPanel ("📱 Recapiti storia Instagram").

### Nota
Font canvas: Playfair Display (caricato) per titoli/corsivi, monospace di sistema per i piatti. Limite onesto: senza foto il food appeal ha un tetto — la versione "foto + overlay" resta in roadmap come v2.

## 2026-06-08 — Pranzo PDF: leggibilità Proposta 2 (filetti categoria) `[locale:tregobbi]`

Marco: "migliorare la lettura del PDF pranzo, tieni lo stile". Scelta la Proposta 2 fra 3 mockup: etichette categoria (ANTIPASTI/PRIMI/SECONDI) con **filetto sottile ai lati** + più aria tra le categorie + interlinea piatti maggiore. Nomi piatto restano Courier Bold maiuscolo. pranzo_pdf_service v3.3, css v2.4.

## 2026-06-08 — Ricette 3.33: prezzo corrente robusto (mediana finestra) `[core]`

Caso Sedano (Marco 2026-06-07): "prezzo attuale" 8,27 €/kg perché un acquisto occasionale di "cuore di sedano" Esselunga (vaschetta retail) scavalcava per data il fornitore abituale Milesi a 2,60 €/kg — e quel prezzo finiva dritto nel food cost delle ricette (`_get_ingredient_unit_cost` usava l'ultimo prezzo). Scelta Marco: **mediana degli ultimi N giorni** (default 90, configurabile).

### Aggiunto
- **Migration 145** `foodcost_settings` (riga unica id=1): `prezzo_finestra_giorni` (default 90), `prezzo_strategia` (default 'mediana'). Idempotente + self-heal.
- **`GET/PUT /foodcost/settings`**: legge/aggiorna la finestra (1–730 gg).
- **`prezzo_corrente_ingrediente()`** in foodcost_recipes_router: mediana dei `unit_price` negli ultimi N giorni, fallback all'ultimo prezzo se la finestra è vuota. `_get_ingredient_unit_cost` (food cost ricorsivo) ora la usa.
- **Pannello "Prezzi & Food Cost"** in Impostazioni Cucina (FoodcostSettingsPanel): preset 30/60/90/180/365 + campo libero.

### Modificato
- Lista ingredienti (`GET /foodcost/ingredients/`): il prezzo in colonna è ora il prezzo corrente (mediana finestra, una sola query aggregata — no N+1), fallback ultimo prezzo.
- Scheda ingrediente (RicetteIngredientiPrezzi v4.2): KPI "Prezzo attuale" → **"Prezzo corrente"** con sotto-etichetta "mediana Ngg" e tooltip. "Medio storico" resta la media di tutti i prezzi.
- Verifica su DB reale: Sedano food cost 8,27 → **2,60 €/kg**; mediana stabile a 90/180/365gg.

## 2026-06-07 — Vini 3.62: fix andamento giacenza — finestra adattiva + calibrazione `[core]`

Marco segnala con screenshot del vino #1205 (Lugana DOC Montunal) che la curva "📈 Andamento giacenza" andava in **negativo** (Min −10 bt, Max −7 bt, Oggi 2 bt). Causa: il replay forward partiva da 0 al primo movimento storico (15/03/2026), ma il vino aveva già bottiglie in cantina mai registrate come `CARICO`. Risultato: `drift = −12 bt` tra serie ricostruita e `QTA_TOTALE` attuale, e i punti scendevano sotto zero.

Marco: "devi settare il primo valore alla prima data che abbiamo deciso 15/03 e da li fare i calcoli". Due fix combinati.

### Modificato
- **Finestra adattiva** in `giacenza_storica_vino()` (`vini_magazzino_db.py`): `days=30` è ora un MINIMO. Se il primo movimento storico è più vecchio di 30 giorni, la finestra si estende all'indietro fino al primo movimento. Per #1205 il chart copre ora 15/03 → 07/06 (~85 giorni) invece di solo 09/05 → 07/06. Vediamo tutta la storia di magazzino del vino.
- **Calibrazione automatica**: se il replay non torna su `QTA_TOTALE` attuale (drift ≠ 0), la serie viene shiftata di `−drift` così che l'ultimo punto coincida con la giacenza di oggi. La forma della curva resta identica, cambia solo l'ancoraggio. Per #1205: offset `+12` → curva ora va da **12 → 2 bt** (era −7 → −10 nel raw).
- Risposta endpoint estesa: nuovi campi `offset` e `ricalibrata` accanto a `drift`. Frontend mostra badge `🔧 ricalibrata +12` (tooltip esplicativo) al posto del precedente `⚠ drift`.
- Titolo del box `📈 Andamento giacenza — dal primo movimento` (era "ultimi 30 giorni" — non più accurato con finestra adattiva).

### Razionale
- La curva non-negativa è il comportamento intuitivo (le giacenze sono per costruzione ≥ 0).
- Estendere all'indietro fino al primo movimento dà il quadro completo del singolo vino, anche su orizzonti diversi tra vini.
- Il flag `ricalibrata` resta come red flag onesto: se è acceso, lo storico movimenti non bilancia il totale attuale (= bottiglie esistenti pre-storico, o rettifiche dirette).

### Anche — modifica diretta giacenza non registrava il movimento (quando andava a zero)
Marco: "Dentro un vino, se modifico direttamente la giacenza non viene segnato il movimento". Diagnosi: la validazione `if qta <= 0: raise` in `registra_movimento` rifiutava `qta=0`, ma una RETTIFICA a zero è semanticamente legittima ("ora ho 0 bottiglie"). Quando l'utente azzerava la giacenza dalla SchedaVino, `update_vino_magazzino` (router) chiamava `registra_movimento(tipo="RETTIFICA", qta=0)` → ValueError → catch silenzioso `except: pass` → nessun movimento RETTIFICA registrato. La giacenza si aggiornava, il movimento spariva. Fix: la validazione ora ammette `qta=0` ESCLUSIVAMENTE per RETTIFICA (`qta < 0` resta sempre rifiutato; `qta == 0` resta rifiutato per CARICO/VENDITA/SCARICO/MODIFICA dove non ha senso). Inoltre il `except: pass` del router è ora un log warning (`logging.getLogger("vini.magazzino")`) così errori futuri di registrazione movimento finiscono in `journalctl` invece di sparire.

### File modificati
`app/models/vini_magazzino_db.py`, `app/routers/vini_magazzino_router.py`, `frontend/src/pages/vini/SchedaVino.jsx`, `frontend/src/config/versions.jsx`, `docs/modulo_vini.md`.

---

## 2026-06-07 (notte) — Ricette 3.32: fix calcolo prezzo ingrediente da fattura `[core]`

Marco segnala prezzi sballati ("Capperi 12,50 €/g", "Sale fino 0,0075 €/g", oscillazioni 4-50x). Diagnosi: tre bug concatenati nella catena fattura→prezzo.

### Corretto
- **Fallback silenzioso eliminato** (`_compute_unit_price`): se l'unità fattura non è convertibile (PZ, CT, CF, NR, VS…) il prezzo a collo entrava COSÌ COM'ERA come €/unità-base. Ora: prezzo NON salvato, riga segnalata. `collega-multiplo`/`confirm` ritornano `prezzi_saltati` + `unita_da_configurare`, la UI li mostra.
- **`convert_qty` famiglie strette**: `pz` convertiva implicitamente verso peso/volume come 1 pz = 1 kg/L (check famiglie lasco). Ora peso↔peso, volume↔volume, pz↔pz; pz→peso solo con conversione custom.
- **Sinonimi unità fattura**: GR, HG, LT, LIT + normalizzazione punti ("KG." → kg). Prima "GR" non era riconosciuto → fallback.

### Aggiunto
- **`POST /foodcost/matching/ricalcola-prezzi/{ingredient_id}`**: riallinea tutti i prezzi da fattura con le regole correnti (fattore mapping → conversioni → parsing descrizione se safe). Non convertibili lasciati e segnalati. UI: "↻ Ricalcola prezzi" in tab Prezzi.
- **Fattore visibile/correggibile su OGNI collegamento** (prima solo sui "sospetti" PZ vs g — i multipack "KG1 X12" con unità regolare erano invisibili). Hint ⚠ multipack se descrizione contiene X12/12x e fattore=1.
- **Dettaglio prezzo fattura nella conferma collegamento** (richiesta Marco): ogni card articolo mostra "💶 Prezzo fattura: X €/PZ · ultima riga: qty × prezzo = totale (data)" + **anteprima live** "2,10 € ÷ 500 = 0,0042 €/g" che si aggiorna mentre digiti il fattore → check visivo immediato se il prezzo è a collo o a pezzo.
- **Conversione "peso del pezzo" per ingredienti a numero** (richiesta Marco, caso Tuorlo d'uovo base "n"): nuova catena standard+custom in `_get_custom_conversion` — con "1 n = 20 g" le fatture a peso si convertono da sole (1 KG → 1000 g ÷ 20 = 50 tuorli) e viceversa (4 n → 80 g per ricette a grammi). `_standard_convert` allineato alle famiglie strette (aveva lo stesso bug pz→peso 1:1). FE: "n" aggiunto alle unità della tab Conversioni + hint nel copy. Test: 9 assert verdi incluso isolamento per ingrediente.
- **Unità "n" disponibile OVUNQUE** (feedback Marco: "n non c'è, ho dovuto usare pz e sballa"): aggiunta a UNITA/UNITS in Anagrafica ingrediente, conversioni, item ricetta (Modifica/Nuova/Picker/Import/Ingredienti). "n" = pezzi VERI (tuorli, uova), distinta da "pz" che in fattura spesso è il collo: "n" non converte MAI automaticamente verso pz/peso — solo via conversione custom o fattore. Evita il trappolone 1 PZ-bottiglia = 1 tuorlo.
- **Fattore esprimibile in qualsiasi unità** (feedback Marco: "dovrei scegliere io che unità dargli"): in Correggi e in Conferma collegamento il fattore non è più obbligato in unità base — selettore unità accanto al campo ("1 conf. = 1 **kg**") e nuovo `GET /matching/converti-in-base` che calcola il fattore base via conversioni standard+custom (1 kg → 50 n con "1 n = 20 g"). Anteprima live mostra l'equivalente in base e il prezzo risultante; se la conversione manca, warning ⚠ con rimando alla tab Conversioni.

### Workflow di bonifica (caso Capperi/Sale)
1. Scheda ingrediente → Collegamenti → "Correggi" sul collegamento sbagliato (es. 1 CT = 12000 g) → "Salva e ricalcola" sistema i prezzi storici dal prezzo originale di fattura.
2. Oppure tab Conversioni → aggiungi 1 pz = X g → tab Prezzi → "↻ Ricalcola prezzi".

## 2026-06-07 — Pranzo 1.6: restyle PDF sistema menu A5 + flusso piatti "Entrambi" `[mixed]`

Ripresa del modulo Pranzo (fermo da fine aprile, inutilizzato per estetica PDF incoerente e pool piatti troppo rigido). Riferimento estetico deciso da Marco: il MENU A5 stagionale dell'osteria (Sabon LT Pro + Courier Prime, bianco/nero), NON la carta vini. Proposta A "Pagina di sezione" approvata, formato A4 verticale.

### Aggiunto
- **`POST /pranzo/promuovi-ricetta/`** `[core]`: promuove una riga ad-hoc del compositore a ricetta minimale (kind='dish', 1 porzione, senza ingredienti) + tag service_type "Pranzo di lavoro". Dedup per nome (name/menu_name case-insensitive): se la ricetta esiste, aggiunge solo il tag. Testato su copia DB (6 test verdi).
- **Bottone "+ pool"** su righe ad-hoc con nome in `PranzoMenu.jsx` (v3.6): un click e il piatto del mercato entra nel pool, food cost completabile dopo in Ricette (C.P1).
- **Form "⚡ Nuova ricetta veloce"** nel pool (richiesta Marco in sessione): nome + categoria + Crea (anche con Enter) → ricetta placeholder nel pool senza passare dal modulo Ricette. Visibile anche a pool vuoto. Stesso endpoint con dedup.
- **`DELETE /pranzo/pool/{recipe_id}/`** + ✕ su ogni chip del pool: eliminazione "intelligente" (scelta Marco) — toglie sempre il tag "Pranzo di lavoro"; se la ricetta è un placeholder vuoto (0 ingredienti, 0 altri service_types, mai sub-ricetta, mai su menu carta) la disattiva anche in Ricette. Righe storiche dei menu intatte (snapshot). Confirm + toast esplicito sull'esito. Testato su copia DB (ricetta con items NON disattivata, placeholder sì, doppia rimozione innocua).
- **`DELETE /foodcost/ricette/{id}/hard`** `[core]` — eliminazione DEFINITIVA nel modulo Ricette (ricette 3.31, richiesta Marco: esisteva solo Disattiva). Protezioni 409: usata come sub-ricetta (elenca dove) o pubblicata su menu carta. Cancellazione esplicita in transazione (recipe_items, recipe_service_types, scollega pranzo_menu_righe/pranzo_piatti — snapshot storico intatto). UI: bottone "🗑 Elimina" in RicetteDettaglio (con confirm forte) + "🗑 Elimina" nella barra batch di RicetteArchivio (riporta i motivi delle ricette protette). Testato su copia DB: 409 su sub-ricetta e pubblicata, delete pulito con storico pranzo preservato.
- **Migration 144** `[locale:tregobbi]`: nuovi default `pranzo_settings` (titolo "PRANZO", sottotitolo "la cucina del mercato", footer senza asterischi) — solo se mai personalizzati. Idempotente, testata.

### Modificato
- **`pranzo_pdf_service.py` v3.0 + `menu_pranzo_pdf.css` v2.0** `[locale:tregobbi]`: titolo Sabon spaziato, sottotitolo corsivo unico con settimana ("la cucina del mercato · settimana dell'8 - 12 giugno 2026", articolo elide su 8/11), piatti Courier Prime bold maiuscoli raggruppati per categoria con etichette (ANTIPASTI/PRIMI/…), box Menù Business con prezzi nudi senza €, footer corsivo. Niente logo, niente "* * *". Font con fallback a catena (static/fonts → tre_gobbi → Cormorant). ⚠ Caricare i file Sabon LT Pro e Courier Prime in `static/fonts/`.
- `docs/modulo_pranzo.md` riscritto (era fermo al modello v1.0 giornaliero): v3.0 con schema reale, colonne legacy D2, tabella capability C-P-001..007.
- `VERSION` 5.23 → **5.24**, pranzo 1.5 → **1.6** (alpha → beta).

## 2026-06-07 (sera) — Pranzo: logo nel PDF + date picker settimana `[mixed]`

Feedback Marco post-push: (1) "non vedo il logo nel pdf" → aggiunto wordmark Osteria Tre Gobbi in testa al PDF (v3.1): creato `static/img/logo_tregobbi_trim.png` (rifilatura PIL del PNG originale 5000×5000 che ha ~60% di aria interna), `<img class="menu-logo">` 56mm centrato sopra il titolo, fallback al PNG originale. (2) "la settimana dovrebbe farmela scegliere" → date picker nella toolbar del compositore (PranzoMenu v3.8): scegli qualsiasi data e la settimana si aggancia al suo lunedì; il PDF e tutte le azioni seguono la settimana selezionata (le frecce ◀▶ e Oggi restano). (3) "centra le scritte e i nomi dei piatti" → css v2.2: etichette categoria e piatti centrati — il layout converge verso lo stile pagina Degustazione del menu A5. (4) Logo poi RIMOSSO (v3.2/css v2.3, "ridondante") + corpi aumentati: titolo 30→36pt, sottotitolo 12.5→14pt, categorie 10.5→12pt, **piatti 13→16pt**, business 12.5→14pt, footer 11→12pt. Il trim PNG resta nel repo.

## 2026-05-30 — Vini 3.61: STATO_RIORDINO si azzera in automatico all'arrivo dello stock `[core]`

Marco ha segnalato che il widget "vini senza giacenza" della Dashboard Vini non mostrava tutti i vini attesi (esempio: ID 1239 Pinot Nero Alto Adige Sogegross, giacenza 0 ma assente dal widget). Causa: il widget esclude per design i vini con `STATO_RIORDINO='0'` (Ordinato — "ordine già piazzato, non urgente alertarlo"), ma né `registra_movimento` né `conferma_arrivo_ordine_pending` azzeravano mai questo stato. Quindi i vini ordinati e poi arrivati e poi rivenduti restavano marcati "Ordinato" per sempre e scomparivano dall'alert.

### Aggiunto
- **Auto-reset di `STATO_RIORDINO='0'` su arrivo stock** (in `app/models/vini_magazzino_db.py`):
  - `registra_movimento`: per `tipo='CARICO'` (sempre) e `tipo='RETTIFICA'` con `delta > 0` (rettifica in salita) → `STATO_RIORDINO = NULL`.
  - `conferma_arrivo_ordine_pending`: stesso reset, dentro la stessa transazione atomica del CARICO + delete pending.
  Ogni reset genera un movimento `MODIFICA` nello storico del vino con `origine='AUTO-CARICO' | 'AUTO-RETTIFICA' | 'ORDINE_ARRIVO'` e l'`utente` che ha causato il movimento — così resta tracciato chi/quando/perché.
- **Log dello stato iniziale al duplica**: `duplicate_vino` accetta ora `utente` (passato dal router) e, dopo l'INSERT, se la copia parte con `STATO_RIORDINO` valorizzato (tipicamente `'0'` sul ramo "nuova annata"), scrive un `MODIFICA` con `origine='DUPLICATE-NUOVA-ANNATA'`. Così anche il settaggio implicito da duplica è tracciato (prima non lo era).
- **Migration 139** `139_reset_stato_riordino_orfani.py` (opzione B confermata da Marco): cleanup one-shot dei vini stantii. Resetta `STATO_RIORDINO='0' → NULL` per tutti i vini che hanno `'0'` ma NON hanno una riga in `vini_ordini_pending` (euristica: "se Ordinato non ha un pending dietro, è quasi certamente stantio"). Ogni reset è loggato come `MODIFICA` con `origine='MIG-139-CLEANUP'`. Backup del DB su `.pre-mig139-<ts>` prima dei UPDATE. Idempotente (rieseguibile, su DB pulito trova 0). Sandbox: 14 vini candidati locale (n. reale in produzione = quello che troverà la mig al boot).

### Modificato
- `app/routers/vini_magazzino_router.py`: `duplicate_vino_endpoint` e `bulk_duplicate_vini` passano ora `utente=_get_username(current_user)` a `db.duplicate_vino`.
- `frontend/src/config/versions.jsx`: vini 3.60 → **3.61**.

### Note
- Reset solo su `'0'` (Ordinato). Gli altri stati distinti (`'D'` Da ordinare, `'A'` Annata esaurita, `'X'` Non ricomprare) non si toccano: hanno semantica diversa.
- Si applica anche su RETTIFICA solo se la qta sale (`delta > 0`); rettifica in discesa o invariante non azzera (l'ordine non è "arrivato" se stai correggendo verso il basso).
- Il widget "vini senza giacenza" non è stato toccato: continua a escludere `STATO_RIORDINO='0'` per design. Ora però lo stato si azzera correttamente all'arrivo, quindi il filtro torna ad essere "fresco".

### File modificati
`app/models/vini_magazzino_db.py`, `app/routers/vini_magazzino_router.py`, `frontend/src/config/versions.jsx`. Nuovo file: `app/migrations/139_reset_stato_riordino_orfani.py`.

---

## 2026-05-24 — Ricette 3.30: scheda ingrediente ridisegnata a tab `[core]`

La pagina di dettaglio ingrediente (`RicetteIngredientiPrezzi.jsx`) è stata ricomposta in stile TRGB sul modello della scheda vino: **testa fissa** (badge categoria/stato, nome, 4 KPI) + **tab bar a 5 linguette** (Prezzi · Collegamenti · Conversioni · Ricette · Anagrafica). Prima era una pagina a scorrimento unico con stile fuori sistema.

### Aggiunto
- Endpoint `GET /foodcost/ricette/per-ingrediente/{ingredient_id}` (`foodcost_recipes_router.py`): elenca le ricette che usano un ingrediente, con quantità impiegata, costo della riga e **incidenza %** sul food cost della ricetta (riusa `_calc_item_cost` / `_calc_recipe_cost`). Path a 2 segmenti → nessun conflitto con `/ricette/{recipe_id}`.
- Tab **Prezzi**: grafico Recharts dell'andamento prezzo (media mensile per fornitore) + storico prezzi + form "aggiungi prezzo" a comparsa.
- Tab **Ricette**: nuova vista — dove è usato l'ingrediente, con incidenza % colorata per soglia (verde <10%, ambra <20%, rosso oltre); riga cliccabile → scheda ricetta.
- Testa con 4 KPI: prezzo attuale, medio storico, oscillazione min–max, collegamenti (o "da correggere" se ci sono conversioni sospette).

### Modificato
- Collegamenti fattura ora **raggruppati per fornitore**; le righe con conversione sospetta restano evidenziate in ambra con "Correggi" inline.
- Tab **Anagrafica** con vista dati + form di modifica completo (nome, categoria, unità base, allergeni, codice interno, note); per i placeholder il pulsante diventa "Completa ingrediente".
- Tinta della testa derivata dalla categoria (ortaggi→verde, carne→rosso, pesce→blu, latticini→ambra, default arancio).
- **Flag conversione sospetta** ora considera il fattore: dopo «Correggi» (fattore ≠ 1) il collegamento — e l'ingrediente nella lista — torna verde. Prima restava giallo anche dopo aver impostato la conversione, dando l'impressione che la correzione non funzionasse. Fix sia frontend (`collegamentoSospetto`) sia backend (`list_ingredients` in `foodcost_ingredients_router.py`). Il messaggio post-correzione mostra anche il nuovo prezzo calcolato.
- **Lista ingredienti** (`RicetteIngredienti.jsx` v4.0) riallineata sul modello della Cantina vini: **sidebar filtri a sinistra** con, dall'alto, ricerca → lista categorie (con conteggi) → "da sistemare" (da completare / senza prezzo / conversione da verificare) → unità base → "mostra disattivati"; **tabella ordinabile** (riusa l'hook condiviso `useSortableTable`) con colonne nome/categoria/unità/prezzo; «azzera filtri».
- `versions.jsx`: modulo ricette `3.29 → 3.30`.

---

## 2026-05-21 — Vini 3.60: permessi catalogo aperti al sommelier `[core]`

Marco, loggato come **sommelier**, non riusciva a modificare un vino madre (403 "riservata agli admin"). Il modulo Vini gatava tutta la scrittura del catalogo ai soli admin, mentre la doc `modulo_vini.md §11` prevedeva già il sommelier: drift doc/codice. Ora codice e doc sono allineati.

### Aggiunto
- Helper `is_vini_manager(role)` in `app/services/auth_service.py` → `admin | superadmin | sommelier`. È il ruolo che **gestisce il catalogo vini**; `sala` e `viewer` restano in sola lettura.

### Modificato
- `vini_anagrafiche_router.py`: nuovo helper `_require_vini_manager`. I 17 endpoint di gestione catalogo (create/modifica/elimina di produttori, fornitori, denominazioni, vitigni, madre, bottiglia + `promote-composto`) passano da `_require_admin` a `_require_vini_manager`. Restano admin-only le 8 operazioni distruttive di massa: merge anagrafiche ×3, `migrate-from-legacy`, `denominazioni/sync`, `sync-all`, `rollback`.
- `vini_magazzino_router.py`: `update_vino_magazzino` (`PATCH /{id}` — scheda bottiglia + giacenze + toggle mescita) ora richiede `is_vini_manager` (prima **nessun** check: anche `viewer` poteva scrivere). `create_vino_magazzino` e `duplica` idem. `delete-vino` passa da admin-only a `is_vini_manager`. Bulk-update/bulk-duplicate restano admin-only.
- Frontend: `SchedaVino.jsx` calcola `roReadOnly` dal ruolo e nasconde i bottoni Modifica anagrafica / Modifica giacenze / toggle mescita / Duplica / Elimina ai ruoli non-manager. `MagazzinoSubMenu.jsx` e `DashboardVini.jsx` nascondono la voce "Nuovo vino" a `sala`/`viewer`.

### Note
- I **movimenti** (registra/elimina carico-scarico-vendita) restano accessibili anche a `sala`: sono azioni operative di servizio, non gestione catalogo. Lasciati intenzionalmente invariati.

### Anche — creazione madre senza denominazione
Il wizard "Nuovo Vino" (`NuovoVinoV2.jsx`) obbligava a selezionare una denominazione per creare un vino madre. Ma esistono vini che non ne hanno (vino da tavola, IGT generici). Ora la validazione richiede **denominazione _oppure_ nome etichetta** come riferimento per la descrizione composta — la denominazione torna opzionale (campo etichettato "Denominazione (opzionale)"). L'helper `componiDescrizione` già saltava gli ingredienti mancanti, nessuna modifica lì.

### Anche — bottiglia senza annata
Il wizard obbligava anche a inserire l'annata del "figlio" (bottiglia). Ma esistono vini senza annata (vino da tavola, spumanti non millesimati). Ora **l'annata è opzionale** in tutti e tre i livelli: validazione step 3 del wizard (`canAdvance` — si blocca solo su anno palesemente invalido, futuro o < 1900), modello Pydantic `BottigliaCreate.ANNATA` (da `Field(..., min_length=1)` a `Optional[str]`), e `create_bottiglia()` nel model (rimosso il `raise ValueError("ANNATA obbligatoria")`). La colonna `vini_bottiglie.ANNATA` era già nullable e le query di lettura ordinano già le bottiglie senza annata in fondo (ce n'erano già 7 nel DB). **Interpretazione confermata da Marco (modello A):** un vino senza annata = 1 madre + 1 bottiglia con annata vuota; non si gestisce nessuna lista annate, la giacenza resta sulla bottiglia come per tutti gli altri vini. Niente modifica al modello dati.

### Anche — modifica del vino madre dalla Cantina
Finora il vino madre si poteva modificare solo dal modulo Anagrafiche o durante la creazione di un vino. Dalla Cantina (vista raggruppata per madre) la scheda madre (`SchedaMadreV2`) era **read-only**. Ora ha un bottone **✎ Modifica** che apre `MadreEditModal`. Per riusare il modale senza creare un import circolare (`AnagraficheVini` importa già `SchedaMadreV2`), `MadreEditModal` + il suo helper `Field` sono stati **estratti** da `AnagraficheVini.jsx` nel file dedicato `frontend/src/components/vini/MadreEditModal.jsx`, importato da entrambi. Il modale ora fa **self-fetch**: ricarica il madre completo via `GET /madre/{id}` e ripopola il form da lì, così funziona anche quando il `madre` arriva parziale (da `groupByMadre`, privo di produttore_id/denominazione_id/ecc.). Bottone gated `is_vini_manager` (admin/superadmin/sommelier); per gli altri ruoli resta il badge 🔒 READ-ONLY. Al salvataggio `CantinaV2` rifà `fetchData()` e la scheda si aggiorna.

### Anche — controllo annata duplicata nel wizard
Nel wizard "Nuovo Vino", se si sceglie un madre **esistente** e si crea un figlio (bottiglia) con un'annata che il madre ha già, `submitWizard` ora avvisa: fa `GET /madre/{id}/bottiglie`, confronta l'annata (vuota inclusa → "senza annata") e mostra un `confirm` con i dati della bottiglia già esistente (#id, annata, formato, giacenza). Stessa annata ma **formato diverso** (0.75 vs Magnum) è legittimo → avviso con conferma, non blocco. Il controllo è non bloccante in caso di errore di rete e non aggiunge passaggi nel caso normale (scatta solo a collisione reale).

### Anche — andamento giacenza giorno-per-giorno nella scheda vino
Nuova funzione: nella tab **Giacenze** della scheda vino c'è ora un box "📈 Andamento giacenza — ultimi 30 giorni" con grafico a linea step-after. Backend `giacenza_storica_vino()` in `vini_magazzino_db.py` + endpoint `GET /vini/magazzino/{id}/giacenza-storica?days=30`: replay forward di `vini_magazzino_movimenti` dal primo movimento storico (`CARICO += qta`, `SCARICO/VENDITA -= qta`, `RETTIFICA := qta` assoluto, `MODIFICA` no-op), giacenza a fine giornata di ogni giorno con forward-fill nei giorni senza movimenti. Output: `series` (uno per giorno), `qta_attuale`, `drift`, `offset`, `ricalibrata`, `parziale`, `min`/`max`/`primo_movimento`. **Calibrazione automatica:** se il replay forward non torna su `QTA_TOTALE` attuale (drift ≠ 0 — tipico per vini che esistevano già prima del primo movimento registrato, con bottiglie mai apparse come CARICO), la serie viene shiftata di `−drift` così che l'ultimo punto coincida con la giacenza di oggi; la forma della curva resta identica, cambia solo l'ancoraggio. UI con badge "🔧 ricalibrata ±N" (tooltip esplicativo) e "dati parziali", footer Min/Max/Oggi + data primo movimento, palette brand-blue `#2E7BE8`. Il box si aggiorna anche dopo registrazione/eliminazione movimenti, modifica giacenze e modifica data movimento.

### Fix regressione — toggle mescita al calice tornato accessibile a sala
Effetto collaterale del gating di `PATCH /vini/magazzino/{id}` a `is_vini_manager`: il toggle "bottiglia in mescita" passava da quell'endpoint, quindi **il widget Calici non permetteva più a `sala` di spegnere le bottiglie aperte**. Il toggle è un'azione **operativa di servizio**, non gestione catalogo. Soluzione (opzione 1, confermata da Marco): **endpoint dedicato** `PATCH /vini/magazzino/{id}/bottiglia-aperta`, accessibile ad **admin/superadmin/sommelier/sala**, che accetta solo i campi del servizio al calice (`BOTTIGLIA_APERTA`, `VENDITA_CALICE`, `PREZZO_CALICE`, `PREZZO_CALICE_MANUALE`, `NOTE`). `PATCH /{id}` resta gatato `is_vini_manager` per catalogo/giacenze. Migrati al nuovo endpoint i 4 punti che usavano il toggle: widget `CaliciDisponibiliCard`, `CartaVini`, `ViniVendite` (`patchAttivaCalice`), `SchedaVino` (`toggleBottigliaAperta`, ora abilitato anche per sala via `canCalici`).

### File modificati
`app/services/auth_service.py`, `app/models/vini_anagrafiche_db.py`, `app/models/vini_magazzino_db.py`, `app/routers/vini_anagrafiche_router.py`, `app/routers/vini_magazzino_router.py`, `frontend/src/pages/vini/SchedaVino.jsx`, `frontend/src/components/vini/MagazzinoSubMenu.jsx`, `frontend/src/pages/vini/DashboardVini.jsx`, `frontend/src/pages/vini/v2/NuovoVinoV2.jsx`, `frontend/src/pages/vini/AnagraficheVini.jsx`, `frontend/src/components/vini/SchedaMadreV2.jsx`, `frontend/src/pages/vini/v2/CantinaV2.jsx`, `frontend/src/components/widgets/CaliciDisponibiliCard.jsx`, `frontend/src/pages/vini/CartaVini.jsx`, `frontend/src/pages/vini/ViniVendite.jsx`, `frontend/src/config/versions.jsx`, `docs/modulo_vini.md`. Nuovo file: `frontend/src/components/vini/MadreEditModal.jsx`.

---

## 2026-05-21 — Fix Dashboard Vendite: giorni migliori/peggiori + click calendario `[core]`

Due bug segnalati da Marco sulla Dashboard Vendite.

### Corretto
- **Giorni migliori / peggiori** — l'endpoint `GET /admin/finance/stats/top-days` ordinava per `totale_incassi` (dato deprecato, spesso a 0) e includeva i giorni vuoti/futuri a zero; il frontend poi ri-ordinava per `corrispettivi` su quel set, producendo liste prive di senso. Ora l'endpoint ordina per `corrispettivi_tot` ed esclude i giorni a zero; il frontend (`CorrispettiviDashboard.jsx`) usa direttamente `top_best`/`top_worst` senza ri-filtrare.
- **Click su un giorno del calendario** — la cella rimandava a `/vendite/chiusure?date=X` ma `ChiusureTurnoLista.jsx` ignorava il parametro `?date=`. Ora la pagina legge `?date=`, si posiziona sul mese giusto, espande il giorno corrispondente e ci fa scroll automatico.

### File modificati
`app/routers/admin_finance.py`, `frontend/src/pages/admin/CorrispettiviDashboard.jsx`, `frontend/src/pages/admin/ChiusureTurnoLista.jsx`.

---

## 2026-05-21 — Export PDF corrispettivi per il commercialista `[core]`

Nuova funzione nel modulo Cassa/Vendite: export PDF del prospetto fiscale dei corrispettivi mensili, pensato per il controllo del commercialista.

### Aggiunto
- **Backend**: `build_corrispettivi_pdf(year, month)` in `app/services/corrispettivi_export.py` — legge la fonte unita (`_merge_shift_and_daily`: `shift_closures` primaria, `daily_closures` di ripiego), costruisce il prospetto giornaliero (Data, Giorno, corrispettivo lordo, imponibile 10%, IVA 10%, fatture, totale) con lo **scorporo IVA** (`_scorpora_imponibile`, arrotondamento commerciale half-up), una riga totali di mese e un **riepilogo IVA per aliquota** (lordo / imponibile / imposta). Genera il PDF col mattone M.B (`pdf_brand.wrappa_html_brand`). CSS compatto (`_corrispettivi_pdf_css`): un mese intero — anche 31 giorni — sta in una sola pagina A4.
- **Endpoint**: `GET /admin/finance/export-corrispettivi-pdf?year=&month=` — ritorna il PDF brandizzato (404 se il mese non ha dati).
- **Frontend**: bottone "📄 PDF commercialista" nella Dashboard Vendite (`CorrispettiviDashboard.jsx`), visibile in modalità mensile. Usa `openAuthedInNewTab` per il download auth-protetto.

### Note
- Classificazione `[core]`: logica di prodotto generica (ogni ristorante ha un commercialista); il branding PDF è già preso dalle stringhe locale.
- Il prospetto **non riproduce** il tracciato XML 7.0 dei corrispettivi telematici (formato di trasmissione macchina-a-macchina del RT): ne riporta solo la sostanza utile al commercialista (lordo + scorporo imponibile/imposta per aliquota).
- Sorgente = fonte unita shift+daily (stesso pattern di dashboard ed export Excel). I giorni che arrivano dalle chiusure turno non hanno lo split IVA: essendo somministrazione pura vengono trattati come interamente IVA 10% (decisione Marco 2026-05-21).
- **Nota architetturale**: la doppia tabella `daily_closures` (import Excel) vs `shift_closures` (chiusure turno) è il problema di fondo. Refactor pianificato: l'import Excel scriverà direttamente in `shift_closures` e `daily_closures` verrà migrata e dismessa (`roadmap.md` §K.12). Pianificato anche l'import dei file XML corrispettivi dal portale AdE come fonte aggiuntiva (§K.13).

### File modificati
`app/services/corrispettivi_export.py`, `app/routers/admin_finance.py`, `frontend/src/pages/admin/CorrispettiviDashboard.jsx`, `docs/modulo_vendite.md`, `docs/changelog.md`, `docs/sessione.md`.

---

## 2026-05-19 — Docs hardening post audit autonomo `[mixed]`

Sessione di sola documentazione, post audit autonomo (`docs/audit-2026-05-19/`, verdetto adversarial 87/100). Chiusura delle 5 decisioni PO in sospeso.

### Disambiguazione "Selezioni" (NOMEN-1 audit)
- **Rinominato** `docs/modulo_selezioni.md` → `docs/modulo_vendite.md` (contenuto storico spostato senza perdite).
- **Vecchio file** `modulo_selezioni.md` ridotto a stub redirect (Marco lo cancella con `git rm` in cleanup futuro).
- **Nuovo** `docs/modulo_selezioni_giorno.md` per i 5 router gemelli `scelta_*` di cucina (macellaio / salumi / formaggi / pescato / piatti del giorno) — gap CRIT-2 dell'audit.
- Link interni aggiornati in `modulo_cucina.md`, `modulo_banca.md`, `readme.md`, `database.md`.

### Stub Fatture in Cloud (CRIT-1 audit)
- **Nuovo** `docs/modulo_fatture_in_cloud.md` con tabella dei **17 endpoint reali** (l'audit dichiarava 12, verifica adversarial ha contato 17 in `fattureincloud_router.py`).

### Decisioni PO Marco (chiuse)
1. **NOMEN-1** → DISAMBIGUIAMO (fatto sopra).
2. **V-H.I cleanup `*_legacy.jsx` vini** → "non prima del 15 giugno" — `roadmap.md` §V aggiornato (rimosso vincolo settimanale, niente data limite).
3. **Endpoint `/menu/`** → "nel cassetto, poi lo faremo" — segnato in `inventario_pulizia.md`.
4. **MORT-2 turni vecchio + v2** → "lo vediamo quando sistemiamo meglio il modulo Dipendenti" — segnato in `controllo_design.md`.
5. **Mattone email M.D** → "non prioritario" — segnato in `architettura_mattoni.md` e `roadmap.md` §M.

### Disciplina docs in `CLAUDE.md`
Nuova sezione: "ogni nuova capability in un router → riga in tabella Capability del relativo `modulo_*.md`". Enforcement zero-cost per il futuro (raccomandazione 4 dell'executive summary).

### File modificati
**Docs prodotto:** `modulo_vendite.md` (nuovo), `modulo_selezioni.md` (stub redirect), `modulo_selezioni_giorno.md` (nuovo), `modulo_fatture_in_cloud.md` (nuovo), `modulo_cucina.md`, `modulo_banca.md`, `readme.md`, `database.md`.

**Docs di processo:** `sessione.md` (nuova entry), `changelog.md` (questa voce), `roadmap.md` (sezione Docs hardening + V-H.I + M.D), `controllo_design.md` (MORT-2), `inventario_pulizia.md` (/menu/), `architettura_mattoni.md` (M.D).

**Config:** `CLAUDE.md` (sezione Disciplina docs).

### Cosa NON è in questo commit
- Tabella Capability standardizzata su ogni `modulo_*.md` (4-6h, sessione dedicata)
- Split `modulo_cucina.md` → `cucina.md` + `task_manager.md` (CRIT-4 declassato, sessione dedicata)
- Estensione `push.sh` con warning router→docs (sessione tecnica separata)
- Verifica spot dei 3 claim manuale (PIN 60s, JWT 30min, vini esauriti)
- Refactor strutturale `docs/{moduli, specs, adr}/`

---

## 2026-05-19 — Vini 3.47 → 3.53 · F11 Hotfix giornata post-cutover `[core]`

Giornata di test ad osteria chiusa post-cutover refactor anagrafiche. ~10 bug fixati uno alla volta + UI clean-up + 2 feature.

### Backend (sed esteso `vini_magazzino → vini_bottiglie` su 5 file aggiuntivi)
- `vini_cantina_tools_router.py` — matrice + stampe inventario PDF (3 voci) + locazioni → senza fix erano 500 immediati.
- `vini_magazzino_db.py` — modulo core legacy (133 occorrenze), usato da `mag_db.matrice_get_stato()`, `mag_db.get_vino_by_id()` e decine di altri endpoint che altrimenti puntavano alla legacy archiviata.
- `vini_magazzino_router.py` — `/dashboard` + `/movimenti-globali` (vendite Marco).
- `vini_xlsx_v2.py` — import/export Excel.
- `vini_settings.py` — query distinct NAZIONE/REGIONE.

Per ognuno: sed regex con boundary `[^_.]` per evitare di toccare `vini_magazzino.sqlite3` (file path) e `vini_magazzino_movimenti/note` (satellite NON rinominate).

### Frontend
- **Banner "READ-ONLY · per modificare apri Cantina classica"** rimossi in 4 punti: `SchedaVino.jsx` footer, `SchedaVinoV2.jsx` header, `CantinaV2.jsx` scheda inline, `GestioneVino2.jsx` top-right.
- **`readOnly={false}`** in `SchedaVinoV2` + scheda inline `CantinaV2`: la cantina v2 è ora pienamente scrivibile.
- **BulkActionBar Cantina v2**: rimossi bottoni "Modifica" + "Duplica" che erano disabilitati come placeholder.
- **Wizard Step 4**: rimossa 4° LocCard "Locazione 3" (gestita automaticamente dalla matrice come in SchedaVino). Le celle pre-selezionate ora contano nel totale + nello sblocco "Avanti".
- **Wizard Step 3**: auto-calcolo Prezzo Carta da Listino `onBlur` via endpoint `/vini/pricing/calcola` (replica MagazzinoViniNuovo legacy).
- **Bottone "🗑️ Elimina vino"** nel footer SchedaVino — doppia conferma + cascade DB (movimenti, note, celle matrice). Visibile solo se `!readOnly`.
- **Bottone "🍷 Vai al madre"** nel footer SchedaVino — prop opzionale `onOpenMadre(mid)`. Da Cantina v2 inline apre scheda madre via `handleMadreClick`. Da SchedaVinoV2 route naviga a `/vini/v2/cantina?vista=madri&openMadre={mid}` con auto-apertura sul mount.
- **Stale cache fix**: `onVinoUpdated={fetchData}` in CantinaV2 → quando si modifica un vino, la lista bottiglie viene ricaricata e la SchedaMadre mostra dati freschi.

### Bump versione
- frontend `versions.jsx`: vini **3.46 → 3.53** (3.47 sed F11 + 3.48 banner footer + 3.49 banner top + 3.50 Loc3/matrice + 3.51 prezzo auto + 3.52 elimina + 3.53 vai al madre/cache).
- VERSION root: rimasto 5.15 (bumpato ieri per il cutover).

### Doc + memoria aggiornate
- `docs/modulo_vini.md` — nuova sezione "📌 STATO POST-CUTOVER (2026-05-19)" all'inizio: schema DB + relazioni + concetti semantici critici + UI + wizard + endpoint principali. Header bumpato a 3.53.
- `docs/roadmap.md` §V: V.6+V.7+V.8 marcati CHIUSI con sotto-tabella Fasi 1-10. Aggiunte V.20/V.21/V.22 da rivedere.
- `docs/sessione.md`: entry F11 con dettaglio di ogni fix.
- Memoria interna `project_refactor_anagrafiche_vini.md` aggiornata da "fasi 1-7 chiuse" a "CHIUSO 2026-05-19" con elenco lezioni operative.

### Task pending per future sessioni
- **V.20 / task #2** — Import/Export Vini v3 (template 3 fogli strutturato)
- **V.21 / task #3** — Bulk delete da BulkActionBar (XS)
- **V.22 / task #136** — Refactor UX Vista Sommelier (CartaStaff)

---

## 2026-05-18 — Sistema 5.15 · Cutover refactor anagrafiche vini (milestone strutturale)

Bump VERSION sistema 5.14 → **5.15** per riflettere il completamento del refactor anagrafiche V.6+V.7+V.8 — milestone strutturale del prodotto (schema DB cambiato, tabelle rinominate, architettura semplificata). Allineamento file `VERSION` root + `frontend/src/config/versions.jsx` campo `sistema.version`.

---

## 2026-05-18 — Vini 3.46 · CUTOVER refactor anagrafiche (3 sessioni: wizard attivato + Cantina classica spenta + rename atomico) `[core]`

### S1 — Wizard attivato (3.44)
- **Backend** `POST /vini/anagrafiche/bottiglia/` (creazione bottiglia in `vini_bottiglie_v2`) + schema `BottigliaCreate` + funzione `create_bottiglia()` con sync cascade dei campi anagrafici dal madre.
- **Frontend** `submitWizard()` in `NuovoVinoV2.jsx`: orchestra POST produttore (se _new) → POST madre (se _new, con denominazione + nome_etichetta + vitigni strutturati + grado) → POST bottiglia (annata + prezzi + flag + stati + locazioni) → loop POST `matrice/assegna` per ogni cella selezionata. PreviewModal evoluto in "Riepilogo prima della creazione" + schermata di successo.
- Badge UI "PREVIEW · nessuna scrittura" sostituito con "✓ SCRITTURA ATTIVA".

### S2 — Cantina classica spenta (3.45)
- **Backend `vini_repository.py`** (carta vini cliente PDF + calici + storico vendite, 4 SELECT) e **`ipratico_products_router.py`** (sync iPratico, 5 SELECT) refactorati per leggere da `vini_bottiglie_v2`.
- **App.jsx** route `/vini/magazzino/*` ora redirect a `/vini/v2/*`. Helper `RedirectMagazzinoToV2` per preservare `:id` nella scheda dettaglio.
- **ViniNav.jsx** v3.0: tab "Cantina" punta direttamente a `/vini/v2/cantina`. Tab "Cantina 2" rimosso (era ridondante).
- **9 file FE rinominati** in `_legacy.jsx` (MagazzinoVini, MagazzinoViniNuovo, MagazzinoViniDettaglio, MagazzinoAdmin, RegistroMovimenti, CantinaTools, MovimentiCantina, MagazzinoSubMenu, ViniDatabase). I file restano nel repo come archivio; saranno eliminati post-cutover stabile.

### S3 — Cutover atomico (3.46)
- **Mig 133** `app/migrations/133_cutover_rename_tabelle_v2.py`:
  - Backup esplicito del file SQLite con suffisso `.pre-cutover-YYYYMMDD-HHMMSS` PRIMA di qualunque ALTER.
  - Transazione atomica BEGIN/COMMIT: `vini_magazzino` → `vini_magazzino_legacy_YYYYMMDD` + 6 rename `vini_*_v2` → `vini_*`.
  - Verifica idempotenza: skip se cutover già applicato (rilevato dalla presenza di `vini_bottiglie` senza `vini_bottiglie_v2`).
  - Verifica integrità: ABORT con messaggio chiaro se mancano le 6 `_v2` o se il nome di destinazione esiste già.
  - Smoke test in sandbox: 14 tabelle finali, conteggi corretti (995 madre, 1287 bottiglie, 350 produttori, 40 fornitori, 1637 denominazioni, 68 vitigni); seconda run = skip idempotente.
- **Sed `_v2` → `""` nei 7 file backend runtime**: `vini_anagrafiche_db.py`, `vini_anagrafiche_sync.py`, `vini_anagrafiche_migrate.py`, `vini_anagrafiche_router.py`, `vini_v2_router.py`, `vini_repository.py`, `ipratico_products_router.py`. I file migrations 125-131 sono intoccati (storia).
- Tabelle satellite `vini_magazzino_movimenti`, `vini_magazzino_note`, `matrice_celle` RESTANO col nome attuale — refactor separato eventuale.

### Bump versione
- frontend `versions.jsx`: **vini 3.43 → 3.46** (3.44 S1 + 3.45 S2 + 3.46 S3).

### Note operative post-deploy
1. Marco prima del push: **backup VPS manuale** (zip cartella `app/data/` o tool dedicato). La mig 133 ne fa uno automatico interno, ma il manuale è un secondo livello di sicurezza.
2. Dopo il push, al boot del backend la mig 133 gira automaticamente: 1 backup file + 7 rename atomici. Tempo stimato <2 secondi.
3. **Smoke test post-deploy**: aprire Cantina → vedere 1287 bottiglie; aprire una scheda; creare un vino nuovo dal wizard; aprire carta cliente PDF.
4. **Rollback**: restore del file `app/data/vini_magazzino.sqlite3.pre-cutover-YYYYMMDD-HHMMSS` ripristina lo stato esatto pre-cutover.

---

## 2026-05-18 — Vini 3.43 · M2.9-ter: posizione scaffali (matrice) anche in creazione `[core]`

### Aggiunto
- **`MatricePicker.jsx`** estensione retrocompatibile: due nuove prop opzionali `pendingCells` + `onPendingChange`. Quando passate (e `vinoId=null`), il componente entra in **modalità "draft"**: i click pre-selezionano le celle nella lista controllata invece di chiamare le API `/cantina-tools/matrice/assegna|rimuovi`. Comportamento storico (live mode) invariato per SchedaVino → tab Giacenze.
- **Wizard `NuovoVinoV2.jsx` Step 4** — sezione "🗄️ Posizione scaffali (opzionale)" che monta `MatricePicker` in modalità draft, legato allo stato `annata.MATRICE_CELLE`. L'utente vede l'occupazione attuale della cantina, pre-seleziona le celle dove finiranno le nuove bottiglie. La persistenza vera su `matrice_celle` avverrà al cutover scrittura del wizard.
- **`PreviewModal`** mostra una nuova riga "🗄️ Posizione scaffali" con le celle pre-selezionate formato `(col,riga)`.

### Cambiato
- Rimosso il banner-testo "la posizione esatta si assegna dopo la creazione…" che bloccava l'utente: ora se sa già dove mettere le bottiglie, le mette subito.

### Decisione di design
- **Riuso del componente esistente**, niente fork. Marco: "non farei cose diverse, usa stesso codice, smetti di riscrivere". L'estensione draft è ~25 righe + 2 prop opzionali, comportamento esistente intatto.
- **Disponibilità anche in creazione**: la matrice scaffali è M:N condivisa tra vini, in qualunque momento ho la stessa view. L'utente decide se compilarla al volo o lasciarla per dopo (scheda → Giacenze) — non c'è motivo di forzare un solo punto.

### Bump versione
- frontend `versions.jsx`: **vini 3.42 → 3.43**.

---

## 2026-05-18 — Vini 3.42 · Fix descrizione composta bottiglia post-promozione `[core]`

### Fixato
Dopo aver promosso un madre legacy a composto (es. Barolo DOCG · Conteisa · Nebbiolo 100% · 14%), il banner "📜 DESCRIZIONE COMPOSTA (AUTO)" in Step 3 mostrava solo "Conteisa 14%" — mancava la denominazione e i vitigni. Causa: il record madre tornava dal backend con `denominazione_id` ma senza la label decorata, e i vitigni risolti erano in `vitigni_list` mentre il FE leggeva `vitigni`.

- **Backend `get_madre()`** decora ora il record con `denominazione_label` (`{nome} {tipo}` via JOIN). Coperto anche post-promozione (la funzione viene richiamata internamente).
- **Backend `list_madre()`** decora anch'esso con `denominazione_label` + `vitigni_list` via 6 LEFT JOIN in singolo SELECT (no N+1). Così quando l'utente seleziona un madre già esistente dalla lista in Step 2, lo state porta avanti i dati decorati senza fetch dettaglio extra.
- **FE NuovoVinoV2** (Step 3, Step 4, PreviewModal): `componiDescrizione` ora legge i vitigni del madre con fallback `madre.vitigni_list || madre.vitigni || []` — copre sia il caso `_new` del wizard sia il caso del madre caricato/aggiornato dal backend.

### Bump versione
- frontend `versions.jsx`: **vini 3.41 → 3.42**.

---

## 2026-05-18 — Vini 3.41 · M2.9-bis (vitigni strutturati sul madre) `[core]`

### Aggiunto
- **Mig 131** — `app/migrations/131_madre_vitigni_strutturati.py`: ADD COLUMN x10 su `vini_madre_v2` (`vitigno_1_id..vitigno_5_id` INTEGER + `vitigno_1_pct..vitigno_5_pct` REAL). Backfill best-effort: per ogni madre, copia i vitigni dalla bottiglia più recente (ANNATA DESC, id DESC). Idempotente: skippa madri già popolati. Smoke test in sandbox: 32 madri popolati su 995, il resto ha bottiglie senza vitigni strutturati (fallback corretto).
- **Backend model** — `promote_madre_a_composto` accetta ora una lista `vitigni: List[{vitigno_id, pct}]` (preferita) oltre a `vitigni_stringa` (deprecata). Risolve i nomi via JOIN, scrive i 5 slot strutturati sul madre, ricalcola la stringa per la composizione descrizione. `get_madre()` decora il record con `vitigni_list: [{vitigno_id, vitigno_label, pct}]`. `MADRE_FIELDS` esteso con i 10 nuovi campi.
- **Backend router** — `MadrePromotePayload` accetta `vitigni: List[VitignoSlot]`. `MadreBase`/`MadreUpdate` estesi con i 10 campi `vitigno_X_id`/`pct` per permettere update diretto via PATCH `/madre/{id}` (whitelist `MADRE_FIELDS`).
- **FE wizard** `NuovoVinoV2.jsx` — `PromuoviMadreModal` inizializza la lista vitigni dai dati del madre (`vitigni_list`), manda al backend i vitigni strutturati (non più solo la stringa).
- **FE anagrafiche** `AnagraficheVini.jsx` — `MadreEditModal` ha nuova sezione "🍇 Vitigni tipici (max 5)" con UI dinamica: zero campi vuoti pre-allocati, autocomplete + righe compatte `[nome] [% input] [×]`. Caricamento iniziale via GET `/madre/{id}` (vitigni_list già risolto). Save esplode la lista nei 10 slot del PATCH (slot non usati → null espliciti per cancellare i rimossi). La preview "Descrizione composta" ora include i vitigni come quarto ingrediente.

### Decisione di design
- **Semantica vitigni**: i 5 slot sul **madre** = blend "tipico" dell'etichetta (riferimento). I 5 slot sulla **bottiglia** = blend "effettivo" per quell'annata (può divergere). Non si sincronizzano: due semantiche distinte.
- **UI senza campi vuoti**: niente form con 10 campi statici. Pattern uniforme tra wizard e anagrafiche: autocomplete + righe dinamiche.

### Bump versione
- frontend `versions.jsx`: **vini 3.40 → 3.41**.

---

## 2026-05-18 — Vini 3.40 · M2.9-bis: promozione madri legacy a descrizione composta `[core]`

### Aggiunto
- **Backend** — `app/models/vini_anagrafiche_db.py`: nuova funzione `promote_madre_a_composto(mid, denominazione_id, nome_etichetta, grado_alcolico_tipico, vitigni_stringa)`. Aggiorna i 4 ingredienti, ricompone descrizione via helper `componi_descrizione`, setta `descrizione_auto=1`. Raise ValueError se composizione vuota. `MADRE_FIELDS` esteso con `nome_etichetta` + `descrizione_auto`.
- **Backend router** — `app/routers/vini_anagrafiche_router.py`: nuovo endpoint admin `POST /vini/anagrafiche/madre/{mid}/promote-composto` con payload `MadrePromotePayload`. Verifica FK denominazione, chiama model, cascade sync su bottiglie. `MadreBase`/`MadreUpdate` estesi con i 2 nuovi campi.
- **Wizard NuovoVinoV2 Step 2** — badge 📜 OLD inline sui madri legacy nella lista (`descrizione_auto=0`) + sulla card "vino madre selezionato". Niente badge sui madri composti (`descrizione_auto=1`) — sono lo standard.
- **Wizard NuovoVinoV2 Step 3** — banner warning con bottone "🔧 Sistema il madre" quando il madre selezionato è legacy. Non bloccante: si può proseguire senza promuovere. Nuovo componente `PromuoviMadreModal` (size lg, tone amber): form 4 ingredienti (autocomplete denominazioni, nome_etichetta, lista vitigni con %, grado), preview live della "Nuova descrizione" (helper JS `componiDescrizione`), descrizione attuale legacy in alto read-only. Submit → POST endpoint backend, aggiorna `madre` nel parent, banner sparisce.
- **AnagraficheVini MadrePanel** — badge 📜 OLD inline accanto a `descrizione` nella tabella madri. Filtro "📜 Solo legacy" per scoprire tutti i madri da promuovere.
- **AnagraficheVini MadreEditModal** — campo `nome_etichetta` aggiunto. Badge 📜 OLD / ✓ COMPOSTA in header. Preview "Descrizione composta (anteprima)" attivata quando l'utente ha denominazione + (nome_etichetta o grado) → la descrizione testuale si auto-disabilita. Al save in modalità composta, descrizione ricomposta e `descrizione_auto=1` settato nel PATCH.

### Convenzione decisa
- **Nuovo = standard, OLD = eccezione**: nessun badge sui madri composti. Marco: "sulle new non mettere un bollino, dovrebbe essere lo standard, piuttosto mettile su tutte le attuali che partono come OLD".
- **Promozione progressiva**: i 1287 madri legacy si sistemano organicamente man mano che vengono toccati (creazione annata o modifica). Niente job batch.

### Bump versione
- frontend `versions.jsx`: **vini 3.39 → 3.40**.

### Note
- L'endpoint promote è admin-only (errori 403 mostrati nel modal).
- Cascade sync su bottiglie chiamato automaticamente dopo la promozione (la descrizione è cache anche lì).
- Il `descrizione_auto` flag (colonna mig 130) viene scritto in modo idempotente: il madre già composto non viene "ri-promosso" se non cambia nulla.

---

## 2026-05-16 — M2.8: refactor ramo v2 con primitive M.I (palette amber unificata)

### Cambiato
- **NuovoVinoV2.jsx** — wizard rifatto interamente con primitive M.I: `Card` (wrapper + sezioni Step3), `Stepper`, `Btn` (Indietro/Avanti/Conferma/Ricomincia con varianti `secondary`/`warning`/`ghost`/`dark`), `TextInput`, `Select`, `Textarea`, `FieldLabel`, `SectionTitle`, `Modal` (preview finale). Spariti tutti i `const fieldCls = "..."` inline. Bottoni stepper-header e footer ora coerenti (entrambi Btn).
- **ProduttoriPanel.jsx** — toolbar filtri in `<Card tone="amber">` con `TextInput`/`Select`/`Btn`. `ProduttoreEditModal` ora usa `<Modal tone="amber">` + `FieldLabel`/`TextInput`/`Textarea`/`Btn`. Detail modal: `rounded-2xl` → `rounded-3xl` come da spec §9-bis pt 6, bottoni "Modifica"/"Chiudi" via Btn. Toolbar drill-down: palette `rose` → `amber` (era inconsistenza vecchia).
- **DistributoriPanel.jsx** — **palette `blue` → `amber` ovunque** (regola unicità modulo Vini), `EditModal` su `<Modal>` con primitive, `DetailModal` rounded-3xl + bottoni Btn.
- **VitigniPanel.jsx** — **palette `emerald` → `amber` ovunque**, `EditModal` su `<Modal>`, `DetailModal` rounded-3xl + Btn.
- **AnagraficheVini.jsx (DenominazioniPanel)** — **palette `violet` → `amber` ovunque** (toolbar sync, badge KPI, header dettaglio, modale merge param `palette="violet"` → `"amber"`).
- **MergeAnagraficaModal.jsx** — wrapper `rounded-2xl` → `rounded-3xl` (spec §9-bis pt 6).

### Risultato visivo
Tutto il modulo Vini ora è **monocromatico amber**, le 4 sotto-entità anagrafiche (Produttori/Distributori/Denominazioni/Vitigni) si distinguono solo per emoji+etichetta (🏛️ 🚚 📜 🍇) come prescritto dall'architettura. Modali standardizzate (`rounded-3xl`, header amber gradient, footer con Btn primitive). Form interamente sotto primitive: stessi padding/border/focus ring ovunque.

### Bump versione modulo vini
3.37 → 3.38.

### Non toccato (intenzionale)
- CantinaV2, PerProduttoreV2, SchedaMadreV2, GestioneVino2 — già usavano pattern coerente (Btn nell'header globale, palette amber già unica). I refactor lì sarebbero invisibili.
- MergeAnagraficaModal interno — usa ancora struttura custom (non Modal primitive) perché ha logica radio-table specifica, ma stile uniformato (rounded-3xl).
- Cantina classica — fuori scope strada B (regola refactor ramo v2 only).

### Prossimo
- Marco prova le 4 anagrafiche + wizard nuovo vino in Cantina 2 → check visivo coerenza.
- Eventuali ritocchi UX residui prima del cutover Fase 10.

---

## 2026-05-16 — M.I espansione: 9 nuove primitive UI condivise (no codice modulo)

### Aggiunto
Strada B post-audit guardiano sulla coerenza estetica Cantina 2: prima di rifare il ramo v2, espandiamo M.I con i mattoni che mancavano (causa root delle 6 deviazioni segnalate). Ora ogni nuovo form/modale/wizard parte da qui.

Nuovi file in `frontend/src/components/ui/`:
- **`FieldLabel.jsx`** — wrapper label sopra il campo, gestisce `required`, `hint`, `error`. Sostituisce le helper `FieldLabel` inline duplicate in 4 file.
- **`TextInput.jsx`** — input testo/number/email. `onChange` semplificato (riceve valore, non evento). Size sm/md/lg con touch target 40pt+ su md.
- **`Select.jsx`** — dropdown. Accetta opzioni come array di stringhe O di `{value,label,disabled}`. `placeholder` opzionale per opzione "vuota".
- **`Textarea.jsx`** — gemello di TextInput per multi-riga.
- **`Card.jsx`** — wrapper contenitore. Default = `rounded-3xl shadow-2xl` (specifica §9-bis pt 6). Tone neutral/info/success/warning/danger + amber/emerald/blue/violet/rose per evidenze contestuali.
- **`SectionTitle.jsx`** — titolo di sezione dentro form/card. Supporta subtitle + right slot (es. counter, link aggiuntivo). Tone modulare.
- **`Modal.jsx`** — modale standard: backdrop, ESC per chiudere, scroll body lock, header tone-colored sticky, body scrollabile, footer azioni configurabile. Sostituisce ~7 implementazioni custom in v2 e classico.
- **`Stepper.jsx`** — wizard multi-step (1→2→3) con stato done/active/pending visivo. Pulisce lo stepper inline del wizard nuovo vino.
- **`Pill.jsx`** + **`PillGroup.jsx`** (in stesso file) — toggle radio-style (Bottiglie/Madri/Per Produttore, chip filtri tipologia). API dichiarativa con `value`/`onChange`/`options`.

### Cambiato
- **`components/ui/index.js`** — barrel aggiornato con tutti i nuovi export. Import unificato: `import { Btn, FieldLabel, TextInput, Select, Card, Modal, ... } from "../../components/ui"`.
- **`docs/architettura_pattern.md`** — riga M.I in §3 aggiornata con elenco completo + nota "regola operativa". Nuova sezione §3-bis "M.I — guida operativa primitive UI" con: tabella "quando usare cosa", linee guida palette per modulo, lista antipattern espliciti.

### Razionale
Audit guardiano (2026-05-16) ha rilevato 6 deviazioni dalla coerenza estetica nel ramo Cantina 2 (bottoni inline, palette codificata per entità, card con shadow/radius inferiori alla specifica, modali ad hoc, form fields duplicati). Causa root: M.I aveva solo Btn/PageLayout/StatusBadge/EmptyState. Senza primitive form/contenitori/modali, ogni nuova pagina era costretta a reinventare. Questa espansione chiude il gap. Il ramo v2 sarà rifattorizzato nella sessione successiva usando solo queste primitive (sessione M2.8).

### Bump versione modulo vini
3.36.2 → 3.37 (anticipando che il refactor v2 prossimo userà M.I espanso).

### Prossimo
- **M2.8 — Refactor coerenza ramo v2**: NuovoVinoV2, CantinaV2, PerProduttoreV2, SchedaMadreV2, ProduttoriPanel, DistributoriPanel, DenominazioniPanel/AnagraficheVini, VitigniPanel → tutti riconvertiti per usare M.I (Btn, TextInput, Select, Card, Modal, FieldLabel, SectionTitle, Stepper, Pill). Risultato atteso: -25/30% righe nei panel + palette amber unificata + card/modali coerenti con la spec.

---

## 2026-05-16 — M2.7: Wizard Nuovo Vino 3-step (preview-only)

### Aggiunto
- **`pages/vini/v2/NuovoVinoV2.jsx`** `[core]` — sostituisce lo stub con il wizard completo:
  - **Step 1 Produttore**: search autocomplete sui produttori esistenti (`/vini/anagrafiche/produttori/?search=`), o creazione inline (nome, nazione, regione, provincia, città).
  - **Step 2 Vino madre**: lista madri del produttore selezionato (`/vini/anagrafiche/madre/?produttore_id=`), o creazione inline con form ricco (descrizione, tipologia, nazione, regione, grado alcolico tipico, distributore via dropdown fornitori, denominazione via autocomplete `/vini/anagrafiche/denominazioni/?search=&nazione=`, fino a 5 vitigni con autocomplete `/vini/anagrafiche/vitigni/?search=` + % opzionali, abbinamenti, note).
  - **Step 3 Annata**: form completo con tutti i campi annata raggruppati in sezioni (Identificazione, Prezzi, Flag presentazione, Stati gestione, Locazioni e giacenza iniziale, Note). Opzioni locazioni/formati caricate da `/vini/cantina-tools/locazioni-config` e `/settings/vini/valori-tabellati`.
- **Stepper visivo** in alto con progressione (done/active/pending) e crumbs delle selezioni precedenti come "chip" cliccabili visualmente.
- **Preview modale finale** `[core]` — al "✓ Conferma (preview)" mostra riassunto strutturato a 3 blocchi (Produttore / Vino madre / Annata) con badge "DA CREARE" vs "esistente #id". Banner esplicito "🧪 PREVIEW — nessuna scrittura su DB" sia nel footer del wizard sia nell'header del modale. Bottoni Ricomincia / Chiudi.

### Note di scope
- **Preview-only** (deciso con Marco): al submit non viene scritto nulla sul DB. Al cutover Fase 10 questo wizard sostituirà il MagazzinoViniNuovo classico e farà gli INSERT veri (in transazione su 3 tabelle: produttori/madre/bottiglie + eventuali nuove denominazioni se l'utente le aggiunge).
- **Step 3 completi** (deciso con Marco): tutti i campi annata della scheda classica, non solo i minimi. Coerente con SchedaVino in lettura.
- **Validazione minima**: Annata obbligatoria per avanzare. Resto opzionale (è preview, non serve robusta validazione DB).
- **Reset coerenza**: se in Step 1 l'utente cambia produttore esistente con uno diverso, il madre selezionato viene resettato (era del produttore precedente).

### Bump versione modulo vini
3.34 → 3.35.

### Stato suite M2 (Cantina 2 + Anagrafiche)
M2.1 ✓ · M2.2 ✓ · M2.3 ✓ · M2.4 ✓ · M2.4-bis/ter/quater/fix/5 ✓ · M2.5-arch ✓ · M2.5.1 ✓ · M2.5.2 ✓ · M2.5.3 ✓ · M2.5.4 ✓ · M2.5.5 ✓ · M2.6 ✓ · **M2.7 ✓ (oggi)**

Suite chiusa. Prossimo: testing utente esteso (Fase 9 refactor anagrafiche, 2-3 settimane di uso reale) + cleanup pre-cutover.

---

## 2026-05-16 — G.3 Fase E (E.4): endpoint import-paghe-pdf + UI dropzone multi-file

### Aggiunto
- **Endpoint `POST /dipendenti/buste-paga/import-paghe-pdf`** `[core]`. Riceve 1-N file PDF (anche misti), rileva il tipo per ogni file (`_detect_pdf_type` scansiona prime 3 pagine cercando keyword: "COSTO CONSUNTIVO" → ELAB, "Mod. F24 / UNIFICATO" → F24, "Libro Unico / Cedolino" → LUL). Per ELAB: chiama `parse_elab_pdf` → `_import_elab_to_db` con `INSERT OR REPLACE` su UNIQUE (anno, mese, matricola), match `dipendente_id` via `_match_dipendente` fuzzy esistente + riga sintetica AZIENDA per INAIL. Per F24: chiama `parse_f24_pdf` → `_import_f24_to_db` con `DELETE WHERE fonte_hash = ?` + INSERT (idempotente per hash). LUL viene skip con nota (usa flusso legacy). Ritorna riepilogo per file con righe inserite, dipendenti matchati/non-matchati, deleghe, periodi competenza, warnings.
- **UI dropzone Import ELAB / F24** `[core]`. `frontend/src/pages/dipendenti/DipendentiBustePaga.jsx`: nuovo bottone "📑 Import ELAB / F24" accanto a "Import PDF LUL" nell'header. Input file `multiple` per upload batch. Sotto l'header banner amber con riepilogo strutturato per file: badge colorato per tipo (🟢 ELAB / 🔵 F24 / 🟡 LUL skip / ⚠️ unknown/error), periodo competenza, righe inserite, dipendenti non-matchati per intervento manuale, warnings parser, conteggio righe riemesse (per re-import F24).

### Verifiche
- py_compile pulito su `app/routers/dipendenti.py`.
- JSX braces bilanciate (`DipendentiBustePaga.jsx` 958 righe, 466 `{` = 466 `}`).
- Test end-to-end in sandbox su PDF reali Aprile 2026:
  - **ELAB**: 11 record inseriti (10 dipendenti + AZIENDA INAIL), 7/10 dipendenti matched (Albuquerque/Vasilevskaya/Carminati multi-token recuperati dal fuzzy `_match_dipendente`). Re-import stesso PDF: 11 → 11 (idempotente via UNIQUE).
  - **F24**: 23 righe inserite (Erario 9 + Comuni 8 + INPS 4 + Regioni 1 + INAIL 1). Saldo totale = € 5.573,90 = saldi PDF al centesimo (90 + 5.483,90 + 0).
  - **CE post-import**: STAFF € 20.581,02 = 20.488,88 (dipendenti) + 92,14 (INAIL), modalità "completo", utile -1.643,62 (-3,4%), warning banner sparito ✓.

### Cambiato
Niente fuori dal modulo Dipendenti. L'endpoint è additivo. Marco quando avrà tempo carica gli 8 PDF di gen-apr 2026 (4 ELAB + 4 F24) in un colpo solo via dropzone e il CE retroattivo si correzionerà automaticamente.

### Prossimo (G.3 Fase E parte 2/2 chiusura)
- E.7: import retro 2026 (Marco usa l'endpoint E.4 per i mesi gen-apr — non serve mig dedicata)
- E.8: tab "Costi mensili" sotto modulo Dipendenti (vista per consultare il costo aziendale + F24 versati per mese)
- E.9: rimozione warning banner CE — solo dopo verifica Marco che tutti i mesi 2026 sono correttamente importati

---

## 2026-05-16 — M2.5.5 refactor + M2.6 Per Produttore (Cantina 2)

### Aggiunto
- **`utils/vini/sortableTable.jsx`** `[core]`. Helper condivisi `sortRows(rows, key, dir)` + `<SortTh>`. Estratti dai 4 panel anagrafiche dove vivevano duplicati identici. Da qui in avanti si importano.
- **`components/vini/MergeAnagraficaModal.jsx`** `[core]`. Componente generico di merge per tutte le anagrafiche. Props: `kind` (produttori/fornitori/denominazioni/vitigni), `palette` (amber/blue/violet/emerald), `source`, `candidates`, `countField` + `countLabel` + `reportField` + `reportLabel`, `renderSubtitle` opzionale. Sostituisce 4 implementazioni quasi identiche (~150 righe ciascuna).
- **`pages/vini/v2/PerProduttoreV2.jsx` (M2.6)** `[core]`. Pagina "catalogo" del modulo Cantina 2. Layout split:
  - **Sidebar sinistra** (320px): lista produttori della cantina con ricerca + filtro nazione + filtro "solo con giacenza > 0" + sort multi-criterio (Nome/Giacenza/N.vini). KPI rapidi per riga (vini · bottiglie).
  - **Content destra**: header con KPI del produttore selezionato, filtri (ricerca vino + tipologia), cards espandibili dei vini madre con tabella annate inline (annata, formato, qta totale, locazioni, prezzo carta, listino, tutte ordinabili). Bottone "📋 Scheda" → SchedaMadreV2 inline a piena pagina con "← Torna ai vini di {produttore}".
  - Stato persistente del produttore selezionato durante la sessione (state in-page). Lazy fetch delle madri al cambio produttore.

### Cambiato
- **ProduttoriPanel / DistributoriPanel / VitigniPanel / DenominazioniPanel** `[core]`. Tutti e 4 ora:
  - Importano `sortRows` + `SortTh` da `utils/vini/sortableTable` (rimosse le definizioni locali).
  - Usano `MergeAnagraficaModal` con parametri specifici al posto delle modali Merge custom.
  - Le 4 funzioni `Merge*Modal` interne sono state rimosse.
- **Risparmio righe netto**: ~600 righe duplicate eliminate (4 × ~150). I 4 file scendono mediamente del 25%.
- **Bump versione modulo vini** `[core]`. 3.33 → 3.34.

### Note
- I file panel mantengono il loro `import SchedaMadreV2` per il drill-down inline; VitigniPanel ne ha solo il riferimento dichiarato (no drill-down per i vitigni perché `/vini/v2/madri-raggruppate/` non filtra per vitigno_id senza una UNION sui 5 slot).
- La `CrudList` generica in `AnagraficheVini.jsx` resta nel codice ma non è più referenziata da nessun tab. Verrà rimossa in R7 (cleanup post-refactor).

### Prossimo (stop sessione)
- Marco prova le 4 anagrafiche e la nuova Per Produttore, manda feedback su UX/bug.
- M2.7 — Wizard "Nuovo Vino" 3-step (preview-only) resta in piano.

---

## 2026-05-16 — M2.5.4: Vitigni pannello dedicato (counts su 5 slot + merge)

### Aggiunto
- **Backend vitigni con counts + drill-down + merge** `[core]`. `vini_anagrafiche_db.py`:
  - `list_vitigni(with_counts, only_orphans, search)` — UNION ALL sui 5 slot `vitigno_X_id` delle bottiglie + GROUP BY per ottenere n_madre/n_bottiglie/qta_bottiglie distinti per vitigno.
  - `count_vini_per_vitigno(vid)` — conta veloce per dettaglio.
  - `list_madri_per_vitigno(vid)` — vini madre che usano il vitigno in almeno uno slot, aggregati con n_bottiglie/qta_tot.
  - `merge_vitigni(source, target)` — sostituisce source con target su tutti i 5 slot di tutte le bottiglie. Gestisce il caso "collisione" (bottiglia che già ha target in altro slot): azzera lo slot source per evitare duplicati. Percentuali NON ridistribuite.
- **Router vitigni esteso** `[core]`. GET `/vitigni/?with_counts&only_orphans`, GET `/vitigni/{id}?with_madri=true`, POST `/vitigni/{src}/merge?target_id={dst}` (admin).
- **VitigniPanel.jsx** `[core]`. Nuovo pannello dedicato (palette emerald): KPI riepilogativi (totale vitigni, vini madre con vitigno, bottiglie, orfani), tabella con colonne ordinabili (Nome / Note / Madri / Btg / Giac.), filtri ricerca + "solo orfani", riga cliccabile → modale dettaglio con lista vini madre, modale Edit/Nuovo, modale Merge duplicati (es. "nebbiolo" minuscolo → "Nebbiolo").

### Cambiato
- **Sotto-tab "Vitigni"** ora usa `VitigniPanel` (al posto della `CrudList` generica). La CrudList resta nel codice ma non è più referenziata — verrà rimossa in R7 (cleanup post-refactor).
- **Bump versione modulo vini** `[core]`. 3.32 → 3.33.

### Note
- Il drill-down vino → SchedaMadreV2 non è implementato qui perché l'endpoint `/vini/v2/madri-raggruppate/` non filtra per vitigno_id (richiederebbe UNION ALL sui 5 slot anche lì). Per ora il modale mostra solo la lista vini collegati con i totali; per aprire una scheda specifica si usa la Cantina classica o Cantina 2.

### Prossimo
- M2.5.5 — Cleanup: estrazione `useSortable` + componenti `SortTh`/`KpiCard` condivisi tra i panel anagrafiche (oggi duplicati nei 4 file).
- M2.6 — Cantina 2: Per Produttore (raggruppamento dedicato).

---

## 2026-05-16 — M2.5.3: Denominazioni CRUD admin + merge duplicati

### Aggiunto
- **Backend merge denominazioni** `[core]`. `vini_anagrafiche_db.py`: `merge_denominazioni(source_id, target_id)` sposta i vini madre da source a target, elimina source. Router: `POST /vini/anagrafiche/denominazioni/{src}/merge?target_id={dst}` (admin) con cascade sync (`sync_bottiglie_from_denominazione`) sul target per rinfrescare la cache `DENOMINAZIONE` nelle bottiglie.
- **UI Denominazioni full CRUD** `[core]`. `AnagraficheVini.jsx → DenominazioniPanel`:
  - Bottone **"+ Nuova denominazione"** nella toolbar (admin/sommelier) — apre `DenominazioneEditModal`. Casi d'uso: denominazioni non presenti in eAmbrosia/MASAF (es. "Costa Toscana IGT"). Marca `source="manual"` di default.
  - Colonna **Azioni** con ✏️ Modifica · 🔀 Fondi · 🗑 Elimina su ogni riga.
  - Modale **Merge denominazioni** con radio-selettore + filtro search; doppia conferma; alert con conteggio madri spostati.
  - Indicatore visivo "manuale" per le denominazioni custom (no codice eAmbrosia, source != eambrosia/masaf).
  - Avviso esplicito nella modale Edit: "se è una denominazione seedata, il prossimo sync potrebbe sovrascriverla — eAmbrosia/MASAF sono la fonte canonica".
- **Bump versione modulo vini** `[core]`. 3.31 → 3.32.

### Prossimo
- M2.5.4 — Vitigni: aggiunta vitigni custom oltre ai ~60 canonici (stesso pattern: + Nuovo + Edit/Delete; merge opzionale).

---

## 2026-05-16 — G.3 Fase E (E.5 + E.6): refactor service CE + tipo F24_STIPENDI

### Aggiunto
- **Tipo `F24_STIPENDI` su `cg_spese_fisse`** `[core]`. Quando Marco inserirà un F24 stipendi come spesa fissa generica (es. per memo cassa), si marca con questo tipo. **Competenza**: escluso dal CE (il costo è già nel `costo_aziendale_totale` via ELAB → no doppio conteggio). **Cassa**: incluso come esborso reale del mese (16 del mese successivo). Replica lo stesso pattern di `RATEIZZAZIONE_TASSE`: voce 📋 grigio acciaio in `ControlloGestioneSpeseFisse.jsx` TIPI + filtro "F24 stipendi" in `BancaCrossRef.jsx` + backend router (`_sf_tipo_labels` / `TIPO_SPESA` / `VALID_TIPI`) + `conto_economico.py` `tipi_esclusi_competenza`.
- **Endpoint CE ora apre dip_conn** `[core]`. `controllo_gestione_router.py`: nuova helper `get_dipendenti_db()` che apre `locali/<tenant>/data/dipendenti.sqlite3` con graceful fallback a `None` se il file non esiste (ambiente legacy). L'endpoint `GET /conto-economico` passa la connessione a `compute_pl`.
- **Tipo riga `costo_consuntivo` nel drill-down CE** `[core]`. `ControlloGestioneContoEconomico.jsx` v1.2: nuovo badge viola "Costo azienda" sotto STAFF. Deep-link su `/dipendenti/buste-paga` (futuro E.8 → vista "Costi mensili").

### Cambiato
- **`_aggregate_stipendi` riscritto con dual-mode** `[core]`. `app/services/conto_economico.py`: nuova firma `(fc_conn, periodo_rif, dip_conn=None, anno=None, mese=None)` che ritorna `(righe, meta)`. Logica:
  1. Se `dip_conn` aperta + tabella `dipendenti_costo_consuntivo` presente + ci sono record per `(anno, mese)` → modalità **"completo"**: legge il costo aziendale vero (lordo + carico ditta + ratei + TFR per ogni dipendente, + riga sintetica `AZIENDA` per INAIL).
  2. Altrimenti → modalità **"netti_fallback"**: legge i netti bonificati da `cg_uscite STIPENDIO` come pre-Fase E + warning "costo personale parziale".
  Output: `_meta.costo_personale.modalita` = `"completo"` | `"netti_fallback"`, usato dal frontend per nascondere/mostrare il warning banner.
- **Warning banner CE diventato condizionato** `[core]`. `ControlloGestioneContoEconomico.jsx`: prima era hard-coded sempre visibile. Ora si mostra solo se `data._meta.costo_personale.modalita === "netti_fallback"`. Per i mesi importati da ELAB sparisce automaticamente.
- **`compute_pl` accetta `dip_conn`** `[core]`. Nuovo parametro opzionale per la connessione `dipendenti.sqlite3`. Backward compatible (default `None` → comportamento pre-Fase E identico).

### Verifiche
- py_compile pulito su conto_economico, controllo_gestione_router.
- Test 1 — `dip_conn=None`: STAFF 12.140 (= netti), utile 6.797 (13,9%), warning attivo. Identico a oggi ✓.
- Test 2 — `dip_conn` ma tabella vuota: idem fallback netti. Codice di check `count(*) WHERE anno=? AND mese=?` ✓.
- Test 3 — dati ELAB Aprile simulati (10 dipendenti + INAIL azienda): STAFF 20.581,02 = 20.488,88 (somma dipendenti) + 92,14 (INAIL) → esatto al centesimo vs PDF. Utile netto -1.643,62 (-3,4%) — perdita reale rivelata. Drill-down 11 righe split (10 STIPENDI + 1 INAIL). Warning costo personale sparito ✓.

### Prossimo (G.3 Fase E parte 2/2 continua)
- E.4: UI Dipendenti "Carica buste paga del mese" (dropzone 3 file LUL+ELAB+F24)
- E.7: mig 133 import retro gen-apr 2026 dai 8 PDF archiviati (4 ELAB + 4 F24)
- E.8: tab "Costi mensili" in Dipendenti

---

## 2026-05-16 — G.3 Fase E (parte 1/2): schema DB + parser ELAB + parser F24

### Aggiunto
- **Migration 132 — schema costo personale completo** `[core]`. `app/migrations/132_g3_fase_e_costo_personale.py`: crea tabella `dipendenti_costo_consuntivo` in `dipendenti.sqlite3` (21 colonne: ore, lordo, contributi ditta, ratei, contr/ratei, TFR, INAIL, costo_totale + meta) e tabella `f24_versamenti` in `foodcost.db` (25 colonne: codice tributo, periodo, debito/credito, raggruppamento, link banca per riconciliazione cassa). UNIQUE su (anno, mese, dipendente) e (anno, mese, matricola). Indici su anno/mese, dipendente, raggruppamento, banca, codice tributo, hash. Idempotente (CREATE IF NOT EXISTS + cross-DB via PRAGMA database_list).
- **Parser ELAB pagine paghe** `[core]`. `app/services/elab_parser.py`: legge il PDF mensile "Riepilogo paghe e contributi" del consulente paghe, estrae dalla pagina "COSTO CONSUNTIVO DEL PERIODO" la tabella 13 colonne (matricola, cognome, ore, lordo, contributi, straord ore/imp/contr, ratei, ctr_ratei, TFR, totale, costo orario, % incid). Cattura riga `T O T A L I A Z I E N D A` come totale aggregato. Estrae anche INAIL del mese (pagina 2 sezione POSIZIONE INAIL). Anno/mese dal titolo "DAL MESE DI <X> <Y>". sha256 del PDF come anti-doppio import. Test su 3GOBBI_ELAB_4.pdf: 10 dipendenti estratti + totale azienda € 20.488,88 (= somma costo_totale dipendenti, zero discrepanza).
- **Parser F24 bozza Entratel** `[core]`. `app/services/f24_parser.py`: parsea il PDF F24 Entratel multi-pagina, riconosce 5 sezioni (Erario / INPS / Regioni / IMU-Tributi Locali / INAIL) tramite regex specifiche per layout. Codici tributo: 1001/1040/1075 (debito), 1704/6781 (CODICI_CREDITO compensazioni), DM10/EBTU/EST1/C10 (INPS), 3802 (add regionale), 3847/3848 (add comunali), 13100 (INAIL). Formato importi Entratel compressi ("9000" = 90,00; "1.41247" = 1.412,47). Data scadenza da "Scadenza 18 Maggio 2026". Test su 3GOBBI_F24_4.pdf: 3 deleghe estratte, saldi calcolati 90,00 / 5.483,90 / 0,00 = saldi PDF attesi al centesimo. Compensazioni 6781 (375,86 credito) + 1704 (1.237,42 credito su 4 mesi) riconosciute correttamente.

### Verifiche
- py_compile pulito su mig 132, elab_parser, f24_parser.
- Mig 132 testata in sandbox: tabelle create (21 + 25 colonne, 5 + 6 indici), re-run idempotente.
- Parser ELAB: 10 dipendenti + INAIL € 92,14 + Totale azienda € 20.488,88 — somma dipendenti = totale al centesimo.
- Parser F24: 3 saldi su 3 verificati al centesimo (90,00 + 5.483,90 + 0,00 vs saldi PDF originali).

### Cambiato
Niente. Schema DB nuovo + parser nuovi: zero impatto su CE e flow esistenti. Le tabelle nuove sono ancora vuote — saranno popolate via UI upload (task E.4, prossima sessione).

### Prossimo (G.3 Fase E parte 2/2)
- E.4: UI upload 3 file (LUL + ELAB + F24) sotto modulo Dipendenti
- E.5: refactor `_aggregate_stipendi` nel CE — legge da `dipendenti_costo_consuntivo` se presente, fallback netti
- E.6: nuovo tipo `F24_STIPENDI` in `cg_spese_fisse` (anti-doppio competenza)
- E.7: mig 133 import retro gen-apr 2026 dai PDF archiviati
- E.8: tab "Costi mensili" in Dipendenti
- E.9: rimozione warning banner CE "costo personale parziale"

---

## 2026-05-16 — M2.5.2: drill-down vini su Produttori/Distributori/Denominazioni + ordinamento ovunque

### Aggiunto
- **Drill-down vino dalla scheda anagrafica** `[core]`. In ProduttoriPanel, DistributoriPanel e DenominazioniPanel: il modale dettaglio mostra la lista vini collegati con riga cliccabile → la SchedaMadreV2 si apre **dentro lo stesso frame** (modale stesso, vista alternativa) con un bottone "← Torna alla lista". Niente modal-on-modal, niente cambio di route.
- **DistributoriPanel.jsx** `[core]`. Nuovo pannello per i distributori (tabella fornitori) — pattern identico a ProduttoriPanel: KPI riepilogativi, ordinamento colonne, ricerca (nome o rappresentante), checkbox solo orfani, modale dettaglio con vini distribuiti + drill-down inline, modali Edit/Nuovo, modale Merge duplicati. La label UI è "Distributori" — la tabella DB resta `vini_fornitori_v2`.
- **Backend distributori (fornitori) arricchito** `[core]`. `vini_anagrafiche_db.py`: `list_fornitori(with_counts, only_orphans)` con LEFT JOIN aggregato (`n_madre / n_bottiglie / qta_bottiglie`). Nuove `count_vini_per_fornitore`, `list_madri_per_fornitore`, `merge_fornitori`. Router: GET con `?with_counts&with_madri`, POST `/fornitori/{src}/merge?target_id={dst}` (admin, cascade sync).
- **Backend denominazioni con drill-down** `[core]`. `count_vini_per_denominazione` + `list_madri_per_denominazione` + GET `/denominazioni/{id}?with_madri=true`.
- **Filtri madri-raggruppate v2** `[core]`. `vini_v2_router.py`: `/madri-raggruppate/` accetta ora anche `fornitore_id` e `denominazione_id` (oltre a `produttore_id`). Permette ai panel di caricare le annate complete per il drill-down inline.

### Cambiato
- **Ordinamento colonne ovunque nelle Anagrafiche** `[core]`. Cliccando un'intestazione si ordina asc/desc. Implementato in:
  - DenominazioniPanel (Codice / Display / Nazione / Regione / Source)
  - MadrePanel (Descrizione / Produttore / Tipologia / Denominazione)
  - CrudList generica (usata per Vitigni) — pattern uniforme.
  - Già presente in ProduttoriPanel (M2.5.1) e ora nel nuovo DistributoriPanel.
- **Sotto-tab "Distributori"** ora usa `DistributoriPanel` invece della `CrudList` generica.
- **DenominazioniPanel** — righe cliccabili: apre modale dettaglio con vini collegati e SchedaMadreV2 inline.
- **Bump versione modulo vini** `[core]`. 3.30 → 3.31.

### Prossimo
- M2.5.3 — Denominazioni: gestione casi extra non in eAmbrosia/MASAF (CRUD + sync delta).
- M2.5.4 — Vitigni: vitigni custom oltre ai ~60 canonici.

---

## 2026-05-16 — G.3 Conto Economico Fase D (cascata fix) + aggregazione per RIGA

### Aggiunto
- **Drill-down 3 livelli nel CE** `[core]`. Espansione categoria → sottocategoria → righe singole con badge tipo (Fattura/Spesa fissa/Stipendio) + data + fornitore. `frontend/src/pages/controllo-gestione/ControlloGestioneContoEconomico.jsx` v1.1.
- **Deep-link sulle righe** `[core]`. Click su una riga: fattura → `/acquisti/dettaglio/:id`, spesa fissa → `/controllo-gestione/spese-fisse?highlight=:id`, stipendio → `/dipendenti/buste-paga`.
- **Percentuali sui ricavi (convenzione ristorazione)** `[core]`. Sostituite le % sul totale spese con % sui ricavi per Costo Merce (food cost) e Costi Operativi. Coerente con margine lordo e utile netto già espressi sui ricavi.
- **Barra "Ripartizione dei ricavi"** `[core]`. 3 fette (Costo merce + Costi op + Utile) somma 100% dei ricavi. Caso perdita: 2 fette + nota "Perdita del mese".
- **Tipo `RATEIZZAZIONE_TASSE`** `[core]`. Nuovo valore in `cg_spese_fisse.tipo` per cartelle/F24 pregressi rateizzati (Abaco, AdE, rottamazione), separato da `TASSA` (correnti del mese) e `RATEIZZAZIONE` (rate generiche non-tassa). Escluso in modalità competenza nel CE, incluso in cassa. Frontend `ControlloGestioneSpeseFisse` (voce 🧾 arancione) + `BancaCrossRef` (filtro "Rata tasse") + backend router (`_sf_tipo_labels`, `TIPO_SPESA`, `VALID_TIPI`).
- **Warning banner CE "Costo personale parziale"** `[core]`. Avviso esplicito che STAFF include solo netti bonificati; manca carico ditta + ratei + TFR + INAIL (~€ 8.000/mese di costi nascosti per Aprile 2026). Da rimuovere a chiusura G.3 Fase E.
- **PIN admin default random** `[locale:tregobbi]`. `app/services/auth_service.py`: il PIN admin di default non è più "0000" hardcoded ma generato random 6 cifre (`secrets.randbelow`) e stampato in console al primo avvio.
- **Piano G.3 Fase E in roadmap** `[core]`. Sezione dedicata in `docs/roadmap.md`: tasks E.1-E.9 (mig 132 schema, parser ELAB+F24, UI upload 3 file, refactor `_aggregate_stipendi`, anti-doppio `F24_STIPENDI`, mig retro gen-apr 2026, tab "Costi mensili" Dipendenti, rimozione warning).

### Cambiato
- **Aggregazione fatture CE per RIGA invece che per fornitore** `[core]`. `app/services/conto_economico.py` `_aggregate_fatture_per_categoria`: riscritta query con `JOIN fe_righe` + GROUP BY `f.id + categoria_riga`. Gerarchia fallback categoria: `fe_righe.categoria_id` → `fe_fornitore_categoria.categoria_id` → `'Non categorizzato'`. Una fattura con righe in N categorie viene spezzata in N entry (Sogegross 6934: 95,24 MATERIE PRIME + 222,70 BEVANDE + 157,24 Non cat). Counter `fatture_count` conta fatture DISTINTE (id unici). Effetto su Aprile 2026: "Non categorizzato" da € 6.677 a € 3.269 (-51%), UTENZE da € 70 a € 3.160 (A2A finalmente classificato).
- **Stipendi salvati con `periodo_riferimento` YYYY-MM** `[core]`. `app/routers/dipendenti.py:1478`: `periodo_rif = f"{anno}-{int(mese):02d}"` invece di `f"{MESI_IT[mese]} {anno}"`. Bug fix critico: prima `periodo_riferimento='Aprile 2026'` non matchava mai nel filtro WHERE del CE → stipendi invisibili nei costi operativi.
- **Default CSV import piani rate** `[core]`. `ControlloGestioneSpeseFisse.jsx`: `csvForm.tipo` default da `"TASSA"` a `"RATEIZZAZIONE_TASSE"` (il wizard CSV è esplicitamente per piani Abaco/AdE/PagoPA). Backend `/spese-fisse/import-csv` default `tipo` allineato.
- **`tipi_esclusi_competenza` nel CE** `[core]`. `conto_economico.py`: aggiunto `RATEIZZAZIONE_TASSE` alla lista. In competenza esclusi STIPENDIO+RATEIZZAZIONE+RATEIZZAZIONE_TASSE; in cassa esclusi solo STIPENDIO (anti-doppio col flow stipendi).

### Risolto
- **CE "load failed" HTTP 500** `[core]`. `app/services/conto_economico.py:115`: `f.escluso_acquisti` → `ffc.escluso_acquisti`. `escluso_acquisti` vive su `fe_fornitore_categoria` (regola critica CLAUDE.md), NON su `fe_fatture`. La query falliva con `OperationalError: no such column: f.escluso_acquisti`.
- **Stipendi non visualizzati nel CE** `[core]`. Combinato fix codice (vedi `dipendenti.py:1478`) + mig 130: normalizza retroattivamente 35 record `cg_uscite tipo='STIPENDIO'` da formato italiano testuale a YYYY-MM (Gennaio→Aprile 2026). Idempotente.
- **Rateizzazioni pregresse conteggiate come tasse correnti** `[core]`. Mig 131: identifica i record `cg_spese_fisse tipo='TASSA'` il cui titolo matcha pattern di rateizzazione (rateizzazione/abaco/rottamazione/definizione agevolata/saldo e stralcio) e li riclassifica a `RATEIZZAZIONE_TASSE`. Risultato Aprile: € 463,50 ([id=22, 23] Rateizzazione Abaco + Fondo Est) tolti dalla competenza P&L. Idempotente.

### Verifiche
- py_compile pulito su `conto_economico.py`, `controllo_gestione_router.py`, mig 129/130/131.
- JSX braces bilanciate (664 lines, 295 `{` = 295 `}`).
- Test conservazione importi: per ognuna delle 52 fatture di Aprile, somma degli split CE == imponibile DB (3 fatture con scarto 0,08-0,18€ da arrotondamento XML SDI; totale 0,13€ su 23.349€).
- Test split: Sogegross 6934 (475€) → 5 entry (MATERIE PRIME ERBE/FRUTTA 84,24 + MATERIE PRIME FORMAGGI 11,00 + BEVANDE VINO 202,86 + BEVANDE ALCOLICI 19,84 + Non cat 157,24 = 475,18 ✓).
- Numeri reali Aprile 2026 verificati end-to-end: Ricavi 49.057, Costo merce 12.936 (26,4%), Margine lordo 36.121 (73,6%), Costi op 29.324 (59,8%), Utile 6.797 (13,9% — ⚠ sovrastimato di ~€ 8.000 per costi staff incompleti, Fase E corregge).

---

## 2026-05-16 — SchedaMadreV2 full frame + M2.5.1 Produttori dedicato

### Aggiunto
- **SchedaMadreV2 a piena altezza inline** `[core]`. `frontend/src/components/vini/SchedaMadreV2.jsx`: altezza fissa `78vh` sul wrapper interno (coerente con `SchedaVino` classica `inline=true`) + `flex-1 overflow-auto min-h-0` sul contenitore tab. Risultato: header e TabBar sticky in alto, il contenuto tab scrolla nel suo riquadro invece di lasciare la scheda "afflosciata" sul contenuto.
- **Backend conta vini per produttore** `[core]`. `vini_anagrafiche_db.py`: `list_produttori(with_counts=True, only_orphans=False, nazione=None)` con LEFT JOIN aggregato che ritorna `n_madre / n_bottiglie / qta_bottiglie`. Nuove funzioni `count_vini_per_produttore`, `list_madri_per_produttore`, `merge_produttori`.
- **Endpoint dettaglio produttore arricchito + merge** `[core]`. `vini_anagrafiche_router.py`:
  - `GET /produttori/?with_counts&only_orphans&nazione&search` — lista con conteggi.
  - `GET /produttori/{id}?with_madri=true` — dettaglio con `n_madre / n_bottiglie / qta_bottiglie` + lista vini madre collegati.
  - `POST /produttori/{source}/merge?target_id={dst}` (admin) — sposta tutti i vini madre dal source al target, cascade sync sulle bottiglie ereditate via `ana_sync.sync_bottiglie_from_produttore`, elimina il source. Idempotente sul lato dati.
- **Pannello Produttori dedicato (M2.5.1)** `[core]`. `pages/vini/anagrafiche/ProduttoriPanel.jsx`: sostituisce la CrudList generica con UI ricca — KPI riepilogativi (totali + n.orfani), tabella con colonne ordinabili (Nome / Nazione / Regione / Madri / Btg / Giac.), filtri (ricerca + nazione + checkbox "solo orfani"), riga cliccabile → modale dettaglio con lista vini madre collegati, modali Edit/Nuovo, modale Merge duplicati (radio selettore destinazione, doppia conferma). Eliminazione bloccata se ci sono madri collegati (errore 409 dal backend).
- **Bump versione modulo vini** `[core]`. 3.29 → 3.30.

### Cambiato
- **`AnagraficheVini.jsx`**: sotto-tab "Produttori" ora usa `ProduttoriPanel`. La sotto-tab "Fornitori" mantiene label UI "Distributori" e usa ancora la `CrudList` generica (sarà rilavorata in M2.5.2).

### Prossimo
- M2.5.2 — Distributori: stesso pattern + colonna rappresentante.
- M2.5.3 — Denominazioni: gestione casi extra non in eAmbrosia/MASAF.
- M2.5.4 — Vitigni: aggiunta vitigni custom oltre ai ~60 canonici.

---

## 2026-05-16 — M2.4-5 prezzo_unitario sui movimenti + M2.5-arch nav refactor

### Aggiunto
- **Snapshot prezzo per movimento (mig 129)** `[core]`. Colonna `prezzo_unitario REAL` su `vini_magazzino_movimenti`. Backfill best-effort: VENDITA → `PREZZO_CARTA` attuale della bottiglia, CARICO → `EURO_LISTINO`, altri tipi NULL. Idempotente. Da oggi il ricavo per vendita è esatto (non stima), abbiamo storico prezzi di acquisto, margine effettivo, ricarico %.
- **`registra_movimento()` autopop** `[core]`. `app/models/vini_magazzino_db.py`: se chiamato senza `prezzo_unitario`, fa SELECT del prezzo dalla bottiglia (`PREZZO_CARTA` per VENDITA, `EURO_LISTINO` per CARICO). Nessuna chiamata legacy si rompe.
- **Endpoint `MovimentoCreate.prezzo_unitario`** `[core]`. `vini_magazzino_router.py`: campo Pydantic opzionale (Float, ge=0). Propagato a `registra_movimento()`.
- **Stats v2 madre con ricavo reale + costi acquisto** `[core]`. `vini_v2_router.py`: `/madre/{id}/stats` ora calcola ricavo via `COALESCE(m.prezzo_unitario, b.PREZZO_CARTA, 0)`. Nuovi campi `qta_acquisti` + `costo_acquisti_totale`. `/madre/{id}/movimenti` espone `prezzo_unitario`.
- **Form "Aggiungi movimento" con €/bt** `[core]`. `SchedaVino.jsx`: input prezzo unitario nel form con autopop intelligente in base al tipo movimento (VENDITA → PREZZO_CARTA, CARICO → EURO_LISTINO, altri vuoto), editabile manualmente, flag `prezzoMovTouched` evita override. Tabella movimenti con colonne €/bt e Totale.
- **Scheda Madre v2 — riga acquisti + margine** `[core]`. `SchedaMadreV2.jsx`: tab Statistiche aggiunge 4 KPI nuovi (Bt acquistate, Costo acquisti, Margine lordo, Ricarico %). Tab Movimenti distingue prezzo reale vs stima da backfill (asterisco + italic, footer con legenda).

### Cambiato
- **Nav Vini ristrutturata** `[core]`. `ViniNav.jsx`: tab "Gestione 2" rinominata "Cantina 2" (è una cantina alternativa, non un modulo generico). Nuovo tab "📚 Anagrafiche" → `/vini/anagrafiche` (admin/sommelier), promosso dalla sotto-pagina "🧪 Anagrafiche (beta)" che viveva sotto Impostazioni. Header interno di GestioneVino2.jsx: "🧪 Cantina 2".
- **Pannello Anagrafiche** `[core]`. Nuovo file `pages/vini/anagrafiche/AnagraficheHub.jsx`: pagina contenitore standalone con ViniNav globale + montaggio `AnagraficheVini`. Quest'ultimo perde il prefisso "🧪 beta" → "📚 Anagrafiche Vini". Sotto-tab "Fornitori" rinominata "Distributori" (UI only — la tabella DB resta `vini_fornitori_v2`, mappa 1:1). Voce rimossa da `ViniImpostazioni.jsx` (anagrafiche non sono impostazioni).
- **App.jsx** `[core]`. Lazy import `AnagraficheHub` + Route `/vini/anagrafiche` (`sub="settings"`).
- **Bump versione modulo vini** `[core]`. 3.28 → 3.29.

### Razionale design
- **"Anagrafiche" è il nome giusto** perché è già il vocabolario interno (backend `/vini/anagrafiche/*`, modulo `vini_anagrafiche_db.py`, docs `refactor_anagrafiche_vini.md`). Termine standard nei gestionali italiani.
- **"Distributori" è il vocabolario di osteria** (Marco), backend resta "fornitori" — solo label UI.
- **Cantina 2 non è una rinomina di path** ma solo label: `/vini/v2` e nome file invariati per non rompere link/routing/codice.
- **Sessioni successive (M2.5.1 - M2.5.4)** lavoreranno una sotto-tab alla volta (Produttori, Distributori, Denominazioni, Vitigni).

---

## 2026-05-15 — Modulo Gestione Vino 2 (M2 sessione 1: backend + nav + Cantina v2)

### Aggiunto
- **Backend `/vini/v2/*` read-only** `[core]`. Nuovo router `app/routers/vini_v2_router.py` con 4 endpoint sulla porzione `_v2` del DB: `GET /bottiglie/` (lista con filtri replica MagazzinoVini: search, tipologia, produttore, distributore, stati, flag, giacenza_positiva, missing_listino), `GET /bottiglie/{id}` (dettaglio bottiglia con campi anagrafici joinati dal madre come `m_*`/`p_*`/`f_*`/`d_*`), `GET /madri-raggruppate/` (vista raggruppata per madre con annate nested + qta_tot per madre), `GET /dashboard/` (KPI aggregati: n_bottiglie, n_madri, valore_carta, riepilogo per tipologia). Nessun POST/PATCH/DELETE — strategia read-only per test parallelo.
- **Frontend modulo `/vini/v2/`** `[core]`. Voce "🧪 Gestione 2" in `ViniNav` (admin/sommelier). Pagina entry `GestioneVino2.jsx` con sub-nav delle 4 viste (Cantina · Per Produttore · Nuovo vino · Scheda) + banner "test parallelo read-only" + link alla Cantina classica per modifiche reali.
- **CantinaV2 funzionante** `[core]`. `frontend/src/pages/vini/v2/CantinaV2.jsx`: sidebar filtri identica al codice esistente (Ricerca / Anagrafica / Stati / Flag / Giacenza), riepilogo tipologie chip cliccabili, tabella bottiglie stile reale (ID badge slate-700, colonna Vino con denominazione, sfondo riga per tipologia, chip Flag C/I/B/K + numero stato vendita). Toggle "🍾 Bottiglie" ↔ "🍷 Madri" che switcha la vista nel content area (lista flat vs raggruppata per vino madre). Click su una riga apre `SchedaVinoV2` (placeholder).
- **Placeholder stub** per `SchedaVinoV2`, `PerProduttoreV2`, `NuovoVinoV2`: pagine "in arrivo" con descrizione di cosa conterrà la sessione successiva. Routing in `App.jsx`.

### Strategia
- **Read-only**: durante il periodo di test parallelo (1-3 settimane), Marco modifica i vini solo dalla Cantina classica (scrive su `vini_magazzino`). Il modulo v2 mostra esclusivamente cosa c'è nelle `_v2` (popolate da clustering Fase 5 + sync runtime Fase 7). Niente sync delta da gestire.
- **Cutover** (Fase 10): quando Marco conferma che la nuova UI è solida, swap atomico delle tabelle + voce v2 della nav diventa la voce "Cantina" principale.

---

## 2026-05-15 — V-H.F: STATO_VENDITA TEXT → INTEGER 0..3 (codici parlanti)

### Cambiato
- **STATO_VENDITA rifattorizzato da 6 codici lettera a 4 livelli numerici** `[core]`. Pre-mig: 6 codici TEXT (N/T/V/F/S/C). Analisi su 1287 vini reali: 3 codici (N/T/S) mai usati, 1 (F) usato 1 volta; semantica bipolare V (385 in cantina) vs C (901 totali). Schema ridotto a 4 livelli intensity-ordered:
  - `0` = NON_VENDERE (bloccato in carta)
  - `1` = CONTROLLARE (verifica prima di proporlo)
  - `2` = VENDERE (default nuovi vini)
  - `3` = SPINGERE (promuovere attivamente in sala)
  Numerico → ordinamento naturale. Default DB = 2 per nuovi insert.

### Aggiunto
- **Migration 128** `[core]`. Rebuild colonna `STATO_VENDITA` TEXT → INTEGER su `vini_magazzino` E `vini_bottiglie_v2` (refactor anagrafiche). Pattern: ADD COLUMN nuova + UPDATE backfill con CASE mapping + DROP COLUMN vecchia + RENAME COLUMN. Backup esplicito pre-mig (`*.pre-mig-128-<ts>`). Idempotente: re-run su colonna già INTEGER fa no-op. Mapping: V→2, C→1, F→3, S→3, T→1, N→0, NULL→2.

### Refactor
- **Backend**:
  - `app/routers/vini_magazzino_router.py`: Pydantic `STATO_VENDITA: Optional[int] = Field(None, ge=0, le=3)` con descrizione aggiornata (Base + Update schemas).
  - `app/models/vini_magazzino_db.py`: bulk-fix init usa 2/1 invece di 'V'/'C'; query KPI `STATO_VENDITA IN ('V','F','S','T')` → `STATO_VENDITA >= 2`; ORDER BY CASE → `STATO_VENDITA DESC` (numerico naturale).
  - `app/services/vini_xlsx_v2.py`: `STATO_VENDITA_VALIDI = [0,1,2,3]`, hint del template + foglio "Riferimento valori" + cella di esempio aggiornati a 4 livelli.
- **Frontend**:
  - `frontend/src/config/viniConstants.js`: oggetto `STATO_VENDITA` con chiavi `0`/`1`/`2`/`3` invece di `N`/`T`/`V`/`F`/`S`/`C`. Tolti `T` ("cautela") e `S` ("aggressivo") semanticamente accorpati.
  - `frontend/src/pages/vini/SchedaVino.jsx`: badge conditional fix da `vino.STATO_VENDITA &&` (rotto per `0` falsy) a `vino.STATO_VENDITA != null && vino.STATO_VENDITA !== ""`.
  - `frontend/src/pages/vini/MagazzinoVini.jsx`: filter via `String(v.STATO_VENDITA) === String(statoVenditaSel)` per gestire mismatch INTEGER (backend) vs string (select HTML).
  - `frontend/src/pages/vini/AnagraficheVini.jsx`: fix `b.STATO_VENDITA != null` invece di `||` per non confondere `0` con assenza valore.

### Note
- `STATO_VENDITA` ora ordinabile naturalmente: `ORDER BY STATO_VENDITA DESC` mette SPINGERE in cima, NON_VENDERE in fondo.
- Pydantic accetta sia int che string-int ("2") nel payload PATCH per retrocompat con form HTML.

---

## 2026-05-15 — Discovery dinamica DB (push.sh + backup_router + backup_db.sh)

### Cambiato
- **push.sh — path canonico + lista DB dinamica** `[core]`. `DB_LOCAL` ora è `locali/$LOCALE/data/` (path canonico post R6.5 push 3) invece di `app/data/` (legacy). Lista DB scoperta via SSH `ls *.sqlite3 *.db` invece di lista hardcoded. Sia sanity-check pre-push sia sync DB sia post-deploy sanity check usano la stessa lista dinamica. Conseguenza: ogni DB nuovo aggiunto sul VPS in `locali/<id>/data/` viene scaricato automaticamente al prossimo push senza modificare lo script.
- **`app/routers/backup_router.py` — discovery dinamica** `[core]`. Rimossa costante `DATABASES` hardcoded, sostituita con `_discover_databases()` che scansiona `locale_data_dir()` per `*.sqlite3` e `*.db` (esclude journal `.wal/.shm` e backup `.prev/.bak/.pre-*`). Sia `/backup/info` sia `/backup/download` sia `/backup/list` usano la lista dinamica. `DATA_DIR` ora deriva da `locale_data_dir()`. Effetto: la UI Impostazioni → Backup mostra automaticamente tutti i DB presenti sul VPS, non più lista cablata.
- **`scripts/backup_db.sh` — lista DB dinamica** `[core]`. Anche il cron notturno scopre i DB dinamicamente (cerca in `$LOCALE_DATA_DIR` poi `$DATA_DIR`, dedup per nome, esclude file di journal). Effetto: il backup_db.sh ora include automaticamente qualsiasi nuovo DB (es. se aggiungiamo `carta_clienti.sqlite3` non serve toccare lo script).

### Note
- Il path locale-aware `locali/tregobbi/data/` sul Mac restava vuoto pre-fix: i DB venivano scaricati nel vecchio `app/data/`. Post-fix: tutti i 10 DB attivi (incluso `vini_magazzino.sqlite3` con le 6 tabelle `_v2` del refactor anagrafiche) vivono in `locali/tregobbi/data/`.

---

## 2026-05-14 — Refactor anagrafiche vini Fase 8 (opzione C, vista read-only annate)

### Aggiunto
- **Endpoint `GET /vini/anagrafiche/madre/{id}/bottiglie`** `[core]`. Ritorna le bottiglie (annate) collegate a un vino madre con campi annata-specifici (formato, prezzi carta/calice/listino, qta totale, stato vendita/riordino, locazioni, vitigni 5 slot). I campi anagrafici sono esclusi (sono ridondanza sincronizzata dal madre). Ordinato per annata DESC + formato.
- **UI modale "Annate"** `[core]`. Tab Madre della UI beta: bottone 🍷 accanto a ✏️ apre un modal read-only con header (descrizione madre, produttore, tipologia, nazione) + riepilogo (n. bottiglie, pezzi totali, annate, formati) + tabella annate con ID, annata, formato, prezzi, qta, stato, locazioni. Footer esplicativo: "per editare usa il Magazzino classico". Implementa l'opzione C del workflow Fase 8 (no inserimento nuove bottiglie fino al cutover).

### Note
- L'opzione A (creazione bottiglie in sandbox `_v2`) e B (dual-write su `vini_magazzino` con ALTER TABLE ADD COLUMN madre_id) sono rinviate. Marco testa prima la UI esplorativa, poi decide se procedere con l'inserimento vero.

---

## 2026-05-14 — Refactor anagrafiche vini Fase 7 (sync runtime + rollback)

### Aggiunto
- **Service sync runtime** `[core]`. `app/services/vini_anagrafiche_sync.py`: propaga i 9 campi anagrafici (PRODUTTORE, DESCRIZIONE, DENOMINAZIONE, TIPOLOGIA, NAZIONE, REGIONE, DISTRIBUTORE, RAPPRESENTANTE, ABBINAMENTI) dal `vini_madre_v2` + anagrafiche collegate verso `vini_bottiglie_v2`. 5 funzioni: `sync_bottiglie_from_madre/produttore/fornitore/denominazione` + `sync_all_bottiglie`. Una sola query JOIN per madre con fallback intelligenti (es. `madre.nazione || produttore.nazione`).
- **Aggancio automatico nei PATCH del router anagrafiche** `[core]`. I 4 PATCH (`/madre/`, `/produttori/`, `/fornitori/`, `/denominazioni/`) chiamano la sync corrispondente dopo l'update e includono `_sync: {...}` nel return per visibilità.
- **Endpoint `POST /vini/anagrafiche/sync-all`** `[core]`. Safety net contro drift. Esposto via bottone "🔄 Risincronizza tutto" in tab Panoramica della UI beta. Report inline (madre processati, bottiglie aggiornate, orfani skippati, durata).
- **Endpoint `POST /vini/anagrafiche/rollback?confirm=YES_DROP_V2_TABLES`** `[core]`. Distruttivo: droppa le 6 tabelle `_v2` riportando il DB pre-refactor. Backup esplicito pre-drop (file DB con suffisso `.pre-rollback-<ts>`). Nessun bottone UI — solo via curl admin per evitare click accidentali. Use case: finestra rollback fino a 24h post-swap.

### Cambiato
- **Vitigni — rimossa colonna `nazione_origine`** `[core]`. Era fuorviante per vitigni multi-nazione (Gewürztraminer in Italia/Germania/Alsazia, Pinot Nero in Francia/Italia/Borgogna, ecc.). L'info storica eventuale finisce in `note` come testo libero. Mig 127 riscritta con tuple `(nome, note)`. Comando one-shot dato a Marco per VPS: `ALTER TABLE vini_vitigni_v2 DROP COLUMN nazione_origine;` (eseguito).

---

## 2026-05-12 — Audit modulo Vini + hardening tecnico (A/H/B)

### Risolto
- **Bug FORMATO droppato dalla CRUD principale** `[core]`. Il campo `FORMATO` esisteva nel DB (`vini_magazzino.FORMATO`), era presente nel FE (SchedaVino, MagazzinoVini, MagazzinoViniNuovo) e veniva mandato nel payload, ma **non era nei Pydantic** `VinoMagazzinoBase` e `VinoMagazzinoUpdate` di `vini_magazzino_router.py`. FastAPI lo droppava silenziosamente. Risultato: cambiare formato di un vino tramite UI non aveva alcun effetto sul DB (solo l'import Excel via cantina-tools, che passa da `upsert_vino`, lo scriveva). Bug invisibile da quando esiste il campo. Aggiunto `FORMATO: Optional[str] = None` ai due schema. File: `app/routers/vini_magazzino_router.py:54-57, 150`.
- **V-BUG1 falso positivo** `[doc]`. La voce `problemi.md` V-BUG1 ("`POST /vini/magazzino/import` FORCE senza admin guard") **non corrispondeva ad alcun endpoint reale**. Verificati uno per uno tutti gli endpoint massivi del modulo Vini: `reset-database`, `import-excel`, `bulk-update`, `bulk-duplicate`, `delete-vino` — tutti hanno già admin guard. Voce chiusa.

### Cambiato
- **Roadmap V — priorità riviste** `[doc]`. Marco ha ridefinito le priorità della sezione Vini: prioritari V.1 → V.2 → V.3 → V.6 → V.7 → V.8 → V.5; basso V.4 (declassato da ALTA) + V.9-V.12; da valutare V.13-V.18. Aggiunta sezione "Hardening tecnico" con i 8 task V-H.A..H emersi dall'audit.
- **`docs/modulo_vini.md` §3.5** `[doc]`. Elenco campi della tabella `vini_magazzino` completo e categorizzato (anagrafica, prezzi, flag, stati, locazioni, metadati). Era fermo a 26 campi storici, ora i 35 reali con tipo e note.

### Memoria persistente
- **Vietato hardcodare soglie operative** `[doc]`. Marco ha esplicitato: ore/giorni/percentuali/cutoff non vanno hardcoded nel codice. Bloccare la sessione e proporre tabella `*_settings` + UI Impostazioni modulo. Eccezioni solo per costanti matematiche pure.

### Verificato (V-H.C, V-H.D)
- **Trailing slash route Vini** `[core]`. Censiti tutti gli endpoint del modulo Vini con `/` finale dichiarato: 5 in `vini_magazzino_router.py` (lista `GET/POST /`, `carta-staff/`, `calici-disponibili/`, `ordini-pending/`) + 3 in `bevande_router.py` (`sezioni/`, `voci/` GET/POST). Verificate tutte le chiamate FE corrispondenti: nessun mismatch. Il modulo è conforme alla regola CLAUDE.md sul trailing slash. Nessuna modifica al codice.
- **QTA_TOTALE già read-only via API** `[core]`. Audit: Pydantic `VinoMagazzinoBase`/`Update` non avevano `QTA_TOTALE` → impossibile patcharlo via FastAPI (audit precedente era impreciso, riga 127 del router era `QTA_LOC3`, non `QTA_TOTALE`). FE usa `QTA_TOTALE` solo in lettura. Aggiunto `data.pop("QTA_TOTALE", None)` in `update_vino` (`vini_magazzino_db.py:893`) come safety: se qualcuno in futuro chiamerà direttamente la funzione Python con `QTA_TOTALE` nel dict, viene scartato e ricalcolato da `_recalc_qta_totale` se le locazioni cambiano.

### V.6+V.7+V.8 — Refactor anagrafiche vini, Fase 6 (UI "🧪 beta")
- **Componente `AnagraficheVini.jsx`** `[core]`. Sezione dedicata sotto Impostazioni Vini → "🧪 Anagrafiche (beta)". Lavora ESCLUSIVAMENTE sulle tabelle `_v2` parallele — la UI vecchia del modulo Vini non è toccata. Tab navigation con 6 tab:
  - **Panoramica** — stats overview con conteggi (cliccabili per saltare al tab), checklist priorità verso cutover.
  - **Produttori** — CRUD generico con lista filtrabile + modale edit/create + delete protetto (409 se collegato a madre).
  - **Fornitori** — CRUD con campi inline rappresentante (nome/telefono/email).
  - **Denominazioni** — lista 1637 voci con filtri nazione/tipo, bottoni Sync (dry-run / commit) integrati per ricaricare da eAmbrosia + MASAF.
  - **Vitigni** — CRUD veloce per anagrafica canonica.
  - **Vini madre** — lista 995 cluster con filtro produttore + checkbox "Solo senza denominazione" (per gestire i 725 no_match dalla migrazione). Modale dettaglio madre con autocomplete denominazione live (typeahead).
- **Registrato in `ViniImpostazioni.jsx`** come voce di menu nuova + sectionRenderer. Marco apre Impostazioni Vini → "🧪 Anagrafiche (beta)" e vede tutto. Edit puntuali, niente bulk operations in questa fase.

### V.6+V.7+V.8 — Refactor anagrafiche vini, Fase 5 (migrazione dati clustering)
- **Service `vini_anagrafiche_migrate.py`** `[core]`. Pipeline di migrazione dei 1287 vini esistenti verso il nuovo schema anagrafiche:
  1. Produttori distinct (normalizzazione UPPER+TRIM+squash spazi, scelta nome canonico per frequenza + lunghezza + alfabetico) → INSERT in `vini_produttori_v2`.
  2. Fornitori distinct (con rappresentante inline scelto per frequenza) → INSERT in `vini_fornitori_v2`.
  3. Match denominazioni best-effort (match esatto su `(nazione, nome)`, fallback con rimozione suffisso DOC/DOCG/IGT/AOC) → link a `vini_denominazioni_v2`.
  4. Clustering `(produttore_norm, descrizione_norm)` → 1 riga `vini_madre_v2` per cluster, eredita dati anagrafici aggregati dalle bottiglie del cluster (tipologia/nazione/regione per most_common, grado_alcolico_tipico come media).
  5. UPDATE bottiglie con `madre_id` (orfane: bottiglie senza produttore).
  6. Parser VITIGNI TEXT con split su `,;/`, " e ", " & " + regex `\d+%` per percentuali. Match contro `vini_vitigni_v2` (case-insensitive) → popola 5 slot `vitigno_N_id` + `vitigno_N_pct`. Vitigni non riconosciuti restano in `VITIGNI TEXT` come fallback. Overflow oltre 5 slot conteggiato in report.
- **Endpoint admin** `POST /vini/anagrafiche/migrate-from-legacy?dry_run=true|false&force_reset=true|false`. Report dettagliato per step: produttori (esempi varianti per dedup ambiguo), fornitori, denominazioni (counts exact/no_match/ambiguous), madre (esempi inseriti), bottiglie linkate/orfane, vitigni (counts match/no_match/overflow + top vitigni non riconosciuti per debug).
- **Idempotente**: re-run safe (skip se anagrafiche già popolate). Con `force_reset=true` svuota `_v2` prima — solo per testing iterativo durante la validazione.

### V.6+V.7+V.8 — Refactor anagrafiche vini, Fase 4 (seed vitigni)
- **Mig 127 — seed vitigni base** `[core]`. Popola `vini_vitigni_v2` con 60 vitigni canonici (33 italiani — bianchi + rossi — e 27 internazionali). Idempotente via `INSERT OR IGNORE` su `nome` UNIQUE. Note descrittive su ogni vitigno (es. "Cannonau" → "Sardegna. Stesso vitigno del Grenache francese"). L'utente può aggiungere altri vitigni custom via endpoint CRUD esistente `POST /vini/anagrafiche/vitigni/`. Italiani inclusi: Nebbiolo, Sangiovese, Barbera, Aglianico, Glera, Trebbiano, Vermentino, Pinot Nero, ecc. Internazionali: Pinot Noir, Cabernet Sauvignon, Merlot, Chardonnay, Sauvignon Blanc, Riesling, Syrah, Tempranillo, Malbec, ecc.

### V.6+V.7+V.8 — Refactor anagrafiche vini, fix sync denominazioni
- **Mig 126 — rimuove UNIQUE(nazione, nome, tipo)** da `vini_denominazioni_v2` `[core]`. Il vincolo era troppo restrittivo: l'API eAmbrosia ha 5 casi rumeni con stesso (nazione, nome, tipo) ma `codice_eambrosia` diversi (es. "Dealu Mare" PDO con 4 codici per disciplinari progressivi). La vera chiave naturale è `codice_eambrosia` (già UNIQUE). Drop & recreate tabella (vuota al momento del fix). Aggiornati anche i commenti nella mig 125 per coerenza retroattiva.
- **Service nazioni: mapping esteso** `[core]`. Aggiunti codici ISO mancanti: NL→Paesi Bassi, BE→Belgio, DK→Danimarca, SE/FI/PL/EE/LV/LT/IE. Le voci eAmbrosia di queste nazioni ora hanno nome leggibile invece del codice.
- **Sync denominazioni completato** `[core]`. 1637 denominazioni vino UE inserite in `vini_denominazioni_v2`: 523 italiane (con menzione DOC/DOCG/IGT da MASAF), 440 francesi, 149 spagnole, 147 greche, 54 rumene, 54 bulgare, 46 tedesche, 44 portoghesi, ecc. Breakdown tipi: AOC 366, DOC 348, PDO 257 (fallback), PGI 167, IGT 109, DO 106, DOCG 77, ecc.

### V.6+V.7+V.8 — Refactor anagrafiche vini, Fase 3 (seed denominazioni)
- **Service `vini_denominazioni_sync.py`** `[core]`. Pipeline di sync denominazioni vino:
  1. **Fetch eAmbrosia API** (`https://webgate.ec.europa.eu/eambrosia-api/api/v1/geographical-indications`): scarica ~3995 voci EU, filtra `productType="WINE"` + `status="registered"` + non third-country. Per ogni voce estrae `fileNumber`, primo `protectedName`, `giType` (PDO/PGI), `countries[0]`, link al disciplinare.
  2. **Parser PDF MASAF** (`app/data/seed_denominazioni/masaf_dop_italiani.pdf` + `masaf_igp_italiani.pdf`): estrae mappa `codice_eambrosia → {menzione, regione}` per le ~505 denominazioni italiane (DOC/DOCG/IGT). Regex robusto su `(?:PDO|PGI)-IT-[A-Z0-9]+` (fix iniziale: `P[DG]O-IT-` non matchava PGI = "P+G+I", non "P+G+O").
  3. **Compose**: per le italiane usa la menzione MASAF (DOC/DOCG/IGT), per Francia mappa PDO→AOC PGI→IGP, Germania PDO→QbA PGI→Landwein, Austria PDO→DAC PGI→Landwein, altre nazioni `tipo = tipo_ue` (PDO/PGI fallback).
  4. **Upsert** su `codice_eambrosia` UNIQUE con confronto dei campi: INSERT se nuovo, UPDATE solo se cambia qualcosa, altrimenti aggiorna solo `last_synced_at`.
- **Endpoint admin** `POST /vini/anagrafiche/denominazioni/sync?dry_run=true|false` con report dettagliato (eAmbrosia voci totali, MASAF voci italiane parsate, denominazioni pronte, breakdown per nazione e per tipo, counts upsert).
- **PDF MASAF nel repo**: copiati in `app/data/seed_denominazioni/` come asset di seed (~500KB ciascuno). Datati 18.03.2026 (DOP) e 25.03.2026 (IGP). Aggiornabili manualmente sostituendo i file.
- **Idempotente**: re-run è no-op se i dati non cambiano (aggiorna solo `last_synced_at`).

### V.6+V.7+V.8 — Refactor anagrafiche vini, Fase 2 (backend CRUD scheletro)
- **Backend service + endpoint anagrafiche** `[core]`. Nuovo `app/models/vini_anagrafiche_db.py` con funzioni CRUD per le 5 tabelle anagrafiche (produttori, fornitori, denominazioni, vitigni, madre). Nuovo router `app/routers/vini_anagrafiche_router.py` con 26 endpoint su prefisso `/vini/anagrafiche/...` (GET lista + dettaglio, POST create, PATCH update, DELETE; + endpoint `stats/` per overview). Schemi Pydantic per tutte le entità con validazione FK su `madre` (verifica esistenza produttore/fornitore/denominazione prima di INSERT/UPDATE). Tutte le scritture admin-only, letture per tutti gli autenticati. Costanti centrali `TABELLE` per facilitare lo swap atomico finale (Fase 10). DELETE protetto: rifiuta se ci sono record collegati (errore 409 — es. eliminare produttore con vini madre collegati). Router registrato in `main.py`. Tabelle ancora vuote (popolate in Fase 3-4-5), gli endpoint rispondono `[]` per ora. La UI vecchia non chiama questi endpoint, niente impatto utente.

### Iniziato (V.6+V.7+V.8 — Refactor anagrafiche vini, Fase 1)
- **Mig 125 — setup impalcatura `_v2`** `[core]`. Backup esplicito pre-mig + CREATE TABLE di 6 tabelle parallele in `vini_magazzino.sqlite3`: `vini_produttori_v2`, `vini_fornitori_v2` (con rappresentante inline), `vini_denominazioni_v2` (con codice eAmbrosia UNIQUE), `vini_vitigni_v2` (anagrafica canonica), `vini_madre_v2` (etichetta stabile con FK a produttori/fornitori/denominazioni), `vini_bottiglie_v2` (= struttura completa di vini_magazzino + `madre_id` + 10 colonne per 5 slot vitigno + indici riproposti). Copia idempotente di tutti i 1287 vini esistenti da `vini_magazzino` → `vini_bottiglie_v2` (madre_id e slot vitigno restano NULL — popolati in Fase 5). Marco continua a usare il modulo Vini normalmente: questa migrazione è invisibile all'utente (nessuna UI tocca le `_v2`, nessun endpoint le espone, niente backend collegato in questa fase). Strategia blue-green rinforzata con 3 protezioni: snapshot espliciti per fase, endpoint rollback rapido (Fase 7), UI nuova etichettata "beta". Decisione architetturale scartata: "modulo Vini duplicato" (frontend+backend separati) — avrebbe introdotto sync delta movimenti al cutover senza ridurre la complessità reale. Design completo del refactor in `docs/refactor_anagrafiche_vini.md`.

### Rifatto (V-H.J)
- **Import/Export Vini v2 — eredità Excel eliminata** `[core]`. Vecchia logica completamente rimossa: `POST /vini/cantina-tools/import-excel`, `GET /vini/cantina-tools/export-excel`, `app/models/vini_model.py:normalize_dataframe + init_database + clear_vini_table`. Marco: "passato, elimina, ormai mesi che usiamo nuovo sistema". 3 nuovi endpoint: `GET /template-v2` (scarica template `.xlsx` ufficiale con 4 fogli — Vini con esempio, Locazioni dinamico, Riferimento valori, Istruzioni), `POST /import-v2` (skip se ID esiste, errore se ID inesistente, INSERT solo nuovi), `GET /export-v2` (tutti i vini nello stesso layout del template → round-trip pulito). Service nuovo `app/services/vini_xlsx_v2.py` con `TEMPLATE_COLUMNS` come single source of truth (schema autoritativo). UI Impostazioni Vini → sezione "Import / Export" rifatta a 4 card (Scarica, Importa, Esporta, Guida) + accordion admin per Reset DB. Risultato import dettagliato con riga + motivo errore. Chiave d'unicità per import: `id` (vini_magazzino.id). Per modificare un vino esistente → scheda gestionale, non import. `vini_model.py` ridotto a stub deprecati con `NotImplementedError` per impedire regressioni silenti.

### Normalizzato (V-H.E)
- **5 flag → 4 flag INTEGER + DISCONTINUATO eliminato** `[core]`. Tabella `vini_magazzino` rinormalizzata in single shot atomico (mig 124, backup esplicito pre-migration). I 4 flag `CARTA`, `IPRATICO`, `BIOLOGICO`, `VENDITA_CALICE` da TEXT `'SI'/'NO'` a INTEGER 0/1, coerenti con `BOTTIGLIA_APERTA`/`FORZA_PREZZO`/`PREZZO_CALICE_MANUALE` già INTEGER. `DISCONTINUATO` eliminato: era ridondante con `STATO_RIORDINO='X'` ("Non ricomprare"), eredità Excel. La migration: 1) consolida `DISCONTINUATO='SI'` → `STATO_RIORDINO='X'` (anche se STATO_RIORDINO era già valorizzato a qualcosa di diverso da X — l'intent dell'utente "fuori catalogo" ha priorità). 2) ADD COLUMN `*_INT`, backfill con CASE WHEN. 3) DROP COLUMN delle 5 TEXT vecchie. 4) RENAME `*_INT` → nome canonico. Richiede SQLite >= 3.35 (OK su Python 3.12). Idempotente. **Eccezione import/export Excel**: helper `_yn_to_int` e `_int_to_yn` in `vini_cantina_tools_router.py` mantengono il file Excel leggibile umano (SI/NO) mentre il DB resta INTEGER. Refactor totale 10 file (5 BE + 5 FE), ~50 occorrenze convertite. Tabella `vini` legacy (staging Excel `vini_model.py`) NON toccata: rimasta TEXT per ora, da rinormalizzare con il refactor import Excel (voce roadmap V-H.I).

### Aggiunto (V-H.G)
- **12 soglie operative Vini ora configurabili** `[core]`. Mig 123 introduce la tabella `vini_widget_settings` in `vini_settings.sqlite3` (key/value/tipo/descrizione/updated_at). Soglie raccolte da 6 file diversi:
  - `calici_fresh_hours` (default 12), `calici_alert_hours` (36) — widget Calici Disponibili
  - `vini_fermi_giorni` (30), `top_vendute_giorni` (30) — Dashboard Vini
  - `qta_suggerita_giorni_storico` (60), `qta_suggerita_divisore` (2) — alert riordino
  - `ritmo_soglia_top` (5), `ritmo_soglia_medio` (1) — classificazione `vini_metrics`
  - `decidi_calice_soglia_warn_pct` (40), `decidi_calice_soglia_block_pct` (50) — modale prezzo calice
  - `prezzo_calice_divisore` (5), `prezzo_calice_step_round` (0.5) — auto-calc prezzo calice
- **Service** `app/services/vini_widget_settings_service.py` — cache process-life, helper `calcola_prezzo_calice_default(prezzo_carta)` riusato da 4 punti (carta-staff, calici-disponibili, vini_repository, ricalcola-calici bulk). Single source of truth dei default (la migration importa da qui).
- **Endpoint** in `vini_settings_router.py`: `GET/PUT /settings/vini/widget/`, `POST /settings/vini/widget/reset` (admin).
- **Hook FE** `useViniWidgetSettings.js` con cache.
- **UI Impostazioni Vini → nuova sezione "Widget e soglie"** in `ViniImpostazioni.jsx`. Raggruppata per area, edit inline + Salva batch (con count modifiche pending) + Reset default (admin).
- **Refactor consumer**: `vini_metrics.py`, `vini_magazzino_db.py` (3 query interpolate), `vini_magazzino_router.py`, `vini_repository.py`, `vini_pricing_router.py`, `vini_router.py`, `CaliciDisponibiliCard.jsx`, `DecidiPrezzoCalice.jsx`.

---

## 2026-05-11 — G.7 + G.8 + 5 bug fix + ripristino dati audit

### Aggiunto
- **G.7 — UX "Sposta data" sulle scadenze cg_uscite** `[core]`. Card scadenza in `FattureDettaglio.jsx` ora 2 sotto-celle: "Scadenza iniziale" (read-only, dal XML SDI) + "Programmata" (editabile). Bottone "Sposta data" → modifica la programmata e setta automaticamente stato a `SPOSTATO`, preservando `data_scadenza_originale` alla prima rinegoziazione. Bottone "Ripristina originale" → reset `data_scadenza ← data_scadenza_originale` con ricalcolo `SCADUTO`/`PROGRAMMATO`. Endpoint backend: `PUT /controllo-gestione/uscite/{id}/scadenza` esteso + nuovo `PUT /controllo-gestione/uscite/{id}/ripristina-data`. Chip "Spostato" aggiunto in `FattureElenco.jsx` (drill-down filtro pagamento) e in `ControlloGestioneUscite.jsx` (palette fuchsia).
- **Bottone "Riapri rata" in modale Piano Rate (CG Spese Fisse) + nuova data opzionale** `[core]`. Per le rate `PAGATO_MANUALE` o `PAGATO` Marco può ora annullare l'errato segna-pagato dalla UI invece di doverlo fare in DB. Step 2 chiede via `window.prompt` la nuova data scadenza (default = 1° del mese prossimo); se compilata, viene applicata dopo il cambio stato — attivando automaticamente la logica G.7 `SPOSTATO` (preserva `data_scadenza_originale`). Per le rate riconciliate banca, prima scollega il link (`DELETE /uscite/{id}/riconcilia`), poi cambia stato a `PROGRAMMATO`, poi eventuale nuova data. Conferma utente differenziata per i due casi. File: `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx`.
- **Chip KPI Scadenzario Uscite ora con "filtrato / totale"** `[core]`. Quando un filtro periodo è attivo, i chip Programmato/Scaduto/Pagato mostrano due numeri: `(n_filtrato / n_totale_globale)`. Es. con filtro Mag 2026: "Scaduto € 3.942 (5 / 85)". Risolve confusione precedente tra chip top (filtrato) e sidebar (globale): ora i totali sono visibili anche nei chip principali. Quando i due numeri coincidono (nessun filtro periodo), mostra solo `n`. Tooltip: "Filtrate nel periodo / totali nel DB". File: `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx`.
- **Cleanup filtri speciali Scadenzario Uscite** `[core]`. (1) Rimosso "Mostra escluse" dalla UI: 0 fornitori hanno `escluso_acquisti=1` nel DB, il toggle era inattivo (backend resta retrocompatibile col param). (2) Aggiunto count "(N)" + tooltip esplicativo su "Mostra rateizzate" (45 fatture origine attualmente nascoste). (3) Aggiunto tooltip su "Solo in pagamento" che spiega quando si popola (= dopo creazione batch da "Gestisci batch"). (4) Pulita clausola SQL morta nel backend `controllo_gestione_router.py` riga 822: post-G.6 (rename `RATEIZZATA→RATEIZZATO`) il predicato `u.stato <> 'RATEIZZATO'` non matchava più nulla (0 hit). Ora il filtro è solo `f.rateizzata_in_spesa_fissa_id IS NULL` — semantica preservata, codice più pulito.

### Risolto (parte 2 — bug import critico)
- **Endpoint `/uscite/import` distruggeva VERIFICARE/SPOSTATO/RATEIZZATO** `[core]`. Il branch di protezione a riga 534 manteneva intoccabili solo `(PAGATO, PAGATO_MANUALE, PARZIALE)`. Per gli altri stati "decisi dall'utente" (VERIFICARE, SPOSTATO, RATEIZZATO) il re-import (sync FIC o manuale) li sovrascriveva con uno stato calcolato `PROGRAMMATO`/`SCADUTO` in base alla data. Risultato: le 138 fatture VERIFICARE ripristinate da mig 113 sono state travolte da un re-import successivo a G.6, finendo 108 in PROGRAMMATO + 30 in SCADUTO. Bug **preesistente** per DA_VERIFICARE, amplificato da G.6/G.7 con i nuovi stati. Fix: rifatto come whitelist invariante (vedi G.8 sotto).
- **Mig 115 — ripristino 138 VERIFICARE post-G.6** `[core]`. Riapplica la logica di mig 113 ma coi nomi post-G.6: trova le fatture coi marker `note_mig110` (CONTROLLARE 120 + RISTO TEAM 18 = 138) e, se cg_uscite.stato è PROGRAMMATO o SCADUTO, le riporta a VERIFICARE. Idempotente. Dry-run su DB locale: 120+18=138 update confermato.

### Aggiunto (parte 3 — G.8 livello macro/sotto)
- **G.8 — Tassonomia stato a 2 livelli (CHIUSO/APERTO)** `[core]`. Architettura difensiva: introdotto `cg_uscite.stato_macro` come **GENERATED ALWAYS AS ... VIRTUAL column** (mig 116). Si autocalcola da `stato` ad ogni read, impossibile finire in stato incoerente. Mappa: CHIUSO ← {PAGATO, PAGATO_MANUALE}, APERTO ← {tutti gli altri inclusi i 6 sotto-stati attuali e qualsiasi futuro}. VIEW `fe_fatture_with_stato` aggiornata per esporre `cg_uscite_stato_macro` al frontend.
- **Service centralizzato `app/services/stati_pagamento.py`** `[core]`. Costanti `STATI_CHIUSI`, `STATI_APERTI` (frozenset) + helper `is_chiuso()`, `is_aperto()`, `derive_macro()`. Un solo punto di verità per la tassonomia in Python.
- **Refactor `/uscite/import` come whitelist invariante** `[core]`. Da `if ex["stato"] in (lista esplicita di stati protetti)` a `if ex["stato"] not in {"PROGRAMMATO","SCADUTO"}`. Logica: solo PROGRAMMATO e SCADUTO sono derivati dalla data e quindi ricalcolabili. Tutti gli altri stati (presenti e futuri) sono decisioni utente protette per costruzione. Risolve in modo strutturale il bug dei VERIFICARE distrutti e immunizza contro futuri stati nuovi.
- **Helper frontend `frontend/src/utils/statoPagamento.js`** `[core]`. Mirror JS del service Python: `STATI_CHIUSI`, `STATI_APERTI`, `STATI_PAGATO_KPI` (frozen array) + helper `isChiuso`, `isAperto`, `deriveMacro`, `isPagatoKpi`. Refactor di 5 punti chiave (FattureDettaglio, ControlloGestioneUscite, ControlloGestioneSpeseFisse) che facevano tuple IN list hardcoded → ora usano gli helper. Punti dove serve granularità sotto (es. `stato === "PAGATO"` per check riconciliazione banca, drill-down filtro Riconciliato/Manuale) lasciati invariati per semantica.

### Risolto
- **Pagina Chiusure Turno completamente vuota** `[core]`. `frontend/src/pages/admin/ChiusureTurnoLista.jsx` faceva fetch a `${API}/admin/finance/shift-closures?from_date=...` senza trailing slash. FastAPI con `prefix="/admin/finance/shift-closures"` + `@router.get("/")` rispondeva 307 redirect → in alcuni setup di proxy l'header `Authorization` veniva strippato → 401 silente → frontend con `res.ok ? res.json() : []` cadeva in array vuoto. Marco non vedeva 401 in console perché il file usa `fetch()` diretto, non `apiFetch()`. Aggiunto trailing slash + commento esplicativo per evitare regressioni.
- **Widget Home "Incasso ieri" gonfiato (double-counting del pranzo)** `[core]`. `dashboard_router._incasso_ieri()` faceva `SUM(totale_incassi)` su pranzo+cena. Ma nel form Chiusura Turno i campi della CENA sono inseriti come valori CUMULATIVI giornalieri ("valori giornalieri — i parziali cena sono calcolati", lo dice anche `ChiusuraTurno.jsx:591`), mentre il pranzo contiene solo i parziali. Quindi sommare contava due volte il pranzo. Esempio 10/05: 1.963 (pranzo) + 2.866 (cena cumulativo) = 4.829 mostrato → corretto 2.866. Fix: `COALESCE(MAX(CASE WHEN turno='cena' THEN totale_incassi END), MAX(CASE WHEN turno='pranzo' THEN totale_incassi END), 0)`. Coerente con `vendite_aggregator.giorni_merged()` riga 89 (`base = cena or pranzo`). Applicato anche al sub-query "media stesso giorno settimana". Coperti restano SUM (sono per-turno).
- **Scadenzario Uscite: filtro periodo resta strict** `[core]`. Tentativi intermedi (bypass SCADUTO + cap 60gg) ROLLBACKATI dopo feedback di Marco: la UI non deve coprire dati sporchi con artifici, deve riflettere il filtro così come l'utente lo formula. Filtro = `data_scadenza ∈ [filtroDa, filtroA]`, fine. Le 61 fatture SCADUTO con data pre-2026 sono dati operativi vecchi mai aggiornati (PREGIS 40, METRO 9, ecc.): da bonificare con un audit dedicato (Excel + migration tipo 110), non da mascherare con UI. Tutte le SCADUTO hanno `data_scadenza` valorizzata (0 NULL), quindi il filtro strict è pulito.

### Cambiato
- **`app/routers/controllo_gestione_router.py`** — endpoint `PUT /uscite/{id}/scadenza` esteso (sessione G.7): se nuova data ≠ originale e stato in `('PROGRAMMATO','SCADUTO','SPOSTATO')`, setta `stato='SPOSTATO'` e salva `data_scadenza_originale` alla prima rinegoziazione. Nuovo endpoint `PUT /uscite/{id}/ripristina-data` (reset data + clear originale + ricalcolo stato).
- **`app/routers/dashboard_router.py::_incasso_ieri`** — query refactored per evitare double-counting cena cumulativa.
- **`frontend/src/pages/admin/FattureDettaglio.jsx`** — card scadenza ridisegnata in 2 sotto-celle (Iniziale + Programmata), bottoni Sposta/Ripristina, badge "spost.".
- **`frontend/src/pages/admin/ChiusureTurnoLista.jsx`** — trailing slash fix.
- **`frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx`** — colonna "Azioni" in tabella rate modale, funzione `riapriRata`.
- **`frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx`** — chip Spostato in palette fuchsia + filtro SCADUTO bypassa filtroDa.
- **`docs/stato_pagamento_unificato.md`** — §12 (G.6 rename stati al maschile) + §13 (G.7 SPOSTATO + UX Sposta data).
- **`docs/roadmap.md`** — G.7 marchiata ✅ FATTO.

### Risolto (parte 4 — bug nascosto modulo Dipendenti)
- **Bug `dipendenti.py` scriveva stati col vecchio nome `DA_PAGARE`** `[core]`. Riga 1415 (UPDATE) e 1425 (INSERT) erano hardcoded `'DA_PAGARE'`. Non aggiornati durante G.6. Conseguenza: le buste paga caricate post-G.6 finivano in `cg_uscite` con uno stato non più riconosciuto dal sistema (lo Scadenzario cerca `PROGRAMMATO`/`SCADUTO`, non `DA_PAGARE`). Marco oggi ha caricato 9 buste paga di aprile (scadenza 27/05): tutte 9 invisibili allo Scadenzario fino al fix. Fix: 2 occorrenze `'DA_PAGARE'` → `'PROGRAMMATO'`.
- **Mig 117 — rinomina residui + trigger di validazione `cg_uscite.stato`** `[core]`. Difesa strutturale DB-level: due trigger SQLite `trg_cg_uscite_stato_valido_insert/_update` che fanno `RAISE(ABORT)` se viene scritto uno stato non in `STATI_VALIDI = {PROGRAMMATO, SCADUTO, VERIFICARE, SPOSTATO, RATEIZZATO, PARZIALE, PAGATO_MANUALE, PAGATO}`. Da ora qualunque codice (presente o futuro) che provi a inserire un valore non valido fallisce con eccezione SQLite esplicita: niente più silent corruption come è successo con `DA_PAGARE`. Mig include anche rinomina idempotente residui (rifaceva quello di mig 114 + ripara nuove contaminazioni post-mig). Dry-run su DB locale: 9 residui `DA_PAGARE` ripuliti, trigger blocca scrittura vecchio nome con messaggio chiaro.

### Risolto (parte 5 — fix sera 11/05)
- **Bug `dipendenti.py` scriveva stato DA_PAGARE (vecchio nome pre-G.6)** `[core]`. Le 9 buste paga caricate alle 19:32 erano invisibili allo Scadenzario perché lo stato non era riconosciuto. Fix: sostituiti 2 occorrenze hardcoded `'DA_PAGARE'` → `'PROGRAMMATO'` in `app/routers/dipendenti.py` righe 1415/1425.
- **Mig 117 — TRIGGER SQLite validazione `cg_uscite.stato`** `[core]`. Difesa strutturale: 2 trigger `BEFORE INSERT/UPDATE` con `RAISE(ABORT)` se viene scritto uno stato non in `STATI_VALIDI` (8 valori). Da ora qualunque codice (presente o futuro) che provi a scrivere uno stato non valido fallisce con eccezione SQLite esplicita: niente più silent corruption.
- **Mig 118 — Settings dipendenti + giorno scadenza stipendi configurabile** `[core]`. Aggiunta tabella `dipendenti_settings (key, value)` con default `giorno_pagamento_stipendi_default='15'`. UPDATE retroattivo: 18 dipendenti `giorno_paga` 27→15 (Marco ha chiarito che la sua policy è il 15). Endpoint `GET/PUT /dipendenti/settings/`. Nuova sezione "Stipendi" in `DipendentiImpostazioni` con input 1-28.
- **Mig 119 — Fix retroattivo data scadenza 9 buste paga (27→15)** `[core]`. Le 9 caricate alle 19:32 erano con data 27/05; Marco ha chiesto di allinearle a 15/05. UPDATE su `cg_uscite` per STIPENDIO con data che termina in `-27` e stato non in PAGATO/PAGATO_MANUALE/PARZIALE.
- **Default filtri Scadenzario rivisto** `[core]`: ora `{PROGRAMMATO, SCADUTO, SPOSTATO, VERIFICARE}` (era `{PROGRAMMATO, SCADUTO, PAGATO}`). Apertura pagina = "cose da gestire del mese", niente pagati storici.
- **Bug COL D'ORCIA — save modale Piano Rate non persisteva** `[core]`. Backend POST `/spese-fisse/{id}/piano-rate` aggiornava `cg_uscite.data_scadenza` ma NON aggiornava `cg_piano_rate.data_scadenza_specifica`. Risultato: al primo re-import (sync FIC o manuale), `data_scadenza` veniva rigenerata da `sf.giorno_scadenza=1` cancellando la modifica utente. Fix: INSERT/UPDATE `cg_piano_rate` include ora `data_scadenza_specifica` quando viene passata `scadenza` nel payload. Anche branch protetto in `/uscite/import` per spese fisse esteso (whitelist invariante: solo `PROGRAMMATO/SCADUTO` ricalcolabili). Diagnosi fatta con logging temporaneo nel backend (poi rimosso). Caso confermato dal log: backend faceva `rowcount=1` ma sopra il successivo import rigenerava.
- **Mig 120 — backfill 45 fatture origine rateizzate → stato RATEIZZATO** `[core]`. Le 45 erano marcate `rateizzata_in_spesa_fissa_id NOT NULL` in `fe_fatture` ma in `cg_uscite` avevano stato `PROGRAMMATO/SCADUTO`. Conseguenze: il backend SELECT le mascherava con CASE come `stato='RATEIZZATO'`, ma `cg_uscite.stato` reale era altro → incoerenza tra "stato esposto" e "stato in DB". Mig 120 allinea i 45 a `RATEIZZATO`. Ripristinato il filtro completo `(rateizzata_in_spesa_fissa_id IS NULL AND u.stato <> 'RATEIZZATO')` (la clausola che pensavo morta era invece corretta — semplicemente nessuno valorizzava lo stato).
- **Fix `Mostra rateizzate` toggle nei filtri speciali** `[core]`. Con la mig 120 + filtro backend ripristinato + bypass frontend (quando toggle ON, RATEIZZATO passa indipendentemente da `filtroStato`), il toggle funziona come Marco si aspettava: OFF nasconde le 45 fatture origine, ON le mostra.
- **Bug SPOSTATO + VERIFICARE non selezionabili per batch pagamento** `[core]`. La whitelist `puoSelezionare` frontend e la lista `IN` nell'endpoint backend `/uscite/batch-pagamento` non includevano questi 2 stati post-G.6/G.7. Fix: frontend `puoSelezionare = isAperto(stato) && stato !== 'RATEIZZATO'` (tutti gli aperti tranne le fatture origine consumate). Backend: lista IN estesa a `('PROGRAMMATO','SCADUTO','PARZIALE','SPOSTATO','VERIFICARE')` in 2 punti (SELECT validazione + UPDATE marca batch). Pipeline `in_pagamento_at` end-to-end ora coerente: stato semantico resta intatto, badge "In pagamento" appare, e quando si conferma il pagamento (banca/contanti/carta/manuale) tutti i punti di reset del flag funzionano.

### Verifica post-deploy (su VPS dopo push)
- Backend riavviato OK (PID 801183, APP_VERSION 5.14, commit `a71d5527`), nessun errore in log
- `schema_migrations`: mig 115 applicata alle 14:15:15, mig 116 alle 14:37:18 ✓
- `SELECT COUNT(*) FROM cg_uscite WHERE stato='VERIFICARE'` → **138** ✓ (120 CONTROLLARE + 18 RISTO TEAM ripristinati come previsto)
- `GROUP BY stato_macro` → **APERTO 388 / CHIUSO 1746** ✓ (totale 2134 = 2089 visibili in UI + 45 fatture rateizzate nascoste di default)

### Note (non urgenti, in sospeso)
- **1291 "Da riconciliare" nel chip CG Uscite**: 1118 fatture + 166 spese fisse + 7 stipendi marcati `PAGATO_MANUALE` senza match banca. 521 da Fatture in Cloud (`fic_pagato_raw=1`), 754 senza data_scadenza. Da decidere se filtrare per orizzonte temporale per renderlo azionabile.
- **61 SCADUTO pre-2026** (PREGIS 40, METRO 9, FZ 4, ecc.): dati operativi storici mai aggiornati nel DB. Marco ha indicato: "sono già state sistemate operativamente, non urgente bonificare lo stato in DB". Eventuale audit Excel + mig 117 quando serve.
- **Discrepanza RT vs canali Chiusure Turno (10/05)**: € 2.143 di scarto tra chiusura RT (2.686 = battuto registratore) e somma canali pagamento (4.829 = contanti+POS+thefork). Non è bug software, è errore di battitura registratore o pre-conti aperti non ancora battuti. Da chiarire con chi chiude i turni.
- **FastAPI deprecation warning** in `app/routers/banca_router.py:2064` (`regex=` → `pattern=`). Non bloccante, da fixare in cleanup futuro.

---

## 2026-05-08 — Fix Home dashboard: 4 query rotte su moduli Vendite/Vini/Ricette/Flussi-cassa

### Risolto
- **Vendite "Incasso ieri €0" anche con turni regolarmente chiusi** — `dashboard_router._incasso_ieri()` cercava la tabella `shift_closures` in `foodcost.db`, ma da R6.5 il modulo cassa vive in `admin_finance.sqlite3` (locale-aware). L'eccezione era catturata silenziosamente e il widget cadeva in `IncassoIeri()` default zero. Realtà ieri (07/05): €1.348 / 21 coperti su 2 turni. Stesso bug propagato a `_coperti_mese()` (mostrava 0 invece di 172 coperti del mese).
- **Vini card "Cantina & Vini" generica (statica)** — query usavano colonne `attivo` e `scorta_minima` che non esistono nel DB Tre Gobbi. Le colonne reali sono in MAIUSCOLO (QTA, PREZZO, …). Eccezione swallowed → fallback statico. Realtà: 1.238 etichette in cantina, 1.261 bottiglie totali in giacenza.
- **Ricette card "Gestione Cucina" generica (statica)** — query cercava tabella `ricette` con `attiva` e `food_cost_pct`. Tabella reale è `recipes` con `is_active`, e non c'è colonna `food_cost_pct` (food cost si calcola via join recipe_ingredients × ingredient_prices, troppo costoso per un widget Home). Realtà: 48 schede attive, 34 piatti (di cui 5 senza prezzo vendita) e 14 basi.
- **Flussi cassa card "Flussi di Cassa" generica (statica)** — la tabella `flussi_cassa` non è mai esistita. Fonte reale: `finanza_movimenti` (foodcost.db) con colonne `dare`/`avere`/`data`. Saldo mese maggio: −€49.175 su 23 movimenti banca (tutti in uscita).

### Cambiato
- **`app/routers/dashboard_router.py::_incasso_ieri`**: collega ad `admin_finance.sqlite3` via `locale_data_path()`. Query identica.
- **`app/routers/dashboard_router.py::_coperti_mese`**: stesso refit DB.
- **`app/routers/dashboard_router.py::_alerts` blocco vini**: detection dinamica colonne via `PRAGMA table_info(vini)` (case-insensitive). Se schema cambia da locale a locale, il widget si adatta invece di crashare.
- **`app/routers/dashboard_router.py::_moduli_summary` blocco vini**: count etichette su tabella reale (no filtro `attivo` perché non esiste). Line2: "N bottiglie in giacenza" se c'è `QTA`, altrimenti "Giacenze ok".
- **`app/routers/dashboard_router.py::_moduli_summary` blocco ricette**: query su `recipes WHERE is_active`, breakdown `is_base 0/1` + count `selling_price > 0`. Line2: "X piatti · Y senza prezzo" + badge sui piatti senza prezzo (utile a chef per chiudere food cost).
- **`app/routers/dashboard_router.py::_moduli_summary` blocco flussi-cassa**: query su `finanza_movimenti` con `SUM(avere + dare)` (dare già negativo). Line2 mostra entrate, uscite e count movimenti del mese.

### Non toccato
- **Acquisti `1250 fatture / €588.608 in sospeso`**: dato VERO. Il calcolo è corretto, ma 1249 su 1250 fatture hanno `stato_pagamento='da_pagare'` (default import SDI) e solo 1 risulta `pagato_manuale`. È backlog di 3 anni di SDI mai marcate pagate, non bug del codice. Decisione di workflow rimandata — o si marcano pagate, o si cambia semantica del badge a "ultime 30gg da pagare".
- **Card statiche Controllo Gestione / Statistiche / Impostazioni**: restano con placeholder hardcoded. Non sono bug, sono spazi mai popolati.

### Verifica
Simulazione delle nuove query sui DB locali confermata (Marco fa Ctrl+Shift+R per pulire cache):

| Card | Prima del fix | Dopo il fix |
|---|---|---|
| Vendite | "€0 / 0 coperti" | "€1.348 / −36,2% vs media · 21 coperti" |
| Controllo Gestione (coperti) | "0" | "172 (vs 0 prec.)" |
| Vini | "Cantina & Vini" (statico) | "1.238 etichette in cantina / 1.261 bottiglie in giacenza" |
| Ricette | "Gestione Cucina" (statico) | "48 schede attive / 34 piatti · 5 senza prezzo" |
| Flussi cassa | "Flussi di Cassa / CC · Carta · Contanti" | "Saldo mese: −€49.175 / +€0 / −€49.175 · 23 mov." |

### Versioni
Nessun bump (fix puntuale di routing dati, no nuova feature, no cambio API).

### Note
- Fix `[core]`: dashboard_router è generico, modulo `platform`. Nessuna logica tenant-specifica.
- Nessuna migration DB. Nessun nuovo file. Nessuna dipendenza nuova.
- I 4 bug erano nascosti dietro `try/except: pass` con fallback statico, quindi invisibili a logging e a smoke test. Lezione: i fallback "soft" su funzioni della Home andrebbero loggati a WARNING con stack trace, non swallowed silenziosamente.

---

## 2026-05-07 (II) — Fix falsi positivi `lkg_corrupt` su check_backup_health.sh

### Risolto
- **Falsi `lkg_corrupt: foodcost.db / vini.sqlite3 / clienti.sqlite3`** segnalati da `check_backup_health.sh` ai run del minuto :00. Causa: race tra il cron del check (`*/30`) e il backup orario (`0 * * * *`) — quando il check apriva i file LKG mentre `update_lkg()::cp -f` li stava sovrascrivendo (operazione non atomica, `clienti.sqlite3` da 25 MB richiede centinaia di ms), `PRAGMA integrity_check` vedeva un file troncato e restituiva un errore. Il check successivo trovava i file integri ma il `.last_health_status.json` restava marcato "unhealthy" fino a che. Confermato da diff fra log 19:30 (`OK: 10/10`) e log 20:00 (`Corrotti: 3` esattamente sui 3 DB più grandi). Test manuale `sqlite3 PRAGMA integrity_check` fuori dalla finestra del cron: tutti `ok`. Nessun file LKG era realmente corrotto.

### Cambiato
- **`scripts/check_backup_health.sh`**: integrity check sulla LKG ora usa `sqlite3 -readonly` (no creazione di `.sqlite3-shm`/`-wal` orfani, fail-fast su file in scrittura) + retry-once dopo 3 secondi. Estratta la logica in helper `check_lkg_integrity()`. Il primo run cattura il caso normale, il retry assorbe la finestra di race senza falsi positivi. Se entrambi i passaggi falliscono, è corruption vera.
- **`scripts/backup_db.sh::update_lkg()`**: dopo il `cp -f` rimuove eventuali `<db>-shm`/`<db>-wal` residui nella LKG. Sono artefatti di vecchie versioni del check che aprivano in RW; col fix di sopra non se ne creano più di nuovi, ma puliamo i preesistenti e blindiamo da future regressioni o tool esterni.

### Da fare manualmente sul VPS
Sfasare il cron del check di 15 minuti per evitare anche solo l'apparenza di race con i tre cron di backup (orario alle :00, daily 03:00 e 18:00):

```
crontab -e
# cambiare:
#   */30 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh ...
# in:
#   15,45 * * * * /home/marco/trgb/trgb/scripts/check_backup_health.sh ...
```

### Versioni
- `VERSION`: 5.13 → 5.14
- modulo `sistema`: 5.13 → 5.14

### Note
- Fix `[core]`: nessuna logica tenant-specifica.
- Sicurezza: il sistema di backup vero non è stato toccato (è già v2 robusto). Solo il monitor del sistema è stato reso meno paranoico verso le finestre di scrittura del cron orario.

---

## 2026-05-07 — Fix UI Backup: parser timestamp dual-format + allineamento DB

### Risolto
- **Allarme rosso "Ultimo backup di X ore fa" pur con cron sano** — `app/routers/backup_router.py::_parse_folder_timestamp` accettava solo il formato vecchio `YYYYMMDD_HHMMSS` (con underscore), mentre `scripts/backup_db.sh` v2 (post-incidente 4 mag) genera cartelle nel nuovo formato `YYYYMMDDHHMMSS` (14 cifre, da `date +%Y%m%d%H%M%S`). Risultato: la UI ignorava tutte le 11 cartelle daily dal 5 mag in poi e mostrava come "ultimo backup" la cartella più recente del vecchio formato (4 mag 03:30, 88h fa) → allarme rosso, dimensioni sballate (0.03 MB perché contava solo file orfani), elenco "Backup giornalieri sul server" troncato a 3 voci. Il sistema di backup live era e resta perfettamente sano (`.last_backup_status.json` 15 OK / 0 falliti, daily 03:00 e 18:00 puntuali, Drive sync OK, LKG aggiornato).
- **Parser ora accetta entrambi i formati** con preferenza al nuovo (caso comune dal 5 mag in poi). Edge case respinti: stringhe non-cifra, lunghezze diverse, valori non parsabili come datetime.

### Cambiato
- **`DATABASES` in `backup_router.py` allineata con `DBS` di `backup_db.sh`** — aggiunti `notifiche.sqlite3`, `tasks.sqlite3`, `bevande.sqlite3` che il cron già backuppava ma che il download on-demand `/backup/download` non includeva. Ora il `.tar.gz` "Scarica backup completo" contiene tutti e 10 i DB attivi anziché 7.

### Versioni
- `VERSION`: 5.12 → 5.13
- modulo `sistema`: 5.11 → 5.13 (allineato a `VERSION`, era rimasto indietro dalla sessione 5.11)

### Note
- Il fix è `[core]`: il bug era in codice prodotto generico (parser di nomi cartella), si applica a qualsiasi locale.
- Nessuna migrazione DB. Nessuna modifica a `scripts/backup_db.sh` (la v2 sul VPS è già corretta).
- Le 3 cartelle storiche col vecchio formato (2/3/4 mag) restano visibili finché la rotazione non le pota dopo `RETAIN_COUNT_DAILY=14` cicli (~7 giorni). Dopodiché il vecchio formato sparirà naturalmente; il parser duale resta come safety-net per eventuali rollback.

---

## 2026-05-04 — Selezioni: 5a zona Piatti del giorno + paese formaggi + widget salumi mostra prodotti

### Aggiunto
- **Selezioni → 5a tab "Piatti del giorno"**: gestione piatti speciali del giorno con stato attivo/archivio (tabella `piatti_giorno` + categorie configurabili). 6 categorie seed: Antipasto, Primo, Secondo, Contorno, Dolce, Speciale. Endpoint `/piatti-giorno/`. Mig 107.
- **Formaggi → categoria madre Paese**: nuovo campo `paese` (Italia/Francia/Altro) sui formaggi. UI: dropdown nel form, raggruppamento gerarchico in tabella ("🇮🇹 Italia" → Vaccino/Caprino/…, idem Francia). Le categorie figlie (Vaccino, Caprino, Ovino, Misto) restano condivise tra i due paesi. Mig 107 ALTER TABLE idempotente.
- **ZonaPanel**: supporto generico per (a) `campiExtra[].options` → select; (b) `cfg.raggruppaPer` → raggruppamento tabella per campo; (c) `cfg.showPesoPrezzo` come override esplicito.

### Cambiato
- **Widget Selezioni in Home**: per zone Salumi e Formaggi (`stato === "attivo"`) il mini-blocco mostra ora i NOMI dei prodotti (primi 3) invece di "categoria · count". Per Macellaio e Pescato resta la preview categorie con count (più sensata data la varietà). Versione widget v1.1.

### Versioni
- `VERSION`: 5.11 → 5.12
- modulo `selezioni`: 1.0 → 1.1

---

## 2026-05-02 — Refactor monorepo CONCLUSO (R1→R8c)

Refactor strategico per separare prodotto vendibile (`core/`) da personalizzazioni Tre Gobbi (`locali/tregobbi/`). 11 sessioni in 5 settimane, deploy incrementale senza downtime sul ristorante. **Risultato: TRGB è ora un monolite modulare con feature flags per locale, pronto per primo cliente paying.**

### Architettura raggiunta
- Path tenant-aware: 10 DB SQLite + `users.json` + `closures_config.json` letti da `locali/<TRGB_LOCALE>/data/` con fallback storico (helper `app/utils/locale_data.py`).
- Branding tenant-aware: palette/logo/font/wordmark/splash iOS in `locali/<id>/branding.json`, esposti via `GET /locale/branding.json`.
- Strings tenant-aware: testi UI in `locali/<id>/strings.json`, esposti via `GET /locale/strings.json`, helper `t(key, fallback)` BE+FE.
- Deploy multi-locale: `./push.sh -l <locale>`, env in `locali/<id>/deploy/env.production`.
- Module loader: `locali/<id>/moduli_attivi.json` controlla quali dei 13 moduli attivare (più platform sempre on). 47 router montati condizionalmente. Endpoint `GET /system/modules`. Frontend filtra `MODULES_MENU` via `useActiveModules` hook.

### Sessioni
- **R1** (2026-04-28, `8876603`): scaffold `locali/{tregobbi,trgb,_template}/` + env `TRGB_LOCALE`.
- **R2** (2026-04-29, `753019a`): branding centralizzato + collab marker.
- **R3** (2026-04-29, `503c88f`): flag `TRGB_SPECIFIC` su 3 mig seed (097, 099, 100) + runner locale-aware.
- **R4** (2026-04-29, `f200781` + `77b3430`): `push.sh -l <locale>` + `uploads.py` locale-aware + file `VERSION` single source of truth + commit hash dinamico in `/system/info`.
- **R5** (2026-04-29, `ba46536`): locale strings (`t()` helper BE+FE, 18 stringhe sostituite in 9 file).
- **R6** (2026-04-29, `90e1fe7`): cleanup `vini.db` legacy + helper `locale_data_path()` ready (non ancora applicato).
- **R6.5 push 1** (2026-05-02, `00f5c1a`): `locale_data_path()` applicato a 10 DB SQLite — sostituiti 50+ path hardcoded in modelli, core, migration_runner, 13 router, 4 servizi, 22 migrazioni, `auth_service.py` (users.json), `closures_config_router.py`. Hotfix successivo (`f5bd01e`) per riaggiungere `from pathlib import Path` mancante in 2 file (NameError type hint scoperto post-deploy).
- **R6.5 push 2** (2026-05-02): file fisicamente spostati sul VPS da `app/data/` a `locali/tregobbi/data/`.
- **R7** (2026-05-02, `936a5e6`): scaffold `locali/_template/` completo + `docs/architettura_locale.md`.
- **R8a** (2026-05-02, `4704507`): manifesti dichiarativi 13 `core/moduli/<id>/module.json` + platform + `moduli_attivi.json` per locale.
- **R8b+R8c** (2026-05-02): `app/platform/module_loader.py` (221 righe) + 47 `_mount(...)` in `main.py` + endpoint `/system/modules` + frontend `activeModules.js` (139 righe) + filtro Header/Home.

### Beneficio operativo
- **Cliente nuovo onboarding**: `cp -r locali/_template locali/<id>` + edit `moduli_attivi.json` + `./push.sh -l <id> "..."`. Vede solo i moduli che ha comprato.
- **Demo TRGB neutro**: pronto per deploy su `trgb.it` con `TRGB_LOCALE=trgb` (palette neutra, no gobbette).
- **Disciplina codice**: ogni feature classificata `[core]`/`[locale:tregobbi]`/`[mixed]` in commit. 5 regole modulari attive in `CLAUDE.md`.
- **Zero downtime**: ogni sessione R deployata indipendentemente, backward-compat assoluto su tregobbi (default `"*"` → tutti i moduli attivi).

### Backward-compat
- `moduli_attivi.json` con `"*"` o file mancante → tutti i 13 moduli attivi.
- `users.json` e config in path tenant: helper trova fallback in `app/data/` se file non presente nel locale.
- Frontend: errore fetch `/system/modules` → fallback wildcard, niente filtro applicato.

### Follow-up post-refactor (vedi `docs/roadmap.md` §0.1 NEW)
- Fix git VPS disallineato: post-receive hook aggiorna file fisici ma non `.git/HEAD` del working tree → `/system/info commit` mostra hash stantio.
- Modulo K-bis: 4 cartelle uploads (`admin_finance/uploads`, `ipratico_uploads`, `documenti_dipendenti`, `backups/vini`) ancora hardcoded → da spostare sotto `TRGB_UPLOADS_DIR/<locale>/`.
- Migrations per modulo (opzionale): riorganizzare `app/migrations/0NN.py` in `app/migrations/<modulo>/`. Non urgente.
- Demo `trgb.it` online: deploy seconda istanza per cliente potenziali.

---

---

## Storico

I rilasci più vecchi sono spostati in archivio (regola: in questo file restano ~3 mesi):
- [archive/changelog_archivio_2026-04.md](archive/changelog_archivio_2026-04.md) — rilasci dicembre 2025 → aprile 2026
