#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# @version: v1.0 (2026-11-24)
"""
TRGB — il ponte di stampa. [core]

Gira su un computer nella rete del locale (per le prove il Mac, poi un Raspberry). Ogni
pochi secondi chiede a TRGB «c'è da stampare?», riceve i fogli già impaginati, li porta alle
stampanti sulla loro porta e riferisce com'è andata. Non sa niente di comande: è un tubo.
È sempre lui a chiamare TRGB: sul router del locale non si apre nessuna porta.

Uso:
    python3 ponte.py                 parte e resta acceso (Ctrl+C per fermarlo)
    python3 ponte.py --una-volta     chiede una volta, stampa, esce
    python3 ponte.py --config FILE   usa un altro file di impostazioni

La prima volta chiede l'indirizzo di TRGB e il token (si crea in Comanda › Impostazioni ›
Stampa) e li scrive in ~/.trgb_ponte.json, leggibile solo da te. Solo libreria standard.
"""
import argparse
import base64
import ipaddress
import json
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

VERSIONE = "1.0"
CONFIG = os.path.join(os.path.expanduser("~"), ".trgb_ponte.json")
URL_DI_BASE = "https://trgb.tregobbi.it"
ATTESA_STAMPANTE = 4          # secondi per collegarsi a una stampante
ATTESA_TRGB = 15              # secondi per una risposta di TRGB


def dico(*pezzi):
    print(datetime.now().strftime("%H:%M:%S"), *pezzi, flush=True)


def leggi_config(percorso, chiedi=True):
    try:
        with open(percorso, encoding="utf-8") as f:
            c = json.load(f)
        if c.get("url") and c.get("token"):
            return c
    except (OSError, ValueError):
        pass
    if not chiedi or not sys.stdin.isatty():
        sys.exit(f"Mancano le impostazioni del ponte ({percorso}): lancialo una volta a mano per scriverle.")
    print("\nPrima volta: mi servono due cose.\n")
    url = input(f"Indirizzo di TRGB [{URL_DI_BASE}]: ").strip() or URL_DI_BASE
    token = input("Token del ponte (Comanda › Impostazioni › Stampa › «Crea il token»): ").strip()
    if not token:
        sys.exit("Senza token il ponte non può chiedere niente a TRGB.")
    c = {"url": url.rstrip("/"), "token": token}
    with open(percorso, "w", encoding="utf-8") as f:
        json.dump(c, f, indent=1)
    try:
        os.chmod(percorso, 0o600)
    except OSError:
        pass
    print(f"Scritto in {percorso}.\n")
    return c


class Trgb:
    def __init__(self, url, token):
        self.url, self.token = url.rstrip("/"), token
        self.nome = socket.gethostname()[:60]

    def _chiama(self, percorso, corpo=None):
        dati = json.dumps(corpo).encode("utf-8") if corpo is not None else None
        req = urllib.request.Request(self.url + percorso, data=dati, method="POST" if dati is not None else "GET")
        req.add_header("X-Ponte-Token", self.token)
        req.add_header("User-Agent", f"trgb-ponte/{VERSIONE}")
        if dati is not None:
            req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=ATTESA_TRGB) as r:
            return json.loads(r.read().decode("utf-8") or "{}")

    def lavori(self):
        q = urllib.parse.urlencode({"nome": self.nome, "versione": VERSIONE})
        return self._chiama(f"/ponte/lavori/?{q}")

    def esito(self, lavoro_id, ok, errore=None):
        return self._chiama("/ponte/lavori/esito", {"id": lavoro_id, "ok": bool(ok), "errore": errore})


def indirizzo_di_casa(host):
    """Il ponte stampa solo nella rete del locale: mai verso un indirizzo pubblico."""
    try:
        for info in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(info[4][0])
            if not (ip.is_private or ip.is_loopback or ip.is_link_local):
                return False
        return True
    except (socket.gaierror, ValueError):
        return False


def stampa(host, porta, dati, ovunque=False):
    """Porta i byte alla stampante. Torna None se è andata, altrimenti il perché."""
    if not ovunque and not indirizzo_di_casa(host):
        return f"{host} non è un indirizzo della rete del locale"
    try:
        with socket.create_connection((host, int(porta)), timeout=ATTESA_STAMPANTE) as s:
            s.settimeout(ATTESA_STAMPANTE * 2)
            s.sendall(dati)
            try:
                s.shutdown(socket.SHUT_WR)
            except OSError:
                pass
            time.sleep(0.3)             # lascia alla stampante il tempo di leggere prima di chiudere
        return None
    except socket.timeout:
        return f"la stampante non risponde ({host}:{porta})"
    except OSError as e:
        return f"stampante non raggiungibile ({host}:{porta}): {e.strerror or e}"


def spiega(e):
    if isinstance(e, urllib.error.HTTPError):
        if e.code == 401:
            return "TRGB non riconosce il token: crealo di nuovo in Comanda › Impostazioni › Stampa e cancella " + CONFIG
        return f"TRGB ha risposto {e.code}"
    if isinstance(e, urllib.error.URLError):
        if isinstance(e.reason, ssl.SSLError):
            return f"certificato di TRGB non verificabile da questo Python ({e.reason})"
        return f"TRGB non raggiungibile ({e.reason})"
    return f"TRGB non raggiungibile ({e})"


def giro(trgb, da_riferire, ovunque=False):
    """Un giro: riferisce gli esiti rimasti indietro, chiede i fogli, li stampa. Torna i secondi da aspettare."""
    for lavoro_id, (ok, errore) in list(da_riferire.items()):
        trgb.esito(lavoro_id, ok, errore)
        del da_riferire[lavoro_id]
    risposta = trgb.lavori()
    for l in risposta.get("lavori") or []:
        if l["id"] in da_riferire:      # già stampato, manca solo dirlo a TRGB: non si ristampa
            continue
        errore = stampa(l["host"], l["porta"], base64.b64decode(l["dati"]), ovunque)
        dico("stampato" if errore is None else "NON stampato", "·", l.get("titolo") or l["id"], "→", l.get("stampante"),
             "" if errore is None else f"· {errore}")
        da_riferire[l["id"]] = (errore is None, errore)
        try:
            trgb.esito(l["id"], errore is None, errore)
            del da_riferire[l["id"]]
        except Exception as e:  # noqa: BLE001 — lo si ridice al prossimo giro
            dico("esito non consegnato, lo ridico fra poco:", spiega(e))
    try:
        return min(60, max(1, int(risposta.get("ogni_secondi") or 2)))
    except (TypeError, ValueError):
        return 2


def main():
    ap = argparse.ArgumentParser(description="TRGB — ponte di stampa")
    ap.add_argument("--config", default=CONFIG)
    ap.add_argument("--una-volta", action="store_true")
    ap.add_argument("--ovunque", action="store_true", help="stampa anche fuori dalla rete del locale (solo per prove)")
    a = ap.parse_args()
    c = leggi_config(a.config, chiedi=not a.una_volta)
    trgb = Trgb(c["url"], c["token"])
    dico(f"Ponte di stampa {VERSIONE} · {trgb.nome} · chiedo a {trgb.url}")
    da_riferire, giu = {}, None
    while True:
        try:
            pausa = giro(trgb, da_riferire, a.ovunque)
            if giu is not None:
                dico("di nuovo collegato a TRGB")
                giu = None
            elif giu is None and not getattr(main, "_detto", False):
                dico("collegato: aspetto fogli da stampare (Ctrl+C per fermare)")
                main._detto = True
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001 — il ponte non si ferma: riprova
            motivo = spiega(e)
            if motivo != giu:
                dico(motivo, "· riprovo")
                giu = motivo
            pausa = 30 if isinstance(e, urllib.error.HTTPError) and e.code == 401 else 5
        if a.una_volta:
            return 0 if giu is None else 1
        time.sleep(pausa)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nPonte fermato.")
