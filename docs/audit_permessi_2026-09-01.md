# Audit permessi backend — 2026-09-01

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-09-01
> **Vedi anche:** [modulo_dipendenti.md](modulo_dipendenti.md) (§9 Permessi, l'unico modulo già sistemato), [architettura_mattoni.md](architettura_mattoni.md) (M.G permessi, da costruire), [audit-2026-06-12/](audit-2026-06-12/00_EXECUTIVE_SUMMARY.md)

**Origine:** Marco, 1 settembre 2026 — *«il modulo dipendenti non è ben protetto: il sommelier dovrebbe vedere solo i propri turni, in realtà vede tutte le buste paga»*. La segnalazione era corretta, ma il modulo Dipendenti si è rivelato un campione di un problema che riguarda tutto il backend.

---

# 1. Il problema in una riga

`Depends(get_current_user)` è **autenticazione**, non **autorizzazione**: dice che c'è un token valido, non che quel ruolo possa fare quella cosa. Il 76% degli endpoint si ferma lì.

| | |
|---|---|
| Router analizzati | 56 |
| Endpoint totali | 836 |
| Con un check di ruolo esplicito | 200 (24%) → **613 (73%)** dopo l'intervento del 2026-09-01 |
| Solo `Depends(get_current_user)` — **qualsiasi ruolo autenticato** | 636 (76%) → **223 (26%)** |
| Senza alcuna autenticazione | 13 (di cui 3 per errore) → **0 per errore** |

Con 9 ruoli in `VALID_ROLES`, oggi un `viewer` ha gli stessi poteri di un `superadmin` su banca, controllo gestione, clienti, prenotazioni e fatture.

## 1.1 Perché il frontend non basta

`modules.json` contiene una matrice permessi per modulo e sotto-modulo, ma è letta **solo** da `useModuleAccess` nel frontend. Nessun punto del backend lo apre. La protezione nasconde la voce di menu: chi conosce l'URL — o chiama l'API con `curl` e un token valido — passa.

---

# 2. I 3 endpoint pubblici per errore

Nessun token richiesto, raggiungibili da internet.

| File:riga | Endpoint | Cosa espone |
|---|---|---|
| `foodcost_router.py:65` | `GET /foodcost/ingredienti` | Tutti gli ingredienti attivi con l'ultimo prezzo pagato. È il listino costi fornitori. Il router era un `APIRouter()` nudo, senza `dependencies=`. **→ CHIUSO 2026-09-01** (ruoli di `ricette/ingredienti`). |
| `foodcost_router.py:92` | `GET /foodcost/ingredient/{id}` | Ultimo prezzo + medie 30/90 giorni, enumerabile per id. **→ CHIUSO 2026-09-01.** |
| `menu_router.py:13` | `GET /menu/?role=X` | Dict statico hardcoded con ruoli obsoleti. Codice morto. **→ CHIUSO ad admin 2026-09-01**, marcato `deprecated`; la cancellazione del file + del mount in `main.py` resta una decisione di Marco. |

Pubblici **per disegno** (corretti così): `/auth/login`, `/auth/tiles`, `/menu-carta/public/today`, le 5 rotte della carta vini cliente da QR, i 2 health di pranzo.

---

# 3. I buchi CRITICI

Criterio: espone dati personali o finanziari, oppure scrive/cancella, ed è raggiungibile da ruoli che `modules.json` esclude. **Tutti aperti a qualsiasi utente loggato, `viewer` e `commis` compresi.**

| Router | Senza check | Il caso peggiore |
|---|---|---|
| `banca_router.py` | 30/30 | `GET /banca/movimenti` — il conto corrente Banco BPM movimento per movimento. `DELETE /banca/duplicati/{id}` cancella. |
| `controllo_gestione_router.py` | 53/54 | `PUT /uscite/{id}/iban` **scrive l'IBAN beneficiario** di un pagamento fornitore. `GET /conto-economico` espone ricavi, costi, utile. |
| `clienti_router.py` | 33/33 | `GET /clienti/export/google-csv` — nome, email, telefono, compleanno e note di ~5.900 clienti in un CSV. `POST /merge` fonde anagrafiche. |
| `prenotazioni_router.py` | 27/27 | Nome e telefono dei prenotati; `DELETE /prenotazioni/{id}`. |
| `dipendenti.py` + `turni_router.py` | 60/60 | Buste paga, cedolini PDF, IBAN, codice fiscale, costi personale. **→ SISTEMATO, vedi §5.** |
| `fe_import.py` | 20/20 | `DELETE /contabilita/fe/fatture`; stato pagamento fatture in massa. |
| `fattureincloud_router.py` | 17/17 | `POST /fic/connect` **sovrascrive l'access token** di Fatture in Cloud: si può puntare il gestionale a un'altra azienda. |
| `admin_finance.py` | 18/30 | Fatturato annuale, export corrispettivi, flusso contanti, versamenti. |
| `statistiche_router.py` | 10/12 | Incassi storici, coperti, scontrino medio. Il modulo è dichiarato solo admin. |
| `cg_utenze_router.py` | 8/8 | Bollette A2A con POD, consumi, importi; `DELETE` bolletta. |
| `intermittenti_router.py` | 9/9 | `POST /comunica/` **invia la comunicazione UNI al Ministero**: atto legale, col token di chiunque. **→ SISTEMATO, vedi §5.** |
| `chiusure_turno.py` | 4/11 | Chiusure di cassa per turno con incassi (i preconti invece sono già superadmin). |
| `clienti_giftcard_router.py` | 10/12 | `POST /giftcard/` emette valore monetario; `POST /{id}/scarica` lo consuma. |
| `banca_carta_router.py` | 16/16 | Estratti conto carta di credito; `DELETE` di un estratto intero. |

## 3.1 I buchi ALTI (sintesi)

Scritture accessibili a ruoli non previsti: `foodcost_matching_router` (18/18, riscrive il matching fatture↔ingredienti), `foodcost_ingredients_router` (15/15, altera i prezzi del food cost), `foodcost_recipes_router` (27/28, `DELETE /ricette/{id}/hard`), `fe_categorie_router` (16/16, categorizzazione che alimenta conto economico), `fe_proforme_router` (9/9), `ipratico_products_router` (11/11), `menu_carta_router` (25/25, `publish` di un menu sull'endpoint pubblico QR), le 4 `scelta_*` + `piatti_giorno` (46 endpoint, scrivibili da contabile e viewer), `lista_spesa_router` (5/5, `DELETE` svuota la lista), `reparti.py` (5/5 → **sistemato**), `vini_magazzino_router` (`POST /{id}/movimenti` muove le giacenze senza check), `vini_settings_router` (14/15), `vini_cantina_tools_router` (19/33, export xlsx dell'intera cantina coi prezzi d'acquisto).

Letture non protette dove la scrittura invece lo è: `preventivi_router` (8/30 — le GET espongono dati cliente e prezzi eventi), `alerts_router` (le GET di dry-run restituiscono scadenze e importi), `dashboard_router` (`/dashboard/home` manda `incasso_ieri` a qualsiasi ruolo).

---

# 4. I 6 pattern di fondo

1. **`Depends(get_current_user)` usato come se fosse autorizzazione.** Un solo gradino: loggato / non loggato.
2. **La matrice permessi vive solo nel frontend.** `modules.json` nasconde, non chiude.
3. **Il seed dei permessi è in drift.** `MODULES_SEED_FILE = locale_data_path("modules.json")` punta a `locali/tregobbi/data/modules.json`, che **non esiste**. L'unico file presente è `app/data/modules.json`, ormai orfano: il seed effettivo è `DEFAULT_MODULES` hardcoded in `modules_router.py:65`, che diverge dal file su 13 voci (mancano `ricette/spesa`, `ricette/pranzo`, `ricette/cucina_dashboard`, tutto `tasks`, `vini/anagrafiche`; non conosce `sous_chef`/`commis` su Ricette). **Conseguenza operativa:** aggiungere un sotto-modulo nuovo ad `app/data/modules.json` oggi non ha effetto in produzione. Finché il seed non è riparato, usare solo chiavi `sub` già esistenti.
4. **Il pattern corretto esiste ma è confinato ai router recenti.** Copertura piena: `tasks_router` (21/21), `bevande_router` (17/17), `users_router`, `backup_router`, `email_router`, `pubblicazione_router`. I router finanziari sono i più vecchi e i più scoperti.
5. ~~**Otto helper di guardia reinventati in casa**~~ **→ RISOLTO in fase 1 il 2026-09-01** con `app/services/permessi.py` (M.G). Il testo originale resta come contesto:  **Otto helper di guardia reinventati in casa** (`_require_admin`, `_solo_admin`, `_check_admin`, `check_admin_role`, `check_allowed_role`, `_require_manager`, `_require_editor`, `_require_admin_or_chef`), uno per router. Manca una dependency riutilizzabile tipo `Depends(require_roles("admin","contabile"))` — è il mattone **M.G permessi**, previsto e mai costruito. È l'unico modo per rendere il default sicuro invece che opt-in.
6. **Asimmetria lettura/scrittura al contrario.** Dove un check esiste, protegge la scrittura e lascia aperta la lettura. Ma i dati con esposizione reale — PII clienti, buste paga, conto corrente — sono un problema in **lettura**.

> Nota storica: `banca_router` e `fe_import` erano già CRIT nell'[audit 2026-06-12](audit-2026-06-12/00_EXECUTIVE_SUMMARY.md) come "pubblici senza auth". L'autenticazione è stata aggiunta a livello router, il ruolo no: il fix di allora si è fermato a metà.

---

# 5. Cosa è stato sistemato il 2026-09-01

## 5.0 M.G fase 1 — la guardia riutilizzabile

`app/services/permessi.py`. Proteggere un endpoint ora è una riga, in quattro forme (dependency nella firma, `dependencies=` sul router, chiamata imperativa nel corpo, `ha_ruoli()` per decidere *cosa* restituire invece che *se*). `superadmin` implicito dove c'è `admin`; nomi ruolo validati all'import, così un typo fa fallire il boot invece di aprire una porta in silenzio. Dettaglio e esempi in [architettura_mattoni.md §M.G](architettura_mattoni.md).

Non rende sicuro niente da solo: toglie la scusa. La fase 2 (matrice configurabile da UI) cambierà l'implementazione, non le chiamate già scritte.

## 5.1 I 3 endpoint pubblici

`foodcost_router` chiuso ai ruoli di `ricette/ingredienti` (admin, superadmin, chef, sous_chef, commis) via `dependencies=` sul router: non aveva chiamanti, né frontend né backend. `menu_router` chiuso ad admin e marcato `deprecated` invece che cancellato — rimuovere un router è una decisione di Marco, non un effetto collaterale di un fix di sicurezza.

## 5.2 M.G applicato — 25 router (ondata 2026-09-01)

Guardia a livello router (`dependencies=[Depends(richiede_ruoli(...))]`), con i ruoli presi da `modules.json`. Il criterio: **applicare i ruoli del modulo chiude la porta senza cambiare il lavoro di nessuno**, perché un ruolo che non vede il modulo nell'interfaccia non sta già usando quelle pagine oggi.

| Router | Ora ammette |
|---|---|
| `banca_router`, `banca_carta_router` | admin, contabile |
| `controllo_gestione_router`, `cg_utenze_router` | admin, contabile |
| `fe_import`, `fe_categorie_router`, `fe_proforme_router` | admin, contabile |
| `admin_finance` | admin, contabile |
| `fattureincloud_router`, `statistiche_router`, `alerts_router`, `ipratico_products_router` | admin |
| `clienti_router`, `clienti_giftcard_router`, `preventivi_router` | admin, contabile, sala, sommelier |
| `prenotazioni_router` | admin, sala, sommelier, contabile* |
| `lista_spesa_router`, `foodcost_ingredients_router` | admin, chef, sous_chef, commis |
| `haccp_router` | admin, chef, sous_chef |
| `menu_carta_router` (non il `public_router`) | admin, chef, sous_chef, commis |
| `scelta_macellaio/salumi/formaggi/pescato`, `piatti_giorno` | admin, chef, sala, sommelier — **scritture** solo admin+chef |

\* `contabile` su prenotazioni non è un allargamento: la scheda preventivo (modulo clienti, che lo include) chiama `GET /prenotazioni/clienti/search`, e gli stessi nominativi il contabile li vede già dal modulo Clienti.

**Decisioni operative di Marco (2026-09-01)**, che il codice non poteva dedurre:
- La **chiusura di cassa serale** la fa la sala. Vive in `chiusure_turno.py` (`/admin/finance/shift-closures/*`), router separato da `admin_finance` nonostante il prefisso simile: **non è stato toccato**.
- **Gift card** (emissione e scarico) e **merge clienti**: restano alla sala.
- **Preventivi**: la sala legge, non scrive — le scritture erano già admin.
- **Modulo Vini**: tutto come oggi, sala e sommelier scrivono. Non toccato.
- **Selezioni del giorno**: le prepara la cucina. Sala e sommelier consultano e segnano venduto/archiviato (azione di servizio), ma non creano, modificano o cancellano. `ZonaPanel.jsx` nasconde i bottoni relativi e mostra «👁️ Sola lettura».
- **Turni**: il foglio lo fa Marco (già applicato).

**Falso allarme corretto:** l'audit dava comunicazioni e nota della Lavagna come scrivibili da chiunque, guardando le chiamate del frontend. In realtà tutte e cinque le scritture avevano già `_require_admin` nel corpo: **erano già chiuse**. Nessuna modifica, solo un commento che lo documenta.

**Due regressioni trovate in verifica e sistemate:** il contabile perdeva la ricerca cliente dentro il preventivo (risolto ammettendolo su prenotazioni); sala e sommelier perdono `/vendite/chiusure-old`, pagina legacy non linkata da nessuna nav, raggiungibile solo digitando l'URL — impatto operativo nullo, documentato nel router.

## 5.3 Il modulo Dipendenti

4 router, 59 guardie. Dettaglio in [modulo_dipendenti.md §9](modulo_dipendenti.md). I quattro router mantengono i loro `_require_admin()` / `_require_turni_write()` come nomi parlanti, ma il corpo delega a M.G: la logica del 403 vive in un posto solo.

| File | Guardie | Criterio |
|---|---|---|
| `dipendenti.py` | 33 | Admin su anagrafica (scrittura), buste paga, cedolini, documenti, scadenze, costi, impostazioni. Lettura turni aperta. `GET /dipendenti/` restituisce ai non-admin la versione senza IBAN/CF/telefono/email/indirizzi/note. |
| `turni_router.py` | 14 | Scrittura turni admin (template compresi); 10 letture aperte; `/riepilogo-dipendenti` admin (contiene i telefoni). `/miei-turni` resta self-service. |
| `intermittenti_router.py` | 9 | Tutto admin: l'elenco contiene CF e la POST scrive al Ministero. |
| `reparti.py` | 3 | Lettura aperta (serve ai filtri turni), scrittura admin. |

Più i tre livelli frontend: `sub=` sulle 12 route in `App.jsx`, tab filtrati in `DipendentiNav`, `FoglioSettimana` in sola lettura per i non-scrittori.

---

# 6. Cosa resta da fare

Ordine proposto — per danno, non per fatica.

| # | Cosa | Perché prima |
|---|---|---|
| 1 | ~~I 3 pubblici per errore~~ ✅ **FATTO 2026-09-01** | Non serviva nemmeno un account |
| 2 | ~~Costruire **M.G**~~ ✅ **FASE 1 FATTA 2026-09-01** — `app/services/permessi.py` | Senza, ogni fix successivo era un'altra guardia scritta a mano |
| 3 | ~~`clienti_router` + `prenotazioni_router`~~ ✅ **FATTO 2026-09-01** | PII di 5.900 persone, GDPR |
| 4 | ~~banca + carta + CG + utenze~~ ✅ **FATTO 2026-09-01** | Conto corrente e scrittura IBAN |
| 5 | ~~fe_import + FIC + admin_finance + statistiche~~ ✅ **FATTO 2026-09-01** (`chiusure_turno` volutamente NO: è la chiusura di cassa della sala) | Dati fiscali, token FIC, corrispettivi |
| 6 | Riparare il seed `modules.json` (punto 4.3) | Prima di aggiungere qualsiasi sotto-modulo nuovo |
| 7 | Quel che resta: `foodcost_recipes` (28), `foodcost_matching` (18), `menu_templates`, la coda di `tasks`/`bevande` | Servono altre due decisioni: chi legge l'archivio ricette (il composer preventivi lo apre a sala/sommelier) e chi riscrive il matching |
| 8 | Le route in `App.jsx` che non passano il `sub` | `/prenotazioni/tavoli`, `/prenotazioni/impostazioni`, `/acquisti/proforme`: dichiarate admin, di fatto aperte. Stesso bug di Dipendenti |

**Non toccati per decisione:** tutto il modulo Vini (sala e sommelier scrivono, è il flusso reale), `chiusure_turno` (chiusura di cassa serale della sala), le letture di `dashboard`/`notifiche`/`modules`/`auth` (servono a ogni ruolo su ogni pagina).

**Regola da adottare intanto:** ogni endpoint nuovo dichiara il suo ruolo. Se non è ovvio quale, si chiede a Marco — vale come per la domanda "core o locale?".
