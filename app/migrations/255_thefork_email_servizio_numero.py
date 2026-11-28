# Modulo: prenotazioni (email di servizio per TheFork nella forma chiesta da TheFork) — [core]
# -*- coding: utf-8 -*-
"""
Migrazione 255 — Email di servizio per TheFork: {numero}@dominio (2026-11-28)

Contesto: Régis (TheFork) il 28/11 chiede che, quando il cliente non ha un'email, il segnaposto
mandato a TheFork sia unico nella forma {phone_number}@tregobbi.it. Marco: «accetta qualsiasi
indirizzo, facciamo come dice Régis». Fino a oggi era prenotazioni+{numero}@tregobbi.it (mig 247).

prenotazioni_config
  thefork_email_servizio              → «{numero}@dominio», SOLO se oggi è «prenotazioni+{numero}@dominio»
                                        (chi ha scelto un altro modello resta com'è)
  thefork_email_servizio_precedenti   NUOVA: modelli usati prima, separati da virgola. Le schede su
                                        TheFork che hanno ancora la vecchia email restano «di servizio»
                                        (thefork_invio_service.email_di_servizio le riconosce tutte).

Solo INSERT OR IGNORE e un UPDATE condizionato. DB: clienti.sqlite3.
"""

import re
import sqlite3

from app.utils.locale_data import locale_data_path

CLIENTI_DB = locale_data_path("clienti.sqlite3")
_VECCHIO = re.compile(r"^prenotazioni\+\{numero\}@([a-z0-9.-]+)$", re.I)


def upgrade(conn):
    """conn e' foodcost.db (ignorato). Apriamo clienti.sqlite3 direttamente."""
    if not CLIENTI_DB.exists():
        print("  · clienti.sqlite3 non esiste ancora, skip")
        return
    cconn = sqlite3.connect(str(CLIENTI_DB))
    try:
        try:
            cconn.execute(
                "INSERT OR IGNORE INTO prenotazioni_config (chiave, valore, descrizione) VALUES (?, ?, ?)",
                ("thefork_email_servizio_precedenti", "",
                 "Modelli dell'email di servizio usati prima (separati da virgola): restano riconosciuti come non veri"))
            r = cconn.execute(
                "SELECT valore FROM prenotazioni_config WHERE chiave = 'thefork_email_servizio'").fetchone()
            attuale = ((r[0] if r else "") or "").strip()
            m = _VECCHIO.match(attuale)
            if m:
                nuovo = "{numero}@" + m.group(1)
                cconn.execute("UPDATE prenotazioni_config SET valore = ? WHERE chiave = 'thefork_email_servizio'", (nuovo,))
                p = cconn.execute(
                    "SELECT valore FROM prenotazioni_config WHERE chiave = 'thefork_email_servizio_precedenti'").fetchone()
                prima = [x for x in re.split(r"[\s,;]+", (p[0] if p else "") or "") if x]
                if attuale not in prima:
                    prima.append(attuale)
                cconn.execute(
                    "UPDATE prenotazioni_config SET valore = ? WHERE chiave = 'thefork_email_servizio_precedenti'",
                    (", ".join(prima),))
                print(f"  + [255] email di servizio TheFork: {attuale} → {nuovo}")
            else:
                print(f"  · [255] email di servizio lasciata com'è ({attuale or 'vuota'})")
        except sqlite3.OperationalError:
            print("  · prenotazioni_config non c'è ancora")
        cconn.commit()
    finally:
        cconn.close()
