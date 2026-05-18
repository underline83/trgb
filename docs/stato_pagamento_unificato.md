# Stato pagamento unificato (G.5 + G.6 + G.7 + G.8) — riferimento tecnico

> Sessione 2026-05-11. Documento canonico per capire come funziona lo stato di pagamento delle fatture passive nel sistema TRGB **post G.5 Livello 3 + G.6 uniformazione naming + G.7 Sposta data + G.8 livello macro/sotto**.

## 1. Storia del problema

Prima di G.5, il sistema TRGB aveva **3 source of truth indipendenti** per lo stato di pagamento di una fattura:

1. `fe_fatture.pagato` (boolean 0/1) — il primo flag, dal 2024
2. `fe_fatture.stato_pagamento` (TEXT: `da_pagare`/`da_verificare`/`pagato_manuale`/`pagato`) — aggiunto in mig 103 (2026-04-27)
3. `cg_uscite.stato` (TEXT: `DA_PAGARE`/`SCADUTA`/`PAGATA`/`PAGATA_MANUALE`/`PARZIALE`/`RATEIZZATA`) — workflow modulo CG

> ⚠️ Naming pre-G.6. **Dopo G.6 (mig 114) tutti gli stati sono stati rinominati al maschile**: `PROGRAMMATO`/`SCADUTO`/`PAGATO`/`PAGATO_MANUALE`/`PARZIALE`/`RATEIZZATO`/`VERIFICARE`/`SPOSTATO`. Vedi §12.

**Conseguenza:** moduli diversi vedevano numeri diversi sulla stessa cosa. Il widget Home Acquisti mostrava 555 fatture, il modulo Acquisti → Fatture filtro "Da pagare" 838, il modulo CG ~620. Drift fra le 3 colonne mai risolto, perché ogni endpoint scriveva sul suo flag senza aggiornare gli altri.

## 2. Soluzione G.5 (Livello 3)

**Una sola fonte di verità:** `cg_uscite.stato`.

Le altre due colonne sono state **rimosse fisicamente dal DB** (mig 112):

```
ALTER TABLE fe_fatture DROP COLUMN pagato;
ALTER TABLE fe_fatture DROP COLUMN stato_pagamento;
DROP INDEX idx_fe_fatture_stato_pagamento;
```

Per evitare di toccare decine di endpoint che leggevano questi campi, è stata creata una **VIEW SQL** che li ricostruisce al volo:

```sql
CREATE VIEW fe_fatture_with_stato AS
SELECT
  f.*,
  CASE u.stato
    WHEN 'PAGATA' THEN 1 WHEN 'PAGATA_MANUALE' THEN 1
    ELSE 0
  END AS pagato,
  CASE u.stato
    WHEN 'PAGATA' THEN 'pagato'
    WHEN 'PAGATA_MANUALE' THEN 'pagato_manuale'
    WHEN 'PARZIALE' THEN 'da_verificare'
    WHEN 'DA_VERIFICARE' THEN 'da_verificare'
    ELSE 'da_pagare'
  END AS stato_pagamento,
  u.stato AS cg_uscite_stato
FROM fe_fatture f
LEFT JOIN cg_uscite u ON u.fattura_id = f.id;
```

Le query Python che leggevano `pagato` o `stato_pagamento` ora interrogano `fe_fatture_with_stato` invece di `fe_fatture`. **Risposta API identica**, frontend non cambia.

## 3. Mappatura completa

### `cg_uscite.stato` → derivati esposti via VIEW

| `cg_uscite.stato` | `pagato` (boolean) | `stato_pagamento` (TEXT) | Note |
|---|---|---|---|
| `PAGATA`           | 1 | `pagato`         | Riconciliata via banca (`banca_movimento_id` valorizzato) |
| `PAGATA_MANUALE`   | 1 | `pagato_manuale` | Marcata pagata manualmente, no match banca |
| `PARZIALE`         | 0 | `da_verificare`  | Pagamento parziale (`importo_pagato < totale`) |
| `DA_VERIFICARE`    | 0 | `da_verificare`  | Stato esplicito utente (es. CONTROLLARE audit mig 110) |
| `DA_PAGARE`        | 0 | `da_pagare`      | Default per fatture nuove |
| `SCADUTA`          | 0 | `da_pagare`      | Data scadenza passata, da pagare comunque |
| `RATEIZZATA`       | 0 | `da_pagare`      | La spesa fissa gestisce il piano. Neutro qui. |
| (nessun cg_uscite) | 0 | `da_pagare`      | Fattura senza proiezione (default sicuro) |

### `stato_pagamento` (legacy) → `cg_uscite.stato` (per le scritture)

| `stato_pagamento` | `cg_uscite.stato` |
|---|---|
| `da_pagare`       | `DA_PAGARE` (o `SCADUTA` se data passata) |
| `da_verificare`   | `DA_VERIFICARE` |
| `pagato_manuale`  | `PAGATA_MANUALE` |
| `pagato`          | `PAGATA` (solo via riconciliazione banca, `force=True`) |

## 4. API endpoints — comportamento post G.5

### Letture (interfaccia INVARIATA)

Le query SQL ora usano `FROM fe_fatture_with_stato` invece di `FROM fe_fatture`. La VIEW espone gli stessi campi `pagato` e `stato_pagamento`. Il frontend non vede differenze.

File aggiornati:
- `app/routers/fe_import.py` (`list_fatture`, `get_fattura_detail`)
- `app/routers/dashboard_router.py` (`_acquisti_metrics`, `_fatture_pending`)
- `app/services/alert_engine.py` (checker `fatture_scadenza`)
- `app/routers/fe_proforme_router.py` (lookup proforme)
- `app/routers/fattureincloud_router.py` (list FIC)

### Scritture (refactored, URL invariati)

I 3 endpoint che modificavano lo stato pagamento ora **scrivono su `cg_uscite.stato`** invece di su `fe_fatture.pagato` / `fe_fatture.stato_pagamento`:

- `POST /contabilita/fe/fatture/segna-pagate` — chiama `set_stato(fid, 'pagato_manuale')`
- `POST /contabilita/fe/fatture/segna-non-pagate` — chiama `set_stato(fid, 'da_pagare')` con check scadenza per upgrade a `SCADUTA`
- `PUT /contabilita/fe/fatture/{id}/stato-pagamento` — chiama `set_stato(fid, payload.stato)`

Tutti passano per `app/services/fatture_stato_service.py` che mappa `stato_pagamento` legacy → `cg_uscite.stato` canonico. Il service:
- Crea cg_uscite stub se mancante (caso edge: fatture orfane)
- Valida `'pagato'` settabile solo via banca (`force=True`)
- Validità `STATI_VALIDI`: `{da_pagare, da_verificare, pagato_manuale, pagato}`

## 5. Caso speciale: Fatture in Cloud (FIC)

FIC mantiene un proprio flag pagato che leggiamo dall'API REST. Per evitare confusione, la sua "verità" è preservata in una colonna dedicata:

- **`fe_fatture.fic_pagato_raw`** (INTEGER NULL, mig 111) — copia del flag FIC, NON usato dal workflow generale
- Durante l'import FIC: se `fic_pagato_raw=1`, il sistema **propaga** su `cg_uscite.stato='PAGATA_MANUALE'` (a meno che non sia già in stato `PAGATA`/`PAGATA_MANUALE`). Si veda `_fetch_detail_and_righe()` in `fattureincloud_router.py`.
- Vantaggio: il flag FIC resta tracciato (audit) ma non confonde gli altri moduli, che vedono solo `cg_uscite.stato` consolidato.

## 6. Migrazioni stack

| Mig | Azione |
|---|---|
| 025 | Creazione iniziale `fe_fatture.pagato` (boolean) |
| 103 | Creazione `fe_fatture.stato_pagamento` (TEXT) — duplicato semantico di pagato |
| 110 | Allineamento finale di `pagato` + `stato_pagamento` + `cg_uscite.stato` per le 513 fatture audit Marco |
| **111** | **Preparazione G.5**: stub orfane + indice perf + DA_VERIFICARE + colonna fic_pagato_raw |
| **112** | **DROP COLUMN** `pagato` e `stato_pagamento` + CREATE VIEW `fe_fatture_with_stato` |

## 7. Frontend — niente cambia

Il frontend continua a leggere `f.pagato` (boolean) e `f.stato_pagamento` (TEXT) dalle response API. Sono campi calcolati dalla VIEW, non più colonne fisiche. Tutta la UI esistente (badge, filtri, sort) funziona identica.

L'unico campo nuovo che il frontend può leggere se vuole granularità: `f.cg_uscite_stato` (es. `DA_PAGARE`, `SCADUTA`, `PAGATA_MANUALE`...). Utile per badge più dettagliati in futuro.

## 8. Performance

L'unico costo della VIEW è il LEFT JOIN su `cg_uscite(fattura_id)` durante le letture. Mitigazioni:
- **Indice composito** `idx_cg_uscite_fattura_stato` su `cg_uscite(fattura_id, stato)` (mig 111) — copre il workload tipico (filtri + accesso allo stato)
- Le query con `WHERE stato IN ('DA_PAGARE','SCADUTA')` o simili usano l'indice direttamente
- 1500 fatture × 1 JOIN per query = ~1ms. Trascurabile.

## 9. Rollback

In caso di emergenza, ripristinare dal backup automatico di push.sh oppure dai file:
- `claude/backup_pre_g5_*.db` (snapshot esplicito pre-migrazione)
- `fe_fatture_archive_110` + `cg_uscite_archive_110` (per la mig 110 specifica)

`SQLite` non supporta UNDO automatico di DROP COLUMN, quindi un rollback richiede sostituire interamente il file `foodcost.db`.

## 10. Stato corrente (post deploy G.5)

Atteso dopo deploy:
- Card Home Acquisti: ~180 fatture / ~€99k
- Modulo Acquisti → Fatture, filtro "Da pagare": ~250 fatture (allineato col widget Home)
- Modulo CG → Uscite, filtro "Da riconciliare": ~250 (stesso conteggio, stessa fonte)
- Drift: **zero** (per costruzione, non c'è più dove drifare)

## 11. Glossario rapido

- **VIEW**: tabella virtuale calcolata al volo da una SELECT salvata
- **Source of truth**: `cg_uscite.stato`
- **Service**: `app/services/fatture_stato_service.py` — unico punto autorizzato a scrivere lo stato
- **`fic_pagato_raw`**: flag importato da Fatture in Cloud, preservato per audit ma non usato dal workflow

## 12. G.6 — Naming uniforme al maschile (mig 114)

Prima di G.6 c'era incoerenza fra forme maschili e femminili degli stati (es. `DA_PAGARE` ma `PAGATA`, `SCADUTA` ma `PAGATA_MANUALE`). Per dare logica univoca, **tutti gli stati sono al maschile** dopo G.6.

### Tabella rename (eseguita da mig 114)

| Pre-G.6 | Post-G.6 | Note |
|---|---|---|
| `DA_PAGARE`      | `PROGRAMMATO`    | "Programmato" = scadenza decisa, data nel futuro. Più chiaro di "da pagare" |
| `SCADUTA`        | `SCADUTO`        | Data scadenza passata |
| `DA_VERIFICARE`  | `VERIFICARE`     | Pagamento ambiguo (audit, marcatura manuale). Niente preposizione "da" |
| `PAGATA`         | `PAGATO`         | Riconciliata via banca |
| `PAGATA_MANUALE` | `PAGATO_MANUALE` | Marcata pagata manualmente |
| `RATEIZZATA`     | `RATEIZZATO`     | Rateizzata in spesa fissa |
| `PARZIALE`       | `PARZIALE`       | Invariato (già neutro) |
| _(nuovo)_        | `SPOSTATO`       | Aggiunto da G.7, vedi §13 |

### Impatto

- Mig 114 fa UPDATE atomico su `cg_uscite.stato` + ricrea VIEW `fe_fatture_with_stato` con i nuovi valori
- Backend service `fatture_stato_service.py` mappa i 4 stati legacy `da_pagare`/`da_verificare`/`pagato_manuale`/`pagato` → nuovi nomi maschili
- Frontend `STATO_STYLE`, `STATO_BADGE`, `STATO_LABEL` aggiornati con i nuovi nomi
- I label utente restano "Programmato" / "Scaduto" / "Verificare" / etc. (capitalize)

## 13. G.7 — Stato SPOSTATO + UX Sposta data

### Razionale

Era frequente che una fattura importata da SDI portasse una `data_scadenza_xml` errata o non rispettata, e Marco doveva riprogrammare manualmente la scadenza. Pre-G.7 questo si faceva editando direttamente `cg_uscite.data_scadenza`, **perdendo traccia dell'originale**. Inoltre lo stato restava `PROGRAMMATO`, indistinguibile dalle fatture mai toccate.

### Soluzione

1. Nuovo stato `SPOSTATO` (mig 114): la fattura ha una scadenza riprogrammata dall'utente
2. Nuova colonna `cg_uscite.data_scadenza_originale` (mig 114): preserva la scadenza pre-spostamento
3. Endpoint `PUT /controllo-gestione/uscite/{id}/scadenza` esteso:
   - se la nuova data ≠ originale e lo stato è `PROGRAMMATO`/`SCADUTO`/`SPOSTATO`, setta `stato = 'SPOSTATO'` e salva l'originale in `data_scadenza_originale` (solo la prima volta)
4. Nuovo endpoint `PUT /controllo-gestione/uscite/{id}/ripristina-data`:
   - ripristina `data_scadenza ← data_scadenza_originale`
   - ricalcola stato (`SCADUTO` se data nel passato, altrimenti `PROGRAMMATO`)
   - reset `data_scadenza_originale = NULL`

### UX frontend

- **`FattureDettaglio.jsx`** tab Pagamenti: la card Scadenza è 2 sotto-celle affiancate
  - "Scadenza iniziale" (read-only, da XML)
  - "Programmata" (editabile, con badge "spost." se `statoUscita === 'SPOSTATO'` e bottone "Ripristina originale")
- **`ControlloGestioneUscite.jsx`**: chip filtro `SPOSTATO` con palette fuchsia + label "Spostato"
- **`FattureElenco.jsx`**: drill-down filtro pagamento riga 2 include chip `Spostato`

### Mapping `data_scadenza` derivato

| Caso | `data_scadenza` mostrata | `data_scadenza_originale` | Stato |
|---|---|---|---|
| Fattura mai toccata        | = `data_scadenza_xml` | NULL | `PROGRAMMATO` o `SCADUTO` |
| Marco sposta una scadenza  | nuova data | data XML originale | `SPOSTATO` |
| Marco sposta una scadenza già spostata | ultima data | originale (preservato dal primo spostamento) | `SPOSTATO` |
| Marco ripristina           | = `data_scadenza_originale` | NULL | ricalcolato (`SCADUTO`/`PROGRAMMATO`) |
| Pagata                     | invariata | invariata | `PAGATO`/`PAGATO_MANUALE` |

## 14. G.8 — Livello macro/sotto (CHIUSO/APERTO)

### Razionale

Prima di G.8 i check semantici "è pagato?" erano sparsi come tuple IN hardcoded:
```python
if ex["stato"] in ("PAGATO", "PAGATO_MANUALE", "PARZIALE"):
```

Ogni nuovo sotto-stato (VERIFICARE da G.5, SPOSTATO/RATEIZZATO da G.6/G.7) richiedeva di rivedere TUTTI i punti di check. **Bug di omissione inevitabile**: durante un re-import, 138 fatture VERIFICARE sono state distrutte perché il check su `/uscite/import` non era stato aggiornato (vedi changelog 2026-05-11 e mig 115).

### Soluzione

Tassonomia a 2 livelli:

| MACRO | SOTTO | Significato |
|---|---|---|
| **CHIUSO** | `PAGATO` | Riconciliato banca |
| **CHIUSO** | `PAGATO_MANUALE` | Pagato dichiarato, da riconciliare |
| **APERTO** | `PROGRAMMATO` | Scadenza futura |
| **APERTO** | `SCADUTO` | Scadenza passata |
| **APERTO** | `VERIFICARE` | Dubbio sul pagamento |
| **APERTO** | `SPOSTATO` | Scadenza rinegoziata (G.7) |
| **APERTO** | `RATEIZZATO` | Piano rate aperto |
| **APERTO** | `PARZIALE` | Pagato in parte |

### Implementazione (mig 116)

**Colonna `cg_uscite.stato_macro`** come `GENERATED ALWAYS AS (...) VIRTUAL`:
```sql
ALTER TABLE cg_uscite ADD COLUMN stato_macro TEXT
GENERATED ALWAYS AS (
    CASE
        WHEN stato IN ('PAGATO', 'PAGATO_MANUALE') THEN 'CHIUSO'
        ELSE 'APERTO'
    END
) VIRTUAL
```

**Invariante DB-level**: la colonna si autocalcola ad ogni read da `stato`. Impossibile finire in stato incoerente. Niente trigger, niente sync manuale lato Python.

### Service centralizzato

File `app/services/stati_pagamento.py`:
- `STATI_CHIUSI`, `STATI_APERTI` (frozenset)
- `STATO_MACRO` (dict sotto → macro)
- `is_chiuso(stato)`, `is_aperto(stato)`, `derive_macro(stato)`

Tutto il codice Python che faceva tuple IN list deve passare a `is_chiuso()`/`is_aperto()` o filtrare in SQL via `WHERE stato_macro = 'CHIUSO'`.

### Difesa contro re-import

`/uscite/import` ora protegge tutti gli stati **non derivati dalla data**:
```python
STATI_DERIVATI_DA_DATA = {"PROGRAMMATO", "SCADUTO"}
if ex["stato"] not in STATI_DERIVATI_DA_DATA:
    # NON toccare lo stato — è una decisione utente
```

Logica difensiva per costruzione: se in futuro si aggiunge un nuovo stato (es. `IBRIDATO`), sarà **automaticamente protetto** senza richiedere modifica del codice. Solo PROGRAMMATO/SCADUTO sono fisiologicamente "ricalcolabili" da data.

### VIEW estesa

`fe_fatture_with_stato` ora espone:
- `cg_uscite_stato` (sotto-stato grezzo, già presente da G.6)
- `cg_uscite_stato_macro` (macro, nuovo da G.8)

### Migrazioni stack G.8

| Mig | Azione |
|---|---|
| **116** | ADD COLUMN `stato_macro` GENERATED VIRTUAL + ricreata VIEW con nuova colonna esposta |

---

## 15. MODELLO MENTALE GRANITICO — 3 dimensioni di "stato" (2026-05-18)

> Questa sezione è il **modello canonico** che chiarisce cosa significa "stato" per una fattura.
> Tutti i tre livelli G.5+G.6+G.7+G.8 sopra raccontano l'**implementazione**: la migrazione
> dei dati, il refactor degli enum, la VIEW. Ma **semanticamente** l'utente ragiona in modo
> diverso: distingue 3 dimensioni ortogonali, non un unico enum a 8 valori.
>
> Ogni futura UI/feature DEVE rispettare questa distinzione.

### Le 3 dimensioni semantiche

Una fattura ha **3 stati ortogonali**, non uno solo:

**D1 — Stato del PAGAMENTO** (semantico, business, 3 soli valori):

| Valore | Significato |
|---|---|
| **PAGATA** | La fattura è stata pagata interamente |
| **NON PAGATA** | Nessun pagamento registrato |
| **PARZIALMENTE PAGATA** | Versato in parte, manca differenza |

Questi 3 sono gli **unici stati che servono al business**. Sono la risposta alla domanda "questa fattura è pagata?". Lo userebbe il commercialista, l'oste, chi controlla il conto.

**D2 — Modificatori tecnici del pagamento** (CG-only, organizzativi):

| Modificatore | Significato | Applicabile a |
|---|---|---|
| **\*** (non riconciliata) | Pagata dichiarata, non ancora matchata con un movimento bancario | PAGATA → "Pagata*" |
| **? (da verificare)** | Dubbio utente: "forse pagata, controllare estratto conto" | NON PAGATA → "Da verificare" |

Questi sono **flag tecnici** che servono solo all'utente che gestisce i pagamenti (Marco nel CG). Non sono stati semantici a sé — sono **annotazioni** sopra D1.

**D3 — Stato della SCADENZA / TEMPO** (quando, non se):

| Valore | Significato |
|---|---|
| **IN SCADENZA** | Scadenza nel futuro (es. "fra 5 gg") |
| **SCADUTA** | Scadenza nel passato (es. "scaduta da 3 gg") |
| **RATEIZZATA** | La fattura ha più date di pagamento (gestita da spesa fissa) |
| **SPOSTATA** | La scadenza è stata rinegoziata singolarmente (G.7) |

Questi descrivono **quando** una fattura deve essere pagata. Sono **irrilevanti** se D1 = PAGATA (i soldi sono già usciti, la scadenza non importa più).

**Stato eccezionale — ANNULLATA**: non è una posizione su D1/D2/D3, è un'eccezione globale (nota di credito totale, errore di emissione). Ortogonale a tutto il resto. **Da modellare a parte** quando lo implementeremo.

### Come queste 3 dimensioni mappano sul DB (`cg_uscite.stato`)

L'enum a 8 valori di `cg_uscite.stato` (post G.6/G.7/G.8) **schiaccia** le 3 dimensioni in un unico campo. Per ogni valore:

| `cg_uscite.stato` | D1 | D2 | D3 |
|---|---|---|---|
| `PAGATO`           | PAGATA | (riconciliata) | — irrilevante |
| `PAGATO_MANUALE`   | PAGATA | * non riconciliata | — irrilevante |
| `PARZIALE`         | PARZIALMENTE PAGATA | — | — (la rata pagata ha la sua data) |
| `VERIFICARE`       | NON PAGATA | ? da verificare | — |
| `PROGRAMMATO`      | NON PAGATA | — | IN SCADENZA |
| `SCADUTO`          | NON PAGATA | — | SCADUTA |
| `RATEIZZATO`       | NON PAGATA | — | RATEIZZATA (la madre; le rate vivono in spesa fissa) |
| `SPOSTATO`         | NON PAGATA | — | SPOSTATA |

**Conseguenza pratica**: `cg_uscite.stato` non può rappresentare combinazioni miste (es. "parzialmente pagata e scaduta"). Quando serve granularità, l'UI deve **derivare** D1/D2/D3 a partire da `cg_uscite.stato` + dati di contesto (`data_scadenza`, `importo_pagato`, `banca_movimento_id`).

### Quando UNIRE le dimensioni, quando SEPARARLE

**Regola obbligatoria** per ogni nuova UI:

| Contesto | Dimensioni | Razionale |
|---|---|---|
| **Modulo Fatture** (FattureDettaglio, FattureElenco) | **D1 e D3 SEPARATI** (due chip distinti nell'header) | L'utente sta guardando UNA fattura come documento contabile: vuole sapere "è pagata?" (D1) e "quando va pagata?" (D3) come informazioni distinte |
| **Modulo CG** (Uscite, Scadenzario) | **D1+D2+D3 UNITI** in un unico chip | Marco sta gestendo i pagamenti operativamente: la lista uscite ha senso come "cose da fare oggi" → un chip per riga è più scannerizzabile |
| **Dashboard / KPI** | **D1 sola** (eventualmente "open vs closed" via `stato_macro`) | Conta solo il business: quanto ho da pagare, quanto ho pagato |
| **Alert engine** | **D3 sola** (per checker scadenza), **D1+D2 sola** (per checker pagamenti) | Ogni checker si occupa di una sola dimensione |

### Nomenclatura UI obbligatoria

I label utente devono **non confondere** le dimensioni. Esempi:

- ✅ Header fattura: `<chip D1: "Non pagata">  <chip D3: "Scaduta da 3gg">`
- ❌ Header fattura: `<chip "Scaduto">` (mescola: implica non pagata ma anche scaduta — l'utente non sa cosa significa)
- ✅ Riga CG uscita: `<chip "Scaduto">` (ok unire: l'utente è nel contesto CG)
- ✅ Spesa fissa rateizzata: nella fattura madre, D3="Rateizzata 📆" come **info accanto alla data di scadenza**, non come stato pagamento

### Conseguenze sul codice

1. **`StatoPagamentoBadge.jsx`** deve gestire SOLO D1 (pagamento). Se contiene chip D3 (rateizzato, spostato, scaduto come stato), va **scisso** in due componenti separati: `StatoPagamentoBadge` (D1+D2) e `StatoScadenzaBadge` (D3).
2. **`fatture_stato_service.py`** scrive solo D1+D2 (sui 3 valori legacy + transizione a riconciliato). Le mutazioni di D3 (sposta scadenza, marca rateizzata) **passano da endpoint dedicati**, non da `set_stato`.
3. **VIEW `fe_fatture_with_stato`** continua a esporre il campo legacy lossy `stato_pagamento` (per consumer vecchi) E il raw `cg_uscite_stato`. I consumer nuovi DEVONO usare `cg_uscite_stato` + derivare D1/D2/D3 in UI.
4. **CLAUDE.md** ha un richiamo a questo §15 per ogni feature che tocchi "stato".

### Anti-pattern da evitare

| ❌ Errore | ✅ Corretto |
|---|---|
| Mostrare "Da pagare" come UN chip in FattureDettaglio | Mostrare "Non pagata" (D1) + "Scade fra 5gg" (D3) |
| Far settare manualmente "RATEIZZATO" via `set_stato` dropdown | Endpoint dedicato "Marca rateizzata in spesa fissa X" |
| Considerare PARZIALE come "da_verificare" nella VIEW | PARZIALE è D1=parziale, distinta da D2=da_verificare |
| Conteggio KPI "fatture aperte" che esclude PARZIALE | PARZIALE è APERTO (gestionalmente non chiuso), ma in D1 è "parzialmente pagata" non "non pagata" |
