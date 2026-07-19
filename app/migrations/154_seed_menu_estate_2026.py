# Seed edizione Menu Carta "Estate 2026" (menu luglio-agosto-settembre) —
# specifico Tre Gobbi. Saltato dal migration_runner quando
# TRGB_LOCALE != "tregobbi". Vedi locali/tregobbi/seeds/MIGRATIONS_TRGB.md.
TRGB_SPECIFIC = True

"""
Migrazione 154 — Seed edizione Menu Carta "Estate 2026" (sessione 2026-07-19)

Fonte: PDF "menulugagoset2026web.pdf" (menu luglio-agosto-settembre 2026).

Cosa fa:
  1. Crea le ricette piatto NUOVE del menu estate che non esistono ancora
     (skeleton: name, menu_name, menu_description, category_id, kind='dish',
     selling_price = prezzo carta — niente recipe_items, li rifinisce Marco
     dal modulo Ricette). 20 ricette nuove, di cui 5 DOLCI (prima sezione
     dolci in assoluto — la sezione 'dolci' e' introdotta nel router in
     questo stesso rilascio, [core]).
  2. Archivia l'edizione attualmente 'in_carta' (Primavera 2026).
  3. Crea l'edizione "Estate 2026" stato 'in_carta' (il menu e' gia' servito
     in osteria) con:
       - 21 publications da ricetta esistente/nuova
       - 5 publications sezione 'dolci'
       - 1 publication 'piatti_del_giorno' (descrizione_variabile)
       - 5 publications 'servizio' + 2 'bambini'
       - 2 tasting paths ("Prima volta" 60, "Fidati dell'oste" 75)

Differenze vs Primavera 2026 (per la cronaca):
  - USCITI: Tegamino asparagi, Tartare dell'Oste, formaggi italiani/francesi,
    Risotto Vignarola, Lasagnetta, Pasta mista sarda, Trippa, Faraona,
    Filetto Donizetti, Brasato, Arrosto di coniglio e agretti.
  - PREZZI: Vitello tonnato 20->22, Ossobuco 24->26, The e tisane 8->10.
  - RINOMINATI (titolo_override, la ricetta resta invariata):
    "I nostri salumi misti" -> "I salumi misti dell'osteria",
    "Fettuccine all'Alfredo \"se fosse stato di Bergamo\"" ->
    "Fettuccine all'Alfredo se fosse nato a Bergamo".

Idempotenza:
  - Ricette: SELECT WHERE menu_name — skip se esiste.
  - Edizione: SELECT WHERE slug — riusa se esiste.
  - Publications/degustazioni dell'edizione: DELETE + re-insert (re-seed pulito).

NB allergeni: per i piatti nuovi sono dichiarati solo quelli evidenti dagli
ingredienti in carta. DA VERIFICARE da Marco/cuochi dall'app (modale
pubblicazione, tab Allergeni).

Riferimenti:
  - app/migrations/100_seed_menu_primavera_2026.py (pattern)
  - app/migrations/098_menu_carta_init.py (schema)
"""

import sqlite3


# ─────────────────────────────────────────────────────────────────────────
# Edizione
# ─────────────────────────────────────────────────────────────────────────
EDITION = {
    "nome": "Estate 2026",
    "slug": "estate-2026",
    "stagione": "estate",
    "anno": 2026,
    "data_inizio": "2026-07-01",
    "data_fine": "2026-09-30",
    "stato": "in_carta",
    "note": "Menu luglio-agosto-settembre 2026, caricato dal PDF menulugagoset2026web.pdf — sessione 2026-07-19.",
    "pdf_path": "menulugagoset2026web.pdf",
}

ARCHIVIA_SLUG_PRECEDENTE = "primavera-2026"


# ─────────────────────────────────────────────────────────────────────────
# Ricette NUOVE da creare (skeleton, senza recipe_items)
# category: nome in recipe_categories. selling_price = prezzo carta estate.
# ─────────────────────────────────────────────────────────────────────────
NEW_RECIPES = [
    # ── ANTIPASTI ──
    {
        "name": "Parmigiana di zucchine e melanzane",
        "menu_name": "Parmigiana di zucchine e melanzane",
        "menu_description": "Cotta al forno con zucchine e melanzane, salsa ai tre pomodori, parmigiano e crema di zucchine alla menta.",
        "category": "Antipasto", "selling_price": 16, "allergeni": "latte",
    },
    {
        "name": "Carpaccio pomodoro cuore di bue",
        "menu_name": "Carpaccio di pomodoro cuore di bue",
        "menu_description": "Pomodoro cuore di bue affettato sottile, burratina a pezzi, origano, acciuga del Cantabrico e capperi fritti.",
        "category": "Antipasto", "selling_price": 16, "allergeni": "latte,pesce",
    },
    {
        "name": "Cozze in blu",
        "menu_name": "Cozze in blu",
        "menu_description": "Cozze appena scottate al forno, fonduta leggera di Strachitunt, limone sotto sale ed olio al prezzemolo.",
        "category": "Antipasto", "selling_price": 16, "allergeni": "molluschi,latte",
    },
    {
        "name": "Battuta di manzo e cocomero",
        "menu_name": "Battuta di manzo e cocomero",
        "menu_description": "Manzo 100% italiano condito per bene, anguria compressa, pomodoro e dripping di sapori.",
        "category": "Antipasto", "selling_price": 22, "allergeni": None,
    },

    # ── PASTE, RISI E ZUPPE ──
    {
        "name": "Risotto albicocca e agri' di Valtorta",
        "menu_name": "Risotto all'albicocca, agrì di Valtorta, mandorle e vermouth",
        "menu_description": "Carnaroli riserva \"San Massimo\", albicocca fresca e cotta nel vermouth, mantecato all'agrì di Valtorta Presidio Slow Food e finito con un crumble alla mandorla.",
        "category": "Primo", "selling_price": 18, "allergeni": "latte,frutta_a_guscio,solfiti",
    },
    {
        "name": "Fusilloni salmi' di lepre e branzi",
        "menu_name": "Fusilloni al salmì di lepre e branzi",
        "menu_description": "Fusillone Mancini condito con un sugo di lepre cotto lentamente con Valcalepio, ginepro, cannella e anice stellato. Il tutto finito con una grattugiata generosa di Branzi giovane a mantecare.",
        "category": "Primo", "selling_price": 20, "allergeni": "glutine,latte,solfiti",
    },
    {
        "name": "Zuppiera pasta mista in ristretto di scoglio",
        "menu_name": "Zuppiera di pasta mista in ristretto di scoglio",
        "menu_description": "Una zuppiera colma di pasta mista cotta in una zuppa ristretta di pesci di scoglio, da mettere in mezzo al tavolo.",
        "category": "Primo", "selling_price": 45, "allergeni": "glutine,pesce",
    },
    {
        "name": "Spaghettoni alle vongole",
        "menu_name": "Spaghettoni alle vongole",
        "menu_description": "Spaghettone del pastificio Mancini cotto in un ristretto di acqua di vongole, prezzemolo ed abbondanti vongole appena aperte a finire.",
        "category": "Primo", "selling_price": 24, "allergeni": "glutine,molluschi",
    },
    {
        "name": "Tegamino paccheri ai tre pomodori",
        "menu_name": "Tegamino di paccheri ai tre pomodori",
        "menu_description": "Un godurioso sugo di pomodoro fatto con San Marzano, Pachino e Cuore di Bue a condire i paccheri ben mantecati nel tegamino.",
        "category": "Primo", "selling_price": 18, "allergeni": "glutine",
    },

    # ── SECONDI ──
    {
        "name": "Anatra, ribes e lattuga",
        "menu_name": "Anatra, ribes e lattuga",
        "menu_description": "Petto di anatra in lunga cottura, il suo fondo, crema di ribes in agrodolce, lattuga al forno con nocciole.",
        "category": "Secondo", "selling_price": 26, "allergeni": "frutta_a_guscio",
    },
    {
        "name": "Entrecote di manzo e finferli",
        "menu_name": "Entrecote di manzo e finferli",
        "menu_description": "Super taglio di manzo (270/300g) cotto sulla lionese, finito con un fondo bruno e dei finferli al burro.",
        "category": "Secondo", "selling_price": 30, "allergeni": "latte",
    },
    {
        "name": "Guancetta di maialino brasata",
        "menu_name": "Guancetta di maialino brasata e polenta",
        "menu_description": "Cotta 36 ore, tenera e succolenta che profuma di vino e di casa.",
        "category": "Secondo", "selling_price": 24, "allergeni": "solfiti",
    },
    {
        "name": "Coniglio alla bergamasca",
        "menu_name": "Coniglio alla bergamasca",
        "menu_description": "Il coniglio come si fa nelle nostre valli: rosolato con pancetta, rosmarino e una sfumata di bianco, finito al forno. Con la polenta nostrana, ovviamente.",
        "category": "Secondo", "selling_price": 24, "allergeni": "solfiti",
    },
    {
        "name": "Spezzatino di cinghiale in umido",
        "menu_name": "Spezzatino di cinghiale in umido",
        "menu_description": "Cinghiale di selezione cotto piano piano in umido con vino rosso ed erbe di montagna. Un sugo che chiede la scarpetta.",
        "category": "Secondo", "selling_price": 24, "allergeni": "solfiti,sedano",
    },

    # ── CONTORNI ──
    {
        "name": "Pure' di patate cremosissimo",
        "menu_name": "Purè di patate cremosissimo",
        "menu_description": None,
        "category": "Contorno", "selling_price": 6, "allergeni": "latte",
    },

    # ── DOLCI ──
    {
        "name": "La piantina del tiramisu'",
        "menu_name": "La piantina del tiramisù",
        "menu_description": "Il nostro dolce più antico in carta dal primo giorno, servito in maniera particolare. Definito da molti il miglior tiramisù mai assaggiato. Non fartelo scappare! Senza glutine.",
        "category": "Dolce", "selling_price": 10, "allergeni": "latte,uova",
    },
    {
        "name": "Cheesecake ai frutti di bosco",
        "menu_name": "Cheesecake ai frutti di bosco",
        "menu_description": "La nostra versione di una New York Cheesecake in chiave bergamasca, dentro non troverai la Philadelphia ma un mix di formaggi freschi locali. Sopra, a dare gusto, le salse ai frutti di bosco e un coulis al lampone che produciamo noi. Senza glutine.",
        "category": "Dolce", "selling_price": 9, "allergeni": "latte",
    },
    {
        "name": "Ti ricordi il Solero?",
        "menu_name": "Ti ricordi il \"Solero\"?",
        "menu_description": "Semifreddo al cocco, servito su passion fruit, tapioca esplosiva, salsa al cocco ed olio al basilico. Un dolce che ti riporterà agli anni '80 con il classico gelato Algida. Senza glutine e senza lattosio.",
        "category": "Dolce", "selling_price": 9, "allergeni": None,
    },
    {
        "name": "Panna cotta dell'Ingegner Danisi",
        "menu_name": "Panna cotta dell'Ingegner Danisi",
        "menu_description": "La panna cotta è un classico delle Osterie, non poteva mancare tra i nostri dolci! L'abbiamo dedicata ad un nostro caro ospite che ci ha esortato più e più volte a farla, migliorando e perfezionando la ricetta fino alla versione attuale. Quasi perfetta. Sceglila alle AMARENE FABBRI, al CARAMELLO oppure al CIOCCOLATO FUSO. Senza glutine.",
        "category": "Dolce", "selling_price": 9, "allergeni": "latte",
    },
    {
        "name": "Pesca Melba",
        "menu_name": "Pesca Melba",
        "menu_description": "Semifreddo alla vaniglia del Madagascar, pesche cotte in sciroppo, coulis al lampone e una terra di mandorla. L'ultimo dolce inserito in carta, che sta diventando uno dei più scelti! Senza glutine.",
        "category": "Dolce", "selling_price": 10, "allergeni": "latte,frutta_a_guscio",
    },
]


# ─────────────────────────────────────────────────────────────────────────
# Publications da ricetta — match per recipes.menu_name
# (le ricette nuove sono appena state create dalla sezione sopra)
# ─────────────────────────────────────────────────────────────────────────
PUBLICATIONS_FROM_RECIPE = [
    # ── ANTIPASTI (ordine PDF) ──
    {"menu_name": "Parmigiana di zucchine e melanzane",  "sezione": "antipasti", "sort": 10, "prezzo_singolo": 16, "allergeni": "latte"},
    {"menu_name": "Carpaccio di pomodoro cuore di bue",  "sezione": "antipasti", "sort": 20, "prezzo_singolo": 16, "allergeni": "latte,pesce"},
    {"menu_name": "Cappuccino di baccalà e patata",      "sezione": "antipasti", "sort": 30, "prezzo_singolo": 16, "allergeni": "pesce,latte"},
    {"menu_name": "Cozze in blu",                        "sezione": "antipasti", "sort": 40, "prezzo_singolo": 16, "allergeni": "molluschi,latte"},
    {"menu_name": "Sua Maestà \"La Taragna\"",           "sezione": "antipasti", "sort": 50, "prezzo_singolo": 16, "allergeni": "latte"},
    {"menu_name": "Battuta di manzo e cocomero",         "sezione": "antipasti", "sort": 60, "prezzo_singolo": 22},
    {"menu_name": "Il Vitello Tonnato dell'Osteria",     "sezione": "antipasti", "sort": 70, "prezzo_singolo": 22, "allergeni": "pesce,uova",
     "descrizione_override": "Spuma di salsa tonnata fresca, fondo bruno e capperi su un meraviglioso girello di vitello cotto al punto rosa. Ispirato da Diego Rossi, e a lui dedicato."},
    {"menu_name": "Il salame del Roberto con la giardiniera", "sezione": "antipasti", "sort": 80, "prezzo_singolo": 16, "allergeni": "solfiti",
     "descrizione_override": "Il salame che fa il Roberto, stagionato lentamente in cantina e tagliato a fette grosse, accompagnato dalle nostre verdure."},
    {"menu_name": "I nostri salumi misti",               "sezione": "antipasti", "sort": 90, "prezzo_singolo": 20, "allergeni": "solfiti",
     "consigliato_per": 2, "titolo_override": "I salumi misti dell'osteria"},

    # ── PASTE, RISI E ZUPPE (ordine PDF) ──
    {"menu_name": "Risotto all'albicocca, agrì di Valtorta, mandorle e vermouth", "sezione": "paste_risi_zuppe", "sort": 10, "prezzo_singolo": 18, "allergeni": "latte,frutta_a_guscio,solfiti"},
    {"menu_name": "Fettuccine all'Alfredo \"se fosse stato di Bergamo\"",         "sezione": "paste_risi_zuppe", "sort": 20, "prezzo_singolo": 18, "allergeni": "glutine,latte,uova",
     "titolo_override": "Fettuccine all'Alfredo se fosse nato a Bergamo"},
    {"menu_name": "Casoncelli di mamma e papà",           "sezione": "paste_risi_zuppe", "sort": 30, "prezzo_singolo": 18, "allergeni": "glutine,latte,uova", "badge": "classico"},
    {"menu_name": "Fusilloni al salmì di lepre e branzi", "sezione": "paste_risi_zuppe", "sort": 40, "prezzo_singolo": 20, "allergeni": "glutine,latte,solfiti"},
    {"menu_name": "Zuppiera di pasta mista in ristretto di scoglio", "sezione": "paste_risi_zuppe", "sort": 50,
     "prezzo_singolo": 45, "prezzo_label": "45 (per 2 persone)", "consigliato_per": 2, "allergeni": "glutine,pesce"},
    {"menu_name": "Spaghettoni alle vongole",             "sezione": "paste_risi_zuppe", "sort": 60, "prezzo_singolo": 24, "allergeni": "glutine,molluschi"},
    {"menu_name": "Tegamino di paccheri ai tre pomodori", "sezione": "paste_risi_zuppe", "sort": 70, "prezzo_singolo": 18, "allergeni": "glutine"},

    # ── SECONDI (ordine PDF) ──
    {"menu_name": "Anatra, ribes e lattuga",              "sezione": "secondi", "sort": 10, "prezzo_singolo": 26, "allergeni": "frutta_a_guscio"},
    {"menu_name": "Entrecote di manzo e finferli",        "sezione": "secondi", "sort": 20, "prezzo_singolo": 30, "allergeni": "latte"},
    {"menu_name": "Ossobuco di vitello con purè",         "sezione": "secondi", "sort": 30, "prezzo_singolo": 26, "allergeni": "latte,sedano,solfiti"},
    {"menu_name": "Vuoi un piatto unico con ossobuco e risotto giallo?", "sezione": "secondi", "sort": 40, "prezzo_singolo": 35, "allergeni": "latte,sedano,solfiti"},
    {"menu_name": "Guancetta di maialino brasata e polenta", "sezione": "secondi", "sort": 50, "prezzo_singolo": 24, "allergeni": "solfiti"},
    {"menu_name": "Coniglio alla bergamasca",             "sezione": "secondi", "sort": 60, "prezzo_singolo": 24, "allergeni": "solfiti"},
    {"menu_name": "Spezzatino di cinghiale in umido",     "sezione": "secondi", "sort": 70, "prezzo_singolo": 24, "allergeni": "solfiti,sedano"},
    {"menu_name": "Pescato del giorno",                   "sezione": "secondi", "sort": 80, "prezzo_singolo": 26, "allergeni": "pesce",
     "descrizione_variabile": 1, "descrizione_override": "Chiedici come l'abbiamo cucinato oggi."},

    # ── CONTORNI (ordine PDF) ──
    {"menu_name": "Polenta nostrana",                  "sezione": "contorni", "sort": 10, "prezzo_singolo": 4},
    {"menu_name": "Assaggio di Sua Maestà la Taragna", "sezione": "contorni", "sort": 20, "prezzo_singolo": 8, "allergeni": "latte"},
    {"menu_name": "Purè di patate cremosissimo",       "sezione": "contorni", "sort": 30, "prezzo_singolo": 6, "allergeni": "latte"},
    {"menu_name": "Patate arrosto",                    "sezione": "contorni", "sort": 40, "prezzo_singolo": 6},
    {"menu_name": "Spadellata di verdure",             "sezione": "contorni", "sort": 50, "prezzo_singolo": 6},
    {"menu_name": "Giardiniera di verdure",            "sezione": "contorni", "sort": 60, "prezzo_singolo": 6},
    {"menu_name": "Insalata mista di stagione",        "sezione": "contorni", "sort": 70, "prezzo_singolo": 6},

    # ── DOLCI (ordine PDF — sezione nuova, [core] in questo rilascio) ──
    {"menu_name": "La piantina del tiramisù",          "sezione": "dolci", "sort": 10, "prezzo_singolo": 10, "allergeni": "latte,uova", "badge": "classico"},
    {"menu_name": "Cheesecake ai frutti di bosco",     "sezione": "dolci", "sort": 20, "prezzo_singolo": 9,  "allergeni": "latte"},
    {"menu_name": "Ti ricordi il \"Solero\"?",         "sezione": "dolci", "sort": 30, "prezzo_singolo": 9},
    {"menu_name": "Panna cotta dell'Ingegner Danisi",  "sezione": "dolci", "sort": 40, "prezzo_singolo": 9,  "allergeni": "latte"},
    {"menu_name": "Pesca Melba",                       "sezione": "dolci", "sort": 50, "prezzo_singolo": 10, "allergeni": "latte,frutta_a_guscio"},
]


# ─────────────────────────────────────────────────────────────────────────
# Publications "documentali" senza recipe_id
# ─────────────────────────────────────────────────────────────────────────
PUBLICATIONS_DOCUMENT = [
    # ── PIATTI DEL GIORNO ──
    {
        "sezione": "piatti_del_giorno",
        "sort": 10,
        "titolo_override": "Raccontati a voce",
        "descrizione_override": "Come sulla lavagna dell'osteria, tutte le idee del giorno con i prodotti migliori in tiratura limitata. Possono finire subito!",
        "prezzo_min": 14, "prezzo_max": 26,
        "prezzo_label": "da 14 a 26",
        "descrizione_variabile": 1,
    },

    # ── SERVIZIO (ordine PDF estate) ──
    {"sezione": "servizio", "sort": 10, "titolo_override": "Tè e tisane",  "prezzo_singolo": 10},
    {"sezione": "servizio", "sort": 20, "titolo_override": "Espresso",     "prezzo_singolo": 3},
    {"sezione": "servizio", "sort": 30,
     "titolo_override": "Moka \"Pump\"",
     "descrizione_override": "Degustazione per due.",
     "prezzo_singolo": 10, "consigliato_per": 2},
    {"sezione": "servizio", "sort": 40, "titolo_override": "Acqua",        "prezzo_singolo": 3},
    {"sezione": "servizio", "sort": 50, "titolo_override": "Coperto",      "prezzo_singolo": 5},

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
NOTE_DEGUSTAZIONI = ("Le degustazioni sono da considerarsi per tutto il tavolo. "
                     "Fatte salve allergie e intolleranze, per le quali proporremo alternative.")

TASTING_PATHS = [
    {
        "nome": "Prima volta",
        "sottotitolo": "Per la prima volta nella nostra osteria ti consigliamo di assaggiare il meglio della cucina Bergamasca nella nostra interpretazione! Il metodo migliore per conoscerci.",
        "prezzo_persona": 60,
        "note": NOTE_DEGUSTAZIONI,
        "sort": 10,
        "steps": [
            {"sort": 10, "titolo_libero": "Antipasto misto dell'osteria"},
            {"sort": 20, "publication_menu_name": "Casoncelli di mamma e papà"},
            {"sort": 30, "titolo_libero": "Coniglio o Guancetta a tua scelta"},
            {"sort": 40, "titolo_libero": "Dolce a scelta"},
        ],
    },
    {
        "nome": "Fidati dell'oste",
        "sottotitolo": "I piatti consigliati dall'Oste, quelli che rappresentano la stagione ed il momento. Molto spesso con variazioni raccontate a voce.",
        "prezzo_persona": 75,
        "note": NOTE_DEGUSTAZIONI,
        "sort": 20,
        "steps": [
            {"sort": 10, "publication_menu_name": "Battuta di manzo e cocomero"},
            {"sort": 20, "publication_menu_name": "Cozze in blu"},
            {"sort": 30, "publication_menu_name": "Risotto all'albicocca, agrì di Valtorta, mandorle e vermouth"},
            {"sort": 40, "publication_menu_name": "Anatra, ribes e lattuga"},
            {"sort": 50, "titolo_libero": "Dolce a scelta"},
        ],
    },
]


# ─────────────────────────────────────────────────────────────────────────
# upgrade()
# ─────────────────────────────────────────────────────────────────────────
def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys = ON")

    # ── 1. Ricette nuove (skeleton, idempotente per menu_name) ──
    cat_id_by_name = {
        r[1]: r[0] for r in cur.execute("SELECT id, name FROM recipe_categories")
    }
    esistenti = {
        r[0] for r in cur.execute("SELECT menu_name FROM recipes WHERE menu_name IS NOT NULL")
    }
    create, skippate = 0, 0
    for r in NEW_RECIPES:
        if r["menu_name"] in esistenti:
            skippate += 1
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
    print(f"  + {create} ricette nuove create (skeleton), {skippate} gia' esistenti")

    # ── 2. Archivia l'edizione in_carta precedente (vincolo unique parziale) ──
    prev = cur.execute(
        "SELECT id, nome FROM menu_editions WHERE stato = 'in_carta' AND slug != ?",
        (EDITION["slug"],),
    ).fetchall()
    for pid, pnome in prev:
        cur.execute(
            "UPDATE menu_editions SET stato = 'archiviata', updated_at = datetime('now') WHERE id = ?",
            (pid,),
        )
        print(f"  · edizione '{pnome}' (id={pid}) archiviata")
    if not prev and ARCHIVIA_SLUG_PRECEDENTE:
        print(f"  · nessuna edizione in_carta da archiviare")

    # ── 3. Edizione (idempotente per slug) ──
    existing = cur.execute(
        "SELECT id FROM menu_editions WHERE slug = ?", (EDITION["slug"],)
    ).fetchone()
    if existing:
        edition_id = existing[0]
        cur.execute(
            "UPDATE menu_editions SET stato = ?, updated_at = datetime('now') WHERE id = ?",
            (EDITION["stato"], edition_id),
        )
        print(f"  · edizione '{EDITION['nome']}' gia' presente (id={edition_id}) — stato -> {EDITION['stato']}")
    else:
        cur.execute(
            """
            INSERT INTO menu_editions
                (nome, slug, stagione, anno, data_inizio, data_fine, stato, note, pdf_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (EDITION["nome"], EDITION["slug"], EDITION["stagione"], EDITION["anno"],
             EDITION["data_inizio"], EDITION["data_fine"], EDITION["stato"],
             EDITION["note"], EDITION["pdf_path"]),
        )
        edition_id = cur.lastrowid
        print(f"  + edizione '{EDITION['nome']}' creata (id={edition_id}, stato={EDITION['stato']})")

    # ── 4. Pulizia pubblicazioni / degustazioni per re-seed pulito ──
    n_old = cur.execute(
        "SELECT count(*) FROM menu_dish_publications WHERE edition_id = ?", (edition_id,)
    ).fetchone()[0]
    if n_old:
        cur.execute("DELETE FROM menu_dish_publications WHERE edition_id = ?", (edition_id,))
        print(f"  · {n_old} pubblicazioni precedenti rimosse (re-seed pulito)")
    n_old = cur.execute(
        "SELECT count(*) FROM menu_tasting_paths WHERE edition_id = ?", (edition_id,)
    ).fetchone()[0]
    if n_old:
        cur.execute("DELETE FROM menu_tasting_paths WHERE edition_id = ?", (edition_id,))
        print(f"  · {n_old} degustazioni precedenti rimosse (cascade su steps)")

    # ── 5. Mappa menu_name -> recipe_id ──
    recipe_id_by_menu_name = {
        r[1]: r[0]
        for r in cur.execute("SELECT id, menu_name FROM recipes WHERE menu_name IS NOT NULL")
    }

    # ── 6. Publications da recipe ──
    publication_id_by_menu_name = {}
    inseriti, not_found = 0, []
    for p in PUBLICATIONS_FROM_RECIPE:
        recipe_id = recipe_id_by_menu_name.get(p["menu_name"])
        if not recipe_id:
            not_found.append(p["menu_name"])
            continue
        cur.execute(
            """
            INSERT INTO menu_dish_publications
                (edition_id, recipe_id, sezione, sort_order,
                 titolo_override, descrizione_override,
                 prezzo_singolo, prezzo_min, prezzo_max,
                 prezzo_piccolo, prezzo_grande, prezzo_label,
                 consigliato_per, descrizione_variabile, badge,
                 allergeni_dichiarati, is_visible)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (edition_id, recipe_id, p["sezione"], p["sort"],
             p.get("titolo_override"), p.get("descrizione_override"),
             p.get("prezzo_singolo"), p.get("prezzo_min"), p.get("prezzo_max"),
             p.get("prezzo_piccolo"), p.get("prezzo_grande"), p.get("prezzo_label"),
             p.get("consigliato_per"), p.get("descrizione_variabile", 0), p.get("badge"),
             p.get("allergeni")),
        )
        publication_id_by_menu_name[p["menu_name"]] = cur.lastrowid
        inseriti += 1
    print(f"  + {inseriti} publications da recipe inserite")
    if not_found:
        print(f"  ⚠ {len(not_found)} ricette non trovate per menu_name:")
        for nm in not_found:
            print(f"    - {nm}")

    # ── 7. Publications documentali ──
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
            (edition_id, p["sezione"], p["sort"],
             p.get("titolo_override"), p.get("descrizione_override"),
             p.get("prezzo_singolo"), p.get("prezzo_min"), p.get("prezzo_max"),
             p.get("prezzo_label"), p.get("consigliato_per"),
             p.get("descrizione_variabile", 0)),
        )
        inseriti_doc += 1
    print(f"  + {inseriti_doc} publications documentali (servizio/bambini/piatti del giorno) inserite")

    # ── 8. Tasting paths + steps ──
    n_paths, n_steps = 0, 0
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
        n_paths += 1
        for s in tp["steps"]:
            pub_id = publication_id_by_menu_name.get(s.get("publication_menu_name")) if s.get("publication_menu_name") else None
            if s.get("publication_menu_name") and pub_id is None:
                print(f"  ⚠ step '{s['publication_menu_name']}' senza publication — inserito come titolo libero")
            cur.execute(
                """
                INSERT INTO menu_tasting_path_steps
                    (path_id, sort_order, publication_id, titolo_libero, note)
                VALUES (?, ?, ?, ?, ?)
                """,
                (path_id, s["sort"], pub_id,
                 s.get("titolo_libero") or (s.get("publication_menu_name") if pub_id is None else None),
                 s.get("note")),
            )
            n_steps += 1
    print(f"  + {n_paths} tasting paths inseriti con {n_steps} steps totali")

    conn.commit()
    print("  [154] menu carta 'Estate 2026' caricato e in carta")
