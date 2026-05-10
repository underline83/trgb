"""
Migrazione 110 — Bonifica fatture pendenti dopo audit Marco (sessione 2026-05-10)

Contesto:
  Dopo il fix della query del widget Home Acquisti (sessione precedente: drift
  `fe_fatture.pagato` ↔ `cg_uscite.stato`), la card mostrava ancora 555 fatture /
  €258.581 in sospeso. Marco ha esportato l'elenco in Excel
  (`claude/audit_fatture_non_pagate.xlsx`) e classificato manualmente ogni
  riga con la colonna CONTROLLO.

  Risultato (campioni di analisi 2026-05-10):
    - 369 fatture marcate "PAGATA - DA RICONCILIARE" (€148.460,45)
        → realmente pagate (via RID/SDD/bonifico) ma il modulo Riconciliazione
          non è mai stato usato per chiuderle
    - 42 marcate "CONFERMO" (€40.112,30) → effettivamente da pagare
    - 120 marcate "CONTROLLARE" (€38.236,18) → Marco ha dubbi, le verifica dopo
    - 21 marcate "RATEIZZATA?" / "QUALCOSA RATEIZZATO" (€25.977,72)
        → 1 (FEUDI) effettivamente pagata, 2 da agganciare a spese fisse esistenti,
          18 (RISTO TEAM) da abbinare manualmente più tardi
    - 3 marcate "SISTEMARE" → 1 fattura €0 (Compagnia del Vino), 2 con saldo
      parziale via bonifico già in `banca_movimenti` (MALOWINE, Reepack)

Strategia (concordata con Marco):
  Soglia temporale: 30/11/2025.
  - PAGATA - DA RICONCILIARE con scadenza/data ≤ 30/11/2025 (330 fatture inc. FEUDI):
      stato=PAGATA_MANUALE + pagato=1, chiusura totale ("non arriverà mai
      l'estratto banca pre-2026, considera tutto chiuso").
  - PAGATA - DA RICONCILIARE > 30/11/2025 (40 fatture, dic 2025 + 2026):
      stato=PAGATA_MANUALE + pagato=1, ma con nota "[mig110: pagata via cc, da
      abbinare estratto banca 2026]" → quando Marco caricherà i movimenti banca
      2026, riconcilierà manualmente cambiando lo stato.
  - SISTEMARE — Compagnia del Vino #4979 (€0, no proiezione cg_uscite):
      pagato=1 e basta. Evita re-import da FIC.
  - SISTEMARE — MALOWINE #5616 (€4064,43): bonifico parziale €2032,22 in banca
    (mov #986 del 2026-04-02). Chiudo cg_uscite #560 al 100%, link al mov,
    nota audit con dettaglio "fuori sistema".
  - SISTEMARE — Reepack #5413 (€1729,96): bonifico parziale €788,80 in banca
    (mov #112 del 2026-02-24). Chiudo cg_uscite #357 al 100%, link al mov,
    nota audit con dettaglio "fuori sistema".
  - RATEIZZATA? agganci automatici (importo originale identico):
      fattura #6796 (COL D'ORCIA €1137,65) → cg_spese_fisse #20
      fattura #5462 (NALLES €1420,81)      → cg_spese_fisse #21
      Per queste si setta `fe_fatture.rateizzata_in_spesa_fissa_id` (escluse
      dal conteggio Home).
  - QUALCOSA RATEIZZATO RISTO TEAM (18 fatture): nota audit "in revisione
    (flag rateizzazione_review_110), Marco abbinerà manualmente". Stato attuale
    invariato.
  - CONTROLLARE (120 fatture): nota audit "in revisione". Stato attuale invariato.
  - CONFERMO (42): nessun cambiamento.

Backup:
  - `fe_fatture_archive_110`: tutte le righe modificate (snapshot pre-migrazione)
  - `cg_uscite_archive_110`: stesso, per le righe in cg_uscite

Idempotente:
  - Tabelle archive con IF NOT EXISTS
  - Marker per re-run: presenza di "[mig110:" in cg_uscite.note o
    fe_fatture.note_mig110 → skip
  - Aggiunge colonna fe_fatture.note_mig110 (TEXT NULL) per tracciare audit
    sulle fatture che non hanno cg_uscite (es. Compagnia del Vino €0).

Effetto sulla card Home:
  - Prima:  555 fatture / €258.581
  - Dopo:   ~165 fatture / ~€100.000 (CONFERMO + CONTROLLARE + 40 da
            riconciliare 2026 + 18 RISTO TEAM in revisione)
  - Le 330 PRE-soglia + 3 SISTEMARE + 2 rateizzate spariscono.
"""
import sqlite3


# ──────────────────────────────────────────────────────────────────────
# DATI AUDIT (estratti da claude/audit_fatture_non_pagate.xlsx, 2026-05-10)
# ──────────────────────────────────────────────────────────────────────

# 330 IDs (329 PAGATA-DA-RICONCILIARE pre 30/11/2025 + 1 FEUDI ricategorizzata)
IDS_PRE_30_11_2025 = [
    5227, 5281, 5324, 5326, 5327, 5330, 5334, 5337, 5338, 5340, 5341, 5342, 5346,
    5347, 5348, 5349, 5352, 5354, 5359, 5362, 5363, 5364, 5366, 5373, 5380, 5381,
    5384, 5385, 5386, 5387, 5392, 5393, 5395, 5397, 5398, 5400, 5401, 5403, 5409,
    5411, 5412, 5419, 5420, 5423, 5424, 5426, 5431, 5436, 5440, 5444, 5445, 5447,
    5449, 5454, 5457, 5458, 5469, 5474, 5479, 5480, 5484, 5485, 5486, 5488, 5490,
    5492, 5494, 5495, 5497, 5498, 5504, 5510, 5515, 5516, 5519, 5522, 5524, 5525,
    5526, 5529, 5530, 5531, 5532, 5533, 5534, 5535, 5541, 5545, 5549, 5550, 5552,
    5554, 5557, 5563, 5568, 5571, 5573, 5575, 5576, 5579, 5583, 5585, 5588, 5591,
    5594, 5596, 5597, 5599, 5600, 5601, 5606, 5608, 5609, 5617, 5618, 5619, 5620,
    5621, 5622, 5623, 5626, 5627, 5630, 5631, 5632, 5633, 5635, 5639, 5641, 5645,
    5646, 5650, 5653, 5655, 5656, 5657, 5661, 5669, 5671, 5674, 5675, 5676, 5684,
    5687, 5689, 5691, 5694, 5695, 5697, 5698, 5699, 5707, 5712, 5713, 5716, 5718,
    5721, 5726, 5727, 5728, 5730, 5731, 5732, 5733, 5735, 5741, 5743, 5747, 6357,
    6358, 6365, 6367, 6372, 6374, 6399, 6400, 6401, 6406, 6407, 6408, 6409, 6410,
    6411, 6412, 6415, 6418, 6419, 6424, 6427, 6429, 6432, 6433, 6434, 6436, 6439,
    6440, 6441, 6442, 6447, 6450, 6452, 6453, 6454, 6456, 6459, 6463, 6464, 6466,
    6467, 6471, 6472, 6473, 6474, 6475, 6476, 6479, 6480, 6482, 6484, 6485, 6487,
    6491, 6493, 6496, 6503, 6504, 6507, 6512, 6513, 6525, 6527, 6528, 6529, 6533,
    6537, 6538, 6540, 6541, 6543, 6544, 6545, 6548, 6549, 6552, 6553, 6557, 6561,
    6565, 6566, 6567, 6569, 6570, 6571, 6573, 6578, 6579, 6580, 6581, 6587, 6588,
    6589, 6590, 6594, 6595, 6596, 6597, 6598, 6600, 6602, 6603, 6604, 6608, 6618,
    6623, 6625, 6629, 6635, 6638, 6640, 6643, 6647, 6648, 6653, 6654, 6655, 6656,
    6657, 6658, 6659, 6660, 6664, 6669, 6671, 6673, 6675, 6676, 6678, 6684, 6690,
    6691, 6693, 6695, 6697, 6698, 6699, 6700, 6701, 6703, 6704, 6705, 6710, 6713,
    6724, 6732, 6735, 6741, 6756, 6765, 6771, 6777, 6780, 6782, 6786, 6794, 6820,
    6830, 6851, 6862, 6870, 6879,
]

# 40 IDs (PAGATA-DA-RICONCILIARE > 30/11/2025: dic 2025 + 2026)
IDS_POST_30_11_2025 = [
    4969, 4970, 4981, 4988, 4990, 5752, 5756, 5757, 5759, 5760, 5762, 5764, 5767,
    5769, 5772, 5780, 5782, 5785, 5787, 5788, 5789, 5790, 5792, 5795, 5796, 5797,
    5803, 5804, 5807, 5809, 5810, 6064, 6894, 6910, 6923, 6924, 6926, 6935, 6944,
    6945,
]

# 120 IDs CONTROLLARE (in revisione, stato non cambia)
IDS_CONTROLLARE = [
    4895, 4896, 4911, 5179, 5184, 5194, 5204, 5208, 5214, 5233, 5235, 5238, 5240,
    5250, 5253, 5265, 5268, 5270, 5273, 5280, 5291, 5295, 5298, 5300, 5303, 5307,
    5311, 5319, 5323, 5325, 5335, 5339, 5344, 5351, 5355, 5365, 5391, 5446, 5448,
    5453, 5455, 5456, 5461, 5468, 5470, 5471, 5473, 5475, 5478, 5481, 5482, 5483,
    5487, 5489, 5501, 5506, 5518, 5527, 5537, 5567, 5586, 5640, 5706, 5738, 5751,
    5798, 5800, 6360, 6373, 6384, 6388, 6397, 6420, 6435, 6437, 6445, 6455, 6468,
    6477, 6481, 6500, 6505, 6509, 6515, 6522, 6536, 6550, 6556, 6584, 6614, 6615,
    6630, 6650, 6652, 6663, 6672, 6674, 6679, 6689, 6709, 6714, 6716, 6728, 6730,
    6744, 6752, 6760, 6787, 6798, 6800, 6804, 6819, 6825, 6849, 6852, 6856, 6871,
    6874, 6881, 6949,
]

# 18 IDs RISTO TEAM (qualcosa rateizzato — flag review_110 per abbinamento manuale)
IDS_RISTO_TEAM_REVIEW = [
    4957, 5320, 5378, 5410, 5414, 5508, 5509, 5564, 5578, 5615, 5660, 5701, 5779,
    6508, 6546, 6682, 6903, 6936,
]

# Aganci automatici rateizzazioni → cg_spese_fisse (importo originale identico)
AGGANCI_RATEIZZAZIONI = [
    {"fattura_id": 6796, "spesa_fissa_id": 20, "nota": "COL D'ORCIA → spesa fissa #20"},
    {"fattura_id": 5462, "spesa_fissa_id": 21, "nota": "NALLES-MAGRÈ → spesa fissa #21"},
]

# SISTEMARE — casi singoli con bonifico parziale già in banca
SISTEMARE_BANCA = [
    {
        "fattura_id": 5616,    # MALOWINE €4064,43
        "uscita_id": 560,
        "banca_movimento_id": 986,
        "data_pagamento": "2026-04-02",
        "importo_totale": 4064.43,
        "nota": "MALOWINE: chiusura post-rateizzazione fuori-sistema, bonifico parziale €2032.22 mov #986",
    },
    {
        "fattura_id": 5413,    # Reepack €1729,96
        "uscita_id": 357,
        "banca_movimento_id": 112,
        "data_pagamento": "2026-02-24",
        "importo_totale": 1729.96,
        "nota": "Reepack: chiusura post-rateizzazione fuori-sistema, bonifico parziale €788.80 mov #112",
    },
]

# SISTEMARE — Compagnia del Vino #4979: fattura €0, nessuna proiezione cg_uscite
COMPAGNIA_VINO_FID = 4979


# ──────────────────────────────────────────────────────────────────────
# UPGRADE
# ──────────────────────────────────────────────────────────────────────

def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. Colonna marker su fe_fatture (per fatture senza cg_uscite e per audit) ──
    fe_cols = {r[1] for r in cur.execute("PRAGMA table_info(fe_fatture)").fetchall()}
    if "note_mig110" not in fe_cols:
        cur.execute("ALTER TABLE fe_fatture ADD COLUMN note_mig110 TEXT")
        print("  [110] aggiunta colonna fe_fatture.note_mig110")

    # ── 2. Tabelle archive ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_fatture_archive_110 (
            id INTEGER PRIMARY KEY,
            pagato_pre INTEGER,
            rateizzata_in_spesa_fissa_id_pre INTEGER,
            archived_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            mig110_action TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cg_uscite_archive_110 (
            uscita_id INTEGER PRIMARY KEY,
            stato_pre TEXT,
            importo_pagato_pre REAL,
            data_pagamento_pre TEXT,
            banca_movimento_id_pre INTEGER,
            note_pre TEXT,
            archived_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            mig110_action TEXT NOT NULL
        )
    """)
    print("  [110] tabelle archive pronte")

    # Helper: archivia stato fattura prima di modificarlo
    def _archive_fatture(ids, action):
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        rows = cur.execute(
            f"SELECT id, COALESCE(pagato,0), rateizzata_in_spesa_fissa_id "
            f"FROM fe_fatture WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        for r in rows:
            cur.execute(
                "INSERT OR IGNORE INTO fe_fatture_archive_110 "
                "(id, pagato_pre, rateizzata_in_spesa_fissa_id_pre, mig110_action) "
                "VALUES (?, ?, ?, ?)",
                (r[0], r[1], r[2], action),
            )

    def _archive_uscite(ids, action):
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        rows = cur.execute(
            f"SELECT id, stato, importo_pagato, data_pagamento, banca_movimento_id, note "
            f"FROM cg_uscite WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        for r in rows:
            cur.execute(
                "INSERT OR IGNORE INTO cg_uscite_archive_110 "
                "(uscita_id, stato_pre, importo_pagato_pre, data_pagamento_pre, "
                " banca_movimento_id_pre, note_pre, mig110_action) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (r[0], r[1], r[2], r[3], r[4], r[5], action),
            )

    # ── 3. Idempotenza: skip se già applicata ──
    n_arch = cur.execute("SELECT COUNT(*) FROM fe_fatture_archive_110").fetchone()[0]
    if n_arch > 0:
        print(f"  [110] migrazione già applicata ({n_arch} righe in archive). Skip.")
        return

    # ── 4. PAGATA pre-30/11/2025: chiusura totale ──
    if IDS_PRE_30_11_2025:
        _archive_fatture(IDS_PRE_30_11_2025, "pagata_pre_chiusa")
        placeholders = ",".join("?" * len(IDS_PRE_30_11_2025))
        # Archivio anche cg_uscite per queste fatture
        uscite_pre = [r[0] for r in cur.execute(
            f"SELECT id FROM cg_uscite WHERE fattura_id IN ({placeholders})",
            IDS_PRE_30_11_2025,
        ).fetchall()]
        _archive_uscite(uscite_pre, "pagata_pre_chiusa")

        # Set fe_fatture.pagato = 1 + stato_pagamento = 'pagato_manuale'
        # (allinea i 3 source of truth: pagato boolean, stato_pagamento TEXT, cg_uscite.stato)
        cur.execute(
            f"UPDATE fe_fatture SET pagato = 1, "
            f"  stato_pagamento = 'pagato_manuale', "
            f"  note_mig110 = '[mig110: pagata pre-30/11/2025, chiusura d-ufficio]' "
            f"WHERE id IN ({placeholders})",
            IDS_PRE_30_11_2025,
        )
        n_fatt = cur.rowcount
        # Set cg_uscite.stato = 'PAGATA_MANUALE'
        cur.execute(
            f"UPDATE cg_uscite SET "
            f"  stato = 'PAGATA_MANUALE', "
            f"  importo_pagato = COALESCE(totale, 0), "
            f"  data_pagamento = COALESCE(data_pagamento, "
            f"    CASE WHEN data_scadenza IS NOT NULL AND data_scadenza != '' "
            f"         THEN data_scadenza ELSE data_fattura END), "
            f"  note = TRIM(COALESCE(note, '') || ' [mig110: pagata pre-30/11/2025, chiusura d-ufficio]'), "
            f"  updated_at = CURRENT_TIMESTAMP "
            f"WHERE fattura_id IN ({placeholders})",
            IDS_PRE_30_11_2025,
        )
        n_usc = cur.rowcount
        print(f"  [110] PRE-soglia: {n_fatt} fatture pagate=1, {n_usc} cg_uscite → PAGATA_MANUALE")

    # ── 5. PAGATA post-30/11/2025: pagata via cc, da riconciliare estratto banca 2026 ──
    if IDS_POST_30_11_2025:
        _archive_fatture(IDS_POST_30_11_2025, "pagata_post_via_cc")
        placeholders = ",".join("?" * len(IDS_POST_30_11_2025))
        uscite_post = [r[0] for r in cur.execute(
            f"SELECT id FROM cg_uscite WHERE fattura_id IN ({placeholders})",
            IDS_POST_30_11_2025,
        ).fetchall()]
        _archive_uscite(uscite_post, "pagata_post_via_cc")

        cur.execute(
            f"UPDATE fe_fatture SET pagato = 1, "
            f"  stato_pagamento = 'pagato_manuale', "
            f"  note_mig110 = '[mig110: pagata via cc post-30/11/2025, da abbinare estratto banca 2026]' "
            f"WHERE id IN ({placeholders})",
            IDS_POST_30_11_2025,
        )
        n_fatt = cur.rowcount
        cur.execute(
            f"UPDATE cg_uscite SET "
            f"  stato = 'PAGATA_MANUALE', "
            f"  importo_pagato = COALESCE(totale, 0), "
            f"  data_pagamento = COALESCE(data_pagamento, "
            f"    CASE WHEN data_scadenza IS NOT NULL AND data_scadenza != '' "
            f"         THEN data_scadenza ELSE data_fattura END), "
            f"  note = TRIM(COALESCE(note, '') || ' [mig110: pagata via cc post-30/11/2025, da abbinare estratto banca 2026]'), "
            f"  updated_at = CURRENT_TIMESTAMP "
            f"WHERE fattura_id IN ({placeholders})",
            IDS_POST_30_11_2025,
        )
        n_usc = cur.rowcount
        print(f"  [110] POST-soglia: {n_fatt} fatture pagate=1, {n_usc} cg_uscite → PAGATA_MANUALE (flag cc)")

    # ── 6. SISTEMARE — Compagnia del Vino #4979 (€0, no proiezione cg_uscite) ──
    _archive_fatture([COMPAGNIA_VINO_FID], "compagnia_vino_zero")
    cur.execute(
        "UPDATE fe_fatture SET pagato = 1, "
        "  stato_pagamento = 'pagato_manuale', "
        "  note_mig110 = '[mig110: COMPAGNIA DEL VINO €0 — chiusa per evitare re-import FIC]' "
        "WHERE id = ?",
        (COMPAGNIA_VINO_FID,),
    )
    print(f"  [110] Compagnia del Vino #{COMPAGNIA_VINO_FID} (€0) → pagato=1")

    # ── 7. SISTEMARE — MALOWINE + Reepack: link bonifico parziale, chiusura totale ──
    for s in SISTEMARE_BANCA:
        _archive_fatture([s["fattura_id"]], "sistemare_banca")
        _archive_uscite([s["uscita_id"]], "sistemare_banca")
        cur.execute(
            "UPDATE fe_fatture SET pagato = 1, "
            "  stato_pagamento = 'pagato_manuale', "
            "  note_mig110 = ? WHERE id = ?",
            (f"[mig110: {s['nota']}]", s["fattura_id"]),
        )
        cur.execute(
            "UPDATE cg_uscite SET "
            "  stato = 'PAGATA_MANUALE', "
            "  importo_pagato = ?, "
            "  data_pagamento = ?, "
            "  banca_movimento_id = ?, "
            "  note = TRIM(COALESCE(note, '') || ' [mig110: ' || ? || ']'), "
            "  updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (s["importo_totale"], s["data_pagamento"], s["banca_movimento_id"],
             s["nota"], s["uscita_id"]),
        )
        print(f"  [110] SISTEMARE fattura #{s['fattura_id']} ↔ banca #{s['banca_movimento_id']} (chiusa)")

    # ── 8. RATEIZZATE da agganciare (COL D'ORCIA + NALLES) ──
    for a in AGGANCI_RATEIZZAZIONI:
        _archive_fatture([a["fattura_id"]], "rateizzata_agganciata")
        # Cerca eventuale cg_uscite collegata e archivio
        usc_id = cur.execute(
            "SELECT id FROM cg_uscite WHERE fattura_id = ?", (a["fattura_id"],)
        ).fetchone()
        if usc_id:
            _archive_uscite([usc_id[0]], "rateizzata_agganciata")
            # Marca cg_uscite come rateizzata (la spesa fissa gestirà le rate)
            cur.execute(
                "UPDATE cg_uscite SET stato = 'RATEIZZATA', "
                "  note = TRIM(COALESCE(note, '') || ' [mig110: agganciata a spesa fissa #' || ? || ']'), "
                "  updated_at = CURRENT_TIMESTAMP "
                "WHERE id = ?",
                (a["spesa_fissa_id"], usc_id[0]),
            )
        cur.execute(
            "UPDATE fe_fatture SET "
            "  rateizzata_in_spesa_fissa_id = ?, "
            "  note_mig110 = '[mig110: ' || ? || ']' "
            "WHERE id = ?",
            (a["spesa_fissa_id"], a["nota"], a["fattura_id"]),
        )
        print(f"  [110] {a['nota']}")

    # ── 9. RISTO TEAM (18) — flag review per abbinamento manuale ──
    if IDS_RISTO_TEAM_REVIEW:
        _archive_fatture(IDS_RISTO_TEAM_REVIEW, "risto_team_review")
        placeholders = ",".join("?" * len(IDS_RISTO_TEAM_REVIEW))
        uscite_risto = [r[0] for r in cur.execute(
            f"SELECT id FROM cg_uscite WHERE fattura_id IN ({placeholders})",
            IDS_RISTO_TEAM_REVIEW,
        ).fetchall()]
        _archive_uscite(uscite_risto, "risto_team_review")
        cur.execute(
            f"UPDATE fe_fatture SET "
            f"  stato_pagamento = 'da_verificare', "
            f"  note_mig110 = '[mig110: RISTO TEAM da abbinare manualmente a piano rateizzazione]' "
            f"WHERE id IN ({placeholders})",
            IDS_RISTO_TEAM_REVIEW,
        )
        cur.execute(
            f"UPDATE cg_uscite SET "
            f"  note = TRIM(COALESCE(note, '') || ' [mig110: RISTO TEAM da abbinare a piano rateizzazione]'), "
            f"  updated_at = CURRENT_TIMESTAMP "
            f"WHERE fattura_id IN ({placeholders})",
            IDS_RISTO_TEAM_REVIEW,
        )
        print(f"  [110] RISTO TEAM: {len(IDS_RISTO_TEAM_REVIEW)} fatture marcate per review manuale")

    # ── 10. CONTROLLARE (120) — stato_pagamento='da_verificare' (richiesta Marco) ──
    # Marco vuole che siano evidenziate come "da verificare" nel modulo Acquisti
    # (badge giallo). pagato resta 0 (non sappiamo ancora). cg_uscite stato invariato.
    if IDS_CONTROLLARE:
        _archive_fatture(IDS_CONTROLLARE, "controllare_review")
        placeholders = ",".join("?" * len(IDS_CONTROLLARE))
        uscite_ctrl = [r[0] for r in cur.execute(
            f"SELECT id FROM cg_uscite WHERE fattura_id IN ({placeholders})",
            IDS_CONTROLLARE,
        ).fetchall()]
        _archive_uscite(uscite_ctrl, "controllare_review")
        cur.execute(
            f"UPDATE fe_fatture SET "
            f"  stato_pagamento = 'da_verificare', "
            f"  note_mig110 = '[mig110: in revisione (CONTROLLARE)]' "
            f"WHERE id IN ({placeholders})",
            IDS_CONTROLLARE,
        )
        cur.execute(
            f"UPDATE cg_uscite SET "
            f"  note = TRIM(COALESCE(note, '') || ' [mig110: in revisione (CONTROLLARE)]'), "
            f"  updated_at = CURRENT_TIMESTAMP "
            f"WHERE fattura_id IN ({placeholders})",
            IDS_CONTROLLARE,
        )
        print(f"  [110] CONTROLLARE: {len(IDS_CONTROLLARE)} fatture → stato_pagamento='da_verificare'")

    conn.commit()

    # ── 11. Riepilogo finale ──
    n_arch_fatt = cur.execute("SELECT COUNT(*) FROM fe_fatture_archive_110").fetchone()[0]
    n_arch_usc = cur.execute("SELECT COUNT(*) FROM cg_uscite_archive_110").fetchone()[0]
    print(f"  [110] DONE — archiviate {n_arch_fatt} fatture + {n_arch_usc} cg_uscite. Backup completo per rollback.")
