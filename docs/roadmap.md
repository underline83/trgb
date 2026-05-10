# TRGB Gestionale — Roadmap (riorganizzata 2026-05-07)

**Ultimo aggiornamento:** 2026-05-07 — riorganizzazione completa modulo per modulo dopo refactor R1-R8 chiuso, R6.5 push 1+2+3 chiuso, sistema sicurezza/backup post-incidente live, PWA Fase 0 completa.
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
| **M.D** | **Email service brand** | **M** | **DA FARE — alta futura** | SMTP/Mailgun/Resend + template HTML. Sblocca conferme prenotazioni, invio preventivi, compleanni, busta paga email |
| **M.H** | **Import engine generico** | **S** | **DA FARE — media** | Estrazione pattern da `clienti_router.py` TheFork. Sblocca: import TF, Excel vini diff, carta credito, banca PSD2 |
| **M.G** | **Sistema permessi centralizzato** | **M** | **DA FARE — media** | Sostituisce 30+ check `if (ruolo === ...)` sparsi |
| **M.J** | **Housekeeping (guardiano del progetto)** | **L** | **DA FARE — media** | 3 livelli: (L1) hook pre-push in `push.sh` blocca pattern sospetti (`__pycache__`, `*.zip` root, `*_dryrun.csv`, `.DS_Store`, mockup in root, TODO fantasma, changelog non aggiornato) + flag `--skip-housekeeping`; (L2) skill `trgb:housekeeping` invocabile on-demand (`/audit`) che riproduce audit completo file-per-file; (L3) scheduled task mensile (primo lunedì 08:00) con report in Bacheca M.A. Razionale: l'audit S51 (20 apr) ha trovato 21.6 MB di rumore + paradoc fantasma; senza un meccanismo automatico il pattern si ripete (eseguito retroattivamente 2026-05-08). Spec dettagliata era in `AUDIT_2026-04-20/mattone_housekeeping.md` (cancellato). Scripts riusabili `scripts/housekeeping/scan_*` per BE/FE/docs/memoria/worktree. |

---

## V — VINI / CANTINA (include carta bevande)

| ID | Cosa | Effort | Stato | Note |
|----|------|--------|-------|------|
| V.1 | Flag DISCONTINUATO UI + filtro | S | ALTA | DB ready (colonna esiste), serve solo UI |
| V.2 | Alert sottoscorta (M.A + M.F) | S | ALTA | Mattoni esistono |
| V.3 | Storico prezzi fornitore — grafico Recharts | S | ALTA | Dati già in `vini_prezzi_storico` |
| V.4 | Note degustative cliente (AI-generate + edit + visibili in carta cliente) | M | ALTA | Marco S58. Campo `NOTE_DEGUSTAZIONE` su `vini_magazzino` |
| V.5 | Più distributori/rappresentanti per vino | L | MEDIA | Tabella `vino_distributori` strutturale |
| V.6 | Anagrafiche normalizzate (produttori/distributori/denominazioni) | M | MEDIA | Tabelle dedicate + autocomplete + dedup |
| V.7 | Famiglia vino raggruppa annate | M-L | MEDIA | Tabella `vini_famiglie` |
| V.8 | Vitigni con percentuali | M | MEDIA | Tabella `vini_vitigni_anagrafica` + somma=100 |
| V.9 | Inventario rapido da iPad (mobile-first +/- giacenza) | M | MEDIA | UI touch |
| V.10 | Carichi automatici da Fatture XML | M | MEDIA | Match iPratico → CARICO automatico |
| V.11 | PDF carta con TOC cliccabile | S | MEDIA | Motore `carta_vini_service.py` esistente |
| V.12 | Import Excel diff interattivo | M | MEDIA | Richiede M.H |
| V.13 | Inventario fisico mobile con QR/barcode | L | BASSA | QR generation per vino |
| V.14 | Carta vini multi-template (eventi, degustazioni) | M | BASSA | Motore esistente |
| V.15 | Audit log scheda vino | S | BASSA | Tabella audit |
| V.16 | Filtri lato server (per dataset > 5000) | M | BASSA | Solo se scala oltre 1 cliente |
| V.17 | iPratico test e2e completo | S | BASSA | Test manuale |
| V.18 | Widget alert WA lista spesa (punto 7) | M | BASSA | Bloccato da V.5 + M.B PDF |
| V.19 | Carta Bevande — TODO da `carta_bevande_todo.md` | M | DA VALUTARE | Cap. dedicato in `modulo_vini.md` (consolidamento) |

**Bug/debt:**
- V-BUG1 — FORCE import senza ruolo admin in `vini_magazzino_router.py` (sicurezza, problemi.md)
- V-DEBT1 — `app/models/vini_db.py` deprecated ma file ancora presente
- V-DEBT2 — `app/models/vini_model.py` ridotto a `normalize_dataframe()`

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
| G.3 | P&L mensile (cross-modulo Cassa + Acquisti + Stipendi) | M | ALTA | M.B PDF |
| G.8 | Tasse — sezione dedicata in Spese Fisse | M | MEDIA | Già supportato come `tipo='TASSA'`, manca eventualmente template wizard dedicato |
| G.9 | Stipendi — sezione dedicata in Spese Fisse | M | MEDIA | `tipo='STIPENDIO'` esistente (26 record). Cross §D: integrazione busta paga PDF → cg_uscite |

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
| C.S1 | Doc `modulo_selezioni.md` (oggi non c'è doc) | XS | BASSA | |
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
