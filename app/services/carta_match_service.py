# Modulo: banca (sub-modulo carta_credito)
"""
TRGB — Match service per la riconciliazione livello A:
movimento carta (banca_movimenti con banca LIKE 'CARTA_%')
   ↔ uscita CG (cg_uscite con metodo_pagamento='CARTA' AND banca_movimento_id IS NULL).

API pubblica (chiamata dal router `banca_carta_router`):

  get_match_settings(conn) -> dict
      Legge tolleranze/pesi/soglia auto dalla tabella `carta_match_settings`
      (singleton, mig 141). Fallback a default se row mancante.

  find_candidati(conn, movimento_id, *, settings=None, limit=20, search=None)
      → list[dict] candidate ordinate per score desc.
      Filtri pre: |importo| ±tolerance_importo_eur, |data| ±tolerance_data_days.
      `search`: filtro extra in OR sul fornitore_nome (substring case-insens.).

  apply_link(conn, movimento_id, uscita_id, *, user=None) -> dict
      UPDATE cg_uscite: banca_movimento_id = mov_id, stato = 'PAGATO'.
      Verifica che mov sia un movimento carta non già linkato e che
      l'uscita sia con metodo='CARTA' e banca_movimento_id IS NULL.

  remove_link(conn, movimento_id, *, user=None) -> dict
      Trova l'uscita con banca_movimento_id=mov_id, la riporta a
      banca_movimento_id=NULL, stato='PAGATO_MANUALE'.

  automatch_dry_run(conn, estratto_id, *, settings=None) -> list[dict]
      Per ogni movimento dell'estratto non ancora linkato, sceglie il
      miglior candidato (top score). Ritorna l'elenco dei "best match"
      con punteggio + breakdown.

  automatch_apply(conn, estratto_id, *, movimenti_id, user=None) -> dict
      Applica i match solo per i movimenti elencati. NON sceglie da solo:
      il chiamante deve aver già confermato la selezione via UI.

Scoring (config in carta_match_settings):
  score = w_imp * imp_score + w_data * data_score + w_forn * forn_score
  imp_score  = max(0, 1 − |imp_mov − totale_uscita| / tolerance_importo)
  data_score = max(0, 1 − |data_carta − data_pagamento| / tolerance_data_days)
  forn_score = 1.0 se primi 8 chars di fornitore_nome (lowercase) sono
               substring di descrizione (lowercase); 0.5 se almeno una parola
               di ≥4 chars del fornitore appare nella descrizione; 0 altrimenti.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Optional


# ──────────────────────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────────────────────

DEFAULTS = {
    "tolerance_importo_eur": 0.50,
    "tolerance_data_days": 10,
    "weight_importo": 0.50,
    "weight_data": 0.30,
    "weight_fornitore": 0.20,
    "auto_apply_threshold": 0.85,
    # CC.5.a: tolleranze per match B (estratto ↔ addebito CC, 1:1 esatto)
    "tolerance_cc_importo_eur": 0.10,
    "tolerance_cc_data_days": 3,
}


def get_match_settings(conn: sqlite3.Connection) -> dict:
    """Legge le settings dal DB. Fallback ai DEFAULTS se la tabella o la row
    è assente (es. boot prima della mig 141 in fase di test)."""
    try:
        row = conn.execute(
            "SELECT * FROM carta_match_settings WHERE id = 1"
        ).fetchone()
    except sqlite3.OperationalError:
        return dict(DEFAULTS)
    if not row:
        return dict(DEFAULTS)
    # Row factory potrebbe non essere sqlite3.Row se conn è "raw"
    keys = row.keys() if hasattr(row, "keys") else None
    if keys:
        out = {k: row[k] for k in keys if k in DEFAULTS}
    else:
        out = dict(DEFAULTS)
    # Patch eventuali NULL
    for k, v in DEFAULTS.items():
        if out.get(k) is None:
            out[k] = v
    return out


# ──────────────────────────────────────────────────────────────
# Score helpers
# ──────────────────────────────────────────────────────────────


def _importo_score(imp_mov: float, totale_uscita: float, tol_eur: float) -> float:
    if tol_eur <= 0:
        return 1.0 if abs(imp_mov - totale_uscita) < 0.005 else 0.0
    delta = abs(imp_mov - totale_uscita)
    return max(0.0, 1.0 - (delta / tol_eur))


def _data_score(data_carta_iso: str, data_pag_iso: str, tol_days: int) -> float:
    if not data_carta_iso or not data_pag_iso:
        return 0.0
    try:
        d1 = datetime.fromisoformat(data_carta_iso[:10])
        d2 = datetime.fromisoformat(data_pag_iso[:10])
    except ValueError:
        return 0.0
    delta = abs((d1 - d2).days)
    if tol_days <= 0:
        return 1.0 if delta == 0 else 0.0
    return max(0.0, 1.0 - (delta / max(tol_days, 1)))


def _fornitore_score(descrizione: str, fornitore: str) -> float:
    """Match testuale grezzo: substring case-insensitive + word match.
    Più sofisticato in futuro (Levenshtein, tokenizer)."""
    if not descrizione or not fornitore:
        return 0.0
    d = descrizione.lower()
    f = fornitore.lower()
    # Substring forte: primi 8 chars del fornitore presenti nella descrizione
    head = f[:8].strip()
    if head and head in d:
        return 1.0
    # Substring debole: una parola ≥4 chars del fornitore appare nella descrizione
    parole = [w.strip(".,&'-/") for w in f.split() if len(w.strip(".,&'-/")) >= 4]
    for w in parole:
        if w in d:
            return 0.5
    return 0.0


def _compute_score(imp_score: float, data_score: float, forn_score: float, settings: dict) -> float:
    return (
        settings["weight_importo"] * imp_score
        + settings["weight_data"] * data_score
        + settings["weight_fornitore"] * forn_score
    )


# ──────────────────────────────────────────────────────────────
# find_candidati
# ──────────────────────────────────────────────────────────────


def _fetch_movimento(conn: sqlite3.Connection, movimento_id: int) -> Optional[dict]:
    row = conn.execute(
        """SELECT id, data_contabile, data_valuta, ABS(importo) AS importo,
                  descrizione, banca, carta_codice_riferimento, carta_mcc,
                  carta_estratto_id
           FROM banca_movimenti
           WHERE id = ? AND banca LIKE 'CARTA_%'""",
        (movimento_id,),
    ).fetchone()
    if not row:
        return None
    return dict(row) if hasattr(row, "keys") else {
        "id": row[0], "data_contabile": row[1], "data_valuta": row[2],
        "importo": row[3], "descrizione": row[4], "banca": row[5],
        "carta_codice_riferimento": row[6], "carta_mcc": row[7],
        "carta_estratto_id": row[8],
    }


def find_candidati(
    conn: sqlite3.Connection,
    movimento_id: int,
    *,
    settings: Optional[dict] = None,
    limit: int = 20,
    search: Optional[str] = None,
) -> list[dict]:
    """Cerca uscite CG candidate per un movimento carta."""
    if settings is None:
        settings = get_match_settings(conn)

    mov = _fetch_movimento(conn, movimento_id)
    if not mov:
        return []
    imp_mov = mov["importo"]
    data_mov = mov["data_contabile"]
    desc_mov = mov["descrizione"] or ""

    tol_eur = settings["tolerance_importo_eur"]
    tol_days = settings["tolerance_data_days"]

    # Query base: uscite con metodo='CARTA' non ancora linkate, entro tolleranze
    sql = """
        SELECT u.id, u.fornitore_nome, u.totale, u.data_scadenza, u.data_pagamento,
               u.stato, u.metodo_pagamento, u.periodo_riferimento, u.note,
               u.tipo_uscita, u.fattura_id
        FROM cg_uscite u
        WHERE u.metodo_pagamento = 'CARTA'
          AND u.banca_movimento_id IS NULL
          AND u.totale > 0
          AND ABS(u.totale - ?) < ?
    """
    params: list = [imp_mov, tol_eur]

    # Pre-filtro su data_pagamento (se presente) con tol_days
    if data_mov:
        sql += " AND (u.data_pagamento IS NULL OR ABS(julianday(u.data_pagamento) - julianday(?)) < ?)"
        params.extend([data_mov, tol_days])

    if search:
        sql += " AND LOWER(u.fornitore_nome) LIKE ?"
        params.append(f"%{search.lower()}%")

    sql += " ORDER BY u.data_pagamento DESC, u.id DESC LIMIT 200"

    rows = conn.execute(sql, params).fetchall()

    candidati = []
    for r in rows:
        u = dict(r) if hasattr(r, "keys") else None
        if u is None:
            continue
        imp_score = _importo_score(imp_mov, u["totale"], tol_eur)
        data_score = _data_score(data_mov, u["data_pagamento"], tol_days)
        forn_score = _fornitore_score(desc_mov, u["fornitore_nome"] or "")
        score = _compute_score(imp_score, data_score, forn_score, settings)
        candidati.append({
            **u,
            "imp_score": round(imp_score, 3),
            "data_score": round(data_score, 3),
            "forn_score": round(forn_score, 3),
            "score": round(score, 3),
        })

    candidati.sort(key=lambda c: c["score"], reverse=True)
    return candidati[:limit]


# ──────────────────────────────────────────────────────────────
# apply_link / remove_link
# ──────────────────────────────────────────────────────────────


def apply_link(
    conn: sqlite3.Connection,
    movimento_id: int,
    uscita_id: int,
    *,
    user: Optional[str] = None,
) -> dict:
    """Linka movimento carta ↔ uscita CG. Promuove stato a 'PAGATO'.

    Validazioni:
      - Il movimento deve esistere e essere un movimento carta (banca LIKE 'CARTA_%')
      - L'uscita deve esistere, avere metodo='CARTA', banca_movimento_id IS NULL
      - Nessun'altra uscita deve essere già linkata a questo movimento
    """
    cur = conn.cursor()

    mov = _fetch_movimento(conn, movimento_id)
    if not mov:
        raise ValueError(f"Movimento carta #{movimento_id} non trovato")

    # Verifica che nessun'altra uscita sia già linkata a questo movimento
    existing = cur.execute(
        "SELECT id FROM cg_uscite WHERE banca_movimento_id = ?",
        (movimento_id,),
    ).fetchone()
    if existing:
        eid = existing[0] if not hasattr(existing, "keys") else existing["id"]
        raise ValueError(
            f"Movimento #{movimento_id} è già linkato all'uscita #{eid}. "
            "Rimuovi prima quel link e riprova."
        )

    u = cur.execute(
        """SELECT id, metodo_pagamento, banca_movimento_id, stato, totale
           FROM cg_uscite WHERE id = ?""",
        (uscita_id,),
    ).fetchone()
    if not u:
        raise ValueError(f"Uscita CG #{uscita_id} non trovata")

    u_dict = dict(u) if hasattr(u, "keys") else {
        "metodo_pagamento": u[1], "banca_movimento_id": u[2], "stato": u[3], "totale": u[4]
    }
    if u_dict["metodo_pagamento"] != "CARTA":
        raise ValueError(
            f"Uscita #{uscita_id} ha metodo_pagamento='{u_dict['metodo_pagamento']}', non 'CARTA'"
        )
    if u_dict["banca_movimento_id"] is not None:
        raise ValueError(
            f"Uscita #{uscita_id} è già linkata al movimento #{u_dict['banca_movimento_id']}"
        )

    cur.execute(
        """UPDATE cg_uscite
           SET banca_movimento_id = ?,
               stato = 'PAGATO',
               importo_pagato = totale,
               data_pagamento = COALESCE(data_pagamento, ?)
           WHERE id = ?""",
        (movimento_id, mov["data_contabile"], uscita_id),
    )
    conn.commit()
    return {
        "ok": True,
        "movimento_id": movimento_id,
        "uscita_id": uscita_id,
        "stato_nuovo": "PAGATO",
    }


def remove_link(
    conn: sqlite3.Connection,
    movimento_id: int,
    *,
    user: Optional[str] = None,
) -> dict:
    """Scollega il movimento da qualunque uscita CG. Riporta stato a 'PAGATO_MANUALE'."""
    cur = conn.cursor()
    u = cur.execute(
        "SELECT id, metodo_pagamento, stato FROM cg_uscite WHERE banca_movimento_id = ?",
        (movimento_id,),
    ).fetchone()
    if not u:
        return {"ok": True, "movimento_id": movimento_id, "uscita_id": None, "note": "nessun link presente"}

    u_dict = dict(u) if hasattr(u, "keys") else {"id": u[0], "metodo_pagamento": u[1], "stato": u[2]}
    cur.execute(
        """UPDATE cg_uscite
           SET banca_movimento_id = NULL,
               stato = CASE WHEN metodo_pagamento = 'CARTA' THEN 'PAGATO_MANUALE' ELSE stato END
           WHERE id = ?""",
        (u_dict["id"],),
    )
    conn.commit()
    return {
        "ok": True,
        "movimento_id": movimento_id,
        "uscita_id": u_dict["id"],
        "stato_nuovo": "PAGATO_MANUALE",
    }


# ──────────────────────────────────────────────────────────────
# automatch (dry_run + apply) — verranno richiamati da CC.4 push D2
# ──────────────────────────────────────────────────────────────


def automatch_dry_run(
    conn: sqlite3.Connection,
    estratto_id: int,
    *,
    settings: Optional[dict] = None,
) -> list[dict]:
    """Per ogni movimento dell'estratto NON linkato, sceglie il miglior
    candidato e ritorna l'anteprima. Non scrive nulla."""
    if settings is None:
        settings = get_match_settings(conn)

    mov_rows = conn.execute(
        """SELECT id FROM banca_movimenti
           WHERE carta_estratto_id = ?
             AND id NOT IN (SELECT banca_movimento_id FROM cg_uscite WHERE banca_movimento_id IS NOT NULL)
           ORDER BY data_contabile, id""",
        (estratto_id,),
    ).fetchall()

    out = []
    for mr in mov_rows:
        mid = mr[0] if not hasattr(mr, "keys") else mr["id"]
        cand = find_candidati(conn, mid, settings=settings, limit=1)
        if not cand:
            continue
        best = cand[0]
        if best["score"] <= 0:
            continue
        mov = _fetch_movimento(conn, mid)
        out.append({
            "movimento_id": mid,
            "mov_data": mov["data_contabile"],
            "mov_descrizione": mov["descrizione"],
            "mov_importo": mov["importo"],
            "uscita_id": best["id"],
            "uscita_fornitore": best["fornitore_nome"],
            "uscita_totale": best["totale"],
            "uscita_data_pagamento": best["data_pagamento"],
            "score": best["score"],
            "imp_score": best["imp_score"],
            "data_score": best["data_score"],
            "forn_score": best["forn_score"],
            "auto_select": best["score"] >= settings["auto_apply_threshold"],
        })
    return out


def automatch_apply(
    conn: sqlite3.Connection,
    estratto_id: int,
    *,
    movimenti_id: list[int],
    user: Optional[str] = None,
) -> dict:
    """Applica i match per la lista esplicita di movimenti.

    Per ogni movimento, ricalcola il miglior candidato corrente (così se nel
    frattempo qualcosa è cambiato lato CG, non applichiamo dati obsoleti).
    Se il miglior candidato esiste e ha score > 0, fa il link.
    """
    settings = get_match_settings(conn)
    applied = []
    skipped = []
    for mid in movimenti_id:
        try:
            cand = find_candidati(conn, mid, settings=settings, limit=1)
            if not cand or cand[0]["score"] <= 0:
                skipped.append({"movimento_id": mid, "motivo": "nessun candidato"})
                continue
            res = apply_link(conn, mid, cand[0]["id"], user=user)
            applied.append({"movimento_id": mid, "uscita_id": cand[0]["id"], "score": cand[0]["score"]})
        except ValueError as e:
            skipped.append({"movimento_id": mid, "motivo": str(e)})
    return {"applied": applied, "skipped": skipped, "n_applied": len(applied), "n_skipped": len(skipped)}


# ──────────────────────────────────────────────────────────────
# CC.5.a — Match livello B: estratto carta ↔ addebito mensile sul CC bancario
# ──────────────────────────────────────────────────────────────
#
# L'estratto carta dichiara `addebito_totale_cc` e `data_valuta_addebito`.
# Sul CC bancario (banca_movimenti con banca NOT LIKE 'CARTA_%') ci sarà UN
# movimento di uscita (importo negativo) con importo opposto e data vicina.
# Riconciliazione 1:1, salvata in `carta_estratti.banca_movimento_id`.


def _fetch_estratto(conn: sqlite3.Connection, estratto_id: int) -> Optional[dict]:
    row = conn.execute(
        """SELECT id, carta_id, data_chiusura, data_valuta_addebito,
                  addebito_totale_cc, banca_movimento_id
           FROM carta_estratti WHERE id = ?""",
        (estratto_id,),
    ).fetchone()
    if not row:
        return None
    return dict(row) if hasattr(row, "keys") else None


def find_candidati_cc(
    conn: sqlite3.Connection,
    estratto_id: int,
    *,
    settings: Optional[dict] = None,
    limit: int = 20,
) -> list[dict]:
    """Cerca movimenti CC bancari candidati come addebito mensile per un estratto.

    Filtri:
      - banca NOT LIKE 'CARTA_%' (movimenti CC normali, non carta)
      - importo NEGATIVO (è una uscita dal CC)
      - |ABS(importo) − addebito_totale_cc| < tolerance_cc_importo_eur
      - |data_contabile − data_valuta_addebito| < tolerance_cc_data_days
      - movimento NON già linkato a un altro estratto (carta_estratti.banca_movimento_id)

    Score: 70% importo + 30% data (no fornitore per match B — è un bonifico,
    la descrizione è "ADDEBITO CARTE BPM" o simili, non aggiunge segnale).
    """
    if settings is None:
        settings = get_match_settings(conn)

    e = _fetch_estratto(conn, estratto_id)
    if not e:
        return []
    target_imp = float(e["addebito_totale_cc"])
    target_data = e["data_valuta_addebito"]

    tol_imp = settings.get("tolerance_cc_importo_eur", DEFAULTS["tolerance_cc_importo_eur"])
    tol_data = settings.get("tolerance_cc_data_days", DEFAULTS["tolerance_cc_data_days"])

    sql = """
        SELECT m.id, m.data_contabile, m.data_valuta, m.banca, m.rapporto,
               m.importo, m.descrizione, m.categoria_banca, m.sottocategoria_banca
        FROM banca_movimenti m
        WHERE (m.banca IS NULL OR m.banca NOT LIKE 'CARTA_%')
          AND m.importo < 0
          AND ABS(ABS(m.importo) - ?) < ?
          AND m.id NOT IN (
              SELECT banca_movimento_id FROM carta_estratti
              WHERE banca_movimento_id IS NOT NULL AND id != ?
          )
    """
    params: list = [target_imp, tol_imp, estratto_id]
    if target_data:
        sql += " AND ABS(julianday(m.data_contabile) - julianday(?)) < ?"
        params.extend([target_data, tol_data])
    sql += " ORDER BY ABS(julianday(m.data_contabile) - julianday(?)) ASC LIMIT 200"
    params.append(target_data or e["data_chiusura"])

    rows = conn.execute(sql, params).fetchall()
    out = []
    for r in rows:
        m = dict(r) if hasattr(r, "keys") else None
        if not m:
            continue
        imp_abs = abs(float(m["importo"]))
        imp_score = max(0.0, 1.0 - abs(imp_abs - target_imp) / max(tol_imp, 0.01))
        data_score = _data_score(target_data, m["data_contabile"], tol_data) if target_data else 0.0
        score = 0.7 * imp_score + 0.3 * data_score
        out.append({
            **m,
            "importo_abs": round(imp_abs, 2),
            "imp_score": round(imp_score, 3),
            "data_score": round(data_score, 3),
            "score": round(score, 3),
        })

    out.sort(key=lambda c: c["score"], reverse=True)
    return out[:limit]


def apply_link_cc(
    conn: sqlite3.Connection,
    estratto_id: int,
    movimento_cc_id: int,
    *,
    user: Optional[str] = None,
) -> dict:
    """Collega estratto ↔ movimento CC bancario (match B).

    Validazioni:
      - Estratto esista
      - Movimento esista, sia un movimento CC normale (NON carta) e di uscita
      - Movimento non sia già linkato ad altro estratto
    """
    cur = conn.cursor()
    e = _fetch_estratto(conn, estratto_id)
    if not e:
        raise ValueError(f"Estratto #{estratto_id} non trovato")

    mov = cur.execute(
        "SELECT id, banca, importo FROM banca_movimenti WHERE id = ?",
        (movimento_cc_id,),
    ).fetchone()
    if not mov:
        raise ValueError(f"Movimento #{movimento_cc_id} non trovato")
    mov_d = dict(mov) if hasattr(mov, "keys") else None
    if mov_d.get("banca", "").startswith("CARTA_"):
        raise ValueError(
            f"Movimento #{movimento_cc_id} è un movimento carta (banca={mov_d['banca']}), "
            "non un addebito sul CC. Per il match B serve il movimento sul conto bancario."
        )

    # Verifica che il movimento non sia già linkato ad ALTRO estratto
    busy = cur.execute(
        "SELECT id FROM carta_estratti WHERE banca_movimento_id = ? AND id != ?",
        (movimento_cc_id, estratto_id),
    ).fetchone()
    if busy:
        bid = busy[0] if not hasattr(busy, "keys") else busy["id"]
        raise ValueError(
            f"Movimento #{movimento_cc_id} è già linkato all'estratto #{bid}"
        )

    cur.execute(
        "UPDATE carta_estratti SET banca_movimento_id = ? WHERE id = ?",
        (movimento_cc_id, estratto_id),
    )
    conn.commit()
    return {
        "ok": True,
        "estratto_id": estratto_id,
        "movimento_cc_id": movimento_cc_id,
    }


def remove_link_cc(
    conn: sqlite3.Connection,
    estratto_id: int,
    *,
    user: Optional[str] = None,
) -> dict:
    """Scollega l'estratto dal suo addebito CC (azzera banca_movimento_id)."""
    cur = conn.cursor()
    e = _fetch_estratto(conn, estratto_id)
    if not e:
        raise ValueError(f"Estratto #{estratto_id} non trovato")
    cur.execute(
        "UPDATE carta_estratti SET banca_movimento_id = NULL WHERE id = ?",
        (estratto_id,),
    )
    conn.commit()
    return {
        "ok": True,
        "estratto_id": estratto_id,
        "movimento_cc_id_precedente": e.get("banca_movimento_id"),
    }
