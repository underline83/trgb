-- impostazioni_vini.sql
-- Seed tabelle impostazioni Carta Vini Tre Gobbi

PRAGMA foreign_keys = OFF;

------------------------------------------------------------
-- 1) TABELA TIPOLOGIE VINI
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vini_tipologie (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL UNIQUE,
    ordine    INTEGER NOT NULL,
    stampabile INTEGER NOT NULL DEFAULT 1,
    attiva     INTEGER NOT NULL DEFAULT 1
);

-- Pulisce e inserisce l'ordine ufficiale
DELETE FROM vini_tipologie;

INSERT INTO vini_tipologie (nome, ordine, stampabile, attiva) VALUES
    ('GRANDI FORMATI',               1, 1, 1),
    ('BOLLICINE FRANCIA',            2, 1, 1),
    ('BOLLICINE STRANIERE',          3, 1, 1),
    ('BOLLICINE ITALIA',             4, 1, 1),
    ('BIANCHI ITALIA',               5, 1, 1),
    ('BIANCHI FRANCIA',              6, 1, 1),
    ('BIANCHI STRANIERI',            7, 1, 1),
    ('ROSATI',                       8, 1, 1),
    ('ROSSI ITALIA',                 9, 1, 1),
    ('ROSSI FRANCIA',               10, 1, 1),
    ('ROSSI STRANIERI',             11, 1, 1),
    ('PASSITI E VINI DA MEDITAZIONE', 12, 1, 1),
    ('VINI ANALCOLICI',             13, 1, 1),
    ('ERRORE',                      999, 0, 1);  -- sempre ultimo, non stampato

CREATE INDEX IF NOT EXISTS idx_vini_tipologie_ordine
    ON vini_tipologie (ordine, nome);


------------------------------------------------------------
-- 2) TABELLA NAZIONI VINI
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vini_nazioni (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nome    TEXT NOT NULL UNIQUE,
    codice  TEXT,
    ordine  INTEGER NOT NULL DEFAULT 999
);

DELETE FROM vini_nazioni;

-- Ordine ufficiale (puoi ampliarlo in futuro)
INSERT INTO vini_nazioni (nome, codice, ordine) VALUES
    ('ITALIA',   'IT', 1),
    ('FRANCIA',  'FR', 2),
    ('GERMANIA', 'DE', 3),
    ('AUSTRIA',  'AT', 4);

CREATE INDEX IF NOT EXISTS idx_vini_nazioni_ordine
    ON vini_nazioni (ordine, nome);


------------------------------------------------------------
-- 3) TABELLA REGIONI VITI-VINICOLE
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vini_regioni (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    nazione  TEXT NOT NULL,
    codice   TEXT NOT NULL UNIQUE,
    nome     TEXT NOT NULL,
    ordine   INTEGER NOT NULL
);

DELETE FROM vini_regioni;

-- ITALIA
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('ITALIA', 'IT01', 'LOMBARDIA',             1),
    ('ITALIA', 'IT02', 'PIEMONTE',              2),
    ('ITALIA', 'IT03', 'LIGURIA',               3),
    ('ITALIA', 'IT04', 'VALLE D''AOSTRA',       4),
    ('ITALIA', 'IT05', 'VENETO',                5),
    ('ITALIA', 'IT06', 'FRIULI-VENEZIA GIULIA', 6),
    ('ITALIA', 'IT07', 'TRENTINO - ALTO ADIGE', 7),
    ('ITALIA', 'IT08', 'EMILIA-ROMAGNA',        8),
    ('ITALIA', 'IT09', 'TOSCANA',               9),
    ('ITALIA', 'IT10', 'UMBRIA',               10),
    ('ITALIA', 'IT11', 'MARCHE',               11),
    ('ITALIA', 'IT12', 'LAZIO',                12),
    ('ITALIA', 'IT13', 'ABRUZZO',              13),
    ('ITALIA', 'IT14', 'MOLISE',               14),
    ('ITALIA', 'IT15', 'CAMPANIA',             15),
    ('ITALIA', 'IT16', 'PUGLIA',               16),
    ('ITALIA', 'IT17', 'BASILICATA',           17),
    ('ITALIA', 'IT18', 'CALABRIA',             18),
    ('ITALIA', 'IT19', 'SICILIA',              19),
    ('ITALIA', 'IT20', 'SARDEGNA',             20);

-- FRANCIA
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('FRANCIA', 'FR01', 'Alsazia',                     1),
    ('FRANCIA', 'FR02', 'Beaujolais',                  2),
    ('FRANCIA', 'FR03', 'Bordeaux',                    3),
    ('FRANCIA', 'FR04', 'Borgogna',                    4),
    ('FRANCIA', 'FR05', 'Champagne',                   5),
    ('FRANCIA', 'FR06', 'Corsica',                     6),
    ('FRANCIA', 'FR07', 'Jura',                        7),
    ('FRANCIA', 'FR08', 'Linguadoca  - Rossiglione',   8),
    ('FRANCIA', 'FR09', 'Lorraine',                    9),
    ('FRANCIA', 'FR10', 'Provenza',                   10),
    ('FRANCIA', 'FR11', 'Rhone',                      11),
    ('FRANCIA', 'FR12', 'Savoia - Bugey',             12),
    ('FRANCIA', 'FR13', 'Sud-Ovest',                  13),
    ('FRANCIA', 'FR14', 'Vallée de la Loire',         14);

-- GERMANIA
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('GERMANIA', 'DE01', 'Ahr',                      1),
    ('GERMANIA', 'DE02', 'Baden',                    2),
    ('GERMANIA', 'DE03', 'Franken',                  3),
    ('GERMANIA', 'DE04', 'Hessische - Bergstrasse',  4),
    ('GERMANIA', 'DE05', 'Mittelrhein',              5),
    ('GERMANIA', 'DE06', 'Mosel - Saar- Ruwer',      6),
    ('GERMANIA', 'DE07', 'Nahe',                     7),
    ('GERMANIA', 'DE08', 'Pfalz',                    8),
    ('GERMANIA', 'DE09', 'Rheingau',                 9),
    ('GERMANIA', 'DE10', 'Rheinhessen',             10),
    ('GERMANIA', 'DE11', 'Saale - Unstrut',         11),
    ('GERMANIA', 'DE12', 'Sachsen',                 12),
    ('GERMANIA', 'DE13', 'Wurttemberg',             13);

-- AUSTRIA
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('AUSTRIA', 'AU01', 'Niederösterreich', 1),
    ('AUSTRIA', 'AU02', 'Burgenland',       2),
    ('AUSTRIA', 'AU03', 'Steiermark',       3),
    ('AUSTRIA', 'AU04', 'Wien',             4),
    ('AUSTRIA', 'AU05', 'Kärnten',          5),
    ('AUSTRIA', 'AU06', 'Oberösterreich',   6),
    ('AUSTRIA', 'AU07', 'Salzburg',         7),
    ('AUSTRIA', 'AU08', 'Tirol',            8),
    ('AUSTRIA', 'AU09', 'Vorarlberg',       9);

CREATE INDEX IF NOT EXISTS idx_vini_regioni_nazione_ordine
    ON vini_regioni (nazione, ordine, nome);

CREATE INDEX IF NOT EXISTS idx_vini_regioni_codice
    ON vini_regioni (codice);


------------------------------------------------------------
-- 4) TABELLA PRODUTTORI (PRONTA PER FUTURO USO)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vini_produttori (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    nazione       TEXT,
    regione       TEXT,
    ordine_custom INTEGER,
    UNIQUE (nome, nazione, regione)
);

-- Non inserisco produttori seed: li popoleremo dal DB vini o manualmente.


------------------------------------------------------------
-- 5) IMPOSTAZIONI GENERALI CARTA VINI
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vini_impostazioni (
    chiave  TEXT PRIMARY KEY,
    valore  TEXT NOT NULL
);

-- Ordine logico dei livelli di ordinamento
INSERT OR REPLACE INTO vini_impostazioni (chiave, valore) VALUES
    ('ordinamento_livelli', 'TIPOLOGIA>REGIONE>PRODUTTORE>DESCRIZIONE>ANNATA');

-- Fonte ordine tipologie / nazioni / regioni
INSERT OR REPLACE INTO vini_impostazioni (chiave, valore) VALUES
    ('ordinamento_tipologie_fonte', 'tabella'),
    ('ordinamento_nazioni_fonte',   'tabella'),
    ('ordinamento_regioni_fonte',   'tabella');

-- Ordinamenti di default
INSERT OR REPLACE INTO vini_impostazioni (chiave, valore) VALUES
    ('annata_ordine',               'asc'),  -- vecchio → nuovo
    ('produttore_ordine_default',   'asc'),
    ('descrizione_ordine_default',  'asc');

-- Layout carta (3 colonne: descrizione, annata, prezzo)
INSERT OR REPLACE INTO vini_impostazioni (chiave, valore) VALUES
    ('layout_colonne', '3'),              -- numero colonne logiche
    ('layout_mostra_prezzo', '1'),
    ('layout_mostra_annata', '1');

-- Filtri logici carta
INSERT OR REPLACE INTO vini_impostazioni (chiave, valore) VALUES
    ('carta_filtra_carta_si', '1'),          -- CARTA = 'SI'
    ('carta_escludi_tipologia_errore', '1'); -- escludi sempre ERRORE

PRAGMA foreign_keys = ON;