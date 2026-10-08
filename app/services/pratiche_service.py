# @version: v1.0 (2026-10-08) — nascita del modulo Pratiche
# -*- coding: utf-8 -*-
"""
Service Pratiche — TRGB Gestionale. Modulo: pratiche.

Tutta la logica del modulo, in funzioni SENZA Request: il router
(`pratiche_router.py`), il checker `pratiche_termini` (alert_engine), i
contatori della Home e il futuro connettore MCP chiamano queste stesse
funzioni. Doc: docs/modulo_pratiche.md §3.

Regole (decise con Marco il 2026-10-08):
- tre stati: tocca_a_me / tocca_a_loro / chiusa; chiudere chiede l'ESITO;
- il tempo non cambia lo stato: «scaduta» e «ferma» sono calcolate, non salvate;
- la storia non si cancella: ogni cambio di stato o di termine è un passo;
  i passi non si modificano né si cancellano (una correzione è un passo nuovo);
- il termine si cambia solo con un passo, mai dalla testata;
- una pratica chiusa si può riaprire: chiusa_il ed esito si svuotano in
  testata, la storia li conserva nei passi;
- un allegato per passo, max 20 MB, solo PDF e immagini.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.models.pratiche_db import STATI, get_pratiche_conn

STATI_APERTI = ("tocca_a_me", "tocca_a_loro")
GIORNI_FERMA = 30
ALLEGATO_MAX_BYTES = 20 * 1024 * 1024
ALLEGATO_ESTENSIONI = {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"}

ETICHETTE_STATO = {
    "tocca_a_me": "tocca a me",
    "tocca_a_loro": "tocca a loro",
    "chiusa": "chiusa",
}


class PraticaErrore(ValueError):
    """Dato non valido: il router lo traduce in 400."""


class PraticaNonTrovata(LookupError):
    """Pratica, passo o collegamento inesistente: il router lo traduce in 404."""


# Sentinella per «il termine non cambia» (None vuol dire «nessun termine»).
NON_CAMBIA = object()


# ─────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────

def _oggi(oggi: Optional[date] = None) -> date:
    return oggi or date.today()


def _adesso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _data_valida(valore: Optional[str], campo: str) -> Optional[str]:
    """Normalizza una data AAAA-MM-GG. None/'' → None."""
    if valore is None:
        return None
    valore = str(valore).strip()
    if not valore:
        return None
    try:
        return date.fromisoformat(valore[:10]).isoformat()
    except ValueError:
        raise PraticaErrore(f"{campo}: data non valida ({valore}), serve AAAA-MM-GG")


def _testo(valore: Optional[str], campo: str, obbligatorio: bool = True) -> Optional[str]:
    v = (valore or "").strip()
    if obbligatorio and not v:
        raise PraticaErrore(f"{campo} obbligatorio")
    return v or None


def _fmt_data(iso: Optional[str]) -> str:
    if not iso:
        return "nessun termine"
    try:
        return date.fromisoformat(iso).strftime("%d/%m/%Y")
    except ValueError:
        return iso


def _arricchisci(row, oggi: date) -> Dict[str, Any]:
    """Aggiunge i valori calcolati: scaduta, ferma, giorni al termine."""
    p = dict(row)
    aperta = p["stato"] != "chiusa"
    giorni = None
    if p.get("termine"):
        try:
            giorni = (date.fromisoformat(p["termine"]) - oggi).days
        except ValueError:
            giorni = None
    p["giorni_al_termine"] = giorni
    p["scaduta"] = bool(aperta and giorni is not None and giorni < 0)
    ferma = False
    if aperta and not p.get("termine") and p.get("ultimo_passo_il"):
        try:
            ferma = date.fromisoformat(p["ultimo_passo_il"]) <= oggi - timedelta(days=GIORNI_FERMA)
        except ValueError:
            ferma = False
    p["ferma"] = ferma
    return p


def _carica(conn, pratica_id: int):
    row = conn.execute("SELECT * FROM pratiche WHERE id = ?", (pratica_id,)).fetchone()
    if not row:
        raise PraticaNonTrovata(f"Pratica {pratica_id} non trovata")
    return row


# ─────────────────────────────────────────────
# Allegati
# ─────────────────────────────────────────────

def _cartella_allegati() -> Path:
    # Import locale: tenant_dir crea la cartella, non serve farlo al caricamento del modulo.
    from app.utils.uploads import tenant_dir
    return tenant_dir("pratiche")


def _salva_allegato(pratica_id: int, contenuto: bytes, nome: str) -> Tuple[str, str]:
    """Valida e scrive il file. Ritorna (path relativo a tenant_dir('pratiche'), nome originale)."""
    nome = os.path.basename((nome or "").strip()) or "allegato"
    est = os.path.splitext(nome)[1].lower()
    if est not in ALLEGATO_ESTENSIONI:
        raise PraticaErrore("Allegato: solo PDF o immagini (jpg, png, heic, webp, gif)")
    if not contenuto:
        raise PraticaErrore("Allegato vuoto")
    if len(contenuto) > ALLEGATO_MAX_BYTES:
        raise PraticaErrore("Allegato oltre 20 MB")
    sicuro = re.sub(r"[^A-Za-z0-9._-]+", "_", nome)[:80] or f"allegato{est}"
    rel = f"{pratica_id}/{uuid.uuid4().hex[:8]}_{sicuro}"
    dest = _cartella_allegati() / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(contenuto)
    return rel, nome


def _togli_file(rel: Optional[str]) -> None:
    if not rel:
        return
    try:
        (_cartella_allegati() / rel).unlink(missing_ok=True)
    except Exception:
        pass


def percorso_allegato(pratica_id: int, passo_id: int) -> Tuple[Path, str]:
    """Path su disco e nome originale dell'allegato di un passo."""
    conn = get_pratiche_conn()
    try:
        row = conn.execute(
            "SELECT allegato_path, allegato_nome FROM pratiche_passi WHERE id = ? AND pratica_id = ?",
            (passo_id, pratica_id),
        ).fetchone()
    finally:
        conn.close()
    if not row or not row["allegato_path"]:
        raise PraticaNonTrovata("Allegato non trovato")
    base = _cartella_allegati().resolve()
    path = (base / row["allegato_path"]).resolve()
    if base not in path.parents or not path.is_file():
        raise PraticaNonTrovata("Allegato non trovato")
    return path, row["allegato_nome"] or path.name


# ─────────────────────────────────────────────
# Lettura
# ─────────────────────────────────────────────

def elenco(
    stato: Optional[str] = None,
    scadute: Optional[bool] = None,
    ferme: Optional[bool] = None,
    q: Optional[str] = None,
    chiuse: bool = False,
    oggi: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """Pratiche ordinate per termine (senza termine in fondo).

    - chiuse=False (default): solo le aperte. chiuse=True: anche le chiuse.
      stato='chiusa' le include comunque.
    - scadute / ferme: filtri sui valori calcolati.
    - q: cerca in titolo e controparte.
    """
    o = _oggi(oggi)
    if stato is not None and stato not in STATI:
        raise PraticaErrore(f"Stato non valido: {stato}")
    where, args = [], []
    if stato:
        where.append("stato = ?")
        args.append(stato)
    elif not chiuse:
        where.append("stato != 'chiusa'")
    if q and q.strip():
        where.append("(titolo LIKE ? OR controparte LIKE ?)")
        like = f"%{q.strip()}%"
        args += [like, like]
    sql = "SELECT * FROM pratiche"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY termine IS NULL, termine, ultimo_passo_il DESC, id DESC"

    conn = get_pratiche_conn()
    try:
        rows = conn.execute(sql, args).fetchall()
    finally:
        conn.close()

    out = [_arricchisci(r, o) for r in rows]
    if scadute is not None:
        out = [p for p in out if p["scaduta"] == scadute]
    if ferme is not None:
        out = [p for p in out if p["ferma"] == ferme]
    return out


def leggi(pratica_id: int, oggi: Optional[date] = None) -> Dict[str, Any]:
    """Pratica con i passi (dal più recente) e i collegamenti."""
    o = _oggi(oggi)
    conn = get_pratiche_conn()
    try:
        p = _arricchisci(_carica(conn, pratica_id), o)
        p["passi"] = [dict(r) for r in conn.execute(
            "SELECT * FROM pratiche_passi WHERE pratica_id = ? ORDER BY data DESC, id DESC",
            (pratica_id,),
        ).fetchall()]
        for passo in p["passi"]:
            passo["ha_allegato"] = bool(passo.pop("allegato_path", None))
        p["collegamenti"] = [dict(r) for r in conn.execute(
            "SELECT * FROM pratiche_collegamenti WHERE pratica_id = ? ORDER BY id",
            (pratica_id,),
        ).fetchall()]
    finally:
        conn.close()
    return p


def contatori(oggi: Optional[date] = None) -> Dict[str, int]:
    """Numeri per la card della Home."""
    aperte = elenco(oggi=oggi)
    return {
        "aperte": len(aperte),
        "scadute": sum(1 for p in aperte if p["scaduta"]),
        "ferme": sum(1 for p in aperte if p["ferma"]),
        "tocca_a_me": sum(1 for p in aperte if p["stato"] == "tocca_a_me"),
    }


def termini_da_avvisare(soglia_giorni: int = 3, oggi: Optional[date] = None) -> Dict[str, List[Dict[str, Any]]]:
    """I tre gruppi del checker `pratiche_termini`: scadute, in scadenza entro
    la soglia, ferme da 30 giorni senza termine."""
    aperte = elenco(oggi=oggi)
    return {
        "scadute": [p for p in aperte if p["scaduta"]],
        "in_scadenza": [
            p for p in aperte
            if p["giorni_al_termine"] is not None and 0 <= p["giorni_al_termine"] <= soglia_giorni
        ],
        "ferme": [p for p in aperte if p["ferma"]],
    }


# ─────────────────────────────────────────────
# Scrittura
# ─────────────────────────────────────────────

def _inserisci_passo(conn, pratica_id: int, *, data: str, testo: str, autore: Optional[str],
                     stato_da=None, stato_a=None, termine_da=None, termine_a=None,
                     automatico: bool = False, allegato_path=None, allegato_nome=None) -> int:
    cur = conn.execute(
        """
        INSERT INTO pratiche_passi
            (pratica_id, data, testo, stato_da, stato_a, termine_da, termine_a,
             automatico, allegato_path, allegato_nome, autore, creato_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (pratica_id, data, testo, stato_da, stato_a, termine_da, termine_a,
         1 if automatico else 0, allegato_path, allegato_nome, autore, _adesso()),
    )
    return cur.lastrowid


def crea_pratica(
    titolo: str,
    controparte: str,
    testo: str,
    stato: str = "tocca_a_loro",
    controparte_contatto: Optional[str] = None,
    termine: Optional[str] = None,
    aperta_il: Optional[str] = None,
    autore: Optional[str] = None,
    allegato: Optional[bytes] = None,
    allegato_nome: Optional[str] = None,
    oggi: Optional[date] = None,
) -> Dict[str, Any]:
    """Nuova pratica con il suo primo passo (datato `aperta_il`)."""
    o = _oggi(oggi)
    titolo = _testo(titolo, "Titolo")
    controparte = _testo(controparte, "Controparte")
    testo = _testo(testo, "Testo del primo passo")
    contatto = _testo(controparte_contatto, "Contatto", obbligatorio=False)
    if stato not in STATI_APERTI:
        raise PraticaErrore("Una pratica nasce «tocca a me» o «tocca a loro»")
    termine = _data_valida(termine, "Termine")
    aperta_il = _data_valida(aperta_il, "Aperta il") or o.isoformat()
    if aperta_il > o.isoformat():
        raise PraticaErrore("La data di apertura non può essere nel futuro")

    conn = get_pratiche_conn()
    rel = None
    try:
        adesso = _adesso()
        cur = conn.execute(
            """
            INSERT INTO pratiche
                (titolo, controparte, controparte_contatto, stato, termine,
                 aperta_il, ultimo_passo_il, creata_da, creata_at, aggiornata_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (titolo, controparte, contatto, stato, termine, aperta_il, aperta_il,
             autore, adesso, adesso),
        )
        pid = cur.lastrowid
        nome = None
        if allegato:
            rel, nome = _salva_allegato(pid, allegato, allegato_nome)
        _inserisci_passo(conn, pid, data=aperta_il, testo=testo, autore=autore,
                         stato_a=stato, termine_a=termine,
                         allegato_path=rel, allegato_nome=nome)
        conn.commit()
    except Exception:
        conn.rollback()
        _togli_file(rel)
        raise
    finally:
        conn.close()
    return leggi(pid, oggi=o)


def aggiorna_testata(
    pratica_id: int,
    titolo: Optional[str] = None,
    controparte: Optional[str] = None,
    controparte_contatto: Optional[str] = None,
    oggi: Optional[date] = None,
) -> Dict[str, Any]:
    """Corregge titolo, controparte e contatto. Stato e termine NON si toccano
    qui: cambiano solo con un passo, così restano nella storia."""
    campi, args = [], []
    if titolo is not None:
        campi.append("titolo = ?")
        args.append(_testo(titolo, "Titolo"))
    if controparte is not None:
        campi.append("controparte = ?")
        args.append(_testo(controparte, "Controparte"))
    if controparte_contatto is not None:
        campi.append("controparte_contatto = ?")
        args.append(_testo(controparte_contatto, "Contatto", obbligatorio=False))
    conn = get_pratiche_conn()
    try:
        _carica(conn, pratica_id)
        if campi:
            campi.append("aggiornata_at = ?")
            args += [_adesso(), pratica_id]
            conn.execute(f"UPDATE pratiche SET {', '.join(campi)} WHERE id = ?", args)
            conn.commit()
    finally:
        conn.close()
    return leggi(pratica_id, oggi=oggi)


def aggiungi_passo(
    pratica_id: int,
    testo: str,
    data: Optional[str] = None,
    stato_a: Optional[str] = None,
    termine_a: Any = NON_CAMBIA,
    esito: Optional[str] = None,
    autore: Optional[str] = None,
    allegato: Optional[bytes] = None,
    allegato_nome: Optional[str] = None,
    automatico: bool = False,
    oggi: Optional[date] = None,
) -> Dict[str, Any]:
    """Il gesto di tutti i giorni. Può anche cambiare stato (chiudere, riaprire)
    e spostare il termine (`termine_a=None` = nessun termine; NON_CAMBIA = resta).
    Chiudere richiede l'esito. Ritorna la pratica aggiornata."""
    o = _oggi(oggi)
    testo = _testo(testo, "Testo del passo")
    data = _data_valida(data, "Data") or o.isoformat()
    if data > o.isoformat():
        raise PraticaErrore("La data del passo non può essere nel futuro")
    if stato_a is not None and stato_a not in STATI:
        raise PraticaErrore(f"Stato non valido: {stato_a}")

    conn = get_pratiche_conn()
    rel = None
    try:
        p = _carica(conn, pratica_id)
        upd: Dict[str, Any] = {}

        # Stato
        stato_da = stato_nuovo = None
        if stato_a and stato_a != p["stato"]:
            stato_da, stato_nuovo = p["stato"], stato_a
            upd["stato"] = stato_a
            if stato_a == "chiusa":
                if not (esito or "").strip():
                    raise PraticaErrore("Per chiudere serve l'esito")
                esito = esito.strip()
                upd["esito"] = esito
                upd["chiusa_il"] = data
            elif p["stato"] == "chiusa":
                # Riapertura: la testata si svuota, i passi conservano la storia.
                upd["esito"] = None
                upd["chiusa_il"] = None

        # Termine
        termine_da = termine_nuovo = None
        cambia_termine = False
        if termine_a is not NON_CAMBIA:
            nuovo = _data_valida(termine_a, "Nuovo termine")
            if nuovo != p["termine"]:
                cambia_termine = True
                termine_da, termine_nuovo = p["termine"], nuovo
                upd["termine"] = nuovo

        if allegato:
            rel, nome = _salva_allegato(pratica_id, allegato, allegato_nome)
        else:
            nome = None

        _inserisci_passo(conn, pratica_id, data=data, testo=testo, autore=autore,
                         stato_da=stato_da, stato_a=stato_nuovo,
                         termine_da=termine_da if cambia_termine else None,
                         termine_a=termine_nuovo if cambia_termine else None,
                         automatico=automatico, allegato_path=rel, allegato_nome=nome)

        upd["ultimo_passo_il"] = max(p["ultimo_passo_il"] or data, data)
        upd["aggiornata_at"] = _adesso()
        sets = ", ".join(f"{k} = ?" for k in upd)
        conn.execute(f"UPDATE pratiche SET {sets} WHERE id = ?", [*upd.values(), pratica_id])
        conn.commit()
    except Exception:
        conn.rollback()
        _togli_file(rel)
        raise
    finally:
        conn.close()
    return leggi(pratica_id, oggi=o)


def chiudi(pratica_id: int, esito: str, testo: Optional[str] = None, data: Optional[str] = None,
           autore: Optional[str] = None, oggi: Optional[date] = None) -> Dict[str, Any]:
    if not (esito or "").strip():
        raise PraticaErrore("Per chiudere serve l'esito")
    esito = esito.strip()
    return aggiungi_passo(pratica_id, testo or f"Chiusa: {esito}", data=data,
                          stato_a="chiusa", esito=esito, autore=autore, oggi=oggi)


def riapri(pratica_id: int, testo: str, stato_a: str = "tocca_a_me", data: Optional[str] = None,
           autore: Optional[str] = None, oggi: Optional[date] = None) -> Dict[str, Any]:
    if stato_a not in STATI_APERTI:
        raise PraticaErrore("Si riapre in «tocca a me» o «tocca a loro»")
    return aggiungi_passo(pratica_id, testo, data=data, stato_a=stato_a, autore=autore, oggi=oggi)


def sposta_termine(pratica_id: int, termine: Optional[str], testo: Optional[str] = None,
                   autore: Optional[str] = None, oggi: Optional[date] = None) -> Dict[str, Any]:
    """Sposta (o toglie) il termine. Senza testo il passo è automatico."""
    if testo and testo.strip():
        return aggiungi_passo(pratica_id, testo, termine_a=termine, autore=autore, oggi=oggi)
    conn = get_pratiche_conn()
    try:
        vecchio = _carica(conn, pratica_id)["termine"]
    finally:
        conn.close()
    nuovo = _data_valida(termine, "Nuovo termine")
    auto = f"Termine spostato: {_fmt_data(vecchio)} → {_fmt_data(nuovo)}"
    return aggiungi_passo(pratica_id, auto, termine_a=nuovo, autore=autore,
                          automatico=True, oggi=oggi)


def collega(pratica_id: int, modulo: str, tipo: str, ref_id: str, etichetta: str,
            link: Optional[str] = None, oggi: Optional[date] = None) -> Dict[str, Any]:
    """Aggiunge un collegamento ad un oggetto di un altro modulo. La pratica non
    legge l'altro modulo: l'etichetta si scrive ora e resta quella."""
    modulo = _testo(modulo, "Modulo")
    tipo = _testo(tipo, "Tipo")
    ref_id = _testo(str(ref_id) if ref_id is not None else "", "Id")
    etichetta = _testo(etichetta, "Etichetta")
    link = _testo(link, "Link", obbligatorio=False)
    if link and (not link.startswith("/") or link.startswith("//")):
        raise PraticaErrore("Il link deve essere un percorso interno, che inizia con /")
    conn = get_pratiche_conn()
    try:
        _carica(conn, pratica_id)
        conn.execute(
            """
            INSERT INTO pratiche_collegamenti
                (pratica_id, modulo, tipo, ref_id, etichetta, link, creato_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (pratica_id, modulo, tipo, ref_id, etichetta, link, _adesso()),
        )
        conn.execute("UPDATE pratiche SET aggiornata_at = ? WHERE id = ?", (_adesso(), pratica_id))
        conn.commit()
    finally:
        conn.close()
    return leggi(pratica_id, oggi=oggi)


def scollega(pratica_id: int, collegamento_id: int, autore: Optional[str] = None,
             oggi: Optional[date] = None) -> Dict[str, Any]:
    """Toglie il collegamento e lascia un passo automatico «Scollegata: …»."""
    o = _oggi(oggi)
    conn = get_pratiche_conn()
    try:
        _carica(conn, pratica_id)
        c = conn.execute(
            "SELECT * FROM pratiche_collegamenti WHERE id = ? AND pratica_id = ?",
            (collegamento_id, pratica_id),
        ).fetchone()
        if not c:
            raise PraticaNonTrovata("Collegamento non trovato")
        conn.execute("DELETE FROM pratiche_collegamenti WHERE id = ?", (collegamento_id,))
        data = o.isoformat()
        _inserisci_passo(conn, pratica_id, data=data, testo=f"Scollegata: {c['etichetta']}",
                         autore=autore, automatico=True)
        conn.execute(
            "UPDATE pratiche SET ultimo_passo_il = MAX(ultimo_passo_il, ?), aggiornata_at = ? WHERE id = ?",
            (data, _adesso(), pratica_id),
        )
        conn.commit()
    finally:
        conn.close()
    return leggi(pratica_id, oggi=o)
