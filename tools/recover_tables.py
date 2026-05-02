#!/usr/bin/env python3
"""
Recupera tabelle mancanti/vuote dal DB corrotto (.corrupted)
e le inserisce nel DB attuale, senza toccare tabelle che hanno già dati.
"""
# TODO R6.5: utility one-shot di recovery. Path hardcoded ad app/data/.
# Adattare manualmente al locale corrente se rilanciato in futuro.
import sqlite3
import sys

CORRUPTED = "app/data/foodcost.db.corrupted"
CURRENT = "app/data/foodcost.db"

def get_tables(conn):
    """Ritorna dict {nome_tabella: count_righe}"""
    tables = {}
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    for (name,) in rows:
        try:
            count = conn.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0]
            tables[name] = count
        except Exception:
            tables[name] = -1  # tabella corrotta/illeggibile
    return tables

def recover_table(src, dst, table_name):
    """Copia righe da src a dst per una singola tabella."""
    try:
        rows = src.execute(f'SELECT * FROM "{table_name}"').fetchall()
    except Exception as e:
        print(f"  ERRORE lettura da corrotto: {e}")
        return 0

    if not rows:
        print(f"  Tabella vuota anche nel corrotto")
        return 0

    # Prendi nomi colonne
    cols_info = src.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    col_names = [c[1] for c in cols_info]
    placeholders = ",".join(["?"] * len(col_names))
    cols_sql = ",".join([f'"{c}"' for c in col_names])

    inserted = 0
    for row in rows:
        try:
            dst.execute(f'INSERT OR IGNORE INTO "{table_name}" ({cols_sql}) VALUES ({placeholders})', tuple(row))
            inserted += 1
        except Exception as e:
            # Skip righe problematiche
            pass

    dst.commit()
    return inserted


def main():
    print(f"Apertura DB corrotto: {CORRUPTED}")
    src = sqlite3.connect(CORRUPTED)

    print(f"Apertura DB attuale: {CURRENT}")
    dst = sqlite3.connect(CURRENT)

    # Confronta tabelle
    src_tables = get_tables(src)
    dst_tables = get_tables(dst)

    print(f"\n{'TABELLA':<35} {'CORROTTO':>10} {'ATTUALE':>10} {'AZIONE'}")
    print("-" * 75)

    to_recover = []
    for name in sorted(set(list(src_tables.keys()) + list(dst_tables.keys()))):
        src_count = src_tables.get(name, -999)
        dst_count = dst_tables.get(name, -999)

        if src_count == -999:
            action = "solo in attuale"
        elif dst_count == -999:
            action = "MANCA in attuale!"
        elif dst_count == 0 and src_count > 0:
            action = "DA RECUPERARE"
            to_recover.append(name)
        elif dst_count == 0 and src_count == 0:
            action = "vuota in entrambi"
        elif dst_count > 0:
            action = "OK"
        elif src_count == -1:
            action = "corrotta in src"
        else:
            action = "?"

        src_str = str(src_count) if src_count >= 0 else ("corrotta" if src_count == -1 else "—")
        dst_str = str(dst_count) if dst_count >= 0 else ("corrotta" if dst_count == -1 else "—")
        print(f"  {name:<33} {src_str:>10} {dst_str:>10}   {action}")

    if not to_recover:
        print("\nNessuna tabella da recuperare!")
        src.close()
        dst.close()
        return

    print(f"\n--- Recupero {len(to_recover)} tabelle ---\n")

    # Prima aggiungi colonne mancanti dove serve
    for table_name in to_recover:
        # Verifica che la tabella esista in dst
        exists = dst.execute(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,)
        ).fetchone()[0]

        if not exists:
            # Crea la tabella nel dst copiando lo schema
            try:
                schema = src.execute(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                    (table_name,)
                ).fetchone()
                if schema and schema[0]:
                    dst.execute(schema[0])
                    dst.commit()
                    print(f"  Creata tabella: {table_name}")
            except Exception as e:
                print(f"  ERRORE creazione tabella {table_name}: {e}")
                continue

        # Verifica colonne mancanti
        src_cols = {c[1] for c in src.execute(f'PRAGMA table_info("{table_name}")').fetchall()}
        dst_cols = {c[1] for c in dst.execute(f'PRAGMA table_info("{table_name}")').fetchall()}
        missing = src_cols - dst_cols
        if missing:
            for col in missing:
                col_info = [c for c in src.execute(f'PRAGMA table_info("{table_name}")').fetchall() if c[1] == col][0]
                col_type = col_info[2] or "TEXT"
                try:
                    dst.execute(f'ALTER TABLE "{table_name}" ADD COLUMN "{col}" {col_type}')
                    print(f"  Aggiunta colonna {col} a {table_name}")
                except:
                    pass
            dst.commit()

        print(f"Recupero: {table_name}...")
        n = recover_table(src, dst, table_name)
        print(f"  -> {n} righe recuperate")

    print("\n--- Fatto! ---")
    src.close()
    dst.close()


if __name__ == "__main__":
    main()
