# Audit TRGB 2026-06-12 — 01 SICUREZZA

**Data audit:** 2026-06-12 · **Commit:** `1f5f9c17` · **Versione:** 5.24
**Fonti:** `raw_A1.md` (analisi statica applicativa), `raw_A6.md` §2-3 + `raw_A6_live.md` (infrastruttura/runtime VPS), verdetti applicati da `99_VERIFICA_AVVERSARIA.md`.

---

## 1. Sintesi area e voto

> ## **Voto area Sicurezza: 48/100**
>
> Criterio: 1 finding CRIT **confermato live** su dati finanziari (modulo Banca interamente pubblico, 929 movimenti reali scaricabili senza token) + login a PIN senza alcun rate limit + SSH con root login e password abilitati su host internet-facing. Mitigato da: nessuna SQL injection trovata, query sempre parametrizzate, struttura JWT corretta, fail2ban attivo, auth applicata con disciplina su 49 router su 51.

Il quadro è bipolare. La **disciplina applicativa di base è buona**: praticamente tutti i router usano `Depends(get_current_user)`, le query SQL sono parametrizzate ovunque, gli identificatori interpolati provengono sempre da whitelist interne. Ma i **due router scoperti sono proprio quelli sbagliati** (Banca = dati finanziari; iPratico = upload su disco), il login a PIN 4 cifre non ha alcun freno al brute force (e il manuale promette una protezione che non esiste), e la verifica live del VPS ha rivelato due falle infrastrutturali gravi non tracciate da nessun documento di hardening: RDP e probabile Portainer esposti a internet, e `PermitRootLogin yes` + `PasswordAuthentication yes` in sshd_config.

**Priorità assolute (fix a costo S):** A1-01 (1 riga di codice), A6-13 (2 righe di sshd_config), A6-12 (firewall), A1-04/A6-07 (rate limit login).

---

## 2. Censimento endpoint pubblici (senza autenticazione)

### Voluti pubblici (corretti — nessun dato sensibile o by-design)

| Endpoint | Riferimento | Nota |
|---|---|---|
| `GET /system/info`, `GET /system/modules` | main.py:218, 235 | Diagnostica. OK |
| `GET /locale/branding.json`, `GET /locale/strings.json` | main.py:456, 476 | Config FE al boot. OK |
| `GET /auth/tiles` | auth_router.py:11 | Lista username + display_name + **role** per le tile di login. Accettabile per UX, ma è enumerazione utenti — aggrava A1-04 |
| `POST /auth/login` | auth_router.py:17 | OK |
| `GET /pranzo/smoke/{settimana}/`, `GET /pranzo/health` | pranzo_router.py:53, 65 | Diagnostica, no DB sensibile. OK |
| `GET /vini/carta`, `/vini/carta/html`, `/vini/carta-cliente/data`, `/vini/carta/pdf` | vini_router.py:68-345 | Carta vini pubblica (QR). By-design. Live: `/vini/carta-cliente/data` → 200, 67.852 byte, TTFB 89 ms |
| `GET /menu-carta/public/today`, `GET /pranzo/menu/...` | — | Menu pubblico. By-design |
| `GET /` root | main.py:725 | OK |

### NON voluti pubblici (finding)

| Endpoint | Finding |
|---|---|
| **Tutto `/banca/*`** — 28 endpoint, nessuna auth (banca_router.py:39) | **A1-01 (CRIT, confermato live)** |
| **Tutto `/vini/ipratico/*`** — 11 endpoint, inclusi upload + export (ipratico_products_router.py:30) | **A1-02 (HIGH)** |
| `GET /foodcost/ingredienti`, `GET /foodcost/ingredient/{id}` — costi/prezzi ingredienti (foodcost_router.py:28, 65, 92) | A1-05 (MED) |
| `GET /menu/` — menu per ruolo via query param, dato non sensibile (menu_router.py:13) | A1-10 (LOW) |

Nota: `vini_router.py` espone anche `POST/GET /vini/{vino_id}/movimenti` che **hanno** `Depends(get_current_user)` (righe 427, 449) — protetti. Il router vini nel complesso è misto (carta pubblica + movimenti protetti), corretto.

---

## 3. Finding

### Applicativi (da A1)

```
[A1-01] SEVERITÀ: CRIT — ✅ CONFERMATO LIVE
Titolo: Modulo Banca completamente senza autenticazione — dati bancari leggibili e modificabili da chiunque
Evidenza: app/routers/banca_router.py:39 `router = APIRouter(prefix="/banca", tags=["banca"])` — nessun `dependencies=`. Zero occorrenze di `get_current_user` nel file (grep -c = 0). 28 endpoint montati incondizionatamente da main.py:649 `_mount("banca_router", banca_router.router)` — `_mount()` (main.py:589-595) non aggiunge dependencies. Esempi: GET /banca/movimenti (riga 399, ritorna tutti i movimenti bancari), POST /banca/import (riga 237, upload CSV estratto conto), DELETE /banca/categorie/map/{id} (riga 622), POST /banca/cross-ref/registra-bulk (riga 1697), DELETE /banca/duplicati/{keep_id} (riga 1970, cancella movimenti).
VERIFICA LIVE (raw_A6_live.md §6): `GET https://trgb.tregobbi.it/banca/movimenti` SENZA alcun token → **200 OK, 164.593 byte, 929 movimenti bancari reali** (importi, date, rapporti). Anche `/banca/dashboard/` raggiungibile (307→200). Non è più una deduzione statica: l'estratto conto dell'osteria è scaricabile oggi da chiunque conosca l'URL.
Impatto: L'app è internet-facing. Chiunque può leggere l'intero estratto conto, importare CSV arbitrari, registrare e cancellare movimenti. Il CORS non protegge (vale solo per browser, non per curl/script). Il middleware ReadOnlyViewerMiddleware NON aiuta: blocca solo il ruolo "viewer" CON token valido; una richiesta SENZA token passa (main.py:536 `except: pass`).
Fix proposto: aggiungere `dependencies=[Depends(get_current_user)]` alla dichiarazione APIRouter di banca_router (1 riga), come già fatto in admin_finance/dashboard/bevande. Valutare anche gate ruolo (contabile/admin) sugli endpoint di scrittura. — Effort: S
Modulo: banca
```

```
[A1-02] SEVERITÀ: HIGH — ✅ CONFERMATO (statico)
Titolo: Modulo iPratico Products senza autenticazione — upload e export file accessibili pubblicamente
Evidenza: app/routers/ipratico_products_router.py:30 `router = APIRouter(prefix="/vini/ipratico", ...)` senza `dependencies=`. grep -c get_current_user = 0. 11 endpoint, montati (main.py:667) e attivi su tregobbi (vini/module.json:15, modulo attivo). POST /vini/ipratico/upload (riga 111) accetta upload Excel e lo scrive su disco (riga 126 `saved_path = UPLOAD_DIR / f"ipratico_{ts}.xlsx"`); POST /vini/ipratico/export (riga 328) accetta upload e restituisce file; GET /trgb-wines, /mappings, /stats espongono dati catalogo.
Nota verifica: il probe live 404 era su un path INESISTENTE (`/vini/ipratico/products` non è un endpoint del router) — falso negativo del probe, non smentita del finding. Gli endpoint reali sono /vini/ipratico/{upload, mappings, trgb-wines, export, missing, sync-log, stats, export-defaults}. L'assenza di auth è confermata staticamente (99_VERIFICA_AVVERSARIA.md). Per i retest usare i path reali.
Impatto: Endpoint internet-facing senza auth che scrivono file sul server (potenziale riempimento disco / abuso) ed espongono il catalogo prodotti+prezzi. Meno grave di banca (no dati finanziari diretti) ma comunque write su filesystem senza identità.
Fix proposto: aggiungere `dependencies=[Depends(get_current_user)]` all'APIRouter. — Effort: S
Modulo: vini (sub iPratico)
```

```
[A1-03] SEVERITÀ: MED — ⬇ RIDIMENSIONATO da HIGH (verifica live)
Titolo: SECRET_KEY JWT con fallback hardcoded committato — design fail-open (su tregobbi la chiave custom c'è)
Evidenza: app/core/config.py:4 `SECRET_KEY = os.getenv("SECRET_KEY", "trgb_secret_key_2025")`. La stringa di default è in chiaro nel repo git (tracciato). Algoritmo HS256 (config.py:5), token firmati con questa chiave (security.py:28). main.py:6-9 carica `load_dotenv()` se presente.
VERIFICA LIVE (raw_A6_live.md §6): sul VPS tregobbi `python-dotenv 1.2.2` è installato nel venv e `/home/marco/trgb/trgb/.env` esiste (76 byte) con una riga `SECRET*` → in produzione tregobbi la SECRET_KEY è quasi certamente settata e custom (valore non letto per policy). L'ipotesi "fallback probabilmente attivo in produzione" è smentita.
Impatto (riformulato): per l'istanza tregobbi il rischio immediato NON c'è. Resta il difetto di design fail-open: se la env var manca (nuova installazione, recovery, container ricreato senza .env) il boot procede in silenzio con una chiave nota pubblica, con cui chiunque può forgiare un JWT `{"sub":"admin","role":"superadmin"}`. Il rischio sistemico per le NUOVE installazioni prodotto è censito e pesato come CRIT in A9-02 (il runbook non menziona la creazione del .env): questo finding copre solo il design nel codice.
Fix proposto: far fallire il boot (raise) se la env var SECRET_KEY manca, invece del fallback hardcoded; documentare la generazione della chiave nel runbook (coordinato con A9-02). — Effort: S
Modulo: platform (auth)
Nota: leak storici di file .env in git [NON VERIFICATO] — `git log --diff-filter=A -- '*.env'` negato dalla sandbox. .gitignore copre `.env`/`.env.*` (righe 101-102), quindi a oggi non tracciati; resta da verificare la storia.
```

```
[A1-04] SEVERITÀ: HIGH — ✅ CONFERMATO
Titolo: Login a PIN 4-6 cifre senza rate limiting né lockout — brute force fattibile (e claim di sicurezza falso nel manuale)
Evidenza: POST /auth/login (auth_router.py:17) chiama authenticate_user (auth_service.py:94) — nessun conteggio tentativi, nessun delay, nessun lockout. requirements.txt non include slowapi/limiter; grep "limiter|RateLimit|slowapi|lockout|tentativ" su auth_router.py, auth_service.py, main.py, requirements.txt = 0. PIN: frontend accetta 4-6 cifre (LoginForm.jsx:69 `currentPin.length < 4`, riga 108 `next.length <= 6`). Spazio chiavi minimo 10^4 = 10.000 PIN. GET /auth/tiles (auth_router.py:11, summary dichiara "pubblico") espone la lista username → l'attaccante conosce gli utenti validi. Il manuale utente (docs/audit-2026-05-19/04_MANUALE_UTENTE.md:56) dichiara "Dopo 3 errori il login si blocca per 60 secondi (anti-bruteforce)" — meccanismo che NON esiste nel codice (già segnalato non verificato in VERIFICA_PLAUSIBILITA.md:127 e roadmap DH.8). Nessun `limit_req` nginx (coerente con A6-07); fail2ban copre solo sshd.
Impatto: Un PIN a 4 cifre senza throttling è forzabile in minuti/ore via script (10k tentativi). Username noti via /auth/tiles. Internet-facing. Compromissione account, inclusi admin se PIN corto. Il manuale promette una protezione inesistente → falsa sicurezza per Marco/staff.
Fix proposto: implementare lockout per-utente/IP (es. backoff progressivo dopo N tentativi) o rate limiter (slowapi); imporre PIN minimo 6 cifre per ruoli admin/contabile. Allineare il manuale alla realtà o implementare davvero il blocco 60s. Complementare al rate limit nginx (A6-07). — Effort: M
Modulo: platform (auth)
```

```
[A1-05] SEVERITÀ: MED
Titolo: Endpoint costi ingredienti (/foodcost/ingredienti, /foodcost/ingredient/{id}) senza autenticazione
Evidenza: app/routers/foodcost_router.py:28 `router = APIRouter()` senza dependencies; grep get_current_user = 0. Montato con prefix /foodcost (main.py:607). GET /foodcost/ingredienti (riga 65) e GET /foodcost/ingredient/{id} (riga 92) ritornano nomi ingredienti e ultimi prezzi d'acquisto.
Impatto: Leak read-only dei prezzi d'acquisto ingredienti e margini impliciti — dato commercialmente sensibile (food cost) accessibile senza login su app internet-facing. Solo lettura, niente scrittura → severità MED.
Fix proposto: aggiungere `dependencies=[Depends(get_current_user)]` alla dichiarazione APIRouter (gli altri foodcost_* router lo hanno già a livello router). — Effort: S
Modulo: ricette
```

```
[A1-06] SEVERITÀ: MED
Titolo: Path traversal potenziale negli upload che usano file.filename non sanitizzato nel path
Evidenza: app/routers/admin_finance.py:223-224 `tmp_name = f"{uuid.uuid4().hex}_{file.filename}"; tmp_path = UPLOAD_DIR / tmp_name`. `file.filename` arriva dal client (Content-Disposition) e non è sanitizzato: con filename tipo `../../../home/marco/x` il path risolve fuori da UPLOAD_DIR (il prefisso uuid copre solo il primo segmento). Pattern simili: ipratico_products_router.py:126 (qui filename è fisso `ipratico_{ts}.xlsx`, SICURO). dipendenti.py:2378 invece sanitizza correttamente `safe_name = re.sub(r"[^\w.\-]", "_", file.filename)` (BUONA pratica da replicare).
Impatto: Scrittura file in path arbitrari sul server da parte di un utente autenticato (qualsiasi ruolo, vedi A1-07). Richiede auth → MED, non HIGH. Sfruttabile per overwrite/scrittura fuori dalla cartella upload.
Fix proposto: sanitizzare sempre file.filename come in dipendenti.py:2378 (regex su `[^\w.\-]`), oppure usare solo il basename + uuid ignorando il nome originale per il path su disco. — Effort: S
Modulo: cassa (admin_finance) + trasversale upload
```

```
[A1-07] SEVERITÀ: MED
Titolo: Endpoint sensibili (cedolini/stipendi, import fatture, FIC, banca carta) protetti solo da login, senza controllo di ruolo
Evidenza: Molti router applicano `Depends(get_current_user)` (autenticazione) ma NESSUN gate di ruolo. In particolare app/routers/dipendenti.py: grep `is_admin|is_superadmin|role ==|role in` = 0 → tutti i 36 endpoint (inclusi GET /dipendenti/buste-paga riga 1285 = stipendi, GET /dipendenti/costi-mensili riga 2905, GET /dipendenti/{id}/documenti, POST upload cedolini PDF riga 2778) sono accessibili a QUALSIASI utente loggato: sala, commis, sommelier. Idem clienti_router.py (33 endpoint auth, 0 check ruolo → PII clienti CRM a tutti i ruoli), turni_router.py (24 auth, 0 ruolo), fe_import.py / fattureincloud_router.py / banca_carta_router.py (auth a livello router ma 0 is_admin → import fatture e carta di credito a tutti i ruoli loggati). Contrasto: users_router, modules_router, backup_router, statistiche delete, vini_cantina_tools reset-database fanno correttamente `_require_admin`/`is_admin`.
Impatto: Dati a sensibilità alta (stipendi del personale, anagrafica/PII clienti, dati fiscali fatture) visibili e in parte modificabili da ruoli operativi bassi. Problema di privacy/segregazione interna più che di esposizione esterna. Richiede comunque un account valido.
Fix proposto: definire una matrice ruolo→modulo e applicare gate (`is_admin`/`is_contabile`/ruolo dedicato) almeno su buste-paga, costi-mensili, documenti dipendenti, import fatture e banca carta. Valutare un helper `require_roles(...)`. — Effort: M
Modulo: dipendenti, clienti, acquisti (fe/FIC), banca — trasversale
```

```
[A1-08] SEVERITÀ: MED
Titolo: Autenticazione via token JWT passato in query string (?token=) — leak in log, history, referer
Evidenza: app/routers/vini_cantina_tools_router.py:92 `_get_user_from_query_token(token: Optional[str] = Query(None))` usato da 7 endpoint di download PDF (es. riga 759 inventario_pdf, 810, 856, 1057 con `Depends(_get_user_from_query_token)`). Il JWT viaggia nell'URL.
Impatto: I token in query string finiscono nei log del web server/proxy, nella cronologia browser, e nell'header Referer verso terze parti. Un JWT da 8 ore (config.py:6 ACCESS_TOKEN_EXPIRE_MINUTES=480) intercettato così resta valido a lungo. Pattern introdotto per i download via window.open() (commento riga 94-96) — comprensibile ma rischioso.
Fix proposto: usare token monouso a breve scadenza per i download, oppure servire via fetch+blob con header Authorization invece di ?token=. In subordine, ridurre drasticamente la durata del token usato per download. — Effort: M
Modulo: vini
```

```
[A1-09] SEVERITÀ: LOW
Titolo: CORS con allow_methods/allow_headers wildcard e allow_credentials=True
Evidenza: main.py:493-498 `CORSMiddleware(allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])`. Gli origins sono però una whitelist esplicita (localhost:5173, app.tregobbi.it, trgb.tregobbi.it — righe 486-491), non `"*"`.
Impatto: Basso: la whitelist di origin mitiga il rischio principale. Il wildcard su metodi/header è permissivo ma con origin ristretti non consente CSRF cross-site da domini arbitrari. Da tenere d'occhio quando si aggiungeranno domini cliente (trgb.it): non usare mai `allow_origins=["*"]` con credentials.
Fix proposto: lasciare la whitelist origin; opzionale restringere allow_methods agli effettivamente usati. Documentare la regola "mai origin wildcard con credentials" per i nuovi locali. — Effort: S
Modulo: platform
Nota: stesso oggetto di A6-10 (lì visto dal lato hardening, noto §3.E) — un solo fix chiude entrambi.
```

```
[A1-10] SEVERITÀ: LOW
Titolo: GET /menu/ senza autenticazione (dato non sensibile)
Evidenza: app/routers/menu_router.py:3 `router = APIRouter()` senza deps; riga 13 `GET /` ritorna `MENU_BY_ROLE.get(role)` con role da query param. Nessun dato riservato (solo etichette voci menu statiche).
Impatto: Trascurabile — espone solo la mappa ruolo→etichette menu. Incoerenza di disciplina (endpoint non protetto) più che rischio reale.
Fix proposto: aggiungere `Depends(get_current_user)` per coerenza, o documentare l'endpoint come pubblico legacy. — Effort: S
Modulo: menu_carta (legacy)
```

```
[A1-11] SEVERITÀ: LOW
Titolo: Token JWT a lunga durata (8h) senza meccanismo di revoca
Evidenza: app/core/config.py:6 `ACCESS_TOKEN_EXPIRE_MINUTES = 480`. Endpoint /auth/refresh (auth_router.py:22) emette nuovi token; nessuna blacklist/revoca. Algoritmo HS256 — adeguato. Password hashing: sha256_crypt (security.py:6) — accettabile ma bcrypt/argon2 sarebbe preferibile per PIN.
Impatto: Un token rubato resta valido fino a 8 ore senza possibilità di revoca server-side. Combinato con A1-08 (token in URL) aumenta la finestra di abuso. Basso in isolamento.
Fix proposto: valutare durata più breve + refresh rotation, o una denylist su logout. Considerare bcrypt per gli hash PIN. — Effort: M
Modulo: platform (auth)
```

### Infrastrutturali (da A6 — parte sicurezza)

```
[A6-12] SEVERITÀ: HIGH — 🆕 NUOVO FINDING LIVE
Titolo: Porte 3389 (RDP/gnome-remote-desktop) e 9000/9443 (probabile Portainer) esposte a internet sul server di produzione
Evidenza: `ss -tlnp` live sul VPS (raw_A6_live.md §2): in ascolto su 0.0.0.0 le porte 9000 e 9443 (docker.service attivo → firma tipica Portainer; container non elencabili perché l'utente marco non è nel gruppo docker → [NON VERIFICATO quale container]) e `*:3389` RDP (`gnome-remote-desktop.service` running). Oltre alle attese 80/443/22. In esecuzione sul server anche LightDM + desktop GNOME completo + cups + avahi (superficie d'attacco e RAM; nota, non finding autonomo).
Impatto: server di produzione con dati personali e finanziari espone a internet un remote desktop brute-forzabile (3389) e, se è Portainer, un pannello che — se compromesso — dà controllo totale dei container e quindi della macchina. Nessuno di questi servizi è necessario al gestionale. La presenza non era tracciata in alcun documento di hardening.
Fix proposto: bind su localhost o chiusura via firewall (`ufw deny 3389,9000,9443`); accesso a questi servizi solo via tunnel SSH se davvero servono. Valutare disinstallazione di gnome-remote-desktop/desktop completo se non usati. — Effort: S
Modulo: infra
```

```
[A6-13] SEVERITÀ: HIGH — 🆕 NUOVO FINDING LIVE, ✅ CONFERMATO da verifica avversaria
Titolo: SSH con PermitRootLogin yes + PasswordAuthentication yes su host internet-facing
Evidenza: `/etc/ssh/sshd_config` live (raw_A6_live.md §3): `PermitRootLogin yes` e `PasswordAuthentication yes` — settati ESPLICITAMENTE, non default commentati. Porta 22 esposta. fail2ban attivo (jail sshd, mitiga il brute force). La verifica avversaria ha accertato che il problema NON era nemmeno tracciato: grep PermitRootLogin/PasswordAuthentication su docs/analisi_hardening_vps.md = 0 — il documento di hardening (2026-04-27) copre fail2ban/UFW/Vite/CORS/docs ma non ha mai censito la config sshd.
Impatto: login root via password abilitato su host internet-facing con dati personali: una password debole o riusata = compromissione totale. fail2ban rallenta ma non elimina il rischio (brute force lento distribuito, credential stuffing).
Fix proposto: `PermitRootLogin no` + `PasswordAuthentication no` in sshd_config + restart sshd. Le chiavi sono già in uso (l'alias `ssh trgb` di Marco usa key auth), quindi il cambio è a rischio zero — verificare prima che la chiave funzioni da una seconda sessione. — Effort: S
Modulo: infra
```

```
[A6-06] SEVERITÀ: MED — noto, stato: aperto
Titolo: Swagger /docs e /openapi.json esposti in produzione
Evidenza: main.py — nessuna occorrenza di `docs_url`/`redoc_url`/`openapi_url` (grep verificato); analisi_hardening_vps.md §3.D lo segnalava già il 2026-04-27 con fix da 30 secondi.
Impatto: mappa completa degli endpoint del gestionale (inclusi quelli pubblici no-auth come /vini/carta-cliente/data e i due router scoperti A1-01/A1-02) disponibile a chiunque per ricognizione mirata.
Fix proposto: `docs_url=None if IS_PROD else "/docs"` (idem redoc/openapi) con `IS_PROD` da env, come da analisi §3.D. — Effort: S
Modulo: infra
```

```
[A6-07] SEVERITÀ: MED — noto, stato: aperto
Titolo: Nessun rate limit su /auth/login (lato nginx)
Evidenza: nessuna direttiva `limit_req` nei template nginx di docs/deploy.md e docs/installazione_nuovo_server.md; analisi_hardening_vps.md §3.C aperta da apr 2026; fail2ban copre solo sshd, non l'HTTP. Config nginx live coerente con i template (nessun header custom rilevato nel probe live).
Impatto: brute force su POST /auth/login senza alcun freno — è il lato infrastrutturale di A1-04 (PIN 4 cifre + username noti via /auth/tiles). Il doc installazione mostra perfino l'hash di default "1234" per il primo utente.
Fix proposto: zona `limit_req` 5r/m burst 3 sul location /auth/login come da analisi §3.C (4 righe nginx). Complementare (non sostitutivo) al lockout applicativo di A1-04. — Effort: S
Modulo: infra
```

```
[A6-09] SEVERITÀ: MED — ⬆ promosso da LOW: ✅ CONFERMATO LIVE
Titolo: Header di sicurezza HTTP assenti (HSTS, X-Frame-Options, X-Content-Type-Options) — confermato sulla config live
Evidenza: statica: nessun `add_header` nei template nginx in docs/deploy.md §6 e docs/installazione_nuovo_server.md §6; nessuna menzione HSTS nel repo. LIVE (raw_A6_live.md §2): header ASSENTI sia su `trgb.tregobbi.it` sia su `app.tregobbi.it` — nessun HSTS, X-Frame-Options, X-Content-Type-Options; in più `server: nginx/1.24.0 (Ubuntu)` esposto con versione.
Impatto: senza HSTS un MITM può fare SSL-strip al primo accesso; senza X-Frame-Options l'app è inquadrabile in iframe (clickjacking su pannello gestionale). La conferma live (non più "quasi certamente") giustifica la promozione a MED.
Fix proposto: aggiungere al server block HTTPS: `add_header Strict-Transport-Security "max-age=31536000" always;`, `add_header X-Content-Type-Options nosniff;`, `add_header X-Frame-Options SAMEORIGIN;` + `server_tokens off;`. — Effort: S
Modulo: infra
```

```
[A6-10] SEVERITÀ: LOW — noto, stato: aperto
Titolo: CORS lasco — allow_methods/headers "*" con allow_credentials=True
Evidenza: main.py:493-498 — `allow_credentials=True, allow_methods=["*"], allow_headers=["*"]` (origins però in allowlist esplicita di 4 host, che mitiga).
Impatto: superficie marginale (l'allowlist origins regge il grosso), ma resta il punto aperto §3.E dell'analisi hardening. Stesso oggetto di A1-09.
Fix proposto: stringere a metodi/header espliciti come da analisi §3.E. — Effort: S
Modulo: infra
```

---

## 4. Cosa funziona bene (copertura positiva)

- **Nessuna SQL injection trovata.** Verificati tutti i pattern `execute(f"...")` e gli identificatori interpolati (`{col}`, `{tbl}`, `{campo}`, `{order_sql}`, `{set_sql}`): in tutti i casi provengono da **whitelist interne**, mai da input utente — clienti_router.py:1385 (`campo` validato contro `campi_validi`), vini_cantina_tools_router.py:1480-1482 (`LOCATION_FIELDS`), vini_anagrafiche_router.py:972 (dict `TABELLE`), reparti.py:90 (costante), `ORDER BY {order_sql}` da `order_map.get(...)` con default (clienti:1978, CG:1014), fe_import.py:100 (definizioni di migrazione interne). I valori (WHERE, LIKE) usano sempre placeholder `?` con tuple di params (es. banca_router.py:430-431, statistiche_router.py:193). Gli UPDATE dinamici (`{set_sql}`, fe_proforme:386, menu_carta:364, prenotazioni:710) costruiscono solo `campo = ?` con valori parametrizzati.
- **Auth applicata con disciplina su 49/51 router**: `Depends(get_current_user)` è il pattern standard, a livello router o per-endpoint. I due router scoperti (banca, ipratico) sono eccezioni, non la regola.
- **Struttura JWT corretta**: HS256, expiry presente, verifica firma centralizzata in security.py. Gate admin presenti dove più conta (users_router, modules_router, backup_router, statistiche delete, vini_cantina_tools reset-database con `_require_admin`/`is_admin`).
- **fail2ban attivo** sul VPS (verificato live), jail sshd.
- **uvicorn e Vite bindano solo su loopback** (127.0.0.1:8000 / 127.0.0.1:5173, verificato live con ss -tlnp): il backend non è raggiungibile se non via nginx.
- **TLS sano**: cert Let's Encrypt valido fino al 2026-08-29, rinnovo automatico funzionante.
- **Validazione estensione sugli upload** quasi ovunque (banca .csv, ipratico .xlsx/.xls, admin_finance .xlsb/.xlsx/.xls, dipendenti .pdf); dipendenti.py:2378 mostra la sanitizzazione filename corretta da replicare.

### Osservazioni trasversali senza finding dedicato
- **Nessun upload impone un limite di dimensione massima** (file letti interi in memoria con `await file.read()`, es. banca:248, ipratico:122) → possibile DoS memoria/disco. Severità LOW, da fixare con check su `file.size`/streaming con cap.
- `git log` su `.env` non verificabile in sandbox → leak storici [NON VERIFICATO].

---

## 5. Tabella riassuntiva

| Severità | N. | ID |
|---|---|---|
| CRIT | 1 | A1-01 (confermato live) |
| HIGH | 4 | A1-02, A1-04, A6-12 (nuovo live), A6-13 (nuovo live) |
| MED | 8 | A1-03 (⬇ da HIGH), A1-05, A1-06, A1-07, A1-08, A6-06, A6-07, A6-09 (⬆ da LOW) |
| LOW | 4 | A1-09, A1-10, A1-11, A6-10 |
| **Totale** | **17** | |

**Ordine di intervento consigliato (tutti effort S salvo indicazione):**
1. A1-01 — 1 riga su banca_router (subito, prima di qualsiasi altra cosa)
2. A6-13 — sshd_config: no root, no password
3. A6-12 — chiudere 3389/9000/9443
4. A1-04 (M) + A6-07 — rate limit login (nginx subito, lockout applicativo a seguire)
5. A1-02 — 1 riga su ipratico_products_router
6. A6-06, A6-09 — /docs spento in prod + header nginx
