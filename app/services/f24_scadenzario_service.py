# Modulo: controllo_gestione (scadenzario) — chiamato dall'import paghe del modulo dipendenti — [core]
# @version: v1.0 (2026-10-16)
# -*- coding: utf-8 -*-
"""
F24 paghe → Scadenzario del Controllo di Gestione.

Servizio platform (CLAUDE.md regola 4): il router Dipendenti non scrive da sé
in cg_*; passa da qui.

Modello (decisione Marco 16/10/2026):
  - una spesa fissa «F24 paghe», tipo F24_STIPENDI, mensile. Il suo importo è
    solo la STIMA per i mesi futuri non ancora caricati (= saldo dell'ultimo
    F24 paghe importato); la generazione delle spese fisse la proietta dopo
    l'ultima rata del piano.
  - per ogni delega (pagina del PDF) con SALDO FINALE > 0: una rata del piano
    (cg_piano_rate) + la sua uscita (cg_uscite SPESA_FISSA), con la data
    stampata sul modello e il PDF collegato (cg_uscite.allegato_url).
    Periodo della rata = mese della SCADENZA ("2026-10"); più deleghe nello
    stesso mese → "2026-10-r2", "-r3" (formato già gestito dal generatore).
  - pagine a saldo 0 = compensazioni: nessuna rata.
  - F24 tutto a zero: una rata da 0 €, già chiusa (PAGATO_MANUALE), nota
    «F24 tutto compensato», così il mese non sembra mancante.
  - F24 non paghe (IVA, ravvedimenti, rate ADER): nessuna rata, si inseriscono
    a mano dalle Spese Fisse.

Conto Economico: F24_STIPENDI è escluso in competenza (il costo è già
nell'ELAB) e in cassa conta solo quando è pagato (conto_economico.py).

Ricaricare lo stesso PDF (stesso hash) aggiorna le stesse rate, non ne crea
di nuove. Le rate già pagate o gestite a mano (stati diversi da
PROGRAMMATO/SCADUTO) non vengono toccate: torna un avviso.
"""
from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Optional

TIPO_SF = "F24_STIPENDI"
TITOLO_SF_DEFAULT = "F24 paghe"

MESI_IT = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
           "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]

STATI_DERIVATI = ("PROGRAMMATO", "SCADUTO")


def _ora() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_spesa_fissa(fc: sqlite3.Connection, data_scadenza: str) -> dict:
    row = fc.execute(
        "SELECT * FROM cg_spese_fisse WHERE tipo = ? ORDER BY attiva DESC, id LIMIT 1",
        (TIPO_SF,),
    ).fetchone()
    if row:
        return dict(row)
    giorno = int(data_scadenza[8:10]) if data_scadenza else None
    fc.execute("""
        INSERT INTO cg_spese_fisse
            (tipo, titolo, descrizione, importo, frequenza, giorno_scadenza,
             data_inizio, attiva, note, created_at, updated_at)
        VALUES (?, ?, ?, 0, 'MENSILE', ?, ?, 1, ?, ?, ?)
    """, (
        TIPO_SF, TITOLO_SF_DEFAULT,
        "Contributi INPS, ritenute IRPEF e addizionali dei cedolini",
        giorno, data_scadenza,
        "Le rate le scrive l'import ELAB / F24 (Dipendenti › Buste paga): una per "
        "ogni pagina con saldo > 0. L'importo qui è solo la stima dei mesi futuri.",
        _ora(), _ora(),
    ))
    return dict(fc.execute("SELECT * FROM cg_spese_fisse WHERE id = last_insert_rowid()").fetchone())


def _periodo_libero(fc, sf_id: int, base: str) -> str:
    """Primo periodo libero del mese: "YYYY-MM", poi "YYYY-MM-r2", "-r3"…
    (le pagine già registrate riusano il loro periodo: vedi registra_f24)"""
    occupati = {r[0] for r in fc.execute(
        "SELECT periodo FROM cg_piano_rate WHERE spesa_fissa_id = ? AND substr(periodo,1,7) = ?",
        (sf_id, base),
    ).fetchall()}
    if base not in occupati:
        return base
    n = 2
    while f"{base}-r{n}" in occupati:
        n += 1
    return f"{base}-r{n}"


def _rinumera_piano(fc, sf_id: int) -> None:
    rows = fc.execute("""
        SELECT id FROM cg_piano_rate WHERE spesa_fissa_id = ?
        ORDER BY COALESCE(data_scadenza_specifica, periodo), periodo
    """, (sf_id,)).fetchall()
    for i, r in enumerate(rows, 1):
        fc.execute("UPDATE cg_piano_rate SET numero_rata = ? WHERE id = ?", (i, r[0]))


def _aggiorna_stima(fc, sf_id: int) -> Optional[float]:
    """Importo della spesa fissa = saldo da pagare dell'ultimo F24 paghe caricato."""
    r = fc.execute("""
        SELECT fonte_hash, MAX(data_scadenza) AS scad,
               SUM(CASE WHEN saldo_finale > 0 THEN saldo_finale ELSE 0 END) AS tot
          FROM f24_deleghe
         WHERE tipo_f24 = 'PAGHE'
         GROUP BY fonte_hash
         ORDER BY scad DESC
         LIMIT 1
    """).fetchone()
    if not r:
        return None
    tot = round(r["tot"] or 0, 2)
    fc.execute("UPDATE cg_spese_fisse SET importo = ?, updated_at = ? WHERE id = ?", (tot, _ora(), sf_id))
    return tot


def registra_f24(fc: sqlite3.Connection, parsed: dict, file_path: Optional[str],
                 allegato_url: Optional[str]) -> dict:
    """Registra le deleghe di un F24 parsato (f24_parser v1.1) in f24_deleghe e,
    se è un F24 paghe, ne crea/aggiorna le rate nello Scadenzario.
    Non fa commit: lo fa il chiamante."""
    fonte_hash = parsed.get("fonte_hash")
    fonte_pdf = parsed.get("fonte_pdf")
    tipo = parsed.get("tipo_f24") or "ALTRO"
    deleghe = parsed.get("deleghe") or []
    oggi = date.today().isoformat()
    esito = {"tipo_f24": tipo, "saldo_da_pagare": parsed.get("saldo_da_pagare"),
             "rate_create": 0, "rate_aggiornate": 0, "rate_non_toccate": 0,
             "rate": [], "avvisi": []}

    precedenti = {r["pagina_pdf"]: dict(r) for r in fc.execute(
        "SELECT * FROM f24_deleghe WHERE fonte_hash = ?", (fonte_hash,)).fetchall()}

    def _salva_delega(d, sf_id=None, periodo=None, uscita_id=None):
        fc.execute("""
            INSERT INTO f24_deleghe
                (fonte_hash, fonte_pdf, pagina_pdf, tipo_f24, data_scadenza,
                 anno_competenza, mese_competenza, saldo_finale, file_path,
                 spesa_fissa_id, periodo_piano, cg_uscita_id, importato_il)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fonte_hash, pagina_pdf) DO UPDATE SET
                fonte_pdf = excluded.fonte_pdf, tipo_f24 = excluded.tipo_f24,
                data_scadenza = excluded.data_scadenza,
                anno_competenza = excluded.anno_competenza,
                mese_competenza = excluded.mese_competenza,
                saldo_finale = excluded.saldo_finale,
                file_path = COALESCE(excluded.file_path, f24_deleghe.file_path),
                spesa_fissa_id = excluded.spesa_fissa_id,
                periodo_piano = excluded.periodo_piano,
                cg_uscita_id = excluded.cg_uscita_id,
                importato_il = excluded.importato_il
        """, (fonte_hash, fonte_pdf, d["pagina_pdf"], tipo, d.get("data_scadenza"),
              d.get("anno_competenza"), d.get("mese_competenza"), d.get("saldo_finale"),
              file_path, sf_id, periodo, uscita_id, _ora()))

    if tipo != "PAGHE":
        for d in deleghe:
            _salva_delega(d)
        esito["avvisi"].append(
            "F24 non paghe (né DM10 né 1001): nessuna rata creata. "
            "Inseriscilo a mano dalle Spese Fisse (Una tantum o Rateizzazione).")
        return esito

    scadenze = [d.get("data_scadenza") for d in deleghe if d.get("data_scadenza")]
    if not scadenze:
        for d in deleghe:
            _salva_delega(d)
        esito["avvisi"].append("Data di scadenza non letta nel PDF: nessuna rata creata.")
        return esito

    sf = _ensure_spesa_fissa(fc, min(scadenze))
    sf_id = sf["id"]

    # Mese paghe (competenza) per la nota: il più frequente fra le deleghe
    comp = [(d.get("anno_competenza"), d.get("mese_competenza")) for d in deleghe
            if d.get("anno_competenza") and d.get("mese_competenza")]
    paghe_label = ""
    if comp:
        a, m = max(set(comp), key=comp.count)
        paghe_label = f"Paghe {MESI_IT[m]} {a}"

    da_pagare = [d for d in deleghe if (d.get("saldo_finale") or 0) > 0]
    tutto_compensato = not da_pagare
    if tutto_compensato and deleghe:
        da_pagare = [deleghe[0]]

    for d in deleghe:
        if d not in da_pagare:
            _salva_delega(d, sf_id)

    n_pag = len(deleghe)
    for d in da_pagare:
        scad = d.get("data_scadenza") or min(scadenze)
        importo = 0.0 if tutto_compensato else round(d["saldo_finale"], 2)
        prec = precedenti.get(d["pagina_pdf"]) or {}
        periodo = prec.get("periodo_piano") or _periodo_libero(fc, sf_id, scad[:7])
        nota = " · ".join(x for x in (
            paghe_label or None,
            f"pag. {d['pagina_pdf']}/{n_pag}" if n_pag > 1 else None,
            "F24 tutto compensato" if tutto_compensato else None,
        ) if x)

        fc.execute("""
            INSERT INTO cg_piano_rate (spesa_fissa_id, numero_rata, periodo, importo, note, data_scadenza_specifica)
            VALUES (?, 0, ?, ?, ?, ?)
            ON CONFLICT(spesa_fissa_id, periodo) DO UPDATE SET
                importo = excluded.importo, note = excluded.note,
                data_scadenza_specifica = excluded.data_scadenza_specifica
        """, (sf_id, periodo, importo, nota, scad))

        ex = fc.execute(
            "SELECT id, stato, totale FROM cg_uscite WHERE spesa_fissa_id = ? AND periodo_riferimento = ?",
            (sf_id, periodo)).fetchone()
        if tutto_compensato:
            stato, data_pag = "PAGATO_MANUALE", scad
        else:
            stato, data_pag = ("SCADUTO" if scad < oggi else "PROGRAMMATO"), None

        if not ex:
            fc.execute("""
                INSERT INTO cg_uscite (
                    spesa_fissa_id, tipo_uscita, fornitore_nome, numero_fattura,
                    totale, data_scadenza, stato, data_pagamento, importo_pagato,
                    periodo_riferimento, note, allegato_url, created_at, updated_at
                ) VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
            """, (sf_id, sf["titolo"], TIPO_SF, importo, scad, stato, data_pag,
                  periodo, nota, allegato_url, oggi, oggi))
            uscita_id = fc.execute("SELECT last_insert_rowid()").fetchone()[0]
            esito["rate_create"] += 1
        else:
            uscita_id = ex["id"]
            if ex["stato"] in STATI_DERIVATI:
                fc.execute("""
                    UPDATE cg_uscite SET fornitore_nome = ?, totale = ?, data_scadenza = ?,
                           stato = ?, data_pagamento = COALESCE(?, data_pagamento),
                           note = ?, allegato_url = COALESCE(?, allegato_url), updated_at = ?
                     WHERE id = ?
                """, (sf["titolo"], importo, scad, stato, data_pag, nota,
                      allegato_url, oggi, uscita_id))
                esito["rate_aggiornate"] += 1
            else:
                fc.execute("UPDATE cg_uscite SET allegato_url = COALESCE(?, allegato_url) WHERE id = ?",
                           (allegato_url, uscita_id))
                esito["rate_non_toccate"] += 1
                if abs((ex["totale"] or 0) - importo) > 0.005:
                    esito["avvisi"].append(
                        f"Rata {periodo} già {ex['stato']} con € {ex['totale']:.2f}: "
                        f"non toccata (nel PDF € {importo:.2f}).")

        _salva_delega(d, sf_id, periodo, uscita_id)
        esito["rate"].append({"periodo": periodo, "pagina": d["pagina_pdf"], "importo": importo,
                              "scadenza": scad, "stato": stato, "uscita_id": uscita_id})

    # data_inizio della spesa fissa = prima scadenza caricata
    fc.execute("""
        UPDATE cg_spese_fisse
           SET data_inizio = CASE WHEN data_inizio IS NULL OR data_inizio > ? THEN ? ELSE data_inizio END,
               updated_at = ?
         WHERE id = ?
    """, (min(scadenze), min(scadenze), _ora(), sf_id))
    _rinumera_piano(fc, sf_id)
    esito["stima_mesi_futuri"] = _aggiorna_stima(fc, sf_id)
    esito["spesa_fissa_id"] = sf_id
    return esito
