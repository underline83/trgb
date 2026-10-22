"""
Router Preventivi — API CRUD preventivi eventi + template + PDF.
Prefix: /preventivi
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, List

from app.services.auth_service import get_current_user, is_admin

from app.services.preventivi_service import (
    crea_preventivo,
    get_preventivo,
    lista_preventivi,
    stats_preventivi,
    aggiorna_preventivo,
    elimina_preventivo,
    cambia_stato,
    duplica_preventivo,
    lista_template,
    crea_template,
    aggiorna_template,
    elimina_template,
    get_luoghi,
    set_luoghi,
    get_email_copia,
    set_email_copia,
    dopo_invio,
    lista_menu_righe,
    aggiungi_menu_riga,
    aggiorna_menu_riga,
    elimina_menu_riga,
    riordina_menu_righe,
    set_menu_sconto,
    # Menu multipli alternativi (mig 079)
    lista_menu,
    crea_menu,
    aggiorna_menu,
    elimina_menu,
    duplica_menu,
    riordina_menu,
    # Prezzo a corpo + testo cliente (mig 187)
    testo_cliente,
    # Invio al cliente + registro invii (mig 200)
    genera_pdf,
    lista_invii,
    registra_invio,
    bozza_email,
    invia_email_preventivo,
    testo_breve,
    # Conferma evento: prenotazione + avvisi (2026-10-20)
    conferma_evento,
)

from app.services.permessi import richiede_ruoli

# PERMESSI (2026-09-01, M.G) — preventivi
# Le scritture erano gia' admin-only; le LETTURE no, ed espongono dati cliente e prezzi degli eventi. Qui si chiude la lettura ai soli ruoli del modulo clienti.
# Ruoli da modules.json (`clienti`): admin, contabile, sala, sommelier (+superadmin implicito).
# Contesto: docs/audit_permessi_2026-09-01.md
router = APIRouter(prefix="/preventivi", tags=["Preventivi"],
    dependencies=[
        Depends(richiede_ruoli("admin", "contabile", "sala", "sommelier", cosa="preventivi")),
    ],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RigaIn(BaseModel):
    descrizione: str = ""
    qta: float = 1
    prezzo_unitario: float = 0
    tipo_riga: str = "voce"
    ordine: int = 0


class NuovoClienteIn(BaseModel):
    """Cliente minimale creato al volo dal form preventivo."""
    nome: str = ""
    cognome: str = ""
    telefono: Optional[str] = None
    email: Optional[str] = None


class PreventivoCreate(BaseModel):
    cliente_id: Optional[int] = None
    nuovo_cliente: Optional[NuovoClienteIn] = None
    # Titolo opzionale: se vuoto e is_bozza_auto=1 il backend usa un placeholder
    titolo: Optional[str] = None
    tipo: str = "cena_privata"
    data_evento: Optional[str] = None
    ora_evento: Optional[str] = None
    n_persone: Optional[int] = None
    luogo: str = "Sala"
    note_interne: Optional[str] = None
    note_cliente: Optional[str] = None
    condizioni: Optional[str] = None
    scadenza_conferma: Optional[str] = None
    canale: str = "telefono"
    template_id: Optional[int] = None
    # Menu proposto (ristorante-oriented)
    menu_nome: Optional[str] = None
    menu_prezzo_persona: Optional[float] = 0
    menu_descrizione: Optional[str] = None
    righe: List[RigaIn] = []
    # Flag auto-salvataggio silenzioso (sess 36, Opzione A): se 1 il preventivo
    # viene creato come bozza automatica, nascosta da lista/stats, pensata per
    # permettere al composer menu di funzionare sull'URL /nuovo.
    is_bozza_auto: Optional[int] = 0
    # 2026-10-20: preventivo creato dal tasto «📋 Preventivo» di una prenotazione
    prenotazione_id: Optional[int] = None


class PreventivoUpdate(BaseModel):
    cliente_id: Optional[int] = None
    nuovo_cliente: Optional[NuovoClienteIn] = None
    titolo: Optional[str] = None
    tipo: Optional[str] = None
    data_evento: Optional[str] = None
    ora_evento: Optional[str] = None
    n_persone: Optional[int] = None
    luogo: Optional[str] = None
    note_interne: Optional[str] = None
    note_cliente: Optional[str] = None
    condizioni: Optional[str] = None
    scadenza_conferma: Optional[str] = None
    canale: Optional[str] = None
    template_id: Optional[int] = None
    menu_nome: Optional[str] = None
    menu_prezzo_persona: Optional[float] = None
    menu_descrizione: Optional[str] = None
    righe: Optional[List[RigaIn]] = None
    # Permette al frontend di "promuovere" una bozza auto a bozza normale su
    # salvataggio esplicito (is_bozza_auto=0).
    is_bozza_auto: Optional[int] = None
    # Mig 187: menu scelto dal cliente tra le alternative. 0 = non ha ancora scelto.
    menu_scelto_id: Optional[int] = None
    prenotazione_id: Optional[int] = None


class LuoghiIn(BaseModel):
    luoghi: List[str] = Field(default_factory=list)


class StatoIn(BaseModel):
    stato: str


class TemplateIn(BaseModel):
    nome: str
    tipo: str = "cena_privata"
    righe: Optional[list] = None
    condizioni_default: Optional[str] = None


class TemplateUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    righe: Optional[list] = None
    condizioni_default: Optional[str] = None
    attivo: Optional[bool] = None


class MenuRigaIn(BaseModel):
    """Input per aggiungere/modificare una riga menu snapshot.
    Se `recipe_id` e' presente la riga viene snapshottata dalla ricetta madre;
    i campi name/price/description/category_name (se passati) sovrascrivono lo snapshot.
    `menu_id` (mig 079): id del menu alternativo cui la riga appartiene. Se omesso,
    viene usato/creato il menu primario del preventivo (retro-compat)."""
    recipe_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category_name: Optional[str] = None
    sort_order: Optional[int] = None
    menu_id: Optional[int] = None


class MenuRigaUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category_name: Optional[str] = None
    sort_order: Optional[int] = None


class MenuRiordinaIn(BaseModel):
    ordered_ids: List[int] = Field(default_factory=list)


class MenuScontoIn(BaseModel):
    sconto: float = 0


# Menu alternativi (mig 079)
class MenuCreateIn(BaseModel):
    nome: Optional[str] = None
    sconto: Optional[float] = 0
    # Mig 187 — prezzo a corpo
    pricing_mode: Optional[str] = None          # 'somma' | 'corpo'
    prezzo_corpo: Optional[float] = None        # vino escluso (o prezzo unico)
    prezzo_corpo_vino: Optional[float] = None   # vino incluso
    doppio_prezzo: Optional[bool] = None
    prezzo_corpo_scelta: Optional[str] = None   # 'escluso' | 'incluso' per il totale


class MenuUpdateIn(BaseModel):
    nome: Optional[str] = None
    sort_order: Optional[int] = None
    sconto: Optional[float] = None
    pricing_mode: Optional[str] = None
    prezzo_corpo: Optional[float] = None
    prezzo_corpo_vino: Optional[float] = None
    doppio_prezzo: Optional[bool] = None
    prezzo_corpo_scelta: Optional[str] = None


class MenuDuplicaIn(BaseModel):
    nuovo_nome: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_admin(user: dict):
    # Accetta sia admin sia superadmin (coerente con is_admin() in auth_service)
    if not is_admin(user.get("role")):
        raise HTTPException(status_code=403, detail="Solo admin")


# ---------------------------------------------------------------------------
# Lista + Stats (path fissi PRIMA di /{preventivo_id})
# ---------------------------------------------------------------------------

@router.get("")
def api_lista_preventivi(
    stato: Optional[str] = None,
    mese: Optional[int] = None,
    anno: Optional[int] = None,
    cliente_id: Optional[int] = None,
    tipo: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    includi_bozze_auto: bool = False,
    periodo: Optional[str] = Query(None, description="'prossimi' = eventi da oggi + senza data"),
    prenotazione_id: Optional[int] = Query(None, description="preventivi nati da questa prenotazione"),
    user: dict = Depends(get_current_user),
):
    return lista_preventivi(
        stato=stato, mese=mese, anno=anno,
        cliente_id=cliente_id, tipo=tipo, q=q,
        limit=limit, offset=offset,
        includi_bozze_auto=includi_bozze_auto,
        periodo=periodo,
        prenotazione_id=prenotazione_id,
    )


@router.get("/stats")
def api_stats_preventivi(user: dict = Depends(get_current_user)):
    _require_admin(user)
    return stats_preventivi()


# ---------------------------------------------------------------------------
# Config luoghi (path fissi /config/* PRIMA di /{preventivo_id})
# ---------------------------------------------------------------------------

@router.get("/config/luoghi")
def api_get_luoghi(user: dict = Depends(get_current_user)):
    return {"luoghi": get_luoghi()}


@router.put("/config/luoghi")
def api_set_luoghi(body: LuoghiIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    return {"luoghi": set_luoghi(body.luoghi)}


class EmailCopiaIn(BaseModel):
    email: str = ""


@router.get("/config/email-copia")
def api_get_email_copia(user: dict = Depends(get_current_user)):
    _require_admin(user)
    return {"email": get_email_copia()}


@router.put("/config/email-copia")
def api_set_email_copia(body: EmailCopiaIn, user: dict = Depends(get_current_user)):
    """Indirizzi che ricevono la copia (col PDF) di ogni preventivo inviato; vuoto = nessuna."""
    _require_admin(user)
    try:
        return {"email": set_email_copia(body.email)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Template (path fissi /template/* PRIMA di /{preventivo_id})
# ---------------------------------------------------------------------------

@router.get("/template/lista")
def api_lista_template(user: dict = Depends(get_current_user)):
    return lista_template(solo_attivi=True)


@router.post("/template")
def api_crea_template(body: TemplateIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    return crea_template(body.dict())


@router.put("/template/{template_id}")
def api_aggiorna_template(template_id: int, body: TemplateUpdate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    data = body.dict(exclude_none=True)
    result = aggiorna_template(template_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return result


@router.delete("/template/{template_id}")
def api_elimina_template(template_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    ok = elimina_template(template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return {"ok": True}


# ---------------------------------------------------------------------------
# CRUD Preventivi (/{preventivo_id} path parametrici — DOPO i path fissi)
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}")
def api_get_preventivo(preventivo_id: int, user: dict = Depends(get_current_user)):
    prev = get_preventivo(preventivo_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return prev


@router.post("")
def api_crea_preventivo(body: PreventivoCreate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    data = body.dict(exclude={"righe", "nuovo_cliente"})
    righe = [r.dict() for r in body.righe]
    nuovo_cliente = body.nuovo_cliente.dict() if body.nuovo_cliente else None
    return crea_preventivo(data, righe, user["username"], nuovo_cliente=nuovo_cliente)


@router.put("/{preventivo_id}")
def api_aggiorna_preventivo(preventivo_id: int, body: PreventivoUpdate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    data = body.dict(exclude={"righe", "nuovo_cliente"}, exclude_none=True)
    righe = [r.dict() for r in body.righe] if body.righe is not None else None
    nuovo_cliente = body.nuovo_cliente.dict() if body.nuovo_cliente else None
    try:
        result = aggiorna_preventivo(preventivo_id, data, righe, nuovo_cliente=nuovo_cliente)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return result


@router.delete("/{preventivo_id}")
def api_elimina_preventivo(preventivo_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    ok = elimina_preventivo(preventivo_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return {"ok": True}


@router.post("/{preventivo_id}/stato")
def api_cambia_stato(preventivo_id: int, body: StatoIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    try:
        result = cambia_stato(preventivo_id, body.stato)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return result


class ConfermaIn(BaseModel):
    menu_scelto_id: Optional[int] = None


@router.post("/{preventivo_id}/conferma")
def api_conferma_evento(preventivo_id: int, body: ConfermaIn, user: dict = Depends(get_current_user)):
    """Conferma (2026-10-20): stato confermato → prenotazione trovata o creata col
    menù scelto (poi «prenotato»), avviso a sala e cucina nel campanello, messaggio
    pronto per i gruppi WhatsApp. Rilanciabile: riscrive il menù e riavvisa."""
    _require_admin(user)
    try:
        res = conferma_evento(preventivo_id, user["username"], body.menu_scelto_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if res is None:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return res


@router.post("/{preventivo_id}/duplica")
def api_duplica_preventivo(preventivo_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    result = duplica_preventivo(preventivo_id, user["username"])
    if not result:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return result


# ---------------------------------------------------------------------------
# Menu righe snapshot (mig 075) — /{preventivo_id}/menu-righe/*
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}/menu-righe")
def api_lista_menu_righe(preventivo_id: int, user: dict = Depends(get_current_user)):
    prev = get_preventivo(preventivo_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return {"items": lista_menu_righe(preventivo_id)}


@router.post("/{preventivo_id}/menu-righe")
def api_aggiungi_menu_riga(preventivo_id: int, body: MenuRigaIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    try:
        row = aggiungi_menu_riga(preventivo_id, body.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return row


@router.put("/{preventivo_id}/menu-righe/{riga_id}")
def api_aggiorna_menu_riga(preventivo_id: int, riga_id: int, body: MenuRigaUpdate, user: dict = Depends(get_current_user)):
    _require_admin(user)
    row = aggiorna_menu_riga(preventivo_id, riga_id, body.dict(exclude_none=True))
    if not row:
        raise HTTPException(status_code=404, detail="Riga non trovata")
    return row


@router.delete("/{preventivo_id}/menu-righe/{riga_id}")
def api_elimina_menu_riga(preventivo_id: int, riga_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    ok = elimina_menu_riga(preventivo_id, riga_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Riga non trovata")
    return {"ok": True}


@router.put("/{preventivo_id}/menu-righe")
def api_riordina_menu_righe(preventivo_id: int, body: MenuRiordinaIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    return {"items": riordina_menu_righe(preventivo_id, body.ordered_ids)}


@router.put("/{preventivo_id}/menu-sconto")
def api_set_menu_sconto(preventivo_id: int, body: MenuScontoIn, user: dict = Depends(get_current_user)):
    """Legacy: imposta lo sconto del menu primario."""
    _require_admin(user)
    result = set_menu_sconto(preventivo_id, body.sconto)
    if not result:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return result


# ---------------------------------------------------------------------------
# Menu alternativi (mig 079) — /{preventivo_id}/menu/*
# Un preventivo puo' avere N menu come alternative al cliente.
#   0 menu → totale = solo righe Extra
#   1 menu → totale = (menu.prezzo_persona × n_persone) + righe Extra
#   >= 2  → nessun totale aggregato (alternative)
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}/menu")
def api_lista_menu(preventivo_id: int, user: dict = Depends(get_current_user)):
    prev = get_preventivo(preventivo_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return {"items": lista_menu(preventivo_id)}


@router.post("/{preventivo_id}/menu")
def api_crea_menu(preventivo_id: int, body: MenuCreateIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    try:
        row = crea_menu(preventivo_id, body.dict(exclude_none=True))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return row


@router.put("/{preventivo_id}/menu/{menu_id}")
def api_aggiorna_menu(preventivo_id: int, menu_id: int, body: MenuUpdateIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    row = aggiorna_menu(preventivo_id, menu_id, body.dict(exclude_none=True))
    if not row:
        raise HTTPException(status_code=404, detail="Menu non trovato")
    return row


@router.delete("/{preventivo_id}/menu/{menu_id}")
def api_elimina_menu(preventivo_id: int, menu_id: int, user: dict = Depends(get_current_user)):
    _require_admin(user)
    ok = elimina_menu(preventivo_id, menu_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Menu non trovato")
    return {"ok": True}


@router.post("/{preventivo_id}/menu/{menu_id}/duplica")
def api_duplica_menu(preventivo_id: int, menu_id: int, body: MenuDuplicaIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    row = duplica_menu(preventivo_id, menu_id, body.nuovo_nome)
    if not row:
        raise HTTPException(status_code=404, detail="Menu non trovato")
    return row


@router.put("/{preventivo_id}/menu-ordine")
def api_riordina_menu(preventivo_id: int, body: MenuRiordinaIn, user: dict = Depends(get_current_user)):
    _require_admin(user)
    return {"items": riordina_menu(preventivo_id, body.ordered_ids)}


# ---------------------------------------------------------------------------
# Righe annidate per menu specifico — /{preventivo_id}/menu/{menu_id}/righe/*
# (Le righe nella route legacy /menu-righe continuano a funzionare sul menu primario.)
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}/menu/{menu_id}/righe")
def api_lista_menu_righe_per_menu(preventivo_id: int, menu_id: int, user: dict = Depends(get_current_user)):
    prev = get_preventivo(preventivo_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return {"items": lista_menu_righe(preventivo_id, menu_id=menu_id)}


@router.post("/{preventivo_id}/menu/{menu_id}/righe")
def api_aggiungi_menu_riga_per_menu(
    preventivo_id: int, menu_id: int, body: MenuRigaIn, user: dict = Depends(get_current_user)
):
    _require_admin(user)
    data = body.dict(exclude_none=True)
    data["menu_id"] = menu_id  # il path ha la verita'
    try:
        row = aggiungi_menu_riga(preventivo_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="Preventivo/menu non trovato")
    return row


@router.put("/{preventivo_id}/menu/{menu_id}/righe-ordine")
def api_riordina_menu_righe_per_menu(
    preventivo_id: int, menu_id: int, body: MenuRiordinaIn, user: dict = Depends(get_current_user)
):
    _require_admin(user)
    return {"items": riordina_menu_righe(preventivo_id, body.ordered_ids, menu_id=menu_id)}


# ---------------------------------------------------------------------------
# Testo per il cliente (WhatsApp / email) — mig 187
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}/testo")
def api_testo_preventivo(
    preventivo_id: int,
    tipo: str = Query("breve", description="breve = messaggio asciutto (menù e prezzi, il resto nel PDF); completo = con portate e condizioni"),
    user: dict = Depends(get_current_user),
):
    """Messaggio per WhatsApp (o da copiare). Di default asciutto (2026-10-19):
    saluto, evento, menù col prezzo a persona, «il resto è nel PDF». Mai i
    prezzi dei singoli piatti. È modificabile nel pannello d'invio."""
    testo = testo_cliente(preventivo_id) if tipo == "completo" else testo_breve(preventivo_id)
    if testo is None:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    prev = get_preventivo(preventivo_id) or {}
    return {"testo": testo, "telefono": prev.get("cliente_telefono")}


# ---------------------------------------------------------------------------
# PDF preventivo (mattone M.B — pdf_brand)
# ---------------------------------------------------------------------------

@router.get("/{preventivo_id}/pdf")
def api_pdf_preventivo(
    preventivo_id: int,
    inline: bool = Query(False, description="Se True apre inline nel browser, altrimenti download"),
    stile: str = Query("menu", description="menu = A5 stile menù gruppi (cliente); scheda = foglio A4 TRGB"),
    user: dict = Depends(get_current_user),
):
    """Genera il PDF del preventivo (mattone M.B): di default quello per il cliente."""
    try:
        gen = genera_pdf(preventivo_id, stile=stile)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {e}")
    if gen is None:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    pdf_bytes, filename = gen
    disposition = "inline" if inline else "attachment"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Invio al cliente: registro invii, WhatsApp, email con PDF (mig 200)
# ---------------------------------------------------------------------------

class InvioIn(BaseModel):
    canale: str = "whatsapp"          # l'email passa da /invia-email
    destinatario: Optional[str] = None


class EmailIn(BaseModel):
    to: str                            # uno o più indirizzi separati da virgola
    oggetto: str
    corpo: str = ""


@router.get("/{preventivo_id}/invii")
def api_lista_invii(preventivo_id: int, user: dict = Depends(get_current_user)):
    return lista_invii(preventivo_id)


@router.post("/{preventivo_id}/invii")
def api_registra_invio(preventivo_id: int, body: InvioIn, user: dict = Depends(get_current_user)):
    """Registra un invio fatto dal dispositivo (WhatsApp: condivisione PDF+testo
    o apertura chat). Il primo invio porta «bozza» → «inviato»."""
    _require_admin(user)
    if body.canale != "whatsapp":
        raise HTTPException(status_code=400, detail="Da qui si registra solo WhatsApp; l'email si manda con /invia-email")
    try:
        res = registra_invio(preventivo_id, "whatsapp", body.destinatario, user["username"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if res is None:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    # Copia all'osteria + messaggio per i gruppi (2026-10-22)
    res.update(dopo_invio(preventivo_id, "whatsapp", body.destinatario, user["username"]))
    return res


@router.get("/{preventivo_id}/email-bozza")
def api_email_bozza(preventivo_id: int, user: dict = Depends(get_current_user)):
    """Destinatario, oggetto e testo proposti; più se la casella è configurata."""
    res = bozza_email(preventivo_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return res


@router.post("/{preventivo_id}/invia-email")
def api_invia_email(preventivo_id: int, body: EmailIn, user: dict = Depends(get_current_user)):
    """Manda il preventivo via email col PDF allegato (M.D). L'esito, anche se
    negativo, finisce nel registro invii; un errore SMTP torna come ok=false."""
    _require_admin(user)
    to = [t.strip() for t in body.to.replace(";", ",").split(",") if t.strip()]
    if not to or any("@" not in t for t in to):
        raise HTTPException(status_code=400, detail="Indirizzo email non valido")
    if not body.oggetto.strip():
        raise HTTPException(status_code=400, detail="Oggetto vuoto")
    try:
        res = invia_email_preventivo(preventivo_id, to, body.oggetto.strip(), body.corpo, user["username"])
        if res and res.get("ok"):  # copia all'osteria + messaggio per i gruppi (2026-10-22)
            res.update(dopo_invio(preventivo_id, "email", ", ".join(to), user["username"]))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore invio: {e}")
    if res is None:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return res
