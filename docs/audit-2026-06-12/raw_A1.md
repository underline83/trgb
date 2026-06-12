# Audit A1 — Sicurezza applicativa (statico, solo codice)

**Data:** 2026-06-12
**Area:** A1 — Sicurezza applicativa
**Perimetro:** backend FastAPI (`app/`, `main.py`), 51 router in `app/routers/`, auth/JWT, upload, secrets, CORS, login.
**Metodo:** analisi statica del codice (grep mirato + lettura integrale dei file critici). Nessuna esecuzione, nessun test dinamico, nessuna modifica.

---

## 1. Metodologia e copertura

### Cosa ho verificato e come
- **Auth su endpoint:** ho contato per ogni router (a) i decoratori endpoint (`@router/@public_router.<verbo>`) e (b) i riferimenti a `Depends(get_current_user)`, poi ho ispezionato la dichiarazione `APIRouter(...)` di ciascuno per capire se l'auth è a livello router (`dependencies=[Depends(get_current_user)]`) o per-endpoint. I router con copertura sospetta (auth-refs = 0 o ≪ n. endpoint) sono stati letti in dettaglio. **Copertura: 51/51 router analizzati a livello di dichiarazione router + conteggio; ~18 router letti in dettaglio riga-per-riga** (tutti quelli sospetti + i sensibili: banca, ipratico, foodcost, menu, users, backup, modules, vini_cantina_tools, admin_finance, dipendenti, auth, main.py, security.py, auth_service.py, uploads.py).
- **Controlli di ruolo:** grep su `is_admin`, `is_superadmin`, `_require_admin`, `role`, lettura dei gate negli endpoint distruttivi/amministrativi.
- **SQL injection:** grep su `execute(f"`, `executescript(f`, `.format(`, `execute(sql/query`, interpolazione di identificatori (`{col}`, `{tbl}`, `{campo}`, `{order_sql}`). Verificata l'origine di ogni identificatore interpolato.
- **Upload:** grep `UploadFile` (17 endpoint), lettura della validazione estensione/dimensione e dell'uso di `file.filename` nei path.
- **Secrets:** lettura `app/core/config.py`, `security.py`, `mailchimp_service.py`, `fattureincloud_router.py`; verifica `.gitignore`; `git ls-files` su pattern env/secret.
- **CORS / login / errori:** lettura `main.py` (CORS, middleware), `LoginForm.jsx` (lunghezza PIN), `requirements.txt` (rate limiter assente).

### Limiti del campionamento
- Verifica **statica**: non ho confermato runtime che `/banca/movimenti` risponda 200 senza token (l'ho dedotto dal codice — router senza alcuna dipendenza auth e montato incondizionatamente). La deduzione è solida ma non testata HTTP.
- Non ho potuto eseguire script Python/awk di parsing (sandbox ha negato alcuni comandi); il conteggio endpoint/auth è stato fatto con grep + lettura manuale, quindi affidabile ma non automatizzato al 100%.
- `git log --diff-filter=A` su `.env` è stato negato dalla sandbox → leak storici di `.env` **[NON VERIFICATO]** (vedi A1-03, nota).

---

## 2. Elenco endpoint pubblici (senza autenticazione)

### Voluti pubblici (corretti — nessun dato sensibile o by-design)
- `GET /system/info`, `GET /system/modules` — diagnostica (main.py:218, 235). OK.
- `GET /locale/branding.json`, `GET /locale/strings.json` — config FE al boot (main.py:456, 476). OK.
- `GET /auth/tiles` — lista username+display_name+**role** per le tile di login (auth_router.py:11). Espone i nomi utente e i ruoli; accettabile per UX login, ma è enumerazione utenti (vedi nota A1-04).
- `POST /auth/login` — login (auth_router.py:17). OK.
- `GET /pranzo/smoke/{settimana}/`, `GET /pranzo/health` — diagnostica, no DB sensibile (pranzo_router.py:53, 65). OK.
- `GET /vini/carta`, `/vini/carta/html`, `/vini/carta-cliente/data`, `/vini/carta/pdf` — carta vini pubblica (vini_router.py:68-345). By-design.
- `GET /menu-carta/public/today`, `GET /pranzo/menu/...` pubblici — menu pubblico. By-design.
- `GET /` root (main.py:725). OK.

### NON voluti pubblici (finding)
- **Tutto `/banca/*`** — 28 endpoint, nessuna auth (banca_router.py:39). → **A1-01 (CRIT)**
- **Tutto `/vini/ipratico/*`** — 11 endpoint, nessuna auth, inclusi upload + export (ipratico_products_router.py:30). → **A1-02 (HIGH)**
- `GET /foodcost/ingredienti`, `GET /foodcost/ingredient/{id}` — costi/prezzi ingredienti, nessuna auth (foodcost_router.py:28, 65, 92). → **A1-05 (MED)**
- `GET /menu/` — menu per ruolo via query param, nessuna auth (menu_router.py:13). Dato non sensibile (etichette). → **A1-10 (LOW)**

Nota: `vini_router.py` espone anche `POST /vini/{vino_id}/movimenti` e `GET /vini/{vino_id}/movimenti` che **hanno** `Depends(get_current_user)` (righe 427, 449) — protetti. Il router vini nel complesso è misto (carta pubblica + movimenti protetti), corretto.

---

## 3. Finding

```
[A1-01] SEVERITÀ: CRIT
Titolo: Modulo Banca completamente senza autenticazione — dati bancari leggibili e modificabili da chiunque
Evidenza: app/routers/banca_router.py:39 `router = APIRouter(prefix="/banca", tags=["banca"])` — nessun `dependencies=`. Zero occorrenze di `get_current_user` nel file (grep -c = 0). 28 endpoint montati incondizionatamente da main.py:649 `_mount("banca_router", banca_router.router)`. Esempi: GET /banca/movimenti (riga 399, ritorna tutti i movimenti bancari), POST /banca/import (riga 237, upload CSV estratto conto), DELETE /banca/categorie/map/{id} (riga 622), POST /banca/cross-ref/registra-bulk (riga 1697), DELETE /banca/duplicati/{keep_id} (riga 1970, cancella movimenti).
Impatto: L'app è internet-facing (https://trgb.tregobbi.it). Chiunque conosca/indovini gli URL può leggere l'intero estratto conto dell'osteria, importare CSV arbitrari, registrare e cancellare movimenti. Il CORS non protegge: vale solo per browser, non per curl/script. Esposizione totale dei dati finanziari + manomissione. Il middleware ReadOnlyViewerMiddleware NON aiuta: blocca solo il ruolo "viewer" CON token valido; una richiesta SENZA token passa (main.py:536 `except: pass`).
Fix proposto: aggiungere `dependencies=[Depends(get_current_user)]` alla dichiarazione APIRouter di banca_router (1 riga), come già fatto in admin_finance/dashboard/bevande. Valutare anche gate ruolo (contabile/admin) sugli endpoint di scrittura. — Effort: S
Modulo: banca
```

```
[A1-02] SEVERITÀ: HIGH
Titolo: Modulo iPratico Products senza autenticazione — upload e export file accessibili pubblicamente
Evidenza: app/routers/ipratico_products_router.py:30 `router = APIRouter(prefix="/vini/ipratico", ...)` senza `dependencies=`. grep -c get_current_user = 0. 11 endpoint. POST /vini/ipratico/upload (riga 111) accetta upload Excel e lo scrive su disco (riga 126 `saved_path = UPLOAD_DIR / f"ipratico_{ts}.xlsx"`); POST /vini/ipratico/export (riga 328) accetta upload e restituisce file; GET /trgb-wines, /mappings, /stats espongono dati catalogo.
Impatto: Endpoint internet-facing senza auth che scrivono file sul server (potenziale riempimento disco / abuso) ed espongono il catalogo prodotti+prezzi. Meno grave di banca (no dati finanziari diretti) ma comunque write su filesystem senza identità.
Fix proposto: aggiungere `dependencies=[Depends(get_current_user)]` all'APIRouter. — Effort: S
Modulo: vini (sub iPratico)
```

```
[A1-03] SEVERITÀ: HIGH
Titolo: SECRET_KEY JWT con fallback hardcoded committato — forgiabilità token admin se la env var manca
Evidenza: app/core/config.py:4 `SECRET_KEY = os.getenv("SECRET_KEY", "trgb_secret_key_2025")`. La stringa di default è in chiaro nel repo git (tracciato). Algoritmo HS256 (config.py:5), token firmati con questa chiave (security.py:28). Se sul VPS la env var SECRET_KEY non è settata, viene usato il default noto.
Impatto: Chiunque legga il sorgente (il prodotto sarà vendibile/distribuito, e il default è pubblico) può, SE il deploy non ha sovrascritto SECRET_KEY via env, forgiare un JWT valido con `{"sub":"admin","role":"superadmin"}` e ottenere accesso totale. Da verificare se env.production setta SECRET_KEY: in locali/tregobbi/deploy/env.production NON c'è SECRET_KEY (grep negativo) → il fallback hardcoded è probabilmente attivo in produzione. [PARZIALMENTE VERIFICATO: env.production non contiene SECRET_KEY; non ho accesso all'ambiente runtime del VPS per confermare che non sia iniettata altrove via systemd.]
Fix proposto: generare una SECRET_KEY random forte, metterla in env.production (fuori da git) e far fallire il boot (raise) se la env var manca, invece del fallback hardcoded. — Effort: S
Modulo: platform (auth)
Nota: leak storici di file .env in git [NON VERIFICATO] — comando `git log --diff-filter=A -- '*.env'` negato dalla sandbox. .gitignore copre `.env`/`.env.*` (righe 101-102), quindi a oggi non tracciati; resta da verificare la storia.
```

```
[A1-04] SEVERITÀ: HIGH
Titolo: Login a PIN 4-6 cifre senza rate limiting né lockout — brute force fattibile (e claim di sicurezza falso nel manuale)
Evidenza: POST /auth/login (auth_router.py:17) chiama authenticate_user (auth_service.py:94) — nessun conteggio tentativi, nessun delay, nessun lockout. requirements.txt non include slowapi/limiter; grep "limiter|RateLimit|slowapi" su main.py/app = 0. PIN: frontend accetta 4-6 cifre (LoginForm.jsx:69 `currentPin.length < 4`, riga 108 `next.length <= 6`). Spazio chiavi minimo 10^4 = 10.000 PIN. GET /auth/tiles (auth_router.py:11) espone la lista username → l'attaccante conosce gli utenti validi. Il manuale utente (docs/audit-2026-05-19/04_MANUALE_UTENTE.md:56) dichiara "Dopo 3 errori il login si blocca per 60 secondi (anti-bruteforce)" — questo meccanismo NON esiste nel codice (già segnalato come non verificato in VERIFICA_PLAUSIBILITA.md:127 e roadmap DH.8).
Impatto: Un PIN a 4 cifre senza throttling è forzabile in minuti/ore via script (10k tentativi). Username noti via /auth/tiles. Internet-facing. Compromissione account, inclusi admin se PIN corto. Il manuale promette una protezione inesistente → falsa sicurezza per Marco/staff.
Fix proposto: implementare lockout per-utente/IP (es. backoff progressivo dopo N tentativi) o rate limiter (slowapi); imporre PIN minimo 6 cifre per ruoli admin/contabile. Allineare il manuale alla realtà o implementare davvero il blocco 60s. — Effort: M
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

### Nota su SQL injection (nessun finding HIGH)
Ho verificato tutti i pattern `execute(f"...")` e identificatori interpolati (`{col}`, `{tbl}`, `{campo}`, `{order_sql}`, `{set_sql}`). In tutti i casi esaminati gli identificatori provengono da **whitelist interne**, non da input utente:
- `clienti_router.py:1385` `UPDATE clienti SET {campo}` → `campo` validato contro `campi_validi` (riga 1375-1383).
- `vini_cantina_tools_router.py:1480-1482` `{col}` → da `LOCATION_FIELDS[campo]["column"]`, con `campo` validato contro `LOCATION_FIELDS` (riga 1473).
- `vini_anagrafiche_router.py:972` `DROP TABLE {tbl}` → `tbl` da dict `TABELLE` interno.
- `reparti.py:90` `{SELECT_COLS}` → costante.
- `clienti_router.py:1978` / `controllo_gestione_router.py:1014` `ORDER BY {order_sql}` → da `order_map.get(...)` con default (righe 1951 / 907), non input grezzo.
- `fe_import.py:100` `ALTER TABLE ... ADD COLUMN {col} {typ}` → definizioni di migrazione interne.
- I valori (WHERE, LIKE `%{search}%`) usano sempre placeholder `?` con tuple di params (es. banca_router.py:430-431, statistiche_router.py:193).

I `{set_sql}` / `{', '.join(sets)}` negli UPDATE dinamici (es. fe_proforme:386, menu_carta:364, prenotazioni:710) costruiscono solo `campo = ?` con i valori parametrizzati — i nomi colonna derivano da chiavi note. **Conclusione: nessuna SQL injection da input utente individuata nel campione esaminato.** Rischio residuo basso e teorico, non sollevo finding.

### Nota su upload (validazione)
La maggior parte degli upload valida l'estensione (banca_router.py:245 `.csv`, ipratico:114 `.xlsx/.xls`, admin_finance:217 `.xlsb/.xlsx/.xls`, dipendenti:1902 `.pdf`). **Nessun upload impone un limite di dimensione massima** → possibile DoS per esaurimento memoria/disco (i file vengono letti interi in memoria con `await file.read()`, es. banca:248, ipratico:122). Lo segnalo qui come osservazione trasversale (severità LOW, non finding dedicato): aggiungere un check su `file.size`/streaming con cap.

---

## 4. Tabella riassuntiva

| Severità | N. | ID |
|---|---|---|
| CRIT | 1 | A1-01 |
| HIGH | 3 | A1-02, A1-03, A1-04 |
| MED  | 4 | A1-05, A1-06, A1-07, A1-08 |
| LOW  | 3 | A1-09, A1-10, A1-11 |
| **Totale** | **11** | |

Osservazioni trasversali senza finding dedicato: assenza di limite dimensione upload (LOW, DoS), `git log` su `.env` non verificabile in sandbox (leak storici [NON VERIFICATO]).

### Note per l'orchestratore
- **A1-01 (banca senza auth) e A1-03 (SECRET_KEY fallback) sono i due fix più urgenti e a basso costo (1 riga + 1 env var).** Vanno chiusi prima di qualsiasi go-live su trgb.it.
- A1-04 e la falsa promessa "blocco 60s" nel manuale: già in roadmap DH.8 come "da verificare" — qui confermato che il meccanismo NON esiste. Coordinare con chi cura il manuale.
- Possibile sovrapposizione con audit di area "infra/deploy": confermare se sul VPS systemd inietta SECRET_KEY (smentirebbe/aggraverebbe A1-03) — io non ho potuto accedere al runtime.
