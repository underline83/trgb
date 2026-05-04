#!/bin/bash
# backup_db.sh — Backup atomico di tutti i database TRGB con verifiche di integrità
#
# Versione 2.0 — Post-incidente 4 maggio 2026
# Cambia rispetto v1:
#  - PRAGMA integrity_check obbligatorio su ogni backup creato
#  - Dimensione minima per file (rifiuta backup < MIN_SIZE_BYTES)
#  - Cartella last_known_good/ separata: contiene SEMPRE 1 backup integro per file,
#    NON viene MAI sovrascritta se l'ultimo backup fallisce le verifiche
#  - Stato ultima esecuzione in $STATUS_FILE per monitor esterni
#  - Notifica via M.A (notifiche_service) se uno o più backup falliscono
#  - Lista DB completa: aggiunti tasks/notifiche/bevande che mancavano
#  - NON ruota backup vecchi se il backup nuovo NON passa l'integrity check
#
# Uso:
#   ./backup_db.sh              → backup orario (rotazione 48h)
#   ./backup_db.sh --daily      → backup giornaliero + sync Drive (rotazione 7gg)
#   ./backup_db.sh --status     → stampa stato ultima esecuzione (per monitor)
#
# Cron suggerito:
#   0 * * * *   /home/marco/trgb/trgb/scripts/backup_db.sh >> /home/marco/trgb/backup.log 2>&1
#   30 3 * * *  /home/marco/trgb/trgb/scripts/backup_db.sh --daily >> /home/marco/trgb/backup.log 2>&1

set -uo pipefail
# NB: niente -e, ci pensa il codice di gestione errori a decidere quando uscire

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT_DIR="/home/marco/trgb/trgb"
DATA_DIR="$PROJECT_DIR/app/data"
LOCALE_DATA_DIR="$PROJECT_DIR/locali/tregobbi/data"
BACKUP_HOURLY="$DATA_DIR/backups/hourly"
BACKUP_DAILY="$DATA_DIR/backups/daily"
BACKUP_LKG="$DATA_DIR/backups/last_known_good"   # NON viene mai rotato se fallisce
RCLONE_CONF="/home/marco/.config/rclone/rclone.conf"
DRIVE_PATH="gdrive:TRGB-Backup/db-daily"
STATUS_FILE="$DATA_DIR/backups/.last_backup_status.json"
VENV_PYTHON="/home/marco/trgb/venv-trgb/bin/python"

# Retention: ultimi N backup PER DB.
# - HOURLY: 10 backup per DB (10 ore se cron orario). RETAIN_COUNT_HOURLY.
# - DAILY: 14 cartelle (= 1 settimana se 2 sync/giorno alle 03:00 e 18:00).
#   Aumentato dal default 10 quando Marco ha richiesto 2 sync/giorno il 4 mag,
#   per mantenere comunque ≥7 giorni di copertura.
RETAIN_COUNT_HOURLY=10
RETAIN_COUNT_DAILY=14
# Alias backward-compat per i punti che usano ancora RETAIN_COUNT (da deprecare):
RETAIN_COUNT=$RETAIN_COUNT_HOURLY

# Soglia minima byte per considerare valido un file SQLite
# Un DB SQLite "vuoto" (solo header) è ~4096 byte. Tutti i nostri DB sono ben
# sopra questa soglia. Se un backup esce sotto i 8KB siamo probabilmente di
# fronte a un file svuotato o stub: NON va accettato come buono.
MIN_SIZE_BYTES=8192

# Database SQLite da backuppare (10 DB attivi). Ogni DB ha 2 path possibili:
# legacy (app/data/) e locale-aware (locali/tregobbi/data/) introdotto con R6.5.
# Lo script trova automaticamente quale dei due esiste. Se trova entrambi
# (durante migrazione) usa quello con dimensione maggiore.
DBS=(
    "foodcost.db"
    "admin_finance.sqlite3"
    "vini.sqlite3"
    "vini_magazzino.sqlite3"
    "vini_settings.sqlite3"
    "dipendenti.sqlite3"
    "clienti.sqlite3"
    "notifiche.sqlite3"
    "tasks.sqlite3"
    "bevande.sqlite3"
)

# File JSON di configurazione (NON SQLite ma altrettanto critici, da backuppare
# con copia semplice + verifica dimensione minima e validità JSON).
# Se persi: utenti vanno persi, configurazioni moduli vanno perse, branding via.
JSON_FILES=(
    "users.json"
    "modules.json"
    "modules.runtime.json"
    "modules.runtime.meta.json"
    "closures_config.json"
)
JSON_MIN_SIZE_BYTES=20  # JSON valido minimo "{}" + un po' di margine

# Formato timestamp AAAAMMDDHHMMSS (14 cifre, niente separatori — più compatto e
# ordinabile lessicograficamente).
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MODE="${1:-hourly}"

# Stato accumulato durante il run (per JSON status finale)
RUN_OK=()
RUN_FAILED=()
RUN_WARNINGS=()

# ── --status: stampa stato ultima esecuzione ed esci ────────────────────────
if [ "$MODE" == "--status" ]; then
    if [ -f "$STATUS_FILE" ]; then
        cat "$STATUS_FILE"
        exit 0
    else
        echo '{"error":"no status file","status":"never_run"}'
        exit 1
    fi
fi

echo "[$TIMESTAMP] Backup $MODE avviato"
echo ""

# ── Crea cartelle ───────────────────────────────────────────────────────────
mkdir -p "$BACKUP_HOURLY" "$BACKUP_DAILY" "$BACKUP_LKG"

# ── Helper: dimensione file in MB (1 decimale, leggibile) ──────────────────
# Esempi: 4096 → "0.0 MB", 86016 → "0.1 MB", 7368704 → "7.0 MB", 26800128 → "25.6 MB"
human_size() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "n/a"
        return
    fi
    local sz=$(stat -c%s "$file" 2>/dev/null || echo 0)
    # Conversione bash: bytes / 1048576 con 1 decimale
    # awk per evitare dipendenze: printf "%.1f"
    awk -v b="$sz" 'BEGIN { printf "%.1f MB", b/1048576 }'
}

# ── Trova path sorgente per un DB (locale-aware → legacy fallback) ──────────
find_db_source() {
    local name="$1"
    local p1="$LOCALE_DATA_DIR/$name"
    local p2="$DATA_DIR/$name"

    # Se entrambi esistono, scelgo quello più grande (più probabilmente quello vivo)
    if [ -f "$p1" ] && [ -f "$p2" ]; then
        local sz1=$(stat -c%s "$p1" 2>/dev/null || echo 0)
        local sz2=$(stat -c%s "$p2" 2>/dev/null || echo 0)
        if [ "$sz1" -ge "$sz2" ]; then echo "$p1"; else echo "$p2"; fi
    elif [ -f "$p1" ]; then
        echo "$p1"
    elif [ -f "$p2" ]; then
        echo "$p2"
    else
        echo ""  # non trovato
    fi
}

# ── Verifica integrità di un file SQLite ────────────────────────────────────
# Ritorna 0 se OK, 1 se fallito.
check_integrity() {
    local file="$1"
    local name=$(basename "$file")

    # Esiste?
    if [ ! -f "$file" ]; then
        echo "    ✗ $name: file inesistente"
        return 1
    fi

    # Dimensione minima
    local size=$(stat -c%s "$file" 2>/dev/null || echo 0)
    if [ "$size" -lt "$MIN_SIZE_BYTES" ]; then
        echo "    ✗ $name: dimensione $size byte < soglia $MIN_SIZE_BYTES (sospetto stub/vuoto)"
        return 1
    fi

    # Magic bytes SQLite ("SQLite format 3")
    local magic=$(head -c 16 "$file" 2>/dev/null | od -An -c | tr -d ' \n' | head -c 13)
    if [ "$magic" != "SQLiteformat3" ]; then
        echo "    ✗ $name: header non SQLite"
        return 1
    fi

    # PRAGMA integrity_check
    local result=$(sqlite3 "$file" "PRAGMA integrity_check;" 2>&1 | head -1)
    if [ "$result" != "ok" ]; then
        echo "    ✗ $name: integrity_check fallito → $result"
        return 1
    fi

    return 0
}

# ── Backup atomico con verifica ─────────────────────────────────────────────
# do_backup <src> <dest> → ritorna 0 se OK + integrity passata, 1 altrimenti
do_backup() {
    local src="$1"
    local dest="$2"
    local db_name=$(basename "$src")

    # .backup di sqlite3 è atomico e gestisce WAL correttamente
    sqlite3 "$src" ".backup '$dest'" 2>/dev/null
    local rc=$?

    if [ "$rc" -ne 0 ] || [ ! -f "$dest" ]; then
        echo "  ❌ $db_name: comando .backup fallito (rc=$rc)"
        rm -f "$dest"
        return 1
    fi

    # Verifica integrità del backup APPENA creato
    if ! check_integrity "$dest"; then
        echo "  ❌ $db_name: backup creato ma INTEGRITY CHECK FALLITO → rimosso, NON conta come buono"
        rm -f "$dest"
        return 1
    fi

    echo "  ✅ $db_name → $(basename $dest) ($(human_size "$dest"))"
    return 0
}

# ── Notifica via M.A se ci sono fallimenti ──────────────────────────────────
notify_failures() {
    local failed_count=$1
    local failed_list="$2"
    local mode_label="$3"

    if [ "$failed_count" -eq 0 ]; then return 0; fi

    if [ ! -x "$VENV_PYTHON" ]; then
        echo "  ⚠️  venv Python non trovato in $VENV_PYTHON, skip notifica M.A"
        return 0
    fi

    cd "$PROJECT_DIR"
    PYTHONPATH="$PROJECT_DIR" "$VENV_PYTHON" -c "
import sys
try:
    from app.services.notifiche_service import crea_notifica
    crea_notifica(
        tipo='backup',
        titolo=f'Backup $mode_label: $failed_count file FALLITI',
        messaggio='File falliti: $failed_list. Controlla backup.log e last_known_good/.',
        urgenza='alta',
        modulo='platform',
        dest_ruolo='superadmin',
        icona='⚠️',
    )
    print('  ✉️  Notifica M.A inviata')
except Exception as e:
    print(f'  ⚠️  Notifica fallita: {e}', file=sys.stderr)
" 2>&1 || true
}

# ── Aggiorna last_known_good se backup è OK ─────────────────────────────────
# La cartella last_known_good/ contiene SEMPRE 1 backup integro per ogni DB.
# Viene aggiornato SOLO se il backup di questo run è passato integrity_check.
# In caso di corruzione persistente, qui resta la copia integra.
update_lkg() {
    local backup_file="$1"
    local db_name="$2"
    cp -f "$backup_file" "$BACKUP_LKG/$db_name"
}

# ── Backup file JSON con verifica ───────────────────────────────────────────
# I JSON non hanno PRAGMA integrity_check ma li validiamo con python -mjson.tool
# per assicurarci di non backuppare un file vuoto o corrotto.
do_backup_json() {
    local src="$1"
    local dest="$2"
    local name=$(basename "$src")

    if [ ! -f "$src" ]; then
        echo "  ⚠️  $name: sorgente non trovata"
        return 1
    fi

    local sz=$(stat -c%s "$src" 2>/dev/null || echo 0)
    if [ "$sz" -lt "$JSON_MIN_SIZE_BYTES" ]; then
        echo "  ✗ $name: dimensione $sz B troppo piccola (sospetto svuotamento)"
        return 1
    fi

    # Validità JSON
    if ! python3 -c "import json,sys; json.load(open('$src'))" 2>/dev/null; then
        echo "  ✗ $name: JSON non valido"
        return 1
    fi

    cp -f "$src" "$dest"
    echo "  ✅ $name ($(human_size "$dest"))"
    return 0
}

# Trova path sorgente per un file JSON (locale-aware → legacy)
find_json_source() {
    local name="$1"
    local p1="$LOCALE_DATA_DIR/$name"
    local p2="$DATA_DIR/$name"
    if [ -f "$p1" ] && [ -f "$p2" ]; then
        local sz1=$(stat -c%s "$p1" 2>/dev/null || echo 0)
        local sz2=$(stat -c%s "$p2" 2>/dev/null || echo 0)
        if [ "$sz1" -ge "$sz2" ]; then echo "$p1"; else echo "$p2"; fi
    elif [ -f "$p1" ]; then echo "$p1"
    elif [ -f "$p2" ]; then echo "$p2"
    else echo ""
    fi
}

# ── Scrive status JSON per monitor esterni ──────────────────────────────────
write_status() {
    local mode="$1"
    local total=${#DBS[@]}
    local ok_count=${#RUN_OK[@]}
    local failed_count=${#RUN_FAILED[@]}
    local warn_count=${#RUN_WARNINGS[@]}

    # Costruisci array JSON degli oggetti
    local ok_json=$(printf '"%s",' "${RUN_OK[@]}" | sed 's/,$//')
    local failed_json=$(printf '"%s",' "${RUN_FAILED[@]}" | sed 's/,$//')
    local warn_json=$(printf '"%s",' "${RUN_WARNINGS[@]}" | sed 's/,$//')

    cat > "$STATUS_FILE" << EOF
{
  "mode": "$mode",
  "timestamp": "$TIMESTAMP",
  "epoch": $(date +%s),
  "total_dbs": $total,
  "ok_count": $ok_count,
  "failed_count": $failed_count,
  "warning_count": $warn_count,
  "ok": [${ok_json}],
  "failed": [${failed_json}],
  "warnings": [${warn_json}],
  "lkg_dir": "$BACKUP_LKG"
}
EOF
}

# ── Backup orario ────────────────────────────────────────────────────────────
if [ "$MODE" != "--daily" ]; then
    echo "📦 Backup orario..."
    for db in "${DBS[@]}"; do
        src=$(find_db_source "$db")
        if [ -z "$src" ]; then
            echo "  ⚠️  $db: file sorgente non trovato in nessuno dei due path → skip"
            RUN_WARNINGS+=("$db:not_found")
            continue
        fi

        # Verifica anche il SOURCE prima di backuppare. Se la sorgente è già
        # corrotta/stub, il backup sarebbe inutile e farebbe scattare la
        # rotazione che cancella backup vecchi integri. NO, prima verifichiamo.
        if ! check_integrity "$src"; then
            echo "  ⚠️  $db: SORGENTE corrotta o stub → backup saltato, last_known_good preservato"
            RUN_FAILED+=("$db:source_corrupted")
            continue
        fi

        name="${db%.*}"
        ext="${db##*.}"
        dest="$BACKUP_HOURLY/${name}_${TIMESTAMP}.${ext}"

        if do_backup "$src" "$dest"; then
            RUN_OK+=("$db")
            update_lkg "$dest" "$db"
        else
            RUN_FAILED+=("$db:backup_failed")
        fi
    done

    # ── Backup JSON config (orario) ────────
    echo ""
    echo "📄 Backup file JSON config..."
    for jf in "${JSON_FILES[@]}"; do
        jsrc=$(find_json_source "$jf")
        if [ -z "$jsrc" ]; then
            echo "  ⚠️  $jf: non trovato → skip"
            continue
        fi
        jname="${jf%.*}"
        jext="${jf##*.}"
        jdest="$BACKUP_HOURLY/${jname}_${TIMESTAMP}.${jext}"
        if do_backup_json "$jsrc" "$jdest"; then
            RUN_OK+=("$jf")
            cp -f "$jdest" "$BACKUP_LKG/$jf"
        else
            RUN_FAILED+=("$jf:json_failed")
        fi
    done

    # Rotazione: SOLO se almeno il 50% dei backup sono andati a buon fine.
    # Per ogni DB/JSON tengo gli ultimi RETAIN_COUNT, cancello i precedenti.
    # Questo schema è più robusto del "mtime > N ore" perché non rischia di
    # cancellare TUTTI i backup se per qualche motivo sono tutti vecchi (es.
    # cron disabilitato per giorni: invece di restare con 0 backup, restano
    # gli ultimi 10 anche se sono di una settimana fa).
    total=$(( ${#DBS[@]} + ${#JSON_FILES[@]} ))
    ok_count=${#RUN_OK[@]}
    if [ "$ok_count" -ge $((total / 2)) ]; then
        echo ""
        echo "🔄 Rotazione (mantengo ultimi $RETAIN_COUNT backup per DB)..."
        # DB SQLite
        for db in "${DBS[@]}"; do
            name="${db%.*}"
            ext="${db##*.}"
            ls -1t "$BACKUP_HOURLY/${name}_"*.${ext} 2>/dev/null | tail -n +$((RETAIN_COUNT + 1)) | while read f; do
                rm -f "$f"
                echo "  🗑️  Rimosso: $(basename $f)"
            done
        done
        # JSON config
        for jf in "${JSON_FILES[@]}"; do
            name="${jf%.*}"
            ext="${jf##*.}"
            ls -1t "$BACKUP_HOURLY/${name}_"*.${ext} 2>/dev/null | tail -n +$((RETAIN_COUNT + 1)) | while read f; do
                rm -f "$f"
                echo "  🗑️  Rimosso: $(basename $f)"
            done
        done
    else
        echo ""
        echo "⚠️  TROPPI BACKUP FALLITI ($ok_count/$total ok) → ROTAZIONE SOSPESA per non perdere backup vecchi integri"
    fi

    count=$(find "$BACKUP_HOURLY" -type f \( -name "*.db" -o -name "*.sqlite3" -o -name "*.json" \) | wc -l)
    echo "📊 Backup orari presenti: $count file (DB + JSON, target ≤ $((${#DBS[@]} + ${#JSON_FILES[@]})) × $RETAIN_COUNT)"
fi

# ── Backup giornaliero + Drive ──────────────────────────────────────────────
if [ "$MODE" == "--daily" ]; then
    echo "📦 Backup giornaliero..."
    DAY_DIR="$BACKUP_DAILY/$TIMESTAMP"
    mkdir -p "$DAY_DIR"

    for db in "${DBS[@]}"; do
        src=$(find_db_source "$db")
        if [ -z "$src" ]; then
            echo "  ⚠️  $db: file sorgente non trovato → skip"
            RUN_WARNINGS+=("$db:not_found")
            continue
        fi

        if ! check_integrity "$src"; then
            echo "  ⚠️  $db: SORGENTE corrotta o stub → backup saltato"
            RUN_FAILED+=("$db:source_corrupted")
            continue
        fi

        if do_backup "$src" "$DAY_DIR/$db"; then
            RUN_OK+=("$db")
            update_lkg "$DAY_DIR/$db" "$db"
        else
            RUN_FAILED+=("$db:backup_failed")
        fi
    done

    # ── Backup JSON config (daily) ─────────
    echo ""
    echo "📄 Backup file JSON config..."
    for jf in "${JSON_FILES[@]}"; do
        jsrc=$(find_json_source "$jf")
        if [ -z "$jsrc" ]; then
            echo "  ⚠️  $jf: non trovato → skip"
            continue
        fi
        if do_backup_json "$jsrc" "$DAY_DIR/$jf"; then
            RUN_OK+=("$jf")
            cp -f "$DAY_DIR/$jf" "$BACKUP_LKG/$jf"
        else
            RUN_FAILED+=("$jf:json_failed")
        fi
    done

    # Rotazione: tengo le ultime RETAIN_COUNT_DAILY cartelle daily.
    # Con 2 sync/giorno (03:00 e 18:00) e RETAIN_COUNT_DAILY=14 → 1 settimana.
    total=$(( ${#DBS[@]} + ${#JSON_FILES[@]} ))
    ok_count=${#RUN_OK[@]}
    if [ "$ok_count" -ge $((total / 2)) ]; then
        echo ""
        echo "🔄 Rotazione giornaliera (mantengo ultime $RETAIN_COUNT_DAILY cartelle)..."
        ls -1t "$BACKUP_DAILY" 2>/dev/null | tail -n +$((RETAIN_COUNT_DAILY + 1)) | while read dirname; do
            full="$BACKUP_DAILY/$dirname"
            if [ -d "$full" ]; then
                rm -rf "$full"
                echo "  🗑️  Rimosso: $dirname"
            fi
        done
    else
        echo ""
        echo "⚠️  TROPPI BACKUP FALLITI ($ok_count/$total ok) → ROTAZIONE SOSPESA"
    fi

    # Sync su Google Drive — DAILY include 3 destinazioni:
    #  1. db-daily/   — backup completo dei DB di questo ciclo
    #  2. db-lkg/     — last_known_good cumulativa (1 copia integra per file)
    #  3. runbook/    — script + push.sh + docs + CLAUDE.md (recovery code)
    #     così se il VPS muore E git è inaccessibile, su Drive c'è anche il
    #     codice/script per ripristinare. Ridondante con GitHub ma nessuna
    #     dipendenza esterna richiesta.
    echo ""
    echo "☁️  Sync su Google Drive..."
    if [ -f "$RCLONE_CONF" ]; then
        if rclone sync "$BACKUP_DAILY" "$DRIVE_PATH" --config "$RCLONE_CONF" 2>&1; then
            echo "  ✅ Drive daily sync completato"
            date +%s > "$DATA_DIR/backups/.last_drive_sync"
        else
            echo "  ⚠️  Drive daily sync fallito"
            RUN_WARNINGS+=("drive_sync:failed")
        fi

        if rclone sync "$BACKUP_LKG" "${DRIVE_PATH%-daily}-lkg" --config "$RCLONE_CONF" 2>&1; then
            echo "  ✅ Drive LKG sync completato"
        else
            echo "  ⚠️  Drive LKG sync fallito"
            RUN_WARNINGS+=("drive_lkg_sync:failed")
        fi

        # Runbook: script + push.sh + docs + CLAUDE.md (lista esplicita, niente
        # app/ perché è in git). Sync incrementale: solo i file cambiati.
        echo "  📜 Sync runbook (scripts + docs + push.sh + CLAUDE.md)..."
        # File singoli da copiare in radice del runbook su Drive
        for f in "$PROJECT_DIR/push.sh" "$PROJECT_DIR/CLAUDE.md" "$PROJECT_DIR/VERSION" "$PROJECT_DIR/main.py"; do
            if [ -f "$f" ]; then
                rclone copy "$f" "${DRIVE_PATH%-daily}-runbook/" --config "$RCLONE_CONF" 2>&1 >/dev/null
            fi
        done
        # Cartelle da sincronizzare (specchio completo)
        for d in scripts docs locali; do
            if [ -d "$PROJECT_DIR/$d" ]; then
                if rclone sync "$PROJECT_DIR/$d" "${DRIVE_PATH%-daily}-runbook/$d/" --config "$RCLONE_CONF" --exclude '**/__pycache__/**' --exclude '**/*.pyc' 2>&1 >/dev/null; then
                    echo "    ✅ $d/"
                else
                    echo "    ⚠️  $d/ sync fallito"
                    RUN_WARNINGS+=("drive_runbook_$d:failed")
                fi
            fi
        done
    else
        echo "  ⚠️  rclone.conf non trovato, skip Drive sync"
        RUN_WARNINGS+=("drive_sync:no_rclone_conf")
    fi

    count=$(find "$BACKUP_DAILY" -mindepth 1 -maxdepth 1 -type d | wc -l)
    echo "📊 Backup giornalieri presenti: $count"
fi

# ── Stato finale + notifiche ────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "RIEPILOGO: ${#RUN_OK[@]} OK, ${#RUN_FAILED[@]} FALLITI, ${#RUN_WARNINGS[@]} warning"
if [ ${#RUN_FAILED[@]} -gt 0 ]; then
    echo "Falliti:  ${RUN_FAILED[*]}"
fi
if [ ${#RUN_WARNINGS[@]} -gt 0 ]; then
    echo "Warning:  ${RUN_WARNINGS[*]}"
fi
echo "═══════════════════════════════════════════════════════"

# Scrivi status JSON
write_status "$MODE"

# Notifica solo se fallimenti veri (non solo warning su DB inesistenti)
if [ ${#RUN_FAILED[@]} -gt 0 ]; then
    notify_failures ${#RUN_FAILED[@]} "${RUN_FAILED[*]}" "$MODE"
fi

echo "[$TIMESTAMP] Backup $MODE completato"
echo ""

# Exit code: 0 se nessun fallimento "vero", 1 altrimenti (per cron monitor)
if [ ${#RUN_FAILED[@]} -gt 0 ]; then
    exit 1
fi
exit 0
