# A6 supplemento — Verifica LIVE VPS (eseguita dall'orchestratore, 2026-06-12 ~13:10 CEST)

> Il subagente A6 non aveva accesso rete: questa è la riesecuzione della checklist §8 di `raw_A6.md`,
> eseguita dall'orchestratore via `ssh trgb` (sola lettura) e probe HTTP GET non distruttivi.
> Integra/aggiorna i finding A6-* e fornisce conferme live per A1.

## 1. Backend e versione deployata
- `systemctl status trgb-backend`: **active (running)** da 2026-06-11 06:04 (1g7h), `NRestarts=0`, Mem 302MB. VPS up da 10 giorni, load 0.00.
- `journalctl -u trgb-backend --since "7 days ago" | grep -icE "error|traceback|critical"` → **6** righe (fisiologico).
- `GET https://trgb.tregobbi.it/system/info` → `{"locale":"tregobbi","product":"TRGB","version":"5.24","commit":"1f5f9c17"}` → **VPS allineato al HEAD locale** (5.24 / 1f5f9c17).

## 2. TLS / nginx / porte
- Cert TLS: notBefore 2026-05-31 → notAfter **2026-08-29** (rinnovo Let's Encrypt recente, OK).
- **Header di sicurezza ASSENTI** su `trgb.tregobbi.it` e `app.tregobbi.it`: nessun HSTS, X-Frame-Options, X-Content-Type-Options (solo `server: nginx/1.24.0 (Ubuntu)` esposto con versione). → **conferma live A6-09** (da LOW a MED vista la conferma).
- `ss -tlnp`:
  - `127.0.0.1:8000` uvicorn, `127.0.0.1:5173` node (Vite dev) → solo loopback, OK. **Conferma A6-03/A7-01: il FE di produzione è il dev server Vite** (processo node attivo su 5173).
  - **ESPOSTI su 0.0.0.0**: `9000` e `9443` (docker.service attivo → firma tipica Portainer; container non elencabili: utente marco senza gruppo docker → [NON VERIFICATO quale container]) e **`*:3389` RDP** (`gnome-remote-desktop.service` running). Anche `80/443/22` (attesi).
  - **NUOVO FINDING LIVE [A6-12] HIGH**: porta 3389 (remote desktop) e 9000/9443 (probabile Portainer) esposte a internet su un server di produzione con dati personali. RDP/gnome-remote-desktop brute-forzabile, Portainer = controllo totale dei container se compromesso. Fix: bind su localhost o firewall (ufw deny) + accesso solo via tunnel SSH. Effort S.
- LightDM + desktop GNOME completo + cups + avahi in esecuzione sul server di produzione (superficie d'attacco e RAM; nota, non finding autonomo).

## 3. Hardening SSH / fail2ban
- `/etc/ssh/sshd_config`: **`PermitRootLogin yes`** e **`PasswordAuthentication yes`** (esplicitamente settati, non default commentati). Porta 22 esposta.
  - **NUOVO FINDING LIVE [A6-13] HIGH**: login root via password abilitato su host internet-facing. fail2ban attivo mitiga il brute force ma non elimina il rischio (password debole = game over). Fix: `PermitRootLogin no` + `PasswordAuthentication no` (chiavi già in uso da Marco: l'alias `ssh trgb` usa key auth). Effort S. (Parzialmente noto in docs/analisi_hardening_vps.md — verificarne la sezione; qui CONFERMATO live che non è stato applicato.)
- `fail2ban`: **active** ✅.

## 4. Backup (area incidente S60-INC1) — TUTTO VERDE ✅
- `crontab -l`: **4 job attivi** — hourly (min 0), daily 03:00, daily 18:00, health check ogni 30' (15,45). → la checkbox "[ ] Setup cron" in problemi.md:87 è **stale: FATTO** (conferma A6-11).
- `.last_backup_status.json` (oggi 13:00): mode hourly, **15/15 OK, 0 failed** (10 DB + 5 JSON config).
- `.last_health_status.json` (oggi 12:45): **"healthy", issues []**.
- `last_known_good/`: 14 file, timestamp **oggi 13:00**, dimensioni plausibili (clienti 26.8MB, foodcost 8.2MB, nessuno stub 4096B).
- `daily/`: 20260612030001, 20260611180001, 20260611030001… retention regolare.
- `backup_health.log`: "✅ Sistema di backup SANO", LKG 10/10 integri.
- Resta aperto (non verificabile): **test di restore mai eseguito** (A6-04 confermato come gap di processo) e off-site solo Drive (A6-05).

## 5. Risorse
- Disco: 20G/157G (**13%**), inode 5%. RAM: 1.7G/15G used. Journal: 1.0G. Tutto sano.

## 6. Conferme live per altri trovati
- **A1-01 CONFERMATO LIVE (CRIT)**: `GET https://trgb.tregobbi.it/banca/movimenti` **senza alcun token → 200 OK, 164.593 byte, 929 movimenti bancari reali** (importi, date, rapporti). Anche `/banca/dashboard/` raggiungibile (307→200).
- **A1-03 RIDIMENSIONATO per tregobbi**: `python-dotenv 1.2.2` è installato nel venv del VPS e `/home/marco/trgb/trgb/.env` esiste (76 byte) con 1 riga `SECRET*` → in produzione tregobbi la SECRET_KEY è quasi certamente settata da .env (valore non letto per policy). Il rischio resta pieno per **nuove installazioni** (fallback hardcoded nel repo) → il peso si sposta su A9-02 (readiness prodotto).
- **A1-02 da riverificare**: `GET /vini/ipratico/products[/]` → 404 (il path live non corrisponde; la mancanza di auth resta da giudicare staticamente — demandato ad A10).
- `/vini/carta-cliente/data` → 200 pubblico, 67.852 byte, TTFB 89ms (pubblico voluto — carta QR; conferma rilevanza cache A7).
- `/carta` su trgb.tregobbi.it → **404**; la carta pubblica vive su `app.tregobbi.it/carta` (route FE, 200). Nota architettura: trgb.tregobbi.it = API, app.tregobbi.it = frontend.
- TTFB API: /system/info 56ms, carta-cliente 89ms → performance live di base buona.
