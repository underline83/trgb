# @version: v1.3-import-magazzino-modes-upsert
# -*- coding: utf-8 -*-
"""
Script per importare i vini esistenti da:
    app/data/vini.sqlite3 (tabella 'vini')
nel DB:
    app/data/vini_magazzino.sqlite3 (tabella 'vini_magazzino')

Modalità:
- update (default)   → UPSERT su id_excel, non cancella nulla
- full-reset         → svuota la tabella e reimporta tutto
"""

from pathlib import Path
import sqlite3
import argparse

from app.models import vini_magazzino_db

SRC_DB = Path("app/data/vini.sqlite3")


def safe_int(row, key, default=0):
    val = row[key]
    if val is None:
        return default
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def import_from_vini(mode: str = "update"):
    # Inizializza il DB magazzino (se serve)
    vini_magazzino_db.init_magazzino_database()

    if not SRC_DB.exists():
        raise SystemExit(f"DB sorgente non trovato: {SRC_DB}")

    conn_src = sqlite3.connect(SRC_DB)
    conn_src.row_factory = sqlite3.Row
    cur_src = conn_src.cursor()

    rows = cur_src.execute("SELECT * FROM vini;").fetchall()
    print(f"Trovati {len(rows)} vini nella tabella 'vini'.")

    if mode not in ("update", "full-reset"):
        raise SystemExit(f"Modalità non valida: {mode}")

    if mode == "full-reset":
        print("⚠️  FULL RESET: svuoto completamente 'vini_magazzino'...")
        conn_mag = vini_magazzino_db.get_magazzino_connection()
        conn_mag.execute("DELETE FROM vini_magazzino;")
        conn_mag.commit()
        conn_mag.close()
        print("Tabella svuotata.")

    imported = 0
    skipped = 0

    for r in rows:
        descrizione = r["DESCRIZIONE"]
        if not descrizione:
            skipped += 1
            continue

        data = {
            # 🔐 chiave stabile
            "id_excel":       r["id"],

            "TIPOLOGIA":      r["TIPOLOGIA"] or "ERRORE",
            "NAZIONE":        r["NAZIONE"] or "ITALIA",
            "CODICE":         r["CODICE"],
            "REGIONE":        r["REGIONE"],

            "DESCRIZIONE":    descrizione,
            "DENOMINAZIONE":  r["DENOMINAZIONE"],
            "ANNATA":         r["ANNATA"],
            "VITIGNI":        None,
            "GRADO_ALCOLICO": None,
            "FORMATO":        r["FORMATO"] or "BT",

            "PRODUTTORE":     r["PRODUTTORE"],
            "DISTRIBUTORE":   r["DISTRIBUTORE"],

            "PREZZO_CARTA":   r["PREZZO"],
            "EURO_LISTINO":   r["EURO_LISTINO"],
            "SCONTO":         r["SCONTO"],
            "NOTE_PREZZO":    None,

            "CARTA":          r["CARTA"],
            "IPRATICO":       r["IPRATICO"],
            "STATO_VENDITA":  None,
            "NOTE_STATO":     None,

            "FRIGORIFERO":    r["FRIGORIFERO"],
            "LOCAZIONE_1":    r["LOCAZIONE_1"],
            "LOCAZIONE_2":    r["LOCAZIONE_2"],
            "LOCAZIONE_3":    None,

            "NOTE":           None,
        }

        vini_magazzino_db.upsert_vino_from_carta(data)
        imported += 1

    conn_src.close()
    print(
        f"✅ Import terminato. Vini processati: {len(rows)}, "
        f"importati/aggiornati: {imported}, saltati: {skipped}."
    )


def main():
    parser = argparse.ArgumentParser(
        description="Importa i vini da app/data/vini.sqlite3 nel magazzino."
    )
    parser.add_argument(
        "--mode",
        choices=["update", "full-reset"],
        default="update",
        help="update (default) = upsert su id_excel, full-reset = svuota tabella prima di importare",
    )

    args = parser.parse_args()
    import_from_vini(mode=args.mode)


if __name__ == "__main__":
    main()