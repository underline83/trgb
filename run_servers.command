#!/bin/bash
# ════════════════════════════════════════════════════════
# TRGB Gestionale — Avvio automatico backend + frontend
# Versione 2.6-premium — con pulizia cache Vite + SW + fix permessi DB
# Tailwind gestito da Vite (npm run dev) tramite postcss.config.cjs
# ════════════════════════════════════════════════════════

PROJECT_DIR="/Volumes/Underline/trgb_web"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$PROJECT_DIR/venv"
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"

APP_DIR="$PROJECT_DIR/app"
DATA_DIR="$APP_DIR/data"

DB_PATH="$PROJECT_DIR/app/data/vini.db"
SETTINGS_DB_PATH="$PROJECT_DIR/app/data/vini_settings.sqlite3"
FOODCOST_DB_PATH="$PROJECT_DIR/app/data/foodcost.db"

STATIC_DIR="$PROJECT_DIR/static"
FONTS_DIR="$STATIC_DIR/fonts"
INSTALL_FONTS_SCRIPT="$PROJECT_DIR/tools/install_fonts.sh"

echo "───────────────────────────────────────────────"
echo "🚀 Avvio TRGB Gestionale — $(date '+%Y-%m-%d %H:%M:%S')"
echo "───────────────────────────────────────────────"
cd "$PROJECT_DIR" || exit

# ╔═══════════════════════════════════════╗
# 0️⃣ PULIZIA CACHE FRONTEND (Vite + SW)
# ╚═══════════════════════════════════════╝
echo ""
echo "🧹 Pulizia cache Vite + SW…"

rm -rf "$FRONTEND_DIR/node_modules/.vite" 2>/dev/null && echo "  ✔ Rimossa cache .vite"
rm -rf "$FRONTEND_DIR/node_modules/.cache" 2>/dev/null && echo "  ✔ Rimossa cache .cache"

SW_FILE="$FRONTEND_DIR/public/sw.js"
[ -f "$SW_FILE" ] && rm "$SW_FILE" && echo "  ✔ Service worker rimosso"

BUILD_VERSION=$(date +%s)
echo "export const BUILD_VERSION = '$BUILD_VERSION';" > "$FRONTEND_DIR/src/build_version.js"
echo "🆕 Versione build aggiornata: $BUILD_VERSION"


# ╔═══════════════════════════════════════╗
# 1️⃣ INSTALLAZIONE HOMEBREW
# ╚═══════════════════════════════════════╝
echo ""
echo "🔍 Verifica Homebrew…"
if ! command -v brew >/dev/null 2>&1; then
    echo "❌ Homebrew NON installato — installazione…"
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zprofile
    export PATH="/opt/homebrew/bin:$PATH"
else
    echo "✔ Homebrew già presente."
fi


# ╔═══════════════════════════════════════╗
# 2️⃣ DIPENDENZE WEASYPRINT
# ╚═══════════════════════════════════════╝
echo ""
echo "🔍 Controllo dipendenze WeasyPrint…"
DEPS=(pango cairo gobject-introspection gdk-pixbuf harfbuzz librsvg)
MISSING=()

for dep in "${DEPS[@]}"; do
    brew list "$dep" >/dev/null 2>&1 || MISSING+=("$dep")
done

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "📥 Installazione: ${MISSING[*]}"
    brew install "${MISSING[@]}"
else
    echo "✔ Tutte presenti."
fi


# ╔═══════════════════════════════════════╗
# 3️⃣ FONT LOCALI (manteniamo tutto!)
# ╚═══════════════════════════════════════╝
echo ""
echo "🔍 Controllo font locali…"
mkdir -p "$FONTS_DIR"
mkdir -p "$PROJECT_DIR/tools"

if [ ! -f "$INSTALL_FONTS_SCRIPT" ]; then
cat << 'EOF' > "$INSTALL_FONTS_SCRIPT"
#!/bin/bash
FONT_DIR="/Volumes/Underline/trgb_web/static/fonts"
mkdir -p "$FONT_DIR"

echo "👉 Installo Cormorant Garamond (TTF)"
curl -L -o "$FONT_DIR/CormorantGaramond-Regular.ttf"  "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf"
curl -L -o "$FONT_DIR/CormorantGaramond-Bold.ttf"     "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Bold.ttf"

echo "👉 Installo Cormorant Garamond (WOFF2)"
curl -L -o "$FONT_DIR/CormorantGaramond-Regular.woff2" "https://fonts.gstatic.com/s/cormorantgaramond/v14/0FlVVOGfFVBkM8fIpY4nueTuN3z55m5O.woff2"
curl -L -o "$FONT_DIR/CormorantGaramond-Bold.woff2"    "https://fonts.gstatic.com/s/cormorantgaramond/v14/0FlUVOGfFVBkM8fIpY4nueTuN3z59v5gA.woff2"

echo "👉 Installo Inter"
curl -L -o "$FONT_DIR/Inter-Regular.woff2" "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK4dq8S4-UDXZXQ.woff2"
curl -L -o "$FONT_DIR/Inter-SemiBold.woff2" "https://fonts.gstatic.com/s/inter/v12/UcCM3FwrK4dq8S4-UDz6RA.woff2"

echo "🎉 Font installati!"
EOF

chmod +x "$INSTALL_FONTS_SCRIPT"
fi

if [ -z "$(ls -A "$FONTS_DIR")" ]; then
    echo "📥 Font mancanti — installo…"
    bash "$INSTALL_FONTS_SCRIPT"
else
    echo "✔ Font già presenti."
fi


# ╔═══════════════════════════════════════╗
# 4️⃣ AMBIENTE VIRTUALE
# ╚═══════════════════════════════════════╝
if [ ! -d "$VENV_DIR" ]; then
    echo "⚙ Creo ambiente virtuale…"
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
$PIP install --upgrade pip >/dev/null

REQUIRED_PACKAGES=(fastapi uvicorn pandas openpyxl python-multipart weasyprint python-docx)
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    $PYTHON -m pip show "$pkg" >/dev/null 2>&1 || $PIP install "$pkg"
done


# ╔═══════════════════════════════════════╗
# 5️⃣ FRONTEND (npm install + Tailwind + PostCSS obbligatori)
# ╚═══════════════════════════════════════╝
echo ""
echo "🔍 Controllo dipendenze frontend (npm)…"
cd "$FRONTEND_DIR" || exit

echo "📦 npm install…"
npm install

echo "📦 npm install -D tailwindcss postcss autoprefixer…"
npm install -D tailwindcss postcss autoprefixer

cd "$PROJECT_DIR" || exit


# ╔═══════════════════════════════════════╗
# 5️⃣bis PERMESSI CARTELLE DB (app / app/data / *.db)
# ╚═══════════════════════════════════════╝
echo ""
echo "🔐 Sistemazione permessi cartelle DB…"

mkdir -p "$DATA_DIR"

chmod 755 "$APP_DIR" "$DATA_DIR" 2>/dev/null || true
chmod 644 "$DATA_DIR"/*.db 2>/dev/null || true

echo "✔ Permessi app/data sistemati (755 + 644 sui .db)."


# ╔═══════════════════════════════════════╗
# 6️⃣ DATABASE VINI / FOODCOST
# ╚═══════════════════════════════════════╝
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
  echo "🧱 Creo foodcost.db…"
  $PYTHON - <<'EOF'
from app.models.foodcost_db import init_foodcost_db
init_foodcost_db()
EOF
else
  echo "✔ foodcost.db presente."
fi


# ╔═══════════════════════════════════════╗
# 7️⃣ AVVIO BACKEND + FRONTEND
# ╚═══════════════════════════════════════╝
kill -9 $(lsof -ti :8000) 2>/dev/null
kill -9 $(lsof -ti :5173) 2>/dev/null

osascript -e "tell application \"Terminal\" to do script \"cd $PROJECT_DIR && source venv/bin/activate && uvicorn main:app --reload\""
osascript -e "tell application \"Terminal\" to do script \"cd $FRONTEND_DIR && npm run dev\""

sleep 3
open "http://localhost:5173/"
open "http://127.0.0.1:8000/docs"

echo ""
echo "🎉 Tutto pronto! — TRGB Gestionale"