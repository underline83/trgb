"""
Migrazione 047: Inserimento prestiti BPM 1 e BPM 2

Crea le spese fisse di riferimento e le singole cg_uscite per ogni rata,
con importi esatti dove noti e media stimata per le rate storiche.

PRESTITO BPM 1: 72 rate, giorno 26, mar 2021 → feb 2027
  Originario: €152.351,27 — Residuo: €34.404,71

PRESTITO BPM 2: 120 rate, giorno 19, apr 2021 → mar 2031
  Originario: €31.389 — Residuo: €20.295,78
"""


def upgrade(conn):
    cur = conn.cursor()

    # ══════════════════════════════════════════════════════
    # PRESTITO BPM 1 — 72 rate, giorno 26
    # ══════════════════════════════════════════════════════

    # Rate con importo noto (59-72)
    rate_note_1 = {
        "2026-01": 2460.06, "2026-02": 2459.84, "2026-03": 2451.25,
        "2026-04": 2459.38, "2026-05": 2456.82, "2026-06": 2458.92,
        "2026-07": 2456.82, "2026-08": 2458.45, "2026-09": 2458.23,
        "2026-10": 2456.82, "2026-11": 2457.76, "2026-12": 2456.82,
        "2027-01": 2456.29, "2027-02": 2457.25,
    }

    # Rate storiche (1-58): importo medio calcolato
    # Totale pagato = 152351.27 - 34404.71 = 117946.56 su 58 rate
    media_storica_1 = round(117946.56 / 58, 2)  # ~2033.56

    # Genera tutte le 72 rate: mar 2021 (rata 1) → feb 2027 (rata 72)
    rate_1 = []
    anno, mese = 2021, 3  # partenza marzo 2021
    for n in range(1, 73):
        periodo = f"{anno:04d}-{mese:02d}"
        data_scad = f"{periodo}-26"
        importo = rate_note_1.get(periodo, media_storica_1)

        # Stato: prima del 2026 → PAGATA, dal 2026 in poi → DA_PAGARE
        if anno < 2026:
            stato = "PAGATA"
        else:
            stato = "DA_PAGARE"

        rate_1.append((n, periodo, data_scad, importo, stato))

        mese += 1
        if mese > 12:
            mese = 1
            anno += 1

    # Inserisci spesa fissa
    cur.execute("""
        INSERT INTO cg_spese_fisse
            (tipo, titolo, descrizione, importo, frequenza, giorno_scadenza,
             data_inizio, data_fine, attiva, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "PRESTITO", "Prestito BPM 1", "Mutuo BPM - 72 rate mensili",
        2457.48,  # importo medio rate attuali (per riferimento)
        "MENSILE", 26,
        "2021-03-26", "2027-02-26", 1,
        f"Originario: €152.351,27 — Residuo: €34.404,71 — Rate: 72"
    ))
    sf1_id = cur.lastrowid

    # Inserisci uscite
    for n, periodo, data_scad, importo, stato in rate_1:
        # Controlla se esiste già
        existing = cur.execute(
            "SELECT id FROM cg_uscite WHERE spesa_fissa_id = ? AND periodo_riferimento = ?",
            (sf1_id, periodo)
        ).fetchone()
        if existing:
            continue

        imp_pagato = importo if stato == "PAGATA" else 0
        data_pag = data_scad if stato == "PAGATA" else None

        cur.execute("""
            INSERT INTO cg_uscite
                (spesa_fissa_id, tipo_uscita, fornitore_nome, numero_fattura,
                 totale, data_scadenza, data_fattura,
                 importo_pagato, data_pagamento, stato,
                 periodo_riferimento, note)
            VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sf1_id, "Prestito BPM 1", "PRESTITO",
            importo, data_scad, data_scad,
            imp_pagato, data_pag, stato,
            periodo, f"Rata {n}/72"
        ))

    # ══════════════════════════════════════════════════════
    # PRESTITO BPM 2 — 120 rate, giorno 19
    # ══════════════════════════════════════════════════════

    # Rate con importo noto (58-120)
    rate_note_2 = {
        "2026-01": 322.49, "2026-02": 322.48, "2026-03": 321.27,
        "2026-04": 322.47, "2026-05": 322.07, "2026-06": 322.45,
        "2026-07": 322.07, "2026-08": 322.44, "2026-09": 322.43,
        "2026-10": 322.07, "2026-11": 322.42, "2026-12": 322.07,
        "2027-01": 322.41, "2027-02": 322.40, "2027-03": 321.42,
        "2027-04": 322.38, "2027-05": 322.07, "2027-06": 322.38,
        "2027-07": 322.07, "2027-08": 322.36, "2027-09": 322.35,
        "2027-10": 322.07, "2027-11": 322.34, "2027-12": 322.07,
        "2028-01": 322.33, "2028-02": 322.32, "2028-03": 321.82,
        "2028-04": 322.31, "2028-05": 322.07, "2028-06": 322.30,
        "2028-07": 322.07, "2028-08": 322.28, "2028-09": 322.27,
        "2028-10": 322.07, "2028-11": 322.27, "2028-12": 322.07,
        "2029-01": 322.25, "2029-02": 322.24, "2029-03": 321.74,
        "2029-04": 322.23, "2029-05": 322.07, "2029-06": 322.21,
        "2029-07": 322.07, "2029-08": 322.20, "2029-09": 322.20,
        "2029-10": 322.07, "2029-11": 322.19, "2029-12": 322.07,
        "2030-01": 322.17, "2030-02": 322.17, "2030-03": 321.89,
        "2030-04": 322.15, "2030-05": 322.07, "2030-06": 322.13,
        "2030-07": 322.07, "2030-08": 322.12, "2030-09": 322.11,
        "2030-10": 322.07, "2030-11": 322.11, "2030-12": 322.07,
        "2031-01": 322.09, "2031-02": 322.09, "2031-03": 321.70,
    }

    # Rate storiche (1-57): media stimata dalle rate note
    # Media rate note: ~322.16
    media_storica_2 = 322.16

    # Genera tutte le 120 rate: apr 2021 (rata 1) → mar 2031 (rata 120)
    rate_2 = []
    anno, mese = 2021, 4  # partenza aprile 2021
    for n in range(1, 121):
        periodo = f"{anno:04d}-{mese:02d}"
        data_scad = f"{periodo}-19"
        importo = rate_note_2.get(periodo, media_storica_2)

        if anno < 2026:
            stato = "PAGATA"
        else:
            stato = "DA_PAGARE"

        rate_2.append((n, periodo, data_scad, importo, stato))

        mese += 1
        if mese > 12:
            mese = 1
            anno += 1

    # Inserisci spesa fissa
    cur.execute("""
        INSERT INTO cg_spese_fisse
            (tipo, titolo, descrizione, importo, frequenza, giorno_scadenza,
             data_inizio, data_fine, attiva, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "PRESTITO", "Prestito BPM 2", "Mutuo BPM - 120 rate mensili",
        322.16,  # importo medio (per riferimento)
        "MENSILE", 19,
        "2021-04-19", "2031-03-19", 1,
        f"Originario: €31.389 — Residuo: €20.295,78 — Rate: 120"
    ))
    sf2_id = cur.lastrowid

    # Inserisci uscite
    for n, periodo, data_scad, importo, stato in rate_2:
        existing = cur.execute(
            "SELECT id FROM cg_uscite WHERE spesa_fissa_id = ? AND periodo_riferimento = ?",
            (sf2_id, periodo)
        ).fetchone()
        if existing:
            continue

        imp_pagato = importo if stato == "PAGATA" else 0
        data_pag = data_scad if stato == "PAGATA" else None

        cur.execute("""
            INSERT INTO cg_uscite
                (spesa_fissa_id, tipo_uscita, fornitore_nome, numero_fattura,
                 totale, data_scadenza, data_fattura,
                 importo_pagato, data_pagamento, stato,
                 periodo_riferimento, note)
            VALUES (?, 'SPESA_FISSA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sf2_id, "Prestito BPM 2", "PRESTITO",
            importo, data_scad, data_scad,
            imp_pagato, data_pag, stato,
            periodo, f"Rata {n}/120"
        ))

    tot_1 = len(rate_1)
    tot_2 = len(rate_2)
    print(f"  Prestito BPM 1: {tot_1} rate inserite (spesa_fissa #{sf1_id})")
    print(f"  Prestito BPM 2: {tot_2} rate inserite (spesa_fissa #{sf2_id})")
