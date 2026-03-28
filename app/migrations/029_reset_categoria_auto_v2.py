"""
Migrazione 029: reset categoria_auto residue (Latini, Risto Team)
La migrazione 028 ha girato prima del fix nel codice, quindi le righe
settate a categoria_auto=1 dopo il push sono rimaste.
"""

def upgrade(conn):
    conn.execute("UPDATE fe_righe SET categoria_auto = 0 WHERE categoria_auto = 1")
    conn.commit()
