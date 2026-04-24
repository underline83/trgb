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
| 1 | Pulsante "📦 Ordina" inline accanto a ogni vino (modale `openOrdine` già esistente) | ✅ Approvato — da fare |
| 2 | Quantità suggerita basata sullo storico vendite 30/60/90 gg | ✅ Approvato — da fare |
| 3 | Raggruppamento per distributore (toggle opzionale) | ✅ Approvato — da fare |
| 4 | Stato riordino a 3 click (badge `D · O · 0 · X` inline) | ✅ Approvato — da fare |
| 5 | "Ultima vendita" / giorni fermo | ✅ Approvato — da fare |
| 6 | Filtro rapido per tipologia (bianchi / rossi / bolle / ...) | ✅ Approvato — da fare |
| 7 | Export "lista della spesa" su WhatsApp/PDF raggruppata per fornitore | 🔄 Teorizzato — differito |
| 8 | Bottone "✅ Arrivato" diretto nel widget (`conferma-arrivo` già in API) | ⏳ Da confermare con Marco |

---

## 2. Fasi implementative (push indipendenti)

Stesso principio di `modulo_vini_riordini.md`: ogni fase auto-contenuta, un push per fase. Mai accoppiare cambiamenti infrastrutturali (vedi memoria `feedback_no_blocchi_accoppiati.md`).

### Fase A — Punti 1 + 2 (Ordina inline + quantità suggerita)
- **Scope FE:** aggiungere in ogni riga del widget una cella a destra con:
  - se nessun ordine pending → pulsante outline `+ Ordina` (stesso stile della cella Riordino in `📦 Riordini per fornitore`).
  - se ordine pending → pill blu `📦 N bt` cliccabile (modifica).
- **Riuso:** handler `openOrdine(v)` e modale esistenti. Nessun nuovo endpoint.
- **Quantità suggerita (punto 2):**
  - BE: estendere `get_dashboard_stats` (campo `alert_carta_senza_giacenza`) con `qta_suggerita` calcolata come: round(vendite ultimi 60 giorni ÷ 2) con floor a 1. Se zero vendite 60gg → `null`.
  - FE: nel modale ordine, se `ordineQta` è vuoto e `qta_suggerita` non null → precompila input + piccola etichetta "💡 Suggerito da storico 60gg".
- **Test manuali:** vino con storico vendite denso → suggerita > 0; vino fermo → suggerita null.
- **Push FE + BE** insieme (qta_suggerita richiede BE, ma è additiva — retrocompatibile).

### Fase B — Punto 5 (Ultima vendita / giorni fermo)
- **BE:** `get_dashboard_stats` → aggiungere `ultima_vendita` (ISO date) al payload di `alert_carta_senza_giacenza`. Il campo esiste già in `riordini_per_fornitore`, estendere anche qui con stessa query.
- **FE:** nella riga del widget, sotto il nome vino aggiungere `Ult. vendita: 14gg fa` (o `— mai venduto` se null). Colore rosso se > 90gg (candidato cadavere).
- **Push FE + BE**.

### Fase C — Punto 4 (Badge stato riordino a 3 click)
- **FE only:** sostituire il solo toggle "Non ricomprare" con quartetto di pill `D · O · 0 · X` usando `STATO_RIORDINO` da `viniConstants.js`. Click su pill → PATCH `STATO_RIORDINO` (endpoint esistente). Stato corrente evidenziato con border pieno, altri outline.
- **Touch target:** ogni pill ≥ 32px quadrato (raccolte in row di 4 = 128+ px totale, vedi regola 44pt per gruppo).
- **Push FE-only.**

### Fase D — Punto 6 (Filtro rapido tipologia)
- **FE only:** sopra la lista aggiungere riga di chip `Tutti · Bianchi · Rossi · Bolle · Rosati · Altri` tipo tab (filtra client-side il `urgenti` array per `TIPOLOGIA`). Attivo = brand-blue fill, inattivi = outline. Stato in `useState`, niente persistenza.
- **Push FE-only.**

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
