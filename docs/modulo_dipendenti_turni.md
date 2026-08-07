# Modulo Dipendenti — Turni v2.0 (Ripensamento)

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_dipendenti.md](modulo_dipendenti.md), [modulo_intermittenti.md](modulo_intermittenti.md)

**Data piano:** 2026-04-14
**Stato piano:** IMPLEMENTATO — fasi 0-3 e 5-11 completate, Fase 4 rimossa. Questa pagina è nata come piano ("Ripensamento") e conserva le decisioni originali; le divergenze tra piano e codice reale sono annotate nel punto in cui compaiono. Riferimenti rapidi al codice: backend `app/routers/turni_router.py` (prefix **`/turni`**, non `/dipendenti/turni`) + `app/services/turni_service.py`; frontend `frontend/src/pages/dipendenti/FoglioSettimana.jsx` (v1.11) e pagine sorelle.

## Divergenze piano → codice (sintesi, verificata 2026-08-03)

- **`stato='CHIAMATA'` non esiste più**: rinominato **`OPZIONALE`** (mig 073). Gli stati ammessi sono CONFERMATO / OPZIONALE / ANNULLATO. "A chiamata" è diventato un flag del **dipendente** (`dipendenti.a_chiamata` = extra pagato a ore).
- **Assenze**: la decisione "niente assenze in Turni" è stata superata in sessione 39 — FERIE/MALATTIA/PERMESSO si segnano dal Foglio, tabella dedicata `assenze` (mig 083), CRUD `GET/POST /turni/assenze/` + `DELETE /turni/assenze/{id}` + `GET /turni/assenze/tipi`. Nessun tipo turno RIPOSO/ASSENZA seedato (come da decisione). Il modulo Presenze v2.3 resta non fatto.
- **Endpoint reali** con prefix `/turni` e nomi diversi dal piano §3 (tabella reale più sotto).
- **Copertura per giorno/servizio**: MAI implementata (né endpoint né riga nel FE). Dei "totali+copertura" della Fase 2 esiste solo la parte ore nette.
- **Slot**: aggiunta colonna `turni_calendario.slot_index` (mig 072), non prevista dallo schema del piano.
- **Struttura FE**: nessuna cartella `components/turni/` — tutto vive in `pages/dipendenti/` (FoglioSettimana.jsx contiene griglia, dialog copia/template/WA, vista mobile).
- **Soglie semaforo CCNL** 40h/48h: hardcoded in `turni_service.py:778` (e :1019); la UI di configurazione "Soglie CCNL" in Impostazioni Dipendenti è prevista ma non pronta (`ready:false`). Hardcoded anche le fasce del pasto staff che decidono se dedurre la pausa (11:30/12:00 pranzo, 18:30/19:00 cena — costanti `SOGLIA_*` in `turni_service.py:158-161`); configurabili per reparto sono solo i **minuti** di pausa.
- **Vista self-service**: `GET /turni/miei-turni` + pagina `/miei-turni` (`MieiTurni.jsx`) — l'utente loggato vede i propri turni se `users.json` ha il campo `dipendente_id`; non era nel piano.
- **Multi-reparto** (mig 162): vedi sezione in fondo.

## Decisioni prese (2026-04-14)

- **1.A** Popover inline desktop + bottom sheet mobile per creazione/edit
- **2.A** Vista mensile = calendario Google-like (proviamo questa, eventuali alternative dopo)
- **3+4** Totali ore in colonna destra **E** copertura in riga footer (entrambe)
- **Assenze:** NON dentro Turni v2 — passano al modulo Presenze v2.3 dedicato.
  Nessun seed RIPOSO/FERIE/MALATTIA/PERMESSO in Turni.
  Workflow Marco: chi non compare nel foglio = è a casa.
  *(storico, superato in sessione 39: le assenze si segnano dal Foglio, tabella `assenze` — vedi sintesi divergenze in testa)*
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
  *(storico: rinominato `OPZIONALE` con mig 073, ★ nella UI)*
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

**`stato`** resta TEXT libero — accetta `CONFERMATO` (default), `OPZIONALE` (★, turno
tentativo — il nome `CHIAMATA` del piano è stato rinominato con mig 073), `ANNULLATO`.
In più rispetto al piano: **`slot_index INTEGER`** (mig 072) — posizione colonna nel
foglio (0-based), parte della chiave logica reparto+data+servizio+slot.

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

Le chiusure si leggono da `closures_config.json` (modulo Vendite, gestito da
`app/routers/closures_config_router.py`; dal R6.5 il file vive nella cartella
dati del locale `locali/<id>/data/`, via `locale_data_path`). Il service Turni
usa la funzione di comodo:

```python
from app.routers.closures_config_router import get_closures_config
cfg = get_closures_config()
# cfg = {giorno_chiusura_settimanale: 2, giorni_chiusi: [...], turni_chiusi: [...]}
```

(helper reali: `giorni_chiusi_nella_settimana` / `giorni_chiusi_nel_range` in
`turni_service.py:701-722`; il router Turni espone anche `GET /turni/chiusure`).
Il frontend può usare `GET /settings/closures-config/` (JWT). Le celle dei
giorni chiusi appaiono grigie, niente turni assegnabili.

---

## 3. Endpoint backend

> La tabella del piano originale (path `/dipendenti/turni/*`, endpoint `/totali` e `/copertura`,
> payload copia con date e `skip_assenze_destinazione`) è **storica, superata**: il router v2 è
> nato con prefix **`/turni`** e nomi diversi. `/copertura` non è mai stato implementato.

### 3.1 Endpoint reali (`app/routers/turni_router.py`, tutti JWT)

| Metodo | Endpoint | Funzione |
|--------|----------|----------|
| GET | `/turni/foglio?reparto_id=X&settimana=YYYY-Www` | foglio settimana completo (reparto, giorni, dipendenti, turni con conflitti, assenze, chiusure, max slot) |
| POST | `/turni/foglio/assegna` | crea turno in uno slot — body `{reparto_id, dipendente_id, data, servizio, slot_index, ora_inizio?, ora_fine?, stato, note?, turno_tipo_id?}`; se il tipo manca lo trova/crea (`<REPARTO>-<SERVIZIO>`); 409 se slot occupato; risposta con `warnings` + `conflitti_giorno` (Fase 7) |
| PUT | `/turni/foglio/{turno_id}` | modifica (dipendente, orari, stato, note, slot) — anche qui `warnings` in risposta |
| DELETE | `/turni/foglio/{turno_id}` | cancella (hard) |
| GET | `/turni/ore-nette?reparto_id=X&settimana=…` | ore lorde/nette per dipendente nella settimana (il "totali" del piano) |
| POST | `/turni/copia-settimana` | body `{reparto_id, from_settimana: "YYYY-Www", to_settimana: "YYYY-Www", sovrascrivi}` — niente `skip_assenze_destinazione` |
| GET | `/turni/chiusure?settimana=…` | date chiuse nella settimana |
| GET | `/turni/mese?reparto_id=X&anno=&mese=` | vista mensile 6×7 (Fase 5, sola lettura) |
| GET | `/turni/dipendente?dipendente_id=X&settimana_inizio=&num_settimane=1..12` | timeline per dipendente (Fase 6) |
| GET | `/turni/miei-turni?settimana_inizio=&num_settimane=` | come sopra ma per l'utente loggato (risolve `users.json.dipendente_id`; 404 con messaggio chiaro se non collegato) |
| GET | `/turni/conflitti?dipendente_id=X&data=` | check preventivo sovrapposizioni (Fase 7) |
| GET | `/turni/assenze/tipi` · GET/POST `/turni/assenze/` · DELETE `/turni/assenze/{id}` | assenze FERIE/MALATTIA/PERMESSO (sessione 39) |
| GET | `/turni/foglio/pdf?reparto_id=X&settimana=…` | PDF A4 landscape WeasyPrint (Fase 8) |
| GET/POST | `/turni/template` (+ GET/PUT/DELETE `/turni/template/{id}`, POST `/turni/template/{id}/applica`) | template settimana tipo (Fase 10) |
| POST | `/turni/pubblica` · GET | `/turni/riepilogo-dipendenti?reparto_id=&settimana=` — pubblicazione M.A + testi WhatsApp M.C (Fase 11) |

CRUD reparti a parte: router `app/routers/reparti.py`, prefix `/reparti` (GET/POST `/reparti/`, GET/PUT/DELETE `/reparti/{id}` — soft delete bloccato se il reparto ha dipendenti attivi).

Restano attivi gli endpoint v1 (`/dipendenti/turni/tipi`, `/dipendenti/turni/calendario` CRUD in `app/routers/dipendenti.py`), usati dalla pagina legacy `/dipendenti/turni-legacy`.

---

## 4. Frontend — struttura

> **(storico, superato)** — la struttura reale NON usa `components/turni/` (la cartella non esiste)
> né il refactor di `DipendentiTurni.jsx` (che è rimasto com'era, raggiungibile su
> `/dipendenti/turni-legacy`). Le pagine reali sono tutte in `frontend/src/pages/dipendenti/`:
> - **`FoglioSettimana.jsx`** (v1.11) — route `/dipendenti/turni`. Contiene tutto: griglia, popover
>   assegna/edit, dialog Copia settimana, DialogTemplate, DialogInviaWA, vista immagine, vista giorno
>   mobile (`useIsNarrow`), gestione assenze, toast conflitti.
> - **`VistaMensile.jsx`** — route `/dipendenti/turni/mese` (Fase 5)
> - **`PerDipendente.jsx`** (v1.4.1) — route `/dipendenti/turni/dipendente` (Fase 6)
> - **`MieiTurni.jsx`** (v1.4) — route `/miei-turni` (self-service)
> - **`GestioneReparti.jsx`** — route `/dipendenti/reparti`
>
> Il piano qui sotto resta come riferimento delle idee originali.

File principale (piano): `frontend/src/pages/dipendenti/DipendentiTurni.jsx` (refactor).
Sotto-componenti previsti in `frontend/src/components/turni/`:

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

### Fase 0 — Fondamenta ✅ COMPLETATA (mig 071 + 072; seed assenze NON fatto per decisione successiva)
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
  pause = pausa_pranzo_min/60  se turno PRANZO copre il pasto staff
                                (inizio < 11:30 E fine > 12:00)
        + pausa_cena_min/60    se turno CENA copre il pasto staff
                                (inizio < 18:30 E fine > 19:00)
  ore_nette = ore_lorde - pause
  ```
  Pause prese da `reparti.pausa_pranzo_min/pausa_cena_min` (default 30/30).
  La pausa è dedotta SOLO se il turno copre l'intera fascia del pasto
  staff: chi entra alle 12:00 / 19:00 arriva già mangiato, chi esce
  alle 11:30 / 18:30 esce prima del pasto. Esempio: turno P 09:00–11:30
  → niente pausa pranzo (esce prima del pasto staff). Configurabile in
  futuro per dipendente, oggi solo per reparto.
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

### Fase 6 — Vista per dipendente ✅ COMPLETATA (sessione 38)
*Obiettivo:* "quando lavoro il prossimo mese?" a colpo d'occhio.

**Backend — `turni_service.build_vista_dipendente` + `GET /turni/dipendente`:**
- Service calcola per N settimane (1..12, default 4) una timeline completa per 1 dipendente, con turni raggruppati per data, ore lorde+nette giornaliere (riusa `calcola_ore_nette_giorno` con pause staff deducibili solo se il turno copre la fascia del pasto staff: pranzo inizio<11:30 ∧ fine>12:00, cena inizio<18:30 ∧ fine>19:00), totali periodo (ore, giorni lavorati, riposi = giorni non chiusi senza turni, chiusure, opzionali), semaforo CCNL per settimana.
- Endpoint `GET /turni/dipendente?dipendente_id=X&settimana_inizio=YYYY-Www&num_settimane=4` (JWT). Default settimana = corrente.
- Payload include anche dipendente+reparto (colore, ruolo, nome reparto, pause staff) per auto-coerenza del FE.

**Frontend — `pages/dipendenti/PerDipendente.jsx` (v1.0-vista-per-dipendente, ~490 righe):**
- Tab reparti + pill dipendenti del reparto (filtraggio FE da `allDipendenti` attivi, sort cognome+nome)
- Navigator settimana inizio ← Oggi → scorre di N settimane alla volta; select 4/8/12 settimane
- Totali periodo in testa: ore lorde, ore nette (accent brand-blue), giorni lavorati, riposi, chiusure, opzionali
- Card settimana: ISO + range date + badge semaforo CCNL colorato + contatori, pulsante "✏️ Apri settimana" che fa deep-link al Foglio Settimana (via `turni_last_settimana` in localStorage)
- Griglia 7 colonne desktop, card-stack mobile (`grid-cols-1 md:grid-cols-7`)
- Blocchi turno con colore dipendente/turno-tipo, ☀️/🌙 per PRANZO/CENA, ★ opzionale, line-through + opacity annullato
- Persistenza: `turni_last_reparto` (condiviso), `turni_last_dipendente`, `turni_perdip_settimana`, `turni_perdip_n`

**Aggiornamento 2026-07-10 — opzione "Mese intero" (v1.4-vista-mese) `[core]`:**
- Il select periodo diventa 4 / 8 / 12 settimane / **Mese intero**. In modo mese: select Mese+Anno (anno corrente ±2), frecce ◀▶ scorrono di ±1 mese di calendario, "Oggi" torna al mese corrente.
- Il backend resta invariato: il FE calcola `settimana_inizio` = settimana ISO che contiene il 1° del mese e `num_settimane` = settimane ISO che intersecano il mese (4–6, verificato su tutti i mesi 2024–2027 incl. cavallo d'anno, es. Gen 2027 → 2026-W53).
- Persistenza aggiuntiva: `turni_perdip_modo` ("settimane"|"mese"), `turni_perdip_mese` ("YYYY-MM").
- **v1.4.1 — totali sul mese esatto**: i totali BE coprono l'intero range di settimane; in modo mese il FE li ricalcola sui soli giorni del mese (`totaliMese` useMemo, somme additive sui per-giorno del payload, stessa definizione BE di lavorato/riposo). Giorni fuori mese attenuati (opacity-40 + tooltip) e header totali "(totali del solo mese)". Semaforo CCNL invariato (settimanale per natura).
- Fix collegato in `MieiTurni.jsx` (v1.4-mese-vero): i bottoni "⏪ mese / mese ⏩" prima spostavano di ±4 settimane (derapando dai mesi reali); ora saltano al mese di calendario precedente/successivo (riferimento = mese del giovedì della settimana corrente, regola ISO) impostando `num_settimane` per coprire il mese intero. Validazione `turni_mieituri_n` allargata a 1..12.

**Link/navigazione:**
- Pulsante **👤 Per dipendente** nell'header del `FoglioSettimana.jsx` (accanto a 🗓 Mese)
- Route `/dipendenti/turni/dipendente` in `App.jsx` protetta dal modulo `dipendenti`

**Commit:** `./push.sh "turni v2 fase 6: vista per dipendente - timeline 4/8/12 settimane con totali + deep-link"`

### Fase 7 — Controllo conflitti ✅ COMPLETATA (sessione 38)
*Obiettivo:* avvisare (non bloccare) su sovrapposizioni orarie.
*Dimensione:* piccola.
*Rischio:* basso.

**Backend — `turni_service.py` + `turni_router.py`:**
- Helper `_minuti_start_end(ora_inizio, ora_fine)` → converte HH:MM in (start_min, end_min) con gestione midnight crossing (00:00 fine = 1440; end<start → +1440)
- Helper `_overlap_minuti(a_s, a_e, b_s, b_e)` → minuti di sovrapposizione, 0 se nessuna
- `calcola_conflitti_dipendente_giorno(turni)` → pairwise symmetric: per ogni coppia di turni dello stesso dipendente stesso giorno, se overlap>0 genera warning per entrambi. Ignora ANNULLATO (OPZIONALE invece genera warning). Output: `{turno_id: [{other_id, overlap_min, other_ora_inizio, other_ora_fine, other_servizio, other_stato, other_turno_nome}]}`
- `calcola_conflitti_su_turni(turni)` → versione batch: raggruppa per `(dipendente_id, data)` e applica helper
- `carica_conflitti_dipendente_giorno(dipendente_id, data_iso)` → DB-loading: carica tutti i turni del dipendente quel giorno e ritorna la lista arricchita per il nuovo endpoint
- `build_foglio_settimana` arricchito: ogni turno ha `has_conflict: bool`, `conflict_with_ids: int[]`, `conflicts: []` (payload completo per tooltip)
- POST `/foglio/assegna` e PUT `/foglio/{turno_id}`: risposta include `warnings` (warnings del turno appena creato/modificato) e `conflitti_giorno` (situazione completa del giorno). Nessun errore HTTP, il turno si salva comunque
- Nuovo endpoint `GET /turni/conflitti?dipendente_id=X&data=YYYY-MM-DD` (JWT) per controllo preventivo

**Frontend — `FoglioSettimana.jsx`:**
- `SlotCell` legge `turno.has_conflict` → aggiunge ring `ring-2 ring-amber-400 ring-inset` sulla cella
- Badge ⚠ circolare amber in `absolute -top-1 -left-1` (chip 16×16 text-[10px] font-bold)
- Tooltip (title attribute) costruito multi-line: "Sovrapposizione con:\n• CENA Nome 19:00-23:00 (1h 30m in comune)"
- Dopo save (create o update): se `response.warnings.length > 0` mostra **toast amber** in alto a destra con titolo "⚠️ Sovrapposizione oraria" + lista sovrapposizioni, auto-dismiss 7s, bottone × per chiudere
- Stato locale `toast: {titolo, messaggio}` + `useEffect` con setTimeout

**Commit:** `./push.sh "turni v2 fase 7: warning conflitti orari (badge ⚠ + toast conferma)"`

### Fase 8 — Stampa / Export ✅ COMPLETATA (sessione 38)
*Obiettivo:* PDF server-side della settimana + vista immagine da girare allo staff su WhatsApp.
*Dimensione:* media.
*Rischio:* basso.

**Backend — `turni_router.py` + WeasyPrint:**
- Nuovo endpoint `GET /turni/foglio/pdf?reparto_id=X&settimana=YYYY-Www` (JWT)
- Riusa `build_foglio_settimana` + `giorni_chiusi_nella_settimana`
- Template HTML inline (CSS @page A4 landscape, 10mm margini) + WeasyPrint → `StreamingResponse(application/pdf, inline)`
- Celle colorate per dipendente con contrasto auto (funzione `_text_on`), stato OPZIONALE → prefix ★, ANNULLATO → opacity .4
- Header: 🍷 Osteria Tre Gobbi — Turni settimana DD/MM–DD/MM/AAAA — pill colorata reparto *(da R5 il nome non è più hardcoded: viene da `strings.json` del locale, chiave `pdf.org_name`, fallback "TRGB" — `turni_router.py:776`)*
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

### Fase 10 — Template settimana tipo ✅ COMPLETATA (sessione 38)
*Obiettivo:* salvare pattern ricorrenti e applicarli.
*Dimensione:* media.
*Rischio:* medio.

**Migrazione — `077_turni_template_v2.py`:**
- Le tabelle `turni_template` e `turni_template_righe` esistevano già da 071 con schema minimale. Estese con i campi servi al Foglio v2:
  - `turni_template.reparto_id` → template è per reparto specifico
  - `turni_template_righe`: `servizio`, `slot_index`, `ora_inizio`, `ora_fine`, `stato`
- Indici: `idx_turni_template_reparto`, `idx_tmpl_righe_giorno`
- Idempotente (check PRAGMA table_info prima di ogni ALTER)

**Backend — `turni_service.py`:**
- `lista_templates(reparto_id)` → lista template attivi con `n_righe` e `n_dipendenti` per preview
- `get_template_dettaglio(template_id)` → template + tutte le righe join su dipendenti/turni_tipi
- `crea_template_da_settimana(reparto_id, settimana_iso, nome, descrizione)` → snapshot: tutti i turni LAVORO del reparto non-ANNULLATI diventano righe con `giorno_settimana` (0=lun..6=dom) al posto della data
- `rinomina_template(template_id, nome, descrizione)` → aggiorna metadata + updated_at
- `elimina_template(template_id)` → **soft-delete** (attivo=0), le righe restano per audit
- `applica_template(template_id, settimana_iso, sovrascrivi)` → crea turni_calendario con `origine='TEMPLATE'`, `origine_ref_id=template_id`. Salta giorni chiusi + dipendenti non attivi. Ritorna `{creati, cancellati, saltati_chiusure, saltati_inattivi}`

**Backend — `turni_router.py`:**
- `GET /turni/template?reparto_id=X` (JWT) — lista
- `GET /turni/template/{id}` — dettaglio
- `POST /turni/template` body `{reparto_id, settimana_sorgente, nome, descrizione}` — crea
- `PUT /turni/template/{id}` body `{nome?, descrizione?}` — rinomina/aggiorna
- `DELETE /turni/template/{id}` — soft-delete
- `POST /turni/template/{id}/applica` body `{settimana_destinazione, sovrascrivi}` — applica

**Frontend — `FoglioSettimana.jsx`:**
- Nuovo pulsante **📑 Template** nell'header (accanto a 📋 Copia)
- Nuovo state `dlgTemplate` → apre `<DialogTemplate>` modale
- `DialogTemplate` ha **3 modalità in un solo modale**:
  1. **📋 Lista**: carica i template del reparto, ogni card mostra nome, descrizione, `n_righe`, `n_dipendenti`, data aggiornamento. Pulsanti `Applica →`, `✏️` (rinomina via prompt), `🗑` (soft-delete con conferma)
  2. **➕ Salva settimana come template**: input nome (obbligatorio) + textarea descrizione, snapshot della settimana corrente visualizzata nel Foglio
  3. **Applica** (sub-vista della Lista): select settimana destinazione ±4→+12 settimane, checkbox sovrascrivi, bottone Applica → alert riassuntivo con conteggi (creati/cancellati/saltati_chiusure/saltati_inattivi)
- Dopo applica: se `settimana_destinazione === settimana corrente` → `caricaFoglio()`; altrimenti `setSettimana(settimana_destinazione)` per saltarci

**Use cases:**
- "Settimana standard sala" → salvato una volta, applicato ogni settimana con 1 click + aggiustamenti
- "Settimana estate" → pattern con più turni cena (riusato da giugno a settembre)
- "Settimana festivi" → pattern ridotto per Natale/Pasqua/ferragosto

**Commit:** `./push.sh "turni v2 fase 10: template settimana tipo (salva/applica pattern ricorrenti)"`

### Fase 11 — Integrazione mattoni (parziale: M.A + M.C) ✅ COMPLETATA (sessione 38)
*Obiettivo:* pubblicazione settimana + invio riepilogo WhatsApp ai dipendenti.
*Stato:* M.A ✅ + M.C ✅ — M.B (PDF brand turni) e M.D (email) rinviati al backlog.
*Rischio:* basso (wrap try/except su crea_notifica → M.A down non rompe pubblicazione).

**Backend — `turni_service.py`**:
- `pubblica_settimana(reparto_id, settimana_iso)` → calcola stats (turni, dipendenti, giorni coperti) e chiama `crea_notifica(tipo="turni", dest_ruolo="admin", link=/dipendenti/turni?reparto_id=X&settimana=Y)`. La notifica va al ruolo admin (i dipendenti non hanno username nel sistema, ricevono i turni via WA). Fallback silenzioso se M.A fallisce.
- `riepilogo_settimana_per_dipendenti(reparto_id, settimana_iso)` → per ogni dipendente attivo con turni non-ANNULLATI compone `testo_wa` pronto: "Ciao {nome}, ecco i tuoi turni {reparto} della settimana {range_human}:\n• Lun 14/04: ☀️ 12:00-15:00 + 🌙 19:00-23:00". Emoji ☀️ PRANZO / 🌙 CENA, suffisso "(opzionale)" su stato OPZIONALE. Il templating sta in backend: il frontend riceve il testo pronto e passa a `openWhatsApp()`.

**Backend — `turni_router.py`**:
- `POST /turni/pubblica` body `{reparto_id, settimana}`.
- `GET /turni/riepilogo-dipendenti?reparto_id=X&settimana=YYYY-Www`.

**Frontend — `FoglioSettimana.jsx`**:
- Pulsante **📢 Pubblica** (verde brand-green) → confirm nativo + POST + toast success.
- Pulsante **📤 Invia WA** (bianco border) → apre `DialogInviaWA`.
- Componente **`DialogInviaWA`**: lista dipendenti con bottone 📤 Invia per ciascuno. Disabilitato per chi non ha telefono o non ha turni. Tracker `sent: Set<id>` → badge ✓ "aperto" + label "Riapri WA" dopo primo click. Usa `openWhatsApp(tel, testo_wa)` dal mattone M.C.

**Commit:** `./push.sh "turni v2 fase 11 (parziale): integrazione M.A notifiche + M.C whatsapp"`

### Fase 11 — TODO residui (da fare quando i mattoni saranno pronti)
- **M.B PDF brand per turni**: attualmente `scaricaPdf()` in `FoglioSettimana` usa WeasyPrint diretto (Fase 8). Quando il mattone M.B supporterà i layout multi-reparto/multi-settimana, migrare a `genera_pdf_html()` con template brandizzato coerente con preventivi/ricette.
- **M.D Email**: bottone 📧 Invia Email parallelo a 📤 Invia WA per chi non usa WhatsApp. Riuso di `riepilogo_settimana_per_dipendenti` (il `testo_wa` diventa `testo_email`).

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


## Multi-reparto (mig 162, 2026-08-03)

`dipendenti.reparto_id` e' il reparto **principale**; `dipendenti_reparti` tiene quelli **in piu'**
(non duplica il principale). Chi ha reparti aggiuntivi compare nel foglio settimana di ognuno.

**Un turno appartiene al foglio del reparto del suo TIPO**, non della persona: i tipi turno portano
il reparto in `turni_tipi.ruolo`, che combacia con `reparti.codice`. Le condizioni stanno in tre
costanti SQL in cima a `turni_service.py` (`SQL_DIP_DEL_REPARTO` :43, `SQL_DIP_D_DEL_REPARTO` :50,
`SQL_TURNO_DEL_REPARTO` :62), applicate a tutte le query del **service** che filtravano per
`d.reparto_id`.

**Chiuso il 2026-08-07** il limite aperto il 2026-08-03: le validazioni inline di `turni_router.py`
guardavano solo `dipendenti.reparto_id`, quindi chi aveva il reparto del foglio fra gli AGGIUNTIVI
compariva nel foglio ma non era assegnabile da lì (400 "Dipendente non appartiene a questo reparto").
Ora i tre punti di scrittura passano dalle costanti/helper multi-reparto del service:

- `POST /turni/foglio/assegna` → `turni_service.dipendente_in_reparto()`
- `PUT /turni/foglio/{id}` (cambio dipendente) → stesso helper
- check "slot già occupato" in `assegna` → `SQL_DIP_D_DEL_REPARTO` + `SQL_TURNO_DEL_REPARTO`,
  cioè gli stessi criteri con cui il foglio decide cosa mostrare (prima guardava solo
  `d.reparto_id`: due turni sullo stesso slot potevano coesistere senza conflitto).

**Regola:** chi scrive turni non confronta `dipendenti.reparto_id` a mano — usa
`dipendente_in_reparto(conn, dipendente_id, reparto_id)` (`turni_service.py`).

Rete di sicurezza per la retrocompatibilita': se il tipo del turno non appartiene a nessun **altro**
reparto della persona, il turno resta dove stava. Chi ha un solo reparto non perde niente dal foglio.

Le pause staff (`pausa_pranzo_min`, `pausa_cena_min`) sono sempre quelle del reparto **del foglio**:
chi lavora in due reparti ha le ore nette calcolate con le pause giuste in ciascuno.
