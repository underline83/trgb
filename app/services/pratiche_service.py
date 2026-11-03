# @version: v1.1 (2026-11-02) — sezioni, campi del debito, «in attesa di mezzi»
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

v1.1 (decise con Marco il 2026-11-02):
- SEZIONI (pratiche_sezioni) scelte da Marco; filtro e conteggi per sezione;
- campi del debito: tipo d'atto (con il gradino della scala), riferimento
  dell'atto, periodo d'imposta, importo dovuto e residuo. Il PRIMO valore si
  scrive in testata senza passo (è una classificazione); ogni CAMBIO di un
  valore già scritto lascia un passo con «da → a» (colonna `modifiche`).
  Il passaggio di gradino (comunicazione → avviso bonario → cartella…) e il
  cambio di sezione (AE → Riscossione, quando l'ADER richiama gli stessi atti)
  sono quindi sempre nella storia;
- «in attesa di mezzi»: flag sulla testata, lo stato NON cambia. La pratica
  esce da scadute e ferme e torna «da rivedere» alla data di revisione
  (oggi + giorni_revisione, da pratiche_config). Ogni passo a mano su una
  pratica in attesa è una revisione: la data slitta in avanti.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.models.pratiche_db import CONFIG_INIZIALE, STATI, get_pratiche_conn

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

# v1.1 — campi della testata il cui cambio resta nella storia.
CAMPI_TRACCIATI = (
    "sezione_id", "tipo_atto_id", "rif_atto", "periodo",
    "importo_dovuto", "importo_residuo", "in_attesa_mezzi", "revisione_il",
)
ETICHETTE_CAMPO = {
    "sezione_id": "Sezione",
    "tipo_atto_id": "Atto",
    "rif_atto": "Riferimento",
    "periodo": "Periodo",
    "importo_dovuto": "Dovuto",
    "importo_residuo": "Residuo",
    "in_attesa_mezzi": "In attesa di mezzi",
    "revisione_il": "Revisione",
}

SELECT_PRATICA = """
    SELECT p.*, s.nome AS sezione, t.nome AS tipo_atto, t.gradino AS gradino
      FROM pratiche p
      LEFT JOIN pratiche_sezioni s ON s.id = p.sezione_id
      LEFT JOIN pratiche_tipi_atto t ON t.id = p.tipo_atto_id
"""


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


def _fmt_euro(v: Optional[float]) -> str:
    if v is None:
        return "—"
    testo = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"€ {testo}"


def _arricchisci(row, oggi: date) -> Dict[str, Any]:
    """Aggiunge i valori calcolati: scaduta, ferma, giorni al termine, e (v1.1)
    in_attesa, da_rivedere, termine_passato."""
    p = dict(row)
    aperta = p["stato"] != "chiusa"
    in_attesa = bool(p.get("in_attesa_mezzi"))
    giorni = None
    if p.get("termine"):
        try:
            giorni = (date.fromisoformat(p["termine"]) - oggi).days
        except ValueError:
            giorni = None
    p["giorni_al_termine"] = giorni
    p["in_attesa"] = bool(aperta and in_attesa)
    # Termine passato su una pratica aperta. «scaduta» lo è solo se NON è in
    # attesa di mezzi: quelle stanno nel loro gruppo, col termine in evidenza.
    p["termine_passato"] = bool(aperta and giorni is not None and giorni < 0)
    p["scaduta"] = bool(p["termine_passato"] and not in_attesa)
    ferma = False
    if aperta and not in_attesa and not p.get("termine") and p.get("ultimo_passo_il"):
        try:
            ferma = date.fromisoformat(p["ultimo_passo_il"]) <= oggi - timedelta(days=GIORNI_FERMA)
        except ValueError:
            ferma = False
    p["ferma"] = ferma
    giorni_rev = None
    if p.get("revisione_il"):
        try:
            giorni_rev = (date.fromisoformat(p["revisione_il"]) - oggi).days
        except ValueError:
            giorni_rev = None
    p["giorni_alla_revisione"] = giorni_rev if p["in_attesa"] else None
    p["da_rivedere"] = bool(p["in_attesa"] and (giorni_rev is None or giorni_rev <= 0))
    return p


def _carica(conn, pratica_id: int):
    row = conn.execute("SELECT * FROM pratiche WHERE id = ?", (pratica_id,)).fetchone()
    if not row:
        raise PraticaNonTrovata(f"Pratica {pratica_id} non trovata")
    return row


# ─────────────────────────────────────────────
# v1.1 — config, sezioni, tipi d'atto, campi del debito
# ─────────────────────────────────────────────

def _config(conn, chiave: str) -> Optional[str]:
    r = conn.execute("SELECT valore FROM pratiche_config WHERE chiave = ?", (chiave,)).fetchone()
    return r["valore"] if r else CONFIG_INIZIALE.get(chiave)


def giorni_revisione(conn=None) -> int:
    """Ogni quanti giorni una pratica in attesa di mezzi torna da rivedere."""
    propria = conn is None
    conn = conn or get_pratiche_conn()
    try:
        try:
            n = int(_config(conn, "giorni_revisione") or CONFIG_INIZIALE["giorni_revisione"])
        except (TypeError, ValueError):
            n = int(CONFIG_INIZIALE["giorni_revisione"])
    finally:
        if propria:
            conn.close()
    return max(1, n)


def leggi_config() -> Dict[str, Any]:
    return {"giorni_revisione": giorni_revisione()}


def salva_config(giorni_revisione_nuovi: int) -> Dict[str, Any]:
    try:
        n = int(giorni_revisione_nuovi)
    except (TypeError, ValueError):
        raise PraticaErrore("Giorni di revisione: serve un numero intero")
    if not 1 <= n <= 365:
        raise PraticaErrore("Giorni di revisione: fra 1 e 365")
    conn = get_pratiche_conn()
    try:
        conn.execute(
            "INSERT INTO pratiche_config (chiave, valore) VALUES ('giorni_revisione', ?) "
            "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore",
            (str(n),),
        )
        conn.commit()
    finally:
        conn.close()
    return leggi_config()


def _risolvi(conn, tabella: str, valore: Any, cosa: str) -> Optional[int]:
    """id, nome esatto o pezzo di nome (unico, senza maiuscole) → id. None/'' → None."""
    if valore is None or (isinstance(valore, str) and not valore.strip()):
        return None
    attivo = "attiva" if tabella == "pratiche_sezioni" else "attivo"
    righe = [dict(r) for r in conn.execute(f"SELECT id, nome, {attivo} AS attivo FROM {tabella}").fetchall()]
    v = str(valore).strip()
    if v.isdigit():
        for r in righe:
            if r["id"] == int(v):
                return r["id"]
        raise PraticaErrore(f"{cosa} {v} inesistente")
    basso = v.lower()
    esatti = [r for r in righe if r["nome"].lower() == basso]
    if esatti:
        return esatti[0]["id"]
    pezzi = [r for r in righe if basso in r["nome"].lower() and r["attivo"]]
    if len(pezzi) == 1:
        return pezzi[0]["id"]
    nomi = ", ".join(r["nome"] for r in righe if r["attivo"])
    raise PraticaErrore(f"{cosa} «{v}» {'ambigua' if pezzi else 'sconosciuta'}. Valori: {nomi}")


def risolvi_sezione(valore: Any) -> Optional[int]:
    conn = get_pratiche_conn()
    try:
        return _risolvi(conn, "pratiche_sezioni", valore, "Sezione")
    finally:
        conn.close()


def _importo(valore: Any, campo: str) -> Optional[float]:
    """Accetta 5008.07, «5.008,07», «€ 5.008,07». None/'' → None."""
    if valore is None:
        return None
    if isinstance(valore, (int, float)):
        n = float(valore)
    else:
        t = str(valore).replace("€", "").replace(" ", "").strip()
        if not t:
            return None
        if "," in t:
            t = t.replace(".", "").replace(",", ".")
        try:
            n = float(t)
        except ValueError:
            raise PraticaErrore(f"{campo}: importo non valido ({valore})")
    if n < 0:
        raise PraticaErrore(f"{campo}: l'importo non può essere negativo")
    return round(n, 2)


def _bool(valore: Any) -> int:
    if isinstance(valore, str):
        return 1 if valore.strip().lower() in ("1", "true", "si", "sì", "yes", "on") else 0
    return 1 if valore else 0


def _normalizza_campi(conn, campi: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Solo i campi passati (CAMPI_TRACCIATI), già validati."""
    out: Dict[str, Any] = {}
    for k, v in (campi or {}).items():
        if v is NON_CAMBIA:
            continue
        if k not in CAMPI_TRACCIATI:
            raise PraticaErrore(f"Campo sconosciuto: {k}")
        if k == "sezione_id":
            out[k] = _risolvi(conn, "pratiche_sezioni", v, "Sezione")
        elif k == "tipo_atto_id":
            out[k] = _risolvi(conn, "pratiche_tipi_atto", v, "Tipo d'atto")
        elif k in ("rif_atto", "periodo"):
            out[k] = _testo(v, ETICHETTE_CAMPO[k], obbligatorio=False)
        elif k in ("importo_dovuto", "importo_residuo"):
            out[k] = _importo(v, ETICHETTE_CAMPO[k])
        elif k == "in_attesa_mezzi":
            out[k] = _bool(v)
        elif k == "revisione_il":
            out[k] = _data_valida(v, "Revisione")
    return out


def _leggibile(conn, campo: str, v: Any) -> str:
    if campo == "in_attesa_mezzi":
        return "sì" if v else "no"
    if v is None or v == "":
        return "—"
    if campo in ("sezione_id", "tipo_atto_id"):
        tab = "pratiche_sezioni" if campo == "sezione_id" else "pratiche_tipi_atto"
        r = conn.execute(f"SELECT nome FROM {tab} WHERE id = ?", (v,)).fetchone()
        return r["nome"] if r else f"#{v}"
    if campo in ("importo_dovuto", "importo_residuo"):
        return _fmt_euro(v)
    if campo == "revisione_il":
        return _fmt_data(v)
    return str(v)


def _differenze(conn, p, nuovi: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, str]], bool]:
    """(upd per la testata, modifiche leggibili, c'era già un valore?).
    `c'era già` = almeno un campo cambia un valore già scritto (non un primo
    valore): in testata è quello che fa nascere il passo automatico."""
    upd: Dict[str, Any] = {}
    modifiche: List[Dict[str, str]] = []
    gia_scritto = False
    for k, nuovo in nuovi.items():
        vecchio = p[k]
        if k == "in_attesa_mezzi":
            vecchio = 1 if vecchio else 0
        if vecchio == nuovo:
            continue
        upd[k] = nuovo
        modifiche.append({"campo": ETICHETTE_CAMPO[k], "da": _leggibile(conn, k, vecchio),
                          "a": _leggibile(conn, k, nuovo)})
        if k == "in_attesa_mezzi" or (vecchio is not None and vecchio != ""):
            gia_scritto = True
    return upd, modifiche, gia_scritto


def _residuo_iniziale(p, nuovi: Dict[str, Any]) -> None:
    """Primo «dovuto» su una pratica senza residuo: il residuo parte uguale."""
    if (nuovi.get("importo_dovuto") is not None and "importo_residuo" not in nuovi
            and p["importo_residuo"] is None):
        nuovi["importo_residuo"] = nuovi["importo_dovuto"]


def _testo_modifiche(modifiche: List[Dict[str, str]]) -> str:
    return "; ".join(f"{m['campo']}: {m['da']} → {m['a']}" for m in modifiche)


def _attesa(conn, p, nuovi: Dict[str, Any], o: date, passo_a_mano: bool) -> None:
    """Regole della revisione, applicate a `nuovi` prima delle differenze:
    entrare in attesa senza data → oggi + giorni; uscire → niente data;
    un passo a mano su una pratica che resta in attesa → la data slitta."""
    prima = bool(p["in_attesa_mezzi"])
    dopo = bool(nuovi.get("in_attesa_mezzi", prima))
    if dopo and "revisione_il" not in nuovi:
        if not prima or passo_a_mano or not p["revisione_il"]:
            nuovi["revisione_il"] = (o + timedelta(days=giorni_revisione(conn))).isoformat()
    if not dopo:
        if prima or p["revisione_il"]:
            nuovi["revisione_il"] = None
        else:
            nuovi.pop("revisione_il", None)


def elenco_sezioni(con_disattive: bool = False) -> List[Dict[str, Any]]:
    conn = get_pratiche_conn()
    try:
        sql = "SELECT * FROM pratiche_sezioni"
        if not con_disattive:
            sql += " WHERE attiva = 1"
        return [dict(r) for r in conn.execute(sql + " ORDER BY ordine, nome").fetchall()]
    finally:
        conn.close()


def crea_sezione(nome: str, ordine: Optional[int] = None) -> Dict[str, Any]:
    nome = _testo(nome, "Nome della sezione")
    conn = get_pratiche_conn()
    try:
        if conn.execute("SELECT 1 FROM pratiche_sezioni WHERE lower(nome) = lower(?)", (nome,)).fetchone():
            raise PraticaErrore(f"La sezione «{nome}» esiste già")
        if ordine is None:
            ordine = (conn.execute("SELECT COALESCE(MAX(ordine), 0) FROM pratiche_sezioni").fetchone()[0] or 0) + 10
        cur = conn.execute("INSERT INTO pratiche_sezioni (nome, ordine) VALUES (?, ?)", (nome, int(ordine)))
        conn.commit()
        return dict(conn.execute("SELECT * FROM pratiche_sezioni WHERE id = ?", (cur.lastrowid,)).fetchone())
    finally:
        conn.close()


def aggiorna_sezione(sezione_id: int, nome: Optional[str] = None, ordine: Optional[int] = None,
                     attiva: Optional[bool] = None) -> Dict[str, Any]:
    """Rinomina, riordina, disattiva. Le sezioni non si cancellano: una
    disattivata sparisce dalle scelte ma le sue pratiche la tengono."""
    conn = get_pratiche_conn()
    try:
        if not conn.execute("SELECT 1 FROM pratiche_sezioni WHERE id = ?", (sezione_id,)).fetchone():
            raise PraticaNonTrovata(f"Sezione {sezione_id} non trovata")
        campi, args = [], []
        if nome is not None:
            nome = _testo(nome, "Nome della sezione")
            if conn.execute("SELECT 1 FROM pratiche_sezioni WHERE lower(nome) = lower(?) AND id != ?",
                            (nome, sezione_id)).fetchone():
                raise PraticaErrore(f"La sezione «{nome}» esiste già")
            campi.append("nome = ?"); args.append(nome)
        if ordine is not None:
            campi.append("ordine = ?"); args.append(int(ordine))
        if attiva is not None:
            campi.append("attiva = ?"); args.append(1 if attiva else 0)
        if campi:
            conn.execute(f"UPDATE pratiche_sezioni SET {', '.join(campi)} WHERE id = ?", [*args, sezione_id])
            conn.commit()
        return dict(conn.execute("SELECT * FROM pratiche_sezioni WHERE id = ?", (sezione_id,)).fetchone())
    finally:
        conn.close()


def elenco_tipi_atto(con_disattivi: bool = False) -> List[Dict[str, Any]]:
    conn = get_pratiche_conn()
    try:
        sql = ("SELECT t.*, s.nome AS sezione FROM pratiche_tipi_atto t "
               "LEFT JOIN pratiche_sezioni s ON s.id = t.sezione_id")
        if not con_disattivi:
            sql += " WHERE t.attivo = 1"
        sql += " ORDER BY t.gradino IS NULL, t.gradino, t.nome"
        return [dict(r) for r in conn.execute(sql).fetchall()]
    finally:
        conn.close()


def crea_tipo_atto(nome: str, gradino: Optional[int] = None, sezione: Any = None) -> Dict[str, Any]:
    nome = _testo(nome, "Nome del tipo d'atto")
    conn = get_pratiche_conn()
    try:
        if conn.execute("SELECT 1 FROM pratiche_tipi_atto WHERE lower(nome) = lower(?)", (nome,)).fetchone():
            raise PraticaErrore(f"Il tipo d'atto «{nome}» esiste già")
        sid = _risolvi(conn, "pratiche_sezioni", sezione, "Sezione")
        cur = conn.execute("INSERT INTO pratiche_tipi_atto (nome, gradino, sezione_id) VALUES (?, ?, ?)",
                           (nome, int(gradino) if gradino not in (None, "") else None, sid))
        conn.commit()
        tid = cur.lastrowid
    finally:
        conn.close()
    return next(t for t in elenco_tipi_atto(True) if t["id"] == tid)


def aggiorna_tipo_atto(tipo_id: int, nome: Optional[str] = None, gradino: Any = NON_CAMBIA,
                       sezione: Any = NON_CAMBIA, attivo: Optional[bool] = None) -> Dict[str, Any]:
    conn = get_pratiche_conn()
    try:
        if not conn.execute("SELECT 1 FROM pratiche_tipi_atto WHERE id = ?", (tipo_id,)).fetchone():
            raise PraticaNonTrovata(f"Tipo d'atto {tipo_id} non trovato")
        campi, args = [], []
        if nome is not None:
            nome = _testo(nome, "Nome del tipo d'atto")
            if conn.execute("SELECT 1 FROM pratiche_tipi_atto WHERE lower(nome) = lower(?) AND id != ?",
                            (nome, tipo_id)).fetchone():
                raise PraticaErrore(f"Il tipo d'atto «{nome}» esiste già")
            campi.append("nome = ?"); args.append(nome)
        if gradino is not NON_CAMBIA:
            campi.append("gradino = ?"); args.append(int(gradino) if gradino not in (None, "") else None)
        if sezione is not NON_CAMBIA:
            campi.append("sezione_id = ?"); args.append(_risolvi(conn, "pratiche_sezioni", sezione, "Sezione"))
        if attivo is not None:
            campi.append("attivo = ?"); args.append(1 if attivo else 0)
        if campi:
            conn.execute(f"UPDATE pratiche_tipi_atto SET {', '.join(campi)} WHERE id = ?", [*args, tipo_id])
            conn.commit()
    finally:
        conn.close()
    return next(t for t in elenco_tipi_atto(True) if t["id"] == tipo_id)


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
    sezione: Any = None,
    in_attesa: Optional[bool] = None,
    da_rivedere: Optional[bool] = None,
    oggi: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """Pratiche ordinate per termine (senza termine in fondo).

    - chiuse=False (default): solo le aperte. chiuse=True: anche le chiuse.
      stato='chiusa' le include comunque.
    - scadute / ferme / in_attesa / da_rivedere: filtri sui valori calcolati.
    - q: cerca in titolo, controparte e riferimento dell'atto.
    - sezione: id o nome; «nessuna» = senza sezione.
    """
    o = _oggi(oggi)
    if stato is not None and stato not in STATI:
        raise PraticaErrore(f"Stato non valido: {stato}")
    where, args = [], []
    if stato:
        where.append("p.stato = ?")
        args.append(stato)
    elif not chiuse:
        where.append("p.stato != 'chiusa'")
    if q and q.strip():
        where.append("(p.titolo LIKE ? OR p.controparte LIKE ? OR p.rif_atto LIKE ?)")
        like = f"%{q.strip()}%"
        args += [like, like, like]

    conn = get_pratiche_conn()
    try:
        if sezione is not None and str(sezione).strip():
            if str(sezione).strip().lower() in ("nessuna", "senza", "0"):
                where.append("p.sezione_id IS NULL")
            else:
                where.append("p.sezione_id = ?")
                args.append(_risolvi(conn, "pratiche_sezioni", sezione, "Sezione"))
        sql = SELECT_PRATICA
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY p.termine IS NULL, p.termine, p.ultimo_passo_il DESC, p.id DESC"
        rows = conn.execute(sql, args).fetchall()
    finally:
        conn.close()

    out = [_arricchisci(r, o) for r in rows]
    if scadute is not None:
        out = [p for p in out if p["scaduta"] == scadute]
    if ferme is not None:
        out = [p for p in out if p["ferma"] == ferme]
    if in_attesa is not None:
        out = [p for p in out if p["in_attesa"] == in_attesa]
    if da_rivedere is not None:
        out = [p for p in out if p["da_rivedere"] == da_rivedere]
    return out


def _passo_out(r) -> Dict[str, Any]:
    passo = dict(r)
    passo["ha_allegato"] = bool(passo.pop("allegato_path", None))
    try:
        passo["modifiche"] = json.loads(passo["modifiche"]) if passo.get("modifiche") else []
    except (TypeError, ValueError):
        passo["modifiche"] = []
    return passo


def leggi(pratica_id: int, oggi: Optional[date] = None) -> Dict[str, Any]:
    """Pratica con i passi (dal più recente) e i collegamenti."""
    o = _oggi(oggi)
    conn = get_pratiche_conn()
    try:
        row = conn.execute(SELECT_PRATICA + " WHERE p.id = ?", (pratica_id,)).fetchone()
        if not row:
            raise PraticaNonTrovata(f"Pratica {pratica_id} non trovata")
        p = _arricchisci(row, o)
        p["passi"] = [_passo_out(r) for r in conn.execute(
            "SELECT * FROM pratiche_passi WHERE pratica_id = ? ORDER BY data DESC, id DESC",
            (pratica_id,),
        ).fetchall()]
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
        "tocca_a_me": sum(1 for p in aperte if p["stato"] == "tocca_a_me" and not p["in_attesa"]),
        "in_attesa": sum(1 for p in aperte if p["in_attesa"]),
        "da_rivedere": sum(1 for p in aperte if p["da_rivedere"]),
    }


def _breve(p: Dict[str, Any]) -> Dict[str, Any]:
    """Una riga per i riepiloghi (giro del mattino, MCP)."""
    return {k: p.get(k) for k in (
        "id", "titolo", "controparte", "sezione", "stato", "tipo_atto", "rif_atto",
        "importo_residuo", "termine", "giorni_al_termine", "revisione_il", "giorni_alla_revisione",
    )}


def riepilogo(oggi: Optional[date] = None) -> Dict[str, Any]:
    """Conteggi per sezione (le attive, più «senza sezione» se serve) e le
    pratiche in attesa di mezzi, con quelle da rivedere oggi."""
    o = _oggi(oggi)
    aperte = elenco(oggi=o)
    conn = get_pratiche_conn()
    try:
        chiuse_per = {r[0]: r[1] for r in conn.execute(
            "SELECT sezione_id, COUNT(*) FROM pratiche WHERE stato = 'chiusa' GROUP BY sezione_id"
        ).fetchall()}
    finally:
        conn.close()

    def conta(lista: List[Dict[str, Any]], sid) -> Dict[str, Any]:
        residui = [p["importo_residuo"] for p in lista if p.get("importo_residuo") is not None]
        return {
            "aperte": len(lista),
            "tocca_a_me": sum(1 for p in lista if p["stato"] == "tocca_a_me" and not p["in_attesa"]),
            "tocca_a_loro": sum(1 for p in lista if p["stato"] == "tocca_a_loro" and not p["in_attesa"]),
            "scadute": sum(1 for p in lista if p["scaduta"]),
            "in_attesa": sum(1 for p in lista if p["in_attesa"]),
            "da_rivedere": sum(1 for p in lista if p["da_rivedere"]),
            "residuo": round(sum(residui), 2) if residui else None,
            "chiuse": chiuse_per.get(sid, 0),
        }

    sezioni = []
    for s in elenco_sezioni():
        sezioni.append({"id": s["id"], "nome": s["nome"],
                        **conta([p for p in aperte if p["sezione_id"] == s["id"]], s["id"])})
    noti = {s["id"] for s in sezioni}
    altre = [p for p in aperte if p["sezione_id"] not in noti]
    if altre or chiuse_per.get(None):
        # «senza sezione» comprende anche le pratiche di una sezione disattivata
        sezioni.append({"id": None, "nome": "Senza sezione", **conta(altre, None)})
    in_attesa = [p for p in aperte if p["in_attesa"]]
    return {
        "oggi": o.isoformat(),
        "giorni_revisione": giorni_revisione(),
        "totale": conta(aperte, "__tutte__") | {"chiuse": sum(chiuse_per.values())},
        "sezioni": sezioni,
        "da_rivedere": [_breve(p) for p in in_attesa if p["da_rivedere"]],
        "in_attesa": [_breve(p) for p in in_attesa if not p["da_rivedere"]],
    }


def termini_da_avvisare(soglia_giorni: int = 3, oggi: Optional[date] = None) -> Dict[str, List[Dict[str, Any]]]:
    """I gruppi del checker `pratiche_termini`: scadute, in scadenza entro la
    soglia, ferme da 30 giorni senza termine e (v1.1) in attesa di mezzi da
    rivedere. Le pratiche in attesa di mezzi non sono né scadute né ferme."""
    aperte = elenco(oggi=oggi)
    return {
        "scadute": [p for p in aperte if p["scaduta"]],
        "in_scadenza": [
            p for p in aperte
            if not p["in_attesa"] and p["giorni_al_termine"] is not None
            and 0 <= p["giorni_al_termine"] <= soglia_giorni
        ],
        "ferme": [p for p in aperte if p["ferma"]],
        "da_rivedere": [p for p in aperte if p["da_rivedere"]],
    }


# ─────────────────────────────────────────────
# Scrittura
# ─────────────────────────────────────────────

def _inserisci_passo(conn, pratica_id: int, *, data: str, testo: str, autore: Optional[str],
                     stato_da=None, stato_a=None, termine_da=None, termine_a=None,
                     automatico: bool = False, allegato_path=None, allegato_nome=None,
                     modifiche: Optional[List[Dict[str, str]]] = None) -> int:
    cur = conn.execute(
        """
        INSERT INTO pratiche_passi
            (pratica_id, data, testo, stato_da, stato_a, termine_da, termine_a,
             automatico, allegato_path, allegato_nome, autore, modifiche, creato_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (pratica_id, data, testo, stato_da, stato_a, termine_da, termine_a,
         1 if automatico else 0, allegato_path, allegato_nome, autore,
         json.dumps(modifiche, ensure_ascii=False) if modifiche else None, _adesso()),
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
    campi: Optional[Dict[str, Any]] = None,
    oggi: Optional[date] = None,
) -> Dict[str, Any]:
    """Nuova pratica con il suo primo passo (datato `aperta_il`). `campi` (v1.1):
    sezione_id, tipo_atto_id, rif_atto, periodo, importo_dovuto,
    importo_residuo, in_attesa_mezzi, revisione_il (id o nomi per sezione e atto)."""
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
        extra = _normalizza_campi(conn, campi)
        if extra.get("in_attesa_mezzi"):
            if not extra.get("revisione_il"):
                extra["revisione_il"] = (o + timedelta(days=giorni_revisione(conn))).isoformat()
        else:
            extra.pop("revisione_il", None)
        if extra.get("importo_residuo") is None and extra.get("importo_dovuto") is not None:
            extra["importo_residuo"] = extra["importo_dovuto"]
        adesso = _adesso()
        colonne = ["titolo", "controparte", "controparte_contatto", "stato", "termine",
                   "aperta_il", "ultimo_passo_il", "creata_da", "creata_at", "aggiornata_at",
                   *extra.keys()]
        valori = [titolo, controparte, contatto, stato, termine, aperta_il, aperta_il,
                  autore, adesso, adesso, *extra.values()]
        cur = conn.execute(
            f"INSERT INTO pratiche ({', '.join(colonne)}) VALUES ({', '.join('?' * len(colonne))})",
            valori,
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
    campi_debito: Optional[Dict[str, Any]] = None,
    autore: Optional[str] = None,
    oggi: Optional[date] = None,
) -> Dict[str, Any]:
    """Corregge titolo, controparte e contatto. Stato e termine NON si toccano
    qui: cambiano solo con un passo, così restano nella storia.

    v1.1 — `campi_debito` (sezione, atto, riferimento, periodo, importi, in
    attesa di mezzi): un PRIMO valore si scrive e basta; se cambia un valore
    già scritto nasce un passo automatico «Sezione: A → B; Atto: …»."""
    o = _oggi(oggi)
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
        p = _carica(conn, pratica_id)
        nuovi = _normalizza_campi(conn, campi_debito)
        if "in_attesa_mezzi" in nuovi or "revisione_il" in nuovi:
            _attesa(conn, p, nuovi, o, passo_a_mano=False)
        _residuo_iniziale(p, nuovi)
        upd, modifiche, gia_scritto = _differenze(conn, p, nuovi)
        for k, v in upd.items():
            campi.append(f"{k} = ?")
            args.append(v)
        if gia_scritto:
            data = o.isoformat()
            _inserisci_passo(conn, pratica_id, data=data, testo=_testo_modifiche(modifiche),
                             autore=autore, automatico=True, modifiche=modifiche)
            campi.append("ultimo_passo_il = ?")
            args.append(max(p["ultimo_passo_il"] or data, data))
        if campi:
            campi.append("aggiornata_at = ?")
            args += [_adesso(), pratica_id]
            conn.execute(f"UPDATE pratiche SET {', '.join(campi)} WHERE id = ?", args)
            conn.commit()
    finally:
        conn.close()
    return leggi(pratica_id, oggi=o)


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
    campi: Optional[Dict[str, Any]] = None,
    oggi: Optional[date] = None,
) -> Dict[str, Any]:
    """Il gesto di tutti i giorni. Può anche cambiare stato (chiudere, riaprire)
    e spostare il termine (`termine_a=None` = nessun termine; NON_CAMBIA = resta).
    Chiudere richiede l'esito. v1.1: `campi` cambia sezione, atto, riferimento,
    periodo, importi, «in attesa di mezzi»; ogni cambio resta nel passo
    (colonna modifiche). Un passo a mano su una pratica in attesa di mezzi fa
    slittare la revisione. Ritorna la pratica aggiornata."""
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

        # v1.1 — campi del debito e attesa di mezzi
        nuovi = _normalizza_campi(conn, campi)
        _residuo_iniziale(p, nuovi)
        if upd.get("stato") != "chiusa":
            _attesa(conn, p, nuovi, o, passo_a_mano=not automatico)
        diff, modifiche, _ = _differenze(conn, p, nuovi)
        upd.update(diff)

        if allegato:
            rel, nome = _salva_allegato(pratica_id, allegato, allegato_nome)
        else:
            nome = None

        _inserisci_passo(conn, pratica_id, data=data, testo=testo, autore=autore,
                         stato_da=stato_da, stato_a=stato_nuovo,
                         termine_da=termine_da if cambia_termine else None,
                         termine_a=termine_nuovo if cambia_termine else None,
                         automatico=automatico, allegato_path=rel, allegato_nome=nome,
                         modifiche=modifiche)

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


def rivedi(pratica_id: int, testo: Optional[str] = None, autore: Optional[str] = None,
           oggi: Optional[date] = None) -> Dict[str, Any]:
    """«Rivista, ancora senza mezzi»: un passo e la revisione slitta di
    giorni_revisione. Solo per le pratiche aperte in attesa di mezzi."""
    o = _oggi(oggi)
    conn = get_pratiche_conn()
    try:
        p = _carica(conn, pratica_id)
        n = giorni_revisione(conn)
    finally:
        conn.close()
    if p["stato"] == "chiusa" or not p["in_attesa_mezzi"]:
        raise PraticaErrore("Si rivede solo una pratica aperta in attesa di mezzi")
    a_mano = bool(testo and testo.strip())
    return aggiungi_passo(
        pratica_id, testo if a_mano else "Rivista: ancora in attesa di mezzi",
        autore=autore, automatico=not a_mano,
        campi={"revisione_il": (o + timedelta(days=n)).isoformat()}, oggi=o,
    )


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
