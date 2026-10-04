# -*- coding: utf-8 -*-
"""Testo italiano del menu ott-nov-dic 2026, trascritto da menu-ott-nov-dic-2026-web.pdf
(04-Cucina/01-Menu-Attivi, 01/10/2026).
Ordine e conteggi devono combaciare 1:1 con contenuti.py e contenuti_de_uk.py.

I tag dietetici NON stanno nei titoli: sono in TAG (titolo -> codici), con la
legenda in LEGENDA. Cosi' il seed non deve ripulire i titoli e i tag restano un dato
per il campo dedicato ancora da fare (modulo_menu_carta.md § 11.7)."""

STORIA = [
    "Questa storia comincia molto prima di noi.",
    "Comincia con una porta di ferro battuto ben più antica del 1855, l’anno che racconta "
    "la nostra fondazione. Un’insegna dipinta con la vecchia dicitura “Antica Trattoria dei "
    "Tre Gobbi”, coi tre gobbetti paffuti e sorridenti, appesa in via Broseta da quando nel "
    "cortile sostavano diligenze, carri e viaggiatori. Dietro il bancone c’era Michele "
    "Bettinelli, oste piccolo e rubicondo, amico d’infanzia del famoso compositore Gaetano "
    "Donizetti — che appena poteva tornava fin qui per una polenta come si deve e una serata "
    "tra amici veri.",
    "Dal 1855 questa insegna non ha mai smesso di accendersi. Sono passate generazioni di "
    "osti, due guerre, e Bergamo è cambiata mille volte. I tre gobbi sono sempre qui.",
    "Nel settembre del 2017 ho varcato quella porta anch’io; l’anno dopo è toccato a me. "
    "Non si “compra” un posto così: se ne diventa custodi. La promessa è semplice: materia "
    "prima delle nostre valli, ricette che parlano bergamasco e un posto dove si sta bene "
    "senza bisogno di effetti speciali. Sono l’oste e sono il cuoco — ma un’osteria non si "
    "guida solo dai fornelli, e quindi mi troverete sempre più spesso anche tra i tavoli, a "
    "raccontarvi i piatti. Con me c’è una famiglia intera, dentro e fuori dalla cucina: a "
    "partire da mamma Antonella e papà Gerry, che ogni giorno chiudono a mano i nostri "
    "casoncelli.",
]
STORIA_CHIUSA = ["Benvenuti.", "Siete a casa."]
STORIA_FIRMA = "Marco, l’oste e cuoco."
FOTO_DIDASCALIA = "L’osteria nel 1907"

SEZIONI_TITOLI = {
    "antipasti": "ANTIPASTI",
    "paste_risi_zuppe": "PASTE, RISI E ZUPPE",
    "piatti_del_giorno": "PIATTI DEL GIORNO",
    "contorni": "CONTORNI",
    "secondi": "SECONDI",
    "dolci": "DOLCI",
    "degustazioni": "DEGUSTAZIONE",
    "bambini": "MENÙ BAMBINI",
}

ANTIPASTI = [
    ("ROSA DI ZUCCA", "16",
     "Millefoglie di zucca violina e butternut, su crema di zucca hokkaido e fonduta di "
     "Taleggio DOP. Adattabile vegana."),
    ("CAPPUCCINO DI BACCALÀ E PATATA", "16",
     "Baccalà mantecato alla veneziana, spuma di patata affumicata e polvere di bottarga."),
    ("COZZE IN BLU", "16",
     "Cozze appena scottate al forno, fonduta leggera di Strachitunt, limone sotto sale ed "
     "olio al prezzemolo."),
    ("SUA MAESTÀ “LA TARAGNA”", "16",
     "Polenta cotta lentamente con burro, salvia e cinque formaggi bergamaschi: taleggio, "
     "stracchino, formai de mut, branzi e formagella."),
    ("BATTUTA DI MANZO, PORCINI E NOCCIOLA", "22",
     "Battuta di manzo al coltello condita alla moda dell’osteria, porcini spadellati, "
     "nocciole tostate con un filo d’olio di nocciola e un tuorlo al centro che lega tutto."),
    ("IL VITELLO TONNATO DELL’OSTERIA", "22",
     "Spuma di salsa tonnata fresca, fondo bruno e capperi su un meraviglioso girello di "
     "vitello cotto al punto rosa. Ispirato da Diego Rossi, e a lui dedicato."),
    ("IL SALAME DEL ROBERTO CON LA GIARDINIERA", "16",
     "Il salame che fa il Roberto, stagionato lentamente in cantina e tagliato a fette grosse, "
     "accompagnato dalle nostre verdure."),
    ("I SALUMI MISTI DELL’OSTERIA", "20", None),
    ("LE SELEZIONI DI FORMAGGI", None, None),
]
# Voce con piu' prezzi: (etichetta, prezzo). Nel cartaceo sono righe sotto il titolo.
VARIANTI = {
    "LE SELEZIONI DI FORMAGGI": [("ITALIANI (pezzi 4/6)", "14/20"),
                                 ("FRANCESI (pezzi 3/5)", "15/25")],
}

PASTE = [
    ("RISOTTO ALLO STRACCHINO ALL’ANTICA, MELA KISSABEL E SIDRO", "18",
     "Carnaroli riserva “San Massimo” sfumato al sidro, mantecato allo Stracchino all’antica "
     "delle valli orobiche, Presidio Slow Food, con la mela dalla polpa rossa come una ciliegia."),
    ("FETTUCCINE ALL’ALFREDO SE FOSSE NATO A BERGAMO", "18",
     "Pasta fresca mantecata al burro e formai de mut DOP: se le provi, non le dimentichi."),
    ("CASONCELLI DI MAMMA E PAPÀ", "18",
     "Sono proprio i genitori del nostro oste Marco: Antonella e Gerry che ogni giorno ci "
     "preparano questa leccornia con la ricetta della nostra famiglia."),
    ("FUSILLONI AL SALMÌ DI LEPRE E BRANZI", "20",
     "Fusillone Mancini condito con un sugo di lepre cotto lentamente con Valcalepio, ginepro, "
     "cannella ed anice stellato. Il tutto finito con una grattugiata generosa di Branzi "
     "giovane a mantecare."),
    ("PASTA MISTA E FAGIOLI GIALÈT", "16",
     "La “pasta dei frati” di casa nostra: i fondi delle confezioni mischiati insieme, cotti "
     "con i fagioli gialèt della Val Belluna, Presidio Slow Food, castagne arrostite e olio al "
     "rosmarino."),
    ("PIPE RIGATE, BISQUE DI GAMBERI E RISTRETTO DI MOSCATO DI SCANZO", "22",
     "Bisque concentrata fatta in casa con le teste e i carapaci dei gamberi, e un ristretto di "
     "Moscato di Scanzo DOCG, il passito rosso dei colli di Bergamo."),
    ("LASAGNETTA AL RAGÙ BIANCO DEI TRE GOBBI", "20",
     "Una cottura di tre giorni per un ragù con le carni bianche di faraona, gallina, pollo, "
     "anatra e coniglio. Succulento, generoso, buono. Chiuso in una golosissima lasagna."),
]

GIORNO = [
    ("RACCONTATI A VOCE", "da 14 a 26",
     "Come sulla lavagna dell’osteria, tutte le idee del giorno con i prodotti migliori in "
     "tiratura limitata. Possono finire subito!"),
]

CONTORNI = [
    ("POLENTA NOSTRANA", "4"),
    ("ASSAGGIO DI SUA MAESTÀ LA TARAGNA", "8"),
    ("PURÈ DI PATATE CREMOSISSIMO", "6"),
    ("PATATE ARROSTO", "6"),
    ("SPADELLATA DI VERDURE", "6"),
    ("GIARDINIERA DI VERDURE", "6"),
    ("INSALATA MISTA DI STAGIONE", "6"),
]

SECONDI = [
    ("ANATRA, BARBABIETOLA, ROSA CANINA E CAFFÈ", "26",
     "Petto d’anatra in lunga cottura, fondo al caffè della nostra moka, crema di barbabietola "
     "e agrodolce di bacche di rosa canina dei nostri colli."),
    ("FILETTO ALLA DONIZETTI", "35",
     "Filetto di manzo, il suo fondo di cottura, crema di topinambur, pera cotta nel "
     "Valcalepio, lardo che si scioglie sul filetto e tartufo nero grattato."),
    ("OSSOBUCO DI VITELLO CON PURÈ", "28",
     "Dalla tradizione lombarda l’ossobuco di vitello lungamente cotto. Servito con la tipica "
     "gremolada fatta con prezzemolo, limone e un pizzico di aglio."),
    ("VUOI UN PIATTO UNICO CON OSSOBUCO E RISOTTO GIALLO?", "35",
     "Opzione per accontentare i più golosi con il piatto completo con risotto milanese e "
     "l’ossobuco in gremolada."),
    ("GUANCETTA DI MAIALINO BRASATA E POLENTA", "24",
     "Cotta 36 ore, tenera e succulenta che profuma di vino e di casa."),
    ("CONIGLIO ALLA BERGAMASCA", "24",
     "Il coniglio come si fa nelle nostre valli: rosolato con pancetta, rosmarino e una sfumata "
     "di bianco, finito al forno. Con la polenta nostrana, ovviamente."),
    ("ROGNONE DI VITELLO TRIFOLATO CON I FUNGHI DEL BOSCO", "24",
     "Rognone di vitello saltato al momento, con aglio, prezzemolo, una sfumata di vino e i "
     "funghi che il bosco ci dà in quel momento. Servito sul purè."),
    ("PESCATO DEL GIORNO", "26", "Chiedici come l’abbiamo cucinato oggi."),
]

DOLCI = [
    ("LA PIANTINA DEL TIRAMISÙ", "10",
     "Il nostro dolce più antico in carta dal primo giorno, servito in maniera particolare. "
     "Definito da molti il miglior tiramisù mai assaggiato. Non fartelo scappare!"),
    ("CHEESECAKE AI FRUTTI DI BOSCO", "9",
     "La nostra versione di una New York Cheesecake in chiave bergamasca, dentro non troverai "
     "la Philadelphia ma un mix di formaggi freschi locali. Sopra, a dare gusto, le salse ai "
     "frutti di bosco e un coulis al lampone che produciamo noi."),
    ("TI RICORDI IL “SOLERO”?", "9",
     "Semifreddo al cocco, servito su passion fruit, tapioca esplosiva, salsa al cocco ed olio "
     "al basilico. Un dolce che ti riporterà agli anni ‘80 con il classico gelato Algida."),
    ("PANNA COTTA DELL’INGEGNER DANISI", "9",
     "La panna cotta è un classico delle Osterie, non poteva mancare tra i nostri dolci! "
     "L’abbiamo dedicata ad un nostro caro ospite che ci ha esortato più e più volte a farla, "
     "migliorando e perfezionando la ricetta fino alla versione attuale. Quasi perfetta. "
     "Sceglila alle AMARENE FABBRI, al CARAMELLO oppure al CIOCCOLATO FUSO."),
    ("“LUCIA DI LAMMERMOOR”", "10",
     "Semifreddo alla vaniglia, clementine caramellate, gel di melograno e amaretti. Per "
     "l’opera più celebre di Donizetti, che cantava Nellie Melba, la stessa della Pesca Melba, "
     "e per la nostra Santa Lucia, che la notte del 12 dicembre lascia ai bambini bergamaschi "
     "gli agrumi d’inverno."),
    ("TORTA DI NOCCIOLE, CIOCCOLATO FONDENTE E ZABAIONE AL MOSCATO DI SCANZO", "10",
     "Torta di nocciole servita tiepida, con un velo di cioccolato fondente amaro, sale in "
     "fiocchi e uno zabaione al Moscato di Scanzo montato al momento."),
]

# ── Tag dietetici, come stampati nel PDF ────────────────────────────────────
# Codici italiani; le altre lingue li rendono con la propria LEGENDA (stesso ordine).
TAG = {
    "ROSA DI ZUCCA": ["V", "NG", "OVG"],
    "CAPPUCCINO DI BACCALÀ E PATATA": ["NG"],
    "COZZE IN BLU": ["NG"],
    "SUA MAESTÀ “LA TARAGNA”": ["NG"],
    "BATTUTA DI MANZO, PORCINI E NOCCIOLA": ["NG"],
    "IL VITELLO TONNATO DELL’OSTERIA": ["NG"],
    "I SALUMI MISTI DELL’OSTERIA": ["NG"],
    "LE SELEZIONI DI FORMAGGI": ["NG"],
    "RISOTTO ALLO STRACCHINO ALL’ANTICA, MELA KISSABEL E SIDRO": ["NG", "V", "OVG"],
    "FETTUCCINE ALL’ALFREDO SE FOSSE NATO A BERGAMO": ["V"],
    "CASONCELLI DI MAMMA E PAPÀ": ["ONL"],
    "FUSILLONI AL SALMÌ DI LEPRE E BRANZI": ["ONG", "ONL"],
    "PASTA MISTA E FAGIOLI GIALÈT": ["VG", "ONG"],
    "PIPE RIGATE, BISQUE DI GAMBERI E RISTRETTO DI MOSCATO DI SCANZO": ["ONG"],
    "ANATRA, BARBABIETOLA, ROSA CANINA E CAFFÈ": ["NG", "ONL"],
    "FILETTO ALLA DONIZETTI": ["NG", "ONL"],
    "OSSOBUCO DI VITELLO CON PURÈ": ["NG"],
    "VUOI UN PIATTO UNICO CON OSSOBUCO E RISOTTO GIALLO?": ["NG"],
    "GUANCETTA DI MAIALINO BRASATA E POLENTA": ["NG"],
    "CONIGLIO ALLA BERGAMASCA": ["NG"],
    "ROGNONE DI VITELLO TRIFOLATO CON I FUNGHI DEL BOSCO": ["NG"],
    "PESCATO DEL GIORNO": ["NG"],
    "LA PIANTINA DEL TIRAMISÙ": ["NG"],
    "CHEESECAKE AI FRUTTI DI BOSCO": ["NG"],
    "TI RICORDI IL “SOLERO”?": ["NG", "NL"],
    "PANNA COTTA DELL’INGEGNER DANISI": ["NG"],
    "“LUCIA DI LAMMERMOOR”": ["NG"],
    "TORTA DI NOCCIOLE, CIOCCOLATO FONDENTE E ZABAIONE AL MOSCATO DI SCANZO": ["NG"],
}
# Ordine canonico dei codici (= ordine delle righe di LEGENDA in tutte le lingue)
CODICI_TAG = ["V", "VG", "NG", "NL", "ONL", "OV", "OVG", "ONG"]
LEGENDA = [
    ("V", "VEGETARIANO"),
    ("VG", "VEGANO"),
    ("NG", "NO GLUTINE"),
    ("NL", "NO LATTOSIO"),
    ("ONL", "OPZIONE NO LATTOSIO"),
    ("OV", "OPZIONE VEGETARIANA"),
    ("OVG", "OPZIONE VEGANA"),
    ("ONG", "OPZIONE NO GLUTINE"),
]

BAMBINI_TITOLO = "MENÙ BAMBINI"
BAMBINI_SOTTO = "DISPONIBILE SU RICHIESTA."
BAMBINI_RIGHE = [("PRIMO PIATTO", "10 EURO"), ("SECONDO PIATTO", "15 EURO")]
ALLERGENI = "IL NOSTRO PERSONALE È PREPARATO A RISPONDERVI SU ALLERGENI ED INTOLLERANZE."
BEVANDE = [
    ("TÈ E TISANE", "10", None),
    ("ESPRESSO", "3", None),
    ("MOKA “PUMP”", "10", "DEGUSTAZIONE PER DUE"),
    ("ACQUA", "3", None),
    ("COPERTO", "5", None),
]

DEG_TITOLO = "DEGUSTAZIONE"
DEG1_SOTTO = "“Prima volta”"
DEG1_INTRO = ("Per la prima volta nella nostra osteria ti consigliamo di assaggiare il meglio "
              "della cucina Bergamasca nella nostra interpretazione! Il metodo migliore per "
              "conoscerci.")
DEG1_ITEMS = ["ANTIPASTO MISTO DELL’OSTERIA", "CASONCELLI DI MAMMA E PAPÀ",
              "CONIGLIO O GUANCETTA a tua scelta", "DOLCE A SCELTA"]
DEG1_PREZZO = "60"

DEG2_SOTTO = "“Fidati dell’oste”"
DEG2_INTRO = ("I piatti consigliati dall’Oste, quelli che rappresentano la stagione ed il "
              "momento. Molto spesso con variazioni raccontate a voce.")
# Come nel PDF: il risotto compare in forma breve (senza "SIDRO").
DEG2_ITEMS = ["BATTUTA DI MANZO, PORCINI E NOCCIOLA", "ROSA DI ZUCCA",
              "RISOTTO ALLO STRACCHINO ALL’ANTICA E MELA KISSABEL",
              "ANATRA, BARBABIETOLA, ROSA CANINA E CAFFÈ", "DOLCE A SCELTA"]
DEG2_PREZZO = "75"
# Voci di DEG2_ITEMS scritte diversamente dal titolo in carta: voce -> titolo in carta
DEG2_ALIAS = {
    "RISOTTO ALLO STRACCHINO ALL’ANTICA E MELA KISSABEL":
        "RISOTTO ALLO STRACCHINO ALL’ANTICA, MELA KISSABEL E SIDRO",
}

DEG_NOTE = ("Le degustazioni sono da considerarsi per tutto il tavolo. Fatte salve allergie e "
            "intolleranze, per le quali proporremo alternative.")
