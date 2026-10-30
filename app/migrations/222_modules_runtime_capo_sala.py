# Modulo: platform (ruoli/moduli) — [core]
"""
Migrazione 222 — Ruoli dei moduli sul VPS: capo_sala + sommelier su tutto Vini (2026-10-30)

Il push 035a4403 aveva aggiornato `app/data/modules.json`, ma quel file NON è
letto da nessuno: il backend usa il seed e il runtime in
`locali/<TRGB_LOCALE>/data/` (modules.json, modules.runtime.json). Risultato:
sul VPS capo_sala non aveva moduli e il sommelier, cliccando Anagrafiche, veniva
rimandato alla Home (la route chiede vini/settings).

Qui si correggono i file veri, seed e runtime, senza perdere le modifiche fatte
da Impostazioni › Moduli:
1. dove c'è `sommelier`, si aggiunge `capo_sala` (stessi permessi di oggi);
2. Vini › anagrafiche / ipratico / settings: si aggiunge `sommelier`.
Se il runtime era allineato al seed, l'hash applicato si aggiorna al seed nuovo
(così il runtime non viene riscritto). Idempotente.
"""

import hashlib
import json
import sqlite3

from app.utils.locale_data import locale_data_path

SUB_VINI_SOMMELIER = ("anagrafiche", "ipratico", "settings")


def _patch(data) -> int:
    n = 0

    def ruoli(nodo):
        nonlocal n
        r = nodo.get("roles")
        if isinstance(r, list) and "sommelier" in r and "capo_sala" not in r:
            r.insert(r.index("sommelier") + 1, "capo_sala")
            n += 1

    for m in data:
        ruoli(m)
        for s in m.get("sub") or []:
            # le sub di Vini che diventano del sommelier NON vanno al capo sala
            if m.get("key") == "vini" and s.get("key") in SUB_VINI_SOMMELIER:
                continue
            ruoli(s)
    for m in data:
        if m.get("key") != "vini":
            continue
        for s in m.get("sub") or []:
            r = s.get("roles")
            if s.get("key") in SUB_VINI_SOMMELIER and isinstance(r, list) and "sommelier" not in r:
                r.insert(r.index("admin") + 1 if "admin" in r else len(r), "sommelier")
                n += 1
    return n


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def upgrade(conn: sqlite3.Connection) -> None:
    seed = locale_data_path("modules.json")
    runtime = locale_data_path("modules.runtime.json")
    meta = locale_data_path("modules.runtime.meta.json")

    applicato = None
    if meta.exists():
        try:
            applicato = json.loads(meta.read_text(encoding="utf-8")).get("seed_hash")
        except Exception:
            applicato = None
    seed_allineato = seed.exists() and applicato == _sha(seed)

    for path in (seed, runtime):
        if not path.exists():
            print(f"  [222] {path.name}: assente")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        n = _patch(data)
        if n:
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"  [222] {path.name}: {n} liste ruoli aggiornate")

    if seed_allineato:
        meta.write_text(json.dumps({"seed_hash": _sha(seed)}, indent=2), encoding="utf-8")
        print("  [222] hash seed applicato aggiornato")
