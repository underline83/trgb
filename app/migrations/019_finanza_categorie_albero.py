# 019_finanza_categorie_albero.py
# Albero gerarchico cat1 → cat2 per categorie finanza (analitiche + finanziarie)
# + aggiunge colonna categoria_id a fe_sottocategorie per spostamento tra padri

def upgrade(conn):
    cur = conn.cursor()

    # ── Tabella categorie livello 1 ──────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS finanza_cat (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            nome    TEXT NOT NULL,
            vista   TEXT NOT NULL CHECK (vista IN ('A', 'F')),
            ordine  INTEGER NOT NULL DEFAULT 0,
            UNIQUE(nome, vista)
        )
    """)

    # ── Tabella sotto-categorie livello 2 ────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS finanza_subcat (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            cat_id  INTEGER NOT NULL,
            nome    TEXT NOT NULL,
            ordine  INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (cat_id) REFERENCES finanza_cat(id),
            UNIQUE(cat_id, nome)
        )
    """)

    # ── Seed da dati esistenti in finanza_movimenti ──────────
    # cat1 (analitiche)
    rows = cur.execute("""
        SELECT DISTINCT cat1 FROM finanza_movimenti
        WHERE cat1 IS NOT NULL AND cat1 != ''
        ORDER BY cat1
    """).fetchall()
    for i, r in enumerate(rows):
        try:
            cur.execute(
                "INSERT OR IGNORE INTO finanza_cat (nome, vista, ordine) VALUES (?, 'A', ?)",
                (r[0].strip(), i)
            )
        except Exception:
            pass

    # cat2 (analitiche) → legate a cat1
    rows = cur.execute("""
        SELECT DISTINCT cat1, cat2 FROM finanza_movimenti
        WHERE cat1 IS NOT NULL AND cat1 != ''
          AND cat2 IS NOT NULL AND cat2 != ''
        ORDER BY cat1, cat2
    """).fetchall()
    for r in rows:
        parent = cur.execute(
            "SELECT id FROM finanza_cat WHERE nome = ? AND vista = 'A'",
            (r[0].strip(),)
        ).fetchone()
        if parent:
            try:
                cur.execute(
                    "INSERT OR IGNORE INTO finanza_subcat (cat_id, nome, ordine) "
                    "VALUES (?, ?, (SELECT COALESCE(MAX(ordine),0)+1 FROM finanza_subcat WHERE cat_id = ?))",
                    (parent[0], r[1].strip(), parent[0])
                )
            except Exception:
                pass

    # cat1_fin (finanziarie)
    rows = cur.execute("""
        SELECT DISTINCT cat1_fin FROM finanza_movimenti
        WHERE cat1_fin IS NOT NULL AND cat1_fin != ''
        ORDER BY cat1_fin
    """).fetchall()
    for i, r in enumerate(rows):
        try:
            cur.execute(
                "INSERT OR IGNORE INTO finanza_cat (nome, vista, ordine) VALUES (?, 'F', ?)",
                (r[0].strip(), i)
            )
        except Exception:
            pass

    # cat2_fin → legate a cat1_fin
    rows = cur.execute("""
        SELECT DISTINCT cat1_fin, cat2_fin FROM finanza_movimenti
        WHERE cat1_fin IS NOT NULL AND cat1_fin != ''
          AND cat2_fin IS NOT NULL AND cat2_fin != ''
        ORDER BY cat1_fin, cat2_fin
    """).fetchall()
    for r in rows:
        parent = cur.execute(
            "SELECT id FROM finanza_cat WHERE nome = ? AND vista = 'F'",
            (r[0].strip(),)
        ).fetchone()
        if parent:
            try:
                cur.execute(
                    "INSERT OR IGNORE INTO finanza_subcat (cat_id, nome, ordine) "
                    "VALUES (?, ?, (SELECT COALESCE(MAX(ordine),0)+1 FROM finanza_subcat WHERE cat_id = ?))",
                    (parent[0], r[1].strip(), parent[0])
                )
            except Exception:
                pass

    # Seed anche da finanza_regole_cat
    for col1, col2, vista in [('cat1', 'cat2', 'A'), ('cat1_fin', 'cat2_fin', 'F')]:
        rows = cur.execute(f"""
            SELECT DISTINCT {col1} FROM finanza_regole_cat
            WHERE {col1} IS NOT NULL AND {col1} != ''
        """).fetchall()
        for r in rows:
            try:
                cur.execute(
                    "INSERT OR IGNORE INTO finanza_cat (nome, vista, ordine) VALUES (?, ?, "
                    "(SELECT COALESCE(MAX(ordine),0)+1 FROM finanza_cat WHERE vista = ?))",
                    (r[0].strip(), vista, vista)
                )
            except Exception:
                pass

        rows = cur.execute(f"""
            SELECT DISTINCT {col1}, {col2} FROM finanza_regole_cat
            WHERE {col1} IS NOT NULL AND {col1} != ''
              AND {col2} IS NOT NULL AND {col2} != ''
        """).fetchall()
        for r in rows:
            parent = cur.execute(
                "SELECT id FROM finanza_cat WHERE nome = ? AND vista = ?",
                (r[0].strip(), vista)
            ).fetchone()
            if parent:
                try:
                    cur.execute(
                        "INSERT OR IGNORE INTO finanza_subcat (cat_id, nome, ordine) "
                        "VALUES (?, ?, (SELECT COALESCE(MAX(ordine),0)+1 FROM finanza_subcat WHERE cat_id = ?))",
                        (parent[0], r[1].strip(), parent[0])
                    )
                except Exception:
                    pass

    conn.commit()
