# TRGB — Audit S51 — Aggiornamento al 2026-04-24

**Data aggiornamento**: 2026-04-24 (sessione 55 in corso)
**Audit originale**: 2026-04-20 (sessione 51) — file `00_REPORT_FINALE.md` in questa cartella
**Delta temporale**: 4 giorni, 4 sessioni consecutive concitate (51, 51cont, 52, 53, 53cont, 54)
**Scope aggiornamento**: verifica file-per-file dello stato del piano di pulizia + integrazione novità emerse tra 20/04 e 24/04

---

## 0. TL;DR — cosa è cambiato in 4 giorni

1. **Del piano di pulizia dell'audit NON è stato eseguito NULLA.** Zero push di pulizia. Tutti i 21.5 MB di recupero sono ancora lì, i router orfani, il file fantasma, i worktree, i mockup storici.
2. **Il mattone Housekeeping NON è stato implementato.** Nessun `scripts/housekeeping/`, nessun `docs/mattone_housekeeping.md`, nessun hook in `push.sh`, nessuna skill.
3. **Le 4 sessioni successive sono state completamente assorbite dalla cascata di corruzioni SQLite** su `vini_magazzino.sqlite3` (20/04 22:29 → 21/04 12:49, cinque manifestazioni) e poi dai Flussi di Cassa Contanti (sessione 54).
4. **Il vettore reale della cascata è stato trovato (commit c31d70c, v3.19 Fase 6 storico prezzi)** e chiuso in produzione (sessione 53 pomeriggio). Tutti i DB sono ora in WAL. La pendenza di affidabilità è in osservazione, non più critica.
5. Il **monito centrale dell'audit resta vero e più pressante che prima**: "il rischio vero non è lo stato di oggi ma la ripetizione del pattern". In 4 giorni il sistema ha accumulato: 4 nuove sezioni `sessione.md`, 4 backup forensi di DB corrotti sul VPS, una tabella `cash_flow_baseline` + una `cash_spese_baseline`, due file `.prev` in più. Nessuno ha potato.

**Raccomandazione immediata**: **non aprire altre feature prima di aver eseguito almeno il push 🔴 e aver deciso su 1.14.a / mattone housekeeping.** Il costo cognitivo del disordine sta diventando una tassa su ogni sessione.

---

## 1. Stato elementi del piano 🔴/🟡/🟢

### 🔴 URGENTE — 0/5 fatto

| # | Voce | Stato 2026-04-20 | Stato 2026-04-24 | Nota |
|---|------|------------------|-------------------|------|
| 1 | `app/routers/ingredients_router.py` orfano | presente, 0 ref in `main.py` | **INVARIATO** — 3547 byte, 0 ref | da cancellare |
| 1 | `app/routers/settings_router.py` orfano | presente, 0 ref in `main.py` | **INVARIATO** — 3900 byte, 0 ref | da cancellare |
| 2 | `app/models/__pycache__/vini_magazzino_router.py` | anomalia filesystem | **INVARIATO** — 0 byte | da cancellare |
| 3 | `docs/v2.0-todo.md` fantasma (0 `[x]` su 68) | fantasma | **INVARIATO** — ancora 0/68 | da archiviare con banner |
| 4 | `frontend.zip` (19 MB) | presente | **INVARIATO** — 19 MB | da cancellare |
| 4 | `backfill_057_dryrun.csv` | presente | **INVARIATO** | da cancellare |
| 4 | `run_server.py` | presente | **INVARIATO** | da cancellare |
| 4 | `run_servers.command` | presente | **INVARIATO** | da cancellare |
| 4 | `update_vps.sh` | presente | **INVARIATO** | da cancellare |
| 4 | `ISTRUZIONI_SERVER.md` | presente | **INVARIATO** | da cancellare |
| 4 | `backup/` vuota | presente | **INVARIATO** | `rmdir` |
| 5 | `docs/TRGB-02-Style-Guide.pdf` (0 byte) | vuoto | **INVARIATO** | da cancellare |
| 5 | `frontend/public/mockup-admin-home.html` duplicato | presente | **INVARIATO** — 30238 byte | da cancellare |

**Conclusione**: tutto il push 🔴 è ancora da fare. I comandi proposti nell'audit sono validi *as-is*.

### 🟡 MEDIA — 0/5 fatto

| # | Voce | Stato 2026-04-20 | Stato 2026-04-24 | Nota |
|---|------|------------------|-------------------|------|
| 1 | 18 mockup storici in root | presenti | **INVARIATO** — 20 file `mockup-*.{html,jsx}` in root | da spostare in `docs/archive/mockups/` |
| 2 | 9 worktree safe | presenti | **10 presenti** (1 rimosso `agitated-gagarin`, 9 ex-safe + 1 da review ancora lì) | cancellazione batch |
| 3 | Review `agitated-gagarin` e `busy-bohr` | da fare | `agitated-gagarin` NON più elencato in `git worktree list` (sembra rimosso); `busy-bohr` resta | rivedere 1 commit di `busy-bohr` |
| 4 | 8 componenti frontend orfani | presenti | **5 presenti** (FormaggiCard/MacellaioCard/SalumiCard già cancellati in sessione 49 o pulizia precedente); restano: `BackButtton.jsx`, `CardMenu.jsx`, `icons.jsx`, `vini/MagazzinoSubMenu.jsx`, `hooks/useAppHeight.js` | + scoperto duplicato `pages/vini/MagazzinoSubMenu.jsx` identico a `components/vini/MagazzinoSubMenu.jsx` |
| 5 | Archiviazione docs superati | da fare | **INVARIATO** — nessun `docs/archive/` creato | 7 file candidati |

### 🟢 BASSA — 0/7 fatto

| # | Voce | Stato 2026-04-20 | Stato 2026-04-24 |
|---|------|------------------|-------------------|
| 1 | Memoria `project_trgb.md` dice "sessione 34" | stale | **PIÙ stale** — oggi siamo in 55, mostra versioni moduli di 21 sessioni fa |
| 2 | `docs/database.md` senza `bevande.sqlite3` | stale | **INVARIATO** (ultima modifica 30/03, 25 giorni fa) |
| 3 | `docs/modulo_foodcost.md` "Beta" | stale | **INVARIATO** (ultima modifica 14/03) |
| 4 | Merge `modulo_dipendenti.md` in `_v2.md` | duplicato | **INVARIATO** — v1 13/03, v2 30/03 |
| 5 | Consolidare Pydantic schemas | sparso | **INVARIATO** |
| 6 | Estendere `schema_migrations` | solo foodcost | **INVARIATO** (solo foodcost.db) |
| 7 | Valutare `static/` | da verificare | **INVARIATO** |

---

## 2. Mattone Housekeeping — stato implementazione

| Livello | Proposta | Stato 2026-04-24 |
|---------|----------|-------------------|
| L1 — hook pre-commit `push.sh` | `scripts/housekeeping/pre_push_checks.sh` + integrazione in `push.sh` | **NON IMPLEMENTATO** — `push.sh` non contiene `housekeeping`, `scripts/housekeeping/` non esiste |
| L2 — skill `trgb:housekeeping` on-demand | plugin Cowork con scripts `scan_*` | **NON IMPLEMENTATO** |
| L3 — scheduled task mensile | `mcp__scheduled-tasks__create_scheduled_task` | **NON IMPLEMENTATO** |
| File `docs/mattone_housekeeping.md` (proposta) | promosso in `docs/` | **NON PROMOSSO** — esiste solo `AUDIT_2026-04-20/mattone_housekeeping.md` |
| Voce in `docs/architettura_mattoni.md` | "M.J Housekeeping" o simile | **NON AGGIUNTA** |
| Voce in `docs/roadmap.md` | Task #10 o sezione 1.x | **NON AGGIUNTA** |

**Decisioni §6 del proposal (aperte)**: nessuna risposta, nessuna scelta documentata. Sei domande ancora pendenti:
1. Canale notifica mensile (M.A Bacheca vs M.D email vs solo file)
2. L1 blocco duro vs solo avviso
3. Nome skill (`trgb:housekeeping` vs altri)
4. Promozione `docs/mattone_housekeeping.md` ora vs dopo review
5. Scope L3 (anche warning docs >30gg)
6. (§5 report) static/, worktree review, docx commerciale, follow-up cucina, asset SVG

---

## 3. Ambigui §5 del report — stato risposte

| Domanda | Risposta Marco? |
|---------|-----------------|
| `static/` ancora usata? | Non documentata |
| `agitated-gagarin` / `busy-bohr` review | `agitated-gagarin` non più in `git worktree list` (auto-pruned?); `busy-bohr` presente (1 commit CG v2.0b JOIN fatture) |
| `TRGB_Gestionale_Commerciale.docx` 31 marzo | Non documentata |
| Follow-up sessione 39 DashboardCucina | Non documentata |
| `interventi_cucina_post_mvp.md` (22 KB) | Non documentata |
| Asset SVG brand (11 orfani) | Non documentata |

Nessuno degli ambigui è stato risolto. Da mettere in AskUserQuestion alla prossima finestra utile.

---

## 4. Novità dal 20/04 che impattano l'audit

### 4.1 Cascata corruzioni SQLite — RISOLTA in produzione (da confermare sotto carico)

**Eventi**:
- 20/04 22:29 → 1ª corruzione `vini_magazzino.sqlite3` (recovery #1)
- 20/04 22:51 → 2ª corruzione (recovery #2)
- 20/04 23:16 → 3ª corruzione (recovery #3) — fix 1.11 `.gitignore -wal/-shm` applicato
- 21/04 00:53 → 4ª corruzione *PRE-push* (recovery #4) — apre S52-1 "secondo vettore ignoto"
- 21/04 12:49 → 5ª manifestazione (recovery #5 da `.prev` locale) — vettore scagionato: era già corrotto al push S52

**Causa radice finale (trovata 21/04 pomeriggio in sessione 53 cont.)**:
Commit `c31d70c` "Vini v3.19 Fase 6 storico prezzi BE" (20/04 19:23) introduceva:
1. `init_magazzino_database()` con scrittura su `sqlite_master` a ogni boot del router (`CREATE TABLE IF NOT EXISTS vini_prezzi_storico` + `CREATE INDEX`).
2. `upsert_vino_from_carta()` e `update_vino()` in transazione lunga unica (UPDATE `vini_magazzino` + INSERT `vini_prezzi_storico`).
3. SIGTERM del 22:29 → frame WAL misti su transazione pendente → `sqlite_master` inconsistente → `malformed database schema` al next open.

**Fix applicato** (sessione 53 cont., file singolo `app/models/vini_magazzino_db.py`):
- `init_magazzino_database()` fa `SELECT 1 FROM sqlite_master WHERE name='vini_prezzi_storico'` prima di `CREATE` → zero scritture a boot se tabella esiste.
- `upsert_vino_from_carta()` e `update_vino()` → `conn.commit()` SUBITO dopo l'UPSERT principale, log storico in transazione separata best-effort.
- `bulk_update_vini` lasciato com'è (atomicità voluta, esposizione stretta).

**Coperture collaterali (sessione 52, ancora valide)**:
- WAL + `synchronous=NORMAL` + `busy_timeout=30000` applicato a **tutti e 10 i DB SQLite** del backend.
- `.gitignore` ora protegge `app/data/*.sqlite3-wal` e `*.sqlite3-shm`.
- Rimossi 3 import morti `from app.models import vini_db` in `dashboard_router.py` e `alert_engine.py` (era codice morto nei log).
- `docs/deploy.md` sezione 11 "Anti-conflitto push ↔ uso attivo" aggiunta.

**Pendenze aperte dopo la cascata**:
- S52-1 in osservazione sotto carico reale (lunch/dinner servizio 22/04-24/04 sotto WAL+fix → se regge 24-48h si declassa a chiuso).
- **1.13 pulizia backup forensi** bloccata: sul VPS ci sono `CORROTTO-1-*`, `CORROTTO-2-*`, `CORROTTO-3-*`, `CORROTTO-4-*`, `CORROTTO-5-*`, `FORENSE-2251`, `BACKUP-20260420-223719` — sbloccabili solo dopo chiusura definitiva S52-1.
- **1.14.a push.sh soft-check** ancora DA FARE — è il gate del piano anti-conflitto e la cosa più leggera da aggiungere (10 min di lavoro).

### 4.2 Sessione 54 (22/04) — Flussi Cassa Contanti

4 iterazioni nella stessa serata. Nuove entità introdotte:
- 2 tabelle: `cash_flow_baseline`, `cash_spese_baseline` in `admin_finance.sqlite3`.
- 4 endpoint baseline: `GET/PUT /admin/finance/cash/flow/baseline`, `GET/PUT /admin/finance/cash/spese/baseline`.
- 2 nuovi componenti FE: `SubFlussoContanti`, `SubFlussoSpese` in `GestioneContanti.jsx`.
- 1 componente: `TabCashBaseline` in `BancaImpostazioni.jsx`.
- Unificazione menu Pre-conti + Spese varie in 3 tab (Pre-conti, Spese varie, Flusso spese).

**Nota audit-rilevante**: a differenza del ciclo Vini v3.14–v3.21 che ha accumulato disordine (mockup fase intermedie, TODO inevasi, asset orfani), la sessione 54 ha aggiornato `changelog.md` + `sessione.md` in modo disciplinato e non ha lasciato strascichi. Pattern virtuoso — da citare nel mattone housekeeping come esempio.

### 4.3 Memoria Claude

- Count totale: **36 memorie** oggi (35 al 20/04, +1 nuova `feedback_prev_local_first.md` — "Backup .prev locale PRIMA di forensica VPS").
- `project_trgb.md` dice ancora "Sessione attuale: 34 (2026-04-13)" → 21 sessioni di ritardo (ora 55 in corso).
- Le 5 memorie nuove suggerite dall'audit NON sono state create: `project_mattone_email.md`, `project_mattone_permessi.md`, `project_mattone_import.md`, `project_infrastructure_queue.md`, `feedback_versioning_moduli.md`.
- Memorie nuove *post-audit*: `feedback_prev_local_first.md` (creata nel ciclo corruzioni — OK, tempestiva).

### 4.4 Nuovi worktree, nuovi mockup, nuovi docs post-20/04

- **Mockup in root**: invariati 20 (0 nuovi, 0 archiviati).
- **Worktree**: `agitated-gagarin` non più listato (auto-prunato o manuale); gli altri 10 tutti lì.
- **docs/ nuovi**: 0 file nuovi. Modifiche a `roadmap.md`, `changelog.md`, `sessione.md`, `problemi.md`, `deploy.md`, `modulo_magazzino_vini.md`, `modulo_vini_riordini.md` — tutte appropriate.
- **AUDIT_2026-04-20/**: i 2 file originali (questo report aggiornato è il terzo).

### 4.5 Backup forensi locali `.prev`

Il file `push.sh` salva il DB produzione come `.sqlite3.prev` prima di ogni pull. La cascata ha reso questi file preziosi (recovery #5 è partito dal `.prev` locale di `vini_magazzino`). Stato attuale `app/data/`:

```
admin_finance.sqlite3.prev
clienti.sqlite3.prev
dipendenti.sqlite3.prev
foodcost.db.prev
notifiche.sqlite3.prev
vini.sqlite3.prev
vini_magazzino.sqlite3.prev
vini_settings.sqlite3.prev
```

Tutti aggiornati all'ultimo push (sessione 54, 22/04 sera). **Sono in `.gitignore`** (non committati). Da aggiungere al mattone housekeeping L1 come "pattern da NON toccare" (a differenza di `.sqlite3-wal` che erano il bug).

---

## 5. Metriche chiave — delta 20/04 → 24/04

| Metrica | 2026-04-20 | 2026-04-24 | Δ |
|---------|------------|------------|---|
| File .jsx/.js frontend | 203 | **203** | 0 |
| Pagine | 144 | **144** | 0 |
| Componenti | 34 | **34** | 0 |
| File .py backend | 186 | **186** | 0 |
| Router attivi / orfani | 42 / 2 | **42 / 2** | 0 |
| Service | 21 | **21** | 0 |
| Model | 13 | **12** | −1 (riconteggio: erano 12, non 13 — errore minore audit originale) |
| Migrazioni | 96 | **96** | 0 (090–096 già presenti al 20/04) |
| File docs/ | 63 | **63** | 0 |
| Memorie Claude | 35 | **36** | +1 (`feedback_prev_local_first.md`) |
| Mockup HTML/JSX root | ~20 | **20** | 0 |
| Worktree git | 11 | **10** | −1 (`agitated-gagarin`) |
| Mattoni condivisi | 6/9 | **6/9** | 0 |
| Spazio recuperabile | ~21.6 MB | **~21.6 MB** | 0 |
| `docs/v2.0-todo.md` fantasma | 0/68 | **0/68** | 0 |
| Tabelle DB totali | (non misurato audit) | +2 (`cash_flow_baseline`, `cash_spese_baseline`) | +2 |
| File `.prev` in `app/data/` | (non rilevato audit) | 8 file `.prev` | OK (gitignored) |
| Backup forensi VPS (`CORROTTO-*`) | 2 | 7+ | +5+ (1.13 bloccata) |

**Conclusione**: salvo un worktree auto-prunato e una nuova memoria, il progetto è sostanzialmente identico a 4 giorni fa *per quanto riguarda il cleanup*. Lo stato di salute del codice è migliorato (WAL esteso, import morti via, vettore corruzioni chiuso). Lo stato di salute del paradocumento è identico.

---

## 6. Piano di pulizia aggiornato

### 🔴 URGENTE (INVARIATO, da eseguire **prima** di tutto il resto)

Stessi 5 blocchi del 20/04:
1. Cancella `ingredients_router.py`, `settings_router.py`.
2. Rimuovi `app/models/__pycache__/vini_magazzino_router.py`.
3. Archivia `docs/v2.0-todo.md` con banner in `docs/archive/v2.0/`.
4. Cancella `frontend.zip backfill_057_dryrun.csv run_server.py run_servers.command update_vps.sh ISTRUZIONI_SERVER.md`; `rmdir backup`; `git rm -r --cached __pycache__` se tracciato.
5. Cancella `docs/TRGB-02-Style-Guide.pdf` (0 byte) e `frontend/public/mockup-admin-home.html` (duplicato).

**Commit suggerito (INVARIATO):**
```bash
./push.sh "chore: pulizia root, router orfani, v2.0-todo fantasma archiviato (audit S51 🔴)"
```

### 🔴+ NUOVO — aggiunte dopo la cascata corruzioni (stesso push o push dedicato)

6. Aggiornare memoria `project_trgb.md` a sessione 54/55 + versioni moduli attuali.
7. Creare memoria `project_mattone_housekeeping.md` con riferimento a `AUDIT_2026-04-20/mattone_housekeeping.md` (evita di riperdere la proposta).
8. Decidere su **1.14.a push.sh soft-check** — è il primo mattoncino anti-conflitto ed è il pattern che potrebbe diventare il primo livello del mattone housekeeping. Unificabile come da nota `sessione.md:166`.

### 🟡 MEDIA (INVARIATO con 2 sconti)

1. Archivia 18 mockup storici in `docs/archive/mockups/`.
2. Cancella worktree safe — **oggi 9 safe** (agitated-gagarin già via). Lista aggiornata:
   ```bash
   git worktree remove --force .claude/worktrees/{crazy-curie,elated-chebyshev,elegant-shockley,gracious-liskov,hungry-cerf,livelli-cucina,mystifying-dewdney,sharp-almeida-9d4785,wonderful-borg}
   ```
3. Review `busy-bohr` (1 commit: CG v2.0b GET /uscite con JOIN fatture, includi_rateizzate) — confermare se mergiato in main o scartare.
4. Cancella **5 componenti frontend orfani** (−3 rispetto audit: Formaggi/Macellaio/Salumi già via): `BackButtton.jsx`, `CardMenu.jsx`, `icons.jsx`, `vini/MagazzinoSubMenu.jsx`, `hooks/useAppHeight.js`.
5. Archivia 7 docs superati (lista nel report 00).

### 🟡+ NUOVO — duplicato scoperto oggi

6. `frontend/src/pages/vini/MagazzinoSubMenu.jsx` — duplicato apparente di `frontend/src/components/vini/MagazzinoSubMenu.jsx` (stesso componente, stesso primo commento). Verificare quale è referenziato e cancellare l'altro.

### 🟢 BASSA (INVARIATO, più stale)

1. `project_trgb.md` (vedi 🔴+ punto 6, promosso per visibilità).
2. `docs/database.md`, `modulo_foodcost.md`, `modulo_dipendenti*.md` da aggiornare/fondere.
3. Schemas Pydantic, `schema_migrations` su DB ausiliari, `static/`, asset SVG orfani — invariati.

---

## 7. Decisioni richieste a Marco

Nessuna di queste è urgente di per sé, ma **ogni giorno che passa l'audit perde valore**: i file sono sempre lì, le memorie sempre più vecchie, e chi subentra nel codice parte con più rumore.

1. **Push 🔴 oggi o domani?** — 10 minuti di preparazione, 1 push, zero rischio.
2. **Mattone Housekeeping**: vogliamo davvero costruirlo? Se sì, quale livello per primo (L1 hook o L2 skill)? Il mio consiglio: L1 hook in `push.sh` come parte di 1.14.a + quick wins.
3. **1.14.a soft-check** autonomo o unificato a Livello 1 del mattone? (§sessione.md:166)
4. **Risposta ai 6 ambigui** dell'audit §5 (`static/`, worktree, docx, cucina, asset SVG). Li ripropongo nella prossima AskUserQuestion utile.
5. **S52-1 declassabile?** Dopo 48h di servizio reale con WAL+fix senza nuove corruzioni, si può chiudere. Oggi siamo a 48h piene se il servizio di stasera non ha problemi.

---

## 8. Prossimi passi consigliati (micro-plan)

1. **Oggi/domani mattina**: push 🔴 (15 min).
2. **A seguire**: aggiornamento memoria `project_trgb.md` + creazione `project_mattone_housekeeping.md` (10 min).
3. **Sessione 55 o 56**: decisione su 1.14.a (unificato vs standalone) + implementazione 1.14.a. Se standalone: 30 min, se come L1 del mattone housekeeping: 1-2h.
4. **Dopo 48h di servizio stabile**: declassare S52-1, sbloccare 1.13 cleanup backup forensi VPS.
5. **Una sessione futura**: push 🟡 (1h, include review worktree `busy-bohr`).
6. **Una sessione futura**: L2 skill `trgb:housekeeping` (2-3h). Riusa gli script `scan_*` che l'audit originale ha di fatto già eseguito manualmente.

Tempo totale stimato per chiudere tutto il debito dell'audit S51: **4-6 ore di lavoro, spalmabili in 3-4 push**.

---

**File collegati**:
- [`AUDIT_2026-04-20/00_REPORT_FINALE.md`](./00_REPORT_FINALE.md) — audit originale (invariato)
- [`AUDIT_2026-04-20/mattone_housekeeping.md`](./mattone_housekeeping.md) — proposta mattone (invariata, non ancora promossa in `docs/`)
- [`docs/sessione.md`](../docs/sessione.md) — sessioni 51 / 51cont / 52 / 53 / 53cont / 54
- [`docs/roadmap.md`](../docs/roadmap.md) — voci 1.11, 1.11.2, 1.12, 1.13, 1.14.a/b/c, 1.15
- [`docs/problemi.md`](../docs/problemi.md) — S51-1 chiuso, S52-1 in osservazione
