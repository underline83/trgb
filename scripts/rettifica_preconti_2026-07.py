#!/usr/bin/env python3
"""
Rettifica preconti — luglio 2026 (sessione con Claude del 2026-07-19).

Elimina/riduce 116 preconti (tabella shift_preconti) mantenendo la quadratura:
per ogni chiusura coinvolta, contanti e totale_incassi vengono abbassati dello
stesso delta tolto ai preconti. La differenza di quadratura resta invariata.

USO (sul VPS, dentro /home/marco/trgb/trgb):
    python3 scripts/rettifica_preconti_2026-07.py            # DRY-RUN: mostra cosa farebbe
    python3 scripts/rettifica_preconti_2026-07.py --apply    # esegue (con backup automatico)

Il backup pre-rettifica viene salvato accanto al DB come
admin_finance.sqlite3.prev-rettifica-preconti (via sqlite3 backup API, WAL-safe).

Sicurezza:
- verifica che ogni preconto esista e abbia ancora l'importo atteso (abort su mismatch)
- verifica che nessuna chiusura vada in contanti negativi (abort)
- tutto in una singola transazione breve
"""
import sqlite3
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# (id_preconto, data, turno, importo_atteso, nuovo_importo)  — nuovo 0 = elimina riga
ACTIONS = [
    (24, "2026-03-02", "pranzo", 100.0, 0.0),
    (25, "2026-03-02", "cena", 155.0, 0.0),
    (26, "2026-03-03", "pranzo", 15.0, 0.0),
    (27, "2026-03-03", "cena", 4.0, 0.0),
    (21, "2026-03-05", "pranzo", 85.0, 50.0),
    (23, "2026-03-05", "cena", 70.0, 50.0),
    (32, "2026-03-07", "pranzo", 110.0, 60.0),
    (34, "2026-03-07", "cena", 320.0, 150.0),
    (35, "2026-03-07", "cena", 120.0, 60.0),
    (28, "2026-03-08", "pranzo", 260.0, 130.0),
    (29, "2026-03-08", "cena", 119.0, 50.0),
    (30, "2026-03-08", "cena", 67.0, 37.0),
    (31, "2026-03-08", "cena", 14.0, 0.0),
    (79, "2026-03-10", "cena", 160.0, 100.0),
    (80, "2026-03-10", "cena", 91.0, 0.0),
    (12, "2026-03-12", "pranzo", 60.0, 0.0),
    (16, "2026-03-12", "cena", 255.0, 150.0),
    (55, "2026-03-13", "cena", 320.0, 150.0),
    (8, "2026-03-14", "pranzo", 65.0, 0.0),
    (9, "2026-03-14", "cena", 160.0, 100.0),
    (10, "2026-03-14", "cena", 270.0, 170.0),
    (5, "2026-03-15", "pranzo", 150.0, 100.0),
    (39, "2026-03-17", "pranzo", 30.0, 0.0),
    (53, "2026-03-17", "cena", 140.0, 100.0),
    (38, "2026-03-19", "cena", 310.0, 210.0),
    (41, "2026-03-20", "cena", 640.0, 340.0),
    (42, "2026-03-21", "pranzo", 350.0, 150.0),
    (43, "2026-03-21", "cena", 330.0, 130.0),
    (50, "2026-03-22", "cena", 80.0, 0.0),
    (61, "2026-03-23", "cena", 290.0, 190.0),
    (62, "2026-03-24", "pranzo", 58.0, 0.0),
    (69, "2026-03-28", "cena", 640.0, 340.0),
    (76, "2026-03-30", "cena", 245.0, 0.0),
    (78, "2026-03-31", "cena", 160.0, 0.0),
    (84, "2026-04-04", "cena", 410.0, 210.0),
    (87, "2026-04-05", "pranzo", 230.0, 130.0),
    (88, "2026-04-06", "pranzo", 180.0, 80.0),
    (89, "2026-04-06", "cena", 100.0, 20.0),
    (96, "2026-04-11", "cena", 320.0, 150.0),
    (100, "2026-04-13", "cena", 500.0, 200.0),
    (101, "2026-04-14", "cena", 160.0, 0.0),
    (102, "2026-04-16", "cena", 70.0, 0.0),
    (103, "2026-04-18", "pranzo", 460.0, 230.0),
    (104, "2026-04-18", "cena", 300.0, 150.0),
    (111, "2026-04-21", "pranzo", 170.0, 80.0),
    (112, "2026-04-24", "cena", 130.0, 10.0),  # capped da 0 (contanti insufficienti)
    (113, "2026-04-25", "pranzo", 220.0, 110.0),
    (116, "2026-04-26", "cena", 115.0, 70.0),
    (121, "2026-04-27", "cena", 190.0, 90.0),
    (124, "2026-04-30", "cena", 280.0, 130.0),
    (127, "2026-05-01", "cena", 365.0, 150.0),
    (128, "2026-05-02", "pranzo", 305.0, 170.0),
    (129, "2026-05-04", "cena", 175.0, 110.0),
    (131, "2026-05-08", "cena", 220.0, 150.0),
    (132, "2026-05-09", "cena", 590.0, 180.0),
    (134, "2026-05-10", "pranzo", 180.0, 90.0),
    (135, "2026-05-11", "cena", 420.0, 220.0),
    (140, "2026-05-14", "pranzo", 170.0, 80.0),
    (141, "2026-05-14", "cena", 220.0, 0.0),
    (145, "2026-05-15", "cena", 260.0, 130.0),
    (148, "2026-05-16", "pranzo", 130.0, 50.0),
    (153, "2026-05-16", "cena", 230.0, 120.0),
    (154, "2026-05-16", "cena", 110.0, 55.0),
    (170, "2026-05-17", "pranzo", 200.0, 100.0),
    (171, "2026-05-17", "pranzo", 200.0, 100.0),
    (176, "2026-05-17", "cena", 174.0, 60.0),
    (177, "2026-05-17", "cena", 169.0, 80.0),
    (178, "2026-05-18", "pranzo", 130.0, 70.0),
    (183, "2026-05-19", "cena", 100.0, 50.0),
    (190, "2026-05-23", "pranzo", 100.0, 0.0),
    (191, "2026-05-23", "cena", 500.0, 300.0),
    (196, "2026-05-25", "cena", 230.0, 130.0),
    (197, "2026-05-25", "cena", 130.0, 100.0),
    (198, "2026-05-26", "cena", 140.0, 70.0),
    (199, "2026-05-28", "pranzo", 15.0, 0.0),
    (200, "2026-05-29", "pranzo", 120.0, 60.0),
    (203, "2026-05-30", "cena", 140.0, 70.0),
    (204, "2026-05-30", "cena", 100.0, 0.0),
    (212, "2026-05-31", "cena", 164.0, 80.0),
    (214, "2026-06-01", "cena", 80.0, 0.0),
    (215, "2026-06-01", "cena", 100.0, 0.0),
    (217, "2026-06-01", "cena", 100.0, 0.0),
    (218, "2026-06-02", "pranzo", 280.0, 120.0),
    (220, "2026-06-05", "pranzo", 60.0, 0.0),
    (222, "2026-06-06", "pranzo", 100.0, 0.0),
    (223, "2026-06-06", "pranzo", 30.0, 0.0),
    (224, "2026-06-06", "cena", 100.0, 0.0),
    (227, "2026-06-09", "cena", 70.0, 0.0),
    (228, "2026-06-11", "cena", 120.0, 30.0),  # capped da 0 (contanti insufficienti)
    (229, "2026-06-12", "cena", 120.0, 0.0),
    (233, "2026-06-15", "cena", 260.0, 130.0),
    (234, "2026-06-16", "cena", 310.0, 150.0),
    (248, "2026-06-21", "cena", 300.0, 150.0),
    (257, "2026-06-26", "cena", 320.0, 150.0),
    (261, "2026-06-28", "cena", 100.0, 0.0),
    (262, "2026-06-28", "cena", 35.0, 0.0),
    (263, "2026-06-28", "cena", 89.0, 0.0),
    (264, "2026-06-29", "cena", 150.0, 0.0),
    (265, "2026-06-29", "cena", 75.0, 0.0),
    (268, "2026-06-30", "cena", 90.0, 0.0),
    (269, "2026-07-02", "pranzo", 25.0, 0.0),
    (270, "2026-07-02", "pranzo", 110.0, 0.0),
    (271, "2026-07-03", "pranzo", 20.0, 0.0),
    (272, "2026-07-04", "pranzo", 25.0, 0.0),
    (273, "2026-07-04", "cena", 300.0, 150.0),
    (275, "2026-07-05", "pranzo", 240.0, 120.0),
    (283, "2026-07-07", "cena", 200.0, 100.0),
    (284, "2026-07-09", "cena", 240.0, 120.0),
    (303, "2026-07-11", "cena", 270.0, 130.0),  # id rimappato (era 289, chiusura rieditata dalla UI)
    (297, "2026-07-14", "cena", 160.0, 80.0),
    (299, "2026-07-16", "cena", 150.0, 75.0),
    (301, "2026-07-17", "cena", 110.0, 50.0),
    (302, "2026-07-17", "cena", 165.0, 80.0),
]

ROOT = Path(__file__).resolve().parent.parent
CANDIDATES = [
    ROOT / "locali" / "tregobbi" / "data" / "admin_finance.sqlite3",
    ROOT / "app" / "data" / "admin_finance.sqlite3",
]


def main():
    apply = "--apply" in sys.argv
    db_path = next((p for p in CANDIDATES if p.exists()), None)
    if not db_path:
        sys.exit(f"DB non trovato. Cercato in: {[str(p) for p in CANDIDATES]}")
    print(f"DB: {db_path}")
    print(f"Modalita': {'APPLY' if apply else 'DRY-RUN (nessuna modifica)'}\n")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # ── 1. Validazione ──────────────────────────────────────────────
    errors = []
    by_closure = defaultdict(list)
    for pid, date, turno, old, new in ACTIONS:
        r = conn.execute(
            "SELECT sp.importo, sp.shift_closure_id cid, sp.tavolo, sc.date, sc.turno, "
            "sc.contanti, sc.totale_incassi "
            "FROM shift_preconti sp JOIN shift_closures sc ON sc.id = sp.shift_closure_id "
            "WHERE sp.id = ?", (pid,)).fetchone()
        if r is None:
            errors.append(f"preconto id={pid} ({date} {turno}) NON TROVATO")
            continue
        if abs(r["importo"] - old) > 0.01:
            errors.append(f"preconto id={pid} ({date} {turno}): importo DB {r['importo']} != atteso {old}")
            continue
        if (r["date"], r["turno"]) != (date, turno):
            errors.append(f"preconto id={pid}: chiusura DB {r['date']}/{r['turno']} != attesa {date}/{turno}")
            continue
        by_closure[r["cid"]].append((pid, r["tavolo"], old, new))

    if errors:
        print("ERRORI DI VALIDAZIONE — nessuna modifica applicata:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    # ── 2. Controllo contanti mai negativi ─────────────────────────
    plan = []
    for cid, acts in sorted(by_closure.items()):
        c = conn.execute("SELECT date, turno, contanti, totale_incassi FROM shift_closures WHERE id = ?", (cid,)).fetchone()
        delta = round(sum(old - new for _, _, old, new in acts), 2)
        after = round(c["contanti"] - delta, 2)
        plan.append((cid, c["date"], c["turno"], delta, c["contanti"], after, c["totale_incassi"], acts))
        if after < -0.001:
            print(f"ABORT: chiusura {c['date']} {c['turno']} andrebbe a contanti {after} (attuali {c['contanti']}, delta {delta})")
            sys.exit(1)

    # ── 3. Report piano ────────────────────────────────────────────
    tot = 0.0
    for cid, date, turno, delta, before, after, ti, acts in plan:
        tot += delta
        det = "; ".join(
            f"#{pid} {tav}: {'ELIMINA ' + format(old, '.0f') if new == 0 else format(old, '.0f') + ' -> ' + format(new, '.0f')}"
            for pid, tav, old, new in acts)
        print(f"{date} {turno:6} | delta -{delta:8.2f} | contanti {before:8.2f} -> {after:8.2f} | {det}")
    print(f"\nTotale riduzione: EUR {tot:.2f} su {len(plan)} chiusure, {len(ACTIONS)} preconti")

    if not apply:
        print("\nDry-run terminato. Rilancia con --apply per eseguire.")
        return

    # ── 4. Backup WAL-safe ─────────────────────────────────────────
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(db_path.name + f".prev-rettifica-preconti-{stamp}")
    dest = sqlite3.connect(backup_path)
    conn.backup(dest)
    dest.close()
    print(f"\nBackup creato: {backup_path}")

    # ── 5. Applicazione in transazione ─────────────────────────────
    now = datetime.now().isoformat(timespec="seconds")
    cur = conn.cursor()
    try:
        cur.execute("BEGIN")
        for cid, date, turno, delta, before, after, ti, acts in plan:
            for pid, tav, old, new in acts:
                if new == 0:
                    cur.execute("DELETE FROM shift_preconti WHERE id = ?", (pid,))
                else:
                    cur.execute("UPDATE shift_preconti SET importo = ? WHERE id = ?", (new, pid))
            cur.execute(
                "UPDATE shift_closures SET contanti = ROUND(contanti - ?, 2), "
                "totale_incassi = ROUND(totale_incassi - ?, 2), updated_at = ? WHERE id = ?",
                (delta, delta, now, cid))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        sys.exit(f"ERRORE, rollback eseguito: {exc}")

    # ── 6. Verifica post ───────────────────────────────────────────
    bad = conn.execute("SELECT COUNT(*) FROM shift_closures WHERE contanti < 0 OR totale_incassi < 0").fetchone()[0]
    n_rem = conn.execute("SELECT COUNT(*), COALESCE(ROUND(SUM(importo),2),0) FROM shift_preconti").fetchone()
    print(f"\nFATTO. Preconti rimasti: {n_rem[0]} per EUR {n_rem[1]}. Chiusure con valori negativi: {bad}")
    print("Il backend NON va riavviato (solo dati). Verifica una chiusura a campione dalla UI.")
    conn.close()


if __name__ == "__main__":
    main()
