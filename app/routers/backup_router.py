"""
TRGB — Backup Router
Endpoint per creare e scaricare backup completi di tutti i database.
Solo admin.

v2: legge dai backup creati dal cron reale (scripts/backup_db.sh) che
salva in app/data/backups/daily/<YYYYMMDD_HHMMSS>/ — niente più path
orfano /home/marco/trgb/backups/.

v2.1 (post-incidente 4 mag 2026): backup_db.sh v2 ha cambiato il formato
del timestamp da `YYYYMMDD_HHMMSS` (15 char con underscore) a
`YYYYMMDDHHMMSS` (14 cifre senza separatori, da `date +%Y%m%d%H%M%S`).
Il parser ora accetta ENTRAMBI per retrocompatibilità con le cartelle
vecchie ancora presenti (2-3-4 mag 2026) e visibilità di quelle nuove.
"""

import subprocess
import tarfile
import io
from pathlib import Path
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.services.auth_service import get_current_user, is_admin
from app.utils.locale_data import locale_data_dir

router = APIRouter(prefix="/backup", tags=["backup"])

# ── Percorsi (locale-aware, post R6.5 push 3) ──
# Path canonico dei dati = locali/<locale>/data/. La cartella backups/ vive
# dentro lo stesso path. Niente più fallback ad app/data/.
DATA_DIR = locale_data_dir()
DAILY_DIR = DATA_DIR / "backups" / "daily"     # cartelle create da backup_db.sh --daily
HOURLY_DIR = DATA_DIR / "backups" / "hourly"


def _discover_databases() -> List[str]:
    """
    Scopre dinamicamente tutti i file DB SQLite nella cartella data/ del locale
    corrente. Riconosce sia `*.sqlite3` (estensione canonica) sia `*.db` (legacy,
    es. `foodcost.db`).

    Esclude:
      - file `*.wal`/`*.shm` (file di journal SQLite)
      - file `*.prev`/`*.bak`/`*.pre-*` (backup espliciti)
      - sottocartelle (backups/, ecc.)

    Razionale (2026-05-15): la lista hardcoded `DATABASES` rendeva invisibili
    i DB nuovi (es. `vini_magazzino.sqlite3` post-refactor V.6+V.7+V.8 con
    le tabelle `_v2`) finché qualcuno non si ricordava di aggiungerli a mano.
    Discovery dinamica → ogni DB nella cartella è automaticamente backuppato
    e visibile nella UI.
    """
    if not DATA_DIR.exists():
        return []
    found: List[str] = []
    for p in sorted(DATA_DIR.iterdir()):
        if not p.is_file():
            continue
        name = p.name
        # Skip file di journal/backup
        if name.endswith((".wal", ".shm", ".prev", ".bak")) or ".pre-" in name:
            continue
        if name.startswith("."):
            continue
        if name.endswith(".sqlite3") or name.endswith(".db"):
            found.append(name)
    return found


def _require_admin(user: dict):
    if not is_admin(user.get("role", "")):
        raise HTTPException(status_code=403, detail="Solo admin")


def _parse_folder_timestamp(name: str):
    """
    Converte il nome cartella in datetime. None se invalido.

    Supporta due formati:
      - 'YYYYMMDD_HHMMSS' (15 char) — formato pre-4 mag 2026, ancora presente
        nelle cartelle 20260502_033001 / 20260503_033001 / 20260504_033001.
      - 'YYYYMMDDHHMMSS'  (14 cifre) — formato di backup_db.sh v2 post-incidente
        4 mag 2026, generato da `date +%Y%m%d%H%M%S`.

    Senza il fallback al nuovo formato, il router ignorava completamente
    le cartelle dal 5 mag in avanti, mostrando l'allarme rosso "ultimo
    backup XX ore fa" anche se i backup giornalieri erano regolarissimi.
    """
    # Nuovo formato (più probabile dal 5 mag in poi): prova per primo
    # così il caso comune non paga il costo della prima eccezione.
    if len(name) == 14 and name.isdigit():
        try:
            return datetime.strptime(name, "%Y%m%d%H%M%S")
        except ValueError:
            return None
    # Vecchio formato (cartelle storiche 2-3-4 mag 2026)
    if len(name) == 15 and name[8] == "_":
        try:
            return datetime.strptime(name, "%Y%m%d_%H%M%S")
        except ValueError:
            return None
    return None


def _folder_size_bytes(folder: Path) -> int:
    return sum(f.stat().st_size for f in folder.iterdir() if f.is_file())


def _list_daily_snapshots():
    """
    Restituisce lista ordinata (più recente prima) di tuple
    (path_cartella, datetime, size_bytes) dei backup giornalieri validi.
    """
    if not DAILY_DIR.exists():
        return []
    out = []
    for d in DAILY_DIR.iterdir():
        if not d.is_dir():
            continue
        ts = _parse_folder_timestamp(d.name)
        if not ts:
            continue
        try:
            size = _folder_size_bytes(d)
        except OSError:
            size = 0
        out.append((d, ts, size))
    out.sort(key=lambda x: x[1], reverse=True)
    return out


@router.get("/download", summary="Scarica backup completo di tutti i database")
def backup_download(current_user: dict = Depends(get_current_user)):
    """
    Crea al volo un backup consistente di tutti i database SQLite
    usando sqlite3 .backup, li comprime in un tar.gz e lo restituisce
    come download.
    """
    _require_admin(current_user)

    ts = datetime.now().strftime("%Y-%m-%d_%H%M")
    filename = f"trgb-backup-{ts}.tar.gz"

    # Crea il tar.gz in memoria
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for db_name in _discover_databases():
            src = DATA_DIR / db_name
            if not src.exists():
                continue

            # Backup consistente via sqlite3 .backup in un file temporaneo
            tmp_path = Path(f"/tmp/backup_{db_name}")
            try:
                result = subprocess.run(
                    ["sqlite3", str(src), f".backup '{tmp_path}'"],
                    capture_output=True, text=True, timeout=30
                )
                if result.returncode != 0 or not tmp_path.exists():
                    # Fallback: copia diretta
                    tmp_path.write_bytes(src.read_bytes())
            except Exception:
                # Fallback: copia diretta
                tmp_path.write_bytes(src.read_bytes())

            # Aggiungi al tar con il nome originale
            tar.add(str(tmp_path), arcname=db_name)
            tmp_path.unlink(missing_ok=True)

    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/list", summary="Lista backup giornalieri disponibili sul server")
def backup_list_daily(current_user: dict = Depends(get_current_user)):
    """
    Restituisce la lista dei backup giornalieri creati dal cron notturno
    (scripts/backup_db.sh --daily). Ogni entry è una cartella con i 6 DB
    all'interno; il download la impacchetta al volo in tar.gz.
    """
    _require_admin(current_user)

    snapshots = _list_daily_snapshots()
    backups = []
    for folder, ts, size in snapshots:
        backups.append({
            "filename": folder.name,                     # es. "20260507180001" (v2) o "20260504_033001" (v1)
            "size_mb": round(size / (1024 * 1024), 2),
            "date": ts.strftime("%Y-%m-%d %H:%M"),       # formato leggibile per UI
        })
    return {"backups": backups}


@router.get("/download/{filename}", summary="Scarica un backup giornaliero specifico")
def backup_download_daily(filename: str, current_user: dict = Depends(get_current_user)):
    """
    Impacchetta al volo in tar.gz la cartella di backup giornaliero
    identificata da <filename> (= nome cartella 'YYYYMMDDHHMMSS' v2
    o 'YYYYMMDD_HHMMSS' v1, vedi _parse_folder_timestamp).
    """
    _require_admin(current_user)

    # Sanity check: evita path traversal
    if "/" in filename or ".." in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nome file non valido")
    if _parse_folder_timestamp(filename) is None:
        raise HTTPException(status_code=400, detail="Formato nome non valido")

    folder = DAILY_DIR / filename
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=404, detail="Backup non trovato")

    # Crea il tar.gz in memoria dal contenuto della cartella
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for f in sorted(folder.iterdir()):
            if f.is_file():
                tar.add(str(f), arcname=f.name)
    buf.seek(0)

    out_name = f"trgb-backup-{filename}.tar.gz"
    return StreamingResponse(
        buf,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
    )


@router.get("/info", summary="Info sullo stato dei database e ultimo backup")
def backup_info(current_user: dict = Depends(get_current_user)):
    """
    Restituisce info sui database presenti e l'ultimo backup giornaliero,
    inclusa l'età in ore (last_backup_age_hours) per warning in UI.
    """
    _require_admin(current_user)

    databases = []
    for db_name in _discover_databases():
        src = DATA_DIR / db_name
        if src.exists():
            size_mb = round(src.stat().st_size / (1024 * 1024), 2)
            databases.append({"name": db_name, "size_mb": size_mb, "exists": True})
        else:
            # Non dovrebbe mai capitare con discovery dinamica, ma safety net
            databases.append({"name": db_name, "size_mb": 0, "exists": False})

    # Ultimo backup giornaliero = cartella più recente in daily/
    last_backup = None
    last_backup_age_hours = None
    snapshots = _list_daily_snapshots()
    if snapshots:
        folder, ts, size = snapshots[0]
        last_backup = {
            "filename": folder.name,
            "size_mb": round(size / (1024 * 1024), 2),
            "date": ts.strftime("%Y-%m-%d %H:%M"),
        }
        age = datetime.now() - ts
        last_backup_age_hours = round(age.total_seconds() / 3600, 1)

    return {
        "databases": databases,
        "last_backup": last_backup,
        "last_backup_age_hours": last_backup_age_hours,
        "backup_dir": str(DAILY_DIR),
    }
