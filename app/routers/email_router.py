# @version: v1.6 — posta letta e lavorata da chi ha Clienti › Posta nella matrice Moduli (admin + capo sala); configurazione caselle solo admin (2026-11-24)
# v1.5 — POST /email/posta/{id}/cestina: «🗑 Cestina» dalla pagina Posta (2026-11-21)
# v1.4 — bozze e invii: /email/bozze (crea, elenco, invia, annulla) (2026-11-20)
# v1.3 — le altre caselle del locale in sola lettura: /email/caselle/, /email/posta (2026-11-19)
# v1.2 — «Rispondi» dalla Posta: /email/in/{id}/bozza-risposta e /rispondi (2026-11-16)
# v1.1 — posta in arrivo in sola lettura: /email/in, /email/lettura (2026-11-13)
# v1.0 — Config canale email dal gestionale (sessione 2026-08-03)
# -*- coding: utf-8 -*-
"""
Router Email — TRGB Gestionale

Modulo: platform (mattone M.D)
Classificazione: [core]
Endpoint prefix: /email
Config: `email_settings.json` nella cartella dati del locale (+ .env come fallback)
Frontend: Impostazioni Sistema → tab Email

PERCHÉ QUI E NON NEL .env
-------------------------
Marco (2026-08-03): «non possiamo configurarli dal gestionale in modo che in
altre installazioni possano gestirli dalla configurazione?». Sì — ed è anche il
modo giusto per il prodotto vendibile: ogni locale ha la sua cartella dati,
quindi la sua casella, senza che nessuno debba aprire un terminale sul server.

Quello che NON si fa è scrivere nel `.env` dall'app: le variabili d'ambiente si
leggono all'avvio, quindi servirebbe un restart a ogni salvataggio (e il restart
è la finestra in cui i DB SQLite si sono già corrotti), e daremmo al processo web
il permesso di riscrivere il file che contiene tutti gli altri segreti.

La password non esce MAI da questa API: la UI mostra solo "impostata / non
impostata" e può sostituirla.

POSTA IN ARRIVO (v1.1, 2026-11-13) — email_in_service
-----------------------------------------------------
  GET  /email/in                 elenco (giorni, dal, stato, preventivo_id, abbinamento, q)
  GET  /email/in/{id}            una mail: testo intero (ripulito), allegati, preventivo
  POST /email/in/{id}/stato      {"stato": "gestita" | "nuova"}
  GET  /email/in/{id}/bozza-risposta   a, cc, oggetto «RE: …», citazione proposti (v1.2)
  POST /email/in/{id}/rispondi   manda la risposta dalla casella (In-Reply-To/References), la
                                 registra e segna la mail gestita (v1.2, 2026-11-16)
  GET  /email/lettura/           impostazioni della lettura IMAP + salute del job
  PUT  /email/lettura/           impostazioni (nessun segreto: le credenziali sono quelle SMTP)
  POST /email/lettura/giro       un giro adesso
Solo admin (M.G): la casella contiene anche mail che non sono dei preventivi. Le
risposte ai preventivi si vedono anche da /preventivi/{id}/risposte coi ruoli del
modulo. Il contenuto delle mail è dato di terzi: si mostra come testo, mai come HTML.

LE ALTRE CASELLE DEL LOCALE (v1.3, 2026-11-19) — email_caselle_service
---------------------------------------------------------------------
  GET  /email/caselle/                  impostazioni + caselle (senza password) + salute per casella
  PUT  /email/caselle/impostazioni      attiva, minuti, giorni, limiti, mittenti massivi, segni spam
  POST /email/caselle/                  crea o modifica una casella (password facoltativa: cifrata)
  POST /email/caselle/{id}/prova        login + cartelle trovate, senza scaricare niente
  POST /email/caselle/giro              un giro adesso (tutte, o ?casella=id)
  GET  /email/posta                     mail di tutte le caselle (+ quella del gestionale)
  GET  /email/posta/{id}                una mail per intero, altre copie, risposte mandate
  POST /email/posta/{id}/cestina        nel Cestino della casella (v1.5, 2026-11-21: solo da in arrivo/spam,
                                        mai la PEC; email_scrittura_service.cestina)
Solo admin. Sul server di posta l'unica rotta che sposta è /cestina; nessuna manda.

BOZZE E INVII (v1.4, 2026-11-20) — email_scrittura_service
---------------------------------------------------------
  GET  /email/bozze                 bozze (stato, rif_fonte, rif_id)
  POST /email/bozze                 prepara una mail: risposta (rif_fonte + rif_id) o nuova (casella, a, oggetto);
                                    caselle in Mail → cartella Bozze; trgb@ → resta in TRGB (pagina Posta)
  POST /email/bozze/{id}/invia      la manda (SMTP della casella, copia nell'Inviata, via dalle Bozze); PEC no
  POST /email/bozze/{id}/annulla    annulla (e la toglie dalle Bozze se c'è ancora)
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from app.services import email_caselle_service, email_in_service, email_scrittura_service, email_service
from app.services.auth_service import get_current_user, is_admin
from app.services.permessi import richiede_ruoli, richiede_sotto_modulo

router = APIRouter(prefix="/email", tags=["Email"])


def _solo_admin(current_user: Dict[str, Any]):
    if not is_admin((current_user or {}).get("role")):
        raise HTTPException(status_code=403, detail="Solo admin può toccare il canale email")


class EmailConfigIn(BaseModel):
    host: Optional[str] = None
    port: Optional[str] = None
    user: Optional[str] = None
    password: Optional[str] = None      # assente/vuota = lascia quella già salvata
    from_addr: Optional[str] = None
    from_name: Optional[str] = None
    test_to: Optional[str] = None       # destinatario dell'email di prova


@router.get("/config/")
def get_config_ep(current_user: Dict[str, Any] = Depends(get_current_user)):
    _solo_admin(current_user)
    return email_service.stato()


@router.put("/config/")
def put_config_ep(
    payload: EmailConfigIn,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    _solo_admin(current_user)
    try:
        return {"ok": True, "stato": email_service.salva_config(**payload.dict())}
    except ValueError as e:
        # Caso tipico: manca TRGB_SECRET_KEY. Il messaggio contiene già una
        # chiave pronta da incollare nel .env, quindi va mostrato per intero.
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/test/")
def test_ep(
    payload: Dict[str, str] = Body(default={}),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Email di prova. Senza 'to' usa il destinatario di prova salvato."""
    _solo_admin(current_user)
    return email_service.invia_test((payload or {}).get("to"))


# ─────────────────────────────────────────────
# POSTA IN ARRIVO (sola lettura della casella) — 2026-11-13
# ─────────────────────────────────────────────

# Leggere e lavorare la posta: chi ha Gestione Clienti › Posta nella matrice Moduli
# (2026-11-24: admin + capo sala, si cambia da Impostazioni Sistema › Moduli).
# Configurare le caselle (server, password, prova, giro automatico) resta solo admin.
_POSTA = richiede_sotto_modulo("clienti", "posta", cosa="la posta del locale")
_ADMIN_POSTA = richiede_ruoli("admin", cosa="la configurazione delle caselle")


class StatoMailIn(BaseModel):
    stato: str            # gestita | nuova


class LetturaConfigIn(BaseModel):
    attiva: Optional[bool] = None
    imap_host: Optional[str] = None
    imap_port: Optional[str] = None
    minuti: Optional[int] = None
    giorni_primo_import: Optional[int] = None
    max_mb: Optional[int] = None
    max_caratteri: Optional[int] = None
    max_per_giro: Optional[int] = None


@router.get("/in")
def elenco_in_ep(
    giorni: Optional[int] = Query(None, ge=1, le=3650, description="Mail con data negli ultimi N giorni"),
    dal: Optional[str] = Query(None, description="AAAA-MM-GG oppure AAAA-MM-GG HH:MM"),
    stato: Optional[str] = Query(None, pattern="^(nuova|gestita)$"),
    preventivo_id: Optional[int] = Query(None, ge=1),
    abbinamento: Optional[str] = Query(None, pattern="^(in_reply_to|numero|mittente|nessuno)$"),
    q: Optional[str] = Query(None, max_length=200),
    anche_nuove: bool = Query(False, description="In più tutte le mail ancora «nuova»"),
    limite: int = Query(100, ge=1, le=500),
    user: Dict[str, Any] = Depends(_POSTA),
):
    """Mail arrivate nella casella del gestionale, dalla più recente, col preventivo
    abbinato (numero, cliente, evento, scadenza della conferma) e un estratto."""
    try:
        return email_in_service.elenco(giorni=giorni, stato=stato, preventivo_id=preventivo_id, q=q,
                                       dal=dal, abbinamento=abbinamento, anche_nuove=anche_nuove,
                                       limite=limite)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/in/{email_id}")
def leggi_in_ep(email_id: int, user: Dict[str, Any] = Depends(_POSTA)):
    m = email_in_service.leggi(email_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mail non trovata")
    return m


@router.post("/in/{email_id}/stato")
def stato_in_ep(email_id: int, payload: StatoMailIn, user: Dict[str, Any] = Depends(_POSTA)):
    try:
        m = email_in_service.imposta_stato(email_id, payload.stato, user["username"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not m:
        raise HTTPException(status_code=404, detail="Mail non trovata")
    return m


class RispostaIn(BaseModel):
    testo: str
    a: Optional[str] = None            # vuoto = chi ha scritto la mail
    cc: Optional[str] = None           # None = gli altri del thread; "" = nessuno
    oggetto: Optional[str] = None      # vuoto = «RE: <oggetto>»
    cita: bool = True                  # in fondo la mail a cui si risponde, con «>»
    segna_gestita: bool = True


@router.get("/in/{email_id}/bozza-risposta")
def bozza_risposta_ep(email_id: int, user: Dict[str, Any] = Depends(_POSTA)):
    b = email_in_service.bozza_risposta(email_id)
    if not b:
        raise HTTPException(status_code=404, detail="Mail non trovata")
    return b


@router.post("/in/{email_id}/rispondi")
def rispondi_ep(email_id: int, payload: RispostaIn, user: Dict[str, Any] = Depends(_POSTA)):
    """Manda la risposta dalla casella del gestionale come risposta vera (stessa
    conversazione). Un errore SMTP non è un 500: torna ok=false ed è registrato."""
    try:
        res = email_in_service.rispondi(
            email_id, payload.testo, user["username"],
            a=payload.a if payload.a else None,
            cc=payload.cc, oggetto=payload.oggetto, cita=payload.cita, segna_gestita=payload.segna_gestita)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if res is None:
        raise HTTPException(status_code=404, detail="Mail non trovata")
    return res


@router.get("/lettura/")
def lettura_stato_ep(user: Dict[str, Any] = Depends(_POSTA)):
    return email_in_service.stato()


@router.put("/lettura/")
def lettura_config_ep(payload: LetturaConfigIn, user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    try:
        return email_in_service.salva_config(payload.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/lettura/giro")
def lettura_giro_ep(user: Dict[str, Any] = Depends(_POSTA)):
    """Un giro di lettura adesso (lo stesso che gira da solo ogni N minuti)."""
    return email_in_service.esegui_giro()


# ─────────────────────────────────────────────
# LE ALTRE CASELLE DEL LOCALE (sola lettura) — 2026-11-19
# ─────────────────────────────────────────────

class CaselleImpostazioniIn(BaseModel):
    attiva: Optional[bool] = None
    minuti: Optional[int] = None
    giorni_primo_import: Optional[int] = None
    giorni_flag: Optional[int] = None
    max_mb: Optional[int] = None
    max_caratteri: Optional[int] = None
    max_per_giro: Optional[int] = None
    mittenti_massivi: Optional[str] = None
    segni_spam: Optional[List[str]] = None


class CasellaIn(BaseModel):
    id: Optional[str] = None             # vuoto = casella nuova
    indirizzo: Optional[str] = None
    nome: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[str] = None
    utente: Optional[str] = None
    password: Optional[str] = None       # vuota = resta quella che c'è
    attiva: Optional[bool] = None
    ruoli: Optional[List[str]] = None    # in_arrivo, inviata, spam, cestino
    cartelle: Optional[Dict[str, List[str]]] = None


@router.get("/caselle/")
def caselle_stato_ep(user: Dict[str, Any] = Depends(_POSTA)):
    return email_caselle_service.stato()


@router.put("/caselle/impostazioni")
def caselle_impostazioni_ep(payload: CaselleImpostazioniIn, user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    try:
        return email_caselle_service.salva_impostazioni(payload.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/caselle/")
def casella_salva_ep(payload: CasellaIn, user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    try:
        return email_caselle_service.salva_casella(payload.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/caselle/giro")
def caselle_giro_ep(casella: Optional[str] = Query(None, max_length=200),
                    user: Dict[str, Any] = Depends(_POSTA)):
    """Un giro adesso (lo stesso che gira da solo ogni N minuti)."""
    return email_caselle_service.esegui_giro(solo=casella)


@router.post("/caselle/{casella_id}/prova")
def casella_prova_ep(casella_id: str, user: Dict[str, Any] = Depends(_ADMIN_POSTA)):
    return email_caselle_service.prova(casella_id)


@router.get("/posta")
def posta_elenco_ep(
    dal: Optional[str] = Query(None, description="AAAA-MM-GG oppure AAAA-MM-GG HH:MM"),
    giorni: Optional[int] = Query(None, ge=1, le=3650),
    casella: Optional[str] = Query(None, max_length=200),
    dove: Optional[str] = Query(None, description="in_arrivo,spam,cestino,inviata (separati da virgola)"),
    q: Optional[str] = Query(None, max_length=200),
    solo_da_rispondere: bool = Query(False),
    anche_massive: bool = Query(True),
    anche_trgb: bool = Query(True),
    limite: int = Query(100, ge=1, le=500),
    user: Dict[str, Any] = Depends(_POSTA),
):
    try:
        return email_caselle_service.elenco(
            dal=dal, giorni=giorni, casella=casella, dove=[x.strip() for x in dove.split(",")] if dove else None,
            q=q, solo_da_rispondere=solo_da_rispondere, anche_massive=anche_massive, anche_trgb=anche_trgb,
            limite=limite)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/posta/{email_id}")
def posta_leggi_ep(email_id: int, user: Dict[str, Any] = Depends(_POSTA)):
    m = email_caselle_service.leggi(email_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mail non trovata")
    return m


@router.post("/posta/{email_id}/cestina")
def posta_cestina_ep(email_id: int, user: Dict[str, Any] = Depends(_POSTA)):
    """Sposta la mail nel Cestino della sua casella (anche in Mail sul Mac: le caselle sono IMAP)."""
    try:
        return email_scrittura_service.cestina(email_id, user["username"])
    except email_scrittura_service.ErroreScrittura as e:
        raise HTTPException(status_code=404 if "(404)" in str(e) else 400, detail=str(e))


# ─────────────────────────────────────────────
# BOZZE E INVII — 2026-11-20
# ─────────────────────────────────────────────

class BozzaIn(BaseModel):
    testo: str
    rif_fonte: Optional[str] = None      # casella | trgb (vuoto = mail nuova)
    rif_id: Optional[int] = None
    casella: Optional[str] = None        # da quale casella (obbligatoria per una mail nuova)
    a: Optional[str] = None              # vuoto = chi ha scritto
    cc: Optional[str] = None             # None = gli altri del thread; "" = nessuno
    oggetto: Optional[str] = None
    cita: bool = True


@router.get("/bozze")
def bozze_ep(stato: Optional[str] = Query("bozza"), rif_fonte: Optional[str] = Query(None, pattern="^(casella|trgb)$"),
             rif_id: Optional[int] = Query(None, ge=1), user: Dict[str, Any] = Depends(_POSTA)):
    try:
        return {"bozze": email_scrittura_service.bozze(stato=stato or None, rif_fonte=rif_fonte, rif_id=rif_id)}
    except email_scrittura_service.ErroreScrittura as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bozze")
def bozza_crea_ep(payload: BozzaIn, user: Dict[str, Any] = Depends(_POSTA)):
    try:
        return email_scrittura_service.crea_bozza(
            payload.testo, user["username"], rif_fonte=payload.rif_fonte, rif_id=payload.rif_id,
            casella=payload.casella, a=payload.a if payload.a else None, cc=payload.cc, oggetto=payload.oggetto,
            cita=payload.cita)
    except email_scrittura_service.ErroreScrittura as e:
        raise HTTPException(status_code=404 if "(404)" in str(e) else 400, detail=str(e))


@router.post("/bozze/{bozza_id}/invia")
def bozza_invia_ep(bozza_id: int, user: Dict[str, Any] = Depends(_POSTA)):
    """Un errore SMTP non è un 500: torna ok=false e la bozza resta da mandare."""
    try:
        return email_scrittura_service.invia_bozza(bozza_id, user["username"])
    except email_scrittura_service.ErroreScrittura as e:
        raise HTTPException(status_code=404 if "(404)" in str(e) else 400, detail=str(e))


@router.post("/bozze/{bozza_id}/annulla")
def bozza_annulla_ep(bozza_id: int, user: Dict[str, Any] = Depends(_POSTA)):
    try:
        return email_scrittura_service.annulla_bozza(bozza_id, user["username"])
    except email_scrittura_service.ErroreScrittura as e:
        raise HTTPException(status_code=404 if "(404)" in str(e) else 400, detail=str(e))
