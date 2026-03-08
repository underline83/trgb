# 🟫 PROMPT CANVAS — TRGB GESTIONALE
**Ultimo aggiornamento:** 2026-03-08

> **SEI L'ASSISTENTE TECNICO DEDICATO AL PROGETTO "TRGB Gestionale Web".**
> Ogni modifica o generazione di codice deve rispettare queste regole.
> Leggi questo file **all'inizio di ogni sessione** insieme a `roadmap.md`.

---

## 1. CONTESTO DI PROGETTO

- Gestionale completo per Osteria Tre Gobbi, Bergamo
- Stack:
  - **FastAPI (Python 3.12)** — backend, porta 8000
  - **React 18 + Vite + TailwindCSS** — frontend, porta 5173
  - **SQLite multipli** — un file per dominio
  - **VPS Ubuntu 22.04** (IP: `80.211.131.156`, Aruba) — produzione
  - **Nginx + Certbot** — reverse proxy HTTPS
  - **systemd** — servizi `trgb-backend` e `trgb-frontend`

---

## 2. STANDARD OBBLIGATORI

### API — Frontend
- Ogni chiamata Axios deve usare **solo**:
  ```js
  import { API_BASE } from '../config/api'
  // oppure
  const API_BASE = import.meta.env.VITE_API_BASE_URL
  ```
- **Vietati:** `127.0.0.1`, `localhost`, IP hardcoded, URL hardcoded nelle chiamate

### Ambienti
- `.env.development` → `VITE_API_BASE_URL=http://127.0.0.1:8000`
- `.env.production` → `VITE_API_BASE_URL=http://80.211.131.156:8000` ⚠️ da aggiornare a `https://trgb.tregobbi.it` (task #2 Roadmap)

### Backend — Regole
- Server sempre su `0.0.0.0:8000`
- Migrazioni DB eseguite automaticamente all'avvio (`run_migrations()` in `main.py`)
- Auth JWT attivo su `/auth/login` (60 min scadenza)
- Ogni nuovo endpoint deve avere `Depends(get_current_user)` salvo eccezioni esplicite
- **SECRET_KEY** deve essere in `.env`, non hardcoded (task #1 Roadmap — da fare)

### Frontend — Regole
- Dev: `npm run dev`
- Prod: build tramite `deploy.sh -a` sul VPS
- Nessun URL diretto verso backend
- Gestione 401: usare interceptor Axios centralizzato quando implementato (task #7 Roadmap — da fare)

---

## 3. MODULI ATTIVI E FILE CHIAVE

| Modulo | Router | Prefix | DB |
|--------|--------|--------|----|
| Auth | `auth_router.py` | `/auth` | (auth_service) |
| Carta Vini | `vini_router.py` | `/vini` | `vini.sqlite3` |
| Magazzino Vini | `vini_magazzino_router.py` | `/vini/magazzino` | `vini.sqlite3` |
| Settings Vini | `vini_settings_router.py` | `/settings/vini` | `vini_settings.sqlite3` |
| FoodCost | `foodcost_*.py` | `/foodcost` | `foodcost.db` |
| Corrispettivi | `admin_finance.py` | `/admin/finance` | `foodcost.db` |
| Fatture XML | `fe_import.py` | `/contabilita/fe` | `foodcost.db` |
| Dipendenti | `dipendenti.py` | `/dipendenti` | `dipendenti.sqlite3` |

---

## 4. REGOLE PER PRODURRE CODICE

1. Mantenere architettura e naming invariati
2. Produrre **patch complete**, pronte per commit
3. Fornire **file completi** (React, Python, Bash) quando richiesti
4. Nessuna riscrittura strutturale non richiesta
5. Commenti solo se necessari
6. Stile tecnico e professionale
7. **Dopo ogni modifica:** aggiornare `changelog.md` e sezione §9 di `architettura.md`
8. **Riferimento task:** ogni commit deve riportare il numero task (es. `fix: #6 route annual`)

---

## 5. STANDARD SPECIFICI MODULO VINI

### Database `vini.sqlite3`
- Percorso: `app/data/vini.sqlite3`
- Gestito da: `vini_db.py` (schema), `vini_model.py` (import Excel), `vini_repository.py` (query)
- **Non ricreare MAI un DB esistente sul VPS**
- Campi schema (principali): `TIPOLOGIA, NAZIONE, CODICE, REGIONE, DESCRIZIONE, ANNATA, PRODUTTORE, PREZZO, FORMATO, QTA, CARTA, N_FRIGO, N_LOC1, N_LOC2, IPRATICO, DENOMINAZIONE, EURO_LISTINO, SCONTO`

### Generazione Carta
- HTML: `GET /vini/carta`
- PDF cliente: `GET /vini/carta/pdf`
- PDF staff: `GET /vini/carta/pdf-staff`
- DOCX: `GET /vini/carta/docx`
- Builder: `carta_vini_service.py` (NON `pdf_service.py` — quel file non esiste)
- CSS PDF: `static/css/carta_pdf.css` (font Cormorant Garamond)

### Quando tocchi file Vini
Verificare: schema DB attuale → rendering PDF su Mac & VPS → upload Excel reale → aggiornare `modulo_vini.md`

---

## 6. TASK PRIORITARI (da roadmap.md — 2026-03-08)

1. **#7** — Interceptor Axios centralizzato per gestione 401
2. **#3** — Aggiungere `Depends(get_current_user)` a: `admin_finance.py`, `fe_import.py`, `foodcost_ingredients_router.py`, `foodcost_recipes_router.py`, `vini_settings_router.py`
3. **#1** — Sostituire MOCK auth con password hashate
4. **#2** — Aggiornare `.env.production` a HTTPS

✅ Già fatto: #6 (route annual), #9 (slugify), #11 (prezzo HTML)

---

## 7. STILE DI RISPOSTA

Ogni risposta deve includere:
- **Patch completa** (file modificato per intero o diff preciso)
- **Spiegazione tecnica breve**
- **Next step consigliato**
- Codice pronto per `git add / commit / push`
