# TRGB Gestionale — Roadmap (riorganizzata 2026-05-07)

**Ultimo aggiornamento:** 2026-05-19 — aggiunta sezione "DH — Docs hardening" (post audit autonomo `docs/audit-2026-05-19/`, verdetto adversarial 87/100). Aggiornata V-H.I (non prima 15 giugno) + M.D (non prioritario) + segnati MORT-2 e `/menu/` rinviati. Decisioni PO Marco 2026-05-19.

**Aggiornamento precedente:** 2026-05-07 — riorganizzazione completa modulo per modulo dopo refactor R1-R8 chiuso, R6.5 push 1+2+3 chiuso, sistema sicurezza/backup post-incidente live, PWA Fase 0 completa.
**Legenda effort:** XS = ~30min · S = ~1h · M = 2-3h · L = 2+ sessioni
**Convenzioni:** ogni voce ha ID stabile `<lettera>.<numero>` raggruppato per modulo. ✅ FATTO + commit hash + data. ⏸ in pausa = decisione Marco.

> **Doc canonici di riferimento:**
> - `architettura_mattoni.md` — mattoni M.A-M.I (servizi condivisi)
> - `architettura_locale.md` — modello multi-tenant `core/` + `locali/<id>/`
> - `architettura_pattern.md` — registry pattern di codice (cookbook)
> - `stack_tecnico.md` — stack tecnico generale (ex `architettura.md`)
> - `sicurezza_backup.md` — sistema backup post-incidente 4 maggio 2026
> - `installazione_nuovo_server.md` — runbook nuovo cliente
> - `refactor_monorepo.md` — piano R1-R8 completo (storico/canonico)

> **Sezioni roadmap (ordine):**
> 0. Refactor monorepo — CHIUSO (storico, ref `refactor_monorepo.md` §6)
> M. Mattoni (M.A-M.I)
> V. Vini (cantina + carta vini + carta bevande)
> R. Ricette / FoodCost
> A. Acquisti (fatture XML + FIC + proforme)
> K. Cassa (chiusure turno + corrispettivi)
> B. Banca (flussi + riconciliazione)
> G. Controllo Gestione (uscite + scadenze + spese fisse)
> D. Dipendenti / Turni / Brigata
> C. Cucina (task + HACCP + pranzo + selezioni + lista spesa)
> MC. Menu Carta (cliente-facing)
> PR. Prenotazioni
> CL. Clienti / CRM / Preventivi
> ST. Statistiche
> DH. Docs Hardening (post audit autonomo 2026-05-19)
> T. Tecnici / Platform
> S. Vendita prodotto / Commerciale
> U. UX / Brand

---

## 0 — Refactor monorepo (CHIUSO 2026-05-05)

R1-R8 + R6.5 push 1+2+3 + K-bis tutti completati. Vedere `docs/refactor_monorepo.md` §6 per cronologia commit. Strascichi:
- **K-tris** (T.3) — refactor 3 path PDF cedolini in `dipendenti.py:2209` senza rompere `pdf_path` nei record DB. Listato in §T.

Bug noti chiusi: incidente 4 mag (S60-INC1 in `problemi.md`), R6.5 push 3 fix git VPS hook (0.1.1 chiuso 2026-05-07 commit `534c88a5`).

---

## M — MATTONI (servizi condivisi)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| M.A | Notifiche infrastruttura + DB notifiche | M | ✅ FATTO (S31) | `app/services/notifiche_service.py`, usato da M.F, push.sh, backup_db.sh |
| M.B | PDF brand service | M | ✅ FATTO (S34) | `app/services/pdf_brand.py`. Carta vini esclusa (motore separato) |
| M.C | WhatsApp composer | S | ✅ FATTO (S31) | `frontend/src/utils/whatsapp.js`, `app/utils/whatsapp.py`, `WA_TEMPLATES` |
| M.E | Calendar component | M | ✅ FATTO (S48 2026-04-19) | `components/calendar/CalendarView.jsx`, demo `/calendario-demo` |
| M.F | Alert engine | S | ✅ FATTO (S40) | `app/services/alert_engine.py` + 3 checker (fatture/dipendenti/vini), anti-duplicato 12-24h |
| M.I | UI primitives | S | ✅ FATTO (2026-04-18) | `components/ui/`: Btn, PageLayout, StatusBadge, EmptyState |
| **M.D** | **Email service brand** | **M** | **DA FARE — non prioritario (Marco 2026-05-19 post-audit)** | SMTP/Mailgun/Resend + template HTML. Sblocca conferme prenotazioni, invio preventivi, compleanni, busta paga email. Riprendere quando un workflow specifico lo richiede in modo bloccante. |
| **M.H** | **Import engine generico** | **S** | **DA FARE — media** | Estrazione pattern da `clienti_router.py` TheFork. Sblocca: import TF, Excel vini diff, carta credito, banca PSD2 |
| **M.G** | **Sistema permessi centralizzato** | **M** | **DA FARE — media** | Sostituisce 30+ check `if (ruolo === ...)` sparsi |
| **M.J** | **Housekeeping (guardiano del progetto)** | **L** | **DA FARE — media** | 3 livelli: (L1) hook pre-push in `push.sh` blocca pattern sospetti (`__pycache__`, `*.zip` root, `*_dryrun.csv`, `.DS_Store`, mockup in root, TODO fantasma, changelog non aggiornato) + flag `--skip-housekeeping`; (L2) skill `trgb:housekeeping` invocabile on-demand (`/audit`) che riproduce audit completo file-per-file; (L3) scheduled task mensile (primo lunedì 08:00) con report in Bacheca M.A. Razionale: l'audit S51 (20 apr) ha trovato 21.6 MB di rumore + paradoc fantasma; senza un meccanismo automatico il pattern si ripete (eseguito retroattivamente 2026-05-08). Spec dettagliata era in `AUDIT_2026-04-20/mattone_housekeeping.md` (cancellato). Scripts riusabili `scripts/housekeeping/scan_*` per BE/FE/docs/memoria/worktree. |

---

## V — VINI / CANTINA (include carta bevande)

**Aggiornato 2026-05-19:** post-cutover refactor anagrafiche (V.6+V.7+V.8 → CHIUSO con mig 133). Aggiunti task V.20/V.21/V.22 da rivedere insieme. Priorità V.5 da rivedere (parzialmente coperto).

**Ordine prioritari attuali:** V.1 → V.2 → V.3 → poi rivalutare V.5/V.20/V.21/V.22.

| ID | Cosa | Effort | Priorità | Note |
|----|------|--------|----------|------|
| V.1 | Flag DISCONTINUATO UI + filtro | S | **PRIORITARIO 1** | DB ready (consolidato in `STATO_RIORDINO='X'` post mig 124), serve solo UI/filtro nella Cantina v2 |
| V.2 | Alert sottoscorta (M.A + M.F) | S | **PRIORITARIO 2** | Mattoni esistono |
| V.3 | Storico prezzi fornitore — grafico Recharts | S | **PRIORITARIO 3** | Dati già in `vini_prezzi_storico` |
| **V.20** | **Import/Export Vini v3 — template strutturato 3 fogli (Produttori / Madri / Bottiglie)** | L | **DA RIPRIORITIZZARE** | Post-cutover: template attuale è ancora "piatto" legacy, va rifatto per riflettere nuove anagrafiche strutturate. Match FK per ID o nome con auto-creazione. Vedi task interno #2. |
| **V.21** | **Bulk delete da BulkActionBar Cantina v2 (selezione multipla)** | XS | **DA RIPRIORITIZZARE** | Backend già pronto (DELETE FROM vini_bottiglie WHERE id IN). Manca solo action UI. Task interno #3. |
| **V.22** | **Refactor UX Vista Sommelier (CartaStaff)** | M | **DA RIPRIORITIZZARE** | Mobile-first sommelier in sala, ricerca rapida, filtri tipologia/regione, abbinamenti dal madre. Funziona ma da ridisegnare completamente. Task interno #136. |
| V.5 | Più distributori/rappresentanti per vino | L | **DA RIPRIORITIZZARE** | Tabella `vino_distributori` strutturale. **Parzialmente coperto da refactor (`vini_fornitori` ha 1 rappresentante inline). Da valutare se serve davvero la M:N o 1:1 basta operativamente.** |
| V.4 | Note degustative cliente (AI-generate + edit + visibili in carta cliente) | M | BASSA | Marco S58. Campo `NOTE_DEGUSTAZIONE`. Declassato 2026-05-12 |
| V.9 | Inventario rapido da iPad (mobile-first +/- giacenza) | M | BASSA | UI touch |
| V.10 | Carichi automatici da Fatture XML | M | BASSA | Match iPratico → CARICO automatico |
| V.11 | PDF carta con TOC cliccabile | S | BASSA | Motore `carta_vini_service.py` esistente |
| V.12 | Import Excel diff interattivo | M | BASSA | Richiede M.H. Probabilmente superato da V.20 quando arriva. |
| V.13 | Inventario fisico mobile con QR/barcode | L | DA VALUTARE | QR generation per vino |
| V.14 | Carta vini multi-template (eventi, degustazioni) | M | DA VALUTARE | Motore esistente |
| V.15 | Audit log scheda vino | S | DA VALUTARE | Tabella audit |
| V.16 | Filtri lato server (per dataset > 5000) | M | DA VALUTARE | Solo se scala oltre 1 cliente |
| V.17 | iPratico test e2e completo | S | DA VALUTARE | Test manuale |
| V.18 | Widget alert WA lista spesa (punto 7) | M | DA VALUTARE | Bloccato da V.5 + M.B PDF |
| V.19 | Carta Bevande — TODO da `carta_bevande_todo.md` | M | DA VALUTARE | Cap. dedicato in `modulo_vini.md` (consolidamento) |

**Voci CHIUSE dopo il cutover refactor** (storia, lasciate per tracking):
- ~~V.6~~ — Anagrafiche normalizzate → **FATTO 2026-05-19** (mig 125-131 + cutover mig 133)
- ~~V.7~~ — Famiglia vino raggruppa annate → **FATTO 2026-05-19** (concept `madre` raggruppa annate-bottiglie, vista "Madri" in Cantina v2)
- ~~V.8~~ — Vitigni con percentuali → **FATTO 2026-05-19** (mig 131, 5 slot strutturati sul madre + 5 sulla bottiglia per annata)

**Hardening tecnico modulo Vini (sessione 2026-05-12):**

| ID | Cosa | Effort | Stato |
|----|------|--------|-------|
| V-H.A | Fix bug FORMATO droppato dalla CRUD principale (Pydantic) | XS | FATTO 2026-05-12 |
| V-H.B | V-BUG1 admin guard FORCE import | XS | FALSO POSITIVO (endpoint inesistente, guard già presenti su tutti i massive endpoint) |
| V-H.C | Trailing slash uniformati su route Vini | S | FATTO 2026-05-12 (verificato conforme, no modifiche) |
| V-H.D | QTA_TOTALE read-only (opzione 1) + audit FE | S | FATTO 2026-05-12 (era già di fatto sicuro + cintura `data.pop` in `update_vino`) |
| V-H.E | Normalizzazione 4 flag SI/NO → INTEGER 0/1 (CARTA, IPRATICO, BIOLOGICO, VENDITA_CALICE) + rimozione DISCONTINUATO (consolidato in STATO_RIORDINO='X') | M | FATTO 2026-05-12 (mig 124, single shot atomico, backup esplicito) |
| V-H.I | Cleanup completo file legacy (`vini_model.py` con stub deprecati, DB `vini.sqlite3` se vuoto, `*_legacy.jsx` archiviati) | XS | DA FARE — **non prima del 15 giugno 2026** (decisione PO Marco 2026-05-19 post-audit). Niente data limite, ma non si tocca prima. |
| V-H.J | Import/Export Vini v2 (template + import + export, vecchio eliminato) | M | FATTO 2026-05-12 (3 endpoint nuovi, vecchi rimossi, UI Impostazioni rifatta) |

### V.6+V.7+V.8 — Refactor strutturale anagrafiche vini → **COMPLETATO 2026-05-19**

Vedi `docs/refactor_anagrafiche_vini.md` per il design completo. Strategia blue-green con tabelle `_v2` parallele → cutover atomico mig 133.

| Fase | Cosa | Stato |
|---|---|---|
| 1 | Mig 125 — setup impalcatura 6 tabelle `_v2` + copia 1287 bottiglie | ✅ FATTO 2026-05-13 |
| 2 | Backend service + 26 endpoint CRUD `/vini/anagrafiche/...` | ✅ FATTO 2026-05-13 |
| 3 | Seed denominazioni (1637 da eAmbrosia API + 505 italiane DOC/DOCG/IGT da PDF MASAF) | ✅ FATTO 2026-05-13 |
| 4 | Mig 127 — seed 60 vitigni canonici | ✅ FATTO 2026-05-13 |
| 5 | Migrazione dati clustering: 350 produttori + 40 fornitori + 995 madre + 1285 bottiglie linkate + 37 vitigni assegnati | ✅ FATTO 2026-05-13 |
| 6 | UI gestione anagrafiche tab dedicato | ✅ FATTO 2026-05-13 |
| 7 | Service sync runtime + endpoint rollback rapido | ✅ FATTO 2026-05-14 |
| 8 | Wizard nuovo inserimento vino 4-step (produttore → madre → annata → giacenze) — scrittura reale post M2.9-ter | ✅ FATTO 2026-05-18/19 (S1 cutover, vini 3.44) |
| 9 | Testing parallelo Cantina classica vs v2 + validazione | ✅ FATTO 2026-05-13→18 |
| 10 | Cutover atomico (mig 133): backup file + ALTER TABLE RENAME × 7 + sed `_v2→""` su 8 file backend | ✅ FATTO 2026-05-18 (S3 cutover, vini 3.46) |
| 10-bis | Hotfix post-cutover F11 (vini_repository, ipratico, vini_cantina_tools, vini_magazzino_db, vini_magazzino_router, vini_xlsx_v2, vini_settings) | ✅ FATTO 2026-05-19 (vini 3.47-3.53) |

**M2.9 — descrizione composta automatica** (sotto-feature del refactor):
- M2.9 — descrizione composta `{denom} {nome_etichetta} ({vitigni}) {grado}%` (mig 130, helper `componi_descrizione` py+js) — ✅ FATTO 2026-05-16
- M2.9-bis — promozione madri legacy a composto via modal Wizard Step 3 + filtro "📜 Solo legacy" — ✅ FATTO 2026-05-18 (vini 3.40)
- M2.9-bis 2 — vitigni strutturati sul madre (mig 131, 5+5 slot + backfill da prima bottiglia) — ✅ FATTO 2026-05-18 (vini 3.41)
- M2.9-ter — `MatricePicker` riusato in wizard Step 4 con modalità draft (vinoId=null + pendingCells) — ✅ FATTO 2026-05-18 (vini 3.43)
- M2.9-quater — fix annate future (max=anno corrente) + pseudo-locazione "📦 DA POSIZIONARE" per carico senza locazione — ✅ FATTO 2026-05-18

**Hardening tecnico chiuso anch'esso**:
- V-H.F | Rename STATO_VENDITA codici lettera → parlanti + CHECK constraint | M | ✅ FATTO 2026-05-15 (mig 128 TEXT→INTEGER 0..3)
- V-H.G | Soglie configurabili (vini_settings + UI Impostazioni Vini) | M | ✅ FATTO 2026-05-12 (mig 123, 12 soglie)
- V-H.H | Allineamento docs §3.5 + roadmap V | XS | ✅ FATTO 2026-05-12

**Bug/debt:**
- V-BUG1 — FALSO POSITIVO 2026-05-12: l'endpoint `POST /vini/magazzino/import` citato non esiste. Tutti gli endpoint massivi reali (`/reset-database`, `/import-excel`, `/bulk-update`, `/bulk-duplicate`, `/delete-vino/{id}`) hanno già admin guard. Voce da chiudere in `problemi.md`.
- V-DEBT1 — `app/models/vini_db.py`: file già rimosso. Voce obsoleta, da rimuovere.
- V-DEBT2 — `app/models/vini_model.py` ridotto a `normalize_dataframe()`. Usato solo da `import_excel_to_cantina`. Valutare se inglobare in `vini_cantina_tools_router.py`.

---

## R — RICETTE / FOODCOST

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| R.1 | Alert food cost fuori soglia (M.A + M.F) | S | ALTA | Mattoni pronti |
| R.2 | Margine per piatto su menu (ranking top/bottom 5) | S | ALTA | Dati pronti, manca UI |
| R.3 | Conto economico mensile P&L | M | MEDIA | Cross-modulo (richiede vendite + costi + stipendi). Vedi anche §G |
| R.4 | Dashboard food cost per reparto (cucina/pasticceria/cocktail) | M | MEDIA | Aggregazione cross-categoria |
| R.5 | Storico variazione costi ricette | M | MEDIA | Snapshot periodici |
| R.6 | Export PDF ricette con costi | S | MEDIA | M.B |
| R.7 | Reportistica ricette mensile (porzioni × food cost reale) | M | MEDIA | Cross-modulo (vendite collegate via menu_carta) |
| R.8 | Export ricette format standard (PDF/web cuoco-friendly) | M | BASSA | |

**Bug/debt:**
- R-DEBT1 — Lista Spesa MVP fatto, 5 fasi successive in §C (Cucina) come C.10-C.14

---

## A — ACQUISTI / FATTURE / PROFORME

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| A.1 | Note di credito XML (TD04) | M | ALTA | Ultimo punto matching fatture aperto |
| A.2 | Anomalie acquisti dashboard + alert M.A | S | ALTA | Endpoint `/stats/anomalie` esiste, manca UI + alert |
| A.3 | Forecast acquisti mensile (proiezione + alert sforo) | M | MEDIA | Storico in DB |
| A.4 | Carichi automatici vini da fatture XML | M | MEDIA | Cross modulo (V.10) |
| **A.5** | **Proforme — implementazione 6 fasi (`spec_proforme.md` v0.1)** | **M-L** | **⏸ IN PAUSA** | Decisione Marco 2026-05-07. Spec pronta da apr 13 |
| A.6 | Auto-pagamento proforma (riconciliazione one-click) | S | ⏸ IN PAUSA | Dipende da A.5 |

**Bug/debt:**
- A-DEBT1 — Campo `escluso` vs `escluso_acquisti` ambiguo (regola CLAUDE.md fragile)
- A-DEBT2 — FIC `is_detailed=false` richiede XML enrichment manuale

---

## K — CASSA (chiusure turno + corrispettivi)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| K.1 | Coperti + scontrino medio in dashboard | S | ALTA | Dati pronti |
| K.2 | Alert chiusura turno non inserita entro N ore (M.A + M.F) | S | ALTA | Mattoni pronti |
| K.3 | Checklist fine turno (DB predisposto, serve seed + UI) | M | ALTA | `shift_checklist_*` predisposte |
| K.4 | Export PDF riepilogo giornaliero/settimanale (M.B) | S | MEDIA | |
| K.5 | Analisi pranzo vs cena | S | MEDIA | Dati pronti |
| K.6 | Cross-check chiusura turno vs daily_closures Excel | M | MEDIA | |
| K.7 | Vista "settimana lavorativa" rapida (lun-dom totali) | S | MEDIA | |
| K.8 | Dashboard previsione fine mese (proiezione) | S | MEDIA | |
| K.9 | Foto scontrino allegato a chiusura turno | M | MEDIA | BLOB/path |
| K.10 | Alert variazione drastica chiusura vs media (fraud detection) | M | BASSA | Richiede storico |
| K.11 | Importazione automatica RT (registratore cassa) | L | BASSA | "Se fattibile" — Marco |
| K.12 | **Unificare import Excel → `shift_closures` (dismettere `daily_closures`)** | L | 🔴 ALTA — deciso Marco 2026-05-21 | Doppia tabella che si incrocia male. Vedi dettaglio §K.12 |
| K.13 | **Import XML corrispettivi telematici dal portale AdE come fonte aggiuntiva** | M | MEDIA — deciso Marco 2026-05-21 | Parser dei file XML 7.0 scaricati da "Fatture e Corrispettivi". Vedi dettaglio §K.13 |

### K.12 — Unificazione corrispettivi: una tabella sola 🔴 ALTA (deciso 2026-05-21)

**Problema:** oggi i corrispettivi vivono in due tabelle che si sovrappongono male:
- `daily_closures` — la riempie l'import Excel, granularità giornaliera, ha lo split IVA 10/22, copre 2021→2026 (~1.400 giornate con dati).
- `shift_closures` — la riempie lo staff con le chiusure turno, granularità pranzo/cena, **niente colonne IVA**, copre da marzo 2026.

Tutti i lettori (dashboard, stats mensili/annuali, export Excel, PDF commercialista, `vendite_aggregator`) usano il cerotto `_merge_shift_and_daily`. Il bug del PDF Aprile-a-zero (2026-05-21) è stato il sintomo.

**Direzione concordata (Marco 2026-05-21):** l'import Excel deve scrivere in `shift_closures`. `daily_closures` viene **migrata interamente** (tutti i 6 anni) e poi dismessa.

**Nodi da sciogliere nella sessione dedicata:**
1. **Granularità** — l'Excel ha il totale giornaliero, `shift_closures` ragiona per turno. Convenzione: una giornata importata = una riga con `turno='giornaliero'` (nuovo valore accanto a pranzo/cena).
2. **IVA** — aggiungere `iva_10` / `iva_22` a `shift_closures` (ADD COLUMN idempotente) per non perdere lo split.
3. **Migrazione storico** — spostare ~1.400 giornate `daily_closures` → `shift_closures` come righe `turno='giornaliero'`.
4. **Lettori** — puntare dashboard, stats, export Excel, PDF commercialista, `vendite_aggregator` su `shift_closures`; semplificare/eliminare `_merge_shift_and_daily`.
5. **Dismissione** — `daily_closures` resta read-only durante la transizione, si elimina solo dopo verifica conteggi.

**Sessione "refactor" dedicata** — non mescolare a feature/bugfix (regola "una sessione = una direzione").

### K.13 — Import XML corrispettivi telematici AdE (fonte aggiuntiva) — MEDIA (deciso 2026-05-21)

**Idea:** il registratore telematico (RT) genera e trasmette già, a ogni chiusura, il file XML dei corrispettivi telematici (tracciato ufficiale "Tipi Dati per i corrispettivi" v7.0). Quei file sono scaricabili dal portale "Fatture e Corrispettivi" dell'Agenzia delle Entrate (sezione *Consultazione e download massivo*, accesso con delega del commercialista).

**Cosa fare:** un parser che importa quei file XML in TRGB come **fonte dati aggiuntiva** dei corrispettivi — più affidabile di Excel e chiusure turno perché è il dato fiscale ufficiale, con imponibile e imposta già ripartiti per aliquota.

**Note:**
- È una fonte *in più*, non sostituisce le chiusure turno operative (quelle servono per la quadratura di cassa serale).
- Non esiste un'API pubblica semplice per scaricare i corrispettivi: il flusso passa dal portale AdE (download massivo). L'import in TRGB sarebbe da file XML caricato a mano, almeno in prima battuta.
- Si lega a §K.12: una volta unificata la tabella corrispettivi, l'XML AdE diventa una delle sorgenti di alimentazione.
- NON va riprodotto il tracciato XML in uscita (è un formato di trasmissione macchina-a-macchina) — qui si parla solo di **leggerlo in ingresso**.

---

## B — BANCA (flussi + riconciliazione)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| B.1 | Bug storni Flussi Cassa (D1 problemi.md) | S | ALTA | Marco serve caso concreto |
| B.2 | Annullamento movimenti contanti (manca metà 3.5) | S | ALTA | DB pronto |
| B.3 | Dashboard grafici Recharts | S | ALTA | Sostituisce barre CSS |
| B.4 | Multi-conto corrente UI | M | MEDIA | DB ready |
| B.5 | Cash flow previsionale 30/60/90gg | M | MEDIA | M.B PDF |
| B.6 | Cross-ref banca più intelligente | M | MEDIA | |
| B.7 | Carta credito import + riconciliazione | M | MEDIA | M.H |
| B.8 | Import automatico movimenti banca (PSD2/CSV) | L | BASSA | Futuro |

**Bug/debt:**
- B-DEBT1 — Banca senza doc canonico → `modulo_banca.md` da creare in consolidamento Fase 5

---

## G — CONTROLLO GESTIONE

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| G.1 | Spese Fisse — implementazione modulo (CRUD + frequenze) | L | ✅ FATTO | In produzione con 22 spese fisse + 274 rate (riassorbito da G.4-G.5: prestiti+rateizzazioni+tasse già operativi). Roadmap aggiornata 2026-05-08 |
| G.1.5 | **Import CSV piano rate (Abaco/AdE/PagoPA/F24)** | M | ✅ FATTO 2026-05-08 | mig 108 + endpoint `POST /spese-fisse/import-csv` + UI wizard CSV + DELETE warning rate riconciliate. Vedi `modulo_controllo_gestione.md §3.5.1-3.5.2` |
| G.2.A | Alert scadenze pagamenti (3 livelli) | S | ✅ FATTO 2026-05-09 | Checker `cg_scadenze_imminenti/avvicinamento/pianificazione` su M.F + seed alert_config + label UI. Vedi `modulo_controllo_gestione.md §3.6` |
| G.2.B | Calendario scadenze (M.E) + widget mini-timeline dashboard | M | ✅ FATTO 2026-05-09 | Endpoint `GET /controllo-gestione/scadenze` + pagina `ControlloGestioneCalendarioScadenze.jsx` + widget timeline in dashboard CG. Vedi `modulo_controllo_gestione.md §3.7` |
| G.5 | Unificazione stato pagamento fatture | L | ✅ FATTO 2026-05-10 | Mig 111+112: DROP `fe_fatture.pagato` + `.stato_pagamento` + CREATE VIEW `fe_fatture_with_stato`. Source of truth = `cg_uscite.stato`. Service refactored. Vedi `stato_pagamento_unificato.md` |
| G.6 | Rename stati al maschile + SPOSTATO + col data_scadenza_originale | M | ✅ FATTO 2026-05-10 | Mig 114: rename `DA_PAGARE`→`PROGRAMMATO`, `SCADUTA`→`SCADUTO`, `DA_VERIFICARE`→`VERIFICARE`, `RATEIZZATA`→`RATEIZZATO`, `PAGATA`→`PAGATO`, `PAGATA_MANUALE`→`PAGATO_MANUALE`. Nuovo stato `SPOSTATO`. Refactor ~370 occorrenze backend+frontend. UX "Sposta data" da implementare in G.7 |
| G.7 | UX "Sposta data" + completamento stato SPOSTATO | M | ✅ FATTO 2026-05-10 | Endpoint `PUT /uscite/{id}/scadenza` esteso (auto-setta SPOSTATO se data ≠ originale) + nuovo `PUT /uscite/{id}/ripristina-data`. FattureDettaglio: 2 sotto-celle "Scadenza iniziale" + "Programmata" + bottone Ripristina. Chip "Spostato" in FattureElenco e ControlloGestioneUscite. Vedi `stato_pagamento_unificato.md §13` |
| G.8 | Livello macro/sotto stato pagamento (CHIUSO/APERTO) | M | ✅ FATTO 2026-05-11 | Mig 116 ADD COLUMN `cg_uscite.stato_macro` GENERATED VIRTUAL + service `app/services/stati_pagamento.py` con costanti centralizzate + refactor `/uscite/import` con whitelist invariante per costruzione (STATI_DERIVATI_DA_DATA={PROGRAMMATO,SCADUTO}). Mig 115 ripara 138 VERIFICARE perse da bug import preesistente. Vedi `stato_pagamento_unificato.md §14` |
| G.3 | **Conto Economico Completo (P&L mensile con utile netto)** | L | 🔴 **TOP — PRIORITÀ MASSIMA Marco 2026-05-14** | Allineamento richiesto da Marco: oggi dashboard mostra solo margine LORDO (Vendite − Acquisti), manca aggregazione spese operative (stipendi/affitti/utenze/tasse/assicurazioni) → utile netto fuorviante. Vedi §G.3 dettaglio sotto |
| G.9 | Tasse — sezione dedicata in Spese Fisse | M | MEDIA → riassorbito in G.3 | Già supportato come `tipo='TASSA'`, manca eventualmente template wizard dedicato (era G.8 pre-2026-05-11 rinumerato per evitare collisione con macro/sotto stato) |
| G.10 | Stipendi — sezione dedicata in Spese Fisse | M | MEDIA → riassorbito in G.3 | `tipo='STIPENDIO'` esistente (26 record). Cross §D: integrazione busta paga PDF → cg_uscite (era G.9, rinumerato) |

### G.3 — Piano dettagliato "Conto Economico Completo" 🔴 PRIORITÀ TOP 2026-05-14

**Contesto**: il dashboard CG mostra solo `margine_lordo = vendite - acquisti`. Le 22 spese fisse + 274 rate (affitti, stipendi, tasse, assicurazioni, prestiti) NON entrano nel KPI utile. Marco vede un margine 60% quando il vero utile potrebbe essere ~7%.

**Decisioni di prodotto prese (Marco 2026-05-14):**
1. Aggregare per **categorie fatture esistenti** (9 macro `fe_categorie` + sottocategorie già modellate). Vanno usate TUTTE nel conto economico.
2. **Fonte unica stipendi**: `cg_uscite tipo='STIPENDIO'` (deriva da `buste_paga.uscita_netto_id`, una riga per `periodo_riferimento`). `cg_spese_fisse tipo='STIPENDIO'` resta come template-proiezione e NON entra nel calcolo storico (anti-doppio-conteggio).
3. **Cassa + Competenza** entrambi disponibili come toggle. Default: competenza (data_fattura + periodo_riferimento).
4. **Affitti/Assicurazioni/Tasse**: gestite con categorizzazione di `cg_spese_fisse` (non sono in `fe_fatture` perché senza documento).

**Fase A — Schema (Mig 117)**:
- INSERT 3 nuove macro-cat in `fe_categorie`: `TASSE E IMPOSTE`, `ASSICURAZIONI`, `FINANZIARI`
- INSERT sottocat:
  - TASSE → F24, IRES/IRAP, IVA, IMU, TARI, INPS, RIFIUTI, ALTRO
  - ASSICURAZIONI → RC, INCENDIO, INFORTUNI, AUTO, ALTRO
  - FINANZIARI → MUTUI, PRESTITI, INTERESSI, RATEIZZAZIONI
- ALTER `cg_spese_fisse` ADD COLUMN `categoria_id INTEGER NULL`, `sottocategoria_id INTEGER NULL` (FK soft)
- Backfill auto da `tipo`: AFFITTO→AFFITTI, STIPENDIO→STAFF/STIPENDI, TASSA→TASSE, ASSICURAZIONE→ASSICURAZIONI, PRESTITO/RATEIZZAZIONE→FINANZIARI, ALTRO→ALTRO
- Idempotente, niente DROP

**Fase B — Backend**:
- `app/services/conto_economico.py` nuovo:
  - `compute_pl(anno, mese, modalita='competenza'|'cassa')` → dict
  - Aggrega `fe_fatture + fe_righe` per (categoria, sottocategoria) — usando `data_fattura` o `data_pagamento` a seconda della modalità
  - Aggrega `cg_spese_fisse` per (categoria, sottocategoria) — usando `periodo_riferimento` (mese di riferimento) o `data_pagamento` di `cg_uscite` collegata
  - Aggrega `cg_uscite tipo='STIPENDIO'` separatamente come fonte unica stipendi (filtro per `periodo_riferimento` competenza o `data_pagamento` cassa)
  - Calcola: `ricavi → costo_merce → margine_lordo → costi_operativi → utile_netto`
- Endpoint `GET /controllo-gestione/conto-economico?anno=YYYY&mese=MM&modalita=competenza|cassa`
- Output strutturato con waterfall + breakdown per categoria + sottocategoria

**Fase C — Frontend**:
- Nuova pagina `frontend/src/pages/controllo-gestione/ControlloGestioneContoEconomico.jsx`:
  - 3 KPI top: Ricavi / Margine lordo / **Utile Netto**
  - Waterfall chart: Ricavi → -Costo merce → Margine lordo → -Costi operativi (per categoria) → Utile Netto
  - Tabella espandibile categoria → sottocategoria → singole fatture/spese
  - Toggle **Competenza / Cassa**
  - Confronto YoY (stesso mese anno precedente)
- KPI "Utile netto" aggiunto anche in `ControlloGestioneDashboard.jsx` (margine lordo esistente preservato)
- Voce nav in `ControlloGestioneNav.jsx`: "Conto Economico"

**Fase D — Verifica con dati reali**:
- Test P&L su maggio 2026 dopo import buste paga
- Confronto col calcolo a mano (commercialista) per validare
- Aggiustamenti puntuali

**Effort**: L (1.5-2 sessioni dedicate). Fase A ~30min, B ~1.5h, C ~2h, D iterativa.

**Riassorbe**: G.9 (tasse), G.10 (stipendi). Una volta chiuso G.3, queste due voci sono coperte dal conto economico unificato.

#### Decisioni di prodotto prese (Marco 2026-05-14)
- **Imponibile** (no IVA — l'IVA è pass-through, non costo/ricavo).
- **V1 stipendi = solo netto** (da `cg_uscite.totale` dove `tipo_uscita='STIPENDIO'`). Costo personale completo (lordo+contributi+TFR) → v1.1.
- **Note credito (TD04)**: già escluse via WHERE clause esistenti — nessuna gestione extra.
- **Cassa + Competenza**: entrambi come toggle (default competenza).
- **Spalmatura mensile spese pluri-mensili** (es. assicurazione annuale → 1/12 mese): v2 futuro. V1 conteggia tutto nel mese di pagamento.

#### Estensioni post-G.3 (TODO futuri)

| ID | Cosa | Effort | Priorità | Note |
|----|------|--------|----------|------|
| G.3.1 | ~~Costo personale completo~~ → **Promosso a G.3 Fase E (PRIORITÀ ALTA)** | L | 🔴 ALTA → 2026-05-16 | Vedi sezione dedicata G.3 Fase E sotto. Pre-mortem 2026-05-16 con Marco: i campi di `buste_paga` non bastano (manca carico ditta + ratei + INAIL), serve importare ELAB.pdf mensile del commercialista |
| G.3.1b | **Override competenza fattura acquisti** | S | 🟡 ALTA → dopo Fase E | Marco 2026-05-16: capita che una fattura datata es. 2 febbraio sia in realtà di gennaio (fornitore non ha fatturato il 31, era festa). Serve campo opzionale `competenza_anno_mese TEXT` su `fe_fatture`: NULL=usa data_fattura come oggi, valorizzato=il CE la conta in quel mese. Pattern: stesso di `periodo_riferimento` su `cg_uscite`. Implementa: mig 134 ADD COLUMN + modifica WHERE in `_aggregate_fatture_per_categoria` con `COALESCE(competenza_anno_mese, strftime('%Y-%m', data_fattura)) = ?` + endpoint `PUT /acquisti/fattura/{id}/competenza` + bottone "Sposta competenza" in FattureDettaglio. La data_fattura resta inalterata (è il dato fiscale). |
| G.3.1c | **Auto-create dipendente da ELAB se manca in anagrafica** | S | 🟡 MEDIA → dopo Fase E | Marco 2026-05-16: oggi se l'ELAB cita una persona che NON esiste in `dipendenti` (es. PANICHI ELISA storica, mai inserita in anagrafica) il record resta orfano (`dipendente_id=NULL`). L'importo entra comunque nel CE ma manca il deep-link e l'ex dipendente non compare nelle viste anagrafica. Soluzione: durante `_import_elab_to_db`, se `_match_dipendente_consuntivo` ritorna None, **creare un placeholder** in `dipendenti` con cognome/nome dal PDF, `attivo=0`, `matricola` dall'ELAB, flag `auto_created_from_elab=1` (nuovo campo? o usare `note='auto-created from ELAB <fonte>'`). Vantaggio: continuità storica completa, niente record orfani. Rischio: creazione duplicati se il match fallisce per typo lieve. Mitigazione: usare la stessa funzione `_match_dipendente_consuntivo` per il check pre-create (impossibile lo crei se trovato). Edge case: chiedere conferma esplicita in UI prima di creare (tipo riepilogo "Sto per creare: X, Y, Z — confermi?"). |
| G.3.2 / **C1** | **Spalmatura mensile** spese pluri-mensili | M | 🟡 ALTA → IN CORSO 2026-05-16 | Campo `spalmatura_mesi` + `spalmatura_data_inizio` su `cg_spese_fisse` E `fe_fatture` (entrambi: 95% dei casi). Es. assicurazione annuale €1200 pagata in gennaio → competenza €100/mese × 12 mesi. UI: dropdown form Spese Fisse + bottone "Spalma" in FattureDettaglio (pattern come "Sposta competenza" G.3.1b / C0a). Service CE: la quota mensile viene inclusa solo se il mese richiesto è nel range coperto. |
| G.3.3 / **C4** | **Food cost vero** (consumo, non acquisti) | L | MEDIA | Richiede inventario magazzino merce fresca (oggi c'è solo per vini). Acquisti = €5000 ma se magazzino cresce €1000, consumo reale = €4000 |
| G.3.4 / **C2** | **Vendite per tipo** (food vs beverage) | M | 🟡 ALTA → dopo C1 | Distinzione margine cibo vs vino vs bevande vs coperto. Fonte: `ipratico_prodotti` ha categoria per ogni vendita. Dati raw Aprile 2026: Secondi €11k / Primi €10.7k / Antipasti €9.4k / Bottiglie €6.4k vino / BATTUTA SINGOLA €6.4k (coperto?) / Calici €3.6k / Bevande €3.3k / etc. NOTA: discrepanza €14.930 fra iPratico (€63.987) e CE/vendite_aggregator (€49.057) da indagare prima. **8 DOMANDE PENDENTI per Marco**: (1) cos'è "BATTUTA SINGOLA"? (2) "Pranzo" categoria a sé o food generico? (3) "Degustazioni" sono food/beverage/misto? (4) "Speciali" piatti del giorno o altro? (5) "Vendita" cos'è? (6) "Servizio" omaggi? (7) Aggregare vino bt+calice o tenerli separati? (8) Caffè separato o dentro bevande? Design proposto: tabella `ipratico_categoria_tipo` + UI Impostazioni CG per mapping editabile + sezione "Ripartizione vendite" nel CE. |
| G.3.5 / **C3** | **Ammortamenti** beni strumentali (cucina, forno, lavastoviglie...) | M | BASSA | Per bilancio annuale commercialista. Tabella `cg_ammortamenti` + amm.to mensile auto |
| G.3.6 / **C5** | **Budget vs consuntivo** | M | BASSA | Tabella `cg_budget` (anno, mese, categoria, importo_atteso). Scostamento % in dashboard CE |
| G.3.7 / **C6** | **Vista trimestrale + annuale + export PDF** | S | BASSA | V1 è solo mensile. Estendere endpoint con `periodo=mese|trimestre|anno` + export PDF via M.B. Vista trim/anno = G.3.7a (FATTO). Export PDF = G.3.7b (TODO). |

> **Nuova nomenclatura task (Marco 2026-05-16)**: per dialogo più rapido useremo `C1, C2, C3…` per i task del modulo Controllo Gestione (CG). Codici legacy `G.3.x` restano come alias storico in roadmap/changelog. Altri moduli avranno la loro lettera quando arriva il momento (es. V per Vini, D per Dipendenti, F per Flussi Cassa). Vedi tabella alias sopra.

---

### G.3 Fase E — Costo personale completo (PRIORITÀ ALTA, 2026-05-16)

**Contesto (Marco 2026-05-16):** chiusa Fase D di G.3 (verifica con dati reali), abbiamo scoperto che il "costo personale" mostrato nel CE è solo la somma dei netti bonificati (`cg_uscite tipo='STIPENDIO'`). Manca tutto il "costo aziendale vero": carico ditta INPS, ratei 13ª/14ª/ferie/permessi, TFR maturato, INAIL.

**Esempio Aprile 2026 (numeri reali da ELAB.pdf):**
- Netti bonificati (oggi nel CE): **€ 12.140**
- Costo aziendale vero (consuntivo ELAB): **€ 20.489**
- Differenza nascosta: **€ 8.349/mese** (+69%)
- Effetto sul P&L Aprile: Utile passa da **+€ 6.797 (+13,9%)** a **−€ 1.551 (−3,2%)** → perdita reale ad Aprile.

**Decisioni di prodotto (Marco 2026-05-16):**
1. Carichiamo **tre PDF mensili** dal commercialista: `LUL` (già esistente, buste paga PDF), `ELAB` (riepilogo costi consuntivo — NUOVO), `F24` (versamenti — NUOVO).
2. ELAB pagina 8 "COSTO CONSUNTIVO" è la single source of truth del costo personale. F24 serve per riconciliazione cassa.
3. Storico da importare: solo 2026 (gen-apr). Anni precedenti li abbiamo ma non interessano.
4. Mai inseriti F24 stipendi in `cg_spese_fisse` finora → nessun rischio di doppio conteggio da rompere.

**Pre-push immediato (sessione 2026-05-16):**
- Warning banner nel CE "Costo personale parziale" già in produzione.
- Drill-down + % sui ricavi + RATEIZZAZIONE_TASSE pushati in commit dedicato.

**Tasks Fase E (sessione dedicata, ~6h):**

| Step | Cosa | Note |
|------|------|------|
| E.1 | Mig 132: nuove tabelle `dipendenti_costo_consuntivo` + `f24_versamenti` | schema in §G.3.E sotto |
| E.2 | Parser pdfplumber: `app/services/elab_parser.py` (legge pagina 8) | tabella per dipendente: ore, lordo, contributi, ratei, ctr_ratei, tfr, totale_costo |
| E.3 | Parser pdfplumber: `app/services/f24_parser.py` (legge tutte le sezioni) | codici tributo: 1001/1040 erario, DM10/EBTU/EST1 INPS, 3802/3847/3848 add, INAIL 13100 |
| E.4 | UI Dipendenti > "Carica buste paga del mese": dropzone 3 file (LUL+ELAB+F24) | feedback strutturato: cosa è stato parsato, cosa manca, conferma prima del commit DB |
| E.5 | Refactor `_aggregate_stipendi` in `conto_economico.py`: legge da `dipendenti_costo_consuntivo` se record presente, fallback netti + warning | Anti-regressione su mesi senza ELAB |
| E.6 | Nuovo tipo `F24_STIPENDI` su `cg_spese_fisse`: escluso in competenza (già nel costo aziendale), incluso in cassa | Anti-doppio conteggio quando Marco inserirà F24 manualmente in futuro |
| E.7 | Mig 133 retro: import ELAB+F24 gen-apr 2026 da PDF già archiviati | Marco fornisce 8 PDF (4 ELAB + 4 F24) |
| E.8 | Tab "Costi mensili" sotto modulo Dipendenti: vista lista import + dettaglio per dipendente per mese | UI di trasparenza, non solo CE |
| E.9 | Rimuovere warning banner CE "costo personale parziale" | Solo dopo verifica Marco su dati corretti |

**Schema DB (G.3 Fase E):**
```
CREATE TABLE dipendenti_costo_consuntivo (
  id INTEGER PRIMARY KEY,
  anno INTEGER NOT NULL, mese INTEGER NOT NULL,
  dipendente_id INTEGER NOT NULL,  -- FK dipendenti.id
  ore_lavorate REAL,
  retribuzione_lorda REAL,
  contributi_lordo REAL,           -- carico ditta su lordo
  ore_straord REAL, retribuzione_straord REAL, contributi_straord REAL,
  ratei_importo REAL,              -- 13a+14a+ferie+permessi
  contributi_su_ratei REAL,
  tfr_maturato REAL,
  costo_totale REAL,               -- costo aziendale VERO del mese
  fonte_pdf TEXT,                  -- nome file ELAB
  importato_il TEXT,
  UNIQUE(anno, mese, dipendente_id)
);

CREATE TABLE f24_versamenti (
  id INTEGER PRIMARY KEY,
  anno_competenza INTEGER, mese_competenza INTEGER,
  data_scadenza TEXT,                -- normalmente 16 del mese successivo
  sezione TEXT NOT NULL,             -- 'erario'|'inps'|'regioni'|'comuni'|'inail'|'altri'
  codice_tributo TEXT,               -- 1001, 1040, DM10, 3802, ...
  periodo_rif_tributo TEXT,          -- MM/AAAA del singolo codice
  importo_debito REAL,
  importo_credito REAL,
  fonte_pdf TEXT, importato_il TEXT,
  raggruppamento_id TEXT,            -- ID che lega tutti i tributi del medesimo F24
  banca_movimento_id INTEGER         -- match con estratto conto (cassa)
);
```

**Anti-doppio per F24 stipendi:**
- Nuovo `tipo='F24_STIPENDI'` su `cg_spese_fisse` (se Marco vuole continuare a inserirli a mano nella scadenze view).
- `conto_economico.py` `_aggregate_spese_fisse_per_categoria`: escludere `F24_STIPENDI` in competenza (già dentro `costo_totale`), includere in cassa.
- Banca CrossRef: link automatico tra movimento di pagamento F24 e `f24_versamenti.raggruppamento_id`.

---

### G.7 — Piano dettagliato "Sposta data" (UX completamento SPOSTATO) ✅ FATTO 2026-05-10

**Contesto:** G.6 ha aggiunto lo stato `SPOSTATO` come valore valido in `cg_uscite.stato` e la colonna `cg_uscite.data_scadenza_originale` (TEXT NULL). G.7 ha aggiunto la UX dedicata. Implementato:
- Endpoint `PUT /uscite/{id}/scadenza` esteso (set automatico SPOSTATO + preserva originale alla prima rinegoziazione)
- Endpoint `PUT /uscite/{id}/ripristina-data` (reset data + ricalcolo stato)
- `FattureDettaglio.jsx`: card scadenza ora 2 sotto-celle ("Scadenza iniziale" read-only + "Programmata" editabile con bottoni Sposta data / Ripristina originale)
- `FattureElenco.jsx`: chip "Spostato" in drill-down filtro pagamento riga 2
- `ControlloGestioneUscite.jsx`: chip "Spostato" + palette fuchsia in STATO_STYLE

Sezione storica/piano qui sotto preservata per riferimento.

**Concetto:**
- `fe_fatture.data_scadenza` = **Scadenza iniziale** (dall'XML/FIC, read-only normalmente, modificabile solo per "errori di import")
- `cg_uscite.data_scadenza` = **Scadenza programmata** (editabile via UX "Sposta data")
- Quando la programmata viene modificata rispetto all'originale → stato diventa `SPOSTATO`
- `cg_uscite.data_scadenza_originale` salva la prima scadenza programmata prima del primo spostamento

**Distinzione semantica:**
- `RATEIZZATO`: N nuove date in un piano rate (gestito da `cg_spese_fisse` + `cg_piano_rate`)
- `SPOSTATO`: 1 sola nuova data concordata (rinegoziazione singola)

**Task da fare:**

1. **Backend — endpoint `PUT /controllo-gestione/uscite/{id}/sposta-data`**
   - Body: `{ nuova_data_scadenza: "YYYY-MM-DD", motivo?: str }`
   - Logica:
     - Se `data_scadenza_originale IS NULL`: salva la `data_scadenza` corrente come originale (prima rinegoziazione)
     - Aggiorna `data_scadenza` con la nuova
     - Setta `stato = 'SPOSTATO'`
     - Aggiunge nota tipo `[sposto_data 2026-05-10: motivo X]`
   - Auth: admin only

2. **Backend — endpoint `PUT /controllo-gestione/uscite/{id}/ripristina-data`**
   - Riporta `data_scadenza` a `data_scadenza_originale`
   - Setta `stato` derivato (SCADUTO se data passata, PROGRAMMATO altrimenti)
   - Cancella `data_scadenza_originale` (torna a NULL)
   - Usato per "ho sbagliato a spostare, ripristina"

3. **Frontend — modifiche `FattureDettaglio.jsx`**
   - Aggiungere 2 celle in pannello scadenza:
     - **"Scadenza iniziale"**: read-only, mostra `fattura.data_scadenza` (da fe_fatture). Bottone "Modifica" piccolo (solo correzione import).
     - **"Scadenza programmata"**: mostra `uscita.data_scadenza`. Bottone "Sposta data" prominente.
   - Modal "Sposta data":
     - Date picker per nuova data
     - Campo note/motivo (opzionale)
     - Mostra anche "Scadenza originale prima: GG/MM/YYYY" se già spostata in precedenza
     - Bottoni: "Sposta" + "Annulla"
     - Se attuale è già SPOSTATO: aggiungi bottone secondario "Ripristina originale"

4. **Frontend — chip "Spostato" nel modulo Acquisti**
   - Aggiungere a `FattureElenco.jsx` un 5° chip nella riga 2 sotto "Da pagare":
     - `Programmato | Scaduto | Verificare | Rateizzato | Spostato`
   - Filtro frontend: `f.cg_uscite_stato === "SPOSTATO"`
   - Colore: tono violet-ambra (a metà tra rateizzato e amber)

5. **Frontend — chip "Spostato" anche in `ControlloGestioneUscite.jsx`**
   - Aggiungere alla griglia chip stati in sidebar
   - Mapping label: `SPOSTATO → "Spostato"`, colore amber-violet
   - Default filtro: includere SPOSTATO insieme a PROGRAMMATO+SCADUTO

6. **Mig 115** (opzionale, se serve backfill)
   - Per fatture che hanno `cg_uscite.data_scadenza ≠ fe_fatture.data_scadenza`:
     - Verifica se la differenza è "spostamento concordato" o "errore import": probabilmente impossibile distinguere senza intervento utente
     - Lasciamo come sono — solo nuovi spostamenti saranno SPOSTATO

7. **Test integrazione**
   - Sposta data di una fattura → verifica stato passa a SPOSTATO
   - Ripristina → torna a PROGRAMMATO/SCADUTO
   - Re-spostamento: data_scadenza_originale resta la prima

8. **Documentazione**
   - Aggiorna `docs/stato_pagamento_unificato.md` con SPOSTATO + nuovo workflow
   - Sezione in `docs/modulo_controllo_gestione.md` sul "Sposta data"

**Effort stimato:** 3-4 ore (2 endpoint backend + 1 modal + 2 chip + test + docs).

**Bug/debt:**
- ~~G-DEBT1~~ — Risolto: Spese Fisse implementate da marzo (la roadmap riportava "mai implementate", era falso). Rimosso 2026-05-08.

---

## D — DIPENDENTI / TURNI / BRIGATA

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| D.1 | Scadenze documenti con alert (HACCP/sicurezza/visite/permessi) (M.A + M.F + 30/15/7gg) | M | ALTA | Mattoni esistono |
| D.2 | Calendario turni drag&drop (M.E) | M | ALTA | Mattone M.E esistente |
| D.3 | Template WA personalizzabile buste paga (migrare a M.C) | S | MEDIA | |
| D.4 | Allegato PDF reale via URL firmato (M.B) | M | MEDIA | |
| D.5 | Presenze griglia mensile + totali (v2.3) | M | MEDIA | |
| D.6 | Dashboard costi + incidenza % ricavi (v2.4) | M | MEDIA | Cross-modulo K (vendite) |
| D.7 | Costo orario + analisi produttività (€/ora) | S | MEDIA | Dati pronti |
| D.8 | Calendario richieste ferie (dipendente → admin approva) | M | MEDIA | Cross D.5 |
| D.9 | Contratti CRUD base + alert scadenza determinati (v2.5) | M | BASSA | |
| D.10 | Allegati PDF generici per dipendente (v2.6) | S | BASSA | Schema esiste |

**Bug/debt:**
- D-DEBT1 — Consolidamento 4 docs → 2 (Fase 5)
- D-DEBT2 — `dipendenti_allegati` schema esiste senza endpoint
- (T.3 K-tris cedolini in §T)

---

## C — CUCINA (gestione cucina: task + HACCP + pranzo + selezioni + lista spesa)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| C.1 | Integrazione M.F Alert engine (checklist pending) | S | ALTA | Mattoni pronti |
| C.2 | Frequenze settimanale/mensile (oggi solo giornaliera) | S | ALTA | |
| C.3 | Dashboard Cucina unificata (KPI HACCP+task+spesa+pranzo) | M | MEDIA | Esiste DashboardCucina.jsx, da potenziare |
| C.4 | Foto + firma su item HACCP | M | MEDIA | Compliance Asl (non urgente per Marco) |
| C.5 | Corrective action automatico FAIL temperatura → task chef | S | MEDIA | |
| C.6 | Dropdown assegnato_user da dipendenti (oggi stringa libera) | S | MEDIA | |
| C.7 | Notifiche push / WA su checklist in scadenza (M.C + M.A) | S | MEDIA | |
| C.8 | Export PDF registro mensile HACCP firmabile | S | MEDIA | M.B |
| **Pranzo settimanale** ||||
| C.P1 | Aggancio food cost / margine al menu (recipe_id già in DB) | S | MEDIA | Dati pronti |
| C.P2 | Note allergeni stampate sul PDF | S | MEDIA | |
| C.P3 | Multi-edizione (menu speciali eventi) | M | BASSA | Schema change |
| **Selezioni del giorno** (4 scelte + piatti del giorno) ||||
| ~~C.S1~~ | ~~Doc `modulo_selezioni.md`~~ | XS | ✅ FATTO 2026-05-19 | Stub `docs/modulo_selezioni_giorno.md` creato (DH.1). Da estendere endpoint-by-endpoint in sessione docs futura |
| C.S2 | Note allergeni per scelta del giorno | S | BASSA | |
| C.S3 | Foto plate-up per scelta del giorno | S | BASSA | |
| **Lista spesa Fase 2** (sotto-modulo Cucina, era §R.9-13) ||||
| C.L1 | Link ingrediente + storico prezzi | S | ALTA | |
| C.L2 | Vista per fornitore + WhatsApp veloce (M.C) | S | ALTA | |
| C.L3 | Generazione automatica da menu pranzo | M | MEDIA | Cross-modulo |
| C.L4 | Template ricorrenti (skill schedule) | S | MEDIA | |
| C.L5 | Workflow ordinato/in_arrivo/ricevuto | M | MEDIA | |
| C.L6 | Notifiche WA arrivo materiale (M.C + M.A) | S | BASSA | |

**Bug/debt:**
- C-DEBT1 — `modulo_cucina.md` obsoleto (parla di prefix `/cucina/` legacy, rinominato in `/tasks/` con mig 086)
- C-DEBT2 — `cucina.sqlite3` referenziato in mig 084/087 (verifica self-heal)
- C-DEBT3 — `pranzo.recipe_id` schema mai agganciato food cost (= C.P1)

---

## MC — MENU CARTA (cliente-facing)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| MC.1 | PDF carta con TOC cliccabile (era 7.3) | S | ALTA | Motore esistente |
| MC.2 | QR menu cliente (URL pubblico /menu/edition/{id}) | M | ALTA | Cliente touchpoint |
| MC.3 | Workflow editorial multi-utente (lock edizione) | M | MEDIA | |
| MC.4 | Versioning visuale carta (diff X vs Y) | M | MEDIA | |
| MC.5 | Preview cliente in tempo reale durante editing | M | MEDIA | |

---

## PR — PRENOTAZIONI

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| PR.1 | Widget pubblico /prenota (sostituisce TheFork Booking) — Fase 3 | L | ALTA | CAPTCHA Turnstile. ROI commissioni TheFork |
| PR.2 | Conferme automatiche email + WA — Fase 4 (M.C + M.D) | M | ALTA | M.D blocca |
| PR.3 | No-show tracking + alert scheda CRM (M.A + M.F) | S | ALTA | Mattoni esistono |
| PR.4 | Dashboard "stasera" (coperti + tavoli + cancellazioni) | S | ALTA | Dati pronti |
| PR.5 | Distacco TheFork Manager — Fase 5 (M.H) | M-L | MEDIA | M.H blocca |
| PR.6 | Lista d'attesa con notifica WA (M.C + M.A) | S | MEDIA | |
| PR.7 | Report coperti previsti (prenotati + stima walk-in) | S | MEDIA | Dati pronti |
| PR.8 | Allergie/preferenze cliente in planning (display) | S | MEDIA | Campo esiste in CRM |
| PR.9 | Reminder cliente automatico 24h prima (M.C + scheduler) | S | BASSA | Marco: utile ma non urgente |

**Bug/debt:**
- PR-DEBT1 — `modulo_prenotazioni.md` "In progettazione" ma codice impl (Fase 1+2 fatte). Da consolidare Fase 5.
- PR-DEBT2 — `prenotazioni_todo.md` da assorbire in modulo principale

---

## CL — CLIENTI / CRM / PREVENTIVI

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| CL.1 | Mailchimp sync MVP | M | ✅ FATTO | Endpoint /clienti/mailchimp/status + /sync. Vedi `ClientiMailchimp.jsx` v1.1 |
| CL.2 | Mailchimp v2 (sync bidirezionale + webhook + filtri pre-sync + log audit) | M-L | MEDIA | Da valutare se serve davvero |
| CL.3 | Compleanni WA/email automatici (M.C + M.D) | S | ALTA | M.D blocca |
| CL.4 | Preventivi Fase C — invio email + WA (M.C + M.D) | M | ALTA | M.D blocca |
| CL.5 | Preventivi Fase D — versioning + collegamento prenotazione | S | ALTA | M.A |
| CL.6 | WA link rapido scheda cliente (migrare a M.C) | S | MEDIA | |
| CL.7 | Note rapide inline da lista clienti | S | MEDIA | Popup |
| CL.8 | Preview merge side-by-side | M | MEDIA | UX upgrade |
| CL.9 | Audit log modifiche CRM | S | MEDIA | Tabella nuova |
| CL.10 | Segmentazione RFM automatica | M | MEDIA | Da storico |
| CL.11 | Timeline cliente unificata (prenotazioni + note + email + no-show) | S | MEDIA | Marco: tienilo, da rivedere |
| CL.12 | Import clienti da TheFork (M.H) | S | MEDIA | M.H blocca |
| CL.13 | Filtri combinati avanzati per campagne | M | BASSA | Dipende CL.1 |
| CL.14 | Google Contacts API | M | BASSA | Futuro |

**Bug/debt:**
- C-DEBT4 — `clienti_router.py` 2404 righe — refactor opportunistico in moduli (non urgente)

---

## ST — STATISTICHE (vendite iPratico)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| ST.1 | Doc obiettivo: chiarire scope "solo iPratico, non cross-modulo" | XS | BASSA | Marco: tienilo, da rivedere |
| ST.2 | Drill-down: vendite per giorno della settimana | S | BASSA | |
| ST.3 | Confronto YoY su top prodotti | S | BASSA | |
| ST.4 | Export PDF/Excel report mensile (M.B) | S | BASSA | |

---

## DH — DOCS HARDENING (post audit autonomo 2026-05-19)

**Fonte:** `docs/audit-2026-05-19/02_GAP_REPORT.md` (5 CRIT + 20 MED + 10 MIN + 5 anomalie strutturali).
**Verdetto adversarial:** 87/100 (`docs/audit-2026-05-19/VERIFICA_PLAUSIBILITA.md`).
**Stato:** alcune voci chiuse in commit 2026-05-19 docs hardening, altre rinviate.

> CRIT-3 e CRIT-4 sono stati **declassati a MED** in base alla verifica adversarial (vedi `VERIFICA_PLAUSIBILITA.md` §Test 3): CRIT-3 perché `modulo_vendite.md` §9 copre già il flusso operativo, CRIT-4 perché tasks/HACCP sono documentati in `modulo_cucina.md` ed è solo uno split di file da fare.

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| **DH.1** | NOMEN-1: rinomina `modulo_selezioni.md` → `modulo_vendite.md` + stub `modulo_selezioni_giorno.md` per i 5 router `scelta_*` | S | ✅ FATTO 2026-05-19 | Commit `[mixed]` docs hardening |
| **DH.2** | CRIT-1: stub `modulo_fatture_in_cloud.md` con 17 endpoint reali | XS | ✅ FATTO 2026-05-19 | Commit `[mixed]` docs hardening. Stub strutturato, da estendere endpoint-by-endpoint |
| **DH.3** | Disciplina docs in `CLAUDE.md` (raccomandazione 4 executive summary) | XS | ✅ FATTO 2026-05-19 | Commit `[mixed]` docs hardening |
| DH.4 | CRIT-3 (declassato a MED): estensione `modulo_vendite.md` §9 con mapping endpoint:linea per i 11 endpoint chiusure turno | S | DA FARE — bassa | Sessione docs dedicata |
| DH.5 | CRIT-4 (declassato a MED): split `modulo_cucina.md` → `modulo_cucina.md` (lista_spesa) + `modulo_task_manager.md` (checklist + tasks + HACCP) | S | DA FARE — media | Sessione docs dedicata, ~1-2h. Non creare da zero: lo split valorizza ciò che già c'è |
| DH.6 | Tabella Capability standardizzata in cima a ogni `modulo_*.md` (~15 file) | L | DA FARE — bassa | Sessione docs L, distribuibile. Riferimento granulare: `docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md` (416 capability già mappate file:linea) |
| DH.7 | Estensione `push.sh` (guardiano L1) con warning non-bloccante se diff tocca un router ma non `modulo_*.md` corrispondente | XS | DA FARE — bassa | Sessione tecnica L1 |
| DH.8 | Verifica spot dei 3 claim del manuale utente: PIN anti-bruteforce 60s (`auth_service.py`), durata JWT (`app/core/security.py`), comportamento `moduli_attivi.json` (hot reload vs restart) | XS | DA FARE — alta | Prima di dare il manuale (`docs/audit-2026-05-19/04_MANUALE_UTENTE.md`) allo staff |
| DH.9 | Refactor strutturale `docs/{moduli, specs, adr}/` (`docs/audit-2026-05-19/03_DOCS_REFACTORING_PLAN.md`) | L | DA VALUTARE | Investimento ~2 giorni distribuiti. Non urgente, ma più si rinvia più costa |
| DH.10 | Coprire i 20 gap MED del gap report (FIC sync flow, allergeni, foodcost per ricetta, Mailchimp, ecc.) | M | DA FARE — bassa | Una sessione mirata o opportunistica quando si tocca il modulo |
| DH.11 | Coprire i 10 gap MIN del gap report (reset-database cantina, recovery import fatture, ecc.) | XS | DA VALUTARE | Opportunistico |

### Decisioni PO Marco 2026-05-19 (post-audit, riferimento)
1. **NOMEN-1** → DISAMBIGUIAMO (DH.1 fatto).
2. **V-H.I cleanup `*_legacy.jsx` vini** → "non prima del 15 giugno 2026" (vedi §V).
3. **Endpoint `/menu/`** → "nel cassetto, poi lo faremo" (vedi `inventario_pulizia.md`).
4. **MORT-2 turni vecchio + v2** → "lo vediamo quando sistemiamo meglio il modulo Dipendenti" (vedi `controllo_design.md`).
5. **Mattone email M.D** → "non prioritario" (vedi §M aggiornato).

---

## T — TECNICI / PLATFORM

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| T.1 | Health check endpoint /health + UptimeRobot | S | ALTA | Monitor esterno |
| T.2 | K-tris: 3 path PDF cedolini → tenant_dir() (residuo K-bis) | M | ALTA | Da R6.5 |
| T.2b | **Frontend statico (Vite dev → build) in produzione** | M | **ALTA** | Vedi `analisi_hardening_vps.md §3.A` + memoria `project_frontend_statico_pianificato`. Sourcemap chiusi, perf migliore, no SPF Vite crash. Pianificato primo mercoledì libero, ~3-4h con fallback Vite per 24h. Pre-requisito Capacitor (Scenario B App Store). |
| T.3 | Banner "nuova versione disponibile" FE (polling BUILD_VERSION) | S | MEDIA | |
| T.4 | WAL mode coverage 6 DB rimanenti (batch cleanup) | S | MEDIA | |
| T.5 | Migrazioni unificate ai 9 DB non-foodcost | M | MEDIA | |
| T.6 | Endpoint /system/maintenance + banner FE | M | MEDIA | |
| T.7 | Restore test settimanale automatico (sicurezza_backup TODO) | M | MEDIA | Safety |
| T.8 | Pulizia backup forensi vini_magazzino (S52-1 chiuso) | XS | BASSA | |
| T.9 | Cleanup file morti (run_server.py, update_vps.sh orfano) | XS | BASSA | |
| T.10 | Aruba snapshot manuale settimanale | XS | BASSA | "Da ricordare" — Marco gestisce manuale dal pannello |
| T.11 | Status page pubblica status.tregobbi.it | M | BASSA | |
| T.12 | API documentation Swagger UI | S | BASSA | |

---

## S — VENDITA PRODOTTO / COMMERCIALE

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| S.1 | Demo trgb.it online (seconda istanza prodotto) | M | BASSA | "Lista, non urgente" — Marco |
| S.2 | Test runbook installazione_nuovo_server (su trgb.it) | S | BASSA | |
| S.3 | Pricing + landing trgb.it | M | BASSA | |
| S.4 | Pitch deck + materiali sales | M | BASSA | |
| S.5 | Onboarding cliente standard (workflow guidato) | M | BASSA | |

---

## U — UX / BRAND

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| U.1 | Pattern testa+tab — 2 schede pendenti (controllo_design §1) | S+S | MEDIA | |
| U.2 | Tool config stampe M.B (era 8.14) | M | MEDIA | UI per personalizzare PDF |
| U.3 | Home widget per ruolo (controllo_design §4) | M | MEDIA | |
| U.4 | Search globale Cmd+K (era 8.12) | M | MEDIA | |
| U.5 | Dropdown Header M2 — deep search globale (era 8.12) | M | MEDIA | Endpoint `/search/global` |
| U.6 | Dropdown Header M3 — preview panel 2 colonne | M | BASSA | Futuro |
| U.7 | Dark mode (controllo_design §2) | L | BASSA | Futuro |
| U.8 | Pattern gobbette in empty state (era 8.1) | S | BASSA | Watermark decorativo |
| U.9 | About/version panel con logo (era 8.3) | S | BASSA | |
| U.10 | Shortcut tastiera + Command Palette (era 8.8) | M | BASSA | |
| U.11 | Onboarding guidato nuovo utente (era 8.9) | S | BASSA | Wizard primo login |
| U.12 | Tema stagionale / branding eventi (era 8.11) | S | BASSA | Cosmetico |

---

## 📈 Priorità complessiva — Top picks

**5 ALTA che muovono il sistema (senza prerequisiti):**
1. **R.1 + V.2** — Alert food cost + sottoscorta (M.A+M.F mattoni pronti)
2. **PR.4** — Dashboard "stasera" (sostituisce check TheFork)
3. **K.1 + K.2** — Coperti/scontrino medio + alert chiusura non inserita
4. **CL.5** — Preventivi Fase D (versioning + collegamento prenotazione)
5. **B.3** — Dashboard banca Recharts

**Bottleneck — costruire prima per sbloccare gruppi:**
- **M.D Email** sblocca: PR.2 conferme prenotazioni, CL.3 compleanni, CL.4 preventivi invio
- **M.H Import** sblocca: PR.5 distacco TheFork, V.12 import vini, CL.12 import TF, B.7 carta credito

**In pausa (decisione Marco):**
- A.5+A.6 — Proforme intero
- (S.1-S.5) — Vendita prodotto, "lista bassa"

---

## Storico (riferimenti)

- **0.1.1** Fix git VPS hook + /system/info commit — ✅ FATTO 2026-05-07 (commit `534c88a5`)
- **0.1.2** K-bis 4 cartelle uploads — ✅ FATTO 2026-05-04 (`ce9629c`)
- **0.1.5** Splash iOS PWA — ✅ FATTO 2026-05-07 (14 link tag device-specific)
- **1.1** PWA Fase 0 (sw + manifest + splash) — ✅ FATTO 2026-05-07
- **1.2** Test PWA iPad reale — ✅ FATTO 2026-05-07
- **1.12** push.sh debounce — ✅ FATTO 2026-04-25
- **1.14.a** push.sh probe + accessi nginx — ✅ FATTO 2026-04-25
- **1.15** Pulire import morti — ✅ FATTO
- **1.16+17** Modulo guardiano L2+L3 — ✅ FATTO 2026-04-25
- **1.20** PIN admin random — ✅ FATTO 2026-04-25
- **3.10+3.11** Flusso contanti + Flusso spese — ✅ FATTO 2026-04-22
- **CL.1** Mailchimp sync MVP — ✅ FATTO

Per cronologia completa refactor R1-R8 vedi `docs/refactor_monorepo.md` §6.
Per incidenti chiusi vedi `docs/problemi.md` sezione "Risolti".
