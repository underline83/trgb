# @version: v1.0
# Migrazione 011 — Aggiunge tipo_documento e flag autofattura a fe_fatture
#
# Il TipoDocumento FatturaPA indica la natura del documento:
# TD01 = fattura normale, TD04 = nota credito,
# TD16-TD19 = autofatture (reverse charge, intra-UE, ecc.)
#
# Le autofatture hanno il CedentePrestatore = noi stessi,
# quindi il fornitore_nome risulta essere la nostra azienda.
# Con questo flag possiamo filtrarle nella UI.


def upgrade(conn):
    cur = conn.cursor()

    for col in [
        "tipo_documento TEXT",       # TD01, TD04, TD16, TD17, TD18, TD19, ecc.
        "is_autofattura INTEGER DEFAULT 0",  # 1 se TD16-TD19, TD20, TD21, TD27
    ]:
        try:
            cur.execute(f"ALTER TABLE fe_fatture ADD COLUMN {col}")
        except Exception:
            pass  # colonna esiste gia'

    # Backfill: marca come autofattura le fatture dove il fornitore e' noi stessi
    # Osteria Tre Gobbi / Tre Gobbi SRL con le varie P.IVA note
    TRE_GOBBI_PIVAS = ("05006900962", "10209790152", "08245660017")
    placeholders = ",".join("?" for _ in TRE_GOBBI_PIVAS)
    cur.execute(
        f"""
        UPDATE fe_fatture
        SET is_autofattura = 1
        WHERE fornitore_piva IN ({placeholders})
           OR UPPER(fornitore_nome) LIKE '%TRE GOBBI%'
        """,
        TRE_GOBBI_PIVAS,
    )
    n_marked = cur.execute("SELECT changes()").fetchone()[0]
    if n_marked > 0:
        print(f"  [011] Marcate {n_marked} fatture come autofattura (Tre Gobbi)")

    conn.commit()
