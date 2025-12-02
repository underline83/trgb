# @version: v1.0-import-magazzino
# -*- coding: utf-8 -*-
"""
Script una-tantum per importare i vini esistenti da:
    app/data/vini.sqlite3 (tabella 'vini')
nel nuovo DB:
    app/data/vini_magazzino.sqlite3 (tabella 'vini_magazzino')
"""

from pathlib import Path
import sqlite3

from app.models import vini_magazzino_db

SRC_DB = Path("app/data/vini.sqlite3")


def safe_int(row, key, default=0):
    val = row[key]
    return int(val) if val is not None else default


def run_import():
    # Assicuriamoci che il DB magazzino sia inizializzato
    vini_magazzino_db.init_magazzino_database()

    if not SRC_DB.exists():
        raise SystemExit(f"DB sorgente non trovato: {SRC_DB}")

    conn_src = sqlite3.connect(SRC_DB)
    conn_src.row_factory = sqlite3.Row
    cur = conn_src.cursor()

    rows = cur.execute("SELECT * FROM vini;").fetchall()
    print(f"Trovati {len(rows)} vini nella tabella 'vini'.")

    imported = 0

    for r in rows:
        # Alcune righe potrebbero essere "vuote" o di servizio
        descrizione = r["DESCRIZIONE"]
        if not descrizione:
            continue

        data = {
            "id_excel":      r["id"],

            "TIPOLOGIA":     r["TIPOLOGIA"] or "ERRORE",
            "NAZIONE":       r["NAZIONE"] or "ITALIA",
            "CODICE":        r["CODICE"],
            "REGIONE":       r["REGIONE"],

            "DESCRIZIONE":   descrizione,
            "DENOMINAZIONE": r["DENOMINAZIONE"],
            "ANNATA":        r["ANNATA"],
            "VITIGNI":       None,   # non presente nel DB carta
            "GRADO_ALCOLICO": None,  # per ora lo tieni nella descrizione
            "FORMATO":       r["FORMATO"] or "BT",

            "PRODUTTORE":    r["PRODUTTORE"],
            "DISTRIBUTORE":  r["DISTRIBUTORE"],

            "PREZZO_CARTA":  r["PREZZO"],
            "EURO_LISTINO":  r["EURO_LISTINO"],
            "SCONTO":        r["SCONTO"],
            "NOTE_PREZZO":   None,

            "CARTA":         r["CARTA"],
            "IPRATICO":      r["IPRATICO"],

            "STATO_VENDITA": None,   # la colonna V non è nel DB, solo Excel
            "NOTE_STATO":    None,

            "FRIGORIFERO":   r["FRIGORIFERO"],
            "QTA_FRIGO":     safe_int(r, "N_FRIGO", 0),

            "LOCAZIONE_1":   r["LOCAZIONE_1"],
            "QTA_LOC1":      safe_int(r, "N_LOC1", 0),

            "LOCAZIONE_2":   r["LOCAZIONE_2"],
            "QTA_LOC2":      safe_int(r, "N_LOC2", 0),

            "LOCAZIONE_3":   None,
            "QTA_LOC3":      0,

            # NOTE: lascio NOTE vuote in import
            "NOTE":          None,
        }

        vini_magazzino_db.create_vino(data)
        imported += 1

    conn_src.close()
    print(f"Import terminato. Vini importati: {imported}")


if __name__ == "__main__":
    run_import()