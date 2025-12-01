TRGB Gestionale — README

Versione iniziale (Bozza)

Questo documento descrive in modo chiaro e completo l’architettura, la logica e le procedure operative del progetto TRGB Gestionale.

1. Panoramica del progetto

TRGB Gestionale è un sistema completo sviluppato per l’Osteria Tre Gobbi. È composto da:
	•	Backend FastAPI (Python)
	•	Frontend React + Vite (JavaScript)
	•	Database SQLite per vini, impostazioni, foodcost
	•	Script di avvio e deploy sia per ambiente locale che VPS
	•	Ambienti .env separati per sviluppo e produzione

Il progetto consente di gestire:
	•	Carta dei vini (anteprima, PDF, Word)
	•	Database vini (import Excel)
	•	Impostazioni carta vini (tipologie, nazioni, regioni, filtri)
	•	Gestione ingredienti
	•	Storico prezzi ingredienti
	•	Creazione e gestione ricette collegate agli ingredienti

2. Architettura delle cartelle

Struttura principale:

trgb/
├── trgb/                  ← codice backend + frontend
│   ├── app/               ← backend FastAPI
│   │   ├── routers/
│   │   ├── models/
│   │   ├── data/          ← database SQLite
│   │   ├── core/
│   │   └── ...
│   ├── frontend/          ← progetto React (Vite)
│   │   ├── src/
│   │   ├── .env.development
│   │   ├── .env.production
│   │   └── ...
│   ├── run_server.py      ← avvio locale backend + frontend
│   ├── run_frontend_vps.sh
│   ├── run_server_vps.sh
│   └── update_vps.sh
└── venv-trgb/             ← virtualenv Python

3. Configurazione degli .env

Sviluppo locale (frontend/.env.development)

VITE_API_BASE_URL=http://127.0.0.1:8000

Produzione VPS (frontend/.env.production)

VITE_API_BASE_URL=http://80.211.131.156:8000

Il frontend usa automaticamente il file .env corretto in base al flag Vite:
	•	npm run dev → usa .env.development
	•	npm run build → usa .env.production

4. Avvio in locale (Mac)

1) Attiva la venv

source ~/trgb/venv-trgb/bin/activate

2) Avvia backend + frontend

python3 run_server.py

Backend → http://127.0.0.1:8000
Frontend → http://127.0.0.1:5173

5. Deploy su VPS

1) Connettersi alla VPS

ssh marco@80.211.131.156

2) Aggiornare il repository

cd ~/trgb/trgb
git pull

3) Avvio server backend

./run_server_vps.sh

Lo script:
	•	attiva la venv
	•	installa requirements
	•	crea DB mancanti
	•	uccide eventuali processi sulla porta 8000
	•	avvia uvicorn

4) Avvio frontend in modalità VPS

./run_frontend_vps.sh

Avvia Vite su

http://80.211.131.156:5173

6. Comandi utili Git

Per salvare modifiche locali:

git add .
git commit -m "update"
git push

Per aggiornare la VPS:

cd ~/trgb/trgb
git pull

7. Convenzioni di sviluppo
	•	Tutte le chiamate API nella UI non devono mai contenere IP o localhost hardcoded
	•	Usare sempre import.meta.env.VITE_API_BASE_URL
	•	Mettere @version: a inizio file per tracciamento
	•	Script VPS devono sempre:
	•	verificare venv
	•	pulire porta 8000 prima di avviare uvicorn

8. Troubleshooting

Errore: porta 8000 occupata

sudo lsof -ti:8000
sudo kill -9 <pid>

Oppure lo risolve automaticamente run_server_vps.sh.

Login non funziona

Quasi sempre causato da URL API sbagliato.
Controllare i file .env.

Frontend “vede” ancora vecchio API URL

Serve ricostruire:

npm run build

9. Roadmap / Cose da fare (iniziale)
	•	Rifinire README avanzato
	•	Unificare login su auth_router
	•	Migrare tutte le path API a variabili env
	•	Configurare NGINX su VPS
	•	Stabilizzare sistema recipe + PDF

## 10. Sistema Vini — Architettura Completa

Il modulo **Vini** è una componente centrale del gestionale TRGB.  
Si occupa di:
- importare e normalizzare un Excel
- salvare i dati in SQLite
- gestire ordinamenti e filtri tramite DB dedicato
- generare Carta dei Vini in HTML, PDF e DOCX

Questa sezione documenta l’intero flusso tecnico.

---

## 10.1 Database vini — `vini.sqlite3`

Percorso: `app/data/vini.sqlite3`

Contiene la tabella `vini` con il seguente schema:

| Campo | Tipo |
|-------|------|
| id | INTEGER PK |
| TIPOLOGIA | TEXT |
| NAZIONE | TEXT |
| CODICE | TEXT |
| REGIONE | TEXT |
| CARTA | TEXT ('SI'/'NO') |
| DESCRIZIONE | TEXT |
| ANNATA | TEXT |
| PRODUTTORE | TEXT |
| PREZZO | REAL |
| FORMATO | TEXT |
| N_FRIGO | INTEGER |
| N_LOC1 | INTEGER |
| N_LOC2 | INTEGER |
| QTA | INTEGER |
| IPRATICO | TEXT |
| DENOMINAZIONE | TEXT |
| FRIGORIFERO | TEXT |
| LOCAZIONE_1 | TEXT |
| LOCAZIONE_2 | TEXT |
| DISTRIBUTORE | TEXT |
| EURO_LISTINO | REAL |
| SCONTO | REAL |

Creazione DB gestita da:  
`app/models/vini_db.py`  
Funzioni:
- `get_connection()`
- `init_database()`

---

## 10.2 Database impostazioni carta — `vini_settings.sqlite3`

Percorso: `app/data/vini_settings.sqlite3`

Tabelle principali:
- `tipologia_order` (ordine categorie)
- `nazioni_order`  
- `regioni_order`  
- `filtri_carta`:
  - min_qta_stampa
  - mostra_negativi
  - mostra_senza_prezzo

Inizializzazione schema:  
`app/models/settings_db.py`

Valori predefiniti e liste regioni/nazioni/tipologie:  
`app/models/vini_settings.py`

---

## 10.3 Import Excel — Normalizzazione + Inserimento

Endpoint upload:

```
POST /vini/upload
```

Logica completa in:

- `normalize_dataframe()`  
- `clear_vini_table()`  
- `insert_vini_rows()`

File: `app/models/vini_model.py`

Flusso:
1. Legge Excel → foglio “VINI”
2. Normalizza intestazioni + valori
3. Convalida tipologie e formati
4. Ripulisce tabella vini
5. Inserisce tutte le righe
6. Genera statistiche per tipologia

Output dell’endpoint:
- righe totali
- righe inserite
- errori (max 100)

---

## 10.4 Repository — Ordinamenti e Filtri

Logica carta vini:  
`app/repositories/vini_repository.py`

Funzione centrale:

### `load_vini_ordinati()`

Restituisce la carta completa già:
- filtrata
- ordinata
- pronta per HTML / PDF / DOCX

Ordine applicato:
1. Tipologia
2. Nazione
3. Regione (codice)
4. Produttore
5. Descrizione
6. Annata

Filtri applicati dinamicamente:
- quantità minima (`min_qta_stampa`)
- mostra negativi
- mostra senza prezzo

---

## 10.5 Router FastAPI — `vini_router.py`

### Endpoints principali:

#### Upload Excel
```
POST /vini/upload
```

#### Anteprima HTML carta vini
```
GET /vini/carta
```

#### PDF Cliente
```
GET /vini/carta/pdf
```

#### PDF Staff
```
GET /vini/carta/pdf-staff
```

#### DOCX
```
GET /vini/carta/docx
```

Il router usa:
- `load_vini_ordinati()` per i dati
- `WeasyPrint` per i PDF
- `python-docx` per Word

---

## 10.6 CSS carta vini — PDF (WeasyPrint)

Percorso:  
`static/css/carta_pdf.css`

Caratteristiche:
- font Cormorant Garamond integrati in `static/fonts` + fallback Linux `/usr/local/share/fonts/tre_gobbi`
- compatibilità Mac + Linux VPS
- frontespizio completo
- indice
- paginazione automatica
- layout produttore anti-spezzatura
- separazione tipologie / regioni / produttori
- numerazione pagina esclusa dalla prima

---

## 10.7 Deploy e integrazione su VPS

Lo script:

```
run_server_vps.sh
```

fa automaticamente:
- attiva venv
- installa requirements
- crea DB mancanti
- inizializza `vini_settings.sqlite3`
- aggiorna schema `vini.sqlite3`
- avvia uvicorn su 0.0.0.0:8000

Il sistema Vini è quindi totalmente integrato nell’avvio VPS.

---

## 10.8 Troubleshooting modulo Vini

**Carte vuote:**  
- DB vuoto  
- tutti i vini hanno CARTA=NO  
- PREZZO nullo + filtro `mostra_senza_prezzo=0`

**PDF senza font corretti:**  
- font non installati in `/usr/local/share/fonts/tre_gobbi`  
- ricostruire cache:
  ```
  sudo fc-cache -f -v
  ```

**Import Excel fallisce:**  
- colonne non riconosciute  
- formati non validi  
- tipologie con nomi non standard

---

## 10.9 Flusso completo Carta Vini

1. Aprire Excel “VINI”
2. Caricare via `/vini/upload`
3. Dati salvati in `vini.sqlite3`
4. Filtri/ordinamenti presi da `vini_settings.sqlite3`
5. `load_vini_ordinati()` genera dataset finale
6. Router crea:
   - HTML
   - PDF cliente
   - PDF staff
   - DOCX

---

## 10.10 Roadmap Vini

- Versione avanzata PDF Staff (prezzi nascosti, note interne)
- Drag & drop ordinamenti da UI
- Ricerca e filtri dinamici nel frontend
- Rilettura Excel con anteprima validazioni
⸻

Questo README è una base stabile e potrà essere esteso in base ai prossimi sviluppi.