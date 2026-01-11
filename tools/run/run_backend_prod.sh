#!/bin/bash
# TRGB backend - versione per SYSTEMD (solo avvio uvicorn)
export PATH="/home/marco/trgb/venv-trgb/bin:$PATH"
cd /home/marco/trgb/trgb || exit 1

exec uvicorn main:app --host 127.0.0.1 --port 8000
