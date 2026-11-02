# @version: v1.0 (2026-11-02) — roadmap A.1 fase 3, mig 223
# -*- coding: utf-8 -*-
"""
Note di credito collegate alla fattura che stornano.

Modulo: acquisti (usato anche da banca). Classificazione: [core]

COME FUNZIONA
-------------
Una nota di credito (fe_fatture.tipo_documento = 'TD04') NON collegata non
tocca i pagamenti (decisione Marco 2026-10-02): conta solo nel conto
economico, col segno meno (fase 2).

Collegata a una fattura dello stesso fornitore, la sua quota si somma al
pagato dell'uscita (`cg_uscite.importo_pagato`), come fa un secondo bonifico:
  - fattura pagata in banca per 7.621,12 + NC 4,81 = 7.625,93 → PAGATO;
  - NC applicata prima del pagamento → l'uscita resta PARZIALE con la quota
    della NC già «pagata»; il bonifico del resto la chiude (la riconciliazione
    banca parte da importo_pagato delle PARZIALI);
  - NC che copre tutta la fattura e nessun bonifico → PAGATO: non c'è niente
    da pagare. `recompute_all_states` non la riporta a PAGATO_MANUALE.

Ogni riga di `fe_nc_collegamenti` è la quota di UNA nota su UNA uscita. Una
nota si può spezzare su più fatture finché ha residuo.

La soglia «scarto = arrotondamento» è la stessa della riconciliazione
(`carta_match_settings.tolerance_residuo_eur`, mig 172).
"""
from __future__ import annotations

import sqlite3
from typing import Optional

from app.services.fatture_filtri import TIPO_NOTA_CREDITO

TOLLERANZA_DEFAULT = 1.00

# Stati dell'uscita su cui una NC può ancora incidere. PAGATO e PAGATO_MANUALE
# sono già pagate per intero; RATEIZZATO vive nel piano della spesa fissa.
STATI_APERTI = ("PROGRAMMATO", "SCADUTO", "VERIFICARE", "PARZIALE", "SPOSTATO")


class NotaCreditoErrore(ValueError):
    """Errore di validazione da mostrare a Marco così com'è."""


def tolleranza(conn) -> float:
    try:
        row = conn.execute(
            "SELECT tolerance_residuo_eur FROM carta_match_settings WHERE id = 1"
        ).fetchone()
        val = float(row[0]) if row and row[0] is not None else TOLLERANZA_DEFAULT
    except (sqlite3.OperationalError, TypeError, ValueError):
        return TOLLERANZA_DEFAULT
    return val if val > 0 else TOLLERANZA_DEFAULT


def _doc(conn, doc_id: int) -> Optional[dict]:
    r = conn.execute(
        """SELECT id, fornitore_nome, fornitore_piva, numero_fattura, data_fattura,
                  totale_fattura, COALESCE(tipo_documento, 'TD01') AS tipo_documento
             FROM fe_fatture WHERE id = ?""",
        (doc_id,),
    ).fetchone()
    return dict(r) if r else None


def _stesso_fornitore(a: dict, b: dict) -> bool:
    pa, pb = (a.get("fornitore_piva") or "").strip(), (b.get("fornitore_piva") or "").strip()
    if pa and pb:
        return pa == pb
    return (a.get("fornitore_nome") or "").strip().lower() == (b.get("fornitore_nome") or "").strip().lower()


def residuo_nota(conn, nota_id: int) -> float:
    nota = _doc(conn, nota_id)
    if not nota:
        return 0.0
    usato = conn.execute(
        "SELECT COALESCE(SUM(importo), 0) FROM fe_nc_collegamenti WHERE nota_id = ?",
        (nota_id,),
    ).fetchone()[0]
    return round(abs(nota["totale_fattura"] or 0) - (usato or 0), 2)


def somma_nc_fattura(conn, fattura_id: int) -> float:
    r = conn.execute(
        "SELECT COALESCE(SUM(importo), 0) FROM fe_nc_collegamenti WHERE fattura_id = ?",
        (fattura_id,),
    ).fetchone()
    return round(float(r[0] or 0), 2)


def _uscite_aperte(conn, fattura_id: int) -> list:
    ph = ",".join("?" * len(STATI_APERTI))
    return [dict(r) for r in conn.execute(
        f"""SELECT id, totale, importo_pagato, stato, banca_movimento_id, data_scadenza
              FROM cg_uscite
             WHERE fattura_id = ? AND stato IN ({ph})
             ORDER BY COALESCE(data_scadenza, '9999-12-31'), id""",
        (fattura_id, *STATI_APERTI),
    ).fetchall()]


def scoperto_fattura(conn, fattura_id: int) -> float:
    tot = 0.0
    for u in _uscite_aperte(conn, fattura_id):
        gia = (u["importo_pagato"] or 0) if u["stato"] == "PARZIALE" else 0
        tot += max(0.0, (u["totale"] or 0) - gia)
    return round(tot, 2)


def collega(conn, fattura_id: int, nota_id: int, importo: Optional[float] = None) -> dict:
    """Applica (una quota di) una nota di credito alle uscite aperte della fattura.

    Non fa commit: lo fa il chiamante.
    """
    fatt, nota = _doc(conn, fattura_id), _doc(conn, nota_id)
    if not fatt or not nota:
        raise NotaCreditoErrore("Fattura o nota di credito non trovata")
    if fatt["tipo_documento"] == TIPO_NOTA_CREDITO:
        raise NotaCreditoErrore("Il documento da stornare è a sua volta una nota di credito")
    if nota["tipo_documento"] != TIPO_NOTA_CREDITO:
        raise NotaCreditoErrore("Il documento scelto non è una nota di credito (TD04)")
    if not _stesso_fornitore(fatt, nota):
        raise NotaCreditoErrore("La nota di credito è di un altro fornitore")

    disponibile = residuo_nota(conn, nota_id)
    if importo is not None:
        importo = round(float(importo), 2)
        if importo <= 0:
            raise NotaCreditoErrore("L'importo deve essere maggiore di zero")
        if importo > disponibile + 0.005:
            raise NotaCreditoErrore(f"La nota ha solo € {disponibile:.2f} ancora da usare")
        disponibile = importo
    if disponibile <= 0:
        raise NotaCreditoErrore("Questa nota di credito è già tutta collegata")

    uscite = _uscite_aperte(conn, fattura_id)
    if not uscite:
        # Fattura senza riga in cg_uscite (non ancora proiettata): la creo.
        from app.services.fatture_stato_service import _ensure_cg_uscita
        if _ensure_cg_uscita(conn, fattura_id):
            uscite = _uscite_aperte(conn, fattura_id)
    if not uscite:
        raise NotaCreditoErrore("La fattura risulta già pagata per intero: non c'è niente da stornare")

    tol = tolleranza(conn)
    esiti = []
    for u in uscite:
        if disponibile <= 0:
            break
        totale = float(u["totale"] or 0)
        gia = float(u["importo_pagato"] or 0) if u["stato"] == "PARZIALE" else 0.0
        da_coprire = round(totale - gia, 2)
        if da_coprire <= 0:
            continue
        quota = round(min(disponibile, da_coprire), 2)
        nuovo = round(gia + quota, 2)
        if totale - nuovo < tol:
            stato, pagato = "PAGATO", totale
        else:
            stato, pagato = "PARZIALE", nuovo
        conn.execute(
            """UPDATE cg_uscite
                  SET stato = ?, importo_pagato = ?,
                      in_pagamento_at = NULL, pagamento_batch_id = NULL,
                      updated_at = datetime('now')
                WHERE id = ?""",
            (stato, pagato, u["id"]),
        )
        conn.execute(
            """INSERT INTO fe_nc_collegamenti (nota_id, fattura_id, uscita_id, importo)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(nota_id, uscita_id) DO UPDATE SET importo = importo + excluded.importo""",
            (nota_id, fattura_id, u["id"], quota),
        )
        disponibile = round(disponibile - quota, 2)
        esiti.append({"uscita_id": u["id"], "quota": quota, "stato": stato,
                      "scoperto": 0.0 if stato == "PAGATO" else round(totale - nuovo, 2)})
    if not esiti:
        raise NotaCreditoErrore("La fattura risulta già coperta: non c'è niente da stornare")
    return {"ok": True, "applicato": round(sum(e["quota"] for e in esiti), 2), "uscite": esiti}


def scollega(conn, collegamento_id: int) -> dict:
    """Toglie una quota di nota di credito e rimette l'uscita com'era. Non fa commit."""
    c = conn.execute(
        "SELECT id, uscita_id, importo FROM fe_nc_collegamenti WHERE id = ?",
        (collegamento_id,),
    ).fetchone()
    if not c:
        raise NotaCreditoErrore("Collegamento non trovato")
    c = dict(c)
    u = conn.execute(
        """SELECT id, totale, importo_pagato, stato, banca_movimento_id, data_scadenza
             FROM cg_uscite WHERE id = ?""",
        (c["uscita_id"],),
    ).fetchone()
    conn.execute("DELETE FROM fe_nc_collegamenti WHERE id = ?", (collegamento_id,))
    if not u:
        return {"ok": True}
    u = dict(u)
    if u["stato"] in ("PAGATO_MANUALE", "RATEIZZATO"):
        # L'utente ha deciso dopo: non tocco lo stato che ha scelto lui.
        return {"ok": True}
    tol = tolleranza(conn)
    totale = float(u["totale"] or 0)
    prima = float(u["importo_pagato"] or 0)
    if u["stato"] == "PAGATO" and prima <= 0:
        prima = totale
    resta = round(prima - c["importo"], 2)
    if resta <= 0.005:
        conn.execute(
            """UPDATE cg_uscite
                  SET stato = CASE WHEN data_scadenza < date('now') THEN 'SCADUTO' ELSE 'PROGRAMMATO' END,
                      importo_pagato = 0, updated_at = datetime('now')
                WHERE id = ?""",
            (u["id"],),
        )
    elif totale - resta < tol:
        conn.execute(
            "UPDATE cg_uscite SET stato = 'PAGATO', importo_pagato = ?, updated_at = datetime('now') WHERE id = ?",
            (totale, u["id"]),
        )
    else:
        conn.execute(
            "UPDATE cg_uscite SET stato = 'PARZIALE', importo_pagato = ?, updated_at = datetime('now') WHERE id = ?",
            (resta, u["id"]),
        )
    return {"ok": True}


def elenco(conn, doc_id: int) -> dict:
    """Per una fattura: NC collegate, scoperto e NC dello stesso fornitore ancora
    disponibili. Per una nota: le fatture su cui è applicata e il residuo."""
    doc = _doc(conn, doc_id)
    if not doc:
        raise NotaCreditoErrore("Documento non trovato")
    if doc["tipo_documento"] == TIPO_NOTA_CREDITO:
        righe = [dict(r) for r in conn.execute(
            """SELECT c.id, c.fattura_id AS doc_id, f.numero_fattura, f.data_fattura,
                      f.totale_fattura AS totale, SUM(c.importo) AS importo
                 FROM fe_nc_collegamenti c JOIN fe_fatture f ON f.id = c.fattura_id
                WHERE c.nota_id = ?
                GROUP BY c.id ORDER BY f.data_fattura""",
            (doc_id,),
        ).fetchall()]
        return {"tipo": "nota", "totale": abs(doc["totale_fattura"] or 0),
                "residuo": residuo_nota(conn, doc_id), "collegati": righe}

    righe = [dict(r) for r in conn.execute(
        """SELECT c.id, c.nota_id AS doc_id, f.numero_fattura, f.data_fattura,
                  f.totale_fattura AS totale, c.importo
             FROM fe_nc_collegamenti c JOIN fe_fatture f ON f.id = c.nota_id
            WHERE c.fattura_id = ?
            ORDER BY f.data_fattura""",
        (doc_id,),
    ).fetchall()]
    candidate = []
    for r in conn.execute(
        """SELECT id, numero_fattura, data_fattura, totale_fattura, fornitore_piva, fornitore_nome
             FROM fe_fatture
            WHERE tipo_documento = ? AND id != ?
            ORDER BY data_fattura DESC""",
        (TIPO_NOTA_CREDITO, doc_id),
    ).fetchall():
        r = dict(r)
        if not _stesso_fornitore(doc, r):
            continue
        res = residuo_nota(conn, r["id"])
        if res > 0:
            candidate.append({"id": r["id"], "numero_fattura": r["numero_fattura"],
                              "data_fattura": r["data_fattura"],
                              "totale": abs(r["totale_fattura"] or 0), "residuo": res})
    return {"tipo": "fattura", "scoperto": scoperto_fattura(conn, doc_id),
            "collegati": righe, "candidate": candidate}
