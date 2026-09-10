# Modulo: home (azioni rapide) — [core]
"""
Migration 175 — Azione rapida «Cantina mobile» in Home.

Marco (2026-09-10): «nella home aggiungi il tasto cantina mobile».

Aggiunge il tasto 📱 Cantina mobile (/vini/cantina-mobile) alle azioni rapide
dei ruoli che la pagina la possono aprire davvero: la route è protetta da
vini/magazzino, che in modules.json vale per superadmin, admin, sommelier e
sala. Agli altri ruoli (chef, contabile, …) non viene dato: sarebbe un tasto
che porta a un «accesso negato».

Posizione: subito dopo «Cantina Vini» se il ruolo ce l'ha (le azioni che
seguono scalano di uno), altrimenti in coda. Rispetta le personalizzazioni
fatte da Impostazioni → Home per ruolo: se il tasto c'è già (anche
disattivato) non si tocca niente.

Idempotente.
"""

import sqlite3

RUOLI = ("superadmin", "admin", "sommelier", "sala")

AZIONE = {
    "key": "cantina-mobile",
    "label": "Cantina mobile",
    "sub": "Trova e muovi bottiglie",
    "emoji": "📱",
    "route": "/vini/cantina-mobile",
    "color": "bg-amber-50 border-amber-200 text-amber-900",
}


def upgrade(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    if not cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='home_actions'"
    ).fetchone():
        print("  = home_actions assente, niente da fare")
        return

    for ruolo in RUOLI:
        if cur.execute(
            "SELECT 1 FROM home_actions WHERE ruolo = ? AND key = ?",
            (ruolo, AZIONE["key"]),
        ).fetchone():
            print(f"  = {ruolo}: tasto già presente")
            continue

        ref = cur.execute(
            "SELECT ordine FROM home_actions WHERE ruolo = ? AND key = 'cantina-vini'",
            (ruolo,),
        ).fetchone()
        if ref:
            ordine = ref[0] + 1
            cur.execute(
                "UPDATE home_actions SET ordine = ordine + 1, updated_at = datetime('now') "
                "WHERE ruolo = ? AND ordine >= ?",
                (ruolo, ordine),
            )
        else:
            mx = cur.execute(
                "SELECT COALESCE(MAX(ordine), -1) FROM home_actions WHERE ruolo = ?",
                (ruolo,),
            ).fetchone()[0]
            ordine = mx + 1

        cur.execute(
            "INSERT INTO home_actions (ruolo, ordine, key, label, sub, emoji, route, color, attivo, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))",
            (ruolo, ordine, AZIONE["key"], AZIONE["label"], AZIONE["sub"],
             AZIONE["emoji"], AZIONE["route"], AZIONE["color"]),
        )
        print(f"  + {ruolo}: Cantina mobile in posizione {ordine}")
