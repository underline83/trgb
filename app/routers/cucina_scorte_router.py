#!/usr/bin/env python3
# Modulo: cucina
# @version: v1.0 — Scorte: articoli, dotazione, semaforo, movimenti, conte, lotti (2026-09-07)
# -*- coding: utf-8 -*-
"""
Router Scorte cucina — modulo cucina.

Doc canonico: docs/modulo_scorte_cucina.md
module.json (pre-R8): id=cucina · prefix `/cucina/scorte` ·
tabelle cucina_articoli, cucina_giacenze, cucina_movimenti, cucina_conte,
cucina_conte_ripiani, cucina_conte_righe, cucina_lotti, cucina_scorte_config ·
platform: auth, permessi · opzionali: ricette (ingredients), acquisti ·
frontend: /cucina/mobile (tab «Scorte»)

La logica con una regola dietro sta in `app/services/cucina_scorte_service.py`:
qui ci sono solo validazione, permessi e forma della risposta. Se ti viene da
scrivere un calcolo in questo file, probabilmente va nel service.

DUE COSE DA RICORDARE LEGGENDO IL CODICE
----------------------------------------
· La giacenza di un articolo e' SEMPRE una somma su piu' ripiani, mai un valore
  letto da una riga sola.
· Il numero mostrato puo' essere una stima: `stato_dato` dice se fidarsi
  (doc §3.1). Chi consuma questi endpoint deve rispettarlo, o il modulo torna a
  mentire con la faccia seria.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.cucina_scorte_db import (
    FAMIGLIE_FRESCHEZZA,
    NATURE_ARTICOLO,
    REGIMI,
    REPARTI,
    STATI_LOTTO,
    STATI_SEMAFORO,
    TIPI_MOVIMENTO,
    UNITA_MISURA,
    incompatibile,
    leggi_config,
    valida,
)
from app.models.foodcost_db import get_foodcost_connection
from app.services.auth_service import get_current_user
from app.services.cucina_scorte_service import (
    ORIGINE_MOBILE,
    alert_scorte,
    annulla_movimento,
    apri_conta,
    assicura_giacenza,
    chiudi_conta,
    chiudi_ripiano,
    foglio_ripiano,
    giacenza_totale,
    registra_movimento,
    rimuovi_da_lista_spesa,
    scrivi_riga_conta,
    set_semaforo,
    stato_dato,
    ultimo_movimento,
)
from app.services.permessi import richiede_ruoli, verifica_ruoli

# PERMESSI (M.G) — chi puo' toccare le scorte.
# Router: la brigata al completo. Il semaforo, i movimenti e le righe di conta
# sono il lavoro quotidiano di chi sta in cucina, e chiedere l'admin per dire
# «e' finito il sale» significherebbe che nessuno lo dice piu'.
# Anagrafica articoli, chiusura conta e config: solo admin/chef nel corpo —
# la chiusura conta scrive un numero che finisce nel Controllo Gestione.
router = APIRouter(
    prefix="/cucina/scorte",
    tags=["cucina-scorte"],
    dependencies=[
        Depends(richiede_ruoli("admin", "chef", "sous_chef", "commis",
                               cosa="scorte di cucina")),
    ],
)

GESTIONE = ("admin", "chef")


# ─── Schemi ────────────────────────────────────────────────

class ArticoloIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=160)
    ingredient_id: Optional[int] = None
    categoria: Optional[str] = Field(default=None, max_length=60)
    um: str = "PZ"
    confezione: Optional[str] = Field(default=None, max_length=60)
    reparto: str = "cucina"
    regime: str = "SEMAFORO"
    natura: Optional[str] = None
    famiglia_freschezza: str = "SECCO"
    giorni_dato_fresco: Optional[int] = None
    ripiano_casa_id: Optional[int] = None
    scorta_minima: Optional[float] = None
    giorni_copertura: Optional[int] = None
    fornitore_piva: Optional[str] = Field(default=None, max_length=20)
    fornitore_freeform: Optional[str] = Field(default=None, max_length=120)
    shelf_life_aperto_gg: Optional[int] = None
    note: Optional[str] = Field(default=None, max_length=500)


class ArticoloUpdate(BaseModel):
    nome: Optional[str] = Field(default=None, min_length=1, max_length=160)
    ingredient_id: Optional[int] = None
    categoria: Optional[str] = Field(default=None, max_length=60)
    um: Optional[str] = None
    confezione: Optional[str] = Field(default=None, max_length=60)
    reparto: Optional[str] = None
    regime: Optional[str] = None
    natura: Optional[str] = None
    famiglia_freschezza: Optional[str] = None
    giorni_dato_fresco: Optional[int] = None
    ripiano_casa_id: Optional[int] = None
    scorta_minima: Optional[float] = None
    giorni_copertura: Optional[int] = None
    fornitore_piva: Optional[str] = Field(default=None, max_length=20)
    fornitore_freeform: Optional[str] = Field(default=None, max_length=120)
    shelf_life_aperto_gg: Optional[int] = None
    attivo: Optional[bool] = None
    note: Optional[str] = Field(default=None, max_length=500)


class SemaforoIn(BaseModel):
    ripiano_id: int
    stato: str


class DotazioneIn(BaseModel):
    articolo_id: int
    ripiano_id: int
    ordine: int = 0


class DotazioneTestoIn(BaseModel):
    """L'incolla-testo: una riga per articolo, nome + quantita' opzionale."""
    ripiano_id: int
    testo: str = Field(..., min_length=1, max_length=20000)
    conferma: bool = Field(default=False,
                           description="False = solo anteprima; True = scrive")


class MovimentoIn(BaseModel):
    articolo_id: int
    ripiano_id: Optional[int] = None
    tipo: str
    qta: float = Field(..., description="Sempre positiva: il segno lo decide il tipo")
    qta_precedente: Optional[float] = None
    motivo: Optional[str] = Field(default=None, max_length=300)
    lotto_id: Optional[int] = None
    ripiano_dest_id: Optional[int] = None


class ContaIn(BaseModel):
    reparto: str = "cucina"
    data: Optional[str] = None
    ubicazioni: Optional[List[int]] = None


class RigaContaIn(BaseModel):
    articolo_id: int
    qta_contata: float
    note: Optional[str] = Field(default=None, max_length=300)


class LottoIn(BaseModel):
    articolo_id: int
    ripiano_id: Optional[int] = None
    lotto_codice: Optional[str] = Field(default=None, max_length=60)
    data_arrivo: Optional[str] = None
    data_scadenza: Optional[str] = None
    qta_iniziale: Optional[float] = None
    fornitore: Optional[str] = Field(default=None, max_length=120)
    ddt_ref: Optional[str] = Field(default=None, max_length=60)
    note: Optional[str] = Field(default=None, max_length=300)


class LottoUpdate(BaseModel):
    ripiano_id: Optional[int] = None
    data_scadenza: Optional[str] = None
    data_apertura: Optional[str] = None
    qta_residua: Optional[float] = None
    stato: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=300)


class ConfigIn(BaseModel):
    chiave: str = Field(..., min_length=1, max_length=60)
    valore: str = Field(..., max_length=200)


# ─── Helper ────────────────────────────────────────────────

def _utente(current_user) -> str:
    return (current_user or {}).get("username") or "?"


def _v(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


def _get_articolo(cur, articolo_id: int) -> Dict[str, Any]:
    row = cur.execute("SELECT * FROM cucina_articoli WHERE id = ?", (articolo_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    return dict(row)


def _normalizza_articolo(d: Dict[str, Any]) -> Dict[str, Any]:
    """Valida le liste chiuse di un payload articolo, in un posto solo."""
    if "um" in d:
        d["um"] = _v(lambda: valida(d["um"], UNITA_MISURA, "um")) or "PZ"
    if "reparto" in d:
        d["reparto"] = _v(lambda: valida(d["reparto"], REPARTI, "reparto")) or "cucina"
    if "regime" in d:
        d["regime"] = _v(lambda: valida(d["regime"], REGIMI, "regime")) or "SEMAFORO"
    if "natura" in d:
        d["natura"] = _v(lambda: valida(d["natura"], NATURE_ARTICOLO, "natura"))
    if "famiglia_freschezza" in d:
        d["famiglia_freschezza"] = _v(
            lambda: valida(d["famiglia_freschezza"], FAMIGLIE_FRESCHEZZA, "famiglia_freschezza")
        ) or "SECCO"
    return d


# ─── Articoli ──────────────────────────────────────────────

@router.get("/articoli/")
def list_articoli(
    reparto: Optional[str] = Query(default="cucina"),
    categoria: Optional[str] = None,
    regime: Optional[str] = None,
    ubicazione_id: Optional[int] = None,
    ripiano_id: Optional[int] = None,
    solo_mancanti: bool = False,
    q: Optional[str] = Query(default=None, description="Ricerca sul nome"),
    solo_attivi: bool = True,
    limit: int = Query(default=500, ge=1, le=5000),
):
    """Elenco articoli con la giacenza aggregata sui ripiani.

    `giacenza` e' la SOMMA delle righe, e `posti` dice su quanti ripiani sta:
    un articolo che vive in due frigo non ha un numero solo, e mostrarne uno
    sarebbe una bugia comoda.
    """
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        sql = """
            SELECT  a.*,
                    (SELECT SUM(g.qta) FROM cucina_giacenze g WHERE g.articolo_id = a.id) AS giacenza,
                    (SELECT COUNT(*) FROM cucina_giacenze g
                      WHERE g.articolo_id = a.id AND g.in_dotazione = 1)                  AS posti,
                    (SELECT MAX(g.aggiornato_at) FROM cucina_giacenze g
                      WHERE g.articolo_id = a.id)                                         AS aggiornato_at,
                    (SELECT MIN(CASE g.stato_semaforo
                                WHEN 'FINITO' THEN 0 WHEN 'ESAURIMENTO' THEN 1 ELSE 2 END)
                       FROM cucina_giacenze g WHERE g.articolo_id = a.id)                 AS peggior_stato
              FROM cucina_articoli a
             WHERE 1=1
        """
        args: List[Any] = []
        if solo_attivi:
            sql += " AND a.attivo = 1"
        if reparto:
            sql += " AND a.reparto = ?"
            args.append(reparto.strip().lower())
        if categoria:
            sql += " AND a.categoria = ?"
            args.append(categoria)
        if regime:
            sql += " AND a.regime = ?"
            args.append(regime.strip().upper())
        if q:
            sql += " AND a.nome LIKE ?"
            args.append(f"%{q.strip()}%")
        if ripiano_id:
            sql += " AND EXISTS (SELECT 1 FROM cucina_giacenze g WHERE g.articolo_id = a.id AND g.ripiano_id = ?)"
            args.append(ripiano_id)
        elif ubicazione_id:
            sql += " AND EXISTS (SELECT 1 FROM cucina_giacenze g WHERE g.articolo_id = a.id AND g.ubicazione_id = ?)"
            args.append(ubicazione_id)
        if solo_mancanti:
            sql += """ AND EXISTS (SELECT 1 FROM cucina_giacenze g
                                    WHERE g.articolo_id = a.id
                                      AND g.stato_semaforo IN ('FINITO','ESAURIMENTO'))"""
        sql += " ORDER BY peggior_stato, a.nome LIMIT ?"
        args.append(limit)

        out = []
        for r in cur.execute(sql, args).fetchall():
            d = dict(r)
            d["stato_dato"] = stato_dato(conn, d, d.get("aggiornato_at"))
            out.append(d)
        return {"articoli": out, "totale": len(out)}
    finally:
        conn.close()


@router.get("/articoli/{articolo_id}")
def get_articolo(articolo_id: int):
    """La scheda: dove sta (ripiano per ripiano), lotti, ultimi movimenti.

    `azioni_rapide` porta le quantita' dell'ultima volta: scaricare deve costare
    un tap. Se costa un form, nessuno scarica e la giacenza smette di valere.
    """
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        a = _get_articolo(cur, articolo_id)

        a["posti"] = [dict(r) for r in cur.execute(
            """
            SELECT  g.id AS giacenza_id, g.qta, g.stato_semaforo, g.in_dotazione,
                    g.aggiornato_at, g.aggiornato_da, g.origine,
                    r.id AS ripiano_id, r.codice AS ripiano, r.destinazione,
                    u.id AS ubicazione_id, u.nome AS ubicazione, u.tipo
              FROM cucina_giacenze g
              JOIN cucina_ripiani r    ON r.id = g.ripiano_id
              JOIN cucina_ubicazioni u ON u.id = g.ubicazione_id
             WHERE g.articolo_id = ?
             ORDER BY u.ordine, r.ordine
            """,
            (articolo_id,),
        ).fetchall()]
        for p in a["posti"]:
            p["e_casa"] = (p["ripiano_id"] == a.get("ripiano_casa_id"))
            p["fuori_posto"] = incompatibile(a.get("natura"), p.get("destinazione"))

        a["giacenza"] = giacenza_totale(conn, articolo_id)
        ultimo = max((p["aggiornato_at"] for p in a["posti"] if p["aggiornato_at"]), default=None)
        a["stato_dato"] = stato_dato(conn, a, ultimo)

        a["lotti"] = [dict(r) for r in cur.execute(
            """
            SELECT l.*, r.codice AS ripiano, u.nome AS ubicazione
              FROM cucina_lotti l
              LEFT JOIN cucina_ripiani r    ON r.id = l.ripiano_id
              LEFT JOIN cucina_ubicazioni u ON u.id = r.ubicazione_id
             WHERE l.articolo_id = ? AND l.stato IN ('CHIUSO','APERTO')
             ORDER BY (l.stato = 'APERTO') DESC, l.data_scadenza
            """,
            (articolo_id,),
        ).fetchall()]

        a["movimenti"] = [dict(r) for r in cur.execute(
            """
            SELECT m.*, r.codice AS ripiano, u.nome AS ubicazione
              FROM cucina_movimenti m
              LEFT JOIN cucina_ripiani r    ON r.id = m.ripiano_id
              LEFT JOIN cucina_ubicazioni u ON u.id = m.ubicazione_id
             WHERE m.articolo_id = ?
             ORDER BY m.id DESC LIMIT 20
            """,
            (articolo_id,),
        ).fetchall()]

        a["azioni_rapide"] = {
            "scarico": ultimo_movimento(conn, articolo_id, "SCARICO"),
            "carico": ultimo_movimento(conn, articolo_id, "CARICO"),
        }
        return {"articolo": a}
    finally:
        conn.close()


@router.post("/articoli/", status_code=201)
def create_articolo(payload: ArticoloIn, current_user=Depends(get_current_user)):
    verifica_ruoli(current_user, *GESTIONE, cosa="creare un articolo di magazzino")
    d = _normalizza_articolo(payload.dict())
    d["nome"] = d["nome"].strip()
    d["created_by"] = _utente(current_user)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        cols = ", ".join(d.keys())
        ph = ", ".join("?" * len(d))
        cur.execute(f"INSERT INTO cucina_articoli ({cols}) VALUES ({ph})", list(d.values()))
        new_id = cur.lastrowid
        # Se ha una casa, ci nasce gia' in dotazione: e' il senso di «casa».
        if d.get("ripiano_casa_id"):
            assicura_giacenza(conn, new_id, d["ripiano_casa_id"])
        conn.commit()
        return {"ok": True, "articolo": _get_articolo(cur, new_id)}
    finally:
        conn.close()


@router.patch("/articoli/{articolo_id}")
def update_articolo(articolo_id: int, payload: ArticoloUpdate,
                    current_user=Depends(get_current_user)):
    verifica_ruoli(current_user, *GESTIONE, cosa="modificare un articolo di magazzino")
    d = _normalizza_articolo(payload.dict(exclude_unset=True))
    if not d:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    if "attivo" in d:
        d["attivo"] = 1 if d["attivo"] else 0

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_articolo(cur, articolo_id)
        sets = ", ".join(f"{k} = ?" for k in d)
        cur.execute(f"UPDATE cucina_articoli SET {sets} WHERE id = ?",
                    [*d.values(), articolo_id])
        if d.get("ripiano_casa_id"):
            assicura_giacenza(conn, articolo_id, d["ripiano_casa_id"])
        conn.commit()
        return {"ok": True, "articolo": _get_articolo(cur, articolo_id)}
    finally:
        conn.close()


@router.delete("/articoli/{articolo_id}")
def disattiva_articolo(articolo_id: int, current_user=Depends(get_current_user)):
    """Disattiva, non cancella: i movimenti storici restano leggibili."""
    verifica_ruoli(current_user, *GESTIONE, cosa="disattivare un articolo")
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_articolo(cur, articolo_id)
        cur.execute("UPDATE cucina_articoli SET attivo = 0 WHERE id = ?", (articolo_id,))
        conn.commit()
        return {"ok": True, "disattivato": articolo_id}
    finally:
        conn.close()


# ─── Il tap del cuoco ──────────────────────────────────────

@router.patch("/articoli/{articolo_id}/semaforo")
def patch_semaforo(articolo_id: int, payload: SemaforoIn,
                   current_user=Depends(get_current_user)):
    """Verde / giallo / rosso su un ripiano. Su rosso nasce la riga di spesa.

    Ritorna `spesa_id` quando ne ha creata una: e' cio' che serve all'annulla a
    8 secondi del client, che richiama questo endpoint sullo stato precedente e
    poi `DELETE /spesa/{id}`.
    """
    stato = _v(lambda: valida(payload.stato, STATI_SEMAFORO, "stato"))
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_articolo(cur, articolo_id)
        try:
            res = set_semaforo(conn, articolo_id, payload.ripiano_id, stato,
                               _utente(current_user))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        conn.commit()
        return {"ok": True, **res}
    finally:
        conn.close()


@router.delete("/spesa/{spesa_id}")
def annulla_riga_spesa(spesa_id: int, current_user=Depends(get_current_user)):
    """Toglie la riga di spesa nata da un semaforo — la seconda meta' dell'undo."""
    conn = get_foodcost_connection()
    try:
        rimuovi_da_lista_spesa(conn, spesa_id)
        conn.commit()
        return {"ok": True, "rimossa": spesa_id}
    finally:
        conn.close()


# ─── Dotazione ─────────────────────────────────────────────

@router.post("/dotazione/", status_code=201)
def metti_in_dotazione(payload: DotazioneIn, current_user=Depends(get_current_user)):
    """Dichiara che un articolo sta di norma su un ripiano.

    La riga nasce a quantita' NULL e resta viva anche quando l'articolo finisce:
    e' cosi' che il giro del frigo mostra i buchi invece di nasconderli.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="modificare la dotazione di un ripiano")
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_articolo(cur, payload.articolo_id)
        try:
            assicura_giacenza(conn, payload.articolo_id, payload.ripiano_id)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        cur.execute(
            "UPDATE cucina_giacenze SET in_dotazione = 1, ordine = ? WHERE articolo_id = ? AND ripiano_id = ?",
            (payload.ordine, payload.articolo_id, payload.ripiano_id),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/dotazione/")
def togli_da_dotazione(articolo_id: int, ripiano_id: int,
                       current_user=Depends(get_current_user)):
    """Toglie un articolo dalla dotazione di un ripiano.

    Se c'e' ancora giacenza si rifiuta: dire «qui non ci sta piu'» mentre ci
    sono due chili dentro e' il modo di far sparire della roba dai conti.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="modificare la dotazione di un ripiano")
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        row = cur.execute(
            "SELECT qta FROM cucina_giacenze WHERE articolo_id = ? AND ripiano_id = ?",
            (articolo_id, ripiano_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Non e' in dotazione su questo ripiano")
        if row["qta"] and float(row["qta"]) > 0:
            raise HTTPException(
                status_code=409,
                detail=f"Ci sono ancora {row['qta']} in giacenza: scaricale o spostale prima",
            )
        cur.execute("DELETE FROM cucina_giacenze WHERE articolo_id = ? AND ripiano_id = ?",
                    (articolo_id, ripiano_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.post("/dotazione/testo")
def dotazione_da_testo(payload: DotazioneTestoIn, current_user=Depends(get_current_user)):
    """Popola un ripiano da testo incollato — una riga per articolo.

    Formato tollerante: «costata di manzo 4,2 kg», «guanciale», «riso 12 pz».
    Nome obbligatorio, quantita' e unita' opzionali.

    L'ANTEPRIMA E' OBBLIGATORIA (`conferma: false` di default) e classifica ogni
    riga in tre casi — `ESISTE`, `NUOVO`, `SIMILE`. Il terzo e' il motivo per
    cui l'anteprima esiste: «pancetta arrotolata» quando in anagrafica c'e'
    «pancetta stesa» va deciso da un umano. Un'anagrafica sporca il primo
    giorno resta sporca per anni.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="popolare la dotazione di un ripiano")
    utente = _utente(current_user)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        rip = cur.execute(
            "SELECT r.*, u.nome AS ubicazione, u.reparto FROM cucina_ripiani r "
            "JOIN cucina_ubicazioni u ON u.id = r.ubicazione_id WHERE r.id = ?",
            (payload.ripiano_id,),
        ).fetchone()
        if not rip:
            raise HTTPException(status_code=404, detail="Ripiano non trovato")

        esistenti = {r["nome"].strip().lower(): dict(r) for r in cur.execute(
            "SELECT id, nome, um FROM cucina_articoli WHERE attivo = 1"
        ).fetchall()}

        righe: List[Dict[str, Any]] = []
        for grezza in payload.testo.splitlines():
            riga = grezza.strip()
            if not riga:
                continue
            nome, qta, um = _spezza_riga(riga)
            chiave = nome.lower()
            if chiave in esistenti:
                esito, articolo_id, nota = "ESISTE", esistenti[chiave]["id"], None
            else:
                simile = _piu_simile(chiave, esistenti.keys())
                if simile:
                    esito, articolo_id = "SIMILE", esistenti[simile]["id"]
                    nota = f"assomiglia a «{esistenti[simile]['nome']}» — e' la stessa cosa?"
                else:
                    esito, articolo_id, nota = "NUOVO", None, None
            righe.append({"riga": riga, "nome": nome, "qta": qta, "um": um,
                          "esito": esito, "articolo_id": articolo_id, "nota": nota})

        if not payload.conferma:
            return {
                "anteprima": True,
                "ripiano": {"id": rip["id"], "codice": rip["codice"],
                            "ubicazione": rip["ubicazione"],
                            "destinazione": rip["destinazione"]},
                "righe": righe,
                "riepilogo": {
                    "esistenti": sum(1 for r in righe if r["esito"] == "ESISTE"),
                    "nuovi": sum(1 for r in righe if r["esito"] == "NUOVO"),
                    "simili": sum(1 for r in righe if r["esito"] == "SIMILE"),
                },
            }

        creati = messi = 0
        for r in righe:
            articolo_id = r["articolo_id"]
            # Un «SIMILE» non confermato riga per riga viene trattato come
            # NUOVO: se l'utente ha premuto conferma davanti all'anteprima, ha
            # gia' visto l'avviso. Meglio un doppione visibile che una fusione
            # silenziosa di due prodotti diversi.
            if r["esito"] != "ESISTE":
                um = _v(lambda: valida(r["um"], UNITA_MISURA, "um")) if r["um"] else "PZ"
                cur.execute(
                    """
                    INSERT INTO cucina_articoli (nome, um, reparto, ripiano_casa_id, created_by)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (r["nome"], um or "PZ", rip["reparto"], rip["id"], utente),
                )
                articolo_id = cur.lastrowid
                creati += 1
            assicura_giacenza(conn, articolo_id, rip["id"])
            if r["qta"] is not None:
                cur.execute(
                    "UPDATE cucina_giacenze SET qta = ?, aggiornato_at = datetime('now','localtime'),"
                    " aggiornato_da = ?, origine = 'IMPORT' WHERE articolo_id = ? AND ripiano_id = ?",
                    (r["qta"], utente, articolo_id, rip["id"]),
                )
            messi += 1
        conn.commit()
        return {"ok": True, "articoli_creati": creati, "righe_in_dotazione": messi}
    finally:
        conn.close()


def _spezza_riga(riga: str) -> tuple[str, Optional[float], Optional[str]]:
    """«costata di manzo 4,2 kg» → ('Costata di manzo', 4.2, 'KG').

    Legge da destra: se le ultime parole sono un'unita' e/o un numero le
    stacca, altrimenti tutta la riga e' il nome. La virgola decimale italiana
    e' la norma qui, non l'eccezione.
    """
    pezzi = riga.split()
    um = None
    if pezzi and pezzi[-1].upper().rstrip(".") in UNITA_MISURA:
        um = pezzi.pop().upper().rstrip(".")
    qta = None
    if pezzi:
        try:
            qta = float(pezzi[-1].replace(",", "."))
            pezzi.pop()
        except ValueError:
            qta = None
    nome = " ".join(pezzi).strip() or riga.strip()
    return nome[:1].upper() + nome[1:], qta, um


def _piu_simile(nome: str, candidati) -> Optional[str]:
    """Il candidato piu' vicino, se abbastanza vicino. Solo per AVVISARE.

    Soglia alta di proposito (0.82): un falso allarme costa un'occhiata, una
    fusione sbagliata costa un'anagrafica rotta.
    """
    from difflib import SequenceMatcher
    migliore, punteggio = None, 0.0
    for c in candidati:
        p = SequenceMatcher(None, nome, c).ratio()
        if p > punteggio:
            migliore, punteggio = c, p
    return migliore if punteggio >= 0.82 else None


# ─── Movimenti ─────────────────────────────────────────────

@router.post("/movimenti/", status_code=201)
def post_movimento(payload: MovimentoIn, current_user=Depends(get_current_user)):
    """Registra un movimento. Il segno lo decide il tipo, non il chiamante.

    `SCARICO` e `SCARTO` tolgono, `CARICO` aggiunge, `RETTIFICA` porta il delta
    cosi' com'e'. Cosi' un client non puo' sbagliare segno e caricare quando
    voleva scaricare.
    """
    tipo = _v(lambda: valida(payload.tipo, TIPI_MOVIMENTO, "tipo"))
    qta = abs(float(payload.qta))
    delta = -qta if tipo in ("SCARICO", "SCARTO") else qta
    if tipo == "RETTIFICA":
        delta = float(payload.qta)

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_articolo(cur, payload.articolo_id)
        try:
            res = registra_movimento(
                conn,
                articolo_id=payload.articolo_id,
                ripiano_id=payload.ripiano_id,
                tipo=tipo,
                qta_delta=delta,
                utente=_utente(current_user),
                qta_precedente=payload.qta_precedente,
                motivo=payload.motivo,
                origine=ORIGINE_MOBILE,
                lotto_id=payload.lotto_id,
                ripiano_dest_id=payload.ripiano_dest_id,
            )
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        conn.commit()
        return {"ok": True, "movimento": res}
    finally:
        conn.close()


@router.delete("/movimenti/{mov_id}")
def delete_movimento(mov_id: int, current_user=Depends(get_current_user)):
    """L'undo a 8 secondi. Soft-delete: il movimento resta, marcato annullato."""
    conn = get_foodcost_connection()
    try:
        try:
            res = annulla_movimento(conn, mov_id, _utente(current_user))
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        conn.commit()
        return {"ok": True, **res}
    finally:
        conn.close()


@router.get("/movimenti/")
def list_movimenti(
    articolo_id: Optional[int] = None,
    ubicazione_id: Optional[int] = None,
    tipo: Optional[str] = None,
    dal: Optional[str] = None,
    al: Optional[str] = None,
    includi_annullati: bool = False,
    limit: int = Query(default=100, ge=1, le=2000),
):
    conn = get_foodcost_connection()
    try:
        sql = """
            SELECT m.*, a.nome AS articolo, a.um,
                   r.codice AS ripiano, u.nome AS ubicazione
              FROM cucina_movimenti m
              JOIN cucina_articoli a        ON a.id = m.articolo_id
              LEFT JOIN cucina_ripiani r    ON r.id = m.ripiano_id
              LEFT JOIN cucina_ubicazioni u ON u.id = m.ubicazione_id
             WHERE 1=1
        """
        args: List[Any] = []
        if not includi_annullati:
            sql += " AND m.annullato_at IS NULL"
        if articolo_id:
            sql += " AND m.articolo_id = ?"; args.append(articolo_id)
        if ubicazione_id:
            sql += " AND m.ubicazione_id = ?"; args.append(ubicazione_id)
        if tipo:
            sql += " AND m.tipo = ?"; args.append(tipo.strip().upper())
        if dal:
            sql += " AND date(m.created_at) >= date(?)"; args.append(dal)
        if al:
            sql += " AND date(m.created_at) <= date(?)"; args.append(al)
        sql += " ORDER BY m.id DESC LIMIT ?"; args.append(limit)
        return {"movimenti": [dict(r) for r in conn.execute(sql, args).fetchall()]}
    finally:
        conn.close()


# ─── Conta a ripiani ───────────────────────────────────────

@router.get("/conte/")
def list_conte(limit: int = Query(default=30, ge=1, le=200)):
    conn = get_foodcost_connection()
    try:
        rows = conn.execute(
            """
            SELECT c.*,
                   (SELECT COUNT(*) FROM cucina_conte_ripiani cr WHERE cr.conta_id = c.id) AS ripiani,
                   (SELECT COUNT(*) FROM cucina_conte_ripiani cr
                     WHERE cr.conta_id = c.id AND cr.stato = 'CONTATO')                     AS contati
              FROM cucina_conte c
             ORDER BY c.data DESC, c.id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return {"conte": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/conte/", status_code=201)
def post_conta(payload: ContaIn, current_user=Depends(get_current_user)):
    """Apre una sessione e ci mette dentro i ripiani da fare."""
    verifica_ruoli(current_user, *GESTIONE, cosa="aprire una conta")
    reparto = _v(lambda: valida(payload.reparto, REPARTI, "reparto")) or "cucina"
    conn = get_foodcost_connection()
    try:
        aperta = conn.execute(
            "SELECT id FROM cucina_conte WHERE stato = 'APERTA' AND reparto = ?", (reparto,)
        ).fetchone()
        if aperta:
            raise HTTPException(
                status_code=409,
                detail=f"C'e' gia' la conta #{aperta['id']} aperta per {reparto}: finiscila o chiudila",
            )
        conta_id = apri_conta(conn, _utente(current_user), reparto,
                              payload.data or date.today().isoformat(), payload.ubicazioni)
        conn.commit()
        row = conn.execute("SELECT * FROM cucina_conte WHERE id = ?", (conta_id,)).fetchone()
        n = conn.execute("SELECT COUNT(*) FROM cucina_conte_ripiani WHERE conta_id = ?",
                         (conta_id,)).fetchone()[0]
        return {"ok": True, "conta": dict(row), "ripiani_da_contare": n}
    finally:
        conn.close()


@router.get("/conte/{conta_id}/ripiani")
def conta_ripiani(conta_id: int):
    """Dove sei rimasto: i ripiani della conta, in ordine di giro."""
    conn = get_foodcost_connection()
    try:
        rows = conn.execute(
            """
            SELECT cr.*, r.codice AS ripiano, r.nome AS ripiano_nome, r.destinazione,
                   u.nome AS ubicazione, u.tipo, u.ordine AS ordine_u, r.ordine AS ordine_r,
                   (SELECT COUNT(*) FROM cucina_giacenze g
                     WHERE g.ripiano_id = cr.ripiano_id AND g.in_dotazione = 1) AS voci
              FROM cucina_conte_ripiani cr
              JOIN cucina_ripiani r    ON r.id = cr.ripiano_id
              JOIN cucina_ubicazioni u ON u.id = cr.ubicazione_id
             WHERE cr.conta_id = ?
             ORDER BY u.ordine, u.id, r.ordine, r.id
            """,
            (conta_id,),
        ).fetchall()
        out = [dict(r) for r in rows]
        return {
            "conta_id": conta_id,
            "ripiani": out,
            "avanzamento": {
                "totale": len(out),
                "contati": sum(1 for r in out if r["stato"] == "CONTATO"),
            },
        }
    finally:
        conn.close()


@router.get("/conte/{conta_id}/ripiani/{ripiano_id}")
def foglio_di_conta(conta_id: int, ripiano_id: int):
    """Il foglio del ripiano, precompilato con la quantita' attesa."""
    conn = get_foodcost_connection()
    try:
        return {"conta_id": conta_id, "ripiano_id": ripiano_id,
                "righe": foglio_ripiano(conn, conta_id, ripiano_id)}
    finally:
        conn.close()


@router.patch("/conte/{conta_id}/ripiani/{ripiano_id}")
def scrivi_conta(conta_id: int, ripiano_id: int, payload: RigaContaIn,
                 current_user=Depends(get_current_user)):
    """Scrive la quantita' trovata. La giacenza si muove solo alla chiusura del
    ripiano: finche' la conta e' aperta un numero sbagliato si corregge senza
    lasciare rettifiche fantasma nella timeline."""
    conn = get_foodcost_connection()
    try:
        stato = conn.execute("SELECT stato FROM cucina_conte WHERE id = ?", (conta_id,)).fetchone()
        if not stato:
            raise HTTPException(status_code=404, detail="Conta non trovata")
        if stato["stato"] == "CHIUSA":
            raise HTTPException(status_code=409, detail="Conta chiusa: fanne una nuova")
        res = scrivi_riga_conta(conn, conta_id, ripiano_id, payload.articolo_id,
                                payload.qta_contata, _utente(current_user), payload.note)
        conn.commit()
        return {"ok": True, **res}
    finally:
        conn.close()


@router.post("/conte/{conta_id}/ripiani/{ripiano_id}/chiudi")
def post_chiudi_ripiano(conta_id: int, ripiano_id: int,
                        current_user=Depends(get_current_user)):
    """Consolida il ripiano: le quantita' contate diventano la verita'.

    Gli articoli non contati NON si azzerano — non contare non significa che
    non c'e'.
    """
    conn = get_foodcost_connection()
    try:
        stato = conn.execute("SELECT stato FROM cucina_conte WHERE id = ?", (conta_id,)).fetchone()
        if not stato:
            raise HTTPException(status_code=404, detail="Conta non trovata")
        if stato["stato"] == "CHIUSA":
            raise HTTPException(status_code=409, detail="Conta gia' chiusa")
        res = chiudi_ripiano(conn, conta_id, ripiano_id, _utente(current_user))
        conn.commit()
        return {"ok": True, **res}
    finally:
        conn.close()


@router.post("/conte/{conta_id}/chiudi")
def post_chiudi_conta(conta_id: int, current_user=Depends(get_current_user)):
    """Chiude la sessione: valorizza e sigilla.

    Ristretto ad admin/chef perche' scrive un numero — la rimanenza — che
    finisce nel Controllo Gestione.
    """
    verifica_ruoli(current_user, *GESTIONE, cosa="chiudere una conta")
    conn = get_foodcost_connection()
    try:
        try:
            res = chiudi_conta(conn, conta_id, _utente(current_user))
        except ValueError as e:
            raise HTTPException(status_code=409, detail=str(e))
        conn.commit()
        return {"ok": True, **res}
    finally:
        conn.close()


# ─── Lotti ─────────────────────────────────────────────────

@router.get("/lotti/")
def list_lotti(articolo_id: Optional[int] = None, solo_attivi: bool = True,
               limit: int = Query(default=200, ge=1, le=2000)):
    conn = get_foodcost_connection()
    try:
        sql = """
            SELECT l.*, a.nome AS articolo, a.um, a.shelf_life_aperto_gg,
                   r.codice AS ripiano, u.nome AS ubicazione
              FROM cucina_lotti l
              JOIN cucina_articoli a        ON a.id = l.articolo_id
              LEFT JOIN cucina_ripiani r    ON r.id = l.ripiano_id
              LEFT JOIN cucina_ubicazioni u ON u.id = r.ubicazione_id
             WHERE 1=1
        """
        args: List[Any] = []
        if articolo_id:
            sql += " AND l.articolo_id = ?"; args.append(articolo_id)
        if solo_attivi:
            sql += " AND l.stato IN ('CHIUSO','APERTO')"
        sql += " ORDER BY l.data_scadenza IS NULL, l.data_scadenza, l.id DESC LIMIT ?"
        args.append(limit)
        return {"lotti": [dict(r) for r in conn.execute(sql, args).fetchall()]}
    finally:
        conn.close()


@router.post("/lotti/", status_code=201)
def create_lotto(payload: LottoIn, current_user=Depends(get_current_user)):
    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        _get_articolo(cur, payload.articolo_id)
        cur.execute(
            """
            INSERT INTO cucina_lotti
                (articolo_id, ripiano_id, lotto_codice, data_arrivo, data_scadenza,
                 qta_iniziale, qta_residua, fornitore, ddt_ref, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (payload.articolo_id, payload.ripiano_id,
             (payload.lotto_codice or "").strip() or None,
             payload.data_arrivo or date.today().isoformat(),
             payload.data_scadenza, payload.qta_iniziale, payload.qta_iniziale,
             (payload.fornitore or "").strip() or None,
             (payload.ddt_ref or "").strip() or None,
             (payload.note or "").strip() or None,
             _utente(current_user)),
        )
        new_id = cur.lastrowid
        conn.commit()
        return {"ok": True, "lotto": dict(
            cur.execute("SELECT * FROM cucina_lotti WHERE id = ?", (new_id,)).fetchone())}
    finally:
        conn.close()


@router.patch("/lotti/{lotto_id}")
def update_lotto(lotto_id: int, payload: LottoUpdate,
                 current_user=Depends(get_current_user)):
    """Apre, sposta, scarta o corregge un lotto.

    Passare a `APERTO` senza dare una data la mette a oggi: l'alert «aperto da
    troppo» ha bisogno di sapere da quando, e chiederlo a mano significherebbe
    non averlo mai.
    """
    d = payload.dict(exclude_unset=True)
    if not d:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    if "stato" in d:
        d["stato"] = _v(lambda: valida(d["stato"], STATI_LOTTO, "stato"))

    conn = get_foodcost_connection()
    try:
        cur = conn.cursor()
        row = cur.execute("SELECT * FROM cucina_lotti WHERE id = ?", (lotto_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Lotto non trovato")
        if d.get("stato") == "APERTO" and not row["data_apertura"] and "data_apertura" not in d:
            d["data_apertura"] = date.today().isoformat()

        sets = ", ".join(f"{k} = ?" for k in d)
        cur.execute(f"UPDATE cucina_lotti SET {sets} WHERE id = ?", [*d.values(), lotto_id])
        conn.commit()
        return {"ok": True, "lotto": dict(
            cur.execute("SELECT * FROM cucina_lotti WHERE id = ?", (lotto_id,)).fetchone())}
    finally:
        conn.close()


# ─── Alert e config ────────────────────────────────────────

@router.get("/alert/")
def get_alert(reparto: str = Query(default="cucina")):
    """Tutto cio' che non va, in una chiamata: mancanti, scadenze, aperti da
    troppo, dati non piu' affidabili, roba fuori posto."""
    conn = get_foodcost_connection()
    try:
        return alert_scorte(conn, reparto)
    finally:
        conn.close()


@router.get("/config/")
def get_config():
    """Le soglie del modulo. Nessun valore operativo e' hardcodato nel codice."""
    conn = get_foodcost_connection()
    try:
        return {"config": leggi_config(conn)}
    finally:
        conn.close()


@router.put("/config/")
def put_config(payload: ConfigIn, current_user=Depends(get_current_user)):
    verifica_ruoli(current_user, *GESTIONE, cosa="cambiare le soglie delle scorte")
    conn = get_foodcost_connection()
    try:
        conn.execute(
            """
            INSERT INTO cucina_scorte_config (chiave, valore, updated_at)
            VALUES (?, ?, datetime('now','localtime'))
            ON CONFLICT(chiave) DO UPDATE SET
                valore = excluded.valore, updated_at = excluded.updated_at
            """,
            (payload.chiave.strip(), payload.valore.strip()),
        )
        conn.commit()
        return {"ok": True, "config": leggi_config(conn)}
    finally:
        conn.close()
