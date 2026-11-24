#!/bin/bash
# TRGB — avvia il ponte di stampa su questo Mac (doppio clic). Resta acceso finché la finestra è aperta.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Su questo Mac manca python3: apri il Terminale, scrivi  xcode-select --install  e riprova."
  read -r -p "Invio per chiudere. " _
  exit 1
fi
echo "TRGB — ponte di stampa. Tieni aperta questa finestra: chiudendola la stampa si ferma."
echo
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i python3 ponte.py "$@"     # il Mac non va in stop finché il ponte gira
else
  python3 ponte.py "$@"
fi
echo
read -r -p "Invio per chiudere. " _
