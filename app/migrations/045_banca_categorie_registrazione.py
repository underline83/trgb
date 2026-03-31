"""
Migrazione 045: Tabella banca_categorie_registrazione
Sposta le categorie di riconciliazione da costanti hardcoded a tabella DB.
Seed con le categorie attuali + pattern di auto-detect.
"""


def run(conn):
    cur = conn.cursor()

    # Crea tabella
    cur.execute("""
        CREATE TABLE IF NOT EXISTS banca_categorie_registrazione (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codice TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK(tipo IN ('uscita', 'entrata')),
            pattern TEXT DEFAULT '',
            ordine INTEGER DEFAULT 0,
            attiva INTEGER DEFAULT 1,
            colore TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Verifica se già popolata
    existing = cur.execute("SELECT COUNT(*) as c FROM banca_categorie_registrazione").fetchone()
    if existing["c"] > 0:
        return

    # ── Seed categorie USCITA ──
    uscite = [
        ("SPESA_BANCARIA",   "Spese bancarie",         "uscita",
         "COMM.SU BONIFICI|COMM.BON.|COMM/SPESE SU PORTAF|COMMISSIONI|DEBIT PAGAMENTO<50",
         1, "#6b7280"),
        ("COMMISSIONE_POS",  "Commissioni POS",        "uscita",
         "COMM.POS|COMMISSIONE POS",
         2, "#f59e0b"),
        ("IMPOSTA_BOLLO",    "Imposta di bollo",       "uscita",
         "IMP. BOLLO",
         3, "#8b5cf6"),
        ("CARTA_CREDITO",    "Carta di credito",       "uscita",
         "CARTIMPRONTA|DEBIT PAGAMENTO>=50",
         4, "#ec4899"),
        ("MUTUO",            "Mutuo / Finanziamento",  "uscita",
         "RIMBORSO FINANZ|MUTUO",
         5, "#ef4444"),
        ("EFFETTI",          "Effetti / RIBA",         "uscita",
         "EFFETTI RITIRATI|ADD.EFFETTO",
         6, "#0ea5e9"),
        ("SDD",              "Addebito SDD",           "uscita",
         "ADDEBITO DIRETTO SDD|SDD CORE",
         7, "#14b8a6"),
        ("ALTRO_USCITA",     "Altra uscita",           "uscita",
         "",
         99, "#9ca3af"),
    ]

    # ── Seed categorie ENTRATA ──
    entrate = [
        ("INCASSO_POS",       "Incasso POS",           "entrata",
         "INCAS. TRAMITE P.O.S|INC.POS",
         1, "#059669"),
        ("INCASSO_CONTANTI",  "Contanti",              "entrata",
         "VERS. CONTANTI|VERSAMENTO",
         2, "#10b981"),
        ("BONIFICO_ENTRATA",  "Bonifico entrata",      "entrata",
         "BONIF. VS. FAVORE|BON.DA ",
         3, "#2563eb"),
        ("ALTRO_ENTRATA",     "Altra entrata",         "entrata",
         "",
         99, "#9ca3af"),
    ]

    for codice, label, tipo, pattern, ordine, colore in uscite + entrate:
        cur.execute("""
            INSERT INTO banca_categorie_registrazione
                (codice, label, tipo, pattern, ordine, colore)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (codice, label, tipo, pattern, ordine, colore))

    conn.commit()
