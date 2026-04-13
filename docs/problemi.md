# TRGB Gestionale — Problemi segnalati da Marco

> File dedicato ai bug e anomalie segnalati da Marco durante l'uso del gestionale, in attesa di intervento.
> **Claude**: leggi questo file a inizio sessione insieme a `sessione.md` e `roadmap.md`.
> **Regola**: quando un problema è risolto, spostalo in "Risolti" in fondo con data e commit.

---

## Aperti — Priorità alta

(nessuno al momento)

---

## Aperti — Priorità media

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

### B1. Sistema — Ruoli/permessi si "ripristinano" dopo i deploy ✅ 2026-04-11
**Causa:** `app/data/modules.json` era tracciato in git (con una nota esplicita nel `.gitignore`: _"modules.json è tracciato in git, non contiene dati sensibili, solo config moduli"_). Quando Marco modificava i ruoli/permessi dal pannello Impostazioni in produzione, il backend salvava le modifiche in `modules.json` sul VPS — corretto. Ma al primo `push.sh` successivo, il post-receive hook faceva `git checkout` del working dir ricaricando `modules.json` dal commit di Marco (macchina locale), **sovrascrivendo la versione runtime con il seed hardcoded in git**. Risultato: i ruoli modificati sparivano ad ogni deploy, in modo imprevedibile perché il reset coincideva con un push di codice non correlato.

`users.json` invece non aveva il problema perché era già gitignored (le credenziali non sono in repo).

**Fix:**
- **Split seed / runtime in `modules_router.py`**: introdotti due path separati. `modules.json` resta tracciato in git ma ora ha il ruolo di **seed** (default ruoli al primo deploy). Lo stato effettivo vive in `modules.runtime.json`, creato al primo `_load()` copiando il seed.
- **`_load()` prova prima `modules.runtime.json`**: se esiste, lo legge e basta. Se non esiste, copia il seed `modules.json` → `modules.runtime.json` e restituisce il seed. Se manca anche il seed, cade su `DEFAULT_MODULES` hardcoded
- **`_save()` scrive sempre su `modules.runtime.json`** — il seed tracciato in git non viene mai toccato dal backend
- **`.gitignore`**: aggiunto `app/data/modules.runtime.json` così il file runtime sopravvive ai deploy. Il commento è esplicito sulla ragione del design (bug B1)
- **Zero-break deploy**: al primo restart dopo il fix, `_load()` bootstrap-a il runtime dal seed attuale. I ruoli sono identici a prima del fix, poi Marco può modificare liberamente senza più perdere lo stato
- **Nota sul recupero dello stato**: purtroppo le modifiche ai ruoli che Marco aveva fatto negli ultimi deploy e che sono state sovrascritte da push precedenti **non sono recuperabili** (il git tracciato non conserva lo storico VPS). Marco dovrà reimpostare i permessi una volta dopo il primo deploy col fix — da quel momento saranno stabili

---

### D4. PWA Fase 0 — Service worker riscritto network-first ✅ 2026-04-13 (commit f194870)
**Risolto in:** sessione 28 (ma docs non aggiornati fino a sessione 31).
**Fix:** `sw.js` riscritto con strategia network-first (zero precache, cache solo fallback offline), `CACHE_NAME` legato a `BUILD_VERSION`, registrazione riattivata in `main.jsx`. Manifest e meta tag iOS già a posto dal sessione 26. In produzione da sessione 28, nessun crash segnalato.

---

### C1. Dipendenti — Bottone WhatsApp per condividere cedolino ✅ 2026-04-11
**Richiesta:** Accanto al bottone PDF della lista cedolini, aggiungere un tasto WA che apra WhatsApp col numero del dipendente e pre-compili il messaggio.

**Fix:**
- **Backend** `dipendenti.py` — la query `GET /buste-paga` ora include `d.telefono` nel SELECT, così il frontend dispone del numero senza round-trip aggiuntivo
- **Frontend** `DipendentiBustePaga.jsx` — aggiunto bottone "WA" (emerald) accanto a "✕" nella colonna Azioni. Al click:
  1. Normalizza il numero (strip spazi/+, aggiunge prefisso +39 ai cellulari italiani)
  2. Scarica il PDF in locale col nome `bustapaga_cognome_nome_YYYY-MM.pdf` (solo se `pdf_path` presente)
  3. Apre `https://wa.me/{numero}?text=Ciao {nome}, ecco la tua busta paga di {mese}/{anno}. Netto: € {x}. Il PDF è stato scaricato sul mio PC, te lo allego qui.`
- Il bottone è disabilitato in grigio se `telefono` è vuoto, con tooltip esplicativo. Al primo click l'utente (Marco) trascina il PDF dal download allegandolo al thread WhatsApp che si è appena aperto
- **Nota tecnica:** non esiste un modo via URL di allegare automaticamente il file a un messaggio WA. L'unica alternativa sarebbe integrare WhatsApp Business API — fuori scope

---

### C2. Dipendenti — Cedolini PDF in tab Documenti anagrafica ✅ 2026-04-11 (bug endpoint 500)
**Segnalato:** tab Documenti dell'anagrafica non mostrava i cedolini importati dal LUL, solo il form di upload per gli allegati manuali.

**Causa reale (trovata dopo verifica end-to-end):** L'endpoint `GET /dipendenti/{id}/documenti` (in `dipendenti.py` linee 1911-1953) era _scritto_ per fare la UNION di `dipendenti_allegati` + `buste_paga` con `pdf_path IS NOT NULL`. Ma alla riga 1940 faceva `MESI_IT.get(c["mese"], str(c["mese"]))` trattando `MESI_IT` come un dict — mentre alla riga 1080 `MESI_IT` è definito come **lista** `["", "Gennaio", "Febbraio", ...]`. Le liste Python non hanno `.get()`, quindi appena il loop incontrava il primo cedolino, l'endpoint lanciava `AttributeError: 'list' object has no attribute 'get'` → FastAPI trasformava l'eccezione in HTTP 500 → il frontend nel `try/catch` di `loadDocumenti` cadeva nel `catch` e faceva `setDocs([])` → lista vuota visibile all'utente, né cedolini né allegati.

Il bug era presente sin dall'introduzione della UNION cedolini+allegati (sessione 18, 2026-03-30). Non si è notato prima perché:
1. Chi testava doveva avere un dipendente **senza alcun cedolino con pdf_path**, nel qual caso il loop non partiva e l'endpoint tornava correttamente la lista degli allegati manuali
2. Oppure non aveva allegati manuali, quindi la lista vuota sembrava coerente con "non ho ancora caricato nulla" — è esattamente quello che ha visto Marco

**Fix (1 riga):** sostituito in `dipendenti.py` ~riga 1940:
```python
# prima (BROKEN):
mese_label = MESI_IT.get(c["mese"], str(c["mese"])) if c["mese"] else "?"

# dopo:
mese_idx = c.get("mese") or 0
mese_label = MESI_IT[mese_idx] if 1 <= mese_idx <= 12 else "?"
```

**Verifica:** simulata la query dell'endpoint sul DB locale con il nuovo codice. Per Marco Carminati (id=1) vengono generati correttamente `Cedolino Gennaio 2026`, `Cedolino Febbraio 2026`, `Cedolino Marzo 2026`. Dopo push e Ctrl+Shift+R i cedolini appaiono nella tab Documenti con sfondo viola e bottone "📄 Apri PDF".

**Lesson learned:** nella prima passata avevo chiuso C2 come "feature già esistente, non c'è nulla da fare" basandomi solo sulla lettura del codice e sui dati del DB, senza provare end-to-end il percorso frontend → API → render. Fidarsi del codice senza eseguirlo è stato un errore: il codice era scritto ma non funzionava.

---

### A1. Acquisti — FattureInCloud importa non-fatture (affitti Cattaneo/Bana) ✅ 2026-04-11
**Causa:** L'endpoint FIC `received_documents?type=expense` restituisce anche registrazioni di prima nota (affitti, spese cassa) che in FIC vengono create senza numero di documento e senza P.IVA del fornitore. Il sync le importava come se fossero vere fatture elettroniche, finendo in `fe_fatture` e duplicando le voci in dashboard Acquisti. Pattern identificato: `numero_fattura=''` AND `fornitore_piva=''` AND `fonte='fic'`. Casi concreti su DB: BANA MARIA DOLORES (26 record affitto locale), CATTANEO SILVIA (26 record affitto locale), PONTIGGIA (1 record isolato) — totale 53 fatture fittizie per €82.395,66.

**Fix:**
- **Migrazione 061** `061_escludi_fornitori_fittizi.py` — cleanup one-shot. Scansiona `fe_fatture` cercando record con numero vuoto + P.IVA vuota + fonte FIC, raggruppa per `fornitore_nome`, e INSERT/UPDATE in `fe_fornitore_categoria` con `escluso_acquisti=1` e `motivo_esclusione='Non-fattura importata da FIC (senza numero né P.IVA, probabile affitto/spesa cassa)'`. I record storici restano in `fe_fatture` per non rompere eventuali link cg_uscite esistenti, ma vengono automaticamente filtrati da dashboard/KPI grazie al `COALESCE(fc.escluso_acquisti, 0) = 0` già attivo in `fe_import.py`. Idempotente. Testata su copia DB: 3 fornitori esclusi, 57 fatture filtrate dal totale dashboard
- **Filtro a monte in `fattureincloud_router.py`** — nella FASE 1 del `sync_fic`, prima del dedup hash, se `doc_number` e `fornitore_piva` sono entrambi stringhe vuote il record viene skippato e contato in `skipped_non_fattura`. Questo blocca l'ingresso di nuove non-fatture ai futuri sync, senza toccare le fatture vere. Il conteggio skippati finisce nella note di fine sync
- **Upgrade A1 (mig 062)** — Marco ha chiesto di rendere questi skip visibili e tracciabili: creata tabella `fic_sync_warnings` (foodcost.db) con schema estendibile per futuri tipi di warning (`tipo`, `fornitore_nome/piva`, `data_documento`, `importo`, `fic_document_id`, `raw_payload_json`, `visto`, `visto_at`, `note`), indici + UNIQUE `(tipo, fic_document_id)` per dedup su sync ripetuti. Il filtro a monte ora fa `INSERT OR IGNORE` nella tabella invece di skip silenzioso. Aggiunti endpoint `/fic/warnings` (lista con filtro visto/non visto), `/fic/warnings/count`, `/fic/warnings/{id}` (dettaglio + raw payload), `/fic/warnings/{id}/visto` + `/unvisto`. Frontend: nuova tab "Warning" dentro la pagina Fatture in Cloud con badge arancio per i non visti, export CSV, bottone 🔍 per vedere il payload raw FIC in modale, bottoni ✓/↺ per marcare visto/non visto. Se un domani FIC cambia formato e inizia a inviare qualcosa di inatteso senza P.IVA, lo trovi tutto lì
- **Dove vedere i fornitori flaggati nell'app**: Acquisti → Fornitori, sidebar filtri → checkbox "Mostra esclusi (N)". Appaiono con badge giallo "ESCLUSO" e si possono riattivare dal dettaglio fornitore (toggle in alto della scheda)
- **Risultato**: dashboard Acquisti pulita immediatamente, futuri sync FIC ignorano automaticamente le prima-nota ma le registrano nella tabella warning. Se un giorno Cattaneo/Bana emettessero una vera fattura elettronica con P.IVA, quella avrà un record distinto in `fe_fornitore_categoria` (match per P.IVA) e verrà importata normalmente
- **Follow-up 2 (stessa giornata) — doppio conteggio in scadenzario + riconciliazioni sbagliate:** Marco usando il gestionale ha notato che il filtro `escluso_acquisti` era efficace solo nella dashboard Acquisti. Le stesse fatture continuavano a comparire nello scadenzario uscite di Controllo Gestione e nel matcher banca. Conseguenza: ogni mese l'affitto veniva contato due volte (rata della spesa fissa CG + fattura FIC "CATTANEO SILVIA"), e 3 bonifici erano stati collegati manualmente alla fattura FIC sbagliata (movimenti 100, 102, 294) invece che alla rata della spesa fissa. Procedura concordata con Marco: **Opzione A — filtri a monte ovunque**; Opzione B (lasciare fattura e droppare spesa fissa) rigettata come illogica; Opzione C (link fattura↔spesa_fissa con colonna dedicata `coperta_da_spesa_fissa_id`) differita a v2.1 come design doc separato.
  - **Mig 063** `063_cleanup_riconciliazioni_escluse.py` — cleanup one-shot con backup in audit table `cg_uscite_audit_063` (snapshot JSON completo). Cancella i 3 `banca_fatture_link` dirty, riapre i 3 movimenti bancari (reset `riconciliazione_chiusa=0`), cancella le 57 `cg_uscite` (28 BANA + 28 CATTANEO + 1 PONTIGGIA). I record in `fe_fatture` restano per audit e warning tab. Idempotente. Testata su copia DB
  - **Filtro in `controllo_gestione_router.py`**: (1) generatore `import_fatture_cg` a riga 447 con LEFT JOIN fe_fornitore_categoria + `COALESCE(escluso_acquisti, 0) = 0` per impedire rigenerazione al prossimo sync; (2) endpoint `GET /uscite` con nuovo param `includi_escluse` (default false) e clausola nel WHERE `(u.fattura_id IS NULL OR escluso_acquisti = 0)` che lascia passare le cg_uscite di tipo SPESA_FISSA
  - **Filtro in `banca_router.py`**: le 4 query fatture del matcher (match-per-nome, match-per-importo, search-importo, search-testo) ora fanno JOIN a `fe_fornitore_categoria` con stesso pattern ed escludono i fornitori flaggati. Così il matcher non propone più le fatture escluse come possibili match per i bonifici d'affitto
  - **Frontend `ControlloGestioneUscite.jsx`**: nuovo toggle ambra "Mostra escluse" nella sidebar Filtri speciali sotto "Mostra rateizzate", con tooltip che spiega l'uso anti-doppio-conteggio. Passato come query param a `fetchData`
  - **Azione manuale per Marco post-deploy:** riconciliare manualmente in Flussi di Cassa i 3 bonifici bancari (ora "senza match") contro le rate delle spese fisse CG "Ristorante - Via Broseta 20/C" e "Cucina - Via Broseta 20/B" del mese corrispondente

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
