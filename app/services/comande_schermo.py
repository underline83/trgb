# -*- coding: utf-8 -*-
# @version: v1.0 — schermo di cucina: i foglietti dei tavoli aperti per un reparto (2026-11-24)
"""
Modulo: comande — lo «schermo cucina». Doc: docs/modulo_comande.md §2 e §7.

Marco, 24/11/2026, viste tre prove: «meglio in stile 1 (cucina), mentalmente deve
ricordare molto il foglietto per avere una visione di tutto». Quindi un foglietto per
tavolo aperto, con la comanda intera del reparto scritta come sul foglio stampato
(comande_stampa): tavolo, coperti, allergie del tavolo, uscite che vanno o attendono,
sollecito, righe annullate.

Sola lettura, nessuna tabella nuova: tutto si ricava da conti, righe e uscite. Lo schermo
non segna niente («pronta» non esiste: da decidere con Marco). Fra le uscite andate,
l'ultima andata è quella «che va adesso»; le precedenti restano sul foglietto, in grigio
con la loro ora. Un foglietto sparisce quando il tavolo si chiude.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.models.comande_db import get_comande_conn
from app.services import comande_service as svc
from app.services import prenotazioni_giorno_service
from app.services.comande_stampa import nome_cucina

logger = logging.getLogger("trgb.comande.schermo")


def _ora(ts: Optional[str]) -> str:
    return str(ts)[11:16] if ts and len(str(ts)) >= 16 else ""


def _allergie(pren_id) -> Optional[str]:
    if not pren_id:
        return None
    try:
        p = prenotazioni_giorno_service.una(pren_id)
        return ((p or {}).get("allergie") or "").strip() or None
    except Exception as e:  # senza allergie il foglietto esce lo stesso (come il foglio stampato)
        logger.warning("Allergie non leggibili per la prenotazione %s: %s", pren_id, e)
        return None


def _foglietto(conn, c, reparto: str) -> Optional[Dict[str, Any]]:
    righe = [svc._riga(r) for r in conn.execute(
        "SELECT * FROM comande_righe WHERE conto_id = ? AND reparto = ? "
        "AND stato IN ('inviata', 'stornata') ORDER BY uscita, id", (c["id"], reparto))]
    if not righe:
        return None
    stati = svc._uscite_stato(conn, c)
    primo = conn.execute(
        "SELECT creato_at, creato_da FROM comande_invii WHERE conto_id = ? AND reparto = ? "
        "AND tipo = 'comanda' ORDER BY id LIMIT 1", (c["id"], reparto)).fetchone()

    uscite: List[Dict[str, Any]] = []
    for n in sorted({r["uscita"] for r in righe}):
        sue = [r for r in righe if r["uscita"] == n]
        st = stati.get(n) or {}
        vive = [r for r in sue if r["stato"] != "stornata"]
        uscite.append({
            "numero": n,
            "stato": st.get("stato") or "attende",
            "andata_at": st.get("andata_at"),
            "andata_ora": _ora(st.get("andata_at")),
            "solleciti": int(st.get("solleciti") or 0),
            "sollecitata_ora": _ora(st.get("sollecitata_at")),
            "minuti": svc._minuti_da(st.get("andata_at")),
            "annullata": not vive,
            "righe": [{
                "id": r["id"], "nome": nome_cucina(r["nome"]), "quantita": r["quantita"],
                "varianti": r["varianti"], "nota": r["nota"],
                "annullata": r["stato"] == "stornata", "motivo": r.get("motivo_storno"),
            } for r in sue],
        })

    # fase di ogni uscita: attende · va (l'ultima andata con qualcosa da fare) · prima (andata prima)
    andate = [u for u in uscite if u["stato"] == "andata" and not u["annullata"]]
    corrente = max(andate, key=lambda u: (u["andata_at"] or "", u["numero"])) if andate else None
    for u in uscite:
        if u["annullata"]:
            u["fase"] = "annullata"
        elif u["stato"] != "andata":
            u["fase"] = "attende"
        else:
            u["fase"] = "va" if u is corrente else "prima"

    return {
        "conto_id": c["id"], "tavolo": c["tavolo"], "zona": c["zona"], "coperti": c["coperti"] or 0,
        "prova": bool(c["prova"]), "ospite": c["ospite"],
        "chi": (primo["creato_da"] if primo else None) or c["aperto_da"],
        "ora": _ora(primo["creato_at"] if primo else c["aperto_at"]),
        "allergie": _allergie(c["prenotazione_id"]),
        "uscita_va": corrente["numero"] if corrente else None,
        "minuti": corrente["minuti"] if corrente else None,
        "sollecito": bool(corrente and corrente["solleciti"]),
        "ordine": (0, corrente["andata_at"] or "") if corrente else (1, c["aperto_at"] or ""),
        "uscite": uscite,
    }


def foglietti(reparto: Optional[str] = None) -> Dict[str, Any]:
    """I foglietti dei tavoli aperti che hanno qualcosa per il reparto, dal più vecchio.
    Senza `reparto` vale il primo reparto attivo (di partenza «cucina»)."""
    conn = get_comande_conn()
    try:
        reparti = svc._reparti(conn, solo_attivi=True)
        chiavi = [r["key"] for r in reparti]
        if not reparto:
            reparto = chiavi[0] if chiavi else None
        if reparto not in chiavi:
            raise svc.ComandaErrore(f"Reparto «{reparto}» inesistente o spento")
        fogli = []
        for c in conn.execute("SELECT * FROM comande_conti WHERE stato = 'aperto' ORDER BY aperto_at"):
            f = _foglietto(conn, c, reparto)
            if f:
                fogli.append(f)
        adesso = conn.execute("SELECT strftime('%H:%M', 'now', 'localtime')").fetchone()[0]
    finally:
        conn.close()
    fogli.sort(key=lambda f: f.pop("ordine"))
    return {
        "reparto": reparto,
        "reparto_nome": next((r["nome"] for r in reparti if r["key"] == reparto), reparto),
        "reparti": [{"key": r["key"], "nome": r["nome"]} for r in reparti],
        "ora": adesso,
        "foglietti": fogli,
    }
