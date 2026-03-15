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


def _migrate_nazioni_regioni_titlecase(cur, default_nations, default_regions) -> None:
    """
    Migra nazioni e regioni da MAIUSCOLO a Title Case.
    Aggiorna anche i vini nel magazzino perché NAZIONE e REGIONE sono stringhe
    salvate direttamente (non FK).
    """
    # --- Nazioni ---
    # Costruisci mappa UPPER→Title per le nazioni
    naz_map = {}  # "ITALIA" → "Italia"
    for naz, _ord in default_nations:
        naz_map[naz.upper()] = naz

    existing_naz = cur.execute("SELECT nazione FROM nazioni_order;").fetchall()
    for row in existing_naz:
        old = row["nazione"]
        new = naz_map.get(old.upper())
        if new and new != old:
            cur.execute("UPDATE nazioni_order SET nazione = ? WHERE nazione = ?;", (new, old))

    # --- Regioni ---
    # Costruisci mappa UPPER→Title per nazione nelle regioni
    for naz, _ord in default_nations:
        naz_upper = naz.upper()
        if naz_upper != naz:
            cur.execute("UPDATE regioni_order SET nazione = ? WHERE UPPER(nazione) = ?;",
                        (naz, naz_upper))

    # Costruisci mappa UPPER(nome)→Title Case per i nomi regione
    reg_map = {}  # "LOMBARDIA" → "Lombardia"
    for _code, _naz, nome, _ord in default_regions:
        reg_map[nome.upper()] = nome

    existing_reg = cur.execute("SELECT codice, nome FROM regioni_order;").fetchall()
    for row in existing_reg:
        old_nome = row["nome"]
        new_nome = reg_map.get(old_nome.upper())
        if new_nome and new_nome != old_nome:
            cur.execute("UPDATE regioni_order SET nome = ? WHERE codice = ?;",
                        (new_nome, row["codice"]))

    # --- Magazzino vini: normalizza NAZIONE e REGIONE ---
    try:
        from app.models.vini_magazzino_db import get_magazzino_connection
        mag = get_magazzino_connection()
        mc = mag.cursor()
        # Normalizza NAZIONE
        for naz_upper, naz_title in naz_map.items():
            mc.execute("UPDATE vini_magazzino SET NAZIONE = ? WHERE UPPER(NAZIONE) = ? AND NAZIONE != ?;",
                       (naz_title, naz_upper, naz_title))
        # Normalizza REGIONE
        for reg_upper, reg_title in reg_map.items():
            mc.execute("UPDATE vini_magazzino SET REGIONE = ? WHERE UPPER(REGIONE) = ? AND REGIONE != ?;",
                       (reg_title, reg_upper, reg_title))
        mag.commit()
        mag.close()
    except Exception:
        pass  # Se il DB magazzino non esiste ancora, ignora


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
        ("Italia", 1),
        ("Francia", 2),
        ("Germania", 3),
        ("Austria", 4),
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
        ("IT01", "Italia", "Lombardia", 1),
        ("IT02", "Italia", "Piemonte", 2),
        ("IT03", "Italia", "Liguria", 3),
        ("IT04", "Italia", "Valle d'Aosta", 4),
        ("IT05", "Italia", "Veneto", 5),
        ("IT06", "Italia", "Friuli-Venezia Giulia", 6),
        ("IT07", "Italia", "Trentino-Alto Adige", 7),
        ("IT08", "Italia", "Emilia-Romagna", 8),
        ("IT09", "Italia", "Toscana", 9),
        ("IT10", "Italia", "Umbria", 10),
        ("IT11", "Italia", "Marche", 11),
        ("IT12", "Italia", "Lazio", 12),
        ("IT13", "Italia", "Abruzzo", 13),
        ("IT14", "Italia", "Molise", 14),
        ("IT15", "Italia", "Campania", 15),
        ("IT16", "Italia", "Puglia", 16),
        ("IT17", "Italia", "Basilicata", 17),
        ("IT18", "Italia", "Calabria", 18),
        ("IT19", "Italia", "Sicilia", 19),
        ("IT20", "Italia", "Sardegna", 20),
        # FRANCIA
        ("FR01", "Francia", "Alsazia", 21),
        ("FR02", "Francia", "Beaujolais", 22),
        ("FR03", "Francia", "Bordeaux", 23),
        ("FR04", "Francia", "Borgogna", 24),
        ("FR05", "Francia", "Champagne", 25),
        ("FR06", "Francia", "Corsica", 26),
        ("FR07", "Francia", "Jura", 27),
        ("FR08", "Francia", "Linguadoca-Rossiglione", 28),
        ("FR09", "Francia", "Lorraine", 29),
        ("FR10", "Francia", "Provenza", 30),
        ("FR11", "Francia", "Rhone", 31),
        ("FR12", "Francia", "Savoia-Bugey", 32),
        ("FR13", "Francia", "Sud-Ovest", 33),
        ("FR14", "Francia", "Vallée de la Loire", 34),
        # GERMANIA
        ("DE01", "Germania", "Ahr", 35),
        ("DE02", "Germania", "Baden", 36),
        ("DE03", "Germania", "Franken", 37),
        ("DE04", "Germania", "Hessische-Bergstrasse", 38),
        ("DE05", "Germania", "Mittelrhein", 39),
        ("DE06", "Germania", "Mosel-Saar-Ruwer", 40),
        ("DE07", "Germania", "Nahe", 41),
        ("DE08", "Germania", "Pfalz", 42),
        ("DE09", "Germania", "Rheingau", 43),
        ("DE10", "Germania", "Rheinhessen", 44),
        ("DE11", "Germania", "Saale-Unstrut", 45),
        ("DE12", "Germania", "Sachsen", 46),
        ("DE13", "Germania", "Wurttemberg", 47),
        # AUSTRIA
        ("AU01", "Austria", "Niederösterreich", 48),
        ("AU02", "Austria", "Burgenland", 49),
        ("AU03", "Austria", "Steiermark", 50),
        ("AU04", "Austria", "Wien", 51),
        ("AU05", "Austria", "Kärnten", 52),
        ("AU06", "Austria", "Oberösterreich", 53),
        ("AU07", "Austria", "Salzburg", 54),
        ("AU08", "Austria", "Tirol", 55),
        ("AU09", "Austria", "Vorarlberg", 56),
    ]

    row = cur.execute("SELECT COUNT(*) AS n FROM regioni_order;").fetchone()
    if row["n"] == 0:
        cur.executemany(
            "INSERT INTO regioni_order (codice, nazione, nome, ordine) VALUES (?, ?, ?, ?);",
            default_regions,
        )
    else:
        # Migrazione: normalizza nazioni e regioni da MAIUSCOLO a Title Case
        _migrate_nazioni_regioni_titlecase(cur, default_nations, default_regions)

    # ---------------------------
    # Formati
    # ---------------------------
    default_formati = [
        # (formato, ordine, descrizione, litri)
        ("MN",  1,  "Mini",                0.1),
        ("QP",  2,  "Quarto",              0.1875),
        ("ME",  3,  "Mezza",               0.375),
        ("DM",  4,  "Demie",               0.5),
        ("CL",  5,  "Clavelin",            0.62),
        ("BT",  6,  "Bottiglia",           0.75),
        ("BN",  7,  "Bagnum",              1.0),
        ("MG",  8,  "Magnum",              1.5),
        ("MJ",  9,  "Marie Jeanne",        2.5),
        ("JB",  10, "Jéroboam",            3.0),
        ("RH",  11, "Réhoboam",            4.5),
        ("JBX", 12, "Jéroboam Bordeaux",   5.0),
        ("MS",  13, "Mathusalem",          6.0),
        ("SM",  14, "Salmanazar",          9.0),
        ("BZ",  15, "Balthazar",           12.0),
        ("NB",  16, "Nabuchodonosor",      15.0),
        ("ML",  17, "Melchior",            18.0),
        ("PR",  18, "Primat",              27.0),
        ("MZ",  19, "Melchizedec",         30.0),
    ]
    # Migrazione formati: se la tabella ha righe ma mancano descrizione/litri
    # (vecchio schema con solo 5 formati), svuota e reinserisce i 19 nuovi.
    row = cur.execute("SELECT COUNT(*) AS n FROM formati_order;").fetchone()
    if row["n"] == 0:
        cur.executemany(
            "INSERT INTO formati_order (formato, ordine, descrizione, litri) VALUES (?, ?, ?, ?);",
            default_formati,
        )
    else:
        # Controlla se i formati esistenti hanno descrizione popolata
        filled = cur.execute(
            "SELECT COUNT(*) AS n FROM formati_order WHERE descrizione IS NOT NULL AND descrizione != '';"
        ).fetchone()
        if filled["n"] == 0:
            # Vecchi formati senza descrizione → sostituisci con i 19 nuovi
            cur.execute("DELETE FROM formati_order;")
            cur.executemany(
                "INSERT INTO formati_order (formato, ordine, descrizione, litri) VALUES (?, ?, ?, ?);",
                default_formati,
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