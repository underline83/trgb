# @version: v1.0 — M.G fase 1 (2026-09-01)
# -*- coding: utf-8 -*-
"""
M.G Permessi — guardie di ruolo riutilizzabili (fase 1)

Modulo: platform
Classificazione: [core]

PERCHÉ ESISTE
-------------
`Depends(get_current_user)` è **autenticazione**, non autorizzazione: dice che
c'è un token valido, non che quel ruolo possa fare quella cosa. L'audit del
2026-09-01 (`docs/audit_permessi_2026-09-01.md`) ha trovato 636 endpoint su 836
fermi lì — cioè aperti a qualsiasi utente loggato, `viewer` compreso — e otto
helper di guardia diversi reinventati router per router (`_require_admin`,
`_solo_admin`, `_check_admin`, `check_admin_role`, `check_allowed_role`,
`_require_manager`, `_require_editor`, `_require_admin_or_chef`).

Questo modulo è il posto unico dove si dichiara "chi può". Non rende sicuro
niente da solo: rende **una riga** proteggere un endpoint, così non c'è più la
scusa della fretta.

FASE 1 vs M.G COMPLETO
----------------------
Qui c'è la guardia dichiarativa. La matrice ruolo × azione configurabile da UI
descritta in `docs/architettura_mattoni.md` §M.G (con `<CanDo>` lato frontend)
resta da fare: quando arriverà, cambierà l'implementazione di queste funzioni,
non le chiamate sparse nei router. È il motivo per cui vale la pena passare di
qui invece di scrivere l'ennesimo `if role != "admin"`.

COME SI USA
-----------
1) Su un singolo endpoint, quando NON serve l'utente nel corpo:

    @router.delete("/{id}", dependencies=[Depends(solo_admin())])
    def cancella(id: int):
        ...

2) Su un singolo endpoint, quando l'utente serve (username per audit, ecc.):

    @router.post("/")
    def crea(payload: X, user=Depends(richiede_ruoli("admin", "contabile"))):
        log(user["username"])

3) Su TUTTO un router (il default diventa chiuso, si aprono le eccezioni):

    router = APIRouter(prefix="/banca", dependencies=[Depends(solo_admin())])

4) Dentro il corpo, quando il permesso dipende da un dato a runtime:

    if payload.tocca_gli_stipendi:
        verifica_ruoli(user, "admin", cosa="i costi del personale")

DUE SCELTE DA CONOSCERE
-----------------------
- **`superadmin` è implicito ovunque compaia `admin`.** Specchio di `is_admin()`
  in auth_service e di `roleMatch()` nel frontend: nessuno deve ricordarsi di
  scrivere entrambi, dimenticarlo taglierebbe fuori il superadmin.
- **I nomi dei ruoli sono validati all'import**, contro `VALID_ROLES`. Un typo
  (`"sommellier"`) fa fallire il boot con un messaggio chiaro invece di creare
  un permesso che non matcha mai — o peggio, in un `in`/`not in` scritto male,
  una porta aperta silenziosa. È il vantaggio pratico principale su un `if`
  scritto a mano.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, FrozenSet, Iterable

from fastapi import Depends, HTTPException, status

from app.services.auth_service import VALID_ROLES, get_current_user


# ============================================================
# NORMALIZZAZIONE
# ============================================================
def _normalizza(ruoli: Iterable[str]) -> FrozenSet[str]:
    """Valida i nomi ruolo e aggiunge `superadmin` dove c'è `admin`.

    Solleva ValueError all'import del router (= al boot) se un nome non esiste
    in VALID_ROLES: meglio un'app che non parte di un permesso che non matcha.
    """
    puliti = {str(r).strip() for r in ruoli if str(r).strip()}
    if not puliti:
        raise ValueError(
            "permessi: serve almeno un ruolo. Per 'basta essere loggati' usa "
            "Depends(get_current_user), non una guardia."
        )
    sconosciuti = sorted(puliti - VALID_ROLES)
    if sconosciuti:
        raise ValueError(
            f"permessi: ruolo/i inesistente/i {sconosciuti}. "
            f"Ruoli validi: {sorted(VALID_ROLES)}"
        )
    if "admin" in puliti:
        puliti.add("superadmin")
    return frozenset(puliti)


def _ruolo(user: Dict[str, Any] | None) -> str:
    return (user or {}).get("role") or ""


def _messaggio(consentiti: FrozenSet[str], cosa: str | None) -> str:
    oggetto = f" ({cosa})" if cosa else ""
    if consentiti == frozenset({"admin", "superadmin"}):
        return f"Accesso riservato agli amministratori{oggetto}."
    if consentiti == frozenset({"superadmin"}):
        return f"Accesso riservato al superadmin{oggetto}."
    return f"Il tuo ruolo non ha accesso a questa funzione{oggetto}."


# ============================================================
# FORMA IMPERATIVA — dentro il corpo di una funzione
# ============================================================
def verifica_ruoli(user: Dict[str, Any] | None, *ruoli: str, cosa: str | None = None) -> None:
    """403 se `user` non ha uno dei ruoli indicati. Non ritorna niente.

    Da usare quando il permesso dipende da un dato che si conosce solo a
    runtime. Negli altri casi è preferibile la dependency: sta nella firma
    dell'endpoint, quindi si vede senza leggere il corpo e finisce in OpenAPI.
    """
    consentiti = _normalizza(ruoli)
    if _ruolo(user) not in consentiti:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_messaggio(consentiti, cosa),
        )


def ha_ruoli(user: Dict[str, Any] | None, *ruoli: str) -> bool:
    """True/False senza sollevare. Per decidere COSA restituire, non SE.

    Esempio: un elenco che ai non-admin esce senza le colonne riservate,
    invece di negare del tutto l'accesso (vedi `dipendenti.list_dipendenti`).
    """
    return _ruolo(user) in _normalizza(ruoli)


# ============================================================
# DEPENDENCY FACTORY — nella firma o su tutto il router
# ============================================================
def richiede_ruoli(*ruoli: str, cosa: str | None = None) -> Callable:
    """Dependency FastAPI: passa solo chi ha uno dei ruoli. Ritorna l'utente.

    I nomi vengono validati QUI, cioè all'import del router che la usa: un typo
    non arriva mai in produzione.
    """
    consentiti = _normalizza(ruoli)

    def _guardia(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if _ruolo(current_user) not in consentiti:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=_messaggio(consentiti, cosa),
            )
        return current_user

    _guardia.__doc__ = f"Richiede uno di questi ruoli: {', '.join(sorted(consentiti))}"
    return _guardia


def solo_admin(cosa: str | None = None) -> Callable:
    """Scorciatoia per `richiede_ruoli("admin")` — superadmin incluso."""
    return richiede_ruoli("admin", cosa=cosa)


def solo_superadmin(cosa: str | None = None) -> Callable:
    """Solo superadmin, admin ESCLUSO. Per le funzioni davvero riservate
    (es. preconti). Qui `superadmin` non è implicito: è l'unico consentito."""
    return richiede_ruoli("superadmin", cosa=cosa)
