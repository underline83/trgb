# Modulo: dipendenti (sotto-modulo turni) — [core]
# -*- coding: utf-8 -*-
"""
Calendario personale dei turni (.ics) — TRGB Gestionale (mig 203, 2026-10-20)

Il dipendente porta i SUOI turni nel calendario del telefono:
- abbonamento: link personale /turni/calendario/{token}.ics, che iPhone (webcal://)
  e Google Calendar rileggono da soli → i cambi di turno arrivano senza fare nulla;
- file: lo stesso contenuto scaricato una volta (fotografia del momento).

Cosa entra nel calendario:
- i turni CONFERMATI e OPZIONALI (questi ultimi «da confermare», STATUS:TENTATIVE);
  gli ANNULLATI no;
- le assenze FERIE e PERMESSO come eventi di tutto il giorno. MALATTIA no: è un
  dato sanitario e il link, se inoltrato, lo leggerebbe chiunque.
Finestra: da oggi − calendario_giorni_indietro a oggi + calendario_giorni_avanti
(dipendenti_settings, default 30/90).

Il token è l'unica autenticazione del feed (il calendario del telefono non sa
mandare il JWT): 32 byte casuali, uno per dipendente, rigenerabile.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.models.dipendenti_db import get_dipendenti_conn
from app.utils.locale_data import locale_info, locale_timezone

ASSENZE_NEL_CALENDARIO = {"FERIE": "🏖 Ferie", "PERMESSO": "📋 Permesso"}


# ------------------------------------------------------------------ token ---
def _setting_int(conn, key: str, default: int) -> int:
    try:
        row = conn.execute("SELECT value FROM dipendenti_settings WHERE key = ?", (key,)).fetchone()
        return int(row[0]) if row else default
    except Exception:
        return default


def token_dipendente(dipendente_id: int, username: str, rigenera: bool = False) -> str:
    """Token del feed del dipendente; lo crea se manca, lo sostituisce se rigenera."""
    conn = get_dipendenti_conn()
    try:
        row = conn.execute(
            "SELECT token FROM dipendenti_calendario_feed WHERE dipendente_id = ?", (dipendente_id,)
        ).fetchone()
        if row and not rigenera:
            return row["token"]
        token = secrets.token_urlsafe(32)
        conn.execute(
            """INSERT INTO dipendenti_calendario_feed (dipendente_id, token, creato_il, creato_da, ultimo_accesso)
               VALUES (?, ?, datetime('now'), ?, NULL)
               ON CONFLICT(dipendente_id) DO UPDATE SET
                 token = excluded.token, creato_il = excluded.creato_il,
                 creato_da = excluded.creato_da, ultimo_accesso = NULL""",
            (dipendente_id, token, username),
        )
        conn.commit()
        return token
    finally:
        conn.close()


def dipendente_da_token(token: str) -> Optional[int]:
    """dipendente_id del token (e segna l'ultimo accesso), None se non valido."""
    if not token or len(token) < 20:
        return None
    conn = get_dipendenti_conn()
    try:
        row = conn.execute(
            "SELECT dipendente_id, token FROM dipendenti_calendario_feed WHERE token = ?", (token,)
        ).fetchone()
        if not row or not secrets.compare_digest(row["token"], token):
            return None
        conn.execute(
            "UPDATE dipendenti_calendario_feed SET ultimo_accesso = datetime('now') WHERE dipendente_id = ?",
            (row["dipendente_id"],),
        )
        conn.commit()
        return int(row["dipendente_id"])
    finally:
        conn.close()


# -------------------------------------------------------------------- ics ---
def _esc(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _fold(line: str) -> str:
    """RFC 5545: righe da max 75 ottetti, continuazione con CRLF + spazio."""
    out, cur, n = [], "", 0
    for ch in line:
        b = len(ch.encode("utf-8"))
        if n + b > 75:
            out.append(cur)
            cur, n = " " + ch, 1 + b
        else:
            cur += ch
            n += b
    out.append(cur)
    return "\r\n".join(out)


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _hhmm(s: Optional[str]) -> Optional[time]:
    try:
        h, m = (s or "").strip()[:5].split(":")
        return time(int(h), int(m))
    except Exception:
        return None


def genera_ics(dipendente_id: int) -> str:
    """Il calendario .ics del dipendente (testo con CRLF)."""
    tz = locale_timezone()
    info = locale_info()
    nome_locale = info.get("nome") or "TRGB"
    host = info.get("dominio") or "trgb"
    oggi = datetime.now(tz).date()

    conn = get_dipendenti_conn()
    try:
        da = oggi - timedelta(days=_setting_int(conn, "calendario_giorni_indietro", 30))
        a = oggi + timedelta(days=_setting_int(conn, "calendario_giorni_avanti", 90))
        turni = [dict(r) for r in conn.execute(
            """SELECT tc.id, tc.data, tc.stato, tc.note, tc.updated_at,
                      COALESCE(tc.ora_inizio, tt.ora_inizio) AS ora_inizio,
                      COALESCE(tc.ora_fine, tt.ora_fine)     AS ora_fine,
                      tt.nome AS turno_nome, COALESCE(tt.categoria, '') AS categoria
               FROM turni_calendario tc
               JOIN turni_tipi tt ON tt.id = tc.turno_tipo_id
               WHERE tc.dipendente_id = ? AND tc.data BETWEEN ? AND ?
                 AND UPPER(COALESCE(tc.stato, 'CONFERMATO')) != 'ANNULLATO'
               ORDER BY tc.data, tc.slot_index, tc.id""",
            (dipendente_id, da.isoformat(), a.isoformat()),
        ).fetchall()]
        assenze = [dict(r) for r in conn.execute(
            """SELECT id, data, tipo, note FROM assenze
               WHERE dipendente_id = ? AND data BETWEEN ? AND ?
               ORDER BY data""",
            (dipendente_id, da.isoformat(), a.isoformat()),
        ).fetchall()]
    finally:
        conn.close()

    stamp = _utc(datetime.now(timezone.utc))
    righe: List[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TRGB//Turni//IT",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_esc('Turni · ' + nome_locale)}",
        f"X-WR-TIMEZONE:{tz.key}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]

    for t in turni:
        try:
            g = date.fromisoformat(t["data"])
        except Exception:
            continue
        opz = (t.get("stato") or "").upper() == "OPZIONALE"
        titolo = (t.get("turno_nome") or "Turno") + (" (da confermare)" if opz else "")
        ev = ["BEGIN:VEVENT", f"UID:turno-{t['id']}@{host}", f"DTSTAMP:{stamp}"]
        hi, hf = _hhmm(t.get("ora_inizio")), _hhmm(t.get("ora_fine"))
        if hi and hf:
            ini = datetime.combine(g, hi, tzinfo=tz)
            fin = datetime.combine(g, hf, tzinfo=tz)
            if fin <= ini:  # turno che passa la mezzanotte
                fin = datetime.combine(g + timedelta(days=1), hf, tzinfo=tz)
            ev += [f"DTSTART:{_utc(ini)}", f"DTEND:{_utc(fin)}"]
        else:
            ev += [f"DTSTART;VALUE=DATE:{g:%Y%m%d}", f"DTEND;VALUE=DATE:{g + timedelta(days=1):%Y%m%d}"]
        ev += [
            f"SUMMARY:{_esc(titolo)}",
            f"LOCATION:{_esc(nome_locale)}",
            f"STATUS:{'TENTATIVE' if opz else 'CONFIRMED'}",
            "TRANSP:OPAQUE",
        ]
        if t.get("note"):
            ev.append(f"DESCRIPTION:{_esc(t['note'])}")
        ev.append("END:VEVENT")
        righe += ev

    for x in assenze:
        etichetta = ASSENZE_NEL_CALENDARIO.get((x.get("tipo") or "").upper())
        if not etichetta:
            continue
        try:
            g = date.fromisoformat(x["data"])
        except Exception:
            continue
        righe += [
            "BEGIN:VEVENT",
            f"UID:assenza-{x['id']}@{host}",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{g:%Y%m%d}",
            f"DTEND;VALUE=DATE:{g + timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{_esc(etichetta)}",
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        ]

    righe.append("END:VCALENDAR")
    return "\r\n".join(_fold(r) for r in righe) + "\r\n"
