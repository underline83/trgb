# @version: v1.0 (2026-11-06) — il pagamento delle uscite collegate chiude la pratica
# -*- coding: utf-8 -*-
"""
Controllo pagamenti delle pratiche — TRGB Gestionale. Modulo: pratiche. [core]

Decisioni di Marco del 06/11/2026 (Q #315, #319, #321):
- TRGB si accorge dei pagamenti con un CONTROLLO A INTERVALLI, non toccando i
  ~37 punti che scrivono PAGATO: così prende ogni strada (riconciliazione,
  «segna pagata», carta, Q da MCP, import, correzioni a mano) e le riaperture.
  L'intervallo è `controllo_pagamenti_minuti` in pratiche_config (Impostazioni
  pratiche), partenza 10; 0 = spento.
- Contano i collegamenti `controllo_gestione` di tipo:
    · `uscita`       → una riga di cg_uscite (ref_id = id);
    · `spesa_fissa`  → TUTTE le rate del piano (cg_piano_rate) di una rateizzazione
                       o di un prestito con una fine (tipi in TIPI_CON_FINE e
                       data_fine valorizzata). Una spesa fissa senza fine (affitto…)
                       non si «finisce di pagare»: il collegamento è solo un riferimento.
- La pratica si CHIUDE quando sono pagate tutte le uscite contate (PAGATO o
  PAGATO_MANUALE), con un passo automatico e l'esito «Pagato …».
- Se poi un pagamento viene annullato:
    · chiusa da questo controllo  → passo automatico e RIAPERTURA (tocca a me);
    · chiusa a mano da Marco      → resta chiusa: passo automatico «annullato» e
                                    notifica, decide lui;
    · già riaperta                → solo il passo.
- Agisce solo sui CAMBI: lo stato visto l'ultima volta sta in
  pratiche_pagamenti_visti. Al primo giro non c'è un «prima»: se è già tutto
  pagato e la pratica è aperta si chiude; un annullamento si riconosce solo se
  prima risultava tutto pagato.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.pratiche_db import get_pratiche_conn
from app.utils.locale_data import locale_data_path

logger = logging.getLogger("trgb.pratiche_pagamenti")

FOODCOST_DB = locale_data_path("foodcost.db")
STATI_PAGATI = ("PAGATO", "PAGATO_MANUALE")
TIPI_CON_FINE = ("RATEIZZAZIONE", "RATEIZZAZIONE_TASSE", "PRESTITO")
AUTORE = "TRGB (controllo pagamenti)"
CHIAVE_MINUTI = "controllo_pagamenti_minuti"
MINUTI_DEFAULT = 10
MINUTI_MAX = 24 * 60

_lock = threading.Lock()
_stato: Dict[str, Any] = {"avviato": False, "ultimo": None, "esito": None}


# ─────────────────────────────────────────────
# Schema e impostazione
# ─────────────────────────────────────────────

def init_schema(conn) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pratiche_pagamenti_visti (
            pratica_id         INTEGER PRIMARY KEY REFERENCES pratiche(id),
            tutte_pagate       INTEGER NOT NULL,
            quante             INTEGER NOT NULL,
            pagate             INTEGER NOT NULL,
            totale             REAL,
            ultimo_pagamento   TEXT,
            passo_chiusura_id  INTEGER,       -- il passo con cui QUESTO controllo l'ha chiusa
            aggiornato_at      TEXT NOT NULL
        )
    """)
    conn.execute(
        "INSERT OR IGNORE INTO pratiche_config (chiave, valore) VALUES (?, ?)",
        (CHIAVE_MINUTI, str(MINUTI_DEFAULT)),
    )


def minuti(conn=None) -> int:
    propria = conn is None
    conn = conn or get_pratiche_conn()
    try:
        r = conn.execute("SELECT valore FROM pratiche_config WHERE chiave = ?", (CHIAVE_MINUTI,)).fetchone()
        try:
            n = int(r["valore"]) if r else MINUTI_DEFAULT
        except (TypeError, ValueError):
            n = MINUTI_DEFAULT
    finally:
        if propria:
            conn.close()
    return max(0, min(MINUTI_MAX, n))


def salva_minuti(n: int) -> int:
    from app.services.pratiche_service import PraticaErrore
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise PraticaErrore("Controllo pagamenti: serve un numero intero di minuti")
    if not 0 <= n <= MINUTI_MAX:
        raise PraticaErrore(f"Controllo pagamenti: fra 0 (spento) e {MINUTI_MAX} minuti")
    conn = get_pratiche_conn()
    try:
        conn.execute(
            "INSERT INTO pratiche_config (chiave, valore) VALUES (?, ?) "
            "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore",
            (CHIAVE_MINUTI, str(n)),
        )
        conn.commit()
    finally:
        conn.close()
    return n


# ─────────────────────────────────────────────
# Lettura dei pagamenti (foodcost.db, sola lettura)
# ─────────────────────────────────────────────

def _fc():
    conn = sqlite3.connect(f"file:{FOODCOST_DB}?mode=ro", uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _uscite_del_collegamento(fc, c) -> Optional[List[Dict[str, Any]]]:
    """Le uscite che un collegamento chiede di pagare: lista di {pagata, importo,
    data_pagamento}. None = collegamento che non conta (non è un pagamento con una fine)."""
    if c["modulo"] != "controllo_gestione":
        return None
    try:
        ref = int(str(c["ref_id"]).strip())
    except (TypeError, ValueError):
        return None
    if c["tipo"] == "uscita":
        u = fc.execute("SELECT stato, totale, importo_pagato, data_pagamento FROM cg_uscite WHERE id = ?",
                       (ref,)).fetchone()
        if not u:  # uscita sparita: non risulta pagata
            return [{"pagata": False, "importo": 0.0, "data_pagamento": None}]
        return [{"pagata": u["stato"] in STATI_PAGATI,
                 "importo": float(u["importo_pagato"] or u["totale"] or 0),
                 "data_pagamento": u["data_pagamento"]}]
    if c["tipo"] == "spesa_fissa":
        sf = fc.execute("SELECT tipo, data_fine FROM cg_spese_fisse WHERE id = ?", (ref,)).fetchone()
        if not sf or sf["tipo"] not in TIPI_CON_FINE or not sf["data_fine"]:
            return None
        rate = fc.execute(
            "SELECT periodo, importo FROM cg_piano_rate WHERE spesa_fissa_id = ? ORDER BY periodo", (ref,)
        ).fetchall()
        out = []
        for r in rate:
            u = fc.execute(
                """SELECT stato, totale, importo_pagato, data_pagamento FROM cg_uscite
                    WHERE spesa_fissa_id = ? AND periodo_riferimento = ?
                    ORDER BY id DESC LIMIT 1""",
                (ref, r["periodo"]),
            ).fetchone()
            pagata = bool(u and u["stato"] in STATI_PAGATI)
            out.append({"pagata": pagata,
                        "importo": float((u and (u["importo_pagato"] or u["totale"])) or r["importo"] or 0),
                        "data_pagamento": u["data_pagamento"] if u else None})
        return out or None
    return None


def situazione(fc, collegamenti) -> Optional[Dict[str, Any]]:
    """Il quadro dei pagamenti di una pratica, o None se nessun collegamento conta."""
    voci: List[Dict[str, Any]] = []
    rate = False
    for c in collegamenti:
        v = _uscite_del_collegamento(fc, c)
        if v is None:
            continue
        rate = rate or c["tipo"] == "spesa_fissa"
        voci.extend(v)
    if not voci:
        return None
    pagate = [v for v in voci if v["pagata"]]
    date_pag = [v["data_pagamento"] for v in pagate if v["data_pagamento"]]
    return {
        "quante": len(voci),
        "pagate": len(pagate),
        "tutte": len(pagate) == len(voci),
        "totale": round(sum(v["importo"] for v in pagate), 2),
        "ultimo": max(date_pag) if date_pag else None,
        "rate": rate,
    }


# ─────────────────────────────────────────────
# Testi
# ─────────────────────────────────────────────

def _testo_pagato(s: Dict[str, Any]) -> str:
    from app.services.pratiche_service import _fmt_data, _fmt_euro
    quando = f" il {_fmt_data(s['ultimo'])}" if s["ultimo"] else ""
    if s["quante"] == 1:
        return f"Pagato {_fmt_euro(s['totale'])}{quando}"
    cosa = "rate" if s["rate"] else "uscite"
    return f"Pagate tutte: {s['quante']} {cosa}, {_fmt_euro(s['totale'])} in totale, ultima{quando}"


def _testo_annullato(prima, s: Dict[str, Any]) -> str:
    from app.services.pratiche_service import _fmt_data, _fmt_euro
    quando = f" del {_fmt_data(prima['ultimo_pagamento'])}" if prima["ultimo_pagamento"] else ""
    importo = _fmt_euro(prima["totale"]) if prima["totale"] is not None else ""
    mancano = s["quante"] - s["pagate"] if s else None
    coda = f" (non pagate: {mancano} su {s['quante']})" if s and s["quante"] > 1 else ""
    return f"Il pagamento di {importo}{quando} è stato annullato nello scadenziario{coda}"


# ─────────────────────────────────────────────
# Un giro
# ─────────────────────────────────────────────

def _ultimo_passo_chiusura(conn, pratica_id: int) -> Optional[int]:
    r = conn.execute(
        "SELECT id FROM pratiche_passi WHERE pratica_id = ? AND stato_a = 'chiusa' ORDER BY id DESC LIMIT 1",
        (pratica_id,),
    ).fetchone()
    return r["id"] if r else None


def _notifica_annullato(pratica, testo: str) -> None:
    try:
        from app.services.notifiche_service import crea_notifica
        # le notifiche per ruolo confrontano il ruolo esatto: superadmin (Marco) e admin
        for ruolo in ("superadmin", "admin"):
            crea_notifica(
                tipo="pratiche_pagamento_annullato",
                titolo=f"Pagamento annullato: {pratica['titolo']}",
                messaggio=f"{testo}. La pratica era chiusa a mano e resta chiusa: decidi tu se riaprirla.",
                link=f"/pratiche/{pratica['id']}",
                icona="📂",
                urgenza="alta",
                modulo="pratiche",
                entity_id=pratica["id"],
                dest_ruolo=ruolo,
            )
    except Exception:
        logger.exception("notifica pagamento annullato non creata (pratica %s)", pratica["id"])


def giro(oggi=None) -> Dict[str, Any]:
    """Un controllo su tutte le pratiche con collegamenti. Ritorna cosa ha fatto."""
    from app.services import pratiche_service as svc

    fatto = {"guardate": 0, "chiuse": [], "riaperte": [], "annullate_chiuse_a_mano": [], "note": []}
    with _lock:
        conn = get_pratiche_conn()
        try:
            init_schema(conn)
            conn.commit()
            pratiche = conn.execute(
                "SELECT * FROM pratiche WHERE id IN (SELECT DISTINCT pratica_id FROM pratiche_collegamenti)"
            ).fetchall()
            visti = {r["pratica_id"]: dict(r) for r in conn.execute("SELECT * FROM pratiche_pagamenti_visti")}
            colleg: Dict[int, list] = {}
            for c in conn.execute("SELECT * FROM pratiche_collegamenti ORDER BY id"):
                colleg.setdefault(c["pratica_id"], []).append(dict(c))
        finally:
            conn.close()

        fc = _fc()
        try:
            quadri = {p["id"]: situazione(fc, colleg.get(p["id"], [])) for p in pratiche}
        finally:
            fc.close()

        for p in pratiche:
            s = quadri[p["id"]]
            prima = visti.get(p["id"])
            if s is None:
                continue
            fatto["guardate"] += 1
            passo_chiusura = prima["passo_chiusura_id"] if prima else None
            era_tutto = bool(prima and prima["tutte_pagate"])

            try:
                if s["tutte"] and not era_tutto:
                    if p["stato"] != "chiusa":
                        esito = _testo_pagato(s)
                        svc.aggiungi_passo(p["id"], esito, stato_a="chiusa", esito=esito,
                                           autore=AUTORE, automatico=True, oggi=oggi)
                        c2 = get_pratiche_conn()
                        try:
                            passo_chiusura = _ultimo_passo_chiusura(c2, p["id"])
                        finally:
                            c2.close()
                        fatto["chiuse"].append(p["id"])
                    else:
                        passo_chiusura = None  # già chiusa da qualcun altro: non è nostra

                elif not s["tutte"] and era_tutto:
                    testo = _testo_annullato(prima, s)
                    if p["stato"] == "chiusa":
                        c2 = get_pratiche_conn()
                        try:
                            nostra = passo_chiusura and _ultimo_passo_chiusura(c2, p["id"]) == passo_chiusura
                        finally:
                            c2.close()
                        if nostra:
                            svc.aggiungi_passo(p["id"], f"{testo}: la pratica si riapre", stato_a="tocca_a_me",
                                               autore=AUTORE, automatico=True, oggi=oggi)
                            fatto["riaperte"].append(p["id"])
                        else:
                            svc.aggiungi_passo(p["id"], f"{testo}. La pratica era chiusa a mano e resta chiusa",
                                               autore=AUTORE, automatico=True, oggi=oggi)
                            _notifica_annullato(p, testo)
                            fatto["annullate_chiuse_a_mano"].append(p["id"])
                    else:
                        svc.aggiungi_passo(p["id"], testo, autore=AUTORE, automatico=True, oggi=oggi)
                        fatto["note"].append(p["id"])
                    passo_chiusura = None
            except Exception:
                logger.exception("controllo pagamenti: pratica %s non aggiornata", p["id"])
                continue  # lo stato visto non si aggiorna: ci riprova al giro dopo

            conn = get_pratiche_conn()
            try:
                conn.execute(
                    """INSERT INTO pratiche_pagamenti_visti
                         (pratica_id, tutte_pagate, quante, pagate, totale, ultimo_pagamento,
                          passo_chiusura_id, aggiornato_at)
                       VALUES (?,?,?,?,?,?,?,?)
                       ON CONFLICT(pratica_id) DO UPDATE SET
                         tutte_pagate = excluded.tutte_pagate, quante = excluded.quante,
                         pagate = excluded.pagate,
                         totale = CASE WHEN excluded.tutte_pagate THEN excluded.totale
                                       ELSE pratiche_pagamenti_visti.totale END,
                         ultimo_pagamento = CASE WHEN excluded.tutte_pagate THEN excluded.ultimo_pagamento
                                       ELSE pratiche_pagamenti_visti.ultimo_pagamento END,
                         passo_chiusura_id = excluded.passo_chiusura_id,
                         aggiornato_at = excluded.aggiornato_at""",
                    (p["id"], 1 if s["tutte"] else 0, s["quante"], s["pagate"],
                     s["totale"] if s["tutte"] else None, s["ultimo"] if s["tutte"] else None,
                     passo_chiusura, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                )
                conn.commit()
            finally:
                conn.close()

    _stato["ultimo"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    _stato["esito"] = fatto
    if fatto["chiuse"] or fatto["riaperte"] or fatto["annullate_chiuse_a_mano"] or fatto["note"]:
        logger.info("controllo pagamenti pratiche: %s", fatto)
    return fatto


def stato() -> Dict[str, Any]:
    return {"minuti": minuti(), **_stato}


# ─────────────────────────────────────────────
# Il thread (un solo worker uvicorn, come lo scarico notturno di iPratico)
# ─────────────────────────────────────────────

def avvia() -> None:
    if _stato["avviato"]:
        return
    _stato["avviato"] = True

    def _ciclo():
        time.sleep(60)  # lascia finire il boot
        while True:
            n = minuti()
            if n > 0:
                try:
                    giro()
                except Exception:
                    logger.exception("controllo pagamenti pratiche: giro fallito")
            time.sleep(max(60, (n or 10) * 60))

    threading.Thread(target=_ciclo, name="pratiche-pagamenti", daemon=True).start()
