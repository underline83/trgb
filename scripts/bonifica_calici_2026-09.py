#!/usr/bin/env python3
"""
Bonifica flag calice — settembre 2026 (sessione con Claude del 2026-09-01).

CONTESTO
Fino a vini 3.86 aprire una bottiglia per il servizio al calice accendeva DUE
flag invece di uno: `BOTTIGLIA_APERTA` (stato del momento: c'e' una bottiglia
stappata adesso) e `VENDITA_CALICE` (anagrafica permanente: questo vino sta
SEMPRE al calice). La chiusura della mescita spegne solo il primo, quindi il
vino restava nella sezione "Al calice" della carta senza essere in mescita.
Il fix e' in vini 3.87; questo script ripulisce lo storico gia' prodotto.

Marco ha rivisto uno per uno i 31 vini in quello stato (snapshot DB del
2026-09-01 14:30) e ha deciso quali NON sono vini da calice fisso: sono i 15
elencati in ACTIONS. Gli altri 16 restano `VENDITA_CALICE = 1` di proposito e
questo script non li tocca.

USO (sul VPS, dentro /home/marco/trgb/trgb):
    python3 scripts/bonifica_calici_2026-09.py            # DRY-RUN: mostra cosa farebbe
    python3 scripts/bonifica_calici_2026-09.py --apply    # esegue (con backup automatico)

Il backup pre-bonifica viene salvato accanto al DB come
vini_magazzino.sqlite3.prev-bonifica-calici-<timestamp> (sqlite3 backup API,
WAL-safe).

SICUREZZA
- ogni vino e' identificato da id + un frammento di descrizione E di
  produttore: se l'id punta a un altro vino, abort senza scrivere nulla
  (protezione contro id riassegnati da import o cutover);
- se un vino ha la bottiglia APERTA in questo momento, abort: qualcuno lo sta
  servendo al calice adesso, non e' il momento di togliergli il flag;
- idempotente: i vini gia' a `VENDITA_CALICE = 0` vengono saltati, non e' un
  errore rilanciarlo;
- ogni modifica lascia traccia come movimento MODIFICA con nota
  [BONIFICA-CALICI], visibile nella timeline della scheda vino;
- una sola transazione breve.

NOTA: `PREZZO_CALICE` viene lasciato dov'e'. Non da' fastidio (senza flag ne'
bottiglia aperta il vino non entra in carta al calice) e serve come default
se un domani riapri quella bottiglia per i calici.
"""
import sqlite3
import sys
from pathlib import Path
from datetime import datetime

# (id, frammento_descrizione, frammento_produttore, etichetta leggibile)
# Scelta di Marco 2026-09-01 sui 31 vini con VENDITA_CALICE=1 e mescita spenta.
# Il doppio frammento (descrizione + produttore) serve perche' alcune
# descrizioni da sole sono generiche ("Alto Adige DOC Pinot Nero" esiste per
# piu' produttori): con l'id spostato da un import il controllo singolo
# passerebbe sul vino sbagliato.
ACTIONS = [
    # decisi nel primo giro (lista dei 21)
    (1187, "Bakkanali KANI",      "Bakkanali",          "Bakkanali KANI Sangiovese bio 2023"),
    (1238, "Lagrein",             "St. Michael",        "St. Michael Eppan Alto Adige Lagrein 2024"),
    (1303, "Bordeaux AOC",        "Lavergne",           "Lavergne Bordeaux AOC 2023"),
    (1316, "Alouettes",           "Jaffelin",           "Maison Jaffelin Champagne Brut"),
    (1185, "Bakkanali ROSA",      "Bakkanali",          "Bakkanali ROSA Sangiovese bio 2023"),
    (1251, "Pinot Nero",          "Maculan",            "Maculan Veneto IGT Pinot Nero 2023"),
    (1307, "Limoux",              "Valentin",           "Paul G. Valentin Cremant de Limoux N 91"),
    # decisi nel secondo giro (i 15 comparsi nello snapshot aggiornato)
    (1318, "Festival",            "Produttori Meran",   "Cantina Produttori Merano Chardonnay Festival 2025"),
    (1206, "Lapis Argent",        "Castelmerlo",        "Podere Castelmerlo Pinot Grigio Lapis Argentum 2023"),
    (1320, "Martina",             "Eligio Magri",       "Eligio Magri Bergamasca Chardonnay Martina 2024"),
    ( 559, "Pinot Nero",          "Colterenzio",        "Colterenzio Alto Adige Pinot Nero 2024"),
    (1285, "Rhone",               "Pasquiers",          "Domaine des Pasquiers Cotes du Rhone rouge 2024"),
    (1197, "Brut Tradition",      "Hucbourg",           "Hucbourg-Bertrand Champagne Brut Tradition"),
    (1312, "Vieris",              "Vie Di Romans",      "Vie di Romans Friuli Isonzo Vieris 2023"),
    (1243, "Cabernet Franc",      "BRANDOLINI",         "Conte Brandolini d'Adda Friuli Cabernet Franc 2021"),
]

# Gia' a posto senza intervento (flag spento tra i due giri): 1311 Lugana
# Montunal. Non serve elencarlo: lo script e' idempotente.

# Quanti vini devono restare "sempre al calice" a bottiglia chiusa dopo la
# bonifica. Serve come sanity check: se il numero non torna, o il fix 3.87 non
# e' in produzione (nuove aperture continuano ad accendere il flag) o qualcuno
# ha cambiato i flag a mano nel frattempo. Non blocca, avvisa e basta.
ATTESI_DOPO = 16

ROOT = Path(__file__).resolve().parent.parent
CANDIDATES = [
    ROOT / "locali" / "tregobbi" / "data" / "vini_magazzino.sqlite3",
    ROOT / "app" / "data" / "vini_magazzino.sqlite3",
]

NOTA = "[BONIFICA-CALICI] Flag 'sempre al calice' rimosso (residuo di apertura mescita, fix vini 3.87)"


def main():
    apply = "--apply" in sys.argv
    db_path = next((p for p in CANDIDATES if p.exists()), None)
    if not db_path:
        sys.exit(f"DB non trovato. Cercato in: {[str(p) for p in CANDIDATES]}")
    print(f"DB: {db_path}")
    print(f"Modalita': {'APPLY' if apply else 'DRY-RUN (nessuna modifica)'}\n")

    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")

    # ── 1. Validazione ──────────────────────────────────────────────
    errors = []
    plan = []
    skipped = []
    for vid, fr_desc, fr_prod, etichetta in ACTIONS:
        r = conn.execute(
            "SELECT id, DESCRIZIONE, PRODUTTORE, ANNATA, QTA_TOTALE, "
            "COALESCE(VENDITA_CALICE,0) vc, COALESCE(BOTTIGLIA_APERTA,0) ba, PREZZO_CALICE "
            "FROM vini_bottiglie WHERE id = ?", (vid,)).fetchone()
        if r is None:
            errors.append(f"id={vid} ({etichetta}) NON TROVATO")
            continue
        if fr_desc.lower() not in (r["DESCRIZIONE"] or "").lower():
            errors.append(
                f"id={vid}: descrizione DB \"{r['DESCRIZIONE']}\" non contiene \"{fr_desc}\" "
                f"(atteso {etichetta}) — id riassegnato?")
            continue
        if fr_prod.lower() not in (r["PRODUTTORE"] or "").lower():
            errors.append(
                f"id={vid}: produttore DB \"{r['PRODUTTORE']}\" non contiene \"{fr_prod}\" "
                f"(atteso {etichetta}) — id riassegnato?")
            continue
        if r["ba"] == 1:
            errors.append(
                f"id={vid} ({etichetta}): BOTTIGLIA APERTA in questo momento — "
                f"lo stanno servendo al calice, chiudi prima la mescita")
            continue
        if r["vc"] == 0:
            skipped.append((vid, etichetta))
            continue
        plan.append((vid, r, etichetta))

    if errors:
        print("ERRORI DI VALIDAZIONE — nessuna modifica applicata:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    # ── 2. Report piano ────────────────────────────────────────────
    for vid, r, etichetta in plan:
        print(f"id {vid:>5} | {etichetta:<52} | {r['QTA_TOTALE']:>3} bt | "
              f"calice {r['PREZZO_CALICE']} | VENDITA_CALICE 1 -> 0")
    for vid, etichetta in skipped:
        print(f"id {vid:>5} | {etichetta:<52} | gia' a 0, salto")
    print(f"\nDa modificare: {len(plan)} vini (gia' a posto: {len(skipped)})")

    # Contesto: quanti restano al calice DOPO la bonifica (i 16 voluti da Marco
    # + eventuali nuovi). Serve per accorgersi se il fix 3.87 non e' arrivato.
    resto = conn.execute(
        "SELECT COUNT(*) FROM vini_bottiglie "
        "WHERE COALESCE(VENDITA_CALICE,0)=1 AND COALESCE(BOTTIGLIA_APERTA,0)=0"
    ).fetchone()[0]
    dopo = resto - len(plan)
    nota = "" if dopo == ATTESI_DOPO else (
        f"  <-- ATTENZIONE: attesi {ATTESI_DOPO}. Se sono di piu', sono comparse nuove "
        f"aperture col vecchio comportamento: verifica che vini 3.87 sia in produzione.")
    print(f"Vini 'sempre al calice' a bottiglia chiusa dopo la bonifica: {dopo}{nota}")

    if not plan:
        print("\nNiente da fare.")
        conn.close()
        return

    if not apply:
        print("\nDry-run terminato. Rilancia con --apply per eseguire.")
        conn.close()
        return

    # ── 3. Backup WAL-safe ─────────────────────────────────────────
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(db_path.name + f".prev-bonifica-calici-{stamp}")
    dest = sqlite3.connect(backup_path)
    conn.backup(dest)
    dest.close()
    print(f"\nBackup creato: {backup_path}")

    # ── 4. Applicazione in transazione ─────────────────────────────
    now = datetime.now().isoformat(timespec="seconds")
    cur = conn.cursor()
    try:
        cur.execute("BEGIN")
        for vid, r, etichetta in plan:
            cur.execute("UPDATE vini_bottiglie SET VENDITA_CALICE = 0 WHERE id = ?", (vid,))
            cur.execute(
                "INSERT INTO vini_magazzino_movimenti "
                "(vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at) "
                "VALUES (?, ?, 'MODIFICA', 0, NULL, ?, 'BONIFICA-CALICI', 'script', ?)",
                (vid, now, NOTA, now))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        conn.close()
        sys.exit(f"ERRORE, rollback eseguito: {exc}")

    # ── 5. Verifica post ───────────────────────────────────────────
    ids = [vid for vid, _, _ in plan]
    residui = conn.execute(
        "SELECT COUNT(*) FROM vini_bottiglie WHERE COALESCE(VENDITA_CALICE,0)=1 "
        f"AND id IN ({','.join('?' * len(ids))})", ids).fetchone()[0]
    rimasti = conn.execute(
        "SELECT COUNT(*) FROM vini_bottiglie "
        "WHERE COALESCE(VENDITA_CALICE,0)=1 AND COALESCE(BOTTIGLIA_APERTA,0)=0"
    ).fetchone()[0]
    print(f"\nFATTO. Vini bonificati con flag ancora acceso: {residui} (deve essere 0).")
    print(f"Restano 'sempre al calice' a bottiglia chiusa: {rimasti} (attesi {ATTESI_DOPO}).")
    print("Il backend NON va riavviato (solo dati). Ricarica la carta vini per vedere l'effetto.")
    conn.close()


if __name__ == "__main__":
    main()
