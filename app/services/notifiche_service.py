# @version: v1.1 (2026-11-24) — crea_notifica avvisa notifiche_push (la notifica diventa push se il suo tipo è acceso);
#   crea_per_destinatari (più ruoli e utenti in un colpo, «admin» comprende superadmin); v1.0-notifiche-service
# -*- coding: utf-8 -*-
"""
Servizio Notifiche — TRGB Gestionale (mattone M.A)

Funzioni riutilizzabili da qualsiasi router/modulo per creare e gestire notifiche.
Questo è il PUNTO UNICO per creare notifiche — i router non scrivono mai direttamente nel DB.

Uso da altri moduli:
    from app.services.notifiche_service import crea_notifica
    crea_notifica(
        tipo="preventivi",
        titolo="Preventivo confermato",
        messaggio="Rossi — 25 pax — 18 dicembre",
        link="/clienti/preventivi/42",
        dest_ruolo="sala",
        urgenza="normale"
    )
"""

import logging
import re
from typing import Any, Dict, Iterable, List, Optional

from app.models.notifiche_db import get_notifiche_conn

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# NOTIFICHE (automatiche dal sistema)
# ─────────────────────────────────────────────

def crea_notifica(
    tipo: str,
    titolo: str,
    messaggio: str = None,
    link: str = None,
    icona: str = None,
    urgenza: str = "normale",
    modulo: str = None,
    entity_id: int = None,
    dest_username: str = None,
    dest_ruolo: str = None,
) -> int:
    """
    Crea una notifica nel sistema.

    Destinatari:
    - dest_username: un utente specifico (es. "marco")
    - dest_ruolo: tutti gli utenti con quel ruolo (es. "sala", "admin")
    - Entrambi None: notifica globale visibile a tutti

    Ritorna l'ID della notifica creata.
    """
    conn = get_notifiche_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO notifiche (tipo, titolo, messaggio, link, icona, urgenza,
                               modulo, entity_id, dest_username, dest_ruolo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (tipo, titolo, messaggio, link, icona, urgenza,
          modulo or tipo, entity_id, dest_username, dest_ruolo))
    conn.commit()
    nid = cur.lastrowid
    conn.close()
    # Push sui dispositivi (notifiche_push, fase 2): parte solo se il TIPO è acceso in
    # Impostazioni › Notifiche, in un thread. Una push che non parte non rompe mai chi crea
    # la notifica: il campanello resta la fonte.
    try:
        from app.services import notifiche_push
        notifiche_push.avvia_da_notifica(nid, tipo, titolo, messaggio, link, dest_username, dest_ruolo)
    except Exception:
        logger.exception("avvio della push per la notifica %s non riuscito", nid)
    return nid


_TIPO_OK = re.compile(r"^[a-z0-9_]{2,40}$")
_URGENZE = ("normale", "alta", "urgente", "info")


def crea_per_destinatari(
    tipo: str,
    titolo: str,
    messaggio: Optional[str] = None,
    link: Optional[str] = None,
    ruoli: Optional[Iterable[str]] = None,
    utenti: Optional[Iterable[str]] = None,
    urgenza: str = "normale",
    icona: Optional[str] = None,
) -> Dict[str, Any]:
    """Una notifica a più ruoli e/o utenti, una riga per destinatario (il campanello
    confronta il ruolo per uguaglianza: per questo «admin» qui manda anche a
    «superadmin»). Controlla tutto PRIMA di scrivere: o partono tutte o nessuna.
    Usata dallo strumento notifica_crea del connettore. Solleva ValueError."""
    from app.services.auth_service import VALID_ROLES, list_users

    tipo = (tipo or "").strip()
    titolo = (titolo or "").strip()
    messaggio = (messaggio or "").strip() or None
    link = (link or "").strip() or None
    if not _TIPO_OK.match(tipo):
        raise ValueError("Tipo non valido: lettere minuscole, numeri e trattino basso (es. giro).")
    if not titolo or len(titolo) > 120:
        raise ValueError("Serve un titolo, al massimo 120 caratteri.")
    if messaggio and len(messaggio) > 1500:
        raise ValueError("Messaggio troppo lungo: al massimo 1500 caratteri (il resto sta nel report).")
    if link and (not link.startswith("/") or link.startswith("//")):
        raise ValueError("Il link dev'essere una pagina del gestionale (comincia con /).")
    if urgenza not in _URGENZE:
        raise ValueError(f"Urgenza: {', '.join(_URGENZE)}.")
    ruoli_l: List[str] = []
    for r in (ruoli or []):
        r = (r or "").strip()
        if r not in VALID_ROLES:
            raise ValueError(f"Ruolo «{r}» inesistente. Validi: {', '.join(sorted(VALID_ROLES))}.")
        if r not in ruoli_l:
            ruoli_l.append(r)
    if "admin" in ruoli_l and "superadmin" not in ruoli_l:
        ruoli_l.append("superadmin")
    noti = {u["username"] for u in list_users()}
    utenti_l: List[str] = []
    for u in (utenti or []):
        u = (u or "").strip()
        if u not in noti:
            raise ValueError(f"Utente «{u}» inesistente.")
        if u not in utenti_l:
            utenti_l.append(u)
    if not ruoli_l and not utenti_l:
        raise ValueError("Serve almeno un destinatario: un ruolo o un utente.")
    ids = [crea_notifica(tipo=tipo, titolo=titolo, messaggio=messaggio, link=link, icona=icona,
                         urgenza=urgenza, dest_ruolo=r) for r in ruoli_l]
    ids += [crea_notifica(tipo=tipo, titolo=titolo, messaggio=messaggio, link=link, icona=icona,
                          urgenza=urgenza, dest_username=u) for u in utenti_l]
    return {"create": len(ids), "ids": ids, "ruoli": ruoli_l, "utenti": utenti_l}


def get_notifiche_utente(username: str, ruolo: str, limit: int = 50, offset: int = 0) -> list:
    """
    Recupera le notifiche visibili per un utente (per username, per ruolo, o globali).
    Include flag 'letta' per ogni notifica.
    Ordinate per data decrescente.
    """
    conn = get_notifiche_conn()
    rows = conn.execute("""
        SELECT n.id, n.tipo, n.titolo, n.messaggio, n.link, n.icona,
               n.urgenza, n.modulo, n.entity_id, n.created_at, n.scadenza,
               CASE WHEN nl.id IS NOT NULL THEN 1 ELSE 0 END AS letta
        FROM notifiche n
        LEFT JOIN notifiche_lettura nl ON nl.notifica_id = n.id AND nl.username = ?
        WHERE (n.dest_username = ? OR n.dest_ruolo = ? OR (n.dest_username IS NULL AND n.dest_ruolo IS NULL))
          AND (n.scadenza IS NULL OR n.scadenza >= datetime('now','localtime'))
        ORDER BY n.created_at DESC
        LIMIT ? OFFSET ?
    """, (username, username, ruolo, limit, offset)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def conta_non_lette(username: str, ruolo: str) -> int:
    """Conta le notifiche non lette per un utente."""
    conn = get_notifiche_conn()
    row = conn.execute("""
        SELECT COUNT(*) as cnt
        FROM notifiche n
        LEFT JOIN notifiche_lettura nl ON nl.notifica_id = n.id AND nl.username = ?
        WHERE (n.dest_username = ? OR n.dest_ruolo = ? OR (n.dest_username IS NULL AND n.dest_ruolo IS NULL))
          AND nl.id IS NULL
          AND (n.scadenza IS NULL OR n.scadenza >= datetime('now','localtime'))
    """, (username, username, ruolo)).fetchone()
    conn.close()
    return row["cnt"] if row else 0


def segna_letta(notifica_id: int, username: str) -> bool:
    """Segna una notifica come letta per un utente. Ritorna True se inserita, False se gia' letta."""
    conn = get_notifiche_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO notifiche_lettura (notifica_id, username) VALUES (?, ?)",
            (notifica_id, username)
        )
        conn.commit()
        changed = conn.total_changes > 0
        conn.close()
        return changed
    except Exception:
        conn.close()
        return False


def segna_tutte_lette(username: str, ruolo: str) -> int:
    """Segna tutte le notifiche non lette come lette. Ritorna quante segnate."""
    conn = get_notifiche_conn()
    non_lette = conn.execute("""
        SELECT n.id
        FROM notifiche n
        LEFT JOIN notifiche_lettura nl ON nl.notifica_id = n.id AND nl.username = ?
        WHERE (n.dest_username = ? OR n.dest_ruolo = ? OR (n.dest_username IS NULL AND n.dest_ruolo IS NULL))
          AND nl.id IS NULL
          AND (n.scadenza IS NULL OR n.scadenza >= datetime('now','localtime'))
    """, (username, username, ruolo)).fetchall()

    count = 0
    for row in non_lette:
        conn.execute(
            "INSERT OR IGNORE INTO notifiche_lettura (notifica_id, username) VALUES (?, ?)",
            (row["id"], username)
        )
        count += 1
    conn.commit()
    conn.close()
    return count


def elimina_notifica(notifica_id: int) -> bool:
    """Elimina una notifica (solo admin). Cascade elimina anche le letture."""
    conn = get_notifiche_conn()
    cur = conn.execute("DELETE FROM notifiche WHERE id = ?", (notifica_id,))
    conn.commit()
    deleted = cur.rowcount > 0
    conn.close()
    return deleted


# ─────────────────────────────────────────────
# COMUNICAZIONI (bacheca admin → staff — 9.2)
# ─────────────────────────────────────────────

def crea_comunicazione(
    autore: str,
    titolo: str,
    messaggio: str,
    urgenza: str = "normale",
    dest_ruolo: str = "tutti",
    scadenza: str = None,
) -> int:
    """Crea una comunicazione in bacheca. Ritorna l'ID."""
    conn = get_notifiche_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO comunicazioni (autore, titolo, messaggio, urgenza, dest_ruolo, scadenza)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (autore, titolo, messaggio, urgenza, dest_ruolo, scadenza))
    conn.commit()
    cid = cur.lastrowid
    conn.close()
    return cid


def get_comunicazioni_attive(ruolo: str, username: str) -> list:
    """
    Recupera le comunicazioni attive visibili per un ruolo.
    Include flag 'letta' per l'utente corrente.
    """
    conn = get_notifiche_conn()
    rows = conn.execute("""
        SELECT c.id, c.autore, c.titolo, c.messaggio, c.urgenza,
               c.dest_ruolo, c.scadenza, c.created_at, c.updated_at,
               CASE WHEN cl.id IS NOT NULL THEN 1 ELSE 0 END AS letta
        FROM comunicazioni c
        LEFT JOIN comunicazioni_lettura cl ON cl.comunicazione_id = c.id AND cl.username = ?
        WHERE c.attiva = 1
          AND COALESCE(c.tipo, 'bacheca') = 'bacheca'
          AND (c.dest_ruolo = 'tutti' OR c.dest_ruolo = ?)
          AND (c.scadenza IS NULL OR c.scadenza >= date('now','localtime'))
        ORDER BY c.urgenza = 'urgente' DESC, c.created_at DESC
    """, (username, ruolo)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_tutte_comunicazioni(limit: int = 100) -> list:
    """Recupera tutte le comunicazioni (per admin, anche archiviate)."""
    conn = get_notifiche_conn()
    rows = conn.execute("""
        SELECT id, autore, titolo, messaggio, urgenza, dest_ruolo,
               scadenza, attiva, created_at, updated_at
        FROM comunicazioni
        WHERE COALESCE(tipo, 'bacheca') = 'bacheca'
        ORDER BY created_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def segna_comunicazione_letta(comunicazione_id: int, username: str) -> bool:
    """Segna una comunicazione come letta."""
    conn = get_notifiche_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO comunicazioni_lettura (comunicazione_id, username) VALUES (?, ?)",
            (comunicazione_id, username)
        )
        conn.commit()
        conn.close()
        return True
    except Exception:
        conn.close()
        return False


def aggiorna_comunicazione(com_id: int, titolo: str = None, messaggio: str = None,
                           urgenza: str = None, dest_ruolo: str = None,
                           scadenza: str = None, attiva: int = None) -> bool:
    """Aggiorna campi di una comunicazione esistente."""
    conn = get_notifiche_conn()
    fields = []
    values = []
    if titolo is not None:
        fields.append("titolo = ?"); values.append(titolo)
    if messaggio is not None:
        fields.append("messaggio = ?"); values.append(messaggio)
    if urgenza is not None:
        fields.append("urgenza = ?"); values.append(urgenza)
    if dest_ruolo is not None:
        fields.append("dest_ruolo = ?"); values.append(dest_ruolo)
    if scadenza is not None:
        fields.append("scadenza = ?"); values.append(scadenza)
    if attiva is not None:
        fields.append("attiva = ?"); values.append(attiva)

    if not fields:
        conn.close()
        return False

    values.append(com_id)
    cur = conn.execute(
        f"UPDATE comunicazioni SET {', '.join(fields)} WHERE id = ?",
        values
    )
    conn.commit()
    updated = cur.rowcount > 0
    conn.close()
    return updated


def elimina_comunicazione(com_id: int) -> bool:
    """Elimina una comunicazione (cascade su letture)."""
    conn = get_notifiche_conn()
    cur = conn.execute("DELETE FROM comunicazioni WHERE id = ?", (com_id,))
    conn.commit()
    deleted = cur.rowcount > 0
    conn.close()
    return deleted


def conta_comunicazioni_non_lette(username: str, ruolo: str) -> int:
    """Conta le comunicazioni attive non lette per un utente."""
    conn = get_notifiche_conn()
    row = conn.execute("""
        SELECT COUNT(*) as cnt
        FROM comunicazioni c
        LEFT JOIN comunicazioni_lettura cl ON cl.comunicazione_id = c.id AND cl.username = ?
        WHERE c.attiva = 1
          AND COALESCE(c.tipo, 'bacheca') = 'bacheca'
          AND (c.dest_ruolo = 'tutti' OR c.dest_ruolo = ?)
          AND (c.scadenza IS NULL OR c.scadenza >= date('now','localtime'))
          AND cl.id IS NULL
    """, (username, ruolo)).fetchone()
    conn.close()
    return row["cnt"] if row else 0


# ─────────────────────────────────────────────
# NOTA DI SERVIZIO (Lavagna — Home)
# ─────────────────────────────────────────────
# Riga volante scritta dalla Home in un campo solo. Vive un turno e sparisce.
# Vive nella stessa tabella `comunicazioni` con tipo='nota_servizio', cosi'
# non serve una tabella nuova e le note restano consultabili a posteriori.
# Tutte le query della bacheca classica filtrano tipo='bacheca'.

def get_nota_servizio(data_rif: str, turno: str) -> dict | None:
    """Nota di servizio attiva per (data, turno). None se non c'e'."""
    conn = get_notifiche_conn()
    row = conn.execute("""
        SELECT id, autore, messaggio, created_at
        FROM comunicazioni
        WHERE tipo = 'nota_servizio'
          AND attiva = 1
          AND data_riferimento = ?
          AND turno = ?
        ORDER BY id DESC
        LIMIT 1
    """, (data_rif, turno)).fetchone()
    conn.close()
    return dict(row) if row else None


def set_nota_servizio(autore: str, messaggio: str, data_rif: str, turno: str) -> int:
    """
    Scrive la nota del turno. Se ce n'e' gia' una la archivia (attiva=0)
    invece di sovrascriverla: lo storico resta.
    """
    conn = get_notifiche_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE comunicazioni SET attiva = 0
        WHERE tipo = 'nota_servizio' AND attiva = 1
          AND data_riferimento = ? AND turno = ?
    """, (data_rif, turno))
    cur.execute("""
        INSERT INTO comunicazioni
            (autore, titolo, messaggio, urgenza, dest_ruolo, scadenza,
             tipo, data_riferimento, turno)
        VALUES (?, ?, ?, 'normale', 'tutti', ?, 'nota_servizio', ?, ?)
    """, (autore, f"Nota {turno} {data_rif}", messaggio, data_rif, data_rif, turno))
    conn.commit()
    nid = cur.lastrowid
    conn.close()
    return nid


def elimina_nota_servizio(data_rif: str, turno: str) -> bool:
    """Toglie la nota dalla Lavagna (archivia, non cancella)."""
    conn = get_notifiche_conn()
    cur = conn.execute("""
        UPDATE comunicazioni SET attiva = 0
        WHERE tipo = 'nota_servizio' AND attiva = 1
          AND data_riferimento = ? AND turno = ?
    """, (data_rif, turno))
    conn.commit()
    changed = cur.rowcount > 0
    conn.close()
    return changed
