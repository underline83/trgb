# @version: v1.7 (2026-10-25) — ricette e ingredienti (modulo ricette): import con anteprima, cerca/leggi/aggiorna, prezzi, allergeni, unione
# v1.6 (2026-10-23) — visite_sito_riepilogo (modulo sito, sola lettura)
# v1.5 (2026-10-20) — accesso_browser: Q entra nel gestionale dal browser con un link usa-e-getta
# v1.4 (2026-10-18) — incassi (ieri e mese in corso, con le percentuali)
# v1.2 (2026-10-16) — strumenti candidati (modulo dipendenti)
# v1.1 (2026-10-16) — Q scrive firmando «Q» (la chiave di Q, vedi oauth.py)
# -*- coding: utf-8 -*-
"""
server.py — TRGB come connettore MCP di claude.ai, su /mcp. Modulo: platform (M.K).
Doc: docs/connettore_mcp.md. Modello: ~/brain/app/connettore.py.

Claude lo usa da qualsiasi chat (web, desktop, iPhone): entra con OAuth (oauth.py),
poi chiama gli strumenti qui sotto. Gli strumenti NON hanno regole proprie: chiamano
le stesse funzioni dei service che usano i router (`pratiche_service`, `candidati_service`) o,
dove la logica sta ancora nella rotta (scadenze dipendenti, scadenziario, prenotazioni), la
funzione della rotta stessa chiamata con l'utente del token. Un errore del service o della
rotta (HTTPException) arriva a Claude come errore dello strumento, con lo stesso messaggio.

Ogni strumento:
  · esiste solo se il suo modulo è attivo per il locale (module_loader);
  · rilegge l'utente del token e rifà il controllo dei ruoli (M.G), come il router;
  · scrive col nome «claude (<utente>)».
"""
import functools
import json
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field

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

ISTRUZIONI = """TRGB, il gestionale del ristorante. Da qui si gestiscono le PRATICHE, i CANDIDATI,
le SCADENZE dei dipendenti, si legge lo SCADENZIARIO dei pagamenti, si leggono e
creano le PRENOTAZIONI e si gestiscono RICETTE e INGREDIENTI della cucina (ogni gruppo
c'è solo se il suo modulo è attivo).

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
- CANDIDATI (CV ricevuti): prima di crearne uno cerca con candidati_elenco (nome/telefono/email); dati di terzi: niente dati sanitari né documenti d'identità; il CV si carica dalla pagina.
- Date sempre AAAA-MM-GG. Mai IBAN nelle risposte; niente dati sanitari (salvo le allergie dichiarate di una prenotazione).
- SCADENZE DIPENDENTI: cerca con scadenze_dipendenti_elenco prima di crearne una; prima di creare o cambiare riepiloga a Marco e aspetta il sì; non si cancellano da qui.
- SCADENZIARIO: sola lettura; uscita_segna_pagata solo dopo il sì di Marco (fornitore, importo, data, metodo); spese fisse e rate si fanno dalla pagina.
- PRENOTAZIONI: prima di crearne una controlla il giorno con prenotazioni_giorno, riepiloga a Marco (giorno, ora, coperti, nome, note, allergie) e aspetta il sì; prenotazione_crea non manda niente al cliente.
- INCASSI: incassi_riepilogo, sola lettura (ieri contro la media dello stesso giorno della settimana, mese in corso contro lo stesso periodo dell'anno prima).
- SITO: visite_sito_riepilogo, sola lettura (viste, pagine, provenienze, clic su Prenota/telefono/WhatsApp e prenotazioni dal sito nel periodo, contro il periodo prima). Nessun dato personale: sono solo conteggi.
- RICETTE: un piatto è fatto di voci: ingredienti (l'anagrafica legata ai fornitori, coi prezzi) e sotto-ricette (le preparazioni base, altre ricette). Prima di creare una ricetta cercala con ricette_cerca (guarda anche «simili»): se c'è già, la completi con ricetta_aggiorna e non la duplichi (es. un piatto del pranzo nato vuoto, vuota=true).
- Le ricette nuove si creano con ricetta_importa: SEMPRE prima conferma=false, poi riepiloga a Marco abbinamenti dubbi (da_confermare, punteggi sotto 100), placeholder che nascerebbero, voci saltate e doppioni; conferma=true solo dopo il suo sì, con gli override che ha deciso.
- ricetta_aggiorna con voci o servizi li SOSTITUISCE tutti: leggi prima con ricetta_leggi e rimanda anche quelli che restano.
- INGREDIENTI: cerca con ingredienti_cerca prima di usarne o crearne uno. I placeholder nati da un import (da_completare) si completano con ingrediente_aggiorna (categoria, unità base, allergeni, completato=true) e ingrediente_prezzo_aggiungi. Allergeni coi 14 nomi UE in minuscolo (glutine, crostacei, uova, pesce, arachidi, soia, latte, frutta a guscio, sedano, senape, sesamo, anidride solforosa e solfiti, lupini, molluschi); [] = nessuno. Un doppione si unisce con ingrediente_unisci, che cancella il doppione: solo dopo il sì di Marco.
- Prezzi, rese e quantità a porzione che stimi tu (non dati da Marco o da una fattura) li dichiari a Marco come stime. Il prezzo di un ingrediente è per la sua unità base (€/kg se è in kg).
- BROWSER: per lavorare nelle pagine del gestionale, accesso_browser dà un link (2 minuti, una volta) che si apre SUBITO nel browser: si entra come Q. Non mostrarlo e non incollarlo in chat; per un'altra sessione se ne chiede uno nuovo."""


def costruisci(url: str, nome_locale: str, versione: str, url_app: str | None = None) -> MCPServer:
    """Il server MCP. `url` è l'indirizzo pubblico del backend del locale: da lì nascono
    issuer e risorsa dell'OAuth. `url_app` è quello delle pagine (frontend), per i link
    d'accesso di Q nel browser; senza, si usa `url`."""
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

    _strumento_accesso_browser(mcp, (url_app or url).rstrip("/"))
    if module_loader.is_module_active("pratiche"):
        _strumenti_pratiche(mcp)
    if module_loader.is_module_active("dipendenti"):
        _strumenti_candidati(mcp)
        _strumenti_scadenze_dipendenti(mcp)
    if module_loader.is_module_active("controllo_gestione"):
        _strumenti_scadenziario(mcp)
    if module_loader.is_module_active("prenotazioni"):
        _strumenti_prenotazioni(mcp)
    if module_loader.is_module_active("cassa"):
        _strumenti_incassi(mcp)
    if module_loader.is_module_active("ricette"):
        _strumenti_ricette(mcp)
    if module_loader.is_module_active("sito") and module_loader.is_module_active("statistiche"):
        _strumenti_sito(mcp)
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
    from fastapi import HTTPException
    from pydantic import ValidationError
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
            except HTTPException as e:
                # strumenti che chiamano la funzione della rotta: stesso messaggio dell'API
                raise ToolError(f"{e.detail} ({e.status_code})") from None
            except ValidationError as e:
                raise ToolError(f"Dati non validi: {e.errors()[0].get('msg')} (400)") from None
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


def _ruoli(*ruoli: str, cosa: str) -> dict:
    """L'utente del token, se ha uno dei ruoli (M.G, superadmin implicito dove c'è admin);
    altrimenti 403 leggibile. Stessi ruoli del router corrispondente."""
    from app.services.permessi import ha_ruoli
    user = _utente()
    if not ha_ruoli(user, *ruoli):
        raise ToolError(f"{cosa[:1].upper()}{cosa[1:]}: riservato a {', '.join(ruoli)}. (403)")
    return user


def _oggi() -> str:
    from datetime import date
    return date.today().isoformat()


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


def _senza_vuoti(d: dict) -> dict:
    return {k: v for k, v in d.items() if v not in (None, "", [])}


# ── Dipendenti › Scadenze documenti ──────────────────────────────────────────

TipoScadenza = Literal["HACCP", "SICUREZZA_GENERALE", "SICUREZZA_SPECIFICA", "ANTINCENDIO",
                       "PRIMO_SOCCORSO", "VISITA_MEDICA", "PERMESSO_SOGGIORNO", "ALTRO"]
StatoScadenza = Literal["VALIDO", "IN_SCADENZA", "SCADUTO"]


def _strumenti_scadenze_dipendenti(mcp: MCPServer) -> None:
    """Scadenze documenti dei dipendenti (modulo dipendenti): solo admin, come
    /dipendenti/scadenze. La logica sta nelle funzioni della rotta (lista_scadenze,
    crea_scadenza, modifica_scadenza): gli strumenti le chiamano così come sono."""
    from datetime import date, timedelta
    from app.models.dipendenti_db import get_dipendenti_conn
    from app.routers import dipendenti as rotte
    strumento = functools.partial(_strumento, mcp)

    def admin() -> dict:
        return _ruoli("admin", cosa="le scadenze dei dipendenti")

    def dipendente_id(dipendente: str | None) -> int | None:
        """id, oppure nome / cognome / soprannome (tutte le parole devono esserci) → id.
        Errore leggibile se non c'è o se è ambiguo."""
        if dipendente is None or not str(dipendente).strip():
            return None
        conn = get_dipendenti_conn()
        try:
            rows = [dict(r) for r in conn.execute(
                "SELECT id, nome, cognome, nickname, attivo FROM dipendenti").fetchall()]
        finally:
            conn.close()
        testo = str(dipendente).strip()
        if testo.isdigit():
            r = next((r for r in rows if r["id"] == int(testo)), None)
            if not r:
                raise ToolError(f"Dipendente {testo} non trovato. (404)")
            return r["id"]
        parole = testo.lower().split()

        def nome(r):
            return f"{r['nome'] or ''} {r['cognome'] or ''}".strip()

        def combacia(r):
            campo = f"{nome(r)} {r.get('nickname') or ''}".lower()
            return all(p in campo for p in parole)

        attivi = [r for r in rows if r["attivo"] and combacia(r)]
        esatti = [r for r in attivi if testo.lower() in (nome(r).lower(),
                  f"{r['cognome'] or ''} {r['nome'] or ''}".strip().lower())]
        if len(esatti) == 1:
            return esatti[0]["id"]
        if len(attivi) == 1:
            return attivi[0]["id"]
        if not attivi:
            spenti = [r for r in rows if not r["attivo"] and combacia(r)]
            extra = (" Tra i non attivi: " + ", ".join(f"{nome(r)} (id {r['id']})" for r in spenti)
                     + " — le loro scadenze non si vedono.") if spenti else ""
            raise ToolError(f"Nessun dipendente attivo per «{testo}».{extra} (404)")
        elenco = ", ".join(f"{nome(r)} (id {r['id']})" for r in attivi)
        raise ToolError(f"«{testo}» è ambiguo: {elenco}. Passa l'id o nome e cognome. (400)")

    def voce(r: dict) -> dict:
        try:
            giorni = (date.fromisoformat(r["data_scadenza"]) - date.today()).days
        except (TypeError, ValueError):
            giorni = None
        return _senza_vuoti({
            "id": r["id"], "dipendente_id": r["dipendente_id"],
            "dipendente": f"{r.get('nome') or ''} {r.get('cognome') or ''}".strip(),
            "tipo": r["tipo"], "tipo_label": r.get("tipo_label"),
            "descrizione": r.get("descrizione"), "data_rilascio": r.get("data_rilascio"),
            "data_scadenza": r["data_scadenza"], "giorni_alla_scadenza": giorni,
            "stato": r.get("stato_calc"), "alert_giorni": r.get("alert_giorni"),
            "ente_rilascio": r.get("ente_rilascio"), "note": r.get("note")})

    def elenco(user: dict, did: int | None = None, tipo=None, stato=None) -> list[dict]:
        return rotte.lista_scadenze(dipendente_id=did, tipo=tipo, stato=stato,
                                    current_user=user)["scadenze"]

    def una(user: dict, id: int) -> dict:
        r = next((r for r in elenco(user) if r["id"] == id), None)
        if not r:
            raise ToolError(f"Scadenza {id} non trovata (o il dipendente non è più attivo). (404)")
        return r

    @strumento(SOLA_LETTURA)
    def scadenze_dipendenti_elenco(
        dipendente: Annotated[str | None, Field(description="id del dipendente, oppure nome e/o cognome")] = None,
        entro_giorni: Annotated[int | None, Field(ge=0, le=3650, description="Solo quelle che scadono entro N giorni da oggi (le già scadute comprese)")] = None,
        stato: Annotated[StatoScadenza | None, Field(description="VALIDO, IN_SCADENZA (dentro i giorni di avviso), SCADUTO")] = None,
        tipo: TipoScadenza | None = None,
    ) -> dict:
        """Le scadenze dei documenti dei dipendenti attivi (HACCP, corsi sicurezza,
        antincendio, primo soccorso, visite mediche, permessi di soggiorno, fine contratto o
        proroga come ALTRO), dalla più vicina. Lo stato è calcolato: SCADUTO, IN_SCADENZA
        (entro alert_giorni), VALIDO. Usalo prima di crearne una per non fare doppioni."""
        user = admin()
        voci = elenco(user, dipendente_id(dipendente), tipo, stato)
        if entro_giorni is not None:
            limite = (date.today() + timedelta(days=entro_giorni)).isoformat()
            voci = [r for r in voci if r["data_scadenza"] <= limite]
        voci = [voce(r) for r in voci]
        conta = {s: sum(1 for v in voci if v.get("stato") == s) for s in ("SCADUTO", "IN_SCADENZA", "VALIDO")}
        return {"quante": len(voci), "riepilogo": conta, "scadenze": voci}

    @strumento(SCRIVE)
    def scadenza_dipendente_crea(
        dipendente: Annotated[str, Field(min_length=1, description="id del dipendente, oppure nome e/o cognome (se è ambiguo l'errore elenca i candidati)")],
        tipo: TipoScadenza,
        data_scadenza: Giorno,
        descrizione: Annotated[str | None, Field(description="«Fine proroga contratto intermittente», «Corso HACCP base»")] = None,
        alert_giorni: Annotated[int | None, Field(ge=1, le=365, description="Giorni di preavviso. Se manca: quello del tipo (HACCP 30, sicurezza 60, permesso 90…)")] = None,
        note: str | None = None,
    ) -> dict:
        """Una scadenza nuova per un dipendente (documento, corso, visita, permesso, fine
        contratto come ALTRO). PRIMA cerca con scadenze_dipendenti_elenco se c'è già e
        riepiloga a Marco cosa scrivi (dipendente, tipo, data, preavviso): crea solo dopo il
        suo sì. Date AAAA-MM-GG. Niente dati sanitari (di una visita medica solo che
        scade), niente numeri di documenti d'identità, niente IBAN."""
        user = admin()
        did = dipendente_id(dipendente)
        r = rotte.crea_scadenza({"dipendente_id": did, "tipo": tipo, "data_scadenza": data_scadenza,
                                 "descrizione": descrizione, "alert_giorni": alert_giorni,
                                 "note": note}, current_user=user)
        return voce(una(user, r["id"]))

    @strumento(SCRIVE)
    def scadenza_dipendente_aggiorna(
        id: Id,
        tipo: TipoScadenza | None = None,
        descrizione: str | None = None,
        data_scadenza: Annotated[Giorno | None, Field(description="Nuova data (per un rinnovo: la nuova scadenza)")] = None,
        alert_giorni: Annotated[int | None, Field(ge=1, le=365)] = None,
        note: Annotated[str | None, Field(description="SOSTITUISCE le note")] = None,
        aggiungi_nota: Annotated[str | None, Field(description="Riga da AGGIUNGERE alle note, con la data di oggi")] = None,
    ) -> dict:
        """Corregge una scadenza esistente (id da scadenze_dipendenti_elenco): i campi non
        passati restano com'erano. Per un rinnovo si sposta data_scadenza. Riepiloga a Marco
        cosa cambi e aspetta il suo sì. Non si cancella da qui. Niente dati sanitari, niente
        numeri di documenti, niente IBAN."""
        user = admin()
        if note is not None and aggiungi_nota:
            raise ToolError("Passa note oppure aggiungi_nota, non tutti e due. (400)")
        attuale = una(user, id)
        campi = {k: v for k, v in dict(tipo=tipo, descrizione=descrizione, data_scadenza=data_scadenza,
                                       alert_giorni=alert_giorni, note=note).items() if v is not None}
        if aggiungi_nota:
            riga = f"[{_oggi()}] {aggiungi_nota.strip()}"
            campi["note"] = f"{attuale['note']}\n{riga}" if attuale.get("note") else riga
        if not campi:
            raise ToolError("Niente da cambiare. (400)")
        rotte.modifica_scadenza(scadenza_id=id, payload=campi, current_user=user)
        return voce(una(user, id))


# ── Controllo di gestione › Scadenziario ─────────────────────────────────────

# Come il filtro di default della pagina Scadenzario (ControlloGestioneUscite.jsx).
STATI_APERTI = ("PROGRAMMATO", "SCADUTO", "SPOSTATO", "VERIFICARE", "PARZIALE")
# Quelli che «Segna pagate» della pagina accetta (segna_pagate_bulk).
STATI_SEGNABILI = ("PROGRAMMATO", "SCADUTO", "PARZIALE", "PAGATO_MANUALE")
MetodoPagamento = Literal["CONTO_CORRENTE", "CARTA", "CONTANTI", "ASSEGNO", "BONIFICO"]


def _strumenti_scadenziario(mcp: MCPServer) -> None:
    """Scadenziario (modulo controllo_gestione): admin e contabile, come il router. Legge
    con get_uscite (la stessa funzione della pagina Scadenzario) e segna pagato con
    segna_pagate_bulk (il bottone «Segna pagate»). Niente spese fisse né piani rate."""
    from datetime import date, timedelta
    from app.routers import controllo_gestione_router as cg
    strumento = functools.partial(_strumento, mcp)

    def contabile() -> dict:
        return _ruoli("admin", "contabile", cosa="lo scadenziario")

    def uscite(user: dict, a: str, fornitore: str | None) -> list[dict]:
        return cg.get_uscite(stato=None, fornitore=fornitore, da=None, a=a, ordine="scadenza_asc",
                             includi_rateizzate=False, includi_escluse=False,
                             current_user=user)["uscite"]

    def residuo(u: dict) -> float:
        return round((u.get("totale") or 0) - (u.get("importo_pagato") or 0), 2)

    def voce(u: dict) -> dict:
        # niente IBAN: get_uscite li porta, qui non escono
        return _senza_vuoti({
            "id": u["id"], "data_scadenza": u.get("data_scadenza"),
            "titolo": u.get("sf_titolo") or u.get("fornitore_nome"),
            "fornitore": u.get("fornitore_nome"),
            "tipo": u.get("sf_tipo_label") or u.get("tipo_uscita"),
            "numero_fattura": u.get("numero_fattura"), "data_fattura": u.get("data_fattura"),
            "totale": u.get("totale"), "da_pagare": residuo(u), "stato": u.get("stato"),
            "modalita_pagamento": u.get("modalita_pagamento_label"),
            "data_pagamento": u.get("data_pagamento"),
            "metodo_pagamento": u.get("metodo_pagamento_label"),
            "periodo": u.get("periodo_riferimento"),
            "scadenza_originale": u.get("data_scadenza_originale") if u.get("stato") == "SPOSTATO" else None,
            "in_distinta": u.get("batch_titolo"), "note": u.get("note")})

    def totali(voci: list[dict]) -> dict:
        per_stato: dict = {}
        for v in voci:
            s = per_stato.setdefault(v["stato"], {"quante": 0, "importo": 0.0})
            s["quante"] += 1
            s["importo"] = round(s["importo"] + (v.get("da_pagare") or 0), 2)
        return {"quante": len(voci), "da_pagare": round(sum(v.get("da_pagare") or 0 for v in voci), 2),
                "per_stato": per_stato}

    @strumento(SOLA_LETTURA)
    def scadenziario(
        da: Annotated[Giorno | None, Field(description="Inizio periodo. Oggi se manca")] = None,
        a: Annotated[Giorno | None, Field(description="Fine periodo, compresa. Oggi + 30 giorni se manca")] = None,
        fornitore: Annotated[str | None, Field(description="Cerca nel nome del fornitore / della spesa")] = None,
        includi_pagate: Annotated[bool, Field(description="true = nel periodo anche le già pagate")] = False,
        max_voci: Annotated[int, Field(ge=1, le=500)] = 100,
    ) -> dict:
        """Lo scadenziario dei pagamenti (fatture, spese fisse, rate, stipendi, F24), come la
        pagina Scadenzario: le uscite da pagare nel periodo con i totali, più le SCADUTE
        (non pagate con scadenza passata, di qualsiasi data) e quante sono «da verificare».
        Stati: PROGRAMMATO, SCADUTO, SPOSTATO (data rinegoziata, non pagata), PARZIALE,
        VERIFICARE (forse pagata, da controllare); PAGATO = riconciliata in banca,
        PAGATO_MANUALE = segnata pagata a mano. Le rateizzate compaiono come rate.
        Sola lettura. Niente IBAN nelle risposte."""
        user = contabile()
        oggi = _oggi()
        da = da or oggi
        a = a or (date.today() + timedelta(days=30)).isoformat()
        if a < da:
            raise ToolError("Periodo non valido: «a» è prima di «da». (400)")
        tutte = uscite(user, a, fornitore)
        aperte = [u for u in tutte if u.get("stato") in STATI_APERTI]
        nel_periodo = [voce(u) for u in (tutte if includi_pagate else aperte)
                       if u.get("data_scadenza") and u["data_scadenza"] >= da]
        scadute = [voce(u) for u in aperte if u.get("stato") != "VERIFICARE"
                   and u.get("data_scadenza") and u["data_scadenza"] < oggi]
        verificare = [voce(u) for u in aperte if u.get("stato") == "VERIFICARE"]
        return {
            "oggi": oggi, "periodo": {"da": da, "a": a},
            "nel_periodo": {**totali(nel_periodo), "voci": nel_periodo[:max_voci],
                            "altre": max(0, len(nel_periodo) - max_voci)},
            "scadute": {**totali(scadute), "voci": scadute[-max_voci:],
                        "altre_piu_vecchie": max(0, len(scadute) - max_voci)},
            "da_verificare": {"quante": len(verificare),
                              "importo": round(sum(v.get("da_pagare") or 0 for v in verificare), 2)},
        }

    @strumento(SCRIVE)
    def uscita_segna_pagata(
        id: Annotated[int, Field(ge=1, description="id dell'uscita, da scadenziario")],
        data_pagamento: Annotated[Giorno | None, Field(description="Quando è stata pagata (mai futura). Oggi se manca")] = None,
        metodo: Annotated[MetodoPagamento, Field(description="CONTANTI = pagata e chiusa; gli altri = PAGATO_MANUALE, da riconciliare con la banca")] = "CONTO_CORRENTE",
    ) -> dict:
        """Segna pagata un'uscita dello scadenziario, come «Segna pagate» della pagina:
        con CONTANTI diventa PAGATO, con gli altri metodi PAGATO_MANUALE (resta da
        riconciliare con il movimento di banca). Vale per PROGRAMMATO, SCADUTO, PARZIALE (e
        per correggere data o metodo di una PAGATO_MANUALE); SPOSTATO, VERIFICARE e
        RATEIZZATO si sistemano dalla pagina. PRIMA riepiloga a Marco quale uscita (fornitore,
        importo, scadenza), data e metodo, e aspetta il suo sì."""
        user = contabile()
        quando = data_pagamento or _oggi()
        if quando > _oggi():
            raise ToolError("La data di pagamento non può essere futura. (400)")
        conn = cg.get_fc_db()
        try:
            r = conn.execute("SELECT id, fornitore_nome, totale, stato, data_scadenza FROM cg_uscite "
                             "WHERE id = ?", (id,)).fetchone()
        finally:
            conn.close()
        if not r:
            raise ToolError(f"Uscita {id} non trovata. (404)")
        if r["stato"] not in STATI_SEGNABILI:
            perche = {"PAGATO": "è già pagata e riconciliata con la banca",
                      "RATEIZZATO": "è rateizzata: si pagano le rate"}.get(
                r["stato"], "si sistema dalla pagina Scadenzario")
            raise ToolError(f"Uscita {id} ({r['fornitore_nome']}) in stato {r['stato']}: {perche}. (409)")
        esito = cg.segna_pagate_bulk(payload={"ids": [id], "metodo_pagamento": metodo,
                                              "data_pagamento": quando}, current_user=user)
        if not esito.get("ok"):
            raise ToolError(f"{esito.get('error') or 'Non segnata'} (400)")
        dopo = next((u for u in uscite(user, "9999-12-31", None) if u["id"] == id), None)
        return voce(dopo) if dopo else {"id": id, "ok": True}


# ── Prenotazioni ─────────────────────────────────────────────────────────────

Turno = Literal["pranzo", "cena"]
Ora = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="HH:MM")]
GIORNI = ("lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica")
STATI_FUORI = ("CANCELED", "NO_SHOW", "REFUSED")


def _strumenti_prenotazioni(mcp: MCPServer) -> None:
    """Prenotazioni (modulo prenotazioni): admin, sala, sommelier, contabile, come il router.
    Legge con get_planning (la pagina Planning) e crea con crea_prenotazione (il «+ Nuova»
    della pagina), che non manda niente al cliente: niente email, WhatsApp o notifiche."""
    import re
    from datetime import date, timedelta
    from app.models.clienti_db import get_clienti_conn
    from app.routers import prenotazioni_router as rotte
    strumento = functools.partial(_strumento, mcp)

    def sala() -> dict:
        return _ruoli("admin", "sala", "sommelier", "capo_sala", "contabile", cosa="le prenotazioni")

    def voce(p: dict) -> dict:
        # niente telefono/email, preferenze o restrizioni: solo le allergie dichiarate
        return _senza_vuoti({
            "id": p["id"], "data": p.get("data_pasto"), "ora": (p.get("ora_pasto") or "")[:5],
            "turno": p.get("turno"), "coperti": p.get("pax"),
            "nome": f"{p.get('nome') or ''} {p.get('cognome') or ''}".strip(),
            "stato": p.get("stato"), "tavolo": p.get("tavolo"), "fonte": p.get("fonte"),
            "canale": p.get("canale"), "occasione": p.get("occasione"),
            "note": p.get("nota_ristorante"), "richiesta_cliente": p.get("nota_cliente"),
            "allergie": p.get("allergie_segnalate"), "allergie_cliente": p.get("allergie"),
            "seggioloni": p.get("seggioloni"), "vip": p.get("vip") or None,
            "cliente_id": p.get("cliente_id"), "visite_precedenti": p.get("visite_precedenti"),
            "no_show_passati": p.get("no_show_totali") or None, "creata_da": p.get("creato_da"),
            "possibili_doppioni": [d.get("id") for d in p.get("possibili_doppioni") or []]})

    def giorno(user: dict, data: str, turno, cancellate: bool, dettaglio: bool = True) -> dict:
        pl = rotte.get_planning(data=data, user=user)
        tutte = [p for t in ("pranzo", "cena") if turno in (None, t) for p in pl[t]]
        attive = [p for p in tutte if p["stato"] not in STATI_FUORI]
        out = {"data": data, "giorno": GIORNI[date.fromisoformat(data).weekday()]}
        for t in ("pranzo", "cena"):
            if turno in (None, t):
                quelle = [p for p in attive if p.get("turno") == t]
                out[t] = {"prenotazioni": len(quelle), "coperti": sum(p.get("pax") or 0 for p in quelle),
                          "capienza": pl["contatori"].get(f"capienza_{t}")}
        if dettaglio:
            out["prenotazioni"] = [voce(p) for p in (tutte if cancellate else attive)]
        return out

    @strumento(SOLA_LETTURA)
    def prenotazioni_giorno(
        data: Giorno,
        turno: Turno | None = None,
        cancellate: Annotated[bool, Field(description="true = anche cancellate, no-show e rifiutate")] = False,
    ) -> dict:
        """Le prenotazioni di un giorno, per ora: coperti, nome, stato, tavolo, note,
        richiesta del cliente, allergie, fonte (thefork, widget, manuale), con i totali di
        pranzo e cena. Stati: RECORDED (prenotata), REQUESTED (da confermare), ARRIVED,
        SEATED (al tavolo), BILL, LEFT (andati), CANCELED, NO_SHOW, REFUSED.
        possibili_doppioni = id della stessa prenotazione segnata a mano e in TheFork."""
        return giorno(sala(), data, turno, cancellate)

    @strumento(SOLA_LETTURA)
    def prenotazioni_periodo(
        da: Giorno,
        a: Annotated[Giorno, Field(description="Compreso. Al massimo 31 giorni dopo «da»")],
        turno: Turno | None = None,
        solo_totali: Annotated[bool, Field(description="true = per ogni giorno solo prenotazioni e coperti")] = False,
        cancellate: bool = False,
    ) -> dict:
        """Le prenotazioni di più giorni (al massimo 31), giorno per giorno, con i totali di
        pranzo e cena; solo_totali=true per un colpo d'occhio sul carico della settimana.
        Stessi campi e stati di prenotazioni_giorno."""
        user = sala()
        d0, d1 = date.fromisoformat(da), date.fromisoformat(a)
        if d1 < d0:
            raise ToolError("Periodo non valido: «a» è prima di «da». (400)")
        if (d1 - d0).days > 30:
            raise ToolError("Al massimo 31 giorni per volta. (400)")
        giorni = [giorno(user, (d0 + timedelta(days=i)).isoformat(), turno, cancellate, not solo_totali)
                  for i in range((d1 - d0).days + 1)]
        tot = {t: {"prenotazioni": sum(g[t]["prenotazioni"] for g in giorni),
                   "coperti": sum(g[t]["coperti"] for g in giorni)}
               for t in ("pranzo", "cena") if turno in (None, t)}
        return {"da": da, "a": a, "totali": tot, "giorni": giorni}

    def cerca(user: dict, q: str) -> list[dict]:
        return rotte.search_clienti(q=q, user=user)["clienti"]

    def descrivi(c: dict) -> str:
        tel = re.sub(r"\D", "", c.get("telefono") or "")
        chi = " ".join(x for x in (c.get("nome"), c.get("cognome")) if x)
        return (f"id {c['id']} {chi}".rstrip()
                + (f" (tel. …{tel[-4:]})" if tel else "") + f", {c.get('visite_totali') or 0} visite")

    @strumento(SCRIVE)
    def prenotazione_crea(
        data: Giorno,
        ora: Ora,
        coperti: Annotated[int, Field(ge=1, le=50)],
        cognome: Annotated[str | None, Field(description="Del cliente. Serve se non passi cliente_id")] = None,
        nome: str | None = None,
        telefono: Annotated[str | None, Field(description="Serve a ritrovare il cliente se c'è già")] = None,
        email: str | None = None,
        cliente_id: Annotated[int | None, Field(ge=1, description="Cliente già in TRGB (dall'errore che elenca i possibili)")] = None,
        nuovo_cliente: Annotated[bool, Field(description="true = crea comunque un cliente nuovo, anche se ce n'è uno con lo stesso nome")] = False,
        note: Annotated[str | None, Field(description="Nota interna del ristorante")] = None,
        richiesta_cliente: Annotated[str | None, Field(description="Cosa ha chiesto il cliente («tavolo vicino alla finestra»)")] = None,
        allergie: Annotated[str | None, Field(description="Solo le allergie/intolleranze dichiarate dal cliente")] = None,
        occasione: Annotated[str | None, Field(description="«compleanno», «anniversario»…")] = None,
        seggioloni: str | None = None,
        canale: Annotated[str, Field(description="Come è arrivata: Telefono, WhatsApp, Email, Di persona…")] = "Telefono",
    ) -> dict:
        """Una prenotazione nuova, come il «+ Nuova» del Planning (fonte «manuale», stato
        RECORDED, creata da Q / claude). Non manda NIENTE al cliente (niente email, WhatsApp,
        notifiche): la conferma la dà Marco. Il cliente: cliente_id se lo sai; altrimenti
        lo cerco per telefono (uno solo → è lui) e per nome; se ce ne sono di possibili
        l'errore li elenca: richiama con cliente_id o con nuovo_cliente=true. PRIMA
        riepiloga a Marco giorno, ora, coperti, nome, note e allergie, e aspetta il suo sì;
        controlla anche con prenotazioni_giorno che non ci sia già. Date AAAA-MM-GG, ora
        HH:MM. Mai dati sanitari oltre alle allergie dichiarate."""
        user = sala()
        if data < _oggi():
            raise ToolError("La data è passata: le prenotazioni si creano da oggi in avanti. (400)")
        trovato = None
        if cliente_id:
            conn = get_clienti_conn()
            try:
                c = conn.execute("SELECT id FROM clienti WHERE id = ?", (cliente_id,)).fetchone()
            finally:
                conn.close()
            if not c:
                raise ToolError(f"Cliente {cliente_id} non trovato. (404)")
            trovato = cliente_id
        elif not nuovo_cliente:
            cifre = re.sub(r"\D", "", telefono or "")[-9:]
            per_tel = cerca(user, cifre) if len(cifre) >= 6 else []
            if len(per_tel) == 1:
                trovato = per_tel[0]["id"]
            else:
                possibili = per_tel or (cerca(user, f"{cognome} {nome or ''}".strip()) if cognome else [])
                if possibili:
                    raise ToolError(
                        "Ci sono clienti che potrebbero essere lui: "
                        + "; ".join(descrivi(c) for c in possibili[:8])
                        + ". Richiama con cliente_id, oppure nuovo_cliente=true. (409)")
        if not trovato and not (cognome or "").strip():
            raise ToolError("Serve il cognome del cliente (o cliente_id). (400)")
        req = rotte.PrenotazioneCreate(
            cliente_id=trovato, data_pasto=data, ora_pasto=ora, pax=coperti, canale=canale,
            nota_ristorante=note, nota_cliente=richiesta_cliente, occasione=occasione,
            allergie_segnalate=allergie, seggioloni=seggioloni,
            nuovo_nome=None if trovato else nome, nuovo_cognome=None if trovato else cognome.strip(),
            nuovo_telefono=None if trovato else telefono, nuovo_email=None if trovato else email)
        r = rotte.crea_prenotazione(req=req, user={**user, "username": _autore()})
        pl = rotte.get_planning(data=data, user=user)
        p = next((p for t in ("pranzo", "cena") for p in pl[t] if p["id"] == r["id"]), None)
        out = voce(p) if p else {"id": r["id"]}
        out["cliente"] = "esistente" if trovato else "nuovo"
        return out


# ── Ricette (modulo ricette) ─────────────────────────────────────────────────

LETTURA_RICETTE = ("admin", "chef", "sous_chef", "commis", "sala", "sommelier", "capo_sala", "contabile")
CUCINA = ("admin", "chef", "sous_chef", "commis")
DISTRUGGE = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False)


class NuovoIngrediente(BaseModel):
    """Override di un ingrediente dell'import: crealo nuovo (placeholder «da completare»)."""
    unita: Optional[str] = Field(None, description="Unità base (g, kg, ml, L, pz…). Se manca, quella proposta dall'anteprima")
    categoria: Optional[str] = Field(None, description="Categoria ingrediente (per nome)")


class VoceRicetta(BaseModel):
    """Una voce della composizione: UN ingrediente OPPURE UNA sotto-ricetta."""
    ingrediente_id: Optional[int] = Field(None, ge=1)
    sotto_ricetta_id: Optional[int] = Field(None, ge=1)
    quantita: float = Field(0, ge=0, description="Nell'unità della voce. 0 solo per 'qb'")
    unita: str = Field(..., min_length=1, description="g, kg, ml, L, pz… oppure 'qb' (quanto basta, fuori dal food cost)")
    note: Optional[str] = None


def _strumenti_ricette(mcp: MCPServer) -> None:
    """Ricette e ingredienti (modulo ricette). Ruoli come i router: leggere le ricette
    LETTURA_RICETTE (foodcost_recipes_router); scrivere ricette e tutto sugli ingredienti
    (prezzi compresi) CUCINA (foodcost_ingredients_router). Chiama le funzioni delle rotte
    della pagina: import (analizza/conferma, come /ricette/import), PUT ricetta (come
    /ricette/modifica), PUT ingrediente, «+ Aggiungi prezzo», unione. Le scelte di default
    dell'import sono quelle della pagina RicetteImport.jsx."""
    from app.routers import foodcost_recipes_router as rotte
    from app.routers import foodcost_ingredients_router as ing_rotte
    from app.services.allergeni_service import format_allergeni_csv, parse_allergeni_csv
    strumento = functools.partial(_strumento, mcp)

    def lettura() -> dict:
        return _ruoli(*LETTURA_RICETTE, cosa="le ricette")

    def cucina() -> dict:
        return _ruoli(*CUCINA, cosa="modificare ricette e ingredienti")

    def chiave(s: str) -> str:
        return (s or "").strip().casefold()

    def per_nome(cosa: str, nome: str, voci: list, attr: str = "name"):
        """La voce col nome dato: uguale, se no l'unica che lo contiene; altrimenti 400
        con l'elenco."""
        k = chiave(nome)
        uguali = [v for v in voci if chiave(getattr(v, attr)) == k]
        if len(uguali) == 1:
            return uguali[0]
        simili = uguali or [v for v in voci if k and k in chiave(getattr(v, attr))]
        if len(simili) == 1:
            return simili[0]
        nomi = ", ".join(getattr(v, attr) for v in (simili or voci))
        raise ToolError(f"{cosa} «{nome}»: " + (f"più d'uno, quale fra {nomi}?" if simili
                        else f"nessuno con questo nome. Ci sono: {nomi}.") + " (400)")

    def servizi_ids(nomi: list[str]) -> list[int]:
        tutti = rotte.list_service_types(include_inactive=False)
        return [per_nome("Servizio", n, tutti).id for n in nomi]

    def allergeni(csv) -> list[str]:
        return sorted(parse_allergeni_csv(csv))

    def scheda(r) -> dict:
        """RecipeOut con le chiavi di ricetta_aggiorna (le voci si possono rimandare così)."""
        return _senza_vuoti({
            "id": r.id, "nome": r.name, "tipo": "base" if (r.kind == "base" or r.is_base) else "piatto",
            "categoria": r.category_name, "resa_quantita": r.yield_qty, "resa_unita": r.yield_unit,
            "prezzo_vendita": r.selling_price, "tempo_preparazione_min": r.prep_time,
            "procedimento": r.procedimento, "note": r.note,
            "nome_menu": r.menu_name, "descrizione_menu": r.menu_description,
            "servizi": [s.name for s in r.service_types],
            "allergeni": allergeni(r.allergeni_calcolati),
            "costo_totale": r.total_cost, "costo_per_unita_resa": r.cost_per_unit,
            "food_cost_pct": r.food_cost_pct, "attiva": r.is_active, "aggiornata": r.updated_at,
            # mig 212: se il food cost usa il valore del pranzo e non il prezzo della ricetta
            "food_cost_su": f"valore pranzo {r.prezzo_riferimento:g} €" if r.prezzo_fonte == "pranzo" else None,
            "food_cost_pct_pranzo": r.food_cost_pct_pranzo,
            "voci": [_senza_vuoti({
                "ingrediente_id": i.ingredient_id, "ingrediente": i.ingredient_name,
                "sotto_ricetta_id": i.sub_recipe_id, "sotto_ricetta": i.sub_recipe_name,
                "quantita": i.qty, "unita": i.unit, "note": i.note,
                "costo_unitario": i.unit_cost, "costo_riga": i.line_cost,
                "senza_costo": i.line_cost is None and i.unit != "qb" or None,
            }) for i in r.items],
        })

    def riga(r, nomi_servizi: dict) -> dict:
        return _senza_vuoti({
            "id": r.id, "nome": r.name, "tipo": "base" if r.kind == "base" else "piatto",
            "categoria": r.category_name, "resa": f"{r.yield_qty:g} {r.yield_unit}",
            "prezzo_vendita": r.selling_price, "costo_totale": r.total_cost,
            "costo_per_unita_resa": r.cost_per_unit, "food_cost_pct": r.food_cost_pct,
            "food_cost_su": f"valore pranzo {r.prezzo_riferimento:g} €" if r.prezzo_fonte == "pranzo" else None,
            "servizi": [nomi_servizi.get(i, i) for i in r.service_type_ids],
            "voci": r.n_voci, "vuota": r.n_voci == 0 or None,
            "nome_menu": r.menu_name, "allergeni": allergeni(r.allergeni_calcolati),
        })

    # ── ricette ──────────────────────────────────────────────────────────────

    @strumento(SOLA_LETTURA)
    def ricette_cerca(
        q: Annotated[Optional[str], Field(description="Cerca nel nome e nel nome di menu")] = None,
        tipo: Optional[Literal["piatto", "base"]] = None,
        servizio: Annotated[Optional[str], Field(description="Per nome: alla carta, pranzo di lavoro, banchetto…")] = None,
        solo_vuote: Annotated[bool, Field(description="true = solo le ricette senza composizione")] = False,
        limite: Annotated[int, Field(ge=1, le=300)] = 50,
    ) -> dict:
        """Le ricette attive: id, nome, tipo (piatto/base), categoria, resa, prezzo, costo e
        food cost %, servizi, numero di voci (vuota = composizione da riempire), allergeni
        calcolati. Usalo SEMPRE prima di creare una ricetta. Se q non trova niente, in
        «simili» ci sono i nomi che gli somigliano (possibili doppioni scritti diversi)."""
        lettura()
        tutti = rotte.list_service_types(include_inactive=True)
        nomi_servizi = {s.id: s.name for s in tutti}
        st = per_nome("Servizio", servizio, tutti).id if servizio else None
        kind = {"piatto": "dish", "base": "base"}.get(tipo)
        righe = rotte.list_ricette(kind=kind, service_type_id=st, search=(q or "").strip() or None)
        if solo_vuote:
            righe = [r for r in righe if r.n_voci == 0]
        out = {"quante": len(righe), "ricette": [riga(r, nomi_servizi) for r in righe[:limite]]}
        if len(righe) > limite:
            out["mostrate"] = limite
        if not righe and q:
            vicini = sorted(((rotte._imp_score(q, r.name), r) for r in rotte.list_ricette(kind=kind)),
                            key=lambda x: -x[0])
            out["simili"] = [{**riga(r, nomi_servizi), "somiglianza": s} for s, r in vicini[:8] if s >= 60]
        return out

    @strumento(SOLA_LETTURA)
    def ricetta_leggi(id: Id) -> dict:
        """La scheda completa di una ricetta: dati, procedimento, note, nome e descrizione di
        menu, servizi, allergeni calcolati (anche dalle sotto-ricette), costi, e le voci con
        id, quantità, unità, note e costo di riga (senza_costo = ingrediente senza prezzo o
        unità non convertibile). Le voci sono nel formato di ricetta_aggiorna."""
        lettura()
        return scheda(rotte.get_ricetta(id))

    @strumento(SCRIVE)
    def ricetta_aggiorna(
        id: Id,
        nome: Optional[str] = None,
        categoria: Annotated[Optional[str], Field(description="Per nome (ANTIPASTO, PRIMO, BASE…)")] = None,
        tipo: Optional[Literal["piatto", "base"]] = None,
        resa_quantita: Annotated[Optional[float], Field(gt=0)] = None,
        resa_unita: Annotated[Optional[str], Field(description="porzioni, kg, L…")] = None,
        prezzo_vendita: Annotated[Optional[float], Field(ge=0, description="Euro, solo per i piatti")] = None,
        tempo_preparazione_min: Annotated[Optional[int], Field(ge=0)] = None,
        procedimento: Annotated[Optional[list[str] | str], Field(description="Lista di passaggi, uno per elemento")] = None,
        note: Optional[str] = None,
        nome_menu: Optional[str] = None,
        descrizione_menu: Optional[str] = None,
        servizi: Annotated[Optional[list[str]], Field(description="Per nome; SOSTITUISCE i servizi ([] = nessuno)")] = None,
        voci: Annotated[Optional[list[VoceRicetta]], Field(description="SOSTITUISCE tutta la composizione")] = None,
    ) -> dict:
        """Completa o corregge una ricetta che esiste già (es. un piatto del pranzo creato
        vuoto: si riempie, non si duplica). Cambia solo i campi passati. ATTENZIONE: voci e
        servizi SOSTITUISCONO quelli che ci sono: leggi prima con ricetta_leggi e rimanda
        anche quelli che restano. Ingredienti e sotto-ricette per id (ingredienti_cerca,
        ricette_cerca). Gli allergeni si ricalcolano da soli, anche nei piatti che la usano.
        Ritorna la scheda aggiornata."""
        cucina()
        campi = {}
        if nome is not None:
            campi["name"] = nome.strip()
        if categoria is not None:
            campi["category_id"] = per_nome("Categoria", categoria, rotte.list_recipe_categories()).id
        if tipo is not None:
            campi["kind"] = "base" if tipo == "base" else "dish"
        for k, v in (("yield_qty", resa_quantita), ("yield_unit", resa_unita), ("selling_price", prezzo_vendita),
                     ("prep_time", tempo_preparazione_min), ("note", note), ("menu_name", nome_menu),
                     ("menu_description", descrizione_menu)):
            if v is not None:
                campi[k] = v
        if procedimento is not None:
            campi["procedimento"] = rotte._proc_to_text(procedimento) or ""
        if servizi is not None:
            campi["service_type_ids"] = servizi_ids(servizi)
        if voci is not None:
            items = []
            for n, v in enumerate(voci, 1):
                if bool(v.ingrediente_id) == bool(v.sotto_ricetta_id):
                    raise ToolError(f"Voce {n}: serve ingrediente_id OPPURE sotto_ricetta_id. (400)")
                if v.sotto_ricetta_id == id:
                    raise ToolError(f"Voce {n}: una ricetta non può contenere sé stessa. (400)")
                try:
                    if v.ingrediente_id:
                        ing_rotte.get_ingredient(v.ingrediente_id)
                    else:
                        rotte.get_ricetta(v.sotto_ricetta_id)
                except Exception:
                    raise ToolError(f"Voce {n}: {'ingrediente' if v.ingrediente_id else 'sotto-ricetta'} "
                                    f"{v.ingrediente_id or v.sotto_ricetta_id} non trovato. (404)") from None
                try:
                    items.append(rotte.RecipeItemIn(ingredient_id=v.ingrediente_id, sub_recipe_id=v.sotto_ricetta_id,
                                                    qty=v.quantita, unit=v.unita, note=v.note))
                except ValueError as e:
                    raise ToolError(f"Voce {n}: {e.errors()[0].get('msg') if hasattr(e, 'errors') else e}. (400)") from None
            campi["items"] = items
        if not campi:
            raise ToolError("Niente da cambiare: passa almeno un campo. (400)")
        return scheda(rotte.update_ricetta(id, rotte.RecipeUpdate(**campi)))

    @strumento(SCRIVE)
    def ricetta_importa(
        ricette: Annotated[list[rotte.ImportRicetta], Field(min_length=1)],
        conferma: Annotated[bool, Field(description="false = SOLO anteprima, non scrive niente; true = importa")] = False,
        ingredienti: Annotated[Optional[dict[str, int | Literal["nuovo"] | NuovoIngrediente]], Field(
            description="Override degli abbinamenti, per nome come nelle voci: un id = usa quell'ingrediente; "
                        "\"nuovo\" o {unita, categoria} = crea un placeholder da completare")] = None,
        sotto_ricette: Annotated[Optional[dict[str, int | Literal["nel_file", "salta"]]], Field(
            description="Override delle sotto-ricette, per nome: un id = usa quella ricetta; \"nel_file\" = "
                        "è una ricetta di questo stesso import; \"salta\" = voce non importata")] = None,
        forza_doppioni: Annotated[bool, Field(description="true = importa anche le ricette che esistono già col "
                                                          "nome uguale (crea un doppione). Solo se Marco lo dice")] = False,
    ) -> dict:
        """Crea ricette nuove con l'import della pagina /ricette/import. Ogni ricetta: nome,
        categoria (ANTIPASTO, PRIMO, SECONDO, CONTORNO, DOLCE, BASE, SALSA, IMPASTO), tipo
        («piatto» o «base»), resa_quantita + resa_unita (porzioni, kg, L: niente «circa»),
        prezzo_vendita, tempo_preparazione_min, procedimento (LISTA di passi), note, voci.
        Ogni voce è UN ingrediente («ingrediente») OPPURE UNA sotto-ricetta («sotto_ricetta»),
        per NOME, con quantita e unita; per sale, pepe, olio a piacere unita «qb» senza
        quantità (fuori dal food cost). Una sotto-ricetta può essere un'altra ricetta dello
        stesso import.
        SEMPRE prima conferma=false: torna, senza scrivere niente, per ogni ricetta gli avvisi
        (doppione, categoria sconosciuta, voci incomplete), per ogni ingrediente lo stato
        (trovato / da_confermare / nuovo), i candidati col punteggio 0-100 e la decisione che
        verrebbe presa, e lo stesso per le sotto-ricette. Default come la pagina: trovato →
        quello; da_confermare → il primo candidato; nuovo → placeholder da completare;
        sotto-ricetta non trovata → il primo candidato, se no saltata. Riepiloga a Marco i
        dubbi e, dopo il suo sì, rimanda tutto con conferma=true e gli override. Nome e
        descrizione di menu e servizi non sono nell'import: dopo, con ricetta_aggiorna."""
        cucina()
        an = rotte.import_analizza_ricette(rotte.ImportPayload(ricette=ricette))
        ing_over = {chiave(k): v for k, v in (ingredienti or {}).items()}
        sub_over = {chiave(k): v for k, v in (sotto_ricette or {}).items()}
        ignoti = ([k for k in ing_over if k not in {chiave(i["nome"]) for i in an["ingredienti"]}]
                  + [k for k in sub_over if k not in {chiave(s["nome"]) for s in an["sotto_ricette"]}])
        if ignoti:
            raise ToolError(f"Override per nomi che non sono fra le voci: {', '.join(ignoti)}. "
                            "Scrivili come nelle voci. (400)")

        dec_ing, vista_ing = [], []
        for i in an["ingredienti"]:
            o = ing_over.get(chiave(i["nome"]))
            if isinstance(o, int):
                try:
                    d = ing_rotte.get_ingredient(o)
                except Exception:
                    raise ToolError(f"«{i['nome']}»: ingrediente {o} non trovato. (404)") from None
                dec = {"azione": "usa", "ingredient_id": d.id}
                cosa = f"usa {d.name} (id {d.id}, {d.default_unit})"
            elif o is not None:
                n = o if isinstance(o, NuovoIngrediente) else NuovoIngrediente()
                dec = {"azione": "placeholder", "unita": n.unita or i["unita_suggerita"] or "kg",
                       "categoria": n.categoria}
                cosa = f"nuovo placeholder in {dec['unita']}"
            elif i["stato"] == "trovato":
                dec = {"azione": "usa", "ingredient_id": i["ingredient_id"]}
                cosa = f"usa {i['ingredient_nome']} (id {i['ingredient_id']})"
            elif i["stato"] == "da_confermare" and i["candidati"]:
                c = i["candidati"][0]
                dec = {"azione": "usa", "ingredient_id": c["id"]}
                cosa = f"usa {c['nome']} (id {c['id']}, {c['score']:g}%)"
            else:
                dec = {"azione": "placeholder", "unita": i["unita_suggerita"] or "kg", "categoria": None}
                cosa = f"nuovo placeholder in {dec['unita']}"
            dec_ing.append(rotte.ImportRisolIngrediente(nome=i["nome"], **dec))
            cc = i["candidati"]
            pari = o is None and i["stato"] == "da_confermare" and len(cc) > 1 and cc[1]["score"] == cc[0]["score"]
            vista_ing.append(_senza_vuoti({
                "nome": i["nome"], "stato": i["stato"], "decisione": cosa,
                "pari_merito": pari or None,
                "override": o is not None or None, "occorrenze": i["occorrenze"],
                "candidati": [f"{c['nome']} (id {c['id']}, {c['score']:g}%)" for c in i["candidati"]]}))

        dec_sub, vista_sub = [], []
        for s in an["sotto_ricette"]:
            o = sub_over.get(chiave(s["nome"]))
            if isinstance(o, int):
                r = rotte.get_ricetta(o)
                dec, cosa = {"azione": "usa", "recipe_id": r.id}, f"usa {r.name} (id {r.id})"
            elif o in ("nel_file", "salta"):
                dec, cosa = {"azione": o}, {"nel_file": "ricetta di questo import", "salta": "voce saltata"}[o]
            elif s["stato"] == "trovata":
                dec, cosa = {"azione": "usa", "recipe_id": s["recipe_id"]}, f"usa la ricetta id {s['recipe_id']}"
            elif s["stato"] == "nel_file":
                dec, cosa = {"azione": "nel_file"}, "ricetta di questo import"
            elif s["candidati"]:
                c = s["candidati"][0]
                dec, cosa = {"azione": "usa", "recipe_id": c["id"]}, f"usa {c['nome']} (id {c['id']}, {c['score']:g}%)"
            else:
                dec, cosa = {"azione": "salta"}, "voce saltata: nessuna ricetta con questo nome"
            dec_sub.append(rotte.ImportRisolSottoRicetta(nome=s["nome"], **dec))
            vista_sub.append(_senza_vuoti({
                "nome": s["nome"], "stato": s["stato"], "decisione": cosa,
                "override": o is not None or None, "occorrenze": s["occorrenze"],
                "candidati": [f"{c['nome']} (id {c['id']}, {c['score']:g}%)" for c in s["candidati"]]}))

        doppioni = [r["nome"] for r in an["ricette"] if r["nome_esistente"]]
        if not conferma:
            return {
                "anteprima": True, "scritto": "niente",
                "ricette": [_senza_vuoti({"nome": r["nome"], "tipo": r["tipo"], "voci": r["n_voci"],
                                          "doppione": r["nome_esistente"] or None, "avvisi": r["errori"]})
                            for r in an["ricette"]],
                "ingredienti": vista_ing, "sotto_ricette": vista_sub,
                "placeholder_da_creare": sum(1 for d in dec_ing if d.azione == "placeholder"),
                "voci_saltate": sum(s["occorrenze"] for s, d in zip(an["sotto_ricette"], dec_sub) if d.azione == "salta"),
                "doppioni": doppioni,
            }
        if doppioni and not forza_doppioni:
            raise ToolError(f"Esistono già: {', '.join(doppioni)}. Completa quelle con ricetta_aggiorna, "
                            "toglile dall'import, o (solo se Marco lo vuole) forza_doppioni=true. (409)")
        esito = rotte.import_conferma_ricette(rotte.ImportConfermaPayload(
            ricette=ricette, ingredienti=dec_ing, sotto_ricette=dec_sub))
        # gli id delle ricette appena create (la più recente col nome uguale)
        create = []
        for r in ricette:
            k = chiave(r.nome)
            ids = [x.id for x in rotte.list_ricette(search=r.nome.strip()) if chiave(x.name) == k] if k else []
            if ids:
                create.append({"nome": r.nome.strip(), "id": max(ids)})
        return {**esito, "ricette": create}

    # ── ingredienti ──────────────────────────────────────────────────────────

    def scheda_ing(d, lista=None) -> dict:
        return _senza_vuoti({
            "id": d.id, "nome": d.name, "categoria": d.category_name, "unita_base": d.default_unit,
            "prezzo_corrente": getattr(lista, "last_price", None),
            "ultimo_fornitore": getattr(lista, "last_supplier_name", None),
            "allergeni": allergeni(d.allergeni), "note": d.note,
            "attivo": bool(d.is_active), "da_completare": bool(d.placeholder) or None,
            "conversione_da_verificare": getattr(lista, "conversione_da_verificare", None) or None,
        })

    @strumento(SOLA_LETTURA)
    def ingredienti_cerca(
        q: Annotated[Optional[str], Field(description="Parole del nome (tutte devono esserci)")] = None,
        disattivati: Annotated[bool, Field(description="true = cerca fra i disattivati")] = False,
        da_completare: Annotated[bool, Field(description="true = solo i placeholder da completare")] = False,
        limite: Annotated[int, Field(ge=1, le=100)] = 30,
    ) -> dict:
        """Gli ingredienti dell'anagrafica: id, nome, categoria, unità base, prezzo corrente
        (€ per unità base: mediana degli ultimi prezzi, come il food cost), ultimo fornitore,
        allergeni dichiarati, attivo, da_completare (placeholder nato da un import). Se le
        parole non trovano niente, in «simili» i nomi che gli somigliano."""
        _ruoli(*CUCINA, cosa="ingredienti e prezzi")
        tutti = ing_rotte.list_ingredients(inattivi=1 if disattivati else 0)
        parole = (q or "").casefold().split()
        trovati = [i for i in tutti if all(p in i.name.casefold() for p in parole)]
        if da_completare:
            trovati = [i for i in trovati if i.placeholder]
        out = {"quanti": len(trovati),
               "ingredienti": [scheda_ing(ing_rotte.get_ingredient(i.id), i) for i in trovati[:limite]]}
        if len(trovati) > limite:
            out["mostrati"] = limite
        if not trovati and q:
            vicini = sorted(((rotte._imp_score(q, i.name), i) for i in tutti), key=lambda x: -x[0])
            out["simili"] = [{**scheda_ing(ing_rotte.get_ingredient(i.id), i), "somiglianza": s}
                             for s, i in vicini[:8] if s >= 60]
        return out

    @strumento(SCRIVE)
    def ingrediente_prezzo_aggiungi(
        id: Id,
        fornitore: Annotated[str, Field(min_length=2, description="Nome (anche parziale, es. «Sogegross») o partita IVA")],
        prezzo_per_unita_base: Annotated[float, Field(gt=0, description="Euro per UNA unità base dell'ingrediente (€/kg se è in kg)")],
        data: Annotated[Optional[Giorno], Field(description="Data del prezzo. Oggi se manca")] = None,
        note: Optional[str] = None,
    ) -> dict:
        """Come «+ Aggiungi prezzo» nella scheda ingrediente: un prezzo nuovo, che entra nel
        food cost. Il fornitore si cerca nell'anagrafica fornitori (quella delle fatture): se
        non c'è o è ambiguo non scrive e ti dice i candidati; qui non si creano fornitori."""
        cucina()
        ing = ing_rotte.get_ingredient(id)
        sup = None
        f = fornitore.strip()
        fornitori = ing_rotte.list_suppliers()
        if f.replace(" ", "").isdigit():
            sup = next((s for s in fornitori if (s.partita_iva or "").replace(" ", "") == f.replace(" ", "")), None)
        if not sup:
            k = chiave(f)
            uguali = [s for s in fornitori if chiave(s.name) == k]
            parole = k.split()
            contengono = uguali or [s for s in fornitori if all(p in chiave(s.name) for p in parole)]
            if len(contengono) == 1:
                sup = contengono[0]
            elif contengono:
                raise ToolError("Fornitore ambiguo: " + "; ".join(
                    f"{s.name}{f' (P.IVA {s.partita_iva})' if s.partita_iva else ''}" for s in contengono[:10])
                    + ". Richiama con il nome intero o la partita IVA. (409)")
            else:
                vicini = sorted(fornitori, key=lambda s: -rotte._imp_score(f, s.name))[:5]
                raise ToolError(f"Fornitore «{f}» non trovato. Simili: {', '.join(s.name for s in vicini)}. "
                                "I fornitori nascono dalle fatture: se è nuovo si aggiunge dalla pagina. (404)")
        p = ing_rotte.create_ingredient_price(id, ing_rotte.PriceCreate(
            supplier_id=sup.id, unit_price=prezzo_per_unita_base, price_date=data, note=note))
        return {"ingrediente": ing.name, "id_prezzo": p.id, "fornitore": p.supplier_name,
                "prezzo": p.unit_price, "per": f"€/{ing.default_unit}", "data": p.price_date,
                "note": p.note}

    @strumento(SCRIVE)
    def ingrediente_aggiorna(
        id: Id,
        nome: Optional[str] = None,
        categoria: Annotated[Optional[str], Field(description="Per nome, fra quelle che esistono")] = None,
        unita_base: Annotated[Optional[str], Field(description="Fra le unità del gestionale (kg, g, L, ml, pz…)")] = None,
        allergeni: Annotated[Optional[list[str]], Field(
            description="SOSTITUISCE gli allergeni; [] = nessuno. I 14 nomi UE in minuscolo")] = None,
        note: Optional[str] = None,
        completato: Annotated[Optional[bool], Field(description="true = non è più un placeholder da completare")] = None,
    ) -> dict:
        """L'anagrafica di un ingrediente: nome, categoria, unità base, ALLERGENI, note, e
        togliere il segno «da completare» ai placeholder nati da un import. Se cambiano gli
        allergeni si ricalcolano da soli in tutte le ricette che lo usano (e nei piatti che
        usano quelle basi). L'unità base non si cambia se l'ingrediente ha già dei prezzi
        (sono per unità base): quello si fa dalla pagina."""
        cucina()
        prima = ing_rotte.get_ingredient(id)
        campi = {}
        if nome is not None:
            campi["name"] = nome.strip()
        if categoria is not None:
            campi["category_id"] = per_nome("Categoria", categoria, ing_rotte.list_categories()).id
        if unita_base is not None:
            u = next((x for x in ing_rotte.list_default_units() if chiave(x) == chiave(unita_base)), None)
            if not u:
                raise ToolError(f"Unità «{unita_base}» non prevista: {', '.join(ing_rotte.list_default_units())}. (400)")
            if u != prima.default_unit and ing_rotte.list_ingredient_prices(id):
                raise ToolError(f"{prima.name} ha già dei prezzi in €/{prima.default_unit}: cambiando l'unità "
                                "diventerebbero sbagliati. Si fa dalla pagina dell'ingrediente. (409)")
            campi["default_unit"] = u
        if allergeni is not None:
            campi["allergeni"] = format_allergeni_csv({a.strip().lower() for a in allergeni if a.strip()})
        if note is not None:
            campi["note"] = note
        if completato is not None:
            campi["placeholder"] = 0 if completato else 1
        if not campi:
            raise ToolError("Niente da cambiare: passa almeno un campo. (400)")
        d = ing_rotte.update_ingredient(id, ing_rotte.IngredientUpdate(**campi))
        out = scheda_ing(d)
        if allergeni is not None:
            out["ricette_che_lo_usano"] = len(rotte.ricette_per_ingrediente(id))
        return out

    @strumento(DISTRUGGE)
    def ingrediente_unisci(
        da_id: Annotated[Id, Field(description="L'ingrediente doppione (di solito un placeholder): viene CANCELLATO")],
        in_id: Annotated[Id, Field(description="L'ingrediente vero, che resta")],
    ) -> dict:
        """Unisce un doppione in un ingrediente vero, come «Unisci» nella pagina: voci delle
        ricette, prezzi, collegamenti alle fatture e conversioni passano a in_id, poi da_id
        viene CANCELLATO (non si torna indietro). Gli allergeni delle ricette si ricalcolano.
        Prima riepiloga a Marco i due ingredienti e aspetta il suo sì."""
        cucina()
        da, a = ing_rotte.get_ingredient(da_id), ing_rotte.get_ingredient(in_id)
        r = ing_rotte.merge_ingredient(da_id, ing_rotte.IngredientMergeRequest(target_id=in_id))
        return {"cancellato": f"{da.name} (id {da.id})", "unito_in": f"{a.name} (id {a.id})",
                "voci_spostate": r.get("voci_spostate")}


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


def _strumento_accesso_browser(mcp: MCPServer, url_app: str) -> None:
    """Platform. Q nel browser (decisione di Marco del 2026-10-20): un link alla pagina
    /accesso-q valido due minuti e una volta sola, che apre una sessione dell'identità «Q»
    (superadmin, senza PIN di sezione). Lo chiede solo un superadmin: Q stesso o Marco.
    Il segreto sta nel frammento (#), che il browser non manda al server: non finisce
    nei log di nginx."""
    from app.services.permessi import ha_ruoli

    @_strumento(mcp, SCRIVE)
    def accesso_browser() -> dict:
        """Link d'accesso al gestionale nel browser, come Q (superadmin): vale DUE MINUTI e
        UNA VOLTA SOLA. Aprilo subito nel browser (navigate): la pagina entra da sola e va
        alla Home. Non mostrarlo e non incollarlo in chat. Se scade o è già stato usato,
        chiedine un altro. Solo superadmin."""
        user = _utente()
        if not ha_ruoli(user, "superadmin"):
            raise ToolError("Solo un superadmin può aprire il gestionale come Q. (403)")
        segreto = oauth.crea_accesso_q(user["username"])
        return {"url": f"{url_app}/accesso-q#{segreto}",
                "vale_secondi": oauth.DURATA_LINK_Q,
                "entri_come": "Q (superadmin)"}


def _strumenti_incassi(mcp: MCPServer) -> None:
    """Incassi (modulo cassa): admin e contabile. Ieri con la stessa funzione della Home
    (dashboard_router._incasso_ieri: delta % contro la media dello stesso giorno della settimana
    nelle ultime 8 settimane); il mese con vendite_aggregator.totali_periodo (le KPI «Vendite
    mese»), dal 1° a ieri compreso, contro gli stessi giorni dell'anno prima. Decisione di Marco
    del 2026-10-18."""
    from datetime import date, timedelta
    from app.routers import dashboard_router as dash
    from app.services.vendite_aggregator import get_vendite_db, totali_periodo
    strumento = functools.partial(_strumento, mcp)

    def un_anno_prima(d: date) -> date:
        try:
            return d.replace(year=d.year - 1)
        except ValueError:                           # 29 febbraio
            return d.replace(year=d.year - 1, day=28)

    def pct(ora: float, prima: float):
        return round((ora - prima) / prima * 100, 1) if prima else None

    @strumento(SOLA_LETTURA)
    def incassi_riepilogo(
        giorno: Annotated[Giorno | None, Field(description="Il giorno «oggi» da cui contare. Oggi se manca")] = None,
    ) -> dict:
        """Gli incassi in breve: IERI (totale, coperti, variazione % contro la media dello
        stesso giorno della settimana nelle ultime 8 settimane, come la Home di TRGB) e il MESE
        IN CORSO dal 1° a ieri (totale, giorni di apertura, variazione % contro gli stessi giorni
        dell'anno prima). Totale = corrispettivi + fatture emesse."""
        _ruoli("admin", "contabile", cosa="gli incassi")
        oggi = date.fromisoformat(giorno) if giorno else date.today()
        ieri = oggi - timedelta(days=1)
        i = dash._incasso_ieri(ieri.isoformat(), int(ieri.strftime("%w")))
        primo = oggi.replace(day=1)
        out = {"ieri": {"data": ieri.isoformat(), "totale": i.totale, "coperti": i.coperti,
                        "variazione_pct": i.delta_pct, "confronto": "media stesso giorno della settimana, ultime 8 settimane"}}
        if primo < oggi:
            conn = get_vendite_db()
            try:
                ora = totali_periodo(conn, primo.isoformat(), oggi.isoformat())
                prima = totali_periodo(conn, un_anno_prima(primo).isoformat(), un_anno_prima(oggi).isoformat())
            finally:
                conn.close()
            t_ora, t_prima = float(ora.get("totale_incassi") or 0), float(prima.get("totale_incassi") or 0)
            out["mese"] = {"da": primo.isoformat(), "a": ieri.isoformat(), "totale": round(t_ora, 2),
                           "giorni_apertura": ora.get("giorni_apertura"),
                           "anno_prima": {"da": un_anno_prima(primo).isoformat(), "a": un_anno_prima(ieri).isoformat(),
                                          "totale": round(t_prima, 2)},
                           "variazione_pct": pct(t_ora, t_prima)}
        else:
            out["mese"] = {"da": primo.isoformat(), "nota": "oggi è il primo del mese: niente da contare ancora"}
        return out


def _strumenti_sito(mcp: MCPServer) -> None:
    """Visite del sito (modulo sito, letto da Statistiche): solo admin, come la pagina
    Statistiche › Sito. Chiama la funzione della rotta /statistiche/sito."""
    from app.routers import statistiche_router
    strumento = functools.partial(_strumento, mcp)

    @strumento(SOLA_LETTURA)
    def visite_sito_riepilogo(
        giorni: Annotated[int, Field(ge=1, le=400, description="Lunghezza del periodo in giorni (30 se manca)")] = 30,
        a: Annotated[Giorno | None, Field(description="Ultimo giorno del periodo. Oggi se manca")] = None,
    ) -> dict:
        """Le visite del sito in un periodo, contro il periodo subito prima della stessa
        lunghezza: pagine viste, visitatori (somma giornaliera), clic su Prenota, prenotazioni
        fatte dal sito (widget TheFork e widget TRGB) nello stesso periodo, le 10 pagine più
        viste, provenienze, lingue, mobile/desktop e i clic per obiettivo (prenota_apri,
        telefono, whatsapp, email, pdf_menu, pdf_vini, mappa). Solo conteggi, nessun dato
        personale."""
        _ruoli("admin", cosa="le visite del sito")
        r = statistiche_router.sito_visite(giorni=giorni, a=a)
        p = r["prenotazioni"]
        return {
            "periodo": r["periodo"], "periodo_prima": r["periodo_prima"], "dati_dal": r["dati_dal"],
            "totali": r["totali"],
            "prenotazioni_dal_sito": {"totale": p["totale"], "totale_prima": p["totale_prima"],
                                      "coperti": p["coperti"], "per_fonte": p["per_fonte"]},
            "clic": r["clic"],
            "pagine": r["pagine"][:10], "provenienze": r["provenienze"][:10],
            "lingue": r["lingue"], "dispositivi": r["dispositivi"], "campagne": r["campagne"][:10],
        }
