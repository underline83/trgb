#!/usr/bin/env python3
# Modulo: cucina
# @version: v1.0 — registro produzioni: numero del giorno, numero persona, codice lotto (2026-11-26)
# -*- coding: utf-8 -*-
"""
Produzioni e codice lotto — modulo cucina. Doc: docs/modulo_produzioni_lotto.md

Regole decise da Marco il 2026-11-26:
· il codice lotto dice data, persona e numero produzione (calcolo: `cucina_lotto_codice`);
· il numero produzione e' il progressivo del giorno su tutta la cucina, 2 cifre;
· le persone sono gli utenti di TRGB che aprono la pagina; il numero di ognuna lo
  assegna TRGB la prima volta e non si riusa;
· registrano e leggono: admin, chef, sous chef, commis (matrice Moduli, ricette/produzioni).

Cose che NON si possono correggere dopo: data, persona, numero. Stanno dentro al
codice, e il codice puo' essere gia' su un barattolo. Se sono sbagliate la
produzione si annulla e se ne registra un'altra.
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.services import cucina_lotto_codice as lc

MODULO, SUB = "ricette", "produzioni"   # dove sta nella matrice Moduli («Gestione Cucina»)
NOME_MAX = 80                           # caratteri: oltre non sta sull'etichetta 90×29
TENTATIVI = 5                           # due telefoni che registrano nello stesso istante


class ProduzioneErrore(ValueError):
    """Dato non accettabile: il messaggio e' gia' scritto per chi sta in cucina."""


def _ora() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _data(testo: Optional[str], cosa: str) -> Optional[date]:
    if not testo:
        return None
    try:
        return date.fromisoformat(str(testo)[:10])
    except ValueError:
        raise ProduzioneErrore(f"{cosa}: data non valida.")


# ─────────────────────────────────────────────────────────────
# Persone
# ─────────────────────────────────────────────────────────────

def persone_possibili() -> List[Dict[str, Any]]:
    """Gli utenti di TRGB che possono comparire in «Chi l'ha prodotto»: quelli il cui
    ruolo apre la pagina. Platform → platform (utenti e matrice)."""
    from app.services.auth_service import list_users
    from app.services.permessi import ruoli_sotto_modulo

    ruoli = ruoli_sotto_modulo(MODULO, SUB)
    out = [
        {"username": u["username"], "nome": u.get("display_name") or u["username"].capitalize()}
        for u in list_users() if u.get("role") in ruoli
    ]
    return sorted(out, key=lambda p: p["nome"].lower())


def numero_persona(conn: sqlite3.Connection, username: str, nome: Optional[str] = None) -> int:
    """Il numero della persona dentro ai codici. Se non ce l'ha, il primo mai usato."""
    r = conn.execute("SELECT numero FROM cucina_produzioni_persone WHERE username = ?", (username,)).fetchone()
    if r:
        if nome:
            conn.execute("UPDATE cucina_produzioni_persone SET nome = ? WHERE numero = ?", (nome, r[0]))
        return int(r[0])
    nuovo = int(conn.execute("SELECT COALESCE(MAX(numero), 0) + 1 FROM cucina_produzioni_persone").fetchone()[0])
    if nuovo > lc.PERSONE_MAX:
        raise ProduzioneErrore(
            f"Il codice lotto regge {lc.PERSONE_MAX} persone e sono finite: serve il formato a 7 caratteri."
        )
    conn.execute(
        "INSERT INTO cucina_produzioni_persone (numero, username, nome) VALUES (?, ?, ?)",
        (nuovo, username, nome or username),
    )
    return nuovo


# ─────────────────────────────────────────────────────────────
# Registro
# ─────────────────────────────────────────────────────────────

_SELECT = """
    SELECT p.id, p.codice, p.data, p.numero, p.persona_numero, p.nome, p.recipe_id,
           p.data_scadenza, p.etichette, p.note, p.creato_da, p.creato_at,
           p.annullata_at, p.annullata_da,
           pe.username AS persona_username, pe.nome AS persona_nome
      FROM cucina_produzioni p
      LEFT JOIN cucina_produzioni_persone pe ON pe.numero = p.persona_numero
"""


def _riga(r: sqlite3.Row | tuple, colonne: List[str]) -> Dict[str, Any]:
    d = dict(zip(colonne, r))
    d["annullata"] = bool(d.get("annullata_at"))
    return d


def _leggi(conn: sqlite3.Connection, dove: str, parametri: tuple) -> List[Dict[str, Any]]:
    cur = conn.execute(_SELECT + dove, parametri)
    colonne = [c[0] for c in cur.description]
    return [_riga(tuple(r), colonne) for r in cur.fetchall()]


def una(conn: sqlite3.Connection, prod_id: int) -> Dict[str, Any]:
    righe = _leggi(conn, " WHERE p.id = ?", (prod_id,))
    if not righe:
        raise ProduzioneErrore("Produzione non trovata.")
    return righe[0]


def elenco(conn: sqlite3.Connection, dal: date, al: Optional[date] = None) -> List[Dict[str, Any]]:
    al = al or date.today()
    return _leggi(
        conn, " WHERE p.data BETWEEN ? AND ? ORDER BY p.data DESC, p.numero DESC",
        (dal.isoformat(), al.isoformat()),
    )


def prossimo_numero(conn: sqlite3.Connection, giorno: date) -> int:
    n = int(conn.execute(
        "SELECT COALESCE(MAX(numero), 0) + 1 FROM cucina_produzioni WHERE data = ?", (giorno.isoformat(),)
    ).fetchone()[0])
    if n >= lc.PRODUZIONI_MAX:
        raise ProduzioneErrore(
            f"Per il {giorno.strftime('%d/%m/%Y')} i numeri produzione sono finiti (arrivano a {lc.PRODUZIONI_MAX - 1})."
        )
    return n


def _nome(nome: Optional[str]) -> str:
    n = " ".join((nome or "").split())
    if not n:
        raise ProduzioneErrore("Scrivi cosa hai prodotto.")
    if len(n) > NOME_MAX:
        raise ProduzioneErrore(f"Il nome e' troppo lungo per l'etichetta (massimo {NOME_MAX} caratteri).")
    return n


def registra(
    conn: sqlite3.Connection, *, nome: str, persona: str, utente: str,
    data: Optional[str] = None, data_scadenza: Optional[str] = None,
    etichette: int = 1, recipe_id: Optional[int] = None, note: Optional[str] = None,
    oggi: Optional[date] = None,
) -> Dict[str, Any]:
    """Registra una produzione e le da' il codice lotto. Il commit lo fa chi chiama."""
    oggi = oggi or date.today()
    nome = _nome(nome)
    giorno = _data(data, "Data di produzione") or oggi
    if giorno > oggi:
        raise ProduzioneErrore("La data di produzione non puo' essere nel futuro.")
    scadenza = _data(data_scadenza, "Scadenza")
    if scadenza and scadenza < giorno:
        raise ProduzioneErrore("La scadenza viene prima della data di produzione.")
    if int(etichette) < 1:
        raise ProduzioneErrore("Serve almeno un'etichetta.")

    possibili = {p["username"]: p["nome"] for p in persone_possibili()}
    if persona not in possibili:
        raise ProduzioneErrore("Scegli chi l'ha prodotto fra le persone della cucina.")

    ultimo: Exception | None = None
    for _ in range(TENTATIVI):
        try:
            num_persona = numero_persona(conn, persona, possibili[persona])
            numero = prossimo_numero(conn, giorno)
            codice = lc.genera(giorno, num_persona, numero)
            cur = conn.execute(
                """INSERT INTO cucina_produzioni
                   (codice, data, numero, persona_numero, nome, recipe_id, data_scadenza, etichette, note, creato_da)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (codice, giorno.isoformat(), numero, num_persona, nome, recipe_id,
                 scadenza.isoformat() if scadenza else None, int(etichette), (note or "").strip() or None, utente),
            )
            return una(conn, cur.lastrowid)
        except sqlite3.IntegrityError as e:   # un altro ha preso lo stesso numero: si riprova
            ultimo = e
        except lc.CodiceLottoErrore as e:
            raise ProduzioneErrore(str(e))
    raise ProduzioneErrore(f"Non sono riuscito a registrare la produzione, riprova. ({ultimo})")


def correggi(
    conn: sqlite3.Connection, prod_id: int, *, utente: str,
    nome: Optional[str] = None, data_scadenza: Optional[str] = None,
    togli_scadenza: bool = False, etichette: Optional[int] = None, note: Optional[str] = None,
) -> Dict[str, Any]:
    """Corregge cio' che NON sta nel codice: nome, scadenza, numero di etichette, nota."""
    p = una(conn, prod_id)
    if p["annullata"]:
        raise ProduzioneErrore("Questa produzione e' annullata.")
    campi: Dict[str, Any] = {}
    if nome is not None:
        campi["nome"] = _nome(nome)
        campi["recipe_id"] = p["recipe_id"] if campi["nome"] == p["nome"] else None
    if togli_scadenza:
        campi["data_scadenza"] = None
    elif data_scadenza is not None:
        s = _data(data_scadenza, "Scadenza")
        if s and s < date.fromisoformat(p["data"]):
            raise ProduzioneErrore("La scadenza viene prima della data di produzione.")
        campi["data_scadenza"] = s.isoformat() if s else None
    if etichette is not None:
        if int(etichette) < 1:
            raise ProduzioneErrore("Serve almeno un'etichetta.")
        campi["etichette"] = int(etichette)
    if note is not None:
        campi["note"] = note.strip() or None
    if campi:
        campi["aggiornato_at"] = _ora()
        conn.execute(
            f"UPDATE cucina_produzioni SET {', '.join(k + ' = ?' for k in campi)} WHERE id = ?",
            (*campi.values(), prod_id),
        )
    return una(conn, prod_id)


def annulla(conn: sqlite3.Connection, prod_id: int, utente: str) -> Dict[str, Any]:
    """La produzione resta nel registro, col suo codice e il suo numero, segnata annullata."""
    p = una(conn, prod_id)
    if not p["annullata"]:
        conn.execute(
            "UPDATE cucina_produzioni SET annullata_at = ?, annullata_da = ? WHERE id = ?",
            (_ora(), utente, prod_id),
        )
    return una(conn, prod_id)


# ─────────────────────────────────────────────────────────────
# Leggi un codice
# ─────────────────────────────────────────────────────────────

def leggi_codice(conn: sqlite3.Connection, codice: str) -> Dict[str, Any]:
    """Da un codice a cosa, quando, chi, numero.

    Prima il registro (vale anche se la chiave fosse andata persa), poi il calcolo.
    Un codice valido ma non a registro e' possibile (registro ripristinato da un
    backup piu' vecchio): si dice cio' che il codice contiene, e che a registro non c'e'.
    """
    pulito = lc.pulisci(codice)
    if not pulito:
        raise ProduzioneErrore("Scrivi il codice che c'e' sull'etichetta.")
    righe = _leggi(conn, " WHERE p.codice = ?", (pulito,))
    if righe:
        return {**righe[0], "a_registro": True}
    try:
        lotto = lc.leggi(pulito)
    except lc.CodiceLottoErrore as e:
        raise ProduzioneErrore(str(e))
    pe = conn.execute(
        "SELECT username, nome FROM cucina_produzioni_persone WHERE numero = ?", (lotto.persona,)
    ).fetchone()
    return {
        "a_registro": False, "codice": pulito, "data": lotto.data.isoformat(),
        "numero": lotto.produzione, "persona_numero": lotto.persona,
        "persona_username": pe[0] if pe else None, "persona_nome": pe[1] if pe else None,
        "nome": None, "annullata": False,
    }


# ─────────────────────────────────────────────────────────────
# «Cosa hai prodotto»: suggerimenti mentre si scrive
# ─────────────────────────────────────────────────────────────

def suggerimenti(conn: sqlite3.Connection, q: str, limite: int = 8) -> List[Dict[str, Any]]:
    """Prima cio' che e' gia' stato prodotto con quel nome, poi le ricette attive.

    `recipes` e' del modulo ricette: sola lettura del nome, dipendenza opzionale (come
    `cucina_scorte` fa con `ingredients`). Se la tabella non c'e', restano i nomi gia' usati.
    """
    q = " ".join((q or "").split())
    if len(q) < 2:
        return []
    simile = f"%{q}%"
    out: List[Dict[str, Any]] = []
    visti: set = set()
    for nome, recipe_id in conn.execute(
        """SELECT nome, MAX(recipe_id) FROM cucina_produzioni
            WHERE nome LIKE ? AND annullata_at IS NULL
            GROUP BY nome ORDER BY MAX(creato_at) DESC LIMIT ?""", (simile, limite)):
        out.append({"nome": nome, "recipe_id": recipe_id, "origine": "gia_prodotto"})
        visti.add(nome.lower())
    try:
        for rid, nome in conn.execute(
            "SELECT id, name FROM recipes WHERE name LIKE ? AND COALESCE(is_active, 1) = 1 ORDER BY name LIMIT ?",
            (simile, limite)):
            if nome and nome.lower() not in visti:
                out.append({"nome": nome, "recipe_id": rid, "origine": "ricette"})
                visti.add(nome.lower())
    except sqlite3.Error:
        pass
    return out[:limite]
