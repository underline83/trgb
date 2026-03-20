# @version: v1.4-aperte-calici-kpi
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Database Vini (Magazzino)
File: app/models/vini_magazzino_db.py

Gestisce:
- Tabella principale vini_magazzino
- Movimenti di magazzino (vini_magazzino_movimenti)
- Note per vino (vini_magazzino_note)

In v1.2:
- Aggiunto indice UNIQUE su id_excel per proteggere l'ID "storico" dal DB carta
- Aggiunta funzione upsert_vino_from_carta(data) per sincronizzare anagrafica/prezzi
  da app/data/vini.sqlite3 senza toccare giacenze, movimenti, note interne.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

DB_MAG_PATH = Path("app/data/vini_magazzino.sqlite3")


def get_magazzino_connection() -> sqlite3.Connection:
    DB_MAG_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_MAG_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def init_magazzino_database() -> None:
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # TABELLA PRINCIPALE
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS vini_magazzino (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            id_excel        INTEGER,

            -- Anagrafica base
            TIPOLOGIA       TEXT NOT NULL,
            NAZIONE         TEXT NOT NULL,
            CODICE          TEXT,
            REGIONE         TEXT,

            DESCRIZIONE     TEXT NOT NULL,
            DENOMINAZIONE   TEXT,
            ANNATA          TEXT,
            VITIGNI         TEXT,
            GRADO_ALCOLICO  REAL,
            FORMATO         TEXT,   -- es. BT, MG, DM, ecc.

            PRODUTTORE      TEXT,
            DISTRIBUTORE    TEXT,

            -- Prezzi
            PREZZO_CARTA    REAL,
            EURO_LISTINO    REAL,
            SCONTO          REAL,
            NOTE_PREZZO     TEXT,

            -- Flag di visibilità / export
            CARTA           TEXT CHECK (CARTA IN ('SI','NO') OR CARTA IS NULL),
            IPRATICO        TEXT CHECK (IPRATICO IN ('SI','NO') OR IPRATICO IS NULL),

            -- Stato vendite / conservazione / riordino
            STATO_VENDITA   TEXT,
            NOTE_STATO      TEXT,

            -- Magazzino: locazioni e quantità
            FRIGORIFERO     TEXT,
            QTA_FRIGO       INTEGER DEFAULT 0,

            LOCAZIONE_1     TEXT,
            QTA_LOC1        INTEGER DEFAULT 0,

            LOCAZIONE_2     TEXT,
            QTA_LOC2        INTEGER DEFAULT 0,

            LOCAZIONE_3     TEXT,
            QTA_LOC3        INTEGER DEFAULT 0,

            -- Totale (per ora gestito come campo dedicato per filtri veloci)
            QTA_TOTALE      INTEGER DEFAULT 0,

            -- Metadati
            NOTE            TEXT,
            CREATED_AT      TEXT,
            UPDATED_AT      TEXT
        );
        """
    )

    # Indici
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_vm_tipologia "
        "ON vini_magazzino (TIPOLOGIA);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_vm_regione "
        "ON vini_magazzino (REGIONE);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_vm_produttore "
        "ON vini_magazzino (PRODUTTORE);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_vm_descrizione "
        "ON vini_magazzino (DESCRIZIONE);"
    )

    # Indice UNIQUE su id_excel per proteggere l'ID storico (quando non NULL)
    try:
        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_vm_id_excel_unique "
            "ON vini_magazzino (id_excel);"
        )
    except sqlite3.OperationalError as e:
        # Se esistono già duplicati, l'indice fallisce:
        # lo segnaliamo a log ma non blocchiamo l'avvio.
        print("⚠️ Impossibile creare indice UNIQUE su id_excel:", e)

    # -----------------------------------------------------
    # MIGRAZIONI LEGGERISSIME (non distruttive)
    # -----------------------------------------------------
    cur.execute("PRAGMA table_info(vini_magazzino);")
    cols = [row[1] for row in cur.fetchall()]
    if "ANNATA" not in cols:
        cur.execute("ALTER TABLE vini_magazzino ADD COLUMN ANNATA TEXT;")
    if "DISCONTINUATO" not in cols:
        cur.execute(
            "ALTER TABLE vini_magazzino ADD COLUMN DISCONTINUATO TEXT "
            "CHECK (DISCONTINUATO IN ('SI','NO') OR DISCONTINUATO IS NULL);"
        )
    if "STATO_RIORDINO" not in cols:
        cur.execute(
            "ALTER TABLE vini_magazzino ADD COLUMN STATO_RIORDINO TEXT "
            "CHECK (STATO_RIORDINO IN ('D','O','0','A','X') OR STATO_RIORDINO IS NULL);"
        )
    if "STATO_CONSERVAZIONE" not in cols:
        cur.execute(
            "ALTER TABLE vini_magazzino ADD COLUMN STATO_CONSERVAZIONE TEXT "
            "CHECK (STATO_CONSERVAZIONE IN ('1','2','3') OR STATO_CONSERVAZIONE IS NULL);"
        )
    if "ORIGINE" not in cols:
        cur.execute(
            "ALTER TABLE vini_magazzino ADD COLUMN ORIGINE TEXT "
            "CHECK (ORIGINE IN ('EXCEL','MANUALE') OR ORIGINE IS NULL) "
            "DEFAULT NULL;"
        )
    if "RAPPRESENTANTE" not in cols:
        cur.execute("ALTER TABLE vini_magazzino ADD COLUMN RAPPRESENTANTE TEXT DEFAULT '';")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_vm_rappresentante ON vini_magazzino (RAPPRESENTANTE);")
    # Indice su DISTRIBUTORE (se non esiste)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vm_distributore ON vini_magazzino (DISTRIBUTORE);")

    # Bulk fix: assegna STATO_VENDITA a vini che non ce l'hanno
    # - Con giacenza > 0 → 'V' (vendere)
    # - Con giacenza 0  → 'C' (controllare / fuori catalogo)
    cur.execute("""
        UPDATE vini_magazzino
        SET STATO_VENDITA = 'V', UPDATED_AT = datetime('now')
        WHERE (STATO_VENDITA IS NULL OR STATO_VENDITA = '')
          AND QTA_TOTALE > 0;
    """)
    cur.execute("""
        UPDATE vini_magazzino
        SET STATO_VENDITA = 'C', UPDATED_AT = datetime('now')
        WHERE (STATO_VENDITA IS NULL OR STATO_VENDITA = '')
          AND (QTA_TOTALE IS NULL OR QTA_TOTALE = 0);
    """)

    # -----------------------------------------------------
    # TABELLA 'vini_magazzino_movimenti'
    # -----------------------------------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS vini_magazzino_movimenti (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id     INTEGER NOT NULL,
            data_mov    TEXT NOT NULL,
            tipo        TEXT NOT NULL CHECK (
                            tipo IN ('CARICO','SCARICO','VENDITA','RETTIFICA','MODIFICA')
                        ),
            qta         INTEGER NOT NULL DEFAULT 0,
            locazione   TEXT,
            note        TEXT,
            origine     TEXT,
            utente      TEXT,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id)
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_vmm_vino_data "
        "ON vini_magazzino_movimenti (vino_id, data_mov);"
    )

    # -----------------------------------------------------
    # TABELLA 'vini_magazzino_note'
    # -----------------------------------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS vini_magazzino_note (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id     INTEGER NOT NULL,
            nota        TEXT NOT NULL,
            autore      TEXT,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id)
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_vmn_vino "
        "ON vini_magazzino_note (vino_id);"
    )

    # -----------------------------------------------------
    # TABELLA 'locazioni_config'
    # Configurazione locazioni fisiche (frigoriferi, scaffali, etc.)
    # -----------------------------------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS locazioni_config (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            campo       TEXT NOT NULL,
            nome        TEXT NOT NULL,
            spazi       TEXT NOT NULL DEFAULT '[]',
            ordine      INTEGER NOT NULL DEFAULT 0,
            tipo        TEXT NOT NULL DEFAULT 'standard',
            righe       INTEGER,
            colonne     INTEGER,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );
        """
    )

    # Migrazione: aggiungi colonne tipo/righe/colonne se mancanti
    cur.execute("PRAGMA table_info(locazioni_config);")
    loc_cols = [row[1] for row in cur.fetchall()]
    if "tipo" not in loc_cols:
        cur.execute("ALTER TABLE locazioni_config ADD COLUMN tipo TEXT NOT NULL DEFAULT 'standard';")
    if "righe" not in loc_cols:
        cur.execute("ALTER TABLE locazioni_config ADD COLUMN righe INTEGER;")
    if "colonne" not in loc_cols:
        cur.execute("ALTER TABLE locazioni_config ADD COLUMN colonne INTEGER;")

    # -----------------------------------------------------
    # TABELLA 'matrice_celle'
    # Ogni cella della matrice contiene esattamente 1 bottiglia.
    # Il vincolo UNIQUE garantisce che ogni cella sia assegnata a un solo vino.
    # -----------------------------------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS matrice_celle (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id     INTEGER NOT NULL,
            riga        INTEGER NOT NULL,
            colonna     INTEGER NOT NULL,
            created_at  TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id),
            UNIQUE(riga, colonna)
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_mc_vino "
        "ON matrice_celle (vino_id);"
    )

    # Auto-migrazione: ricalcola LOCAZIONE_3 con formato (col,riga) per tutti i vini con celle matrice
    vino_ids_rows = cur.execute("SELECT DISTINCT vino_id FROM matrice_celle").fetchall()
    if vino_ids_rows:
        for row in vino_ids_rows:
            vid = row[0]
            celle_rows = cur.execute(
                "SELECT riga, colonna FROM matrice_celle WHERE vino_id = ? ORDER BY colonna, riga",
                (vid,),
            ).fetchall()
            qta = len(celle_rows)
            loc3_text = ", ".join(f"({r[1]},{r[0]})" for r in celle_rows) if celle_rows else None
            cur.execute(
                "UPDATE vini_magazzino SET LOCAZIONE_3 = ?, QTA_LOC3 = ? WHERE id = ?",
                (loc3_text, qta, vid),
            )
        print(f"✅ Matrice: ricalcolate coordinate (col,riga) per {len(vino_ids_rows)} vini")

    # Pulizia: se una locazione ha un testo ma quantità = 0, svuota il testo
    loc_pairs = [
        ("FRIGORIFERO", "QTA_FRIGO"),
        ("LOCAZIONE_1", "QTA_LOC1"),
        ("LOCAZIONE_2", "QTA_LOC2"),
        ("LOCAZIONE_3", "QTA_LOC3"),
    ]
    cleaned = 0
    for loc_col, qta_col in loc_pairs:
        res = cur.execute(
            f"UPDATE vini_magazzino SET {loc_col} = NULL "
            f"WHERE {loc_col} IS NOT NULL AND {loc_col} != '' "
            f"AND COALESCE({qta_col}, 0) = 0"
        )
        cleaned += res.rowcount
    if cleaned:
        print(f"✅ Pulizia: svuotate {cleaned} locazioni con quantità 0")

    # ----- Migration: aggiunge tipo MODIFICA al CHECK constraint -----
    # SQLite non supporta ALTER CHECK, quindi ricrea la tabella se necessario.
    try:
        cur.execute(
            "INSERT INTO vini_magazzino_movimenti "
            "(vino_id, data_mov, tipo, qta, origine, utente, created_at) "
            "VALUES (1, '1970-01-01T00:00:00', 'MODIFICA', 0, 'MIGRATION-TEST', 'system', '1970-01-01T00:00:00')"
        )
        # Se riesce, il constraint già accetta MODIFICA → elimina la riga di test
        cur.execute(
            "DELETE FROM vini_magazzino_movimenti "
            "WHERE origine = 'MIGRATION-TEST' AND data_mov = '1970-01-01T00:00:00'"
        )
    except sqlite3.IntegrityError:
        # CHECK fallito → bisogna ricreare la tabella con il nuovo constraint
        print("🔄 Migration: aggiunta tipo MODIFICA alla tabella movimenti...")
        cur.execute("ALTER TABLE vini_magazzino_movimenti RENAME TO _vmm_old;")
        cur.execute(
            """
            CREATE TABLE vini_magazzino_movimenti (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                vino_id     INTEGER NOT NULL,
                data_mov    TEXT NOT NULL,
                tipo        TEXT NOT NULL CHECK (
                                tipo IN ('CARICO','SCARICO','VENDITA','RETTIFICA','MODIFICA')
                            ),
                qta         INTEGER NOT NULL DEFAULT 0,
                locazione   TEXT,
                note        TEXT,
                origine     TEXT,
                utente      TEXT,
                created_at  TEXT NOT NULL,
                FOREIGN KEY (vino_id) REFERENCES vini_magazzino(id)
            );
            """
        )
        cur.execute(
            "INSERT INTO vini_magazzino_movimenti "
            "(id, vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at) "
            "SELECT id, vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at "
            "FROM _vmm_old;"
        )
        cur.execute("DROP TABLE _vmm_old;")
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_vmm_vino_data "
            "ON vini_magazzino_movimenti (vino_id, data_mov);"
        )
        print("✅ Migration completata: tipo MODIFICA disponibile")

    conn.commit()
    conn.close()


# ---------------------------------------------------------
# UTILITÀ INTERNE QTA
# ---------------------------------------------------------
def _recalc_qta_totale(conn: sqlite3.Connection, vino_id: int) -> None:
    """
    Ricalcola QTA_TOTALE come somma delle 4 colonne di magazzino.
    Se in futuro vorrai tenere QTA_TOTALE scollegata, basterà modificare qui.
    """
    cur = conn.cursor()
    row = cur.execute(
        """
        SELECT
            COALESCE(QTA_FRIGO, 0) AS qf,
            COALESCE(QTA_LOC1, 0) AS q1,
            COALESCE(QTA_LOC2, 0) AS q2,
            COALESCE(QTA_LOC3, 0) AS q3
        FROM vini_magazzino WHERE id = ?;
        """,
        (vino_id,),
    ).fetchone()

    if not row:
        return

    totale = row["qf"] + row["q1"] + row["q2"] + row["q3"]
    cur.execute(
        "UPDATE vini_magazzino SET QTA_TOTALE = ? WHERE id = ?;",
        (totale, vino_id),
    )
    conn.commit()


# ---------------------------------------------------------
# CRUD BASE VINO
# ---------------------------------------------------------
def create_vino(data: Dict[str, Any]) -> int:
    """
    Crea un nuovo vino in magazzino.
    'data' deve contenere le chiavi compatibili con le colonne della tabella
    (eccetto 'id', 'CREATED_AT', 'UPDATED_AT').
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    now = _now_iso()
    data = dict(data)  # copia locale
    data.setdefault("CREATED_AT", now)
    data.setdefault("UPDATED_AT", now)
    data.setdefault("ORIGINE", "MANUALE")

    columns = ", ".join(data.keys())
    placeholders = ", ".join(["?"] * len(data))
    values = list(data.values())

    cur.execute(
        f"INSERT INTO vini_magazzino ({columns}) VALUES ({placeholders});",
        values,
    )
    vino_id = cur.lastrowid

    # ricalcola totale se ci sono valori di magazzino
    _recalc_qta_totale(conn, vino_id)

    conn.close()
    return vino_id


def duplicate_vino(vino_id: int) -> int:
    """
    Duplica un vino esistente: copia tutti i campi anagrafici/prezzo/stato,
    azzera giacenze e locazioni, assegna nuovo id (ultimo+1).
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    try:
        row = cur.execute("SELECT * FROM vini_magazzino WHERE id = ?;", (vino_id,)).fetchone()
        if not row:
            raise ValueError(f"Vino {vino_id} non trovato")

        # Campi da NON copiare
        skip = {
            "id", "id_excel", "CREATED_AT", "UPDATED_AT", "ORIGINE",
            "FRIGORIFERO", "QTA_FRIGO",
            "LOCAZIONE_1", "QTA_LOC1",
            "LOCAZIONE_2", "QTA_LOC2",
            "LOCAZIONE_3", "QTA_LOC3",
            "QTA_TOTALE",
        }

        col_names = [desc[0] for desc in cur.description]
        data = {}
        for col in col_names:
            if col in skip:
                continue
            data[col] = row[col]

        now = _now_iso()
        data["CREATED_AT"] = now
        data["UPDATED_AT"] = now
        data["ORIGINE"] = "MANUALE"
        data["QTA_FRIGO"] = 0
        data["QTA_LOC1"] = 0
        data["QTA_LOC2"] = 0
        data["QTA_LOC3"] = 0
        data["QTA_TOTALE"] = 0

        columns = ", ".join(f'"{k}"' for k in data.keys())
        placeholders = ", ".join(["?"] * len(data))
        cur.execute(
            f"INSERT INTO vini_magazzino ({columns}) VALUES ({placeholders});",
            list(data.values()),
        )
        new_id = cur.lastrowid
        conn.commit()
        return new_id
    finally:
        conn.close()


def upsert_vino_from_carta(data: Dict[str, Any]) -> Optional[int]:
    """
    UPSERT di un vino di magazzino partendo dai dati della carta (DB vini).

    - Usa id_excel come chiave stabile (DEVE essere presente in data["id_excel"])
    - Se id_excel NON esiste  -> INSERT (nuovo vino, QTA_* iniziano da 0)
    - Se id_excel esiste      -> UPDATE SOLO anagrafica / prezzi / flag / note,
      lasciando intatte:
        - QTA_FRIGO / QTA_LOC* / QTA_TOTALE
        - eventuali NOTE interne già presenti
        - movimenti e note in tabelle collegate

    Restituisce l'id interno (PK) del vino interessato, oppure None se qualcosa va storto.
    """
    if "id_excel" not in data or data["id_excel"] is None:
        raise ValueError("upsert_vino_from_carta richiede sempre 'id_excel' valorizzato")

    conn = get_magazzino_connection()
    cur = conn.cursor()

    now = _now_iso()
    data = dict(data)  # copia

    data.setdefault("CREATED_AT", now)
    data.setdefault("UPDATED_AT", now)

    # Valori di default per campi anagrafici/gestionali
    for key in [
        "TIPOLOGIA", "NAZIONE", "REGIONE",
        "DESCRIZIONE", "DENOMINAZIONE", "ANNATA", "VITIGNI", "GRADO_ALCOLICO",
        "FORMATO", "PRODUTTORE", "DISTRIBUTORE",
        "PREZZO_CARTA", "EURO_LISTINO", "SCONTO", "NOTE_PREZZO",
        "CARTA", "IPRATICO",
        "STATO_VENDITA", "NOTE_STATO",
        "FRIGORIFERO",
        "LOCAZIONE_1", "LOCAZIONE_2", "LOCAZIONE_3",
        "NOTE",
    ]:
        data.setdefault(key, None)

    data.setdefault("ORIGINE", "EXCEL")

    cur.execute(
        """
        INSERT INTO vini_magazzino (
            id_excel,
            TIPOLOGIA, NAZIONE, REGIONE,
            DESCRIZIONE, DENOMINAZIONE, ANNATA, VITIGNI, GRADO_ALCOLICO,
            FORMATO, PRODUTTORE, DISTRIBUTORE,
            PREZZO_CARTA, EURO_LISTINO, SCONTO, NOTE_PREZZO,
            CARTA, IPRATICO,
            STATO_VENDITA, NOTE_STATO,
            FRIGORIFERO,
            LOCAZIONE_1, LOCAZIONE_2, LOCAZIONE_3,
            NOTE,
            ORIGINE,
            CREATED_AT, UPDATED_AT
        )
        VALUES (
            :id_excel,
            :TIPOLOGIA, :NAZIONE, :REGIONE,
            :DESCRIZIONE, :DENOMINAZIONE, :ANNATA, :VITIGNI, :GRADO_ALCOLICO,
            :FORMATO, :PRODUTTORE, :DISTRIBUTORE,
            :PREZZO_CARTA, :EURO_LISTINO, :SCONTO, :NOTE_PREZZO,
            :CARTA, :IPRATICO,
            :STATO_VENDITA, :NOTE_STATO,
            :FRIGORIFERO,
            :LOCAZIONE_1, :LOCAZIONE_2, :LOCAZIONE_3,
            :NOTE,
            :ORIGINE,
            :CREATED_AT, :UPDATED_AT
        )
        ON CONFLICT(id_excel) DO UPDATE SET
            TIPOLOGIA      = excluded.TIPOLOGIA,
            NAZIONE        = excluded.NAZIONE,
            REGIONE        = excluded.REGIONE,
            DESCRIZIONE    = excluded.DESCRIZIONE,
            DENOMINAZIONE  = excluded.DENOMINAZIONE,
            ANNATA         = excluded.ANNATA,
            VITIGNI        = excluded.VITIGNI,
            GRADO_ALCOLICO = excluded.GRADO_ALCOLICO,
            FORMATO        = excluded.FORMATO,
            PRODUTTORE     = excluded.PRODUTTORE,
            DISTRIBUTORE   = excluded.DISTRIBUTORE,
            PREZZO_CARTA   = excluded.PREZZO_CARTA,
            EURO_LISTINO   = excluded.EURO_LISTINO,
            SCONTO         = excluded.SCONTO,
            NOTE_PREZZO    = excluded.NOTE_PREZZO,
            CARTA          = excluded.CARTA,
            IPRATICO       = excluded.IPRATICO,
            STATO_VENDITA  = COALESCE(excluded.STATO_VENDITA, STATO_VENDITA),
            NOTE_STATO     = COALESCE(excluded.NOTE_STATO, NOTE_STATO),
            FRIGORIFERO    = excluded.FRIGORIFERO,
            LOCAZIONE_1    = excluded.LOCAZIONE_1,
            LOCAZIONE_2    = excluded.LOCAZIONE_2,
            LOCAZIONE_3    = excluded.LOCAZIONE_3,
            NOTE           = COALESCE(excluded.NOTE, NOTE),
            UPDATED_AT     = excluded.UPDATED_AT
        ;
        """,
        data,
    )

    conn.commit()

    # Se è un INSERT nuova, lastrowid contiene l'id;
    # se è un UPDATE, lo recuperiamo con una SELECT.
    if cur.lastrowid:
        vino_id: Optional[int] = cur.lastrowid
    else:
        row = cur.execute(
            "SELECT id FROM vini_magazzino WHERE id_excel = ?;",
            (data["id_excel"],),
        ).fetchone()
        vino_id = row["id"] if row else None

    conn.close()
    return vino_id


def update_vino(vino_id: int, data: Dict[str, Any]) -> None:
    """
    Aggiorna i campi di un vino esistente (solo quelli passati in 'data').
    """
    if not data:
        return

    conn = get_magazzino_connection()
    cur = conn.cursor()

    data = dict(data)
    data["UPDATED_AT"] = _now_iso()

    set_parts = [f"{k} = ?" for k in data.keys()]
    values = list(data.values())
    values.append(vino_id)

    cur.execute(
        f"UPDATE vini_magazzino SET {', '.join(set_parts)} WHERE id = ?;",
        values,
    )

    # se vengono toccate quantità delle locazioni, ricalcola totale
    if any(k in data for k in ("QTA_FRIGO", "QTA_LOC1", "QTA_LOC2", "QTA_LOC3")):
        _recalc_qta_totale(conn, vino_id)

    conn.commit()
    conn.close()


def bulk_update_vini(updates: List[Dict[str, Any]]) -> int:
    """
    Aggiorna più vini in un'unica transazione.
    Ogni elemento deve avere 'id' + i campi da aggiornare.
    Ritorna il numero di vini aggiornati.
    """
    if not updates:
        return 0

    conn = get_magazzino_connection()
    cur = conn.cursor()
    now = _now_iso()
    count = 0
    recalc_ids = []

    for item in updates:
        vino_id = item.get("id")
        if not vino_id:
            continue
        data = {k: v for k, v in item.items() if k != "id"}
        if not data:
            continue

        data["UPDATED_AT"] = now
        set_parts = [f"{k} = ?" for k in data.keys()]
        values = list(data.values())
        values.append(vino_id)

        cur.execute(
            f"UPDATE vini_magazzino SET {', '.join(set_parts)} WHERE id = ?;",
            values,
        )
        count += cur.rowcount

        if any(k in data for k in ("QTA_FRIGO", "QTA_LOC1", "QTA_LOC2", "QTA_LOC3")):
            recalc_ids.append(vino_id)

    for vid in recalc_ids:
        _recalc_qta_totale(conn, vid)

    conn.commit()
    conn.close()
    return count


def delete_vino(vino_id: int) -> bool:
    """
    Elimina un vino e tutti i suoi movimenti e note.
    Ritorna True se il vino esisteva, False altrimenti.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    row = cur.execute("SELECT id FROM vini_magazzino WHERE id = ?;", (vino_id,)).fetchone()
    if not row:
        conn.close()
        return False

    cur.execute("DELETE FROM vini_magazzino_movimenti WHERE vino_id = ?;", (vino_id,))
    cur.execute("DELETE FROM vini_magazzino_note WHERE vino_id = ?;", (vino_id,))
    cur.execute("DELETE FROM vini_magazzino WHERE id = ?;", (vino_id,))

    conn.commit()
    conn.close()
    return True


def get_vino_by_id(vino_id: int) -> Optional[sqlite3.Row]:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    row = cur.execute(
        "SELECT * FROM vini_magazzino WHERE id = ?;",
        (vino_id,),
    ).fetchone()
    conn.close()
    return row


def search_vini(
    vino_id: Optional[int] = None,
    text: Optional[str] = None,
    tipologia: Optional[str] = None,
    nazione: Optional[str] = None,
    produttore: Optional[str] = None,
    solo_in_carta: bool = False,
    min_qta: Optional[int] = None,
) -> List[sqlite3.Row]:
    """
    Ricerca vini in magazzino con alcuni filtri base.
    Verrà usata dal frontend per la lista / ricerca.
    - Se vino_id è valorizzato, filtra per id esatto.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    where = []
    params: List[Any] = []

    # 🔍 filtro per ID diretto (più veloce)
    if vino_id is not None:
        where.append("id = ?")
        params.append(vino_id)

    if text:
        where.append(
            "(DESCRIZIONE LIKE ? OR "
            "PRODUTTORE LIKE ? OR "
            "DENOMINAZIONE LIKE ?)"
        )
        like = f"%{text}%"
        params.extend([like, like, like])

    if tipologia:
        where.append("TIPOLOGIA = ?")
        params.append(tipologia)

    if nazione:
        where.append("NAZIONE = ?")
        params.append(nazione)

    if produttore:
        where.append("PRODUTTORE LIKE ?")
        params.append(f"%{produttore}%")

    if solo_in_carta:
        where.append("CARTA = 'SI'")

    if min_qta is not None:
        where.append("QTA_TOTALE >= ?")
        params.append(min_qta)

    where_sql = " WHERE " + " AND ".join(where) if where else ""
    sql = (
        "SELECT * FROM vini_magazzino"
        + where_sql
        + " ORDER BY TIPOLOGIA, NAZIONE, REGIONE, PRODUTTORE, DESCRIZIONE;"
    )

    rows = cur.execute(sql, params).fetchall()
    conn.close()
    return list(rows)


# ---------------------------------------------------------
# MAGAZZINO: QUANTITÀ PER LOCAZIONE
# ---------------------------------------------------------
def aggiorna_quantita_locazioni(
    vino_id: int,
    qta_frigo: Optional[int] = None,
    qta_loc1: Optional[int] = None,
    qta_loc2: Optional[int] = None,
    qta_loc3: Optional[int] = None,
) -> None:
    """
    Aggiorna le quantità delle singole locazioni (se fornite) e
    ricalcola QTA_TOTALE.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    fields: Dict[str, Any] = {}
    if qta_frigo is not None:
        fields["QTA_FRIGO"] = qta_frigo
    if qta_loc1 is not None:
        fields["QTA_LOC1"] = qta_loc1
    if qta_loc2 is not None:
        fields["QTA_LOC2"] = qta_loc2
    if qta_loc3 is not None:
        fields["QTA_LOC3"] = qta_loc3

    if not fields:
        conn.close()
        return

    fields["UPDATED_AT"] = _now_iso()

    set_parts = [f"{k} = ?" for k in fields.keys()]
    values = list(fields.values())
    values.append(vino_id)

    cur.execute(
        f"UPDATE vini_magazzino SET {', '.join(set_parts)} WHERE id = ?;",
        values,
    )
    conn.commit()

    _recalc_qta_totale(conn, vino_id)
    conn.close()


# ---------------------------------------------------------
# MOVIMENTI CANTINA
# ---------------------------------------------------------
MOVIMENTI_TIPI_VALIDI = {"CARICO", "SCARICO", "VENDITA", "RETTIFICA", "MODIFICA"}


LOCAZIONI_VALIDE = {"frigo", "loc1", "loc2", "loc3"}
LOCAZIONE_TO_COLUMN = {
    "frigo": "QTA_FRIGO",
    "loc1": "QTA_LOC1",
    "loc2": "QTA_LOC2",
    "loc3": "QTA_LOC3",
}


def registra_movimento(
    vino_id: int,
    tipo: str,
    qta: int,
    utente: str,
    locazione: Optional[str] = None,
    note: Optional[str] = None,
    origine: Optional[str] = "GESTIONALE",
    data_mov: Optional[str] = None,
) -> None:
    """
    Registra un movimento di cantina, aggiorna QTA_TOTALE e — se locazione
    è specificata — aggiorna anche la colonna QTA_<LOC> corrispondente.

    Locazioni valide: frigo, loc1, loc2, loc3
    Per VENDITA e SCARICO la locazione è obbligatoria (il frontend la impone).
    Per CARICO è facoltativa (se presente, incrementa la locazione).
    Per RETTIFICA non si usa locazione (è un valore assoluto globale).
    """
    if tipo not in MOVIMENTI_TIPI_VALIDI:
        raise ValueError(f"Tipo movimento non valido: {tipo}")

    if qta <= 0:
        raise ValueError("La quantità qta deve essere > 0")

    # Normalizza locazione
    loc = locazione.strip().lower() if locazione else None
    if loc and loc not in LOCAZIONI_VALIDE:
        raise ValueError(f"Locazione non valida: {locazione}. Valide: {', '.join(sorted(LOCAZIONI_VALIDE))}")

    # Per VENDITA e SCARICO, locazione obbligatoria
    if tipo in ("VENDITA", "SCARICO") and not loc:
        raise ValueError(f"Per movimenti di tipo {tipo} la locazione è obbligatoria.")

    if data_mov is None:
        data_mov = _now_iso()

    created_at = _now_iso()

    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Legge il vino con tutte le QTA
    row = cur.execute(
        """SELECT COALESCE(QTA_TOTALE, 0) AS q,
                  COALESCE(QTA_FRIGO, 0) AS qf,
                  COALESCE(QTA_LOC1, 0) AS q1,
                  COALESCE(QTA_LOC2, 0) AS q2,
                  COALESCE(QTA_LOC3, 0) AS q3
           FROM vini_magazzino WHERE id = ?;""",
        (vino_id,),
    ).fetchone()

    if not row:
        conn.close()
        raise ValueError(f"Vino id={vino_id} non trovato")

    qta_attuale = row["q"]

    # Calcolo nuova QTA_TOTALE
    if tipo == "CARICO":
        nuova_qta = qta_attuale + qta
        delta = qta
    elif tipo in ("SCARICO", "VENDITA"):
        nuova_qta = qta_attuale - qta
        delta = -qta
    else:  # RETTIFICA: qta = nuovo valore assoluto
        nuova_qta = qta
        delta = qta - qta_attuale

    # Aggiorna QTA_TOTALE
    cur.execute(
        "UPDATE vini_magazzino SET QTA_TOTALE = ?, UPDATED_AT = ? WHERE id = ?;",
        (nuova_qta, created_at, vino_id),
    )

    # Aggiorna la colonna locazione se specificata
    if loc:
        col = LOCAZIONE_TO_COLUMN[loc]
        qta_loc_map = {"frigo": row["qf"], "loc1": row["q1"], "loc2": row["q2"], "loc3": row["q3"]}
        qta_loc_attuale = qta_loc_map[loc]

        if tipo in ("SCARICO", "VENDITA") and qta_loc_attuale < qta:
            conn.close()
            loc_label = loc.upper() if loc != "frigo" else "FRIGO"
            raise ValueError(
                f"Giacenza insufficiente in {loc_label}: "
                f"disponibili {qta_loc_attuale}, richieste {qta}."
            )

        if tipo == "CARICO":
            nuova_qta_loc = qta_loc_attuale + qta
        elif tipo in ("SCARICO", "VENDITA"):
            nuova_qta_loc = qta_loc_attuale - qta
        else:
            nuova_qta_loc = qta_loc_attuale  # RETTIFICA: non tocca la locazione

        cur.execute(
            f"UPDATE vini_magazzino SET {col} = ?, UPDATED_AT = ? WHERE id = ?;",
            (nuova_qta_loc, created_at, vino_id),
        )

    # Registra movimento solo se c'è effettivamente un delta
    if delta != 0:
        cur.execute(
            """
            INSERT INTO vini_magazzino_movimenti
            (vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (vino_id, data_mov, tipo, abs(delta), loc, note, origine, utente, created_at),
        )

    conn.commit()
    conn.close()


def registra_modifica(
    vino_id: int,
    utente: str,
    campi_modificati: Dict[str, Any],
    valori_prima: Dict[str, Any],
    origine: str = "GESTIONALE-EDIT",
) -> None:
    """
    Registra una MODIFICA anagrafica nella tabella movimenti.
    Salva i campi modificati con i valori prima/dopo nelle note.
    """
    if not campi_modificati:
        return

    # Costruisci nota leggibile
    righe = []
    for campo, nuovo in campi_modificati.items():
        vecchio = valori_prima.get(campo, "")
        # Normalizza None/empty per confronto display
        v_str = str(vecchio) if vecchio not in (None, "") else "—"
        n_str = str(nuovo) if nuovo not in (None, "") else "—"
        righe.append(f"{campo}: {v_str} → {n_str}")

    nota = "; ".join(righe)
    # Tronca se troppo lunga
    if len(nota) > 1000:
        nota = nota[:997] + "..."

    now = datetime.now().isoformat(timespec="seconds")
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO vini_magazzino_movimenti
            (vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at)
        VALUES (?, ?, 'MODIFICA', 0, NULL, ?, ?, ?, ?);
        """,
        (vino_id, now, nota, origine, utente, now),
    )
    conn.commit()
    conn.close()


def list_movimenti_vino(vino_id: int, limit: int = 100) -> List[sqlite3.Row]:
    """
    Restituisce gli ultimi movimenti per un vino.
    Utile per la timeline nel frontend.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT *
        FROM vini_magazzino_movimenti
        WHERE vino_id = ?
        ORDER BY datetime(data_mov) DESC, id DESC
        LIMIT ?;
        """,
        (vino_id, limit),
    ).fetchall()
    conn.close()
    return list(rows)


def list_movimenti_globali(
    tipo: Optional[str] = None,
    text: Optional[str] = None,
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Restituisce i movimenti di tutta la cantina con filtri opzionali.
    Usata dalla pagina hub Vendite & Scarichi.
    Ritorna { items: [...], total: int }.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    where: List[str] = []
    params: List[Any] = []

    if tipo:
        where.append("m.tipo = ?")
        params.append(tipo)

    if text:
        where.append(
            "(v.DESCRIZIONE LIKE ? OR v.PRODUTTORE LIKE ? OR v.DENOMINAZIONE LIKE ?)"
        )
        like = f"%{text}%"
        params.extend([like, like, like])

    if data_da:
        where.append("date(m.data_mov) >= date(?)")
        params.append(data_da)

    if data_a:
        where.append("date(m.data_mov) <= date(?)")
        params.append(data_a)

    where_sql = " AND ".join(where) if where else "1=1"

    # Conta totale per paginazione
    total = cur.execute(
        f"""
        SELECT COUNT(*) AS cnt
        FROM vini_magazzino_movimenti m
        JOIN vini_magazzino v ON v.id = m.vino_id
        WHERE {where_sql};
        """,
        params,
    ).fetchone()["cnt"]

    # Fetch pagina
    rows = cur.execute(
        f"""
        SELECT
            m.id, m.vino_id, m.data_mov, m.tipo, m.qta,
            m.locazione, m.note, m.utente, m.origine,
            v.DESCRIZIONE AS vino_desc,
            v.PRODUTTORE  AS vino_produttore,
            v.ANNATA      AS vino_annata,
            v.TIPOLOGIA   AS vino_tipologia
        FROM vini_magazzino_movimenti m
        JOIN vini_magazzino v ON v.id = m.vino_id
        WHERE {where_sql}
        ORDER BY datetime(m.data_mov) DESC, m.id DESC
        LIMIT ? OFFSET ?;
        """,
        params + [limit, offset],
    ).fetchall()

    conn.close()

    return {
        "items": [dict(r) for r in rows],
        "total": total,
    }


def search_vini_autocomplete(
    text: str, limit: int = 10, solo_disponibili: bool = False
) -> List[sqlite3.Row]:
    """
    Ricerca veloce per autocompletamento — restituisce id, descrizione,
    produttore, annata, QTA_TOTALE. Usata dal form registrazione rapida.

    Se solo_disponibili=True, filtra solo vini con QTA_TOTALE > 0
    (usato dalle Vendite per non mostrare vini esauriti).
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()
    like = f"%{text}%"
    filtro_qta = "AND COALESCE(QTA_TOTALE, 0) > 0" if solo_disponibili else ""
    rows = cur.execute(
        f"""
        SELECT id, DESCRIZIONE, PRODUTTORE, ANNATA, TIPOLOGIA,
               QTA_TOTALE, EURO_LISTINO, PREZZO_CARTA,
               FRIGORIFERO, QTA_FRIGO,
               LOCAZIONE_1, QTA_LOC1,
               LOCAZIONE_2, QTA_LOC2,
               LOCAZIONE_3, QTA_LOC3
        FROM vini_magazzino
        WHERE (DESCRIZIONE LIKE ? OR PRODUTTORE LIKE ?
           OR DENOMINAZIONE LIKE ? OR CAST(id AS TEXT) = ?)
        {filtro_qta}
        ORDER BY
            CASE WHEN DESCRIZIONE LIKE ? THEN 0 ELSE 1 END,
            DESCRIZIONE
        LIMIT ?;
        """,
        (like, like, like, text.strip(), f"{text}%", limit),
    ).fetchall()
    conn.close()
    return rows


def delete_movimento(movimento_id: int) -> None:
    """
    Elimina un movimento e ripristina QTA_TOTALE + QTA per locazione
    invertendo il delta del movimento cancellato.

    Approccio "delta inverso": invece di azzerare e rigiocare tutti
    i movimenti (che perderebbe lo stock iniziale importato da Excel
    senza un corrispondente CARICO), si inverte esattamente l'effetto
    del singolo movimento eliminato.

    Per RETTIFICA (valore assoluto) il ripristino esatto non è possibile
    senza conoscere il valore precedente, quindi si usa il replay
    conservativo dei movimenti rimanenti (accettando il rischio di
    perdere lo stock iniziale non tracciato).
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Legge i dettagli completi del movimento
    mov = cur.execute(
        "SELECT vino_id, tipo, qta, locazione "
        "FROM vini_magazzino_movimenti WHERE id = ?;",
        (movimento_id,),
    ).fetchone()

    if not mov:
        conn.close()
        return

    vino_id = mov["vino_id"]
    tipo = mov["tipo"]
    qta = mov["qta"]
    loc = mov["locazione"]

    # Cancella il movimento
    cur.execute(
        "DELETE FROM vini_magazzino_movimenti WHERE id = ?;",
        (movimento_id,),
    )

    if tipo == "RETTIFICA":
        # Caso speciale: RETTIFICA aveva settato un valore assoluto.
        # Non possiamo sapere il valore precedente, quindi facciamo
        # replay conservativo di tutti i movimenti rimasti.
        cur.execute(
            """UPDATE vini_magazzino
               SET QTA_TOTALE = 0, QTA_FRIGO = 0, QTA_LOC1 = 0,
                   QTA_LOC2 = 0, QTA_LOC3 = 0
               WHERE id = ?;""",
            (vino_id,),
        )
        rows = cur.execute(
            """SELECT tipo, qta, locazione
               FROM vini_magazzino_movimenti
               WHERE vino_id = ?
               ORDER BY datetime(data_mov), id;""",
            (vino_id,),
        ).fetchall()

        qta_tot = 0
        qta_locs = {"frigo": 0, "loc1": 0, "loc2": 0, "loc3": 0}
        for r in rows:
            t, q, l = r["tipo"], r["qta"], r["locazione"]
            if t == "CARICO":
                qta_tot += q
                if l and l in qta_locs:
                    qta_locs[l] += q
            elif t in ("SCARICO", "VENDITA"):
                qta_tot -= q
                if l and l in qta_locs:
                    qta_locs[l] -= q
            elif t == "RETTIFICA":
                qta_tot = q

        cur.execute(
            """UPDATE vini_magazzino
               SET QTA_TOTALE = ?, QTA_FRIGO = ?, QTA_LOC1 = ?,
                   QTA_LOC2 = ?, QTA_LOC3 = ?
               WHERE id = ?;""",
            (qta_tot, qta_locs["frigo"], qta_locs["loc1"],
             qta_locs["loc2"], qta_locs["loc3"], vino_id),
        )
    else:
        # CARICO / SCARICO / VENDITA: inversione del delta
        if tipo == "CARICO":
            # Il CARICO aveva aggiunto qta → togliamo
            delta_tot = -qta
            delta_loc = -qta
        else:
            # SCARICO / VENDITA avevano tolto qta → riaggiungiamo
            delta_tot = qta
            delta_loc = qta

        cur.execute(
            """UPDATE vini_magazzino
               SET QTA_TOTALE = COALESCE(QTA_TOTALE, 0) + ?
               WHERE id = ?;""",
            (delta_tot, vino_id),
        )

        # Ripristina anche la locazione se specificata
        if loc and loc in LOCAZIONE_TO_COLUMN:
            col = LOCAZIONE_TO_COLUMN[loc]
            cur.execute(
                f"""UPDATE vini_magazzino
                    SET {col} = COALESCE({col}, 0) + ?
                    WHERE id = ?;""",
                (delta_loc, vino_id),
            )

    conn.commit()
    conn.close()


# ---------------------------------------------------------
# NOTE PER VINO
# ---------------------------------------------------------
def aggiungi_nota_vino(
    vino_id: int,
    nota: str,
    autore: Optional[str] = None,
) -> None:
    """
    Aggiunge una nota operativa per un vino.
    """
    if not nota or not nota.strip():
        raise ValueError("La nota non può essere vuota")

    created_at = _now_iso()

    conn = get_magazzino_connection()
    cur = conn.cursor()

    # verifica esistenza vino (evita note orfane)
    row = cur.execute(
        "SELECT id FROM vini_magazzino WHERE id = ?;",
        (vino_id,),
    ).fetchone()

    if not row:
        conn.close()
        raise ValueError(f"Vino id={vino_id} non trovato")

    cur.execute(
        """
        INSERT INTO vini_magazzino_note (vino_id, nota, autore, created_at)
        VALUES (?, ?, ?, ?);
        """,
        (vino_id, nota.strip(), autore, created_at),
    )

    conn.commit()
    conn.close()


def list_note_vino(vino_id: int) -> List[sqlite3.Row]:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT *
        FROM vini_magazzino_note
        WHERE vino_id = ?
        ORDER BY datetime(created_at) DESC, id DESC;
        """,
        (vino_id,),
    ).fetchall()
    conn.close()
    return list(rows)


def delete_nota(nota_id: int) -> None:
    """Elimina una nota per ID."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM vini_magazzino_note WHERE id = ?;",
        (nota_id,),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------
# STATISTICHE DASHBOARD
# ---------------------------------------------------------
def get_dashboard_stats(includi_giacenza_positiva: bool = False) -> Dict[str, Any]:
    """
    Restituisce statistiche aggregate per la dashboard operativa.
    Tutto in una sola connessione — query leggere su SQLite.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # KPI base
    kpi = cur.execute(
        """
        SELECT
            COUNT(*)                                                      AS total_vini,
            COUNT(CASE WHEN STATO_VENDITA IN ('V','F','S','T')
                       THEN 1 END)                                        AS referenze_attive,
            COALESCE(SUM(QTA_TOTALE), 0)                                  AS total_bottiglie,
            COUNT(CASE WHEN CARTA = 'SI' THEN 1 END)                      AS vini_in_carta,
            COUNT(CASE WHEN QTA_TOTALE > 0 THEN 1 END)                    AS vini_con_giacenza,
            COUNT(CASE WHEN (EURO_LISTINO IS NULL OR EURO_LISTINO = '')
                       THEN 1 END)                                         AS vini_senza_listino,
            COALESCE(SUM(
                CASE WHEN QTA_TOTALE > 0 AND EURO_LISTINO IS NOT NULL AND EURO_LISTINO != ''
                     THEN QTA_TOTALE * EURO_LISTINO ELSE 0 END
            ), 0)                                                          AS valore_acquisto,
            COALESCE(SUM(
                CASE WHEN QTA_TOTALE > 0 AND PREZZO_CARTA IS NOT NULL AND PREZZO_CARTA != ''
                     THEN QTA_TOTALE * PREZZO_CARTA ELSE 0 END
            ), 0)                                                          AS valore_carta
        FROM vini_magazzino;
        """
    ).fetchone()

    # Alert: vini con stato vendita attivo (V/F/S/T) e giacenza = 0 in carta
    alert_carta = cur.execute(
        """
        SELECT id, TIPOLOGIA, DESCRIZIONE, PRODUTTORE, ANNATA, QTA_TOTALE,
               STATO_RIORDINO, STATO_CONSERVAZIONE, STATO_VENDITA
        FROM vini_magazzino
        WHERE CARTA = 'SI'
          AND (QTA_TOTALE IS NULL OR QTA_TOTALE = 0)
          AND STATO_VENDITA IN ('V', 'F', 'S', 'T')
        ORDER BY
            CASE WHEN STATO_RIORDINO = 'X' THEN 1 ELSE 0 END,
            CASE STATO_VENDITA
                WHEN 'S' THEN 0  -- aggressivo prima
                WHEN 'F' THEN 1  -- spingere
                WHEN 'V' THEN 2  -- vendere
                WHEN 'T' THEN 3  -- cautela
                ELSE 4 END,
            TIPOLOGIA, DESCRIZIONE;
        """
    ).fetchall()

    # KPI vendite (solo tipo=VENDITA)
    kpi_vendite = cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN date(data_mov) = date('now')
                              THEN qta END), 0) AS vendute_oggi,
            COALESCE(SUM(CASE WHEN datetime(data_mov) >= datetime('now', '-7 days')
                              THEN qta END), 0) AS vendute_7gg,
            COALESCE(SUM(CASE WHEN datetime(data_mov) >= datetime('now', '-30 days')
                              THEN qta END), 0) AS vendute_30gg
        FROM vini_magazzino_movimenti
        WHERE tipo = 'VENDITA';
        """
    ).fetchone()

    # KPI aperte per calici (VENDITA con tag [CALICI] nelle note)
    kpi_aperte = cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN date(data_mov) = date('now')
                              THEN qta END), 0) AS aperte_oggi,
            COALESCE(SUM(CASE WHEN datetime(data_mov) >= datetime('now', '-7 days')
                              THEN qta END), 0) AS aperte_7gg,
            COALESCE(SUM(CASE WHEN datetime(data_mov) >= datetime('now', '-30 days')
                              THEN qta END), 0) AS aperte_30gg
        FROM vini_magazzino_movimenti
        WHERE tipo = 'VENDITA' AND note LIKE '%[CALICI]%';
        """
    ).fetchone()

    # Ultime 8 VENDITE (per sezione vendite recenti)
    vendite_recenti = cur.execute(
        """
        SELECT
            m.id, m.data_mov, m.tipo, m.qta, m.note, m.utente,
            v.id AS vino_id, v.DESCRIZIONE AS vino_desc, v.TIPOLOGIA AS vino_tipo
        FROM vini_magazzino_movimenti m
        JOIN vini_magazzino v ON v.id = m.vino_id
        WHERE m.tipo = 'VENDITA'
        ORDER BY datetime(m.data_mov) DESC, m.id DESC
        LIMIT 8;
        """
    ).fetchall()

    # Ultimi 6 movimenti operativi (CARICO / SCARICO / RETTIFICA)
    movimenti_operativi = cur.execute(
        """
        SELECT
            m.id, m.data_mov, m.tipo, m.qta, m.note, m.utente,
            v.id AS vino_id, v.DESCRIZIONE AS vino_desc
        FROM vini_magazzino_movimenti m
        JOIN vini_magazzino v ON v.id = m.vino_id
        WHERE m.tipo IN ('CARICO', 'SCARICO', 'RETTIFICA')
        ORDER BY datetime(m.data_mov) DESC, m.id DESC
        LIMIT 6;
        """
    ).fetchall()

    # Top 8 vini più venduti negli ultimi 30 giorni
    top_venduti = cur.execute(
        """
        SELECT
            v.id, v.DESCRIZIONE, v.PRODUTTORE, v.ANNATA, v.TIPOLOGIA,
            SUM(m.qta) AS tot_vendute,
            v.QTA_TOTALE
        FROM vini_magazzino_movimenti m
        JOIN vini_magazzino v ON v.id = m.vino_id
        WHERE m.tipo = 'VENDITA'
          AND datetime(m.data_mov) >= datetime('now', '-30 days')
        GROUP BY m.vino_id
        ORDER BY tot_vendute DESC
        LIMIT 8;
        """
    ).fetchall()

    # Vini fermi: QTA_TOTALE > 0 e nessun movimento negli ultimi 30 giorni
    # Include anche vini che non hanno MAI avuto movimenti (LEFT JOIN + IS NULL)
    vini_fermi = cur.execute(
        """
        SELECT
            v.id, v.TIPOLOGIA, v.DESCRIZIONE, v.PRODUTTORE, v.ANNATA, v.QTA_TOTALE,
            MAX(m.data_mov) AS ultimo_movimento
        FROM vini_magazzino v
        LEFT JOIN vini_magazzino_movimenti m ON m.vino_id = v.id
        WHERE v.QTA_TOTALE > 0
        GROUP BY v.id
        HAVING ultimo_movimento IS NULL
            OR datetime(ultimo_movimento) < datetime('now', '-30 days')
        ORDER BY
            CASE WHEN ultimo_movimento IS NULL THEN 0 ELSE 1 END,
            v.QTA_TOTALE DESC, v.TIPOLOGIA, v.DESCRIZIONE;
        """
    ).fetchall()

    # Ultimi 10 movimenti cross-vino (tutti i tipi — per compatibilità)
    movimenti_recenti = cur.execute(
        """
        SELECT
            m.id,
            m.data_mov,
            m.tipo,
            m.qta,
            m.locazione,
            m.note,
            m.utente,
            m.origine,
            v.id   AS vino_id,
            v.DESCRIZIONE AS vino_desc
        FROM vini_magazzino_movimenti m
        JOIN vini_magazzino v ON v.id = m.vino_id
        ORDER BY datetime(m.data_mov) DESC, m.id DESC
        LIMIT 10;
        """
    ).fetchall()

    # Lista vini senza prezzo listino (per drill-down)
    senza_listino = cur.execute(
        """
        SELECT id, TIPOLOGIA, DESCRIZIONE, PRODUTTORE, ANNATA,
               PREZZO_CARTA, EURO_LISTINO, QTA_TOTALE
        FROM vini_magazzino
        WHERE (EURO_LISTINO IS NULL OR EURO_LISTINO = '')
        ORDER BY TIPOLOGIA, DESCRIZIONE
        LIMIT 200;
        """
    ).fetchall()

    # Riordini per distributore/rappresentante:
    # Base: vini da riordinare (STATO_RIORDINO D/O/0 oppure QTA=0 e in carta)
    # Con flag: anche tutti i vini con giacenza positiva e fornitore assegnato
    if includi_giacenza_positiva:
        riordini_where = """
            WHERE (v.DISTRIBUTORE IS NOT NULL AND v.DISTRIBUTORE != '')
               OR (v.RAPPRESENTANTE IS NOT NULL AND v.RAPPRESENTANTE != '')
               OR v.STATO_RIORDINO IN ('D', 'O', '0')
               OR (v.QTA_TOTALE > 0 AND v.CARTA = 'SI')
        """
    else:
        riordini_where = """
            WHERE v.STATO_RIORDINO IN ('D', 'O', '0')
               OR (v.QTA_TOTALE = 0 AND v.CARTA = 'SI'
                   AND (v.STATO_RIORDINO IS NULL OR v.STATO_RIORDINO NOT IN ('X', 'A')))
        """
    riordini_per_fornitore = cur.execute(
        f"""
        SELECT
            v.id, v.DESCRIZIONE, v.PRODUTTORE, v.ANNATA, v.TIPOLOGIA,
            v.DISTRIBUTORE, v.RAPPRESENTANTE,
            v.STATO_RIORDINO, v.STATO_VENDITA,
            v.QTA_TOTALE, v.PREZZO_CARTA, v.EURO_LISTINO,
            (SELECT MAX(m.data_mov) FROM vini_magazzino_movimenti m
             WHERE m.vino_id = v.id AND m.tipo = 'CARICO') AS ultimo_carico,
            (SELECT MAX(m.data_mov) FROM vini_magazzino_movimenti m
             WHERE m.vino_id = v.id AND m.tipo = 'VENDITA') AS ultima_vendita
        FROM vini_magazzino v
        {riordini_where}
        ORDER BY v.DISTRIBUTORE, v.RAPPRESENTANTE, v.DESCRIZIONE;
        """
    ).fetchall()

    # Distribuzione bottiglie per tipologia
    distribuzione = cur.execute(
        """
        SELECT
            TIPOLOGIA,
            COUNT(*)                         AS n_vini,
            COALESCE(SUM(QTA_TOTALE), 0)     AS tot_bottiglie
        FROM vini_magazzino
        GROUP BY TIPOLOGIA
        ORDER BY tot_bottiglie DESC;
        """
    ).fetchall()

    conn.close()

    return {
        "total_vini":        kpi["total_vini"],
        "referenze_attive":  kpi["referenze_attive"],
        "total_bottiglie":   kpi["total_bottiglie"],
        "vini_in_carta":     kpi["vini_in_carta"],
        "vini_con_giacenza": kpi["vini_con_giacenza"],
        "vini_senza_listino": kpi["vini_senza_listino"],
        "valore_acquisto":   round(kpi["valore_acquisto"], 2),
        "valore_carta":      round(kpi["valore_carta"], 2),
        "alert_carta_senza_giacenza": [dict(r) for r in alert_carta],
        "total_alert_carta":          len(alert_carta),
        "total_vini_fermi":           len(vini_fermi),
        "vini_senza_listino_list":    [dict(r) for r in senza_listino],
        "vendute_oggi":               kpi_vendite["vendute_oggi"],
        "vendute_7gg":                kpi_vendite["vendute_7gg"],
        "vendute_30gg":               kpi_vendite["vendute_30gg"],
        "aperte_oggi":                kpi_aperte["aperte_oggi"],
        "aperte_7gg":                 kpi_aperte["aperte_7gg"],
        "aperte_30gg":                kpi_aperte["aperte_30gg"],
        "vendite_recenti":            [dict(r) for r in vendite_recenti],
        "movimenti_operativi":        [dict(r) for r in movimenti_operativi],
        "top_venduti_30gg":           [dict(r) for r in top_venduti],
        "vini_fermi":                 [dict(r) for r in vini_fermi],
        "movimenti_recenti":          [dict(r) for r in movimenti_recenti],
        "distribuzione_tipologie":    [dict(r) for r in distribuzione],
        "riordini_per_fornitore":     [dict(r) for r in riordini_per_fornitore],
    }


# ---------------------------------------------------------
# RICERCA DUPLICATI PER INSERIMENTO
# ---------------------------------------------------------
def find_potential_duplicates(
    descrizione: str,
    produttore: Optional[str] = None,
    annata: Optional[str] = None,
    formato: Optional[str] = None,
    max_results: int = 20,
) -> List[sqlite3.Row]:
    """
    Cerca possibili duplicati in vini_magazzino.

    Criteri (molto conservativi, versione 1):
    - match esatto su DESCRIZIONE normalizzata (UPPER + TRIM)
    - se produttore/annata/formato sono valorizzati, li usiamo come filtri aggiuntivi.

    In futuro possiamo rendere la logica più "fuzzy" (LIKE, similarità, ecc.),
    ma per ora ci concentriamo sugli uguali veri.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    where = ["UPPER(TRIM(DESCRIZIONE)) = UPPER(TRIM(?))"]
    params: list[Any] = [descrizione]

    if produttore:
        where.append("UPPER(TRIM(PRODUTTORE)) = UPPER(TRIM(?))")
        params.append(produttore)

    if annata:
        where.append("TRIM(ANNATA) = TRIM(?)")
        params.append(annata)

    if formato:
        where.append("TRIM(FORMATO) = TRIM(?)")
        params.append(formato)

    where_sql = " AND ".join(where)

    sql = f"""
        SELECT
            id,
            DESCRIZIONE,
            PRODUTTORE,
            ANNATA,
            FORMATO,
            NAZIONE,
            REGIONE,
            COALESCE(QTA_TOTALE, 0) AS QTA_TOTALE,
            PREZZO_CARTA
        FROM vini_magazzino
        WHERE {where_sql}
        ORDER BY NAZIONE, REGIONE, PRODUTTORE, DESCRIZIONE
        LIMIT ?;
    """

    params.append(max_results)
    rows = cur.execute(sql, params).fetchall()
    conn.close()
    return list(rows)


# ---------------------------------------------------------
# MATRICE CELLE
# ---------------------------------------------------------
def matrice_get_stato() -> Dict[str, Any]:
    """
    Ritorna lo stato completo della matrice:
    - config: righe e colonne dalla locazioni_config (tipo=matrice)
    - celle: lista di {riga, colonna, vino_id, descrizione}
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Carica config matrice
    config_row = cur.execute(
        "SELECT righe, colonne, nome FROM locazioni_config WHERE tipo = 'matrice' LIMIT 1"
    ).fetchone()

    if not config_row:
        conn.close()
        return {"righe": 0, "colonne": 0, "nome": "Matrice", "celle": []}

    righe = config_row["righe"] or 0
    colonne = config_row["colonne"] or 0
    nome = config_row["nome"] or "Matrice"

    # Carica celle occupate con info vino
    rows = cur.execute(
        """
        SELECT mc.riga, mc.colonna, mc.vino_id,
               v.DESCRIZIONE, v.PRODUTTORE, v.ANNATA, v.TIPOLOGIA
        FROM matrice_celle mc
        JOIN vini_magazzino v ON v.id = mc.vino_id
        ORDER BY mc.riga, mc.colonna;
        """
    ).fetchall()
    conn.close()

    celle = [dict(r) for r in rows]
    return {"righe": righe, "colonne": colonne, "nome": nome, "celle": celle}


def matrice_get_celle_vino(vino_id: int) -> List[Dict[str, Any]]:
    """Ritorna le celle assegnate a un vino specifico."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT id, riga, colonna FROM matrice_celle WHERE vino_id = ? ORDER BY riga, colonna",
        (vino_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def matrice_assegna_cella(vino_id: int, riga: int, colonna: int) -> Dict[str, Any]:
    """
    Assegna una cella a un vino. Fallisce se la cella è già occupata (UNIQUE constraint).
    Aggiorna automaticamente QTA_LOC3 e QTA_TOTALE.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()
    now = _now_iso()

    try:
        cur.execute(
            "INSERT INTO matrice_celle (vino_id, riga, colonna, created_at) VALUES (?, ?, ?, ?)",
            (vino_id, riga, colonna, now),
        )
    except sqlite3.IntegrityError:
        # Cella già occupata — scopri da chi
        existing = cur.execute(
            """SELECT mc.vino_id, v.DESCRIZIONE
               FROM matrice_celle mc JOIN vini_magazzino v ON v.id = mc.vino_id
               WHERE mc.riga = ? AND mc.colonna = ?""",
            (riga, colonna),
        ).fetchone()
        conn.close()
        desc = existing["DESCRIZIONE"] if existing else "?"
        raise ValueError(f"Cella ({colonna},{riga}) già occupata da: {desc}")

    # Ricalcola QTA_LOC3 per questo vino
    _recalc_qta_loc3_from_matrice(conn, cur, vino_id)
    conn.commit()
    conn.close()

    return {"ok": True, "riga": riga, "colonna": colonna}


def matrice_rimuovi_cella(vino_id: int, riga: int, colonna: int) -> Dict[str, Any]:
    """
    Rimuove una cella assegnata a un vino.
    Aggiorna automaticamente QTA_LOC3 e QTA_TOTALE.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    cur.execute(
        "DELETE FROM matrice_celle WHERE vino_id = ? AND riga = ? AND colonna = ?",
        (vino_id, riga, colonna),
    )

    _recalc_qta_loc3_from_matrice(conn, cur, vino_id)
    conn.commit()
    conn.close()

    return {"ok": True}


def matrice_set_celle_vino(vino_id: int, celle: List[Dict[str, int]]) -> Dict[str, Any]:
    """
    Imposta le celle per un vino (sostituisce tutte le assegnazioni precedenti).
    celle = [{"riga": 1, "colonna": 5}, {"riga": 1, "colonna": 6}, ...]
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()
    now = _now_iso()

    # Rimuovi celle esistenti per questo vino
    cur.execute("DELETE FROM matrice_celle WHERE vino_id = ?", (vino_id,))

    # Inserisci nuove celle
    conflitti = []
    for c in celle:
        try:
            cur.execute(
                "INSERT INTO matrice_celle (vino_id, riga, colonna, created_at) VALUES (?, ?, ?, ?)",
                (vino_id, c["riga"], c["colonna"], now),
            )
        except sqlite3.IntegrityError:
            conflitti.append(f"({c['colonna']},{c['riga']})")

    _recalc_qta_loc3_from_matrice(conn, cur, vino_id)
    conn.commit()
    conn.close()

    result: Dict[str, Any] = {"ok": True, "celle_assegnate": len(celle) - len(conflitti)}
    if conflitti:
        result["conflitti"] = conflitti
    return result


def matrice_import_from_all_locations() -> dict:
    """
    Migrazione: cerca valori con coordinate matrice in TUTTE le locazioni
    (FRIGORIFERO, LOCAZIONE_1, LOCAZIONE_2, LOCAZIONE_3).
    Per ogni vino trovato:
    1. Parsa le coordinate (N,N) dal testo
    2. Le inserisce in matrice_celle
    3. Pulisce il vecchio campo (imposta a NULL e QTA a 0)
    4. Ricalcola LOCAZIONE_3 e QTA_LOC3 dalla tabella matrice_celle

    I vecchi valori sono nel formato (colonna,riga) — col prima, riga dopo.
    Internamente matrice_celle salva (riga, colonna) come colonne separate.
    """
    import re
    conn = get_magazzino_connection()
    cur = conn.cursor()
    now = _now_iso()

    LOC_COLUMNS = {
        "FRIGORIFERO": "QTA_FRIGO",
        "LOCAZIONE_1": "QTA_LOC1",
        "LOCAZIONE_2": "QTA_LOC2",
        "LOCAZIONE_3": "QTA_LOC3",
    }

    rows = cur.execute(
        "SELECT id, DESCRIZIONE, FRIGORIFERO, QTA_FRIGO, "
        "LOCAZIONE_1, QTA_LOC1, LOCAZIONE_2, QTA_LOC2, "
        "LOCAZIONE_3, QTA_LOC3 FROM vini_magazzino ORDER BY id"
    ).fetchall()

    existing_vino_ids = set(r[0] for r in cur.execute(
        "SELECT DISTINCT vino_id FROM matrice_celle"
    ).fetchall())

    importati = 0
    skipped = 0
    errori = []
    dettagli = []

    for row in rows:
        vino_id = row["id"]
        desc = row["DESCRIZIONE"] or "?"

        # Cerca coordinate matrice in ogni campo locazione
        all_coords = []
        campi_trovati = []
        for loc_col in LOC_COLUMNS:
            val = row[loc_col]
            if not val:
                continue
            if "matrice" in val.lower() or re.search(r'\(?\d+\s*,\s*\d+\)?', val):
                # Prima prova con parentesi, poi senza
                coords = re.findall(r'\((\d+)\s*,\s*(\d+)\)', val)
                if not coords:
                    coords = re.findall(r'(\d+)\s*,\s*(\d+)', val)
                if coords:
                    all_coords.extend(coords)
                    campi_trovati.append(loc_col)

        if not all_coords:
            continue

        if vino_id in existing_vino_ids:
            skipped += 1
            continue

        celle_importate = 0
        celle_errori = []
        for n1, n2 in all_coords:
            # Vecchio formato: (colonna, riga) — n1=colonna, n2=riga
            col_val = int(n1)
            rig_val = int(n2)
            try:
                cur.execute(
                    "INSERT INTO matrice_celle (vino_id, riga, colonna, created_at) VALUES (?, ?, ?, ?)",
                    (vino_id, rig_val, col_val, now),
                )
                celle_importate += 1
            except Exception as e:
                celle_errori.append(f"({col_val},{rig_val}): {e}")

        if celle_importate > 0:
            # Pulisci i vecchi campi che contenevano le coordinate matrice
            for loc_col in campi_trovati:
                qta_col = LOC_COLUMNS[loc_col]
                cur.execute(
                    f"UPDATE vini_magazzino SET {loc_col} = NULL, {qta_col} = 0, UPDATED_AT = ? WHERE id = ?",
                    (now, vino_id),
                )

            # Ricalcola LOCAZIONE_3 dalla tabella matrice_celle
            _recalc_qta_loc3_from_matrice(conn, cur, vino_id)
            importati += 1
            dettagli.append({
                "vino_id": vino_id, "descrizione": desc,
                "campi_originali": campi_trovati,
                "celle_importate": celle_importate,
            })

        if celle_errori:
            errori.append({"vino_id": vino_id, "descrizione": desc, "errori_celle": celle_errori})

    conn.commit()
    conn.close()
    return {"importati": importati, "skipped": skipped, "errori": errori, "dettagli": dettagli}


def matrice_recalc_preview() -> list:
    """Mostra anteprima prima/dopo per tutti i vini con celle matrice."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    vino_ids = [r["vino_id"] for r in cur.execute(
        "SELECT DISTINCT vino_id FROM matrice_celle"
    ).fetchall()]
    results = []
    for vid in vino_ids:
        vino = cur.execute(
            "SELECT id, DESCRIZIONE, LOCAZIONE_3 FROM vini_magazzino WHERE id = ?", (vid,)
        ).fetchone()
        celle_rows = cur.execute(
            "SELECT riga, colonna FROM matrice_celle WHERE vino_id = ? ORDER BY riga, colonna",
            (vid,),
        ).fetchall()
        new_text = ", ".join(f"({r['colonna']},{r['riga']})" for r in celle_rows)
        results.append({
            "id": vid,
            "descrizione": vino["DESCRIZIONE"] if vino else "?",
            "prima": vino["LOCAZIONE_3"] if vino else None,
            "dopo": new_text if celle_rows else None,
        })
    conn.close()
    return results


def matrice_recalc_all() -> int:
    """Ricalcola LOCAZIONE_3 (formato col,riga) per TUTTI i vini con celle matrice.
    Utile dopo migrazione formato coordinate. Ritorna il numero di vini aggiornati."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    vino_ids = [r["vino_id"] for r in cur.execute(
        "SELECT DISTINCT vino_id FROM matrice_celle"
    ).fetchall()]
    for vid in vino_ids:
        _recalc_qta_loc3_from_matrice(conn, cur, vid)
    conn.commit()
    conn.close()
    return len(vino_ids)


def _recalc_qta_loc3_from_matrice(conn: sqlite3.Connection, cur: sqlite3.Cursor, vino_id: int) -> None:
    """Ricalcola QTA_LOC3 dal conteggio celle matrice e aggiorna QTA_TOTALE."""
    count_row = cur.execute(
        "SELECT COUNT(*) AS n FROM matrice_celle WHERE vino_id = ?",
        (vino_id,),
    ).fetchone()
    qta_loc3 = count_row["n"] if count_row else 0

    # Aggiorna LOCAZIONE_3 con un riassunto e QTA_LOC3
    if qta_loc3 > 0:
        # Costruisci lista celle per il campo di testo
        celle_rows = cur.execute(
            "SELECT riga, colonna FROM matrice_celle WHERE vino_id = ? ORDER BY riga, colonna",
            (vino_id,),
        ).fetchall()
        loc3_text = ", ".join(f"({r['colonna']},{r['riga']})" for r in celle_rows)
    else:
        loc3_text = None

    cur.execute(
        "UPDATE vini_magazzino SET LOCAZIONE_3 = ?, QTA_LOC3 = ?, UPDATED_AT = ? WHERE id = ?",
        (loc3_text, qta_loc3, _now_iso(), vino_id),
    )
    _recalc_qta_totale(conn, vino_id)