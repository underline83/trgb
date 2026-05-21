# Modulo Fatture in Cloud (FIC) — TRGB Gestionale

**Creato:** 2026-05-19 (audit autonomo — gap CRIT-1)
**Stato doc:** STUB strutturato. Da estendere in sessione docs dedicata.
**Modulo tecnico:** sub-modulo di `acquisti` (per `core/moduli/<id>/module.json`)
**Backend prefix:** `/contabilita/fic/*` (verificare in router)
**Doc collegato:** `docs/modulo_acquisti.md` (modulo padre), `docs/modulo_fatture_xml.md` (import SDI)

> Il **conteggio audit dichiarava 12 endpoint** ma la verifica adversarial ha contato **17 endpoint** reali in `app/routers/fattureincloud_router.py`. Conteggio aggiornato a 17.

---

## 1. Cos'è

Integrazione con il servizio **Fatture in Cloud** (https://www.fattureincloud.it/) per sincronizzare:
- Fatture ricevute (passive) dai fornitori → tabella `fe_fatture` come pipeline parallela a quella XML SDI
- Anagrafica fornitori (`fornitori` live in FIC)
- Warning sync (mig 062 / `problemi.md` A1)

L'integrazione è **opzionale**: il modulo Acquisti funziona anche con il solo import XML SDI manuale. FIC è una scorciatoia per chi ha già FIC come fornitore principale di fatture.

---

## 2. I 17 endpoint reali (live in `app/routers/fattureincloud_router.py`)

| # | Metodo | Path (relativo al prefix) | Summary FastAPI | Riga |
|---|--------|---------------------------|-----------------|------|
| 1 | GET | `/status` | Stato connessione Fatture in Cloud | 137 |
| 2 | POST | `/connect` | Salva token e collega azienda | 180 |
| 3 | POST | `/disconnect` | Scollega Fatture in Cloud | 226 |
| 4 | GET | `/sync/count` | Conta veloce fatture da sincronizzare | 467 |
| 5 | GET | `/sync/progress` | Progresso sincronizzazione in corso | 495 |
| 6 | POST | `/sync` | Sincronizza fatture ricevute → fe_fatture | 501 |
| 7 | GET | `/fatture` | Lista fatture ricevute sincronizzate da FIC | 868 |
| 8 | GET | `/sync-log` | Storico sincronizzazioni | 924 |
| 9 | GET | `/warnings` | Lista warning sync FIC | 940 |
| 10 | GET | `/warnings/count` | Conta warning non visti (per badge) | 995 |
| 11 | GET | `/warnings/{warning_id}` | Dettaglio warning + raw payload FIC | 1015 |
| 12 | POST | `/warnings/{warning_id}/visto` | Marca warning come visto | 1040 |
| 13 | POST | `/warnings/{warning_id}/unvisto` | Rimetti warning come non visto | 1069 |
| 14 | GET | `/fornitori` | Lista fornitori da Fatture in Cloud (live) | 1095 |
| 15 | GET | `/debug-detail/{fic_id}` | Debug: dettaglio raw da FIC API | 1133 |
| 16 | POST | `/refetch-righe-xml/{db_id}` | Recupera righe da XML SDI per una fattura | 1328 |
| 17 | POST | `/bulk-refetch-righe-xml` | Recupero massivo righe da XML per fatture FIC senza dettaglio | 1355 |

> Tabella generata dal grep `^@router\.` sul file il 2026-05-19. Da aggiornare se nuovi endpoint o se cambiano firme.

---

## 3. Setup token FIC (admin-only)

**Da estendere in sessione dedicata.** Sintesi attuale:
1. Marco genera un **API token** dall'area sviluppatori del proprio account Fatture in Cloud.
2. UI di Impostazioni → tab FIC → incolla token + ID azienda.
3. Backend chiama `POST /contabilita/fic/connect` con `{ token, company_id }` → salva in tabella settings.
4. `GET /status` verifica connessione attiva.
5. `POST /disconnect` rimuove il token (logout).

**Sicurezza:** il token è secret, salvato in DB. Da considerare se cifrarlo a riposo.

---

## 4. Flusso sync (fatture passive)

**Da estendere in sessione dedicata.** Sintesi attuale:

1. Admin clicca "Sincronizza" in UI → `POST /sync` con `{ data_da, data_a }`.
2. Backend chiama FIC API in due fasi (Lista + Dettaglio) — vedi audit `C-A-028`.
3. Per ogni fattura FIC, dedup su `fe_fatture` (SHA256 XML o ID FIC).
4. Se nuova → insert in `fe_fatture` + `fe_righe`.
5. Se warning (es. fornitore non matchato, IVA strana) → record in `fe_sync_warnings` (mig 062).
6. Frontend mostra contatore warnings nel badge della sezione Fatture.

**Anti-loop**: `sync/progress` esposto per progress bar live. `sync/count` esposto per pre-conteggio veloce prima del sync.

---

## 5. Gestione warnings

**Da estendere in sessione dedicata.** Sintesi attuale:

- `GET /warnings` — lista warning paginata, filtri per stato/data.
- `GET /warnings/{id}` — apre raw payload FIC per debug.
- `POST /warnings/{id}/visto` — marca come "rivisto" (rimosso dal badge).
- `POST /warnings/{id}/unvisto` — undo.

Casi tipici di warning:
- Fornitore FIC non matchato con `fe_fornitori` locali → match manuale richiesto.
- IVA o totale non quadrante → revisione manuale.
- Fattura duplicata (già presente da import XML SDI manuale).

---

## 6. Recovery righe XML

**Da estendere in sessione dedicata.** Sintesi attuale:

FIC ritorna le fatture in JSON, ma le righe dettagliate possono mancare per fatture vecchie. Per ricostruirle, si recuperano da XML SDI (se disponibile) tramite:
- `POST /refetch-righe-xml/{db_id}` — singola fattura.
- `POST /bulk-refetch-righe-xml` — massivo, per fatture FIC senza dettaglio.

---

## 7. Debug e diagnostica

- `GET /debug-detail/{fic_id}` — restituisce raw payload FIC per debug (admin-only). Usato quando una fattura sincronizzata mostra dati strani.
- `GET /sync-log` — storico sincronizzazioni (data, count, durata, esito).

---

## 8. Integrazione con il resto del modulo Acquisti

- Le fatture FIC arrivano nella stessa tabella `fe_fatture` delle XML SDI. Il modulo Acquisti (`docs/modulo_acquisti.md`) le tratta uniformemente.
- Campo `fonte` in `fe_fatture` distingue: `XML_SDI`, `FIC`, `MANUALE`.
- Pipeline matching ingredienti → categoria CG funziona identica indipendentemente dalla fonte.

---

## 9. Roadmap

Voci pendenti da audit:

- Documentare per ogni endpoint i parametri input/output completi (tabella di dettaglio).
- Documentare scenari di recovery (sync fallito, token scaduto, FIC down).
- Documentare config IVA / mapping fornitori automatico.
- Eventuale automation: cron sync giornaliero (oggi è on-demand).

---

## 10. Riferimenti

- Audit canonico capability: `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` (modulo Acquisti — C-A-028 ecc.)
- Gap report origine: `docs/audit-2026-05-19/02_GAP_REPORT.md` CRIT-1
- Verifica conteggio: `docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md` Test 3 (17 endpoint reali, audit ne dichiarava 12)
- Modulo padre: `docs/modulo_acquisti.md`
- Modulo gemello (XML SDI): `docs/modulo_fatture_xml.md`
- Decisione PO Marco: 2026-05-19 (sessione "audit + riallineamento")
