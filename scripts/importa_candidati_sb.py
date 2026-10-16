#!/usr/bin/env python3
# Modulo: dipendenti (sotto-modulo candidati) — [core]. Doc: docs/modulo_dipendenti.md §5.9
"""
TRGB — importa le candidature del second brain nei Candidati.

Legge la tabella markdown di `wiki/liste/candidature.md`
(colonne: Nome | Ruolo | Telefono | Email | Note | Ricevuto | CV) e crea un
candidato per riga con fonte «second brain», passando da candidati_service
(stesse regole della pagina). Di default è una PROVA A VUOTO: stampa cosa
farebbe e non scrive niente. Con --scrivi scrive.

Regole dell'import (le più semplici):
  · nome = prima parola, cognome = il resto («Doga Bitik» → Doga / Bitik);
  · reparto da Ruolo: cucina/cuoco/lavapiatti → CUCINA, sala/barista/cameriere/
    banco/servizio → SALA; se ci sono entrambi resta vuoto;
  · le Note si dividono per virgola: HACCP/permesso → documenti, lingue
    (ita, italiano, inglese, francese, madrelingua…) → lingue, disponibilità/
    weekend/sere/mattini/stagionale/estivo → disponibilità, il resto → note;
  · stato DA_SENTIRE se nelle note c'è qualcosa «da verificare», altrimenti NUOVO;
  · la colonna CV (file .md del second brain) finisce nelle note come
    riferimento: il PDF, se c'è, si carica dalla pagina;
  · una riga con lo stesso telefono, email o nome+cognome di un candidato già
    presente si salta.

Uso:
    python3 scripts/importa_candidati_sb.py                    # prova a vuoto
    python3 scripts/importa_candidati_sb.py --scrivi           # scrive
    python3 scripts/importa_candidati_sb.py --file altro.md
    python3 scripts/importa_candidati_sb.py --db /tmp/copia/dipendenti.sqlite3   # su una copia

Il DB è quello del locale TRGB_LOCALE (default tregobbi), salvo --db.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FILE_DEFAULT = (Path.home() / "Library/CloudStorage/OneDrive-Personale/01_osteria_tre_gobbi"
                / "12-SecondBrain/wiki/liste/candidature.md")
FONTE = "second brain"

PAROLE_CUCINA = ("cucina", "cuoco", "cuoca", "lavapiatti", "pizzaiolo", "pasticcer")
PAROLE_SALA = ("sala", "barista", "cameriere", "cameriera", "banco", "servizio", "bar ")
PAROLE_DOCUMENTI = ("haccp", "permesso", "patente", "attestato")
PAROLE_LINGUE = ("ita ", "ita.", "italiano", "inglese", "francese", "spagnolo", "tedesco",
                 "arabo", "madrelingua", "lingua", "english")
PAROLE_DISPONIBILITA = ("disponibil", "weekend", "sere", "serale", "mattin", "stagional",
                        "estiv", "turni", "full time", "part time", "lavoro estivo")


def leggi_tabella(testo: str) -> list:
    righe = [r.strip() for r in testo.splitlines() if r.strip().startswith("|")]
    if len(righe) < 2:
        return []
    celle = lambda r: [c.strip() for c in r.strip().strip("|").split("|")]
    intest = [c.lower() for c in celle(righe[0])]
    out = []
    for r in righe[1:]:
        cc = celle(r)
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cc if c):
            continue
        out.append(dict(zip(intest, cc + [""] * (len(intest) - len(cc)))))
    return out


def _ha(testo: str, parole) -> bool:
    t = f" {testo.lower()} "
    return any(p in t for p in parole)


def reparto_da_ruolo(ruolo: str, reparti: dict):
    cucina, sala = _ha(ruolo, PAROLE_CUCINA), _ha(ruolo, PAROLE_SALA)
    if cucina and not sala:
        return reparti.get("CUCINA")
    if sala and not cucina:
        return reparti.get("SALA")
    return None


def _pezzi(note: str) -> list:
    """Divide per virgola o punto e virgola, ma non dentro le parentesi."""
    out, buf, livello = [], "", 0
    for ch in note or "":
        livello += (ch == "(") - (ch == ")")
        if ch in ",;" and livello <= 0:
            out.append(buf)
            buf = ""
        else:
            buf += ch
    out.append(buf)
    return [p.strip() for p in out if p.strip()]


def dividi_note(note: str) -> dict:
    out = {"documenti": [], "lingue": [], "disponibilita": [], "note": []}
    for pezzo in _pezzi(note):
        if "verificar" in pezzo.lower():
            out["note"].append(pezzo)
        elif _ha(pezzo, PAROLE_DOCUMENTI):
            out["documenti"].append(pezzo)
        elif _ha(pezzo, PAROLE_LINGUE):
            out["lingue"].append(pezzo)
        elif _ha(pezzo, PAROLE_DISPONIBILITA):
            out["disponibilita"].append(pezzo)
        else:
            out["note"].append(pezzo)
    return {k: (", ".join(v) or None) for k, v in out.items()}


def candidato_da_riga(r: dict, reparti: dict) -> dict:
    nome_intero = (r.get("nome") or "").strip()
    parti = nome_intero.split()
    ruolo = (r.get("ruolo") or "").strip()
    note_raw = (r.get("note") or "").strip()
    pezzi = dividi_note(note_raw)
    note = pezzi["note"]
    cv = (r.get("cv") or "").strip()
    if cv:
        rif = f"CV nel second brain: {cv}"
        note = f"{note}\n{rif}" if note else rif
    return dict(
        nome=parti[0] if parti else "",
        cognome=" ".join(parti[1:]) or None,
        ruolo_cercato=ruolo.replace(" / ", " · ") or None,
        reparto_id=reparto_da_ruolo(ruolo, reparti),
        stato="DA_SENTIRE" if "verificar" in note_raw.lower() else "NUOVO",
        telefono=(r.get("telefono") or "").strip() or None,
        email=(r.get("email") or "").strip() or None,
        disponibilita=pezzi["disponibilita"],
        lingue=pezzi["lingue"],
        documenti=pezzi["documenti"],
        note=note,
        ricevuto_il=(r.get("ricevuto") or "").strip() or None,
        fonte=FONTE,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", type=Path, default=FILE_DEFAULT, help="candidature.md")
    ap.add_argument("--db", type=Path, help="dipendenti.sqlite3 da usare (es. una copia)")
    ap.add_argument("--scrivi", action="store_true", help="scrive davvero (default: prova a vuoto)")
    ap.add_argument("--autore", default="import second brain")
    a = ap.parse_args()

    if a.db:
        if not a.db.is_file():
            print(f"DB non trovato: {a.db}")
            return 1
        import app.models.dipendenti_db as ddb
        ddb.DB_PATH = a.db
    from app.models.dipendenti_db import get_dipendenti_conn, DB_PATH
    from app.services import candidati_service as svc

    if not a.file.is_file():
        print(f"File non trovato: {a.file}")
        return 1
    conn = get_dipendenti_conn()
    try:
        if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='dipendenti_candidati'").fetchone():
            print(f"{DB_PATH}: manca la tabella dipendenti_candidati (migrazione 188 non applicata)")
            return 1
        reparti = {r["codice"]: r["id"] for r in conn.execute("SELECT id, codice FROM reparti")}
    finally:
        conn.close()

    righe = leggi_tabella(a.file.read_text(encoding="utf-8"))
    print(f"{'SCRIVO' if a.scrivi else 'PROVA A VUOTO'} — {len(righe)} righe da {a.file.name} → {DB_PATH}\n")
    creati = saltati = 0
    for r in righe:
        c = candidato_da_riga(r, reparti)
        etichetta = f"{c['nome']} {c['cognome'] or ''}".strip()
        if not c["nome"]:
            print(f"  ✗ riga senza nome, saltata: {r}")
            saltati += 1
            continue
        doppi = svc.cerca_doppioni(nome=c["nome"], cognome=c["cognome"], telefono=c["telefono"], email=c["email"])
        if doppi:
            print(f"  = {etichetta}: già presente (id {', '.join(str(d['id']) for d in doppi)}), saltato")
            saltati += 1
            continue
        rep = next((k for k, v in reparti.items() if v == c["reparto_id"]), "—")
        print(f"  + {etichetta} · {c['ruolo_cercato']} · reparto {rep} · {c['stato']} · ricevuto {c['ricevuto_il']}")
        for k in ("documenti", "lingue", "disponibilita", "note"):
            if c[k]:
                print(f"      {k}: {c[k]}".replace("\n", " | "))
        if a.scrivi:
            nuovo = svc.crea(**c, autore=a.autore)
            print(f"      → creato id {nuovo['id']}")
        creati += 1
    print(f"\n{'Creati' if a.scrivi else 'Da creare'}: {creati} · saltati: {saltati}")
    if not a.scrivi:
        print("Niente scritto. Per scrivere: --scrivi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
