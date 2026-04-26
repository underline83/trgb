# Checklist Visione d'Insieme — TRGB

**Stabilita:** sessione 58 cont. (2026-04-26)
**Da Marco:** "se aggiungi qualcosa in un modulo devi rispettarne l'insieme — grafica, pulsanti, menu, dropdown, barra menu, docs" e "non perdere mai la visione dell'insieme".

Questa checklist e' OBBLIGATORIA prima di ogni push che aggiunge una pagina/route/sub-modulo a un macro-modulo TRGB esistente. Va applicata anche dalla skill `guardiano` come parte del pre-audit (Step 4-bis "Visione d'insieme del modulo").

## I 7 punti

### 1. Sub-nav del modulo
La pagina nuova compare nella `<XxxNav>` del macro-modulo come tab dedicata.

| Macro-modulo | File sub-nav |
|---|---|
| Gestione Cucina | `frontend/src/pages/ricette/RicetteNav.jsx` |
| Vini | `frontend/src/pages/vini/*Nav*.jsx` (verificare) |
| Clienti | `frontend/src/pages/clienti/ClientiNav*.jsx` |
| Cucina HACCP/Tasks | `frontend/src/pages/tasks/Nav.jsx` |

Se la sub-nav non esiste per il modulo, **non crearla d'iniziativa**: chiedi a Marco.

### 2. Dropdown header
`frontend/src/config/modulesMenu.js` — la nuova route compare come `{ label, go }` nel `sub` del macro-modulo. Stessa label della sub-nav.

### 3. Controllo accessi (modules.json)
`app/data/modules.json` — la nuova `sub.key` esiste con i ruoli appropriati. Senza questo, `useModuleAccess` blocca l'accesso anche se la voce e' visibile.

### 4. Versioni
`frontend/src/config/versions.jsx` — bump del macro-modulo se la modifica e' incrementale, oppure entry dedicata se il sotto-modulo e' grosso (DB nuovo, endpoint nuovi, pagina dedicata).

### 5. Docs dedicato
Per ogni sub-modulo nuovo (DB tabelle nuove + endpoint + UI dedicata) deve esistere `docs/modulo_<nome>.md` o `docs/<nome>.md` con: scopo, schema DB, endpoint, frontend, workflow, V1+. Esempi di reference: `docs/modulo_cucina.md`, `docs/menu_carta.md`, `docs/modulo_pranzo.md`.

Sempre aggiornato anche `docs/sessione.md` con il blocco "SESSIONE N — titolo".

### 6. Coerenza visiva (palette + primitive)

Pattern per pagine sotto **Gestione Cucina** (riferimento per altri moduli):
- Wrapper esterno: `<RicetteNav current="..."/>` in cima
- Sfondo: `bg-brand-cream`
- Container: `max-w-7xl mx-auto px-4 sm:px-6 py-6`
- Card principale: `bg-white shadow-2xl rounded-3xl p-6 sm:p-8 border border-neutral-200`
- Header titolo: `text-2xl font-bold text-orange-900 font-playfair`
- Sotto-card interne: `bg-neutral-50 border border-neutral-200 rounded-xl p-4`
- Tab attivi: `bg-orange-100 text-orange-900 shadow-sm`
- Tab inattivi: `text-neutral-600 hover:bg-neutral-100`
- Btn da `components/ui` (mattone M.I)
- Input: `border border-neutral-300 rounded-lg px-3 py-2 text-sm`

**MAI** inventare una nuova palette per il modulo. Se la pagina diverge, allinearla prima del push.

`PageLayout` (M.I) e' opt-in: pagine NUOVE possono usarlo, ma se le altre pagine del macro-modulo non lo usano (es. RicetteArchivio/RicetteSettings) la nuova pagina deve usare lo stesso wrapper diretto per coerenza.

### 7. Impostazioni in sidebar centrale del macro-modulo
Le impostazioni di un sotto-modulo NON vivono in una tab della pagina del sotto-modulo. Vivono come voce nella sidebar di `<Modulo>Settings.jsx` (es. `RicetteSettings.jsx`).

Pattern (sessione 58 cont., decisione di Marco):
- Crea un componente `<SubmoduleSettingsPanel>` (es. `PranzoSettingsPanel.jsx`) in `frontend/src/pages/<modulo-padre>/`
- Aggiungi voce al `MENU` di `<Modulo>Settings.jsx`: `{ key: "submodulo", label: "...", icon: "...", desc: "..." }`
- Aggiungi il rendering condizionale: `{activeSection === "submodulo" && <SubmoduleSettingsPanel />}`
- La pagina del sotto-modulo NON ha tab Settings. Mette un piccolo link in alto: `<a href="/ricette/settings" className="text-[11px] text-neutral-400">⚙️ Impostazioni Cucina →</a>`

## Esempio applicato — modulo Pranzo (sessione 58 cont.)

| Punto | Implementazione |
|---|---|
| 1 sub-nav | `RicetteNav.jsx` tab `pranzo` (icona 🥙) |
| 2 dropdown | `modulesMenu.js` voce "Menu Pranzo" sotto `ricette.sub` |
| 3 modules.json | `ricette.sub` aggiunto `{ key: "pranzo", label: "Menu Pranzo", roles: [...] }` |
| 4 versions | `versions.jsx` entry `pranzo: 1.0 alpha` + bump `ricette: 3.5 → 3.6` |
| 5 docs | `docs/modulo_pranzo.md` + blocco in `docs/sessione.md` |
| 6 palette | wrapper RicetteNav + bg-brand-cream + card shadow-2xl rounded-3xl + orange-900 font-playfair, palette neutral interna |
| 7 settings | `PranzoSettingsPanel.jsx` montato in `RicetteSettings.MENU` voce `pranzo`. Tab Settings rimossa da PranzoMenu |

## Anti-pattern noti (da non ripetere)

- `MenuCartaElenco.jsx` (sessione 57) — creato senza voce in RicetteNav. Corretto in sessione 58 cont.
- Prima versione `PranzoMenu.jsx` (sessione 58) — usava palette `bg-stone-*` mentre il modulo usa `bg-neutral-*`. Aveva una tab Settings standalone. Corretto.

## Ordine di lettura per il guardiano

Quando il guardiano fa il pre-audit, dopo aver letto `docs/controllo_design.md` e `docs/inventario_pulizia.md`, deve leggere ANCHE questo file e applicare la checklist a ogni file `frontend/src/pages/.../*.jsx` aggiunto dal diff. Le mancanze vanno segnalate nel report con livello WARN o BLOCK come specificato.
