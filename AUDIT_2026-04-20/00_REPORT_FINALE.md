# TRGB — Audit Completo e Piano di Pulizia

**Data**: 2026-04-20 (sessione 51)
**Scope**: intero progetto — root, docs/, frontend/, backend app/, worktrees, memoria Claude
**Metodologia**: 7 sub-agent in parallelo (Explore) + verifica incrociata file-per-file su realtà codice
**Output di dettaglio**: file `01..08` in questa stessa cartella

---

## 1. Executive summary

Il progetto **è sano al 95%**. La qualità del codice è alta (zero endpoint orfani, zero import rotti, 96 migrazioni senza duplicati, frontend pulito con solo 8 componenti orfani). Il disordine è **paradocumentale**: file TODO "fantasma" (tutte caselle `[ ]` anche per lavoro già fatto), mockup storici accumulati in root, worktree Claude Code non rimossi, asset brand duplicati, alcune memorie lievemente datate.

**Non c'è nessun incendio**. Ci sono ~19 MB di file legacy, una ventina di artefatti storici da archiviare, 2 router backend orfani, 11 worktree git di cui 9 cancellabili in sicurezza. L'informazione "cosa è vero oggi" è coerente tra `docs/roadmap.md`, `docs/sessione.md`, `docs/changelog.md` e la memoria — solo il **file TODO v2.0** mente dicendo 0 fatti su 68 quando in realtà è chiuso.

**Il rischio vero** non è questo stato, ma la **ripetizione del pattern**: ogni sessione accumula un po' di rumore, nessun meccanismo lo potta. Serve il mattone housekeeping (Task #10, proposta in `mattone_housekeeping.md`).

---

## 2. Metriche chiave

| Categoria | Numero | Note |
|-----------|--------|------|
| File .jsx/.js frontend | 203 | 144 pagine, 34 componenti, 8 orfani |
| File .py backend | 186 | 44 router (42 attivi + 2 orfani), 21 service, 13 model, 96 migrazioni |
| File docs/ | 63 | 52 .md + 7 .html mockup + 1 pdf vuoto + docx |
| Memorie Claude | 35 | 31 valide, 1 stale leggera, 3 update, 5 nuove suggerite |
| Mockup HTML/JSX totali | 33 | 10 vivi, 18 storici, 1 duplicato, 4 superati |
| Worktree git | 11 | 9 cancellabili, 2 da revisionare |
| Mattoni condivisi | 9 | 6 fatti (M.A, B, C, E, F, I), 3 aperti (M.D, G, H) |
| Spazio recuperabile | ~21.6 MB | frontend.zip 19MB + mockup 2.5MB + altro |

---

## 3. Quadro di salute per area

### 3.1 Backend — 99% sano
- **2 router orfani** da cancellare: `app/routers/ingredients_router.py`, `app/routers/settings_router.py` (duplicati di versioni "specializzate", non inclusi in `main.py`).
- **1 anomalia filesystem**: `app/models/__pycache__/vini_magazzino_router.py` — un file router dentro un `__pycache__` di models. Probabile errore di mv/cp.
- **1 modello deprecato**: `app/models/vini_model.py` — referenziava `vini.sqlite3` eliminato in v3.0. Confermare e rimuovere o aggiungere deprecation.
- **Services 21/21 usati**. **Migrazioni 96/96 sequenziali, zero duplicati**. **Endpoint: zero orfani sui 42 router attivi**.

### 3.2 Frontend — 98% sano
- **8 componenti orfani** (~23 KB): `BackButtton.jsx` (typo), `CardMenu.jsx`, `icons.jsx` (catalogo icone mai importato — Home usa emoji), `components/vini/MagazzinoSubMenu.jsx` (duplicato), `FormaggiCard.jsx`, `MacellaioCard.jsx`, `SalumiCard.jsx` (rimpiazzati da `SelezioniCard`), `useAppHeight.js` (hook disabilitato in App.jsx).
- **11 asset SVG brand potenzialmente orfani** (~31 KB): varianti icon e wordmark non importate (TrgbWordmark e TrgbLoader compongono SVG inline). Conservabili come "varianti storiche" se desiderate.
- **Zero pagine orfane**, **zero import rotti**.

### 3.3 Documentazione — 85% in ordine
- **47 file `.md` attivi e aggiornati** (changelog, roadmap, sessione, problemi tutti freschi oggi).
- **File stale da aggiornare**: `database.md` (manca `bevande.sqlite3`), `modulo_statistiche.md`, `modulo_foodcost.md`, `modulo_controllo_gestione.md`, `ANALISI_UI_TRGB.md`, `TRGB-02-INTEGRAZIONE-SOFTWARE.md`.
- **File da archiviare**: `analisi_sistema_2026-03-14.md`, `design_ricette_foodcost_v2.md`, `sessione_archivio_39.md`, `b2_tooltip_migration_prompts.md`, `modulo_cucina_mvp_prompt.md`, `prompt_canvas.md`, `v2.0-prompt-code-B1.md`, `TRGB_Gestionale_Commerciale.docx` (dopo review).
- **File duplicato**: `modulo_dipendenti.md` (v1) va fuso in `modulo_dipendenti_v2.md`.
- **File vuoto**: `TRGB-02-Style-Guide.pdf` (0 byte) → cancellare.

### 3.4 TODO — un file fantasma grave
| File | `[x]` | `[ ]` | Realtà | Verdetto |
|------|-------|-------|--------|----------|
| `docs/v2.0-todo.md` | **0** | **68** | v2.0 CG COMPLETATA (memoria + changelog sess 41–47) | **FANTASMA** — archiviare |
| `docs/prenotazioni_todo.md` | 0 | 158 | Modulo non iniziato | Valido |
| `docs/carta_bevande_todo.md` | **94** | 27 | Fasi 0–3 fatte, Fase 4 aperta | Modello virtuoso |

### 3.5 Mockup — 33 file, serve archivio
| Categoria | Conteggio | Azione |
|-----------|-----------|--------|
| Iterazioni fresche attive (docs/mockups + root) | 10 | Tenere |
| Iterazioni storiche superate (Home A/B/C, moduli v2/v3 intermedi, dashboard sala, header 4 varianti) | 18 | Archiviare in `docs/archive/mockups/` |
| Duplicato esatto (`frontend/public/mockup-admin-home.html`) | 1 | Cancellare |

### 3.6 Root del progetto — file legacy
| File | Azione | Spazio |
|------|--------|--------|
| `frontend.zip` (backup pre-Vite, 25-nov-24) | **CANCELLA** | 19 MB |
| `backfill_057_dryrun.csv` (output test) | **CANCELLA** | 10 KB |
| `run_server.py` (dev wrapper locale) | **CANCELLA** | 3 KB |
| `run_servers.command` (wrapper macOS) | **CANCELLA** | 8.7 KB |
| `update_vps.sh` (sostituito da `scripts/deploy.sh -c`) | **CANCELLA** | 2.2 KB |
| `ISTRUZIONI_SERVER.md` (duplicato di docs/deploy.md) | **CANCELLA** | 3.1 KB |
| `backup/` (vuota) | **CANCELLA** | — |
| `__pycache__/` (committato, già in .gitignore) | **RIMUOVI** | — |
| `setup-backup-and-security.sh` (setup one-time VPS) | **TIENI** | 4.1 KB |
| `static/` (montata in `main.py`) | **REVIEW** | 256 B index |

### 3.7 Git worktrees — 11 esistenti
- **9 safe da cancellare** (branch effimeri, niente commit non in main): `crazy-curie`, `elated-chebyshev`, `elegant-shockley`, `gracious-liskov`, `hungry-cerf`, `livelli-cucina`, `mystifying-dewdney`, `sharp-almeida-9d4785`, `wonderful-borg`.
- **2 da revisionare prima**: `agitated-gagarin` (3 commit: doc update, fix ImportResult, Dashboard) e `busy-bohr` (1 commit: CG v2.0b GET /uscite con JOIN fatture, includi_rateizzate).

### 3.8 Memoria Claude — 96% coerente
- **31/35 memorie valide** al 100%.
- **1 stale leggera**: `project_trgb.md` dice "sessione 34" (→ 51) e riporta versioni moduli datate.
- **5 memorie da creare** (non bloccanti): `project_mattone_email.md` (M.D), `project_mattone_permessi.md` (M.G), `project_mattone_import.md` (M.H), `project_infrastructure_queue.md` (follow-up 1.11/1.12/1.13), `feedback_versioning_moduli.md` (quando bumpare `versions.jsx`).

---

## 4. Piano di pulizia — per priorità

### Priorità 🔴 URGENTE (push dedicato, basso rischio, alto valore)

1. **Cancella router orfani backend**
   - `app/routers/ingredients_router.py`
   - `app/routers/settings_router.py`
2. **Rimuovi anomalia filesystem**
   - `app/models/__pycache__/vini_magazzino_router.py`
3. **Archivia il file fantasma v2.0**
   - `mv docs/v2.0-todo.md docs/archive/v2.0/v2.0-todo.md`
   - Aggiungi banner: `> v2.0 CG CHIUSA — vedi changelog sessioni 41–47. Solo Fase C rimandata a v2.1.`
4. **Cancella file legacy root**
   - `rm frontend.zip backfill_057_dryrun.csv run_server.py run_servers.command update_vps.sh ISTRUZIONI_SERVER.md`
   - `rmdir backup`
   - `git rm -r --cached __pycache__` (se tracciato)
5. **Cancella PDF vuoto e duplicati docs**
   - `rm docs/TRGB-02-Style-Guide.pdf`
   - `rm frontend/public/mockup-admin-home.html`

**Commit suggerito:**
```
./push.sh "chore: pulizia root, router orfani, v2.0-todo fantasma archiviato"
```

### Priorità 🟡 MEDIA (cleanup storici, un secondo push)

1. **Archivia mockup storici** (18 file, ~2.3 MB)
   ```
   mkdir -p docs/archive/mockups
   mv mockup-home-{A-app-grid,B-dashboard,C-tabbar,v2-swipe}*.* docs/archive/mockups/
   mv mockup-moduli-{proposte,v2,responsive,magazine-responsive,colorgrid,final,v3-mix}* docs/archive/mockups/
   mv mockup-dashboard-sala.html docs/archive/mockups/
   mv frontend/public/mockup-header-*.html docs/archive/mockups/
   ```
2. **Cancella worktree safe** (9/11)
   ```
   cd /Users/underline83/trgb
   git worktree remove --force .claude/worktrees/{crazy-curie,elated-chebyshev,elegant-shockley,gracious-liskov,hungry-cerf,livelli-cucina,mystifying-dewdney,sharp-almeida-9d4785,wonderful-borg}
   ```
3. **Review `agitated-gagarin` e `busy-bohr`** prima di cancellare.
4. **Cancella 8 componenti frontend orfani** (~23 KB).
5. **Archivia docs superati** in `docs/archive/` e `docs/archive/prompts/`.

**Commit suggerito:**
```
./push.sh "chore: archiviazione mockup storici, cleanup componenti orfani, pulizia worktree"
```

### Priorità 🟢 BASSA (manutenzione evolutiva)

1. Aggiorna memoria `project_trgb.md` (sessione 51, versioni attuali).
2. Aggiorna `docs/database.md` con `bevande.sqlite3` e gli altri DB moderni.
3. Rinfresca `docs/modulo_foodcost.md` (rimuovere "Beta", allineare a v3.0).
4. Merge `modulo_dipendenti.md` in `modulo_dipendenti_v2.md`, poi cancella il v1.
5. Consolida Pydantic schemas in `app/schemas/` progressivamente.
6. Estendi `schema_migrations` agli altri DB (vini_magazzino, clienti, notifiche).
7. Valuta se `static/` è ancora servita.

---

## 5. Ambigui — domande per Marco

1. **`static/`** è montata in `main.py`. Vuoi verifica se è ancora usata o se è retaggio pre-Vite?
2. **`agitated-gagarin` e `busy-bohr`** — posso guardare i 4 commit totali e dirti se mergiare o scartare?
3. **`TRGB_Gestionale_Commerciale.docx`** (31 marzo) — ancora valido?
4. **Follow-up sessione 39** (DashboardCucina, link "← Home"): assorbiti o ancora da fare?
5. **`interventi_cucina_post_mvp.md` (22 KB)**: quali interventi già fatti post-MVP v1.0?
6. **Asset SVG brand** (wordmark/icon variants, ~31 KB): "palette storica" o pulizia radicale?

---

## 6. Totale recupero stimato

| Voce | Spazio |
|------|--------|
| `frontend.zip` | 19.0 MB |
| 18 mockup storici | 2.3 MB |
| 11 asset SVG brand orfani | 31 KB |
| 8 componenti frontend orfani | 23 KB |
| File legacy root vari | ~30 KB |
| 2 router backend orfani | ~10 KB |
| 7 docs superati (archivio, non cancellazione) | ~60 KB |
| **Totale** | **~21.5 MB** |

---

## 7. Il punto che conta davvero — il mattone Housekeeping

Il problema vero non è lo stato **di oggi** (risolvibile con due push). È che **questo stato si riforma ad ogni ondata di sessioni**. Serve un meccanismo che prevenga il rumore in tempo reale, permetta audit on-demand, e controlli periodicamente lo stato.

La proposta completa è in **`mattone_housekeeping.md`** (in questa stessa cartella). In sintesi: ibrido a 3 livelli.

1. **Skill `trgb:housekeeping`** — on-demand, invocabile con "/audit" o "fai ordine". Esegue la scansione di oggi in automatico, produce report prioritizzato.
2. **Hook pre-commit in `push.sh`** — blocca/avverte su pattern sospetti: file fantasma in creazione, mockup in root, `__pycache__` nello stage, `.DS_Store`, `*.zip`, `*_dryrun.csv`, modifiche a codice senza changelog/sessione aggiornati.
3. **Scheduled task mensile** — primo lunedì del mese, esegue la skill in dry-run e notifica via Bacheca Staff (M.A) o email (M.D).

I tre livelli si rinforzano: hook previene, skill rimedia on-demand, task periodico cattura il drift lento.

---

## 8. Prossimi passi proposti

1. **Tu leggi questo report** e mi dici quali delle 3 priorità (🔴/🟡/🟢) vuoi eseguire + rispondi agli ambigui di §5.
2. **Io finalizzo `docs/mattone_housekeeping.md`** con il design dettagliato del guardiano e tu lo approvi.
3. **Eseguiamo la pulizia in 1-2 push** (🔴 oggi, 🟡 quando vuoi).
4. **Implementiamo skill housekeeping + hook push.sh** — 1-2 push.
5. **Scheduled task mensile** — aggiunto quando sei pronto.

Tempo stimato totale (lato tuo): 2 conferme + 2 `./push.sh`. Il resto lo faccio io.
