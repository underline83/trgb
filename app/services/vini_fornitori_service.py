# Modulo: vini (multi-fornitore) — [core]
"""
Vini multi-fornitore — VMF.1/VMF.2 (2026-11-02). Spec: docs/spec_vini_multifornitore.md

Un vino (madre) si compra da più fornitori; il PREFERITO resta
`vini_madre.fornitore_id` (serve agli ordini). Ogni annata (bottiglia) ha
prezzi per fornitore in `vini_prezzi_fornitore`, `tipo` pagato | listino.

REGOLA DEL COSTO (decisione Marco 2026-11-02, D2): il costo in uso
(`vini_bottiglie.EURO_LISTINO`) è l'ULTIMO PREZZO PAGATO, da qualunque
fornitore — riga `pagato`, stato `ok`, data più recente (a parità id più alto).
Un prezzo `listino` non tocca il costo (D5). Quando il costo cambia passa da
`update_vino` (storico prezzi) e il prezzo in carta si ricalcola col markup,
salvo `FORZA_PREZZO = 1`.

Tutte le scritture su vini_magazzino.sqlite3. Nessun import da router.
"""

from __future__ import annotations

import sqlite3
from datetime import date
from typing import Any, Dict, List, Optional

from app.models.vini_magazzino_db import get_magazzino_connection
from app.models import vini_magazzino_db as mag
from app.models import vini_anagrafiche_db as ana
from app.services import vini_anagrafiche_sync as ana_sync
from app.services.wine_pricing import calcola_prezzo_carta

TIPI = ("pagato", "listino")
FONTI = ("storico", "carico", "ordine", "fattura", "listino", "manuale")
ORIGINE_STORICO = "MULTIFORNITORE"


def _conn() -> sqlite3.Connection:
    c = get_magazzino_connection()
    c.row_factory = sqlite3.Row
    return c


def _oggi() -> str:
    return date.today().isoformat()


def _data_valida(d: Optional[str]) -> str:
    if not d:
        return _oggi()
    d = str(d)[:10]
    try:
        date.fromisoformat(d)
    except ValueError:
        raise ValueError(f"Data non valida: {d} (serve AAAA-MM-GG)")
    return d


def _madre_di(cur: sqlite3.Cursor, bottiglia_id: int) -> Optional[int]:
    r = cur.execute("SELECT madre_id FROM vini_bottiglie WHERE id = ?", (bottiglia_id,)).fetchone()
    if not r:
        raise ValueError(f"Vino id={bottiglia_id} non trovato")
    return r["madre_id"]


def _collega(cur: sqlite3.Cursor, madre_id: Optional[int], fornitore_id: int, note: Optional[str] = None) -> None:
    if madre_id:
        cur.execute(
            "INSERT OR IGNORE INTO vini_madre_fornitori (madre_id, fornitore_id, note) VALUES (?, ?, ?)",
            (madre_id, fornitore_id, note),
        )


# ─────────────────────────────────────────────
# LETTURA
# ─────────────────────────────────────────────

def _ultimo(cur: sqlite3.Cursor, bottiglia_id: int, fornitore_id: Optional[int], tipo: str) -> Optional[Dict[str, Any]]:
    sql = ("SELECT p.*, f.nome AS fornitore_nome FROM vini_prezzi_fornitore p "
           "LEFT JOIN vini_fornitori f ON f.id = p.fornitore_id "
           "WHERE p.bottiglia_id = ? AND p.tipo = ? AND p.stato = 'ok'")
    args: List[Any] = [bottiglia_id, tipo]
    if fornitore_id is not None:
        sql += " AND p.fornitore_id = ?"
        args.append(fornitore_id)
    sql += " ORDER BY p.data DESC, p.id DESC LIMIT 1"
    r = cur.execute(sql, args).fetchone()
    return dict(r) if r else None


def ultimo_pagato(bottiglia_id: int) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        return _ultimo(conn.cursor(), bottiglia_id, None, "pagato")
    finally:
        conn.close()


def fornitori_del_vino(madre_id: int) -> Dict[str, Any]:
    """Fornitori di un vino, preferito, e per ogni annata l'ultimo pagato e
    l'ultimo listino presso ciascun fornitore, più lo storico recente."""
    conn = _conn()
    try:
        cur = conn.cursor()
        m = cur.execute("SELECT id, fornitore_id FROM vini_madre WHERE id = ?", (madre_id,)).fetchone()
        if not m:
            raise ValueError(f"Vino madre id={madre_id} non trovato")
        preferito = m["fornitore_id"]

        fornitori = [dict(r) for r in cur.execute(
            """
            SELECT f.id AS fornitore_id, f.nome, COALESCE(f.attivo, 1) AS attivo, mf.note,
                   (SELECT MAX(p.data) FROM vini_prezzi_fornitore p
                      JOIN vini_bottiglie b ON b.id = p.bottiglia_id
                     WHERE b.madre_id = mf.madre_id AND p.fornitore_id = f.id
                       AND p.tipo = 'pagato' AND p.stato = 'ok') AS ultimo_acquisto
              FROM vini_madre_fornitori mf
              JOIN vini_fornitori f ON f.id = mf.fornitore_id
             WHERE mf.madre_id = ?
            """,
            (madre_id,),
        ).fetchall()]
        if preferito and not any(f["fornitore_id"] == preferito for f in fornitori):
            # preferito non ancora in tabella (vino creato dopo la mig 225)
            cur.execute("INSERT OR IGNORE INTO vini_madre_fornitori (madre_id, fornitore_id) VALUES (?, ?)",
                        (madre_id, preferito))
            conn.commit()
            return fornitori_del_vino(madre_id)
        for f in fornitori:
            f["preferito"] = f["fornitore_id"] == preferito
        fornitori.sort(key=lambda f: (not f["preferito"], -(int((f["ultimo_acquisto"] or "0").replace("-", "")))))

        annate = []
        for b in cur.execute(
            "SELECT id, ANNATA, FORMATO, EURO_LISTINO, PREZZO_CARTA, FORZA_PREZZO, "
            "COALESCE(QTA_TOTALE,0) AS qta FROM vini_bottiglie WHERE madre_id = ? "
            "ORDER BY ANNATA DESC, id DESC",
            (madre_id,),
        ).fetchall():
            prezzi = []
            for f in fornitori:
                prezzi.append({
                    "fornitore_id": f["fornitore_id"],
                    "pagato": _ultimo(cur, b["id"], f["fornitore_id"], "pagato"),
                    "listino": _ultimo(cur, b["id"], f["fornitore_id"], "listino"),
                })
            annate.append({
                "bottiglia_id": b["id"], "annata": b["ANNATA"], "formato": b["FORMATO"],
                "euro_listino": b["EURO_LISTINO"], "prezzo_carta": b["PREZZO_CARTA"],
                "forza_prezzo": b["FORZA_PREZZO"], "qta": b["qta"],
                "costo_da": _ultimo(cur, b["id"], None, "pagato"),
                "prezzi": prezzi,
            })

        storico = [dict(r) for r in cur.execute(
            """
            SELECT p.*, f.nome AS fornitore_nome, b.ANNATA AS annata
              FROM vini_prezzi_fornitore p
              JOIN vini_bottiglie b ON b.id = p.bottiglia_id
              LEFT JOIN vini_fornitori f ON f.id = p.fornitore_id
             WHERE b.madre_id = ?
             ORDER BY p.data DESC, p.id DESC LIMIT 60
            """,
            (madre_id,),
        ).fetchall()]
        return {"madre_id": madre_id, "preferito_id": preferito,
                "fornitori": fornitori, "annate": annate, "storico": storico}
    finally:
        conn.close()


def proposta_carico(bottiglia_id: int) -> Dict[str, Any]:
    """D3. Ordini aperti con questa annata (prima scelta) e fornitori del vino
    con l'ultimo usato in cima, per la tendina del carico."""
    conn = _conn()
    try:
        cur = conn.cursor()
        madre_id = _madre_di(cur, bottiglia_id)
        ordini = [dict(r) for r in cur.execute(
            """
            SELECT o.id AS ordine_id, o.fornitore_id, o.fornitore_nome, o.stato, o.data_invio,
                   r.id AS riga_id, r.qta_ordinata, r.qta_ricevuta, r.prezzo_unit
              FROM vini_ordini_righe r
              JOIN vini_ordini o ON o.id = r.ordine_id
             WHERE r.vino_id = ? AND o.stato IN ('inviato','parziale')
               AND r.qta_ricevuta < r.qta_ordinata
             ORDER BY o.data_invio DESC, o.id DESC
            """,
            (bottiglia_id,),
        ).fetchall()]
        fornitori: List[Dict[str, Any]] = []
        preferito = None
        if madre_id:
            m = cur.execute("SELECT fornitore_id FROM vini_madre WHERE id = ?", (madre_id,)).fetchone()
            preferito = m["fornitore_id"] if m else None
            if preferito:
                _collega(cur, madre_id, preferito)
                conn.commit()
            for r in cur.execute(
                """
                SELECT f.id AS fornitore_id, f.nome,
                       (SELECT MAX(p.data) FROM vini_prezzi_fornitore p
                          JOIN vini_bottiglie b ON b.id = p.bottiglia_id
                         WHERE b.madre_id = mf.madre_id AND p.fornitore_id = f.id
                           AND p.tipo = 'pagato' AND p.stato = 'ok') AS ultimo_acquisto
                  FROM vini_madre_fornitori mf JOIN vini_fornitori f ON f.id = mf.fornitore_id
                 WHERE mf.madre_id = ?
                """,
                (madre_id,),
            ).fetchall():
                d = dict(r)
                d["preferito"] = d["fornitore_id"] == preferito
                up = _ultimo(cur, bottiglia_id, d["fornitore_id"], "pagato")
                ul = _ultimo(cur, bottiglia_id, d["fornitore_id"], "listino")
                d["ultimo_pagato"] = up["prezzo"] if up else None
                d["ultimo_listino"] = ul["prezzo"] if ul else None
                fornitori.append(d)
        # ultimo usato in cima, poi il preferito, poi alfabetico
        fornitori.sort(key=lambda d: (d["ultimo_acquisto"] is None,
                                      "" if d["ultimo_acquisto"] is None else _inv(d["ultimo_acquisto"]),
                                      not d["preferito"], d["nome"].lower()))
        return {"bottiglia_id": bottiglia_id, "madre_id": madre_id,
                "ordini_aperti": ordini, "fornitori": fornitori}
    finally:
        conn.close()


def _inv(d: str) -> str:
    """Ordina le date al contrario dentro un sort crescente."""
    return "".join(chr(255 - ord(c)) for c in d)


# ─────────────────────────────────────────────
# SCRITTURA
# ─────────────────────────────────────────────

def aggiungi_fornitore(madre_id: int, fornitore_id: Optional[int] = None,
                       nome: Optional[str] = None, note: Optional[str] = None) -> Dict[str, Any]:
    conn = _conn()
    try:
        cur = conn.cursor()
        if not cur.execute("SELECT 1 FROM vini_madre WHERE id = ?", (madre_id,)).fetchone():
            raise ValueError(f"Vino madre id={madre_id} non trovato")
        if fornitore_id is None:
            nome = (nome or "").strip()
            if not nome:
                raise ValueError("Serve un fornitore esistente o il nome di uno nuovo")
            r = cur.execute("SELECT id FROM vini_fornitori WHERE UPPER(TRIM(nome)) = UPPER(?)",
                            (nome,)).fetchone()
            if r:
                fornitore_id = r["id"]
            else:
                conn.close()
                fornitore_id = ana.create_fornitore({"nome": nome})  # stessa via dell'anagrafica
                conn = _conn()
                cur = conn.cursor()
        elif not cur.execute("SELECT 1 FROM vini_fornitori WHERE id = ?", (fornitore_id,)).fetchone():
            raise ValueError(f"Fornitore id={fornitore_id} non trovato")
        _collega(cur, madre_id, int(fornitore_id), note)
        conn.commit()
        return {"madre_id": madre_id, "fornitore_id": int(fornitore_id)}
    finally:
        conn.close()


def rimuovi_fornitore(madre_id: int, fornitore_id: int) -> None:
    conn = _conn()
    try:
        cur = conn.cursor()
        m = cur.execute("SELECT fornitore_id FROM vini_madre WHERE id = ?", (madre_id,)).fetchone()
        if not m:
            raise ValueError(f"Vino madre id={madre_id} non trovato")
        if m["fornitore_id"] == fornitore_id:
            raise ValueError("È il fornitore preferito: scegline prima un altro come preferito")
        n = cur.execute(
            "SELECT COUNT(*) FROM vini_prezzi_fornitore p JOIN vini_bottiglie b ON b.id = p.bottiglia_id "
            "WHERE b.madre_id = ? AND p.fornitore_id = ? AND p.tipo = 'pagato' AND p.stato = 'ok'",
            (madre_id, fornitore_id),
        ).fetchone()[0]
        if n:
            raise ValueError(f"Da questo fornitore risultano {n} acquisti: resta nello storico")
        cur.execute("DELETE FROM vini_madre_fornitori WHERE madre_id = ? AND fornitore_id = ?",
                    (madre_id, fornitore_id))
        conn.commit()
    finally:
        conn.close()


def imposta_preferito(madre_id: int, fornitore_id: int) -> Dict[str, Any]:
    """Il preferito è `vini_madre.fornitore_id`: si cambia come dall'anagrafica
    (update_madre + sync delle bottiglie, che riscrive DISTRIBUTORE)."""
    aggiungi_fornitore(madre_id, fornitore_id=fornitore_id)
    ana.update_madre(madre_id, {"fornitore_id": int(fornitore_id)})
    n = ana_sync.sync_bottiglie_from_madre(madre_id)
    return {"madre_id": madre_id, "preferito_id": int(fornitore_id), "bottiglie_aggiornate": n}


def registra_prezzo(
    bottiglia_id: int,
    fornitore_id: int,
    prezzo: float,
    tipo: str = "pagato",
    data: Optional[str] = None,
    fonte: str = "manuale",
    movimento_id: Optional[int] = None,
    ordine_id: Optional[int] = None,
    fe_riga_id: Optional[int] = None,
    stato: str = "ok",
    note: Optional[str] = None,
    utente: Optional[str] = None,
) -> Dict[str, Any]:
    if tipo not in TIPI:
        raise ValueError(f"tipo non valido: {tipo}")
    if fonte not in FONTI:
        raise ValueError(f"fonte non valida: {fonte}")
    if prezzo is None or float(prezzo) <= 0:
        raise ValueError("Il prezzo deve essere maggiore di zero")
    data = _data_valida(data)
    conn = _conn()
    try:
        cur = conn.cursor()
        madre_id = _madre_di(cur, bottiglia_id)
        if not cur.execute("SELECT 1 FROM vini_fornitori WHERE id = ?", (fornitore_id,)).fetchone():
            raise ValueError(f"Fornitore id={fornitore_id} non trovato")
        _collega(cur, madre_id, fornitore_id)
        cur.execute(
            "INSERT INTO vini_prezzi_fornitore (bottiglia_id, fornitore_id, tipo, prezzo, data, fonte, "
            "movimento_id, ordine_id, fe_riga_id, stato, note, utente) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (bottiglia_id, fornitore_id, tipo, round(float(prezzo), 4), data, fonte,
             movimento_id, ordine_id, fe_riga_id, stato, note, utente),
        )
        pid = cur.lastrowid
        conn.commit()
    finally:
        conn.close()
    costo = riallinea_costo(bottiglia_id, utente=utente) if (tipo == "pagato" and stato == "ok") else None
    return {"id": pid, "costo": costo}


def scarta_prezzo(prezzo_id: int, utente: Optional[str] = None) -> Dict[str, Any]:
    conn = _conn()
    try:
        cur = conn.cursor()
        r = cur.execute("SELECT bottiglia_id FROM vini_prezzi_fornitore WHERE id = ?", (prezzo_id,)).fetchone()
        if not r:
            raise ValueError(f"Prezzo id={prezzo_id} non trovato")
        cur.execute("UPDATE vini_prezzi_fornitore SET stato = 'scartato', "
                    "note = TRIM(COALESCE(note,'') || ' [scartato da ' || COALESCE(?, '?') || ']') "
                    "WHERE id = ?", (utente, prezzo_id))
        conn.commit()
        bid = r["bottiglia_id"]
    finally:
        conn.close()
    return {"id": prezzo_id, "costo": riallinea_costo(bid, utente=utente)}


def riallinea_costo(bottiglia_id: int, utente: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """D2: EURO_LISTINO = ultimo pagato valido. Se cambia, prezzo in carta
    ricalcolato col markup salvo FORZA_PREZZO. Nessun pagato → costo invariato."""
    up = ultimo_pagato(bottiglia_id)
    if not up:
        return None
    row = mag.get_vino_by_id(bottiglia_id)
    if not row:
        return None
    attuale = row["EURO_LISTINO"]
    nuovo = round(float(up["prezzo"]), 4)
    esito = {"prezzo": nuovo, "fornitore": up.get("fornitore_nome"), "data": up["data"], "cambiato": False}
    if attuale is not None and abs(float(attuale) - nuovo) < 0.005:
        return esito
    data = {"EURO_LISTINO": nuovo}
    if not int(row["FORZA_PREZZO"] or 0):
        data["PREZZO_CARTA"] = calcola_prezzo_carta(nuovo)
    mag.update_vino(bottiglia_id, data, utente=utente, origine=ORIGINE_STORICO,
                    note=f"ultimo pagato: {up.get('fornitore_nome') or '?'} {up['data']} ({up['fonte']})")
    esito["cambiato"] = True
    esito["prezzo_carta"] = data.get("PREZZO_CARTA")
    return esito
