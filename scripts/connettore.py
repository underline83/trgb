#!/usr/bin/env python3
# Modulo: platform (M.K) — connettore MCP. Doc: docs/connettore_mcp.md
"""
TRGB — le autorizzazioni del connettore MCP di claude.ai.

Ogni autorizzazione («famiglia») nasce con utente e PIN dalla pagina /oauth/pin e passa
di rinnovo in rinnovo. Revocarla chiude accesso e rinnovo: Claude dovrà autorizzare di nuovo.

Uso (sul VPS, dalla cartella del backend, con la venv):

    python3 scripts/connettore.py                 # elenca le autorizzazioni aperte
    python3 scripts/connettore.py --tutte         # anche quelle chiuse
    python3 scripts/connettore.py --revoca <famiglia>
    python3 scripts/connettore.py --revoca-utente <username>

Il locale è TRGB_LOCALE (default tregobbi).
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.connettore_db import get_connettore_conn, init_connettore_db  # noqa: E402


def adesso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def elenca(tutte: bool) -> None:
    c = get_connettore_conn()
    righe = c.execute("""
        SELECT t.famiglia, t.username, COALESCE(k.nome, t.client_id) AS client,
               MIN(t.creato_il) AS dal, MAX(t.usato_il) AS ultimo_uso,
               SUM(t.revocato_il IS NULL AND t.tipo = 'rinnovo') AS aperta
        FROM connettore_oauth_token t
        LEFT JOIN connettore_oauth_clienti k ON k.client_id = t.client_id
        GROUP BY t.famiglia ORDER BY dal DESC
    """).fetchall()
    c.close()
    righe = [r for r in righe if tutte or r["aperta"]]
    if not righe:
        print("Nessuna autorizzazione" + ("" if tutte else " aperta") + ".")
        return
    for r in righe:
        stato = "aperta" if r["aperta"] else "chiusa"
        print(f"{r['famiglia']}  {r['username']:<12} {stato:<7} dal {r['dal']}  "
              f"ultimo uso {r['ultimo_uso'] or '—'}  [{r['client']}]")


def revoca(where: str, valore: str) -> None:
    c = get_connettore_conn()
    n = c.execute(f"""UPDATE connettore_oauth_token SET revocato_il = ?, motivo = 'revocato da script'
                      WHERE {where} = ? AND revocato_il IS NULL""", (adesso(), valore)).rowcount
    c.commit()
    c.close()
    print(f"Revocati {n} token.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--tutte", action="store_true")
    p.add_argument("--revoca", metavar="FAMIGLIA")
    p.add_argument("--revoca-utente", metavar="USERNAME")
    a = p.parse_args()
    init_connettore_db()
    if a.revoca:
        revoca("famiglia", a.revoca)
    elif a.revoca_utente:
        revoca("username", a.revoca_utente)
    else:
        elenca(a.tutte)
