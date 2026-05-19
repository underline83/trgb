# Piano di Refactoring Documentazione

> Data: 2026-05-19 · Audit ref: `01_AUDIT_PER_MODULO.md`, `02_GAP_REPORT.md`

## 1. Causa root del disallineamento attuale

L'audit ha trovato che la documentazione TRGB è **complessivamente sana** (health 73/100) ma con disallineamenti localizzati. La causa root non è "docs ignorati" — è il pattern opposto: **docs molto vivi, ma con velocità diversa dal codice**.

Diagnosi puntuale:

1. **Velocità asimmetrica.** Il codice cambia con sessioni rapide (push.sh, R-sessioni, bugfix); i docs vengono aggiornati a fine sessione (`sessione.md` + ad-hoc). Quando il commit chiude rapidamente (urgente), il doc rimane indietro.
2. **Zone scoperte sistematiche.** Tre aree non hanno un proprio `modulo_*.md`:
   - integrazione Fatture in Cloud (FIC) — annessa a `modulo_acquisti.md` ma trascurata
   - Selezioni del Giorno (sub-modulo ricette) — invisibile perché il nome "selezioni" è collisivo con un altro modulo
   - Task Manager + HACCP — modulo intero senza docs
3. **Collisione semantica.** Il file `docs/modulo_selezioni.md` parla di "Vendite/Corrispettivi", non di "Selezioni del Giorno" (ricette). Il file è stato rinominato da `design_gestione_vendite.md` mantenendo il nome "selezioni" che Marco usa colloquialmente per le vendite. Risultato: chi legge il nome del file si aspetta una cosa diversa da quello che c'è dentro.
4. **Docs verticali troppo lunghi.** Alcuni `modulo_*.md` superano le 600 righe (es. `modulo_vini.md`). Sono enciclopedici e utili, ma chi cerca "come si fa X" deve scrollare. Manca l'indicizzazione vertical "task → procedura".
5. **Docs storici intercalati.** File come `modulo_vini_widget_dashboard.md` (storia 14 fasi del widget) sono ottimi ADR ma vivono in `docs/` mischiati ai docs operativi. Stessa cosa per `refactor_anagrafiche_vini.md`.
6. **Pochi link incrociati.** I docs sono spesso autonomi, citano file di codice per posizione ma non si linkano tra loro (manca "vedi anche").

Non c'è **un solo problema** — è un set di micro-fragilità che, presi insieme, fanno sembrare i docs più disallineati di quanto siano. La salute generale è buona; il refactor è chirurgico.

---

## 2. Architettura docs proposta

Mantiene l'attuale impostazione `docs/modulo_*.md` (funziona), ma:

- aggiunge **due cartelle dedicate** per separare adr storici e specifiche orizzontali
- introduce **lo standard "Capability index"** per ogni modulo (top-level)
- introduce **un index `MODULI.md` master** per navigare

### Albero proposto

```
docs/
├── MODULI.md                          # NEW: index master di tutti i moduli con riga capability
├── readme.md                          # rinforzare come "entry point: leggi MODULI.md e sessione.md"
├── sessione.md                        # KEEP — diario di sessione
├── changelog.md                       # KEEP
├── roadmap.md                         # KEEP
├── problemi.md                        # KEEP
├── stack_tecnico.md                   # KEEP
├── stato_pagamento_unificato.md       # KEEP — spec orizzontale
│
├── moduli/                            # NEW cartella — un file per modulo (rinominati e standardizzati)
│   ├── 00_indice.md                   # NEW — alias/symlink di MODULI.md
│   ├── vini.md                        # da docs/modulo_vini.md
│   ├── vini_widget_dashboard.md       # archivio storico, vedi sotto
│   ├── ricette_foodcost.md            # da docs/modulo_ricette_foodcost.md
│   ├── ricette_selezioni_giorno.md    # NEW — gap CRIT-2
│   ├── acquisti.md                    # da docs/modulo_acquisti.md
│   ├── acquisti_fatture_xml.md        # da docs/modulo_fatture_xml.md
│   ├── acquisti_fatture_in_cloud.md   # NEW — gap CRIT-1
│   ├── controllo_gestione.md          # da docs/modulo_controllo_gestione.md
│   ├── banca.md                       # da docs/modulo_banca.md
│   ├── cassa_vendite.md               # rinominato da docs/modulo_selezioni.md — NOMEN-1
│   ├── cassa_chiusure_turno.md        # NEW — gap CRIT-3
│   ├── dipendenti.md                  # da docs/modulo_dipendenti.md
│   ├── dipendenti_turni.md            # da docs/modulo_dipendenti_turni.md
│   ├── prenotazioni.md                # da docs/modulo_prenotazioni.md
│   ├── preventivi.md                  # da docs/modulo_preventivi.md
│   ├── clienti.md                     # da docs/modulo_clienti_crm.md
│   ├── menu_carta.md                  # da docs/modulo_menu_carta.md
│   ├── pranzo.md                      # da docs/modulo_pranzo.md
│   ├── cucina.md                      # da docs/modulo_cucina.md
│   ├── task_manager.md                # NEW — gap CRIT-4
│   ├── haccp.md                       # NEW — gap CRIT-4
│   ├── statistiche.md                 # da docs/modulo_statistiche.md
│   └── platform_auth_utenti.md        # NEW — gap MED-19
│
├── specs/                             # NEW cartella — specifiche orizzontali (no modulo)
│   ├── stack_tecnico.md               # MOVE — già esistente
│   ├── stato_pagamento_unificato.md   # MOVE
│   ├── spec_riconciliazione.md        # MOVE
│   ├── spec_home_per_ruolo.md         # MOVE
│   ├── architettura_locale.md         # MOVE
│   ├── architettura_pattern.md        # MOVE
│   ├── architettura_mattoni.md        # MOVE
│   ├── controllo_design.md            # MOVE
│   ├── database.md                    # MOVE
│   ├── styleguide.md                  # MOVE
│   ├── deploy.md                      # MOVE
│   ├── installazione_nuovo_server.md  # MOVE
│   ├── sicurezza_backup.md            # MOVE
│   └── analisi_hardening_vps.md       # MOVE
│
├── adr/                               # NEW cartella — Architecture Decision Records (storici)
│   ├── 0001_refactor_anagrafiche_vini.md   # da docs/refactor_anagrafiche_vini.md
│   ├── 0002_refactor_monorepo.md           # da docs/refactor_monorepo.md (R1-R8)
│   ├── 0003_vini_widget_dashboard.md       # da docs/modulo_vini_widget_dashboard.md
│   ├── 0004_pattern_inventario_pulizia.md  # da docs/inventario_pulizia.md
│   └── ...
│
├── archive/                           # KEEP — conserva già le cose superate (verificare contenuto)
├── operativo/                         # KEEP — runbook operativi (se contiene materiale operativo)
└── mockups/                           # KEEP — mockup design
```

### Capability index — standard per ogni `moduli/<nome>.md`

In testa a ogni file, sezione **"Capability"** con tabella riassuntiva delle azioni utente (1 riga per capability, sintesi). Esempio:

```markdown
## Capability del modulo

| ID | Azione (italiano) | Audience | Endpoint backend | Pagina FE |
|---|---|---|---|---|
| V-1 | Visualizzare la cantina (lista bottiglie) | end-user | `GET /vini/v2/bottiglie/` | `/vini/v2/cantina` |
| V-2 | Wizard "+ Nuovo Vino" | end-user (sommelier) | `POST /vini/anagrafiche/bottiglia/` | `/vini/v2/nuovo` |
| ... |
```

Questa tabella è la **"single source of truth"** del manuale utente: il manuale ne è derivato. Se non c'è in tabella, non finisce nel manuale.

---

## 3. Convenzioni di mantenimento

### Chi aggiorna cosa

- **Modulo singolo modificato:** chi tocca il codice è tenuto a sincronizzare `docs/moduli/<modulo>.md`. La regola è: "ogni capability aggiunta/modificata/rimossa → 1 riga in tabella Capability + sezione dettaglio". Senza riga in tabella, la feature non esiste lato utente.
- **Sessione di lavoro:** continua a chiudere con aggiornamento `docs/sessione.md` (pattern già consolidato).
- **Versione modulo (`frontend/src/config/versions.jsx`):** continua a bumpare a ogni cambio significativo.
- **ADR:** quando si prende una decisione architetturale (refactor, rename, cambio db), aprire un file in `docs/adr/NNNN_*.md`. Numerazione progressiva.
- **Specifiche orizzontali:** quando si introduce una regola che vale per più moduli (es. `stato_pagamento_unificato`), aprire in `docs/specs/`.

### Enforcement

- **Pre-commit (push.sh).** Aggiungere un check: se i file `app/routers/<module>_router.py` cambiano e `docs/moduli/<module>.md` non viene toccato nella stessa session, prompt di warning (non bloccante). Pattern: `git diff --name-only $LAST_PUSH..HEAD | grep -E '^app/routers/' | mappa a docs`. Il guardiano L1 (push.sh) può già fare questo.
- **Skill `/guardiano`.** Il pre-audit guardiano (vedi `anthropic-skills:guardiano`) può estendere la verifica: "il diff tocca capability del modulo X? La tabella `Capability` di `docs/moduli/X.md` è aggiornata?".
- **Roadmap.md.** Continuare a usarla come fonte per task pendenti. Ogni voce della roadmap dovrebbe sfociare in:
  1. codice (commit)
  2. riga in tabella Capability del modulo
  3. eventuale aggiornamento manuale (se l'audience è end-user/manager)

### Linking obbligatorio

In ogni `docs/moduli/<modulo>.md`:
- in cima, una sezione "Vedi anche" con link a:
  - moduli che dipendono / da cui dipende (da `core/moduli/<id>/module.json`)
  - specs orizzontali pertinenti
- al fondo, sezione "Decisioni" che linka ADR pertinenti

---

## 4. Migrazione dei docs esistenti

| File attuale | Stato | Azione | Destinazione |
|---|---|---|---|
| `docs/modulo_vini.md` | Allineato (top-tier) | Sposta + standardizza intestazione | `docs/moduli/vini.md` |
| `docs/modulo_vini_widget_dashboard.md` | Storico (14 fasi widget) | Archivia come ADR | `docs/adr/0003_vini_widget_dashboard.md` |
| `docs/modulo_ricette_foodcost.md` | Allineato 80% | Sposta + aggiungi sezioni MED-4..8 | `docs/moduli/ricette_foodcost.md` |
| `docs/modulo_acquisti.md` | Allineato 70% | Sposta + estendi proforme | `docs/moduli/acquisti.md` |
| `docs/modulo_fatture_xml.md` | Allineato | Sposta come "fatture_xml" | `docs/moduli/acquisti_fatture_xml.md` |
| `docs/modulo_controllo_gestione.md` | Allineato | Sposta + estendi MED-9..10 | `docs/moduli/controllo_gestione.md` |
| `docs/modulo_banca.md` | Allineato | Sposta | `docs/moduli/banca.md` |
| `docs/modulo_selezioni.md` | **Misleading nome** (parla di Vendite) | **Rinomina** + sposta | `docs/moduli/cassa_vendite.md` |
| `docs/modulo_dipendenti.md` | Allineato | Sposta + estendi MED-11..13 | `docs/moduli/dipendenti.md` |
| `docs/modulo_dipendenti_turni.md` | Allineato | Sposta | `docs/moduli/dipendenti_turni.md` |
| `docs/modulo_prenotazioni.md` | Allineato | Sposta | `docs/moduli/prenotazioni.md` |
| `docs/modulo_preventivi.md` | Allineato | Sposta | `docs/moduli/preventivi.md` |
| `docs/modulo_clienti_crm.md` | Allineato 80% | Sposta + estendi MED-14..16 | `docs/moduli/clienti.md` |
| `docs/modulo_menu_carta.md` | Allineato | Sposta | `docs/moduli/menu_carta.md` |
| `docs/modulo_pranzo.md` | Allineato | Sposta | `docs/moduli/pranzo.md` |
| `docs/modulo_cucina.md` | Misleading (parla anche di dashboard/HACCP non di cucina) | Sposta + restringi scope | `docs/moduli/cucina.md` (solo lista_spesa) |
| `docs/modulo_statistiche.md` | Allineato | Sposta | `docs/moduli/statistiche.md` |
| `docs/refactor_anagrafiche_vini.md` | Storico (design pre-cutover) | ADR | `docs/adr/0001_refactor_anagrafiche_vini.md` |
| `docs/refactor_monorepo.md` | Vivo (R1-R8) | **TIENI in root** (è una roadmap viva, non un ADR) — opzionale duplicare estratto storico in `adr/0002` quando R8 chiuderà |
| `docs/architettura_*.md` (3 file) | Allineato | Sposta | `docs/specs/architettura_*.md` |
| `docs/stack_tecnico.md` | Allineato | Sposta | `docs/specs/stack_tecnico.md` |
| `docs/stato_pagamento_unificato.md` | Allineato | Sposta | `docs/specs/stato_pagamento_unificato.md` |
| `docs/spec_riconciliazione.md` | Allineato | Sposta | `docs/specs/spec_riconciliazione.md` |
| `docs/spec_home_per_ruolo.md` | Allineato | Sposta | `docs/specs/spec_home_per_ruolo.md` |
| `docs/controllo_design.md` | Allineato | Sposta | `docs/specs/controllo_design.md` |
| `docs/database.md` | Allineato | Sposta | `docs/specs/database.md` |
| `docs/styleguide.md` | Allineato | Sposta | `docs/specs/styleguide.md` |
| `docs/deploy.md` | Operativo | Sposta | `docs/specs/deploy.md` |
| `docs/installazione_nuovo_server.md` | Operativo | Sposta | `docs/specs/installazione_nuovo_server.md` |
| `docs/sicurezza_backup.md` | Allineato | Sposta | `docs/specs/sicurezza_backup.md` |
| `docs/analisi_hardening_vps.md` | Operativo | Sposta | `docs/specs/analisi_hardening_vps.md` |
| `docs/analisi_app_apple.md` | Esplorativo | ADR o archivio | `docs/adr/0005_analisi_app_apple.md` o `docs/archive/` |
| `docs/inventario_pulizia.md` | Pattern operativo | ADR | `docs/adr/0004_pattern_inventario_pulizia.md` |
| `docs/mattone_calendar.md` | Mattone M.E | Sposta | `docs/specs/mattone_calendar.md` (o consolidare in `architettura_mattoni.md`) |
| `docs/checklist_visione_insieme.md` | Roadmap dirigenziale | KEEP in root | — |
| `docs/GUIDA-RAPIDA.md` | Onboarding | KEEP in root | — |
| `docs/commerciale_brochure_v5.docx` | Materiale commerciale | KEEP in root o spostare in `docs/marketing/` | — |
| `docs/query_cg_uscite_aggregatore.sql` | SQL utility | Sposta o documentare in `database.md` | — |
| `docs/changelog.md`, `roadmap.md`, `problemi.md`, `sessione.md`, `readme.md` | Core process docs | KEEP in root | — |
| `docs/audit-2026-05-19/` | Output di questo audit | KEEP | — |
| `docs/operativo/` | Runbook | Verificare contenuto; mantenere o assorbire in `docs/specs/` | — |
| `docs/archive/` | Archivio | KEEP | — |
| `docs/mockups/` | Mockup design | KEEP | — |

**File nuovi da creare (priorità):**

| File | Priorità | Mossa pratica |
|---|---|---|
| `docs/moduli/acquisti_fatture_in_cloud.md` | CRIT-1 | Sintesi dei 12 endpoint FIC, flusso token, esempi sync warnings. |
| `docs/moduli/ricette_selezioni_giorno.md` | CRIT-2 | Spiegare il 5-router pattern (macellaio/salumi/formaggi/pescato/piatti) + UI `/selezioni`. |
| `docs/moduli/cassa_chiusure_turno.md` | CRIT-3 | Pre-conti, spese fine turno, checklist, stats. |
| `docs/moduli/task_manager.md` + `docs/moduli/haccp.md` | CRIT-4 | Template/agenda/istanze/scheduler/task singoli/report HACCP. |
| `docs/moduli/platform_auth_utenti.md` | MED-19 | Login JWT, ruoli, gestione utenti. |
| `docs/MODULI.md` | tutti | Index master con riga per modulo + link. |

---

## 5. Quick wins (azioni delle prossime 2 settimane)

Cinque azioni concrete e fattibili **prima di affrontare il refactor pieno**:

1. **NOMEN-1 fix — rinominare `docs/modulo_selezioni.md` → `docs/modulo_cassa_vendite.md`** e aggiornare i pochi link nei docs che lo citano (`grep -r "modulo_selezioni"`). Risolve la confusione semantica più grossa.
2. **Creare 2 file mancanti minimal** (anche solo stub) per le 2 zone più grandi senza docs:
   - `docs/modulo_fatture_in_cloud.md` (anche solo: lista endpoint + 1 paragrafo per ognuno + link al codice)
   - `docs/modulo_task_manager.md` (lista endpoint + concetti template/istanza/task singolo)
3. **Aggiungere in cima a ogni `modulo_*.md` la tabella "Capability"** (estratta dal codice — l'audit l'ha già fatto, vedi `01_AUDIT_PER_MODULO.md` capability per modulo). Anche solo come copia-incolla iniziale: il valore è alto perché diventa l'ancora del manuale.
4. **Decidere il fato di `*_legacy.jsx` vini** (V-H.I task) — non urgente, ma deciso. Suggerimento: piattaforma stabile da almeno 4 settimane post-cutover → cleanup.
5. **Aggiornare `CLAUDE.md`** aggiungendo regola di disciplina docs: "Ogni capability aggiunta in router → riga nella tabella Capability del modulo corrispondente". Questo è enforcement zero-cost per il futuro.

---

## 6. Indicatori da monitorare (post-refactor)

Per misurare il successo del refactor docs nel tempo:

- **Health score docs** (rifare audit a 3 mesi): obiettivo 85/100.
- **Conta capability documentate / capability codice** (estrarre con grep su endpoint vs grep su tabelle Capability): obiettivo > 90%.
- **Tempo medio "feature nuova → riga in docs"** (osservabile in git log): obiettivo 0 (stesso commit).
- **Cardinalità file `modulo_*.md`** ≈ cardinalità `core/moduli/<id>/module.json`. Oggi: 18 file vs 14 moduli (sovrapposizioni); target: 1:1 o 1:N pulito (es. acquisti = 3 file: base + xml + fic).
