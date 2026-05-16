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
    Aggrega fe_fatture per (categoria, sottocategoria) usando imponibile_totale.
    Modalità COMPETENZA (data_fattura nel range).

    Esclude: autofatture, note credito TD04, fatture escluso_acquisti=1.
    """
    rows = fc_conn.execute("""
        SELECT
            COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
            COALESCE(fsub.nome, '—')                   AS sottocategoria,
            COUNT(DISTINCT f.id)                       AS num_fatture,
            COALESCE(SUM(f.imponibile_totale), 0)      AS importo
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
        GROUP BY COALESCE(fcat.nome, 'Non categorizzato'),
                 COALESCE(fsub.nome, '—')
        ORDER BY importo DESC
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

    - In modalità **COMPETENZA**: INCLUSI tipo IN ('PRESTITO', 'TASSA',
      'AFFITTO', 'ASSICURAZIONE', 'ALTRO'). Razionale:
        * PRESTITO/MUTUO = la rata mensile rappresenta gli interessi + quota
          capitale di QUEL mese. Gli interessi sono costo finanziario di
          competenza del mese stesso. Marco 2026-05-16: "prestito ha senso
          tenerlo, competenza resta giusta".
        * TASSA = tassa di competenza del mese (IVA/IRPEF correnti, ecc.).
          IMPORTANTE: se Marco ha tasse PREGRESSE rateizzate (cartelle AdE,
          F24 vecchi rateizzati), DEVE riclassificarle come RATEIZZAZIONE
          dal modulo Spese Fisse, altrimenti gonfiano il P&L mensile. Marco
          2026-05-16: "se la tassa è di quel mese dovrebbe essere inclusa,
          TASSA è flag troppo grossolano". TODO v1.1: aggiungere flag
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
    # Per cartelle pregresse: riclassificare come RATEIZZAZIONE.
    # TODO G.3.x: flag `e_pregresso` per distinzione pulita.
    tipi_esclusi_competenza = ('STIPENDIO', 'RATEIZZAZIONE')
    if modalita == "competenza":
        # Escludi stipendi + rate/prestiti/tasse pregresse
        placeholders = ','.join(['?'] * len(tipi_esclusi_competenza))
        rows = fc_conn.execute(f"""
            SELECT
                COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
                COALESCE(fsub.nome, '—')                   AS sottocategoria,
                COUNT(u.id)                                AS num_uscite,
                COALESCE(SUM(u.totale), 0)                 AS importo
            FROM cg_uscite u
            LEFT JOIN cg_spese_fisse     sf   ON u.spesa_fissa_id     = sf.id
            LEFT JOIN fe_categorie       fcat ON sf.categoria_id      = fcat.id
            LEFT JOIN fe_sottocategorie  fsub ON sf.sottocategoria_id = fsub.id
            WHERE u.tipo_uscita = 'SPESA_FISSA'
              AND u.periodo_riferimento = ?
              AND COALESCE(sf.tipo, '') NOT IN ({placeholders})
            GROUP BY COALESCE(fcat.nome, 'Non categorizzato'),
                     COALESCE(fsub.nome, '—')
            ORDER BY importo DESC
        """, (periodo_rif, *tipi_esclusi_competenza)).fetchall()
    else:
        # Modalità cassa: esclude solo stipendi (resto = esborso reale del mese)
        rows = fc_conn.execute("""
            SELECT
                COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
                COALESCE(fsub.nome, '—')                   AS sottocategoria,
                COUNT(u.id)                                AS num_uscite,
                COALESCE(SUM(u.totale), 0)                 AS importo
            FROM cg_uscite u
            LEFT JOIN cg_spese_fisse     sf   ON u.spesa_fissa_id     = sf.id
            LEFT JOIN fe_categorie       fcat ON sf.categoria_id      = fcat.id
            LEFT JOIN fe_sottocategorie  fsub ON sf.sottocategoria_id = fsub.id
            WHERE u.tipo_uscita = 'SPESA_FISSA'
              AND u.periodo_riferimento = ?
              AND COALESCE(sf.tipo, '') != 'STIPENDIO'
            GROUP BY COALESCE(fcat.nome, 'Non categorizzato'),
                     COALESCE(fsub.nome, '—')
            ORDER BY importo DESC
        """, (periodo_rif,)).fetchall()
    return [dict(r) for r in rows]


def _aggregate_stipendi(
    fc_conn: sqlite3.Connection, periodo_rif: str
) -> dict:
    """
    Aggrega gli stipendi (cg_uscite tipo='STIPENDIO') per il periodo.
    V1: somma dei NETTI. V1.1 (TODO): lordo + contributi + TFR da buste_paga.

    Ritorna: {categoria: 'STAFF', sottocategoria: 'STIPENDI', importo, num_dipendenti}
    """
    row = fc_conn.execute("""
        SELECT
            COUNT(*)                       AS num_dipendenti,
            COALESCE(SUM(totale), 0)       AS importo
        FROM cg_uscite
        WHERE tipo_uscita = 'STIPENDIO'
          AND periodo_riferimento = ?
    """, (periodo_rif,)).fetchone()

    return {
        "categoria": "STAFF",
        "sottocategoria": "STIPENDI",
        "num_dipendenti": row["num_dipendenti"],
        "importo": float(row["importo"] or 0),
    }


def _build_breakdown(
    rows: list[dict], importo_key: str = "importo"
) -> tuple[list[dict], float]:
    """
    Trasforma le righe flat in struttura {categoria → [sottocat]} con totale.

    Output: (lista categorie con sottocat dentro, totale_assoluto)
    """
    grouped: dict[str, dict] = {}
    totale = 0.0
    for r in rows:
        cat = r["categoria"]
        imp = float(r.get(importo_key, 0) or 0)
        if cat not in grouped:
            grouped[cat] = {
                "categoria": cat,
                "importo": 0.0,
                "sottocategorie": [],
            }
        grouped[cat]["sottocategorie"].append({
            "nome": r["sottocategoria"],
            "importo": round(imp, 2),
            "num": r.get("num_fatture") or r.get("num_uscite") or 0,
        })
        grouped[cat]["importo"] += imp
        totale += imp

    out = sorted(
        ({**v, "importo": round(v["importo"], 2)} for v in grouped.values()),
        key=lambda x: -x["importo"]
    )
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

    # ─── 2. ACQUISTI per categoria (fatture imponibile) ────────────────
    rows_fatture = _aggregate_fatture_per_categoria(fc_conn, primo, ultimo)
    fatture_count = sum(r["num_fatture"] for r in rows_fatture)

    # ─── 3. SPESE FISSE per categoria (da cg_uscite SPESA_FISSA) ───────
    # Modalita 'competenza' esclude RATEIZZAZIONE (obblighi pregressi).
    # Modalita 'cassa' include tutto (esborso reale del mese).
    rows_spese_fisse = _aggregate_spese_fisse_per_categoria(
        fc_conn, periodo_rif, modalita=modalita
    )
    spese_fisse_count = sum(r["num_uscite"] for r in rows_spese_fisse)

    # ─── 4. STIPENDI (cg_uscite STIPENDIO, fonte unica anti-doppio) ────
    stipendi = _aggregate_stipendi(fc_conn, periodo_rif)

    # ─── 5. UNIFICAZIONE PER CATEGORIA ──────────────────────────────────
    # Unisco fatture + spese fisse + stipendi in un unico flow flat,
    # poi splitto per (costo_merce vs costi_operativi).
    flat_all = list(rows_fatture) + list(rows_spese_fisse)

    # Aggiungo stipendi come riga sintetica (se >0)
    if stipendi["importo"] > 0:
        flat_all.append({
            "categoria": stipendi["categoria"],
            "sottocategoria": stipendi["sottocategoria"],
            "num_fatture": stipendi["num_dipendenti"],
            "importo": stipendi["importo"],
        })

    # Costo merce: solo categorie in CATEGORIE_COSTO_MERCE
    rows_costo_merce = [r for r in flat_all if r["categoria"] in CATEGORIE_COSTO_MERCE]
    # Costi operativi: tutto il resto (incluso "Non categorizzato")
    rows_costi_op = [r for r in flat_all if r["categoria"] not in CATEGORIE_COSTO_MERCE]

    costo_merce_breakdown, costo_merce_tot = _build_breakdown(rows_costo_merce)
    costi_op_breakdown,    costi_op_tot   = _build_breakdown(rows_costi_op)

    # ─── 6. CALCOLO MARGINI ─────────────────────────────────────────────
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
            "per_categoria": costo_merce_breakdown,
        },
        "margine_lordo": margine_lordo,
        "margine_lordo_pct": margine_lordo_pct,
        "costi_operativi": {
            "totale": costi_op_tot,
            "per_categoria": costi_op_breakdown,
        },
        "utile_netto": utile_netto,
        "utile_netto_pct": utile_netto_pct,
        "_meta": {
            "fatture_count": fatture_count,
            "spese_fisse_count": spese_fisse_count,
            "stipendi_count": stipendi["num_dipendenti"],
            "warnings": warnings,
        },
    }
