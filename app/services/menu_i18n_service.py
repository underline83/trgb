#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Modulo: menu_carta
# @version: v1.0-menu-i18n (2026-08-07) — motore traduzioni Menu Carta [core]

"""
Motore i18n del modulo Menu Carta — [core]

Generico: nessun riferimento a Tre Gobbi, nessun testo di ristorante. I
contenuti tradotti stanno a DB (`menu_translations`, mig 163), qui c'e' solo
la meccanica per leggerli e applicarli.

Due responsabilita', tenute separate di proposito:

  1. CONTENUTO DEL RISTORANTE (piatti, descrizioni, degustazioni) -> a DB.
     Cambia a ogni edizione stagionale, lo scrive il ristoratore.
     Funzioni: `traduci()`, `applica()`.

  2. ETICHETTE DI STRUTTURA (nomi delle sezioni, voci di servizio ricorrenti)
     -> dizionario statico qui sotto. Non sono contenuto del ristorante ma
     struttura di prodotto: "Antipasti" si dice "Starters" per chiunque venda
     TRGB, e metterle a DB vorrebbe dire farle riscrivere a ogni cliente.
     Dizionario gemello lato frontend: frontend/src/config/menuI18n.js —
     se tocchi uno, tocca l'altro.

Regola non negoziabile: FALLBACK A CASCATA. Traduzione -> italiano.
Verso l'ospite non esce MAI una stringa vuota o un null al posto di un testo.
Se manca la traduzione di un piatto, l'ospite legge l'italiano: non e' un
errore, e' il comportamento previsto finche' il backoffice non la riempie.

Nessun import da router di altri moduli (regola 2 disciplina modulare).
"""

from typing import Any, Dict, Iterable, Optional, Tuple


# ═══════════════════════════════════════════════════════════
#   LINGUE
# ═══════════════════════════════════════════════════════════

LINGUA_MADRE = "it"

#: Lingue a sistema. `it` e' la madre e NON vive in `menu_translations`:
#: viene dai campi originali delle tabelle menu_*.
LINGUE: Tuple[str, ...] = ("it", "en", "fr", "es", "de", "uk")

#: Solo le lingue di traduzione (tutto tranne la madre).
LINGUE_TRADOTTE: Tuple[str, ...] = tuple(l for l in LINGUE if l != LINGUA_MADRE)

#: Etichetta mostrata nel selettore. Sigle testuali, MAI bandiere: una
#: bandiera e' uno stato, non una lingua (il francese non e' la Francia,
#: l'inglese non e' il Regno Unito).
LINGUE_LABEL: Dict[str, str] = {
    "it": "IT", "en": "EN", "fr": "FR", "es": "ES", "de": "DE", "uk": "UK",
}

#: Codice per l'attributo HTML `lang=` / `hreflang`. Coincide con la chiave
#: tranne che per l'ucraino, dove 'uk' e' gia' il codice ISO 639-1 corretto
#: (attenzione: 'uk' NON e' il Regno Unito, quello e' 'en-GB').
LINGUE_HTML: Dict[str, str] = {
    "it": "it", "en": "en", "fr": "fr", "es": "es", "de": "de", "uk": "uk",
}

#: Entita' traducibili e campi ammessi per ciascuna.
CAMPI_PER_ENTITA: Dict[str, Tuple[str, ...]] = {
    "publication":  ("titolo", "descrizione", "prezzo_label"),
    "tasting_path": ("sottotitolo", "note"),
    "edition":      ("storia",),
}
ENTITA_VALIDE = tuple(CAMPI_PER_ENTITA.keys())


def normalizza_lang(raw: Optional[str]) -> str:
    """
    Riduce un input qualsiasi a una lingua a sistema. Non solleva MAI.

    Accetta 'EN', 'en-GB', 'fr_FR', ' es ', None. Tutto cio' che non riconosce
    diventa italiano: un `?lang=` sbagliato in un QR stampato non deve dare
    500 a un ospite seduto al tavolo, deve dare il menu in italiano.
    """
    if not raw:
        return LINGUA_MADRE
    code = str(raw).strip().lower().replace("_", "-").split("-")[0]
    return code if code in LINGUE else LINGUA_MADRE


# ═══════════════════════════════════════════════════════════
#   LETTURA TRADUZIONI
# ═══════════════════════════════════════════════════════════

def traduci(conn, entita: str, ids: Iterable[int], lang: str) -> Dict[Tuple[int, str], str]:
    """
    Carica in UNA query tutte le traduzioni di `lang` per gli `ids` dati.

    Ritorna {(entita_id, campo): valore}. Dizionario vuoto se `lang` e' la
    lingua madre o se non c'e' nulla da tradurre — il chiamante non deve
    ramificare, `applica()` gestisce il caso vuoto.

    Una query per entita' per pagina, mai una per riga: la pagina pubblica e'
    l'endpoint piu' battuto del sistema (ogni QR scansionato in sala) e un N+1
    su 44 piatti significa 44 query per coperto.
    """
    ids = [int(i) for i in ids if i is not None]
    if lang == LINGUA_MADRE or not ids or entita not in ENTITA_VALIDE:
        return {}

    place = ",".join("?" * len(ids))
    rows = conn.execute(
        f"""
        SELECT entita_id, campo, valore
        FROM menu_translations
        WHERE entita = ? AND lang = ? AND entita_id IN ({place})
        """,
        [entita, lang, *ids],
    ).fetchall()

    out: Dict[Tuple[int, str], str] = {}
    for r in rows:
        valore = r["valore"] if not isinstance(r, tuple) else r[2]
        entita_id = r["entita_id"] if not isinstance(r, tuple) else r[0]
        campo = r["campo"] if not isinstance(r, tuple) else r[1]
        # Una traduzione vuota o di soli spazi non e' una traduzione: la
        # scartiamo qui cosi' `applica()` cade sull'italiano invece di
        # mostrare una riga bianca all'ospite.
        if valore is not None and str(valore).strip():
            out[(int(entita_id), campo)] = valore
    return out


def applica(
    trad: Dict[Tuple[int, str], str],
    entita_id: Optional[int],
    campo: str,
    originale: Optional[str],
) -> Optional[str]:
    """
    Fallback a cascata: traduzione -> italiano.

    `originale` puo' essere None (es. `titolo_override` non valorizzato): in
    quel caso, se non c'e' traduzione, si restituisce None e il fallback
    successivo (recipes.menu_name) resta a carico del chiamante, che e' l'unico
    a sapere qual e'.

    Non restituisce mai stringa vuota al posto di un originale valorizzato.
    """
    if entita_id is None:
        return originale
    v = trad.get((int(entita_id), campo))
    if v is not None and str(v).strip():
        return v
    return originale


def applica_riga(
    riga: Dict[str, Any],
    trad: Dict[Tuple[int, str], str],
    mappa_campi: Dict[str, str],
    id_key: str = "id",
) -> Dict[str, Any]:
    """
    Applica le traduzioni a un dict gia' serializzato, in place.

    `mappa_campi` collega il campo logico di `menu_translations` alla chiave
    del dict: es. {"titolo": "titolo_override", "descrizione":
    "descrizione_override"}.

    Scrivere la traduzione DENTRO il campo originale (invece di aggiungere
    `titolo_en`, `titolo_fr`, ...) e' quello che tiene la risposta di
    `public/today` retrocompatibile: la forma non cambia, cambia solo il
    contenuto. Un client che non sa nulla di lingue continua a funzionare, e
    il frontend non deve imparare regole di risoluzione nuove.
    """
    rid = riga.get(id_key)
    for campo, chiave in mappa_campi.items():
        riga[chiave] = applica(trad, rid, campo, riga.get(chiave))
    return riga


# ═══════════════════════════════════════════════════════════
#   ETICHETTE DI STRUTTURA — [core], statiche, non a DB
# ═══════════════════════════════════════════════════════════

#: Nomi delle sezioni del menu. Ordine canonico definito nel router.
#: de/uk: chiavi pronte e vuote, i testi arrivano a parte. Stringa vuota =
#: `label_sezione()` cade sull'italiano, che e' meglio di un buco.
SEZIONI_LABEL: Dict[str, Dict[str, str]] = {
    "antipasti": {
        "it": "Antipasti",
        "en": "Starters",
        "fr": "Entrées",
        "es": "Entrantes",
        "de": "",
        "uk": "",
    },
    "paste_risi_zuppe": {
        "it": "Paste, risi e zuppe",
        "en": "Pasta, Rice and Soups",
        "fr": "Pâtes, riz et soupes",
        "es": "Pastas, arroces y sopas",
        "de": "",
        "uk": "",
    },
    "piatti_del_giorno": {
        "it": "Piatti del giorno",
        "en": "Dishes of the Day",
        "fr": "Plats du jour",
        "es": "Platos del día",
        "de": "",
        "uk": "",
    },
    "secondi": {
        "it": "Secondi",
        "en": "Main Courses",
        "fr": "Plats",
        "es": "Segundos",
        "de": "",
        "uk": "",
    },
    "contorni": {
        "it": "Contorni",
        "en": "Sides",
        "fr": "Accompagnements",
        "es": "Guarniciones",
        "de": "",
        "uk": "",
    },
    "dolci": {
        "it": "Dolci",
        "en": "Desserts",
        "fr": "Desserts",
        "es": "Postres",
        "de": "",
        "uk": "",
    },
    "degustazioni": {
        "it": "Degustazioni",
        "en": "Tasting Menu",
        "fr": "Dégustation",
        "es": "Degustación",
        "de": "",
        "uk": "",
    },
    "bambini": {
        "it": "Bambini",
        "en": "Children's Menu",
        "fr": "Menu enfants",
        "es": "Menú infantil",
        "de": "",
        "uk": "",
    },
    "servizio": {
        "it": "Servizio",
        "en": "Service",
        "fr": "Service",
        "es": "Servicio",
        "de": "",
        "uk": "",
    },
}

#: Micro-copy della pagina pubblica (non e' contenuto del ristorante).
#: Le chiavi devono restare allineate a UI_LABEL in
#: frontend/src/config/menuI18n.js. `{n}` e' un segnaposto da interpolare.
UI_LABEL: Dict[str, Dict[str, str]] = {
    "titolo_pagina": {
        "it": "La Carta del Menu", "en": "The Menu",
        "fr": "La Carte", "es": "La Carta", "de": "", "uk": "",
    },
    "caricamento": {
        "it": "Caricamento del menu…", "en": "Loading the menu…",
        "fr": "Chargement du menu…", "es": "Cargando el menú…", "de": "", "uk": "",
    },
    "menu_non_disponibile": {
        "it": "Nessun menu attualmente in carta. Torna a trovarci presto.",
        "en": "No menu is currently available. Please come back soon.",
        "fr": "Aucun menu n'est disponible pour le moment. Revenez bientôt.",
        "es": "No hay ningún menú disponible en este momento. Vuelve pronto.",
        "de": "", "uk": "",
    },
    "percorso_degustazione": {
        "it": "Percorso di degustazione", "en": "Tasting menu",
        "fr": "Menu dégustation", "es": "Menú degustación", "de": "", "uk": "",
    },
    "allergeni": {
        "it": "Allergeni", "en": "Allergens",
        "fr": "Allergènes", "es": "Alérgenos", "de": "", "uk": "",
    },
    "allergeni_nota": {
        "it": "Per informazioni su allergeni e intolleranze rivolgiti al personale di sala.",
        "en": "For information on allergens and intolerances, please ask our staff.",
        "fr": "Pour toute information sur les allergènes et les intolérances, adressez-vous au personnel de salle.",
        "es": "Para información sobre alérgenos e intolerancias, consulte al personal de sala.",
        "de": "", "uk": "",
    },
    "composizione_variabile": {
        "it": "Composizione variabile — chiedere allo staff",
        "en": "Varies daily — please ask our staff",
        "fr": "Composition variable — demandez au personnel",
        "es": "Composición variable — consulte al personal",
        "de": "", "uk": "",
    },
    "consigliato_per": {
        "it": "Consigliato per {n} persone", "en": "Recommended for {n} people",
        "fr": "Conseillé pour {n} personnes", "es": "Recomendado para {n} personas",
        "de": "", "uk": "",
    },
    "prezzo_per_persona": {
        "it": "a persona", "en": "per person",
        "fr": "par personne", "es": "por persona", "de": "", "uk": "",
    },
    "prezzo_per_due": {
        "it": "prezzo per 2 persone", "en": "price for 2 people",
        "fr": "prix pour 2 personnes", "es": "precio para 2 personas", "de": "", "uk": "",
    },
    "senza_titolo": {
        "it": "(senza titolo)", "en": "(untitled)",
        "fr": "(sans titre)", "es": "(sin título)", "de": "", "uk": "",
    },
    "buon_appetito": {
        "it": "Buon appetito", "en": "Enjoy your meal",
        "fr": "Bon appétit", "es": "Buen provecho", "de": "", "uk": "",
    },
    "carta_vini": {
        "it": "Carta Vini", "en": "Wine List",
        "fr": "Carte des vins", "es": "Carta de vinos", "de": "", "uk": "",
    },
    "carta_vini_full": {
        "it": "Carta Vini & Bevande", "en": "Wine & Drinks List",
        "fr": "Carte des vins et boissons", "es": "Carta de vinos y bebidas",
        "de": "", "uk": "",
    },
    "torna_carta_vini": {
        "it": "← Torna alla carta vini", "en": "← Back to the wine list",
        "fr": "← Retour à la carte des vins", "es": "← Volver a la carta de vinos",
        "de": "", "uk": "",
    },
    "scegli_lingua": {
        "it": "Scegli la lingua", "en": "Choose your language",
        "fr": "Choisissez votre langue", "es": "Elige tu idioma", "de": "", "uk": "",
    },
}


def label_sezione(sezione: str, lang: str) -> str:
    """Etichetta della sezione nella lingua data. Fallback: lingua -> it -> chiave grezza."""
    voci = SEZIONI_LABEL.get(sezione)
    if not voci:
        return sezione.replace("_", " ").capitalize()
    return voci.get(lang) or voci.get(LINGUA_MADRE) or sezione


def label_ui(chiave: str, lang: str) -> str:
    """Micro-copy UI nella lingua data. Fallback: lingua -> it -> chiave grezza."""
    voci = UI_LABEL.get(chiave)
    if not voci:
        return chiave
    return voci.get(lang) or voci.get(LINGUA_MADRE) or chiave


# ═══════════════════════════════════════════════════════════
#   SCRITTURA / COPERTURA (backoffice)
# ═══════════════════════════════════════════════════════════

def upsert(conn, righe: Iterable[Dict[str, Any]]) -> Dict[str, int]:
    """
    Upsert massivo dal backoffice. Ritorna {'scritte': n, 'cancellate': n}.

    Un `valore` vuoto non scrive una riga vuota: CANCELLA la traduzione. E'
    l'unico modo che ha Marco per dire "questa traduzione era sbagliata,
    togliamola" e tornare al fallback italiano; una riga con valore '' darebbe
    invece un buco in carta.

    Qui `ON CONFLICT DO UPDATE` (non DO NOTHING): il backoffice deve poter
    correggere. E' il SEED ad andare in DO NOTHING, per non ricalpestare le
    correzioni fatte a mano.
    """
    scritte = cancellate = 0
    for r in righe:
        entita = r.get("entita")
        campo = r.get("campo")
        lang = normalizza_lang(r.get("lang"))
        entita_id = r.get("entita_id")

        if entita not in ENTITA_VALIDE or entita_id is None:
            continue
        if campo not in CAMPI_PER_ENTITA[entita]:
            continue
        if lang == LINGUA_MADRE:
            # L'italiano si modifica dal modulo Menu Carta, non da qui: e' il
            # contenuto originale, non una traduzione.
            continue

        valore = r.get("valore")
        valore = str(valore).strip() if valore is not None else ""

        if not valore:
            cur = conn.execute(
                """DELETE FROM menu_translations
                   WHERE entita = ? AND entita_id = ? AND lang = ? AND campo = ?""",
                (entita, int(entita_id), lang, campo),
            )
            cancellate += cur.rowcount or 0
            continue

        conn.execute(
            """
            INSERT INTO menu_translations (entita, entita_id, lang, campo, valore, rivisto, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT (entita, entita_id, lang, campo) DO UPDATE SET
                valore     = excluded.valore,
                rivisto    = excluded.rivisto,
                updated_at = datetime('now')
            """,
            (entita, int(entita_id), lang, campo, valore, 1 if r.get("rivisto") else 0),
        )
        scritte += 1

    conn.commit()
    return {"scritte": scritte, "cancellate": cancellate}
