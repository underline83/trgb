"""
Migrazione 119 — Fix retroattivo data_scadenza buste paga (27→15) (2026-05-11)

CONTESTO:
  Mig 118 ha allineato `dipendenti.giorno_paga` da 27 a 15, ma le 9 buste
  paga caricate oggi 11/05 alle 19:32 (prima del fix mig 118) erano già state
  inserite in `cg_uscite` con `data_scadenza = '2026-05-27'`. Marco vuole 15/05.

  Inoltre la mig 118 nella sua prima versione non includeva l'UPDATE retroattivo;
  è stato aggiunto dopo che la 118 era già applicata sul VPS, quindi serve una
  nuova migrazione.

AZIONE:
  UPDATE su `cg_uscite` per STIPENDIO con data che termina in '-27' e non
  ancora pagate (stato non in PAGATO/PAGATO_MANUALE/PARZIALE): sostituisce
  il giorno con '15'.

Idempotente. Re-run no-op (le righe a -15 non vengono toccate).
"""
import sqlite3


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()
    cur.execute("""
        UPDATE cg_uscite
        SET data_scadenza = substr(data_scadenza, 1, 8) || '15',
            updated_at = CURRENT_TIMESTAMP
        WHERE tipo_uscita = 'STIPENDIO'
          AND substr(data_scadenza, 9, 2) = '27'
          AND stato NOT IN ('PAGATO', 'PAGATO_MANUALE', 'PARZIALE')
    """)
    n = cur.rowcount
    print(f"  [119] cg_uscite STIPENDIO scadenza 27→15 (non pagate): {n} righe")
    conn.commit()
    print("  [119] DONE")
