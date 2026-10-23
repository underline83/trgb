# Modulo Sito (visite del sito) — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-10-23 (vs codice)
> **Vedi anche:** [modulo_statistiche.md](modulo_statistiche.md) (la pagina «Sito») · [modulo_prenotazioni.md](modulo_prenotazioni.md) (prenotazioni dal sito) · [connettore_mcp.md](connettore_mcp.md) (`visite_sito_riepilogo`)

**Classificazione:** `[core]` — serve a qualsiasi ristorante con un sito. **Nato:** 2026-10-23, mig 210, sistema 5.75.
**Manifesto:** `core/moduli/sito/module.json` · **Router:** `app/routers/sito_pubblico_router.py` (pubblico) · **Service:** `app/services/sito_visite_service.py` · **DB:** `sito.sqlite3` (`app/models/sito_db.py`)

---

## 1. Cosa fa

Marco vuole leggere in TRGB le visite del sito (www.tregobbi.it, statico su Aruba dal 2026-10-20) e capire se porta prenotazioni. Il sito manda a TRGB un evento per ogni pagina vista e per ogni clic sugli elementi con `data-obiettivo`. TRGB li conta; la pagina **Statistiche › Sito** li mostra accanto alle prenotazioni fatte dal sito.

**Perché modulo a sé e non dentro Statistiche (decisione 2026-10-23):** Statistiche è l'aggregatore read-only, senza tabelle proprie; qui invece si ricevono e si scrivono dati dall'esterno. Il modulo `sito` possiede raccolta, tabelle e riepilogo; Statistiche lo legge (endpoint 13) e lo affianca alle prenotazioni di `clienti.sqlite3`.

## 2. Privacy (vincolo, non opzione)

Niente cookie, niente localStorage per tracciare, niente IP o User-Agent salvati, niente fingerprint: così il sito non ha bisogno del banner di consenso.

- IP e User-Agent servono **solo in memoria**: filtro bot, limite di 120 eventi per IP ogni 10 minuti, hash del visitatore.
- **Visitatore del giorno:** `sha256(sale + IP + User-Agent)`, troncato a 16 caratteri. Il sale è casuale, sta in memoria e cambia a ogni giorno; non viene mai scritto. Quando il giorno si chiude l'hash viene azzerato (`visitatore = NULL`). Un riavvio del backend a metà giornata cambia il sale e gonfia un po' i visitatori di quel giorno.
- L'unico dato nel browser è il flag di esclusione `trgb_nonconto` (vedi §5): serve a non contare, non a tracciare.

## 3. Dati

`sito.sqlite3` nella cartella dati del locale (incluso nei backup: il backup prende tutti i `*.sqlite3`).

| Tabella | Contenuto |
|---|---|
| `sito_eventi` | una riga per evento: giorno, ora (0–23), tipo (`vista`/`clic`), pagina, lingua, provenienza (dominio, `diretto` o `interno`), utm_source/medium/campaign, dispositivo, obiettivo, visitatore (hash del giorno). Oltre 13 mesi: cancellate |
| `sito_giorni` | totali per giorno × dimensione (`viste`, `unici`, `pagina`, `lingua`, `provenienza`, `dispositivo`, `utm`, `ora`, `clic`) × valore. Restano per sempre |
| `sito_giorni_chiusi` | giorni già riassunti |
| `sito_stato` | data dell'ultima manutenzione |

**Manutenzione** (una volta al giorno, al primo evento o alla prima lettura): chiude i giorni passati in `sito_giorni`, azzera i loro hash, cancella gli eventi più vecchi di 13 mesi. Le letture usano `sito_giorni` per i giorni chiusi e gli eventi grezzi solo per oggi.

## 4. Endpoint

`POST /public/sito/evento` — pubblico, senza login. Corpo `text/plain` con JSON (così `sendBeacon` non fa il preflight CORS). Risponde **sempre 204** senza corpo. Scarta in silenzio:

- bot e programmi: User-Agent vuoto, che non comincia con `Mozilla/` o con parole da bot (bot, crawl, spider, headless, lighthouse, curl, python…);
- corpo più lungo di 2 KB, JSON malformato, `tipo` o `obiettivo` fuori dall'elenco, pagina che non è un percorso (`/…`);
- eventi che non arrivano da un dominio ammesso (header `Origin`, altrimenti `Referer`);
- pagine escluse (prefissi in configurazione, es. `/nuovo/`); le pagine `noindex` le esclude già lo snippet.

**Configurazione del locale** (`locali/<id>/locale.json` → `"sito"`), niente nel codice:

```json
"sito": { "domini": ["tregobbi.it"], "escludi": ["/nuovo/"] }
```

`domini` comprende i sottodomini e il `www`. Vuoto o assente = non si registra niente. Riletta ogni 60 secondi.

**Valori ammessi**

| Campo | Valori |
|---|---|
| `tipo` | `vista`, `clic` |
| `pagina` | percorso che comincia con `/` (query e `#` tolti), max 200 caratteri |
| `lingua` | due lettere (`it`, `en`, `fr`, `de`, `es`, `uk`) |
| `provenienza` | dominio del referrer, oppure vuoto / `diretto`. Il server mette `interno` se è il sito stesso |
| `utm_source`, `utm_medium`, `utm_campaign` | facoltativi, max 60 caratteri |
| `dispositivo` | `mobile`, `desktop` |
| `obiettivo` (solo clic) | `prenota_apri`, `telefono`, `whatsapp`, `email`, `pdf_menu`, `pdf_vini`, `mappa` |

Lettura: `GET /statistiche/sito?giorni=30&a=AAAA-MM-GG` (solo admin, vedi [modulo_statistiche.md](modulo_statistiche.md)) e lo strumento MCP `visite_sito_riepilogo`.

## 5. Lo snippet del sito

File: [`docs/snippet/sito_visite.js`](snippet/sito_visite.js). Va nel `<head>` o in fondo al `<body>` di `template/base.html` del sito; lo inserisce la sessione Underline Studio, che mette anche gli attributi `data-obiettivo` sui link (Prenota, telefono, WhatsApp, email, PDF, mappa).

- Una `vista` al caricamento, un `clic` su ogni elemento con `data-obiettivo` (ascolto unico sul documento).
- `?nonconto=1` nell'indirizzo → `localStorage.trgb_nonconto = "1"`, da quel browser non parte più niente; `?nonconto=0` lo toglie.
- Se la pagina ha `<meta name="robots" content="…noindex…">` non manda niente.
- Se il sito ha una Content-Security-Policy, `connect-src` deve comprendere `https://trgb.tregobbi.it`.

## 6. Pagina Statistiche › Sito

`frontend/src/pages/statistiche/StatisticheSito.jsx`, linguetta «Sito» (🌐) in `StatisticheNav`, visibile ad admin e superadmin e solo se il modulo `sito` è attivo. Periodi 7 / 30 / 90 giorni / 1 anno, ognuno contro il periodo subito prima della stessa lunghezza.

**Prenotazioni dal sito** = `clienti_prenotazioni` con `fonte` `widget` (widget TheFork, canale «Booking Module») o `sito` (widget TRGB), contate sul giorno in cui sono state **fatte** (`data_prenotazione`). È un confronto fra totali: nessun legame fra clic e persone. Il widget TheFork può stare anche su altri siti.

## 7. Capability

| Codice | Cosa fa | Riferimento | Audience | Docs |
|---|---|---|---|---|
| C-SI-001 | Riceve viste e clic dal sito, scarta bot e domini non ammessi, risponde sempre 204 | `sito_pubblico_router.py:evento`, `sito_visite_service.py:valida/registra` | pubblico (sito) | 🆕 |
| C-SI-002 | Chiusura giornaliera in `sito_giorni`, azzeramento hash, pulizia eventi oltre 13 mesi | `sito_visite_service.py:manutenzione` | sistema | 🆕 |
| C-SI-003 | Riepilogo di un periodo contro il precedente (viste, visitatori, pagine, lingue, provenienze, dispositivi, campagne, ore, clic) | `sito_visite_service.py:riepilogo` | admin | 🆕 |
| C-SI-004 | Pagina Statistiche › Sito con clic su Prenota accanto alle prenotazioni dal sito | `statistiche_router.py:sito_visite`, `StatisticheSito.jsx` | admin | 🆕 |
| C-SI-005 | Strumento MCP `visite_sito_riepilogo` (sola lettura) | `connettore/server.py:_strumenti_sito` | admin (Q) | 🆕 |

## 8. Prove dopo il push

```bash
# evento di prova → 204, la riga compare
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://trgb.tregobbi.it/public/sito/evento \
  -H "Origin: https://www.tregobbi.it" -H "Content-Type: text/plain" \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" \
  -d '{"tipo":"vista","pagina":"/prova-trgb/","lingua":"it","provenienza":"diretto","dispositivo":"desktop"}'
# stesso evento come Googlebot → 204, ma niente riga
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://trgb.tregobbi.it/public/sito/evento \
  -H "Origin: https://www.tregobbi.it" -H "Content-Type: text/plain" \
  -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  -d '{"tipo":"vista","pagina":"/prova-googlebot/","lingua":"it"}'
```

Poi Statistiche › Sito: «/prova-trgb/» fra le pagine, «/prova-googlebot/» no. Senza `-A` browser e senza `Origin` del sito l'evento viene scartato apposta.
