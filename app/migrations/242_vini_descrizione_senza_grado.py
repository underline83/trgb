# Modulo: vini
"""
Migrazione 242 — Il grado alcolico esce dalle descrizioni dei vini (2026-11-23)

CONTESTO:
  La carta vini stampava la DESCRIZIONE così com'è, e in 543 annate (circa
  410 vini madre) il grado era scritto a mano dentro il testo, eredità
  dell'import Excel ("... 15,0 %"). Correggere il campo GRADO_ALCOLICO non
  cambiava la carta. Segnalato da Marco 2026-11-23 sul Patrizio 2021
  (campo 16, carta 15).

DECISIONE DI MARCO (2026-11-23):
  Il grado vive solo in GRADO_ALCOLICO della bottiglia (cambia per annata).
  Chi stampa (carta, calici, pagina cliente, iPratico, etichette, inventari)
  lo aggiunge in fondo — vedi app/services/vini_descrizione.py
  (descrizione_con_grado). Nei 6 vini col campo diverso dal testo vale il
  campo. Il 23/11 i campi vuoti sono già stati riempiti dal testo (464 annate,
  movimenti MODIFICA di «Q»).

COSA FA:
  1. vini_bottiglie: se nel testo c'è un grado sicuro, lo toglie dalla
     DESCRIZIONE; se GRADO_ALCOLICO è vuoto lo riempie prima con quel grado
     (+ movimento MODIFICA, origine MIG-242). Se il campo c'è già, vale il campo.
  2. vini_madre: toglie il grado dalla `descrizione`; se grado_alcolico_tipico
     è vuoto lo riempie (resta la proposta per le annate nuove nel wizard).
  La DESCRIZIONE delle bottiglie è la copia sincronizzata di quella del madre
  (vini_anagrafiche_sync): si puliscono entrambe con la stessa regola.

REGOLA "GRADO SICURO" (prudente):
  Fuori dalle parentesi (dentro ci sono le % dei vitigni) ci deve essere UNA
  sola percentuale (o "°") tra 0 e 25, non attaccata ad altre cifre. Con due o
  più si lascia stare (es. Etna Vico "90%Nerello Mascalese10%Nerello Cappuccio").
  La regola è copiata qui (non importata) perché una migrazione non deve
  cambiare comportamento se in futuro cambia il servizio.

BACKUP:
  Copia di vini_magazzino.sqlite3 con suffisso .pre-mig242-<ts> prima di
  qualunque UPDATE.

IDEMPOTENZA:
  Rieseguibile: la seconda volta non trova più gradi nei testi.

DB: vini_magazzino.sqlite3 (locale-aware).
"""

import re
import shutil
import sqlite3
from datetime import datetime

from app.utils.locale_data import locale_data_path


VINI_MAG_DB = locale_data_path("vini_magazzino.sqlite3")

_RE_GRADO = re.compile(
    r"(?<![\d.,])(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:%|°)(?:\s*vol\.?)?", re.IGNORECASE
)


def _togli_grado(testo):
    """(testo_pulito, grado) — oppure (testo invariato, None) se non c'è un grado sicuro."""
    testo = testo or ""
    pezzi = re.split(r"(\([^)]*\))", testo)
    trovati = []
    for i, p in enumerate(pezzi):
        if p.startswith("("):
            continue
        for m in _RE_GRADO.finditer(p):
            trovati.append((i, m))
    if len(trovati) != 1:
        return testo, None
    i, m = trovati[0]
    try:
        grado = float(m.group(1).replace(",", "."))
    except ValueError:
        return testo, None
    if not (0 <= grado <= 25):
        return testo, None
    p = pezzi[i]
    pezzi[i] = p[: m.start()] + " " + p[m.end():]
    nuovo = "".join(pezzi)
    nuovo = re.sub(r"\s+,", ",", nuovo)
    nuovo = re.sub(r"\(\s+", "(", nuovo)
    nuovo = re.sub(r"\s{2,}", " ", nuovo).strip()
    nuovo = re.sub(r"[\s,\-–]+$", "", nuovo)
    if not nuovo:
        return testo, None
    return nuovo, grado


def upgrade(conn: sqlite3.Connection) -> None:
    if not VINI_MAG_DB.exists():
        print("  [242] vini_magazzino.sqlite3 non esiste, skip")
        return

    mag = sqlite3.connect(VINI_MAG_DB)
    mag.row_factory = sqlite3.Row
    try:
        cur = mag.cursor()
        tabs = {
            r[0]
            for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        if "vini_bottiglie" not in tabs or "vini_madre" not in tabs:
            print("  [242] tabelle vini_bottiglie/vini_madre non presenti, skip")
            return

        bottiglie = []
        for r in cur.execute("SELECT id, DESCRIZIONE, GRADO_ALCOLICO FROM vini_bottiglie").fetchall():
            nuovo, grado = _togli_grado(r["DESCRIZIONE"])
            if grado is not None and nuovo != (r["DESCRIZIONE"] or ""):
                bottiglie.append((r["id"], r["DESCRIZIONE"], nuovo, grado, r["GRADO_ALCOLICO"]))

        madri = []
        for r in cur.execute("SELECT id, descrizione, grado_alcolico_tipico FROM vini_madre").fetchall():
            nuovo, grado = _togli_grado(r["descrizione"])
            if grado is not None and nuovo != (r["descrizione"] or ""):
                madri.append((r["id"], nuovo, grado, r["grado_alcolico_tipico"]))

        print(f"  [242] descrizioni col grado nel testo: {len(bottiglie)} bottiglie, {len(madri)} madri")
        if not bottiglie and not madri:
            print("  [242] niente da pulire, skip")
            return

        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = VINI_MAG_DB.parent / f"{VINI_MAG_DB.name}.pre-mig242-{ts}"
        shutil.copy2(VINI_MAG_DB, backup_path)
        print(f"  [242] backup creato: {backup_path.name}")

        now = datetime.now().isoformat(timespec="seconds")
        riempiti = 0
        for vino_id, _vecchio, nuovo, grado, campo in bottiglie:
            if campo is None:
                cur.execute(
                    "UPDATE vini_bottiglie SET DESCRIZIONE = ?, GRADO_ALCOLICO = ?, UPDATED_AT = ? WHERE id = ?",
                    (nuovo, grado, now, vino_id),
                )
                cur.execute(
                    """INSERT INTO vini_magazzino_movimenti
                           (vino_id, data_mov, tipo, qta, locazione, note, origine, utente, created_at)
                       VALUES (?, ?, 'MODIFICA', 0, NULL, ?, 'MIG-242', 'migration-242', ?)""",
                    (vino_id, now, f"GRADO_ALCOLICO: — → {grado} (preso dalla descrizione)", now),
                )
                riempiti += 1
            else:
                cur.execute(
                    "UPDATE vini_bottiglie SET DESCRIZIONE = ?, UPDATED_AT = ? WHERE id = ?",
                    (nuovo, now, vino_id),
                )

        tipici = 0
        for mid, nuovo, grado, tipico in madri:
            if tipico is None:
                cur.execute(
                    "UPDATE vini_madre SET descrizione = ?, grado_alcolico_tipico = ?, updated_at = datetime('now') WHERE id = ?",
                    (nuovo, grado, mid),
                )
                tipici += 1
            else:
                cur.execute(
                    "UPDATE vini_madre SET descrizione = ?, updated_at = datetime('now') WHERE id = ?",
                    (nuovo, mid),
                )

        mag.commit()
        print(
            f"  [242] fatto: {len(bottiglie)} bottiglie ({riempiti} col campo riempito), "
            f"{len(madri)} madri ({tipici} col grado tipico riempito)"
        )
    finally:
        mag.close()


if __name__ == "__main__":
    upgrade(None)
