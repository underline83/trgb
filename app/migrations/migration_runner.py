#!/usr/bin/env python3
# @version: v1.2-migrations
# Sistema migrazioni TRGB — semplificato, stile Alembic

import sqlite3
import importlib
import os
from pathlib import Path

# ---------------------------------------------------------
# PERCORSI
# ---------------------------------------------------------

# /app/migrations/
BASE_DIR = Path(__file__).resolve().parent

# /app/migrations/ (stesso livello dei file 001_*.py)
MIGRATIONS_DIR = BASE_DIR

# DB CORRETTO → /app/data/foodcost.db
DB_PATH = BASE_DIR.parent / "data" / "foodcost.db"


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
    """Esegue tutte le migrazioni mancanti sul DB foodcost.db CORRETTO."""
    print("🔍 Checking migrations…")

    # Assicuriamoci che la cartella app/data/ esista
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"📌 Using DB: {DB_PATH}")

    # Apertura DB
    conn = sqlite3.connect(DB_PATH)

    applied = get_applied_migrations(conn)

    # Cerchiamo file 001_*.py, 002_*.py ecc.
    migration_files = sorted(
        f for f in os.listdir(MIGRATIONS_DIR)
        if f.endswith(".py") and f[0:3].isdigit()
    )

    # Applica solo le migrazioni NON ancora applicate
    for filename in migration_files:
        if filename not in applied:
            apply_migration(conn, filename)

    conn.close()
    print("🎉 All migrations applied.")


if __name__ == "__main__":
    run_migrations()