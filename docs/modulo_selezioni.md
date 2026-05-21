# Modulo Selezioni — RINOMINATO (2026-05-19)

> Questo file è stato **rinominato** dopo l'audit autonomo del 2026-05-19 (gap NOMEN-1).
> Marco lo userà come puntatore finché non lo rimuove con `git rm` in un cleanup futuro.

## Disambiguazione

Storicamente "Selezioni" era usato per due cose semanticamente diverse:

| Cosa | Modulo tecnico | Doc canonico |
|---|---|---|
| **Vendite / Cassa** (corrispettivi, chiusure turno, dashboard, calendario chiusure) | `cassa` | → **`docs/modulo_vendite.md`** |
| **Selezioni del Giorno** (macellaio, salumi, formaggi, pescato, piatti del giorno) | `ricette` (sub-modulo) | → **`docs/modulo_selezioni_giorno.md`** |

## Cosa è cambiato

- Il **contenuto storico** di questo file (operativo Vendite/Cassa) è stato spostato in `docs/modulo_vendite.md` senza perdite.
- Le **Selezioni del Giorno** (5 router gemelli `scelta_*_router.py`) hanno ora un doc dedicato in `docs/modulo_selezioni_giorno.md` (prima erano `🆕 non documentate`, gap CRIT-2 dell'audit).

## Riferimenti

- Audit canonico: `docs/audit-2026-05-19/02_GAP_REPORT.md` (NOMEN-1)
- Decisione Marco PO: 2026-05-19, sessione "audit + riallineamento"
