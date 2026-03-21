# Analisi Grafica TRGB Gestionale

**Data**: 21 Marzo 2026
**Obiettivo**: Identificare incoerenze visive tra i moduli e proporre un coordinamento grafico uniforme.

---

## 1. Mappa Colori Attuale per Modulo

| Modulo | Colore Nav | Colore Home Card | Colore Primario | Problema |
|--------|-----------|-----------------|----------------|----------|
| **Vini** | amber-900 | amber-50 | amber | — |
| **Ricette** | amber-900 | blue-50 (Home) | amber | Uguale a Vini! |
| **Acquisti/Fatture** | amber-900 | teal-50 (Home) | amber | Uguale a Vini! |
| **Vendite** | amber-900 | yellow-50 (Home) | amber | Uguale a Vini! |
| **Banca** | emerald-900 | emerald-50 | emerald | OK — unico |
| **Finanza** | violet-900 | violet-50 | violet | OK — unico |
| **Statistiche** | rose-900 | rose-50 | rose | OK — unico |

**Problema principale**: 4 moduli su 7 usano lo stesso colore amber. L'utente non può distinguerli visivamente.

### Proposta Nuova Palette

| Modulo | Colore Proposto | Tailwind | Motivazione |
|--------|----------------|----------|-------------|
| **Vini** | Amber/Oro | amber-* | Vino = calore, tradizione |
| **Ricette/FoodCost** | Orange | orange-* | Cucina, fuoco |
| **Acquisti/Fatture** | Teal | teal-* | Amministrativo, ordine |
| **Vendite/Corrispettivi** | Indigo | indigo-* | Commerciale, dati |
| **Banca** | Emerald | emerald-* | Soldi, conferma (già OK) |
| **Finanza** | Violet | violet-* | Analisi, profondità (già OK) |
| **Statistiche** | Rose | rose-* | Grafici, evidenza (già OK) |

---

## 2. Incoerenze Navbar

Le Nav di tutti i moduli hanno struttura identica (buono!), ma i colori dei tab attivi variano:

- **ViniNav**: active = `bg-amber-100 text-amber-900`
- **FinanzaNav**: active = `bg-violet-100 text-violet-900`
- **BancaNav**: active = `bg-emerald-100 text-emerald-900`
- **RicetteNav**: active = `bg-amber-100 text-amber-900` (uguale a Vini!)
- **FattureNav**: active = `bg-amber-100 text-amber-900` (uguale a Vini!)
- **VenditeNav**: active = `bg-amber-100 text-amber-900` (uguale a Vini!)

**Azione**: Ogni Nav deve usare il colore del proprio modulo.

---

## 3. Incoerenze Header di Pagina

Due pattern diversi per gli header delle pagine:

### Pattern A — "Gradient Header" (usato in FinanzaImpostazioni)
```
bg-gradient-to-r from-amber-600 to-amber-500
Titolo bianco, padding generoso, shadow
```

### Pattern B — "Flat Title" (usato nella maggior parte delle pagine)
```
Dentro un container bianco rounded-3xl
text-3xl font-bold text-[COLOR]-900 font-playfair
```

**Azione**: Scegliere UN pattern e usarlo ovunque. Il Pattern B (flat) è più coerente con il design generale.

---

## 4. Incoerenze Container e Max-Width

| Pagina | max-width | Padding | Shadow |
|--------|-----------|---------|--------|
| Dashboard Vini | max-w-7xl | p-6 sm:p-10 | shadow-2xl |
| Dashboard Finanza | max-w-7xl | p-6 sm:p-10 | shadow-2xl |
| Ricette Dashboard | max-w-5xl | p-4 sm:p-6 | — |
| Menu Vini | max-w-5xl | p-12 | shadow-2xl |
| FinanzaImpostazioni | max-w-5xl | p-4 sm:p-6 | — |
| Magazzino Vini | max-w-7xl | p-6 | — |

**Azione**: Standardizzare su `max-w-7xl` per dashboard, `max-w-5xl` per pagine di impostazioni/menu. Padding uniforme `p-4 sm:p-6`.

---

## 5. Incoerenze Bottoni

### Bottone Primario — 3 varianti trovate:

1. `px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-700`
2. `px-5 py-2 rounded-xl font-semibold bg-emerald-700`
3. `px-4 py-2 bg-neutral-700 rounded-lg text-sm font-medium`

### Bottone Secondario — 2 varianti:

1. `px-4 py-2 text-sm border border-neutral-300 rounded-xl hover:bg-neutral-50`
2. `px-3 py-1.5 text-xs border border-neutral-300 rounded-lg hover:bg-neutral-50`

**Azione**: Definire 3 taglie standard:

| Taglia | Classe |
|--------|--------|
| **Large** | `px-5 py-2.5 rounded-xl text-sm font-semibold` |
| **Medium** | `px-4 py-2 rounded-xl text-sm font-medium` |
| **Small** | `px-3 py-1.5 rounded-lg text-xs font-medium` |

---

## 6. Incoerenze Form Input

### Focus ring — 2 varianti:

1. `focus:ring-2 focus:ring-amber-300` (Vini)
2. `focus:ring-1 focus:ring-amber-500` (Ricette)

### Dimensione testo input:

1. `text-xs` (filtri MagazzinoVini)
2. `text-sm` (RicetteArchivio, la maggior parte)

**Azione**: Standardizzare su `focus:ring-2 focus:ring-amber-300` (o il colore del modulo) e `text-sm` per tutti gli input.

---

## 7. Incoerenze Border Radius

| Elemento | Varianti trovate |
|----------|-----------------|
| Container principale | `rounded-3xl` |
| Card secondarie | `rounded-2xl` o `rounded-xl` |
| Input/Select | `rounded-lg` |
| Bottoni | `rounded-xl` o `rounded-lg` |
| Badge | `rounded-full` |

**Azione**: Definire una scala:

| Livello | Classe | Uso |
|---------|--------|-----|
| XL | `rounded-3xl` | Solo container pagina principale |
| L | `rounded-2xl` | Card, sezioni, modali |
| M | `rounded-xl` | Bottoni grandi, alert |
| S | `rounded-lg` | Input, select, bottoni piccoli |
| Full | `rounded-full` | Badge, tag, avatar |

---

## 8. Incoerenze Shadow

| Variante | Dove usata |
|----------|-----------|
| `shadow-2xl` | Container dashboard |
| `shadow-xl` | Alert, hover card |
| `shadow-sm` | Nav, bottoni |
| `shadow` | Card normali |
| nessuna | Molte pagine secondarie |

**Azione**: Definire 3 livelli:

| Livello | Classe | Uso |
|---------|--------|-----|
| Alto | `shadow-xl` | Container principale pagina |
| Medio | `shadow-sm` | Card, sezioni interne |
| Basso | `shadow` | Nav, bottoni hover |

---

## 9. Tipografia — Stato Attuale

**Font**: Inter (body) + Playfair Display (titoli) — buona scelta, coerente.

### Incoerenze trovate:

| Elemento | Varianti |
|----------|----------|
| Titolo pagina | `text-3xl` vs `text-3xl sm:text-4xl` vs `text-3xl lg:text-4xl` |
| Label form | `text-[10px]` vs `text-[11px]` vs `text-xs` |
| Tracking titoli | `tracking-wide` presente su alcuni, assente su altri |

**Azione**: Standardizzare le dimensioni responsive dei titoli su `text-2xl sm:text-3xl font-bold font-playfair tracking-wide`.

---

## 10. Componenti Mancanti (da creare)

Per garantire coerenza a lungo termine, servono componenti riutilizzabili:

1. **`<PageLayout>`** — wrapper con Nav + header + container + padding standard
2. **`<DataTable>`** — tabella con header sortabile, hover, padding coerente
3. **`<StatusBadge>`** — badge colorato con mappa di stati predefiniti
4. **`<PrimaryButton>` / `<SecondaryButton>`** — bottoni con taglie S/M/L
5. **`<FilterBar>`** — barra filtri con stile uniforme
6. **`<EmptyState>`** — messaggio "nessun dato" con icona
7. **`<LoadingSpinner>`** — indicatore di caricamento

---

## 11. Priorità di Intervento

| Priorità | Intervento | Impatto | Sforzo |
|----------|-----------|---------|--------|
| **1** | Assegnare colori unici ai moduli (Nav + badge) | Alto | Basso |
| **2** | Uniformare header pagine (un solo pattern) | Alto | Medio |
| **3** | Uniformare focus ring e input styles | Medio | Basso |
| **4** | Standardizzare border-radius e shadows | Medio | Basso |
| **5** | Creare componente PageLayout condiviso | Alto | Medio |
| **6** | Creare componente DataTable condiviso | Alto | Alto |
| **7** | Uniformare bottoni (3 taglie) | Medio | Medio |

---

*Report generato da analisi statica del codice frontend React/Tailwind.*
