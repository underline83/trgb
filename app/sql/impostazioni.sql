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
    ('Italia',   'IT', 1),
    ('Francia',  'FR', 2),
    ('Germania', 'DE', 3),
    ('Austria',  'AT', 4);

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

-- Italia
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('Italia', 'IT01', 'Lombardia',             1),
    ('Italia', 'IT02', 'Piemonte',              2),
    ('Italia', 'IT03', 'Liguria',               3),
    ('Italia', 'IT04', 'Valle d''Aosta',        4),
    ('Italia', 'IT05', 'Veneto',                5),
    ('Italia', 'IT06', 'Friuli-Venezia Giulia', 6),
    ('Italia', 'IT07', 'Trentino-Alto Adige',   7),
    ('Italia', 'IT08', 'Emilia-Romagna',        8),
    ('Italia', 'IT09', 'Toscana',               9),
    ('Italia', 'IT10', 'Umbria',               10),
    ('Italia', 'IT11', 'Marche',               11),
    ('Italia', 'IT12', 'Lazio',                12),
    ('Italia', 'IT13', 'Abruzzo',              13),
    ('Italia', 'IT14', 'Molise',               14),
    ('Italia', 'IT15', 'Campania',             15),
    ('Italia', 'IT16', 'Puglia',               16),
    ('Italia', 'IT17', 'Basilicata',           17),
    ('Italia', 'IT18', 'Calabria',             18),
    ('Italia', 'IT19', 'Sicilia',              19),
    ('Italia', 'IT20', 'Sardegna',             20);

-- Francia
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('Francia', 'FR01', 'Alsazia',                   1),
    ('Francia', 'FR02', 'Beaujolais',                2),
    ('Francia', 'FR03', 'Bordeaux',                  3),
    ('Francia', 'FR04', 'Borgogna',                  4),
    ('Francia', 'FR05', 'Champagne',                 5),
    ('Francia', 'FR06', 'Corsica',                   6),
    ('Francia', 'FR07', 'Jura',                      7),
    ('Francia', 'FR08', 'Linguadoca-Rossiglione',    8),
    ('Francia', 'FR09', 'Lorraine',                  9),
    ('Francia', 'FR10', 'Provenza',                 10),
    ('Francia', 'FR11', 'Rhone',                    11),
    ('Francia', 'FR12', 'Savoia-Bugey',             12),
    ('Francia', 'FR13', 'Sud-Ovest',                13),
    ('Francia', 'FR14', 'Vallée de la Loire',       14);

-- Germania
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('Germania', 'DE01', 'Ahr',                      1),
    ('Germania', 'DE02', 'Baden',                    2),
    ('Germania', 'DE03', 'Franken',                  3),
    ('Germania', 'DE04', 'Hessische-Bergstrasse',    4),
    ('Germania', 'DE05', 'Mittelrhein',              5),
    ('Germania', 'DE06', 'Mosel-Saar-Ruwer',        6),
    ('Germania', 'DE07', 'Nahe',                     7),
    ('Germania', 'DE08', 'Pfalz',                    8),
    ('Germania', 'DE09', 'Rheingau',                 9),
    ('Germania', 'DE10', 'Rheinhessen',             10),
    ('Germania', 'DE11', 'Saale-Unstrut',           11),
    ('Germania', 'DE12', 'Sachsen',                 12),
    ('Germania', 'DE13', 'Wurttemberg',             13);

-- Austria
INSERT INTO vini_regioni (nazione, codice, nome, ordine) VALUES
    ('Austria', 'AU01', 'Niederösterreich', 1),
    ('Austria', 'AU02', 'Burgenland',       2),
    ('Austria', 'AU03', 'Steiermark',       3),
    ('Austria', 'AU04', 'Wien',             4),
    ('Austria', 'AU05', 'Kärnten',          5),
    ('Austria', 'AU06', 'Oberösterreich',   6),
    ('Austria', 'AU07', 'Salzburg',         7),
    ('Austria', 'AU08', 'Tirol',            8),
    ('Austria', 'AU09', 'Vorarlberg',       9);

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