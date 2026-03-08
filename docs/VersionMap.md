# 🧩 Version Map — TRGB Gestionale
**Ultimo aggiornamento:** 2026-03-08

```
TRGB Gestionale — Version Summary

Master Version ................. 2026.03.08
Core Backend ................... v1.8.0
Core Frontend .................. v1.4.0

Modulo Vini (Carta) ............ v2025.12.01  — stabile
Modulo Magazzino Vini ......... v2025.12.03  — stabile
Modulo Corrispettivi ........... v2026.01.01  — operativo
Modulo Fatture XML ............. v2025.12.05  — operativo (Fase 2 in roadmap)
Modulo FoodCost ................ v2025.11.28  — in sviluppo
Modulo Dipendenti .............. v2025.12.01  — operativo

DB vini.sqlite3 ................ v2.1
DB vini_settings.sqlite3 ....... v1.4
DB foodcost.db ................. v1.6  (migrazioni 001–005 applicate)
DB dipendenti.sqlite3 .......... v1.0  (creato a runtime)

deploy.sh ...................... v2.0.0
Nginx Config .................... v1.3.4
systemd backend ................ v1.1.0
systemd frontend ............... v1.0.2
```

---

# Dipendenze Python principali

| Pacchetto | Versione | Uso |
|-----------|----------|-----|
| fastapi | ~0.115 | Framework backend |
| uvicorn | ~0.32 | ASGI server |
| python-jose | ~3.3 | JWT |
| passlib | ~1.7 | Password hashing (sha256_crypt) |
| python-multipart | ~0.0.20 | Upload file |
| openpyxl | ~3.1 | Import Excel .xlsx |
| pyxlsb | ~1.0 | Import Excel .xlsb |
| weasyprint | ~62 | Generazione PDF |
| python-docx | ~1.1 | Generazione DOCX |

# Dipendenze npm principali

| Pacchetto | Versione | Uso |
|-----------|----------|-----|
| react | ^18.2 | UI Framework |
| react-router-dom | ^7.9 | Routing |
| axios | ^1.6 | HTTP client |
| recharts | ^3.6 | Grafici dashboard |
| tailwindcss | ^3.4 | Styling |
| @hello-pangea/dnd | ^18.0 | Drag & drop (pianificato) |
| vite | ^5.0 | Build tool |
