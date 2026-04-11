# B.2 — Migrazione `title=` → `<Tooltip>` — Prompt pronti per Claude Code

**Contesto:** sessione 27 del 2026-04-11. Nel commit `B.2 componente Tooltip` abbiamo creato `frontend/src/components/Tooltip.jsx` e migrato i 2 `title=` di `Header.jsx`. Restano ~66 occorrenze nei moduli, da migrare in blocchi isolati. Workflow: Cowork ha preparato questi prompt, Marco li passa a Code uno alla volta, un commit isolato per blocco, test tra un blocco e l'altro.

**Riferimento componente Tooltip:** `frontend/src/components/Tooltip.jsx`. Esempio d'uso in `frontend/src/components/Header.jsx` v4.4 (riga ~342 pallino Modalità gestione, riga ~354 bottone 🔑 Cambia PIN).

**Regole globali di migrazione (valgono per TUTTI i prompt):**
- **NON** toccare `<SectionHeader title="...">`, `<Section title="...">`, `<WizardPanel title="...">`, `<iframe title="...">`. Queste sono props di componenti React custom o attributi di accessibilità, NON tooltip nativi.
- **NON** toccare `<th title="...">` — wrappare un `<th>` in `<Tooltip>` rompe la struttura tabella HTML. Il tooltip va messo sul CONTENUTO del `<th>`, non sul `<th>` stesso.
- **NON** toccare `<input title="...">`, `<label title="...">` — wrapping complicato, priorità bassa. Lasciare per ora.
- **Target validi:** `<button title=...>`, `<span title=...>`, `<div title=...>`, `<a title=...>`.
- **Pattern di sostituzione:**
  ```jsx
  // PRIMA
  <button onClick={...} className="..." title="Elimina">🗑</button>

  // DOPO
  <Tooltip label="Elimina">
    <button onClick={...} className="...">🗑</button>
  </Tooltip>
  ```
- L'attributo `title="..."` va RIMOSSO dal child dopo il wrapping.
- L'import di Tooltip va aggiunto in cima al file: `import Tooltip from "../../components/Tooltip";` (adattare il path relativo a seconda della profondità del file).
- **NON** cambiare logica, onClick, className, altri attributi del child. Solo wrappare e spostare il testo di `title=` in `label=` del Tooltip.
- **NON** fare `git commit`, **NON** fare `git push`, **NON** fare `git add -A`. Il commit lo fa Marco via `push.sh`.

---

## Prompt 1 — Blocco Controllo Gestione (~12 occorrenze)

```
TASK: Migrare i title= nativi a <Tooltip> nei 3 file del modulo Controllo Gestione.

FILE DA MODIFICARE:
- frontend/src/pages/controllo-gestione/ControlloGestioneUscite.jsx
- frontend/src/pages/controllo-gestione/ControlloGestioneSpeseFisse.jsx
- frontend/src/pages/controllo-gestione/ControlloGestioneRiconciliazione.jsx

REGOLE:
1. Importa Tooltip in ogni file: import Tooltip from "../../components/Tooltip";
2. NON toccare <WizardPanel title="...">, <th title="...">, <input title="...">, <label title="...">. Sono falsi positivi.
3. Target validi: <button title=...>, <span title=...>, <div title=...>.
4. Pattern: <Tooltip label="..."><button ...>...</button></Tooltip>. Rimuovi title="..." dal child.
5. NON cambiare logica, onClick, className.
6. NON fare git commit, NON fare git push.

STEP:
1. In ogni file, fai grep per title=" e individua le occorrenze valide (escludi WizardPanel/th/input/label). Applica il pattern di wrapping. Aggiungi l'import in cima se non c'è.
2. Verifica con grep finale che nei 3 file restino solo title= su WizardPanel, th, input, label. Conta le migrazioni fatte per modulo.

Quando hai finito stampa il comando pronto da copiare per il push: ./push.sh "B.2 tooltip CG: migrato title= a <Tooltip> in Uscite/SpeseFisse/Riconciliazione"
```

---

## Prompt 2 — Blocco Acquisti/Fatture (~10 occorrenze)

```
TASK: Migrare i title= nativi a <Tooltip> nei 6 file del modulo Acquisti/Fatture.

FILE DA MODIFICARE:
- frontend/src/pages/admin/FattureInCloud.jsx
- frontend/src/pages/admin/FattureDettaglio.jsx
- frontend/src/pages/admin/FattureImpostazioni.jsx
- frontend/src/pages/admin/FattureCategorie.jsx
- frontend/src/pages/admin/FattureDashboard.jsx
- frontend/src/pages/admin/FattureFornitoriElenco.jsx

REGOLE:
1. Importa Tooltip in ogni file: import Tooltip from "../../components/Tooltip";
2. NON toccare <SectionHeader title="...">, <label title="...">. Sono falsi positivi.
3. Target validi: <button title=...>, <span title=...>, <div title=...>.
4. Pattern: <Tooltip label="..."><button ...>...</button></Tooltip>. Rimuovi title="..." dal child.
5. NON cambiare logica, onClick, className.
6. NON fare git commit, NON fare git push.

STEP:
1. In ogni file, grep title=" e applica il pattern. Escludi SectionHeader e label. Aggiungi l'import se manca.
2. Verifica con grep che restino solo title= su SectionHeader/label/input. Conta le migrazioni per file.

Quando hai finito stampa il comando pronto da copiare per il push: ./push.sh "B.2 tooltip Acquisti: migrato title= a <Tooltip> in Fatture* (6 file)"
```

---

## Prompt 3 — Blocco Cantina/Vini (~12 occorrenze)

```
TASK: Migrare i title= nativi a <Tooltip> nei 7 file del modulo Cantina/Vini.

FILE DA MODIFICARE:
- frontend/src/pages/vini/MagazzinoVini.jsx
- frontend/src/pages/vini/SchedaVino.jsx
- frontend/src/pages/vini/ViniImpostazioni.jsx
- frontend/src/pages/vini/MovimentiCantina.jsx
- frontend/src/pages/vini/ViniVendite.jsx
- frontend/src/pages/vini/MatricePicker.jsx
- frontend/src/pages/vini/MagazzinoAdmin.jsx

REGOLE:
1. Importa Tooltip in ogni file: import Tooltip from "../../components/Tooltip";
2. NON toccare <SectionHeader title="...">, <iframe title="...">, <th title="...">, <input title="...">. Sono falsi positivi.
3. Target validi: <button title=...>, <span title=...>, <div title=...>.
4. Pattern: <Tooltip label="..."><span className="...">C</span></Tooltip>. Rimuovi title="..." dal child.
5. NON cambiare logica, onClick, className.
6. NON fare git commit, NON fare git push.

STEP:
1. In ogni file, grep title=" e applica il pattern. Escludi SectionHeader, iframe, th, input. Aggiungi l'import se manca.
2. Verifica con grep finale. Conta le migrazioni per file.

Quando hai finito stampa il comando pronto da copiare per il push: ./push.sh "B.2 tooltip Cantina: migrato title= a <Tooltip> in Magazzino/Scheda/Impostazioni/Movimenti/Vendite/Matrice/Admin"
```

---

## Prompt 4 — Blocco Dipendenti (~9 occorrenze)

```
TASK: Migrare i title= nativi a <Tooltip> nei 4 file del modulo Dipendenti.

FILE DA MODIFICARE:
- frontend/src/pages/dipendenti/DipendentiBustePaga.jsx
- frontend/src/pages/dipendenti/DipendentiTurni.jsx
- frontend/src/pages/admin/DipendentiTurni.jsx
- frontend/src/pages/admin/ChiusureTurnoLista.jsx

REGOLE:
1. Importa Tooltip in ogni file: import Tooltip from "../../components/Tooltip";
2. NON toccare <label title="...">. Falso positivo.
3. Target validi: <button title=...>, <span title=...>, <div title=...>.
4. Pattern: <Tooltip label="..."><button ...>...</button></Tooltip>. Rimuovi title="..." dal child.
5. NON cambiare logica, onClick, className.
6. NON fare git commit, NON fare git push.

STEP:
1. In ogni file, grep title=" e applica il pattern. Aggiungi l'import se manca.
2. Verifica con grep finale. Conta le migrazioni per file.

Quando hai finito stampa il comando pronto da copiare per il push: ./push.sh "B.2 tooltip Dipendenti: migrato title= a <Tooltip> in BustePaga/Turni x2/ChiusureTurno"
```

---

## Prompt 5 — Blocco Clienti + Gestione Contanti (~10 occorrenze)

```
TASK: Migrare i title= nativi a <Tooltip> nei 5 file Clienti + GestioneContanti.

FILE DA MODIFICARE:
- frontend/src/pages/clienti/ClientiLista.jsx
- frontend/src/pages/clienti/ClientiScheda.jsx
- frontend/src/pages/clienti/ClientiImport.jsx
- frontend/src/pages/clienti/ClientiDuplicati.jsx
- frontend/src/pages/admin/GestioneContanti.jsx

REGOLE:
1. Importa Tooltip in ogni file: import Tooltip from "../../components/Tooltip";
2. NON toccare <input title="...">, <label title="...">. Falsi positivi.
3. Target validi: <button title=...>, <span title=...>, <div title=...>.
4. Pattern: <Tooltip label="..."><button ...>...</button></Tooltip>. Rimuovi title="..." dal child.
5. NON cambiare logica, onClick, className.
6. NON fare git commit, NON fare git push.

STEP:
1. In ogni file, grep title=" e applica il pattern. Escludi input/label. Aggiungi l'import se manca.
2. Verifica con grep finale. Conta le migrazioni per file.

Quando hai finito stampa il comando pronto da copiare per il push: ./push.sh "B.2 tooltip Clienti+Contanti: migrato title= a <Tooltip> in Clienti* e GestioneContanti"
```

---

## Prompt 6 — Blocco Prenotazioni + Ricette + Banca + Altri (~16 occorrenze)

```
TASK: Migrare i title= nativi a <Tooltip> in Prenotazioni, Ricette, Banca, Statistiche, RiconciliaBancaPanel.

FILE DA MODIFICARE:
- frontend/src/pages/prenotazioni/PrenotazioniImpostazioni.jsx
- frontend/src/pages/prenotazioni/PrenotazioniPlanning.jsx
- frontend/src/pages/ricette/RicetteNuova.jsx
- frontend/src/pages/ricette/RicetteMatching.jsx
- frontend/src/pages/statistiche/StatisticheImport.jsx
- frontend/src/pages/banca/BancaCrossRef.jsx
- frontend/src/pages/banca/BancaDashboard.jsx
- frontend/src/components/riconciliazione/RiconciliaBancaPanel.jsx

REGOLE:
1. Importa Tooltip in ogni file: import Tooltip from "../../components/Tooltip"; (per RiconciliaBancaPanel.jsx il path è "../Tooltip")
2. NON toccare <Section title="..."> in RicetteSettings (non in lista), <input title="..."> in BancaImpostazioni (non in lista).
3. Target validi: <button title=...>, <span title=...>, <div title=...>.
4. Pattern: <Tooltip label="..."><button ...>...</button></Tooltip>. Rimuovi title="..." dal child.
5. NON cambiare logica, onClick, className.
6. NON fare git commit, NON fare git push.

STEP:
1. In ogni file, grep title=" e applica il pattern. Aggiungi l'import se manca (attenzione al path per RiconciliaBancaPanel che è sotto components/riconciliazione/).
2. Verifica con grep finale. Conta le migrazioni per file.

Quando hai finito stampa il comando pronto da copiare per il push: ./push.sh "B.2 tooltip misc: migrato title= a <Tooltip> in Prenotazioni/Ricette/Banca/Statistiche/Riconciliazione"
```

---

## File esclusi (title= è falso positivo o componente autonomo)

- `RicetteSettings.jsx` — tutti `<Section title="...">` props, falsi positivi
- `CantinaTools.jsx` — solo `<iframe title="Carta Vini...">`, attributo accessibilità
- `ViniCarta.jsx` — solo `<iframe title="Carta Vini">`, attributo accessibilità
- `BancaImpostazioni.jsx` — solo `<input title="Ordine">` su input numerici, escluso da policy

## Verifica finale post-migrazione

Quando tutti i 6 blocchi sono stati eseguiti e pushati, Marco può chiedere a Cowork:

```
Fai un grep di title=" in frontend/src e dimmi quali occorrenze restano. Dovrebbero essere solo:
- SectionHeader/Section/WizardPanel title= (props componenti)
- iframe title= (attributi accessibilità)
- th title= (attributi su intestazioni tabella)
- input/label title= (esclusi da policy)
```
