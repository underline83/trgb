"""
Migrazione 097 — Importazione 5 template Mise en place per partita
(sessione 57 — 2026-04-25)

Contesto:
  Dopo l'analisi del menu Primavera 2026 e la stesura del docx
  Checklist_Cucina_Primavera_2026.docx, abbiamo deciso di NON tenere il docx
  come materiale cartaceo statico, ma di importare le checklist dentro il
  modulo Cucina HACCP esistente (tasks.sqlite3, sessione 43, mig 084).

  Il docx ha due parti:
    - Parte 1: 5 mise en place per partita (Basi & Fondi, Antipasti, Primi,
      Secondi, Contorni) + chiusura cucina trasversale.
    - Parte 2: schede piatto (vivranno nel modulo Menu Carta, non qui).

  Questa migrazione importa la Parte 1 come 5 nuovi `checklist_template`
  con i loro `checklist_item`. Tutti CHECKBOX (le temperature HACCP
  restano nei template apertura/chiusura esistenti, non nei MEP).

  La chiusura cucina trasversale del docx duplicherebbe i template HACCP
  gia' presenti dalla 084 ("Chiusura cucina"), quindi NON viene importata.

Comportamento:
  - Tutti i template sono creati con `attivo = 0` di default. Marco li
    attiva uno per uno da Impostazioni Cucina quando vuole metterli in
    produzione.
  - turno = 'APERTURA' per tutti (vanno fatti la mattina prima del servizio
    pranzo).
  - Basi & Fondi ha scadenza 09:00 (vanno preparati per primi). MEP
    Antipasti / Primi / Secondi / Contorni hanno scadenza 11:30 (un'ora
    prima dell'apertura sala pranzo).
  - reparto = 'cucina' per tutti.
  - livello_cucina = NULL (visibile a tutta la brigata; chef puo' poi
    restringere se vuole).

Idempotenza:
  Per ogni template controlla `SELECT id FROM checklist_template WHERE
  nome = ?`. Se esiste skippa. Quindi rilanciabile senza danni.

Riferimenti:
  - app/migrations/084_cucina_mvp.py (schema e pattern seed originario)
  - docs/modulo_cucina.md
  - Checklist_Cucina_Primavera_2026.docx (sorgente delle voci)
"""

import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]  # app/
TASKS_DB = BASE_DIR / "data" / "tasks.sqlite3"


# ─────────────────────────────────────────────────────────────────────────
# Helper: shortcut per costruire un item CHECKBOX
# ─────────────────────────────────────────────────────────────────────────
def cb(titolo: str, obbligatorio: bool = True, note: str | None = None) -> dict:
    return {
        "titolo": titolo,
        "tipo": "CHECKBOX",
        "obbligatorio": obbligatorio,
        "min_valore": None,
        "max_valore": None,
        "unita_misura": None,
        "note": note,
    }


# ─────────────────────────────────────────────────────────────────────────
# I 5 TEMPLATE
# ─────────────────────────────────────────────────────────────────────────
TEMPLATES: list[dict] = [
    # ─────────────────────────────────────────────────────
    # 1. BASI & FONDI — sera prima / arrivo mattina
    # ─────────────────────────────────────────────────────
    {
        "nome": "MEP · Basi & Fondi",
        "reparto": "cucina",
        "frequenza": "GIORNALIERA",
        "turno": "APERTURA",
        "ora_scadenza_entro": "09:00",
        "livello_cucina": None,
        "note": "Cottura lunga / sera prima / fondi e salse base / polente / pasta fresca / verifica scorte critiche.",
        "items": [
            # ─── Cottura lunga / sera prima ───
            cb("Brasato di manzo — cottura una notte intera, controllo cottura mattino, fondo separato e ridotto"),
            cb("Ragù di cortile — cottura 3 giorni (faraona / gallina / pollo / anatra / coniglio)"),
            cb("Ossobuco di vitello — già in cottura lunga, controllare gel del fondo"),
            cb("Arrosto di coniglio disossato e arrotolato — pre-arrostito o pronto da rifinire"),
            cb("Baccalà mantecato alla veneziana — preparato e raffreddato in mantecatura"),
            cb("Vitello girello — cottura al rosa, raffreddato e pronto da affettare al momento"),
            # ─── Fondi e salse base ───
            cb("Fondo bruno — pronto, ridotto, in pentola al passe"),
            cb("Fondo al Valcalepio rosso — per Filetto Donizetti"),
            cb("Crema di fegatini di coniglio al burro di malga — per Filetto Donizetti"),
            cb("Salsa olandese 63° al tuorlo — per la Tartare (in giornata, bagno termostatato)"),
            cb("Salsa tonnata fresca — per Vitello Tonnato (montata, in sac à poche)"),
            cb("Spuma di patata affumicata — per cappuccino di baccalà"),
            cb("Fondutina di taleggio — per tegamino asparagi"),
            cb("Pesto di aglio orsino — fresco, conservato in olio (per pasta mista)"),
            cb("Crema di caprino — per pasta mista"),
            cb("Mentuccia tritata + pecorino grattato — per Vignarola"),
            cb("Gremolada — prezzemolo + scorza limone + aglio (per ossobuco)"),
            cb("Limone salato — verifica scorta (per pasta mista)"),
            # ─── Polente ───
            cb("Polenta nostrana — partita, in cottura lenta"),
            cb("Polenta taragna — cottura lenta con burro, salvia e 5 formaggi (taleggio, stracchino, formai de mut, branzi, formagella)"),
            # ─── Pasta fresca ───
            cb("Fettuccine — tirate al mattino, infarinate"),
            cb("Casoncelli — verificare con Antonella e Gerry (ricetta famiglia)"),
            cb("Lasagna — sfoglie pronte, montaggio teglie con ragù di cortile"),
            # ─── Verifiche scorte critiche ───
            cb("Asparagi — verifica varietà disponibili (verdi, bianchi, selvatici)"),
            cb("Carciofi / fave / piselli — pulizia e abbattimento per Vignarola"),
            cb("Agretti — pulizia e mondatura"),
            cb("Spugnole primaverili — verifica qualità e disponibilità per Filetto Donizetti", obbligatorio=False),
            cb("Erba orsina / aglio orsino — verifica fornitura"),
            cb("Sarda di Montisola — porzionata e pronta da sbriciolare"),
            cb("Carne tartare — controllo lotto, taglio al coltello al momento ordine"),
            cb("Bottarga — polvere pronta in dispenser (per cappuccino baccalà)"),
            cb("Formaggi italiani — selezione 4-6 pezzi attivi"),
            cb("Formaggi francesi — selezione 3-5 pezzi attivi"),
        ],
    },

    # ─────────────────────────────────────────────────────
    # 2. MEP ANTIPASTI
    # ─────────────────────────────────────────────────────
    {
        "nome": "MEP · Partita Antipasti",
        "reparto": "cucina",
        "frequenza": "GIORNALIERA",
        "turno": "APERTURA",
        "ora_scadenza_entro": "11:30",
        "livello_cucina": None,
        "note": "8 voci a menu Primavera 2026. Postazione fredda + 1 fuoco per tegamino e taragna calda.",
        "items": [
            # ─── Pre-servizio ───
            cb("Tagliere salumi pulito, coltello affilato, carta forno pronta"),
            cb("Tagliere formaggi pulito, marmellate / miele / confetture in pirottini"),
            cb("Mestoli per la fondutina taleggio caldi"),
            cb("Sac à poche per spuma patata affumicata + ricarica bombolina"),
            cb("Sac à poche per spuma tonnata fresca + ricarica bombolina"),
            cb("Salsa olandese 63° in bagno termostatato (controllo temperatura)"),
            cb("Carne tartare porzionata cruda (pulita da nervi e grasso) + coltello da tartare affilato"),
            cb("Acciughe del Cantabrico pre-porzionate per le tartare"),
            cb("Tegamini in ghisa puliti e oliati (per asparagi-uovo e taragna)"),
            cb("Cinque formaggi bergamaschi pre-pesati per ogni porzione di taragna"),
            cb("Asparagi spadellati al burro pronti (rifinire al momento)"),
            cb("Uova fondenti 63° in bagno termostatato"),
            cb("Bottarga in dispenser polvere"),
            cb("Giardiniera della casa porzionata"),
            cb("Salame del Roberto in cantina, taglio a fette grosse al momento"),
            # ─── Durante servizio ───
            cb("Controllo temperatura banchi freddi ogni 2 ore (HACCP)"),
            cb("Mantenimento bagno termostatato uova 63° / olandese"),
            cb("Reset taglieri e coltelli tra una mandata e l'altra"),
            # ─── Fine servizio ───
            cb("Abbattimento salse non finite, etichetta data + responsabile"),
            cb("Coperture cling su tutti i contenitori"),
            cb("Pulizia bagno termostatato + svuotamento acqua"),
            cb("Tagliere salumi e formaggi sanificati"),
            cb("Inventario corto: cosa va riordinato per domani"),
        ],
    },

    # ─────────────────────────────────────────────────────
    # 3. MEP PRIMI (Paste, risi e zuppe)
    # ─────────────────────────────────────────────────────
    {
        "nome": "MEP · Partita Primi (Paste, risi e zuppe)",
        "reparto": "cucina",
        "frequenza": "GIORNALIERA",
        "turno": "APERTURA",
        "ora_scadenza_entro": "11:30",
        "livello_cucina": None,
        "note": "6 voci a menu: 1 risotto, 3 paste, 1 lasagna monoporzione, 1 zuppa-trippa. 2 fuochi mantecatura + fuoco risotto + forno lasagnetta.",
        "items": [
            # ─── Pre-servizio ───
            cb("Risotto Vignarola: brodo verdure pronto bollente, riso Carnaroli S.M. pesato per coperto, mentuccia tritata, pecorino grattato, fave/piselli/asparagi/carciofi sbianciati e abbattuti"),
            cb("Fettuccine Alfredo: pasta fresca tirata, formai de mut DOP grattato, burro di malga porzionato"),
            cb("Casoncelli: contati e disposti su vassoi infarinati, burro / salvia / pancetta croccante per mantecatura"),
            cb("Lasagnette: monoporzioni montate in pirofila singola, ragù di cortile distribuito, besciamella pronta — solo da gratinare al momento"),
            cb("Pasta mista: pasta secca rustica pesata, sarda di Montisola sbriciolata, limone salato a tocchetti, crema caprino in pipetta"),
            cb("Trippa dell'Oste: minestrone primaverile pronto, parmigiano abbondante in cassetta, pepe nero al mulinello"),
            cb("Pentole acqua salata in bollore, schiumarole, mestoli a porzione"),
            cb("Padelle alte per mantecatura — almeno 2 pulite e calde"),
            # ─── Durante servizio ───
            cb("Tempi cottura cronometrati (risotto 16-18', fettuccine al dente, casoncelli 3-4')"),
            cb("Mantecatura aggressiva, aggiunta acqua cottura per cremosità"),
            cb("Controllo sale risotto in dirittura"),
            # ─── Fine servizio ───
            cb("Brodo cottura risotto: scartare, lavaggio pentola"),
            cb("Pasta fresca avanzata: abbattimento o scarto secondo politica osteria"),
            cb("Lasagnette non gratinate: abbattere, etichettare data"),
            cb("Inventario veloce: porzioni casoncelli / fettuccine / lasagnette per domani"),
        ],
    },

    # ─────────────────────────────────────────────────────
    # 4. MEP SECONDI
    # ─────────────────────────────────────────────────────
    {
        "nome": "MEP · Partita Secondi",
        "reparto": "cucina",
        "frequenza": "GIORNALIERA",
        "turno": "APERTURA",
        "ora_scadenza_entro": "11:30",
        "livello_cucina": None,
        "note": "7 voci (compresa combo ossobuco+risotto giallo). Carni rosse + bianche + un pesce. 2 fuochi alti + grill + forno + bagno termostatato BT.",
        "items": [
            # ─── Pre-servizio ───
            cb("Faraona petto BT: porzionato, sottovuoto, in roner a temperatura target"),
            cb("Faraona contorno: carote tornite al burro pronte, fondo senape antica + miele"),
            cb("Filetto alla Donizetti: filetti porzionati 180-200g, crema fegatini in pipetta, spugnole pronte da saltare, fondo Valcalepio ridotto"),
            cb("Ossobuco: porzionato (legato), gremolada FRESCA in pirottino, purè in sac à poche caldo"),
            cb("Ossobuco + Risotto Milanese: brodo carne pronto, zafferano in infusione, midollo pronto"),
            cb("Brasato manzo: porzionato a fette grosse, fondo cottura ridotto in salsiera"),
            cb("Coniglio disossato e arrotolato: porzionato, agretti freschi mondati, fondo coniglio pronto"),
            cb("Pescato del giorno: verifica con cuoco / oste cosa è arrivato, decidere taglio + cottura del giorno"),
            cb("Polenta nostrana e taragna pronte e calde per accompagnamento"),
            cb("Padelle alte e tegamini in ghisa caldi e oliati"),
            cb("Bagno termostatato faraona: controllo temperatura"),
            # ─── Durante servizio ───
            cb("Cronometro su BT faraona (rinvenimento ~8' a temperatura, pelle croccante in padella)"),
            cb("Filetto: cottura A RICHIESTA cliente (rare/medium-rare/medium/well-done), riposo 2'"),
            cb("Controllo temperatura interna BT carne (sonda)"),
            cb("Mantenimento gremolada profumata (rifare se appassisce)"),
            # ─── Fine servizio ───
            cb("Sottovuoti BT non aperti: refrigerati, etichetta data confezionamento"),
            cb("Fondi: rabbocco / scarto secondo politica"),
            cb("Spugnole avanzate: abbattimento o scarto"),
            cb("Pulizia roner / bagno termostatato"),
        ],
    },

    # ─────────────────────────────────────────────────────
    # 5. MEP CONTORNI
    # ─────────────────────────────────────────────────────
    {
        "nome": "MEP · Partita Contorni",
        "reparto": "cucina",
        "frequenza": "GIORNALIERA",
        "turno": "APERTURA",
        "ora_scadenza_entro": "11:30",
        "livello_cucina": None,
        "note": "6 voci a menu, prep semplice ma volumi alti. Postazione condivisa con primi/secondi, ma linea autonoma.",
        "items": [
            # ─── Pre-servizio ───
            cb("Polenta nostrana: in pentolone basso, grattando il fondo regolarmente"),
            cb("Assaggio taragna: pirottini monoporzione pronti caldi"),
            cb("Patate arrosto: tagliate, sbianciate, pronte per teglia di rifinitura (rosmarino + sale grosso)"),
            cb("Spadellata verdure stagione: verdure di stagione (asparagi, taccole, fave fresche, primizie) pulite e porzionate"),
            cb("Giardiniera della casa: vasi sotto'aceto, controllo livello + estetica vaso vetro"),
            cb("Insalata mista: foglie lavate e centrifugate, vinaigrette pronta a parte, semi / erbe a guarnizione"),
            cb("Olio EVO buono per finire, sale Maldon, pepe nero al mulinello"),
            # ─── Durante servizio ───
            cb("Patate: rotazione teglie ogni 8-10 minuti per averne sempre di calde"),
            cb("Spadellata: cottura al momento, niente massa pre-cotta"),
            # ─── Fine servizio ───
            cb("Verdure pulite avanzate: sottovuoto + abbattimento + etichetta"),
            cb("Polenta: chiusa sotto cling, abbattuta"),
        ],
    },
]


# ─────────────────────────────────────────────────────────────────────────
# upgrade()
# ─────────────────────────────────────────────────────────────────────────
def upgrade(conn: sqlite3.Connection) -> None:
    """
    Migration runner passa `conn` di foodcost.db. I template vivono pero' in
    tasks.sqlite3 (modulo Cucina HACCP), quindi apriamo quel DB a parte.
    """
    if not TASKS_DB.exists():
        print("  · tasks.sqlite3 non esiste ancora, skip (la 084_cucina_mvp non e' stata applicata)")
        return

    cu = sqlite3.connect(TASKS_DB)
    try:
        cu.execute("PRAGMA foreign_keys = ON")
        cur = cu.cursor()

        creati = 0
        skippati = 0
        items_totali = 0

        for tmpl in TEMPLATES:
            # Idempotenza: skip se esiste gia' un template con lo stesso nome
            existing = cur.execute(
                "SELECT id FROM checklist_template WHERE nome = ?",
                (tmpl["nome"],),
            ).fetchone()
            if existing:
                print(f"  · skip '{tmpl['nome']}' (gia' presente, id={existing[0]})")
                skippati += 1
                continue

            # INSERT template
            cur.execute(
                """
                INSERT INTO checklist_template
                    (nome, reparto, frequenza, turno, ora_scadenza_entro,
                     attivo, livello_cucina, note, created_by)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'mig_097')
                """,
                (
                    tmpl["nome"],
                    tmpl["reparto"],
                    tmpl["frequenza"],
                    tmpl["turno"],
                    tmpl["ora_scadenza_entro"],
                    tmpl["livello_cucina"],
                    tmpl.get("note"),
                ),
            )
            tmpl_id = cur.lastrowid

            # INSERT items
            for ordine, item in enumerate(tmpl["items"]):
                cur.execute(
                    """
                    INSERT INTO checklist_item
                        (template_id, ordine, titolo, tipo, obbligatorio,
                         min_valore, max_valore, unita_misura, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        tmpl_id,
                        ordine,
                        item["titolo"],
                        item["tipo"],
                        1 if item.get("obbligatorio", True) else 0,
                        item.get("min_valore"),
                        item.get("max_valore"),
                        item.get("unita_misura"),
                        item.get("note"),
                    ),
                )
                items_totali += 1

            creati += 1
            print(f"  + creato '{tmpl['nome']}' (id={tmpl_id}, {len(tmpl['items'])} item)")

        cu.commit()
        print(f"  [097] {creati} template creati, {skippati} skippati, {items_totali} item totali")
    finally:
        cu.close()
