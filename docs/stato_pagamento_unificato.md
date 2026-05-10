# Stato pagamento unificato (G.5 + G.6 + G.7) — riferimento tecnico

> Sessione 2026-05-10. Documento canonico per capire come funziona lo stato di pagamento delle fatture passive nel sistema TRGB **post G.5 Livello 3 + G.6 uniformazione naming + G.7 Sposta data**.

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
