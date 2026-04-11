"""
Migrazione 061: Esclude automaticamente i fornitori "non-fattura" importati da FIC

Marco ha segnalato (problemi.md A1) che Fatture in Cloud importa come "fatture"
alcune registrazioni che NON sono vere fatture elettroniche — sono entry di
cassa/prima nota, tipicamente affitti, che in FIC vengono create senza numero
di documento e senza P.IVA del fornitore. Casi concreti:
  - CATTANEO SILVIA (affitto locale, 26 record)
  - BANA MARIA DOLORES (affitto locale, 26 record)
  - PONTIGGIA (1 record, forse isolato)

Query diagnostica:
  SELECT fornitore_nome, COUNT(*) FROM fe_fatture
  WHERE (numero_fattura IS NULL OR numero_fattura = '')
    AND (fornitore_piva IS NULL OR fornitore_piva = '')
    AND fonte = 'fic'
  GROUP BY fornitore_nome;

Strategia:
1. Trova tutti i fornitori che hanno almeno 1 record fe_fatture con
   `numero_fattura = '' AND fornitore_piva = '' AND fonte = 'fic'`
2. INSERT/UPDATE in fe_fornitore_categoria con escluso_acquisti=1 e un
   motivo_esclusione descrittivo
3. I record storici restano in fe_fatture (preserva i link cg_uscite esistenti)
   ma vengono automaticamente filtrati dalle dashboard Acquisti/KPI grazie al
   filtro esistente `COALESCE(fc.escluso_acquisti, 0) = 0` in fe_import.py

NOTA: l'esclusione è a livello di (fornitore_nome, fornitore_piva). Se un
giorno Cattaneo emettesse una vera fattura elettronica con P.IVA, quella avrà
una riga fe_fornitore_categoria distinta (via matching per P.IVA) e non
verrà esclusa.

La migrazione è idempotente: se non trova nuovi fornitori, non fa nulla.
"""


def upgrade(conn):
    cur = conn.cursor()

    # 1. Verifica che la tabella fe_fornitore_categoria esista (dovrebbe)
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='fe_fornitore_categoria'
    """)
    if not cur.fetchone():
        print("  Migrazione 061: fe_fornitore_categoria non esiste, skip")
        return 0

    # 2. Trova fornitori con almeno 1 fattura fittizia
    cur.execute("""
        SELECT fornitore_nome, COUNT(*) as n, SUM(COALESCE(totale_fattura,0)) as tot
        FROM fe_fatture
        WHERE (numero_fattura IS NULL OR numero_fattura = '')
          AND (fornitore_piva IS NULL OR fornitore_piva = '')
          AND fonte = 'fic'
        GROUP BY fornitore_nome
        HAVING n >= 1
    """)
    fornitori_fittizi = cur.fetchall()

    if not fornitori_fittizi:
        print("  Migrazione 061: nessun fornitore fittizio trovato, skip")
        return 0

    total_excluded = 0
    motivo = "Non-fattura importata da FIC (senza numero né P.IVA, probabile affitto/spesa cassa)"

    for nome, n_rec, _tot in fornitori_fittizi:
        # Check se esiste già una riga in fe_fornitore_categoria per questo
        # fornitore (fornitore_piva NULL/empty, match per nome)
        existing = cur.execute("""
            SELECT id, escluso_acquisti FROM fe_fornitore_categoria
            WHERE fornitore_nome = ?
              AND (fornitore_piva IS NULL OR fornitore_piva = '')
        """, (nome,)).fetchone()

        if existing:
            if existing[1] != 1:
                cur.execute("""
                    UPDATE fe_fornitore_categoria
                    SET escluso_acquisti = 1,
                        motivo_esclusione = COALESCE(motivo_esclusione, ?)
                    WHERE id = ?
                """, (motivo, existing[0]))
                total_excluded += 1
        else:
            cur.execute("""
                INSERT INTO fe_fornitore_categoria
                (fornitore_piva, fornitore_nome, escluso_acquisti, motivo_esclusione)
                VALUES (NULL, ?, 1, ?)
            """, (nome, motivo))
            total_excluded += 1

    conn.commit()
    print(f"  Migrazione 061: esclusi {total_excluded} fornitori con non-fatture FIC ({len(fornitori_fittizi)} totali nel pattern)")
    return total_excluded
