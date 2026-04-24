"""
Migrazione 100 — Seed edizione Menu Carta "Primavera 2026" (sessione 57 — 2026-04-25)

Carica nel DB Menu Carta (foodcost.db, tabelle introdotte dalla mig 098)
l'edizione corrente con tutte le sue pubblicazioni e degustazioni.

Premessa:
  La 099 ha appena popolato `recipes` con i 28 piatti del menu Primavera 2026
  (21 voci principali + 6 contorni + 1 placeholder pescato). Questa migrazione
  crea le `menu_dish_publications` che linkano alle recipes per nome.

Cosa popola:
  - 1 menu_edition: "Primavera 2026", stato 'in_carta', date 21/3 - 20/6/2026
  - 28 publications per le ricette piatto (link recipe_id)
  - 7 publications "servizio" (coperto, acqua, espresso, the, moka) +
                   "bambini" (primo, secondo) - senza recipe_id
  - 1 publication "piatti del giorno" (descrizione_variabile=1)
  - 2 menu_tasting_paths con 10 step totali

Idempotenza:
  - Edizione: SELECT WHERE slug — skip se esiste
  - Publications: cancella e ricrea TUTTE le pubblicazioni di quella edizione
    (se l'edizione e' stata appena creata) — questo permette di rieseguire
    la migrazione per re-seed pulito quando si modifica il dataset.

Riferimenti:
  - docs/menu_carta.md (sezione 8 — mappa piatti del menu)
  - app/migrations/098_menu_carta_init.py
  - app/migrations/099_seed_food_cost_test.py
"""

import sqlite3


# ─────────────────────────────────────────────────────────────────────────
# Edizione
# ─────────────────────────────────────────────────────────────────────────
EDITION = {
    "nome": "Primavera 2026",
    "slug": "primavera-2026",
    "stagione": "primavera",
    "anno": 2026,
    "data_inizio": "2026-03-21",
    "data_fine": "2026-06-20",
    "stato": "in_carta",
    "note": "Edizione corrente caricata dal PDF menù-A5-primavera-2026-definitivo.pdf — sessione 57.",
    "pdf_path": "menù-A5-primavera-2026-definitivo.pdf",
}


# ─────────────────────────────────────────────────────────────────────────
# Publications da ricetta — match per recipes.menu_name
# (recipe_id viene risolto a runtime cercando per menu_name)
# ─────────────────────────────────────────────────────────────────────────
PUBLICATIONS_FROM_RECIPE = [
    # ── ANTIPASTI ──
    {"menu_name": "Tegamino di asparagi e uovo 63°",  "sezione": "antipasti", "sort": 10, "prezzo_singolo": 16, "allergeni": "latte,uova"},
    {"menu_name": "Sua Maestà \"La Taragna\"",        "sezione": "antipasti", "sort": 20, "prezzo_singolo": 16, "allergeni": "latte"},
    {"menu_name": "Cappuccino di baccalà e patata",   "sezione": "antipasti", "sort": 30, "prezzo_singolo": 16, "allergeni": "pesce,latte"},
    {"menu_name": "La Tartare dell'Oste",             "sezione": "antipasti", "sort": 40, "prezzo_singolo": 22, "allergeni": "pesce,uova,glutine", "badge": "firma"},
    {"menu_name": "Il Vitello Tonnato dell'Osteria",  "sezione": "antipasti", "sort": 50, "prezzo_singolo": 20, "allergeni": "pesce,uova"},
    {"menu_name": "Il salame del Roberto con la giardiniera", "sezione": "antipasti", "sort": 60, "prezzo_singolo": 16, "allergeni": "solfiti"},
    {"menu_name": "I nostri salumi misti",            "sezione": "antipasti", "sort": 70, "prezzo_singolo": 20, "allergeni": "solfiti", "consigliato_per": 2},
    {"menu_name": "Le selezioni di formaggi italiani","sezione": "antipasti", "sort": 80, "prezzo_piccolo": 14, "prezzo_grande": 20, "prezzo_label": "14 (4 pezzi) / 20 (6 pezzi)", "allergeni": "latte"},
    {"menu_name": "Le selezioni di formaggi francesi","sezione": "antipasti", "sort": 90, "prezzo_piccolo": 15, "prezzo_grande": 25, "prezzo_label": "15 (3 pezzi) / 25 (5 pezzi)", "allergeni": "latte"},

    # ── PASTE, RISI E ZUPPE ──
    {"menu_name": "Risotto alla Vignarola",                                              "sezione": "paste_risi_zuppe", "sort": 10, "prezzo_singolo": 18, "allergeni": "latte,solfiti"},
    {"menu_name": "Fettuccine all'Alfredo \"se fosse stato di Bergamo\"",                "sezione": "paste_risi_zuppe", "sort": 20, "prezzo_singolo": 18, "allergeni": "glutine,latte,uova"},
    {"menu_name": "Casoncelli di mamma e papà",                                          "sezione": "paste_risi_zuppe", "sort": 30, "prezzo_singolo": 18, "allergeni": "glutine,latte,uova", "badge": "classico"},
    {"menu_name": "Lasagnetta al ragù di cortile",                                       "sezione": "paste_risi_zuppe", "sort": 40, "prezzo_singolo": 20, "allergeni": "glutine,latte,uova,sedano"},
    {"menu_name": "Pasta mista, sarda di Montisola ed erba orsina",                      "sezione": "paste_risi_zuppe", "sort": 50, "prezzo_singolo": 20, "allergeni": "glutine,pesce,latte"},
    {"menu_name": "Trippa dell'Oste",                                                    "sezione": "paste_risi_zuppe", "sort": 60, "prezzo_singolo": 18, "allergeni": "latte,sedano"},

    # ── SECONDI ──
    {"menu_name": "Faraona, carote, senape e miele",            "sezione": "secondi", "sort": 10, "prezzo_singolo": 24, "allergeni": "senape,solfiti"},
    {"menu_name": "Filetto alla Donizetti",                     "sezione": "secondi", "sort": 20, "prezzo_singolo": 35, "allergeni": "latte,solfiti", "badge": "firma"},
    {"menu_name": "Ossobuco di vitello con purè",               "sezione": "secondi", "sort": 30, "prezzo_singolo": 24, "allergeni": "latte,sedano,solfiti"},
    {"menu_name": "Vuoi un piatto unico con ossobuco e risotto giallo?", "sezione": "secondi", "sort": 40, "prezzo_singolo": 35, "allergeni": "latte,sedano,solfiti"},
    {"menu_name": "Brasato di manzo e polenta",                 "sezione": "secondi", "sort": 50, "prezzo_singolo": 24, "allergeni": "solfiti,sedano"},
    {"menu_name": "Arrosto di coniglio e agretti",              "sezione": "secondi", "sort": 60, "prezzo_singolo": 22, "allergeni": "solfiti"},
    {"menu_name": "Pescato del giorno",                         "sezione": "secondi", "sort": 70, "prezzo_singolo": 26, "allergeni": "pesce", "descrizione_variabile": 1},

    # ── CONTORNI ──
    {"menu_name": "Polenta nostrana",                  "sezione": "contorni", "sort": 10, "prezzo_singolo": 4},
    {"menu_name": "Assaggio di Sua Maestà la Taragna", "sezione": "contorni", "sort": 20, "prezzo_singolo": 8, "allergeni": "latte"},
    {"menu_name": "Patate arrosto",                    "sezione": "contorni", "sort": 30, "prezzo_singolo": 6},
    {"menu_name": "Spadellata di verdure",             "sezione": "contorni", "sort": 40, "prezzo_singolo": 6},
    {"menu_name": "Giardiniera di verdure",            "sezione": "contorni", "sort": 50, "prezzo_singolo": 6},
    {"menu_name": "Insalata mista di stagione",        "sezione": "contorni", "sort": 60, "prezzo_singolo": 6},
]


# ─────────────────────────────────────────────────────────────────────────
# Publications "documentali" senza recipe_id
# ─────────────────────────────────────────────────────────────────────────
PUBLICATIONS_DOCUMENT = [
    # ── PIATTI DEL GIORNO (descrizione variabile, no recipe) ──
    {
        "sezione": "piatti_del_giorno",
        "sort": 10,
        "titolo_override": "Raccontati a voce",
        "descrizione_override": "Come sulla lavagna dell'osteria, tutte le idee del giorno con i prodotti migliori in tiratura limitata. Possono finire subito!",
        "prezzo_min": 14, "prezzo_max": 26,
        "prezzo_label": "da 14 a 26",
        "descrizione_variabile": 1,
    },

    # ── SERVIZIO ──
    {"sezione": "servizio", "sort": 10, "titolo_override": "Coperto",          "prezzo_singolo": 5},
    {"sezione": "servizio", "sort": 20, "titolo_override": "Acqua",            "prezzo_singolo": 3},
    {"sezione": "servizio", "sort": 30, "titolo_override": "Espresso",         "prezzo_singolo": 3},
    {"sezione": "servizio", "sort": 40, "titolo_override": "The e tisane",     "prezzo_singolo": 8},
    {"sezione": "servizio", "sort": 50,
     "titolo_override": "Moka \"Pump\"",
     "descrizione_override": "Degustazione per due.",
     "prezzo_singolo": 10, "consigliato_per": 2},

    # ── BAMBINI ──
    {"sezione": "bambini", "sort": 10,
     "titolo_override": "Primo piatto bambini",
     "descrizione_override": "Disponibile su richiesta.",
     "prezzo_singolo": 10},
    {"sezione": "bambini", "sort": 20,
     "titolo_override": "Secondo piatto bambini",
     "descrizione_override": "Disponibile su richiesta.",
     "prezzo_singolo": 15},
]


# ─────────────────────────────────────────────────────────────────────────
# Tasting paths
# ─────────────────────────────────────────────────────────────────────────
TASTING_PATHS = [
    {
        "nome": "Prima volta",
        "sottotitolo": "Per la prima volta nella nostra osteria ti consigliamo di assaggiare il meglio della cucina Bergamasca nella nostra interpretazione. Il metodo migliore per conoscerci.",
        "prezzo_persona": 60,
        "note": "Le degustazioni sono da considerarsi per tutto il tavolo. Fatto salvo allergie ed intolleranze per le quali proporremo alternative.",
        "sort": 10,
        "steps": [
            {"sort": 10, "titolo_libero": "Antipasto misto dell'osteria"},
            {"sort": 20, "publication_menu_name": "Casoncelli di mamma e papà"},
            {"sort": 30, "publication_menu_name": "Brasato di manzo e polenta"},
            {"sort": 40, "titolo_libero": "Dolce a scelta"},
        ],
    },
    {
        "nome": "Fidati dell'Oste",
        "sottotitolo": "I piatti consigliati dall'Oste, quelli che rappresentano la stagione e il momento. Spesso con variazioni raccontate a voce.",
        "prezzo_persona": 75,
        "note": "Le degustazioni sono da considerarsi per tutto il tavolo. Fatto salvo allergie ed intolleranze per le quali proporremo alternative.",
        "sort": 20,
        "steps": [
            {"sort": 10, "publication_menu_name": "Cappuccino di baccalà e patata"},
            {"sort": 20, "publication_menu_name": "Il Vitello Tonnato dell'Osteria"},
            {"sort": 30, "publication_menu_name": "Fettuccine all'Alfredo \"se fosse stato di Bergamo\""},
            {"sort": 40, "publication_menu_name": "Risotto alla Vignarola"},
            {"sort": 50, "publication_menu_name": "Faraona, carote, senape e miele"},
            {"sort": 60, "titolo_libero": "Dolce a scelta"},
        ],
    },
]


# ─────────────────────────────────────────────────────────────────────────
# upgrade()
# ─────────────────────────────────────────────────────────────────────────
def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # ── 1. Edizione (idempotente per slug) ──
    existing = cur.execute(
        "SELECT id FROM menu_editions WHERE slug = ?",
        (EDITION["slug"],),
    ).fetchone()
    if existing:
        edition_id = existing[0]
        print(f"  · edizione '{EDITION['nome']}' gia' presente (id={edition_id})")
    else:
        cur.execute(
            """
            INSERT INTO menu_editions
                (nome, slug, stagione, anno, data_inizio, data_fine,
                 stato, note, pdf_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                EDITION["nome"], EDITION["slug"], EDITION["stagione"], EDITION["anno"],
                EDITION["data_inizio"], EDITION["data_fine"], EDITION["stato"],
                EDITION["note"], EDITION["pdf_path"],
            ),
        )
        edition_id = cur.lastrowid
        print(f"  + edizione '{EDITION['nome']}' creata (id={edition_id})")

    # ── 2. Pulizia pubblicazioni / degustazioni precedenti per re-seed pulito ──
    n_old_pubs = cur.execute(
        "SELECT count(*) FROM menu_dish_publications WHERE edition_id = ?",
        (edition_id,),
    ).fetchone()[0]
    if n_old_pubs > 0:
        cur.execute("DELETE FROM menu_dish_publications WHERE edition_id = ?", (edition_id,))
        print(f"  · {n_old_pubs} pubblicazioni precedenti rimosse (re-seed pulito)")

    n_old_paths = cur.execute(
        "SELECT count(*) FROM menu_tasting_paths WHERE edition_id = ?",
        (edition_id,),
    ).fetchone()[0]
    if n_old_paths > 0:
        cur.execute("DELETE FROM menu_tasting_paths WHERE edition_id = ?", (edition_id,))
        print(f"  · {n_old_paths} degustazioni precedenti rimosse (cascade su steps)")

    # ── 3. Mappa menu_name -> recipe_id (cache) ──
    recipe_id_by_menu_name: dict[str, int] = {}
    for r in cur.execute("SELECT id, menu_name FROM recipes WHERE menu_name IS NOT NULL"):
        recipe_id_by_menu_name[r[1]] = r[0]

    # ── 4. Inserisci publications da recipe ──
    publication_id_by_menu_name: dict[str, int] = {}
    inseriti_recipe = 0
    not_found = []
    for p in PUBLICATIONS_FROM_RECIPE:
        recipe_id = recipe_id_by_menu_name.get(p["menu_name"])
        if not recipe_id:
            not_found.append(p["menu_name"])
            continue

        cur.execute(
            """
            INSERT INTO menu_dish_publications
                (edition_id, recipe_id, sezione, sort_order,
                 prezzo_singolo, prezzo_min, prezzo_max,
                 prezzo_piccolo, prezzo_grande, prezzo_label,
                 consigliato_per, descrizione_variabile, badge,
                 allergeni_dichiarati, is_visible)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                edition_id, recipe_id, p["sezione"], p["sort"],
                p.get("prezzo_singolo"), p.get("prezzo_min"), p.get("prezzo_max"),
                p.get("prezzo_piccolo"), p.get("prezzo_grande"), p.get("prezzo_label"),
                p.get("consigliato_per"), p.get("descrizione_variabile", 0), p.get("badge"),
                p.get("allergeni"),
            ),
        )
        publication_id_by_menu_name[p["menu_name"]] = cur.lastrowid
        inseriti_recipe += 1

    print(f"  + {inseriti_recipe} publications da recipe inserite")
    if not_found:
        print(f"  ⚠ {len(not_found)} ricette non trovate per menu_name:")
        for nm in not_found:
            print(f"    - {nm}")

    # ── 5. Inserisci publications "documentali" ──
    inseriti_doc = 0
    for p in PUBLICATIONS_DOCUMENT:
        cur.execute(
            """
            INSERT INTO menu_dish_publications
                (edition_id, recipe_id, sezione, sort_order,
                 titolo_override, descrizione_override,
                 prezzo_singolo, prezzo_min, prezzo_max, prezzo_label,
                 consigliato_per, descrizione_variabile, is_visible)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                edition_id, p["sezione"], p["sort"],
                p.get("titolo_override"), p.get("descrizione_override"),
                p.get("prezzo_singolo"), p.get("prezzo_min"), p.get("prezzo_max"), p.get("prezzo_label"),
                p.get("consigliato_per"), p.get("descrizione_variabile", 0),
            ),
        )
        inseriti_doc += 1
    print(f"  + {inseriti_doc} publications documentali (servizio/bambini/piatti del giorno) inserite")

    # ── 6. Inserisci tasting_paths + steps ──
    inseriti_paths = 0
    inseriti_steps = 0
    for tp in TASTING_PATHS:
        cur.execute(
            """
            INSERT INTO menu_tasting_paths
                (edition_id, nome, sottotitolo, prezzo_persona, note, sort_order, is_visible)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            (edition_id, tp["nome"], tp["sottotitolo"], tp["prezzo_persona"],
             tp["note"], tp["sort"]),
        )
        path_id = cur.lastrowid
        inseriti_paths += 1

        for s in tp["steps"]:
            pub_id = publication_id_by_menu_name.get(s.get("publication_menu_name")) if s.get("publication_menu_name") else None
            cur.execute(
                """
                INSERT INTO menu_tasting_path_steps
                    (path_id, sort_order, publication_id, titolo_libero, note)
                VALUES (?, ?, ?, ?, ?)
                """,
                (path_id, s["sort"], pub_id, s.get("titolo_libero"), s.get("note")),
            )
            inseriti_steps += 1

    print(f"  + {inseriti_paths} tasting paths inseriti con {inseriti_steps} steps totali")

    conn.commit()
    print(f"  [100] menu carta 'Primavera 2026' caricato")
