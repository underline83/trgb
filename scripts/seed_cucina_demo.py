#!/usr/bin/env python3
"""
Seed di PROVA per Scorte & Frigoriferi cucina — settembre 2026.

A COSA SERVE
Il modulo e' live dalla mig 171, ma a DB vuoto le schermate «Scorte» e «Frigo»
non hanno niente da mostrare e non si puo' capire se funziona. Questo script
crea un piccolo magazzino finto — 3 posti, 9 ripiani, 18 articoli, qualche
lotto e qualche movimento — pensato apposta perche' ogni comportamento
particolare del modulo si veda con gli occhi:

  · un articolo FINITO           → deve comparire in Lista Spesa
  · uno IN ESAURIMENTO           → pallino giallo
  · uno stesso articolo su 2 ripiani in 2 posti diversi → la giacenza e' una SOMMA
  · uno fermo da 9 giorni        → «≈ 4,2 · fermo da 9 gg», non «4,2»
  · uno mai movimentato          → «—», non «0»
  · un crudo sul ripiano del cotto → avviso giallo (segnala, non blocca)
  · un lotto che scade fra 2 gg e uno aperto da 6 gg con shelf life 2
  · una timeline di movimenti gia' popolata, cosi' la scheda non e' vuota

USO (sul VPS, dentro /home/marco/trgb/trgb):
    python3 scripts/seed_cucina_demo.py             # DRY-RUN: dice cosa farebbe
    python3 scripts/seed_cucina_demo.py --crea      # crea i dati di prova
    python3 scripts/seed_cucina_demo.py --rimuovi   # li cancella tutti

SICUREZZA — perche' non puo' toccare dati veri
Ogni riga creata porta il marcatore «[DEMO]» nel campo `note`, e `--rimuovi`
cancella ESCLUSIVAMENTE le righe con quel marcatore, risalendo dai posti agli
articoli. Se un giorno inserisci articoli veri e poi lanci `--rimuovi`, i tuoi
restano dove sono.

Non fa backup perche' non modifica nulla di preesistente: solo INSERT su
tabelle nate vuote il 7 settembre. Le righe di Lista Spesa generate dai
semafori sono un'eccezione — quelle nascono dal modulo, non da qui — e
`--rimuovi` toglie solo quelle ancora non fatte e col marcatore.

Idempotente: rilanciarlo due volte con --crea non raddoppia niente (controlla
se il posto «[DEMO] Frigo carne» esiste gia' e in quel caso si ferma).
"""
import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.utils.locale_data import locale_data_path  # noqa: E402

DB = locale_data_path("foodcost.db")
TAG = "[DEMO]"


def ora(giorni_fa=0):
    return (datetime.now() - timedelta(days=giorni_fa)).strftime("%Y-%m-%d %H:%M:%S")


# ── I posti: (nome, tipo, temp_min, temp_max, ordine, [(codice, destinazione)]) ──
POSTI = [
    ("Frigo carne", "FRIGO", 0.0, 4.0, 0, [
        ("1", "PRONTI"), ("2", "COTTO"), ("3", "CRUDO"), ("4", "SEMILAVORATI")]),
    ("Frigo latticini", "FRIGO", 0.0, 4.0, 1, [
        ("1", "PRONTI"), ("2", "SEMILAVORATI")]),
    ("Dispensa secco", "DISPENSA", None, None, 2, [
        ("1", "NON_FOOD"), ("2", "MISTO"), ("3", "MISTO")]),
]

# ── Gli articoli ──
# (nome, um, regime, natura, famiglia, posto, ripiano, qta, semaforo,
#  giorni_fa_ultimo_movimento, scorta_minima, shelf_life_aperto_gg, fornitore)
# `giorni_fa` = None → mai movimentato (la giacenza si mostra «—»)
ARTICOLI = [
    # Frigo carne — il caso principale del giro
    ("Costata di manzo",   "KG", "MOVIMENTI", "CRUDO",     "FRESCO", "Frigo carne", "3", 4.2,  "OK",          1,    2.0,  None, "Macelleria Fumagalli"),
    ("Petto d'anatra",     "PZ", "MOVIMENTI", "CRUDO",     "FRESCO", "Frigo carne", "3", 6.0,  "OK",          9,    4.0,  None, "Macelleria Fumagalli"),   # ← fermo da 9 gg: «≈ 6»
    ("Salsiccia luganega", "KG", "MOVIMENTI", "CRUDO",     "FRESCO", "Frigo carne", "3", 0.8,  "ESAURIMENTO", 2,    1.5,  None, "Macelleria Fumagalli"),
    ("Ossobuco",           "PZ", "CONTA",     "CRUDO",     "FRESCO", "Frigo carne", "2", 3.0,  "OK",          None, None, None, "Macelleria Fumagalli"),   # ← CRUDO su ripiano COTTO: avviso
    ("Arrosto porchettato","PZ", "CONTA",     "COTTO",     "FRESCO", "Frigo carne", "2", 2.0,  "OK",          3,    None, None, None),
    ("Brodo di carne",     "L",  "CONTA",     "PRONTO",    "FRESCO", "Frigo carne", "1", 5.0,  "OK",          2,    None, 3,    None),
    ("Coppa di testa",     "PZ", "SEMAFORO",  "PRONTO",    "FRESCO", "Frigo carne", "1", None, "OK",          None, None, None, "Macelleria Fumagalli"),
    ("Fegatini",           "KG", "SEMAFORO",  "PRONTO",    "FRESCO", "Frigo carne", "1", None, "FINITO",      None, None, None, "Macelleria Fumagalli"),   # ← finito → spesa
    ("Guanciale",          "PZ", "MOVIMENTI", "SEMILAVORATO","FRESCO","Frigo carne","4", 1.0,  "OK",          4,    None, 5,    "Macelleria Fumagalli"),
    ("Pancetta stesa",     "KG", "SEMAFORO",  "SEMILAVORATO","FRESCO","Frigo carne","4", None, "FINITO",      None, None, None, "Macelleria Fumagalli"),   # ← finito → spesa
    ("Lardo",              "KG", "SEMAFORO",  "SEMILAVORATO","FRESCO","Frigo carne","4", None, "FINITO",      None, None, None, "Macelleria Fumagalli"),   # ← finito → spesa

    # Frigo latticini
    ("Burro",              "KG", "MOVIMENTI", "SEMILAVORATO","FRESCO","Frigo latticini","2", 2.0, "ESAURIMENTO", 1, 3.0, None, "Ortofrutta Belotti"),
    ("Panna fresca",       "L",  "MOVIMENTI", "SEMILAVORATO","FRESCO","Frigo latticini","2", 0.5, "OK",          1, None, 2,   "Ortofrutta Belotti"),
    ("Parmigiano 30 mesi", "KG", "MOVIMENTI", "PRONTO",    "FRESCO", "Frigo latticini","1", 3.4, "OK",          2, 1.0,  None, "Ortofrutta Belotti"),

    # Dispensa
    ("Riso Carnaroli",     "KG", "CONTA",     "NON_FOOD",  "SECCO",  "Dispensa secco", "2", 12.0, "OK",         None, None, None, "Ortofrutta Belotti"),
    ("Farina 00",          "KG", "SEMAFORO",  "NON_FOOD",  "SECCO",  "Dispensa secco", "2", None, "FINITO",     None, None, None, "Ortofrutta Belotti"),   # ← finito → spesa
    ("Sale grosso",        "KG", "SEMAFORO",  "NON_FOOD",  "SECCO",  "Dispensa secco", "2", None, "OK",         None, None, None, None),
    ("Carta forno",        "CF", "SEMAFORO",  "NON_FOOD",  "SECCO",  "Dispensa secco", "1", None, "ESAURIMENTO",None, None, None, None),
]

# Lo stesso articolo su un secondo ripiano, in un altro posto:
# serve a vedere che la giacenza dell'articolo e' una SOMMA (4,2 + 2,2 = 6,4).
DOPPI = [("Costata di manzo", "Frigo latticini", "1", 2.2)]

# (articolo, ripiano, codice, giorni_alla_scadenza, giorni_da_apertura, qta)
LOTTI = [
    ("Costata di manzo", "3", "2411-A", 5,  None, 2.8),
    ("Guanciale",        "4", "2409-B", 2,  None, 1.0),   # ← scade fra 2 gg
    ("Brodo di carne",   "1", None,     10, 6,    3.0),   # ← aperto da 6 gg, shelf life 3
]


def tabelle_pronte(cur):
    n = cur.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'cucina_%'"
    ).fetchone()[0]
    return n >= 11


def crea(conn, dry):
    cur = conn.cursor()
    if cur.execute("SELECT 1 FROM cucina_ubicazioni WHERE nome LIKE ?", (f"{TAG}%",)).fetchone():
        print("  I dati di prova ci sono gia'. Lancia --rimuovi prima di ricrearli.")
        return

    print(f"  {len(POSTI)} posti, {sum(len(p[5]) for p in POSTI)} ripiani, "
          f"{len(ARTICOLI)} articoli, {len(LOTTI)} lotti")
    if dry:
        print("\n  Dry-run: non ho scritto niente. Rilancia con --crea.")
        return

    rip_id = {}     # (posto, codice) -> id
    for nome, tipo, tmin, tmax, ordine, ripiani in POSTI:
        cur.execute(
            """INSERT INTO cucina_ubicazioni (nome, tipo, reparto, temp_min, temp_max,
                                              ordine, note, created_by)
               VALUES (?, ?, 'cucina', ?, ?, ?, ?, 'seed-demo')""",
            (f"{TAG} {nome}", tipo, tmin, tmax, ordine, TAG))
        uid = cur.lastrowid
        for i, (codice, dest) in enumerate(ripiani):
            cur.execute(
                """INSERT INTO cucina_ripiani (ubicazione_id, codice, destinazione, ordine, note)
                   VALUES (?, ?, ?, ?, ?)""", (uid, codice, dest, i, TAG))
            rip_id[(nome, codice)] = cur.lastrowid

    art_id = {}
    for (nome, um, regime, natura, fam, posto, rip, qta, sem,
         gg, scorta, shelf, fornitore) in ARTICOLI:
        cur.execute(
            """INSERT INTO cucina_articoli
                 (nome, um, reparto, regime, natura, famiglia_freschezza,
                  ripiano_casa_id, scorta_minima, shelf_life_aperto_gg,
                  fornitore_freeform, note, created_by)
               VALUES (?, ?, 'cucina', ?, ?, ?, ?, ?, ?, ?, ?, 'seed-demo')""",
            (f"{TAG} {nome}", um, regime, natura, fam, rip_id[(posto, rip)],
             scorta, shelf, fornitore, TAG))
        aid = cur.lastrowid
        art_id[nome] = aid
        cur.execute(
            """INSERT INTO cucina_giacenze
                 (articolo_id, ripiano_id, ubicazione_id, qta, stato_semaforo,
                  in_dotazione, aggiornato_at, aggiornato_da, origine)
               VALUES (?, ?, (SELECT ubicazione_id FROM cucina_ripiani WHERE id = ?),
                       ?, ?, 1, ?, 'seed-demo', ?)""",
            (aid, rip_id[(posto, rip)], rip_id[(posto, rip)], qta, sem,
             ora(gg) if gg is not None else None,
             "MOVIMENTO" if gg is not None else None))

        # Due movimenti a testa sugli articoli a regime MOVIMENTI, cosi' la
        # timeline della scheda non e' vuota e le azioni rapide hanno una
        # quantita' da proporre.
        if regime == "MOVIMENTI" and qta:
            carico = round(qta * 1.6, 1)
            scarico = round(carico - qta, 1)
            cur.execute(
                """INSERT INTO cucina_movimenti
                     (articolo_id, ripiano_id, ubicazione_id, tipo, qta_delta,
                      qta_precedente, qta_risultante, motivo, origine, utente, created_at)
                   VALUES (?, ?, (SELECT ubicazione_id FROM cucina_ripiani WHERE id = ?),
                           'CARICO', ?, 0, ?, ?, 'SEED', 'seed-demo', ?)""",
                (aid, rip_id[(posto, rip)], rip_id[(posto, rip)], carico, carico,
                 TAG, ora((gg or 0) + 3)))
            if scarico > 0:
                cur.execute(
                    """INSERT INTO cucina_movimenti
                         (articolo_id, ripiano_id, ubicazione_id, tipo, qta_delta,
                          qta_precedente, qta_risultante, motivo, origine, utente, created_at)
                       VALUES (?, ?, (SELECT ubicazione_id FROM cucina_ripiani WHERE id = ?),
                               'SCARICO', ?, ?, ?, ?, 'SEED', 'seed-demo', ?)""",
                    (aid, rip_id[(posto, rip)], rip_id[(posto, rip)], -scarico,
                     carico, qta, TAG, ora(gg or 0)))

    for nome, posto, rip, qta in DOPPI:
        cur.execute(
            """INSERT INTO cucina_giacenze
                 (articolo_id, ripiano_id, ubicazione_id, qta, stato_semaforo,
                  in_dotazione, aggiornato_at, aggiornato_da, origine)
               VALUES (?, ?, (SELECT ubicazione_id FROM cucina_ripiani WHERE id = ?),
                       ?, 'OK', 1, ?, 'seed-demo', 'MOVIMENTO')""",
            (art_id[nome], rip_id[(posto, rip)], rip_id[(posto, rip)], qta, ora(1)))

    for nome, rip, codice, gg_scad, gg_apert, qta in LOTTI:
        posto = next(a[5] for a in ARTICOLI if a[0] == nome)
        cur.execute(
            """INSERT INTO cucina_lotti
                 (articolo_id, ripiano_id, lotto_codice, data_arrivo, data_scadenza,
                  data_apertura, qta_iniziale, qta_residua, stato, note, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed-demo')""",
            (art_id[nome], rip_id[(posto, rip)], codice,
             (date.today() - timedelta(days=7)).isoformat(),
             (date.today() + timedelta(days=gg_scad)).isoformat(),
             (date.today() - timedelta(days=gg_apert)).isoformat() if gg_apert else None,
             qta, qta, "APERTO" if gg_apert else "CHIUSO", TAG))

    # Le righe di spesa che i FINITO avrebbero generato dall'app.
    for a in ARTICOLI:
        if a[8] == "FINITO":
            cur.execute(
                """INSERT INTO lista_spesa_items (titolo, fornitore_freeform, note, created_by)
                   VALUES (?, ?, ?, 'seed-demo')""",
                (f"{TAG} {a[0]}", a[12], f"{TAG} segnato finito dalle scorte"))

    conn.commit()
    print("\n  ✔ Fatto. Apri /cucina/mobile dal telefono.")


def rimuovi(conn, dry):
    cur = conn.cursor()
    n_u = cur.execute("SELECT COUNT(*) FROM cucina_ubicazioni WHERE nome LIKE ?", (f"{TAG}%",)).fetchone()[0]
    n_a = cur.execute("SELECT COUNT(*) FROM cucina_articoli WHERE nome LIKE ?", (f"{TAG}%",)).fetchone()[0]
    n_s = cur.execute("SELECT COUNT(*) FROM lista_spesa_items WHERE titolo LIKE ? AND fatto = 0", (f"{TAG}%",)).fetchone()[0]
    print(f"  {n_u} posti, {n_a} articoli, {n_s} righe di spesa da cancellare")
    if not (n_u or n_a or n_s):
        print("  Niente da rimuovere.")
        return
    if dry:
        print("\n  Dry-run: non ho cancellato niente. Rilancia con --rimuovi.")
        return

    # Le FK sono ON DELETE CASCADE: cancellando posti e articoli se ne vanno
    # anche ripiani, giacenze, movimenti e lotti.
    cur.execute("PRAGMA foreign_keys = ON")
    cur.execute("DELETE FROM lista_spesa_items WHERE titolo LIKE ? AND fatto = 0", (f"{TAG}%",))
    cur.execute("DELETE FROM cucina_articoli WHERE nome LIKE ?", (f"{TAG}%",))
    cur.execute("DELETE FROM cucina_ubicazioni WHERE nome LIKE ?", (f"{TAG}%",))
    conn.commit()

    resti = cur.execute(
        "SELECT COUNT(*) FROM cucina_giacenze g LEFT JOIN cucina_articoli a ON a.id = g.articolo_id WHERE a.id IS NULL"
    ).fetchone()[0]
    print(f"\n  ✔ Rimosso. Giacenze orfane rimaste: {resti} (dev'essere 0)")


def main():
    crea_f = "--crea" in sys.argv
    rimuovi_f = "--rimuovi" in sys.argv
    dry = not (crea_f or rimuovi_f)

    print(f"\nSeed cucina — DB: {DB}")
    if not Path(DB).exists():
        print("  ✘ foodcost.db non trovato."); sys.exit(1)

    conn = sqlite3.connect(DB, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=30000")
    try:
        if not tabelle_pronte(conn.cursor()):
            print("  ✘ Le tabelle cucina_* non ci sono: la migrazione 171 non e' passata.")
            sys.exit(1)
        if rimuovi_f or (dry and "--rimuovi-dry" in sys.argv):
            rimuovi(conn, dry)
        else:
            crea(conn, dry)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
