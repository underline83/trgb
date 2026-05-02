"""
Migrazione 096 — Repair one-shot scadenze stipendio orfane (sessione 2026-04-20)

Contesto bug "Iryna marzo 2026":
  Marco segnala che nello scadenzario CG manca la scadenza dello stipendio
  di Iryna Perdei per marzo 2026 (tutti gli altri dipendenti ci sono).
  Indagine su foodcost.db: 7 dipendenti hanno uscita stipendio marzo 2026
  creata il 2026-04-10 (batch import PDF); Iryna invece manca.

  La causa probabile e' un silent failure di `_genera_scadenza_stipendio`
  (vedi router/dipendenti.py): se per qualsiasi motivo la generazione
  dell'uscita saltava, la busta_paga veniva comunque salvata e nessuno
  se ne accorgeva finche' non si andava a cercare la scadenza.

Cosa fa questa migrazione:
  Per ogni record in `buste_paga` con:
    - `uscita_netto_id IS NULL`, OPPURE
    - `uscita_netto_id` che punta a un id non piu' presente in cg_uscite
       (uscita cancellata manualmente),
  genera l'uscita mancante in `cg_uscite` e aggiorna il riferimento
  `uscita_netto_id` nella busta paga.

  La logica replica quella di `_genera_scadenza_stipendio`:
    - data_scadenza = giorno_paga dipendente del mese N+1 (es. busta marzo
      → pagamento 15 aprile);
    - upsert su `fornitore_nome + data_scadenza + tipo_uscita='STIPENDIO'`
      (se per caso c'e' gia' un'uscita con la stessa data/fornitore ma
       scollegata, la riutilizza);
    - stato 'DA_PAGARE', netto da busta_paga.

Idempotente: puo' essere rilanciata; se tutte le buste sono gia' collegate
a un'uscita valida non fa nulla.

Riferimenti:
  - app/routers/dipendenti.py::_genera_scadenza_stipendio
  - docs/changelog.md (voce 2026-04-20 Dipendenti v2.28)
"""

import calendar
import sqlite3
from pathlib import Path


MESI_IT = [
    "",
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
]


def _calc_data_scadenza(mese: int, anno: int, giorno_paga: int) -> str:
    """Stipendio del mese N → pagamento giorno_paga del mese N+1."""
    giorno = giorno_paga or 15
    mese_paga = mese + 1
    anno_paga = anno
    if mese_paga > 12:
        mese_paga = 1
        anno_paga += 1
    max_gg = calendar.monthrange(anno_paga, mese_paga)[1]
    giorno_eff = min(giorno, max_gg)
    return f"{anno_paga}-{mese_paga:02d}-{giorno_eff:02d}"


def upgrade(conn: sqlite3.Connection) -> None:
    """
    `conn` e' la connessione a foodcost.db (dove sono tracciate le
    migrazioni). Per dipendenti apriamo una connessione separata.
    """
    # R6.5 — path tenant-aware (locali/<TRGB_LOCALE>/data/dipendenti.sqlite3
    # con fallback ad app/data/dipendenti.sqlite3 — pattern dipendenti_db.py)
    from app.utils.locale_data import locale_data_path
    DIP_DB = locale_data_path("dipendenti.sqlite3")

    if not DIP_DB.exists():
        print("  [096] dipendenti.sqlite3 non trovato — migrazione no-op")
        return

    dip_conn = sqlite3.connect(DIP_DB)
    dip_conn.row_factory = sqlite3.Row
    conn.row_factory = sqlite3.Row  # foodcost

    try:
        # Tutte le buste paga con dati dipendente
        buste = dip_conn.execute("""
            SELECT bp.id AS bp_id, bp.dipendente_id, bp.mese, bp.anno,
                   bp.netto, bp.uscita_netto_id,
                   d.nome, d.cognome, d.giorno_paga
            FROM buste_paga bp
            JOIN dipendenti d ON d.id = bp.dipendente_id
            ORDER BY bp.anno ASC, bp.mese ASC
        """).fetchall()

        if not buste:
            print("  [096] nessuna busta paga nel DB — niente da fare")
            return

        # Quali uscite_netto_id puntano a cg_uscite effettivamente esistenti?
        ids_collegati = [b["uscita_netto_id"] for b in buste if b["uscita_netto_id"]]
        esistenti = set()
        if ids_collegati:
            placeholders = ",".join("?" * len(ids_collegati))
            rows = conn.execute(
                f"SELECT id FROM cg_uscite WHERE id IN ({placeholders})",
                ids_collegati,
            ).fetchall()
            esistenti = {r["id"] for r in rows}

        n_ok = 0
        n_skip_netto = 0
        n_riparate = 0
        n_gia_collegate = 0
        dettaglio_riparate = []

        for b in buste:
            nome_completo = f"{b['nome']} {b['cognome']}"
            label = f"{MESI_IT[b['mese']] if 1 <= b['mese'] <= 12 else b['mese']} {b['anno']}"

            # Gia' collegata a uscita valida → skip
            if b["uscita_netto_id"] and b["uscita_netto_id"] in esistenti:
                n_gia_collegate += 1
                continue

            # Manca il netto → non possiamo generare nulla di sensato
            netto = b["netto"]
            if netto is None or netto == 0:
                n_skip_netto += 1
                print(
                    f"  [096] skip {nome_completo} {label} — bp_id={b['bp_id']} "
                    f"netto mancante/zero ({netto!r}), niente uscita da generare"
                )
                continue

            # Calcola data scadenza
            data_scad = _calc_data_scadenza(b["mese"], b["anno"], b["giorno_paga"])
            periodo_rif = label  # es. "marzo 2026"
            num_fattura = f"Stipendio {label}"
            fornitore = f"Stipendio - {nome_completo}"

            # Upsert: se c'e' gia' un'uscita scollegata per stesso
            # fornitore+data+tipo, la riusiamo (evita duplicati)
            existing = conn.execute("""
                SELECT id FROM cg_uscite
                WHERE fornitore_nome = ?
                  AND data_scadenza = ?
                  AND tipo_uscita = 'STIPENDIO'
            """, [fornitore, data_scad]).fetchone()

            if existing:
                conn.execute("""
                    UPDATE cg_uscite
                    SET totale = ?, tipo_uscita = 'STIPENDIO',
                        numero_fattura = ?, periodo_riferimento = ?
                    WHERE id = ?
                """, [netto, num_fattura, periodo_rif, existing["id"]])
                uscita_id = existing["id"]
                azione = "relinked"
            else:
                conn.execute("""
                    INSERT INTO cg_uscite
                    (fornitore_nome, totale, data_scadenza, stato, tipo_uscita,
                     numero_fattura, periodo_riferimento, note)
                    VALUES (?, ?, ?, 'DA_PAGARE', 'STIPENDIO', ?, ?, ?)
                """, [
                    fornitore, netto, data_scad,
                    num_fattura, periodo_rif,
                    f"Cedolino {periodo_rif} — rigenerato migr.096",
                ])
                uscita_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                azione = "created"

            # Aggiorna riferimento in buste_paga (DB separato)
            dip_conn.execute(
                "UPDATE buste_paga SET uscita_netto_id = ? WHERE id = ?",
                [uscita_id, b["bp_id"]],
            )

            n_riparate += 1
            dettaglio_riparate.append(
                f"{nome_completo} {label} → uscita_id={uscita_id} ({azione}, scad={data_scad}, netto={netto})"
            )

        conn.commit()
        dip_conn.commit()
        n_ok = n_gia_collegate

        print(f"  [096] buste totali: {len(buste)}")
        print(f"  [096] gia' collegate a uscita valida: {n_ok}")
        print(f"  [096] saltate (netto mancante): {n_skip_netto}")
        print(f"  [096] riparate: {n_riparate}")
        for d in dettaglio_riparate:
            print(f"    · {d}")

        # -----------------------------------------------------------
        # Cleanup link stantii in fe_proforme.cg_uscita_id
        # -----------------------------------------------------------
        # Quando una proforma viene riconciliata con una fattura, l'uscita
        # "provvisoria" della proforma viene cancellata e al suo posto viene
        # creata l'uscita FATTURA definitiva. Il flusso pero' non aggiorna
        # sempre `fe_proforme.cg_uscita_id`, che resta a puntare all'uscita
        # cancellata. I dati contabili sono corretti (l'importo e' registrato
        # nella fattura); il link in fe_proforme e' solo sporco.
        #
        # Qui cerchiamo di rilinkare `cg_uscita_id` all'uscita FATTURA
        # effettivamente esistente, cosi' se Marco in futuro naviga da proforma
        # → uscita collegata non trova un id morto.
        n_proforme_rilinkate = 0
        n_proforme_orfane = 0
        try:
            proforme_sporche = conn.execute("""
                SELECT p.id, p.fornitore_nome, p.importo, p.fattura_id, p.cg_uscita_id
                FROM fe_proforme p
                WHERE p.cg_uscita_id IS NOT NULL
                  AND p.cg_uscita_id NOT IN (SELECT id FROM cg_uscite)
            """).fetchall()

            for p in proforme_sporche:
                # Cerca l'uscita FATTURA effettiva tramite la fattura associata
                f = conn.execute(
                    "SELECT id, numero_fattura FROM fe_fatture WHERE id = ?",
                    [p["fattura_id"]],
                ).fetchone()
                if not f:
                    n_proforme_orfane += 1
                    continue
                # match su fornitore (primi 15 char) + numero_fattura
                u = conn.execute("""
                    SELECT id FROM cg_uscite
                    WHERE fornitore_nome LIKE ?
                      AND numero_fattura = ?
                      AND ABS(totale - ?) < 0.01
                    ORDER BY id DESC LIMIT 1
                """, [
                    f"%{p['fornitore_nome'][:15]}%",
                    f["numero_fattura"],
                    p["importo"],
                ]).fetchone()
                if u:
                    conn.execute(
                        "UPDATE fe_proforme SET cg_uscita_id = ? WHERE id = ?",
                        [u["id"], p["id"]],
                    )
                    n_proforme_rilinkate += 1
                else:
                    n_proforme_orfane += 1

            conn.commit()
            print(f"  [096] fe_proforme con link morto: {len(proforme_sporche)}")
            print(f"  [096]   → rilinkate alla fattura: {n_proforme_rilinkate}")
            print(f"  [096]   → rimaste orfane (match fattura non trovato): {n_proforme_orfane}")
        except sqlite3.OperationalError as e:
            # fe_proforme potrebbe non esistere in ambienti legacy
            print(f"  [096] cleanup proforme saltato: {e}")

    finally:
        dip_conn.close()
