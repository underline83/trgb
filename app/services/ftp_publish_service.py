# @version: v1.0 — Mattone M.J "Pubblicazione web" (sessione 2026-08-03)
# -*- coding: utf-8 -*-
"""
FTP publish service — TRGB Gestionale (mattone M.J)

Modulo: platform
Classificazione: [core]  (le credenziali e i nomi file sono [locale:tregobbi],
                          vivono in .env sul VPS, mai nel repo)

PERCHÉ ESISTE
-------------
Il sito pubblico dell'osteria è un WordPress, ma i PDF che i clienti scaricano
(menu del pranzo, carta vini) NON sono gestiti dal CMS: stanno come file
statici in una cartella caricata via FTP (per Tre Gobbi: /privata/). Finora
Marco li scaricava dall'app e li ricaricava a mano col client FTP. Questo
mattone toglie il passaggio manuale: l'app genera il PDF e lo mette da sola
dove il sito lo va a leggere.

COSA È E COSA NON È
-------------------
È un trasporto: prendi dei bytes, mettili su un FTP con un nome, dimmi com'è
andata. Non sa cosa siano un menu o una carta vini — quello lo sanno i moduli
che lo chiamano (regola 4: comunicazione cross-modulo via servizio platform).

NON fa parte di questa versione:
  - SFTP/SCP (Aruba hosting espone FTP/FTPS; il VPS si aggiorna via git)
  - sincronizzazione di cartelle intere / cancellazione remota
  - invalidazione cache CDN
  - retry asincroni in coda (qui il retry è l'utente che ripreme il bottone)

UPLOAD ATOMICO
--------------
Si carica su un nome temporaneo (`<nome>.<pid>.<random>.part`) e solo a
trasferimento completato si fa RENAME sul nome definitivo. Motivo: se la linea
cade a metà, sul sito resta il PDF vecchio e integro, mai un file troncato. Il
nome temporaneo è unico per tentativo: due pubblicazioni contemporanee (Marco
che ripreme il bottone perché "sembra bloccato") non si sovrascrivono il
temporaneo a vicenda promuovendo un file corrotto.

Il RENAME su destinazione esistente non è garantito dallo standard FTP. Se il
server lo rifiuta NON si cancella la destinazione a scatola chiusa: si sposta
prima il file vivo su `<nome>.bak`, si promuove il nuovo e, se anche questo
fallisce, si rimette al suo posto il `.bak`. Cancellare e sperare significa
lasciare il sito a 404 quando l'errore non era "destinazione esistente" ma
permessi o quota piena.

CONFIG (.env sul VPS, letta a ogni chiamata: cambi .env + restart e basta)
-------------------------------------------------------------------------
    FTP_HOST=ftp.tregobbi.it
    FTP_USER=...
    FTP_PASS=...
    FTP_PORT=21
    FTP_DIR=/privata            # cartella remota di destinazione
    FTP_TLS=auto                # auto | 1 (obbligatorio) | 0 (mai)
    FTP_TIMEOUT=30
    FTP_PASSIVE=1
    FTP_BASE_URL=https://www.tregobbi.it/privata   # solo per mostrare il link in UI

FTP_TLS=auto → prova FTPS esplicito (AUTH TLS) e, se il server non lo supporta,
ricade su FTP in chiaro. In chiaro la password viaggia leggibile sulla rete:
è una scelta consapevole, non un bug. Chi può usare FTP_TLS=1 lo usi.

Il fallback scatta SOLO sulla negoziazione TLS (comando AUTH), mai sul login.
Se coprisse anche il login, una password sbagliata su un server che parla TLS
farebbe riconnettere in chiaro e rispedire la password vera in cleartext.

SICUREZZA
---------
La password non finisce mai nei log, in `stato()`, o nelle risposte API.
"""

from __future__ import annotations

import ftplib
import io
import logging
import os
import socket
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from app.models.notifiche_db import get_notifiche_conn

logger = logging.getLogger("trgb.ftp_publish")

_REQUIRED = ("FTP_HOST", "FTP_USER", "FTP_PASS")

# Suffisso del file temporaneo durante il trasferimento
_PART_SUFFIX = ".part"


@dataclass
class EsitoPubblicazione:
    ok: bool
    chiave: str
    nome_file: Optional[str] = None
    url: Optional[str] = None
    bytes_inviati: int = 0
    errore: Optional[str] = None
    tls: bool = False
    quando: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "chiave": self.chiave,
            "nome_file": self.nome_file,
            "url": self.url,
            "bytes": self.bytes_inviati,
            "errore": self.errore,
            "tls": self.tls,
            "quando": self.quando,
        }


# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

def _cfg() -> dict:
    return {
        "host": (os.getenv("FTP_HOST") or "").strip(),
        "user": (os.getenv("FTP_USER") or "").strip(),
        "password": os.getenv("FTP_PASS") or "",
        "port": int(os.getenv("FTP_PORT") or 21),
        "dir": (os.getenv("FTP_DIR") or "/").strip() or "/",
        "tls": (os.getenv("FTP_TLS") or "auto").strip().lower(),
        "timeout": int(os.getenv("FTP_TIMEOUT") or 30),
        "passive": (os.getenv("FTP_PASSIVE") or "1").strip() not in ("0", "false", "no"),
        "base_url": (os.getenv("FTP_BASE_URL") or "").strip().rstrip("/"),
    }


def mancanti() -> List[str]:
    """Variabili .env obbligatorie non impostate."""
    return [k for k in _REQUIRED if not (os.getenv(k) or "").strip()]


def is_configured() -> bool:
    return not mancanti()


def stato(completo: bool = False) -> dict:
    """
    Stato FTP per la UI. Non espone mai la password.

    Di default ritorna il minimo che serve al bottone (configurato sì/no e
    cosa manca). Host, utente e cartella sono dettagli di infrastruttura: si
    restituiscono solo con `completo=True`, riservato agli admin. Un cameriere
    loggato non ha motivo di sapere l'utenza FTP dell'hosting.
    """
    c = _cfg()
    base = {
        "configurato": is_configured(),
        "mancanti": mancanti(),
    }
    if not completo:
        return base
    base.update({
        "host": c["host"] or None,
        "porta": c["port"],
        "utente": c["user"] or None,
        "cartella": c["dir"],
        "tls": c["tls"],
        "base_url": c["base_url"] or None,
    })
    return base


def url_pubblico(nome_file: str) -> Optional[str]:
    base = _cfg()["base_url"]
    return f"{base}/{nome_file}" if base else None


# ─────────────────────────────────────────────
# CONNESSIONE
# ─────────────────────────────────────────────

def _connetti() -> tuple:
    """
    Ritorna (connessione_ftp, tls_attivo).
    Rispetta FTP_TLS: auto (prova TLS, ricade in chiaro), 1 (solo TLS), 0 (mai TLS).
    """
    c = _cfg()
    if not is_configured():
        raise RuntimeError(f"FTP non configurato: mancano {', '.join(mancanti())}")

    modo = c["tls"]

    def _apri_tls():
        """Solo connessione + AUTH TLS: nessuna credenziale ancora trasmessa."""
        ftp = ftplib.FTP_TLS(timeout=c["timeout"])
        ftp.connect(c["host"], c["port"])
        ftp.auth()
        return ftp

    def _completa_tls(ftp):
        ftp.login(c["user"], c["password"])
        ftp.prot_p()            # cifra anche il canale dati, non solo il login
        ftp.set_pasv(c["passive"])
        return ftp

    def _login_plain():
        ftp = ftplib.FTP(timeout=c["timeout"])
        ftp.connect(c["host"], c["port"])
        ftp.login(c["user"], c["password"])
        ftp.set_pasv(c["passive"])
        return ftp

    if modo in ("0", "false", "no", "off"):
        return _login_plain(), False

    if modo in ("1", "true", "yes", "on", "si", "sì"):
        return _completa_tls(_apri_tls()), True

    # auto: il fallback copre SOLO la negoziazione TLS. Una volta che il canale
    # è cifrato, un errore di login è un errore di login — non si ripiega in
    # chiaro, o si finirebbe per rispedire la password vera in cleartext.
    try:
        ftp = _apri_tls()
    except (ftplib.error_perm, ftplib.error_proto, socket.error, OSError) as e:
        logger.warning("FTPS non disponibile (%s) — fallback su FTP in chiaro", e)
        return _login_plain(), False
    return _completa_tls(ftp), True


def _cd(ftp, remote_dir: str) -> None:
    remote_dir = (remote_dir or "/").strip()
    if remote_dir and remote_dir != "/":
        ftp.cwd(remote_dir)


def test_connessione() -> dict:
    """
    Login + listing + **prova di scrittura reale** (file sonda da pochi byte,
    subito cancellato). Serve al bottone 'Prova connessione'.

    La sonda non è un lusso: un utente FTP in sola lettura supera benissimo
    login e listing e poi fallisce alla prima pubblicazione vera. E su certi
    hosting il canale dati FTPS fallisce anche quando il login è riuscito —
    senza scrivere davvero non lo si scopre.
    """
    c = _cfg()
    if not is_configured():
        return {"ok": False, "errore": f"Mancano in .env: {', '.join(mancanti())}"}

    ftp = None
    try:
        ftp, tls = _connetti()
        _cd(ftp, c["dir"])
        try:
            files = ftp.nlst()
            listing_ok = True
        except ftplib.error_perm as e:
            files, listing_ok = [], False
            logger.info("Listing di %s non permesso: %s", c["dir"], e)

        sonda = f".trgb-probe.{uuid.uuid4().hex[:8]}"
        scrittura_ok, errore_scrittura = False, None
        try:
            ftp.storbinary(f"STOR {sonda}", io.BytesIO(b"trgb"))
            scrittura_ok = True
        except Exception as e:
            errore_scrittura = str(e)
        finally:
            try:
                ftp.delete(sonda)
            except Exception:
                pass

        return {
            "ok": scrittura_ok,
            "tls": tls,
            "cartella": ftp.pwd(),
            "listing": listing_ok,
            "scrittura": scrittura_ok,
            "errore": None if scrittura_ok else (
                f"Login riuscito ma la cartella non è scrivibile: {errore_scrittura}"
            ),
            "file_presenti": sorted(f for f in files if f not in (".", ".."))[:50],
        }
    except Exception as e:
        return {"ok": False, "errore": str(e)}
    finally:
        _chiudi(ftp)


def _chiudi(ftp) -> None:
    if ftp is None:
        return
    try:
        ftp.quit()
    except Exception:
        try:
            ftp.close()
        except Exception:
            pass


# ─────────────────────────────────────────────
# PUBBLICAZIONE
# ─────────────────────────────────────────────

def _scarica(ftp, nome_file: str) -> Optional[bytes]:
    """Contenuto del file remoto, o None se non esiste / non è leggibile."""
    buf = io.BytesIO()
    try:
        ftp.retrbinary(f"RETR {nome_file}", buf.write)
        return buf.getvalue()
    except ftplib.error_perm:
        return None


def _promuovi(ftp, tmp_name: str, nome_file: str) -> None:
    """
    Porta il file temporaneo sul nome definitivo senza mai lasciare il sito
    senza file.

    Primo tentativo: RENAME diretto — il caso normale, istantaneo.

    Se il server lo rifiuta (molti non sovrascrivono su RNTO) si entra nel
    ramo lento, e prima di toccare qualsiasi cosa si **scarica in memoria il
    file attualmente pubblicato**. Solo con quella copia in mano si cancella
    la destinazione e si promuove il nuovo; se la promozione fallisce si
    rimette su il vecchio con uno STOR.

    Perché non un semplice `<nome>.bak` sul server: se il RENAME è vietato per
    quel nome (permessi, quota), è vietato anche il rename di ripristino — e
    il sito resterebbe a 404 con un `.bak` inutile accanto. Lo STOR di
    ripristino, invece, usa la stessa strada che ha appena funzionato per
    caricare il temporaneo.

    Se la destinazione non esiste affatto, l'errore non era "file già
    presente": si propaga senza cancellare niente.
    """
    try:
        ftp.rename(tmp_name, nome_file)
        return
    except ftplib.error_perm:
        pass

    vecchio = _scarica(ftp, nome_file)
    if vecchio is None:
        # Niente da sovrascrivere: il RENAME è fallito per un altro motivo.
        raise RuntimeError(
            f"Impossibile rinominare il file caricato in '{nome_file}' "
            f"(la destinazione non esiste: non è un problema di sovrascrittura)"
        )

    try:
        ftp.delete(nome_file)
    except ftplib.error_perm:
        pass

    try:
        ftp.rename(tmp_name, nome_file)
    except Exception:
        try:
            ftp.storbinary(f"STOR {nome_file}", io.BytesIO(vecchio))
            logger.warning(
                "Promozione di %s fallita: ripristinata la versione precedente "
                "(%s byte). Il sito non è rimasto senza file.",
                nome_file, len(vecchio),
            )
        except Exception:
            logger.error(
                "Promozione di %s fallita E ripristino fallito: il file "
                "potrebbe non essere più raggiungibile sul sito.", nome_file
            )
        raise


def pubblica(
    chiave: str,
    nome_file: str,
    contenuto: bytes,
    descrizione: Optional[str] = None,
    notifica_su_errore: bool = True,
) -> EsitoPubblicazione:
    """
    Carica `contenuto` sull'FTP come `nome_file` dentro FTP_DIR, in modo atomico.

    chiave: identificatore stabile della pubblicazione ('menu_pranzo',
            'carta_vini'), usato per lo storico e per la UI.
    descrizione: testo libero mostrato nello storico (es. "settimana 2026-08-03").

    Non solleva eccezioni: ritorna sempre un EsitoPubblicazione. Chi chiama
    decide se mostrare l'errore o alzare un 502.
    """
    quando = datetime.now().isoformat(timespec="seconds")
    nome_file = (nome_file or "").strip().lstrip("/")
    if not nome_file:
        return EsitoPubblicazione(ok=False, chiave=chiave, errore="Nome file mancante", quando=quando)
    if not contenuto:
        return EsitoPubblicazione(ok=False, chiave=chiave, nome_file=nome_file,
                                  errore="Contenuto vuoto: non pubblico un file da 0 byte",
                                  quando=quando)

    c = _cfg()
    ftp = None
    tls = False
    # Nome temporaneo unico per tentativo: due pubblicazioni contemporanee
    # non devono scrivere sullo stesso .part e promuovere un file misto.
    tmp_name = f"{nome_file}.{os.getpid()}.{uuid.uuid4().hex[:8]}{_PART_SUFFIX}"
    try:
        ftp, tls = _connetti()
        _cd(ftp, c["dir"])

        ftp.storbinary(f"STOR {tmp_name}", io.BytesIO(contenuto))
        _promuovi(ftp, tmp_name, nome_file)

        esito = EsitoPubblicazione(
            ok=True,
            chiave=chiave,
            nome_file=nome_file,
            url=url_pubblico(nome_file),
            bytes_inviati=len(contenuto),
            tls=tls,
            quando=quando,
        )
        logger.info("Pubblicato %s (%s byte, tls=%s) su %s", nome_file, len(contenuto), tls, c["dir"])
    except Exception as e:
        esito = EsitoPubblicazione(
            ok=False,
            chiave=chiave,
            nome_file=nome_file,
            bytes_inviati=len(contenuto),
            tls=tls,
            errore=str(e),
            quando=quando,
        )
        logger.error("Pubblicazione %s FALLITA: %s", nome_file, e)
        # Pulizia best-effort del temporaneo rimasto a metà
        try:
            if ftp is not None:
                ftp.delete(tmp_name)
        except Exception:
            pass
        if notifica_su_errore:
            _notifica_fallimento(chiave, nome_file, str(e))
    finally:
        _chiudi(ftp)

    _log_scrivi(esito, descrizione)
    return esito


def _notifica_fallimento(chiave: str, nome_file: str, errore: str) -> None:
    """
    Mattone M.A — un fallimento silenzioso è peggio di un fallimento.

    NB dest_ruolo=None (notifica globale): il match su `dest_ruolo` è per
    uguaglianza esatta e Marco ha ruolo 'superadmin', quindi una notifica
    intestata ad 'admin' non gli arriverebbe mai — stesso inciampo già
    documentato in turni_service.py.
    """
    try:
        from app.services.notifiche_service import crea_notifica
        crea_notifica(
            tipo="sistema",
            titolo="Pubblicazione sul sito fallita",
            messaggio=f"{nome_file}: {errore}",
            icona="🌐",
            urgenza="alta",
            modulo="platform",
        )
    except Exception as e:
        logger.warning("Notifica fallimento pubblicazione non creata: %s", e)


# ─────────────────────────────────────────────
# STORICO (tabella platform in notifiche.sqlite3)
# ─────────────────────────────────────────────

_log_pronto = False


def _init_log() -> None:
    """
    Crea la tabella una volta per processo. Senza il flag si eseguirebbe un
    CREATE TABLE + CREATE INDEX + commit — cioè una transazione di scrittura —
    a ogni lettura di stato: due per ogni apertura del tab Carta e per ogni
    cambio settimana in Pranzo, sullo stesso DB che regge il polling delle
    notifiche.
    """
    global _log_pronto
    if _log_pronto:
        return
    conn = get_notifiche_conn()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS web_publish_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                chiave        TEXT NOT NULL,
                nome_file     TEXT,
                descrizione   TEXT,
                ok            INTEGER NOT NULL DEFAULT 0,
                bytes         INTEGER DEFAULT 0,
                errore        TEXT,
                url           TEXT,
                creato_il     TEXT NOT NULL
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_web_publish_chiave "
            "ON web_publish_log(chiave, creato_il DESC)"
        )
        conn.commit()
        _log_pronto = True
    finally:
        conn.close()


def _log_scrivi(esito: EsitoPubblicazione, descrizione: Optional[str]) -> None:
    try:
        _init_log()
        conn = get_notifiche_conn()
        try:
            conn.execute("""
                INSERT INTO web_publish_log
                    (chiave, nome_file, descrizione, ok, bytes, errore, url, creato_il)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                esito.chiave, esito.nome_file, descrizione,
                1 if esito.ok else 0, esito.bytes_inviati,
                esito.errore, esito.url, esito.quando,
            ))
            conn.commit()
        finally:
            conn.close()
    except sqlite3.Error as e:
        # Lo storico è un di più: se il DB è lockato non deve far fallire la pubblicazione.
        logger.warning("Storico pubblicazioni non aggiornato: %s", e)


def ultima_pubblicazione(chiave: str, solo_ok: bool = True) -> Optional[dict]:
    """Ultima riga di storico per una chiave — alimenta 'Pubblicato il ...' in UI."""
    try:
        _init_log()
        conn = get_notifiche_conn()
        try:
            sql = "SELECT * FROM web_publish_log WHERE chiave = ?"
            if solo_ok:
                sql += " AND ok = 1"
            sql += " ORDER BY creato_il DESC, id DESC LIMIT 1"
            row = conn.execute(sql, (chiave,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()
    except sqlite3.Error as e:
        logger.warning("Lettura storico pubblicazioni fallita: %s", e)
        return None


def storico(chiave: Optional[str] = None, limit: int = 20) -> List[dict]:
    try:
        _init_log()
        conn = get_notifiche_conn()
        try:
            if chiave:
                rows = conn.execute(
                    "SELECT * FROM web_publish_log WHERE chiave = ? "
                    "ORDER BY creato_il DESC, id DESC LIMIT ?",
                    (chiave, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM web_publish_log ORDER BY creato_il DESC, id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except sqlite3.Error as e:
        logger.warning("Lettura storico pubblicazioni fallita: %s", e)
        return []


# ─────────────────────────────────────────────
# NOMI FILE (config per locale, mai hardcoded nei moduli)
# ─────────────────────────────────────────────

_NOMI_DEFAULT = {
    "menu_pranzo": "menu-pranzo.pdf",
    "carta_vini": "carta-vini.pdf",
}


def nome_file_per(chiave: str) -> str:
    """
    Nome remoto del file per una pubblicazione. Override da .env:
        FTP_FILE_MENU_PRANZO=menu-pranzo.pdf
        FTP_FILE_CARTA_VINI=carta-vini.pdf
    Il nome deve restare STABILE nel tempo: il link su WordPress è fisso.
    """
    env_key = "FTP_FILE_" + chiave.upper()
    nome = (os.getenv(env_key) or "").strip() or _NOMI_DEFAULT.get(chiave, f"{chiave}.pdf")
    # basename: un "../" in .env scriverebbe fuori da FTP_DIR.
    return os.path.basename(nome)
