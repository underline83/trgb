"""
Migrazione 134 — Riallinea giacenze + locazioni post-cutover (2026-05-19)

CONTESTO:
  Dopo il cutover atomico (mig 133, 2026-05-18 23:19), abbiamo scoperto che
  87 bottiglie su 1287 hanno divergenze tra `vini_magazzino_legacy_20260518`
  (snapshot Cantina classica al 18/5 sera) e `vini_bottiglie` (live, ex `_v2`
  cucite al 13/5 con Fase 5 clustering).

  Cause del drift:
    - 13→18 maggio: Marco ha continuato a usare la Cantina classica
      (vendite/carichi/riordino fisico scaffali). Quelle modifiche sono andate
      SOLO in `vini_magazzino`, NON nelle `_v2` (sync runtime Fase 7 copiava
      solo campi anagrafici, non quantità).
    - Al cutover le `_v2` sono diventate `vini_bottiglie` (live) con dati
      ferreati al 13/5.
    - Risultato: la live ha "perso" 5 giorni di modifiche operative.

  Pattern osservati nei 30 esempi:
    ~50% movimenti reali (qta diverse, locazione uguale) — vendite/carichi
    ~50% riallocazioni (qta uguale, locazione diversa) — riordino fisico
       Es. sistematico "Scaffale 13 → Scaffale 10", "Scaffale 11 → Scaffale 9"

  Decisione (Marco 2026-05-19): il backup è la fonte di verità — riflette
  la cantina fisica reale al 18/5 sera. Riallineiamo tutte le bottiglie
  divergenti AL backup.

LOGICA:
  Per ogni bottiglia in `vini_magazzino_legacy_20260518` che differisce da
  `vini_bottiglie` (per QTA_TOTALE/FRIGO/LOC*, FRIGORIFERO/LOCAZIONE_*):
    1. Se LOCAZIONE_3 nel backup è in formato matrice `(col,riga)` → SKIP
       (toccare QTA_LOC3 senza allineare anche `matrice_celle` rompe l'invariante
       _recalc_qta_loc3_from_matrice → la prossima azione sulla matrice rebuilda
       QTA_LOC3 a 0. Marco sistemerà a mano queste poche bottiglie matrice).
    2. Altrimenti UPDATE diretto delle 9 colonne (4 qta + 4 locazioni + QTA_TOTALE).

BACKUP:
  Prima di eseguire qualunque UPDATE, copia esplicita del file SQLite con
  suffisso `.pre-realign-YYYYMMDD-HHMMSS`. Se la migration rompe qualcosa,
  restore di questo file rimette tutto a posto.

IDEMPOTENZA:
  Se `vini_magazzino_legacy_20260518` non esiste (cutover non eseguito, o
  legacy già droppata), skip silenzioso.
  Se nessuna bottiglia diverge, skip con report 0 modifiche.

REPORT:
  Stampa: n_diverse_totali, n_riallineate, n_skip_matrice (da gestire a mano).

DB: vini_magazzino.sqlite3 (locale-aware).
"""
import sqlite3
import shutil
import re
from datetime import datetime
from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")

# Pattern matrice: LOCAZIONE_3 nel formato "(col,riga)" (es. "(24,2)") o
# "(col,riga), (col,riga)" per multi-cella.
_MATRICE_RE = re.compile(r"^\(\d+,\s*\d+\)(\s*,\s*\(\d+,\s*\d+\))*\s*$")


def _is_matrice_locazione(loc: str | None) -> bool:
    """True se LOCAZIONE_3 è in formato matrice '(col,riga)' (anche multi-cella)."""
    if not loc:
        return False
    return bool(_MATRICE_RE.match(loc.strip()))


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [134] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    mag.row_factory = sqlite3.Row
    try:
        cur = mag.cursor()

        # Verifica esistenza tabella legacy (cutover deve essere stato fatto)
        legacy_row = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_magazzino_legacy_20260518'"
        ).fetchone()
        if not legacy_row:
            print("  [134] vini_magazzino_legacy_20260518 non esiste (cutover mig 133 non eseguito o legacy già droppata), skip")
            return

        # 1) BACKUP file pre-realign (sicurezza)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = VINI_MAG_DB.with_name(VINI_MAG_DB.name + f".pre-realign-{ts}")
        shutil.copy2(VINI_MAG_DB, backup_path)
        print(f"  [134] backup pre-realign creato: {backup_path.name}")

        # 2) Trova le bottiglie divergenti
        diverse = cur.execute("""
            SELECT
                l.id,
                l.DESCRIZIONE,
                l.ANNATA,
                l.QTA_FRIGO   AS l_qta_frigo,
                l.QTA_LOC1    AS l_qta_loc1,
                l.QTA_LOC2    AS l_qta_loc2,
                l.QTA_LOC3    AS l_qta_loc3,
                l.QTA_TOTALE  AS l_qta_totale,
                l.FRIGORIFERO AS l_frigo,
                l.LOCAZIONE_1 AS l_loc1,
                l.LOCAZIONE_2 AS l_loc2,
                l.LOCAZIONE_3 AS l_loc3,
                b.QTA_TOTALE  AS b_qta_totale,
                b.LOCAZIONE_3 AS b_loc3
            FROM vini_magazzino_legacy_20260518 l
            LEFT JOIN vini_bottiglie b ON b.id = l.id
            WHERE COALESCE(l.QTA_TOTALE,0)   != COALESCE(b.QTA_TOTALE,0)
               OR COALESCE(l.QTA_FRIGO,0)    != COALESCE(b.QTA_FRIGO,0)
               OR COALESCE(l.QTA_LOC1,0)     != COALESCE(b.QTA_LOC1,0)
               OR COALESCE(l.QTA_LOC2,0)     != COALESCE(b.QTA_LOC2,0)
               OR COALESCE(l.QTA_LOC3,0)     != COALESCE(b.QTA_LOC3,0)
               OR COALESCE(l.FRIGORIFERO,'') != COALESCE(b.FRIGORIFERO,'')
               OR COALESCE(l.LOCAZIONE_1,'') != COALESCE(b.LOCAZIONE_1,'')
               OR COALESCE(l.LOCAZIONE_2,'') != COALESCE(b.LOCAZIONE_2,'')
               OR COALESCE(l.LOCAZIONE_3,'') != COALESCE(b.LOCAZIONE_3,'')
        """).fetchall()

        n_totali = len(diverse)
        if n_totali == 0:
            print("  [134] zero bottiglie divergenti, nulla da fare")
            return
        print(f"  [134] trovate {n_totali} bottiglie divergenti")

        # 3) Per ogni divergente, UPDATE diretto (SKIP se matrice in L3)
        n_riallineate = 0
        skip_matrice = []  # lista id da gestire a mano
        for row in diverse:
            l3_bk = row["l_loc3"]
            l3_live = row["b_loc3"]
            # Se uno dei due L3 è formato matrice → skip per sicurezza
            if _is_matrice_locazione(l3_bk) or _is_matrice_locazione(l3_live):
                skip_matrice.append({
                    "id": row["id"],
                    "descr": (row["DESCRIZIONE"] or "")[:50],
                    "annata": row["ANNATA"],
                    "bk_qta": row["l_qta_totale"],
                    "live_qta": row["b_qta_totale"],
                    "bk_l3": l3_bk,
                    "live_l3": l3_live,
                })
                continue

            cur.execute("""
                UPDATE vini_bottiglie SET
                    QTA_FRIGO  = ?, FRIGORIFERO = ?,
                    QTA_LOC1   = ?, LOCAZIONE_1 = ?,
                    QTA_LOC2   = ?, LOCAZIONE_2 = ?,
                    QTA_LOC3   = ?, LOCAZIONE_3 = ?,
                    QTA_TOTALE = ?,
                    UPDATED_AT = datetime('now')
                WHERE id = ?
            """, (
                row["l_qta_frigo"] or 0, row["l_frigo"],
                row["l_qta_loc1"]  or 0, row["l_loc1"],
                row["l_qta_loc2"]  or 0, row["l_loc2"],
                row["l_qta_loc3"]  or 0, row["l_loc3"],
                row["l_qta_totale"] or 0,
                row["id"],
            ))
            n_riallineate += 1

        mag.commit()

        # 4) Report
        print(f"  [134] riallineate {n_riallineate} bottiglie ai valori del backup")
        if skip_matrice:
            print(f"  [134] SKIP per locazione matrice (da gestire a mano): {len(skip_matrice)} bottiglie")
            for s in skip_matrice:
                print(f"      #{s['id']} '{s['descr']}' · {s['annata']} · "
                      f"BK={s['bk_qta']}bt(L3={s['bk_l3']}) → LIVE={s['live_qta']}bt(L3={s['live_l3']})")
        print(f"  [134] DONE — backup safety: {backup_path.name}")
    finally:
        mag.close()
