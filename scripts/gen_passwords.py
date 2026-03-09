#!/usr/bin/env python3
"""
TRGB — Generatore hash password

Uso:
    python scripts/gen_passwords.py

Genera hash sha256_crypt compatibili con passlib.
Aggiorna i valori in app/services/auth_service.py → USERS[...]["password_hash"]
"""

import crypt
import getpass
import sys


def hash_password(password: str) -> str:
    salt = crypt.mksalt(crypt.METHOD_SHA256)
    return crypt.crypt(password, salt)


def main():
    print("=" * 50)
    print("  TRGB — Generatore hash password (sha256_crypt)")
    print("=" * 50)
    print()

    users = ["admin", "chef", "sommelier", "viewer"]

    if len(sys.argv) > 1:
        # Modalità singola: python gen_passwords.py <username>
        username = sys.argv[1]
        if username not in users:
            print(f"Utente '{username}' non riconosciuto. Utenti validi: {users}")
            sys.exit(1)
        password = getpass.getpass(f"Nuova password per '{username}': ")
        h = hash_password(password)
        print(f"\nHash per '{username}':")
        print(f'    "password_hash": "{h}",')
    else:
        # Modalità completa: genera hash per tutti gli utenti
        print("Inserisci le nuove password (lascia vuoto per saltare):")
        print()
        for username in users:
            password = getpass.getpass(f"  {username}: ")
            if password:
                h = hash_password(password)
                print(f'    "{username}": {{ "password_hash": "{h}", ... }}')
            else:
                print(f"  → {username}: saltato")
        print()
        print("Copia le righe sopra in app/services/auth_service.py → USERS")

    print()
    print("Fatto.")


if __name__ == "__main__":
    main()
