# Modulo: clienti
# ⚠️ TRGB_SPECIFIC — dati dell'osteria di Marco (gift card storiche Tre Gobbi).
# Saltata dal migration_runner quando TRGB_LOCALE != "tregobbi".
TRGB_SPECIFIC = True

"""
Migrazione 167 — Import one-shot delle gift card storiche — [locale:tregobbi]

CONTESTO:
  Fino ad agosto 2026 i buoni regalo dell'osteria erano tenuti in un Excel
  compilato a mano dal dicembre 2021 (`gift-card-lista.xlsx`, 174 righe).
  Il modulo Gift Card (CL.15) sostituisce quel file: questa migrazione porta
  dentro lo storico UNA VOLTA SOLA. Non esiste (per scelta di Marco) una
  funzione di import nel prodotto: era un travaso, non una feature.

COSA ENTRA — 90 righe su 174, selezionate con queste regole (decise da Marco
il 2026-08-08 guardando il file riga per riga):

  1. L'anno si legge dal CODICE, non dalla colonna Data. I codici seguono lo
     schema <lettera>1<AA>-<progressivo> (`A125-330` = serie 2025). Serve
     perche' la serie A124 e' stata aperta a dicembre 2023 per i regali di
     Natale: 26 buoni hanno data 2023 ma appartengono alla stagione 2024.
     Filtrando per data si sarebbero persi 18 buoni ancora attivi (3.535 €).
  2. Soglia 2024: il precedente resta nell'Excel (46 righe escluse).
  3. Importo obbligatorio: dalla colonna, o dedotto dalla descrizione
     (`deg 130` → 130 €, 9 casi). Senza importo la riga non entra: una card
     senza valore non e' verificabile al banco (35 righe escluse, per lo piu'
     "BOX" o celle vuote).
  4. Codici doppi: vince l'importo piu' alto, l'altra riga finisce nelle note
     (1 caso, A125-330: tenuti 180 €, scartati 130 €).
  5. Senza scadenza, come erano nell'Excel.

  Escluse anche 1 riga senza codice e 1 (N191) senza anno determinabile.

RISULTATO ATTESO: 90 card — 74 attive per 12.825 €, 16 gia' usate.

IDEMPOTENTE: salta i codici gia' presenti (confronto sulla forma
normalizzata, senza trattini ne' maiuscole). Rieseguire non duplica e non
sovrascrive: se una card e' stata nel frattempo scaricata o corretta a mano
dalla UI, quel lavoro resta.

DB COLPITO: clienti.sqlite3 (locale-aware). Solo INSERT, nessun ALTER.
Le tabelle sono create da init_clienti_db() al boot; se non ci sono ancora,
la migrazione esce senza fare nulla.
"""

import sqlite3

from app.utils.locale_data import locale_data_path


def _norm(codice: str) -> str:
    return "".join(ch for ch in (codice or "").upper() if ch.isalnum())


# Dati estratti dall'Excel storico il 2026-08-08. `nota_import` conserva il
# perche' di ogni interpretazione (importo dedotto, data incoerente col
# codice, riga doppia scartata) e finisce nel movimento di import.
GIFT_CARD = [
    {'codice': 'A124-200', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': '2 DEG', 'stato': 'usata', 'data_emissione': '2023-10-06', 'data_utilizzo': '2023-12-28', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 53)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-201', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': '2 DEG 5 + ABBINAMENTO VINO', 'stato': 'usata', 'data_emissione': '2023-12-03', 'data_utilizzo': '2024-03-22', 'emessa_da': 'MARCO', 'note': "Importata dall'Excel storico (riga 54)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-202', 'tipo': 'esperienza', 'importo': 360.0, 'descrizione': '2 degustazioni NUOVO RISTORANTE + vino', 'stato': 'attiva', 'data_emissione': '2023-12-12', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 55)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-206', 'tipo': 'esperienza', 'importo': 140.0, 'descrizione': 'no vini', 'stato': 'attiva', 'data_emissione': '2023-12-17', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 59)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-207', 'tipo': 'esperienza', 'importo': 220.0, 'descrizione': 'DEG 5 + VINO', 'stato': 'usata', 'data_emissione': '2023-12-15', 'data_utilizzo': '2024-02-17', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 60)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-209', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'DEG 5 + VINO', 'stato': 'attiva', 'data_emissione': '2023-12-21', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 62)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-210', 'tipo': 'esperienza', 'importo': 280.0, 'descrizione': 'deg 2 + vini', 'stato': 'attiva', 'data_emissione': '2023-12-22', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 63)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-211', 'tipo': 'esperienza', 'importo': 170.0, 'descrizione': '3 piatti a scelta + vini abbinati', 'stato': 'attiva', 'data_emissione': '2023-12-17', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 64)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-212', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG 5 PIU 76€ ABBINAMENTO', 'stato': 'attiva', 'data_emissione': '2023-12-21', 'data_utilizzo': None, 'emessa_da': None, 'note': "colonna Utente conteneva una data: 2024-09-10 00:00:00 · Importata dall'Excel storico (riga 65)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-213', 'tipo': 'esperienza', 'importo': 220.0, 'descrizione': 'DEG 5 PIU 70€ ABBINAMENTO', 'stato': 'usata', 'data_emissione': '2023-12-15', 'data_utilizzo': '2024-02-12', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 66)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-215', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG 5 PIU 70€ ABBINAMENTO', 'stato': 'usata', 'data_emissione': '2023-12-18', 'data_utilizzo': '2024-06-15', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 68)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-216', 'tipo': 'esperienza', 'importo': 170.0, 'descrizione': 'DEG 7 PORTATE', 'stato': 'usata', 'data_emissione': '2023-12-15', 'data_utilizzo': '2024-06-25', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 69)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-217', 'tipo': 'valore', 'importo': 210.0, 'descrizione': None, 'stato': 'attiva', 'data_emissione': '2023-12-15', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 70)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-218', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 7 PORTATE', 'stato': 'attiva', 'data_emissione': '2023-12-18', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 71)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-219', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG 5 con vino', 'stato': 'usata', 'data_emissione': '2023-12-19', 'data_utilizzo': '2024-12-27', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 72)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-220', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG 5 con vino', 'stato': 'attiva', 'data_emissione': '2023-12-19', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 73)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-221', 'tipo': 'valore', 'importo': 210.0, 'descrizione': None, 'stato': 'usata', 'data_emissione': '2023-12-21', 'data_utilizzo': '2024-03-27', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 74)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-222', 'tipo': 'esperienza', 'importo': 140.0, 'descrizione': 'deg 3', 'stato': 'usata', 'data_emissione': '2023-12-21', 'data_utilizzo': '2024-02-16', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 75)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-223', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG5 +', 'stato': 'attiva', 'data_emissione': '2023-12-23', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 76)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-224', 'tipo': 'esperienza', 'importo': 170.0, 'descrizione': 'deg 5', 'stato': 'attiva', 'data_emissione': '2023-12-29', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 77)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-225', 'tipo': 'esperienza', 'importo': 170.0, 'descrizione': 'DEG 5 + 2 CALICI', 'stato': 'usata', 'data_emissione': '2023-12-22', 'data_utilizzo': '2024-03-22', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 78)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-226', 'tipo': 'esperienza', 'importo': 155.0, 'descrizione': 'deg3 + 1 vino', 'stato': 'attiva', 'data_emissione': '2023-12-23', 'data_utilizzo': None, 'emessa_da': 'CLARA', 'note': "Importata dall'Excel storico (riga 79)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-227', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'DEGUSTAZIONE GOURMANTICO', 'stato': 'attiva', 'data_emissione': '2024-12-22', 'data_utilizzo': None, 'emessa_da': None, 'note': "riferimento in colonna Utente: 3475168830 · Importata dall'Excel storico (riga 80)", 'nota_import': None},
    {'codice': 'A124-228', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG5 + ABBINAMENTO', 'stato': 'usata', 'data_emissione': '2023-12-23', 'data_utilizzo': '2024-04-25', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 81)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-229', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG5 + ABBINAMENTO', 'stato': 'attiva', 'data_emissione': '2023-12-23', 'data_utilizzo': None, 'emessa_da': None, 'note': "colonna Utente conteneva una data: 2024-10-25 00:00:00 · Importata dall'Excel storico (riga 82)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-233', 'tipo': 'esperienza', 'importo': 170.0, 'descrizione': 'deg 5', 'stato': 'attiva', 'data_emissione': '2024-01-01', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 84)", 'nota_import': 'data di emissione non nota, messo 01/01/2024 (anno del codice)'},
    {'codice': 'A124-234', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 7', 'stato': 'attiva', 'data_emissione': '2023-01-21', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 85)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-235', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'deg5 + vini', 'stato': 'attiva', 'data_emissione': '2023-01-22', 'data_utilizzo': None, 'emessa_da': None, 'note': "colonna Utente conteneva una data: 2024-02-16 00:00:00 · Importata dall'Excel storico (riga 86)", 'nota_import': 'il codice dice 2024, la data dice 2023: vale il codice'},
    {'codice': 'A124-236', 'tipo': 'valore', 'importo': 170.0, 'descrizione': None, 'stato': 'attiva', 'data_emissione': '2024-01-01', 'data_utilizzo': None, 'emessa_da': 'ASILO', 'note': "Importata dall'Excel storico (riga 87)", 'nota_import': "data '29/02/2023' non valida, ignorata · data di emissione non nota, messo 01/01/2024 (anno del codice)"},
    {'codice': 'A124-237', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-07', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 88)", 'nota_import': None},
    {'codice': 'A124-238', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-07', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 89)", 'nota_import': None},
    {'codice': 'A124-239', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-07', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 90)", 'nota_import': None},
    {'codice': 'A124-240', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 91)", 'nota_import': None},
    {'codice': 'A124-241', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 92)", 'nota_import': None},
    {'codice': 'A124-242', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 93)", 'nota_import': None},
    {'codice': 'A124-243', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 94)", 'nota_import': None},
    {'codice': 'A124-244', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 95)", 'nota_import': None},
    {'codice': 'A124-245', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 96)", 'nota_import': None},
    {'codice': 'A124-246', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 97)", 'nota_import': None},
    {'codice': 'A124-247', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 98)", 'nota_import': None},
    {'codice': 'A124-248', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 99)", 'nota_import': None},
    {'codice': 'A124-249', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEG 5 + ABBINAMENTO VINI SOFT', 'stato': 'attiva', 'data_emissione': '2024-03-08', 'data_utilizzo': None, 'emessa_da': 'ragazze costez', 'note': "Importata dall'Excel storico (riga 100)", 'nota_import': None},
    {'codice': 'A124-250', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'Deg 5', 'stato': 'attiva', 'data_emissione': '2024-03-19', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 101)", 'nota_import': None},
    {'codice': 'A124-251', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'Deg 5', 'stato': 'attiva', 'data_emissione': '2024-03-19', 'data_utilizzo': None, 'emessa_da': None, 'note': "colonna Utente conteneva una data: 2024-08-22 00:00:00 · Importata dall'Excel storico (riga 102)", 'nota_import': None},
    {'codice': 'A124-252', 'tipo': 'valore', 'importo': 220.0, 'descrizione': None, 'stato': 'attiva', 'data_emissione': '2024-04-29', 'data_utilizzo': None, 'emessa_da': None, 'note': "colonna Descrizione conteneva una data: 2023-09-14 00:00:00 · Importata dall'Excel storico (riga 103)", 'nota_import': None},
    {'codice': 'A124-253', 'tipo': 'esperienza', 'importo': 180.0, 'descrizione': 'deg 5 + 3 calici x 1 persona', 'stato': 'attiva', 'data_emissione': '2024-05-19', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 104)", 'nota_import': None},
    {'codice': 'A124-254', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': "ACCONTO PER DEGUSTAZIONE 2 PERSONE ARRIVERà UNA TERZA E' TUTTO PAGATO SA GIUSEPPE", 'stato': 'attiva', 'data_emissione': '2024-01-01', 'data_utilizzo': None, 'emessa_da': None, 'note': "riferimento in colonna Utente: 3667310320 · Importata dall'Excel storico (riga 105)", 'nota_import': 'data di emissione non nota, messo 01/01/2024 (anno del codice)'},
    {'codice': 'A124-255', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'DEGUSTAZIONE PER 2', 'stato': 'attiva', 'data_emissione': '2024-06-24', 'data_utilizzo': None, 'emessa_da': None, 'note': "colonna Utente: RIF. 6B7F622AE5CB · Importata dall'Excel storico (riga 106)", 'nota_import': None},
    {'codice': 'A124-256', 'tipo': 'esperienza', 'importo': 120.0, 'descrizione': 'degustazione per 2 limited', 'stato': 'attiva', 'data_emissione': '2024-09-16', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 107)", 'nota_import': None},
    {'codice': 'A124-257', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'degustazione 75 +. 3 vini', 'stato': 'attiva', 'data_emissione': '2024-09-28', 'data_utilizzo': None, 'emessa_da': None, 'note': "colonna Utente: RIF. 22E6D5FEB2A3 · Importata dall'Excel storico (riga 108)", 'nota_import': None},
    {'codice': 'A124-258', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'DEGUSTAZIONI 75', 'stato': 'attiva', 'data_emissione': '2024-10-13', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 109)", 'nota_import': None},
    {'codice': 'A124-259', 'tipo': 'esperienza', 'importo': 200.0, 'descrizione': 'DEGUSTAZIONI 75x2 + 50€ vino', 'stato': 'attiva', 'data_emissione': '2024-10-14', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 110)", 'nota_import': None},
    {'codice': 'A124-260', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'DEGUSTAZIONE 75X2', 'stato': 'attiva', 'data_emissione': '2024-10-18', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 111)", 'nota_import': None},
    {'codice': 'A124-261', 'tipo': 'esperienza', 'importo': 200.0, 'descrizione': 'DEGUSTAZIONI 75x2 + 50€ vino', 'stato': 'attiva', 'data_emissione': '2024-10-28', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 112)", 'nota_import': None},
    {'codice': 'A124-262', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEGUSTAZIONE 75 + 2 ABBINAMENTI VINO', 'stato': 'attiva', 'data_emissione': '2024-11-16', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 113)", 'nota_import': None},
    {'codice': 'A124-266', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEGUSTAZIONE 75 + 2 ABBINAMENTI VINO', 'stato': 'attiva', 'data_emissione': '2024-12-19', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 117)", 'nota_import': None},
    {'codice': 'A124-267', 'tipo': 'esperienza', 'importo': 160.0, 'descrizione': '7 PORTATE', 'stato': 'attiva', 'data_emissione': '2025-02-17', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 118)", 'nota_import': 'il codice dice 2024, la data dice 2025: vale il codice'},
    {'codice': 'A124-271', 'tipo': 'esperienza', 'importo': 140.0, 'descrizione': 'deg 2 px', 'stato': 'attiva', 'data_emissione': '2024-11-15', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 122)", 'nota_import': None},
    {'codice': 'A124-272', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'degustazione con vini', 'stato': 'attiva', 'data_emissione': '2024-11-16', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 123)", 'nota_import': None},
    {'codice': 'A124-273', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEGUSTAZIONE 75 + 2 ABBINAMENTI VINO', 'stato': 'attiva', 'data_emissione': '2024-12-14', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 124)", 'nota_import': None},
    {'codice': 'A124-274', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEGUSTAZIONE 75 + 2 ABBINAMENTI VINO', 'stato': 'attiva', 'data_emissione': '2024-12-14', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 125)", 'nota_import': None},
    {'codice': 'A124-275', 'tipo': 'esperienza', 'importo': 220.0, 'descrizione': 'DEGUSTAZIONE 75 + 2 ABBINAMENTI VINO', 'stato': 'attiva', 'data_emissione': '2024-12-23', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 126)", 'nota_import': None},
    {'codice': 'A124-277', 'tipo': 'esperienza', 'importo': 235.0, 'descrizione': 'DEGUSTAZIONE 95 + 3 calici + 1calice', 'stato': 'attiva', 'data_emissione': '2024-12-14', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 128)", 'nota_import': None},
    {'codice': 'A124-278', 'tipo': 'esperienza', 'importo': 190.0, 'descrizione': 'DEGUSTAZIONE 95', 'stato': 'attiva', 'data_emissione': '2024-12-20', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 129)", 'nota_import': None},
    {'codice': 'A124-279', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEGUSTAZIONE 75 + 2 ABBINAMENTI VINO', 'stato': 'attiva', 'data_emissione': '2024-12-20', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 130)", 'nota_import': None},
    {'codice': 'A124-280', 'tipo': 'esperienza', 'importo': 160.0, 'descrizione': '2 DEGUSTAZIONE GOURMANTICO', 'stato': 'attiva', 'data_emissione': '2024-12-20', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 131)", 'nota_import': None},
    {'codice': 'A124-281', 'tipo': 'esperienza', 'importo': 180.0, 'descrizione': '2 degustazioni 75 + 1 deg vino', 'stato': 'attiva', 'data_emissione': '2024-12-20', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 132)", 'nota_import': None},
    {'codice': 'A125-285', 'tipo': 'esperienza', 'importo': 180.0, 'descrizione': 'Usata', 'stato': 'usata', 'data_emissione': '2025-01-11', 'data_utilizzo': '2026-01-13', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 133)", 'nota_import': None},
    {'codice': 'A125-286', 'tipo': 'valore', 'importo': 130.0, 'descrizione': None, 'stato': 'attiva', 'data_emissione': '2025-01-23', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 134)", 'nota_import': None},
    {'codice': 'A125-304', 'tipo': 'esperienza', 'importo': 60.0, 'descrizione': '2 deg da 60', 'stato': 'attiva', 'data_emissione': '2025-04-18', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 139)", 'nota_import': 'importo 60€ dedotto dalla descrizione'},
    {'codice': 'A125-306', 'tipo': 'esperienza', 'importo': 130.0, 'descrizione': '2 DEG 130 CHIEDERE PER VINO E SENTIRE TANYA', 'stato': 'attiva', 'data_emissione': '2025-05-19', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 141)", 'nota_import': 'importo 130€ dedotto dalla descrizione'},
    {'codice': 'A125-307', 'tipo': 'esperienza', 'importo': 130.0, 'descrizione': 'DEG OSTERIA', 'stato': 'usata', 'data_emissione': '2025-06-03', 'data_utilizzo': '2026-03-10', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 142)", 'nota_import': None},
    {'codice': 'A125-308', 'tipo': 'esperienza', 'importo': 160.0, 'descrizione': 'DEG OSTE', 'stato': 'attiva', 'data_emissione': '2025-07-07', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 143)", 'nota_import': None},
    {'codice': 'A125-309', 'tipo': 'esperienza', 'importo': 130.0, 'descrizione': 'DEG OSTERIA', 'stato': 'attiva', 'data_emissione': '2025-07-31', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 144)", 'nota_import': None},
    {'codice': 'A125-310', 'tipo': 'esperienza', 'importo': 185.0, 'descrizione': 'deg marenzi', 'stato': 'attiva', 'data_emissione': '2025-08-02', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 145)", 'nota_import': None},
    {'codice': 'A125-311', 'tipo': 'esperienza', 'importo': 210.0, 'descrizione': 'DEG OSTE + VINO', 'stato': 'usata', 'data_emissione': '2025-08-24', 'data_utilizzo': '2026-02-13', 'emessa_da': None, 'note': "Pensiamo di esserci confusi con la 307 che poi é arrivata il giorno 10/3/26 Marco e iry a · Importata dall'Excel storico (riga 146)", 'nota_import': None},
    {'codice': 'A125-312', 'tipo': 'esperienza', 'importo': 180.0, 'descrizione': 'DEG OSTERIA + VINO', 'stato': 'attiva', 'data_emissione': '2025-09-01', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 147)", 'nota_import': None},
    {'codice': 'A125-313', 'tipo': 'esperienza', 'importo': 80.0, 'descrizione': 'DEG GOURMANTICO 2026 per 1 persona', 'stato': 'attiva', 'data_emissione': '2025-09-05', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 148)", 'nota_import': None},
    {'codice': 'A125-319', 'tipo': 'esperienza', 'importo': 180.0, 'descrizione': 'DEG OSTERIA + VINO', 'stato': 'attiva', 'data_emissione': '2025-10-24', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 154)", 'nota_import': None},
    {'codice': 'A125-324', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'degustazione x 2 da 75', 'stato': 'attiva', 'data_emissione': '2025-03-01', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 159)", 'nota_import': None},
    {'codice': 'A125-331', 'tipo': 'esperienza', 'importo': 100.0, 'descrizione': 'VALORE 100€', 'stato': 'attiva', 'data_emissione': '2026-02-09', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 166)", 'nota_import': 'importo 100€ dedotto dalla descrizione · il codice dice 2025, la data dice 2026: vale il codice'},
    {'codice': 'A125-330', 'tipo': 'esperienza', 'importo': 180.0, 'descrizione': 'deg 180', 'stato': 'attiva', 'data_emissione': '2024-12-08', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 167) · Riga doppia scartata → riga 165: 130€ deg 130", 'nota_import': "importo 180€ dedotto dalla descrizione · il codice dice 2025, la data dice 2024: vale il codice · codice doppio nell'Excel: tenuta questa (180€), scartata riga 165: 130€ deg 130"},
    {'codice': 'A125-333', 'tipo': 'esperienza', 'importo': 130.0, 'descrizione': 'deg 130', 'stato': 'attiva', 'data_emissione': '2025-12-21', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 169)", 'nota_import': 'importo 130€ dedotto dalla descrizione'},
    {'codice': 'A125-337', 'tipo': 'esperienza', 'importo': 160.0, 'descrizione': 'deg 160 no vino', 'stato': 'usata', 'data_emissione': '2025-12-23', 'data_utilizzo': '2026-04-26', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 170)", 'nota_import': 'importo 160€ dedotto dalla descrizione'},
    {'codice': 'A125-340', 'tipo': 'esperienza', 'importo': 130.0, 'descrizione': 'deg 130', 'stato': 'attiva', 'data_emissione': '2025-12-23', 'data_utilizzo': None, 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 171)", 'nota_import': 'importo 130€ dedotto dalla descrizione'},
    {'codice': 'A125-341', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'deg 150', 'stato': 'usata', 'data_emissione': '2025-12-23', 'data_utilizzo': '2026-02-28', 'emessa_da': None, 'note': "Importata dall'Excel storico (riga 172)", 'nota_import': 'importo 150€ dedotto dalla descrizione'},
    {'codice': 'B126-350', 'tipo': 'esperienza', 'importo': 50.0, 'descrizione': 'BUONO SCONTO 50€', 'stato': 'attiva', 'data_emissione': '2026-03-02', 'data_utilizzo': None, 'emessa_da': 'MARCO', 'note': "Importata dall'Excel storico (riga 173)", 'nota_import': None},
    {'codice': 'B126-351', 'tipo': 'esperienza', 'importo': 50.0, 'descrizione': 'BUONO SCONTO 50€', 'stato': 'attiva', 'data_emissione': '2026-03-02', 'data_utilizzo': None, 'emessa_da': 'MARCO', 'note': "Importata dall'Excel storico (riga 174)", 'nota_import': None},
    {'codice': 'B126-352', 'tipo': 'esperienza', 'importo': 150.0, 'descrizione': 'BUONO DEG DA 130 + VINO PER 1 PERSONA', 'stato': 'attiva', 'data_emissione': '2026-04-23', 'data_utilizzo': None, 'emessa_da': 'MARCO', 'note': "Importata dall'Excel storico (riga 175)", 'nota_import': None},
    {'codice': 'B126-353', 'tipo': 'esperienza', 'importo': 130.0, 'descrizione': '2 degustazioni prima volta', 'stato': 'attiva', 'data_emissione': '2026-04-26', 'data_utilizzo': None, 'emessa_da': 'Iry', 'note': "Importata dall'Excel storico (riga 176)", 'nota_import': None},
]


def upgrade(conn):
    """conn = foodcost.db (passato dal runner, non usato). Apre clienti.sqlite3."""
    path = locale_data_path("clienti.sqlite3")
    if not path.exists():
        print("  [167] clienti.sqlite3 non esiste, skip")
        return

    cconn = sqlite3.connect(str(path), timeout=30)
    try:
        cconn.execute("PRAGMA busy_timeout=30000")
        tabella = cconn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='clienti_giftcard'"
        ).fetchone()
        if not tabella:
            print("  [167] tabella clienti_giftcard non ancora creata, skip")
            return

        esistenti = {
            _norm(r[0])
            for r in cconn.execute("SELECT codice FROM clienti_giftcard").fetchall()
        }

        inserite = saltate = 0
        for gc in GIFT_CARD:
            if _norm(gc["codice"]) in esistenti:
                saltate += 1
                continue
            cur = cconn.execute(
                """
                INSERT INTO clienti_giftcard
                    (codice, tipo, importo, descrizione, cliente_id, intestatario_nome,
                     stato, data_emissione, data_scadenza, data_utilizzo,
                     emessa_da, note)
                VALUES (?,?,?,?,NULL,NULL,?,?,NULL,?,?,?)
                """,
                (
                    gc["codice"], gc["tipo"], gc["importo"], gc["descrizione"],
                    gc["stato"], gc["data_emissione"], gc["data_utilizzo"],
                    gc["emessa_da"], gc["note"],
                ),
            )
            cconn.execute(
                """
                INSERT INTO clienti_giftcard_movimenti
                    (giftcard_id, azione, stato_prima, stato_dopo, utente, note)
                VALUES (?, 'import', NULL, ?, 'migrazione 167', ?)
                """,
                (
                    cur.lastrowid,
                    gc["stato"],
                    gc["nota_import"] or "Import one-shot dall'Excel storico",
                ),
            )
            inserite += 1

        cconn.commit()
        attive = cconn.execute(
            "SELECT COUNT(*) n, COALESCE(SUM(importo),0) v FROM clienti_giftcard WHERE stato='attiva'"
        ).fetchone()
        print(
            f"  ✔ [167] gift card storiche: {inserite} inserite, {saltate} gia' presenti "
            f"— ora {attive[0]} attive per {attive[1]:.0f} €"
        )
    finally:
        cconn.close()
