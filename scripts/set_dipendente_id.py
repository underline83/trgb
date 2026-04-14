#!/usr/bin/env python3
"""
TRGB — Collega utenti a dipendenti.

Aggiorna `app/data/users.json` aggiungendo il campo `dipendente_id` agli
utenti specificati. Serve per la vista "I miei turni" (/miei-turni): il
backend risolve l'utente loggato -> dipendente_id per mostrare solo i
turni del singolo dipendente.

users.json e' .gitignored, quindi questo script va lanciato SUL VPS (non
basta fare push.sh): le modifiche locali in dev non arrivano in prod.

Uso (sul VPS):

    cd /opt/trgb   # o dove è installato il backend
    python3 scripts/set_dipendente_id.py                # mostra mapping corrente
    python3 scripts/set_dipendente_id.py --apply        # scrive il mapping di default
    python3 scripts/set_dipendente_id.py --set iryna=7  # collega un utente specifico
    python3 scripts/set_dipendente_id.py --clear ospite # rimuove il collegamento

Il servizio backend (trgb-backend.service) va ricaricato dopo:

    sudo systemctl restart trgb-backend
"""

import argparse
import json
import sys
from pathlib import Path

# Default suggerito (modificabile con --set)
# Da database dipendenti.sqlite3: marco=1, paolo=4, iryna=7
DEFAULT_MAPPING = {
    "marco": 1,
    "iryna": 7,
    "paolo": 4,
}

HERE = Path(__file__).resolve().parent
USERS_FILE = HERE.parent / "app" / "data" / "users.json"


def load_users():
    if not USERS_FILE.exists():
        print(f"ERRORE: {USERS_FILE} non trovato", file=sys.stderr)
        sys.exit(1)
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_users(users):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2, ensure_ascii=False)
        f.write("\n")


def show(users):
    print(f"{'USERNAME':<16} {'RUOLO':<12} {'DIPENDENTE_ID'}")
    print("-" * 45)
    for u in users:
        dip = u.get("dipendente_id")
        dip_str = str(dip) if dip is not None else "—"
        print(f"{u['username']:<16} {u['role']:<12} {dip_str}")


def apply_mapping(users, mapping, verbose=True):
    changes = 0
    for u in users:
        if u["username"] in mapping:
            new_id = mapping[u["username"]]
            old_id = u.get("dipendente_id")
            if old_id != new_id:
                u["dipendente_id"] = new_id
                if verbose:
                    print(f"  {u['username']}: dipendente_id {old_id} -> {new_id}")
                changes += 1
    return changes


def clear_user(users, username):
    for u in users:
        if u["username"] == username:
            if "dipendente_id" in u:
                del u["dipendente_id"]
                return True
    return False


def main():
    p = argparse.ArgumentParser(description="Collega utenti a dipendenti in users.json")
    p.add_argument("--apply", action="store_true", help="Applica mapping di default")
    p.add_argument("--set", action="append", default=[], metavar="USER=ID",
                   help="Imposta mapping custom (ripetibile)")
    p.add_argument("--clear", action="append", default=[], metavar="USER",
                   help="Rimuove dipendente_id per un utente (ripetibile)")
    args = p.parse_args()

    users = load_users()

    # Nessuna azione: mostra stato corrente
    if not args.apply and not args.set and not args.clear:
        print(f"File: {USERS_FILE}\n")
        show(users)
        print("\nNessuna modifica. Usa --apply, --set USER=ID o --clear USER per modificare.")
        print(f"Mapping di default: {DEFAULT_MAPPING}")
        return

    # Costruisci mapping finale
    mapping = {}
    if args.apply:
        mapping.update(DEFAULT_MAPPING)
    for s in args.set:
        if "=" not in s:
            print(f"ERRORE: --set richiede USER=ID, ricevuto '{s}'", file=sys.stderr)
            sys.exit(2)
        user, val = s.split("=", 1)
        try:
            mapping[user.strip()] = int(val.strip())
        except ValueError:
            print(f"ERRORE: ID non valido in '{s}'", file=sys.stderr)
            sys.exit(2)

    changes = apply_mapping(users, mapping)
    for u in args.clear:
        if clear_user(users, u):
            print(f"  {u}: dipendente_id rimosso")
            changes += 1
        else:
            print(f"  {u}: non trovato o gia' senza dipendente_id")

    if changes == 0:
        print("Nessuna modifica necessaria.")
        return

    save_users(users)
    print(f"\nSalvate {changes} modifiche in {USERS_FILE}")
    print("Riavvia il backend:  sudo systemctl restart trgb-backend")


if __name__ == "__main__":
    main()
