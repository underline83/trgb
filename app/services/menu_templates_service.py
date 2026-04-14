"""
Service libreria Menu Template (mig 080).

I template sono "menu riutilizzabili": snapshot di righe + prezzo suggerito
a persona, legati opzionalmente a un service_type (banchetto, pranzo di
lavoro, aperitivo, alla carta). Si salvano dal composer di un preventivo
("Salva menu come template") o si creano direttamente in Impostazioni.

Applicati a un menu di preventivo via `applica_template_a_menu`: le righe
vengono COPIATE (snapshot immutabile). Modifiche successive al template
non toccano i preventivi gia' compilati.

Tabelle (clienti.sqlite3, mig 080):
- clienti_menu_template (id, nome, descrizione, service_type_id, prezzo_persona, sconto, ...)
- clienti_menu_template_righe (id, template_id, recipe_id, sort_order, category_name, name, description, price)
"""
from __future__ import annotations

from datetime import datetime

from app.models.clienti_db import get_clienti_conn
from app.models.foodcost_db import get_foodcost_connection


def _template_tables_exist(conn) -> bool:
    """La tabella e' introdotta dalla mig 080. Se manca, l'API risponde 503-safe."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_menu_template'"
    ).fetchone()
    return row is not None


def _get_service_types_map() -> dict[int, dict]:
    """Legge i service_types da foodcost.db, ritorna dict id → {id, code, name}.
    Usato per arricchire i template con il nome del tipo servizio senza
    imporre join cross-db."""
    fconn = get_foodcost_connection()
    try:
        rows = fconn.execute(
            "SELECT id, code, name FROM service_types ORDER BY sort_order, name"
        ).fetchall()
        return {int(r["id"]): {"id": int(r["id"]), "code": r["code"], "name": r["name"]} for r in rows}
    finally:
        fconn.close()


def _row_to_dict(row) -> dict:
    return dict(row) if row else None


def _enrich_with_service_type(item: dict, st_map: dict) -> dict:
    """Aggiunge service_type_code / service_type_name al dict template."""
    sid = item.get("service_type_id")
    if sid is not None:
        st = st_map.get(int(sid))
        if st:
            item["service_type_code"] = st["code"]
            item["service_type_name"] = st["name"]
        else:
            item["service_type_code"] = None
            item["service_type_name"] = None
    else:
        item["service_type_code"] = None
        item["service_type_name"] = None
    return item


# ──────────────────────────────────────────────────────────────────────────
# CRUD template
# ──────────────────────────────────────────────────────────────────────────

def lista_templates(service_type_id: int | None = None, q: str | None = None) -> list:
    """Lista template con filtri opzionali.
    Ogni item include anche conteggio righe (n_righe) e service_type_name."""
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return []

        where = ["1=1"]
        params: list = []
        if service_type_id is not None:
            where.append("t.service_type_id = ?")
            params.append(service_type_id)
        if q:
            like = f"%{q}%"
            where.append("(t.nome LIKE ? OR t.descrizione LIKE ?)")
            params.extend([like, like])

        where_sql = " AND ".join(where)
        rows = conn.execute(f"""
            SELECT t.*,
                   (SELECT COUNT(*) FROM clienti_menu_template_righe r
                    WHERE r.template_id = t.id) AS n_righe
            FROM clienti_menu_template t
            WHERE {where_sql}
            ORDER BY t.nome COLLATE NOCASE
        """, params).fetchall()

        st_map = _get_service_types_map()
        return [_enrich_with_service_type(dict(r), st_map) for r in rows]
    finally:
        conn.close()


def get_template(template_id: int) -> dict | None:
    """Template con righe annidate (righe[]). None se non esiste."""
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None
        row = conn.execute(
            "SELECT * FROM clienti_menu_template WHERE id = ?", (template_id,)
        ).fetchone()
        if not row:
            return None

        st_map = _get_service_types_map()
        out = _enrich_with_service_type(dict(row), st_map)

        righe = conn.execute("""
            SELECT * FROM clienti_menu_template_righe
            WHERE template_id = ?
            ORDER BY sort_order, id
        """, (template_id,)).fetchall()
        out["righe"] = [dict(r) for r in righe]
        return out
    finally:
        conn.close()


def crea_template(data: dict, righe: list[dict] | None = None) -> dict | None:
    """Crea un template vuoto (o con righe iniziali).

    data: {nome (required), descrizione, service_type_id, prezzo_persona, sconto}
    righe: [{name, description, price, category_name, recipe_id, sort_order}, ...]
    """
    nome = (data.get("nome") or "").strip()
    if not nome:
        return None

    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None

        cur = conn.execute(
            """INSERT INTO clienti_menu_template
               (nome, descrizione, service_type_id, prezzo_persona, sconto)
               VALUES (?, ?, ?, ?, ?)""",
            (
                nome,
                (data.get("descrizione") or "").strip() or None,
                data.get("service_type_id"),
                float(data.get("prezzo_persona") or 0),
                float(data.get("sconto") or 0),
            ),
        )
        template_id = cur.lastrowid

        if righe:
            for idx, r in enumerate(righe):
                conn.execute(
                    """INSERT INTO clienti_menu_template_righe
                       (template_id, recipe_id, sort_order, category_name, name, description, price)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        template_id,
                        r.get("recipe_id"),
                        int(r.get("sort_order", idx)),
                        (r.get("category_name") or None),
                        (r.get("name") or "").strip(),
                        (r.get("description") or None),
                        float(r.get("price") or 0),
                    ),
                )
        conn.commit()
        return get_template(template_id)
    finally:
        conn.close()


def aggiorna_template(template_id: int, data: dict) -> dict | None:
    """Aggiorna metadati template (nome, descrizione, service_type, prezzo, sconto).
    Le righe si gestiscono via endpoint dedicati (add/remove/sort)."""
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None
        existing = conn.execute(
            "SELECT id FROM clienti_menu_template WHERE id = ?", (template_id,)
        ).fetchone()
        if not existing:
            return None

        campi = []
        params = []
        for k in ("nome", "descrizione", "service_type_id", "prezzo_persona", "sconto"):
            if k in data:
                campi.append(f"{k} = ?")
                v = data[k]
                if k in ("prezzo_persona", "sconto"):
                    v = float(v or 0)
                elif k in ("nome", "descrizione") and isinstance(v, str):
                    v = v.strip() or None
                params.append(v)
        if campi:
            campi.append("updated_at = ?")
            params.append(datetime.now().isoformat(timespec="seconds"))
            params.append(template_id)
            conn.execute(
                f"UPDATE clienti_menu_template SET {', '.join(campi)} WHERE id = ?",
                params,
            )
            conn.commit()
        return get_template(template_id)
    finally:
        conn.close()


def elimina_template(template_id: int) -> bool:
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return False
        existing = conn.execute(
            "SELECT id FROM clienti_menu_template WHERE id = ?", (template_id,)
        ).fetchone()
        if not existing:
            return False
        # FK ON DELETE CASCADE si occupa delle righe
        conn.execute("DELETE FROM clienti_menu_template WHERE id = ?", (template_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def duplica_template(template_id: int, nuovo_nome: str | None = None) -> dict | None:
    """Duplica testata + tutte le righe. Il nuovo template ha nome '<nome> (copia)'
    se non viene passato un override."""
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None
        src = conn.execute(
            "SELECT * FROM clienti_menu_template WHERE id = ?", (template_id,)
        ).fetchone()
        if not src:
            return None

        nome_dest = (nuovo_nome or "").strip() or f"{src['nome']} (copia)"
        cur = conn.execute(
            """INSERT INTO clienti_menu_template
               (nome, descrizione, service_type_id, prezzo_persona, sconto)
               VALUES (?, ?, ?, ?, ?)""",
            (
                nome_dest,
                src["descrizione"],
                src["service_type_id"],
                src["prezzo_persona"],
                src["sconto"],
            ),
        )
        new_id = cur.lastrowid
        conn.execute("""
            INSERT INTO clienti_menu_template_righe
              (template_id, recipe_id, sort_order, category_name, name, description, price)
            SELECT ?, recipe_id, sort_order, category_name, name, description, price
            FROM clienti_menu_template_righe
            WHERE template_id = ?
            ORDER BY sort_order, id
        """, (new_id, template_id))
        conn.commit()
        return get_template(new_id)
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────────────────
# CRUD righe template (add/remove/sort)
# ──────────────────────────────────────────────────────────────────────────

def aggiungi_riga_template(template_id: int, riga: dict) -> dict | None:
    """Aggiunge una riga in coda al template.
    riga: {name (req), description, price, category_name, recipe_id}"""
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None
        existing = conn.execute(
            "SELECT id FROM clienti_menu_template WHERE id = ?", (template_id,)
        ).fetchone()
        if not existing:
            return None

        nome = (riga.get("name") or "").strip()
        if not nome:
            return None

        max_sort = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM clienti_menu_template_righe WHERE template_id = ?",
            (template_id,),
        ).fetchone()[0]

        conn.execute(
            """INSERT INTO clienti_menu_template_righe
               (template_id, recipe_id, sort_order, category_name, name, description, price)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                template_id,
                riga.get("recipe_id"),
                int(max_sort) + 1,
                (riga.get("category_name") or None),
                nome,
                (riga.get("description") or None),
                float(riga.get("price") or 0),
            ),
        )
        conn.commit()
        return get_template(template_id)
    finally:
        conn.close()


def elimina_riga_template(template_id: int, riga_id: int) -> dict | None:
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None
        conn.execute(
            "DELETE FROM clienti_menu_template_righe WHERE id = ? AND template_id = ?",
            (riga_id, template_id),
        )
        conn.commit()
        return get_template(template_id)
    finally:
        conn.close()


def riordina_righe_template(template_id: int, ordered_riga_ids: list[int]) -> dict | None:
    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None
        for idx, rid in enumerate(ordered_riga_ids):
            conn.execute(
                "UPDATE clienti_menu_template_righe SET sort_order = ? "
                "WHERE id = ? AND template_id = ?",
                (idx, rid, template_id),
            )
        conn.commit()
        return get_template(template_id)
    finally:
        conn.close()


# ──────────────────────────────────────────────────────────────────────────
# Bridge template ↔ menu di preventivo
# ──────────────────────────────────────────────────────────────────────────

def salva_menu_come_template(
    preventivo_id: int,
    menu_id: int,
    nome: str,
    descrizione: str | None = None,
    service_type_id: int | None = None,
) -> dict | None:
    """Salva le righe + metadati di un menu di preventivo come nuovo template.

    Snapshot delle righe: copio name/description/price/category_name/recipe_id
    dal menu esistente al nuovo template.
    """
    nome = (nome or "").strip()
    if not nome:
        return None

    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None

        # Verifica ownership menu → preventivo
        owner = conn.execute(
            "SELECT preventivo_id, sconto, prezzo_persona FROM clienti_preventivi_menu WHERE id = ?",
            (menu_id,),
        ).fetchone()
        if not owner or int(owner["preventivo_id"]) != int(preventivo_id):
            return None

        # Crea testata template
        cur = conn.execute(
            """INSERT INTO clienti_menu_template
               (nome, descrizione, service_type_id, prezzo_persona, sconto)
               VALUES (?, ?, ?, ?, ?)""",
            (
                nome,
                (descrizione or "").strip() or None,
                service_type_id,
                float(owner["prezzo_persona"] or 0),
                float(owner["sconto"] or 0),
            ),
        )
        template_id = cur.lastrowid

        # Copia righe (snapshot)
        conn.execute("""
            INSERT INTO clienti_menu_template_righe
              (template_id, recipe_id, sort_order, category_name, name, description, price)
            SELECT ?, recipe_id, sort_order, category_name, name, description, price
            FROM clienti_preventivi_menu_righe
            WHERE menu_id = ?
            ORDER BY sort_order, id
        """, (template_id, menu_id))

        conn.commit()
        return get_template(template_id)
    finally:
        conn.close()


def applica_template_a_menu(
    preventivo_id: int,
    menu_id: int,
    template_id: int,
    sostituisci_righe: bool = True,
    aggiorna_nome: bool = True,
    aggiorna_prezzo: bool = True,
) -> dict | None:
    """Carica un template su un menu di preventivo esistente.

    - sostituisci_righe=True: elimina le righe correnti e copia quelle del template
    - sostituisci_righe=False: appende le righe del template in coda
    - aggiorna_nome=True: sovrascrive menu.nome con template.nome
    - aggiorna_prezzo=True: sovrascrive menu.prezzo_persona e menu.sconto dal template

    Dopo l'applicazione richiama _ricalcola_menu_e_totale sul menu.
    Ritorna il menu aggiornato (dict) oppure None.
    """
    # Import locale per evitare ciclo con preventivi_service
    from app.services import preventivi_service as ps

    conn = get_clienti_conn()
    try:
        if not _template_tables_exist(conn):
            return None

        # Ownership check
        owner = conn.execute(
            "SELECT preventivo_id FROM clienti_preventivi_menu WHERE id = ?",
            (menu_id,),
        ).fetchone()
        if not owner or int(owner["preventivo_id"]) != int(preventivo_id):
            return None

        template = conn.execute(
            "SELECT * FROM clienti_menu_template WHERE id = ?", (template_id,)
        ).fetchone()
        if not template:
            return None

        # Svuota righe correnti se richiesto
        if sostituisci_righe:
            conn.execute(
                "DELETE FROM clienti_preventivi_menu_righe WHERE menu_id = ?",
                (menu_id,),
            )
            base_sort = 0
        else:
            max_sort = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM clienti_preventivi_menu_righe WHERE menu_id = ?",
                (menu_id,),
            ).fetchone()[0]
            base_sort = int(max_sort) + 1

        # Copia righe template → menu (snapshot). Usa sort_order del template + offset
        tpl_righe = conn.execute("""
            SELECT recipe_id, sort_order, category_name, name, description, price
            FROM clienti_menu_template_righe
            WHERE template_id = ?
            ORDER BY sort_order, id
        """, (template_id,)).fetchall()

        for idx, r in enumerate(tpl_righe):
            conn.execute(
                """INSERT INTO clienti_preventivi_menu_righe
                   (preventivo_id, menu_id, recipe_id, sort_order, category_name, name, description, price)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    preventivo_id,
                    menu_id,
                    r["recipe_id"],
                    base_sort + idx,
                    r["category_name"],
                    r["name"],
                    r["description"],
                    float(r["price"] or 0),
                ),
            )

        # Aggiorna metadati menu
        updates = []
        params = []
        if aggiorna_nome:
            updates.append("nome = ?")
            params.append(template["nome"])
        if aggiorna_prezzo:
            updates.append("prezzo_persona = ?")
            params.append(float(template["prezzo_persona"] or 0))
            updates.append("sconto = ?")
            params.append(float(template["sconto"] or 0))
        if updates:
            params.append(menu_id)
            conn.execute(
                f"UPDATE clienti_preventivi_menu SET {', '.join(updates)} WHERE id = ?",
                params,
            )

        # Ricalcolo subtotale/prezzo_persona del menu e totale preventivo
        # sulla stessa connessione per consistenza transazionale.
        ps._ricalcola_menu_e_totale(conn, menu_id)
        conn.commit()
    finally:
        conn.close()

    # Ritorno menu aggiornato (via get_preventivo)
    prev = ps.get_preventivo(preventivo_id)
    if not prev:
        return None
    for m in prev.get("menu_list", []):
        if int(m["id"]) == int(menu_id):
            return m
    return None
