#!/usr/bin/env python3
"""Fix: assicura che le colonne della migrazione 035 esistano in cg_uscite."""
import sqlite3

conn = sqlite3.connect("app/data/foodcost.db")
cols = [r[1] for r in conn.execute("PRAGMA table_info(cg_uscite)").fetchall()]
print("Current columns:", cols)

to_add = [
    ("tipo_uscita", "TEXT DEFAULT 'FATTURA'"),
    ("spesa_fissa_id", "INTEGER"),
    ("periodo_riferimento", "TEXT"),
    ("metodo_pagamento", "TEXT"),
]

for col, typ in to_add:
    if col not in cols:
        conn.execute(f"ALTER TABLE cg_uscite ADD COLUMN {col} {typ}")
        print(f"Added {col}")
    else:
        print(f"{col} already exists")

conn.commit()
conn.close()
print("Done")
