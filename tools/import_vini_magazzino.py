# @version: v1.2-import-magazzino-idempotente
# -*- coding: utf-8 -*-
"""
Script una-tantum per importare i vini esistenti da:
    app/data/vini.sqlite3 (tabella 'vini')
nel nuovo DB:
    app/data/vini_magazzino.sqlite3 (tabella 'vini_magazzino')

Questa versione è **idempotente**:
- ogni esecuzione SVUOTA la tabella 'vini_magazzino'
  prima di reimportare tutti i vini dalla carta.
"""

from pathlib import Path
import sqlite3

from app.models import vini_magazzino_db

SRC_DB = Path("app/data/vini.sqlite3")
DST_DB = Path("app/data/vini_magazzino.sqlite3")


def safe_int(row, key, default=0):
    val = row[key]
    if val is None:
        return default
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def run_import():
    # Inizializza struttura magazzino (crea DB / tabelle se mancano)
    vini_magazzino_db.init_magazzino_database()

    if not SRC_DB.exists():
        raise SystemExit(f"DB sorgente non trovato: {SRC_DB}")

    # --- SVUOTO LA TABELLA MAGAZZINO PRIMA DI IMPORTARE ---
    conn_dst = sqlite3.connect(DST_DB)
    cur_dst = conn_dst.cursor()
    cur_dst.execute("DELETE FROM vini_magazzino;")
    conn_dst.commit()
    conn_dst.close()
    print("Tabella 'vini_magazzino' svuotata.")

    # --- LEGGO DALLA CARTA ---
    conn_src = sqlite3.connect(SRC_DB)
    conn_src.row_factory = sqlite3.Row
    cur = conn_src.cursor()

    rows = cur.execute("SELECT * FROM vini;").fetchall()
    print(f"Trovati {len(rows)} vini nella tabella 'vini'.")

    imported = 0

    for r in rows:
        descrizione = r["DESCRIZIONE"]
        if not descrizione:
            continue

        data = {
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
            "QTA_FRIGO":      safe_int(r, "N_FRIGO", 0),

            "LOCAZIONE_1":    r["LOCAZIONE_1"],
            "QTA_LOC1":       safe_int(r, "N_LOC1", 0),

            "LOCAZIONE_2":    r["LOCAZIONE_2"],
            "QTA_LOC2":       safe_int(r, "N_LOC2", 0),

            "LOCAZIONE_3":    None,
            "QTA_LOC3":       0,

            "NOTE":           None,
        }

        vini_magazzino_db.create_vino(data)
        imported += 1

    conn_src.close()
    print(f"Import terminato. Vini importati: {imported}")


if __name__ == "__main__":
    run_import()