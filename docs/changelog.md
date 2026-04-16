# 📄 TRGB Gestionale — CHANGELOG
**Formato:** Keep a Changelog

---

## 2026-04-16 — Sessione 40 / Dipendenti — Assenze (Ferie / Malattia / Permesso)

Marco: _"bisogna prevedere il concetto di 'ferie' — gente che mi avvisa che non c'è"_

### Nuova tabella `assenze`

Migrazione 083: crea tabella `assenze` in `dipendenti.sqlite3` con UNIQUE su `(dipendente_id, data)`. Tre tipi: **FERIE** (🏖 ambra), **MALATTIA** (🤒 rosato), **PERMESSO** (📋 azzurro).

### Backend

- **CRUD completo**: `GET/POST /turni/assenze/`, `DELETE /turni/assenze/{id}`, `GET /turni/assenze/tipi`.
- POST fa **upsert** (se esiste assenza per dip+data, aggiorna tipo/note).
- I 3 builder (`build_foglio_settimana`, `build_vista_mese`, `build_vista_dipendente`) ora includono `assenze` nei dati ritornati.
- `build_vista_dipendente` aggiunge `assenza` nel `per_giorno` di ogni data + campo `totali.assenze`.

### Frontend

- **FoglioSettimana / OrePanel**: sotto ogni dipendente appare una mini-settimana di 7 cerchietti (L M M G V S D). Click su cerchio vuoto → mini-popover scelta tipo → crea. Click su cerchio pieno → elimina. Cerchi colorati con sigla (F/M/P) e bordo coordinato al tipo. Legenda tipi in fondo al pannello.
- **VistaMensile / CellaGiorno**: pillole colorate con sigla+iniziali dipendente in cima alla cella. PannelloGiorno: sezione "Assenze" con lista dettagliata (sigla, nome, tipo, note).
- **PerDipendente / CellaGiornoTimeline**: banner pieno a tutta larghezza con emoji+label del tipo (sovrasta turni e riposo). Totali periodo: aggiunta metrica "Assenze". Griglia metriche 6→7 colonne.

### File modificati

- `app/migrations/083_assenze.py` — nuova migrazione
- `app/services/turni_service.py` — CRUD assenze + arricchimento builder
- `app/routers/turni_router.py` — endpoint CRUD + model Pydantic
- `frontend/src/pages/dipendenti/FoglioSettimana.jsx` — OrePanel con mini-settimana assenze
- `frontend/src/pages/dipendenti/VistaMensile.jsx` — CellaGiorno pillole + PannelloGiorno sezione
- `frontend/src/pages/dipendenti/PerDipendente.jsx` — banner + metrica totali
- `frontend/src/config/versions.jsx` — dipendenti `2.25 → 2.26`

---

## 2026-04-16 — Sessione 40 / M.F Alert Engine + Pagina Impostazioni Notifiche

Nuovo mattone M.F: motore centralizzato che controlla soglie e scadenze, generando notifiche automatiche via M.A. Configurazione completa da UI.

**File creati:**
- `app/services/alert_engine.py` — registry di checker con decoratore `@register_checker`, config da DB, anti-duplicato, supporto dry-run
- `app/routers/alerts_router.py` — endpoint esecuzione (`GET /alerts/check/`, `POST /alerts/run/`) + CRUD config (`GET/PUT /alerts/config/`)
- `frontend/src/pages/admin/NotificheImpostazioni.jsx` — pagina impostazioni con card per ogni checker: toggle on/off, soglia giorni, anti-duplicato ore, destinatario (ruolo), canali (in-app / WhatsApp / email)

**3 checker implementati:**
- `fatture_scadenza`: fatture non pagate scadute o in scadenza (soglia configurabile, default 7gg)
- `dipendenti_scadenze`: documenti dipendenti in scadenza (usa alert_giorni del documento, fallback configurabile)
- `vini_sottoscorta`: vini con qta < scorta_minima (resiliente se colonna non esiste)

**DB:** tabella `alert_config` in `notifiche.sqlite3` (seed automatico al primo avvio).

**Trigger:** automatico da `GET /dashboard/home`, fire-and-forget. Anche manuale da UI ("Testa ora").

**UI:** nuovo tab "🔔 Notifiche" in Impostazioni Sistema. Canale email disabilitato (M.D non ancora implementato).

**File modificati:** `main.py`, `dashboard_router.py`, `notifiche_db.py`, `ImpostazioniSistema.jsx`, `docs/architettura_mattoni.md`.

---

## 2026-04-16 — Sessione 40 / S40-16+17 — Fix ereditarietà ruolo superadmin→admin nei Nav

Bug sistematico: 6 file Nav (`StatisticheNav`, `RicetteNav`, `ViniNav`, `PrenotazioniNav`, `BancaNav`, `ClientiNav`) usavano `tab.roles.includes(role)` senza gestire l'ereditarietà superadmin→admin. `useModuleAccess.roleMatch` aveva già la logica corretta, ma i Nav locali la bypassavano. Effetto visibile: Marco (superadmin) non vedeva tab come "Import iPratico" in Statistiche, "Impostazioni" in Banca/Ricette, etc.

**Fix:** allineato il filtro in tutti i 6 Nav a `|| (role === "superadmin" && tab.roles.includes("admin"))`.

**File toccati:** `StatisticheNav.jsx`, `RicetteNav.jsx`, `ViniNav.jsx`, `PrenotazioniNav.jsx`, `BancaNav.jsx`, `ClientiNav.jsx`.

---

## 2026-04-16 — Sessione 40 / S40-15 — Fallback XML SDI per righe fatture FIC senza items_list

Da fine marzo le fatture FIC di alcuni fornitori (es. OROBICA PESCA 201969/FTM, FABRIZIO MILESI 2026/300) venivano sincronizzate in TRGB senza righe in `fe_righe`. Causa radice confermata via endpoint `/fic/debug-detail/`: FIC ritorna `is_detailed=false`, `items_list=[]`, `e_invoice=true` — cioè il documento è stato registrato su FIC come "Spesa" senza dettaglio strutturato, quindi le righe esistono **solo** dentro il tracciato XML SDI allegato. Verificato sullo schema ufficiale OpenAPI (`openapi-fattureincloud/models/schemas/ReceivedDocument.yaml`) che `items_list` è popolato solo se la fattura è registrata con dettaglio, e che l'unica via per accedere al contenuto del file firmato è il campo `attachment_url` (pre-signed temporaneo, read-only).

### Nuovo mattone: parser FatturaPA (`app/utils/fatturapa_parser.py`)

Utility riusabile, pura Python (nessuna nuova dipendenza). Espone:
- `extract_xml_bytes(data: bytes) -> bytes`: normalizza un blob qualsiasi (XML plain, zip, p7m CMS-DER, UTF-16) in XML pulito. Strategia: zip via `zipfile`, p7m con estrazione euristica start/end marker (`<?xml` … `</FatturaElettronica>`) + fallback `openssl cms -verify -noverify`.
- `parse_fatturapa(data: bytes) -> dict`: ritorna `{numero, data, totale_documento, fornitore_piva, fornitore_denominazione, righe[]}`. Ogni riga: `numero_linea, codice_articolo, descrizione, quantita, unita_misura, prezzo_unitario, prezzo_totale, aliquota_iva, sconto_percentuale`. Tollerante su campi mancanti, virgola decimale, namespace XML (stripped via `_strip_namespace`), prioritizza `CodiceArticolo` con `CodiceTipo=INTERNO`.
- `download_and_parse(url, timeout=30) -> dict`: helper che scarica da `attachment_url` pre-signed e parsa.

### Sync FIC: fallback automatico in `_fetch_detail_and_righe`

`app/routers/fattureincloud_router.py` — quando FIC restituisce `items_list=[]` ma `e_invoice=true` + `attachment_url` presente, il sync scarica automaticamente l'XML e popola `fe_righe` dal `DettaglioLinee` SDI. Le righe da XML vengono comunque auto-categorizzate via `auto_categorize_righe(...)`. Lo swallow di eccezioni a fine funzione è stato sostituito con log + `traceback.print_exc()`. Il result dict ora ritorna anche `fonte_righe` (`"fic"` | `"xml"` | `""`).

### Endpoint debug e recovery retroattivo

- `GET /fic/debug-detail/{fic_id}?try_xml=true`: oltre ai campi già esposti, ora restituisce `attachment_url`, `attachment_preview_url`, `numero` (alias di `invoice_number` per compatibilità frontend) e `xml_parse` (preview parsing XML se applicabile).
- `POST /fic/refetch-righe-xml/{db_id}`: per una singola fattura in DB, recupera l'`attachment_url` via FIC, scarica+parsa l'XML, reinserisce le righe.
- `POST /fic/bulk-refetch-righe-xml?anno=YYYY&solo_senza_righe=true&limit=N`: bulk retroattivo su tutte le fatture FIC con `n_righe=0`. Ritorna contatori + dettaglio per-fattura.

### UI — Fatture › Impostazioni › FIC

`FattureImpostazioni.jsx` (v2.3-xml-fallback-recovery): la card debug ora mostra la preview parsing XML (numero, data, PIVA, prime 5 righe) quando FIC è senza righe ma XML disponibile. Nuova card "📥 Recupero righe da XML SDI" con due azioni: (1) singola fattura per DB id, (2) massivo con filtro anno + limite (conferma obbligatoria, progress spinner, risultato dettagliato per-fattura).

### File modificati
- **NEW** `app/utils/fatturapa_parser.py` — parser FatturaPA/SDI riusabile.
- `app/routers/fattureincloud_router.py` — fallback XML in `_fetch_detail_and_righe`, debug-detail esteso, endpoint `refetch-righe-xml/{db_id}` e `bulk-refetch-righe-xml`, log esplicito eccezioni.
- `frontend/src/pages/admin/FattureImpostazioni.jsx` — preview parsing XML nel debug, card recovery singolo + bulk.

### v2 — Fix schema + skipped_non_fe + time budget (stesso giorno)

- **Fix critico**: `fornitore_denominazione` → `fornitore_nome` (era nome parser, non colonna DB). Preflight su tutte le query SQL verificate vs `PRAGMA table_info`.
- **Bulk batch ridotto**: `limit` default da 500→50, `max_seconds=90` time budget con `stopped_by_timeout` e `rimanenti_stima` per evitare timeout nginx.
- **Fatture non elettroniche (skipped_non_fe)**: `_refetch_righe_xml_single` ora ritorna `"skipped": true, "reason": "non_fe"` quando FIC dice `e_invoice=false`. Il bulk le conta separatamente (`skipped_non_fe`) e le esclude da `rimanenti_stima`. La UI le mostra in grigio con icona ⏭ e banner esplicativo, evitando il messaggio fuorviante "rilancia per continuare" quando restano solo non-FE.

### Verifica completezza import marzo 2026

Confronto export FIC vs DB: **66/66 fatture tutte presenti** in `fe_fatture`. Nessuna mancante, nessuna orfana. Panoramica 2025-2026: 52 fatture senza righe su 821 → 32 affitti mensili (CATTANEO+BANA, non-FE), 18 Amazon/marketplace (non-FE), 2 FE vere (OROBICA+MILESI, risolte col bulk). Unica discrepanza: bettershop srl €0.77 (totale_fattura FIC vs imponibile+IVA export, sconto marketplace).

### Come recuperare le fatture attuali senza righe
1. Fatture › Impostazioni › Fatture in Cloud.
2. Debug: inserire `fic_id` (es. `405656723`) → vedere `is_detailed=false`, `e_invoice=true`, `attachment_url=(temporary url)` + anteprima XML con righe parsate.
3. Scroll giù: "Recupero righe da XML SDI" → inserire anno `2026`, limite `50` → "Avvia recupero massivo". Le non-FE vengono skippate automaticamente, il contatore "rimanenti" le esclude.

---

## 2026-04-16 — Sessione 40 / Wave 3 — CG nav uniformato + Acquisti esclusi + Flussi parcheggia + iPad descrizione

Wave 3 chiude 4 bug: uniformità UI su CG, pulizia default Acquisti, azioni bulk workbench Flussi, leggibilità iPad.

### CG — Tab bar uniformata su tutto il modulo (S40-7)

Le 4 pagine CG (Dashboard, Confronto, Uscite, Riconciliazione) avevano layout header incoerente: Dashboard/Confronto usavano sfondo `bg-brand-cream` con padding esterno `p-6`, Uscite aveva Nav full-width ma senza il wrapper `ControlloGestioneNav`, Riconciliazione aveva `bg-neutral-50` e titolo generico. Il pattern Dipendenti/Flussi/Clienti ha invece un Nav full-width `bg-white border-b shadow-sm` + contenuto wrappato con padding interno.

**Fix**: tutte e 4 le pagine ora rispettano lo stesso pattern. Wrapper esterno senza padding (così Nav arriva full-width), card contenuto avvolta in `<div className="px-4 sm:px-6 pb-6">`. Titoli in `font-playfair text-sky-900`. `ControlloGestioneUscite` ora importa `ControlloGestioneNav current="uscite"` e rimuove il back button custom (il Nav ha il "← Home" a destra). Altezza calcolata aggiornata: `calc(100dvh - 97px)` (Nav 48px + sub-header 49px).

### Acquisti — Fornitori ignorati nascosti di default (S40-8)

Nel workbench Acquisti (`FattureElenco`) l'utente vedeva comunque fatture di fornitori marcati `escluso_acquisti = 1` in Impostazioni. Rumore inutile per il flusso quotidiano.

**Fix backend**: `GET /fatture` in `fe_import.py` fa LEFT JOIN su `fe_fornitore_categoria fc_excl` (match per P.IVA o per nome se P.IVA assente) e ritorna `COALESCE(fc_excl.escluso_acquisti, 0) AS escluso_acquisti` per ogni fattura.

**Fix frontend**: `FattureElenco.jsx` nuovo state `mostraEsclusi = false` (default). Filtro in `fattureBase`: `if (!mostraEsclusi) list = list.filter(f => !f.escluso_acquisti)`. Toggle "Mostra anche ignorati" nella sidebar sotto Stato (visibile solo se esistono fatture escluse). Quando il toggle è attivo, le fatture escluse mostrano un badge ambra "ESCLUSO" accanto al fornitore.

### Flussi — Workbench: azioni bulk Parcheggia e Flagga senza match (S40-12)

Nel cross-ref banca, Marco aveva bisogno di due azioni bulk che non esistevano: (1) **parcheggiare** movimenti incerti per analizzarli in seguito (stato persistente cross-sessione), (2) **flaggare senza match** più righe insieme per sbloccare la ricerca manuale (equivalente bulk dell'azione "Nessuno di questi → cerca manuale" che finora era solo per singolo movimento).

**Migrazione 082**: `banca_movimenti` + `parcheggiato INTEGER DEFAULT 0` + `parcheggiato_at TEXT`. Indice parziale `idx_banca_mov_parcheggiato WHERE parcheggiato = 1` per il tab dedicato.

**Backend**: `POST /banca/cross-ref/parcheggia-bulk` (body: `movimento_ids: List[int]`) setta parcheggiato=1 + timestamp. `POST /banca/cross-ref/disparcheggia/{movimento_id}` resetta.

**Frontend**: `BancaCrossRef.jsx` nuovo tab "Parcheggiati 🅿️" (oltre a Collegati / Suggerimenti / Senza match). Handler `handleBulkParcheggia` (POST), `handleBulkDismiss` (client-side: estende il Set `dismissed` esistente che forza la vista "senza match"), `handleDisparcheggia` (POST per singolo). I movimenti parcheggiati vengono esclusi da Suggerimenti e Senza match. Toolbar bulk estesa: su "senza" e "suggerimenti" bottone "🅿️ Parcheggia", su "suggerimenti" bottone "❓ Flagga senza match", su "parcheggiati" bottone "↩ Disparcheggia". Checkbox testata estesa alle 3 tab. Sulla riga parcheggiata: colonna "Parcheggiato" (timestamp) + bottone "↩ Disparcheggia" individuale.

### Flussi — iPad: descrizione tap-to-expand (S40-13)

La cella "Descrizione" nel workbench era `max-w-xs truncate` → su iPad il testo veniva tagliato e il `title` HTML non era accessibile via tap (solo hover desktop). Beneficiario/causale rimanevano nascosti.

**Fix**: nuovo state `expandedDesc: Set<movId>` + handler `toggleDesc`. Cella descrizione: `onClick={() => toggleDesc(m.id)}`, classe condizionale `truncate` → `whitespace-normal break-words` quando espansa. `cursor-pointer select-none` per chiarezza touch. Tooltip title contestuale ("Tocca per leggere tutto" / "Tocca per comprimere").

### Versioni bump

`fatture` 2.5 → 2.6 (escluso_acquisti default). `flussiCassa` 1.10 → 1.11 (parcheggia + tap-to-expand). `controlloGestione` 2.6 → 2.7 (nav uniformato). `sistema` 5.10 → 5.11 (migrazione 082 banca_movimenti).

---

## 2026-04-16 — Sessione 40 / Wave 2 — Dipendenti UX + CG filtri+somma + Flussi finestra

Wave 2 chiude 6 bug catalogati: 3 Dipendenti, 2 CG, 1 Flussi.

### Dipendenti — Disattivazione libera il colore (S40-11)

`DELETE /dipendenti/{id}` faceva soft-delete (`attivo = 0`) lasciando `colore` invariato. Risultato: il colore restava "occupato" nel picker quando provavi ad assegnarlo a un nuovo dipendente, anche se quello vecchio era inattivo.

**Fix**: `dipendenti.py` la query DELETE ora fa `UPDATE dipendenti SET attivo = 0, colore = NULL WHERE id = ?`. Il colore torna disponibile nel picker (default grigio nelle stampe foglio settimana, gestito FE da `dipendente_colore || "#d1d5db"`).

### Dipendenti — Auto-ID alla creazione (S40-12)

Marco doveva inventarsi a mano un codice tipo "DIP015" per ogni nuovo dipendente. Inutile: il codice serve solo come chiave interna, non c'e' valore aggiunto a sceglierlo manualmente.

**Fix**: `DipendenteBase.codice` ora `Optional`. POST genera automaticamente `DIPNNN` progressivo via `_genera_codice_dipendente(cur)` che scansiona i codici esistenti, trova il massimo numerico e fa +1 con padding a 3 cifre. PUT mantiene il codice esistente se vuoto. FE: campo non piu' required, placeholder dinamico "Auto (DIPNNN)" su nuovo, valore mostrato in sola lettura su esistenti.

### Dipendenti — Campo nickname per stampe turno (S40-13)

In Osteria tutti si chiamano "Pace", "Tango", "Bea", non "Giovanni Pacetti". Sul foglio settimana e WhatsApp turni serve il nome corto che lo staff usa davvero. Nome+cognome restano per buste paga / contratti.

**Migrazione 081**: `dipendenti.sqlite3` → `ALTER TABLE dipendenti ADD COLUMN nickname TEXT` (nullable, idempotente, lavora sul DB separato).

**Backend**: `nickname` aggiunto a `DipendenteBase`, INSERT/UPDATE/SELECT in `dipendenti.py`. Tutte le SELECT che ritornano turni o info dipendente includono `d.nickname AS dipendente_nickname` (4 query in `dipendenti.py` turni endpoints, 2 in `turni_router.py` POST/PUT foglio, 4 in `turni_service.py` foglio/mese/dipendente/WA). Generatore PDF foglio settimana (`turni_router.py`:669) e composer WhatsApp (`turni_service.py`:1515) usano nickname con fallback al nome.

**Frontend**: `DipendentiAnagrafica.jsx` form con campo nickname + helper text. `FoglioSettimana.jsx` `SlotCell` mostra nickname se presente (es. "Pace") altrimenti `Primo I.` (vecchio fallback). `OrePanel` lato destro idem. Dialog "Invia turni via WA" mostra `Nome Cognome (Nickname)` per riconoscimento.

### CG Uscite — Filtri default su mese corrente + tutti gli stati attivi (S40-5)

Aprendo Uscite si vedeva di default "tutto da inizio anno", troppo rumore. Marco vuole "questo mese, tutto quello che mi serve gestire".

**Fix**: `ControlloGestioneUscite.jsx` defaults: `filtroStato = {DA_PAGARE, SCADUTA, PAGATA}` (esclude solo SOSPESA), `filtroDa = primo del mese corrente`, `filtroA = ultimo del mese corrente`. Calcolati con `useState(() => ...)` per evitare ricomputi.

### CG Uscite — Somma Excel-style su selezione multipla (S40-6)

Marco selezionava 5 righe per vedere "quanto pago oggi se chiudo questi" e doveva sommare a mente.

**Fix**: nuovo `useMemo sommaSelezionati` calcola residuo (totale - pagato) sulle righe selezionate. Mostrato nella bulk action bar con separatore: `📊 Totale residuo: € 1.234,56`.

### Flussi — Finestra temporale ristretta nei suggerimenti banca (S40-15)

`_score_match` in `banca_router.py` premiava la prossimita' (≤5gg, ≤15gg) ma NON scartava mai per data, quindi suggeriva accoppiamenti pagamento↔movimento banca con 8-10 mesi di distanza, totalmente assurdi.

**Fix**: aggiunto cutoff duro a 180 giorni (return None) + penalita' progressiva: ≤30gg neutro, 30-60gg +15, 60-120gg +40, 120-180gg +80. I match plausibili (settimana/mese stesso) restano in cima, quelli sospetti vengono sommersi o eliminati.

### Versioni bump

`dipendenti` 2.24 → 2.25 (auto-ID + nickname + soft-delete colore). `controlloGestione` 2.5 → 2.6 (filtri default + somma selezione). `flussiCassa` 1.9 → 1.10 (finestra _score_match). `sistema` 5.9 → 5.10 (migrazione 081 dipendenti.sqlite3).

---

## 2026-04-16 — Sessione 40 / Wave 1 — Bugfix bloccanti Dipendenti + Tooltip iPad

Marco ha aperto la sessione con 17 bug distribuiti su 6 moduli. Wave 1 copre i 3 fix bloccanti (più 2 rimasti in indagine).

### Dipendenti — Crash al salvataggio nuovo dipendente (S40-1)

`DipendentiAnagrafica.jsx` faceva POST su `${API_BASE}/dipendenti` (senza trailing slash). Backend: `@router.post("/")` in `dipendenti.py:192`. FastAPI emetteva 307 Redirect verso `/dipendenti/`, il browser droppava l'header `Authorization` sul redirect, arrivava 401, `apiFetch` cancellava il token e mandava a `/login` → all'utente sembrava "crash + ritorno in home".

**Fix**: riga 184, `${API_BASE}/dipendenti` → `${API_BASE}/dipendenti/`. Commento esplicativo aggiunto. Bump versione file a v2.6. Pattern già documentato in CLAUDE.md, è il quinto o sesto endpoint dove lo ripetiamo.

### Dipendenti — "+ Nuovo reparto" in Impostazioni non apriva il form (S40-2)

`GestioneReparti.jsx` condizionava il form del dettaglio a `{!form.id && !form.codice ? (placeholder) : (form)}`. `handleNew()` faceva `setForm(EMPTY)` con `EMPTY.codice = ""` → la condizione restava vera → il placeholder "Seleziona un reparto o creane uno nuovo" restava visibile anche dopo il click.

**Fix**: introdotto flag esplicito `isCreating` (già usato in `DipendentiAnagrafica.jsx` — ora allineato). `handleNew` → `setIsCreating(true)`. `handleSelect` → `setIsCreating(false)`. Post-save successo → `setIsCreating(false)`. Condizione render: `!form.id && !isCreating`. Bump versione file a v1.2.

### UI — Campanello notifiche su iPad: tooltip compariva ma click non apriva il panel (S40-3)

Introdotto in sessione 39 quando ho cambiato `placement="bottom"` sul bell e sulla key dell'Header. Il `Tooltip` su touch usa un pattern double-tap (primo tap apre tooltip + blocca click, secondo tap passa). Su icone universali come 🔔 e 🔑 il tooltip è ridondante e il double-tap è una friction seria: se l'utente aspetta oltre 2,5s (auto-close) tra primo e secondo tap, `firstTouchShown` si resetta e il secondo tap viene trattato come "primo tap" → l'azione non parte mai.

**Fix**: nuova prop `disableOnTouch` sul `Tooltip` (default false). Quando true e `isTouch === true`, il componente fa passthrough dei children (ritorna i figli direttamente, niente popup, niente double-tap). Header marca 🔔 e 🔑 con `disableOnTouch`. Bump versione Tooltip a v1.2.

### Rimangono in indagine (da riprodurre con Marco nella prossima sessione)

- **S40-14 Flussi — duplicati Sogegros €597,08**: servono gli ID `banca_movimenti` delle due righe per capire se è import doppio (stessa data/causale) o due movimenti legittimi confusi.
- **S40-16 Statistiche — "Import iPratico sparito"**: ambiguità con l'iPratico **Vini** che nella sessione 39 ho spostato da voce autonoma a "embedded" dentro `ViniImpostazioni`. La tab "📥 Import iPratico" nelle Statistiche (`StatisticheNav.jsx:10`) esiste ancora, rotta montata. Marco deve chiarire quale ha perso.

### Altri 12 bug catalogati

Tutti documentati in `docs/problemi.md` con causa ipotizzata e fix previsto. Wave 2 e Wave 3 nella prossima sessione.

### Versioni bump

`dipendenti` 2.23 → 2.24 (fix #3 + #4). `sistema` 5.8 → 5.9 (fix Tooltip a livello di componente condiviso).

---

## 2026-04-14 — Sessione 39 / Navigazione — Eliminazione hub `*Menu.jsx`, ingresso diretto su Dashboard (role-aware)

Marco: _"questi menu di ogni modulo vanno eliminati"_ + _"si sono d'accordo i redirect deve sempre role-aware altrimenti aprire pagina che dice che non si hanno i privilegi per aprirla"_.

### Cosa cambia per l'utente

Cliccando un modulo (dal dropdown header o dalle card Home) non si apre piu' la pagina-hub con le 4-6 card grandi, ma si entra direttamente sulla Dashboard del modulo (o la prima sotto-sezione accessibile in base al ruolo). Le barre tab secondarie (`*Nav.jsx`) restano identiche.

### ModuleRedirect — nuovo componente role-aware

Creato `frontend/src/components/ModuleRedirect.jsx`. Riceve `module` + lista ordinata `targets` (ognuno con `path` e opzionalmente `sub` per il check permessi). Comportamento:

1. Se il ruolo non ha accesso al modulo → `<Navigate to="/" />`.
2. Altrimenti sceglie il primo `target` accessibile (via `useModuleAccess.canAccessSub`) e redirige li.
3. Se nessun target e' accessibile → mostra pagina "Nessun privilegio per aprire questo modulo col ruolo <X>".

### Default di ogni modulo (ordine fallback)

- **Vini** → `/vini/dashboard` → magazzino → carta → vendite → settings
- **Ricette (Cucina)** → `/ricette/dashboard` → archivio → ingredienti → settings
- **Vendite** → `/vendite/dashboard` → chiusure → fine-turno → impostazioni
- **Flussi Cassa** → `/flussi-cassa/dashboard` → cc → carta → contanti → impostazioni
- **Controllo Gestione** → `/controllo-gestione/dashboard` → uscite → confronto → spese-fisse
- **Statistiche** → `/statistiche/dashboard` → coperti → import
- **Prenotazioni** → `/prenotazioni/planning/{oggi}` → mappa → settimana → tavoli → impostazioni
- **Clienti** → `/clienti/dashboard` → lista → prenotazioni → preventivi → impostazioni
- **Dipendenti** → `/dipendenti/dashboard` → anagrafica → turni → buste-paga → scadenze → costi → impostazioni

### DashboardDipendenti (nuovo)

Creato `frontend/src/pages/dipendenti/DashboardDipendenti.jsx` (placeholder v1.0): headcount attivi, scadenze (scaduti + in_scadenza), buste paga mese corrente + 4 shortcut. Endpoint riusati (nessun backend nuovo). Grafici e trend arriveranno nelle prossime sessioni.

### Vini — iPratico spostato dentro Impostazioni

`ViniNav` riordinato: Dashboard → Cantina → Carta → Vendite → Impostazioni (v2.2). La tab "iPratico" e' sparita: `iPraticoSync` ora accetta prop `embedded` e viene renderizzato come sezione interna a `ViniImpostazioni` (voce "iPratico Sync"). La route legacy `/vini/ipratico` redirige a `/vini/settings`. Nota decisione: Marco aveva proposto "due voci separate Import/Export" ma il workflow iPratico e' unificato (import→verifica→export, 673 righe) — splittare significava duplicare codice, quindi **singola voce integrata**.

### DipendentiNav

Sostituita la tab "Home" (che puntava al vecchio hub) con "Dashboard" → `/dipendenti/dashboard` (v1.1).

### File eliminati (12)

`ViniMenu.jsx`, `RicetteMenu.jsx`, `CorrispettiviMenu.jsx`, `FattureMenu.jsx`, `admin/DipendentiMenu.jsx`, `AdminMenu.jsx`, `FlussiCassaMenu.jsx`, `ControlloGestioneMenu.jsx`, `StatisticheMenu.jsx`, `PrenotazioniMenu.jsx`, `dipendenti/DipendentiMenu.jsx`, `ClientiMenu.jsx`.

### File creati/modificati

- `frontend/src/components/ModuleRedirect.jsx` — NEW.
- `frontend/src/pages/dipendenti/DashboardDipendenti.jsx` — NEW.
- `frontend/src/App.jsx` — v5.0 → v5.1, rimossi import `*Menu`, route hub sostituite con `<ModuleRedirect>`.
- `frontend/src/pages/vini/ViniNav.jsx` — v2.1 → v2.2.
- `frontend/src/pages/vini/iPraticoSync.jsx` — v2.0 → v2.1 (prop `embedded`).
- `frontend/src/pages/vini/ViniImpostazioni.jsx` — v3.1 → v3.2 (sezione interna iPratico).
- `frontend/src/pages/dipendenti/DipendentiNav.jsx` — v1.0 → v1.1.
- `frontend/src/config/modulesMenu.js` — aggiunta voce "Dashboard" nel sub di `dipendenti`.
- `frontend/src/config/versions.jsx` — bump: vini 3.10→3.11, ricette 3.3→3.4, corrispettivi 4.3→4.4, fatture 2.4→2.5, flussiCassa 1.8→1.9, dipendenti 2.22→2.23, statistiche 1.0→1.1, controlloGestione 2.4→2.5, clienti 2.8→2.9, prenotazioni 2.0→2.1, sistema 5.7→5.8.

### TODO follow-up

- Dashboard Cucina (ricette) oggi e' scarna — da rivedere in una prossima sessione.
- Valutare se i link "← Home" in alto a destra delle `*Nav.jsx` siano ancora utili o da rimuovere (gia' c'e' il logo TRGB nell'header).

---

## 2026-04-14 — Sessione 39 / UI — Impostazioni uniformi al pattern Clienti + MieiTurni selettore a step

Marco: _"Quel selettore '4/8/12 settimane' e' inguardabile. Metti due scorrimenti, uno sulla settimana e uno sul mese"_ + _"Uniforma la grafica a quella di Impostazioni gestione clienti"_.

### MieiTurni — selettore periodo a step

Sostituito il `<select>` 4/8/12 settimane (giudicato brutto) con un gruppo compatto a 5 bottoni: `⏪ mese` / `◀ sett` / `Oggi` / `sett ▶` / `mese ⏩`. La durata della finestra resta 4 settimane (default); cambia solo la settimana di partenza. Handlers: `shiftSettimane(±1)` per "sett", `shiftSettimane(±4)` per "mese".

### Cinque pagine Impostazioni uniformate al pattern Clienti

Layout sidebar (w-56) + content a destra, heading uppercase, items con icona/label/desc, sfondo `bg-neutral-50`, container `max-w-7xl`, activo `bg-<color>-50 border-<color>-200`. Ogni modulo conserva la propria tinta brand:

- **ViniImpostazioni** (amber) — v3.0 → v3.1
- **CorrispettiviImport / Vendite** (indigo) — v4.0 → v4.1
- **FattureImpostazioni / Acquisti** (teal) — v2.0 → v2.1
- **RicetteSettings → Impostazioni Cucina** (orange) — v1.0 → v1.1. Rinominata da "Strumenti Ricette" → "Impostazioni Cucina" (titolo, nav tab, card menu). Sezioni collassabili sostituite da sidebar: Export JSON, Schede PDF, Import JSON, Scelta Macellaio, Tipi Servizio.
- **BancaImpostazioni / Flussi Cassa** (emerald) — v1.0 → v1.1. Tab orizzontali sostituiti da sidebar.

Rimaste gia' corrette: `DipendentiImpostazioni`, `PrenotazioniImpostazioni`.

### File modificati

- `frontend/src/pages/dipendenti/MieiTurni.jsx` — selettore 5-step al posto del `<select>`.
- `frontend/src/pages/vini/ViniImpostazioni.jsx` — sidebar stile Clienti (amber).
- `frontend/src/pages/admin/CorrispettiviImport.jsx` — sidebar stile Clienti (indigo).
- `frontend/src/pages/admin/FattureImpostazioni.jsx` — sidebar stile Clienti (teal).
- `frontend/src/pages/ricette/RicetteSettings.jsx` — sidebar + rename Impostazioni Cucina.
- `frontend/src/pages/ricette/RicetteNav.jsx` — tab "Strumenti" → "Impostazioni".
- `frontend/src/pages/ricette/RicetteMenu.jsx` — card "Strumenti" → "Impostazioni".
- `frontend/src/pages/banca/BancaImpostazioni.jsx` — sidebar stile Clienti (emerald).
- `frontend/src/config/versions.jsx` — vini, ricette, corrispettivi, fatture, flussiCassa, dipendenti bump.

---

## 2026-04-14 — Sessione 39 / Dipendenti — Oggi stile uniforme + selettore reparto dentro la griglia

Marco: _"turni, sia settimana che mese che dipendenti. c'e' il tasto 'oggi' che non ha lo sfondo sembra un po appoggiato a caso. Il tasto dei reparti incastralo nella tabella..."_

### Fix bottone "Oggi"

Il bottone "Oggi" nelle 3 viste Turni (Settimana, Mese, Dipendente) era senza sfondo/bordo → sembrava "appoggiato a caso". Uniformato con `bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50` e `min-h-[44px]` per touch target.

### Selettore reparto dentro la griglia

I tab reparti sopra la tabella sono stati rimpiazzati da un selettore dropdown compatto, incastrato vicino ai dati:

- **FoglioSettimana**: dropdown nella **cella in alto a sinistra** della tabella (rowSpan=2), fra l'header "Giorno" e "Lunedi". Prima colonna allargata 80px → 140px per ospitarlo. Fallback mobile (isNarrow): dropdown compatto sopra `VistaGiornoMobile`.
- **VistaMensile**: nuova riga thead `colSpan={7}` con label "Reparto" + dropdown, subito sopra la riga dei giorni della settimana.
- **PerDipendente**: dropdown reparto **inline a sinistra del selettore dipendente**, separati da un divisore verticale, stessa riga flex.

Bordo del dropdown e label sono colorati in base al `reparto.colore` → identita' visiva coerente col reparto attivo.

### File modificati

- `frontend/src/pages/dipendenti/FoglioSettimana.jsx` — tolta sezione "TAB REPARTI", `FoglioGrid` accetta `reparti / repartoId / onRepartoChange`, dropdown nella top-left cell.
- `frontend/src/pages/dipendenti/VistaMensile.jsx` — tolta sezione "TAB REPARTI", `GrigliaMensile` aggiunge riga thead col selettore.
- `frontend/src/pages/dipendenti/PerDipendente.jsx` — tolta sezione "TAB REPARTI", selettore reparto+dipendente su un'unica riga.
- `frontend/src/config/versions.jsx` — dipendenti `2.20 → 2.21`.

---

## 2026-04-14 — Sessione 39 / Auth — Auto-sync modules.json + iPratico in Impostazioni Vini

Marco: _"occhio che c'e' sempre il problema di git sul modules.. ragionaci su anche ieri al riavvio aveva ripristinato hardcoded dei privilegi"_ + _"non riesco a fare quella cosa della console.. possiamo evitarlo?"_ + _"mettere ipratico sync dentro impostazioni vini. Mettere l'import di clienti dentro impostazioni clienti"_.

### Auto-sync seed → runtime (niente piu' console DevTools)

La procedura della sessione precedente richiedeva un `fetch` manuale alla console DevTools dopo ogni push per forzare il re-bootstrap. Marco non riusciva ad aprire la console → serviva **auto-sync**.

Implementato hash-based sync in `modules_router.py`:
- Helper `_seed_hash()` legge SHA-256 di `modules.json` (seed).
- Helper `_read_applied_hash()` / `_write_applied_hash()` gestiscono `modules.runtime.meta.json` (meta file gitignored che memorizza l'hash applicato).
- `_load()` riscritto con 3 casi:
  1. **Seed cambiato** (hash del seed ≠ hash applicato) → ricopia seed in runtime, aggiorna meta. Succede automaticamente alla prima richiesta dopo ogni push/restart quando il seed è stato modificato.
  2. **Runtime esiste e nessun cambio seed** → legge runtime normalmente (Marco può continuare a modificare i permessi dall'UI, sopravvivono al restart finché il seed non cambia).
  3. **Nessun runtime** → bootstrap da seed o, come ultima istanza, da `DEFAULT_MODULES` hardcoded (anch'esso allineato al seed).

Verificato con smoke test Python: 6 asserzioni passate (idempotenza secondo load, riscrittura su hash mismatch, meta aggiornata).

### iPratico Sync → sidebar Impostazioni Vini

`ViniImpostazioni.jsx`: aggiunta voce `{ key: "ipratico", label: "iPratico Sync", icon: "🔄", go: "/vini/ipratico" }` nel MENU. Il rendering differenzia voci `go` (navigate con freccia `→` grigia) dalle voci sezione (setActiveSection). Approccio **link-based**: clic → naviga a `/vini/ipratico` (pagina standalone con suo ViniNav). Soluzione leggera senza refactoring di iPraticoSync.jsx (672 righe).

### Import Clienti → già embedded

Verificato: `ClientiImpostazioni.jsx` monta già `<ClientiImport embedded />` alla sezione `"import"`. Nessuna modifica necessaria — il pattern era già in place dalla sessione precedente.

### File modificati
- `app/routers/modules_router.py` — helper hash/meta, `_load()` riscritto con auto-sync.
- `.gitignore` — aggiunto `app/data/modules.runtime.meta.json`.
- `frontend/src/pages/vini/ViniImpostazioni.jsx` — MENU + rendering per voci `go`.

### Procedura post-push (nuova, senza console)
1. `./push.sh "testo"` — push.sh -m auto-detect sincronizza `modules.json`.
2. Alla **prima richiesta** dopo il restart del backend, il router rileva l'hash diverso e riscrive `modules.runtime.json` dal seed. Zero azione manuale.
3. Ctrl+Shift+R lato FE per invalidare cache `useModuleAccess`.

---

## 2026-04-14 — Sessione 39 / Auth — Matrice ruoli per modulo + endpoint reset-to-seed

Marco: _"Fai un controllo su tutti i check 'admin' cosi li verifichiamo in blocco"_, seguito dalla matrice completa ruoli→modulo per tutti e 11 i moduli. Prima applicazione: Marco aveva notato che **dopo un riavvio del backend i privilegi tornavano a valori hardcoded obsoleti** — il `DEFAULT_MODULES` nel router Python non era mai stato allineato al seed e alle modifiche fatte via UI, quindi ogni bootstrap "pulito" (runtime mancante) ripristinava uno stato obsoleto.

### Soluzione in 3 livelli (anti-regressione)

1. **Seed `app/data/modules.json`** → aggiornato con la matrice definitiva di Marco. E' il file tracciato in git che viene letto al primo bootstrap quando `modules.runtime.json` non esiste.
2. **`DEFAULT_MODULES` hardcoded** in `app/routers/modules_router.py` → allineato 1:1 col seed. E' il fallback di ultima istanza se pure il seed dovesse sparire.
3. **Endpoint `POST /settings/modules/reset-to-seed`** (admin-only) → forza la riscrittura di `modules.runtime.json` copiando il seed. Se in futuro il runtime diverge, basta una chiamata (no SSH, no cancellazione manuale di file sul VPS).

### Matrice ruoli applicata

| Modulo | Ruoli visibili sul modulo |
| --- | --- |
| Vini | admin, sommelier, sala (iPratico Sync admin-only, Impostazioni admin-only) |
| Acquisti | admin, contabile (Impostazioni admin-only) |
| Ricette/Cucina | admin, chef, sala, sommelier (matching/impostazioni admin-only, rinominato "Strumenti"→"Impostazioni") |
| Vendite | admin, sala, sommelier, contabile (chiusure/impostazioni admin-only) |
| Flussi di Cassa | admin, contabile, sala, sommelier, chef (solo per Mance) |
| Controllo di Gestione | admin, contabile |
| Statistiche | admin only |
| Dipendenti | admin, + tutti via "Turni" con filtro interno |
| Prenotazioni | admin, sala, sommelier (editor tavoli + impostazioni admin-only) |
| Clienti | admin, sala, sommelier, contabile (import spostato in Impostazioni admin-only) |
| Impostazioni globali | admin only |

### Frontend — `modulesMenu.js` riorganizzato

- **Vini**: rimosso "iPratico Sync" dal dropdown (resta la route `/vini/ipratico`, da raggiungere via Impostazioni Vini).
- **Ricette**: "Strumenti" rinominato → "Impostazioni".
- **Clienti**: rimosso "Import" dal dropdown (resta la route `/clienti/import`), aggiunto "Impostazioni".
- **Dipendenti**: aggiunti "Costi" e "Impostazioni" nel dropdown.
- Commento in testa aggiornato: il campo `check` è cosmetico/legacy, i permessi reali passano da `modules.json` via `useModuleAccess`.

### Procedura post-push per Marco

⚠️ **Superato nella entry successiva**: la procedura della console DevTools è stata sostituita dall'auto-sync hash-based. Vedi entry "Auto-sync modules.json + iPratico in Impostazioni Vini" (stessa data, sopra). L'endpoint `reset-to-seed` resta come override manuale di emergenza.

### Versioni
- Modulo `auth`: v2.0 → **v2.1**.
- Modulo `sistema`: v5.6 → **v5.7** (endpoint reset-to-seed).

---

## 2026-04-14 — Sessione 39 / Dipendenti — Cleanup titoli viste Turni

Marco: _"in vista settimanale togli il back verso dipendenti, tanto ora c'e' il menu sopra e anche Foglio Settimana con loghetto e' inutile; in vista mensile il back e' gia' tolto, togli solo Vista Mensile; cosi come in vista dipendente togli Vista Dipendente piu' loghetto"_.

Con il menu modulo "Dipendenti" (DipendentiNav) gia' presente in testa a tutte le viste, titoli + breadcrumb back erano ridondanti e rubavano spazio verticale.

### Frontend
- **`FoglioSettimana.jsx`**: rimosso link "← Dipendenti" e titolo "📅 Foglio Settimana" sopra la toolbar. `useNavigate` resta usato per i deep-link a Vista Mensile e Per Dipendente.
- **`VistaMensile.jsx`**: rimosso titolo "🗓 Vista Mensile" sopra la toolbar (il back era gia' stato rimosso). Intestazione PRINT-ONLY intatta.
- **`PerDipendente.jsx`**: rimosso titolo "👤 Vista per Dipendente" sopra la toolbar. Intestazione PRINT-ONLY intatta.

### Versioni
- Modulo Dipendenti: v2.19 → **v2.20**.

---

## 2026-04-14 — Sessione 39 / Dipendenti — Barra menu DipendentiNav + Impostazioni con sidebar

Marco: _"nella sezione dipendenti manca la barra menu (guarda gestione vini per esempio)"_ + _"Non funziona il tasto 'Crea dipendente'"_ + _"Sistema un po' la pagina c'e' moltissimo spazio a destra e zero a sinistra"_ + _"impostazioni dipendenti, metti tutto in un'unica pagina, con un sidebar menu a sinistra non spezzare su piu tile"_. Allineamento UX del modulo Dipendenti al pattern ViniNav/ClientiNav + fix bug anagrafica + riorganizzazione impostazioni.

### Frontend
- **`DipendentiNav.jsx` v1.0** (nuovo): tab navigation persistente tema viola per tutte le pagine del modulo — Home / Anagrafica / Buste Paga / Turni / Scadenze / Costi / Impostazioni. Pattern identico a ViniNav.
- **DipendentiNav integrata** in: DipendentiMenu, DipendentiAnagrafica, DipendentiBustePaga, DipendentiScadenze, DipendentiCosti, DipendentiTurni, FoglioSettimana, VistaMensile, PerDipendente, GestioneReparti, DipendentiImpostazioni. Esclusa da MieiTurni (accessibile a tutti i ruoli, non solo admin dipendenti). Nelle pagine con @media print (FoglioSettimana, VistaMensile, PerDipendente) la nav ha `print:hidden`.
- **`DipendentiAnagrafica.jsx` v2.4 → v2.5-nav-layout-fix**:
  - Fix bug "Crea dipendente" non funzionava: dopo `handleNew()` il form restava EMPTY con `id=null` e `codice=""` → la condizione placeholder `!form.id && !form.codice` restava vera e il form non si mostrava mai. Introdotto stato `isCreating` (boolean) che distingue "nessun dipendente selezionato" da "sto creando un dipendente nuovo". Il placeholder ora usa `!form.id && !isCreating`.
  - Fix layout sbilanciato (troppo vuoto a destra): da `max-w-3xl` a `max-w-5xl mx-auto`, root container a `flex flex-col` con `flex-1 min-h-0` sull'area lista+dettaglio per sfruttare tutta la larghezza. Altezza calcolata via flex invece di `calc(100dvh - 49px)`.
- **`DipendentiImpostazioni.jsx` v1.0 → v2.0-impostazioni-sidebar**: consolidato da layout a tile (Reparti / Soglie CCNL / Template WA come card separate) a layout **sidebar a sinistra + content a destra** (modello ClientiImpostazioni). Sezione "Reparti" monta `<GestioneReparti embedded />` direttamente nel pannello; le altre due sezioni (Soglie CCNL, Template WhatsApp) sono placeholder "Prossimamente". Niente piu' navigazione verso `/dipendenti/reparti`: tutto vive in `/dipendenti/impostazioni`.
- **`GestioneReparti.jsx` v1.0 → v1.1-embeddable**: aggiunta prop `embedded` (default false). In modalita' embedded rende solo il contenuto (senza `min-h-screen` ne' DipendentiNav) dentro un wrapper `flex flex-col h-full min-h-0`. Route standalone `/dipendenti/reparti` continua a funzionare con DipendentiNav in cima. Sostituito `height: calc(100dvh - 49px)` con `flex flex-1 min-h-0` per compatibilita' embed.
- **Turni — allineamento pranzo/cena nella griglia settimanale (MieiTurni + PerDipendente)**: piccola polish UX — il pranzo va sempre in alto nella cella giorno, la cena sempre in basso, anche se un giorno ha solo uno dei due servizi. Implementato separando i turni in `pranziTurni` / `ceneTurni` / `altriTurni` e rendendo due slot fissi con `SlotPlaceholder` invisibile per preservare l'altezza visiva quando un servizio manca.

### Versioni
- Modulo Dipendenti: v2.18 → **v2.19** (DipendentiNav + Impostazioni sidebar + fix anagrafica).

---

## 2026-04-14 — Sessione 39 / Clienti — Libreria Menu Template (mig 080)

Marco: _"ok il menu generato posso recuperarlo in altri preventivi?"_ → scelta Opzione **B** (libreria completa, non duplicazione inline). Nasce una libreria di menu riutilizzabili con snapshot copy: quando un template viene applicato a un menu, le righe sono COPIATE (non collegate), quindi modifiche successive al template non alterano i preventivi già emessi.

### Backend
- **Migrazione 080** (`080_menu_templates.py`): nuove tabelle su `clienti.sqlite3`
  - `clienti_menu_template(id, nome, descrizione, service_type_id, prezzo_persona, sconto, created_at, updated_at)`
  - `clienti_menu_template_righe(id, template_id FK cascade, recipe_id, sort_order, category_name, name, description, price, created_at)`
  - Indici: `idx_cmt_service_type(service_type_id, nome)`, `idx_cmtr_template(template_id, sort_order)`
  - `service_type_id` è soft-FK verso `foodcost.db.service_types` (nessun constraint cross-DB)
- **`menu_templates_service.py`**: CRUD completo (`lista_templates`, `get_template`, `crea_template`, `aggiorna_template`, `elimina_template`, `duplica_template`) + gestione righe (`aggiungi_riga_template`, `elimina_riga_template`, `riordina_righe_template`) + bridge preventivi (`salva_menu_come_template`, `applica_template_a_menu`). Helper `_get_service_types_map` legge da foodcost.db per enrichment nome service_type. `applica_template_a_menu` invoca `preventivi_service._ricalcola_menu_e_totale(conn, menu_id)` inline nella stessa connection per preservare consistenza transazionale.
- **`menu_templates_router.py`**: due APIRouter esportati
  - `router` (prefix `/menu-templates`): CRUD standard
  - `preventivi_bridge_router` (prefix `/preventivi`): endpoint `POST /preventivi/{pid}/menu/{mid}/salva-come-template` e `POST /preventivi/{pid}/menu/{mid}/carica-template`
  - Tutte le scritture richiedono `_require_admin`; letture a qualsiasi utente loggato (composer le usa)
- **`main.py`**: registra entrambi i router dopo `preventivi_router`.

### Frontend
- **`PreventivoMenuComposer.jsx` v2.1**: due nuovi pulsanti
  - "📂 Carica template" (barra superiore, amber): apre dialog con filtro service_type + search + checkbox "sostituisci righe esistenti"
  - "💾 Salva template" (area tab, emerald, disabilitato se menu vuoto): dialog con nome obbligatorio + descrizione + service_type_id
  - Snapshot puro: le righe caricate sono copie locali, non referenze al template originale
- **`ClientiMenuTemplates.jsx` v1.0** (nuova pagina): CRUD completo con layout a due colonne
  - Sinistra: filtri (service_type + search) + lista template
  - Destra: editor metadati (nome, descrizione, service_type_id, prezzo_persona, sconto) + gestione righe con picker dal ricettario, add veloce, reorder, remove
  - Azioni: Nuovo (prompt), Duplica, Elimina (con conferma)
  - Usabile sia standalone sia embedded in Impostazioni Clienti
- **`ClientiImpostazioni.jsx`**: nuova tile "🍽️ Menu Template" che monta `<ClientiMenuTemplates embedded />`

### Cosa cambia per Marco
- Prima: ogni menu di preventivo veniva ricostruito a mano o duplicato via "⎘ Duplica menu" (solo intra-preventivo).
- Ora: menu ricorrenti (Degustazione 5 portate, Aperitivo classico, Matrimonio standard…) vivono in una libreria accessibile da Impostazioni Clienti → Menu Template. Dal composer si salva un menu esistente come template in 1 click, e si carica un template esistente in 1 click (con opzione sostituisci / aggiungi).
- I preventivi già emessi NON cambiano se modifichi un template: snapshot semantics.
- Il badge "N alternative" sulla lista preventivi (mig 079) + questa libreria chiudono il cerchio dell'UX multi-menu.

### Versioni
- Modulo Clienti: v2.7 → **v2.8** (libreria menu template).

---

## 2026-04-14 — Sessione 39 / Dipendenti — Campo "Utente collegato" in anagrafica

Marco: _"aggiungi un campo in anagrafica dipendenti che mi permetta di selezionarlo; oppure inverso in utenti e ruoli"_. Conseguenza naturale della sessione "/miei-turni": il link utente ↔ dipendente finora si impostava solo via script CLI (`scripts/set_dipendente_id.py`) o modificando `users.json` a mano. Ora e' un campo visuale nell'anagrafica dipendenti.

### Backend
- **`auth_service.py`**
  - `list_users()` ora espone `display_name` + `dipendente_id` (oltre a username/role).
  - Nuova funzione `set_dipendente(username, dipendente_id)`: collega o scollega (se `None`) un utente. Forza unicita' 1:1: se il `dipendente_id` era gia' assegnato ad un altro utente, quel link viene rimosso prima di applicare il nuovo. Valida che l'utente esista e che `dipendente_id` sia un int.
- **`users_router.py`**
  - Pydantic `SetDipendenteRequest { dipendente_id: int | null }`.
  - Nuovo endpoint `PUT /auth/users/{username}/dipendente` (admin only). Body `{ "dipendente_id": int | null }` — `null` scollega.

### Frontend
- **`DipendentiAnagrafica.jsx` v2.3 → v2.4-utente-collegato**
  - Nuovo campo "Utente collegato" nel form dettaglio dipendente (sezione separata con border-top, sopra i bottoni salva/disattiva).
  - Select dropdown popolato da `GET /auth/users/` (admin-only; per non-admin la select si nasconde con nota "🔒 Solo gli amministratori possono collegare un account utente").
  - Opzioni ordinate per display_name; ogni opzione mostra `DisplayName (ruolo)` e, se l'utente e' gia' collegato ad un altro dipendente, annota `— collegato a Nome Cognome`.
  - Nota informativa sotto la select: "Collegando un account, il dipendente potra' vedere i suoi turni da /miei-turni. Se l'utente era gia' collegato ad un altro dipendente, quel collegamento verra' rimosso (1:1)".
  - `handleSave` esteso: dopo il save del dipendente, se il valore selezionato e' cambiato rispetto al caricamento, chiama `PUT /auth/users/{username}/dipendente` (prima scollega il vecchio se c'era, poi collega il nuovo). Errori nel link non rollbackano il save del dipendente ma mostrano errore in banner. Dopo il link ricarica `loadUtenti()` per aggiornare le annotazioni "collegato a X" nelle opzioni.

### Cosa cambia per Marco
- Prima: aprire SSH, modificare `users.json` su VPS, restart backend.
- Ora: Dipendenti → seleziona dipendente → scegli utente nella select → Salva. Done.
- Lo script `scripts/set_dipendente_id.py` rimane disponibile per bootstrap CLI o rimediare ad emergenze.

### Versioni
- Modulo Dipendenti: v2.17 → **v2.18** (campo "Utente collegato" in anagrafica).

---

## 2026-04-14 — Sessione 39 / Dipendenti — Pagina "I miei turni" (/miei-turni) accessibile a tutti i ruoli

Marco: _"se da un dipendente clicco sulla notifica dei turni non mi visualizza nulla"_. Root cause: la notifica "turni pubblicati" (globale, tutti i ruoli) puntava a `/dipendenti/turni?...`, rotta protetta da `ProtectedRoute module="dipendenti"`. I ruoli senza accesso al modulo (sala/viewer/chef/etc.) venivano rediretti a `/` → clic "inutile". Scelta Option **A**: vista self-service dedicata accessibile a TUTTI i ruoli autenticati.

### Backend
- **`auth_service.py`**: aggiunto campo opzionale `dipendente_id` al round-trip users.json (`_load_users`, `_save_users`). `get_current_user()` ora ritorna `{username, role, dipendente_id}`. Back-compat: utenti senza il campo funzionano come prima.
- **`turni_router.py`**: nuovo endpoint `GET /turni/miei-turni?settimana_inizio&num_settimane` che risolve `dipendente_id` dall'utente loggato (non prende parametri sull'identità). Se l'utente non ha `dipendente_id` in users.json → 404 con messaggio chiaro "il tuo utente non è collegato a un dipendente". Riusa `turni_service.build_vista_dipendente()` esistente.
- **`turni_service.py:1415`**: notifica "turni pubblicati" ora punta a `/miei-turni?settimana=YYYY-Www` invece del Foglio Settimana. Messaggio aggiornato: "Apri per vedere i tuoi turni".

### Frontend
- **`MieiTurni.jsx` v1.0** (`pages/dipendenti/MieiTurni.jsx`): nuova pagina che riusa la stessa UX di PerDipendente (CardSettimana, TotaliPeriodo, BloccoTurno) ma SENZA tab reparti e SENZA selector dipendente — fetch diretto `/turni/miei-turni`. Toolbar 2-sezioni: LEFT navigatore ◀ periodo ▶ Oggi / RIGHT select 4/8/12 settimane + 🖨️ Stampa + (solo admin) `📋 Foglio Settimana`. Deep-link da notifica: legge `?settimana=` dall'URL. Stato `notLinked` con card informativa 🔗 "Utente non collegato — chiedi all'amministratore" quando 404 specifico. Stampa `@media print` friendly come Mese/PerDipendente (`breakInside: avoid`, print-only header, toolbar/foglio button `print:hidden`).
- **`App.jsx`**: route `/miei-turni` registrata **SENZA ProtectedRoute** (solo l'auth gate top-level la protegge). Accessibile a ogni ruolo con token valido.

### Mapping utenti → dipendenti
- `users.json` aggiornato (local dev): marco→1, iryna→7, paolo→4. Ospite resta senza collegamento.
- `scripts/set_dipendente_id.py`: script CLI per applicare il mapping sul VPS (users.json è .gitignored, le modifiche locali NON vengono pushate). Uso:
  - `python3 scripts/set_dipendente_id.py` (mostra stato)
  - `python3 scripts/set_dipendente_id.py --apply` (applica default marco=1, iryna=7, paolo=4)
  - `python3 scripts/set_dipendente_id.py --set giuseppe=12` (custom)
  - Poi: `sudo systemctl restart trgb-backend`

### Versioni
- Modulo Dipendenti: v2.16 → **v2.17** (pagina "I miei turni" + fix notifica deep-link).

### Note
- Admin/superadmin vedono la stessa pagina con in più il bottone "📋 Foglio Settimana" che apre la vista editoriale completa (`/dipendenti/turni`).
- La vista è read-only: per modificare turni serve sempre il Foglio Settimana (accesso admin).

---

## 2026-04-14 — Sessione 39 / Preventivi — Menu multipli alternativi (Opzione A/B/C…)

Marco: _"un preventivo deve poter presentare al cliente più menu alternativi, non compresenti: il cliente ne sceglie uno"_. Fino a ieri un preventivo aveva **UN** menu (`menu_righe` appiattite sulla testata con denorma `menu_subtotale`, `menu_sconto`, `menu_prezzo_persona`). Ora può averne N: ciascuno con nome editabile, ordine, prezzo a persona proprio. Se N≥2 il totale del preventivo **non** viene sommato — il cliente sceglie, poi si aggiorna il preventivo.

### Migrazione 079 (`app/migrations/079_preventivi_menu_multipli.py`)
- **CREATE TABLE `clienti_preventivi_menu`**: (id, preventivo_id FK cascade, nome, sort_order, sconto, subtotale, prezzo_persona, created_at). Indice `(preventivo_id, sort_order)`.
- **ALTER `clienti_preventivi_menu_righe` ADD `menu_id INTEGER`** + indice su menu_id.
- **Backfill**: per ogni preventivo con righe esistenti (mig 075) crea un record `Menu` (sort_order=0) copiando i denorma dalla testata, poi assegna menu_id a tutte le sue righe.
- **Retro-compat**: colonne denorma `menu_*` su testata restano come *cache del menu primario* (sync automatico in service) per non rompere lista preventivi / stats.

### Backend
- **`preventivi_service.py`**: nuovi helper (`_menu_table_exists`, `_conta_menu`, `_resolve_menu_id`, `_get_or_create_primary_menu`, `_sync_testata_menu_cache`, `_ricalcola_menu_e_totale`). `_ricalcola_totale` ora implementa la regola: 0 menu → solo Extra, 1 menu → `prezzo_persona × pax + Extra`, ≥2 menu → totale 0 (nessun aggregato). Nuove funzioni CRUD menu: `lista_menu`, `crea_menu`, `aggiorna_menu`, `elimina_menu`, `duplica_menu`, `riordina_menu`. CRUD righe ora risolvono `menu_id` (fallback primario). `get_preventivo` ritorna `menu_list` con righe annidate + `n_menu`; `menu_righe` flat resta (retro-compat col primo menu). `duplica_preventivo` copia anche menu + righe snapshot. `lista_preventivi` ora include `n_menu` via subquery.
- **`preventivi_router.py`**: Pydantic `MenuCreateIn/UpdateIn/DuplicaIn`; nuovi endpoint REST sotto `/{preventivo_id}/menu` (GET/POST), `/menu/{menu_id}` (PUT/DELETE), `/menu/{menu_id}/duplica` (POST), `/menu-ordine` (PUT), `/menu/{menu_id}/righe` (GET/POST), `/menu/{menu_id}/righe-ordine` (PUT). Endpoint legacy `/menu-righe/{riga_id}` conservati. PDF endpoint passa `menus=prev.menu_list` al template.

### Template PDF (`app/templates/pdf/preventivo.html`)
- ≥2 menu → intestazione "**Menu proposti — alternative**" con blocchi "Opzione A", "Opzione B"… e prezzo a persona per ciascuno; totale finale "**da definire in base al menu scelto**".
- 1 menu → rendering classico "Menu proposto" con `prezzo_persona × coperti`.
- Fallback pre-mig 079 su `prev.menu_righe` se la migrazione non è ancora girata.

### Frontend
- **`PreventivoMenuComposer.jsx` v2.0**: composer riscritto con **tab per menu** (◀ riordino ▶, ✎ rinomina inline, ✕ elimina con conferma, ➕ aggiungi, ⎘ duplica menu). Auto-naming primo "Menu" poi "Opzione A/B/C…". Banner giallo warning quando `n_menu≥2`: "il totale del preventivo non viene sommato, il cliente sceglie". Righe/snapshot/categorie invariati, ora annidati nel menu attivo. Callback parent via `useRef` per evitare re-render loop.
- **`ClientiPreventivi.jsx`**: colonna Totale ora mostra badge ambra "**N alternative**" quando `p.n_menu ≥ 2`, altrimenti `€ totale_calcolato` come prima.

### Versioni
- Modulo Clienti: v2.6 → **v2.7** (menu multipli alternativi).

---

## 2026-04-14 — Sessione 38 / Dipendenti — Stampa Mese + Per Dipendente + dropdown dipendenti

Due richieste correlate di Marco dopo il fix toolbar:

### 1. Tasto **🖨️ Stampa** su Vista Mensile e Per Dipendente
Prima solo **FoglioSettimana** aveva condivisione (PDF server-side WeasyPrint + vista immagine). Marco ha chiesto di poter stampare anche le altre due tabelle. Non c'è ancora un endpoint PDF per Mese/PerDipendente, quindi la soluzione immediata è `window.print()` del browser con **`@media print` friendly** via Tailwind:
- **`VistaMensile.jsx` v1.2-print**: tasto `🖨️ Stampa` nel RIGHT del toolbar (slot che prima era placeholder). In stampa: toolbar nascosto, tab reparti nascosti, pannello dettaglio giorno nascosto, griglia 6×7 occupa tutta la larghezza. Intestazione `print:block` con "Vista Mensile Turni — Mese Anno · Reparto".
- **`PerDipendente.jsx` v1.2-print-dropdown**: tasto `🖨️ Stampa` accanto al select 4/8/12 settimane. In stampa: toolbar/tab reparti/selettore dipendente nascosti, bottone "Apri settimana" nascosto dentro ogni CardSettimana. Ogni settimana ha `breakInside: avoid` per non spezzarsi a metà. Intestazione `print:block` con "Timeline Dipendente — Nome Cognome · Reparto · range · N settimane".

**Mobile-aware**: `window.print()` è accettato qui perché è un flusso di **stampa classica**, non un flusso PDF (regola `feedback_mobile_aware.md` punto 5 — "Niente window.print diretto nei nuovi flussi PDF", qui non genera PDF applicativo). Quando ci sarà l'endpoint PDF backend (task futuro) si aggiungerà anche il download come da regola.

### 2. Dipendenti → dropdown con pallino colore (PerDipendente)
Marco: _"metti un menu a discesa per i dipendenti se diventano tanti coi tasti e' un problema"_. I bottoni colorati uno per dipendente occupavano 2-3 righe intere al crescere del personale (4 già erano troppi in portrait). Ora:
- `<select>` (min-width 220px, `min-h-[44px]` per touch Apple HIG) con elenco dipendenti del reparto corrente.
- **Pallino colore** 16×16 con bordo a sinistra del select mostra sempre il colore del dipendente attualmente selezionato.
- Counter "(N nel reparto)" a destra per orientarsi.
- Rimosso il blocco bottoni originale (`{dipendenti.map(d => <button.../>)}`).
- Empty state identico: "Nessun dipendente attivo in questo reparto".

### Versioni
- Modulo Dipendenti: v2.15 → **v2.16** (stampa Mese/PerDipendente + dropdown dipendenti).

---

## 2026-04-14 — Sessione 38 / Dipendenti — Toolbar iOS uniformata sulle 3 viste + Impostazioni hub + fix notifiche superadmin

Tre fix correlati segnalati da Marco dopo il primo restyling:

### 1. Toolbar iOS uniformata (FoglioSettimana + VistaMensile + PerDipendente)
Lo stile C (3-sezioni LEFT navigate / CENTER segmented / RIGHT actions) ora è identico su tutte e 3 le viste turni. Prima **VistaMensile** e **PerDipendente** avevano ancora il vecchio layout con bottoni sparsi. Ora:
- **VistaMensile** (`v1.1-ios-toolbar`): left `◀ Aprile 2026 ▶ Oggi` · center segmented con Mese attivo · right vuoto (le azioni Fase 11 sono solo sulla settimana editabile).
- **PerDipendente** (`v1.1-ios-toolbar`): left `◀ 14 apr–11 mag · 4w ▶ Oggi` · center segmented con "Per dipendente" attivo · right select 4/8/12 settimane.
- Il segmented control usa lo stesso mattone visivo (`bg-neutral-200 wrapper + pillola bianca`) ovunque, click su una voce non-attiva fa `navigate()` alla vista relativa. Touch target 44pt full / 38pt interno.

### 2. Fix notifiche Fase 11 per utenti `superadmin`
**Bug**: dopo il primo test Marco non vedeva arrivare la notifica sulla campanella. Causa: `pubblica_settimana` inviava con `dest_ruolo="admin"`, ma Marco ha ruolo `superadmin` e la query in `get_notifiche_utente` fa uguaglianza stretta (`dest_ruolo = ?`), quindi la notifica era invisibile. **Fix**: notifica globale (`dest_ruolo=None`) → visibile a tutti i ruoli (admin, superadmin, contabile, sommelier, sala, chef, viewer). I turni interessano lo staff tutto, non solo chi gestisce, quindi la scelta è anche concettualmente più corretta. Aggiornati di conseguenza confirm popup e toast di successo.

### 3. Nuova sezione **⚙️ Impostazioni** nel menu Dipendenti (assorbe Reparti)
Nel `DipendentiMenu` (`v2.3-dipendenti-hub`) la tile "🏢 Reparti" sembrava una feature di primo livello, mentre è una **configurazione**. Sostituita da "⚙️ Impostazioni" (palette neutrale) che apre il nuovo **`DipendentiImpostazioni.jsx`** (hub con tile):
- **🏢 Reparti** (attiva): porta a `GestioneReparti` esistente.
- **⚡ Soglie CCNL** (prossimamente): personalizzare 40h/48h semaforo.
- **📨 Template WhatsApp** (prossimamente): testo di default per l'invio Fase 11.
- Route `/dipendenti/reparti` mantenuta per retro-compat; nuova route `/dipendenti/impostazioni` aggiunta in `App.jsx`.

### Versioni
- Modulo Dipendenti: v2.14 → **v2.15** (toolbar uniformata + Impostazioni hub).

---

## 2026-04-14 — Sessione 38 / Turni v2 — Restyling toolbar Foglio Settimana (stile iOS)

Con l'aggiunta dei pulsanti Fase 11 (📢 Pubblica, 💬 Invia WA) la toolbar del Foglio Settimana era arrivata a **8 pulsanti su una riga**, troppo stretta su iPad portrait e con gerarchia visiva incoerente. Restyling completo in stile iOS (opzione C scelta da Marco sui 3 mockup) con layout a 3 sezioni: **left navigate / center segmented / right actions + overflow ⋯**.

### Frontend
- **`FoglioSettimana.jsx` v1.10-ios-toolbar**: toolbar rifatta a 3 sezioni.
  - **LEFT**: `◀ | chip "14–20 apr · W16" | ▶ | Oggi` — chip data ora mostra range human-readable (`formatWeekRange`) + suffisso `W##` monospace grigio al posto del solo `2026-W16`.
  - **CENTER**: segmented control a 3 posizioni (`Settimana` | `Mese` | `Per dipendente`) stile iOS, `bg-neutral-200` wrapper + pillola bianca attiva con shadow. Naviga verso `/dipendenti/turni/mese` e `/dipendenti/turni/dipendente`.
  - **RIGHT**: le 2 azioni "forti" della Fase 11 restano fuori (📢 Pubblica verde, 💬 Invia WA bianco), tutto il resto finisce in un dropdown **⋯** con sezioni Settimana (Copia, Template) e Esporta (PDF, Immagine). Click-outside e ESC chiudono il menu.
- Import `useRef` aggiunto. Nuovo state `overflowOpen` + ref `overflowRef` + `useEffect` per i listener di chiusura.
- Touch target mantenuti a **44pt** sui bottoni full + **38pt** sui segmented (38 è l'altezza interna, lo hit-target 44 è dato dal wrapper).

### Versioni
- Modulo Dipendenti: v2.13 → **v2.14**.

---

## 2026-04-14 — Sessione 36 / Preventivi — Componi menu su /nuovo (auto-save silenzioso)

Fix UX: prima il pannello **"🪄 Componi menu dal ricettario"** funzionava solo sui preventivi già salvati, perché aveva bisogno di un `preventivo_id` per snapshottare le righe. Su `/preventivi/nuovo` Marco vedeva un banner ambra "Salva prima il preventivo". Ora il composer è operativo fin dal primo tocco anche su URL `/nuovo`: alla prima azione (aggiungi piatto / piatto veloce / cambio sconto) il frontend crea in modo **silenzioso** una "bozza automatica" lato backend e continua a lavorarci sopra senza cambiare URL. Quando Marco clicca "Crea preventivo" la bozza auto viene **promossa** a bozza utente normale.

### Backend
- **`migrations/076_preventivi_bozza_auto.py`** (nuovo): `ALTER TABLE clienti_preventivi ADD COLUMN is_bozza_auto INTEGER DEFAULT 0` + `idx_cp_bozza_auto`. La migrazione apre direttamente `clienti.sqlite3` (pattern ereditato da 075).
- **`preventivi_service.crea_preventivo`**: accetta `data.is_bozza_auto`. Se flag=1 e titolo vuoto/assente → placeholder `"Preventivo in compilazione"` (permette al FE di creare la bozza prima che l'utente scriva il titolo). Colonna inclusa in INSERT solo se presente (guard per retro-compat).
- **`preventivi_service.aggiorna_preventivo`**: `"is_bozza_auto"` aggiunto a `campi_ammessi` con normalizzazione 0/1. Permette al FE di "promuovere" la bozza auto a bozza utente su save esplicito.
- **`preventivi_service.lista_preventivi`**: nuovo param `includi_bozze_auto: bool = False`. Quando `False` (default) e la colonna esiste, aggiunge `COALESCE(p.is_bozza_auto, 0) = 0` al where → le bozze auto sono invisibili in lista.
- **`preventivi_service.stats_preventivi`**: applica `AND COALESCE(is_bozza_auto, 0) = 0` a tutte le query aggregate → le bozze auto non contano nelle statistiche.
- **`preventivi_router`**: `PreventivoCreate.titolo` ora `Optional[str]`; `is_bozza_auto: Optional[int] = 0` su create + update. `GET /preventivi` espone `includi_bozze_auto: bool = False`.

### Frontend
- **`ClientiPreventivoScheda.jsx` v1.3**: nuovo `ensureSaved()` (useCallback + useRef per dedup concorrenti) che su `/nuovo` crea una POST silenziosa con `is_bozza_auto: 1` e setta `prevId/stato/numero` senza navigare. `handleSalva` usa POST per creazione esplicita o PUT con `is_bozza_auto: 0` per promuovere l'auto-bozza. Banner ambra "⏳ Bozza in compilazione" quando `isNew && prevId`.
- **`PreventivoMenuComposer.jsx` v1.1**: nuovo prop `onEnsureSaved`, helper interno `resolvePid()` che risolve il pid (delegando al parent se serve). `loadState` scomposto in `loadWithId(pid)` per evitare problemi di closure dopo la creazione. `addFromRecipe`, `addQuick`, `pushSconto` chiamano `resolvePid()` prima di ogni azione. Rimossa l'early-return con banner "salva prima" — il composer è sempre visibile.

### Versioni
- Modulo Clienti: v2.4 → **v2.5**.

---

## 2026-04-14 — Sessione 38 / Preventivi — Fix prezzo menu/persona (menu va MOLTIPLICATO per coperti, non diviso)

Bug logico nella composizione menu preventivi. Marco inserisce il prezzo **di 1 menu = 1 persona** (es. Brasato 20 €, Pasta 1 €, Antipasto 20 € → subtotale 41 € è il prezzo per 1 coperto, non per tutti). `_ricalcola_menu` divideva erroneamente `(subtotale − sconto) / n_persone` → preventivo da 41 € × 30 coperti diventava 1,33 € a persona e il totale finale era enormemente sottostimato. Giusto: `menu_prezzo_persona = (subtotale − sconto)` e il totale complessivo è `prezzo_persona × n_persone + righe extra`.

### Backend — `preventivi_service._ricalcola_menu`
- Rimossa divisione per `n_persone`. `menu_prezzo_persona = max(0, menu_subtotale - menu_sconto)`.
- `_ricalcola_totale` già moltiplica `menu_prezzo_persona × n_persone + righe extra` → ora produce il totale corretto.

### Backend — `migrations/078_preventivi_menu_prezzo_persona_fix.py` (nuova)
Backfill per preventivi esistenti: ricalcola `menu_prezzo_persona = max(0, menu_subtotale - menu_sconto)` e `totale_calcolato = menu_prezzo_persona × n_persone + somma_righe_extra` su tutti i record. Idempotente.

### Frontend — `PreventivoMenuComposer.jsx` v1.2
- Label "Subtotale menu" → "Subtotale menu (N piatti, per 1 persona)".
- Label "Totale menu" → "Prezzo menu a persona".
- Nuova riga: "Totale menu × {n_persone} coperti = €X" (il prodotto totale che finirà nel totale preventivo).
- Rimossa riga sbagliata "Prezzo a persona ({coperti} coperti)" che divideva per coperti.
- Banner ambra se `n_persone` non impostato: "Imposta N. persone per calcolare il totale del menu per tutti i coperti".

### Versioni
- Modulo Clienti: v2.5 → **v2.6**.

---

## 2026-04-14 — Sessione 38 / Turni v2 Fase 11 — Integrazione mattoni M.A (notifiche) + M.C (WhatsApp)

Chiude il ciclo del modulo Turni v2: due azioni di **pubblicazione** della settimana verso lo staff. La **Pubblica** crea una notifica (mattone M.A) per lo staff admin quando il foglio è pronto; l'**Invia WA** apre WhatsApp per ciascun dipendente con il riepilogo personale dei suoi turni della settimana (mattone M.C). I mattoni M.B (PDF brand dedicato turni multi-reparto) e M.D (email) restano sul backlog.

### Backend — `turni_service.py`
- Nuovo helper `_format_week_range_it(iso)` → "13–19/04/2026" da `YYYY-Www` per testi human-readable.
- `pubblica_settimana(reparto_id, settimana_iso)`: calcola stats (turni, dipendenti, giorni coperti) della settimana e chiama `crea_notifica(tipo="turni", dest_ruolo="admin", titolo, messaggio, link=/dipendenti/turni?reparto_id=X&settimana=Y)`. La chiamata al mattone M.A è wrappata in try/except: se il service notifiche non è disponibile la pubblicazione NON fallisce (fallback silenzioso).
- `riepilogo_settimana_per_dipendenti(reparto_id, settimana_iso)`: per ogni dipendente attivo con turni non-ANNULLATI nella settimana costruisce un payload `{dipendente_id, nome, cognome, telefono, colore, n_turni, turni[], testo_wa}`. Il **testo_wa** è pre-composto in backend con formato `"Ciao {nome}, ecco i tuoi turni {reparto} della settimana {range_human}:\n• Lun 14/04: ☀️ 12:00-15:00 + 🌙 19:00-23:00\n..."` (emoji ☀️ pranzo / 🌙 cena, suffisso "(opzionale)" se stato=OPZIONALE). Frontend non deve fare template logic.

### Backend — `turni_router.py`
- `POST /turni/pubblica` body `{reparto_id, settimana}` → notifica admin + stats.
- `GET /turni/riepilogo-dipendenti?reparto_id=X&settimana=YYYY-Www` → lista pronta per DialogInviaWA.

### Frontend — `FoglioSettimana.jsx`
- Nuovo pulsante **📢 Pubblica** (verde brand-green) nell'header: conferma nativa, spinner, toast di successo con conteggio turni+dipendenti.
- Nuovo pulsante **📤 Invia WA** (bianco border): apre `DialogInviaWA`.
- Nuovo componente **`DialogInviaWA`** (~130 righe): lista dipendenti del reparto con per ciascuno: nome+cognome, n. turni, numero telefono (se presente), badge ✓ "aperto" dopo primo click. Bottone 📤 Invia disabilitato per chi non ha telefono o non ha turni in settimana. Usa `openWhatsApp(tel, testo)` dal mattone M.C (`utils/whatsapp.js`) — il testo è quello pre-composto dal backend. Tracker `sent: Set<id>` per distinguere "Invia" da "Riapri WA" dopo primo click. Banner info: conteggio "senza telefono" + "senza turni questa settimana".
- Import: `openWhatsApp` da `utils/whatsapp`. Niente costruzione `wa.me` a mano (regola M.C).

### Versioni
- Modulo Dipendenti: v2.12 → **v2.13**.

### TODO futuri (NON in questa fase)
- Mattone **M.B PDF brand** per turni: attualmente il PDF turni usa WeasyPrint diretto (Fase 8). Migrazione al mattone comune M.B quando sarà disponibile.
- Mattone **M.D Email**: per invio riepilogo via email (alternativa a WhatsApp per chi non usa WA). Quando M.D sarà disponibile aggiungere bottone 📧 Invia Email con stessa struttura di DialogInviaWA.

---

## 2026-04-14 — Sessione 38 / Turni v2 Fase 10 — Template settimana tipo (salva/applica pattern ricorrenti)

Ultima grande fase del modulo Turni v2 prima dell'integrazione mattoni (Fase 11): la possibilità di **salvare una settimana come template** e **riapplicarla** su qualsiasi settimana futura con un click. Utile per pattern ricorrenti — "Settimana standard", "Settimana estate", "Settimana festivi" — che oggi Marco doveva copiare manualmente settimana per settimana. Raggiungibile dal nuovo pulsante **📑 Template** nell'header del Foglio Settimana.

### Migrazione — `077_turni_template_v2.py`
Le tabelle `turni_template` e `turni_template_righe` esistevano già da migrazione 071 ma con uno schema **troppo scarno** (solo `dipendente_id`, `giorno_settimana`, `turno_tipo_id`, `note`). Non permettevano di ricreare fedelmente il foglio v2, che ha anche servizio (PRANZO/CENA), slot_index, orari override e appartiene a un reparto. La 077 estende:
- `turni_template.reparto_id` → template per reparto specifico
- `turni_template_righe.{servizio, slot_index, ora_inizio, ora_fine, stato}`
- Nuovi indici `idx_turni_template_reparto`, `idx_tmpl_righe_giorno`
- Idempotente (PRAGMA table_info prima di ogni ALTER).

### Backend — `turni_service.py`
- `lista_templates(reparto_id)` → lista con `n_righe`, `n_dipendenti` per preview.
- `get_template_dettaglio(id)` → dettaglio completo con righe join su dipendenti/turni_tipi (nome+cognome+colore dipendente + nome tipo turno).
- `crea_template_da_settimana(reparto_id, settimana_iso, nome, descrizione?)` → snapshot della settimana: tutti i turni LAVORO non-ANNULLATI diventano righe con `giorno_settimana` (0=lun..6=dom) al posto della data. Valida reparto, rigetta nome vuoto.
- `rinomina_template(id, nome?, descrizione?)` → aggiorna metadata + `updated_at`.
- `elimina_template(id)` → **soft-delete** (`attivo=0`), le righe NON vengono cancellate (ripristino/audit).
- `applica_template(id, settimana_iso, sovrascrivi)` → crea turni con `origine='TEMPLATE'`, `origine_ref_id=<template_id>`. Salta giorni chiusi (dal config vendite) e dipendenti non attivi. Se la settimana destinazione ha già turni del reparto e `sovrascrivi=false` → errore; altrimenti cancella prima. Ritorna `{creati, cancellati, saltati_chiusure, saltati_inattivi}`.

### Backend — `turni_router.py`
- `GET /turni/template?reparto_id=X` — lista.
- `GET /turni/template/{id}` — dettaglio.
- `POST /turni/template` body `{reparto_id, settimana_sorgente, nome, descrizione}` — crea da settimana.
- `PUT /turni/template/{id}` body `{nome?, descrizione?}` — aggiorna.
- `DELETE /turni/template/{id}` — soft-delete.
- `POST /turni/template/{id}/applica` body `{settimana_destinazione, sovrascrivi}` — applica.

### Frontend — `FoglioSettimana.jsx`
- Nuovo pulsante **📑 Template** nell'header (accanto a `📋 Copia`).
- Nuovo componente **`DialogTemplate`** (modale unico con 3 modalità):
  1. **📋 Lista**: carica i template del reparto all'open, ogni card con nome/descrizione/`n_righe`/`n_dipendenti`/data aggiornamento. Azioni: `Applica →`, `✏️` rinomina via prompt, `🗑` soft-delete con `confirm()`. Empty state con hint "Usa ➕ Salva settimana come template per crearne uno".
  2. **➕ Salva settimana come template**: input nome (obbligatorio, max 100 char) + textarea descrizione (max 500 char). Banner ambra che spiega "snapshot della settimana X di reparto Y". Dopo save: alert con numero righe + torna alla lista + ricarica.
  3. **Applica** (sub-vista della Lista): select settimana destinazione ±4 → +12 settimane (default = settimana prossima), checkbox sovrascrivi, text hint "giorni chiusi e dipendenti non attivi saltati automaticamente". Dopo applica: alert multi-riga con tutti i conteggi.
- Dopo applica: se `settimana_destinazione === settimana corrente` → `caricaFoglio()`. Altrimenti → `setSettimana(settimana_destinazione)` (salta l'utente alla settimana appena applicata per verifica).
- Touch target 44pt su tutti i bottoni, modale scrollabile con `max-h-[90vh] overflow-auto` per iPad.

### Versioni
- Modulo Dipendenti: v2.11 → **v2.12**.

### Files toccati
- `app/migrations/077_turni_template_v2.py` (nuovo)
- `app/services/turni_service.py` (+6 funzioni CRUD template, ~250 righe)
- `app/routers/turni_router.py` (+3 Pydantic model, +5 endpoint)
- `frontend/src/pages/dipendenti/FoglioSettimana.jsx` (+bottone header, +state `dlgTemplate`, +componente `DialogTemplate` ~280 righe)
- `frontend/src/config/versions.jsx` (2.11 → 2.12)
- `docs/modulo_dipendenti_turni_v2.md` (Fase 10 ✅ COMPLETATA)

**Resta solo Fase 11**: integrazione mattoni M.A Notifiche (pubblica settimana → notifica per ogni dipendente), M.B PDF brand (quando il mattone PDF sarà pronto, rifattorizzare il template PDF attuale), M.C WhatsApp (bottone "Invia turno via WA" per dipendente).

---

## 2026-04-14 — Sessione 38 / Turni v2 Fase 7 — Warning conflitti orari (badge ⚠ + toast)

Controllo sovrapposizioni orarie sullo stesso dipendente nello stesso giorno: non blocca mai il salvataggio (come da spec), ma evidenzia visivamente i turni in conflitto e avvisa subito dopo il save. Il backend calcola gli overlap e li passa al frontend in due forme: dentro ogni turno di `build_foglio_settimana` (per il badge persistente nella griglia) e dentro la risposta di POST `/foglio/assegna` e PUT `/foglio/{id}` (per il toast post-save).

### Backend — `turni_service.py`
- Helper `_minuti_start_end(ora_inizio, ora_fine)`: parse HH:MM → `(start_min, end_min)` con gestione midnight crossing (end=00:00 → 1440; end<start → +1440).
- Helper `_overlap_minuti(a_s, a_e, b_s, b_e)`: minuti di sovrapposizione, 0 se nessuna.
- `calcola_conflitti_dipendente_giorno(turni)`: pairwise symmetric. Per ogni coppia di turni dello stesso dipendente stesso giorno con overlap>0, genera un warning per entrambi con payload completo (`other_id, overlap_min, other_ora_inizio, other_ora_fine, other_servizio, other_stato, other_turno_nome`). Ignora stato `ANNULLATO`, ma considera `OPZIONALE`.
- `calcola_conflitti_su_turni(turni)`: batch che raggruppa per `(dipendente_id, data)` e applica l'helper sopra.
- `carica_conflitti_dipendente_giorno(dipendente_id, data_iso)`: carica da DB tutti i turni del giorno e ritorna la lista arricchita per l'endpoint preventivo.
- `build_foglio_settimana`: ogni turno esce già con `has_conflict: bool`, `conflict_with_ids: int[]`, `conflicts: []` (payload completo pronto per il tooltip).

### Backend — `turni_router.py`
- `POST /foglio/assegna`: risposta include ora `warnings` (array per il turno appena creato) + `conflitti_giorno` (situazione completa del giorno). Nessun HTTP error: il turno si salva sempre.
- `PUT /foglio/{turno_id}`: stesso pattern di POST.
- Nuovo `GET /turni/conflitti?dipendente_id=X&data=YYYY-MM-DD` (JWT): controllo preventivo standalone.

### Frontend — `FoglioSettimana.jsx`
- `SlotCell` legge `turno.has_conflict`: `ring-2 ring-amber-400 ring-inset` sulla cella in conflitto + badge ⚠ circolare amber 16×16 in `absolute -top-1 -left-1` (chip `bg-amber-400 text-black text-[10px] font-bold`). Tooltip (title) multi-line con dettaglio: `"Sovrapposizione con:\n• CENA Nome 19:00-23:00 (1h 30m in comune)"`.
- Dopo `assegnaTurno`/`aggiornaTurno`, se `response.warnings.length > 0`: toast amber in alto a destra (`fixed top-4 right-4 z-[70]`, `bg-amber-50 border-2 border-amber-400`) con titolo "⚠️ Sovrapposizione oraria" + lista sovrapposizioni formattata. Auto-dismiss dopo 7s (`useEffect` + `setTimeout`) + bottone × per chiudere.

### Versioni
- Modulo Dipendenti: v2.10 → **v2.11**.

### Design — perché "warning" e non "blocco"?
Come da spec originale Fase 7: la sovrapposizione può essere **intenzionale** (es. stesso dipendente su 2 servizi contigui con 15 min di buffer, o turni spezzati). Bloccare costringe a cancellare + ricreare. Il pattern scelto — salva-sempre + evidenzia — è ergonomico: Marco vede subito se ha fatto un errore e può correggere, ma non perde il flusso.

### Files toccati
- `app/services/turni_service.py` (helpers overlap + enrichment build_foglio_settimana)
- `app/routers/turni_router.py` (warnings su POST/PUT, nuovo GET /conflitti)
- `frontend/src/pages/dipendenti/FoglioSettimana.jsx` (badge + toast)
- `frontend/src/config/versions.jsx` (2.10 → 2.11)
- `docs/modulo_dipendenti_turni_v2.md` (Fase 7 ✅ COMPLETATA)

---

## 2026-04-14 — Sessione 38 / Turni v2 Fase 6 — Vista per dipendente (timeline 4/8/12 settimane)

Terza vista del modulo Turni v2: **timeline di un singolo dipendente** su N settimane consecutive, per rispondere a colpo d'occhio alla domanda "quando lavoro il prossimo mese?". Raggiungibile dal pulsante **👤 Per dipendente** nell'header del Foglio Settimana o dalla URL diretta `/dipendenti/turni/dipendente`. Selezione tab reparto → pill dipendenti del reparto → timeline; navigator `←/Oggi/→` scorre di N settimane alla volta; select `4/8/12` settimane. Click su "✏️ Apri settimana" di una riga → salta al Foglio Settimana già sulla settimana giusta.

### Backend
- **`turni_service.build_vista_dipendente(dipendente_id, settimana_inizio, num_settimane)`**: costruisce payload con dipendente+reparto, lista `settimane[]` (7 giorni ognuna con `per_giorno[iso]` = turni+ore lorde+nette+`is_chiusura`+`is_riposo`+opzionali), totali periodo (ore lorde/nette, giorni lavorati, riposi, chiusure, opzionali), semaforo CCNL per settimana (verde ≤40h, giallo ≤48h, rosso >48h). Range `num_settimane` clampato 1..12. Chiusure calcolate in UN passaggio su tutto il range (`giorni_chiusi_nel_range`, già refactorato in Fase 5). Ore lorde/nette riusano `ore_lorde` e `calcola_ore_nette_giorno` (pause staff deducibili solo se soglia rispettata: 11:30 pranzo / 18:30 cena).
- **`turni_router.py`**: nuovo `GET /turni/dipendente?dipendente_id=X&settimana_inizio=YYYY-Www&num_settimane=4` con JWT. Default `settimana_inizio` = settimana ISO corrente.

### Frontend
- **`pages/dipendenti/PerDipendente.jsx` v1.0-vista-per-dipendente** (nuovo file ~490 righe):
  - Tab reparti + pill selezione dipendente (filtrate lato FE da `allDipendenti` attivi)
  - Navigator settimana inizio (`←/→` scorre di N settimane), `Oggi` reset, select `4/8/12 settimane`
  - Pulsanti "📅 Settimana" e "🗓 Mese" per cross-link tra le 3 viste turni
  - Header totali periodo: ore lorde, ore nette (accent brand-blue), giorni lavorati, riposi, chiusure, opzionali
  - Card settimana: intestazione con ISO + range date + badge semaforo CCNL colorato (verde/giallo/rosso) + contatori `N lav / N riposi / N chiusure`, pulsante `✏️ Apri settimana` (deep-link su Foglio)
  - Griglia 7 colonne desktop, card-stack mobile (`grid-cols-1 md:grid-cols-7`)
  - Cella giorno: data + badge "Oggi" se oggi, "🚪 Chiuso" o "Riposo" o elenco blocchi turno colorati (stessa palette dipendente), footer "Lordo: Xh · Netto: Yh"
  - `BloccoTurno`: icona ☀️/🌙 per PRANZO/CENA, prefix ★ per opzionale, line-through + opacity per annullato
  - Persistenza localStorage: `turni_last_reparto` (condiviso con altre viste), `turni_last_dipendente`, `turni_perdip_settimana`, `turni_perdip_n`
- **`pages/dipendenti/FoglioSettimana.jsx`**: aggiunto pulsante **👤 Per dipendente** nell'header (accanto a 🗓 Mese)
- **`App.jsx`**: import + route `/dipendenti/turni/dipendente` protetta dal modulo `dipendenti`

### Versioni
- Modulo Dipendenti: v2.9 → **v2.10**.

---

## 2026-04-14 — Sessione 38 / Turni v2 Fase 9 — Vista giorno mobile (<900px) con swipe + navigator

Sotto i 900px (iPad portrait, mobile) la pagina **Foglio Settimana** mostra automaticamente UN solo giorno alla volta invece dell'intera griglia 7 colonne. Si naviga con frecce ←/→, pulsante **Oggi**, oppure swipe orizzontale (threshold 60px). Quando si oltrepassa Domenica/Lunedì la settimana cambia automaticamente. Sopra i 900px nulla cambia: vista settimanale piena come prima. Touch target ≥ 48pt, niente hover-only.

### Frontend
- **`FoglioSettimana.jsx` v1.9-mobile-day**: nuovo hook `useIsNarrow(maxPx)` basato su `window.matchMedia` con listener su change. Stato `isNarrow` + `giornoIdx` (default = oggi, lun=0…dom=6). Render condizionale: `{isNarrow ? <VistaGiornoMobile/> : <FoglioGrid/>}`.
- **`VistaGiornoMobile`**: header sticky con ← / Oggi / → (min-h 48px), data completa + badge OGGI/CHIUSO. Body card pranzo+cena (`SezioneServizioMobile`) o "🚪 Osteria chiusa". Touch swipe con filtro vertical-dominant. Funzione `vai(delta)` wrappa al cambio settimana.
- **`SlotMobileRow`**: riga con indice slot, pill nome+cognome completo (più spazio orizzontale rispetto a desktop), orario, placeholder "+ assegna" se vuoto.

### Versioni
- Modulo Dipendenti: v2.8 → **v2.9**.

---

## 2026-04-14 — Sessione 36 / Preventivi v1.2 — Componi menu da Cucina con snapshot immutabile

Il preventivo evento può ora pescare piatti dal Ricettario (Gestione Cucina) invece di scriverli a mano in una textarea. Una volta aggiunto al preventivo, il piatto viene SNAPSHOTTATO (nome, prezzo, descrizione, categoria copiati): modifiche successive in Cucina non alterano i preventivi già emessi. Supporto a "Piatto veloce" al volo (non finisce nel ricettario) e sconto menu. I tipi servizio (Alla carta, Banchetto, Pranzo di lavoro, Aperitivo…) sono configurabili in Impostazioni Cucina — nessun hardcode.

### Backend
- **Migrazione `074_recipes_menu_servizi.py`** (foodcost.db): ADD `recipes.menu_name` / `menu_description` / `kind` (`dish` | `base`, popolato da `is_base`). Nuove tabelle `service_types` (con seed 4 tipi base) e `recipe_service_types` (M:N).
- **Migrazione `075_preventivi_menu_righe.py`** (clienti.sqlite3): ALTER `clienti_preventivi` (`menu_sconto`, `menu_subtotale` REAL DEFAULT 0). Nuova tabella **`clienti_preventivi_menu_righe`** (`preventivo_id` FK CASCADE, `recipe_id` nullable, `sort_order`, `category_name`, `name`, `description`, `price`, `created_at`) + indice `(preventivo_id, sort_order)`.
- **`foodcost_recipes_router.py`**: campi `menu_name` / `menu_description` / `kind` / `service_type_ids[]` in create/update; `list_ricette` con filtri `kind` / `service_type_id` / `search` + preload junction in una query; nuovi endpoint `POST /foodcost/ricette/quick`, `PUT /foodcost/ricette/{id}/servizi`, CRUD `GET/POST/PUT/DELETE /foodcost/service-types`. Retro-compat via `PRAGMA table_info`.
- **`preventivi_service.py`**: helper `_ricalcola_menu` (subtotale = Σprice righe snapshot, prezzo/persona = (subtotale − sconto) / pax, poi delega a `_ricalcola_totale` per il grand total). Helper `_snapshot_recipe` (cross-DB: legge da foodcost, scrive in clienti). `lista_menu_righe`, `aggiungi_menu_riga` (supporta recipe_id snapshot o payload manuale, override campi), `aggiorna_menu_riga`, `elimina_menu_riga`, `riordina_menu_righe`, `set_menu_sconto`. `get_preventivo` ora ritorna anche `menu_righe[]`.
- **`preventivi_router.py`**: 6 nuovi endpoint autenticati admin sotto `/preventivi/{id}/menu-righe` (GET lista, POST add, PUT riordina via `ordered_ids[]`, PUT/DELETE per singola riga) + `PUT /preventivi/{id}/menu-sconto`.

### Frontend
- **Nuovo componente `PreventivoMenuComposer.jsx`** (Gestione Clienti → Preventivi → Scheda).
  - Header "🪄 Componi menu dal ricettario" + disclaimer sulla natura snapshot.
  - Picker "🔎 Aggiungi dal ricettario": filtro dropdown tipo servizio (caricato da `/foodcost/service-types`), ricerca testuale debounced (250ms), lista piatti con nome+descrizione+categoria+prezzo, click per snapshot (min 44pt touch target).
  - Dialog "⚡ Piatto veloce": nome / categoria / prezzo / descrizione, aggiunge una riga senza recipe_id (badge "⚡ veloce" nella lista).
  - Righe raggruppate per `category_name`, frecce ▲▼ per riordino (call `ordered_ids`), ✕ per rimuovere, prezzo cliccabile per edit inline (Enter salva, Esc annulla).
  - Riepilogo: subtotale, input sconto con debounce 400ms (PUT al backend), totale menu, prezzo a persona (con warning se `n_persone` non settato).
- **`RicetteNuova.jsx` / `RicetteModifica.jsx`**: nuova sezione "Menu & servizi" visibile solo se `!is_base` con input `menu_name`, textarea `menu_description`, chip selector multi-select `service_type_ids`. Payload include `kind` derivato da `is_base`.
- **`RicetteSettings.jsx`**: nuova `Section` "🍽️ Tipi servizio (menu preventivi)" con tabella (name / sort_order / active), edit inline, disable/enable (soft delete), form "Aggiungi tipo servizio".
- **`ClientiPreventivoScheda.jsx` v1.2**: integrato `PreventivoMenuComposer` sopra la sezione "Menu proposto (testo libero)" (visibile solo su preventivo esistente, richiede `prevId`). Il campo testata `menu_prezzo_persona` diventa **🔒 auto** (disabled, sfondo grigio) quando esistono righe snapshot; il payload di `handleSalva` esclude `menu_prezzo_persona` quando `menuSnapshot.n_righe > 0` per non sovrascrivere il valore calcolato dal backend. Nuovo stato `menuSnapshot` sincronizzato da callback `onTotaleMenuChange` e da `refreshMenuCount` via `/menu-righe`.
- **`versions.jsx`**: `ricette` 3.1 → **3.2**, `clienti` 2.3 → **2.4**.

### Regole & decisioni architetturali
- **Nessun hardcode**: tipi servizio vivono in DB e sono modificabili da Impostazioni Cucina. Regola salvata in memoria (`feedback_no_hardcoded_config.md`).
- **Snapshot immutabile**: `clienti_preventivi_menu_righe.recipe_id` è nullable (SET NULL non richiesto perché conserviamo comunque name/price locali). Un preventivo firmato non cambia più se il cuoco rinomina il piatto.
- **Prezzo cliente unico**: totale menu = subtotale − sconto. Nessun "prezzo barrato": lo sconto è esposto solo al ristorante (non al cliente finale, a discrezione del PDF).
- **Path order FastAPI rispettato**: tutti i path `/{preventivo_id}/menu-righe/...` sono parametrici, posizionati nel blocco param dopo i fissi (`/stats`, `/config/luoghi`, `/template/*`).

### Dove proseguire
- **PDF preventivo**: il template brand dovrà leggere `menu_righe[]` e mostrarle raggruppate per categoria (oggi usa solo `menu_descrizione` testuale). Marco deciderà se mostrare lo sconto esplicito o solo il totale finale.
- **Quick edit descrizione/categoria riga**: per ora editabile solo il prezzo inline, nome/descrizione richiedono API (c'è `PUT` già pronto) ma UI non espone il campo.

---

## 2026-04-14 — Sessione 38 / Turni v2 Fase 5 — Vista mensile a griglia 6×7 con dettaglio giorno

Seconda consegna della sessione 38 (dopo Fase 8 PDF). Vista mensile "Google Calendar-like": sola lettura, per avere il colpo d'occhio su tutto il mese con un click. L'editing resta nella vista settimana — la vista mese è deep-link verso la settimana corretta.

### Backend
- **`app/services/turni_service.py`**:
  - Nuova `build_vista_mese(reparto_id, anno, mese)` → struttura 42 giorni (6×7) partendo dal lunedì della settimana contenente il 1° del mese.
  - Refactor chiusure: estratta helper condivisa `giorni_chiusi_nel_range(date_list)` che generalizza `giorni_chiusi_nella_settimana` (ora semplice wrapper). Stessa logica (giorno_chiusura_settimanale + giorni_chiusi espliciti da closures_config), applicata a range arbitrari.
  - Payload include `settimane_iso[6]` per facilitare deep-link dal FE.
- **`app/routers/turni_router.py`**: nuovo endpoint **`GET /turni/mese?reparto_id=X&anno=YYYY&mese=MM`** (JWT, default mese corrente).

### Frontend
- **Nuova pagina `VistaMensile.jsx`** (v1.0) + route **`/dipendenti/turni/mese`** (`App.jsx`).
  - Header: selettore mese (← MMM YYYY →), Oggi, "📅 Settimana" per tornare a FoglioSettimana, tab reparti.
  - Griglia 6×7: intestazioni Lun..Dom (sabato+domenica `brand-red`), celle altezza 110px.
  - Cella giorno: numero giorno, badge compatti (22×18px) con iniziali dipendente + colore univoco (contrasto auto `textOn`), raggruppati per servizio (☀ pranzo / 🌙 cena), max 6 badge per riga con indicatore "+N".
  - Stati visivi: fuori-mese → opacity 0.4, oggi → `ring-2 ring-brand-blue/60`, selezionato → ring pieno, chiuso → sfondo grigio + "CHIUSO". OPZIONALE → ★ giallo overlay; ANNULLATO → opacity 0.4.
  - Click cella → pannello destro con dettaglio: sezione Pranzo / Cena, righe dipendente+colore+orari+stato+note, badge "📞 a chiamata".
  - Bottone "✏️ Apri settimana per modificare" → memorizza `turni_last_settimana` + `turni_last_reparto` in localStorage, naviga a `/dipendenti/turni`.
  - Persistenza mese scelto (`turni_mese_anno` / `turni_mese_mese` in localStorage).
- **`FoglioSettimana.jsx` v1.7→v1.8-vista-mensile**:
  - Bottone "🗓 Mese" nell'header → naviga a VistaMensile.
  - Init legge `turni_last_settimana` (regex `^\d{4}-W\d{2}$`, one-shot → rimosso dopo uso) e `turni_last_reparto` (condiviso) da localStorage per deep-link dalla vista mese.
  - Persistenza reparto scelto allineata (`turni_last_reparto` su ogni cambio).
- **`versions.jsx`**: Dipendenti 2.7 → 2.8.

### Commit
`./push.sh "turni v2 fase 5: vista mensile 6x7 con dettaglio giorno + deep-link settimana"`

---

## 2026-04-14 — Sessione 38 / Turni v2 Fase 8 — PDF server-side + vista immagine per WhatsApp staff

Marco vuole condividere la settimana con i ragazzi ma senza passare dal dialog stampante (che gli cambia la config della stampante di casa). Soluzione: PDF server-side via WeasyPrint + vista immagine per screenshot. **Zero window.print()** → regola CLAUDE.md rispettata.

### Backend
- **`app/routers/turni_router.py`**: nuovo endpoint **`GET /turni/foglio/pdf?reparto_id=X&settimana=Y`** (JWT).
  - Riusa `build_foglio_settimana` + `giorni_chiusi_nella_settimana` dal service (stessi dati del FE).
  - Template HTML inline (CSS `@page A4 landscape`, 10mm margini) + WeasyPrint → `StreamingResponse(application/pdf, inline)`.
  - Celle colorate per dipendente con contrasto auto (`_text_on`), stato OPZIONALE → prefix ★, ANNULLATO → opacity .4.
  - Header brand: 🍷 Osteria Tre Gobbi — Turni settimana DD/MM–DD/MM/AAAA — pill colorata reparto.
  - Helper interni: `_text_on`, `_format_week_range`, `_nome_giorno`.
  - Filename: `turni_<codice_reparto>_<settimana>.pdf`.
  - Nessuna nuova dipendenza (WeasyPrint + Jinja2 già in `requirements.txt`).

### Frontend
- **`FoglioSettimana.jsx` v1.5→v1.7-pdf-server**:
  - Pulsante **📄 PDF**: `scaricaPdf()` fa fetch dell'endpoint PDF, blob → `URL.createObjectURL` → `window.open(url, "_blank")` (fallback download se popup bloccato). Stato `loadingPdf` per feedback ⏳.
  - Pulsante **📷 Immagine**: overlay fullscreen `<VistaImmagine>` con titolo Playfair Display, pill colorata reparto, matrice completa, legenda. Toolbar sticky con "📄 PDF" e "✕ Chiudi". Blocca scroll body.
  - Rimossi tutti i `@media print`, classi `no-print`, intestazioni stampa inline (non più necessari — il PDF è server-side).
  - Nuovo helper `formatWeekRange(iso)` (solo per Vista Immagine).
- **`versions.jsx`**: Dipendenti 2.6 → 2.7.

### Commit
`./push.sh "turni v2 fase 8: pdf server-side (weasyprint) + vista immagine per condivisione staff"`

---

## 2026-04-14 — Sessione 37b / Anagrafica Dipendenti — flag `trasmissione_telematica`

Micro-evoluzione dopo rollback di PrestO Blocco 1.

### Backend
- **`dipendenti_db.py`**: aggiunta colonna `trasmissione_telematica INTEGER DEFAULT 0` nel safe-ALTER loop (idempotente).
- **`dipendenti.py` router**: `DipendenteBase` + campo `trasmissione_telematica: bool = False`; SELECT/INSERT/UPDATE allineati con serializzazione bool in response.

### Frontend
- **`DipendentiAnagrafica.jsx` v2.2→v2.3**: checkbox `📡 Trasmissione dati telematici` accanto a `📞 A chiamata`.
- **`versions.jsx`**: Dipendenti 2.5 → 2.6.

---

## 2026-04-14 — Sessione 36 / Turni v2 Fase 5 — refactor OPZIONALE + flag `a_chiamata` + pausa condizionale + UX refinements

Sessione di correzione concettuale + raffinamento UX sul Foglio Settimana (v1.2 → v1.5).

### Correzione concettuale CHIAMATA → OPZIONALE
Il vecchio "stato=CHIAMATA" sul turno era un uso improprio del termine: il concetto corretto è **OPZIONALE** (turno non confermato, zero ore, da confermare all'ultimo). "A chiamata" invece è una proprietà del **dipendente** (pagato a ore, senza 40h fisse).

### Backend
- Nuova migrazione **073 `turni_v2_opzionale_a_chiamata.py`**: ALTER `dipendenti` + `a_chiamata INTEGER DEFAULT 0`, UPDATE `turni_calendario SET stato='OPZIONALE' WHERE stato='CHIAMATA'`. Idempotente.
- **`turni_service.py`**: stato turno CHIAMATA → OPZIONALE ovunque (SELECT, calcolo ore, copia settimana). Aggiunte soglie `SOGLIA_PAUSA_PRANZO="11:30"` e `SOGLIA_PAUSA_CENA="18:30"`: pausa staff dedotta solo per chi entra **prima** della soglia (chi entra 12/19 arriva "già mangiato"). Propagato `a_chiamata` nei dati dipendenti.
- **`turni_router.py`**: stato validato su `("CONFERMATO", "OPZIONALE", "ANNULLATO")`.
- **`dipendenti.py` router**: `DipendenteBase` + campo `a_chiamata: bool = False`. SELECT/INSERT/UPDATE allineati con serializzazione bool in response.
- **`dipendenti_db.py`**: colonna `a_chiamata INTEGER DEFAULT 0` nel safe-ALTER loop.

### Frontend
- **`FoglioSettimana.jsx` v1.2→v1.5**:
  - v1.2: slot con colgroup + `SLOT_W=92px` (niente spazio vuoto oltre il nome pill, ma font leggibile).
  - v1.3: label pill `Nome C.` — primo nome + iniziale cognome, per dipendenti multi-nome prende solo il primo (Mirla Stefane → `Mirla S.`).
  - v1.4: dialog "Copia settimana" con selettore (dropdown ±8 settimane + navigazione ←/→), default from=corrente, to=successiva, submit disabilitato se from==to.
  - v1.5: popover stato rinominato CHIAMATA → OPZIONALE; ★ con title esplicativo; badge `📞` nel pannello ore per dipendenti `a_chiamata`; nota in legenda sulla regola pausa condizionale.
- **`DipendentiAnagrafica.jsx` v2.1→v2.2**: checkbox `📞 A chiamata (pagata a ore, senza contratto fisso)` nel form dati, badge 📞 nella sidebar lista per dipendenti a chiamata.
- **`versions.jsx`**: Dipendenti 2.4 → 2.5.

---

## 2026-04-14 — Sessione 36 / Turni v2 Fase 4 — CRUD reparti UI + colore dipendente

Completata la configurazione lato utente del modulo Turni v2. Marco puo' ora gestire reparti e colori direttamente da UI senza toccare il DB.

### Frontend
- Nuovo **`frontend/src/pages/dipendenti/GestioneReparti.jsx`**: pagina CRUD reparti stile Anagrafica (sidebar lista + form dettaglio). Form con codice/nome/ordine, icona (input + palette 8 emoji suggerite), colore (input + HEX + palette 12 colori), orari pranzo/cena (bg amber/indigo), pause staff minuti, attivo/disattivo. Validazione backend su codice univoco e blocco disattivazione se dipendenti attivi associati. Touch target 40pt.
- **`DipendentiAnagrafica.jsx` v2.1**: nuovi campi `reparto_id` (select con icona+nome da `/reparti/`) e `colore` (input color + HEX + palette 20 colori suggeriti). Warning in-line se colore gia' usato da altro dipendente. Sidebar lista ora mostra pallino colore + badge reparto.
- **`DipendentiMenu.jsx` v2.2**: sostituita la tile placeholder "Contratti" con tile attiva "Reparti" (colore teal) che apre `/dipendenti/reparti`.
- **`App.jsx`**: nuova route `/dipendenti/reparti` → `GestioneReparti` protetta dal modulo `dipendenti`.
- **`versions.jsx`**: Dipendenti 2.3 → 2.4.

### Backend
Nessuna modifica: router `/reparti/` gia' pronto da Fase 0 (sessione 36), schema `dipendenti.reparto_id/colore` gia' migrato in 070.

---

## 2026-04-14 — Sessione 36 / Turni v2 Fase 1+2 — foglio settimana live + ore nette + copia settimana

UI operativa del modulo Turni v2. Sostituisce la vecchia vista calendario con un Foglio Settimana che replica l'Excel di Marco. Copertura: assegnazione slot con popover, asterisco CHIAMATA, chiusure giorno da modulo Vendite, pannello ore lorde/nette con pause staff dedotte, navigazione settimana, copia settimana.

### Backend
- Nuova migrazione **072 `turni_v2_slot_index.py`**: ALTER `turni_calendario` + `slot_index INTEGER` per persistere la colonna nel foglio settimana (idempotente, lavora su dipendenti.sqlite3). Indice `idx_turni_cal_data_servizio_slot`.
- Nuovo **`app/services/turni_service.py`**:
  - `build_foglio_settimana(reparto_id, iso)` — matrice giorni×turni, dipendenti del reparto, max_slot.
  - `calcola_ore_nette_giorno(turni, pausa_p, pausa_c)` — sottrae pause staff dal lordo, ignora CHIAMATA/ANNULLATO.
  - `ore_nette_settimana_per_reparto()` — aggrega per dipendente con semaforo (<=40 verde, <=48 giallo, >48 rosso).
  - `copia_settimana(reparto_id, from, to, sovrascrivi)` — copia turni con origine='COPIA', salta giorni chiusi destinazione.
  - `giorni_chiusi_nella_settimana(iso)` — integrazione con `closures_config_router.get_closures_config()` (modulo Vendite, non duplica).
- Nuovo **`app/routers/turni_router.py`** (prefix `/turni`, JWT):
  - `GET  /turni/foglio?reparto_id&settimana` — matrice + chiusure
  - `POST /turni/foglio/assegna` — assegna slot (crea turno_tipo default se serve)
  - `PUT  /turni/foglio/{id}` — modifica turno
  - `DELETE /turni/foglio/{id}` — rimuove turno
  - `GET  /turni/ore-nette?reparto_id&settimana` — pannello laterale
  - `POST /turni/copia-settimana` — copia settimana → settimana
  - `GET  /turni/chiusure?settimana` — lettura chiusure
- `main.py`: registrato `turni_router`.
- `app/models/dipendenti_db.py`: aggiunta colonna `slot_index` per DB nuovi.

### Frontend
- Nuovo **`frontend/src/pages/dipendenti/FoglioSettimana.jsx`** (530 righe):
  - Tab reparto SALA/CUCINA con colore brand + icona dal reparto.
  - Matrice 7 giorni × (P1..Pn + C1..Cn), slot dinamici (default 4+4, espandibili).
  - Cella vuota = placeholder `+`, click apre popover.
  - Pillola colorata con `dipendente.colore`, contrasto automatico testo bianco/nero.
  - Asterisco ★ giallo su stato CHIAMATA, opacità 0.4 su ANNULLATO.
  - Riga grigia su giorno chiuso (letto da backend), disabilita click.
  - Pannello laterale `OrePanel`: lista dipendenti ordinata per ore_nette, semaforo pallino colorato, totali settimana, nota pause staff "30+30 min".
  - Popover `PopoverAssegna`: select dipendente, orari time-picker, radio stato (Confermato/Chiamata/Annullato), note, tasto Rimuovi.
  - Dialog `DialogCopia`: input ISO week from/to, checkbox sovrascrivi.
  - Navigazione ←/→ settimana + "Oggi", display `YYYY-Www`.
  - Touch target 44pt ovunque, responsive `grid-cols-[1fr_340px]` su lg+.
- `App.jsx`: rotta `/dipendenti/turni` ora punta a `FoglioSettimana`, vecchia vista su `/dipendenti/turni-legacy`.
- `DipendentiMenu.jsx`: sottotitolo tile Turni aggiornato.
- `versions.jsx`: dipendenti 2.2 → 2.3.

### Convenzioni nuove
- **Slot index** = intero 0-based in `turni_calendario.slot_index`: persiste la posizione della pillola nella griglia. Un turno senza slot_index è "libero" (legacy).
- **Stato CHIAMATA** va in `turni_calendario.stato` (TEXT libero, no ALTER). Non pesa nel calcolo ore, asterisco in UI.
- **Auto-creazione `turni_tipi`**: se manca il tipo per `<REPARTO>-<SERVIZIO>`, l'endpoint assegna lo crea al volo (categoria=LAVORO).
- **Chiusure**: mai duplicare, sempre lettura da `get_closures_config()`.

### File creati
- `app/migrations/072_turni_v2_slot_index.py`
- `app/services/turni_service.py`
- `app/routers/turni_router.py`
- `frontend/src/pages/dipendenti/FoglioSettimana.jsx`

### File modificati
- `app/models/dipendenti_db.py`
- `main.py`
- `frontend/src/App.jsx`
- `frontend/src/pages/dipendenti/DipendentiMenu.jsx`
- `frontend/src/config/versions.jsx`

---

## 2026-04-14 — Sessione 36 / Turni v2 Fase 0 — schema DB + reparti + mockup foglio settimana

Riprogettazione del modulo Dipendenti-Turni per replicare il workflow Excel reale di Marco (due fogli SALA/CUCINA, matrice giorno×slot con pillole colorate, asterisco=chiamata). **Fase 0 = solo schema DB + backend base + mockup**. La UI `FoglioSettimana.jsx` arriva in Fase 1.

### Backend — Migrazione 071
- Nuovo `app/migrations/071_turni_v2_schema.py` (opera su `dipendenti.sqlite3`):
  - **`reparti`** (nuova tabella): `codice` UNIQUE (SALA, CUCINA…), `nome`, `icona` (emoji), `colore` (HEX), `ordine`, `attivo`, orari standard pranzo/cena (default SALA 10:30-15:30/18:00-24:00, CUCINA 09:30-15:30/17:30-23:00), `pausa_pranzo_min`/`pausa_cena_min` (default 30+30 minuti da scalare dal calcolo ore nette).
  - **`dipendenti`**: +`reparto_id` (FK), +`colore` (HEX personale univoco). Backfill da `ruolo` via keyword matching (cuoc*/chef/pizz → CUCINA, sala/cameri → SALA). Palette PALETTE_DIPENDENTI = 14 colori distinti assegnati in ordine.
  - **`turni_tipi`**: +`categoria` (LAVORO/ASSENZA), +`ore_lavoro` (decimali da ora_inizio/ora_fine), +`icona` (emoji), +`servizio` (PRANZO/CENA/DOPPIO backfill euristico su nome+ora).
  - **`turni_calendario`**: +`ore_effettive` (nette staff break), +`origine` (MANUALE/TEMPLATE/COPIA), +`origine_ref_id`.
  - **Indici**: `idx_turni_cal_dip_data`, `idx_turni_cal_data_servizio` per query foglio settimana.
  - **Tabelle template**: `turni_template`, `turni_template_righe` (preparatorie per Fase 3 "copia settimana").
  - Seed SALA+CUCINA con colori brand (rosso/blu), nessun seed di turni RIPOSO/FERIE/MALATTIA (gestione assenze va nel modulo Presenze).
  - Migrazione idempotente (try/except su ogni ALTER), testata su copia del DB produzione.

### Backend — Modelli e Router
- `app/models/dipendenti_db.py` sincronizzato con migrazione 071: CREATE TABLE `reparti` con seed, nuove colonne in `dipendenti`/`turni_tipi`, tabelle template.
- Nuovo `app/routers/reparti.py`: CRUD completo `/reparti/` con JWT + soft-delete con guard "dipendenti attivi associati" (blocca disattivazione reparto se legato a staff).
- `app/routers/dipendenti.py`:
  - `DipendenteBase` esteso con `reparto_id` + `colore` (Optional).
  - `TurnoTipoBase` esteso con `categoria`, `servizio`, `ore_lavoro`, `icona`.
  - Tutte le query SELECT/INSERT/UPDATE aggiornate per i nuovi campi.
- `main.py`: registrato `reparti_router`.

### Docs e mockup
- `docs/modulo_dipendenti_turni_v2.md` riscritto: decisioni finalizzate (reparti first-class, slot 2-6 variabili, asterisco=CHIAMATA, colori univoci, chiusura settimanale letta da Vendite via `/settings/closures-config`, pause staff configurabili per reparto).
- `docs/mockups/turni_v2_foglio_settimana.html` (nuovo): mockup interattivo con tab SALA/CUCINA, matrice 7×(P1..P4+C1..C4), pillole colorate dipendente, asterisco giallo per chiamate, riga grigia per chiusura settimanale, pannello laterale ore lorde→nette con semaforo 40/48.

### Integrazione cross-modulo
- Chiusura settimanale **non duplicata**: il foglio settimana leggerà `get_closures_config()` da `closures_config_router` (modulo Vendite).

### File creati
- `app/migrations/071_turni_v2_schema.py`
- `app/routers/reparti.py`
- `docs/mockups/turni_v2_foglio_settimana.html`

### File modificati
- `app/models/dipendenti_db.py`
- `app/routers/dipendenti.py`
- `main.py`
- `docs/modulo_dipendenti_turni_v2.md`
- `docs/sessione.md`

### Non breaking
- Tutti i campi aggiunti sono nullable o con DEFAULT. Dipendenti esistenti restano validi (`reparto_id=NULL` per 2 casi ambigui da mappare a mano). Turni esistenti restano validi (`servizio` backfillato con best-effort).

---

## 2026-04-14 — Sessione 35 / Preventivi v1.1 — cliente inline, luoghi configurabili, menu ristorante

Revisione post-feedback Marco (sessione 34): il preventivo era "troppo generico", adattato da preventivo commerciale ma non dal workflow di un ristorante. Tre cambi strutturali senza breaking:

### Frontend
- `ClientiPreventivoScheda.jsx` (v1.1): toggle **"🔍 Esistente / ＋ Nuovo"** nel blocco Cliente. In modalità "Nuovo" mostra form 2×2 (nome/cognome/telefono/email) con sfondo indaco. Al save invia `nuovo_cliente` al backend che crea il cliente con `origine='preventivo'` e lo lega al preventivo.
- Luogo evento: non più hardcoded. `<select>` popolato da `GET /preventivi/config/luoghi`, fallback locale `["Sala","Giardino","Dehor"]`. I valori legacy (es. "terrazza", "esterno") restano selezionabili con label "(non configurato)" per retro-compatibilità.
- Nuova sezione **"🍽 Menu proposto"**: `menu_nome` (es. "Menu Degustazione 5 portate") + `menu_prezzo_persona` (a testa) + `menu_descrizione` (textarea 10 righe con placeholder Bergamasca: Casoncelli, Polenta taragna, Bresaola…). Sottotitolo live "N coperti × €X = €Y".
- Vecchia sezione "Voci preventivo" rinominata **"➕ Extra"** con copy chiara: "Voci aggiuntive libere: noleggio attrezzatura, tovagliato, supplementi, sconti…".
- Totale: `menu_prezzo_persona × n_persone + righe_extra`, le due metà mostrate separate prima del totale.
- `ClientiImpostazioni.jsx`: nuova sezione **"📍 Luoghi Preventivi"** con CRUD (aggiungi/rimuovi/rinomina/riordina ▲▼) + reset default + save admin-only.

### Backend
- Migrazione **070 `preventivi_menu_luoghi.py`**: ALTER TABLE `clienti_preventivi` → `menu_nome TEXT`, `menu_prezzo_persona REAL DEFAULT 0`, `menu_descrizione TEXT`. Seed in `clienti_impostazioni.preventivi_luoghi` con JSON `["Sala","Giardino","Dehor"]`.
- `clienti_db.py`: CREATE TABLE aggiornato per DB vergini + blocco try/except ALTER per DB già popolati.
- `preventivi_service.py`:
  - `_crea_cliente_inline(conn, nuovo)` helper: crea cliente minimal con `origine='preventivo'`.
  - `_ricalcola_totale()` riscritto: somma `menu_prezzo_persona × n_persone + Σ righe`.
  - `crea_preventivo(data, righe, username, nuovo_cliente=None)` — se `nuovo_cliente` è passato, lo crea e usa il suo id.
  - `aggiorna_preventivo` idem + supporto menu fields in `campi_ammessi`.
  - `duplica_preventivo` copia anche campi menu.
  - `get_luoghi()` / `set_luoghi(list)` — lettura/scrittura `clienti_impostazioni.preventivi_luoghi` con normalizzazione + dedup + upsert via `ON CONFLICT`.
- `preventivi_router.py`:
  - Nuovi pydantic: `NuovoClienteIn`, `LuoghiIn`.
  - `PreventivoCreate`/`PreventivoUpdate` estesi con `nuovo_cliente`, `menu_nome`, `menu_prezzo_persona`, `menu_descrizione`. Default `luogo` ora "Sala".
  - Nuovi endpoint (PRIMA di `/{preventivo_id}` per evitare collisione path param):
    - `GET /preventivi/config/luoghi` (auth)
    - `PUT /preventivi/config/luoghi` (admin)
  - Handler `crea`/`aggiorna` estraggono `nuovo_cliente` dal body e lo inoltrano al service.

### Versioning
- Frontend `versions.jsx`: clienti 2.2 → 2.3.

### Non breaking
- Preventivi esistenti (pre-070) restano validi: campi menu sono nullable, luogo legacy preservato nel select, righe extra restano nella stessa tabella `clienti_preventivi_righe` senza cambi schema.

### File creati
- `app/migrations/070_preventivi_menu_luoghi.py`

### File modificati
- `app/models/clienti_db.py`
- `app/services/preventivi_service.py`
- `app/routers/preventivi_router.py`
- `frontend/src/pages/clienti/ClientiPreventivoScheda.jsx`
- `frontend/src/pages/clienti/ClientiImpostazioni.jsx`
- `frontend/src/config/versions.jsx`

---

## 2026-04-14 — Sessione 34 / Mattone M.B PDF Brand + migrazione inventario + ricette + PDF preventivi

**Mattone M.B PDF Brand** (roadmap 8.5): servizio centralizzato per generare PDF con branding TRGB-02. Sblocca PDF preventivi (10.3), P&L mensile (4.5), cash flow (3.8), cedolini (6.2), scheda ricette (4.2).

### Backend
- Nuovo `app/services/pdf_brand.py` — motore centralizzato con 2 funzioni pubbliche:
  - `genera_pdf_html(template, dati, titolo, ...)` → PDF da template Jinja2 (per contenuti nuovi)
  - `wrappa_html_brand(titolo, body_html, ...)` → wrappa HTML già esistente con layout brand (per migrazione veloce endpoint esistenti)
- Nuovi template in `app/templates/pdf/`:
  - `base.html` — layout brand (header logo+wordmark, striscia gobbette rosso/verde/blu, footer @page con numero pagina)
  - `preventivo.html` — scheda preventivo con info cliente+evento, tabella righe, pill stato, note e condizioni
  - `ricetta.html` — scheda ricetta con KPI food cost, composizione, note
- CSS brand integrato in `_base_css_brand()`: palette TRGB-02, tipografia Helvetica Neue, tabelle uniformi, pill semantiche

### Endpoint nuovi
- `GET /preventivi/{id}/pdf?inline=false` — scarica PDF preventivo (primo endpoint che sfrutta M.B al 100%)

### Migrazioni (stesso branding ovunque)
- `vini_cantina_tools_router.py`: 5 endpoint inventario migrati da `HTML().write_pdf()` inline a `wrappa_html_brand()`:
  - `/vini/cantina-tools/inventario/pdf` (completo)
  - `/vini/cantina-tools/inventario/giacenza/pdf`
  - `/vini/cantina-tools/inventario/locazioni/pdf`
  - `/vini/cantina-tools/inventario/filtrato/pdf`
  - `/vini/cantina-tools/inventario/selezione/pdf`
  - Rimossi anche i write su `STATIC_DIR/inventario_*.pdf` → ora tutto in memory, `Response` diretto
- `foodcost_recipes_router.py`: endpoint `/foodcost/ricette/{id}/pdf` migrato da ReportLab (~140 righe) a WeasyPrint + template `ricetta.html` (~20 righe)

### Esclusione esplicita
- **Carta Vini** (`carta_vini_service.py` + `/vini/carta/pdf`/`/vini/carta/pdf-staff`): motore separato, NON toccato per volere di Marco

### Frontend
- `ClientiPreventivoScheda.jsx`: nuovo bottone "📥 Scarica PDF" nella sidebar azioni. Usa `apiFetch` + blob + objectURL + download trigger (preserva JWT, no redirect)

### Smoke test
- Sintassi Python OK (pdf_brand, preventivi_router, vini_cantina_tools_router, foodcost_recipes_router)
- Jinja2 render template OK (preventivo.html, ricetta.html, base.html)
- CSS @page portrait/landscape OK, SVG logo embed via data-uri OK

**File modificati**: `app/services/pdf_brand.py` (nuovo), `app/templates/pdf/base.html` (nuovo), `app/templates/pdf/preventivo.html` (nuovo), `app/templates/pdf/ricetta.html` (nuovo), `app/templates/pdf/logo-icon.svg` (asset), `app/templates/pdf/gobbette-strip.svg` (asset), `app/routers/preventivi_router.py`, `app/routers/vini_cantina_tools_router.py`, `app/routers/foodcost_recipes_router.py`, `frontend/src/pages/clienti/ClientiPreventivoScheda.jsx`

---

## 2026-04-13 — Sessione 33 / FIX CRITICO: Crash pagine per trailing slash 307

**Bug critico risolto**: Cantina, Mance, Dipendenti (e Ricette/Ingredienti) crashavano → pagina si ricaricava → redirect a login. Causa: le chiamate API senza trailing slash (`/vini/magazzino`, `/admin/finance/shift-closures`, `/dipendenti`, `/foodcost/ingredients`) venivano redirezionate da FastAPI con 307 a versioni con `/`. Durante il redirect il browser perde l'header Authorization (CORS) → backend vede richiesta senza token → 401 → handler frontend cancella JWT e fa `window.location.href = "/login"`.

- Fix: aggiunto trailing slash a tutte le chiamate API root che colpiscono router con prefix (9 file, 11 chiamate)
- Nuovo `ErrorBoundary.jsx`: cattura errori React e mostra schermata amichevole (invece di crash totale)
- `App.jsx`: routes wrappate in ErrorBoundary
- `api.js`: migliorato logging 401 — ora mostra QUALE endpoint ha fallito nella console
- `Home.jsx`: fix link QUICK_ACTIONS "Cerca Vino" da `/vini/magazzino` a `/vini/carta`

**File modificati**: `api.js`, `App.jsx`, `Home.jsx`, `MagazzinoVini.jsx`, `MagazzinoViniNuovo.jsx`, `MagazzinoAdmin.jsx`, `FlussiCassaMance.jsx`, `MancePage.jsx`, `DipendentiAnagrafica.jsx` (×2), `DipendentiTurni.jsx`, `RicetteIngredienti.jsx`, `RicetteNuova.jsx`, `RicetteModifica.jsx`
**Nuovo file**: `ErrorBoundary.jsx`

---

## 2026-04-13 — Sessione 32 / Modulo Preventivi 10.1+10.2

**Modulo Preventivi** (sotto Clienti/CRM): CRUD completo per gestione preventivi eventi privati, cene aziendali, gruppi.

- Backend: `preventivi_service.py` (CRUD, numerazione progressiva PRE-YYYY-NNN, transizioni stato, duplicazione, ricalcolo totale server-side) + `preventivi_router.py` (14 endpoint REST)
- Frontend: Lista con filtri (stato, tipo, anno/mese, ricerca) + KPI (in ballo, confermati, valore mese) + Scheda con form testata + griglia righe editabili + totale live + sidebar azioni (cambia stato, duplica, elimina)
- Template riutilizzabili: sezione in Impostazioni CRM per creare menu tipo con righe precompilate e condizioni default. Applicabili ai nuovi preventivi
- Tab "Preventivi" nella scheda singolo cliente (storico preventivi per cliente)
- Navigazione: tab in ClientiNav, voce in modulesMenu dropdown, rotte in App.jsx
- Transizioni stato: bozza -> inviato -> in_attesa -> confermato -> prenotato -> completato -> fatturato (+ rifiutato/scaduto)

---

## 2026-04-13 — Sessione 30 / HOME v3.3 Originale Potenziato

Redesign pagina moduli (pagina 2): da Magazine (card bianche + accent bar + icone SVG) a stile "Originale Potenziato" — emoji e colori Tailwind da `modulesMenu.js` (stessi del dropdown header). Card con sfondo tintato colorato per modulo, emoji grande, nome completo, 2 righe dati dinamici + badge notifica. Hero Prenotazioni span 2 colonne. Griglia responsive 2/3 col. Pagina widget (pagina 1) allineata: bordi colorati, emoji nei label e azioni rapide.

**DashboardSala v5.0 "Sala Operativa"**: redesign completo per ruolo sala. Layout 3 colonne su landscape (prenotazioni con tab pranzo/cena, bacheca comunicazioni con urgenza/letto, azioni rapide colorate). Su portrait: stack verticale. Nuovo hook `useComunicazioni.js` per fetch bacheca staff (`GET /comunicazioni`). Indicatore turno (pranzo/cena) nell'header. Segna-come-letta sulle comunicazioni.

---

## 2026-04-12 — Sessione 29 / HOME v3 REDESIGN — Fase 0 (docs + specifiche)

Redesign completo della Home in ottica app iPad/iPhone. Concept approvato da Marco: due pagine con swipe (pagina 1 = widget personalizzabili, pagina 2 = griglia moduli). Tile moduli con icone SVG (no emoji), colori smorzati, linea gobbetta brand, estetica raffinata (Playfair Display, card bianche, ombre minime). Mockup interattivo `mockup-home-v3.html`. Fase 0 completata: `docs/sessione.md` aggiornato con piano 7 fasi (F.0-F.6), specifiche 5 widget al lancio, regole design per pagine interne. `CLAUDE.md` aggiornato con regole Home v3 per tutti gli agenti. Prossimo: Fase 1 backend endpoint `/dashboard/home`.

---

## 2026-04-12 — Sessione 28 / PIANO RESPONSIVE COMPLETATO (tutti i 7 punti)

**Punto 1** — `100vh`→`100dvh` in 7 file (fix iOS Safari URL bar). Niente hook JS, solo CSS nativo.
**B.4** — Tap target ~40px su sidebar filtri (FattureElenco, FattureFornitoriElenco, CG Uscite, BancaMovimenti).
**B.5** — Sidebar width variabile: `w-sidebar` (280px) e `w-sidebar-sm` (240px) in `tailwind.config.js`.
**B.6** — Colonne secondarie `hidden xl:table-cell`: IVA/Righe/Fonte in FattureElenco, Banca in CG Uscite.

---

## 2026-04-12 — Sessione 28 / B.2 COMPLETATA: migrazione title=→Tooltip su tutto il frontend

Migrazione bulk di tutti i `title=` su elementi interattivi (button, link, span-icona, badge) al componente `<Tooltip>` custom con supporto touch iPad. 35 file toccati, 74 wrapping in 6 blocchi (Acquisti 17, Cantina 16, Dipendenti/Clienti/Prenotazioni/Ricette 28, Banca/Statistiche/Admin 13). Fix conflitto Recharts Tooltip in `FattureDashboard.jsx` (rinominato `TrgbTooltip` + `RechartsTooltip`).

Grep finale: **zero `title=` migrabili rimasti** su tutto `frontend/src/pages/`. I 56 residui sono tutti esclusi (td/th truncate, input, component props, iframe, div informativo).

**B.2 del piano responsive è ora CHIUSA.**

---

## 2026-04-12 — Sessione 28 / Brand TRGB-02: integrazione completa P0+P1

Integrazione del nuovo logo TRGB-02 (gobbette RGB + T) in tutto il frontend. Palette brand definita in Tailwind, favicon/icone PWA sostituite, header e login con logo SVG, Home con wordmark composto (gobbette inline + testo HTML centrato da flexbox), TrgbLoader animato sui dashboard principali, colori Recharts allineati alla palette brand. Sfondo `bg-brand-cream` applicato a tutte le ~90 pagine.

**Palette brand Tailwind:** red #E8402B, green #2EB872, blue #2E7BE8, ink #111111, cream #F4F1EC, night #0E0E10.

**File creati:** `TrgbLoader.jsx`, `src/assets/brand/` (10 SVG + pattern).  
**File principali toccati:** `tailwind.config.js`, `index.html`, `manifest.webmanifest`, `index.css`, `Header.jsx` (v5.0), `LoginForm.jsx`, `Home.jsx` (v4.0), `CorrispettiviDashboard.jsx`, `FattureDashboard.jsx`, `CorrispettiviAnnual.jsx`, `StatisticheDashboard.jsx`, `ControlloGestioneDashboard.jsx`, `versions.jsx` (sistema 5.3→5.4).  
**Bulk update:** 90 pagine `bg-neutral-100` / `bg-gray-50` → `bg-brand-cream`.

**Sistema:** v5.3 → v5.4

---

## 2026-04-11/12 — Sessione 27 / B.2 Block 1 CG: ControlloGestioneRiconciliazione title= → Tooltip ✓

Ultimo file del Block 1 Controllo Gestione del piano B.2. Un solo `title=` nel file, su un bottone `↻ Ricarica` in alto a destra. Migrato a `<Tooltip>`, import aggiunto, nessun residuo.

**File toccato:** `frontend/src/pages/controllo-gestione/ControlloGestioneRiconciliazione.jsx` (1 wrapping + import Tooltip). Nient'altro.

**Test superati:** Mac hover → tooltip "Ricarica"; iPad primo tap → tooltip, secondo tap → ricarica worklist.

**Stato Block 1 CG:** ✅ CHIUSO. `ControlloGestioneUscite.jsx` + `ControlloGestioneSpeseFisse.jsx` + `ControlloGestioneRiconciliazione.jsx` tutti migrati, testati Mac + iPad, in produzione. Block 2-6 di B.2 (Acquisti, Cantina, Dipendenti, Clienti+Contanti, Prenotazioni+Ricette+Banca) rimandati a sessione 28.

---

## 2026-04-11/12 — Sessione 27 / B.2 Block 1 CG: ControlloGestioneSpeseFisse title= → Tooltip ✓

Secondo file del Block 1 B.2. Quattro bottoni migrati a `<Tooltip>` (Ricarica fatture nel wizard rateizzazione, Piano/Storico/Adegua nella tabella spese fisse attive). Due span informativi della tabella storico rate (con `title={banca_descrizione}`) **lasciati deliberatamente con `title=` nativo** perché non hanno azioni cliccabili e il label può essere vuoto.

**File toccato:** `frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx` (4 wrapping + import Tooltip).

**Esclusi dalle regole B.2:** 5 `WizardPanel title=...` (prop del component, non HTML title), 1 `<input title={...}>` in una cella rata (no wrapping di input).

**Test superati:** Mac hover + iPad tap-toggle verdi su tutti e 4 i bottoni.

---

## 2026-04-11/12 — Sessione 27 / B.2 Block 1 CG: ControlloGestioneUscite title= → Tooltip ✓

Primo file grande del Block 1 B.2. Nove wrapping `<Tooltip>` aggiunti (escludendo quelli su input/th/tr strutturali): bottoni ✕ azzera filtro nella sidebar (Stato, Periodo), button "Mostra escluse" con spiegazione lunga sulle spese fisse FIC, bottone "Stampa / Metti in pagamento" nella barra bulk, frecce `‹ ›` navigazione fattura precedente/successiva (label dinamico con nome fornitore), badge "In pagamento" con titolo dinamico (`Batch: ...`), icone banca riconciliata/scollegare per riga. Tutto in un commit isolato.

**File toccato:** `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx` (9 wrapping + import Tooltip).

**Esclusi dalle regole B.2:** `<input type="checkbox" title=...>` "seleziona tutte non pagate", `<th title="Riconciliazione banca">`, `<tr title={...}>` con titolo dinamico (struttura tabella).

**Test critico superato:** icone banca per riga (scollega/collega) dentro `<td onClick={e => e.stopPropagation()}>` — il capture del Tooltip intercetta il click PRIMA del button.onClick e il td.stopPropagation non interferisce.

---

## 2026-04-11/12 — Sessione 27 / B.2 KPI ControlloGestioneUscite → Tooltip ✓ (fix tap iPad)

Bug di origine: su iPad il tap sui KPI "Da riconciliare" e "Riconciliate" apriva direttamente il workbench/crossref senza mostrare il tooltip di spiegazione, perché il componente interno `KPI` di `ControlloGestioneUscite.jsx` usava `title=` HTML nativo che su iPad non blocca il click.

**File toccato:** `frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx` (import Tooltip + riscrittura interna del componente `function KPI`). Nient'altro.

**Pattern:** se al KPI viene passato `title`, il bottone interno viene wrappato in `<Tooltip label={title}>`. Se `title` è assente, resta il bottone nudo — nessuna regressione sui KPI senza tooltip (Programmato, Scaduto, Pagato).

**Nota meta:** questo fix è nato dopo aver scoperto che il Block 1 CG originariamente eseguito da Claude Code in un worktree `.claude/worktrees/gracious-liskov/` NON era mai stato mergiato in main. Tutte le modifiche di Code erano fantasma (file presenti nel worktree ma branch mai mergiato, e working directory del worktree non accessibile dalla sandbox per via del path host `/Users/underline83/...`). Il fix KPI è stato fatto manualmente direttamente in main. Memory aggiornata: `feedback_worktree_no_trust.md` → regola ferrea "un worktree NON è in main finché non faccio merge esplicito verificato".

---

## 2026-04-11/12 — Sessione 27 / B.2 fix Tooltip iPad: detect desktop-mode + no long-press callout ✓

Bugfix al componente `Tooltip.jsx` (v1.0 → v1.1) dopo report di Marco sul comportamento su iPad reale.

**Bug 1 — detection touch fallimentare su iPad Desktop Website.** iPadOS 13+ di default richiede modalità "Desktop Website" che fa riportare a Safari `hover: hover` e `pointer: fine`. La detection v1.0 basata su `matchMedia("(hover: none) and (pointer: coarse)")` tornava `false` → `isTouch` restava `false` → `handleClickCapture` faceva `return` subito → primo tap passava direttamente al child button. Su Mac hover funzionava (colpa non visibile prima del test iPad reale).

**Fix 1:** detection combinata con `navigator.maxTouchPoints > 0` (restituisce 5 su iPad anche in desktop mode) + `(any-pointer: coarse)` come fallback + vecchia query mantenuta per retrocompatibilità.

**Bug 2 — long-press iOS Safari = zoom/menu callout.** Il tocco prolungato su elementi wrappati dal Tooltip faceva scattare la selezione testo e il menu di callout iOS, interpretati come richiesta di zoom.

**Fix 2:** aggiunto `style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}` sullo span wrapper del Tooltip. Nessun impatto su desktop (gli elementi wrappati sono button/icone, non testo selezionabile).

**File toccato:** `frontend/src/components/Tooltip.jsx` (da v1.0 → v1.1). Nient'altro.

**Test superati:** Mac hover invariato; iPad reale tap-toggle funziona, long-press non zooma più, icone e bottoni wrappati in Tooltip tutti ok.

---

## 2026-04-11 — Sessione 27 / B.2 componente Tooltip + integrazione Header ✓

Creato il componente `frontend/src/components/Tooltip.jsx` v1.0 — wrapper touch-compatible che sostituisce l'attributo `title=` nativo HTML. Su desktop mostra un popup in hover con delay 400ms; su touch il primo tap mostra il tooltip MA blocca il click del child (via `onClickCapture` con `preventDefault` + `stopPropagation` in fase capture), il secondo tap sullo stesso child lascia passare l'azione. Click/touch fuori chiude, auto-close dopo 2.5s su touch.

**File toccati:** `frontend/src/components/Tooltip.jsx` (NUOVO) + `frontend/src/components/Header.jsx` (2 integrazioni: span "Modalità gestione" amber dot e bottone "🔑 Cambia PIN").

**Test superati:** Mac hover + iPad tap-toggle su Header, tutto verde.

**Pianificazione Block 1-6 B.2 iniziale:** documento `docs/b2_tooltip_migration_prompts.md` con 6 prompt per Claude Code, stima 66 migrazioni reali su 96 occorrenze `title=` (30 false positive: th, input, label, WizardPanel, Section, SectionHeader, iframe).

---

## 2026-04-11 — Sessione 27 / B.3 Input font-size 16px su touch (no zoom iOS) ✓

Fix CSS globale per evitare il saltello zoom automatico di iOS Safari quando si tocca un input con `font-size < 16px`. Un solo file, una sola media query.

**File toccato:** `frontend/src/index.css` — aggiunta in coda:
```css
@media (pointer: coarse) {
  input,
  textarea,
  select {
    font-size: 16px;
  }
}
```

**Test superati:** Mac invariato (nessuna modifica percepita); iPad reale — tap su input sidebar filtri (Anno, Mese, Cerca fornitore, ecc.) non zooma più. Cinque minuti netti di lavoro, zero regressioni.

---

## 2026-04-11 — Sessione 27 / B.1: Header touch-compatibile (tap-toggle flyout iPad/iPhone) ✓

Prima sigla della scaletta B eseguita con disciplina commit-isolato dopo la lezione sessione 26.

**File toccato:** `frontend/src/components/Header.jsx` (da v4.2 → v4.3). Nessuna altra modifica.

**Cosa fa:**
- Detection touch via `matchMedia("(hover: none) and (pointer: coarse)")` con listener `change` (regge anche il toggle Device Mode di Chrome DevTools)
- Sul row del modulo: tap-toggle. Su touch + modulo con sotto-voci, il primo tap apre il flyout, il secondo tap sullo stesso row naviga al path principale. Moduli senza sotto-voci navigano al primo tap. Desktop completamente invariato
- Click-outside esteso a `touchstart` oltre `mousedown`, così il tap fuori dal dropdown lo chiude su iPad
- `onMouseEnter`/`onMouseLeave` di row, container lista, flyout sub-menu e "ponte invisibile" resi condizionali su `!isTouch`, per evitare che gli eventi mouse sintetici post-touch dei browser mobile inneschino l'intent-detection del desktop

**Non toccato di proposito:** `useAppHeight` (C.3 resta da bisezionare), i 6 file pagina della responsive (restano `calc(100vh - Npx)`), Service Worker, qualunque altro componente. Isolamento pieno come da cap. 10 del piano responsive.

**Test superati:**
- Mac Chrome/Safari: dropdown + hover + flyout + click row = comportamento storico invariato
- Mac Chrome DevTools Device Mode iPad: tap-toggle funziona, click-outside funziona, moduli senza sotto-voci navigano al primo tap
- iPad reale: tutti i moduli con sotto-voci (Cantina, Ricette, Acquisti, Controllo Gestione, ecc.) ora accessibili via tap. Cantina e RicetteNuova aprono correttamente (erano il sintomo del crash di sessione 26: confermato che NON dipendeva dall'header ma da `useAppHeight`)

---

## 2026-04-11 — Sessione 26: tentativo App Apple Fase 0 + Punto 1 responsive, ROLLBACK ENTRAMBI

Sessione ambiziosa partita come avvio della roadmap App Apple (`docs/analisi_app_apple.md`, `docs/roadmap.md` §33) e finita con due rollback in produzione.

**Cosa è rimasto in produzione (positivo):**
- `docs/analisi_app_apple.md` — analisi completa scenari Apple (5 scenari A-E, pitfall, costi, tempi)
- `docs/piano_responsive_3target.md` — piano in 7 punti per ottimizzare Mac+iPad. iPhone esplicitamente fuori scope per decisione di Marco fino a "progetto quasi finito"
- `docs/roadmap.md` §33 — roadmap App Apple (Fase 0 PWA + Fase 1 Capacitor + Fase 2 SwiftUI futura), aggiornata con stato regressioni
- `frontend/src/main.jsx` — blocco difensivo `serviceWorker.getRegistrations().then(unregister) + caches.delete()`. Lasciato attivo per ripulire automaticamente i client (Mac/iPad) dove era stato registrato il sw.js durante il tentativo PWA. Si toglie quando saremo certi che nessun client ha più SW vecchio
- `frontend/public/icons/` (19 icone PWA/Apple), `frontend/public/manifest.webmanifest`, meta tag iOS in `index.html`, fix `.gitignore` per pattern `Icon?` — tutti sul disco ma inerti senza il SW. Pronti per essere riusati quando rifaremo la PWA correttamente
- `frontend/src/hooks/useAppHeight.js` — orfano, non importato. Lasciato per riutilizzo dopo debug

**Cosa è stato rollbackato:**
- **PWA Fase 0** — il `sw.js` con strategia stale-while-revalidate causava crash su iPad aprendo Cantina e RicetteNuova (pagine pesanti, sospetto cache servita male da iOS Safari al primo deploy). Disabilitata la registrazione del SW in `main.jsx`
- **Punto 1 piano responsive — `useAppHeight` hook** — anche dopo rollback PWA, Cantina/RicetteNuova continuavano a crashare. RicetteNuova non era nemmeno stata toccata dal Punto 1 → causa probabile nell'hook globale, non nel CSS pagina-per-pagina. Rollback completo: import + chiamata `useAppHeight` rimossi da `App.jsx`, tutti i 6 file pagina (FattureElenco, FattureFornitoriElenco, ControlloGestioneUscite, DipendentiAnagrafica, MagazzinoVini, ControlloGestioneRiconciliazione) ripristinati a `calc(100vh - Npx)` originale

**Lezione operativa critica:** mai più commit a blocchi accoppiati su modifiche infrastrutturali rischiose. Il push iniziale mescolava 3 cambiamenti incrociati (PWA SW + hook globale + 6 file CSS) in un push solo. Quando è esploso non c'era modo di bisezionare la causa senza rollback completo. Workflow per i prossimi tentativi (vedi `docs/piano_responsive_3target.md` cap. 10 e roadmap §33 D.4):
- `useAppHeight`: prima commit l'hook isolato (senza toccare nessun file pagina), poi 1 file pagina alla volta, dalla più semplice (DipendentiAnagrafica) alla più complessa (MagazzinoVini)
- PWA Fase 0: `CACHE_NAME` legato a `BUILD_VERSION`, network-first per app shell, no precache di chunk Vite, test in dev tools desktop con throttling+offline mode prima di toccare il VPS, test su iPad con Safari devtools collegato

**Stato finale codice:** identico a fine sessione 25, eccetto i file marcati "in produzione" qui sopra.

---

## 2026-04-11 — Fix .gitignore: protezione cartelle runtime dal post-receive `git clean -fd`

**Bug critico** segnalato da Marco: dopo un push.sh i PDF cedolini importati il 10/04 sono spariti dal VPS. Badge "PDF" viola ancora visibile nella pagina Documenti dipendente (il `pdf_path` nel DB esiste), ma il download dava 404 "File PDF non trovato su disco".

**Root cause**: il post-receive hook del VPS (`/home/marco/trgb/trgb.git/hooks/post-receive`) esegue:
```bash
git --git-dir="$BARE_REPO" --work-tree="$WORKING_DIR" checkout -f main
git --git-dir="$BARE_REPO" --work-tree="$WORKING_DIR" clean -fd
```
Il `clean -fd` rimuove **tutte le cartelle/file untracked** ad ogni push. `app/data/cedolini/` **non era in .gitignore**, quindi ad ogni push veniva rasa al suolo. Lo stesso valeva per altre 3 cartelle runtime scoperte durante l'analisi.

**Fix — `.gitignore`**: aggiunte 4 cartelle runtime scritte dal backend. Senza `-x`, `git clean -fd` rispetta le ignore rules e non le tocca più.
```
app/data/cedolini/              # cedolini PDF estratti da LUL
app/data/documenti_dipendenti/  # allegati manuali su anagrafica dipendente
app/data/uploads/               # UPLOAD_DIR admin_finance (XML fatture)
app/data/ipratico_uploads/      # upload iPratico products
```

**Recovery**: i DB (`buste_paga.pdf_path`) conservano ancora i path, ma i file fisici sono persi. L'unico modo per riaverli è **re-importare il PDF LUL originale**: l'import è idempotente (`WHERE fornitore_nome AND data_scadenza AND tipo_uscita='STIPENDIO'`), riconosce la busta paga esistente, aggiorna `pdf_path` e ricrea il file fisico. Nessun duplicato in `cg_uscite` o `buste_paga`.

**Procedura post-push**:
1. Push di questa modifica (così il nuovo .gitignore arriva sul VPS e protegge i file futuri).
2. Re-import del PDF LUL di marzo 2026 dalla UI Anagrafica → Buste Paga.
3. I cedolini di mesi precedenti che servono vanno ri-importati uno per uno (se ci sono i PDF originali).

---

## 2026-04-11 — CG v2.3: Scadenzario fix stipendi + rename stati + multi-select

Sessione 23: debug dei filtri Scadenzario (`ControlloGestioneUscite.jsx`). Marco ha notato che gli stipendi di marzo 2026 apparivano con scadenza **27/03** (default legacy `giorno_paga`=27 applicato al mese di riferimento) quando in realtà nella sua operatività gli stipendi del mese N vengono pagati il **giorno 15 del mese N+1** (stipendio marzo → 15 aprile).

### Bug stipendi — `app/routers/dipendenti.py`
- **`_genera_scadenza_stipendio`**: la `data_scadenza` era calcolata sul mese di riferimento (`anno`, `mese`). Ora calcola sul mese successivo con rollover anno a dicembre→gennaio. Default `giorno_paga` portato da **27 → 15**.
- **Creazione automatica dipendente da cedolino** (`_crea_dipendente_da_cedolino`): default `giorno_paga` allineato a **15**.

### Migrazione back-fix — `app/migrations/064_fix_stipendi_data_scadenza.py`
- UPDATE `cg_uscite` WHERE `tipo_uscita='STIPENDIO' AND stato IN ('DA_PAGARE','SCADUTA')`: sposta `data_scadenza` al 15 del mese N+1 parsando `periodo_riferimento` ("Marzo 2026" → 2026-04-15). Solo righe non pagate: gli storici `PAGATA_MANUALE` restano intatti (audit trail pagamenti).
- Ricalcolo stato post-shift: righe con `data_scadenza < oggi` → `SCADUTA`, altrimenti `DA_PAGARE`.
- UPDATE `dipendenti.db.dipendenti SET giorno_paga=15 WHERE giorno_paga=27` (tocca solo i legacy, rispetta eventuali valori personalizzati).

### Frontend rename stati → tutti al maschile per coerenza desinenza
Richiesta estetica di Marco: "Da pagare" e "Scaduta" avevano desinenze miste (a/o). Uniformati tutti al maschile sottinteso "pagamento":
- **Da pagare** → **Programmato** (amber)
- **Scaduta** → **Scaduto** (red)
- **Pagata / Pagata \*** → **Pagato / Pagato \*** (emerald / teal)
- **Rateizzata** → **Rateizzato** (purple)
- Parziale e Da riconciliare invariati

Toccati: `ControlloGestioneUscite.jsx` (STATO_STYLE + grid Stato SX + KPI bar + confirm scollega), `ControlloGestioneSpeseFisse.jsx` (mappa badge + riepilogo piano rate). I moduli Fatture (`FattureElenco`, `FattureFornitoriElenco`, `FattureInCloud`) restano con vecchie label: riguardano acquisti, non scadenzario pagamenti.

### Frontend multi-select stato — `ControlloGestioneUscite.jsx`
Marco: "se sono scadute sono anche da pagare, dovresti distinguerle in modo diverso". Risolto trasformando `filtroStato` da stringa singola a **`Set<string>`**:
- Grid Stato in sidebar SX ora permette di selezionare **più stati contemporaneamente** (OR logico)
- KPI bar in alto usa toggle sul Set: click attiva/disattiva singolo stato, conservando gli altri
- Aggiunto **Parziale** come 4° tab nella grid (prima non filtrabile dal lato UI)
- Aggiunto bottone "✕" per azzerare la selezione stato nella sidebar
- `activeFilters` counter e `clearFilters` aggiornati alla nuova struttura
- Sort direction per tab "solo Pagato" resta DESC (recenti prima), altrimenti ASC

### Non toccato (su richiesta di Marco)
- Logica filtro Periodo `Da` / `A`: range aperto (solo "A" = `<= A`) è **comportamento voluto**, non bug. Con la `data_scadenza` stipendi ora corretta, il range 11/04–11/04 non mostrerà più gli stipendi di aprile.

---

## 2026-04-11 — Flussi di Cassa v1.7: Riconciliazione filtri avanzati (sidebar SX)

Richiesta **C** di Marco (11/04/2026): "Migliora pesantemente il filtro [della Riconciliazione], funziona male; non ha possibilità etc etc." Il filtro era un singolo input testuale client-side, nessun range date, nessun range importo, nessun filtro per tipo/direzione, tutto gestito con LIMIT 500 hardcoded. Marco ha approvato TUTTI gli 8 filtri proposti.

### Backend
- **`app/routers/banca_router.py`** — estensione endpoint `GET /banca/cross-ref`:
  - nuovi parametri: `importo_min`, `importo_max` (applicati su `ABS(m.importo)`), `direzione` (`'uscite'`→`importo<0`, `'entrate'`→`importo>=0`), `categoria_banca` (substring LIKE case-insensitive), `limit` (default 500, cap 5000)
  - `data_da`/`data_a` già esistenti, riutilizzati
  - il `LIMIT 500` ora è parametrizzato via `limit` con safety cap

### Frontend — `BancaCrossRef.jsx`
- **Sidebar filtri SX** (Cantina layout, 240px, `sticky top-4`) visibile da `lg:` in su; su mobile/iPad portrait apre drawer laterale con bottone "⚙ Filtri" in header
- **`FilterPanel`** componente riutilizzabile con tutti i controlli: ricerca testuale con clear inline, preset periodo (Tutto / Mese / 3 mesi / Anno / Custom → con due `<input type="date">`), direzione segmented (Tutti / Uscite / Entrate), range importo (min/max), chip multi-select per tipo link (Fattura, Spesa fissa, Affitto, Stipendio, Tassa, Rata, Assicurazione, Entrate reg., Nessun link)
- **Filter state consolidato** in singolo oggetto `filters` + helper `updateFilter`/`resetFilters`/`toggleTipoLink`
- **Debounce text search 200ms** — `filters.searchText` → `searchDebounced` via `setTimeout` in effect
- **Separazione server-side / client-side**:
  - server-side (triggerano reload): date range, range importo, direzione → calcolati in `serverParams` con `useMemo`, `useEffect([serverParams])` richiama `loadData`
  - client-side (lavorano sul set già caricato): tipo link, ricerca testuale — la ricerca per importo tenta match numerico con tolleranza formato italiano (virgola→punto)
- **Badge "N filtri attivi"** in header della sidebar + **chip riepilogo** sopra la tabella (uno per dimensione attiva, ognuno con ✕ per pulire singolarmente) + bottone "Pulisci tutti"
- **Empty state**: se filtri attivi e lista vuota, messaggio dedicato + shortcut "Pulisci i filtri"
- **Max-width esteso** `max-w-7xl` → `max-w-[1400px]` per fare spazio alla sidebar su desktop
- Ricerca testuale ora cerca anche su `categoria_banca` / `sottocategoria_banca`, non solo descrizione e fornitore

### Note
- La regola dei componenti riutilizzabili è rispettata: `FilterPanel` vive come funzione a modulo scope, usata sia in sidebar desktop che in drawer mobile con le stesse prop
- iPad portrait (< lg): il drawer slide-in mantiene la stessa esperienza touch, con bottone filtri nell'header della card principale

---

## 2026-04-11 — CG v2.2: Riconciliazione bidirezionale (Workbench + Piano Rate + Storico)

Richiesta di Marco del giorno stesso (parte A + B in un unico rilascio): rendere visibile e gestibile la riconciliazione banca dal lato uscite, non solo dal lato movimenti. Flusso bidirezionale: dal movimento all'uscita (esistente, via `BancaCrossRef`) **e ora** dall'uscita al movimento.

**Decisioni di design (prese con Marco su mockup visivo `docs/mockups/riconciliazione_design.html`):**
- **A1** opzione 2: pill KPI "Da riconciliare" direttamente nella barra KPI dello scadenzario, cliccabile, naviga al workbench
- **A3** palette C (dot-indicator minimal) + nomi A (Riconciliata / Automatica / Da collegare / Aperta) — 4 stati tecnici semantici
- **6** opzione C: workbench split-pane dedicato (pagina `/controllo-gestione/riconciliazione`) invece che modale sovrapposta
- **7** componenti riutilizzabili come regola cardine — `StatoRiconciliazioneBadge` e `RiconciliaBancaPanel` usati in 3 contesti diversi

#### Componenti riutilizzabili (nuovi)
- **`frontend/src/components/riconciliazione/StatoRiconciliazioneBadge.jsx`** — badge dot-indicator + label, 4 stati (`riconciliata`/`automatica`/`da_collegare`/`aperta`). Espone `derivaStatoRiconciliazione(row)` come helper puro, coerente con la logica backend. Taglie `xs`/`sm`, prop `showLabel` per modalità icon-only. Export anche `STATI_RICONCILIAZIONE` per legende/filtri esterni
- **`frontend/src/components/riconciliazione/RiconciliaBancaPanel.jsx`** — pannello con 2 tab:
  - 🎯 **Auto**: chiama `GET /controllo-gestione/uscite/{id}/candidati-banca` (matching esistente ±10% importo, ±15gg)
  - 🔍 **Ricerca libera**: chiama il nuovo `GET /controllo-gestione/uscite/{id}/ricerca-banca` con filtri testo/data/importo (prefill ±60gg, ±30%)
  - Link tramite `POST /controllo-gestione/uscite/{id}/riconcilia`, callback `onLinked` per refresh contesto
  - Usato in: workbench split-pane (right pane), modale piano rate, modale storico

#### Parte A — Scadenzario uscite
- **Pill KPI "Da riconciliare"** in `ControlloGestioneUscite.jsx` barra KPI (solo se `rig.num_da_riconciliare > 0`). Clic → `navigate("/controllo-gestione/riconciliazione")`
- **Workbench split-pane `ControlloGestioneRiconciliazione.jsx`** (nuova pagina):
  - **Pane SX**: worklist di uscite PAGATA_MANUALE senza movimento, tabella clickabile con search box + refresh
  - **Pane DX**: `RiconciliaBancaPanel` inizializzato sulla riga selezionata
  - Dopo link, la worklist si rigenera e seleziona il successivo item automaticamente
  - Header con contatore totale da collegare + bottone back allo scadenzario
- **Voce "Riconciliazione"** aggiunta a `ControlloGestioneNav`

#### Parte B — Spese Fisse
- **Piano Rate (prestiti)**: nuova colonna **Banca** nella tabella. Se `riconciliazione_stato=riconciliata` mostra badge + data movimento; se `da_collegare` mostra bottone "Cerca movimento" che apre modale con `RiconciliaBancaPanel`; altrimenti badge "Aperta"
- **Storico (affitti e non-prestiti)**: nuova modale `storicoModal` aperta dal bottone **"Storico"** in tabella spese fisse (tipi ≠ PRESTITO/RATEIZZAZIONE). Lista delle `cg_uscite` passate collegate alla spesa fissa, con stesso trattamento della colonna Banca e KPI in alto (uscite / riconciliate / da collegare / aperte / pagato totale)
- Refresh automatico di piano e storico dopo link banca (callback `refreshPianoRate` + `refreshStorico`)

#### Backend — nuovi endpoint
- **`GET /controllo-gestione/spese-fisse/{id}/piano-rate` esteso**: LEFT JOIN su `banca_movimenti` via `u.banca_movimento_id`, restituisce `banca_data_contabile`, `banca_importo`, `banca_descrizione`, `banca_ragione_sociale`. Calcola `riconciliazione_stato` per ogni rata replicando la logica del frontend `derivaStatoRiconciliazione`. Aggiunge `n_riconciliate`/`n_da_collegare`/`n_aperte` al riepilogo
- **`GET /controllo-gestione/spese-fisse/{id}/storico`** (nuovo): per spese fisse senza piano rate. Restituisce tutte le `cg_uscite` del `spesa_fissa_id` ordinate per data scadenza DESC, con info banca e `riconciliazione_stato` derivato. Riepilogo aggregato
- **`GET /controllo-gestione/uscite/da-riconciliare`** (nuovo): worklist per il workbench. Filtra `stato='PAGATA_MANUALE' AND banca_movimento_id IS NULL`, JOIN con `cg_spese_fisse` per ottenere `spesa_fissa_titolo`/`tipo`. Limit param (default 200), totale separato per badge counter
- **`GET /controllo-gestione/uscite/{id}/ricerca-banca`** (nuovo): ricerca libera movimenti bancari. Parametri `q` (LIKE su descrizione + ragione_sociale), `data_da`/`data_a`, `importo_min`/`importo_max`, `limit`. Esclude movimenti già riconciliati (LEFT JOIN `cg_uscite u2`). Lavora su movimenti in uscita (`importo < 0`)

#### Frontend — file modificati
- `ControlloGestioneUscite.jsx` — pill KPI cliccabile + navigazione
- `ControlloGestioneSpeseFisse.jsx` — colonna Banca nel piano rate + modale Cerca banca + modale Storico + bottone "Storico" in tabella spese
- `ControlloGestioneNav.jsx` — voce "Riconciliazione"
- `App.jsx` — nuova rotta `/controllo-gestione/riconciliazione`
- `versions.jsx` — bump `controlloGestione` 2.1c → 2.2

**Test end-to-end su DB locale:**
- Query `/piano-rate` estesa: prestito BPM 1 → 5 rate restituite con campi banca (NULL in questo test: le rate 2021 non hanno movimento collegato)
- Query `/storico`: affitto Via Broseta → 5 uscite recenti restituite (DA_PAGARE/SCADUTA → `riconciliazione_stato=aperta` corretto)
- Query `/uscite/da-riconciliare`: **917 uscite** PAGATA_MANUALE senza movimento bancario in attesa di collegamento — ottimo caso di test reale per il workbench

**Da testare dopo push:**
- [ ] Pill "Da riconciliare" appare in scadenzario e naviga al workbench
- [ ] Worklist carica le 917 righe, selezione fluida
- [ ] Tab Auto → candidati reali per almeno una uscita
- [ ] Tab Ricerca libera → filtri date/importo/testo funzionanti
- [ ] Link → worklist si rigenera senza la riga appena collegata
- [ ] Piano rate di un prestito mostra la colonna Banca; bottone Cerca apre modale
- [ ] Bottone "Storico" su un affitto mostra la lista storica
- [ ] Nessun regresso su `banca_router.py` cross-ref direzione opposta (movimento → fattura)

---

## 2026-04-11 — Bugfix batch "problemi 10/04": D3 + D2 + A2 + A1 + C1 + C2 + B1 in una passata

Sessione dedicata a chiudere i problemi che Marco aveva dettato il 10/04 durante l'uso del gestionale. 7 item su 8 chiusi, resta solo D1 (sistema storni difettoso) che richiede repro live.

#### D3 — Doppioni versamenti banca €5000 (Flussi di Cassa)
- **Mig 058** `058_pulizia_banca_duplicati_formato.py` — cleanup 10 duplicati residui del pattern "stesso movimento in formato BPM vecchio + nuovo" (uno con `ragione_sociale` pieno, l'altro vuoto). Raggruppa per `(data_contabile, importo)` in coppie, preserva il record con più metadati, migra link fattura/cg_uscite/cg_entrate, elimina il duplicato
- **Soft dedup check in `banca_router.py`** — prima dell'INSERT durante l'import CSV, verifica se esiste già un record opposto sullo stesso `(data_contabile, importo)` e skippa
- Risultato: €5000 del 26/01 ora record singolo, futuri import dei due formati BPM non creano più doppioni

#### D2 — Chiusura manuale riconciliazioni parziali (Flussi di Cassa)
- **Mig 059** `059_banca_riconciliazione_chiusa.py` — aggiunge 3 colonne a `banca_movimenti`: flag `riconciliazione_chiusa`, timestamp `riconciliazione_chiusa_at`, nota `riconciliazione_chiusa_note` + indice parziale
- **Backend `banca_router.py`** — `get_cross_ref` tratta movimento con `riconciliazione_chiusa=1` come completamente collegato. Nuovi endpoint `POST /cross-ref/chiudi/{id}` (con nota, richiede almeno un link) e `POST /cross-ref/riapri/{id}`
- **Frontend `BancaCrossRef.jsx` v5.1** — `isFullyLinked` include il flag. Bottone verde "✓ Chiudi" nei tab Suggerimenti e Senza match sui movimenti con link parziale. Nel tab Collegati, movimenti chiusi manualmente mostrano badge "🔒 Chiusa manuale" + nota + bottone "Riapri"
- Risolve casi di note di credito, bonifici multipli F1+F2, fattura+rata dove le cifre non quadrano al centesimo

#### A2 — Stipendi duplicati con nome corrotto (Dipendenti)
- **Causa:** il parser LUL su un batch del 30/03 12:47 aveva sbagliato 2 estrazioni ("Marco Carminatio" e "Dos Santos Mirla S Albuquerque"). Un import successivo del 10/04 18:41 con nomi canonici non ha riconosciuto quelli vecchi e ha creato nuovi record cg_uscite invece di aggiornarli
- **Mig 060** `060_pulizia_stipendi_duplicati.py` — cleanup 5 duplicati residui in cg_uscite. Strategia: raggruppa per `(periodo_riferimento, totale)` con tipo_uscita='STIPENDIO' e >=2 righe, normalizza il nome (strip "Stipendio - ", lowercase), classifica come CANONICO se matcha esattamente un nome di `dipendenti`, usa `SequenceMatcher` ratio ≥ 0.85 + subset di token per confermare stessa persona. Keeper = canonico con banca_movimento_id NOT NULL (o più recente), migra link banca se necessario, DELETE
- **Fuzzy matching in `_match_dipendente`** (`dipendenti.py`) — dopo il fallimento del match esatto (CF o "cognome=primo_token"), scorre tutti i dipendenti attivi e calcola `SequenceMatcher` ratio tra il blob "COGNOME NOME" del PDF e ciascun candidato (prova anche l'ordine inverso). Soglia 0.85 tollera typo singoli e troncamenti. Previene ricorrenze future
- Risultato: 30 → 25 stipendi in cg_uscite, 1 solo record per mese per dipendente, nome canonico ovunque

#### A1 — FIC importa non-fatture (affitti Cattaneo/Bana) (Acquisti) + tab Warning
- **Causa:** l'endpoint FIC `received_documents?type=expense` include registrazioni di prima nota (affitti, spese cassa) create in FIC senza numero di documento e senza P.IVA. Il sync le importava come fatture elettroniche finendo in `fe_fatture` e sporcando la dashboard Acquisti
- **Mig 061** `061_escludi_fornitori_fittizi.py` — cleanup one-shot. Scansiona `fe_fatture` cercando record con `numero_fattura=''` AND `fornitore_piva=''` AND `fonte='fic'`, raggruppa per `fornitore_nome`, INSERT/UPDATE in `fe_fornitore_categoria` con `escluso_acquisti=1` e motivo esplicito. I record storici restano in `fe_fatture` per non rompere eventuali link cg_uscite, ma vengono filtrati dalla dashboard grazie al `COALESCE(fc.escluso_acquisti, 0) = 0` già attivo in `fe_import.py`. Idempotente
- **Filtro a monte in `fattureincloud_router.py`** — nella FASE 1 del `sync_fic`, prima del dedup hash, se `doc_number` e `fornitore_piva` sono entrambi vuoti, skippa e conta in `skipped_non_fattura` (finisce nella note di fine sync)
- **Upgrade A1 — Mig 062 `062_fic_sync_warnings.py`** — Marco ha chiesto di rendere tracciabili questi skip così se un domani FIC cambia formato se ne accorge. Creata tabella `fic_sync_warnings` (foodcost.db) con schema estendibile per futuri tipi di warning: `id`, `sync_at`, `tipo`, `fornitore_nome/piva`, `numero_documento`, `data_documento`, `importo`, `fic_document_id`, `raw_payload_json`, `visto`, `visto_at`, `note`. Indici `(tipo, visto)`, `fornitore_nome`, UNIQUE `(tipo, fic_document_id)` per dedup su sync ripetuti
- **Filtro a monte → INSERT OR IGNORE**: invece di skip silenzioso, il filtro FIC persiste ora ogni non-fattura nella tabella warning con il payload raw completo. Non blocca mai il sync — se l'INSERT fallisce, logga e continua
- **Endpoint FIC**: `GET /fic/warnings?tipo=&visto=` (lista con filtro), `GET /fic/warnings/count?visto=0` (badge), `GET /fic/warnings/{id}` (dettaglio + raw payload deserializzato), `POST /fic/warnings/{id}/visto?note=...`, `POST /fic/warnings/{id}/unvisto`
- **Frontend `FattureInCloud.jsx` v1.1** — nuova tab "Warning" a fianco di "Fatture" con badge arancio count dei non visti. Filtro segmented non_visti/visti/tutti, export CSV one-click, bottone 🔍 per modale con payload raw FIC (debug retroattivo), bottoni ✓ marca visto (prompt per nota opzionale) / ↺ rimetti non visto
- Risultato: 3 fornitori esclusi (BANA MARIA DOLORES, CATTANEO SILVIA, PONTIGGIA), 57 fatture filtrate dalla dashboard, totale €82.395,66. Futuri sync FIC ignorano automaticamente le prima-nota E le registrano nella tabella warning
- **Dove vedere i fornitori flaggati:** Acquisti → Fornitori, sidebar filtri → checkbox "Mostra esclusi (N)" (appare solo se ci sono fornitori flaggati). Badge giallo "ESCLUSO" accanto al nome, toggle di riattivazione nel dettaglio fornitore

#### A1 — Follow-up 2: doppio conteggio affitti in scadenzario + riconciliazioni sbagliate
- **Problema emerso dopo A1 base:** Marco lavorando con il gestionale ha notato "che confusione": nella dashboard Acquisti le fatture escluse erano effettivamente nascoste, ma nello scadenzario uscite di Controllo Gestione e nel matcher riconciliazioni di Flussi di Cassa le stesse fatture continuavano a comparire. Risultato: ogni mese l'affitto veniva contato due volte (la rata dalla spesa fissa CG "Ristorante - Via Broseta 20/C" + la fattura FIC "CATTANEO SILVIA"), e 3 bonifici dell'affitto erano stati riconciliati contro la fattura FIC invece che contro la rata della spesa fissa
- **Causa architetturale:** il flag `escluso_acquisti` era un filtro locale applicato solo dal modulo Acquisti (`fe_import.py`). Controllo Gestione generava `cg_uscite` dalle stesse `fe_fatture` senza guardare il flag, e il matcher banca proponeva le fatture come possibili match senza filtrarle. Tre casi di dirty reconciliation manuale (movimenti 100, 102, 294) da sistemare
- **Scelte procedurali condivise con Marco:**
  1. **Opzione A — filtri a monte ovunque** (scelta): applicare `escluso_acquisti` in tutti i punti che leggono `fe_fatture` (generatore cg_uscite, query scadenzario, matcher banca). Mantiene le fatture nel DB per audit/warning tab ma le rende invisibili al workflow CG
  2. **Opzione B — drop spesa fissa**: rigettata come illogica. Perché far vincere una fattura importata automaticamente sulla rata confermata manualmente?
  3. **Opzione C — link fattura↔spesa_fissa** (differita a v2.1): quando un giorno una spesa fissa prenderà origine da una fattura vera (es. assicurazione annuale con IVA), servirà un collegamento esplicito così da nascondere la fattura ma accreditarla alla spesa fissa (e permettere di aprire il dettaglio XML dal bottone inline). Marco ha approvato di partire subito in parallelo come traccia concettuale. NON riutilizzerà `rateizzata_in_spesa_fissa_id` (mig 055) per evitare overload semantico; verrà aggiunta colonna dedicata `coperta_da_spesa_fissa_id`
- **Mig 063 `063_cleanup_riconciliazioni_escluse.py`** — cleanup one-shot irreversibile con backup in audit table
  1. `cg_uscite_audit_063` — snapshot JSON completo delle cg_uscite cancellate, per ripristino manuale se serve
  2. Trova `fe_fatture` con `fc.escluso_acquisti=1` (57 fatture: 28 BANA + 28 CATTANEO + 1 PONTIGGIA)
  3. DELETE di 3 `banca_fatture_link` (movimenti 100, 102, 294) → i bonifici tornano "senza match", Marco li riconcilierà manualmente contro la rata della spesa fissa CG
  4. UPDATE `banca_movimenti.riconciliazione_chiusa=0` per i movimenti impattati se erano stati marcati come fully-linked
  5. DELETE delle 57 `cg_uscite` (backup già salvato). I record in `fe_fatture` NON vengono toccati (restano per tab Warning/audit)
  - Idempotente: su rilancio, se non trova fatture di fornitori esclusi termina in no-op
- **Filtro generatore `controllo_gestione_router.py` (riga 447)** — `import_fatture_cg()` ora fa LEFT JOIN su `fe_fornitore_categoria` con pattern standard (match per piva o per nome quando piva vuota) e aggiunge `COALESCE(fc_cat.escluso_acquisti, 0) = 0` al WHERE. Senza questo, al primo sync FIC post-mig 063 le 57 cg_uscite si sarebbero ricreate
- **Filtro scadenzario `controllo_gestione_router.py` (`GET /uscite`)** — nuovo param `includi_escluse` (default `false`), nuovo LEFT JOIN a `fe_fornitore_categoria` con stesso pattern, clausola `(:includi_escluse = 1 OR u.fattura_id IS NULL OR COALESCE(fc_cat.escluso_acquisti, 0) = 0)`. La `u.fattura_id IS NULL` lascia passare le cg_uscite di tipo SPESA_FISSA (che non hanno fattura né fornitore flaggato)
- **Filtro matcher `banca_router.py` (4 query)** — le 4 query che propongono fatture come possibili match (match-per-nome, match-per-importo, search-importo, search-testo) ora hanno lo stesso LEFT JOIN + `COALESCE(fc_cat.escluso_acquisti, 0) = 0`. Così il matcher non ripropone più le fatture escluse come possibili match per bonifici d'affitto
- **Frontend `ControlloGestioneUscite.jsx`** — nuovo stato `includiEscluse`, nuovo toggle ambra "Mostra escluse" nella sidebar Filtri speciali sotto "Mostra rateizzate", passato come query param a `fetchData`, incluso in `activeFilters` e `clearFilters`. Tooltip esplicativo spiega che il filtro serve a evitare doppio conteggio con le spese fisse CG
- **Risultato:** scadenzario uscite pulito (solo 1 riga AFFITTO per ogni mese), matcher banca non ripropone più fatture escluse, 3 bonifici "senza match" pronti per riconciliazione manuale contro le rate spese fisse corrispondenti

#### C1 — Bottone WhatsApp per condividere cedolino (Dipendenti) — v2.2-buste-paga
- **Backend `dipendenti.py`** — `GET /buste-paga` ora include `d.telefono` nel SELECT, così il frontend ha il numero senza round-trip aggiuntivo
- **Frontend `DipendentiBustePaga.jsx`** — bottone "WA" emerald nella colonna Azioni accanto al bottone ✕. Al click: (1) normalizza il numero (strip spazi/+, aggiunge prefisso 39 ai cellulari italiani che iniziano con 3 o 0); (2) scarica il PDF in locale con nome `bustapaga_cognome_nome_YYYY-MM.pdf` (se `pdf_path` presente); (3) apre `https://wa.me/{num}?text=Ciao {nome}, ecco la tua busta paga di {mese}/{anno}. Netto: € X. Il PDF è stato scaricato sul mio PC, te lo allego qui.`
- Il bottone è disabilitato in grigio se `telefono` è vuoto, con tooltip esplicativo
- **Nota:** non esiste un modo via URL di allegare automaticamente il file — l'utente trascina il PDF scaricato nel thread WA aperto. L'unica alternativa sarebbe WhatsApp Business API (fuori scope)

#### C2 — Buste paga in tab Documenti anagrafica (Dipendenti) — bug endpoint 500
- **Causa reale:** l'endpoint `GET /dipendenti/{id}/documenti` (introdotto in sessione 18) faceva correttamente la UNION `dipendenti_allegati` + `buste_paga.pdf_path NOT NULL`, ma al momento di formattare il mese del cedolino chiamava `MESI_IT.get(c["mese"], ...)` — `MESI_IT` è definita come **lista** `["", "Gennaio", …]`, non dict. Appena incontrava un cedolino l'endpoint lanciava `AttributeError: 'list' object has no attribute 'get'`, FastAPI lo trasformava in HTTP 500, il frontend nel try/catch cadeva in `setDocs([])` → tab Documenti vuota per chi aveva cedolini
- **Perché non era emerso prima:** era invisibile per i dipendenti senza cedolini con `pdf_path` (loop non entrava mai) o senza allegati manuali (lista vuota coerente con "non ho mai caricato nulla"). Marco ricadeva esattamente nel secondo caso
- **Fix (1 riga)** in `dipendenti.py`:
  ```python
  # prima: MESI_IT.get(c["mese"], str(c["mese"])) if c["mese"] else "?"
  mese_idx = c.get("mese") or 0
  mese_label = MESI_IT[mese_idx] if 1 <= mese_idx <= 12 else "?"
  ```
- **Verifica:** simulata la query lato DB col nuovo codice — per Marco Carminati (id=1) vengono correttamente generati `Cedolino Gennaio/Febbraio/Marzo 2026`
- **Lesson learned (importante):** alla prima passata avevo chiuso C2 come "feature già esistente" basandomi solo sulla lettura del codice e sul contenuto DB, senza testare end-to-end il percorso frontend→API→render. Fidarsi del codice senza eseguirlo è stato un errore che avrebbe potuto ripetersi. Da ora, per bug "la schermata è vuota" il primo passo è sempre il replay dell'endpoint, non la code review

#### B1 — Reset ruoli/permessi dopo push (Sistema)
- **Causa:** `app/data/modules.json` era tracciato in git con una nota nel `.gitignore` che diceva esplicitamente _"non contiene dati sensibili, solo config moduli"_. Quando Marco modificava ruoli/permessi in produzione, il backend salvava in `modules.json` sul VPS (corretto). Ma al primo `push.sh` successivo, il post-receive hook faceva `git checkout` del working dir **sovrascrivendo `modules.json` runtime con il seed hardcoded in git**. I ruoli si ripristinavano in modo imprevedibile, sempre in coincidenza con un push di codice non correlato
- **Fix seed/runtime split in `modules_router.py`**: `modules.json` resta tracciato in git ma ora ha il ruolo di **seed** (default ruoli al primo deploy). Lo stato effettivo vive in `modules.runtime.json`, creato al primo `_load()` copiando il seed. `_save()` scrive sempre sul runtime, il seed non viene mai toccato dal backend
- **`.gitignore`** — aggiunto `app/data/modules.runtime.json` così il file runtime sopravvive ai deploy. Commento esplicito sulla ragione del design
- **Zero-break deploy:** al primo restart dopo il fix, `_load()` bootstrap-a il runtime dal seed attuale. Ruoli identici a prima del fix, poi modifiche stabili
- **Nota recupero:** le modifiche runtime che Marco aveva fatto in passato e che sono state sovrascritte dai push precedenti **non sono recuperabili**. Marco dovrà reimpostare i permessi una volta dopo il primo deploy col fix
- **Perché `users.json` non aveva il problema:** era già gitignored. Solo `modules.json` era tracciato

#### File toccati
- **Migrazioni**: 058, 059, 060, 061, 062, 063 (6 nuove)
- **Backend**: `banca_router.py`, `dipendenti.py`, `modules_router.py`, `fattureincloud_router.py`, `controllo_gestione_router.py`
- **Frontend**: `BancaCrossRef.jsx` v5.0→v5.1, `DipendentiBustePaga.jsx` v2.1→v2.2, `FattureInCloud.jsx` v1.0→v1.1, `ControlloGestioneUscite.jsx` (toggle escluse), `versions.jsx`
- **Config/docs**: `.gitignore`, `docs/problemi.md`, `docs/changelog.md`, `docs/sessione.md`

---

## 2026-04-10 (notte tardi) — Scadenzario CG v2.1c: rewrite sidebar sinistra + fix +x idempotente in push.sh

#### UX — sidebar sinistra Scadenzario ottimizzata (ControlloGestioneUscite.jsx)
- **Problemi della vecchia sidebar** — 7 palette diverse alternate nei blocchi filtro (white/sky/indigo/purple/indigo/amber/violet/neutral) creavano rumore visivo senza aggiungere informazione; filtri impilati verticalmente sprecavano spazio (Stato: 4 bottoni full-width = ~112px, Tipo: 3 bottoni full-width); i pulsanti Pulisci/Aggiorna erano dentro il flusso scrollabile invece che in un footer fisso, quindi sparivano appena si scorreva
- **Nuova struttura flat in 240px** — outer `flex flex-col` con body `flex-1 overflow-y-auto` e footer `flex-shrink-0` sticky. Una sola palette neutra (white + neutral-100 bordi) con accenti semantici **solo** dove il colore veicola informazione (stato fatture: amber/red/emerald; viola per riconciliazione; dashed per "Gestisci batch"). Sezioni separate da `border-b border-neutral-100`, header `text-[10px] uppercase tracking-wider text-neutral-500`
- **Stato in griglia 2×2** — `grid grid-cols-2 gap-1.5` con i 4 bottoni (Tutti, Da pagare, Scadute, Pagate) che in stato attivo assumono il colore semantico del proprio stato: Tutti → `bg-neutral-800 text-white`, Da pagare → `bg-amber-100 text-amber-900 border-amber-300`, Scadute → `bg-red-100 text-red-900 border-red-300`, Pagate → `bg-emerald-100 text-emerald-900 border-emerald-300`. Inattivi tutti `bg-white border-neutral-200`
- **Tipo come segment control** — `flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5` con i 3 pill (Tutti, Fatture, Cassa) in orizzontale, pill attivo `bg-white shadow-sm text-neutral-900`, inattivo `text-neutral-600 hover:text-neutral-900`. Molto più compatto e allineato al pattern iOS/Notion
- **Periodo preset in 3 colonne** — `grid grid-cols-3 gap-1` con 6 bottoni (7gg, 30gg, Mese, Mese prox, Trim, Anno), active `bg-amber-100 border-amber-300 text-amber-900`. Sotto, Da/A in una `flex gap-1.5` inline (prima erano due `<input date>` impilati in verticale con label full-width)
- **Filtri speciali fusi in un unico blocco** — "Rateizzate" e "Solo in pagamento" sono diventati due toggle riga con dot-indicator (`w-1.5 h-1.5 rounded-full bg-violet-500` / `bg-sky-500` quando attivi, `bg-neutral-300` quando off). Il bottone "Gestisci batch" è un `border-dashed border-neutral-300` che si integra nello stesso blocco senza creare una quarta sezione separata. La "Riconciliazione attiva" quando presente diventa un badge viola compatto sotto
- **Footer sticky** — `flex gap-1.5 p-2 border-t border-neutral-200 bg-neutral-50 flex-shrink-0` con i due bottoni Pulisci (disabled quando nessun filtro è attivo) e Aggiorna sempre visibili, indipendentemente dallo scroll del body filtri
- **Risultato misurato** — prima della rewrite la sidebar richiedeva scroll già con 4-5 filtri aperti; ora il contenuto standard (senza riconciliazione attiva) sta tutto nel viewport a partire da altezze monitor 900px+, e gli action button sono sempre raggiungibili senza cercarli

#### DX — fix bit +x idempotente dentro push.sh
- **Nuovo step in `push.sh` tra "Sync DB" e "Commit"** — "Verifica bit +x script critici" che itera un array `EXEC_SCRIPTS=("scripts/backup_db.sh" "push.sh")`, legge il mode da `git ls-files --stage`, e se non è `100755` esegue `git update-index --chmod=+x -- "$s"` + `chmod +x` locale e warn. Se tutto è già OK emette un ok silenzioso `"tutti gli script eseguibili hanno già 100755"`
- **Perché** — l'incident backup di stanotte è stato causato proprio dalla perdita del bit `+x` su `scripts/backup_db.sh` dopo un push precedente (git non sempre preserva la mode bit se il file viene riscritto da strumenti che la perdono). Inserire il check dentro push.sh significa che a ogni push in futuro il mode viene verificato e, se serve, forzato in automatico nel commit stesso → impossibile rilasciare una versione con lo script non eseguibile senza rendersene conto (il warn finisce nell'output del push)
- **Idempotente** — quando i mode sono già corretti lo step non fa nulla (nessun ALTER al repo), quindi non crea commit vuoti né modifica la durata del push nel caso normale

#### Versioning
- **`versions.jsx`** — bumped `controlloGestione` da v2.1b a **v2.1c** (rewrite sidebar Scadenzario, nessuna nuova feature funzionale ma UX significativamente migliorata)

---

## 2026-04-10 (notte) — Dettaglio Fornitore v3.2: sidebar colorata + FattureDettaglio inline unificato

#### Refactor grafico — FornitoreDetailView allineato a FattureDettaglio / SchedaVino
- **Nuovo layout due colonne** (`grid-cols-1 lg:grid-cols-[300px_1fr]`) con sidebar colorata a sinistra e area principale a destra, stesso pattern già in uso in `FattureDettaglio` e `SchedaVino`. La top bar con pulsante "Torna alla lista" e "Nascondi da acquisti / Ripristina" rimane sopra, fuori dalla griglia, su sfondo bianco
- **Sidebar colorata con stato semantico** — gradiente teal (ATTIVO, default), amber (IN SOSPESO, quando `nDaPagare > 0`), slate (ESCLUSO, quando `fornitore_escluso = 1`). Costante `FORNITORE_SIDEBAR` + helper `getFornitoreSidebar(isExcluded, nDaPagare)` scelgono la palette. Dentro la sidebar: header con nome + P.IVA + C.F. + badge stato, box totale spesa grande, 4 KPI compatti (imponibile, media fatture, prodotti, pagate/totale), box "Da pagare" evidenziato in rosso se ci sono fatture scadute, info list (primo/ultimo acquisto), sede anagrafica completa, breakdown distribuzione categorie (prime 6), ID tecnico in basso
- **`SectionHeader` uniforme** — local helper con sfondo `neutral-50` + border-bottom + titolo uppercase `text-[10px] tracking-wider`, usato per "Categoria generica fornitore" e "Condizioni di pagamento" a delimitare le sezioni dell'area principale

#### Unificazione — dettaglio fattura inline usa FattureDettaglio (niente più codice duplicato)
- **Eliminato `FatturaInlineDetail`** — subcomponente interno di ~130 righe che duplicava il rendering del dettaglio fattura (header, importi, tabella righe) con una sua logica di fetch. Sostituito da `<FattureDettaglio fatturaId={openFatturaId} inline={true} ... />` che riusa il componente canonico già testato, completo di editor scadenza/modalità/IBAN, gestione banca e righe fattura
- **Cleanup state** — rimosse le variabili `fatturaDetail` e `fatturaDetLoading` (ora gestite internamente da `FattureDettaglio`), semplificato `openFattura(id)` a un semplice toggle dell'id (niente più fetch manuale), aggiornati i due handler `onClose` del back-button
- **Sync coerente con la lista fornitore** — `onSegnaPagata` e `onFatturaUpdated` passati a `FattureDettaglio` triggerano `reloadFatture()` + `handleFatturaUpdatedInline()` per mantenere aggiornati sia il badge "Da pagare N" nella sidebar colorata sia la riga nella tabella fatture del fornitore

#### Versioning
- **`versions.jsx`** — bumped `fatture` da v2.2 a **v2.3** (stesso modulo Gestione Acquisti, il dettaglio fornitore vive dentro `FattureFornitoriElenco.jsx`). File header aggiornato a `@version: v3.2-fornitore-sidebar-colorata`

---

## 2026-04-10 (notte) — Sistema Backup: fix permessi + router rifatto + banner warning età

#### Incident — backup fermo da 12 giorni senza che nessuno se ne accorgesse
- **Causa** — lo script `scripts/backup_db.sh` aveva perso il bit eseguibile (quasi certamente dopo un `push.sh` recente: git non sempre preserva `+x` quando riscrive un file già tracciato). Il cron marco continuava a provare a lanciarlo sia alle ore (`--hourly`) sia alle 03:30 (`--daily`) ma fallisce subito con `Permission denied`, senza nemmeno entrare nello script. Ultimo backup hourly riuscito: `20260329_223319` (2026-03-29 22:33, 12 giorni fa). La cartella `app/data/backups/daily/` era completamente vuota
- **Fix immediato** — `ssh trgb "chmod +x /home/marco/trgb/trgb/scripts/backup_db.sh"`. Test di verifica con `--daily` eseguito subito dopo: tutti e 6 i DB backuppati (foodcost 6.5M, admin_finance 324K, vini 788K, vini_magazzino 2.9M, vini_settings 56K, dipendenti 104K), rotazione OK, sync Google Drive OK, cartella `daily/20260410_214042/` creata correttamente

#### Architettura — backup_router.py riscritto per puntare al sistema reale
- **Problema scoperto insieme all'incident** — il modulo `backup_router.py` leggeva da `/home/marco/trgb/backups/*.tar.gz` (Sistema B, residuo di un vecchio `backup.sh` mai più usato dal cron) mentre il cron vero scrive in `/home/marco/trgb/trgb/app/data/backups/daily/YYYYMMDD_HHMMSS/` (Sistema A, via `scripts/backup_db.sh`). Risultato: anche quando il cron funzionava, la UI "Backup giornalieri sul server" non mostrava nulla di recente — da settimane il tab Backup mostrava solo i due file fantasma del 2026-03-20 generati manualmente tempo addietro
- **`backup_router.py` v2** — puntamento riportato su `DATA_DIR / "backups" / "daily"`. Nuova helper `_list_daily_snapshots()` che itera le cartelle `YYYYMMDD_HHMMSS`, le parsa con `datetime.strptime`, calcola la size totale dei file al loro interno e restituisce una lista ordinata (più recente prima). Gli endpoint `/backup/list` e `/backup/info` ora consumano questa helper
- **Download al volo di una cartella come tar.gz** — l'endpoint `GET /backup/download/{filename}` non serve più file tar.gz preesistenti ma confeziona in memoria (`io.BytesIO` + `tarfile.open mode="w:gz"`) la cartella di snapshot richiesta, impacchettando tutti i `.db`/`.sqlite3` al suo interno con i nomi originali. Il file restituito al browser si chiama `trgb-backup-YYYYMMDD_HHMMSS.tar.gz`. Sanity check rinforzato: oltre a bloccare `..` e `/`, il `filename` deve matchare il formato `YYYYMMDD_HHMMSS` (altrimenti 400)
- **Nuovo campo `last_backup_age_hours` in `/backup/info`** — calcolato come `(datetime.now() - timestamp_cartella).total_seconds() / 3600`. È il campo che abilita il banner warning nella UI (vedi sotto)

#### UX — banner warning se l'ultimo backup è troppo vecchio
- **`ImpostazioniSistema.jsx / TabBackup`** — aggiunto un banner in cima al tab che si comporta a 3 livelli: **verde** (≤ 30h, nessun banner — mostrato solo come badge accanto a "Ultimo backup automatico: ..."), **amber** (30-48h, banner giallo "Il backup notturno potrebbe essere stato saltato"), **red** (> 48h o `null`, banner rosso "Nessun backup automatico trovato" oppure "Ultimo backup di N ore fa"). Le due soglie sono calibrate sul cron reale: `--daily` alle 03:30 ogni notte, quindi un gap normale è 24h (massimo 26-27h se l'utente guarda la mattina presto), 30h è già "oggi è stato saltato", 48h è "sistema rotto"
- **Obiettivo** — se il bit `+x` sparisce di nuovo (o qualsiasi altro guasto blocca il cron), Marco vede immediatamente il banner rosso la prossima volta che apre Impostazioni → Backup, invece di accorgersene settimane dopo come questa volta

#### Bug fix — clienti.sqlite3 non veniva backuppato
- **Trovato durante la verifica UI post-fix** — la UI mostrava "6 database" ma in realtà `app/data/` ne contiene 7 (escluso il residuo `vini.db`): mancava `clienti.sqlite3` (modulo Clienti CRM). Il database era **escluso dal backup automatico da sempre** — né `scripts/backup_db.sh` né `backup_router.py` lo elencavano. Ogni prenotazione, ogni contatto CRM, ogni tag cliente era fuori dalla rete di sicurezza
- **Fix** — aggiunto `clienti.sqlite3` all'array `DBS` in `scripts/backup_db.sh` e alla lista `DATABASES` in `backup_router.py`. Dal prossimo cron orario (e certamente dal prossimo `--daily` delle 03:30) il database dei clienti sarà incluso sia nei backup locali che nel sync Google Drive. Il banner "Database attivi" nella UI mostrerà 7 entries

#### Cleanup file orfani
- **Rimosso `backup.sh` dalla root del repo** — era un vecchio script Sistema B che scriveva tar.gz in `/home/marco/trgb/backups/`, superseduto da `scripts/backup_db.sh` da tempo ma mai cancellato. Il cron non lo chiamava più da mesi
- **`setup-backup-and-security.sh` riscritto** — ora installa le DUE crontab corrette (`backup_db.sh --hourly` ogni ora, `backup_db.sh --daily` alle 03:30) e fa `chmod +x` su `scripts/backup_db.sh` invece che sul vecchio `backup.sh`. Il test di verifica a fine setup lancia `--daily`
- **`docs/deploy.md`, `docs/sessione.md`, `docs/GUIDA-RAPIDA.md`** — tutti i riferimenti a `backup.sh` sostituiti con `scripts/backup_db.sh --daily`. Aggiunta in `deploy.md` e `sessione.md` una nota esplicita sul problema del bit `+x` che può sparire dopo un push, con il comando di fix pronto da copiare. `docs/deploy.md` ora documenta correttamente la struttura `app/data/backups/{hourly,daily}/YYYYMMDD_HHMMSS/` e le retention reali (48h per hourly, 7 giorni per daily)

#### Note operative
- Il banner warning appare solo per gli admin (`/backup/info` ha `_require_admin`). Gli utenti normali non hanno accesso al tab Backup
- Il cron lanciato automaticamente ricomincerà a funzionare già dalla prima ora successiva al fix. Non è stato necessario riavviare niente: `crond` rilegge l'eseguibilità ogni volta che prova a lanciare lo script
- Il sync su Google Drive (`gdrive:TRGB-Backup/db-daily`) tramite rclone è ripartito con successo al primo test manuale, quindi anche la copia off-site è di nuovo allineata a oggi

---

## 2026-04-10 (tardi sera) — Acquisti v2.2: Unificazione dettaglio fattura in un unico componente riutilizzabile

#### Refactor — Fase H (un solo FattureDettaglio per tutti i moduli)
- **Fine dei "due moduli fatture"** — prima di oggi il dettaglio fattura aveva due implementazioni parallele: il componente riutilizzabile `FattureDettaglio` (usato in `/acquisti/dettaglio/:id` e nello split-pane dello Scadenzario), e un `DetailView` locale dentro `FattureElenco.jsx` con stile e campi suoi propri (header card, amounts grid, righe table, bottone "Segna pagata"). Marco ha giustamente notato che la nuova grafica "sidebar colorata + sectionheader" di v2.1b non appariva nel modulo Acquisti → Fatture perché quella vista continuava a usare la vecchia `DetailView`
- **`FattureElenco.jsx` riscritto per usare `FattureDettaglio`** — il componente locale `DetailView` (~130 righe) è stato rimosso completamente. Il ramo "dettaglio aperto" nell'elenco ora renderizza `<FattureDettaglio fatturaId={openId} inline={true} onClose={...} onSegnaPagata={segnaPagata} onFatturaUpdated={(f) => ...}>` con una barra top minimale "← Torna alla lista" e ID fattura. Stato locale semplificato: rimossi `dettaglio` e `detLoading` perché il componente riutilizzabile fa il proprio fetch; resta solo `openId` per il toggle e l'highlight della riga selezionata
- **Nuova prop `onSegnaPagata` in `FattureDettaglio`** — se passata, la sidebar colorata mostra un bottone "✓ Segna pagata" in ambra evidenziato (prima dei link di navigazione) solo quando la fattura non è pagata, non è rateizzata e lo stato uscita non è `PAGATA`. Il componente chiama la callback del parent, poi esegue automaticamente `refetch()` per aggiornare la propria vista. In questo modo la funzionalità "segna pagata manuale" preservata dal vecchio `DetailView` è ora disponibile ovunque venga montato `FattureDettaglio` con la prop
- **Sync bidirezionale lista ⇄ dettaglio** — il callback `onFatturaUpdated(f)` in `FattureElenco` aggiorna la riga corrispondente nella lista locale (`setFatture(prev => prev.map(...))`) così che modifiche fatte nel dettaglio (scadenza, IBAN, modalità, segna-pagata) si riflettono immediatamente nella tabella quando l'utente torna indietro — nessun refetch full necessario
- **`segnaPagata` in `FattureElenco` aggiornata** — non tocca più `setDettaglio` (rimosso); aggiorna solo `setFatture` per la riga lista, e il refresh del dettaglio è delegato all'`await refetch()` interno di `FattureDettaglio.handleSegnaPagata`

#### UX — Fase H (bottone "Modifica anagrafica fornitore")
- **Nuovo pulsante "✎ Modifica anagrafica fornitore →" nella sidebar di `FattureDettaglio`** — sostituisce il vecchio "Tutte le fatture del fornitore →" che puntava a una route (`/acquisti/fornitore/:piva`) che era solo un redirect a `/acquisti/fornitori`. Ora il bottone naviga direttamente a `/acquisti/fornitori?piva=${piva}`, saltando il redirect e permettendo di pre-aprire il fornitore corretto via deep-link
- **Deep-link `?piva=xxx` in `FattureFornitoriElenco`** — nuovo `useEffect` che legge `useSearchParams()`, cerca il fornitore con P.IVA corrispondente nella lista caricata, chiama `openDetail(forn)` per aprire la sidebar inline del dettaglio, e ripulisce il parametro dalla URL (`setSearchParams` con `replace: true`) per evitare loop di riapertura. Un `useRef` tiene traccia dell'ultimo deep-link processato per idempotenza
- **Fallback anno** — se il fornitore non è presente nella lista corrente (può succedere quando l'anno selezionato di default nella sidebar filtri non contiene fatture di quel fornitore), l'effetto azzera `annoSel` che triggera un refetch su tutti gli anni, e al secondo ciclo il fornitore viene trovato e aperto. Se nemmeno senza filtro anno il fornitore esiste, il deep-link viene scartato silenziosamente invece di loopare
- **Comportamento in modalità inline** — quando l'utente clicca il bottone dentro lo split-pane dello Scadenzario, il componente esegue prima `onClose()` per chiudere la scheda inline (evitando che resti "spezzata" in background), poi naviga. Stesso pattern già usato dal link "Vai alla spesa fissa" quando la fattura è rateizzata

#### Versioning
- **Bump** — `fatture: 2.1 → 2.2` in `versions.jsx`. Nessun cambio alla versione di `controlloGestione` (resta 2.1b) perché il refactor di questa fase ha toccato principalmente il modulo Acquisti; lo Scadenzario ha beneficiato indirettamente della nuova prop `onSegnaPagata` ma non la utilizza (la riconciliazione lì passa dal flusso banca)
- **Header file aggiornati** — `FattureDettaglio.jsx: v2.2 → v2.2b-dettaglio-fattura-riutilizzabile`, `FattureElenco.jsx: v3.0 → v3.1-dettaglio-unificato`, `FattureFornitoriElenco.jsx: v3.0 → v3.1-cantina-inline-deeplink`

---

## 2026-04-10 (sera) — Controllo Gestione v2.1b: Dettaglio fattura inline nello Scadenzario con estetica uniforme

#### UX — Fase G (refactor "in-page" + layout uniformato a SchedaVino)
- **`FattureDettaglio.jsx` completamente ridisegnato sul pattern `SchedaVino`** — ora è un `forwardRef` che accetta le props `fatturaId` (override di `useParams`), `inline` (bool), `onClose`, `onFatturaUpdated`. Espone `hasPendingChanges()` al parent tramite `useImperativeHandle` per il prompt di conferma nel cambio fattura. Stesso identico pattern di `SchedaVino` in `MagazzinoVini` — così la logica della scheda resta in un unico posto e viene riutilizzata sia come pagina standalone (`/acquisti/dettaglio/:id`) sia inline nello Scadenzario
- **Layout sidebar colorata + main content** — il dettaglio fattura ora ha lo stesso look & feel della scheda vino: wrapper `rounded-2xl shadow-lg` (inline) / `rounded-3xl shadow-2xl` (standalone), grid `[280px_1fr]`, altezza `78vh` inline / `88vh` standalone. Sidebar sinistra colorata in gradient con colori che riflettono lo stato della fattura (emerald=PAGATA, amber=DA_PAGARE, red=SCADUTA, teal=PAGATA_MANUALE, blue=PARZIALE, purple=RATEIZZATA, slate=default). Nella sidebar: header con fornitore grande, P.IVA mono, badge "FT numero" + data, stats card "Totale" in evidenza + mini-stats Imponibile/IVA, badge stato/rateizzata/batch, info list dense (scadenza eff., scadenza XML se override, mod. pagamento + label, pagata il, metodo, importato il, ID), IBAN full-width mono, link "Tutte le fatture del fornitore" + Chiudi
- **Main content a destra con `SectionHeader`** — uniformato a `SchedaVino`, due section header fisse stile grigio-neutro: "Pagamenti & Scadenze" (con badge stato/rateizzata/batch a destra, banner viola se rateizzata, 3 tile editabili inline per scadenza/modalità/IBAN + riga info pagamento/riconciliazione) e "Righe fattura (N)" (tabella righe + footer totale). Tutto il comportamento editing (save via dispatcher B.2/B.3, toast, conferma dirty state) invariato rispetto a v2.0b
- **Split-pane inline nello Scadenzario Uscite** — click su una riga FATTURA non fa più `navigate` a `/acquisti/dettaglio/:id` ma imposta `openFatturaId` locale: la lista viene sostituita dal componente `FattureDettaglio` inline (`inline={true}`) con barra di navigazione sky-50 sopra la scheda, bottoni "← Lista", prev/next `‹ ›`, contatore `N/total` e indicatore "Fattura #ID". La sidebar sinistra dello Scadenzario (filtri, KPI) rimane invariata e visibile, esattamente come in `MagazzinoVini`
- **Navigazione prev/next** — i bottoni `‹ ›` scorrono solo tra le righe FATTURA con `fattura_id` della lista filtrata corrente, rispettando filtri, ordinamento e toggle "Mostra rateizzate". Se l'utente ha modifiche pendenti nella scheda aperta (editing di scadenza/IBAN/MP), viene richiesta conferma prima di cambiare fattura
- **Refresh lista al close** — chiudendo la scheda (bottone "← Lista" o `onClose`), viene lanciato `fetchData(false)` per riflettere nella lista le modifiche appena salvate (scadenza/IBAN/MP via dispatcher B.2/B.3)
- **Route standalone invariata** — `/acquisti/dettaglio/:id` continua a funzionare esattamente come prima per i link diretti e le altre entry points (es. click da elenco fatture, da fornitore), perché `FattureDettaglio` preserva il fallback `useParams` quando non riceve la prop `fatturaId`
- **Bump versione** — `controlloGestione: 2.0b → 2.1b`

## 2026-04-10 — Controllo Gestione v2.0b: Query /uscite come vista aggregatore su fe_fatture

#### New — Fase B.1 del refactoring v2.0 "CG come aggregatore"
- **`GET /controllo-gestione/uscite` riscritto** — la query non seleziona più solo da `cg_uscite`, ma fa LEFT JOIN con `fe_fatture` e legge da lì i campi di pianificazione finanziaria introdotti dalla mig 056 (`data_prevista_pagamento`, `data_effettiva_pagamento`, `modalita_pagamento_override`, `iban_beneficiario`). Per le righe FATTURA, la "verità" viene da `fe_fatture`; `cg_uscite` resta indice di workflow
- **Campi derivati COALESCE** — il backend calcola tre fallback chain direttamente in SQL:
  - `data_scadenza_effettiva` = effettiva → prevista → `u.data_scadenza` (modifiche pre-v2.0) → `f.data_scadenza` (XML analitico)
  - `modalita_pagamento_effettiva` = override utente → XML → default fornitore
  - `iban_beneficiario_effettivo` = IBAN fattura → IBAN spesa fissa → IBAN fornitore
- **Stato normalizzato nel SELECT** — un `CASE` rimappa lo stato in `RATEIZZATA`/`PAGATA` quando `fe_fatture.rateizzata_in_spesa_fissa_id` è valorizzato o `f.data_effettiva_pagamento` è settato, anche se `cg_uscite` non è ancora allineata
- **Filtro `includi_rateizzate` (default: False)** — nuovo query param che di default nasconde le 43 fatture backfilled dalla migrazione 057. Le rateizzate non appaiono più nello Scadenzario e non confluiscono nei totali di riepilogo, restituendo totali corretti al netto delle duplicazioni logiche
- **Binding nominale** — tutti i filtri dinamici ora passano parametri a nome (`:includi_rateizzate`, `:stato`, ecc.) — SQLite non permette alias del SELECT nella WHERE, quindi il COALESCE per le date nel range è duplicato (costo trascurabile)
- **Retrocompatibilità piena** — `row["data_scadenza"]` rimpiazza `data_scadenza_effettiva` via `pop()` lato Python, così la shape del payload JSON è identica a v1.7 e il frontend non richiede modifiche

#### UI — Fase B.1.1 (toggle sidebar rateizzate)
- **Nuovo blocco "Rateizzate" nella sidebar dello Scadenzario Uscite** — toggle viola "Mostra rateizzate" (default OFF). Quando attivo, la fetch passa `?includi_rateizzate=true` al backend e le 43 fatture backfilled tornano visibili in lista
- **Sfondo viola leggero** (`bg-purple-50/40`) sulle righe con stato `RATEIZZATA` + badge permanente "Rateizzata" nella colonna STATO (via `STATO_STYLE.RATEIZZATA`)
- **clearFilters + conteggio activeFilters** aggiornati per includere il nuovo toggle

#### New — Fase B.2 (smart dispatcher modifica scadenza)
- **`PUT /controllo-gestione/uscite/{id}/scadenza` riscritto come dispatcher v2.0** — in base al tipo di uscita la nuova scadenza viene scritta sulla fonte di verità corretta:
  - **FATTURA con `fattura_id`** → scrive su `fe_fatture.data_prevista_pagamento` (nuovo campo introdotto con mig 056). `cg_uscite.data_scadenza` NON viene toccata: la query di lettura la recupera via COALESCE chain preferendo il campo v2.0
  - **Spese fisse / manuali / bancarie** → comportamento legacy su `cg_uscite.data_scadenza` (+ tracciamento `data_scadenza_originale` via COALESCE idempotente)
- **Calcolo delta "originale"** — per le fatture v2.0 il delta giorni viene calcolato rispetto a `fe_fatture.data_scadenza` (XML analitico), non rispetto a `cg_uscite.data_scadenza_originale`: questo perché il primo override su una fattura v2.0 non sporca più cg_uscite, quindi l'XML è l'unica baseline semanticamente corretta
- **Stato workflow ricalcolato in entrambi i rami** — SCADUTA ↔ DA_PAGARE in base a nuova vs oggi, su `cg_uscite.stato` (resta indice di workflow anche per le fatture v2.0)
- **Risposta arricchita** — il payload include `fonte_modifica` (`fe_fatture.data_prevista_pagamento` o `cg_uscite.data_scadenza`) per tracciamento/debug del dispatcher
- **Frontend `apriModaleScadenza`** — inietta una `data_scadenza_originale` semanticamente corretta nel modale: per fatture v2.0 usa `u.data_scadenza_xml` (esposto dal GET /uscite), per le altre resta `u.data_scadenza_originale`
- **Nota `cg_piano_rate`** — non ha colonna `data_scadenza`; per le rate delle spese fisse la scadenza effettiva continua a vivere in `cg_uscite`, quindi il dispatcher resta a 2 rami (non 3 come inizialmente previsto in roadmap)

#### New — Fase B.3 (smart dispatcher IBAN + modalità pagamento)
- **`PUT /controllo-gestione/uscite/{id}/iban`** — nuovo endpoint dispatcher:
  - **FATTURA con `fattura_id`** → `fe_fatture.iban_beneficiario` (campo v2.0 della mig 056)
  - **SPESA_FISSA con `spesa_fissa_id`** → `cg_spese_fisse.iban` (campo nativo)
  - **STIPENDIO / ALTRO / SPESA_BANCARIA** → 422 non supportato (non esiste una fonte stabile dove persistere un override IBAN per questi tipi; vanno editati alla sorgente)
  - IBAN normalizzato (upper, strip, no spazi); `null` o stringa vuota puliscono l'override
- **`PUT /controllo-gestione/uscite/{id}/modalita-pagamento`** — nuovo endpoint dispatcher:
  - **FATTURA con `fattura_id`** → `fe_fatture.modalita_pagamento_override` (il campo XML originale `f.modalita_pagamento` resta intoccato; l'override vince nella COALESCE chain del GET /uscite)
  - **Altri tipi** → 422 non supportato (per le spese fisse la modalità è implicita; stipendi/altri non hanno concetto di codice SEPA MP)
  - Codice MP normalizzato (upper, strip); `null` pulisce l'override e la UI tornerà a mostrare XML/fornitore
  - Risposta include `modalita_pagamento_label` via `MP_LABELS` per consumo diretto da frontend
- **Pattern `fonte_modifica` in risposta** — entrambi gli endpoint ritornano `fonte_modifica` (es. `fe_fatture.iban_beneficiario`) per tracciamento/debug del dispatcher v2.0, stesso contratto di B.2
- **Niente UI in questa fase** — gli endpoint restano "dormienti" fino a Fase D, dove FattureDettaglio arricchito fornirà l'interfaccia utente per override IBAN/modalità. La frontend UX è intenzionalmente rimandata per non sovrapporsi con il modale attuale dello Scadenzario

#### New — Fase D (FattureDettaglio arricchito)
- **`GET /contabilita/fe/fatture/{id}` esteso** — il payload ora include tutti i campi v2.0: `data_scadenza_xml` (alias da `f.data_scadenza`), `modalita_pagamento_xml`, `condizioni_pagamento`, `data_prevista_pagamento`, `data_effettiva_pagamento`, `iban_beneficiario`, `modalita_pagamento_override`, `rateizzata_in_spesa_fissa_id`. JOIN con `suppliers` e `cg_spese_fisse` per esporre anche `iban_fornitore`, `mp_fornitore`, `rateizzata_sf_titolo`, `rateizzata_sf_iban`
- **COALESCE chain Python-side** — il backend espone tre campi pre-calcolati per consumo diretto da frontend: `data_scadenza_effettiva`, `modalita_pagamento_effettiva`, `iban_effettivo` (stessa semantica della query /uscite)
- **Sub-oggetto `uscita`** — query secondaria su `cg_uscite` (+ JOIN `cg_pagamenti_batch`) che ritorna la riga di workflow collegata alla fattura: stato, importo pagato, data pagamento, metodo, batch in cui è infilata, flag riconciliata. Il frontend usa questo per decidere se mostrare azioni di modifica (bloccate su stato PAGATA)
- **Flag derivato `is_rateizzata`** — booleano pronto per UI, evita ricontrollare `rateizzata_in_spesa_fissa_id IS NOT NULL` lato client
- **FattureDettaglio.jsx — nuova card "Pagamenti & Scadenze"** (viola se rateizzata, bianca altrimenti) inserita tra header e righe fattura con:
  - Badge stato uscita (`DA_PAGARE`/`SCADUTA`/`PAGATA`/`PAGATA_MANUALE`/`PARZIALE`/`RATEIZZATA`) e badge "In batch: ..." se appartiene a un batch di pagamento
  - Banner rateizzata con link alla spesa fissa target: "Questa fattura è stata rateizzata nella spesa fissa X. Le uscite effettive vivono nel piano rate" → bottone "Vai alla spesa fissa"
  - **Tre tile editabili** (Scadenza, Modalità, IBAN) con flag "override" quando divergono dal valore XML/fornitore, valore XML o fornitore mostrato sotto come riferimento. Il click su "Modifica" apre inline edit → chiama rispettivamente `PUT /controllo-gestione/uscite/{id}/scadenza` (B.2), `.../modalita-pagamento` (B.3) e `.../iban` (B.3)
  - Dropdown modalità pagamento pre-popolato con i codici SEPA più comuni (MP01, MP02, MP05, MP08, MP12, MP19, MP23)
  - Input IBAN con auto-uppercase e strip spazi lato client (stessa normalizzazione del backend)
  - Modifica bloccata quando la fattura è `RATEIZZATA` (l'override sulla fattura non ha effetto sulle rate) o `PAGATA` (già riconciliata)
  - Footer con info pagamento effettivo se presente: data, metodo, flag "Riconciliata con banca"
- **Breadcrumb `?from=scadenzario`** — quando presente in querystring, il bottone "Torna indietro" diventa "Torna allo Scadenzario" e naviga a `/controllo-gestione/uscite` invece di `history.back()`. Setup per Fase E
- **Toast feedback** — notifiche emerald/red dopo ogni save, auto-dismiss 3s
- **Bumpata la version string del file** da `v1.0-dettaglio-fattura` a `v2.0-dettaglio-fattura`

#### New — Fase E (Scadenzario click-through)
- **`handleRowClick` intelligente nello Scadenzario Uscite** — il click su una riga ora dispatcha in base al tipo di uscita:
  - **FATTURA con `fattura_id`** → naviga a `/acquisti/dettaglio/{fattura_id}?from=scadenzario` (apre FattureDettaglio arricchito della Fase D)
  - **Riga `RATEIZZATA` con `fattura_id`** → stessa destinazione (la card in FattureDettaglio mostra poi il banner viola con link alla spesa fissa target)
  - **SPESA_FISSA / rata con `spesa_fissa_id`** → naviga a `/controllo-gestione/spese-fisse?highlight={id}&from=scadenzario`
  - **STIPENDIO / ALTRO / SPESA_BANCARIA / fatture orfane senza collegamento** → comportamento legacy: apre il modale modifica scadenza
- **Tooltip dinamico** — l'attributo `title` della `<tr>` cambia in base al tipo (es. "Clicca per aprire il dettaglio fattura" vs "Clicca per modificare la scadenza") così Marco capisce cosa succede prima di cliccare
- **`ControlloGestioneSpeseFisse.jsx` supporta `?highlight=<id>&from=scadenzario`** — quando la querystring è presente:
  - La riga con `id === highlight` è evidenziata con `bg-amber-100 ring-2 ring-amber-400 animate-pulse`
  - `scrollIntoView({ behavior: 'smooth', block: 'center' })` centra la riga nel viewport al mount
  - Dopo 4s il param `highlight` viene rimosso dall'URL (`setSearchParams` in replace mode) così un reload non ri-triggera l'animazione
  - Bottone "← Torna allo Scadenzario" (teal) nel header quando `from=scadenzario`, in aggiunta al bottone "← Menu" standard
- **`useSearchParams` aggiunto a SpeseFisse** — prima non era importato. `useRef` aggiunto per il ref della riga evidenziata (scroll target)
- **`MODULE_VERSIONS.fatture` bumpato da 2.0 a 2.1** per riflettere l'arrivo della card Pagamenti & Scadenze in FattureDettaglio

#### Note architetturali v2.0
- Riferimento: `docs/v2.0-query-uscite.sql` (design SQL con benchmark) e `docs/v2.0-roadmap.md` (Fase A → F)
- Fatto: Fase A (mig 057 backfill 43/43) + B.1 (query aggregatore) + B.1.1 (toggle sidebar rateizzate) + B.2 (dispatcher scadenza) + B.3 (dispatcher IBAN/modalità) + D (FattureDettaglio arricchito) + E (Scadenzario click-through). **Pianificata: F (cleanup docs finale, sessione.md)**

## 2026-04-10 — Controllo Gestione v1.7: Batch pagamenti + stampa intelligente

#### New — Batch di pagamento per stampa e workflow contabile
- **Selezione multipla + stampa** — nello Scadenzario Uscite seleziona più righe e clicca "Stampa / Metti in pagamento": crea un batch tracciato e apre una stampa A4 pulita con fornitore, descrizione, IBAN, importo, totale, caselle OK e firme
- **Migrazione 053** — nuova tabella `cg_pagamenti_batch` (titolo, note, n_uscite, totale, stato, timestamp) + colonne `cg_uscite.pagamento_batch_id` e `cg_uscite.in_pagamento_at` con indici
- **Stati batch** — `IN_PAGAMENTO` → `INVIATO_CONTABILE` → `CHIUSO` (predisposto per la futura dashboard contabile)
- **Backend endpoint** — `POST /uscite/batch-pagamento`, `GET /pagamenti-batch`, `GET /pagamenti-batch/{id}`, `PUT /pagamenti-batch/{id}` (cambio stato), `DELETE /pagamenti-batch/{id}` (scollega le uscite)
- **Badge "In pagamento"** — le righe flaggate mostrano il badge indigo con tooltip titolo batch; riga evidenziata con sfondo indigo leggero
- **Filtro sidebar "Solo in pagamento"** — quick filter per vedere solo le uscite appartenenti a un batch attivo, con contatore
- **Template stampa A4** — header Osteria Tre Gobbi, meta batch, tabella con righe alternate, totale evidenziato, area firme "preparato da / eseguito da". Auto-print dalla nuova finestra con bottoni Stampa/Chiudi

## 2026-04-10 — Controllo Gestione v1.6: Avanzamento piano + ricerca multi-fattura

#### Fix — Scadenzario Uscite: ordinamento per data coerente per stato
- **Reset automatico al cambio tab** — selezionando "Da pagare" o "Scadute" l'ordinamento torna su `data_scadenza ASC` (le più vecchie/urgenti prima); su "Pagate" va `DESC` (le più recenti prima). Prima un click accidentale sulla colonna lasciava lo sort invertito e aprile compariva prima di marzo nella tab Scadute

#### Fix — Rateizzazione: genera subito anche le uscite
- **POST `/spese-fisse` con piano_rate** — oltre a inserire `cg_piano_rate`, crea contestualmente le righe `cg_uscite` con stato `DA_PAGARE` (o `SCADUTA` se la data scadenza è già passata), usando il `giorno_scadenza` clampato al massimo del mese. Prima le uscite comparivano solo dopo aver cliccato "Import uscite", e l'aggregato pagato/residuo restava vuoto per le rateizzazioni appena create
- **Migrazione 052** — backfill: per le rateizzazioni/prestiti già esistenti con `cg_piano_rate` popolato ma senza `cg_uscite`, crea le uscite mancanti così il riepilogo pagato/residuo diventa disponibile anche retroattivamente
- **UI colonna Importo** — la condizione che mostra "Pagato/Residuo" ora si basa su `n_rate_totali > 0` oltre che sui totali, così il blocco appare anche per rateizzazioni con totale pagato ancora a zero

#### New — Avanzamento pagato / residuo in tabella Spese Fisse
- **GET `/spese-fisse` arricchito** — ritorna `totale_pagato`, `totale_residuo`, `n_rate_totali`, `n_rate_pagate`, `n_rate_da_pagare`, `n_rate_scadute` aggregati da `cg_uscite` per ogni spesa fissa
- **UI colonna Importo** — per PRESTITO e RATEIZZAZIONE mostra sotto l'importo di riferimento le righe "Pagato € X · (n/tot)" e "Residuo € Y · scadute" con mini progress bar verde

#### New — Ricerca fatture + multi-selezione nel wizard Rateizzazione
- **Campo ricerca** — ricerca solida multi-token (accenti/spazi ignorati) su fornitore, numero fattura, data, anno, importo
- **Multi-select** — checkbox per selezionare più fatture e rateizzarle insieme (sum dei totali, titolo auto-generato in base al numero di fornitori unici)
- **Seleziona tutte visibili** — azione rapida per togglare tutte le fatture filtrate
- **Riepilogo selezione** — contatore fatture selezionate e totale cumulativo sempre visibile

---

## 2026-04-10 — Controllo Gestione v1.5: Piano rate prestiti

#### New — Piano di ammortamento visualizzabile per prestiti e rateizzazioni
- **Modale Piano rate** — pulsante "Piano" sulle righe di tipo PRESTITO / RATEIZZAZIONE apre una tabella con tutte le rate (numero, periodo, scadenza, importo pianificato, importo pagato, stato)
- **Riepilogo KPI** — rate totali / pagate / da pagare / scadute, totale pagato, totale residuo
- **Edit inline** — importi editabili per le rate non ancora pagate (rate PAGATA / PARZIALE sono in sola lettura)
- **Sync automatico** — il salvataggio aggiorna anche `cg_uscite.totale` per le righe non pagate, così il tabellone uscite riflette i nuovi importi
- **"Adegua" nascosto per prestiti** — sostituito da "Piano": per AFFITTO / ASSICURAZIONE resta l'adeguamento ISTAT classico

#### Backend — endpoint piano-rate arricchito
- **GET `/spese-fisse/{id}/piano-rate`** — ora ritorna `spesa` (meta), `rate` (con LEFT JOIN `cg_uscite` per stato, scadenza, importo pagato), e `riepilogo` aggregato
- **POST `/spese-fisse/{id}/piano-rate`** — nuovo parametro `sync_uscite` (default `true`): propaga l'importo modificato sulle uscite non ancora pagate

---

## 2026-04-06 — Gestione Clienti v2.0: CRM completo con marketing, coppie, impostazioni

#### New — Segmenti marketing configurabili
- **Soglie dinamiche** — abituale/occasionale/nuovo/perso configurabili da UI (tabella `clienti_impostazioni`)
- **Pagina Impostazioni** — nuova sezione con sidebar: Segmenti, Import/Export, Duplicati, Mailchimp
- **Preview regole** — visualizzazione in tempo reale delle regole segmento con le soglie impostate

#### New — Coppie (nome2/cognome2)
- **Campi coppia** — `nome2`, `cognome2` in DB, modello Pydantic, PUT endpoint, tab Anagrafica
- **Header coppia** — mostra "Marco & Laura Rossi" o "Marco & Laura Rossi / Bianchi" in scheda e lista
- **Merge come coppia** — checkbox "Salva come coppia" sia nella scheda (merge manuale) che nella pagina duplicati
- **Ricerca** — nome2/cognome2 inclusi nella ricerca fulltext clienti e prenotazioni
- **Template WA** — supporto variabile `{nome2}` nei messaggi WhatsApp personalizzati

#### New — WhatsApp Opzione A
- **Broadcast personalizzato** — pannello WA nella lista con template `{nome}/{cognome}/{nome2}`, link wa.me individuali
- **Filtro destinatari** — solo clienti filtrati con telefono valido

#### New — Integrazione Mailchimp (Fase 1+2)
- **Backend** — `mailchimp_service.py` con stdlib urllib, merge fields custom (PHONE, BIRTHDAY, CITTA, RANK, SEGMENTO, ALLERGIE, PREFCIBO)
- **Sync contatti** — upsert con tags CRM + segmento + VIP + rank
- **Pagina Mailchimp** — stato connessione, pulsante sync, KPI risultati, guida configurazione

#### New — Pulizia dati
- **Filtro telefoni placeholder** — numeri finti TheFork (`+39000...`) esclusi automaticamente da duplicati e import
- **Endpoint pulizia telefoni** — `POST /pulizia/telefoni-placeholder` svuota numeri finti dal DB
- **Normalizzazione testi** — `POST /pulizia/normalizza-testi` converte CAPS/minuscolo in Title Case (nomi, cognomi, città)
- **Pulsanti UI** — "Pulisci tel. finti" e "Normalizza testi" nella pagina Duplicati

#### New — Auto-merge duplicati ovvi
- **Preview** — analisi automatica gruppi con stesso telefono+cognome o email+cognome
- **Batch merge** — conferma unica per tutti i gruppi ovvi, scelta principale automatica (più prenotazioni > protetto > ID basso)

#### New — Marketing toolbar
- **Copia email/telefoni** — bulk copy negli appunti dalla lista filtrata
- **Export CSV** — esportazione con BOM UTF-8, separatore `;` per Excel italiano
- **Note rapide** — aggiunta nota dal list view senza aprire la scheda

#### New — Compleanni
- **Azioni rapide** — pulsanti WhatsApp e email per auguri direttamente dalla dashboard

#### Changed — Riorganizzazione UI
- **Sidebar impostazioni** — Import, Duplicati, Mailchimp spostati dentro Impostazioni con sidebar laterale
- **ClientiNav** — semplificata a 4 tab: Anagrafica, Prenotazioni, Dashboard, Impostazioni
- **Scheda inline** — apertura cliente nella lista senza navigazione (pattern embedded come SchedaVino)
- **Fix duplicati** — aggiunto filtro `attivo = 1` su tutte le query duplicati (clienti mergiati non riappaiono)

#### Changed — push.sh
- **Output pulito** — colori, sezioni con icone, rumore git nascosto
- **Verbose di default** — dettaglio per ogni DB e log deploy, `-q` per silenzioso
- **Fix macOS** — rimosso `grep -P` (non disponibile su Mac)

---

## 2026-04-06 — Gestione Clienti v1.1: Protezione dati, merge duplicati, export

#### New — Merge e Deduplicazione
- **Merge duplicati** — UI 3 step (seleziona principale → spunta secondari → conferma), merge batch, trasferimento prenotazioni/note/tag/alias
- **Filtri duplicati** — 3 modalità ricerca: telefono, email, nome e cognome
- **"Non sono duplicati"** — esclusione coppie da suggerimenti (es. marito/moglie stesso telefono), tabella `clienti_no_duplicato`
- **Export Google Contacts** — CSV compatibile Gmail/Google Contacts con nome, email, telefoni, compleanno, allergie, tag come gruppi

#### New — Protezione dati CRM vs TheFork
- **Campo `protetto`** — clienti modificati manualmente o mergati vengono protetti dall'import TheFork
- **Import intelligente** — clienti protetti: solo riempimento campi vuoti + aggiornamento rank/spending/date; clienti non protetti: sovrascrittura completa
- **Tag auto/manual** — `auto=1` per tag da import (es. VIP), `auto=0` per tag CRM manuali (intoccabili dall'import)
- **Alias merge** — tabella `clienti_alias` per mappare thefork_id secondari al principale, riconoscimento automatico in import clienti e prenotazioni

#### New — Revisione Diff Import
- **Coda revisione** — tabella `clienti_import_diff` salva le differenze tra CRM e TheFork per clienti protetti
- **UI revisione** — sezione nella pagina Import con diff campo per campo (valore CRM → valore TheFork)
- **Azioni per diff** — Applica singolo, Ignora singolo, Applica/Ignora tutto per cliente, Applica/Ignora globale
- **Badge notifica** — tab Import nella Nav mostra badge amber con conteggio diff pending
- **Risultato import** — dopo l'import mostra quante differenze sono state trovate

#### Changed
- DB schema: 8 tabelle (aggiunte `clienti_alias`, `clienti_no_duplicato`, `clienti_import_diff`, colonne `protetto` e `auto`)
- `clienti_router.py` ~1350 righe (+merge, duplicati, export, diff/risolvi)
- `ClientiDuplicati.jsx` — riscritta completamente con flow 3-step
- `ClientiImport.jsx` — sezioni Export + DiffReview con azioni batch
- `ClientiNav.jsx` — badge diff count su tab Import
- `push.sh` — refactoring flag (-f, -m, -d), aggiunto `clienti.sqlite3` a sync DB

---

## 2026-04-06 — Gestione Clienti v1.0: Nuovo modulo CRM completo

#### New — Modulo Gestione Clienti CRM
- **Anagrafica clienti** — lista con filtri (ricerca, VIP, rank, tag, attivi/inattivi), paginazione, ordinamento colonne
- **Scheda cliente** — layout 3 colonne: anagrafica + preferenze + diario note + storico prenotazioni, edit inline, gestione tag
- **Import TheFork clienti** — import XLSX con upsert su thefork_id (27k+ clienti), pulizia numeri telefono, auto-tag VIP
- **Import TheFork prenotazioni** — import XLSX con upsert su booking_id (31k+ prenotazioni), collegamento automatico a clienti via Customer ID
- **Storico Prenotazioni** — vista globale con filtri (stato, canale, date), badge colorati per stato, paginazione
- **Dashboard CRM** — KPI clienti + prenotazioni, compleanni 7gg, top 20 clienti per visite, distribuzione rank/tag/canale, andamento mensile 12 mesi, copertura contatti
- **Diario note** — note tipizzate (nota/telefonata/evento/reclamo/preferenza) per ogni cliente
- **Tag system** — 7 tag predefiniti + CRUD, toggle rapido nella scheda cliente
- **DB dedicato** `clienti.sqlite3` con 5 tabelle: clienti, clienti_tag, clienti_tag_assoc, clienti_note, clienti_prenotazioni

#### Files
- `app/models/clienti_db.py` — init DB + schema + trigger + indici
- `app/routers/clienti_router.py` — ~900 righe, tutti gli endpoint CRM + import
- `frontend/src/pages/clienti/` — 7 componenti (Menu, Nav, Lista, Scheda, Dashboard, Import, Prenotazioni)
- Modificati: main.py, modules.json, versions.jsx, modulesMenu.js, Home.jsx, App.jsx

---

## 2026-04-05 — Vendite v4.2 + Sistema v5.3: Turni chiusi parziali, refactoring logging/DB

#### New — Turni chiusi parziali
- Nuovo campo `turni_chiusi` in closures_config.json per chiusure di singoli turni (es. Pasqua solo pranzo)
- Modello Pydantic `TurnoChiuso` (data, turno, motivo) con validazione nel PUT
- Sezione "Turni singoli chiusi" in CalendarioChiusure.jsx (form + tabella + indicatore calendario)
- Badge grigio "cena chiusa — motivo" nella lista chiusure turno (ChiusureTurnoLista.jsx)
- Badge ambra "solo pranzo/cena" nella dashboard corrispettivi (tabella dettaglio + calendario heatmap)
- Form ChiusuraTurno.jsx: campi disabilitati + banner avviso se turno chiuso

#### Fixed — DELETE chiusura turno
- Nomi tabelle errati nel DELETE: checklist_responses → shift_checklist_responses, shift_closure_preconti → shift_preconti, shift_closure_spese → shift_spese

#### Refactor — Logging strutturato (Sistema v5.3)
- logging.basicConfig in main.py, print() → logger.info/warning/error in 20 file
- logger.exception() in 25+ except silenti (admin_finance, banca, ipratico, carta_vini, ecc.)
- Rimossi console.log debug dal frontend

#### Refactor — Centralizzazione connessioni DB
- Nuova funzione get_db(name) in app/core/database.py con context manager (WAL + FK + busy_timeout)
- Migrati 11 router/service da sqlite3.connect() inline a get_db()

#### Refactor — Error handler globale
- @app.exception_handler(Exception) in main.py: log + risposta JSON uniforme 500

---

## 2026-04-02 — Vendite v4.1: Colonne Fatture/Totale, DELETE chiusura, Incassi, Export corretto

#### New — Chiusure Turno Lista: colonne Fatture e Totale
- Colonna Fatture sempre visibile (anche se 0) per allineamento tabella
- Colonna Totale (RT + Fatture) nella riga riepilogo giorno, KPI mobile, e totali periodo
- In modalità TEST: Pre-conti, Incassi, Differenza visibili
- RT cena calcolato correttamente: cena.preconto - pranzo.preconto (era: usava il totale giornaliero)
- Riepilogo periodo convertito da griglia a `<table>` HTML per allineamento consistente

#### New — Elimina chiusura (admin)
- Endpoint DELETE `/admin/finance/shift-closures/{id}` con cascata su checklist, preconti, spese
- Pulsante Elimina con doppia conferma nella lista chiusure (solo admin)

#### New — Blocco date future
- Backend: rifiuta POST chiusura con data futura (HTTP 400)
- Frontend: attributo `max={today}` su input data + validazione in handleSave

#### Changed — Dashboard: Corrispettivi → Incassi
- Rinominato "Totale Corrispettivi" → "Totale Incassi" in tutta la CorrispettiviDashboard
- Label grafici, tooltip, header tabelle aggiornati

#### Fixed — Export corrispettivi legge shift_closures
- Nuova funzione `_merge_shift_and_daily()` in corrispettivi_export.py
- Merge: shift_closures (primario) + daily_closures (fallback per date mancanti)
- Prima leggeva solo daily_closures (dati stantii da import Excel)

#### Fixed — closures_config.json protetto al deploy
- Aggiunto a push.sh nella lista files runtime (backup pre-push + restore post-push)

---

## 2026-04-01 — Controllo Gestione v1.4: Rate Variabili, Prestiti, Segna Pagata

#### New — Segna pagata da Acquisti
- Bottone "Segna pagata" su fatture non pagate nell'elenco fatture e nel dettaglio fornitore
- Endpoint `POST /fattura/{id}/segna-pagata-manuale`: crea/aggiorna cg_uscite con stato PAGATA_MANUALE
- Se metodo_pagamento = CONTANTI marca direttamente PAGATA
- Aggiorna anche `fe_fatture.pagato = 1`

#### New — Piano rate variabili (prestiti alla francese)
- Tabella `cg_piano_rate` (migrazione 048): spesa_fissa_id, numero_rata, periodo, importo, note
- Generazione uscite usa piano_rate se esiste, altrimenti importo fisso dalla spesa
- CRUD endpoints: GET/POST/DELETE `/spese-fisse/{id}/piano-rate`
- Supporto `importo_originale` e `spese_legali` su cg_spese_fisse (migrazione 049)

#### New — Wizard rateizzazione migliorato
- Step 2: campo spese legali, preview totale (fattura + spese), griglia 3 colonne
- Step 3: tabella rate editabili con importo modificabile per singola rata
- Validazione totale (somma rate = importo fattura + spese legali)
- Bottone "Ricalcola uguali" per ridistribuire equamente
- Feedback campi mancanti con avviso ambra
- Salvataggio invia piano_rate + importo_originale + spese_legali al backend

#### New — Prestiti BPM (migrazione 047)
- BPM 1: 72 rate mensili (mar 2021 - feb 2027), giorno 26
- BPM 2: 120 rate mensili (apr 2021 - mar 2031), giorno 19
- Rate pre-2026 marcate PAGATA, dal 2026 DA_PAGARE
- Ogni rata con importo esatto dal piano di ammortamento

#### Fixed — Pulizia duplicati banca (migrazione 046)
- 398 movimenti duplicati da reimport CSV con formato diverso
- Dedup basato su hash normalizzato (lowercase, spazi, primi 50 char)
- Preservati tutti i link CG/banca esistenti (remapping su record keeper)
- Da 921 a 523 movimenti

#### Fixed — Persistenza privilegi utenti
- users.json e modules.json rimossi dal tracking git (.gitignore)
- push.sh: backup in /tmp prima del push, ripristino dopo checkout

---

## 2026-03-31 — Flussi di Cassa v1.4: Categorie Registrazione Dinamiche

#### New — Categorie registrazione configurabili
- Tabella `banca_categorie_registrazione` con codice, label, tipo, pattern auto-detect, colore, ordine
- Migrazione 045 con seed delle 12 categorie iniziali (8 uscita + 4 entrata)
- Nuovo tab "Categorie Registrazione" nelle Impostazioni Flussi di Cassa
- CRUD completo: crea, modifica, attiva/disattiva categorie
- Pattern auto-detect configurabili (con supporto soglie importo)
- Colore personalizzabile per ogni categoria
- Frontend Riconciliazione carica categorie dinamicamente dall'API
- Endpoint: GET/POST `/banca/categorie-registrazione`, PUT/PATCH per update/toggle

---

## 2026-03-31 — Flussi di Cassa v1.3: Riconciliazione Completa

#### New — Registrazione diretta movimenti bancari
- Bottone "Registra" nel tab Senza match per categorizzare movimenti senza fattura/spesa fissa
- Supporto entrate (POS, contanti, bonifici) e uscite (commissioni, bollo, carta, RIBA, SDD)
- Auto-detect categoria dalla descrizione bancaria
- Tabella `cg_entrate` per tracciare entrate nel CG
- Endpoint `POST /banca/cross-ref/registra` e `DELETE /banca/cross-ref/registra/{id}`
- Badge colorati per tutte le categorie registrazione

#### Fixed — Dedup aggressivo movimenti bancari (migrazione 042)
- I due CSV importavano lo stesso movimento con descrizioni leggermente diverse (spazi, troncature)
- Normalizzazione: lowercase + collasso spazi multipli + primi 50 char
- Rimossi ~16 duplicati residui non catturati dalla migrazione 041
- `_dedup_hash()` allineato alla nuova normalizzazione per prevenire futuri duplicati

#### New — Selezione multipla e registrazione bulk
- Checkbox su ogni movimento nel tab "Senza match" per selezione multipla
- "Seleziona tutti" nell'header tabella (solo pagina visibile)
- Barra azioni bulk: conteggio selezionati, totale importo, scelta categoria
- Endpoint `POST /banca/cross-ref/registra-bulk` — registra N movimenti in una transazione
- Reset selezione al cambio tab

#### New — Data pagamento contanti personalizzabile
- Date picker nel form di registrazione pagamento contanti (GestioneContanti)
- Permette di retrodatare pagamenti storici (prima era sempre la data odierna)

#### Fixed — Pulizia link orfani (migrazione 043)
- Rimossi link in `banca_fatture_link` che puntavano a fatture cancellate
- Eliminati link duplicati (stessa fattura collegata a più movimenti)
- Discrepanza 46 collegati vs 43 scadenzario risolta

#### Changed — Display stipendi nel cross-ref
- Stipendi mostrano "Paga di [mese]" invece della data scadenza
- Nome dipendente senza prefisso "Stipendio - "
- Backend passa `periodo_riferimento` nelle query CG

---

## 2026-03-31 — Flussi di Cassa v1.2: Riconciliazione Spese

#### New — Riconciliazione Spese (ex Cross-Ref Fatture)
- Rinominato "Cross-Ref Fatture" → "Riconciliazione Spese"
- Match movimenti bancari non solo con fatture ma anche con spese fisse, affitti, tasse, rate, assicurazioni
- Tabella con colonne ordinabili (Data, Importo) al posto delle card
- 3 tab: Suggerimenti (match automatici), Senza match (ricerca manuale), Collegati (riconciliati)
- Filtro testo globale per descrizione/fornitore/importo
- Ricerca manuale: cerca sia in fatture che in cg_uscite non collegate
- Badge tipo spesa colorato (Fattura, Affitto, Tassa, Stipendio, Rata, Assicurazione…)
- Nuovo endpoint `GET /banca/cross-ref/search` (unificato fatture + uscite)
- `POST /banca/cross-ref/link` accetta sia `fattura_id` che `uscita_id`
- `DELETE /banca/cross-ref/link/{id}` gestisce sia link fattura che uscita diretta (prefisso "u")

#### Fixed — CG v1.3: Import uscite riconcilia con cross-ref bancario
- L'import uscite ora fa LEFT JOIN con `banca_fatture_link` + `banca_movimenti`
- Fatture già collegate a movimenti bancari via cross-ref vengono importate come PAGATA
- Fatture esistenti DA_PAGARE/SCADUTA con cross-ref vengono aggiornate a PAGATA
- Fatture PAGATA_MANUALE senza `banca_movimento_id` vengono arricchite se esiste cross-ref

---

## 2026-03-30 — Cantina v3.8: unificazione Carta Vini PDF/DOCX

#### Changed — Carta Vini endpoint unificati
- Tutti i bottoni "Carta PDF" e "Scarica Word" ora puntano a `/vini/carta/pdf` e `/vini/carta/docx`
- Rimossi endpoint duplicati `/vini/cantina-tools/carta-cantina/pdf` e `/docx`
- Nome file download unificato: `carta-vini.pdf` / `carta-vini.docx` (senza date nel nome)
- Endpoint pubblici — non richiedono più token in query string

---

## 2026-03-30 — Sistema v5.0: Header flyout, Impostazioni standalone

#### Changed — Header v4.1: menu navigazione flyout
- Click sul nome modulo in alto a sinistra → dropdown con lista moduli
- Hover su un modulo → pannello flyout laterale con sotto-menu, allineato alla riga
- Click su modulo → navigazione alla homepage; click su sotto-voce → navigazione diretta
- Safe-zone invisibile + intent detection (stile Amazon) per evitare flicker diagonale
- Configurazione moduli centralizzata in `modulesMenu.js` (usata da Home e Header)

#### Changed — Impostazioni modulo standalone
- Rimosso hub "Amministrazione" (AdminMenu.jsx non più referenziato)
- `/admin` → redirect automatico a `/impostazioni`
- Impostazioni con 3 tab: Utenti & Ruoli, Moduli & Permessi, Backup
- Query param `?tab=utenti|moduli|backup` per link diretto ai tab
- Accesso consentito a ruoli admin e superadmin
- Pulsante "Torna" → Home (non più /admin)
- `/admin/dipendenti/*` → redirect a `/dipendenti` (modulo top-level)

#### Fixed — Controllo Gestione v1.2: sync import e stato contanti
- Import uscite: sync completo di totale, numero_fattura, data_fattura, fornitore per righe non pagate
- Pulizia fatture azzerate: se totale fattura scende a 0, uscita marcata PAGATA con nota
- Pagamenti CONTANTI → stato PAGATA (non PAGATA_MANUALE), migrazione 040 retroattiva
- `cleanFatt()` helper per &mdash; e stringhe vuote nel numero fattura
- Ricerca uscite-da-pagare: COALESCE per ordinamento scadenze NULL, caricamento automatico

#### Changed — Flussi di Cassa v1.1
- Movimenti Contanti: sub-tab "Pagamenti spese" e "Versamenti in banca"
- Pagamenti spese: ricerca uscite, selezione multipla, segna-pagate-bulk con CONTANTI
- Backend: endpoint movimenti-contanti e uscite-da-pagare con alias `totale AS importo`
- Frontend: fallback `importo_pagato || importo` per display corretto

---

## 2026-03-30 — Movimenti Contanti: pagamento spese in contanti

#### Changed — Sezione "Contanti da versare" → "Movimenti Contanti"
- Sidebar Gestione Contanti: voce rinominata con icona 💶
- Due sub-tab interni: **Pagamenti spese** e **Versamenti in banca**

#### Added — Sub-tab "Pagamenti spese" (SubPagamentiContanti)
- Lista pagamenti contanti del mese (da CG uscite con metodo_pagamento=CONTANTI)
- Form di registrazione: ricerca uscite da pagare (fornitore/n° fattura), selezione multipla con checkbox
- Chiamata a `segna-pagate-bulk` con `metodo_pagamento: "CONTANTI"`
- KPI: totale pagamenti contanti del mese, n. operazioni
- Badge tipo: Fattura (blue), Spesa fissa (amber), Stipendio (violet)

#### Added — Backend endpoints per movimenti contanti
- `GET /controllo-gestione/movimenti-contanti?anno=X&mese=Y` — lista uscite pagate in contanti
- `GET /controllo-gestione/uscite-da-pagare?search=X` — uscite con stato DA_PAGARE/SCADUTA/PARZIALE (max 50)

#### Unchanged — Sub-tab "Versamenti in banca"
- Funzionalità identica alla vecchia "Contanti da versare" (tracking contanti fiscali + versamenti)

---

## 2026-03-30 — Flussi di Cassa v1.0: Riorganizzazione modulo Banca

#### Changed — Banca rinominato in "Flussi di Cassa"
- **Home tile**: "Banca" → "Flussi di Cassa" con nuova descrizione
- **Tab navigation**: FlussiCassaNav sostituisce BancaNav su tutte le pagine
- **Routes**: `/flussi-cassa/*` con redirect automatici da `/banca/*`
- **Moduli visibilità**: ruolo SALA può accedere a Flussi di Cassa (per vedere Mance)

#### Added — Nuova struttura tab
- **Dashboard**: panoramica unificata (invariato, ex Banca Dashboard)
- **Conti Correnti**: movimenti + cross-ref fatture (ex Banca Movimenti)
- **Carta di Credito**: scheletro pronto (import estratto conto, riconciliazione CG) — prossimamente
- **Contanti**: spostato da Vendite → include contanti da versare, pre-conti, spese turno, spese varie
- **Mance**: spostato da Vendite → tab dedicata visibile a tutti i ruoli
- **Impostazioni**: import CSV + categorie bancarie

#### Changed — VenditeNav semplificato
- Rimossi tab "Contanti" e "Mance" (ora in Flussi di Cassa)
- Redirect automatici: `/vendite/contanti` → `/flussi-cassa/contanti`, `/vendite/mance` → `/flussi-cassa/mance`

---

## 2026-03-30 — Sessione 18b: Fix Stipendi CG + Mance

#### Fixed — Scadenzario CG: display stipendi
- Le righe stipendio nello scadenzario mostravano "Fattura" come categoria e "—" come descrizione
- Aggiunto branch `isStipendio` nel rendering tabella: badge viola "Stipendio", descrizione con mese di riferimento, riga sfondo viola chiaro

#### Added — Gestione Contanti: pagina Mance
- Nuova sezione "Mance" nella sidebar Gestione Contanti (5a voce con icona 🎁)
- Lista mance registrate dalle chiusure turno, filtrabili per mese/anno
- KPI: totale mance mese, turni con mance, giorni con mance
- Tabella con data, turno (pranzo/cena), importo, coperti, €/coperto, note
- Footer con totali mensili — utile per distribuzione mance al personale

---

## 2026-03-30 — Buste Paga v2.0: Import PDF LUL automatico

#### Added — Parser PDF LUL (Libro Unico Lavoro)
- **Upload PDF**: pulsante "Import PDF LUL" nella pagina Buste Paga
- **Parser automatico**: estrae cedolini dal PDF del consulente (formato TeamSystem)
- Dati estratti per dipendente: netto, lordo, INPS, IRPEF, addizionali, TFR, ore lavorate, IBAN, codice fiscale
- **Abbinamento automatico**: match dipendente per codice fiscale o cognome+nome
- **Report risultati**: mostra importati, non abbinati (da aggiungere in anagrafica), errori
- **Auto-aggiornamento anagrafica**: aggiorna IBAN e codice fiscale se mancanti
- Genera automaticamente scadenze stipendio nello Scadenzario CG
- Nuovi campi anagrafica dipendenti: codice_fiscale, data_nascita, tipo_rapporto, livello, qualifica
- Badge "PDF" sui cedolini importati da file (vs inseriti manualmente)
- `pdfplumber` aggiunto a requirements.txt

---

## 2026-03-30 — Dipendenti v2.0: Modulo Top-Level + Buste Paga + Scadenze Documenti

### Dipendenti promosso a modulo top-level

#### Changed
- **Dipendenti** non è più sotto Amministrazione: ha la sua tile nella Home
- **Amministrazione** sostituita da due tile separate: "Dipendenti" e "Impostazioni"
- Routes migrate da `/admin/dipendenti/*` a `/dipendenti/*` (redirect automatici)
- File frontend spostati in `pages/dipendenti/` (directory dedicata)

#### Added — Buste Paga (v1.0)
- **Inserimento cedolini**: form completo con netto, lordo, INPS, IRPEF, addizionali, TFR, ore
- **Integrazione Scadenzario**: ogni cedolino genera automaticamente una scadenza in Controllo Gestione (tipo STIPENDIO)
- **Vista per mese**: cedolini raggruppati per mese con totali netto/lordo
- **Endpoint backend**: `GET/POST/DELETE /dipendenti/buste-paga`
- Import PDF dal consulente: predisposto (v1.1 dopo analisi del formato)

#### Added — Scadenze Documenti (v1.0)
- **Semaforo**: indicatori verde (valido), giallo (in scadenza), rosso (scaduto)
- **Tipi predefiniti**: HACCP, Sicurezza generale/specifica, Antincendio, Primo soccorso, Visita medica, Permesso soggiorno
- **Alert configurabile**: giorni di preavviso personalizzabili per tipo (default 30-90gg)
- **CRUD completo**: crea, modifica, elimina scadenze con filtri per stato/tipo/dipendente
- **Endpoint backend**: `GET/POST/PUT/DELETE /dipendenti/scadenze`

#### Added — Database
- Tabelle: `buste_paga`, `dipendenti_scadenze`, `dipendenti_presenze`, `dipendenti_contratti`
- Colonne su `dipendenti`: `costo_orario`, `giorno_paga`
- Tipo uscita STIPENDIO nel frontend Scadenzario (badge viola)

#### Added — Scadenzario miglioramenti
- **Filtri rapidi periodo**: mese corrente, prossimo, 7gg, 30gg, trimestre, anno
- **Modifica scadenza su click**: modale con indicatore arretrato (>10gg)
- **Selezione multipla + pagamento bulk**: checkbox, barra azioni, metodo pagamento
- **Fix frecce ordinamento**: risolto testo "updownarrow" con carattere Unicode
- **Ricerca ampliata**: note, periodo, tipo, importo, data

---

## 2026-03-30 — Controllo Gestione v1.1: Riconciliazione Banca + Spese Fisse v2.0 + Rimozione Finanza

### Rimozione Modulo Finanza

#### Removed
- **Modulo Finanza v1.0**: completamente rimosso da codebase (router, frontend, config)
- **Router**: `finanza_router.py` e `finanza_scadenzario_router.py` eliminati
- **Frontend**: componenti Finanza eliminate da `src/pages/`
- **Database**: tabelle finanza_movimenti, finanza_categorie, finanza_scadenzario (legacy, non più popola)
- **Menu**: tile Finanza rimosso da home page
- **Routing**: rotte `/finanza/*` eliminate

#### Note
- Le funzionalità di Finanza (scadenzario, categorie pagamenti) sono state integrate in Controllo Gestione
- Le migrazioni 015-019 rimangono nel database per tracciabilità, ma non sono più utilizzate
- Documentazione aggiornata (architettura.md, database.md, readme.md, roadmap.md)

### Spese Fisse (ControlloGestioneSpeseFisse.jsx v2.0)

#### Added
- **Pannello scelta creazione**: 6 modalita (Affitto, Prestito, Assicurazione, Tasse, Rateizzazione, Manuale)
- **Wizard Affitto**: guidato con campi locale/indirizzo, proprietario, canone, giorno pagamento, periodo
- **Wizard Prestito/Mutuo**: guidato con banca, rata, giorno addebito, prima/ultima rata
- **Wizard Assicurazione**: nuova categoria con compagnia, polizza, premio, frequenza pagamento
- **Template Tasse**: selezione multipla da 8 template (F24 IVA, IRPEF, INPS, TARI, IMU, ecc.) con importi personalizzabili
- **Rateizzazione**: da fattura esistente o importo libero, calcolo automatico rata, preview, data fine
- **Categoria ASSICURAZIONE**: aggiunta a backend (TIPO_SPESA, sf_tipo_labels) e frontend

### Scadenzario Uscite (ControlloGestioneUscite.jsx v3.0)

#### Added
- **Riconciliazione banca**: nuova colonna "Banca" con icone per collegare uscite a movimenti bancari
- **Modale candidati**: click sull'icona viola mostra movimenti bancari compatibili (importo +-10%, data +-15gg)
- **Match scoring**: indica % di corrispondenza importo, evidenzia "Match esatto" quando >= 99%
- **Flusso stati**: PAGATA_MANUALE + match banca → PAGATA (confermata). Scollega riporta a PAGATA_MANUALE
- **KPI riconciliazione**: contatore nella sidebar e nella barra KPI
- **Filtro automatico**: esclude movimenti gia collegati ad altre uscite

### Backend (controllo_gestione_router.py)

#### Added
- `GET /uscite/{id}/candidati-banca` — trova movimenti bancari candidati al match
- `POST /uscite/{id}/riconcilia` — collega uscita a movimento, stato → PAGATA
- `DELETE /uscite/{id}/riconcilia` — scollega, stato → PAGATA_MANUALE
- Riepilogo: num_riconciliate e num_da_riconciliare nel GET /uscite

---

## 2026-03-23 — Gestione Vendite v4.0: Dashboard unificata 3 modalita', chiusure configurabili, cleanup fiscale

### Dashboard unificata (CorrispettiviDashboard.jsx — rewrite completo)

#### Added
- **Mode switcher**: 3 modalita' (Mensile / Trimestrale / Annuale) con pillole in alto a destra
- **Modalita' Trimestrale**: aggrega 3 mesi, KPI, grafico, composizione pagamenti, tabella giornaliera, confronto pari trimestre anno precedente
- **Modalita' Annuale**: grafico a barre mensili anno vs anno-1, tabella mensile dettagliata con variazioni, integrata nella dashboard (era pagina separata)
- **Confronto YoY smart**: quando il periodo e' in corso, confronta solo fino allo stesso giorno del calendario
- **Navigazione adattiva**: prev/next si adattano al periodo (mese/trimestre/anno)
- **Confronto anno precedente** in tutte le modalita' con linea tratteggiata/barre grigie

#### Changed
- **Contanti come residuo** (v3.0-fiscale): corrispettivi - pagamenti elettronici = contanti (quadra sempre)
- **Rimossi**: Totale Incassi, colonna differenze, alert discrepanze dalla dashboard
- **Top/bottom days**: esclusi giorni con corrispettivi = 0 (chiusure)

#### Removed
- **Pagina annuale separata** (`CorrispettiviAnnual.jsx` / `/vendite/annual`) — integrata nella dashboard
- **Tab "Annuale"** dalla barra di navigazione VenditeNav
- **Tile "Confronto Annuale"** dal menu Vendite

### Chiusure configurabili

#### Added
- **`closures_config.json`**: giorno chiusura settimanale (0-6) + array giorni chiusi (ferie/festivita')
- **`closures_config_router.py`**: GET/PUT `/settings/closures-config/` con validazione
- **`CalendarioChiusure.jsx`**: UI calendario per toggle chiusure — pulsanti giorno settimanale, griglia mensile, lista date chiuse
- **Logica priorita' chiusura**: DB flag > dati reali > config festivita' > giorno settimanale

### Impostazioni Vendite (sidebar layout)

#### Changed
- **`CorrispettiviImport.jsx`** riscritto con sidebar layout (pattern ViniImpostazioni): menu a sinistra con "Calendario Chiusure" e "Import Corrispettivi"

### Pre-conti e accesso

#### Changed
- **Pre-conti nascosti**: rimossi dalla nav e dalla sezione Chiusure Turno, spostati dentro Impostazioni (solo superadmin)
- **Default mese corrente** per filtro pre-conti (era "ultimi 30 giorni")
- **Home page superadmin**: fix moduli vuoti — aggiunto "superadmin" a tutti i moduli in modules.json + fallback frontend

### Chiusure Turno Lista

#### Changed
- **Espansione diretta**: rimosso doppio click (expandedTurno/renderTurnoDetail), ora mostra tutti i dati al primo expand

### Versioni
- `corrispettivi` (Gestione Vendite): v2.0 → v4.0
- `sistema`: v4.3 → v4.5

---

## 2026-03-22 — Gestione Acquisti & FattureInCloud v2.1: FIC API v2 enrichment, SyncResult tracking, fix UI escluso

### Backend: fe_import.py (fatture list/import)

#### Changed
- **Rimosso `escluso` field dalla query `/fatture`** — il flag `fe_fornitore_categoria.escluso` è solo per il modulo product matching, non per acquisti
- **Rimosso LEFT JOIN con `fe_fornitore_categoria`** dalla list endpoint `/fatture` e stats endpoints (fornitori, mensili)
- **`_EXCL_JOIN` ora contiene solo category JOIN** (per drill-down dashboard), `_EXCL_WHERE` filtra solo autofatture
- **Import XML arricchisce fatture FIC**: quando un import XML matcha una fattura FIC esistente (piva+numero+data), aggiunge le righe XML (righe) se la fattura FIC ha `is_detailed: false` (ritorna zero righe da FIC API)
- **Import XML aggiorna importi** da XML SdI (imponibile, IVA, totale) quando arricchisce fatture FIC

### Backend: fattureincloud_router.py (FIC sync)

#### Added
- **SyncResult ora include `items` list** — ogni fattura sincronizzata è tracciata con fornitore, numero, data, totale, stato (nuova/aggiornata/merged_xml)
- **SyncResult ora include `senza_dettaglio` list** — fatture dove FIC API ritorna `items_list: []` (is_detailed: false) e nessun righe esistente da XML
- **Debug endpoint** `GET /fic/debug-detail/{fic_id}` ritorna raw FIC API response per uno specifico documento (is_detailed, e_invoice, items_list, etc.)
- **`force_detail` parameter** aggiunto a sync endpoint

#### Changed
- **Phase 2 preserva XML righe** — se FIC `items_list` è vuoto, le righe esistenti (da XML) non vengono cancellate

### Frontend: FattureElenco.jsx

#### Removed
- **Rimosso "Escluse" badge e filtro** — niente più badge "Escluse", "Normali" o filtro tipo "escluso"

#### Changed
- **Only "Autofatture" badge rimane** (mostrato quando count > 0)
- **Anno default è anno corrente** (`new Date().getFullYear()`)

### Frontend: FattureImpostazioni.jsx

#### Added
- **Sync result mostra lista completa di fatture processate** in una tabella (NUOVA/AGG./MERGE badges, data, numero, fornitore, totale)
- **Orange warning box** per fatture senza product detail (senza_dettaglio) — suggerisce upload file XML
- **10-minute timeout** su sync fetch (AbortController) per prevenire network errors su sync grandi

### Frontend: FattureDashboard.jsx

#### Changed
- **Anno default è anno corrente** invece di "all"

### Infrastructure

#### Changed
- **nginx proxy_read_timeout** set a 600s su VPS per trgb.tregobbi.it

### Database

#### Notes
- 58 fornitori marcati `escluso=1` in `fe_fornitore_categoria` — è per il modulo product matching ONLY, non acquisti
- `fe_fatture` e `fe_righe` cleared per fresh FIC-only import
- Cross-fonte dedup working (0 duplicates dopo fix)

### Key Discovery
- **FIC API v2 `received_documents` con `fieldset=detailed`** ritorna `items_list: []` quando `is_detailed: false`, anche se la fattura ha `e_invoice: true` (XML SdI attached). FIC frontend legge items dall'XML attached direttamente, ma REST API non li espone. Workaround: importare XML files per ottenere le righe.

---

## 2026-03-21 — Modulo iPratico Sync v2.0

### Added
- **Sincronizzazione prodotti iPratico** — nuovo modulo per import/export bidirezionale tra iPratico e magazzino vini TRGB
- **`app/routers/ipratico_products_router.py`** v2.0 — 10 endpoint sotto `/vini/ipratico/`: upload, mappings, ignore, export, missing, export-defaults, sync-log, stats, trgb-wines
- **`frontend/src/pages/vini/iPraticoSync.jsx`** v2.0 — pagina workflow lineare (no tab): import → verifica → esporta
- **Migrazioni 020–022** in `foodcost.db`:
  - `ipratico_product_map` — mapping prodotti iPratico ↔ vini TRGB
  - `ipratico_sync_log` — storico sincronizzazioni
  - `ipratico_export_defaults` — valori default configurabili per nuovi vini (Family, reparti, listini)
- **Match diretto per ID** — il codice 4 cifre nel Name iPratico corrisponde a `vini_magazzino.id` (~99.7% match rate)
- **TRGB ha priorita'** — l'export ricostruisce il Name da dati TRGB se cambiati
- **Vini mancanti** — l'export aggiunge automaticamente righe per vini TRGB non presenti su iPratico con tutti i campi default compilati (12 campi prezzo, reparti, family, hidden, listini)
- **Default configurabili** — pannello collassabile nella sezione Export per modificare i valori default senza toccare il codice
- **Ignore/Ripristina** — toggle per prodotti iPratico senza corrispondenza TRGB
- **Tile "Import/Export iPratico"** nella home modulo Vini (`ViniMenu.jsx`)
- **`push.sh`** — aggiunto download automatico database dal VPS prima di ogni push

---

## 2026-03-16 — Cantina & Vini v4.0: Filtro locazioni unificato, Stampa selezionati PDF, SchedaVino sidebar+main

### Added
- **Stampa selezionati diretta PDF** — il pulsante "Stampa selezionati" in MagazzinoVini ora genera direttamente un PDF dei vini selezionati senza aprire il dialog StampaFiltrata
- **Endpoint `POST /vini/cantina-tools/inventario/selezione/pdf`** — accetta lista ID via Body, genera PDF con WeasyPrint e ritorna `Response` con bytes (autenticazione Bearer token, no query token)
- **Mappa colori `TIPOLOGIA_SIDEBAR`** in SchedaVino.jsx — gradiente sidebar dinamico per ciascuna tipologia (ROSSI=rosso, BIANCHI=ambra, BOLLICINE=giallo, ROSATI=rosa, PASSITI=arancio, GRANDI FORMATI=viola, ANALCOLICI=teal)

### Changed
- **SchedaVino.jsx** v5.0 — layout completamente riscritto da scroll verticale a **sidebar+main** con CSS grid `grid-cols-[260px_1fr]`:
  - Sidebar (260px): nome vino, badge #id, griglia 4 stat box, lista info, pulsanti azione (Modifica anagrafica/giacenze, Duplica, Chiudi)
  - Main: area scrollabile con sezioni Anagrafica, Giacenze, Movimenti, Note
  - Colore sidebar determinato dinamicamente dalla TIPOLOGIA del vino (stesso schema colori usato nella tabella MagazzinoVini)
- **MagazzinoVini.jsx** v4.0 — **filtro locazioni unificato**: sostituiti 8 state vars e 6 select cascading con 2 soli dropdown:
  - "Locazione": tutti i nomi da tutte le 4 sezioni config, deduplicati e ordinati
  - "Spazio": spazi unificati per la locazione selezionata (inclusi spazi matrice generati)
  - Logica di filtro cerca contemporaneamente su tutte e 4 le colonne DB (FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2, LOCAZIONE_3)
- **`handlePrintSelection()`** in MagazzinoVini — entrambi i pulsanti "Stampa selezionati" ora chiamano direttamente il nuovo endpoint POST (fetch+blob+createObjectURL), il pulsante "Con filtri..." nel dropdown mantiene apertura StampaFiltrata

### Notes
- StampaFiltrata mantiene i propri filtri per-locazione separati (server-side) — è intenzionale
- Le modifiche non sono ancora state testate nel browser

---

## 2026-03-15c — Modulo Statistiche v1.0

### Added
- **Modulo Statistiche** — nuovo modulo per import e analisi dati vendite da iPratico
- **`app/migrations/018_ipratico_vendite.py`** — 3 tabelle: `ipratico_imports`, `ipratico_categorie`, `ipratico_prodotti` con indici su (anno, mese)
- **`app/services/ipratico_parser.py`** — parser export iPratico (.xls HTML) con `pd.read_html()`, gestisce encoding variabile
- **`app/routers/statistiche_router.py`** v1.0 — 7 endpoint sotto `/statistiche`: import-ipratico, mesi, categorie, prodotti, top-prodotti, trend, elimina mese
- **Frontend Statistiche** — 5 componenti React:
  - `StatisticheMenu.jsx` — menu principale modulo
  - `StatisticheNav.jsx` — tab navigation
  - `StatisticheDashboard.jsx` — KPI, categorie per fatturato, top 15 prodotti, trend mensile (bar chart CSS)
  - `StatisticheProdotti.jsx` — dettaglio prodotti con filtri, ricerca e paginazione
  - `StatisticheImport.jsx` — upload .xls con selettore anno/mese, storico import, eliminazione mese
- **Route** `/statistiche`, `/statistiche/dashboard`, `/statistiche/prodotti`, `/statistiche/import` in `App.jsx`
- **Home tile** Statistiche con badge versione
- **`modules.json`** — aggiunto modulo `statistiche` (ruoli: admin, viewer)
- **`versions.jsx`** — aggiunto `statistiche: v1.0 beta`

---

## 2026-03-15b — Unificazione loader carta + DOCX tabelle + fix cancellazione movimenti

### Fixed
- **`vini_magazzino_db.py`** `delete_movimento()` — cancellare un movimento VENDITA/SCARICO azzerava la giacenza perché il replay partiva da zero perdendo lo stock iniziale importato da Excel. Ora usa **inversione del delta** (per RETTIFICA mantiene il replay conservativo)

### Changed
- **`carta_vini_service.py`** v1.1 — aggiunta `build_carta_docx()` condivisa: genera DOCX con **tabelle senza bordi a 3 colonne** (descrizione 67% | annata 15% | prezzo 18%) invece di tab stops che sfondavano con descrizioni lunghe
- **`vini_router.py`** — endpoint `/carta/docx` semplificato: usa `build_carta_docx()` condiviso, rimossi import `Document`, `Inches`, `groupby`
- **`vini_cantina_tools_router.py`** v3.1 — eliminata `_load_vini_cantina_ordinati()` (~70 righe duplicate), tutti gli endpoint carta (HTML/PDF/DOCX) usano `load_vini_ordinati()` dal repository; endpoint DOCX semplificato

### Removed
- **`_load_vini_cantina_ordinati()`** — funzione duplicata nel cantina tools router, sostituita da import condiviso

---

## 2026-03-15 — Eliminazione vecchio DB vini.sqlite3 + fix carta v3.1

### Removed
- **`vini.sqlite3`** — vecchio DB Carta Vini (generato da import Excel) eliminato; tutto ora su `vini_magazzino.sqlite3`
- **Endpoint `POST /vini/upload`** — import Excel vecchio rimosso da `vini_router.py`
- **Endpoint `POST /vini/cantina-tools/sync-from-excel`** — sincronizzazione vecchio DB → cantina rimossa
- **Tasto "Importa file Excel"** da pagina Carta Vini (`ViniCarta.jsx`)
- **UI sincronizzazione** da `CantinaTools.jsx` e `ViniImpostazioni.jsx`
- **Codice migrazione vecchio DB** da `vini_settings.py`
- **`mockup_nazione.html`** — file mockup temporaneo

### Changed
- **`vini_router.py`** v3.0 — movimenti ora su `vini_magazzino_db` (era `vini_db`), rimossi import da `vini_db`/`vini_model`
- **`vini_cantina_tools_router.py`** v3.0 — rimosso sync-from-excel, mantenuto import-excel (diretto → magazzino)
- **`ViniCarta.jsx`** v3.3 — rimosso import Excel, griglia 4 colonne, sottotitolo aggiornato
- **`ViniDatabase.jsx`** — upload ora punta a `/cantina-tools/import-excel` con `apiFetch`
- **`carta_html.css`** v3.1 — allineato a PDF: stili nazione con filetti decorativi, Google Fonts import, spaziature coerenti
- **`carta_pdf.css`** v3.1 — `page-break-after: avoid` su `.tipologia`, `.nazione`, `.regione`, `.produttore` per evitare intestazioni orfane in fondo pagina

### Notes
- `vini_db.py` e `vini_model.py` restano nel codice (deprecated) — `normalize_dataframe` ancora usata da import-excel
- `core/database.py` mantenuto per dipendenza pre-esistente da `fe_import.py`

---

## 2026-03-14c — Cambio PIN self-service + reset admin

### Added
- **Pagina CambioPIN** (`/cambio-pin`) — accessibile a tutti gli utenti loggati
  - Cambio PIN proprio: verifica PIN attuale (obbligatorio per non-admin) + nuovo PIN + conferma
  - Sezione admin: lista utenti con pulsante "Reset → 0000" per ciascuno
  - PinInput component: type=password, inputMode=numeric, filtra non-digit
- **Icona 🔑 nel Header** — accanto al logout, per accesso rapido alla pagina Cambio PIN
- **Route `/cambio-pin`** in App.jsx + import CambioPIN

---

## 2026-03-14b — Chiusure Turno: modulo completo fine servizio

### Added
- **Modulo Chiusure Turno** — sistema completo per chiusura fine servizio (pranzo/cena)
  - **`chiusure_turno.py`** — backend con tabelle: `shift_closures` (con fondo_cassa_inizio/fine), `shift_checklist_config`, `shift_checklist_responses`, `shift_preconti`, `shift_spese`
  - **`ChiusuraTurno.jsx`** v2.0 — form completo con:
    - Preconto rinominato "Chiusura Parziale" (pranzo) / "Chiusura" (cena) dinamicamente
    - Sezione Pre-conti: righe dinamiche (tavolo + importo) per tavoli non battuti
    - Sezione Spese: righe dinamiche (tipo: scontrino/fattura/personale/altro + descrizione + importo)
    - Fondo Cassa: inizio e fine servizio
    - **Logica cena cumulativa**: staff inserisce totali giornalieri, il sistema sottrae pranzo per calcolare parziali cena
    - Hint "pranzo €X → parz. cena €Y" sotto ogni campo in modalita' cena
    - Banner esplicativo in modalita' cena
    - Riepilogo differenziato: pranzo mostra totali semplici, cena mostra giorno→pranzo→parziale
    - Quadratura: `(incassi + preconti) - chiusura_parziale`
  - **`ChiusureTurnoLista.jsx`** — pagina admin con lista completa chiusure
    - Filtri: range date (default ultimi 30 giorni), turno (tutti/pranzo/cena)
    - Totali periodo: n. chiusure, totale incassi, totale coperti, totale spese
    - Ogni riga: data, turno badge, inserita da (created_by), chiusura, incassi, coperti, spese, quadratura (dot verde/rosso)
    - Espandi per dettaglio: incassi breakdown, fondo cassa, pre-conti, spese con badge tipo, note
    - Pulsante "Modifica" per riaprire il form
- **VenditeNav aggiornato** — tab "Fine Turno" visibile a tutti, altri tab admin-only
- **Route** `/vendite/fine-turno` → ChiusuraTurno, `/vendite/chiusure` → ChiusureTurnoLista (sostituisce vecchio CorrispettiviGestione)

### Changed
- **VenditeNav.jsx** v2.0 — visibilita' tab per ruolo (`roles: null` = tutti, `roles: ["admin"]` = solo admin)
- **App.jsx** — nuove route + vecchio `/vendite/chiusure-old` preservato come fallback
- **admin_finance.sqlite3** — nuove tabelle shift_closures, shift_preconti, shift_spese con auto-migrazione colonne

---

## 2026-03-14 — Cantina & Vini v3.7: Filtri locazione gerarchici, Dashboard KPI valore, Modifica massiva migliorata

### Added
- **Filtri locazione gerarchici (cascading)** — in Cantina e Stampa Filtrata, il singolo dropdown locazione è stato sostituito con 3 gruppi indipendenti (Frigorifero, Locazione 1, Locazione 2), ciascuno con selettore nome (contenitore) e spazio (sotto-contenitore) cascading
- **Backend filtri gerarchici** — 6 nuovi parametri (`frigo_nome`, `frigo_spazio`, `loc1_nome`, `loc1_spazio`, `loc2_nome`, `loc2_spazio`) nell'endpoint PDF filtrato, con logica di match gerarchica (nome solo → LIKE, nome+spazio → match esatto)
- **Dashboard KPI valore** — 2 nuove tile: Valore acquisto (somma QTA × listino) e Valore carta (somma QTA × prezzo carta) con formattazione euro
- **Dashboard liste espandibili** — vini in carta senza giacenza e vini fermi ora mostrano tutti i risultati (rimosso LIMIT) con pulsante "Mostra tutti / Comprimi"
- **Modifica massiva ordinabile** — click sugli header delle colonne per ordinare ASC/DESC con indicatori ▲/▼/⇅
- **Dropdown locazioni configurate ovunque** — LOCAZIONE_1 e LOCAZIONE_2 ora usano select con valori configurati (come FRIGORIFERO) in dettaglio, nuovo vino e modifica massiva
- **Filtro locazione in Cantina** — aggiunto nella barra filtri principale
- **Filtro locazione in PDF inventario filtrato** — backend + frontend

### Changed
- **MagazzinoVini.jsx** v3.0 — filtri locazione gerarchici con 6 select cascading
- **MagazzinoAdmin.jsx** v2.0 — colonne ordinabili, loc_select per FRIGORIFERO/LOCAZIONE_1/LOCAZIONE_2
- **MagazzinoViniDettaglio.jsx** v4.1 — dropdown configurati per locazioni 1 e 2
- **MagazzinoViniNuovo.jsx** v1.2 — dropdown configurati per locazioni 1 e 2
- **DashboardVini.jsx** v3.0 — liste espandibili, KPI valore, vini fermi senza LIMIT
- **vini_cantina_tools_router.py** v2.0 — filtri gerarchici, opzioni loc1/loc2 nell'endpoint locazioni-config
- **vini_magazzino_db.py** v1.3 — dashboard: valore_acquisto, valore_carta, total_alert_carta, total_vini_fermi, rimosso LIMIT
- **versions.jsx** — Cantina & Vini v3.6→v3.7, Sistema v4.2→v4.3

### Fixed
- **Vini fermi** — il calcolo ora include correttamente anche i vini senza alcun movimento (mai movimentati)

---

## 2026-03-13b — Modulo Banca v1.0 + Conversioni unità ingredienti + Smart Create UX

### Added
- **Modulo Banca v1.0** — nuovo modulo completo per monitoraggio movimenti bancari
  - **Migration 014** — 4 tabelle: `banca_movimenti`, `banca_categorie_map`, `banca_fatture_link`, `banca_import_log`
  - **banca_router.py** — 11 endpoint: import CSV Banco BPM con dedup (hash data+importo+descrizione), lista movimenti con filtri (data/categoria/tipo/search + paginazione), dashboard aggregati (KPI + breakdown per categoria + ultimi movimenti), categorie mapping banca→custom (CRUD), cross-ref fatture XML (match automatico ±5% importo ±10 giorni, link/unlink manuale), andamento temporale (giorno/settimana/mese), storico import
  - **6 pagine frontend**: BancaNav (tabs emerald), BancaMenu (5 card), BancaDashboard (4 KPI + grafico barre CSS + breakdown entrate/uscite per categoria + ultimi movimenti + filtri periodo con preset), BancaMovimenti (tabella filtrata + paginazione), BancaImport (upload CSV + storico), BancaCategorie (mapping custom con colori), BancaCrossRef (collega pagamenti a fatture con suggerimenti automatici)
  - **Integrazione**: main.py, App.jsx (6 route `/banca/*`), Home.jsx (card Banca), versions.jsx (Banca v1.0 beta), modules.json
- **Conversioni unità per ingrediente** — sistema conversioni custom + chain resolution
  - **Migration 013** — tabella `ingredient_unit_conversions` (per-ingredient custom conversions)
  - **`convert_qty` potenziato** — cerca prima conversioni custom (diretta, inversa, chain), poi fallback a standard
  - **`_save_price_from_riga`** — auto-normalizza prezzi fattura usando `convert_qty`
  - **Endpoint CRUD** in ingredients router: GET/POST/DELETE conversioni per ingrediente
  - **UI** in RicetteIngredientiPrezzi.jsx v2.0 — sezione espandibile "Conversioni unità personalizzate"
- **Smart Create: Seleziona/Deseleziona tutti** — pulsanti nel tab Smart Create + default tutti deselezionati (l'utente sceglie manualmente)

### Changed
- **RicetteMatching.jsx** v5.1 — aggiunta select all/deselect all + default deselected
- **foodcost_recipes_router.py** — `convert_qty` accetta `ingredient_id` e `cur` opzionali per custom conversions
- **foodcost_matching_router.py** — `_save_price_from_riga` con auto-normalizzazione prezzo
- **foodcost_ingredients_router.py** v1.4 — endpoint conversioni unità
- **RicetteIngredientiPrezzi.jsx** v2.0 — sezione conversioni
- **versions.jsx** — aggiunta Banca v1.0 beta
- **App.jsx** v3.7 — 6 route banca
- **Home.jsx** v3.1 — card Banca in homepage
- **modules.json** — aggiunto modulo banca (admin only)

---

## 2026-03-13a — Ricette & Food Cost v3.0: Matching avanzato + Smart Create + Esclusioni

### Added
- **Smart Create** — tab nel Matching che analizza le righe fattura pending, raggruppa per descrizione normalizzata, pulisce i nomi con pipeline regex, suggerisce unita/categoria, fuzzy-match contro ingredienti esistenti, e crea ingredienti in blocco con auto-mapping
- **Esclusione fornitori** — tab "Fornitori" nel Matching: lista tutti i fornitori con righe pending, toggle per escludere quelli che non vendono ingredienti (servizi, attrezzature, ecc.). Endpoint `GET/POST /matching/suppliers`, toggle-exclusion
- **Ignora descrizioni non-ingrediente** — pulsante "Ignora" su ogni suggerimento Smart Create per escludere voci come trasporto, spedizione, consulenze. Tabelle `matching_description_exclusions` + `matching_ignored_righe`. Endpoint CRUD `/matching/ignore-description`, `/matching/ignored-descriptions`
- **Sezione "Descrizioni ignorate"** — espandibile in fondo al tab Smart Create, con ripristino one-click
- **RicetteDashboard.jsx** — pagina dashboard con 5 KPI + tabelle top5 FC e margini
- **RicetteSettings.jsx** — pagina strumenti con export JSON, export PDF per ricetta, import JSON
- **Migration 012** — `matching_description_exclusions` + `matching_ignored_righe`

### Changed
- **foodcost_matching_router.py** v3.0 — pipeline pulizia nomi (_NOISE_PATTERNS, _UNIT_MAP, _CATEGORY_HINTS), smart-suggest con grouping, bulk-create, esclusione fornitori e descrizioni nei query pending/smart-suggest
- **RicetteMatching.jsx** v5.0 — 4 tab: Da associare, Smart Create (con Ignora), Mappings, Fornitori
- **foodcost_recipes_router.py** — fix endpoint ordering (static paths prima di `{recipe_id}`)
- **App.jsx** — route `/ricette/dashboard`, `/ricette/settings`, redirect `/ricette/import` → `/ricette/settings`
- **Rimosso LIMIT 100** dalla query pending matching (mostrava solo 100 ingredienti su migliaia)
- **versions.jsx** — Ricette v2.0→v3.0, Sistema v4.1→v4.2

---

## 2026-03-11a — Riepilogo Chiusure + bugfix Dashboard e Import

### Added
- **CorrispettiviRiepilogo.jsx** — nuova pagina `/vendite/riepilogo` con riepilogo chiusure mese per mese, accordion per anno, KPI complessivi, click-through a dashboard mensile
- **Tab "Riepilogo"** in VenditeNav (ora 5 tab)
- **Tile "Riepilogo Mensile"** nel hub Gestione Vendite
- **scripts/report_chiusure_mensili.py** — report CLI chiusure da lanciare sul server

### Fixed
- **CorrispettiviDashboard 401** — usava `fetch()` senza JWT; sostituito con `apiFetch()`
- **Dashboard ignora query params** — click da Riepilogo a `/vendite/dashboard?year=2025&month=1` ora apre il mese corretto (legge `year`/`month` da URL con `useSearchParams`)
- **ImportResult senza conteggi** — endpoint non restituiva `inserted`/`updated`; aggiunti al modello Pydantic e alla risposta

---

## 2026-03-10g — Gestione Vendite v2.0: promozione a modulo top-level

### Added
- **Modulo "Gestione Vendite"** promosso a sezione top-level nella Home (ex Corrispettivi)
- **Route migrate** da `/admin/corrispettivi/*` a `/vendite/*` (5 route)
- **VenditeNav.jsx** — barra navigazione persistente per sezione vendite (4 tab: Chiusure, Dashboard, Annuale, Import)
- **VenditeMenu hub** — pagina menu rinnovata con mini-KPI, VersionBadge, tile Confronto Annuale
- **Tile "Gestione Vendite"** nella Home con badge versione

### Changed
- **CorrispettiviMenu.jsx** → hub "Gestione Vendite" con VenditeNav + KPI
- **CorrispettiviGestione.jsx** — VenditeNav, route `/vendite/chiusure`
- **CorrispettiviDashboard.jsx** — VenditeNav, route `/vendite/dashboard`
- **CorrispettiviAnnual.jsx** — VenditeNav, route `/vendite/annual`
- **CorrispettiviImport.jsx** — VenditeNav, route `/vendite/import`
- **AdminMenu.jsx** — rimossa tile Corrispettivi
- **Home.jsx** — aggiunta entry `vendite`, subtitle admin aggiornato
- **modules.json** — aggiunto modulo `vendite`, aggiornato admin
- **versions.jsx** — Corrispettivi v2.0 "Gestione Vendite", Sistema v4.1

---

## 2026-03-10f — Gestione Acquisti v2.0 + ViniNav + Versioning v4.0

### Added
- **Modulo "Gestione Acquisti"** promosso a sezione top-level nella Home
- **Route migrate** da `/admin/fatture/*` a `/acquisti/*` (8 route)
- **FattureFornitoriElenco.jsx** — elenco fornitori con ricerca, ordinamento, KPI
- **ViniNav.jsx** — barra navigazione persistente per modulo Vini (5 tab)
- **ViniNav applicata** a 11 pagine vini (rimosso MagazzinoSubMenu)
- **Tile "Gestione Acquisti"** nella Home
- **Docs/Modulo_Acquisti.md** — documentazione completa

### Changed
- **Home.jsx** — aggiunta entry `acquisti`, subtitle admin aggiornato
- **AdminMenu.jsx** — rimossa tile Fatture
- **FattureMenu.jsx** — rinominato "Gestione Acquisti", 3 colonne, link Home
- **FattureNav.jsx** — brand "Acquisti", link Home
- **modules.json** — aggiunto modulo `acquisti`
- **versions.jsx** — Vini v3.6, Fatture v2.0, Sistema v4.0

---

## 2026-03-10e — Sistema versioning moduli

### Added
- **`frontend/src/config/versions.js`** — config centralizzata versioni moduli + componente `VersionBadge` riutilizzabile
- **Badge versione su Home** — ogni tile modulo mostra la versione corrente con colore (verde=stabile, blu=beta)
- **Badge versione su menu moduli** — ViniMenu (v3.5), RicetteMenu (v2.0), AdminMenu (v3.5)
- **Footer sistema** — versione globale in fondo alla Home
- **Mappa versioni in SESSIONE.md** — tabella riepilogativa + reminder aggiornamento

---

## 2026-03-10d — Modulo Ricette & Food Cost v2 (rebuild completo)

### Added
- **Login tile-based con PIN** — selezione utente via tile colorate + PIN pad numerico, shake animation su errore, supporto tastiera
- **Ruolo "sala"** — nuovo ruolo equivalente a sommelier, propagato su 13+ file (router, modules.json, frontend)
- **Endpoint `GET /auth/tiles`** — lista utenti per UI login (pubblico)
- **Migrazione 007** — drop tabelle ricette vecchie, crea: `recipe_categories` (8 default), `recipes` v2 (is_base, selling_price, prep_time, category_id), `recipe_items` v2 (sub_recipe_id), `ingredient_supplier_map`
- **`foodcost_recipes_router.py`** (~500 righe) — CRUD ricette con:
  - Calcolo food cost ricorsivo con cycle detection
  - Sistema conversione unita' (kg/g, L/ml/cl, pz)
  - Sub-ricette (ingredient_id OR sub_recipe_id, mutuamente esclusivi)
  - Response: total_cost, cost_per_unit, food_cost_pct
  - Endpoint: GET/POST/PUT/DELETE ricette, GET/POST categorie, GET basi
- **`foodcost_matching_router.py`** (~400 righe) — matching fatture XML a ingredienti:
  - GET /matching/pending, GET /matching/suggest (fuzzy SequenceMatcher)
  - POST /matching/confirm, POST /matching/auto (batch)
  - GET/DELETE /matching/mappings
- **`foodcost_ingredients_router.py`** esteso — PUT ingredient, GET suppliers, GET/POST/DELETE prezzi
- **`RicetteDettaglio.jsx`** — visualizzazione ricetta con 4 card riepilogo (costo totale, costo/porzione, vendita, FC%), tabella ingredienti con costo riga, totale footer
- **`RicetteModifica.jsx`** — form modifica precaricato, salva con PUT
- **`RicetteMatching.jsx`** — UI matching fatture a 2 tab (pending + mappings), suggerimenti fuzzy, auto-match
- **Route**: `/ricette/:id`, `/ricette/modifica/:id`, `/ricette/matching`
- **`docs/design_ricette_foodcost_v2.md`** — design document completo del modulo
- **Task #25 roadmap** — sistema permessi centralizzato (TODO)

### Changed
- **`RicetteArchivio.jsx`** — riscritto: tabella con food cost %, badge colorati (verde/giallo/rosso), filtri nome/tipo/categoria, azioni modifica/disattiva
- **`RicetteNuova.jsx`** — riscritto v2: categorie da DB, checkbox "ricetta base", pulsanti separati +Ingrediente/+Sub-ricetta, riordino righe, prezzo vendita, tempo preparazione
- **`RicetteMenu.jsx`** — aggiunta tile "Matching fatture"
- **`foodcost_db.py`** — semplificato, solo tabelle base (migrazioni fanno il resto)
- **`App.jsx`** — registrate 3 nuove route ricette + 1 matching
- **`app/data/users.json`** — 3 utenti reali (marco admin, iryna/paolo sala) con PIN hash
- **`auth_service.py`** — display_name, list_tiles(), ruolo "sala" in VALID_ROLES

### Fixed
- **`delete_movimento()`** — ora riconcilia TUTTE le colonne quantita' (QTA_FRIGO, QTA_LOC1/2/3), non solo QTA_TOTALE
- **Ricerca vendite** — `search_vini_autocomplete()` con parametro `solo_disponibili=true` per nascondere vini a giacenza zero

### Removed
- **`app/routers/ricette.py`** — router orfano mai montato (sostituito da foodcost_recipes_router)
- **`app/models/ricette_db.py`** — DB parallelo mai usato (sostituito da foodcost_db con migrazioni)

---

## 2026-03-10c — Riorganizzazione menu Cantina + fix PDF + Impostazioni Carta

### Added
- **"📄 Genera Carta PDF"** nel submenu Cantina — bottone diretto che scarica il PDF senza pagine intermedie (visibile a tutti)
- **Impostazioni Ordinamento Carta** in Strumenti — UI completa per:
  - Ordine Tipologie (lista riordinabile con frecce ▲▼ + salva)
  - Ordine Nazioni (lista riordinabile + salva)
  - Ordine Regioni per nazione (select nazione → lista riordinabile + salva)
  - Filtri Carta (quantità minima, mostra negativi, mostra senza prezzo)
- **Registro Movimenti** e **Modifica Massiva** accessibili da Strumenti (pulsanti rapidi in cima)

### Changed
- **MagazzinoSubMenu.jsx**: rimossi "Registro movimenti" e "Modifica massiva" dal menu (spostati in Strumenti); aggiunto bottone "Genera Carta PDF"
- **CantinaTools.jsx** (v2.0): riscritto con 4 sezioni: Sync, Import/Export, Genera Carta (HTML+PDF+Word), Impostazioni Ordinamento
- **vini_cantina_tools_router.py**: fix PDF frontespizio — corrette classi CSS (`front-logo`, `front-title`, `front-subtitle`), aggiunto wrapper `carta-body`, corretto `base_url` e caricamento CSS per match esatto con vecchio sistema

### Fixed
- **PDF cantina**: logo non visibile, titolo sbagliato, frontespizio su 2 pagine, subtitle diverso — ora identico al PDF generato dal vecchio sistema

---

## 2026-03-10b — Strumenti Cantina: ponte Excel ↔ Cantina + Genera Carta

### Added
- **vini_cantina_tools_router.py**: nuovo router backend con 6 endpoint:
  - `POST /vini/cantina-tools/sync-from-excel` — sincronizza vini.sqlite3 → cantina (upsert: anagrafica aggiornata, giacenze intatte per vini esistenti)
  - `POST /vini/cantina-tools/import-excel` — import diretto Excel → cantina (senza passare dal vecchio DB)
  - `GET /vini/cantina-tools/export-excel` — esporta cantina in .xlsx compatibile con Excel storico
  - `GET /vini/cantina-tools/carta-cantina` — genera carta HTML dal DB cantina
  - `GET /vini/cantina-tools/carta-cantina/pdf` — genera PDF carta dal DB cantina
  - `GET /vini/cantina-tools/carta-cantina/docx` — genera DOCX carta dal DB cantina
- **CantinaTools.jsx**: pagina frontend admin-only con UI per sync, import, export e genera carta
- **Colonna ORIGINE** in `vini_magazzino`: flag 'EXCEL' o 'MANUALE' per tracciare provenienza vini
- Route `/vini/magazzino/tools` in App.jsx
- Link "🔧 Strumenti" in MagazzinoSubMenu.jsx (admin only)
- Autenticazione via query token per endpoint di download (window.open)

### Changed
- **vini_magazzino_db.py**: `create_vino()` ora setta ORIGINE='MANUALE' di default; `upsert_vino_from_carta()` setta ORIGINE='EXCEL'
- **main.py**: registrato nuovo router `vini_cantina_tools_router`

---

## 2026-03-10 — Reforming Modulo Vini (v2026.03.10a)

### Added
- **RegistroMovimenti.jsx**: pagina admin-only con log globale di tutti i movimenti cantina
  - Filtri: tipo, testo (vino/produttore), range date, con paginazione server-side (50/pagina)
  - Click su vino → scheda dettaglio
  - Bottone "Pulisci filtri" + "Aggiorna"
- `MagazzinoSubMenu.jsx`: aggiunto link "📜 Registro movimenti" (admin only)
- `App.jsx`: route `/vini/magazzino/registro`

### Changed
- **ViniMenu.jsx**: da 6 a 5 voci — rimossa "Movimenti Cantina", "Magazzino Vini" rinominato in "Cantina"
- **MagazzinoSubMenu.jsx**: semplificato da 6 a 5 pulsanti (Cantina, Nuovo vino + admin: Registro movimenti, Modifica massiva)
- **App.jsx**: rimosse route orfane `/vini/movimenti` e `/vini/magazzino/:id/movimenti`
- **MagazzinoVini.jsx**: titolo → "Cantina", aggiunto bottone "Pulisci filtri"
- **MagazzinoViniDettaglio.jsx**: fix layout form movimenti (grid 5→4 col), emoji nei tipi, bottone "← Cantina"
- **DashboardVini.jsx**: aggiornati pulsanti accesso rapido (+ Vendite, fix link Impostazioni, rinominato Cantina)

### Removed
- Route `/vini/movimenti` e `/vini/magazzino/:id/movimenti` (movimenti ora solo da scheda vino)

---

## 2026-03-09 — Admin Magazzino + Vendite Bottiglia/Calici (v2026.03.09e)

### Added
- `MagazzinoAdmin.jsx`: pagina admin-only per modifica massiva vini
  - Tabella spreadsheet-like con 21 colonne editabili (descrizione, produttore, tipologia, prezzi, giacenze, stati operativi, flag)
  - Filtri client-side: ricerca testo, tipologia, nazione, solo giacenza, solo in carta
  - Salvataggio bulk: raccolta modifiche lato client, invio singolo al backend
  - Eliminazione per riga con doppia conferma
  - Celle modificate evidenziate in ambra
  - Accesso negato per non-admin con schermata dedicata
- `vini_magazzino_db.py`: nuove funzioni `bulk_update_vini()` e `delete_vino()`
- `vini_magazzino_router.py`: nuovi endpoint `PATCH /bulk-update` e `DELETE /delete-vino/{id}` (admin only)
- `App.jsx`: route `/vini/magazzino/admin` + route `/vini/magazzino/:id/movimenti`
- `MagazzinoSubMenu.jsx`: link "⚙️ Admin" visibile solo per role=admin

### Changed
- `ViniVendite.jsx` (v2.0): semplificata a sole vendite con toggle Bottiglia/Calici
  - Rimossi scarichi/carichi/rettifiche (restano in sezione Magazzino)
  - Tag `[BOTTIGLIA]`/`[CALICI]` nel campo note per distinguere modalità vendita
  - Storico filtrato di default solo su movimenti VENDITA

---

## 2026-03-09 — Hub Vendite & Scarichi + Locazione obbligatoria (v2026.03.09d)

### Added
- `ViniVendite.jsx` (v1.0): riscritta da placeholder a hub operativo completo:
  - **Registrazione rapida**: ricerca vino con autocomplete, selezione tipo (VENDITA/SCARICO/CARICO/RETTIFICA), **locazione obbligatoria** per vendita/scarico, quantità, note, registrazione in un click
  - **Storico movimenti globale**: tabella paginata di tutti i movimenti della cantina con filtri per tipo, testo, range date
  - **KPI rapidi**: vendite oggi, 7gg, 30gg, bottiglie totali in cantina
  - Click su vino nello storico → navigazione a scheda dettaglio
  - Badge `#id` e stile coerente con il resto del modulo
- `vini_magazzino_db.py`: nuove funzioni:
  - `list_movimenti_globali()`: query cross-vino con filtri tipo/testo/date e paginazione (LIMIT/OFFSET + COUNT)
  - `search_vini_autocomplete()`: ricerca rapida per form registrazione (id, descrizione, produttore, QTA, prezzi)
- `vini_magazzino_router.py`: nuovi endpoint:
  - `GET /vini/magazzino/movimenti-globali` — movimenti globali con filtri e paginazione
  - `GET /vini/magazzino/autocomplete?q=...` — autocomplete vini per registrazione rapida
  - Entrambi dichiarati prima di `/{vino_id}` per evitare conflitti path FastAPI
- `MagazzinoSubMenu.jsx`: aggiunto link "🛒 Vendite & Scarichi" → `/vini/vendite`

### Changed
- **`registra_movimento()` — locazione reale**: ora aggiorna anche la colonna `QTA_<LOC>` corrispondente. Per VENDITA e SCARICO la locazione è **obbligatoria** (validazione backend + frontend)
- **`MovimentiCantina.jsx`**: campo locazione da testo libero a dropdown (frigo/loc1/loc2/loc3), obbligatorio per VENDITA/SCARICO, disabilitato per RETTIFICA
- **`MagazzinoViniDettaglio.jsx`**: stessa modifica al form movimenti nella scheda dettaglio

---

## 2026-03-09 — Dashboard Vini operativa, analytics vendite, UX miglioramenti (v2026.03.09c)

### Added
- `DashboardVini.jsx` (v2.0 → v2.1): riscritta completamente da placeholder a dashboard operativa:
  - **Riga KPI Stock** (4 tile): bottiglie in cantina, vini in carta, senza prezzo listino, vini fermi 30gg
  - **Riga KPI Vendite** (2 tile): bottiglie vendute ultimi 7gg / 30gg
  - **Drill-down interattivo**: click su tile "senza listino" → tabella inline con tutti i vini da completare; click su tile "vini fermi" → lista con giacenza e data ultimo movimento; click di nuovo chiude il pannello
  - **Vendite recenti** (viola): ultimi 8 movimenti di tipo VENDITA, con vino e data
  - **Movimenti operativi** (neutro): ultimi 6 tra CARICO / SCARICO / RETTIFICA con badge tipo colorato
  - **Top venduti 30gg**: ranking a barre dei vini più venduti nell'ultimo mese, a larghezza piena
  - **Distribuzione tipologie**: barre proporzionali per tipologia con contatore referenze
  - **Accesso rapido**: link a Magazzino, Nuovo vino, Carta vini, Impostazioni
  - Badge `#id` in stile `bg-slate-700` su alert e drill-down
- `vini_magazzino_db.py`: aggiunte query per `get_dashboard_stats()`:
  - `kpi_vendite`: vendute_7gg, vendute_30gg (WHERE tipo='VENDITA')
  - `vendite_recenti`: ultimi 8 movimenti VENDITA con join su descrizione vino
  - `movimenti_operativi`: ultimi 6 CARICO/SCARICO/RETTIFICA
  - `top_venduti_30gg`: top 8 per SUM(qta) su VENDITA ultimi 30gg
  - `vini_fermi`: vini con QTA_TOTALE > 0 e nessun movimento negli ultimi 30 giorni (LEFT JOIN + HAVING)
- `vini_magazzino_router.py`: aggiunto endpoint `GET /dashboard` (dichiarato prima di `/{vino_id}` per evitare conflitti di routing FastAPI)
- Dashboard raggiungibile da: NavLink `MagazzinoSubMenu.jsx`, card `ViniMenu.jsx`, route `/vini/dashboard` in `App.jsx`

### Changed
- `MagazzinoVini.jsx`: pannello destro semplificato — rimosso bottone "📦 Movimenti" separato; rinominato unico bottone in "🍷 Apri scheda completa" (movimenti ora integrati nella scheda dettaglio)
- Badge `#id` standardizzato a `bg-slate-700 text-white` su tutte le pagine (era `bg-amber-900` — conflitto visivo con i bottoni ambra)

### Fixed
- `vini_magazzino_router.py`: rimossi 12 caratteri smart quote (U+201C/U+201D) nelle stringhe — causavano `SyntaxError: invalid character` al boot del backend
- `scripts/deploy.sh`: corretto mode bit git a `100755` (era `100644`) — risolto `Permission denied` ad ogni deploy
- `push.sh`: riscritto per usare comandi SSH diretti invece di `./scripts/deploy.sh` — più robusto e non dipende dal mode bit
- Sudoers configurato sul VPS per `systemctl restart` senza password — deploy non-interattivo da SSH

### Docs
- `modulo_magazzino_vini.md`: aggiornato con sezioni Movimenti, Dashboard, Scheda dettaglio v3.0
- `Roadmap.md`: aggiunti task #23 (dashboard vini), #24 (badge ID); marcati come chiusi

---

## 2026-03-09 — Magazzino vini: edit, note, movimenti, role check (v2026.03.09b)

### Security
- `vini_magazzino_router.py`: aggiunto role check su `DELETE /movimenti/{id}` — solo admin o sommelier possono eliminare movimenti (#12 chiuso)
- Rimosso endpoint `/vini/magazzino/duplicate-check` ridondante (#10 chiuso) — mantenuto solo `POST /check-duplicati` (più pulito, usa `find_potential_duplicates` DB-side)

### Added
- `vini_magazzino_db.py`: aggiunta funzione `delete_nota(nota_id)` per eliminare note operative
- `vini_magazzino_router.py`: aggiunto `DELETE /{vino_id}/note/{nota_id}` — elimina nota e ritorna lista aggiornata
- `MagazzinoViniDettaglio.jsx` (v2.0): riscritta con tre sezioni:
  - **Anagrafica** — view + edit mode inline (PATCH `/vini/magazzino/{id}`) con tutti i campi
  - **Giacenze per locazione** — view + edit separato; salvataggio registra automaticamente RETTIFICA nello storico movimenti se QTA_TOTALE cambia
  - **Note operative** — add + delete note (usa `GET/POST/DELETE /note`)
- `MovimentiCantina.jsx` (v2.0): migrato da `fetch` grezzo ad `apiFetch` (redirect 401 automatico); aggiunto bottone elimina movimento (visibile solo ad admin/sommelier)

### Changed
- `MagazzinoVini.jsx`: rimosso bottone logout locale (gestito globalmente da `Header.jsx`)
- `MagazzinoViniDettaglio.jsx`: rimosso bottone logout locale

### Docs
- `roadmap.md`: aggiornati task #10, #12 come chiusi; aggiornate feature #17 (Magazzino Vini)

---

## 2026-03-09 — Gestione utenti, permessi moduli, sicurezza auth (v2026.03.09)

### Security
- `auth_service.py`: sostituito USERS dict con password in chiaro con hash `sha256_crypt` via `passlib.CryptContext`
- `authenticate_user()` usa `security.verify_password()` — nessuna password in chiaro nel codice
- `SECRET_KEY` caricata da `.env` via `python-dotenv` (fallback al valore hardcoded)
- `scripts/gen_passwords.py`: utility CLI per rigenerare hash al cambio password

### Added
- `app/data/users.json`: store persistente utenti (caricato a boot, aggiornato ad ogni modifica)
- `app/routers/users_router.py`: CRUD utenti — `GET/POST /auth/users`, `DELETE /{username}`, `PUT /{username}/password`, `PUT /{username}/role`. Admin: accesso totale; non-admin: solo propria password con verifica
- `app/data/modules.json`: permessi moduli per ruolo (`roles[]` per modulo)
- `app/routers/modules_router.py`: `GET /settings/modules` (tutti autenticati), `PUT /settings/modules` (admin only). Admin sempre incluso, modulo admin non disabilitabile
- `frontend/src/pages/admin/ImpostazioniSistema.jsx`: pagina unica con due tab — **Utenti** (crea/modifica/elimina/cambio password/cambio ruolo) e **Moduli & Permessi** (griglia checkbox ruolo × modulo)
- Logout button cablato in `Header.jsx` — visibile su tutte le pagine post-login
- `Home.jsx` dinamica: mostra solo i moduli accessibili al ruolo dell'utente corrente

### Changed
- `AdminMenu.jsx`: due card separate (Impostazioni + Gestione Utenti) → una sola card **Impostazioni** → `/admin/impostazioni`
- `LoginForm.jsx`: salva `username` in localStorage (necessario per UI "Tu" in gestione utenti)
- `App.jsx`: `Header` montato globalmente con `onLogout`; route `/admin/impostazioni` aggiunta

### Docs
- `roadmap.md`: aggiornato con task #1, #3, #7 chiusi
- `sessione.md`: aggiornato con lavoro della sessione 2026-03-09

---

## 2026-03-08 — Fix sicurezza, bug e refactor frontend (v2026.03.08)

### Security
- `Depends(get_current_user)` aggiunto a livello router su 5 endpoint pubblici: `admin_finance`, `fe_import`, `foodcost_ingredients`, `foodcost_recipes`, `vini_settings`

### Fixed
- Bug pie chart pagamenti in `CorrispettiviDashboard.jsx`: `pag.pos` → `pag.pos_bpm`, `pag.sella` → `pag.pos_sella`
- `carta_vini_service.py`: `if prezzo:` → `if prezzo not in (None, "")` — fix prezzo=0 in preview HTML
- `vini_router.py`: rimossa funzione `slugify` duplicata, importata da `carta_vini_service`
- Rimosso `console.log("API_BASE:", API_BASE)` da `LoginForm.jsx`

### Added
- `pyxlsb` aggiunto a `requirements.txt` (necessario per import Excel .xlsb)
- `frontend/src/config/api.js`: `apiFetch()` — wrapper centralizzato di `fetch` con auto-inject token Authorization e redirect automatico al login su 401
- `frontend/src/pages/admin/CorrispettiviAnnual.jsx`: nuova pagina confronto annuale con grafico e tabella mensile
- Route `/admin/corrispettivi/annual` in `App.jsx`
- Setup git bare repo VPS (`/home/marco/trgb/trgb.git`) con post-receive hook per auto-deploy su `git push`
- `scripts/setup_git_server.sh`: script one-time setup VPS

### Changed
- Gestione 401 rimossa da 6 pagine (ViniCarta, MagazzinoVini, MagazzinoViniDettaglio, MagazzinoViniNuovo, DipendentiAnagrafica, CorrispettiviAnnual) — ora centralizzata in `apiFetch()`

### Docs
- Docs consolidati da 18 a 13 file, tutti in minuscolo
- `database.md`: unificato da `Database_Vini.md` + `Database_FoodCost.md`
- `architettura.md`: merge di `VersionMap.md`
- `deploy.md`: merge di `troubleshooting.md`
- Eliminati: `sistema-vini.md`, `to-do.md`, `version.json`, `Index.md`

---

## 2025-12-05 — Modulo FE XML esteso (v2025.12.05-1)
### Added
- Sezione documentazione completa nel README  
- Descrizione architetturale + routing + frontend  
- Dettaglio endpoints e flusso operativo  

### Updated
- Modulo FE XML porta versione → `v2025.12.05-1`
- Documentazione `/docs/Modulo_FattureXML.md` integrata  

### Notes
- Il modulo è ora ufficialmente considerato "prima release operativa"


# 🗓️ 2025-12-05 — Versione 2025.12.05 (Master Integrato)

## ✨ Aggiunto

### Modulo Fatture Elettroniche (FE XML)
- Nuovo router `fe_import.py`
- Funzioni:
  - parsing XML (FatturaPA)
  - hashing SHA-256 anti-duplicati
  - estrazione fornitori, numeri fattura, date, imponibili, IVA, totale
  - estrazione righe (descrizione, quantità, prezzo, IVA)
- Endpoint:
  - `POST /contabilita/fe/import`  
  - `GET /contabilita/fe/fatture`
  - `GET /contabilita/fe/fatture/{id}`
  - `GET /contabilita/fe/stats/fornitori`
  - `GET /contabilita/fe/stats/mensili`
- Creazione tabelle nel DB:
  - `fe_fatture`  
  - `fe_righe`
- Dashboard acquisti frontend:
  - top fornitori
  - andamento mensile
  - filtro anno dinamico
- UI:
  - pagina `FattureElettroniche.jsx`
  - uploading multiplo
  - gestione duplicati
  - dettaglio righe completo
  - formattazione prezzi, valute e date

---

## 🛠️ Modulo Magazzino Vini — Refactor completo

### Nuove funzionalità frontend
- Filtri dinamici dipendenti (tipologia/nazione/regione/produttore)
- Filtri testuali multi-campo:
  - descrizione
  - denominazione
  - produttore
  - codice
  - regione
  - nazione
- Filtri numerici avanzati:
  - giacenza totale (>, <, tra)
  - checkbox "solo positivi"
  - prezzo carta
- Ordinamenti migliorati
- Prestazioni ottimizzate con `useMemo`

### Backend — Struttura magazzino
- Aggiunto campo `id_excel`
- Reintroduzione struttura coerente di locazioni:
  - frigo
  - loc1
  - loc2
  - loc3 (future use)
- Calcolo automatico `qta_totale`
- Refactor funzioni:
  - `create_vino()`
  - `update_vino()`
- Migliorata coerenza dati dopo aggiornamenti multipli

### Import Excel
- Modalità SAFE introdotta:
  - evita sovrascrittura ID
  - aggiorna solo campi consentiti
  - mantiene allineamento storico
- Modalità FORCE (solo admin) — predisposta

---

## 🧹 Miglioramenti UI/UX

- Nuova sezione **/admin**
- Interfaccia vini backend migliorata
- Stile grafico omogeneo con TRGB design
- Pannelli più leggibili e uniformati

---

## 🗄️ Documentazione (grande aggiornamento)

- Riscritto completamente il README principale
- Creato sistema documentazione modulare:
  - `Modulo_Vini.md`
  - `Modulo_MagazzinoVini.md`
  - `Modulo_FoodCost.md`
  - `Modulo_FattureXML.md`
- Creati file DB dedicati:
  - `DATABASE_Vini.md`
  - `DATABASE_FoodCost.md`
- Creato `INDEX.md`
- Creato `ROADMAP.md`
- Creato `CHANGELOG.md` (esteso)
- Creato `PROMPT_CANVAS.md`

---

## 🔧 Backend & DevOps

- Aggiornata configurazione systemd:
  - `trgb-backend.service`
  - `trgb-frontend.service`
- Migliorato `deploy.sh`:
  - quick deploy
  - full deploy
  - safe deploy
  - rollback
- Aggiornati file `.env` + separazione produzione/sviluppo
- Rifinito reverse proxy Nginx:
  - `trgb.tregobbi.it` (backend)
  - `app.tregobbi.it` (frontend)
- UFW:
  - bloccate porte 8000 e 5173 dall'esterno
  - aggiunta apertura loopback per Vite

---

## 🐞 Bugfix importanti

### Magazzino vini
- Rimossi duplicati storici
- Ripristinati **1186 record reali**
- Eliminati ID corrotti
- Ripuliti import precedenti non coerenti

### Backend generale
- Fix encoding PDF
- Fix salvare prezzi carta vs listino
- Fix ordinamento produttori con apostrofi
- Fix annate stringa/numero

---

# 🗓️ 2025-12-03 — Versione 2025.12.03

## ✨ Aggiunto
- Prima versione documentation system  
- Prima versione modulo Magazzino Vini rifattorizzato

## 🐞 Risolto
- Duplicati magazzino storici  
- QTA negative generate da import errati

---

# 🗓️ 2025-11 — Versioni preliminari

## ✨ Aggiunto
- Carta Vini stabile (HTML/PDF/DOCX)
- Template PDF unificato
- Generatore PDF staff/cliente
- Funzioni base foodcost (ricette + ingredienti)
- Deploy su VPS + servizi systemd

## 🔧 Migliorato
- Vite configurato per VPS
- Backend ottimizzato per caricamenti Excel
- Repository vini riscritto per prestazioni

## 🐞 Risolti
- Problemi CORS
- Loop infinito Vite reload
- Reset porta 8000 al deploy
