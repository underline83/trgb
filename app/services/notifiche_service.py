# @version: v1.0-notifiche-service
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

from app.models.notifiche_db import get_notifiche_conn


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
    return nid


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
          AND (c.dest_ruolo = 'tutti' OR c.dest_ruolo = ?)
          AND (c.scadenza IS NULL OR c.scadenza >= date('now','localtime'))
          AND cl.id IS NULL
    """, (username, ruolo)).fetchone()
    conn.close()
    return row["cnt"] if row else 0
