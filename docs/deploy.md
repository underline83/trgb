# 🚀 TRGB Gestionale — Guida Deploy (VPS & Locale)

Questo documento descrive tutte le procedure di deploy del gestionale TRGB.

---

# 0. Infrastruttura — Riferimenti server

| Voce | Valore |
|------|--------|
| **IP VPS** | `80.211.131.156` |
| **Dominio VPS** | `trgb.tregobbi.it` |
| **Provider** | Aruba Cloud (account ARU-339384) |
| **OS** | Ubuntu 22.04 LTS |
| **Utente SSH** | `marco` (Mac: `underline83`, Windows: `mcarm`) |
| **Connessione** | `ssh trgb` (alias configurato in `~/.ssh/config`) |
| **Backend URL (prod)** | `https://trgb.tregobbi.it` |
| **Frontend URL (prod)** | `https://app.tregobbi.it` |
| **Backend porta interna** | `8000` |
| **Frontend porta interna** | `5173` |
| **Repo git locale (Mac)** | `~/trgb` |
| **Repo git locale (Win)** | `C:\Users\mcarm\trgb` |
| **Repo git VPS (working dir)** | `/home/marco/trgb/trgb` |
| **Repo git VPS (bare server)** | `/home/marco/trgb/trgb.git` |

---

# 1. Deploy Locale (Mac)

### 1) Attiva venv
```
source ~/trgb/venv-trgb/bin/activate
```

### 2) Avvio backend + frontend
```
python3 run_server.py
```

### Endpoints
- Backend → http://127.0.0.1:8000
- Frontend → http://127.0.0.1:5173

---

# 2. Deploy su VPS Aruba (Produzione)

## 2.1 Connettersi alla VPS
```
ssh marco@80.211.131.156
```

## 2.2 Percorsi principali
```
/home/marco/trgb/trgb/             ← root progetto
/home/marco/trgb/trgb/scripts/deploy.sh
/home/marco/trgb/trgb/app/data     ← database SQLite
```

---

# 3. Script Unico di Deploy — `deploy.sh`

> ⚠️ Con il nuovo flusso automatico (sez. 4.1), `deploy.sh` non serve più per i deploy normali.
> Va usato solo come **fallback manuale** dalla VPS.

| Opzione | Uso |
|---------|-----|
| `-b` | Quick: checkout + restart servizi (no pip/npm) |
| `-a` | Full: + pip install + npm build (nuove dipendenze) |
| `-c` | Safe: + backup DB prima del deploy |
| `-d` | Rollback: ripristina dall'ultimo backup |

---

# 4. Workflow git completo (Mac → VPS → Windows)

## 4.1 Flusso automatico (aggiornato 2026-03-20)

Il VPS ospita un **bare repository** (`/home/marco/trgb/trgb.git`) con un **post-receive hook** che esegue il deploy automaticamente ad ogni push.

### Architettura Git (3 copie del codice)

```
Mac/Windows (sviluppo)
  │
  ├── git push origin  →  VPS bare repo (/home/marco/trgb/trgb.git)
  │                          └── post-receive hook → deploy automatico
  │
  └── git push github  →  GitHub (git@github.com:underline83/trgb.git)
                             └── backup off-site del codice
```

### Remote configurati su Mac e Windows
```
origin → marco@trgb.tregobbi.it:/home/marco/trgb/trgb.git   (deploy)
github → git@github.com:underline83/trgb.git                 (backup)
```

### Remote configurato sul server (working directory)
```
origin → /home/marco/trgb/trgb.git   (bare repo locale)
```

### Flusso di lavoro quotidiano
```
1. Cowork/VS Code modifica i file
2. Dal terminale:
     ./push.sh "descrizione modifica"
     # → commit + push VPS (deploy) + push GitHub (backup)
3. Sull'altro PC:
     git pull
```

### Prerequisiti VPS (una tantum)
Il hook ha bisogno di poter riavviare i servizi senza password. Aggiungere via `sudo visudo`:
```
marco ALL=(ALL) NOPASSWD: /bin/systemctl restart trgb-backend, /bin/systemctl restart trgb-frontend
```

### SSH config (su Mac e Windows, in ~/.ssh/config)
```
Host trgb
  HostName trgb.tregobbi.it
  User marco
  IdentityFile ~/.ssh/id_ed25519
```

---

## 4.3 Upload utente — directory persistente FUORI dal repo (Modulo K, S59 cont. d)

Le foto piatti e gli altri upload utente NON devono finire dentro `static/`
del repo: vengono cancellati ai redeploy (`git clean -fd`) e cachati in modo
problematico dal service worker (vedi bug D3, ora risolto).

**Path di default**:
- **Produzione (VPS)**: `/home/marco/trgb_uploads/`
- **Sviluppo (Mac/sandbox)**: `<repo>/static/uploads_dev/` (gitignored)
- **Override**: `export TRGB_UPLOADS_DIR=/path/desiderato` (env var letta al boot).

**Mount**: FastAPI monta `/uploads` → `<TRGB_UPLOADS_DIR>/` separato da `/static`.
Path nel DB: `/uploads/menu_carta/<edition_id>/<pub_id>.jpg`.

### Setup VPS (una tantum)
```bash
ssh trgb
mkdir -p /home/marco/trgb_uploads
chown marco:marco /home/marco/trgb_uploads
chmod 755 /home/marco/trgb_uploads
```
Il backend al boot stamp `📁 Upload utente: /home/marco/trgb_uploads`.

### Migrazione foto esistenti (opzionale, una tantum sul VPS)
Se esistono già foto Menu Carta sotto `static/menu_carta/` (path legacy):
```bash
ssh trgb
cd /home/marco/trgb/trgb
# Copia mantenendo struttura
mkdir -p /home/marco/trgb_uploads/menu_carta
cp -rn static/menu_carta/* /home/marco/trgb_uploads/menu_carta/ 2>/dev/null || true
ls -la /home/marco/trgb_uploads/menu_carta/
```
Poi aggiorna i path nel DB (script SQL):
```bash
sqlite3 app/data/foodcost.db "
UPDATE menu_dish_publications
   SET foto_path = REPLACE(foto_path, '/static/menu_carta/', '/uploads/menu_carta/'),
       updated_at = datetime('now')
 WHERE foto_path LIKE '/static/menu_carta/%';
"
```
**NOTA**: anche senza la migrazione i path `/static/menu_carta/...` continuano
a funzionare (mount `/static` sempre attivo). Migrare solo se si vogliono
unificare e avere la garanzia di persistenza tra deploy futuri.

### Backup
La cartella `/home/marco/trgb_uploads/` deve essere inclusa nel backup
periodico (vedi sezione 10). Esempio rclone aggiuntivo:
```bash
rclone sync /home/marco/trgb_uploads/ gdrive:trgb_uploads_backup/
```

---

## 4.2 Deploy manuale sul VPS (fallback se hook non funziona)

> Usare solo se il deploy automatico fallisce.

```bash
ssh marco@80.211.131.156
cd /home/marco/trgb/trgb
./scripts/deploy.sh -b      # quick: checkout + restart servizi
./scripts/deploy.sh -a      # full: + pip install + npm build
./scripts/deploy.sh -c      # safe: + backup DB prima del deploy
```

---

# 5. Servizi systemd

## Backend (`trgb-backend.service`)
```
sudo systemctl start trgb-backend
sudo systemctl stop trgb-backend
sudo systemctl status trgb-backend
journalctl -u trgb-backend -f
```

## Frontend (`trgb-frontend.service`)
```
sudo systemctl start trgb-frontend
sudo systemctl stop trgb-frontend
sudo systemctl status trgb-frontend
journalctl -u trgb-frontend -f
```

Abilitazione all'avvio:
```
sudo systemctl enable trgb-backend trgb-frontend
```

---

# 6. Nginx Reverse Proxy

```
proxy_pass http://127.0.0.1:8000;   ← backend
proxy_pass http://127.0.0.1:5173;   ← frontend
```

**IMPORTANTE — Limiti upload:**
```nginx
# In /etc/nginx/sites-available/trgb.tregobbi.it.conf (blocco server HTTPS)
client_max_body_size 100M;   # Upload max 100 MB (per import ZIP fatture XML)
proxy_read_timeout 600s;     # Timeout 10 min (per import grossi)
```

Test configurazione:
```
sudo nginx -t
sudo systemctl reload nginx
```

---

# 7. HTTPS (Certbot)

```
sudo certbot --nginx -d trgb.tregobbi.it
sudo certbot --nginx -d app.tregobbi.it
```

Rinnovo manuale:
```
sudo certbot renew
```

---

# 8. Firewall UFW

```
sudo ufw allow 'Nginx Full'
sudo ufw allow in on lo
sudo ufw allow out on lo
sudo ufw reload
```

---

# 9. Test post-deploy

```
curl -o /dev/null -s -w "%{http_code}" https://app.tregobbi.it
curl -o /dev/null -s -w "%{http_code}" https://trgb.tregobbi.it
```

Risposta attesa: `200`

---

---

# 6. Troubleshooting

## Backend non risponde
```bash
curl https://trgb.tregobbi.it
journalctl -u trgb-backend -f
```

## Frontend non carica
```bash
curl https://app.tregobbi.it
journalctl -u trgb-frontend -f
```

## Porta occupata (8000 o 5173)
```bash
sudo lsof -ti:8000 | xargs sudo kill -9
sudo lsof -ti:5173 | xargs sudo kill -9
```

## Nginx errore
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS scaduto
```bash
sudo certbot renew
```

## Hook post-receive non esegue restart
Verificare che il sudoers sia configurato correttamente:
```bash
sudo grep marco /etc/sudoers
which systemctl   # verificare il percorso corretto
```
Il percorso nel sudoers deve corrispondere esattamente all'output di `which systemctl`.

---

# 10. Backup e Sicurezza

## 10.1 Backup giornaliero database (automatico)

Lo script `scripts/backup_db.sh` viene eseguito via cron in due modalità:

- `--hourly` ogni ora al minuto 0 (retention 48 ore)
- `--daily` alle 03:30 (retention 7 giorni + sync su Google Drive)

Usa `sqlite3 .backup` (copia atomica e consistente) su tutti i 6 database SQLite.
Ogni esecuzione produce una cartella `YYYYMMDD_HHMMSS/` sotto `app/data/backups/{hourly,daily}/` contenente le copie dei DB.
Il backup `--daily` viene inoltre sincronizzato su Google Drive (cartella `TRGB-Backup/db-daily`) via rclone.

```bash
# Backup manuale (giornaliero)
/home/marco/trgb/trgb/scripts/backup_db.sh --daily

# Vedere i backup esistenti sul server
ls -la /home/marco/trgb/trgb/app/data/backups/daily/
ls -la /home/marco/trgb/trgb/app/data/backups/hourly/

# Log backup (cron)
tail -f /home/marco/trgb/backups/backup.log
```

> ⚠️ **Attenzione**: lo script deve avere il bit `+x`. Se dopo un push.sh sparisce (capitato a fine marzo 2026), il cron fallisce silenziosamente con `Permission denied`. Il fix è `chmod +x scripts/backup_db.sh` sul VPS. La UI mostra un banner rosso se l'ultimo backup ha più di 48 ore.

## 10.2 Download backup dall'app web

Admin → Impostazioni → tab **Backup**:
- "Scarica backup completo" → crea backup fresco al volo e lo scarica sul PC
- Lista backup giornalieri → scarica un backup specifico dal server

Endpoint API: `GET /backup/download` (backup istantaneo), `GET /backup/list` (lista), `GET /backup/download/{filename}` (specifico), `GET /backup/info` (stato DB).

## 10.3 Google Drive (backup off-site)

I backup giornalieri vengono sincronizzati automaticamente su Google Drive nella cartella `TRGB-Backup/db-daily` via rclone.
Anche gli script principali (`scripts/backup_db.sh`, `push.sh`, `setup-backup-and-security.sh`) sono copiati in `TRGB-Backup/scripts/`.

```bash
# Verifica configurazione rclone
rclone ls gdrive:TRGB-Backup/ --max-depth 1

# Upload manuale di un file
rclone copy /path/to/file gdrive:TRGB-Backup/

# Config rclone
cat ~/.config/rclone/rclone.conf
```

## 10.4 Snapshot Aruba (settimanale)

Dal pannello Aruba Cloud → VPS → Gestisci → Snapshot.
Salva un'immagine completa del disco. Consigliato: 1 snapshot settimanale.

## 10.5 Fail2ban

SSH è protetto da fail2ban. Se il tuo IP viene bannato:
```bash
# Da un IP diverso (es. hotspot telefono):
ssh trgb
sudo fail2ban-client set sshd unbanip IL_TUO_IP

# Vedere IP bannati:
sudo fail2ban-client status sshd
```

Reti private sono in whitelist. Bantime: 10 minuti.

## 10.6 Setup iniziale backup e sicurezza

```bash
sudo bash /home/marco/trgb/trgb/setup-backup-and-security.sh
```

---

# 11. Anti-conflitto push ↔ uso attivo dell'app

> **Contesto storico.** Nella notte fra 20 e 21 aprile 2026 `vini_magazzino.sqlite3` è stato corrotto **4 volte**. Le prime 3 erano spiegate dal bug `.gitignore` (WAL cancellato da `git clean -fd`, fix 1.11). La 4ª è avvenuta **senza push**: SIGTERM al backend + write pendenti in WAL = sqlite_master in stato inconsistente. **La finestra di vulnerabilità esiste ogni volta che `systemctl restart trgb-backend` avviene mentre qualcuno sta scrivendo.**

## 11.1 Opzioni valutate

| # | Metodo | Copertura | Effort | Rischio residuo |
|---|--------|-----------|--------|-----------------|
| 1 | **Soft-check pre-push in `push.sh`** — probe HTTP + log accessi ultimi 60s, chiede conferma se servizio attivo | bassa-media | XS | alto (dipende da disciplina operatore) |
| 2 | **Flag `/system/maintenance` + banner FE** — endpoint admin che setta flag, FE polla e mostra modale "gestionale in aggiornamento" | alta | M | basso (ma polling 30s = finestra 30s) |
| 3 | **Hard-drain** — endpoint `POST /admin/drain` ritorna 503 su write finché `stop` non arriva | alta | M | molto basso |
| 4 | **Quiet-mode WebSocket** — FE riceve push "maintenance imminent" e disabilita form | altissima | M-L | bassissimo ma richiede WS |
| 5 | **Finestre off-peak fisse** — `push.sh` blocca push fuori da 15-17 e 23-8, override con `--force` | media | XS | medio (disciplina) |

## 11.2 Raccomandazione: implementazione incrementale

**Fase a (subito, 10 min) — 1.14.a soft-check in push.sh:**

```bash
# In push.sh, prima di git push:
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 3 https://trgb.tregobbi.it/ || echo "000")
ACCESSI=$(ssh trgb "tail -n 200 /var/log/nginx/trgb-access.log 2>/dev/null | awk -v cutoff=\$(date -d '60 sec ago' +%s) '{gsub(/\[|\]/,\"\",\$4); split(\$4,a,\":\"); cmd=\"date -d \\\"\"a[1]\" \"a[2]\":\"a[3]\":\"a[4]\"\\\" +%s\"; cmd|getline ts; close(cmd); if(ts>cutoff)print}' | wc -l" 2>/dev/null || echo "?")

if [ "$HTTP_CODE" = "200" ] && [ "$ACCESSI" != "0" ] && [ "$ACCESSI" != "?" ]; then
  echo "⚠️  Servizio attivo: $ACCESSI accessi ultimi 60s."
  read -p "Continuare con push che causera' ~10s di downtime? [y/N] " yn
  [[ "$yn" != "y" && "$yn" != "Y" ]] && { echo "Annullato."; exit 1; }
fi
```

Zero rischio, zero infrastruttura, manda un warning chiaro.

**Fase b (1.14.b, futuro) — flag maintenance + banner FE:**

Backend:
```python
# app/routers/system_router.py
@router.get("/maintenance/status")
def get_status(): return {"active": _read_flag_file(), "since": ..., "message": ...}

@router.post("/maintenance/activate")
def activate(current_user=Depends(require_admin)):
    _write_flag_file({"active": True, "since": now, "message": "Aggiornamento in corso"})
```

Frontend: `useMaintenance()` hook polla ogni 30s, se `active=true` il layout montaa `<MaintenanceBanner/>` fisso in alto + `<MaintenanceOverlay/>` sopra i form.

`push.sh` wrappato così:
```
curl POST /maintenance/activate → git push → wait_startup_ok → curl POST /maintenance/deactivate
```

**Fase c (1.14.c, futuro) — WS quiet-mode:** solo quando serviranno anche altre feature realtime.

## 11.3 Regola operativa intanto

Finché non è in produzione 1.14.a:
- **Push SOLO a ristorante chiuso** o in finestre di traffico zero.
- **Mai push** durante il servizio (12:00-14:30 / 19:00-23:00).
- **Mai push rapidi consecutivi** (min 2 min tra uno e l'altro per far stabilizzare il backend).
- Se è un fix urgente in orario di servizio: avvisare prima il personale di non salvare per 30s, poi pushare.

---

# Fine DEPLOY.md
