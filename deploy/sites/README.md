# Deploy siti aggiuntivi sul VPS Aruba

Marco ha comprato 2 nuovi domini il 2026-04-29:
- **`trgb.it`** — dominio del prodotto TRGB (futura destinazione R4 deploy istanza pulita)
- **`underlinestudio.it`** — dominio dello studio di Marco (sito personale/portfolio)

Entrambi sono ospitati sullo stesso VPS Aruba (`80.211.131.156`) che gira già `trgb.tregobbi.it`. Un solo VPS, N siti separati via nginx vhost — costo zero in più.

## Struttura

```
deploy/sites/
├── README.md                          ← questo file
├── trgb.it/
│   ├── nginx.conf                     ← vhost nginx (HTTP→HTTPS, SSL Let's Encrypt)
│   └── index.html                     ← pagina "Coming Soon" TRGB-02 themed
└── underlinestudio.it/
    ├── nginx.conf                     ← vhost nginx
    └── index.html                     ← pagina vetrina Underline Studio minimal
```

## Step operativi (una tantum, 30 minuti totali)

### 1 · DNS dal pannello IONOS

Per **ognuno** dei 2 domini, dal pannello IONOS → DNS:

```
@      A    80.211.131.156
www    A    80.211.131.156
```

Tempo di propagazione: 30min — 4h. Verifica con `nslookup trgb.it` da terminale.

### 2 · Caricamento file sul VPS

Dal Mac, dopo che hai pushato questo commit:

```bash
ssh trgb
cd /home/marco/trgb/trgb         # qui hai gli ultimi file via git pull
sudo mkdir -p /var/www/trgb.it /var/www/underlinestudio.it
sudo cp deploy/sites/trgb.it/index.html              /var/www/trgb.it/
sudo cp deploy/sites/underlinestudio.it/index.html   /var/www/underlinestudio.it/
sudo cp deploy/sites/trgb.it/nginx.conf              /etc/nginx/sites-available/trgb.it
sudo cp deploy/sites/underlinestudio.it/nginx.conf   /etc/nginx/sites-available/underlinestudio.it
sudo ln -s /etc/nginx/sites-available/trgb.it             /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/underlinestudio.it  /etc/nginx/sites-enabled/
sudo nginx -t                    # verifica config
```

Se `nginx -t` non torna `syntax is ok` + `test is successful`, NON proseguire — manda l'output a Claude.

### 3 · Reload nginx (HTTP funziona già)

```bash
sudo systemctl reload nginx
```

Apri `http://trgb.it` e `http://underlinestudio.it` → vedi le pagine HTML.

### 4 · Certificato SSL Let's Encrypt (gratis)

```bash
sudo certbot --nginx -d trgb.it -d www.trgb.it
sudo certbot --nginx -d underlinestudio.it -d www.underlinestudio.it
```

Certbot:
- Chiede email per notifiche scadenza
- Chiede di accettare TOS (yes)
- Chiede se redirect HTTP→HTTPS forzato (yes, opzione 2)
- Rinnova automaticamente ogni 90 giorni via systemd timer (zero manutenzione)

### 5 · Verifica finale

```bash
curl -I https://trgb.it          # atteso: HTTP/2 200
curl -I https://underlinestudio.it
```

Apri da browser i 2 domini in HTTPS. Se vedi le pagine + lucchetto verde, sei a posto.

## Quando arriverà R4 (deploy istanza prodotto TRGB)

Sostituirai il blocco `root /var/www/trgb.it;` di `nginx.conf` con un `proxy_pass http://127.0.0.1:8001` verso il secondo backend TRGB (`TRGB_LOCALE=trgb`). Tutto il resto del vhost resta uguale, certificato SSL già installato, niente da rigenerare.

## Note

- Le 2 pagine HTML in `deploy/sites/<dominio>/index.html` sono **placeholder**: minimal, single-file, zero dipendenze. Marco/Underline le sostituirà quando vorrà.
- I 2 vhost nginx sono **template completi**: HTTP→HTTPS redirect, gzip, cache headers per static, security headers base.
- L'infrastruttura sul VPS è condivisa: stesso nginx, stesso certbot, stesso systemd. 2 + N domini sullo stesso server senza degrado prestazioni.
