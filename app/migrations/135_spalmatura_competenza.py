"""
Migrazione 135 — Spalmatura competenza (G.3.2, 2026-05-16)

CONTESTO:
  Marco 2026-05-16: alcune spese coprono periodi multipli ma sono pagate/
  fatturate una volta sola. Esempi:
    - Assicurazione annuale €1.200 pagata a gennaio
    - Software annuale (iPratico, Aruba dominio) fatturati una-tantum
    - Consulenza trimestrale fatturata in anticipo
    - Manutenzione preventiva semestrale

  Oggi nel CE in modalità competenza il costo va tutto nel mese di
  pagamento/fattura: utile sgonfiato di gennaio, perfetto nei mesi
  successivi. Distorce il P&L mensile.

SOLUZIONE:
  Due campi opzionali su `cg_spese_fisse` E `fe_fatture`:
    - spalmatura_mesi (INTEGER, NULL=no spalmatura, N=spalma su N mesi)
    - spalmatura_data_inizio (TEXT 'YYYY-MM-01', primo mese coperto)

  Logica nel service CE (modalità competenza):
    quota_mese = importo_totale / spalmatura_mesi
    se mese_richiesto è tra spalmatura_data_inizio e spalmatura_data_inizio+N:
      → CE include quota_mese
    altrimenti:
      → CE non include nulla
  Modalità cassa: tutto nel mese di pagamento come oggi (=esborso reale).

  Pattern simile a `competenza_anno_mese` (mig 133, G.3.1b) ma più ricco.
  Se entrambi sono valorizzati: spalmatura vince (è più specifico).

DB: foodcost.db (entrambe le tabelle stanno qui). Idempotente.
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db."""
    cur = conn.cursor()

    # ── cg_spese_fisse ──
    cols_sf = {r[1] for r in cur.execute("PRAGMA table_info(cg_spese_fisse)").fetchall()}
    if "spalmatura_mesi" not in cols_sf:
        cur.execute("ALTER TABLE cg_spese_fisse ADD COLUMN spalmatura_mesi INTEGER")
        print("  [135] aggiunta cg_spese_fisse.spalmatura_mesi")
    else:
        print("  [135] cg_spese_fisse.spalmatura_mesi già presente")
    if "spalmatura_data_inizio" not in cols_sf:
        cur.execute("ALTER TABLE cg_spese_fisse ADD COLUMN spalmatura_data_inizio TEXT")
        print("  [135] aggiunta cg_spese_fisse.spalmatura_data_inizio")
    else:
        print("  [135] cg_spese_fisse.spalmatura_data_inizio già presente")

    # ── fe_fatture ──
    cols_ff = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}
    if "spalmatura_mesi" not in cols_ff:
        cur.execute("ALTER TABLE fe_fatture ADD COLUMN spalmatura_mesi INTEGER")
        print("  [135] aggiunta fe_fatture.spalmatura_mesi")
    else:
        print("  [135] fe_fatture.spalmatura_mesi già presente")
    if "spalmatura_data_inizio" not in cols_ff:
        cur.execute("ALTER TABLE fe_fatture ADD COLUMN spalmatura_data_inizio TEXT")
        print("  [135] aggiunta fe_fatture.spalmatura_data_inizio")
    else:
        print("  [135] fe_fatture.spalmatura_data_inizio già presente")

    # Indici per filtro veloce nel service CE
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_sf_spalmatura "
        "ON cg_spese_fisse(spalmatura_mesi, spalmatura_data_inizio)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ff_spalmatura "
        "ON fe_fatture(spalmatura_mesi, spalmatura_data_inizio)"
    )
    print("  [135] indici creati")
    print("  [135] DONE")
