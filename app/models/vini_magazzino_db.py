# @version: v1.1-magazzino
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Database Vini (Magazzino)
File: app/models/vini_magazzino_db.py

DB dedicato alla gestione di CANTINA / MAGAZZINO vini:
- Tabella principale 'vini_magazzino' (anagrafica + giacenze + stato vendite)
- Tabella 'vini_magazzino_movimenti' (storico carichi/scarichi/vendite/rettifiche)
- Tabella 'vini_magazzino_note' (note operative per vino)

⚠️ Questo DB è SEPARATO da 'vini.sqlite3' usato per la carta vini da Excel.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

DB_MAG_PATH = Path("app/data/vini_magazzino.sqlite3")


# ---------------------------------------------------------
# CONNESSIONE DI BASE
# ---------------------------------------------------------
def get_magazzino_connection() -> sqlite3.Connection:
    DB_MAG_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_MAG_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ---------------------------------------------------------
# INIT SCHEMA
# ---------------------------------------------------------
def init_magazzino_database() -> None:
    """
    Crea tutte le tabelle necessarie se non esistono:
    - vini_magazzino
    - vini_magazzino_movimenti
    - vini_magazzino_note

    E applica piccole migrazioni NON distruttive (es. colonna ANNATA).
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # -----------------------------------------------------
    # TABELLA PRINCIPALE 'vini_magazzino'
    # -----------------------------------------------------
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
            ANNATA          TEXT,              -- es. 2019, NV
            DENOMINAZIONE   TEXT,
            VITIGNI         TEXT,
            GRADO_ALCOLICO  REAL,

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

    # Indici utili per ricerche frequenti
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

    # -----------------------------------------------------
    # MIGRAZIONI LEGGERISSIME (non distruttive)
    # -----------------------------------------------------
    # ANNATA: se la tabella esisteva da prima senza la colonna, la aggiungiamo.
    cur.execute("PRAGMA table_info(vini_magazzino);")
    cols = [row[1] for row in cur.fetchall()]
    if "ANNATA" not in cols:
        cur.execute("ALTER TABLE vini_magazzino ADD COLUMN ANNATA TEXT;")

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
                            tipo IN ('CARICO','SCARICO','VENDITA','RETTIFICA')
                        ),
            qta         INTEGER NOT NULL,
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
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    where = []
    params: list[Any] = []

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
MOVIMENTI_TIPI_VALIDI = {"CARICO", "SCARICO", "VENDITA", "RETTIFICA"}


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
    Registra un movimento di cantina e aggiorna QTA_TOTALE.

    ⚠️ Nota:
    - Per ora i movimenti aggiornano solo QTA_TOTALE.
      Le singole QTA_FRIGO / QTA_LOC* restano invariate e vanno
      eventualmente gestite con 'aggiorna_quantita_locazioni()'.
    """
    if tipo not in MOVIMENTI_TIPI_VALIDI:
        raise ValueError(f"Tipo movimento non valido: {tipo}")

    if qta <= 0:
        raise ValueError("La quantità qta deve essere > 0")

    if data_mov is None:
        data_mov = _now_iso()

    created_at = _now_iso()

    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Legge QTA_TOTALE corrente
    row = cur.execute(
        "SELECT COALESCE(QTA_TOTALE, 0) AS q FROM vini_magazzino WHERE id = ?;",
        (vino_id,),
    ).fetchone()

    if not row:
        conn.close()
        raise ValueError(f"Vino id={vino_id} non trovato")

    qta_attuale = row["q"]

    # Calcolo nuova QTA
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

    # Registra movimento solo se c'è effettivamente un delta
    if delta != 0:
        cur.execute(
            """
            INSERT INTO vini_magazzino_movimenti
            (vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (vino_id, data_mov, tipo, abs(delta), locazione, note, origine, utente, created_at),
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


def delete_movimento(movimento_id: int) -> None:
    """
    Elimina un movimento e ricalcola QTA_TOTALE partendo da QTA_TOTALE=0
    rigiocando tutti i movimenti in ordine cronologico.
    (Scelta conservativa per evitare disallineamenti.)
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Trova movimento e vino_id
    mov = cur.execute(
        "SELECT vino_id FROM vini_magazzino_movimenti WHERE id = ?;",
        (movimento_id,),
    ).fetchone()

    if not mov:
        conn.close()
        return

    vino_id = mov["vino_id"]

    # Cancella il movimento
    cur.execute(
        "DELETE FROM vini_magazzino_movimenti WHERE id = ?;",
        (movimento_id,),
    )
    conn.commit()

    # Ricalcola QTA_TOTALE da zero rigiocando tutti i movimenti
    cur.execute(
        "UPDATE vini_magazzino SET QTA_TOTALE = 0 WHERE id = ?;",
        (vino_id,),
    )

    rows = cur.execute(
        """
        SELECT tipo, qta
        FROM vini_magazzino_movimenti
        WHERE vino_id = ?
        ORDER BY datetime(data_mov), id;
        """,
        (vino_id,),
    ).fetchall()

    qta_tot = 0
    for r in rows:
        t = r["tipo"]
        q = r["qta"]
        if t == "CARICO":
            qta_tot += q
        elif t in ("SCARICO", "VENDITA"):
            qta_tot -= q
        elif t == "RETTIFICA":
            qta_tot = q

    cur.execute(
        "UPDATE vini_magazzino SET QTA_TOTALE = ? WHERE id = ?;",
        (qta_tot, vino_id),
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