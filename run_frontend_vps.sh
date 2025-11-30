#!/bin/bash
# TRGB Gestionale — Avvio FRONTEND su VPS (Ubuntu)
# - Usa cartella /home/marco/trgb/trgb/frontend
# - Se manca node_modules fa npm install
# - Avvia Vite in modalità "vps" sulla porta 5173 esposta verso l'esterno

PROJECT_DIR="/home/marco/trgb/trgb"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "───────────────────────────────────────────────"
echo "🚀 Avvio FRONTEND TRGB Web (VPS) — $(date '+%Y-%m-%d %H:%M:%S')"
echo "📁 Cartella frontend: $FRONTEND_DIR"
echo "🌐 Porta: 5173 (mode: vps)"
echo "───────────────────────────────────────────────"

# 1️⃣ Vai nella cartella frontend
cd "$FRONTEND_DIR" || {
  echo "❌ Impossibile entrare in $FRONTEND_DIR"
  exit 1
}

# 2️⃣ Se manca node_modules → npm install
if [ ! -d "node_modules" ]; then
  echo "📦 node_modules non trovato → eseguo npm install..."
  npm install
else
  echo "📦 node_modules presente → salto npm install."
fi

# 3️⃣ Libera la porta 5173 se occupata
if lsof -ti:5173 >/dev/null 2>&1; then
  echo "🛑 Trovato processo sulla porta 5173 → kill..."
  kill -9 $(lsof -ti:5173) 2>/dev/null || true
fi

# 4️⃣ Avvia Vite in modalità VPS
echo "🔹 Avvio Vite: npm run dev -- --host 0.0.0.0 --port 5173 --mode vps"
echo "   (usa .env.vps con VITE_API_BASE_URL=http://80.211.131.156:8000)"

npm run dev -- --host 0.0.0.0 --port 5173 --mode vps