"""
Migrazione 048: Tabella cg_piano_rate

Per spese fisse con rate variabili (es. prestiti alla francese),
memorizza l'importo specifico di ogni rata indicizzato per periodo.
Quando la generazione uscite trova una rata nel piano, usa quell'importo
al posto dell'importo fisso della spesa fissa.
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cg_piano_rate (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            spesa_fissa_id  INTEGER NOT NULL,
            numero_rata     INTEGER NOT NULL,
            periodo         TEXT NOT NULL,
            importo         REAL NOT NULL,
            note            TEXT,
            FOREIGN KEY (spesa_fissa_id) REFERENCES cg_spese_fisse(id),
            UNIQUE(spesa_fissa_id, periodo)
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_piano_rate_sf
        ON cg_piano_rate(spesa_fissa_id)
    """)

    # Popola piano rate dai prestiti BPM già inseriti (migrazione 047)
    # Cerca le spese fisse di tipo PRESTITO
    prestiti = cur.execute(
        "SELECT id, titolo, data_inizio, data_fine FROM cg_spese_fisse WHERE tipo = 'PRESTITO'"
    ).fetchall()

    for p in prestiti:
        sf_id = p[0]
        # Leggi le uscite già create dalla migrazione 047 con importi esatti
        uscite = cur.execute("""
            SELECT periodo_riferimento, totale, note
            FROM cg_uscite
            WHERE spesa_fissa_id = ?
            ORDER BY periodo_riferimento
        """, (sf_id,)).fetchall()

        for u in uscite:
            periodo, importo, note = u[0], u[1], u[2]
            # Estrai numero rata dalla nota (es. "Rata 5/72")
            num_rata = 0
            if note and note.startswith("Rata "):
                try:
                    num_rata = int(note.split("/")[0].replace("Rata ", ""))
                except (ValueError, IndexError):
                    pass

            try:
                cur.execute("""
                    INSERT INTO cg_piano_rate (spesa_fissa_id, numero_rata, periodo, importo, note)
                    VALUES (?, ?, ?, ?, ?)
                """, (sf_id, num_rata, periodo, importo, note))
            except Exception:
                pass  # Duplicato, skip

    count = cur.execute("SELECT COUNT(*) FROM cg_piano_rate").fetchone()
    print(f"  cg_piano_rate: {count[0]} rate inserite")
