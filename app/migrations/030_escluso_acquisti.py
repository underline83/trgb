"""
Migrazione 030: aggiunge campo escluso_acquisti a fe_fornitore_categoria.

Flag booleano (0/1) per nascondere un fornitore dal modulo Acquisti
(dashboard, stats, elenco fornitori). Indipendente dal campo 'escluso'
che è usato SOLO dal modulo Ricette/Matching.

Casi d'uso: affitti (Cattaneo, Bana), servizi non pertinenti.
"""

def upgrade(conn):
    try:
        conn.execute("""
            ALTER TABLE fe_fornitore_categoria
            ADD COLUMN escluso_acquisti INTEGER NOT NULL DEFAULT 0
        """)
    except Exception:
        pass  # colonna già esistente
    conn.commit()
