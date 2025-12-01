# @version: v3.0-cantina
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Database Vini
File: app/models/vini_db.py

Gestisce il DB SQLite 'vini.sqlite3' con:
- Tabella principale 'vini' (catalogo + giacenze)
- Tabella 'vini_movimenti' (storico carichi/scarichi/vendite/rettifiche)
- Tabella 'vini_note' (note operative per vino)
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

DB_PATH = Path("app/data/vini.sqlite3")


# ---------------------------------------------------------
# CONNESSIONE
# ---------------------------------------------------------
def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------
# INIT DATABASE
# ---------------------------------------------------------
def init_database() -> None:
    conn = get_connection()
    cur = conn.cursor()

    # TABELLA VINI
    tipo_check = (
        "'GRANDI FORMATI','BOLLICINE FRANCIA','BOLLICINE STRANIERE','BOLLICINE ITALIA',"
        "'BIANCHI ITALIA','BIANCHI FRANCIA','BIANCHI STRANIERI','ROSATI',"
        "'ROSSI ITALIA','ROSSI FRANCIA','ROSSI STRANIERI','PASSITI E VINI DA MEDITAZIONE',"
        "'VINI ANALCOLICI','ERRORE'"
    )

    formato_check = (
        "'MN','QP','ME','DM','CL','BT','BN','MG','MJ','JB','RH','JBX','MS','SM','BZ','NB','ML','PR','MZ'"
    )

    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS vini (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            TIPOLOGIA    TEXT CHECK (TIPOLOGIA IN ({tipo_check})),
            NAZIONE      TEXT,
            CODICE       TEXT,
            REGIONE      TEXT,
            CARTA        TEXT CHECK (CARTA IN ('SI','NO') OR CARTA IS NULL),
            DESCRIZIONE  TEXT,
            ANNATA       TEXT,
            PRODUTTORE   TEXT,
            PREZZO       REAL,
            FORMATO      TEXT CHECK (FORMATO IS NULL OR FORMATO IN ({formato_check})),
            N_FRIGO      INTEGER DEFAULT 0,
            N_LOC1       INTEGER DEFAULT 0,
            N_LOC2       INTEGER DEFAULT 0,
            QTA          INTEGER DEFAULT 0,
            IPRATICO     TEXT,
            DENOMINAZIONE TEXT,
            FRIGORIFERO  TEXT,
            LOCAZIONE_1  TEXT,
            LOCAZIONE_2  TEXT,
            DISTRIBUTORE TEXT,
            EURO_LISTINO REAL,
            SCONTO       REAL
        );
        """
    )

    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_tipologia   ON vini (TIPOLOGIA);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_regione     ON vini (REGIONE);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_produttore  ON vini (PRODUTTORE);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_descrizione ON vini (DESCRIZIONE);")

    # MOVIMENTI
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS vini_movimenti (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id    INTEGER NOT NULL,
            data_mov   TEXT NOT NULL,
            tipo       TEXT NOT NULL CHECK (tipo IN ('CARICO','SCARICO','VENDITA','RETTIFICA')),
            qta        INTEGER NOT NULL,
            note       TEXT,
            origine    TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini(id)
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_mov_vino_data "
        "ON vini_movimenti (vino_id, data_mov);"
    )

    # NOTE
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS vini_note (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            vino_id    INTEGER NOT NULL,
            nota       TEXT NOT NULL,
            autore     TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (vino_id) REFERENCES vini(id)
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_note_vino ON vini_note (vino_id);")

    conn.commit()
    conn.close()


# ---------------------------------------------------------
# UTILITIES
# ---------------------------------------------------------
MOVIMENTI_TIPI_VALIDI = {"CARICO", "SCARICO", "VENDITA", "RETTIFICA"}


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ---------------------------------------------------------
# FUNZIONI SINGOLO VINO
# ---------------------------------------------------------
def get_vino_by_id(vino_id: int):
    conn = get_connection()
    cur = conn.cursor()
    row = cur.execute("SELECT * FROM vini WHERE id = ?;", (vino_id,)).fetchone()
    conn.close()
    return row


def update_vino_qta(vino_id: int, nuova_qta: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE vini SET QTA = ? WHERE id = ?;", (nuova_qta, vino_id))
    conn.commit()
    conn.close()


# ---------------------------------------------------------
# REGISTRAZIONE MOVIMENTO
# ---------------------------------------------------------
def registra_movimento(
    vino_id: int,
    tipo: str,
    qta: int,
    note: Optional[str] = None,
    origine: Optional[str] = "GESTIONALE",
    data_mov: Optional[str] = None,
) -> None:

    if tipo not in MOVIMENTI_TIPI_VALIDI:
        raise ValueError(f"Tipo movimento non valido: {tipo}")

    if qta <= 0:
        raise ValueError("La quantità qta deve essere > 0")

    data_mov = data_mov or _now_iso()
    created_at = _now_iso()

    conn = get_connection()
    cur = conn.cursor()

    row = cur.execute("SELECT QTA FROM vini WHERE id = ?;", (vino_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Vino id={vino_id} non trovato")

    qta_attuale = row["QTA"] or 0

    if tipo == "CARICO":
        delta = qta
        nuova_qta = qta_attuale + qta
    elif tipo in ("SCARICO", "VENDITA"):
        delta = -qta
        nuova_qta = qta_attuale - qta
    else:  # RETTIFICA
        nuova_qta = qta
        delta = qta - qta_attuale

    cur.execute("UPDATE vini SET QTA = ? WHERE id = ?;", (nuova_qta, vino_id))

    if delta != 0:
        cur.execute(
            """
            INSERT INTO vini_movimenti
            (vino_id, data_mov, tipo, qta, note, origine, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (vino_id, data_mov, tipo, abs(delta), note, origine, created_at),
        )

    conn.commit()
    conn.close()


# ---------------------------------------------------------
# NOTE VINO
# ---------------------------------------------------------
def aggiungi_nota_vino(vino_id: int, nota: str, autore: Optional[str] = None):
    if not nota.strip():
        raise ValueError("La nota non può essere vuota")

    created_at = _now_iso()

    conn = get_connection()
    cur = conn.cursor()

    row = cur.execute("SELECT id FROM vini WHERE id = ?;", (vino_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Vino id={vino_id} non trovato")

    cur.execute(
        """
        INSERT INTO vini_note (vino_id, nota, autore, created_at)
        VALUES (?, ?, ?, ?);
        """,
        (vino_id, nota.strip(), autore, created_at),
    )

    conn.commit()
    conn.close()


# ---------------------------------------------------------
# LIST MOVIMENTI / NOTE
# ---------------------------------------------------------
def list_movimenti_vino(vino_id: int):
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT *
        FROM vini_movimenti
        WHERE vino_id = ?
        ORDER BY data_mov DESC, id DESC
        """,
        (vino_id,),
    ).fetchall()
    conn.close()
    return rows


def list_note_vino(vino_id: int):
    conn = get_connection()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT *
        FROM vini_note
        WHERE vino_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (vino_id,),
    ).fetchall()
    conn.close()
    return rows


# ---------------------------------------------------------
# DELETE MOVIMENTO / NOTA
# ---------------------------------------------------------
def delete_movimento(mov_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM vini_movimenti WHERE id = ?;", (mov_id,))
    conn.commit()
    conn.close()


def delete_nota(nota_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM vini_note WHERE id = ?;", (nota_id,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------
# RICERCA VINI
# ---------------------------------------------------------
def search_vini(
    testo: str = "",
    tipologia: str = None,
    produttore: str = None,
    regione: str = None,
):
    conn = get_connection()
    cur = conn.cursor()

    query = "SELECT * FROM vini WHERE 1=1"
    params = []

    if testo:
        query += " AND (DESCRIZIONE LIKE ? OR PRODUTTORE LIKE ?)"
        like = f"%{testo}%"
        params += [like, like]

    if tipologia:
        query += " AND TIPOLOGIA = ?"
        params.append(tipologia)

    if produttore:
        query += " AND PRODUTTORE = ?"
        params.append(produttore)

    if regione:
        query += " AND REGIONE = ?"
        params.append(regione)

    rows = cur.execute(query, params).fetchall()
    conn.close()
    return rows