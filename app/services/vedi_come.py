# @version: v1.0 — «Vedi come» del superadmin (2026-11-06)
# -*- coding: utf-8 -*-
"""
«Vedi come» — il superadmin vede e prova TRGB come lo vede un ragazzo, senza il suo PIN.

Modulo: platform (auth + M.G)
Classificazione: [core]

COME FUNZIONA (decisioni di Marco, 06/11/2026)
----------------------------------------------
- Lo usa SOLO il superadmin vero, con il suo pass normale: non Q (né dal browser
  né da MCP, che comunque non passa di qui), non da dentro un altro «Vedi come».
- Si sceglie una PERSONA (si prendono il suo ruolo e il suo dipendente: «I miei
  turni», mance ecc. mostrano i suoi dati) oppure un RUOLO «vuoto», senza dipendente.
- Il pass «come X» porta nel token `come` = {"u": username o None, "r": ruolo,
  "id": riga del registro}. get_current_user lo traduce: ruolo e dipendente di X,
  quindi menu, Home e permessi del BACKEND sono quelli di X (nessuna scorciatoia
  solo a schermo).
- SALVATAGGI PERMESSI, ma l'autore è sempre «marco (come Giulia)», mai Giulia:
  `username` del current_user è proprio quell'etichetta, così tutti i timbri
  autore esistenti (created_by, utente, autore…) la scrivono senza toccarli.
  Effetto voluto: le cose «per nome utente» (notifiche lette, to-do personali)
  restano quelle dell'etichetta, non toccano lo stato di Giulia.
- Durata: minuti da impostazione (`vedi_come_minuti` in auth_settings.json,
  default 60), non fissa nel codice. Il rinnovo del token non la allunga.
- Registro: tabella `vedi_come_registro` in accessi.sqlite3 — inizio, fine,
  come è finita (tornato / scaduto). Se il browser si chiude senza «Torna a me»
  resta la scadenza prevista.
"""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException

from app.core import security
from app.utils.locale_data import locale_data_path

DB_PATH = locale_data_path("accessi.sqlite3")
MINUTI_DEFAULT = 60
MINUTI_MAX = 24 * 60


# ------------------------------------------------------------
# IMPOSTAZIONE: durata (auth_settings.json, accanto al blocco PIN)
# ------------------------------------------------------------
def _settings_file():
    from app.services.auth_service import AUTH_SETTINGS_FILE
    return AUTH_SETTINGS_FILE


def _leggi_settings() -> dict:
    f = _settings_file()
    try:
        if f.exists():
            with open(f, "r", encoding="utf-8") as fh:
                d = json.load(fh)
                return d if isinstance(d, dict) else {}
    except Exception:
        pass
    return {}


def minuti() -> int:
    v = _leggi_settings().get("vedi_come_minuti")
    if isinstance(v, int) and 1 <= v <= MINUTI_MAX:
        return v
    return MINUTI_DEFAULT


def imposta_minuti(valore: int) -> int:
    if not isinstance(valore, int) or not (1 <= valore <= MINUTI_MAX):
        raise HTTPException(status_code=400, detail=f"Durata fra 1 e {MINUTI_MAX} minuti")
    d = _leggi_settings()  # conserva le altre chiavi (blocco PIN)
    d["vedi_come_minuti"] = valore
    f = _settings_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    with open(f, "w", encoding="utf-8") as fh:
        json.dump(d, fh, indent=2, ensure_ascii=False)
    return valore


# ------------------------------------------------------------
# REGISTRO
# ------------------------------------------------------------
def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("""
        CREATE TABLE IF NOT EXISTS vedi_come_registro (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            chi             TEXT NOT NULL,          -- il superadmin vero
            come_username   TEXT,                   -- NULL = ruolo «vuoto»
            come_nome       TEXT NOT NULL,          -- etichetta leggibile (Giulia / ruolo sala)
            come_ruolo      TEXT NOT NULL,
            dipendente_id   INTEGER,
            inizio          TEXT NOT NULL,          -- ora locale ISO
            scade           TEXT NOT NULL,
            fine            TEXT,
            esito           TEXT                    -- tornato | scaduto
        )
    """)
    return c


def _ora() -> datetime:
    return datetime.now().replace(microsecond=0)


def registro(limit: int = 30) -> list:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM vedi_come_registro ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["frase"] = frase(d)
        out.append(d)
    return out


def frase(r: dict) -> str:
    """«marco ha visto come Giulia dalle 14:02 alle 14:20»."""
    ini = r["inizio"][11:16]
    giorno = r["inizio"][:10]
    if r.get("fine"):
        coda = f"alle {r['fine'][11:16]}" + (" (scaduto)" if r.get("esito") == "scaduto" else "")
    elif r["scade"] <= _ora().isoformat():
        coda = f"alle {r['scade'][11:16]} (scaduto, finestra chiusa)"
    else:
        coda = "a ora (in corso)"
    return f"{giorno}: {r['chi']} ha visto come {r['come_nome']} dalle {ini} {coda}"


# ------------------------------------------------------------
# INIZIO / FINE
# ------------------------------------------------------------
def _verifica_superadmin_vero(user: Dict[str, Any]) -> str:
    from app.services.auth_service import Q_USERNAME, USERS
    if user.get("vedi_come"):
        raise HTTPException(status_code=403, detail="Sei già in «Vedi come»: prima torna a te")
    u = user.get("username")
    if u == Q_USERNAME or u not in USERS or USERS[u].get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="«Vedi come» è solo del superadmin")
    return u


def etichetta(chi: str, come_nome: str) -> str:
    return f"{chi} (come {come_nome})"


def inizia(user: Dict[str, Any], username: Optional[str], ruolo: Optional[str]) -> dict:
    from app.services.auth_service import USERS, VALID_ROLES
    chi = _verifica_superadmin_vero(user)
    if bool(username) == bool(ruolo):
        raise HTTPException(status_code=400, detail="Scegli una persona oppure un ruolo")
    if username:
        if username == chi:
            raise HTTPException(status_code=400, detail="Sei già tu")
        info = USERS.get(username)
        if not info:
            raise HTTPException(status_code=404, detail="Utente non trovato")
        come_ruolo = info["role"]
        come_nome = info.get("display_name") or username.capitalize()
        dip = info.get("dipendente_id")
    else:
        if ruolo not in VALID_ROLES or ruolo == "superadmin":
            raise HTTPException(status_code=400, detail="Ruolo non valido")
        come_ruolo, come_nome, dip = ruolo, f"ruolo {ruolo}", None

    n = minuti()
    ora = _ora()
    scade = ora + timedelta(minutes=n)
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO vedi_come_registro
               (chi, come_username, come_nome, come_ruolo, dipendente_id, inizio, scade)
               VALUES (?,?,?,?,?,?,?)""",
            (chi, username, come_nome, come_ruolo, dip, ora.isoformat(), scade.isoformat()),
        )
        reg_id = cur.lastrowid
    fino = int(time.time()) + n * 60
    return {
        **token_come(chi, username, come_ruolo, reg_id, fino),
        "role": come_ruolo,
        "display_name": come_nome,
        "username": username or "",
        "vedi_come": {"id": reg_id, "nome": come_nome, "ruolo": come_ruolo,
                      "username": username, "fino": fino, "chi": chi},
    }


def token_come(chi: str, username: Optional[str], ruolo: str, reg_id: int, fino: int) -> dict:
    resta = fino - int(time.time())
    if resta <= 0:
        raise HTTPException(status_code=401, detail="«Vedi come» scaduto")
    tok = security.create_access_token(
        {"sub": chi, "role": ruolo, "come": {"u": username, "r": ruolo, "id": reg_id, "fino": fino}},
        timedelta(seconds=resta),
    )
    return {"access_token": tok, "token_type": "bearer"}


def risolvi(payload: dict) -> Dict[str, Any]:
    """Da un token «come» al current_user. Ricontrolla a ogni richiesta che chi lo
    usa sia ancora superadmin e che la persona esista ancora (ruolo e dipendente
    letti adesso, non dal token)."""
    from app.services.auth_service import USERS
    chi = payload.get("sub")
    come = payload.get("come") or {}
    if chi not in USERS or USERS[chi].get("role") != "superadmin":
        raise HTTPException(status_code=401, detail="Utente non valido")
    if int(come.get("fino") or 0) <= int(time.time()):
        raise HTTPException(status_code=401, detail="«Vedi come» scaduto")
    u = come.get("u")
    if u:
        info = USERS.get(u)
        if not info:
            raise HTTPException(status_code=401, detail="La persona non esiste più")
        ruolo, dip = info["role"], info.get("dipendente_id")
        nome = info.get("display_name") or u.capitalize()
    else:
        ruolo, dip, nome = come.get("r"), None, f"ruolo {come.get('r')}"
    return {
        "username": etichetta(chi, nome),   # autore di ogni salvataggio
        "role": ruolo,
        "dipendente_id": dip,
        "vedi_come": True,
        "vero_username": chi,
        "come_username": u,
        "come_id": come.get("id"),
        "come_fino": come.get("fino"),
    }


def fine(user: Dict[str, Any], reg_id: int, scaduto: bool) -> dict:
    """Chiamata col pass VERO del superadmin (il frontend lo tiene da parte): chiude la
    riga del registro e restituisce un pass vero rinnovato."""
    chi = _verifica_superadmin_vero(user)
    with _conn() as c:
        r = c.execute("SELECT * FROM vedi_come_registro WHERE id = ?", (reg_id,)).fetchone()
        if r and r["chi"] == chi and not r["fine"]:
            ora = _ora().isoformat()
            # se è scaduto davvero, la fine è la scadenza (non quando il browser se ne accorge)
            quando = min(ora, r["scade"]) if scaduto else ora
            c.execute("UPDATE vedi_come_registro SET fine = ?, esito = ? WHERE id = ?",
                      (quando, "scaduto" if scaduto else "tornato", reg_id))
    from app.services.auth_service import USERS
    from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
    tok = security.create_access_token(
        {"sub": chi, "role": USERS[chi]["role"]},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": tok, "token_type": "bearer", "role": USERS[chi]["role"],
            "display_name": USERS[chi].get("display_name", chi.capitalize())}
