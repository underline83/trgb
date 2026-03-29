# ISTRUZIONI SERVER TRGB

## Servizi Systemd
- **Backend**: `trgb-backend.service` (FastAPI + Uvicorn)
- **Frontend**: `trgb-frontend.service` (Vite - npm run dev)
- **setvtrgb.service**: servizio di sistema console (non toccare)

## Comandi utili
```bash
# Stato servizi
sudo systemctl status trgb-backend
sudo systemctl status trgb-frontend

# Log backend (errori avvio, crash, ecc.)
sudo journalctl -u trgb-backend -n 50 --no-pager

# Log frontend
sudo journalctl -u trgb-frontend -n 50 --no-pager

# Restart manuale
sudo systemctl restart trgb-backend
sudo systemctl restart trgb-frontend
```

## Deploy
- `./push.sh "messaggio"` — commit, push e deploy (il post-receive hook riavvia trgb-backend via systemctl)
- Il push va fatto dal Mac di Marco (ha le chiavi SSH), NON dal sandbox Cowork
- Remote `origin` → VPS bare repo `/home/marco/trgb/trgb.git`
- Remote `github` → GitHub (backup)
- push.sh usa `sqlite3 .backup` (atomico, gestisce WAL) per scaricare i DB — NON scp diretto
- Prima di scaricare, salva la copia precedente come `*.prev` (1 rollback disponibile)
- I file DB (*.db, *.sqlite3, *.prev, .fuse_hidden*) sono in .gitignore e NON tracciati in git
- IMPORTANTE: mai aggiungere file DB al tracking git (`git add app/data/*.db` è VIETATO)

## Percorsi VPS
- Repo: `/home/marco/trgb/trgb/`
- Venv: `/home/marco/trgb/venv-trgb/`
- DB: `/home/marco/trgb/trgb/app/data/`

## URL Pubblici
- Backend API: `https://trgb.tregobbi.it/api/...`
- Frontend App: `https://app.tregobbi.it`
- Nginx aggiunge il prefisso `/api` → FastAPI riceve senza `/api`
- Diretto sul server: `localhost:8000/contabilita/fe/...` (NO `/api`)

## Migrazioni
- Runner: `app/migrations/migration_runner.py`
- File: `app/migrations/001_*.py`, `002_*.py`, ecc.
- Eseguite automaticamente all'avvio di FastAPI
- DB: `app/data/foodcost.db` (main), `app/data/admin_finance.sqlite3` (vendite)

## Backup Database
- Script: `scripts/backup_db.sh` — backup atomico con `sqlite3 .backup`
- **Orario** (ogni ora): salva in `app/data/backups/hourly/`, rotazione 48h
- **Giornaliero** (3:30): salva in `app/data/backups/daily/`, sync su Google Drive (`gdrive:TRGB-Backup/db-daily/`), rotazione 7gg
- Cron attivi sul server:
  - `0 * * * *` → backup orario
  - `30 3 * * *` → backup giornaliero + Drive
- Log: `/home/marco/trgb/backup.log`
- DB backuppati: foodcost.db, admin_finance.sqlite3, vini.sqlite3, vini_magazzino.sqlite3, vini_settings.sqlite3, dipendenti.sqlite3
- Backup precedente su Drive: `gdrive:TRGB-Backup/app-code/app/data/` (da push.sh -d)
- Per ripristinare: `rclone copy gdrive:TRGB-Backup/db-daily/YYYYMMDD_HHMMSS/foodcost.db /tmp/ --config ~/.config/rclone/rclone.conf`

## Errori comuni
- Se backend in `auto-restart`: controllare i log con `journalctl`
- Import mancanti in router → crash all'avvio → 502 su nginx
- push.sh scarica i DB dal VPS con backup atomico prima di pushare
- Il sandbox Cowork NON ha accesso SSH al VPS
- MAI toccare il DB di produzione con .dump/.recover senza prima fare un backup atomico
- MAI cancellare file -wal o -shm di SQLite mentre il DB è in uso
