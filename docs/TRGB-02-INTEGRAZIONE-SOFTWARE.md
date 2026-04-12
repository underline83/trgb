# TRGB-02 — Piano di integrazione nel gestionale

**Data analisi:** 12 aprile 2026 (aggiornato post-review Style Guide sessione 28)  
**Logo scelto:** TRGB-02 (gobbette sopra + T sotto)  
**Stato:** Analisi + asset mancanti generati

---

## Architettura software rilevata

**Stack:** React + Vite + Tailwind CSS (frontend) / Python FastAPI (backend)  
**Deploy:** VPS Linux, push.sh workflow, SQLite multipli  
**Repo:** ~/trgb sul Mac, /home/marco/trgb/trgb sul VPS  
**Struttura frontend:** `frontend/src/` con `components/`, `pages/`, `config/`, `assets/`

**Moduli attivi:** Vini (cantina, carta, magazzino, iPratico sync), Ricette/FoodCost, Fatture Elettroniche, Corrispettivi, Dipendenti (HR, cedolini), Prenotazioni (planning, tavoli, mappa), Statistiche, Controllo Gestione, Banca, Clienti, Admin/Settings.

**UI attuale:** Header sticky con testo "TRGB Gestionale" + logout, navigazione a tab + menu hub con card, grafici Recharts, canvas SVG per editor tavoli. Piano responsive 3-target (Desktop, iPad, Mobile) in corso — sessione 27 arrivata a Block 1 CG.

---

## Palette brand TRGB-02

| Nome | Hex | Uso |
|------|-----|-----|
| Red | #E8402B | Gobbetta 1, accenti, errori, alert |
| Green | #2EB872 | Gobbetta 2, successo, conferme |
| Blue | #2E7BE8 | Gobbetta 3, link, azioni primarie |
| Ink | #111111 | Testo principale, T del logo |
| Cream | #F4F1EC | Background light mode |
| Night | #0E0E10 | Background dark mode |

---

## Touchpoint da integrare — TODO

### 1. FAVICON E META

**1.1** Sostituire il favicon attuale in `frontend/public/` con le icone TRGB-02 generate:
- `favicon.ico` (da 32x32 e 16x16)
- `favicon-16x16.png`, `favicon-32x32.png`
- `apple-touch-icon.png` (180x180)
- `android-chrome-192x192.png`, `android-chrome-512x512.png`

**1.2** Aggiornare `index.html` con i link favicon corretti e i meta tag:
```html
<meta name="theme-color" content="#F4F1EC">
<meta property="og:image" content="/og-trgb-02.png">
```

**1.3** Se esiste un `manifest.json` / `site.webmanifest`, aggiornare icone, `theme_color: "#F4F1EC"`, `background_color: "#F4F1EC"`, `name: "TRGB Gestionale"`.

**File sorgente:** `TRGB-02-final/sizes/` (tutte le dimensioni pronte)

---

### 2. HEADER E NAVIGAZIONE

**2.1** Inserire l'icona TRGB-02 nell'Header al posto del testo. Usare il SVG trasparente (`TRGB-02-icon-transparent.svg`) ridotto a ~32-36px, accanto al testo "TRGB".

**2.2** Valutare se usare il wordmark completo (gobbette + "TRGB") al posto di icona + testo separati. File: `TRGB-02-wordmark-color.svg`.

**2.3** Aggiornare i colori dell'Header:
- Background: `#F4F1EC` (cream) invece di bianco o grigio
- Testo: `#111111` (ink)
- Hover/active: usare `#2E7BE8` (blue) per elementi interattivi

**2.4** Preparare la versione dark dell'Header con bg `#0E0E10` e testo `#F4F1EC`.

**File da toccare:** `frontend/src/components/Header.jsx` (o equivalente)

---

### 3. TAILWIND CONFIG — PALETTE COLORI

**3.1** Aggiungere i colori brand al `tailwind.config.js`:
```js
colors: {
  brand: {
    red: '#E8402B',
    green: '#2EB872',
    blue: '#2E7BE8',
    ink: '#111111',
    cream: '#F4F1EC',
    night: '#0E0E10',
  }
}
```

**3.2** Fare un audit di tutti i colori attualmente usati nel CSS/Tailwind per identificare quelli da sostituire. Cercare: `bg-blue-*`, `bg-green-*`, `bg-red-*`, `text-blue-*` ecc. e mapparli sui colori brand.

**3.3** Attenzione: NON cambiare i colori funzionali (rosso = errore, verde = successo) se già allineati alla palette. I colori TRGB-02 sono scelti apposta per funzionare anche come colori semantici: Red→errore, Green→successo, Blue→azione.

**File da toccare:** `tailwind.config.js`, poi ricerca globale nel frontend

---

### 4. LOGIN PAGE

**4.1** La pagina di login (`LoginForm.jsx`) è il primo punto di contatto. Deve mostrare il logo TRGB-02 prominente.

**4.2** Sfondo cream `#F4F1EC`, logo centrato sopra il form, possibile uso del pattern gobbette-A come elemento decorativo sottile.

**4.3** Il bottone "Accedi" dovrebbe usare `#2E7BE8` (blue brand) come colore primario.

**File da toccare:** `frontend/src/components/LoginForm.jsx`

---

### 5. MENU HUB / DASHBOARD

**5.1** Le card del menu hub possono usare le gobbette strip come divider orizzontale decorativo. File: `TRGB-gobbette-strip.svg`.

**5.2** Le card dei moduli possono avere un sottile bordo o accent color dal brand (es. bordo sinistro colorato con i 3 colori RGB a rotazione).

**5.3** Lo sfondo generale delle pagine dovrebbe essere `#F4F1EC` (cream) — controllare se attualmente è bianco puro (#FFFFFF) e sostituire.

---

### 6. GRAFICI (RECHARTS)

**6.1** I grafici in Recharts (statistiche iPratico, corrispettivi dashboard, categorie) devono usare la palette brand come colori primari:
- Serie 1: `#E8402B` (red)
- Serie 2: `#2EB872` (green)
- Serie 3: `#2E7BE8` (blue)
- Serie 4+: derivati della palette (red scuro, green scuro, blue scuro)

**6.2** Il grafico donut delle categorie (`ChartCategorie`) con anello interno/esterno: mappare i colori ai brand colors.

**6.3** L'heatmap del calendario corrispettivi: usare gradienti basati sui brand colors.

**File da toccare:** tutti i componenti `Chart*.jsx`, `*Dashboard.jsx`

---

### 7. LOADING STATES E SPLASH

**7.1** Creare un componente React `<TrgbLoader />` che usa l'animazione loader delle gobbette (pulse opacity loop). Può essere inline SVG o componente animato con Framer Motion / CSS animation.

**7.2** Usare `<TrgbLoader />` come stato di caricamento globale (al posto di spinner generici).

**7.3** Usare lo splash screen SVG (`TRGB-02-splash.svg`) come loading iniziale dell'app (primo render prima che React monti).

**File da creare:** `frontend/src/components/TrgbLoader.jsx`  
**File da toccare:** tutti i punti dove c'è uno spinner o "Caricamento..."

---

### 8. DARK MODE

**8.1** Se il dark mode esiste o è in roadmap, tutti gli asset sono pronti:
- Icona dark: `TRGB-02-icon-dark.svg`
- Wordmark dark: `TRGB-02-wordmark-dark.svg`
- Pattern dark: `TRGB-pattern-gobbette-A-dark.svg`
- Background: `#0E0E10` (night)
- Testo: `#F4F1EC` (cream)
- Le gobbette RGB restano invariate in dark mode

**8.2** Aggiungere variabili CSS o classi Tailwind `dark:` per lo switch.

---

### 9. PATTERN NELLE UI

**9.1** Pattern A (gobbette grandi + linea gold) → utilizzabile come background decorativo in pagine vuote ("empty state"), onboarding, sezioni hero.

**9.2** Pattern B (gobbette grandissime senza linea) → utilizzabile come watermark leggero dietro form o card importanti.

**9.3** Strip gobbette → utilizzabile come:
- Divider tra sezioni nell'header/footer
- Separatore nelle email di notifica
- Elemento decorativo nel widget pubblico prenotazioni

**File disponibili:** `TRGB-02-final/patterns/` (SVG + PNG, light e dark)

---

### 10. PAGINA PUBBLICA PRENOTAZIONI

**10.1** La Fase 3 del modulo Prenotazioni prevede un widget pubblico `/prenota`. Questo è il punto con più visibilità esterna — deve avere:
- Logo TRGB-02 prominente
- Palette cream/ink
- Gobbette come elemento decorativo
- Bottone azione in blue brand
- Possibile uso del wordmark completo

**10.2** La pagina di conferma prenotazione: mostrare il logo + pattern come header.

---

### 11. PDF ED EXPORT

**11.1** Carta vini PDF/DOCX (`static/carta_vini.*`) → aggiungere header con logo TRGB-02 + gobbette strip.

**11.2** Cedolini dipendenti (PDF salvati in `app/data/cedolini/`) → se generati dal sistema, aggiungere header con brand.

**11.3** Export iPratico (XLSX) → opzionale, aggiungere logo nel foglio.

**11.4** Report/stampe future → predisporre un template base con header brand.

---

### 12. EMAIL E NOTIFICHE

**12.1** Se le email di conferma prenotazione (Fase 4, SMTP Brevo) sono in roadmap: predisporre template HTML con:
- Logo wordmark in header
- Gobbette strip come footer separator
- Colori brand per bottoni CTA
- Versione dark-mode compatibile

---

### 13. EDITOR TAVOLI E MAPPA

**13.1** L'editor tavoli usa un canvas SVG — valutare se i colori delle zone tavoli possono essere derivati dalla palette brand (es. zona sala = tinta blue, zona bottiglieria = tinta green).

**13.2** La mappa serale con stati tavoli (libero/occupato/prenotato) potrebbe usare i brand colors: verde=libero, blue=prenotato, rosso=occupato.

---

### 14. VERSIONING E ABOUT

**14.1** `config/versions.jsx` tiene traccia delle versioni moduli. Aggiungere una sezione "About" o info panel che mostra il logo TRGB-02 + versione corrente del software.

---

## Ordine di priorità suggerito

| Priorità | Task | Impatto | Effort |
|----------|------|---------|--------|
| **P0** | 1. Favicon + meta | Branding base | Basso |
| **P0** | 2. Header + logo | Visibilità costante | Basso |
| **P0** | 3. Tailwind palette | Fondazione per tutto il resto | Medio |
| **P1** | 4. Login page | Primo impatto utente | Basso |
| **P1** | 6. Grafici Recharts | Coerenza visiva dati | Medio |
| **P1** | 7. Loader/splash | Esperienza app | Basso |
| **P2** | 5. Menu hub | Estetica navigazione | Basso |
| **P2** | 9. Pattern nelle UI | Identità visiva profonda | Medio |
| **P2** | 10. Widget prenotazioni | Visibilità pubblica | Alto (dipende dalla Fase 3) |
| **P3** | 8. Dark mode | Feature completa | Alto |
| **P3** | 11. PDF/export | Brand su documenti | Medio |
| **P3** | 12. Email | Brand su comunicazioni | Medio |
| **P3** | 13. Tavoli/mappa | Dettaglio UI | Basso |
| **P3** | 14. About/version | Nice-to-have | Basso |

---

## File da copiare nel repo

Tutti i file sorgente sono in `TRGB/TRGB-02-final/`. Per integrarli nel repo del gestionale, copiare nella cartella `frontend/public/` (o `frontend/src/assets/`) i file necessari. Suggerimento di struttura:

```
frontend/
  public/
    favicon.ico
    favicon-16x16.png
    favicon-32x32.png
    apple-touch-icon.png
    android-chrome-192x192.png
    android-chrome-512x512.png
    og-trgb-02.png
  src/
    assets/
      brand/
        TRGB-02-icon-color.svg
        TRGB-02-icon-dark.svg
        TRGB-02-icon-transparent.svg
        TRGB-02-wordmark-color.svg
        TRGB-02-wordmark-dark.svg
        TRGB-gobbette-strip.svg
        TRGB-pattern-gobbette-A.svg
        TRGB-pattern-gobbette-A-dark.svg
```

---

## Review post Style Guide (sessione 28)

La sessione 28 ha prodotto un Brand Style Guide di 6 pagine. Confronto con il nostro set:

### Già implementato (sessione 28)

- Favicon + icone PWA + apple-touch-icon (tutte le dimensioni)
- Palette Tailwind `brand.*` in tailwind.config.js
- index.html: theme-color, OG image, body cream
- manifest.webmanifest con colori cream
- Variabili CSS in index.css
- Header v5.0: logo SVG gobbette + cream bg
- Login: wordmark composto inline (SVG gobbette + `<span>` TRGB Helvetica Neue 800)
- Home v4.0: wordmark centrato, strip RGB, card con bordo brand a rotazione
- TrgbLoader.jsx: componente riusabile gobbette pulse
- Grafici Recharts: 3 dashboard con colori brand
- TrgbLoader in 6 loading di pagina principali
- Sfondo bg-brand-cream su 90 pagine
- Colori ruolo utente separati (Amber/Cyan/Purple/Rose/Emerald/Slate) — NON sostituiti con brand

### Asset creati post-review (nuovi in TRGB-02-final)

| File | Descrizione |
|------|-------------|
| `sizes/icon-512-maskable.png` | Android maskable con safe area 70% su cream |
| `sizes/icon-192-maskable.png` | Android maskable 192px |
| `sizes/favicon.ico` | Multi-res 16+24+32+48px in un unico .ico |
| `splash-screens/` (14 file) | Splash per ogni risoluzione iPhone/iPad (portrait + landscape) |

### Asset disponibili ma non ancora usati nel gestionale

| File | Uso suggerito |
|------|---------------|
| `icon/TRGB-02-icon-mono-black.svg/png` | Stampa monocromatica, merchandising, scontrini |
| `icon/TRGB-02-icon-mono-white.svg/png` | Stampa su fondo scuro, gadget |
| `wordmark/TRGB-02-wordmark-black.svg/png` | Documenti stampati B/N (fatture, contratti) |
| `wordmark/TRGB-02-wordmark-white.svg/png` | Footer scuri, banner su foto |
| `patterns/TRGB-pattern-gobbette-B.svg/png` | **Watermark leggero** dietro card importanti, sfondo empty state grandi (es. "Nessuna prenotazione"), sfondo sezione hero onboarding |
| `social/TRGB-02-og-dark.png` | OG image per contesti dark (opzionale) |
| `social/TRGB-02-banner.png` | Header Twitter/X 1500x500 |
| `social/TRGB-02-square-1080.png` | Post Instagram/social quadrato |

### TODO ancora aperti per il gestionale

| ID | Priorità | Task | Note |
|----|----------|------|------|
| P2.9 | Media | Pattern gobbette in empty state / watermark card | Pattern B pronto, da integrare |
| P2.13 | Media | Colori zone editor tavoli su brand | verde=libero, blue=prenotato, rosso=occupato |
| P2.14 | Bassa | Sezione About / version panel con logo | |
| P3.8 | Alta | Dark mode completo | Asset SVG dark pronti, serve switch Tailwind `dark:` |
| P3.10 | Alta | Widget pubblico /prenota | Bloccato da Fase 3 Prenotazioni |
| P3.11 | Media | PDF/export con header brand | Carta vini, cedolini, report — backend Python |
| P3.12 | Media | Email template Brevo | Bloccato da Fase 4 SMTP |

### Note tecniche dalla Style Guide

1. **Wordmark SVG**: NON usare direttamente il file SVG con `<text>`. Il codice compone inline: SVG gobbette + `<span>` HTML "TRGB" in Helvetica Neue 800. Problema: `<text>` SVG ha issue di viewBox cross-browser.
2. **Strip viewBox**: nel repo è stato corretto a 155x28 per centratura. Il nostro originale (600x60) è il sorgente, la versione repo è derivata.
3. **Colori pagamenti** (contanti, POS, ecc.): sono funzionali, NON vanno sostituiti con brand.
4. **Font**: Inter (body 400/500/600), Playfair Display (titoli 600/700), Helvetica Neue 800 (solo wordmark). Già configurati in index.css — non cambiare.

---

## File da copiare nel repo (aggiornato)

```
frontend/
  public/
    icons/
      favicon.ico                    ← NUOVO multi-res 16+24+32+48
      favicon-16x16.png
      favicon-32x32.png
      apple-touch-icon.png           (180x180)
      android-chrome-192x192.png
      android-chrome-512x512.png
      icon-192-maskable.png          ← NUOVO safe area
      icon-512-maskable.png          ← NUOVO safe area
    og-trgb-02.png
    manifest.webmanifest
  src/
    assets/
      brand/
        TRGB-02-icon-transparent.svg   ← header
        TRGB-02-icon-color.svg
        TRGB-02-icon-dark.svg
        TRGB-02-icon-mono-black.svg    ← per print
        TRGB-02-icon-mono-white.svg    ← per print
        TRGB-02-wordmark-color.svg     ← NON usare diretto
        TRGB-02-wordmark-dark.svg
        TRGB-02-wordmark-black.svg     ← per print B/N
        TRGB-02-wordmark-white.svg     ← per footer scuri
        TRGB-02-loader.svg
        TRGB-02-splash.svg
        TRGB-gobbette-strip.svg        (viewBox 155x28 nel repo)
        TRGB-pattern-gobbette-A.svg
        TRGB-pattern-gobbette-A-dark.svg
        TRGB-pattern-gobbette-B.svg    ← per empty state / watermark
  splash-screens/                      ← NUOVO 14 file iOS
    splash-iPhone-14-1170x2532.png
    splash-iPad-Pro-11-1668x2388.png
    ... (14 risoluzioni totali)
```

---

*Documento aggiornato post-review Style Guide sessione 28. Asset mancanti generati e pronti in TRGB-02-final/.*
