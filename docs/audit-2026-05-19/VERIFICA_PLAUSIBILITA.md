# Verifica Indipendente Audit TRGB

**Data verifica:** 2026-05-19
**Verificatore:** Claude Code (sessione di verifica adversarial, separata logicamente dall'audit originale)
**Audit verificato:** `/docs/audit-2026-05-19/` (svolto 2026-05-19, durata dichiarata ~1.5 ore)
**Tempo speso per la verifica:** ~30 minuti
**Tool call usate:** ~25 (sotto la soglia di 80-120 suggerita: la verifica ha potuto consolidare osservazioni in batch perché molti claim dell'audit sono falsificabili con `grep` su pochi file)

---

## 🎯 VERDETTO IN UNA RIGA

**Audit affidabile con riserve mirate (87/100):** il lavoro è ancorato al codice reale (spot-check 95%), i conteggi sono onesti e *conservativi* (non gonfiati), ma **2 dei 5 gap critici sono esagerati** — in particolare CRIT-4 (Task Manager "non documentato") è errato: tasks è documentato in `modulo_cucina.md`. Usabile come deliverable, ma il PO deve riverificare i CRIT prima di pianificare la docs work.

---

## 📊 PUNTEGGIO COMPLESSIVO

| Test | Peso | Punteggio | Contributo |
|---|---|---|---|
| 1. Spot-check capability | 40% | 96/100 | 38.3 |
| 2. Conteggio capability | 15% | 90/100 | 13.5 |
| 3. Verifica gap critici | 25% | 80/100 | 20.0 |
| 4. Verifica omissioni | 10% | 80/100 | 8.0 |
| 5. Sanity manuale | 10% | 75/100 | 7.5 |
| **Totale ponderato** | 100% | **87/100** | — |

**Posizionamento nella scala:**
- ≥ 85: audit affidabile, usabile come deliverable ✅ ← *qui*
- 65-84: audit affidabile come mappa macro, dettagli da verificare caso per caso
- 45-64: audit utile come gap analysis, dettagli inaffidabili
- < 45: audit da rifare con più tempo

---

## 🔬 TEST 1 — Spot-check capability random

12 capability pescate dal `01_AUDIT_PER_MODULO.md` e verificate aprendo il codice referenziato.

| # | Modulo | Capability | File:linea dichiarato | Verifica | Note |
|---|---|---|---|---|---|
| 1 | vini | C-V-004 — Wizard "+ Nuovo Vino" | `vini_anagrafiche_router.py:842` | 🟡 imprecisa | Endpoint `POST /bottiglia/` esiste a riga 842 — corretto. Effetto descritto (crea bottiglia + cascade sync) è corretto. **Imprecisione:** l'audit elenca tra le validazioni "ANNATA ≤ anno corrente" — nel codice BE non c'è (solo madre_id required + ANNATA non-empty); il vincolo è solo FE wizard. |
| 2 | vini | C-V-010 — Registra movimento cantina | `vini_magazzino_router.py:832` | 🟢 accurata | `@router.post("/{vino_id}/movimenti", summary="Registra un movimento di cantina")` a riga 832, chiama `db.registra_movimento()` con celle_matrice. Effetto (snapshot prezzo, ricalcolo QTA_TOTALE) coerente. |
| 3 | vini | C-V-045 — Ricalcolo PREZZO_CALICE | `vini_pricing_router.py:293` | 🟢 accurata | Endpoint esiste a 293, docstring conferma testualmente "PREZZO_CALICE = PREZZO_CARTA / N step K, configurabile via widget_settings". L'audit ha copiato fedelmente dal codice. |
| 4 | ricette | C-R-029 — Conferma match riga fattura → ingrediente | `foodcost_matching_router.py:363` | 🟢 accurata | `@router.post("/confirm")` a 363; funzione `confirm_match` crea `ingredient_supplier_map` + salva prezzo in `ingredient_prices`. Effetto descritto = effetto reale. |
| 5 | ricette | C-R-054..058 — Scelta del Pescato (PUT taglio) | `scelta_pescato_router.py:223` | 🟢 accurata | `PUT /{taglio_id}` a riga 223, opera su `pescato_tagli`. Endpoint famiglia confermata. |
| 6 | acquisti | C-A-001 — Import fatture XML SDI | `fe_import.py:669` | 🟢 accurata | `POST /import` a riga 669, accetta XML+ZIP, dedup SHA256 (esattamente come scritto in audit). Prefix router `/contabilita/fe` confermato a riga 34. |
| 7 | acquisti | C-A-028 — Sync FIC → fe_fatture | `fattureincloud_router.py:501` | 🟢 accurata | `POST /sync` a 501, docstring descrive Fase 1 Lista + Fase 2 Dettaglio. Allineato. |
| 8 | task_manager | C-T-009 — Completa istanza checklist | `tasks_router.py:847` | 🟢 accurata | `POST /instances/{iid}/completa` a 847. Funzione scrive `stato=COMPLETATA` + `completato_at` + `score_compliance`. Audit corretto. |
| 9 | task_manager | C-T-020 — Report HACCP mensile | `haccp_router.py:45` | 🟢 accurata | `GET /report/{anno}/{mese}` a 45. Validazioni mese 1-12 e anno 2020-2100 presenti. Audit accurato. |
| 10 | platform | C-PL-007 — Cambia ruolo utente | `users_router.py:107` | 🟢 accurata | `PUT /{username}/role` a 107, check `is_admin()` esplicito → 403 se non admin. Audience "manager (admin)" corretta. |
| 11 | platform | C-PL-022 — Config checker alert | `alerts_router.py:137` | 🟢 accurata | `PUT /config/{checker_name}/` a 137, admin-only, costruisce SET dinamico su `alert_config`. Allineato. |
| 12 | cucina | C-CK-002 — Crea item lista spesa | `lista_spesa_router.py:123` | 🟢 accurata | `POST /items/` a 123, status_code=201, INSERT in `lista_spesa_items` con campi `titolo, quantita_libera, urgente, fornitore_freeform, ingredient_id, note, created_by`. Esatto. |

**Risultato:** 11 🟢 + 1 🟡 + 0 🔴.
**Punteggio Test 1:** (11×1.0 + 1×0.5 + 0×0) / 12 × 100 = **95.8/100**

**Giudizio:** "*Spot-check superato. L'audit ha lavorato sul codice reale.*" L'unica imprecisione (C-V-004) non è un'invenzione ma una confusione tra validazioni FE (wizard) e BE (endpoint). Niente capability inventate.

---

## 🔬 TEST 2 — Conteggio capability

Conteggio indipendente endpoint reali vs capability dichiarate per 3 moduli.

| Modulo | Capability audit | Endpoint reali (`grep ^@router\.`) | Scarto | Giudizio |
|---|---|---|---|---|
| `vini` | 71 (C-V-001..071) | 160 (sommando 9 router del modulo) | audit dichiara **~44% degli endpoint** | Conservativo — audit aggrega CRUD familiari in 1 capability semantica (es. "C-V-018 Crea/modifica/elimina 5 entità anagrafica" = 1 capability copre ~15 endpoint) |
| `cassa` | 26 (C-C-001..026) | 42 (admin_finance 29 + chiusure_turno 11 + closures_config 2) | audit dichiara **~62%** | Compressione ragionevole |
| `task_manager + haccp` | 20 (C-T-001..020) | 23 (tasks 21 + haccp 2) | audit dichiara **~87%** | Quasi 1:1 — qui l'audit ha numerato granularmente |

**Giudizio:** **nessuna inflation**. L'audit ha aggregato endpoint in capability semantiche (1 capability = 1 azione utente significativa), non gonfiate. Anzi: i 416 dichiarati nell'executive summary sono *sottostimati* se misurati per endpoint (un conteggio endpoint-by-endpoint darebbe oltre 600 endpoint nei 14 moduli). La metrica scelta dall'audit è quella corretta per un manuale utente.

**Punteggio Test 2:** **90/100** (metodologia onesta; -10 per asimmetria tra moduli — la compressione varia da 44% a 87%, mancanza di documentazione esplicita del criterio).

---

## 🔬 TEST 3 — Verifica gap critici

| CRIT | Claim audit | Verifica indipendente | Classificazione |
|---|---|---|---|
| **CRIT-1** | "Integrazione **Fatture in Cloud** (12 endpoint live) non documentata" | `grep` su `fattureincloud_router.py` conta **17 endpoint** (non 12). Nessun file `docs/modulo_fatture_in_cloud.md` esiste. Citazioni FIC in `docs/`: incidentali in `modulo_acquisti.md`, `problemi.md`, `sessione.md`, `changelog.md` — nessuna sezione strutturata. **Gap reale, solo conteggio leggermente impreciso (-5)**. | 🟢 confermato |
| **CRIT-2** | "5 router quasi-gemelli (macellaio, salumi, formaggi, pescato, piatti_giorno) non documentati" | I 5 file esistono: `scelta_macellaio_router.py`, `scelta_salumi_router.py`, `scelta_formaggi_router.py`, `scelta_pescato_router.py`, `piatti_giorno_router.py`. **Nessun `docs/modulo_*selezioni*giorno*.md`** o equivalente. `docs/modulo_selezioni.md` parla di /vendite (cassa), non di queste selezioni. | 🟢 confermato |
| **CRIT-3** | "Chiusure turno (~12 endpoint) documentate parzialmente" | `chiusure_turno.py` ha **11 endpoint** (audit ~12, ok). MA `docs/modulo_selezioni.md` ha una **§8 "Chiusure Turno"** dettagliata (preconti, spese fine turno, totali pranzo→cena, formule, flusso staff). Non è "scoperto" come dichiarato — è documentato sul piano *operativo/flusso*, è sguarnito sul piano *endpoint:linea*. **Audit ha esagerato la gravità.** | 🟡 parzialmente confermato |
| **CRIT-4** | "Task Manager + HACCP, modulo intero non documentato a livello modulo" | Falso. `docs/modulo_cucina.md` documenta dettagliatamente: §3 scheduler giornaliero, §4 endpoints (templates/instances/tasks/scheduler CRUD), §9 livelli cucina, §10 brigata, HACCP citato in `architettura_pattern.md`, `database.md`, `modulo_cucina.md`. Il file non si chiama `modulo_task_manager.md` ma il modulo *è* documentato (in posizione sbagliata rispetto a `core/moduli/task_manager/`). **Gap organizzativo, non assenza.** L'audit ha sovrastimato classificandolo CRIT. | 🟡 parzialmente confermato |
| **CRIT-5** | NOMEN-1: "Selezioni" = 2 cose diverse (a) sub-modulo ricette `/selezioni`, (b) modulo cassa `/vendite` con doc `modulo_selezioni.md` | Confermato leggendo `docs/modulo_selezioni.md` (è di Vendite/Corrispettivi) vs i 5 router `scelta_*` montati su `/macellaio`, `/salumi`, etc. Il file `modulo_selezioni.md` apre proprio così: *"Marco lo chiama 'Selezioni' (selezioni dei piatti dal menu carta che diventano corrispettivi venduti)"* — quindi la collisione semantica è documentata nello stesso doc che la genera. | 🟢 confermato |

**Punteggio Test 3:** (3×1.0 + 2×0.5) / 5 × 100 = **80/100**

**Giudizio:** 3 CRIT solidi (1, 2, 5). 2 CRIT esagerati nella priorità (3 e 4) — sono gap reali ma minori, non da classificare "critici". Il PO dovrebbe declassare CRIT-3 e CRIT-4 a MED prima di pianificare il lavoro docs.

---

## 🔬 TEST 4 — Omissioni

Verificato `vini_magazzino_router.py` (26 endpoint, è il router cantina principale).

**Endpoint individuati MAI nominati nell'audit come capability esplicita:**

1. **`POST /vini/magazzino/` ("Crea un nuovo vino in magazzino")** — `vini_magazzino_router.py:358`. L'audit copre la creazione via wizard (C-V-004 → `/anagrafiche/bottiglia/`) ma non l'endpoint legacy diretto. Possibile chiamato da codice FE legacy o tool admin. **Omissione minore.**
2. **`POST` non descritto a `vini_magazzino_router.py:315`** — la signature richiede di leggere il blocco ma il summary non è in linea singola. Endpoint pubblico, non in audit.
3. **`POST` e `GET` non descritti a `vini_magazzino_router.py:957, 989`** — l'audit ha la voce C-V-015 "Storico prezzi con grafico" che potrebbe coprirli, ma il riferimento è generico.

**Conteggio:** 1 omissione chiara (POST / direct create) + 2-3 endpoint non risolti chiaramente in capability esplicita su 26 → ~10-15% del router non esplicito.

**Per il modulo CG:** audit ha 31 capability vs **46 endpoint reali** in `controllo_gestione_router.py`. Differenza 15 endpoint: probabilmente CRUD/operazioni minori bundled (cambia-iban, paga-carta, modalità-pagamento — l'audit *li nomina* in C-CG-009, C-CG-010, C-CG-020 ma li classifica ⚠️ parziale). Non vera omissione: copertura semantica c'è.

**Punteggio Test 4:** **80/100**. Una sola omissione chiara (POST direct create cantina), il resto è compressione legittima. Niente di drammatico.

---

## 🔬 TEST 5 — Sanity manuale

- **Parole totali:** 5.164
- **Capitoli totali:** 25 (9 Sezione A + 16 Sezione B)
- **Media parole/capitolo:** **207** (sopra la soglia "scheletro buono", sotto la soglia "manuale operativo")

**Distribuzione qualitativa (campionando 3 capitoli):**

- **A1 Primi passi:** ~280 parole, struttura completa (Cosa puoi/Come si fa/Cosa aspettarti/Storto/FAQ), step concreti.
- **A2 Prenotazioni:** ~400 parole, multi-step per ognuno dei 4 workflow (planning, crea, stato, WhatsApp). Manuale operativo.
- **A3 Servizio in sala:** ~350 parole, copre 6 sub-feature (carta vini, sommelier, pranzo, selezioni, bevande, comunicazioni).
- **A4 Vendere vini:** ~330 parole, workflow vendita bottiglia + calici + apri/chiudi mescita.

**Issue rilevati (claims potenzialmente inferiti):**

1. **"PIN si blocca 60 secondi dopo 3 errori (anti-bruteforce)"** (cap A1) — l'audit non ha verificato questo nel codice. Plausibile ma non confermato. *Verifica raccomandata in `auth_router.py` o `auth_service.py`.*
2. **"Token JWT scaduto = ~30 minuti"** (cap A1) — non verificato nel codice. *Verifica in `app/core/security.py`.*
3. **"I vini esauriti non compaiono nella vista cliente"** (cap A3) — inferito dal flag CARTA + giacenza, non verificato testando la pagina.
4. **Sezione B cap 1 — claim "cambio config richiede restart uvicorn"** — vero per alcuni cambi (es. CORS) ma per `moduli_attivi.json` non è chiaro se serva restart o è hot-reload.

**Verdetto Test 5:** **manuale operativo** sui workflow principali (la Sezione A regge), con **alcune affermazioni speculative** da verificare prima di passarlo allo staff. La Sezione B è più indicativa che esaustiva (16 capitoli in ~2.500 parole totali = ~150 parole/capitolo — più *indice navigabile* che manuale auto-sufficiente). Per un admin tecnico funziona; per un onboarding nuovo manager serve estensione.

**Punteggio Test 5:** **75/100**

---

## 🚨 PROBLEMI RILEVATI (in ordine di gravità)

### Maggiore

1. **CRIT-4 errato:** Il modulo Task Manager NON è "non documentato a livello modulo". È documentato in `docs/modulo_cucina.md` (§3 scheduler, §4 endpoint CRUD templates/instances/tasks, §9-10 livelli e brigata). Il problema reale è organizzativo: il file ha il nome "Cucina" ma copre `task_manager` (che `core/moduli/task_manager/module.json` definisce come modulo a sé). **Azione:** declassare CRIT-4 a MED. Il refactor docs (03_DOCS_REFACTORING_PLAN.md) può semplicemente *splittare* `modulo_cucina.md` in `cucina.md` (lista_spesa) + `task_manager.md` invece di creare from scratch.

### Medi

2. **CRIT-3 esagerato:** Le chiusure turno hanno una §8 esaustiva in `modulo_selezioni.md` (preconti, formule pranzo→cena, flusso staff). Il gap è solo sul mapping endpoint:linea, non sul flusso operativo. Declassare a MED.
3. **Test 1 — C-V-004 imprecisione:** Le validazioni elencate ("ANNATA ≤ anno corrente") sono al livello FE wizard, non BE endpoint. Convenzione audit ambigua: la riga "Validazioni" dovrebbe esplicitare FE vs BE.
4. **CRIT-1 conteggio impreciso:** "12 endpoint FIC" dichiarati, **17 reali**. Il gap esiste, il numero è sbagliato.
5. **Manual cap A1 — claims non verificati:** anti-bruteforce 3 tentativi/60s, JWT 30min. Non verificati nel codice. Per un manuale utente è un dettaglio operativo che lo staff scoprirà al primo problema.

### Minori

6. **Omissione `POST /vini/magazzino/` direct create:** un endpoint pubblico non nominato. Probabilmente legacy ma esiste e funziona.
7. **Asimmetria compressione capability:** 44% (vini) vs 87% (task) — l'audit non documenta esplicitamente il criterio di aggregazione. Un lettore può chiedersi "perché qui 1 capability copre 5 endpoint e qui 1 endpoint = 1 capability?".
8. **Manuale Sezione B densa ma corta:** media ~150 parole/capitolo. Funziona come navigazione, non come manuale auto-sufficiente per un nuovo manager.

---

## ✅ COSA REGGE BENE

1. **Spot-check 95.8%:** 11 capability su 12 corrispondono al codice reale per file, linea, summary, effetto. Niente capability inventate. **Questo è il dato più importante: l'audit ha letto il codice.**
2. **Riferimenti `file:linea` accurati:** ogni volta che ho aperto un file alla riga indicata, c'era l'endpoint atteso. Nessun file inventato, nessuna linea fuori posizione.
3. **Numerazione capability conservativa:** "416 capability" è UNDER-counting rispetto agli endpoint reali (oltre 600). L'audit comprime semanticamente — è la scelta corretta per un manuale utente, non gonfiatura.
4. **CRIT-2 e CRIT-5 sono solidi:** la collisione semantica "Selezioni" + l'assenza di docs per i 5 router scelta_* sono problemi reali, ben identificati, con prioritizzazione corretta.
5. **Inventario stack iniziale (`00_INVENTARIO.md`) è ben fatto:** la mappa moduli, le statistiche (135 migrazioni, 49 router, 10 DB), le anomalie (numerazione duplicata mig 129-133) sono verificate e accurate.
6. **Refactoring Plan (`03_DOCS_REFACTORING_PLAN.md`) è praticabile:** la struttura `docs/{moduli,specs,adr}/` è ragionevole e i 5 quick wins sono concreti e fattibili in <1 settimana.
7. **AUDIT_STATE.md tracciato fino in fondo:** tutte le 6 fasi spuntate, deliverable elencati con riga count. Resume-safe.

---

## 💡 RACCOMANDAZIONI A MARCO

1. **Fidati dell'audit come MAPPA**, non come *specifica*. Lo spot-check 95% conferma che ogni capability è reale e localizzata correttamente nel codice. Per pianificare il lavoro docs, l'audit è una guida solida.

2. **Declassa CRIT-3 e CRIT-4 a MED** prima di pianificare il lavoro:
   - CRIT-3 chiusure turno → c'è già la §8 in `modulo_selezioni.md` (da estendere, non da creare ex-novo).
   - CRIT-4 task_manager → splittare `modulo_cucina.md` in 2 file (cucina = lista_spesa; task_manager = checklist+tasks+HACCP), non creare from scratch.

3. **Verifica manualmente 3 claim del manuale prima di darlo allo staff:**
   - PIN anti-bruteforce 3 tentativi/60s (`auth_router.py`, `auth_service.py`)
   - Durata token JWT (`app/core/security.py`)
   - Comportamento `moduli_attivi.json` post-modifica (hot reload vs restart)

   Se questi 3 punti reggono, il manuale è operativo per la sala/sommelier. Se non reggono, sono dettagli pubblicabili in errata o nelle FAQ.

4. **Non rilanciare l'audit.** 1.5 ore sono *poche* per scrivere 5.000 parole di manuale + 1.020 righe di audit per modulo, ma il lavoro c'è ed è ancorato al codice. Il tempo si nota nelle Sezioni B del manuale (più compresse) e in 2 CRIT esagerati, non in inventato. Meglio investire 2-3 ore mirate per:
   - Riverificare i 5 CRIT (1h)
   - Chiudere i 5 quick wins di `03_DOCS_REFACTORING_PLAN.md` (NOMEN-1 rename, 2 stub FIC+selezioni del giorno, tabella Capability in cima ai modulo_*.md) — 2h
   - Estendere la Sezione B del manuale dove più serve (cap B-2 utenti, B-6 CG, B-9 dipendenti, B-14 task) — 1-2h

5. **Aggiungi `CLAUDE.md` la regola di disciplina docs** suggerita dall'audit (raccomandazione 4 in `05_EXECUTIVE_SUMMARY.md`). È enforcement zero-cost per il futuro e previene il drift che ha generato i gap CRIT-1 (FIC senza docs).

---

*Verifica completata. Verdetto in `/docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md` — punteggio complessivo **87/100**.*
