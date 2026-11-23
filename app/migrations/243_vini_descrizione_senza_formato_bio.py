# Modulo: vini
"""
Migrazione 243 — Formato e BIO escono dalle descrizioni dei vini (2026-11-23)

CONTESTO:
  Come per il grado (mig 242): nelle descrizioni c'erano scritti a mano il
  formato («MAGNUM», «(DOPPIO-MAGNUM)», «3 litri Jeroboam», «(0,375ml)»,
  «500ml»…) e il biologico («BIO», «BIOLOGICO», «(BIO)»), eredità
  dell'import Excel. I campi FORMATO e BIOLOGICO esistevano ma la carta non li
  leggeva, ed erano spesso sbagliati o vuoti (133 bio col flag spento, Magnum
  segnati Bottiglia, Doppio Magnum segnati Magnum).

DECISIONE DI MARCO (2026-11-23):
  Formato e BIO vivono nei loro campi; chi stampa li aggiunge
  (vini_descrizione.descrizione_carta: «… 15,5% · BIO · Magnum 1,5 L»).
  Il 23/11, prima di questa migrazione, i campi sono stati controllati e
  corretti a mano via API (movimenti MODIFICA di «Q»), con i dubbi decisi da
  Marco (Salina 2025 = 0,5; Soave Pieropan 2024/25 e Leone 2025 = Magnum;
  Lumine = 0,375; Akoya, Saracco, 8'9'10 = 0,75).

COSA FA:
  1. vini_bottiglie: toglie dalla DESCRIZIONE le scritte di formato se FORMATO
     è compilato, le scritte BIO se BIOLOGICO = 1, e il grado rimasto senza
     «%» se coincide con GRADO_ALCOLICO (Amarone Classico «… 15,5»).
  2. vini_madre: stessa pulizia sulla `descrizione`, ma solo se TUTTE le sue
     bottiglie hanno il campo corrispondente (FORMATO compilato / BIO acceso):
     la descrizione del madre viene ricopiata sulle bottiglie dal sync.
  «BIO e Biodinamico» diventa «Biodinamico» (quell'informazione non ha campo).

BACKUP: copia di vini_magazzino.sqlite3 con suffisso .pre-mig243-<ts>.
IDEMPOTENZA: rieseguibile, la seconda volta non trova più niente.
DB: vini_magazzino.sqlite3 (locale-aware).
"""

import re
import shutil
import sqlite3
from datetime import datetime

from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")

_PAROLE_FMT = r"(?:DOPPIO[\s-]*MAGNUM|MAGNUM|J[EÉ]ROBOAM|R[EÉ]HOBOAM|SALMANAZAR|MATHUSALEM|BALTHAZAR)"
_VOLUME = r"(?:\d+(?:[.,]\d+)?\s*(?:litri|litro|lt|ml|cl|l)\b|0[.,]\d{1,3}\b)"
# Parentesi fatte solo di formato: «(MAGNUM)», «(JEROBOAM 5litri)», «(0,375ml)», «(0,500)»
_RE_FMT_PAREN = re.compile(
    r"\(\s*(?:" + _PAROLE_FMT + "|" + _VOLUME + r")(?:\s*(?:" + _PAROLE_FMT + "|" + _VOLUME + r"))*\s*\)",
    re.IGNORECASE,
)
# Scritte di formato fuori dalle parentesi: «MAGNUM», «3 litri», «1,5 L», «0,375», «500ml»
_RE_FMT = re.compile(
    r"(?<![\w%])(?:" + _PAROLE_FMT
    + r"|\d+(?:[.,]\d+)?\s*(?:litri|litro|lt|ml|cl)\b|1[.,]5\s*l\b|0[.,]\d{1,3}(?:\s*(?:ml|l|lt)\b)?)(?![\w%])",
    re.IGNORECASE,
)
_RE_BIO_PAREN = re.compile(r"\(\s*BIO(?:LOGIC[OA])?\s*\)", re.IGNORECASE)
_RE_BIO_E_BIODIN = re.compile(r"\bBIO(?:LOGIC[OA])?\s+e\s+(Biodinamic[oa])\b", re.IGNORECASE)
_RE_BIO = re.compile(r"(?:[-–]\s*)?(?<![\w])BIO(?:LOGIC[OA])?(?![\w])", re.IGNORECASE)


def _fuori_parentesi(testo, regex):
    """Applica la sostituzione solo fuori dalle parentesi (dentro ci sono i vitigni)."""
    pezzi = re.split(r"(\([^)]*\))", testo)
    return "".join(p if p.startswith("(") else regex.sub(" ", p) for p in pezzi)


def _ripulisci(testo):
    t = re.sub(r"\(\s*\)", " ", testo)
    t = re.sub(r"\s+,", ",", t)
    t = re.sub(r"\(\s+", "(", t)
    t = re.sub(r"\s+\)", ")", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    t = re.sub(r"[\s,\-–]+$", "", t)
    return t


def _togli_formato(testo):
    t = _RE_FMT_PAREN.sub(" ", testo)
    t = _fuori_parentesi(t, _RE_FMT)
    return _ripulisci(t)


def _togli_bio(testo):
    t = _RE_BIO_E_BIODIN.sub(r"\1", testo)
    t = _RE_BIO_PAREN.sub(" ", t)
    t = _fuori_parentesi(t, _RE_BIO)
    return _ripulisci(t)


def _togli_grado_nudo(testo, gradi):
    """«… 15,5» in fondo, senza %, tolto solo se è proprio il grado del campo."""
    m = re.search(r"\s(\d{1,2}[.,]\d{1,2})\s*$", testo)
    if not m or not gradi:
        return testo
    try:
        g = float(m.group(1).replace(",", "."))
    except ValueError:
        return testo
    if any(x is not None and abs(float(x) - g) < 0.01 for x in gradi):
        return _ripulisci(testo[: m.start()])
    return testo


def _pulisci(testo, formato, bio, gradi):
    nuovo = testo or ""
    if formato:
        nuovo = _togli_formato(nuovo)
    if bio:
        nuovo = _togli_bio(nuovo)
    nuovo = _togli_grado_nudo(nuovo, gradi)
    if not nuovo.strip():
        return testo
    # Si tocca il testo solo se è stato tolto qualcosa davvero: niente ritocchi
    # di soli spazi su descrizioni che non avevano né formato né BIO.
    if re.sub(r"[\s,]", "", nuovo) == re.sub(r"[\s,]", "", testo or ""):
        return testo
    return nuovo


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [243] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    mag.row_factory = sqlite3.Row
    try:
        cur = mag.cursor()
        tabs = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if "vini_bottiglie" not in tabs or "vini_madre" not in tabs:
            print("  [243] tabelle vini_bottiglie/vini_madre non presenti, skip")
            return

        bott = cur.execute(
            "SELECT id, madre_id, DESCRIZIONE, FORMATO, BIOLOGICO, GRADO_ALCOLICO FROM vini_bottiglie"
        ).fetchall()

        modifiche_b = []
        per_madre = {}
        for r in bott:
            ha_fmt = bool((r["FORMATO"] or "").strip())
            ha_bio = bool(r["BIOLOGICO"])
            if r["madre_id"] is not None:
                per_madre.setdefault(r["madre_id"], []).append((ha_fmt, ha_bio, r["GRADO_ALCOLICO"]))
            nuovo = _pulisci(r["DESCRIZIONE"], ha_fmt, ha_bio, [r["GRADO_ALCOLICO"]])
            if nuovo != (r["DESCRIZIONE"] or ""):
                modifiche_b.append((r["id"], nuovo))

        modifiche_m = []
        for r in cur.execute("SELECT id, descrizione FROM vini_madre").fetchall():
            figli = per_madre.get(r["id"])
            if not figli:
                continue
            tutti_fmt = all(f for f, _b, _g in figli)
            tutti_bio = all(b for _f, b, _g in figli)
            gradi = [g for _f, _b, g in figli]
            nuovo = _pulisci(r["descrizione"], tutti_fmt, tutti_bio, gradi)
            if nuovo != (r["descrizione"] or ""):
                modifiche_m.append((r["id"], nuovo))

        print(f"  [243] descrizioni da pulire: {len(modifiche_b)} bottiglie, {len(modifiche_m)} madri")
        if not modifiche_b and not modifiche_m:
            print("  [243] niente da pulire, skip")
            return

        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = VINI_MAG_DB.parent / f"{VINI_MAG_DB.name}.pre-mig243-{ts}"
        shutil.copy2(VINI_MAG_DB, backup_path)
        print(f"  [243] backup creato: {backup_path.name}")

        now = datetime.now().isoformat(timespec="seconds")
        for vid, nuovo in modifiche_b:
            cur.execute("UPDATE vini_bottiglie SET DESCRIZIONE = ?, UPDATED_AT = ? WHERE id = ?", (nuovo, now, vid))
        for mid, nuovo in modifiche_m:
            cur.execute("UPDATE vini_madre SET descrizione = ?, updated_at = datetime('now') WHERE id = ?", (nuovo, mid))
        mag.commit()
        print(f"  [243] fatto: {len(modifiche_b)} bottiglie, {len(modifiche_m)} madri")
    finally:
        mag.close()


if __name__ == "__main__":
    upgrade(None)
