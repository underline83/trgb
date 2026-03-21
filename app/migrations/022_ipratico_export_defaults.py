# Migration 022: Tabella ipratico_export_defaults
# Valori di default per i campi compilati automaticamente nell'export vini nuovi.
# Ogni riga = un campo iPratico con il suo valore di default configurabile dal frontend.

def upgrade(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ipratico_export_defaults (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            field_name  TEXT NOT NULL UNIQUE,
            field_value TEXT NOT NULL,
            field_group TEXT NOT NULL DEFAULT 'general',
            label       TEXT,
            updated_at  TEXT DEFAULT (datetime('now'))
        )
    """)

    # Inserisci valori di default iniziali
    defaults = [
        # Generali
        ("Family", "beverage", "general", "Family"),
        ("Hidden", "no", "general", "Hidden"),
        # Reparti servizio
        ("Table_Service_Department", "Rep. 1 (10%)", "reparti", "Reparto Tavolo"),
        ("Counter_Service_Department", "Rep. 1 (10%)", "reparti", "Reparto Banco"),
        ("Takeaway_Department", "Rep. 1 (10%)", "reparti", "Reparto Asporto"),
        ("Delivery_Department", "Rep. 1 (10%)", "reparti", "Reparto Delivery"),
        # Nomi listino
        ("Pricelist_name", "Asporto", "listini", "Listino 1 (nome)"),
        ("Pricelist_name_1", "Ristorante", "listini", "Listino 2 (nome)"),
        ("Pricelist_name_2", "WebApp", "listini", "Listino 3 (nome)"),
    ]

    for field_name, field_value, field_group, label in defaults:
        cur.execute(
            """INSERT OR IGNORE INTO ipratico_export_defaults
               (field_name, field_value, field_group, label)
               VALUES (?, ?, ?, ?)""",
            (field_name, field_value, field_group, label),
        )

    conn.commit()


def downgrade(conn):
    conn.execute("DROP TABLE IF EXISTS ipratico_export_defaults")
    conn.commit()
