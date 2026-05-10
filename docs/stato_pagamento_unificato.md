# Stato pagamento unificato (G.5) — riferimento tecnico

> Sessione 2026-05-10. Documento canonico per capire come funziona lo stato di pagamento delle fatture passive nel sistema TRGB **post G.5 Livello 3**.

## 1. Storia del problema

Prima di G.5, il sistema TRGB aveva **3 source of truth indipendenti** per lo stato di pagamento di una fattura:

1. `fe_fatture.pagato` (boolean 0/1) — il primo flag, dal 2024
2. `fe_fatture.stato_pagamento` (TEXT: `da_pagare`/`da_verificare`/`pagato_manuale`/`pagato`) — aggiunto in mig 103 (2026-04-27)
3. `cg_uscite.stato` (TEXT: `DA_PAGARE`/`SCADUTA`/`PAGATA`/`PAGATA_MANUALE`/`PARZIALE`/`RATEIZZATA`) — workflow modulo CG

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
