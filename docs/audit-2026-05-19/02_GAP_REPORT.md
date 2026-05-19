# Gap Report Codice ↔ Docs

> Periodo audit: 2026-05-19 · Commit di riferimento: vedi `05_EXECUTIVE_SUMMARY.md`
> Fonte: `01_AUDIT_PER_MODULO.md` (416 capability auditate su 14 moduli).
> Classificazione: ✅ allineato · ⚠️ parziale · ❌ obsoleto · 👻 fantasma · 🆕 non documentato.

## Metriche di salute documentazione

> Conteggio sulle 416 capability auditate. Le percentuali sono arrotondate.

| Stato | Numero | % |
|---|---|---|
| ✅ Allineato | ~302 | 73% |
| ⚠️ Parziale | ~74 | 18% |
| ❌ Obsoleto | 0 in modo dimostrabile | 0% |
| 👻 Fantasma | 0 in modo dimostrabile | 0% |
| 🆕 Non documentato (assente dai docs ma presente nel codice) | ~40 | 9% |

**Health score docs: 73/100**

> Il risultato è positivamente sorpreso: TRGB ha un assetto docs *molto sopra la media* per un codebase con questa estensione e velocità di evoluzione. La pratica osservata di un file `modulo_*.md` per modulo + `roadmap.md` + `sessione.md` continuamente aggiornati funziona. Le aree deboli sono concentrate.

**Note sulle percentuali:**
- "Obsoleto" e "Fantasma" sono **0** in senso forte: durante l'audit non ho identificato feature inesistenti citate nei docs né feature radicalmente cambiate rispetto a quanto documentato. Marco e Claude in passato hanno fatto deprecation marker (vedi `vini_db.py` deprecato, `*_legacy.jsx` archiviati, campi rimossi con commento di riferimento alla migrazione). Possibile che esistano refusi minori non rilevati nel passaggio audit (~budget tool call limitato).
- La maggior parte delle "parziali" sono *espansioni mancanti* (es. flusso non dettagliato, controlli mancanti) — non disallineamenti.
- Le "non documentate" si concentrano su 3 aree: integrazione **Fatture in Cloud**, sub-modulo **Selezioni del Giorno** (macellaio/salumi/formaggi/pescato/piatti), modulo **Task Manager + HACCP**.

---

## Gap critici (priorità alta — bloccano l'uso operativo)

| ID | Modulo | Capability/Area | Tipo gap | Azione richiesta |
|---|---|---|---|---|
| **CRIT-1** | acquisti | Integrazione **Fatture in Cloud** (12 endpoint live: status/connect/sync/warnings/sync-log/fornitori) | 🆕 non documentato | Creare `docs/modulo_fatture_in_cloud.md` (o sezione dedicata in `modulo_acquisti.md`). Include: token setup, flusso sync, gestione warnings, recovery refetch XML. |
| **CRIT-2** | ricette | **Selezioni del Giorno** (5 router quasi-gemelli: macellaio, salumi, formaggi, pescato, piatti_del_giorno) | 🆕 non documentato | Creare `docs/modulo_selezioni_giorno.md` o aggiungere capitolo a `modulo_ricette_foodcost.md`. **Distinguere chiaramente** da `docs/modulo_selezioni.md` (che parla di Vendite/Cassa). Vedi NOMEN-1. |
| **CRIT-3** | cassa | **Chiusure turno** + checklist + pre-conti + spese fine turno (~12 endpoint) | ⚠️ parziale | Estendere `docs/modulo_selezioni.md` con sezione completa o aprire `modulo_chiusure_turno.md`. |
| **CRIT-4** | task_manager | Intero modulo (20 capability tra checklist template + agenda + istanze + scheduler + task singoli + HACCP) | 🆕 non documentato (a livello modulo) | Creare `docs/modulo_task_manager.md` + `docs/modulo_haccp.md`. |
| **CRIT-5** | (semantico) | Confusione "Selezioni": (a) Selezioni del Giorno ricette, (b) Selezioni/Vendite cassa | naming conflict | Vedi NOMEN-1. |

## Gap medi (priorità media — funzionano ma docs incomplete)

| ID | Modulo | Capability/Area | Tipo | Azione |
|---|---|---|---|---|
| MED-1 | vini | Pagina pubblica cliente `/vini/carta-cliente/data` — chi la consuma in FE? | ⚠️ | Verificare in `frontend/src/pages/public/` e documentare in `modulo_vini.md` §5. |
| MED-2 | vini | `bulk-update` magazzino: elenco campi modificabili e vincoli ruolo | ⚠️ | Dettagliare in `modulo_vini.md` §3.1. |
| MED-3 | vini | Toolset migrazione matrice (`recalc-preview`, `import-old`, `recalc-all`) | ⚠️ | Storico, documentare come "utility one-shot" o archiviare. |
| MED-4 | ricette | Service Types: significato di "tipo servizio" associato a ricetta, flusso end-to-end | ⚠️ | Aggiungere sezione a `modulo_ricette_foodcost.md`. |
| MED-5 | ricette | Allergeni: tabella `allergeni`, servizio `app/services/allergeni_service.py`, endpoint ricalcolo | ⚠️ | Aggiungere sezione dedicata. |
| MED-6 | ricette | PDF ricetta — template, contenuto, audience | ⚠️ | Documentare endpoint `GET /foodcost/ricette/{id}/pdf`. |
| MED-7 | ricette | Storico foodcost ricetta (`/storico-fc`) — quando si aggiorna, cosa contiene | ⚠️ | Documentare. |
| MED-8 | ricette | Clone ricetta — comportamento (deep-copy? sub-recipe?) | ⚠️ | Documentare. |
| MED-9 | controllo_gestione | Cambia-canale, paga-carta, iban, modalita-pagamento (4 endpoint operativi) | ⚠️ | Aggiungere sezione "Operazioni rapide sull'uscita" a `modulo_controllo_gestione.md`. |
| MED-10 | controllo_gestione | Adeguamento spese fisse — flusso, storico, impatto su stagionalità | ⚠️ | Documentare. |
| MED-11 | dipendenti | Documenti dipendente (upload allegati): tipi file, naming, retention | ⚠️ | Estendere `modulo_dipendenti.md`. |
| MED-12 | dipendenti | `rematch-consuntivo` e `auto-create-mancanti` buste paga | ⚠️ | Documentare scenari uso. |
| MED-13 | dipendenti | Coesistenza `/dipendenti/turni/calendario/*` (vecchio) e `/turni/foglio/*` (v2) | ⚠️ + possibile feature morta | Verificare se vecchio è ancora usato dal FE; se no, marcare deprecated. |
| MED-14 | clienti | Mailchimp sync — config token, campi sincronizzati, mapping segmenti | ⚠️ | Documentare. |
| MED-15 | clienti | Pulizia massiva (telefoni-placeholder, normalizza-testi) — criteri | ⚠️ | Documentare. |
| MED-16 | clienti | Segmenti per email marketing — definizione, conteggi | ⚠️ | Documentare. |
| MED-17 | cassa | Spese baseline (per categoria) — uso e calcolo cash flow | ⚠️ | Documentare. |
| MED-18 | cassa | Cash expenses + expense categories (uscite cassa contanti) — CRUD e categorizzazione | ⚠️ | Estendere docs. |
| MED-19 | platform | Auth/Users — cambio password, ruoli, associazione dipendente | ⚠️ | Aprire `docs/platform_auth_utenti.md` o estendere `controllo_design.md`. |
| MED-20 | platform | Dashboard cucina endpoint (`/dashboard/cucina`) | ⚠️ | Verificare uso in `frontend/src/pages/Home.jsx` e documentare. |

## Gap minori (priorità bassa — operativi/admin rari)

| ID | Modulo | Capability/Area | Tipo | Azione |
|---|---|---|---|---|
| MIN-1 | vini | `reset-database` cantina (conferme richieste, ruolo) | ⚠️ | Una riga in modulo_vini.md §8 con warning |
| MIN-2 | vini | `cleanup-duplicates` criteri match | ⚠️ | Idem |
| MIN-3 | vini | `locazioni-normalizza` esempi uso | ⚠️ | Idem |
| MIN-4 | vini | Backup vini tool-side (`/backup/create|list|restore|delete`) vs platform backup | ⚠️ | Chiarire delta in modulo_vini.md o consolidare con platform backup |
| MIN-5 | acquisti | Recovery: import manuale by file | ⚠️ | Documentare procedura recovery |
| MIN-6 | acquisti | Export Excel fatture — filtri disponibili | ⚠️ | Idem |
| MIN-7 | acquisti | Proforme: flusso completo (creazione → riconcilia → dissocia → candidates) | ⚠️ | Estendere modulo_acquisti.md §proforme |
| MIN-8 | dipendenti | Buste paga test-pdf + anteprima-pdf (utility) | 🆕 | Riga in modulo_dipendenti.md "Utility admin" |
| MIN-9 | menu_carta | Endpoint `GET /menu/` (router minimale) | ⚠️ | Verificare scopo; o documentare o consolidare |
| MIN-10 | menu_carta | Smoke + health pranzo (`public_router`) | ⚠️ | Documentare come endpoint diagnostica |

## Anomalie strutturali (non solo docs)

| ID | Area | Descrizione | Azione |
|---|---|---|---|
| **NOMEN-1** | naming | **"Selezioni"** è usato per 2 cose semanticamente diverse:<br>(a) sub-modulo `ricette` = "Selezioni del Giorno" (macellaio, salumi, formaggi, pescato, piatti) — UI `/selezioni`<br>(b) modulo `cassa` = "Selezioni / Vendite" (corrispettivi, chiusure turno) — UI `/vendite`, doc `docs/modulo_selezioni.md`. | Decidere terminologia univoca in manuale. Suggerimento: chiamare (a) "Selezioni del Giorno" e (b) "Vendite" senza alias "Selezioni". Rinominare `docs/modulo_selezioni.md` → `docs/modulo_vendite.md`. |
| **MIGR-1** | migrazioni SQLite | Numerazione duplicata: 129/130/131/133 (vedi `00_INVENTARIO.md` §"Statistiche") | Per il futuro: dopo merge di branch concorrenti, ri-numerare. Storiche restano come sono (eseguite per nome file). |
| **MORT-1** | vini | File `*_legacy.jsx` (9 file) e `app/models/vini_db.py`, `vini_model.py` (stub) | Cleanup task V-H.I già pendente in roadmap. |
| **MORT-2** | dipendenti | Convivenza `/dipendenti/turni/calendario/*` (vecchio) e `/turni/foglio/*` (v2) | Verificare se vecchio è effettivamente non più chiamato dal FE; se sì, marcare deprecated nel router. |
| **MAT-1** | mattoni | M.D (email), M.G (permessi advanced), M.H (import engine) sono DA FARE per `architettura_mattoni.md` | Aggiornare quando implementati (no azione audit-side). |

## Feature fantasma da rimuovere dai docs

Nessuna identificata con certezza. La pratica osservata di marcare le rimozioni con commento + riferimento alla migrazione (es. `<!-- DISCONTINUATO rimosso 2026-05-12 (V-H.E, mig 124) -->` in modulo_vini.md riga 307-309) ha già pulito molte zone.

## Decisioni che richiedono input del PO (Marco)

1. **NOMEN-1 — Naming "Selezioni":** mantenere alias semantico o disambiguare? L'audit consiglia *disambiguare*: "Selezioni del Giorno" (ricette) vs "Vendite/Cassa" (cassa). Senza ack, il manuale userà la disambiguazione.
2. **Vini Cantina v2:** il cleanup file `*_legacy.jsx` (task V-H.I) — quando farlo? Audit segna pendente; non è urgente perché file non importati. Suggerimento: 4 settimane post-cutover stabile.
3. **Endpoint `/menu/`** (router minimale di 1 endpoint): tenere, consolidare o rimuovere? Audit non identifica chi lo chiama in FE.
4. **Convivenza turni vecchio + v2** (MORT-2): mantenere fallback o switch atomico a v2?
5. **Mattone email (M.D):** prioritizzare per qualche workflow specifico (es. conferme prenotazione, scadenze documenti)?
