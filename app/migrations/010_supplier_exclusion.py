# @version: v1.0
# Migrazione 010 — Flag esclusione fornitori (auto-fatture, duplicati)
#
# Aggiunge colonna 'escluso' a fe_fornitore_categoria per marcare
# fornitori che sono in realtà la propria azienda o da ignorare.
# Aggiunge anche 'alias_di' per gestire fornitori duplicati (merge).


def upgrade(conn):
    cur = conn.cursor()

    # --- Aggiungi colonna escluso a fe_fornitore_categoria ---
    for col in [
        "escluso INTEGER DEFAULT 0",
        "motivo_esclusione TEXT",   # es: 'auto-fattura', 'duplicato', 'test'
        "alias_di TEXT",            # P.IVA del fornitore principale (per merge)
    ]:
        try:
            cur.execute(f"ALTER TABLE fe_fornitore_categoria ADD COLUMN {col}")
        except Exception:
            pass  # colonna esiste gia'

    conn.commit()
