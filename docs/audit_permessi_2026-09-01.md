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
| Con un check di ruolo esplicito | 200 (24%) |
| Solo `Depends(get_current_user)` — **qualsiasi ruolo autenticato** | 636 (76%) |
| Senza alcuna autenticazione | 13 (di cui 3 per errore) |

Con 9 ruoli in `VALID_ROLES`, oggi un `viewer` ha gli stessi poteri di un `superadmin` su banca, controllo gestione, clienti, prenotazioni e fatture.

## 1.1 Perché il frontend non basta

`modules.json` contiene una matrice permessi per modulo e sotto-modulo, ma è letta **solo** da `useModuleAccess` nel frontend. Nessun punto del backend lo apre. La protezione nasconde la voce di menu: chi conosce l'URL — o chiama l'API con `curl` e un token valido — passa.

---

# 2. I 3 endpoint pubblici per errore

Nessun token richiesto, raggiungibili da internet.

| File:riga | Endpoint | Cosa espone |
|---|---|---|
| `foodcost_router.py:65` | `GET /foodcost/ingredienti` | Tutti gli ingredienti attivi con l'ultimo prezzo pagato. È il listino costi fornitori. Il router è un `APIRouter()` nudo, senza `dependencies=`. |
| `foodcost_router.py:92` | `GET /foodcost/ingredient/{id}` | Ultimo prezzo + medie 30/90 giorni, enumerabile per id. |
| `menu_router.py:13` | `GET /menu/?role=X` | Dict statico hardcoded con ruoli obsoleti. Codice morto: da cancellare, non da proteggere. |

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
5. **Otto helper di guardia reinventati in casa** (`_require_admin`, `_solo_admin`, `_check_admin`, `check_admin_role`, `check_allowed_role`, `_require_manager`, `_require_editor`, `_require_admin_or_chef`), uno per router. Manca una dependency riutilizzabile tipo `Depends(require_roles("admin","contabile"))` — è il mattone **M.G permessi**, previsto e mai costruito. È l'unico modo per rendere il default sicuro invece che opt-in.
6. **Asimmetria lettura/scrittura al contrario.** Dove un check esiste, protegge la scrittura e lascia aperta la lettura. Ma i dati con esposizione reale — PII clienti, buste paga, conto corrente — sono un problema in **lettura**.

> Nota storica: `banca_router` e `fe_import` erano già CRIT nell'[audit 2026-06-12](audit-2026-06-12/00_EXECUTIVE_SUMMARY.md) come "pubblici senza auth". L'autenticazione è stata aggiunta a livello router, il ruolo no: il fix di allora si è fermato a metà.

---

# 5. Cosa è stato sistemato il 2026-09-01

Solo il modulo **Dipendenti** (4 router, 57 guardie). Dettaglio in [modulo_dipendenti.md §9](modulo_dipendenti.md).

| File | Guardie | Criterio |
|---|---|---|
| `dipendenti.py` | 33 | Admin su anagrafica (scrittura), buste paga, cedolini, documenti, scadenze, costi, impostazioni. Lettura turni aperta. `GET /dipendenti/` restituisce ai non-admin la versione senza IBAN/CF/telefono/email/indirizzi/note. |
| `turni_router.py` | 12 | Scrittura turni admin; 12 letture aperte; `/riepilogo-dipendenti` admin (contiene i telefoni). `/miei-turni` resta self-service. |
| `intermittenti_router.py` | 9 | Tutto admin: l'elenco contiene CF e la POST scrive al Ministero. |
| `reparti.py` | 3 | Lettura aperta (serve ai filtri turni), scrittura admin. |

Più i tre livelli frontend: `sub=` sulle 12 route in `App.jsx`, tab filtrati in `DipendentiNav`, `FoglioSettimana` in sola lettura per i non-scrittori.

---

# 6. Cosa resta da fare

Ordine proposto — per danno, non per fatica.

| # | Cosa | Perché prima |
|---|---|---|
| 1 | I 3 pubblici per errore (`foodcost_router` ×2, cancellare `menu_router`) | Non serve nemmeno un account |
| 2 | Costruire **M.G** — `require_roles()` come dependency FastAPI | Senza, ogni fix successivo è un'altra guardia scritta a mano |
| 3 | `clienti_router` + `prenotazioni_router` | PII di 5.900 persone, GDPR |
| 4 | `banca_router` + `banca_carta_router` + `controllo_gestione_router` + `cg_utenze_router` | Conto corrente e scrittura IBAN |
| 5 | `fe_import` + `fattureincloud_router` + `admin_finance` + `chiusure_turno` + `statistiche_router` | Dati fiscali, token FIC, corrispettivi |
| 6 | Riparare il seed `modules.json` (punto 4.3) | Prima di aggiungere qualsiasi sotto-modulo nuovo |
| 7 | Il resto degli ALTI, modulo per modulo | Scritture, non letture sensibili |

**Regola da adottare intanto:** ogni endpoint nuovo dichiara il suo ruolo. Se non è ovvio quale, si chiede a Marco — vale come per la domanda "core o locale?".
