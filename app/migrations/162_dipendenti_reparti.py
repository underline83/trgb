"""
Migrazione 162: un dipendente può lavorare in più reparti — [core]

Marco (2026-08-03): «c'è un caso particolare (io) che posso lavorare sia in sala
che in cucina: prevedi la possibilità di flaggare da quel menu in modo da
utilizzare in entrambi gli orari».

`dipendenti.reparto_id` resta il reparto PRINCIPALE (colore, elenchi, tutto
quello che c'era prima). Questa tabella tiene i reparti IN PIÙ. Non duplica il
principale di proposito: due posti che dicono la stessa cosa divergono, e qui
il rischio sarebbe che una persona sparisca dal suo foglio.

Con questa tabella il foglio di un reparto mostra le persone del reparto
principale PIÙ quelle che lo hanno fra gli aggiuntivi, e — parte altrettanto
importante, in `turni_service` — ogni turno finisce nel foglio del reparto del
SUO TIPO (SALA-CENA nel foglio sala, CUCINA-PRANZO in quello cucina), non nel
foglio della persona: altrimenti chi lavora in due reparti si vedrebbe tutti i
turni duplicati in entrambi i fogli, con le ore contate due volte.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def upgrade(conn):
    dip_path = locale_data_path("dipendenti.sqlite3")
    dconn = sqlite3.connect(dip_path)
    try:
        dconn.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_reparti (
                dipendente_id INTEGER NOT NULL REFERENCES dipendenti(id) ON DELETE CASCADE,
                reparto_id    INTEGER NOT NULL REFERENCES reparti(id) ON DELETE CASCADE,
                created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (dipendente_id, reparto_id)
            )
        """)
        dconn.execute("""CREATE INDEX IF NOT EXISTS idx_dip_reparti_reparto
                         ON dipendenti_reparti(reparto_id)""")
        dconn.commit()
        print("  [162] dipendenti_reparti creata (reparti aggiuntivi)")
    finally:
        dconn.close()
