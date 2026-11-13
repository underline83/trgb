# Modulo: prenotazioni — [core]
# -*- coding: utf-8 -*-
"""
Pre-prenotazioni: opzioni in scadenza e lista d'attesa (2026-11-13, mig 232).

Decisioni di Marco (13/11/2026):
  - «In opzione» (OPTION) tiene il tavolo fino a `tenuto_fino_al`. Se la
    prenotazione ha un preventivo collegato ancora in attesa, vale la scadenza
    del preventivo e gli avvisi li manda già preventivi_scadenze: qui si saltano.
  - Alla scadenza NIENTE di automatico (come le pratiche: il tempo non cambia lo
    stato): avviso nel campanello, una volta sola per quella data, e decide lui
    (confermare, prorogare, liberare).
  - «Lista d'attesa» (WAITLIST) non occupa tavoli. Quando nello stesso giorno e
    turno una prenotazione smette di tenere il tavolo (cancellata, no-show,
    rifiutata, tavolo liberato), avviso con chi c'è in attesa.
Al cliente non parte mai niente da qui. Ruoli dell'avviso in
prenotazioni_config.avvisi_prenotazioni_ruoli; giorni proposti per l'opzione in
prenotazioni_config.opzione_giorni_default (nessun numero fisso nel codice: quelli
sotto sono solo il primo valore se la chiave manca).
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.models.clienti_db import get_clienti_conn
from app.services import prenotazioni_stati as stati_srv

logger = logging.getLogger("trgb.prenotazioni.attese")

PREVENTIVO_IN_ATTESA = ("bozza", "inviato", "in_attesa")


def _config(conn) -> Dict[str, str]:
    try:
        return {r[0]: r[1] for r in conn.execute("SELECT chiave, valore FROM prenotazioni_config")}
    except Exception:  # noqa: BLE001
        return {}


def _ruoli(cfg: Dict[str, str]) -> List[str]:
    return [x.strip() for x in (cfg.get("avvisi_prenotazioni_ruoli") or "admin,capo_sala").split(",") if x.strip()]


def _gg_mm(iso: Optional[str]) -> str:
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").strftime("%d/%m")
    except (TypeError, ValueError):
        return iso or "—"


def _nome(r) -> str:
    return " ".join(x for x in [(r["cognome"] or "").strip(), (r["nome"] or "").strip()] if x) or "Senza nome"


def tenuto_fino_proposto(conn, data_pasto: Optional[str], oggi: Optional[date] = None) -> Optional[str]:
    """Oggi + opzione_giorni_default, ma mai dopo il giorno della prenotazione."""
    oggi = oggi or date.today()
    try:
        giorni = int(_config(conn).get("opzione_giorni_default") or 7)
    except ValueError:
        giorni = 7
    proposta = oggi + timedelta(days=max(giorni, 0))
    try:
        giorno = datetime.strptime((data_pasto or "")[:10], "%Y-%m-%d").date()
        proposta = min(proposta, giorno)
    except ValueError:
        pass
    return proposta.isoformat()


def ha_preventivo_in_attesa(conn, pren_id: int) -> bool:
    """La prenotazione ha un preventivo collegato che aspetta il cliente? (allora
    la scadenza è quella del preventivo)."""
    try:
        return bool(conn.execute(
            f"""SELECT 1 FROM clienti_preventivi
                WHERE prenotazione_id = ? AND stato IN ({','.join('?' * len(PREVENTIVO_IN_ATTESA))})
                  AND COALESCE(is_bozza_auto, 0) = 0 LIMIT 1""",
            (pren_id, *PREVENTIVO_IN_ATTESA),
        ).fetchone())
    except Exception:  # noqa: BLE001 — tabella preventivi assente (modulo spento)
        return False


# ─────────────────────────── lista d'attesa ───────────────────────────

def avvisa_posto_liberato(pren_id: int, stato_prima: str, stato_dopo: str, oggi: Optional[date] = None) -> int:
    """Se una prenotazione che teneva il tavolo smette di tenerlo e nello stesso
    giorno/turno c'è qualcuno in lista d'attesa, avviso allo staff. Ritorna il
    numero di notifiche create."""
    if stati_srv.is_occupa(stato_dopo) or not stati_srv.is_occupa(stato_prima):
        return 0
    oggi = oggi or date.today()
    conn = get_clienti_conn()
    try:
        p = conn.execute(
            "SELECT id, data_pasto, ora_pasto, turno, pax FROM clienti_prenotazioni WHERE id = ?", (pren_id,)
        ).fetchone()
        if not p or not p["data_pasto"] or p["data_pasto"][:10] < oggi.isoformat():
            return 0
        attesa = conn.execute(
            """SELECT p.id, p.ora_pasto, p.pax,
                      COALESCE(NULLIF(c.nome, ''), p.nome_ospite) AS nome,
                      COALESCE(NULLIF(c.cognome, ''), p.cognome_ospite) AS cognome,
                      c.telefono
               FROM clienti_prenotazioni p LEFT JOIN clienti c ON c.id = p.cliente_id
               WHERE p.data_pasto = ? AND p.turno = ? AND p.stato = 'WAITLIST'
               ORDER BY p.created_at, p.id""",
            (p["data_pasto"], p["turno"]),
        ).fetchall()
        if not attesa:
            return 0
        cfg = _config(conn)
    finally:
        conn.close()

    from app.services.notifiche_service import crea_notifica
    turno = p["turno"] or "cena"
    titolo = f"🕰️ Posto liberato {turno} {_gg_mm(p['data_pasto'])}: {len(attesa)} in lista d'attesa"
    righe = [f"Si è liberato un tavolo da {p['pax'] or '?'} ({stati_srv.etichetta(stato_dopo).lower()}, ore {(p['ora_pasto'] or '')[:5]})."]
    righe += [f"• {(a['ora_pasto'] or '')[:5]} {_nome(a)}, {a['pax'] or '?'} pax" + (f" — {a['telefono']}" if a["telefono"] else "")
              for a in attesa]
    righe.append("Richiamali (telefono nella riga del Planning) e passali a «In opzione» o «Confermata».")
    n = 0
    for ruolo in _ruoli(cfg):
        try:
            crea_notifica(tipo="prenotazione_lista_attesa", titolo=titolo, messaggio="\n".join(righe),
                          link=f"/prenotazioni/planning/{p['data_pasto']}", icona="🕰️", urgenza="alta",
                          modulo="prenotazioni", entity_id=p["id"], dest_ruolo=ruolo)
            n += 1
        except Exception:  # noqa: BLE001
            logger.exception("Campanello lista d'attesa %s fallito", pren_id)
    return n


def avvisa_posto_liberato_sicuro(pren_id: int, stato_prima: str, stato_dopo: str) -> None:
    """Versione che non solleva mai: si chiama dopo ogni cambio di stato."""
    try:
        avvisa_posto_liberato(pren_id, stato_prima, stato_dopo)
    except Exception as e:  # noqa: BLE001
        logger.warning("avviso lista d'attesa #%s: %s", pren_id, e)


# ─────────────────────────── opzioni in scadenza ───────────────────────────

def opzioni_scadute(oggi: Optional[date] = None) -> List[Dict[str, Any]]:
    """Le prenotazioni «In opzione» senza preventivo in attesa, con tenuto_fino_al
    passato o di oggi, per giorni ancora da venire (Home/Lavagna/connettore)."""
    oggi = oggi or date.today()
    conn = get_clienti_conn()
    try:
        righe = conn.execute(
            f"""SELECT p.id, p.data_pasto, p.ora_pasto, p.turno, p.pax, p.tenuto_fino_al, p.opzione_avvisata,
                       COALESCE(NULLIF(c.nome, ''), p.nome_ospite) AS nome,
                       COALESCE(NULLIF(c.cognome, ''), p.cognome_ospite) AS cognome, c.telefono
                FROM clienti_prenotazioni p LEFT JOIN clienti c ON c.id = p.cliente_id
                WHERE p.stato IN {stati_srv.sql_in(stati_srv.gruppo('incerta'))}
                  AND COALESCE(p.tenuto_fino_al, '') != '' AND p.tenuto_fino_al <= ?
                  AND p.data_pasto >= ?
                ORDER BY p.tenuto_fino_al, p.data_pasto, p.ora_pasto""",
            (oggi.isoformat(), oggi.isoformat()),
        ).fetchall()
        return [{**dict(r), "cliente": _nome(r)} for r in righe if not ha_preventivo_in_attesa(conn, r["id"])]
    except Exception as e:  # noqa: BLE001 — migrazione 232 non applicata
        logger.debug("opzioni_scadute: %s", e)
        return []
    finally:
        conn.close()


def controlla_opzioni(oggi: Optional[date] = None, dry_run: bool = False) -> Dict[str, Any]:
    """Avviso allo staff per ogni opzione scaduta, una volta sola per quella data."""
    from app.services.notifiche_service import crea_notifica
    oggi = oggi or date.today()
    fatte = []
    scadute = [o for o in opzioni_scadute(oggi) if o.get("opzione_avvisata") != o["tenuto_fino_al"]]
    if not scadute:
        return {"avvisi": 0, "dettaglio": []}
    conn = get_clienti_conn()
    try:
        ruoli = _ruoli(_config(conn))
        for o in scadute:
            quando = "oggi" if o["tenuto_fino_al"] == oggi.isoformat() else f"il {_gg_mm(o['tenuto_fino_al'])}"
            titolo = f"⏳ Opzione scaduta {quando}: {o['cliente']}, {o['pax'] or '?'} pax, {_gg_mm(o['data_pasto'])}"
            testo = "\n".join([
                f"Cliente: {o['cliente']}" + (f" — {o['telefono']}" if o.get("telefono") else ""),
                f"Prenotazione: {_gg_mm(o['data_pasto'])} ore {(o['ora_pasto'] or '')[:5]}, {o['pax'] or '?'} coperti",
                f"Tavolo tenuto fino al {_gg_mm(o['tenuto_fino_al'])}.",
                "Il tavolo resta tenuto finché non decidi: «Confermata», proroga (cambia «tenuto fino al») o «Cancella».",
                "Al cliente non è partito niente.",
            ])
            if not dry_run:
                for ruolo in ruoli:
                    try:
                        crea_notifica(tipo="prenotazione_opzione_scaduta", titolo=titolo, messaggio=testo,
                                      link=f"/prenotazioni/planning/{o['data_pasto']}", icona="⏳",
                                      urgenza="alta", modulo="prenotazioni", entity_id=o["id"], dest_ruolo=ruolo)
                    except Exception:  # noqa: BLE001
                        logger.exception("Campanello opzione scaduta %s fallito", o["id"])
                conn.execute("UPDATE clienti_prenotazioni SET opzione_avvisata = ? WHERE id = ?",
                             (o["tenuto_fino_al"], o["id"]))
                conn.commit()
            fatte.append({"id": o["id"], "cliente": o["cliente"], "tenuto_fino_al": o["tenuto_fino_al"]})
    finally:
        conn.close()
    return {"avvisi": len(fatte), "dettaglio": fatte}


_avviato = {"ok": False}


def avvia_periodico(minuti: int = 60) -> None:
    """Controllo delle opzioni scadute ogni ora, in un thread (parte al boot)."""
    if _avviato["ok"]:
        return
    _avviato["ok"] = True

    def _ciclo():
        time.sleep(240)
        while True:
            try:
                r = controlla_opzioni()
                if r.get("avvisi"):
                    logger.info("Opzioni scadute: %s avvisi", r["avvisi"])
            except Exception as e:  # noqa: BLE001
                logger.warning("Opzioni scadute: %s", e)
            time.sleep(minuti * 60)

    threading.Thread(target=_ciclo, name="prenotazioni-opzioni", daemon=True).start()
