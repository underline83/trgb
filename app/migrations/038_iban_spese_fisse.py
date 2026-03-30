"""
Migration 038 — Aggiunge campo IBAN a cg_spese_fisse
Per tracciare l'IBAN del beneficiario (proprietario affitto, banca prestito, ecc.)
"""

def run(conn):
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE cg_spese_fisse ADD COLUMN iban TEXT")
    except Exception:
        pass  # Colonna gia esistente
    conn.commit()
