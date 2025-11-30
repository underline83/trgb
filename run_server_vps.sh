#!/bin/bash
# TRGB Gestionale — Avvio backend su VPS (Ubuntu)
# - Usa venv-trgb in /home/marco/trgb
# - Inizializza i DB se mancanti
# - Uccide processi già attivi su 8000
# - Avvia uvicorn main:app su 0.0.0.0:8000

PROJECT_DIR="/home/marco/trgb/trgb"
VENV_DIR="/home/marco/trgb/venv-trgb"
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"
UVICORN="$VENV_DIR/bin/uvicorn"

APP_DIR="$PROJECT_DIR/app"
DATA_DIR="$APP_DIR/data"

DB_PATH="$DATA_DIR/vini.db"
SETTINGS_DB_PATH="$DATA_DIR/vini_settings.sqlite3"
FOODCOST_DB_PATH="$DATA_DIR/foodcost.db"

echo "───────────────────────────────────────────────"
echo "🚀 Avvio TRGB Gestionale (VPS) — $(date '+%Y-%m-%d %H:%M:%S')"
echo "───────────────────────────────────────────────"

# 1️⃣ Vai nella cartella del progetto
cd "$PROJECT_DIR" || exit 1

# 2️⃣ Verifica venv
if [ ! -d "$VENV_DIR" ]; then
  echo "❌ venv-trgb non trovata in $VENV_DIR"
  echo "   Crea la venv con: python3 -m venv /home/marco/trgb/venv-trgb"
  exit 1
fi

# 3️⃣ Attiva venv
source "$VENV_DIR/bin/activate"

# 4️⃣ Aggiorna pip e installa dependencies
echo "📦 Aggiornamento pip + install requirements..."
$PIP install --upgrade pip
$PIP install -r "$PROJECT_DIR/requirements.txt"

# 5️⃣ Assicura cartella dati
mkdir -p "$DATA_DIR"

# 6️⃣ Inizializzazione database se mancanti
if [ ! -f "$DB_PATH" ]; then
  echo "🧱 creo vini.db…"
  $PYTHON - <<'EOF'
from app.models.database import init_database
init_database()
EOF
fi

if [ ! -f "$SETTINGS_DB_PATH" ]; then
  echo "🧱 creo vini_settings.sqlite3…"
  $PYTHON - <<'EOF'
from app.models.settings_db import init_settings_db
from app.models.vini_settings import ensure_settings_defaults
init_settings_db()
ensure_settings_defaults()
EOF
fi

if [ ! -f "$FOODCOST_DB_PATH" ]; then
  echo "🧱 creo foodcost.db…"
  $PYTHON - <<'EOF'
from app.models.foodcost_db import init_foodcost_db
init_foodcost_db()
EOF
fi

echo "✅ DB pronti."

# 7️⃣ Chiudi eventuali processi sulla porta 8000
if lsof -ti:8000 >/dev/null 2>&1; then
  echo "🛑 Chiudo processi sulla porta 8000..."
  kill -9 $(lsof -ti:8000) 2>/dev/null || true
fi

# 8️⃣ Avvio backend FastAPI (senza frontend)
echo "🔹 Avvio backend FastAPI su 0.0.0.0:8000..."
exec "$UVICORN" main:app --host 0.0.0.0 --port 8000