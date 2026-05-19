# Manuale Utente TRGB

> **Versione del manuale:** 1.0 — 2026-05-19
> **Codice di riferimento:** TRGB backend `5.16`, frontend `1.1.0`, tenant default `tregobbi` (osteria Tre Gobbi)
> **Audit alla base:** `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md`

---

## Introduzione

### Cos'è TRGB

TRGB è il **gestionale completo dell'osteria**: gestisce la cantina dei vini, le ricette e i costi piatto, le prenotazioni e i preventivi eventi, le vendite e i corrispettivi, i fornitori e le fatture, i dipendenti e i turni, le checklist quotidiane e gli HACCP, i clienti e il CRM. È pensato per **un solo posto** che fa tante cose, non per moltissimi posti che ne fanno una.

Tecnicamente è una web app: ci si entra dal browser, da computer o da tablet. Funziona anche in sala con il telefono.

### Chi sono i destinatari di questo manuale

- **Sezione A — Guida per l'utente operativo:** chi usa TRGB ogni giorno per fare il proprio lavoro (sala, sommelier, chef, capireparto, dipendenti). Linguaggio semplice. Niente dettagli tecnici.
- **Sezione B — Guida per Manager/Amministratore:** Marco (PO) e chi configura il sistema. Linguaggio tecnico ma accessibile. Spiega *cosa si configura*, *dove*, *con quali conseguenze* e *come fare rollback*.

### Come è organizzato

- **Sezione A** è organizzata **per workflow utente** (es. "Gestire una prenotazione dalla creazione al saluto del cliente").
- **Sezione B** è organizzata **per area di responsabilità** (es. "Gestione utenti e ruoli").
- Alla fine c'è un'**appendice** con glossario, indice analitico e versione di riferimento.

---

# SEZIONE A — Guida per l'utente operativo

## Capitolo 1 — Primi passi

### Cosa puoi fare

- Entrare in TRGB con la tua tile (icona personale) e il tuo PIN.
- Vedere la Home con i widget del tuo ruolo (sala vede prenotazioni e clienti del giorno; sommelier vede cantina; chef vede menu del giorno; admin vede tutto).
- Leggere le notifiche (campanellina in alto a destra).
- Cambiare il tuo PIN se sospetti che qualcuno lo conosca.

### Come si fa

1. **Apri TRGB** dal browser. Sul VPS di Marco: `https://trgb.tregobbi.it`.
2. **Login**: la pagina iniziale mostra tile colorate, una per ogni utente. Tocca la tua tile, inserisci il PIN, premi "Entra".
3. **Cambia PIN**: dal menu in alto-destra → "Cambia PIN". Inserisci il vecchio + due volte il nuovo.
4. **Home**: contiene 2 pagine swipe-able (widget + moduli rapidi). Sulle card moduli toccando entri direttamente.

### Cosa aspettarti

- Il PIN non scade. Cambialo tu se hai sospetti.
- Se sei "viewer" (ospite) puoi solo guardare: TRGB ti bloccherà ogni tentativo di scrittura.
- Se TRGB sembra "indietro" dopo un aggiornamento, fai **Ctrl+Shift+R** (refresh forzato): la cache locale del browser va via.

### Cosa fare se va storto

- "PIN errato": riprova. Dopo 3 errori il login si blocca per 60 secondi (anti-bruteforce).
- "Sessione scaduta": il token JWT è scaduto. Rifai login.
- "Pagina vuota": Ctrl+Shift+R. Se persiste, contatta Marco (problema deploy).

### FAQ

- *Posso entrare da telefono?* Sì, ma l'esperienza migliore è da tablet o computer.
- *Posso avere tile mia personalizzata?* Sì, chiedi al manager — assegna anche un colore associato al tuo ruolo.

---

## Capitolo 2 — Gestire una prenotazione (sala)

### Cosa puoi fare

- Vedere il planning di oggi, della settimana, del mese.
- Creare una nuova prenotazione (con cliente, n° coperti, tavolo, turno).
- Modificare una prenotazione (orario, n° coperti, note speciali).
- Cambiare lo stato (conferma, no-show, annullata).
- Assegnare un tavolo (o una combinazione di tavoli).
- Mandare al cliente una conferma su WhatsApp con un tocco.

### Come si fa

#### Vedere il planning di oggi
1. Menu → **Prenotazioni**.
2. Si apre direttamente il planning del giorno corrente. Vedi turno pranzo e cena, n° coperti totali, tavoli occupati.

#### Creare una nuova prenotazione
1. Premi **"+ Nuova prenotazione"**.
2. Cerca il cliente (autocomplete: scrivi nome o telefono). Se non esiste, premi "Nuovo cliente" e crealo al volo.
3. Inserisci: data, turno (pranzo/cena), orario, n° coperti, note.
4. (Opzionale) Premi **"Assegna tavolo"** per scegliere un tavolo dalla mappa visiva.
5. Premi **Conferma**.

#### Cambiare stato (no-show, annullata, confermata)
- Apri la prenotazione → tab "Stato" → scegli il nuovo stato.

#### Mandare conferma WhatsApp
- Apri la prenotazione → bottone **WhatsApp** (icona verde). Si apre `wa.me/<numero>` con il messaggio precompilato. Premi invio dal telefono.

### Cosa aspettarti

- Le prenotazioni in colore **verde** sono confermate; **gialle** in attesa; **rosse** annullate.
- Se assegni un tavolo già occupato in quello slot, TRGB ti avvisa (non blocca — la scelta è tua).
- I tavoli grandi (>8 coperti) si gestiscono con le **combinazioni** (tavolo 5 + 6 = "5+6") configurate dal manager.

### Cosa fare se va storto

- "Tavolo non disponibile" ma sai che è libero: forse c'è una prenotazione altra che vedi solo dopo aver scrollato. Verifica la mappa tavoli del turno.
- "Cliente non trovato": chiedi al cliente nome+telefono e crea anagrafica al volo. Se è già stato qui prima, evita il duplicato (TRGB suggerisce possibili merge).

### FAQ

- *Posso prenotare per un evento privato (non normale prenotazione)?* No — usa il modulo **Preventivi** (vedi cap 9). I preventivi non occupano i tavoli del planning normale ma sono gestiti separatamente.
- *Posso esportare il planning per dare al sommelier?* No, ma puoi stamparlo: bottone "Stampa" → PDF.
- *Posso assegnare un tavolo dopo aver creato la prenotazione?* Sì, riapri la prenotazione → "Assegna tavolo".

---

## Capitolo 3 — Il servizio in sala (carta vini e menu)

### Cosa puoi fare

- Mostrare la **carta vini** al cliente (vista cliente: HTML, PDF, anche cartacea).
- Consultare la **carta sommelier** con prezzi calice, locazioni, stato giacenza.
- Vedere il **menu del giorno (pranzo)** sul tablet o da stampa.
- Consultare le **Selezioni del Giorno** (Scelta del Macellaio, Salumi, Formaggi, Pescato, Piatti del giorno).
- Vedere la **Carta Bevande** (Aperitivi, Birre, Distillati, Tisane, Tè, Amari).
- Leggere le **comunicazioni del giorno** (broadcast da admin).

### Come si fa

#### Carta vini cliente
- Menu → **Vini** → tab **Carta**. Apri come HTML (preview) o scarica PDF.
- Esiste anche una **pagina pubblica per il cliente** (`/vini/carta-cliente`, non serve login) che il cliente apre dal proprio telefono via QR code in sala.

#### Carta sommelier (vista staff)
- Menu → **Vini** → tab **Sommelier**. Vista con prezzo carta, prezzo calice, locazione fisica (frigo / loc1 / loc2 / loc3), stato (bottiglia aperta = mescita disponibile).

#### Menu del giorno (pranzo)
- Menu → **Pranzo del Giorno** → "Oggi". Vedi i piatti pianificati dal chef per la settimana corrente, con margine/costo se hai i permessi.

#### Selezioni del Giorno
- Menu → **Selezioni**. 5 tab: **Macellaio, Salumi, Formaggi, Pescato, Piatti del Giorno**. Mostra l'elenco attivo del giorno (taglio + descrizione + prezzo). Tocco "venduto" per marcarlo esaurito.

#### Carta Bevande
- Menu → **Vini** → tab **Bevande**. 7 sezioni: Aperitivi, Birre, Amari fatti in casa, Amari & Liquori, Distillati, Tisane, Tè.

### Cosa aspettarti

- La carta vini cliente è ordinata per tipologia, nazione, regione (configurazione manager).
- I vini "esauriti" non compaiono nella vista cliente; compaiono per il sommelier con badge "0".
- Le selezioni "vendute" oggi appaiono barrate e in fondo lista per il giorno corrente.

### Cosa fare se va storto

- "La carta non mostra un vino che dovrebbe": verifica nel modulo Vini che il flag **CARTA = SI** (chiedi al sommelier).
- "Il PDF non si scarica": verifica connessione, riprova. Se persiste, contatta Marco.

### FAQ

- *Posso modificare un piatto del menu del giorno?* No, devi chiedere al chef (Sezione B cap 10).
- *Le selezioni del giorno cambiano quando?* Solitamente ogni servizio. Chef o sommelier le aggiorna.

---

## Capitolo 4 — Vendere vini (sommelier)

### Cosa puoi fare

- Registrare una **vendita di bottiglia** (scarico cantina + entrata commerciale).
- Registrare una **vendita di calici** (mescita: 1 bottiglia aperta serve N calici).
- Vedere i **calici disponibili** (bottiglie aperte attive in mescita).
- Aprire/chiudere una bottiglia in mescita.
- Consultare lo **storico movimenti** per vino o globale.

### Come si fa

#### Vendita bottiglia
1. Menu → **Vini** → tab **Vendite** (o scheda vino specifica).
2. Premi **"+ Vendita"**, scegli il vino (autocomplete), quantità bottiglie, eventuale nota.
3. Conferma. TRGB:
   - decrementa giacenza
   - registra movimento di tipo `VENDITA`
   - aggiorna i KPI dashboard

#### Vendita calici
1. Premi **"+ Vendita Calici"**, scegli la bottiglia aperta, n° calici.
2. Conferma. TRGB scala la giacenza in modo proporzionale (config calici/bottiglia in Settings).

#### Aprire / chiudere bottiglia in mescita
- Scheda vino → toggle **"Bottiglia aperta"**. Imposta la data di apertura. La bottiglia diventa visibile in **Calici disponibili**.
- Chiudere = scarico residuo + flag off. Modulo Cantina segna fine mescita.

#### Storico vendite
- Menu → **Vini** → tab **Vendite** → "Storico". Filtri per data, vino, tipologia.

### Cosa aspettarti

- TRGB **non** importa vendite da iPratico (non esporta dati di vendita): tutte le vendite vini sono registrate qui manualmente.
- Le rettifiche (correzione giacenza) sono generate automaticamente quando modifichi quantità da UI.

### Cosa fare se va storto

- "Giacenza negativa": TRGB lo segnala. Verifica la quantità reale a vista — probabilmente un movimento precedente non era stato registrato.
- "Vendita registrata su vino sbagliato": apri scheda vino → tab Movimenti → elimina il movimento (admin/sommelier).

### FAQ

- *Posso annullare una vendita?* Sì, eliminando il movimento di tipo VENDITA dalla scheda del vino.
- *Quante mescita per bottiglia?* Configurabile (4 calici da 750ml o 6 calici da 750ml, ecc.) — chiedi al manager.

---

## Capitolo 5 — Cucina (chef e capireparto)

### Cosa puoi fare

- Vedere e modificare le **Selezioni del Giorno** (Macellaio, Salumi, Formaggi, Pescato, Piatti del Giorno).
- Aggiungere voci alla **Lista Spesa** (cosa serve dal magazzino o da acquistare).
- Consultare la **dashboard cucina** (alert HACCP, scadenze imminenti).
- Vedere il **menu del pranzo della settimana** e il margine per piatto.

### Come si fa

#### Aggiungere un piatto alle Selezioni del Giorno
1. Menu → **Selezioni** → scegli la sezione (es. Macellaio).
2. Premi **"+ Nuovo taglio"**, inserisci nome, descrizione, prezzo, eventualmente categoria.
3. Salva. Compare immediatamente in carta sala.

#### Aggiungere voce alla Lista Spesa
1. Menu → **Cucina** (Lista Spesa) → tab Items.
2. Premi **"+ Voce"**, descrivi cosa serve, quantità, urgenza, eventualmente fornitore.
3. La voce arriva al modulo Acquisti per essere chiusa.

#### Pianificare il pranzo della settimana
- Menu → **Pranzo del Giorno** → settimana → **"+ Crea menu"**. Selezioni i piatti per ogni giorno della settimana (Lun-Dom). TRGB calcola foodcost e margine per piatto.

### Cosa aspettarti

- I piatti aggiunti alle Selezioni del Giorno si vedono **immediatamente** nella vista sala (no pubblicazione richiesta).
- Marcare "venduto" su una selezione lo barra in lista senza eliminarlo.

### Cosa fare se va storto

- "Margine negativo su un piatto": il costo ingredienti supera il prezzo. Aggiusta il prezzo o cambia ricetta (sezione B Ricette).
- "Lista spesa non viene chiusa": verifica con chi gestisce gli acquisti. Le voci restano in lista finché non vengono completate.

---

## Capitolo 6 — Chiusura cassa giornaliera e turno

### Cosa puoi fare

- Compilare la **chiusura cassa giornaliera** (corrispettivi, IVA, metodi di pagamento, fatture emesse).
- Compilare la **chiusura del turno** (pranzo o cena: pre-conti, spese, coperti).
- Vedere la **dashboard mensile** (trend, alert, KPI).

### Come si fa

#### Chiusura giornaliera
1. Menu → **Vendite** → tab **Chiusura Cassa**.
2. Seleziona data (default: oggi).
3. Compila i campi: incasso totale, IVA al 10%/22%, metodi (contanti, carte, fatture), spese.
4. Premi **"Salva"**. La chiusura resta "aperta" finché non premi **"Set Closed"** (irreversibile da operativo).

#### Chiusura turno (pranzo o cena)
1. Menu → **Vendite** → tab **Chiusure Turno** (alcuni utenti vedono "Pre-conti").
2. Crea nuova chiusura per turno specifico: coperti, incasso, spese, checklist.
3. Salva.

### Cosa aspettarti

- Una volta che premi "Set Closed", la chiusura non si modifica più (eccetto super-admin). Verifica prima di premere.
- La chiusura giornaliera viene importata anche per i versamenti (cash deposits).

### Cosa fare se va storto

- "Ho sbagliato e la chiusura è già chiusa": contatta Marco (admin riapre).
- "Non torna l'incasso vs cassa fisica": verifica spese non registrate, fatture omesse, errori IVA.

---

## Capitolo 7 — Checklist e attività (Task Manager)

### Cosa puoi fare

- Vedere la tua **agenda giornaliera** di checklist da eseguire (pulizia, controlli HACCP).
- Eseguire i singoli **item** con un tocco (tap-to-complete).
- Vedere la **settimana** o saltare un'istanza (se non applicabile oggi).
- Creare un **task singolo** estemporaneo (es. "chiamare fornitore X").

### Come si fa

1. Menu → **Tasks** (o badge in Home se hai notifiche).
2. Tab **Agenda**: liste di checklist generate dalle template attive oggi.
3. Tocca un item → si segna ✅ con timestamp + utente.
4. Per task singolo: tab **Tasks** → "+ Nuovo task", scrivi descrizione + assegnazione + scadenza.

### Cosa aspettarti

- Le checklist sono **generate ogni giorno** dallo scheduler. Se non vedi quelle attese, chiedi al manager (forse la template è disattivata).
- Gli item HACCP confluiscono nel report mensile (vedi Sezione B cap 15).

---

## Capitolo 8 — Cercare un cliente (CRM, ruolo sala/manager)

### Cosa puoi fare

- Cercare un cliente (per nome, telefono, email).
- Vedere il suo **storico prenotazioni** e **n° visite**.
- Aggiungere una **nota** al cliente (allergie, preferenze).
- Aggiungere un **tag** (es. "VIP", "celiaco", "vegetariano").

### Come si fa

1. Menu → **Clienti**.
2. Ricerca testo libero. Vedi lista filtrata.
3. Clicca su un cliente → scheda cliente con storico, tag, note.
4. "+ Nota" per aggiungere annotazione; "+ Tag" per appiccicare un'etichetta.

### Cosa aspettarti

- I duplicati sono **flaggati automaticamente** se TRGB li sospetta. Manager può fonderli (Sezione B cap 12).
- Le note sono visibili a chi legge la scheda (sala vede); non a tutti gli altri ruoli.

---

## Capitolo 9 — FAQ generali

- *Come faccio refresh forzato?* **Ctrl+Shift+R** (Windows/Linux) o **Cmd+Shift+R** (Mac).
- *Quando vedo errori 401 o "Sessione scaduta"?* Il token è scaduto. Rifai login. Se succede spesso, dura ~30 minuti — è normale.
- *Posso usare TRGB da telefono?* Sì. Touch target ≥ 44pt. Pagine come Home, Prenotazioni, Selezioni sono pensate per mobile.
- *Come segnalo un bug?* Contatta Marco. Se hai uno screenshot, allegalo. Indica: pagina, azione che stavi facendo, messaggio di errore (se c'è).
- *Posso vedere i dati di un'altra osteria?* No, ogni locale ha la sua istanza separata. Tu vedi solo i dati del locale "tregobbi".
- *Cosa significano i colori dei vini in carta?* Vedi cap 3.
- *Il PDF non si scarica:* riprova in 1 minuto. Se persiste, contatta Marco.

---

# SEZIONE B — Guida per Manager / Amministratore

## Capitolo 1 — Setup iniziale e configurazione del locale

### Cosa si configura
- **Tenant attivo (`TRGB_LOCALE`):** identificatore del locale (`tregobbi`, `trgb`, `test_demo`...). Si imposta come variabile d'ambiente sul VPS. Default: `tregobbi`.
- **Branding (`/locale/branding.json`):** palette colori, font, asset paths. Il frontend lo carica al boot e applica nei componenti. Cache server 60s.
- **Strings (`/locale/strings.json`):** testi UI tenant-aware. Helper FE `t(key)` per recuperarli.
- **Moduli attivi (`locali/<id>/moduli_attivi.json`):** lista moduli abilitati per il locale. Default: tutti attivi (`"*"`). Il `module_loader` (`app/platform/module_loader.py`) decide quali router montare.

### Dove

- File: `locali/<TRGB_LOCALE>/branding.json`, `strings.json`, `moduli_attivi.json` (sul VPS in repo, sotto `/var/www/trgb/locali/`).
- UI: `Impostazioni Sistema` → `Moduli attivi` (toggle on/off live, con conferma).

### Conseguenze

- Disattivare un modulo lo **rende invisibile** in menu, ma i dati restano in DB. Riattivandolo riappare.
- Cambiare il branding richiede un Ctrl+Shift+R lato browser (cache).
- I tenant `test_demo` e `_template` sono per onboarding di nuovi clienti — non per produzione.

### Rollback

- Branding: ripristina il file `branding.json` da Git history.
- Moduli attivi: ripristina o reimposta `"*"`.

### Troubleshooting

- "Modulo X non si vede ma è in `moduli_attivi.json`": riavvia uvicorn (cambio config richiede restart).

---

## Capitolo 2 — Gestione utenti, ruoli, permessi

### Ruoli disponibili
- `admin` (Marco) — accesso completo
- `contabile` — accesso CG, banca, acquisti, dipendenti (paghe)
- `sommelier` — accesso vini, carta, vendite calici
- `sala` — accesso prenotazioni, clienti, comunicazioni
- `chef` — accesso ricette, cucina, selezioni, pranzo
- `viewer` (ospite) — sola lettura su tutto (middleware blocca POST/PUT/PATCH/DELETE)

### Cosa si configura
- **Lista utenti:** anagrafica + tile login + PIN + ruolo + associazione a un `dipendente` (per matching paghe/turni).
- **Tile login pubblico:** ogni utente ha una tile colorata visibile nella schermata login (no password in chiaro — solo nome + colore).
- **Home actions per ruolo:** pulsanti rapidi della Home configurabili per ogni ruolo.

### Dove
- UI: `Impostazioni Sistema` → `Utenti`. CRUD utenti + cambio ruolo + cambio PIN.
- File backend: `users.json` (anagrafica utenti).
- Home actions: `Impostazioni Sistema` → `Pulsanti rapidi Home`.

### Conseguenze

- Cambiare il **ruolo** di un utente cambia ciò che vede in menu *immediatamente* (al prossimo login o refresh).
- Disabilitare un utente: in alternativa puoi cambiargli il ruolo a `viewer` (read-only) o eliminarlo.
- Il middleware `ReadOnlyViewerMiddleware` blocca *runtime* tutte le scritture del ruolo viewer (tranne `/auth/login`).

### Endpoint backend rilevanti
- `GET/POST /auth/users/`, `DELETE /auth/users/{u}`, `PUT /auth/users/{u}/password|/role|/dipendente`
- `GET/POST/PUT/DELETE /settings/home-actions[/{id}]`, `POST /reorder|/reset`

---

## Capitolo 3 — Gestione Cantina Vini

### Cosa si configura
- **Anagrafiche relazionali (post-cutover V.6+V.7+V.8):** Produttori, Distributori (fornitori), Denominazioni (DOC/DOCG/IGT/AOC, ~1637 voci da eAmbrosia+MASAF), Vitigni, Vini-Madre (etichette stabili), Bottiglie (annate).
- **Locazioni fisiche:** Frigorifero, Locazione 1/2/3 (configurabili). Matrice scaffali (M:N con `matrice_celle`).
- **Filtri carta cliente:** ordine tipologie, nazioni, regioni, formati.
- **Pricing markup:** breakpoint per fascia di costo che determinano il PREZZO_CARTA da EURO_LISTINO.
- **Carta Bevande:** 7 sezioni extra-vini (Aperitivi, Birre, Distillati, Tisane, Tè, Amari fatti in casa, Amari & Liquori).
- **Sincronizzazione iPratico:** mapping prodotti iPratico ↔ bottiglie TRGB (codici 4 cifre nel Name iPratico).

### Operazioni di routine
1. **Aggiunta nuovo vino:** preferire il **Wizard "+ Nuovo Vino"** (`/vini/v2/nuovo`) che gestisce Produttore → Madre → Annata → Giacenze → Posizione scaffali in modo guidato.
2. **Aggiornamento giacenze:** modifica manuale dalla scheda vino (genera RETTIFICA automatica).
3. **Aggiornamento prezzi:** modifica EURO_LISTINO; PREZZO_CARTA si ricalcola via curva markup. Esiste `POST /vini/pricing/ricalcola-tutti` per ricalcolare in massa.
4. **Sync iPratico:** upload Excel iPratico → mapping/conferma → export Excel verso iPratico con TRGB priority.
5. **Stampa inventario:** vari PDF (completo, per locazione, filtrato, per selezione di ID).

### Casi delicati
- **Reset DB cantina (`POST /vini/cantina-tools/reset-database`):** azzera tutto. Solo admin, mai in produzione senza backup recente.
- **Cleanup duplicati:** controlla criteri match prima di eseguire (controlla descrizione+annata+formato+produttore).
- **Promozione madre legacy:** Marco ha 995 madri di cui ~963 legacy con `descrizione_auto=0`. Nel wizard step 3 c'è "Sistema il madre" per promuoverli a strutturati.

### Rollback
- I file `*_legacy.jsx` archiviati (non importati) sono safety net.
- Per le anagrafiche c'è `POST /vini/anagrafiche/rollback?confirm=YES_DROP_V2_TABLES` (post-cutover è no-op).

### Doc completo
- `docs/modulo_vini.md` — autoritativo
- `docs/modulo_vini_widget_dashboard.md` — storia widget dashboard

---

## Capitolo 4 — Ricette e Foodcost

### Cosa si configura
- **Ingredienti:** anagrafica, prezzo (ultimo da fattura), categorie, allergeni, conversioni unità (es. 1 kg = 12 pz).
- **Categorie ricette** + **Service Types** (cucina, pasticceria, basi).
- **Ricette:** items (ingredienti + sub-ricette), porzioni, prezzo carta, foodcost calcolato real-time.
- **Esclusioni matching:** fornitori e descrizioni da escludere dal matching automatico fatture → ingredienti.

### Operazioni di routine
1. **Importazione fatture XML** (Acquisti) — vedi cap 5.
2. **Matching righe fattura → ingredienti:**
   - `Matching → Pending` → suggerimenti fuzzy → conferma → mapping salvato + prezzo ingrediente aggiornato
   - Auto-match per fatture future
   - Smart Create per ingredienti non ancora anagrafati
   - Bulk create per import iniziale
3. **Ricalcolo allergeni** quando si aggiunge un nuovo allergene globale o si modifica una ricetta complessa.
4. **Export JSON ricette** per backup ad-hoc.

### Casi delicati
- **Campo `escluso` vs `escluso_acquisti`:** sono SEPARATI (CLAUDE.md regola critica).
  - `fe_fornitore_categoria.escluso` → SOLO modulo Ricette/Matching
  - `fe_fornitore_categoria.escluso_acquisti` → SOLO modulo Acquisti
- **Costo ricetta-base = somma ingredienti / resa**. Annidamento profondo con cycle detection.

### Doc
- `docs/modulo_ricette_foodcost.md`

---

## Capitolo 5 — Acquisti (Fatture XML + Fatture in Cloud)

### Cosa si configura
- **Categorie fornitori** (albero gerarchico) + sotto-categorie.
- **Mapping fornitore → categoria** (per auto-classificazione).
- **Esclusioni** acquisti (vedi sopra).
- **Token Fatture in Cloud** (integrazione API v2).

### Flusso operativo

#### Import fatture XML SDI
1. Menu → **Acquisti** → **"Importa fatture XML"**.
2. Upload uno o più XML.
3. TRGB parsifica, popola `fe_fatture` + `fe_righe`, assegna fornitore (auto se PIVA mappata).
4. Le righe non riconducibili a un ingrediente entrano nella coda **Matching pending** del modulo Ricette.

#### Import via Fatture in Cloud
1. **Connetti:** Impostazioni Acquisti → "Connetti Fatture in Cloud" → salva token + seleziona azienda.
2. **Sync:** `POST /fic/sync` (UI bottone "Sincronizza"). Tira fatture nuove, mostra progresso.
3. **Warnings:** ogni anomalia (PIVA mancante, fattura senza righe, ecc.) finisce in `/fic/warnings`. Marca "visto" quando risolto.
4. **Refetch righe XML:** se FIC non ha portato il dettaglio righe, `POST /fic/refetch-righe-xml/{db_id}` per recuperare da SDI.

#### Stats e analisi
- Stats fatture: KPI, drill-down per mese/categoria, top fornitori, anomalie, confronto annuale.
- `/contabilita/fe/stats/anomalie` rileva variazioni significative fornitori.

### Doc
- `docs/modulo_acquisti.md`, `docs/modulo_fatture_xml.md`
- **GAP:** integrazione FIC manca docs (CRIT-1).

---

## Capitolo 6 — Controllo di Gestione (CG)

### Cosa si configura
- **Categorie CG:** alberatura per riclassificazione uscite/entrate (vedi `cg_categorie`).
- **Spese fisse:** ricorrenze (mensile, trimestrale, annuale), IBAN, modalità pagamento. Storico adeguamenti.
- **Condizioni pagamento fornitore:** preset (es. "BB 30gg fm", "Riba 60gg") + override per singolo fornitore.

### Concetti chiave

#### Stato pagamento — 3 dimensioni (GRANITICO)
> Vedi `docs/stato_pagamento_unificato.md` §15.

| Dimensione | Cos'è | Valori |
|---|---|---|
| **D1** PAGAMENTO | Stato business | PAGATA / NON PAGATA / PARZIALMENTE PAGATA |
| **D2** Modificatori | Annotazioni CG | `*` (non riconciliata), `?` (da verificare) |
| **D3** SCADENZA | Quando va pagata | IN SCADENZA / SCADUTA / RATEIZZATA / SPOSTATA |

- D1 e D3 sono **ortogonali**.
- Nel modulo Fatture: D1 e D3 in chip SEPARATI.
- Nel modulo CG: si possono unire in un chip unico.

### Operazioni
- **Vista uscite:** filtri stato, fornitore, data.
- **Riconciliazione banca:** suggerimenti movimenti banca per uscita → conferma o ricerca manuale.
- **Pagamenti batch:** raggruppa più uscite in un unico bonifico.
- **Sposta scadenza:** non cambia D1, solo D3.
- **Marca pagata manualmente:** quando il pagamento avviene fuori canale (es. acconto contanti).

### Doc
- `docs/modulo_controllo_gestione.md`, `docs/stato_pagamento_unificato.md`, `docs/spec_riconciliazione.md`

---

## Capitolo 7 — Banca

### Cosa si configura
- **Categorie movimenti** + mapping descrizione → categoria (auto-classificazione su import futuri).
- **Categorie di registrazione** (per movimenti senza fattura corrispondente: tasse, commissioni, ecc.).

### Flusso
1. **Import movimenti banca:** Excel/CSV dall'home banking → upload → parsing → popola `banca_movimenti`.
2. **Cross-ref:** TRGB suggerisce abbinamenti movimento ↔ uscita CG.
3. **Conferma** o **registrazione manuale** (per movimenti senza fattura).
4. **Parcheggio:** chiudi movimenti irrilevanti senza categorizzarli.

### Casi delicati
- **Duplicati:** mig 041-042 + endpoint `/banca/duplicati`. Procedura: lista duplicati → scegli quale tenere → elimina altri.
- **Andamento conto:** grafico saldi nel tempo + sanity check.

### Doc
- `docs/modulo_banca.md`

---

## Capitolo 8 — Vendite (Cassa) / Chiusure

### Cosa si configura
- **Configurazione giorni chiusura** (settimanale + ferie): `Impostazioni Sistema` → "Chiusure".
- **Categorie spese cassa:** per uscite cassa contanti.
- **Checklist chiusura turno:** items che il responsabile turno deve compilare.
- **Opening balance annuale:** saldo cassa contanti inizio anno.

### Operazioni di routine
- **Import corrispettivi storici:** Excel mensile → upload → popola `daily_closures`.
- **Chiusura giornaliera:** form coperti + IVA + metodi pagamento + spese.
- **Chiusura turno (pre-conti):** stato vendite turno + checklist + spese fine turno.
- **Versamenti cassa (cash_deposits):** registrare il versamento bancario, TRGB suggerisce match con movimenti banca.

### Dashboard e analisi
- Stats mensili, annuali, confronto anno su anno, top giorni.
- Cash flow daily + baseline per categoria di spesa.

### Doc
- `docs/modulo_selezioni.md` (NB: nome misleading — rinominare in `cassa_vendite.md` per evitare confusione con Selezioni del Giorno di Ricette).
- **GAP:** Chiusure turno + checklist sono parzialmente documentate (CRIT-3).

---

## Capitolo 9 — Dipendenti, Turni, Buste Paga

### Cosa si configura
- **Anagrafica dipendenti:** dati personali, contratto, reparto, allegati documenti.
- **Reparti:** classificazione per cucina/sala/amministrazione/ecc.
- **Tipi turno:** durata standard, fascia oraria, retribuzione.
- **Scadenze documenti:** certificati medici, contratti, formazione obbligatoria.

### Operazioni turni v2
1. **Foglio turni settimana:** drag&drop turni su dipendenti.
2. **Template di settimana:** riusabili (es. "settimana standard estate").
3. **Pubblica settimana:** notifica dipendenti, blocca modifica.
4. **Assenze:** ferie, malattia, permessi → impattano calcolo ore nette.
5. **PDF foglio turni** per affissione.

### Operazioni buste paga
1. **Import PDF cedolini LUL/Paghe:** parser estrae dati, anteprima, conferma → buste_paga inserite.
2. **Auto-create mancanti:** TRGB crea record placeholder per dipendenti che dovrebbero avere busta ma non ce l'hanno.
3. **Rematch consuntivo:** ricoglie matching nominativi.
4. **Costi mensili aggregati** + stato import mensile.

### Doc
- `docs/modulo_dipendenti.md`, `docs/modulo_dipendenti_turni.md`

---

## Capitolo 10 — Menu Carta + Pranzo

### Cosa si configura
- **Edizioni Menu Carta:** versioni del menu cena (es. "Carta primavera 2026"). Ogni edizione ha publications (piatti) con foto, descrizione, prezzo.
- **Tasting paths:** percorsi degustazione (es. "Menu degustazione 5 portate").
- **MEP (Mise en Place):** schema operativo cucina derivato dall'edizione.
- **Menu Pranzo:** pianificazione settimanale piatti del giorno.

### Operazioni
1. **Crea edizione** → aggiungi publications (piatti) → carica foto → pubblica.
2. **Genera MEP** per il personale cucina (PDF).
3. **PDF edizione** per stampa fisica della carta.
4. **Menu pranzo settimanale:** per ogni giorno seleziona piatti dal pool ricette; TRGB calcola foodcost+margine.

### Doc
- `docs/modulo_menu_carta.md`, `docs/modulo_pranzo.md`

---

## Capitolo 11 — Clienti CRM

### Cosa si configura
- **Tag:** anagrafica tag (es. VIP, allergie, dietetici).
- **Impostazioni clienti:** mapping segmenti per email marketing.
- **Mailchimp:** token + connessione (se attivo).

### Operazioni di routine
- **Import TheFork** e **da prenotazioni** per popolare/aggiornare anagrafica.
- **Merge duplicati:** manuale o auto (con preview).
- **Pulizia massiva:** telefoni placeholder, normalizzazione testi.
- **Export Google CSV** per altri canali marketing.

### Doc
- `docs/modulo_clienti_crm.md`

---

## Capitolo 12 — Preventivi eventi

### Cosa si configura
- **Luoghi** (sale interne/esterne, dehor).
- **Template preventivo** (struttura riusabile menu+condizioni).
- **Menu templates** (es. "Menu Battesimo standard").

### Flusso operativo
1. Nuovo preventivo → cliente, luogo, data, n° persone, menu (1 o più), sconto.
2. Aggiungi righe menu (piatti, prezzi) e gestisci ordine.
3. Cambia stato (bozza → inviato → accettato/rifiutato).
4. PDF preventivo brandizzato per cliente.
5. (Opzionale) Duplica preventivo per varianti.

### Doc
- `docs/modulo_preventivi.md`

---

## Capitolo 13 — Statistiche

### Cosa si configura
- **Sorgenti dati:** import mensile export iPratico (Excel) per analytics vendite.

### Cosa offre
- Top N prodotti, trend mensile per categoria o prodotto, riepiloghi mese/totale, confronti.
- Drill-down su categoria → prodotti → mesi.
- Cross-modulo: legge in read-only da Vini, Ricette, Cassa, Banca, CG (vedi `core/moduli/statistiche/module.json`).

### Doc
- `docs/modulo_statistiche.md`

---

## Capitolo 14 — Task Manager e HACCP

### Cosa si configura
- **Template checklist** (es. "Pulizia chiusura cucina serale"): N item ognuno con descrizione, frequenza, ruolo.
- **Scheduler:** genera istanze giornaliere automaticamente (cron a livello applicativo).
- **HACCP loop** (sub-set di checklist marcate HACCP).

### Flusso
1. Definisci template + items.
2. Scheduler genera istanze ogni giorno per le template attive.
3. Operatori spuntano gli item (tap-to-complete) → istanza si completa.
4. Report HACCP mensile aggrega gli item HACCP esecuzioni.

### Endpoint utili admin
- `POST /tasks/scheduler/genera-giornaliere` (forza generazione)
- `POST /tasks/scheduler/check-scadute` (alert su istanze scadute non completate)
- `GET /haccp/report/{anno}/{mese}`

### Doc
- **GAP:** non documentato (CRIT-4). Vedi `02_GAP_REPORT.md`.

---

## Capitolo 15 — Notifiche, Alert Engine, Comunicazioni

### Cosa si configura
- **Alert checkers:** ogni checker ha config + soglie (es. "vini sotto scorta minima"). Vedi `/alerts/config/`.
- **Frequenza alert:** dry-run vs run con notifiche.
- **Comunicazioni broadcast:** messaggi inviati a tutti i ruoli (es. "domani chiuso per ferie").

### Concetti
- **Notifiche personali** (`/notifiche/mie`) — generate dai checker o da eventi (creazione preventivo, alert prenotazione no-show, ecc.).
- **Comunicazioni** (`/comunicazioni`) — messaggi broadcast da admin.
- **WhatsApp composer (M.C):** ovunque tu veda un'icona WhatsApp, è generato via helper `buildWaLink()` + template. Mai costruito a mano.

### Doc
- `docs/architettura_mattoni.md` §M.A, M.C, M.F.

---

## Capitolo 16 — Backup e Troubleshooting Sistema

### Backup
- **Backup automatico:** `scripts/backup_db.sh` (hourly + daily, sync su Drive).
- **Stato salute:** `Impostazioni Sistema` → "Backup" → mostra ultimo backup hourly/daily, last_known_good files, integrità.
- **Download manuale:** `Impostazioni Sistema` → "Backup" → "Scarica tutti i DB" (zip).
- **Backup specifico:** Lista backup giornalieri → seleziona → download.

### Endpoint diagnostica
- `GET /system/info` (pubblico) — versione + commit + locale
- `GET /system/modules` (pubblico) — moduli attivi
- `GET /system/backup-health` (admin) — stato sistema backup

### Doc
- `docs/sicurezza_backup.md`, `docs/analisi_hardening_vps.md`

### Recovery di base

| Problema | Azione | Doc |
|---|---|---|
| DB corrotto | Restore da `last_known_good/` o backup recente | `sicurezza_backup.md` |
| Modulo non si vede | Verifica `moduli_attivi.json` + restart uvicorn | Cap 1 questa sezione |
| Frontend bianco | Ctrl+Shift+R; verifica `frontend/dist/` deployato | Cap 1 Sezione A |
| Auth fallisce su tutti | Verifica `users.json` integrity + JWT secret nell'env | platform_auth |

---

## Appendice

### Glossario termini

- **TRGB:** acronimo: "Tre Gobbi". Anche brand del prodotto.
- **Tenant / Locale:** un'istanza isolata del prodotto per un cliente. Default: `tregobbi`.
- **Modulo:** unità funzionale del sistema (es. vini, ricette). Vedi `core/moduli/<id>/module.json`.
- **Mattone:** servizio platform trasversale (es. M.A notifiche, M.C WhatsApp, M.F alert engine).
- **Capability:** azione che un utente può fare (es. "creare prenotazione"). Granularità di questo manuale.
- **D1/D2/D3:** dimensioni dello stato pagamento (CG). Vedi cap 6.
- **Bottiglia vs Madre:** post-cutover Vini, "madre" = etichetta stabile, "bottiglia" = annata fisica.
- **Selezioni del Giorno:** piatti del giorno (macellaio/salumi/formaggi/pescato/piatti). Sub-modulo Ricette.
- **Vendite / Cassa:** corrispettivi + chiusure (modulo cassa). NON confondere con "Selezioni del Giorno".
- **MEP:** Mise en Place. Schema operativo cucina derivato dall'edizione menu.
- **Pre-conto:** subtotale del turno (chiusure_turno).

### Indice analitico (selettivo)

- Allergeni → ricette §allergeni
- Backup → cap B-16
- Calici → cap A-4
- Carta vini → cap A-3
- Cassa → cap B-8
- Checklist → cap A-7, B-14
- Cucina → cap A-5
- Dipendenti → cap B-9
- Foodcost → cap B-4
- HACCP → cap A-7, B-14
- Locazioni cantina → cap B-3
- Matching fatture → cap B-4, B-5
- Notifiche → cap A-1, B-15
- PDF preventivo → cap B-12
- Pranzo → cap A-3, B-10
- Prenotazioni → cap A-2
- Riconciliazione banca → cap B-6, B-7
- Ricette → cap B-4
- Selezioni del Giorno → cap A-3, A-5
- Stato pagamento → cap B-6
- Tag clienti → cap A-8, B-11
- Tavoli → cap A-2
- Turni → cap A-1, B-9
- Utenti → cap B-2
- Vendite vini → cap A-4
- WhatsApp → cap A-2

### Versione manuale + codice di riferimento

- **Manuale:** v1.0 — 2026-05-19
- **Backend TRGB:** `VERSION=5.16`
- **Frontend TRGB:** `package.json` 1.1.0
- **Tenant:** `tregobbi`
- **Audit:** `docs/audit-2026-05-19/`

> Per il commit hash effettivo del codice di riferimento, vedi `05_EXECUTIVE_SUMMARY.md` (rilevato in chiusura audit) o `/system/info` endpoint live.
