"""
Migrazione 161: un solo flag per gli intermittenti — [core]

Marco (2026-08-03): «in anagrafica avevamo già previsto il flag "trasmissione
dati telematici" che era quello che intendevo per contratto intermittente».

Due caselle per la stessa cosa sono un doppione che prima o poi diverge: una
persona spuntata di là e non di qua sparisce dalle comunicazioni senza che
nessuno se ne accorga. Quindi resta UNA sola casella, `intermittente`:
- il nome dice cosa è (contratto intermittente ex art. 15 D.Lgs 81/2015),
  mentre "trasmissione dati telematici" descriveva un mezzo, non un fatto;
- è il campo su cui girano service, checker M.F, router e documentazione.

Questa migrazione **travasa i dati**: chi era spuntato come trasmissione
telematica diventa intermittente. Sono le persone giuste — al momento del
travaso erano 4, tutte con `a_chiamata=1` e codice fiscale presente.

La colonna `trasmissione_telematica` **non viene rimossa**: niente DDL
distruttivo su un DB di produzione (regola del progetto). Resta lì, non più
letta né scritta da nessuno; l'anagrafica non la mostra più.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    dip_path = locale_data_path("dipendenti.sqlite3")
    dconn = sqlite3.connect(dip_path)
    try:
        cols = [r[1] for r in dconn.execute("PRAGMA table_info(dipendenti)")]
        if "trasmissione_telematica" not in cols or "intermittente" not in cols:
            print("  [161] colonne non presenti — niente da travasare")
            return

        cur = dconn.execute(
            """
            UPDATE dipendenti
               SET intermittente = 1
             WHERE COALESCE(trasmissione_telematica, 0) = 1
               AND COALESCE(intermittente, 0) = 0
            """
        )
        dconn.commit()
        totale = dconn.execute(
            "SELECT COUNT(*) FROM dipendenti WHERE COALESCE(intermittente,0) = 1"
        ).fetchone()[0]
        print(f"  [161] travasati {cur.rowcount} flag → intermittenti totali: {totale}")
    finally:
        dconn.close()
