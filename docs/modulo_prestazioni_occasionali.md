# Modulo Prestazioni Occasionali (PrestO / Libretto Famiglia INPS)

**Stato:** Blocco 1 completato (backend + anagrafica). Blocchi 2-3 pianificati.
**Normativa:** art. 54-bis DL 50/2017.
**Feature flag:** `FEATURE_OCCASIONALI` (env backend). Default = `0`.

---

## Perché
Marco ha bisogno di gestire nel gestionale collaboratori assunti come **prestazione occasionale** (tipicamente extra stagionali, aiuto cucina saltuario). La gestione in nero NON è percorribile. La prestazione occasionale INPS è il canale legale equivalente per lavoro orario senza contratto fisso.

Differenze rispetto al dipendente CCNL:
- NIENTE contratto 40h, NIENTE busta paga, NIENTE TFR.
- Pagamento tramite portale INPS (**PrestO** per aziende, **Libretto Famiglia** per famiglie).
- Comunicazione preventiva obbligatoria (almeno 1 ora prima dell'inizio della prestazione).
- **Soglie fiscali 2026** (superate = contratto obbligatorio):
  - €2.500/anno stesso committente-prestatore.
  - €10.000/anno totale committente (tutti i prestatori sommati).
  - 280 ore/anno stesso prestatore-committente.

---

## Schema DB

### `dipendenti.forma_rapporto` (nuova colonna — migrazione 074)
Valori ammessi:
- `DIPENDENTE` (default) — CCNL Turismo, busta paga.
- `OCCASIONALE` — PrestO / Libretto Famiglia.
- `COLLABORATORE` — P.IVA.
- `STAGISTA` — tirocinio.

> ⚠ NON confondere con `dipendenti.tipo_rapporto`, che è un campo pre-esistente occupato dai valori LUL "indeterminato"/"determinato".

### Tabella `prestazioni_occasionali_log`
```sql
id INTEGER PK
dipendente_id INTEGER FK → dipendenti(id)
data_prestazione TEXT (YYYY-MM-DD)
ore REAL
importo_lordo REAL
importo_netto REAL  -- dopo trattenute INPS/INAIL
canale TEXT         -- 'PRESTO' | 'LIBRETTO_FAMIGLIA'
ricevuta_numero TEXT
ricevuta_data TEXT
uscita_contanti_id INTEGER  -- FK opzionale a admin_finance.cash_expenses (v. Blocco 3)
note TEXT
stato TEXT          -- 'REGISTRATO' | 'ANNULLATO' (soft-delete)
created_at, updated_at
```

---

## API

Prefix: `/occasionali`. Tutti richiedono JWT. Se `FEATURE_OCCASIONALI=0` rispondono **404** (tranne `/flag`).

| Method | Path | Descrizione |
|---|---|---|
| GET | `/occasionali/flag` | Stato feature flag + soglie. Sempre disponibile. |
| GET | `/occasionali/riepilogo?anno=YYYY` | Riepilogo YTD per prestatore: ore, importo, % soglie, semaforo, fonte (ricevute/turni_pianificati/nessun_dato). Include blocco `totale_committente` vs €10.000. |
| GET | `/occasionali/{dipendente_id}/ricevute?anno=YYYY` | Storico ricevute PrestO/LF (`anno` opzionale). |
| POST | `/occasionali/ricevute` | Registra ricevuta. Valida che il dipendente sia `forma_rapporto='OCCASIONALE'`. |
| DELETE | `/occasionali/ricevute/{id}` | Soft-delete (`stato='ANNULLATO'`). |

### Semaforo soglie
- `< 70%` → `verde`
- `70–90%` → `giallo`
- `≥ 90%` → `rosso`

Alert NON bloccante (decisione Marco sessione 37): avvisa ma non impedisce l'inserimento.

### Fonte importo nel riepilogo
Per ogni prestatore il router cerca i dati in questo ordine:
1. **`ricevute`** → somma da `prestazioni_occasionali_log` (fonte ufficiale).
2. **`turni_pianificati`** → ore da `turni_calendario` × `dipendenti.costo_orario` (stima pre-pagamento).
3. **`nessun_dato`** → prestatore registrato ma nessuna attività.

---

## Feature flag

Backend: env var `FEATURE_OCCASIONALI=0|1` letta in `occasionali_router.py`.

```
# .env
FEATURE_OCCASIONALI=1
OCC_SOGLIA_EURO_PRESTATORE=2500
OCC_SOGLIA_EURO_COMMITTENTE=10000
OCC_SOGLIA_ORE_PRESTATORE=280
```

Frontend: non c'è `VITE_FEATURE_OCCASIONALI`. Il FE legge sempre a runtime `/occasionali/flag` e nasconde l'UI in base alla risposta — così flag ON/OFF è controllato da un unico punto.

---

## Roadmap

### ✅ Blocco 1 — Sessione 37 (2026-04-14)
- Migrazione 074 + schema `forma_rapporto` + tabella `prestazioni_occasionali_log`.
- Router `/occasionali/*` completo (5 endpoint).
- `DipendentiAnagrafica.jsx` v2.3: select forma rapporto + campo costo_orario + badge OCC in sidebar, dietro flag.
- Feature flag infrastruttura.

### 🟠 Blocco 2 — prossima sessione
- `FoglioSettimana.jsx`: badge OCC sui pill dipendenti occasionali; contatore YTD (ore/euro + semaforo) accanto al nome; alert quando si supera 90% soglia.

### 🟠 Blocco 3 — sessione successiva
- Pagina dedicata `PrestazioniOccasionali.jsx`: riepilogo vs soglie + form registrazione ricevute + storico.
- Integrazione con tab **Contanti** (`admin_finance.cash_expenses`): al momento del pagamento cash, link automatico a `prestazioni_occasionali_log.uscita_contanti_id`.
- Widget su pagina Statistiche: totale occasionali YTD vs €10.000 committente.

---

## Note operative per Marco
- Finché `FEATURE_OCCASIONALI=0` sul VPS: zero impatto visibile. Router risponde 404, UI invariata.
- Per testare: `FEATURE_OCCASIONALI=1` nel `.env` locale + `uvicorn` backend. Ogni dipendente può essere marcato OCCASIONALE in anagrafica con compenso orario.
- Le **ricevute PrestO** vanno ancora registrate manualmente sul portale INPS; il gestionale registra solo il **log interno** per tracciatura e controllo soglie.
- Il pagamento cash al prestatore sarà gestito dal tab **Contanti** (Blocco 3): uscita contanti → genera automaticamente riga in `prestazioni_occasionali_log`.
