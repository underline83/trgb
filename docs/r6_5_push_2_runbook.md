# R6.5 Push 2 — Consolidamento fisico DB in `locali/tregobbi/data/`

> **Scopo:** completare R6.5 spostando i 7 DB ancora in `app/data/` (legacy) dentro
> `locali/tregobbi/data/` (path locale-aware) per chiudere lo stato ibrido lasciato
> dall'incidente del 3-4 maggio.
>
> **Quando eseguire:** **NON stasera** se sei stanco. Domani mattina a freddo, in
> finestra morta dell'osteria (es. 10-11 mattina o 16-17 pomeriggio).
>
> **Tempo stimato:** 5-10 min (incluso restart e verifiche).
>
> **Prerequisiti:** sistema backup attivo (testato 4/5 sera, OK).
>
> **Rischio:** medio-basso. Il `mv` su stesso filesystem è atomico. Backend stop+start
> è di pochi secondi. Rollback è banale (mv all'indietro).

---

## Stato pre-runbook (situazione attuale 4/5 sera)

Stato ibrido:
- **In `locali/tregobbi/data/`:** `users.json`, `notifiche.sqlite3`, `tasks.sqlite3`, `bevande.sqlite3`, `modules.json`, `modules.runtime.json`, `modules.runtime.meta.json`, `closures_config.json`
- **In `app/data/`:** `foodcost.db`, `admin_finance.sqlite3`, `vini.sqlite3`, `vini_magazzino.sqlite3`, `vini_settings.sqlite3`, `dipendenti.sqlite3`, `clienti.sqlite3` (i 7 restoreati dal backup VPS 2 mag 23:00)

Backend funziona perché `locale_data_path()` ha fallback automatico:
1. Cerca prima `locali/tregobbi/data/<file>`
2. Se non esiste, cade su `app/data/<file>`

**Obiettivo:** dopo R6.5 push 2, TUTTI i 10 DB + 5 JSON saranno in `locali/tregobbi/data/`.
Il fallback resta attivo come safety net, ma di fatto non viene più usato.

**Obiettivo R6.5 push 3 (futuro, dopo qualche giorno di stabilità):** rimuovere
il fallback runtime in `app/utils/locale_data.py`. Vedi sezione finale.

---

## Runbook (esegui in ordine, sul VPS via SSH)

### STEP 0 — Pre-flight (verifica stato)

```bash
ssh trgb
cd /home/marco/trgb/trgb

echo "=== Path locale-aware (target) ==="
ls -la locali/tregobbi/data/

echo ""
echo "=== Path legacy (sorgente da spostare) ==="
ls -la app/data/*.sqlite3 app/data/*.db 2>/dev/null

echo ""
echo "=== Integrità sorgente prima del move ==="
for db in app/data/foodcost.db app/data/admin_finance.sqlite3 app/data/vini.sqlite3 app/data/vini_magazzino.sqlite3 app/data/vini_settings.sqlite3 app/data/dipendenti.sqlite3 app/data/clienti.sqlite3; do
    if [ -f "$db" ]; then
        SZ=$(stat -c%s "$db")
        INTEG=$(sqlite3 "$db" 'PRAGMA integrity_check;' 2>&1 | head -1)
        printf "%-40s %12s bytes  integ=%s\n" "$(basename $db)" "$SZ" "$INTEG"
    fi
done
```

**Atteso:** tutti i 7 file presenti, dimensioni > 8KB, `integ=ok`.

**Se uno qualsiasi non è OK → STOP, non procedere.** Ferma qui, indaga, se serve recupera dal backup last_known_good.

---

### STEP 1 — Backup safety pre-move (CRITICO)

Lancia un backup `--daily` ESPLICITO ora, così abbiamo uno snapshot integro da cui ripartire se qualcosa va storto:

```bash
/home/marco/trgb/trgb/scripts/backup_db.sh --daily
```

**Atteso:** `RIEPILOGO: 15 OK, 0 FALLITI, 0 warning` + `Drive daily sync completato`.

**Se non è 15/15 OK → STOP**, non procedere.

---

### STEP 2 — Stop backend (per move atomico)

```bash
sudo systemctl stop trgb-backend
sleep 2
systemctl status trgb-backend | head -3
```

**Atteso:** `inactive (dead)`.

⚠️ **L'osteria sarà offline da qui finché non riavvii (5-30 secondi)**. Fallo in finestra morta.

---

### STEP 3 — Checkpoint WAL (forza flush eventuali transazioni pendenti)

```bash
for db in app/data/*.sqlite3 app/data/*.db; do
    if [ -f "$db" ]; then
        sqlite3 "$db" "PRAGMA wal_checkpoint(TRUNCATE);" 2>&1 | head -1
    fi
done

echo ""
echo "--- Verifica: WAL files dopo checkpoint (devono essere assenti o 0 byte) ---"
ls -la app/data/*-wal 2>/dev/null
```

**Atteso:** righe tipo `0|N|N` (no errori). I `-wal` files o non ci sono o sono 0 byte.

---

### STEP 4 — Move atomico dei 7 DB

```bash
DBS_TO_MOVE="foodcost.db admin_finance.sqlite3 vini.sqlite3 vini_magazzino.sqlite3 vini_settings.sqlite3 dipendenti.sqlite3 clienti.sqlite3"

for db in $DBS_TO_MOVE; do
    if [ -f "app/data/$db" ]; then
        if [ -f "locali/tregobbi/data/$db" ]; then
            echo "  ⚠ $db esiste GIÀ in locali/tregobbi/data/ — SKIP per non sovrascrivere"
            echo "    (controlla quale dei due tenere PRIMA di procedere)"
            continue
        fi
        mv "app/data/$db" "locali/tregobbi/data/$db"
        echo "  ✓ $db spostato"
    else
        echo "  ⚠ app/data/$db non trovato → skip"
    fi
done

# Sposta anche eventuali -wal/-shm orfani residui (non dovrebbero esserci dopo checkpoint)
for ext in -wal -shm -journal; do
    for db in $DBS_TO_MOVE; do
        f="app/data/${db}${ext}"
        if [ -f "$f" ]; then
            mv "$f" "locali/tregobbi/data/${db}${ext}"
            echo "  ✓ ${db}${ext} (residuo) spostato"
        fi
    done
done
```

**Atteso:** 7 righe `✓ ... spostato`, nessun warning.

**Se qualche file dice "esiste GIÀ in locali":** STOP. Verifica manualmente quale tenere (di solito quello con MAX dimensione e MAX righe, ma chiedi a Claude prima di scegliere).

---

### STEP 5 — Verifica post-move

```bash
echo "=== app/data/ (dovrebbe non avere più .sqlite3 e .db) ==="
ls -la app/data/*.sqlite3 app/data/*.db 2>/dev/null || echo "  ✓ Nessun DB residuo"

echo ""
echo "=== locali/tregobbi/data/ (deve contenere TUTTI i 10 DB + 5 JSON) ==="
ls -la locali/tregobbi/data/

echo ""
echo "=== Integrità DB nel nuovo path ==="
for db in foodcost.db admin_finance.sqlite3 vini.sqlite3 vini_magazzino.sqlite3 vini_settings.sqlite3 dipendenti.sqlite3 clienti.sqlite3 notifiche.sqlite3 tasks.sqlite3 bevande.sqlite3; do
    SRC="locali/tregobbi/data/$db"
    if [ -f "$SRC" ]; then
        SZ=$(stat -c%s "$SRC")
        INTEG=$(sqlite3 "$SRC" 'PRAGMA integrity_check;' 2>&1 | head -1)
        printf "%-40s %12s bytes  integ=%s\n" "$db" "$SZ" "$INTEG"
    else
        echo "❌ $db MANCANTE!"
    fi
done
```

**Atteso:**
- `app/data/` senza .sqlite3 e .db (al massimo backups/, uploads/, file di config che non sono DB)
- `locali/tregobbi/data/` con 10 DB + 5 JSON
- Tutti i `integ=ok`

**Se qualcosa non torna:** STOP, vai a STEP 7 (rollback).

---

### STEP 6 — Restart backend + sanity check

```bash
sudo systemctl start trgb-backend
sleep 5

echo "=== Status backend ==="
systemctl status trgb-backend | head -5

echo ""
echo "=== Probe HTTP ==="
curl -sI https://trgb.tregobbi.it/ | head -1
curl -s https://trgb.tregobbi.it/system/info; echo

echo ""
echo "=== Log backend ultimi 30s (cerco errori) ==="
sudo journalctl -u trgb-backend --since "30 seconds ago" --no-pager | tail -30
```

**Atteso:**
- Status `active (running)`
- HTTP 405 (probe HEAD su root, normale)
- `/system/info` ritorna JSON con `locale: "tregobbi"` e `version`
- Nessun `ERROR`, `Traceback`, `OperationalError`, `no such table` nel log

**Se trovi errori:** STOP, vai a STEP 7 (rollback).

---

### STEP 7 — Verifica funzionamento app dal browser

Su telefono o computer, **come Marco**:

1. Apri https://trgb.tregobbi.it
2. Login con `marco` / il tuo PIN
3. Vai in **Vini → Magazzino** → vedi 1266 vini? ✓
4. Vai in **Vini → Movimenti** → vedi i movimenti (l'ultimo è del 2/5 22:25)? ✓
5. Vai in **Prenotazioni** → si apre senza errori? ✓
6. Vai in **Impostazioni → Backup** → dashboard verde, 10/10 LKG? ✓
7. Apri https://trgb.tregobbi.it/carta → carta vini pubblica funziona? ✓

**Se TUTTO OK → R6.5 push 2 completato.** Vai a STEP 8.

**Se anche solo UNA cosa non funziona → STEP 7 (rollback) immediato.**

---

### STEP 8 — Conferma finale + commit

Lancia un `--daily` per verificare che il backup ora pesca dai nuovi path:

```bash
/home/marco/trgb/trgb/scripts/backup_db.sh --daily
```

**Atteso:** `RIEPILOGO: 15 OK, 0 FALLITI` (la funzione `find_db_source` di backup_db.sh usa già il dual-path, quindi trova tutto in locali/tregobbi/data/).

Aggiorna `docs/refactor_monorepo.md` §6 con stato R6.5: "✅ COMPLETATO push 2 il YYYY-MM-DD".

---

## STEP 9 — ROLLBACK (solo se qualcosa non funziona)

Se il backend non parte, l'app è rotta, o le query SQL falliscono:

```bash
# Stop backend
sudo systemctl stop trgb-backend
sleep 2

# Sposta indietro i 7 DB
DBS_TO_MOVE="foodcost.db admin_finance.sqlite3 vini.sqlite3 vini_magazzino.sqlite3 vini_settings.sqlite3 dipendenti.sqlite3 clienti.sqlite3"
for db in $DBS_TO_MOVE; do
    if [ -f "locali/tregobbi/data/$db" ]; then
        mv "locali/tregobbi/data/$db" "app/data/$db"
        echo "  ↩ $db ripristinato in app/data/"
    fi
done

# Restart
sudo systemctl start trgb-backend
sleep 5
curl -sI https://trgb.tregobbi.it/ | head -1

# A questo punto sei tornato allo stato pre-move (stato ibrido pre-incidente).
# Backend funziona di nuovo via fallback locale_data_path.
```

Se il rollback funziona, il backend è di nuovo nello stato ibrido (sicuro). Riprovi R6.5 push 2 in altro momento, prima indagando perché è andato storto.

Se anche il rollback non riporta su il backend → STOP TUTTO. Restore da `app/data/backups/last_known_good/` (è la copia integra protetta dal backup_db.sh v2):

```bash
sudo systemctl stop trgb-backend
cp -f app/data/backups/last_known_good/*.sqlite3 locali/tregobbi/data/
cp -f app/data/backups/last_known_good/*.db locali/tregobbi/data/
cp -f app/data/backups/last_known_good/*.json locali/tregobbi/data/
sudo systemctl start trgb-backend
```

---

## R6.5 Push 3 — Rimozione fallback (FUTURO, NON ORA)

Dopo che R6.5 push 2 è stabile da almeno 7 giorni, si può fare R6.5 push 3:

1. **Modifica** `app/utils/locale_data.py`: il `locale_data_path()` torna SOLO il path locale-aware, niente fallback. Se il file non esiste, `FileNotFoundError` (fail-loud).
2. **Test in dev**: assicurarsi che ogni codice che usa `locale_data_path()` non si aspetti più il fallback.
3. **Push** con `[core]` tag.
4. **Pre-deploy:** lancia il sanity check del nuovo push.sh — verifica che TUTTI i 10 DB siano nel path locale-aware sul VPS prima di pushare.
5. **Post-deploy:** sanity check nuovo + verifica functional dell'app.

Una volta fatto R6.5 push 3, R6.5 è chiuso definitivamente.

---

## Note finali

**Cose che NON fa questo runbook (volutamente):**
- Non rimuove il fallback `locale_data_path()` runtime → resta come safety net
- Non sposta `users.json`, `modules.json`, ecc. → sono già in `locali/tregobbi/data/`
- Non tocca `app/data/backups/` → la cartella backup resta dov'è (è path "tecnico", non "dati")
- Non tocca `app/data/uploads/` (se esiste) → quello è gestito da `tenant_dir()` (K-bis)

**Files consolidati post-runbook in `locali/tregobbi/data/`:**
1. foodcost.db
2. admin_finance.sqlite3
3. vini.sqlite3
4. vini_magazzino.sqlite3
5. vini_settings.sqlite3
6. dipendenti.sqlite3
7. clienti.sqlite3
8. notifiche.sqlite3
9. tasks.sqlite3
10. bevande.sqlite3
11. users.json
12. modules.json
13. modules.runtime.json
14. modules.runtime.meta.json
15. closures_config.json

**Riferimenti:**
- `docs/refactor_monorepo.md` §3 R6.5 — design originale
- `docs/sicurezza_backup.md` — sistema backup post-incidente
- `docs/problemi.md` S60-INC1 — incidente che ha lasciato lo stato ibrido
- `app/utils/locale_data.py` — implementazione `locale_data_path()` con fallback
