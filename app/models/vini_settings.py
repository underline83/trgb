# @version: v2.3-stable
# -*- coding: utf-8 -*-
"""
Impostazioni Carta Vini — default iniziali
Usa il DB: app/data/vini_settings.sqlite3

@changelog:
    - v2.3-stable (2025-11-13)
        • ADD: nuovo campo `mostra_senza_prezzo` nella tabella filtri_carta
        • ADD: default mostra_senza_prezzo=0 in ensure_settings_defaults()
        • UPDATE: compatibilità completa con settings_db v2.3-stable
    - v2.2-stable
        • Versione precedente, senza filtro prezzo
"""

from __future__ import annotations
from app.models.settings_db import get_settings_conn, init_settings_db


def ensure_settings_defaults() -> None:
    """
    Assicura che:
    - tipologia_order sia popolata con le tipologie standard
    - nazioni_order contenga ITALIA / FRANCIA / GERMANIA / AUSTRIA
    - regioni_order contenga l'elenco regioni vinicole
    - filtri_carta abbia una riga di default:
        min_qta_stampa=1
        mostra_negativi=0
        mostra_senza_prezzo=0   (v2.3)
    """
    init_settings_db()
    conn = get_settings_conn()
    cur = conn.cursor()

    # ---------------------------
    # Tipologie
    # ---------------------------
    default_tips = [
        ("GRANDI FORMATI", 1),
        ("BOLLICINE FRANCIA", 2),
        ("BOLLICINE STRANIERE", 3),
        ("BOLLICINE ITALIA", 4),
        ("BIANCHI ITALIA", 5),
        ("BIANCHI FRANCIA", 6),
        ("BIANCHI STRANIERI", 7),
        ("ROSATI", 8),
        ("ROSSI ITALIA", 9),
        ("ROSSI FRANCIA", 10),
        ("ROSSI STRANIERI", 11),
        ("PASSITI E VINI DA MEDITAZIONE", 12),
        ("VINI ANALCOLICI", 13),
        ("ERRORE", 14),
    ]

    row = cur.execute("SELECT COUNT(*) AS n FROM tipologia_order;").fetchone()
    if row["n"] == 0:
        cur.executemany(
            "INSERT INTO tipologia_order (nome, ordine) VALUES (?, ?);",
            default_tips,
        )

    # ---------------------------
    # Nazioni
    # ---------------------------
    default_nations = [
        ("ITALIA", 1),
        ("FRANCIA", 2),
        ("GERMANIA", 3),
        ("AUSTRIA", 4),
    ]
    row = cur.execute("SELECT COUNT(*) AS n FROM nazioni_order;").fetchone()
    if row["n"] == 0:
        cur.executemany(
            "INSERT INTO nazioni_order (nazione, ordine) VALUES (?, ?);",
            default_nations,
        )

    # ---------------------------
    # Regioni
    # ---------------------------
    default_regions = [
        # ITALIA
        ("IT01", "ITALIA", "LOMBARDIA", 1),
        ("IT02", "ITALIA", "PIEMONTE", 2),
        ("IT03", "ITALIA", "LIGURIA", 3),
        ("IT04", "ITALIA", "VALLE D'AOSTRA", 4),
        ("IT05", "ITALIA", "VENETO", 5),
        ("IT06", "ITALIA", "FRIULI-VENEZIA GIULIA", 6),
        ("IT07", "ITALIA", "TRENTINO - ALTO ADIGE", 7),
        ("IT08", "ITALIA", "EMILIA-ROMAGNA", 8),
        ("IT09", "ITALIA", "TOSCANA", 9),
        ("IT10", "ITALIA", "UMBRIA", 10),
        ("IT11", "ITALIA", "MARCHE", 11),
        ("IT12", "ITALIA", "LAZIO", 12),
        ("IT13", "ITALIA", "ABRUZZO", 13),
        ("IT14", "ITALIA", "MOLISE", 14),
        ("IT15", "ITALIA", "CAMPANIA", 15),
        ("IT16", "ITALIA", "PUGLIA", 16),
        ("IT17", "ITALIA", "BASILICATA", 17),
        ("IT18", "ITALIA", "CALABRIA", 18),
        ("IT19", "ITALIA", "SICILIA", 19),
        ("IT20", "ITALIA", "SARDEGNA", 20),
        # FRANCIA
        ("FR01", "FRANCIA", "Alsazia", 21),
        ("FR02", "FRANCIA", "Beaujolais", 22),
        ("FR03", "FRANCIA", "Bordeaux", 23),
        ("FR04", "FRANCIA", "Borgogna", 24),
        ("FR05", "FRANCIA", "Champagne", 25),
        ("FR06", "FRANCIA", "Corsica", 26),
        ("FR07", "FRANCIA", "Jura", 27),
        ("FR08", "FRANCIA", "Linguadoca - Rossiglione", 28),
        ("FR09", "FRANCIA", "Lorraine", 29),
        ("FR10", "FRANCIA", "Provenza", 30),
        ("FR11", "FRANCIA", "Rhone", 31),
        ("FR12", "FRANCIA", "Savoia - Bugey", 32),
        ("FR13", "FRANCIA", "Sud-Ovest", 33),
        ("FR14", "FRANCIA", "Vallée de la Loire", 34),
        # GERMANIA
        ("DE01", "GERMANIA", "Ahr", 35),
        ("DE02", "GERMANIA", "Baden", 36),
        ("DE03", "GERMANIA", "Franken", 37),
        ("DE04", "GERMANIA", "Hessische - Bergstrasse", 38),
        ("DE05", "GERMANIA", "Mittelrhein", 39),
        ("DE06", "GERMANIA", "Mosel - Saar - Ruwer", 40),
        ("DE07", "GERMANIA", "Nahe", 41),
        ("DE08", "GERMANIA", "Pfalz", 42),
        ("DE09", "GERMANIA", "Rheingau", 43),
        ("DE10", "GERMANIA", "Rheinhessen", 44),
        ("DE11", "GERMANIA", "Saale - Unstrut", 45),
        ("DE12", "GERMANIA", "Sachsen", 46),
        ("DE13", "GERMANIA", "Wurttemberg", 47),
        # AUSTRIA
        ("AU01", "AUSTRIA", "Niederösterreich", 48),
        ("AU02", "AUSTRIA", "Burgenland", 49),
        ("AU03", "AUSTRIA", "Steiermark", 50),
        ("AU04", "AUSTRIA", "Wien", 51),
        ("AU05", "AUSTRIA", "Kärnten", 52),
        ("AU06", "AUSTRIA", "Oberösterreich", 53),
        ("AU07", "AUSTRIA", "Salzburg", 54),
        ("AU08", "AUSTRIA", "Tirol", 55),
        ("AU09", "AUSTRIA", "Vorarlberg", 56),
    ]

    row = cur.execute("SELECT COUNT(*) AS n FROM regioni_order;").fetchone()
    if row["n"] == 0:
        cur.executemany(
            "INSERT INTO regioni_order (codice, nazione, nome, ordine) VALUES (?, ?, ?, ?);",
            default_regions,
        )

    # ---------------------------
    # Filtri carta (v2.3 aggiornato)
    # ---------------------------
    row = cur.execute("SELECT COUNT(*) AS n FROM filtri_carta;").fetchone()
    if row["n"] == 0:
        cur.execute(
            """
            INSERT INTO filtri_carta
            (id, min_qta_stampa, mostra_negativi, mostra_senza_prezzo)
            VALUES (1, 1, 0, 0);
            """
        )

    conn.commit()
    conn.close()