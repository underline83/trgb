# Audit A5 — Architettura modulare e separazione core/locale
**Data:** 2026-06-12 · **Auditor:** subagente A5 · **Repo:** `/Users/underline83/trgb` (branch main, HEAD `1f5f9c17`)

---

## 1. Metodologia e copertura

**Fonti lette integralmente:**
- `CLAUDE.md` (5 regole disciplina modulare)
- `docs/refactor_monorepo.md` §3 R7/R8, §5, §6 (stato R1-R8c tutti ✅ FATTO)
- `docs/architettura_locale.md` (esiste, 173 righe)
- `app/platform/module_loader.py` (222 righe, lettura completa)
- Tutti i 14 `core/moduli/<id>/module.json`
- `main.py` righe 215-731 (montaggio `_mount` + `/system/info` + `/system/modules`)
- `frontend/src/utils/activeModules.js` (lettura completa)
- `locali/{tregobbi,trgb,test_demo}/moduli_attivi.json`

**Verifiche via grep sistematico (output citato nei finding):**
- Regola 1: `grep "Modulo:"` su tutti i 50 `app/routers/*.py` + `grep "// Modulo:"` su `frontend/src`
- Regola 2: `grep "from app.routers\.|import app.routers"` su `app/routers/*.py` e `app/services/*.py` → censimento COMPLETO (11 hit router + 1 hit service)
- Regola 4: **campione, non censimento esaustivo** — 4 tabelle sonda (`cg_uscite`, `shift_closures`/`daily_closures`, `fe_fatture`, `clienti_prenotazioni`) cercate in tutti i router
- Regola 5: confronto manifesti vs lista reale router (completo); tabelle dichiarate vs DB **non verificato direttamente** (sqlite3 negato dall'ambiente) — verifica tabelle rinviata ad A2
- Separazione core/locale: `grep -rni "tregobbi|tre gobbi"` su `app/` (*.py) e `core/`; `grep "app/data"` su codice eseguibile
- Etichette commit: `git log --oneline --since=2026-04-28` (264 commit)

**Limiti dichiarati:**
- Nessuna esecuzione runtime (niente boot backend con `TRGB_LOCALE=test_demo`): le conclusioni su "cosa succede con moduli spenti" derivano da lettura statica del codice, non da probe HTTP.
- Frontend: analizzati `App.jsx`, `activeModules.js`, usage di `useActiveModules` (4 file); le altre ~227 pagine/componenti jsx campionate solo per la regola 1.
- Regola 3 (prefissi tabelle DB): **rinviata ad A2** — vedi nota §3.

---

## 2. Quadro di sintesi

Il refactor R1-R8 è sostanzialmente solido: `module_loader` è ben scritto (cache, backward-compat, banner diagnostico), il montaggio condizionale in `main.py` copre tutti gli `include_router`, la separazione `locali/` funziona (strings, branding, data path, migrazioni seed skippate). **Ma lo "spegnimento" di un modulo è oggi efficace solo sul montaggio dei router e sul menu FE**: dashboard platform, alert engine, task scheduler e route frontend NON sono module-aware, e 4 router nati dopo R8a non sono mappati in nessun manifesto (→ sempre montati). Il claim di prodotto "cliente compra solo Vini → il resto inesistente per lui" non regge ancora a una verifica end-to-end.

---

## 3. Nota di rinvio — Regola 3 (prefissi DB)

La verifica dei prefissi tabella per modulo è coperta dall'area **A2** e qui non ripetuta. Segnalo solo, perché emerso dai manifesti (competenza A5): il modulo `ricette` dichiara in `core/moduli/ricette/module.json:27-42` tabelle senza prefisso modulo (`recipes`, `ingredients`, `service_types`, ...) — coerente con lo storico ma in deroga alla regola 3; e `cash_deposits` è dichiarata da DUE manifesti (vedi A5-09).

---

## 4. Finding

### [A5-01] SEVERITÀ: HIGH
**Titolo:** 4 router non mappati in nessun `module.json` → sempre montati anche con modulo spento (drift post-R8a)
**Evidenza:**
- I manifesti mappano 46 router; in `app/routers/` ce ne sono 50. Diff (confronto manifesti vs `ls app/routers/*.py`): `vini_anagrafiche_router`, `vini_v2_router`, `banca_carta_router`, `piatti_giorno_router`.
- Montati incondizionatamente di fatto: `main.py:603-604` (vini_anagrafiche, vini_v2), `main.py:650` (banca_carta), `main.py:698` (piatti_giorno).
- Comportamento default del loader: `app/platform/module_loader.py:139-144` — «Router senza mapping (...): default True».
- I 4 file dichiarano il modulo in commento (`vini_v2_router.py:1` "Modulo: vini", `banca_carta_router.py:1` "Modulo: banca", `piatti_giorno_router.py:3` "Modulo: cucina (selezioni)", `vini_anagrafiche_router.py:1` "Modulo: vini") ma nessuno ha aggiornato il manifesto.
- Riscontro storico: `docs/refactor_monorepo.md` §6 riga R8b documenta «46/46 montati, test_demo 18/46» — i 4 router sono nati dopo R8 (V.6-V.8 vini 2, carta credito banca, piatti del giorno) senza toccare i module.json.
**Impatto:** con `TRGB_LOCALE=test_demo` (`{"moduli": ["vini","cassa"]}`), gli endpoint di `banca_carta_router` (modulo banca, SPENTO) e `piatti_giorno_router` (cucina/ricette, SPENTO) restano raggiungibili. Un cliente che non ha comprato Banca vede comunque le sue API attive. Inoltre il drift dimostra che il processo "nuovo router → aggiorna manifesto" non ha enforcement.
**Fix proposto:** aggiungere i 4 router ai rispettivi `module.json` (vini ×2, banca ×1, cucina o ricette ×1 — decidere con Marco per piatti_giorno, vedi A5-09); valutare di cambiare il default del loader da "monta" ad almeno un WARNING a boot elencando i router non classificati (il banner già esiste). Aggiungere check in `push.sh` guardiano L1 (roadmap DH.7). — Effort: S
**Modulo:** platform (loader) + vini/banca/cucina

### [A5-02] SEVERITÀ: HIGH
**Titolo:** `GET /dashboard/home` (platform, sempre montato) ignora i moduli attivi: legge dati di tutti i moduli E scrive (notifiche + istanze checklist) per moduli spenti
**Evidenza:**
- `app/routers/dashboard_router.py` non importa mai `module_loader` (grep `is_module_active|module_loader` su tutto `app/`: unico file utilizzatore è `main.py`).
- `dashboard_router.py:1197-1290` (`_moduli_summary`): costruisce summary per prenotazioni, vendite, vini, ecc. incondizionatamente, con query SQL dirette ai DB dei moduli (es. riga 1232 `locale_data_path("vini.sqlite3")`).
- `dashboard_router.py:1518-1522`: trigger `run_all_checks(dry_run=False)` (alert engine, scrive notifiche) a ogni chiamata.
- `dashboard_router.py:1524-1530`: trigger `tasks_scheduler.trigger_scheduler(days_ahead=1)` → genera istanze checklist del modulo `task_manager` anche se spento.
**Impatto:** su un locale con moduli parziali, la Home: (a) restituisce nel payload `moduli[]` e nei widget dati di moduli che il cliente non ha comprato; (b) effettua SCRITTURE per moduli spenti (notifiche fatture/dipendenti/CG, istanze checklist task_manager). Lo spegnimento è quindi solo cosmetico a livello dashboard. Su tregobbi (wildcard) impatto zero.
**Fix proposto:** in `dashboard_router`, filtrare `_moduli_summary` e i widget con `module_loader.is_module_active(...)`; condizionare i due trigger fire-and-forget (`run_all_checks` solo per checker di moduli attivi — vedi A5-03; `trigger_scheduler` solo se `task_manager` attivo). — Effort: M
**Modulo:** platform

### [A5-03] SEVERITÀ: MED
**Titolo:** Alert engine M.F non module-aware: i 6 checker girano sempre, anche per moduli spenti
**Evidenza:** `app/services/alert_engine.py:206,301,394,628,647,676` — checker `fatture_scadenza` (acquisti), `dipendenti_scadenze` (dipendenti), `vini_sottoscorta` (vini), `cg_scadenze_*` ×3 (controllo_gestione). Nessun import di `module_loader` nel file. Trigger: `alerts_router.py:46,64` (router platform, sempre montato → `/alerts/run/` disponibile su ogni locale) + trigger automatico da dashboard (A5-02).
**Impatto:** su un locale senza `dipendenti`/`acquisti`/`controllo_gestione`, i checker girano comunque: query su tabelle di moduli spenti e potenziale creazione di notifiche che puntano a pagine inesistenti per quel cliente (badge che linkano a route di moduli spenti).
**Fix proposto:** aggiungere al decorator `@register_checker` (o a `run_all_checks`) un campo `module_id` e skippare i checker il cui modulo non è attivo. 1 punto di modifica, retrocompatibile. — Effort: S
**Modulo:** platform (M.F)

### [A5-04] SEVERITÀ: MED
**Titolo:** Frontend: `activeModules` filtra solo menu Header e card Home — le 156 route di `App.jsx` restano tutte registrate
**Evidenza:**
- `grep -c "<Route" frontend/src/App.jsx` → 156; `grep "activeModules|isMenuKeyActive|isModuleActive" App.jsx` → 0 match.
- Utilizzatori reali di `activeModules.js`: solo `main.jsx` (boot load), `components/Header.jsx` (filtro dropdown), `pages/Home.jsx` (filtro card) — grep -l su tutto `frontend/src`.
**Impatto:** su un locale con moduli parziali, un URL digitato/bookmarkato (es. `/dipendenti`) apre la pagina del modulo spento: la UI si renderizza e tutte le chiamate API rispondono 404 → pagina rotta invece di redirect/"modulo non attivo". Esperienza prodotto scadente e percezione di bug; non è un problema di sicurezza (i dati non ci sono, il backend è davvero spento).
**Fix proposto:** wrappare le route per modulo in un guard component (es. `<ModuleRoute menuKey="dipendenti">`) che usa `isMenuKeyActive` e fa redirect a Home o mostra EmptyState "modulo non attivo"; in alternativa filtrare l'array route prima della registrazione. — Effort: M
**Modulo:** platform (UI)

### [A5-05] SEVERITÀ: MED
**Titolo:** Regola 2/4 — `turni_service` (dipendenti) importa una funzione dal router `closures_config_router` (cassa): unico import cross-modulo trovato
**Evidenza:** `app/services/turni_service.py:655` — `from app.routers.closures_config_router import get_closures_config` (dentro `_get_closures_cfg`, con try/except fallback `{}`). Mappa: `turni_service` serve `turni_router` → modulo `dipendenti` (`core/moduli/dipendenti/module.json:12`); `closures_config_router` → modulo `cassa` (`core/moduli/cassa/module.json:12`).
**Impatto:** dipendenza dipendenti→cassa realizzata importando un ROUTER di altro modulo invece di un servizio platform. Funziona anche a modulo cassa spento (il file esiste, semplicemente non è montato), ma viola la regola 2/4 di CLAUDE.md e a R-future (cartelle `core/moduli/<id>/` fisiche) si romperebbe. Mitigato dal try/except.
**Fix proposto:** estrarre `get_closures_config()` in un servizio platform (es. `app/services/closures_config_service.py`) usato sia dal router cassa sia da turni_service. — Effort: S
**Modulo:** dipendenti (+ cassa)

### [A5-06] SEVERITÀ: MED
**Titolo:** Regola 4 — accessi SQL diretti cross-modulo diffusi nei router (campione 4 tabelle), senza servizio-ponte né guard sui moduli attivi
**Evidenza (campione dichiarato, non censimento):**
- `cg_uscite` (modulo controllo_gestione) letta/scritta da router di ALTRI moduli: `dipendenti.py:1434,1490,1509` (genera/aggiorna righe stipendio in cg_uscite), `fe_import.py:950` e `fattureincloud_router.py` (acquisti), `fe_proforme_router.py`, `banca_router.py` + `banca_carta_router.py` (banca), `admin_finance.py` (cassa). [dashboard_router = platform, tollerato]
- `shift_closures`/`daily_closures` (cassa) lette da `controllo_gestione_router.py:133-134`.
- `fe_fatture` (acquisti) letta da `banca_router.py`, `controllo_gestione_router.py`, `foodcost_matching_router.py:297,341,454` (ricette).
- `clienti_prenotazioni` (prenotazioni) scritta da `clienti_router.py:738-754` (sync TheFork: INSERT/UPDATE).
- Eccezione consentita `statistiche` read-only: non coinvolta nei casi sopra.
**Impatto:** le dipendenze sono dichiarate nei manifesti come `dipendenze_opzionali` (coerente), ma realizzate con SQL inline nel router invece che via servizio platform (regola 4) e SENZA guard runtime: es. con `controllo_gestione` spento, l'import buste paga continua a scrivere `cg_uscite` (dati che il cliente non vedrà mai); con `prenotazioni` spento, il sync TheFork del CRM scrive `clienti_prenotazioni`. Debito architetturale che renderà oneroso l'eventuale split fisico dei moduli.
**Fix proposto:** non serve big-bang: censire i punti di scrittura cross-modulo (le letture sono meno gravi) e incanalarli progressivamente in servizi platform (`stati_pagamento.py` e `vendite_aggregator.py` sono già esempi corretti del pattern); per le scritture verso moduli spenti, aggiungere guard `is_module_active`. — Effort: L
**Modulo:** trasversale (dipendenti, acquisti, banca, cassa, clienti, ricette, controllo_gestione)

### [A5-07] SEVERITÀ: MED
**Titolo:** Asset locale `logo_tregobbi.png` hardcoded in 3 router core + file brand tregobbi in `static/` core (non in `locali/tregobbi/assets/`)
**Evidenza:**
- `app/routers/vini_router.py:62` `LOGO_PATH = STATIC_DIR / "img" / "logo_tregobbi.png"` e riga 90 `<img src="/static/img/logo_tregobbi.png">`; idem `vini_cantina_tools_router.py:73`, `bevande_router.py:70`.
- File fisici in `static/img/`: `logo_tregobbi.png`, `logo_tregobbi_trim.png` (cartella core servita a tutti i locali); `locali/tregobbi/assets/` contiene solo `splash/`.
- Il meccanismo R2 esiste e prevede il logo: `locali/tregobbi/branding.json:99` `"logo": "static/img/logo_tregobbi.png"`, `locali/trgb/branding.json:96` `"logo": null` — ma i 3 router NON leggono branding.json.
- Headline hardcoded collegate (stessi file, segnalo per coordinamento con A3 che copre le stringhe): `vini_cantina_tools_router.py:392` e `bevande_router.py:596` "OSTERIA TRE GOBBI — ..." (mentre `vini_router.py:83-85` usa correttamente `t_()` R5).
**Impatto:** un'istanza pulita (`TRGB_LOCALE=trgb` o cliente nuovo) genera carta vini HTML/bevande con il logo dell'osteria di Marco (o `<img>` rotto se il file venisse spostato). Contraddice la verifica R7 «zero stringhe TRGB residue in core» limitatamente agli asset (la Carta Vini era esclusa esplicitamente da R5 per il motore PDF, ma il path logo è fuori da quell'esclusione).
**Fix proposto:** leggere il path logo da branding.json (chiave `client_pdf.logo` già presente) con fallback neutro nei 3 router; spostare i PNG in `locali/tregobbi/assets/` quando il serving lo permette (o documentare la deroga). — Effort: S/M
**Modulo:** vini (+ platform branding)

### [A5-08] SEVERITÀ: LOW
**Titolo:** Regola 1 — commento `# Modulo:` presente solo in 22/50 router backend; FE 38 file con `// Modulo:` su ~227 jsx
**Evidenza:** `grep -l "Modulo:" app/routers/*.py` → 22. I 28 mancanti (`grep -L`): auth_router, backup_router, alerts_router, clienti_router, bevande_router, closures_config_router, foodcost_router, lista_spesa_router, foodcost_ingredients_router, modules_router, haccp_router, home_actions_router, prenotazioni_router, menu_carta_router, menu_router, notifiche_router, menu_templates_router, tasks_router, preventivi_router, pranzo_router, reparti, vini_cantina_tools_router, turni_router, statistiche_router, users_router, vini_magazzino_router, vini_pricing_router, vini_router. FE: `grep -rl "// Modulo:" frontend/src` → 38 file (su 227 jsx in pages+components).
**Impatto:** la regola è attiva da aprile 2026: i mancanti sono in larga parte file pre-regola → LOW aggregato come da criterio. Nota: tutti i router mancanti sono comunque mappati nei module.json (eccetto i 4 di A5-01), quindi l'informazione esiste altrove.
**Fix proposto:** sessione meccanica di backfill (28 commenti 1-riga) oppure accettare che il manifesto sia la fonte e ridurre la regola ai soli file nuovi. — Effort: S
**Modulo:** trasversale

### [A5-09] SEVERITÀ: LOW
**Titolo:** Accuratezza manifesti: `cash_deposits` dichiarata da 2 moduli; ownership ambigua di `piatti_giorno` (commento dice cucina, docs dicono ricette)
**Evidenza:**
- `core/moduli/cassa/module.json:22` E `core/moduli/banca/module.json:18` dichiarano entrambi `cash_deposits` → ownership tabella ambigua (regola: una tabella, un modulo).
- `app/routers/piatti_giorno_router.py:3` "Modulo: cucina (selezioni)" vs CLAUDE.md/`docs/modulo_selezioni_giorno.md` che collocano le selezioni del giorno («5 router scelta_*») nel modulo `ricette`; il manifesto `ricette/module.json` elenca solo 4 scelta_* e non piatti_giorno.
- Verifica tabelle dichiarate vs DB reale non eseguibile in questo ambiente (sqlite3 negato) — rinviata ad A2.
**Impatto:** ambiguità che a R-future (split fisico/migrazioni per modulo) produce conflitti; oggi nessun effetto runtime (il loader usa solo `router_files`).
**Fix proposto:** decidere con Marco l'owner di `cash_deposits` (probabile cassa, con banca come lettore) e di piatti_giorno (ricette o cucina), poi allineare manifesti + commento. — Effort: S
**Modulo:** cassa/banca + ricette/cucina

### [A5-10] SEVERITÀ: LOW
**Titolo:** Path `app/data` residui in codice eseguibile: 3 occorrenze cedolini (K-tris, già noto e tracciato) + fallback legacy uploads deliberati
**Evidenza:**
- `app/routers/dipendenti.py:2149,2222,2287` — `os.path.join("app","data",pdf_rel)` per i PDF buste paga; il commento a riga 2302 dichiara esplicitamente l'esclusione (refactor K-tris rinviato per non rompere i record DB esistenti). Coerente con `docs/refactor_monorepo.md` §6 riga K-bis.
- Fallback legacy DELIBERATI via `tenant_dir_with_legacy_fallback()` (`app/utils/uploads.py:136-164`): `admin_finance.py:41`, `ipratico_products_router.py:43`, `dipendenti.py:2309`, `vini_cantina_tools_router.py` (backups) — pattern documentato, non violazione.
- `locale_data_path()` adottato in 71 file `app/` (grep -l); R6.5 push 3 ha rimosso il fallback runtime. Nessun DB con path hardcoded trovato in codice eseguibile (solo docstring).
**Impatto:** debito noto e già tracciato in docs; i cedolini di un secondo locale finirebbero in `app/data/cedolini/` condiviso.
**Fix proposto:** eseguire K-tris quando si onboarda il secondo locale con modulo dipendenti (migrazione `pdf_path` + mv). — Effort: M
**Modulo:** dipendenti

### [A5-11] SEVERITÀ: LOW
**Titolo:** Etichette commit: conformità 96,6% (255/264 dal 2026-04-28); 3 commit feature senza tag
**Evidenza:** `git log --oneline --since=2026-04-28 | wc -l` → 264; con tag `[core]/[locale:tregobbi]/[mixed]` → 255. I 9 non taggati: 3 `[planning]`, 1 `[test]`, 1 "test", 1 "chore: sync DB" (accettabili come non-feature) e 3 commit feature reali della serie G.3 senza tag: `7c931adc` (endpoint conto economico), `7bdb2a18` (fix escluso_acquisti), `5a92a82f` (fix stipendi CE).
**Impatto:** disciplina sostanzialmente rispettata; i 3 G.3 sono tutti classificabili `[core]` a posteriori.
**Fix proposto:** nessuna azione retroattiva necessaria; eventuale check regex nel guardiano L1 di `push.sh` (warning se il messaggio non matcha i tag ammessi). — Effort: S
**Modulo:** platform (processo)

---

## 5. Esiti POSITIVI (conformità verificata)

- **Regola 2 (import diretti tra router):** censimento COMPLETO su `app/routers/*.py` — 11 hit, TUTTI intra-modulo: `admin_finance.py:944`→closures_config (entrambi cassa); `fattureincloud_router.py:386,455,1301` e `fe_import.py:547,648`→fe_categorie (entrambi acquisti); `foodcost_matching_router.py:164,194,815,1447,1505`→foodcost_recipes (entrambi ricette). **Zero violazioni cross-modulo a livello router→router.** (L'unica violazione è da un service: A5-05.)
- **module_loader:** copertura montaggio completa — tutti gli `include_router` in `main.py` passano da `_mount()` (righe 589-713); banner boot + lista skipped (717-719); wildcard/file-mancante → tutto attivo (backward-compat tregobbi verificata: `locali/tregobbi/moduli_attivi.json` = `"*"`).
- **`/system/modules`** (main.py:235-237) espone la diagnostica consumata da `activeModules.js`; fallback FE su errore = wildcard (nessuna rottura UI con backend vecchio).
- **Separazione locale:** `core/` contiene solo `moduli/` (manifesti), zero riferimenti tregobbi; migrazioni seed TRGB-specific skippate per locale ≠ tregobbi (`migration_runner.py:107-127`); strings via `t()` (R5) usate correttamente p.es. in `vini_router.py:83-85`; `locali/_template/` e `docs/architettura_locale.md` esistono.

---

## 6. Tabella riassuntiva

| ID | Sev | Titolo breve | Modulo |
|----|-----|--------------|--------|
| A5-01 | HIGH | 4 router post-R8 non mappati in alcun module.json → sempre montati | platform/vini/banca/cucina |
| A5-02 | HIGH | /dashboard/home ignora moduli attivi: legge tutto e scrive per moduli spenti | platform |
| A5-03 | MED | Alert engine M.F esegue checker di moduli spenti | platform |
| A5-04 | MED | Route FE non filtrate: URL diretto apre pagina di modulo spento | platform (UI) |
| A5-05 | MED | turni_service importa router di cassa (unico import cross-modulo) | dipendenti |
| A5-06 | MED | SQL diretto cross-modulo nei router senza servizio-ponte né guard (campione) | trasversale |
| A5-07 | MED | logo_tregobbi.png hardcoded in 3 router core, branding.json ignorato | vini |
| A5-08 | LOW | Commento `# Modulo:` solo in 22/50 router BE, 38 file FE | trasversale |
| A5-09 | LOW | cash_deposits in 2 manifesti; ownership piatti_giorno ambigua | cassa/banca/ricette/cucina |
| A5-10 | LOW | Path app/data residui (K-tris cedolini, noto) + fallback legacy deliberati | dipendenti |
| A5-11 | LOW | 3 commit feature G.3 senza tag (conformità 96,6%) | platform |

**Totali: 0 CRIT · 2 HIGH · 5 MED · 4 LOW**
