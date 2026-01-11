#!/bin/bash
# TRGB FRONTEND - versione per SYSTEMD
export PATH="/usr/bin:/bin:/usr/local/bin"

cd /home/marco/trgb/trgb/frontend || exit 1

# Avvia Vite in modalità VPS su 127.0.0.1 (sicuro dietro Nginx)
exec npm run dev -- --host 127.0.0.1 --port 5173 --mode vps
