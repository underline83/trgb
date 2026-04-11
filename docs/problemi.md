# TRGB Gestionale — Problemi segnalati da Marco

> File dedicato ai bug e anomalie segnalati da Marco durante l'uso del gestionale, in attesa di intervento.
> **Claude**: leggi questo file a inizio sessione insieme a `sessione.md` e `roadmap.md`.
> **Regola**: quando un problema è risolto, spostalo in "Risolti" in fondo con data e commit.

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

## Risolti

### A1. Acquisti — FattureInCloud importa non-fatture (affitti Cattaneo/Bana) ✅ 2026-04-11
**Causa:** L'endpoint FIC `received_documents?type=expense` restituisce anche registrazioni di prima nota (affitti, spese cassa) che in FIC vengono create senza numero di documento e senza P.IVA del fornitore. Il sync le importava come se fossero vere fatture elettroniche, finendo in `fe_fatture` e duplicando le voci in dashboard Acquisti. Pattern identificato: `numero_fattura=''` AND `fornitore_piva=''` AND `fonte='fic'`. Casi concreti su DB: BANA MARIA DOLORES (26 record affitto locale), CATTANEO SILVIA (26 record affitto locale), PONTIGGIA (1 record isolato) — totale 53 fatture fittizie per €82.395,66.

**Fix:**
- **Migrazione 061** `061_escludi_fornitori_fittizi.py` — cleanup one-shot. Scansiona `fe_fatture` cercando record con numero vuoto + P.IVA vuota + fonte FIC, raggruppa per `fornitore_nome`, e INSERT/UPDATE in `fe_fornitore_categoria` con `escluso_acquisti=1` e `motivo_esclusione='Non-fattura importata da FIC (senza numero né P.IVA, probabile affitto/spesa cassa)'`. I record storici restano in `fe_fatture` per non rompere eventuali link cg_uscite esistenti, ma vengono automaticamente filtrati da dashboard/KPI grazie al `COALESCE(fc.escluso_acquisti, 0) = 0` già attivo in `fe_import.py`. Idempotente. Testata su copia DB: 3 fornitori esclusi, 57 fatture filtrate dal totale dashboard
- **Filtro a monte in `fattureincloud_router.py`** — nella FASE 1 del `sync_fic`, prima del dedup hash, se `doc_number` e `fornitore_piva` sono entrambi stringhe vuote il record viene skippato e contato in `skipped_non_fattura`. Questo blocca l'ingresso di nuove non-fatture ai futuri sync, senza toccare le fatture vere. Il conteggio skippati finisce nella note di fine sync
- **Risultato**: dashboard Acquisti pulita immediatamente, futuri sync FIC ignorano automaticamente le prima-nota. Se un giorno Cattaneo/Bana emettessero una vera fattura elettronica con P.IVA, quella avrà un record distinto in `fe_fornitore_categoria` (match per P.IVA) e verrà importata normalmente

---

### A2. Dipendenti — Stipendi duplicati con nome corrotto ✅ 2026-04-11
**Causa:** Il parser LUL ha sbagliato l'estrazione del cognome per due dipendenti su un singolo batch di import (30/03 12:47): "Marco Carminatio" invece di "Marco Carminati" e "Dos Santos Mirla S Albuquerque" invece di "Dos Santos Mirla Stefane Albuquerque". Un import successivo (10/04 18:41) ha scritto di nuovo gli stipendi con i nomi canonici, ma il matching tra cedolino e dipendente in `_match_dipendente` era fatto solo per codice_fiscale o esatto "cognome=primo_token AND nome LIKE resto%" — quindi il typo "CARMINATIO" vs "CARMINATI" (e il troncamento "S" vs "STEFANE") non venivano matchati e veniva creato un nuovo record cg_uscite invece di aggiornare quello esistente.

Risultato: 3 righe per Marco Carminati Gennaio 2026 (uppercase + typo + canonico), 2 righe per Febbraio (typo + canonico), 2 righe per Dos Santos Gennaio (troncato + canonico). 5 stipendi "fantasma" in cg_uscite.

**Fix:**
- **Migrazione 060** `060_pulizia_stipendi_duplicati.py` — cleanup one-shot dei 5 duplicati. Strategia: raggruppa cg_uscite per `(periodo_riferimento, totale)` con tipo_uscita='STIPENDIO' e >=2 righe, normalizza il nome strippando "Stipendio - " e lowercasing, classifica come CANONICO se matcha esattamente un nome "nome cognome" della tabella dipendenti, richiede almeno 1 canonico nel gruppo + check di similarità (subset di token OR SequenceMatcher ratio ≥ 0.85) per confermare che tutte le righe sono la stessa persona. Keeper = canonico con banca_movimento_id NOT NULL (o più recente), migra il link banca dal duplicato al keeper se necessario, DELETE dei duplicati. Testata su copia DB: 30→25 stipendi, tutti i record residui con nome canonico, link banca preservato
- **Fuzzy matching in `_match_dipendente`** (`dipendenti.py`) — dopo il match esatto fallito, scorre tutti i dipendenti attivi e calcola `SequenceMatcher` ratio tra il blob "COGNOME NOME" del PDF e ciascun candidato "COGNOME NOME" dell'anagrafica (provando anche l'ordine inverso). Soglia 0.85 tollera typo singoli e troncamenti. Garantisce che un futuro import LUL con nome leggermente sporco aggiorni il record esistente invece di crearne uno nuovo
- **Risultato**: da 30 a 25 stipendi in cg_uscite, 1 solo record per mese per dipendente, nome canonico ovunque, e prevenzione automatica per il futuro

---

### D2. Flussi di Cassa — Riconciliazione casi parziali senza modo di chiuderli ✅ 2026-04-11
**Causa:** I casi di riconciliazione dove il movimento bancario e le fatture non quadrano al centesimo (note di credito, bonifici multipli F1+F2, fattura+rata) venivano collegati ma il movimento restava "aperto" con `residuo > 1€`, tornando in eterno nei suggerimenti senza un modo per dichiararlo chiuso.

**Fix:**
- **Migrazione 059** `059_banca_riconciliazione_chiusa.py` — aggiunge 3 colonne a `banca_movimenti`: `riconciliazione_chiusa` (flag 0/1), `riconciliazione_chiusa_at` (timestamp), `riconciliazione_chiusa_note` (nota opzionale) + indice parziale
- **Backend `banca_router.py`** — `get_cross_ref` tratta un movimento con `riconciliazione_chiusa=1` come completamente collegato (niente suggerimenti, finisce nel tab Collegati). Due nuovi endpoint: `POST /cross-ref/chiudi/{movimento_id}` (con nota opzionale, richiede almeno un link esistente) e `POST /cross-ref/riapri/{movimento_id}` per annullare la chiusura
- **Frontend `BancaCrossRef.jsx`** — `isFullyLinked` include il flag `riconciliazione_chiusa`. Bottone verde "✓ Chiudi" nei tab Suggerimenti e Senza match sui movimenti con link parziale (apre prompt per nota opzionale). Nel tab Collegati, i movimenti chiusi manualmente mostrano badge "🔒 Chiusa manuale" + nota + bottone "Riapri"
- **Risultato**: Marco può ora chiudere N/C che spezzano l'importo, bonifici multipli, fattura+rata con un click, e sapere perché ha chiuso grazie alla nota

---

### D3. Flussi di Cassa — Doppioni versamenti banca ✅ 2026-04-11
**Causa:** BPM esporta lo stesso movimento in due formati CSV diversi (uno con `ragione_sociale`+`banca` pieni e descrizione UPPERCASE, uno con campi vuoti e descrizione lowercase). Il dedup_hash v2 non catturava il pattern perché il prefisso comune delle descrizioni normalizzate era troppo corto (es. "comm" vs "commissioni" = 4 char).

**Fix:**
- **Migrazione 058** `058_pulizia_banca_duplicati_formato.py` — cleanup one-shot dei 10 duplicati residui. Raggruppa per `(data_contabile, importo)` con esattamente 2 righe, identifica il pattern "uno con ragione_sociale pieno + uno vuoto", tiene il record con più metadati, migra eventuali link fattura/cg_uscite/cg_entrate, elimina il duplicato. Testata su copia DB: 10/10 eliminati, gruppi legittimi (commissioni bonifici multiple con RIF diversi) intatti
- **Soft dedup check in `banca_router.py`** — prima di `INSERT` nell'import CSV, verifica se esiste già un record con stessa `(data_contabile, importo)` e pattern `ragione_sociale` opposto (vuoto vs pieno). Se sì, skippa l'import (count come duplicato soft)
- **Risultato**: €5000 del 26/01 ora singolo record, futuri import dei due formati BPM non creeranno più doppioni

---

## Come usare questo file

- **Marco**: quando trovi un bug, aggiungilo sotto "Aperti" con sintomo chiaro e un esempio concreto. Niente "non funziona", sempre "apre la pagina X, clicca Y, mi aspetto Z ma succede W"
- **Claude**: all'inizio di ogni sessione leggi questo file subito dopo `sessione.md`. Se Marco ti chiede "cosa c'è da fare?" rispondi prima con la lista di questo file, poi con la roadmap
- **Risoluzione**: quando chiudi un problema, spostalo in "Risolti" con data + `./push.sh "msg"` di riferimento, e aggiorna il changelog
