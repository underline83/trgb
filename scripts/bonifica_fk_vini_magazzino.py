#!/usr/bin/env python3
"""
Bonifica FK di vini_magazzino.sqlite3 (audit 2026-06-12 A2-02/A2-04/A2-10).

Ripunta le FK di 5 tabelle da vini_magazzino_legacy_20260518 / vini_magazzino_old
(tabelle archivio/fantasma del cutover v2) verso vini_bottiglie (la tabella dati
reale), cancella 1 cella orfana in matrice_celle (vino_id non più esistente),
e DROPpa le tabelle morte: vini_magazzino_legacy_20260518 e la zombie vini_magazzino.

SICUREZZA:
 - fa un backup timestamp del file PRIMA di toccarlo;
 - opera in un'unica transazione con foreign_keys=OFF;
 - verifica foreign_key_check (vuoto) + integrity_check ('ok') PRIMA del commit;
   se non tornano → ROLLBACK, il file resta identico (+ backup comunque presente).
 - Default: DRY-RUN (mostra cosa farebbe e fa rollback). Serve --apply per scrivere.

USO (sul VPS, con il BACKEND FERMO per evitare accessi concorrenti):
   sudo systemctl stop trgb-backend
   /home/marco/trgb/venv-trgb/bin/python scripts/bonifica_fk_vini_magazzino.py            # dry-run
   /home/marco/trgb/venv-trgb/bin/python scripts/bonifica_fk_vini_magazzino.py --apply     # esegue
   sudo systemctl start trgb-backend
"""
import argparse, os, shutil, sqlite3, sys, time

DEFAULT_DB = "locali/tregobbi/data/vini_magazzino.sqlite3"

# (nome_tabella, CREATE del *_new con FK verso vini_bottiglie, [indici da ricreare])
REBUILDS = [
    ("vini_magazzino_movimenti", """
        CREATE TABLE vini_magazzino_movimenti_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id     INTEGER NOT NULL,
            data_mov    TEXT NOT NULL,
            tipo        TEXT NOT NULL CHECK (tipo IN ('CARICO','SCARICO','VENDITA','RETTIFICA','MODIFICA')),
            qta         INTEGER NOT NULL DEFAULT 0,
            locazione   TEXT,
            note        TEXT,
            origine     TEXT,
            utente      TEXT,
            created_at  TEXT NOT NULL,
            prezzo_unitario REAL,
            FOREIGN KEY (vino_id) REFERENCES vini_bottiglie(id)
        )""",
     ["CREATE INDEX idx_vmm_vino_data ON vini_magazzino_movimenti (vino_id, data_mov)"]),
    ("vini_prezzi_storico", """
        CREATE TABLE vini_prezzi_storico_new (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id       INTEGER NOT NULL,
            campo         TEXT NOT NULL CHECK (campo IN ('EURO_LISTINO','PREZZO_CARTA','PREZZO_CALICE','SCONTO')),
            valore_prima  REAL,
            valore_dopo   REAL,
            utente        TEXT,
            origine       TEXT,
            note          TEXT,
            created_at    TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini_bottiglie(id) ON DELETE CASCADE
        )""",
     ["CREATE INDEX idx_vps_vino_data ON vini_prezzi_storico (vino_id, created_at DESC)"]),
    ("matrice_celle", """
        CREATE TABLE matrice_celle_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id     INTEGER NOT NULL,
            riga        INTEGER NOT NULL,
            colonna     INTEGER NOT NULL,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini_bottiglie(id),
            UNIQUE(riga, colonna)
        )""",
     ["CREATE INDEX idx_mc_vino ON matrice_celle (vino_id)"]),
    ("vini_ordini_pending", """
        CREATE TABLE vini_ordini_pending_new (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id      INTEGER NOT NULL UNIQUE,
            qta          INTEGER NOT NULL CHECK (qta > 0),
            data_ordine  TEXT NOT NULL,
            note         TEXT,
            utente       TEXT,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini_bottiglie(id) ON DELETE CASCADE
        )""",
     ["CREATE INDEX idx_vop_vino ON vini_ordini_pending (vino_id)"]),
    ("vini_magazzino_note", """
        CREATE TABLE vini_magazzino_note_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id     INTEGER NOT NULL,
            nota        TEXT NOT NULL,
            autore      TEXT,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini_bottiglie(id)
        )""",
     ["CREATE INDEX idx_vmn_vino ON vini_magazzino_note (vino_id)"]),
]
DROP_TABLES = ["vini_magazzino_legacy_20260518", "vini_magazzino"]  # legacy + zombie


def fk_summary(con):
    import collections
    return dict(collections.Counter((r[0], r[2]) for r in con.execute("PRAGMA foreign_key_check")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="scrive davvero (default: dry-run)")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        print(f"❌ DB non trovato: {args.db}"); sys.exit(2)

    con = sqlite3.connect(args.db)
    con.isolation_level = None  # controllo transazioni a mano
    if not con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vini_bottiglie'").fetchone():
        print("❌ vini_bottiglie assente: DB non in stato post-cutover. Interrompo."); sys.exit(2)

    print(f"DB: {args.db}")
    print("PRIMA — foreign_key_check:", fk_summary(con))
    orfane = con.execute("SELECT id, vino_id, riga, colonna FROM matrice_celle x "
                         "WHERE NOT EXISTS(SELECT 1 FROM vini_bottiglie b WHERE b.id=x.vino_id)").fetchall()
    print(f"celle matrice orfane da cancellare: {orfane}")

    backup = None
    if args.apply:
        backup = f"{args.db}.bonifica-bak-{time.strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(args.db, backup)
        print(f"backup creato: {backup}")

    con.execute("PRAGMA foreign_keys=OFF")
    con.execute("BEGIN")
    try:
        # 1) cancella celle matrice orfane (vino_id NOT NULL, non rimappabile)
        con.execute("DELETE FROM matrice_celle WHERE vino_id NOT IN (SELECT id FROM vini_bottiglie)")
        # 2) ricostruisci le 5 tabelle con FK -> vini_bottiglie
        for name, create_new, indexes in REBUILDS:
            con.execute(create_new)
            con.execute(f"INSERT INTO {name}_new SELECT * FROM {name}")
            con.execute(f"DROP TABLE {name}")
            con.execute(f"ALTER TABLE {name}_new RENAME TO {name}")
            for ix in indexes:
                con.execute(ix)
        # 3) droppa tabelle morte
        for t in DROP_TABLES:
            con.execute(f'DROP TABLE IF EXISTS "{t}"')

        # VERIFICA prima di committare
        fk = con.execute("PRAGMA foreign_key_check").fetchall()
        integ = con.execute("PRAGMA integrity_check").fetchone()[0]
        print("DOPO  — foreign_key_check:", fk_summary(con))
        print("integrity_check:", integ)
        for name, _, _ in REBUILDS:
            print(f"  {name}: {con.execute(f'SELECT COUNT(*) FROM {name}').fetchone()[0]} righe")
        remaining = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND "
                                "name IN ('vini_magazzino','vini_magazzino_legacy_20260518')").fetchall()

        if fk or integ != "ok" or remaining:
            con.execute("ROLLBACK")
            print(f"❌ VERIFICA FALLITA (fk={len(fk)}, integ={integ}, restano={remaining}) → ROLLBACK, file invariato.")
            sys.exit(1)

        if args.apply:
            con.execute("COMMIT")
            con.execute("PRAGMA foreign_keys=ON")
            print("✅ COMMIT — bonifica applicata. Backup:", backup)
        else:
            con.execute("ROLLBACK")
            print("✅ DRY-RUN ok: tutto verificato, nessuna scrittura. Rilancia con --apply per applicare.")
    except Exception as e:
        con.execute("ROLLBACK")
        print("❌ errore, ROLLBACK:", e); sys.exit(1)
    finally:
        con.close()


if __name__ == "__main__":
    main()
