# Audit TRGB 2026-06-12 — 05 ARCHITETTURA MODULARE E SEPARAZIONE CORE/LOCALE

> **Data:** 2026-06-12 · **Commit:** `1f5f9c17` (main) · **Versione:** 5.24
> **Fonti:** `raw_A5.md` + verdetti `99_VERIFICA_AVVERSARIA.md` (A5-01 confermato HIGH; A5-02 ridimensionato HIGH→MED; A5-05 confermato MED).
>
> ## **VOTO AREA ARCHITETTURA: 70/100**

---

## 1. Metodologia e copertura

**Fonti lette integralmente:** CLAUDE.md (5 regole), `docs/refactor_monorepo.md` §3/§5/§6 (R1-R8c tutti ✅), `docs/architettura_locale.md`, `app/platform/module_loader.py` (222 righe), i 14 `core/moduli/<id>/module.json`, `main.py:215-731`, `frontend/src/utils/activeModules.js`, i 3 `moduli_attivi.json`.

**Verifiche grep sistematiche:** regola 1 (`# Modulo:` su 50 router + FE); regola 2 (**censimento COMPLETO** import router→router: 11 hit router + 1 service); regola 4 (campione 4 tabelle sonda: `cg_uscite`, `shift_closures`/`daily_closures`, `fe_fatture`, `clienti_prenotazioni`); regola 5 (manifesti vs router reali, completo); separazione locale (`grep tregobbi` su app/ e core/); etichette commit (264 commit da 2026-04-28).

**Limiti dichiarati:** nessuna esecuzione runtime con `TRGB_LOCALE=test_demo` (conclusioni da lettura statica); regola 3 (prefissi tabelle DB) rinviata ad A2; FE campionato oltre i 4 file utilizzatori di activeModules.

---

## 2. Tema centrale

Il refactor R1-R8 è sostanzialmente solido: `module_loader` ben scritto (cache, backward-compat, banner diagnostico), montaggio condizionale completo in `main.py`, separazione `locali/` funzionante (strings, branding, data path, seed skippati). **Ma lo spegnimento di un modulo agisce oggi SOLO su due livelli: il montaggio dei router e il menu/card del frontend.** Tutto il resto non è module-aware:

- **4 router nati dopo R8a non sono mappati in nessun manifesto** → sempre montati, anche a modulo spento (A5-01);
- **la dashboard platform** legge dati di tutti i moduli e scrive (notifiche, istanze checklist) per moduli spenti (A5-02);
- **l'alert engine M.F** esegue i 6 checker incondizionatamente (A5-03);
- **le 156 route React** di App.jsx restano tutte registrate: un URL diretto apre la pagina del modulo spento (A5-04).

Il claim di prodotto "cliente compra solo Vini → il resto inesistente per lui" non regge ancora a una verifica end-to-end. Nota di prospettiva (da verifica avversaria): oggi **nessun locale in produzione ha moduli parziali** (tregobbi = wildcard), quindi l'impatto è prospettico — ma A5-01 resta HIGH perché il drift di processo (router nuovi senza manifesto, 4 volte in ~1 mese) è già in atto e il gating È il claim di vendita.

**Grande positivo:** la regola 2 (niente import diretti tra router di moduli diversi) è **rispettata al 100%** a livello router→router — censimento completo, zero violazioni cross-modulo. L'unica violazione è da un service (A5-05).

---

## 3. Nota di rinvio — Regola 3 (prefissi DB)

Coperta dall'area A2. Segnalato qui solo quanto emerso dai manifesti: `ricette/module.json:27-42` dichiara tabelle senza prefisso modulo (`recipes`, `ingredients`, `service_types`, ...) — coerente con lo storico ma in deroga; `cash_deposits` dichiarata da DUE manifesti (A5-09).

---

## 4. Finding

```
[A5-01] SEVERITÀ: HIGH — CONFERMATO da verifica avversaria
Titolo: 4 router non mappati in nessun module.json → sempre montati anche con modulo spento (drift post-R8a)
Evidenza: i manifesti mappano 46 router; in app/routers/ ce ne sono 50. Mancanti:
  vini_anagrafiche_router, vini_v2_router, banca_carta_router, piatti_giorno_router — montati
  incondizionatamente (main.py:603-604, 650, 698). Default del loader: module_loader.py:139-144
  "Router senza mapping: default True". I 4 file dichiarano il modulo in commento ma nessuno ha
  aggiornato il manifesto. Storico: refactor_monorepo.md §6 R8b documenta "46/46 montati" — i 4
  sono nati dopo R8 (V.6-V.8, carta credito banca, piatti del giorno).
  Verifica avversaria (99 §2): grep sui manifesti = 0 risultati, confermato; HIGH difendibile
  perché il processo "nuovo router → manifesto" non ha enforcement ed è già derivato 4 volte
  in ~1 mese.
Impatto: con TRGB_LOCALE=test_demo (vini+cassa), gli endpoint di banca_carta (banca, SPENTO) e
  piatti_giorno (cucina/ricette, SPENTO) restano raggiungibili. Un cliente che non ha comprato
  Banca vede le sue API attive. Il drift dimostra l'assenza di enforcement.
Fix proposto: aggiungere i 4 router ai rispettivi module.json (per piatti_giorno decidere owner
  con Marco, vedi A5-09); cambiare il default del loader in WARNING a boot per router non
  classificati; check in push.sh guardiano L1 (roadmap DH.7). — Effort: S
Modulo: platform (loader) + vini/banca/cucina
```

```
[A5-02] SEVERITÀ: MED (ridimensionato da HIGH in verifica avversaria — impatto prospettico)
Titolo: GET /dashboard/home (platform, sempre montato) ignora i moduli attivi: legge dati di tutti
  i moduli e scrive (notifiche + istanze checklist) anche per moduli spenti
Evidenza: dashboard_router.py non importa mai module_loader (unico utilizzatore in app/ è main.py).
  dashboard_router.py:1197-1290 (_moduli_summary): summary per tutti i moduli incondizionato, query
  SQL dirette ai DB dei moduli. :1518-1522 trigger run_all_checks(dry_run=False) (scrive notifiche)
  a ogni chiamata; :1524-1530 trigger tasks_scheduler (genera istanze checklist task_manager anche
  se spento).
Impatto: PROSPETTICO — oggi nessun locale in produzione ha moduli parziali (tregobbi = wildcard,
  impatto zero). Su un futuro locale parziale: payload moduli[] con dati di moduli non comprati e
  SCRITTURE per moduli spenti (notifiche, istanze checklist) — su DB vuoti del locale stesso,
  nessuna perdita dati né esposizione. Il costo sincrono sulla Home è già contato in A7-03.
  Da fixare prima del cliente #1 modulare, insieme ad A5-03/A5-04.
Fix proposto: filtrare _moduli_summary e widget con module_loader.is_module_active(); condizionare
  i due trigger (checker solo per moduli attivi — vedi A5-03; scheduler solo se task_manager attivo).
  — Effort: M
Modulo: platform
```

```
[A5-03] SEVERITÀ: MED
Titolo: Alert engine M.F non module-aware: i 6 checker girano sempre, anche per moduli spenti
Evidenza: app/services/alert_engine.py:206,301,394,628,647,676 — checker fatture_scadenza (acquisti),
  dipendenti_scadenze (dipendenti), vini_sottoscorta (vini), cg_scadenze_* ×3 (controllo_gestione).
  Nessun import di module_loader. Trigger: alerts_router.py:46,64 (platform, sempre montato) +
  trigger automatico da dashboard (A5-02).
Impatto: su un locale senza dipendenti/acquisti/CG, i checker girano comunque: query su tabelle di
  moduli spenti e potenziale creazione di notifiche che linkano a pagine inesistenti per quel cliente.
Fix proposto: campo module_id sul decorator @register_checker (o in run_all_checks) e skip dei
  checker il cui modulo non è attivo. 1 punto di modifica, retrocompatibile. — Effort: S
Modulo: platform (M.F)
```

```
[A5-04] SEVERITÀ: MED
Titolo: Frontend: activeModules filtra solo menu Header e card Home — le 156 route di App.jsx
  restano tutte registrate
Evidenza: grep -c "<Route" App.jsx → 156; grep activeModules/isMenuKeyActive su App.jsx → 0.
  Utilizzatori reali di activeModules.js: solo main.jsx (boot), components/Header.jsx (dropdown),
  pages/Home.jsx (card).
Impatto: su un locale con moduli parziali, un URL digitato/bookmarkato (es. /dipendenti) apre la
  pagina del modulo spento: UI renderizzata e API in 404 → pagina rotta invece di "modulo non
  attivo". Esperienza prodotto scadente; non è un problema di sicurezza (il backend è davvero spento).
Fix proposto: guard component (es. <ModuleRoute menuKey="...">) con isMenuKeyActive e redirect a
  Home o EmptyState "modulo non attivo"; in alternativa filtrare le route prima della registrazione.
  — Effort: M
Modulo: platform (UI)
```

```
[A5-05] SEVERITÀ: MED — CONFERMATO da verifica avversaria
Titolo: turni_service (dipendenti) importa una funzione dal router closures_config_router (cassa):
  unico import cross-modulo trovato
Evidenza: app/services/turni_service.py:655 — `from app.routers.closures_config_router import
  get_closures_config` (import lazy in funzione, con try/except fallback {}). turni_service serve
  turni_router → modulo dipendenti; closures_config_router → modulo cassa (manifesti :12).
Impatto: dipendenza dipendenti→cassa realizzata importando un ROUTER di altro modulo invece di un
  servizio platform. Funziona anche a cassa spento (il file esiste, solo non montato), ma viola la
  regola 2/4 e a split fisico futuro si romperebbe. Mitigato dal try/except.
Fix proposto: estrarre get_closures_config() in un servizio platform
  (es. app/services/closures_config_service.py) usato da entrambi. — Effort: S
Modulo: dipendenti (+ cassa)
```

```
[A5-06] SEVERITÀ: MED
Titolo: Regola 4 — accessi SQL diretti cross-modulo diffusi nei router (campione 4 tabelle),
  senza servizio-ponte né guard sui moduli attivi
Evidenza (campione dichiarato, non censimento):
  - cg_uscite (CG) letta/scritta da router di ALTRI moduli: dipendenti.py:1434,1490,1509 (righe
    stipendio), fe_import.py:950 + fattureincloud_router.py + fe_proforme_router.py (acquisti),
    banca_router.py + banca_carta_router.py (banca), admin_finance.py (cassa).
  - shift_closures/daily_closures (cassa) lette da controllo_gestione_router.py:133-134.
  - fe_fatture (acquisti) letta da banca_router, controllo_gestione_router,
    foodcost_matching_router.py:297,341,454 (ricette).
  - clienti_prenotazioni (prenotazioni) SCRITTA da clienti_router.py:738-754 (sync TheFork).
Impatto: dipendenze dichiarate nei manifesti come dipendenze_opzionali (coerente) ma realizzate con
  SQL inline nel router invece che via servizio platform, e SENZA guard runtime: con CG spento
  l'import buste paga scrive comunque cg_uscite; con prenotazioni spento il sync TheFork scrive
  clienti_prenotazioni. Debito che renderà oneroso l'eventuale split fisico.
Fix proposto: niente big-bang — censire i punti di SCRITTURA cross-modulo e incanalarli
  progressivamente in servizi platform (stati_pagamento.py e vendite_aggregator.py sono già esempi
  corretti del pattern); guard is_module_active sulle scritture verso moduli spenti. — Effort: L
Modulo: trasversale (dipendenti, acquisti, banca, cassa, clienti, ricette, controllo_gestione)
```

```
[A5-07] SEVERITÀ: MED
Titolo: Asset locale logo_tregobbi.png hardcoded in 3 router core + file brand tregobbi in static/
  core (non in locali/tregobbi/assets/)
Evidenza: vini_router.py:62 `LOGO_PATH = STATIC_DIR / "img" / "logo_tregobbi.png"` e :90 <img>;
  idem vini_cantina_tools_router.py:73, bevande_router.py:70. File fisici in static/img/ (cartella
  core servita a tutti i locali). Il meccanismo R2 esiste e prevede il logo
  (locali/tregobbi/branding.json:99; locali/trgb/branding.json:96 logo: null) — ma i 3 router NON
  leggono branding.json. Headline hardcoded collegate: vini_cantina_tools_router.py:392 e
  bevande_router.py:596 "OSTERIA TRE GOBBI — ..." (vini_router.py:83-85 usa invece correttamente t_()).
Impatto: un'istanza pulita (TRGB_LOCALE=trgb o cliente nuovo) genera carta vini/bevande HTML con il
  logo dell'osteria di Marco (o <img> rotto). Contraddice la verifica R7 "zero stringhe TRGB residue
  in core" limitatamente agli asset.
Fix proposto: leggere il path logo da branding.json (chiave client_pdf.logo già presente) con
  fallback neutro nei 3 router; spostare i PNG in locali/tregobbi/assets/ quando il serving lo
  permette (o documentare la deroga). — Effort: S/M
Modulo: vini (+ platform branding)
```

```
[A5-08] SEVERITÀ: LOW
Titolo: Regola 1 — commento `# Modulo:` presente solo in 22/50 router backend; FE 38/~227 jsx
Evidenza: grep -l "Modulo:" app/routers/*.py → 22. I 28 mancanti sono in larga parte file pre-regola
  (aprile 2026). Tutti i router mancanti sono comunque mappati nei module.json (eccetto i 4 di A5-01),
  quindi l'informazione esiste altrove.
Impatto: LOW aggregato — drift di disciplina, non funzionale.
Fix proposto: backfill meccanico (28 commenti 1-riga) oppure accettare il manifesto come fonte e
  ridurre la regola ai soli file nuovi. — Effort: S
Modulo: trasversale
```

```
[A5-09] SEVERITÀ: LOW
Titolo: Accuratezza manifesti: cash_deposits dichiarata da 2 moduli; ownership ambigua di piatti_giorno
Evidenza: core/moduli/cassa/module.json:22 E core/moduli/banca/module.json:18 dichiarano entrambi
  cash_deposits (regola: una tabella, un modulo). piatti_giorno_router.py:3 dice "Modulo: cucina
  (selezioni)" vs CLAUDE.md/docs che collocano le selezioni del giorno in ricette; il manifesto
  ricette elenca solo 4 scelta_* e non piatti_giorno. Verifica tabelle vs DB reale rinviata ad A2.
Impatto: ambiguità che a split fisico/migrazioni per modulo produce conflitti; oggi nessun effetto
  runtime (il loader usa solo router_files).
Fix proposto: decidere con Marco l'owner di cash_deposits (probabile cassa, banca lettore) e di
  piatti_giorno (ricette o cucina), poi allineare manifesti + commento. — Effort: S
Modulo: cassa/banca + ricette/cucina
```

```
[A5-10] SEVERITÀ: LOW
Titolo: Path app/data residui in codice eseguibile: 3 occorrenze cedolini (K-tris, noto e tracciato)
  + fallback legacy uploads deliberati
Evidenza: app/routers/dipendenti.py:2149,2222,2287 — os.path.join("app","data",pdf_rel) per i PDF
  buste paga; esclusione dichiarata in commento :2302 (K-tris rinviato per non rompere i record DB).
  Fallback legacy DELIBERATI via tenant_dir_with_legacy_fallback() (uploads.py:136-164) — pattern
  documentato, non violazione. locale_data_path() adottato in 71 file.
Impatto: debito noto e tracciato; i cedolini di un secondo locale finirebbero in app/data/cedolini/
  condiviso.
Fix proposto: eseguire K-tris all'onboarding del secondo locale con modulo dipendenti (migrazione
  pdf_path + mv). — Effort: M
Modulo: dipendenti
```

```
[A5-11] SEVERITÀ: LOW
Titolo: Etichette commit: conformità 96,6% (255/264 dal 2026-04-28); 3 commit feature senza tag
Evidenza: 264 commit, 255 taggati [core]/[locale:tregobbi]/[mixed]. Dei 9 non taggati, 6 sono
  non-feature accettabili; 3 sono feature reali della serie G.3: 7c931adc (endpoint conto economico),
  7bdb2a18 (fix escluso_acquisti), 5a92a82f (fix stipendi CE) — tutti classificabili [core] a posteriori.
Impatto: disciplina sostanzialmente rispettata.
Fix proposto: nessuna azione retroattiva; eventuale check regex nel guardiano L1 di push.sh
  (warning se il messaggio non matcha i tag). — Effort: S
Modulo: platform (processo)
```

---

## 5. Positivi verificati (conformità)

- **Regola 2 (import router→router): 100% PULITA.** Censimento COMPLETO su app/routers/*.py — 11 hit, TUTTI intra-modulo (admin_finance→closures_config entrambi cassa; fattureincloud/fe_import→fe_categorie entrambi acquisti; foodcost_matching→foodcost_recipes entrambi ricette). **Zero violazioni cross-modulo a livello router.** L'unica violazione è da un service (A5-05). ✅
- **module_loader copertura completa**: tutti gli include_router in main.py passano da `_mount()` (589-713); banner boot + lista skipped; wildcard/file-mancante → tutto attivo (backward-compat tregobbi verificata). ✅
- **/system/modules** espone la diagnostica consumata da activeModules.js; fallback FE su errore = wildcard (nessuna rottura con backend vecchio). ✅
- **Separazione locale**: core/ contiene solo manifesti, zero riferimenti tregobbi; migrazioni seed TRGB-specific skippate per locale ≠ tregobbi (migration_runner.py:107-127); strings via t() (R5); locali/_template/ e docs/architettura_locale.md esistono. ✅

---

## 6. Tabella riassuntiva

| ID | Sev | Titolo breve | Modulo |
|----|-----|--------------|--------|
| A5-01 | HIGH | 4 router post-R8 non mappati in alcun module.json → sempre montati | platform/vini/banca/cucina |
| A5-02 | MED ↓ | /dashboard/home ignora moduli attivi (impatto prospettico) | platform |
| A5-03 | MED | Alert engine M.F esegue checker di moduli spenti | platform |
| A5-04 | MED | Route FE non filtrate: URL diretto apre pagina di modulo spento | platform (UI) |
| A5-05 | MED | turni_service importa router di cassa (unico import cross-modulo) | dipendenti |
| A5-06 | MED | SQL diretto cross-modulo nei router senza servizio-ponte né guard | trasversale |
| A5-07 | MED | logo_tregobbi.png hardcoded in 3 router core, branding.json ignorato | vini |
| A5-08 | LOW | Commento `# Modulo:` solo in 22/50 router BE, 38 file FE | trasversale |
| A5-09 | LOW | cash_deposits in 2 manifesti; ownership piatti_giorno ambigua | cassa/banca/ricette/cucina |
| A5-10 | LOW | Path app/data residui (K-tris cedolini, noto) | dipendenti |
| A5-11 | LOW | 3 commit feature G.3 senza tag (conformità 96,6%) | platform |

**Totali: 0 CRIT · 1 HIGH · 6 MED · 4 LOW.**

**Voto area Architettura: 70/100** — fondamenta del refactor R1-R8 solide (loader, montaggio, separazione locale, regola 2 al 100%), ma il gating moduli copre solo mount+menu: dashboard, alert engine, route React e i 4 router fuori manifesto vanno chiusi PRIMA del primo cliente modulare, e il drift di processo (A5-01) va fermato con enforcement.
