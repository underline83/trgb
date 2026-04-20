# Modulo Vini — Potenziamento widget "Riordini per fornitore"

**Obiettivo:** rendere il widget `📦 Riordini per fornitore` in `DashboardVini` un centro operativo per ordini, carichi e aggiornamento prezzi, senza dover aprire il dettaglio del singolo vino.

**Riferimenti codice:**
- FE widget: `frontend/src/pages/vini/DashboardVini.jsx` (righe 670–822)
- FE dettaglio: `frontend/src/pages/vini/SchedaVino.jsx`
- BE stats: `app/models/vini_magazzino_db.py::get_dashboard_stats` (riga 1362)
- BE movimenti: `app/models/vini_magazzino_db.py::registra_movimento` (riga 869)
- Router magazzino: `app/routers/vini_magazzino_router.py`
- Costanti stati: `frontend/src/config/viniConstants.js`

---

## 1. Richieste Marco — sintesi

| # | Richiesta | Stato attuale |
|---|-----------|---------------|
| 1 | Sort colonne cliccando sull'header | ✅ Gia' implementato (Marco non lo sapeva). Manca PRODUTTORE come colonna |
| 2 | Sort per produttore | ❌ Da aggiungere |
| 3 | Non aprire dettaglio al click riga: pulsante dedicato a SX | ❌ Da cambiare |
| 4 | Pulsante duplica con nuova annata | ❌ Da aggiungere |
| 5 | Colonna riordino numerica + conversione in CARICO | ❌ Da aggiungere (nuovo concetto DB) |
| 6 | Click su listino cambia prezzo, con storico | ❌ Da aggiungere (nuova tabella DB) |

---

## 2. Decisioni prese (conferma Marco 20/04)

- **Duplica vino:** giacenza 0, `STATO_RIORDINO='0'` (= "Ordinato"), `id_excel=NULL`, `CARTA='NO'` per default (si mette in carta solo quando arriva).
- **Riordini pending:** un solo ordine aperto per vino (upsert). Se gia' pending, il click modifica la quantita'.
- **Arrivo:** modale chiede qty (default=ordinata, editabile) + locazione. Quando Marco conferma: `CARICO` registrato + ordine pending cancellato.
- **Sort:** non serve nessun bug-fix, serve solo aggiungere PRODUTTORE come colonna sortabile. Il meccanismo esistente (`toggleRiordSort`) funziona gia'.

---

## 3. Modifiche DB

### 3.1 Nuova tabella `vini_ordini_pending` (in `vini_magazzino.sqlite3`)

```sql
CREATE TABLE IF NOT EXISTS vini_ordini_pending (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vino_id      INTEGER NOT NULL UNIQUE,  -- un solo ordine per vino
  qta          INTEGER NOT NULL CHECK (qta > 0),
  data_ordine  TEXT NOT NULL,
  note         TEXT,
  utente       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id) ON DELETE CASCADE
);
CREATE INDEX idx_vop_vino ON vini_ordini_pending (vino_id);
```

UNIQUE su `vino_id` impone la regola "un solo ordine aperto per vino". L'upsert FE/BE usa `INSERT OR REPLACE` o logica `UPDATE if exists else INSERT`.

### 3.2 Nuova tabella `vini_prezzi_storico` (in `vini_magazzino.sqlite3`)

```sql
CREATE TABLE IF NOT EXISTS vini_prezzi_storico (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vino_id      INTEGER NOT NULL,
  campo        TEXT NOT NULL CHECK (campo IN ('EURO_LISTINO','PREZZO_CARTA','PREZZO_CALICE')),
  valore_old   REAL,
  valore_new   REAL,
  data         TEXT NOT NULL,
  utente       TEXT,
  origine      TEXT,  -- 'widget_riordini', 'scheda_vino', 'import', ecc.
  FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id) ON DELETE CASCADE
);
CREATE INDEX idx_vps_vino_data ON vini_prezzi_storico (vino_id, data DESC);
CREATE INDEX idx_vps_campo ON vini_prezzi_storico (campo);
```

Traccia tutti e 3 i prezzi ma per la Fase 6 il hook PATCH registra solo `EURO_LISTINO`. Estendibile a PREZZO_CARTA e PREZZO_CALICE in futuro senza modifiche schema.

### 3.3 Tabella `vini_magazzino_movimenti` — invariata

Non serve aggiungere tipo 'ORDINE' al CHECK: gli ordini pending vivono nella loro tabella. Quando arriva la merce si registra un normale `CARICO` (con nota "arrivo ordine #N" opzionale).

---

## 4. Endpoint API (nuovi)

Tutti su `vini_magazzino_router.py`, prefix `/vini/magazzino`, auth `get_current_user`.

| Metodo | Path | Payload | Ritorno |
|--------|------|---------|---------|
| `POST` | `/{id}/duplica` | `{annata: str}` | `{id: int}` (nuovo vino) |
| `GET` | `/ordini-pending/` | — | `[{vino_id, qta, data_ordine, ...}]` |
| `POST` | `/{id}/ordine-pending` | `{qta: int, note?: str}` | `{ok, qta_totale_pending}` |
| `DELETE` | `/{id}/ordine-pending` | — | `{ok}` |
| `POST` | `/{id}/ordine-pending/conferma-arrivo` | `{qta: int, locazione: str, note?: str}` | `{ok, movimento_id}` |
| `GET` | `/{id}/prezzi-storico/` | — | `[{data, campo, valore_old, valore_new, utente}]` |

**Nota:** il PATCH `/vini/magazzino/{id}` gia' esistente viene esteso con un hook interno: se `EURO_LISTINO` cambia, insert in `vini_prezzi_storico`. Nessun nuovo endpoint necessario per il save inline del listino.

**Trailing slash:** ricordarsi regola TRGB (CLAUDE.md): endpoint root dei router con `@router.get("/")` → chiamata FE con slash finale.

---

## 5. Modifiche `get_dashboard_stats`

Estendere la query `riordini_per_fornitore` con un LEFT JOIN sulla nuova tabella ordini-pending:

```sql
SELECT v.*, 
       COALESCE(op.qta, 0) AS qta_ordinata,
       op.data_ordine AS data_ordine
FROM vini_magazzino v
LEFT JOIN vini_ordini_pending op ON op.vino_id = v.id
...
```

Cosi' il FE ha tutto in una chiamata (no N+1). I nuovi campi `qta_ordinata` e `data_ordine` alimentano la colonna "Riordino" del widget.

---

## 6. UI widget — layout aggiornato

Attuali colonne (in ordine): Vino · Stato · Giac. · Listino · Ult. carico · Ult. vendita

Nuovo layout (sx → dx):

| Col | Contenuto | Interazione |
|-----|-----------|-------------|
| 🛈 | icona info/eye | click → apre dettaglio vino (ex row-click) |
| Vino | descrizione | sortabile |
| Produttore | `PRODUTTORE` | **NUOVA**, sortabile |
| Stato | badge STATO_RIORDINO | sortabile |
| Giac. | `QTA_TOTALE` | sortabile |
| **Riordino** | `qta_ordinata` o "+" se 0 | **NUOVA**, click apre modale qty |
| ⬇︎ | bottone "Arrivato" (solo se pending) | click apre modale carico |
| Listino | `EURO_LISTINO €` | **click** → input inline editabile |
| Ult. carico | giorni fa | sortabile |
| Ult. vendita | giorni fa | sortabile |
| ⎘ | bottone duplica | click apre modale "nuova annata" |

- Le celle "Riordino" e "Listino" diventano interattive: niente piu' row-click-opens-dettaglio, solo il pulsante 🛈 apre la scheda.
- Touch target minimo 44pt (regola TRGB).
- Colori: cella Riordino con background sky quando pending (stesso codice colore di `STATO_RIORDINO='0'`).

---

## 7. Modifiche `SchedaVino.jsx` — tab Storico

Aggiungere una tab `📈 Storico` con 2 blocchi:

1. **Storico prezzi** — GET `/vini/magazzino/{id}/prezzi-storico/`. Lista cronologica: `DATA — LISTINO: 24,00€ → 26,00€ (mattia)`. Opzionale: mini-grafico lineare con Recharts (gia' usato nel progetto, vedi Dashboard).
2. **Storico consumi** — riusa GET movimenti esistente, filtro `tipo IN ('VENDITA','SCARICO')`, aggregato per mese (SQL o JS). Mostrato come barchart mensile + tabella dettaglio.

Niente librerie nuove (recharts gia' presente).

---

## 8. Piano fasi (push indipendenti)

Ogni fase e' auto-contenuta e rilasciabile da sola. Ricorda `feedback_no_blocchi_accoppiati.md`: mai pushare 3 cambiamenti infrastrutturali insieme.

| Fase | Cosa | Push dopo |
|------|------|-----------|
| 1 | Sort produttore + pulsante dettaglio a SX | FE-only |
| 2 | Duplica con nuova annata | BE endpoint + FE bottone |
| 3 | Schema DB + endpoint ordini pending (no UI) | BE-only (migrazione verificata) |
| 4 | Colonna Riordino + modale qty | FE + estende stats BE |
| 5 | Bottone "Arrivato" + modale carico | FE + BE conferma-arrivo |
| 6 | Schema storico prezzi + hook PATCH | BE-only |
| 7 | Listino inline edit nel widget | FE-only (hook gia' attivo) |
| 8 | Tab Storico in SchedaVino | FE + BE endpoint GET |

**Ordine di dipendenza stretta:**
- 5 dipende da 3+4
- 7 dipende da 6
- 8 dipende da 6 (per storico prezzi) ma puo' girare parzialmente senza (solo consumi)

---

## 9. Aspetti trasversali

- **Mattoni TRGB:** nessun mattone nuovo serve. Usiamo toast e primitives M.I gia' esistenti (Btn, StatusBadge).
- **Mobile/iPad:** il widget vive in una tabella — su portrait iPad diventera' scrollable orizzontale (gia' cosi'). I modali (qty ordine, arrivo, duplica) devono avere bottoni 48pt e campi di input mobile-friendly.
- **Permessi:** tutte le nuove azioni richiedono ruolo che puo' gia' modificare il magazzino (admin, superadmin, sommelier?). Da verificare nel router esistente il pattern usato.
- **Test manuali per ogni fase:** dettagliati nei prompt di commit.

---

## 10. Domande aperte (da chiarire se servisse)

- [ ] **Scadenza ordine pending:** vogliamo segnalare ordini fermi da troppo tempo (es. > 30gg)? Per ora: no, KISS. Si puo' aggiungere dopo.
- [ ] **Cancellazione ordine:** solo admin/sommelier o chiunque veda il widget? Assunto: chi puo' modificare il vino.
- [ ] **Ruolo sala/sommelier:** vedono la colonna riordino? Assunto: solo chi ha accesso alla dashboard vini (come oggi).
- [ ] **Duplica — cosa fare con `CARTA`:** default `NO` (non va automaticamente in carta). Marco lo promuove manualmente a `SI` quando arriva e lo inserisce.

Se Marco vede qualcosa da correggere in queste assunzioni, si aggiustano prima della Fase relativa.

---

**Autore:** sessione 20/04 — Claude + Marco
**Ultimo aggiornamento:** 2026-04-20
