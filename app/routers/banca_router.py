#!/usr/bin/env python3
# @version: v1.1-csv-robust-import
# -*- coding: utf-8 -*-
"""
Router modulo Banca — movimenti bancari, categorie, dashboard, cross-ref fatture.

Endpoints:
  1. POST   /banca/import             — upload CSV Banco BPM
  2. GET    /banca/movimenti           — lista movimenti con filtri
  3. GET    /banca/dashboard           — stats aggregati (saldo, entrate/uscite, breakdown)
  4. GET    /banca/categorie           — lista categorie banca con mapping custom
  5. POST   /banca/categorie/map       — crea/aggiorna mapping categoria custom
  6. DELETE /banca/categorie/map/{id}  — elimina mapping custom
  7. GET    /banca/cross-ref           — movimenti con possibili fatture collegate
  8. POST   /banca/cross-ref/link      — collega movimento ↔ fattura
  9. DELETE /banca/cross-ref/link/{id} — scollega
 10. GET    /banca/import-log          — storico import CSV
 11. GET    /banca/andamento           — serie temporale entrate/uscite per grafici

DB: app/data/foodcost.db
"""

import csv
import hashlib
import io
import re
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Body
from pydantic import BaseModel
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "foodcost.db"

router = APIRouter(prefix="/banca", tags=["banca"])


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ═══════════════════════════════════════════════════════
# CATEGORIE REGISTRAZIONE MOVIMENTI
# ═══════════════════════════════════════════════════════

def _load_categorie_registrazione(conn=None):
    """Carica categorie registrazione da DB. Ritorna dict {codice: {label, tipo, pattern, colore, ordine}}."""
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    try:
        rows = conn.execute(
            "SELECT codice, label, tipo, pattern, colore, ordine FROM banca_categorie_registrazione WHERE attiva = 1 ORDER BY tipo, ordine"
        ).fetchall()
    except Exception:
        # Tabella non ancora creata — fallback hardcoded
        return {
            "SPESA_BANCARIA": {"label": "Spese bancarie", "tipo": "uscita", "pattern": "", "colore": "#6b7280", "ordine": 1},
            "ALTRO_USCITA": {"label": "Altra uscita", "tipo": "uscita", "pattern": "", "colore": "#9ca3af", "ordine": 99},
            "INCASSO_POS": {"label": "Incasso POS", "tipo": "entrata", "pattern": "", "colore": "#059669", "ordine": 1},
            "ALTRO_ENTRATA": {"label": "Altra entrata", "tipo": "entrata", "pattern": "", "colore": "#9ca3af", "ordine": 99},
        }
    finally:
        if own_conn:
            conn.close()
    return {r["codice"]: dict(r) for r in rows}


def _get_categorie_by_tipo(conn=None):
    """Ritorna {uscita: {codice: label}, entrata: {codice: label}}."""
    cats = _load_categorie_registrazione(conn)
    result = {"uscita": {}, "entrata": {}}
    for codice, info in cats.items():
        result[info["tipo"]][codice] = info["label"]
    return result


def _auto_detect_categoria(descrizione: str, importo: float) -> str:
    """Rileva automaticamente la categoria dalla descrizione del movimento usando i pattern da DB."""
    d = (descrizione or "").upper()
    cats = _load_categorie_registrazione()
    tipo_filtro = "entrata" if importo > 0 else "uscita"

    # Ordina per ordine (le specifiche prima, ALTRO alla fine)
    sorted_cats = sorted(
        [(k, v) for k, v in cats.items() if v["tipo"] == tipo_filtro and v.get("pattern")],
        key=lambda x: x[1].get("ordine", 50)
    )

    for codice, info in sorted_cats:
        patterns = [p.strip() for p in (info.get("pattern") or "").split("|") if p.strip()]
        for pat in patterns:
            # Pattern speciale con soglia importo: "DEBIT PAGAMENTO<50" o ">=50"
            if "<" in pat and not pat.startswith("<"):
                text_part, threshold = pat.rsplit("<", 1)
                try:
                    threshold_val = float(threshold)
                    if text_part.strip() in d and abs(importo) < threshold_val:
                        return codice
                except ValueError:
                    if pat in d:
                        return codice
            elif ">=" in pat and not pat.startswith(">="):
                text_part, threshold = pat.rsplit(">=", 1)
                try:
                    threshold_val = float(threshold)
                    if text_part.strip() in d and abs(importo) >= threshold_val:
                        return codice
                except ValueError:
                    if pat in d:
                        return codice
            elif pat in d:
                return codice

    # Fallback: ALTRO_USCITA o ALTRO_ENTRATA
    return f"ALTRO_{tipo_filtro.upper()}"


# ═══════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════

class CategoriaMapRequest(BaseModel):
    categoria_banca: str
    sottocategoria_banca: Optional[str] = None
    categoria_custom: str
    colore: Optional[str] = "#6b7280"
    icona: Optional[str] = "📁"
    tipo: Optional[str] = "uscita"  # entrata | uscita | altro


class UpdateMovimentoCategoria(BaseModel):
    categoria_banca: str
    sottocategoria_banca: Optional[str] = ""


class CrossRefLinkRequest(BaseModel):
    movimento_id: int
    fattura_id: Optional[int] = None
    uscita_id: Optional[int] = None
    entrata_id: Optional[int] = None  # per collegare storni/note di credito
    note: Optional[str] = None


class RegistraMovimentoRequest(BaseModel):
    movimento_id: int
    categoria: str
    descrizione: Optional[str] = None
    note: Optional[str] = None


# ═══════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════

def _parse_date_it(s: str) -> Optional[str]:
    """Converte 'dd/mm/yyyy' → 'yyyy-mm-dd'."""
    if not s:
        return None
    s = s.strip()
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return s


def _parse_importo_it(s: str) -> float:
    """Converte importo italiano: '1.234,56' o '-1234,56' → float."""
    if not s:
        return 0.0
    s = s.strip().replace('"', '').replace("'", "")
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _normalize_desc(descrizione: str) -> str:
    """Normalizza descrizione per confronto/dedup.
    Rimuove punteggiatura, lowercase, collassa spazi, primi 40 char.
    Due formati CSV diversi della stessa banca producono lo stesso risultato."""
    d = (descrizione or "").strip().lower()
    # Rimuovi tutta la punteggiatura e trattini
    d = re.sub(r"[^\w\s]", " ", d)
    d = re.sub(r"\s+", " ", d).strip()
    return d[:40]


def _dedup_hash(data_contabile: str, importo: float, descrizione: str) -> str:
    """Genera hash per dedup: data + importo + descrizione normalizzata.

    v2: normalizzazione aggressiva — rimuove punteggiatura per evitare
    duplicati da formati CSV diversi (uppercase vs lowercase, trattini vs spazi).
    """
    d = _normalize_desc(descrizione)
    raw = f"{data_contabile}|{importo:.2f}|{d}"
    return hashlib.md5(raw.encode()).hexdigest()


def _parse_categoria(cat_raw: str):
    """Splitta 'Categoria - Sottocategoria' → (cat, subcat)."""
    cat_raw = (cat_raw or "").strip()
    if " - " in cat_raw:
        parts = cat_raw.split(" - ", 1)
        return parts[0].strip(), parts[1].strip()
    return cat_raw, ""


def _get_csv_field(row: dict, *names: str) -> str:
    """Cerca un campo nel dict CSV provando diversi nomi (case-insensitive, strip spazi).
    Banco BPM cambia leggermente i nomi colonna tra versioni di export."""
    for name in names:
        # Prima prova match esatto
        val = row.get(name)
        if val is not None:
            return val.strip() if isinstance(val, str) else val
    # Fallback: cerca case-insensitive e strip whitespace dalle chiavi
    names_lower = [n.lower().strip() for n in names]
    for key, val in row.items():
        if key.strip().lower() in names_lower:
            return val.strip() if isinstance(val, str) else val
    return ""


# ═══════════════════════════════════════════════════════
# 1. IMPORT CSV
# ═══════════════════════════════════════════════════════

@router.post("/import")
async def import_csv(file: UploadFile = File(...)):
    """
    Importa CSV export Banco BPM.
    Colonne attese: Ragione Sociale, Data contabile, Data valuta, Banca,
                    Rapporto, Importo, Divisa, Descrizione,
                    Categoria/sottocategoria, Hashtag
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Il file deve essere in formato .csv")

    content = await file.read()
    # Try utf-8, fallback to latin-1
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    # Detecta separatore: se la prima riga ha più ";" che ",", usa ";"
    first_line = text.split("\n", 1)[0] if text else ""
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    conn = get_db()
    cur = conn.cursor()

    num_rows = 0
    num_new = 0
    num_dup = 0
    date_min = None
    date_max = None

    # Crea log entry
    cur.execute(
        "INSERT INTO banca_import_log (filename) VALUES (?)",
        (file.filename,)
    )
    import_id = cur.lastrowid

    for row in reader:

        num_rows += 1

        # Parse campi — usa _get_csv_field per matching robusto dei nomi colonna
        ragione = _get_csv_field(row, "Ragione Sociale", "Ragione sociale", "ragione sociale")
        data_c = _parse_date_it(_get_csv_field(row, "Data contabile", "Data Contabile", "data contabile"))
        data_v = _parse_date_it(_get_csv_field(row, "Data valuta", "Data Valuta", "data valuta"))
        banca = _get_csv_field(row, "Banca", "banca")
        rapporto = _get_csv_field(row, "Rapporto", "rapporto")
        causale = _get_csv_field(row, "Causale", "causale")
        # Se non c'è Rapporto ma c'è Causale (formato MovimentiCC), salva causale in rapporto
        if not rapporto and causale:
            rapporto = causale
        importo = _parse_importo_it(_get_csv_field(row, "Importo", "importo") or "0")
        divisa = _get_csv_field(row, "Divisa", "divisa") or "EUR"
        descrizione = _get_csv_field(row, "Descrizione", "descrizione")
        cat_raw = _get_csv_field(row, "Categoria/sottocategoria", "Categoria/Sottocategoria",
                                  "categoria/sottocategoria", "Categoria")
        hashtag = _get_csv_field(row, "Hashtag", "hashtag")
        canale = _get_csv_field(row, "Canale", "canale")
        # Se non c'è Hashtag ma c'è Canale (formato MovimentiCC), salva canale in hashtag
        if not hashtag and canale:
            hashtag = canale

        cat, subcat = _parse_categoria(cat_raw)
        dhash = _dedup_hash(data_c, importo, descrizione)

        # Track date range
        if data_c:
            if not date_min or data_c < date_min:
                date_min = data_c
            if not date_max or data_c > date_max:
                date_max = data_c

        # Soft dedup check: pattern "formato vuoto+pieno" (vedi mig 058).
        # Lo stesso movimento può apparire in due export CSV diversi della
        # banca: uno con ragione_sociale+banca pieni (uppercase), l'altro
        # con campi vuoti (lowercase). Il dedup_hash non cattura perché le
        # descrizioni normalizzate hanno prefisso comune troppo corto.
        # Strategia: se esiste un record con stessa data+importo e pattern
        # ragione_sociale "opposto" (uno vuoto, uno pieno), è lo stesso
        # movimento → skip import del nuovo (tieni il record esistente).
        ragione_clean = (ragione or "").strip()
        existing = cur.execute("""
            SELECT id, ragione_sociale
            FROM banca_movimenti
            WHERE data_contabile = ? AND importo = ?
        """, (data_c, importo)).fetchall()

        is_soft_dup = False
        for ex_id, ex_rs in existing:
            ex_rs_clean = (ex_rs or "").strip()
            # Pattern opposto: uno vuoto e l'altro pieno
            if bool(ragione_clean) != bool(ex_rs_clean):
                is_soft_dup = True
                break

        if is_soft_dup:
            num_dup += 1
            continue

        try:
            cur.execute("""
                INSERT INTO banca_movimenti
                    (import_id, ragione_sociale, data_contabile, data_valuta,
                     banca, rapporto, importo, divisa, descrizione,
                     categoria_banca, sottocategoria_banca, hashtag, dedup_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (import_id, ragione, data_c, data_v, banca, rapporto,
                  importo, divisa, descrizione, cat, subcat, hashtag, dhash))
            num_new += 1
        except sqlite3.IntegrityError:
            # Duplicato hard (hash identico)
            num_dup += 1

    # Se tutte le righe sono "duplicate" e nessuna data trovata → probabile mismatch colonne
    warning = None
    if num_rows > 0 and num_new == 0 and date_min is None:
        # Nessuna data parsata + zero inserimenti → colonne CSV non riconosciute
        col_list = list(reader.fieldnames) if reader.fieldnames else []
        conn.rollback()
        conn.close()
        raise HTTPException(
            400,
            f"Nessuna colonna riconosciuta nel CSV. "
            f"Colonne trovate: {', '.join(col_list) if col_list else '(nessuna)'}. "
            f"Attese: Ragione Sociale, Data contabile, Data valuta, Importo, Descrizione..."
        )

    if num_rows > 0 and num_new == 0:
        warning = "Tutti i movimenti risultano già importati (duplicati)."

    # Aggiorna log
    cur.execute("""
        UPDATE banca_import_log
        SET num_rows = ?, num_new = ?, num_duplicates = ?,
            date_from = ?, date_to = ?
        WHERE id = ?
    """, (num_rows, num_new, num_dup, date_min, date_max, import_id))

    conn.commit()
    conn.close()

    result = {
        "import_id": import_id,
        "filename": file.filename,
        "total_rows": num_rows,
        "new": num_new,
        "duplicates": num_dup,
        "date_from": date_min,
        "date_to": date_max,
    }
    if warning:
        result["warning"] = warning
    return result


# ═══════════════════════════════════════════════════════
# 2. MOVIMENTI (lista con filtri)
# ═══════════════════════════════════════════════════════

@router.get("/movimenti")
def get_movimenti(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    categoria: Optional[str] = None,
    tipo: Optional[str] = None,  # entrata | uscita
    search: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    """Lista movimenti con filtri opzionali."""
    conn = get_db()
    cur = conn.cursor()

    where = []
    params = []

    if data_da:
        where.append("m.data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("m.data_contabile <= ?")
        params.append(data_a)
    if categoria:
        where.append("m.categoria_banca = ?")
        params.append(categoria)
    if tipo == "entrata":
        where.append("m.importo > 0")
    elif tipo == "uscita":
        where.append("m.importo < 0")
    if search:
        where.append("(m.descrizione LIKE ? OR m.categoria_banca LIKE ? OR m.sottocategoria_banca LIKE ?)")
        params.extend([f"%{search}%"] * 3)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    # Total count
    cur.execute(f"SELECT COUNT(*) FROM banca_movimenti m {where_sql}", params)
    total = cur.fetchone()[0]

    # Data with custom category mapping
    cur.execute(f"""
        SELECT m.*,
               cm.categoria_custom,
               cm.colore AS cat_colore,
               cm.icona AS cat_icona
        FROM banca_movimenti m
        LEFT JOIN banca_categorie_map cm
            ON m.categoria_banca = cm.categoria_banca
            AND COALESCE(m.sottocategoria_banca, '') = COALESCE(cm.sottocategoria_banca, '')
        {where_sql}
        ORDER BY m.data_contabile DESC, m.id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return {"total": total, "movimenti": rows}


@router.patch("/movimenti/{movimento_id}/categoria")
def update_movimento_categoria(movimento_id: int, req: UpdateMovimentoCategoria):
    """Aggiorna categoria di un singolo movimento."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE banca_movimenti
        SET categoria_banca = ?, sottocategoria_banca = ?
        WHERE id = ?
    """, (req.categoria_banca, req.sottocategoria_banca or "", movimento_id))
    conn.commit()
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(404, "Movimento non trovato")
    conn.close()
    return {"ok": True}


# ═══════════════════════════════════════════════════════
# 3. DASHBOARD — stats aggregati
# ═══════════════════════════════════════════════════════

@router.get("/dashboard")
def get_dashboard(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
):
    """Dashboard con totali, breakdown per categoria, ultimi movimenti."""
    conn = get_db()
    cur = conn.cursor()

    where = []
    params = []
    if data_da:
        where.append("data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("data_contabile <= ?")
        params.append(data_a)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    # Totali
    cur.execute(f"""
        SELECT
            COUNT(*) as num_movimenti,
            SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END) as totale_entrate,
            SUM(CASE WHEN importo < 0 THEN importo ELSE 0 END) as totale_uscite,
            SUM(importo) as saldo_periodo,
            MIN(data_contabile) as data_primo,
            MAX(data_contabile) as data_ultimo
        FROM banca_movimenti
        {where_sql}
    """, params)
    totals = dict(cur.fetchone())

    # Breakdown per categoria (uscite)
    cur.execute(f"""
        SELECT
            categoria_banca,
            sottocategoria_banca,
            COUNT(*) as num,
            SUM(importo) as totale
        FROM banca_movimenti
        {where_sql}
        {"AND" if where else "WHERE"} importo < 0
        GROUP BY categoria_banca, sottocategoria_banca
        ORDER BY totale ASC
    """, params)
    uscite_per_cat = [dict(r) for r in cur.fetchall()]

    # Breakdown per categoria (entrate)
    cur.execute(f"""
        SELECT
            categoria_banca,
            sottocategoria_banca,
            COUNT(*) as num,
            SUM(importo) as totale
        FROM banca_movimenti
        {where_sql}
        {"AND" if where else "WHERE"} importo > 0
        GROUP BY categoria_banca, sottocategoria_banca
        ORDER BY totale DESC
    """, params)
    entrate_per_cat = [dict(r) for r in cur.fetchall()]

    # Ultimi 10 movimenti
    cur.execute(f"""
        SELECT * FROM banca_movimenti
        {where_sql}
        ORDER BY data_contabile DESC, id DESC
        LIMIT 10
    """, params)
    ultimi = [dict(r) for r in cur.fetchall()]

    conn.close()

    return {
        "totals": totals,
        "uscite_per_categoria": uscite_per_cat,
        "entrate_per_categoria": entrate_per_cat,
        "ultimi_movimenti": ultimi,
    }


# ═══════════════════════════════════════════════════════
# 4-6. CATEGORIE MAPPING
# ═══════════════════════════════════════════════════════

@router.get("/categorie")
def get_categorie():
    """Lista categorie banca con eventuale mapping custom."""
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            m.categoria_banca,
            m.sottocategoria_banca,
            COUNT(*) as num_movimenti,
            SUM(m.importo) as totale,
            cm.id as map_id,
            cm.categoria_custom,
            cm.colore,
            cm.icona,
            cm.tipo
        FROM banca_movimenti m
        LEFT JOIN banca_categorie_map cm
            ON m.categoria_banca = cm.categoria_banca
            AND COALESCE(m.sottocategoria_banca, '') = COALESCE(cm.sottocategoria_banca, '')
        GROUP BY m.categoria_banca, m.sottocategoria_banca
        ORDER BY totale ASC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/categorie/map")
def upsert_categoria_map(req: CategoriaMapRequest):
    """Crea o aggiorna mapping categoria banca → custom."""
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO banca_categorie_map
            (categoria_banca, sottocategoria_banca, categoria_custom, colore, icona, tipo)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(categoria_banca, sottocategoria_banca)
        DO UPDATE SET
            categoria_custom = excluded.categoria_custom,
            colore = excluded.colore,
            icona = excluded.icona,
            tipo = excluded.tipo
    """, (req.categoria_banca, req.sottocategoria_banca or "",
          req.categoria_custom, req.colore, req.icona, req.tipo))

    conn.commit()
    map_id = cur.lastrowid
    conn.close()
    return {"ok": True, "id": map_id}


@router.delete("/categorie/map/{map_id}")
def delete_categoria_map(map_id: int):
    """Elimina mapping custom."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM banca_categorie_map WHERE id = ?", (map_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if not deleted:
        raise HTTPException(404, "Mapping non trovato")
    return {"ok": True}


# ═══════════════════════════════════════════════════════
# 7-9. RICONCILIAZIONE SPESE (ex Cross-Ref Fatture)
# Match movimenti bancari ↔ fatture + spese fisse
# ═══════════════════════════════════════════════════════

_MATCH_STOPWORDS = frozenset({
    "srl", "spa", "snc", "sas", "srls", "ltd", "soc", "coop",
    "del", "dei", "delle", "della", "degli", "per", "con", "dal",
    "alla", "alle", "allo", "the", "and", "group", "italia",
})


def _nome_parole(nome: str) -> list:
    """Estrae parole significative (>3 char, no stopwords) da un nome fornitore."""
    return [p for p in nome.lower().split() if len(p) > 3 and p not in _MATCH_STOPWORDS]


def _nome_match(nome: str, desc_lower: str) -> bool:
    """Ritorna True se almeno una parola significativa del nome è nella descrizione."""
    parole = _nome_parole(nome)
    return bool(parole) and any(p in desc_lower for p in parole)


def _score_match(nome: str, totale_match: float, data_ref, target: float,
                 data_c: str, desc_lower: str, score_base: int):
    """Calcola score per un suggerimento. Ritorna None se da scartare.
    Score più basso = match migliore."""
    has_nome = _nome_match(nome, desc_lower)
    imp_diff_abs = abs(target - (totale_match or 0))
    imp_diff_pct = imp_diff_abs / max(target, 0.01)

    # ── Filtro qualità: scarta match con importi troppo diversi ──
    if has_nome:
        # Anche con nome, scarta se diff > 50%
        if imp_diff_pct > 0.50:
            return None
    else:
        # Senza nome, già filtrato dalla query (±15%), ma conferma
        if imp_diff_pct > 0.20:
            return None

    score = score_base
    if has_nome:
        score -= 50
    if imp_diff_pct < 0.01:
        score -= 30
    elif imp_diff_pct < 0.05:
        score -= 15
    elif imp_diff_pct < 0.10:
        score -= 5

    # Finestra temporale e bonus prossimità (sessione 40):
    # — cutoff duro a 180 giorni: pagamento e movimento banca a piu' di 6
    #   mesi di distanza non sono mai correlati nella pratica
    # — penalita' progressiva oltre 30 giorni per ridurre rumore
    # — bonus prossimita' fino a 15 giorni
    if data_ref and data_c:
        try:
            d1 = datetime.strptime(data_c[:10], "%Y-%m-%d")
            d2 = datetime.strptime(str(data_ref)[:10], "%Y-%m-%d")
            days = abs((d1 - d2).days)
            if days > 180:
                return None  # scarta del tutto
            if days <= 5:
                score -= 10
            elif days <= 15:
                score -= 5
            elif days <= 30:
                pass  # neutro
            elif days <= 60:
                score += 15  # penalita' moderata
            elif days <= 120:
                score += 40  # penalita' forte
            else:
                score += 80  # penalita' molto forte (120-180gg)
        except Exception:
            pass

    return score


@router.get("/cross-ref")
def get_cross_ref(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    importo_min: Optional[float] = None,   # |importo| >= importo_min
    importo_max: Optional[float] = None,   # |importo| <= importo_max
    direzione: Optional[str] = None,       # 'uscite' | 'entrate' | None
    categoria_banca: Optional[str] = None, # filtra per m.categoria_banca (ILIKE)
    limit: int = 500,
):
    """
    Tutti i movimenti bancari con link multipli e suggerimenti.
    Supporta multi-link (bonifici che pagano più fatture) e residuo.

    Filtri server-side:
    - data_da / data_a: range su data_contabile
    - importo_min / importo_max: applicati a ABS(importo)
    - direzione: 'uscite' -> importo<0, 'entrate' -> importo>=0
    - categoria_banca: substring match case-insensitive
    - limit: default 500 (max 5000)
    """
    conn = get_db()
    cur = conn.cursor()

    where = ["1=1"]
    params = []
    if data_da:
        where.append("m.data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("m.data_contabile <= ?")
        params.append(data_a)
    if importo_min is not None:
        where.append("ABS(m.importo) >= ?")
        params.append(float(importo_min))
    if importo_max is not None:
        where.append("ABS(m.importo) <= ?")
        params.append(float(importo_max))
    if direzione == "uscite":
        where.append("m.importo < 0")
    elif direzione == "entrate":
        where.append("m.importo >= 0")
    if categoria_banca:
        where.append("LOWER(COALESCE(m.categoria_banca,'')) LIKE ?")
        params.append(f"%{categoria_banca.lower()}%")

    # Cap sicurezza limit
    try:
        lim = max(1, min(int(limit), 5000))
    except Exception:
        lim = 500

    # ── 1. Carica movimenti ──
    cur.execute(f"""
        SELECT m.* FROM banca_movimenti m
        WHERE {" AND ".join(where)}
        ORDER BY m.data_contabile DESC
        LIMIT {lim}
    """, params)
    raw_movimenti = [dict(r) for r in cur.fetchall()]

    if not raw_movimenti:
        conn.close()
        return []

    mov_ids = [m["id"] for m in raw_movimenti]
    ph = ",".join("?" * len(mov_ids))

    # ── 2. Carica TUTTI i link fattura (multipli per movimento) ──
    cur.execute(f"""
        SELECT bl.id AS link_id, bl.movimento_id,
               f.id AS fattura_id, f.fornitore_nome, f.numero_fattura,
               f.data_fattura, f.totale_fattura AS totale
        FROM banca_fatture_link bl
        JOIN fe_fatture f ON bl.fattura_id = f.id
        WHERE bl.movimento_id IN ({ph})
    """, mov_ids)
    lk_fattura = {}
    all_linked_fatt_ids = set()
    for r in cur.fetchall():
        d = dict(r)
        all_linked_fatt_ids.add(d["fattura_id"])
        lk_fattura.setdefault(d["movimento_id"], []).append({
            "link_id": d["link_id"], "tipo": "FATTURA",
            "fornitore_nome": d["fornitore_nome"],
            "numero_fattura": d["numero_fattura"],
            "data": d["data_fattura"], "totale": d["totale"],
            "source": "fattura", "source_id": d["fattura_id"],
        })

    # ── 3. Carica link uscite dirette (non-fattura) ──
    cur.execute(f"""
        SELECT cu.id, cu.banca_movimento_id AS mov_id,
               cu.fornitore_nome, cu.numero_fattura,
               cu.data_scadenza, cu.totale,
               COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo,
               cu.periodo_riferimento
        FROM cg_uscite cu
        WHERE cu.banca_movimento_id IN ({ph})
          AND cu.fattura_id IS NULL
    """, mov_ids)
    lk_uscita = {}
    for r in cur.fetchall():
        d = dict(r)
        lk_uscita.setdefault(d["mov_id"], []).append({
            "link_id": f"u{d['id']}", "tipo": d["tipo"],
            "fornitore_nome": d["fornitore_nome"],
            "numero_fattura": d.get("numero_fattura"),
            "data": d["data_scadenza"], "totale": d["totale"],
            "source": "uscita", "source_id": d["id"],
            "periodo_riferimento": d.get("periodo_riferimento"),
        })

    # ── 4. Carica link entrate registrate ──
    cur.execute(f"""
        SELECT ce.id, ce.banca_movimento_id AS mov_id,
               ce.descrizione, ce.categoria,
               ce.data_entrata, ce.importo
        FROM cg_entrate ce
        WHERE ce.banca_movimento_id IN ({ph})
    """, mov_ids)
    lk_entrata = {}
    for r in cur.fetchall():
        d = dict(r)
        lk_entrata.setdefault(d["mov_id"], []).append({
            "link_id": f"e{d['id']}", "tipo": d["categoria"],
            "fornitore_nome": d["descrizione"],
            "numero_fattura": None,
            "data": d["data_entrata"], "totale": d["importo"],
            "source": "entrata", "source_id": d["id"],
        })

    # ── 5. Assembla risultato per ogni movimento ──
    movimenti = []
    for mov in raw_movimenti:
        mid = mov["id"]
        abs_imp = abs(mov["importo"])

        # Assembla tutti i link
        links = []
        links.extend(lk_fattura.get(mid, []))
        links.extend(lk_uscita.get(mid, []))
        links.extend(lk_entrata.get(mid, []))

        mov["links"] = links
        totale_coll = sum(abs(l.get("totale") or 0) for l in links)
        mov["totale_collegato"] = round(totale_coll, 2)
        residuo = round(abs_imp - totale_coll, 2)
        mov["residuo"] = residuo

        # Backward compat: flat link fields dal primo link
        if links:
            f0 = links[0]
            mov["link_id"] = f0["link_id"]
            mov["link_fornitore"] = f0["fornitore_nome"]
            mov["link_numero"] = f0.get("numero_fattura")
            mov["link_data"] = f0["data"]
            mov["link_totale"] = f0["totale"]
            mov["link_tipo"] = f0["tipo"]
            if f0.get("periodo_riferimento"):
                mov["link_periodo"] = f0["periodo_riferimento"]

        # Riconciliazione chiusa manualmente (mig 059): il movimento viene
        # considerato "completamente collegato" anche se residuo > 1€.
        # Serve per note di credito, bonifici multipli, fattura+rata dove
        # i link sono stati creati ma non quadrano al centesimo.
        if mov.get("riconciliazione_chiusa"):
            mov["possibili_match"] = []
            movimenti.append(mov)
            continue

        # Completamente collegato (residuo < 1€) → nessun suggerimento
        if links and abs(residuo) < 1.0:
            mov["possibili_match"] = []
            movimenti.append(mov)
            continue

        # Entrata senza link → auto-categoria per registrazione
        if mov["importo"] >= 0 and not links:
            mov["possibili_match"] = []
            mov["auto_categoria"] = _auto_detect_categoria(
                mov.get("descrizione", ""), mov["importo"]
            )
            movimenti.append(mov)
            continue

        # ── Cerca suggerimenti per uscite (o parzialmente collegate) ──
        target = residuo if (links and residuo > 0.5) else abs_imp
        if target <= 0.5:
            mov["possibili_match"] = []
            if not links:
                mov["auto_categoria"] = _auto_detect_categoria(
                    mov.get("descrizione", ""), mov["importo"]
                )
            movimenti.append(mov)
            continue

        data_c = mov["data_contabile"]
        desc_lower = (mov.get("descrizione") or "").lower()
        suggestions = []
        seen_keys = set()

        # Fatture già collegate a questo movimento (da escludere)
        my_linked = {l["source_id"] for l in links if l["source"] == "fattura"}

        # 1) Fatture: match per NOME fornitore nella descrizione bancaria
        #    Con filtro importo max ±50%
        #    Esclude fatture di fornitori con escluso_acquisti=1 (es. affitti FIC)
        cur2 = conn.cursor()
        cur2.execute("""
            SELECT f.id, f.fornitore_nome, f.numero_fattura,
                   f.data_fattura AS data_ref, f.totale_fattura AS totale,
                   'FATTURA' AS tipo
            FROM fe_fatture f
            LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
            LEFT JOIN fe_fornitore_categoria fc_cat
                   ON (fc_cat.fornitore_piva = f.fornitore_piva
                       AND fc_cat.fornitore_piva IS NOT NULL
                       AND fc_cat.fornitore_piva != '')
                   OR (COALESCE(fc_cat.fornitore_piva, '') = ''
                       AND COALESCE(f.fornitore_piva, '') = ''
                       AND fc_cat.fornitore_nome = f.fornitore_nome)
            WHERE bfl.id IS NULL
              AND f.totale_fattura > 0
              AND COALESCE(fc_cat.escluso_acquisti, 0) = 0
            ORDER BY f.data_fattura DESC
            LIMIT 500
        """)
        for r in cur2.fetchall():
            fid = r["id"]
            if fid in my_linked or fid in all_linked_fatt_ids:
                continue
            if not _nome_match(r["fornitore_nome"] or "", desc_lower):
                continue
            score = _score_match(
                r["fornitore_nome"] or "", r["totale"], r["data_ref"],
                target, data_c, desc_lower, 10
            )
            if score is None:
                continue
            key = ("fattura", fid)
            if key not in seen_keys:
                seen_keys.add(key)
                d = dict(r)
                d["source"] = "fattura"; d["source_id"] = fid; d["_score"] = score
                suggestions.append(d)

        # 2) Fatture: match per importo simile (±15%) entro ±30 giorni
        #    Esclude fatture di fornitori con escluso_acquisti=1
        cur2b = conn.cursor()
        cur2b.execute("""
            SELECT f.id, f.fornitore_nome, f.numero_fattura,
                   f.data_fattura AS data_ref, f.totale_fattura AS totale,
                   'FATTURA' AS tipo
            FROM fe_fatture f
            LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
            LEFT JOIN fe_fornitore_categoria fc_cat
                   ON (fc_cat.fornitore_piva = f.fornitore_piva
                       AND fc_cat.fornitore_piva IS NOT NULL
                       AND fc_cat.fornitore_piva != '')
                   OR (COALESCE(fc_cat.fornitore_piva, '') = ''
                       AND COALESCE(f.fornitore_piva, '') = ''
                       AND fc_cat.fornitore_nome = f.fornitore_nome)
            WHERE bfl.id IS NULL
              AND COALESCE(fc_cat.escluso_acquisti, 0) = 0
              AND ABS(f.totale_fattura - ?) / MAX(?, 0.01) < 0.15
              AND f.data_fattura BETWEEN date(?, '-30 days') AND date(?, '+30 days')
            ORDER BY ABS(f.totale_fattura - ?) ASC
            LIMIT 10
        """, (target, target, data_c, data_c, target))
        for r in cur2b.fetchall():
            fid = r["id"]
            if fid in my_linked or fid in all_linked_fatt_ids:
                continue
            key = ("fattura", fid)
            if key in seen_keys:
                continue
            score = _score_match(
                r["fornitore_nome"] or "", r["totale"], r["data_ref"],
                target, data_c, desc_lower, 40
            )
            if score is None:
                continue
            seen_keys.add(key)
            d = dict(r)
            d["source"] = "fattura"; d["source_id"] = fid; d["_score"] = score
            suggestions.append(d)

        # 3) Uscite CG non pagate: match per nome nella descrizione
        cur3 = conn.cursor()
        cur3.execute("""
            SELECT cu.id, cu.fornitore_nome, cu.numero_fattura,
                   cu.data_scadenza AS data_ref, cu.totale,
                   COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo,
                   cu.periodo_riferimento
            FROM cg_uscite cu
            WHERE cu.banca_movimento_id IS NULL
              AND cu.fattura_id IS NULL
              AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
        """)
        for r in cur3.fetchall():
            if not _nome_match(r["fornitore_nome"] or "", desc_lower):
                continue
            score = _score_match(
                r["fornitore_nome"] or "", r["totale"], r["data_ref"],
                target, data_c, desc_lower, 15
            )
            if score is None:
                continue
            key = ("uscita", r["id"])
            if key not in seen_keys:
                seen_keys.add(key)
                d = dict(r)
                d["source"] = "uscita"; d["source_id"] = d["id"]; d["_score"] = score
                suggestions.append(d)

        # 4) Uscite CG: match per importo simile (±15%) entro ±30 giorni
        cur3b = conn.cursor()
        cur3b.execute("""
            SELECT cu.id, cu.fornitore_nome, cu.numero_fattura,
                   cu.data_scadenza AS data_ref, cu.totale,
                   COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo,
                   cu.periodo_riferimento
            FROM cg_uscite cu
            WHERE cu.banca_movimento_id IS NULL
              AND cu.fattura_id IS NULL
              AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
              AND ABS(cu.totale - ?) / MAX(?, 0.01) < 0.15
              AND cu.data_scadenza BETWEEN date(?, '-30 days') AND date(?, '+30 days')
            ORDER BY ABS(cu.totale - ?) ASC
            LIMIT 10
        """, (target, target, data_c, data_c, target))
        for r in cur3b.fetchall():
            key = ("uscita", r["id"])
            if key in seen_keys:
                continue
            score = _score_match(
                r["fornitore_nome"] or "", r["totale"], r["data_ref"],
                target, data_c, desc_lower, 40
            )
            if score is None:
                continue
            seen_keys.add(key)
            d = dict(r)
            d["source"] = "uscita"; d["source_id"] = d["id"]; d["_score"] = score
            suggestions.append(d)

        # Ordina per score (più basso = migliore) e limita a 8
        suggestions.sort(key=lambda s: s.get("_score", 100))
        for s in suggestions:
            s.pop("_score", None)
        mov["possibili_match"] = suggestions[:8]

        if not suggestions and not links:
            mov["auto_categoria"] = _auto_detect_categoria(
                mov.get("descrizione", ""), mov["importo"]
            )
        movimenti.append(mov)

    conn.close()
    return movimenti


@router.post("/cross-ref/link")
def create_link(req: CrossRefLinkRequest):
    """
    Collega un movimento bancario a una fattura O a un'uscita CG.
    - fattura_id: link via banca_fatture_link + propaga a cg_uscite
    - uscita_id: link diretto su cg_uscite.banca_movimento_id
    """
    if not req.fattura_id and not req.uscita_id and not req.entrata_id:
        raise HTTPException(400, "Specificare fattura_id, uscita_id o entrata_id")

    conn = get_db()
    cur = conn.cursor()

    mov = cur.execute("SELECT data_contabile FROM banca_movimenti WHERE id = ?", (req.movimento_id,)).fetchone()
    data_mov = dict(mov)["data_contabile"] if mov else None

    try:
        if req.fattura_id:
            # ── Link fattura ──
            cur.execute("""
                INSERT INTO banca_fatture_link (movimento_id, fattura_id, note)
                VALUES (?, ?, ?)
            """, (req.movimento_id, req.fattura_id, req.note))
            # Propaga a cg_uscite
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = ?,
                    stato = 'PAGATA',
                    data_pagamento = COALESCE(data_pagamento, ?),
                    importo_pagato = totale,
                    updated_at = datetime('now')
                WHERE fattura_id = ?
                  AND banca_movimento_id IS NULL
            """, (req.movimento_id, data_mov, req.fattura_id))
        elif req.entrata_id:
            # ── Link entrata esistente (storno / nota di credito) ──
            cur.execute("""
                UPDATE cg_entrate
                SET banca_movimento_id = ?
                WHERE id = ?
                  AND banca_movimento_id IS NULL
            """, (req.movimento_id, req.entrata_id))
            if cur.rowcount == 0:
                conn.close()
                raise HTTPException(409, "Entrata già collegata o non trovata")
        else:
            # ── Link uscita diretta (spesa fissa, affitto, tassa…) ──
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = ?,
                    stato = 'PAGATA',
                    data_pagamento = COALESCE(data_pagamento, ?),
                    importo_pagato = totale,
                    updated_at = datetime('now')
                WHERE id = ?
                  AND banca_movimento_id IS NULL
            """, (req.movimento_id, data_mov, req.uscita_id))
            if cur.rowcount == 0:
                conn.close()
                raise HTTPException(409, "Uscita già collegata o non trovata")

        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, "Collegamento già esistente")
    conn.close()
    return {"ok": True}


@router.delete("/cross-ref/link/{link_id}")
def delete_link(link_id: str):
    """
    Rimuove collegamento. link_id può essere:
    - numerico: banca_fatture_link.id (fattura)
    - "uNNN": cg_uscite.id (uscita diretta)
    - "eNNN": cg_entrate.id (entrata registrata)
    """
    conn = get_db()
    cur = conn.cursor()

    if str(link_id).startswith("e"):
        # ── Scollega entrata registrata ──
        entrata_id = int(str(link_id)[1:])
        cur.execute("DELETE FROM cg_entrate WHERE id = ?", (entrata_id,))
        if cur.rowcount == 0:
            conn.close()
            raise HTTPException(404, "Collegamento non trovato")
        conn.commit()
        conn.close()
        return {"ok": True}

    if str(link_id).startswith("u"):
        # ── Scollega uscita diretta ──
        uscita_id = int(str(link_id)[1:])
        cur.execute("""
            UPDATE cg_uscite
            SET banca_movimento_id = NULL,
                stato = CASE WHEN data_scadenza < date('now') THEN 'SCADUTA' ELSE 'DA_PAGARE' END,
                importo_pagato = 0,
                data_pagamento = NULL,
                updated_at = datetime('now')
            WHERE id = ? AND banca_movimento_id IS NOT NULL
        """, (uscita_id,))
        if cur.rowcount == 0:
            conn.close()
            raise HTTPException(404, "Collegamento non trovato")
    else:
        # ── Scollega fattura ──
        numeric_id = int(link_id)
        link = cur.execute(
            "SELECT movimento_id, fattura_id FROM banca_fatture_link WHERE id = ?", (numeric_id,)
        ).fetchone()
        cur.execute("DELETE FROM banca_fatture_link WHERE id = ?", (numeric_id,))
        if cur.rowcount == 0:
            conn.close()
            raise HTTPException(404, "Collegamento non trovato")
        if link:
            l = dict(link)
            cur.execute("""
                UPDATE cg_uscite
                SET banca_movimento_id = NULL,
                    stato = CASE WHEN data_scadenza < date('now') THEN 'SCADUTA' ELSE 'DA_PAGARE' END,
                    importo_pagato = 0,
                    data_pagamento = NULL,
                    updated_at = datetime('now')
                WHERE fattura_id = ? AND banca_movimento_id = ?
            """, (l["fattura_id"], l["movimento_id"]))

    conn.commit()
    conn.close()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────
# Chiusura manuale riconciliazione (mig 059)
# ─────────────────────────────────────────────────────────────────────

class RiconciliaChiudiRequest(BaseModel):
    note: Optional[str] = None


@router.post("/cross-ref/chiudi/{movimento_id}")
def chiudi_riconciliazione(movimento_id: int, req: RiconciliaChiudiRequest = Body(default=None)):
    """
    Marca un movimento come riconciliato manualmente anche se residuo > 1€.
    Usato per note di credito, bonifici multipli, fattura+rata dove i link
    esistono ma non quadrano al centesimo.
    Richiesta: almeno un link deve esistere (non si chiude un movimento vuoto).
    """
    conn = get_db()
    cur = conn.cursor()

    mov = cur.execute(
        "SELECT id FROM banca_movimenti WHERE id = ?", (movimento_id,)
    ).fetchone()
    if not mov:
        conn.close()
        raise HTTPException(404, "Movimento non trovato")

    # Verifica che ci sia almeno un link
    n_fatt = cur.execute(
        "SELECT COUNT(*) FROM banca_fatture_link WHERE movimento_id = ?", (movimento_id,)
    ).fetchone()[0]
    n_usc = cur.execute(
        "SELECT COUNT(*) FROM cg_uscite WHERE banca_movimento_id = ?", (movimento_id,)
    ).fetchone()[0]
    n_ent = cur.execute(
        "SELECT COUNT(*) FROM cg_entrate WHERE banca_movimento_id = ?", (movimento_id,)
    ).fetchone()[0]
    if (n_fatt + n_usc + n_ent) == 0:
        conn.close()
        raise HTTPException(400, "Nessun link esistente: collega almeno una fattura/uscita/entrata prima di chiudere")

    note = (req.note if req else None) or None
    cur.execute("""
        UPDATE banca_movimenti
        SET riconciliazione_chiusa = 1,
            riconciliazione_chiusa_at = datetime('now'),
            riconciliazione_chiusa_note = ?
        WHERE id = ?
    """, (note, movimento_id))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/cross-ref/riapri/{movimento_id}")
def riapri_riconciliazione(movimento_id: int):
    """
    Annulla la chiusura manuale di un movimento. Il residuo torna a essere
    quello reale e il movimento ricompare tra i "suggerimenti" se ha residuo > 1€.
    """
    conn = get_db()
    cur = conn.cursor()

    mov = cur.execute(
        "SELECT id FROM banca_movimenti WHERE id = ?", (movimento_id,)
    ).fetchone()
    if not mov:
        conn.close()
        raise HTTPException(404, "Movimento non trovato")

    cur.execute("""
        UPDATE banca_movimenti
        SET riconciliazione_chiusa = 0,
            riconciliazione_chiusa_at = NULL,
            riconciliazione_chiusa_note = NULL
        WHERE id = ?
    """, (movimento_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/cross-ref/search")
def search_uscite_for_link(q: str = "", limit: int = 20):
    """
    Ricerca manuale fatture + uscite CG + entrate per collegamento.
    Cerca per fornitore, numero fattura, tipo spesa o importo.
    Include entrate per gestire storni e note di credito.
    """
    conn = get_db()
    cur = conn.cursor()

    if not q.strip():
        conn.close()
        return []

    results = []

    # Prova a interpretare come importo
    try:
        importo = float(q.replace(",", ".").replace("€", "").strip())
        is_importo = True
    except (ValueError, AttributeError):
        is_importo = False
        importo = 0.0

    if is_importo:
        # Fatture per importo (uscite) — esclude fornitori con escluso_acquisti=1
        cur.execute("""
            SELECT f.id, f.fornitore_nome, f.numero_fattura,
                   f.data_fattura AS data_ref, f.totale_fattura AS totale,
                   'FATTURA' AS tipo
            FROM fe_fatture f
            LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
            LEFT JOIN fe_fornitore_categoria fc_cat
                   ON (fc_cat.fornitore_piva = f.fornitore_piva
                       AND fc_cat.fornitore_piva IS NOT NULL
                       AND fc_cat.fornitore_piva != '')
                   OR (COALESCE(fc_cat.fornitore_piva, '') = ''
                       AND COALESCE(f.fornitore_piva, '') = ''
                       AND fc_cat.fornitore_nome = f.fornitore_nome)
            WHERE bfl.id IS NULL
              AND COALESCE(fc_cat.escluso_acquisti, 0) = 0
              AND ABS(f.totale_fattura - ?) < MAX(? * 0.1, 1.0)
            ORDER BY ABS(f.totale_fattura - ?) ASC
            LIMIT ?
        """, (importo, importo, importo, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "fattura"; d["source_id"] = d["id"]
            results.append(d)

        # Uscite CG per importo (solo non-fattura)
        cur.execute("""
            SELECT cu.id, cu.fornitore_nome, cu.numero_fattura,
                   cu.data_scadenza AS data_ref, cu.totale,
                   COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo,
                   cu.periodo_riferimento
            FROM cg_uscite cu
            WHERE cu.banca_movimento_id IS NULL
              AND cu.fattura_id IS NULL
              AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
              AND ABS(cu.totale - ?) < MAX(? * 0.1, 1.0)
            ORDER BY ABS(cu.totale - ?) ASC
            LIMIT ?
        """, (importo, importo, importo, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "uscita"; d["source_id"] = d["id"]
            results.append(d)

        # ── ENTRATE per importo (storni, note di credito) ──
        cur.execute("""
            SELECT ce.id, ce.descrizione AS fornitore_nome,
                   NULL AS numero_fattura,
                   ce.data_entrata AS data_ref, ce.importo AS totale,
                   ce.categoria AS tipo
            FROM cg_entrate ce
            WHERE ce.banca_movimento_id IS NULL
              AND ABS(ce.importo - ?) < MAX(? * 0.1, 1.0)
            ORDER BY ABS(ce.importo - ?) ASC
            LIMIT ?
        """, (importo, importo, importo, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "entrata"; d["source_id"] = d["id"]
            results.append(d)

    else:
        term = f"%{q.strip()}%"
        # Fatture per testo — esclude fornitori con escluso_acquisti=1
        cur.execute("""
            SELECT f.id, f.fornitore_nome, f.numero_fattura,
                   f.data_fattura AS data_ref, f.totale_fattura AS totale,
                   'FATTURA' AS tipo
            FROM fe_fatture f
            LEFT JOIN banca_fatture_link bfl ON f.id = bfl.fattura_id
            LEFT JOIN fe_fornitore_categoria fc_cat
                   ON (fc_cat.fornitore_piva = f.fornitore_piva
                       AND fc_cat.fornitore_piva IS NOT NULL
                       AND fc_cat.fornitore_piva != '')
                   OR (COALESCE(fc_cat.fornitore_piva, '') = ''
                       AND COALESCE(f.fornitore_piva, '') = ''
                       AND fc_cat.fornitore_nome = f.fornitore_nome)
            WHERE bfl.id IS NULL
              AND COALESCE(fc_cat.escluso_acquisti, 0) = 0
              AND (f.fornitore_nome LIKE ? OR f.numero_fattura LIKE ?)
            ORDER BY f.data_fattura DESC
            LIMIT ?
        """, (term, term, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "fattura"; d["source_id"] = d["id"]
            results.append(d)

        # Uscite CG per testo (solo non-fattura)
        cur.execute("""
            SELECT cu.id, cu.fornitore_nome, cu.numero_fattura,
                   cu.data_scadenza AS data_ref, cu.totale,
                   COALESCE(cu.tipo_uscita, 'FATTURA') AS tipo,
                   cu.periodo_riferimento
            FROM cg_uscite cu
            WHERE cu.banca_movimento_id IS NULL
              AND cu.fattura_id IS NULL
              AND cu.stato IN ('DA_PAGARE', 'SCADUTA')
              AND (cu.fornitore_nome LIKE ? OR cu.numero_fattura LIKE ?)
            ORDER BY cu.data_scadenza DESC
            LIMIT ?
        """, (term, term, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "uscita"; d["source_id"] = d["id"]
            results.append(d)

        # ── ENTRATE per testo (storni, note di credito) ──
        cur.execute("""
            SELECT ce.id, ce.descrizione AS fornitore_nome,
                   NULL AS numero_fattura,
                   ce.data_entrata AS data_ref, ce.importo AS totale,
                   ce.categoria AS tipo
            FROM cg_entrate ce
            WHERE ce.banca_movimento_id IS NULL
              AND ce.descrizione LIKE ?
            ORDER BY ce.data_entrata DESC
            LIMIT ?
        """, (term, limit))
        for r in cur.fetchall():
            d = dict(r); d["source"] = "entrata"; d["source_id"] = d["id"]
            results.append(d)

    conn.close()
    return results


# ═══════════════════════════════════════════════════════
# 9b. REGISTRA SPESA/ENTRATA DA MOVIMENTO BANCARIO
# ═══════════════════════════════════════════════════════

@router.get("/cross-ref/categorie")
def get_categorie_registrazione():
    """Restituisce le categorie disponibili per registrazione movimenti."""
    return _get_categorie_by_tipo()


# ═══════════════════════════════════════════════════════
# 9c. CRUD CATEGORIE REGISTRAZIONE
# ═══════════════════════════════════════════════════════

class CategoriaRegistrazioneRequest(BaseModel):
    codice: str
    label: str
    tipo: str  # uscita | entrata
    pattern: str = ""
    colore: str = ""
    ordine: int = 50


@router.get("/categorie-registrazione")
def list_categorie_registrazione():
    """Tutte le categorie registrazione (attive e non)."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM banca_categorie_registrazione ORDER BY tipo, ordine, label"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/categorie-registrazione")
def create_categoria_registrazione(req: CategoriaRegistrazioneRequest):
    """Crea una nuova categoria registrazione."""
    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO banca_categorie_registrazione (codice, label, tipo, pattern, colore, ordine)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (req.codice.upper().replace(" ", "_"), req.label, req.tipo, req.pattern, req.colore, req.ordine))
        conn.commit()
        new_id = conn.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
    except Exception as e:
        conn.close()
        raise HTTPException(409, f"Codice già esistente o errore: {e}")
    conn.close()
    return {"id": new_id, "codice": req.codice.upper().replace(" ", "_")}


@router.put("/categorie-registrazione/{cat_id}")
def update_categoria_registrazione(cat_id: int, req: CategoriaRegistrazioneRequest):
    """Aggiorna una categoria registrazione."""
    conn = get_db()
    conn.execute("""
        UPDATE banca_categorie_registrazione
        SET label = ?, tipo = ?, pattern = ?, colore = ?, ordine = ?
        WHERE id = ?
    """, (req.label, req.tipo, req.pattern, req.colore, req.ordine, cat_id))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.patch("/categorie-registrazione/{cat_id}/toggle")
def toggle_categoria_registrazione(cat_id: int):
    """Attiva/disattiva una categoria registrazione."""
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute("SELECT attiva FROM banca_categorie_registrazione WHERE id = ?", (cat_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Categoria non trovata")
    new_state = 0 if row["attiva"] else 1
    cur.execute("UPDATE banca_categorie_registrazione SET attiva = ? WHERE id = ?", (new_state, cat_id))
    conn.commit()
    conn.close()
    return {"attiva": bool(new_state)}


@router.get("/cross-ref/auto-categoria/{movimento_id}")
def auto_categoria(movimento_id: int):
    """Rileva automaticamente la categoria di un movimento."""
    conn = get_db()
    cur = conn.cursor()
    mov = cur.execute(
        "SELECT id, importo, descrizione, data_contabile FROM banca_movimenti WHERE id = ?",
        (movimento_id,)
    ).fetchone()
    conn.close()
    if not mov:
        raise HTTPException(404, "Movimento non trovato")
    cat = _auto_detect_categoria(mov["descrizione"], mov["importo"])
    return {
        "categoria": cat,
        "tipo": "entrata" if mov["importo"] > 0 else "uscita",
        "descrizione_suggerita": (mov["descrizione"] or "").strip()[:100],
    }


@router.post("/cross-ref/registra")
def registra_movimento(req: RegistraMovimentoRequest):
    """
    Registra un movimento bancario come spesa (cg_uscite) o entrata (cg_entrate).
    Crea il record e lo collega direttamente al movimento bancario.
    """
    conn = get_db()
    cur = conn.cursor()

    # Leggi il movimento
    mov = cur.execute(
        "SELECT id, importo, descrizione, data_contabile FROM banca_movimenti WHERE id = ?",
        (req.movimento_id,)
    ).fetchone()
    if not mov:
        conn.close()
        raise HTTPException(404, "Movimento non trovato")

    importo = mov["importo"]
    data = mov["data_contabile"]
    desc = req.descrizione or (mov["descrizione"] or "").strip()[:100]

    if importo < 0:
        # ── USCITA ──
        # Verifica non sia già collegato
        existing = cur.execute(
            "SELECT id FROM cg_uscite WHERE banca_movimento_id = ?",
            (req.movimento_id,)
        ).fetchone()
        if existing:
            conn.close()
            raise HTTPException(409, "Movimento già collegato a un'uscita")

        cur.execute("""
            INSERT INTO cg_uscite (
                fornitore_nome, totale, data_scadenza, stato,
                banca_movimento_id, tipo_uscita, note,
                importo_pagato, data_pagamento
            ) VALUES (?, ?, ?, 'PAGATA', ?, ?, ?, ?, ?)
        """, (
            desc, abs(importo), data, req.movimento_id,
            req.categoria, req.note,
            abs(importo), data,
        ))
        new_id = cur.lastrowid
        result_type = "uscita"

    else:
        # ── ENTRATA ──
        existing = cur.execute(
            "SELECT id FROM cg_entrate WHERE banca_movimento_id = ?",
            (req.movimento_id,)
        ).fetchone()
        if existing:
            conn.close()
            raise HTTPException(409, "Movimento già collegato a un'entrata")

        cur.execute("""
            INSERT INTO cg_entrate (
                descrizione, categoria, importo, data_entrata,
                banca_movimento_id, note
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (desc, req.categoria, importo, data, req.movimento_id, req.note))
        new_id = cur.lastrowid
        result_type = "entrata"

    conn.commit()
    conn.close()
    return {"id": new_id, "tipo": result_type, "categoria": req.categoria}


class RegistraBulkRequest(BaseModel):
    movimento_ids: List[int]
    categoria: str


@router.post("/cross-ref/registra-bulk")
def registra_bulk(req: RegistraBulkRequest):
    """
    Registra più movimenti bancari in un colpo solo con la stessa categoria.
    Salta silenziosamente quelli già collegati.
    """
    conn = get_db()
    cur = conn.cursor()

    ok_count = 0
    skip_count = 0

    for mov_id in req.movimento_ids:
        mov = cur.execute(
            "SELECT id, importo, descrizione, data_contabile FROM banca_movimenti WHERE id = ?",
            (mov_id,)
        ).fetchone()
        if not mov:
            skip_count += 1
            continue

        importo = mov["importo"]
        data = mov["data_contabile"]
        desc = (mov["descrizione"] or "").strip()[:100]

        if importo < 0:
            existing = cur.execute(
                "SELECT id FROM cg_uscite WHERE banca_movimento_id = ?", (mov_id,)
            ).fetchone()
            if existing:
                skip_count += 1
                continue
            cur.execute("""
                INSERT INTO cg_uscite (
                    fornitore_nome, totale, data_scadenza, stato,
                    banca_movimento_id, tipo_uscita, importo_pagato, data_pagamento
                ) VALUES (?, ?, ?, 'PAGATA', ?, ?, ?, ?)
            """, (desc, abs(importo), data, mov_id, req.categoria, abs(importo), data))
            ok_count += 1
        else:
            existing = cur.execute(
                "SELECT id FROM cg_entrate WHERE banca_movimento_id = ?", (mov_id,)
            ).fetchone()
            if existing:
                skip_count += 1
                continue
            cur.execute("""
                INSERT INTO cg_entrate (
                    descrizione, categoria, importo, data_entrata, banca_movimento_id
                ) VALUES (?, ?, ?, ?, ?)
            """, (desc, req.categoria, importo, data, mov_id))
            ok_count += 1

    conn.commit()
    conn.close()
    return {"ok": True, "registrati": ok_count, "saltati": skip_count}


@router.delete("/cross-ref/registra/{movimento_id}")
def annulla_registrazione(movimento_id: int):
    """Annulla la registrazione di un movimento (scollega da cg_uscite o cg_entrate)."""
    conn = get_db()
    cur = conn.cursor()

    # Prova uscita
    n = cur.execute(
        "DELETE FROM cg_uscite WHERE banca_movimento_id = ? AND fattura_id IS NULL AND spesa_fissa_id IS NULL",
        (movimento_id,)
    ).rowcount

    if n == 0:
        # Prova entrata
        n = cur.execute(
            "DELETE FROM cg_entrate WHERE banca_movimento_id = ?",
            (movimento_id,)
        ).rowcount

    if n == 0:
        conn.close()
        raise HTTPException(404, "Nessuna registrazione trovata per questo movimento")

    conn.commit()
    conn.close()
    return {"ok": True, "deleted": n}


# ═══════════════════════════════════════════════════════
# 9e. DUPLICATI — rilevamento e pulizia
# ═══════════════════════════════════════════════════════

@router.get("/duplicati")
def get_duplicati():
    """
    Rileva movimenti duplicati: stessa data + stesso importo + descrizione simile.
    NON segnala come duplicati movimenti con descrizione diversa (es. commissioni
    bonifici diversi nello stesso giorno).
    """
    conn = get_db()
    cur = conn.cursor()

    # Trova gruppi con stessa data + stesso importo (almeno 2 movimenti)
    cur.execute("""
        SELECT data_contabile, importo, COUNT(*) AS cnt,
               GROUP_CONCAT(id) AS ids
        FROM banca_movimenti
        GROUP BY data_contabile, importo
        HAVING cnt > 1
        ORDER BY data_contabile DESC
    """)

    groups = []
    for row in cur.fetchall():
        ids = [int(x) for x in row["ids"].split(",")]
        ph = ",".join("?" * len(ids))
        cur2 = conn.cursor()
        cur2.execute(f"""
            SELECT m.*,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM banca_fatture_link WHERE movimento_id = m.id
                   ) THEN 1
                   WHEN EXISTS (
                       SELECT 1 FROM cg_uscite WHERE banca_movimento_id = m.id
                   ) THEN 1
                   WHEN EXISTS (
                       SELECT 1 FROM cg_entrate WHERE banca_movimento_id = m.id
                   ) THEN 1
                   ELSE 0 END AS has_links
            FROM banca_movimenti m
            WHERE m.id IN ({ph})
            ORDER BY m.id ASC
        """, ids)
        movimenti = [dict(r) for r in cur2.fetchall()]

        # Raggruppa per descrizione normalizzata — solo gruppi con desc simile
        # sono veri duplicati (commissioni diverse non lo sono)
        by_desc = {}
        for m in movimenti:
            norm = _normalize_desc(m["descrizione"])
            by_desc.setdefault(norm, []).append(m)

        for norm_desc, mlist in by_desc.items():
            if len(mlist) < 2:
                continue
            groups.append({
                "data": row["data_contabile"],
                "importo": row["importo"],
                "count": len(mlist),
                "movimenti": mlist,
            })

    conn.close()
    return groups


@router.delete("/duplicati/{keep_id}")
def delete_duplicato(keep_id: int, delete_ids: str = ""):
    """
    Elimina movimenti duplicati, mantenendo keep_id.
    delete_ids: comma-separated IDs da eliminare.
    Migra eventuali link al movimento mantenuto.
    """
    if not delete_ids:
        raise HTTPException(400, "Specificare delete_ids (IDs separati da virgola)")

    to_delete = [int(x.strip()) for x in delete_ids.split(",") if x.strip()]
    if not to_delete:
        raise HTTPException(400, "Nessun ID da eliminare")

    conn = get_db()
    cur = conn.cursor()

    # Verifica che keep_id esista
    keep = cur.execute("SELECT id FROM banca_movimenti WHERE id = ?", (keep_id,)).fetchone()
    if not keep:
        conn.close()
        raise HTTPException(404, "Movimento da mantenere non trovato")

    deleted = 0
    migrated = 0
    for did in to_delete:
        if did == keep_id:
            continue

        # Migra link fattura
        cur.execute("""
            UPDATE banca_fatture_link SET movimento_id = ?
            WHERE movimento_id = ?
              AND fattura_id NOT IN (SELECT fattura_id FROM banca_fatture_link WHERE movimento_id = ?)
        """, (keep_id, did, keep_id))
        migrated += cur.rowcount

        # Migra link uscite
        cur.execute("""
            UPDATE cg_uscite SET banca_movimento_id = ?
            WHERE banca_movimento_id = ?
              AND NOT EXISTS (SELECT 1 FROM cg_uscite u2 WHERE u2.banca_movimento_id = ? AND u2.id != cg_uscite.id)
        """, (keep_id, did, keep_id))
        migrated += cur.rowcount

        # Migra link entrate
        cur.execute("""
            UPDATE cg_entrate SET banca_movimento_id = ?
            WHERE banca_movimento_id = ?
              AND NOT EXISTS (SELECT 1 FROM cg_entrate e2 WHERE e2.banca_movimento_id = ? AND e2.id != cg_entrate.id)
        """, (keep_id, did, keep_id))
        migrated += cur.rowcount

        # Elimina link orfani rimasti
        cur.execute("DELETE FROM banca_fatture_link WHERE movimento_id = ?", (did,))
        cur.execute("UPDATE cg_uscite SET banca_movimento_id = NULL WHERE banca_movimento_id = ?", (did,))
        cur.execute("UPDATE cg_entrate SET banca_movimento_id = NULL WHERE banca_movimento_id = ?", (did,))

        # Elimina il duplicato
        cur.execute("DELETE FROM banca_movimenti WHERE id = ?", (did,))
        deleted += cur.rowcount

    conn.commit()
    conn.close()
    return {"ok": True, "deleted": deleted, "migrated": migrated}


# ═══════════════════════════════════════════════════════
# 10. IMPORT LOG
# ═══════════════════════════════════════════════════════

@router.get("/import-log")
def get_import_log():
    """Storico degli import CSV."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM banca_import_log
        ORDER BY created_at DESC
        LIMIT 50
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ═══════════════════════════════════════════════════════
# 11. ANDAMENTO (serie temporale)
# ═══════════════════════════════════════════════════════

@router.get("/andamento")
def get_andamento(
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    raggruppamento: str = Query("giorno", regex="^(giorno|settimana|mese)$"),
):
    """Serie temporale entrate/uscite per grafici."""
    conn = get_db()
    cur = conn.cursor()

    where = []
    params = []
    if data_da:
        where.append("data_contabile >= ?")
        params.append(data_da)
    if data_a:
        where.append("data_contabile <= ?")
        params.append(data_a)
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    if raggruppamento == "giorno":
        group_expr = "data_contabile"
    elif raggruppamento == "settimana":
        group_expr = "strftime('%Y-W%W', data_contabile)"
    else:  # mese
        group_expr = "strftime('%Y-%m', data_contabile)"

    cur.execute(f"""
        SELECT
            {group_expr} as periodo,
            SUM(CASE WHEN importo > 0 THEN importo ELSE 0 END) as entrate,
            SUM(CASE WHEN importo < 0 THEN ABS(importo) ELSE 0 END) as uscite,
            SUM(importo) as netto,
            COUNT(*) as num_movimenti
        FROM banca_movimenti
        {where_sql}
        GROUP BY {group_expr}
        ORDER BY periodo ASC
    """, params)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows
