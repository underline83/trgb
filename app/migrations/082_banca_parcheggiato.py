"""
Migrazione 082: Campo 'parcheggiato' su banca_movimenti

Marco ha segnalato (S40-12) che servono azioni bulk nel workbench Flussi:
- **Parcheggia**: mettere in attesa movimenti che richiedono un'analisi
  successiva (es. bonifico incerto, movimento non urgente da risolvere
  in seguito). Stato persistente — il movimento sparisce dai suggerimenti
  e finisce in un tab dedicato.
- **Flagga senza match**: azione bulk locale (usa il meccanismo dismissed
  già esistente lato client).

Soluzione: aggiungere un flag `parcheggiato` + timestamp al movimento.
Lo stato è persistente tra le sessioni, l'utente può disparcheggiare quando
torna a lavorarci sopra.

Colonne aggiunte:
- `parcheggiato` INTEGER DEFAULT 0 — 0=attivo, 1=in attesa
- `parcheggiato_at` TEXT NULL — timestamp parcheggio
"""


def upgrade(conn):
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(banca_movimenti)")
    cols = {r[1] for r in cur.fetchall()}

    if "parcheggiato" not in cols:
        cur.execute("""
            ALTER TABLE banca_movimenti
            ADD COLUMN parcheggiato INTEGER DEFAULT 0
        """)

    if "parcheggiato_at" not in cols:
        cur.execute("""
            ALTER TABLE banca_movimenti
            ADD COLUMN parcheggiato_at TEXT
        """)

    # Indice parziale per il tab "Parcheggiati"
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_banca_mov_parcheggiato
        ON banca_movimenti(parcheggiato)
        WHERE parcheggiato = 1
    """)

    conn.commit()
    print("  Migrazione 082: aggiunto campo parcheggiato a banca_movimenti")
    return 1
