#!/usr/bin/env python3
# Modulo: cucina
"""
Correzione di un errore di inserimento nei frigoriferi cucina (2026-11-08).
[locale:tregobbi] — script una-tantum, tabella confermata da Marco in chat.

La roba era stata segnata sui posti sbagliati. Ogni riga di MAPPA dice: quello
che e' segnato su (posto, ripiano) sta in realta' su (posto, ripiano).

COSA SI SPOSTA: giacenze/dotazione, lotti, «ripiano di casa» degli articoli,
movimenti (anche come destinazione di trasferimento).
COSA RESTA FERMO: il frigo come macchina (nome, soglie HACCP, scheda,
manutenzioni, checklist temperatura), la struttura dei ripiani, lo storico
delle conte d'inventario.

USO (sul VPS, dentro /home/marco/trgb/trgb):
    ../venv-trgb/bin/python scripts/inverti_contenuto_frigo.py            # DRY-RUN, sola lettura
    ../venv-trgb/bin/python scripts/inverti_contenuto_frigo.py --applica  # backup + correzione

--applica fa prima una copia di foodcost.db accanto all'originale
(foodcost.db.pre_fix_frigo_AAAAMMGG_HHMMSS), lavora in una transazione unica
(o passa tutto o niente) e lascia un segno in cucina_scorte_config: un secondo
--applica si rifiuta, perche' sposterebbe la roba una seconda volta.
Per tornare indietro: si rimette il backup.
"""

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.utils.locale_data import locale_data_path  # noqa: E402

DB = Path(sys.argv[sys.argv.index("--db") + 1]) if "--db" in sys.argv else Path(locale_data_path("foodcost.db"))
SEGNO = "fix_frigo_2026_11_08"

BF1, BF2, F2, F3 = "Banco frigo 1", "Banco frigo 2", "Frigorifero 2", "Frigorifero 3"

# (posto segnato, ripiano)  →  (posto vero, ripiano)
MAPPA = [
    ((BF1, "S1-1"), (F2, "1")),
    ((BF1, "S1-2"), (F2, "2")),
    ((BF1, "S2-1"), (F2, "3")),
    ((BF1, "S2-2"), (F2, "4")),
    ((F2, "1"), (BF2, "C1")),
    ((F2, "2"), (BF2, "S1-1")),
    ((F2, "3"), (BF2, "S1-2")),
    ((F2, "4"), (BF2, "S2-1")),
    ((F3, "1"), (BF1, "S1-1")),
    ((F3, "2"), (BF1, "S2-1")),
    ((F3, "3"), (BF1, "S3-1")),
    ((BF2, "S1-1"), (F3, "1")),
    ((BF2, "S1-2"), (F3, "2")),
    ((BF2, "S1-3"), (F3, "3")),
    ((BF2, "S2-1"), (F3, "4")),
    ((BF2, "C1"), (F3, "4")),
    ((BF2, "C2"), (F3, "4")),
]

# (tabella, colonna ripiano, colonna ubicazione denormalizzata o None)
TABELLE = [
    ("cucina_giacenze", "ripiano_id", "ubicazione_id"),
    ("cucina_lotti", "ripiano_id", None),
    ("cucina_articoli", "ripiano_casa_id", None),
    ("cucina_movimenti", "ripiano_id", "ubicazione_id"),
    ("cucina_movimenti", "ripiano_dest_id", None),
]


def ripiano(cur, posto, codice):
    r = cur.execute(
        """SELECT r.id, r.ubicazione_id FROM cucina_ripiani r
             JOIN cucina_ubicazioni u ON u.id = r.ubicazione_id
            WHERE lower(trim(u.nome)) = lower(?) AND u.attivo = 1 AND r.codice = ?""",
        (posto, codice)).fetchall()
    if len(r) != 1:
        sys.exit(f"STOP: {posto} · {codice} trovato {len(r)} volte")
    return r[0]


def colonne(cur, tab):
    return {r[1] for r in cur.execute(f"PRAGMA table_info({tab})")}


def main():
    applica = "--applica" in sys.argv
    print(f"DB: {DB}\nModalita': {'APPLICA' if applica else 'DRY-RUN (non scrive niente)'}\n")
    if not DB.exists():
        sys.exit("STOP: DB non trovato")
    conn = sqlite3.connect(DB, timeout=30)
    conn.execute("PRAGMA busy_timeout=30000")
    cur = conn.cursor()

    if cur.execute("SELECT 1 FROM cucina_scorte_config WHERE chiave = ?", (SEGNO,)).fetchone():
        sys.exit("STOP: correzione gia' applicata (segno in cucina_scorte_config). Non la rifaccio.")

    mappa_rip, ubic_di = {}, {}
    for n, ((ps, cs), (pd, cd)) in enumerate(MAPPA, 1):
        rs, us = ripiano(cur, ps, cs)
        rd, ud = ripiano(cur, pd, cd)
        mappa_rip[rs], ubic_di[rd] = rd, ud
        roba = cur.execute(
            """SELECT a.nome FROM cucina_giacenze g JOIN cucina_articoli a ON a.id = g.articolo_id
                WHERE g.ripiano_id = ? ORDER BY g.ordine, a.nome""", (rs,)).fetchall()
        print(f"{n:>2}. {ps} · {cs:5} → {pd} · {cd:5}  ({len(roba)}) {', '.join(r[0] for r in roba)}")

    # Lo stesso articolo che dopo lo spostamento finirebbe due volte sullo stesso ripiano
    doppi = cur.execute(
        f"""SELECT a.nome, COUNT(*) FROM cucina_giacenze g JOIN cucina_articoli a ON a.id = g.articolo_id
             WHERE g.ripiano_id IN ({','.join(map(str, mappa_rip))})
                OR g.ripiano_id IN ({','.join(map(str, ubic_di))})
             GROUP BY g.articolo_id,
                   CASE g.ripiano_id {' '.join(f'WHEN {a} THEN {b}' for a, b in mappa_rip.items())}
                   ELSE g.ripiano_id END
            HAVING COUNT(*) > 1""").fetchall()
    # (un ripiano destinazione che non e' anche sorgente tiene la sua roba: va contato)
    if doppi:
        print("\nSTOP — questi articoli finirebbero due volte sullo stesso ripiano:")
        for nome, k in doppi:
            print(f"  - {nome} ({k} righe)")
        sys.exit(1)

    print()
    ids = ",".join(map(str, mappa_rip))
    for tab, col_r, _ in TABELLE:
        if col_r in colonne(cur, tab):
            k = cur.execute(f"SELECT COUNT(*) FROM {tab} WHERE {col_r} IN ({ids})").fetchone()[0]
            print(f"  {tab}.{col_r}: {k} righe da spostare")

    if not applica:
        print("\nDRY-RUN finito. Nulla e' stato scritto. Per applicare: --applica")
        return

    backup = DB.with_name(f"{DB.name}.pre_fix_frigo_{datetime.now():%Y%m%d_%H%M%S}")
    dst = sqlite3.connect(backup)
    conn.backup(dst)
    dst.close()
    print(f"\nBackup: {backup}")

    case_r = " ".join(f"WHEN {a} THEN {-b}" for a, b in mappa_rip.items())
    case_u = " ".join(f"WHEN {b} THEN {u}" for b, u in ubic_di.items())
    try:
        cur.execute("BEGIN IMMEDIATE")
        for tab, col_r, col_u in TABELLE:
            cols = colonne(cur, tab)
            if col_r not in cols:
                continue
            # Fase 1: destinazione col segno meno (cosi' gli UNIQUE non collidono a meta' giro)
            cur.execute(f"UPDATE {tab} SET {col_r} = CASE {col_r} {case_r} END WHERE {col_r} IN ({ids})")
            if col_u and col_u in cols:
                cur.execute(f"UPDATE {tab} SET {col_u} = CASE -{col_r} {case_u} END WHERE {col_r} < 0")
            cur.execute(f"UPDATE {tab} SET {col_r} = -{col_r} WHERE {col_r} < 0")
        bad = cur.execute(
            """SELECT COUNT(*) FROM cucina_giacenze g JOIN cucina_ripiani r ON r.id = g.ripiano_id
                WHERE g.ubicazione_id <> r.ubicazione_id""").fetchone()[0]
        if bad:
            raise RuntimeError(f"{bad} giacenze con posto disallineato dal ripiano")
        cur.execute("INSERT INTO cucina_scorte_config (chiave, valore) VALUES (?, ?)",
                    (SEGNO, datetime.now().isoformat(timespec="seconds")))
        conn.commit()
    except Exception as e:
        conn.rollback()
        sys.exit(f"ERRORE, annullato tutto (nessuna modifica): {e}")
    print("Fatto: roba spostata sui posti giusti.")


if __name__ == "__main__":
    main()
