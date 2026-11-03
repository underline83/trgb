# Modulo: platform (lettura fatture elettroniche) — [core]
"""
Lettura delle righe delle fatture elettroniche (tabelle fe_* in foodcost.db,
modulo acquisti) per gli altri moduli, in SOLA LETTURA.

Regola 4 della disciplina modulare: chi ha bisogno delle righe di fattura
(es. vini multi-fornitore, VMF.3) passa da qui e non legge le tabelle di
acquisti per conto suo.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.models.foodcost_db import get_foodcost_connection

_CAMPI = """
    r.id AS fe_riga_id, r.fattura_id, r.numero_linea, r.descrizione, r.codice_articolo,
    r.quantita, r.unita_misura, r.prezzo_unitario, r.prezzo_totale, r.aliquota_iva,
    r.categoria_id, r.sottocategoria_id,
    f.fornitore_nome, f.fornitore_piva, f.numero_fattura, f.data_fattura, f.tipo_documento
"""


def righe(dal: str, al: Optional[str] = None, categoria_id: Optional[int] = None,
          piva: Optional[str] = None, sottocategoria_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Righe di fattura (non note di credito) dalla data `dal`, opzionalmente
    filtrate per categoria di costo e P.IVA del fornitore."""
    sql = (f"SELECT {_CAMPI} FROM fe_righe r JOIN fe_fatture f ON f.id = r.fattura_id "
           "WHERE f.data_fattura >= ? AND COALESCE(f.tipo_documento,'TD01') NOT IN ('TD04','TD05')")
    args: List[Any] = [dal]
    if al:
        sql += " AND f.data_fattura <= ?"
        args.append(al)
    if categoria_id is not None:
        sql += " AND r.categoria_id = ?"
        args.append(categoria_id)
    if piva:
        sql += " AND f.fornitore_piva = ?"
        args.append(piva)
    if sottocategoria_id is not None:
        sql += " AND r.sottocategoria_id = ?"
        args.append(sottocategoria_id)
    sql += " ORDER BY f.data_fattura, r.fattura_id, r.numero_linea"
    conn = get_foodcost_connection()
    try:
        return [dict(x) for x in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()


def riga(fe_riga_id: int) -> Optional[Dict[str, Any]]:
    conn = get_foodcost_connection()
    try:
        x = conn.execute(f"SELECT {_CAMPI} FROM fe_righe r JOIN fe_fatture f ON f.id = r.fattura_id "
                         "WHERE r.id = ?", (fe_riga_id,)).fetchone()
        return dict(x) if x else None
    finally:
        conn.close()


def categoria_id_per_nome(nome: str) -> Optional[int]:
    conn = get_foodcost_connection()
    try:
        x = conn.execute("SELECT id FROM fe_categorie WHERE UPPER(nome) = UPPER(?)", (nome,)).fetchone()
        return int(x["id"]) if x else None
    finally:
        conn.close()


def sottocategoria_id_per_nome(categoria: str, nome: str) -> Optional[int]:
    conn = get_foodcost_connection()
    try:
        x = conn.execute(
            "SELECT s.id FROM fe_sottocategorie s JOIN fe_categorie c ON c.id = s.categoria_id "
            "WHERE UPPER(c.nome) = UPPER(?) AND UPPER(s.nome) = UPPER(?)", (categoria, nome)).fetchone()
        return int(x["id"]) if x else None
    finally:
        conn.close()
