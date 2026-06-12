# A2 supplemento — PRAGMA eseguiti dall'orchestratore (2026-06-12)

> Il subagente A2 non poteva eseguire sqlite3. L'orchestratore ha copiato i 10 DB in /tmp/audit_db_orch/
> (copie poi cancellate), aperti in modalità `immutable=1` (zero scritture, zero -wal/-shm creati).

## PRAGMA integrity_check — 10/10 DB: **ok** ✅
admin_finance, bevande, clienti, dipendenti, notifiche, tasks, vini, vini_magazzino, vini_settings, foodcost: tutti `ok`.

## PRAGMA foreign_key_check — violazioni in 2 DB su 10

### foodcost.db — 1.305 violazioni
| Tabella figlia | Parent mancante | Righe |
|---|---|---|
| `ipratico_product_map` | `vini_magazzino` | **1.240** |
| `cg_entrate` | `banca_movimenti` | **65** |

- Le 1.240 di `ipratico_product_map` puntano alla tabella zombie `vini_magazzino` (ricreata VUOTA a ogni boot post-cutover mig 133 — collegata al finding A2-02): la mappa iPratico→vini referenzia id che non esistono più nella tabella vuota (i dati vivi sono in `vini_bottiglie` di vini_magazzino.sqlite3).
- Le 65 di `cg_entrate` → `banca_movimenti`: incassi CG che puntano a movimenti banca cancellati/reimportati (conferma il rischio orfani segnalato in A2-04; FK non enforced ⇒ nessun errore runtime, ma i JOIN perdono righe silenziosamente).

### vini_magazzino.sqlite3 — 57 violazioni
| Tabella figlia | Parent mancante | Righe |
|---|---|---|
| `vini_magazzino_movimenti` | `vini_magazzino_legacy_20260518` | 28 |
| `vini_prezzi_storico` | `vini_magazzino_legacy_20260518` | 28 |
| `matrice_celle` | `vini_magazzino_legacy_20260518` | 1 |

FK dichiarate verso la tabella archivio legacy del cutover 18/05 — residuo del rename, da bonificare in una migrazione di pulizia FK.

## Numeri di supporto
- `fe_righe`: **11.392 righe**, `fe_fatture`: 1.573. **Zero indici** su `fe_righe` (`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fe_righe'` → vuoto) → conferma definitiva A7-02.
- `daily_closures`: 2.191 righe (max date 2026-12-31 — include calendario futuro), `shift_closures`: 168 (max 2026-06-08) → conferma A2-05/K.12: entrambe vive.
- Copie locali datate 2026-06-08 23:28 (ultimo push); sul VPS live (raw_A6_live.md) backup status 15/15 OK e LKG odierno sano.
