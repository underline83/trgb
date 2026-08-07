# -*- coding: utf-8 -*-
"""Costruisce il file seed multilingua per il gestionale TRGB.

Unisce italiano.py + contenuti.py (EN/FR/ES) + contenuti_de_uk.py (DE/UK)
in un unico modulo con chiave = TITOLO ITALIANO, pronto per la migrazione
di seed di menu_translations.

Fa anche: spazi insecabili francesi, controlli di coerenza.
"""
import os, re, sys, unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

import italiano as IT
from contenuti import EN, FR, ES
from contenuti_de_uk import DE, UK

NBSP = " "

# ── 1. spazi insecabili francesi ────────────────────────────────────────────
def nbsp_fr(t):
    if not isinstance(t, str):
        return t
    t = re.sub(r"\s+([:;!?»])", NBSP + r"\1", t)
    t = re.sub(r"«\s+", "«" + NBSP, t)
    return t


def walk(o, fn):
    if isinstance(o, str):
        return fn(o)
    if isinstance(o, list):
        return [walk(x, fn) for x in o]
    if isinstance(o, tuple):
        return tuple(walk(x, fn) for x in o)
    if isinstance(o, dict):
        return {k: (v if k == "code" else walk(v, fn)) for k, v in o.items()}
    return o


FR = walk(FR, nbsp_fr)

LINGUE = {"en": EN, "fr": FR, "es": ES, "de": DE, "uk": UK}
SEZIONI = [
    ("antipasti",         "ANTIPASTI", "antipasti"),
    ("paste_risi_zuppe",  "PASTE",     "paste"),
    ("piatti_del_giorno", "GIORNO",    "giorno"),
    ("secondi",           "SECONDI",   "secondi"),
    ("contorni",          "CONTORNI",  "contorni"),
    ("dolci",             "DOLCI",     "dolci"),
]

# ── 2. controlli ────────────────────────────────────────────────────────────
errori = []
for sez, k_it, k_tr in SEZIONI:
    n_it = len(getattr(IT, k_it))
    for code, L in LINGUE.items():
        if len(L[k_tr]) != n_it:
            errori.append(f"{code}/{sez}: it={n_it} tr={len(L[k_tr])}")

# i piatti della degustazione "Fidati dell'oste" devono combaciare coi titoli in carta
for code, L in LINGUE.items():
    titoli = {n for k in ("antipasti", "paste", "secondi") for n, _, _ in L[k]}
    for it in L["deg2_items"][:-1]:          # l'ultimo e' "dolce a scelta"
        if it not in titoli:
            errori.append(f"{code}/deg2: «{it}» non combacia con un titolo in carta")

if errori:
    print("!! INCOERENZE")
    for e in errori:
        print("   ·", e)
    sys.exit(1)
print("controlli di coerenza: ok")


# ── 3. emissione ────────────────────────────────────────────────────────────
def q(s):
    if s is None:
        return "None"
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


out = ['# -*- coding: utf-8 -*-',
       '"""Menu Osteria Tre Gobbi — edizione lug/ago/set 2026.',
       'Traduzioni EN / FR / ES / DE / UK, revisionate da madrelingua.',
       '',
       'STRUTTURA',
       '  PIATTI       lista di dict, uno per piatto, nell\'ordine della carta.',
       '               Chiave di aggancio: it.titolo (titolo italiano esatto).',
       '               Campi: sezione, prezzo, it/en/fr/es/de/uk -> {titolo, descrizione}',
       '               descrizione = None dove il piatto non ne ha (voci senza testo).',
       '  DEGUSTAZIONI lista di dict: nome, sottotitolo, intro, note, prezzo, steps.',
       '  TESTI        blocchi non legati a un piatto: storia, etichette di sezione,',
       '               menu bambini, bevande, note allergeni.',
       '  LINGUE       ("it", "en", "fr", "es", "de", "uk") — "it" e\' la lingua madre.',
       '',
       'NOTE PER IL SEED',
       '  - Il match va fatto su it.titolo normalizzato (trim, casefold, apostrofi',
       '    tipografici uniformati). Le righe non abbinate vanno stampate a video.',
       '  - I tag allergeni fanno parte del titolo: (NG)/(NL) in italiano, (GF)/(LF)',
       '    in inglese e tedesco, (SG)/(SL) in francese e spagnolo, (БГ)/(БЛ) in ucraino.',
       '  - Il francese contiene spazi insecabili U+00A0 prima di : ; ! ? e nei « ».',
       '  - <i>...</i> compare in alcuni testi narrativi: e\' corsivo, non HTML da fuggire.',
       '"""',
       '',
       'LINGUE = ("it", "en", "fr", "es", "de", "uk")',
       '',
       'PIATTI = [']

for sez, k_it, k_tr in SEZIONI:
    righe_it = getattr(IT, k_it)
    out.append(f'    # ── {sez} ' + '─' * (58 - len(sez)))
    for i, riga in enumerate(righe_it):
        if len(riga) == 2:                    # contorni: (titolo, prezzo)
            t_it, prezzo, d_it = riga[0], riga[1], None
        else:
            t_it, prezzo, d_it = riga
        out.append('    {')
        out.append(f'        "sezione": {q(sez)},')
        out.append(f'        "prezzo": {q(prezzo)},')
        out.append(f'        "it": {{"titolo": {q(t_it)},')
        out.append(f'               "descrizione": {q(d_it)}}},')
        for code, L in LINGUE.items():
            r = L[k_tr][i]
            t, d = (r[0], None) if len(r) == 2 else (r[0], r[2])
            out.append(f'        {q(code)}: {{"titolo": {q(t)},')
            out.append(f'               "descrizione": {q(d)}}},')
        out.append('    },')
out.append(']')
out.append('')

# degustazioni
out.append('DEGUSTAZIONI = [')
for n in (1, 2):
    out.append('    {')
    out.append(f'        "prezzo": {q(getattr(IT, f"DEG{n}_PREZZO"))},')
    out.append(f'        "it": {{"nome": {q(IT.DEG_TITOLO)},')
    out.append(f'               "sottotitolo": {q(getattr(IT, f"DEG{n}_SOTTO"))},')
    out.append(f'               "intro": {q(getattr(IT, f"DEG{n}_INTRO"))},')
    out.append(f'               "note": {q(IT.DEG_NOTE)},')
    out.append(f'               "steps": {getattr(IT, f"DEG{n}_ITEMS")!r}}},')
    for code, L in LINGUE.items():
        out.append(f'        {q(code)}: {{"nome": {q(L["deg_title"])},')
        out.append(f'               "sottotitolo": {q(L[f"deg{n}_sub"])},')
        out.append(f'               "intro": {q(L[f"deg{n}_intro"])},')
        out.append(f'               "note": {q(L["deg_note"])},')
        out.append(f'               "steps": {L[f"deg{n}_items"]!r}}},')
    out.append('    },')
out.append(']')
out.append('')

# testi liberi
out.append('TESTI = {')
blocchi = [
    ("storia",           "STORIA",           "story"),
    ("storia_chiusa",    "STORIA_CHIUSA",    "story_close"),
    ("storia_firma",     "STORIA_FIRMA",     "story_sign"),
    ("foto_didascalia",  "FOTO_DIDASCALIA",  "photo_caption"),
    ("allergeni",        "ALLERGENI",        "allergeni"),
    ("bambini_titolo",   "BAMBINI_TITOLO",   "bambini_title"),
    ("bambini_sotto",    "BAMBINI_SOTTO",    "bambini_sub"),
    ("bambini_righe",    "BAMBINI_RIGHE",    "bambini_rows"),
    ("bevande",          "BEVANDE",          "bevande"),
    ("dolci_note",       "DOLCI_NOTE",       "dolci_note"),
]
for nome, k_it, k_tr in blocchi:
    out.append(f'    {q(nome)}: {{')
    out.append(f'        "it": {getattr(IT, k_it)!r},')
    for code, L in LINGUE.items():
        out.append(f'        {q(code)}: {L[k_tr]!r},')
    out.append('    },')

out.append(f'    "sezioni_titoli": {{')
out.append(f'        "it": {IT.SEZIONI_TITOLI!r},')
for code, L in LINGUE.items():
    d = {"antipasti": L["antipasti_title"], "paste_risi_zuppe": L["paste_title"],
         "piatti_del_giorno": L["giorno_title"], "contorni": L["contorni_title"],
         "secondi": L["secondi_title"], "dolci": L["dolci_title"],
         "degustazioni": L["deg_title"], "bambini": L["bambini_title"]}
    out.append(f'        {q(code)}: {d!r},')
out.append('    },')
out.append('}')
out.append('')

testo = "\n".join(out) + "\n"
dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "menu_trgb_multilingua.py")
open(dest, "w", encoding="utf-8").write(testo)
print("scritto", dest, f"({len(testo)//1024} KB)")
