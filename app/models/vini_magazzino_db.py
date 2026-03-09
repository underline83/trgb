# @version: v1.2-magazzino
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
        "TIPOLOGIA", "NAZIONE", "CODICE", "REGIONE",
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

    cur.execute(
        """
        INSERT INTO vini_magazzino (
            id_excel,
            TIPOLOGIA, NAZIONE, CODICE, REGIONE,
            DESCRIZIONE, DENOMINAZIONE, ANNATA, VITIGNI, GRADO_ALCOLICO,
            FORMATO, PRODUTTORE, DISTRIBUTORE,
            PREZZO_CARTA, EURO_LISTINO, SCONTO, NOTE_PREZZO,
            CARTA, IPRATICO,
            STATO_VENDITA, NOTE_STATO,
            FRIGORIFERO,
            LOCAZIONE_1, LOCAZIONE_2, LOCAZIONE_3,
            NOTE,
            CREATED_AT, UPDATED_AT
        )
        VALUES (
            :id_excel,
            :TIPOLOGIA, :NAZIONE, :CODICE, :REGIONE,
            :DESCRIZIONE, :DENOMINAZIONE, :ANNATA, :VITIGNI, :GRADO_ALCOLICO,
            :FORMATO, :PRODUTTORE, :DISTRIBUTORE,
            :PREZZO_CARTA, :EURO_LISTINO, :SCONTO, :NOTE_PREZZO,
            :CARTA, :IPRATICO,
            :STATO_VENDITA, :NOTE_STATO,
            :FRIGORIFERO,
            :LOCAZIONE_1, :LOCAZIONE_2, :LOCAZIONE_3,
            :NOTE,
            :CREATED_AT, :UPDATED_AT
        )
        ON CONFLICT(id_excel) DO UPDATE SET
            TIPOLOGIA      = excluded.TIPOLOGIA,
            NAZIONE        = excluded.NAZIONE,
            CODICE         = excluded.CODICE,
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
MOVIMENTI_TIPI_VALIDI = {"CARICO", "SCARICO", "VENDITA", "RETTIFICA"}


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

        if tipo == "CARICO":
            nuova_qta_loc = qta_loc_attuale + qta
        elif tipo in ("SCARICO", "VENDITA"):
            nuova_qta_loc = max(0, qta_loc_attuale - qta)
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


def search_vini_autocomplete(text: str, limit: int = 10) -> List[sqlite3.Row]:
    """
    Ricerca veloce per autocompletamento — restituisce id, descrizione,
    produttore, annata, QTA_TOTALE. Usata dal form registrazione rapida.
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()
    like = f"%{text}%"
    rows = cur.execute(
        """
        SELECT id, DESCRIZIONE, PRODUTTORE, ANNATA, TIPOLOGIA,
               QTA_TOTALE, EURO_LISTINO, PREZZO_CARTA,
               FRIGORIFERO, QTA_FRIGO,
               LOCAZIONE_1, QTA_LOC1,
               LOCAZIONE_2, QTA_LOC2,
               LOCAZIONE_3, QTA_LOC3
        FROM vini_magazzino
        WHERE DESCRIZIONE LIKE ? OR PRODUTTORE LIKE ?
           OR DENOMINAZIONE LIKE ? OR CAST(id AS TEXT) = ?
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
def get_dashboard_stats() -> Dict[str, Any]:
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
            COALESCE(SUM(QTA_TOTALE), 0)                                  AS total_bottiglie,
            COUNT(CASE WHEN CARTA = 'SI' THEN 1 END)                      AS vini_in_carta,
            COUNT(CASE WHEN QTA_TOTALE > 0 THEN 1 END)                    AS vini_con_giacenza,
            COUNT(CASE WHEN (EURO_LISTINO IS NULL OR EURO_LISTINO = '')
                       THEN 1 END)                                         AS vini_senza_listino
        FROM vini_magazzino;
        """
    ).fetchone()

    # Alert: vini in carta con giacenza = 0
    alert_carta = cur.execute(
        """
        SELECT id, TIPOLOGIA, DESCRIZIONE, PRODUTTORE, ANNATA, QTA_TOTALE,
               STATO_RIORDINO, STATO_CONSERVAZIONE, STATO_VENDITA
        FROM vini_magazzino
        WHERE CARTA = 'SI' AND (QTA_TOTALE IS NULL OR QTA_TOTALE = 0)
        ORDER BY
            CASE WHEN STATO_RIORDINO = 'X' THEN 1 ELSE 0 END,
            CASE WHEN STATO_CONSERVAZIONE = '1' THEN 0
                 WHEN STATO_CONSERVAZIONE = '2' THEN 1
                 ELSE 2 END,
            TIPOLOGIA, DESCRIZIONE
        LIMIT 50;
        """
    ).fetchall()

    # KPI vendite (solo tipo=VENDITA)
    kpi_vendite = cur.execute(
        """
        SELECT
            COALESCE(SUM(CASE WHEN datetime(data_mov) >= datetime('now', '-7 days')
                              THEN qta END), 0) AS vendute_7gg,
            COALESCE(SUM(CASE WHEN datetime(data_mov) >= datetime('now', '-30 days')
                              THEN qta END), 0) AS vendute_30gg
        FROM vini_magazzino_movimenti
        WHERE tipo = 'VENDITA';
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
        ORDER BY v.QTA_TOTALE DESC, v.TIPOLOGIA, v.DESCRIZIONE
        LIMIT 10;
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
        "total_bottiglie":   kpi["total_bottiglie"],
        "vini_in_carta":     kpi["vini_in_carta"],
        "vini_con_giacenza": kpi["vini_con_giacenza"],
        "vini_senza_listino": kpi["vini_senza_listino"],
        "alert_carta_senza_giacenza": [dict(r) for r in alert_carta],
        "vini_senza_listino_list":    [dict(r) for r in senza_listino],
        "vendute_7gg":                kpi_vendite["vendute_7gg"],
        "vendute_30gg":               kpi_vendite["vendute_30gg"],
        "vendite_recenti":            [dict(r) for r in vendite_recenti],
        "movimenti_operativi":        [dict(r) for r in movimenti_operativi],
        "top_venduti_30gg":           [dict(r) for r in top_venduti],
        "vini_fermi":                 [dict(r) for r in vini_fermi],
        "movimenti_recenti":          [dict(r) for r in movimenti_recenti],
        "distribuzione_tipologie":    [dict(r) for r in distribuzione],
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