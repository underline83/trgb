# TRGB Gestionale — Problemi segnalati da Marco

> File dedicato ai bug e anomalie segnalati da Marco durante l'uso del gestionale, in attesa di intervento.
> **Claude**: leggi questo file a inizio sessione insieme a `sessione.md` e `roadmap.md`.
> **Regola**: quando un problema è risolto, spostalo in "Risolti" in fondo con data e commit.

---

## Aperti — Priorità alta

### A1. Acquisti — FattureInCloud importa "fatture" che non sono fatture (affitti duplicati)
**Segnalato:** 2026-04-10
**Modulo:** Gestione Acquisti (fattureincloud_router, fe_import)
**Gravità:** seria

**Sintomo:**
Alcune voci importate da FattureInCloud non sono vere fatture, ma registrazioni di pagamento (es. affitti). Due casi concreti:
- **Cattaneo** — affitto locale
- **Bana** — affitto locale

Risultato: queste voci vengono duplicate in Acquisti e sporcano la dashboard/KPI.

**Da capire / fare:**
1. Identificare in FIC il campo o il tipo documento che distingue una "fattura vera" da una registrazione/spesa (probabilmente `type` o `document_type` nell'API FIC v2)
2. Filtrare a monte in `fattureincloud_router.py` durante il sync, non importare quelle non-fatture
3. Valutare se spostare Cattaneo/Bana in `cg_spese_fisse` (dove concettualmente appartengono gli affitti) invece che in `fe_fatture`
4. Cleanup dei duplicati già presenti

**Note:** Cattaneo e Bana sono già in `escluso_acquisti = 1` per la dashboard Acquisti (sessione 14), ma il problema vero è che vengono importati come fatture quando non lo sono.

---

### A2. Dipendenti — Stipendi duplicati con nome leggermente diverso
**Segnalato:** 2026-04-10
**Modulo:** Dipendenti / Buste Paga / CG Uscite
**Gravità:** seria

**Sintomo:**
Alcuni stipendi risultano raddoppiati nel sistema perché una prima importazione ha sbagliato il parsing del nome. Esempio concreto:
- `stipendio - marco carminati`
- `stipendio marco carminativo`  ← stesso dipendente, nome corrotto

Sono lo stesso record logico ma vengono trattati come due entità separate.

**Da capire / fare:**
1. Trovare tutti i duplicati simili (query fuzzy su nome dipendente nelle tabelle coinvolte)
2. Identificare la causa del parsing errato in prima importazione (LUL? import CSV stipendi?)
3. Tool di merge duplicati dipendenti (stessa logica del merge Clienti CRM v1.1 — principale + secondari + batch merge)
4. Fix del parser per evitare che succeda di nuovo

---

### D3. Flussi di Cassa — Doppioni versamenti banca
**Segnalato:** 2026-04-10
**Modulo:** Flussi di Cassa / Banca (banca_router, banca_movimenti)
**Gravità:** alta — bug ancora presente

**Sintomo:**
Il 25/01/2026 compare due volte un versamento da €5.000. Bug già visto in passato, non ancora risolto.

**Da capire / fare:**
1. Verificare nella tabella `banca_movimenti` se esistono davvero due righe o se è un problema di rendering
2. Capire quando/come entrano i doppioni (import CSV BPM? Manuale? Sync con CG?)
3. Aggiungere vincolo unique o dedup su (data, importo, descrizione, iban_conto) al momento dell'import
4. Cleanup one-shot dei doppioni storici

---

## Aperti — Priorità media

### B1. Sistema — Ruoli e permessi si "ripristinano" da soli
**Segnalato:** 2026-04-10
**Modulo:** Impostazioni Sistema / auth
**Gravità:** media (comportamento imprevedibile)

**Sintomo:**
A volte i ruoli/permessi modificati da Marco vengono ripristinati a valori precedenti. Non è chiaro in seguito a quale evento — forse qualcosa di hardcoded che sovrascrive la config al restart del servizio o al login.

**Da capire / fare:**
1. Cercare hardcode in `auth_service.py`, `users.json`, router di init, eventuali seed di default
2. Verificare se al restart di `trgb-backend` c'è una routine che "normalizza" i ruoli
3. Controllare se esiste una migrazione o uno script di setup che rilegge i ruoli di default
4. Loggare ogni modifica a `users.json` / permessi per capire quando avviene il reset
5. Possibili sospetti: `ImpostazioniSistema.jsx` tab Utenti che ricarica un default, oppure qualche `ensure_default_users()` al boot

---

### C1. Dipendenti — Invio busta paga via WhatsApp
**Segnalato:** 2026-04-10
**Modulo:** Dipendenti / Buste Paga
**Tipo:** feature request
**Gravità:** media (migliora workflow)

**Sintomo/richiesta:**
Nella pagina Buste Paga, accanto al bottone "PDF" di ogni busta paga, aggiungere un bottone "WA" che apre WhatsApp con il numero di telefono del dipendente (preso da anagrafica) e il PDF allegato.

**Da capire / fare:**
1. Verificare se il numero di telefono del dipendente è sempre presente in anagrafica (altrimenti il bottone va disabilitato)
2. WhatsApp web/native non supporta l'allegato via `wa.me/{num}` — si può solo pre-compilare il testo. Per l'allegato serve WhatsApp Business API (a pagamento) oppure l'utente fa drag & drop manuale del PDF scaricato
3. Soluzione realistica MVP: bottone WA apre `wa.me/{num}?text=Ciao%20{nome},%20ecco%20la%20tua%20busta%20paga%20di%20{mese}` + download automatico del PDF in contemporanea, così Marco ha il file pronto da allegare su WA in un click
4. Soluzione avanzata (futura): WA Business API se il volume lo giustifica

---

### C2. Dipendenti — Anagrafica, salvare PDF buste paga anche in Documenti
**Segnalato:** 2026-04-10
**Modulo:** Dipendenti / Anagrafica
**Tipo:** improvement
**Gravità:** media

**Sintomo/richiesta:**
Nella pagina Anagrafica Dipendenti, sezione "Documenti", i PDF delle buste paga caricate dovrebbero comparire automaticamente (oggi sono separati: la busta paga vive solo nel modulo Buste Paga).

**Da capire / fare:**
1. La Tab Documenti unificata è già stata fatta (sessione 18, 2026-03-30 — "allegati manuali + cedolini PDF"). Verificare se la lista unificata già mostra i cedolini o se c'è un bug/filtro che li nasconde
2. Se il sistema già li salva ma non li mostra → fix UI / query
3. Se non li salva → aggiungere write path in `cedolini_service` che duplica il PDF nella tabella `documenti_dipendente` (o meglio: vista union che li aggrega lato query)

---

### D1. Flussi di Cassa — Sistema storni difettoso
**Segnalato:** 2026-04-10
**Modulo:** Flussi di Cassa / Banca (sistema storni)
**Gravità:** media-alta

**Sintomo:**
Il sistema di gestione storni ha qualcosa che non va. Marco non ha dettagliato ulteriormente il bug — serve riprodurre il comportamento insieme a lui nella prossima sessione per vedere cosa succede concretamente.

**Da capire / fare:**
1. **PRIMA COSA**: chiedere a Marco di mostrare un caso concreto di storno che non funziona
2. Verificare logica di matching movimento negativo ↔ movimento positivo correlato
3. Verificare UI: visualizzazione dello storno nella lista movimenti / dashboard
4. Verificare se lo storno impatta correttamente il calcolo saldo / KPI

---

### D2. Flussi di Cassa — Riconciliazione: casi parziali restano "aperti" senza modo di chiuderli
**Segnalato:** 2026-04-10
**Modulo:** Flussi di Cassa / Banca riconciliazione
**Gravità:** media-alta

**Sintomo:**
Ci sono casi di riconciliazione in cui:
1. Le due cifre (movimento banca vs fattura) non sono identiche ma dovrebbero chiudersi comunque — es. **note di credito** che spezzano l'importo
2. Bonifici che sommano **più fatture** insieme
3. Bonifici che sommano **una fattura + una rata** di rateizzazione

Marco ha già implementato la gestione di questi casi (fase precedente), ma ora questi match restano "aperti" nello stato: non c'è un modo per marcarli come chiusi/riconciliati.

**Da capire / fare:**
1. Verificare lo stato attuale dei record in `banca_fatture_link` (o tabella equivalente) per questi casi
2. Serve uno stato esplicito `RICONCILIATO_MANUALE` o `CHIUSO_N_A_1` (n a 1) nel link
3. UI: bottone "Chiudi riconciliazione" nel dettaglio movimento quando la somma dei link collegati quadra entro una tolleranza (±€0.01)
4. Gestione n-a-1 e 1-a-n: un movimento può avere più link a fatture diverse e viceversa

---

## Risolti

_(Nessuno ancora — spostare qui i problemi risolti con data e hash commit)_

---

## Come usare questo file

- **Marco**: quando trovi un bug, aggiungilo sotto "Aperti" con sintomo chiaro e un esempio concreto. Niente "non funziona", sempre "apre la pagina X, clicca Y, mi aspetto Z ma succede W"
- **Claude**: all'inizio di ogni sessione leggi questo file subito dopo `sessione.md`. Se Marco ti chiede "cosa c'è da fare?" rispondi prima con la lista di questo file, poi con la roadmap
- **Risoluzione**: quando chiudi un problema, spostalo in "Risolti" con data + `./push.sh "msg"` di riferimento, e aggiorna il changelog
