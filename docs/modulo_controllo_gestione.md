# Modulo Controllo di Gestione — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** parziale · **Ultima verifica:** 2026-07-25 (vs codice)
> **Vedi anche:** [stato_pagamento_unificato.md](stato_pagamento_unificato.md) · [spec_utenze.md](spec_utenze.md) · [spec_riconciliazione.md](spec_riconciliazione.md) · [modulo_acquisti.md](modulo_acquisti.md) · [modulo_banca.md](modulo_banca.md)
> **Non verificato (assente dallo snapshot):** route FE in `App.jsx`; file migrazioni DB (mig 031/032/104/108/120/149/151/152); template `app/templates/pdf/conto_economico.html`; seed soglie/antidup in `alert_config` (DB).

**Versione modulo:** 2.21 (`versions.jsx`)
**Sistema:** 5.38 (file `VERSION` in root)
**Stato:** Beta
**Data ultimo aggiornamento:** 2026-07-25 (verifica doc vs codice)
**Dominio funzionale:** Controllo di gestione, Uscite, Scadenze, Spese ricorrenti, Conto Economico, Batch pagamenti, **Auto-close rateizzazioni**, **Analisi Utenze**

---

# 📌 AGGIORNAMENTO 2026-07-17 — Analisi Utenze U1+U2 (spec_utenze.md, mig 151)

Nuovo sub-modulo **Analisi Utenze**: upload PDF bollette A2A (luce+gas) → parser → serie storica + KPI. SOLA ANALISI: nessun importo entra nel CE (contabilità su fe_fatture, zero doppio conteggio). Spec completa: `docs/spec_utenze.md`.

## Endpoint nuovi (`cg_utenze_router.py`, prefix `/controllo-gestione/utenze`)

| Capability | Cosa fa | Rif | Audience |
|---|---|---|---|
| C-CG-U01 | POST `/upload` — parsa bolletta PDF A2A, preview + archivio (no scrittura tabelle) | cg_utenze_router.py:61 | admin/contabile |
| C-CG-U02 | POST `/conferma` — scrive bolletta + upsert serie mensile + aggancio fe_fatture via numero (con retro-aggancio) | cg_utenze_router.py:188 | admin/contabile |
| C-CG-U03 | GET `/` — dashboard forniture + KPI (€/unità all-in, % stimato gas, giorni a scadenza condizioni, potenza max 12m) | cg_utenze_router.py:309 | admin/contabile |
| C-CG-U04 | GET `/consumi` — serie mensile per grafici (filtri fornitura/range) | cg_utenze_router.py:366 | admin/contabile |
| C-CG-U05 | GET/DELETE `/bollette/{id}` — dettaglio (parsed completo) / elimina bolletta+serie di cui era fonte | cg_utenze_router.py:420, :525 | admin/contabile |
| C-CG-U06 | GET `/bollette` — elenco bollette importate (tabella in pagina Utenze) | cg_utenze_router.py:394 | admin/contabile |
| C-CG-U07 🆕 | POST `/bollette/{id}/riparse` — ri-analizza il PDF archiviato e aggiorna bolletta+fornitura+serie consumi (parser migliorato post-import) | cg_utenze_router.py:438 | admin/contabile |

Stato: ✅ COMPLETO U1-U4 (2026-07-17). UI: `ControlloGestioneUtenze.jsx` (tab 💡, route `/controllo-gestione/utenze`, CG 2.21) + `GET /bollette` (C-CG-U06, elenco). Alert: checker `utenze_scadenza_condizioni` + `utenze_consumi_stimati` in alert_engine (soglie in alert_config, mig 152 seed).

DB (mig 151, foodcost.db): `cg_utenze_forniture`, `cg_utenze_bollette`, `cg_utenze_consumi_mensili` (UNIQUE fornitura+mese+fascia; upsert vince la bolletta con emissione più recente). Archivio PDF: `locali/<id>/data/uploads/utenze/`.

---

# 📌 AGGIORNAMENTO 2026-07-12 — G.3: fatture nei ricavi + Composizione venduto (C2) + PDF (G.3.7b)

## Ricavi CE (decisione Marco 2026-07-12)
`ricavi.totale = corrispettivi + fatture_emesse` (prima solo corrispettivi). Fonte: `vendite_aggregator.totali_periodo` — le fatture emesse sono quelle registrate nel campo `fatture` delle chiusure turno (emesse via iPratico). KPI Ricavi mostra lo split. Payload: `ricavi.{corrispettivi, fatture_emesse, totale}`.

## C2 — Composizione del venduto per tipo
- **Mig 149** `ipratico_categoria_tipo(categoria PK, tipo)` in foodcost.db. Tipi: FOOD/VINO/BEVANDE/COPERTO/ALTRO/IGNORA. Seed: Antipasti/Primi/Secondi/Contorni/Dolci/Speciali/Pranzo/Degustazioni→FOOD; Bottiglie/Calici→VINO; Bevande/Alcolici/Birre→BEVANDE; BATTUTA SINGOLA→COPERTO; Vendita→ALTRO; Servizio→IGNORA.
- Service: `_ripartizione_vendite(fc_conn, periodi_rif)` → payload `ripartizione_vendite.{venduto_totale, tipi[], da_classificare[]}`. Categorie non mappate = DA_CLASSIFICARE (mai perse). NB venduto iPratico lordo IVA fatture incluse: vista di composizione, non quadratura.
- Endpoint: `GET/PUT /controllo-gestione/ipratico-tipi` (mapping editabile; PUT upsert {categoria, tipo}).
- UI: sezione "Composizione del venduto" nel CE (barra % + drill-down; select inline per classificare le nuove).
- "BATTUTA SINGOLA" = tasto prezzo libero: coperto "Servizio, pane e stuzzico" €5 + rari acconti eventi/asporto (accettato a livello categoria in v1).

## G.3.7b — Export PDF
Template `app/templates/pdf/conto_economico.html` (M.B): KPI, waterfall, breakdown costi con sottocategorie, composizione venduto, warning. Endpoint `GET /controllo-gestione/conto-economico/pdf` (stessi parametri del CE). Bottone 🖨 PDF in pagina, download via fetch+blob (niente token in query — conforme A1-08).

## Indagine discrepanza iPratico (chiusa come diagnosi)
Formula incassi corretta (marzo +68, giugno +3 vs iPratico). Apr −11.210 / mag −5.917 = fatture emesse non riportate nelle chiusure di quei mesi (campo `fatture` anomalo; prova: "Acconto cena 17/04 €750" in BATTUTA SINGOLA). Verifica Marco su `claude/verifica_fatture_apr_mag.md`, poi backfill del campo fatture.

---

# 📌 AGGIORNAMENTO 2026-06-30 (2° push) — Auto-close rateizzazioni completate (RC.1+RC.3)

Bug storico: quando l'ultima rata di una spesa fissa `RATEIZZAZIONE` viene pagata, il sistema NON riporta l'uscita origine (`cg_uscite.stato = 'RATEIZZATO'`) a `PAGATO`/`PAGATO_MANUALE`. La VIEW `fe_fatture_with_stato` mappa `RATEIZZATO → 'da_pagare'`, quindi la fattura risulta ancora "da pagare" in `FattureElenco` anche se completata. Sul VPS Tre Gobbi al 30/06/2026: 7 rateizzazioni al 100% completate ma non chiuse (€32.923 di residuo apparente inesistente).

## Endpoint nuovi (`controllo_gestione_router.py`)

| Metodo | Path | Cosa fa |
|---|---|---|
| POST | `/controllo-gestione/rateizzazioni/{spesa_fissa_id}/auto-close` | Chiude una singola rateizzazione se tutte le rate sono pagate. Idempotente. |
| POST | `/controllo-gestione/rateizzazioni/auto-close-all` | Bulk: itera `cg_spese_fisse WHERE tipo='RATEIZZAZIONE' AND attiva=1` e chiude quelle completate. Per pulizia retroattiva + uso periodico. |

Helper interno `_auto_close_rateizzazione(fc, sf_id)` — non solleva eccezioni, restituisce `{chiuso, motivo?, ...}`.

## Regola stato (Marco 2026-06-30)

Applicata "forza minima" delle rate all'uscita origine:
- `n_riconciliate == n_rate` → uscita origine `PAGATO` (tutte le rate riconciliate banca)
- Altrimenti → `PAGATO_MANUALE` (almeno una rata manuale non riconciliata)

Sync `fe_fatture` via `set_stato(fid, 'pagato'|'pagato_manuale', force=True)` (force serve per bypassare l'invariante "pagato solo via banca").

## Cose fatte insieme

- `cg_uscite.data_pagamento` = `MAX(rate.data_pagamento)` (rata più recente pagata)
- `cg_uscite.importo_pagato = totale` (allineato al totale fattura)
- `cg_uscite.note` = **append** (non sovrascrittura) di una riga automatica: `[YYYY-MM-DD] Rateizzazione completata: N rate (X riconciliate banca, Y pagato manuale). Date pagamento: ...`
- `cg_uscite.in_pagamento_at = NULL`, `pagamento_batch_id = NULL` (sgancia da eventuali batch pendenti)
- `cg_spese_fisse.attiva = 0` (non genera più rate future)

## Frontend

Bottone **"✓ Auto-chiudi rateizzazioni completate"** in header `ControlloGestioneSpeseFisse.jsx`, accanto a "+ Nuova Spesa". Emerald chip, con conferma + spiegazione della semantica.

## Casi multi-fattura

Una spesa fissa RATEIZZAZIONE può coprire N fatture (es. `sf#9 METRO` copre 30+ fatture con la stessa `spesa_fissa_id`). L'endpoint gestisce correttamente: `WHERE rateizzata_in_spesa_fissa_id = ?` restituisce N fatture, ognuna viene aggiornata. La spesa fissa si chiude una sola volta.

## Roadmap residua

- **RC.2** (Push successivo): hook strutturale — quando una rata viene marcata `PAGATO`/`PAGATO_MANUALE` (via cross-ref banca, segna-pagate-bulk, batch-pagamento, /uscita/{id}/stato-pagamento), chiamare `_auto_close_rateizzazione(sf_id)` in coda alla stessa transazione. Silenzioso (log warning se errore). Evita di dover cliccare periodicamente il bottone.

---

# 📌 AGGIORNAMENTO 2026-06-30 — Pagina "Batch pagamenti" dedicata (BP.1+BP.2+BP.3+BP.4)

Lo Scadenzario crea da sempre `cg_pagamenti_batch` ogni volta che Marco clicca "Stampa / Metti in pagamento" su un set di uscite, ma fino ad oggi NON c'era una pagina per gestirli post-creazione. I batch restavano `IN_PAGAMENTO` per sempre (mai marcati `INVIATO_CONTABILE` né `CHIUSO`), accumulando 8 batch storici per €59k totali sul VPS Tre Gobbi.

## Endpoint backend nuovi (`controllo_gestione_router.py`)

| Metodo | Path | Cosa fa |
|---|---|---|
| DELETE | `/controllo-gestione/pagamenti-batch/{batch_id}/uscite/{uscita_id}` | Rimuove una singola uscita dal batch (scollega `pagamento_batch_id`, `in_pagamento_at`). Ricalcola `n_uscite` e `totale` del batch atomicamente. Rifiuta se l'uscita è già pagata (richiede prima dissocia banca). |
| POST | `/controllo-gestione/pagamenti-batch/{batch_id}/auto-close` | Chiude il batch se tutte le sue uscite sono PAGATO/PAGATO_MANUALE (oppure se il batch è "svuotato" perché le uscite pagate hanno `pagamento_batch_id=NULL` da mig 104). |
| POST | `/controllo-gestione/pagamenti-batch/auto-close-all` | Versione bulk: itera tutti i batch IN_PAGAMENTO/INVIATO_CONTABILE e chiude quelli completati. Usato per la pulizia retroattiva degli 8 batch storici Tre Gobbi. |

Helper interno `_try_auto_close_batch(conn, batch_id)` riusabile.

## Frontend (`ControlloGestioneBatchPagamenti.jsx`)

Nuova pagina su route `/controllo-gestione/batch-pagamenti`, tab "📨 Batch" aggiunto in `ControlloGestioneNav` (7° tab, oggi tra Utenze e Riconciliazione — la tab Utenze 💡 si è inserita prima con CG 2.21).

**Vista lista:** 3 sotto-tab per stato (IN_PAGAMENTO / INVIATO_CONTABILE / CHIUSO) con counter, tabella batch (titolo, data, n. uscite, totale, timestamp inviato/chiuso). Bottone "✓ Auto-chiudi batch completati" in alto a destra chiama `/auto-close-all`.

**Vista dettaglio (click su batch):** header con stat (uscite, totale, X/Y pagate, stato), chip status, note. Bottoni transizione: "📨 Invia al contabile" / "✓ Chiudi batch" / "Auto-chiudi (se completato)" / "🗑 Elimina batch". Tabella uscite con bottone "✕ Rimuovi" per riga (nascosto su uscite già pagate).

## Macchina a stati batch

`IN_PAGAMENTO` → `INVIATO_CONTABILE` → `CHIUSO`. Transizioni manuali via PUT, oppure auto-close.

`in_pagamento_at` e `pagamento_batch_id` su `cg_uscite` si azzerano automaticamente quando l'uscita viene pagata (vedi mig 104), ma l'header `cg_pagamenti_batch.n_uscite` rimane come riferimento storico. L'auto-close gestisce entrambi i casi: "batch ancora popolato con uscite PAGATO" e "batch svuotato perché uscite pagate hanno scollegato il flag".

## Roadmap residua

- **BP.5** (Push G2): export PDF brandizzato Tre Gobbi via M.B (`pdf_brand.py`) — bottone "📄 Esporta PDF" nel dettaglio batch, per allegare a email per commercialista. Oggi c'è solo la stampa HTML+Cmd+P di `apriFinestraStampa` riusata dallo Scadenzario.

---

# 📌 AGGIORNAMENTO 2026-05-19 — Modello stati 3D + tab CE in FattureDettaglio

Sessione cont. del 19/05 (dopo F11 vini): chiusura semantica sugli stati pagamento + redesign del dettaglio fattura con tab "Conto Economico" dedicato.

## A. Modello mentale stati pagamento — 3 dimensioni granitiche

> Doc canonico: `docs/stato_pagamento_unificato.md` §15. Richiamo breve in `CLAUDE.md`. Memoria persistente: `feedback_stati_pagamento_3_dimensioni.md`.

L'enum `cg_uscite.stato` ha 8 valori, ma semanticamente vivono 3 dimensioni ortogonali (sbagliarle è la fonte storica di bug e UI confuse):

| Dim | Cos'è | Valori |
|---|---|---|
| **D1 — PAGAMENTO** | Business, "è pagata?" | PAGATA / NON PAGATA / PARZIALMENTE PAGATA |
| **D2 — Modificatori tecnici** | CG-only, annotazioni su D1 | `*` (pagata non riconciliata), `?` (da verificare) |
| **D3 — SCADENZA/TEMPO** | "Quando va pagata?" | IN SCADENZA / SCADUTA / RATEIZZATA / SPOSTATA |

**Regole d'oro:**
- Nel **modulo Fatture** D1 e D3 vanno mostrati come **2 chip separati** (un chip "Da pagare" + un chip "⚠ Scaduta da Ngg" o "📆 Rateizzata", non un unico chip che li mescola).
- Nel **modulo CG** (Uscite/Scadenzario) si possono **unire** in un chip unico — operativamente più scannerizzabile.
- D3 è **irrilevante** se D1=PAGATA.
- RATEIZZATA / SPOSTATA sono D3, **non D1**.

**Componenti frontend:**
- `frontend/src/components/StatoPagamentoBadge.jsx` v1.3 — gestisce SOLO D1+D2.
- `frontend/src/components/StatoScadenzaBadge.jsx` v1.0 (nuovo) — gestisce SOLO D3 (in_scadenza/scaduta/rateizzata/spostata). Helper `deriveStatoScadenza(uscitaStato, scadenzaISO)` e `giorniLabel(scadenzaISO)`.

**Service backend:**
- `app/services/fatture_stato_service.py` v2.1 — `set_stato()` scrive SOLO D1+D2. Mutazioni D3 (sposta data, marca rateizzata) passano da endpoint dedicati esistenti.

## B. FattureDettaglio v3.1 — redesign secondo il modello 3D

### B.1 Header
- 2 chip distinti in cima al nome fornitore: `<StatoPagamentoBadge>` (D1+D2) + `<StatoScadenzaBadge>` (D3). Prima c'era un chip raw uppercase tipo "PROGRAMMATO" + un chip "Rateizzata" separato sparso.
- Rimossi dal sottotitolo i 2 bottoni inline "📅 sposta competenza" / "📆 spalma su N mesi" (spostati nel nuovo tab CE). I 2 chip read-only "P&L competenza YYYY-MM" / "📆 Spalmata N mesi" restano nel sottotitolo come segnale rapido se override attivo.

### B.2 Tab Pagamenti — riquadro "Stato pagamento attuale"
Riquadro in cima al tab, prima della grid Scadenza/Modalità/IBAN:
- Chip D1+D2 grande (size lg) a sinistra + chip "✓ Riconciliata con banca" se applicabile.
- A destra: i 3 bottoni di cambio stato (`Da pagare` / `❓ Da verificare` / `Pagato*`) sotto label "Cambia stato →".
- Se `stato=pagato` (riconciliato banca, definitivo): banner verde "🔒 Stato definitivo" invece dei bottoni.
- Per fatture rateizzate: riquadro NASCOSTO (le scadenze vivono nella spesa fissa target).

### B.3 Tab "Conto Economico" (NUOVO, 4° tab)
3 sezioni:

1. **📅 Competenza P&L** — 2 card affiancate ("Mese singolo" + "Spalmatura"). Bottoni "Sposta competenza" / "Spalma su N mesi" qui dentro (spostati dal header). Banner ambra in cima se la fattura è esclusa dal CE (`fe_fornitore_categoria.escluso_acquisti=1`).
2. **🏷 Categoria nel Conto Economico** — 2 sotto-sezioni:
   - **Aggregato (read-only)**: tabella `categoria · sottocategoria · righe · importo` derivata dalla gerarchia `fe_righe.categoria_id > fe_fornitore_categoria.categoria_id > "Non categorizzato"`.
   - **Modifica per riga (editabile, BIDIREZIONALE)**: tabella delle singole righe con 2 dropdown (Categoria + Sottocategoria). Riusa lo **stesso endpoint** di `FattureFornitoriElenco`: `POST /contabilita/fe/categorie/fornitori/prodotti/assegna`. Modificare qui aggiorna anche tutte le righe (passate e future) con la stessa descrizione di quel fornitore + il mapping `fe_prodotto_categoria_map` per i futuri import. Toast "Categoria aggiornata (anche su Fornitori)".
3. **📊 Dove appare nel Conto Economico** — fetch lazy al primo click sul tab, mostra: mese di competenza (label + chip "spalmata"/"override"), importo P&L (per mese se spalmata), categoria principale, % sui ricavi del mese, % sulla categoria. Link "Apri Conto Economico {mese} →" che apre il CE pre-popolato.

### B.4 Footer ripulito
- Rimossa label "STATO:" + i 3 bottoni di cambio stato che erano lì (ora vivono nel tab Pagamenti, vedi B.2). La label era fuorviante: sembrava visualizzazione invece che azione.
- Footer ora ha solo "Modifica anagrafica fornitore" + "Chiudi".

## C. Endpoint nuovi/estesi

| Endpoint | Cosa fa |
|---|---|
| `GET /contabilita/fe/fatture/{id}/ce-impatto` (NUOVO) | Ritorna impatto P&L di una fattura: mese_label, mesi_coinvolti, importo_pl_per_mese, categoria_principale, ricavi_mese, totale_categoria_mese, % su ricavi, % su categoria, link_ce |
| `GET /contabilita/fe/fatture/{id}` (esteso) | Aggiunti campi response: `categoria_aggregata[]` (lista cat/sub con righe_count+importo), `escluso_acquisti` (bool flag ffc del fornitore). Righe ora espongono anche `categoria_id`, `sottocategoria_id`, `categoria_nome`, `sottocategoria_nome`, `categoria_auto` |

## D. Effetto sul CE

Cambiando categoria di una riga dal tab CE della fattura, l'effetto si propaga immediatamente:
- Vista `Acquisti → Fornitori` mostra la stessa categoria (stesso `fe_prodotto_categoria_map`).
- I prossimi import della stessa descrizione → categoria già assegnata in automatico.
- Il CE del mese (`compute_pl`) riassegna correttamente la riga alla nuova categoria.

Niente endpoint nuovo per la modifica per riga: si riusa lo stesso (`/categorie/fornitori/prodotti/assegna`) → zero rischio di drift fra modulo Fatture e modulo Fornitori.

---

# 1. Panoramica

Il modulo **Controllo di Gestione** e' un modulo di primo livello del gestionale, integra le funzionalità del modulo Finanza (rimosso v1.0). Il suo scopo e' incrociare i dati provenienti da Acquisti, Banca e Vendite per dare una visione completa della situazione finanziaria del ristorante.

A differenza degli altri moduli che leggono ciascuno i propri dati, Controllo di Gestione **importa e popola** dati propri partendo dalle altre fonti, creando un layer autonomo che non dipende da query live.

**Sezione top-level:** `/controllo-gestione`
**Backend API:** `/controllo-gestione/*`
**Colore tema:** Sky/Cyan
**Icona:** 🎯

---

# 2. Concetti chiave

## 2.1 Uscite

Le uscite sono divise in categorie:

**A) Fatture da pagare (USCITE CORRENTI)** — Fatture importate dal modulo Acquisti la cui scadenza e' in una data futura. La scadenza viene calcolata in ordine di priorita':
1. Dal blocco `DatiPagamento` dell'XML FatturaPA (campo `DataScadenzaPagamento`)
2. Dal default del fornitore (`suppliers.giorni_pagamento` → data_fattura + N giorni)
3. Se nessuno dei due e' disponibile → la fattura va negli avvisi "senza scadenza"

**B) Arretrati (SCADUTE)** — Fatture la cui data di scadenza e' passata e non risultano pagate.

**C) Rateizzazioni** — IMPLEMENTATO in Spese Fisse (tipo `RATEIZZAZIONE`, wizard da fatture, piano rate, auto-close — vedi aggiornamento RC.1+RC.3).

**D) Prestiti** — IMPLEMENTATO in Spese Fisse (tipo `PRESTITO`, wizard Prestito/Mutuo con piano rate alla francese).

**E) Spese senza fattura** — Affitti, tasse, stipendi e altre spese ricorrenti che non hanno una fattura XML associata. Gestite interamente dentro Controllo Gestione nella sezione Spese Fisse.

**F) Tasse** — IMPLEMENTATO in Spese Fisse (tipi `TASSA` / `RATEIZZAZIONE_TASSE`, template Tasse/F24, import CSV piani AdE/Abaco/PagoPA).

**G) Stipendi** — IMPLEMENTATO in Spese Fisse (tipi `STIPENDIO` / `F24_STIPENDI`; nel CE gli stipendi sono `cg_uscite` tipo `STIPENDIO`).

## 2.2 Pagamenti

Il sistema di pagamento e' autonomo e non dipende da Fatture in Cloud:
- Il campo `fe_fatture.pagato` (popolato da FIC) viene **ignorato** dal Controllo di Gestione
- Lo stato pagamento e' gestito internamente tramite matching con i movimenti bancari (Banca)
- Futuro: matching anche con gestione contanti

## 2.3 Condizioni di pagamento fornitore

Ogni fornitore puo' avere condizioni di pagamento di default configurate nella sua scheda (modulo Acquisti):
- `modalita_pagamento_default` — codice FatturaPA (MP01=contanti, MP05=bonifico, ecc.)
- `giorni_pagamento` — giorni dalla data fattura per calcolare la scadenza
- `note_pagamento` — note libere (es. "fine mese", "30gg data fattura")

Queste condizioni vengono usate come fallback quando l'XML della fattura non contiene il blocco DatiPagamento.

---

# 3. Funzionalita'

## 3.1 Menu Principale (`/controllo-gestione`) — (rimosso)
L'hub a tile (`ControlloGestioneMenu.jsx`) non esiste più nel codice. La navigazione del modulo passa da `ControlloGestioneNav` (8 tab, vedi §4); il brand link "🎯 Controllo Gestione" della nav punta a `/controllo-gestione` (ControlloGestioneNav.jsx:36).

## 3.2 Dashboard (`/controllo-gestione/dashboard`)
Panorama completo con:
- **6 KPI cards** (riviste con audit 2026-05-16, coerenti col Conto Economico): Vendite mese, Costo merce, Margine lordo, Costi operativi, Utile netto, Saldo banca (ControlloGestioneDashboard.jsx:149-186). Rimossi i KPI "TODO" mai sviluppati (Uscite programmate / Rateizzazioni).
- **Widget timeline scadenze**: `WidgetScadenzeTimeline` prossimi 31 giorni (vedi §3.7, ControlloGestioneDashboard.jsx:348)
- **Andamento annuale**: grafico Vendite vs Acquisti per mese con margine
- **Top fornitori**: classifica per spesa nel mese selezionato
- **Categorie acquisti**: distribuzione per categoria nel mese

Filtro anno/mese con selettori. Confronto con mese precedente (variazione %).

## 3.3 Scadenzario Uscite (`/controllo-gestione/uscite`)
Vista tabellare di tutte le uscite (label tab: "Scadenzario") con:
- **Auto-import da Acquisti**: al caricamento pagina viene chiamato `POST /uscite/import` che importa/aggiorna le fatture da `fe_fatture` → `cg_uscite` (non più bottone manuale — ControlloGestioneUscite.jsx:153-162)
- **KPI cards cliccabili** in barra alta (filtro rapido, inclusi "Da riconciliare" e "Riconciliate")
- **Filtri**: stato, fornitore (ricerca testo), ordinamento (scadenza, importo, fornitore, data) + toggle `includi_rateizzate` / `includi_escluse`
- **Tabella**: Stato, Fornitore, N. Fattura, Data, Importo, Scadenza (con giorni residui), Modalita' pagamento, Pagato, Residuo
- **Dettaglio fattura inline** (v2.1 split-pane): click su riga FATTURA apre `FattureDettaglio` dentro lo scadenzario
- **Badge giorni**: colore variabile (rosso se scaduta, ambra se < 7gg, neutro altrimenti)

## 3.4 Confronto Periodi (`/controllo-gestione/confronto`) — (rimosso)
Rimosso con audit 2026-05-16: l'endpoint `/confronto` era uno stub mai usato e la pagina un placeholder tolto dalla nav (controllo_gestione_router.py:499-505). Per confronti periodo-periodo si usa `GET /conto-economico` con `periodo=mese|trimestre|anno`. Il file `ControlloGestioneConfronto.jsx` esiste ancora come placeholder orfano (non linkato dalla nav).

## 3.5 Spese Fisse (`/controllo-gestione/spese-fisse`) — IMPLEMENTATO

Sezione per gestire spese ricorrenti senza fattura. Pagina `ControlloGestioneSpeseFisse.jsx`, già in produzione con dati reali (22 spese fisse + 274 rate al 2026-05-08).

- **Tipi**: AFFITTO, TASSA, F24_STIPENDI, RATEIZZAZIONE_TASSE, STIPENDIO, PRESTITO, RATEIZZAZIONE, ASSICURAZIONE, ALTRO (`TIPO_SPESA`, controllo_gestione_router.py:1592)
- **Frequenze**: MENSILE, BIMESTRALE, TRIMESTRALE, SEMESTRALE, ANNUALE, UNA_TANTUM
- **CRUD completo** con data inizio/fine, giorno scadenza, importo, note, IBAN, importo_originale, spese_legali
- **Wizard guidati**: Affitto, Prestito/Mutuo, Assicurazione, Tasse/F24 (template), Rateizzazione (da fatture)
- **Piano rate** (`cg_piano_rate`): rate variabili per prestiti alla francese, rateizzazioni con date irregolari
- **Storico** (modale): lista addebiti passati per spese senza piano rate (affitti, utenze)
- **Riconciliazione banca per uscita** (modale "Cerca banca"): match rata ↔ movimento bancario

### 3.5.1 Import CSV piano rate (G.1.5, 2026-05-08)

Per piani di rateizzazione **Abaco / Agenzia delle Entrate / PagoPA / F24 rateizzato** che arrivano come file CSV:

**Endpoint:** `POST /controllo-gestione/spese-fisse/import-csv` (multipart)

**Body multipart:**
- `file` — CSV con header `Numero,Identificativo,Scadenza,Importo,Stato`
- `titolo` — string libera (es. "Rateizzazione Abaco — atto 0075330")
- `tipo` — uno di {AFFITTO, ASSICURAZIONE, PRESTITO, RATEIZZAZIONE, RATEIZZAZIONE_TASSE, TASSA, F24_STIPENDI, ALTRO} — default `RATEIZZAZIONE_TASSE` (controllo_gestione_router.py:2407, 2443)
- `note` — opzionale
- `iban` — opzionale
- `force` — bool, default `false`. Set `true` per bypass duplicate detection.

**Mapping CSV → DB:**
| CSV | DB |
|-----|----|
| `Numero` | `cg_piano_rate.numero_rata` |
| `Identificativo` (RAV/IUV/atto) | `cg_piano_rate.codice_pagamento` (mig 108) |
| `Scadenza` (DD/MM/YYYY) | `cg_piano_rate.data_scadenza_specifica` (mig 108, ISO YYYY-MM-DD) + `cg_piano_rate.periodo` (YYYY-MM) |
| `Importo` | `cg_piano_rate.importo` |
| `Stato` (Pagata/Da pagare) | tracciato in `cg_piano_rate.note`. Le `cg_uscite` sono sempre create PROGRAMMATO/SCADUTO — la riconciliazione vera dal modulo Banca evita doppia contabilizzazione. |

**Encoding/delimiter:** auto-detect UTF-8/UTF-8 BOM/cp1252/latin1 + `,` o `;`. Importi accettano formato IT (`211,00`) e EN (`211.00` o `1,234.56`).

**Duplicate detection (light):** se almeno 1 dei primi 3 `codice_pagamento` matcha un piano esistente → `409 Conflict` con dettaglio piani esistenti. UI mostra modale "Crea comunque (duplicato)" / "Annulla". Niente merge intelligente: per riscrivere un piano AdE modificato, l'utente cancella + reimporta.

**Date irregolari (chiave AdE/PagoPA):** il proiettore `cg_uscite` (in `import_uscite()`) controlla `cg_piano_rate.data_scadenza_specifica`: se valorizzata, la usa direttamente in `cg_uscite.data_scadenza`. Altrimenti calcolo standard `{anno}-{mese}-{giorno_scadenza}` clampato. Backward-compat totale: rate pre-mig 108 funzionano come prima.

### 3.5.2 Delete spesa fissa con rate riconciliate (G.1.5)

`DELETE /controllo-gestione/spese-fisse/{id}` ora fa **cascade** su `cg_piano_rate` + `cg_uscite`. Se la spesa ha rate già riconciliate (`banca_movimento_id NOT NULL` o stato PAGATO/PAGATO_MANUALE/PARZIALE — controllo_gestione_router.py:2027-2035), ritorna **409** con conteggio. Solo con `?confirm_riconciliate=true` procede comunque (i movimenti banca tornano "non abbinati"). UI mostra warning esplicito: *"X rate riconciliate, eliminandole la riconciliazione si rompe — continuare?"*

### 3.5.3 Template CSV scaricabile (G.1.5, 2026-05-09)

`GET /controllo-gestione/spese-fisse/template-csv` (auth) restituisce un CSV preformattato col nostro standard, con BOM UTF-8 (Excel italiano lo apre bene), 3 righe di esempio e righe `#` di intestazione che spiegano i formati. L'utente lo scarica, lo compila in Excel/Numbers, lo salva come CSV e lo ricarica via wizard "Importa CSV piano rate".

**Importante (parser):** il parser CSV ignora ora anche le righe che iniziano con `#` — usato per i commenti del template, ma utile in generale.

**Posizionamento route:** registrato PRIMA di `/spese-fisse/{spesa_id}` per evitare il match parametrico (FastAPI valuta in ordine di definizione; con `spesa_id: int` il path `/spese-fisse/template-csv` darebbe altrimenti 422).

UI:
- Pannello creazione spese fisse: terzo bottone (ambra) "📋 Scarica template CSV" accanto a "Inserimento manuale" e "Importa CSV piano rate"
- Wizard import (step 1): link "Non hai un CSV? 📋 Scarica il template — compilalo in Excel/Numbers e ricaricalo qui"

### 3.5.4 Visualizzazione Pagato/Residuo + Totale piano (G.1.5, 2026-05-09)

In `ControlloGestioneSpeseFisse.jsx` la barra Pagato/Residuo + bar di progresso ora si mostra ogni volta che `s.n_rate_totali > 0`, indipendente dal `tipo`. Prima era limitata a `PRESTITO`/`RATEIZZAZIONE`: una rateizzazione importata come `TASSA` (es. cartelle Abaco) non vedeva la barra. Aggiunta riga "Totale piano: € X — N rate" che usa `s.importo_originale` (popolato all'import CSV o al wizard prestito).

### 3.6 Alert scadenze pagamenti (G.2.A, 2026-05-09)

Implementati su mattone **M.F Alert engine** (`app/services/alert_engine.py`) e mattone **M.A Notifiche**. Tre checker distinti, soglie indipendenti configurabili da Impostazioni → Notifiche, range esclusivi.

| Checker | Default | Urgenza | Range scadenza (rispetto a oggi) |
|---|---|---|---|
| `cg_scadenze_imminenti` | 7 gg | "urgente" (banda rossa) | tutto ciò che è ≤ oggi+7gg, **incluse scadute non riconciliate** |
| `cg_scadenze_avvicinamento` | 15 gg | "normale" | `> oggi+soglia_imminente` AND `≤ oggi+soglia_avvicinamento` |
| `cg_scadenze_pianificazione` | 30 gg | "info" | `> oggi+soglia_avvicinamento` AND `≤ oggi+soglia_pianificazione` |

(urgenze: alert_engine.py:640, :667, :697)

**Filtro comune:** `cg_uscite.stato IN ('PROGRAMMATO','SCADUTO')` AND `banca_movimento_id IS NULL` AND `data_scadenza NOT NULL` (alert_engine.py:487-519).

**Anti-dup:** una sola notifica AGGREGATA per livello (tipo `alert_cg_scadenze_imminenti` / `_avvicinamento` / `_pianificazione`). Anti-dup di N ore (config `antidup_ore` in `alert_config`; fallback nel codice = 24h, alert_engine.py:590 — i seed per-checker 12/24/48 non sono verificabili dallo snapshot). I tipi distinti permettono notifiche separate quando una rata "transita" tra livelli (es. da pianificazione a avvicinamento col passare del tempo).

**Coerenza soglie:** se l'utente imposta avvicinamento ≤ imminente o pianificazione ≤ avvicinamento, il checker affetto ritorna `skipped` con errore esplicito anziché fare query degenerate.

**Configurazione UI:** pagina `/admin/notifiche-impostazioni` (ImpostazioniSistema → tab Notifiche). I 3 checker compaiono automaticamente perché la UI fa GET dinamico su `/alerts/config/`. Per ogni checker: on/off, soglia giorni, antidup ore, destinatari (ruolo + lista username), canali (in-app, WhatsApp, email — quest'ultimo placeholder M.D).

**Trigger esecuzione:** stesso scheduler M.F (cron interno). Test manuale via `POST /alerts/run/cg_scadenze_imminenti/` o "Esegui" dalla UI Impostazioni.

**Path UI per il deep-link:** `link="/controllo-gestione/uscite"` (lo Scadenziario Unificato), così cliccando la notifica si arriva alla lista filtrata per scadenza.

**Cosa non fa (per scelta):**
- Non manda email (M.D non implementato — segnale stub solo log)
- Non fa pagamenti automatici
- Non sostituisce M.A campana — la notifica vive lì come tutte le altre

### 3.7 Calendario scadenze + widget timeline (G.2.B, 2026-05-09)

Vista calendario completa dei pagamenti in arrivo (e scaduti non riconciliati), basata sul mattone **M.E `<CalendarView>`**, integrata nel sub-nav del modulo. Inoltre widget compatto in dashboard CG che mostra a colpo d'occhio i prossimi 30 giorni.

**Endpoint:** `GET /controllo-gestione/scadenze?da=YYYY-MM-DD&a=YYYY-MM-DD` con query params opzionali:
- `tipo_uscita` — filtra (FATTURA, SPESA_FISSA, STIPENDIO, SPESA_BANCARIA, IMPOSTA_BOLLO, COMMISSIONE_POS, PROFORMA, ALTRO_USCITA)
- `importo_min` — soglia minima importo (€)
- `includi_pagate` — bool (default false). Se true include anche PAGATO/PAGATO_MANUALE/PARZIALE (controllo_gestione_router.py:1226).

Risposta:
```json
{
  "scadenze": [
    {"id": 123, "data_scadenza": "2026-05-15", "titolo": "Rateizzazione Abaco",
     "fornitore_nome": "Abaco SpA", "totale": 211.77, "stato": "PROGRAMMATO",
     "tipo_uscita": "SPESA_FISSA", "spesa_fissa_id": 42, "fattura_id": null,
     "livello": "urgente"}
  ],
  "count": 1, "totale": 211.77, "range": {"da": "2026-05-09", "a": "2026-06-08"}
}
```

Il campo `livello` è derivato server-side dalla distanza temporale (oggi → data_scadenza):
- `scaduta` (delta < 0)
- `urgente` (≤7gg)
- `avvicinamento` (8..15gg)
- `pianificazione` (16..30gg)
- `futuro` (>30gg)
- `pagata` / `parziale` (se includi_pagate=true)

**Pagina UI:** `/controllo-gestione/calendario` — `frontend/src/pages/controllo-gestione/ControlloGestioneCalendarioScadenze.jsx`. 6 card riepilogo (scadute/urgenti/avvicinamento/pianificazione/future/totale €), sidebar filtri (tipo/importo min/pagate) con persistenza `localStorage["cg_calendario_filters"]`, vista mese/settimana/giorno tramite `<CalendarView>` (tasti M/S/G + frecce per navigare). Click su evento → pannello laterale con dettaglio + bottoni "Apri Scadenziario" e (se applicabile) "Vai alla Spesa Fissa".

Mapping livello → colore preset M.E:
- scaduta/urgente → `red` (banda rossa)
- avvicinamento → `amber`
- pianificazione → `blue`
- futuro → `slate`
- pagata → `green`
- parziale → `violet`

**Widget dashboard:** componente `WidgetScadenzeTimeline` (inline in `ControlloGestioneDashboard.jsx`). Mini-timeline orizzontale dei prossimi 31 giorni: pallini colorati sui giorni con scadenze, dimensione proporzionale all'importo aggregato. Tooltip su hover con dettaglio data/conteggio/totale. Click su pallino o "Vai al calendario →" → naviga a `/controllo-gestione/calendario`. Visivamente coerente con la pagina completa.

**Tab sub-nav:** "Calendario" 📅 — `ControlloGestioneNav.jsx` con key `calendario`. Ordine tab attuale: Dashboard / Conto Economico / Scadenzario / **Calendario** / Spese Fisse / Utenze / Batch / Riconciliazione (ControlloGestioneNav.jsx:16-25 — Liquidità e Confronto rimossi con audit 2026-05-16).

#### 3.7.1 Polish formattazione (G.2.B-fix, 2026-05-09)

Iterazione successiva al primo deploy di G.2.B per affinare densità informazione e fix overflow:

- **Backend:** helper `_accorcia_titolo_scadenza()` produce `titolo_breve` (max 26 char), rimuove prefisso "Rateizzazione "/"Rate. "/"Ratea "/"Rateazione " e suffisso "— N fatture"; ellipsis `…` su tagli. Esempio: `"Rateizzazione MARCHESI ANTINORI SPA — 2 fatture"` → `"MARCHESI ANTINORI SPA"`. L'evento calendario usa `titolo_breve`, mentre il pannello dettaglio mostra il `titolo` full.
- **M.E `WeekView`:** fix overflow eventi titoli lunghi: `<span className="truncate">` → `<div className="truncate">` (truncate richiede block, non inline) + `min-w-0` sui flex container DayColumn e contenitore eventi. Risolve sforamento "evento attraversa 3 colonne".
- **M.E `MonthView`:** counter eventi top-right delle celle ora è badge a pallino (≥3 eventi) invece di testo nudo (sempre presente). Cliccare "+N altri" già drilla in vista giorno via `onDrillDown` di default di `<CalendarView>`.
- **Card riepilogo:** ridotte da 6 a 4 vive (Scadute/Urgenti/Avvicinamento/Pianificazione, ognuna con count grande + € sotto). Future e Totale generale spostati come riga footer compatta. Card a 0 in `opacity-40` per ridurre rumore visivo. Layout flex `[label sub] / [count €]` così count è in evidenza.
- **Pannello dettaglio:** da box multi-grid a una sola riga compatta (~64px h): pillola livello + titolo full + meta inline (data/importo/tipo/fornitore) + pulsanti Scadenziario/SpesaFissa + chiusura `×`. Wrappa su mobile.

#### 3.7.2 Eventi calendario su 2 righe + card cliccabili (G.2.B-fix2, 2026-05-09)

Iterazione successiva: i tile su una sola riga troncavano il nome del fornitore ("€700 · MARCH..."), perdendo info utile. Inoltre le card riepilogo erano puramente informative. Cambi:

- **`MonthView` (M.E):** `EventChip` ora layout 2-righe quando ha `subtitle`: prima riga = `title` bold (importo), seconda riga = `subtitle` truncate (nome fornitore). Eventi senza subtitle continuano a layout single-line (retrocompatibilità). `MAX_CHIPS` ridotto da 3 a 2 e `min-h` celle aumentato (da 4.5/5.5/6.5 rem a 5.5/7/8 rem) per dare aria.
- **Pagina:** mapping evento aggiornato → `title = "€XXX,XX"`, `subtitle = titolo_breve`. La pillola livello rimossa dal subtitle (ridondante col colore della cella).
- **Card riepilogo cliccabili:** click su Scadute / Urgenti / Avvicinamento / Pianificazione → modale `<ModaleElencoLivello>` con tabella scrollabile (data, titolo, fornitore, tipo, importo) + bottoni `💸 Scadenziario` e `🏠 Spesa fissa` per ogni riga. Chiusura via X / Esc / click overlay. Card a 0 non cliccabili (cursor-default).

---

# 4. Navigazione

**ControlloGestioneNav** (v2.1-audit) — barra di navigazione persistente con **8 tab** (ControlloGestioneNav.jsx:16-25):

| # | Tab | Route | Icona |
|---|-----|-------|-------|
| 1 | Dashboard | `/controllo-gestione/dashboard` | 📊 |
| 2 | Conto Economico | `/controllo-gestione/conto-economico` | 💼 |
| 3 | Scadenzario | `/controllo-gestione/uscite` | 💸 |
| 4 | Calendario | `/controllo-gestione/calendario` | 📅 |
| 5 | Spese Fisse | `/controllo-gestione/spese-fisse` | 📋 |
| 6 | Utenze | `/controllo-gestione/utenze` | 💡 |
| 7 | Batch | `/controllo-gestione/batch-pagamenti` | 📨 |
| 8 | Riconciliazione | `/controllo-gestione/riconciliazione` | 🔗 |

Brand link "🎯 Controllo Gestione" naviga a `/controllo-gestione`. Le stesse voci sono nel menu moduli globale (`frontend/src/config/modulesMenu.js:87-103`). Tab rimossi con audit 2026-05-16: "Liquidità" (overlap con Flussi Cassa) e "Confronto" (placeholder mai sviluppato).

---

# 5. API Backend

Router: `app/routers/controllo_gestione_router.py`
Prefix: `/controllo-gestione`
Auth: JWT (tutte le route richiedono token)

### Endpoint principali

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/dashboard` | Dashboard unificata (vendite, acquisti, banca, margine, andamento) — router:74 |
| GET | `/conto-economico` 🆕 | Conto Economico completo (anno/mese, `modalita=competenza\|cassa`, `periodo=mese\|trimestre\|anno`, trimestre) — router:334 |
| GET | `/conto-economico/pdf` 🆕 | Export PDF brandizzato del CE (stessi parametri) — router:403 |
| GET/PUT | `/ipratico-tipi` 🆕 | Mapping categorie iPratico → tipo vendita (C2) — router:444, :469 |
| ~~GET~~ | ~~`/confronto`~~ | (rimosso 2026-05-16 — stub mai usato; usare `/conto-economico` con `periodo`) — router:499 |
| POST | `/uscite/import` | Importa fatture da Acquisti → cg_uscite (chiamato in auto dallo Scadenzario) — router:554 |
| GET | `/uscite` | Scadenzario uscite con filtri — router:940 |
| GET | `/scadenze` | Scadenze per calendario/widget (G.2.B) — router:1220 |
| ~~GET~~ | ~~`/uscite/senza-scadenza`~~ | (rimosso 2026-05-16 — zero chiamate FE) — router:1345 |
| GET/PUT | `/fornitore/{piva}/pagamento` | Condizioni pagamento di un fornitore (lettura/aggiornamento) — router:1356, :1455 |
| GET/POST/PUT/DELETE | `/condizioni-pagamento/preset` 🆕 | CRUD preset condizioni di pagamento (`/preset`, `/preset/{id}`) — router:1514-1575 |
| ~~GET~~ | ~~`/mp-labels`~~ | (rimosso 2026-05-16 — il dict `MP_LABELS` resta interno, router:512) |
| GET/POST | `/spese-fisse` 🆕 | Lista + creazione spese fisse — router:1596, :1743 |
| GET | `/spese-fisse/template-csv` 🆕 | Template CSV scaricabile (G.1.5) — router:1688 |
| GET/PUT/DELETE | `/spese-fisse/{id}` 🆕 | Dettaglio / modifica / delete cascade (409 se rate riconciliate) — router:1732, :1917, :2008 |
| GET/POST/DELETE | `/spese-fisse/{id}/piano-rate` 🆕 | Piano rate (lista/crea; delete su `/piano-rate/{rata_id}`) — router:2079, :2246, :2344 |
| POST | `/spese-fisse/import-csv` 🆕 | Import piano rate da CSV (G.1.5) — router:2403 |
| GET | `/spese-fisse/{id}/storico` 🆕 | Storico addebiti spesa fissa — router:2698 |
| POST/GET | `/spese-fisse/{id}/adeguamento`, `/adeguamenti` 🆕 | Adeguamento importo (es. ISTAT) + storico in `cg_spese_fisse_adeguamenti` — router:4723, :4806 |
| GET | `/uscite/{id}/candidati-banca` 🆕 | Candidati movimento banca per riconciliazione — router:2794 |
| GET | `/uscite/da-riconciliare` 🆕 | Worklist riconciliazione per canale (banca/carta/contanti) — router:2866 |
| GET | `/uscite/{id}/ricerca-banca` 🆕 | Ricerca libera movimenti banca — router:2955 |
| PUT | `/uscite/{id}/scadenza`, `/ripristina-data`, `/iban`, `/modalita-pagamento` 🆕 | Mutazioni D3/anagrafica pagamento della singola uscita — router:3034, :3164, :3261, :3327 |
| POST | `/uscite/segna-pagate-bulk` 🆕 | Marca pagate in bulk — router:3390 |
| POST | `/uscite/batch-pagamento` 🆕 | Crea `cg_pagamenti_batch` da un set di uscite (Scadenzario "Stampa / Metti in pagamento") — router:3442 |
| GET/GET/PUT/DELETE | `/pagamenti-batch`, `/pagamenti-batch/{id}` 🆕 | Lista/dettaglio/transizione stato/elimina batch — router:3541, :3568, :3607, :3660 |
| DELETE | `/pagamenti-batch/{batch_id}/uscite/{uscita_id}` | Rimuove singola uscita dal batch (BP) — router:3699 |
| POST | `/pagamenti-batch/{id}/auto-close`, `/pagamenti-batch/auto-close-all` | Auto-close batch (BP) — router:3838, :3866 |
| POST | `/rateizzazioni/{sf_id}/auto-close`, `/rateizzazioni/auto-close-all` | Auto-close rateizzazioni (RC.1+RC.3) — router:4052, :4071 |
| PUT | `/uscita/{id}/stato-pagamento` 🆕 | Cambio stato D1+D2 via `fatture_stato_service.set_stato` — router:4106 |
| POST | `/fattura/{fattura_id}/segna-pagata-manuale` 🆕 | Segna pagata manuale a partire dalla fattura — router:4223 |
| POST/DELETE | `/uscite/{id}/riconcilia` 🆕 | Riconcilia / dissocia movimento banca — router:4298, :4371 |
| POST | `/uscite/{id}/paga-contanti`, `/cambia-canale`, `/paga-carta` 🆕 | Pagamento per canale (contanti/carta) + riassegnazione canale — router:4416, :4486, :4557 |
| GET | `/movimenti-contanti` 🆕 | Movimenti contanti — router:4631 |
| GET | `/uscite-da-pagare` 🆕 | Lista uscite da pagare (consumer esterni) — router:4676 |

(righe "router:N" = `app/routers/controllo_gestione_router.py:N`. Per gli endpoint Utenze vedi la tabella C-CG-U* in cima al doc, prefix `/controllo-gestione/utenze`.)

### Parametri endpoint `/uscite`

| Param | Tipo | Descrizione |
|-------|------|-------------|
| stato | string | Filtro: PROGRAMMATO, SCADUTO, PAGATO, PAGATO_MANUALE, VERIFICARE, SPOSTATO, RATEIZZATO, PARZIALE (router:957) |
| fornitore | string | Ricerca testo nel nome fornitore |
| da | string | Data scadenza minima (YYYY-MM-DD) |
| a | string | Data scadenza massima (YYYY-MM-DD) |
| ordine | string | scadenza_asc, scadenza_desc, importo_asc, importo_desc, fornitore, data_fattura |
| includi_rateizzate | bool | Default false: le fatture rateizzate sono nascoste (router:947) |
| includi_escluse | bool | Default false: nasconde fatture di fornitori con `escluso_acquisti=1` (router:948) |

### Parametri endpoint `/dashboard`

| Param | Tipo | Descrizione |
|-------|------|-------------|
| anno | int | Anno di riferimento (default: corrente) |
| mese | int | Mese di riferimento (default: corrente) |

---

# 6. Database

Posizione: `app/data/foodcost.db`

### Tabella `cg_uscite` (Migration 032)
Uscite importate dalle fatture acquisti.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| id | INTEGER PK | Auto-increment |
| fattura_id | INTEGER FK | Riferimento a fe_fatture.id |
| fornitore_nome | TEXT | Nome fornitore |
| fornitore_piva | TEXT | P.IVA fornitore |
| numero_fattura | TEXT | Numero fattura |
| data_fattura | TEXT | Data fattura (YYYY-MM-DD) |
| totale | REAL | Importo totale fattura |
| data_scadenza | TEXT | Data scadenza calcolata (YYYY-MM-DD) |
| importo_pagato | REAL | Importo effettivamente pagato |
| data_pagamento | TEXT | Data del pagamento |
| stato | TEXT | Enum a 8 valori (v. `app/services/stati_pagamento.py`): PAGATO, PAGATO_MANUALE (macro CHIUSO); PROGRAMMATO, SCADUTO, VERIFICARE, SPOSTATO, RATEIZZATO, PARZIALE (macro APERTO) |
| banca_movimento_id | INTEGER | FK movimento banca (riconciliazione) |
| note | TEXT | Note libere |

**Indici**: UNIQUE su fattura_id (una uscita per fattura), stato, data_scadenza.

**Colonne aggiunte da migrazioni successive** (verificate dall'uso nel codice; schema DDL non nello snapshot): `stato_macro` (GENERATED, CHIUSO/APERTO), `tipo_uscita` (FATTURA/SPESA_FISSA/STIPENDIO/SPESA_BANCARIA/...), `spesa_fissa_id`, `periodo_riferimento`, `iban`, `metodo_pagamento`, `in_pagamento_at`, `pagamento_batch_id` (azzerati al pagamento, mig 104).

### Tabella `cg_spese_fisse` (Migration 032)
Spese ricorrenti senza fattura.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| id | INTEGER PK | Auto-increment |
| tipo | TEXT | AFFITTO, TASSA, F24_STIPENDI, RATEIZZAZIONE_TASSE, STIPENDIO, PRESTITO, RATEIZZAZIONE, ASSICURAZIONE, ALTRO |
| titolo | TEXT | Titolo della spesa |
| descrizione | TEXT | Descrizione |
| importo | REAL | Importo |
| frequenza | TEXT | MENSILE, BIMESTRALE, TRIMESTRALE, SEMESTRALE, ANNUALE, UNA_TANTUM |
| giorno_scadenza | INTEGER | Giorno del mese in cui scade |
| data_inizio | TEXT | Data inizio (YYYY-MM-DD) |
| data_fine | TEXT | Data fine (YYYY-MM-DD, NULL=indefinita) |
| attiva | INTEGER | 1=attiva, 0=disattivata |

**Colonne aggiunte da migrazioni successive** (verificate dall'uso nel codice): `iban`, `importo_originale` (totale piano), `spese_legali`.

### Tabelle successive del modulo (schema DDL non nello snapshot, uso verificato nel codice)

| Tabella | Scopo | Rif codice |
|---|---|---|
| `cg_piano_rate` | Rate variabili (prestiti alla francese, rateizzazioni con date irregolari); campi citati: `numero_rata`, `codice_pagamento` (mig 108), `data_scadenza_specifica` (mig 108), `periodo`, `importo`, `note` | router:2079+ |
| `cg_pagamenti_batch` | Batch di pagamento (stati IN_PAGAMENTO → INVIATO_CONTABILE → CHIUSO; `n_uscite`, `totale`, `inviato_contabile_at`, `chiuso_at`) | router:3442-3925 |
| `cg_spese_fisse_adeguamenti` 🆕 | Storico adeguamenti importo (es. ISTAT) | router:4723, :4806 |
| `cg_utenze_forniture`, `cg_utenze_bollette`, `cg_utenze_consumi_mensili` | Sub-modulo Analisi Utenze (mig 151) | cg_utenze_router.py |
| `ipratico_categoria_tipo` | Mapping categoria iPratico → tipo vendita per composizione venduto (mig 149) | conto_economico.py:801 |

### Tabella `cg_uscite_log` (Migration 032)
Log di ogni operazione di import per tracciabilita'.

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| tipo | TEXT | Tipo operazione (IMPORT_FATTURE) |
| fatture_importate | INTEGER | Nuove fatture importate |
| fatture_aggiornate | INTEGER | Fatture con stato aggiornato |
| fatture_saltate | INTEGER | Fatture gia' presenti senza modifiche |

### Campi aggiunti a `fe_fatture` (Migration 031)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| condizioni_pagamento | TEXT | Codice FatturaPA (TP01=a rate, TP02=completo) |
| modalita_pagamento | TEXT | Codice FatturaPA (MP01, MP05, MP08...) |
| data_scadenza | TEXT | Estratta da DatiPagamento XML |
| importo_pagamento | REAL | Importo dal dettaglio pagamento XML |

### Campi aggiunti a `suppliers` (Migration 031)

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| modalita_pagamento_default | TEXT | Modalita' default quando XML non la contiene |
| giorni_pagamento | INTEGER | Giorni dalla data fattura per calcolo scadenza |
| note_pagamento | TEXT | Note sulle condizioni di pagamento |

---

# 7. Frontend — File

```
frontend/src/pages/controllo-gestione/
  ControlloGestioneDashboard.jsx          — Dashboard unificata (/controllo-gestione/dashboard)
  ControlloGestioneContoEconomico.jsx     — Conto Economico (/controllo-gestione/conto-economico)
  ControlloGestioneUscite.jsx             — Scadenzario uscite (/controllo-gestione/uscite)
  ControlloGestioneCalendarioScadenze.jsx — Calendario scadenze (/controllo-gestione/calendario)
  ControlloGestioneSpeseFisse.jsx         — Spese fisse (/controllo-gestione/spese-fisse)
  ControlloGestioneUtenze.jsx             — Analisi Utenze (/controllo-gestione/utenze)
  ControlloGestioneBatchPagamenti.jsx     — Batch pagamenti (/controllo-gestione/batch-pagamenti)
  ControlloGestioneRiconciliazione.jsx    — Workbench riconciliazione (/controllo-gestione/riconciliazione)
  ControlloGestioneNav.jsx                — Barra navigazione persistente (8 tab)
  ControlloGestioneConfronto.jsx          — (orfano) placeholder Confronto, non più in nav
  ControlloGestioneLiquidita.jsx          — (orfano) pagina Liquidità; endpoint /liquidita rimosso lato backend (router:539)
```

`ControlloGestioneMenu.jsx` (hub a tile) — **(rimosso)**, non esiste più nel codice.

### Componente condizioni pagamento (in modulo Acquisti)

In `FattureFornitoriElenco.jsx` (dettaglio fornitore inline) e' stata aggiunta la sezione "Condizioni di pagamento" con:
- Dropdown modalita' pagamento (MP01-MP19)
- Campo giorni pagamento (numerico)
- Campo note (testo libero)
- Bottone salva con feedback

---

# 8. Routing Frontend

```
/controllo-gestione/dashboard          — Dashboard unificata
/controllo-gestione/conto-economico    — Conto Economico
/controllo-gestione/uscite             — Scadenzario uscite
/controllo-gestione/calendario         — Calendario scadenze
/controllo-gestione/spese-fisse        — Spese fisse
/controllo-gestione/utenze             — Analisi Utenze
/controllo-gestione/batch-pagamenti    — Batch pagamenti
/controllo-gestione/riconciliazione    — Workbench riconciliazione
```

Route derivate da `ControlloGestioneNav.jsx` e `config/modulesMenu.js` (il file `App.jsx` non è presente nello snapshot: la registrazione delle route non è verificabile direttamente). La radice `/controllo-gestione` è il target del brand link della nav; l'hub a tile è stato rimosso. Le vecchie route `/controllo-gestione/confronto` e `/controllo-gestione/liquidita` non sono più linkate dalla nav (Liquidità: redirect a `/flussi-cassa/dashboard` secondo il commento in router:539-541).

---

# 9. Flusso operativo

## 9.1 Import uscite
1. Marco va in Controllo Gestione → Scadenzario: l'import parte **automaticamente** al caricamento pagina (`POST /uscite/import`, ControlloGestioneUscite.jsx:153-162)
2. Il sistema legge tutte le fatture da `fe_fatture` (escluse autofatture `is_autofattura=1` e note credito TD04)
3. Per ogni fattura calcola la data di scadenza:
   - Priorita' 1: `fe_fatture.data_scadenza` (estratta da XML al momento dell'import fattura)
   - Priorita' 2: `suppliers.giorni_pagamento` del fornitore → data_fattura + N giorni
   - Se nessuno dei due e' disponibile → la fattura viene importata senza scadenza
4. Calcola lo stato: SCADUTO se data_scadenza < oggi, PROGRAMMATO altrimenti (anche se senza scadenza); se esiste cross-ref banca → PAGATO
5. Fatture gia' importate: aggiorna solo gli stati derivati da data (PROGRAMMATO/SCADUTO); gli stati "manuali" (PAGATO, PAGATO_MANUALE, VERIFICARE, SPOSTATO, RATEIZZATO, PARZIALE) sono intoccabili dal sync, con l'eccezione del cross-ref banca nuovo che propaga PAGATO
6. Mostra riepilogo: N importate, N aggiornate, N saltate, N senza scadenza

## 9.2 Gestire fatture senza scadenza
1. Il KPI "Senza scadenza" nel tabellone mostra quante fatture mancano di data scadenza
2. Per risolvere: andare in Acquisti → Fornitori → selezionare il fornitore
3. Nella sezione "Condizioni di pagamento" impostare i giorni pagamento (es. 30, 60, 90)
4. Tornare in Controllo Gestione e reimportare → le fatture del fornitore avranno ora la scadenza

## 9.3 Matching pagamenti — IMPLEMENTATO (Workbench Riconciliazione)
1. Pagina `/controllo-gestione/riconciliazione` (`ControlloGestioneRiconciliazione.jsx`): split-pane per canale (banca/carta/contanti), worklist da `GET /uscite/da-riconciliare?canale=...`
2. Match banca: candidati automatici (`GET /uscite/{id}/candidati-banca`) + ricerca libera (`GET /uscite/{id}/ricerca-banca`)
3. Conferma: `POST /uscite/{id}/riconcilia` → stato PAGATO + `banca_movimento_id`; dissocia con DELETE sullo stesso path
4. Cross-ref banca propagato anche dall'import (vedi 9.1) — dettagli in `docs/spec_riconciliazione.md`

## 9.4 Gestione contanti / carta
1. Pagamenti in contanti: `POST /uscite/{id}/paga-contanti` (router:4416) + `GET /movimenti-contanti` (router:4631)
2. Pagamenti carta: `POST /uscite/{id}/paga-carta` (router:4557); cambio canale via `POST /uscite/{id}/cambia-canale` (router:4486)

---

# 10. Codici Modalita' Pagamento FatturaPA

| Codice | Descrizione |
|--------|-------------|
| MP01 | Contanti |
| MP02 | Assegno |
| MP03 | Assegno circolare |
| MP05 | Bonifico |
| MP08 | Carta di pagamento |
| MP09 | RID |
| MP12 | RIBA |
| MP16 | Domiciliazione bancaria |
| MP19 | SEPA Direct Debit |
| MP23 | PagoPA |

Codici completi nel mapping `MP_LABELS` in `controllo_gestione_router.py`.

---

# 11. Relazioni con altri moduli

| Modulo | Relazione | Direzione |
|--------|-----------|-----------|
| Acquisti | Import fatture → cg_uscite | Acquisti → CG |
| Acquisti | Condizioni pagamento fornitore | CG scrive in suppliers |
| Banca | Matching pagamenti (riconciliazione, IMPLEMENTATO) | Banca → CG |
| Vendite | Lettura corrispettivi + fatture emesse per dashboard/CE (via `vendite_aggregator`) | Vendite → CG (read-only) |
| Gestione Contanti | Pagamenti cash (`paga-contanti`, `movimenti-contanti`) | Contanti → CG |
| Acquisti (fe_fatture) | Aggancio bollette utenze via numero fattura (sola analisi, no importi nel CE) | Acquisti → CG Utenze |

> **IMPORTANTE**: Finanza rimosso — le sue funzionalità sono state integrate in Controllo Gestione.

---

# 12. Roadmap

> Nota verifica 2026-07-25: sezione storica. Il modulo è oggi alla **2.21**; gran parte delle voci "pianificate" qui sotto è stata implementata (matching banca → Riconciliazione; spese fisse, rateizzazioni e prestiti → §3.5; alert scadenze → §3.6; report PDF → CE PDF G.3.7b). Roadmap viva: `docs/roadmap.md`.

## v1.0 (storico) — 2026-03-29
- Modulo top-level con menu, dashboard, tabellone uscite, confronto periodi
- Import fatture da Acquisti con calcolo scadenza automatico
- Estrazione DatiPagamento da XML FatturaPA
- Condizioni pagamento default per fornitore
- Avviso fatture senza scadenza
- Integrazione funzionalità precedentemente in Finanza (rimosso v1.0)

## v1.1 (pianificata)
- Matching pagamenti con Banca (punto 5 piano originale)
- Aggiornamento automatico stato uscite su match
- Sezione Spese Fisse (affitti, tasse, stipendi)

## v1.2 (pianificata)
- Matching pagamenti contanti (gestione contanti)
- Rateizzazioni e prestiti in Spese Fisse
- Dashboard con previsioni cash flow

## v2.0 (futuro)
- Budget vs consuntivo
- Alert automatici scadenze imminenti
- Report PDF esportabili

---

# 13. Changelog

## v1.0 (2026-03-29)
- **Nuovo modulo**: Controllo di Gestione — modulo top-level separato da Finanza
- **Dashboard unificata**: KPI vendite/acquisti/banca/margine, andamento annuale, top fornitori, categorie
- **Tabellone Uscite**: import fatture da Acquisti, calcolo scadenze, filtri, ordinamento, KPI
- **Estrazione DatiPagamento**: parser XML arricchito per estrarre condizioni, modalita', scadenza, importo dal blocco DatiPagamento FatturaPA
- **Condizioni pagamento fornitore**: nuova sezione nella scheda fornitore (Acquisti) per impostare default modalita'/giorni/note
- **Migration 031**: campi pagamento su fe_fatture e suppliers
- **Migration 032**: tabelle cg_uscite, cg_spese_fisse, cg_uscite_log
- **Confronto Periodi**: confronto due mesi/anni con variazioni percentuali
