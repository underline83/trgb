# Modulo Carta Bevande — Task List Implementativa
> Checklist operativa per Claude e Marco. Spuntare man mano.
> Riferimento architettura: `docs/carta_bevande_design.md`
> Ultimo aggiornamento: 2026-04-19

---

## FASE 0 — Design & docs (COMPLETATA 2026-04-19)
- [x] `docs/carta_bevande_design.md` — design completo
- [x] `docs/carta_bevande_todo.md` — questa checklist
- [x] Review di Marco su design doc
- [x] Chiusura decisioni aperte §10: multi-lingua NO, URL pubblico NO, versioning SÌ

---

## FASE 1 — Backend fondazioni (COMPLETATA 2026-04-19)

### DB e migrazione
- [x] Creare `app/models/bevande_db.py` (schema init + seed + helper query)
- [x] Creare `app/migrations/089_carta_bevande_init.py` (trigger migration idempotente)
- [x] Migration: connessione/creazione `app/data/bevande.sqlite3`
- [x] Migration: `CREATE TABLE bevande_sezioni` (schema §2 design doc)
- [x] Migration: `CREATE TABLE bevande_voci` + indici `idx_bevande_voci_sezione` e `idx_bevande_voci_attivo`
- [x] Migration: seed 8 sezioni (aperitivi, birre, vini, amari_casa, amari_liquori, distillati, tisane, te) con `layout` di default
- [x] Migration: seed `schema_form` JSON per ogni sezione (mapping campi §2 design doc)
- [x] `.gitignore` già copre `app/data/*.sqlite3` — nessuna modifica necessaria
- [ ] Aggiornare `docs/database.md` con schema nuovo DB → differito a Fase 5

### Router `bevande_router.py`
- [x] Struttura base: import, router prefix `/bevande`, JWT `Depends(get_current_user)`
- [x] Helper DB via `get_bevande_conn()` in `bevande_db.py`

#### Sezioni
- [x] `GET /bevande/sezioni/` — lista ordinata + conteggi voci totali/attive per card hub
- [x] `GET /bevande/sezioni/{key}` — dettaglio + schema_form parsato
- [x] `PUT /bevande/sezioni/{key}` — aggiorna nome/intro_html/ordine/attivo/layout/schema_form
- [x] `POST /bevande/sezioni/reorder` — riordino batch

#### Voci
- [x] `GET /bevande/voci/?sezione=&attivo=&q=` — lista filtrata + ricerca su nome/produttore/descrizione
- [x] `GET /bevande/voci/{id}` — dettaglio
- [x] `POST /bevande/voci/` — crea (valida sezione_key, blocca sezione 'vini' dinamica)
- [x] `PUT /bevande/voci/{id}` — aggiorna (PATCH-like: solo campi forniti)
- [x] `DELETE /bevande/voci/{id}` — soft-delete default, `?hard=1` solo admin/superadmin
- [x] `POST /bevande/voci/reorder` — riordino batch (ordine = idx*10)
- [x] `POST /bevande/voci/bulk-import` — import accodato (MAX(ordine)+10 progressivo)

### Permessi
- [x] `_require_editor(user)` → admin/superadmin/sommelier (403 altrimenti)
- [x] `_require_reader(user)` → tutti tranne viewer
- [x] Applicato a ogni endpoint

### Registrazione
- [x] Importare e `include_router(bevande_router)` in `main.py`
- [x] Syntax check (ast.parse) su tutti i file nuovi
- [x] Smoke test locale: init_bevande_db idempotente + schema + indici + insert + count + version_timestamp — TUTTO OK
- [ ] Smoke test endpoint dal VPS post-push (GET /bevande/sezioni/ e POST voce)

---

## FASE 2 — Frontend editor (COMPLETATA 2026-04-19)

### Struttura e routing
- [x] Creata cartella `frontend/src/components/vini/carta/` per componenti condivisi
- [x] Rinominato `ViniCarta.jsx` → `CartaVini.jsx` (solo preview/export vini, componente + header aggiornati)
- [x] Creato `CartaBevande.jsx` (hub 8 card, gestisce `/vini/carta`)
- [x] Creato `CartaSezioneEditor.jsx` (editor generico parametrizzato `:key`)
- [x] Creato `CartaAnteprima.jsx` (preview completa master, placeholder in attesa di Fase 3)
- [x] Route `App.jsx`: `/vini/carta` → hub, `/vini/carta/vini` → CartaVini, `/vini/carta/sezione/:key` → editor, `/vini/carta/anteprima` → preview
- [x] Aggiornato `versions.jsx` con "Carta Bevande v1.0"

### Componenti condivisi (`components/vini/carta/`)
- [x] `FormDinamico.jsx` — render form da schema_form (text/number/textarea/select + required + errori inline)
- [x] `ImportTestoModal.jsx` — textarea → preview → conferma (parser TAB/2+spazi, tabella editabile)
- [ ] `CartaCardModulo.jsx` — NON estratto, logica card inline in `CartaBevande.jsx` (sufficiente per MVP)
- [ ] `SortableList.jsx` — non necessario ora: riordino via bottoni ↑↓ (mobile-friendly, niente pointer drag da gestire)

### Hub `CartaBevande.jsx`
- [x] Header titolo "📜 Carta delle Bevande" + sottotitolo
- [x] Bottone "← Menu Vini" + pulsanti globali (Anteprima, PDF, PDF Staff, Word)
- [x] Griglia card: Vini come hero (col-span-2), altre 7 quadrate, responsive 2→3 colonne
- [x] Fetch `/bevande/sezioni/` + conteggi voci per ogni card
- [x] Loader con `TrgbLoader`, stato empty se nessuna sezione
- [x] Click card vini → `/vini/carta/vini`
- [x] Click card altra sezione → `/vini/carta/sezione/:key`

### Editor sezione `CartaSezioneEditor.jsx`
- [x] Header: nome sezione + contatori + pulsanti "+ Nuova voce", "Import testo", "Anteprima sezione"
- [x] Fetch schema_form + voci (Promise.all, parallel)
- [x] Tabella voci: bottoni ↑↓ ordine + nome + meta riassunto + prezzo + toggle attivo + edita/duplica/elimina
- [x] Riordino via `POST /bevande/voci/reorder` (ottimista con rollback on error)
- [x] Modal form nuovo/edita con `FormDinamico` (campi da schema_form)
- [x] Validazione required + errori inline + toast
- [x] Duplica: POST voce clone con nome "(copia)"
- [x] Conferma elimina con `window.confirm`
- [x] Import testo: modale textarea + "Parsa" → tabella editabile + Conferma → `POST /bevande/voci/bulk-import`
- [x] Anteprima sezione: apre `/bevande/sezioni/:key/preview` in tab nuovo (endpoint in Fase 3)
- [x] Toast feedback azioni
- [x] Sezione `vini` → banner informativo che rimanda a Cantina (editor disabilitato)
- [x] Filtro ricerca nome/produttore/tipologia + toggle "solo attive"

### Preview completa `CartaAnteprima.jsx`
- [x] Embed iframe `/bevande/carta` (master, placeholder Fase 3)
- [x] Bottoni export (PDF cliente, PDF staff, DOCX)
- [x] Bottone "Ricarica" con reload iframe
- [x] Warning che endpoint sarà disponibile dopo Fase 3

### Stile
- [x] Sfondo `bg-brand-cream` su tutte le pagine nuove
- [x] Componente M.I (`Btn`) in uso su tutti i CTA (touch 40-48pt)
- [x] Card con colori coerenti (amber=vini, rose=aperitivi, yellow=birre, emerald=amari_casa, red=amari_liquori, orange=distillati, lime=tisane, teal=te)
- [x] Modali full-screen su mobile (`p-0 sm:p-4`, `rounded-t-2xl sm:rounded-2xl`)
- [x] Sintassi JSX validata con @babel/parser (8/8 file OK)

---

## FASE 3 — Export unificato (COMPLETATA 2026-04-19)

### Service `carta_bevande_service.py`
- [x] Creato `app/services/carta_bevande_service.py`
- [x] `build_copertina_html(logo_path, staff)` — titolo + logo + version carta (front-version badge)
- [x] `build_toc_html(sezioni_attive)` — indice master con rimando a "vedi indice dettagliato" per vini
- [x] `build_section_html(sezione, voci, for_pdf, staff)` — dispatcher su `layout`
- [x] `_render_tabella_4col(voci, staff)` — Pattern A (distillati, amari_liquori), raggruppato per tipologia
- [x] `_render_scheda_estesa(voci, staff)` — Pattern B (birre, aperitivi, amari_casa) con meta line produttore·stile·formato·grad·IBU
- [x] `_render_nome_badge_desc(voci, staff)` — Pattern C (tisane, tè) con badge colorati per tipo tè
- [x] `build_carta_bevande_html(include_vini, for_pdf, staff)` — orchestratore, delega sezione vini a `carta_vini_service`
- [x] `build_carta_bevande_docx(logo_path, staff)` — versione DOCX master (3 layout + rimando docx vini dedicato)
- [x] `get_version_string()` — "v{YYYY}.{MM}.{DD}" da MAX(updated_at) bevande (fallback data odierna)
- [x] `_note_staff_block(voce, staff)` — render note_interne solo in PDF/DOCX staff

### CSS
- [x] Esteso `static/css/carta_html.css` con `.bev-section`, `.bev-4col`, `.bev-scheda`, `.bev-badge-*`, `.bev-note-staff`, `.bev-version-footer`
- [x] Esteso `static/css/carta_pdf.css` con stessi selettori + `.front-version`, `.bev-section-pdf` page-break, `.bev-section-vini` reset
- [x] Watermark footer e numeri pagina restano dal blocco @page esistente

### Endpoint export (in `bevande_router.py`)
- [x] `GET /bevande/carta` — HTML preview master (wrapper + carta_html.css + version footer)
- [x] `GET /bevande/carta/pdf` — PDF cliente (WeasyPrint, frontespizio + TOC + body)
- [x] `GET /bevande/carta/pdf-staff` — PDF staff con note_interne evidenziate
- [x] `GET /bevande/carta/docx` — DOCX master python-docx
- [x] `GET /bevande/sezioni/{key}/preview` — HTML singola sezione per editor (sezione 'vini' redirect a /vini/carta)

### Frontend punta al nuovo master
- [x] `CartaAnteprima.jsx` iframe `/bevande/carta` (già fatto in Fase 2, warning rimosso)
- [x] Export buttons → `/bevande/carta/*` (già in hub e anteprima)
- [x] `CartaVini.jsx` continua a puntare a `/vini/carta*` (immutata)
- [x] **NESSUN endpoint pubblico**: tutti gli export richiedono JWT (router-level `Depends(get_current_user)` + `_require_reader`)

### Retro-compatibilità
- [x] `/vini/carta` del router vini invariato: risponde ancora con solo la carta vini
- [x] `/vini/carta/pdf`, `/pdf-staff`, `/docx` invariati: generano PDF/DOCX solo vini identici a oggi
- [ ] Smoke test sul VPS post-push: aprire `/bevande/carta`, scaricare PDF/Word, confrontare `/vini/carta` per regressioni

---

## FASE 4 — Popolamento dati (Marco)
- [ ] Aperitivi: ~5-10 voci
- [ ] Birre: ~10 voci (Hammer dal PDF vecchio)
- [ ] Amari fatti in casa: 5-10 voci
- [ ] Amari & Liquori: 20-30 voci
- [ ] Distillati: ~60 voci (Grappe + Rum + Whisky dal PDF vecchio)
  - [ ] Grappe: ~25 righe
  - [ ] Rum: ~10 righe
  - [ ] Whisky: ~25 righe
- [ ] Tisane: ~7 voci
- [ ] Tè: ~10-15 voci

Tip: usare bulk-import copiando colonne dal Word vecchio quando possibile.

---

## FASE 5 — Documentazione e chiusura
- [ ] Aggiornare `docs/changelog.md` con release Carta Bevande v1.0
- [ ] Aggiornare `docs/roadmap.md` (spostare da backlog a done)
- [ ] Aggiornare `docs/architettura_mattoni.md` se emerge pattern riusabile
- [ ] Aggiornare `docs/sessione.md` a fine ogni sessione di lavoro
- [ ] Aggiornare `docs/problemi.md` se bug/regressioni
- [ ] Aggiornare `docs/modulo_vini.md` con riferimento al nuovo sub-modulo Carta Bevande

---

## Criteri di accettazione Fase 1.0

- [ ] Da hub "Carta" si accede a 8 card incluse Vini (hero) e le 7 nuove sezioni.
- [ ] Ogni sezione ha un editor funzionante (CRUD + drag&drop + import testo).
- [ ] Preview completa su `/bevande/carta` mostra tutte le sezioni attive nell'ordine configurato, con i vini nel punto giusto.
- [ ] Export PDF cliente + PDF staff + DOCX generano correttamente.
- [ ] Versione carta visibile in footer.
- [ ] Permessi: admin/sommelier editano, sala/chef solo leggono, viewer nulla.
- [ ] Mobile/iPad: tutto usabile con touch.
- [ ] Retro-compatibilità: `/vini/carta*` continua a rispondere con la sola carta vini.
- [ ] Marco ha popolato le 7 sezioni e stampato la prima "Carta delle Bevande" completa.
