# Migrazioni TRGB-specific dell'osteria Tre Gobbi

**Sessione 60, 2026-04-29 (R3 del refactor monorepo).**

Su 105 migrazioni totali in `app/migrations/`, **3 contengono dati seed specifici** dell'osteria di Marco (menu Primavera 2026, ingredienti Tre Gobbi, MEP templates importati dal docx Primavera 2026). Sono marcate con flag `TRGB_SPECIFIC = True` al livello modulo Python.

Quando il backend gira con `TRGB_LOCALE != "tregobbi"` (es. istanza prodotto pulita `locali/trgb/` su `trgb.it`), il `migration_runner` le **salta** automaticamente. Il cliente nuovo parte con DB vuoti e popola i suoi dati dal pannello UI esistente.

## Lista

| # | File | Cosa fa | Perché TRGB-specific | Comportamento se skippata |
|---|------|---------|----------------------|---------------------------|
| 097 | `097_import_mep_templates.py` | Importa 5 MEP templates (Mise en place Basi & Fondi, Antipasti, Primi, Secondi, Contorni) dal docx `Checklist_Cucina_Primavera_2026.docx` di Marco nella tabella `checklist_template` (modulo Cucina/HACCP). | I template contengono task/checklist specifici del menu di Marco (es. "Preparare brodo carcasse manzo per il brasato"). Un altro ristorante avrà MEP completamente diversi. | Modulo Cucina/HACCP gira ugualmente. Cliente popola i suoi MEP templates dal pannello UI Impostazioni Cucina. |
| 099 | `099_seed_food_cost_test.py` | Seed nel modulo Food Cost: 9 ingredient_categories generiche (carne, pesce, ...), **80 ingredients** con allergeni, **14 ricette base** (fondi, salse), **21 ricette piatto** del menu Primavera 2026 di Tre Gobbi. | Le 35 ricette piatto+base sono il menu specifico di Marco (es. "Brasato al Barolo", "Risotto agli asparagi"). Gli 80 ingredients riflettono il magazzino reale dell'osteria. | Modulo Ricette / Food Cost parte VUOTO. Cliente nuovo crea le sue ricette dal pannello UI Ricette. |
| 100 | `100_seed_menu_primavera_2026.py` | Seed nel modulo Menu Carta: 1 edizione "Primavera 2026" + 28 publications (link alle recipes della 099) + 7 publications servizio (coperto, acqua, espresso, ...) + 2 degustation paths con 10 step. | Edizione menu specifica di Tre Gobbi. Le publications referenziano le recipes della 099 (anch'essa TRGB). | Modulo Menu Carta parte VUOTO. Cliente nuovo crea le sue edizioni dal pannello UI Menu Carta. |

## Migrazioni VALUTATE ma NON marcate (per riferimento)

Durante R3 sono state esaminate altre candidate "borderline" e si è deciso di **non marcarle** TRGB-specific perché contengono dati seed universali per la ristorazione (modificabili dal cliente nuovo via pannello):

| File | Perché NON è TRGB-specific |
|------|----------------------------|
| `069_macellaio_categorie.py` | Seed default "Filetto, Controfiletto, Costata" — categorie macellaio universali |
| `070_preventivi_menu_luoghi.py` | Seed luoghi default "Sala, Giardino, Dehor" — sono valori di partenza modificabili dal pannello (cliente nuovo li sostituisce con i suoi luoghi) |
| `074_recipes_menu_servizi.py` | Schema + seed servizi "Alla carta, Banchetto, Pranzo di lavoro, Aperitivo" — universali ristorazione |
| `091_scelta_salumi.py` / `092_scelta_formaggi.py` / `094_scelta_pescato.py` | Schema + seed categorie default ("Crudi, Cotti, Insaccati") — universali |
| `102_pranzo_init.py` | Schema-only (CREATE TABLE pranzo_menu) — nessun dato seed Tre Gobbi |
| `084_cucina_mvp.py` | Schema modulo Cucina + seed checklist HACCP universali (apertura/chiusura standard) |

Tutte queste partono normalmente per qualsiasi `TRGB_LOCALE` perché i dati che inseriscono sono ragionevoli default per qualsiasi ristorante.

## Come si aggiungono nuove migrazioni TRGB-specific in futuro

Quando Marco vorrà inserire altri seed dati (es. nuove ricette, menu autunno, MEP nuovi):

```python
# In cima al file della migrazione, prima del docstring:
TRGB_SPECIFIC = True

"""
Migrazione NNN — descrizione...
"""

def upgrade(conn):
    ...
```

Una sola riga in cima. Il `migration_runner` la rileva automaticamente al boot.

**Regola pratica:** marcare TRGB_SPECIFIC se la migrazione contiene **dati specifici di Marco / Tre Gobbi** (nomi piatti reali, ingredienti del magazzino, menu pubblicati, MEP del docx). NON marcare se contiene solo schema o seed di default modificabili (categorie generiche, valori esempio universali).

In dubbio: chiedere a Marco prima di marcare.

## Verifiche fatte

- ✅ `migration_runner.py` v1.3 esteso con `_is_trgb_specific()` + skip su `TRGB_LOCALE != "tregobbi"`
- ✅ Tutte le 3 migrazioni TRGB-specific (097, 099, 100) hanno girato sul VPS osteria nei mesi scorsi (presenti in `schema_migrations` di `foodcost.db`) → **nessuna riesecuzione** nemmeno con la flag (il runner salta sempre le migrazioni già applicate)
- ✅ Sintassi Python di tutte e 4 i file modificati validata via `py_compile`
- ✅ Su `TRGB_LOCALE=tregobbi` (default) nessun cambio comportamentale: l'osteria gira come oggi
- ✅ Su `TRGB_LOCALE=trgb` (futuro deploy R4) il boot logga `⏭ Skip TRGB-specific (locale='trgb'): 097_import_mep_templates.py` e simili, e il backend parte con DB vuoti puliti

## Riferimenti

- Doc canonico refactor: `docs/refactor_monorepo.md` §3 R3
- Stato R3: `docs/refactor_monorepo.md` §6 (aggiornato a chiusura sessione)
- Disciplina commit: `[core]` perché tocca `core/app/migrations/migration_runner.py` (logica generica del runner) + tag flag su file singoli (concettualmente seed cliente)
