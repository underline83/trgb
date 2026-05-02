# @version: v2.4-wal-protected
# -*- coding: utf-8 -*-
"""
Tre Gobbi — Database Impostazioni Carta Vini
File: app/models/settings_db.py

Gestisce il DB SQLite dedicato alle impostazioni della Carta Vini:
- Ordinamento Tipologie
- Ordinamento Nazioni
- Ordinamento Regioni
- Filtri carta (quantità, negativi, prezzi mancanti)

@changelog:
    - v2.3-stable (2025-11-13)
        • ADD: nuova colonna `mostra_senza_prezzo` in filtri_carta
        • UPDATE: struttura tabella filtri_carta aggiornata
        • FIX: compatibilità con ensure_settings_defaults()

    - v2.2-stable
        • Prima implementazione stabile filtri quantità e negativi

    - v2.1-stable
        • Strutturazione completa DB impostazioni

    - v2.0
        • Creazione iniziale DB con le tre tabelle principali
"""

from __future__ import annotations
import sqlite3

from app.utils.locale_data import locale_data_path

# R6.5 — path tenant-aware. Stesso file di app/core/database.py
# (SETTINGS_DB_PATH): entrambi via locale_data_path puntano allo stesso
# vini_settings.sqlite3 nel locale corrente. Modulo: vini.
SETTINGS_PATH = locale_data_path("vini_settings.sqlite3")


def get_settings_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(SETTINGS_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    # Fix 1.11.2 (sessione 52) — WAL + synchronous=NORMAL + busy_timeout
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_settings_db():
    """
    Crea tutte le tabelle necessarie se non esistono.
    In v2.3 è stata aggiornata la tabella filtri_carta.
    """
    conn = get_settings_conn()
    cur = conn.cursor()

    # ---------------------------
    # Tipologie
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tipologia_order (
            nome   TEXT PRIMARY KEY,
            ordine INTEGER NOT NULL
        );
    """)

    # ---------------------------
    # Nazioni
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS nazioni_order (
            nazione TEXT PRIMARY KEY,
            ordine  INTEGER NOT NULL
        );
    """)

    # ---------------------------
    # Regioni
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS regioni_order (
            codice TEXT PRIMARY KEY,
            nazione TEXT NOT NULL,
            nome    TEXT NOT NULL,
            ordine  INTEGER NOT NULL
        );
    """)

    # ---------------------------
    # Codici interni
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS codici_order (
            codice TEXT PRIMARY KEY,
            ordine INTEGER NOT NULL
        );
    """)

    # ---------------------------
    # Formati bottiglia
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS formati_order (
            formato     TEXT PRIMARY KEY,
            ordine      INTEGER NOT NULL,
            descrizione TEXT DEFAULT '',
            litri       REAL DEFAULT 0
        );
    """)
    # Migrazione: aggiungi colonne se mancanti (upgrade da vecchio schema)
    try:
        cur.execute("ALTER TABLE formati_order ADD COLUMN descrizione TEXT DEFAULT '';")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE formati_order ADD COLUMN litri REAL DEFAULT 0;")
    except Exception:
        pass

    # ---------------------------
    # Filtri carta
    # @v2.3: aggiunto campo mostra_senza_prezzo
    # ---------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS filtri_carta (
            id                  INTEGER PRIMARY KEY CHECK (id = 1),
            min_qta_stampa      INTEGER NOT NULL DEFAULT 1,
            mostra_negativi     INTEGER NOT NULL DEFAULT 0,
            mostra_senza_prezzo INTEGER NOT NULL DEFAULT 0
        );
    """)

    conn.commit()
    conn.close()