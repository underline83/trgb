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

⸻

Questo README è una base stabile e potrà essere esteso in base ai prossimi sviluppi.