# TRGB Docs — Convenzioni wiki

> **Tipo:** ⚙ schema · **Stato:** attuale · **Ultima verifica:** 2026-07-24
> **Vedi anche:** [index.md](index.md) (home del wiki)

`docs/` non è una cartella di file: è il **wiki del progetto**. Queste convenzioni definiscono cosa significa in pratica. Valgono per ogni sessione (Claude e Marco) che tocca la documentazione.

**Origine:** discussione 2026-07-24 sul modello "LLM wiki" di Karpathy ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)), adattato: per TRGB il problema non è l'accumulo di conoscenza (i docs esistono già) ma **navigabilità e coerenza**.

---

## I tre tipi di pagina

Ogni file di `docs/` appartiene a uno di questi tipi. Confonderli è la fonte del drift.

| Tipo | Cos'è | Regola di scrittura | Esempi |
|---|---|---|---|
| 📓 **Log** | Registro cronologico, append-only | Solo INSERT in testa (o in coda), mai riscrivere il passato | `sessione.md`, `changelog.md`, `problemi.md` |
| 📄 **Pagina wiki** | Descrive lo stato ATTUALE di un argomento | Si aggiorna in place; risponde a "come funziona X oggi?" | `modulo_*.md`, `architettura_*.md`, `database.md`, `spec_*.md` |
| ⚙ **Schema / regole** | Convenzioni e istruzioni operative | Cambia solo per decisione esplicita di Marco | `CLAUDE.md`, `checklist_visione_insieme.md`, `controllo_design.md`, questo file |

**Corollario:** un log non è mai la fonte per "come funziona X oggi". Se un'informazione utile vive solo in `sessione.md`/`changelog.md`, va portata nella pagina wiki dell'argomento (il log resta come storico). È la stessa logica della regola capability di `CLAUDE.md`.

---

## Le 4 regole

### 1. Una home: `index.md`

[index.md](index.md) è il punto d'ingresso unico di `docs/`, organizzato per argomento, una riga di descrizione per pagina.

- Ogni pagina **nuova** in `docs/` va aggiunta a `index.md` nella sezione giusta, nello stesso commit.
- Ogni pagina **spostata in `archive/`** va tolta dalle sezioni attive.
- `index.md` è un catalogo, non un contenitore: descrizioni di UNA riga, niente contenuto.

### 2. Un fatto, una pagina

Ogni informazione ha **una pagina proprietaria** (canonica). Le altre pagine **linkano**, non copiano.

- Se serve richiamare il contenuto altrove: riassunto minimo operativo + link alla pagina canonica (pattern già usato da `CLAUDE.md` per stati pagamento e refactor monorepo).
- Quando trovi la stessa informazione in due pagine: si decide quale è canonica, l'altra diventa un link. In caso di dubbio su quale sia canonica → chiedere a Marco.
- Duplicazioni note da sanare (al primo tocco, vedi §Adozione): palette TRGB-02 (`CLAUDE.md` ↔ `styleguide.md`), tabella docs (`readme.md` §12 → ora punta a `index.md`), descrizioni moduli (`readme.md` §9 ↔ `modulo_*.md`).

### 3. Link veri tra pagine

I riferimenti tra pagine sono **link markdown relativi**, non citazioni testuali.

- Sì: `[architettura_mattoni.md](architettura_mattoni.md)` o con ancora `[M.B](architettura_mattoni.md#mb-pdf-brand)`. No: "vedi il documento dei mattoni".
- Funzionano in VS Code, su GitHub e per Claude; in futuro un lint può verificarli automaticamente.
- Se una pagina viene rinominata/spostata, chi la sposta cerca i link entranti (`grep -r "nomefile" docs/`) e li aggiorna nello stesso commit.

### 4. Header di stato su ogni pagina

Ogni pagina wiki (📄) apre con un blocco quote di 2 righe sotto il titolo:

```markdown
# Titolo pagina

> **Tipo:** 📄 pagina wiki · **Stato:** attuale | parziale | storico · **Ultima verifica:** AAAA-MM-GG
> **Vedi anche:** [pagina](file.md), [pagina](file.md)
```

- **Stato:** `attuale` = si può fare affidamento; `parziale` = sezioni indietro rispetto al codice; `storico` = non più mantenuta (candidata ad `archive/`).
- **Ultima verifica** = l'ultima volta che qualcuno ha CONTROLLATO che la pagina rispecchi il codice (non l'ultima modifica: quella la dice git).
- I log (📓) non hanno bisogno dell'header (sono cronologici per natura); `sessione.md` mantiene il suo header "Ultimo aggiornamento" esistente.

---

## Adozione: opt-in, mai big-bang

Stessa filosofia del mattone M.I (UI primitives):

- **Da oggi:** pagine nuove nascono già conformi (header, link, riga in index).
- **Pagine esistenti:** si convertono **quando le si tocca per altri motivi** — si aggiunge l'header, si trasformano i riferimenti testuali in link, si sana la duplicazione se c'è. Niente sessioni dedicate alla conversione di massa.
- **Vietato** riorganizzare/rinominare file in blocco per "fare ordine": ogni rinomina rompe riferimenti in skill, memoria e sessioni parallele. Le rinomine si fanno solo con un motivo e aggiornando i link entranti (regola 3).

## Lint (futuro)

Verifica periodica di coerenza del wiki, su richiesta di Marco (candidato sub-comando `/guardiano lint`): link rotti, contraddizioni tra pagine (roadmap FATTO vs problemi aperto), pagine con "Ultima verifica" vecchia su moduli toccati di recente, duplicazioni nuove. Non implementato: per ora il lint è manuale.
