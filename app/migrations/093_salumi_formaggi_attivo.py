"""
Migrazione 093: aggiungi colonne `attivo` e `archiviato_at` a
salumi_tagli e formaggi_tagli.

Cambio semantico: per salumi e formaggi NON ha senso il concetto "venduto"
(non vendiamo il singolo pezzo), ma "presente in carta" vs "in archivio".
Le colonne `venduto` / `venduto_at` esistenti restano nel DB per
retrocompatibilita' ma la UI usera' solo `attivo`.

- attivo INTEGER DEFAULT 1  → 1 = in carta, 0 = archiviato (riattivabile)
- archiviato_at TEXT        → timestamp dell'archiviazione (NULL se attivo)

Idempotente: se le colonne esistono gia', non fa nulla.
"""


def upgrade(conn):
    cur = conn.cursor()

    for tabella in ("salumi_tagli", "formaggi_tagli"):
        # Aggiungi `attivo`
        try:
            cur.execute(f"""
                ALTER TABLE {tabella}
                ADD COLUMN attivo INTEGER NOT NULL DEFAULT 1
            """)
            print(f"  + {tabella}.attivo aggiunta (default 1)")
        except Exception as e:
            print(f"  ~ {tabella}.attivo gia' presente o tabella mancante: {e}")

        # Aggiungi `archiviato_at`
        try:
            cur.execute(f"""
                ALTER TABLE {tabella}
                ADD COLUMN archiviato_at TEXT
            """)
            print(f"  + {tabella}.archiviato_at aggiunta")
        except Exception as e:
            print(f"  ~ {tabella}.archiviato_at gia' presente o tabella mancante: {e}")

        # Indice su attivo per filtri rapidi
        try:
            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{tabella}_attivo
                ON {tabella}(attivo)
            """)
            print(f"  + idx_{tabella}_attivo creato")
        except Exception as e:
            print(f"  ~ idx_{tabella}_attivo: {e}")

    print("  mig 093 salumi/formaggi attivo+archiviato pronta")
