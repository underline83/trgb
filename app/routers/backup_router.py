"""
TRGB — Backup Router
Endpoint per creare e scaricare backup completi di tutti i database.
Solo admin.
"""

import subprocess
import tarfile
import io
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.services.auth_service import get_current_user

router = APIRouter(prefix="/backup", tags=["backup"])

# ── Percorsi ──
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
BACKUP_BASE = Path("/home/marco/trgb/backups")

# ── Database da includere ──
DATABASES = [
    "admin_finance.sqlite3",
    "vini.sqlite3",
    "vini_settings.sqlite3",
    "vini_magazzino.sqlite3",
    "ingredients.sqlite3",
    "vini.db",
    "foodcost.db",
]


def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo admin")


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
        for db_name in DATABASES:
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
    """Restituisce la lista dei backup .tar.gz creati dal cron notturno."""
    _require_admin(current_user)

    if not BACKUP_BASE.exists():
        return {"backups": []}

    backups = []
    for f in sorted(BACKUP_BASE.glob("*.tar.gz"), reverse=True):
        size_mb = round(f.stat().st_size / (1024 * 1024), 2)
        backups.append({
            "filename": f.name,
            "size_mb": size_mb,
            "date": f.stem,  # es. 2026-03-20_0300
        })

    return {"backups": backups}


@router.get("/download/{filename}", summary="Scarica un backup giornaliero specifico")
def backup_download_daily(filename: str, current_user: dict = Depends(get_current_user)):
    """Scarica un backup .tar.gz specifico dal server."""
    _require_admin(current_user)

    # Sanity check: evita path traversal
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nome file non valido")

    filepath = BACKUP_BASE / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup non trovato")

    def iterfile():
        with open(filepath, "rb") as f:
            while chunk := f.read(8192):
                yield chunk

    return StreamingResponse(
        iterfile(),
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/info", summary="Info sullo stato dei database")
def backup_info(current_user: dict = Depends(get_current_user)):
    """Restituisce info sui database presenti e l'ultimo backup."""
    _require_admin(current_user)

    databases = []
    for db_name in DATABASES:
        src = DATA_DIR / db_name
        if src.exists():
            size_mb = round(src.stat().st_size / (1024 * 1024), 2)
            databases.append({"name": db_name, "size_mb": size_mb, "exists": True})
        else:
            databases.append({"name": db_name, "size_mb": 0, "exists": False})

    # Ultimo backup giornaliero
    last_backup = None
    if BACKUP_BASE.exists():
        tars = sorted(BACKUP_BASE.glob("*.tar.gz"), reverse=True)
        if tars:
            f = tars[0]
            last_backup = {
                "filename": f.name,
                "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                "date": f.stem,
            }

    return {
        "databases": databases,
        "last_backup": last_backup,
        "backup_dir": str(BACKUP_BASE),
    }
