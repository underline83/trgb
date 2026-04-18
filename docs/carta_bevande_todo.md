# Modulo Carta Bevande — Task List Implementativa
> Checklist operativa per Claude e Marco. Spuntare man mano.
> Riferimento architettura: `docs/carta_bevande_design.md`
> Ultimo aggiornamento: 2026-04-19

---

## FASE 0 — Design & docs (COMPLETATA 2026-04-19)
- [x] `docs/carta_bevande_design.md` — design completo
- [x] `docs/carta_bevande_todo.md` — questa checklist
- [ ] Review di Marco su design doc
- [ ] Chiusura decisioni aperte §10: multi-lingua, URL pubblico, versioning

---

## FASE 1 — Backend fondazioni

### DB e migrazione
- [ ] Creare `app/migrations/NNN_bevande_sqlite.py`
- [ ] Migration: connessione/creazione `app/data/bevande.sqlite3`
- [ ] Migration: `CREATE TABLE bevande_sezioni` (schema §2 design doc)
- [ ] Migration: `CREATE TABLE bevande_voci` + indice `idx_bevande_voci_sezione`
- [ ] Migration: seed 8 sezioni (aperitivi, birre, vini, amari_casa, amari_liquori, distillati, tisane, te) con `layout` di default
- [ ] Migration: seed `schema_form` JSON per ogni sezione (mapping campi §2 design doc)
- [ ] Aggiornare `docs/database.md` con schema nuovo DB
- [ ] Aggiungere `bevande.sqlite3` e `bevande*.db-journal` a `.gitignore` (lezione runtime dirs)
- [ ] Creare `app/data/bevande/` cartella placeholder se serve convenzione

### Router `bevande_router.py`
- [ ] Struttura base: import, router prefix `/bevande`, JWT helper
- [ ] Helper DB connection per `bevande.sqlite3` (coerente con notifiche_service pattern)

#### Sezioni
- [ ] `GET /bevande/sezioni/` — lista ordinata (filtra per ruolo)
- [ ] `GET /bevande/sezioni/{key}` — dettaglio + schema_form
- [ ] `PUT /bevande/sezioni/{key}` — aggiorna intro_html/ordine/attivo/layout/schema_form
- [ ] `POST /bevande/sezioni/reorder` — riordino batch

#### Voci
- [ ] `GET /bevande/voci/?sezione=&attivo=&q=` — lista filtrata + ricerca su nome/produttore
- [ ] `GET /bevande/voci/{id}` — dettaglio
- [ ] `POST /bevande/voci/` — crea (valida sezione_key + campi required da schema_form)
- [ ] `PUT /bevande/voci/{id}` — aggiorna
- [ ] `DELETE /bevande/voci/{id}` — soft-delete default, `?hard=1` per admin
- [ ] `POST /bevande/voci/reorder` — riordino batch per sezione
- [ ] `POST /bevande/voci/bulk-import` — import righe preparate dal frontend

### Permessi
- [ ] Helper `require_carta_editor(user)` → admin/superadmin/sommelier
- [ ] Helper `require_carta_reader(user)` → tutti tranne viewer
- [ ] Applicare a ogni endpoint

### Registrazione
- [ ] Importare e `include_router(bevande_router)` in `main.py`
- [ ] Smoke test endpoint con curl locale (GET sezioni/ e POST voce)

---

## FASE 2 — Frontend editor

### Struttura e routing
- [ ] Creare cartella `frontend/src/pages/vini/components/` se non esiste
- [ ] Spostare `ViniCarta.jsx` → `CartaVini.jsx` (solo preview/export vini, zero cambi logici)
- [ ] Creare `CartaBevande.jsx` (hub 8 card, ex ViniCarta ora sostituita)
- [ ] Creare `CartaSezioneEditor.jsx` (editor generico parametrizzato)
- [ ] Creare `CartaAnteprima.jsx` (preview completa master)
- [ ] Route `App.jsx`: `/vini/carta` → hub, `/vini/carta/vini` → CartaVini, `/vini/carta/sezione/:key` → editor, `/vini/carta/anteprima` → preview
- [ ] Aggiornare `versions.jsx` con "Carta Bevande v1.0"

### Componenti condivisi
- [ ] `components/CartaCardModulo.jsx` — card hub (emoji + colore + contatori + ultimo agg.)
- [ ] `components/FormDinamico.jsx` — render form da schema_form (text/number/textarea/select + required)
- [ ] `components/ImportTestoModal.jsx` — textarea → preview → conferma (parser TAB/2+spazi)
- [ ] `components/SortableList.jsx` riuso se già esiste, altrimenti minimale con pointer events

### Hub `CartaBevande.jsx`
- [ ] Header con titolo "📜 Carta delle Bevande" + sottotitolo versione
- [ ] Bottone "← Menu Vini" + pulsanti globali (Anteprima, Esporta HTML/PDF/DOCX)
- [ ] Griglia card: Vini come hero (span 2), altre 7 quadrate
- [ ] Fetch `/bevande/sezioni/` + conteggi voci per ogni card
- [ ] Loader con `TrgbLoader`, stato empty se nessuna voce
- [ ] Click card vini → `/vini/carta/vini`
- [ ] Click card altra sezione → `/vini/carta/sezione/:key`

### Editor sezione `CartaSezioneEditor.jsx`
- [ ] Header: nome sezione + descrizione + pulsanti "+ Nuova voce", "Import da testo", "Anteprima sezione"
- [ ] Fetch schema_form + voci
- [ ] Tabella voci: drag handle + nome + meta riassunto + prezzo + toggle attivo + edita/duplica/elimina
- [ ] Drag&drop → `POST /bevande/voci/reorder`
- [ ] Modal form nuovo/edita con `FormDinamico` (campi da schema_form)
- [ ] Validazione required + errori inline
- [ ] Duplica: POST voce clone con nome "(copia)"
- [ ] Conferma elimina con modal
- [ ] Import testo: modale con textarea + bottone "Parsa" → tabella editabile + Conferma → `POST /bevande/voci/bulk-import`
- [ ] Anteprima sezione: apre `/bevande/sezioni/:key/preview` in tab nuovo
- [ ] Toast feedback azioni

### Preview completa `CartaAnteprima.jsx`
- [ ] Embed iframe `/bevande/carta` (master)
- [ ] Bottoni export (HTML, PDF, PDF-staff, DOCX)
- [ ] Bottone "Aggiorna anteprima" con reload iframe

### Stile
- [ ] Sfondo `bg-brand-cream` su tutte le pagine nuove
- [ ] Componenti M.I (`Btn`, `PageLayout`, `StatusBadge`, `EmptyState`) in uso
- [ ] Card con colori coerenti (amber, giallo, verde, rosso, slate, rosa, viola, …) allineati a `modulesMenu.js`
- [ ] Touch target 44pt verificato su iPad
- [ ] Modali full-screen su mobile <=640px

---

## FASE 3 — Export unificato

### Service `carta_bevande_service.py`
- [ ] Creare `app/services/carta_bevande_service.py`
- [ ] `build_copertina_html()` — titolo + logo + version carta
- [ ] `build_toc_html(sezioni_attive, vini_toc)` — indice master con rimando a TOC vini
- [ ] `build_section_html(sezione, voci, for_pdf, staff)` — dispatcher su `layout`
- [ ] `_render_tabella_4col(voci)` — Pattern A (distillati, amari_liquori)
- [ ] `_render_scheda_estesa(voci)` — Pattern B (birre, aperitivi, amari_casa)
- [ ] `_render_nome_badge_desc(voci)` — Pattern C (tisane, tè)
- [ ] `build_carta_bevande_html(include_vini, for_pdf, staff)` — orchestratore, riusa `carta_vini_service`
- [ ] `build_carta_bevande_docx()` — versione DOCX (riusa `build_carta_docx` pattern)
- [ ] `get_version_string()` — "v{YYYY}.{MM}.{seq}" da MAX(updated_at)

### CSS
- [ ] Estendere `app/static/css/carta_html.css` con `.bev-4col`, `.bev-scheda`, `.bev-badge`
- [ ] Estendere `app/static/css/carta_pdf.css` con stessi selettori
- [ ] Verificare watermark footer + numeri pagina + intestazione logo

### Endpoint export (in `bevande_router.py`)
- [ ] `GET /bevande/carta` — HTML preview master
- [ ] `GET /bevande/carta/pdf` — PDF cliente (WeasyPrint/chromium come fa vini)
- [ ] `GET /bevande/carta/pdf-staff` — include note_interne
- [ ] `GET /bevande/carta/docx` — DOCX
- [ ] `GET /bevande/sezioni/{key}/preview` — HTML singola sezione per editor

### Frontend punta al nuovo master
- [ ] `CartaAnteprima.jsx` iframe `/bevande/carta`
- [ ] Export buttons → `/bevande/carta/*`
- [ ] Link pubblico `https://trgb.tregobbi.it/carta-bevande` (da confermare decisione §10.2)
- [ ] `CartaVini.jsx` continua a puntare a `/vini/carta*` (immutata)

### Retro-compatibilità
- [ ] Test: `/vini/carta` risponde ancora con solo la carta vini (link vecchi)
- [ ] Test: `/vini/carta/pdf` genera PDF solo vini identico a oggi

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
