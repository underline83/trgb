# @version: v3.0-cantina
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Database Vini
File: app/models/vini_db.py

Gestisce il DB SQLite 'vini.sqlite3' con:
- Tabella principale 'vini' (catalogo + giacenze)
- Tabella 'vini_movimenti' (storico carichi/scarichi/vendite/rettifiche)
- Tabella 'vini_note' (note operative per vino)

NOTE:
- Lo schema di 'vini' è compatibile con l'import Excel attuale.
- Le funzioni di movimentazione centralizzano la logica di aggiornamento QTA.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional

DB_PATH = Path("app/data/vini.sqlite3")


# ---------------------------------------------------------
# CONNESSIONE DI BASE
# ---------------------------------------------------------
def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------
# INIT SCHEMA
# ---------------------------------------------------------
def init_database() -> None:
    """
    Crea tutte le tabelle necessarie se non esistono:
    - vini
    - vini_movimenti
    - vini_note
    """
    conn = get_connection()
    cur = conn.cursor()

    # -----------------------------------------------------
    # TABELLA PRINCIPALE 'vini'
    # (schema allineato a import Excel + carta)
    # -----------------------------------------------------
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

    # Indici utili per ricerche frequenti (non obbligatori ma consigliati)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_tipologia ON vini (TIPOLOGIA);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_regione ON vini (REGIONE);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_produttore ON vini (PRODUTTORE);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_vini_descrizione ON vini (DESCRIZIONE);")

    # -----------------------------------------------------
    # TABELLA 'vini_movimenti'
    # -----------------------------------------------------
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
        "CREATE INDEX IF NOT EXISTS idx_movimenti_vino_data "
        "ON vini_movimenti (vino_id, data_mov);"
    )

    # -----------------------------------------------------
    # TABELLA 'vini_note'
    # -----------------------------------------------------
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
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_note_vino ON vini_note (vino_id);"
    )

    conn.commit()
    conn.close()


# ---------------------------------------------------------
# LOGICA MOVIMENTI CANTINA
# ---------------------------------------------------------
MOVIMENTI_TIPI_VALIDI = {"CARICO", "SCARICO", "VENDITA", "RETTIFICA"}


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def registra_movimento(
    vino_id: int,
    tipo: str,
    qta: int,
    note: Optional[str] = None,
    origine: Optional[str] = "GESTIONALE",
    data_mov: Optional[str] = None,
) -> None:
    """
    Registra un movimento di cantina e aggiorna la QTA in 'vini'.

    Parametri:
        vino_id : id del vino nella tabella 'vini'
        tipo    : 'CARICO' | 'SCARICO' | 'VENDITA' | 'RETTIFICA'
        qta     : quantità positiva (per RETTIFICA vedi logica sotto)
        note    : note operative (es. 'servizio', 'evento X', 'rettifica inventario')
        origine : es. 'GESTIONALE', 'IMPORT', 'ALTRO'
        data_mov: ISO string; se None viene usata la data corrente

    Logica QTA:
        - CARICO   → QTA = QTA + qta
        - SCARICO  → QTA = QTA - qta
        - VENDITA  → QTA = QTA - qta
        - RETTIFICA:
            - qta viene interpretata come NUOVO valore assoluto di QTA
            - viene registrata la differenza (qta - QTA_attuale) in vini_movimenti
    """
    if tipo not in MOVIMENTI_TIPI_VALIDI:
        raise ValueError(f"Tipo movimento non valido: {tipo}")

    if qta <= 0:
        raise ValueError("La quantità qta deve essere > 0")

    if data_mov is None:
        data_mov = _now_iso()

    created_at = _now_iso()

    conn = get_connection()
    cur = conn.cursor()

    # Legge QTA corrente
    row = cur.execute("SELECT QTA FROM vini WHERE id = ?;", (vino_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Vino id={vino_id} non trovato")

    qta_attuale = row["QTA"] or 0

    # Calcolo delta e nuova QTA
    if tipo == "CARICO":
        delta = qta
        nuova_qta = qta_attuale + qta
    elif tipo in ("SCARICO", "VENDITA"):
        delta = -qta
        nuova_qta = qta_attuale - qta
    else:  # RETTIFICA
        # qta = nuovo valore assoluto
        nuova_qta = qta
        delta = qta - qta_attuale

    # Aggiorna QTA nella tabella vini
    cur.execute(
        "UPDATE vini SET QTA = ? WHERE id = ?;",
        (nuova_qta, vino_id),
    )

    # Registra movimento solo se c'è effettivamente un delta
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

    conn = get_connection()
    cur = conn.cursor()

    # verifica esistenza vino (evita note orfane)
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
# ---------------------------------------------------------
# FUNZIONI BASE PER LETTURA / UPDATE SINGOLO VINO
# ---------------------------------------------------------

def get_vino_by_id(vino_id: int):
    """
    Restituisce una singola riga dalla tabella 'vini' dato l'ID.
    """
    conn = get_connection()
    cur = conn.cursor()
    row = cur.execute(
        "SELECT * FROM vini WHERE id = ?;",
        (vino_id,)
    ).fetchone()
    conn.close()
    return row


def update_vino_qta(vino_id: int, nuova_qta: int):
    """
    Imposta direttamente QTA = nuova_qta.
    (Usata da RETTIFICA o da funzioni di amministrazione)
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE vini SET QTA = ? WHERE id = ?;",
        (nuova_qta, vino_id)
    )
    conn.commit()
    conn.close()
    conn.commit()
    conn.close()