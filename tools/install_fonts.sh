#!/bin/bash
# ============================================================
# TRGB — Installazione Font Locali per PDF (Cormorant + Inter)
# ============================================================

FONT_DIR="/Volumes/Underline/trgb_web/app/static/fonts"
mkdir -p "$FONT_DIR"

echo "📚 Installazione font nella cartella:"
echo "   $FONT_DIR"
echo ""

download_font() {
    local url="$1"
    local output="$2"
    if [ ! -f "$output" ]; then
        echo "⬇️  Scarico $(basename "$output")"
        curl -L -o "$output" "$url"
    else
        echo "✔ Già presente: $(basename "$output")"
    fi
}

echo "👉 Installo Cormorant Garamond"
download_font "https://fonts.gstatic.com/s/cormorantgaramond/v14/0FlVVOGfFVBkM8fIpY4nueTuN3z55m5O.woff2" \
              "$FONT_DIR/CormorantGaramond-Regular.woff2"
download_font "https://fonts.gstatic.com/s/cormorantgaramond/v14/0FlUVOGfFVBkM8fIpY4nueTuN3z59r5uA.woff2" \
              "$FONT_DIR/CormorantGaramond-Medium.woff2"
download_font "https://fonts.gstatic.com/s/cormorantgaramond/v14/0FlUVOGfFVBkM8fIpY4nueTuN3z59v5gA.woff2" \
              "$FONT_DIR/CormorantGaramond-Bold.woff2"

echo ""
echo "👉 Installo Inter"
download_font "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK4dq8S4-UDXZXQ.woff2" \
              "$FONT_DIR/Inter-Regular.woff2"
download_font "https://fonts.gstatic.com/s/inter/v12/UcCM3FwrK4dq8S4-UDz6RA.woff2" \
              "$FONT_DIR/Inter-SemiBold.woff2"

echo ""
echo "🎉 Font installati correttamente!"