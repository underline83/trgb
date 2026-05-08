# Modulo Vini — Storia widget Dashboard (14 fasi)

**Ultimo aggiornamento:** 2026-04-24
**Stato:** tutte le 14 fasi **FATTE**. Punto 7 alert (lista WhatsApp) differito (dipendenze esterne).
**Obiettivo doc:** archiviare le decisioni architetturali e iterazioni delle 2 grosse trasformazioni del DashboardVini — il widget "📦 Riordini per fornitore" (8 fasi, sessione 51) e il widget "🚨 Vini in carta senza giacenza" (6 fasi A-F, 2026-04-24).
**Riferimento operativo:** lo stato corrente del modulo è in `docs/modulo_vini.md`. Questo doc è "storico vivo" (non si tocca, salvo correzioni).

---

# 0. Indice

**Parte A — Widget "📦 Riordini per fornitore"** (8 fasi cumulative)
1. Punto di partenza (richieste Marco)
2. Decisioni architetturali
3. Schema DB (2 nuove tabelle)
4. Endpoint nuovi
5. Layout widget (vecchio → nuovo)
6. Le 8 fasi una per una

**Parte B — Widget "🚨 Vini in carta senza giacenza"** (6 fasi A-F)
7. Differenza vs. "Riordini per fornitore"
8. Le 6 fasi A-F una per una
9. Punto 7 differito (export WhatsApp)

**Aspetti trasversali:**
- Mattoni TRGB usati
- Mobile/iPad / touch target
- Performance / indici DB

---

# Parte A — Widget "📦 Riordini per fornitore"

## 1. Punto di partenza (richieste Marco)

| # | Richiesta | Stato pre-refactor |
|---|-----------|---------------|
| 1 | Sort colonne cliccando sull'header | ✅ Già implementato, mancava PRODUTTORE |
| 2 | Sort per produttore | ❌ Da aggiungere |
| 3 | Non aprire dettaglio al click riga: pulsante dedicato a SX | ❌ Da cambiare |
| 4 | Pulsante duplica con nuova annata | ❌ Da aggiungere |
| 5 | Colonna riordino numerica + conversione in CARICO | ❌ Da aggiungere (nuovo concetto DB) |
| 6 | Click su listino cambia prezzo, con storico | ❌ Da aggiungere (nuova tabella DB) |

## 2. Decisioni architetturali (conferma Marco 2026-04-20)

- **Duplica vino:** giacenza 0, `STATO_RIORDINO='0'` (Ordinato), `id_excel=NULL`, `CARTA='NO'` per default (si mette in carta solo quando arriva).
- **Riordini pending:** un solo ordine aperto per vino (UNIQUE). Click se già pending = modifica quantità.
- **Arrivo:** modale chiede qty (default = ordinata, editabile) + locazione. Conferma → `CARICO` registrato + ordine pending cancellato (in transazione).
- **Sort:** non serve bug-fix, solo aggiungere PRODUTTORE come colonna sortabile. Meccanismo `toggleRiordSort` esistente OK.

## 3. Schema DB

### 3.1 Tabella `vini_ordini_pending` (in `vini_magazzino.sqlite3`)

```sql
CREATE TABLE IF NOT EXISTS vini_ordini_pending (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vino_id      INTEGER NOT NULL UNIQUE,
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

UNIQUE su `vino_id` impone "un solo ordine aperto per vino". Upsert FE/BE usa `INSERT OR REPLACE` o pattern `UPDATE if exists else INSERT`.

### 3.2 Tabella `vini_prezzi_storico` (in `vini_magazzino.sqlite3`)

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

Tracciato uno qualsiasi dei 3 prezzi, ma per Fase 6 il hook PATCH registra solo `EURO_LISTINO`. Estendibile senza modifiche schema.

### 3.3 Tabella `vini_magazzino_movimenti` — invariata

Non serve aggiungere tipo `'ORDINE'` al CHECK: gli ordini pending vivono nella loro tabella. Quando arriva la merce si registra un normale `CARICO` (con nota "arrivo ordine #N" opzionale).

## 4. Endpoint nuovi

Tutti su `vini_magazzino_router.py`, prefix `/vini/magazzino`, auth `get_current_user`.

| Metodo | Path | Payload | Ritorno |
|--------|------|---------|---------|
| `POST` | `/{id}/duplica` | `{annata: str}` | `{id: int}` (nuovo vino) |
| `GET` | `/ordini-pending/` | — | `[{vino_id, qta, data_ordine, ...}]` |
| `POST` | `/{id}/ordine-pending` | `{qta: int, note?: str}` | `{ok, qta_totale_pending}` |
| `DELETE` | `/{id}/ordine-pending` | — | `{ok}` |
| `POST` | `/{id}/ordine-pending/conferma-arrivo` | `{qta: int, locazione: str, note?: str}` | `{ok, movimento_id}` |
| `GET` | `/{id}/prezzi-storico/` | — | `[{data, campo, valore_old, valore_new, utente}]` |

**Hook esistente esteso:** PATCH `/vini/magazzino/{id}` — se `EURO_LISTINO` cambia, insert in `vini_prezzi_storico`. Nessun nuovo endpoint per save inline del listino.

**Trailing slash:** ricordarsi regola TRGB (CLAUDE.md): endpoint root con `@router.get("/")` → chiamata FE con slash finale.

## 5. Modifiche `get_dashboard_stats`

Estensione query `riordini_per_fornitore` con LEFT JOIN sulla nuova tabella ordini-pending:

```sql
SELECT v.*,
       COALESCE(op.qta, 0) AS qta_ordinata,
       op.data_ordine AS data_ordine
FROM vini_magazzino v
LEFT JOIN vini_ordini_pending op ON op.vino_id = v.id
...
```

FE ha tutto in una chiamata (no N+1). I nuovi campi `qta_ordinata` e `data_ordine` alimentano la colonna "Riordino" del widget.

## 6. UI widget — layout aggiornato

Vecchio (in ordine): Vino · Stato · Giac. · Listino · Ult. carico · Ult. vendita

Nuovo:

| Col | Contenuto | Interazione |
|-----|-----------|-------------|
| 🛈 | icona info/eye | click → apre dettaglio vino |
| Vino | descrizione | sortabile |
| **Produttore** | `PRODUTTORE` | sortabile (NUOVA) |
| Stato | badge `STATO_RIORDINO` | sortabile |
| Giac. | `QTA_TOTALE` | sortabile |
| **Riordino** | `qta_ordinata` o "+" se 0 | click apre modale qty (NUOVA) |
| ⬇︎ | bottone "Arrivato" (solo se pending) | click apre modale carico |
| Listino | `EURO_LISTINO €` | click → input inline editabile |
| Ult. carico | giorni fa | sortabile |
| Ult. vendita | giorni fa | sortabile |
| ⎘ | bottone duplica | click apre modale "nuova annata" |

Niente più row-click-opens-dettaglio: solo il pulsante 🛈 apre la scheda. Touch target minimo 44pt. Cella Riordino con bg-sky quando pending.

## 7. Le 8 fasi una per una

Ogni fase auto-contenuta e rilasciabile da sola. Memoria `feedback_no_blocchi_accoppiati`: mai pushare 3 cambiamenti infrastrutturali insieme.

| Fase | Cosa | Push dopo |
|------|------|-----------|
| 1 | Sort produttore + pulsante dettaglio a SX | FE-only |
| 2 | Duplica con nuova annata | BE endpoint + FE bottone |
| 3 | Schema DB + endpoint ordini pending (no UI) | BE-only (migrazione verificata) |
| 4 | Colonna Riordino + modale qty | FE + estende stats BE |
| 5 | Bottone "Arrivato" + modale carico | FE + BE conferma-arrivo |
| 6 | Schema storico prezzi + hook PATCH | BE-only |
| 7 | Listino inline edit nel widget | FE-only (hook già attivo) |
| 8 | Tab Storico in SchedaVino | FE + BE endpoint GET |

**Dipendenze:**
- 5 dipende da 3+4
- 7 dipende da 6
- 8 dipende da 6 (per storico prezzi); può girare parzialmente senza (solo consumi)

### Tab "Storico" in SchedaVino (Fase 8)

Aggiunta tab `📈 Storico` con 2 blocchi:

1. **Storico prezzi** — GET `/vini/magazzino/{id}/prezzi-storico/`. Lista cronologica: `DATA — LISTINO: 24,00€ → 26,00€ (mattia)`. Mini-grafico Recharts opzionale.
2. **Storico consumi** — riusa GET movimenti esistente, filtro `tipo IN ('VENDITA','SCARICO')`, aggregato per mese (SQL o JS). Barchart mensile + tabella dettaglio.

Niente librerie nuove (recharts già presente).

### Domande aperte (non bloccanti)

- **Scadenza ordine pending:** segnalare ordini fermi > 30gg? Per ora: no, KISS. Aggiungibile dopo.
- **Cancellazione ordine:** chi può modificare il vino (admin/sommelier).
- **Sala/sommelier:** vedono la colonna riordino come oggi.
- **Duplica `CARTA`:** default `NO`, Marco lo promuove a `SI` quando arriva.

---

# Parte B — Widget "🚨 Vini in carta senza giacenza"

## 7. Differenza vs. "📦 Riordini per fornitore"

- **`📦 Riordini per fornitore`** = tabella completa, raggruppata per distributore, vista "gestionale".
- **`🚨 Vini in carta senza giacenza`** = alert compatto, solo vini con giacenza 0 e stato vendita attivo (V/F/S/T), vista "sveglia operativa".

Sessione 2026-04-24, 6 punti (8 nel doc originale, ma 1+2 fusi in Fase A e 7 differito):

| # | Richiesta | Stato finale |
|---|-----------|-------|
| 1 | Pulsante "📦 Ordina" inline accanto a ogni vino | ✅ Fase A |
| 2 | Quantità suggerita basata sullo storico vendite 30/60/90 gg | ✅ Fase A (60gg ÷ 2) |
| 3 | Raggruppamento per distributore (toggle opzionale) | ✅ Fase E |
| 4 | Stato riordino a 3 click (badge `D · O · 0 · A · X` inline) | ✅ Fase C |
| 5 | "Ultima vendita" / giorni fermo | ✅ Fase B |
| 6 | Filtro rapido per tipologia (bianchi / rossi / bolle / ...) | ✅ Fase D |
| 7 | Export "lista della spesa" su WhatsApp/PDF raggruppata per fornitore | 🔄 Differito (vedi §9) |
| 8 | Bottone "✅ Arrivato" diretto nel widget | ✅ Fase F |

## 8. Le 6 fasi A-F una per una

### Fase A — Punti 1+2 (Ordina inline + qta suggerita) — ✅ 2026-04-24

**FE:** in ogni riga del widget alert un pill inline:
- Nessun ordine pending → `+ ordina` outline brand-blue (con `· N` appeso se c'è suggerimento).
- Ordine pending → pill blu `📦 N bt` cliccabile (modifica).

**Righe dimmed (Non ricomprare):** pill nascosto per ridurre rumore visivo.

**Riuso:** handler `openOrdine(v)` e modale esistenti. Nessun nuovo endpoint.

**Quantità suggerita:**
- BE (`vini_magazzino_db.py::get_dashboard_stats`): query `alert_carta` estesa con subquery `vendite_60gg` + post-processing Python `qta_suggerita = max(1, round(vendite_60gg / 2))` se > 0, altrimenti `null`. Sempre aggiunti `DISTRIBUTORE` e `RAPPRESENTANTE` al payload (servono per Fase E).
- FE (`DashboardVini.jsx::openOrdine`): priorità input qta: ordine esistente → `qta_suggerita` → stringa vuota. Hint "💡 Suggerito: N bt · storico vendite 60gg ÷ 2" sotto l'input, visibile solo quando non c'è un ordine pending e suggerimento > 0.

**File toccati:** `app/models/vini_magazzino_db.py`, `frontend/src/pages/vini/DashboardVini.jsx` (bump v4.7-alert-widget-faseA).

### Fase B — Punto 5 (Ultima vendita / giorni fermo) — ✅ 2026-04-24

**Iter 1 (deprecata):** badge "Ult. vendita: Ngg fa" con gradazione rosso/amber/verde sul tempo. Fuorviante: su un vino finito l'ultima vendita è sempre subito prima del sold-out → ridondante/ingannevole.

**Iter 2 (attiva):** dato che serve è il **ritmo di vendita storico** (misura di domanda), non il tempo dall'ultima vendita (misura di quando è finito). Combinati in un badge unico.

**Implementato:**
- Nuovo modulo `app/utils/vini_metrics.py` — funzione riusabile `calcola_ritmo_vendita(vendite_totali, oggi=None, data_inizio="2026-03-01")`. Ritorna dict con `bt_mese`, `categoria` (`top`/`medio`/`poco`/`mai`), `label` human-friendly, `color_tone` per UI. Data inizio storico = 1 marzo 2026 (entrata in produzione del sistema).
- Soglie: `top` ≥ 5 bt/mese → emerald · `medio` 1–5 → amber · `poco` < 1 → neutral · `mai` (0 vendite totali) → neutral-dark.
- Helper secondario `giorni_dalla_ultima_vendita()`.
- BE `get_dashboard_stats`: query `alert_carta` estesa con `vendite_totali` (da 2026-03-01) + `ultima_vendita` (MAX `data_mov` VENDITA). Post-processing aggiunge `ritmo_vendita: dict`.

**Layout `VinoRow` ripensato (v4.9-alert-widget-faseB2):**
- Riga 1 identità: `#ID + nome + annata + produttore + tipologia` piccola inline
- Riga 2 metriche azionabili: badge combo `🛒 Top seller 6.1 bt/mese · Finito ~14gg fa` (classificato sul ritmo, finito appeso in secondaria con opacity 75%, omesso se "Mai venduto"). Badge `STATO_RIORDINO` e `STATO_CONSERVAZIONE` solo se valorizzati.
- Tolti: badge `STATO_VENDITA` (ridondante — condizione dell'alert è V/F/S/T per definizione), `0 bt` (condizione dell'alert), tipologia ripetuta a destra.

**Riusabilità:** `app.utils.vini_metrics` agnostico dal modulo. Quando aggiornerò SchedaVino bastera importare `calcola_ritmo_vendita`.

**Test BE (simulazione):**
- 30 vendite / 54gg storico → `Top seller · 16.7 bt/mese` (emerald)
- 8 vendite → `Vende · 4.4 bt/mese` (amber)
- 1 vendita → `Poco venduto · 0.56 bt/mese` (neutral)
- 0 vendite → `Mai venduto` (neutral-dark)

**File toccati:** `app/utils/vini_metrics.py` (nuovo), `app/models/vini_magazzino_db.py`, `frontend/src/pages/vini/DashboardVini.jsx`.

### Fase C — Punto 4 (Badge stato riordino a 3 click) — ✅ 2026-04-24

**Iter 1 (deprecata):** pill quadrate 32x32 con singola lettera `D · O · 0 · A · X`. Fuorviante — se non conosci la legenda interna non capisci cosa stai cliccando.

**Iter 2 (attiva):** pill ellittiche con **emoji + label breve**:
- 📝 Da ordinare
- 🚨 Finito — ordina
- 📦 Ordinato
- 🗓️ Annata esaurita
- ⛔ Non ricomprare

Spostate in **Riga 3 dedicata** (prima erano stipate in Riga 2 con il badge ritmo, poco respiro). Label "Stato riordino:" in minuscolo accanto.

**Stile pill:**
- Attiva: bg saturo colore `STATO_RIORDINO[code].color` + border-2 + ring-1 + font-semibold + icona ✓ appena visibile
- Inattiva: bianco outline neutro + hover leggero
- Touch target `w-8 h-8` (32x32px) ciascuna. 5 pill + gap + label → gruppo ≥ 44pt in larghezza totale.
- Label testuale sotto ("Stato riordino: Da ordinare") visibile solo quando uno stato è settato.

**Interazione:**
- Click pill inattiva → PATCH `/vini/magazzino/{id}` con `STATO_RIORDINO: code`
- Click pill attiva → PATCH con `STATO_RIORDINO: null` (clear)
- Vino con `X` salta automaticamente nella sezione "Non da ricomprare" (opacity 50%, line-through nome) al prossimo render.

**Refactor:** `toggleNonRicomprare()` → `setStatoRiordino(vino, nuovoStato)` generalizzato. Gestisce toggle auto (se click == corrente → clear).

**Rimossi:** vecchio bottone "◦ Non ricomprare" sulla colonna destra (sostituito dalla pill X), badge passivo `STATO_RIORDINO` nella riga metriche (ridondante col picker).

**File toccati:** `frontend/src/pages/vini/DashboardVini.jsx` (v4.10-alert-widget-faseC).

### Fase D — Punto 6 (Filtro rapido tipologia) — ✅ 2026-04-24

- **FE-only.** Riga chip appena sotto il banner, sopra la lista urgenti.
- **6 chip:** `Tutti · Rossi · Bianchi · Bollicine · Rosati · Altri`. "Altri" è catch-all per `GRANDI FORMATI`, `PASSITI E VINI DA MEDITAZIONE`, `VINI ANALCOLICI`, `ERRORE`, null.
- **Stile:**
  - Chip attiva: `bg-brand-blue text-white border-brand-blue`
  - Chip inattiva: bianco + border neutral + hover leggero + dot colorato (rosso/giallo/sky/pink/neutral per tipologia)
  - Touch target `min-h-[28px]` (in row di chip, gruppo > 44pt in altezza)
  - Chip con 0 vini nascoste automaticamente (declutter) — eccetto quella attiva che resta visibile per poter cliccarla e tornare a "Tutti".
- **Conteggi:** ogni chip mostra `(N)` calcolato su `urgenti` completo (non sul filtrato), così i numeri non saltano cambiando filtro.
- **Persistenza:** nessuna (`useState`). Reset al refresh.
- **Sezione "Non da ricomprare":** NON filtrata dal chip — resta sempre visibile in fondo. Significato di "archivio" scorrelato dalla tipologia.
- **Empty state:** se filtro non produce risultati, messaggio "Nessun vino in questa categoria" + link "Mostra tutti" che resetta.

**File toccati:** `frontend/src/pages/vini/DashboardVini.jsx` (v4.11-alert-widget-faseD).

### Fase E — Punto 3 (Raggruppamento per distributore) — ✅ 2026-04-24

- **FE-only.** Toggle switch "Raggruppa per distributore" in fondo alla riga chip filtro (stesso pattern del toggle "Mostra giacenze positive" in `📦 Riordini per fornitore`).
- **Persistenza:** `localStorage.vini_alert_raggruppa` ("true"/"false"). Il valore sopravvive al refresh.
- **Rendering:**
  - OFF (default): lista piatta con "Mostra tutti/meno".
  - ON: `<details open>` per ogni distributore. Summary con `📋 Nome Distributore (Rappresentante) — N vini` + icona ▼ rotante. Ordinamento gruppi: più vini prima, "— Non assegnato" sempre in fondo. Ogni gruppo apre di default; collassabile individualmente.
- **Vini senza distributore:** gruppo catch-all "— Non assegnato" in fondo.
- **Interazione con filtro tipologia (Fase D):** il raggruppamento si applica DOPO il filtro. Se filtro = Rossi + raggruppa ON → mostra solo gruppi che hanno vini rossi, con dentro solo i rossi.
- **"Mostra tutti/meno":** nascosto in modalità raggruppata.
- **Sezione "Non da ricomprare":** NON raggruppata, resta flat in fondo.

**File toccati:** `frontend/src/pages/vini/DashboardVini.jsx` (v4.13-alert-widget-faseE).

### Fase F — Punto 8 (Bottone "✅ Arrivato" inline) — ✅ 2026-04-24

- **FE-only.** Nuovo pulsante emerald `✅ Arrivato` nelle righe con ordine pending, accanto al pill blu `📦 N bt`.
- Click → conferma `window.confirm` con qta ordinata → POST `/vini/magazzino/{id}/ordine-pending/conferma-arrivo` con `qta_ricevuta = qta_ordinata` → rimuove pending dallo stato locale → toast + refresh dashboard (il vino sparisce dall'alert perché la giacenza è tornata > 0).
- Se serve modificare la qta ricevuta rispetto all'ordinata: click sul pill blu `📦 N bt` → apre il modale Fase 5 originale dove si può aggiustare qta + eventuali note prima di confermare.
- **State:** nuovo `confermandoArrivoId` (scoped al singolo vino, non usa `ordineArriving` per non confliggere col modale).

**File toccati:** `frontend/src/pages/vini/DashboardVini.jsx` (v4.14-alert-widget-faseF).

## 9. Punto 7 differito — Export WhatsApp "lista della spesa"

**Obiettivo (futuro):** click su "📋 Genera lista" → ordini pending raggruppati per distributore → WhatsApp aperto sul referente giusto con messaggio precompilato.

**Perché differito:** richiede:
1. Campo `TELEFONO` (o `WA_REFERENTE`) anagrafico affidabile sul distributore/rappresentante. Oggi non strutturato.
2. Template messaggio configurabile (memoria `feedback_no_hardcoded_config`). Servirebbe nuova tabella `vini_wa_templates` o estensione di Impostazioni Vini.
3. Mattone M.C WA composer è già pronto (`buildWaLink` + `fillTemplate`), ma il consumatore va progettato bene: cliente (template messaggio singolo) vs. fornitore (template ordine) sono cose diverse.

**Ipotesi di design (non implementata):**
- Nel widget `🚨 Vini in carta senza giacenza`, quando è attivo il raggruppamento per distributore (Fase E), ogni gruppo mostra un pulsante `💬 Invia lista` accanto al conteggio.
- Click apre mini-dialog:
  - Lista spuntabile (default: tutti i vini del gruppo con ordine pending, qta già valorizzata).
  - Textarea con messaggio precompilato dal template, modificabile.
  - Pulsante "Apri WhatsApp" → `openWhatsApp(telefono_distributore, messaggio)`.
- **Alternativa offline:** pulsante "📄 PDF lista" che scarica una lista stampabile raggruppata (dipende da mattone M.B PDF brand — non ancora in piedi).

**Dipendenze che sbloccano punto 7:**
- Anagrafica distributori con campo telefono obbligatorio (side-quest: `fornitori` table?).
- Configurazione template in Impostazioni Vini (nuova sezione "WhatsApp ordini").
- Mattone M.B PDF per variante stampabile (se serve).

**Suggerimento:** aprire come voce in `roadmap.md §V` quando una delle dipendenze è pronta (probabilmente in coda a Modulo Fornitori o a M.D Email). Oggi (2026-04-24) nessuna è pronta → si rimanda.

---

# Aspetti trasversali (entrambi i widget)

## Mattoni TRGB usati
- Tutti i widget usano primitives M.I (`Btn`, `StatusBadge`), toast, modale ordine già implementato. Nessun mattone nuovo serve per il widget riordini né per l'alert (eccetto punto 7 differito).

## Mobile/iPad
- Widget vivono in DashboardVini, oggi consultata principalmente da desktop/iPad portrait.
- Pill badge (Fase C) e chip filtro (Fase D) rispettano touch target 44pt minimo → row con gap 4–6 px.
- Modali (qty ordine, arrivo, duplica) bottoni 48pt e campi mobile-friendly.
- Su portrait iPad la tabella riordini diventa scrollable orizzontale (già così pre-refactor).

## Permessi
- Tutte le nuove azioni richiedono ruoli che possono già modificare il magazzino (admin, superadmin, sommelier). Pattern `Depends(get_current_user)` sui router estesi.

## Performance
- Campi aggiunti (`qta_suggerita`, `ultima_vendita`, `ritmo_vendita`, `qta_ordinata`, `data_ordine`) calcolati nella stessa query di `get_dashboard_stats`. Nessuna chiamata extra al FE.
- Indici consigliati: `vini_magazzino_movimenti(vino_id, tipo, data_mov)` se non già presente; `vini_ordini_pending(vino_id)` (creato dalla migration); `vini_prezzi_storico(vino_id, data DESC)` (creato dalla migration).

---

# Ordine di implementazione consigliato (storico)

**Widget Riordini per fornitore (Marco's order, sessione 51):**
1. Fase 1 (Sort + dettaglio dx) — apre la strada
2. Fase 2 (Duplica) — endpoint + bottone
3. Fase 3 (Schema DB ordini pending) — BE-only safe
4. Fase 4 (Colonna Riordino) — UI + estende stats
5. Fase 5 (Arrivato + carico) — chiude il flusso operativo
6. Fase 6 (Schema storico prezzi) — BE-only
7. Fase 7 (Listino inline) — sblocca edit veloce
8. Fase 8 (Tab Storico SchedaVino) — vista cronologica

**Widget Alert (Marco's order, 2026-04-24):**
1. Fase A (Ordina inline + qta suggerita) — impatto massimo, costo medio
2. Fase B (Ritmo vendita) — dato cheap, aiuta a decidere
3. Fase C (Badge stato a click) — pure UI refactor
4. Fase D (Filtro tipologia) — quick win FE
5. Fase E (Raggruppamento distributore) — più invasivo, dopo aver stabilizzato
6. Fase F (Arrivato inline) — chiude il loop operativo nel widget

---

**Autori:** Marco + Claude
**Sessioni:** 51 (widget riordini, 2026-04-20) + 2026-04-24 (widget alert)
**Cumulato file frontend:** `frontend/src/pages/vini/DashboardVini.jsx` da v3.14 → v4.14
