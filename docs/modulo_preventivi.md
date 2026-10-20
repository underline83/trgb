# Modulo Preventivi — TRGB Gestionale

> **Tipo:** 📄 pagina wiki · **Stato:** attuale · **Ultima verifica:** 2026-10-19
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

Flusso tipico: Marco crea il preventivo (titolo, cliente, data/pax/luogo) → compone uno o più **menu alternativi** pescando piatti dal Ricettario o scrivendoli al volo → aggiunge eventuali **extra** (noleggi, supplementi, sconti) → lo manda al cliente da **«📨 Invia al cliente»** (WhatsApp con testo completo + PDF, oppure email col PDF allegato; l'invio resta nel registro e porta bozza → inviato) → aggiorna lo **stato** man mano (inviato → confermato → prenotato → completato → fatturato).

Le Fasi A (CRUD), B (template/righe/totale) e C (PDF + invio WA/email, dal 2026-10-19) della spec sono implementate, la D no (versioning e collegamento automatico alla prenotazione mancano — vedi §11).

# 2. Capability

Codici dall'audit 2026-05-19 (`docs/audit-2026-05-19/01_AUDIT_PER_MODULO.md`, sottomoduli C e D del modulo prenotazioni).

| Codice | Cosa fa | Riferimento | Audience | Stato docs |
|---|---|---|---|---|
| C-P-019 | Lista preventivi con filtri + KPI (in ballo, confermati, valore mese). Default «Prossimi»: eventi da oggi + senza data (`periodo=prossimi`, 2026-10-16) | `GET /preventivi` + `GET /preventivi/stats` — `preventivi_router.py` | admin (stats), tutti (lista) | ✅ |
| C-P-020 | Luoghi evento configurabili | `GET/PUT /preventivi/config/luoghi` — `:232, :237` | admin (PUT) | ✅ |
| C-P-021 | Template di testata (righe extra + condizioni precompilate) | `GET /preventivi/template/lista` + `POST/PUT/DELETE /template[/{id}]` — `:247-:268` | admin | ✅ |
| C-P-022 | CRUD preventivo (numero automatico, cliente inline, righe in blocco) | `GET/POST/PUT/DELETE /preventivi[/{id}]` — `:281, :289, :298, :310` | admin (scritture) | ✅ |
| C-P-023 | Cambio stato con transizioni validate | `POST /preventivi/{id}/stato` — `:319` | admin | ✅ |
| C-P-024 | Duplica preventivo come nuova bozza (righe + menu inclusi) | `POST /preventivi/{id}/duplica` — `:331` | admin | ✅ |
| C-P-025 | Righe menu snapshot sul menu primario (legacy pre-menu multipli) | `GET/POST/PUT/DELETE /preventivi/{id}/menu-righe[/{rid}]` + `PUT /menu-sconto` — `:344-:397` | admin | ✅ |
| C-P-026 | Menu multipli alternativi (crea, rinomina, sconto, duplica, riordina, elimina) | `GET/POST/PUT/DELETE /preventivi/{id}/menu[/{mid}]` + `POST /{mid}/duplica` + `PUT /menu-ordine` — `:408-:458` | admin | ✅ |
| C-P-027 | Righe di un menu specifico + riordino | `GET/POST /preventivi/{id}/menu/{mid}/righe` + `PUT /righe-ordine` — `:466-:497` | admin | ✅ |
| C-P-028 | PDF per il cliente nello stile del menù gruppi (A5); `?stile=scheda` il vecchio A4 | `GET /preventivi/{id}/pdf?inline=&stile=` — `preventivi_pdf.py` + `preventivo_menu.html` | ruoli del modulo | ✅ 2026-10-19 |
| C-P-029 | Libreria menu template: CRUD | `GET/POST/PUT/DELETE /menu-templates[/{id}]` — `menu_templates_router.py:92-:139` | admin (scritture) | ✅ |
| C-P-030 | Duplica menu template | `POST /menu-templates/{id}/duplica` — `:142` | admin | ✅ |
| C-P-031 | Righe template (aggiungi, elimina, riordina) + bridge salva/carica su menu preventivo | `POST/DELETE /menu-templates/{id}/righe[/{rid}]`, `PUT /righe-ordine`; `POST /preventivi/{id}/menu/{mid}/salva-come-template` e `/carica-template` — `menu_templates_router.py` | admin | ✅ (fix 2026-10-16, §12.1) |
| C-P-032 | Prezzo «a corpo» per menu: prezzo a persona a mano, doppio prezzo vino escluso/incluso, scelta del prezzo per il totale | `PUT /preventivi/{id}/menu/{mid}` (campi `pricing_mode`, `prezzo_corpo`, `prezzo_corpo_vino`, `doppio_prezzo`, `prezzo_corpo_scelta`) — `preventivi_router.py` + `PreventivoMenuComposer.jsx` | admin | 🆕 2026-10-16 |
| C-P-033 | Menu scelto dal cliente tra le alternative; finché non sceglie totale «da X a Y» | `PUT /preventivi/{id}` (`menu_scelto_id`, 0 = nessuno); `GET /preventivi/{id}` espone `totale_min/totale_max` | admin | 🆕 2026-10-16 |
| C-P-034 | Testo per il cliente (WhatsApp con M.C / copia per email): menu, portate, prezzo a persona, extra; niente totale (2026-10-19); mai i prezzi dei piatti | `GET /preventivi/{id}/testo` → `{testo, telefono}` — `preventivi_service.testo_cliente`; bottoni «💬 WhatsApp» / «📋 Copia testo» in scheda | tutti i ruoli del modulo | 🆕 2026-10-16 |
| C-P-035 | Stagione dei menu template: campo, filtro, elenco stagioni | `GET /menu-templates/?stagione=`, `GET /menu-templates/stagioni` | ruoli del modulo (lettura), admin (scrittura) | 🆕 2026-10-16 |
| C-P-036 | Carica più template in un colpo come menu alternativi (un tab per template) | `POST /preventivi/{id}/menu/da-template` `{template_ids}` — `menu_templates_service.crea_menu_da_templates` | admin | 🆕 2026-10-16 |
| C-P-037 | Pannello «📨 Invia al cliente»: salva, prepara testo + PDF, WhatsApp (condivisione PDF+testo o chat col testo + PDF da scaricare), email | `PreventivoInvioModal.jsx` + scheda | admin (invio) | 🆕 2026-10-19 |
| C-P-038 | Email al cliente col PDF allegato (M.D), destinatario/oggetto/testo proposti e modificabili | `GET /preventivi/{id}/email-bozza`, `POST /preventivi/{id}/invia-email` — `preventivi_service.bozza_email / invia_email_preventivo` | admin | 🆕 2026-10-19 |
| C-P-039 | Registro invii (canale, a chi, quando, chi, esito); il primo invio riuscito porta bozza → inviato | `GET/POST /preventivi/{id}/invii` — `preventivi_service.registra_invio / lista_invii` | lettura ruoli modulo, scrittura admin | 🆕 2026-10-19 |
| C-P-040 | Nuovo preventivo da una prenotazione: dal Planning «📋 Preventivo» apre `/clienti/preventivi/nuovo` con cliente (o cliente nuovo coi dati dell'ospite), titolo, data, ora, coperti e note (allergie, note) già compilati; scrive `prenotazione_id`; se la prenotazione ha già un preventivo apre quello; in scheda il riquadro «📅 Nato dalla prenotazione…» riporta al Planning | `POST/PUT /preventivi` (`prenotazione_id`), `GET /preventivi?prenotazione_id=` — `ClientiPreventivoScheda.jsx` (state `prenotazione`) | admin/superadmin (chi può creare preventivi) | 🆕 2026-10-20 |

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

Il cliente riceve alternative ("Opzione A carne 55€/pax, Opzione B pesce 65€/pax") e ne sceglie una. Ogni menu ha nome, sort_order, sconto in euro **a persona**, subtotale e `prezzo_persona = max(0, subtotale − sconto)` ricalcolato server-side a ogni modifica.

**Modalità di prezzo** (migr. 187, `pricing_mode` sul menu):

| Modalità | `subtotale` | Piatti |
|---|---|---|
| `somma` (default, anche per i menu esistenti) | somma dei prezzi delle righe | prezzo visibile in UI, mai sul PDF/testo |
| `corpo` | `prezzo_corpo`, oppure `prezzo_corpo_vino` se `doppio_prezzo=1` e `prezzo_corpo_scelta='incluso'` | composizione per portata: prezzo ignorato (può essere 0), in UI al posto del prezzo la **portata** (Antipasto, Primo, Secondo, Contorno, Dolce) |

Con il doppio prezzo il cliente vede entrambi i prezzi («50 / 55 € a persona (vino escluso / incluso)», al netto dello sconto); il totale usa quello scelto in `prezzo_corpo_scelta`. Etichetta in `preventivi_service.etichetta_prezzo` (campo `prezzo_etichetta` di ogni menu in `GET /preventivi/{id}`).

**Regola del totale** (`_ricalcola_totale`):

| N. menu | `totale_calcolato` |
|---|---|
| 0 | solo righe extra |
| 1 | `prezzo_persona × n_persone` + righe extra |
| ≥ 2, cliente ha scelto (`menu_scelto_id`, migr. 187) | come 1 menu, con quello scelto |
| ≥ 2, non ha scelto | **0** (la lista mostra il badge "N alternative"); scheda, PDF e testo mostrano la forbice **«da X a Y €»** = min/max di `prezzo_persona × n_persone` + extra (`totale_min/totale_max` in `GET /preventivi/{id}`) |

Con `menu_scelto_id` il PDF e il testo mostrano solo il menu scelto. Eliminando il menu scelto la scelta si azzera.

I campi denormalizzati `menu_subtotale/menu_sconto/menu_prezzo_persona` sulla testata restano come cache del primo menu (retro-compat per lista/stats).

## 4.2 Righe menu = snapshot immutabile (migr. 075)

Le righe si aggiungono dal **picker del Ricettario** (`GET /foodcost/ricette?kind=dish`, filtro per tipo servizio e testo): passando `recipe_id` il backend snapshotta `menu_name/name`, `menu_description`, `selling_price`, categoria da `recipes` (foodcost.db). Campi passati nel body sovrascrivono lo snapshot (quick edit); senza `recipe_id` è un "piatto veloce" libero. Se il cuoco poi rinomina o riprezza il piatto in Cucina, i preventivi già composti NON cambiano.

## 4.3 Righe extra

Voci libere (noleggio, tovagliato, supplementi) con qta × prezzo; `tipo_riga`: `voce | sconto | supplemento | nota` — lo sconto sottrae dal totale. Salvate **in blocco** (replace) a ogni PUT del preventivo; `totale_riga` ricalcolato server-side.

## 4.4 Menu proposto testuale (legacy, migr. 070)

Campi `menu_nome / menu_prezzo_persona / menu_descrizione` sulla testata: testo libero strutturato per portata, usato come fallback/integrazione. Se esistono righe snapshot, il prezzo a persona in UI è bloccato ("🔒 auto") perché autocalcolato.

# 5. Template: due sistemi distinti

1. **Template di testata** (`clienti_preventivi_template`, Fase B): righe extra precompilate (JSON) + condizioni default. Applicato dalla scheda ("Carica da template"); CRUD nella sezione **Impostazioni CRM → Template Preventivi**. Eliminazione = soft (attivo=0).
2. **Libreria Menu Template** (`clienti_menu_template` + righe, migr. 080): menu ricorrenti (banchetti, pranzi di lavoro) come snapshot di righe + prezzo/sconto suggeriti, organizzati per tipo servizio (soft FK verso `service_types` di foodcost.db). Dal composer: "💾 Salva come template" e "📂 Carica template" (con opzioni sostituisci righe / aggiorna nome / aggiorna prezzo — il caricamento COPIA le righe, i preventivi non seguono le modifiche future del template). CRUD anche in **Impostazioni CRM → Menu Template**.
   - Migr. 187: il template salva anche **modalità di prezzo e prezzi a corpo** (non la scelta vino, che è del preventivo) e una **stagione** libera («Autunno-Inverno 2026»), con filtro in «Carica template» e in Impostazioni: la libreria tiene le proposte di ogni stagione.
   - In «Carica template» si possono **spuntare più template** e aggiungerli come menu alternativi, uno per tab (es. i 5 menu gruppi Quadri/Picche/Fiori/Cuori/Jolly). Un primo menu vuoto creato in automatico viene riusato.

# 6. Luoghi configurabili

`GET/PUT /preventivi/config/luoghi` — lista salvata come JSON array in `clienti_impostazioni` (chiave `preventivi_luoghi`, default `["Sala","Giardino","Dehor"]`, normalizzata e deduplicata). UI: **Impostazioni CRM → Luoghi Preventivi** (aggiungi/rinomina/riordina/elimina). La scheda preventivo mostra il dropdown dai luoghi configurati, preservando eventuali valori legacy non più in lista.

# 7. Bozze automatiche (`is_bozza_auto`, migr. 076)

Il composer menu funziona anche su `/clienti/preventivi/nuovo` prima del salvataggio esplicito: al primo tocco (aggiungi piatto, crea menu) il frontend crea silenziosamente una bozza con `is_bozza_auto=1` (con i dati già scritti nel form; se il titolo è vuoto, placeholder "Preventivo in compilazione"), che resta **fuori dalle stats** finché l'utente non clicca "Crea preventivo" (PUT con `is_bozza_auto=0` la promuove). Parametro `includi_bozze_auto=true` sulla lista per uso amministrativo/debug.

**Dal 2026-10-16** in lista compaiono le bozze automatiche con un **titolo vero** (non il placeholder), col badge arancio **«non salvata»**: sono preventivi compilati a cui è mancato solo «Crea preventivo» (caso reale: Comunione Calvi 4/4/2027). Aprendole, la scheda mostra un avviso e «Salva modifiche» le promuove. Le bozze col titolo placeholder restano nascoste.

# 8. PDF (mattone M.B)

`GET /preventivi/{id}/pdf?inline=false&stile=menu` — **dal 2026-10-19 il PDF che va al cliente ricalca il menù gruppi stampato** (`04-Cucina/01-Menu-Attivi/menù-gruppi-autunno-inverno-2026.pdf`): A5, Bodoni Moda (titoli, prezzi) + Courier Prime (piatti, testi), bianco e nero con un solo accento ruggine. Codice: `app/services/preventivi_pdf.py` (dati + CSS) + `app/templates/pdf/preventivo_menu.html` (+ `_preventivo_blocco.html`), via `pdf_brand.genera_pdf_html` con `css_extra`; i `@font-face` stanno nel `<style>` del documento (WeasyPrint carica i font web solo da lì). Font in `static/fonts/` (OFL), logo del locale in `locali/<locale>/assets/pdf/logo.svg` (estratto vettoriale dal PDF stampato; se manca, il nome del locale in Bodoni).

Pagine: **copertina** (logo, «PROPOSTA MENÙ», per {cliente}, data in ruggine, persone e ora, numero piccolo) → **una pagina per menù** («Menù» + nome senza il prefisso «Menù gruppi», piatti in maiuscolo spaziato, le descrizioni con « · » diventano righe sotto il piatto, prezzo a persona in fondo: «50/55 vino escluso/incluso» o «50 a persona») → **Extra** (solo se ci sono righe extra, con importo) → **pagine di testo** da *Note per il cliente* e *Condizioni* → **retro** col logo. Col menu scelto c'è solo quello. Mai i prezzi dei singoli piatti. **Niente pagina di riepilogo né totale** (Marco, 2026-10-19): il cliente legge il prezzo a persona di ogni menù; il totale resta solo in scheda. Un `== prezzo` in fondo a una pagina di testo va in basso come nei menù (es. la pagina «Menù bambini»).

**Mini-markup** di condizioni e note (così le pagine «Dolci» e «Note» del menù stampato si scrivono dal gestionale): `# TITOLO` nuova pagina; `## VOCE` riga maiuscola spaziata; `== 25 | menù bambini` prezzo grande con nota (in fondo alla pagina se è l'ultimo blocco); `**grassetto**`; riga vuota = nuovo paragrafo; righe subito sotto una `## VOCE` = sua descrizione; **`@dolci_carta`** = i dolci della carta in corso, uno per riga (`@dolci_carta | Lucia di Lammermoor` aggiunge sotto i dolci nominati la prima frase della descrizione di carta, in minuscolo) (servizio platform read-only `app/services/carta_in_corso_service.py`, legge `menu_editions`/`menu_dish_publications` in_carta, sezione `dolci`): cambiata la carta, cambia il PDF. Le condizioni senza `# ` iniziale finiscono in una pagina «NOTE». Il testo standard sta nel **template di testata** «Gruppi autunno-inverno 2026» (Impostazioni CRM → Template Preventivi), da caricare nel preventivo.

`?stile=scheda` dà il vecchio foglio A4 con intestazione TRGB, stato e tabelle (`preventivo.html`), utile in interno.

**Testo per il cliente** (migr. 187): `GET /preventivi/{id}/testo` costruisce lo stesso contenuto come messaggio (formattazione WhatsApp `*grassetto*` / `_corsivo_`). Lo usa il pannello d'invio (§8.1); «📋 Copia testo» resta in scheda per incollarlo altrove. Usa i dati **salvati**. L'email usa `testo_cliente(id, formato="email")` (senza `*` e `_`). Note per il cliente e condizioni passano da `preventivi_pdf.testo_da_markup` (2026-10-19): il mini-markup del PDF diventa testo (`# TITOLO` → titolo, `## voce` → «• voce», `@dolci_carta` → elenco dei dolci della carta, `== 25 | nota` → «25 € nota»); prima finiva crudo nel messaggio.

## 8.1 Invio al cliente (mig 200, 2026-10-19)

«📨 Invia al cliente» (sidebar e barra mobile) **salva** il preventivo e apre `PreventivoInvioModal`, che scarica subito testo, PDF e bozza email (così la condivisione parte dentro il tocco, come vuole Safari).

- **WhatsApp in due passi** (2026-10-20, dopo la prova di Marco dall'iPad col WhatsApp dell'osteria: la condivisione fa scegliere solo tra le chat esistenti e il numero di un cliente nuovo non c'è): **1 · Apri la chat** — wa.me col numero e il messaggio, si invia in WhatsApp (così la chat esiste ed è in cima alle recenti); **2 · Allega il PDF** — condivisione del solo PDF, si sceglie quella chat; dove la condivisione non c'è (Mac) «Scarica il PDF» da trascinare. Il registro scrive l'invio al passo 1.
- **WhatsApp — messaggio asciutto + PDF** (dal 2026-10-19 lo stesso testo corto dell'email, in formato WhatsApp: «• *Quadri* — 50 / 55 €»; **modificabile** nel pannello prima di condividere, «↺ Testo proposto» lo ripristina; `GET /testo?tipo=completo` dà ancora quello con portate e condizioni).
- *(prima: testo completo + PDF)* `wa.me` non può allegare file, quindi: «📤 Condividi PDF + testo» usa la Web Share API (`navigator.share({files, text})`) — c'è su iPhone/iPad e sui browser che la supportano; in WhatsApp si sceglie la chat del cliente. Il testo viene anche copiato negli appunti, se WA tiene solo il PDF. Dove la condivisione non c'è (tipicamente Mac): «💬 Apri chat col testo» (chat del cliente via M.C con il testo completo) + «📥 Scarica PDF» da trascinare nella chat. Il telefono è modificabile nel pannello.
- **Email** — casella del locale (mattone M.D, `email_service.invia_email`), PDF allegato, destinatario (email del cliente), oggetto e testo proposti da `GET /email-bozza` e modificabili. Dal 2026-10-19 il testo proposto è **corto**: saluto, «vi mandiamo la nostra proposta per sabato 24 ottobre, 16 persone alle 19:30», l'elenco dei menù col prezzo a persona («Quadri — 50 / 55 €», «a persona, vino escluso / incluso»), «Nel PDF allegato trovate le portate e tutti i dettagli», firma; oggetto «Proposta menù — sabato 24 ottobre · {firma}». Portate, dolci e condizioni stanno solo nel PDF (WhatsApp invece manda il testo completo). Firma = nome mittente della casella (nessun testo del locale nel codice). Se la casella non è configurata il pannello lo dice e non invia. Un errore SMTP non è un 500: torna `ok=false` e finisce nel registro come «non partita».
- **Registro** `clienti_preventivi_invii`: ogni invio WhatsApp (una riga per apertura del pannello, al primo «Condividi» riuscito o «Apri chat») e ogni email (anche fallita). Il primo invio riuscito porta **bozza → inviato** (ed esce dalle bozze automatiche) e compila `canale` se vuoto. Storico in fondo al pannello.
- WhatsApp «inviato» vuol dire «aperto/condiviso da TRGB»: che il messaggio sia partito davvero lo sa solo WhatsApp.

# 9. Frontend

- **Lista** (`ClientiPreventivi.jsx`, `/clienti/preventivi`): filtri (ricerca su titolo/numero/cliente, stato, tipo, periodo, mese) — sidebar da `lg` in su, sotto `lg` barra compatta sopra la tabella (cerca + periodo, «Altri filtri» a scomparsa). **Periodo** di default «Prossimi» (eventi da oggi + preventivi senza data), poi «Tutti» o un anno (anno corrente ±); il mese si sceglie solo con un anno. Prima il default era l'anno corrente e la sidebar era nascosta sotto `lg`: gli eventi dell'anno dopo sparivano senza modo di vederli. Le bozze automatiche (§7) compaiono solo se hanno un titolo vero, col badge «non salvata»; KPI in header (in ballo / confermati mese / valore mese, da `/stats`), tabella con numero, titolo, cliente, data evento, pax, totale (o badge "N alternative"), stato colorato, scadenza in giorni; paginazione 50; click riga → scheda.
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
| `clienti_preventivi_menu` | menu alternativi: preventivo_id (CASCADE), nome, sort_order, sconto, subtotale, prezzo_persona; `pricing_mode` ('somma'/'corpo'), `prezzo_corpo`, `prezzo_corpo_vino`, `doppio_prezzo`, `prezzo_corpo_scelta` ('escluso'/'incluso') | migr. 079 (con backfill di un menu "Menu" per i preventivi pre-esistenti) + 187 |
| `clienti_menu_template` / `clienti_menu_template_righe` | libreria menu riutilizzabili: nome, descrizione, service_type_id (soft FK foodcost), prezzo_persona, sconto, `pricing_mode`, `prezzo_corpo`, `prezzo_corpo_vino`, `doppio_prezzo`, `stagione` + righe snapshot | migr. 080 + 187 |

Migr. 200 aggiunge `clienti_preventivi_invii` (preventivo_id CASCADE, canale whatsapp/email, destinatario, oggetto, esito ok/errore, errore, message_id, inviato_da, created_at).

Migr. 187 aggiunge anche `clienti_preventivi.menu_scelto_id` (NULL = il cliente non ha ancora scelto). Solo ADD COLUMN con default neutri: i preventivi esistenti restano in modalità `somma` con gli stessi totali (verificato su copia del DB: PRE-2026-001 450 €, PRE-2026-002 0 € con forbice 800–2.400 €).

Migrazione correttiva: `078_preventivi_menu_prezzo_persona_fix.py` — backfill dopo il bugfix "prezzo/persona = subtotale − sconto" (le righe menu sono già prezzi per 1 coperto, non da dividere per pax).

Il service è difensivo: se le tabelle 075/079 mancano (DB legacy non migrato) degrada ai soli campi testata.

# 11. Non implementato / differenze dalla spec 2026-04

- **Collegamento alla prenotazione**: dal 2026-10-20 `prenotazione_id` si scrive quando il preventivo nasce dal tasto «📋 Preventivo» del Planning (C-P-040). Manca il verso opposto: un preventivo confermato non crea la prenotazione, e lo stato "prenotato" resta un'etichetta manuale.
- **Notifiche staff (M.A)**: la spec prevedeva `crea_notifica` sui preventivi confermati; non c'è alcuna chiamata al mattone.
- **`scaduto` automatico**: la spec lo prevedeva allo scadere di `scadenza_conferma`; oggi è solo transizione manuale (nessun job/checker M.F). La lista evidenzia le scadenze imminenti come promemoria visivo.
- **Versioning (Fase D)**: campo `versione` fermo a 1, nessuna logica.
- **Invio WA/email (Fase C)**: ✅ dal 2026-10-19 (§8.1). Restano fuori: link pubblico al PDF (deciso: no), tracking aperture email, copia dell'email nella cartella «Inviata» della casella (SMTP non la salva).
- Roadmap correlata: `CL.4` in [roadmap.md](roadmap.md).

# 12. Limiti noti

## 12.1 Libreria menu template inutilizzabile — ✅ RISOLTO 2026-10-16

Due bug insieme, per questo `clienti_menu_template` aveva 0 righe:
- `_require_admin` chiamava `is_admin(user)` col dict intero → **403 a chiunque**, admin compreso, su tutte le scritture e sui bridge salva/carica. Ora `verifica_ruoli(user, "admin")` (M.G).
- `_get_service_types_map` leggeva `service_types.code`, colonna che non esiste (migr. 074) → **500 su ogni lettura** di template. Ora legge `id, name`.

## 12.2 Altri

- `GET /preventivi` (lista) è accessibile a ogni utente loggato mentre `GET /preventivi/stats` è admin-only: la pagina lista per un non-admin mostra la tabella senza KPI.
- La numerazione usa MAX lessicografico sul suffisso: corretta fino a 999 preventivi/anno (irrilevante per i volumi reali).
- Uso reale (DB al 2026-08): 2 preventivi (1 bozza, 1 inviato), 3 menu, 8 righe snapshot, 0 template — modulo giovane, poco battuto.
