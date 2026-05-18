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


def list_produttori(
    search: Optional[str] = None,
    nazione: Optional[str] = None,
    with_counts: bool = False,
    only_orphans: bool = False,
) -> List[Dict[str, Any]]:
    """
    Lista produttori. Quando with_counts=True restituisce anche:
      - n_madre:      numero di vini madre collegati
      - n_bottiglie:  numero di bottiglie (annate) collegate
      - qta_bottiglie: somma QTA_TOTALE delle bottiglie collegate
    only_orphans=True filtra ai soli produttori senza vini madre collegati
    (utili per pulizia anagrafica). Forza with_counts=True.
    """
    if only_orphans:
        with_counts = True

    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    where = []
    params: list = []
    if search:
        where.append("p.nome LIKE ?")
        params.append(f"%{search}%")
    if nazione:
        where.append("p.nazione = ?")
        params.append(nazione)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    if not with_counts:
        rows = cur.execute(
            f"SELECT p.* FROM {TABELLE['produttori']} p {where_sql} ORDER BY p.nome",
            params,
        ).fetchall()
        conn.close()
        return [_row_to_dict(r) for r in rows]

    # Conta madri + bottiglie + giacenza, una query con LEFT JOIN aggregato
    sql = f"""
        SELECT p.*,
               COALESCE(c.n_madre, 0)       AS n_madre,
               COALESCE(c.n_bottiglie, 0)   AS n_bottiglie,
               COALESCE(c.qta_bottiglie, 0) AS qta_bottiglie
        FROM {TABELLE['produttori']} p
        LEFT JOIN (
            SELECT m.produttore_id,
                   COUNT(DISTINCT m.id)              AS n_madre,
                   COUNT(b.id)                       AS n_bottiglie,
                   COALESCE(SUM(b.QTA_TOTALE), 0)    AS qta_bottiglie
            FROM {TABELLE['madre']} m
            LEFT JOIN {TABELLE['bottiglie']} b ON b.madre_id = m.id
            GROUP BY m.produttore_id
        ) c ON c.produttore_id = p.id
        {where_sql}
        ORDER BY p.nome
    """
    rows = cur.execute(sql, params).fetchall()
    conn.close()
    out = [_row_to_dict(r) for r in rows]
    if only_orphans:
        out = [r for r in out if (r.get("n_madre") or 0) == 0]
    return out


def count_vini_per_produttore(pid: int) -> Dict[str, int]:
    """Conta veloce dei vini collegati a un produttore (per dettaglio)."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_madre = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['madre']} WHERE produttore_id = ?", (pid,)
    ).fetchone()[0]
    row = cur.execute(
        f"""SELECT COUNT(b.id), COALESCE(SUM(b.QTA_TOTALE), 0)
            FROM {TABELLE['bottiglie']} b
            JOIN {TABELLE['madre']} m ON m.id = b.madre_id
            WHERE m.produttore_id = ?""",
        (pid,),
    ).fetchone()
    conn.close()
    return {
        "n_madre": n_madre or 0,
        "n_bottiglie": (row[0] if row else 0) or 0,
        "qta_bottiglie": (row[1] if row else 0) or 0,
    }


def list_madri_per_produttore(pid: int) -> List[Dict[str, Any]]:
    """
    Vini madre collegati a un produttore, con conta bottiglie/giacenza per madre.
    Usato dal modale dettaglio Produttore (M2.5.1).
    """
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = cur.execute(
        f"""
        SELECT m.id, m.descrizione, m.tipologia, m.denominazione_id,
               CASE WHEN d.id IS NOT NULL THEN d.nome || ' ' || d.tipo ELSE NULL END AS denominazione_display,
               COUNT(b.id)                    AS n_bottiglie,
               COALESCE(SUM(b.QTA_TOTALE), 0) AS qta_tot
        FROM {TABELLE['madre']} m
        LEFT JOIN {TABELLE['denominazioni']} d ON d.id = m.denominazione_id
        LEFT JOIN {TABELLE['bottiglie']}     b ON b.madre_id = m.id
        WHERE m.produttore_id = ?
        GROUP BY m.id
        ORDER BY m.descrizione
        """,
        (pid,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def merge_produttori(source_id: int, target_id: int) -> Dict[str, Any]:
    """
    Fonde il produttore `source_id` dentro `target_id`:
      - sposta tutti i vini madre dal source al target (UPDATE produttore_id)
      - aggiorna updated_at dei madre toccati
      - elimina il produttore source
    Ritorna {source_id, target_id, n_madre_spostati}.

    NB: la sync cache lato bottiglie (PRODUTTORE, NAZIONE, REGIONE testuali)
    NON è fatta qui — la fa il router via ana_sync.sync_bottiglie_from_produttore
    sull'ID target dopo il merge, così le bottiglie ereditano i campi canonici
    del produttore di destinazione.
    """
    if source_id == target_id:
        raise ValueError("source e target sono lo stesso produttore")
    conn = get_magazzino_connection()
    cur = conn.cursor()

    for pid, label in [(source_id, "source"), (target_id, "target")]:
        if not cur.execute(
            f"SELECT 1 FROM {TABELLE['produttori']} WHERE id = ?", (pid,)
        ).fetchone():
            conn.close()
            raise ValueError(f"Produttore {label} {pid} non trovato")

    cur.execute(
        f"UPDATE {TABELLE['madre']} "
        f"SET produttore_id = ?, updated_at = datetime('now') "
        f"WHERE produttore_id = ?",
        (target_id, source_id),
    )
    n_madre_spostati = cur.rowcount

    cur.execute(f"DELETE FROM {TABELLE['produttori']} WHERE id = ?", (source_id,))
    conn.commit()
    conn.close()
    return {
        "source_id": source_id,
        "target_id": target_id,
        "n_madre_spostati": n_madre_spostati,
    }


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


def list_fornitori(
    search: Optional[str] = None,
    with_counts: bool = False,
    only_orphans: bool = False,
) -> List[Dict[str, Any]]:
    """
    Lista distributori (fornitori) — identico pattern di list_produttori.
    with_counts=True → aggiunge n_madre/n_bottiglie/qta_bottiglie.
    only_orphans=True → solo fornitori senza vini collegati.
    """
    if only_orphans:
        with_counts = True

    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    where = []
    params: list = []
    if search:
        where.append("(f.nome LIKE ? OR f.rappresentante_nome LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    if not with_counts:
        rows = cur.execute(
            f"SELECT f.* FROM {TABELLE['fornitori']} f {where_sql} ORDER BY f.nome",
            params,
        ).fetchall()
        conn.close()
        return [_row_to_dict(r) for r in rows]

    sql = f"""
        SELECT f.*,
               COALESCE(c.n_madre, 0)       AS n_madre,
               COALESCE(c.n_bottiglie, 0)   AS n_bottiglie,
               COALESCE(c.qta_bottiglie, 0) AS qta_bottiglie
        FROM {TABELLE['fornitori']} f
        LEFT JOIN (
            SELECT m.fornitore_id,
                   COUNT(DISTINCT m.id)              AS n_madre,
                   COUNT(b.id)                       AS n_bottiglie,
                   COALESCE(SUM(b.QTA_TOTALE), 0)    AS qta_bottiglie
            FROM {TABELLE['madre']} m
            LEFT JOIN {TABELLE['bottiglie']} b ON b.madre_id = m.id
            WHERE m.fornitore_id IS NOT NULL
            GROUP BY m.fornitore_id
        ) c ON c.fornitore_id = f.id
        {where_sql}
        ORDER BY f.nome
    """
    rows = cur.execute(sql, params).fetchall()
    conn.close()
    out = [_row_to_dict(r) for r in rows]
    if only_orphans:
        out = [r for r in out if (r.get("n_madre") or 0) == 0]
    return out


def count_vini_per_fornitore(fid: int) -> Dict[str, int]:
    """Conta veloce dei vini collegati a un fornitore."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_madre = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['madre']} WHERE fornitore_id = ?", (fid,)
    ).fetchone()[0]
    row = cur.execute(
        f"""SELECT COUNT(b.id), COALESCE(SUM(b.QTA_TOTALE), 0)
            FROM {TABELLE['bottiglie']} b
            JOIN {TABELLE['madre']} m ON m.id = b.madre_id
            WHERE m.fornitore_id = ?""",
        (fid,),
    ).fetchone()
    conn.close()
    return {
        "n_madre": n_madre or 0,
        "n_bottiglie": (row[0] if row else 0) or 0,
        "qta_bottiglie": (row[1] if row else 0) or 0,
    }


def list_madri_per_fornitore(fid: int) -> List[Dict[str, Any]]:
    """Vini madre distribuiti da un fornitore (per modale dettaglio)."""
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = cur.execute(
        f"""
        SELECT m.id, m.descrizione, m.tipologia, m.produttore_id, m.denominazione_id,
               p.nome AS produttore_nome,
               CASE WHEN d.id IS NOT NULL THEN d.nome || ' ' || d.tipo ELSE NULL END AS denominazione_display,
               COUNT(b.id)                    AS n_bottiglie,
               COALESCE(SUM(b.QTA_TOTALE), 0) AS qta_tot
        FROM {TABELLE['madre']} m
        LEFT JOIN {TABELLE['produttori']}    p ON p.id = m.produttore_id
        LEFT JOIN {TABELLE['denominazioni']} d ON d.id = m.denominazione_id
        LEFT JOIN {TABELLE['bottiglie']}     b ON b.madre_id = m.id
        WHERE m.fornitore_id = ?
        GROUP BY m.id
        ORDER BY p.nome, m.descrizione
        """,
        (fid,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def merge_fornitori(source_id: int, target_id: int) -> Dict[str, Any]:
    """Fonde fornitore source in target (sposta i madre, elimina source)."""
    if source_id == target_id:
        raise ValueError("source e target sono lo stesso fornitore")
    conn = get_magazzino_connection()
    cur = conn.cursor()
    for fid, label in [(source_id, "source"), (target_id, "target")]:
        if not cur.execute(
            f"SELECT 1 FROM {TABELLE['fornitori']} WHERE id = ?", (fid,)
        ).fetchone():
            conn.close()
            raise ValueError(f"Fornitore {label} {fid} non trovato")
    cur.execute(
        f"UPDATE {TABELLE['madre']} "
        f"SET fornitore_id = ?, updated_at = datetime('now') "
        f"WHERE fornitore_id = ?",
        (target_id, source_id),
    )
    n_madre_spostati = cur.rowcount
    cur.execute(f"DELETE FROM {TABELLE['fornitori']} WHERE id = ?", (source_id,))
    conn.commit()
    conn.close()
    return {
        "source_id": source_id,
        "target_id": target_id,
        "n_madre_spostati": n_madre_spostati,
    }


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


def count_vini_per_denominazione(did: int) -> Dict[str, int]:
    """Conta vini madre/bottiglie/giacenza per una denominazione."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    n_madre = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['madre']} WHERE denominazione_id = ?", (did,)
    ).fetchone()[0]
    row = cur.execute(
        f"""SELECT COUNT(b.id), COALESCE(SUM(b.QTA_TOTALE), 0)
            FROM {TABELLE['bottiglie']} b
            JOIN {TABELLE['madre']} m ON m.id = b.madre_id
            WHERE m.denominazione_id = ?""",
        (did,),
    ).fetchone()
    conn.close()
    return {
        "n_madre": n_madre or 0,
        "n_bottiglie": (row[0] if row else 0) or 0,
        "qta_bottiglie": (row[1] if row else 0) or 0,
    }


def list_madri_per_denominazione(did: int) -> List[Dict[str, Any]]:
    """Vini madre con questa denominazione."""
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = cur.execute(
        f"""
        SELECT m.id, m.descrizione, m.tipologia, m.produttore_id,
               p.nome AS produttore_nome,
               COUNT(b.id)                    AS n_bottiglie,
               COALESCE(SUM(b.QTA_TOTALE), 0) AS qta_tot
        FROM {TABELLE['madre']} m
        LEFT JOIN {TABELLE['produttori']} p ON p.id = m.produttore_id
        LEFT JOIN {TABELLE['bottiglie']}  b ON b.madre_id = m.id
        WHERE m.denominazione_id = ?
        GROUP BY m.id
        ORDER BY p.nome, m.descrizione
        """,
        (did,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


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


def merge_denominazioni(source_id: int, target_id: int) -> Dict[str, Any]:
    """
    Fonde la denominazione `source_id` dentro `target_id`:
      - sposta tutti i vini madre da source a target (UPDATE denominazione_id)
      - aggiorna updated_at dei madre toccati
      - elimina la denominazione source
    Tipico uso: l'utente aveva aggiunto a mano "Barolo DOCG" custom, poi il sync
    eAmbrosia/MASAF ne ha portata una con codice ufficiale → si fondono.

    Ritorna {source_id, target_id, n_madre_spostati}.
    Solleva ValueError se source==target o se uno dei due non esiste.

    NB: come per produttori/fornitori, la sync cache lato bottiglie (campi
    PRODUTTORE, NAZIONE, REGIONE, DENOMINAZIONE testuali) richiede una passata
    successiva — gli aggiornamenti del campo cache `DENOMINAZIONE` sulle
    bottiglie non sono automatici qui. Il router può chiamare `sync_bottiglie_*`
    di conseguenza (oggi non esiste sync_bottiglie_from_denominazione → si usa
    sync_all sul madre target via la cascade del PATCH madre, oppure si invoca
    il sync globale dall'UI).
    """
    if source_id == target_id:
        raise ValueError("source e target sono la stessa denominazione")
    conn = get_magazzino_connection()
    cur = conn.cursor()

    for did, label in [(source_id, "source"), (target_id, "target")]:
        if not cur.execute(
            f"SELECT 1 FROM {TABELLE['denominazioni']} WHERE id = ?", (did,)
        ).fetchone():
            conn.close()
            raise ValueError(f"Denominazione {label} {did} non trovata")

    cur.execute(
        f"UPDATE {TABELLE['madre']} "
        f"SET denominazione_id = ?, updated_at = datetime('now') "
        f"WHERE denominazione_id = ?",
        (target_id, source_id),
    )
    n_madre_spostati = cur.rowcount

    cur.execute(f"DELETE FROM {TABELLE['denominazioni']} WHERE id = ?", (source_id,))
    conn.commit()
    conn.close()
    return {
        "source_id": source_id,
        "target_id": target_id,
        "n_madre_spostati": n_madre_spostati,
    }


# ============================================================
# VITIGNI
# ============================================================
VITIGNI_FIELDS = {"nome", "note"}


def list_vitigni(
    search: Optional[str] = None,
    with_counts: bool = False,
    only_orphans: bool = False,
) -> List[Dict[str, Any]]:
    """
    Lista vitigni. Con with_counts=True aggiunge:
      - n_bottiglie:  bottiglie che usano questo vitigno (su uno qualsiasi dei 5 slot)
      - n_madre:      vini madre distinti che usano questo vitigno
      - qta_bottiglie: somma QTA_TOTALE delle bottiglie che lo usano
    only_orphans=True restituisce solo i vitigni senza bottiglie collegate
    (utili per pulizia anagrafica). Forza with_counts=True.

    NB: i vitigni sono linkati alle bottiglie via 5 slot denormalizzati
    (vitigno_1_id … vitigno_5_id). Costruiamo una sub-query UNION per
    avere una unica colonna "vitigno_id" per ogni bottiglia, poi GROUP BY.
    """
    if only_orphans:
        with_counts = True

    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    where = []
    params: list = []
    if search:
        where.append("v.nome LIKE ?")
        params.append(f"%{search}%")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    if not with_counts:
        rows = cur.execute(
            f"SELECT v.* FROM {TABELLE['vitigni']} v {where_sql} ORDER BY v.nome",
            params,
        ).fetchall()
        conn.close()
        return [_row_to_dict(r) for r in rows]

    # Sub-query: bottiglia × slot → vitigno_id (esplodiamo i 5 slot in righe).
    # Usiamo COUNT DISTINCT madre_id per il count vini madre.
    btg_t = TABELLE['bottiglie']
    union_slots = " UNION ALL ".join(
        f"SELECT id AS bid, madre_id, COALESCE(QTA_TOTALE,0) AS qta, vitigno_{s}_id AS vit FROM {btg_t} WHERE vitigno_{s}_id IS NOT NULL"
        for s in range(1, 6)
    )
    sql = f"""
        SELECT v.*,
               COALESCE(c.n_madre, 0)       AS n_madre,
               COALESCE(c.n_bottiglie, 0)   AS n_bottiglie,
               COALESCE(c.qta_bottiglie, 0) AS qta_bottiglie
        FROM {TABELLE['vitigni']} v
        LEFT JOIN (
            SELECT vit AS vitigno_id,
                   COUNT(DISTINCT madre_id) AS n_madre,
                   COUNT(DISTINCT bid)      AS n_bottiglie,
                   SUM(qta)                 AS qta_bottiglie
            FROM ({union_slots})
            GROUP BY vit
        ) c ON c.vitigno_id = v.id
        {where_sql}
        ORDER BY v.nome
    """
    rows = cur.execute(sql, params).fetchall()
    conn.close()
    out = [_row_to_dict(r) for r in rows]
    if only_orphans:
        out = [r for r in out if (r.get("n_bottiglie") or 0) == 0]
    return out


def count_vini_per_vitigno(vid: int) -> Dict[str, int]:
    """Conta veloce bottiglie/madri/giacenza che usano un vitigno (su tutti gli slot)."""
    conn = get_magazzino_connection()
    cur = conn.cursor()
    btg_t = TABELLE['bottiglie']
    or_clause = " OR ".join(f"vitigno_{s}_id = ?" for s in range(1, 6))
    params = [vid] * 5
    n_bottiglie = cur.execute(
        f"SELECT COUNT(*) FROM {btg_t} WHERE {or_clause}", params
    ).fetchone()[0]
    n_madre = cur.execute(
        f"SELECT COUNT(DISTINCT madre_id) FROM {btg_t} WHERE ({or_clause}) AND madre_id IS NOT NULL",
        params,
    ).fetchone()[0]
    qta = cur.execute(
        f"SELECT COALESCE(SUM(QTA_TOTALE), 0) FROM {btg_t} WHERE {or_clause}",
        params,
    ).fetchone()[0]
    conn.close()
    return {
        "n_madre": n_madre or 0,
        "n_bottiglie": n_bottiglie or 0,
        "qta_bottiglie": qta or 0,
    }


def list_madri_per_vitigno(vid: int) -> List[Dict[str, Any]]:
    """
    Vini madre che hanno almeno una bottiglia (annata) con questo vitigno
    in uno dei 5 slot. Aggrega su madre con conta bottiglie/giacenza.
    """
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    btg_t = TABELLE['bottiglie']
    or_clause = " OR ".join(f"b.vitigno_{s}_id = ?" for s in range(1, 6))
    params = [vid] * 5
    rows = cur.execute(
        f"""
        SELECT m.id, m.descrizione, m.tipologia,
               p.nome AS produttore_nome,
               CASE WHEN d.id IS NOT NULL THEN d.nome || ' ' || d.tipo ELSE NULL END AS denominazione_display,
               COUNT(DISTINCT b.id)             AS n_bottiglie,
               COALESCE(SUM(b.QTA_TOTALE), 0)   AS qta_tot
        FROM {btg_t} b
        JOIN {TABELLE['madre']}         m ON m.id = b.madre_id
        LEFT JOIN {TABELLE['produttori']} p ON p.id = m.produttore_id
        LEFT JOIN {TABELLE['denominazioni']} d ON d.id = m.denominazione_id
        WHERE {or_clause}
        GROUP BY m.id
        ORDER BY p.nome, m.descrizione
        """,
        params,
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def merge_vitigni(source_id: int, target_id: int) -> Dict[str, Any]:
    """
    Fonde il vitigno source dentro target. Per ogni slot 1..5:
      - se la bottiglia ha source in quello slot → lo sostituisce con target
    Attenzione: se una bottiglia ha SIA source SIA target in slot diversi,
    dopo il merge avrebbe target due volte → in quel caso si azzera lo slot
    "source" (per evitare duplicati con stessi target_id) e si conserva
    quello che era già target. Le % vengono ridistribuite manualmente
    dall'utente (non automatizzabile).

    Ritorna {source_id, target_id, n_bottiglie_modificate}.
    Solleva ValueError se source==target o id non esistenti.
    """
    if source_id == target_id:
        raise ValueError("source e target sono lo stesso vitigno")

    conn = get_magazzino_connection()
    cur = conn.cursor()

    for vid, label in [(source_id, "source"), (target_id, "target")]:
        if not cur.execute(
            f"SELECT 1 FROM {TABELLE['vitigni']} WHERE id = ?", (vid,)
        ).fetchone():
            conn.close()
            raise ValueError(f"Vitigno {label} {vid} non trovato")

    btg_t = TABELLE['bottiglie']
    n_modificate = 0
    # Per ogni slot, prima azzera le righe che avrebbero entrambi source+target
    # (collisione), poi rimpiazza source → target.
    for slot in range(1, 6):
        col = f"vitigno_{slot}_id"
        # collisione: stessa bottiglia ha target in ALTRO slot e source qui → azzera questo slot
        other_slots = [f"vitigno_{s}_id" for s in range(1, 6) if s != slot]
        any_other_eq_target = " OR ".join(f"{c} = ?" for c in other_slots)
        cur.execute(
            f"UPDATE {btg_t} SET {col} = NULL "
            f"WHERE {col} = ? AND ({any_other_eq_target})",
            [source_id] + [target_id] * len(other_slots),
        )
        n_modificate += cur.rowcount
        # rimpiazza source → target negli slot rimasti (no collisione)
        cur.execute(
            f"UPDATE {btg_t} SET {col} = ? WHERE {col} = ?",
            (target_id, source_id),
        )
        n_modificate += cur.rowcount

    cur.execute(f"DELETE FROM {TABELLE['vitigni']} WHERE id = ?", (source_id,))
    conn.commit()
    conn.close()
    return {
        "source_id": source_id,
        "target_id": target_id,
        "n_bottiglie_modificate": n_modificate,
    }


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
    # M2.9 (mig 130): nuovi campi per descrizione composta automaticamente.
    "nome_etichetta", "descrizione_auto",
    # M2.9-bis (mig 131): 5 slot vitigni strutturati sul madre = vitigni "tipici".
    # Semantica distinta dai vitigni "effettivi" sulla bottiglia (per annata):
    # qui sta il blend di riferimento dell'etichetta, lì quello realmente
    # prodotto in una specifica annata (possono divergere senza sync).
    "vitigno_1_id", "vitigno_1_pct",
    "vitigno_2_id", "vitigno_2_pct",
    "vitigno_3_id", "vitigno_3_pct",
    "vitigno_4_id", "vitigno_4_pct",
    "vitigno_5_id", "vitigno_5_pct",
}


def list_madre(
    search: Optional[str] = None,
    produttore_id: Optional[int] = None,
    denominazione_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Lista madri con campi decorati per la UI:
      - `denominazione_label` ("{nome} {tipo}" via JOIN su denominazioni_v2)
      - `vitigni_list` (5 slot risolti via 5 JOIN su vitigni_v2)

    Un singolo SELECT con 6 LEFT JOIN evita la "N+1" query per ogni madre.
    Per 1287 madri il costo è trascurabile in SQLite.
    """
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    where = []
    params: list = []
    if search:
        where.append("m.descrizione LIKE ?")
        params.append(f"%{search}%")
    if produttore_id is not None:
        where.append("m.produttore_id = ?")
        params.append(produttore_id)
    if denominazione_id is not None:
        where.append("m.denominazione_id = ?")
        params.append(denominazione_id)
    where_sql = "WHERE " + " AND ".join(where) if where else ""

    rows = cur.execute(f"""
        SELECT m.*,
               d.nome AS _deno_nome, d.tipo AS _deno_tipo,
               v1.nome AS _v1_nome, v2.nome AS _v2_nome, v3.nome AS _v3_nome,
               v4.nome AS _v4_nome, v5.nome AS _v5_nome
        FROM {TABELLE['madre']} m
        LEFT JOIN {TABELLE['denominazioni']} d ON d.id = m.denominazione_id
        LEFT JOIN {TABELLE['vitigni']} v1 ON v1.id = m.vitigno_1_id
        LEFT JOIN {TABELLE['vitigni']} v2 ON v2.id = m.vitigno_2_id
        LEFT JOIN {TABELLE['vitigni']} v3 ON v3.id = m.vitigno_3_id
        LEFT JOIN {TABELLE['vitigni']} v4 ON v4.id = m.vitigno_4_id
        LEFT JOIN {TABELLE['vitigni']} v5 ON v5.id = m.vitigno_5_id
        {where_sql}
        ORDER BY m.descrizione
    """, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        madre = _row_to_dict(r)
        # Estrai e rimuovi i campi "alias" del JOIN (iniziano con underscore)
        deno_nome = madre.pop("_deno_nome", None)
        deno_tipo = madre.pop("_deno_tipo", None)
        madre["denominazione_label"] = (
            f"{deno_nome} {deno_tipo}".strip() if deno_nome else ""
        )
        # vitigni_list dai JOIN
        vit_list = []
        for i in range(1, 6):
            nome = madre.pop(f"_v{i}_nome", None)
            vid = madre.get(f"vitigno_{i}_id")
            vpct = madre.get(f"vitigno_{i}_pct")
            if vid:
                vit_list.append({
                    "vitigno_id": vid,
                    "vitigno_label": nome or f"#{vid}",
                    "pct": vpct,
                })
        madre["vitigni_list"] = vit_list
        result.append(madre)
    return result


def get_madre(mid: int) -> Optional[Dict[str, Any]]:
    """
    Ritorna il madre + due campi decorati per la UI:
      - `denominazione_label`: "{nome} {tipo}" risolto via JOIN dalla FK
        denominazione_id (es. "Barolo DOCG"). Stringa vuota se senza deno.
      - `vitigni_list`: i 5 slot vitigno risolti via JOIN (vitigno_id → nome).
        Solo slot popolati; ordine = posizione (1..5).

    Senza queste decorazioni la UI mostrava la descrizione composta incompleta
    dopo la promozione di un madre legacy (M2.9-bis bug 2026-05-18): il madre
    aggiornato tornava con `denominazione_id` ma senza label, quindi
    `componi_descrizione` lato FE non aveva il pezzo "Barolo DOCG" da inserire.
    """
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        f"SELECT * FROM {TABELLE['madre']} WHERE id = ?", (mid,)
    ).fetchone()
    if not row:
        conn.close()
        return None
    madre = _row_to_dict(row)

    # Decora denominazione_label dalla FK (utile alla UI per descrizione composta)
    denominazione_label = ""
    if madre.get("denominazione_id"):
        d_row = cur.execute(
            f"SELECT nome, tipo FROM {TABELLE['denominazioni']} WHERE id = ?",
            (madre["denominazione_id"],),
        ).fetchone()
        if d_row:
            denominazione_label = f"{d_row['nome']} {d_row['tipo']}".strip()
    madre["denominazione_label"] = denominazione_label

    # Decora con vitigni_list (slot risolti). Best-effort: salta gli slot vuoti.
    vit_list = []
    for i in range(1, 6):
        vid = madre.get(f"vitigno_{i}_id")
        vpct = madre.get(f"vitigno_{i}_pct")
        if not vid:
            continue
        v_row = cur.execute(
            f"SELECT nome FROM {TABELLE['vitigni']} WHERE id = ?", (vid,)
        ).fetchone()
        vit_list.append({
            "vitigno_id": vid,
            "vitigno_label": v_row["nome"] if v_row else f"#{vid}",
            "pct": vpct,
        })
    madre["vitigni_list"] = vit_list

    conn.close()
    return madre


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


def promote_madre_a_composto(
    mid: int,
    denominazione_id: Optional[int] = None,
    nome_etichetta: Optional[str] = None,
    grado_alcolico_tipico: Optional[float] = None,
    vitigni_stringa: Optional[str] = None,
    vitigni: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Promuove un vino madre "legacy" (descrizione testuale libera) al nuovo schema
    a descrizione composta automatica (M2.9, 2026-05-16 → M2.9-bis 2026-05-18).

    Cosa fa:
      1. Aggiorna i sotto-campi forniti (denominazione_id, nome_etichetta,
         grado_alcolico_tipico).
      2. Se passata `vitigni` (lista strutturata), aggiorna i 5 slot
         vitigno_X_id/pct sul madre (mig 131).
      3. Ricompone la descrizione testuale come:
         "{denominazione_display} {nome_etichetta} ({vitigni}) {grado}%"
      4. Setta descrizione_auto = 1 (segnale: questo madre è "pulito").

    Parametri vitigni — accetta DUE forme (compatibilità FE):
      - `vitigni`: lista [{vitigno_id: int, pct: float}, ...] (preferito,
        persistito strutturato negli slot 1..5 del madre)
      - `vitigni_stringa`: testo già formattato "Nebbiolo 95%, Barbera 5%"
        (fallback, usato SOLO per la composizione descrizione; non persistito
        strutturato). Se entrambi sono passati, vitigni vince per la
        persistenza strutturata e per la composizione (ricalcolata dai nomi
        risolti).

    Ritorna il record madre aggiornato (con vitigni_list già decorata), o None
    se non esiste.
    """
    from app.services.vini_descrizione import componi_descrizione, vitigni_to_string

    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Carica madre + denominazione display per la composizione
    row = cur.execute(
        f"SELECT * FROM {TABELLE['madre']} WHERE id = ?", (mid,)
    ).fetchone()
    if not row:
        conn.close()
        return None
    madre = _row_to_dict(row)

    # Risolvi denominazione display dalla FK target (se cambia, prende il nuovo;
    # se invariata, riusa quella attuale del madre)
    target_deno_id = denominazione_id if denominazione_id is not None else madre.get("denominazione_id")
    denominazione_display = None
    if target_deno_id:
        d_row = cur.execute(
            f"SELECT nome, tipo FROM {TABELLE['denominazioni']} WHERE id = ?", (target_deno_id,)
        ).fetchone()
        if d_row:
            denominazione_display = f"{d_row['nome']} {d_row['tipo']}".strip()

    # Risolvi vitigni: se passata lista strutturata, risolvi i nomi via JOIN
    # e ri-costruisci la stringa formattata (sovrascrivi vitigni_stringa).
    vitigni_strutturati = None  # lista [{vitigno_id, vitigno_label, pct}] decorata
    if vitigni:
        vitigni_strutturati = []
        for v in vitigni[:5]:  # max 5 slot
            try:
                vid = int(v.get("vitigno_id") or v.get("id"))
            except (TypeError, ValueError):
                continue
            pct = v.get("pct")
            try:
                pct = float(pct) if pct not in (None, "", 0) else None
            except (TypeError, ValueError):
                pct = None
            vrow = cur.execute(
                f"SELECT nome FROM {TABELLE['vitigni']} WHERE id = ?", (vid,)
            ).fetchone()
            if not vrow:
                continue  # vitigno_id non esistente: skip
            vitigni_strutturati.append({
                "vitigno_id": vid,
                "vitigno_label": vrow["nome"],
                "pct": pct,
            })
        # Stringa per descrizione: ricalcolata sui dati strutturati appena risolti
        vitigni_stringa = vitigni_to_string(vitigni_strutturati)

    # Compone descrizione con i nuovi campi (fallback ai valori già sul madre)
    nuova_descr = componi_descrizione(
        denominazione=denominazione_display,
        nome_etichetta=nome_etichetta if nome_etichetta is not None else madre.get("nome_etichetta"),
        vitigni=vitigni_stringa,
        grado=grado_alcolico_tipico if grado_alcolico_tipico is not None else madre.get("grado_alcolico_tipico"),
    )

    # Update atomico — solo se descrizione composta non è vuota (sennò sarebbe un downgrade)
    if not nuova_descr.strip():
        conn.close()
        raise ValueError("Promozione fallita: la descrizione composta sarebbe vuota. Compila almeno denominazione + nome_etichetta o grado.")

    updates = ["descrizione = ?", "descrizione_auto = 1", "updated_at = datetime('now')"]
    values: list = [nuova_descr]
    if denominazione_id is not None:
        updates.append("denominazione_id = ?")
        values.append(denominazione_id)
    if nome_etichetta is not None:
        updates.append("nome_etichetta = ?")
        values.append(nome_etichetta)
    if grado_alcolico_tipico is not None:
        updates.append("grado_alcolico_tipico = ?")
        values.append(grado_alcolico_tipico)
    # Vitigni strutturati: scrivo i 5 slot (riempio quelli passati, azzero gli altri)
    if vitigni_strutturati is not None:
        for i in range(5):
            slot = vitigni_strutturati[i] if i < len(vitigni_strutturati) else None
            updates.append(f"vitigno_{i+1}_id = ?")
            updates.append(f"vitigno_{i+1}_pct = ?")
            values.append(slot["vitigno_id"] if slot else None)
            values.append(slot["pct"] if slot else None)

    cur.execute(
        f"UPDATE {TABELLE['madre']} SET {', '.join(updates)} WHERE id = ?",
        values + [mid],
    )
    conn.commit()
    conn.close()

    # Ricarica via get_madre() così otteniamo anche vitigni_list decorata
    return get_madre(mid)


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


def list_bottiglie_by_madre(mid: int) -> List[Dict[str, Any]]:
    """
    Ritorna le bottiglie (annate) collegate a un madre — Fase 8 vista
    esplorativa madre → annate. Read-only.

    Solo campi annata-specifici + giacenze + stati. I campi anagrafici
    (PRODUTTORE/DESCRIZIONE/...) NON sono inclusi: sono ridondanza sincronizzata,
    li conosci dal madre.
    """
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = cur.execute(
        f"""
        SELECT
            id, id_excel,
            ANNATA, FORMATO,
            PREZZO_CARTA, EURO_LISTINO, SCONTO, PREZZO_CALICE, PREZZO_CALICE_MANUALE,
            GRADO_ALCOLICO,
            STATO_VENDITA, STATO_RIORDINO, STATO_CONSERVAZIONE,
            CARTA, BIOLOGICO, VENDITA_CALICE, BOTTIGLIA_APERTA, DATA_APERTURA,
            FRIGORIFERO, QTA_FRIGO,
            LOCAZIONE_1, QTA_LOC1, LOCAZIONE_2, QTA_LOC2, LOCAZIONE_3, QTA_LOC3,
            QTA_TOTALE,
            NOTE, NOTE_STATO, NOTE_PREZZO,
            vitigno_1_id, vitigno_1_pct, vitigno_2_id, vitigno_2_pct,
            vitigno_3_id, vitigno_3_pct, vitigno_4_id, vitigno_4_pct,
            vitigno_5_id, vitigno_5_pct,
            CREATED_AT, UPDATED_AT
        FROM {TABELLE['bottiglie']}
        WHERE madre_id = ?
        ORDER BY
          CASE WHEN ANNATA = '' OR ANNATA IS NULL THEN 1 ELSE 0 END,
          ANNATA DESC,
          FORMATO
        """,
        (mid,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


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
