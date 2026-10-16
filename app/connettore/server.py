# @version: v1.2 (2026-10-16) — strumenti candidati (modulo dipendenti)
# v1.1 (2026-10-16) — Q scrive firmando «Q» (la chiave di Q, vedi oauth.py)
# -*- coding: utf-8 -*-
"""
server.py — TRGB come connettore MCP di claude.ai, su /mcp. Modulo: platform (M.K).
Doc: docs/connettore_mcp.md. Modello: ~/brain/app/connettore.py.

Claude lo usa da qualsiasi chat (web, desktop, iPhone): entra con OAuth (oauth.py),
poi chiama gli strumenti qui sotto. Gli strumenti NON hanno regole proprie: chiamano
le stesse funzioni dei service che usano i router (`pratiche_service`, `candidati_service`). Un errore
del service arriva a Claude come errore dello strumento, con lo stesso messaggio.

Ogni strumento:
  · esiste solo se il suo modulo è attivo per il locale (module_loader);
  · rilegge l'utente del token e rifà il controllo dei ruoli (M.G), come il router;
  · scrive col nome «claude (<utente>)».
"""
import functools
import json
from typing import Annotated, Literal, Optional

from pydantic import Field

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from starlette.requests import Request

from app.connettore import oauth
from app.platform import module_loader

Giorno = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="AAAA-MM-GG")]
Id = Annotated[int, Field(ge=1)]
StatoAperto = Literal["tocca_a_me", "tocca_a_loro"]
Stato = Literal["tocca_a_me", "tocca_a_loro", "chiusa"]

SOLA_LETTURA = ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False)
SCRIVE = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)

ISTRUZIONI = """TRGB, il gestionale del ristorante. Oggi da qui si gestiscono le PRATICHE.

Una pratica è uno scambio formale con qualcuno di esterno (ente, fornitore, studio,
creditore) che aspetta un esito: una PEC, un reclamo, un pignoramento, un contenzioso.
NON sono pratiche: un evento con un cliente (è un preventivo), un lavoro interno (è un
task), un pagamento (è un'uscita del controllo di gestione).

Regole che valgono sempre:
- Tre stati: tocca_a_me (la prossima mossa è mia), tocca_a_loro (aspetto la loro),
  chiusa (con esito obbligatorio).
- Il termine è facoltativo: se tocca a me è «entro quando agire», se tocca a loro è «fino
  a quando aspetto». Il tempo NON cambia lo stato: una pratica oltre il termine è
  «scaduta» ma resta nel suo stato finché qualcuno non la muove.
- La storia non si cancella: ogni fatto è un passo (pratica_passo). Una correzione è un
  passo nuovo. Le date dei passi sono quelle vere dei fatti, anche passate.
- Prima di creare una pratica cerca con pratiche_elenco (q=controparte) se esiste già.
- Prima di CREARE o CHIUDERE una pratica riepiloga a Marco cosa scriverai e aspetta il
  suo sì. Un passo semplice («è arrivata la PEC», «ho telefonato») si scrive e si
  conferma dopo, dicendo cosa hai scritto.
- Gli allegati si caricano dalla pagina /pratiche del gestionale, non da qui.
- CANDIDATI (CV ricevuti): prima di crearne uno cerca con candidati_elenco (nome/telefono/email); dati di terzi: niente dati sanitari né documenti d'identità; il CV si carica dalla pagina."""


def costruisci(url: str, nome_locale: str, versione: str) -> MCPServer:
    """Il server MCP. `url` è l'indirizzo pubblico del backend del locale: da lì nascono
    issuer e risorsa dell'OAuth."""
    url = url.rstrip("/")
    risorsa = f"{url}/mcp"
    fornitore = oauth.Fornitore(risorsa, nome_locale)
    mcp = MCPServer(
        name="trgb", title=f"TRGB — {nome_locale}", instructions=ISTRUZIONI, version=versione,
        auth_server_provider=fornitore,
        auth=AuthSettings(
            issuer_url=url, resource_server_url=risorsa, validate_token_resource=True,
            required_scopes=[oauth.SCOPE],
            client_registration_options=ClientRegistrationOptions(
                enabled=True, valid_scopes=[oauth.SCOPE], default_scopes=[oauth.SCOPE]),
            revocation_options=RevocationOptions(enabled=True)),
        log_level="WARNING")
    mcp.fornitore = fornitore

    @mcp.custom_route("/oauth/pin", methods=["GET", "POST"])
    async def pagina_pin(r: Request):
        return await fornitore.pagina_pin(r)

    if module_loader.is_module_active("pratiche"):
        _strumenti_pratiche(mcp)
    if module_loader.is_module_active("dipendenti"):
        _strumenti_candidati(mcp)
    return mcp


def _utente() -> dict:
    """L'utente del token, riletto ora: se non c'è più o non è più admin, niente."""
    tok = get_access_token()
    user = oauth.utente_attivo(tok.subject if tok else None)
    if not user:
        raise ToolError("Accesso non più valido: autorizza di nuovo il connettore. (403)")
    return user


def _strumento(mcp: MCPServer, annotazioni: ToolAnnotations):
    """Registra uno strumento: gli errori del service diventano errori leggibili, le
    liste un oggetto solo che dice anche quanti sono."""
    from app.services.candidati_service import CandidatoErrore, CandidatoNonTrovato
    from app.services.pratiche_service import PraticaErrore, PraticaNonTrovata

    def deco(f):
        @functools.wraps(f)
        def avvolto(*a, **k):
            try:
                esito = f(*a, **k)
            except (PraticaNonTrovata, CandidatoNonTrovato) as e:
                raise ToolError(f"{e} (404)") from None
            except (PraticaErrore, CandidatoErrore) as e:
                raise ToolError(f"{e} (400)") from None
            if isinstance(esito, list):
                esito = {"quante": len(esito), "risultati": esito}
            # una volta in JSON: date e None restano come le vede l'API
            return json.loads(json.dumps(esito, default=str))
        mcp.add_tool(avvolto, name=f.__name__, description=f.__doc__.strip(),
                     annotations=annotazioni, structured_output=False)
        return f
    return deco


def _autore() -> str:
    nome = _utente()["username"]
    return "Q" if nome == "Q" else f"claude ({nome})"


def _strumenti_pratiche(mcp: MCPServer) -> None:
    from app.services import pratiche_service as svc
    strumento = functools.partial(_strumento, mcp)
    autore = _autore

    @strumento(SOLA_LETTURA)
    def pratiche_elenco(
        stato: Stato | None = None,
        scadute: Annotated[bool | None, Field(description="true = solo le scadute")] = None,
        ferme: Annotated[bool | None, Field(description="true = solo le ferme (senza termine e senza passi da 30 giorni)")] = None,
        q: Annotated[str | None, Field(description="Cerca in titolo e controparte")] = None,
        chiuse: Annotated[bool, Field(description="true = anche le chiuse")] = False,
    ) -> dict:
        """Le pratiche, ordinate per termine (senza termine in fondo). Di default solo le
        aperte; stato=chiusa per le chiuse. Ogni pratica ha i valori calcolati scaduta,
        ferma e giorni_al_termine. Usalo anche per cercare se una pratica esiste già."""
        _utente()
        return svc.elenco(stato=stato, scadute=scadute, ferme=ferme, q=q, chiuse=chiuse)

    @strumento(SOLA_LETTURA)
    def pratica_leggi(id: Id) -> dict:
        """Una pratica con tutta la storia: i passi dal più recente (data, testo, cambio di
        stato e di termine, autore, se ha un allegato) e i collegamenti ad altri moduli."""
        _utente()
        return svc.leggi(id)

    @strumento(SCRIVE)
    def pratica_crea(
        titolo: Annotated[str, Field(min_length=1, description="«Identificazione incaricato recupero crediti»")],
        controparte: Annotated[str, Field(min_length=1, description="Ente, fornitore, studio o creditore")],
        testo: Annotated[str, Field(min_length=1, description="Il primo passo, una riga: «PEC inviata»")],
        stato: StatoAperto = "tocca_a_loro",
        contatto: Annotated[str | None, Field(description="Email, PEC o telefono della controparte")] = None,
        termine: Giorno | None = None,
        aperta_il: Annotated[Giorno | None, Field(description="Quando è cominciata davvero (anche passata). Oggi se manca")] = None,
    ) -> dict:
        """Una pratica nuova con il suo primo passo. PRIMA cerca con pratiche_elenco se
        esiste già, e riepiloga a Marco cosa crei: crea solo dopo il suo sì."""
        return svc.crea_pratica(titolo=titolo, controparte=controparte, testo=testo, stato=stato,
                                controparte_contatto=contatto, termine=termine, aperta_il=aperta_il,
                                autore=autore())

    @strumento(SCRIVE)
    def pratica_passo(
        id: Id,
        testo: Annotated[str, Field(min_length=1, description="Cosa è successo, una riga")],
        data: Annotated[Giorno | None, Field(description="Quando è successo (anche passato, mai futuro). Oggi se manca")] = None,
        stato: Annotated[Stato | None, Field(description="Solo se il passo cambia stato. chiusa = chiudere (serve esito); tocca_a_me/tocca_a_loro su una chiusa = riaprire")] = None,
        esito: Annotated[str | None, Field(description="Obbligatorio per chiudere: come è finita")] = None,
        termine: Annotated[Giorno | None, Field(description="Nuovo termine, solo se cambia")] = None,
        togli_termine: Annotated[bool, Field(description="true = la pratica resta senza termine")] = False,
    ) -> dict:
        """Il gesto di tutti i giorni: aggiunge un passo alla storia. Può anche cambiare
        stato (chiudere con esito, riaprire) e spostare o togliere il termine. Un passo
        semplice scrivilo e poi dillo a Marco; per CHIUDERE chiedi prima il suo sì."""
        if termine and togli_termine:
            raise ToolError("Passa termine oppure togli_termine, non tutti e due.")
        nuovo_termine = None if togli_termine else (termine if termine else svc.NON_CAMBIA)
        return svc.aggiungi_passo(id, testo=testo, data=data, stato_a=stato, termine_a=nuovo_termine,
                                  esito=esito, autore=autore())



StatoCandidato = Literal["NUOVO", "DA_SENTIRE", "COLLOQUIO", "IN_PROVA", "ASSUNTO", "SCARTATO"]
StatoCandidatoScrivibile = Literal["NUOVO", "DA_SENTIRE", "COLLOQUIO", "IN_PROVA", "SCARTATO"]


def _strumenti_candidati(mcp: MCPServer) -> None:
    """Candidati (modulo dipendenti, sotto-modulo candidati): solo admin, come la pagina."""
    from app.services import candidati_service as svc
    from app.services.permessi import ha_ruoli
    strumento = functools.partial(_strumento, mcp)

    def admin() -> None:
        if not ha_ruoli(_utente(), "admin"):
            raise ToolError("I candidati sono riservati ad admin e superadmin. (403)")

    def reparto_id(reparto: str | None) -> int | None:
        """«sala» / «cucina» / codice / id → id del reparto."""
        if not reparto:
            return None
        from app.models.dipendenti_db import get_dipendenti_conn
        conn = get_dipendenti_conn()
        try:
            rows = conn.execute("SELECT id, codice, nome FROM reparti WHERE attivo = 1").fetchall()
        finally:
            conn.close()
        r = reparto.strip().lower()
        for row in rows:
            if r in (str(row["id"]), (row["codice"] or "").lower(), (row["nome"] or "").lower()):
                return row["id"]
        nomi = ", ".join(row["nome"] for row in rows)
        raise ToolError(f"Reparto «{reparto}» sconosciuto. Reparti: {nomi} (400)")

    @strumento(SOLA_LETTURA)
    def candidati_elenco(
        q: Annotated[str | None, Field(description="Cerca in nome, cognome, ruolo, telefono, email, note")] = None,
        stato: StatoCandidato | None = None,
        reparto: Annotated[str | None, Field(description="sala, cucina… (nome o codice del reparto)")] = None,
        scartati: Annotated[bool, Field(description="true = anche scartati e assunti (l'archivio)")] = False,
    ) -> dict:
        """I candidati (CV ricevuti), dal più recente, con stato, ruolo cercato, reparto,
        contatti, disponibilità, lingue, documenti, note, colloquio e se il CV ha più di 12
        mesi (cv_vecchio). Di default solo quelli in corsa (senza scartati e assunti). Usalo SEMPRE prima di creare un
        candidato, cercando per nome, telefono ed email, per non farne un doppione."""
        admin()
        return svc.elenco(stato=stato, reparto_id=reparto_id(reparto), q=q, scartati=scartati)

    @strumento(SCRIVE)
    def candidato_crea(
        nome: Annotated[str, Field(min_length=1)],
        cognome: str | None = None,
        ruolo_cercato: Annotated[str | None, Field(description="Testo libero: «Barista jr · sala»")] = None,
        reparto: Annotated[str | None, Field(description="sala, cucina… (facoltativo)")] = None,
        stato: Literal["NUOVO", "DA_SENTIRE"] = "NUOVO",
        telefono: str | None = None,
        email: str | None = None,
        disponibilita: Annotated[str | None, Field(description="«subito, weekend ok, sere»")] = None,
        lingue: Annotated[str | None, Field(description="«ita C1, inglese B2»")] = None,
        documenti: Annotated[str | None, Field(description="«HACCP ok, permesso ok»")] = None,
        note: str | None = None,
        ricevuto_il: Annotated[Giorno | None, Field(description="Quando è arrivato il CV. Oggi se manca")] = None,
        fonte: Annotated[str | None, Field(description="Da dove arriva: «mail», «q», «passaparola»…")] = None,
    ) -> dict:
        """Un candidato nuovo. PRIMA cerca con candidati_elenco (nome, telefono, email) se
        esiste già: se c'è, aggiornalo con candidato_aggiorna invece di crearne un altro.
        I CV sono dati personali di terzi: niente dati sanitari, niente numeri di documenti
        d'identità nei campi (per il permesso di soggiorno basta «permesso ok / da
        verificare»). Il file del CV si carica dalla pagina Candidati."""
        admin()
        c = svc.crea(nome=nome, cognome=cognome, ruolo_cercato=ruolo_cercato,
                     reparto_id=reparto_id(reparto), stato=stato, telefono=telefono, email=email,
                     disponibilita=disponibilita, lingue=lingue, documenti=documenti, note=note,
                     ricevuto_il=ricevuto_il, fonte=fonte or ("q" if _autore() == "Q" else "claude"),
                     autore=_autore())
        c["possibili_doppioni"] = svc.cerca_doppioni(nome=c["nome"], cognome=c.get("cognome"),
                                                     telefono=c.get("telefono"), email=c.get("email"),
                                                     escludi_id=c["id"])
        return c

    @strumento(SCRIVE)
    def candidato_aggiorna(
        id: Id,
        stato: Annotated[StatoCandidatoScrivibile | None, Field(description="Nuovo stato. Per assumere si usa la pagina («Assumi → Anagrafica»)")] = None,
        colloquio_at: Annotated[str | None, Field(description="Data e ora del colloquio, AAAA-MM-GG HH:MM")] = None,
        nota: Annotated[str | None, Field(description="Riga da AGGIUNGERE alle note, con la data di oggi")] = None,
        ruolo_cercato: str | None = None,
        reparto: Annotated[str | None, Field(description="sala, cucina…")] = None,
        telefono: str | None = None,
        email: str | None = None,
        disponibilita: str | None = None,
        lingue: str | None = None,
        documenti: str | None = None,
    ) -> dict:
        """Aggiorna un candidato: cambia stato (NUOVO → DA_SENTIRE → COLLOQUIO → IN_PROVA, o
        SCARTATO), fissa il colloquio, aggiunge una nota datata, corregge i campi passati
        (quelli non passati restano com'erano). I CV sono dati personali di terzi: niente
        dati sanitari, niente numeri di documenti d'identità nei campi."""
        admin()
        campi = {k: v for k, v in dict(ruolo_cercato=ruolo_cercato, telefono=telefono, email=email,
                                        disponibilita=disponibilita, lingue=lingue,
                                        documenti=documenti).items() if v is not None}
        if reparto is not None:
            campi["reparto_id"] = reparto_id(reparto)
        if colloquio_at is not None and not stato:
            campi["colloquio_at"] = colloquio_at
        c = svc.aggiorna(id, campi) if campi else svc.leggi(id)
        if stato or nota:
            c = svc.cambia_stato(id, stato or c["stato"], colloquio_at=colloquio_at if stato else None,
                                 nota=nota)
        return c


class Smista:
    """Middleware ASGI davanti alla FastAPI: le rotte dell'OAuth e /mcp vanno al server
    MCP, tutto il resto alla FastAPI com'era. Il lifespan resta della FastAPI."""
    ESATTE = {"/mcp", "/mcp/", "/authorize", "/token", "/register", "/revoke", "/oauth/pin"}

    def __init__(self, app, mcp_app):
        self.app, self.mcp_app = app, mcp_app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and (scope["path"] in self.ESATTE
                                        or scope["path"].startswith("/.well-known/oauth-")):
            return await self.mcp_app(scope, receive, send)
        return await self.app(scope, receive, send)


def sicurezza(url: str) -> TransportSecuritySettings:
    """Protezione dal DNS rebinding: /mcp risponde solo al nome pubblico e al Mac."""
    from urllib.parse import urlparse
    u = urlparse(url)
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[u.netloc, "127.0.0.1:*", "localhost:*", "[::1]:*"],
        allowed_origins=[f"{u.scheme}://{u.netloc}", "https://claude.ai", "https://claude.com",
                         "http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"])
