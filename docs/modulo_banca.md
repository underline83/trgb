# Modulo Banca / Flussi di Cassa — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03 (riconciliazione completa doc ↔ codice)
> **Vedi anche:** [modulo_controllo_gestione.md](modulo_controllo_gestione.md), [spec_riconciliazione.md](spec_riconciliazione.md), [stato_pagamento_unificato.md](stato_pagamento_unificato.md), [modulo_vendite.md](modulo_vendite.md)

**Nome utente:** "Flussi di Cassa" (rinominato da "Banca"; id modulo interno resta `banca`)
**Versioni (`versions.jsx`):** flussiCassa **v1.20** (beta, `versions.jsx:104`) · cartaCredito **v1.8** (beta, `versions.jsx:211`)
**Sezione FE top-level:** `/flussi-cassa/*` — le vecchie route `/banca/*` sono redirect (`App.jsx:381-388`)
**Backend prefix:** `/banca/*` (`banca_router.py`) + `/banca/carta/*` (`banca_carta_router.py`). **Non esiste** un prefix backend `/flussi-cassa/*`: i tab Contanti e Mance riusano endpoint `/admin/finance/*` e `/controllo-gestione/*` (vedi §8, §9)
**DB:** `foodcost.db` (tabelle `banca_*`, `carte_credito`, `carta_*`, `cg_uscite`, `cg_entrate`) + `admin_finance.sqlite3` (contanti/mance, condiviso con Vendite/Cassa). Path tenant-aware via `locale_data_path()` → live in `locali/tregobbi/data/`
**Roadmap:** sezione B di `docs/roadmap.md` (B.1–B.8, righe 241-248)

---

# 0. Indice

1. Panoramica e scopo
2. Nomenclatura e storia
3. Architettura (DB, router, auth)
4. Import CSV movimenti CC
5. Movimenti, dashboard, categorie
6. Riconciliazione (cross-ref) e stati pagamento
7. Carta di Credito (sub-area CC.*)
8. Contanti (tab riusato da Vendite/CG)
9. Mance (vista read-only su chiusure turno)
10. Frontend
11. Cross-modulo
12. Roadmap

---

# 1. Panoramica e scopo

Il modulo **Flussi di Cassa** è il punto di verità per i soldi che passano dal conto corrente e dalla carta di credito:

- **Import CSV Banco BPM** dei movimenti di conto corrente (con dedup e detect formato)
- **Movimenti CC** — lista con filtri, categorie banca + mapping custom
- **Dashboard** — saldo periodo, entrate/uscite, breakdown per categoria, serie temporale
- **Riconciliazione (cross-ref)** — collegamento movimenti ↔ fatture (`banca_fatture_link`), ↔ uscite CG dirette (`cg_uscite.banca_movimento_id`), ↔ entrate (`cg_entrate.banca_movimento_id`), con suggerimenti a scoring
- **Carta di Credito** — import PDF estratto Banco BPM, match movimento carta ↔ uscita CG (livello A) e estratto ↔ addebito mensile sul CC (livello B), riepilogo mensile per categoria MCC
- **Contanti** (tab) — versamenti in banca, spese cash, saldo cassa (endpoint del modulo Vendite/CG, vedi §8)
- **Mance** (tab) — vista read-only delle mance registrate nelle chiusure turno (vedi §9)

**NON è** il modulo che importa fatture (quello è Acquisti) né quello che registra corrispettivi (quello è Vendite/Cassa). Legge il flusso del denaro e lo abbina alle uscite/entrate di Controllo Gestione.

---

# 2. Nomenclatura e storia

- Il modulo è nato come "Banca" (`/banca` nel FE). Oggi il nome utente è **Flussi di Cassa** e la sezione FE è `/flussi-cassa/*`; le route `/banca/*` FE sopravvivono solo come `<Navigate>` redirect (`App.jsx:381-388`).
- Il **backend è rimasto su prefix `/banca`**: rinominare gli endpoint non è mai stato fatto (né necessario).
- I tab **Contanti** e **Mance** sono stati spostati dentro Flussi di Cassa dal modulo Vendite (route legacy `/vendite/contanti`, `/vendite/mance`, `/vendite/preconti` → redirect, `App.jsx:338-340`).
- La card Home "Flussi di Cassa" (`dashboard_router.py:1355-1393`) NON legge `banca_movimenti`: legge la tabella legacy `finanza_movimenti` (mig 015, colonne `dare`/`avere`). È un residuo noto, commentato nel codice stesso.

> **(storico, superato)** Le vecchie versioni di questa pagina descrivevano router `flussi_cassa_contanti_router.py` / `flussi_cassa_mance_router.py`, un DB `cg.sqlite3`, un DB `flussi_cassa.sqlite3` e tabelle `cg_movimenti_banca`, `cg_estratti_conto`, `cg_match_movimenti_uscite`, `cassa_movimenti`, `mance_giorni`, `mance_distribuzioni`. **Niente di tutto questo è mai esistito nel codice**: era una "convenzione attesa" scritta prima della verifica.

---

# 3. Architettura

## 3.1 DB reale

`foodcost.db` (unico DB per tutto il lato banca/carta — condiviso con Acquisti e Controllo Gestione):

| Tabella | Migrazione | Scopo |
|---------|-----------|-------|
| `banca_movimenti` | 014 (+059, +082, +140) | Movimenti CC importati da CSV + pseudo-movimenti carta (da PDF estratto). Dedup: `dedup_hash` UNIQUE (data+importo+descrizione normalizzata) |
| `banca_import_log` | 014 | Log import CSV (righe/nuovi/duplicati/range date) |
| `banca_categorie_map` | 014 | Mapping categoria banca → categoria custom (colore/icona/tipo) |
| `banca_categorie_registrazione` | 045 | Categorie per "registrare" un movimento come spesa/entrata CG, con pattern di auto-detect (anche con soglia importo, es. `DEBIT PAGAMENTO<50`) |
| `banca_fatture_link` | 014 | Link N:M movimento ↔ `fe_fatture` (UNIQUE su coppia). **Senza** colonna importo applicato (vedi §6.5) |
| `carte_credito` | 140 | Anagrafica multi-carta. PK funzionale `codice_posizione` UNIQUE, `banca_tag` UNIQUE (es. `CARTA_BPM_623`) |
| `carta_estratti` | 140 (+142) | Un record per PDF importato. Dedup `pdf_sha256` UNIQUE. `banca_movimento_id` = match livello B |
| `carta_match_settings` | 141 (+142) | Singleton tolleranze/pesi matcher carta (default in `carta_match_service.py:56-66`) |
| `cg_uscite`, `cg_entrate` | (modulo CG) | Bersaglio della riconciliazione: `banca_movimento_id` su entrambe |

Colonne aggiunte a `banca_movimenti` nel tempo: `riconciliazione_chiusa/_at/_note` (mig 059), `parcheggiato/_at` (mig 082), campi carta `carta_codice_riferimento` (UNIQUE se non NULL), `carta_mcc`, `carta_estratto_id`, `valuta_estera`, `importo_estero`, `cambio_valuta`, `magg_circuito`, `magg_cambio` (mig 140).

Migrazioni di pulizia dati storiche: 041/042 (dedup), 043 (link orfani), 046/058 (duplicati formato CSV vuoto+pieno), 063 (cleanup riconciliazioni su fornitori esclusi), 144 (`144_backfill_banca_rapporto_bpm.py`: backfill banca/rapporto su 420 movimenti importati dal formato BPM Online senza colonna Banca).

`admin_finance.sqlite3` (via router `admin_finance`, DB condiviso con Vendite/Cassa): `shift_closures` (mance, spese, preconti), `cash_deposits` (versamenti, con `banca_movimento_id` per il link al movimento CC in ingresso), tabelle spese cash/categorie/saldi iniziali. Dettaglio in [modulo_vendite.md](modulo_vendite.md).

## 3.2 Router e auth — STATO VERIFICATO 2026-08-03

| Router | File | Prefix | Auth |
|--------|------|--------|------|
| Banca | `app/routers/banca_router.py` | `/banca` | ✅ **router-level**: `dependencies=[Depends(get_current_user)]` (`banca_router.py:41-45`) |
| Banca Carta | `app/routers/banca_carta_router.py` | `/banca/carta` | ✅ **per-endpoint**: tutti i 16 endpoint hanno `Depends(get_current_user)` |
| Admin Finance (contanti/mance) | `app/routers/admin_finance.py` | `/admin/finance` | ✅ router-level (`admin_finance.py:29-33`); `GET /cash/deposit/bank-matches` richiede in più superadmin (`admin_finance.py:2255-2257`) |
| CG (movimenti contanti) | `app/routers/controllo_gestione_router.py` | `/controllo-gestione` | ✅ per-endpoint |

> **Audit 2026-06-12 [A1 CRIT] — RISOLTO.** L'audit aveva flaggato `banca_router` pubblico senza auth. Il fix è in produzione: auth a livello router con commento esplicito nel codice (`banca_router.py:40`). Verificato 2026-08-03: nessun endpoint `/banca/*` o `/banca/carta/*` è raggiungibile senza JWT.

Registrazione in `main.py:678-680` (`banca_router`, `banca_carta_router`).

---

# 4. Import CSV movimenti CC

Endpoint: `POST /banca/import` (`banca_router.py:257`) — multipart, solo `.csv`. UI: tab "Import" dentro `BancaImpostazioni.jsx:109-128` (la pagina dedicata `BancaImport.jsx` è legacy, vedi §10).

- **Formati riconosciuti** (CC.8.b, `banca_router.py:281-312`): `BPM_VECCHIO` (colonne Banca+Rapporto), `BPM_ONLINE` (export 7 colonne senza Banca/Rapporto → warning + default conto BPM 12200), `SCONOSCIUTO` (warning, import best-effort). La response include `formato_csv` e `warnings[]`.
- **Dedup hard**: `dedup_hash` UNIQUE = md5(data + importo + descrizione normalizzata senza punteggiatura, primi 40 char).
- **Dedup soft** (pattern mig 058): stesso giorno+importo con `ragione_sociale` una vuota e una piena → considerato lo stesso movimento, skip.
- Separatore CSV auto-detect (`;` vs `,`), encoding utf-8-sig con fallback latin-1, nomi colonna robusti a varianti maiuscole/minuscole.
- Log in `banca_import_log`; storico: `GET /banca/import-log` (`banca_router.py:2275`).
- Errore 400 se nessuna colonna riconosciuta e zero righe inserite.

> Il doc precedente citava "CSV Sella" e "conti BPM e/o Sella": nel codice **esiste solo il parser Banco BPM** (2 varianti di export). Il multi-conto è predisposto a livello dati (`banca`/`rapporto` per riga) ma senza UI di scelta conto (nota in `banca_router.py:352-356`, roadmap B.4).

---

# 5. Movimenti, dashboard, categorie

## 5.1 Endpoint `/banca/*` (movimenti e analisi)

| Metodo | Path | Riga | Cosa fa |
|--------|------|------|---------|
| GET | `/banca/movimenti` | 468 | Lista con filtri (data_da/a, categoria, tipo entrata/uscita, search, limit/offset). Esclude pseudo-movimenti carta (`banca LIKE 'CARTA_%'`) |
| PATCH | `/banca/movimenti/{id}/categoria` | 531 | Aggiorna categoria/sottocategoria banca del singolo movimento |
| GET | `/banca/dashboard` | 553 | Totali periodo, breakdown uscite/entrate per categoria, ultimi 10 movimenti (esclude carta) |
| GET | `/banca/andamento` | 2294 | Serie temporale entrate/uscite/netto per giorno/settimana/mese (esclude carta) |
| GET | `/banca/categorie` | 642 | Categorie banca aggregate con eventuale mapping custom |
| POST | `/banca/categorie/map` | 671 | Upsert mapping categoria banca → custom |
| DELETE | `/banca/categorie/map/{map_id}` | 696 | Elimina mapping |
| GET | `/banca/categorie-registrazione` | 1649 | Tutte le categorie registrazione (CRUD per Impostazioni) |
| POST | `/banca/categorie-registrazione` | 1660 | Crea categoria registrazione |
| PUT | `/banca/categorie-registrazione/{id}` | 1678 | Aggiorna |
| PATCH | `/banca/categorie-registrazione/{id}/toggle` | 1692 | Attiva/disattiva |
| GET | `/banca/import-log` | 2275 | Storico import CSV |
| GET | `/banca/duplicati` | 2106 | Rileva duplicati: classici (stessa data+importo+descrizione simile) e preautorizzazioni `-da contab` con gemello contabilizzato |
| DELETE | `/banca/duplicati/{keep_id}?delete_ids=` | 2204 | Elimina duplicati migrando i link al movimento mantenuto |

**Filtro carta (CC.6):** saldo, lista movimenti, dashboard, andamento e duplicati escludono i movimenti con `banca LIKE 'CARTA_%'` (`EXCLUDE_CARTA_SQL`, `banca_router.py:55-66`) perché sono acquisti carta importati dal PDF, non passaggi reali sul CC. La riconciliazione (cross-ref) invece li include.

## 5.2 UI

- `BancaDashboard.jsx` (`/flussi-cassa/dashboard`) → `/banca/dashboard` + `/banca/andamento` (righe 105-106).
- `BancaMovimenti.jsx` (`/flussi-cassa/cc`) → `/banca/categorie`, `/banca/movimenti`, PATCH categoria (righe 45, 80, 107).
- `BancaImpostazioni.jsx` (`/flussi-cassa/impostazioni`) → import CSV + import-log, mapping categorie, CRUD categorie registrazione, gestione duplicati, baseline cash-flow (`/admin/finance/cash/flow/baseline`, righe 983-1033) e soglie match carta (`/banca/carta/match-settings`, righe 1274-1316).

---

# 6. Riconciliazione (cross-ref) e stati pagamento

Cuore del modulo: pagina `BancaCrossRef.jsx` (`/flussi-cassa/cc/crossref`), workbench a tab (suggerimenti / senza match / parcheggiati / collegati).

## 6.1 Modello dei link

Un movimento bancario può essere collegato a tre tipi di oggetto:

1. **Fattura** — riga in `banca_fatture_link` (N:M) + propagazione a `cg_uscite` della fattura: `banca_movimento_id`, `stato='PAGATO'`, `importo_pagato=totale`, reset `in_pagamento_at`/`pagamento_batch_id` (bug D5 2026-04-27) — `banca_router.py:1207-1234`.
2. **Uscita CG diretta** (spesa fissa, tassa, stipendio…) — `cg_uscite.banca_movimento_id` valorizzato direttamente, stesso effetto su stato (`banca_router.py:1246-1263`).
3. **Entrata** (storno, nota di credito incassata) — `cg_entrate.banca_movimento_id` (`banca_router.py:1235-1245`).

**Multi-link e residuo:** `GET /banca/cross-ref` assembla per ogni movimento tutti i link e calcola `residuo = |importo| − Σ totali collegati`. Con residuo < 1€ il movimento è "completamente collegato". Un bonifico può pagare N fatture (es. mov #1416 → 6 uscite). **Lo split degli importi per link NON è modellato** (vedi §6.5).

## 6.2 Suggerimenti automatici

`GET /banca/cross-ref` (`banca_router.py:791`) produce fino a 8 suggerimenti per movimento scoperto, cercando in fatture non linkate e uscite CG aperte (`PROGRAMMATO`/`SCADUTO`/`PAGATO_MANUALE`):

- match per **nome fornitore** nella descrizione bancaria (parole >3 char, stopword societarie escluse);
- match per **importo simile** (±15%) entro ±30 giorni;
- scoring con bonus prossimità data (≤5gg / ≤15gg), penalità progressiva oltre 30gg e **cutoff duro a 180 giorni**; scarto se differenza importo >50% (con nome) o >20% (senza) — `_score_match`, `banca_router.py:733-788`;
- esclusione fatture di fornitori con `escluso_acquisti=1` (regola campi escluso);
- per le entrate senza link propone una `auto_categoria` via pattern delle categorie registrazione.

## 6.3 Endpoint cross-ref completi

| Metodo | Path | Riga | Cosa fa |
|--------|------|------|---------|
| GET | `/banca/cross-ref` | 791 | Worklist movimenti con link, residuo, flag `is_carta`, match A/B carta e suggerimenti |
| POST | `/banca/cross-ref/link` | 1190 | Crea link (body: `movimento_id` + uno tra `fattura_id`/`uscita_id`/`entrata_id`, `note`) |
| DELETE | `/banca/cross-ref/link/{link_id}` | 1273 | Rimuove link. `link_id` numerico = fattura; `uNNN` = uscita; `eNNN` = entrata (l'entrata viene CANCELLATA) |
| POST | `/banca/cross-ref/chiudi/{movimento_id}` | 1354 | Chiusura manuale (mig 059): marca riconciliato anche con residuo >1€. Richiede ≥1 link |
| POST | `/banca/cross-ref/riapri/{movimento_id}` | 1399 | Annulla la chiusura manuale |
| POST | `/banca/cross-ref/parcheggia-bulk` | 1432 | Parcheggia movimenti (S40-12): spariscono dai suggerimenti, tab dedicato |
| POST | `/banca/cross-ref/disparcheggia/{movimento_id}` | 1457 | Rimuove il parcheggio |
| GET | `/banca/cross-ref/search?q=` | 1476 | Ricerca manuale fatture+uscite+entrate per testo o importo |
| GET | `/banca/cross-ref/categorie` | 1630 | Categorie registrazione attive per tipo |
| GET | `/banca/cross-ref/auto-categoria/{movimento_id}` | 1708 | Auto-detect categoria dal pattern |
| POST | `/banca/cross-ref/registra` | 1728 | Registra il movimento come uscita (`cg_uscite` stato PAGATO) o entrata (`cg_entrate`) già collegata |
| POST | `/banca/cross-ref/registra-bulk` | 1804 | Registra N movimenti con la stessa categoria (skip silenzioso dei già collegati) |
| DELETE | `/banca/cross-ref/registra/{movimento_id}` | 1985 | Annulla registrazione: DELETE solo se `tipo_uscita` generato dal cross-ref (`SPESA_BANCARIA`, `COMMISSIONE_POS`, `IMPOSTA_BOLLO`, `ALTRO_USCITA`); altrimenti scollega senza distruggere (fix stipendi "Iryna" 2026-04-20) |
| POST | `/banca/cross-ref/chiudi-senza-fattura/{movimento_id}` | 1871 | CC.7: crea `cg_uscite` tipo `SPESA_NON_FATTURATA` (stato PAGATO, fuori scadenzario) + marca `riconciliazione_chiusa`. Reversibile |
| DELETE | `/banca/cross-ref/chiudi-senza-fattura/{movimento_id}` | 1950 | Riapre: cancella l'uscita e azzera il flag |

## 6.4 Effetto sugli stati pagamento (D1/D2 — [stato_pagamento_unificato.md](stato_pagamento_unificato.md) §15)

La riconciliazione bancaria è **l'unica via** per lo stato `pagato` pieno (D1 PAGATA senza modificatore). Il modificatore D2 `*` = "pagata NON riconciliata" corrisponde a `PAGATO_MANUALE`. Implementazione in `app/services/fatture_stato_service.py`:

- `on_riconciliazione_added(fattura_id)` (riga 225) — chiamato dopo INSERT in `banca_fatture_link`: forza `cg_uscite.stato='PAGATO'` ("la banca ha ragione"). Il `*` sparisce.
- `on_riconciliazione_removed(fattura_id)` (riga 235) — dopo DELETE del link: se non restano altri link/match torna a `PAGATO_MANUALE` (riappare il `*`, preserva l'intenzione utente; NON resetta a da_pagare).
- `set_stato()` rifiuta `pagato` manuale senza `force` e rifiuta modifiche a fatture riconciliate finché il link esiste (righe 192-202).
- Lo scollegamento di **uscite dirette** (non-fattura) riporta invece lo stato a `PROGRAMMATO`/`SCADUTO` in base alla scadenza (`banca_router.py:1295-1309`).
- La riconciliazione **non tocca mai D3** (scadenza/rateizzazione): quelle mutazioni hanno endpoint dedicati in CG.

## 6.5 Split importi — spec NON implementata

La [spec_riconciliazione.md](spec_riconciliazione.md) (draft 2026-04-16, mig 084 proposta) prevedeva `banca_fatture_link.importo_applicato`, stato `PAGATA_PARZIALE`, `riconciliazione_service.py`, `GET /banca/cross-ref/movimento/{id}/dettaglio` e `GET /fatture/{id}/pagamenti`. **Verificato 2026-08-03: nulla di tutto ciò esiste nel codice** (nessuna colonna importo su `banca_fatture_link`, nessun service, nessuno dei 2 endpoint). Il caso "bonifico che non quadra al centesimo" si gestisce ancora con l'escape hatch `riconciliazione_chiusa` + nota (mig 059).

---

# 7. Carta di Credito (sub-area CC.*)

Sub-area completa end-to-end (sessioni CC 2026-06-02 → 2026-06-13). Pagine: `CartaCreditoPage.jsx` (`/flussi-cassa/carta`) e `CartaRiepilogoPage.jsx` (`/flussi-cassa/carta/riepilogo`).

**Convenzione storage:** i movimenti carta vivono in `banca_movimenti` con `banca = 'CARTA_<EMITT>_<ULT3>'` (es. `CARTA_BPM_623`), `rapporto = codice_posizione`, importo negativo, dedup naturale su `carta_codice_riferimento` (23 cifre BPM, UNIQUE). Esclusi dal saldo CC via `WHERE banca NOT LIKE 'CARTA_%'`. Decisione 2026-06-02: riuso di `banca_movimenti` invece di una tabella `carta_movimenti` (razionale nella docstring di mig 140).

**Parser PDF** (`app/services/carta_pdf_parser.py`, dipendenza runtime `pdftotext`/poppler): estratto Banco BPM testuale; riga normale `[cod_rif 23] [mcc 8] [data_op] [data_reg] [descrizione] [importo]`; movimenti esteri su 2 righe con maggiorazioni circuito/cambio. Sanity check quadratura ai centesimi (totale movimenti e addebito CC): se non quadra l'upload risponde 422.

**Due livelli di riconciliazione** (service `app/services/carta_match_service.py`, settings singleton mig 141+142, default riga 56-66: tolleranza importo 0,50€, data 10gg, pesi 0.5/0.3/0.2, soglia auto 0.85; match B: 0,10€ / 3gg):

- **Livello A** — movimento carta ↔ `cg_uscite` con `metodo_pagamento='CARTA'` e `banca_movimento_id IS NULL`. Il link porta l'uscita da `PAGATO_MANUALE` a `PAGATO`; l'unlink la riporta a `PAGATO_MANUALE`.
- **Livello B** — estratto mensile ↔ movimento `banca_movimenti` del CC che rappresenta l'addebito unico dell'emittente (match su `addebito_totale_cc` + `data_valuta_addebito`, score 70% importo + 30% data). Registrato in `carta_estratti.banca_movimento_id`. Il cross-ref banca lo mostra come chip "Addebito carta — Estratto #N" (CC.8.c).

## 7.1 Endpoint `/banca/carta/*` (tutti autenticati)

| Metodo | Path | Riga | Cosa fa |
|--------|------|------|---------|
| POST | `/banca/carta/upload` | 133 | Upload PDF estratto: parse, crea carta se nuova, insert estratto + N movimenti. Dedup `pdf_sha256` (409 se già importato), 422 se non quadra |
| GET | `/banca/carta/carte` | 301 | Lista carte con conteggio estratti/movimenti |
| GET | `/banca/carta/carte/{id}` | 320 | Dettaglio carta |
| GET | `/banca/carta/estratti?carta_id=` | 339 | Lista estratti |
| GET | `/banca/carta/estratti/{id}` | 373 | Dettaglio estratto + movimenti con eventuale match A |
| DELETE | `/banca/carta/estratti/{id}` | 414 | Rollback import; 409 se esistono link a fatture o riconciliazioni CG |
| GET | `/banca/carta/match-settings` | 477 | Legge tolleranze/pesi (singleton) |
| PUT | `/banca/carta/match-settings` | 491 | Aggiorna con validazioni (somma pesi ≈ 1.0). UI: tab "Soglie match carta" in Impostazioni |
| GET | `/banca/carta/movimenti/{id}/candidati` | 594 | Uscite CG candidate al match A, ordinate per score |
| POST | `/banca/carta/movimenti/{id}/link` | 632 | Applica match A (uscita → PAGATO) |
| DELETE | `/banca/carta/movimenti/{id}/link` | 670 | Rimuove match A (uscita → PAGATO_MANUALE), idempotente |
| POST | `/banca/carta/estratti/{id}/automatch?dry_run=` | 694 | CC.4 D2: anteprima best-match per l'intero estratto; apply solo sui `mov_ids` confermati da UI |
| GET | `/banca/carta/estratti/{id}/candidati-cc` | 749 | Candidati match B (addebito mensile) |
| POST | `/banca/carta/estratti/{id}/link-cc` | 775 | Applica match B |
| DELETE | `/banca/carta/estratti/{id}/link-cc` | 800 | Rimuove match B |
| GET | `/banca/carta/riepilogo?carta_id=&from=&to=` | 874 | CC.5.b: aggregato mensile per categoria MCC (mappa hardcoded `MCC_TO_CATEGORIA`, righe 827-862: TRASPORTI/ALIMENTARI/SOFTWARE/ALBERGHI/RISTORANTI/FINANZIARI/SERVIZI/VARIE) |

Componenti FE dedicati: `components/carta/CercaUscitaModal.jsx` (candidati match A), `AutomatchModal.jsx` (bulk con checkbox), `CercaAddebitoCcModal.jsx` (match B).

## 7.2 Cronologia CC.* (storico, tutto FATTO)

CC.1 parser PDF · CC.2 schema+endpoint (mig 140) · CC.3 UI CartaCreditoPage · CC.4 D1 match manuale (mig 141) · CC.4 D2 automatch bulk · CC.4.e UI soglie · CC.5.a match B (mig 142) · CC.5.b riepilogo MCC · CC.6 + CC.6.fix coerenza CC↔carta (exclude, badge, subquery anti-duplicazione) · CC.7 + CC.7.fix chiudi senza fattura · CC.8/8.b/8.c parser CSV BPM Online + detect formato + match B nel cross-ref (2026-06-13). Manca solo l'alert UI nel TabImport per `warnings[]` (rimandato).

---

# 8. Contanti (tab riusato da Vendite/CG)

`/flussi-cassa/contanti` monta `FlussiCassaContanti.jsx`, che è un **wrapper**: `FlussiCassaNav` + `GestioneContantiContent` importato da `pages/admin/GestioneContanti.jsx` (`FlussiCassaContanti.jsx:6-12`). Il modulo Banca **non ha endpoint propri** per i contanti; la pagina chiama:

- `/admin/finance/cash/*` (router `admin_finance`, DB `admin_finance.sqlite3`): `daily`, `flow`, `flow/baseline`, `spese/baseline`, `deposit` (POST/DELETE), `deposits`, `deposit/bank-matches`, `expense` (POST/DELETE), `expenses`, `expense-categories` + CRUD categoria, `opening-balance/{year}` (GET/PUT) — `admin_finance.py:1599-2688`.
- `/admin/finance/shift-closures/spese` e `/preconti` (spese cash e pre-conti dalle chiusure turno).
- `/controllo-gestione/movimenti-contanti` (`controllo_gestione_router.py:4631`): uscite CG con `metodo_pagamento='CONTANTI'`; più `uscite-da-pagare` e `segna-pagate-bulk` per pagare in contanti dallo stesso tab.

**Tocco banca vero e proprio:** il versamento contanti (`cash_deposits`) è collegabile a un movimento CC in ingresso via `GET /admin/finance/cash/deposit/bank-matches` (legge `banca_movimenti` con `importo > 0`, flag `gia_collegato`; **solo superadmin**) — `admin_finance.py:2242-2312`.

Capability e dettaglio funzionale del tab sono documentati in [modulo_vendite.md](modulo_vendite.md) (Gestione Contanti) e [modulo_controllo_gestione.md](modulo_controllo_gestione.md); qui restano i puntatori per non duplicare.

---

# 9. Mance (vista read-only su chiusure turno)

`/flussi-cassa/mance` → `FlussiCassaMance.jsx` (visibile a tutti i ruoli, incluso sala — `modules.json:88`). **Non esiste alcuna tabella mance dedicata**: la pagina legge `GET /admin/finance/shift-closures/` (riga 34) e filtra client-side per mese/anno i turni con `mance > 0`. Mostra KPI (totale, turni, giorni), tabella per turno con €/coperto e totale mese.

Le mance si REGISTRANO nella chiusura turno (modulo Vendite/Cassa). Qui si consultano soltanto, "da distribuire ai ragazzi" a mano. Nessuna funzione di distribuzione/quote è implementata.

> **(storico, superato)** Le tabelle `mance_giorni`/`mance_distribuzioni` e il form di distribuzione descritti in passato non sono mai stati implementati.

---

# 10. Frontend

## 10.1 File reali (`frontend/src/pages/banca/`)

| File | Route | Note |
|------|-------|------|
| `BancaDashboard.jsx` | `/flussi-cassa/dashboard` | KPI + grafici andamento |
| `BancaMovimenti.jsx` | `/flussi-cassa/cc` | Lista movimenti CC |
| `BancaCrossRef.jsx` | `/flussi-cassa/cc/crossref` | Workbench riconciliazione (tab suggerimenti/senza/parcheggiati/collegati, toggle "Mostra movimenti carta", badge 💳, chip "Già su CG #N" / "+M altre" / "Chiusa senza fattura" / "Addebito carta") |
| `CartaCreditoPage.jsx` | `/flussi-cassa/carta` | Carte, estratti, upload PDF, match A/B |
| `CartaRiepilogoPage.jsx` | `/flussi-cassa/carta/riepilogo` | Riepilogo mensile MCC (recharts) |
| `FlussiCassaContanti.jsx` | `/flussi-cassa/contanti` | Wrapper su `GestioneContantiContent` (§8) |
| `FlussiCassaMance.jsx` | `/flussi-cassa/mance` | Vista mance (§9) |
| `BancaImpostazioni.jsx` | `/flussi-cassa/impostazioni` | Import CSV, categorie, duplicati, baseline, soglie carta |
| `FlussiCassaNav.jsx` | (nav) | Tab con permessi granulari via `useModuleAccess` (`canAccessSub`) |
| `BancaMenu.jsx`, `BancaNav.jsx` | — | **Orfani**: nessun import nel codebase |
| `BancaImport.jsx`, `BancaCategorie.jsx` | — | **Legacy**: lazy-importati in `App.jsx:145-146` ma senza route (le vecchie `/banca/import` e `/banca/categorie` redirigono a Impostazioni). Funzioni assorbite in `BancaImpostazioni.jsx` |

Route: `App.jsx:362-388`. `ModuleRedirect` su `/flussi-cassa` sceglie il primo sub accessibile (dashboard → cc → carta → contanti → mance → impostazioni).

## 10.2 Menu, ruoli, colore

- `modulesMenu.js:74-86`: chiave `flussi-cassa`, titolo "Flussi di Cassa", icona 🏦, colore **emerald** (`bg-emerald-50 border-emerald-200 text-emerald-900`). Il vecchio schema "Banca sky/cyan + Flussi Cassa emerald" è superato: **tutto il modulo è emerald**; sky è di Controllo Gestione.
- `modules.json:76-91` (ruoli): modulo visibile a superadmin/admin/contabile/sala/sommelier/chef, ma i sub dashboard/cc/crossref/carta solo a superadmin/admin/contabile; contanti e impostazioni solo superadmin/admin; **mance a tutti**.

---

# 11. Cross-modulo

- **Acquisti → CG → Banca:** le fatture XML/FIC generano/aggiornano `cg_uscite` (proiettore CG); il cross-ref banca le chiude. Banca ignora il flag pagato di FIC ([modulo_acquisti.md](modulo_acquisti.md)).
- **Controllo Gestione ← Banca:** CG usa la riconciliazione bancaria come fonte di verità del pagato pieno. In direzione inversa, da ControlloGestioneUscite si cercano movimenti banca per una singola uscita: `GET /controllo-gestione/uscite/{id}/candidati-banca` + `RiconciliaBancaPanel.jsx` (componente in `components/riconciliazione/`). Vedi [modulo_controllo_gestione.md](modulo_controllo_gestione.md).
- **Vendite/Cassa → Flussi di Cassa:** chiusure turno alimentano mance (§9) e spese/preconti del tab contanti (§8); i versamenti contanti si riconciliano coi movimenti CC in ingresso.
- **Dipendenti → Banca:** gli stipendi arrivano come `cg_uscite` tipo `STIPENDIO` generate dal modulo Paghe e si riconciliano come uscite dirette; l'annulla-registrazione le protegge dal DELETE (§6.3).
- **Statistiche:** legge dati banca read-only (eccezione consentita dal modulo cross-aggregatore).
- **Home:** card "Flussi di Cassa" con saldo mese da `finanza_movimenti` (legacy, §2).

---

# 12. Roadmap (sintesi — dettaglio in `roadmap.md` §B, righe 241-248)

| ID | Cosa | Size | Priorità |
|----|------|------|----------|
| B.1 | Bug storni Flussi Cassa (D1 problemi.md) | S | ALTA (serve caso concreto da Marco) |
| B.2 | Annullamento movimenti contanti | S | ALTA |
| B.3 | Dashboard grafici Recharts (sostituisce barre CSS) | S | ALTA |
| B.4 | Multi-conto corrente UI | M | MEDIA (DB ready) |
| B.5 | Cash flow previsionale 30/60/90gg | M | MEDIA (dipende M.B PDF) |
| B.6 | Cross-ref banca più intelligente | M | MEDIA |
| B.7 | Carta credito import + riconciliazione evoluzioni | M | MEDIA (dipende M.H) |
| B.8 | Import automatico movimenti banca (PSD2/CSV) | L | BASSA |

> **(storico, superato)** La vecchia tabella B.1–B.8 di questa pagina ("Import CSV BPM + Sella", "Match manuale movimento↔uscita", ecc.) rifletteva una numerazione pre-riorganizzazione roadmap: le voci fatte sono confluite nelle funzionalità dei §4–§7, le aperte sono state rinumerate come sopra.
