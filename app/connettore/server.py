# @version: v1.0 (2026-10-08) — nascita del connettore MCP (mattone M.K)
# -*- coding: utf-8 -*-
"""
server.py — TRGB come connettore MCP di claude.ai, su /mcp. Modulo: platform (M.K).
Doc: docs/connettore_mcp.md. Modello: ~/brain/app/connettore.py.

Claude lo usa da qualsiasi chat (web, desktop, iPhone): entra con OAuth (oauth.py),
poi chiama gli strumenti qui sotto. Gli strumenti NON hanno regole proprie: chiamano
le stesse funzioni dei service che usano i router (oggi `pratiche_service`). Un errore
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
- Gli allegati si caricano dalla pagina /pratiche del gestionale, non da qui."""


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
    from app.services.pratiche_service import PraticaErrore, PraticaNonTrovata

    def deco(f):
        @functools.wraps(f)
        def avvolto(*a, **k):
            try:
                esito = f(*a, **k)
            except PraticaNonTrovata as e:
                raise ToolError(f"{e} (404)") from None
            except PraticaErrore as e:
                raise ToolError(f"{e} (400)") from None
            if isinstance(esito, list):
                esito = {"quante": len(esito), "risultati": esito}
            # una volta in JSON: date e None restano come le vede l'API
            return json.loads(json.dumps(esito, default=str))
        mcp.add_tool(avvolto, name=f.__name__, description=f.__doc__.strip(),
                     annotations=annotazioni, structured_output=False)
        return f
    return deco


def _strumenti_pratiche(mcp: MCPServer) -> None:
    from app.services import pratiche_service as svc
    strumento = functools.partial(_strumento, mcp)

    def autore() -> str:
        return f"claude ({_utente()['username']})"

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
