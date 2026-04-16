# Spec — Riconciliazione banca multi-fattura con split importi

**Versione:** 0.1 (draft, 2026-04-16)
**Autore:** Marco + Claude
**Stato:** proposta, da validare prima di P1

## 1. Problema

Oggi un movimento bancario puo' essere gia' collegato a N fatture (schema `banca_fatture_link` e' N:M con `UNIQUE(movimento_id, fattura_id)`), ma il sistema **non sa quanto di quel movimento e' imputato a ciascuna fattura**. Conseguenze pratiche:

- Quando un bonifico paga N fatture con importo esatto: funziona, si linkano tutte.
- Quando un bonifico paga N fatture con differenza (sconto, arrotondamento, commissione trattenuta): il residuo resta > 1€ e si usa il workaround `riconciliazione_chiusa = 1` con nota libera (mig. 059) — funzionale ma non tiene traccia degli importi reali.
- Quando una fattura e' pagata da N movimenti (acconto + saldo, rata fuori piano): non e' modellato lato fatture. L'unico caso supportato e' via `cg_piano_rate` (mig. 048) che pero' richiede che la fattura sia formalmente rateizzata.

Inoltre il `create_link` attuale (`banca_router.py` L1102-1111) forza su `cg_uscite`:

```sql
stato = 'PAGATA',
importo_pagato = totale,           -- totale uscita, non importo applicato
banca_movimento_id = ?
```

cioe' assume implicitamente 1 link = pagamento completo.

## 2. Obiettivo

Formalizzare lo split importi nella riconciliazione, coprendo:

1. **1 movimento → N fatture** con ripartizione esplicita (caso bonifico multiplo).
2. **1 fattura → N movimenti** senza richiedere rateizzazione formale (caso acconto + saldo, pagamenti frazionati).
3. **Residuo movimento** calcolato correttamente: `abs(movimento.importo) − Σ importo_applicato`.
4. **Stato fattura pagata** derivato: `Σ importo_applicato ≥ fattura.totale` (con tolleranza configurabile).
5. Preservare il flag `riconciliazione_chiusa` come "escape hatch" per arrotondamenti non quadrabili, **non** come meccanismo primario.

## 3. Non-obiettivo

- Riscrivere il workbench `BancaCrossRef` o la logica di matching automatico.
- Toccare il flusso rate su `cg_piano_rate` (gia' funzionante per fatture formalmente rateizzate).
- Cambiare il comportamento di `fe_fatture.pagato` come flag denormalizzato letto da 8 file FE — resta, ma viene scritto da un unico servizio.

## 4. Stato attuale (ricognizione)

### 4.1 Schema

```sql
-- banca_movimenti (mig. 014, + 059, + 082)
CREATE TABLE banca_movimenti (
    id, import_id, ragione_sociale, data_contabile, data_valuta,
    banca, rapporto, importo, divisa, descrizione,
    categoria_banca, sottocategoria_banca, hashtag, dedup_hash,
    riconciliazione_chiusa INTEGER DEFAULT 0,
    riconciliazione_chiusa_at TEXT,
    riconciliazione_chiusa_note TEXT,
    parcheggiato INTEGER DEFAULT 0,
    parcheggiato_at TEXT,
    created_at
);

-- banca_fatture_link (mig. 014) — N:M movimento ↔ fattura
CREATE TABLE banca_fatture_link (
    id, movimento_id, fattura_id,
    tipo_match TEXT DEFAULT 'manuale',
    note TEXT,
    created_at,
    UNIQUE(movimento_id, fattura_id)
);

-- fe_fatture — flag pagato denormalizzato
-- campi rilevanti: pagato, importo_pagamento, data_scadenza, rateizzata
```

### 4.2 Consumatori di `fe_fatture.pagato`

Scrittura (3 punti, tutti in backend):

| File | Linea | Azione |
|---|---|---|
| `app/routers/fe_import.py` | 1010 | `UPDATE fe_fatture SET pagato = 1` (toggle manuale da lista fatture) |
| `app/routers/fe_import.py` | 1055 | `UPDATE fe_fatture SET pagato = 0` (toggle inverso) |
| `app/routers/controllo_gestione_router.py` | 2713 | `UPDATE fe_fatture SET pagato = 1` (quando CG marca un'uscita PAGATA_MANUALE) |

Lettura (frontend):
- `FattureInCloud.jsx`, `FattureElenco.jsx`, `FattureFornitoriElenco.jsx`, `FattureDettaglio.jsx`, `GestioneContanti.jsx`, `ClientiPreventivoScheda.jsx`, `ControlloGestioneUscite.jsx`, `ControlloGestioneSpeseFisse.jsx`.

Lettura (backend): `fe_import.py` L956/L1095, `controllo_gestione_router.py` L460, `fattureincloud_router.py` L883, `fe_proforme_router.py` L667.

**Implicazione per la spec:** non cambiamo la semantica di lettura del flag. Cambiamo solo CHI lo scrive. Introduciamo `app/services/riconciliazione_service.py` che espone `ricalcola_pagato_fattura(fattura_id)` e viene chiamato da tutti e 3 i writer attuali.

### 4.3 Propagazione link → cg_uscite

Oggi `create_link` (banca_router L1078-1144) fa:
- INSERT in `banca_fatture_link`
- UPDATE `cg_uscite SET stato='PAGATA', importo_pagato=totale, banca_movimento_id=?` per tutte le uscite con quella `fattura_id` e `banca_movimento_id IS NULL`.

`delete_link` (L1147-1208) fa l'inverso: resetta stato a DA_PAGARE/SCADUTA, `importo_pagato=0`.

**Implicazione:** la propagazione a `cg_uscite` va estesa per leggere `importo_applicato` invece di assumere `= totale`. Quando si unlinka, va sottratto `importo_applicato` dal cumulato, non resettato a 0 (perche' altri link possono esistere sulla stessa uscita).

## 5. Modello dati proposto

### 5.1 Migrazione 084 — estensione `banca_fatture_link`

```sql
ALTER TABLE banca_fatture_link ADD COLUMN importo_applicato REAL;
ALTER TABLE banca_fatture_link ADD COLUMN creato_da INTEGER;  -- users.id
-- tipo_match gia' presente ('manuale' | 'auto' | 'suggerito')
-- note gia' presente
```

Indice per le view derivate:

```sql
CREATE INDEX IF NOT EXISTS idx_bfl_fattura
    ON banca_fatture_link(fattura_id);
CREATE INDEX IF NOT EXISTS idx_bfl_movimento
    ON banca_fatture_link(movimento_id);
```

### 5.2 Nuovi campi denormalizzati (opzionale, fase 2)

Per evitare di ricalcolare Σ ad ogni read:

```sql
ALTER TABLE fe_fatture ADD COLUMN importo_pagato_calc REAL DEFAULT 0;
ALTER TABLE banca_movimenti ADD COLUMN residuo_calc REAL;
```

Aggiornati da `riconciliazione_service.ricalcola_*()` ad ogni mutazione link. Se si preferisce evitare denorm e confidare sulla view, si salta questo step.

### 5.3 Estensione cg_uscite (nessun ALTER, solo semantica)

`cg_uscite.importo_pagato` diventa "cumulato applicato" invece di "= totale al primo link". La colonna esiste gia'.

## 6. Backfill

Per ogni `banca_fatture_link` esistente:

1. Se il movimento ha un solo link → `importo_applicato = abs(movimento.importo)`.
2. Se il movimento ha N link ed esiste match esatto (Σ fattura.totale = abs(movimento.importo) ± 0,01) → `importo_applicato = fattura.totale` per ognuno.
3. Se il movimento ha N link ma non quadra → `importo_applicato = fattura.totale * (abs(movimento.importo) / Σ fattura.totale)` (proporzionale). Marco rivede manualmente i casi flaggati.
4. Se `riconciliazione_chiusa = 1` → si applica 3, la differenza resta implicita in "chiusura manuale".

Migrazione in modalita' **dry-run stampata** prima. Output: elenco movimenti con somma, lista fatture, importo applicato calcolato. Solo dopo check manuale, rerun con `--apply`.

## 7. API

### 7.1 Modifiche a `POST /banca/cross-ref/link`

Body esteso:

```json
{
  "movimento_id": 123,
  "fattura_id": 456,
  "importo_applicato": 450.00,   // NUOVO — opzionale, default = fattura.totale
  "note": "acconto"
}
```

Validazione server-side:
- `importo_applicato > 0`
- `importo_applicato ≤ residuo_movimento + 0,01` (non si imputa piu' di quel che c'e').
- Se omesso e' la fattura e' gia' parzialmente pagata: default = `fattura.totale − importo_pagato_calc`.
- Se omesso ed e' un link pulito: default = `fattura.totale`.

Propagazione a `cg_uscite`: non forzare `stato='PAGATA'` incondizionatamente. Logica:

```python
importo_pagato_nuovo = cg_uscite.importo_pagato + importo_applicato
if importo_pagato_nuovo >= cg_uscite.totale - soglia_arrotondamento:
    stato = 'PAGATA'
else:
    stato = 'PAGATA_PARZIALE'  # nuovo stato da aggiungere a CHECK
```

### 7.2 Modifica a `DELETE /banca/cross-ref/link/{link_id}`

Scollegare un link sottrae `importo_applicato` dal cumulato di `cg_uscite.importo_pagato`. Ricalcola `stato`:

```python
if cg_uscite.importo_pagato <= 0:
    stato = data_scadenza < today ? 'SCADUTA' : 'DA_PAGARE'
    banca_movimento_id = NULL
else:
    stato = 'PAGATA_PARZIALE'
    # banca_movimento_id resta, punta all'ULTIMO movimento ancora collegato
    # (oppure mettiamo NULL e ci affidiamo a banca_fatture_link per la storia)
```

### 7.3 Nuovo `GET /banca/cross-ref/movimento/{id}/dettaglio`

Ritorna movimento + tutti i link con `importo_applicato` + fatture dettagliate + residuo calcolato + proposta automatica di split per importi non ancora imputati. Alimenta la UI split.

### 7.4 Nuovo `GET /fatture/{id}/pagamenti`

Specularmente: per una fattura, elenca tutti i movimenti che la pagano con importi. Alimenta la UI dal lato scheda fattura.

## 8. UI

### 8.1 Pannello split nel workbench (P2)

Nel tab Suggerimenti / Senza match di `BancaCrossRef.jsx`, quando Marco apre un movimento e seleziona piu' fatture candidate, compare un pannello "Ripartizione":

```
Movimento: 1.200,00 €  —  Residuo: 1.200,00 €

☑ Fattura 1234 — Vinicola Rossi                  [ 500,00 ] €
☑ Fattura 1235 — Vinicola Rossi                  [ 650,00 ] €
☑ Fattura 1236 — Vinicola Rossi                  [  50,00 ] €

Totale applicato: 1.200,00 €  ✓
Residuo movimento: 0,00 €

[ Conferma link (3) ]
```

Regole:
- Default auto-compila ciascun input con `fattura.totale`, ma clippa l'ultima a `residuo`.
- Se l'utente edita un input, il totale si ricalcola live. Bottone disabilitato se totale applicato > residuo (+ 0,01).
- Se totale applicato < residuo, compare checkbox "Lascia scoperto <X> €" (movimento resta con residuo, o si chiude manualmente con nota).
- Se differenza < soglia configurabile (default 2€): opzione "Accetta arrotondamento — differenza su [conto tecnico selezionabile]" (P3).

### 8.2 Sezione "Pagamenti" nella scheda fattura (P3)

In `FattureDettaglio.jsx`, nuova sezione "Pagamenti" con:
- Elenco movimenti che pagano la fattura (data, ragione sociale, importo applicato).
- Bottone "Aggiungi pagamento" → apre ricerca movimenti non ancora completamente applicati, permette di selezionarne uno e specificare importo.
- Badge stato: Aperta / Parziale / Pagata.

## 9. Configurazione

Nuove righe in Impostazioni Sistema (regola `feedback_no_hardcoded_config`):

| Chiave | Default | Descrizione |
|---|---|---|
| `riconciliazione.soglia_arrotondamento_eur` | `2.00` | Sotto questa soglia, la differenza puo' essere accettata come arrotondamento. |
| `riconciliazione.conto_tecnico_differenze` | (null) | Categoria/conto su cui imputare le differenze accettate. |

## 10. Fasi di rollout

Tre push separati (regola `feedback_no_blocchi_accoppiati`):

### P1 — Migrazione + backfill dry-run + read-only

- Mig. 084: ALTER TABLE + indici.
- Script `app/migrations/084_backfill_importi_applicati.py` in modalita' dry-run → stampa report su stdout, NIENTE scrittura.
- Nuovo `app/services/riconciliazione_service.py` con funzioni pure: `calcola_residuo_movimento(id)`, `calcola_pagato_fattura(id)`, `ricalcola_pagato_fattura(id)` (che aggiorna `fe_fatture.pagato`).
- Nuovo endpoint `GET /banca/cross-ref/movimento/{id}/dettaglio` (read-only, non modifica nulla).
- Nessun cambio UI. Nessun cambio al flusso esistente.
- **Verifica manuale:** Marco apre la console backend, lancia `python -m app.migrations.084_backfill_importi_applicati --dry-run`, incrocia 5 casi reali (3 bonifici multi-fattura + 2 con differenza). Se i numeri tornano, si procede.

### P2 — UI split + scrittura

- Rerun di mig. 084 con `--apply` (scrive `importo_applicato` sui link esistenti).
- Modifica `POST /cross-ref/link` per accettare `importo_applicato`.
- Modifica `DELETE /cross-ref/link/{id}` per sottrarre invece di resettare.
- Nuovo stato `PAGATA_PARZIALE` nel CHECK di `cg_uscite` (migrazione separata).
- UI pannello Ripartizione in `BancaCrossRef.jsx`.
- `riconciliazione_service.ricalcola_pagato_fattura()` chiamato dai 3 writer di `fe_fatture.pagato` (unificazione).

### P3 — Inverso dalla scheda fattura + soglia configurabile

- Nuovo endpoint `GET /fatture/{id}/pagamenti`.
- Sezione "Pagamenti" in `FattureDettaglio.jsx`.
- Impostazioni Sistema: soglia arrotondamento + conto tecnico.
- Accettazione differenza come arrotondamento → genera riga virtuale o imputa a conto tecnico.

## 11. Rollback

- P1: drop colonne nuove + drop service. Nessun utente impattato (mai esposto).
- P2: se i numeri divergono, rerun backfill con strategia diversa. Il flag `riconciliazione_chiusa` resta utilizzabile come fallback. Endpoint modificato puo' tornare al comportamento precedente leggendo `fattura.totale` come default.
- P3: rimozione UI sezione pagamenti + endpoint. Dati intatti.

## 12. Decisioni aperte (da risolvere prima di P2)

1. **`PAGATA_PARZIALE` come nuovo stato** — o teniamo `PAGATA` + `importo_pagato < totale`? Sembra piu' pulito il nuovo stato, ma richiede di toccare tutti i filtri/KPI che contano `stato='PAGATA'`.
2. **`banca_movimento_id` su cg_uscite con N link** — resta al primo movimento, all'ultimo, o diventa NULL con fonte di verita' `banca_fatture_link`? Preferirei NULL + sempre join su link, ma bisogna verificare quanti consumatori leggono `banca_movimento_id` direttamente.
3. **Importi denormalizzati** (§5.2) — yes o no? Propongo NO in P1, valutare in P2 se i tempi di query salgono.
4. **Comportamento N/C (nota di credito)** — modello come link con `importo_applicato` negativo, o come tipo separato? Propongo **negativo** per non duplicare logica.

## 13. Checklist esecuzione P1

- [ ] Mig. 084 creata e testata su copia DB.
- [ ] `riconciliazione_service.py` con test unitari (calcola_residuo, calcola_pagato).
- [ ] Endpoint dettaglio movimento implementato e testato con 3 casi.
- [ ] Backfill dry-run eseguito, report salvato in `docs/backfill_084_report.txt`.
- [ ] Marco ha validato 5 casi reali dal report.
- [ ] `docs/changelog.md` + `docs/sessione.md` aggiornati.
- [ ] Push con messaggio: `spec_riconciliazione P1: mig 084 + service + endpoint read-only`

## 14. Riferimenti

- `docs/architettura_mattoni.md` §3.9 Flussi movimenti banca
- `docs/problemi.md` D2 (2026-04-11) — workaround `riconciliazione_chiusa`
- `docs/roadmap.md` §3.2 — "Migliorare riconciliazione cross-ref"
- `app/migrations/014_banca_movimenti.py` — schema originale
- `app/migrations/059_banca_riconciliazione_chiusa.py` — flag chiusura manuale
- `app/routers/banca_router.py` L1078-1289 — endpoint cross-ref attuali
