"""
Migrazione 127 — Seed vitigni base in vini_vitigni_v2 (2026-05-13)

CONTESTO (V.6+V.7+V.8 Fase 4):
  Popola `vini_vitigni_v2` con ~60 vitigni canonici più comuni: italiani
  classici (Nebbiolo, Sangiovese, Glera, ecc.) + internazionali (Cabernet
  Sauvignon, Chardonnay, Pinot Noir, ecc.).

  L'utente può aggiungere altri vitigni via endpoint CRUD esistente
  (POST /vini/anagrafiche/vitigni/). Il seed garantisce un set di base
  per autocomplete nei nuovi vini madre / bottiglie.

DB: vini_magazzino.sqlite3 (locale-aware).
Idempotente: INSERT OR IGNORE su `nome` UNIQUE.
"""
import sqlite3
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


# Seed: ~60 vitigni più diffusi. (nome, nazione_origine, note)
SEED_VITIGNI = [
    # === ITALIANI BIANCHI ===
    ("Trebbiano",            "Italia",  "Famiglia di vitigni a bacca bianca (Toscano, d'Abruzzo, di Soave)"),
    ("Garganega",            "Italia",  "Base del Soave, Veneto"),
    ("Vermentino",           "Italia",  "Liguria, Sardegna, Toscana"),
    ("Greco",                "Italia",  "Campania (Greco di Tufo)"),
    ("Fiano",                "Italia",  "Campania (Fiano di Avellino)"),
    ("Falanghina",           "Italia",  "Campania"),
    ("Verdicchio",           "Italia",  "Marche (Castelli di Jesi, Matelica)"),
    ("Pinot Grigio",         "Italia",  "Variante italiana del Pinot Gris"),
    ("Glera",                "Italia",  "Base del Prosecco, Veneto/Friuli"),
    ("Cortese",              "Italia",  "Piemonte (Gavi)"),
    ("Arneis",               "Italia",  "Piemonte (Roero Arneis)"),
    ("Ribolla Gialla",       "Italia",  "Friuli Venezia Giulia"),
    ("Friulano",             "Italia",  "Ex Tocai Friulano"),
    ("Pecorino",             "Italia",  "Marche, Abruzzo"),
    ("Malvasia",             "Italia",  "Famiglia di vitigni — versioni bianche/rosse, secche/dolci"),
    ("Moscato",              "Italia",  "Piemonte (Asti, Moscato d'Asti)"),

    # === ITALIANI ROSSI ===
    ("Nebbiolo",             "Italia",  "Piemonte (Barolo, Barbaresco, Roero)"),
    ("Sangiovese",           "Italia",  "Toscana (Chianti, Brunello, Vino Nobile di Montepulciano)"),
    ("Barbera",              "Italia",  "Piemonte (d'Asti, d'Alba, del Monferrato)"),
    ("Dolcetto",             "Italia",  "Piemonte"),
    ("Montepulciano",        "Italia",  "Abruzzo (Montepulciano d'Abruzzo) — non confondere con Vino Nobile di Montepulciano (Sangiovese)"),
    ("Aglianico",            "Italia",  "Campania (Taurasi), Basilicata (Aglianico del Vulture)"),
    ("Primitivo",            "Italia",  "Puglia. Geneticamente uguale a Zinfandel"),
    ("Negroamaro",           "Italia",  "Puglia (Salice Salentino)"),
    ("Corvina",              "Italia",  "Veneto (base Valpolicella, Amarone)"),
    ("Cannonau",             "Italia",  "Sardegna. Stesso vitigno del Grenache francese"),
    ("Nero d'Avola",         "Italia",  "Sicilia"),
    ("Lagrein",              "Italia",  "Trentino-Alto Adige"),
    ("Teroldego",            "Italia",  "Trentino (Teroldego Rotaliano)"),
    ("Schiava",              "Italia",  "Trentino-Alto Adige (Vernatsch)"),
    ("Lambrusco",            "Italia",  "Emilia (vino frizzante)"),
    ("Pinot Nero",           "Italia",  "Equivalente italiano del Pinot Noir francese"),
    ("Croatina",             "Italia",  "Oltrepò Pavese, Lombardia"),
    ("Refosco",              "Italia",  "Friuli Venezia Giulia"),
    ("Frappato",             "Italia",  "Sicilia (Cerasuolo di Vittoria)"),

    # === FRANCESI / INTERNAZIONALI BIANCHI ===
    ("Chardonnay",           "Francia", "Borgogna, Champagne. Coltivato in tutto il mondo"),
    ("Sauvignon Blanc",      "Francia", "Loira (Sancerre, Pouilly-Fumé), Bordeaux"),
    ("Riesling",             "Germania","Mosella, Rheingau, Alsazia"),
    ("Müller-Thurgau",       "Germania","Incrocio Riesling x Madeleine Royale"),
    ("Gewürztraminer",       "Francia", "Alsazia, Alto Adige"),
    ("Sémillon",             "Francia", "Bordeaux (Sauternes)"),
    ("Chenin Blanc",         "Francia", "Loira (Vouvray, Savennières)"),
    ("Viognier",             "Francia", "Rhône (Condrieu)"),
    ("Marsanne",             "Francia", "Rhône"),
    ("Roussanne",            "Francia", "Rhône (spesso in blend con Marsanne)"),
    ("Albariño",             "Spagna",  "Galizia (Rías Baixas)"),
    ("Grüner Veltliner",     "Austria", "Vitigno principale austriaco"),
    ("Silvaner",             "Germania","Franken"),

    # === FRANCESI / INTERNAZIONALI ROSSI ===
    ("Pinot Noir",           "Francia", "Borgogna, Champagne. Equivalente del Pinot Nero italiano"),
    ("Cabernet Sauvignon",   "Francia", "Bordeaux, coltivato in tutto il mondo"),
    ("Cabernet Franc",       "Francia", "Loira, Bordeaux"),
    ("Merlot",               "Francia", "Bordeaux (Pomerol, Saint-Émilion)"),
    ("Syrah",                "Francia", "Rhône settentrionale. Detto Shiraz in Australia"),
    ("Grenache",             "Francia", "Rhône meridionale (Châteauneuf-du-Pape). Stesso del Cannonau"),
    ("Mourvèdre",            "Francia", "Bandol, Châteauneuf-du-Pape"),
    ("Tempranillo",          "Spagna",  "Rioja, Ribera del Duero"),
    ("Malbec",               "Francia", "Cahors, oggi soprattutto Argentina"),
    ("Petit Verdot",         "Francia", "Bordeaux (varietà minore in blend)"),
    ("Carmenère",            "Francia", "Originario di Bordeaux, oggi tipico del Cile"),
    ("Zinfandel",            "USA",     "Geneticamente uguale al Primitivo italiano"),
    ("Zweigelt",             "Austria", "Incrocio Saint-Laurent x Blaufränkisch"),
    ("Blaufränkisch",        "Austria", "Detto Lemberger in Germania, Kékfrankos in Ungheria"),
    ("Gamay",                "Francia", "Beaujolais"),
]


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [127] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    try:
        cur = mag.cursor()
        # Verifica esistenza tabella
        row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_vitigni_v2'"
        ).fetchone()
        if not row:
            print("  [127] vini_vitigni_v2 non esiste, skip (mig 125 non applicata?)")
            return

        n_before = cur.execute("SELECT COUNT(*) FROM vini_vitigni_v2").fetchone()[0]
        print(f"  [127] vini_vitigni_v2: {n_before} righe prima del seed")

        # INSERT OR IGNORE su nome UNIQUE — idempotente
        cur.executemany(
            "INSERT OR IGNORE INTO vini_vitigni_v2 (nome, nazione_origine, note) VALUES (?, ?, ?)",
            SEED_VITIGNI,
        )
        n_inserted = cur.rowcount

        mag.commit()

        n_after = cur.execute("SELECT COUNT(*) FROM vini_vitigni_v2").fetchone()[0]
        print(f"  [127] seed completato: {n_inserted} nuovi inseriti, {len(SEED_VITIGNI) - n_inserted} già esistenti")
        print(f"  [127] vini_vitigni_v2: {n_after} righe totali")
        print("  [127] DONE")
    finally:
        mag.close()
