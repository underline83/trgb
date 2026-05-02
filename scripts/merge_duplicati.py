#!/usr/bin/env python3
"""
Merge duplicati FIC/XML nel database fatture.
Eseguire direttamente sul server:
  python3 scripts/merge_duplicati.py
"""
# TODO R6.5: utility one-shot. DB_PATH hardcoded ad app/data/.
# Sostituire con locale_data_path("foodcost.db") se rilanciato.
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "data", "foodcost.db")
DB_PATH = os.path.abspath(DB_PATH)

print(f"DB: {DB_PATH}")

conn = sqlite3.connect(DB_PATH, timeout=30)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA journal_mode=WAL")
cur = conn.cursor()

# Conta prima
cnt_before = cur.execute("SELECT COUNT(*) FROM fe_fatture").fetchone()[0]
print(f"Fatture totali prima: {cnt_before}")

cur.execute("""
    SELECT id, fornitore_piva, fornitore_nome, data_fattura, totale_fattura, xml_hash
    FROM fe_fatture WHERE COALESCE(fonte,'xml')='fic'
""")
fic_list = [dict(r) for r in cur.fetchall()]
print(f"Fatture FIC: {len(fic_list)}")

merged = 0
righe_tot = 0
skipped = 0
errors = 0

for fic in fic_list:
    if not fic["fornitore_piva"] or fic["totale_fattura"] is None:
        continue

    # Se la FIC ha gia' xml_hash, skip
    if fic["xml_hash"]:
        continue

    cur.execute("""
        SELECT id, xml_hash, xml_filename, numero_fattura,
               tipo_documento, is_autofattura
        FROM fe_fatture
        WHERE fornitore_piva = ?
          AND data_fattura = ?
          AND ABS(totale_fattura - ?) < 0.02
          AND COALESCE(fonte,'xml') = 'xml'
          AND xml_hash IS NOT NULL
          AND id != ?
        LIMIT 1
    """, (fic["fornitore_piva"], fic["data_fattura"], fic["totale_fattura"], fic["id"]))
    xml = cur.fetchone()
    if not xml:
        continue

    xml_id = xml["id"]
    fic_id = fic["id"]

    # Salva i valori XML prima di cancellare
    xml_hash = xml["xml_hash"]
    xml_filename = xml["xml_filename"]
    xml_numero = xml["numero_fattura"]
    xml_tipo = xml["tipo_documento"]
    xml_auto = xml["is_autofattura"]

    try:
        # Step 1: Sposta righe da XML a FIC (se FIC non ne ha)
        fic_righe = cur.execute("SELECT COUNT(*) AS c FROM fe_righe WHERE fattura_id=?", (fic_id,)).fetchone()["c"]
        xml_righe = cur.execute("SELECT COUNT(*) AS c FROM fe_righe WHERE fattura_id=?", (xml_id,)).fetchone()["c"]

        if fic_righe == 0 and xml_righe > 0:
            cur.execute("UPDATE fe_righe SET fattura_id=? WHERE fattura_id=?", (fic_id, xml_id))
            righe_tot += xml_righe

        # Step 2: PRIMA cancella la copia XML (libera il vincolo UNIQUE su xml_hash)
        cur.execute("DELETE FROM fe_righe WHERE fattura_id=?", (xml_id,))
        cur.execute("DELETE FROM fe_fatture WHERE id=?", (xml_id,))

        # Step 3: POI aggiorna la FIC con i metadati XML (ora xml_hash e' libero)
        cur.execute("""
            UPDATE fe_fatture SET
                xml_hash=?, xml_filename=?,
                numero_fattura=CASE WHEN numero_fattura IS NULL OR numero_fattura='' THEN ? ELSE numero_fattura END,
                tipo_documento=COALESCE(?, tipo_documento),
                is_autofattura=COALESCE(?, is_autofattura)
            WHERE id=?
        """, (xml_hash, xml_filename, xml_numero, xml_tipo, xml_auto, fic_id))

        merged += 1

        if merged % 50 == 0:
            conn.commit()
            print(f"  ... {merged} merged")

    except Exception as e:
        errors += 1
        if errors <= 10:
            print(f"  ERRORE fic={fic_id} xml={xml_id}: {e}")
        conn.rollback()

conn.commit()

cnt_after = cur.execute("SELECT COUNT(*) FROM fe_fatture").fetchone()[0]
dupes_left = cur.execute("""
    SELECT COUNT(*) FROM fe_fatture fic
    WHERE COALESCE(fic.fonte,'xml')='fic'
    AND EXISTS (
      SELECT 1 FROM fe_fatture xml
      WHERE xml.fornitore_piva = fic.fornitore_piva
      AND xml.data_fattura = fic.data_fattura
      AND ABS(xml.totale_fattura - fic.totale_fattura) < 0.02
      AND COALESCE(xml.fonte,'xml')='xml'
      AND xml.xml_hash IS NOT NULL
      AND xml.id != fic.id
    )
""").fetchone()[0]

conn.close()

print(f"\n=== RISULTATO ===")
print(f"Merged: {merged}")
print(f"Righe spostate: {righe_tot}")
print(f"Skipped (FIC gia con hash): {skipped}")
print(f"Errori: {errors}")
print(f"Fatture prima: {cnt_before} -> dopo: {cnt_after}")
print(f"Duplicati rimasti: {dupes_left}")
