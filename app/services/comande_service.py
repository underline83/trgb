# @version: v1.0 (2026-11-24) — tavoli, righe, invii, via, storni (in prova)
# -*- coding: utf-8 -*-
"""
Comande — logica. Modulo: comande. [core]

Il router (app/routers/comande_router.py) traduce solo HTTP ⇄ service, così
il connettore MCP potrà riusare queste funzioni.

Il giro di un tavolo:
    apri_conto  → tavolo + coperti (un conto aperto per tavolo)
    aggiungi_righe → articoli dal catalogo (catalogo_vendita), prezzo deciso QUI,
                  mai dal telefono; uscita e reparto proposti dalle impostazioni
    invia       → le righe «da inviare» diventano «inviate», un invio per reparto
                  con la fotografia delle righe (è ciò che il ponte stamperà)
    via         → «via la 2ª»: un invio di tipo via ai reparti che hanno righe
                  di quell'uscita
    storna      → una riga già inviata si storna con un motivo, e il reparto lo sa
    chiudi / annulla → libera il tavolo. Finché non c'è la Cassa ogni conto è
                  di prova (decisione di Marco del 24/11/2026)
"""

from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional

from app.models.comande_db import get_comande_conn
from app.services import catalogo_vendita, tavoli_sala_service

FAMIGLIE = ("food", "beverage", "servizio")


class ComandaErrore(Exception):
    """Richiesta non valida (400)."""


class ComandaNonTrovata(Exception):
    """Conto o riga inesistente (404)."""


# ── impostazioni ───────────────────────────────────────────────────

def _config(conn) -> Dict[str, str]:
    return {r["chiave"]: r["valore"] for r in conn.execute("SELECT chiave, valore FROM comande_config")}


def _int(v, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _reparti(conn, solo_attivi: bool = False) -> List[Dict[str, Any]]:
    sql = "SELECT key, nome, ordine, attivo FROM comande_reparti"
    if solo_attivi:
        sql += " WHERE attivo = 1"
    return [dict(r) for r in conn.execute(sql + " ORDER BY ordine, key")]


def _mappa_gruppi(conn) -> Dict[str, Optional[str]]:
    return {r["gruppo"]: r["reparto_key"] for r in conn.execute(
        "SELECT gruppo, reparto_key FROM comande_gruppi_reparto")}


def impostazioni() -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        cfg = _config(conn)
        return {
            "config": cfg,
            "uscite_numero": _int(cfg.get("uscite_numero"), 4),
            "reparti": _reparti(conn),
            "gruppi_reparto": _mappa_gruppi(conn),
        }
    finally:
        conn.close()


CHIAVI_CONFIG = {
    "uscite_numero": "int:1:9",
    "uscita_food": "int:0:9", "uscita_beverage": "int:0:9", "uscita_servizio": "int:0:9",
    "reparto_food": "reparto", "reparto_beverage": "reparto", "reparto_servizio": "reparto",
}


def salva_impostazioni(dati: Dict[str, Any]) -> Dict[str, Any]:
    """Accetta config (chiavi note), reparti [{key,nome,attivo,ordine}] e gruppi_reparto {gruppo: key|None}."""
    conn = get_comande_conn()
    try:
        reparti_noti = {r["key"] for r in _reparti(conn)}
        for r in dati.get("reparti") or []:
            key = str(r.get("key") or "").strip().lower()
            nome = str(r.get("nome") or "").strip()
            if not key or not nome:
                raise ComandaErrore("Ogni reparto vuole chiave e nome")
            conn.execute(
                "INSERT INTO comande_reparti (key, nome, ordine, attivo) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET nome = excluded.nome, ordine = excluded.ordine, "
                "attivo = excluded.attivo",
                (key, nome, _int(r.get("ordine"), 0), 1 if r.get("attivo", True) else 0),
            )
            reparti_noti.add(key)

        for chiave, valore in (dati.get("config") or {}).items():
            regola = CHIAVI_CONFIG.get(chiave)
            if not regola:
                raise ComandaErrore(f"Impostazione sconosciuta: {chiave}")
            if regola.startswith("int:"):
                _, lo, hi = regola.split(":")
                n = _int(valore, -1)
                if not int(lo) <= n <= int(hi):
                    raise ComandaErrore(f"{chiave}: da {lo} a {hi}")
                valore = str(n)
            else:
                valore = (str(valore).strip().lower() or "") if valore is not None else ""
                if valore and valore not in reparti_noti:
                    raise ComandaErrore(f"{chiave}: reparto «{valore}» inesistente")
            conn.execute(
                "INSERT INTO comande_config (chiave, valore) VALUES (?, ?) "
                "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (chiave, valore))

        for gruppo, key in (dati.get("gruppi_reparto") or {}).items():
            gruppo = str(gruppo or "").strip()
            if not gruppo:
                continue
            if key == "__default__":
                conn.execute("DELETE FROM comande_gruppi_reparto WHERE gruppo = ?", (gruppo,))
                continue
            key = (str(key).strip().lower() or None) if key is not None else None
            if key and key not in reparti_noti:
                raise ComandaErrore(f"{gruppo}: reparto «{key}» inesistente")
            conn.execute(
                "INSERT INTO comande_gruppi_reparto (gruppo, reparto_key) VALUES (?, ?) "
                "ON CONFLICT(gruppo) DO UPDATE SET reparto_key = excluded.reparto_key", (gruppo, key))
        conn.commit()
    finally:
        conn.close()
    return impostazioni()


def _reparto_per(gruppo: Optional[str], famiglia: str, cfg: Dict[str, str],
                 mappa: Dict[str, Optional[str]], attivi: set) -> Optional[str]:
    if gruppo and gruppo in mappa:
        key = mappa[gruppo]
    else:
        key = cfg.get(f"reparto_{famiglia}") or None
    return key if key in attivi else None


def _uscita_per(famiglia: str, cfg: Dict[str, str]) -> int:
    return _int(cfg.get(f"uscita_{famiglia}"), 1 if famiglia == "food" else 0)


# ── lettura ────────────────────────────────────────────────────────

def _riga(r) -> Dict[str, Any]:
    d = dict(r)
    try:
        d["varianti"] = json.loads(d["varianti"]) if d.get("varianti") else []
    except (TypeError, ValueError):
        d["varianti"] = []
    d["totale"] = round((d["prezzo_unitario"] or 0) * (d["quantita"] or 0), 2) if d["stato"] != "stornata" else 0.0
    return d


def _testata(conn, conto_id: int):
    c = conn.execute("SELECT * FROM comande_conti WHERE id = ?", (conto_id,)).fetchone()
    if not c:
        raise ComandaNonTrovata(f"Conto {conto_id} inesistente")
    return c


def _riepilogo_conti(conn, ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
    ids = list(ids)
    if not ids:
        return {}
    segni = ",".join("?" * len(ids))
    out = {}
    for r in conn.execute(f"""
        SELECT conto_id,
               SUM(CASE WHEN stato != 'stornata' THEN prezzo_unitario * quantita ELSE 0 END) AS totale,
               SUM(CASE WHEN stato = 'da_inviare' THEN quantita ELSE 0 END) AS da_inviare,
               SUM(CASE WHEN stato = 'inviata' THEN quantita ELSE 0 END) AS inviate
          FROM comande_righe WHERE conto_id IN ({segni}) GROUP BY conto_id
    """, ids):
        out[r["conto_id"]] = {"totale": round(r["totale"] or 0, 2),
                              "da_inviare": int(r["da_inviare"] or 0), "inviate": int(r["inviate"] or 0)}
    return out


def conti_aperti() -> List[Dict[str, Any]]:
    conn = get_comande_conn()
    try:
        conti = [dict(r) for r in conn.execute(
            "SELECT * FROM comande_conti WHERE stato = 'aperto' ORDER BY aperto_at")]
        rie = _riepilogo_conti(conn, [c["id"] for c in conti])
    finally:
        conn.close()
    for c in conti:
        c.update(rie.get(c["id"], {"totale": 0.0, "da_inviare": 0, "inviate": 0}))
    return conti


def tavoli() -> Dict[str, Any]:
    """Tavoli per sala, ognuno col suo conto aperto (se c'è)."""
    aperti = conti_aperti()
    per_tavolo = {c["tavolo_id"]: c for c in aperti if c["tavolo_id"] is not None}
    sale: List[Dict[str, Any]] = []
    indice_sala: Dict[str, Dict[str, Any]] = {}
    for t in tavoli_sala_service.elenco_tavoli():
        zona = t.get("zona") or "Sala"
        if zona not in indice_sala:
            indice_sala[zona] = {"zona": zona, "tavoli": []}
            sale.append(indice_sala[zona])
        indice_sala[zona]["tavoli"].append({**t, "conto": per_tavolo.get(t["id"])})
    noti = {t["id"] for s in sale for t in s["tavoli"]}
    orfani = [c for c in aperti if c["tavolo_id"] not in noti]  # tavolo disattivato a conto aperto
    return {"sale": sale, "altri_conti": orfani}


def conto(conto_id: int) -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        c = dict(_testata(conn, conto_id))
        righe = [_riga(r) for r in conn.execute(
            "SELECT * FROM comande_righe WHERE conto_id = ? ORDER BY uscita, id", (conto_id,))]
        invii = [dict(r) for r in conn.execute(
            "SELECT id, tipo, reparto, uscita, creato_at, creato_da, stampato_at FROM comande_invii "
            "WHERE conto_id = ? ORDER BY id", (conto_id,))]
        reparti = {r["key"]: r["nome"] for r in _reparti(conn)}
        uscite_numero = _int(_config(conn).get("uscite_numero"), 4)
    finally:
        conn.close()
    c["righe"] = righe
    c["invii"] = invii
    c["totale"] = round(sum(r["totale"] for r in righe), 2)
    c["da_inviare"] = sum(r["quantita"] for r in righe if r["stato"] == "da_inviare")
    c["reparti"] = reparti
    c["uscite_numero"] = max(uscite_numero, max((r["uscita"] for r in righe), default=0))
    return c


# ── scrittura ──────────────────────────────────────────────────────

def _aperto(c) -> None:
    if c["stato"] != "aperto":
        raise ComandaErrore("Il conto è già chiuso")


def apri_conto(tavolo_id: int, coperti: int, nota: Optional[str], utente: Optional[str]) -> Dict[str, Any]:
    t = tavoli_sala_service.tavolo(tavolo_id)
    if not t or not t.get("attivo"):
        raise ComandaErrore("Tavolo inesistente o non attivo")
    coperti = _int(coperti, -1)
    if coperti < 0 or coperti > 200:
        raise ComandaErrore("Coperti da 0 a 200")
    conn = get_comande_conn()
    try:
        gia = conn.execute(
            "SELECT id FROM comande_conti WHERE tavolo_id = ? AND stato = 'aperto'", (tavolo_id,)).fetchone()
        if gia:
            raise ComandaErrore(f"Il tavolo {t['nome']} ha già un conto aperto")
        cur = conn.execute(
            "INSERT INTO comande_conti (tavolo_id, tavolo, zona, coperti, nota, aperto_da, prova) "
            "VALUES (?, ?, ?, ?, ?, ?, 1)",
            (tavolo_id, t["nome"], t.get("zona"), coperti, (nota or "").strip() or None, utente))
        conn.commit()
        nuovo = cur.lastrowid
    finally:
        conn.close()
    return conto(nuovo)


def aggiorna_conto(conto_id: int, dati: Dict[str, Any], utente: Optional[str]) -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        c = _testata(conn, conto_id)
        _aperto(c)
        campi, valori = [], []
        if "coperti" in dati and dati["coperti"] is not None:
            n = _int(dati["coperti"], -1)
            if n < 0 or n > 200:
                raise ComandaErrore("Coperti da 0 a 200")
            campi.append("coperti = ?"); valori.append(n)
        if "nota" in dati:
            campi.append("nota = ?"); valori.append((dati.get("nota") or "").strip() or None)
        if dati.get("tavolo_id") and int(dati["tavolo_id"]) != c["tavolo_id"]:
            t = tavoli_sala_service.tavolo(int(dati["tavolo_id"]))
            if not t or not t.get("attivo"):
                raise ComandaErrore("Tavolo inesistente o non attivo")
            if conn.execute("SELECT 1 FROM comande_conti WHERE tavolo_id = ? AND stato = 'aperto'",
                            (t["id"],)).fetchone():
                raise ComandaErrore(f"Il tavolo {t['nome']} ha già un conto aperto")
            campi += ["tavolo_id = ?", "tavolo = ?", "zona = ?"]
            valori += [t["id"], t["nome"], t.get("zona")]
        if campi:
            campi.append("aggiornato_at = datetime('now','localtime')")
            conn.execute(f"UPDATE comande_conti SET {', '.join(campi)} WHERE id = ?", (*valori, conto_id))
            conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def _varianti(v) -> Optional[str]:
    if not v:
        return None
    if isinstance(v, str):
        v = [x for x in (s.strip() for s in v.split(",")) if x]
    v = [str(x).strip()[:80] for x in v if str(x).strip()][:10]
    return json.dumps(v, ensure_ascii=False) if v else None


def aggiungi_righe(conto_id: int, righe: List[Dict[str, Any]], utente: Optional[str]) -> Dict[str, Any]:
    """righe: [{codice, quantita, uscita?, nota?, varianti?, prezzo? (solo prezzo libero)}]
    oppure riga libera {nome, prezzo, famiglia, quantita, uscita?, nota?} (fuori carta)."""
    if not righe:
        raise ComandaErrore("Nessuna riga")
    idx = catalogo_vendita.indice()
    conn = get_comande_conn()
    try:
        c = _testata(conn, conto_id)
        _aperto(c)
        cfg = _config(conn)
        mappa = _mappa_gruppi(conn)
        attivi = {r["key"] for r in _reparti(conn, solo_attivi=True)}
        da_scrivere = []
        for r in righe:
            q = _int(r.get("quantita", 1), 0)
            if q < 1 or q > 99:
                raise ComandaErrore("Quantità da 1 a 99")
            codice = (r.get("codice") or "").strip()
            if codice:
                a = idx.get(codice)
                if not a:
                    raise ComandaErrore(f"Articolo {codice} non più in catalogo")
                nome, gruppo, famiglia, tipo = a["nome"], a["gruppo"], a["famiglia"], a["tipo"]
                if a["prezzo_libero"]:
                    prezzo = r.get("prezzo")
                    try:
                        prezzo = float(prezzo)
                    except (TypeError, ValueError):
                        raise ComandaErrore(f"{nome}: serve il prezzo")
                else:
                    prezzo = a["prezzo"]
            else:
                nome = " ".join(str(r.get("nome") or "").split())
                famiglia = r.get("famiglia") or "food"
                if not nome:
                    raise ComandaErrore("Una riga fuori carta vuole il nome")
                if famiglia not in FAMIGLIE:
                    raise ComandaErrore("Famiglia: food, beverage o servizio")
                try:
                    prezzo = float(r.get("prezzo"))
                except (TypeError, ValueError):
                    raise ComandaErrore(f"{nome}: serve il prezzo")
                gruppo, tipo = "Fuori carta", "libero"
            if prezzo < 0 or prezzo > 10000:
                raise ComandaErrore(f"{nome}: prezzo non valido")
            uscita = r.get("uscita")
            uscita = _uscita_per(famiglia, cfg) if uscita is None else _int(uscita, -1)
            if uscita < 0 or uscita > 9:
                raise ComandaErrore("Uscita da 0 a 9")
            da_scrivere.append((
                conto_id, codice or None, tipo, nome, gruppo, famiglia,
                _reparto_per(gruppo, famiglia, cfg, mappa, attivi), round(prezzo, 2), q, uscita,
                _varianti(r.get("varianti")), (r.get("nota") or "").strip()[:200] or None, utente,
            ))
        conn.executemany("""
            INSERT INTO comande_righe (conto_id, articolo_codice, articolo_tipo, nome, gruppo, famiglia,
                                       reparto, prezzo_unitario, quantita, uscita, varianti, nota, creata_da)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, da_scrivere)
        conn.execute("UPDATE comande_conti SET aggiornato_at = datetime('now','localtime') WHERE id = ?",
                     (conto_id,))
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def _riga_db(conn, riga_id: int):
    r = conn.execute("SELECT * FROM comande_righe WHERE id = ?", (riga_id,)).fetchone()
    if not r:
        raise ComandaNonTrovata(f"Riga {riga_id} inesistente")
    _aperto(_testata(conn, r["conto_id"]))
    return r


def modifica_riga(riga_id: int, dati: Dict[str, Any]) -> Dict[str, Any]:
    """Quantità, uscita, nota, varianti: solo finché la riga non è partita."""
    conn = get_comande_conn()
    try:
        r = _riga_db(conn, riga_id)
        if r["stato"] != "da_inviare":
            raise ComandaErrore("La riga è già partita: si può solo stornare")
        campi, valori = [], []
        if dati.get("quantita") is not None:
            q = _int(dati["quantita"], 0)
            if q < 1 or q > 99:
                raise ComandaErrore("Quantità da 1 a 99")
            campi.append("quantita = ?"); valori.append(q)
        if dati.get("uscita") is not None:
            u = _int(dati["uscita"], -1)
            if u < 0 or u > 9:
                raise ComandaErrore("Uscita da 0 a 9")
            campi.append("uscita = ?"); valori.append(u)
        if "nota" in dati:
            campi.append("nota = ?"); valori.append((dati.get("nota") or "").strip()[:200] or None)
        if "varianti" in dati:
            campi.append("varianti = ?"); valori.append(_varianti(dati.get("varianti")))
        if campi:
            campi.append("aggiornata_at = datetime('now','localtime')")
            conn.execute(f"UPDATE comande_righe SET {', '.join(campi)} WHERE id = ?", (*valori, riga_id))
            conn.commit()
        conto_id = r["conto_id"]
    finally:
        conn.close()
    return conto(conto_id)


def elimina_riga(riga_id: int) -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        r = _riga_db(conn, riga_id)
        if r["stato"] != "da_inviare":
            raise ComandaErrore("La riga è già partita: si può solo stornare")
        conn.execute("DELETE FROM comande_righe WHERE id = ?", (riga_id,))
        conn.commit()
        conto_id = r["conto_id"]
    finally:
        conn.close()
    return conto(conto_id)


def _foto(r) -> Dict[str, Any]:
    """Fotografia di una riga per la stampa."""
    d = _riga(r)
    return {k: d[k] for k in ("id", "nome", "quantita", "uscita", "varianti", "nota", "gruppo")}


def _nuovo_invio(conn, conto_id: int, tipo: str, reparto: str, righe: List[Dict[str, Any]],
                 utente: Optional[str], uscita: Optional[int] = None) -> int:
    cur = conn.execute(
        "INSERT INTO comande_invii (conto_id, tipo, reparto, uscita, righe_json, creato_da) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (conto_id, tipo, reparto, uscita, json.dumps(righe, ensure_ascii=False), utente))
    return cur.lastrowid


def invia(conto_id: int, utente: Optional[str]) -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        _aperto(_testata(conn, conto_id))
        righe = conn.execute(
            "SELECT * FROM comande_righe WHERE conto_id = ? AND stato = 'da_inviare' ORDER BY uscita, id",
            (conto_id,)).fetchall()
        if not righe:
            raise ComandaErrore("Niente da inviare")
        per_reparto: Dict[Optional[str], List] = {}
        for r in righe:
            per_reparto.setdefault(r["reparto"], []).append(r)
        for reparto, gruppo in per_reparto.items():
            invio_id = None
            if reparto:
                invio_id = _nuovo_invio(conn, conto_id, "comanda", reparto, [_foto(r) for r in gruppo], utente)
            conn.executemany(
                "UPDATE comande_righe SET stato = 'inviata', invio_id = ?, "
                "aggiornata_at = datetime('now','localtime') WHERE id = ?",
                [(invio_id, r["id"]) for r in gruppo])
        conn.execute("UPDATE comande_conti SET aggiornato_at = datetime('now','localtime') WHERE id = ?",
                     (conto_id,))
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def via(conto_id: int, uscita: int, utente: Optional[str]) -> Dict[str, Any]:
    """«Via la 2ª»: avvisa i reparti che hanno righe inviate di quell'uscita."""
    uscita = _int(uscita, -1)
    if uscita < 1 or uscita > 9:
        raise ComandaErrore("Uscita da 1 a 9")
    conn = get_comande_conn()
    try:
        _aperto(_testata(conn, conto_id))
        righe = conn.execute(
            "SELECT * FROM comande_righe WHERE conto_id = ? AND uscita = ? AND stato = 'inviata' "
            "AND reparto IS NOT NULL ORDER BY id", (conto_id, uscita)).fetchall()
        if not righe:
            raise ComandaErrore(f"Nessuna riga inviata nella {uscita}ª uscita")
        per_reparto: Dict[str, List] = {}
        for r in righe:
            per_reparto.setdefault(r["reparto"], []).append(r)
        for reparto, gruppo in per_reparto.items():
            _nuovo_invio(conn, conto_id, "via", reparto, [_foto(r) for r in gruppo], utente, uscita)
        conn.execute(
            "UPDATE comande_conti SET uscita_corrente = MAX(uscita_corrente, ?), "
            "aggiornato_at = datetime('now','localtime') WHERE id = ?", (uscita, conto_id))
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def storna_riga(riga_id: int, motivo: str, utente: Optional[str]) -> Dict[str, Any]:
    motivo = (motivo or "").strip()
    if not motivo:
        raise ComandaErrore("Per stornare serve il motivo")
    conn = get_comande_conn()
    try:
        r = _riga_db(conn, riga_id)
        if r["stato"] != "inviata":
            raise ComandaErrore("Si storna solo una riga già inviata (le altre si tolgono)")
        conn.execute(
            "UPDATE comande_righe SET stato = 'stornata', stornata_at = datetime('now','localtime'), "
            "stornata_da = ?, motivo_storno = ?, aggiornata_at = datetime('now','localtime') WHERE id = ?",
            (utente, motivo[:200], riga_id))
        if r["reparto"]:
            foto = _foto(r)
            foto["motivo"] = motivo[:200]
            _nuovo_invio(conn, r["conto_id"], "storno", r["reparto"], [foto], utente, r["uscita"])
        conn.commit()
        conto_id = r["conto_id"]
    finally:
        conn.close()
    return conto(conto_id)


def chiudi_conto(conto_id: int, utente: Optional[str], annulla: bool = False) -> Dict[str, Any]:
    conn = get_comande_conn()
    try:
        c = _testata(conn, conto_id)
        _aperto(c)
        if not annulla and conn.execute(
            "SELECT 1 FROM comande_righe WHERE conto_id = ? AND stato = 'da_inviare'", (conto_id,)
        ).fetchone():
            raise ComandaErrore("Ci sono righe non inviate: inviale o toglile prima di chiudere")
        conn.execute(
            "UPDATE comande_conti SET stato = ?, chiuso_at = datetime('now','localtime'), chiuso_da = ?, "
            "aggiornato_at = datetime('now','localtime') WHERE id = ?",
            ("annullato" if annulla else "chiuso", utente, conto_id))
        conn.commit()
    finally:
        conn.close()
    return conto(conto_id)


def invii(reparto: Optional[str] = None, limite: int = 50) -> List[Dict[str, Any]]:
    """Ultimi invii (per controllare cosa sarebbe uscito in stampa)."""
    limite = max(1, min(_int(limite, 50), 200))
    conn = get_comande_conn()
    try:
        sql = ("SELECT i.*, c.tavolo, c.coperti FROM comande_invii i "
               "JOIN comande_conti c ON c.id = i.conto_id")
        par: list = []
        if reparto:
            sql += " WHERE i.reparto = ?"
            par.append(reparto)
        sql += " ORDER BY i.id DESC LIMIT ?"
        par.append(limite)
        out = []
        for r in conn.execute(sql, par):
            d = dict(r)
            try:
                d["righe"] = json.loads(d.pop("righe_json") or "[]")
            except (TypeError, ValueError):
                d["righe"] = []
            out.append(d)
        return out
    finally:
        conn.close()
