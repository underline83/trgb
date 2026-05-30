"""
Migrazione 139 — Reset di STATO_RIORDINO='0' (Ordinato) stantio (2026-05-22)

CONTESTO:
  Prima di vini 3.61 il CARICO/RETTIFICA NON azzerava STATO_RIORDINO. Quindi
  un vino marcato "Ordinato" e poi effettivamente arrivato (e magari già
  rivenduto) restava marcato "Ordinato" all'infinito — scomparendo dal widget
  "vini senza giacenza" della dashboard, che esclude per design gli Ordinati
  ("ordine già piazzato, non urgente alertarlo"). Segnalato da Marco
  2026-05-22 con esempio ID 1239 (Pinot Nero Alto Adige, Sogegross).

EURISTICA (opzione B confermata da Marco):
  Si resetta a NULL STATO_RIORDINO per tutti i vini che hanno '0' MA NON
  hanno una riga corrispondente in `vini_ordini_pending`. Se "Ordinato" non
  ha un pending dietro, è quasi certamente stantio (l'arrivo è già stato
  fatto, il pending è stato cancellato, ma lo stato non è stato azzerato).
  Falso positivo possibile: solo i casi rari in cui qualcuno ha settato
  manualmente "Ordinato" SENZA creare un pending — caso edge accettato.

LOG:
  Ogni reset genera anche un movimento 'MODIFICA' nello storico del vino
  con origine='MIG-139-CLEANUP' e utente='migration-139', così la transizione
  resta tracciata.

BACKUP:
  Copia esplicita di vini_magazzino.sqlite3 con suffisso .pre-mig139-<ts>
  prima di qualunque UPDATE.

IDEMPOTENZA:
  Rieseguibile: la prima volta resetta N, la seconda 0.

DB: vini_magazzino.sqlite3 (locale-aware).
"""

import sqlite3
import shutil
from datetime import datetime
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [139] vini_magazzino.sqlite3 non esiste, skip")
        return

    # Apri connessione al DB vini (la `conn` passata dal runner è foodcost.db)
    mag = sqlite3.connect(VINI_MAG_DB)
    mag.row_factory = sqlite3.Row
    try:
        cur = mag.cursor()

        # Verifica tabelle attese
        tabs = {
            r[0]
            for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "vini_bottiglie" not in tabs:
            print("  [139] tabella vini_bottiglie non presente, skip")
            return
        if "vini_ordini_pending" not in tabs:
            print("  [139] tabella vini_ordini_pending non presente, skip")
            return

        # Conta i candidati al reset
        candidati = cur.execute(
            """
            SELECT id FROM vini_bottiglie
            WHERE STATO_RIORDINO = '0'
              AND id NOT IN (SELECT vino_id FROM vini_ordini_pending)
            """
        ).fetchall()
        n = len(candidati)
        print(f"  [139] vini con STATO_RIORDINO='0' SENZA ordine pending: {n}")
        if n == 0:
            print("  [139] nessun reset da fare, skip pulito")
            return

        # Backup file PRIMA di qualsiasi modifica
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = VINI_MAG_DB.parent / f"{VINI_MAG_DB.name}.pre-mig139-{ts}"
        shutil.copy2(VINI_MAG_DB, backup_path)
        print(f"  [139] backup creato: {backup_path.name}")

        now = datetime.now().isoformat(timespec="seconds")

        # Reset di STATO_RIORDINO + log MODIFICA per ciascun vino
        for r in candidati:
            vino_id = r["id"]
            cur.execute(
                "UPDATE vini_bottiglie SET STATO_RIORDINO = NULL, UPDATED_AT = ? WHERE id = ?;",
                (now, vino_id),
            )
            cur.execute(
                """INSERT INTO vini_magazzino_movimenti
                       (vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at)
                   VALUES (?, ?, 'MODIFICA', 0, NULL, ?, 'MIG-139-CLEANUP', 'migration-139', ?);""",
                (
                    vino_id,
                    now,
                    "STATO_RIORDINO: 0 (Ordinato) → — (cleanup orfani senza ordine pending)",
                    now,
                ),
            )

        mag.commit()
        print(f"  [139] reset eseguito su {n} vini (+ {n} log MODIFICA).")
    finally:
        mag.close()


if __name__ == "__main__":
    # Esecuzione standalone (debug locale): apre DB foodcost fittizio inutile
    upgrade(None)
