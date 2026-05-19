# 🔬 CLAUDE CODE PROMPT — Verifica di Plausibilità Audit TRGB

> **Tool:** Claude Code (terminale, sessione NUOVA)
> **Modalità:** verifica indipendente, autonoma
> **Permessi:** read tutto, write solo su `/docs/audit-2026-05-19/VERIFICA_*.md`
> **Durata stimata:** 30-60 minuti
> **Output:** singolo file `VERIFICA_PLAUSIBILITA.md` con verdetto

---

## 🎯 RUOLO E CONTESTO

Agisci come **Auditor Indipendente Senior** incaricato di verificare la qualità di un audit precedente svolto da un'altra istanza Claude Code.

**Contesto:** in `/docs/audit-2026-05-19/` esistono 7 deliverable prodotti in una sessione precedente di ~1.5 ore. Il PO (Marco) ha un sospetto legittimo: **1.5 ore sono poche per auditare seriamente 416 capability su 14 moduli**. Il tuo compito è capire se il lavoro è solido o se molti dettagli sono inferiti dalla struttura senza essere verificati nel codice.

**Il tuo job NON è completare l'audit. NON è migliorare i deliverable. NON è difendere il lavoro precedente.**

**Il tuo unico job è dare un verdetto onesto basato su evidenze campionarie.** Se il lavoro è buono, lo dici. Se è gonfiato, lo dici. Se è in mezzo, descrivi esattamente dove.

---

## ⚠️ REGOLE INVIOLABILI

1. **Approccio adversarial calibrato.** Cerchi attivamente errori, non li eviti. Ma non inventare problemi dove non ci sono: ogni accusa deve avere un'evidenza concreta nel codice.
2. **Niente difesa del lavoro precedente.** Se trovi un'imprecisione, la riporti. Se trovi un'invenzione, la riporti. Niente "probabilmente intendeva...".
3. **Solo evidenze verificabili.** Ogni claim della verifica ha un riferimento `path/file.ext:linea` reale che Marco può aprire.
4. **Niente over-claiming opposto.** Non dichiarare "tutto sbagliato" su base di 2 errori. Tieni le proporzioni.
5. **Write only:** scrivi UN solo file: `/docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md`. Non toccare nient'altro.

---

## 📋 PROTOCOLLO DI VERIFICA

Esegui questi 5 test in ordine. Ognuno produce un punteggio e contribuisce al verdetto finale.

---

### TEST 1 — Spot-check capability random (peso 40%)

**Obiettivo:** verificare che le capability documentate in `01_AUDIT_PER_MODULO.md` corrispondano a codice reale.

**Procedura:**

1. Apri `01_AUDIT_PER_MODULO.md`
2. **Seleziona 12 capability random** con questi criteri:
   - 3 dal modulo `vini` (71 capability dichiarate — il modulo più ricco)
   - 2 da `ricette + selezioni del giorno`
   - 2 da `acquisti`
   - 2 da `task_manager + haccp` (dichiarato come gap critico CRIT-4)
   - 2 da `platform`
   - 1 da `cucina` (solo 4 capability — campione di controllo)
3. Per ogni capability, **verifica nel codice reale:**
   - Il file referenziato esiste? (`path/file.ext`)
   - La linea referenziata è effettivamente vicina (±20 linee) all'endpoint/funzione descritta?
   - Il **trigger** dichiarato (es. `POST /api/orders`) è davvero registrato in quel file?
   - Le **precondizioni** e **validazioni** elencate sono effettivamente presenti nel codice?
   - L'**effetto** descritto (side effects: email, log, record modificati) è verificabile leggendo il codice?
4. Classifica ogni capability verificata:
   - 🟢 **Accurata**: tutto corrisponde
   - 🟡 **Imprecisa**: l'endpoint esiste ma alcuni dettagli (validazioni, side effects) sono mancanti o inferiti
   - 🔴 **Inventata**: il file non esiste, la linea non c'entra, o l'endpoint non è registrato come descritto
   - ⚪ **Non verificabile**: codice troppo complesso/indiretto per giudicare in tempo ragionevole — non penalizza il punteggio

**Punteggio Test 1:** (n° 🟢 × 1.0 + n° 🟡 × 0.5 + n° 🔴 × 0 + n° ⚪ esclusi) / (totale verificabili) × 100

**Soglie verdetto:**
- ≥ 85% → "Spot-check superato. L'audit ha lavorato sul codice reale."
- 60-85% → "Spot-check parziale. Molti dettagli reggono, alcuni sono inferiti."
- < 60% → "Spot-check fallito. Una quota significativa di capability non corrisponde al codice come descritto."

---

### TEST 2 — Verifica conteggio capability (peso 15%)

**Obiettivo:** capire se "416 capability" è un numero reale o inflazionato.

**Procedura:**

1. Prendi 3 moduli per i quali è dichiarato un numero specifico:
   - `vini` (71 dichiarate)
   - `cassa + chiusure turno` (26 dichiarate)
   - `task_manager + haccp` (20 dichiarate)
2. Per ognuno, fai un conteggio indipendente:
   - Usa `Grep` per contare tutti i decorator di endpoint nei router files del modulo (`@router.get`, `@router.post`, `@router.put`, `@router.delete`, `@router.patch`)
   - Conta i comandi CLI / job schedulati / event listener se presenti
   - Confronta con il dichiarato
3. Calcola lo scarto:
   - Se conteggio reale ≈ dichiarato (±15%) → conteggio onesto
   - Se conteggio reale > dichiarato (audit ha sottostimato) → ok, l'audit è prudente
   - Se conteggio reale << dichiarato (es. dichiarato 71 ma endpoint reali 35) → red flag: stanno gonfiando i numeri

**Output:** tabella `modulo | dichiarato | reale | scarto | giudizio`

---

### TEST 3 — Verifica gap critici (peso 25%)

**Obiettivo:** i 5 CRIT in `02_GAP_REPORT.md` sono reali? Le feature dichiarate "non documentate" lo sono davvero?

**Procedura:**

Per ognuno dei 5 CRIT:

1. **CRIT-1 (Fatture in Cloud):** Verifica che esistano davvero "12 endpoint live" per FIC. Usa `Grep` per cercare router/endpoint che toccano FIC. Poi cerca nei docs (`docs/*.md`) se è davvero non documentato come dichiarato.
2. **CRIT-2 (Selezioni del Giorno):** Verifica esistenza dei "5 router quasi-gemelli" (macellaio, salumi, formaggi, pescato, piatti). Cerca nei docs eventuali menzioni.
3. **CRIT-3 (Chiusure turno):** Verifica che esistano ~12 endpoint chiusure turno. Verifica che `docs/modulo_selezioni.md` ne parli solo parzialmente come dichiarato.
4. **CRIT-4 (Task Manager + HACCP):** Verifica esistenza del modulo `task_manager`. Cerca nei docs `docs/modulo_task*` o simili.
5. **CRIT-5 (NOMEN-1 Selezioni):** Verifica che esistano davvero DUE significati distinti di "Selezioni" — uno in `ricette`, uno in `cassa`. Questo è il claim semantico più importante dell'audit.

**Classificazione per ogni CRIT:**
- 🟢 **Confermato:** il gap è reale ed è stato descritto bene
- 🟡 **Parzialmente confermato:** il gap c'è ma esagerato o impreciso
- 🔴 **Non confermato:** il gap non esiste o è stato male identificato

**Punteggio Test 3:** (n° 🟢 × 1.0 + n° 🟡 × 0.5) / 5 × 100

---

### TEST 4 — Verifica omissioni (peso 10%)

**Obiettivo:** l'audit ha **mancato** cose ovvie? Questo è il test opposto dei precedenti: invece di verificare cosa c'è, cerca cosa manca.

**Procedura:**

1. Scegli 2 router files **non citati esplicitamente** in `01_AUDIT_PER_MODULO.md` (o citati molto brevemente)
2. Leggi quei file e identifica tutti gli endpoint
3. Verifica se almeno gli endpoint principali compaiono nelle capability del rispettivo modulo nell'audit
4. Se trovi endpoint significativi mai menzionati → omissione

**Output:** lista di omissioni con riferimento al file e all'endpoint mancante. Se non ne trovi, dichiaralo esplicitamente.

---

### TEST 5 — Sanity check manuale utente (peso 10%)

**Obiettivo:** il manuale `04_MANUALE_UTENTE.md` (6000 parole, 25 capitoli) è uno scheletro o un manuale finito?

**Procedura:**

1. Conta parole totali del manuale
2. Calcola parole medie per capitolo
3. Prendi 3 capitoli random e valuta:
   - Sono auto-sufficienti (un utente reale può seguirli e fare l'azione)?
   - Hanno step concreti o solo descrizioni generiche?
   - Citano feature verificate nell'audit?

**Verdetto:**
- > 500 parole medie/capitolo + step concreti → manuale operativo
- 200-500 parole medie + step generici → scheletro buono da espandere
- < 200 parole medie → solo indice/placeholder

---

## 📤 OUTPUT — `VERIFICA_PLAUSIBILITA.md`

Struttura obbligatoria:

```markdown
# Verifica Indipendente Audit TRGB

**Data verifica:** YYYY-MM-DD
**Verificatore:** Claude Code (sessione indipendente)
**Audit verificato:** `/docs/audit-2026-05-19/` (svolto 2026-05-19, durata dichiarata 1.5 ore)
**Tempo speso per la verifica:** ~N minuti

---

## 🎯 VERDETTO IN UNA RIGA

[Una riga sintetica: "Audit affidabile / Audit affidabile con riserve / Audit gonfiato / Audit inaffidabile" + perché]

---

## 📊 PUNTEGGIO COMPLESSIVO

| Test | Peso | Punteggio | Contributo |
|---|---|---|---|
| 1. Spot-check capability | 40% | X/100 | ... |
| 2. Conteggio capability | 15% | X/100 | ... |
| 3. Verifica gap critici | 25% | X/100 | ... |
| 4. Verifica omissioni | 10% | X/100 | ... |
| 5. Sanity manuale | 10% | X/100 | ... |
| **Totale ponderato** | 100% | **X/100** | |

**Soglie di affidabilità:**
- ≥ 85: audit affidabile, usabile come deliverable
- 65-84: audit affidabile come mappa macro, dettagli da verificare caso per caso
- 45-64: audit utile come gap analysis, dettagli inaffidabili
- < 45: audit da rifare con più tempo

---

## 🔬 TEST 1 — Spot-check capability random

[Tabella con 12 capability verificate, classificazione, evidenza nel codice]

| # | Modulo | Capability | File:linea dichiarato | Verifica | Note |

**Punteggio Test 1:** X/100

---

## 🔬 TEST 2 — Conteggio capability

[Tabella conteggi]

---

## 🔬 TEST 3 — Verifica gap critici

[Per ogni CRIT-1..5: evidenza, classificazione, note]

---

## 🔬 TEST 4 — Omissioni

[Lista o "Nessuna omissione significativa trovata"]

---

## 🔬 TEST 5 — Sanity manuale

[Parole totali, medie per capitolo, valutazione 3 capitoli random]

---

## 🚨 PROBLEMI RILEVATI (in ordine di gravità)

[Lista di issue concrete, ognuna con evidenza. Se nessuna: dirlo esplicitamente.]

---

## ✅ COSA REGGE BENE

[Cose dell'audit che sono effettivamente solide e ben fatte. Non per gentilezza — per onestà bilanciata.]

---

## 💡 RACCOMANDAZIONI A MARCO

[3-5 azioni concrete: cosa fidarsi, cosa riverificare manualmente, cosa rilanciare se necessario.]
```

---

## 🛠️ NOTE OPERATIVE

- **Sessione nuova.** Se possibile, lancia questa verifica in una sessione Claude Code distinta da quella dell'audit originale, per ridurre il bias di self-confirmation.
- **Budget tool call:** ~80-120 tool call totali distribuite sui 5 test. Se ne usi meno di 50 hai probabilmente saltato dei controlli.
- **Niente diplomazia.** Il valore di questa verifica è proporzionale alla sua schiettezza. Marco preferisce un verdetto duro e utile a un verdetto morbido e inutile.
- **Se trovi che l'audit è effettivamente solido:** dillo chiaramente. Non inventare problemi per giustificare la verifica.

---

## 🚀 AVVIO

Inizia subito creando `VERIFICA_PLAUSIBILITA.md` con la struttura sopra (sezioni vuote), poi popolale procedendo test per test. Aggiorna il file dopo ogni test completato (così se ti interrompono c'è parziale).

Concludi con il messaggio:

> *"Verifica completata. Verdetto in `/docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md` — punteggio complessivo X/100."*
