"""
Migrazione 131 — Riclassifica tasse arretrate (2026-05-16)

CONTESTO:
  Bug semantico scoperto durante verifica Fase D di G.3 (Conto Economico).
  In cg_spese_fisse il tipo='TASSA' veniva usato indistintamente per:
    (a) Tasse correnti del mese (F24 mensili, IVA trimestrale, IMU ecc.) →
        DEVONO entrare in competenza nel mese di riferimento.
    (b) Rateizzazioni di cartelle/F24 di anni precedenti (es. "Rateizzazione
        Abaco — atto 0075330", "Rateizzazione Fondo Est") → NON DEVONO entrare
        in competenza del mese corrente: sono pagamenti diluiti di debiti
        passati, gonfiano il costo del mese e distorcono l'utile netto.

  Decisione presa con Marco (2026-05-16):
    "Tassa è un flag sbagliato, potrebbe crearci problemi. Se la tassa è
    di quel mese dovrebbe essere inclusa. La separerei da rateizzazione
    per averne controllo: tipo RATEIZZAZIONE_TASSE."

  Quindi: nuovo tipo dedicato `RATEIZZAZIONE_TASSE`, distinto sia da TASSA
  (correnti del mese) sia da RATEIZZAZIONE (genericamente debiti diluiti
  non-tassa, es. mutui di scaduta).

OBIETTIVO MIGRAZIONE:
  Identificare nei dati attuali i record `cg_spese_fisse` con tipo='TASSA'
  che in realtà sono rateizzazioni pregresse e riclassificarli a
  `RATEIZZAZIONE_TASSE`.

  Criterio identificazione (case-insensitive sul titolo):
    - Titolo contiene "rateizzazione" → è una rata di una cartella/F24
      pregresso → diventa RATEIZZAZIONE_TASSE.
    - Altri pattern espliciti osservati: "abaco" (riscossione),
      "rottamazione", "definizione agevolata", "saldo e stralcio".

  Record reali osservati nel DB (foodcost.db) al 2026-05-16:
    id=22 "Rateizzazione Abaco — atto 0075330"  tipo=TASSA → RATEIZZAZIONE_TASSE
    id=23 "Rateizzazione Fondo Est"              tipo=TASSA → RATEIZZAZIONE_TASSE

  (Fondo Est tecnicamente è sanità integrativa, non tassa. Ma in produzione
  è entrato con tipo=TASSA e nel suo essere "rateizzazione" rientra qui.
  Marco può sempre rifinire manualmente da UI dopo).

LOGICA:
  - Match case-insensitive su `titolo` con LIKE su pattern noti.
  - Filtro tipo='TASSA' (non tocca record già a TASSA o RATEIZZAZIONE).
  - Idempotente: re-run = no-op (i record riclassificati hanno
    tipo='RATEIZZAZIONE_TASSE', non più 'TASSA').

DB: foodcost.db. Re-run safe.
"""
import sqlite3


# Pattern (LIKE, case-insensitive) che identificano una rateizzazione
# pregressa di tasse/cartelle. Tutti applicati in OR.
PATTERN_RATEIZZAZIONE = [
    "%rateizzazione%",          # cattura "Rateizzazione Abaco", "Rateizzazione Fondo Est"
    "%abaco%",                  # agenzia riscossione locale
    "%rottamazione%",           # rottamazione cartelle
    "%definizione agevolata%",  # def. agevolata
    "%saldo e stralcio%",       # condono
]


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db (passata dal runner)."""
    cur = conn.cursor()

    # ── 1. Diagnostica pre ──
    # Trova candidati: tipo='TASSA' e titolo matcha almeno un pattern.
    candidates_sql = """
        SELECT id, titolo
        FROM cg_spese_fisse
        WHERE tipo = 'TASSA'
          AND (
            """ + " OR ".join(["LOWER(titolo) LIKE ?"] * len(PATTERN_RATEIZZAZIONE)) + """
          )
        ORDER BY id
    """
    candidates = cur.execute(candidates_sql, PATTERN_RATEIZZAZIONE).fetchall()

    if not candidates:
        print("  [131] nessuna spesa fissa TASSA da riclassificare — no-op")
        return

    print(f"  [131] trovati {len(candidates)} record TASSA da riclassificare:")
    for row in candidates:
        print(f"        id={row[0]}: '{row[1]}'")

    # ── 2. UPDATE in batch ──
    # Riusa il filtro: tipo='TASSA' + match titolo. Aggiorna anche
    # categoria_id verso TASSE E IMPOSTE (id presente da mig 129).
    cat_id_row = cur.execute(
        "SELECT id FROM fe_categorie WHERE nome = 'TASSE E IMPOSTE' LIMIT 1"
    ).fetchone()
    cat_id = cat_id_row[0] if cat_id_row else None

    update_sql = """
        UPDATE cg_spese_fisse
           SET tipo = 'RATEIZZAZIONE_TASSE'
        """ + (", categoria_id = ?" if cat_id else "") + """
         WHERE tipo = 'TASSA'
           AND (
            """ + " OR ".join(["LOWER(titolo) LIKE ?"] * len(PATTERN_RATEIZZAZIONE)) + """
          )
    """
    params = ([cat_id] if cat_id else []) + PATTERN_RATEIZZAZIONE
    cur.execute(update_sql, params)
    updated = cur.rowcount
    print(f"  [131]   riclassificati: {updated} record → tipo='RATEIZZAZIONE_TASSE'")
    if cat_id:
        print(f"  [131]   + categoria_id forzata a 'TASSE E IMPOSTE' (id={cat_id})")

    # ── 3. Diagnostica post ──
    post = cur.execute("""
        SELECT id, titolo, tipo, categoria_id
        FROM cg_spese_fisse
        WHERE tipo = 'RATEIZZAZIONE_TASSE'
        ORDER BY id
    """).fetchall()
    print(f"  [131] totale record con tipo='RATEIZZAZIONE_TASSE': {len(post)}")

    # Eventuali residui sospetti (TASSA + pattern che però non hanno fatto match)
    residui = cur.execute(candidates_sql, PATTERN_RATEIZZAZIONE).fetchall()
    if residui:
        print(f"  [131] ⚠ ATTENZIONE: {len(residui)} record TASSA ancora con pattern di rateizzazione")
        for r in residui:
            print(f"  [131]   id={r[0]}: '{r[1]}'")
    else:
        print(f"  [131] ✓ tutti i candidati TASSA→RATEIZZAZIONE_TASSE riclassificati")

    print("  [131] DONE")
