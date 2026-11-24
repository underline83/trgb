# Ripristino da backup — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale (procedura scritta, mai eseguita su un guasto vero) · **Ultima verifica:** 2026-11-24
> **Vedi anche:** [sicurezza_backup.md](sicurezza_backup.md) (com'è fatto il backup), [installazione_nuovo_server.md](installazione_nuovo_server.md) (server da zero), [deploy.md](deploy.md)

Come si rimette a posto un dato dai backup. Scritta il 24/11/2026: fino a quel giorno la procedura non
esisteva («cerchiamo insieme»). I passi 3 e 4 di §2 sono quelli che il restore di prova settimanale
(`scripts/restore_test.py`) esegue da solo ogni settimana; i passi 1, 2 e 5 su un guasto vero non sono mai stati fatti.

## 1. Quale copia usare

| Cosa è successo | Da dove si prende | Dove sta sul VPS |
|---|---|---|
| Un DB rovinato, serve l'ultima copia buona | `last_known_good/` | `/home/marco/trgb/trgb/app/data/backups/last_known_good/<db>` |
| Un errore fatto oggi, serve com'era qualche ora fa | orario (ultime 10 copie per DB) | `…/backups/hourly/<db>_<AAAAMMGGHHMMSS>.<ext>` |
| Un errore di giorni fa (fino a una settimana) | giornaliero (03:00 e 18:00, 14 cartelle) | `…/backups/daily/<AAAAMMGGHHMMSS>/<db>` |
| Un file caricato sparito (allegato, CV, F24, bolletta) | copia dei file caricati | `…/backups/uploads/trgb_uploads/…` o `…/uploads/locale_data_uploads/…` |
| Il VPS non c'è più | Google Drive, cartella `TRGB-Backup/` | `db-daily/`, `db-lkg/`, `db-uploads/`, `db-runbook/` → §4 |

I DB vivi stanno in `/home/marco/trgb/trgb/locali/tregobbi/data/`.

## 2. Ripristinare un DB (VPS acceso)

Regole: **non si cancella niente** (il file rovinato si mette da parte, non si elimina) e **il backend
è fermo** mentre si copia. Esempio con `clienti.sqlite3` dalla copia `last_known_good`.

```bash
ssh trgb
cd /home/marco/trgb/trgb

# 1. Fermare il backend (nessuno deve scrivere mentre si copia)
sudo systemctl stop trgb-backend

# 2. Mettere da parte il file rovinato CON i suoi -wal e -shm
#    (un -wal vecchio accanto a un DB ripristinato lo rovinerebbe di nuovo)
mkdir -p locali/tregobbi/data/_rotti
for f in clienti.sqlite3 clienti.sqlite3-wal clienti.sqlite3-shm; do
  [ -f locali/tregobbi/data/$f ] && mv locali/tregobbi/data/$f locali/tregobbi/data/_rotti/$f.$(date +%Y%m%d%H%M)
done

# 3. Copiare la copia buona
cp app/data/backups/last_known_good/clienti.sqlite3 locali/tregobbi/data/clienti.sqlite3

# 4. Verificare: deve rispondere "ok"
sqlite3 locali/tregobbi/data/clienti.sqlite3 "PRAGMA integrity_check;"

# 5. Riaccendere e guardare che parta
sudo systemctl start trgb-backend
sudo systemctl status trgb-backend
```

Poi aprire il gestionale e guardare un dato recente di quel modulo. Quello che è stato scritto fra
l'ora della copia e il guasto è perso: va reinserito a mano (con la copia oraria si perde al massimo un'ora).

Per una copia oraria o giornaliera cambia solo il passo 3:

```bash
ls -lt app/data/backups/hourly/clienti_*          # scegliere l'ora
cp app/data/backups/hourly/clienti_20261124160001.sqlite3 locali/tregobbi/data/clienti.sqlite3
# oppure
ls app/data/backups/daily/                         # scegliere il giorno
cp app/data/backups/daily/20261124180001/clienti.sqlite3 locali/tregobbi/data/clienti.sqlite3
```

I JSON di configurazione (`users.json`, `modules.json`…) si ripristinano allo stesso modo, senza il passo 4.

## 3. Ripristinare un file caricato

La copia è additiva: un file cancellato dal gestionale resta nel backup.

```bash
# allegati, CV, F24, documenti dipendenti, foto menu
ls /home/marco/trgb/trgb/app/data/backups/uploads/trgb_uploads/
cp -a /home/marco/trgb/trgb/app/data/backups/uploads/trgb_uploads/pratiche/<file> /home/marco/trgb_uploads/pratiche/

# bollette utenze, XML intermittenti
ls /home/marco/trgb/trgb/app/data/backups/uploads/locale_data_uploads/
```

Il backend non va fermato. Il percorso dentro `trgb_uploads/` deve restare lo stesso (è scritto nel DB).

## 4. Il VPS non c'è più

1. Server nuovo: seguire [installazione_nuovo_server.md](installazione_nuovo_server.md) (codice da GitHub; se GitHub non è raggiungibile, script e docs sono in `TRGB-Backup/db-runbook/` su Drive).
2. Configurare rclone col Drive dell'osteria (`rclone config`, remote `gdrive`).
3. Con il backend fermo, scaricare l'ultimo giornaliero nella cartella dati:
   ```bash
   rclone lsd gdrive:TRGB-Backup/db-daily/                      # l'ultima cartella è la più recente
   rclone copy gdrive:TRGB-Backup/db-daily/<AAAAMMGGHHMMSS>/ /home/marco/trgb/trgb/locali/tregobbi/data/
   rclone copy gdrive:TRGB-Backup/db-uploads/trgb_uploads/ /home/marco/trgb_uploads/
   rclone copy gdrive:TRGB-Backup/db-uploads/locale_data_uploads/ /home/marco/trgb/trgb/locali/tregobbi/data/uploads/
   ```
4. `PRAGMA integrity_check` su ogni DB (passo 4 di §2), poi accendere il backend.
5. Rimettere il crontab ([sicurezza_backup.md](sicurezza_backup.md) §2.1 e §2.2) e il file `.env` (non è in nessun backup automatico: tenerne una copia fuori dal VPS).

Si perde al massimo quello che è stato scritto dopo l'ultimo giornaliero (03:00 o 18:00).

## 5. Sapere se i backup sono ripristinabili

- Impostazioni › Backup: riquadro «🧪 Restore di prova» (verde con la data dell'ultima prova riuscita).
- A mano, sul VPS: `python3 /home/marco/trgb/trgb/scripts/restore_test.py` (non tocca i dati veri).
- Dettaglio dell'ultima prova: `app/data/backups/.last_restore_test.json`.
