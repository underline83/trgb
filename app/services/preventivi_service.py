"""
Servizio Preventivi — logica business per gestione preventivi eventi.
Fase A (10.1) + Fase B (10.2): CRUD, righe, template, numerazione progressiva.
Sessione 32 (10.3): menu proposto strutturato, luoghi configurabili, crea cliente inline.
"""

import json
import logging
from datetime import datetime
from app.models.clienti_db import get_clienti_conn
from app.models.foodcost_db import get_foodcost_connection

logger = logging.getLogger("trgb.preventivi")


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


# ---------------------------------------------------------------------------
# Prezzo «a corpo» (mig 187)
# ---------------------------------------------------------------------------

# Campi del menu che descrivono la modalità di prezzo (stessi nomi sul template).
CORPO_CAMPI = ("pricing_mode", "prezzo_corpo", "prezzo_corpo_vino", "doppio_prezzo")


def _corpo_cols_exist(conn) -> bool:
    """Colonne pricing_mode & co. su clienti_preventivi_menu (mig 187)."""
    if not _menu_table_exists(conn):
        return False
    cols = {r[1] for r in conn.execute("PRAGMA table_info(clienti_preventivi_menu)").fetchall()}
    return "pricing_mode" in cols


def _menu_scelto_col_exists(conn) -> bool:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(clienti_preventivi)").fetchall()}
    return "menu_scelto_id" in cols


def normalizza_corpo(data: dict) -> dict:
    """Normalizza i campi a corpo presenti in `data` (solo quelli passati).
    pricing_mode: 'somma' | 'corpo'; prezzi >= 0; doppio_prezzo 0/1;
    prezzo_corpo_scelta: 'escluso' | 'incluso'."""
    out = {}
    if "pricing_mode" in data:
        out["pricing_mode"] = "corpo" if data["pricing_mode"] == "corpo" else "somma"
    for k in ("prezzo_corpo", "prezzo_corpo_vino"):
        if k in data:
            out[k] = round(max(0.0, float(data[k] or 0)), 2)
    if "doppio_prezzo" in data:
        out["doppio_prezzo"] = 1 if data["doppio_prezzo"] else 0
    if "prezzo_corpo_scelta" in data:
        out["prezzo_corpo_scelta"] = "incluso" if data["prezzo_corpo_scelta"] == "incluso" else "escluso"
    return out


def _euro(v: float) -> str:
    """50 → «50», 52.5 → «52,50» (per testi al cliente)."""
    v = round(float(v or 0), 2)
    if v == int(v):
        return f"{int(v):,}".replace(",", ".")
    return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def etichetta_prezzo(menu: dict) -> str:
    """Prezzo a persona come lo legge il cliente, già al netto dello sconto menu.
    Somma piatti / a corpo singolo: «50 € a persona».
    A corpo doppio: «50 / 55 € a persona (vino escluso / incluso)»."""
    sconto = float(menu.get("sconto") or 0)
    if menu.get("pricing_mode") == "corpo" and menu.get("doppio_prezzo"):
        esc = max(0.0, float(menu.get("prezzo_corpo") or 0) - sconto)
        inc = max(0.0, float(menu.get("prezzo_corpo_vino") or 0) - sconto)
        return f"{_euro(esc)} / {_euro(inc)} € a persona (vino escluso / incluso)"
    return f"{_euro(menu.get('prezzo_persona') or 0)} € a persona"


def _totale_extra(conn, preventivo_id: int) -> float:
    tot = 0.0
    for r in conn.execute(
        "SELECT qta, prezzo_unitario, tipo_riga FROM clienti_preventivi_righe WHERE preventivo_id = ?",
        (preventivo_id,),
    ).fetchall():
        sub = (r["qta"] or 0) * (r["prezzo_unitario"] or 0)
        tot += -abs(sub) if r["tipo_riga"] == "sconto" else sub
    return tot


def _menu_scelto_id(conn, preventivo_id: int) -> int | None:
    """menu_scelto_id della testata se valido (esiste e appartiene al preventivo)."""
    if not _menu_scelto_col_exists(conn):
        return None
    row = conn.execute(
        "SELECT menu_scelto_id FROM clienti_preventivi WHERE id = ?", (preventivo_id,)
    ).fetchone()
    mid = row["menu_scelto_id"] if row else None
    if mid and _menu_appartiene_a(conn, int(mid), preventivo_id):
        return int(mid)
    return None


def _forbice_totale(conn, preventivo_id: int) -> tuple[float, float] | None:
    """Con >= 2 menu e nessuna scelta: (min, max) del totale = prezzo × pax + extra."""
    if _conta_menu(conn, preventivo_id) < 2 or _menu_scelto_id(conn, preventivo_id):
        return None
    testata = conn.execute(
        "SELECT n_persone FROM clienti_preventivi WHERE id = ?", (preventivo_id,)
    ).fetchone()
    n_pers = int(testata["n_persone"] or 0) if testata else 0
    prezzi = [
        float(r["prezzo_persona"] or 0)
        for r in conn.execute(
            "SELECT prezzo_persona FROM clienti_preventivi_menu WHERE preventivo_id = ?",
            (preventivo_id,),
        ).fetchall()
    ]
    extra = _totale_extra(conn, preventivo_id)
    return (round(min(prezzi) * n_pers + extra, 2), round(max(prezzi) * n_pers + extra, 2))


def _ricalcola_totale(conn, preventivo_id: int) -> float:
    """
    Ricalcola totale_calcolato in base al numero di menu alternativi (mig 079):
      0 menu  → totale = solo righe extra
      1 menu  → totale = (menu.prezzo_persona × n_persone) + righe extra
      >= 2    → se il cliente ha scelto (menu_scelto_id, mig 187) come 1 menu
                con quello scelto; altrimenti 0 (la UI mostra la forbice «da X a Y»)

    prezzo_persona del menu e' gia' quello giusto per la modalita' (somma piatti
    o a corpo, mig 187), al netto dello sconto menu.
    Le righe extra restano per elementi liberi (noleggio, tovagliato, supplementi).
    """
    n_menu = _conta_menu(conn, preventivo_id)
    scelto = _menu_scelto_id(conn, preventivo_id) if n_menu >= 2 else None

    # >= 2 menu senza scelta: niente totale aggregato (il cliente sceglie uno dei menu)
    if n_menu >= 2 and not scelto:
        conn.execute(
            "UPDATE clienti_preventivi SET totale_calcolato = 0 WHERE id = ?",
            (preventivo_id,),
        )
        return 0.0

    totale = 0.0

    # 1 menu (o menu scelto): prende prezzo_persona del menu (non dalla testata
    # cache, che potrebbe essere stale). 0 menu: tot = solo righe.
    if n_menu >= 1:
        testata = conn.execute(
            "SELECT n_persone FROM clienti_preventivi WHERE id = ?",
            (preventivo_id,),
        ).fetchone()
        n_pers = int(testata["n_persone"] or 0) if testata else 0
        if scelto:
            m = conn.execute(
                "SELECT prezzo_persona FROM clienti_preventivi_menu WHERE id = ?", (scelto,)
            ).fetchone()
        else:
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
    totale += _totale_extra(conn, preventivo_id)

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
    A corpo (mig 187): subtotale = prezzo a corpo scelto (vino escluso, o incluso
    se doppio_prezzo e scelta 'incluso'); i prezzi dei piatti non contano.
    Ritorna dict con nuovi valori, None se il menu non esiste.
    """
    m = conn.execute(
        "SELECT * FROM clienti_preventivi_menu WHERE id = ?",
        (menu_id,),
    ).fetchone()
    if not m:
        return None
    m = dict(m)
    sconto = float(m["sconto"] or 0)

    if m.get("pricing_mode") == "corpo":
        if m.get("doppio_prezzo") and m.get("prezzo_corpo_scelta") == "incluso":
            subtotale = float(m.get("prezzo_corpo_vino") or 0)
        else:
            subtotale = float(m.get("prezzo_corpo") or 0)
    else:
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


def _set_corpo(conn, menu_id: int, data: dict) -> None:
    """Scrive sul menu i campi a corpo presenti in `data` (mig 187)."""
    if not _corpo_cols_exist(conn):
        return
    vals = normalizza_corpo(data or {})
    if vals:
        conn.execute(
            f"UPDATE clienti_preventivi_menu SET {', '.join(f'{k} = ?' for k in vals)} WHERE id = ?",
            (*vals.values(), menu_id),
        )


def _copia_corpo(conn, src_menu_id: int, dst_menu_id: int) -> None:
    """Copia modalita' di prezzo e prezzi a corpo da un menu a un altro."""
    if not _corpo_cols_exist(conn):
        return
    src = conn.execute("SELECT * FROM clienti_preventivi_menu WHERE id = ?", (src_menu_id,)).fetchone()
    if src:
        _set_corpo(conn, dst_menu_id, {k: src[k] for k in (*CORPO_CAMPI, "prezzo_corpo_scelta")})


def crea_menu(preventivo_id: int, data: dict | None = None) -> dict | None:
    """Crea un nuovo menu alternativo. `data` puo' contenere nome/sconto e i
    campi a corpo (pricing_mode, prezzo_corpo, prezzo_corpo_vino, doppio_prezzo,
    prezzo_corpo_scelta — mig 187)."""
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
        _set_corpo(conn, menu_id, data)
        _ricalcola_menu_singolo(conn, menu_id)
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
    """Aggiorna nome / sort_order / sconto / campi a corpo (mig 187) di un menu."""
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
        _set_corpo(conn, menu_id, data)
        # se lo sconto o il prezzo a corpo sono cambiati il prezzo_persona va ricalcolato
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
        if _menu_scelto_col_exists(conn):
            conn.execute(
                "UPDATE clienti_preventivi SET menu_scelto_id = NULL WHERE id = ? AND menu_scelto_id = ?",
                (preventivo_id, menu_id),
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
        _copia_corpo(conn, menu_id, new_menu_id)

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
            titolo = BOZZA_AUTO_TITOLO if is_bozza_auto else ""

        numero = _prossimo_numero(conn)
        conn.execute("""
            INSERT INTO clienti_preventivi
                (numero, cliente_id, titolo, tipo, data_evento, ora_evento,
                 n_persone, luogo, stato, note_interne, note_cliente, condizioni,
                 scadenza_conferma, canale, template_id,
                 menu_nome, menu_prezzo_persona, menu_descrizione,
                 is_bozza_auto, prenotazione_id,
                 creato_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.get("prenotazione_id") or None,   # 2026-10-20: nato da una prenotazione
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

        for d in menu_list:
            d["prezzo_etichetta"] = etichetta_prezzo(d)
        prev["menu_list"] = menu_list
        prev["n_menu"] = len(menu_list)
        # Mig 187: menu scelto valido + forbice «da X a Y» se il cliente non ha scelto
        prev["menu_scelto_id"] = _menu_scelto_id(conn, preventivo_id) if menu_list else None
        forbice = _forbice_totale(conn, preventivo_id) if menu_list else None
        prev["totale_min"], prev["totale_max"] = forbice if forbice else (None, None)
        prev["menu_righe"] = primary_righe  # retro-compat client vecchi

        return prev
    finally:
        conn.close()


# Titolo segnaposto delle bozze automatiche senza titolo: in lista non si mostrano
BOZZA_AUTO_TITOLO = "Preventivo in compilazione"


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
    periodo: str | None = None,
    prenotazione_id: int | None = None,
) -> dict:
    """Lista preventivi con filtri. Ritorna {items, total}.

    periodo='prossimi' (2026-10-16): eventi da oggi in poi + preventivi senza
    data evento (le bozze appena aperte). Default della pagina lista: prima il
    filtro anno corrente faceva sparire gli eventi dell'anno dopo.

    Per default le bozze automatiche (is_bozza_auto=1) sono ESCLUSE: sono
    preventivi creati in modo silenzioso dal composer menu su /nuovo e non
    confermati dall'utente. Usare includi_bozze_auto=True per vederle (uso
    amministrativo/debug).
    Eccezione (2026-10-16): le bozze automatiche con un titolo vero (non il
    placeholder BOZZA_AUTO_TITOLO) si vedono, la UI le marca «non salvata»:
    sono preventivi compilati a cui e' mancato solo «Crea preventivo»."""
    conn = get_clienti_conn()
    try:
        where = ["1=1"]
        params = []

        if not includi_bozze_auto and _bozza_auto_colonna_esiste(conn):
            where.append(
                "(COALESCE(p.is_bozza_auto, 0) = 0"
                " OR (TRIM(COALESCE(p.titolo, '')) != '' AND p.titolo != ?))"
            )
            params.append(BOZZA_AUTO_TITOLO)

        if stato:
            where.append("p.stato = ?")
            params.append(stato)
        if periodo == "prossimi":
            where.append(
                "(COALESCE(p.data_evento, '') = '' OR date(p.data_evento) >= date('now', 'localtime'))"
            )
        if mese and anno:
            where.append("strftime('%m', p.data_evento) = ? AND strftime('%Y', p.data_evento) = ?")
            params.extend([f"{mese:02d}", str(anno)])
        elif anno:
            where.append("strftime('%Y', p.data_evento) = ?")
            params.append(str(anno))
        if cliente_id:
            where.append("p.cliente_id = ?")
            params.append(cliente_id)
        if prenotazione_id:
            where.append("p.prenotazione_id = ?")
            params.append(prenotazione_id)
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
            "is_bozza_auto", "prenotazione_id",
        ]
        for campo in campi_ammessi:
            if campo in data:
                campi.append(f"{campo} = ?")
                val = data[campo]
                if campo == "is_bozza_auto":
                    val = 1 if val else 0
                params.append(val)

        if "menu_scelto_id" in data and _menu_scelto_col_exists(conn):
            # Menu scelto dal cliente (mig 187): None = non ha ancora scelto
            mid = data["menu_scelto_id"]
            if mid and not _menu_appartiene_a(conn, int(mid), preventivo_id):
                raise ValueError("menu_scelto_id non appartiene al preventivo")
            campi.append("menu_scelto_id = ?")
            params.append(int(mid) if mid else None)

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
                _copia_corpo(conn, m["id"], new_menu_id)
                if orig.get("menu_scelto_id") == m["id"] and _menu_scelto_col_exists(conn):
                    conn.execute(
                        "UPDATE clienti_preventivi SET menu_scelto_id = ? WHERE id = ?",
                        (new_menu_id, nuovo_id),
                    )
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
# Testo per il cliente (WhatsApp / email) — mig 187
# ---------------------------------------------------------------------------

OPZIONI = "ABCDEFGHIJ"


def _data_it(iso: str | None) -> str:
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return iso or ""


def testo_cliente(preventivo_id: int, formato: str = "whatsapp") -> str | None:
    """Messaggio pronto da incollare su WhatsApp o in una email.
    Menu: nome, portate in ordine e prezzo a persona (singolo o doppio vino
    escluso/incluso). MAI i prezzi dei singoli piatti. Extra con importo.
    Niente totale (decisione 2026-10-19): resta solo in scheda.
    formato='whatsapp' usa *grassetto* / _corsivo_; formato='email' testo semplice."""
    prev = get_preventivo(preventivo_id)
    if not prev:
        return None
    wa = formato != "email"
    B = (lambda t: f"*{t}*") if wa else (lambda t: t)
    I = (lambda t: f"_{t}_") if wa else (lambda t: f"{t}:")
    out: list[str] = []
    out.append(f"Preventivo {prev.get('numero') or ''} — {prev.get('titolo') or ''}".strip(" —"))
    info = []
    if prev.get("data_evento"):
        d = _data_it(prev["data_evento"])
        info.append(f"{d} ore {prev['ora_evento']}" if prev.get("ora_evento") else d)
    if prev.get("n_persone"):
        info.append(f"{prev['n_persone']} persone")
    if prev.get("luogo"):
        info.append(prev["luogo"])
    if info:
        out.append(" · ".join(info))

    menus = [m for m in prev.get("menu_list") or [] if m.get("righe")]
    scelto = prev.get("menu_scelto_id")
    if len(menus) > 1 and not scelto:
        out += ["", f"Vi proponiamo {len(menus)} menu, a scelta:"]
    for i, m in enumerate(menus):
        if len(menus) > 1 and scelto and m["id"] != scelto:
            continue
        from app.services.preventivi_pdf import _nome_menu
        nome = _nome_menu(m.get("nome"))      # «Menù gruppi Quadri» → «Quadri»
        if len(menus) > 1:
            titolo = f"Opzione {OPZIONI[i] if i < len(OPZIONI) else i + 1}" + (f" — {nome}" if nome else "")
        else:
            titolo = "Menu" + (f" — {nome}" if nome else "")
        out += ["", B(titolo)]
        cat_corrente = None
        for r in m["righe"]:
            cat = r.get("category_name")
            if cat and cat != cat_corrente:
                out.append(I(cat))
                cat_corrente = cat
            out.append(f"• {r['name']}")
        out.append(etichetta_prezzo(m))

    extra = [r for r in prev.get("righe") or [] if (r.get("descrizione") or "").strip()]
    if extra:
        out += ["", B("Extra")]
        for r in extra:
            if r.get("tipo_riga") == "nota":
                out.append(f"• {r['descrizione']}")
                continue
            qta = float(r.get("qta") or 0)
            pu = float(r.get("prezzo_unitario") or 0)
            segno = "−" if r.get("tipo_riga") == "sconto" else ""
            if qta != 1:
                q = int(qta) if qta == int(qta) else qta
                out.append(f"• {r['descrizione']}: {q} × {_euro(pu)} € = {segno}{_euro(qta * pu)} €")
            else:
                out.append(f"• {r['descrizione']}: {segno}{_euro(pu)} €")

    # Niente totale nel messaggio (Marco, 2026-10-19): il cliente legge il
    # prezzo a persona di ogni menu; il totale resta solo in scheda.

    # Note e condizioni sono scritte col mini-markup del PDF (# TITOLO, ## voce,
    # @dolci_carta, == prezzo, **grassetto**): nel messaggio vanno tradotte.
    from app.services.preventivi_pdf import testo_da_markup
    dolci = None
    for campo in ("note_cliente", "condizioni"):
        t = (prev.get(campo) or "").strip()
        if not t:
            continue
        if "@dolci_carta" in t and dolci is None:
            from app.services.carta_in_corso_service import dolci_in_carta
            dolci = dolci_in_carta()
        out += ["", testo_da_markup(t, formato, dolci)]
    return "\n".join(out).strip()


# ---------------------------------------------------------------------------
# PDF + invio al cliente (WhatsApp / email) + registro invii — mig 200
# ---------------------------------------------------------------------------

def genera_pdf(preventivo_id: int, stile: str = "menu") -> tuple[bytes, str] | None:
    """PDF del preventivo (mattone M.B) e nome file. None se il preventivo non c'è.
    stile='menu' (default, 2026-10-19): A5 nello stile del menù gruppi stampato,
    è quello che va al cliente (preventivi_pdf.py). stile='scheda': il vecchio
    foglio A4 con intestazione TRGB, stato e tabelle."""
    from app.services.pdf_brand import genera_pdf_html, safe_filename
    prev = get_preventivo(preventivo_id)
    if not prev:
        return None
    numero = prev.get("numero") or f"preventivo_{preventivo_id}"
    if stile == "scheda":
        pdf = genera_pdf_html(
            template="preventivo.html",
            dati={"prev": prev, "righe": prev.get("righe") or [], "menus": prev.get("menu_list") or []},
            titolo=f"Preventivo {numero}",
            sottotitolo=prev.get("titolo") or None,
            orientamento="portrait",
        )
    else:
        from app.services.preventivi_pdf import genera_pdf_menu
        from app.services.carta_in_corso_service import dolci_in_carta
        dolci = dolci_in_carta() if "@dolci_carta" in (prev.get("condizioni") or "") else None
        pdf = genera_pdf_menu(prev, dolci)
    return pdf, safe_filename(numero.replace("-", "_").lower(), ext="pdf")


def _invii_table_exists(conn) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_preventivi_invii'"
    ).fetchone())


def lista_invii(preventivo_id: int) -> list:
    conn = get_clienti_conn()
    try:
        if not _invii_table_exists(conn):
            return []
        rows = conn.execute(
            "SELECT * FROM clienti_preventivi_invii WHERE preventivo_id = ? ORDER BY id DESC",
            (preventivo_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def registra_invio(preventivo_id: int, canale: str, destinatario: str | None, username: str,
                   oggetto: str | None = None, esito: str = "ok",
                   errore: str | None = None, message_id: str | None = None) -> dict | None:
    """Scrive l'invio nel registro. Se riuscito e il preventivo è in «bozza»
    lo porta a «inviato» (ed esce dalle bozze automatiche: è stato mandato)."""
    if canale not in ("whatsapp", "email"):
        raise ValueError(f"Canale non valido: {canale}")
    conn = get_clienti_conn()
    try:
        row = conn.execute(
            "SELECT stato, canale FROM clienti_preventivi WHERE id = ?", (preventivo_id,)
        ).fetchone()
        if not row:
            return None
        if not _invii_table_exists(conn):
            raise ValueError("Registro invii non disponibile (migrazione 200 non applicata)")
        cur = conn.execute(
            """INSERT INTO clienti_preventivi_invii
               (preventivo_id, canale, destinatario, oggetto, esito, errore, message_id, inviato_da)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (preventivo_id, canale, destinatario, oggetto, esito, errore, message_id, username),
        )
        stato = row["stato"]
        if esito == "ok":
            if stato == "bozza":
                stato = "inviato"
                conn.execute(
                    "UPDATE clienti_preventivi SET stato = 'inviato', is_bozza_auto = 0 WHERE id = ?",
                    (preventivo_id,),
                )
            if not row["canale"]:
                conn.execute(
                    "UPDATE clienti_preventivi SET canale = ? WHERE id = ?", (canale, preventivo_id)
                )
        conn.commit()
        invio = conn.execute(
            "SELECT * FROM clienti_preventivi_invii WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return {"invio": dict(invio), "stato": stato}
    finally:
        conn.close()


def messaggio_breve(prev: dict, formato: str = "whatsapp", firma: str = "") -> str:
    """Messaggio asciutto (Marco, 2026-10-19), per WhatsApp e email: saluto, una
    riga sull'evento, i menù col prezzo a persona, «il resto è nel PDF», firma.
    Portate, dolci e condizioni stanno nel PDF allegato."""
    from app.services.preventivi_pdf import GIORNI, MESI, _nome_menu, _prezzo_menu
    wa = formato != "email"
    nome = (prev.get("cliente_nome") or "").strip()

    try:
        d = datetime.strptime(prev.get("data_evento") or "", "%Y-%m-%d")
        quando = f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]}"
    except ValueError:
        quando = ""
    evento = []
    if prev.get("n_persone"):
        evento.append(f"{prev['n_persone']} persone")
    if prev.get("ora_evento"):
        evento.append(f"alle {prev['ora_evento']}")
    riga_evento = "vi mandiamo la nostra proposta"
    if quando:
        riga_evento += f" per {quando}"
    if evento:
        riga_evento += (", " if quando else " per ") + " ".join(evento)
    riga_evento += "."

    menus = [m for m in prev.get("menu_list") or [] if m.get("righe")]
    scelto = prev.get("menu_scelto_id")
    if scelto and len(menus) > 1:
        menus = [m for m in menus if m["id"] == scelto]

    out = [f"Buongiorno {nome}," if nome else "Buongiorno,", "", riga_evento]
    if menus:
        out.append("")
        if len(menus) > 1:
            n = len(menus)
            out += [f"{_NUMERI[n] if n < len(_NUMERI) else n} menù tra cui scegliere:", ""]
        doppio = False
        for i, m in enumerate(menus):
            prezzo, nota = _prezzo_menu(m)
            doppio = doppio or nota.startswith("vino")
            prezzo = prezzo.replace("/", " / ") + " €"
            nm = _nome_menu(m.get("nome")) or (f"Opzione {OPZIONI[i]}" if len(menus) > 1 else "Il menù")
            out.append(f"• *{nm}* — {prezzo}" if wa else f"   {nm} — {prezzo}")
        nota = "a persona" + (", vino escluso / incluso" if doppio else "")
        out.append(f"_{nota}_" if wa else f"   {nota}")
    out += ["", "Nel PDF allegato trovate le portate e tutti i dettagli.", "",
            "Restiamo a disposizione.", "Un saluto,"]
    if firma:
        out.append(firma)
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Dopo l'invio al cliente (2026-10-22): copia per email all'osteria + messaggio
# per i gruppi WhatsApp di sala e cucina
# ---------------------------------------------------------------------------

def get_email_copia() -> str:
    """Indirizzi (separati da virgola) che ricevono la copia di ogni preventivo inviato."""
    conn = get_clienti_conn()
    try:
        r = conn.execute(
            "SELECT valore FROM clienti_impostazioni WHERE chiave = 'preventivi_email_copia'"
        ).fetchone()
        return (r["valore"] if r else "") or ""
    finally:
        conn.close()


def set_email_copia(valore: str) -> str:
    indirizzi = [x.strip() for x in (valore or "").replace(";", ",").split(",") if x.strip()]
    for x in indirizzi:
        if "@" not in x or "." not in x.split("@")[-1]:
            raise ValueError(f"Indirizzo non valido: {x}")
    v = ", ".join(indirizzi)
    conn = get_clienti_conn()
    try:
        conn.execute("""
            INSERT INTO clienti_impostazioni (chiave, valore, descrizione)
            VALUES ('preventivi_email_copia', ?, 'Copia (col PDF) di ogni preventivo inviato al cliente; vuoto = nessuna copia')
            ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore
        """, (v,))
        conn.commit()
        return v
    finally:
        conn.close()


def _riassunto_evento(prev: dict) -> tuple[str, str, str]:
    """(quando lungo, dd/mm, cliente) per messaggi e oggetti."""
    from app.services.preventivi_pdf import GIORNI, MESI
    try:
        d = datetime.strptime(prev.get("data_evento") or "", "%Y-%m-%d")
        quando = f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]}"
        breve = d.strftime("%d/%m")
    except ValueError:
        quando, breve = "", ""
    cliente = " ".join(x for x in [(prev.get("cliente_cognome") or "").strip(),
                                    (prev.get("cliente_nome") or "").strip()] if x) or (prev.get("titolo") or "")
    return quando, breve, cliente


def messaggio_invio_gruppi(prev: dict, canale: str) -> str:
    """Messaggio per i gruppi di sala e cucina: proposta mandata al cliente, menù proposti."""
    from app.services.preventivi_pdf import _nome_menu, _prezzo_menu
    quando, _, cliente = _riassunto_evento(prev)
    righe = ["📨 *Preventivo inviato*"]
    if quando:
        righe.append(f"*{quando[:1].upper() + quando[1:]}*" + (f" — ore {prev['ora_evento']}" if prev.get("ora_evento") else ""))
    pax = prev.get("n_persone")
    righe.append(" · ".join(x for x in [cliente, f"{pax} persone" if pax else "", prev.get("luogo") or ""] if x))
    menus = [m for m in prev.get("menu_list") or [] if m.get("righe")]
    if menus:
        righe.append("")
        doppio = False
        for i, m in enumerate(menus):
            prezzo, nota = _prezzo_menu(m)
            doppio = doppio or nota.startswith("vino")
            nm = _nome_menu(m.get("nome")) or (f"Opzione {OPZIONI[i]}" if len(menus) > 1 else "Menù")
            righe.append(f"• {nm} — {prezzo.replace('/', ' / ')} €")
        righe.append("_a persona" + (", vino escluso / incluso_" if doppio else "_"))
    righe += ["", f"Mandato al cliente via {'email' if canale == 'email' else 'WhatsApp'}. In attesa di conferma.",
              f"_{prev.get('numero') or ''}_"]
    return "\n".join(righe)


def _manda_copia(preventivo_id: int, canale: str, destinatario: str | None, username: str) -> None:
    """Copia col PDF agli indirizzi dell'osteria (in background: non rallenta l'invio)."""
    from app.services import email_service
    try:
        copia = [x.strip() for x in get_email_copia().split(",") if x.strip()]
        gia = {x.strip().lower() for x in (destinatario or "").split(",")}
        copia = [x for x in copia if x.lower() not in gia]
        if not copia:
            return
        prev = get_preventivo(preventivo_id)
        gen = genera_pdf(preventivo_id)
        if not prev or gen is None:
            return
        pdf, filename = gen
        quando, breve, cliente = _riassunto_evento(prev)
        oggetto = f"Preventivo inviato — {cliente} {breve} ({prev.get('numero') or ''})".replace("  ", " ")
        corpo = "\n".join([
            f"Preventivo {prev.get('numero') or ''} mandato a {cliente or 'cliente'}"
            f" via {'email' if canale == 'email' else 'WhatsApp'}"
            + (f" ({destinatario})" if destinatario else "") + f" da {username}.",
            "",
            messaggio_invio_gruppi(prev, canale).replace("*", "").replace("_", ""),
        ])
        esito = email_service.invia_email(to=copia, subject=oggetto, body=corpo,
                                          allegati=[(filename, pdf, "application/pdf")])
        if not esito.ok:
            logger.warning("Copia preventivo %s a %s non partita: %s", preventivo_id, copia, esito.errore)
    except Exception:  # noqa: BLE001 — la copia non deve mai bloccare l'invio
        logger.exception("Copia preventivo %s fallita", preventivo_id)


def dopo_invio(preventivo_id: int, canale: str, destinatario: str | None, username: str) -> dict:
    """Dopo un invio riuscito: copia per email all'osteria e messaggio per i gruppi."""
    import threading
    prev = get_preventivo(preventivo_id) or {}
    copia = get_email_copia()
    threading.Thread(target=_manda_copia, args=(preventivo_id, canale, destinatario, username),
                     name=f"copia-preventivo-{preventivo_id}", daemon=True).start()
    return {"messaggio_staff": messaggio_invio_gruppi(prev, canale) if prev else "", "copia_a": copia}


# ---------------------------------------------------------------------------
# Conferma dell'evento (2026-10-20): prenotazione aggiornata + avvisi a sala e cucina
# ---------------------------------------------------------------------------

STATI_CONFERMABILI = ("bozza", "inviato", "in_attesa", "confermato", "prenotato")


def _menu_dell_evento(prev: dict) -> dict | None:
    menus = [m for m in prev.get("menu_list") or [] if m.get("righe")]
    if prev.get("menu_scelto_id"):
        return next((m for m in menus if m["id"] == prev["menu_scelto_id"]), None)
    return menus[0] if len(menus) == 1 else None


def _prezzo_scelto(m: dict) -> str:
    """Il prezzo che vale per l'evento (col doppio prezzo: quello scelto, vino escluso o incluso)."""
    sconto = float(m.get("sconto") or 0)
    if m.get("pricing_mode") == "corpo" and m.get("doppio_prezzo"):
        incl = m.get("prezzo_corpo_scelta") == "incluso"
        v = max(0.0, float(m.get("prezzo_corpo_vino" if incl else "prezzo_corpo") or 0) - sconto)
        return f"{_euro(v)} € a persona, vino {'incluso' if incl else 'escluso'}"
    return f"{_euro(m.get('prezzo_persona') or 0)} € a persona"


def conferma_evento(preventivo_id: int, username: str, menu_scelto_id: int | None = None) -> dict | None:
    """Conferma il preventivo e fa partire quello che segue (decisione di Marco):
    prenotazione trovata o creata col menù scritto sopra, avviso nel campanello a
    sala e cucina, messaggio pronto per i gruppi WhatsApp. Si può rilanciare:
    riscrive il menù sulla prenotazione e riavvisa."""
    from app.services.preventivi_pdf import GIORNI, MESI, _nome_menu
    from app.services import evento_confermato_service as ev

    if menu_scelto_id:
        aggiorna_preventivo(preventivo_id, {"menu_scelto_id": menu_scelto_id})
    prev = get_preventivo(preventivo_id)
    if not prev:
        return None
    if prev.get("stato") not in STATI_CONFERMABILI:
        raise ValueError(f"Un preventivo «{prev.get('stato')}» non si conferma")
    m = _menu_dell_evento(prev)
    if m is None:
        raise ValueError("Scegli prima il menù che ha scelto il cliente")

    nome_menu = _nome_menu(m.get("nome")) or "del preventivo"
    prezzo = _prezzo_scelto(m)
    piatti = []
    for r in m.get("righe") or []:
        desc = (r.get("description") or "").replace(" · ", ", ").strip()
        piatti.append(f"• {r['name']}" + (f" ({desc})" if desc else ""))
    menu_evento = "\n".join([f"Menù {nome_menu} — {prezzo} — {prev.get('numero') or ''}".rstrip(" —"), *piatti])

    conn = get_clienti_conn()
    try:
        if prev["stato"] in ("bozza", "inviato", "in_attesa"):
            conn.execute("UPDATE clienti_preventivi SET stato = 'confermato', is_bozza_auto = 0 WHERE id = ?",
                         (preventivo_id,))
            conn.commit()
    finally:
        conn.close()
    prev = get_preventivo(preventivo_id)

    pren = ev.collega_prenotazione(prev, menu_evento, username)

    if pren["prenotazione_id"] and prev["stato"] == "confermato":
        conn = get_clienti_conn()
        try:
            conn.execute("UPDATE clienti_preventivi SET stato = 'prenotato' WHERE id = ?", (preventivo_id,))
            conn.commit()
        finally:
            conn.close()

    try:
        d = datetime.strptime(prev.get("data_evento") or "", "%Y-%m-%d")
        quando = f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]}"
        breve = d.strftime("%d/%m")
    except ValueError:
        quando, breve = "", ""
    cliente = " ".join(x for x in [(prev.get("cliente_cognome") or "").strip(),
                                    (prev.get("cliente_nome") or "").strip()] if x) or (prev.get("titolo") or "")
    pax = prev.get("n_persone")
    allergie = ev.allergie_prenotazione(pren["prenotazione_id"])

    righe_msg = ["✅ *Evento confermato*"]
    if quando:
        righe_msg.append(f"*{quando[:1].upper() + quando[1:]}*" + (f" — ore {prev['ora_evento']}" if prev.get("ora_evento") else ""))
    righe_msg.append(" · ".join(x for x in [cliente, f"{pax} persone" if pax else "", prev.get("luogo") or ""] if x))
    righe_msg += ["", f"*Menù {nome_menu}* ({prezzo})", *piatti]
    if allergie:
        righe_msg += ["", f"⚠️ *Allergie:* {allergie}"]
    for x in pren["avvisi"]:
        righe_msg.append(f"⚠️ {x}")
    righe_msg += ["", f"_{prev.get('numero') or ''}_"]
    messaggio_staff = "\n".join(righe_msg)

    titolo = f"✅ {breve} {cliente}: {pax or '?'} pax, Menù {nome_menu}".strip()
    corpo_notifica = "\n".join([*piatti] + ([f"Allergie: {allergie}"] if allergie else []))
    link = f"/prenotazioni/planning/{prev['data_evento']}" if prev.get("data_evento") else f"/clienti/preventivi/{preventivo_id}"
    n_notifiche = ev.avvisa_staff(titolo, corpo_notifica, link, preventivo_id)

    finale = get_preventivo(preventivo_id) or prev
    return {
        "stato": finale.get("stato"),
        "prenotazione": pren,
        "messaggio_staff": messaggio_staff,
        "notifiche": n_notifiche,
    }


def _firma_locale() -> str:
    """Nome mittente della casella del locale (M.D): firma di email e WhatsApp."""
    from app.services import email_service
    return email_service.stato().get("mittente_nome") or ""


def testo_breve(preventivo_id: int, formato: str = "whatsapp") -> str | None:
    prev = get_preventivo(preventivo_id)
    if not prev:
        return None
    return messaggio_breve(prev, formato, _firma_locale())


_NUMERI = ["", "Un", "Due", "Tre", "Quattro", "Cinque", "Sei", "Sette", "Otto", "Nove", "Dieci"]


def bozza_email(preventivo_id: int) -> dict | None:
    """Destinatario, oggetto e testo proposti per l'email (modificabili in UI):
    il messaggio asciutto (messaggio_breve). La firma è il nome mittente della
    casella del locale (M.D), non un testo fisso."""
    from app.services import email_service
    from app.services.preventivi_pdf import GIORNI, MESI
    prev = get_preventivo(preventivo_id)
    if not prev:
        return None
    st = email_service.stato()
    firma = st.get("mittente_nome") or ""
    try:
        d = datetime.strptime(prev.get("data_evento") or "", "%Y-%m-%d")
        quando = f"{GIORNI[d.weekday()]} {d.day} {MESI[d.month - 1]}"
    except ValueError:
        quando = ""
    oggetto = "Proposta menù" + (f" — {quando}" if quando else "")
    if firma:
        oggetto += f" · {firma}"
    return {
        "to": prev.get("cliente_email") or "",
        "oggetto": oggetto,
        "corpo": messaggio_breve(prev, "email", firma),
        "email_configurata": st.get("configurato", False),
        "email_mancanti": st.get("mancanti") or [],
    }


def invia_email_preventivo(preventivo_id: int, to: list[str], oggetto: str, corpo: str,
                           username: str) -> dict | None:
    """Manda l'email col PDF allegato (M.D) e la registra, anche se fallisce."""
    from app.services import email_service
    gen = genera_pdf(preventivo_id)
    if gen is None:
        return None
    pdf, filename = gen
    esito = email_service.invia_email(
        to=to, subject=oggetto, body=corpo,
        allegati=[(filename, pdf, "application/pdf")],
    )
    reg = registra_invio(
        preventivo_id, "email", ", ".join(to), username, oggetto=oggetto,
        esito="ok" if esito.ok else "errore", errore=esito.errore, message_id=esito.message_id,
    )
    return {"ok": esito.ok, "errore": esito.errore, **(reg or {})}


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
