# Audit TRGB — Executive Summary

**Data audit:** 2026-05-19
**Durata esecuzione:** ~1.5 ore (esecuzione autonoma Claude Code)
**Commit di riferimento:** `c084e3d` (git rev-parse HEAD locale)
**Backend version:** `5.16` · **Frontend version:** `1.1.0` · **Tenant scansionato:** `tregobbi`

---

## Salute del software

- **Moduli funzionali:** 13 vendibili + 1 platform = **14 moduli** (mappa in `core/moduli/<id>/module.json`)
- **Capability totali esposte all'utente:** **~416** (vedi `01_AUDIT_PER_MODULO.md`)
- **Router backend:** 49 file in `app/routers/`
- **Pagine frontend:** ~50 sotto `frontend/src/pages/`
- **Migrazioni SQLite:** 135 file (4 con numerazione duplicata — vedi MIGR-1)
- **Database SQLite:** 10 file (foodcost.db + 9 dedicati per dominio)
- **Feature morte/disabilitate identificate:** 4 macro (`*_legacy.jsx` vini, `vini_db.py` / `vini_model.py`, campo `DISCONTINUATO` rimosso mig 124, endpoints rollback/migrate-from-legacy post-cutover) — tutte tracciate e pianificate in roadmap.
- **Stack:** FastAPI (Python 3.12) + SQLite + React 18 + Vite + TailwindCSS. Multi-tenant via `locali/<id>/`.

**Giudizio sintetico:** codebase **viva, ben strutturata, già in via di refactor R1-R8 verso modularità prodotto-vendibile**. Una sola anomalia strutturale rilevante: la numerazione duplicata di alcune migrazioni (cosmetico, non rompe runtime).

---

## Salute della documentazione

- **Health score docs: 73/100**
- **Capability auditate:**
  - ✅ Allineate: ~302 (73%)
  - ⚠️ Parziali: ~74 (18%)
  - 🆕 Non documentate: ~40 (9%)
  - ❌ Obsolete: 0 in modo dimostrabile
  - 👻 Fantasma: 0 in modo dimostrabile
- **Gap critici (CRIT):** 5
- **Gap medi (MED):** 20
- **Gap minori (MIN):** 10
- **Feature fantasma da rimuovere dai docs:** 0 con certezza.
- **File `modulo_*.md` esistenti:** 18. Allineamento atteso 14 moduli ↔ N file = già close-to-1:1 con doppi giustificati.

**Giudizio sintetico:** docs **sopra la media** per un codebase di questa estensione e ritmo. Disallineamenti concentrati in 3 aree: integrazione Fatture in Cloud, sub-modulo Selezioni del Giorno, modulo Task Manager + HACCP. La pratica osservata di un `modulo_*.md` per modulo + `sessione.md` continuamente aggiornata + `changelog.md` funziona — va solo rinforzata e standardizzata.

---

## Top 5 raccomandazioni in ordine di priorità

1. **Risolvi la collisione semantica "Selezioni" (NOMEN-1).** Rinomina `docs/modulo_selezioni.md` → `docs/modulo_cassa_vendite.md` e crea `docs/modulo_selezioni_giorno.md` per il sub-modulo Ricette. Si evita la maggior fonte di confusione utente. **Effort: 1 ora.**

2. **Colma i 4 gap critici di docs** aprendo gli stub mancanti (anche essenziali in fase 1):
   - `docs/modulo_fatture_in_cloud.md` (CRIT-1: 12 endpoint live FIC)
   - `docs/modulo_selezioni_giorno.md` (CRIT-2)
   - `docs/modulo_chiusure_turno.md` (CRIT-3)
   - `docs/modulo_task_manager.md` + `docs/modulo_haccp.md` (CRIT-4)
   - `docs/modulo_platform_auth_utenti.md` (MED-19)
   **Effort: 6-8 ore (anche solo lista endpoint + concetti + link al codice).**

3. **Standardizza la "Tabella Capability" in cima a ogni `modulo_*.md`.** L'audit `01_AUDIT_PER_MODULO.md` contiene già la lista granulare di 416 capability — è copia-incolla guidata. Diventa la *single source of truth* del manuale utente nel tempo. **Effort: 4-6 ore.**

4. **Aggiungi al `CLAUDE.md` la regola di disciplina docs:** "ogni capability aggiunta in un router → riga nella tabella Capability del modulo + sezione di dettaglio". Enforcement zero-cost per il futuro: ogni nuova feature lascia traccia. Estendi `push.sh` (guardiano L1) con warning non-bloccante se diff tocca un router ma non `modulo_*.md` corrispondente. **Effort: 30 min.**

5. **Refactor docs strutturale** (`02_DOCS_REFACTORING_PLAN.md`): cartelle `docs/moduli/`, `docs/specs/`, `docs/adr/`. Sposta + standardizza. È un investimento — non urgente, ma se affrontato adesso evita di trascinarsi 3 mesi avanti il debito. **Effort: 2 giorni di lavoro distribuiti.**

---

## Manuale utente

- **File:** `04_MANUALE_UTENTE.md` (~6.000 parole, 791 righe)
- **Sezione A — End User:** 9 capitoli (Primi passi, Prenotazioni, Sala, Vendite Vini, Cucina, Chiusure, Tasks, CRM lookup, FAQ)
- **Sezione B — Manager/Admin:** 16 capitoli (Setup, Utenti/Ruoli, Cantina, Ricette, Acquisti+FIC, CG, Banca, Cassa, Dipendenti+Turni, Menu Carta, CRM, Preventivi, Statistiche, Task+HACCP, Notifiche, Backup)
- **Appendice:** Glossario + Indice analitico + Versione riferimento

> **Limite del manuale:** ogni capability è tracciabile a un router/funzione tramite `01_AUDIT_PER_MODULO.md`. **NON cita codice nelle Sezioni A/B** (regola).

---

## Effort stimato per chiudere i gap critici

- **CRIT-1 (FIC docs):** 2 ore (basato sui 12 endpoint già auditati).
- **CRIT-2 (Selezioni del Giorno docs):** 1 ora (5 router quasi-gemelli, struttura ripetuta).
- **CRIT-3 (Chiusure turno docs):** 2 ore (sub-system di ~12 endpoint).
- **CRIT-4 (Task Manager + HACCP docs):** 3 ore (modulo intero non documentato).
- **NOMEN-1 (rename + chiarimenti):** 1 ora.
- **Tabella Capability standardizzata in cima a `modulo_*.md`:** 4-6 ore distribuiti.

**Totale per chiudere i critici:** ~13-15 ore di docs work distribuiti in 1-2 settimane.
**Per quick wins (CLAUDE.md + push.sh check + alcuni stub):** ~3 ore.

---

## Decisioni che richiedono input del PO (Marco)

> Dettaglio in `02_GAP_REPORT.md` §"Decisioni che richiedono input del PO".

1. **NOMEN-1 "Selezioni":** disambiguare o mantenere alias?
2. **Cleanup `*_legacy.jsx` vini (task V-H.I):** quando lanciarlo?
3. **Endpoint `/menu/`** (1 endpoint solo): mantenere, consolidare o rimuovere?
4. **Convivenza turni vecchio + v2:** switch atomico o continuare con fallback?
5. **Mattone email (M.D):** prioritizzare per quale workflow?

---

*Audit completato. Per la sintesi 1-pagina: questo file. Per il manuale: `04_MANUALE_UTENTE.md`. Per il dettaglio capability: `01_AUDIT_PER_MODULO.md`.*
