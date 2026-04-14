# Modulo Dipendenti — Turni v2.0 (Ripensamento)

**Data:** 2026-04-14
**Stato:** piano APPROVATO, in corso

## Decisioni prese (2026-04-14)

- **1.A** Popover inline desktop + bottom sheet mobile per creazione/edit
- **2.A** Vista mensile = calendario Google-like (proviamo questa, eventuali alternative dopo)
- **3+4** Totali ore in colonna destra **E** copertura in riga footer (entrambe)
- **Assenze:** NON dentro Turni v2 — passano al modulo Presenze v2.3 dedicato.
  Nessun seed RIPOSO/FERIE/MALATTIA/PERMESSO in Turni.
  Workflow Marco: chi non compare nel foglio = è a casa.
- **6** Flusso copia settimana confermato (intera settimana, casi singoli a mano dopo).
  La copia rispettera' eventuali assenze del modulo Presenze (cross-tabella).
- **Vista principale = "Foglio settimana" stile Excel di Marco**:
  righe = giorni lun-dom, colonne = slot per servizio (PRANZO 1..N / CENA 1..N).
  Una "matrice" per ogni reparto (SALA, CUCINA), tab per passare da uno all'altro.
- **Reparti**: tabella `reparti` di prima classe. Seed SALA + CUCINA, estendibile.
  Ogni dipendente ha `reparto_id`. Ogni reparto ha orari pranzo/cena standard.
- **Slot per servizio**: variabile da 2 a 6 (default 4, configurabile da UI).
- **Asterisco "*" nel nome = `stato='CHIAMATA'`** (turno tentativo, da confermare).
  Visualizzato con asterisco rosso accanto al nome, badge "DA CONFERMARE".
- **Colori dipendenti**: ogni dipendente ha `colore` univoco (palette 14 tinte).
  La cella colorata col colore-dipendente, come fa Marco oggi in Excel.
- **Chiusura settimanale**: NIENTE duplicazione. Si legge da
  `app/data/closures_config.json` (modulo Vendite). Default mercoledì.
  Il giorno chiuso appare grigio nel foglio, niente turni assegnabili.
- **Pause staff** (calcolo ore lavorate): 30 min pranzo + 30 min cena
  scalati dal totale. Configurabile per reparto (`reparti.pausa_pranzo_min`,
  `reparti.pausa_cena_min`). Implementazione in Fase 2 (servizio totali).
- **Ordine partenza:** Fase 0 (schema) → 1 (foglio settimana) → 2 (totali+pause+copertura) → 3 (copia). Poi 5/6/7/8/9/10. Fase 4 RIMOSSA.
**Contesto:** la versione attuale (`frontend/src/pages/dipendenti/DipendentiTurni.jsx`)
è funzionante ma lenta da usare, priva di totali, vista mensile finta, niente
copia settimana, niente assenze, niente stampa. Ripensiamo l'intero modulo.

---

## 1. Principi guida

1. **Velocita' nella creazione**: comporre una settimana intera deve richiedere
   meno clic possibili. Click sulla cella -> assegna. Click sul turno -> edit.
   Niente piu' form in alto con scroll.
2. **Zero rischio cancellazioni accidentali**: un tap non deve mai cancellare.
   La cancellazione sta dentro il popup di edit.
3. **Leggibilita' a colpo d'occhio**: totali ore per dipendente, copertura per
   giorno/ruolo, assenze visibili sopra i turni.
4. **Realta' dell'osteria**: 85% delle settimane e' uguale alla precedente,
   quindi "Copia settimana" e' la feature killer. Template ricorrenti sono il
   secondo livello.
5. **Mobile-aware da subito**: iPad portrait deve funzionare. Touch 48pt,
   vista giorno automatica quando la griglia non ci sta.
6. **Pragmatismo su assenze**: fino a che il modulo Presenze v2.3 non arriva,
   ferie/malattia/permesso vivono dentro Turni come tipi speciali. La
   migrazione futura e' banale (stessi record, spostano tabella).

---

## 2. Schema dati — modifiche

Tutte le modifiche su `dipendenti.sqlite3` via migrazione `071_turni_v2_schema.py`.
Idempotente, ALTER TABLE con try/except.

### 2.1 `reparti` — NUOVA tabella

Reparti operativi (SALA, CUCINA, …). Estendibile per altre attività.

| Colonna | Tipo | Note |
|---------|------|------|
| `id` | INT PK | |
| `codice` | TEXT UNIQUE | `SALA`, `CUCINA`, … |
| `nome` | TEXT | display name |
| `icona` | TEXT | emoji (🍽️ 👨‍🍳) |
| `colore` | TEXT | HEX, per badge tab |
| `ordine` | INT | sort |
| `attivo` | INT | 1/0 |
| `pranzo_inizio` / `pranzo_fine` | TEXT HH:MM | orario standard pranzo |
| `cena_inizio` / `cena_fine` | TEXT HH:MM | orario standard cena |
| `pausa_pranzo_min` | INT default 30 | da scalare nel calcolo ore |
| `pausa_cena_min` | INT default 30 | idem |

Seed:
- **SALA** — pranzo 10:30-15:30, cena 18:00-24:00
- **CUCINA** — pranzo 09:30-15:30, cena 17:30-23:00

### 2.2 `dipendenti` — colonne aggiunte

| Colonna | Tipo | Note |
|---------|------|------|
| `reparto_id` | INT FK reparti | con backfill da `ruolo` (sala/cucina) |
| `colore` | TEXT HEX | univoco per persona, palette 14 tinte |

Backfill colore = rotazione palette per id (Marco può cambiare a mano).

### 2.3 `turni_tipi` — colonne aggiunte

| Colonna | Tipo | Default | Note |
|---------|------|---------|------|
| `categoria` | TEXT | `'LAVORO'` | `LAVORO` / `RIPOSO` / `ASSENZA` (le 2 ultime non seedate) |
| `ore_lavoro` | REAL | calc da orario | override manuale; backfill automatico in migrazione |
| `icona` | TEXT | NULL | emoji breve per mobile |
| `servizio` | TEXT | NULL | `PRANZO` / `CENA` / NULL=tutto-giorno; backfill heuristico |

NESSUN seed (Marco crea i tipi turno secondo necessità dall'admin).

### 2.4 `turni_calendario` — colonne aggiunte

| Colonna | Tipo | Default | Note |
|---------|------|---------|------|
| `ore_effettive` | REAL | NULL | override sul singolo giorno |
| `origine` | TEXT | `'MANUALE'` | `MANUALE` / `COPIA` / `TEMPLATE` |
| `origine_ref_id` | TEXT | NULL | id settimana sorgente o id template |

**`stato`** resta TEXT libero — accetta `CONFERMATO` (default), `CHIAMATA` (asterisco
= turno tentativo), `ANNULLATO`.

### 2.5 Indici

```sql
CREATE INDEX idx_dipendenti_reparto    ON dipendenti(reparto_id);
CREATE INDEX idx_turni_cal_data         ON turni_calendario(data);
CREATE INDEX idx_turni_cal_dip_data     ON turni_calendario(dipendente_id, data);
```

### 2.6 Template settimanali (per Fase 10)

```sql
CREATE TABLE turni_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,              -- "Settimana standard estate"
  descrizione TEXT,
  attivo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE turni_template_righe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES turni_template(id) ON DELETE CASCADE,
  dipendente_id INTEGER NOT NULL REFERENCES dipendenti(id),
  giorno_settimana INTEGER NOT NULL,  -- 0=lun ... 6=dom
  turno_tipo_id INTEGER NOT NULL REFERENCES turni_tipi(id),
  note TEXT
);
CREATE INDEX idx_tmpl_righe_tmpl ON turni_template_righe(template_id);
```

### 2.7 Chiusure settimanali — NIENTE duplicazione

Le chiusure si leggono da `app/data/closures_config.json` (modulo Vendite,
gestito da `app/routers/closures_config_router.py`). Backend Turni espone una
funzione di comodo:

```python
from app.routers.closures_config_router import get_closures_config
cfg = get_closures_config()
# cfg = {giorno_chiusura_settimanale: 2, giorni_chiusi: [...], turni_chiusi: [...]}
```

Il frontend Turni v2 chiama `GET /settings/closures-config` (endpoint esistente,
JWT). Le celle dei giorni chiusi appaiono grigio cream, niente turni assegnabili.

---

## 3. Endpoint backend — nuovi

Esistenti restano. Aggiungiamo:

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| POST | `/dipendenti/turni/calendario/copia` | copia una settimana su un'altra |
| GET | `/dipendenti/turni/totali` | totali ore per dipendente nel periodo |
| GET | `/dipendenti/turni/copertura` | conteggio turni per giorno e ruolo |
| GET | `/dipendenti/turni/template/` | lista template |
| POST | `/dipendenti/turni/template/` | crea template |
| POST | `/dipendenti/turni/template/{id}/applica` | applica template a una settimana |
| DELETE | `/dipendenti/turni/template/{id}` | elimina template |

### 3.1 Payload copia settimana
```json
POST /dipendenti/turni/calendario/copia
{
  "from_settimana": "2026-04-06",   // lunedi' sorgente
  "to_settimana": "2026-04-13",     // lunedi' destinazione
  "skip_assenze_destinazione": true, // non sovrascrivere FERIE/MALATTIA gia' presenti in dest
  "sovrascrivi": false               // se true, cancella prima i turni in destinazione
}
```

Risposta: `{ "creati": N, "saltati_per_assenza": M, "errori": [] }`

### 3.2 Totali
```json
GET /dipendenti/turni/totali?from=2026-04-13&to=2026-04-19
-> [
  { "dipendente_id": 1, "nome": "Mario", "cognome": "Rossi",
    "ore_totali": 42, "giorni_lavorati": 5, "assenze": 1, "riposi": 1 }
]
```

### 3.3 Copertura
```json
GET /dipendenti/turni/copertura?from=...&to=...
-> [
  { "data": "2026-04-13", "ruolo": "Sala", "count_pranzo": 2, "count_cena": 3 },
  ...
]
```

---

## 4. Frontend — struttura

File principale: `frontend/src/pages/dipendenti/DipendentiTurni.jsx` (refactor).
Sotto-componenti in `frontend/src/components/turni/`:

- **`FoglioSettimana.jsx`** — vista principale (replica Excel di Marco):
  - Tab in alto per reparto (SALA / CUCINA / …)
  - Una matrice per reparto: righe = giorni lun-dom, colonne = slot
    (PRANZO 1..N | CENA 1..N), default 4+4 ma estendibile a 6+6 da bottone
  - Cella = nome dipendente colorato col suo `colore` univoco
  - Click cella vuota → popover "scegli dipendente"
  - Click cella piena → popover edit (cambia dipendente, segna come CHIAMATA con asterisco, elimina)
  - Riga giorno chiuso (da closures_config) → grigio inerte
  - Footer: copertura per servizio + totale ore reparto
  - Lateral right: totale ore per dipendente con semaforo (>40h giallo, >48h rosso)
- `GrigliaMensile.jsx` — vista mese Google-like
- `TimelineDipendente.jsx` — vista per singolo dipendente (4 settimane)
- `PopoverTurno.jsx` — popover inline edit/create (desktop)
- `BottomSheetTurno.jsx` — sheet mobile (iPad portrait)
- `CopiaSettimanaDialog.jsx` — wizard copia settimana
- `TemplateManager.jsx` — gestione template settimana tipo
- `TotaliColumn.jsx` — colonna ore per dipendente
- `CoperturaRow.jsx` — riga copertura giornaliera

Utility:
- `utils/turni.js` — calcolo ore, validazione overlap, formatting settimana
- `utils/oreNette.js` — calcola ore al netto delle pause staff per reparto
- `hooks/useTurni.js` — hook unico per fetch/mutazioni + cache locale
- `hooks/useReparti.js` — fetch reparti + dipendenti raggruppati
- `hooks/useChiusure.js` — fetch closures_config (cache lunga)

---

## 5. Fasi di implementazione

Le fasi sono **incrementali**: ogni fase lascia il modulo in uno stato
funzionante e deployabile. Marco sceglie il punto di stop.

### Fase 0 — Fondamenta
*Obiettivo:* preparare DB e docs senza cambiare UI visibile.
*Dimensione:* piccola, 1 sessione.
*Rischio:* basso.

- Migrazione DB: aggiungere colonne `turni_tipi.categoria`, `ore_lavoro`, `icona`
- Migrazione DB: aggiungere colonne `turni_calendario.ore_effettive`, `origine`, `origine_ref_id`
- Indici su `turni_calendario(data, dipendente_id)`
- Tabelle `turni_template` e `turni_template_righe`
- Seed tipi assenza (RIPOSO, FERIE, MALATTIA, PERMESSO)
- Aggiornare `docs/modulo_dipendenti.md` e `docs/database.md`

**Commit consigliato:** `./push.sh "turni v2 fase 0: schema DB, seed assenze"`

### Fase 1 — Foglio Settimana (la piu' importante)
*Obiettivo:* sostituire griglia attuale con il "foglio" stile Excel di Marco.
*Dimensione:* grande.
*Rischio:* medio (tocca la UI principale).

- Componente nuovo `FoglioSettimana.jsx`:
  - Tab in alto per reparto, badge col `reparti.colore`, conteggio dipendenti
  - Per ogni reparto: matrice 7×(slot_pranzo + slot_cena), default 4+4
  - Bottone "+ slot" per aggiungere colonne (max 6+6)
  - Header colonna mostra orario standard del reparto (es. "PRANZO 10:30-15:30")
  - Header riga: data + giorno (es. "Mer 15/04") + badge "CHIUSO" se da closures_config
- Click cella vuota → popover compatto:
  - Select dipendente del reparto (avatar colorato, non gia' assegnato altrove nello stesso slot)
  - Toggle "Da confermare" (= stato CHIAMATA, asterisco)
  - Note opzionali
  - Salva → cella si colora col colore del dipendente
- Click cella piena → popover con:
  - Cambia dipendente
  - Toggle CHIAMATA on/off
  - Note
  - Bottoni "Salva" / "Rimuovi"
- Asterisco rosso (\*) accanto al nome se stato=CHIAMATA + badge "DA CONFERMARE" in popover
- Giorni chiusi (cfr `closures_config`): riga grigia, slot inerti, tooltip "Chiuso"
- Bottoni touch 48pt
- Toast TRGB per feedback (no alert/confirm)
- Mobile (< 768px): foglio diventa "vista giorno" con due liste (pranzo/cena) — vedi Fase 9

**Test:** comporre una settimana di 6 dipendenti × 2 servizi × 7 giorni deve richiedere
massimo 3 tap per cella (tap → scegli persona → salva).

**Commit:** `./push.sh "turni v2 fase 1: foglio settimana per reparto (SALA/CUCINA), click-to-assign, stato CHIAMATA"`

### Fase 2 — Totali ore (al netto delle pause staff) e copertura
*Obiettivo:* vedere ore settimanali per dipendente e copertura per giorno.
*Dimensione:* media.
*Rischio:* basso.

- Endpoint `/dipendenti/turni/totali` e `/copertura`
- **Calcolo ore nette** (servizio condiviso `app/services/turni_service.py`):
  ```
  ore_lorde = somma ore_effettive (o ore_lavoro del tipo)
  pause = pausa_pranzo_min/60  se ha turno PRANZO
        + pausa_cena_min/60    se ha turno CENA
  ore_nette = ore_lorde - pause
  ```
  Pause prese da `reparti.pausa_pranzo_min/pausa_cena_min` (default 30/30).
  Configurabile in futuro per dipendente, oggi solo per reparto.
- Colonna destra nel foglio: "Ore nette" con semaforo
  (<=40 verde, 40-48 giallo, >48 rosso). Tooltip mostra dettaglio
  "Lorde 45h − pause 3.5h = 41.5h nette".
- Riga in fondo: "Copertura" con badge per slot (es. "Pranzo: 4/4, Cena: 3/4 ⚠️")
- Toggle per mostrare/nascondere riga copertura

**Commit:** `./push.sh "turni v2 fase 2: ore nette (con pause staff) + copertura"`

### Fase 3 — Copia settimana
*Obiettivo:* replicare la settimana precedente con un clic.
*Dimensione:* media.
*Rischio:* medio (scrittura massiva in DB).

- Endpoint `POST /dipendenti/turni/calendario/copia`
- Bottone "Copia settimana..." nella toolbar
- Dialog: select settimana sorgente (default = settimana precedente), checkbox "Non sovrascrivere assenze gia' presenti", preview tabellare ("N turni verranno creati"), conferma
- Tutti i turni creati hanno `origine='COPIA'` e `origine_ref_id=<data_lunedi_sorgente>`
- Se settimana destinazione ha gia' turni: warning, opzione "Sovrascrivi" (svuota prima)

**Commit:** `./push.sh "turni v2 fase 3: copia settimana con preview"`

### Fase 4 — RIMOSSA (assenze nel modulo Presenze v2.3)
*Decisione 2026-04-14:* assenze ferie/malattia/permesso saranno gestite dal
modulo Presenze separato. In Turni v2 resta solo:
- Tipo speciale `RIPOSO` (riposo programmato), gia' seed in Fase 0
- Campo `categoria` su `turni_tipi` con valori `LAVORO`/`RIPOSO`/`ASSENZA`
- Hook nella copia settimana per consultare (in futuro) il modulo Presenze e
  saltare i giorni con assenza programmata

### Fase 5 — Vera vista mensile a griglia ✅ COMPLETATA (sessione 38)
*Obiettivo:* sostituire la "lista per data" con un calendario vero.
*Dimensione:* media.
*Rischio:* medio.

**Backend — `turni_service.py` + `turni_router.py`:**
- Nuovo servizio `build_vista_mese(reparto_id, anno, mese)` — griglia 42 giorni (6×7) partendo dal lunedì della settimana che contiene il 1° del mese
- Helper condiviso `giorni_chiusi_nel_range(date_list)` — generalizza `giorni_chiusi_nella_settimana` a range arbitrari (riuso nel mese)
- Nuovo endpoint `GET /turni/mese?reparto_id=X&anno=YYYY&mese=MM` (JWT) — default mese corrente
- Payload: `reparto`, `anno`, `mese`, `mese_inizio/fine`, `giorni[42]`, `settimane_iso[6]`, `dipendenti[]`, `turni[]`, `chiusure[]`

**Frontend — nuova pagina `VistaMensile.jsx` + route `/dipendenti/turni/mese`:**
- Header: selettore mese ←/→/Oggi, bottone "📅 Settimana" per tornare a FoglioSettimana, tab reparti (con colori reparto)
- Griglia 6×7: intestazioni Lun..Dom (sabato+domenica rossi), celle altezza 110px
- Cella giorno: numero giorno, badge compatti 22×18px con iniziali dipendente + colore HEX univoco (contrasto auto), raggruppati per servizio (☀ pranzo / 🌙 cena), max 6 badge per riga con indicatore "+N"
- Stati visivi cella: fuori-mese → opacity 0.4, oggi → ring brand-blue, selezionata → ring pieno, chiuso → sfondo grigio + "CHIUSO"
- OPZIONALE → ★ giallo overlay; ANNULLATO → opacity 0.4
- Click cella → pannello destro con dettaglio: sezione Pranzo + sezione Cena, righe con dipendente+colore+orario+stato+note, badge "📞 a chiamata"
- Bottone "✏️ Apri settimana per modificare" → passa a `/dipendenti/turni` con `turni_last_settimana` memorizzato in localStorage (deep-link automatico)
- Persistenza reparto (localStorage `turni_last_reparto`) condivisa tra settimana/mese — cambi reparto nella vista mese, lo trovi selezionato in quella settimana
- Vista di sola lettura: per editing il pannello indirizza alla vista settimana

**FoglioSettimana.jsx v1.7→v1.8:**
- Bottone "🗓 Mese" nell'header → naviga a VistaMensile
- Init legge `turni_last_settimana` / `turni_last_reparto` da localStorage (deep-link da VistaMensile)
- Persistenza reparto scelto allineata a VistaMensile

**Commit:** `./push.sh "turni v2 fase 5: vista mensile 6x7 con dettaglio giorno + deep-link settimana"`

### Fase 6 — Vista per dipendente
*Obiettivo:* "quando lavoro il prossimo mese?" a colpo d'occhio.
*Dimensione:* piccola.
*Rischio:* basso.

- Tab "Per dipendente" in toolbar
- Select dipendente -> timeline 4 settimane con blocchi turno
- Totali: ore totali periodo, giorni lavorati, riposi, assenze
- Stampabile singolarmente

**Commit:** `./push.sh "turni v2 fase 6: vista per dipendente, timeline 4 settimane"`

### Fase 7 — Controllo conflitti
*Obiettivo:* avvisare (non bloccare) su sovrapposizioni orarie.
*Dimensione:* piccola.
*Rischio:* basso.

- Backend su POST/PUT: calcola overlap tra turni stesso dipendente stessa data
- Risposta include `warnings: []` (non errore HTTP)
- FE mostra icona ⚠️ sul turno in conflitto, tooltip con dettaglio
- Modal in creazione se conflitto: "Attenzione, sovrapposizione con [turno]. Salvo lo stesso?"

**Commit:** `./push.sh "turni v2 fase 7: warning conflitti orari"`

### Fase 8 — Stampa / Export ✅ COMPLETATA (sessione 38)
*Obiettivo:* PDF server-side della settimana + vista immagine da girare allo staff su WhatsApp.
*Dimensione:* media.
*Rischio:* basso.

**Backend — `turni_router.py` + WeasyPrint:**
- Nuovo endpoint `GET /turni/foglio/pdf?reparto_id=X&settimana=YYYY-Www` (JWT)
- Riusa `build_foglio_settimana` + `giorni_chiusi_nella_settimana`
- Template HTML inline (CSS @page A4 landscape, 10mm margini) + WeasyPrint → `StreamingResponse(application/pdf, inline)`
- Celle colorate per dipendente con contrasto auto (funzione `_text_on`), stato OPZIONALE → prefix ★, ANNULLATO → opacity .4
- Header: 🍷 Osteria Tre Gobbi — Turni settimana DD/MM–DD/MM/AAAA — pill colorata reparto
- Footer: TRGB Gestionale + data generazione + settimana ISO
- Filename: `turni_<codice_reparto>_<settimana>.pdf`
- Anticipo rispetto a M.B PDF brand: template è inline, verrà rifattorizzato quando il mattone sarà pronto

**Frontend — `FoglioSettimana.jsx` v1.5→v1.7-pdf-server:**
- Pulsante **📄 PDF**: `scaricaPdf()` fa fetch dell'endpoint, blob → `URL.createObjectURL` → `window.open(url, "_blank")` (fallback download se popup bloccato)
- Niente dialog stampante del browser — il PDF si apre come anteprima, Marco decide se salvare/condividere
- Pulsante **📷 Immagine**: overlay fullscreen `<VistaImmagine>` con titolo Playfair Display, pill colorata reparto, matrice completa, legenda. Toolbar sticky con "📄 PDF" e "✕ Chiudi". Blocca scroll body dietro. Pronto per screenshot iPad → WhatsApp
- Helper `formatWeekRange(iso)` lato FE (solo per la Vista Immagine — il PDF usa la versione Python)
- **Regola "no window.print diretto" RISPETTATA**: zero chiamate a window.print in tutto il modulo

**Commit:** `./push.sh "turni v2 fase 8: pdf server-side (weasyprint) + vista immagine per condivisione staff"`

### Fase 9 — Mobile iPad ✅ COMPLETATA (sessione 38)
*Obiettivo:* vista giorno automatica su schermi stretti.

- **`useIsNarrow(maxPx=899)`** in `FoglioSettimana.jsx` — hook su `window.matchMedia` con listener `change` (compat addListener legacy). Default = `false` SSR-safe.
- **Render condizionale**: sotto 900px la `<FoglioGrid>` viene sostituita da `<VistaGiornoMobile>` (sopra 900px tutto invariato, vista settimanale piena).
- **`VistaGiornoMobile`**: header sticky con frecce ← / pulsante **Oggi** / → (min-h 48px), data completa "Lunedì 14 aprile 2026" + badge OGGI/CHIUSO, body con due card servizio (`SezioneServizioMobile`) per Pranzo e Cena, oppure messaggio "🚪 Osteria chiusa" se giorno chiuso.
- **Touch swipe**: `onTouchStart`/`onTouchEnd` con threshold 60px e filtro vertical-dominant (ignorato se |dy| > |dx|, evita trigger durante scroll). Funzione `vai(delta)` wrappa al cambio settimana quando si oltrepassa Lun/Dom (chiama `onPrevSettimana`/`onNextSettimana` props).
- **`SezioneServizioMobile`**: card colorata per servizio con conteggio "X/N assegnati", lista slot ordinati. Stati: "🌙 Servizio chiuso" se non c'è il servizio quel giorno, oppure "Nessuno slot configurato".
- **`SlotMobileRow`**: riga con indice slot (1°, 2°…), pill colorata con nome+cognome COMPLETO (mobile ha più spazio orizzontale rispetto alla cella desktop), orario, oppure "+ assegna" placeholder grigio se vuoto.
- **`giornoIdx`** state inizializzato a oggi (lun=0 … dom=6), persiste l'indice all'interno della stessa settimana (su cambio settimana resta sull'indice corrente).
- **Mobile-aware**: tutti i pulsanti hanno `min-h 48px`, niente hover-only, swipe + frecce + tap-to-Today, footer hint "Scorri ← / → o usa i pulsanti per cambiare giorno".

**Commit:** `./push.sh "turni v2 fase 9: vista giorno mobile <900px con swipe + navigator giorno"`

### Fase 10 — Template settimana tipo
*Obiettivo:* salvare pattern ricorrenti e applicarli.
*Dimensione:* media.
*Rischio:* medio.

- Pagina/dialog "Gestione template"
- Salva settimana corrente come template (nome + descrizione)
- Lista template con preview
- "Applica template" -> dialog settimana destinazione -> crea turni con origine=TEMPLATE
- Utile per "Settimana standard", "Settimana estate", "Settimana festivi"

**Commit:** `./push.sh "turni v2 fase 10: template settimana ricorrenti"`

### Fase 11 (futuro) — Integrazione M.A Notifiche e M.B PDF
*Obiettivo:* notifiche automatiche e PDF brand.
*Dimensione:* piccola (dipende dai mattoni).
*Rischio:* basso.

- Quando Marco pubblica la settimana (nuovo bottone "Pubblica"), M.A Notifiche crea una notifica per ogni dipendente
- PDF brand con logo TRGB + palette brand
- WhatsApp via M.C: bottone "Invia via WA" accanto al turno -> messaggio preformattato con il turno del dipendente

---

## 6. Ordine suggerito e stop points

Se dobbiamo spezzare: **Fasi 0 + 1 + 2 + 3 + 4** coprono gia' l'80% del valore
per Marco (click rapido, totali, copia settimana, assenze). Le fasi 5-11 sono
miglioramenti progressivi che possono aspettare.

| Ordine | Fase | Se fermiamo qui lo stato e' |
|--------|------|------------------------------|
| 1 | Fase 0 | DB pronto, UI invariata (safe rollback) |
| 2 | Fase 1 | Creazione 5x piu' veloce, zero rischio cancellazioni |
| 3 | Fase 2 | Visibilita' ore e copertura |
| 4 | Fase 3 | Composizione settimana in 10 secondi |
| 5 | Fase 5 | Vista mensile vera |
| 6 | Fase 9 | Usabile su iPad |
| 7 | Fase 8 | Stampabile |
| 8 | Fase 6 | Vista per dipendente |
| 9 | Fase 7 | Avvisi conflitti |
| 10 | Fase 10 | Template ricorrenti |
| 11 | Fase 11 | Integrazione mattoni |
| — | Fase 4 | RIMOSSA → assenze nel modulo Presenze v2.3 |

---

## 7. Decisioni da prendere PRIMA di iniziare

Queste scelte determinano forma del codice. Rispondere con mockup di supporto
(`docs/mockups/turni_v2_mockup.html`):

1. **Popover vs Modal vs Bottom sheet** per creazione/edit turno?
   - A. Popover inline sulla cella (desktop) + bottom sheet (mobile)
   - B. Modal centrato sempre (piu' semplice, meno elegante)
   - C. Sidebar destra persistente che si aggiorna al click cella

2. **Vista mensile: stile?**
   - A. Calendario Google-like con badge iniziali dipendente (una riga per settimana)
   - B. Heatmap dipendenti x giorni (righe = dipendenti, colonne = giorni del mese)
   - C. Entrambe con toggle

3. **Totali ore: dove?**
   - A. Colonna destra fissa nella griglia (sempre visibile)
   - B. Pannello laterale toggle-able
   - C. Riga in fondo (come excel)

4. **Copertura: dove?**
   - A. Riga in fondo sotto la griglia (sempre visibile, toggle on/off)
   - B. Bar orizzontali colorati in testa a ogni colonna giorno
   - C. Tabella separata sotto la griglia

5. **Assenze: rappresentazione grafica**
   - A. Blocco a tutta cella con emoji + testo grande (es. "🏖️ FERIE")
   - B. Strip diagonale colorato sopra la cella
   - C. Cella neutra con piccolo badge in alto

6. **Prima fase da attaccare**: partiamo dalla Fase 0 sequenziale (consigliato) o preferisci che prepari PR multi-fase?
