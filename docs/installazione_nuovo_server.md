# Le cose da fare — Installazione nuovo server

> **Scopo:** runbook passo-passo per installare TRGB Gestionale su un nuovo VPS,
> dal momento in cui hai un server Linux nudo fino a un'osteria/ristorante che
> usa il sistema in produzione con backup attivi.
>
> **Quando usarlo:**
> - Vendi una licenza TRGB a un nuovo cliente (es. ristorante "X")
> - Devi rifare il VPS dell'osteria Tre Gobbi (disastro, migrazione provider)
> - Stai onboarding un cliente in trial
>
> **Tempo stimato:** 60-90 min con esperienza, 2-3 ore prima volta.
>
> **Convenzioni:**
> - `<LOCALE>` = id del locale (es. `tregobbi`, `ristorante_x`)
> - `<DOMAIN>` = dominio del cliente (es. `trgb.tregobbi.it`, `app.ristorantex.it`)
> - `<USER>` = utente Linux che gestirà il deploy (es. `marco`, `cliente`)

---

## 0. Prerequisiti

Prima di iniziare, devi avere:
- [ ] **VPS Linux Ubuntu 22.04 o superiore** (consigliato Aruba Cloud €5-10/mese,
      2 vCPU, 2GB RAM, 40GB SSD — sufficienti per ristorante medio)
- [ ] **Dominio già acquistato** e con DNS A che punta all'IP del VPS
- [ ] **Account Google** del cliente per Drive backup (o account aziendale tuo)
- [ ] **Email del cliente** per certificato Let's Encrypt
- [ ] **Decisione su `<LOCALE>` id**: minuscolo, no spazi, no accenti
      (es. `tregobbi`, `osteriadelporto`, `ristorante_x`)
- [ ] **Branding cliente**: logo SVG/PNG, palette colori, nome esteso, indirizzo
- [ ] **Lista moduli da attivare** (vini, ricette, acquisti, prenotazioni, ecc.
      vedi `docs/refactor_monorepo.md` §3 R8 per i 13 moduli)

---

## 1. Setup VPS base

### 1.1 SSH iniziale e creazione utente
```bash
# Da Mac/PC, primo accesso come root con password fornita da provider
ssh root@<IP_VPS>

# Creo utente <USER> e gli do sudo
adduser <USER>
usermod -aG sudo <USER>

# Disabilito login root via SSH (sicurezza)
sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# Disconnetti, riconnetti come <USER>
exit
```

### 1.2 Setup chiave SSH dal Mac
```bash
# Su Mac
ssh-keygen -t ed25519 -C "trgb-<LOCALE>" -f ~/.ssh/trgb_<LOCALE>
ssh-copy-id -i ~/.ssh/trgb_<LOCALE>.pub <USER>@<IP_VPS>

# Aggiungo alias in ~/.ssh/config
cat >> ~/.ssh/config << EOF

Host trgb_<LOCALE>
    HostName <IP_VPS>
    User <USER>
    IdentityFile ~/.ssh/trgb_<LOCALE>
EOF

# Test
ssh trgb_<LOCALE> "hostname"
```

### 1.3 Hostname server (opzionale ma consigliato)
```bash
sudo hostnamectl set-hostname trgb-<LOCALE>
```

---

## 2. Dependencies sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  python3.12 python3.12-venv python3-pip \
  nodejs npm \
  nginx \
  sqlite3 \
  git curl wget unzip jq \
  rclone \
  certbot python3-certbot-nginx \
  cron logrotate awk
```

### 2.1 Verifica versioni minime
```bash
python3 --version  # >= 3.12
node --version     # >= 18
sqlite3 --version  # >= 3.37
nginx -v
rclone version
```

---

## 3. Setup repo TRGB

### 3.1 Clone (locale: working copy)
```bash
cd ~
mkdir trgb && cd trgb
# Clone da GitHub (o da repo bare se hai uno specchio interno)
git clone https://github.com/<TUO_ORG>/trgb.git
# Risultato: ~/trgb/trgb/ (notare doppio "trgb": ~/trgb è la dir di lavoro,
# ~/trgb/trgb è il repo)
```

### 3.2 Venv Python
```bash
cd ~/trgb
python3.12 -m venv venv-trgb
source venv-trgb/bin/activate
pip install --upgrade pip
pip install -r trgb/requirements.txt
deactivate
```

### 3.3 Build frontend
```bash
cd ~/trgb/trgb/frontend
npm install
npm run build
# Output in dist/, servito da nginx
```

---

## 4. Setup locale del cliente

### 4.1 Copia template
```bash
cd ~/trgb/trgb
cp -r locali/_template locali/<LOCALE>
```

### 4.2 Editare i file di config locale

**`locali/<LOCALE>/deploy/env.production`** — punto di accesso del push.sh:
```bash
VPS_HOST=trgb_<LOCALE>          # alias SSH del Mac di chi pusha
VPS_DIR=/home/<USER>/trgb/trgb
VENV=/home/<USER>/trgb/venv-trgb

TRGB_LOCALE=<LOCALE>
DOMAIN=<DOMAIN>
PROBE_URL=https://<DOMAIN>/

BACKEND_SERVICE=trgb-backend
FRONTEND_SERVICE=trgb-frontend
BACKEND_PORT=8000

TRGB_UPLOADS_DIR=/home/<USER>/trgb_uploads
```

**`locali/<LOCALE>/branding.json`** — identità visiva:
```json
{
  "name": "Ristorante X",
  "short_name": "X",
  "domain": "<DOMAIN>",
  "owner_name": "Nome Proprietario",
  "owner_email": "...",
  "primary_color": "#E8402B",
  "secondary_color": "#2EB872",
  "accent_color": "#2E7BE8",
  "background_color": "#F4F1EC",
  "logo_url": "/locale/assets/logo.svg",
  "favicon_url": "/locale/assets/favicon.png"
}
```

**`locali/<LOCALE>/strings.json`** — testi italiani specifici (insegna, header, ecc.):
```json
{
  "header.title": "Ristorante X",
  "login.welcome": "Benvenuto in Ristorante X",
  "footer.signature": "© Ristorante X 2026"
}
```

**`locali/<LOCALE>/locale.json`** — metadata:
```json
{
  "id": "<LOCALE>",
  "name": "Ristorante X",
  "country": "IT",
  "timezone": "Europe/Rome",
  "currency": "EUR",
  "language": "it"
}
```

**`locali/<LOCALE>/moduli_attivi.json`** — feature flags (R8):
```json
{
  "modules": ["vini", "prenotazioni", "menu_carta", "cassa"],
  "platform_extras": ["notifiche", "alert", "calendar"]
}
```

### 4.3 Asset cliente
```bash
mkdir -p locali/<LOCALE>/assets
# Copia da computer:
scp logo.svg favicon.png trgb_<LOCALE>:/home/<USER>/trgb/trgb/locali/<LOCALE>/assets/
```

### 4.4 Init DB
```bash
cd ~/trgb/trgb
mkdir -p locali/<LOCALE>/data
TRGB_LOCALE=<LOCALE> ~/trgb/venv-trgb/bin/python -c "
from app.migrations.migration_runner import run_migrations
run_migrations()
"
# Verifica
ls -la locali/<LOCALE>/data/
sqlite3 locali/<LOCALE>/data/foodcost.db ".tables"
```

---

## 5. Systemd services

### 5.1 Backend
```bash
sudo tee /etc/systemd/system/trgb-backend.service > /dev/null << EOF
[Unit]
Description=TRGB Backend (FastAPI uvicorn) — locale <LOCALE>
After=network.target

[Service]
Type=simple
User=<USER>
WorkingDirectory=/home/<USER>/trgb/trgb
Environment="PYTHONPATH=/home/<USER>/trgb/trgb"
Environment="TRGB_LOCALE=<LOCALE>"
ExecStart=/home/<USER>/trgb/venv-trgb/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

### 5.2 Frontend (nginx-served, ma se usi vite preview anche un service per quello)
Vedi sezione 6 nginx — frontend viene servito da nginx come static files da `dist/`,
non serve un service systemd a meno che non vuoi vite dev server (sconsigliato in prod).

### 5.3 Avvio
```bash
sudo systemctl daemon-reload
sudo systemctl enable trgb-backend
sudo systemctl start trgb-backend
sudo systemctl status trgb-backend
# Logs:
sudo journalctl -u trgb-backend -f
```

---

## 6. Nginx + SSL

### 6.1 Vhost nginx
```bash
sudo tee /etc/nginx/sites-available/trgb-<LOCALE> > /dev/null << 'EOF'
server {
    listen 80;
    server_name <DOMAIN>;

    # Frontend statico
    root /home/<USER>/trgb/trgb/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API → backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Endpoint locale (branding/strings) → backend
    location /locale/ {
        proxy_pass http://127.0.0.1:8000/locale/;
        proxy_set_header Host $host;
    }

    # Carta vini pubblica
    location /carta {
        proxy_pass http://127.0.0.1:8000/carta;
        proxy_set_header Host $host;
    }

    # Limite upload (per import file)
    client_max_body_size 50M;
}
EOF

sudo ln -s /etc/nginx/sites-available/trgb-<LOCALE> /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.2 SSL Let's Encrypt
```bash
sudo certbot --nginx -d <DOMAIN> --email <EMAIL_CLIENTE> --agree-tos --non-interactive
# Verifica auto-renewal
sudo systemctl status certbot.timer
```

---

## 7. Setup git remote VPS (per push.sh)

Il push.sh dal Mac fa `git push origin main` verso un repo bare sul VPS, che ha
un hook post-receive che fa il deploy.

### 7.1 Repo bare
```bash
mkdir -p /home/<USER>/trgb/repo.git
cd /home/<USER>/trgb/repo.git
git init --bare
```

### 7.2 Hook post-receive
```bash
cat > hooks/post-receive << 'EOF'
#!/bin/bash
set -e
TARGET=/home/<USER>/trgb/trgb
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo ""
echo "[$TIMESTAMP] 🚀 Push ricevuto — avvio deploy..."
echo "▶ Aggiornamento codice..."
cd $TARGET
git --git-dir=$TARGET/.git --work-tree=$TARGET fetch /home/<USER>/trgb/repo.git main
git --git-dir=$TARGET/.git --work-tree=$TARGET reset --hard FETCH_HEAD

# pip install solo se requirements.txt è cambiato
if git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -q requirements.txt; then
    echo "▶ pip install (requirements modificato)..."
    /home/<USER>/trgb/venv-trgb/bin/pip install -r requirements.txt -q
else
    echo "▶ pip install — nessuna modifica, salto."
fi

# npm + build solo se frontend modificato
if git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -q '^frontend/'; then
    echo "▶ npm install + build (frontend modificato)..."
    cd $TARGET/frontend
    npm install --silent
    npm run build
else
    echo "▶ npm install — nessuna modifica, salto."
fi

# Restart servizi (sempre, sicurezza)
echo "▶ Restart servizi..."
sudo systemctl restart trgb-backend
echo "✅ Deploy completato."
EOF
chmod +x /home/<USER>/trgb/repo.git/hooks/post-receive
```

### 7.3 Sudo NOPASSWD per restart (necessario per hook)
```bash
sudo tee /etc/sudoers.d/trgb-<LOCALE> > /dev/null << EOF
<USER> ALL=(ALL) NOPASSWD: /bin/systemctl restart trgb-backend
<USER> ALL=(ALL) NOPASSWD: /bin/systemctl restart trgb-frontend
EOF
sudo chmod 440 /etc/sudoers.d/trgb-<LOCALE>
```

### 7.4 Setup git remote sul Mac
```bash
# Su Mac (cartella locale del repo)
cd ~/trgb_<LOCALE>  # se hai una working copy locale
git remote add origin <USER>@<IP_VPS>:/home/<USER>/trgb/repo.git
git push origin main
```

---

## 8. SETUP BACKUP — il pezzo che ci ha salvato

### 8.1 rclone Drive
```bash
# Setup interattivo (richiede browser per OAuth Google)
rclone config
# Seguire wizard: nuovo remote, scegliere "drive", autenticare
# Nome remote: gdrive
```

**Account Google da usare:**
- Per Tre Gobbi (riferimento): `osteriatregobbi@gmail.com` (account dedicato).
- Per nuovi clienti: **creare sempre un account Gmail DEDICATO al locale**
  (es. `osteria<NOME>@gmail.com`, `ristorante<NOME>@gmail.com`).
- **NON usare l'account personale del cliente** — l'account è proprietà del
  backup, va consegnato al cliente come parte della licenza.
- 15 GB free su Gmail sono sufficienti per anni di backup di un ristorante medio
  (~30 MB / sync × 2 sync × 365 giorni = ~22 GB/anno se non si fa retention; con
  rotazione 14 cartelle daily si resta sotto i 5 GB stabili).

**Annotare credenziali** in vault sicuro (1Password/Bitwarden) come:
- Voce: `Drive backup TRGB — <NOME LOCALE>`
- Email: `<email>@gmail.com`
- Password: `<scelta>`
- 2FA: ATTIVARE OBBLIGATORIAMENTE
- Note: account usato per `rclone config` su VPS, NON usare per altre cose

Verifica:
```bash
rclone ls gdrive: 2>&1 | head -5
rclone about gdrive:
# Email associata (estrae da access token):
TOKEN=$(grep -oP '"access_token":"[^"]+' ~/.config/rclone/rclone.conf | cut -d'"' -f4)
curl -s "https://www.googleapis.com/oauth2/v3/userinfo?access_token=$TOKEN"
```

### 8.2 Permessi rclone.conf
```bash
chown -R <USER>:<USER> /home/<USER>/.config/rclone/
chmod 600 /home/<USER>/.config/rclone/rclone.conf
```

### 8.3 Crea cartelle backup su Drive
```bash
rclone mkdir gdrive:TRGB-Backup
rclone mkdir gdrive:TRGB-Backup/db-daily
rclone mkdir gdrive:TRGB-Backup-lkg
rclone mkdir gdrive:TRGB-Backup-runbook
```

### 8.4 Cron — IL PEZZO CRITICO
**(post-incidente 4 mag 2026: 2 sync/giorno alle 03:00 e 18:00 + watchdog 30 min)**

```bash
crontab -l > /tmp/cron_old.txt 2>/dev/null
cat > /tmp/cron_new.txt << 'EOF'
# TRGB backup orario (rotazione 10 ultimi per DB, NO Drive)
0 * * * * /home/<USER>/trgb/trgb/scripts/backup_db.sh >> /home/<USER>/trgb/backup.log 2>&1

# TRGB backup daily — 03:00 (osteria chiusa) + Drive sync
0 3 * * * /home/<USER>/trgb/trgb/scripts/backup_db.sh --daily >> /home/<USER>/trgb/backup.log 2>&1

# TRGB backup daily — 18:00 (tra fine pranzo 16 e inizio cena 19:30) + Drive sync
0 18 * * * /home/<USER>/trgb/trgb/scripts/backup_db.sh --daily >> /home/<USER>/trgb/backup.log 2>&1

# TRGB health check ogni 30 min — alarm via M.A se backup non gira
*/30 * * * * /home/<USER>/trgb/trgb/scripts/check_backup_health.sh >> /home/<USER>/trgb/backup_health.log 2>&1
EOF
crontab /tmp/cron_new.txt
crontab -l
```

**Importante**: gli orari `03:00` e `18:00` di default sono pensati per Tre Gobbi
(osteria chiusa di notte, finestra morta tra 16 e 19:30). **Aggiustali per ogni cliente**
in base ai loro orari di apertura. Esempio per ristorante con servizio continuato:
trovare 2 finestre di 5+ min senza scritture (tipicamente 04:00 e 16:00).

### 8.5 Permessi script
```bash
chmod +x /home/<USER>/trgb/trgb/scripts/backup_db.sh
chmod +x /home/<USER>/trgb/trgb/scripts/check_backup_health.sh
```

### 8.6 Test manuale
```bash
# Hourly (no Drive)
/home/<USER>/trgb/trgb/scripts/backup_db.sh

# Daily (con Drive — verifica che il sync arrivi a destinazione)
/home/<USER>/trgb/trgb/scripts/backup_db.sh --daily

# Health
/home/<USER>/trgb/trgb/scripts/check_backup_health.sh

# Verifica su Drive
rclone ls gdrive:TRGB-Backup-lkg/
```

---

## 9. Setup utente admin iniziale

Al primo boot, il backend crea un utente `admin` di emergenza con PIN random
stampato sul log. Per evitarlo, crealo a mano:

```bash
cd /home/<USER>/trgb/trgb
HASH=$(/home/<USER>/trgb/venv-trgb/bin/python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['sha256_crypt']).hash('1234'))")
mkdir -p locali/<LOCALE>/data

cat > locali/<LOCALE>/data/users.json << EOF
[
  {
    "username": "admin",
    "display_name": "Admin",
    "password_hash": "$HASH",
    "role": "superadmin"
  }
]
EOF
```

Poi il cliente entra con `admin` / `1234`, cambia PIN, e crea gli utenti staff
dall'app (Impostazioni → Utenti).

---

## 10. Smoke test end-to-end

```bash
# Backend up
curl -sI https://<DOMAIN>/system/info
# Atteso: HTTP/2 200

# Branding
curl -s https://<DOMAIN>/locale/branding.json | jq .

# Login
curl -s -X POST https://<DOMAIN>/auth/login \
  -d "username=admin&password=1234" \
  -H "Content-Type: application/x-www-form-urlencoded"
# Atteso: {"access_token":"...","token_type":"bearer","role":"superadmin"}

# Backup attivo
sqlite3 /home/<USER>/trgb/trgb/app/data/backups/.last_backup_status.json 2>/dev/null
cat /home/<USER>/trgb/trgb/app/data/backups/.last_health_status.json

# Drive raggiungibile
rclone ls gdrive:TRGB-Backup-lkg/ | head
```

---

## 11. Aruba snapshot manuale settimanale

Aggiungi al calendario del cliente (o al tuo) un reminder settimanale:
1. Entrare su `cloud.aruba.it`
2. Selezionare il VPS
3. Snapshot → "Crea snapshot manuale"
4. Nome: `pre-snap-<DATA>`

Aruba di base NON fa snapshot automatici giornalieri (richiede piano premium).
Lo snapshot manuale è gratis ma serve farlo a mano.

---

## 12. Onboarding cliente (consegna)

Documenti da consegnare:
- [ ] Credenziali login admin (username + PIN iniziale, da cambiare al primo accesso)
- [ ] URL pubblico carta vini: `https://<DOMAIN>/carta`
- [ ] URL gestionale: `https://<DOMAIN>`
- [ ] Manuale utente (TODO: scrivere)
- [ ] Contatti supporto

---

## 13. Troubleshooting comune

### Backend non parte
```bash
sudo journalctl -u trgb-backend -n 100 --no-pager
# Cerca: "Failed to load", "ImportError", "OperationalError", "no such table"
```

### Backup non gira
```bash
# Verifica cron
crontab -l
# Verifica log
tail -100 /home/<USER>/trgb/backup.log
tail -100 /home/<USER>/trgb/backup_health.log
# Lancio manuale per test
/home/<USER>/trgb/trgb/scripts/backup_db.sh
```

### rclone Drive fallisce
```bash
# Verifica auth
rclone ls gdrive: 2>&1 | head
# Re-auth se necessario
rclone config reconnect gdrive:
```

### Push fallisce dal Mac
```bash
# Test SSH
ssh trgb_<LOCALE> "hostname"
# Verifica remote git
git remote -v
# Verifica hook
ssh trgb_<LOCALE> "ls -la /home/<USER>/trgb/repo.git/hooks/"
```

### DB sanity check pre-push blocca
Significa che i DB sul VPS sono già corrotti/svuotati.
1. NON forzare il push
2. Verifica integrità: `ssh trgb_<LOCALE> "cd ~/trgb/trgb && sqlite3 app/data/foodcost.db 'PRAGMA integrity_check'"`
3. Se corrotto, restore da `app/data/backups/last_known_good/`

---

## Note finali

Questo runbook è il complemento di:
- **`docs/sicurezza_backup.md`** — architettura del sistema backup post-incidente
- **`docs/architettura_locale.md`** — modello multi-tenant (locali/)
- **`docs/refactor_monorepo.md`** — piano refactor R1-R8 + R8 modulare
- **`CLAUDE.md`** — istruzioni operative per Claude

Quando installi un nuovo cliente, copia questo runbook e personalizzalo con i
suoi dati (sostituisci tutti i `<LOCALE>`, `<DOMAIN>`, `<USER>`, `<IP_VPS>`).

Tieni una copia del runbook personalizzato + delle credenziali in un posto
SICURO (1Password, Bitwarden, vault aziendale).

**Tempi tipici di esecuzione:**
- Sezione 1 (VPS base): 10 min
- Sezione 2 (deps): 5 min
- Sezione 3 (repo + venv + build): 15 min (npm install è lungo)
- Sezione 4 (locale config): 20-30 min (richiede branding cliente)
- Sezione 5 (systemd): 5 min
- Sezione 6 (nginx + SSL): 10 min (DNS deve essere già propagato)
- Sezione 7 (git remote + hook): 10 min
- Sezione 8 (backup + cron): 10 min (rclone OAuth è il lento)
- Sezione 9-10 (admin + smoke test): 5 min

**Totale realistico: 90-120 min** per cliente nuovo (contando interruzioni e debug).
