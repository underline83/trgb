#!/bin/bash
# ════════════════════════════════════════════════════════
# TRGB Gestionale — Avvio automatico backend + frontend
# Include:
#   • Attivazione venv
#   • Verifica librerie Python (auto install)
#   • Creazione database vini.db se assente
#   • Avvio backend FastAPI (uvicorn)
#   • Avvio frontend React/Vite (npm run dev)
# ════════════════════════════════════════════════════════

PROJECT_DIR="/Volumes/Underline/trgb_web"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$PROJECT_DIR/venv"
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"
DB_PATH="$PROJECT_DIR/app/data/vini_magazzino.sqlite3"

echo "───────────────────────────────────────────────"
echo "🚀 Avvio TRGB Gestionale — $(date '+%Y-%m-%d %H:%M:%S')"
echo "───────────────────────────────────────────────"

# 1️⃣ Spostati nella cartella del progetto
cd "$PROJECT_DIR" || exit

# 2️⃣ Crea venv se non esiste
if [ ! -d "$VENV_DIR" ]; then
    echo "⚙️  Ambiente virtuale non trovato, lo creo..."
    python3 -m venv "$VENV_DIR"
fi

# 3️⃣ Attiva l’ambiente
source "$VENV_DIR/bin/activate"

# 4️⃣ Aggiorna pip
echo "📦 Aggiornamento pip..."
$PIP install --upgrade pip >/dev/null

# 5️⃣ Installa tutte le librerie richieste PRIMA dell’avvio del server
REQUIRED_PACKAGES=("fastapi" "uvicorn" "pandas" "openpyxl" "python-multipart" "sqlite3")
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if ! $PYTHON -m pip show "$pkg" >/dev/null 2>&1; then
        echo "📥 Installazione libreria mancante: $pkg"
        $PIP install "$pkg"
    fi
done

# 6️⃣ Controllo database principale
if [ ! -f "$DB_PATH" ]; then
    echo "🧱 Database magazzino non trovato — verrà creato al primo avvio di FastAPI."
else
    echo "✅ Database già presente."
fi

# 7️⃣ Chiudi eventuali processi su 8000 (backend) e 5173 (frontend)
kill -9 $(lsof -ti :8000) 2>/dev/null
kill -9 $(lsof -ti :5173) 2>/dev/null

# 8️⃣ Avvio backend FastAPI in nuova finestra
echo "🔹 Avvio backend FastAPI..."
osascript -e "tell application \"Terminal\" to do script \"cd $PROJECT_DIR && source venv/bin/activate && uvicorn main:app --reload\""

# 9️⃣ Avvio frontend React/Vite (solo se esiste)
if [ -d "$FRONTEND_DIR" ]; then
    echo "🔹 Avvio frontend React/Vite..."
    osascript -e "tell application \"Terminal\" to do script \"cd $FRONTEND_DIR && npm run dev\""
fi

echo ""
echo "🌐 Backend:  http://127.0.0.1:8000"
echo "🌐 Frontend: http://127.0.0.1:5173"
echo "───────────────────────────────────────────────"