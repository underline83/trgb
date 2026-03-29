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

## Errori comuni
- Se backend in `auto-restart`: controllare i log con `journalctl`
- Import mancanti in router → crash all'avvio → 502 su nginx
- `push.sh` scarica sempre i DB dal VPS prima di pushare
- Il sandbox Cowork NON ha accesso SSH al VPS
