# TRGB — Inventario pulizia

> **Cosa**: lista viva di codice morto, file orfani, worktree abbandonati, backup forensi, deprecati.
>
> **Quando lavorare qui**: a tornata, in un push dedicato "cleanup batch" (1 ogni 1-2 mesi).
>
> **Mantenuto da**: il modulo guardiano. Voci aggiunte quando si scopre qualcosa, rimosse quando ripulite.
>
> **Creato**: 2026-04-25 (sessione 57 cont.)

---

## TODO push immediato (sessione 57 cont.)

Il workspace Cowork ha mount FUSE read-only sui `rm`/`rmdir`. **Marco esegue questi comandi a mano dal terminale Mac PRIMA di lanciare `push.sh`**:

```bash
cd /Users/underline83/trgb

# 1. File DB orfano (0 byte, residuo init vecchio)
rm app/data/dipendenti.db

# 2. Worktree git abbandonato (.claude/worktrees/livelli-cucina, ~500MB)
rm -rf .claude/worktrees/livelli-cucina
git worktree prune --verbose
git worktree list   # verifica che resti solo /Users/underline83/trgb [main]

# 3. Router morti (non importati da main.py — sostituiti da foodcost_ingredients_router e vini_settings_router)
rm app/routers/ingredients_router.py
rm app/routers/settings_router.py
```

Dopo questo cleanup, push: `./push.sh "cleanup S57: PIN admin random + L1 guardiano + rimozione codice morto + nuovi docs pattern/inventario/controllo_design"`

---

## TODO da gestire più avanti

### `run_server.py` (root) — script bash legacy
- File: `/Users/underline83/trgb/run_server.py` (3KB).
- È uno **script bash** (nonostante l'estensione `.py`!) con header `#!/bin/bash`.
- Hardcoded path `PROJECT_DIR="/Volumes/Underline/trgb_web"` → riferisce un volume esterno che non esiste più.
- Marco non ricorda se è ancora usato. Probabilmente legacy, candidato per cancellazione.
- **Decisione pendente**.

### `update_vps.sh` (root) — referenzia script gitignored
- Usa `run_server_vps.sh` e `run_frontend_vps.sh` che sono in `.gitignore` come "LEGACY/JUNK".
- Gli script attuali in produzione sono `tools/run/run_backend_prod.sh` e `tools/run/run_frontend_prod.sh`.
- Marco non ricorda se viene mai usato. Da chiarire prima di toccarlo.
- **Decisione pendente**.

### Backup forensi corruzioni VPS (post-S52-1 chiuso)
S52-1 declassato a chiuso post 4 giorni di osservazione stabile (2026-04-25). Sul VPS in `/home/marco/trgb/trgb/app/data/` restano:
- `vini_magazzino.BACKUP-20260420-223719.sqlite3`
- `vini_magazzino.CORROTTO-20260420-224312.sqlite3`
- `vini_magazzino.CORROTTO-2.20260420-230727.sqlite3`
- `vini_magazzino.CORROTTO-3-003218.sqlite3`
- `vini_magazzino.CORROTTO-4-*.sqlite3`
- `vini_magazzino.CORROTTO-5-20260421-*.sqlite3`
- `vini_magazzino.FORENSE-2251.sqlite3`

**Comando proposto** (Marco, da terminale Mac):
```bash
ssh trgb "
  mkdir -p /home/marco/trgb/forensics
  mv /home/marco/trgb/trgb/app/data/vini_magazzino.{BACKUP,CORROTTO,FORENSE}*.sqlite3 \
     /home/marco/trgb/forensics/ 2>/dev/null || true
  ls -lh /home/marco/trgb/forensics/
"
```

---

## TODO Wave WAL mode 1.11.2

Roadmap 1.11.2: estendere PRAGMA WAL agli altri DB SQLite. Coverage attuale e da fare:

| DB | Modulo | WAL applicato? | Note |
|---|---|---|---|
| `vini_magazzino.sqlite3` | vini cantina | ✅ | sessione 51 |
| `notifiche.sqlite3` | M.A | ✅ | sessione 51 |
| `foodcost.db` | ricette/fatture | ✅ | sessione 51 |
| `vini.sqlite3` | vini base + carta | ✅ | core/database.py sessione 52 |
| `vini_settings.sqlite3` | ordinamento carta | ✅ | core/database.py sessione 52 |
| `bevande.sqlite3` | carta bevande | ⏳ | bevande_db.py |
| `clienti.sqlite3` | CRM, prenotazioni | ⏳ | clienti_db.py |
| `tasks.sqlite3` | task manager | ⏳ | tasks_db.py |
| `settings.sqlite3` | impostazioni | ⏳ | settings_db.py (occhio: settings_db diverso da settings_router morto!) |
| `dipendenti.sqlite3` | personale + turni | ⏳ | dipendenti_db.py |
| `admin_finance.sqlite3` | vendite + chiusure | ⏳ | admin_finance_db.py |

**Pattern da applicare** (vedi `docs/architettura_pattern.md` §2):
```python
def get_xxx_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    return conn
```

**Effort**: S (mezza sessione, batch). Low-risk se applicato in modo uniforme.

---

## TODO Bozze auto preventivi senza TTL

`is_bozza_auto=1` in `clienti_preventivi`: si crea quando l'utente compone preventivo su `/nuovo` senza salvare. Mai pulite → sporcizia DB.

Proposta: job schedulato (cronjob VPS oppure FastAPI background task) che cancella bozze auto **vecchie >7 giorni e mai promosse** (`updated_at < now-7d AND is_bozza_auto=1`).

**Effort**: XS. **Decisione pendente** Marco: pulire o tenerle?

---

## TODO Migrazioni unificate per DB non-foodcost

Oggi solo `foodcost.db` ha migrazioni tracciate via `migration_runner.py` + `schema_migrations`. Gli altri 9 DB hanno schema creato a runtime via `init_*_db()`. Schema drift potenziale dev↔prod.

Proposta: estendere il pattern `migration_runner` a tutti i DB (un `schema_migrations` per ogni DB). **Effort**: M.

Collegata al modulo guardiano L2 (registry pattern).

---

## TODO Push debounce duro (oltre L1 soft)

L1 soft (sessione 57 cont.): chiede conferma se push <30s fa o se servizio attivo. Soft = se Marco preme `y`, procede.

Roadmap 1.12 prevede debounce **duro** (blocca con exit 1 sotto soglia). Da considerare se il soft non basta.

---

## TODO Test automatici

Roadmap aperta da analisi 2026-03-14: zero test unitari/integrazione. >70 endpoint, >80 pagine FE. Rischio regressioni alto.

Effort L. Non urgente, ma da pianificare.

---

## Già pulito in sessione 57 cont. (2026-04-25)

- ✅ Roadmap 1.15 import morti `vini_db`: già rimossi nelle sessioni 52-53, voce roadmap obsoleta — chiusa.
- ✅ S52-1 corruzione vini_magazzino: declassato a chiuso post 4gg stabili.
- ✅ PIN admin di default cambiato da "0000" a random 6 cifre stampato in console.
- ✅ Modulo guardiano L1 (push.sh debounce + probe HTTP) implementato.
- ✅ Documenti `architettura_pattern.md`, `inventario_pulizia.md`, `controllo_design.md` creati.
