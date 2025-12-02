#!/usr/bin/env python
# @version: v1.0-import-magazzino
# -*- coding: utf-8 -*-
"""
Script one-shot per popolare 'vini_magazzino.sqlite3'
a partire dalla tabella 'vini' in 'vini.sqlite3'.

Mappa i campi principali:
- id_excel = id (vecchio DB)
- anagrafica, prezzi, flag, locazioni e quantità
"""

from pathlib import Path
import sys

# Assicura che 'app' sia importabile
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.models import vini_db
from app.models import vini_magazzino_db as mag


def main() -> None:
    # Crea tabelle se non ci sono
    mag.init_magazzino_database()

    # Sicurezza: se il DB magazzino NON è vuoto, non facciamo danni
    conn_mag = mag.get_magazzino_connection()
    cur_mag = conn_mag.cursor()
    existing_row = cur_mag.execute(
        "SELECT COUNT(*) AS c FROM vini_magazzino;"
    ).fetchone()
    existing = existing_row["c"] if existing_row is not None else 0

    if existing > 0:
        print(f"⚠️  vini_magazzino contiene già {existing} righe. "
              "Interrompo per sicurezza (cancella il DB o svuotalo prima).")
        conn_mag.close()
        return

    conn_mag.close()

    # Legge tutti i vini dal vecchio DB
    conn_old = vini_db.get_connection()
    cur_old = conn_old.cursor()
    rows = cur_old.execute("SELECT * FROM vini;").fetchall()

    total = len(rows)
    print(f"📦 Trovati {total} vini da importare dal DB carta...")

    imported = 0
    for r in rows:
        data = {
            # Collega id originale
            "id_excel": r["id"],

            # Anagrafica base
            "TIPOLOGIA": r["TIPOLOGIA"],
            "NAZIONE": r["NAZIONE"],
            "CODICE": r["CODICE"],
            "REGIONE": r["REGIONE"],
            "ANNATA": r["ANNATA"],
            "DESCRIZIONE": r["DESCRIZIONE"],
            "DENOMINAZIONE": r["DENOMINAZIONE"],

            # Vitigni / grado alcolico per ora vuoti (li compilerai a mano)
            # "VITIGNI": None,
            # "GRADO_ALCOLICO": None,

            # Produttore / distributore
            "PRODUTTORE": r["PRODUTTORE"],
            "DISTRIBUTORE": r["DISTRIBUTORE"],

            # Prezzi
            "PREZZO_CARTA": r["PREZZO"],
            "EURO_LISTINO": r["EURO_LISTINO"],
            "SCONTO": r["SCONTO"],

            # Flag carta / iPratico
            "CARTA": r["CARTA"],
            "IPRATICO": r["IPRATICO"],

            # Stato vendita / note per ora vuote
            # "STATO_VENDITA": None,
            # "NOTE_STATO": None,

            # Magazzino: locazioni + quantità
            "FRIGORIFERO": r["FRIGORIFERO"],
            "QTA_FRIGO": r["N_FRIGO"],

            "LOCAZIONE_1": r["LOCAZIONE_1"],
            "QTA_LOC1": r["N_LOC1"],

            "LOCAZIONE_2": r["LOCAZIONE_2"],
            "QTA_LOC2": r["N_LOC2"],

            # LOCAZIONE_3 per ora vuota
            # "LOCAZIONE_3": None,
            # "QTA_LOC3": 0,
        }

        # Pulisce stringhe vuote → None
        clean: dict[str, object] = {}
        for k, v in data.items():
            if isinstance(v, str):
                v = v.strip()
                if v == "":
                    v = None
            clean[k] = v

        # Usa la funzione standard di creazione (gestisce CREATED/UPDATED e QTA_TOTALE)
        mag.create_vino(clean)
        imported += 1

        if imported % 50 == 0:
            print(f"  - Importati {imported}/{total} vini...")

    conn_old.close()
    print(f"✅ Import completato: {imported} vini inseriti in 'vini_magazzino'.")


if __name__ == "__main__":
    main()