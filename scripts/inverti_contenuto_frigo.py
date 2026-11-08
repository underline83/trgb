#!/usr/bin/env python3
# Modulo: cucina
"""
Inverte il CONTENUTO di due frigoriferi — correzione di un errore di inserimento
(2026-11-08). [locale:tregobbi]

Coppie invertite (per nome, maiuscole/minuscole indifferenti):
    Banco frigo 1  <->  Frigorifero 2
    Frigorifero 3  <->  Banco frigo 2

COSA SI SPOSTA
Solo la roba: giacenze/dotazione, lotti, «ripiano di casa» degli articoli,
movimenti e righe delle conte. Il ripiano i-esimo di un posto (in ordine) va
sul ripiano i-esimo dell'altro, e viceversa.

COSA RESTA FERMO
Il frigo come macchina: nome, soglie HACCP, scheda, manutenzioni, il legame con
le checklist temperatura, la struttura dei ripiani (sportelli, cassettoni).

Se un ripiano con dentro qualcosa non ha un ripiano corrispondente dall'altra
parte (i due posti hanno un numero diverso di ripiani), lo script SI FERMA e lo
dice: niente si sposta finche' non si decide dove va.

USO (sul VPS, dentro /home/marco/trgb/trgb):
    ../venv-trgb/bin/python scripts/inverti_contenuto_frigo.py            # DRY-RUN, sola lettura
    ../venv-trgb/bin/python scripts/inverti_contenuto_frigo.py --applica  # backup + inversione

Il --applica fa prima una copia di foodcost.db accanto all'originale
(foodcost.db.pre_inverti_frigo_AAAAMMGG_HHMMSS) e lavora in una transazione
unica: o passa tutto o non passa niente. Rilanciarlo RI-inverte: e' il suo
stesso annullamento.
"""

import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.utils.locale_data import locale_data_path  # noqa: E402

DB = Path(sys.argv[sys.argv.index("--db") + 1]) if "--db" in sys.argv else Path(locale_data_path("foodcost.db"))

COPPIE = [("Banco frigo 1", "Frigorifero 2"), ("Frigorifero 3", "Banco frigo 2")]

# (tabella, colonna ripiano, colonna ubicazione denormalizzata o None)
TABELLE_RIPIANO = [
    ("cucina_giacenze", "ripiano_id", "ubicazione_id"),
    ("cucina_lotti", "ripiano_id", None),
    ("cucina_articoli", "ripiano_casa_id", None),
    ("cucina_movimenti", "ripiano_id", "ubicazione_id"),
    ("cucina_movimenti", "ripiano_dest_id", None),
    ("cucina_conte_ripiani", "ripiano_id", "ubicazione_id"),
    ("cucina_conte_righe", "ripiano_id", None),
]


def ubicazione(cur, nome):
    righe = cur.execute(
        "SELECT id, nome FROM cucina_ubicazioni WHERE lower(trim(nome)) = lower(?) AND attivo = 1",
        (nome,)).fetchall()
    if len(righe) != 1:
        sys.exit(f"STOP: «{nome}» trovato {len(righe)} volte tra i posti attivi")
    return righe[0]


def ripiani(cur, ubic_id):
    return cur.execute(
        "SELECT id, codice, COALESCE(nome,'') FROM cucina_ripiani WHERE ubicazione_id = ? ORDER BY ordine, id",
        (ubic_id,)).fetchall()


def contenuto(cur, rip_id):
    return cur.execute(
        """SELECT a.nome, g.qta, g.stato_semaforo, g.in_dotazione
             FROM cucina_giacenze g JOIN cucina_articoli a ON a.id = g.articolo_id
            WHERE g.ripiano_id = ? ORDER BY g.ordine, a.nome""", (rip_id,)).fetchall()


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

    mappa_rip, mappa_ubic, problemi = {}, {}, []
    for nome_a, nome_b in COPPIE:
        (ua, na), (ub, nb) = ubicazione(cur, nome_a), ubicazione(cur, nome_b)
        mappa_ubic[ua], mappa_ubic[ub] = ub, ua
        ra, rb = ripiani(cur, ua), ripiani(cur, ub)
        print(f"=== {na} (id {ua}, {len(ra)} ripiani)  <->  {nb} (id {ub}, {len(rb)} ripiani)")
        for i in range(max(len(ra), len(rb))):
            for lato, sorg, dest, nsorg, ndest in ((0, ra, rb, na, nb), (1, rb, ra, nb, na)):
                if i >= len(sorg):
                    continue
                rid, cod, _ = sorg[i]
                roba = contenuto(cur, rid)
                if i < len(dest):
                    mappa_rip[rid] = dest[i][0]
                    arrivo = f"{ndest} rip. {dest[i][1]}"
                else:
                    arrivo = "?? NESSUN RIPIANO CORRISPONDENTE"
                    if roba:
                        problemi.append(f"{nsorg} rip. {cod} ha {len(roba)} articoli e {ndest} non ha un {i+1}° ripiano")
                print(f"  {nsorg} rip. {cod:5} → {arrivo}   ({len(roba)} articoli)")
                for nome, qta, sem, dot in roba:
                    q = "—" if qta is None else f"{qta:g}"
                    print(f"        · {nome}  qta {q}{'  ' + sem if sem else ''}{'' if dot else '  (fuori dotazione)'}")
        print()

    if problemi:
        print("STOP — da decidere prima di applicare:")
        for p in problemi:
            print("  - " + p)
        sys.exit(1)

    # Conteggio righe toccate
    for tab, col_r, col_u in TABELLE_RIPIANO:
        if col_r not in colonne(cur, tab):
            continue
        ids = ",".join(str(i) for i in mappa_rip)
        n = cur.execute(f"SELECT COUNT(*) FROM {tab} WHERE {col_r} IN ({ids})").fetchone()[0]
        print(f"  {tab}.{col_r}: {n} righe da spostare")

    if not applica:
        print("\nDRY-RUN finito. Nulla e' stato scritto. Per applicare: --applica")
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = DB.with_name(f"{DB.name}.pre_inverti_frigo_{stamp}")
    dst = sqlite3.connect(backup)
    conn.backup(dst)
    dst.close()
    print(f"\nBackup: {backup}")

    case_r = " ".join(f"WHEN {a} THEN {-b}" for a, b in mappa_rip.items())
    case_u = " ".join(f"WHEN {a} THEN {b}" for a, b in mappa_ubic.items())
    ids = ",".join(str(i) for i in mappa_rip)
    try:
        cur.execute("BEGIN IMMEDIATE")
        for tab, col_r, col_u in TABELLE_RIPIANO:
            cols = colonne(cur, tab)
            if col_r not in cols:
                continue
            # La colonna ubicazione si allinea al ripiano: va aggiornata insieme a lui.
            set_u = f", {col_u} = CASE {col_u} {case_u} ELSE {col_u} END" if col_u and col_u in cols else ""
            # Fase 1: ripiano di destinazione col segno meno (evita collisioni sugli UNIQUE)
            cur.execute(f"UPDATE {tab} SET {col_r} = CASE {col_r} {case_r} END{set_u} WHERE {col_r} IN ({ids})")
            cur.execute(f"UPDATE {tab} SET {col_r} = -{col_r} WHERE {col_r} < 0")
        n_bad = cur.execute(
            """SELECT COUNT(*) FROM cucina_giacenze g JOIN cucina_ripiani r ON r.id = g.ripiano_id
                WHERE g.ubicazione_id <> r.ubicazione_id""").fetchone()[0]
        if n_bad:
            raise RuntimeError(f"{n_bad} giacenze con ubicazione disallineata dal ripiano")
        conn.commit()
    except Exception as e:
        conn.rollback()
        sys.exit(f"ERRORE, annullato tutto (nessuna modifica): {e}")
    print("Fatto: contenuti invertiti.")


if __name__ == "__main__":
    main()
