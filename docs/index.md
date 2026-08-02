# TRGB Docs — Indice

> **Tipo:** ⚙ schema · **Stato:** attuale · **Ultima verifica:** 2026-07-24
> **Vedi anche:** [convenzioni_wiki.md](convenzioni_wiki.md) (le regole di questo wiki)

Home del wiki di progetto. Ogni pagina di `docs/` è elencata qui, per argomento, con una riga di descrizione. Legenda tipi: 📓 log append-only · 📄 pagina wiki (stato attuale) · ⚙ schema/regole. Pagina nuova → riga nuova qui, stesso commit ([regola 1](convenzioni_wiki.md)).

---

## 🚀 Partenza sessione (leggere SEMPRE, in quest'ordine)

- ⚙ [`../CLAUDE.md`](../CLAUDE.md) — istruzioni Marco → Claude: divieti git, palette, mattoni, discipline `[core]`/`[locale]`, regole capability.
- 📓 [sessione.md](sessione.md) — diario sessioni; header "Ultimo aggiornamento" con stato push/pending. Storico vecchio in [archive/sessione_archivio_39.md](archive/sessione_archivio_39.md).
- 📄 [roadmap.md](roadmap.md) — punti aperti per sezione, ID stabili (es. `2.1`, `V.22`); stati DA FARE / FATTO / BLOCCATO / FUTURO / IN OSSERVAZIONE.
- 📓 [problemi.md](problemi.md) — bug segnalati da Marco: aperti in alto, risolti in fondo con data e commit.

## 📓 Log (append-only)

- 📓 [changelog.md](changelog.md) — storico rilasci, formato Keep a Changelog, recenti in alto. Vivi gli ultimi ~3 mesi; il resto in [archive/changelog_archivio_2026-04.md](archive/changelog_archivio_2026-04.md).
- 📓 [sessione.md](sessione.md) e [problemi.md](problemi.md) — vedi sopra. Sessioni vecchie in [archive/sessione_archivio_59.md](archive/sessione_archivio_59.md) e [archive/sessione_archivio_39.md](archive/sessione_archivio_39.md).
- Il lint del wiki (`scripts/docs_lint.py`, warning-only in push.sh) tiene puliti link e index — v. [convenzioni_wiki.md](convenzioni_wiki.md) §Lint.

## 🏛 Architettura & convenzioni tecniche

- 📄 [stack_tecnico.md](stack_tecnico.md) — architettura tecnica completa (backend, frontend, deploy).
- 📄 [architettura_locale.md](architettura_locale.md) — architettura locale post-R6.5, path canonico `locali/<id>/data/`.
- 📄 [architettura_mattoni.md](architettura_mattoni.md) — mattoni condivisi M.A–M.I: cosa esiste, dipendenze, ordine sviluppo a Wave.
- 📄 [architettura_pattern.md](architettura_pattern.md) — pattern ricorrenti: WAL, trailing slash, §9-bis visione d'insieme, ecc.
- 📄 [refactor_monorepo.md](refactor_monorepo.md) — piano refactor R1–R8 (doc canonico; stato sessioni in §6).
- 📄 [database.md](database.md) — schema di tutti i DB SQLite.
- 📄 [stato_pagamento_unificato.md](stato_pagamento_unificato.md) — semantica stati pagamento fatture, 3 dimensioni D1/D2/D3 (§15 canonico).
- 📄 [mattone_calendar.md](mattone_calendar.md) — spec del mattone M.E Calendar.
- 📄 `../MIGRATIONS_TRGB.md` (root) — registro migrazioni `TRGB_SPECIFIC` (seed/dati tenant Tre Gobbi).

## ⚙ Regole trasversali (schema)

- ⚙ [convenzioni_wiki.md](convenzioni_wiki.md) — le 4 regole di questo wiki: home, un fatto una pagina, link relativi, header di stato.
- ⚙ [checklist_visione_insieme.md](checklist_visione_insieme.md) — checklist punti obbligatori per ogni modifica (usata dal guardiano, Step 4-bis).
- ⚙ [controllo_design.md](controllo_design.md) — regole UI/UX trasversali (modulo guardiano).
- 📄 [styleguide.md](styleguide.md) — design system: palette TRGB-02, tipografia, componenti brand.
- 📄 [inventario_pulizia.md](inventario_pulizia.md) — tech debt e cleanup batch (worktree orfano, file morti, WAL TODO).

## 🧩 Moduli (una pagina per modulo — mappa canonica in `CLAUDE.md` §capability)

- 📄 [modulo_vini.md](modulo_vini.md) — Cantina & Vini: magazzino, carta, carta bevande, vista sommelier. Widget dashboard: [modulo_vini_widget_dashboard.md](modulo_vini_widget_dashboard.md).
- 📄 [modulo_vini_ordini.md](modulo_vini_ordini.md) — Ordini ai fornitori vini: piano a fasi O1–O7, modello dati ordini, invio WhatsApp al rappresentante.
- 📄 [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md) — Ricette & Food Cost: ingredienti, matching fatture, conversioni. Selezioni del giorno: [modulo_selezioni_giorno.md](modulo_selezioni_giorno.md).
- 📄 [modulo_acquisti.md](modulo_acquisti.md) — Acquisti: fornitori, categorie, dashboard. Import SDI: [modulo_fatture_xml.md](modulo_fatture_xml.md) · sync FIC: [modulo_fatture_in_cloud.md](modulo_fatture_in_cloud.md).
- 📄 [modulo_controllo_gestione.md](modulo_controllo_gestione.md) — Controllo Gestione: dashboard, scadenzario, uscite, spese fisse.
- 📄 [modulo_banca.md](modulo_banca.md) — Banca + Flussi di Cassa: estratti conto, riconciliazione, contanti, mance.
- 📄 [modulo_dipendenti.md](modulo_dipendenti.md) — Dipendenti: anagrafica. Turni v2: [modulo_dipendenti_turni.md](modulo_dipendenti_turni.md). Chiamate intermittenti: [modulo_intermittenti.md](modulo_intermittenti.md).
- 📄 [modulo_prenotazioni.md](modulo_prenotazioni.md) — Prenotazioni: planning, vista settimanale, mappa tavoli. Preventivi: [modulo_preventivi.md](modulo_preventivi.md).
- 📄 [modulo_clienti_crm.md](modulo_clienti_crm.md) — Clienti / CRM: anagrafica, tag, segmenti, sync Mailchimp.
- 📄 [modulo_vendite.md](modulo_vendite.md) — Vendite / Cassa (ex "Selezioni", NOMEN-1): corrispettivi, chiusure turno, preconti.
- 📄 [modulo_menu_carta.md](modulo_menu_carta.md) — Menu Carta: edizioni, sezioni, QR pubblico, generatore MEP. Pranzo: [modulo_pranzo.md](modulo_pranzo.md).
- 📄 [modulo_cucina.md](modulo_cucina.md) — Cucina: checklist HACCP, task manager (split task_manager previsto, DH.5), MEP.
- 📄 [modulo_statistiche.md](modulo_statistiche.md) — Statistiche: import iPratico, KPI, top prodotti.
- 📄 [modulo_selezioni.md](modulo_selezioni.md) — stub storico (rinominato in Vendite, NOMEN-1 2026-05-19).

**Spec puntuali:** 📄 [spec_home_per_ruolo.md](spec_home_per_ruolo.md) (home differenziata per ruolo) · 📄 [spec_riconciliazione.md](spec_riconciliazione.md) (riconciliazione bancaria) · 📄 [spec_utenze.md](spec_utenze.md) (utenze multi-layout) · 📄 [refactor_anagrafiche_vini.md](refactor_anagrafiche_vini.md) (refactor anagrafiche vini).

## 🚢 Deploy & infrastruttura

- 📄 [deploy.md](deploy.md) — procedura push, post-receive hook VPS, recovery SQLite, §6 anti-conflitto.
- 📄 [GUIDA-RAPIDA.md](GUIDA-RAPIDA.md) — comandi operativi rapidi: ssh, backup, log, restart, setup nuovo PC.
- 📄 [installazione_nuovo_server.md](installazione_nuovo_server.md) — runbook setup server per nuovo cliente.
- 📄 [sicurezza_backup.md](sicurezza_backup.md) — architettura backup post-incidente S60-INC1.
- 📄 [analisi_hardening_vps.md](analisi_hardening_vps.md) — analisi hardening del VPS Aruba.

## 🔍 Audit & analisi

- 📄 [audit-2026-06-12/](audit-2026-06-12/00_EXECUTIVE_SUMMARY.md) — audit completo (sicurezza, dati, backend, frontend, infra, performance, prodotto) + piano azione + delta 2026-07-10.
- 📄 [audit-2026-05-19/](audit-2026-05-19/05_EXECUTIVE_SUMMARY.md) — audit capability per modulo, gap report (~40 capability non documentate), manuale utente.
- 📄 [analisi_app_apple.md](analisi_app_apple.md) — analisi per l'app mobile (Capacitor / App Store).

## 📦 Materiali & varie

- 📄 [readme.md](readme.md) — panoramica progetto (onboarding umano: struttura cartelle, env, avvio locale).
- `mockups/` — mockup HTML pre-implementazione (cucina, turni, menu QR, riconciliazione, KPI bar).
- `operativo/` — output operativi cucina (checklist stampabili docx/pdf).
- `commerciale_brochure_v5.docx` — brochure commerciale prodotto.
- `query_cg_uscite_aggregatore.sql` — query di riferimento aggregatore CG uscite.

## 🗄 Archivio

- [archive/](archive/README.md) — materiale storico non più mantenuto: sessioni ≤39 e 40–59, changelog fino ad aprile 2026, piani v2.0, analisi 2026-03, prompt. Non linkare da pagine attive se non come riferimento storico.
