# A8 — Delta documentazione vs audit 2026-05-19

> Audit 2026-06-12 · Commit HEAD `1f5f9c17` (2026-06-09) · VERSION 5.24 · Subagente A8
> Baseline: `docs/audit-2026-05-19/` (02_GAP_REPORT.md, 05_EXECUTIVE_SUMMARY.md, 01_AUDIT_PER_MODULO.md). Health docs baseline: **73/100** (302✅ / 74⚠️ / 40🆕 su 416 capability).
> Metodo: solo lettura repo locale. 66 commit dal 19/5 (`git log --oneline --since=2026-05-19`). Nessun accesso VPS: le voci che richiedono il server sono marcate **[NON VERIFICATO da locale]**.

---

## 1. Stato dei gap del GAP_REPORT precedente

### 1.1 I 5 CRIT

| ID | Gap | Stato 2026-06-12 | Evidenza |
|---|---|---|---|
| **CRIT-1** | FIC non documentato | **CHIUSO come STUB** (⚠️, non ✅) | `docs/modulo_fatture_in_cloud.md` esiste, 137 righe, creato 2026-05-19 (commit `87e124b9`). Tabella completa dei 17 endpoint reali con metodo/path/riga (righe 26-44). §3-§7 marcati "Da estendere in sessione dedicata". Copre tutti gli endpoint citati nel gap (status/connect/sync/warnings/sync-log/fornitori + refetch XML). |
| **CRIT-2** | Selezioni del Giorno non documentate | **CHIUSO come STUB** (⚠️) | `docs/modulo_selezioni_giorno.md` esiste, 107 righe, creato 2026-05-19. Copre i 5 router (`scelta_macellaio/salumi/formaggi/pescato/piatti_giorno`), pattern comune 10 endpoint, 24 capability C-R-039…062, disambiguazione NOMEN-1 in §0. Mapping endpoint:linea rinviato (§7). |
| **CRIT-3** | Chiusure turno docs parziali | **DECLASSATO A MED (decisione PO 2026-05-19), parzialmente coperto** | `docs/modulo_vendite.md` (415 righe) §9 copre il flusso operativo completo (pranzo/cena, pre-conti, spese, quadratura); riga 247 dichiara esplicitamente: "il router `chiusure_turno.py` espone 11 endpoint reali… Da estendere questa tabella in sessione docs dedicata" (= DH.4 DA FARE in roadmap §DH). |
| **CRIT-4** | task_manager/HACCP senza doc modulo | **APERTO** (declassato a MED dall'adversarial: contenuti già in `modulo_cucina.md`) | `docs/modulo_task_manager.md` e `docs/modulo_haccp.md` **non esistono** (`wc: No such file or directory`). Lo split da `modulo_cucina.md` è DH.5 in `roadmap.md:636`, "DA FARE — media". I contenuti (checklist, HACCP, scheduler) restano in `modulo_cucina.md` righe 32-63. |
| **CRIT-5** | NOMEN-1 confusione "Selezioni" | **CHIUSO** | `docs/modulo_selezioni.md` ridotto a file-puntatore di 23 righe ("RINOMINATO 2026-05-19"); `docs/modulo_vendite.md` creato con §0 Disambiguazione; `modulo_selezioni_giorno.md` §0 idem; CLAUDE.md ha la regola di disambiguazione. Commit `87e124b9`. |

**Sintesi CRIT: 3 chiusi (di cui 2 come stub ⚠️), 1 parziale-declassato, 1 aperto-declassato.**

### 1.2 I 20 MED (campionati TUTTI via grep sui doc canonici)

| ID | Verifica (grep) | Stato |
|---|---|---|
| MED-1 carta-cliente pubblica | `carta-cliente` assente da `modulo_vini.md` | APERTO |
| MED-2 bulk-update magazzino | `bulk-update` assente da `modulo_vini.md` | APERTO |
| MED-3 toolset migrazione matrice | `recalc-preview/import-old/recalc-all` assenti | APERTO |
| MED-4 service types ricette | nessuna sezione in `modulo_ricette_foodcost.md` (solo menzione incidentale riga 86) | APERTO |
| MED-5 allergeni | solo campo in tabella (righe 142,168); riga 405 lo segna ancora come debt | APERTO |
| MED-6 PDF ricetta | riga 396 lo elenca ancora come roadmap futura; nel frattempo esiste "stampa scheda cucina" (ricette 3.17, commit `98542fe3`) non documentata | APERTO (e peggiorato: vedi A8-09) |
| MED-7 storico-fc | assente | APERTO |
| MED-8 clone ricetta | assente | APERTO |
| MED-9 cambia-canale/paga-carta/iban CG | assenti da `modulo_controllo_gestione.md` | APERTO |
| MED-10 adeguamento spese fisse | assente | APERTO |
| MED-11 documenti dipendente | `modulo_dipendenti.md` righe 48,54: "Allegati ⏳ schema-only / TODO v2.6" | APERTO |
| MED-12 rematch-consuntivo | assente | APERTO |
| MED-13 turni vecchio vs v2 | nessun marker deprecated in `modulo_dipendenti_turni.md` (MORT-2 rinviato da PO 2026-05-19) | APERTO (rinvio deciso) |
| MED-14 Mailchimp config | `modulo_clienti_crm.md` ha §7 "Sincronizzazione Mailchimp ✅ FATTA (CL.1)" — copertura pre-esistente, dettaglio token/mapping non aggiunto | PARZIALE (invariato) |
| MED-15 pulizia massiva clienti | assente | APERTO |
| MED-16 segmenti email | §5 "Segmentazione e RFM" pre-esistente, conteggi non dettagliati | PARZIALE (invariato) |
| MED-17 spese baseline | assente da `modulo_vendite.md`/`modulo_banca.md` | APERTO |
| MED-18 cash expenses | assente | APERTO |
| MED-19 auth/users platform doc | `docs/platform_auth_utenti.md` non esiste | APERTO |
| MED-20 dashboard cucina | `dashboard/cucina` assente da `modulo_cucina.md` | APERTO |

**Sintesi MED: 0/20 chiusi** (2 parziali pre-esistenti invariati). Coerente con `roadmap.md:641` DH.10 "DA FARE — bassa".

### 1.3 I 10 MIN (campionati tutti)

| ID | Verifica | Stato |
|---|---|---|
| MIN-1 reset-database | assente da `modulo_vini.md` | APERTO |
| MIN-2 cleanup-duplicates | assente | APERTO |
| MIN-3 locazioni-normalizza | assente | APERTO |
| MIN-4 backup vini vs platform | solo menzione generica (riga 471) | APERTO |
| MIN-5 recovery import manuale | assente da `modulo_acquisti.md` | APERTO |
| MIN-6 export Excel fatture | assente | APERTO |
| MIN-7 proforme flusso | §11 pre-esistente "proforme in pausa" | PARZIALE (invariato) |
| MIN-8 buste paga test-pdf | assente da `modulo_dipendenti.md` | APERTO |
| MIN-9 endpoint `/menu/` | non doc in `modulo_menu_carta.md`, MA tracciato in `inventario_pulizia.md:46-48` ("nel cassetto", decisione PO) | CHIUSO ALTROVE (accettabile) |
| MIN-10 smoke/health pranzo | `modulo_pranzo.md:76` documenta `GET /pranzo/health` + `GET /pranzo/smoke/{s}/` | **CHIUSO** |

**Sintesi MIN: 1 chiuso, 1 chiuso-altrove, 1 parziale, 7 aperti.** Coerente con DH.11 "DA VALUTARE — opportunistico".

### 1.4 Anomalie strutturali

- **NOMEN-1**: chiuso (vedi CRIT-5).
- **MIGR-1** (numerazione mig duplicata): nessuna nuova collisione osservata nelle mig 134-146 dei commit recenti.
- **MORT-1** (legacy vini): rinviato da PO ("non prima 15/6", `roadmap.md:646`) — in scadenza ora.
- **MORT-2** (turni doppi): rinviato da PO (`roadmap.md:648`).
- **MAT-1**: `architettura_mattoni.md` aggiornato e corretto, ma **CLAUDE.md è in contraddizione** (vedi A8-06).

---

## 2. Capability nuove post 19/5 → docs

66 commit dal 2026-05-19. Feature utente identificate e verifica del doc canonico (regola disciplina docs CLAUDE.md):

| Feature | Commit (esempio) | Data | Doc atteso | Aggiornato? |
|---|---|---|---|---|
| **Carta di Credito CC.2-CC.5** (upload PDF estratto, lista carte/estratti, match A manuale, automatch bulk, soglie UI, match B addebito, riepilogo MCC) | `dd1ae50b`…`430838e7` (7 commit) | 02-05/06 | `modulo_banca.md` | **SÌ — esemplare**: §11.1 completo, stato CC.1→CC.5.b tutti ✅ con date, endpoint, formato PDF BPM, 2 livelli riconciliazione (righe 283-320) |
| Export PDF corrispettivi commercialista (scorporo IVA per aliquota) | `b91ab4c2`…`9aa0839d` | 21/05 | `modulo_vendite.md` | **SÌ** (riga 349 endpoint, riga 410 ✅ datato 2026-05-21) |
| **Cassa annulli_resi** (mig 146, quadratura + contanti fiscali) + tabella Note nel PDF commercialista | `3a9ca38b`, `1f5f9c17` | 09/06 | `modulo_vendite.md` | **NO** — `grep -i annulli modulo_vendite.md` = 0 risultati. Documentato solo in changelog.md e sessione.md |
| Ricette 3.14-3.16 **import ricette da JSON** (tracciato, incolla testo, placeholder, mig 136/137) | `0ddc6805`, `26d4fb10`, `8ca8add3` | 23/05 | `modulo_ricette_foodcost.md` | **NO** — `grep -i "tracciato\|procedimento" = 0`. Assente anche da changelog.md e sessione.md |
| Ricette 3.17-3.19 **procedimento a passi + stampa scheda cucina + q.b.** | `98542fe3`, `5d6cc7be`, `51f9caf8` | 23/05 | `modulo_ricette_foodcost.md` | **NO** (assente ovunque tranne git log) |
| Ricette 3.21-3.29 (pagina Ingredienti rifatta, Matching accorpato + Ignora, conversioni da verificare, sezione Menu unificata, mig 138 fix FK critica) | `538f22d7`…`ad5f853a` (10 commit) | 23-24/05 | `modulo_ricette_foodcost.md` | **NO** per la parte UI/flussi; assenti anche da changelog (che riparte da 3.30) |
| Ricette 3.30 scheda ingrediente a tab | `1a12dfe7`…`8dc95e93` | 24/05 | idem | PARZIALE — changelog ✅ (riga 147), sessione ✅; nel doc solo menzioni incidentali ("tab Prezzi", riga 87) |
| Ricette 3.31 eliminazione definitiva | `8f21602a` | 07/06 | idem | **SÌ** (riga 86, dettagliata) |
| Ricette 3.32 fix prezzi/conversioni + ricalcola-prezzi | `72330ed1`…`0c9a0af7` | 07/06 | idem | **SÌ** (righe 87, 95-100) |
| Ricette 3.33 prezzo corrente mediana | `1f902ecd` | 08/06 | idem | **SÌ** (righe 90-93) |
| Vini 3.55 toggle mescita sempre visibile | `926d97fe` | 19-21/05* | `modulo_vini.md` | SÌ (righe 304, 668, 712-719) |
| Vini 3.58 fix critico delete_movimento / 3.59 modifica data-ora movimento | `c7fffff8`, `27ca9b9b` | 19/05 | idem | SÌ per 3.59 (riga 671); 3.58 è fix (changelog assente, vedi A8-04) |
| Vini 3.60 permessi sommelier `is_vini_manager` + madre dalla Cantina + annata opzionale | `29adc936`…`daa9df46` | 21-22/05 | idem | **SÌ — esteso** (righe 652-730: modello permessi, tabella ruoli, endpoint dedicato) |
| Vini 3.61 STATO_RIORDINO auto-reset (mig 139) | `bf52a747` | 30/05 | idem | **SÌ** (riga 320, molto dettagliata) |
| Vini 3.62 andamento giacenza finestra adattiva | in `daa9df46` + changelog 07/06 | 07/06 | idem | **SÌ** (righe 686-699) |
| Pranzo 1.6 PDF sistema menu A5 + pool (promuovi/quick-add/elimina intelligente) + date picker | `dfe98f3a`…`88b5ed4b` | 07/06 | `modulo_pranzo.md` | **SÌ** — doc v3.0 con tabella capability C-P-001…C-P-009 (righe 118-125) |
| **Pranzo 1.7 storia Instagram** (canvas 1080×1920, `PranzoStoryCanvas.jsx`) | changelog 08/06 | 08/06 | `modulo_pranzo.md` | **NO** — `grep -i "instagram\|canvas" = 0` nel doc (c'è solo in changelog.md) |
| Fix backup_router (falso allarme "Nessun backup") | `cd9f49ba` | 02/06 | sicurezza_backup.md / sessione | sessione ✅ [non verificato in sicurezza_backup.md, fix minore] |

\* commit 3.54-3.57 datati 19/05, a cavallo della baseline.

**Pattern**: i moduli Banca, Vini e Pranzo hanno seguito la disciplina docs in modo eccellente. Il modulo Ricette ha un buco concentrato nella giornata 2026-05-23 (16 commit, 3.13→3.29: nessuna traccia in modulo doc, changelog né sessione.md — che salta dal 24/05 al 30/05). Il modulo Cassa ha l'ultima feature (annulli_resi, 09/06) in changelog/sessione ma non nel doc canonico.

---

## 3. Health score docs ricalcolato

**Metodo (dichiarato): stima incrementale**, NON un nuovo censimento delle 416 capability. Partenza dal conteggio 2026-05-19 (302✅ / 74⚠️ / 40🆕 = 73/100), applicato il delta osservato:

1. **Gap chiusi**: i ~36 capability 🆕 delle 3 aree CRIT (FIC ~12, Selezioni del Giorno ~24 — sovrapposte nel conteggio originale dei ~40 🆕) passano a **⚠️** (stub strutturati, non doc completi). Le capability task_manager restano dove l'adversarial le aveva già ricollocate (coperte da `modulo_cucina.md` = ⚠️). Residuo 🆕 storico: ~4.
2. **Capability nuove post 19/5**: stima ~32 capability utente nuove (conteggio dalla tabella §2): **~22 ✅** (carta credito 10, vini 5, pranzo 5, cassa PDF 1, ricette hard-delete/ricalcola/mediana 3 — arrotondato), **~1 ⚠️** (scheda ingrediente a tab), **~9 🆕** (import JSON ricette 3, procedimento+stampa 2, ingredienti/matching redesign ~2, annulli_resi+note PDF 2, storia IG 1 — arrotondato).

| Stato | Baseline | Delta | Nuovo | % |
|---|---|---|---|---|
| ✅ Allineato | 302 | +22 | ~324 | **72%** |
| ⚠️ Parziale | 74 | +36 +1 | ~111 | 25% |
| 🆕 Non documentato | 40 | −36 +9 | ~13 | 3% |
| **Totale** | 416 | +32 | ~448 | |

**Health score docs: ~72/100 (range onesto 70-74). Trend: −1 vs 73, sostanzialmente stabile.**

Lettura: il debito *grave* (🆕) è crollato da 9% a ~3% (i tre buchi neri FIC/Selezioni Giorno/Tasks ora hanno almeno uno stub con disambiguazione e mappa endpoint), ma la massa si è spostata su ⚠️ (18%→25%) perché gli stub non sono doc completi e i 20 MED sono tutti ancora aperti. Il punteggio %✅ cala leggermente perché ~9 capability nuove (concentrazione: Ricette 23/05 e Cassa 09/06) sono nate senza doc, violando la disciplina introdotta proprio dall'audit precedente.

---

## 4. Freschezza docs operativi

| Doc | Ultimo aggiornamento | Coerenza con git | Giudizio |
|---|---|---|---|
| `sessione.md` | 2026-06-09 (annulli_resi) | HEAD `1f5f9c17` è del 2026-06-09 | **FRESCO**. Entry per tutte le sessioni CC.*, vini 3.60/3.61, ricette 3.30/3.33, pranzo. **Buco: 2026-05-23** (ricette 3.13-3.29, 16 commit: nessuna entry; salta dal 24/05 al 30/05 — la entry 24/05 copre solo 3.30) |
| `changelog.md` | 2026-06-09 | idem | **FRESCO ma con 3 buchi**: (a) nessuna entry Carta di Credito CC.1-CC.5 (7 push, un sub-modulo nuovo intero, 02-05/06); (b) nessuna entry ricette 3.13-3.29 (23-24/05, inclusa mig 138 "fix critico FK che bloccava ogni salvataggio prezzo"); (c) nessuna entry vini 3.54-3.59 (incluso 3.58 "fix critico delete_movimento") |
| `roadmap.md` | **2026-05-19** (riga 3) | 66 commit dopo | **STANTIO 24 giorni**. Voci fatte non spuntate: **B.7 "Carta credito import + riconciliazione — MEDIA"** è completata end-to-end (modulo_banca.md §11.1 "sub-modulo carta CHIUSO completo" 2026-06-05); **B-DEBT1 "modulo_banca.md da creare"** — esiste dal 2026-05-08. V-H.I "non prima 15/6" ora in scadenza |
| `problemi.md` | S60-INC1 ancora in "Aperti — Priorità alta" | — | Checkbox riga 92 "**R6.5 push 2 (rimozione fallback locale_data_path)**" non spuntata ma **FATTA**: `app/utils/locale_data.py` righe 12-13 e 69 documentano la v2 fail-loud "R6.5 push 3 (05/05): rimuove il fallback". Le altre 7 checkbox (cron backup VPS, utenti staff ricreati, Aruba snapshot, Time Machine, Backblaze, restore test) **[NON VERIFICATO da locale]** — indizio indiretto pro-cron: commit `cd9f49ba` (02/06) risolve un "falso allarme Nessun backup automatico" leggendo snapshot da `app/data/backups/`, il che implica che i backup automatici sul VPS girano |
| `architettura_mattoni.md` | 2026-04-19 | — | Corretto nel merito (M.B ✅, M.E ✅, M.D ⏸ con decisione PO 19/05) ma **in contraddizione con CLAUDE.md** (vedi A8-06) |

---

## 5. Finding

```
[A8-01] SEVERITÀ: MED
Titolo: CRIT-4 ancora aperto — modulo_task_manager.md e modulo_haccp.md non esistono (DH.5)
Evidenza: wc: docs/modulo_task_manager.md: No such file or directory; roadmap.md:636 DH.5 "DA FARE — media"; contenuti in modulo_cucina.md righe 32-63
Impatto: l'unico CRIT dell'audit precedente senza nemmeno uno stub dedicato; il modulo task_manager resta indistinguibile da cucina nei docs (problema per R8 module_loader e per la vendita modulare).
Fix proposto: eseguire DH.5 (split di contenuti già esistenti da modulo_cucina.md, ~1-2h come stimato in roadmap). — Effort: S
Modulo: task_manager
```

```
[A8-02] SEVERITÀ: HIGH
Titolo: Giornata Ricette 23/05 (3.13→3.29, 16 commit) completamente non documentata: né modulo doc, né changelog, né sessione.md
Evidenza: git log 2026-05-23: dc2c291a…ad5f853a (import JSON con tracciato+mig 136/137, procedimento a passi+stampa scheda cucina, pagina Ingredienti rifatta, Matching accorpato+Ignora, mig 138 fix FK critica). grep "tracciato|procedimento" su modulo_ricette_foodcost.md = 0; changelog.md salta da "2026-05-21 Export PDF" a "2026-05-24 Ricette 3.30"; sessione.md salta dal 24/05 (solo 3.30) al 30/05
Impatto: ~7-8 capability utente nuove invisibili ai docs (incluse 2 migrazioni DB e un fix critico); violazione tripla della disciplina docs di CLAUDE.md introdotta 4 giorni prima; chiunque debba capire l'import JSON ricette oggi ha solo i commit message.
Fix proposto: una sessione docs mirata: sezione "Import ricette da JSON" + "Procedimento a passi" + aggiornamento §6 Matching in modulo_ricette_foodcost.md; entry changelog retroattiva cumulativa 3.13→3.29. — Effort: M
Modulo: ricette
```

```
[A8-03] SEVERITÀ: MED
Titolo: Cassa annulli_resi (mig 146) e tabella Note nel PDF commercialista assenti da modulo_vendite.md
Evidenza: grep -i "annulli" docs/modulo_vendite.md = 0 risultati; feature in commit 3a9ca38b/1f5f9c17 (09/06), documentata solo in changelog.md:6-24 e sessione.md:1-31
Impatto: il doc canonico del modulo Cassa non descrive un campo che altera quadratura e contanti fiscali (logica fiscale delicata); il §9.4 elenca ancora 3 endpoint su 11.
Fix proposto: aggiungere annulli_resi a §9 (flusso quadratura, formula giustificato) e la tabella Note a §"PDF commercialista"; già che si tocca, completare il mapping 11 endpoint (DH.4). — Effort: S
Modulo: cassa
```

```
[A8-04] SEVERITÀ: MED
Titolo: changelog.md senza entry per 3 blocchi di rilasci: Carta di Credito CC.1-CC.5, ricette 3.13-3.29, vini 3.54-3.59
Evidenza: grep "Carta di credito|CC\." su changelog.md = 0 entry dedicate; entry presenti invece in sessione.md (righe 176-521 per CC.*). Changelog passa da 2026-05-21 a 2026-05-24 a 2026-05-30 saltando quei rilasci; vini 3.58 era un "fix critico" (commit c7fffff8)
Impatto: il changelog non è più affidabile come storia dei rilasci ("Aggiornare docs/changelog.md se rilascio significativo" — CLAUDE.md): un sub-modulo nuovo intero (carta) non vi compare.
Fix proposto: 3 entry retroattive cumulative (Carta CC.1→CC.5.b, Ricette 3.13→3.29, Vini 3.54→3.59) riusando i testi già scritti in sessione.md. — Effort: S
Modulo: docs
```

```
[A8-05] SEVERITÀ: MED
Titolo: roadmap.md ferma al 2026-05-19 (24 giorni, 66 commit): B.7 carta credito fatta ma non spuntata, B-DEBT1 obsoleto
Evidenza: roadmap.md:3 "Ultimo aggiornamento: 2026-05-19"; roadmap.md:244 "B.7 Carta credito import + riconciliazione | M | MEDIA" vs modulo_banca.md:309 "sub-modulo carta CHIUSO completo" (2026-06-05); roadmap.md:248 "B-DEBT1 modulo_banca.md da creare" vs file esistente dal 2026-05-08
Impatto: la roadmap suggerisce lavoro già fatto; rischio di ri-pianificare B.7 o di fidarsi di stati falsi in sessioni di pianificazione.
Fix proposto: passata di riconciliazione roadmap: spuntare B.7 (→ ✅ 2026-06-05), eliminare B-DEBT1, rivedere V-H.I (scadenza "non prima 15/6" raggiunta), aggiornare header. — Effort: S
Modulo: docs
```

```
[A8-06] SEVERITÀ: MED
Titolo: CLAUDE.md dichiara M.B PDF e M.E Calendar "DA FARE" ma sono implementati da aprile
Evidenza: CLAUDE.md §Mattoni: "M.B PDF brand: DA FARE. Quando serve generare PDF, attendere questo mattone" e "M.E Calendar component: DA FARE" vs architettura_mattoni.md:9 "✅ M.B PDF brand (sessione 34) — app/services/pdf_brand.py" e :12 "✅ M.E Calendar (sessione 48, 2026-04-19)". Il PDF corrispettivi usa M.B (modulo_vendite.md:349 "mattone M.B")
Impatto: CLAUDE.md è la prima cosa che ogni agente legge: l'istruzione "attendere il mattone" per un mattone esistente può far rinviare feature PDF/calendario o, peggio, farle reimplementare inline.
Fix proposto: allineare la lista mattoni di CLAUDE.md ad architettura_mattoni.md (M.B ✅ con import path, M.E ✅, M.D ⏸ non prioritario). — Effort: S
Modulo: platform
```

```
[A8-07] SEVERITÀ: LOW
Titolo: Header versione/data stantii nei doc moduli più attivi (contenuto invece aggiornato)
Evidenza: modulo_vini.md:5 "vini 3.53 · sistema 5.15" vs versions.jsx vini 3.62 / sistema 5.24; modulo_ricette_foodcost.md:3-5 "Ultimo aggiornamento 2026-05-08, v3.0" vs ricette 3.33; modulo_banca.md:3 "2026-05-08" ma contiene §11.1 del 2026-06-02
Impatto: confonde sul grado di affidabilità del doc (il corpo è più aggiornato dell'header).
Fix proposto: aggiornare i 3 header quando si tocca il file; valutare regola "bump header = bump versions.jsx". — Effort: S
Modulo: docs
```

```
[A8-08] SEVERITÀ: LOW
Titolo: problemi.md S60-INC1 — checkbox "R6.5 push 2 rimozione fallback locale_data_path" non spuntata ma completata in codice
Evidenza: problemi.md:92 checkbox vuota; app/utils/locale_data.py:12-13 "R6.5 push 3 (05/05): rimuove il fallback automatico — fail-loud" e :69 "Niente fallback ad app/data/ (rimosso in R6.5 push 3)"
Impatto: l'incidente più grave della storia del progetto risulta con più TODO aperti del reale; le altre 7 checkbox (cron backup VPS, utenti staff, Aruba, Time Machine, Backblaze, restore test) restano [NON VERIFICATO da locale] — indizio pro-cron: fix cd9f49ba (02/06) presuppone backup automatici attivi sul VPS.
Fix proposto: spuntare la voce con riferimento al commit R6.5 push 3; verificare con Marco/VPS le 7 restanti e spuntare o riprioritizzare. — Effort: S
Modulo: docs
```

```
[A8-09] SEVERITÀ: LOW
Titolo: modulo_ricette_foodcost.md elenca "Export PDF ricette" come futuro mentre la stampa scheda cucina esiste (3.17)
Evidenza: modulo_ricette_foodcost.md:396 "Export PDF ricette con costi (dipendenza M.B PDF brand)" in nota futura; commit 98542fe3 (23/05) "stampa scheda cucina"
Impatto: micro-disallineamento che diventa "feature fantasma inversa": il doc promette come futura una cosa (in parte) già fatta — l'audit precedente era a 0 fantasmi.
Fix proposto: rientra nel fix A8-02 (sessione docs ricette). — Effort: S
Modulo: ricette
```

```
[A8-10] SEVERITÀ: LOW
Titolo: Pranzo 1.7 storia Instagram non nella tabella capability di modulo_pranzo.md
Evidenza: grep -i "instagram|canvas|storia" modulo_pranzo.md = solo "Storia:" (changelog interno v1→v3); changelog.md:26-36 documenta PranzoStoryCanvas.jsx + pranzo_settings.ig_telefono/ig_indirizzo; tabella capability del doc si ferma a C-P-009
Impatto: il doc pranzo è il migliore del lotto (ha già la tabella capability in stile DH.6) ma manca l'ultima capability utente.
Fix proposto: aggiungere riga C-P-010 (storia IG canvas, chef/admin) + nota settings recapiti. — Effort: S
Modulo: cucina
```

```
[A8-11] SEVERITÀ: LOW
Titolo: 20 MED e 7/10 MIN del gap report 2026-05-19 tutti ancora aperti
Evidenza: tabelle §1.2 e §1.3 di questo report (grep su ogni doc canonico); roadmap.md:641-642 li tiene in DH.10/DH.11 "DA FARE — bassa / opportunistico"
Impatto: nessun degrado nuovo, ma il debito ⚠️ cresce in proporzione (18%→25% stimato) perché nel frattempo si aggiungono capability.
Fix proposto: mantenere la strategia opportunistica dichiarata ("quando si tocca il modulo, si chiude il MED relativo") ma renderla operativa: DH.7 (warning push.sh su router toccato senza modulo_*.md) è l'enforcement mancante. — Effort: M
Modulo: docs
```

---

## 6. Riassunto per severità

| Severità | Conteggio | Finding |
|---|---|---|
| CRIT | 0 | — |
| HIGH | 1 | A8-02 |
| MED | 5 | A8-01, A8-03, A8-04, A8-05, A8-06 |
| LOW | 5 | A8-07, A8-08, A8-09, A8-10, A8-11 |

## 7. Note positive (per bilanciare)

- `sessione.md` e `changelog.md` aggiornati allo stesso giorno dell'ultimo commit (2026-06-09).
- I 3 commit di docs hardening promessi il 19/05 (DH.1-DH.3) sono stati fatti davvero il giorno stesso (commit `87e124b9`), incluso l'aggiornamento di CLAUDE.md con la disciplina docs.
- Il sub-modulo Carta di Credito è il caso esemplare della disciplina: 7 push in 4 giorni, ognuno con sessione.md aggiornata e doc canonico (`modulo_banca.md` §11.1) completo di stato, endpoint, formato parser e decisioni architetturali.
- `modulo_pranzo.md` ha adottato spontaneamente la tabella Capability (formato DH.6) — primo doc modulo a farlo.
- Vini 3.60-3.62 documentati in profondità inusuale (modello permessi con tabella ruoli, algoritmo finestra adattiva).
