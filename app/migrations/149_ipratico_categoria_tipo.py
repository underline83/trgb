"""
Migrazione 149: mapping categorie iPratico → tipo vendita (C2 / G.3.4).

Per la "Ripartizione vendite" nel Conto Economico: ogni categoria del file
mensile iPratico viene classificata in un tipo gestionale. Mapping deciso da
Marco il 2026-07-12:
  FOOD    = Antipasti, Primi, Secondi, Contorni, Dolci, Speciali, Pranzo,
            Degustazioni (menu degustazione = cucina)
  VINO    = Bottiglie, Calici (vista unica, decisione PO)
  BEVANDE = Bevande, Alcolici, Birre (caffè sta dentro Bevande)
  COPERTO = BATTUTA SINGOLA (tasto prezzo libero: in pratica il coperto
            "Servizio, pane e stuzzico" €5; contiene anche rari acconti
            eventi/asporto — accettato in v1 a livello categoria)
  ALTRO   = Vendita
  IGNORA  = Servizio (1.6k battute a €0, rumore)

La tabella è editabile via endpoint /controllo-gestione/ipratico-tipi (+ UI nel
CE): categorie nuove non mappate compaiono come DA_CLASSIFICARE nel CE, mai
perse in silenzio. Idempotente (INSERT OR IGNORE), nessun dato toccato.
"""

TIPI_SEED = {
    "Antipasti": "FOOD", "Primi": "FOOD", "Secondi": "FOOD",
    "Contorni": "FOOD", "Dolci": "FOOD", "Speciali": "FOOD",
    "Pranzo": "FOOD", "Degustazioni": "FOOD",
    "Bottiglie": "VINO", "Calici": "VINO",
    "Bevande": "BEVANDE", "Alcolici": "BEVANDE", "Birre": "BEVANDE",
    "BATTUTA SINGOLA": "COPERTO",
    "Vendita": "ALTRO",
    "Servizio": "IGNORA",
}


def upgrade(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ipratico_categoria_tipo (
            categoria  TEXT PRIMARY KEY,
            tipo       TEXT NOT NULL CHECK (
                tipo IN ('FOOD','VINO','BEVANDE','COPERTO','ALTRO','IGNORA')
            ),
            updated_at TEXT DEFAULT (datetime('now'))
        )
        """
    )
    for cat, tipo in TIPI_SEED.items():
        conn.execute(
            "INSERT OR IGNORE INTO ipratico_categoria_tipo (categoria, tipo) VALUES (?, ?)",
            (cat, tipo),
        )
    conn.commit()
    n = conn.execute("SELECT COUNT(*) FROM ipratico_categoria_tipo").fetchone()[0]
    print(f"  ✔ ipratico_categoria_tipo pronta ({n} categorie mappate)")
