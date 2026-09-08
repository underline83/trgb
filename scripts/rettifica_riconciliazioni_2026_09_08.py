#!/usr/bin/env python3
# Modulo: banca
"""
Rettifica one-shot di 3 riconciliazioni sbagliate — 2026-09-08.

## Perché

Finché la riconciliazione non sapeva fare i parziali né dichiarare "questo
bonifico paga QUESTE due fatture", l'unico modo di far quadrare un movimento
cumulativo era attaccargli documenti di importo simile e chiuderlo a mano.
Tre casi sono rimasti agganciati male. Nessuno è un bug del codice: sono dati.

### A — Bugan / Coffee Lab (movimenti 1522 e 1683)
Il bonifico del 23/05 da 1.423,19 € paga **fattura 14 (535,82) + fattura 20
(887,37)**: somma esatta al centesimo, e non esiste nessun altro movimento da
887,37 in archivio. Oggi ha invece agganciate la 14, la **40** (810,09) e una
**Coffee Lab da 88 €**: 1.433,91, cioè 10,72 di troppo — il segno del
riempimento a mano.
La fattura 40 è pagata dalla RiBa del 30/06 (mov **1683**, 810,09, oggi senza
match), coerente con tutta la serie Bugan: 27→1464 (1/6), 49→1716 (31/7),
57→1824 (31/8).
Effetto oggi: la **fattura 20 risulta ancora da pagare** (SPOSTATO) — un debito
di 887,37 che non esiste — e la 40 ha una data di pagamento sbagliata di un mese.

### B — Tris Moka (movimenti 1465 e 1685)
Le RiBa mensili sono tutte da 258,76 e si sono sfasate di un mese: la fattura di
maggio (1388/020) è finita sull'addebito del 1/6 che pagava quella di aprile
(1092/020, oggi marcata "pagata a mano" senza banca), e l'addebito del 30/06 è
rimasto orfano.

### C — Amazon 8 aprile (movimenti 959 e 963)
Cinque addebiti SDD lo stesso giorno. La fattura da 92,05 è finita sull'addebito
da **94,81** (chiuso a mano per far sparire i 2,76), mentre accanto c'era
l'addebito da **92,04** — scarto di un centesimo, è il suo. Il 94,81 resta senza
fattura: probabilmente un acquisto la cui fattura non è mai stata importata, e
torna fra i movimenti da lavorare.

## Sicurezza

- **dry-run di default**: serve `--apply` per scrivere.
- backup del DB con timestamp prima di qualsiasi scrittura;
- **precondizioni verificate una per una** (id, importi, stato dei link): se
  anche una sola non torna, lo script si ferma senza toccare nulla — così se il
  DB nel frattempo è cambiato non si rettifica al buio;
- tutto in **una transazione**, con `integrity_check` e `foreign_key_check`
  (che non deve peggiorare) PRIMA del commit, altrimenti rollback;
- verifica finale che ogni movimento toccato quadri a residuo zero.

Uso:
    python3 scripts/rettifica_riconciliazioni_2026_09_08.py           # dry-run
    python3 scripts/rettifica_riconciliazioni_2026_09_08.py --apply
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

DB_DEFAULT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "locali", "tregobbi", "data", "foodcost.db",
)

NOTA = "rettifica 2026-09-08 (riconciliazione sbagliata pre-parziali)"


# ─────────────────────────────────────────────────────────────────
# Precondizioni: come DEVE essere il DB perché la rettifica abbia senso
# ─────────────────────────────────────────────────────────────────
MOVIMENTI_ATTESI = {
    1522: ("2026-05-23", -1423.19),
    1683: ("2026-06-30", -810.09),
    1465: ("2026-06-01", -258.76),
    1685: ("2026-06-30", -258.76),
    959:  ("2026-04-08", -92.04),
    963:  ("2026-04-08", -94.81),
}
FATTURE_ATTESE = {
    4968: ("14", 535.82),        # Bugan feb
    6902: ("20", 887.37),        # Bugan mar — oggi risulta NON pagata
    7000: ("40", 810.09),        # Bugan mag
    6938: ("208", 88.00),        # Coffee Lab
    6939: ("1092/020", 258.76),  # Tris Moka apr
    6985: ("1388/020", 258.76),  # Tris Moka mag
    6919: ("IT614CT5ABEI", 92.05),  # Amazon
}
LINK_ATTESI = {  # link_id: (movimento_id, fattura_id)
    200: (1522, 4968),
    187: (1522, 7000),
    202: (1522, 6938),
    184: (1465, 6985),
    114: (963, 6919),
}
USCITE_ATTESE = {  # uscita_id: (fattura_id, totale)
    88:   (4968, 535.82),
    2106: (6902, 887.37),
    2330: (7000, 810.09),
    2192: (6938, 88.00),
    2197: (6939, 258.76),
    2315: (6985, 258.76),
    2123: (6919, 92.05),
}


def verifica_precondizioni(cur) -> list[str]:
    errori = []

    cols = {r[1] for r in cur.execute("PRAGMA table_info(banca_fatture_link)")}
    if "importo_applicato" not in cols:
        errori.append(
            "manca banca_fatture_link.importo_applicato → la migrazione 172 non è "
            "ancora girata su questo DB. Far ripartire il backend e riprovare."
        )
        return errori  # inutile controllare il resto

    for mid, (data, imp) in MOVIMENTI_ATTESI.items():
        r = cur.execute(
            "SELECT data_contabile, importo FROM banca_movimenti WHERE id=?", (mid,)
        ).fetchone()
        if not r:
            errori.append(f"movimento {mid} non trovato")
        elif r[0] != data or abs(r[1] - imp) > 0.01:
            errori.append(f"movimento {mid}: atteso {data} {imp:.2f}, trovato {r[0]} {r[1]:.2f}")

    for fid, (num, tot) in FATTURE_ATTESE.items():
        r = cur.execute(
            "SELECT numero_fattura, totale_fattura FROM fe_fatture WHERE id=?", (fid,)
        ).fetchone()
        if not r:
            errori.append(f"fattura {fid} non trovata")
        elif (r[0] or "") != num or abs(r[1] - tot) > 0.01:
            errori.append(f"fattura {fid}: attesa n.{num} {tot:.2f}, trovata n.{r[0]} {r[1]:.2f}")

    for lid, (mov, fatt) in LINK_ATTESI.items():
        r = cur.execute(
            "SELECT movimento_id, fattura_id FROM banca_fatture_link WHERE id=?", (lid,)
        ).fetchone()
        if not r:
            errori.append(f"link {lid} non trovato (già rettificato?)")
        elif (r[0], r[1]) != (mov, fatt):
            errori.append(f"link {lid}: atteso mov {mov} ↔ fatt {fatt}, trovato {r[0]} ↔ {r[1]}")

    for uid, (fatt, tot) in USCITE_ATTESE.items():
        r = cur.execute(
            "SELECT fattura_id, totale FROM cg_uscite WHERE id=?", (uid,)
        ).fetchone()
        if not r:
            errori.append(f"uscita CG {uid} non trovata")
        elif r[0] != fatt or abs(r[1] - tot) > 0.01:
            errori.append(f"uscita {uid}: attesa fatt {fatt} {tot:.2f}, trovata {r[0]} {r[1]:.2f}")

    # I due movimenti che devono ricevere i documenti non devono avere già link
    for mid in (1683, 1685, 959):
        n = cur.execute(
            "SELECT COUNT(*) FROM banca_fatture_link WHERE movimento_id=?", (mid,)
        ).fetchone()[0]
        if n:
            errori.append(f"movimento {mid} ha già {n} link: qualcuno l'ha lavorato nel frattempo")

    return errori


# ─────────────────────────────────────────────────────────────────
# Le rettifiche
# ─────────────────────────────────────────────────────────────────
def applica(cur, log):
    def sql(q, p=()):
        cur.execute(q, p)
        return cur.rowcount

    # ── A. Bugan / Coffee Lab ────────────────────────────────────
    log("A. Bugan / Coffee Lab")
    sql("DELETE FROM banca_fatture_link WHERE id IN (187, 202)")
    log("   − staccate dal mov 1522: fattura 40 (810,09) e Coffee Lab 208 (88,00)")

    sql("UPDATE banca_fatture_link SET importo_applicato=? WHERE id=?", (535.82, 200))
    sql("""INSERT INTO banca_fatture_link (movimento_id, fattura_id, importo_applicato, note)
           VALUES (?,?,?,?)""", (1522, 6902, 887.37, NOTA))
    log("   + mov 1522 ← fattura 20 (887,37): 535,82 + 887,37 = 1.423,19 esatto")

    sql("""INSERT INTO banca_fatture_link (movimento_id, fattura_id, importo_applicato, note)
           VALUES (?,?,?,?)""", (1683, 7000, 810.09, NOTA))
    log("   + mov 1683 (RiBa 30/06) ← fattura 40 (810,09)")

    sql("""UPDATE cg_uscite SET banca_movimento_id=1522, stato='PAGATO',
              importo_pagato=887.37, data_pagamento='2026-05-23',
              in_pagamento_at=NULL, pagamento_batch_id=NULL, updated_at=datetime('now')
            WHERE id=2106""")
    log("   · fattura 20: da SPOSTATO (debito fantasma di 887,37) a PAGATO il 23/05")

    sql("""UPDATE cg_uscite SET banca_movimento_id=1683, stato='PAGATO',
              importo_pagato=810.09, data_pagamento='2026-06-30',
              updated_at=datetime('now')
            WHERE id=2330""")
    log("   · fattura 40: data pagamento corretta da 23/05 a 30/06")

    # Coffee Lab: tutte le altre 30 fatture di questo fornitore sono
    # PAGATO_MANUALE (si paga al banco), quindi ci torna anche questa.
    # Se il pagamento vero salta fuori, si ricollega da UI in due clic.
    sql("""UPDATE cg_uscite SET banca_movimento_id=NULL, stato='PAGATO_MANUALE',
              importo_pagato=88.00, data_pagamento=NULL,
              note=COALESCE(note || ' | ', '') || ?, updated_at=datetime('now')
            WHERE id=2192""", (NOTA + ": staccata dal mov 1522, pagamento vero da individuare",))
    log("   · Coffee Lab 208: staccata → PAGATO_MANUALE (come le altre 30 di quel fornitore)")

    sql("""UPDATE banca_movimenti SET riconciliazione_chiusa=0,
              riconciliazione_chiusa_at=NULL, riconciliazione_chiusa_note=NULL
            WHERE id=1522""")
    log("   · mov 1522: chiusura manuale tolta — ora quadra da solo")

    # ── B. Tris Moka ─────────────────────────────────────────────
    log("B. Tris Moka")
    sql("DELETE FROM banca_fatture_link WHERE id=184")
    sql("""INSERT INTO banca_fatture_link (movimento_id, fattura_id, importo_applicato, note)
           VALUES (?,?,?,?)""", (1465, 6939, 258.76, NOTA))
    sql("""INSERT INTO banca_fatture_link (movimento_id, fattura_id, importo_applicato, note)
           VALUES (?,?,?,?)""", (1685, 6985, 258.76, NOTA))
    sql("""UPDATE cg_uscite SET banca_movimento_id=1465, stato='PAGATO',
              importo_pagato=258.76, data_pagamento='2026-06-01', updated_at=datetime('now')
            WHERE id=2197""")
    sql("""UPDATE cg_uscite SET banca_movimento_id=1685, stato='PAGATO',
              importo_pagato=258.76, data_pagamento='2026-06-30', updated_at=datetime('now')
            WHERE id=2315""")
    log("   · RiBa rimesse in fila: 1092/020 → 1/6, 1388/020 → 30/6")

    # ── C. Amazon ────────────────────────────────────────────────
    log("C. Amazon 8 aprile")
    sql("DELETE FROM banca_fatture_link WHERE id=114")
    # Il movimento mette 92,04; la fattura è 92,05. Un centesimo sta sotto la
    # tolleranza, quindi la fattura resta saldata per intero: è esattamente
    # quello che farebbe `_alloca_su_uscite` oggi.
    sql("""INSERT INTO banca_fatture_link (movimento_id, fattura_id, importo_applicato, note)
           VALUES (?,?,?,?)""", (959, 6919, 92.04, NOTA))
    sql("""UPDATE cg_uscite SET banca_movimento_id=959, stato='PAGATO',
              importo_pagato=92.05, updated_at=datetime('now')
            WHERE id=2123""")
    sql("""UPDATE banca_movimenti SET riconciliazione_chiusa=0,
              riconciliazione_chiusa_at=NULL, riconciliazione_chiusa_note=NULL
            WHERE id=963""")
    log("   · fattura 92,05 spostata sull'addebito da 92,04 (scarto 1 cent)")
    log("   · mov 963 (94,81) riaperto: resta senza fattura, torna fra i da lavorare")


# ─────────────────────────────────────────────────────────────────
# Verifica post-rettifica
# ─────────────────────────────────────────────────────────────────
def verifica_esito(cur) -> list[str]:
    problemi = []

    def allocato(mov_id):
        r = cur.execute("""
            SELECT COALESCE(SUM(COALESCE(bl.importo_applicato, f.totale_fattura)), 0)
              FROM banca_fatture_link bl JOIN fe_fatture f ON f.id = bl.fattura_id
             WHERE bl.movimento_id = ?""", (mov_id,)).fetchone()[0]
        r2 = cur.execute("""
            SELECT COALESCE(SUM(cu.totale), 0) FROM cg_uscite cu
             WHERE cu.banca_movimento_id = ?
               AND (cu.fattura_id IS NULL
                    OR NOT EXISTS (SELECT 1 FROM banca_fatture_link bl
                                    WHERE bl.movimento_id = cu.banca_movimento_id
                                      AND bl.fattura_id = cu.fattura_id))""", (mov_id,)).fetchone()[0]
        return round((r or 0) + (r2 or 0), 2)

    for mid in (1522, 1683, 1465, 1685, 959):
        imp = abs(cur.execute("SELECT importo FROM banca_movimenti WHERE id=?", (mid,)).fetchone()[0])
        res = round(imp - allocato(mid), 2)
        if abs(res) >= 1.0:
            problemi.append(f"mov {mid}: residuo {res:.2f} (atteso ~0)")

    n = cur.execute("SELECT COUNT(*) FROM banca_fatture_link WHERE movimento_id=963").fetchone()[0]
    if n:
        problemi.append(f"mov 963 ha ancora {n} link")

    aperte = cur.execute("""
        SELECT COUNT(*) FROM cg_uscite
         WHERE fornitore_nome LIKE '%Bugan%' AND stato NOT IN ('PAGATO','PAGATO_MANUALE')
    """).fetchone()[0]
    if aperte:
        problemi.append(f"restano {aperte} fatture Bugan aperte (attese 0)")

    dupl = cur.execute("""
        SELECT COUNT(*) FROM (SELECT movimento_id, fattura_id FROM banca_fatture_link
                               GROUP BY movimento_id, fattura_id HAVING COUNT(*) > 1)
    """).fetchone()[0]
    if dupl:
        problemi.append(f"{dupl} coppie movimento↔fattura duplicate")

    return problemi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_DEFAULT)
    ap.add_argument("--apply", action="store_true", help="scrive davvero (default: dry-run)")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        print(f"DB non trovato: {args.db}")
        return 2

    conn = sqlite3.connect(args.db)
    cur = conn.cursor()

    print(f"DB: {args.db}")
    print(f"Modo: {'APPLICA' if args.apply else 'DRY-RUN (nessuna scrittura)'}\n")

    print("── Precondizioni")
    errori = verifica_precondizioni(cur)
    if errori:
        print("  ✗ Il DB non è nello stato atteso — NIENTE è stato toccato:")
        for e in errori:
            print(f"     · {e}")
        conn.close()
        return 1
    print("  ✓ tutti gli id, gli importi e i link sono quelli attesi\n")

    fk_prima = len(cur.execute("PRAGMA foreign_key_check").fetchall())

    if args.apply:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = f"{args.db}.pre-rettifica-{stamp}"
        shutil.copy(args.db, backup)
        print(f"── Backup: {backup}\n")

    print("── Rettifiche")
    righe = []
    applica(cur, lambda s: (righe.append(s), print(s))[0])

    print("\n── Verifica")
    problemi = verifica_esito(cur)
    integ = cur.execute("PRAGMA integrity_check").fetchone()[0]
    fk_dopo = len(cur.execute("PRAGMA foreign_key_check").fetchall())
    if integ != "ok":
        problemi.append(f"integrity_check: {integ}")
    if fk_dopo > fk_prima:
        problemi.append(f"foreign_key_check peggiorato: {fk_prima} → {fk_dopo}")

    if problemi:
        conn.rollback()
        print("  ✗ ROLLBACK — qualcosa non torna:")
        for p in problemi:
            print(f"     · {p}")
        conn.close()
        return 1

    print(f"  ✓ tutti i movimenti toccati quadrano · integrity ok · FK {fk_prima} → {fk_dopo}")

    if args.apply:
        conn.commit()
        print("\n✓ APPLICATO.")
    else:
        conn.rollback()
        print("\n(dry-run: nessuna modifica salvata. Rilancia con --apply)")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
