# Specifica: Pro-forme nel Modulo Acquisti

> Versione: 0.1 — bozza per approvazione Marco
> Data: 2026-04-13

---

## Contesto

Alcuni fornitori emettono una **proforma** prima della fattura definitiva, per ottenere anticipi o per motivi fiscali (le tasse si pagano solo sulla fattura). La proforma non è un documento fiscale: serve solo a tracciare un impegno di pagamento nello scadenziario. Quando arriva la fattura vera (da FIC o XML), la proforma viene riconciliata e scompare.

## Requisiti (da Marco)

1. **Creazione manuale** in Acquisti — campi base: fornitore, importo, scadenza, note
2. **Visibile SOLO nello scadenziario** (cg_uscite) — NON nelle statistiche/dashboard/KPI Acquisti
3. **Riconciliazione manuale** — quando arriva la fattura, Marco la collega alla proforma
4. **Post-riconciliazione**: la proforma viene assorbita/nascosta, la fattura prende tutto
5. **Creazione da**: ricerca fornitore esistente OPPURE da pagina dettaglio fornitore

---

## 1. Database

### Nuova tabella: `fe_proforme`

```sql
CREATE TABLE IF NOT EXISTS fe_proforme (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    fornitore_piva      TEXT,
    fornitore_nome      TEXT NOT NULL,
    importo             REAL NOT NULL,
    data_scadenza       TEXT NOT NULL,       -- YYYY-MM-DD
    data_emissione      TEXT,                -- data proforma (opzionale)
    numero_proforma     TEXT,                -- riferimento del fornitore (opzionale)
    note                TEXT,
    stato               TEXT NOT NULL DEFAULT 'ATTIVA',
        -- ATTIVA:        visibile nello scadenziario
        -- RICONCILIATA:  collegata a fattura, nascosta
        -- ANNULLATA:     annullata manualmente
    fattura_id          INTEGER,             -- FK → fe_fatture(id), NULL finché non riconciliata
    cg_uscita_id        INTEGER,             -- FK → cg_uscite(id), riga scadenziario collegata
    data_riconciliazione TEXT,               -- quando è stata riconciliata
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fe_proforme_stato ON fe_proforme(stato);
CREATE INDEX IF NOT EXISTS idx_fe_proforme_fornitore ON fe_proforme(fornitore_piva);
CREATE INDEX IF NOT EXISTS idx_fe_proforme_fattura ON fe_proforme(fattura_id);
```

### Integrazione con `cg_uscite`

Quando si crea una proforma, si crea **anche** una riga in `cg_uscite` con:
- `tipo_uscita = 'PROFORMA'`
- `fattura_id = NULL` (non è una fattura)
- `fornitore_nome`, `totale`, `data_scadenza` dalla proforma
- `stato = 'DA_PAGARE'`

Questo fa sì che la proforma appaia nello scadenziario senza toccare le statistiche fatture (filtrate per `tipo_uscita = 'FATTURA'`).

Quando la proforma viene riconciliata:
1. La riga `cg_uscite` con `tipo_uscita = 'PROFORMA'` viene cancellata (o marcata ANNULLATA)
2. L'import fatture normale crea la sua riga `cg_uscite` dalla fattura vera
3. La `fe_proforme.fattura_id` punta alla fattura collegata

### Migrazione: `065_fe_proforme.py`

---

## 2. Backend — Endpoint API

Router: `app/routers/fe_proforme_router.py`
Prefix: `/contabilita/fe/proforme`
Auth: JWT `Depends(get_current_user)` su tutti

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `GET` | `/` | Lista proforme (filtri: stato, fornitore, da/a) |
| `POST` | `/` | Crea proforma + riga cg_uscite |
| `GET` | `/{id}` | Dettaglio singola proforma |
| `PUT` | `/{id}` | Modifica proforma (solo se ATTIVA) |
| `DELETE` | `/{id}` | Annulla proforma (stato → ANNULLATA, cancella riga cg_uscite) |
| `POST` | `/{id}/riconcilia` | Riconcilia con fattura: `{ fattura_id: N }` |
| `POST` | `/{id}/dissocia` | Annulla riconciliazione (torna ATTIVA, ricrea riga cg_uscite) |
| `GET` | `/candidates/{id}` | Lista fatture candidate per riconciliazione (stesso fornitore, importo simile, non già collegate) |

### Logica `POST /` (creazione)

```python
# 1. Inserisci in fe_proforme
# 2. Crea riga in cg_uscite con tipo_uscita='PROFORMA'
# 3. Aggiorna fe_proforme.cg_uscita_id con l'id della riga creata
```

### Logica `POST /{id}/riconcilia`

```python
# 1. Verifica proforma.stato == 'ATTIVA'
# 2. Verifica fattura_id esista in fe_fatture
# 3. Aggiorna fe_proforme: stato='RICONCILIATA', fattura_id=N, data_riconciliazione=oggi
# 4. Cancella (o marca ANNULLATA) la riga cg_uscite collegata alla proforma
#    (la fattura ha la sua riga cg_uscite dall'import normale)
```

---

## 3. Frontend

### 3a. Lista Proforme — sottotab in Acquisti

Nuova voce nella navigazione Acquisti (`FattureNav.jsx`): **"Pro-forme"**

Pagina: `FattureProformeElenco.jsx` → route `/acquisti/proforme`

- Tabella: fornitore, importo, scadenza, stato, azioni
- Filtro sidebar: stato (Attive / Riconciliate / Tutte), periodo
- Badge contatore "Attive" nella nav
- Riga colorata: ATTIVA = normale, RICONCILIATA = sfumata + link alla fattura, ANNULLATA = barrata

### 3b. Creazione Proforma

**Modale** richiamabile da:
1. Pulsante "Nuova Proforma" nella lista proforme
2. Pulsante nella pagina dettaglio fornitore (`FattureFornitoreDettaglio`)

Campi:
- **Fornitore**: autocomplete con ricerca su `fe_fornitore_categoria` (piva + nome). Se creata da dettaglio fornitore, pre-compilato.
  Se il fornitore non esiste → toggle "Nuovo fornitore" che mostra:
  - **Nome** (obbligatorio)
  - **P.IVA** (fortemente consigliato — chiave match FIC/XML)
  - **Codice Fiscale** (opzionale)
  → Al salvataggio, crea riga in `fe_fornitore_categoria`
- **Importo** (€): numerico
- **Data scadenza**: datepicker
- **Numero proforma**: testo libero (opzionale)
- **Data emissione**: datepicker (opzionale)
- **Note**: textarea (opzionale)

### 3c. Riconciliazione

Dalla lista proforme, azione "Riconcilia" su una proforma ATTIVA:
1. Apre modale con lista fatture candidate (stesso fornitore, ±20% importo, ultime N fatture non collegate)
2. L'utente clicca sulla fattura giusta → conferma
3. La proforma diventa RICONCILIATA

Dalla pagina dettaglio fattura (`FattureDettaglio.jsx`): se esistono proforme attive dello stesso fornitore, mostra un banner "Proforma collegabile" con azione rapida.

---

## 4. Impatto sulle viste esistenti

### Scadenziario (CG Uscite)
- Le righe con `tipo_uscita = 'PROFORMA'` appaiono normalmente nello scadenziario
- Badge/etichetta "PROFORMA" visibile per distinguerle dalle fatture
- Click sulla riga → apre dettaglio proforma (non dettaglio fattura)

### Dashboard Acquisti / KPI
- **NESSUN impatto** — le query usano già `fe_fatture` direttamente, le proforme sono in tabella separata
- Le stats su `cg_uscite` filtrano per `tipo_uscita = 'FATTURA'` o ignorano il campo → verificare che PROFORMA non inquini i totali

### Import uscite (`/uscite/import`)
- Nessuna modifica — importa solo da `fe_fatture`

---

## 5. Fasi di implementazione

| Fase | Cosa | Stima |
|------|------|-------|
| **1** | Migrazione DB `065_fe_proforme.py` | piccola |
| **2** | Router backend `fe_proforme_router.py` (CRUD + riconciliazione) | media |
| **3** | Frontend: `FattureProformeElenco.jsx` + modale creazione | media |
| **4** | Frontend: riconciliazione (modale candidati + banner in dettaglio fattura) | media |
| **5** | Integrazione nav (tab in FattureNav, badge, link da fornitore) | piccola |
| **6** | Verifica: proforme visibili in scadenziario CG, NON nelle stats Acquisti | piccola |

---

## 6. Decisioni confermate

1. **Pagamento proforma**: lo scadenziario lo gestisce normalmente (DA_PAGARE → PAGATA). Quando poi si riconcilia con la fattura, la fattura arriva già "coperta". ✅
2. **Fornitore nuovo**: il form di creazione proforma include un mini-form "nuovo fornitore" con i campi utili al matching FIC/XML:
   - **Nome** (obbligatorio) — display + ricerca
   - **P.IVA** (fortemente consigliato) — chiave primaria di match FIC/XML
   - **Codice Fiscale** (opzionale) — match secondario
   - L'indirizzo e altri dati arriveranno dalla fattura vera al momento della riconciliazione
   - Il nuovo fornitore viene creato in `fe_fornitore_categoria` così è subito visibile in tutto il modulo Acquisti ✅
