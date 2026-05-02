#!/usr/bin/env python3
# @version: v1.3-locale-aware (R3, sessione 60, 2026-04-29)
# Sistema migrazioni TRGB — semplificato, stile Alembic.
#
# R3 (sessione 60): aggiunta supporto flag TRGB_SPECIFIC sulle migrazioni che
# inseriscono SOLO dati seed dell'osteria di Marco (Tre Gobbi). Quando il
# backend gira con TRGB_LOCALE != "tregobbi" (es. istanza prodotto pulita
# locali/trgb/), queste migrazioni sono saltate — il cliente nuovo parte
# con DB vuoti e popola i suoi dati dal pannello UI.
# Vedi docs/refactor_monorepo.md §3 R3 e locali/tregobbi/seeds/MIGRATIONS_TRGB.md.

import sqlite3
import importlib
import os
from pathlib import Path

from app.utils.locale_data import locale_data_path

# ---------------------------------------------------------
# PERCORSI
# ---------------------------------------------------------

# /app/migrations/
BASE_DIR = Path(__file__).resolve().parent

# /app/migrations/ (stesso livello dei file 001_*.py)
MIGRATIONS_DIR = BASE_DIR

# R6.5 — path tenant-aware: locali/<TRGB_LOCALE>/data/foodcost.db con
# fallback ad app/data/foodcost.db (storico). Punto di ingresso al boot.
DB_PATH = locale_data_path("foodcost.db")


def get_applied_migrations(conn):
    """Crea tabella schema_migrations se non esiste e ritorna quelle applicate."""
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    cur.execute("SELECT name FROM schema_migrations ORDER BY name ASC")
    return {row[0] for row in cur.fetchall()}


def _is_trgb_specific(filename: str) -> bool:
    """
    R3 (sessione 60): controlla se una migrazione ha la flag TRGB_SPECIFIC = True
    al livello modulo. Le migrazioni TRGB-specific contengono SOLO dati seed
    dell'osteria di Marco (es. menu Primavera 2026, ingredienti specifici, MEP
    templates). Vanno saltate quando si deploya su un locale != tregobbi.

    Importa il modulo (idempotente — Python cacha) e legge l'attributo.
    Ritorna False se l'attributo non esiste (default: migration generica).
    """
    module_name = f"app.migrations.{filename[:-3]}"
    try:
        module = importlib.import_module(module_name)
        return bool(getattr(module, "TRGB_SPECIFIC", False))
    except Exception:
        # Se import fallisce, NON la marchiamo TRGB-specific: meglio applicare
        # per errore una migrazione del prodotto, che skippare per errore una
        # migrazione di schema universale.
        return False


def apply_migration(conn, filename):
    """Esegue una singola migration importando il file Python 001_*.py."""
    print(f"⚙️  Applying migration: {filename}")
    module_name = f"app.migrations.{filename[:-3]}"
    module = importlib.import_module(module_name)

    try:
        module.upgrade(conn)
        conn.execute(
            "INSERT INTO schema_migrations (name) VALUES (?)",
            (filename,)
        )
        conn.commit()
        print(f"✔ Migration applied: {filename}")
    except Exception as e:
        print(f"❌ Migration failed: {filename}")
        print("Error:", e)
        conn.rollback()
        raise


def run_migrations():
    """Esegue tutte le migrazioni mancanti sul DB foodcost.db CORRETTO.

    R3 (sessione 60): se l'env var TRGB_LOCALE != "tregobbi", salta le
    migrazioni con flag TRGB_SPECIFIC = True (vedi _is_trgb_specific).
    Default TRGB_LOCALE = "tregobbi" → comportamento backward-compat per
    l'osteria di Marco.
    """
    print("🔍 Checking migrations…")

    # Assicuriamoci che la cartella app/data/ esista
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"📌 Using DB: {DB_PATH}")

    # R3: locale corrente (per skip migrazioni TRGB-specific)
    locale = os.environ.get("TRGB_LOCALE", "tregobbi").strip() or "tregobbi"
    print(f"🏠 Locale corrente: {locale}")

    # Apertura DB
    conn = sqlite3.connect(DB_PATH)

    applied = get_applied_migrations(conn)

    # Cerchiamo file 001_*.py, 002_*.py ecc.
    migration_files = sorted(
        f for f in os.listdir(MIGRATIONS_DIR)
        if f.endswith(".py") and f[0:3].isdigit()
    )

    skipped_trgb = []
    # Applica solo le migrazioni NON ancora applicate
    for filename in migration_files:
        if filename in applied:
            continue
        # R3: skip migrazioni TRGB-specific se non siamo sull'istanza tregobbi
        if locale != "tregobbi" and _is_trgb_specific(filename):
            print(f"⏭  Skip TRGB-specific (locale='{locale}'): {filename}")
            skipped_trgb.append(filename)
            continue
        apply_migration(conn, filename)

    conn.close()
    if skipped_trgb:
        print(f"🎉 All migrations applied (skipped {len(skipped_trgb)} TRGB-specific).")
    else:
        print("🎉 All migrations applied.")


if __name__ == "__main__":
    run_migrations()