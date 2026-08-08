# Modulo: vini
"""
Service: vini_riordino — chi va riordinato, e perché.

RAZIONALE (Marco, 2026-08-08):
  Una soglia fissa sulle bottiglie non dice niente. «Ci sono vini importanti
  che è normale avere in una sola bottiglia»: 1 bt di un Barolo che si vende
  3 volte al mese è un buco che si aprirà fra dieci giorni; 1 bt di un vino
  fermo da mesi è semplicemente la sua giacenza normale.

  Il criterio giusto è la COPERTURA: quanti giorni di vendite copre la
  giacenza attuale, al ritmo delle ultime settimane.

      consumo_giornaliero = vendite_finestra / giorni_finestra
      copertura_giorni    = giacenza / consumo_giornaliero
                          = giacenza * giorni_finestra / vendite_finestra

  Un vino entra nel riordino se:
    - è esaurito (copertura = 0), oppure
    - la copertura è sotto `alert_carta_giorni_copertura` (default 21 gg:
      il tempo che passa fra due giri del rappresentante più la consegna).

  Chi non ha venduto niente nella finestra ha copertura infinita e non
  compare mai: è la differenza fra "scorta bassa" e "vino fermo".

USO (un solo punto di verità per le 4 query che chiedono "cosa riordino?"):
    from app.services.vini_riordino_service import sql_da_riordinare, parametri_riordino

    cond = sql_da_riordinare("v")
    cur.execute(f"SELECT ... FROM vini_bottiglie v WHERE v.CARTA = 1 AND {cond}")

La condizione SQL è auto-contenuta (la subquery vendite è inline) proprio per
poter stare in un WHERE senza obbligare il chiamante a wrappare la query.
"""

from __future__ import annotations
from typing import Optional, Tuple

from app.services.vini_widget_settings_service import get_widget_setting


# Fallback usati se i settings non sono leggibili (DB non migrato in dev).
FINESTRA_DEFAULT = 60
COPERTURA_DEFAULT = 21


def parametri_riordino() -> Tuple[int, int]:
    """
    (giorni_finestra, giorni_copertura) dai settings.

    - `qta_suggerita_giorni_storico` è la stessa finestra già usata per la
      quantità suggerita: se il consumo si misura su 60 giorni per decidere
      QUANTO ordinare, va misurato su 60 giorni anche per decidere SE ordinare.
    - `alert_carta_giorni_copertura` è la soglia di allarme.
    """
    try:
        finestra = int(get_widget_setting("qta_suggerita_giorni_storico", default=FINESTRA_DEFAULT))
    except (TypeError, ValueError):
        finestra = FINESTRA_DEFAULT
    try:
        copertura = int(get_widget_setting("alert_carta_giorni_copertura", default=COPERTURA_DEFAULT))
    except (TypeError, ValueError):
        copertura = COPERTURA_DEFAULT
    return max(1, finestra), max(0, copertura)


def sql_vendite_finestra(alias: str = "v", finestra: Optional[int] = None) -> str:
    """Subquery: bottiglie vendute dal vino `alias` negli ultimi N giorni."""
    if finestra is None:
        finestra, _ = parametri_riordino()
    return (
        "(SELECT COALESCE(SUM(m.qta), 0) FROM vini_magazzino_movimenti m"
        f"  WHERE m.vino_id = {alias}.id AND m.tipo = 'VENDITA'"
        f"    AND datetime(m.data_mov) >= datetime('now', '-{int(finestra)} days'))"
    )


def sql_da_riordinare(alias: str = "v") -> str:
    """
    Condizione SQL booleana: il vino `alias` ha scorta insufficiente.

    Tutto in aritmetica intera per non dividere per zero: invece di
        giacenza * finestra / vendite < copertura
    si confronta
        giacenza * finestra < copertura * vendite
    Se le vendite sono 0 il lato destro è 0 e la condizione è falsa da sola —
    il vino fermo resta fuori senza bisogno di un caso speciale.
    """
    finestra, copertura = parametri_riordino()
    vendite = sql_vendite_finestra(alias, finestra)
    return (
        "("
        f"  COALESCE({alias}.QTA_TOTALE, 0) = 0"
        f"  OR COALESCE({alias}.QTA_TOTALE, 0) * {finestra} < {copertura} * {vendite}"
        ")"
    )


def _anno(annata: Optional[str]) -> Optional[int]:
    """
    Anno numerico da una `ANNATA` testuale. None per "s.a." / vuoto / non
    numerico: gli spumanti senza annata non partecipano al confronto (6 righe
    su 48 nel monitor del 2026-08-08).
    """
    a = (annata or "").strip()
    return int(a[:4]) if a[:4].isdigit() else None


def arricchisci_annate(cur, righe: list) -> list:
    """
    Aggiunge a ogni riga il contesto "annate" — RD.2 (Marco, 2026-08-08:
    «se un vino ha un'annata nuova dovresti aiutarmi a capirlo per decidere»).

    Campi aggiunti:
      - `annata_successiva`: `{id, annata, qta, in_carta}` della bottiglia più
        recente della stessa madre, se esiste un'annata > della propria.
        **È il caso che smaschera i falsi allarmi**: sul DB del 2026-08-08, 10
        righe su 48 erano esaurite solo perché l'annata era finita e la nuova
        era già in cantina (es. Valcalepio Lyr 2022 a zero, 2023 con 30 bt).
        Quelle non vanno ordinate, vanno marcate "Annata esaurita".
      - `altre_annate`: quante altre bottiglie esistono per la stessa madre.
      - `ultimo_acquisto`: data dell'ultimo `CARICO` su QUALUNQUE annata della
        madre (None se non risulta nessun carico da quando esiste il gestionale).
        Serve a rispondere a "da quanto non lo compro?", cioè se conviene
        chiedere al rappresentante direttamente l'annata nuova.

    Una sola query di appoggio per tutte le righe (non una per vino), perché
    questo gira dentro `get_dashboard_stats` che è già la pagina più pesante.
    """
    madri = {r.get("madre_id") for r in righe if r.get("madre_id")}
    for r in righe:
        r["annata_successiva"] = None
        r["altre_annate"] = 0
        r["ultimo_acquisto"] = None
    if not madri:
        return righe

    ph = ",".join("?" * len(madri))
    sorelle: dict = {}
    for b in cur.execute(
        f"""
        SELECT b.id, b.madre_id, b.ANNATA, b.QTA_TOTALE, b.CARTA,
               (SELECT MAX(m.data_mov) FROM vini_magazzino_movimenti m
                 WHERE m.vino_id = b.id AND m.tipo = 'CARICO') AS ultimo_carico
          FROM vini_bottiglie b
         WHERE b.madre_id IN ({ph})
        """,
        tuple(madri),
    ).fetchall():
        sorelle.setdefault(b["madre_id"], []).append(dict(b))

    for r in righe:
        gruppo = sorelle.get(r.get("madre_id")) or []
        altre = [b for b in gruppo if b["id"] != r["id"]]
        r["altre_annate"] = len(altre)

        carichi = [b["ultimo_carico"] for b in gruppo if b["ultimo_carico"]]
        r["ultimo_acquisto"] = max(carichi) if carichi else None

        mio = _anno(r.get("ANNATA"))
        if mio is None:
            continue
        piu_recenti = [
            b for b in altre
            if (_anno(b["ANNATA"]) or 0) > mio
        ]
        if not piu_recenti:
            continue
        # Con giacenza prima (è quella che rende inutile il riordino), poi la
        # più recente in assoluto.
        piu_recenti.sort(
            key=lambda b: ((b["QTA_TOTALE"] or 0) > 0, _anno(b["ANNATA"]) or 0),
            reverse=True,
        )
        b = piu_recenti[0]
        r["annata_successiva"] = {
            "id": b["id"],
            "annata": b["ANNATA"],
            "qta": b["QTA_TOTALE"] or 0,
            "in_carta": bool(b["CARTA"]),
        }
    return righe


def copertura_giorni(qta: Optional[float], vendite_finestra: Optional[float],
                     finestra: Optional[int] = None) -> Optional[int]:
    """
    Giorni di scorta residua, per mostrarli in interfaccia.

    None = "non calcolabile" (nessuna vendita nella finestra): il vino non ha
    un ritmo, quindi non ha una copertura. Da rendere come "—" e non come 0,
    che significherebbe l'opposto (esaurito).
    """
    if finestra is None:
        finestra, _ = parametri_riordino()
    try:
        q = float(qta or 0)
        v = float(vendite_finestra or 0)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    if q <= 0:
        return 0
    return int(round(q * finestra / v))
