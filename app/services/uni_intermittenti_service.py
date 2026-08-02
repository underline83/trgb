# @version: v1.0 — Comunicazione UNI-Intermittenti (sessione 2026-07-30)
# -*- coding: utf-8 -*-
"""
Service UNI-Intermittenti — TRGB Gestionale

Modulo: dipendenti
Classificazione: [core]
Endpoint prefix: /intermittenti
Tabelle DB: dipendenti_uni_comunicazioni, dipendenti_uni_comunicazioni_righe
            (+ colonne dipendenti.intermittente, dipendenti.codice_comunicazione)
Dipendenze platform: M.D email_service, M.A notifiche (via alert engine M.F)
Dipendenze opzionali: nessuna
Frontend route: /dipendenti/intermittenti

==============================================================================
COSA FA
==============================================================================
Trasforma i turni già decisi nel Foglio Settimana nella comunicazione preventiva
delle chiamate dei lavoratori intermittenti (art. 15 D.Lgs 81/2015), la manda
via email all'Ispettorato e ne conserva la prova.

Cross-modulo: legge SOLO tabelle del proprio modulo (dipendenti.sqlite3) e non
importa nulla da altri router. `turni_calendario` è del modulo dipendenti.

==============================================================================
IL TRACCIATO (reverse-engineering del modulo ministeriale, 2026-07-30)
==============================================================================
Del file XML NON esiste alcuna specifica pubblica: né XSD, né tracciato, né una
riga di documentazione ministeriale. La specifica è il modulo PDF stesso, che è
un XFA statico Adobe LiveCycle. Il suo bottone "Genera XML e invia via email" fa

    <submit format="xml" textEncoding="UTF-8" target="mailto:intermittenti@..."/>

cioè **l'allegato che parte è il packet `datasets` dell'XFA**. Struttura esatta
ricavata con pikepdf da Root.AcroForm.XFA di un modulo reale: vedi genera_xml().

Date: tutti e 20 i campi data del modulo hanno <bind><picture>DD/MM/YYYY</picture>,
e in XFA è la picture del `bind` a decidere come il valore viene scritto nei
dati (il `format` è la visualizzazione, il `validate` il controllo di
digitazione). Lo script interno del modulo confronta le date con split("-")
perché legge `rawValue`, che per un campo data è sempre ISO *in memoria*: non è
una contraddizione. Il formato resta comunque un setting (`uni_formato_data`)
perché su una cosa non documentata non si scommette in hardcoded.

REGOLE prese dal JavaScript interno del modulo (più attendibili delle guide):
  - CFdatorelavoro obbligatorio, almeno un CFlavoratore compilato
  - EMmail obbligatoria, con questa regex del modulo (TLD 2-3 caratteri):
        ^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]{2,}[.][a-zA-Z]{2,3}$
  - data_inizio >= data_fine → ERRORE "date incoerenti". Quindi la GIORNATA
    SINGOLA si comunica con la sola data inizio e data fine VUOTA: mettere la
    stessa data nei due campi fa fallire il modulo.
  - data_fine senza data_inizio → errore
  - massimo 10 lavoratori per modulo
  - un solo modulo per email (INL lettera circolare 8716 del 9/10/2019: con
    più allegati la trasmissione sembra riuscita ma i moduli non entrano a
    sistema) → un modulo = una email, sempre.
  - annullamento: stessi dati, ANannullamento = 1

Il Ministero non manda ricevute: la prova dell'adempimento è la copia
conservata di allegato + .eml, che questo service archivia sempre.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from xml.sax.saxutils import escape

from app.models.dipendenti_db import get_dipendenti_conn
from app.services import email_service
from app.utils.locale_data import locale_data_dir

logger = logging.getLogger("trgb.intermittenti")

MAX_RIGHE_MODULO = 10
BARCODE_MODELLO = "ML-15-01"

# Regex dal modulo ministeriale — volutamente identica, anche dove è più
# restrittiva del dovuto (niente '+' nel local part, TLD di 2-3 caratteri):
# se il modulo la rifiuta, la rifiutiamo prima noi con un messaggio chiaro.
RE_EMAIL_MODULO = re.compile(r"^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]{2,}[.][a-zA-Z]{2,3}$")
RE_CF_PERSONA = re.compile(r"^[A-Z0-9]{16}$")
RE_CF_AZIENDA = re.compile(r"^\d{11}$")

DEFAULT_SETTINGS = {
    "uni_destinatario": "intermittenti@pec.lavoro.gov.it",
    "uni_oggetto": "Comunicazione chiamata lavoro intermittente",
    "uni_formato_data": "DD/MM/YYYY",
    "uni_cf_datore": "",
    "uni_email_mittente": "",
}


# ═════════════════════════════════════════════
# SETTINGS
# ═════════════════════════════════════════════

def get_settings() -> Dict[str, str]:
    conn = get_dipendenti_conn()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS dipendenti_settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        rows = conn.execute(
            "SELECT key, value FROM dipendenti_settings WHERE key LIKE 'uni_%'"
        ).fetchall()
    finally:
        conn.close()
    out = dict(DEFAULT_SETTINGS)
    for r in rows:
        if (r["value"] or "").strip() or r["key"] not in out:
            out[r["key"]] = r["value"]
    return out


def set_settings(valori: Dict[str, str]) -> Dict[str, str]:
    ammessi = set(DEFAULT_SETTINGS.keys())
    conn = get_dipendenti_conn()
    try:
        for k, v in valori.items():
            if k not in ammessi:
                continue
            conn.execute("""
                INSERT INTO dipendenti_settings (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                               updated_at = excluded.updated_at
            """, (k, str(v).strip()))
        conn.commit()
    finally:
        conn.close()
    return get_settings()


# ═════════════════════════════════════════════
# LAVORATORI
# ═════════════════════════════════════════════

def lavoratori(solo_intermittenti: bool = False) -> List[dict]:
    """Anagrafica ridotta per la pagina di configurazione."""
    conn = get_dipendenti_conn()
    try:
        where = "WHERE COALESCE(attivo,1) = 1"
        if solo_intermittenti:
            where += " AND COALESCE(intermittente,0) = 1"
        rows = conn.execute(f"""
            SELECT id, nome, cognome, nickname, ruolo,
                   codice_fiscale, codice_comunicazione,
                   COALESCE(intermittente,0) AS intermittente,
                   COALESCE(a_chiamata,0)    AS a_chiamata
            FROM dipendenti {where}
            ORDER BY cognome, nome
        """).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def set_lavoratore(dipendente_id: int, **campi) -> dict:
    """Aggiorna flag intermittente / CF / codice comunicazione di un lavoratore."""
    ammessi = ("intermittente", "codice_fiscale", "codice_comunicazione")
    sets, vals = [], []
    for k in ammessi:
        if k in campi:
            v = campi[k]
            if k == "intermittente":
                v = 1 if v else 0
            else:
                v = (str(v).strip().upper() or None) if v is not None else None
            sets.append(f"{k} = ?")
            vals.append(v)
    if not sets:
        raise ValueError("Nessun campo da aggiornare")
    conn = get_dipendenti_conn()
    try:
        conn.execute(
            f"UPDATE dipendenti SET {', '.join(sets)} WHERE id = ?", vals + [dipendente_id]
        )
        conn.commit()
        row = conn.execute("""
            SELECT id, nome, cognome, codice_fiscale, codice_comunicazione,
                   COALESCE(intermittente,0) AS intermittente
            FROM dipendenti WHERE id = ?
        """, (dipendente_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise ValueError(f"Dipendente {dipendente_id} inesistente")
    return dict(row)


# ═════════════════════════════════════════════
# RACCOLTA CHIAMATE DAI TURNI
# ═════════════════════════════════════════════

def _giorni_comunicati(dal: str, al: str) -> set:
    """
    Insieme di (dipendente_id, 'YYYY-MM-DD') già comunicati con esito INVIATA.
    Un ANNULLAMENTO inviato dopo riapre le giornate che copriva: il giorno torna
    da comunicare (è esattamente il senso dell'annullamento).
    Volumi minuscoli (poche centinaia di righe/anno) → si risolve in Python,
    dove la logica è leggibile, invece che in SQL acrobatico.
    """
    conn = get_dipendenti_conn()
    try:
        rows = conn.execute("""
            SELECT c.id, c.tipo, c.inviata_at, r.dipendente_id, r.data_inizio, r.data_fine
            FROM dipendenti_uni_comunicazioni c
            JOIN dipendenti_uni_comunicazioni_righe r ON r.comunicazione_id = c.id
            WHERE c.esito = 'INVIATA'
            ORDER BY c.inviata_at, c.id
        """).fetchall()
    finally:
        conn.close()

    stato: Dict[Tuple[int, str], bool] = {}
    for r in rows:
        d1 = r["data_inizio"]
        d2 = r["data_fine"] or r["data_inizio"]
        if d2 < dal or d1 > al:
            continue
        cur = datetime.strptime(d1, "%Y-%m-%d").date()
        end = datetime.strptime(d2, "%Y-%m-%d").date()
        while cur <= end:
            iso = cur.isoformat()
            if dal <= iso <= al:
                stato[(r["dipendente_id"], iso)] = (r["tipo"] != "ANNULLAMENTO")
            cur += timedelta(days=1)
    return {k for k, comunicato in stato.items() if comunicato}


def chiamate_da_comunicare(dal: str, al: str, reparto_id: Optional[int] = None) -> dict:
    """
    Giornate di lavoro degli intermittenti nel periodo, non ancora comunicate.

    Un turno entra solo se stato = 'CONFERMATO': gli OPZIONALE sono turni da
    confermare all'ultimo e comunicarli sarebbe dichiarare prestazioni che
    potrebbero non esserci. Doppio turno nello stesso giorno (pranzo + cena) =
    una sola giornata: al Ministero si comunica il giorno, non l'orario.
    """
    conn = get_dipendenti_conn()
    try:
        params: List[Any] = [dal, al]
        sql = """
            SELECT t.dipendente_id, t.data,
                   d.nome, d.cognome, d.nickname,
                   d.codice_fiscale, d.codice_comunicazione,
                   COALESCE(d.intermittente,0) AS intermittente
            FROM turni_calendario t
            JOIN dipendenti d ON d.id = t.dipendente_id
            WHERE t.data BETWEEN ? AND ?
              AND COALESCE(t.stato,'CONFERMATO') = 'CONFERMATO'
              AND COALESCE(d.intermittente,0) = 1
              AND COALESCE(d.attivo,1) = 1
        """
        if reparto_id:
            sql += " AND d.reparto_id = ?"
            params.append(reparto_id)
        sql += " GROUP BY t.dipendente_id, t.data ORDER BY d.cognome, t.data"
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    gia = _giorni_comunicati(dal, al)
    oggi = date.today().isoformat()

    chiamate, anomalie = [], []
    for r in rows:
        if (r["dipendente_id"], r["data"]) in gia:
            continue
        nome = f"{r['cognome']} {r['nome']}".strip()
        voce = {
            "dipendente_id": r["dipendente_id"],
            "nome": nome,
            "data": r["data"],
            "codice_fiscale": r["codice_fiscale"],
            "codice_comunicazione": r["codice_comunicazione"],
        }
        if not r["codice_fiscale"]:
            anomalie.append({**voce, "problema": "codice fiscale mancante in anagrafica"})
            continue
        if r["data"] < oggi:
            anomalie.append({
                **voce,
                "problema": "giornata già passata: la comunicazione è preventiva, non è più sanabile",
            })
            continue
        chiamate.append(voce)

    righe = compatta_periodi(chiamate)
    moduli = [righe[i:i + MAX_RIGHE_MODULO] for i in range(0, len(righe), MAX_RIGHE_MODULO)]
    return {
        "dal": dal, "al": al,
        "chiamate": chiamate,
        "righe": righe,
        "moduli": moduli,
        "n_moduli": len(moduli),
        "anomalie": anomalie,
    }


def compatta_periodi(chiamate: List[dict]) -> List[dict]:
    """
    Giornate → righe del modulo. Giorni di calendario STRETTAMENTE consecutivi
    dello stesso lavoratore diventano un periodo (data inizio + data fine);
    tutto il resto resta una riga per giornata.

    Consecutivi *di calendario*, non "dal primo all'ultimo turno": un periodo
    dichiara prestazione in TUTTI i giorni che contiene, e comunicare un giorno
    di riposo come lavorato sarebbe una dichiarazione falsa. Chi lavora
    lun-mer-ven ha tre righe, non una.
    """
    per_dip: Dict[int, List[dict]] = {}
    for c in chiamate:
        per_dip.setdefault(c["dipendente_id"], []).append(c)

    righe: List[dict] = []
    for dip_id, voci in per_dip.items():
        voci.sort(key=lambda v: v["data"])
        blocco: List[dict] = []
        for v in voci:
            if not blocco:
                blocco = [v]
                continue
            prec = datetime.strptime(blocco[-1]["data"], "%Y-%m-%d").date()
            cur = datetime.strptime(v["data"], "%Y-%m-%d").date()
            if (cur - prec).days == 1:
                blocco.append(v)
            else:
                righe.append(_riga(blocco))
                blocco = [v]
        if blocco:
            righe.append(_riga(blocco))

    righe.sort(key=lambda r: (r["data_inizio"], r["nome"]))
    return righe


def _riga(blocco: List[dict]) -> dict:
    primo, ultimo = blocco[0], blocco[-1]
    return {
        "dipendente_id": primo["dipendente_id"],
        "nome": primo["nome"],
        "codice_fiscale": primo["codice_fiscale"],
        "codice_comunicazione": primo["codice_comunicazione"],
        "data_inizio": primo["data"],
        # Giornata singola → data_fine VUOTA: il modulo rifiuta data_fine <= data_inizio
        "data_fine": ultimo["data"] if len(blocco) > 1 else None,
        "giorni": [b["data"] for b in blocco],
    }


# ═════════════════════════════════════════════
# XML
# ═════════════════════════════════════════════

def _fmt_data(iso: Optional[str], formato: str) -> str:
    if not iso:
        return ""
    d = datetime.strptime(iso, "%Y-%m-%d").date()
    return d.isoformat() if formato.upper().startswith("YYYY") else d.strftime("%d/%m/%Y")


def genera_xml(righe: List[dict], settings: Dict[str, str], annullamento: bool = False) -> str:
    """
    Costruisce il packet `datasets` dell'XFA nella forma prodotta dal modulo
    ufficiale (incluso il barcode ripetuto due volte, come nel campione reale:
    non è un errore di copia, è quello che il modulo emette).
    """
    if len(righe) > MAX_RIGHE_MODULO:
        raise ValueError(f"Massimo {MAX_RIGHE_MODULO} lavoratori per modulo, ricevuti {len(righe)}")

    fmt = settings.get("uni_formato_data", "DD/MM/YYYY")
    p = ['<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">'
         '<xfa:data><moduloIntermittenti><Campi>']
    p.append(f'<CFdatorelavoro>{escape(settings.get("uni_cf_datore", ""))}</CFdatorelavoro>')
    p.append(f'<BCbarcodeModello01>{BARCODE_MODELLO}</BCbarcodeModello01>')
    p.append(f'<BCbarcodeModello01>{BARCODE_MODELLO}</BCbarcodeModello01>')
    p.append(f'<EMmail>{escape(settings.get("uni_email_mittente", ""))}</EMmail>')
    p.append(f'<ANannullamento>{1 if annullamento else 0}</ANannullamento>')

    for i in range(1, MAX_RIGHE_MODULO + 1):
        r = righe[i - 1] if i <= len(righe) else None
        valori = (
            ("CFlavoratore", (r["codice_fiscale"] or "") if r else ""),
            ("CCcodcomunicazione", (r.get("codice_comunicazione") or "") if r else ""),
            ("DTdatainizio", _fmt_data(r["data_inizio"], fmt) if r else ""),
            ("DTdatafine", _fmt_data(r.get("data_fine"), fmt) if r else ""),
        )
        for tag, val in valori:
            p.append(f'<{tag}{i}>{escape(str(val))}</{tag}{i}>' if val else f'<{tag}{i}/>')

    p.append('</Campi></moduloIntermittenti></xfa:data></xfa:datasets>')
    return "".join(p)


# ═════════════════════════════════════════════
# VALIDAZIONE (le stesse regole del modulo)
# ═════════════════════════════════════════════

def valida(righe: List[dict], settings: Dict[str, str], controlla_date_passate: bool = True) -> List[str]:
    err: List[str] = []
    cf_datore = (settings.get("uni_cf_datore") or "").strip()
    mittente = (settings.get("uni_email_mittente") or "").strip()

    if not cf_datore:
        err.append("Manca il codice fiscale del datore di lavoro (Impostazioni → Intermittenti)")
    elif not (RE_CF_AZIENDA.match(cf_datore) or RE_CF_PERSONA.match(cf_datore.upper())):
        err.append(f"Codice fiscale datore non valido: {cf_datore}")

    if not mittente:
        err.append("Manca l'email del datore di lavoro, che il modulo esige (Impostazioni → Intermittenti)")
    elif not RE_EMAIL_MODULO.match(mittente):
        err.append(
            f"L'email '{mittente}' non passa la validazione del modulo ministeriale "
            "(niente '+', dominio con TLD di 2-3 caratteri)"
        )

    if not righe:
        err.append("Nessuna chiamata da comunicare")
    if len(righe) > MAX_RIGHE_MODULO:
        err.append(f"Massimo {MAX_RIGHE_MODULO} lavoratori per modulo")

    oggi = date.today().isoformat()
    for r in righe:
        chi = r.get("nome") or r.get("codice_fiscale")
        cf = (r.get("codice_fiscale") or "").upper()
        if not cf:
            err.append(f"{chi}: codice fiscale mancante")
        elif not RE_CF_PERSONA.match(cf):
            err.append(f"{chi}: codice fiscale non valido ({cf})")
        if not r.get("data_inizio"):
            err.append(f"{chi}: data inizio mancante")
            continue
        if r.get("data_fine") and r["data_fine"] <= r["data_inizio"]:
            err.append(
                f"{chi}: data fine ({r['data_fine']}) non successiva alla data inizio "
                f"({r['data_inizio']}) — per una giornata singola la data fine va lasciata vuota"
            )
        if controlla_date_passate and r["data_inizio"] < oggi:
            err.append(f"{chi}: {r['data_inizio']} è già passata, la comunicazione deve essere preventiva")
    return err


# ═════════════════════════════════════════════
# INVIO + ARCHIVIO
# ═════════════════════════════════════════════

def _archivio_dir(anno: int) -> Path:
    d = locale_data_dir() / "uploads" / "intermittenti" / str(anno)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _nome_file(cf_datore: str, suffix: str = "") -> str:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"UNI_Intermittenti_{cf_datore or 'CF'}_{stamp}{suffix}.xml"


def _registra(righe: List[dict], settings: dict, xml: str, esito, *, tipo: str,
              annulla_di_id: Optional[int], utente: Optional[str], suffix: str,
              xml_path: Path, eml_path: Optional[Path]) -> int:
    conn = get_dipendenti_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO dipendenti_uni_comunicazioni
                (tipo, annulla_di_id, periodo_dal, periodo_al, destinatario, oggetto,
                 mittente, cf_datore, allegato_nome, allegato_path, allegato_hash,
                 eml_path, esito, errore, inviata_at, creata_da)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            tipo, annulla_di_id,
            min(r["data_inizio"] for r in righe),
            max(r.get("data_fine") or r["data_inizio"] for r in righe),
            settings["uni_destinatario"], settings["uni_oggetto"],
            settings.get("uni_email_mittente"), settings.get("uni_cf_datore"),
            xml_path.name, str(xml_path),
            hashlib.sha256(xml.encode("utf-8")).hexdigest(),
            str(eml_path) if eml_path else None,
            "INVIATA" if esito.ok else "ERRORE", esito.errore,
            datetime.now().isoformat(timespec="seconds") if esito.ok else None,
            utente,
        ))
        com_id = cur.lastrowid
        for i, r in enumerate(righe, start=1):
            cur.execute("""
                INSERT INTO dipendenti_uni_comunicazioni_righe
                    (comunicazione_id, riga, dipendente_id, codice_fiscale,
                     codice_comunicazione, data_inizio, data_fine)
                VALUES (?,?,?,?,?,?,?)
            """, (com_id, i, r.get("dipendente_id"), (r["codice_fiscale"] or "").upper(),
                  r.get("codice_comunicazione"), r["data_inizio"], r.get("data_fine")))
        conn.commit()
        return com_id
    finally:
        conn.close()


def _spedisci(righe: List[dict], settings: dict, annullamento: bool) -> Tuple[str, Any, Path, Optional[Path]]:
    xml = genera_xml(righe, settings, annullamento=annullamento)
    raw = xml.encode("utf-8")
    nome = _nome_file(settings["uni_cf_datore"], "-ANN" if annullamento else "")
    anno = datetime.strptime(righe[0]["data_inizio"], "%Y-%m-%d").year
    xml_path = _archivio_dir(anno) / nome
    xml_path.write_bytes(raw)

    corpo = (
        "Annullamento di comunicazione di chiamata di lavoro intermittente.\n"
        if annullamento else
        "Comunicazione preventiva di chiamata di lavoro intermittente "
        "(art. 15 D.Lgs. 81/2015).\nModulo UNI-Intermittenti in allegato.\n"
    )
    esito = email_service.invia_email(
        settings["uni_destinatario"], settings["uni_oggetto"], corpo,
        allegati=[(nome, raw, "application/xml")],
        reply_to=settings.get("uni_email_mittente") or None,
    )
    eml_path = None
    if esito.eml:
        eml_path = xml_path.with_suffix(".eml")
        eml_path.write_bytes(esito.eml)
    return xml, esito, xml_path, eml_path


def comunica(righe: List[dict], dry_run: bool = False, utente: Optional[str] = None) -> dict:
    """
    Un modulo = una email = una riga di registro. Il chiamante che ha più di 10
    righe chiama più volte: gli allegati multipli nella stessa email vengono
    accettati ma non caricati a sistema (INL 8716/2019).
    """
    settings = get_settings()
    errori = valida(righe, settings)

    if errori or dry_run:
        return {
            "ok": not errori,
            "dry_run": True,
            "errori": errori,
            "xml": genera_xml(righe, settings) if not errori else None,
            "righe": righe,
            "destinatario": settings["uni_destinatario"],
            "oggetto": settings["uni_oggetto"],
            "smtp": email_service.stato(),
        }

    xml, esito, xml_path, eml_path = _spedisci(righe, settings, annullamento=False)
    com_id = _registra(righe, settings, xml, esito, tipo="NUOVA", annulla_di_id=None,
                       utente=utente, suffix="", xml_path=xml_path, eml_path=eml_path)
    if not esito.ok:
        logger.error("Comunicazione %s NON inviata: %s", com_id, esito.errore)

    return {
        "ok": esito.ok,
        "dry_run": False,
        "comunicazione_id": com_id,
        "errori": [esito.errore] if esito.errore else [],
        "allegato": xml_path.name,
        "destinatario": settings["uni_destinatario"],
        "righe": righe,
    }


def annulla(comunicazione_id: int, utente: Optional[str] = None) -> dict:
    """Rimanda lo stesso modulo con ANannullamento = 1 (procedura del Ministero)."""
    conn = get_dipendenti_conn()
    try:
        com = conn.execute(
            "SELECT * FROM dipendenti_uni_comunicazioni WHERE id = ?", (comunicazione_id,)
        ).fetchone()
        if not com:
            raise ValueError(f"Comunicazione {comunicazione_id} inesistente")
        if com["tipo"] == "ANNULLAMENTO":
            raise ValueError("Non si annulla un annullamento")
        if com["esito"] != "INVIATA":
            raise ValueError("Si annulla solo una comunicazione effettivamente inviata")
        righe_db = conn.execute("""
            SELECT r.dipendente_id, r.codice_fiscale, r.codice_comunicazione,
                   r.data_inizio, r.data_fine, d.nome, d.cognome
            FROM dipendenti_uni_comunicazioni_righe r
            LEFT JOIN dipendenti d ON d.id = r.dipendente_id
            WHERE r.comunicazione_id = ? ORDER BY r.riga
        """, (comunicazione_id,)).fetchall()
    finally:
        conn.close()

    righe = [{
        "dipendente_id": r["dipendente_id"],
        "nome": f"{r['cognome'] or ''} {r['nome'] or ''}".strip() or r["codice_fiscale"],
        "codice_fiscale": r["codice_fiscale"],
        "codice_comunicazione": r["codice_comunicazione"],
        "data_inizio": r["data_inizio"],
        "data_fine": r["data_fine"],
    } for r in righe_db]

    # L'annullamento riguarda giornate già comunicate, che possono essere appena
    # passate: qui il controllo "data non passata" non si applica.
    settings = get_settings()
    errori = valida(righe, settings, controlla_date_passate=False)
    if errori:
        return {"ok": False, "errori": errori, "comunicazione_id": None}

    xml, esito, xml_path, eml_path = _spedisci(righe, settings, annullamento=True)
    ann_id = _registra(righe, settings, xml, esito, tipo="ANNULLAMENTO",
                       annulla_di_id=comunicazione_id, utente=utente, suffix="-ANN",
                       xml_path=xml_path, eml_path=eml_path)

    return {"ok": esito.ok, "comunicazione_id": ann_id, "annulla_di_id": comunicazione_id,
            "errori": [esito.errore] if esito.errore else [], "allegato": xml_path.name}


# ═════════════════════════════════════════════
# REGISTRO
# ═════════════════════════════════════════════

def registro(limit: int = 100) -> List[dict]:
    conn = get_dipendenti_conn()
    try:
        rows = conn.execute("""
            SELECT c.*, COUNT(r.id) AS n_righe
            FROM dipendenti_uni_comunicazioni c
            LEFT JOIN dipendenti_uni_comunicazioni_righe r ON r.comunicazione_id = c.id
            GROUP BY c.id
            ORDER BY c.id DESC
            LIMIT ?
        """, (limit,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d.pop("allegato_path", None)      # path interni: non escono in API
            d.pop("eml_path", None)
            d["righe"] = [dict(x) for x in conn.execute("""
                SELECT r.riga, r.codice_fiscale, r.codice_comunicazione,
                       r.data_inizio, r.data_fine, d.nome, d.cognome
                FROM dipendenti_uni_comunicazioni_righe r
                LEFT JOIN dipendenti d ON d.id = r.dipendente_id
                WHERE r.comunicazione_id = ? ORDER BY r.riga
            """, (r["id"],)).fetchall()]
            out.append(d)
        return out
    finally:
        conn.close()


def allegato(comunicazione_id: int) -> Tuple[str, bytes]:
    """Ritorna l'allegato archiviato: è la prova dell'adempimento."""
    conn = get_dipendenti_conn()
    try:
        row = conn.execute(
            "SELECT allegato_nome, allegato_path FROM dipendenti_uni_comunicazioni WHERE id = ?",
            (comunicazione_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row or not row["allegato_path"]:
        raise ValueError(f"Nessun allegato per la comunicazione {comunicazione_id}")
    p = Path(row["allegato_path"])
    if not p.exists():
        raise FileNotFoundError(f"Allegato archiviato non trovato su disco: {p}")
    return row["allegato_nome"], p.read_bytes()
