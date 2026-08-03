# Modulo Fatture in Cloud (FIC) — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_acquisti.md](modulo_acquisti.md) (modulo padre), [modulo_fatture_xml.md](modulo_fatture_xml.md) (import SDI)

**Creato:** 2026-05-19 (audit autonomo — gap CRIT-1) · riscritto su verifica codice 2026-08-03
**Modulo tecnico:** sub-modulo di `acquisti` (per `core/moduli/<id>/module.json`)
**Backend:** `app/routers/fattureincloud_router.py`, prefix **`/fic`** (righe 34-38, **senza** `/contabilita/`), auth JWT a livello router
**UI attiva:** Impostazioni Acquisti → sezione "Fatture in Cloud" (`FattureImpostazioni.jsx`, route `/acquisti/impostazioni`)

> Nota storica: l'audit 2026-05-19 dichiarava 12 endpoint; la verifica adversarial ne contò 17. Ricontati sul codice il 2026-08-03: **17**, righe della tabella §2 tutte coincidenti.

---

## 1. Cos'è

Integrazione con il servizio **Fatture in Cloud** (https://www.fattureincloud.it/) API v2 per:
- **Fatture ricevute (passive)** dai fornitori → scritte nella tabella **unificata** `fe_fatture` con `fonte='fic'`, come pipeline parallela a quella XML SDI. Dashboard, categorie, matching e CG funzionano identiche senza modifiche.
- **Fornitori**: `GET /fic/fornitori` interroga FIC **live** (`/c/{cid}/entities/suppliers`), nessuna copia locale. Oggi senza consumer frontend (endpoint di servizio/debug).
- **Warning sync** (mig 062): documenti anomali salvati in `fic_sync_warnings` (vedi §5).

L'integrazione è **opzionale**: il modulo Acquisti funziona anche con il solo import XML SDI manuale. FIC è la scorciatoia quotidiana; l'XML resta la fonte "precisa" (il dedup incrocia le due, vedi §4 e `modulo_acquisti.md` §4.1).

---

## 2. I 17 endpoint reali (`app/routers/fattureincloud_router.py`)

| # | Metodo | Path (relativo al prefix `/fic`) | Summary FastAPI | Riga |
|---|--------|---------------------------|-----------------|------|
| 1 | GET | `/status` | Stato connessione Fatture in Cloud | 137 |
| 2 | POST | `/connect` | Salva token e collega azienda | 180 |
| 3 | POST | `/disconnect` | Scollega Fatture in Cloud | 226 |
| 4 | GET | `/sync/count` | Conta veloce fatture da sincronizzare | 467 |
| 5 | GET | `/sync/progress` | Progresso sincronizzazione in corso | 495 |
| 6 | POST | `/sync` | Sincronizza fatture ricevute → fe_fatture | 501 |
| 7 | GET | `/fatture` | Lista fatture ricevute sincronizzate da FIC | 868 |
| 8 | GET | `/sync-log` | Storico sincronizzazioni | 924 |
| 9 | GET | `/warnings` | Lista warning sync FIC | 940 |
| 10 | GET | `/warnings/count` | Conta warning non visti (per badge) | 995 |
| 11 | GET | `/warnings/{warning_id}` | Dettaglio warning + raw payload FIC | 1015 |
| 12 | POST | `/warnings/{warning_id}/visto` | Marca warning come visto | 1040 |
| 13 | POST | `/warnings/{warning_id}/unvisto` | Rimetti warning come non visto | 1069 |
| 14 | GET | `/fornitori` | Lista fornitori da Fatture in Cloud (live) | 1095 |
| 15 | GET | `/debug-detail/{fic_id}` | Debug: dettaglio raw da FIC API | 1133 |
| 16 | POST | `/refetch-righe-xml/{db_id}` | Recupera righe da XML SDI per una fattura | 1328 |
| 17 | POST | `/bulk-refetch-righe-xml` | Recupero massivo righe da XML per fatture FIC senza dettaglio | 1355 |

> Tabella verificata sul codice il 2026-08-03 (`grep ^@router\.`): 17 decorator, righe coincidenti. Da riaggiornare se cambiano firme o si aggiungono endpoint.

**Chi li consuma oggi:**
- `FattureImpostazioni.jsx` (pagina attiva): `/status`, `/connect`, `/disconnect`, `/sync`, `/sync-log`, `/debug-detail/{id}`, `/refetch-righe-xml/{id}`, `/bulk-refetch-righe-xml`.
- `FattureInCloud.jsx` (**legacy, senza route** — `/acquisti/fic` redirige a Impostazioni): era l'unico consumer di `/fatture`, `/warnings*`, `/sync/count`, `/sync/progress`. Questi endpoint restano live nel backend ma **orfani nella UI attiva**.
- `/fornitori`: nessun consumer frontend.

---

## 3. Setup token FIC (admin)

Flusso reale (verificato in `fic_connect`, riga 180):
1. Marco genera un **API token personale** dall'area sviluppatori del proprio account Fatture in Cloud.
2. UI: Impostazioni Acquisti → sezione "Fatture in Cloud" → incolla il **solo token** (non c'è campo ID azienda).
3. `POST /fic/connect` con body `{ "access_token": "..." }` → il backend valida il token su FIC `/user/companies` e **seleziona automaticamente la prima azienda** restituita (company_id + company_name).
4. Config salvata in **`fic_config`** (foodcost.db, riga singola `id=1`: `access_token`, `company_id`, `company_name`, `updated_at` — UPSERT).
5. `GET /fic/status` verifica la connessione: ritorna `connected`, azienda collegata, conteggio fatture per fonte (`fatture_xml` / `fatture_fic`) e lista aziende del token. Se il token non risponde: `connected: false` + `token_saved: true`.
6. `POST /fic/disconnect` cancella la riga `fic_config` (logout).

**Sicurezza:** il token è un secret salvato **in chiaro** in `fic_config`. Da considerare se cifrarlo a riposo (voce roadmap §9).

---

## 4. Flusso sync (fatture passive)

`POST /fic/sync` — query params: **`anno`** (default: anno corrente) e **`force_detail`** (bool, default false: forza il re-fetch dettaglio per tutte, ripara numeri mancanti). Non esistono parametri `data_da`/`data_a`: il filtro è annuale (`q=date >= 'anno-01-01' and date <= 'anno-12-31'`).

**Fase 1 — Lista** (paginata, `per_page=50` su `/c/{cid}/received_documents type=expense`):
1. **Filtro non-fattura** (mig 061/062): documenti senza numero **e** senza P.IVA (prima nota mascherata: affitti, spese cassa) → skippati e registrati come warning `tipo='non_fattura'` in `fic_sync_warnings` (INSERT OR IGNORE, dedup su UNIQUE `(tipo, fic_document_id)`).
2. **Dedup per `fic_id`**: se già presente da FIC → update header se cambiato; re-fetch dettaglio solo se mancano numero/righe/scadenza o `force_detail`.
3. **Dedup vs XML** (`piva+numero+data`): se già presente da XML → aggancia `fic_id` al record XML (conteggiata `duplicate_xml`, stato item `merged_xml`) e fetcha comunque il dettaglio.
4. Altrimenti **INSERT** in `fe_fatture` con `fonte='fic'` (minuscolo).

**Fase 2 — Dettaglio** (`_fetch_detail_and_righe`, per i documenti marcati in fase 1):
- Righe da `items_list`; se assente ma `e_invoice=true` con `attachment_url` → **XML enrichment**: scarica e parsa l'XML SDI allegato (`fatturapa_parser.download_and_parse`) e popola `fe_righe`. In entrambi i casi le righe passano da `auto_categorize_righe`.
- Dedup inverso con XML ora che c'è `invoice_number`: sposta le righe XML sotto il record FIC, copia `xml_hash`/`xml_filename`, cancella la copia XML (contatore `merged_xml`).
- **Stato pagamento**: se `payments_list` è tutta pagata → `fe_fatture.fic_pagato_raw=1` e propagazione a `cg_uscite` come `PAGATO_MANUALE` via `set_stato(force=True)`, **mai** sovrascrivendo `PAGATO`/`PAGATO_MANUALE` esistenti (PAGATO = riconciliazione banca, ha precedenza). Prima rata non pagata → `data_scadenza` + `importo_pagamento` (solo se mancanti, COALESCE).
- Documenti senza `items_list`, senza XML e senza righe preesistenti → lista `senza_dettaglio` nella risposta (la UI propone il recupero righe, §6).

**Tracking:** ogni sync scrive una riga in `fic_sync_log`; la risposta è `SyncResult` (`nuove`, `aggiornate`, `duplicate_xml`, `merged_xml`, `errori`, `righe_importate`, `totale_api`, `note`, `error_details` max 50, `items[]` con stato per documento `nuova|aggiornata|merged_xml|skipped_non_fattura`, `senza_dettaglio[]`) — vedi `modulo_acquisti.md` §6.3.

**Progress:** `GET /fic/sync/progress` espone lo stato in-memory del sync (running, phase `lista|dettaglio|done`, contatori fase 1/2, ultimo fornitore); `GET /fic/sync/count` fa il pre-conteggio veloce (`per_page=1`). Entrambi live nel backend ma oggi usati solo dalla pagina legacy (§2).

---

## 5. Gestione warnings

Tabella `fic_sync_warnings` (mig 062): `sync_at`, `tipo`, `fornitore_nome`, `fornitore_piva`, `numero_documento`, `data_documento`, `importo`, `fic_document_id`, `raw_payload_json`, `visto`, `visto_at`, `note`. UNIQUE `(tipo, fic_document_id)`.

**Unico tipo generato oggi: `non_fattura`** (documento FIC "expense" senza numero e senza P.IVA, tipicamente prima nota). Scopo: accorgersi se FIC cambia formato (es. una vera fattura senza P.IVA in futuro). Fattura duplicata e IVA non quadrante **non** generano warning: la duplicata viene unita (merge, §4), l'IVA non è controllata.

Endpoint:
- `GET /warnings` — lista paginata (query: `tipo`, `visto` 0/1/null, `page`, `per_page`).
- `GET /warnings/count` — conteggio per badge (query `visto`, default 0). Difensivo se la tabella non esiste (DB vecchi → 0).
- `GET /warnings/{id}` — riga completa + `raw_payload` JSON parsato.
- `POST /warnings/{id}/visto` (query `note` opzionale) / `POST /warnings/{id}/unvisto` — toggle visto.

⚠️ La UI dei warnings viveva in `FattureInCloud.jsx`, oggi senza route: gli endpoint sono live ma **senza interfaccia attiva**. Il conteggio `skipped_non_fattura` resta comunque visibile nel risultato sync in Impostazioni.

---

## 6. Recovery righe XML

FIC ritorna le fatture in JSON, ma per molte fatture elettroniche `items_list` è vuoto (`is_detailed=false`). Le righe si ricostruiscono dall'XML SDI allegato (`attachment_url`):

- `POST /refetch-righe-xml/{db_id}` — singola fattura (`db_id` = `fe_fatture.id`): chiama FIC detail, scarica l'XML, rigenera `fe_righe` (DELETE+INSERT) e auto-categorizza. Fallisce con motivo esplicito se: la fattura non ha `fic_id`, non è fattura elettronica (`non_fe`, irrecuperabile), manca `attachment_url`, o l'XML non ha `DettaglioLinee`.
- `POST /bulk-refetch-righe-xml` — massivo. Query: `anno` (default tutti), `solo_senza_righe` (default true), `limit` (default 50, max 500), `max_seconds` (budget wallclock, default 90: si ferma prima del timeout nginx e torna stato parziale). Risposta: `candidate`, `processate`, `ok_count`, `fail_count`, `skipped_non_fe`, `righe_recuperate`, `stopped_by_timeout`, `rimanenti_stima`, `dettaglio[]`. **Uso previsto: rilanciare dalla UI finché `candidate` = 0** (le non-FE restano senza righe per sempre).

Entrambi richiamabili dalla sezione FIC di `FattureImpostazioni.jsx`.

---

## 7. Debug e diagnostica

- `GET /debug-detail/{fic_id}` — payload grezzo FIC per un documento (query `try_xml`, default true: se `e_invoice` senza righe, tenta anche il parsing dell'XML allegato e mostra preview delle prime 5 righe). Ritorna: `numero`/`invoice_number`, `date`, `entity_name`, `is_detailed`, `auto_calculate`, `type`, `n_items`, `items_list_raw`, `n_payments`, `payments_preview`, `e_invoice`, `attachment_url` (+ full), `raw_keys`, `xml_parse`. Usato dal bottone debug in Impostazioni quando una fattura mostra dati strani.
- `GET /sync-log` — storico sync da `fic_sync_log` (query `limit`, default 20 max 100). Campi: `started_at`, `finished_at`, `nuove`, `aggiornate`, `errori`, `note` (la nota riassume anche merged/skipped/righe).

---

## 8. Integrazione con il resto del modulo Acquisti

- Le fatture FIC vivono nella stessa tabella `fe_fatture` delle XML SDI: il modulo Acquisti le tratta uniformemente (badge fonte nell'elenco).
- Campo `fe_fatture.fonte`: valori reali **`'xml'` | `'fic'`** (minuscolo; NULL trattato come `'xml'` via COALESCE). Non esistono valori `XML_SDI`/`MANUALE`.
- Il "matching fornitore" avviene per **P.IVA** contro l'anagrafica interna `fe_fornitore_categoria` (non esiste una tabella `fe_fornitori`); i fornitori nuovi entrano in anagrafica quando si assegna loro una categoria o via proforme.
- Pipeline categorie (auto-categorizzazione righe) e matching ingredienti funzionano identiche indipendentemente dalla fonte.
- Stato pagamento: il flag FIC finisce in `fic_pagato_raw` e si propaga a `cg_uscite` come `PAGATO_MANUALE` (vedi §4 e `stato_pagamento_unificato.md`).

---

## 9. Roadmap

- Decidere il destino della UI warnings (oggi orfana: endpoint live, pagina legacy senza route — §5).
- Documentare scenari di recovery (sync fallito a metà, token scaduto/revocato, FIC down).
- Cifratura a riposo del token in `fic_config`.
- Eventuale automation: cron sync giornaliero (oggi è on-demand dalla UI).

---

## 10. Riferimenti

- Audit canonico capability: `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` (modulo Acquisti — C-A-028 ecc.)
- Gap report origine: `docs/audit-2026-05-19/02_GAP_REPORT.md` CRIT-1
- Verifica conteggio: `docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md` Test 3 (17 endpoint reali, audit ne dichiarava 12)
- Modulo padre: `docs/modulo_acquisti.md` (§6 per il riassunto sync, §9 per le tabelle DB condivise)
- Modulo gemello (XML SDI): `docs/modulo_fatture_xml.md`
- Decisione PO Marco: 2026-05-19 (sessione "audit + riallineamento")
