# Audit State
**Avviato:** 2026-05-19
**Ultimo update:** 2026-05-19 — TUTTE LE FASI COMPLETATE
**Modalità:** autonoma end-to-end (Claude Code)
**Commit di riferimento:** `c084e3d` (git rev-parse HEAD locale, 2026-05-19)
**Versione prodotto al momento dell'audit:** backend `VERSION=5.16`, frontend `package.json` `1.1.0`

## Progresso
- [x] Fase 0 — Stack detection (completata)
- [x] Fase 1 — Inventario moduli (completata — vedi `00_INVENTARIO.md`)
- [x] Fase 2 — Audit moduli (completata — vedi `01_AUDIT_PER_MODULO.md`, 14 sezioni)
  - [x] vini (71 capability)
  - [x] ricette + selezioni del giorno (62 capability)
  - [x] acquisti (32 capability)
  - [x] controllo_gestione (31 capability)
  - [x] banca (19 capability)
  - [x] dipendenti + turni (33 capability)
  - [x] prenotazioni + preventivi + menu_templates (31 capability)
  - [x] clienti (22 capability)
  - [x] cassa + chiusure turno (26 capability)
  - [x] menu_carta + pranzo (22 capability)
  - [x] cucina (4 capability)
  - [x] task_manager + haccp (20 capability)
  - [x] statistiche (7 capability)
  - [x] platform (36 capability)
- [x] Fase 3 — Gap report (completata — vedi `02_GAP_REPORT.md`)
- [x] Fase 4 — Refactoring plan docs (completata — vedi `03_DOCS_REFACTORING_PLAN.md`)
- [x] Fase 5 — Manuale utente (completata — vedi `04_MANUALE_UTENTE.md`)
- [x] Fase 6 — Executive summary (completata — vedi `05_EXECUTIVE_SUMMARY.md`)

**Totale capability auditate: ~416** (su 14 moduli)

**Deliverable prodotti (tutti in `/docs/audit-2026-05-19/`):**
- `AUDIT_STATE.md` (questo file)
- `00_INVENTARIO.md` (163 righe)
- `01_AUDIT_PER_MODULO.md` (1.020 righe — 416 capability)
- `02_GAP_REPORT.md` (100 righe — 5 CRIT + 20 MED + 10 MIN + 5 anomalie strutturali)
- `03_DOCS_REFACTORING_PLAN.md` (229 righe)
- `04_MANUALE_UTENTE.md` (791 righe — Sez. A 9 capitoli + Sez. B 16 capitoli + Appendice)
- `05_EXECUTIVE_SUMMARY.md`

**Health score docs: 73/100.** Top 5 raccomandazioni in `05_EXECUTIVE_SUMMARY.md`.

## Note di sessione
- Codebase multi-tenant (R1-R8 refactor in corso). Tenant default: `tregobbi` (osteria Tre Gobbi di Marco), tenant alternativo: `trgb` (istanza pulita prodotto), `test_demo` e `_template`.
- Module loader (R8b) attivo in `main.py:127-129` e `app/platform/module_loader.py`: monta i router solo se il modulo è elencato in `locali/<TRGB_LOCALE>/moduli_attivi.json`.
- 14 moduli definiti in `core/moduli/<id>/module.json` (13 vendibili + 1 platform). Questo è il punto di verità per la classificazione.
- 135+ migrazioni SQLite. Naming: `NNN_descrizione.py` in `app/migrations/`. Esistono alcuni duplicati di numerazione (129/130/131/133) — segnalato per Fase 3.
- Documentazione esistente: 40+ file `.md` in `docs/`. Molti file per-modulo (`modulo_*.md`), un `changelog.md`, una `roadmap.md`, una `sessione.md`. La domanda chiave per il refactoring docs: questi file sono allineati al codice? (verifica in Fase 2).
- Vincoli operativi rispettati: nessuna modifica al codice; nessun commit/push; scrittura solo in `/docs/audit-2026-05-19/`.

## Come riprendere se interrotto
Leggi questo file. Trova il primo checkbox non spuntato in "Progresso". Se è in Fase 2, vai al primo modulo non spuntato in elenco. Riprendi da lì leggendo:
1. `00_INVENTARIO.md` per il contesto del modulo
2. `01_AUDIT_PER_MODULO.md` per le sezioni già scritte (non riscriverle)
3. Il manifesto `core/moduli/<id>/module.json` per router_files, tabelle, prefix
