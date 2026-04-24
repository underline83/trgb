# Modulo Vini — Potenziamento widget "Vini in carta senza giacenza"

**Obiettivo:** trasformare il widget alert `🚨 Vini in carta senza giacenza` (banner collassabile in testa a `DashboardVini`) da semplice segnalatore a mini-centro operativo per riordinare direttamente, senza dover scorrere fino alla sezione `📦 Riordini per fornitore`.

**Distinzione rispetto a `modulo_vini_riordini.md`:**
- `📦 Riordini per fornitore` = tabella completa, raggruppata per distributore, vista "gestionale".
- `🚨 Vini in carta senza giacenza` = alert compatto, solo vini con giacenza 0 e stato vendita attivo (V/F/S/T), vista "sveglia operativa".

Questo doc copre solo il secondo widget.

**Riferimenti codice:**
- FE widget: `frontend/src/pages/vini/DashboardVini.jsx` (sezione `ALERT — COMPATTATO`, righe 724–834)
- FE modale ordine: stesso file, sezione `MODALE — Riordino / Ordine pending (Fase 4)` — già esistente e riusabile
- BE stats: `app/models/vini_magazzino_db.py::get_dashboard_stats` — campo `alert_carta_senza_giacenza`
- Costanti stati: `frontend/src/config/viniConstants.js`
- Mattone WA composer: `frontend/src/utils/whatsapp.js` + `app/utils/whatsapp.py` (per punto 7 futuro)

---

## 1. Richieste Marco (sessione 2026-04-24) — stato

| # | Richiesta | Stato |
|---|-----------|-------|
| 1 | Pulsante "📦 Ordina" inline accanto a ogni vino (modale `openOrdine` già esistente) | ✅ **FATTO** (Fase A — 2026-04-24) |
| 2 | Quantità suggerita basata sullo storico vendite 30/60/90 gg | ✅ **FATTO** (Fase A — 60gg ÷ 2) |
| 3 | Raggruppamento per distributore (toggle opzionale) | ⏳ Fase E — da fare |
| 4 | Stato riordino a 3 click (badge `D · O · 0 · A · X` inline) | ✅ **FATTO** (Fase C — 2026-04-24) |
| 5 | "Ultima vendita" / giorni fermo | ✅ **FATTO** (Fase B — 2026-04-24) |
| 6 | Filtro rapido per tipologia (bianchi / rossi / bolle / ...) | ✅ **FATTO** (Fase D — 2026-04-24) |
| 7 | Export "lista della spesa" su WhatsApp/PDF raggruppata per fornitore | 🔄 Teorizzato — differito |
| 8 | Bottone "✅ Arrivato" diretto nel widget (`conferma-arrivo` già in API) | ⏳ Da confermare con Marco |

---

## 2. Fasi implementative (push indipendenti)

Stesso principio di `modulo_vini_riordini.md`: ogni fase auto-contenuta, un push per fase. Mai accoppiare cambiamenti infrastrutturali (vedi memoria `feedback_no_blocchi_accoppiati.md`).

### Fase A — Punti 1 + 2 (Ordina inline + quantità suggerita) — ✅ FATTO 2026-04-24
- **Scope FE:** aggiunto in ogni riga del widget alert un pill inline:
  - se nessun ordine pending → `+ ordina` outline brand-blue (con `· N` appeso se c'è suggerimento, per far vedere il numero prima di cliccare).
  - se ordine pending → pill blu `📦 N bt` cliccabile (modifica).
- **Righe dimmed (Non ricomprare):** il pill è nascosto, per ridurre rumore visivo.
- **Riuso:** handler `openOrdine(v)` e modale esistenti. Nessun nuovo endpoint.
- **Quantità suggerita (punto 2):**
  - BE (`vini_magazzino_db.py::get_dashboard_stats`): query `alert_carta` estesa con subquery `vendite_60gg` + post-processing Python che calcola `qta_suggerita = max(1, round(vendite_60gg / 2))` se > 0, altrimenti `null`. Sempre aggiunti `DISTRIBUTORE` e `RAPPRESENTANTE` al payload (serviranno per Fase E).
  - FE (`DashboardVini.jsx::openOrdine`): priorità input qta: ordine esistente → `qta_suggerita` → stringa vuota. Hint "💡 Suggerito: N bt · storico vendite 60gg ÷ 2" sotto l'input, visibile solo quando non c'è un ordine pending e suggerimento > 0.
- **Test manuali:**
  - Vino con storico vendite denso → `+ ordina · 4` in riga, modale apre con 4 precompilato + hint.
  - Vino fermo → `+ ordina` senza numero, modale apre con campo vuoto, nessun hint.
  - Ordine pending esistente → pill blu `📦 6 bt`, modale apre con 6 precompilato, nessun hint (c'è già l'ordine).
- **Commit:** FE+BE insieme (qta_suggerita richiede BE ma è additiva — retrocompatibile con client vecchi).
- **File toccati:** `app/models/vini_magazzino_db.py`, `frontend/src/pages/vini/DashboardVini.jsx` (bump v4.7-alert-widget-faseA).

### Fase B — Punto 5 (Ultima vendita / giorni fermo) — ✅ FATTO 2026-04-24

**Iter 1 (deprecata, vedi iter 2):** badge "Ult. vendita: Ngg fa" con gradazione rosso/amber/verde sul tempo. Fuorviante: su un vino finito l'ultima vendita e' sempre subito prima del sold-out → dato ridondante/ingannevole.

**Iter 2 (attiva):** ripensamento completo dopo feedback Marco. Il dato che serve e' il **ritmo di vendita storico** (misura di domanda), non il tempo dall'ultima vendita (misura di quando e' finito). Combinati in un badge unico.

Implementato:
- **Nuovo modulo `app/utils/vini_metrics.py`** — funzione riutilizzabile `calcola_ritmo_vendita(vendite_totali, oggi=None, data_inizio="2026-03-01")`. Ritorna dict con `bt_mese`, `categoria` (`top`/`medio`/`poco`/`mai`), `label` human-friendly, `color_tone` per UI. Data inizio storico = 1 marzo 2026 (entrata in produzione del sistema). Soglie:
  - `top`: ≥ 5 bt/mese → emerald
  - `medio`: 1–5 bt/mese → amber
  - `poco`: < 1 bt/mese → neutral
  - `mai`: 0 vendite totali → neutral-dark
  - Helper secondario `giorni_dalla_ultima_vendita()`.
- **BE `vini_magazzino_db.py::get_dashboard_stats`:** query `alert_carta` estesa con `vendite_totali` (da 2026-03-01) + `ultima_vendita` (MAX data_mov VENDITA). Post-processing Python aggiunge `ritmo_vendita: dict` a ogni riga usando il nuovo helper.
- **FE `DashboardVini.jsx` (v4.9-alert-widget-faseB2):** layout VinoRow ripensato:
  - Riga 1 identita': #ID + nome + annata + produttore + tipologia piccola inline
  - Riga 2 metriche azionabili: badge combo `🛒 Top seller 6.1 bt/mese · Finito ~14gg fa` (classificato sul ritmo, finito appeso in secondaria con opacity 75%, omesso se "Mai venduto"). Badge `STATO_RIORDINO` e `STATO_CONSERVAZIONE` solo se valorizzati.
  - Tolti: badge `STATO_VENDITA` (ridondante — condizione dell'alert e' V/F/S/T per definizione), `0 bt` (condizione dell'alert), tipologia ripetuta a destra.
- **Riutilizzabilita':** `app.utils.vini_metrics` e' agnostico dal modulo. Quando si aggiornera' SchedaVino (tab "Statistiche" o "Panoramica") bastera' importare `calcola_ritmo_vendita` e passargli il totale vendite del vino.
- **Test BE (simulazione):**
  - 30 vendite / 54gg storico → `Top seller · 16.7 bt/mese` (emerald)
  - 8 vendite → `Vende · 4.4 bt/mese` (amber)
  - 1 vendita → `Poco venduto · 0.56 bt/mese` (neutral)
  - 0 vendite → `Mai venduto` (neutral-dark)
- **File toccati:** `app/utils/vini_metrics.py` (nuovo), `app/models/vini_magazzino_db.py`, `frontend/src/pages/vini/DashboardVini.jsx`.

### Fase C — Punto 4 (Badge stato riordino a 3 click) — ✅ FATTO 2026-04-24

**Iter 1 (deprecata):** pill quadrate 32x32 con singola lettera `D · O · 0 · A · X`. Fuorviante — se non conosci la legenda interna non capisci cosa stai cliccando.

**Iter 2 (attiva, 2026-04-24):** pill ellittiche con **emoji + label breve**:
- 📝 Da ordinare
- 🚨 Finito — ordina
- 📦 Ordinato
- 🗓️ Annata esaurita
- ⛔ Non ricomprare

Spostate in **Riga 3 dedicata** (prima erano in Riga 2 stipate con il badge ritmo, poco respiro). Label "Stato riordino:" in minuscolo accanto. Pill attiva = bg saturo colore STATO_RIORDINO + border-2 + font-semibold + icona ✓ appena visibile. Pill inattive = bianco outline neutro + hover leggero. Rimosso il label testuale ridondante "Stato riordino: X" che c'era sotto nella iter 1 (ora non serve, le pill si spiegano da sole).

- **FE-only.**
- **Interazione:**
  - Click su pill inattiva → PATCH `/vini/magazzino/{id}` con `STATO_RIORDINO: code`
  - Click su pill attiva → PATCH con `STATO_RIORDINO: null` (clear)
  - Vino con `X` salta automaticamente nella sezione "Non da ricomprare" (opacity 50%, line-through nome) al prossimo render — comportamento atteso.
- **Stile pill:**
  - Attiva: colore saturo completo (`STATO_RIORDINO[code].color`) + `border-2` + `ring-1` + `font-bold`
  - Inattiva: bg bianco + border sottile neutral + hover leggero
  - Touch target: `w-8 h-8` (32x32px) ciascuna. 5 pill + gap + label → gruppo ≥ 44pt in larghezza totale.
  - Label testuale sotto ("Stato riordino: Da ordinare") visibile solo quando uno stato e' settato — aiuta chi non ricorda la legenda D/O/0/A/X a colpo d'occhio.
- **Refactor:** `toggleNonRicomprare()` → `setStatoRiordino(vino, nuovoStato)` generalizzato. Gestisce toggle auto (se click == corrente → clear).
- **File toccati:** `frontend/src/pages/vini/DashboardVini.jsx` (v4.10-alert-widget-faseC).
- **Rimossi:** vecchio bottone "◦ Non ricomprare" sulla colonna destra (sostituito dalla pill X), badge passivo `STATO_RIORDINO` nella riga metriche (ridondante col picker).

### Fase D — Punto 6 (Filtro rapido tipologia) — ✅ FATTO 2026-04-24

- **FE-only.** Riga chip appena sotto il banner, sopra la lista urgenti.
- **6 chip:** `Tutti · Rossi · Bianchi · Bollicine · Rosati · Altri`. "Altri" e' catch-all per `GRANDI FORMATI`, `PASSITI E VINI DA MEDITAZIONE`, `VINI ANALCOLICI`, `ERRORE`, null.
- **Stile:**
  - Chip attiva: `bg-brand-blue text-white border-brand-blue`
  - Chip inattiva: bianco + border neutral + hover leggero + dot colorato (rosso/giallo/sky/pink/neutral per tipologia)
  - Touch target `min-h-[28px]` (in row di chip, gruppo >44pt in altezza)
  - Chip con 0 vini nascoste automaticamente (declutter) — eccetto quella attiva che resta visibile per poter cliccarla e tornare a "Tutti".
- **Conteggi:** ogni chip mostra `(N)` calcolato su `urgenti` completo (non sul filtrato), cosi' i numeri non saltano cambiando filtro.
- **Persistenza:** nessuna (`useState`). Reset al refresh, come da spec.
- **Sezione "Non da ricomprare":** NON filtrata dal chip — resta sempre visibile in fondo con tutti i suoi vini. Motivo: ha significato di "archivio" scorrelato dalla tipologia. Se Marco vuole filtrarla, flipare `nonRicomprare.map(...)` a `nonRicomprare.filter(matchesFiltro).map(...)` in futuro.
- **Empty state:** se il filtro non produce risultati, messaggio "Nessun vino in questa categoria" + link "Mostra tutti" che resetta il filtro.
- **File toccati:** `frontend/src/pages/vini/DashboardVini.jsx` (v4.11-alert-widget-faseD). Nuovo state `tipoFiltro`, helper `CATEGORIE` + `matchesFiltro()` inline, chip row sopra `urgentiFiltrati`.

### Fase E — Punto 3 (Raggruppamento per distributore)
- **FE only:** toggle "Raggruppa per distributore" sotto il banner. Quando attivo: applicare lo stesso pattern `<details>`/`<summary>` di `📦 Riordini per fornitore` alle righe del widget alert. `grouped[key] = { distributore, rappresentante, vini: [] }`.
- Salva preferenza in `localStorage` (`vini_alert_raggruppa`).
- **Push FE-only.**

### Fase F — Punto 8 (opzionale — conferma da Marco)
- **FE:** colonna dedicata "✅ Arrivato" visibile solo se ordine pending, che apre il modale `conferma-arrivo` (endpoint `POST /vini/magazzino/{id}/ordine-pending/conferma-arrivo` già implementato in fase 5 del doc riordini).
- Senza di questo, il flusso `arrivo merce` resta nella tabella `📦 Riordini per fornitore` (ok come oggi).

---

## 3. Teorizzazione punto 7 — Export WhatsApp "lista della spesa"

**Obiettivo (futuro):** click su "📋 Genera lista" → ordini pending raggruppati per distributore → WhatsApp aperto sul referente giusto con messaggio precompilato.

**Perché differito:** richiede:
1. Campo `TELEFONO` (o `WA_REFERENTE`) anagrafico affidabile sul distributore/rappresentante. Oggi non strutturato.
2. Template messaggio configurabile (non hardcoded — vedi memoria `feedback_no_hardcoded_config.md`). Servirebbe nuova tabella `vini_wa_templates` o estensione di Impostazioni Vini.
3. Mattone M.C WA composer è già pronto (`buildWaLink` + `fillTemplate`), ma il consumatore va progettato bene: cliente (template messaggio singolo) vs. fornitore (template ordine) sono cose diverse.

**Ipotesi di design (non implementata):**
- Nel widget `🚨 Vini in carta senza giacenza`, quando è attivo il raggruppamento per distributore (Fase E sopra), ogni gruppo mostra un pulsante `💬 Invia lista` accanto al conteggio.
- Click apre un mini-dialog:
  - Lista spuntabile (default: tutti i vini del gruppo con ordine pending, qta già valorizzata).
  - Textarea con messaggio precompilato dal template, modificabile.
  - Pulsante "Apri WhatsApp" → `openWhatsApp(telefono_distributore, messaggio)`.
- **Alternativa offline:** pulsante "📄 PDF lista" che scarica una lista stampabile raggruppata (dipende da mattone M.B PDF brand — non ancora in piedi).

**Dipendenze che sbloccano punto 7:**
- Anagrafica distributori con campo telefono obbligatorio (side-quest: `fornitori` table?).
- Configurazione template in Impostazioni Vini (nuova sezione "WhatsApp ordini").
- Mattone M.B PDF per variante stampabile (se serve).

**Suggerimento:** aprire punto 7 come voce separata in `docs/roadmap.md` § 7 Cantina / Vini quando una delle dipendenze sopra è pronta (probabilmente in coda a Modulo Fornitori o a M.D Email service). Oggi (2026-04-24) nessuna delle 3 è pronta → si rimanda.

---

## 4. Aspetti trasversali

- **Mattoni TRGB:** nessun mattone nuovo serve. Tutte le fasi A–F usano primitives M.I (Btn, StatusBadge), toast, modale ordine già implementato.
- **Mobile/iPad:** il widget vive su Dashboard Vini, che oggi è consultata principalmente da desktop/iPad in portrait. Pill badge (Fase C) e chip filtro (Fase D) devono rispettare touch target 44pt minimo → raggruppa in row con gap 4–6 px.
- **Permessi:** tutte le nuove azioni richiedono ruoli che possono già modificare il magazzino vini (admin, superadmin, sommelier). Verificare il pattern `Depends(get_current_user)` sui router estesi.
- **Performance:** i campi aggiunti (`qta_suggerita`, `ultima_vendita`) vanno calcolati nella stessa query di `alert_carta_senza_giacenza`. Nessuna chiamata extra al FE. Indici consigliati: `vini_magazzino_movimenti(vino_id, tipo, data_mov)` se non già presente.

---

## 5. Ordine di implementazione consigliato

1. **Fase A** (Ordina inline + qta suggerita) — impatto massimo, costo medio. Apre la strada alle altre.
2. **Fase B** (Ultima vendita) — dato cheap, aiuta a decidere.
3. **Fase C** (Badge stato) — pure UI refactor, nessun rischio.
4. **Fase D** (Filtro tipologia) — quick win puro FE.
5. **Fase E** (Raggruppamento distributore) — più invasivo sul layout; farlo dopo aver stabilizzato le precedenti.
6. **Fase F** (Arrivato inline) — solo se Marco la vuole qui invece che solo in "📦 Riordini per fornitore".

---

**Autore:** sessione 2026-04-24 — Claude + Marco
**Ultimo aggiornamento:** 2026-04-24
