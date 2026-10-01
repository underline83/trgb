# Modulo: cucina (selezioni) — [core]
"""
Migrazione 177 — formaggi_tagli: ordine di servizio, base/alternativa, link ingrediente (2026-10-01)

Colonne nuove su `formaggi_tagli` (foodcost.db), tutte NULLABLE:

  - posizione          INTEGER  → ordine di servizio, dal piu' delicato al piu' intenso.
                                  La lista /formaggi/ ordina per questo campo.
  - ruolo              TEXT     → 'base' (nel tagliere standard) | 'alternativa'
                                  (sostituisce il formaggio del posto indicato).
  - alternativa_di_id  INTEGER  → per ruolo='alternativa': id del formaggio base
                                  che sostituisce (stesso posto).
  - ingredient_id      INTEGER  → collegamento opzionale a `ingredients` (modulo
                                  ricette). Il costo si legge da li' (prezzo corrente,
                                  servizio platform prezzi_ingredienti). Si collega
                                  quando l'ingrediente esiste, di solito all'arrivo
                                  della prima fattura del fornitore.

ADD COLUMN nullable + UPDATE esplicito per il backfill di `ruolo` (vedi incidente
mig 142: ADD COLUMN NOT NULL DEFAULT non popola le righe esistenti).

Idempotente: ALTER in try/except, indici creati solo se assenti.
"""


def _add_column(cur, sql: str, nome: str):
    try:
        cur.execute(sql)
        print(f"  + formaggi_tagli.{nome} aggiunta")
    except Exception as e:
        print(f"  ~ formaggi_tagli.{nome} gia' presente o tabella mancante: {e}")


def _ensure_index(cur, nome: str, sql: str):
    row = cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?", (nome,)
    ).fetchone()
    if row:
        return
    try:
        cur.execute(sql)
        print(f"  + {nome} creato")
    except Exception as e:
        print(f"  ~ {nome}: {e}")


def upgrade(conn):
    cur = conn.cursor()

    tab = cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='formaggi_tagli'"
    ).fetchone()
    if not tab:
        print("  [177] formaggi_tagli non esiste — saltata")
        return

    _add_column(cur, "ALTER TABLE formaggi_tagli ADD COLUMN posizione INTEGER", "posizione")
    _add_column(cur, "ALTER TABLE formaggi_tagli ADD COLUMN ruolo TEXT", "ruolo")
    _add_column(cur, "ALTER TABLE formaggi_tagli ADD COLUMN alternativa_di_id INTEGER", "alternativa_di_id")
    _add_column(cur, "ALTER TABLE formaggi_tagli ADD COLUMN ingredient_id INTEGER", "ingredient_id")

    # Backfill: i formaggi esistenti sono tutti "base" finche' non si dice altro.
    cur.execute("UPDATE formaggi_tagli SET ruolo = 'base' WHERE ruolo IS NULL")
    print(f"  + ruolo='base' su {cur.rowcount} righe esistenti")

    _ensure_index(cur, "idx_formaggi_posizione",
                  "CREATE INDEX idx_formaggi_posizione ON formaggi_tagli(posizione)")
    _ensure_index(cur, "idx_formaggi_ingredient",
                  "CREATE INDEX idx_formaggi_ingredient ON formaggi_tagli(ingredient_id)")

    print("  mig 177 formaggi posizione/ruolo/alternativa/ingrediente pronta")
