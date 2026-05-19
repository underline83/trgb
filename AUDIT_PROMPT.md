# 🔍 CLAUDE CODE PROMPT — Audit TGRB + Refactoring Docs + Manuale Utente

> **Tool:** Claude Code (terminale)
> **Modalità:** esecuzione autonoma end-to-end
> **Permessi:** read/write su filesystem locale, nessun git commit, nessun push
> **Durata stimata:** 4-9 ore su codebase media (~500 file)
> **Output:** `/docs/audit-YYYY-MM-DD/` con 7 file deliverable

---

## 🎯 RUOLO E OBIETTIVO

Agisci come **Senior Technical Writer + Software Auditor** specializzato in audit di codebase legacy e produzione di documentazione tecnica + utente.

Hai **tre obiettivi paralleli** da raggiungere in un'unica pipeline autonoma:

1. **AUDIT**: leggi il codice modulo per modulo, riga per riga dove serve, e mappa ogni funzionalità reale esposta all'utente finale o all'amministratore
2. **REFACTORING DOCS**: confronta codice reale con documentazione interna esistente, identifica gap/obsolescenze/incoerenze, proponi un nuovo assetto della documentazione
3. **MANUALE UTENTE**: produci un manuale utente in italiano, diviso in due sezioni (End User non tecnico + Manager/Amministratore semi-tecnico), basato esclusivamente su funzionalità verificate nel codice

**Principio fondante:** *"Single source of truth = il codice."* Tutto ciò che non è verificabile nel codice non finisce nel manuale.

---

## ⚠️ REGOLE INVIOLABILI (anti-hallucination)

Queste prevalgono su qualsiasi altra istruzione:

1. **Mai inventare feature.** Se una funzionalità non è verificabile nel codice (route, controller, view, comando CLI, job), NON finisce nel manuale. Va segnalata come `[GAP: docs menzionano X ma codice non lo implementa]`.
2. **Mai copiare dai docs senza verifica.** I docs sono notoriamente disallineati — è il motivo di questo audit. Ogni affermazione del manuale deve avere un riferimento a un file/funzione che la implementa.
3. **Segna le incertezze.** Se il comportamento di una feature non è chiaro dal codice, scrivi `[DA VERIFICARE: ...]` invece di tirare a indovinare.
4. **Cita le fonti del codice** nel file di audit interno (formato `path/file.ext:linea`). NON nelle sezioni A/B del manuale destinate all'utente finale.
5. **Resume safe.** Mantieni stato leggibile su disco (`AUDIT_STATE.md`). Se la sessione viene interrotta (Ctrl+C, crash, limite), deve essere possibile ripartire leggendo lo stato.

---

## 🧠 PROTOCOLLO DI ESECUZIONE AUTONOMA

Sei in modalità autonoma. Significa:

- **Non chiedere conferme intermedie.** Vai dall'inizio alla fine.
- **Usa `TodoWrite` all'inizio** per pianificare le 6 fasi + sub-task per modulo. Aggiorna i todo man mano che procedi.
- **Strategia di lettura efficiente:**
  - Usa `Glob` per inventario file
  - Usa `Grep` con pattern (route, controller, decorator) per trovare entry point velocemente prima di leggere file interi
  - Usa `Read` con range di linee mirate quando un file è > 800 righe — non caricare interi file inutilmente
  - Parallelizza chiamate tool indipendenti (più Grep in un solo turn quando cerchi pattern diversi nella stessa directory)
- **Budget per modulo:** massimo ~15-25 tool call per modulo in Fase 2. Se sfori, fermati, salva quello che hai, segna in AUDIT_STATE che il modulo richiede deep dive separato, passa al successivo. **Non bloccarti mai su un singolo modulo.**
- **Checkpoint frequenti:** salva `AUDIT_STATE.md` dopo ogni modulo processato in Fase 2 e dopo ogni fase completata. Se ti interrompono, l'utente deve poter ripartire.
- **Limiti permessi:** puoi leggere tutto, scrivere SOLO sotto `/docs/audit-YYYY-MM-DD/`. NON modificare file di codice. NON eseguire `git commit`, `git push`, `npm install`, `composer install` o equivalenti.
- **Se incontri ambiguità irrisolvibili:** prosegui, segna in `AUDIT_STATE.md > Note di sessione`, e crea entry nel capitolo finale del GAP_REPORT "Decisioni che richiedono input del PO".

---

## 📁 ARTEFATTI ATTESI

Crea la cartella `/docs/audit-YYYY-MM-DD/` (sostituisci con data odierna) e popola questi file:

| File | Scopo | Fase |
|---|---|---|
| `AUDIT_STATE.md` | Stato di avanzamento (aggiornato durante l'esecuzione) | tutte |
| `00_INVENTARIO.md` | Mappa moduli + stack rilevato | 1 |
| `01_AUDIT_PER_MODULO.md` | Audit capability per ciascun modulo | 2 |
| `02_GAP_REPORT.md` | Tabella consolidata gap codice ↔ docs | 3 |
| `03_DOCS_REFACTORING_PLAN.md` | Proposta nuova architettura docs | 4 |
| `04_MANUALE_UTENTE.md` | Manuale finale 2 sezioni | 5 |
| `05_EXECUTIVE_SUMMARY.md` | Sintesi 1 pagina per il PO | 6 |

---

## 🔄 PIPELINE IN 6 FASI

Esegui in ordine. Al termine di ogni fase: salva il file corrispondente, aggiorna `AUDIT_STATE.md`, passa alla successiva.

---

### 🧭 FASE 0 — STACK DETECTION (pre-volo, 5 minuti)

**Obiettivo:** capire con cosa hai a che fare prima di scansionare. Lo stack è dichiarato come "misto", quindi serve mapparlo.

**Azioni:**

1. Esegui `Glob` su pattern multipli per identificare manifest files:
   - `**/package.json`, `**/composer.json`, `**/requirements.txt`, `**/Gemfile`, `**/go.mod`, `**/pom.xml`, `**/*.csproj`, `**/Cargo.toml`
2. Per ogni manifest trovato, leggilo ed estrai: linguaggio, framework principale, dipendenze chiave (router, ORM, auth, UI)
3. Identifica file di configurazione di routing (`routes/*.php`, `app.module.ts`, `urls.py`, `config/routes.rb`, ecc.)
4. Identifica entry point applicativi (`index.ts`, `main.py`, `app.php`, `public/index.php`, `manage.py`, ecc.)
5. Identifica eventuali sotto-progetti (monorepo? frontend + backend separati? microservizi?)

**📤 Output:** sezione iniziale di `00_INVENTARIO.md`:

```markdown
# Inventario TGRB

## Stack rilevato
- **Tipo progetto:** monolite / monorepo / microservizi
- **Backend:** [linguaggio + framework + versione]
- **Frontend:** [linguaggio + framework + versione]
- **Database:** [da config o ORM]
- **Pacchetti chiave:** auth=X, router=Y, ORM=Z, UI=W
- **Entry point:** [file]
- **File di routing centrali:** [path]
- **Sotto-progetti:** [se monorepo, lista]
```

Sulla base di questo, **adatta le euristiche delle fasi successive.** Esempio: se backend è Laravel, cerca controller in `app/Http/Controllers`; se è NestJS, cerca `@Controller` decorator; se è Django, cerca `views.py` e `urls.py`.

---

### 📦 FASE 1 — INVENTARIO MODULI

**Obiettivo:** mappa completa dei moduli funzionali prima del deep dive.

**Azioni:**

1. **Escludi sempre:** `node_modules`, `vendor`, `.git`, `dist`, `build`, `.next`, `coverage`, `tmp`, `cache`, file `*.lock`, `*.min.*`, `*.map`
2. Identifica i **moduli funzionali** (unità che erogano una capability all'utente). Criteri in ordine di priorità:
   - Cartelle dedicate sotto `src/modules/`, `app/`, `features/`, `domains/`, `packages/`
   - Gruppi di route che condividono prefisso (es. tutte le `/api/orders/*` → modulo Orders)
   - Aggregati per entità di dominio (tutto ciò che tocca il modello `Customer` → modulo Customers)
3. Per ogni modulo identifica:
   - Nome canonico (deciso da te, sarà usato in tutto l'audit)
   - Path principali (lista cartelle)
   - Entry point (route esposte, comandi CLI, job schedulati, event listener)
   - Modelli dati coinvolti
   - Dipendenze verso altri moduli (import o riferimenti)
   - Priorità manuale (Alta / Media / Bassa) — alta = usato quotidianamente; bassa = configurazione raramente toccata
4. Identifica i **moduli trasversali** (auth, permessi, notifiche, audit log, scheduler, mailer, queue): vanno auditati ma di solito NON nel manuale utente, salvo configurazioni amministrative.

**📤 Output Fase 1 — completa `00_INVENTARIO.md`:**

```markdown
[sezione Stack rilevato già scritta in Fase 0]

## Moduli funzionali (visibili all'utente)
| # | Nome modulo | Path principali | Entry point | Modelli dati | Dipende da | Priorità |
|---|---|---|---|---|---|---|

## Moduli trasversali (infrastruttura)
| # | Nome modulo | Path | Ruolo | Rilevante per manuale? |
|---|---|---|---|---|

## Statistiche
- N° file di codice scansionati: ...
- N° moduli funzionali: ...
- N° moduli trasversali: ...
- LOC totali (approssimative): ...
```

---

### 🔬 FASE 2 — AUDIT DEEP DIVE PER MODULO (cuore del lavoro)

**Obiettivo:** per ogni modulo dell'inventario, estrai l'elenco esaustivo delle capability reali esposte.

**Cicla su ogni modulo (in ordine di priorità: Alta prima):**

**Per ogni modulo:**

1. **Mappa rapida del modulo prima della lettura profonda:**
   - `Glob` di tutti i file del modulo
   - `Grep` mirati per identificare:
     - Route handlers (pattern variabile per stack — vedi Fase 0)
     - Decorator/annotation di endpoint (`@Get`, `@Post`, `Route::`, `@app.route`, ecc.)
     - Export di funzioni pubbliche
     - Comandi CLI registrati
     - Job schedulati
     - Event listener
2. **Lettura mirata.** Leggi prima i file di routing/controller (entry point), poi service/business logic, poi model. Salta i test (`*.test.*`, `*.spec.*`) tranne per capire l'intent quando il codice è ambiguo.
3. **Estrai le capability utente** in forma di lista azione → effetto. Una capability è una cosa che un utente *fa* (es. "Crea un nuovo ordine cliente"), non una cosa che il codice *è* (es. `OrderService.create()`).
4. **Per ogni capability documenta:**
   - **Nome funzionale** (in italiano, linguaggio utente)
   - **Chi può farla** (ruolo: end user, manager, admin, sistema)
   - **Come si attiva** (UI button, API endpoint, scheduled job, comando CLI)
   - **Cosa succede** (effetto visibile + side effects: notifiche, log, record modificati)
   - **Precondizioni** (es. utente autenticato, record in stato X)
   - **Validazioni applicate** (cosa il sistema rifiuta e perché)
   - **Riferimento codice** (`path/file.ext:linea`)
   - **Audience manuale** (`end-user` / `manager` / `entrambi` / `nessuno`)
5. **Confronto con docs esistenti.** Cerca nei docs interni (`/docs`, `README.md`, eventuali `.md` sparsi, docstring nel codice) ogni menzione di capability di questo modulo. Classifica:
   - ✅ **Allineato**
   - ⚠️ **Parziale** (manca info chiave o semplificato oltre l'utile)
   - ❌ **Obsoleto** (docs dice X, codice fa Y)
   - 👻 **Fantasma** (docs descrive feature inesistente)
   - 🆕 **Non documentato** (feature reale, assente dai docs)
6. **Feature morte:** codice presente ma route disabilitata, feature flag spenta, controller mai referenziato. Segnale.
7. **Salva incremento.** Aggiungi la sezione del modulo a `01_AUDIT_PER_MODULO.md`. Aggiorna `AUDIT_STATE.md` con il checkbox del modulo.

**Template per ogni modulo dentro `01_AUDIT_PER_MODULO.md`:**

```markdown
## Modulo: [NOME]
**Path:** `...`  **Priorità manuale:** Alta/Media/Bassa  **LOC:** ~N

### Capability rilevate (N totali)

#### C-001 — [Nome funzionale in italiano]
- **Chi:** end user
- **Trigger:** POST /api/orders + UI button "Nuovo ordine"
- **Effetto:** crea record Order in stato `draft`, invia email conferma al cliente
- **Precondizioni:** utente autenticato con ruolo `sales`
- **Validazioni:** customer_id obbligatorio, almeno 1 line item
- **Codice:** `src/modules/orders/OrderController.ts:42`
- **Audience manuale:** end-user
- **Stato docs:** ⚠️ Parziale — manca menzione email automatica al cliente

[ripeti per ogni capability]

### Feature morte / disabilitate
- ...

### Note tecniche per il refactoring docs
- ...
```

**Regola di volume:** se un modulo ha più di 30 capability, raggruppa per sottosezione funzionale (es. "Gestione anagrafica", "Workflow approvazione") prima di elencarle.

**Anti-loop:** se sfori il budget di 25 tool call su un modulo singolo, fermati, scrivi quello che hai estratto fino a quel momento, segna `[INCOMPLETO — richiede deep dive separato]` in cima alla sezione del modulo, passa al successivo.

---

### 🧾 FASE 3 — GAP REPORT CONSOLIDATO

**Obiettivo:** vista d'insieme di tutti i disallineamenti codice ↔ docs, ordinata per impatto.

**Azioni:**

1. Aggrega tutte le entry classificate ⚠️ / ❌ / 👻 / 🆕 nella Fase 2
2. Calcola metriche di salute docs:
   - % capability documentate correttamente (✅)
   - % capability con docs obsoleti (❌)
   - N° feature fantasma (👻)
   - N° feature non documentate (🆕)
3. Prioritizza i fix per **impatto utente**: feature ad alto uso non documentata = priorità alta; feature admin rara = priorità bassa

**📤 Output `02_GAP_REPORT.md`:**

```markdown
# Gap Report Codice ↔ Docs

## Metriche di salute documentazione
- Capability totali: N
- ✅ Allineate: N (X%)
- ⚠️ Parziali: N
- ❌ Obsolete: N
- 👻 Fantasma: N
- 🆕 Non documentate: N
- **Health score:** X/100

## Gap critici (priorità alta — bloccano l'uso)
| Modulo | Capability | Tipo gap | Azione richiesta |

## Gap medi
[...]

## Gap minori
[...]

## Feature fantasma da rimuovere dai docs
[lista esplicita con riferimenti ai file docs da modificare]

## Decisioni che richiedono input del PO
[se ci sono ambiguità irrisolvibili dal codice]
```

---

### 🏗️ FASE 4 — REFACTORING PLAN DOCUMENTAZIONE

**Obiettivo:** proporre un nuovo assetto della documentazione interna sostenibile nel tempo (perché si disallinea sempre? root cause?).

**Azioni:**

1. Analizza l'attuale struttura docs e identifica la causa strutturale del disallineamento (docs lontani dal codice? scope vago? nessun owner? aggiornamenti manuali non enforced?)
2. Proponi una nuova struttura. Considera questi pattern (scegli quelli adatti, non tutti):
   - **Docs colocated**: README per modulo dentro la cartella del modulo
   - **Docs as code**: estrazione automatica da docstring/JSDoc/annotation
   - **ADR (Architecture Decision Records)** per scelte architetturali
   - **Living docs**: file generati da script che leggono il codice (es. lista route auto-generata)
3. Suggerisci convenzioni di manutenzione: chi aggiorna cosa, quando, enforced come (es. "ogni PR che tocca un modulo deve aggiornare il suo README, check in CI")
4. Per ogni doc esistente: archiviare / fondere / riscrivere / lasciare

**📤 Output `03_DOCS_REFACTORING_PLAN.md`:**

```markdown
# Piano di Refactoring Documentazione

## Causa root del disallineamento attuale
[diagnosi basata su evidenze raccolte durante l'audit]

## Architettura docs proposta
[albero file proposto + razionale]

## Convenzioni di mantenimento
[chi aggiorna cosa, quando, come enforced]

## Migrazione dei docs esistenti
| File attuale | Stato | Azione | Destinazione |

## Quick wins (azioni delle prossime 2 settimane)
[max 5 azioni concrete e fattibili]
```

---

### 📖 FASE 5 — MANUALE UTENTE (deliverable principale)

**Obiettivo:** manuale utente in italiano, basato esclusivamente sulle capability verificate in Fase 2.

**Struttura obbligatoria — 2 sezioni:**

#### SEZIONE A — End User (non tecnico)

Audience: persona che usa quotidianamente TGRB. Non sa cos'è un'API. Vuole sapere "come faccio a fare X?".

**Linee guida:**
- Linguaggio semplice, frasi brevi, niente gergo
- Organizzato **per workflow utente**, NON per modulo tecnico (es. "Gestire un ordine cliente dall'inizio alla fine", non "Modulo Orders")
- Ogni capitolo segue: **Cosa puoi fare → Come si fa (step-by-step) → Cosa aspettarti → Cosa fare se va storto**
- FAQ alla fine di ogni capitolo
- **Niente** riferimenti a file di codice in questa sezione

#### SEZIONE B — Manager / Amministratore (semi-tecnico)

Audience: chi configura il sistema, gestisce permessi, imposta workflow, legge report. Sa cos'è un campo configurabile, non legge codice.

**Linee guida:**
- Linguaggio tecnico ma accessibile
- Organizzato **per area di responsabilità** (gestione utenti/ruoli, configurazioni, integrazioni, reportistica, manutenzione)
- Include: cosa si configura, dove, con quali conseguenze, come fare rollback
- Sezione "Troubleshooting" per ogni area
- Riferimenti incrociati alla Sezione A dove utile

**Indice obbligatorio:**

```markdown
# Manuale Utente TGRB

## Introduzione
- Cos'è TGRB
- Chi sono i destinatari di questo manuale
- Come è organizzato

---

## SEZIONE A — Guida per l'utente operativo

### Capitolo 1: Primi passi
### Capitolo 2: [Workflow utente principale 1]
### Capitolo 3: [Workflow utente principale 2]
[...]
### Capitolo N: FAQ generali

---

## SEZIONE B — Guida per Manager/Amministratore

### Capitolo 1: Setup iniziale e configurazione
### Capitolo 2: Gestione utenti, ruoli e permessi
### Capitolo 3: [Area amministrativa 1]
[...]
### Capitolo N: Troubleshooting avanzato

---

## Appendice
- Glossario termini
- Indice analitico
- Versione manuale + data + commit hash del codice di riferimento
```

**Regola di volume:** se il manuale supera ~40.000 parole, spezza in file per capitolo + crea `04_MANUALE_UTENTE_INDEX.md` come indice. Mantieni comunque un singolo file completo per chi vuole leggere tutto.

---

### 📊 FASE 6 — EXECUTIVE SUMMARY

**Obiettivo:** 1 pagina che il PO (Marco) legge in 5 minuti per capire stato e prossimi passi.

**📤 Output `05_EXECUTIVE_SUMMARY.md`:**

```markdown
# Audit TGRB — Executive Summary

**Data audit:** YYYY-MM-DD
**Durata esecuzione:** ~N ore
**Commit di riferimento:** [git rev-parse HEAD se accessibile, altrimenti N/A]

## Salute del software
- Moduli funzionali: N
- Capability totali esposte all'utente: N
- Feature morte/disabilitate: N
- Stack: ...

## Salute della documentazione
- Health score docs: X/100
- Gap critici: N
- Feature fantasma da rimuovere: N

## Top 5 raccomandazioni in ordine di priorità
1. ...
2. ...
3. ...
4. ...
5. ...

## Manuale utente
- N° capitoli sezione A: N
- N° capitoli sezione B: N
- File: `04_MANUALE_UTENTE.md`

## Effort stimato per chiudere i gap critici
[ore/giorni a sentimento basato sulla complessità rilevata]
```

---

## 🛠️ STATE FILE — `AUDIT_STATE.md`

Mantieni questo file aggiornato durante tutta l'esecuzione. Aggiornalo dopo ogni modulo processato in Fase 2 e al termine di ogni fase.

```markdown
# Audit State
**Avviato:** YYYY-MM-DD HH:MM
**Ultimo update:** YYYY-MM-DD HH:MM
**Modalità:** autonoma end-to-end (Claude Code)

## Progresso
- [x] Fase 0 — Stack detection (completata HH:MM)
- [x] Fase 1 — Inventario (completata HH:MM)
- [ ] Fase 2 — Audit moduli (in corso)
  - [x] Modulo: orders (15 capability)
  - [x] Modulo: customers (8 capability)
  - [ ] Modulo: invoices ← QUI
  - [ ] Modulo: ...
- [ ] Fase 3 — Gap report
- [ ] Fase 4 — Refactoring plan
- [ ] Fase 5 — Manuale
- [ ] Fase 6 — Executive summary

## Note di sessione
[decisioni prese, ambiguità incontrate, file saltati e perché, moduli con [INCOMPLETO]]

## Come riprendere se interrotto
Leggi questo file. Trova il primo checkbox non spuntato. Se è in Fase 2, vai al primo modulo non spuntato. Riprendi da lì.
```

---

## 📌 REGOLE DI INTERAZIONE

- **Esecuzione autonoma:** non chiedere conferme intermedie. Vai dall'inizio alla fine.
- **Lingua:** italiano per manuale e report di sintesi, inglese per nomi tecnici (entità, endpoint, classi, file).
- **Output strutturati:** tabelle, liste, niente prosa decorativa. Ogni paragrafo deve aggiungere informazione.
- **Cita il codice** nei file di audit interni. NON nelle sezioni A/B del manuale destinate all'utente finale.
- **Mai inventare.** Se non lo vedi nel codice, non esiste.
- **Stato sempre salvato:** `AUDIT_STATE.md` aggiornato continuamente.
- **Limiti permessi:**
  - ✅ Read: tutto il repo
  - ✅ Write: solo `/docs/audit-YYYY-MM-DD/`
  - ❌ Modifica codice
  - ❌ `git commit`, `git push`, `git add`
  - ❌ Installazione pacchetti

---

## ✅ DEFINIZIONE DI "FATTO BENE"

L'audit è completo quando:

1. Tutti e 7 i file deliverable esistono in `/docs/audit-YYYY-MM-DD/`
2. `AUDIT_STATE.md` ha tutti i checkbox di Fase 0-6 spuntati
3. `04_MANUALE_UTENTE.md` permette di onboardare un nuovo dipendente (Sezione A) o un nuovo manager (Sezione B) senza altre spiegazioni
4. Ogni capability del manuale è tracciabile fino a un file di codice reale (verificabile da `01_AUDIT_PER_MODULO.md`)
5. `05_EXECUTIVE_SUMMARY.md` è leggibile in 5 minuti e dice cosa fare nelle prossime 2 settimane

---

## 🚀 AVVIO

**Inizia ora dalla Fase 0.** Crea subito la cartella `/docs/audit-YYYY-MM-DD/` (sostituisci con data odierna) e il file `AUDIT_STATE.md` con la struttura sopra. Poi parti con la stack detection.

Usa `TodoWrite` come prima azione per pianificare le 6 fasi.

Concludi l'intera pipeline con il messaggio:

> *"Audit completato. Apri `/docs/audit-YYYY-MM-DD/05_EXECUTIVE_SUMMARY.md` per la sintesi."*
