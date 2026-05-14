# Modulo: vini
"""
DB access per le anagrafiche del refactor V.6+V.7+V.8 (Fase 2).

Tabelle gestite (tutte con suffisso `_v2` durante il refactor, vedi
`docs/refactor_anagrafiche_vini.md`):
  - vini_produttori_v2
  - vini_fornitori_v2
  - vini_denominazioni_v2
  - vini_vitigni_v2
  - vini_madre_v2

`vini_bottiglie_v2` NON è gestita qui: è una copia di `vini_magazzino`
mantenuta in parallelo, gestita dal servizio sync (Fase 7).

COSTANTI NOMI TABELLA: centralizzate in TABELLE per facilitare lo swap
atomico finale (Fase 10). Allo swap basta aggiornare la mappa qui sotto.
"""

from __future__ import annotations
import sqlite3
from typing import Any, Dict, List, Optional

from app.models.vini_magazzino_db import get_magazzino_connection


# ============================================================
# Mappa nomi tabella (single source of truth per il refactor)
# ============================================================
TABELLE = {
    "produttori":      "vini_produttori_v2",
    "fornitori":       "vini_fornitori_v2",
    "denominazioni":   "vini_denominazioni_v2",
    "vitigni":         "vini_vitigni_v2",
    "madre":           "vini_madre_v2",
    "bottiglie":       "vini_bottiglie_v2",
}


# ============================================================
# Helpers
# ============================================================
def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {k: row[k] for k in row.keys()} if row else None


def _build_set(data: Dict[str, Any], allowed: set) -> tuple[str, list]:
    """Crea SET clause + valori per UPDATE, filtrando solo campi allowed."""
    filtered = {k: v for k, v in data.items() if k in allowed}
    if not filtered:
        return "", []
    set_clause = ", ".join(f"{k} = ?" for k in filtered.keys())
    return set_clause, list(filtered.values())


# ============================================================
# PRODUTTORI
# ============================================================
PRODUTTORI_FIELDS = {
    "nome", "nazione", "regione", "provincia", "citta", "note"
}


def list_produttori(search: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    if search:
        rows = cur.execute(
            f"SELECT * FROM {TABELLE['produttori']} "
            f"WHERE nome LIKE ? ORDER BY nome",
            (f"%{search}%",),
        ).fetchall()
    else:
        rows = cur.execute(
            f"SELECT * FROM {TABELLE['produttori']} ORDER BY nome"
        ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_produttore(pid: int) -> Optional[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        f"SELECT * FROM {TABELLE['produttori']} WHERE id = ?", (pid,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def create_produttore(data: Dict[str, Any]) -> int:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cols = [k for k in data.keys() if k in PRODUTTORI_FIELDS]
    if "nome" not in cols:
        raise ValueError("nome è obbligatorio")
    placeholders = ", ".join(["?"] * len(cols))
    cur.execute(
        f"INSERT INTO {TABELLE['produttori']} ({', '.join(cols)}) VALUES ({placeholders})",
        [data[c] for c in cols],
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_produttore(pid: int, data: Dict[str, Any]) -> bool:
    set_clause, values = _build_set(data, PRODUTTORI_FIELDS)
    if not set_clause:
        return False
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {TABELLE['produttori']} SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
        values + [pid],
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def delete_produttore(pid: int) -> bool:
    """Elimina produttore. Falla se ci sono madre collegati."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_madre = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['madre']} WHERE produttore_id = ?", (pid,)
    ).fetchone()[0]
    if n_madre > 0:
        conn.close()
        raise ValueError(f"Impossibile eliminare: {n_madre} vini madre collegati")
    cur.execute(f"DELETE FROM {TABELLE['produttori']} WHERE id = ?", (pid,))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


# ============================================================
# FORNITORI (distributori con rappresentante inline)
# ============================================================
FORNITORI_FIELDS = {
    "nome", "nazione", "regione", "provincia", "citta",
    "rappresentante_nome", "rappresentante_telefono", "rappresentante_email",
    "note",
}


def list_fornitori(search: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    if search:
        rows = cur.execute(
            f"SELECT * FROM {TABELLE['fornitori']} "
            f"WHERE nome LIKE ? OR rappresentante_nome LIKE ? ORDER BY nome",
            (f"%{search}%", f"%{search}%"),
        ).fetchall()
    else:
        rows = cur.execute(
            f"SELECT * FROM {TABELLE['fornitori']} ORDER BY nome"
        ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_fornitore(fid: int) -> Optional[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        f"SELECT * FROM {TABELLE['fornitori']} WHERE id = ?", (fid,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def create_fornitore(data: Dict[str, Any]) -> int:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cols = [k for k in data.keys() if k in FORNITORI_FIELDS]
    if "nome" not in cols:
        raise ValueError("nome è obbligatorio")
    placeholders = ", ".join(["?"] * len(cols))
    cur.execute(
        f"INSERT INTO {TABELLE['fornitori']} ({', '.join(cols)}) VALUES ({placeholders})",
        [data[c] for c in cols],
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_fornitore(fid: int, data: Dict[str, Any]) -> bool:
    set_clause, values = _build_set(data, FORNITORI_FIELDS)
    if not set_clause:
        return False
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {TABELLE['fornitori']} SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
        values + [fid],
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def delete_fornitore(fid: int) -> bool:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_madre = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['madre']} WHERE fornitore_id = ?", (fid,)
    ).fetchone()[0]
    if n_madre > 0:
        conn.close()
        raise ValueError(f"Impossibile eliminare: {n_madre} vini madre collegati")
    cur.execute(f"DELETE FROM {TABELLE['fornitori']} WHERE id = ?", (fid,))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


# ============================================================
# DENOMINAZIONI
# ============================================================
DENOMINAZIONI_FIELDS = {
    "codice_eambrosia", "nome", "tipo", "tipo_ue", "nazione", "regione",
    "link_disciplinare", "attiva", "source", "last_synced_at", "note",
}


def list_denominazioni(
    search: Optional[str] = None,
    nazione: Optional[str] = None,
    tipo: Optional[str] = None,
    solo_attive: bool = True,
) -> List[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    where = []
    params: list = []
    if solo_attive:
        where.append("attiva = 1")
    if search:
        where.append("(nome LIKE ? OR codice_eambrosia LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if nazione:
        where.append("nazione = ?")
        params.append(nazione)
    if tipo:
        where.append("tipo = ?")
        params.append(tipo)
    where_sql = "WHERE " + " AND ".join(where) if where else ""
    rows = cur.execute(
        f"SELECT * FROM {TABELLE['denominazioni']} {where_sql} ORDER BY nazione, nome",
        params,
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_denominazione(did: int) -> Optional[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        f"SELECT * FROM {TABELLE['denominazioni']} WHERE id = ?", (did,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def create_denominazione(data: Dict[str, Any]) -> int:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cols = [k for k in data.keys() if k in DENOMINAZIONI_FIELDS]
    for required in ("nome", "tipo", "nazione"):
        if required not in cols:
            raise ValueError(f"{required} è obbligatorio")
    placeholders = ", ".join(["?"] * len(cols))
    try:
        cur.execute(
            f"INSERT INTO {TABELLE['denominazioni']} ({', '.join(cols)}) VALUES ({placeholders})",
            [data[c] for c in cols],
        )
    except sqlite3.IntegrityError as e:
        conn.close()
        raise ValueError(f"Denominazione duplicata: {e}")
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_denominazione(did: int, data: Dict[str, Any]) -> bool:
    set_clause, values = _build_set(data, DENOMINAZIONI_FIELDS)
    if not set_clause:
        return False
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {TABELLE['denominazioni']} SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
        values + [did],
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def delete_denominazione(did: int) -> bool:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_madre = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['madre']} WHERE denominazione_id = ?", (did,)
    ).fetchone()[0]
    if n_madre > 0:
        conn.close()
        raise ValueError(f"Impossibile eliminare: {n_madre} vini madre la usano")
    cur.execute(f"DELETE FROM {TABELLE['denominazioni']} WHERE id = ?", (did,))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


# ============================================================
# VITIGNI
# ============================================================
VITIGNI_FIELDS = {"nome", "note"}


def list_vitigni(search: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    if search:
        rows = cur.execute(
            f"SELECT * FROM {TABELLE['vitigni']} WHERE nome LIKE ? ORDER BY nome",
            (f"%{search}%",),
        ).fetchall()
    else:
        rows = cur.execute(
            f"SELECT * FROM {TABELLE['vitigni']} ORDER BY nome"
        ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_vitigno(vid: int) -> Optional[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        f"SELECT * FROM {TABELLE['vitigni']} WHERE id = ?", (vid,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def create_vitigno(data: Dict[str, Any]) -> int:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cols = [k for k in data.keys() if k in VITIGNI_FIELDS]
    if "nome" not in cols:
        raise ValueError("nome è obbligatorio")
    placeholders = ", ".join(["?"] * len(cols))
    try:
        cur.execute(
            f"INSERT INTO {TABELLE['vitigni']} ({', '.join(cols)}) VALUES ({placeholders})",
            [data[c] for c in cols],
        )
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError(f"Vitigno '{data.get('nome')}' già esistente (nome UNIQUE)")
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_vitigno(vid: int, data: Dict[str, Any]) -> bool:
    set_clause, values = _build_set(data, VITIGNI_FIELDS)
    if not set_clause:
        return False
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {TABELLE['vitigni']} SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
        values + [vid],
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def delete_vitigno(vid: int) -> bool:
    """Elimina vitigno. Falla se referenziato dalle bottiglie."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    # Verifica se referenziato in uno dei 5 slot di vini_bottiglie_v2
    n_uses = 0
    for slot in range(1, 6):
        col = f"vitigno_{slot}_id"
        n = cur.execute(
            f"SELECT COUNT(*) FROM {TABELLE['bottiglie']} WHERE {col} = ?", (vid,)
        ).fetchone()[0]
        n_uses += n
    if n_uses > 0:
        conn.close()
        raise ValueError(f"Impossibile eliminare: {n_uses} bottiglie usano questo vitigno")
    cur.execute(f"DELETE FROM {TABELLE['vitigni']} WHERE id = ?", (vid,))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


# ============================================================
# MADRE (etichetta stabile)
# ============================================================
MADRE_FIELDS = {
    "produttore_id", "fornitore_id", "denominazione_id",
    "descrizione", "tipologia", "nazione", "regione",
    "grado_alcolico_tipico", "abbinamenti", "note_madre",
}


def list_madre(
    search: Optional[str] = None,
    produttore_id: Optional[int] = None,
    denominazione_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    where = []
    params: list = []
    if search:
        where.append("descrizione LIKE ?")
        params.append(f"%{search}%")
    if produttore_id is not None:
        where.append("produttore_id = ?")
        params.append(produttore_id)
    if denominazione_id is not None:
        where.append("denominazione_id = ?")
        params.append(denominazione_id)
    where_sql = "WHERE " + " AND ".join(where) if where else ""
    rows = cur.execute(
        f"SELECT * FROM {TABELLE['madre']} {where_sql} ORDER BY descrizione",
        params,
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_madre(mid: int) -> Optional[Dict[str, Any]]:
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        f"SELECT * FROM {TABELLE['madre']} WHERE id = ?", (mid,)
    ).fetchone()
    conn.close()
    return _row_to_dict(row)


def create_madre(data: Dict[str, Any]) -> int:
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cols = [k for k in data.keys() if k in MADRE_FIELDS]
    for required in ("produttore_id", "descrizione", "tipologia"):
        if required not in cols:
            raise ValueError(f"{required} è obbligatorio")
    placeholders = ", ".join(["?"] * len(cols))
    cur.execute(
        f"INSERT INTO {TABELLE['madre']} ({', '.join(cols)}) VALUES ({placeholders})",
        [data[c] for c in cols],
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_madre(mid: int, data: Dict[str, Any]) -> bool:
    set_clause, values = _build_set(data, MADRE_FIELDS)
    if not set_clause:
        return False
    conn = get_magazzino_connection()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE {TABELLE['madre']} SET {set_clause}, updated_at = datetime('now') WHERE id = ?",
        values + [mid],
    )
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


def delete_madre(mid: int) -> bool:
    """Elimina madre. Falla se ci sono bottiglie collegate."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_bot = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['bottiglie']} WHERE madre_id = ?", (mid,)
    ).fetchone()[0]
    if n_bot > 0:
        conn.close()
        raise ValueError(f"Impossibile eliminare: {n_bot} bottiglie collegate al madre")
    cur.execute(f"DELETE FROM {TABELLE['madre']} WHERE id = ?", (mid,))
    ok = cur.rowcount > 0
    conn.commit()
    conn.close()
    return ok


# ============================================================
# STATS — overview per dashboard
# ============================================================
def get_stats() -> Dict[str, int]:
    """Conteggio di base per ogni anagrafica (utile per UI 'beta')."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    stats = {}
    for key, tbl in TABELLE.items():
        try:
            stats[key] = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        except sqlite3.OperationalError:
            stats[key] = -1  # tabella non esiste
    conn.close()
    return stats
