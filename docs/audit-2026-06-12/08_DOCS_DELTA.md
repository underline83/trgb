# 08 — Delta documentazione vs audit 2026-05-19

**Data:** 2026-06-12 · **Commit:** `1f5f9c17` · **Versione prodotto:** 5.24
**Area:** A8 — Docs delta · **Baseline:** `docs/audit-2026-05-19/` (health score 73/100: 302 ✅ / 74 ⚠️ / 40 🆕 su 416 capability)
**Metodo:** confronto gap report precedente → stato attuale (grep su ogni doc canonico), censimento capability nuove dai 66 commit post 19/5, health score ricalcolato per **stima incrementale dichiarata** (non nuovo censimento). Integrata la verifica live VPS dell'orchestratore (`raw_A6_live.md`).

> ## Voto area Docs: **72/100** (baseline 73 → trend −1, sostanzialmente stabile)

---

## 1. Gap dell'audit precedente → stato attuale

### 1.1 I 5 CRIT del 2026-05-19

| ID | Gap | Stato 2026-06-12 | Evidenza |
|---|---|---|---|
| **CRIT-1** | FIC non documentato | **CHIUSO come STUB** (⚠️, non ✅) | `docs/modulo_fatture_in_cloud.md` esiste (137 righe, commit `87e124b9` del 19/5 stesso): tabella completa dei 17 endpoint reali con metodo/path/riga; §3-§7 "da estendere in sessione dedicata" |
| **CRIT-2** | Selezioni del Giorno non documentate | **CHIUSO come STUB** (⚠️) | `docs/modulo_selezioni_giorno.md` esiste (107 righe): 5 router `scelta_*`, pattern 10 endpoint, 24 capability C-R-039…062, disambiguazione NOMEN-1 in §0; mapping endpoint:linea rinviato |
| **CRIT-3** | Chiusure turno docs parziali | **PARZIALE** (declassato a MED dal PO il 19/5) | `docs/modulo_vendite.md` §9 copre il flusso operativo completo; mapping degli 11 endpoint di `chiusure_turno.py` ancora "da estendere" (= DH.4 in roadmap) |
| **CRIT-4** | task_manager/HACCP senza doc modulo | **APERTO** (declassato a MED: contenuti già in `modulo_cucina.md`) | `modulo_task_manager.md` e `modulo_haccp.md` non esistono; split DH.5 in `roadmap.md:636` "DA FARE — media". È l'unico CRIT senza nemmeno uno stub → finding A8-01 |
| **CRIT-5** | NOMEN-1 confusione "Selezioni" | **CHIUSO** | `modulo_selezioni.md` ridotto a file-puntatore; `modulo_vendite.md` creato con §0 disambiguazione; regola in CLAUDE.md. Commit `87e124b9` |

**Sintesi CRIT: 3 chiusi (di cui 2 come stub ⚠️), 1 parziale-declassato, 1 aperto-declassato.** I 3 push di docs hardening promessi il 19/5 (DH.1-DH.3) furono eseguiti il giorno stesso: la risposta immediata all'audit precedente è stata reale.

### 1.2 I 20 MED — **0/20 chiusi** (2 parziali pre-esistenti invariati)

Verificati TUTTI via grep sui doc canonici. Aperti: MED-1 (carta-cliente pubblica), MED-2 (bulk-update magazzino), MED-3 (toolset matrice), MED-4 (service types), MED-5 (allergeni), MED-6 (PDF ricetta — peggiorato: la "stampa scheda cucina" 3.17 esiste e il doc la promette ancora come futura → A8-09), MED-7 (storico-fc), MED-8 (clone ricetta), MED-9 (cambia-canale/paga-carta/iban CG), MED-10 (adeguamento spese fisse), MED-11 (documenti dipendente), MED-12 (rematch-consuntivo), MED-13 (turni vecchio vs v2 — rinvio deciso dal PO), MED-15 (pulizia massiva clienti), MED-17 (spese baseline), MED-18 (cash expenses), MED-19 (auth/users platform doc), MED-20 (dashboard cucina). Parziali invariati: MED-14 (Mailchimp), MED-16 (segmenti email). Coerente con DH.10 in roadmap "DA FARE — bassa".

### 1.3 I 10 MIN — 1 chiuso, 1 chiuso-altrove, 1 parziale, 7 aperti

Chiuso: MIN-10 (`modulo_pranzo.md:76` documenta health/smoke). Chiuso-altrove: MIN-9 (endpoint `/menu/` tracciato in `inventario_pulizia.md:46-48`, decisione PO "nel cassetto"). Parziale: MIN-7 (proforme). Aperti: MIN-1…6, MIN-8. Coerente con DH.11 "opportunistico".

### 1.4 Anomalie strutturali della baseline

- **NOMEN-1**: chiuso. **MIGR-1**: nessuna nuova collisione nelle mig 135-146 (ma la coppia duplicata 134 è pre-esistente al periodo, vedi A2-06).
- **MORT-1** (legacy vini): rinviato dal PO "non prima 15/6" — **scadenza raggiunta**, da decidere ora (vedi 10_PIANO_AZIONE §3).
- **MORT-2** (turni doppi): rinviato dal PO, invariato.
- **MAT-1**: `architettura_mattoni.md` corretto, ma **CLAUDE.md lo contraddice** (M.B/M.E "DA FARE" mentre sono fatti da aprile) → A8-06.

---

## 2. Capability nuove post 19/5 → doc aggiornato?

66 commit dal 2026-05-19. Feature utente identificate e verifica del doc canonico:

| Feature | Commit (es.) | Data | Doc atteso | Aggiornato? |
|---|---|---|---|---|
| **Carta di Credito CC.2-CC.5** (upload PDF estratto, match A/B, automatch bulk, soglie, riepilogo MCC) | `dd1ae50b`…`430838e7` (7 commit) | 02-05/06 | `modulo_banca.md` | **SÌ — esemplare** (§11.1 completo: stato, endpoint, formato PDF BPM, 2 livelli riconciliazione) |
| Export PDF corrispettivi commercialista (scorporo IVA) | `b91ab4c2`…`9aa0839d` | 21/05 | `modulo_vendite.md` | **SÌ** (righe 349, 410) |
| **Cassa annulli_resi** (mig 146) + tabella Note PDF | `3a9ca38b`, `1f5f9c17` | 09/06 | `modulo_vendite.md` | **NO** (`grep -i annulli` = 0; solo changelog/sessione) → A8-03 |
| Ricette 3.14-3.16 **import da JSON** (tracciato, mig 136/137) | `0ddc6805`… | 23/05 | `modulo_ricette_foodcost.md` | **NO** — assente anche da changelog e sessione → A8-02 |
| Ricette 3.17-3.19 **procedimento a passi + stampa scheda cucina + q.b.** | `98542fe3`… | 23/05 | idem | **NO** (assente ovunque tranne git log) → A8-02 |
| Ricette 3.21-3.29 (Ingredienti rifatta, Matching+Ignora, mig 138 fix FK critica) | `538f22d7`… (10 commit) | 23-24/05 | idem | **NO** per UI/flussi → A8-02 |
| Ricette 3.30 scheda ingrediente a tab | `1a12dfe7`… | 24/05 | idem | PARZIALE (changelog ✅, doc solo menzioni) |
| Ricette 3.31/3.32/3.33 (hard-delete, ricalcola-prezzi, mediana) | `8f21602a`…`1f902ecd` | 07-08/06 | idem | **SÌ** (righe 86-100) |
| Vini 3.55 / 3.58-3.59 / 3.60 / 3.61 / 3.62 (mescita, fix delete_movimento, permessi `is_vini_manager`, STATO_RIORDINO, giacenza adattiva) | vari | 19/05-07/06 | `modulo_vini.md` | **SÌ — esteso** (modello permessi con tabella ruoli, algoritmo finestra adattiva); manca solo 3.58 nel changelog → A8-04 |
| Pranzo 1.6 PDF menu A5 + pool + date picker | `dfe98f3a`… | 07/06 | `modulo_pranzo.md` | **SÌ** — doc v3.0 con tabella capability C-P-001…009 (primo doc in formato DH.6) |
| **Pranzo 1.7 storia Instagram** (canvas 1080×1920) | changelog 08/06 | 08/06 | `modulo_pranzo.md` | **NO** → A8-10 |
| Fix backup_router (falso allarme "Nessun backup") | `cd9f49ba` | 02/06 | sessione | sessione ✅ |

**Pattern:** Banca, Vini e Pranzo hanno seguito la disciplina docs in modo eccellente. Il buco è concentrato in **Ricette giornata 23/05** (16 commit, 3.13→3.29: zero tracce in doc modulo, changelog E sessione.md — violazione tripla, A8-02 HIGH) e in **Cassa 09/06** (annulli_resi: changelog/sessione sì, doc canonico no).

---

## 3. Health score docs ricalcolato: **72/100**

**Metodo dichiarato: stima incrementale** dalla baseline (302✅/74⚠️/40🆕 = 73/100), NON nuovo censimento delle 416 capability:

1. **Gap chiusi**: i ~36 🆕 delle aree CRIT (FIC, Selezioni del Giorno) passano a **⚠️** (stub strutturati, non doc completi); residuo 🆕 storico ~4.
2. **Capability nuove post 19/5**: ~32 stimate dalla tabella §2 → **~22 ✅** (carta credito 10, vini 5, pranzo 5, cassa PDF 1, ricette 3), **~1 ⚠️**, **~9 🆕** (import JSON 3, procedimento+stampa 2, ingredienti/matching ~2, annulli_resi+note 2 arrotondato, storia IG 1).

| Stato | Baseline | Delta | Nuovo | % |
|---|---|---|---|---|
| ✅ Allineato | 302 | +22 | ~324 | **72%** |
| ⚠️ Parziale | 74 | +37 | ~111 | 25% |
| 🆕 Non documentato | 40 | −36 +9 | ~13 | **3%** |
| **Totale** | 416 | +32 | ~448 | |

**Health score: ~72/100 (range onesto 70-74). Trend: −1 vs 73, stabile.**

**Lettura:** il debito *grave* (🆕) è **crollato dal 9% al ~3%** — i tre buchi neri del maggio (FIC, Selezioni Giorno, Tasks) hanno almeno uno stub con disambiguazione e mappa endpoint. Ma la massa si è spostata su ⚠️ (18%→25%): gli stub non sono doc completi e i 20 MED sono tutti ancora aperti. Il %✅ cala leggermente perché ~9 capability nuove (concentrazione: Ricette 23/05, Cassa 09/06) sono nate senza doc, violando la disciplina introdotta proprio dall'audit precedente. L'enforcement mancante è DH.7 (warning in push.sh se il diff tocca un router senza il `modulo_*.md` corrispondente).

---

## 4. Freschezza docs operativi

| Doc | Ultimo agg. | Giudizio |
|---|---|---|
| `sessione.md` | 2026-06-09 (= HEAD) | **FRESCO**. Entry per CC.*, vini 3.60-3.62, ricette 3.30-3.33, pranzo. **Buco: 23/05** (ricette 3.13-3.29, 16 commit senza entry; salta dal 24/05 al 30/05) |
| `changelog.md` | 2026-06-09 | **FRESCO ma con 3 buchi**: (a) zero entry Carta di Credito CC.1-CC.5 (un intero sub-modulo, 7 push); (b) zero entry ricette 3.13-3.29 (inclusa mig 138 "fix critico FK"); (c) zero entry vini 3.54-3.59 (incluso 3.58 "fix critico delete_movimento") → A8-04 |
| `roadmap.md` | **2026-05-19** | **STANTIO 24 giorni / 66 commit**. B.7 carta credito FATTA ma non spuntata; B-DEBT1 obsoleto (modulo_banca.md esiste dall'8/5); V-H.I "non prima 15/6" in scadenza → A8-05 |
| `problemi.md` | S60-INC1 ancora in "Aperti — alta" | **2 checkbox stale confermate**: (1) "R6.5 push 2 rimozione fallback locale_data_path" non spuntata ma FATTA in codice (`locale_data.py:12-13,69`) → A8-08; (2) **"[ ] Setup cron backup VPS" non spuntata ma i 4 job sono ATTIVI — CONFERMA LIVE** (`raw_A6_live.md` §4: `crontab -l` mostra hourly min 0, daily 03:00, daily 18:00, health check 15,45; `.last_backup_status.json` di oggi 13:00 = **15/15 OK**; `.last_health_status.json` = "healthy"; LKG 14 file timestamp odierno). La checkbox è stale dal 7/5 → da spuntare con data+evidenza (vedi anche A6-11) |
| `architettura_mattoni.md` | 2026-04-19 | Corretto nel merito (M.B ✅, M.E ✅, M.D ⏸), ma **CLAUDE.md in contraddizione** ("M.B PDF: DA FARE… attendere questo mattone") → A8-06 |

---

## 5. Finding area Docs (1 HIGH · 5 MED · 5 LOW)

```
[A8-02] SEVERITÀ: HIGH — confermato dalla verifica avversaria
Titolo: Giornata Ricette 23/05 (3.13→3.29, 16 commit) completamente non documentata: né doc modulo, né changelog, né sessione.md
Evidenza: git log 2026-05-23 (import JSON con tracciato + mig 136/137, procedimento a passi + stampa scheda cucina, pagina Ingredienti rifatta, Matching accorpato + Ignora, mig 138 "fix critico FK che bloccava ogni salvataggio prezzo" — commit 361e84a2). grep "tracciato|procedimento" su modulo_ricette_foodcost.md = 0; changelog salta dal 21/05 al 24/05; sessione.md salta dal 24/05 (solo 3.30) al 30/05.
Impatto: ~7-8 capability utente invisibili ai docs (incluse 2 migrazioni DB e un fix critico); violazione tripla della disciplina docs introdotta 4 giorni prima; chi deve capire l'import JSON ricette oggi ha solo i commit message.
Fix proposto: sessione docs mirata: sezioni "Import ricette da JSON" + "Procedimento a passi" + aggiornamento §6 Matching; entry changelog retroattiva cumulativa 3.13→3.29. — Effort: M
Modulo: ricette
```

```
[A8-01] SEVERITÀ: MED
Titolo: CRIT-4 ancora aperto — modulo_task_manager.md e modulo_haccp.md non esistono (DH.5)
Evidenza: file inesistenti; roadmap.md:636 DH.5 "DA FARE — media"; contenuti in modulo_cucina.md righe 32-63.
Impatto: unico CRIT del 19/5 senza nemmeno uno stub; task_manager indistinguibile da cucina nei docs (problema per R8 e vendita modulare).
Fix proposto: eseguire DH.5 (split di contenuti già esistenti, ~1-2h). — Effort: S
Modulo: task_manager
```

```
[A8-03] SEVERITÀ: MED
Titolo: Cassa annulli_resi (mig 146) e tabella Note PDF commercialista assenti da modulo_vendite.md
Evidenza: grep -i "annulli" docs/modulo_vendite.md = 0; feature nei commit 3a9ca38b/1f5f9c17 (09/06), solo in changelog/sessione.
Impatto: il doc canonico Cassa non descrive un campo che altera quadratura e contanti fiscali; §9.4 elenca ancora 3 endpoint su 11.
Fix proposto: aggiungere annulli_resi a §9 + tabella Note al §PDF; già che si tocca, completare il mapping 11 endpoint (DH.4). — Effort: S
Modulo: cassa
```

```
[A8-04] SEVERITÀ: MED
Titolo: changelog.md senza entry per 3 blocchi di rilasci: Carta di Credito CC.1-CC.5, ricette 3.13-3.29, vini 3.54-3.59
Evidenza: grep "Carta di credito|CC\." su changelog.md = 0 entry dedicate (presenti invece in sessione.md); vini 3.58 era un "fix critico" (c7fffff8).
Impatto: il changelog non è più affidabile come storia dei rilasci (un sub-modulo nuovo intero non vi compare).
Fix proposto: 3 entry retroattive cumulative riusando i testi di sessione.md. — Effort: S
Modulo: docs
```

```
[A8-05] SEVERITÀ: MED
Titolo: roadmap.md ferma al 2026-05-19 (24 giorni, 66 commit): B.7 fatta ma non spuntata, B-DEBT1 obsoleto, V-H.I in scadenza
Evidenza: roadmap.md:3; B.7 vs modulo_banca.md:309 "sub-modulo carta CHIUSO completo" (05/06); B-DEBT1 vs file esistente dall'8/5.
Impatto: la roadmap suggerisce lavoro già fatto; rischio di ri-pianificare B.7 o fidarsi di stati falsi.
Fix proposto: passata di riconciliazione: spuntare B.7, eliminare B-DEBT1, decidere V-H.I, aggiornare header. — Effort: S
Modulo: docs
```

```
[A8-06] SEVERITÀ: MED
Titolo: CLAUDE.md dichiara M.B PDF e M.E Calendar "DA FARE" ma sono implementati da aprile
Evidenza: CLAUDE.md §Mattoni vs architettura_mattoni.md:9-12 ("✅ M.B sessione 34 — app/services/pdf_brand.py", "✅ M.E sessione 48"); il PDF corrispettivi usa già M.B.
Impatto: CLAUDE.md è la prima cosa che ogni agente legge: "attendere il mattone" per un mattone esistente fa rinviare o reimplementare inline feature PDF/calendario.
Fix proposto: allineare la lista mattoni di CLAUDE.md (M.B ✅ con import path, M.E ✅, M.D ⏸). — Effort: S
Modulo: platform
```

```
[A8-07] SEVERITÀ: LOW
Titolo: Header versione/data stantii nei doc moduli più attivi (contenuto invece aggiornato)
Evidenza: modulo_vini.md:5 "vini 3.53 · sistema 5.15" vs reale 3.62/5.24; modulo_ricette_foodcost.md "2026-05-08 v3.0" vs ricette 3.33; modulo_banca.md "2026-05-08" ma con §11.1 del 02/06.
Fix proposto: aggiornare i 3 header al prossimo tocco. — Effort: S
Modulo: docs
```

```
[A8-08] SEVERITÀ: LOW
Titolo: problemi.md S60-INC1 — checkbox "R6.5 push 2" non spuntata ma completata in codice (+ checkbox cron risolta live, vedi §4)
Evidenza: problemi.md:92 vs app/utils/locale_data.py:12-13,69. Cron backup: ATTIVO, confermato live 12/06 (raw_A6_live.md §4). Restano da verificare/spuntare: utenti staff, Aruba, Time Machine, Backblaze, restore test (quest'ultimo davvero MAI fatto → A6-04).
Fix proposto: spuntare le 2 voci con riferimento commit/evidenza live; riprioritizzare le restanti. — Effort: S
Modulo: docs
```

```
[A8-09] SEVERITÀ: LOW
Titolo: modulo_ricette_foodcost.md promette "Export PDF ricette" come futuro mentre la stampa scheda cucina esiste (3.17)
Evidenza: modulo_ricette_foodcost.md:396 vs commit 98542fe3 (23/05).
Impatto: "feature fantasma inversa" (il doc promette come futura una cosa in parte fatta) — l'audit precedente era a 0 fantasmi.
Fix proposto: rientra nel fix A8-02. — Effort: S
Modulo: ricette
```

```
[A8-10] SEVERITÀ: LOW
Titolo: Pranzo 1.7 storia Instagram non nella tabella capability di modulo_pranzo.md
Evidenza: grep -i "instagram|canvas" sul doc = 0; changelog.md:26-36 documenta PranzoStoryCanvas.jsx; la tabella si ferma a C-P-009.
Fix proposto: aggiungere riga C-P-010 + nota settings recapiti. — Effort: S
Modulo: cucina
```

```
[A8-11] SEVERITÀ: LOW
Titolo: 20 MED e 7/10 MIN del gap report 2026-05-19 tutti ancora aperti
Evidenza: tabelle §1.2-§1.3; roadmap DH.10/DH.11 "bassa/opportunistico".
Impatto: nessun degrado nuovo, ma il debito ⚠️ cresce in proporzione (18%→25%).
Fix proposto: mantenere la strategia opportunistica ma renderla operativa con DH.7 (warning push.sh router-senza-doc). — Effort: M
Modulo: docs
```

---

## 6. Note positive e motivazione del voto

**Positivi:**
- `sessione.md` e `changelog.md` aggiornati allo stesso giorno dell'ultimo commit.
- I 3 push DH.1-DH.3 promessi il 19/5 furono fatti il giorno stesso (incluso aggiornamento CLAUDE.md).
- Il sub-modulo Carta di Credito è il caso esemplare della disciplina: 7 push in 4 giorni, ognuno con sessione + doc canonico completi.
- `modulo_pranzo.md` ha adottato spontaneamente la tabella Capability formato DH.6 (primo doc a farlo).
- Vini 3.60-3.62 documentati con profondità inusuale.
- **Conferma live**: il sistema di backup documentato in `sicurezza_backup.md` corrisponde alla realtà del VPS (cron attivi, 15/15 OK, LKG sano) — i docs di quel dominio sono affidabili, è solo la checkbox di problemi.md a essere stale.

**Voto area Docs: 72/100.** Il debito grave è stato abbattuto (🆕 9%→3%) e i moduli con disciplina la applicano in modo esemplare; il voto non sale perché (a) gli stub restano stub, (b) i 20 MED del giro scorso sono fermi a 0/20, (c) la disciplina è stata violata 3 volte in 24 giorni nel suo primo mese di vita (Ricette 23/05, Cassa 09/06, changelog), (d) roadmap stantia da 24 giorni. La leva strutturale è una sola: **DH.7, l'enforcement in push.sh**.
