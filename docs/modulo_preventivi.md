# Modulo Preventivi — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-08-03
> **Vedi anche:** [modulo_prenotazioni.md](modulo_prenotazioni.md), [modulo_clienti_crm.md](modulo_clienti_crm.md), [modulo_ricette_foodcost.md](modulo_ricette_foodcost.md), [architettura_mattoni.md](architettura_mattoni.md)

**Nato:** spec sessione 31 (2026-04-13), implementato nelle sessioni 31-39
**Versione:** vive dentro il modulo Clienti (`versions.jsx` → clienti; nessuna versione dedicata)
**Frontend:** `/clienti/preventivi` (lista), `/clienti/preventivi/:id` e `/clienti/preventivi/nuovo` (scheda), tab "Preventivi" nella scheda cliente, 3 sezioni in Impostazioni CRM
**Backend:** `app/routers/preventivi_router.py` (prefix `/preventivi`) + `app/services/preventivi_service.py`; libreria menu in `app/routers/menu_templates_router.py` (prefix `/menu-templates` + 2 endpoint bridge sotto `/preventivi`)
**DB:** `clienti.sqlite3` — tabelle `clienti_preventivi*`, `clienti_menu_template*`
**Roadmap:** sezione `CL.` di [roadmap.md](roadmap.md)

---

# 1. Panoramica

Gestione dei preventivi per eventi (cene private, aziendali, gruppi): prima sparsi tra WhatsApp, email e telefono, ora tracciati con numero progressivo, stato, menu proposti e PDF brandizzato. Collegato al CRM (cliente esistente o creato al volo) e al Ricettario (i piatti dei menu sono snapshot delle ricette di Cucina).

Flusso tipico: Marco crea il preventivo (titolo, cliente, data/pax/luogo) → compone uno o più **menu alternativi** pescando piatti dal Ricettario o scrivendoli al volo → aggiunge eventuali **extra** (noleggi, supplementi, sconti) → scarica il **PDF** (mattone M.B) e lo manda al cliente per WA/email a mano → aggiorna lo **stato** man mano (inviato → confermato → prenotato → completato → fatturato).

Le Fasi A (CRUD) e B (template/righe/totale) della spec sono implementate, la C parzialmente (PDF sì, invio WA/email no), la D no (versioning e collegamento automatico alla prenotazione mancano — vedi §11).

# 2. Capability

Codici dall'audit 2026-05-19 (`docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md`, sottomoduli C e D del modulo prenotazioni).

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-P-019 | Lista preventivi con filtri + KPI (in ballo, confermati, valore mese) | `GET /preventivi` + `GET /preventivi/stats` — `preventivi_router.py:201, :222` | admin (stats), tutti (lista) | ✅ |
| C-P-020 | Luoghi evento configurabili | `GET/PUT /preventivi/config/luoghi` — `:232, :237` | admin (PUT) | ✅ |
| C-P-021 | Template di testata (righe extra + condizioni precompilate) | `GET /preventivi/template/lista` + `POST/PUT/DELETE /template[/{id}]` — `:247-:268` | admin | ✅ |
| C-P-022 | CRUD preventivo (numero automatico, cliente inline, righe in blocco) | `GET/POST/PUT/DELETE /preventivi[/{id}]` — `:281, :289, :298, :310` | admin (scritture) | ✅ |
| C-P-023 | Cambio stato con transizioni validate | `POST /preventivi/{id}/stato` — `:319` | admin | ✅ |
| C-P-024 | Duplica preventivo come nuova bozza (righe + menu inclusi) | `POST /preventivi/{id}/duplica` — `:331` | admin | ✅ |
| C-P-025 | Righe menu snapshot sul menu primario (legacy pre-menu multipli) | `GET/POST/PUT/DELETE /preventivi/{id}/menu-righe[/{rid}]` + `PUT /menu-sconto` — `:344-:397` | admin | ✅ |
| C-P-026 | Menu multipli alternativi (crea, rinomina, sconto, duplica, riordina, elimina) | `GET/POST/PUT/DELETE /preventivi/{id}/menu[/{mid}]` + `POST /{mid}/duplica` + `PUT /menu-ordine` — `:408-:458` | admin | ✅ |
| C-P-027 | Righe di un menu specifico + riordino | `GET/POST /preventivi/{id}/menu/{mid}/righe` + `PUT /righe-ordine` — `:466-:497` | admin | ✅ |
| C-P-028 | PDF brandizzato (M.B, template `preventivo.html`) | `GET /preventivi/{id}/pdf?inline=` — `:504` | tutti | ✅ |
| C-P-029 | Libreria menu template: CRUD | `GET/POST/PUT/DELETE /menu-templates[/{id}]` — `menu_templates_router.py:92-:139` | admin (scritture) | ✅ |
| C-P-030 | Duplica menu template | `POST /menu-templates/{id}/duplica` — `:142` | admin | ✅ |
| C-P-031 | Righe template (aggiungi, elimina, riordina) + bridge salva/carica su menu preventivo | `POST/DELETE /menu-templates/{id}/righe[/{rid}]`, `PUT /righe-ordine`; `POST /preventivi/{id}/menu/{mid}/salva-come-template` e `/carica-template` — `:159-:251` | admin | ⚠️ vedi §12.1 |

**Auth:** tutte le route richiedono JWT; le letture sono aperte a ogni utente loggato, le scritture (e `GET /stats`) richiedono admin/superadmin via `is_admin()`.

# 3. Numerazione e stati

**Numero progressivo annuale** `PRE-{anno}-{NNN}` (es. `PRE-2026-002`), calcolato dal backend alla creazione e alla duplicazione (`preventivi_service._prossimo_numero`, MAX sul prefisso anno corrente).

**9 stati** con transizioni validate server-side (`preventivi_service.TRANSIZIONI`, replicate identiche nel frontend):

```
bozza → inviato → in_attesa → confermato → prenotato → completato → fatturato
                ↘ confermato          (da inviato si può saltare in_attesa)
                ↘ rifiutato           (da inviato o in_attesa; terminale)
        in_attesa ↘ scaduto → bozza   (riapertura)
```

| Stato | Badge UI | Note |
|---|---|---|
| bozza | grigio | stato iniziale (anche del duplicato) |
| inviato | blu | Marco ha mandato il preventivo |
| in_attesa | amber | cliente sta decidendo |
| confermato | verde | cliente ha accettato |
| prenotato | indigo | etichetta manuale: NON crea né collega una prenotazione (vedi §11) |
| completato | emerald chiaro | evento avvenuto |
| fatturato | grigio neutro | terminale |
| rifiutato | rosso | terminale |
| scaduto | arancio | **transizione manuale** — nessun automatismo su `scadenza_conferma` (vedi §11) |

La lista frontend evidenzia comunque la scadenza: colonna "Scadenza" con conto alla rovescia, rossa se ≤ 3 giorni e il preventivo è ancora in ballo.

# 4. Composizione e calcolo del totale

Un preventivo è: **testata** + **0..N menu alternativi** (ognuno con righe snapshot) + **righe extra** libere + un blocco "menu proposto" testuale legacy.

## 4.1 Menu multipli alternativi (migr. 079)

Il cliente riceve alternative ("Opzione A carne 55€/pax, Opzione B pesce 65€/pax") e ne sceglie una. Ogni menu ha nome, sort_order, sconto in euro, subtotale (somma prezzi righe) e `prezzo_persona = max(0, subtotale − sconto)` ricalcolato server-side a ogni modifica.

**Regola del totale** (`_ricalcola_totale`):

| N. menu | `totale_calcolato` |
|---|---|
| 0 | solo righe extra |
| 1 | `prezzo_persona × n_persone` + righe extra |
| ≥ 2 | **0** — niente totale aggregato (la lista mostra il badge "N alternative") |

I campi denormalizzati `menu_subtotale/menu_sconto/menu_prezzo_persona` sulla testata restano come cache del primo menu (retro-compat per lista/stats).

## 4.2 Righe menu = snapshot immutabile (migr. 075)

Le righe si aggiungono dal **picker del Ricettario** (`GET /foodcost/ricette?kind=dish`, filtro per tipo servizio e testo): passando `recipe_id` il backend snapshotta `menu_name/name`, `menu_description`, `selling_price`, categoria da `recipes` (foodcost.db). Campi passati nel body sovrascrivono lo snapshot (quick edit); senza `recipe_id` è un "piatto veloce" libero. Se il cuoco poi rinomina o riprezza il piatto in Cucina, i preventivi già composti NON cambiano.

## 4.3 Righe extra

Voci libere (noleggio, tovagliato, supplementi) con qta × prezzo; `tipo_riga`: `voce | sconto | supplemento | nota` — lo sconto sottrae dal totale. Salvate **in blocco** (replace) a ogni PUT del preventivo; `totale_riga` ricalcolato server-side.

## 4.4 Menu proposto testuale (legacy, migr. 070)

Campi `menu_nome / menu_prezzo_persona / menu_descrizione` sulla testata: testo libero strutturato per portata, usato come fallback/integrazione. Se esistono righe snapshot, il prezzo a persona in UI è bloccato ("🔒 auto") perché autocalcolato.

# 5. Template: due sistemi distinti

1. **Template di testata** (`clienti_preventivi_template`, Fase B): righe extra precompilate (JSON) + condizioni default. Applicato dalla scheda ("Carica da template"); CRUD nella sezione **Impostazioni CRM → Template Preventivi**. Eliminazione = soft (attivo=0).
2. **Libreria Menu Template** (`clienti_menu_template` + righe, migr. 080): menu ricorrenti (banchetti, pranzi di lavoro) come snapshot di righe + prezzo/sconto suggeriti, organizzati per tipo servizio (soft FK verso `service_types` di foodcost.db). Dal composer: "💾 Salva come template" e "📂 Carica template" (con opzioni sostituisci righe / aggiorna nome / aggiorna prezzo — il caricamento COPIA le righe, i preventivi non seguono le modifiche future del template). CRUD anche in **Impostazioni CRM → Menu Template**. ⚠️ Vedi §12.1.

# 6. Luoghi configurabili

`GET/PUT /preventivi/config/luoghi` — lista salvata come JSON array in `clienti_impostazioni` (chiave `preventivi_luoghi`, default `["Sala","Giardino","Dehor"]`, normalizzata e deduplicata). UI: **Impostazioni CRM → Luoghi Preventivi** (aggiungi/rinomina/riordina/elimina). La scheda preventivo mostra il dropdown dai luoghi configurati, preservando eventuali valori legacy non più in lista.

# 7. Bozze automatiche (`is_bozza_auto`, migr. 076)

Il composer menu funziona anche su `/clienti/preventivi/nuovo` prima del salvataggio esplicito: al primo tocco (aggiungi piatto, crea menu) il frontend crea silenziosamente una bozza con `is_bozza_auto=1` (titolo placeholder "Preventivo in compilazione"), che resta **nascosta da lista e stats** finché l'utente non clicca "Crea preventivo" (PUT con `is_bozza_auto=0` la promuove). Parametro `includi_bozze_auto=true` sulla lista per uso amministrativo/debug.

# 8. PDF (mattone M.B)

`GET /preventivi/{id}/pdf?inline=false` genera il PDF brandizzato via `pdf_brand.genera_pdf_html` con template `app/templates/pdf/preventivo.html` (dati: testata, righe extra, lista menu). Download dal pulsante "📥 Scarica PDF" in scheda. L'invio al cliente resta manuale (allegato WA/email fuori da TRGB).

# 9. Frontend

- **Lista** (`ClientiPreventivi.jsx`, `/clienti/preventivi`): sidebar filtri (ricerca su titolo/numero/cliente, stato, tipo, anno, mese), KPI in header (in ballo / confermati mese / valore mese, da `/stats`), tabella con numero, titolo, cliente, data evento, pax, totale (o badge "N alternative"), stato colorato, scadenza in giorni; paginazione 50; click riga → scheda.
- **Scheda** (`ClientiPreventivoScheda.jsx`, `/clienti/preventivi/:id|nuovo`): testata (titolo, tipo cena_privata/aperitivo/degustazione/catering/altro, canale whatsapp/email/telefono/di_persona/sito, data/ora/pax, luogo, scadenza conferma); cliente con toggle "🔍 Esistente" (autocomplete che riusa `GET /prenotazioni/clienti/search`) / "＋ Nuovo" (creato nel CRM al salvataggio con `origine='preventivo'`); **composer menu** (sotto); menu proposto testuale; extra con tipi e riordino; totale live; note su 3 tab (interne staff / per il cliente / condizioni); sidebar azioni: Salva, transizioni di stato disponibili, Scarica PDF, Duplica, Elimina; barra azioni mobile.
- **Composer** (`PreventivoMenuComposer.jsx`): tab per ogni menu (nome editabile inline, ▲▼ riordino, ✕ elimina, + aggiungi, duplica), sconto per menu, picker piatti dal Ricettario (filtro tipo servizio + ricerca), "piatto veloce", edit inline prezzo riga, riordino righe, salva/carica template libreria.
- **Tab "Preventivi" nella scheda cliente** (`ClientiScheda.jsx`): storico preventivi del cliente (`GET /preventivi?cliente_id=`) + "Nuovo preventivo".
- **Impostazioni CRM** (`ClientiImpostazioni.jsx`): sezioni Template Preventivi, Menu Template, Luoghi Preventivi.
- Colore modulo: indigo; sfondo `bg-brand-cream`; badge stati come tabella §3.

# 10. Schema DB (clienti.sqlite3) e migrazioni

| Tabella | Contenuto | Origine |
|---|---|---|
| `clienti_preventivi` | testata: numero, cliente_id (FK SET NULL), titolo, tipo, data/ora evento, n_persone, luogo, stato, versione (fisso 1), note interne/cliente, condizioni, scadenza_conferma, canale, `prenotazione_id` (mai valorizzato, §11), template_id, totale_calcolato, menu_nome/menu_prezzo_persona/menu_descrizione (070), menu_sconto/menu_subtotale (075, cache primo menu), is_bozza_auto (076), creato_da, created/updated_at (trigger) | `init_clienti_db()` + migr. 070/075/076 |
| `clienti_preventivi_righe` | righe extra: ordine, descrizione, qta, prezzo_unitario, totale_riga, tipo_riga; CASCADE | init |
| `clienti_preventivi_template` | template testata: nome, tipo, righe_json, condizioni_default, attivo | init |
| `clienti_preventivi_menu_righe` | snapshot piatti: preventivo_id (CASCADE), menu_id (079), recipe_id (soft ref), sort_order, category_name, name, description, price | migr. 075 + 079 |
| `clienti_preventivi_menu` | menu alternativi: preventivo_id (CASCADE), nome, sort_order, sconto, subtotale, prezzo_persona | migr. 079 (con backfill di un menu "Menu" per i preventivi pre-esistenti) |
| `clienti_menu_template` / `clienti_menu_template_righe` | libreria menu riutilizzabili: nome, descrizione, service_type_id (soft FK foodcost), prezzo_persona, sconto + righe snapshot | migr. 080 |

Migrazione correttiva: `078_preventivi_menu_prezzo_persona_fix.py` — backfill dopo il bugfix "prezzo/persona = subtotale − sconto" (le righe menu sono già prezzi per 1 coperto, non da dividere per pax).

Il service è difensivo: se le tabelle 075/079 mancano (DB legacy non migrato) degrada ai soli campi testata.

# 11. Non implementato / differenze dalla spec 2026-04

- **Collegamento alla prenotazione**: la colonna `prenotazione_id` esiste ma **nessun codice la scrive**; lo stato "prenotato" è una pura etichetta manuale. La prenotazione va creata a mano nel modulo Prenotazioni.
- **Notifiche staff (M.A)**: la spec prevedeva `crea_notifica` sui preventivi confermati; non c'è alcuna chiamata al mattone.
- **`scaduto` automatico**: la spec lo prevedeva allo scadere di `scadenza_conferma`; oggi è solo transizione manuale (nessun job/checker M.F). La lista evidenzia le scadenze imminenti come promemoria visivo.
- **Versioning (Fase D)**: campo `versione` fermo a 1, nessuna logica.
- **Invio WA/email dal preventivo (Fase C)**: solo download PDF; l'invio è manuale (M.D Email non esiste ancora; nessun uso di M.C qui).
- Roadmap correlata: `CL.4` (invio preventivi, bloccato da M.D) in [roadmap.md](roadmap.md).

# 12. Limiti noti

## 12.1 Check admin rotto su libreria menu template (bug)

`menu_templates_router.py:34` chiama `is_admin(user)` passando l'intero dict utente, ma `auth_service.is_admin(role: str)` si aspetta la stringa ruolo → il confronto è sempre False e `_require_admin` **risponde 403 a chiunque, admin compreso**, su tutte le scritture `/menu-templates/*` e sui due bridge salva-come-template / carica-template. Coerente col DB live: `clienti_menu_template` ha 0 righe. Le letture (GET) funzionano. Fix: `is_admin(user.get("role"))` come fa `preventivi_router.py:193`.

## 12.2 Altri

- `GET /preventivi` (lista) è accessibile a ogni utente loggato mentre `GET /preventivi/stats` è admin-only: la pagina lista per un non-admin mostra la tabella senza KPI.
- La numerazione usa MAX lessicografico sul suffisso: corretta fino a 999 preventivi/anno (irrilevante per i volumi reali).
- Uso reale (DB al 2026-08): 2 preventivi (1 bozza, 1 inviato), 3 menu, 8 righe snapshot, 0 template — modulo giovane, poco battuto.
