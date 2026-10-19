# Modulo: platform (ponte cassa ↔ prenotazioni/clienti) — [core]
# -*- coding: utf-8 -*-
"""
Abbinamento conti di cassa ↔ prenotazioni ↔ clienti.

Perché un servizio platform: il conto sta nel modulo cassa (cassa_conti.sqlite3),
la prenotazione e il cliente nel modulo clienti/prenotazioni (clienti.sqlite3).
Per la regola 4 dell'architettura modulare nessuno dei due router chiama l'altro:
passano entrambi da qui. Doc: docs/analisi_ipratico_cloud.md §5, modulo_vendite.md §12.

Quando si usa: a fine servizio, dentro la Chiusura turno (chi chiude ha in mente
il servizio appena finito), e dopo da Impostazioni per i giorni rimasti indietro.

Regole dell'abbinamento automatico (decise con Marco 2026-10-18):
- stesso giorno e turno; il tavolo del conto è uno dei tavoli della prenotazione
  ("Tavolo 04C" in cassa = "4C"; "7+9+8+10" accetta il conto su "Tavolo 10");
- ora di apertura del tavolo entro la finestra (cassa_config, default 150 min)
  dall'ora della prenotazione;
- «sicuro» solo se il conto ha UNA prenotazione possibile e quella prenotazione
  UN solo conto possibile; altrimenti è una PROPOSTA da confermare con un tocco.
  TRGB non indovina mai da solo;
- quello che una persona ha deciso (manuale, di passaggio) non si tocca più.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from app.models.cassa_conti_db import get_cassa_conti_conn
from app.models.clienti_db import get_clienti_conn

STATI_PRESENTI = ("SEATED", "LEFT", "BILL", "ARRIVED", "PARTIALLY_ARRIVED")
DECISI = ("manuale", "passaggio")          # scelte di una persona: mai riscritte in automatico
FINESTRA_DEFAULT = 150
# Nomi che iPratico dà alle righe senza prodotto (prezzo libero, varianti): non sono piatti
NOMI_SENZA_PIATTO = {"no_name", "no name", ""}


# ============================================================
# TAVOLI
# ============================================================

def normalizza_tavolo(nome: Optional[str]) -> Optional[str]:
    """'Tavolo 04C' → '4C', '18' → '18', '4c' → '4C', 'Tavolone' → 'TAVOLONE'."""
    if not nome:
        return None
    t = re.sub(r"\s+", " ", str(nome)).strip().upper()
    t = re.sub(r"^TAVOLO\s*", "", t)
    m = re.fullmatch(r"0*(\d+)\s*([A-Z]?)", t)
    if m:
        return f"{int(m.group(1))}{m.group(2)}"
    return t or None


def tavoli_prenotazione(tavolo: Optional[str]) -> Set[str]:
    """'7+9+8+10' → {'7','9','8','10'}; '4c' → {'4C'}."""
    if not tavolo:
        return set()
    return {n for n in (normalizza_tavolo(p) for p in re.split(r"[+,/;]", tavolo)) if n}


def _alias(conn_cassa) -> Dict[str, Optional[str]]:
    return {r["nome_cassa"].strip().upper(): r["nome_trgb"]
            for r in conn_cassa.execute("SELECT nome_cassa, nome_trgb FROM cassa_tavoli_alias")}


def tavolo_trgb(nome_cassa: Optional[str], alias: Dict[str, Optional[str]]) -> Optional[str]:
    """Nome TRGB del tavolo di un conto: prima l'alias, poi le regole. None = da ignorare."""
    if not nome_cassa:
        return None
    chiave = nome_cassa.strip().upper()
    if chiave in alias:
        return normalizza_tavolo(alias[chiave]) if alias[chiave] else None
    return normalizza_tavolo(nome_cassa)


# ============================================================
# CONFIG
# ============================================================

def finestra_minuti(conn_cassa=None) -> int:
    chiudi = conn_cassa is None
    conn_cassa = conn_cassa or get_cassa_conti_conn()
    try:
        r = conn_cassa.execute("SELECT valore FROM cassa_config WHERE chiave = 'abbinamento_finestra_minuti'").fetchone()
        return max(15, int(r["valore"])) if r and r["valore"] else FINESTRA_DEFAULT
    except (TypeError, ValueError):
        return FINESTRA_DEFAULT
    finally:
        if chiudi:
            conn_cassa.close()


def _soglia_turno(conn_cli) -> str:
    """Stessa soglia pranzo/cena delle prenotazioni (prenotazioni_config)."""
    try:
        r = conn_cli.execute("SELECT valore FROM prenotazioni_config WHERE chiave = 'soglia_pranzo_cena'").fetchone()
        return (r["valore"] if r and r["valore"] else "15:00")[:5]
    except Exception:  # noqa: BLE001 — tabella assente su un DB nuovo
        return "15:00"


def _turno(ora_hhmm: Optional[str], soglia: str) -> str:
    return "pranzo" if ora_hhmm and ora_hhmm[:5] < soglia else "cena"


def _minuti(dt_txt: Optional[str]) -> Optional[int]:
    if not dt_txt:
        return None
    try:
        d = datetime.strptime(dt_txt[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    return d.hour * 60 + d.minute


def _minuti_ora(ora: Optional[str]) -> Optional[int]:
    if not ora:
        return None
    m = re.match(r"(\d{1,2}):(\d{2})", ora)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


# ============================================================
# ABBINAMENTO
# ============================================================

def _prenotazioni(conn_cli, data: str, turno: str) -> List[Dict[str, Any]]:
    segn = ", ".join("?" for _ in STATI_PRESENTI)
    righe = conn_cli.execute(f"""
        SELECT p.id, p.ora_pasto, p.pax, p.tavolo, p.stato, p.cliente_id, p.fonte, p.canale,
               p.nome_ospite, p.cognome_ospite,
               c.nome, c.cognome, c.vip
        FROM clienti_prenotazioni p
        LEFT JOIN clienti c ON c.id = p.cliente_id
        WHERE p.data_pasto = ? AND p.turno = ? AND p.stato IN ({segn})
        ORDER BY p.ora_pasto, p.id
    """, (data, turno, *STATI_PRESENTI)).fetchall()
    out = []
    for r in righe:
        d = dict(r)
        nome = " ".join(x for x in (d.get("nome"), d.get("cognome")) if x) or \
               " ".join(x for x in (d.get("nome_ospite"), d.get("cognome_ospite")) if x)
        d["nome_visibile"] = nome or None
        d["tavoli"] = sorted(tavoli_prenotazione(d.get("tavolo")))
        out.append(d)
    return out


def abbina(data: str, turno: str) -> Dict[str, Any]:
    """Calcola turni e abbinamenti automatici dei conti di un giorno/turno. Idempotente."""
    conn_c = get_cassa_conti_conn()
    conn_p = get_clienti_conn()
    try:
        soglia = _soglia_turno(conn_p)
        finestra = finestra_minuti(conn_c)
        alias = _alias(conn_c)

        # 1) turno di ogni conto del giorno (dall'ora di apertura)
        for r in conn_c.execute("SELECT id, aperto_at, chiuso_at FROM cassa_conti WHERE data_rif = ?", (data,)).fetchall():
            ora = (r["aperto_at"] or r["chiuso_at"] or "")[11:16]
            conn_c.execute("UPDATE cassa_conti SET turno = ? WHERE id = ?", (_turno(ora, soglia), r["id"]))

        conti = [dict(r) for r in conn_c.execute(
            "SELECT id, tavolo, aperto_at, coperti, abbinamento, prenotazione_id FROM cassa_conti "
            "WHERE data_rif = ? AND turno = ?", (data, turno))]
        prenot = _prenotazioni(conn_p, data, turno)
        per_id = {p["id"]: p for p in prenot}

        # Prenotazioni già prese da una decisione di una persona: fuori dal gioco
        prese = {c["prenotazione_id"] for c in conti if c["abbinamento"] in DECISI and c["prenotazione_id"]}

        liberi = []
        for c in conti:
            if c["abbinamento"] in DECISI:
                continue
            t = tavolo_trgb(c["tavolo"], alias)
            if not t:
                # senza tavolo (banco) o tavolo da ignorare: niente cliente da cercare
                conn_c.execute("UPDATE cassa_conti SET abbinamento = 'banco', prenotazione_id = NULL, "
                               "cliente_id = NULL WHERE id = ?", (c["id"],))
                continue
            c["_t"] = t
            liberi.append(c)

        # 2) coppie possibili (tavolo compatibile, ora nella finestra)
        candidati: Dict[int, List[Tuple[int, int, int]]] = {}
        per_pren: Dict[int, Set[int]] = {}
        for c in liberi:
            mc = _minuti(c["aperto_at"])
            for p in prenot:
                if p["id"] in prese or c["_t"] not in p["tavoli"]:
                    continue
                mp = _minuti_ora(p["ora_pasto"])
                diff = abs(mc - mp) if (mc is not None and mp is not None) else finestra
                if diff > finestra:
                    continue
                dpax = abs((c["coperti"] or 0) - (p["pax"] or 0)) if c["coperti"] else 0
                candidati.setdefault(c["id"], []).append((diff, dpax, p["id"]))
                per_pren.setdefault(p["id"], set()).add(c["id"])

        # 3) assegnazione: prima le coppie più vicine (ora, poi coperti)
        coppie = sorted((d, dp, cid, pid) for cid, lst in candidati.items() for d, dp, pid in lst)
        assegnato_c: Dict[int, int] = {}
        usate: Set[int] = set()
        for d, dp, cid, pid in coppie:
            if cid in assegnato_c or pid in usate:
                continue
            assegnato_c[cid] = pid
            usate.add(pid)

        sicuri = proposti = senza = 0
        for c in liberi:
            pid = assegnato_c.get(c["id"])
            if not pid:
                conn_c.execute("UPDATE cassa_conti SET abbinamento = 'da_fare', prenotazione_id = NULL, "
                               "cliente_id = NULL WHERE id = ?", (c["id"],))
                senza += 1
                continue
            sicuro = len(candidati.get(c["id"], [])) == 1 and len(per_pren.get(pid, ())) == 1
            stato = "auto" if sicuro else "proposto"
            conn_c.execute(
                "UPDATE cassa_conti SET abbinamento = ?, prenotazione_id = ?, cliente_id = ?, "
                "abbinato_da = 'automatico', abbinato_at = datetime('now','localtime') WHERE id = ?",
                (stato, pid, per_id[pid]["cliente_id"], c["id"]),
            )
            sicuri += sicuro
            proposti += (not sicuro)
        conn_c.commit()
        return {"conti": len(conti), "sicuri": sicuri, "proposti": proposti, "senza": senza}
    finally:
        conn_c.close()
        conn_p.close()


# ============================================================
# VISTA DEL SERVIZIO (per la Chiusura turno)
# ============================================================

def vista_servizio(data: str, turno: str) -> Dict[str, Any]:
    conn_c = get_cassa_conti_conn()
    conn_p = get_clienti_conn()
    try:
        prenot = _prenotazioni(conn_p, data, turno)
        per_id = {p["id"]: p for p in prenot}
        conti = [dict(r) for r in conn_c.execute(
            "SELECT id, tavolo, sala, coperti, aperto_at, chiuso_at, durata_min, totale, documenti, romana, "
            "abbinamento, prenotazione_id, cliente_id, abbinato_da FROM cassa_conti "
            "WHERE data_rif = ? AND turno = ? ORDER BY aperto_at, id", (data, turno))]

        # nomi dei clienti scelti a mano (anche fuori dalle prenotazioni del turno)
        ids = {c["cliente_id"] for c in conti if c["cliente_id"]}
        nomi: Dict[int, Dict[str, Any]] = {}
        if ids:
            segn = ", ".join("?" for _ in ids)
            for r in conn_p.execute(f"SELECT id, nome, cognome, vip FROM clienti WHERE id IN ({segn})", tuple(ids)):
                nomi[r["id"]] = {"nome": " ".join(x for x in (r["nome"], r["cognome"]) if x), "vip": r["vip"]}

        for c in conti:
            c["righe"] = [dict(r) for r in conn_c.execute(
                "SELECT nome, categoria, portata, quantita, totale FROM cassa_conti_righe "
                "WHERE conto_id = ? AND servizio = 0 ORDER BY COALESCE(portata, 99), id", (c["id"],))]
            p = per_id.get(c["prenotazione_id"]) if c["prenotazione_id"] else None
            c["prenotazione"] = ({"id": p["id"], "ora": (p["ora_pasto"] or "")[:5], "pax": p["pax"],
                                  "tavolo": p["tavolo"], "nome": p["nome_visibile"], "fonte": p["fonte"]}
                                 if p else None)
            c["cliente"] = ({"id": c["cliente_id"], **nomi[c["cliente_id"]]}
                            if c["cliente_id"] in nomi else None)

        usate = {c["prenotazione_id"] for c in conti if c["prenotazione_id"]}
        libere = [{"id": p["id"], "ora": (p["ora_pasto"] or "")[:5], "pax": p["pax"], "tavolo": p["tavolo"],
                   "nome": p["nome_visibile"], "cliente_id": p["cliente_id"]}
                  for p in prenot if p["id"] not in usate]

        conta = {k: sum(1 for c in conti if c["abbinamento"] == k)
                 for k in ("auto", "proposto", "manuale", "passaggio", "da_fare", "banco")}
        conta["senza_nome"] = sum(1 for c in conti
                                  if c["abbinamento"] in ("auto", "manuale", "proposto") and not c["cliente_id"])
        return {"data": data, "turno": turno, "conti": conti, "prenotazioni_libere": libere, "conteggi": conta}
    finally:
        conn_c.close()
        conn_p.close()


# ============================================================
# SCELTE DI UNA PERSONA
# ============================================================

def _crea_cliente(conn_p, nome: str, cognome: str, telefono: Optional[str]) -> int:
    """Come «Crea nuovo cliente» del form prenotazioni: origine diretto, protetto."""
    cur = conn_p.execute(
        "INSERT INTO clienti (nome, cognome, telefono, origine, protetto) VALUES (?, ?, ?, 'diretto', 1)",
        (nome or "", cognome, telefono or None),
    )
    return cur.lastrowid


def decidi(conto_id: int, scelta: Dict[str, Any], autore: str) -> Dict[str, Any]:
    """
    scelta.tipo:
      'conferma'      → accetta la proposta (o l'auto) così com'è
      'prenotazione'  → questo conto è la prenotazione `prenotazione_id`
      'cliente'       → è il cliente `cliente_id` (senza prenotazione, o per dare un nome a un walk-in)
      'nuovo_cliente' → crea il cliente (`cognome` obbligatorio, `nome`, `telefono`) e lo collega
      'passaggio'     → cliente di passaggio, nessun nome
      'riapri'        → torna da sistemare
    Se il conto è collegato a una prenotazione senza cliente (walk-in), il cliente
    scelto si scrive anche sulla prenotazione: così conta come visita.
    """
    tipo = (scelta.get("tipo") or "").strip()
    conn_c = get_cassa_conti_conn()
    conn_p = get_clienti_conn()
    try:
        conto = conn_c.execute("SELECT * FROM cassa_conti WHERE id = ?", (conto_id,)).fetchone()
        if not conto:
            raise LookupError("conto non trovato")
        pren_id = conto["prenotazione_id"]
        cliente_id = conto["cliente_id"]

        if tipo == "conferma":
            if not pren_id and not cliente_id:
                raise ValueError("non c'è niente da confermare")
            stato = "manuale"
        elif tipo == "prenotazione":
            pren_id = int(scelta.get("prenotazione_id") or 0)
            p = conn_p.execute("SELECT id, cliente_id FROM clienti_prenotazioni WHERE id = ?", (pren_id,)).fetchone()
            if not p:
                raise ValueError("prenotazione non trovata")
            altro = conn_c.execute(
                "SELECT id FROM cassa_conti WHERE prenotazione_id = ? AND id != ? AND abbinamento IN ('manuale','passaggio')",
                (pren_id, conto_id)).fetchone()
            if altro:
                raise ValueError("questa prenotazione è già collegata a un altro conto")
            # se un altro conto l'aveva in automatico, la lascia
            conn_c.execute("UPDATE cassa_conti SET abbinamento = 'da_fare', prenotazione_id = NULL, cliente_id = NULL "
                           "WHERE prenotazione_id = ? AND id != ?", (pren_id, conto_id))
            cliente_id = p["cliente_id"]
            stato = "manuale"
        elif tipo == "cliente":
            cliente_id = int(scelta.get("cliente_id") or 0)
            if not conn_p.execute("SELECT 1 FROM clienti WHERE id = ?", (cliente_id,)).fetchone():
                raise ValueError("cliente non trovato")
            stato = "manuale"
        elif tipo == "nuovo_cliente":
            cognome = (scelta.get("cognome") or "").strip()
            if not cognome:
                raise ValueError("il cognome è obbligatorio")
            cliente_id = _crea_cliente(conn_p, (scelta.get("nome") or "").strip(), cognome,
                                       (scelta.get("telefono") or "").strip())
            stato = "manuale"
        elif tipo == "passaggio":
            pren_id, cliente_id, stato = None, None, "passaggio"
        elif tipo == "riapri":
            pren_id, cliente_id, stato = None, None, "da_fare"
        else:
            raise ValueError("scelta non valida")

        # walk-in: la prenotazione senza cliente prende il cliente scelto
        if pren_id and cliente_id and tipo in ("cliente", "nuovo_cliente", "prenotazione", "conferma"):
            conn_p.execute("UPDATE clienti_prenotazioni SET cliente_id = ? WHERE id = ? AND cliente_id IS NULL",
                           (cliente_id, pren_id))
        conn_p.commit()

        conn_c.execute(
            "UPDATE cassa_conti SET abbinamento = ?, prenotazione_id = ?, cliente_id = ?, abbinato_da = ?, "
            "abbinato_at = datetime('now','localtime') WHERE id = ?",
            (stato, pren_id, cliente_id, autore, conto_id),
        )
        conn_c.commit()
        return {"ok": True, "conto_id": conto_id, "abbinamento": stato,
                "prenotazione_id": pren_id, "cliente_id": cliente_id}
    finally:
        conn_c.close()
        conn_p.close()


def da_sistemare(giorni: int = 60) -> List[Dict[str, Any]]:
    """Giorni/turni con conti ancora da sistemare (da fare o proposti), i più recenti prima."""
    conn_c = get_cassa_conti_conn()
    try:
        return [dict(r) for r in conn_c.execute("""
            SELECT data_rif AS data, turno,
                   SUM(abbinamento = 'da_fare') AS da_fare,
                   SUM(abbinamento = 'proposto') AS proposti,
                   COUNT(*) AS conti
            FROM cassa_conti
            WHERE data_rif >= date('now', ?) AND turno IS NOT NULL
            GROUP BY data_rif, turno
            HAVING SUM(abbinamento IN ('da_fare','proposto')) > 0
            ORDER BY data_rif DESC, turno DESC
        """, (f"-{int(giorni)} days",))]
    finally:
        conn_c.close()


# ============================================================
# TAVOLI: corrispondenze (Impostazioni)
# ============================================================

def tavoli_cassa() -> List[Dict[str, Any]]:
    """Ogni nome di tavolo visto nei conti, con il tavolo TRGB che ne esce e l'eventuale alias."""
    conn_c = get_cassa_conti_conn()
    try:
        alias = _alias(conn_c)
        nomi = [r["tavolo"] for r in conn_c.execute(
            "SELECT tavolo, COUNT(*) n FROM cassa_conti WHERE tavolo IS NOT NULL GROUP BY tavolo ORDER BY tavolo")]
        out = []
        for n in nomi:
            k = n.strip().upper()
            out.append({"nome_cassa": n, "alias": k in alias, "nome_trgb": tavolo_trgb(n, alias)})
        return out
    finally:
        conn_c.close()


def imposta_alias(nome_cassa: str, nome_trgb: Optional[str], togli: bool = False) -> None:
    conn_c = get_cassa_conti_conn()
    try:
        if togli:
            conn_c.execute("DELETE FROM cassa_tavoli_alias WHERE UPPER(nome_cassa) = UPPER(?)", (nome_cassa,))
        else:
            conn_c.execute(
                "INSERT INTO cassa_tavoli_alias (nome_cassa, nome_trgb) VALUES (?, ?) "
                "ON CONFLICT(nome_cassa) DO UPDATE SET nome_trgb = excluded.nome_trgb, "
                "aggiornato_at = datetime('now','localtime')",
                (nome_cassa.strip(), (nome_trgb or "").strip() or None),
            )
        conn_c.commit()
    finally:
        conn_c.close()


def imposta_finestra(minuti: int) -> int:
    minuti = max(15, min(600, int(minuti)))
    conn_c = get_cassa_conti_conn()
    try:
        conn_c.execute("INSERT INTO cassa_config (chiave, valore) VALUES ('abbinamento_finestra_minuti', ?) "
                       "ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore", (str(minuti),))
        conn_c.commit()
        return minuti
    finally:
        conn_c.close()


# ============================================================
# SCHEDA CLIENTE: cosa ha mangiato e speso
# ============================================================

def consumi_cliente(cliente_id: int, limite_visite: int = 100) -> Dict[str, Any]:
    """
    I conti del cliente: quelli collegati direttamente e quelli collegati a una
    sua prenotazione (così vale anche dopo un'unione di clienti o un nome dato
    dopo). Le proposte non confermate valgono, ma sono segnate «da confermare».
    """
    conn_p = get_clienti_conn()
    try:
        pren = [r["id"] for r in conn_p.execute(
            "SELECT id FROM clienti_prenotazioni WHERE cliente_id = ?", (cliente_id,))]
    finally:
        conn_p.close()

    conn_c = get_cassa_conti_conn()
    try:
        cond, args = "cliente_id = ?", [cliente_id]
        if pren:
            cond += f" OR prenotazione_id IN ({', '.join('?' for _ in pren)})"
            args += pren
        conti = [dict(r) for r in conn_c.execute(f"""
            SELECT id, data_rif, turno, aperto_at, durata_min, tavolo, coperti, totale, romana, abbinamento, prenotazione_id
            FROM cassa_conti
            WHERE ({cond}) AND abbinamento IN ('auto','manuale','proposto')
            ORDER BY data_rif DESC, aperto_at DESC
        """, args)]

        piatti: Dict[str, Dict[str, Any]] = {}
        bere: Dict[str, Dict[str, Any]] = {}
        for c in conti:
            righe = [dict(r) for r in conn_c.execute(
                "SELECT nome, categoria, famiglia, portata, quantita, totale FROM cassa_conti_righe "
                "WHERE conto_id = ? AND servizio = 0 AND totale <> 0 ORDER BY COALESCE(portata, 99), id", (c["id"],))]
            c["righe"] = righe
            visti = set()
            for r in righe:
                if not r["nome"] or r["nome"].strip().lower() in NOMI_SENZA_PIATTO:
                    continue  # righe senza nome (prezzo libero, varianti): nel conto sì, tra i preferiti no
                dove = bere if r["famiglia"] == "beverage" else piatti
                v = dove.setdefault(r["nome"], {"nome": r["nome"], "categoria": r["categoria"],
                                                "volte": 0, "quantita": 0.0, "spesa": 0.0, "ultima": c["data_rif"]})
                if r["nome"] not in visti:
                    v["volte"] += 1
                    visti.add(r["nome"])
                v["quantita"] += r["quantita"] or 0
                v["spesa"] = round(v["spesa"] + (r["totale"] or 0), 2)

        n = len(conti)
        totale = round(sum(c["totale"] or 0 for c in conti), 2)
        coperti = sum(c["coperti"] or 0 for c in conti)
        return {
            "cliente_id": cliente_id,
            "visite": n,
            "spesa_totale": totale,
            "spesa_media_visita": round(totale / n, 2) if n else None,
            "spesa_media_coperto": round(totale / coperti, 2) if coperti else None,
            "prima": conti[-1]["data_rif"] if conti else None,
            "ultima": conti[0]["data_rif"] if conti else None,
            # piatti: quante volte li ha presi; da bere: quanto ci ha speso (vini in cima, acqua in fondo)
            "piatti_preferiti": sorted(piatti.values(), key=lambda x: (-x["volte"], -x["spesa"]))[:10],
            "da_bere": sorted(bere.values(), key=lambda x: -x["spesa"])[:8],
            "conti": conti[:limite_visite],
        }
    finally:
        conn_c.close()


def sposta_cliente(da_id: int, a_id: int) -> int:
    """Unione di clienti (merge nel modulo Clienti): i conti seguono il cliente che resta."""
    conn_c = get_cassa_conti_conn()
    try:
        n = conn_c.execute("UPDATE cassa_conti SET cliente_id = ? WHERE cliente_id = ?", (a_id, da_id)).rowcount
        conn_c.commit()
        return n
    finally:
        conn_c.close()
