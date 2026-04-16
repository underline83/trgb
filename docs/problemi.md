# TRGB Gestionale — Problemi segnalati da Marco

> File dedicato ai bug e anomalie segnalati da Marco durante l'uso del gestionale, in attesa di intervento.
> **Claude**: leggi questo file a inizio sessione insieme a `sessione.md` e `roadmap.md`.
> **Regola**: quando un problema è risolto, spostalo in "Risolti" in fondo con data e commit.

---

## Aperti — Priorità media

_(S40-1, S40-2, S40-3 risolti Wave 1 — vedi sezione Risolti.)_

_(S40-4, S40-5, S40-6 risolti — vedi sezione Risolti.)_

_(S40-7, S40-8 risolti Wave 3 — vedi sezione Risolti.)_

_(S40-9, S40-10, S40-11 risolti Wave 2 — vedi sezione Risolti.)_

_(S40-12, S40-13 risolti Wave 3 — vedi sezione Risolti.)_

---

### S40-14. Flussi di Cassa — Duplicati Sogegros ancora presenti
**Segnalato:** 2026-04-16 (sessione 40)
**Modulo:** Flussi di Cassa / Banca movimenti
**Gravità:** media

**Sintomo:** due voci identiche Sogegros (cash and carry) per €597,08 visibili in lista.

**Contesto:** già chiusi 5 interventi dedup (migrazioni 041, 042, 046, 051, 058). Evidentemente la logica non copre tutti i casi.

**Da capire:**
1. Data dei due duplicati? (serve per distinguere: stesso giorno = import doppio; giorni diversi = incasso e restituzione legittimi male identificati)
2. Causale/riferimento identico?
3. Decidere regola dedup aggiuntiva (es. se stesso importo + stessa data + stessa descrizione → dedup aggressivo)

Serve caso concreto da Marco (ID banca_movimenti dei due record).

---

### S40-15. Acquisti — Import FIC salta dettaglio righe ✅ CHIUSO 2026-04-16
**Segnalato:** 2026-04-16 (sessione 40)
**Modulo:** Acquisti / Import Fatture in Cloud
**Gravità:** media

**Sintomo:** alcune fatture importate da FIC non hanno il dettaglio righe, nonostante su FIC il dettaglio ci sia (es. OROBICA 201969/FTM 2026-03-31 €7425.24, MILESI 2026/300).

**Causa radice:** l'API FIC `/received_documents/{id}?fieldset=detailed` restituisce `is_detailed=false, items_list=[], e_invoice=true` per le fatture registrate come "Spesa" senza dettaglio strutturato. Le righe esistono solo dentro il tracciato XML SDI allegato, accessibile via `attachment_url` (pre-signed temporaneo read-only). Non e' regressione lato nostro — e' comportamento FIC nativo che dipende dalla modalita' di registrazione.

**Fix (commit 2026-04-16):**
1. NEW `app/utils/fatturapa_parser.py` — parser FatturaPA riusabile (zip/p7m/xml/utf-16, `DettaglioLinee`).
2. Fallback automatico in `_fetch_detail_and_righe`: se `items_list=[] && e_invoice && attachment_url` → scarica XML, parsa, popola `fe_righe`.
3. Endpoint recovery retroattivo: `POST /fic/refetch-righe-xml/{db_id}` + `POST /fic/bulk-refetch-righe-xml`.
4. UI Fatture › Impostazioni › FIC: card "📥 Recupero righe da XML SDI" con singolo + bulk.
5. Exception swallow in `_fetch_detail_and_righe` rimosso (ora `traceback.print_exc()`).

**Action item per Marco:** dopo il push, Fatture › Impostazioni › FIC → "Recupero righe da XML SDI" → anno 2026, limite 500 → Avvia.

---

### S40-16 + S40-17. Statistiche — Import iPratico sparito + menu con meno opzioni ✅ CHIUSO 2026-04-16
**Segnalato:** 2026-04-16 (sessione 40)
**Modulo:** Statistiche / Nav + tutti i Nav moduli
**Gravità:** media-alta (Import iPratico e' critico per popolare le statistiche)

**Causa radice:** bug sistematico in 6 file Nav (`StatisticheNav`, `RicetteNav`, `ViniNav`, `PrenotazioniNav`, `BancaNav`, `ClientiNav`). Il filtro `tab.roles.includes(role)` non gestiva l'ereditarieta' superadmin → admin. `useModuleAccess.roleMatch` aveva gia' la logica corretta (riga 38: `role === "superadmin" && roles.includes("admin")`) ma i Nav locali la bypassavano. Marco loggato come superadmin non vedeva le tab con `roles: ["admin"]`, tra cui Import iPratico.

Per S40-17: il vecchio hub con card `StatisticheMenu.jsx` fu rimosso in sessione 39 (commit `1d8ada9`) e sostituito con tab bar + ModuleRedirect. Nessuna funzionalita' persa — la tab bar ha gli stessi link (Dashboard, Prodotti, Coperti, Import). I placeholder "Cantina" e "Personale" (mai funzionali) sono spariti.

**Fix:** allineato il filtro in tutti i 6 Nav: `!tab.roles || tab.roles.includes(role) || (role === "superadmin" && tab.roles.includes("admin"))`.

**File toccati:** `StatisticheNav.jsx`, `RicetteNav.jsx`, `ViniNav.jsx`, `PrenotazioniNav.jsx`, `BancaNav.jsx`, `ClientiNav.jsx`.

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

### S40-1. Dipendenti — Crash al salvataggio nuovo dipendente ✅ 2026-04-16 (Wave 1)
**Fix:** trailing slash mancante su POST `/dipendenti` → `/dipendenti/`. Pattern CLAUDE.md.

### S40-2. Dipendenti — "+ Nuovo reparto" non fa nulla ✅ 2026-04-16 (Wave 1)
**Fix:** aggiunto flag `isCreating` in `GestioneReparti.jsx`, allineato al pattern `DipendentiAnagrafica`.

### S40-3. UI — Campanello iPad click non apre ✅ 2026-04-16 (Wave 1)
**Fix:** prop `disableOnTouch` su `Tooltip.jsx`, applicata a 🔔 e 🔑 nel Header.

### S40-16 + S40-17. Nav: superadmin non vedeva tab "admin-only" ✅ 2026-04-16
**Causa:** 6 Nav file usavano `tab.roles.includes(role)` senza ereditarieta' superadmin→admin. Import iPratico Statistiche era la tab piu' visibilmente mancante.
**Fix:** allineato filtro in `StatisticheNav`, `RicetteNav`, `ViniNav`, `PrenotazioniNav`, `BancaNav`, `ClientiNav` a stessa logica di `useModuleAccess.roleMatch`.

---

### S40-7. UI — Tab bar Controllo Gestione uniformata ✅ 2026-04-16 (Wave 3)
**Modulo:** Controllo Gestione / Nav (Dashboard, Confronto, Uscite, Riconciliazione)

**Causa:** layout header incoerente tra le 4 pagine CG. Dashboard/Confronto avevano padding esterno `p-6` che impediva al Nav di arrivare full-width. Riconciliazione usava `bg-neutral-50` invece di `bg-brand-cream` + titolo generico senza Playfair. Uscite aveva back button custom che duplicava il link "← Home" del Nav.

**Fix:** tutte le 4 pagine ora seguono il pattern Dipendenti/Flussi/Clienti. Wrapper esterno senza padding (Nav full-width), contenuto wrappato in `<div className="px-4 sm:px-6 pb-6">`. Titoli in `font-playfair text-sky-900`. `ControlloGestioneUscite.jsx` ora importa `ControlloGestioneNav current="uscite"`, rimuove back button custom, altezza `calc(100dvh - 97px)`.

**File toccati:** `ControlloGestioneDashboard.jsx`, `ControlloGestioneConfronto.jsx`, `ControlloGestioneUscite.jsx`, `ControlloGestioneRiconciliazione.jsx`.

---

### S40-8. Acquisti — Fornitori ignorati nascosti di default ✅ 2026-04-16 (Wave 3)
**Modulo:** Acquisti / Fatture Elenco

**Fix backend:** `GET /fatture` in `fe_import.py` fa LEFT JOIN `fe_fornitore_categoria fc_excl` (match per P.IVA o per nome se P.IVA assente) e ritorna `COALESCE(fc_excl.escluso_acquisti, 0) AS escluso_acquisti` nella response.

**Fix frontend:** `FattureElenco.jsx` state `mostraEsclusi = false` (default). Filtro in `fattureBase`: `if (!mostraEsclusi) list = list.filter(f => !f.escluso_acquisti)`. Toggle "Mostra anche ignorati" nella sidebar sotto Stato (visibile solo se esistono fatture escluse). Quando attivo, le fatture escluse mostrano un badge ambra "ESCLUSO" accanto al fornitore.

**File toccati:** `app/routers/fe_import.py`, `frontend/src/pages/admin/FattureElenco.jsx`.

---

### S40-12. Flussi — Workbench: bulk Parcheggia + Flagga senza match ✅ 2026-04-16 (Wave 3)
**Modulo:** Flussi di Cassa / Cross-Ref banca

**Migrazione 082:** aggiunte colonne `parcheggiato INTEGER DEFAULT 0` e `parcheggiato_at TEXT` su `banca_movimenti`. Indice parziale `idx_banca_mov_parcheggiato WHERE parcheggiato = 1`.

**Backend:** `POST /banca/cross-ref/parcheggia-bulk` (body: `movimento_ids: List[int]`) e `POST /banca/cross-ref/disparcheggia/{movimento_id}`.

**Frontend:** `BancaCrossRef.jsx` nuovo tab "Parcheggiati 🅿️". Handler `handleBulkParcheggia` (POST persistente), `handleBulkDismiss` (client-side: estende il Set `dismissed` esistente), `handleDisparcheggia` (singolo). I parcheggiati sono esclusi da Suggerimenti e Senza match. Toolbar bulk estesa alle 3 tab (senza/suggerimenti/parcheggiati). Riga parcheggiata: colonna timestamp + bottone "↩ Disparcheggia" individuale. `colSpan` calcolato per la nuova tab.

**File toccati:** `app/migrations/082_banca_parcheggiato.py`, `app/routers/banca_router.py`, `frontend/src/pages/banca/BancaCrossRef.jsx`.

---

### S40-13. Flussi iPad — Descrizione tap-to-expand ✅ 2026-04-16 (Wave 3)
**Modulo:** Flussi di Cassa / Cross-Ref banca

**Causa:** cella Descrizione era `max-w-xs truncate` → su iPad il testo veniva tagliato e il `title` HTML non era accessibile via tap.

**Fix:** nuovo state `expandedDesc: Set<movId>` + handler `toggleDesc`. Cella descrizione `onClick={() => toggleDesc(m.id)}`, classe condizionale `truncate` ↔ `whitespace-normal break-words`. `cursor-pointer select-none` per chiarezza touch. Tooltip title contestuale.

**File toccati:** `frontend/src/pages/banca/BancaCrossRef.jsx`.

---

### S40-4. Dipendenti — Inattivo mantiene colore occupato ✅ 2026-04-16 (Wave 2)
**Modulo:** Dipendenti / Anagrafica

**Causa:** `DELETE /dipendenti/{id}` faceva soft-delete `attivo = 0` lasciando `colore` invariato → il colore restava "occupato" nel picker.

**Fix:** la query DELETE ora fa `UPDATE dipendenti SET attivo = 0, colore = NULL WHERE id = ?`. Il colore torna disponibile per nuovi dipendenti; nel foglio settimana il fallback FE `dipendente_colore || "#d1d5db"` rende grigi i turni storici (effetto desiderato).

**File toccati:** `app/routers/dipendenti.py` (DELETE handler).

---

### S40-5. Dipendenti — Auto-ID alla creazione ✅ 2026-04-16 (Wave 2)
**Modulo:** Dipendenti / Anagrafica

**Fix:** `DipendenteBase.codice` ora `Optional[str]`. Aggiunto `_genera_codice_dipendente(cur)` che scansiona i codici esistenti `DIP\d+`, prende il massimo numerico e ritorna `DIPNNN` con `+1` e padding a 3 cifre. POST genera quando `codice` è vuoto; PUT mantiene il codice esistente. Il FE non chiede piu' il codice (campo non required, placeholder dinamico "Auto (DIPNNN)" per nuovi).

**File toccati:** `app/routers/dipendenti.py`, `frontend/src/pages/dipendenti/DipendentiAnagrafica.jsx`.

---

### S40-6. Dipendenti — Campo nickname in anagrafica + uso nelle stampe ✅ 2026-04-16 (Wave 2)
**Modulo:** Dipendenti / Anagrafica + Foglio settimana + WhatsApp turni

**Fix:**
- **Migrazione 081**: `ALTER TABLE dipendenti ADD COLUMN nickname TEXT` su `dipendenti.sqlite3` (idempotente, lavora su DB separato).
- **Backend**: campo aggiunto al modello `DipendenteBase`, INSERT/UPDATE in `dipendenti.py`. Tutte le SELECT che ritornano turni o info dipendente includono ora `d.nickname AS dipendente_nickname` (4 in `dipendenti.py`, 2 in `turni_router.py`, 4 in `turni_service.py` foglio/mese/dipendente/WA).
- **PDF foglio settimana** (`turni_router.py`:669): `cella_html` usa nickname se presente, altrimenti `Primo I.`.
- **Composer WhatsApp turni** (`turni_service.py`:1515): saluto `Ciao Pace, ecco i tuoi turni…` invece di `Ciao Giovanni`.
- **FE**: `DipendentiAnagrafica.jsx` form con campo nickname + helper text. `FoglioSettimana.jsx` `SlotCell` e `OrePanel` mostrano nickname se presente. Dialog "Invia turni via WA" mostra `Nome Cognome (Nickname)` per riconoscimento.

---

### S40-9. Controllo Gestione — Default filtri Uscite (mese corrente + stati attivi) ✅ 2026-04-16 (Wave 2)
**Modulo:** Controllo Gestione / Uscite

**Fix:** `ControlloGestioneUscite.jsx` cambia i default: `filtroStato = {DA_PAGARE, SCADUTA, PAGATA}` (esclude solo SOSPESA), `filtroDa = primo del mese corrente`, `filtroA = ultimo del mese corrente`. Calcolati con `useState(() => …)` per evitare ricomputi a ogni render.

---

### S40-10. Controllo Gestione — Somma importi su selezione multipla ✅ 2026-04-16 (Wave 2)
**Modulo:** Controllo Gestione / Uscite

**Fix:** nuovo `useMemo sommaSelezionati` calcola residuo (`totale - importo_pagato`) sulle righe selezionate. Mostrato nella bulk action bar con separatore: `📊 Totale residuo: € 1.234,56`.

---

### S40-11. Flussi di Cassa — Suggerimenti con distanza date inverosimile ✅ 2026-04-16 (Wave 2)
**Modulo:** Flussi di Cassa / Riconciliazione

**Causa:** `_score_match` in `banca_router.py` premiava la prossimita' (≤5gg, ≤15gg) ma non scartava mai per distanza temporale → suggeriva accoppiamenti pagamento↔movimento banca con 8-10 mesi di distanza (caso reale: SDD 08-apr-26 €94,81 vs Amazon Business 11-ago-25).

**Fix:** aggiunto cutoff duro a 180 giorni (return None) + penalita' progressiva: ≤30gg neutro, 30-60gg `+15`, 60-120gg `+40`, 120-180gg `+80`. I match plausibili restano in cima, quelli sospetti vengono sommersi o eliminati.

---

### P1. Prenotazioni — Import TheFork senza nome per ~22% delle righe ✅ 2026-04-13
**Segnalato:** 2026-04-13
**Modulo:** Prenotazioni / Import TheFork (Clienti)
**Gravità:** media

**Sintomo:** molte prenotazioni importate dall'XLSX `tfm-search-results` di TheFork mostrano "—" al posto del nome cliente nel Planning, anche se nel file TheFork il nome c'è.

**Causa:** il file XLSX di TheFork espone `Customer first name` / `Customer last name` direttamente su ogni riga prenotazione, ma l'endpoint `POST /clienti/import/prenotazioni` (clienti_router.py) non leggeva queste due colonne. Affidava il nome al solo JOIN con `clienti` via `Customer ID`. Quando `Customer ID` era NULL (walk-in registrati in TFM, prenotazioni anonimizzate GDPR, clienti rimossi — ~22% delle righe = 6.831 su 31.377 nel file reale di Marco) il JOIN restituiva NULL → frontend mostrava "—". Stesso effetto anche con Customer ID presente ma anagrafica non ancora importata.

**Fix:**
- **Migrazione 068**: aggiunge `nome_ospite TEXT` e `cognome_ospite TEXT` a `clienti_prenotazioni` in `clienti.sqlite3`. Stessa colonne aggiunte anche al blocco `pren_cols` di `init_clienti_db` per consistenza su DB nuovi.
- **`import_prenotazioni` (clienti_router.py ~630)**: legge `Customer first name` / `Customer last name` e li salva come snapshot sulla prenotazione. Sopravvivono a tutto: assenza Customer ID, anagrafica non importata, cliente rimosso dal CRM.
- **`get_planning` (prenotazioni_router.py ~190)**: la SELECT ora usa `COALESCE(c.nome, p.nome_ospite)` / `COALESCE(c.cognome, p.cognome_ospite)`. Preferenza al dato CRM (aggiornabile a mano), fallback al dato TheFork.
- **Stessa COALESCE nella query TavoliMappa** (prenotazioni_router.py ~960) — così anche la vista planimetria mostra il nome nei tavoli "anonimi".
- **`PrenotazioniPlanning.jsx`**: micro-fix della stringa nome (no spazio finale se cognome vuoto) e commento che spiega il nuovo comportamento.

**Effetto:** tutte le prenotazioni importate da TheFork mostrano ora un nome nel planning, anche senza Customer ID e senza anagrafica importata. Se e quando Marco collega manualmente la prenotazione a un cliente CRM, il nome CRM prende il sopravvento (COALESCE) e ogni correzione anagrafica viene riflessa.

**Nota operativa:** per popolare i campi su prenotazioni già importate prima della migrazione, serve rilanciare l'import del file XLSX completo (l'upsert aggiorna tutti i record esistenti senza duplicarli).

---

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
