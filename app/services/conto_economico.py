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

GERARCHIA DI CATEGORIZZAZIONE (Marco 2026-05-16, dopo bug fix):
  Il CE considera la categoria di ogni RIGA della fattura, non solo del
  fornitore intero. Gerarchia di fallback:
    1. fe_righe.categoria_id              (categoria della singola voce)
    2. fe_fornitore_categoria.cat_id      (categoria globale fornitore)
    3. 'Non categorizzato'                (davvero non assegnato)
  Una fattura con righe in più categorie viene SPEZZATA nel CE (es.
  Sogegross 475€ → 5,99 MATERIE PRIME + 35,76 BEVANDE + ... + non cat).

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
    Aggrega le righe delle fatture (fe_righe) nel periodo, raggruppate per
    (fattura, categoria_riga). Modalità COMPETENZA (data_fattura nel range).

    GERARCHIA DI CATEGORIZZAZIONE (Marco 2026-05-16, bug fix):
      1. fe_righe.categoria_id          → categoria della SINGOLA RIGA (granulare)
      2. fe_fornitore_categoria.cat_id  → categoria globale del FORNITORE (fallback)
      3. 'Non categorizzato'            → davvero non assegnato

    Storia del bug: fino al 2026-05-16 il CE aggregava solo per (1.) della
    categoria fornitore. Risultato: fornitori con righe già categorizzate ma
    senza categoria a livello fornitore (es. A2A Energia → 62 righe UTENZE
    ma categoria_id NULL sul fornitore perché era stato 'escluso ricette')
    finivano tutti in 'Non categorizzato'. Per Aprile 2026: € 3.408 di costi
    UTENZE/MATERIE PRIME/BEVANDE classificati erroneamente come orfani.

    Esclude: autofatture, note credito TD04, fornitore escluso_acquisti=1.

    Una fattura con righe in N categorie diverse produce N entry (spezzata).
    L'`id` ritornato è f.id (fattura intera) per permettere il deep-link su
    /acquisti/dettaglio/:id dove Marco può rifinire le singole righe.

    Schema riga di output (cfr. _build_breakdown):
      {categoria, sottocategoria, tipo_riga, id, spesa_fissa_id, data,
       descrizione, ref, importo}
    """
    # G.3.1b (Marco 2026-05-16): competenza override.
    # Una fattura può avere `competenza_anno_mese` valorizzato (YYYY-MM): se sì,
    # quella è la sua competenza P&L, indipendentemente da data_fattura. Altrimenti
    # fallback a strftime('%Y-%m', data_fattura) come default. Pattern di
    # tabella simile a `periodo_riferimento` su `cg_uscite` (stipendi).
    # `periodo_rif` è la stringa 'YYYY-MM' del periodo richiesto.
    periodo_rif = primo[:7]  # primo = 'YYYY-MM-01'
    # NB: il check tollera DB legacy senza la colonna (try/except + fallback).
    has_competenza_col = any(
        r[1] == "competenza_anno_mese"
        for r in fc_conn.execute("PRAGMA table_info(fe_fatture)").fetchall()
    )
    competenza_clause = (
        "COALESCE(f.competenza_anno_mese, strftime('%Y-%m', f.data_fattura)) = ?"
        if has_competenza_col
        else "strftime('%Y-%m', f.data_fattura) = ?"
    )
    rows = fc_conn.execute(f"""
        SELECT
            COALESCE(fcat_riga.nome, fcat_forn.nome, 'Non categorizzato') AS categoria,
            COALESCE(fsub_riga.nome, fsub_forn.nome, '—')                 AS sottocategoria,
            'fattura'                                                     AS tipo_riga,
            f.id                                                          AS id,
            NULL                                                          AS spesa_fissa_id,
            f.data_fattura                                                AS data,
            COALESCE(f.numero_fattura, '—')                               AS descrizione,
            COALESCE(f.fornitore_nome, '—')                               AS ref,
            COALESCE(SUM(r.prezzo_totale), 0)                             AS importo
        FROM fe_fatture f
        JOIN fe_righe r ON r.fattura_id = f.id
        LEFT JOIN fe_fornitore_categoria ffc
               ON f.fornitore_piva = ffc.fornitore_piva
        LEFT JOIN fe_categorie       fcat_riga ON r.categoria_id     = fcat_riga.id
        LEFT JOIN fe_sottocategorie  fsub_riga ON r.sottocategoria_id = fsub_riga.id
        LEFT JOIN fe_categorie       fcat_forn ON ffc.categoria_id   = fcat_forn.id
        LEFT JOIN fe_sottocategorie  fsub_forn ON ffc.sottocategoria_id = fsub_forn.id
        WHERE {competenza_clause}
          AND COALESCE(f.is_autofattura, 0) = 0
          AND COALESCE(f.tipo_documento, 'TD01') NOT IN ('TD04')
          -- escluso_acquisti vive su fe_fornitore_categoria (CLAUDE.md regola critica),
          -- NON su fe_fatture. Bug fix 2026-05-16 (Marco "load failed" CE).
          AND COALESCE(ffc.escluso_acquisti, 0) = 0
        GROUP BY f.id,
                 COALESCE(fcat_riga.nome, fcat_forn.nome, 'Non categorizzato'),
                 COALESCE(fsub_riga.nome, fsub_forn.nome, '—')
        ORDER BY f.data_fattura DESC, importo DESC, f.id DESC
    """, (periodo_rif,)).fetchall()
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
    # F24_STIPENDI: il versamento mensile F24 stipendi (IRPEF dipendenti +
    # INPS dipendenti + addizionali + INAIL) è già conteggiato nel costo
    # aziendale completo della modalità "completo" (dipendenti_costo_consuntivo,
    # via ELAB pagina 8). Escluderlo in competenza evita doppio conteggio.
    # In cassa resta visibile come esborso reale (16 del mese successivo).
    # TODO G.3.x: flag `e_pregresso` per distinzione pulita.
    tipi_esclusi_competenza = (
        'STIPENDIO',
        'RATEIZZAZIONE',
        'RATEIZZAZIONE_TASSE',
        'F24_STIPENDI',
    )
    if modalita == "competenza":
        # Escludi stipendi + rate/prestiti/tasse pregresse
        placeholders = ','.join(['?'] * len(tipi_esclusi_competenza))
        rows = fc_conn.execute(f"""
            SELECT
                COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
                COALESCE(fsub.nome, '—')                   AS sottocategoria,
                'spesa_fissa'                              AS tipo_riga,
                u.id                                       AS id,
                u.spesa_fissa_id                           AS spesa_fissa_id,
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
        # Modalità cassa: esclude solo STIPENDIO da cg_spese_fisse perché
        # i netti reali vengono dal flow stipendi (cg_uscite STIPENDIO o
        # dipendenti_costo_consuntivo). F24_STIPENDI invece RESTA visibile
        # perché è il pagamento reale del 16 del mese successivo.
        # RATEIZZAZIONE/RATEIZZAZIONE_TASSE/PRESTITO/TASSA tutti inclusi
        # (esborso reale del mese).
        rows = fc_conn.execute("""
            SELECT
                COALESCE(fcat.nome, 'Non categorizzato')   AS categoria,
                COALESCE(fsub.nome, '—')                   AS sottocategoria,
                'spesa_fissa'                              AS tipo_riga,
                u.id                                       AS id,
                u.spesa_fissa_id                           AS spesa_fissa_id,
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
    fc_conn: sqlite3.Connection,
    periodo_rif: str,
    dip_conn: Optional[sqlite3.Connection] = None,
    anno: Optional[int] = None,
    mese: Optional[int] = None,
) -> tuple[list[dict], dict]:
    """
    Ritorna le righe del costo personale per il periodo + meta info.

    DUE MODALITÀ (G.3 Fase E, Marco 2026-05-16):

    1. **Costo completo** (preferita): se per il (anno, mese) esistono
       record in `dipendenti_costo_consuntivo` (dipendenti.sqlite3, popolato
       dall'import ELAB.pdf), legge il COSTO AZIENDALE VERO per dipendente
       (lordo + contributi ditta + ratei 13a/14a/ferie + TFR + INAIL).

    2. **Fallback netti**: se la tabella consuntivo è vuota per quel mese
       (o dip_conn non fornito), ritorna i NETTI bonificati da
       `cg_uscite tipo='STIPENDIO'` come prima (comportamento pre-Fase E).
       In questo caso un warning segnala il "costo personale parziale".

    Schema riga unificato (cfr. _build_breakdown):
      categoria='STAFF',
      sottocategoria='STIPENDI' | 'INAIL' (riga sintetica INAIL azienda),
      tipo_riga='costo_consuntivo' | 'stipendio' (fallback),
      ref=cognome_nome dipendente, descrizione=fonte.

    Ritorna (righe, meta) dove meta = {
        "modalita_costo": "completo" | "netti_fallback",
        "fonte": "dipendenti_costo_consuntivo" | "cg_uscite",
        "warnings": [str, ...],
    }
    """
    warnings: list[str] = []
    rows: list[dict] = []

    # ── Tentativo: leggi da dipendenti_costo_consuntivo (modalità completo) ──
    consuntivo_disponibile = False
    if dip_conn is not None and anno is not None and mese is not None:
        try:
            # Verifica esistenza tabella (potrebbe non esistere su DB legacy)
            t = dip_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name='dipendenti_costo_consuntivo'"
            ).fetchone()
            if t is not None:
                # Conta record per il mese
                n = dip_conn.execute(
                    "SELECT COUNT(*) FROM dipendenti_costo_consuntivo "
                    "WHERE anno=? AND mese=?",
                    (anno, mese)
                ).fetchone()[0]
                consuntivo_disponibile = (n > 0)
        except sqlite3.Error:
            consuntivo_disponibile = False

    if consuntivo_disponibile:
        # ── Modalità "completo" — spezza il costo aziendale in 4 sottocategorie ──
        # Marco 2026-05-16: vuole vedere chiaramente quanto è il netto bonificato
        # vs le altre voci del costo personale. Spacca STAFF in:
        #   NETTI BONIFICATI            = quanto esce dal conto del datore verso
        #                                 i dipendenti (LUL.netto; fallback cg_uscite;
        #                                 fallback stima 80% del lordo ELAB)
        #   CONTRIBUTI INPS AZIENDA     = ELAB.contributi_lordo + contributi_su_ratei
        #                                 (carico ditta versato via F24 DM10)
        #   TRATTENUTE + RATEI + TFR    = costo_totale - netto - carico_ditta
        #                                 = trattenute fisco dipendente (IRPEF+INPS dip+add)
        #                                 + ratei 13ª/14ª/ferie + TFR maturato
        #   INAIL                       = riga sintetica matricola='AZIENDA'
        #                                 (premio mensile azienda)
        # GARANZIA: la somma delle 4 sottocategorie per ogni dipendente coincide
        # ESATTAMENTE col costo_totale_azienda dell'ELAB (al centesimo).
        # ELAB.lordo include solo paga ordinaria+straord (NON ratei),
        # quindi non possiamo fare semplice trattenute=lordo-netto.
        date_first = f"{anno:04d}-{mese:02d}-01"

        # Pre-fetch netti dal LUL (buste_paga) per dipendente_id
        netti_lul: dict[int, float] = {}
        if dip_conn is not None:
            try:
                for nr in dip_conn.execute(
                    "SELECT dipendente_id, netto FROM buste_paga "
                    "WHERE anno=? AND mese=? AND dipendente_id IS NOT NULL",
                    (anno, mese)
                ).fetchall():
                    if nr["dipendente_id"] is not None and nr["netto"] is not None:
                        netti_lul[nr["dipendente_id"]] = float(nr["netto"])
            except sqlite3.Error:
                pass

        # Pre-fetch netti da cg_uscite STIPENDIO (fallback per chi non ha LUL)
        netti_cg: dict[str, float] = {}  # chiave = cognome_nome upper
        try:
            for nr in fc_conn.execute(
                "SELECT fornitore_nome, totale FROM cg_uscite "
                "WHERE tipo_uscita='STIPENDIO' AND periodo_riferimento=?",
                (periodo_rif,)
            ).fetchall():
                fn = (nr["fornitore_nome"] or "").upper()
                # cg_uscite ha "Stipendio - Cognome Nome" → estraggo nome dopo "Stipendio - "
                if "STIPENDIO - " in fn:
                    fn = fn.replace("STIPENDIO - ", "")
                netti_cg[fn] = float(nr["totale"] or 0)
        except sqlite3.Error:
            pass

        # G.3 Fase E + flag is_amministratore (mig 134, 2026-05-16):
        # JOIN su dipendenti per leggere `is_amministratore` e discriminare
        # STAFF vs AMMINISTRATORI nel CE. LEFT JOIN così i record orfani
        # (dipendente_id NULL) restano in STAFF di default.
        has_is_amm_col = False
        try:
            has_is_amm_col = any(
                c[1] == "is_amministratore"
                for c in dip_conn.execute("PRAGMA table_info(dipendenti)").fetchall()
            )
        except sqlite3.Error:
            pass
        amm_join = (
            "LEFT JOIN dipendenti d ON dcc.dipendente_id = d.id" if has_is_amm_col else ""
        )
        amm_select = (
            ", COALESCE(d.is_amministratore, 0) AS is_amministratore"
            if has_is_amm_col else ", 0 AS is_amministratore"
        )
        for r in dip_conn.execute(f"""
            SELECT dcc.id, dcc.matricola, dcc.cognome_nome, dcc.costo_totale,
                   dcc.inail_mese, dcc.retribuzione_lorda, dcc.contributi_lordo,
                   dcc.ratei_importo, dcc.contributi_su_ratei, dcc.tfr_maturato,
                   dcc.dipendente_id
                   {amm_select}
            FROM dipendenti_costo_consuntivo dcc
            {amm_join}
            WHERE dcc.anno=? AND dcc.mese=?
            ORDER BY dcc.costo_totale DESC, dcc.matricola
        """, (anno, mese)).fetchall():
            r = dict(r)
            is_azienda = (r["matricola"] or "").upper() == "AZIENDA"
            # Categoria CE: AMMINISTRATORI se flag, altrimenti STAFF (default)
            cat_ce = "AMMINISTRATORI" if r.get("is_amministratore") else "STAFF"

            if is_azienda:
                # Riga INAIL azienda — singola sottocategoria INAIL.
                # NB: l'INAIL azienda è sull'intera ditta, lo lasciamo sempre
                # sotto STAFF (è un premio assicurativo che copre tutti i
                # subordinati; gli amministratori non hanno INAIL).
                rows.append({
                    "categoria": "STAFF",
                    "sottocategoria": "INAIL",
                    "tipo_riga": "costo_consuntivo",
                    "id": r["id"],
                    "spesa_fissa_id": None,
                    "data": date_first,
                    "descrizione": "INAIL azienda",
                    "ref": r["cognome_nome"] or "—",
                    "importo": round(float(r["inail_mese"] or 0), 2),
                })
                continue

            # Dipendente: ricava il netto bonificato
            lordo_elab = float(r["retribuzione_lorda"] or 0)
            costo_totale = float(r["costo_totale"] or 0)

            # Cerco netto in priorità: LUL → cg_uscite → fallback 80% lordo
            netto = None
            if r["dipendente_id"] is not None:
                netto = netti_lul.get(r["dipendente_id"])
            if netto is None:
                netto = netti_cg.get((r["cognome_nome"] or "").upper())
                # Prova anche ordine invertito (cg_uscite ha spesso "Nome Cognome")
                if netto is None:
                    cn_parts = (r["cognome_nome"] or "").strip().upper().split()
                    if len(cn_parts) >= 2:
                        inverted = " ".join(reversed(cn_parts))
                        netto = netti_cg.get(inverted)
            if netto is None and lordo_elab > 0:
                netto = round(lordo_elab * 0.80, 2)  # stima fallback
            if netto is None:
                netto = 0.0

            # Carico ditta = contributi su lordo + contributi su ratei
            carico_ditta = round(
                float(r["contributi_lordo"] or 0)
                + float(r["contributi_su_ratei"] or 0),
                2,
            )

            # RESIDUO = costo_totale - netto - carico_ditta
            # Contiene: trattenute fisco al dipendente (IRPEF+INPS dip+add)
            # + ratei 13ª/14ª/ferie + TFR maturato.
            # GARANTITO che la somma quadri al centesimo (è una sottrazione).
            residuo = round(costo_totale - netto - carico_ditta, 2)

            ref = r["cognome_nome"] or "—"
            id_base = r["id"]

            # 3 righe sintetiche per dipendente (somma = costo_totale)
            componenti = [
                ("NETTI BONIFICATI", "Bonifico mensile al dipendente", netto),
                ("CONTRIBUTI INPS", "Carico ditta INPS — versato via F24 DM10", carico_ditta),
                ("F24 + RATEI + TFR", "Trattenute fisco dip + ratei 13ª/14ª/ferie + TFR", residuo),
            ]
            for sottocat, descr, importo in componenti:
                if abs(importo) < 0.01:
                    continue  # skip componenti azzerati (es. Panichi cost 0,10)
                rows.append({
                    "categoria": cat_ce,  # STAFF o AMMINISTRATORI (mig 134)
                    "sottocategoria": sottocat,
                    "tipo_riga": "costo_consuntivo",
                    "id": id_base,
                    "spesa_fissa_id": None,
                    "data": date_first,
                    "descrizione": descr,
                    "ref": ref,
                    "importo": round(float(importo), 2),
                })

        meta = {
            "modalita_costo": "completo",
            "fonte": "dipendenti_costo_consuntivo",
            "warnings": [],
        }
        return rows, meta

    # ── Modalità "fallback netti" (comportamento pre-Fase E) ──
    for r in fc_conn.execute("""
        SELECT
            'STAFF'                                        AS categoria,
            'STIPENDI'                                     AS sottocategoria,
            'stipendio'                                    AS tipo_riga,
            id                                             AS id,
            NULL                                           AS spesa_fissa_id,
            COALESCE(data_pagamento, data_scadenza, data_fattura) AS data,
            COALESCE(numero_fattura, 'Cedolino')           AS descrizione,
            COALESCE(fornitore_nome, '—')                  AS ref,
            COALESCE(totale, 0)                            AS importo
        FROM cg_uscite
        WHERE tipo_uscita = 'STIPENDIO'
          AND periodo_riferimento = ?
        ORDER BY totale DESC, id DESC
    """, (periodo_rif,)).fetchall():
        rows.append(dict(r))

    # Warning solo se ci sono dati di stipendio nel mese (altrimenti
    # potrebbe essere mese vuoto, niente da segnalare)
    if rows:
        warnings.append(
            "Costo personale parziale per questo mese: ELAB del consulente paghe "
            "non ancora importato → mostrati solo i netti bonificati. "
            "Mancano carico ditta INPS + ratei 13ª/14ª/ferie + TFR + INAIL "
            "(~+70% sul costo reale)."
        )

    meta = {
        "modalita_costo": "netti_fallback",
        "fonte": "cg_uscite",
        "warnings": warnings,
    }
    return rows, meta


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
            "spesa_fissa_id": r.get("spesa_fissa_id"),
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
    dip_conn: Optional[sqlite3.Connection] = None,
) -> dict:
    """
    Calcola il Conto Economico per il periodo (anno, mese).

    modalita: 'competenza' (default, v1) | 'cassa' (TODO v1.1 → fallback con warning)
    dip_conn (G.3 Fase E, 2026-05-16): connessione opzionale a dipendenti.sqlite3.
        Se passata e per (anno, mese) esistono record in
        dipendenti_costo_consuntivo (popolato dall'import ELAB.pdf), il costo
        del personale è il "costo aziendale completo" (lordo + carico ditta
        + ratei + TFR + INAIL). Altrimenti fallback netti bonificati con
        warning "costo personale parziale" — comportamento pre-Fase E.
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
    # Una fattura con righe in N categorie diverse produce N entry: per il
    # counter logico contiamo le fatture DISTINTE (per id), non gli split.
    rows_fatture = _aggregate_fatture_per_categoria(fc_conn, primo, ultimo)
    fatture_count = len({r["id"] for r in rows_fatture})

    # ─── 3. SPESE FISSE righe singole (da cg_uscite SPESA_FISSA) ───────
    # Modalita 'competenza' esclude RATEIZZAZIONE / RATEIZZAZIONE_TASSE.
    # Modalita 'cassa' include tutto (esborso reale del mese).
    rows_spese_fisse = _aggregate_spese_fisse_per_categoria(
        fc_conn, periodo_rif, modalita=modalita
    )
    spese_fisse_count = len(rows_spese_fisse)

    # ─── 4. STIPENDI righe singole (cg_uscite STIPENDIO, anti-doppio) ──
    # G.3 Fase E: passa dip_conn + anno/mese — l'aggregator decide se usare
    # costo aziendale completo (dipendenti_costo_consuntivo) o fallback netti.
    rows_stipendi, stipendi_meta = _aggregate_stipendi(
        fc_conn, periodo_rif, dip_conn=dip_conn, anno=anno, mese=mese
    )
    stipendi_count = len(rows_stipendi)
    # Propaga warning "costo parziale" se eventualmente presente
    warnings.extend(stipendi_meta.get("warnings", []))

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
    # in costi_operativi via categoria STAFF). Mantenuto per uso interno
    # / barra di ripartizione, ma le percentuali primarie sono sui RICAVI
    # (convenzione standard della ristorazione: food cost % = costo merce
    # / ricavi del mese; un food cost sano è 28-35%).
    # Marco 2026-05-16: "il food cost si calcola sui ricavi".
    totale_spese = round(costo_merce_tot + costi_op_tot, 2)
    if ricavi_totale > 0:
        costo_merce_pct_su_ricavi = round(costo_merce_tot / ricavi_totale * 100, 1)
        costi_op_pct_su_ricavi = round(costi_op_tot / ricavi_totale * 100, 1)
    else:
        costo_merce_pct_su_ricavi = None
        costi_op_pct_su_ricavi = None

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
            "pct_su_ricavi": costo_merce_pct_su_ricavi,
            "per_categoria": costo_merce_breakdown,
        },
        "margine_lordo": margine_lordo,
        "margine_lordo_pct": margine_lordo_pct,
        "costi_operativi": {
            "totale": costi_op_tot,
            "pct_su_ricavi": costi_op_pct_su_ricavi,
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
            # G.3 Fase E: trasparenza sulla qualità del dato personale.
            # "modalita_costo": "completo" → costo aziendale vero da ELAB.
            # "modalita_costo": "netti_fallback" → solo netti bonificati.
            # Il frontend usa questo per nascondere il warning banner.
            "costo_personale": {
                "modalita": stipendi_meta.get("modalita_costo"),
                "fonte": stipendi_meta.get("fonte"),
            },
        },
    }
