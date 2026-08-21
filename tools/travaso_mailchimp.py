#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Modulo: comunicazioni
# Classificazione: [locale:tregobbi] — è un trasloco, non una funzione di prodotto
"""
Travaso one-shot della lista Mailchimp dentro il modulo Comunicazioni.

NON è una feature: non ha UI, non ha endpoint, si lancia a mano una volta e poi
resta qui come documentazione di come sono entrati i dati. Stessa scelta fatta
per lo storico gift card (sessione 2026-08-08): un import da Excel che serve una
volta sola non diventa un bottone che qualcuno ripremerà per sbaglio fra un anno.

USO
---
    # sul VPS, con i 4 CSV dell'export in una cartella
    cd /home/marco/trgb/trgb
    python3 tools/travaso_mailchimp.py --cartella /tmp/audience_export        # prova
    python3 tools/travaso_mailchimp.py --cartella /tmp/audience_export --vai  # esegue

Di default NON scrive: stampa cosa farebbe. Serve `--vai` per applicare.

COSA FA
-------
1. subscribed   → stato_email 'iscritto'
2. unsubscribed → stato_email 'disiscritto'  (motivo dalla colonna UNSUB_REASON)
3. cleaned      → stato_email 'soppresso'    (indirizzo morto, hard bounce)
4. nonsubscribed→ contatto senza consenso    ('mai_iscritto')

Ogni contatto lascia una riga in comm_consensi_log con la data di iscrizione
originale e l'IP: è la sola prova di provenienza che abbiamo, e va conservata
anche quando dice cose scomode (il 99,5% di questa lista è stato importato in
blocco il 5 marzo 2025 da localhost).

I disiscritti e i morti si importano APPOSTA. Sono la lista di soppressione:
senza di loro il prossimo import TheFork li rimette in circolo e ricominciamo a
scrivere a chi si era tolto.

IDEMPOTENTE: rilanciarlo non crea doppioni. Un contatto già presente viene
aggiornato solo se il nuovo stato è più restrittivo (un iscritto che nel
frattempo risulta disiscritto viene chiuso; mai il contrario).
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from typing import Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.comm_db import get_comm_conn, init_comm_db          # noqa: E402
from app.services import comunicazioni_service as svc               # noqa: E402

# file dell'export → (stato, motivo, colonna con la data di chiusura)
SORGENTI = {
    "subscribed":    ("iscritto",     None,            None),
    "unsubscribed":  ("disiscritto",  "unsubscribe",   "UNSUB_TIME"),
    "cleaned":       ("soppresso",    "hard_bounce",   "CLEAN_TIME"),
    "nonsubscribed": ("mai_iscritto", None,            None),
}

# Quanto è "chiuso" uno stato. Il travaso non declassa mai verso l'alto.
DUREZZA = {"mai_iscritto": 0, "iscritto": 1, "disiscritto": 2, "soppresso": 3}


def trova_file(cartella: str, prefisso: str) -> Optional[str]:
    for f in sorted(os.listdir(cartella)):
        if f.startswith(prefisso + "_") and f.endswith(".csv"):
            return os.path.join(cartella, f)
    return None


def pulisci_telefono(t: Optional[str]) -> Optional[str]:
    """L'export Mailchimp antepone un apice per non far interpretare il + a Excel."""
    if not t:
        return None
    t = t.strip().lstrip("'").strip()
    return t or None


def carica_indice_crm() -> Dict[str, int]:
    crm = svc._crm_conn()
    if crm is None:
        print("  ! CRM non disponibile: i contatti resteranno senza cliente_id")
        return {}
    try:
        return {
            r["e"]: r["id"]
            for r in crm.execute(
                "SELECT lower(trim(email)) AS e, id FROM clienti "
                "WHERE email IS NOT NULL AND trim(email) != ''"
            )
        }
    finally:
        crm.close()


def travasa_consensi_crm(applica: bool) -> Dict[str, int]:
    """
    Recupera i consensi raccolti da TheFork che non sono mai finiti in Mailchimp.

    Al 2026-08-14 sono 2.582 clienti con `newsletter = 1` mai caricati:
      - 241 con email  → entrano ISCRITTI. Il consenso l'hanno dato prenotando,
                         ed è più documentato di quello dei 5.920 arrivati con
                         l'import in blocco del 5 marzo 2025.
      - 2.341 senza email, di cui 1.559 con telefono → entrano come contatti
                         raggiungibili solo via WhatsApp, con `stato_wa` a
                         'mai_iscritto'.

    SUL PERCHÉ IL CONSENSO WHATSAPP NON SI EREDITA
    -----------------------------------------------
    La spunta su TheFork dice "voglio ricevere le vostre email". Non dice nulla
    sui messaggi: sono due canali, due consensi. Chi entra da qui ha il telefono
    valorizzato e il canale WA CHIUSO. Il consenso WA va raccolto quando il
    canale si accende — non dedotto da questo.

    Va lanciata DOPO il travaso da Mailchimp: chi è già in lista non si tocca,
    e in particolare chi si era disiscritto non torna dentro da questa porta.
    """
    crm = svc._crm_conn()
    if crm is None:
        print("  ! CRM non disponibile, salto il recupero consensi")
        return {}

    righe = crm.execute(
        """SELECT id, nome, cognome, lower(trim(coalesce(email,''))) AS email,
                  coalesce(telefono,'') AS telefono
           FROM clienti WHERE newsletter = 1"""
    ).fetchall()
    crm.close()

    esiti = {"iscritti_con_email": 0, "solo_telefono": 0, "gia_in_lista": 0, "scartati": 0}
    conn = get_comm_conn() if applica else None
    cur = conn.cursor() if conn else None

    for r in righe:
        email = svc.norm_email(r["email"]) if r["email"] else None
        telefono = pulisci_telefono(r["telefono"])

        if not email and not telefono:
            esiti["scartati"] += 1
            continue

        # Già in lista? Due chiavi, non una: chi non ha email si riconosce solo
        # dal cliente_id. Senza questo controllo il rilancio duplicava i 1.559
        # contatti solo-telefono a ogni giro.
        if applica:
            gia = cur.execute(
                "SELECT 1 FROM comm_contatti WHERE cliente_id = ? "
                "   OR (? != '' AND lower(trim(coalesce(email,''))) = ?)",
                (r["id"], email or "", email or ""),
            ).fetchone()
            if gia:
                esiti["gia_in_lista"] += 1
                continue

        if not applica:
            esiti["iscritti_con_email" if email else "solo_telefono"] += 1
            continue

        if email:
            # Ha acconsentito prenotando: entra già iscritto al canale email.
            cur.execute(
                """INSERT INTO comm_contatti
                   (cliente_id, email, telefono, nome, cognome, stato_email,
                    consenso_email_fonte, consenso_email_data, unsub_token, origine)
                   VALUES (?,?,?,?,?,'iscritto','prenotazione',
                           datetime('now','localtime'), ?, 'recupero_consensi_crm')""",
                (r["id"], email, telefono, r["nome"], r["cognome"], svc.genera_token()),
            )
            svc._log_consenso(
                cur, cur.lastrowid, "email", None, "iscritto",
                motivo="consenso raccolto in fase di prenotazione, mai caricato su Mailchimp",
                fonte="prenotazione", dettagli={"cliente_id": r["id"]},
            )
            esiti["iscritti_con_email"] += 1
        else:
            # Solo telefono: presente in lista, ma nessun canale aperto.
            cur.execute(
                """INSERT INTO comm_contatti
                   (cliente_id, telefono, nome, cognome, stato_email, stato_wa,
                    unsub_token, origine, note)
                   VALUES (?,?,?,?,'mai_iscritto','mai_iscritto',?,
                           'recupero_consensi_crm',
                           'consenso email su TheFork ma indirizzo assente; canale WA da aprire')""",
                (r["id"], telefono, r["nome"], r["cognome"], svc.genera_token()),
            )
            esiti["solo_telefono"] += 1

    if conn:
        conn.commit()
        conn.close()
    return esiti


def travasa(cartella: str, applica: bool) -> Dict[str, int]:
    if applica:
        init_comm_db()

    idx_crm = carica_indice_crm()
    print(f"  clienti CRM con email: {len(idx_crm)}")

    conn = get_comm_conn() if applica else None
    cur = conn.cursor() if conn else None
    esiti = {"nuovi": 0, "aggiornati": 0, "invariati": 0, "senza_email": 0, "agganciati": 0}

    for prefisso, (stato, motivo, col_data) in SORGENTI.items():
        percorso = trova_file(cartella, prefisso)
        if not percorso:
            print(f"  - {prefisso}: file assente, salto")
            continue

        righe = list(csv.DictReader(open(percorso, encoding="utf-8-sig")))
        print(f"  - {prefisso}: {len(righe)} righe → stato '{stato}'")

        for r in righe:
            email = svc.norm_email(r.get("Indirizzo E-Mail"))
            if not email:
                esiti["senza_email"] += 1
                continue

            cliente_id = idx_crm.get(email)
            if cliente_id:
                esiti["agganciati"] += 1

            if not applica:
                esiti["nuovi"] += 1
                continue

            esistente = cur.execute(
                "SELECT id, stato_email FROM comm_contatti WHERE lower(trim(email)) = ?",
                (email,),
            ).fetchone()

            if esistente:
                # Solo verso stati più restrittivi: il travaso non riapre nulla.
                if DUREZZA[stato] > DUREZZA[esistente["stato_email"]]:
                    svc.chiudi_canale(
                        esistente["id"], stato, canale="email", motivo=motivo,
                        fonte="import_mailchimp",
                        dettagli={"campagna": r.get("UNSUB_CAMPAIGN_TITLE")
                                             or r.get("CLEAN_CAMPAIGN_TITLE")},
                        conn=conn,
                    )
                    esiti["aggiornati"] += 1
                else:
                    esiti["invariati"] += 1
                continue

            cur.execute(
                """INSERT INTO comm_contatti
                   (cliente_id, email, telefono, nome, cognome, stato_email,
                    consenso_email_data, consenso_email_ip, consenso_email_fonte,
                    motivo_stop_email, data_stop_email, unsub_token, origine)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    cliente_id, email, pulisci_telefono(r.get("Numero Telefono")),
                    (r.get("Nome") or None), (r.get("Cognome") or None),
                    stato,
                    (r.get("OPTIN_TIME") or None),
                    (r.get("OPTIN_IP") or None),
                    "import_mailchimp",
                    motivo,
                    (r.get(col_data) if col_data else None),
                    svc.genera_token(),
                    "import_mailchimp",
                ),
            )
            contatto_id = cur.lastrowid
            svc._log_consenso(
                cur, contatto_id, "email", None, stato,
                motivo=motivo or "travaso da Mailchimp",
                fonte="import_mailchimp",
                ip=(r.get("OPTIN_IP") or None),
                dettagli={
                    "optin_time": r.get("OPTIN_TIME"),
                    "unsub_reason": r.get("UNSUB_REASON"),
                    "campagna": r.get("UNSUB_CAMPAIGN_TITLE") or r.get("CLEAN_CAMPAIGN_TITLE"),
                },
            )
            esiti["nuovi"] += 1

    if conn:
        conn.commit()
        conn.close()
    return esiti


def main() -> int:
    ap = argparse.ArgumentParser(description="Travaso one-shot Mailchimp → modulo Comunicazioni")
    ap.add_argument("--cartella", required=True, help="cartella con i CSV dell'export")
    ap.add_argument("--vai", action="store_true", help="applica davvero (senza, è una prova)")
    ap.add_argument("--specchia-crm", action="store_true",
                    help="allinea anche clienti.newsletter allo stato reale")
    ap.add_argument("--salta-consensi-crm", action="store_true",
                    help="non recuperare i consensi TheFork mai caricati su Mailchimp")
    args = ap.parse_args()

    if not os.path.isdir(args.cartella):
        print(f"ERRORE: cartella inesistente: {args.cartella}")
        return 1

    print("=" * 62)
    print("TRAVASO MAILCHIMP → COMUNICAZIONI", "" if args.vai else "  [PROVA — non scrive]")
    print("=" * 62)

    esiti = travasa(args.cartella, args.vai)
    print("\nEsiti Mailchimp:")
    for k, v in esiti.items():
        print(f"  {k:20s}: {v}")

    if not args.salta_consensi_crm:
        print("\nRecupero consensi TheFork mai caricati su Mailchimp:")
        for k, v in (travasa_consensi_crm(args.vai) or {}).items():
            print(f"  {k:20s}: {v}")

    if args.vai:
        stato = svc.stato_lista()
        print("\nLista dopo il travaso:")
        for k, v in sorted(stato["email"].items()):
            print(f"  {k:14s}: {v}")
        print(f"  {'con telefono':14s}: {stato['con_telefono']}")

    if args.specchia_crm:
        esito = svc.specchia_flag_newsletter_su_crm(dry_run=not args.vai)
        print("\nAllineamento clienti.newsletter:")
        print(f"  da accendere : {esito['da_accendere']}")
        print(f"  da spegnere  : {esito['da_spegnere']}   <-- i falsi positivi pericolosi")
        print(f"  applicato    : {esito['applicato']}")

    if not args.vai:
        print("\nProva conclusa. Per applicare, rilanciare con --vai")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
