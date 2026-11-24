#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# @version: v1.0 (2026-11-24) — restore di prova settimanale (roadmap T.7)
# Modulo: platform (sicurezza/backup) — [mixed]: logica generica, path del locale
"""
restore_test.py — prova che i backup si possano davvero ripristinare.

Un backup mai ripristinato è una promessa. Questo script prende l'ULTIMO backup
giornaliero, lo riscarica da Google Drive (la copia fuori sede: è quella che
serve se il VPS sparisce) in una cartella temporanea e controlla che:

  1. su Drive ci siano gli stessi file del giornaliero locale, stessa dimensione;
  2. ogni DB si apra, abbia l'header SQLite, passi PRAGMA integrity_check;
  3. ogni DB abbia un numero di righe vicino a quello del DB vivo
     (un backup integro ma mezzo vuoto è un backup rotto);
  4. ogni JSON di configurazione sia un JSON valido.

NON tocca mai i dati veri: legge il DB vivo in sola lettura, scrive solo nella
cartella temporanea (cancellata alla fine) e nel file di stato.

Esito in app/data/backups/.last_restore_test.json, letto da
check_backup_health.sh (check 7) e da /system/backup-health (card Backup).
Se fallisce: notifica M.A ai superadmin.

Chi lo lancia: backup_db.sh --daily, al giro delle 03:00, se l'ultima prova ha
più di 6 giorni e mezzo. Nessuna riga di crontab in più.

A mano:
  python3 scripts/restore_test.py            # da Drive (default)
  python3 scripts/restore_test.py --locale   # dal giornaliero locale, senza Drive
  python3 scripts/restore_test.py --tieni    # non cancella la cartella temporanea

Doc: docs/sicurezza_backup.md §2.6, docs/ripristino_backup.md.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT_DIR = Path(os.environ.get("TRGB_PROJECT_DIR", "/home/marco/trgb/trgb"))
LOCALE = os.environ.get("TRGB_LOCALE", "tregobbi")
DATA_DIR = PROJECT_DIR / "app" / "data"
LOCALE_DATA_DIR = PROJECT_DIR / "locali" / LOCALE / "data"
BACKUP_DIR = DATA_DIR / "backups"
DAILY_DIR = BACKUP_DIR / "daily"
STATUS_FILE = BACKUP_DIR / ".last_restore_test.json"
RCLONE_CONF = Path(os.environ.get("TRGB_RCLONE_CONF", "/home/marco/.config/rclone/rclone.conf"))
DRIVE_DAILY = "gdrive:TRGB-Backup/db-daily"
RCLONE_TIMEOUT_S = 900

MIN_SIZE_BYTES = 8192      # come backup_db.sh: sotto = stub
# Un DB ripristinato è «mezzo vuoto» se ha meno del 90% delle righe del vivo
# E gliene mancano più di 500. Servono tutte e due: un DB piccolo che cresce in
# fretta (lanciando la prova a mano di giorno) non deve dare un falso allarme.
MIN_ROWS_PCT = 90
MIN_ROWS_GAP = 500


def _ultimo_giornaliero() -> Path | None:
    if not DAILY_DIR.is_dir():
        return None
    cartelle = [d for d in DAILY_DIR.iterdir()
                if d.is_dir() and d.name.replace("_", "").isdigit() and len(d.name) in (14, 15)]
    return max(cartelle, key=lambda d: d.name.replace("_", "")) if cartelle else None


def _scarica_da_drive(nome: str, dest: Path) -> str | None:
    """Scarica db-daily/<nome> in dest. Ritorna None se ok, altrimenti l'errore."""
    try:
        r = subprocess.run(
            ["rclone", "copy", f"{DRIVE_DAILY}/{nome}", str(dest), "--config", str(RCLONE_CONF)],
            capture_output=True, text=True, timeout=RCLONE_TIMEOUT_S,
        )
    except FileNotFoundError:
        return "rclone non installato"
    except subprocess.TimeoutExpired:
        return f"rclone oltre {RCLONE_TIMEOUT_S}s"
    if r.returncode != 0:
        return (r.stderr or r.stdout or f"rc={r.returncode}").strip().splitlines()[-1][:200]
    if not any(dest.iterdir()):
        return "cartella vuota su Drive"
    return None


def _apri_ro(path: Path, immutable: bool) -> sqlite3.Connection:
    uri = f"file:{path}?mode=ro" + ("&immutable=1" if immutable else "")
    return sqlite3.connect(uri, uri=True, timeout=15)


def _conta_righe(conn: sqlite3.Connection) -> tuple[int, int]:
    """(righe totali, tabelle contate) sulle tabelle normali."""
    tabelle = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    tot = 0
    contate = 0
    for t in tabelle:
        try:
            tot += conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            contate += 1
        except sqlite3.Error:
            pass  # tabella virtuale o illeggibile: non conta, l'integrity_check ha già detto la sua
    return tot, contate


def _verifica_db(path: Path, issues: list[str]) -> dict:
    nome = path.name
    info = {"name": nome, "ok": False, "size_mb": round(path.stat().st_size / 1048576, 2),
            "rows": None, "rows_live": None}
    if path.stat().st_size < MIN_SIZE_BYTES:
        issues.append(f"stub:{nome}")
        return info
    with open(path, "rb") as fh:
        if fh.read(15) != b"SQLite format 3":
            issues.append(f"non_sqlite:{nome}")
            return info
    try:
        conn = _apri_ro(path, immutable=True)
        esito = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if esito != "ok":
            issues.append(f"integrity:{nome}:{str(esito)[:60]}")
            conn.close()
            return info
        info["rows"], _ = _conta_righe(conn)
        conn.close()
    except sqlite3.Error as e:
        issues.append(f"non_si_apre:{nome}:{str(e)[:60]}")
        return info

    vivo = LOCALE_DATA_DIR / nome
    if vivo.is_file() and vivo.stat().st_size >= MIN_SIZE_BYTES:
        try:
            c2 = _apri_ro(vivo, immutable=False)
            info["rows_live"], _ = _conta_righe(c2)
            c2.close()
        except sqlite3.Error:
            info["rows_live"] = None  # DB vivo occupato: il confronto salta, non è colpa del backup
    live = info["rows_live"]
    if live is not None and live > 0:
        if info["rows"] * 100 < live * MIN_ROWS_PCT and (live - info["rows"]) > MIN_ROWS_GAP:
            issues.append(f"mezzo_vuoto:{nome}:{info['rows']}_su_{live}")
            return info
    info["ok"] = True
    return info


def _notifica(issues: list[str], snapshot: str) -> None:
    try:
        sys.path.insert(0, str(PROJECT_DIR))
        from app.services.notifiche_service import crea_notifica
        crea_notifica(
            tipo="backup",
            titolo=f"🧪 Restore di prova FALLITO ({len(issues)} problemi)",
            messaggio=f"Backup {snapshot}: " + ", ".join(issues[:8])
                      + ". Vedi docs/ripristino_backup.md e backup.log.",
            urgenza="alta", modulo="platform", dest_ruolo="superadmin", icona="🧪",
        )
        print("  ✉️  Notifica M.A inviata")
    except Exception as e:  # noqa: BLE001 — la notifica non deve far fallire la prova
        print(f"  ⚠️  Notifica non inviata: {e}")


def main(argv: list[str]) -> int:
    solo_locale = "--locale" in argv
    tieni = "--tieni" in argv
    t0 = time.time()
    issues: list[str] = []
    note: list[str] = []
    dbs: list[dict] = []
    json_ok = 0
    sorgente = "drive"

    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] 🧪 Restore di prova")
    snap = _ultimo_giornaliero()
    if snap is None:
        issues.append("nessun_giornaliero")
        nome = ""
    else:
        nome = snap.name
        print(f"  Backup in prova: {nome}")

    tmp = Path(tempfile.mkdtemp(prefix="trgb_restore_test_"))
    try:
        if snap is not None:
            if solo_locale or not RCLONE_CONF.is_file():
                sorgente = "locale"
                if not solo_locale:
                    note.append("rclone_non_configurato")
            else:
                err = _scarica_da_drive(nome, tmp)
                if err:
                    issues.append(f"drive_download:{err}")
                    sorgente = "locale"
                    shutil.rmtree(tmp, ignore_errors=True)
                    tmp.mkdir(parents=True, exist_ok=True)
            if sorgente == "locale":
                for f in snap.iterdir():
                    if f.is_file():
                        shutil.copy2(f, tmp / f.name)
            else:
                # Drive deve avere gli stessi file del giornaliero locale
                for f in snap.iterdir():
                    if not f.is_file():
                        continue
                    g = tmp / f.name
                    if not g.is_file():
                        issues.append(f"manca_su_drive:{f.name}")
                    elif g.stat().st_size != f.stat().st_size:
                        issues.append(f"drive_diverso:{f.name}")
            print(f"  Sorgente: {sorgente} · {sum(1 for _ in tmp.iterdir())} file ripristinati in {tmp}")

            for f in sorted(tmp.iterdir()):
                if f.suffix in (".sqlite3", ".db"):
                    info = _verifica_db(f, issues)
                    dbs.append(info)
                    segno = "✅" if info["ok"] else "❌"
                    print(f"  {segno} {f.name}: {info['size_mb']} MB, righe {info['rows']} (vivo: {info['rows_live']})")
                elif f.suffix == ".json":
                    try:
                        json.loads(f.read_text(encoding="utf-8"))
                        json_ok += 1
                    except Exception:  # noqa: BLE001
                        issues.append(f"json_non_valido:{f.name}")
                        print(f"  ❌ {f.name}: JSON non valido")
            if not dbs:
                issues.append("nessun_db_nel_backup")

            # DB vivi che nel backup non ci sono: solo una nota (può essere nato dopo)
            if LOCALE_DATA_DIR.is_dir():
                nel_backup = {d["name"] for d in dbs}
                for v in sorted(LOCALE_DATA_DIR.iterdir()):
                    if (v.is_file() and v.suffix in (".sqlite3", ".db")
                            and v.stat().st_size >= MIN_SIZE_BYTES and v.name not in nel_backup):
                        note.append(f"non_nel_backup:{v.name}")
    finally:
        if tieni:
            print(f"  Cartella temporanea tenuta: {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)

    stato = "ok" if not issues else "failed"
    esito = {
        "status": stato,
        "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
        "epoch": int(time.time()),
        "source": sorgente,
        "snapshot": nome,
        "db_ok": sum(1 for d in dbs if d["ok"]),
        "db_total": len(dbs),
        "json_ok": json_ok,
        "issues": issues,
        "notes": note,
        "duration_s": round(time.time() - t0, 1),
        "dbs": dbs,
    }
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        STATUS_FILE.write_text(json.dumps(esito, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as e:
        print(f"  ⚠️  Stato non scritto: {e}")

    if issues:
        print(f"  ❌ RESTORE DI PROVA FALLITO: {', '.join(issues)}")
        if "--no-notifica" not in argv:
            _notifica(issues, nome)
    else:
        print(f"  ✅ Restore di prova riuscito: {esito['db_ok']}/{esito['db_total']} DB, "
              f"{json_ok} JSON, da {sorgente}, {esito['duration_s']}s")
    for n in note:
        print(f"  ℹ️  {n}")
    return 0 if not issues else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
