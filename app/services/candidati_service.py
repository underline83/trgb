# @version: v1.0 (2026-10-16) — nascita della sezione Candidati
# -*- coding: utf-8 -*-
"""
Service Candidati — TRGB Gestionale. Modulo: dipendenti (sotto-modulo candidati).

Tutta la logica dei candidati, in funzioni SENZA Request: il router
(`candidati_router.py`), il connettore MCP (`app/connettore/server.py`) e lo
script di import dal second brain chiamano queste stesse funzioni.
Doc: docs/modulo_dipendenti.md §5.9. Tabella: `dipendenti_candidati` (mig 188).

Regole:
- stati: NUOVO → DA_SENTIRE → COLLOQUIO → IN_PROVA → ASSUNTO, oppure SCARTATO;
  ASSUNTO si raggiunge SOLO con «assumi» (crea il dipendente: lo fa il router,
  che possiede la creazione del dipendente) e da lì lo stato non cambia più;
  uno SCARTATO si può rimettere in un altro stato;
- privacy: un candidato fermo da più di 12 mesi (data più recente fra
  ricevuto_il e updated_at) è segnalato «CV di 12 mesi»; nessuna cancellazione
  automatica, si elimina a mano (record + file del CV);
- i CV sono dati personali di terzi: solo PDF o immagini, max 20 MB.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.models.dipendenti_db import get_dipendenti_conn

STATI = ("NUOVO", "DA_SENTIRE", "COLLOQUIO", "IN_PROVA", "ASSUNTO", "SCARTATO")
STATI_ATTIVI = ("NUOVO", "DA_SENTIRE", "COLLOQUIO", "IN_PROVA")
SUCCESSIVO = {"NUOVO": "DA_SENTIRE", "DA_SENTIRE": "COLLOQUIO", "COLLOQUIO": "IN_PROVA"}
ETICHETTE_STATO = {
    "NUOVO": "Nuovo", "DA_SENTIRE": "Da sentire", "COLLOQUIO": "Colloquio",
    "IN_PROVA": "In prova", "ASSUNTO": "Assunto", "SCARTATO": "Scartato",
}
GIORNI_CV_VECCHIO = 365
CV_MAX_BYTES = 20 * 1024 * 1024
CV_ESTENSIONI = {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}
CV_CARTELLA = "candidati_cv"

# Campi testuali modificabili (oltre a stato, reparto_id, date).
CAMPI_TESTO = ("nome", "cognome", "ruolo_cercato", "telefono", "email",
               "disponibilita", "lingue", "documenti", "note", "fonte")


class CandidatoErrore(ValueError):
    """Dato non valido: il router lo traduce in 400."""


class CandidatoNonTrovato(LookupError):
    """Candidato inesistente: il router lo traduce in 404."""


# ─────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────

def _adesso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _data(valore: Optional[str], campo: str) -> Optional[str]:
    v = str(valore).strip() if valore is not None else ""
    if not v:
        return None
    try:
        return date.fromisoformat(v[:10]).isoformat()
    except ValueError:
        raise CandidatoErrore(f"{campo}: data non valida ({v}), serve AAAA-MM-GG")


def _data_ora(valore: Optional[str], campo: str) -> Optional[str]:
    """'AAAA-MM-GG' o 'AAAA-MM-GGTHH:MM' / 'AAAA-MM-GG HH:MM' → 'AAAA-MM-GG HH:MM'."""
    v = str(valore).strip() if valore is not None else ""
    if not v:
        return None
    try:
        dt =datetime.fromisoformat(v.replace(" ", "T")[:16])
    except ValueError:
        raise CandidatoErrore(f"{campo}: data/ora non valida ({v}), serve AAAA-MM-GG HH:MM")
    return dt.strftime("%Y-%m-%d %H:%M")


def _pulisci(v: Any) -> Optional[str]:
    s = (str(v) if v is not None else "").strip()
    return s or None


def _telefono_cifre(t: Optional[str]) -> str:
    cifre = re.sub(r"\D", "", t or "")
    # +39 / 0039 davanti non conta per il confronto
    if cifre.startswith("0039"):
        cifre = cifre[4:]
    elif cifre.startswith("39") and len(cifre) > 10:
        cifre = cifre[2:]
    return cifre


def _arricchisci(row, oggi: date) -> Dict[str, Any]:
    c = dict(row)
    c["stato_label"] = ETICHETTE_STATO.get(c["stato"], c["stato"])
    c["stato_successivo"] = SUCCESSIVO.get(c["stato"])
    c["nome_completo"] = " ".join(x for x in (c.get("nome"), c.get("cognome")) if x)
    ultima = max(filter(None, [(c.get("ricevuto_il") or "")[:10], (c.get("updated_at") or "")[:10]]),
                 default="")
    vecchio = False
    if ultima and c["stato"] != "ASSUNTO":
        try:
            vecchio = date.fromisoformat(ultima) <= oggi - timedelta(days=GIORNI_CV_VECCHIO)
        except ValueError:
            vecchio = False
    c["cv_vecchio"] = vecchio
    c["ha_cv"] = bool(c.get("cv_path"))
    return c


_SELECT = """
    SELECT c.*, r.nome AS reparto_nome, r.codice AS reparto_codice, r.icona AS reparto_icona
    FROM dipendenti_candidati c
    LEFT JOIN reparti r ON r.id = c.reparto_id
"""


def _carica(conn, candidato_id: int):
    row = conn.execute(_SELECT + " WHERE c.id = ?", (candidato_id,)).fetchone()
    if not row:
        raise CandidatoNonTrovato(f"Candidato {candidato_id} non trovato")
    return row


def _verifica_reparto(conn, reparto_id) -> Optional[int]:
    if reparto_id in (None, "", 0):
        return None
    try:
        rid = int(reparto_id)
    except (TypeError, ValueError):
        raise CandidatoErrore(f"Reparto non valido: {reparto_id}")
    if not conn.execute("SELECT 1 FROM reparti WHERE id = ?", (rid,)).fetchone():
        raise CandidatoErrore(f"Reparto {rid} inesistente")
    return rid


# ─────────────────────────────────────────────
# Lettura
# ─────────────────────────────────────────────

def elenco(
    stato: Optional[str] = None,
    reparto_id: Optional[int] = None,
    q: Optional[str] = None,
    scartati: bool = False,
    oggi: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """Candidati dal più recente. Di default solo quelli in corsa: scartati=True
    include anche SCARTATI e ASSUNTI (l'archivio); un filtro stato li mostra comunque.
    q cerca in nome, cognome, ruolo, telefono, email, note."""
    o = oggi or date.today()
    if stato and stato not in STATI:
        raise CandidatoErrore(f"Stato non valido: {stato}")
    where, args = [], []
    if stato:
        where.append("c.stato = ?")
        args.append(stato)
    elif not scartati:
        where.append("c.stato NOT IN ('SCARTATO', 'ASSUNTO')")
    if reparto_id:
        where.append("c.reparto_id = ?")
        args.append(int(reparto_id))
    if q and q.strip():
        like = f"%{q.strip()}%"
        campi = ["c.nome", "c.cognome", "c.ruolo_cercato", "c.telefono", "c.email", "c.note",
                 "(c.nome || ' ' || COALESCE(c.cognome,''))", "(COALESCE(c.cognome,'') || ' ' || c.nome)"]
        cond = [f"{f} LIKE ?" for f in campi]
        args += [like] * len(campi)
        cifre = _telefono_cifre(q)
        if len(cifre) >= 6:
            cond.append("REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.telefono,''),' ',''),'-',''),'.',''),'+','') LIKE ?")
            args.append(f"%{cifre}%")
        where.append("(" + " OR ".join(cond) + ")")
    sql = _SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY COALESCE(c.ricevuto_il, substr(c.created_at,1,10)) DESC, c.id DESC"
    conn = get_dipendenti_conn()
    try:
        rows = conn.execute(sql, args).fetchall()
    finally:
        conn.close()
    return [_arricchisci(r, o) for r in rows]


def leggi(candidato_id: int, oggi: Optional[date] = None) -> Dict[str, Any]:
    conn = get_dipendenti_conn()
    try:
        return _arricchisci(_carica(conn, candidato_id), oggi or date.today())
    finally:
        conn.close()


def contatori(oggi: Optional[date] = None) -> Dict[str, int]:
    """Quanti per stato + quanti con il CV di 12 mesi (badge e riquadri)."""
    out = {s: 0 for s in STATI}
    conn = get_dipendenti_conn()
    try:
        for stato, n in conn.execute("SELECT stato, COUNT(*) FROM dipendenti_candidati GROUP BY stato"):
            out[stato] = n
    finally:
        conn.close()
    out["cv_vecchi"] = sum(1 for c in elenco(scartati=True, oggi=oggi) if c["cv_vecchio"])
    return out


def cerca_doppioni(nome: Optional[str] = None, cognome: Optional[str] = None,
                   telefono: Optional[str] = None, email: Optional[str] = None,
                   escludi_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Candidati (anche scartati/assunti) con stesso telefono, stessa email o stesso
    nome+cognome. Serve prima di crearne uno."""
    conn = get_dipendenti_conn()
    try:
        rows = conn.execute(_SELECT).fetchall()
    finally:
        conn.close()
    tel = _telefono_cifre(telefono)
    mail = (email or "").strip().lower()
    nc = " ".join(x.strip().lower() for x in (nome or "", cognome or "") if x and x.strip())
    out = []
    for r in rows:
        if escludi_id and r["id"] == escludi_id:
            continue
        r_nc = " ".join(x.strip().lower() for x in (r["nome"] or "", r["cognome"] or "") if x and x.strip())
        if ((tel and len(tel) >= 6 and _telefono_cifre(r["telefono"]) == tel)
                or (mail and (r["email"] or "").strip().lower() == mail)
                or (nc and cognome and r_nc == nc)):
            out.append(_arricchisci(r, date.today()))
    return out


# ─────────────────────────────────────────────
# Scrittura
# ─────────────────────────────────────────────

def crea(
    *,
    nome: str,
    cognome: Optional[str] = None,
    ruolo_cercato: Optional[str] = None,
    reparto_id: Optional[int] = None,
    stato: str = "NUOVO",
    telefono: Optional[str] = None,
    email: Optional[str] = None,
    disponibilita: Optional[str] = None,
    lingue: Optional[str] = None,
    documenti: Optional[str] = None,
    note: Optional[str] = None,
    colloquio_at: Optional[str] = None,
    ricevuto_il: Optional[str] = None,
    fonte: Optional[str] = None,
    autore: Optional[str] = None,
) -> Dict[str, Any]:
    """Nuovo candidato. ricevuto_il = oggi se manca. ASSUNTO non si crea a mano."""
    nome_p = _pulisci(nome)
    if not nome_p:
        raise CandidatoErrore("Nome obbligatorio")
    stato = (stato or "NUOVO").upper()
    if stato not in STATI or stato == "ASSUNTO":
        raise CandidatoErrore(f"Stato iniziale non valido: {stato}")
    adesso = _adesso()
    conn = get_dipendenti_conn()
    try:
        rid = _verifica_reparto(conn, reparto_id)
        cur = conn.execute(
            """INSERT INTO dipendenti_candidati
               (nome, cognome, ruolo_cercato, reparto_id, stato, telefono, email,
                disponibilita, lingue, documenti, note, colloquio_at, ricevuto_il,
                fonte, created_at, updated_at, creato_da)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (nome_p, _pulisci(cognome), _pulisci(ruolo_cercato), rid, stato,
             _pulisci(telefono), _pulisci(email), _pulisci(disponibilita), _pulisci(lingue),
             _pulisci(documenti), _pulisci(note), _data_ora(colloquio_at, "Colloquio"),
             _data(ricevuto_il, "Ricevuto il") or date.today().isoformat(),
             _pulisci(fonte) or "pagina", adesso, adesso, _pulisci(autore)),
        )
        conn.commit()
        nuovo_id = cur.lastrowid
    finally:
        conn.close()
    return leggi(nuovo_id)


def aggiorna(candidato_id: int, campi: Dict[str, Any]) -> Dict[str, Any]:
    """Modifica i campi passati (le chiavi assenti restano com'erano; "" svuota).
    Lo stato si cambia con cambia_stato, non da qui."""
    sets, args = [], []
    conn = get_dipendenti_conn()
    try:
        _carica(conn, candidato_id)
        for k in CAMPI_TESTO:
            if k in campi:
                v = _pulisci(campi[k])
                if k == "nome" and not v:
                    raise CandidatoErrore("Nome obbligatorio")
                sets.append(f"{k} = ?")
                args.append(v)
        if "reparto_id" in campi:
            sets.append("reparto_id = ?")
            args.append(_verifica_reparto(conn, campi["reparto_id"]))
        if "ricevuto_il" in campi:
            sets.append("ricevuto_il = ?")
            args.append(_data(campi["ricevuto_il"], "Ricevuto il"))
        if "colloquio_at" in campi:
            sets.append("colloquio_at = ?")
            args.append(_data_ora(campi["colloquio_at"], "Colloquio"))
        if sets:
            sets.append("updated_at = ?")
            args.append(_adesso())
            conn.execute(f"UPDATE dipendenti_candidati SET {', '.join(sets)} WHERE id = ?",
                         args + [candidato_id])
            conn.commit()
    finally:
        conn.close()
    return leggi(candidato_id)


def cambia_stato(candidato_id: int, stato: str, colloquio_at: Optional[str] = None,
                 nota: Optional[str] = None) -> Dict[str, Any]:
    """Cambia stato. ASSUNTO solo con «assumi»; un assunto non torna indietro.
    `nota` (facoltativa) si accoda alle note con la data."""
    stato = (stato or "").upper()
    if stato not in STATI:
        raise CandidatoErrore(f"Stato non valido: {stato}")
    if stato == "ASSUNTO":
        raise CandidatoErrore("Per assumere usa «Assumi → Anagrafica»: crea anche il dipendente")
    conn = get_dipendenti_conn()
    try:
        c = _carica(conn, candidato_id)
        if c["stato"] == "ASSUNTO":
            raise CandidatoErrore("Il candidato è già assunto: lo stato non cambia più")
        sets, args = ["stato = ?", "updated_at = ?"], [stato, _adesso()]
        if colloquio_at is not None:
            sets.append("colloquio_at = ?")
            args.append(_data_ora(colloquio_at, "Colloquio"))
        n = _pulisci(nota)
        if n:
            riga = f"{date.today().strftime('%d/%m/%Y')} — {ETICHETTE_STATO[stato]}: {n}"
            sets.append("note = ?")
            args.append(f"{c['note']}\n{riga}" if c["note"] else riga)
        conn.execute(f"UPDATE dipendenti_candidati SET {', '.join(sets)} WHERE id = ?",
                     args + [candidato_id])
        conn.commit()
    finally:
        conn.close()
    return leggi(candidato_id)


def scarta(candidato_id: int, nota: Optional[str] = None) -> Dict[str, Any]:
    return cambia_stato(candidato_id, "SCARTATO", nota=nota)


def segna_assunto(candidato_id: int, dipendente_id: int) -> Dict[str, Any]:
    """Ultimo passo di «assumi», dopo che il router ha creato il dipendente."""
    conn = get_dipendenti_conn()
    try:
        _carica(conn, candidato_id)
        conn.execute(
            "UPDATE dipendenti_candidati SET stato = 'ASSUNTO', dipendente_id = ?, updated_at = ? WHERE id = ?",
            (int(dipendente_id), _adesso(), candidato_id))
        conn.commit()
    finally:
        conn.close()
    return leggi(candidato_id)


def verifica_assumibile(candidato_id: int) -> Dict[str, Any]:
    c = leggi(candidato_id)
    if c["stato"] == "ASSUNTO" or c.get("dipendente_id"):
        raise CandidatoErrore("Il candidato è già assunto")
    if c["stato"] == "SCARTATO":
        raise CandidatoErrore("Il candidato è scartato: rimettilo in un altro stato prima di assumerlo")
    return c


def elimina(candidato_id: int) -> None:
    """Cancella il record e il file del CV (privacy). Il CV già copiato negli
    allegati di un dipendente assunto resta là."""
    conn = get_dipendenti_conn()
    try:
        c = _carica(conn, candidato_id)
        conn.execute("DELETE FROM dipendenti_candidati WHERE id = ?", (candidato_id,))
        conn.commit()
    finally:
        conn.close()
    _togli_file(c["cv_path"])


# ─────────────────────────────────────────────
# CV
# ─────────────────────────────────────────────

def _cartella_cv() -> Path:
    from app.utils.uploads import tenant_dir
    return tenant_dir(CV_CARTELLA)


def _togli_file(rel: Optional[str]) -> None:
    if not rel:
        return
    try:
        base = _cartella_cv().resolve()
        p = (base / rel).resolve()
        if base in p.parents:
            p.unlink(missing_ok=True)
    except Exception:
        pass


def salva_cv(candidato_id: int, contenuto: bytes, nome_file: str) -> Dict[str, Any]:
    """Salva (o sostituisce) il CV del candidato. Solo PDF o immagini, max 20 MB."""
    nome = os.path.basename((nome_file or "").strip()) or "cv"
    est = os.path.splitext(nome)[1].lower()
    if est not in CV_ESTENSIONI:
        raise CandidatoErrore("CV: solo PDF o immagini (jpg, png, heic, webp)")
    if not contenuto:
        raise CandidatoErrore("CV vuoto")
    if len(contenuto) > CV_MAX_BYTES:
        raise CandidatoErrore("CV oltre 20 MB")
    conn = get_dipendenti_conn()
    try:
        vecchio = _carica(conn, candidato_id)["cv_path"]
        sicuro = re.sub(r"[^A-Za-z0-9._-]+", "_", nome)[:80] or f"cv{est}"
        # nome imprevedibile: la cartella uploads è servita su /uploads
        rel = f"{candidato_id}/{uuid.uuid4().hex}_{sicuro}"
        dest = _cartella_cv() / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(contenuto)
        conn.execute(
            "UPDATE dipendenti_candidati SET cv_filename = ?, cv_path = ?, updated_at = ? WHERE id = ?",
            (nome, rel, _adesso(), candidato_id))
        conn.commit()
    finally:
        conn.close()
    if vecchio and vecchio != rel:
        _togli_file(vecchio)
    return leggi(candidato_id)


def percorso_cv(candidato_id: int) -> Tuple[Path, str]:
    """Path su disco e nome originale del CV."""
    c = leggi(candidato_id)
    if not c.get("cv_path"):
        raise CandidatoNonTrovato("Il candidato non ha un CV")
    base = _cartella_cv().resolve()
    p = (base / c["cv_path"]).resolve()
    if base not in p.parents or not p.is_file():
        raise CandidatoNonTrovato("File del CV non trovato")
    return p, c.get("cv_filename") or p.name
