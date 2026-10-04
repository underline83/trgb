# Seed traduzioni del menu carta "Autunno 2026" (ott/nov/dic) — specifico
# Tre Gobbi. Saltato dal migration_runner quando TRGB_LOCALE != "tregobbi".
# Vedi locali/tregobbi/seeds/MIGRATIONS_TRGB.md.
TRGB_SPECIFIC = True

"""
Migrazione 181 — Seed traduzioni menu Autunno 2026 — [locale:tregobbi]

Modulo: menu_carta

Popola `menu_translations` per l'edizione `autunno-2026` (creata dalla mig 180)
in EN, FR, ES, DE, UK. Stesso motore e stesse regole della mig 164.

Sorgente
--------
`locali/tregobbi/seeds/menu_traduzioni_ott_dic_2026.py`, generato da
`sorgenti_menu_ott_dic_2026/costruisci_seed.py`. Piatti rimasti dall'Estate:
testo revisionato da madrelingua (ago 2026). Piatti nuovi: tradotti il
2026-10-04, DA RIVEDERE. Se cambia la carta si rigenera, non si edita a mano.

Differenze rispetto alla 164
----------------------------
- L'edizione si cerca per **slug** (`autunno-2026`), non per stato: la 180 puo'
  crearla in bozza o in carta, il seed vale in entrambi i casi.
- La 180 copia gia' le traduzioni delle voci identiche all'Estate. Questa
  migrazione scrive con `ON CONFLICT DO NOTHING`, quindi su quelle voci non
  tocca niente (e non sovrascrive approvazioni gia' fatte): riempie le nuove.
- I tag dietetici non sono piu' nei titoli del seed (stanno nel campo `tag`):
  la ripulitura dei titoli resta solo come rete di sicurezza.
- Formaggi: nel cartaceo e' una voce con due righe di prezzo, a DB sono due
  publication (italiani / francesi, ricette 22 e 23). Mappa esplicita in
  FORMAGGI qui sotto, con `prezzo_label` tradotto.

Idempotenza: `INSERT ... ON CONFLICT DO NOTHING`, tutte le righe `rivisto = 0`.
Le righe non abbinate vengono stampate a video.
"""

import importlib.util
import re
import sqlite3
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ─────────────────────────────────────────────────────────────
#   Normalizzazione
# ─────────────────────────────────────────────────────────────

_TAG_DIETETICI = re.compile(r"\s*\((?:NG|NL|GF|LF|SG|SL|БГ|БЛ)\)", re.IGNORECASE)

# "(prezzo per 2 persone)" e le sue traduzioni: (price for two),
# (prix pour 2 personnes), (precio para 2 personas), (Preis für 2 Personen),
# (ціна за 2 особи).
_CODA_PREZZO = re.compile(
    r"\s*\([^)]*(?:2\s*persone|for\s+two|2\s*people|2\s*personnes|2\s*personas|"
    r"2\s*Personen|2\s*особи)[^)]*\)",
    re.IGNORECASE,
)

_SOSTITUZIONI = [
    ("’", "'"), ("‘", "'"),           # ’ ‘
    ("“", '"'), ("”", '"'),           # “ ”
    ("„", '"'), ("«", '"'), ("»", '"'),   # „ « »
    (" ", " "), (" ", " "),           # spazi insecabili (francese)
    ("–", "-"), ("—", "-"),           # – —
]


# Il file seed usa <i>...</i> per il corsivo su "Oste" nei testi tedeschi (2
# righe in tutto): serviva al PDF. La pagina pubblica e' React e stampa il
# markup come testo letterale — l'ospite leggerebbe "der <i>Oste</i>".
# Si toglie il tag e si tiene il testo: aggiungere un renderer HTML a una
# pagina pubblica SENZA AUTH per due corsivi decorativi non vale la superficie
# di rischio che apre. L'italiano a DB non ha mai contenuto markup.
_TAG_HTML = re.compile(r"</?i>", re.IGNORECASE)


def strip_markup(s: Optional[str]) -> Optional[str]:
    """Toglie il markup di impaginazione. Applicato SEMPRE, a ogni campo."""
    if not s:
        return s
    return _TAG_HTML.sub("", s)


def pulisci(s: Optional[str]) -> Optional[str]:
    """Toglie tag dietetici e coda di prezzo. Non tocca il resto del testo."""
    if not s:
        return s
    return _CODA_PREZZO.sub("", _TAG_DIETETICI.sub("", s)).strip()


def norm(s: Optional[str]) -> str:
    """Chiave di confronto: non deve MAI essere usata come valore da salvare."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", str(s))
    for a, b in _SOSTITUZIONI:
        s = s.replace(a, b)
    s = re.sub(r"\s+", " ", s).strip()
    return s.strip("\"'").strip().casefold()


# ─────────────────────────────────────────────────────────────
#   Caricamento del file seed
# ─────────────────────────────────────────────────────────────

SEED_REL = "locali/tregobbi/seeds/menu_traduzioni_ott_dic_2026.py"
EDITION_SLUG = "autunno-2026"

# Formaggi: una voce nel cartaceo, due publication a DB. Chiave = titolo IT a DB.
FORMAGGI: Dict[str, Dict[str, Dict[str, str]]] = {
    "Le selezioni di formaggi italiani": {
        "en": {"titolo": "OUR ITALIAN CHEESE SELECTION", "descrizione": "A selection of Italian cheeses.",
               "prezzo_label": "14 (4 pieces) / 20 (6 pieces)"},
        "fr": {"titolo": "NOTRE SÉLECTION DE FROMAGES ITALIENS", "descrizione": "Sélection de fromages italiens.",
               "prezzo_label": "14 (4 morceaux) / 20 (6 morceaux)"},
        "es": {"titolo": "NUESTRA SELECCIÓN DE QUESOS ITALIANOS", "descrizione": "Selección de quesos italianos.",
               "prezzo_label": "14 (4 piezas) / 20 (6 piezas)"},
        "de": {"titolo": "UNSERE ITALIENISCHE KÄSEAUSWAHL", "descrizione": "Eine Auswahl italienischer Käse.",
               "prezzo_label": "14 (4 Stück) / 20 (6 Stück)"},
        "uk": {"titolo": "НАША ДОБІРКА ІТАЛІЙСЬКИХ СИРІВ", "descrizione": "Добірка італійських сирів.",
               "prezzo_label": "14 (4 шматочки) / 20 (6 шматочків)"},
    },
    "Le selezioni di formaggi francesi": {
        "en": {"titolo": "OUR FRENCH CHEESE SELECTION", "descrizione": "A selection of French cheeses.",
               "prezzo_label": "15 (3 pieces) / 25 (5 pieces)"},
        "fr": {"titolo": "NOTRE SÉLECTION DE FROMAGES FRANÇAIS", "descrizione": "Sélection de fromages français.",
               "prezzo_label": "15 (3 morceaux) / 25 (5 morceaux)"},
        "es": {"titolo": "NUESTRA SELECCIÓN DE QUESOS FRANCESES", "descrizione": "Selección de quesos franceses.",
               "prezzo_label": "15 (3 piezas) / 25 (5 piezas)"},
        "de": {"titolo": "UNSERE FRANZÖSISCHE KÄSEAUSWAHL", "descrizione": "Eine Auswahl französischer Käse.",
               "prezzo_label": "15 (3 Stück) / 25 (5 Stück)"},
        "uk": {"titolo": "НАША ДОБІРКА ФРАНЦУЗЬКИХ СИРІВ", "descrizione": "Добірка французьких сирів.",
               "prezzo_label": "15 (3 шматочки) / 25 (5 шматочків)"},
    },
}
TITOLO_SEED_FORMAGGI = "LE SELEZIONI DI FORMAGGI"

# Il cartaceo scrive "PRIMO PIATTO", il DB "Primo piatto bambini".
MAPPA_BAMBINI = {
    "PRIMO PIATTO": "Primo piatto bambini",
    "SECONDO PIATTO": "Secondo piatto bambini",
}

# `prezzo_label` che il file seed non traduce, perche' li' il prezzo e' un
# campo unico condiviso fra le lingue ("da 14 a 26" resterebbe in italiano su
# tutte). I valori sotto sono presi dai PDF tradotti consegnati con il seed
# (`menu-lug-ago-set-2026-<lang>.pdf`), non inventati qui.
# Chiave = `prezzo_label` italiano esatto come sta a DB.
PREZZI_LABEL: Dict[str, Dict[str, str]] = {
    "da 14 a 26": {
        "en": "14 to 26",
        "fr": "de 14 à 26",
        "es": "de 14 a 26",
        "de": "14 bis 26",
        "uk": "від 14 до 26",
    },
}


def _carica_seed():
    """Importa il modulo seed dal repo. None se assente (nessun crash)."""
    root = Path(__file__).resolve().parents[2]
    path = root / SEED_REL
    if not path.exists():
        return None
    spec = importlib.util.spec_from_file_location("_seed_menu_trad_181", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ─────────────────────────────────────────────────────────────
#   Migrazione
# ─────────────────────────────────────────────────────────────

def upgrade(conn: sqlite3.Connection) -> None:
    """conn = foodcost.db"""
    cur = conn.cursor()

    # La 163 crea la tabella. Se manca, questa migrazione non ha senso di
    # esistere: si esce senza rumore invece di sollevare, cosi' un ordine di
    # esecuzione inatteso non blocca il boot.
    t = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='menu_translations'"
    ).fetchone()
    if not t:
        print("  [181] menu_translations assente (mig 163 non applicata) — seed saltato")
        return

    seed = _carica_seed()
    if seed is None:
        print(f"  [181] ⚠️  {SEED_REL} non trovato — seed saltato, nessuna riga scritta")
        return

    ed = cur.execute(
        "SELECT id, nome FROM menu_editions WHERE slug = ? LIMIT 1", (EDITION_SLUG,)
    ).fetchone()
    if not ed:
        print(f"  [181] ⚠️  edizione '{EDITION_SLUG}' assente (mig 180 non applicata?) — seed saltato")
        return
    edition_id, edition_nome = ed[0], ed[1]

    # ── indice delle publication dell'edizione, per titolo italiano ──
    pubs = cur.execute("""
        SELECT p.id, p.sezione, COALESCE(p.titolo_override, r.menu_name) AS titolo
        FROM menu_dish_publications p
        LEFT JOIN recipes r ON p.recipe_id = r.id
        WHERE p.edition_id = ?
    """, (edition_id,)).fetchall()

    per_titolo: Dict[str, List[tuple]] = {}
    for row in pubs:
        per_titolo.setdefault(norm(row[2]), []).append(row)

    paths = cur.execute(
        "SELECT id, nome FROM menu_tasting_paths WHERE edition_id = ?", (edition_id,)
    ).fetchall()
    per_nome = {norm(p[1]): p for p in paths}

    LINGUE = [l for l in seed.LINGUE if l != "it"]
    righe: List[Tuple[str, int, str, str, str]] = []   # entita, id, lang, campo, valore
    non_abbinati: List[str] = []
    abbinate_pub: set = set()
    label_non_tradotte: set = set()

    def aggiungi(entita: str, eid: int, lang: str, campo: str,
                 valore: Optional[str], ripulisci: bool = True) -> None:
        # `ripulisci=False` per il prezzo_label: la sua coda "(price for two)"
        # E' il contenuto del campo, non un doppione da togliere. Passandolo
        # per pulisci() resterebbe il solo numero.
        v = strip_markup(valore)
        v = pulisci(v) if ripulisci else (v or "").strip()
        if v and str(v).strip():
            righe.append((entita, eid, lang, campo, str(v).strip()))

    # ── 1. piatti ──
    for p in seed.PIATTI:
        if norm(p["it"]["titolo"]) == norm(TITOLO_SEED_FORMAGGI):
            for titolo_db, per_lang in FORMAGGI.items():
                hit = per_titolo.get(norm(titolo_db))
                if not hit:
                    non_abbinati.append(f"[antipasti] {titolo_db}")
                    continue
                pub_id = hit[0][0]
                abbinate_pub.add(pub_id)
                for lang in LINGUE:
                    tr = per_lang.get(lang) or {}
                    aggiungi("publication", pub_id, lang, "titolo", tr.get("titolo"))
                    aggiungi("publication", pub_id, lang, "descrizione", tr.get("descrizione"))
                    aggiungi("publication", pub_id, lang, "prezzo_label", tr.get("prezzo_label"),
                             ripulisci=False)
            continue
        chiave = norm(pulisci(p["it"]["titolo"]))
        hit = per_titolo.get(chiave)
        if not hit:
            non_abbinati.append(f"[{p['sezione']}] {p['it']['titolo']}")
            continue
        pub_id = hit[0][0]
        abbinate_pub.add(pub_id)

        lbl_row = cur.execute(
            "SELECT prezzo_label FROM menu_dish_publications WHERE id = ?", (pub_id,)
        ).fetchone()
        label_it = (lbl_row[0] if lbl_row else None) or ""

        for lang in LINGUE:
            tr = p.get(lang) or {}
            aggiungi("publication", pub_id, lang, "titolo", tr.get("titolo"))
            aggiungi("publication", pub_id, lang, "descrizione", tr.get("descrizione"))

            if not label_it:
                continue

            # Caso 1 — la coda "(price for two)" che abbiamo tolto dal titolo
            # E' l'informazione che a DB vive in prezzo_label: la si ricompone
            # col prezzo, senza ripulirla di nuovo.
            coda = _CODA_PREZZO.search(tr.get("titolo") or "")
            if coda:
                aggiungi("publication", pub_id, lang, "prezzo_label",
                         f"{p.get('prezzo', '')} {coda.group(0).strip()}".strip(),
                         ripulisci=False)
                continue

            # Caso 2 — label che il file non traduce (il suo `prezzo` e' una
            # stringa sola per tutte le lingue): tabella esplicita dai PDF.
            tradotto = PREZZI_LABEL.get(label_it.strip(), {}).get(lang)
            if tradotto:
                aggiungi("publication", pub_id, lang, "prezzo_label", tradotto,
                         ripulisci=False)
            else:
                label_non_tradotte.add(label_it.strip())

    # ── 2. voci di servizio (TESTI["bevande"]) ──
    bev = seed.TESTI.get("bevande", {})
    it_bev = bev.get("it") or []
    for i, riga_it in enumerate(it_bev):
        titolo_it = riga_it[0]
        hit = per_titolo.get(norm(titolo_it))
        if not hit:
            non_abbinati.append(f"[servizio] {titolo_it}")
            continue
        pub_id = hit[0][0]
        abbinate_pub.add(pub_id)
        for lang in LINGUE:
            r = (bev.get(lang) or [])
            if i >= len(r):
                continue
            aggiungi("publication", pub_id, lang, "titolo", r[i][0])
            if len(r[i]) > 2:
                aggiungi("publication", pub_id, lang, "descrizione", r[i][2])

    # ── 3. menu bambini (TESTI["bambini_righe"]) ──
    bam = seed.TESTI.get("bambini_righe", {})
    it_bam = bam.get("it") or []
    for i, riga_it in enumerate(it_bam):
        titolo_cartaceo = riga_it[0]
        titolo_db = MAPPA_BAMBINI.get(titolo_cartaceo)
        hit = per_titolo.get(norm(titolo_db)) if titolo_db else None
        if not hit:
            non_abbinati.append(f"[bambini] {titolo_cartaceo}")
            continue
        pub_id = hit[0][0]
        abbinate_pub.add(pub_id)
        for lang in LINGUE:
            r = (bam.get(lang) or [])
            if i < len(r):
                aggiungi("publication", pub_id, lang, "titolo", r[i][0])

    # ── 4. degustazioni ──
    # Attenzione all'inversione: nel file `sottotitolo` e' il nome del percorso
    # e `intro` e' il testo lungo; a DB sono `nome` e `sottotitolo`.
    for d in seed.DEGUSTAZIONI:
        chiave = norm(d["it"].get("sottotitolo"))
        path = per_nome.get(chiave)
        if not path:
            non_abbinati.append(f"[degustazione] {d['it'].get('sottotitolo')}")
            continue
        path_id = path[0]
        for lang in LINGUE:
            tr = d.get(lang) or {}
            # `nome` NON si traduce: firma della casa, resta italiano.
            aggiungi("tasting_path", path_id, lang, "sottotitolo", tr.get("intro"))
            aggiungi("tasting_path", path_id, lang, "note", tr.get("note"))

    # ── scrittura ──
    scritte = 0
    for entita, eid_, lang, campo, valore in righe:
        cur.execute("""
            INSERT INTO menu_translations (entita, entita_id, lang, campo, valore, rivisto)
            VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT (entita, entita_id, lang, campo) DO NOTHING
        """, (entita, eid_, lang, campo, valore))
        scritte += cur.rowcount or 0

    conn.commit()

    # ── report ──
    print(f"  [181] seed traduzioni — edizione «{edition_nome}» (id {edition_id})")
    print(f"        lingue: {', '.join(LINGUE)}")
    print(f"        righe preparate: {len(righe)} · inserite ora: {scritte}"
          f" · gia' presenti (non toccate): {len(righe) - scritte}")
    print(f"        publications abbinate: {len(abbinate_pub)}/{len(pubs)}")

    senza = [row for row in pubs if row[0] not in abbinate_pub]
    if senza:
        print(f"        ⚠️  {len(senza)} publication SENZA traduzione (resteranno in italiano):")
        for row in senza:
            print(f"            · [{row[1]}] {row[2]}")

    if label_non_tradotte:
        print(f"        ⚠️  prezzo_label senza traduzione (resteranno in italiano):")
        for l in sorted(label_non_tradotte):
            print(f"            · «{l}»  → aggiungilo a PREZZI_LABEL in questa migrazione")

    if non_abbinati:
        print("")
        print("        " + "!" * 60)
        print(f"        !! {len(non_abbinati)} RIGHE DEL SEED NON ABBINATE A NESSUN PIATTO")
        print("        !! (titolo italiano cambiato in carta? seed di un'altra edizione?)")
        for t in non_abbinati:
            print(f"        !!   {t}")
        print("        " + "!" * 60)
    else:
        print("        ✅ tutte le righe del seed sono state abbinate")

    print("        Tutte le righe entrano con rivisto=0: da approvare dal")
    print("        backoffice, tab Traduzioni.")
