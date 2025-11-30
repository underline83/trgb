#!/bin/bash
# ───────────────────────────────────────────────
# TRGB Web - Avvio frontend (VPS)
# Usa Vite in dev mode esposto sulla rete
# Porta di default: 5173
# ───────────────────────────────────────────────

PROJECT_DIR="/home/marco/trgb/trgb"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PORT=5173

echo "───────────────────────────────────────────────"
echo "🚀 Avvio frontend TRGB Web (Vite) su VPS"
echo "📁 Cartella: $FRONTEND_DIR"
echo "🌐 Porta:   $PORT"
echo "───────────────────────────────────────────────"

cd "$FRONTEND_DIR" || exit 1

# 1️⃣ Installa le dipendenze se manca node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 node_modules mancante → npm install..."
  npm install
else
  echo "✅ node_modules già presente."
fi

# 2️⃣ Chiudi eventuali processi attivi sulla porta
if lsof -ti:$PORT >/dev/null 2>&1; then
  echo "🛑 Chiudo processi sulla porta $PORT..."
  kill -9 $(lsof -ti:$PORT) 2>/dev/null || true
fi

# 3️⃣ Avvia Vite esposto su tutte le interfacce
echo "🔹 Avvio Vite: npm run dev -- --host 0.0.0.0 --port $PORT"
npm run dev -- --host 0.0.0.0 --port $PORT