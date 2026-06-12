# 09 — Readiness prodotto vendibile

**Data:** 2026-06-12 · **Commit:** `1f5f9c17` · **Versione prodotto:** 5.24
**Area:** A9 — Readiness prodotto · **Metodo:** analisi statica (`locali/trgb/`, `locali/_template/`, runbook, push.sh, script backup, migrazioni, module_loader) + correzioni post-verifica avversaria (A9-02 riformulato).

> ## Voto area Prodotto: **55/100**
> L'architettura locale (R1-R8) è solida all'~80%: non servono refactor, servono **chiusure puntuali + UN test vero end-to-end + il pacchetto legale (oggi assente al 100%)**. Cliente #1 onboardabile in **2-4 settimane di calendario** (~5-7 giornate dev + legale in parallelo).

---

## 1. Istanza `locali/trgb/` e `locali/_template/` — PULITE ✅

Grep `tre gobbi|tregobbi|bergamo|carminati|P.IVA` su `locali/trgb/` e `locali/_template/`: **zero residui Tre Gobbi nei valori** (solo commenti esplicativi).

| File | Stato |
|---|---|
| `locali/trgb/locale.json` | ✅ id=trgb, dominio=trgb.it, valuta EUR |
| `locali/trgb/branding.json` | ✅ Palette TRGB-02 = branding del PRODOTTO (scelta deliberata "come Shopify resta Shopify"), client_pdf neutro |
| `locali/trgb/strings.json` | ✅ pdf/wa/page generici "TRGB" |
| `locali/trgb/moduli_attivi.json` | ✅ `{"moduli": ["*"]}` (demo full) |
| `locali/trgb/data/` | ✅ vuota (solo `.gitkeep`) |
| `locali/trgb/deploy/env.production` | ✅ pronto (porta 8001, service `trgb-backend-trgb`; go-live non fatto) |
| `locali/_template/` | ✅ 4 `.template` + env template, placeholder ovunque |
| `locali/test_demo/` | ⚠️ minimale: solo moduli_attivi.json → cade nei fallback tregobbi (A9-08) |

Note: (1) `manifest.template.json` citato in `architettura_locale.md:36` non esiste in `_template/`; (2) il workflow §5 Passo 1 dimentica il rename di `moduli_attivi.json.template` → A9-14.

---

## 2. Checklist onboarding cliente #1 (passo → pronto/manca)

Riferimenti: `docs/architettura_locale.md` §5 + `docs/installazione_nuovo_server.md` (659 righe, **mai testato end-to-end**: roadmap S.2 aperto).

| # | Passo | Stato | Cosa manca |
|---|---|---|---|
| 1 | Scaffold `cp -r locali/_template locali/<id>` + rename | 🟡 quasi pronto | Doc dimentica rename moduli_attivi (A9-14) |
| 2 | Personalizzazione config | 🔴 doc fuorviante | Esempi runbook §4.2 con schemi SBAGLIATI; chiave `modules` invece di `moduli` = tutti i moduli attivi (A9-04) |
| 3 | Asset cliente in `locali/<id>/assets/` | ✅ pronto | — |
| 4 | Init DB vuoti da migrazioni | 🔴 contaminato | Mig 047+048 inserirebbero i prestiti BPM reali di Marco nel CG del cliente (A9-01 CRIT); skip TRGB_SPECIFIC copre solo 097/099/100 |
| 5 | Build frontend per il locale | 🔴 bloccante | `frontend/.env.production` hardcoda `VITE_API_BASE_URL=https://trgb.tregobbi.it` → la build di QUALSIASI cliente chiama il backend dell'osteria (A9-03) |
| 6 | `./push.sh -l <locale>` | 🟡 parziale | Flag `-l` funziona, ma 4 punti restano hardcoded tregobbi/trgb-backend (A9-06) |
| 7 | Systemd service | 🟡 manuale ok | La unit del runbook NON setta `SECRET_KEY` → JWT con chiave default nota (A9-02 CRIT) |
| 8 | Nginx + SSL | 🟡 incoerente | Vhost §6.1 proxya solo `/api/` ma il FE chiama endpoint SENZA prefisso /api (A9-07) |
| 9 | Git remote + hook post-receive | ✅ documentato | ~10 min manuali |
| 10 | Backup + cron | 🔴 non parametrizzati | Script hardcodati su `/home/marco/trgb/trgb` + `locali/tregobbi/data` (A9-05) |
| 11 | Primo utente admin | ✅ pronto | Auto-bootstrap PIN random 6 cifre a log |
| 12 | Consegna cliente | 🟡 incompleto | Manuale utente "TODO"; zero documenti legali (A9-11, A9-13) |

**Verdetto:** 4 bloccanti tecnici puntuali (seed 047/048, SECRET_KEY, VITE_API_BASE_URL, script backup) + runbook da testare davvero (S.2) + pacchetto legale assente.

---

## 3. Multi-tenancy: parametrizzato vs hardcoded

**Già parametrizzato ✅:** `TRGB_LOCALE` letto da backend/runner/loader/uploads/DB path (`locale_data_path` fail-loud, no fallback da R6.5 push 3); `push.sh -l` sourcea `locali/<id>/deploy/env.production`; branding/strings/moduli via endpoint runtime; discovery dinamica DB.

**Ancora hardcoded tregobbi/marco ❌:** `push.sh` :416/:422 (modules.json), :498/:511 (restore runtime su `app/data`), :528 e :543-544 (restart servizi fissi), :195 (backup status legacy); `scripts/backup_db.sh:28-30` e `check_backup_health.sh:28-36` (PROJECT_DIR/LOCALE/venv); `setup-backup-and-security.sh:15-17`; hook post-receive (runbook §7.2); `main.py:486-491` (CORS); fallback branding/strings → tregobbi; `frontend/.env.production`.

**Scenario 5 clienti** (VPS dedicato, il più sano oggi): tutto manuale, zero provisioning scriptato — 90-120 min dichiarati ma credibili solo POST-fix. **Scenario stesso-VPS (trgb.it)**: irrisolto il `frontend/dist` unico condiviso + hook che riavvia solo il backend tregobbi (A9-09) — da decidere prima del go-live demo.

---

## 4. Legale / GDPR — assente al 100%

Il sistema tratta: PII clienti CRM (nomi, telefoni, email, compleanni, storico TheFork), dipendenti (**cedolini PDF** in chiaro), dati finanziari. Ricerca `gdpr|privacy|trattament|retention|licenza|contratto|sla|encrypt` su docs/ e codice:

- Privacy policy, registro trattamenti, DPA, nomine: **assenti**
- Data retention: esiste solo per i BACKUP, non per i DATI personali
- Cifratura at-rest: assente (SQLite, cedolini e backup Drive in chiaro)
- LICENSE, ToS, SLA, bozza contratto: **assenti** (esiste solo `commerciale_brochure_v5.docx`)
- Runbook §0 ammette Drive "account aziendale tuo" per i dati del cliente → servirebbe DPA, oggi inesistente

Per il cliente zero (Marco tratta i propri dati) va bene così. Per il cliente #1 pagante è materiale necessario **PRIMA della firma**.

---

## 5. Finding (2 CRIT · 4 HIGH · 6 MED · 4 LOW = 16)

```
[A9-01] SEVERITÀ: CRIT — confermato dalla verifica avversaria
Titolo: Migrazioni 047/048 inseriscono i prestiti BPM reali di Marco in ogni DB nuovo (non flaggate TRGB_SPECIFIC)
Evidenza: app/migrations/047_prestiti_bpm.py (INSERT INTO cg_spese_fisse + ~192 cg_uscite con importi reali "€152.351,27 / residuo €34.404,71"); 048_cg_piano_rate.py:32 popola da quei prestiti; MIGRATIONS_TRGB.md dichiara flaggate solo 097/099/100; migration_runner.py:127 salta solo le flaggate. Verifica avversaria: nessun guard interno per locale; girano su foodcost.db, l'unico DB processato dal runner.
Impatto: ogni locale nuovo (incluso il demo trgb.it visibile a clienti potenziali) parte con i dati finanziari personali di Marco nel Controllo Gestione: leak privacy + contabilità del cliente sporcata dal giorno 1.
Fix proposto: TRGB_SPECIFIC=True su 047 e 048 + ri-audit delle 44 migrazioni con INSERT + aggiornare MIGRATIONS_TRGB.md. — Effort: S
Modulo: controllo_gestione / platform
```

```
[A9-02] SEVERITÀ: CRIT — confermato, IMPATTO RIFORMULATO post-verifica
Titolo: SECRET_KEY JWT con default hardcoded nel repo, mai settata dal runbook → ogni NUOVA installazione firma token con chiave pubblica nota
Evidenza: app/core/config.py:4 `SECRET_KEY = os.getenv("SECRET_KEY", "trgb_secret_key_2025")`; la unit systemd del runbook (installazione_nuovo_server.md §5.1) setta solo PYTHONPATH e TRGB_LOCALE; grep SECRET_KEY su locali/ e su tutto il runbook = 0; nessuna menzione di creare un .env.
Impatto (riformulato): vale per le NUOVE INSTALLAZIONI che seguono il runbook — NON per tregobbi: la verifica live (raw_A6_live.md §6) ha trovato sul VPS `.env` con riga SECRET* + python-dotenv nel venv, quindi l'osteria in produzione usa quasi certamente una chiave custom. Ma il cliente #1 (e il demo trgb.it) installati dal runbook firmerebbero JWT con la chiave default presente nel repo (anche su GitHub): chiunque la legga può forgiare token superadmin per quell'installazione. Bloccante pre-cliente #1.
Fix proposto: SECRET_KEY per-installazione (env in systemd unit o secret file gitignored in locali/<id>/), fail-loud al boot in produzione se manca, aggiungere al runbook §5.1 e al template env. — Effort: S
Modulo: platform
```

```
[A9-03] SEVERITÀ: HIGH — confermato
Titolo: Build frontend di qualsiasi cliente punta al backend dell'osteria
Evidenza: frontend/.env.production:1 `VITE_API_BASE_URL=https://trgb.tregobbi.it`; config/api.js:2 lo usa senza fallback a window.location.origin; runbook §3.3 fa solo `npm run build`; nessun meccanismo per-locale (grep VITE_API su vite.config.js e push.sh = 0).
Impatto: il cliente #1 che segue il runbook ottiene una SPA che manda login e dati a trgb.tregobbi.it. Onboarding bloccato (o peggio: dati del cliente verso il server di Marco).
Fix proposto: default a window.location.origin oppure build con env per-locale documentata nel runbook. — Effort: S
Modulo: platform
```

```
[A9-04] SEVERITÀ: HIGH — confermato
Titolo: Runbook installazione con schemi config sbagliati — l'esempio moduli_attivi.json attiva TUTTO
Evidenza: installazione_nuovo_server.md §4.2 esempio `{"modules": [...]}` ma module_loader.py:78 legge `data.get("moduli", ["*"])` → chiave sbagliata = wildcard = tutti i moduli attivi. Branding/strings di esempio con chiavi inesistenti rispetto ai .template reali; rename dei .template mai menzionato. Runbook mai testato (S.2 aperto).
Impatto: cliente che compra "solo Vini" si ritrova 13 moduli attivi (vendita modulare vanificata); branding/strings non applicati; onboarding fallisce seguendo il doc alla lettera.
Fix proposto: riallineare §4.2 agli schemi reali, step rename, validare moduli_attivi.json al boot (warn se chiave "moduli" assente); eseguire S.2. — Effort: M
Modulo: docs / platform
```

```
[A9-05] SEVERITÀ: HIGH — confermato
Titolo: Script backup hardcodati su /home/marco + locali/tregobbi — per il cliente #1 i backup non girano
Evidenza: scripts/backup_db.sh:28-30 e check_backup_health.sh:28-36 con assegnazioni secche (non `${VAR:-default}`, nessun override env possibile); setup-backup-and-security.sh:15-17 idem; il runbook §8.4-8.5 non dice mai di editarli.
Impatto: su VPS con user≠marco o locale≠tregobbi il cron gira ma non trova nulla: perdita dati silenziosa per il cliente — lo scenario S60-INC1 senza rete di salvataggio.
Fix proposto: parametrizzare PROJECT_DIR/LOCALE via env o auto-detect; far fallire rumorosamente check_backup_health se la dir non esiste. — Effort: M
Modulo: infra
```

```
[A9-06] SEVERITÀ: HIGH — confermato
Titolo: push.sh -l <locale> deploya ma 4 sezioni restano hardcoded tregobbi/trgb-backend
Evidenza: push.sh:416+422 (modules.json su locali/tregobbi/), :498+511 (restore runtime su app/data legacy), :528 (restart trgb-backend fisso con -m), :543-544 (idem con -f), :195 (backup status legacy). Le variabili giuste ($BACKEND_SERVICE ecc.) esistono post-source ma non sono usate proprio lì.
Impatto: `./push.sh -l cliente_x -m` su VPS condiviso riavvierebbe il backend dell'OSTERIA invece del cliente; restore/confronto runtime file sul locale sbagliato.
Fix proposto: sostituire i 4 punti con le variabili già disponibili. — Effort: S
Modulo: infra
```

```
[A9-07] SEVERITÀ: MED
Titolo: Vhost nginx del runbook incompatibile con come il frontend chiama le API
Evidenza: §6.1 proxya solo /api/, /locale/, /carta ma API_BASE è l'origin nudo e gli endpoint non hanno prefisso /api → ogni chiamata cade nel try_files statico; lo smoke test §10 passerebbe per il motivo sbagliato (index.html).
Impatto: installazione nuova non funzionante anche eseguendo il runbook alla perfezione.
Fix proposto: copiare nel runbook la config nginx REALE di trgb.tregobbi.it (o introdurre prefisso /api uniforme). Parte del test S.2. — Effort: S
Modulo: docs / infra
```

```
[A9-08] SEVERITÀ: MED
Titolo: Fallback branding e strings → tregobbi: un locale mal configurato mostra "Osteria Tre Gobbi" al cliente
Evidenza: main.py:442-444 e locale_strings.py:35 (fallback a tregobbi); caso reale già nel repo: locali/test_demo/ senza branding/strings eredita brand e firme WA/PDF dell'osteria.
Impatto: demo o cliente con typo nel locale id si presenta brandizzato Tre Gobbi — figuraccia commerciale e leak identità del cliente zero.
Fix proposto: cambiare il fallback da tregobbi a locali/trgb/ (branding del prodotto) in entrambi gli helper. — Effort: S
Modulo: platform
```

```
[A9-09] SEVERITÀ: MED
Titolo: Due locali sullo stesso VPS (piano trgb.it): frontend/dist unico e hook che riavvia solo tregobbi
Evidenza: locali/trgb/deploy/env.production con stesso VPS_DIR di tregobbi; un solo working dir = un solo frontend/dist; hook post-receive riavvia solo trgb-backend.
Impatto: il go-live di trgb.it (demo per i clienti) non ha runbook praticabile: build collidono, push per un locale lascia l'altro su codice vecchio.
Fix proposto: decidere e documentare la topologia dual-service (dist per-locale + outDir vite parametrico + hook per-servizio) PRIMA del go-live. — Effort: M
Modulo: infra
```

```
[A9-10] SEVERITÀ: MED
Titolo: Router non mappati in module.json attivi di default per TUTTI i locali
Evidenza: module_loader.py:135-145 → `module_id is None: return True`. Già successo 4 volte in un mese (A5-01).
Impatto: ogni router nuovo dimenticato fuori dai manifesti viene esposto anche ai clienti che NON hanno comprato il modulo → erosione silenziosa della vendita modulare.
Fix proposto: warning al boot con elenco router non classificati + check guardiano L1 in push.sh (DH.7). — Effort: S
Modulo: platform
```

```
[A9-11] SEVERITÀ: MED
Titolo: GDPR/legale: zero documenti per trattare dati personali di un cliente pagante
Evidenza: vedi §4. DB e cedolini PDF in chiaro; backup in chiaro su Google Drive; Drive "account aziendale tuo" = Marco sub-processor senza DPA.
Impatto: vendere a un cliente #1 senza privacy policy, DPA e nomine espone Marco a responsabilità GDPR dirette (cedolini dipendenti del cliente = categoria delicata).
Fix proposto: pacchetto minimo con consulente: privacy policy, DPA, registro trattamenti template, retention dichiarata, decisione cifratura backup (es. rclone crypt). Prerequisito commerciale, non codice. — Effort: L (1-2 settimane elapsed, parallelo)
Modulo: docs
```

```
[A9-12] SEVERITÀ: MED
Titolo: Dati personali reali hardcoded nel codice sorgente distribuito a ogni installazione
Evidenza: 060_pulizia_stipendi_duplicati.py:9-19 (nomi e stipendi reali), 061_escludi_fornitori_fittizi.py:8-11 (nomi locatori privati), 110_bonifica_fatture_audit_marco.py (importi/fornitori reali). Il repo va su GitHub e su ogni VPS cliente.
Impatto: PII di terzi (dipendenti, locatori) nel codice verso ogni cliente futuro; igiene GDPR e immagine prodotto.
Fix proposto: policy "niente PII nei docstring delle migrazioni"; per l'esistente valutare riscrittura docstring (la history git resta — accettato, ma smettere di aggiungerne). — Effort: S
Modulo: platform / docs
```

```
[A9-13] SEVERITÀ: LOW
Titolo: Nessuna licenza del codice né bozza contratto di vendita/canone
Evidenza: nessun LICENSE* in root; nessuna bozza contratto in docs/; runbook parla di "vendere una licenza TRGB" mai definita; roadmap S senza voce contratto.
Fix proposto: voce roadmap S "pacchetto contrattuale" (contratto canone + EULA semplice) col consulente, insieme ad A9-11. — Effort: M (elapsed, non-dev)
Modulo: docs
```

```
[A9-14] SEVERITÀ: LOW
Titolo: Workflow scaffold in architettura_locale.md dimentica moduli_attivi.json (e manifest.template.json non esiste)
Evidenza: architettura_locale.md:100-107 (Passo 1 senza rename moduli_attivi); file mancante → wildcard tutti attivi; :36 cita manifest.template.json inesistente.
Fix proposto: aggiungere il rename al Passo 1 + sistemare il riferimento al manifest. — Effort: S
Modulo: docs
```

```
[A9-15] SEVERITÀ: LOW
Titolo: CORS origins hardcoded ai domini tregobbi
Evidenza: main.py:486-491.
Impatto: irrilevante nella topologia attuale (same-origin), ma trgb.it o clienti con FE/BE su origin diversi verrebbero bloccati in modo non ovvio.
Fix proposto: aggiungere il DOMAIN del locale corrente alla lista al boot. — Effort: S
Modulo: platform
```

```
[A9-16] SEVERITÀ: LOW
Titolo: Boot/migrazioni da zero per un locale nuovo mai verificati end-to-end (S.2 aperto)
Evidenza: roadmap.md:678 S.2 aperto; la verifica R3 testò solo lo SKIP delle 3 mig flaggate, non la catena completa 001→146 su DB vergine; gli altri 9 DB nascono dagli init_*_database() (non documentato).
Impatto: il primo vero test della catena di onboarding avverrebbe a casa del cliente #1. Si lega ad A2-01 (migrazioni skip registrate → colonne mancanti su DB freschi).
Fix proposto: eseguire S.2 come prova generale (locale fittizio, DB da zero, boot, smoke moduli) prima della firma. — Effort: M (1 giornata)
Modulo: infra / docs
```

---

## 6. Stima effort "da oggi a cliente #1 onboardato"

| Blocco | Contenuto | Effort stimato |
|---|---|---|
| Fix tecnici bloccanti | A9-01 (flag 047/048 + ri-audit INSERT), A9-02 (SECRET_KEY), A9-03 (VITE_API_BASE_URL), A9-05 (script backup), A9-06 (push.sh) | **2-3 giornate dev** |
| Runbook e fallback | A9-04 + A9-07 + A9-08 + A9-14 | **1 giornata dev** |
| Prova generale | A9-16: test S.2 completo su locale fittizio/trgb.it (chiude anche A9-09 se VPS condiviso) + A2-01 | **1-2 giornate** |
| Legale | A9-11 + A9-13 con consulente | **1-2 settimane elapsed (parallelo)** |
| Onboarding per-cliente a regime | runbook post-fix (90-120 min credibili) + branding + DNS/SSL/rclone | **0,5-1 giornata/cliente** |

**Totale realistico: ~5-7 giornate di lavoro tecnico + pacchetto legale in parallelo → cliente #1 onboardabile in 2-4 settimane di calendario.**

---

## 7. Positivi (perché 55 e non meno)

- **`locali/trgb/` e `locali/_template/` davvero puliti**: zero residui Tre Gobbi nei valori, schemi coerenti, palette prodotto deliberata.
- **Architettura locale solida ~80%**: `TRGB_LOCALE` + helper (`locale_data_path` fail-loud, uploads tenant-aware, strings `t()`, branding endpoint, module_loader con cache e banner) funzionano; le violazioni residue sono puntuali ed elencate, non sistemiche.
- **`push.sh -l` esiste e sourcea l'env per-locale**: i 4 punti hardcoded sono fix da poche righe.
- **Primo utente admin con bootstrap automatico** sicuro (PIN random a log).
- Migration runner con skip TRGB_SPECIFIC: il meccanismo c'è, va solo esteso a 047/048.

**Motivazione del voto 55/100:** l'impianto c'è e regge la verifica avversaria (tutti i finding A9 campionati confermati), ma OGGI un onboarding seguendo i doc alla lettera fallirebbe in almeno 4 punti (build FE, nginx, moduli wildcard, backup) e consegnerebbe al cliente i prestiti BPM di Marco e una SECRET_KEY pubblica. Il gap legale è totale. Nessuno di questi richiede refactor: è un debito di "ultimo miglio" + un test mai fatto.
