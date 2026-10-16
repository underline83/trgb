# -*- coding: utf-8 -*-
# @version: v1.0 — nascita della sezione Candidati (2026-10-16)
"""
Modulo: dipendenti (sotto-modulo candidati) — CV ricevuti e selezione del personale.
Doc: docs/modulo_dipendenti.md §5.9. Tabella: dipendenti_candidati (mig 188).

Manifesto (core/moduli/dipendenti/module.json): router_files += candidati_router,
tabelle_db += dipendenti_candidati. Route FE: /dipendenti/candidati, sub «candidati».

Endpoint (tutti solo admin/superadmin: sono dati personali di altre persone):
    GET    /dipendenti/candidati/                  elenco con filtri + contatori (scartati=true: anche scartati e assunti)
    GET    /dipendenti/candidati/contatori         per stato + CV di 12 mesi (badge)
    GET    /dipendenti/candidati/doppioni          stesso telefono / email / nome+cognome
    POST   /dipendenti/candidati/                  nuovo candidato (JSON)
    GET    /dipendenti/candidati/{id}              dettaglio
    PATCH  /dipendenti/candidati/{id}              modifica campi
    POST   /dipendenti/candidati/{id}/stato        cambio stato (non ASSUNTO)
    POST   /dipendenti/candidati/{id}/scarta       stato SCARTATO
    POST   /dipendenti/candidati/{id}/assumi       crea il dipendente + copia il CV negli allegati
    POST   /dipendenti/candidati/{id}/cv           carica/sostituisce il CV (multipart)
    GET    /dipendenti/candidati/{id}/cv           apre il CV
    DELETE /dipendenti/candidati/{id}              elimina record + CV (privacy)

Logica in app/services/candidati_service.py (la usa anche il connettore MCP).
Solo «assumi» sta qui: crea il dipendente con la funzione dell'anagrafica
(`dipendenti.create_dipendente`, stesso modulo), che vive nel router.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import uuid
from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ValidationError

from app.models.dipendenti_db import get_dipendenti_conn
from app.services import candidati_service as svc
from app.services.permessi import solo_admin

router = APIRouter(
    prefix="/dipendenti/candidati",
    tags=["Dipendenti — Candidati"],
    dependencies=[Depends(solo_admin(cosa="i candidati"))],
)


def _errori(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except svc.CandidatoNonTrovato as e:
        raise HTTPException(status_code=404, detail=str(e))
    except svc.CandidatoErrore as e:
        raise HTTPException(status_code=400, detail=str(e))


class CandidatoIn(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    ruolo_cercato: Optional[str] = None
    reparto_id: Optional[int] = None
    stato: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    disponibilita: Optional[str] = None
    lingue: Optional[str] = None
    documenti: Optional[str] = None
    note: Optional[str] = None
    colloquio_at: Optional[str] = None
    ricevuto_il: Optional[str] = None
    fonte: Optional[str] = None


class StatoIn(BaseModel):
    stato: str
    colloquio_at: Optional[str] = None
    nota: Optional[str] = None


class NotaIn(BaseModel):
    nota: Optional[str] = None


@router.get("/")
def elenco_candidati(
    stato: Optional[str] = None,
    reparto_id: Optional[int] = None,
    q: Optional[str] = None,
    scartati: bool = False,
):
    candidati = _errori(svc.elenco, stato=stato or None, reparto_id=reparto_id, q=q, scartati=scartati)
    return {
        "candidati": candidati,
        "contatori": svc.contatori(),
        "stati": [{"key": k, "label": v} for k, v in svc.ETICHETTE_STATO.items()],
    }


@router.get("/contatori")
def contatori_candidati():
    return svc.contatori()


@router.get("/doppioni")
def doppioni(nome: Optional[str] = None, cognome: Optional[str] = None,
             telefono: Optional[str] = None, email: Optional[str] = None):
    return svc.cerca_doppioni(nome=nome, cognome=cognome, telefono=telefono, email=email)


@router.post("/")
def nuovo_candidato(body: CandidatoIn, user: Dict[str, Any] = Depends(solo_admin(cosa="i candidati"))):
    dati = body.model_dump(exclude_none=True)
    dati.setdefault("nome", "")
    c = _errori(svc.crea, **dati, autore=user.get("username"))
    c["doppioni"] = svc.cerca_doppioni(nome=c["nome"], cognome=c.get("cognome"), telefono=c.get("telefono"),
                                       email=c.get("email"), escludi_id=c["id"])
    return c


@router.get("/{candidato_id}")
def leggi_candidato(candidato_id: int):
    return _errori(svc.leggi, candidato_id)


@router.patch("/{candidato_id}")
def modifica_candidato(candidato_id: int, body: CandidatoIn):
    campi = body.model_dump(exclude_unset=True)
    campi.pop("stato", None)  # lo stato passa da /stato
    return _errori(svc.aggiorna, candidato_id, campi)


@router.post("/{candidato_id}/stato")
def cambia_stato(candidato_id: int, body: StatoIn):
    return _errori(svc.cambia_stato, candidato_id, body.stato, colloquio_at=body.colloquio_at, nota=body.nota)


@router.post("/{candidato_id}/scarta")
def scarta(candidato_id: int, body: Optional[NotaIn] = None):
    return _errori(svc.scarta, candidato_id, nota=body.nota if body else None)


@router.delete("/{candidato_id}")
def elimina(candidato_id: int):
    _errori(svc.elimina, candidato_id)
    return {"ok": True}


@router.post("/{candidato_id}/cv")
async def carica_cv(candidato_id: int, file: UploadFile = File(...)):
    contenuto = await file.read(svc.CV_MAX_BYTES + 1)
    if len(contenuto) > svc.CV_MAX_BYTES:
        raise HTTPException(status_code=400, detail="CV oltre 20 MB")
    return _errori(svc.salva_cv, candidato_id, contenuto, file.filename)


@router.get("/{candidato_id}/cv")
def apri_cv(candidato_id: int):
    path, nome = _errori(svc.percorso_cv, candidato_id)
    # inline: il browser lo apre in una scheda invece di scaricarlo
    return FileResponse(path, filename=nome, content_disposition_type="inline")


@router.post("/{candidato_id}/assumi")
def assumi(candidato_id: int, user: Dict[str, Any] = Depends(solo_admin(cosa="i candidati"))):
    """Crea il dipendente in anagrafica con i dati già noti (stessa funzione del
    «+ Nuovo dipendente»), copia il CV negli allegati del dipendente, segna il
    candidato ASSUNTO con il suo dipendente_id."""
    # Import qui: stesso modulo (dipendenti), e cosi' il router candidati si
    # importa anche senza trascinarsi dietro i 3.500 righi dell'anagrafica.
    from app.routers.dipendenti import DOCS_BASE_DIR, DipendenteCreate, create_dipendente

    c = _errori(svc.verifica_assumibile, candidato_id)
    avvisi = []
    note = [x for x in (
        c.get("note"),
        f"Disponibilità: {c['disponibilita']}" if c.get("disponibilita") else None,
        f"Lingue: {c['lingue']}" if c.get("lingue") else None,
        f"Documenti: {c['documenti']}" if c.get("documenti") else None,
        f"Da candidato (ricevuto il {c['ricevuto_il']})" if c.get("ricevuto_il") else "Da candidato",
    ) if x]
    dati = dict(
        nome=c["nome"], cognome=c.get("cognome") or "—",
        ruolo=c.get("ruolo_cercato") or "—",
        telefono=c.get("telefono"), email=c.get("email"),
        reparto_id=c.get("reparto_id"), note="\n".join(note),
    )
    try:
        payload = DipendenteCreate(**dati)
    except ValidationError:
        # email scritta male: il dipendente nasce senza, la si corregge dall'anagrafica
        dati["email"] = None
        avvisi.append(f"Email «{c.get('email')}» non valida: non copiata in anagrafica")
        payload = DipendenteCreate(**dati)

    risposta = create_dipendente(payload, user)
    dipendente = json.loads(risposta.body)
    dip_id = dipendente["id"]

    allegato_id = None
    if c.get("cv_path"):
        try:
            src, nome = svc.percorso_cv(candidato_id)
            sicuro = re.sub(r"[^\w.\-]", "_", nome)
            dest_dir = os.path.join(DOCS_BASE_DIR, str(dip_id))
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, f"{date.today().strftime('%Y%m%d')}_{uuid.uuid4().hex[:12]}_{sicuro}")
            shutil.copyfile(src, dest)
            conn = get_dipendenti_conn()
            try:
                cur = conn.execute(
                    "INSERT INTO dipendenti_allegati (dipendente_id, filename, label, note) VALUES (?, ?, ?, ?)",
                    (dip_id, dest, f"CV — {c['nome_completo']}", "CV"))
                conn.commit()
                allegato_id = cur.lastrowid
            finally:
                conn.close()
        except svc.CandidatoNonTrovato:
            avvisi.append("Il file del CV non si trova più: non copiato negli allegati")

    candidato = svc.segna_assunto(candidato_id, dip_id)
    return {"candidato": candidato, "dipendente": dipendente, "allegato_id": allegato_id, "avvisi": avvisi}
