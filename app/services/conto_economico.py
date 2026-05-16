"""
TRGB — Conto Economico Completo (G.3 Fase B, 2026-05-14)

Aggrega Ricavi → Costo Merce → Margine Lordo → Costi Operativi → Utile Netto
per il periodo specificato, raggruppando per categoria/sottocategoria delle
fatture acquisti (fe_categorie/fe_sottocategorie).

DECISIONI DI PRODOTTO (Marco 2026-05-14):
  - Calcolo su IMPONIBILE (no IVA, pass-through).
  - V1 stipendi = solo NETTO (cg_uscite.totale dove tipo_uscita='STIPENDIO').
    V1.1 (TODO) aggiungerà lordo + contributi INPS + TFR.
  - Note credito (TD04): escluse via WHERE.
  - Autofatture (is_autofattura=1): escluse.
  - Escluso acquisti (escluso_acquisti=1): escluse.
  - V1 MODALITÀ COMPETENZA implementata.
    Modalità cassa = TODO v1.1 (richiede join con cg_uscite.data_pagamento).
  - Spese fisse spalmate mensilmente in v1 = NO (tutto nel mese di
    competenza/scadenza). v2 implementerà spalmatura.
  - Anti-doppio-conteggio stipendi: vengono SOLO da cg_uscite tipo='STIPENDIO'.
    cg_spese_fisse tipo='STIPENDIO' è template-proiezione, NON entra nel calcolo.

CATEGORIZZAZIONE COSTI:
  - COSTO MERCE: categorie {MATERIE PRIME, BEVANDE} → sottratte da ricavi per margine lordo
  - COSTI OPERATIVI: tutte le altre categorie (STAFF, AMMINISTRATORI, AFFITTI,
    UTENZE, SERVIZI, ATTREZZATURE, MANUTENZIONE, TASSE E IMPOSTE,
    ASSICURAZIONI, FINANZIARI) → sottratte dal margine lordo per utile netto
  - "Non categorizzato": macro implicita per fatture senza categoria assegnata
    (mostrate in costi operativi con flag "anomalia")

OUTPUT (dict JSON-serializable):
{
  "anno": 2026, "mese": 5, "modalita": "competenza",
  "periodo_label": "Mag 2026",
  "ricavi": { "corrispettivi": 15000.0, "totale": 15000.0 },
  "costo_merce": {
    "totale": 6000.0,
    "per_categoria": [
      {"categoria": "MATERIE PRIME", "importo": 5000, "sottocat": [...]},
      {"categoria": "BEVANDE", "importo": 1000, "sottocat": [...]}
    ]
  },
  "margine_lordo": 9000.0,
  "margine_lordo_pct": 60.0,
  "costi_operativi": {
    "totale": 8000.0,
    "per_categoria": [
      {"categoria": "STAFF", "importo": 4000, "sottocat": [...], "fonte": "stipendi+fatture"},
      {"categoria": "AFFITTI", "importo": 2500, ..., "fonte": "spese_fisse"},
      ...
    ]
  },
  "utile_netto": 1000.0,
  "utile_netto_pct": 6.7,
  "_meta": {
    "fatture_count": 42,
    "spese_fisse_count": 18,
    "stipendi_count": 5,
    "warnings": []
  }
}
"""

import sqlite3
from datetime import date
from typing import Optional


# Categorie che concorrono al COSTO MERCE (food cost lordo). Tutto il resto
# è classificato come costo operativo. Marco 2026-05-14.
CATEGORIE_COSTO_MERCE = {"MATERIE PRIME", "BEVANDE"}


def _range_periodo(anno: int, mese: int) -> tuple[str, str, str]:
    """Calcola (primo_giorno, ultimo_giorno_esclusivo, periodo_riferimento YYYY-MM)."""
    primo = f"{anno}-{mese:02d}-01"
    if mese == 12:
        ultimo = f"{anno + 1}-01-01"
    else:
        ultimo = f"{anno}-{mese + 1:02d}-01"
    periodo_rif = f"{anno}-{mese:02d}"
    return primo, ultimo, periodo_rif


def _fmt_mese_label(anno: int, mese: int) -> str:
    nomi = ["", "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
            "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    return f"{nomi[mese]} {anno}" if 1 <= mese <= 12 else f"M{mese} {anno}"


def _aggregate_fatture_per_categoria(
    fc_conn: sqlite3.Connection, primo: str, ultimo: str
) -> list[dict]:
    """
    Ritorna le righe SINGOLE di fe_fatture nel periodo, ognuna con
    categoria/sottocategoria inferite via fe_fornitore_categoria.
    Modalità COMPETENZA (data_fattura nel range).

    Esclude: autofatture, note credito TD04, fornitore escluso_acquisti=1.

    Ogni riga è uno schema riga unificato (cfr. _build_breakdown):
      {categoria, sottocategoria, tipo_riga, id, data, descrizione, ref, importo}
    """
    rows = fc_conn.execute("""
        SELECT
            COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
            COALESCE(fsub.nome, '—')                   AS sottocategoria,
            'fattura'                                  AS tipo_riga,
            f.id                                       AS id,
            f.data_fattura                             AS data,
            COALESCE(f.numero_fattura, '—')            AS descrizione,
            COALESCE(f.fornitore_nome, '—')            AS ref,
            COALESCE(f.imponibile_totale, 0)           AS importo
        FROM fe_fatture f
        LEFT JOIN fe_fornitore_categoria ffc
               ON f.fornitore_piva = ffc.fornitore_piva
        LEFT JOIN fe_categorie       fcat ON ffc.categoria_id     = fcat.id
        LEFT JOIN fe_sottocategorie  fsub ON ffc.sottocategoria_id = fsub.id
        WHERE f.data_fattura >= ? AND f.data_fattura < ?
          AND COALESCE(f.is_autofattura, 0) = 0
          AND COALESCE(f.tipo_documento, 'TD01') NOT IN ('TD04')
          -- escluso_acquisti vive su fe_fornitore_categoria (CLAUDE.md regola critica),
          -- NON su fe_fatture. Bug fix 2026-05-16 (Marco "load failed" CE).
          AND COALESCE(ffc.escluso_acquisti, 0) = 0
        ORDER BY f.data_fattura DESC, f.id DESC
    """, (primo, ultimo)).fetchall()
    return [dict(r) for r in rows]


def _aggregate_spese_fisse_per_categoria(
    fc_conn: sqlite3.Connection, periodo_rif: str,
    modalita: str = "competenza"
) -> list[dict]:
    """
    Aggrega cg_uscite tipo_uscita='SPESA_FISSA' del periodo, raggruppate per
    categoria/sottocategoria dalla cg_spese_fisse collegata.

    ESCLUSIONI per tipo (Marco 2026-05-16):

    - **STIPENDIO** (sempre escluso): anti-doppio-conteggio. Gli stipendi reali
      arrivano da cg_uscite tipo='STIPENDIO' via _aggregate_stipendi.

    - In modalità **COMPETENZA**: esclusa anche tipo='RATEIZZAZIONE'.
      Razionale: per definizione = rate di obblighi PREGRESSI (mutui su
      fatture passate, accollo debiti). La competenza è la data fattura
      originale, non la singola rata mensile.

    - In modalità **COMPETENZA**: esclusa anche tipo='RATEIZZAZIONE_TASSE'.
      Tipo introdotto 2026-05-16 (mig 131) per distinguere RATE di cartelle
      / F24 PREGRESSI (Abaco, AdE, rottamazione) dalle tasse correnti del
      mese. La competenza del costo era nei bilanci passati: includerla
      gonfia il P&L corrente. In cassa rientra come esborso reale.

    - In modalità **COMPETENZA**: INCLUSI tipo IN ('PRESTITO', 'TASSA',
      'AFFITTO', 'ASSICURAZIONE', 'ALTRO'). Razionale:
        * PRESTITO/MUTUO = la rata mensile rappresenta gli interessi + quota
          capitale di QUEL mese. Gli interessi sono costo finanziario di
          competenza del mese stesso. Marco 2026-05-16: "prestito ha senso
          tenerlo, competenza resta giusta".
        * TASSA = tassa di competenza del mese (IVA/IRPEF correnti, ecc.).
          Le tasse PREGRESSE rateizzate (cartelle AdE, F24 vecchi rateizzati)
          vivono nel tipo dedicato RATEIZZAZIONE_TASSE, escluso in competenza.
          Marco 2026-05-16: "se la tassa è di quel mese dovrebbe essere
          inclusa, TASSA è flag troppo grossolano → RATEIZZAZIONE_TASSE
          separata per averne controllo". TODO v1.1: aggiungere flag
          `e_pregresso` o `data_obbligazione_origine` su cg_spese_fisse per
          distinguere pulitamente senza affidarsi all'etichetta `tipo`.
        * AFFITTO/ASSICURAZIONE/ALTRO = costo del servizio erogato nel mese
          (per assicurazioni annuali pagate intere, spalmatura mensile è
          v2 — vedi roadmap G.3.2).

    - In modalità **CASSA**: TUTTI i tipi inclusi (rate, mutui, tasse, ecc.).
      La cassa è l'esborso reale del mese.

    Modalità COMPETENZA: filtra per cg_uscite.periodo_riferimento = YYYY-MM.
    """
    # NB: PRESTITO+TASSA inclusi (competenza mensile generica).
    # Le cartelle/F24 pregressi rateizzati sono classificati come
    # RATEIZZAZIONE_TASSE (tipo distinto da TASSA): esclusi qui per non
    # gonfiare il costo del mese in competenza (sono pagamenti diluiti
    # di cartelle anni precedenti). In modalità cassa restano visibili
    # come esborso reale.
    # TODO G.3.x: flag `e_pregresso` per distinzione pulita.
    tipi_esclusi_competenza = ('STIPENDIO', 'RATEIZZAZIONE', 'RATEIZZAZIONE_TASSE')
    if modalita == "competenza":
        # Escludi stipendi + rate/prestiti/tasse pregresse
        placeholders = ','.join(['?'] * len(tipi_esclusi_competenza))
        rows = fc_conn.execute(f"""
            SELECT
                COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
                COALESCE(fsub.nome, '—')                   AS sottocategoria,
                'spesa_fissa'                              AS tipo_riga,
                u.id                                       AS id,
                COALESCE(u.data_pagamento, u.data_scadenza, u.data_fattura) AS data,
                COALESCE(sf.titolo, u.numero_fattura, '—') AS descrizione,
                COALESCE(sf.tipo, '—')                     AS ref,
                COALESCE(u.totale, 0)                      AS importo
            FROM cg_uscite u
            LEFT JOIN cg_spese_fisse     sf   ON u.spesa_fissa_id     = sf.id
            LEFT JOIN fe_categorie       fcat ON sf.categoria_id      = fcat.id
            LEFT JOIN fe_sottocategorie  fsub ON sf.sottocategoria_id = fsub.id
            WHERE u.tipo_uscita = 'SPESA_FISSA'
              AND u.periodo_riferimento = ?
              AND COALESCE(sf.tipo, '') NOT IN ({placeholders})
            ORDER BY u.totale DESC, u.id DESC
        """, (periodo_rif, *tipi_esclusi_competenza)).fetchall()
    else:
        # Modalità cassa: esclude solo stipendi (resto = esborso reale del mese)
        rows = fc_conn.execute("""
            SELECT
                COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
                COALESCE(fsub.nome, '—')                   AS sottocategoria,
                'spesa_fissa'                              AS tipo_riga,
                u.id                                       AS id,
                COALESCE(u.data_pagamento, u.data_scadenza, u.data_fattura) AS data,
                COALESCE(sf.titolo, u.numero_fattura, '—') AS descrizione,
                COALESCE(sf.tipo, '—')                     AS ref,
                COALESCE(u.totale, 0)                      AS importo
            FROM cg_uscite u
            LEFT JOIN cg_spese_fisse     sf   ON u.spesa_fissa_id     = sf.id
            LEFT JOIN fe_categorie       fcat ON sf.categoria_id      = fcat.id
            LEFT JOIN fe_sottocategorie  fsub ON sf.sottocategoria_id = fsub.id
            WHERE u.tipo_uscita = 'SPESA_FISSA'
              AND u.periodo_riferimento = ?
              AND COALESCE(sf.tipo, '') != 'STIPENDIO'
            ORDER BY u.totale DESC, u.id DESC
        """, (periodo_rif,)).fetchall()
    return [dict(r) for r in rows]


def _aggregate_stipendi(
    fc_conn: sqlite3.Connection, periodo_rif: str
) -> list[dict]:
    """
    Ritorna le righe SINGOLE degli stipendi (cg_uscite tipo='STIPENDIO')
    del periodo. Una riga per dipendente.
    V1: NETTO. V1.1 (TODO): lordo + contributi + TFR da buste_paga.

    Schema riga unificato (cfr. _build_breakdown):
      categoria='STAFF', sottocategoria='STIPENDI', tipo_riga='stipendio',
      ref=nome dipendente, descrizione=numero_fattura/cedolino.
    """
    rows = fc_conn.execute("""
        SELECT
            'STAFF'                                        AS categoria,
            'STIPENDI'                                     AS sottocategoria,
            'stipendio'                                    AS tipo_riga,
            id                                             AS id,
            COALESCE(data_pagamento, data_scadenza, data_fattura) AS data,
            COALESCE(numero_fattura, 'Cedolino')           AS descrizione,
            COALESCE(fornitore_nome, '—')                  AS ref,
            COALESCE(totale, 0)                            AS importo
        FROM cg_uscite
        WHERE tipo_uscita = 'STIPENDIO'
          AND periodo_riferimento = ?
        ORDER BY totale DESC, id DESC
    """, (periodo_rif,)).fetchall()
    return [dict(r) for r in rows]


def _build_breakdown(
    righe: list[dict]
) -> tuple[list[dict], float]:
    """
    Trasforma una lista di righe SINGOLE (schema unificato) in struttura
    annidata {categoria → [sottocat → [righe dettaglio]]} con totale.

    Schema riga di input:
      {categoria, sottocategoria, tipo_riga, id, data, descrizione, ref, importo}

    Output per categoria:
      {
        categoria: str, importo: float, num: int,
        sottocategorie: [
          {nome: str, importo: float, num: int, righe: [
            {tipo_riga, id, data, descrizione, ref, importo}
          ]}
        ]
      }
    Ordina categorie e sottocat per importo desc; righe per importo desc.
    """
    # Aggregato per (categoria, sottocategoria)
    grouped: dict[str, dict] = {}
    totale = 0.0
    for r in righe:
        cat = r["categoria"]
        sub = r["sottocategoria"]
        imp = float(r.get("importo") or 0)
        totale += imp

        if cat not in grouped:
            grouped[cat] = {
                "categoria": cat,
                "importo": 0.0,
                "num": 0,
                "_sub_index": {},   # sottocat_nome -> sottocat dict
            }
        cat_node = grouped[cat]
        cat_node["importo"] += imp
        cat_node["num"] += 1

        if sub not in cat_node["_sub_index"]:
            cat_node["_sub_index"][sub] = {
                "nome": sub,
                "importo": 0.0,
                "num": 0,
                "righe": [],
            }
        sub_node = cat_node["_sub_index"][sub]
        sub_node["importo"] += imp
        sub_node["num"] += 1
        sub_node["righe"].append({
            "tipo_riga": r.get("tipo_riga"),
            "id": r.get("id"),
            "data": r.get("data"),
            "descrizione": r.get("descrizione") or "—",
            "ref": r.get("ref") or "—",
            "importo": round(imp, 2),
        })

    # Finalizza: ordina sottocat per importo desc, dropping _sub_index
    out = []
    for cat_node in grouped.values():
        sub_list = sorted(cat_node["_sub_index"].values(), key=lambda s: -s["importo"])
        for s in sub_list:
            s["importo"] = round(s["importo"], 2)
            # righe già inserite ordinate (la query SQL ORDER BY importo DESC);
            # ri-ordino qui per sicurezza (può esserci mix da fonti diverse).
            s["righe"].sort(key=lambda x: -x["importo"])
        out.append({
            "categoria": cat_node["categoria"],
            "importo": round(cat_node["importo"], 2),
            "num": cat_node["num"],
            "sottocategorie": sub_list,
        })

    out.sort(key=lambda x: -x["importo"])
    return out, round(totale, 2)


def compute_pl(
    fc_conn: sqlite3.Connection,
    vendite_conn: sqlite3.Connection,
    anno: int,
    mese: int,
    modalita: str = "competenza",
) -> dict:
    """
    Calcola il Conto Economico per il periodo (anno, mese).

    modalita: 'competenza' (default, v1) | 'cassa' (TODO v1.1 → fallback con warning)
    """
    primo, ultimo, periodo_rif = _range_periodo(anno, mese)
    warnings: list[str] = []

    # Modalità cassa: TODO v1.1 — per ora fallback a competenza con warning
    if modalita == "cassa":
        warnings.append(
            "Modalità 'cassa' non ancora implementata (v1.1). "
            "Visualizzo competenza."
        )
        modalita_effettiva = "competenza"
    else:
        modalita_effettiva = "competenza"

    # ─── 1. RICAVI (vendite_aggregator, già esistente) ─────────────────
    try:
        from app.services.vendite_aggregator import totali_periodo
        v = totali_periodo(vendite_conn, primo, ultimo)
        corrispettivi = float(v.get("totale_corrispettivi", 0) or 0)
    except Exception as e:
        warnings.append(f"Vendite non disponibili: {e}")
        corrispettivi = 0.0

    ricavi_totale = corrispettivi  # In v1 solo corrispettivi POS.
                                   # Fatture vendita clienti → TODO v1.x

    # ─── 2. ACQUISTI righe singole (fatture imponibile) ────────────────
    rows_fatture = _aggregate_fatture_per_categoria(fc_conn, primo, ultimo)
    fatture_count = len(rows_fatture)

    # ─── 3. SPESE FISSE righe singole (da cg_uscite SPESA_FISSA) ───────
    # Modalita 'competenza' esclude RATEIZZAZIONE / RATEIZZAZIONE_TASSE.
    # Modalita 'cassa' include tutto (esborso reale del mese).
    rows_spese_fisse = _aggregate_spese_fisse_per_categoria(
        fc_conn, periodo_rif, modalita=modalita
    )
    spese_fisse_count = len(rows_spese_fisse)

    # ─── 4. STIPENDI righe singole (cg_uscite STIPENDIO, anti-doppio) ──
    rows_stipendi = _aggregate_stipendi(fc_conn, periodo_rif)
    stipendi_count = len(rows_stipendi)

    # ─── 5. UNIFICAZIONE: tutte le righe in un unico flat ──────────────
    # Schema riga: {categoria, sottocategoria, tipo_riga, id, data,
    #               descrizione, ref, importo}
    flat_all = list(rows_fatture) + list(rows_spese_fisse) + list(rows_stipendi)

    # Costo merce: categorie in CATEGORIE_COSTO_MERCE; costi op: tutto il resto.
    rows_costo_merce = [r for r in flat_all if r["categoria"] in CATEGORIE_COSTO_MERCE]
    rows_costi_op = [r for r in flat_all if r["categoria"] not in CATEGORIE_COSTO_MERCE]

    costo_merce_breakdown, costo_merce_tot = _build_breakdown(rows_costo_merce)
    costi_op_breakdown,    costi_op_tot   = _build_breakdown(rows_costi_op)

    # ─── 6. CALCOLO MARGINI + PERCENTUALI SUL TOTALE SPESE ─────────────
    margine_lordo = round(ricavi_totale - costo_merce_tot, 2)
    margine_lordo_pct = (
        round(margine_lordo / ricavi_totale * 100, 1)
        if ricavi_totale > 0 else None
    )

    utile_netto = round(margine_lordo - costi_op_tot, 2)
    utile_netto_pct = (
        round(utile_netto / ricavi_totale * 100, 1)
        if ricavi_totale > 0 else None
    )

    # Totale spese = costo merce + costi operativi (gli stipendi sono inclusi
    # in costi_operativi via categoria STAFF). Marco 2026-05-16: vuole vedere
    # la fetta di costo merce e quella di costi operativi sul totale spese.
    totale_spese = round(costo_merce_tot + costi_op_tot, 2)
    if totale_spese > 0:
        costo_merce_pct_su_spese = round(costo_merce_tot / totale_spese * 100, 1)
        costi_op_pct_su_spese = round(costi_op_tot / totale_spese * 100, 1)
    else:
        costo_merce_pct_su_spese = None
        costi_op_pct_su_spese = None

    # ─── 7. CHECK ANOMALIE ──────────────────────────────────────────────
    # Fatture senza categoria assegnata → segnalazione
    non_cat = next(
        (r for r in costi_op_breakdown if r["categoria"] == "Non categorizzato"),
        None
    )
    if non_cat and non_cat["importo"] > 0:
        warnings.append(
            f"Fatture senza categoria: € {non_cat['importo']} "
            f"({sum(s['num'] for s in non_cat['sottocategorie'])} fatture) "
            f"— mappa i fornitori in Impostazioni Acquisti per accuratezza"
        )

    return {
        "anno": anno,
        "mese": mese,
        "modalita": modalita_effettiva,
        "modalita_richiesta": modalita,
        "periodo_label": _fmt_mese_label(anno, mese),
        "ricavi": {
            "corrispettivi": round(corrispettivi, 2),
            "totale": round(ricavi_totale, 2),
        },
        "costo_merce": {
            "totale": costo_merce_tot,
            "pct_su_spese": costo_merce_pct_su_spese,
            "per_categoria": costo_merce_breakdown,
        },
        "margine_lordo": margine_lordo,
        "margine_lordo_pct": margine_lordo_pct,
        "costi_operativi": {
            "totale": costi_op_tot,
            "pct_su_spese": costi_op_pct_su_spese,
            "per_categoria": costi_op_breakdown,
        },
        "totale_spese": totale_spese,
        "utile_netto": utile_netto,
        "utile_netto_pct": utile_netto_pct,
        "_meta": {
            "fatture_count": fatture_count,
            "spese_fisse_count": spese_fisse_count,
            "stipendi_count": stipendi_count,
            "warnings": warnings,
        },
    }
