"""
Migrazione 099 — Seed dati TEST nel modulo Food Cost (sessione 57 — 2026-04-25)

Contesto:
  Il modulo Ricette + Food Cost v2 e' production-ready dalla mig 007 (sessione
  2026-03-10) ma il DB e' VUOTO: nessun ingrediente, nessuna ricetta. La
  popolazione vera avverra' quando Marco e il cuoco capo lavoreranno
  sull'archivio.

  Per dare un punto di partenza CONCRETO al modulo Menu Carta (mig 098 ha
  appena creato lo schema), questa migrazione popola foodcost.db con dati
  STIMATI dal menu Primavera 2026 — non sono dati di produzione, sono dati
  di test che Marco affinera' dal modulo Ricette esistente.

Cosa popola:
  - 9 ingredient_categories (carne, pesce, latticini, ortaggi, ...)
  - ~80 ingredients (con allergeni dichiarati dove rilevante)
  - ~14 ricette base (kind='base'): fondi, salse, polente, mantecature
  - 21 ricette piatto (kind='dish'): tutti i piatti del menu Primavera 2026

Idempotenza:
  - Ingredient_categories: INSERT OR IGNORE su name
  - Ingredients: SELECT WHERE name + skip
  - Recipes: SELECT WHERE name + skip
  - Recipe_items: ricreate da zero per ogni ricetta inserita ex novo

Riferimenti:
  - docs/menu_carta.md (sezione 8 — mappa piatti del menu)
  - Checklist_Cucina_Primavera_2026.docx (procedure e ingredienti chiave)
  - docs/design_ricette_foodcost_v2.md (schema)
"""

import sqlite3


# ─────────────────────────────────────────────────────────────────────────
# DATI SEED
# ─────────────────────────────────────────────────────────────────────────

# 9 categorie ingredienti
INGREDIENT_CATEGORIES = [
    ("Carne", "Carni rosse e bianche, salumi"),
    ("Pesce", "Pesci, molluschi, crostacei"),
    ("Latticini", "Latte, formaggi, burro, panna"),
    ("Ortaggi", "Verdure, ortaggi freschi e di stagione"),
    ("Pasta e cereali", "Pasta, riso, polenta, sfoglie, pane"),
    ("Uova", "Uova"),
    ("Conserve e dispense", "Olio, aceto, conserve, dispense"),
    ("Aromi ed erbe", "Erbe, aromi, spezie"),
    ("Vino e alcoli", "Vini, distillati e alcoli"),
]


# ─────────────────────────────────────────────────────────────────────────
# Ingredients — slug usato solo per join interno alla migrazione
# Allergeni: CSV UE 1169/2011 ("glutine", "latte", "uova", "pesce", "crostacei",
#   "molluschi", "soia", "frutta_a_guscio", "sedano", "senape", "sesamo",
#   "solfiti", "lupini", "arachidi")
# ─────────────────────────────────────────────────────────────────────────
INGREDIENTS = [
    # ── Carne ──
    {"slug": "manzo_filetto", "name": "Manzo filetto 100% italiano", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "manzo_fesa", "name": "Manzo fesa per tartare", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "manzo_brasato", "name": "Manzo per brasato (cappello del prete)", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "vitello_girello", "name": "Vitello girello", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "vitello_ossobuco", "name": "Vitello ossobuco", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "faraona_petto", "name": "Petto di faraona", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "coniglio_disossato", "name": "Coniglio disossato", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "coniglio_fegatini", "name": "Fegatini di coniglio", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "gallina", "name": "Gallina (per ragù)", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "pollo", "name": "Pollo (per ragù)", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "anatra", "name": "Anatra (per ragù)", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "salame_roberto", "name": "Salame del Roberto (cantina TRGB)", "cat": "Carne", "unit": "g", "all": "solfiti"},
    {"slug": "salumi_misti", "name": "Salumi misti selezione oste", "cat": "Carne", "unit": "g", "all": "solfiti"},
    {"slug": "pancetta", "name": "Pancetta", "cat": "Carne", "unit": "g", "all": ""},

    # ── Pesce ──
    {"slug": "baccala", "name": "Baccalà ammollato", "cat": "Pesce", "unit": "g", "all": "pesce"},
    {"slug": "acciuga_cantabrico", "name": "Acciuga del Cantabrico", "cat": "Pesce", "unit": "g", "all": "pesce"},
    {"slug": "tonno_olio", "name": "Tonno sott'olio (per tonnata)", "cat": "Pesce", "unit": "g", "all": "pesce"},
    {"slug": "sarda_montisola", "name": "Sarda di Montisola affumicata", "cat": "Pesce", "unit": "g", "all": "pesce"},
    {"slug": "bottarga_muggine", "name": "Bottarga di muggine in polvere", "cat": "Pesce", "unit": "g", "all": "pesce"},
    {"slug": "pescato_giorno", "name": "Pescato del giorno (variabile)", "cat": "Pesce", "unit": "g", "all": "pesce"},

    # ── Latticini ──
    {"slug": "burro_malga", "name": "Burro di malga", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "panna_fresca", "name": "Panna fresca", "cat": "Latticini", "unit": "ml", "all": "latte"},
    {"slug": "taleggio_dop", "name": "Taleggio DOP", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "stracchino", "name": "Stracchino", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "formai_de_mut", "name": "Formai de Mut DOP", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "branzi", "name": "Branzi (formaggio bergamasco)", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "formagella", "name": "Formagella bergamasca", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "pecorino", "name": "Pecorino romano", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "parmigiano", "name": "Parmigiano Reggiano grattato", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "grana", "name": "Grana grattato", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "caprino", "name": "Caprino fresco", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "selezione_form_it", "name": "Selezione formaggi italiani (rotazione)", "cat": "Latticini", "unit": "g", "all": "latte"},
    {"slug": "selezione_form_fr", "name": "Selezione formaggi francesi (rotazione)", "cat": "Latticini", "unit": "g", "all": "latte"},

    # ── Ortaggi ──
    {"slug": "asparagi_verdi", "name": "Asparagi verdi", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "asparagi_bianchi", "name": "Asparagi bianchi", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "asparagi_selvatici", "name": "Asparagi selvatici", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "carciofi", "name": "Carciofi", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "fave_fresche", "name": "Fave fresche", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "piselli", "name": "Piselli freschi", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "agretti", "name": "Agretti freschi", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "spugnole", "name": "Spugnole primaverili", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "carote", "name": "Carote", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "patate", "name": "Patate", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "cipolla", "name": "Cipolla", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "verdure_minestrone", "name": "Mix verdure per minestrone", "cat": "Ortaggi", "unit": "g", "all": "sedano"},
    {"slug": "verdure_giardiniera", "name": "Verdure per giardiniera", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "verdure_stagione", "name": "Verdure di stagione (mix)", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "insalata_mista", "name": "Insalata mista di stagione", "cat": "Ortaggi", "unit": "g", "all": ""},
    {"slug": "trippa_pulita", "name": "Trippa pulita pre-cotta", "cat": "Carne", "unit": "g", "all": ""},

    # ── Pasta e cereali ──
    {"slug": "riso_carnaroli", "name": "Riso Carnaroli riserva San Massimo", "cat": "Pasta e cereali", "unit": "g", "all": ""},
    {"slug": "fettuccine_fresche", "name": "Fettuccine fresche all'uovo", "cat": "Pasta e cereali", "unit": "g", "all": "glutine,uova"},
    {"slug": "casoncelli", "name": "Casoncelli (ricetta famiglia Carminati)", "cat": "Pasta e cereali", "unit": "g", "all": "glutine,uova"},
    {"slug": "lasagne_sfoglia", "name": "Sfoglia per lasagne", "cat": "Pasta e cereali", "unit": "g", "all": "glutine,uova"},
    {"slug": "pasta_mista_secca", "name": "Pasta mista rustica Gragnano IGP", "cat": "Pasta e cereali", "unit": "g", "all": "glutine"},
    {"slug": "farina_polenta", "name": "Farina di mais per polenta", "cat": "Pasta e cereali", "unit": "g", "all": ""},
    {"slug": "farina_taragna", "name": "Farina taragna (mais + grano saraceno)", "cat": "Pasta e cereali", "unit": "g", "all": "glutine"},
    {"slug": "pane_crostini", "name": "Pane per crostini", "cat": "Pasta e cereali", "unit": "g", "all": "glutine"},

    # ── Uova ──
    {"slug": "uovo_bio", "name": "Uovo biologico", "cat": "Uova", "unit": "n", "all": "uova"},
    {"slug": "tuorlo", "name": "Tuorlo d'uovo", "cat": "Uova", "unit": "n", "all": "uova"},

    # ── Conserve e dispense ──
    {"slug": "olio_evo", "name": "Olio EVO", "cat": "Conserve e dispense", "unit": "ml", "all": ""},
    {"slug": "capperi", "name": "Capperi di Pantelleria", "cat": "Conserve e dispense", "unit": "g", "all": ""},
    {"slug": "limone_salato", "name": "Limone salato in conserva", "cat": "Conserve e dispense", "unit": "g", "all": ""},
    {"slug": "senape_antica", "name": "Senape antica in grani", "cat": "Conserve e dispense", "unit": "g", "all": "senape"},
    {"slug": "miele", "name": "Miele", "cat": "Conserve e dispense", "unit": "g", "all": ""},
    {"slug": "sale", "name": "Sale fino", "cat": "Conserve e dispense", "unit": "g", "all": ""},
    {"slug": "sale_maldon", "name": "Sale Maldon", "cat": "Conserve e dispense", "unit": "g", "all": ""},
    {"slug": "pepe_nero", "name": "Pepe nero", "cat": "Conserve e dispense", "unit": "g", "all": ""},
    {"slug": "zafferano", "name": "Zafferano", "cat": "Conserve e dispense", "unit": "g", "all": ""},
    {"slug": "midollo", "name": "Midollo di bue", "cat": "Carne", "unit": "g", "all": ""},
    {"slug": "marmellate_mix", "name": "Marmellate / confetture per formaggi", "cat": "Conserve e dispense", "unit": "g", "all": ""},

    # ── Aromi ed erbe ──
    {"slug": "salvia", "name": "Salvia", "cat": "Aromi ed erbe", "unit": "g", "all": ""},
    {"slug": "rosmarino", "name": "Rosmarino", "cat": "Aromi ed erbe", "unit": "g", "all": ""},
    {"slug": "prezzemolo", "name": "Prezzemolo", "cat": "Aromi ed erbe", "unit": "g", "all": ""},
    {"slug": "mentuccia", "name": "Mentuccia romana", "cat": "Aromi ed erbe", "unit": "g", "all": ""},
    {"slug": "aglio", "name": "Aglio", "cat": "Aromi ed erbe", "unit": "g", "all": ""},
    {"slug": "aglio_orsino", "name": "Aglio orsino fresco", "cat": "Aromi ed erbe", "unit": "g", "all": ""},
    {"slug": "limone_buccia", "name": "Scorza di limone", "cat": "Aromi ed erbe", "unit": "g", "all": ""},

    # ── Vino e alcoli ──
    {"slug": "vino_bianco", "name": "Vino bianco da cucina", "cat": "Vino e alcoli", "unit": "ml", "all": "solfiti"},
    {"slug": "vino_rosso", "name": "Vino rosso da cucina", "cat": "Vino e alcoli", "unit": "ml", "all": "solfiti"},
    {"slug": "valcalepio_rosso", "name": "Valcalepio rosso DOC", "cat": "Vino e alcoli", "unit": "ml", "all": "solfiti"},

    # ── Brodi e basi liquide ──
    {"slug": "brodo_vegetale", "name": "Brodo vegetale", "cat": "Conserve e dispense", "unit": "ml", "all": "sedano"},
    {"slug": "brodo_carne", "name": "Brodo di carne", "cat": "Conserve e dispense", "unit": "ml", "all": "sedano"},
]


# ─────────────────────────────────────────────────────────────────────────
# Ricette BASE — kind='base', is_base=1, is_active=1
# items: lista di {ingredient_slug | sub_recipe_slug, qty, unit, note?}
# ─────────────────────────────────────────────────────────────────────────
RECIPES_BASE = [
    {
        "slug": "fondo_bruno",
        "name": "Fondo bruno",
        "category": "Salsa",
        "yield_qty": 1.0, "yield_unit": "L", "prep_time": 240,
        "items": [
            {"ing": "manzo_brasato", "qty": 500, "unit": "g", "note": "ossa e ritagli"},
            {"ing": "carote", "qty": 100, "unit": "g"},
            {"ing": "cipolla", "qty": 100, "unit": "g"},
            {"ing": "vino_rosso", "qty": 200, "unit": "ml"},
            {"ing": "brodo_vegetale", "qty": 1000, "unit": "ml"},
        ],
    },
    {
        "slug": "fondo_valcalepio",
        "name": "Fondo al Valcalepio rosso",
        "category": "Salsa",
        "yield_qty": 0.5, "yield_unit": "L", "prep_time": 180,
        "items": [
            {"sub": "fondo_bruno", "qty": 500, "unit": "ml"},
            {"ing": "valcalepio_rosso", "qty": 300, "unit": "ml"},
            {"ing": "burro_malga", "qty": 30, "unit": "g", "note": "mantecatura finale"},
        ],
    },
    {
        "slug": "salsa_olandese",
        "name": "Salsa olandese 63° al tuorlo",
        "category": "Salsa",
        "yield_qty": 0.3, "yield_unit": "L", "prep_time": 30,
        "items": [
            {"ing": "tuorlo", "qty": 4, "unit": "n"},
            {"ing": "burro_malga", "qty": 200, "unit": "g"},
            {"ing": "limone_buccia", "qty": 5, "unit": "g"},
            {"ing": "sale", "qty": 2, "unit": "g"},
        ],
    },
    {
        "slug": "salsa_tonnata",
        "name": "Salsa tonnata fresca (per Vitello Tonnato)",
        "category": "Salsa",
        "yield_qty": 0.4, "yield_unit": "L", "prep_time": 20,
        "items": [
            {"ing": "tonno_olio", "qty": 200, "unit": "g"},
            {"ing": "tuorlo", "qty": 2, "unit": "n"},
            {"ing": "capperi", "qty": 30, "unit": "g"},
            {"ing": "acciuga_cantabrico", "qty": 20, "unit": "g"},
            {"ing": "olio_evo", "qty": 100, "unit": "ml"},
        ],
    },
    {
        "slug": "spuma_patata",
        "name": "Spuma di patata affumicata",
        "category": "Base",
        "yield_qty": 0.5, "yield_unit": "L", "prep_time": 60,
        "items": [
            {"ing": "patate", "qty": 400, "unit": "g"},
            {"ing": "panna_fresca", "qty": 200, "unit": "ml"},
            {"ing": "burro_malga", "qty": 50, "unit": "g"},
            {"ing": "sale", "qty": 4, "unit": "g"},
        ],
    },
    {
        "slug": "fondutina_taleggio",
        "name": "Fondutina di taleggio",
        "category": "Salsa",
        "yield_qty": 0.4, "yield_unit": "L", "prep_time": 20,
        "items": [
            {"ing": "taleggio_dop", "qty": 200, "unit": "g"},
            {"ing": "panna_fresca", "qty": 150, "unit": "ml"},
            {"ing": "burro_malga", "qty": 20, "unit": "g"},
        ],
    },
    {
        "slug": "crema_fegatini",
        "name": "Crema di fegatini di coniglio al burro di malga",
        "category": "Base",
        "yield_qty": 0.3, "yield_unit": "L", "prep_time": 60,
        "items": [
            {"ing": "coniglio_fegatini", "qty": 200, "unit": "g"},
            {"ing": "burro_malga", "qty": 80, "unit": "g"},
            {"ing": "vino_bianco", "qty": 50, "unit": "ml"},
            {"ing": "cipolla", "qty": 30, "unit": "g"},
        ],
    },
    {
        "slug": "pesto_aglio_orsino",
        "name": "Pesto di aglio orsino",
        "category": "Salsa",
        "yield_qty": 0.3, "yield_unit": "L", "prep_time": 15,
        "items": [
            {"ing": "aglio_orsino", "qty": 100, "unit": "g"},
            {"ing": "olio_evo", "qty": 200, "unit": "ml"},
            {"ing": "pecorino", "qty": 50, "unit": "g"},
            {"ing": "sale", "qty": 3, "unit": "g"},
        ],
    },
    {
        "slug": "polenta_nostrana_base",
        "name": "Polenta nostrana (base)",
        "category": "Base",
        "yield_qty": 2.0, "yield_unit": "kg", "prep_time": 60,
        "items": [
            {"ing": "farina_polenta", "qty": 500, "unit": "g"},
            {"ing": "sale", "qty": 12, "unit": "g"},
        ],
    },
    {
        "slug": "polenta_taragna_base",
        "name": "Polenta taragna 5 formaggi (base)",
        "category": "Base",
        "yield_qty": 2.0, "yield_unit": "kg", "prep_time": 90,
        "items": [
            {"ing": "farina_taragna", "qty": 500, "unit": "g"},
            {"ing": "burro_malga", "qty": 100, "unit": "g"},
            {"ing": "salvia", "qty": 5, "unit": "g"},
            {"ing": "taleggio_dop", "qty": 100, "unit": "g"},
            {"ing": "stracchino", "qty": 100, "unit": "g"},
            {"ing": "formai_de_mut", "qty": 100, "unit": "g"},
            {"ing": "branzi", "qty": 100, "unit": "g"},
            {"ing": "formagella", "qty": 100, "unit": "g"},
        ],
    },
    {
        "slug": "ragu_cortile",
        "name": "Ragù di cortile (5 carni bianche, 3 giorni)",
        "category": "Base",
        "yield_qty": 3.0, "yield_unit": "kg", "prep_time": 4320,  # 3 giorni
        "items": [
            {"ing": "gallina", "qty": 500, "unit": "g"},
            {"ing": "pollo", "qty": 500, "unit": "g"},
            {"ing": "anatra", "qty": 500, "unit": "g"},
            {"ing": "coniglio_disossato", "qty": 500, "unit": "g"},
            {"ing": "faraona_petto", "qty": 300, "unit": "g"},
            {"ing": "cipolla", "qty": 200, "unit": "g"},
            {"ing": "carote", "qty": 200, "unit": "g"},
            {"ing": "vino_bianco", "qty": 300, "unit": "ml"},
            {"ing": "brodo_carne", "qty": 1000, "unit": "ml"},
        ],
    },
    {
        "slug": "gremolada",
        "name": "Gremolada (prezzemolo + scorza limone + aglio)",
        "category": "Salsa",
        "yield_qty": 0.1, "yield_unit": "kg", "prep_time": 5,
        "items": [
            {"ing": "prezzemolo", "qty": 50, "unit": "g"},
            {"ing": "limone_buccia", "qty": 20, "unit": "g"},
            {"ing": "aglio", "qty": 5, "unit": "g"},
        ],
    },
    {
        "slug": "baccala_mantecato",
        "name": "Baccalà mantecato alla veneziana",
        "category": "Base",
        "yield_qty": 1.0, "yield_unit": "kg", "prep_time": 90,
        "items": [
            {"ing": "baccala", "qty": 600, "unit": "g"},
            {"ing": "olio_evo", "qty": 200, "unit": "ml"},
            {"ing": "aglio", "qty": 5, "unit": "g"},
            {"ing": "sale", "qty": 3, "unit": "g"},
        ],
    },
    {
        "slug": "vitello_girello_rosa",
        "name": "Vitello girello cotto al rosa (per tonnato)",
        "category": "Base",
        "yield_qty": 1.0, "yield_unit": "kg", "prep_time": 180,
        "items": [
            {"ing": "vitello_girello", "qty": 1000, "unit": "g"},
            {"ing": "olio_evo", "qty": 30, "unit": "ml"},
            {"ing": "sale", "qty": 8, "unit": "g"},
            {"ing": "rosmarino", "qty": 5, "unit": "g"},
        ],
    },
]


# ─────────────────────────────────────────────────────────────────────────
# Ricette PIATTO — kind='dish', is_base=0, is_active=1
# Sono i 21 piatti del menu Primavera 2026 + le 6 voci contorni.
# ─────────────────────────────────────────────────────────────────────────
RECIPES_DISH = [
    # ============ ANTIPASTI ============
    {
        "slug": "tegamino_asparagi_uovo",
        "name": "Tegamino asparagi e uovo 63°",
        "menu_name": "Tegamino di asparagi e uovo 63°",
        "menu_description": "Diverse tipologie di asparagi spadellati al burro, serviti con una fondutina di taleggio e uovo fondente cotto a 63°.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 16, "prep_time": 15,
        "allergeni": "latte,uova",
        "impiatt": "Servire nel tegamino in ghisa caldo, su sottopiatto con tovaglietta. Niente pane appoggiato.",
        "items": [
            {"ing": "asparagi_verdi", "qty": 80, "unit": "g"},
            {"ing": "asparagi_bianchi", "qty": 40, "unit": "g"},
            {"ing": "asparagi_selvatici", "qty": 30, "unit": "g"},
            {"ing": "burro_malga", "qty": 20, "unit": "g"},
            {"ing": "uovo_bio", "qty": 1, "unit": "n"},
            {"sub": "fondutina_taleggio", "qty": 60, "unit": "ml"},
            {"ing": "pepe_nero", "qty": 0.5, "unit": "g"},
            {"ing": "olio_evo", "qty": 5, "unit": "ml"},
        ],
    },
    {
        "slug": "taragna_5_formaggi",
        "name": "Taragna 5 formaggi bergamaschi",
        "menu_name": "Sua Maestà \"La Taragna\"",
        "menu_description": "Polenta cotta lentamente con burro, salvia e cinque formaggi bergamaschi: taleggio, stracchino, formai de mut, branzi e formagella.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 16, "prep_time": 10,
        "allergeni": "latte",
        "impiatt": "Servire nel tegamino caldo. La taragna deve filare al cucchiaio.",
        "items": [
            {"sub": "polenta_taragna_base", "qty": 250, "unit": "g"},
            {"ing": "taleggio_dop", "qty": 20, "unit": "g"},
            {"ing": "burro_malga", "qty": 15, "unit": "g"},
            {"ing": "salvia", "qty": 1, "unit": "g"},
        ],
    },
    {
        "slug": "cappuccino_baccala",
        "name": "Cappuccino baccalà mantecato",
        "menu_name": "Cappuccino di baccalà e patata",
        "menu_description": "Baccalà mantecato alla veneziana, spuma di patata affumicata e polvere di bottarga.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 16, "prep_time": 8,
        "allergeni": "pesce,latte",
        "impiatt": "Servire in tazza da cappuccino bianca, con cucchiaino lungo. Eventuale crostino di pane fragrante a parte.",
        "items": [
            {"sub": "baccala_mantecato", "qty": 80, "unit": "g"},
            {"sub": "spuma_patata", "qty": 70, "unit": "ml"},
            {"ing": "bottarga_muggine", "qty": 2, "unit": "g"},
        ],
    },
    {
        "slug": "tartare_oste",
        "name": "Tartare manzo 23 ingredienti",
        "menu_name": "La Tartare dell'Oste",
        "menu_description": "Manzo 100% italiano condito per bene, con una salsa olandese al tuorlo, l'acciuga del Cantabrico e 23 ingredienti.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 22, "prep_time": 12,
        "allergeni": "pesce,uova,glutine",
        "impiatt": "Piatto piano nero o grigio scuro per contrasto. Servire con crostini di pane caldo a parte.",
        "items": [
            {"ing": "manzo_fesa", "qty": 130, "unit": "g", "note": "tagliata al coltello al momento"},
            {"sub": "salsa_olandese", "qty": 30, "unit": "ml"},
            {"ing": "acciuga_cantabrico", "qty": 8, "unit": "g"},
            {"ing": "olio_evo", "qty": 5, "unit": "ml"},
            {"ing": "sale", "qty": 1, "unit": "g"},
            {"ing": "pepe_nero", "qty": 0.3, "unit": "g"},
            {"ing": "pane_crostini", "qty": 30, "unit": "g"},
        ],
    },
    {
        "slug": "vitello_tonnato",
        "name": "Vitello tonnato girello rosa",
        "menu_name": "Il Vitello Tonnato dell'Osteria",
        "menu_description": "Spuma di salsa tonnata fresca, fondo bruno e capperi su un meraviglioso girello di vitello cotto al punto rosa. Dedicato ed ispirato da Diego Rossi.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 20, "prep_time": 8,
        "allergeni": "pesce,uova",
        "impiatt": "Piatto piano bianco grande. Servire fresco non freddo: lasciare 5' a temperatura ambiente prima di mandare.",
        "items": [
            {"sub": "vitello_girello_rosa", "qty": 100, "unit": "g"},
            {"sub": "salsa_tonnata", "qty": 40, "unit": "ml"},
            {"sub": "fondo_bruno", "qty": 20, "unit": "ml"},
            {"ing": "capperi", "qty": 10, "unit": "g"},
        ],
    },
    {
        "slug": "salame_giardiniera",
        "name": "Salame Roberto + giardiniera",
        "menu_name": "Il salame del Roberto con la giardiniera",
        "menu_description": "Il salame che fa il Roberto, stagionato lentamente in cantina e tagliato a fette grosse, accompagnato dalle nostre verdure sott'aceto.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 16, "prep_time": 5,
        "allergeni": "solfiti",
        "impiatt": "Tagliere di legno o piatto piano. Filo di olio EVO sul salame solo se richiesto.",
        "items": [
            {"ing": "salame_roberto", "qty": 80, "unit": "g"},
            {"ing": "verdure_giardiniera", "qty": 60, "unit": "g"},
        ],
    },
    {
        "slug": "salumi_misti",
        "name": "Tagliere salumi misti (per 2)",
        "menu_name": "I nostri salumi misti",
        "menu_description": "Selezionati dall'oste Marco ed affettati al momento. Consigliati per due.",
        "category": "Antipasto", "yield_qty": 2, "yield_unit": "porzioni",
        "selling_price": 20, "prep_time": 8,
        "allergeni": "solfiti",
        "impiatt": "Tagliere grande condiviso. Etichetta verbale a sala dei tagli serviti.",
        "items": [
            {"ing": "salumi_misti", "qty": 200, "unit": "g"},
            {"ing": "pane_crostini", "qty": 80, "unit": "g"},
        ],
    },
    {
        "slug": "tagliere_form_it",
        "name": "Tagliere formaggi italiani",
        "menu_name": "Le selezioni di formaggi italiani",
        "menu_description": "Selezione di formaggi italiani.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 14, "prep_time": 8,
        "allergeni": "latte",
        "impiatt": "Tagliere o piatto piano grande. Etichette verbali a sala se chiesto dal cliente.",
        "items": [
            {"ing": "selezione_form_it", "qty": 120, "unit": "g"},
            {"ing": "marmellate_mix", "qty": 40, "unit": "g"},
            {"ing": "miele", "qty": 20, "unit": "g"},
        ],
    },
    {
        "slug": "tagliere_form_fr",
        "name": "Tagliere formaggi francesi",
        "menu_name": "Le selezioni di formaggi francesi",
        "menu_description": "Selezione di formaggi francesi.",
        "category": "Antipasto", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 15, "prep_time": 8,
        "allergeni": "latte",
        "impiatt": "Idem tagliere italiani.",
        "items": [
            {"ing": "selezione_form_fr", "qty": 100, "unit": "g"},
            {"ing": "marmellate_mix", "qty": 40, "unit": "g"},
            {"ing": "miele", "qty": 20, "unit": "g"},
        ],
    },

    # ============ PASTE, RISI E ZUPPE ============
    {
        "slug": "risotto_vignarola",
        "name": "Risotto Vignarola Carnaroli SM",
        "menu_name": "Risotto alla Vignarola",
        "menu_description": "Risotto Carnaroli riserva \"San Massimo\" che racconta il passaggio tra la stagione invernale e quella estiva, carciofi, fave, piselli e asparagi. Uniti dalla mentuccia e dal pecorino.",
        "category": "Primo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 18, "prep_time": 22,
        "allergeni": "latte,solfiti",
        "impiatt": "Piatto piano da risotto, scuotere per onda. Mentuccia fresca + olio EVO + pecorino a chip in finitura.",
        "items": [
            {"ing": "riso_carnaroli", "qty": 80, "unit": "g"},
            {"ing": "carciofi", "qty": 40, "unit": "g"},
            {"ing": "fave_fresche", "qty": 30, "unit": "g"},
            {"ing": "piselli", "qty": 30, "unit": "g"},
            {"ing": "asparagi_verdi", "qty": 40, "unit": "g"},
            {"ing": "mentuccia", "qty": 2, "unit": "g"},
            {"ing": "pecorino", "qty": 20, "unit": "g"},
            {"ing": "burro_malga", "qty": 15, "unit": "g"},
            {"ing": "vino_bianco", "qty": 30, "unit": "ml"},
            {"ing": "brodo_vegetale", "qty": 300, "unit": "ml"},
            {"ing": "cipolla", "qty": 10, "unit": "g"},
        ],
    },
    {
        "slug": "fettuccine_burro_formai",
        "name": "Fettuccine burro + Formai de Mut",
        "menu_name": "Fettuccine all'Alfredo \"se fosse stato di Bergamo\"",
        "menu_description": "Pasta fresca mantecata al burro e formai de mut DOP: se le provi, non le dimentichi.",
        "category": "Primo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 18, "prep_time": 8,
        "allergeni": "glutine,latte,uova",
        "impiatt": "Pinza nel piatto fondo da pasta, formai de mut grattato fresco sopra, pepe nero al mulinello.",
        "items": [
            {"ing": "fettuccine_fresche", "qty": 130, "unit": "g"},
            {"ing": "burro_malga", "qty": 50, "unit": "g"},
            {"ing": "formai_de_mut", "qty": 40, "unit": "g"},
            {"ing": "pepe_nero", "qty": 0.5, "unit": "g"},
        ],
    },
    {
        "slug": "casoncelli_mamma_papa",
        "name": "Casoncelli ricetta famiglia Carminati",
        "menu_name": "Casoncelli di mamma e papà",
        "menu_description": "Sono proprio i genitori del nostro oste Marco: Antonella e Gerry che ogni giorno ci preparano questa leccornia con la ricetta della nostra famiglia.",
        "category": "Primo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 18, "prep_time": 6,
        "allergeni": "glutine,latte,uova",
        "impiatt": "Piatto fondo, casoncelli a corona, burro fuso e pancetta sopra, grana grattato in finitura.",
        "items": [
            {"ing": "casoncelli", "qty": 200, "unit": "g"},
            {"ing": "burro_malga", "qty": 30, "unit": "g"},
            {"ing": "salvia", "qty": 2, "unit": "g"},
            {"ing": "pancetta", "qty": 20, "unit": "g"},
            {"ing": "grana", "qty": 15, "unit": "g"},
        ],
    },
    {
        "slug": "lasagnetta_ragu_cortile",
        "name": "Lasagnetta ragù 5 carni bianche",
        "menu_name": "Lasagnetta al ragù di cortile",
        "menu_description": "Una cottura di tre giorni, per un ragù con le carni bianche di faraona, gallina, pollo, anatra e coniglio. Succolento, generoso, buono. Questa volta in una golosissima lasagna.",
        "category": "Primo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 20, "prep_time": 18,
        "allergeni": "glutine,latte,uova,sedano",
        "impiatt": "Servire in pirofila monoporzione con sotto piatto, oppure rovesciata su piatto piano.",
        "items": [
            {"ing": "lasagne_sfoglia", "qty": 100, "unit": "g"},
            {"sub": "ragu_cortile", "qty": 200, "unit": "g"},
            {"ing": "panna_fresca", "qty": 80, "unit": "ml", "note": "besciamella semplificata"},
            {"ing": "burro_malga", "qty": 15, "unit": "g"},
            {"ing": "grana", "qty": 25, "unit": "g"},
        ],
    },
    {
        "slug": "pasta_mista_sarda",
        "name": "Pasta mista sarda + aglio orsino",
        "menu_name": "Pasta mista, sarda di Montisola ed erba orsina",
        "menu_description": "Pasta rustica mantecata con un pesto di aglio orsino, sarda di Montisola sbriciolata, limone salato e crema di caprino.",
        "category": "Primo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 20, "prep_time": 12,
        "allergeni": "glutine,pesce,latte",
        "impiatt": "Piatto fondo. Quenelle di crema caprino al centro, scaglie di sarda + aglio orsino crudo a finitura.",
        "items": [
            {"ing": "pasta_mista_secca", "qty": 100, "unit": "g"},
            {"sub": "pesto_aglio_orsino", "qty": 30, "unit": "ml"},
            {"ing": "sarda_montisola", "qty": 30, "unit": "g"},
            {"ing": "limone_salato", "qty": 10, "unit": "g"},
            {"ing": "caprino", "qty": 30, "unit": "g"},
        ],
    },
    {
        "slug": "trippa_oste",
        "name": "Trippa minestrone primaverile",
        "menu_name": "Trippa dell'Oste",
        "menu_description": "Quando le verdure sono al loro meglio, la trippa trova casa in un minestrone. Parmigiano abbondante, pepe nero generoso.",
        "category": "Primo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 18, "prep_time": 8,
        "allergeni": "latte,sedano",
        "impiatt": "Piatto fondo grande, parmigiano grattato ABBONDANTE, pepe nero generoso, filo di olio EVO crudo.",
        "items": [
            {"ing": "trippa_pulita", "qty": 200, "unit": "g"},
            {"ing": "verdure_minestrone", "qty": 200, "unit": "g"},
            {"ing": "parmigiano", "qty": 25, "unit": "g"},
            {"ing": "pepe_nero", "qty": 1, "unit": "g"},
            {"ing": "olio_evo", "qty": 8, "unit": "ml"},
        ],
    },

    # ============ SECONDI ============
    {
        "slug": "faraona_carote_senape",
        "name": "Faraona BT + carote + miele",
        "menu_name": "Faraona, carote, senape e miele",
        "menu_description": "Petto di faraona cotto a bassa, accompagnato da carote al burro, con un fondo alla senape antica e miele.",
        "category": "Secondo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 24, "prep_time": 12,
        "allergeni": "senape,solfiti",
        "impiatt": "Piatto piano, carote al burro a lato, fette di petto al centro, fondo senape-miele attorno (non sopra la pelle).",
        "items": [
            {"ing": "faraona_petto", "qty": 200, "unit": "g"},
            {"ing": "carote", "qty": 150, "unit": "g"},
            {"ing": "burro_malga", "qty": 25, "unit": "g"},
            {"sub": "fondo_bruno", "qty": 60, "unit": "ml"},
            {"ing": "senape_antica", "qty": 8, "unit": "g"},
            {"ing": "miele", "qty": 5, "unit": "g"},
        ],
    },
    {
        "slug": "filetto_donizetti",
        "name": "Filetto + fegatini + spugnole + Valcalepio",
        "menu_name": "Filetto alla Donizetti",
        "menu_description": "Filetto di manzo, crema di fegatini di coniglio al burro di malga, spugnole primaverili saltate e fondo al Valcalepio rosso.",
        "category": "Secondo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 35, "prep_time": 15,
        "allergeni": "latte,solfiti",
        "impiatt": "Piatto piano, filetto al centro, quenelle di crema fegatini, spugnole sparse, fondo Valcalepio attorno.",
        "items": [
            {"ing": "manzo_filetto", "qty": 200, "unit": "g"},
            {"sub": "crema_fegatini", "qty": 40, "unit": "ml"},
            {"ing": "spugnole", "qty": 50, "unit": "g"},
            {"sub": "fondo_valcalepio", "qty": 60, "unit": "ml"},
            {"ing": "burro_malga", "qty": 15, "unit": "g"},
            {"ing": "sale_maldon", "qty": 1, "unit": "g"},
            {"ing": "pepe_nero", "qty": 0.5, "unit": "g"},
        ],
    },
    {
        "slug": "ossobuco_pure",
        "name": "Ossobuco gremolada + purè",
        "menu_name": "Ossobuco di vitello con purè",
        "menu_description": "Dalla tradizione lombarda l'ossobuco di vitello lungamente cotto. Servito con la tipica gremolada fatta con prezzemolo, limone e un pizzico di aglio.",
        "category": "Secondo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 24, "prep_time": 12,
        "allergeni": "latte,sedano,solfiti",
        "impiatt": "Piatto fondo o piano grande. Fondo cottura attorno, gremolada in evidenza sopra.",
        "items": [
            {"ing": "vitello_ossobuco", "qty": 300, "unit": "g"},
            {"ing": "patate", "qty": 200, "unit": "g", "note": "per purè"},
            {"ing": "burro_malga", "qty": 30, "unit": "g"},
            {"ing": "panna_fresca", "qty": 50, "unit": "ml"},
            {"sub": "gremolada", "qty": 15, "unit": "g"},
            {"sub": "fondo_bruno", "qty": 80, "unit": "ml"},
        ],
    },
    {
        "slug": "ossobuco_risotto_milanese",
        "name": "Ossobuco + Risotto Milanese (combo)",
        "menu_name": "Vuoi un piatto unico con ossobuco e risotto giallo?",
        "menu_description": "Opzione per accontentare i più golosi con il piatto completo con risotto milanese e l'ossobuco in gremolada.",
        "category": "Secondo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 35, "prep_time": 25,
        "allergeni": "latte,sedano,solfiti",
        "impiatt": "Piatto piano grande, risotto giallo a onda, ossobuco al centro sopra, gremolada in finitura, fondo cottura attorno.",
        "items": [
            {"ing": "vitello_ossobuco", "qty": 280, "unit": "g"},
            {"ing": "riso_carnaroli", "qty": 80, "unit": "g"},
            {"ing": "midollo", "qty": 20, "unit": "g"},
            {"ing": "zafferano", "qty": 0.2, "unit": "g"},
            {"ing": "burro_malga", "qty": 30, "unit": "g"},
            {"ing": "grana", "qty": 25, "unit": "g"},
            {"ing": "brodo_carne", "qty": 300, "unit": "ml"},
            {"sub": "gremolada", "qty": 15, "unit": "g"},
        ],
    },
    {
        "slug": "brasato_polenta",
        "name": "Brasato manzo + polenta",
        "menu_name": "Brasato di manzo e polenta",
        "menu_description": "Cotto una notte intera, tenero e succolento che profuma di vino e di casa.",
        "category": "Secondo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 24, "prep_time": 10,
        "allergeni": "solfiti,sedano",
        "impiatt": "Piatto piano, polenta a base, fette di brasato sopra, fondo abbondante.",
        "items": [
            {"ing": "manzo_brasato", "qty": 200, "unit": "g"},
            {"sub": "polenta_nostrana_base", "qty": 200, "unit": "g"},
            {"ing": "vino_rosso", "qty": 30, "unit": "ml", "note": "per fondo"},
            {"sub": "fondo_bruno", "qty": 60, "unit": "ml"},
        ],
    },
    {
        "slug": "coniglio_agretti",
        "name": "Coniglio disossato + agretti",
        "menu_name": "Arrosto di coniglio e agretti",
        "menu_description": "Coniglio disossato, arrotolato ed arrostito, accompagnato del suo fondo e degli agretti freschi spadellati.",
        "category": "Secondo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 22, "prep_time": 14,
        "allergeni": "solfiti",
        "impiatt": "Piatto piano, fette di coniglio al centro, agretti a lato, fondo attorno.",
        "items": [
            {"ing": "coniglio_disossato", "qty": 200, "unit": "g"},
            {"ing": "agretti", "qty": 100, "unit": "g"},
            {"ing": "olio_evo", "qty": 10, "unit": "ml"},
            {"ing": "aglio", "qty": 3, "unit": "g"},
            {"sub": "fondo_bruno", "qty": 50, "unit": "ml"},
        ],
    },
    {
        "slug": "pescato_giorno",
        "name": "Pescato del giorno (variabile)",
        "menu_name": "Pescato del giorno",
        "menu_description": "Chiedici come l'abbiamo cucinato oggi.",
        "category": "Secondo", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 26, "prep_time": 15,
        "allergeni": "pesce",
        "impiatt": "Variabile in base al pescato.",
        "items": [
            {"ing": "pescato_giorno", "qty": 200, "unit": "g"},
            {"ing": "olio_evo", "qty": 10, "unit": "ml"},
            {"ing": "limone_buccia", "qty": 3, "unit": "g"},
        ],
    },

    # ============ CONTORNI ============
    {
        "slug": "polenta_nostrana_contorno",
        "name": "Polenta nostrana (contorno)",
        "menu_name": "Polenta nostrana",
        "menu_description": "Polenta nostrana di accompagnamento.",
        "category": "Contorno", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 4, "prep_time": 3,
        "allergeni": "",
        "impiatt": "Mestolata in pirottino caldo.",
        "items": [
            {"sub": "polenta_nostrana_base", "qty": 150, "unit": "g"},
        ],
    },
    {
        "slug": "assaggio_taragna",
        "name": "Assaggio taragna",
        "menu_name": "Assaggio di Sua Maestà la Taragna",
        "menu_description": "Assaggio della taragna ai 5 formaggi bergamaschi.",
        "category": "Contorno", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 8, "prep_time": 4,
        "allergeni": "latte",
        "impiatt": "Pirottino monoporzione.",
        "items": [
            {"sub": "polenta_taragna_base", "qty": 120, "unit": "g"},
        ],
    },
    {
        "slug": "patate_arrosto",
        "name": "Patate arrosto",
        "menu_name": "Patate arrosto",
        "menu_description": "Patate arrosto al rosmarino.",
        "category": "Contorno", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 6, "prep_time": 8,
        "allergeni": "",
        "impiatt": "Ciotolina o piatto piano, sale Maldon a finitura.",
        "items": [
            {"ing": "patate", "qty": 200, "unit": "g"},
            {"ing": "rosmarino", "qty": 1, "unit": "g"},
            {"ing": "olio_evo", "qty": 10, "unit": "ml"},
            {"ing": "sale", "qty": 2, "unit": "g"},
        ],
    },
    {
        "slug": "spadellata_verdure",
        "name": "Spadellata verdure stagione",
        "menu_name": "Spadellata di verdure",
        "menu_description": "Spadellata di verdure di stagione (variabile).",
        "category": "Contorno", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 6, "prep_time": 6,
        "allergeni": "",
        "impiatt": "Piatto piano o ciotolina, filo olio EVO crudo a fine.",
        "items": [
            {"ing": "verdure_stagione", "qty": 180, "unit": "g"},
            {"ing": "olio_evo", "qty": 10, "unit": "ml"},
            {"ing": "aglio", "qty": 2, "unit": "g"},
            {"ing": "sale", "qty": 1, "unit": "g"},
        ],
    },
    {
        "slug": "giardiniera_casa",
        "name": "Giardiniera casa",
        "menu_name": "Giardiniera di verdure",
        "menu_description": "Giardiniera di verdure sott'aceto della casa.",
        "category": "Contorno", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 6, "prep_time": 2,
        "allergeni": "",
        "impiatt": "Pirottino o ciotolina.",
        "items": [
            {"ing": "verdure_giardiniera", "qty": 150, "unit": "g"},
        ],
    },
    {
        "slug": "insalata_mista_stagione",
        "name": "Insalata mista stagione",
        "menu_name": "Insalata mista di stagione",
        "menu_description": "Insalata mista di stagione condita al momento.",
        "category": "Contorno", "yield_qty": 1, "yield_unit": "porzione",
        "selling_price": 6, "prep_time": 3,
        "allergeni": "",
        "impiatt": "Ciotolina, vinaigrette a parte se richiesto.",
        "items": [
            {"ing": "insalata_mista", "qty": 100, "unit": "g"},
            {"ing": "olio_evo", "qty": 8, "unit": "ml"},
            {"ing": "sale", "qty": 1, "unit": "g"},
        ],
    },
]


# ─────────────────────────────────────────────────────────────────────────
# upgrade()
# ─────────────────────────────────────────────────────────────────────────
def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db. Popola ingredient_categories, ingredients,
    recipes (base + dish), recipe_items."""
    cur = conn.cursor()

    # ── Mappe per cross-reference ──
    cat_id_by_name: dict[str, int] = {}
    ing_id_by_slug: dict[str, int] = {}
    recipe_id_by_slug: dict[str, int] = {}
    recipe_cat_id_by_name: dict[str, int] = {}

    # ── 1. Carica categorie ricetta esistenti (pre-seed dalla mig 007) ──
    for r in cur.execute("SELECT id, name FROM recipe_categories"):
        recipe_cat_id_by_name[r[1]] = r[0]

    # ── 2. Seed ingredient_categories ──
    for nome, desc in INGREDIENT_CATEGORIES:
        existing = cur.execute(
            "SELECT id FROM ingredient_categories WHERE name = ?",
            (nome,),
        ).fetchone()
        if existing:
            cat_id_by_name[nome] = existing[0]
        else:
            cur.execute(
                "INSERT INTO ingredient_categories (name, description) VALUES (?, ?)",
                (nome, desc),
            )
            cat_id_by_name[nome] = cur.lastrowid
    print(f"  · {len(cat_id_by_name)} ingredient_categories presenti/inserite")

    # ── 3. Seed ingredients ──
    ingredients_inseriti = 0
    for ing in INGREDIENTS:
        existing = cur.execute(
            "SELECT id FROM ingredients WHERE name = ?",
            (ing["name"],),
        ).fetchone()
        if existing:
            ing_id_by_slug[ing["slug"]] = existing[0]
            continue

        cat_id = cat_id_by_name.get(ing["cat"])
        cur.execute(
            """
            INSERT INTO ingredients
                (name, category_id, default_unit, allergeni, is_active)
            VALUES (?, ?, ?, ?, 1)
            """,
            (ing["name"], cat_id, ing["unit"], ing["all"] or None),
        )
        ing_id_by_slug[ing["slug"]] = cur.lastrowid
        ingredients_inseriti += 1
    print(f"  · {ingredients_inseriti} ingredients inseriti, {len(INGREDIENTS) - ingredients_inseriti} gia' presenti")

    # ── 4. Seed recipes (base prima, dish dopo, perche' dish referenzia base) ──
    def insert_recipe(r: dict, kind: str, is_base: int) -> None:
        existing = cur.execute(
            "SELECT id FROM recipes WHERE name = ?",
            (r["name"],),
        ).fetchone()
        if existing:
            recipe_id_by_slug[r["slug"]] = existing[0]
            return

        cat_id = recipe_cat_id_by_name.get(r["category"])
        cur.execute(
            """
            INSERT INTO recipes
                (name, menu_name, menu_description, category_id, kind, is_base,
                 yield_qty, yield_unit, selling_price, prep_time,
                 istruzioni_impiattamento, allergeni_calcolati,
                 is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                r["name"],
                r.get("menu_name"),
                r.get("menu_description"),
                cat_id,
                kind,
                is_base,
                r["yield_qty"],
                r["yield_unit"],
                r.get("selling_price"),
                r.get("prep_time"),
                r.get("impiatt"),
                r.get("allergeni"),
            ),
        )
        recipe_id_by_slug[r["slug"]] = cur.lastrowid

    base_inserite = 0
    for r in RECIPES_BASE:
        prima = len(recipe_id_by_slug)
        insert_recipe(r, kind="base", is_base=1)
        if len(recipe_id_by_slug) > prima:
            base_inserite += 1

    dish_inserite = 0
    for r in RECIPES_DISH:
        prima = len(recipe_id_by_slug)
        insert_recipe(r, kind="dish", is_base=0)
        if len(recipe_id_by_slug) > prima:
            dish_inserite += 1

    print(f"  · {base_inserite} ricette base inserite (su {len(RECIPES_BASE)})")
    print(f"  · {dish_inserite} ricette piatto inserite (su {len(RECIPES_DISH)})")

    # ── 5. Seed recipe_items (solo per ricette inserite ex novo) ──
    items_inseriti = 0
    for r in RECIPES_BASE + RECIPES_DISH:
        recipe_id = recipe_id_by_slug.get(r["slug"])
        if not recipe_id:
            continue

        # se la ricetta ha già items skippiamo (idempotenza): non vogliamo
        # duplicare se la ricetta esisteva e items pure.
        already = cur.execute(
            "SELECT count(*) FROM recipe_items WHERE recipe_id = ?",
            (recipe_id,),
        ).fetchone()[0]
        if already > 0:
            continue

        for ordine, item in enumerate(r.get("items", [])):
            ing_id = ing_id_by_slug.get(item.get("ing")) if "ing" in item else None
            sub_id = recipe_id_by_slug.get(item.get("sub")) if "sub" in item else None

            if not ing_id and not sub_id:
                print(f"  ⚠ skip item (ricetta {r['slug']}): nessun ingrediente/sub valido — {item}")
                continue

            cur.execute(
                """
                INSERT INTO recipe_items
                    (recipe_id, ingredient_id, sub_recipe_id, qty, unit, sort_order, note)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    recipe_id,
                    ing_id,
                    sub_id,
                    item["qty"],
                    item["unit"],
                    ordine,
                    item.get("note"),
                ),
            )
            items_inseriti += 1

    print(f"  · {items_inseriti} recipe_items inseriti")

    # ── 6. Aggancio service_type 'Alla carta' alle ricette piatto ──
    # (i piatti del menu sono servizio 'Alla carta' = id 1 dalla mig 074)
    alla_carta = cur.execute(
        "SELECT id FROM service_types WHERE name = 'Alla carta'"
    ).fetchone()
    if alla_carta:
        sid = alla_carta[0]
        agganci = 0
        for r in RECIPES_DISH:
            recipe_id = recipe_id_by_slug.get(r["slug"])
            if not recipe_id:
                continue
            existing = cur.execute(
                "SELECT 1 FROM recipe_service_types WHERE recipe_id = ? AND service_type_id = ?",
                (recipe_id, sid),
            ).fetchone()
            if existing:
                continue
            cur.execute(
                "INSERT INTO recipe_service_types (recipe_id, service_type_id) VALUES (?, ?)",
                (recipe_id, sid),
            )
            agganci += 1
        print(f"  · {agganci} ricette piatto agganciate a service_type 'Alla carta'")

    conn.commit()
    print("  [099] seed food cost (test) completato")
