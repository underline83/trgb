# ============================================================
# FILE: app/routers/clienti_router.py
# Router Clienti CRM — TRGB Gestionale
# ============================================================

# @version: v1.0-clienti-router
# -*- coding: utf-8 -*-
"""
Router Clienti CRM — TRGB Gestionale

Funzionalità v1.0:
- Anagrafica clienti (CRUD, ricerca full-text, filtri)
- Import da TheFork (XLSX)
- Tag/categorie (CRUD + associazione)
- Note/diario interazioni (CRUD)
- Dashboard statistiche CRM
- Compleanni in arrivo

Autenticazione:
- Tutti gli endpoint richiedono utente loggato (JWT).
"""

from __future__ import annotations

import io
import logging
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.models.clienti_db import get_clienti_conn, init_clienti_db
from app.services.auth_service import get_current_user

logger = logging.getLogger("trgb.clienti")

router = APIRouter(prefix="/clienti", tags=["Clienti"])

# Inizializza DB alla prima importazione del router
init_clienti_db()


# ============================================================
# MODELLI Pydantic
# ============================================================
class ClienteBase(BaseModel):
    titolo: Optional[str] = None
    nome: str
    cognome: str
    email: Optional[str] = None
    telefono: Optional[str] = None
    telefono2: Optional[str] = None
    data_nascita: Optional[str] = None
    lingua: Optional[str] = "it_IT"
    indirizzo: Optional[str] = None
    cap: Optional[str] = None
    citta: Optional[str] = None
    paese: Optional[str] = "Italy"
    vip: bool = False
    rank: Optional[str] = None
    promoter: bool = False
    newsletter: bool = False
    risk_level: Optional[str] = None
    pref_cibo: Optional[str] = None
    pref_bevande: Optional[str] = None
    pref_posto: Optional[str] = None
    restrizioni_dietetiche: Optional[str] = None
    allergie: Optional[str] = None
    note_thefork: Optional[str] = None
    attivo: bool = True
    origine: Optional[str] = "manuale"


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(ClienteBase):
    pass


class TagBase(BaseModel):
    nome: str
    colore: str = "#0d9488"
    ordine: int = 0


class NotaCreate(BaseModel):
    tipo: str = "nota"
    testo: str
    data: Optional[str] = None
    autore: Optional[str] = None


# ============================================================
# ENDPOINT: DASHBOARD CRM (DEVE stare PRIMA di /{cliente_id})
# ============================================================
@router.get("/dashboard/stats")
def dashboard_stats(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_clienti_conn()
    try:
        stats = {}

        # Totali
        stats["totale"] = conn.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1").fetchone()[0]
        stats["vip"] = conn.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1 AND vip = 1").fetchone()[0]
        stats["con_email"] = conn.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1 AND email IS NOT NULL AND email != ''").fetchone()[0]
        stats["con_telefono"] = conn.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1 AND telefono IS NOT NULL AND telefono != ''").fetchone()[0]
        stats["con_allergie"] = conn.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1 AND (allergie IS NOT NULL AND allergie != '')").fetchone()[0]
        stats["con_preferenze"] = conn.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1 AND (pref_cibo IS NOT NULL AND pref_cibo != '')").fetchone()[0]
        stats["con_compleanno"] = conn.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1 AND data_nascita IS NOT NULL AND data_nascita != ''").fetchone()[0]

        # Per rank
        ranks = conn.execute(
            "SELECT COALESCE(rank, 'Nessuno') as rank, COUNT(*) as n FROM clienti WHERE attivo = 1 GROUP BY rank ORDER BY n DESC"
        ).fetchall()
        stats["per_rank"] = [dict(r) for r in ranks]

        # Per lingua
        lingue = conn.execute(
            "SELECT COALESCE(lingua, 'n/d') as lingua, COUNT(*) as n FROM clienti WHERE attivo = 1 GROUP BY lingua ORDER BY n DESC LIMIT 10"
        ).fetchall()
        stats["per_lingua"] = [dict(r) for r in lingue]

        # Per tag
        tags = conn.execute(
            """
            SELECT t.nome, t.colore, COUNT(ta.cliente_id) as n
            FROM clienti_tag t
            LEFT JOIN clienti_tag_assoc ta ON ta.tag_id = t.id
            GROUP BY t.id
            ORDER BY t.ordine
            """
        ).fetchall()
        stats["per_tag"] = [dict(r) for r in tags]

        # Nuovi ultimi 30 giorni
        stats["nuovi_30gg"] = conn.execute(
            "SELECT COUNT(*) FROM clienti WHERE created_at >= date('now', '-30 days')"
        ).fetchone()[0]

        # Compleanni prossimi 7 giorni
        today = date.today()
        birthday_conditions = []
        for i in range(8):
            d = today + timedelta(days=i)
            birthday_conditions.append(f"substr(data_nascita, 1, 5) = '{d.strftime('%d/%m')}'")
        compleanni = conn.execute(
            f"""
            SELECT id, nome, cognome, data_nascita, telefono, email
            FROM clienti
            WHERE attivo = 1 AND data_nascita IS NOT NULL
              AND ({' OR '.join(birthday_conditions)})
            ORDER BY substr(data_nascita, 4, 2), substr(data_nascita, 1, 2)
            """
        ).fetchall()
        stats["compleanni_prossimi"] = [dict(r) for r in compleanni]

        return JSONResponse(stats)
    except Exception as e:
        logger.exception("Errore dashboard stats")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: TAG (DEVE stare PRIMA di /{cliente_id})
# ============================================================
@router.get("/tag/lista")
def lista_tag(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_clienti_conn()
    try:
        rows = conn.execute("SELECT * FROM clienti_tag ORDER BY ordine, nome").fetchall()
        return JSONResponse([dict(r) for r in rows])
    finally:
        conn.close()


@router.post("/tag")
def crea_tag(body: TagBase, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_clienti_conn()
    try:
        cur = conn.execute(
            "INSERT INTO clienti_tag (nome, colore, ordine) VALUES (?,?,?)",
            (body.nome, body.colore, body.ordine),
        )
        conn.commit()
        return JSONResponse({"id": cur.lastrowid, "status": "ok"})
    except Exception as e:
        logger.exception("Errore creazione tag")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.delete("/tag/{tag_id}")
def elimina_tag(tag_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = get_clienti_conn()
    try:
        conn.execute("DELETE FROM clienti_tag_assoc WHERE tag_id = ?", (tag_id,))
        conn.execute("DELETE FROM clienti_tag WHERE id = ?", (tag_id,))
        conn.commit()
        return JSONResponse({"status": "ok"})
    finally:
        conn.close()


# ============================================================
# ENDPOINT: IMPORT THEFORK XLSX (DEVE stare PRIMA di /{cliente_id})
# ============================================================
@router.post("/import/thefork")
async def import_thefork(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Importa clienti da export TheFork (XLSX).
    Usa thefork_id come chiave univoca per evitare duplicati.
    Aggiorna i record esistenti se già presenti.
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "openpyxl non installato sul server")

    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(400, "File vuoto")

    headers = [str(h).strip() if h else "" for h in rows[0]]
    data_rows = rows[1:]

    def col(name):
        try:
            return headers.index(name)
        except ValueError:
            return None

    def val(row, name):
        idx = col(name)
        if idx is None or idx >= len(row):
            return None
        v = row[idx]
        if v is None:
            return None
        return str(v).strip() if not isinstance(v, (int, float)) else v

    def clean_phone(p):
        if p is None:
            return None
        s = str(p).replace(".0", "").replace(" ", "").replace("-", "")
        if s and not s.startswith("+"):
            if s.startswith("39") and len(s) > 10:
                s = "+" + s
            elif len(s) == 10:
                s = "+39" + s
        return s if s else None

    def bool_val(v):
        if v is None:
            return 0
        return 1 if str(v).strip().lower() in ("yes", "si", "sì", "1", "true") else 0

    conn = get_clienti_conn()
    inseriti = 0
    aggiornati = 0
    errori = 0

    try:
        for row in data_rows:
            try:
                tf_id = val(row, "Id")
                nome = val(row, "First Name")
                cognome = val(row, "Last Name")
                if not nome and not cognome:
                    continue

                telefono = clean_phone(val(row, "Phone number"))
                telefono2 = clean_phone(val(row, "Secondary phone number"))

                record = {
                    "thefork_id": tf_id,
                    "titolo": val(row, "Title"),
                    "nome": nome or "",
                    "cognome": cognome or "",
                    "email": val(row, "Email") if isinstance(val(row, "Email"), str) else None,
                    "telefono": telefono,
                    "telefono2": telefono2,
                    "data_nascita": val(row, "Birthday"),
                    "lingua": val(row, "Language") or "it_IT",
                    "indirizzo": val(row, "Address"),
                    "cap": str(int(val(row, "Zipcode"))) if val(row, "Zipcode") and val(row, "Zipcode") != "None" else None,
                    "citta": val(row, "City"),
                    "paese": val(row, "Country") or "Italy",
                    "vip": bool_val(val(row, "VIP")),
                    "rank": val(row, "Rank"),
                    "promoter": bool_val(val(row, "Promoter")),
                    "newsletter": bool_val(val(row, "Newsletter")),
                    "risk_level": val(row, "Risk level"),
                    "spending_behaviour": float(val(row, "Spending behaviour")) if val(row, "Spending behaviour") else None,
                    "pref_cibo": val(row, "Food preferences"),
                    "pref_bevande": val(row, "Drinks preferences"),
                    "pref_posto": str(val(row, "Seating preferences")) if val(row, "Seating preferences") else None,
                    "restrizioni_dietetiche": val(row, "Dietary restrictions"),
                    "allergie": val(row, "Allergies and intolerances"),
                    "note_thefork": val(row, "Customer Notes"),
                    "origine": "thefork",
                    "thefork_created": val(row, "Creation date"),
                    "thefork_updated": val(row, "Last update date"),
                }

                # Upsert: cerca per thefork_id diretto O tramite alias (merge)
                existing = None
                if tf_id:
                    # 1. Cerca nel campo thefork_id principale
                    existing = conn.execute(
                        "SELECT id, protetto FROM clienti WHERE thefork_id = ?", (tf_id,)
                    ).fetchone()
                    # 2. Se non trovato, cerca negli alias (clienti mergati)
                    if not existing:
                        alias_row = conn.execute(
                            "SELECT cliente_id FROM clienti_alias WHERE thefork_id = ?", (tf_id,)
                        ).fetchone()
                        if alias_row:
                            existing = conn.execute(
                                "SELECT id, protetto FROM clienti WHERE id = ?", (alias_row["cliente_id"],)
                            ).fetchone()

                if existing:
                    # Se il cliente è protetto (editato manualmente nel CRM),
                    # NON sovrascriviamo i campi anagrafica — aggiorniamo solo
                    # i campi TheFork-specifici (date, rank, spending, ecc.)
                    if existing["protetto"]:
                        safe_fields = {
                            "rank": record["rank"],
                            "risk_level": record["risk_level"],
                            "spending_behaviour": record["spending_behaviour"],
                            "thefork_updated": record["thefork_updated"],
                        }
                        set_clause = ", ".join(f"{k}=?" for k in safe_fields)
                        conn.execute(
                            f"UPDATE clienti SET {set_clause} WHERE id = ?",
                            list(safe_fields.values()) + [existing["id"]],
                        )
                    else:
                        skip = {"thefork_id", "protetto"}
                        set_clause = ", ".join(f"{k}=?" for k in record if k not in skip)
                        values = [v for k, v in record.items() if k not in skip]
                        conn.execute(
                            f"UPDATE clienti SET {set_clause} WHERE id = ?",
                            values + [existing["id"]],
                        )
                    aggiornati += 1
                else:
                    cols = ", ".join(record.keys())
                    placeholders = ", ".join("?" for _ in record)
                    conn.execute(
                        f"INSERT INTO clienti ({cols}) VALUES ({placeholders})",
                        list(record.values()),
                    )
                    inseriti += 1

            except Exception as row_err:
                logger.warning(f"Errore riga import TheFork: {row_err}")
                errori += 1

        conn.commit()

        # Auto-tag VIP (auto=1 → tag automatico, rimovibile dall'import successivo)
        # Non tocca i tag manuali (auto=0) assegnati nel CRM
        conn.execute("""
            INSERT OR IGNORE INTO clienti_tag_assoc (cliente_id, tag_id, auto)
            SELECT c.id, t.id, 1
            FROM clienti c, clienti_tag t
            WHERE c.vip = 1 AND t.nome = 'VIP'
        """)
        # Rimuovi auto-tag VIP da chi non è più VIP in TheFork
        # (solo se il tag era automatico, non se aggiunto manualmente)
        conn.execute("""
            DELETE FROM clienti_tag_assoc
            WHERE auto = 1 AND tag_id = (SELECT id FROM clienti_tag WHERE nome = 'VIP')
            AND cliente_id NOT IN (SELECT id FROM clienti WHERE vip = 1)
        """)
        conn.commit()

        return JSONResponse({
            "status": "ok",
            "inseriti": inseriti,
            "aggiornati": aggiornati,
            "errori": errori,
            "totale_righe": len(data_rows),
        })
    except Exception as e:
        logger.exception("Errore import TheFork")
        raise HTTPException(500, str(e))
    finally:
        conn.close()
        wb.close()


# ============================================================
# ENDPOINT: IMPORT PRENOTAZIONI THEFORK XLSX
# ============================================================
@router.post("/import/prenotazioni")
async def import_prenotazioni(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Importa prenotazioni da export TheFork (XLSX).
    Usa thefork_booking_id come chiave per evitare duplicati.
    Collega automaticamente al cliente tramite Customer ID.
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "openpyxl non installato sul server")

    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(400, "File vuoto")

    headers = [str(h).strip() if h else "" for h in rows[0]]
    data_rows = rows[1:]

    def col(name):
        try:
            return headers.index(name)
        except ValueError:
            return None

    def val(row, name):
        idx = col(name)
        if idx is None or idx >= len(row):
            return None
        v = row[idx]
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return v
        return str(v).strip()

    # Colonne con nome lungo (risposte form TheFork)
    col_degustazione = None
    col_allergie_form = None
    col_tavolo_esterno = None
    col_seggioloni = None
    for i, h in enumerate(headers):
        hl = h.lower()
        if "degustazioni" in hl and "percorsi" in hl:
            col_degustazione = i
        elif "allergie o intolleranze" in hl:
            col_allergie_form = i
        elif "tavolo esterno" in hl:
            col_tavolo_esterno = i
        elif "seggioloni" in hl:
            col_seggioloni = i

    conn = get_clienti_conn()
    inseriti = 0
    aggiornati = 0
    errori = 0
    collegati = 0

    try:
        for row in data_rows:
            try:
                booking_id = val(row, "Booking ID")
                customer_id = val(row, "Customer ID")
                data_pasto = val(row, "Meal date")
                stato = val(row, "Status")
                if not data_pasto or not stato:
                    continue

                pax = val(row, "Pax")
                if isinstance(pax, str):
                    try:
                        pax = int(pax)
                    except ValueError:
                        pax = 2

                # Importo conto: "271 EUR" → "271 EUR"
                bill = val(row, "Bill amount")
                imprint_amt = val(row, "Imprint amount")

                # Risposte form (accesso sicuro: le tuple openpyxl possono essere più corte)
                def safe_col(r, idx):
                    if idx is None or idx >= len(r):
                        return None
                    return r[idx]

                degust_raw = safe_col(row, col_degustazione)
                degust = str(degust_raw).strip() if degust_raw else None
                allergie_raw = safe_col(row, col_allergie_form)
                allergie_form = str(allergie_raw).strip() if allergie_raw else None
                tav_est_raw = safe_col(row, col_tavolo_esterno)
                try:
                    tav_est = 1 if tav_est_raw and float(tav_est_raw) == 1 else 0
                except (ValueError, TypeError):
                    tav_est = 0
                segg_raw = safe_col(row, col_seggioloni)
                segg = str(segg_raw).strip() if segg_raw else None

                # Trova cliente_id interno dal thefork_id (o alias se mergato)
                cliente_id = None
                if customer_id:
                    cli_row = conn.execute(
                        "SELECT id FROM clienti WHERE thefork_id = ?", (customer_id,)
                    ).fetchone()
                    if not cli_row:
                        # Cerca negli alias (clienti mergati)
                        alias_row = conn.execute(
                            "SELECT cliente_id FROM clienti_alias WHERE thefork_id = ?", (customer_id,)
                        ).fetchone()
                        if alias_row:
                            cli_row = conn.execute(
                                "SELECT id FROM clienti WHERE id = ?", (alias_row["cliente_id"],)
                            ).fetchone()
                    if cli_row:
                        cliente_id = cli_row["id"]
                        collegati += 1

                record = {
                    "cliente_id": cliente_id,
                    "thefork_customer_id": customer_id,
                    "thefork_booking_id": booking_id,
                    "data_pasto": str(data_pasto),
                    "ora_pasto": str(val(row, "Meal time") or ""),
                    "stato": stato,
                    "pax": pax or 2,
                    "tavolo": val(row, "Table name"),
                    "canale": val(row, "Booking channel"),
                    "occasione": val(row, "Occasions"),
                    "nota_ristorante": val(row, "Note"),
                    "nota_cliente": val(row, "Note from the customer"),
                    "data_prenotazione": val(row, "Booking taken"),
                    "prenotato_da": val(row, "Booking taken by"),
                    "importo_conto": str(bill) if bill else None,
                    "sconto": float(val(row, "Discount amount")) if val(row, "Discount amount") else None,
                    "menu_preset": val(row, "Preset menu"),
                    "offerta_speciale": 1 if val(row, "Special offer") else 0,
                    "yums": 1 if val(row, "Yums") else 0,
                    "imprint": 1 if val(row, "Booking with Imprint") else 0,
                    "importo_imprint": str(imprint_amt) if imprint_amt else None,
                    "degustazione": degust if degust and degust != "nan" else None,
                    "allergie_segnalate": allergie_form if allergie_form and allergie_form != "nan" else None,
                    "tavolo_esterno": tav_est,
                    "seggioloni": segg if segg and segg != "nan" else None,
                    "waiting_list": 1 if val(row, "Waiting list") else 0,
                }

                # Upsert su booking_id
                existing = None
                if booking_id:
                    existing = conn.execute(
                        "SELECT id FROM clienti_prenotazioni WHERE thefork_booking_id = ?",
                        (booking_id,),
                    ).fetchone()

                if existing:
                    set_clause = ", ".join(f"{k}=?" for k in record if k != "thefork_booking_id")
                    values = [v for k, v in record.items() if k != "thefork_booking_id"]
                    conn.execute(
                        f"UPDATE clienti_prenotazioni SET {set_clause} WHERE thefork_booking_id = ?",
                        values + [booking_id],
                    )
                    aggiornati += 1
                else:
                    cols = ", ".join(record.keys())
                    placeholders = ", ".join("?" for _ in record)
                    conn.execute(
                        f"INSERT INTO clienti_prenotazioni ({cols}) VALUES ({placeholders})",
                        list(record.values()),
                    )
                    inseriti += 1

            except Exception as row_err:
                logger.warning(f"Errore riga import prenotazioni: {row_err}")
                errori += 1

        conn.commit()

        return JSONResponse({
            "status": "ok",
            "inseriti": inseriti,
            "aggiornati": aggiornati,
            "errori": errori,
            "collegati_a_clienti": collegati,
            "totale_righe": len(data_rows),
        })
    except Exception as e:
        logger.exception("Errore import prenotazioni")
        raise HTTPException(500, str(e))
    finally:
        conn.close()
        wb.close()


# ============================================================
# ENDPOINT: MERGE DUPLICATI
# ============================================================
class MergeRequest(BaseModel):
    principale_id: int = Field(..., description="ID del cliente da mantenere come principale")
    secondario_id: int = Field(..., description="ID del cliente duplicato da assorbire")


@router.post("/merge")
def merge_clienti(
    req: MergeRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Unisce due clienti: il secondario viene assorbito dal principale.

    Cosa succede:
    1. Le prenotazioni del secondario passano al principale
    2. Le note del secondario passano al principale
    3. I tag del secondario vengono copiati al principale (se non già presenti)
    4. Il thefork_id del secondario va in clienti_alias (così i futuri import lo riconoscono)
    5. Il secondario viene eliminato
    6. Il principale diventa "protetto" (l'import TheFork non lo sovrascrive)
    """
    if req.principale_id == req.secondario_id:
        raise HTTPException(400, "Non puoi unire un cliente con se stesso")

    conn = get_clienti_conn()
    try:
        # Verifica che entrambi esistano
        princ = conn.execute("SELECT * FROM clienti WHERE id = ?", (req.principale_id,)).fetchone()
        sec = conn.execute("SELECT * FROM clienti WHERE id = ?", (req.secondario_id,)).fetchone()
        if not princ:
            raise HTTPException(404, f"Cliente principale {req.principale_id} non trovato")
        if not sec:
            raise HTTPException(404, f"Cliente secondario {req.secondario_id} non trovato")

        # 1. Sposta prenotazioni
        conn.execute(
            "UPDATE clienti_prenotazioni SET cliente_id = ? WHERE cliente_id = ?",
            (req.principale_id, req.secondario_id),
        )

        # 2. Sposta note
        conn.execute(
            "UPDATE clienti_note SET cliente_id = ? WHERE cliente_id = ?",
            (req.principale_id, req.secondario_id),
        )

        # 3. Copia tag (solo quelli che il principale non ha già)
        conn.execute("""
            INSERT OR IGNORE INTO clienti_tag_assoc (cliente_id, tag_id, auto)
            SELECT ?, tag_id, auto FROM clienti_tag_assoc WHERE cliente_id = ?
        """, (req.principale_id, req.secondario_id))

        # 4. Salva thefork_id del secondario come alias
        if sec["thefork_id"]:
            conn.execute("""
                INSERT OR IGNORE INTO clienti_alias (cliente_id, thefork_id, merged_from_id)
                VALUES (?, ?, ?)
            """, (req.principale_id, sec["thefork_id"], req.secondario_id))

        # Salva anche eventuali alias che il secondario aveva
        conn.execute(
            "UPDATE clienti_alias SET cliente_id = ? WHERE cliente_id = ?",
            (req.principale_id, req.secondario_id),
        )

        # 5. Elimina il secondario
        conn.execute("DELETE FROM clienti WHERE id = ?", (req.secondario_id,))

        # 6. Segna il principale come protetto
        conn.execute("UPDATE clienti SET protetto = 1 WHERE id = ?", (req.principale_id,))

        conn.commit()

        # Conta prenotazioni totali del principale dopo il merge
        tot_pren = conn.execute(
            "SELECT COUNT(*) FROM clienti_prenotazioni WHERE cliente_id = ?",
            (req.principale_id,),
        ).fetchone()[0]

        return JSONResponse({
            "status": "ok",
            "message": f"Merge completato: {sec['cognome']} {sec['nome']} → {princ['cognome']} {princ['nome']}",
            "principale_id": req.principale_id,
            "prenotazioni_totali": tot_pren,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Errore merge clienti")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.get("/duplicati/suggerimenti")
def suggerisci_duplicati(
    limit: int = Query(50, ge=1, le=200),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Suggerisce possibili duplicati basandosi su:
    - Stesso cognome+nome (case insensitive)
    - Stesso telefono
    - Stessa email
    """
    conn = get_clienti_conn()
    try:
        duplicati = []

        # Per cognome+nome
        rows = conn.execute("""
            SELECT LOWER(cognome) as lcog, LOWER(nome) as lnom,
                   GROUP_CONCAT(id) as ids, COUNT(*) as cnt
            FROM clienti
            WHERE cognome != '' AND nome != ''
            GROUP BY lcog, lnom
            HAVING cnt > 1
            ORDER BY cnt DESC
            LIMIT ?
        """, (limit,)).fetchall()

        for r in rows:
            ids = [int(x) for x in r["ids"].split(",")]
            clienti_detail = []
            for cid in ids:
                c = conn.execute(
                    "SELECT id, cognome, nome, telefono, email, thefork_id FROM clienti WHERE id = ?",
                    (cid,),
                ).fetchone()
                pren_count = conn.execute(
                    "SELECT COUNT(*) FROM clienti_prenotazioni WHERE cliente_id = ?",
                    (cid,),
                ).fetchone()[0]
                if c:
                    clienti_detail.append({**dict(c), "prenotazioni": pren_count})
            duplicati.append({
                "tipo": "nome",
                "match": f"{r['lcog']} {r['lnom']}",
                "clienti": clienti_detail,
            })

        # Per telefono
        rows_tel = conn.execute("""
            SELECT telefono, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
            FROM clienti
            WHERE telefono IS NOT NULL AND telefono != ''
            GROUP BY telefono
            HAVING cnt > 1
            ORDER BY cnt DESC
            LIMIT ?
        """, (limit,)).fetchall()

        existing_pairs = {frozenset(c["id"] for c in d["clienti"]) for d in duplicati if d.get("clienti")}
        for r in rows_tel:
            ids = [int(x) for x in r["ids"].split(",")]
            if frozenset(ids) in existing_pairs:
                continue
            clienti_detail = []
            for cid in ids:
                c = conn.execute(
                    "SELECT id, cognome, nome, telefono, email, thefork_id FROM clienti WHERE id = ?",
                    (cid,),
                ).fetchone()
                pren_count = conn.execute(
                    "SELECT COUNT(*) FROM clienti_prenotazioni WHERE cliente_id = ?",
                    (cid,),
                ).fetchone()[0]
                if c:
                    clienti_detail.append({**dict(c), "prenotazioni": pren_count})
            duplicati.append({
                "tipo": "telefono",
                "match": r["telefono"],
                "clienti": clienti_detail,
            })

        return JSONResponse({"duplicati": duplicati, "totale": len(duplicati)})
    finally:
        conn.close()


# ============================================================
# ENDPOINT: LISTA PRENOTAZIONI (globale, con filtri)
# ============================================================
@router.get("/prenotazioni/lista")
def lista_prenotazioni(
    q: Optional[str] = None,
    stato: Optional[str] = None,
    canale: Optional[str] = None,
    data_da: Optional[str] = None,
    data_a: Optional[str] = None,
    cliente_id: Optional[int] = None,
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        where = []
        params = []

        if stato:
            where.append("p.stato = ?")
            params.append(stato)
        if canale:
            where.append("p.canale = ?")
            params.append(canale)
        if data_da:
            where.append("p.data_pasto >= ?")
            params.append(data_da)
        if data_a:
            where.append("p.data_pasto <= ?")
            params.append(data_a)
        if cliente_id:
            where.append("p.cliente_id = ?")
            params.append(cliente_id)
        if q:
            where.append(
                "(c.nome LIKE ? OR c.cognome LIKE ? OR p.nota_ristorante LIKE ? OR p.nota_cliente LIKE ?)"
            )
            like = f"%{q}%"
            params.extend([like, like, like, like])

        where_sql = " AND ".join(where) if where else "1=1"

        count_row = conn.execute(
            f"""SELECT COUNT(*) as tot
                FROM clienti_prenotazioni p
                LEFT JOIN clienti c ON c.id = p.cliente_id
                WHERE {where_sql}""",
            params,
        ).fetchone()
        totale = count_row["tot"]

        rows = conn.execute(
            f"""
            SELECT p.*,
                   c.nome as cliente_nome,
                   c.cognome as cliente_cognome,
                   c.telefono as cliente_telefono,
                   c.vip as cliente_vip
            FROM clienti_prenotazioni p
            LEFT JOIN clienti c ON c.id = p.cliente_id
            WHERE {where_sql}
            ORDER BY p.data_pasto DESC, p.ora_pasto DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()

        return JSONResponse({
            "prenotazioni": [dict(r) for r in rows],
            "totale": totale,
            "limit": limit,
            "offset": offset,
        })
    except Exception as e:
        logger.exception("Errore lista prenotazioni")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: STATS PRENOTAZIONI (per dashboard)
# ============================================================
@router.get("/prenotazioni/stats")
def prenotazioni_stats(
    anno: Optional[int] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        year_filter = ""
        params = []
        if anno:
            year_filter = "AND substr(data_pasto, 1, 4) = ?"
            params.append(str(anno))

        stats = {}

        stats["totale"] = conn.execute(
            f"SELECT COUNT(*) FROM clienti_prenotazioni WHERE 1=1 {year_filter}", params
        ).fetchone()[0]

        # Per stato
        stati = conn.execute(
            f"SELECT stato, COUNT(*) as n FROM clienti_prenotazioni WHERE 1=1 {year_filter} GROUP BY stato ORDER BY n DESC",
            params,
        ).fetchall()
        stats["per_stato"] = [dict(r) for r in stati]

        # Per canale
        canali = conn.execute(
            f"SELECT COALESCE(canale, 'n/d') as canale, COUNT(*) as n FROM clienti_prenotazioni WHERE 1=1 {year_filter} GROUP BY canale ORDER BY n DESC",
            params,
        ).fetchall()
        stats["per_canale"] = [dict(r) for r in canali]

        # Pax medio
        pax_avg = conn.execute(
            f"SELECT AVG(pax) as avg_pax, SUM(pax) as tot_pax FROM clienti_prenotazioni WHERE stato IN ('SEATED','ARRIVED','BILL','LEFT') {year_filter}",
            params,
        ).fetchone()
        stats["pax_medio"] = round(pax_avg["avg_pax"], 1) if pax_avg["avg_pax"] else 0
        stats["pax_totale"] = pax_avg["tot_pax"] or 0

        # No-show
        stats["no_show"] = conn.execute(
            f"SELECT COUNT(*) FROM clienti_prenotazioni WHERE stato = 'NO_SHOW' {year_filter}", params
        ).fetchone()[0]

        # Cancellazioni
        stats["cancellazioni"] = conn.execute(
            f"SELECT COUNT(*) FROM clienti_prenotazioni WHERE stato = 'CANCELED' {year_filter}", params
        ).fetchone()[0]

        # Per mese (ultimi 12 mesi)
        per_mese = conn.execute(
            """
            SELECT substr(data_pasto, 1, 7) as mese, COUNT(*) as n, SUM(pax) as pax
            FROM clienti_prenotazioni
            WHERE stato IN ('SEATED','ARRIVED','BILL','LEFT')
              AND data_pasto >= date('now', '-12 months')
            GROUP BY mese ORDER BY mese
            """
        ).fetchall()
        stats["per_mese"] = [dict(r) for r in per_mese]

        # Top clienti (più prenotazioni seated)
        top = conn.execute(
            f"""
            SELECT c.id, c.nome, c.cognome, c.vip,
                   COUNT(*) as n_prenotazioni,
                   SUM(p.pax) as tot_pax
            FROM clienti_prenotazioni p
            JOIN clienti c ON c.id = p.cliente_id
            WHERE p.stato IN ('SEATED','ARRIVED','BILL','LEFT') {year_filter}
            GROUP BY c.id
            ORDER BY n_prenotazioni DESC
            LIMIT 20
            """,
            params,
        ).fetchall()
        stats["top_clienti"] = [dict(r) for r in top]

        # Anni disponibili
        anni = conn.execute(
            "SELECT DISTINCT substr(data_pasto, 1, 4) as anno FROM clienti_prenotazioni ORDER BY anno DESC"
        ).fetchall()
        stats["anni_disponibili"] = [r["anno"] for r in anni]

        return JSONResponse(stats)
    except Exception as e:
        logger.exception("Errore stats prenotazioni")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: LISTA CLIENTI (con ricerca e filtri)
# ============================================================
@router.get("/")
def lista_clienti(
    q: Optional[str] = None,
    vip: Optional[bool] = None,
    tag_id: Optional[int] = None,
    rank: Optional[str] = None,
    attivo: Optional[bool] = True,
    compleanno_entro_giorni: Optional[int] = None,
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    ordine: str = Query("cognome_asc"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        where = []
        params = []

        if attivo is not None:
            where.append("c.attivo = ?")
            params.append(1 if attivo else 0)

        if vip is not None:
            where.append("c.vip = ?")
            params.append(1 if vip else 0)

        if rank:
            where.append("c.rank = ?")
            params.append(rank)

        if q:
            where.append(
                "(c.nome LIKE ? OR c.cognome LIKE ? OR c.email LIKE ? OR c.telefono LIKE ? OR c.note_thefork LIKE ?)"
            )
            like = f"%{q}%"
            params.extend([like, like, like, like, like])

        if tag_id:
            where.append("c.id IN (SELECT cliente_id FROM clienti_tag_assoc WHERE tag_id = ?)")
            params.append(tag_id)

        if compleanno_entro_giorni:
            # Filtra clienti con compleanno nei prossimi N giorni
            today = date.today()
            where.append("c.data_nascita IS NOT NULL")
            date_conditions = []
            for i in range(compleanno_entro_giorni + 1):
                d = today + timedelta(days=i)
                date_conditions.append(f"substr(c.data_nascita, 1, 5) = '{d.strftime('%d/%m')}'")
            if date_conditions:
                where.append(f"({' OR '.join(date_conditions)})")

        where_sql = " AND ".join(where) if where else "1=1"

        # Ordinamento
        order_map = {
            "cognome_asc": "c.cognome ASC, c.nome ASC",
            "cognome_desc": "c.cognome DESC, c.nome DESC",
            "recente": "c.created_at DESC",
            "ultima_modifica": "c.updated_at DESC",
            "vip_first": "c.vip DESC, c.cognome ASC",
        }
        order_sql = order_map.get(ordine, "c.cognome ASC, c.nome ASC")

        # Count totale
        count_row = conn.execute(
            f"SELECT COUNT(*) as tot FROM clienti c WHERE {where_sql}", params
        ).fetchone()
        totale = count_row["tot"]

        # Fetch pagina
        rows = conn.execute(
            f"""
            SELECT c.*,
                   GROUP_CONCAT(t.nome, ', ') as tags
            FROM clienti c
            LEFT JOIN clienti_tag_assoc ta ON ta.cliente_id = c.id
            LEFT JOIN clienti_tag t ON t.id = ta.tag_id
            WHERE {where_sql}
            GROUP BY c.id
            ORDER BY {order_sql}
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()

        return JSONResponse({
            "clienti": [dict(r) for r in rows],
            "totale": totale,
            "limit": limit,
            "offset": offset,
        })
    except Exception as e:
        logger.exception("Errore lista clienti")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: DETTAGLIO CLIENTE (con tag e note)
# ============================================================
@router.get("/{cliente_id}")
def get_cliente(
    cliente_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        row = conn.execute("SELECT * FROM clienti WHERE id = ?", (cliente_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Cliente non trovato")

        cliente = dict(row)

        # Tag associati
        tags = conn.execute(
            """
            SELECT t.id, t.nome, t.colore
            FROM clienti_tag t
            JOIN clienti_tag_assoc ta ON ta.tag_id = t.id
            WHERE ta.cliente_id = ?
            ORDER BY t.ordine
            """,
            (cliente_id,),
        ).fetchall()
        cliente["tags"] = [dict(t) for t in tags]

        # Note/diario
        note = conn.execute(
            "SELECT * FROM clienti_note WHERE cliente_id = ? ORDER BY data DESC, created_at DESC",
            (cliente_id,),
        ).fetchall()
        cliente["note"] = [dict(n) for n in note]

        # Prenotazioni (ultime 50)
        prenotazioni = conn.execute(
            """SELECT * FROM clienti_prenotazioni
               WHERE cliente_id = ?
               ORDER BY data_pasto DESC, ora_pasto DESC
               LIMIT 50""",
            (cliente_id,),
        ).fetchall()
        cliente["prenotazioni"] = [dict(p) for p in prenotazioni]

        # Stats prenotazioni cliente
        pren_stats = conn.execute(
            """SELECT
                 COUNT(*) as totale,
                 SUM(CASE WHEN stato IN ('SEATED','ARRIVED','BILL','LEFT') THEN 1 ELSE 0 END) as completate,
                 SUM(CASE WHEN stato = 'NO_SHOW' THEN 1 ELSE 0 END) as no_show,
                 SUM(CASE WHEN stato = 'CANCELED' THEN 1 ELSE 0 END) as cancellate,
                 ROUND(AVG(pax), 1) as pax_medio,
                 MIN(data_pasto) as prima_visita,
                 MAX(data_pasto) as ultima_visita
               FROM clienti_prenotazioni WHERE cliente_id = ?""",
            (cliente_id,),
        ).fetchone()
        cliente["prenotazioni_stats"] = dict(pren_stats) if pren_stats else {}

        return JSONResponse(cliente)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Errore dettaglio cliente")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: CREA CLIENTE
# ============================================================
@router.post("/")
def crea_cliente(
    body: ClienteCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        cur = conn.execute(
            """
            INSERT INTO clienti (titolo, nome, cognome, email, telefono, telefono2,
                data_nascita, lingua, indirizzo, cap, citta, paese,
                vip, rank, promoter, newsletter, risk_level,
                pref_cibo, pref_bevande, pref_posto, restrizioni_dietetiche, allergie,
                note_thefork, attivo, origine)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                body.titolo, body.nome, body.cognome, body.email,
                body.telefono, body.telefono2, body.data_nascita, body.lingua,
                body.indirizzo, body.cap, body.citta, body.paese,
                1 if body.vip else 0, body.rank,
                1 if body.promoter else 0, 1 if body.newsletter else 0,
                body.risk_level,
                body.pref_cibo, body.pref_bevande, body.pref_posto,
                body.restrizioni_dietetiche, body.allergie,
                body.note_thefork, 1 if body.attivo else 0, body.origine,
            ),
        )
        conn.commit()
        return JSONResponse({"id": cur.lastrowid, "status": "ok"})
    except Exception as e:
        logger.exception("Errore creazione cliente")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: MODIFICA CLIENTE
# ============================================================
@router.put("/{cliente_id}")
def modifica_cliente(
    cliente_id: int,
    body: ClienteUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        existing = conn.execute("SELECT id FROM clienti WHERE id = ?", (cliente_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Cliente non trovato")

        conn.execute(
            """
            UPDATE clienti SET
                titolo=?, nome=?, cognome=?, email=?, telefono=?, telefono2=?,
                data_nascita=?, lingua=?, indirizzo=?, cap=?, citta=?, paese=?,
                vip=?, rank=?, promoter=?, newsletter=?, risk_level=?,
                pref_cibo=?, pref_bevande=?, pref_posto=?, restrizioni_dietetiche=?, allergie=?,
                note_thefork=?, attivo=?, origine=?,
                protetto=1
            WHERE id=?
            """,
            (
                body.titolo, body.nome, body.cognome, body.email,
                body.telefono, body.telefono2, body.data_nascita, body.lingua,
                body.indirizzo, body.cap, body.citta, body.paese,
                1 if body.vip else 0, body.rank,
                1 if body.promoter else 0, 1 if body.newsletter else 0,
                body.risk_level,
                body.pref_cibo, body.pref_bevande, body.pref_posto,
                body.restrizioni_dietetiche, body.allergie,
                body.note_thefork, 1 if body.attivo else 0, body.origine,
                cliente_id,
            ),
        )
        conn.commit()
        return JSONResponse({"status": "ok"})
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Errore modifica cliente")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: ELIMINA CLIENTE (soft delete)
# ============================================================
@router.delete("/{cliente_id}")
def elimina_cliente(
    cliente_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        conn.execute("UPDATE clienti SET attivo = 0 WHERE id = ?", (cliente_id,))
        conn.commit()
        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.exception("Errore eliminazione cliente")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ============================================================
# ENDPOINT: ASSOCIA / RIMUOVI TAG A CLIENTE
# ============================================================
@router.post("/{cliente_id}/tag/{tag_id}")
def associa_tag(
    cliente_id: int,
    tag_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO clienti_tag_assoc (cliente_id, tag_id, auto) VALUES (?,?,0)",
            (cliente_id, tag_id),
        )
        # Se il tag era automatico, convertilo in manuale (non verrà rimosso dall'import)
        conn.execute(
            "UPDATE clienti_tag_assoc SET auto = 0 WHERE cliente_id = ? AND tag_id = ?",
            (cliente_id, tag_id),
        )
        conn.commit()
        return JSONResponse({"status": "ok"})
    finally:
        conn.close()


@router.delete("/{cliente_id}/tag/{tag_id}")
def rimuovi_tag(
    cliente_id: int,
    tag_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        conn.execute(
            "DELETE FROM clienti_tag_assoc WHERE cliente_id = ? AND tag_id = ?",
            (cliente_id, tag_id),
        )
        conn.commit()
        return JSONResponse({"status": "ok"})
    finally:
        conn.close()


# ============================================================
# ENDPOINT: NOTE CLIENTE
# ============================================================
@router.post("/{cliente_id}/note")
def aggiungi_nota(
    cliente_id: int,
    body: NotaCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        data = body.data or date.today().isoformat()
        autore = body.autore or current_user.get("sub", "")
        cur = conn.execute(
            "INSERT INTO clienti_note (cliente_id, tipo, testo, data, autore) VALUES (?,?,?,?,?)",
            (cliente_id, body.tipo, body.testo, data, autore),
        )
        conn.commit()
        return JSONResponse({"id": cur.lastrowid, "status": "ok"})
    except Exception as e:
        logger.exception("Errore creazione nota")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.delete("/{cliente_id}/note/{nota_id}")
def elimina_nota(
    cliente_id: int,
    nota_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    conn = get_clienti_conn()
    try:
        conn.execute(
            "DELETE FROM clienti_note WHERE id = ? AND cliente_id = ?",
            (nota_id, cliente_id),
        )
        conn.commit()
        return JSONResponse({"status": "ok"})
    finally:
        conn.close()
