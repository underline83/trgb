# TRGB Gestionale — Styleguide UI

Riferimento per mantenere coerenza visiva tra i moduli. Tailwind CSS, niente file CSS separati.

---

## Colori modulo (dalla Home)

| Modulo              | Colore          | Classe Tailwind base                            |
|---------------------|-----------------|--------------------------------------------------|
| Vini                | Amber           | `bg-amber-50 border-amber-200 text-amber-900`   |
| Acquisti            | Teal            | `bg-teal-50 border-teal-200 text-teal-900`      |
| Vendite             | Indigo           | `bg-indigo-50 border-indigo-200 text-indigo-900` |
| Ricette             | Orange          | `bg-orange-50 border-orange-200 text-orange-900` |
| Banca               | Emerald         | `bg-emerald-50 border-emerald-200 text-emerald-900` |
| Controllo Gestione  | Sky             | `bg-sky-50 border-sky-200 text-sky-900`          |
| Statistiche         | Rose            | `bg-rose-50 border-rose-200 text-rose-900`      |
| Dipendenti          | Purple          | `bg-purple-50 border-purple-200 text-purple-900` |
| Impostazioni        | Neutral         | `bg-neutral-50 border-neutral-300 text-neutral-800` |

## Colori semantici (trasversali)

- Successo/Pagato: `emerald` (bg-emerald-100, text-emerald-800)
- Warning/In scadenza: `amber` (bg-amber-100, text-amber-800)
- Errore/Scaduto: `red` (bg-red-100, text-red-800)
- Info/Parziale: `blue` (bg-blue-100, text-blue-800)

---

## Layout pagine

### Pagine Hub (Home, Menu modulo)
```
div.min-h-screen.bg-neutral-100.p-6
  div.max-w-5xl.mx-auto.bg-white.shadow-2xl.rounded-3xl.p-12.border.border-neutral-200
    h1.text-4xl.font-bold.text-center  (titolo centrato)
    p.text-center.text-neutral-600.mb-10  (sottotitolo)
    div.grid.grid-cols-1.sm:grid-cols-2.gap-6  (griglia tile)
    div.mt-12.text-center.text-xs.text-neutral-400  (footer versione)
```

### Tile modulo (nella griglia)
```
div.rounded-2xl.border.shadow-lg.p-6.cursor-pointer
  .hover:shadow-xl.hover:-translate-y-1.transition
  .{colore-modulo}
  div.flex.justify-between.items-start.mb-2
    div.text-4xl (emoji icona)
    VersionBadge (in alto a destra)
  div.text-xl.font-semibold (titolo)
  div.text-sm.opacity-80 (sottotitolo)
```

### Sotto-pagine (dati/liste) — Pattern Header Bar
```
div.min-h-screen.bg-neutral-100
  div.bg-white.border-b.border-neutral-200.px-4.py-2.5.flex.items-center.justify-between
    div.flex.items-center.gap-3
      button ← (back: text-neutral-400 hover:text-neutral-600 text-sm)
      h1.text-lg.font-bold.text-{COLORE_MODULO}-900.font-playfair (emoji + titolo)
    div.flex.items-center.gap-2 (pulsanti azione a destra)
```

### Sotto-pagine (form pesanti) — Pattern Card
```
div.min-h-screen.bg-neutral-100.p-6
  div.max-w-5xl (o 6xl).mx-auto.bg-white.shadow-2xl.rounded-3xl.p-12.border.border-neutral-200
    div.flex.justify-between.gap-4.mb-8
      h1.text-3xl.font-bold.text-{COLORE_MODULO}-900.font-playfair (emoji + titolo)
      button.rounded-xl.border.border-neutral-300.text-sm ← Modulo
```

---

## Componenti standard

### Pulsante primario (CTA)
```
px-3 py-1.5 rounded-lg bg-{COLORE}-600 text-white text-xs font-semibold hover:bg-{COLORE}-700
```
Oppure per bottoni piu grandi:
```
px-4 py-2 rounded-xl bg-{COLORE}-700 text-white text-sm font-semibold hover:bg-{COLORE}-800
```

### Pulsante secondario
```
px-3 py-1.5 rounded-lg border border-{COLORE}-300 text-{COLORE}-700 text-xs font-semibold hover:bg-{COLORE}-50
```

### Pulsante neutro (annulla, back)
```
px-4 py-2 rounded-xl border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-100
```

### Input / Select
```
w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm
```

### Label
```
text-[10px] text-neutral-500 block mb-0.5
```
Oppure sidebar:
```
text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest
```

### Badge stato
```
text-[10px] px-1.5 py-0.5 rounded-full font-medium
  bg-{COLORE_SEMANTICO}-100 text-{COLORE_SEMANTICO}-700 border border-{COLORE_SEMANTICO}-200
```

### Badge versione
Usare il componente `<VersionBadge modulo="..." />` da `config/versions.jsx`.

### Pannello form inline
```
mx-4 mt-3 bg-white rounded-xl border border-{COLORE_MODULO}-200 shadow-lg p-5
  h3.text-sm.font-bold.text-{COLORE_MODULO}-900.mb-3
  div.grid.grid-cols-2.md:grid-cols-4.gap-3 (campi)
  div.flex.gap-2.mt-3 (bottoni)
```

### Tabella dati
```
div.bg-white.rounded-xl.border.border-neutral-200.overflow-hidden.shadow-sm
  table.w-full.text-sm
    thead: tr.bg-neutral-50.border-b.border-neutral-200
      th: text-[10px] text-neutral-600 uppercase px-3 py-2
    tbody: tr.border-b.border-neutral-100.hover:bg-neutral-50
```

---

## Tipografia

- Titoli pagina: `font-playfair` (serif decorativo)
- Corpo: default sans-serif (non aggiungere `font-sans` al container)
- Dimensioni: `text-4xl` (titolo hub), `text-3xl` (titolo card), `text-lg` (titolo header bar), `text-sm` (corpo), `text-xs` (tabelle), `text-[10px]` (label/badge)

## Font-size reference

| Uso                  | Classe         |
|----------------------|----------------|
| Titolo hub           | `text-4xl`     |
| Titolo sotto-pagina  | `text-lg` o `text-3xl` |
| Corpo testo          | `text-sm`      |
| Tabella              | `text-sm` o `text-xs` |
| Label                | `text-[10px]`  |
| Badge                | `text-[10px]` o `text-[9px]` |
| Conteggio            | `text-[10px]`  |

---

## Home v3 — Tile moduli (sessione 29)

Le tile della Home NON usano emoji. Pattern:
```
div.tile3 — bg-white rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,.04)] overflow-hidden relative
  div — gobbetta accent: 2px top bar, cicla brand-red/green/blue, opacity .5
  div — padding 20px, flex column, justify-between, height 100%
    div.icon — 36x36 rounded-[10px] bg-{tint} color-{accent}
      svg stroke-1.5 (da icons.jsx)
    div.text
      div.label — 14px font-bold text-brand-ink
      div.sub — 10px warm-gray opacity .6
```

Colori moduli SMORZATI (NON i Tailwind saturi):
| Modulo              | Accent    | Tint      |
|---------------------|-----------|-----------|
| Vini                | #B8860B   | #FAF5EB   |
| Acquisti            | #2D8F7B   | #EEF9F6   |
| Vendite             | #4F52B5   | #EDEDFA   |
| Ricette             | #C05621   | #FDF3EC   |
| Flussi Cassa        | #1A7F5A   | #EBF8F3   |
| Controllo Gestione  | #2871B8   | #EBF3FC   |
| Statistiche         | #B83A52   | #FCEDF0   |
| Prenotazioni        | #6B4FA8   | #F1EDF9   |
| Clienti             | #1E7E8A   | #ECF7F8   |
| Dipendenti          | #7C4FA8   | #F3EEF9   |
| Impostazioni        | #6B6B6B   | #F2F2F2   |

---

## Regole

1. Il colore primario di ogni sotto-pagina segue il **colore del modulo padre** (es. Buste Paga usa purple perche e sotto Dipendenti)
2. I colori semantici (rosso/amber/verde) si usano SOLO per stati e alert, MAI come tema modulo
3. Il back button torna sempre al **livello superiore** (sotto-pagina → menu modulo, menu modulo → Home)
4. **NO emoji nei moduli**: usare icone SVG da `icons.jsx`. Emoji ammesse solo in testi/note
5. Niente CSS file separati, tutto Tailwind inline
6. `VersionBadge` sulle tile dei menu, non nelle header bar
7. Card e widget: border-radius 14px, shadow minima, niente bordi pesanti
8. Touch target minimo 44pt su tutto (bottoni 48pt, righe lista ≥ 44pt)
