# Modulo: clienti (riconoscere la scheda da telefono o email, persone della scheda) — [core]
# -*- coding: utf-8 -*-
"""
Riconoscere il cliente mentre si scrive, e le persone della stessa scheda (2026-11-26).

Marco: «se riconosciamo il cliente con uno dei due dati [telefono, email] dobbiamo subito
sistemarli, in modo da non sovrascrivere il dato giusto… chiama la moglie che non
conosciamo… il sistema deve subito accorgersi»; «i parenti stretti nella stessa scheda».

  riconosci(conn, telefono, email, prefisso)  → schede che hanno quel numero o quell'email
  persone(conn, cliente_id) / aggiungi_persona / togli_persona   (tabella clienti_persone)
  prefissi_frequenti(conn)                    → prefissi più usati fra i clienti

Il confronto dei numeri passa da app/utils/telefono.normalizza: stesso cliente comunque
sia scritto (0039…, +39…, spazi, punti). Tabelle: clienti, clienti_persone (mig 247).
Usato dal form Prenotazioni (via prenotazioni_router) e dalla scheda cliente.
"""

from __future__ import annotations

import sqlite3
from collections import Counter
from typing import Any, Dict, List, Optional

from app.utils import telefono as tel

_STATI_VENUTI = ("SEATED", "LEFT", "ARRIVED", "BILL")


def _ha_persone(conn: sqlite3.Connection) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_persone'").fetchone())


def persone(conn: sqlite3.Connection, cliente_id: int) -> List[Dict[str, Any]]:
    if not _ha_persone(conn):
        return []
    righe = conn.execute(
        """SELECT p.id, p.nome, p.relazione,
                  (SELECT COUNT(*) FROM clienti_prenotazioni r
                    WHERE r.cliente_id = p.cliente_id AND LOWER(TRIM(r.persona_nome)) = LOWER(TRIM(p.nome))) AS prenotazioni
             FROM clienti_persone p WHERE p.cliente_id = ? ORDER BY p.id""", (cliente_id,)).fetchall()
    return [dict(r) for r in righe]


def aggiungi_persona(conn: sqlite3.Connection, cliente_id: int, nome: str,
                     relazione: Optional[str] = None, utente: Optional[str] = None) -> Optional[int]:
    """Aggiunge una persona alla scheda (o la ritrova se c'è già, senza badare alle maiuscole)."""
    nome = " ".join((nome or "").split())
    if not nome or not _ha_persone(conn):
        return None
    gia = conn.execute(
        "SELECT id FROM clienti_persone WHERE cliente_id = ? AND LOWER(nome) = LOWER(?)", (cliente_id, nome)).fetchone()
    if gia:
        if relazione:
            conn.execute("UPDATE clienti_persone SET relazione = ? WHERE id = ?", (relazione.strip(), gia["id"]))
        return gia["id"]
    cur = conn.execute(
        "INSERT INTO clienti_persone (cliente_id, nome, relazione, creato_da) VALUES (?, ?, ?, ?)",
        (cliente_id, nome, (relazione or "").strip() or None, utente))
    return cur.lastrowid


def togli_persona(conn: sqlite3.Connection, cliente_id: int, persona_id: int) -> bool:
    if not _ha_persone(conn):
        return False
    cur = conn.execute("DELETE FROM clienti_persone WHERE id = ? AND cliente_id = ?", (persona_id, cliente_id))
    return cur.rowcount > 0


def _scheda(conn: sqlite3.Connection, r: sqlite3.Row, per: str) -> Dict[str, Any]:
    visite = conn.execute(
        f"SELECT COUNT(*) AS n, MAX(data_pasto) AS ultima FROM clienti_prenotazioni "
        f"WHERE cliente_id = ? AND stato IN ({','.join('?' * len(_STATI_VENUTI))})",
        (r["id"], *_STATI_VENUTI)).fetchone()
    return {
        "id": r["id"], "nome": r["nome"] or "", "cognome": r["cognome"] or "",
        "telefono": r["telefono"], "email": r["email"], "lingua": r["lingua"],
        "vip": r["vip"], "allergie": r["allergie"], "restrizioni_dietetiche": r["restrizioni_dietetiche"],
        "visite_totali": visite["n"] or 0, "ultima_visita": visite["ultima"],
        "riconosciuto_da": per, "persone": persone(conn, r["id"]),
    }


def riconosci(conn: sqlite3.Connection, telefono: Optional[str] = None, email: Optional[str] = None,
              prefisso: Optional[str] = None) -> Dict[str, Any]:
    """Le schede attive che hanno quel numero (telefono o telefono2) o quell'email."""
    numero = tel.normalizza(telefono, prefisso)
    paese = tel.paese_di(numero)
    out: Dict[str, Any] = {"numero": numero, "paese": paese, "clienti": []}
    visti = set()
    campi = "id, nome, cognome, telefono, telefono2, email, lingua, vip, allergie, restrizioni_dietetiche"
    if numero:
        coda = tel.cifre(numero)[-8:]
        pulito = "REPLACE(REPLACE(REPLACE(REPLACE(COALESCE({c},''),' ',''),'-',''),'.',''),'/','')"
        righe = conn.execute(
            f"SELECT {campi} FROM clienti WHERE attivo = 1 AND "
            f"({pulito.format(c='telefono')} LIKE ? OR {pulito.format(c='telefono2')} LIKE ?) LIMIT 50",
            (f"%{coda}", f"%{coda}")).fetchall()
        for r in righe:
            if r["id"] not in visti and (tel.stesso_numero(r["telefono"], numero) or tel.stesso_numero(r["telefono2"], numero)):
                visti.add(r["id"])
                out["clienti"].append(_scheda(conn, r, "telefono"))
    mail = (email or "").strip().lower()
    if mail and "@" in mail:
        for r in conn.execute(
                f"SELECT {campi} FROM clienti WHERE attivo = 1 AND LOWER(TRIM(email)) = ? LIMIT 10", (mail,)).fetchall():
            if r["id"] not in visti:
                visti.add(r["id"])
                out["clienti"].append(_scheda(conn, r, "email"))
    out["clienti"].sort(key=lambda c: -c["visite_totali"])
    return out


def prefissi_frequenti(conn: sqlite3.Connection, quanti: int = 6) -> List[str]:
    """I prefissi più usati fra i clienti attivi (per mettere in cima all'elenco quelli che servono)."""
    conta: Counter = Counter()
    for r in conn.execute("SELECT telefono FROM clienti WHERE attivo = 1 AND telefono LIKE '+%' LIMIT 20000"):
        p = tel.paese_di("+" + tel.cifre(r[0]))
        if p:
            conta[p["prefisso"]] += 1
    return [p for p, _ in conta.most_common(quanti)]
