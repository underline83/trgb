#!/usr/bin/env bash
# cleanup_drive.sh — pulizia Google Drive TRGB-Backup secondo report inventario_drive.md
# Eseguito di Marco dal Mac dopo setup rclone.
# Default: DRY-RUN (mostra cosa farebbe ma non tocca nulla).
# Per eseguire davvero:  EXECUTE=1 ./cleanup_drive.sh

set -e
set -o pipefail

REMOTE="${REMOTE:-gdrive}"           # nome del remote rclone (default: gdrive)
ROOT="${REMOTE}:TRGB-Backup"          # base del lavoro
LEGACY_ROOT="${REMOTE}:trgb-backups"  # cartella lowercase legacy in root
TMPDIR="${TMPDIR:-/tmp}/trgb-archive-$$"

# ---- safety toggle ----
if [[ "${EXECUTE:-0}" == "1" ]]; then
    DRY=""
    MODE_LABEL="EXECUTE (modifica reale)"
else
    DRY="--dry-run"
    MODE_LABEL="DRY-RUN (nessuna modifica)"
fi

echo "============================================="
echo " cleanup_drive.sh — modalita': $MODE_LABEL"
echo " remote: $REMOTE"
echo "============================================="
echo

# ---- pre-check connessione e remote ----
echo "[pre] verifica remote $REMOTE..."
rclone lsd "${REMOTE}:" >/dev/null 2>&1 || {
    echo "ERRORE: remote '$REMOTE' non configurato. Lancia: rclone config"
    exit 1
}
rclone lsd "$ROOT" >/dev/null 2>&1 || {
    echo "ERRORE: cartella TRGB-Backup non trovata sul remote $REMOTE."
    exit 1
}
echo "[pre] OK"
echo

# ============================================================================
# P1 — Cancellazione 3 backup duplicati di stasera 21:05/21:10/21:12
# ============================================================================
echo ">>> P1 — Cancellazione 3 backup duplicati (di stasera 21:05/21:10/21:12)..."
for dir in 20260504210534 20260504211019 20260504211244; do
    target="${ROOT}/db-daily/${dir}"
    echo "    purge $target"
    rclone purge $DRY "$target" -v 2>&1 | sed 's/^/      /'
done
echo

# ============================================================================
# P2 — Cancellazione detriti S60-INC1 (cartelle stub 4096 byte)
# ============================================================================
echo ">>> P2 — Cancellazione detriti S60-INC1..."
for dir in 20260504_033001 20260503_033001; do
    target="${ROOT}/db-daily/${dir}"
    echo "    purge $target"
    rclone purge $DRY "$target" -v 2>&1 | sed 's/^/      /'
done
echo

# ============================================================================
# P3 — Archivio codebase marzo + cancellazione cartelle/tar marzo
# ============================================================================
echo ">>> P3 — Archivio codebase marzo in tar.gz..."

if [[ "${EXECUTE:-0}" == "1" ]]; then
    mkdir -p "$TMPDIR"
    echo "    [P3.1] download app-code/ in $TMPDIR..."
    rclone copy "${ROOT}/app-code" "${TMPDIR}/app-code" -v --stats 5s 2>&1 | sed 's/^/      /'
    echo "    [P3.2] download scripts/ in $TMPDIR..."
    rclone copy "${ROOT}/scripts" "${TMPDIR}/scripts" -v --stats 5s 2>&1 | sed 's/^/      /'
    echo "    [P3.3] crea tar.gz..."
    cd "$TMPDIR"
    tar -czf snapshot-codebase-20260320.tar.gz app-code/ scripts/
    SIZE=$(ls -lh snapshot-codebase-20260320.tar.gz | awk '{print $5}')
    echo "    [P3.3] tar creato: $SIZE"
    echo "    [P3.4] upload tar.gz in snapshots-server/..."
    rclone copy snapshot-codebase-20260320.tar.gz "${ROOT}/snapshots-server/" -v 2>&1 | sed 's/^/      /'
    echo "    [P3.5] verifica upload..."
    rclone ls "${ROOT}/snapshots-server/snapshot-codebase-20260320.tar.gz" | sed 's/^/      /'
    cd - >/dev/null
    rm -rf "$TMPDIR"
    echo "    [P3.6] cleanup tmp $TMPDIR"
else
    echo "    [DRY-RUN] download app-code/ + scripts/ in tmpdir, tar -czf snapshot-codebase-20260320.tar.gz, upload in snapshots-server/"
fi

echo "    [P3.7] cancella cartelle e tar marzo originali..."
rclone purge $DRY "${ROOT}/app-code" -v 2>&1 | sed 's/^/      /'
rclone purge $DRY "${ROOT}/scripts" -v 2>&1 | sed 's/^/      /'
rclone deletefile $DRY "${ROOT}/2026-03-20_1337.tar.gz" -v 2>&1 | sed 's/^/      /'
echo

# ============================================================================
# P4 — Chiusura consolidamento root (tar pre-upgrade-noble e cartella vuota)
# ============================================================================
echo ">>> P4 — Chiusura consolidamento root..."

# Verifica che la copia in snapshots-server/ esista (l'ho fatta io via Drive MCP)
if rclone ls "${ROOT}/snapshots-server/pre-upgrade-noble-20260427-2350.tar.gz" 2>/dev/null | grep -q "604837364"; then
    echo "    [P4.0] copia in snapshots-server/ verificata (604 MB) — procedo con cancellazione originale"
    rclone deletefile $DRY "${LEGACY_ROOT}/pre-upgrade-noble-20260427-2350.tar.gz" -v 2>&1 | sed 's/^/      /'
    echo "    [P4.1] rimuovi cartella vuota trgb-backups/..."
    rclone rmdir $DRY "$LEGACY_ROOT" -v 2>&1 | sed 's/^/      /'
else
    echo "    ATTENZIONE: copia in snapshots-server/ non trovata o dimensione errata."
    echo "                Salto P4 per sicurezza. Verifica manualmente."
fi
echo

# ============================================================================
# Verifica finale
# ============================================================================
echo ">>> Verifica struttura finale TRGB-Backup/"
rclone lsd "$ROOT" 2>&1 | sed 's/^/    /'
echo
echo ">>> Verifica root del Drive (deve NON contenere piu' trgb-backups)"
rclone lsd "${REMOTE}:" 2>&1 | grep -i "trgb\|tregobbi" | sed 's/^/    /'
echo

# ============================================================================
# Riepilogo
# ============================================================================
echo "============================================="
echo " Modalita': $MODE_LABEL"
if [[ "${EXECUTE:-0}" != "1" ]]; then
    echo
    echo " Per eseguire davvero, lancia:"
    echo "   EXECUTE=1 $0"
fi
echo "============================================="
