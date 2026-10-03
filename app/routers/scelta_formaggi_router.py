# ============================================================
# FILE: app/routers/scelta_formaggi_router.py
# Scelta dei Formaggi — formaggi disponibili alla vendita
# ============================================================

# @version: v1.2-formaggi — posizione/ruolo/alternativa + link ingrediente (mig 177)
# Modulo: cucina (selezioni) — [core]
# -*- coding: utf-8 -*-
"""
Endpoints modulo "Scelta dei Formaggi"

Gemello di scelta_salumi_router.py: differisce solo per il nome del campo
extra `latte` (vaccino/caprino/ovino/misto) al posto di `origine_animale`.
Il `produttore` qui descrive il caseificio.

Tabelle (foodcost.db):
  - formaggi_tagli       (mig 092)
  - formaggi_categorie   (mig 092)
  - formaggi_config      (mig 092)

Endpoints: come /salumi ma sotto /formaggi.

v1.2 (mig 177, 2026-10-01):
  - `posizione`         ordine di servizio (piu' delicato → piu' intenso); la
                        lista ordina per posizione, poi base prima delle alternative.
  - `ruolo`             'base' | 'alternativa'
  - `alternativa_di_id` per le alternative: il formaggio base che sostituiscono.
  - `ingredient_id`     link opzionale a `ingredients` (modulo ricette). Il costo
                        corrente arriva dal servizio platform `prezzi_ingredienti`
                        (regola 4: niente import dal router ricette) ed e' esposto
                        solo a chi scrive le selezioni (admin/chef).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.models.cucina_db import get_cucina_connection
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.formaggi")

from app.services.permessi import richiede_ruoli, ha_ruoli
from app.services.prezzi_ingredienti import prezzo_corrente, finestra_giorni

# PERMESSI (2026-09-01, M.G) — selezioni del giorno
# Erano aperte a qualsiasi ruolo, cancellazioni comprese.
# Ruoli da modules.json (`selezioni`): admin, chef, sala, sommelier (+superadmin implicito).
# Contesto: docs/audit_permessi_2026-09-01.md
router = APIRouter(
    prefix="/formaggi",
    tags=["formaggi"],
    dependencies=[
        Depends(richiede_ruoli("admin", "chef", "sous_chef", "commis", "sala", "sommelier", cosa="selezioni del giorno")),
    ],
)


# ─────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────

class TaglioIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    categoria: Optional[str] = Field(default=None, max_length=60)
    grammatura_g: Optional[int] = Field(default=None, ge=1)
    prezzo_euro: Optional[float] = Field(default=None, ge=0)
    produttore: Optional[str] = Field(default=None, max_length=200)
    stagionatura: Optional[str] = Field(default=None, max_length=100)
    latte: Optional[str] = Field(default=None, max_length=60)
    territorio: Optional[str] = Field(default=None, max_length=200)
    paese: Optional[str] = Field(default=None, max_length=60)
    descrizione: Optional[str] = None
    note: Optional[str] = None
    # mig 177
    posizione: Optional[int] = Field(default=None, ge=0, le=999)
    ruolo: Optional[str] = Field(default="base", pattern="^(base|alternativa)$")
    alternativa_di_id: Optional[int] = Field(default=None, ge=1)
    ingredient_id: Optional[int] = Field(default=None, ge=1)


class TaglioOut(BaseModel):
    id: int
    nome: str
    categoria: Optional[str] = None
    grammatura_g: Optional[int]
    prezzo_euro: Optional[float]
    produttore: Optional[str] = None
    stagionatura: Optional[str] = None
    latte: Optional[str] = None
    territorio: Optional[str] = None
    paese: Optional[str] = None
    descrizione: Optional[str] = None
    note: Optional[str]
    # mig 177
    posizione: Optional[int] = None
    ruolo: Optional[str] = "base"
    alternativa_di_id: Optional[int] = None
    alternativa_di_nome: Optional[str] = None
    ingredient_id: Optional[int] = None
    ingrediente_nome: Optional[str] = None
    ingrediente_unita: Optional[str] = None
    # €/unita' base dell'ingrediente (mediana finestra foodcost). Solo admin/chef.
    costo_corrente: Optional[float] = None
    attivo: bool = True
    archiviato_at: Optional[str] = None
    # Retrocompat: campi venduto/venduto_at restano nel DB ma la UI nuova usa attivo.
    venduto: bool
    venduto_at: Optional[str]
    created_at: str
    updated_at: str


class TaglioVendutoToggle(BaseModel):
    venduto: bool


class TaglioAttivoToggle(BaseModel):
    attivo: bool


class CategoriaIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=60)
    emoji: Optional[str] = Field(default=None, max_length=8)
    ordine: Optional[int] = Field(default=999, ge=0, le=9999)
    attivo: Optional[bool] = True


class CategoriaOut(BaseModel):
    id: int
    nome: str
    emoji: Optional[str] = None
    ordine: int
    attivo: bool


class FormaggiConfigOut(BaseModel):
    widget_max_categorie: int = 4
    # Preview Home (sessione 2026-05-08) — Modulo: platform/dashboard
    widget_preview_mode: str = "categorie"
    widget_preview_max: int = 3


class FormaggiConfigIn(BaseModel):
    widget_max_categorie: int = Field(default=4, ge=1, le=20)
    widget_preview_mode: str = Field(default="categorie", pattern="^(categorie|tagli|tutto)$")
    widget_preview_max: int = Field(default=3, ge=1, le=20)


# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

def _row_taglio(row) -> dict:
    d = dict(row)
    d["venduto"] = bool(d.get("venduto", 0))
    # `attivo` e `archiviato_at` arrivano dalla mig 093; fallback difensivo.
    d["attivo"] = bool(d.get("attivo", 1)) if "attivo" in d else True
    if "archiviato_at" not in d:
        d["archiviato_at"] = None
    # `paese` arriva dalla mig 107; fallback difensivo se la mig non è ancora
    # girata sul DB locale corrente.
    if "paese" not in d:
        d["paese"] = None
    # mig 177: fallback difensivo
    for k in ("posizione", "alternativa_di_id", "ingredient_id",
              "alternativa_di_nome", "ingrediente_nome", "ingrediente_unita",
              "costo_corrente"):
        d.setdefault(k, None)
    if not d.get("ruolo"):
        d["ruolo"] = "base"
    return d


def _colonne(conn) -> set:
    """Colonne presenti su formaggi_tagli (le mig 107/177 possono mancare in dev)."""
    try:
        return {c[1] for c in conn.execute("PRAGMA table_info(formaggi_tagli)").fetchall()}
    except Exception:
        return set()


def _valori_taglio(data: "TaglioIn") -> dict:
    ruolo = data.ruolo or "base"
    return {
        "nome": data.nome.strip(),
        "categoria": _clean(data.categoria),
        "grammatura_g": data.grammatura_g,
        "prezzo_euro": data.prezzo_euro,
        "produttore": _clean(data.produttore),
        "stagionatura": _clean(data.stagionatura),
        "latte": _clean(data.latte),
        "territorio": _clean(data.territorio),
        "paese": _clean(data.paese),
        "descrizione": _clean(data.descrizione),
        "note": _clean(data.note),
        "posizione": data.posizione,
        "ruolo": ruolo,
        # Una base non sostituisce nessuno.
        "alternativa_di_id": data.alternativa_di_id if ruolo == "alternativa" else None,
        "ingredient_id": data.ingredient_id,
    }


def _valida_collegamenti(conn, valori: dict, taglio_id: Optional[int] = None):
    """Controlla alternativa_di_id e ingredient_id prima di scrivere."""
    if valori.get("ruolo") == "alternativa":
        alt = valori.get("alternativa_di_id")
        if not alt:
            raise HTTPException(422, "Per un'alternativa indica quale formaggio base sostituisce")
        if taglio_id is not None and alt == taglio_id:
            raise HTTPException(422, "Un formaggio non puo' essere l'alternativa di se stesso")
        r = conn.execute(
            "SELECT id, COALESCE(ruolo, 'base') AS ruolo FROM formaggi_tagli WHERE id = ?", (alt,)
        ).fetchone()
        if not r:
            raise HTTPException(422, "Il formaggio base indicato non esiste")
        if r["ruolo"] != "base":
            raise HTTPException(422, "Un'alternativa puo' sostituire solo un formaggio base")
    ing = valori.get("ingredient_id")
    if ing:
        try:
            r = conn.execute("SELECT id FROM ingredients WHERE id = ?", (ing,)).fetchone()
        except Exception:
            r = None
        if not r:
            raise HTTPException(422, "Ingrediente non trovato")


def _arricchisci(conn, righe: list, con_costi: bool) -> list:
    """Aggiunge nome del base sostituito, nome/unita' ingrediente e (se ammesso) costo."""
    if not righe:
        return righe
    nomi = {r["id"]: r["nome"] for r in conn.execute("SELECT id, nome FROM formaggi_tagli").fetchall()}
    ing_ids = sorted({d["ingredient_id"] for d in righe if d.get("ingredient_id")})
    ing_meta = {}
    if ing_ids:
        try:
            q = "SELECT id, name, default_unit FROM ingredients WHERE id IN (%s)" % ",".join("?" * len(ing_ids))
            ing_meta = {r["id"]: (r["name"], r["default_unit"]) for r in conn.execute(q, ing_ids).fetchall()}
        except Exception:
            ing_meta = {}
    cur = conn.cursor()
    finestra = finestra_giorni(cur) if (con_costi and ing_ids) else None
    for d in righe:
        if d.get("alternativa_di_id"):
            d["alternativa_di_nome"] = nomi.get(d["alternativa_di_id"])
        meta = ing_meta.get(d.get("ingredient_id"))
        if meta:
            d["ingrediente_nome"], d["ingrediente_unita"] = meta
            if con_costi:
                d["costo_corrente"] = prezzo_corrente(cur, d["ingredient_id"], finestra)
    return righe


def _leggi_taglio(conn, taglio_id: int, con_costi: bool = True) -> dict:
    row = conn.execute("SELECT * FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
    return _arricchisci(conn, [_row_taglio(row)], con_costi)[0]


def _row_categoria(row) -> dict:
    d = dict(row)
    d["attivo"] = bool(d.get("attivo", 1))
    return d


def _get_config_int(conn, chiave: str, default: int) -> int:
    try:
        r = conn.execute(
            "SELECT valore FROM formaggi_config WHERE chiave = ?", (chiave,)
        ).fetchone()
        if r and r["valore"] is not None:
            return int(r["valore"])
    except Exception:
        pass
    return default


def _get_config_str(conn, chiave: str, default: str) -> str:
    try:
        r = conn.execute(
            "SELECT valore FROM formaggi_config WHERE chiave = ?", (chiave,)
        ).fetchone()
        if r and r["valore"] is not None:
            return str(r["valore"])
    except Exception:
        pass
    return default


def _set_config(conn, chiave: str, valore: str):
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute("""
        INSERT INTO formaggi_config (chiave, valore, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore, updated_at = excluded.updated_at
    """, (chiave, valore, now))


def _clean(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


# ─────────────────────────────────────────────────────────
# ENDPOINTS TAGLI
# ─────────────────────────────────────────────────────────

@router.get("/", response_model=List[TaglioOut])
def lista_tagli(stato: str = "attivi", current_user: dict = Depends(get_current_user)):
    """
    Lista formaggi.
    ?stato=attivi       → in carta (default)
    ?stato=archiviati   → archivio (riattivabili)
    ?stato=tutti        → tutti
    Alias legacy (retrocompat): disponibili→attivi, venduti→archiviati.
    """
    conn = get_cucina_connection()
    try:
        stato_norm = {
            "disponibili": "attivi",
            "venduti": "archiviati",
        }.get(stato, stato)

        base = "SELECT * FROM formaggi_tagli"
        if stato_norm == "attivi":
            base += " WHERE attivo = 1"
        elif stato_norm == "archiviati":
            base += " WHERE attivo = 0"
        # Ordine di servizio (mig 177): posizione, poi la base prima delle sue
        # alternative. Senza posizione in fondo, come prima (piu' recenti prima).
        if "posizione" in _colonne(conn):
            base += (" ORDER BY COALESCE(posizione, 9999),"
                     " CASE WHEN ruolo = 'alternativa' THEN 1 ELSE 0 END,"
                     " nome COLLATE NOCASE")
        else:
            base += " ORDER BY attivo DESC, created_at DESC"
        rows = conn.execute(base).fetchall()
        # Il costo d'acquisto lo vede solo chi scrive le selezioni.
        con_costi = ha_ruoli(current_user, "admin", "chef")
        return _arricchisci(conn, [_row_taglio(r) for r in rows], con_costi)
    finally:
        conn.close()


@router.post("/", response_model=TaglioOut, status_code=201, dependencies=[Depends(richiede_ruoli("admin", "chef", cosa="modificare le selezioni del giorno"))])
def crea_taglio(data: TaglioIn):
    """Inserisce un nuovo formaggio."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        cols = _colonne(conn)
        valori = {k: v for k, v in _valori_taglio(data).items() if k in cols}
        _valida_collegamenti(conn, valori)
        valori["created_at"] = now
        valori["updated_at"] = now
        nomi = list(valori.keys())
        cur = conn.execute(
            f"INSERT INTO formaggi_tagli ({', '.join(nomi)}) VALUES ({', '.join('?' * len(nomi))})",
            [valori[k] for k in nomi],
        )
        conn.commit()
        return _leggi_taglio(conn, cur.lastrowid)
    finally:
        conn.close()


@router.put("/{taglio_id}", response_model=TaglioOut, dependencies=[Depends(richiede_ruoli("admin", "chef", cosa="modificare le selezioni del giorno"))])
def modifica_taglio(taglio_id: int, data: TaglioIn):
    """Modifica un formaggio esistente."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        cols = _colonne(conn)
        valori = {k: v for k, v in _valori_taglio(data).items() if k in cols}
        # I campi della mig 177 si aggiornano solo se il client li manda: un
        # form che non li conosce non deve azzerare ordine, ruolo e ingrediente.
        inviati = data.model_fields_set
        for k in ("posizione", "ingredient_id"):
            if k not in inviati:
                valori.pop(k, None)
        if "ruolo" not in inviati:
            valori.pop("ruolo", None)
            valori.pop("alternativa_di_id", None)
        _valida_collegamenti(conn, valori, taglio_id)
        if valori.get("ruolo") == "alternativa":
            # Se diventa alternativa, nessuno puo' piu' sostituire lui.
            n = conn.execute(
                "SELECT COUNT(*) AS cnt FROM formaggi_tagli WHERE alternativa_di_id = ?", (taglio_id,)
            ).fetchone()["cnt"] if "alternativa_di_id" in cols else 0
            if n:
                raise HTTPException(422, f"{n} alternative puntano a questo formaggio: non puo' diventare un'alternativa")
        valori["updated_at"] = now
        nomi = list(valori.keys())
        conn.execute(
            f"UPDATE formaggi_tagli SET {', '.join(f'{k} = ?' for k in nomi)} WHERE id = ?",
            [valori[k] for k in nomi] + [taglio_id],
        )
        conn.commit()
        return _leggi_taglio(conn, taglio_id)
    finally:
        conn.close()


@router.patch("/{taglio_id}/attivo", response_model=TaglioOut)
def toggle_attivo(taglio_id: int, body: TaglioAttivoToggle):
    """
    Segna un formaggio come attivo (in carta) o archiviato (riattivabile).
    Endpoint nuovo dopo mig 093.
    """
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        archiviato_at = None if body.attivo else now
        conn.execute("""
            UPDATE formaggi_tagli
            SET attivo = ?, archiviato_at = ?, updated_at = ?
            WHERE id = ?
        """, (int(body.attivo), archiviato_at, now, taglio_id))
        conn.commit()
        return _leggi_taglio(conn, taglio_id, con_costi=False)
    finally:
        conn.close()


@router.patch("/{taglio_id}/venduto", response_model=TaglioOut, deprecated=True)
def toggle_venduto(taglio_id: int, body: TaglioVendutoToggle):
    """
    [DEPRECATO] Alias legacy: per salumi/formaggi il concetto "venduto" non
    ha piu' senso. Usare PATCH /{id}/attivo. Manteniamo questo endpoint per
    non rompere chiamate esistenti: lo mappiamo su `attivo`.
    """
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        now = datetime.now().isoformat(timespec="seconds")
        attivo_val = 0 if body.venduto else 1
        archiviato_at = now if body.venduto else None
        conn.execute("""
            UPDATE formaggi_tagli
            SET attivo = ?, archiviato_at = ?,
                venduto = ?, venduto_at = ?, updated_at = ?
            WHERE id = ?
        """, (attivo_val, archiviato_at,
              int(body.venduto), (now if body.venduto else None),
              now, taglio_id))
        conn.commit()
        return _leggi_taglio(conn, taglio_id, con_costi=False)
    finally:
        conn.close()


@router.delete("/{taglio_id}", status_code=204, dependencies=[Depends(richiede_ruoli("admin", "chef", cosa="modificare le selezioni del giorno"))])
def elimina_taglio(taglio_id: int):
    """Elimina un formaggio."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute("SELECT id FROM formaggi_tagli WHERE id = ?", (taglio_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Formaggio non trovato")
        if "alternativa_di_id" in _colonne(conn):
            n = conn.execute(
                "SELECT COUNT(*) AS cnt FROM formaggi_tagli WHERE alternativa_di_id = ?", (taglio_id,)
            ).fetchone()["cnt"]
            if n:
                raise HTTPException(409, f"{n} alternative sostituiscono questo formaggio: archivialo, oppure modifica prima le alternative")
        conn.execute("DELETE FROM formaggi_tagli WHERE id = ?", (taglio_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CATEGORIE
# ─────────────────────────────────────────────────────────

@router.get("/categorie/", response_model=List[CategoriaOut])
def lista_categorie(solo_attive: bool = True):
    """Lista categorie formaggi ordinate per `ordine` ascendente, poi nome."""
    conn = get_cucina_connection()
    try:
        base = "SELECT * FROM formaggi_categorie"
        if solo_attive:
            base += " WHERE attivo = 1"
        base += " ORDER BY ordine ASC, nome ASC"
        rows = conn.execute(base).fetchall()
        return [_row_categoria(r) for r in rows]
    finally:
        conn.close()


@router.post("/categorie/", response_model=CategoriaOut, status_code=201, dependencies=[Depends(richiede_ruoli("admin", "chef", cosa="modificare le selezioni del giorno"))])
def crea_categoria(data: CategoriaIn):
    """Crea una nuova categoria formaggi."""
    conn = get_cucina_connection()
    try:
        now = datetime.now().isoformat(timespec="seconds")
        try:
            cur = conn.execute("""
                INSERT INTO formaggi_categorie (nome, emoji, ordine, attivo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (data.nome.strip(), _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, now))
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM formaggi_categorie WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.put("/categorie/{cat_id}", response_model=CategoriaOut, dependencies=[Depends(richiede_ruoli("admin", "chef", cosa="modificare le selezioni del giorno"))])
def modifica_categoria(cat_id: int, data: CategoriaIn):
    """Modifica categoria formaggi (rinomina + propaga nei tagli che la usavano)."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM formaggi_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        now = datetime.now().isoformat(timespec="seconds")
        vecchio_nome = existing["nome"]
        nuovo_nome = data.nome.strip()
        try:
            conn.execute("""
                UPDATE formaggi_categorie
                SET nome = ?, emoji = ?, ordine = ?, attivo = ?, updated_at = ?
                WHERE id = ?
            """, (nuovo_nome, _clean(data.emoji),
                  int(data.ordine or 999), int(bool(data.attivo)), now, cat_id))
            if vecchio_nome and vecchio_nome != nuovo_nome:
                conn.execute(
                    "UPDATE formaggi_tagli SET categoria = ? WHERE categoria = ?",
                    (nuovo_nome, vecchio_nome),
                )
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Categoria con questo nome già esistente")
            raise
        row = conn.execute("SELECT * FROM formaggi_categorie WHERE id = ?", (cat_id,)).fetchone()
        return _row_categoria(row)
    finally:
        conn.close()


@router.delete("/categorie/{cat_id}", status_code=204, dependencies=[Depends(richiede_ruoli("admin", "chef", cosa="modificare le selezioni del giorno"))])
def elimina_categoria(cat_id: int):
    """Elimina una categoria formaggi solo se non in uso."""
    conn = get_cucina_connection()
    try:
        existing = conn.execute(
            "SELECT nome FROM formaggi_categorie WHERE id = ?", (cat_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Categoria non trovata")
        nome = existing["nome"]
        r = conn.execute(
            "SELECT COUNT(*) as cnt FROM formaggi_tagli WHERE categoria = ?", (nome,)
        ).fetchone()
        if r and r["cnt"] > 0:
            raise HTTPException(
                409,
                f"Impossibile eliminare: {r['cnt']} formaggio/formaggi usano ancora '{nome}'. Rinomina o rimuovili prima."
            )
        conn.execute("DELETE FROM formaggi_categorie WHERE id = ?", (cat_id,))
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────
# ENDPOINTS CONFIG
# ─────────────────────────────────────────────────────────

@router.get("/config/", response_model=FormaggiConfigOut)
def get_config():
    conn = get_cucina_connection()
    try:
        return FormaggiConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
            widget_preview_mode=_get_config_str(conn, "widget_preview_mode", "categorie"),
            widget_preview_max=_get_config_int(conn, "widget_preview_max", 3),
        )
    finally:
        conn.close()


@router.put("/config/", response_model=FormaggiConfigOut, dependencies=[Depends(richiede_ruoli("admin", "chef", cosa="modificare le selezioni del giorno"))])
def update_config(data: FormaggiConfigIn):
    conn = get_cucina_connection()
    try:
        _set_config(conn, "widget_max_categorie", str(int(data.widget_max_categorie)))
        _set_config(conn, "widget_preview_mode", str(data.widget_preview_mode))
        _set_config(conn, "widget_preview_max", str(int(data.widget_preview_max)))
        conn.commit()
        return FormaggiConfigOut(
            widget_max_categorie=_get_config_int(conn, "widget_max_categorie", 4),
            widget_preview_mode=_get_config_str(conn, "widget_preview_mode", "categorie"),
            widget_preview_max=_get_config_int(conn, "widget_preview_max", 3),
        )
    finally:
        conn.close()
