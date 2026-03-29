"""
Migrazione 033: tabella condizioni_pagamento_preset.

Preset standard per le condizioni di pagamento B2B in Italia.

Struttura preset:
- codice: identificativo univoco (es. RIBA_30_DF)
- descrizione: testo leggibile (es. "RIBA 30gg DF")
- modalita: codice FatturaPA (MP01..MP23)
- giorni: giorni dalla base di calcolo (0 = immediato)
- calcolo: DF (data fattura) | FM (fine mese) | DFMM (data fattura mese prossimo)
  DF  → scadenza = data_fattura + giorni
  FM  → scadenza = fine_mese(data_fattura) + giorni
  DFMM → scadenza = fine_mese(data_fattura + giorni)  [cade sempre a fine mese]
- rate: numero rate (1 = singola, 2+ = rateizzato, ogni rata a +giorni)
  Es. rate=3, giorni=30 → 30/60/90
- attivo: 1/0 — l'utente può disattivare preset non usati
- ordine: per ordinamento nella UI

Colonna aggiunta a suppliers: condizioni_pagamento_preset (codice del preset associato)
"""


def upgrade(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS condizioni_pagamento_preset (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            codice      TEXT NOT NULL UNIQUE,
            descrizione TEXT NOT NULL,
            modalita    TEXT NOT NULL DEFAULT 'MP12',
            giorni      INTEGER NOT NULL DEFAULT 30,
            calcolo     TEXT NOT NULL DEFAULT 'DF',
            rate        INTEGER NOT NULL DEFAULT 1,
            attivo      INTEGER NOT NULL DEFAULT 1,
            ordine      INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Preset standard ──
    # Ordinati per frequenza d'uso nel settore ristorazione/commercio
    presets = [
        # Contanti / immediato
        ("CONTANTI",             "Contanti alla consegna",           "MP01",   0, "DF", 1,   1),
        ("CARTA_VISTA",          "Carta di credito a vista",         "MP08",   0, "DF", 1,   2),

        # RIBA — Data Fattura
        ("RIBA_30_DF",           "RIBA 30gg DF",                     "MP12",  30, "DF", 1,  10),
        ("RIBA_60_DF",           "RIBA 60gg DF",                     "MP12",  60, "DF", 1,  11),
        ("RIBA_90_DF",           "RIBA 90gg DF",                     "MP12",  90, "DF", 1,  12),
        ("RIBA_120_DF",          "RIBA 120gg DF",                    "MP12", 120, "DF", 1,  13),

        # RIBA — Fine Mese
        ("RIBA_30_FM",           "RIBA 30gg FM",                     "MP12",  30, "FM", 1,  20),
        ("RIBA_60_FM",           "RIBA 60gg FM",                     "MP12",  60, "FM", 1,  21),
        ("RIBA_90_FM",           "RIBA 90gg FM",                     "MP12",  90, "FM", 1,  22),
        ("RIBA_120_FM",          "RIBA 120gg FM",                    "MP12", 120, "FM", 1,  23),

        # RIBA — Rate multiple DF
        ("RIBA_30_60_DF",        "RIBA 30/60gg DF (2 rate)",         "MP12",  30, "DF", 2,  30),
        ("RIBA_30_60_90_DF",     "RIBA 30/60/90gg DF (3 rate)",      "MP12",  30, "DF", 3,  31),
        ("RIBA_60_90_120_DF",    "RIBA 60/90/120gg DF (3 rate)",     "MP12",  60, "DF", 3,  32),

        # RIBA — Rate multiple FM
        ("RIBA_30_60_FM",        "RIBA 30/60gg FM (2 rate)",         "MP12",  30, "FM", 2,  40),
        ("RIBA_30_60_90_FM",     "RIBA 30/60/90gg FM (3 rate)",      "MP12",  30, "FM", 3,  41),

        # Bonifico — Data Fattura
        ("BONIFICO_VISTA",       "Bonifico a vista",                 "MP05",   0, "DF", 1,  50),
        ("BONIFICO_30_DF",       "Bonifico 30gg DF",                 "MP05",  30, "DF", 1,  51),
        ("BONIFICO_60_DF",       "Bonifico 60gg DF",                 "MP05",  60, "DF", 1,  52),
        ("BONIFICO_90_DF",       "Bonifico 90gg DF",                 "MP05",  90, "DF", 1,  53),

        # Bonifico — Fine Mese
        ("BONIFICO_30_FM",       "Bonifico 30gg FM",                 "MP05",  30, "FM", 1,  60),
        ("BONIFICO_60_FM",       "Bonifico 60gg FM",                 "MP05",  60, "FM", 1,  61),

        # RID / SEPA DD
        ("RID_30_DF",            "RID 30gg DF",                      "MP09",  30, "DF", 1,  70),
        ("RID_30_FM",            "RID 30gg FM",                      "MP09",  30, "FM", 1,  71),
        ("SEPA_DD_30_DF",        "SEPA DD 30gg DF",                  "MP19",  30, "DF", 1,  80),
        ("SEPA_DD_30_FM",        "SEPA DD 30gg FM",                  "MP19",  30, "FM", 1,  81),
        ("SEPA_DD_CORE_30_DF",   "SEPA DD Core 30gg DF",             "MP20",  30, "DF", 1,  82),

        # Rimessa diretta
        ("RIMESSA_DIRETTA",      "Rimessa diretta",                  "MP01",   0, "DF", 1,  90),
        ("RIMESSA_30_DF",        "Rimessa diretta 30gg DF",          "MP01",  30, "DF", 1,  91),
    ]

    for codice, desc, mp, giorni, calcolo, rate, ordine in presets:
        conn.execute("""
            INSERT OR IGNORE INTO condizioni_pagamento_preset
            (codice, descrizione, modalita, giorni, calcolo, rate, attivo, ordine)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        """, (codice, desc, mp, giorni, calcolo, rate, ordine))

    # Aggiungi colonna preset a suppliers
    try:
        conn.execute("ALTER TABLE suppliers ADD COLUMN condizioni_pagamento_preset TEXT")
    except Exception:
        pass

    conn.commit()
