# Seed edizione Menu Carta "Autunno 2026" (menu ottobre-novembre-dicembre) —
# specifico Tre Gobbi. Saltato dal migration_runner quando
# TRGB_LOCALE != "tregobbi". Vedi locali/tregobbi/seeds/MIGRATIONS_TRGB.md.
TRGB_SPECIFIC = True

"""
Migrazione 180 — Seed edizione Menu Carta "Autunno 2026" — [locale:tregobbi]

Modulo: menu_carta

Fonte: PDF "menu-ott-nov-dic-2026-web.pdf" (OneDrive 04-Cucina/01-Menu-Attivi).
Stesso schema della mig 154 (Estate 2026).

Cosa fa:
  1. Crea le ricette piatto NUOVE (skeleton: name, menu_name,
     menu_description, category_id, kind='dish', selling_price — niente
     recipe_items, si rifiniscono dal modulo Ricette). Se esiste gia' una
     ricetta con lo stesso `name` ma senza menu_name (es. "Lucia di
     Lammermoor", creata a mano) la completa invece di duplicarla.
  2. Archivia l'edizione 'in_carta' (Estate 2026).
  3. Crea "Autunno 2026" in stato 'in_carta' con publications, servizio,
     bambini, piatti del giorno e le 2 degustazioni.
  4. Traduzioni: per le voci rimaste IDENTICHE all'Estate (stessa ricetta,
     stessi override di titolo/descrizione) copia le traduzioni EN/FR/ES/DE/UK
     dalla publication estiva. Le voci nuove o cambiate restano in italiano
     (fallback) finche' non si traducono dal tab Traduzioni.

Differenze vs Estate 2026:
  - NUOVI: Rosa di zucca, Battuta di manzo porcini e nocciola, Risotto allo
    stracchino all'antica mela Kissabel e sidro, Pasta mista e fagioli gialet,
    Pipe rigate bisque e Moscato di Scanzo, Anatra barbabietola rosa canina e
    caffe', Rognone trifolato, Lucia di Lammermoor, Torta di nocciole.
  - RIENTRANO (ricette Primavera): Formaggi italiani/francesi, Lasagnetta
    (ora "al ragu' bianco dei Tre Gobbi"), Filetto alla Donizetti (nuova
    descrizione).
  - USCITI: Parmigiana, Carpaccio cuore di bue, Battuta e cocomero, Risotto
    albicocca, Zuppiera scoglio, Spaghettoni vongole, Paccheri tre pomodori,
    Anatra ribes e lattuga, Entrecote finferli, Cinghiale, Pesca Melba.
  - PREZZI: Ossobuco 26 -> 28.

Tag dietetici (V)(VG)(NG)(NL)(O..) del cartaceo: non c'e' un campo a DB
(cfr. nota mig 164) — non riportati, come per l'Estate.

NB allergeni: per i piatti nuovi solo quelli evidenti dagli ingredienti in
carta. DA VERIFICARE dall'app (modale pubblicazione).

Idempotenza: ricette per menu_name/name, edizione per slug, publications e
degustazioni dell'edizione DELETE + re-insert, traduzioni ON CONFLICT DO NOTHING.
"""

import sqlite3


EDITION = {
    "nome": "Autunno 2026",
    "slug": "autunno-2026",
    "stagione": "autunno",
    "anno": 2026,
    "data_inizio": "2026-10-01",
    "data_fine": "2026-12-31",
    "stato": "in_carta",
    "note": "Menu ottobre-novembre-dicembre 2026, caricato dal PDF menu-ott-nov-dic-2026-web.pdf — sessione 2026-10-04.",
    "pdf_path": "menu-ott-nov-dic-2026-web.pdf",
}

SLUG_PRECEDENTE = "estate-2026"   # sorgente delle traduzioni da copiare


NEW_RECIPES = [
    # ── ANTIPASTI ──
    {"name": "Rosa di zucca", "menu_name": "Rosa di zucca",
     "menu_description": "Millefoglie di zucca violina e butternut, su crema di zucca hokkaido e fonduta di Taleggio DOP. Adattabile vegana.",
     "category": "Antipasto", "selling_price": 16, "allergeni": "latte"},
    {"name": "Battuta di manzo, porcini e nocciola", "menu_name": "Battuta di manzo, porcini e nocciola",
     "menu_description": "Battuta di manzo al coltello condita alla moda dell'osteria, porcini spadellati, nocciole tostate con un filo d'olio di nocciola e un tuorlo al centro che lega tutto.",
     "category": "Antipasto", "selling_price": 22, "allergeni": "frutta_a_guscio,uova"},

    # ── PASTE, RISI E ZUPPE ──
    {"name": "Risotto stracchino all'antica, mela Kissabel e sidro",
     "menu_name": "Risotto allo stracchino all'antica, mela Kissabel e sidro",
     "menu_description": "Carnaroli riserva \"San Massimo\" sfumato al sidro, mantecato allo Stracchino all'antica delle valli orobiche, Presidio Slow Food, con la mela dalla polpa rossa come una ciliegia.",
     "category": "Primo", "selling_price": 18, "allergeni": "latte,solfiti"},
    {"name": "Pasta mista e fagioli gialet", "menu_name": "Pasta mista e fagioli gialèt",
     "menu_description": "La \"pasta dei frati\" di casa nostra: i fondi delle confezioni mischiati insieme, cotti con i fagioli gialèt della Val Belluna, Presidio Slow Food, castagne arrostite e olio al rosmarino.",
     "category": "Primo", "selling_price": 16, "allergeni": "glutine"},
    {"name": "Pipe rigate, bisque di gamberi e Moscato di Scanzo",
     "menu_name": "Pipe rigate, bisque di gamberi e ristretto di Moscato di Scanzo",
     "menu_description": "Bisque concentrata fatta in casa con le teste e i carapaci dei gamberi, e un ristretto di Moscato di Scanzo DOCG, il passito rosso dei colli di Bergamo.",
     "category": "Primo", "selling_price": 22, "allergeni": "glutine,crostacei,solfiti"},

    # ── SECONDI ──
    {"name": "Anatra, barbabietola, rosa canina e caffe'",
     "menu_name": "Anatra, barbabietola, rosa canina e caffè",
     "menu_description": "Petto d'anatra in lunga cottura, fondo al caffè della nostra moka, crema di barbabietola e agrodolce di bacche di rosa canina dei nostri colli.",
     "category": "Secondo", "selling_price": 26, "allergeni": None},
    {"name": "Rognone di vitello trifolato ai funghi",
     "menu_name": "Rognone di vitello trifolato con i funghi del bosco",
     "menu_description": "Rognone di vitello saltato al momento, con aglio, prezzemolo, una sfumata di vino e i funghi che il bosco ci dà in quel momento. Servito sul purè.",
     "category": "Secondo", "selling_price": 24, "allergeni": "latte,solfiti"},

    # ── DOLCI ──
    {"name": "Lucia di Lammermoor", "menu_name": "\"Lucia di Lammermoor\"",
     "menu_description": "Semifreddo alla vaniglia, clementine caramellate, gel di melograno e amaretti. Per l'opera più celebre di Donizetti, che cantava Nellie Melba, la stessa della Pesca Melba, e per la nostra Santa Lucia, che la notte del 12 dicembre lascia ai bambini bergamaschi gli agrumi d'inverno. Senza glutine.",
     "category": "Dolce", "selling_price": 10, "allergeni": "latte,uova,frutta_a_guscio"},
    {"name": "Torta di nocciole, cioccolato e zabaione al Moscato",
     "menu_name": "Torta di nocciole, cioccolato fondente e zabaione al Moscato di Scanzo",
     "menu_description": "Torta di nocciole servita tiepida, con un velo di cioccolato fondente amaro, sale in fiocchi e uno zabaione al Moscato di Scanzo montato al momento. Senza glutine.",
     "category": "Dolce", "selling_price": 10, "allergeni": "frutta_a_guscio,latte,solfiti,uova"},
]


PUBLICATIONS_FROM_RECIPE = [
    # ── ANTIPASTI (ordine PDF) ──
    {"menu_name": "Rosa di zucca",                       "sezione": "antipasti", "sort": 10, "prezzo_singolo": 16, "allergeni": "latte"},
    {"menu_name": "Cappuccino di baccalà e patata",      "sezione": "antipasti", "sort": 20, "prezzo_singolo": 16, "allergeni": "pesce,latte"},
    {"menu_name": "Cozze in blu",                        "sezione": "antipasti", "sort": 30, "prezzo_singolo": 16, "allergeni": "molluschi,latte"},
    {"menu_name": "Sua Maestà \"La Taragna\"",           "sezione": "antipasti", "sort": 40, "prezzo_singolo": 16, "allergeni": "latte"},
    {"menu_name": "Battuta di manzo, porcini e nocciola", "sezione": "antipasti", "sort": 50, "prezzo_singolo": 22, "allergeni": "frutta_a_guscio,uova"},
    {"menu_name": "Il Vitello Tonnato dell'Osteria",     "sezione": "antipasti", "sort": 60, "prezzo_singolo": 22, "allergeni": "pesce,uova",
     "descrizione_override": "Spuma di salsa tonnata fresca, fondo bruno e capperi su un meraviglioso girello di vitello cotto al punto rosa. Ispirato da Diego Rossi, e a lui dedicato."},
    {"menu_name": "Il salame del Roberto con la giardiniera", "sezione": "antipasti", "sort": 70, "prezzo_singolo": 16, "allergeni": "solfiti",
     "descrizione_override": "Il salame che fa il Roberto, stagionato lentamente in cantina e tagliato a fette grosse, accompagnato dalle nostre verdure."},
    {"menu_name": "I nostri salumi misti",               "sezione": "antipasti", "sort": 80, "prezzo_singolo": 20, "allergeni": "solfiti",
     "consigliato_per": 2, "titolo_override": "I salumi misti dell'osteria"},
    {"menu_name": "Le selezioni di formaggi italiani",   "sezione": "antipasti", "sort": 90,
     "prezzo_piccolo": 14, "prezzo_grande": 20, "prezzo_label": "14 (4 pezzi) / 20 (6 pezzi)", "allergeni": "latte"},
    {"menu_name": "Le selezioni di formaggi francesi",   "sezione": "antipasti", "sort": 100,
     "prezzo_piccolo": 15, "prezzo_grande": 25, "prezzo_label": "15 (3 pezzi) / 25 (5 pezzi)", "allergeni": "latte"},

    # ── PASTE, RISI E ZUPPE (ordine PDF) ──
    {"menu_name": "Risotto allo stracchino all'antica, mela Kissabel e sidro", "sezione": "paste_risi_zuppe", "sort": 10, "prezzo_singolo": 18, "allergeni": "latte,solfiti"},
    {"menu_name": "Fettuccine all'Alfredo \"se fosse stato di Bergamo\"",     "sezione": "paste_risi_zuppe", "sort": 20, "prezzo_singolo": 18, "allergeni": "glutine,latte,uova",
     "titolo_override": "Fettuccine all'Alfredo se fosse nato a Bergamo"},
    {"menu_name": "Casoncelli di mamma e papà",           "sezione": "paste_risi_zuppe", "sort": 30, "prezzo_singolo": 18, "allergeni": "glutine,latte,uova", "badge": "classico"},
    {"menu_name": "Fusilloni al salmì di lepre e branzi", "sezione": "paste_risi_zuppe", "sort": 40, "prezzo_singolo": 20, "allergeni": "glutine,latte,solfiti"},
    {"menu_name": "Pasta mista e fagioli gialèt",         "sezione": "paste_risi_zuppe", "sort": 50, "prezzo_singolo": 16, "allergeni": "glutine"},
    {"menu_name": "Pipe rigate, bisque di gamberi e ristretto di Moscato di Scanzo", "sezione": "paste_risi_zuppe", "sort": 60, "prezzo_singolo": 22, "allergeni": "glutine,crostacei,solfiti"},
    {"menu_name": "Lasagnetta al ragù di cortile",        "sezione": "paste_risi_zuppe", "sort": 70, "prezzo_singolo": 20, "allergeni": "glutine,latte,uova,sedano",
     "titolo_override": "Lasagnetta al ragù bianco dei Tre Gobbi",
     "descrizione_override": "Una cottura di tre giorni per un ragù con le carni bianche di faraona, gallina, pollo, anatra e coniglio. Succulento, generoso, buono. Chiuso in una golosissima lasagna."},

    # ── SECONDI (ordine PDF) ──
    {"menu_name": "Anatra, barbabietola, rosa canina e caffè", "sezione": "secondi", "sort": 10, "prezzo_singolo": 26},
    {"menu_name": "Filetto alla Donizetti",               "sezione": "secondi", "sort": 20, "prezzo_singolo": 35, "allergeni": "solfiti", "badge": "firma",
     "descrizione_override": "Filetto di manzo, il suo fondo di cottura, crema di topinambur, pera cotta nel Valcalepio, lardo che si scioglie sul filetto e tartufo nero grattato."},
    {"menu_name": "Ossobuco di vitello con purè",         "sezione": "secondi", "sort": 30, "prezzo_singolo": 28, "allergeni": "latte,sedano,solfiti"},
    {"menu_name": "Vuoi un piatto unico con ossobuco e risotto giallo?", "sezione": "secondi", "sort": 40, "prezzo_singolo": 35, "allergeni": "latte,sedano,solfiti"},
    {"menu_name": "Guancetta di maialino brasata e polenta", "sezione": "secondi", "sort": 50, "prezzo_singolo": 24, "allergeni": "solfiti"},
    {"menu_name": "Coniglio alla bergamasca",             "sezione": "secondi", "sort": 60, "prezzo_singolo": 24, "allergeni": "solfiti"},
    {"menu_name": "Rognone di vitello trifolato con i funghi del bosco", "sezione": "secondi", "sort": 70, "prezzo_singolo": 24, "allergeni": "latte,solfiti"},
    {"menu_name": "Pescato del giorno",                   "sezione": "secondi", "sort": 80, "prezzo_singolo": 26, "allergeni": "pesce",
     "descrizione_variabile": 1, "descrizione_override": "Chiedici come l'abbiamo cucinato oggi."},

    # ── CONTORNI (invariati) ──
    {"menu_name": "Polenta nostrana",                  "sezione": "contorni", "sort": 10, "prezzo_singolo": 4},
    {"menu_name": "Assaggio di Sua Maestà la Taragna", "sezione": "contorni", "sort": 20, "prezzo_singolo": 8, "allergeni": "latte"},
    {"menu_name": "Purè di patate cremosissimo",       "sezione": "contorni", "sort": 30, "prezzo_singolo": 6, "allergeni": "latte"},
    {"menu_name": "Patate arrosto",                    "sezione": "contorni", "sort": 40, "prezzo_singolo": 6},
    {"menu_name": "Spadellata di verdure",             "sezione": "contorni", "sort": 50, "prezzo_singolo": 6},
    {"menu_name": "Giardiniera di verdure",            "sezione": "contorni", "sort": 60, "prezzo_singolo": 6},
    {"menu_name": "Insalata mista di stagione",        "sezione": "contorni", "sort": 70, "prezzo_singolo": 6},

    # ── DOLCI ──
    {"menu_name": "La piantina del tiramisù",          "sezione": "dolci", "sort": 10, "prezzo_singolo": 10, "allergeni": "latte,uova", "badge": "classico"},
    {"menu_name": "Cheesecake ai frutti di bosco",     "sezione": "dolci", "sort": 20, "prezzo_singolo": 9,  "allergeni": "latte"},
    {"menu_name": "Ti ricordi il \"Solero\"?",         "sezione": "dolci", "sort": 30, "prezzo_singolo": 9},
    {"menu_name": "Panna cotta dell'Ingegner Danisi",  "sezione": "dolci", "sort": 40, "prezzo_singolo": 9,  "allergeni": "latte"},
    {"menu_name": "\"Lucia di Lammermoor\"",           "sezione": "dolci", "sort": 50, "prezzo_singolo": 10, "allergeni": "latte,uova,frutta_a_guscio"},
    {"menu_name": "Torta di nocciole, cioccolato fondente e zabaione al Moscato di Scanzo", "sezione": "dolci", "sort": 60, "prezzo_singolo": 10, "allergeni": "frutta_a_guscio,latte,solfiti,uova"},
]


PUBLICATIONS_DOCUMENT = [
    {"sezione": "piatti_del_giorno", "sort": 10,
     "titolo_override": "Raccontati a voce",
     "descrizione_override": "Come sulla lavagna dell'osteria, tutte le idee del giorno con i prodotti migliori in tiratura limitata. Possono finire subito!",
     "prezzo_min": 14, "prezzo_max": 26, "prezzo_label": "da 14 a 26", "descrizione_variabile": 1},

    {"sezione": "servizio", "sort": 10, "titolo_override": "Tè e tisane",  "prezzo_singolo": 10},
    {"sezione": "servizio", "sort": 20, "titolo_override": "Espresso",     "prezzo_singolo": 3},
    {"sezione": "servizio", "sort": 30, "titolo_override": "Moka \"Pump\"",
     "descrizione_override": "Degustazione per due.", "prezzo_singolo": 10, "consigliato_per": 2},
    {"sezione": "servizio", "sort": 40, "titolo_override": "Acqua",        "prezzo_singolo": 3},
    {"sezione": "servizio", "sort": 50, "titolo_override": "Coperto",      "prezzo_singolo": 5},

    {"sezione": "bambini", "sort": 10, "titolo_override": "Primo piatto bambini",
     "descrizione_override": "Disponibile su richiesta.", "prezzo_singolo": 10},
    {"sezione": "bambini", "sort": 20, "titolo_override": "Secondo piatto bambini",
     "descrizione_override": "Disponibile su richiesta.", "prezzo_singolo": 15},
]


NOTE_DEGUSTAZIONI = ("Le degustazioni sono da considerarsi per tutto il tavolo. "
                     "Fatte salve allergie e intolleranze, per le quali proporremo alternative.")

TASTING_PATHS = [
    {"nome": "Prima volta",
     "sottotitolo": "Per la prima volta nella nostra osteria ti consigliamo di assaggiare il meglio della cucina Bergamasca nella nostra interpretazione! Il metodo migliore per conoscerci.",
     "prezzo_persona": 60, "note": NOTE_DEGUSTAZIONI, "sort": 10,
     "steps": [
         {"sort": 10, "titolo_libero": "Antipasto misto dell'osteria"},
         {"sort": 20, "publication_menu_name": "Casoncelli di mamma e papà"},
         {"sort": 30, "titolo_libero": "Coniglio o Guancetta a tua scelta"},
         {"sort": 40, "titolo_libero": "Dolce a scelta"},
     ]},
    {"nome": "Fidati dell'oste",
     "sottotitolo": "I piatti consigliati dall'Oste, quelli che rappresentano la stagione ed il momento. Molto spesso con variazioni raccontate a voce.",
     "prezzo_persona": 75, "note": NOTE_DEGUSTAZIONI, "sort": 20,
     "steps": [
         {"sort": 10, "publication_menu_name": "Battuta di manzo, porcini e nocciola"},
         {"sort": 20, "publication_menu_name": "Rosa di zucca"},
         {"sort": 30, "publication_menu_name": "Risotto allo stracchino all'antica, mela Kissabel e sidro"},
         {"sort": 40, "publication_menu_name": "Anatra, barbabietola, rosa canina e caffè"},
         {"sort": 50, "titolo_libero": "Dolce a scelta"},
     ]},
]


def _copia_traduzioni(cur, entita, src_id, dst_id, salta_campi=()):
    righe = cur.execute(
        "SELECT lang, campo, valore, rivisto FROM menu_translations WHERE entita = ? AND entita_id = ?",
        (entita, src_id),
    ).fetchall()
    n = 0
    for lang, campo, valore, rivisto in righe:
        if campo in salta_campi:
            continue
        cur.execute(
            """INSERT INTO menu_translations (entita, entita_id, lang, campo, valore, rivisto)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (entita, entita_id, lang, campo) DO NOTHING""",
            (entita, dst_id, lang, campo, valore, rivisto),
        )
        n += cur.rowcount
    return n


def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")

    # ── 1. Ricette nuove (idempotente per menu_name; completa per name) ──
    cat_id_by_name = {r[1]: r[0] for r in cur.execute("SELECT id, name FROM recipe_categories")}
    esistenti = {r[0] for r in cur.execute("SELECT menu_name FROM recipes WHERE menu_name IS NOT NULL")}
    create, completate, skippate = 0, 0, 0
    for r in NEW_RECIPES:
        if r["menu_name"] in esistenti:
            skippate += 1
            continue
        stub = cur.execute(
            "SELECT id FROM recipes WHERE name = ? AND menu_name IS NULL AND kind = 'dish' ORDER BY id LIMIT 1",
            (r["name"],),
        ).fetchone()
        if stub:
            cur.execute(
                """UPDATE recipes SET menu_name = ?, menu_description = ?,
                       selling_price = COALESCE(selling_price, ?)
                   WHERE id = ?""",
                (r["menu_name"], r["menu_description"], r.get("selling_price"), stub[0]),
            )
            completate += 1
            continue
        cat_id = cat_id_by_name.get(r["category"])
        if cat_id is None:
            print(f"  ⚠ categoria '{r['category']}' non trovata — skip '{r['menu_name']}'")
            continue
        cur.execute(
            """
            INSERT INTO recipes
                (name, menu_name, menu_description, category_id, kind, is_base,
                 yield_qty, yield_unit, selling_price, allergeni_calcolati, is_active)
            VALUES (?, ?, ?, ?, 'dish', 0, 1, 'porzione', ?, ?, 1)
            """,
            (r["name"], r["menu_name"], r["menu_description"], cat_id,
             r.get("selling_price"), r.get("allergeni")),
        )
        create += 1
    print(f"  + {create} ricette nuove, {completate} completate, {skippate} gia' esistenti")

    # ── 2. Edizione precedente (per le traduzioni) + archiviazione ──
    prec = cur.execute("SELECT id FROM menu_editions WHERE slug = ?", (SLUG_PRECEDENTE,)).fetchone()
    prec_id = prec[0] if prec else None
    for pid, pnome in cur.execute(
        "SELECT id, nome FROM menu_editions WHERE stato = 'in_carta' AND slug != ?", (EDITION["slug"],)
    ).fetchall():
        cur.execute("UPDATE menu_editions SET stato = 'archiviata', updated_at = datetime('now') WHERE id = ?", (pid,))
        print(f"  · edizione '{pnome}' (id={pid}) archiviata")

    # ── 3. Edizione (idempotente per slug) ──
    existing = cur.execute("SELECT id FROM menu_editions WHERE slug = ?", (EDITION["slug"],)).fetchone()
    if existing:
        edition_id = existing[0]
        cur.execute("UPDATE menu_editions SET stato = ?, updated_at = datetime('now') WHERE id = ?",
                    (EDITION["stato"], edition_id))
    else:
        cur.execute(
            """INSERT INTO menu_editions
                   (nome, slug, stagione, anno, data_inizio, data_fine, stato, note, pdf_path)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (EDITION["nome"], EDITION["slug"], EDITION["stagione"], EDITION["anno"],
             EDITION["data_inizio"], EDITION["data_fine"], EDITION["stato"],
             EDITION["note"], EDITION["pdf_path"]),
        )
        edition_id = cur.lastrowid
    print(f"  + edizione '{EDITION['nome']}' id={edition_id} stato={EDITION['stato']}")

    # ── 4. Re-seed pulito (traduzioni comprese: entita_id polimorfico, niente cascade) ──
    vecchie = [r[0] for r in cur.execute("SELECT id FROM menu_dish_publications WHERE edition_id = ?", (edition_id,))]
    for pid in vecchie:
        cur.execute("DELETE FROM menu_translations WHERE entita = 'publication' AND entita_id = ?", (pid,))
    cur.execute("DELETE FROM menu_dish_publications WHERE edition_id = ?", (edition_id,))
    vecchi_tp = [r[0] for r in cur.execute("SELECT id FROM menu_tasting_paths WHERE edition_id = ?", (edition_id,))]
    for tid in vecchi_tp:
        cur.execute("DELETE FROM menu_translations WHERE entita = 'tasting_path' AND entita_id = ?", (tid,))
    cur.execute("DELETE FROM menu_tasting_paths WHERE edition_id = ?", (edition_id,))

    # ── 5. Publications precedenti per il match traduzioni ──
    prec_pubs = {}
    if prec_id:
        for row in cur.execute(
            """SELECT id, recipe_id, sezione, titolo_override, descrizione_override, prezzo_label
               FROM menu_dish_publications WHERE edition_id = ?""", (prec_id,)
        ):
            pid, rid, sez, tit, desc, plabel = row
            chiave = ("r", rid, tit, desc) if rid else ("d", sez, tit, desc)
            prec_pubs[chiave] = (pid, plabel)

    recipe_id_by_menu_name = {
        r[1]: r[0] for r in cur.execute("SELECT id, menu_name FROM recipes WHERE menu_name IS NOT NULL")
    }

    INS = """
        INSERT INTO menu_dish_publications
            (edition_id, recipe_id, sezione, sort_order,
             titolo_override, descrizione_override,
             prezzo_singolo, prezzo_min, prezzo_max,
             prezzo_piccolo, prezzo_grande, prezzo_label,
             consigliato_per, descrizione_variabile, badge,
             allergeni_dichiarati, is_visible)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    """
    n_trad = 0

    def _inserisci(recipe_id, p):
        nonlocal n_trad
        cur.execute(INS, (
            edition_id, recipe_id, p["sezione"], p["sort"],
            p.get("titolo_override"), p.get("descrizione_override"),
            p.get("prezzo_singolo"), p.get("prezzo_min"), p.get("prezzo_max"),
            p.get("prezzo_piccolo"), p.get("prezzo_grande"), p.get("prezzo_label"),
            p.get("consigliato_per"), p.get("descrizione_variabile", 0), p.get("badge"),
            p.get("allergeni"),
        ))
        new_id = cur.lastrowid
        chiave = (("r", recipe_id, p.get("titolo_override"), p.get("descrizione_override"))
                  if recipe_id else ("d", p["sezione"], p.get("titolo_override"), p.get("descrizione_override")))
        src = prec_pubs.get(chiave)
        if src:
            salta = () if src[1] == p.get("prezzo_label") else ("prezzo_label",)
            n_trad += _copia_traduzioni(cur, "publication", src[0], new_id, salta)
        return new_id

    # ── 6. Publications da ricetta ──
    pub_id_by_menu_name, not_found = {}, []
    for p in PUBLICATIONS_FROM_RECIPE:
        rid = recipe_id_by_menu_name.get(p["menu_name"])
        if not rid:
            not_found.append(p["menu_name"])
            continue
        pub_id_by_menu_name[p["menu_name"]] = _inserisci(rid, p)
    print(f"  + {len(pub_id_by_menu_name)} publications da ricetta")
    for nm in not_found:
        print(f"  ⚠ ricetta non trovata: {nm}")

    # ── 7. Publications documentali ──
    for p in PUBLICATIONS_DOCUMENT:
        _inserisci(None, p)
    print(f"  + {len(PUBLICATIONS_DOCUMENT)} publications documentali")

    # ── 8. Degustazioni ──
    prec_tp = {}
    if prec_id:
        for tid, nome, sott, note in cur.execute(
            "SELECT id, nome, sottotitolo, note FROM menu_tasting_paths WHERE edition_id = ?", (prec_id,)
        ):
            prec_tp[(nome, sott, note)] = tid
    for tp in TASTING_PATHS:
        cur.execute(
            """INSERT INTO menu_tasting_paths
                   (edition_id, nome, sottotitolo, prezzo_persona, note, sort_order, is_visible)
               VALUES (?, ?, ?, ?, ?, ?, 1)""",
            (edition_id, tp["nome"], tp["sottotitolo"], tp["prezzo_persona"], tp["note"], tp["sort"]),
        )
        path_id = cur.lastrowid
        src = prec_tp.get((tp["nome"], tp["sottotitolo"], tp["note"]))
        if src:
            n_trad += _copia_traduzioni(cur, "tasting_path", src, path_id)
        for s in tp["steps"]:
            nm = s.get("publication_menu_name")
            pub_id = pub_id_by_menu_name.get(nm) if nm else None
            if nm and pub_id is None:
                print(f"  ⚠ step '{nm}' senza publication — inserito come titolo libero")
            cur.execute(
                """INSERT INTO menu_tasting_path_steps (path_id, sort_order, publication_id, titolo_libero, note)
                   VALUES (?, ?, ?, ?, ?)""",
                (path_id, s["sort"], pub_id,
                 s.get("titolo_libero") or (nm if pub_id is None else None), s.get("note")),
            )
    print(f"  + {len(TASTING_PATHS)} degustazioni")
    print(f"  + {n_trad} traduzioni copiate dall'edizione '{SLUG_PRECEDENTE}'")

    conn.commit()
    print("  [180] menu carta 'Autunno 2026' caricato e in carta")
