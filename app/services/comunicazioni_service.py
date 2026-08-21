# @version: v1.0-comunicazioni
# -*- coding: utf-8 -*-
# Modulo: comunicazioni
# Classificazione: [core]
"""
Servizio Comunicazioni — anagrafica iscritti, consensi, destinatari.

È l'unico punto del sistema autorizzato a cambiare `comm_contatti.stato_email`
e `stato_wa`. Router e script di travaso passano da qui, non scrivono a mano:
è così che si garantisce che ogni cambio di stato lasci una riga in
`comm_consensi_log`, che è la prova da esibire se qualcuno contesta.

LA REGOLA CHE QUESTO FILE ESISTE PER FAR RISPETTARE
----------------------------------------------------
Da 'disiscritto' o 'soppresso' non si torna indietro per effetto collaterale.
Un import, una sincronizzazione dal CRM, un merge di duplicati NON riaprono il
canale. Solo `iscrivi()` con una fonte di consenso esplicita lo fa, e va
chiamata da un'azione della persona — non da un batch.

`sync_anagrafica_da_crm()` sovrascrive nome/cognome/telefono e basta. Se un
domani qualcuno ci aggiunge lo stato, ha rotto il modulo: c'è un test che
verifica esattamente questo.

DIPENDENZA OPZIONALE DAL MODULO CLIENTI
----------------------------------------
Il modulo è vendibile senza CRM. `_crm_conn()` restituisce None se
`clienti.sqlite3` non esiste, e tutte le funzioni di sync degradano a no-op
invece di esplodere. Nessun import da `app.routers.clienti_router` (regola 2
della disciplina modulare): si legge il DB, non il modulo.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import sqlite3
from typing import Any, Dict, List, Optional

from app.models.comm_db import get_comm_conn, get_impostazione
from app.utils.locale_data import locale_data_path

logger = logging.getLogger("trgb.comunicazioni")

# Stati che non si riaprono da soli. Vedi testa del file.
STATI_CHIUSI = ("disiscritto", "soppresso")

# Fonti che rappresentano un consenso davvero espresso dalla persona.
# 'import_mailchimp' NON è qui: un travaso non è un consenso, eredita quello
# che c'era prima e lo dichiara come tale nel log.
FONTI_CONSENSO_ESPLICITO = ("form_sito", "qr_tavolo", "prenotazione", "manuale")


# ══════════════════════════════════════════════════════════════════
#  Utility
# ══════════════════════════════════════════════════════════════════

def norm_email(email: Optional[str]) -> Optional[str]:
    """Forma canonica di un indirizzo. Deve combaciare con l'indice UNIQUE."""
    if not email:
        return None
    e = email.strip().lower()
    return e or None


def genera_token() -> str:
    """Token del link di disiscrizione: non indovinabile, non parlante."""
    return secrets.token_urlsafe(24)


def _crm_conn() -> Optional[sqlite3.Connection]:
    """
    Connessione in sola lettura a clienti.sqlite3.
    None se il locale non ha il modulo Clienti: il modulo comunicazioni
    deve funzionare comunque.
    """
    try:
        path = locale_data_path("clienti.sqlite3")
    except Exception:
        return None
    if not path or not os.path.exists(path):
        return None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=15)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as exc:
        logger.warning("comunicazioni: CRM non leggibile (%s)", exc)
        return None


def _log_consenso(
    cur,
    contatto_id: int,
    canale: str,
    stato_prima: Optional[str],
    stato_dopo: str,
    motivo: Optional[str] = None,
    fonte: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    attore: Optional[str] = None,
    dettagli: Optional[dict] = None,
) -> None:
    cur.execute(
        """INSERT INTO comm_consensi_log
           (contatto_id, canale, stato_prima, stato_dopo, motivo, fonte,
            ip, user_agent, attore, dettagli)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (contatto_id, canale, stato_prima, stato_dopo, motivo, fonte,
         ip, user_agent, attore, json.dumps(dettagli, ensure_ascii=False) if dettagli else None),
    )


# ══════════════════════════════════════════════════════════════════
#  Lettura
# ══════════════════════════════════════════════════════════════════

def trova_per_email(email: str, conn: Optional[sqlite3.Connection] = None) -> Optional[sqlite3.Row]:
    e = norm_email(email)
    if not e:
        return None
    own = conn is None
    conn = conn or get_comm_conn()
    try:
        return conn.execute(
            "SELECT * FROM comm_contatti WHERE lower(trim(email)) = ?", (e,)
        ).fetchone()
    finally:
        if own:
            conn.close()


def trova_per_token(token: str) -> Optional[sqlite3.Row]:
    if not token:
        return None
    conn = get_comm_conn()
    try:
        return conn.execute(
            "SELECT * FROM comm_contatti WHERE unsub_token = ?", (token,)
        ).fetchone()
    finally:
        conn.close()


def stato_lista() -> Dict[str, Any]:
    """Numeri della lista, per la dashboard del modulo."""
    conn = get_comm_conn()
    try:
        out: Dict[str, Any] = {"email": {}, "wa": {}}
        for canale, campo in (("email", "stato_email"), ("wa", "stato_wa")):
            for row in conn.execute(f"SELECT {campo} AS s, COUNT(*) AS n FROM comm_contatti GROUP BY 1"):
                out[canale][row["s"]] = row["n"]
        out["totale"] = conn.execute("SELECT COUNT(*) FROM comm_contatti").fetchone()[0]
        out["agganciati_crm"] = conn.execute(
            "SELECT COUNT(*) FROM comm_contatti WHERE cliente_id IS NOT NULL"
        ).fetchone()[0]
        out["con_telefono"] = conn.execute(
            "SELECT COUNT(*) FROM comm_contatti WHERE telefono IS NOT NULL AND trim(telefono) != ''"
        ).fetchone()[0]
        return out
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════
#  Scrittura degli stati — passa tutto da qui
# ══════════════════════════════════════════════════════════════════

def crea_contatto(
    email: Optional[str] = None,
    telefono: Optional[str] = None,
    nome: Optional[str] = None,
    cognome: Optional[str] = None,
    cliente_id: Optional[int] = None,
    origine: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> int:
    """
    Crea un contatto SENZA consenso su nessun canale ('mai_iscritto').
    Esistere in lista e voler essere contattati sono due cose diverse.
    """
    own = conn is None
    conn = conn or get_comm_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO comm_contatti
               (cliente_id, email, telefono, nome, cognome, unsub_token, origine)
               VALUES (?,?,?,?,?,?,?)""",
            (cliente_id, norm_email(email), (telefono or None), nome, cognome,
             genera_token(), origine),
        )
        if own:
            conn.commit()
        return cur.lastrowid
    finally:
        if own:
            conn.close()


def iscrivi(
    contatto_id: int,
    canale: str = "email",
    fonte: str = "manuale",
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    attore: Optional[str] = None,
    forza_riapertura: bool = False,
    conn: Optional[sqlite3.Connection] = None,
) -> Dict[str, Any]:
    """
    Apre un canale.

    Se il contatto era 'disiscritto' o 'soppresso' NON lo riapre, a meno che
    la fonte sia un consenso esplicito della persona (`FONTI_CONSENSO_ESPLICITO`)
    e `forza_riapertura=True`. Torna sempre un esito parlante invece di
    sollevare: il chiamante tipico è un batch che deve poter contare gli scarti.
    """
    campo = "stato_email" if canale == "email" else "stato_wa"
    own = conn is None
    conn = conn or get_comm_conn()
    try:
        cur = conn.cursor()
        row = cur.execute(f"SELECT id, {campo} AS stato FROM comm_contatti WHERE id = ?",
                          (contatto_id,)).fetchone()
        if not row:
            return {"ok": False, "motivo": "contatto_inesistente"}

        prima = row["stato"]
        if prima == "iscritto":
            return {"ok": True, "cambiato": False, "stato": "iscritto"}

        if prima in STATI_CHIUSI:
            consenso_vero = fonte in FONTI_CONSENSO_ESPLICITO and forza_riapertura
            if not consenso_vero:
                # Il caso che protegge i 42 clienti col flag sbagliato nel CRM.
                logger.info("comunicazioni: riapertura rifiutata per contatto %s (era %s, fonte %s)",
                            contatto_id, prima, fonte)
                return {"ok": False, "cambiato": False, "stato": prima,
                        "motivo": "stato_chiuso_non_riapribile"}

        if canale == "email":
            cur.execute(
                """UPDATE comm_contatti
                   SET stato_email = 'iscritto',
                       consenso_email_data = datetime('now','localtime'),
                       consenso_email_fonte = ?,
                       consenso_email_ip = ?,
                       motivo_stop_email = NULL,
                       data_stop_email = NULL
                   WHERE id = ?""",
                (fonte, ip, contatto_id),
            )
        else:
            cur.execute(
                """UPDATE comm_contatti
                   SET stato_wa = 'iscritto',
                       consenso_wa_data = datetime('now','localtime'),
                       consenso_wa_fonte = ?
                   WHERE id = ?""",
                (fonte, contatto_id),
            )
        _log_consenso(cur, contatto_id, canale, prima, "iscritto",
                      motivo="riapertura" if prima in STATI_CHIUSI else None,
                      fonte=fonte, ip=ip, user_agent=user_agent, attore=attore)
        if own:
            conn.commit()
        return {"ok": True, "cambiato": True, "stato": "iscritto", "stato_prima": prima}
    finally:
        if own:
            conn.close()


def chiudi_canale(
    contatto_id: int,
    nuovo_stato: str,
    canale: str = "email",
    motivo: Optional[str] = None,
    fonte: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    attore: Optional[str] = None,
    dettagli: Optional[dict] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> Dict[str, Any]:
    """
    Chiude un canale: 'disiscritto' (l'ha deciso la persona) o
    'soppresso' (l'ha deciso il sistema: rimbalzo duro, segnalazione spam,
    import di una lista di soppressione).

    Chiudere è sempre permesso, anche su chi era già chiuso: nel dubbio non si
    scrive a nessuno. Il log tiene traccia di ogni passaggio.
    """
    if nuovo_stato not in STATI_CHIUSI:
        raise ValueError(f"chiudi_canale accetta {STATI_CHIUSI}, ricevuto {nuovo_stato!r}")

    campo = "stato_email" if canale == "email" else "stato_wa"
    own = conn is None
    conn = conn or get_comm_conn()
    try:
        cur = conn.cursor()
        row = cur.execute(f"SELECT {campo} AS stato FROM comm_contatti WHERE id = ?",
                          (contatto_id,)).fetchone()
        if not row:
            return {"ok": False, "motivo": "contatto_inesistente"}
        prima = row["stato"]

        if canale == "email":
            cur.execute(
                """UPDATE comm_contatti
                   SET stato_email = ?, motivo_stop_email = ?,
                       data_stop_email = datetime('now','localtime')
                   WHERE id = ?""",
                (nuovo_stato, motivo, contatto_id),
            )
        else:
            cur.execute("UPDATE comm_contatti SET stato_wa = ? WHERE id = ?",
                        (nuovo_stato, contatto_id))

        _log_consenso(cur, contatto_id, canale, prima, nuovo_stato,
                      motivo=motivo, fonte=fonte, ip=ip, user_agent=user_agent,
                      attore=attore, dettagli=dettagli)
        if own:
            conn.commit()
        return {"ok": True, "cambiato": prima != nuovo_stato,
                "stato": nuovo_stato, "stato_prima": prima}
    finally:
        if own:
            conn.close()


def disiscrivi_da_token(token: str, ip: Optional[str] = None,
                        user_agent: Optional[str] = None) -> Dict[str, Any]:
    """
    Disiscrizione da link pubblico. Un click, nessuna conferma, nessun login:
    chiedere di autenticarsi per smettere di ricevere è il modo più veloce per
    farsi segnalare come spam invece che come noiosi.
    """
    row = trova_per_token(token)
    if not row:
        return {"ok": False, "motivo": "token_non_valido"}
    esito = chiudi_canale(row["id"], "disiscritto", canale="email",
                          motivo="unsubscribe", fonte="link_pubblico",
                          ip=ip, user_agent=user_agent)
    esito["email"] = row["email"]
    return esito


# ══════════════════════════════════════════════════════════════════
#  Sincronizzazione con il CRM (dipendenza opzionale)
# ══════════════════════════════════════════════════════════════════

def sync_anagrafica_da_crm(solo_contatto_id: Optional[int] = None) -> Dict[str, int]:
    """
    Riallinea nome, cognome e telefono dai dati del CRM.

    NON tocca gli stati. Mai. È la funzione che, se qualcuno ci aggiunge
    l'allineamento di `stato_email`, riporta il bug dei 42 fantasma.
    """
    crm = _crm_conn()
    if crm is None:
        return {"aggiornati": 0, "saltati": 0, "crm": 0}

    conn = get_comm_conn()
    try:
        cur = conn.cursor()
        where = "WHERE cliente_id IS NOT NULL"
        params: List[Any] = []
        if solo_contatto_id:
            where += " AND id = ?"
            params.append(solo_contatto_id)

        aggiornati = 0
        for row in cur.execute(f"SELECT id, cliente_id FROM comm_contatti {where}", params).fetchall():
            c = crm.execute(
                "SELECT nome, cognome, telefono FROM clienti WHERE id = ?", (row["cliente_id"],)
            ).fetchone()
            if not c:
                continue
            cur.execute(
                """UPDATE comm_contatti SET nome = ?, cognome = ?, telefono = ?
                   WHERE id = ?""",
                (c["nome"], c["cognome"], c["telefono"], row["id"]),
            )
            aggiornati += 1
        conn.commit()
        return {"aggiornati": aggiornati}
    finally:
        conn.close()
        crm.close()


def aggancia_clienti_per_email() -> Dict[str, int]:
    """
    Riempie `cliente_id` sui contatti orfani che nel frattempo sono diventati
    clienti (hanno prenotato dopo essersi iscritti alla newsletter).
    """
    crm = _crm_conn()
    if crm is None:
        return {"agganciati": 0}

    idx = {
        (r["e"] or ""): r["id"]
        for r in crm.execute(
            "SELECT lower(trim(email)) AS e, id FROM clienti "
            "WHERE email IS NOT NULL AND trim(email) != ''"
        )
    }
    conn = get_comm_conn()
    try:
        cur = conn.cursor()
        n = 0
        for row in cur.execute(
            "SELECT id, lower(trim(email)) AS e FROM comm_contatti "
            "WHERE cliente_id IS NULL AND email IS NOT NULL"
        ).fetchall():
            cid = idx.get(row["e"])
            if cid:
                cur.execute("UPDATE comm_contatti SET cliente_id = ? WHERE id = ?", (cid, row["id"]))
                n += 1
        conn.commit()
        return {"agganciati": n}
    finally:
        conn.close()
        crm.close()


def specchia_flag_newsletter_su_crm(dry_run: bool = True) -> Dict[str, int]:
    """
    Riporta `clienti.newsletter` in accordo con `comm_contatti.stato_email`.

    Direzione unica: comunicazioni → clienti. Il flag sulla scheda cliente
    diventa una spia, non un interruttore. Al 2026-08-14 sono 5.481 righe da
    accendere e 42 da spegnere (quelle sono le importanti).

    ATTENZIONE — copertura parziale. Tocca solo i clienti che hanno un contatto
    nel modulo. Chi ha il flag a 1 nel CRM ma non è mai entrato in lista resta
    acceso e continua a non voler dire niente: al 2026-08-14 sono 2.582 casi
    (241 con email, 2.341 senza). Il conteggio è restituito in
    `crm_flag1_fuori_modulo` invece di essere ignorato in silenzio: finché non è
    zero, `clienti.newsletter` non è uno specchio fedele.

    dry_run=True di default: si guarda cosa cambierebbe prima di cambiarlo.
    """
    try:
        path = locale_data_path("clienti.sqlite3")
    except Exception:
        return {"da_accendere": 0, "da_spegnere": 0, "applicato": 0}
    if not path or not os.path.exists(path):
        return {"da_accendere": 0, "da_spegnere": 0, "applicato": 0}

    conn = get_comm_conn()
    try:
        # Solo i contatti che HANNO un indirizzo. Chi non ce l'ha non partecipa
        # allo specchio: "non riceve perché non ha email" non è la stessa cosa
        # di "non riceve perché si è tolto", e spegnere il flag a chi aveva
        # acconsentito su TheFork cancellerebbe l'unica traccia di quel consenso.
        voluti = {
            r["cliente_id"]: (1 if r["stato_email"] == "iscritto" else 0)
            for r in conn.execute(
                """SELECT cliente_id, stato_email FROM comm_contatti
                   WHERE cliente_id IS NOT NULL
                     AND email IS NOT NULL AND trim(email) != ''"""
            )
        }
    finally:
        conn.close()

    crm = sqlite3.connect(path, timeout=30)
    crm.row_factory = sqlite3.Row
    crm.execute("PRAGMA busy_timeout=30000")
    try:
        attuali = {r["id"]: r["newsletter"] for r in crm.execute("SELECT id, newsletter FROM clienti")}
        da_accendere = [i for i, v in voluti.items() if v == 1 and attuali.get(i) == 0]
        da_spegnere = [i for i, v in voluti.items() if v == 0 and attuali.get(i) == 1]

        if not dry_run:
            cur = crm.cursor()
            for gruppo, val in ((da_accendere, 1), (da_spegnere, 0)):
                for i in range(0, len(gruppo), 500):
                    blocco = gruppo[i:i + 500]
                    cur.execute(
                        f"UPDATE clienti SET newsletter = ? WHERE id IN ({','.join('?' * len(blocco))})",
                        [val] + blocco,
                    )
            crm.commit()

        # Clienti col flag acceso che il modulo non conosce: il residuo di
        # ambiguità che questa funzione da sola non può risolvere.
        fuori = sum(1 for i, v in attuali.items() if v == 1 and i not in voluti)

        return {
            "da_accendere": len(da_accendere),
            "da_spegnere": len(da_spegnere),
            "applicato": 0 if dry_run else len(da_accendere) + len(da_spegnere),
            "crm_flag1_fuori_modulo": fuori,
        }
    finally:
        crm.close()


# ══════════════════════════════════════════════════════════════════
#  Destinatari
# ══════════════════════════════════════════════════════════════════

def risolvi_destinatari(filtro: Optional[dict] = None, canale: str = "email") -> List[sqlite3.Row]:
    """
    Chi riceve una campagna. Risolto al momento dell'invio, non congelato in
    bozza: se qualcuno si disiscrive fra la scrittura e la partenza, non deve
    ricevere.

    Filtri: {"solo_clienti": bool, "citta": str, "iscritti_dopo": "YYYY-MM-DD"}
    Lo stato del canale non è filtrabile: i non iscritti non sono mai inclusi.
    """
    filtro = filtro or {}
    campo = "stato_email" if canale == "email" else "stato_wa"
    dove = [f"{campo} = 'iscritto'"]
    params: List[Any] = []

    if canale == "email":
        dove.append("email IS NOT NULL AND trim(email) != ''")
    else:
        dove.append("telefono IS NOT NULL AND trim(telefono) != ''")

    if filtro.get("solo_clienti"):
        dove.append("cliente_id IS NOT NULL")
    if filtro.get("iscritti_dopo"):
        dove.append("date(consenso_email_data) >= date(?)")
        params.append(filtro["iscritti_dopo"])

    conn = get_comm_conn()
    try:
        return conn.execute(
            f"""SELECT id, cliente_id, email, telefono, nome, cognome, unsub_token
                FROM comm_contatti
                WHERE {' AND '.join(dove)}
                ORDER BY cliente_id DESC NULLS LAST, id DESC""",
            params,
        ).fetchall()
    finally:
        conn.close()


def dimensione_scaglione() -> int:
    try:
        return max(1, int(get_impostazione("scaglione_dimensione", "500")))
    except (TypeError, ValueError):
        return 500
