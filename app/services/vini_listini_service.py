# Modulo: vini (multi-fornitore) — [core]
"""
Vini multi-fornitore — VMF.4: listini dei fornitori (2026-11-04).
Spec: docs/spec_vini_multifornitore.md

Si carica il PDF di un listino (0,75, Marenzi, …) scegliendo il fornitore:
TRGB legge le righe, propone per ognuna il vino della cantina e, quando
confermi, scrive un prezzo `listino` di quel fornitore per quell'annata
(`vini_prezzi_fornitore`, fonte `listino`). Decisione D5: il listino è un
riferimento, il costo in carta resta l'ultimo pagato.

LETTURA DEL PDF: le parole di ogni pagina sono rimesse in righe; il prezzo è
l'ULTIMO numero con la virgola della riga (0,75: «PREZZO» a bottiglia;
Marenzi: «Unitario»). I listini a pallini (0,75) hanno il produttore a
sinistra del pallino e vale per le righe sotto; nei gestionali tipo Marenzi la
riga senza prezzo sotto l'articolo è il produttore.

ABBINAMENTO: il produttore del vino deve comparire nella riga; poi conta
quante parole del vino (nome, denominazione) tornano, l'annata e il formato
(magnum, mezza). Ogni vino prende al massimo una riga (la migliore). Una riga
confermata in un listino precedente dello stesso fornitore fa da memoria.
Soglie nei settings vini: `vmf_listino_soglia_sicuri`, `vmf_listino_soglia_min`,
`vmf_listino_scarto_max_pct` (oltre, la riga non arriva spuntata: magnum letto
come bottiglia, cassa da più bottiglie…).

Tutte le scritture su vini_magazzino.sqlite3. Nessun import da router.
"""

from __future__ import annotations

import io
import os
import re
import sqlite3
import unicodedata
import uuid
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.models.vini_magazzino_db import get_magazzino_connection
from app.services import vini_fatture_service as vfat
from app.services import vini_fornitori_service as vmf
from app.services.vini_widget_settings_service import get_widget_setting

CARTELLA = "vini_listini"
MAX_BYTES = 30 * 1024 * 1024

_PREZZO = re.compile(r"^\d{1,4}(?:\.\d{3})*,\d{2,4}$")
_PALLINI = set("●■◉○•▪◆")
_UM = re.compile(r"^(CS|CT|BT|CF|PZ|FS|KK|LT|N|KG)$")
_CONFEZ = re.compile(r"^(\d{1,2}\*?|\d+/\d+\*?|\d+\*|\d+\+\d+)$")
_CODICE = re.compile(r"^\d[A-Z]{1,3}\d+$")

# ROSSO/BIANCO qui contano: «Bakkanali Rosso» e «Bakkanali Rosa» sono vini diversi
_VUOTE = (vfat._PAROLE_VUOTE - {"ROSSO", "BIANCO"}) | {
    "PIEMONTE", "TOSCANA", "LOMBARDIA", "VENETO", "FRIULI", "SICILIA", "SARDEGNA", "UMBRIA", "MARCHE",
    "ABRUZZO", "PUGLIA", "CAMPANIA", "LIGURIA", "ALTO", "ADIGE", "TRENTINO", "EMILIA", "ROMAGNA",
    "CALABRIA", "BASILICATA", "MOLISE", "LAZIO", "VALLE", "AOSTA", "FRANCIA", "SPAGNA", "PORTOGALLO",
    "AUSTRIA", "GERMANIA", "SEGUE", "NOVITA", "BIO", "MAGNUM", "CASSA", "LEGNO", "RARE", "RARITA",
    "OMAGGIO", "CHIEDERE", "DISPONIB", "ANNI", "SPUM", "CHAMP", "CHAMPAGNE", "AOC", "AOP", "DOMAINE",
    "CHATEAU", "FAMILLE", "VINTAGE", "MILLESIMATO", "FRANCIACORTA", "RIS", "RISERVA", "CLASSICO",
    "SUPERIORE", "CRU", "BRUT", "VAP", "CON", "PER", "DEI", "DELLE", "DEGLI", "AND", "DES", "DU", "SUR",
    "ROUGE", "BLANC", "VILLA", "ASTUCCIATO", "ASTUCCIO",
}


# ─────────────────────────────────────────────
# UTILITÀ
# ─────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    c = get_magazzino_connection()
    c.row_factory = sqlite3.Row
    return c


def _soglia(chiave: str, default: int) -> int:
    try:
        return int(float(get_widget_setting(chiave, default=default)))
    except (TypeError, ValueError):
        return default


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Z0-9]+", " ", s.upper()).strip()


def _tok(s: str) -> set:
    return {t for t in _norm(s).split() if len(t) >= 3 and not t.isdigit() and t not in _VUOTE}


def _comuni(a: set, b: set) -> set:
    """Parole in comune; «COLL» vale «COLLINE» (abbreviazioni dei listini)."""
    out = set()
    for x in a:
        for y in b:
            if x == y or (len(x) >= 4 and len(y) >= 4 and (x.startswith(y) or y.startswith(x))):
                out.add(x)
                break
    return out


def annate(testo: str) -> List[str]:
    return re.findall(r"\b(19[5-9]\d|20[0-4]\d)\b", testo or "")


def formato(testo: str) -> str:
    t = (testo or "")
    if "½" in t or re.search(r"\b0[,.]375\b", t):
        return "MZ"
    return vfat.formato(t)


def chiave(produttore: str, descrizione: str) -> str:
    """La «memoria» di una riga: produttore + descrizione senza annate."""
    s = _norm(f"{produttore or ''} {descrizione or ''}")
    return re.sub(r"\s+", " ", re.sub(r"\b(19|20)\d\d\b", " ", s)).strip()


def _num(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


# ─────────────────────────────────────────────
# LETTURA DEL PDF
# ─────────────────────────────────────────────

def _linee(pdf_bytes: bytes) -> List[Tuple[int, List[Dict[str, Any]]]]:
    import pdfplumber
    out = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for n, pagina in enumerate(pdf.pages, 1):
            parole = pagina.extract_words(x_tolerance=1.5)
            parole.sort(key=lambda w: (round(w["top"]), w["x0"]))
            linee: List[list] = []
            for w in parole:
                if linee and abs(w["top"] - linee[-1][0]) <= 3:
                    linee[-1][1].append(w)
                else:
                    linee.append([w["top"], [w]])
            for _, l in linee:
                l.sort(key=lambda w: w["x0"])
                out.append((n, l))
    return out


def data_listino(testo: str) -> Optional[str]:
    """«Validi al: 02/11/2026» → 2026-11-02; «LISTINO VENDITA 10/2026» → 2026-10-01."""
    m = re.search(r"\b(\d{1,2})/(\d{1,2})/(20\d\d)\b", testo or "")
    try:
        if m:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        m = re.search(r"\b(\d{1,2})/(20\d\d)\b", testo or "")
        if m:
            return date(int(m.group(2)), int(m.group(1)), 1).isoformat()
    except ValueError:
        return None
    return None


def leggi_pdf(pdf_bytes: bytes) -> Dict[str, Any]:
    """Righe con prezzo del listino: pagina, produttore, descrizione, prezzo."""
    tutte = _linee(pdf_bytes)
    if not tutte:
        raise ValueError("Il PDF non ha testo leggibile (è una scansione?)")
    a_pallini = sum(1 for _, l in tutte for w in l if w["text"][:1] in _PALLINI) > 20
    testa = " ".join(w["text"] for _, l in tutte[:40] for w in l)
    righe: List[Dict[str, Any]] = []
    produttore = ""
    # colonna del pallino: a sinistra il produttore, a destra il vino (alcuni
    # pallini non escono come carattere, la posizione sì)
    xs = [round(w["x0"]) for _, l in tutte for w in l if w["text"][:1] in _PALLINI]
    bx = max(set(xs), key=xs.count) if a_pallini and xs else None
    for pagina, l in tutte:
        if bx is not None:
            sx = " ".join(w["text"] for w in l if w["x1"] <= bx - 1).strip()
            l = [w for w in l if w["x1"] > bx - 1 and w["text"][:1] not in _PALLINI]
            if sx and sx.lower() != "segue":
                produttore = sx
        testi = [w["text"] for w in l]
        prezzi = [i for i, t in enumerate(testi) if _PREZZO.match(t)]
        if not prezzi:
            riga = " ".join(testi).strip()
            # gestionali tipo Marenzi: sotto l'articolo, la riga col produttore
            if (not a_pallini and righe and righe[-1]["pagina"] == pagina and not righe[-1]["produttore"]
                    and riga and not riga.startswith("*") and "/" not in riga and len(testi) <= 6):
                righe[-1]["produttore"] = riga
            continue
        prezzo = _num(testi[prezzi[-1]])
        corpo = testi[:prezzi[0]]
        um = [i for i in range(max(0, len(corpo) - 3), len(corpo)) if _UM.match(corpo[i])]
        if um:
            corpo = corpo[:um[0]]
        else:
            while corpo and _CONFEZ.match(corpo[-1]):
                corpo.pop()
        if corpo and _CODICE.match(corpo[0]):
            corpo = corpo[1:]
        descr = " ".join(t for t in corpo if t[:1] not in _PALLINI).strip()
        if not descr or prezzo <= 0:
            continue
        righe.append({"pagina": pagina, "produttore": produttore if a_pallini else "",
                      "descrizione": descr, "prezzo": round(prezzo, 4), "_prod_affidabile": a_pallini})
    return {"righe": righe, "data": data_listino(testa)}


# ─────────────────────────────────────────────
# ABBINAMENTO
# ─────────────────────────────────────────────

def _bottiglie(cur: sqlite3.Cursor) -> List[Dict[str, Any]]:
    out = []
    for b in cur.execute(
        "SELECT id, madre_id, PRODUTTORE, DESCRIZIONE, DENOMINAZIONE, ANNATA, FORMATO, "
        "COALESCE(QTA_TOTALE,0) AS qta, EURO_LISTINO, SCONTO FROM vini_bottiglie"
    ).fetchall():
        d = dict(b)
        prod = re.sub(r"\(.*?\)|\s[-–]\s.*$", "", d["PRODUTTORE"] or "")
        d["_p"] = _tok(prod)
        senza_par = re.sub(r"\(.*?\)", " ", d["DESCRIZIONE"] or "")   # «(100% Nebbiolo)»
        d["_d"] = _tok(f"{senza_par} {d['DENOMINAZIONE'] or ''}") - d["_p"]
        d["_f"] = (d["FORMATO"] or "BT").strip().upper() or "BT"
        out.append(d)
    return out


def candidati(r: Dict[str, Any], bott: List[Dict[str, Any]]) -> List[Tuple[int, Dict[str, Any]]]:
    testo = f"{r.get('produttore') or ''} {r['descrizione']}"
    tutto = _tok(testo)
    descr = _tok(r["descrizione"])
    prod_riga = _tok(r.get("produttore") or "") if r.get("_prod_affidabile") else tutto
    fmt = formato(r["descrizione"])
    ann = annate(r["descrizione"])
    out = []
    for b in bott:
        if not b["_p"] or b["_f"] != fmt:
            continue
        cp = _comuni(b["_p"], prod_riga)
        if not cp:
            continue
        resto = {x for x in (descr if r.get("_prod_affidabile") else tutto) if not _comuni({x}, b["_p"])}
        cd = _comuni(resto, b["_d"])
        if resto and b["_d"] and not cd:
            continue
        copertura = len(cd) / len(resto) if resto else 1.0
        tornano = _comuni(b["_d"], resto)
        ritorno = len(tornano) / len(b["_d"]) if b["_d"] else 1.0
        p = 40 * len(cp) / len(b["_p"]) + 40 * copertura + 20 * ritorno
        p -= 15 * len(b["_d"] - tornano)         # parole del vino che il listino non dice (un cru, un nome)
        if re.search(r"ASTUCC|C\.? ?LEGNO|CASSA", testo, re.I):
            p -= 5                               # la confezione regalo costa di più: meglio la bottiglia nuda
        if ann:
            p += 10 if (b["ANNATA"] or "").strip() in ann else -15
        out.append((round(p), b))
    out.sort(key=lambda x: (-x[0], -(x[1]["qta"] or 0)))
    return out


def _annata_della_madre(bott: List[Dict[str, Any]], madre_id: int, fmt: str, ann: List[str]) -> Optional[Dict[str, Any]]:
    """Per la memoria: dentro lo stesso vino, l'annata giusta del listino nuovo."""
    cand = [b for b in bott if b["madre_id"] == madre_id and b["_f"] == fmt]
    if not cand:
        return None
    for b in cand:
        if (b["ANNATA"] or "").strip() in ann:
            return b
    cand.sort(key=lambda b: (-(1 if b["qta"] else 0), -(int(b["ANNATA"]) if (b["ANNATA"] or "").isdigit() else 0)))
    return cand[0]


def _proponi(righe: List[Dict[str, Any]], bott: List[Dict[str, Any]],
             memoria: Dict[str, int]) -> None:
    """Riempie bottiglia_id/punteggio/stato: ogni vino al massimo una riga."""
    minimo = _soglia("vmf_listino_soglia_min", 55)
    proposte = []
    for i, r in enumerate(righe):
        r["bottiglia_id"], r["punteggio"], r["stato"] = None, None, "nessuna"
        mid = memoria.get(r["chiave"])
        if mid:
            b = _annata_della_madre(bott, mid, formato(r["descrizione"]), annate(r["descrizione"]))
            if b:
                proposte.append((101, i, b))
                continue
        for p, b in candidati(r, bott)[:5]:
            if p >= minimo:
                proposte.append((p, i, b))
    def distanza(x):  # a parità di punteggio, il prezzo più vicino al costo che c'è
        rif = x[2].get("EURO_LISTINO") or 0
        return abs(righe[x[1]]["prezzo"] / rif - 1) if rif else 9
    proposte.sort(key=lambda x: (-x[0], distanza(x), -(x[2]["qta"] or 0)))
    prese_r, prese_b = set(), set()
    for p, i, b in proposte:
        if i in prese_r or b["id"] in prese_b:
            continue
        prese_r.add(i)
        prese_b.add(b["id"])
        righe[i].update(bottiglia_id=b["id"], punteggio=min(p, 100), stato="proposta")


# ─────────────────────────────────────────────
# CARICARE, VEDERE, CONFERMARE
# ─────────────────────────────────────────────

def _cartella() -> Path:
    from app.utils.uploads import tenant_dir
    return tenant_dir(CARTELLA)


def carica(fornitore_id: int, contenuto: bytes, nome_file: str, data: Optional[str] = None,
           utente: Optional[str] = None) -> Dict[str, Any]:
    nome = os.path.basename((nome_file or "").strip()) or "listino.pdf"
    if not nome.lower().endswith(".pdf"):
        raise ValueError("Per ora si leggono solo listini in PDF")
    if not contenuto:
        raise ValueError("File vuoto")
    if len(contenuto) > MAX_BYTES:
        raise ValueError("File oltre 30 MB")
    conn = _conn()
    try:
        f = conn.execute("SELECT id, nome FROM vini_fornitori WHERE id = ?", (fornitore_id,)).fetchone()
    finally:
        conn.close()
    if not f:
        raise ValueError(f"Fornitore id={fornitore_id} non trovato")

    letto = leggi_pdf(contenuto)
    righe = letto["righe"]
    if not righe:
        raise ValueError("Nel PDF non ho trovato righe con un prezzo")
    data = data or letto["data"] or date.today().isoformat()
    try:
        date.fromisoformat(data[:10])
        data = data[:10]
    except ValueError:
        raise ValueError(f"Data non valida: {data} (serve AAAA-MM-GG)")
    for r in righe:
        r["chiave"] = chiave(r["produttore"], r["descrizione"])

    conn = _conn()
    try:
        cur = conn.cursor()
        bott = _bottiglie(cur)
        memoria = {}
        for m in cur.execute(
            "SELECT r.chiave, b.madre_id FROM vini_listini_righe r "
            "JOIN vini_listini l ON l.id = r.listino_id "
            "JOIN vini_bottiglie b ON b.id = r.bottiglia_id "
            "WHERE l.fornitore_id = ? AND r.stato = 'confermata' ORDER BY r.id", (fornitore_id,)
        ).fetchall():
            if m["madre_id"]:
                memoria[m["chiave"]] = m["madre_id"]
        _proponi(righe, bott, memoria)

        sicuro = re.sub(r"[^A-Za-z0-9._-]+", "_", nome)[:80]
        rel = f"{fornitore_id}/{uuid.uuid4().hex}_{sicuro}"
        dest = _cartella() / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(contenuto)

        cur.execute("INSERT INTO vini_listini (fornitore_id, data, nome_file, file_path, righe_lette, utente) "
                    "VALUES (?, ?, ?, ?, ?, ?)", (fornitore_id, data, nome, rel, len(righe), utente))
        lid = cur.lastrowid
        cur.executemany(
            "INSERT INTO vini_listini_righe (listino_id, pagina, produttore, descrizione, chiave, prezzo, "
            "bottiglia_id, punteggio, stato, updated_at) VALUES (?,?,?,?,?,?,?,?,?, datetime('now','localtime'))",
            [(lid, r["pagina"], r["produttore"] or None, r["descrizione"], r["chiave"], r["prezzo"],
              r["bottiglia_id"], r["punteggio"], r["stato"]) for r in righe])
        conn.commit()
    finally:
        conn.close()
    return {"id": lid, "fornitore": f["nome"], "data": data, "righe_lette": len(righe),
            "proposte": sum(1 for r in righe if r["stato"] == "proposta")}


def elenco() -> List[Dict[str, Any]]:
    conn = _conn()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT l.id, l.fornitore_id, f.nome AS fornitore, l.data, l.nome_file, l.righe_lette, l.utente, "
            "l.created_at, "
            "(SELECT COUNT(*) FROM vini_listini_righe r WHERE r.listino_id = l.id AND r.stato = 'proposta') AS proposte, "
            "(SELECT COUNT(*) FROM vini_listini_righe r WHERE r.listino_id = l.id AND r.stato = 'confermata') AS confermate "
            "FROM vini_listini l LEFT JOIN vini_fornitori f ON f.id = l.fornitore_id "
            "ORDER BY l.data DESC, l.id DESC").fetchall()]
    finally:
        conn.close()


def _listino(cur: sqlite3.Cursor, listino_id: int) -> sqlite3.Row:
    l = cur.execute("SELECT l.*, f.nome AS fornitore FROM vini_listini l "
                    "LEFT JOIN vini_fornitori f ON f.id = l.fornitore_id WHERE l.id = ?", (listino_id,)).fetchone()
    if not l:
        raise ValueError(f"Listino id={listino_id} non trovato")
    return l


def dettaglio(listino_id: int) -> Dict[str, Any]:
    sicuri = _soglia("vmf_listino_soglia_sicuri", 80)
    scarto = _soglia("vmf_listino_scarto_max_pct", 60)
    conn = _conn()
    try:
        cur = conn.cursor()
        l = _listino(cur, listino_id)
        righe = []
        for r in cur.execute(
            "SELECT r.*, b.PRODUTTORE AS b_produttore, b.DESCRIZIONE AS b_descrizione, b.ANNATA AS b_annata, "
            "b.FORMATO AS b_formato, COALESCE(b.QTA_TOTALE,0) AS b_qta, b.EURO_LISTINO AS b_listino, "
            "b.SCONTO AS b_sconto, b.madre_id AS b_madre "
            "FROM vini_listini_righe r LEFT JOIN vini_bottiglie b ON b.id = r.bottiglia_id "
            "WHERE r.listino_id = ? ORDER BY r.id", (listino_id,)
        ).fetchall():
            d = dict(r)
            if d["bottiglia_id"]:
                prec = cur.execute(
                    "SELECT prezzo, data FROM vini_prezzi_fornitore WHERE bottiglia_id = ? AND fornitore_id = ? "
                    "AND tipo = 'listino' AND stato <> 'scartato' AND (id <> ? OR ? IS NULL) "
                    "ORDER BY data DESC, id DESC LIMIT 1",
                    (d["bottiglia_id"], l["fornitore_id"], d["prezzo_id"], d["prezzo_id"])).fetchone()
                d["listino_prima"] = dict(prec) if prec else None
                rif = prec["prezzo"] if prec else d["b_listino"]
                d["delta_pct"] = round((d["prezzo"] / rif - 1) * 100, 1) if rif else None
                ann = annate(d["descrizione"])
                d["annata_diversa"] = bool(ann) and (d["b_annata"] or "").strip() not in ann
                fuori = d["delta_pct"] is not None and abs(d["delta_pct"]) > scarto
                d["sicura"] = (d["punteggio"] or 0) >= sicuri and not d["annata_diversa"] and not fuori
            righe.append(d)
    finally:
        conn.close()
    out = dict(l)
    out.pop("file_path", None)
    out["righe"] = righe
    out["soglia_sicuri"] = sicuri
    return out


def percorso_file(listino_id: int) -> Tuple[Path, str]:
    conn = _conn()
    try:
        l = _listino(conn.cursor(), listino_id)
    finally:
        conn.close()
    if not l["file_path"]:
        raise ValueError("Questo listino non ha il file")
    base = _cartella().resolve()
    p = (base / l["file_path"]).resolve()
    if base not in p.parents or not p.exists():
        raise ValueError("File del listino non trovato")
    return p, l["nome_file"] or "listino.pdf"


def _riga(cur: sqlite3.Cursor, riga_id: int) -> sqlite3.Row:
    r = cur.execute("SELECT * FROM vini_listini_righe WHERE id = ?", (riga_id,)).fetchone()
    if not r:
        raise ValueError(f"Riga id={riga_id} non trovata")
    if r["stato"] == "confermata":
        raise ValueError("Riga già confermata: il prezzo si scarta dalla scheda del vino")
    return r


def abbina_riga(riga_id: int, bottiglia_id: int, utente: Optional[str] = None) -> Dict[str, Any]:
    conn = _conn()
    try:
        cur = conn.cursor()
        _riga(cur, riga_id)
        if not cur.execute("SELECT 1 FROM vini_bottiglie WHERE id = ?", (bottiglia_id,)).fetchone():
            raise ValueError(f"Vino id={bottiglia_id} non trovato")
        cur.execute("UPDATE vini_listini_righe SET bottiglia_id = ?, punteggio = NULL, stato = 'proposta', "
                    "utente = ?, updated_at = datetime('now','localtime') WHERE id = ?",
                    (bottiglia_id, utente, riga_id))
        conn.commit()
    finally:
        conn.close()
    return {"id": riga_id, "bottiglia_id": bottiglia_id}


def scarta_riga(riga_id: int, utente: Optional[str] = None) -> Dict[str, Any]:
    conn = _conn()
    try:
        cur = conn.cursor()
        _riga(cur, riga_id)
        cur.execute("UPDATE vini_listini_righe SET stato = 'scartata', utente = ?, "
                    "updated_at = datetime('now','localtime') WHERE id = ?", (utente, riga_id))
        conn.commit()
    finally:
        conn.close()
    return {"id": riga_id, "stato": "scartata"}


def conferma(listino_id: int, riga_ids: List[int], utente: Optional[str] = None) -> Dict[str, Any]:
    """Le righe scelte diventano prezzi `listino` del fornitore (data del listino)."""
    conn = _conn()
    try:
        cur = conn.cursor()
        l = _listino(cur, listino_id)
        segnaposto = ",".join("?" * len(riga_ids)) or "NULL"
        righe = [dict(r) for r in cur.execute(
            f"SELECT * FROM vini_listini_righe WHERE listino_id = ? AND id IN ({segnaposto}) "
            "AND stato = 'proposta' AND bottiglia_id IS NOT NULL", (listino_id, *riga_ids)).fetchall()]
    finally:
        conn.close()
    fatte, errori = 0, []
    for r in righe:
        try:
            esito = vmf.registra_prezzo(
                r["bottiglia_id"], l["fornitore_id"], r["prezzo"], tipo="listino", data=l["data"],
                fonte="listino", note=f"Listino #{listino_id} p.{r['pagina']}: {r['descrizione']}"[:300],
                utente=utente)
        except ValueError as e:
            errori.append({"id": r["id"], "errore": str(e)})
            continue
        conn = _conn()
        try:
            conn.execute("UPDATE vini_listini_righe SET stato = 'confermata', prezzo_id = ?, utente = ?, "
                         "updated_at = datetime('now','localtime') WHERE id = ?", (esito["id"], utente, r["id"]))
            conn.commit()
        finally:
            conn.close()
        fatte += 1
    return {"confermate": fatte, "errori": errori}


def elimina(listino_id: int) -> Dict[str, Any]:
    conn = _conn()
    try:
        cur = conn.cursor()
        l = _listino(cur, listino_id)
        n = cur.execute("SELECT COUNT(*) FROM vini_listini_righe WHERE listino_id = ? AND stato = 'confermata'",
                        (listino_id,)).fetchone()[0]
        if n:
            raise ValueError(f"Il listino ha già {n} prezzi confermati: non si elimina")
        cur.execute("DELETE FROM vini_listini_righe WHERE listino_id = ?", (listino_id,))
        cur.execute("DELETE FROM vini_listini WHERE id = ?", (listino_id,))
        conn.commit()
        rel = l["file_path"]
    finally:
        conn.close()
    if rel:
        try:
            base = _cartella().resolve()
            p = (base / rel).resolve()
            if base in p.parents:
                p.unlink(missing_ok=True)
        except Exception:
            pass
    return {"id": listino_id, "eliminato": True}
