#!/usr/bin/env python3
# Modulo: cucina
"""
Collega 42 articoli delle scorte cucina a ingrediente o ricetta (2026-11-08).
[locale:tregobbi] — script una-tantum. Proposte dell'abbinamento guidato
(«sicuri», punteggio >= 85) riviste da Claude: tolte le 10 dubbie (Caponata,
Parmigiana, Millefoglie, Salsa rosa, Mango, Brasato, Filetto di maiale, Pollo,
Panna, Gamberi) e, su indicazione di Marco, «pasta gialla» (proposta
sbagliata), che restano da fare a mano in Scorte › 🔗 Collega.

Per ogni riga controlla che l'articolo esista, sia attivo, abbia ancora quel
nome e sia ancora scollegato; altrimenti la salta e lo dice.

USO (sul VPS, dentro /home/marco/trgb/trgb):
    ../venv-trgb/bin/python scripts/collega_scorte_2026_11_08.py            # DRY-RUN
    ../venv-trgb/bin/python scripts/collega_scorte_2026_11_08.py --applica  # backup + scrive
"""
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.utils.locale_data import locale_data_path  # noqa: E402

DB = Path(sys.argv[sys.argv.index("--db") + 1]) if "--db" in sys.argv else Path(locale_data_path("foodcost.db"))

# (articolo_id, nome articolo, ing|ric, id collegato, nome collegato)
VOCI = [
    (117, 'Maionese al pomodoro', "ric", 59, 'Maionese al pomodoro'),
    (203, 'Olio verde', "ric", 220, 'Olio verde'),
    (24, 'Prezzemolo', "ing", 73, 'Prezzemolo'),
    (47, 'Mascarpone', "ing", 382, 'Mascarpone'),
    (54, 'Bastoncini di merluzzo', "ing", 1257, 'Bastoncini di merluzzo'),
    (91, 'Crema Kissabel', "ric", 203, 'Crema di mela Kissabel'),
    (95, 'Brodo carne', "ing", 82, 'Brodo di carne'),
    (97, 'Semifreddo vaniglia', "ric", 163, 'Semifreddo alla vaniglia'),
    (144, 'Porchetta', "ing", 314, 'Porchetta'),
    (184, 'Filetto di branzino', "ing", 1036, 'Filetto branzino'),
    (188, 'Burro', "ing", 212, 'Burro'),
    (197, 'Philadelphia', "ing", 213, 'Philadelphia'),
    (202, 'Taleggio', "ing", 23, 'Taleggio DOP'),
    (205, 'Formai de Mut', "ing", 25, 'Formai de Mut DOP'),
    (207, 'Strachitunt', "ing", 196, 'Strachitunt DOP'),
    (213, 'Pasta di salsiccia', "ing", 820, 'Pasta salsiccia'),
    (223, 'Rosmarino', "ing", 72, 'Rosmarino'),
    (224, 'carote', "ing", 42, 'Carote'),
    (228, 'Scalogno', "ing", 272, 'Scalogno'),
    (229, 'Aglio', "ing", 75, 'Aglio'),
    (232, 'Spinaci', "ing", 135, 'Spinaci'),
    (233, 'Sedano', "ing", 90, 'Sedano'),
    (235, 'Limoni', "ing", 249, 'Limoni'),
    (236, 'Clementine', "ing", 733, 'Clementine (g)'),
    (83, 'Pesto orsino', "ric", 8, 'Pesto di aglio orsino'),
    (108, 'CIOCCOLATO FONDENTE', "ing", 370, 'Cioccolato fondente zaini'),
    (226, 'Pinoli', "ing", 732, 'Pinoli (pz)'),
    (21, 'Bisque', "ric", 209, 'Bisque di gamberi'),
    (44, 'Pasta sfoglia', "ing", 324, 'G pasta sfoglia rettangol'),
    (88, 'Filetto triglia', "ing", 690, 'Filetto triglia atl. netto'),
    (186, 'guanciale', "ing", 1241, 'Guanciale di suino'),
    (86, 'Finferli', "ing", 588, 'Finferli interi'),
    (208, 'Formagella', "ing", 1286, 'Formagella Valtorta'),
    (230, 'Latte', "ing", 868, 'Latte int'),
    (75, 'Ragù di cortile', "ric", 11, 'Ragù di cortile (5 carni bianche, 3 giorni)'),
    (221, 'pere', "ing", 1194, 'Pere top'),
    (28, 'Asino', "ing", 1187, 'Asino polpa'),
    (146, 'Coppa', "ing", 408, 'Coppa di Parma IGP'),
    (198, 'Tuorlo', "ing", 59, "Tuorlo d'uovo"),
    (215, 'Lonza', "ing", 632, 'Lonza di suino'),
    (35, 'Gambero rosso', "ing", 159, 'Gambero rosso intero congelato'),
    (41, 'Vongole', "ing", 1154, 'Vongole veraci grosse'),
]


def main():
    applica = "--applica" in sys.argv
    print(f"DB: {DB}\nModalita': {'APPLICA' if applica else 'DRY-RUN (non scrive niente)'}\n")
    conn = sqlite3.connect(DB, timeout=30)
    conn.execute("PRAGMA busy_timeout=30000")
    ok, salta = [], []
    for aid, nome, tipo, cid, cnome in VOCI:
        a = conn.execute("SELECT nome, attivo, ingredient_id, recipe_id FROM cucina_articoli WHERE id = ?",
                         (aid,)).fetchone()
        tab = "ingredients" if tipo == "ing" else "recipes"
        c = conn.execute(f"SELECT name FROM {tab} WHERE id = ?", (cid,)).fetchone()
        if not a or not a[1] or a[0] != nome:
            salta.append(f"{nome}: articolo cambiato o disattivato")
            continue
        if a[2] or a[3]:
            salta.append(f"{nome}: gia' collegato")
            continue
        if not c or c[0] != cnome:
            salta.append(f"{nome}: {cnome} non trovato")
            continue
        ok.append((aid, tipo, cid))
        print(f"  {nome:32} → {'🧺' if tipo == 'ing' else '📖'} {cnome}")
    print(f"\n{len(ok)} da collegare, {len(salta)} saltati")
    for s in salta:
        print("  salto: " + s)
    if not applica:
        print("\nDRY-RUN finito. Per applicare: --applica")
        return
    backup = DB.with_name(f"{DB.name}.pre_collega_{datetime.now():%Y%m%d_%H%M%S}")
    dst = sqlite3.connect(backup)
    conn.backup(dst)
    dst.close()
    print(f"Backup: {backup}")
    with conn:
        for aid, tipo, cid in ok:
            conn.execute("UPDATE cucina_articoli SET ingredient_id = ?, recipe_id = ? WHERE id = ?",
                         (cid if tipo == "ing" else None, cid if tipo == "ric" else None, aid))
    print(f"Fatto: {len(ok)} articoli collegati.")


if __name__ == "__main__":
    main()
