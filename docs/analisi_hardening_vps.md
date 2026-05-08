# Analisi — Separazione carta vini pubblica + hardening reale del VPS

> Documento di pianificazione, non di esecuzione. Scritto il 2026-04-27 dopo
> ricognizione di `main.py`, `push.sh`, `ISTRUZIONI_SERVER.md`, `docs/deploy.md`,
> `setup-backup-and-security.sh`, `app/routers/vini_router.py`,
> `frontend/src/App.jsx`, `frontend/src/pages/public/CartaClienti.jsx`.

---

## 1. Foto di com'e' adesso

**Sottodomini gia' attivi sul VPS Aruba (80.211.131.156):**

- `trgb.tregobbi.it` → nginx → `127.0.0.1:8000` → uvicorn FastAPI (servizio `trgb-backend`)
- `app.tregobbi.it` → nginx → `127.0.0.1:5173` → **Vite dev server** (servizio `trgb-frontend`, lancia `npm run dev`)

**Carta vini pubblica oggi:**

- URL: `https://app.tregobbi.it/carta`
- Frontend: `App.jsx` intercetta il path `/carta` PRIMA del check token e monta `CartaClienti.jsx` in un BrowserRouter separato (no Header, no ToastProvider). Pulizia UX gia' c'e'.
- Backend: `GET /vini/carta-cliente/data` (no auth) in `vini_router.py`. Restituisce JSON con calici, tipologie nested, sezioni bevande.
- `CartaClienti.jsx` chiama `${API_BASE}/vini/carta-cliente/data`. `API_BASE` in produzione = `https://trgb.tregobbi.it`. Quindi il browser fa due cross-origin: HTML da `app.`, JSON da `trgb.`.

**Misure di sicurezza gia' attive:**

- HTTPS via certbot su entrambi i sottodomini.
- UFW: aperte solo `Nginx Full` + lo.
- Fail2ban su `sshd`: maxretry 5, bantime 600s, whitelist reti private.
- JWT su tutti gli endpoint protetti, middleware viewer-readonly.
- Backup orari + giornalieri con `sqlite3 .backup`, sync su Drive 03:30.
- `push.sh` ha modulo guardiano L1 (debounce, probe, lettura access log).

**Misure di sicurezza che NON ci sono:**

- Nessun rate limit su `/auth/login` o sull'API in generale.
- `/docs` di FastAPI esposto in chiaro su `trgb.tregobbi.it/docs` → mappa completa degli endpoint per chiunque.
- CORS con `allow_methods=["*"]`, `allow_headers=["*"]`, `allow_credentials=True`.
- IP del VPS esposto direttamente. Niente Cloudflare/CDN davanti, quindi niente DDoS protection, niente cache statica edge, niente WAF.
- **Frontend in produzione gira sul dev server di Vite.** Vedi sezione 3.A.

---

## 2. La domanda originale — separare la carta vini

L'idea di Marco era: spostare la carta vini da `app.tregobbi.it/carta` a un URL piu' pulito (per branding e per non esporre `app.` ai clienti). Sintesi della posizione:

- **Come misura di sicurezza, da sola, vale poco.** Nascondere `app.` non protegge dal motivato (DNS pubblico, certificate transparency log, scanner che provano sottodomini comuni). La sicurezza vera sta da un'altra parte (sezione 3).
- **Come operazione di branding/UX, ha senso.** L'URL `carta.tregobbi.it` (o `tregobbi.it/carta`) sta meglio sui menu cartacei, sui QR code, sui social, e riduce la pressione di curiosita' casuale e bot di scraping di pannelli admin verso il sottodominio del gestionale.

**Conclusione:** farla, ma come tassello di un piano piu' ampio di hardening, non come "fix di sicurezza" stand-alone.

---

## 3. Le cose vere da fare, in ordine di valore

### 3.A — Frontend in produzione: passare da `npm run dev` a build statico

**Severita': ALTA. E' il primo problema da risolvere, prima ancora della carta vini.**

Oggi `trgb-frontend.service` lancia `npm run dev -- --host 127.0.0.1 --port 5173 --mode vps`. Questo e' il dev server di Vite. Cose che implica:

- **Codice sorgente esposto in chiaro.** Sourcemaps + moduli ESM non bundled = un cliente o chiunque apra DevTools vede struttura cartelle, nomi componenti, commenti. Non e' un buco di auth, ma e' espone la mappa interna del gestionale a chi non dovrebbe vederla.
- **HMR e WebSocket attivi.** Vite ha `/__vite_ping`, `/@vite/client`, ecc. Endpoint pensati per dev, mai per pubblico.
- **Performance degradate.** Nessuna minification, nessuna gzip/brotli ottimale, ogni modulo richiesto separatamente. Su 4G di un cliente al tavolo che apre la carta vini si sente.
- **Single point of failure.** Se vite crasha (e capita), il frontend cade. Se servi i file statici da nginx, nginx non crasha mai.
- **Documentazione ufficiale Vite:** "vite dev server is not designed for production". Letteralmente.

**Cosa cambia.** Il flow giusto e':

1. Nel deploy hook (post-receive sul VPS), dopo il pull, fare `cd frontend && npm ci && npm run build`. Output in `frontend/dist/`.
2. `trgb-frontend.service` non serve piu'. Si puo' disabilitare o lasciare come fallback.
3. Nginx server block di `app.tregobbi.it` (e in futuro `carta.tregobbi.it`) serve direttamente i file da `frontend/dist/` con `try_files $uri /index.html` per il routing client-side di React.
4. Le chiamate `/api/*` continuano a passare al backend (gia' cosi'). Non cambia niente per il browser.

**Costo:** mezzora di setup + un giro di test su staging. Una volta fatto, e' fatto per sempre. Il deploy diventa anche piu' veloce (npm install solo quando le deps cambiano davvero, non a ogni push).

**Beneficio:** risolve da solo il 60% dei problemi di hardening menzionati nelle altre sezioni (sourcemaps, performance, attack surface dev-server). E' la cosa con il rapporto valore/costo migliore in assoluto.

**Rischio:** durante il primo build qualche import lazy puo' rompersi (succede). Si mitiga facendo il primo deploy in un momento di calma e tenendo il vecchio servizio Vite pronto al fallback per 24 ore.

### 3.B — Cloudflare gratuito davanti al VPS

**Severita': ALTA. Costo: 15 minuti. Beneficio: enorme.**

Cosa fa: si cambiano i nameserver di `tregobbi.it` puntandoli a Cloudflare. Cloudflare diventa proxy: il browser parla con Cloudflare, Cloudflare parla col tuo VPS.

Cosa ottieni gratis:

- **DDoS protection.** Cloudflare assorbe gli attacchi volumetrici prima che arrivino al VPS Aruba. Non e' invincibile ma copre il 99% degli attacchi opportunistici.
- **IP del VPS nascosto.** Chi guarda il DNS vede l'IP di Cloudflare. Per arrivare al tuo VPS deve fare reconnaissance attiva. Aiuta MOLTO contro scanner automatici.
- **Cache edge.** Le risorse statiche (`/assets/*.js`, immagini, font) vengono servite dalla CDN piu' vicina al cliente. La carta vini su iPad in osteria si carica in 200ms invece di 1.2s.
- **Bot management base.** Bot scrapers e crawler aggressivi vengono filtrati prima di toccare nginx.
- **Rate limit gratuito** (limitato ma utile) sui path che vuoi.
- **Blocco geografico** se decidi che la carta vini la vuoi solo dall'Italia (configurabile, opzionale).

**Costo:** zero euro, 15 minuti di spostamento NS. Una piccola cosa: bisogna mettere sul VPS un'allowlist nginx degli IP Cloudflare per evitare che qualcuno bypassi proxando direttamente all'IP nudo del VPS — e' 5 righe in piu' nel server block.

**Quando NON farlo:** se la carta vini deve essere accessibile in HTTP plain (non e' il caso), oppure se per qualche compliance servisse l'IP italiano diretto (non e' il caso).

### 3.C — Rate limit nginx su `/auth/login`

**Severita': MEDIA. Costo: 10 minuti.**

Oggi se uno fa scripting su `POST /auth/login` con un dizionario di password, niente lo ferma. Il JWT secret e' lungo, ma le password utente potrebbero non esserlo.

Si aggiungono 4 righe al server block di `trgb.tregobbi.it`:

```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

location = /auth/login {
    limit_req zone=login burst=3 nodelay;
    proxy_pass http://127.0.0.1:8000;
    # ... resto
}
```

5 tentativi al minuto per IP, burst 3. Brute force diventa inutile.

**Bonus:** stesso pattern lo si puo' applicare a `/vini/carta-cliente/data` con un rate piu' largo (es. 60r/m per IP), per evitare scraping massiccio della carta da parte di concorrenti curiosi o bot.

### 3.D — Disabilitare `/docs` in produzione

**Severita': BASSA. Costo: 30 secondi.**

Oggi `https://trgb.tregobbi.it/docs` mostra la Swagger UI con TUTTI gli endpoint del gestionale. Sono tutti dietro auth (a parte i pochi pubblici), quindi non e' un buco. Ma e' una mappa pronta per chi vuole capire dove tentare. In produzione si toglie con:

```python
app = FastAPI(
    title="TRGB Gestionale Web",
    version="2025.12-web",
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    openapi_url=None if IS_PROD else "/openapi.json",
)
```

Dove `IS_PROD = os.getenv("ENV") == "prod"` (gia' c'e' un .env sul VPS, basta aggiungere la variabile).

### 3.E — Stretta CORS

**Severita': BASSA-MEDIA. Costo: 5 minuti.**

`allow_methods=["*"]` e `allow_headers=["*"]` sono comodi ma laschi. Si stringe a:

```python
allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
```

Effetto pratico: se domani una vulnerabilita' CSRF salta fuori in qualche browser, l'allowlist stretta e' un pezzo in meno da preoccuparsi.

---

## 4. La carta vini, dopo l'hardening

A questo punto la separazione della carta vini diventa una passeggiata, perche' il frontend e' un build statico. Le opzioni concrete:

### Opzione A — `carta.tregobbi.it` (sottodominio dedicato) ⭐ raccomandato

Tre passi:

1. **DNS:** record A `carta` → IP del VPS (o CNAME a `app.tregobbi.it` se Cloudflare e' davanti).
2. **Certbot:** `sudo certbot --nginx -d carta.tregobbi.it` — un certificato in piu', rinnovo automatico.
3. **Nginx:** server block dedicato che serve il **build statico** del frontend ma con due differenze:
    - Tutte le route che non sono `/`, `/carta`, `/carta/*`, `/assets/*` ritornano `404`.
    - Le chiamate API si limitano a `/vini/carta-cliente/data` (e nei prossimi mesi eventualmente `/vini/carta-cliente/*` per future estensioni). Tutto il resto va al void.

   Esempio concettuale (non da copiare a oggi):
   ```nginx
   server {
       server_name carta.tregobbi.it;
       root /home/marco/trgb/trgb/frontend/dist;

       # SPA: serve sempre index.html per /carta e sotto
       location / {
           try_files $uri /index.html;
       }

       # Whitelist API pubblica: solo dati carta vini
       location = /vini/carta-cliente/data {
           proxy_pass http://127.0.0.1:8000/vini/carta-cliente/data;
           proxy_set_header Host $host;
       }

       # Tutto il resto blocca
       location /api/ { return 404; }
       location /auth/ { return 404; }
       location /vini/ { return 404; }
       # ... altri prefissi gestionale
   }
   ```

   Il punto e' che da `carta.tregobbi.it` non si puo' raggiungere `/auth/login`. Anche se il backend e' lo stesso, nginx fa da gate. Su `app.tregobbi.it` si continua come oggi (tutto raggiungibile, dietro JWT).

4. **Frontend:** in `App.jsx` aggiungere il check su `window.location.hostname` per servire la carta su `/` quando il dominio e' `carta.tregobbi.it` (oggi e' su `/carta`). Variazione di 5 righe.

**Vantaggi:**
- URL pulissimo da stampare sui menu.
- Superficie di attacco visibile da quel sottodominio = solo l'endpoint pubblico carta. Tutto il resto = 404.
- Domani aggiungere `carta-cocktail`, `carta-dolci`, ecc. e' triviale (stesso pattern, stessa zona).
- Se mettiamo Cloudflare davanti, la carta beneficia di cache edge senza sforzi: i file statici di `dist/` cambiano solo a deploy, sono cacheabili 1 anno.

**Svantaggi:**
- 5 minuti di certbot.
- 1 record DNS in piu'.

### Opzione B — `tregobbi.it/carta` (path sul sito principale)

Dipende da dov'e' ospitato il sito istituzionale `tregobbi.it`. Casi:

- **Se e' un sito statico/WordPress su un altro hosting** (es. Aruba shared, SiteGround, Wix, Squarespace): la maggior parte di questi hosting NON permette `proxy_pass` arbitrari. Il massimo che puoi fare e' un redirect 302 a `carta.tregobbi.it`, che rimanda al punto A.
- **Se e' su Cloudflare Pages o un VPS controllato da te:** si puo' fare un Cloudflare Worker (gratis fino a 100k req/giorno) che intercetta `/carta*` e fa proxy al sottodominio carta. URL finale resta `tregobbi.it/carta`.

**Svantaggi:**
- Aggiunge complessita' e una dipendenza in piu' (Worker o config dell'hosting principale).
- Cambiare hosting di `tregobbi.it` un domani diventa piu' complicato.
- Marginale per il cliente al tavolo (un QR e' un QR, l'URL serio non lo legge).

**Mia raccomandazione:** Opzione A. L'opzione B la prendiamo in considerazione solo se il sito istituzionale `tregobbi.it` e' su un'infrastruttura che lo permette gratis e Marco vuole l'URL singolo per ragioni di branding piu' forti.

### Opzione C — non fare nulla, lasciare `app.tregobbi.it/carta`

Onestamente: una volta fatto il punto 3.A (build statico) e 3.B (Cloudflare), questa rimane un'opzione difendibile. Il cliente al tavolo non lo legge, va al QR. La separazione e' principalmente per gli URL stampati e per l'eleganza.

---

## 5. Ordine di esecuzione raccomandato

Stimando i blocchi di lavoro:

| # | Cosa | Costo | Beneficio | Reversibile? |
|---|------|-------|-----------|--------------|
| 1 | Build statico frontend (3.A) | 1h + 1 sera di test | ALTO | Si' (servizio Vite resta pronto per fallback) |
| 2 | Cloudflare davanti (3.B) | 30min | ALTO | Si' (basta cambiare NS) |
| 3 | Rate limit `/auth/login` (3.C) | 15min | MEDIO | Si' (4 righe nginx) |
| 4 | Disabilita `/docs` in prod (3.D) | 5min | BASSO | Si' |
| 5 | Stretta CORS (3.E) | 10min | BASSO | Si' |
| 6 | Sottodominio `carta.tregobbi.it` (4.A) | 30min | MEDIO (UX) | Si' |

**Mia proposta di sequenza:**

- **Sessione 1 (1.5-2h):** punti 1 + 4 + 5. Tutto sullo stack TRGB, tutti reversibili. Test su staging prima.
- **Sessione 2 (45min):** punti 2 + 3. Cloudflare davanti + rate limit. Tutto reversibile.
- **Sessione 3 (45min):** punto 6 (sottodominio carta) — solo se Marco lo vuole davvero, una volta che il resto e' stabile.

Tra una sessione e l'altra teniamo 1-2 giorni di osservazione: il rischio non e' enorme ma e' tutto codice di produzione.

---

## 6. Cose da NON fare (antipattern)

- **NON spostare la carta vini su un servizio Python separato.** Sarebbe overengineering: il bottleneck non c'e', il codice e' poco. Un proxy nginx basta e avanza.
- **NON usare iframe per incorporare la carta su `tregobbi.it/carta`.** UX scadente (scroll innestato, font che non ereditano), SEO peggiore, autenticazione di terze parti rotta, esperienza mobile pessima.
- **NON disabilitare CORS con `allow_origins=["*"]` e `allow_credentials=True`** "tanto per fare prima". Il browser stesso lo rifiuta in spec. Stiamo gia' sull'allowlist esplicita, manteniamola.
- **NON fare hardcode di IP/host/path** nel frontend. Si usa sempre `API_BASE` da `config/api.js` (regola gia' nel CLAUDE.md), e nel backend si tengono gli URL pubblici in env.

---

## 7. Domande aperte per Marco

Prima di mettere mano a qualunque cosa serve allinearci su:

1. **Sito istituzionale `tregobbi.it` — dove e' ospitato?** (Aruba shared / WordPress.com / Wix / Squarespace / VPS / Cloudflare Pages?). Determina se l'opzione B di sezione 4 e' percorribile o no.
2. **Cloudflare gratis ti sta bene?** Implica spostare i nameserver di `tregobbi.it` su Cloudflare (cosa che benefica anche il sito istituzionale, non solo l'app). Reversibile: si rimettono i nameserver originali quando vuoi.
3. **Naming sottodominio carta** se andiamo su opzione A: `carta.tregobbi.it` (raccomandato, generale), `vini.tregobbi.it`, `winelist.tregobbi.it`?
4. **Frontend build statico — quando hai una serata calma?** Il primo deploy del build statico non e' rischioso ma vale la pena farlo quando l'osteria e' chiusa.
5. **Fattore di paura sui rate limit:** ci sono casi legittimi in cui la stessa cucina/sala fa 5+ login al minuto dallo stesso IP (es. router NAT del ristorante, tutti i tablet escono dallo stesso IP)? In quel caso il rate limit va calibrato meglio. Risposta: probabilmente no, ma vale la pena confermarlo.

---

## 8. TL;DR

La separazione della carta vini da sola serve solo a UX/branding, non a sicurezza. Per renderla davvero utile va dentro un piano piu' ampio:

1. **Frontend statico, non Vite dev server** (la cosa piu' importante).
2. **Cloudflare davanti.**
3. **Rate limit + `/docs` chiusi + CORS stretto.**
4. **Solo a quel punto:** `carta.tregobbi.it` (o lasciare `app.tregobbi.it/carta`, e' onestamente quasi pari).

Il punto 1 risolve da solo piu' problemi di tutti gli altri messi insieme. Se devi scegliere UNA cosa da fare, e' quella.
