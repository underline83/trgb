##!/bin/bash
# TRGB Gestionale — Avvio backend su VPS (Ubuntu)
# - Usa venv-trgb in /home/marco/trgb
# - Inizializza i DB se mancanti (vini, foodcost) e garantisce settings carta
# - Uccide processi sulla porta 8000
# - Avvia uvicorn main:app su 0.0.0.0:8000

PROJECT_DIR="/home/marco/trgb/trgb"
VENV_DIR="/home/marco/trgb/venv-trgb"
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"
UVICORN="$VENV_DIR/bin/uvicorn"

APP_DIR="$PROJECT_DIR/app"
DATA_DIR="$APP_DIR/data"

VINI_DB_PATH="$DATA_DIR/vini.sqlite3"
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
  echo "   Crea la venv con:  python3 -m venv /home/marco/trgb/venv-trgb"
  exit 1
fi

# 3️⃣ Attiva venv
source "$VENV_DIR/bin/activate"

# 4️⃣ Aggiorna pip e installa requirements
echo "📦 Aggiornamento pip + install requirements..."
$PIP install --upgrade pip
$PIP install -r "$PROJECT_DIR/requirements.txt"

# 5️⃣ Assicura la cartella dati
mkdir -p "$DATA_DIR"

# 6️⃣ Inizializzazione database VINI se mancante
if [ ! -f "$VINI_DB_PATH" ]; then
  echo "🧱 creo vini.sqlite3…"
  $PYTHON - <<'EOF'
from app.models.vini_db import init_database
init_database()
EOF
else
  echo "✔ vini.sqlite3 già presente."
fi

# 7️⃣ Impostazioni carta vini (sempre garantite)
echo "🧩 verifico/imposto vini_settings.sqlite3…"
$PYTHON - <<'EOF'
from app.models.settings_db import init_settings_db
from app.models.vini_settings import ensure_settings_defaults

init_settings_db()
ensure_settings_defaults()
EOF

# 8️⃣ Inizializzazione FOODCOST se mancante
if [ ! -f "$FOODCOST_DB_PATH" ]; then
  echo "🧱 creo foodcost.db…"
  $PYTHON - <<'EOF'
from app.models.foodcost_db import init_foodcost_db
init_foodcost_db()
EOF
else
  echo "✔ foodcost.db già presente."
fi

echo "✅ DB pronti."

# 9️⃣ Chiudi eventuali processi sulla porta 8000 (kill infallibile)
echo "🛑 Controllo processi sulla porta 8000..."

P8000=$(sudo lsof -ti:8000)

if [ -n "$P8000" ]; then
  echo "🔪 Uccido processi: $P8000"
  sudo kill -9 $P8000 2>/dev/null || true
  sleep 1
else
  echo "✔ Nessun processo attivo sulla porta 8000."
fi

# 🔟 Avvio backend FastAPI (senza frontend)
echo "🔹 Avvio backend FastAPI su 0.0.0.0:8000..."
exec "$UVICORN" main:app --host 0.0.0.0 --port 8000