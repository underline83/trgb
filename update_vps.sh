#!/bin/bash
# TRGB Gestionale — Aggiornamento completo VPS
# - Resetta la working tree alla main di GitHub
# - Uccide backend/frontend sulle porte 8000 e 5173
# - Riavvia backend e frontend su VPS
# - Salva i log in logs/backend.log e logs/frontend.log

REPO_DIR="/home/marco/trgb/trgb"

echo "───────────────────────────────────────────────"
echo "🚀 UPDATE VPS TRGB — $(date '+%Y-%m-%d %H:%M:%S')"
echo "📁 Repo: $REPO_DIR"
echo "───────────────────────────────────────────────"

cd "$REPO_DIR" || {
  echo "❌ Impossibile entrare in $REPO_DIR"
  exit 1
}

echo ""
echo "🛑 Stop processi su porte 8000 (backend) e 5173 (frontend)…"

P8000=$(sudo lsof -ti:8000 2>/dev/null)
P5173=$(sudo lsof -ti:5173 2>/dev/null)

if [ -n "$P8000" ]; then
  echo "   🔪 Kill backend (porta 8000) PID: $P8000"
  sudo kill -9 $P8000 2>/dev/null || true
else
  echo "   ✔ Nessun processo su 8000"
fi

if [ -n "$P5173" ]; then
  echo "   🔪 Kill frontend (porta 5173) PID: $P5173"
  sudo kill -9 $P5173 2>/dev/null || true
else
  echo "   ✔ Nessun processo su 5173"
fi

sleep 1

echo ""
echo "🔄 Git hard reset su origin/main (ATTENZIONE: perde modifiche locali)…"

git fetch origin
git reset --hard origin/main
git clean -fd

echo "✔ Repo allineata a origin/main."

echo ""
echo "🔐 Rendo eseguibili gli script VPS (backend/frontend)…"
chmod +x run_server_vps.sh run_frontend_vps.sh || true

echo ""
echo "📂 Creo cartella logs se manca…"
mkdir -p logs

echo ""
echo "🌐 Riavvio BACKEND (porta 8000)…"
nohup ./run_server_vps.sh > logs/backend.log 2>&1 &

echo "🌐 Riavvio FRONTEND (porta 5173, mode vps)…"
nohup ./run_frontend_vps.sh > logs/frontend.log 2>&1 &

echo ""
echo "✅ UPDATE COMPLETATO."
echo "   Backend:  http://80.211.131.156:8000"
echo "   Frontend: http://80.211.131.156:5173"
echo "   Log backend:  logs/backend.log"
echo "   Log frontend: logs/frontend.log"
echo "───────────────────────────────────────────────"