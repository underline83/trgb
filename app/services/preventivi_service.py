"""
Servizio Preventivi — logica business per gestione preventivi eventi.
Fase A (10.1) + Fase B (10.2): CRUD, righe, template, numerazione progressiva.
Sessione 32 (10.3): menu proposto strutturato, luoghi configurabili, crea cliente inline.
"""

import json
from datetime import datetime
from app.models.clienti_db import get_clienti_conn
from app.models.foodcost_db import get_foodcost_connection


# ---------------------------------------------------------------------------
# Numero progressivo  PRE-{anno}-{NNN}
# ---------------------------------------------------------------------------

def _prossimo_numero(conn) -> str:
    anno = datetime.now().year
    prefisso = f"PRE-{anno}-"
    row = conn.execute(
        "SELECT numero FROM clienti_preventivi WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1",
        (f"{prefisso}%",),
    ).fetchone()
    if row:
        ultimo = int(row["numero"].split("-")[-1])
        prossimo = ultimo + 1
    else:
        prossimo = 1
    return f"{prefisso}{prossimo:03d}"


# ---------------------------------------------------------------------------
# Ricalcolo totale
# ---------------------------------------------------------------------------

def _menu_table_exists(conn) -> bool:
    """La tabella clienti_preventivi_menu e' introdotta dalla mig 079."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_preventivi_menu'"
    ).fetchone()
    return bool(row)


def _conta_menu(conn, preventivo_id: int) -> int:
    """Numero di menu alternativi associati al preventivo (mig 079)."""
    if not _menu_table_exists(conn):
        return 0
    row = conn.execute(
        "SELECT COUNT(*) FROM clienti_preventivi_menu WHERE preventivo_id = ?",
        (preventivo_id,),
    ).fetchone()
    return int(row[0] or 0)


def _ricalcola_totale(conn, preventivo_id: int) -> float:
    """
    Ricalcola totale_calcolato in base al numero di menu alternativi (mig 079):
      0 menu  → totale = solo righe extra
      1 menu  → totale = (menu.prezzo_persona × n_persone) + righe extra
      >= 2    → totale = 0 (alternative al cliente, niente aggregato)

    Le righe extra restano per elementi liberi (noleggio, tovagliato, supplementi).
    """
    n_menu = _conta_menu(conn, preventivo_id)

    # >= 2 menu: niente totale aggregato (il cliente sceglie uno dei menu)
    if n_menu >= 2:
        conn.execute(
            "UPDATE clienti_preventivi SET totale_calcolato = 0 WHERE id = ?",
            (preventivo_id,),
        )
        return 0.0

    totale = 0.0

    # 1 menu: prende prezzo_persona del menu (non dalla testata cache, che potrebbe
    # essere stale). 0 menu: tot = solo righe.
    if n_menu == 1:
        testata = conn.execute(
            "SELECT n_persone FROM clienti_preventivi WHERE id = ?",
            (preventivo_id,),
        ).fetchone()
        n_pers = int(testata["n_persone"] or 0) if testata else 0
        m = conn.execute(
            "SELECT prezzo_persona FROM clienti_preventivi_menu "
            "WHERE preventivo_id = ? ORDER BY sort_order, id LIMIT 1",
            (preventivo_id,),
        ).fetchone()
        prezzo_p = float(m["prezzo_persona"] or 0) if m else 0.0
        totale += prezzo_p * n_pers
    elif n_menu == 0 and not _menu_table_exists(conn):
        # Fallback pre-mig 079: usa la testata legacy
        testata = conn.execute(
            "SELECT menu_prezzo_persona, n_persone FROM clienti_preventivi WHERE id = ?",
            (preventivo_id,),
        ).fetchone()
        if testata:
            prezzo_p = testata["menu_prezzo_persona"] or 0
            n_pers = testata["n_persone"] or 0
            totale += float(prezzo_p) * float(n_pers)

    # Righe extra
    rows = conn.execute(
        "SELECT qta, prezzo_unitario, tipo_riga FROM clienti_preventivi_righe WHERE preventivo_id = ?",
        (preventivo_id,),
    ).fetchall()
    for r in rows:
        sub = (r["qta"] or 0) * (r["prezzo_unitario"] or 0)
        if r["tipo_riga"] == "sconto":
            totale -= abs(sub)
        else:
            totale += sub

    conn.execute(
        "UPDATE clienti_preventivi SET totale_calcolato = ? WHERE id = ?",
        (round(totale, 2), preventivo_id),
    )
    return round(totale, 2)


# ---------------------------------------------------------------------------
# Salva righe in blocco (replace)
# ---------------------------------------------------------------------------

def _salva_righe(conn, preventivo_id: int, righe: list):
    """Cancella tutte le righe e le ricrea. Ogni riga: {descrizione, qta, prezzo_unitario, tipo_riga, ordine}"""
    conn.execute("DELETE FROM clienti_preventivi_righe WHERE preventivo_id = ?", (preventivo_id,))
    for i, r in enumerate(righe):
        totale_riga = round((r.get("qta", 1) or 1) * (r.get("prezzo_unitario", 0) or 0), 2)
        conn.execute("""
            INSERT INTO clienti_preventivi_righe (preventivo_id, ordine, descrizione, qta, prezzo_unitario, totale_riga, tipo_riga)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            preventivo_id,
            r.get("ordine", i),
            r.get("descrizione", ""),
            r.get("qta", 1),
            r.get("prezzo_unitario", 0),
            totale_riga,
            r.get("tipo_riga", "voce"),
        ))


# ---------------------------------------------------------------------------
# Menu righe snapshot (mig 075)
# ---------------------------------------------------------------------------

def _menu_righe_table_exists(conn) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='clienti_preventivi_menu_righe'"
    ).fetchone()
    return bool(row)


def _ricalcola_menu_singolo(conn, menu_id: int) -> dict | None:
    """
    Ricalcola subtotale e prezzo_persona del SINGOLO menu (mig 079):
    subtotale = SUM(price) delle righe del menu,
    prezzo_persona = max(0, subtotale - sconto).
    Ritorna dict con nuovi valori, None se il menu non esiste.
    """
    m = conn.execute(
        "SELECT preventivo_id, sconto FROM clienti_preventivi_menu WHERE id = ?",
        (menu_id,),
    ).fetchone()
    if not m:
        return None
    sconto = float(m["sconto"] or 0)

    row = conn.execute(
        "SELECT COALESCE(SUM(price), 0) AS s FROM clienti_preventivi_menu_righe WHERE menu_id = ?",
        (menu_id,),
    ).fetchone()
    subtotale = float(row["s"] or 0)
    prezzo_pers = round(max(0.0, subtotale - sconto), 2)

    conn.execute(
        "UPDATE clienti_preventivi_menu SET subtotale = ?, prezzo_persona = ? WHERE id = ?",
        (round(subtotale, 2), prezzo_pers, menu_id),
    )
    return {
        "id": menu_id,
        "subtotale": round(subtotale, 2),
        "sconto": round(sconto, 2),
        "prezzo_persona": prezzo_pers,
    }


def _sync_testata_menu_cache(conn, preventivo_id: int):
    """Aggiorna i campi denorma clienti_preventivi.menu_* con il PRIMO menu
    (sort_order ASC). Retro-compat per query legacy (lista preventivi, stats).
    Se non ci sono menu, azzera i denorma.
    """
    if _menu_table_exists(conn):
        m = conn.execute(
            "SELECT subtotale, sconto, prezzo_persona FROM clienti_preventivi_menu "
            "WHERE preventivo_id = ? ORDER BY sort_order, id LIMIT 1",
            (preventivo_id,),
        ).fetchone()
        if m:
            conn.execute(
                "UPDATE clienti_preventivi SET menu_subtotale = ?, menu_sconto = ?, "
                "menu_prezzo_persona = ? WHERE id = ?",
                (
                    float(m["subtotale"] or 0),
                    float(m["sconto"] or 0),
                    float(m["prezzo_persona"] or 0),
                    preventivo_id,
                ),
            )
            return
    # no menu → reset cache
    conn.execute(
        "UPDATE clienti_preventivi SET menu_subtotale = 0, menu_sconto = 0, "
        "menu_prezzo_persona = 0 WHERE id = ?",
        (preventivo_id,),
    )


def _ricalcola_menu_e_totale(conn, menu_id: int) -> dict | None:
    """Helper: ricalcola il singolo menu, poi sync cache testata e totale preventivo."""
    result = _ricalcola_menu_singolo(conn, menu_id)
    if not result:
        return None
    # risali al preventivo_id
    m = conn.execute(
        "SELECT preventivo_id FROM clienti_preventivi_menu WHERE id = ?",
        (menu_id,),
    ).fetchone()
    if m:
        pid = m["preventivo_id"]
        _sync_testata_menu_cache(conn, pid)
        _ricalcola_totale(conn, pid)
    return result


def _get_or_create_primary_menu(conn, preventivo_id: int) -> int | None:
    """Ritorna l'id del primo menu del preventivo. Se non ne esiste alcuno,
    ne crea uno di default ('Menu', sort_order=0). Serve retro-compat: i
    client vecchi che chiamano aggiungi_menu_riga senza menu_id si aspettano
    che un menu esista implicitamente.
    """
    if not _menu_table_exists(conn):
        return None
    prev = conn.execute(
        "SELECT id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)
    ).fetchone()
    if not prev:
        return None
    m = conn.execute(
        "SELECT id FROM clienti_preventivi_menu WHERE preventivo_id = ? "
        "ORDER BY sort_order, id LIMIT 1",
        (preventivo_id,),
    ).fetchone()
    if m:
        return int(m["id"])
    cur = conn.execute(
        "INSERT INTO clienti_preventivi_menu (preventivo_id, nome, sort_order, sconto, subtotale, prezzo_persona) "
        "VALUES (?, 'Menu', 0, 0, 0, 0)",
        (preventivo_id,),
    )
    return cur.lastrowid


def _snapshot_recipe(recipe_id: int) -> dict | None:
    """
    Legge un piatto da foodcost.db e restituisce il dict snapshot
    {name, description, price, category_name} da copiare sul preventivo.
    Usa menu_name in fallback su name, menu_description in fallback su description (vuota).
    Prezzo: selling_price (puo' essere 0 se non valorizzato).
    """
    fconn = get_foodcost_connection()
    try:
        row = fconn.execute(
            """
            SELECT r.id, r.name, r.menu_name, r.menu_description, r.selling_price,
                   rc.name AS category_name
            FROM recipes r
            LEFT JOIN recipe_categories rc ON r.category_id = rc.id
            WHERE r.id = ?
            """,
            (recipe_id,),
        ).fetchone()
        if not row:
            return None
        nome = (row["menu_name"] or row["name"] or "").strip()
        desc = (row["menu_description"] or "").strip() or None
        return {
            "name": nome,
            "description": desc,
            "price": float(row["selling_price"] or 0),
            "category_name": row["category_name"],
        }
    finally:
        fconn.close()


def _menu_appartiene_a(conn, menu_id: int, preventivo_id: int) -> bool:
    """Guard di sicurezza: verifica che il menu_id appartenga al preventivo_id."""
    if not _menu_table_exists(conn):
        return False
    row = conn.execute(
        "SELECT id FROM clienti_preventivi_menu WHERE id = ? AND preventivo_id = ?",
        (menu_id, preventivo_id),
    ).fetchone()
    return bool(row)


def _resolve_menu_id(conn, preventivo_id: int, menu_id_raw) -> int | None:
    """Risolve il menu_id: se None/mancante, usa/crea il primo menu (retro-compat)."""
    if menu_id_raw is None or menu_id_raw == "":
        return _get_or_create_primary_menu(conn, preventivo_id)
    menu_id = int(menu_id_raw)
    if not _menu_appartiene_a(conn, menu_id, preventivo_id):
        return None
    return menu_id


# ---------------------------------------------------------------------------
# CRUD clienti_preventivi_menu (menu alternativi — mig 079)
# ---------------------------------------------------------------------------

def lista_menu(preventivo_id: int) -> list:
    """Ritorna tutti i menu alternativi di un preventivo con righe annidate, ordinati."""
    conn = get_clienti_conn()
    try:
        if not _menu_table_exists(conn):
            return []
        menus = conn.execute(
            "SELECT * FROM clienti_preventivi_menu WHERE preventivo_id = ? "
            "ORDER BY sort_order, id",
            (preventivo_id,),
        ).fetchall()
        out = []
        for m in menus:
            d = dict(m)
            righe = conn.execute(
                "SELECT * FROM clienti_preventivi_menu_righe WHERE menu_id = ? "
                "ORDER BY sort_order, id",
                (d["id"],),
            ).fetchall()
            d["righe"] = [dict(r) for r in righe]
            out.append(d)
        return out
    finally:
        conn.close()


def crea_menu(preventivo_id: int, data: dict | None = None) -> dict | None:
    """Crea un nuovo menu alternativo. `data` puo' contenere nome/sconto."""
    data = data or {}
    conn = get_clienti_conn()
    try:
        if not _menu_table_exists(conn):
            raise RuntimeError("clienti_preventivi_menu non esiste: lanciare mig 079")
        prev = conn.execute("SELECT id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not prev:
            return None

        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM clienti_preventivi_menu WHERE preventivo_id = ?",
            (preventivo_id,),
        ).fetchone()[0]
        nome = (data.get("nome") or "").strip() or "Menu"
        sconto = max(0.0, float(data.get("sconto") or 0))

        cur = conn.execute(
            "INSERT INTO clienti_preventivi_menu (preventivo_id, nome, sort_order, sconto, subtotale, prezzo_persona) "
            "VALUES (?, ?, ?, ?, 0, 0)",
            (preventivo_id, nome, int(max_order) + 1, round(sconto, 2)),
        )
        menu_id = cur.lastrowid
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        row = conn.execute(
            "SELECT * FROM clienti_preventivi_menu WHERE id = ?", (menu_id,)
        ).fetchone()
        if not row:
            return None
        out = dict(row)
        out["righe"] = []
        return out
    finally:
        conn.close()


def aggiorna_menu(preventivo_id: int, menu_id: int, data: dict) -> dict | None:
    """Aggiorna nome / sort_order / sconto di un menu."""
    conn = get_clienti_conn()
    try:
        if not _menu_appartiene_a(conn, menu_id, preventivo_id):
            return None
        campi = []
        params = []
        if "nome" in data:
            campi.append("nome = ?")
            params.append((data["nome"] or "").strip() or "Menu")
        if "sort_order" in data:
            campi.append("sort_order = ?")
            params.append(int(data["sort_order"] or 0))
        if "sconto" in data:
            campi.append("sconto = ?")
            params.append(round(max(0.0, float(data["sconto"] or 0)), 2))
        if campi:
            params.append(menu_id)
            conn.execute(
                f"UPDATE clienti_preventivi_menu SET {', '.join(campi)} WHERE id = ?",
                params,
            )
        # se lo sconto e' cambiato il prezzo_persona va ricalcolato
        _ricalcola_menu_singolo(conn, menu_id)
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        row = conn.execute(
            "SELECT * FROM clienti_preventivi_menu WHERE id = ?", (menu_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def elimina_menu(preventivo_id: int, menu_id: int) -> bool:
    """Elimina un menu (e tutte le sue righe, via SQL esplicito)."""
    conn = get_clienti_conn()
    try:
        if not _menu_appartiene_a(conn, menu_id, preventivo_id):
            return False
        conn.execute(
            "DELETE FROM clienti_preventivi_menu_righe WHERE menu_id = ?",
            (menu_id,),
        )
        conn.execute(
            "DELETE FROM clienti_preventivi_menu WHERE id = ? AND preventivo_id = ?",
            (menu_id, preventivo_id),
        )
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        return True
    finally:
        conn.close()


def duplica_menu(preventivo_id: int, menu_id: int, nuovo_nome: str | None = None) -> dict | None:
    """Duplica un menu esistente con tutte le sue righe, in coda."""
    conn = get_clienti_conn()
    try:
        if not _menu_appartiene_a(conn, menu_id, preventivo_id):
            return None
        orig = conn.execute(
            "SELECT * FROM clienti_preventivi_menu WHERE id = ?", (menu_id,)
        ).fetchone()
        if not orig:
            return None

        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM clienti_preventivi_menu WHERE preventivo_id = ?",
            (preventivo_id,),
        ).fetchone()[0]
        nome = (nuovo_nome or "").strip() or f"{orig['nome']} (copia)"

        cur = conn.execute(
            "INSERT INTO clienti_preventivi_menu (preventivo_id, nome, sort_order, sconto, subtotale, prezzo_persona) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                preventivo_id,
                nome,
                int(max_order) + 1,
                float(orig["sconto"] or 0),
                float(orig["subtotale"] or 0),
                float(orig["prezzo_persona"] or 0),
            ),
        )
        new_menu_id = cur.lastrowid

        # copia righe snapshot
        righe = conn.execute(
            "SELECT * FROM clienti_preventivi_menu_righe WHERE menu_id = ? ORDER BY sort_order, id",
            (menu_id,),
        ).fetchall()
        for r in righe:
            conn.execute(
                "INSERT INTO clienti_preventivi_menu_righe "
                "(preventivo_id, menu_id, recipe_id, sort_order, category_name, name, description, price) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    preventivo_id,
                    new_menu_id,
                    r["recipe_id"],
                    r["sort_order"],
                    r["category_name"],
                    r["name"],
                    r["description"],
                    r["price"],
                ),
            )
        _ricalcola_menu_singolo(conn, new_menu_id)
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()

        row = conn.execute(
            "SELECT * FROM clienti_preventivi_menu WHERE id = ?", (new_menu_id,)
        ).fetchone()
        if not row:
            return None
        out = dict(row)
        new_righe = conn.execute(
            "SELECT * FROM clienti_preventivi_menu_righe WHERE menu_id = ? ORDER BY sort_order, id",
            (new_menu_id,),
        ).fetchall()
        out["righe"] = [dict(r) for r in new_righe]
        return out
    finally:
        conn.close()


def riordina_menu(preventivo_id: int, ordered_menu_ids: list[int]) -> list:
    """Applica un nuovo sort_order ai menu del preventivo (drag-drop tab ▲▼)."""
    conn = get_clienti_conn()
    try:
        if not _menu_table_exists(conn):
            return []
        for i, mid in enumerate(ordered_menu_ids or []):
            conn.execute(
                "UPDATE clienti_preventivi_menu SET sort_order = ? "
                "WHERE id = ? AND preventivo_id = ?",
                (i, int(mid), preventivo_id),
            )
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        rows = conn.execute(
            "SELECT * FROM clienti_preventivi_menu WHERE preventivo_id = ? "
            "ORDER BY sort_order, id",
            (preventivo_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CRUD righe menu (snapshot piatti) — sempre legate a un menu_id
# ---------------------------------------------------------------------------

def lista_menu_righe(preventivo_id: int, menu_id: int | None = None) -> list:
    """Ritorna le righe snapshot di un menu. Se menu_id=None usa il primo menu."""
    conn = get_clienti_conn()
    try:
        if not _menu_righe_table_exists(conn):
            return []
        mid = _resolve_menu_id(conn, preventivo_id, menu_id)
        if mid is None:
            # Fallback pre-mig 079: nessun record menu, leggi righe per preventivo_id
            if not _menu_table_exists(conn):
                rows = conn.execute(
                    "SELECT * FROM clienti_preventivi_menu_righe WHERE preventivo_id = ? "
                    "ORDER BY sort_order, id",
                    (preventivo_id,),
                ).fetchall()
                return [dict(r) for r in rows]
            return []
        rows = conn.execute(
            "SELECT * FROM clienti_preventivi_menu_righe WHERE menu_id = ? "
            "ORDER BY sort_order, id",
            (mid,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def aggiungi_menu_riga(preventivo_id: int, data: dict) -> dict | None:
    """
    Aggiunge una riga snapshot a un menu specifico.
    `data` deve contenere `menu_id` (se mancante, usa/crea il primo menu).
    Se `recipe_id` e' valorizzato, legge il piatto da Cucina e ne snapshotta
    nome/descrizione/prezzo/categoria. I campi passati in `data` (name, price,
    description, category_name) SOVRASCRIVONO lo snapshot (quick edit).
    Altrimenti usa solo i campi passati ("piatto veloce" al volo).
    """
    conn = get_clienti_conn()
    try:
        prev = conn.execute("SELECT id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not prev:
            return None
        if not _menu_righe_table_exists(conn):
            raise RuntimeError("clienti_preventivi_menu_righe non esiste: lanciare mig 075")

        menu_id = _resolve_menu_id(conn, preventivo_id, data.get("menu_id"))
        if menu_id is None:
            raise ValueError("menu_id non valido")

        recipe_id = data.get("recipe_id")
        base = {"name": "", "description": None, "price": 0.0, "category_name": None}
        if recipe_id:
            snap = _snapshot_recipe(int(recipe_id))
            if snap:
                base.update(snap)
        # override da data (se presenti)
        for campo in ("name", "description", "price", "category_name"):
            if data.get(campo) not in (None, ""):
                base[campo] = data[campo]

        if not (base["name"] or "").strip():
            raise ValueError("name obbligatorio")

        # sort_order: coda nel menu
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM clienti_preventivi_menu_righe WHERE menu_id = ?",
            (menu_id,),
        ).fetchone()[0]
        sort_order = data.get("sort_order")
        if sort_order is None:
            sort_order = int(max_order) + 1

        cur = conn.execute(
            """
            INSERT INTO clienti_preventivi_menu_righe
                (preventivo_id, menu_id, recipe_id, sort_order, category_name, name, description, price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                preventivo_id,
                menu_id,
                int(recipe_id) if recipe_id else None,
                int(sort_order),
                base["category_name"],
                base["name"].strip(),
                base["description"],
                round(float(base["price"] or 0), 2),
            ),
        )
        riga_id = cur.lastrowid
        _ricalcola_menu_singolo(conn, menu_id)
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()

        row = conn.execute(
            "SELECT * FROM clienti_preventivi_menu_righe WHERE id = ?",
            (riga_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def aggiorna_menu_riga(preventivo_id: int, riga_id: int, data: dict) -> dict | None:
    """Aggiorna una riga snapshot. Ricalcola il menu a cui appartiene."""
    conn = get_clienti_conn()
    try:
        if not _menu_righe_table_exists(conn):
            return None
        row = conn.execute(
            "SELECT id, menu_id FROM clienti_preventivi_menu_righe WHERE id = ? AND preventivo_id = ?",
            (riga_id, preventivo_id),
        ).fetchone()
        if not row:
            return None
        menu_id = row["menu_id"]

        campi = []
        params = []
        for campo in ("name", "description", "price", "category_name", "sort_order"):
            if campo in data:
                campi.append(f"{campo} = ?")
                val = data[campo]
                if campo == "price":
                    val = round(float(val or 0), 2)
                elif campo == "sort_order":
                    val = int(val or 0)
                params.append(val)

        if campi:
            params.extend([riga_id, preventivo_id])
            conn.execute(
                f"UPDATE clienti_preventivi_menu_righe SET {', '.join(campi)} "
                f"WHERE id = ? AND preventivo_id = ?",
                params,
            )

        if menu_id:
            _ricalcola_menu_singolo(conn, menu_id)
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()

        row = conn.execute(
            "SELECT * FROM clienti_preventivi_menu_righe WHERE id = ?",
            (riga_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def elimina_menu_riga(preventivo_id: int, riga_id: int) -> bool:
    conn = get_clienti_conn()
    try:
        if not _menu_righe_table_exists(conn):
            return False
        row = conn.execute(
            "SELECT id, menu_id FROM clienti_preventivi_menu_righe WHERE id = ? AND preventivo_id = ?",
            (riga_id, preventivo_id),
        ).fetchone()
        if not row:
            return False
        menu_id = row["menu_id"]
        conn.execute(
            "DELETE FROM clienti_preventivi_menu_righe WHERE id = ? AND preventivo_id = ?",
            (riga_id, preventivo_id),
        )
        if menu_id:
            _ricalcola_menu_singolo(conn, menu_id)
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        return True
    finally:
        conn.close()


def riordina_menu_righe(preventivo_id: int, ordered_ids: list[int], menu_id: int | None = None) -> list:
    """Applica un nuovo sort_order alle righe di un menu specifico (drag-drop)."""
    conn = get_clienti_conn()
    try:
        if not _menu_righe_table_exists(conn):
            return []
        mid = _resolve_menu_id(conn, preventivo_id, menu_id)
        for i, rid in enumerate(ordered_ids or []):
            conn.execute(
                "UPDATE clienti_preventivi_menu_righe SET sort_order = ? "
                "WHERE id = ? AND preventivo_id = ?"
                + (" AND menu_id = ?" if mid is not None else ""),
                (i, int(rid), preventivo_id) + ((mid,) if mid is not None else ()),
            )
        conn.commit()
        if mid is not None:
            rows = conn.execute(
                "SELECT * FROM clienti_preventivi_menu_righe WHERE menu_id = ? "
                "ORDER BY sort_order, id",
                (mid,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM clienti_preventivi_menu_righe WHERE preventivo_id = ? "
                "ORDER BY sort_order, id",
                (preventivo_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def set_menu_sconto(preventivo_id: int, sconto: float, menu_id: int | None = None) -> dict | None:
    """Imposta lo sconto del menu (legacy: default sul primo menu) e ricalcola."""
    conn = get_clienti_conn()
    try:
        mid = _resolve_menu_id(conn, preventivo_id, menu_id)
        if mid is None:
            return None
        sc = max(0.0, float(sconto or 0))
        conn.execute(
            "UPDATE clienti_preventivi_menu SET sconto = ? WHERE id = ?",
            (round(sc, 2), mid),
        )
        _ricalcola_menu_singolo(conn, mid)
        _sync_testata_menu_cache(conn, preventivo_id)
        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        row = conn.execute(
            "SELECT * FROM clienti_preventivi_menu WHERE id = ?", (mid,)
        ).fetchone()
        if not row:
            return None
        out = dict(row)
        return {
            "menu_id": out["id"],
            "menu_subtotale": float(out["subtotale"] or 0),
            "menu_sconto": float(out["sconto"] or 0),
            "menu_prezzo_persona": float(out["prezzo_persona"] or 0),
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CRUD Preventivi
# ---------------------------------------------------------------------------

def _crea_cliente_inline(conn, nuovo: dict) -> int | None:
    """
    Crea un cliente minimale (nome+cognome obbligatori) e ritorna il suo id.
    Usato quando dal form preventivo si sceglie "Nuovo cliente" senza passare
    dal modulo clienti. Restituisce None se nome/cognome mancano.
    """
    nome = (nuovo.get("nome") or "").strip()
    cognome = (nuovo.get("cognome") or "").strip()
    if not nome and not cognome:
        return None
    cur = conn.execute(
        """
        INSERT INTO clienti (nome, cognome, telefono, email, origine, attivo)
        VALUES (?, ?, ?, ?, 'preventivo', 1)
        """,
        (
            nome or "—",
            cognome or "—",
            (nuovo.get("telefono") or "").strip() or None,
            (nuovo.get("email") or "").strip() or None,
        ),
    )
    return cur.lastrowid


def crea_preventivo(data: dict, righe: list, username: str, nuovo_cliente: dict | None = None) -> dict:
    """
    Crea un nuovo preventivo con righe e campi menu.
    Se nuovo_cliente e' presente (dict con nome/cognome/telefono/email), crea il
    cliente al volo e lo collega al preventivo (precedenza su cliente_id).

    is_bozza_auto (data.is_bozza_auto, default 0):
      - 1 = preventivo creato in modo silenzioso dal composer menu su URL /nuovo;
            nascosto da lista/stats finche' l'utente non clicca "Salva".
      - 0 = creazione esplicita dell'utente.
    """
    conn = get_clienti_conn()
    try:
        cliente_id = data.get("cliente_id")
        if nuovo_cliente:
            new_id = _crea_cliente_inline(conn, nuovo_cliente)
            if new_id:
                cliente_id = new_id

        is_bozza_auto = 1 if data.get("is_bozza_auto") else 0

        # Titolo placeholder per auto-bozza (cosi' la colonna NOT-NULL e' sempre valida)
        titolo = (data.get("titolo") or "").strip()
        if not titolo:
            titolo = "Preventivo in compilazione" if is_bozza_auto else ""

        numero = _prossimo_numero(conn)
        conn.execute("""
            INSERT INTO clienti_preventivi
                (numero, cliente_id, titolo, tipo, data_evento, ora_evento,
                 n_persone, luogo, stato, note_interne, note_cliente, condizioni,
                 scadenza_conferma, canale, template_id,
                 menu_nome, menu_prezzo_persona, menu_descrizione,
                 is_bozza_auto,
                 creato_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            numero,
            cliente_id,
            titolo,
            data.get("tipo", "cena_privata"),
            data.get("data_evento"),
            data.get("ora_evento"),
            data.get("n_persone"),
            data.get("luogo") or "Sala",
            data.get("note_interne"),
            data.get("note_cliente"),
            data.get("condizioni"),
            data.get("scadenza_conferma"),
            data.get("canale", "telefono"),
            data.get("template_id"),
            data.get("menu_nome"),
            data.get("menu_prezzo_persona") or 0,
            data.get("menu_descrizione"),
            is_bozza_auto,
            username,
        ))
        preventivo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        if righe:
            _salva_righe(conn, preventivo_id, righe)
        _ricalcola_totale(conn, preventivo_id)

        conn.commit()
        return get_preventivo(preventivo_id)
    finally:
        conn.close()


def get_preventivo(preventivo_id: int) -> dict | None:
    """Ritorna preventivo con righe e dati cliente."""
    conn = get_clienti_conn()
    try:
        row = conn.execute("""
            SELECT p.*,
                   c.nome   AS cliente_nome,
                   c.cognome AS cliente_cognome,
                   c.telefono AS cliente_telefono,
                   c.email  AS cliente_email
            FROM clienti_preventivi p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE p.id = ?
        """, (preventivo_id,)).fetchone()
        if not row:
            return None
        prev = dict(row)

        righe = conn.execute("""
            SELECT * FROM clienti_preventivi_righe
            WHERE preventivo_id = ?
            ORDER BY ordine, id
        """, (preventivo_id,)).fetchall()
        prev["righe"] = [dict(r) for r in righe]

        # Menu alternativi (mig 079): lista con righe annidate.
        # Retro-compat: `menu_righe` resta come righe del PRIMO menu (flat).
        menu_list = []
        primary_righe = []
        if _menu_table_exists(conn):
            menus = conn.execute(
                "SELECT * FROM clienti_preventivi_menu WHERE preventivo_id = ? "
                "ORDER BY sort_order, id",
                (preventivo_id,),
            ).fetchall()
            for idx, m in enumerate(menus):
                d = dict(m)
                if _menu_righe_table_exists(conn):
                    mrows = conn.execute(
                        "SELECT * FROM clienti_preventivi_menu_righe WHERE menu_id = ? "
                        "ORDER BY sort_order, id",
                        (d["id"],),
                    ).fetchall()
                    d["righe"] = [dict(r) for r in mrows]
                else:
                    d["righe"] = []
                if idx == 0:
                    primary_righe = list(d["righe"])
                menu_list.append(d)
        elif _menu_righe_table_exists(conn):
            # Fallback pre-mig 079: raccogli le righe per preventivo_id (legacy shape)
            mrows = conn.execute(
                "SELECT * FROM clienti_preventivi_menu_righe WHERE preventivo_id = ? "
                "ORDER BY sort_order, id",
                (preventivo_id,),
            ).fetchall()
            primary_righe = [dict(r) for r in mrows]

        prev["menu_list"] = menu_list
        prev["n_menu"] = len(menu_list)
        prev["menu_righe"] = primary_righe  # retro-compat client vecchi

        return prev
    finally:
        conn.close()


def _bozza_auto_colonna_esiste(conn) -> bool:
    """La colonna is_bozza_auto viene introdotta dalla mig 076.
    Se e' assente (DB legacy non migrato) i filtri/stats si comportano come se
    il flag fosse sempre 0."""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(clienti_preventivi)").fetchall()}
    return "is_bozza_auto" in cols


def lista_preventivi(
    stato: str | None = None,
    mese: int | None = None,
    anno: int | None = None,
    cliente_id: int | None = None,
    tipo: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    includi_bozze_auto: bool = False,
) -> dict:
    """Lista preventivi con filtri. Ritorna {items, total}.

    Per default le bozze automatiche (is_bozza_auto=1) sono ESCLUSE: sono
    preventivi creati in modo silenzioso dal composer menu su /nuovo e non
    confermati dall'utente. Usare includi_bozze_auto=True per vederle (uso
    amministrativo/debug)."""
    conn = get_clienti_conn()
    try:
        where = ["1=1"]
        params = []

        if not includi_bozze_auto and _bozza_auto_colonna_esiste(conn):
            where.append("COALESCE(p.is_bozza_auto, 0) = 0")

        if stato:
            where.append("p.stato = ?")
            params.append(stato)
        if mese and anno:
            where.append("strftime('%m', p.data_evento) = ? AND strftime('%Y', p.data_evento) = ?")
            params.extend([f"{mese:02d}", str(anno)])
        elif anno:
            where.append("strftime('%Y', p.data_evento) = ?")
            params.append(str(anno))
        if cliente_id:
            where.append("p.cliente_id = ?")
            params.append(cliente_id)
        if tipo:
            where.append("p.tipo = ?")
            params.append(tipo)
        if q:
            like = f"%{q}%"
            where.append("(p.titolo LIKE ? OR p.numero LIKE ? OR c.nome LIKE ? OR c.cognome LIKE ?)")
            params.extend([like, like, like, like])

        where_sql = " AND ".join(where)

        total = conn.execute(f"""
            SELECT COUNT(*) FROM clienti_preventivi p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE {where_sql}
        """, params).fetchone()[0]

        # Subquery n_menu: se la tabella menu (mig 079) non esiste ancora, 0 hardcoded
        n_menu_expr = (
            "(SELECT COUNT(*) FROM clienti_preventivi_menu m WHERE m.preventivo_id = p.id)"
            if _menu_table_exists(conn)
            else "0"
        )

        rows = conn.execute(f"""
            SELECT p.*,
                   c.nome AS cliente_nome,
                   c.cognome AS cliente_cognome,
                   c.telefono AS cliente_telefono,
                   {n_menu_expr} AS n_menu
            FROM clienti_preventivi p
            LEFT JOIN clienti c ON p.cliente_id = c.id
            WHERE {where_sql}
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        """, params + [limit, offset]).fetchall()

        return {"items": [dict(r) for r in rows], "total": total}
    finally:
        conn.close()


def stats_preventivi() -> dict:
    """Contatori: in_ballo, confermati_mese, valore_totale_mese.

    Esclude sempre le bozze automatiche (is_bozza_auto=1)."""
    conn = get_clienti_conn()
    try:
        mese_corrente = datetime.now().strftime("%Y-%m")

        filtro_auto = (
            " AND COALESCE(is_bozza_auto, 0) = 0"
            if _bozza_auto_colonna_esiste(conn)
            else ""
        )

        in_ballo = conn.execute(
            f"SELECT COUNT(*) FROM clienti_preventivi "
            f"WHERE stato IN ('bozza','inviato','in_attesa'){filtro_auto}"
        ).fetchone()[0]

        confermati_mese = conn.execute(
            f"SELECT COUNT(*) FROM clienti_preventivi "
            f"WHERE stato IN ('confermato','prenotato') "
            f"AND strftime('%Y-%m', data_evento) = ?{filtro_auto}",
            (mese_corrente,),
        ).fetchone()[0]

        valore_mese = conn.execute(
            f"SELECT COALESCE(SUM(totale_calcolato), 0) FROM clienti_preventivi "
            f"WHERE stato NOT IN ('rifiutato','scaduto') "
            f"AND strftime('%Y-%m', data_evento) = ?{filtro_auto}",
            (mese_corrente,),
        ).fetchone()[0]

        return {
            "in_ballo": in_ballo,
            "confermati_mese": confermati_mese,
            "valore_totale_mese": round(valore_mese, 2),
        }
    finally:
        conn.close()


def aggiorna_preventivo(preventivo_id: int, data: dict, righe: list | None = None, nuovo_cliente: dict | None = None) -> dict | None:
    """Aggiorna testata + opzionalmente righe. Ricalcola totale.
    Se nuovo_cliente e' presente crea un cliente al volo e aggiorna cliente_id."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not existing:
            return None

        if nuovo_cliente:
            new_id = _crea_cliente_inline(conn, nuovo_cliente)
            if new_id:
                data = {**data, "cliente_id": new_id}

        campi = []
        params = []
        campi_ammessi = [
            "cliente_id", "titolo", "tipo", "data_evento", "ora_evento",
            "n_persone", "luogo", "note_interne", "note_cliente", "condizioni",
            "scadenza_conferma", "canale", "template_id",
            "menu_nome", "menu_prezzo_persona", "menu_descrizione",
            "is_bozza_auto",
        ]
        for campo in campi_ammessi:
            if campo in data:
                campi.append(f"{campo} = ?")
                val = data[campo]
                if campo == "is_bozza_auto":
                    val = 1 if val else 0
                params.append(val)

        if campi:
            params.append(preventivo_id)
            conn.execute(
                f"UPDATE clienti_preventivi SET {', '.join(campi)} WHERE id = ?",
                params,
            )

        if righe is not None:
            _salva_righe(conn, preventivo_id, righe)

        _ricalcola_totale(conn, preventivo_id)
        conn.commit()
        return get_preventivo(preventivo_id)
    finally:
        conn.close()


def elimina_preventivo(preventivo_id: int) -> bool:
    """Elimina preventivo e relative righe (CASCADE)."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not existing:
            return False
        conn.execute("DELETE FROM clienti_preventivi WHERE id = ?", (preventivo_id,))
        conn.commit()
        return True
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Transizioni di stato
# ---------------------------------------------------------------------------

TRANSIZIONI = {
    "bozza":      ["inviato"],
    "inviato":    ["in_attesa", "confermato", "rifiutato"],
    "in_attesa":  ["confermato", "rifiutato", "scaduto"],
    "confermato": ["prenotato"],
    "prenotato":  ["completato"],
    "completato": ["fatturato"],
    "rifiutato":  [],
    "scaduto":    ["bozza"],  # riapertura
    "fatturato":  [],
}


def cambia_stato(preventivo_id: int, nuovo_stato: str) -> dict | None:
    """Cambia stato con validazione transizioni. Ritorna preventivo aggiornato."""
    conn = get_clienti_conn()
    try:
        row = conn.execute("SELECT stato FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not row:
            return None

        stato_attuale = row["stato"]
        ammessi = TRANSIZIONI.get(stato_attuale, [])
        if nuovo_stato not in ammessi:
            raise ValueError(f"Transizione non permessa: {stato_attuale} → {nuovo_stato}. Ammessi: {ammessi}")

        conn.execute(
            "UPDATE clienti_preventivi SET stato = ? WHERE id = ?",
            (nuovo_stato, preventivo_id),
        )
        conn.commit()
        return get_preventivo(preventivo_id)
    finally:
        conn.close()


def duplica_preventivo(preventivo_id: int, username: str) -> dict | None:
    """Duplica un preventivo come nuova bozza."""
    conn = get_clienti_conn()
    try:
        orig = conn.execute("SELECT * FROM clienti_preventivi WHERE id = ?", (preventivo_id,)).fetchone()
        if not orig:
            return None
        orig = dict(orig)

        numero = _prossimo_numero(conn)
        conn.execute("""
            INSERT INTO clienti_preventivi
                (numero, cliente_id, titolo, tipo, data_evento, ora_evento,
                 n_persone, luogo, stato, note_interne, note_cliente, condizioni,
                 scadenza_conferma, canale, template_id,
                 menu_nome, menu_prezzo_persona, menu_descrizione,
                 creato_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            numero,
            orig["cliente_id"],
            f"{orig['titolo']} (copia)",
            orig["tipo"],
            orig["data_evento"],
            orig["ora_evento"],
            orig["n_persone"],
            orig["luogo"],
            orig["note_interne"],
            orig["note_cliente"],
            orig["condizioni"],
            orig["scadenza_conferma"],
            orig["canale"],
            orig["template_id"],
            orig.get("menu_nome"),
            orig.get("menu_prezzo_persona") or 0,
            orig.get("menu_descrizione"),
            username,
        ))
        nuovo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        # Copia righe extra
        righe_orig = conn.execute(
            "SELECT * FROM clienti_preventivi_righe WHERE preventivo_id = ? ORDER BY ordine",
            (preventivo_id,),
        ).fetchall()
        for r in righe_orig:
            conn.execute("""
                INSERT INTO clienti_preventivi_righe (preventivo_id, ordine, descrizione, qta, prezzo_unitario, totale_riga, tipo_riga)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (nuovo_id, r["ordine"], r["descrizione"], r["qta"], r["prezzo_unitario"], r["totale_riga"], r["tipo_riga"]))

        # Copia menu alternativi + righe snapshot (mig 079)
        if _menu_table_exists(conn):
            menus_orig = conn.execute(
                "SELECT * FROM clienti_preventivi_menu WHERE preventivo_id = ? ORDER BY sort_order, id",
                (preventivo_id,),
            ).fetchall()
            for m in menus_orig:
                cur_m = conn.execute(
                    "INSERT INTO clienti_preventivi_menu "
                    "(preventivo_id, nome, sort_order, sconto, subtotale, prezzo_persona) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        nuovo_id,
                        m["nome"],
                        m["sort_order"],
                        float(m["sconto"] or 0),
                        float(m["subtotale"] or 0),
                        float(m["prezzo_persona"] or 0),
                    ),
                )
                new_menu_id = cur_m.lastrowid
                righe_menu = conn.execute(
                    "SELECT * FROM clienti_preventivi_menu_righe WHERE menu_id = ? ORDER BY sort_order, id",
                    (m["id"],),
                ).fetchall()
                for rr in righe_menu:
                    conn.execute(
                        "INSERT INTO clienti_preventivi_menu_righe "
                        "(preventivo_id, menu_id, recipe_id, sort_order, category_name, name, description, price) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            nuovo_id,
                            new_menu_id,
                            rr["recipe_id"],
                            rr["sort_order"],
                            rr["category_name"],
                            rr["name"],
                            rr["description"],
                            rr["price"],
                        ),
                    )

        _sync_testata_menu_cache(conn, nuovo_id)
        _ricalcola_totale(conn, nuovo_id)
        conn.commit()
        return get_preventivo(nuovo_id)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------

def lista_template(solo_attivi: bool = True) -> list:
    conn = get_clienti_conn()
    try:
        if solo_attivi:
            rows = conn.execute("SELECT * FROM clienti_preventivi_template WHERE attivo = 1 ORDER BY nome").fetchall()
        else:
            rows = conn.execute("SELECT * FROM clienti_preventivi_template ORDER BY nome").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def crea_template(data: dict) -> dict:
    import json
    conn = get_clienti_conn()
    try:
        righe_json = json.dumps(data.get("righe", []), ensure_ascii=False) if data.get("righe") else None
        conn.execute("""
            INSERT INTO clienti_preventivi_template (nome, tipo, righe_json, condizioni_default)
            VALUES (?, ?, ?, ?)
        """, (
            data.get("nome", ""),
            data.get("tipo", "cena_privata"),
            righe_json,
            data.get("condizioni_default"),
        ))
        template_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()
        row = conn.execute("SELECT * FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def aggiorna_template(template_id: int, data: dict) -> dict | None:
    import json
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        if not existing:
            return None

        campi = []
        params = []
        for campo in ["nome", "tipo", "condizioni_default"]:
            if campo in data:
                campi.append(f"{campo} = ?")
                params.append(data[campo])
        if "righe" in data:
            campi.append("righe_json = ?")
            params.append(json.dumps(data["righe"], ensure_ascii=False))
        if "attivo" in data:
            campi.append("attivo = ?")
            params.append(1 if data["attivo"] else 0)

        if campi:
            params.append(template_id)
            conn.execute(f"UPDATE clienti_preventivi_template SET {', '.join(campi)} WHERE id = ?", params)
            conn.commit()

        row = conn.execute("SELECT * FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def elimina_template(template_id: int) -> bool:
    """Disattiva template (soft delete)."""
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti_preventivi_template WHERE id = ?", (template_id,)).fetchone()
        if not existing:
            return False
        conn.execute("UPDATE clienti_preventivi_template SET attivo = 0 WHERE id = ?", (template_id,))
        conn.commit()
        return True
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Configurazione luoghi (persisted in clienti_impostazioni come JSON array)
# ---------------------------------------------------------------------------

_LUOGHI_DEFAULT = ["Sala", "Giardino", "Dehor"]


def get_luoghi() -> list[str]:
    """Ritorna la lista dei luoghi disponibili per i preventivi."""
    conn = get_clienti_conn()
    try:
        row = conn.execute(
            "SELECT valore FROM clienti_impostazioni WHERE chiave = 'preventivi_luoghi'"
        ).fetchone()
        if not row:
            return list(_LUOGHI_DEFAULT)
        try:
            data = json.loads(row["valore"])
            if isinstance(data, list) and all(isinstance(x, str) for x in data):
                return data if data else list(_LUOGHI_DEFAULT)
        except (json.JSONDecodeError, TypeError):
            pass
        return list(_LUOGHI_DEFAULT)
    finally:
        conn.close()


def set_luoghi(luoghi: list[str]) -> list[str]:
    """Sostituisce la lista dei luoghi (normalizzata, deduplicata, non vuota)."""
    pulita = []
    visti = set()
    for x in luoghi or []:
        s = (x or "").strip()
        if not s:
            continue
        key = s.casefold()
        if key in visti:
            continue
        visti.add(key)
        pulita.append(s)
    if not pulita:
        pulita = list(_LUOGHI_DEFAULT)

    payload = json.dumps(pulita, ensure_ascii=False)
    conn = get_clienti_conn()
    try:
        conn.execute("""
            INSERT INTO clienti_impostazioni (chiave, valore, descrizione)
            VALUES ('preventivi_luoghi', ?, 'Luoghi disponibili per preventivi eventi (JSON array)')
            ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore
        """, (payload,))
        conn.commit()
        return pulita
    finally:
        conn.close()
