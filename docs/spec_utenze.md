# Spec — Analisi Utenze (parser bollette A2A) — TRGB Gestionale

**Creato:** 2026-07-17
**Stato:** ✅ COMPLETO U1-U4 (2026-07-17, mig 151+152, CG 2.21). Fuori scope: vedi §9 (form manuale fallback NON implementato)
**Classificazione:** `[core]` — parser A2A riusabile da qualunque ristorante cliente A2A
**Modulo:** `controllo_gestione` (tabelle `cg_utenze_*`, prefix `/controllo-gestione/utenze`)
**Precedenti di riferimento:** `app/services/elab_parser.py` (parser PDF che non scrive DB), `app/services/f24_parser.py`

---

## 1. Obiettivo

Le bollette A2A (luce + gas) contengono uno strato di dati **decisionali** che l'XML SDI
in `fe_fatture`/`fe_righe` non porta: consumi per fascia oraria, letture, potenza
prelevata, formula prezzo con spread, scadenza condizioni economiche, storico 18 mesi.

La feature aggiunge una sezione **Utenze** al Controllo di Gestione: upload del PDF
bolletta → parsing → serie storica consumi/costi per fornitura + KPI + alert.

**NON è contabilità**: le bollette entrano già nel CE dal flusso fatture (FIC/XML,
categoria UTENZE). Questa sezione è un layer di **analisi** parallelo. Nessun importo
di `cg_utenze_*` entra nel Conto Economico → zero rischio doppio conteggio.

---

## 2. Dati estraibili (validati con pdfplumber sui 2 PDF reali, 2026-07-17)

Prototipo eseguito su bolletta luce n. 526509846068 (giugno 2026) e gas n. 526509036373
(apr-mag 2026). Layout identico ("Scontrino dell'Energia" / "Box dell'Offerta").
`pdfplumber` è **già in requirements.txt** (usato per LUL cedolini) → nessuna dipendenza nuova.

| Dato | Luce | Gas | Dove nel PDF |
|---|---|---|---|
| N. fornitura, n. bolletta, data emissione | ✅ | ✅ | pag. 1 |
| Offerta attiva + **scadenza condizioni economiche** | ✅ (30.11.2026) | ✅ (30.11.2026) | pag. 1 + Box Offerta |
| Periodo fatturato, consumo fatturato | ✅ | ✅ (con split **stimato/rilevato**) | pag. 1 |
| POD / PDR | ✅ | ✅ | pag. 2 |
| Scontrino: €/kWh o €/Smc medio, split vendita vs rete+oneri, quota fissa, quota potenza, accise+IVA | ✅ | ✅ | pag. 2 |
| Formula prezzo: indice (PUN/PSVDA) + **spread** | ✅ 0,02727 €/kWh | ✅ 0,104547 €/Smc | Box Offerta |
| Letture e consumi per fascia F1/F2/F3 (attiva, reattiva, potenza) | ✅ | n/a | pag. 3 |
| Letture con tipo Rilevata/Stimata | n/a | ✅ | pag. 3 |
| Consumo annuo + spesa annua sostenuta | ✅ 66.499 kWh / €23.089 | ✅ 5.106 Smc / €6.016 | pag. 3-4 |
| **Storico 18 mesi** (fasce luce; reale/stimata gas) | ✅ | ✅ | pag. 3-4 |
| Potenza prelevata mensile 12 mesi vs impegnata | ✅ (max 27,3 su 30 kW) | n/a | pag. 4 |
| Cos(φ) / rapporto reattiva (soglia penali 33%) | ✅ (27,7% F1) | n/a | pag. 3 |

Varianti layout gestite (scoperte coi 16 PDF reali, 2026-07-17): le sezioni
scivolano di pagina (storico gas su p3 O p4 → ricerca per marker, mai indice
fisso); bollette a consumo zero (POD secondario solo quota fissa) senza Box
Offerta né storico; riga "Stimata" assente = zeri impliciti. Tre Gobbi ha
**4 forniture**: luce ristorante + luce secondaria (POD IT001E25733128, 3 kW)
+ gas cucina + gas secondario (210000750924).

Residuo tecnico noto dal prototipo: le righe di dettaglio fasce a pag. 3 e alcune label
multi-colonna di pag. 1 richiedono parsing posizionale (`extract_table` / coordinate),
non bastano regex sul testo piatto. Fattibile, è lo stesso lavoro fatto per ELAB.

---

## 3. Schema DB — migrazione `151_cg_utenze.py` (numero da riverificare) in `foodcost.db`

### `cg_utenze_forniture`
Anagrafica punti di fornitura (2 righe oggi: luce + gas).

```sql
id INTEGER PK, tipo TEXT CHECK(tipo IN ('LUCE','GAS')),
fornitore TEXT,                -- 'A2A Energia'
numero_fornitura TEXT UNIQUE,  -- 210000714820
pod_pdr TEXT,                  -- IT001E25733126 / 00108700116801
indirizzo TEXT,
offerta TEXT,                  -- 'Smart Business - Luce'
indice_riferimento TEXT,       -- 'PUN Index GME' / 'PSVDA_MM'
spread REAL,                   -- ultimo spread noto
scadenza_condizioni DATE,      -- 2026-11-30 → checker M.F
potenza_impegnata_kw REAL,     -- solo luce
attiva INTEGER DEFAULT 1,
created_at, updated_at
```

### `cg_utenze_bollette`
Una riga per bolletta caricata.

```sql
id INTEGER PK, fornitura_id FK,
numero_bolletta TEXT UNIQUE,   -- chiave di aggancio a fe_fatture.numero_fattura
data_emissione DATE, periodo_da DATE, periodo_a DATE,
consumo_fatturato REAL, consumo_stimato REAL,  -- gas: quota stimata
unita TEXT,                    -- 'kWh' / 'Smc'
totale REAL, accise_iva REAL,
prezzo_medio REAL, prezzo_energia REAL, prezzo_rete_oneri REAL,
quota_fissa REAL, quota_potenza REAL,
spread REAL, valori_indice TEXT,   -- JSON: {"F1":0.12576,...} o {"Apr.26":0.509917}
fe_fattura_id INTEGER,         -- link automatico se trovata, NULL altrimenti
pdf_filename TEXT, pdf_hash TEXT UNIQUE,  -- sha256 anti-duplicazione (pattern fe_fatture)
parsed_json TEXT,              -- dump completo parser (campi extra senza migrazione)
warnings TEXT, data_import DATETIME
```

### `cg_utenze_consumi_mensili`
Serie storica mensile, alimentata dallo storico 18 mesi di ogni bolletta.

```sql
id INTEGER PK, fornitura_id FK,
anno_mese TEXT,                -- 'YYYY-MM'
fascia TEXT,                   -- 'F1'/'F2'/'F3' (luce) | 'TOT' | 'STIMATA' (gas)
consumo REAL, unita TEXT,
potenza_max_kw REAL,           -- solo luce, NULL altrove
fonte_bolletta_id FK,
UNIQUE(fornitura_id, anno_mese, fascia)
```

**Upsert idempotente**: gli storici di bollette consecutive si sovrappongono di ~17 mesi
→ ON CONFLICT aggiorna se la bolletta fonte è più recente. Caricare una sola bolletta
recente = 18 mesi di serie già popolati.

---

## 4. Parser — `app/services/utenze_parser.py`

Pattern identico a `elab_parser.py`:

- `parse_bolletta_a2a(path) -> dict` — NON scrive nel DB. Ritorna dati strutturati
  + `warnings[]` + `fonte_hash` sha256. Scrive il router dopo conferma utente.
- Autodetect `tipo` (LUCE/GAS) dal testo pag. 1 ("Energia Elettrica" / "Gas").
- Italian decimal (virgola→punto, punto migliaia). Parsing posizionale per le tabelle
  (pag. 3 letture, pag. 4 storico) via `extract_table`/coordinate.
- Layout non riconosciuto (fornitore diverso da A2A, restyling futuro) → eccezione
  controllata `UnsupportedLayoutError` → l'UI propone inserimento manuale (form
  con i campi minimi di `cg_utenze_bollette`).
- Ogni campo mancante = warning, mai crash: il parser ritorna quello che trova.

---

## 5. Backend — router `app/routers/cg_utenze_router.py`

Prefix `/controllo-gestione/utenze`, JWT su tutto, registrato in `main.py`.
File separato dal router CG monolitico (2.700+ righe) ma stesso modulo dichiarato:
`# Modulo: controllo_gestione`.

| Metodo | Path | Cosa fa |
|---|---|---|
| POST | `/upload` | multipart PDF → parse → **preview** (non scrive). Dedup su pdf_hash |
| POST | `/conferma` | scrive: upsert fornitura, insert bolletta, upsert consumi mensili, aggancio `fe_fattura_id` via numero bolletta = `fe_fatture.numero_fattura` |
| GET | `/` | dashboard: forniture + ultima bolletta + KPI (€/kWh all-in, €/Smc all-in, spesa annua, countdown scadenza condizioni) |
| GET | `/consumi` | serie mensile per grafici (filtri: fornitura, range) |
| GET | `/bollette/{id}` | dettaglio bolletta (parsed_json incluso) |
| DELETE | `/bollette/{id}` | elimina bolletta + consumi orfani di quella fonte |

**TRAILING SLASH** sul root (`/controllo-gestione/utenze/`) come da regola FE.

---

## 6. Frontend — `ControlloGestioneUtenze.jsx`

- Tab "Utenze" (icona 💡) in `ControlloGestioneNav.jsx` + voce in `modulesMenu.js`
  (sub di controllo-gestione) — checklist visione d'insieme.
- **UI primitives M.I** (`Btn`, `PageLayout`, `StatusBadge`, `EmptyState`) — pagina nuova → li usa.
- Zona upload drag&drop PDF → preview campi estratti + warnings → bottone Conferma.
- KPI cards: €/kWh all-in, €/Smc all-in, spesa energia 12 mesi (luce+gas),
  scadenza condizioni (countdown, rosso se < 60 gg), % consumo stimato gas.
- Grafici Recharts (palette regole TRGB: serie corrente `#2E7BE8`, precedente `#d1d5db`):
  - consumi mensili luce stacked per fascia F1/F2/F3
  - consumi gas mensili con overlay baseline estiva (split cucina vs riscaldamento)
  - potenza max mensile vs linea potenza impegnata
- Tabella bollette caricate con link alla fattura in Acquisti se `fe_fattura_id` presente.
- Sfondo `bg-brand-cream`.

---

## 7. Alert — 2 checker M.F (`alert_engine`)

1. `utenze_scadenza_condizioni` — giorni alla `scadenza_condizioni` < soglia
   (config, default 60) → notifica "Rinegozia luce+gas prima del 30.11.2026".
2. `utenze_consumi_stimati` — ultima bolletta gas con quota stimata > soglia
   (config, default 30%) → notifica "Fai l'autolettura gas" (SMS al numero in bolletta).

Registrazione con `@register_checker`, config in `alert_config` (notifiche.sqlite3),
UI nel tab Notifiche di Impostazioni Sistema.

---

## 8. Fasi di implementazione (ognuna pushabile)

| Fase | Contenuto | Stima |
|---|---|---|
| **U1** | Migrazione `cg_utenze_*` + `utenze_parser.py` + endpoint `/upload` (preview only) | 1 sessione |
| **U2** | `/conferma` + storage + upsert consumi + aggancio `fe_fatture` + GET dashboard/consumi | con U1 o subito dopo |
| **U3** | Pagina FE completa (upload, KPI, grafici, tabella) + nav + modulesMenu | 1 sessione |
| **U4** | 2 checker M.F + docs (capability `C-CG-*` in `modulo_controllo_gestione.md`, changelog, bump `controlloGestione` in versions.jsx) | chiusura |

## 9. Fuori scope (per ora)

- Parser per fornitori diversi da A2A (fallback: form manuale).
- Bollette acqua e telefono (importi piccoli, niente dati decisionali → restano solo in CE).
- Confronto automatico offerte di mercato (il dato spread lo abilita, ma è analisi manuale).
- Viewer PDF in-app. Nota: a differenza di ELAB (che parsa da tempfile e butta il PDF),
  qui il PDF **si archivia** in `locale_data_path("uploads/utenze/")` — la bolletta è un
  documento che vale la pena conservare — ma senza viewer dedicato: solo download.
