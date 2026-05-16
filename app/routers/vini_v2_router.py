# Modulo: vini
"""
Router read-only del nuovo modulo "Gestione Vino 2" (V.6+V.7+V.8 — test parallelo).

Prefisso: /vini/v2/...
Database: vini_magazzino.sqlite3, tabelle `_v2` (vini_bottiglie_v2, vini_madre_v2,
vini_produttori_v2, vini_fornitori_v2, vini_denominazioni_v2, vini_vitigni_v2).

Strategia (concordata con Marco 2026-05-15):
  - Modulo PARALLELO al Vini classico
  - READ-ONLY: tutti gli endpoint sono GET. Le modifiche restano sul modulo
    classico che scrive su `vini_magazzino`. Niente sync da mantenere, niente
    rischio di drift.
  - Test parallelo per 1-3 settimane → poi cutover atomico (Fase 10) che
    swappa i nomi delle tabelle e questo router diventa quello "vero".

Vedi `docs/refactor_anagrafiche_vini.md` per il design completo.
"""

from __future__ import annotations
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.auth_service import get_current_user
from app.models.vini_magazzino_db import get_magazzino_connection
from app.models.vini_anagrafiche_db import TABELLE


router = APIRouter(
    prefix="/vini/v2",
    tags=["Vini v2 — Gestione Vino 2 (test parallelo)"],
)


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {k: row[k] for k in row.keys()} if row else None


# ============================================================
# SELECT base — JOIN bottiglia + madre + produttore + denominazione
# ============================================================
# La SELECT include:
#  - tutti i campi di vini_bottiglie_v2 (b.*)
#  - i campi anagrafici "ricalcolati" dal madre (con prefisso m_*) per
#    permettere alla UI di mostrare etichetta madre + bottiglia in un colpo
#  - nome produttore (p_nome), denominazione formattata (d_display)
_BASE_SELECT_BOTTIGLIE = f"""
    SELECT
        b.*,
        m.id            AS m_id,
        m.descrizione   AS m_descrizione,
        m.tipologia     AS m_tipologia,
        m.produttore_id AS m_produttore_id,
        m.fornitore_id  AS m_fornitore_id,
        m.denominazione_id AS m_denominazione_id,
        m.grado_alcolico_tipico AS m_grado_alcolico_tipico,
        m.abbinamenti   AS m_abbinamenti,
        m.note_madre    AS m_note_madre,
        p.nome          AS p_nome,
        p.nazione       AS p_nazione,
        p.regione       AS p_regione,
        f.nome          AS f_nome,
        f.rappresentante_nome AS f_rappresentante_nome,
        CASE WHEN d.id IS NOT NULL THEN d.nome || ' ' || d.tipo ELSE NULL END AS d_display,
        d.tipo          AS d_tipo,
        d.tipo_ue       AS d_tipo_ue
    FROM {TABELLE['bottiglie']} b
    LEFT JOIN {TABELLE['madre']}         m ON m.id = b.madre_id
    LEFT JOIN {TABELLE['produttori']}    p ON p.id = m.produttore_id
    LEFT JOIN {TABELLE['fornitori']}     f ON f.id = m.fornitore_id
    LEFT JOIN {TABELLE['denominazioni']} d ON d.id = m.denominazione_id
"""


# ============================================================
# BOTTIGLIE — lista con filtri (replica i filtri di MagazzinoVini.jsx)
# ============================================================
@router.get("/bottiglie/", summary="Lista bottiglie v2 con filtri")
def list_bottiglie(
    search: Optional[str] = Query(None, description="testo libero su descrizione/produttore/denominazione"),
    id_search: Optional[str] = Query(None, description="ricerca per ID bottiglia"),
    tipologia: Optional[str] = Query(None),
    nazione: Optional[str] = Query(None),
    regione: Optional[str] = Query(None),
    produttore: Optional[str] = Query(None, description="nome produttore (LIKE)"),
    distributore: Optional[str] = Query(None),
    rappresentante: Optional[str] = Query(None),
    stato_vendita: Optional[int] = Query(None, ge=0, le=3),
    stato_riordino: Optional[str] = Query(None),
    stato_conservazione: Optional[str] = Query(None),
    carta: Optional[int] = Query(None, ge=0, le=1),
    ipratico: Optional[int] = Query(None, ge=0, le=1),
    biologico: Optional[int] = Query(None, ge=0, le=1),
    calice: Optional[int] = Query(None, ge=0, le=1),
    # Locazioni: LIKE su FRIGORIFERO/LOCAZIONE_1/2/3 e su spazio (concatenato in LOC text)
    locazione: Optional[str] = Query(None, description="nome locazione (FRIGORIFERO o LOCAZIONE_1/2/3)"),
    spazio: Optional[str] = Query(None, description="spazio dentro la locazione (LIKE)"),
    # Range giacenza
    qta_min: Optional[int] = Query(None, ge=0),
    qta_max: Optional[int] = Query(None, ge=0),
    # Range prezzo carta
    prezzo_min: Optional[float] = Query(None, ge=0),
    prezzo_max: Optional[float] = Query(None, ge=0),
    only_positive_stock: bool = Query(False),
    only_missing_listino: bool = Query(False),
    limit: int = Query(2000, ge=1, le=10000),
    current_user: Any = Depends(get_current_user),
):
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    where = []
    params: list = []

    if search:
        where.append(
            "(b.DESCRIZIONE LIKE ? OR b.PRODUTTORE LIKE ? OR b.DENOMINAZIONE LIKE ? "
            "OR m.descrizione LIKE ? OR p.nome LIKE ? OR d.nome LIKE ?)"
        )
        like = f"%{search}%"
        params.extend([like] * 6)

    if id_search:
        where.append("CAST(b.id AS TEXT) LIKE ?")
        params.append(f"%{id_search}%")

    if tipologia:
        where.append("(b.TIPOLOGIA = ? OR m.tipologia = ?)")
        params.extend([tipologia, tipologia])
    if nazione:
        where.append("(b.NAZIONE = ? OR p.nazione = ?)")
        params.extend([nazione, nazione])
    if regione:
        where.append("(b.REGIONE = ? OR p.regione = ?)")
        params.extend([regione, regione])
    if produttore:
        where.append("(b.PRODUTTORE LIKE ? OR p.nome LIKE ?)")
        params.extend([f"%{produttore}%", f"%{produttore}%"])
    if distributore:
        where.append("(b.DISTRIBUTORE LIKE ? OR f.nome LIKE ?)")
        params.extend([f"%{distributore}%", f"%{distributore}%"])

    if stato_vendita is not None:
        where.append("b.STATO_VENDITA = ?")
        params.append(stato_vendita)
    if stato_riordino:
        where.append("b.STATO_RIORDINO = ?")
        params.append(stato_riordino)
    if stato_conservazione:
        where.append("b.STATO_CONSERVAZIONE = ?")
        params.append(stato_conservazione)

    if carta is not None:
        where.append("b.CARTA = ?")
        params.append(carta)
    if ipratico is not None:
        where.append("b.IPRATICO = ?")
        params.append(ipratico)
    if biologico is not None:
        where.append("b.BIOLOGICO = ?")
        params.append(biologico)
    if calice is not None:
        where.append("b.VENDITA_CALICE = ?")
        params.append(calice)

    if rappresentante:
        where.append("(b.RAPPRESENTANTE LIKE ? OR f.rappresentante_nome LIKE ?)")
        params.extend([f"%{rappresentante}%", f"%{rappresentante}%"])

    if locazione:
        # match su frigorifero o una delle 3 locazioni
        where.append(
            "(b.FRIGORIFERO LIKE ? OR b.LOCAZIONE_1 LIKE ? OR b.LOCAZIONE_2 LIKE ? OR b.LOCAZIONE_3 LIKE ?)"
        )
        like = f"%{locazione}%"
        params.extend([like, like, like, like])
    if spazio:
        # spazio è codificato spesso dentro LOCAZIONE_N (es "Cantina-A2") — LIKE generico
        where.append(
            "(b.LOCAZIONE_1 LIKE ? OR b.LOCAZIONE_2 LIKE ? OR b.LOCAZIONE_3 LIKE ?)"
        )
        like = f"%{spazio}%"
        params.extend([like, like, like])

    if qta_min is not None:
        where.append("COALESCE(b.QTA_TOTALE, 0) >= ?")
        params.append(qta_min)
    if qta_max is not None:
        where.append("COALESCE(b.QTA_TOTALE, 0) <= ?")
        params.append(qta_max)

    if prezzo_min is not None:
        where.append("CAST(COALESCE(b.PREZZO_CARTA, 0) AS REAL) >= ?")
        params.append(prezzo_min)
    if prezzo_max is not None:
        where.append("CAST(COALESCE(b.PREZZO_CARTA, 0) AS REAL) <= ?")
        params.append(prezzo_max)

    if only_positive_stock:
        where.append("COALESCE(b.QTA_TOTALE, 0) > 0")
    if only_missing_listino:
        where.append("(b.EURO_LISTINO IS NULL OR b.EURO_LISTINO = '' OR b.EURO_LISTINO = 0)")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = cur.execute(
        f"{_BASE_SELECT_BOTTIGLIE} {where_sql} ORDER BY b.DESCRIZIONE, b.ANNATA DESC LIMIT ?",
        params + [limit],
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@router.get("/bottiglie/{bid}", summary="Dettaglio bottiglia v2 con info madre")
def get_bottiglia(bid: int, current_user: Any = Depends(get_current_user)):
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    row = cur.execute(
        f"{_BASE_SELECT_BOTTIGLIE} WHERE b.id = ?", (bid,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Bottiglia non trovata")
    return _row_to_dict(row)


# ============================================================
# MADRI RAGGRUPPATE — vista "Visualizza madri"
# ============================================================
@router.get("/madri-raggruppate/", summary="Lista madri con annate nested (vista raggruppata)")
def list_madri_raggruppate(
    search: Optional[str] = Query(None),
    tipologia: Optional[str] = Query(None),
    produttore_id: Optional[int] = Query(None),
    only_positive_stock: bool = Query(False),
    current_user: Any = Depends(get_current_user),
):
    """Ritorna lista madri con campi anagrafici + array annate sotto.
    Pensato per la vista "Visualizza Madri" del modulo Gestione 2."""
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    where_m = []
    params: list = []
    if search:
        where_m.append("(m.descrizione LIKE ? OR p.nome LIKE ? OR d.nome LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like])
    if tipologia:
        where_m.append("m.tipologia = ?")
        params.append(tipologia)
    if produttore_id is not None:
        where_m.append("m.produttore_id = ?")
        params.append(produttore_id)

    where_sql = ("WHERE " + " AND ".join(where_m)) if where_m else ""

    madri = cur.execute(
        f"""
        SELECT
            m.id, m.descrizione, m.tipologia,
            m.produttore_id, m.fornitore_id, m.denominazione_id,
            m.abbinamenti, m.note_madre, m.grado_alcolico_tipico,
            COALESCE(m.nazione, p.nazione) AS nazione,
            COALESCE(m.regione, p.regione) AS regione,
            p.nome AS produttore_nome,
            f.nome AS fornitore_nome,
            f.rappresentante_nome,
            CASE WHEN d.id IS NOT NULL THEN d.nome || ' ' || d.tipo ELSE NULL END AS denominazione_display,
            (SELECT COUNT(*) FROM {TABELLE['bottiglie']} b WHERE b.madre_id = m.id) AS n_annate,
            (SELECT COALESCE(SUM(b.QTA_TOTALE), 0) FROM {TABELLE['bottiglie']} b WHERE b.madre_id = m.id) AS qta_tot
        FROM {TABELLE['madre']} m
        JOIN {TABELLE['produttori']} p ON p.id = m.produttore_id
        LEFT JOIN {TABELLE['fornitori']} f ON f.id = m.fornitore_id
        LEFT JOIN {TABELLE['denominazioni']} d ON d.id = m.denominazione_id
        {where_sql}
        ORDER BY m.descrizione
        """,
        params,
    ).fetchall()

    out = []
    for m in madri:
        m_dict = _row_to_dict(m)
        if only_positive_stock and (m_dict.get("qta_tot") or 0) == 0:
            continue
        # carica annate per questo madre
        annate = cur.execute(
            f"""
            SELECT id, ANNATA, FORMATO, PREZZO_CARTA, EURO_LISTINO,
                   QTA_TOTALE, STATO_VENDITA, STATO_RIORDINO,
                   FRIGORIFERO, QTA_FRIGO,
                   LOCAZIONE_1, QTA_LOC1, LOCAZIONE_2, QTA_LOC2, LOCAZIONE_3, QTA_LOC3,
                   CARTA, VENDITA_CALICE, BIOLOGICO, BOTTIGLIA_APERTA
            FROM {TABELLE['bottiglie']}
            WHERE madre_id = ?
            ORDER BY
              CASE WHEN ANNATA = '' OR ANNATA IS NULL THEN 1 ELSE 0 END,
              ANNATA DESC, FORMATO
            """,
            (m_dict["id"],),
        ).fetchall()
        m_dict["annate"] = [_row_to_dict(r) for r in annate]
        out.append(m_dict)

    conn.close()
    return out


# ============================================================
# DASHBOARD — KPI base modulo v2
# ============================================================
@router.get("/dashboard/", summary="Statistiche aggregate modulo v2")
def dashboard(current_user: Any = Depends(get_current_user)):
    """KPI sintetici per la pagina di entry del modulo v2:
      - n bottiglie totali
      - n bottiglie con giacenza
      - n vini madre
      - somma valore carta (sui vini in cantina)
      - riepilogo per tipologia (n etichette, n bottiglie, esaurite)"""
    conn = get_magazzino_connection()
    cur = conn.cursor()

    tot_bottiglie = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['bottiglie']}"
    ).fetchone()[0]

    bottiglie_in_giacenza = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['bottiglie']} WHERE COALESCE(QTA_TOTALE, 0) > 0"
    ).fetchone()[0]

    n_madri = cur.execute(
        f"SELECT COUNT(*) FROM {TABELLE['madre']}"
    ).fetchone()[0]

    qta_bottiglie_tot = cur.execute(
        f"SELECT COALESCE(SUM(QTA_TOTALE), 0) FROM {TABELLE['bottiglie']}"
    ).fetchone()[0]

    valore_carta = cur.execute(
        f"""SELECT COALESCE(SUM(
                CASE WHEN COALESCE(QTA_TOTALE,0) > 0 AND PREZZO_CARTA IS NOT NULL
                     THEN PREZZO_CARTA * QTA_TOTALE
                     ELSE 0 END), 0)
            FROM {TABELLE['bottiglie']}"""
    ).fetchone()[0]

    # Riepilogo per tipologia
    riepilogo = cur.execute(
        f"""
        SELECT
            COALESCE(TIPOLOGIA, '(senza)') AS tipologia,
            COUNT(*) AS n_etichette,
            COALESCE(SUM(QTA_TOTALE), 0) AS n_bottiglie,
            SUM(CASE WHEN COALESCE(QTA_TOTALE,0) = 0 THEN 1 ELSE 0 END) AS n_esaurite
        FROM {TABELLE['bottiglie']}
        GROUP BY tipologia
        ORDER BY n_etichette DESC
        """
    ).fetchall()

    conn.close()
    return {
        "tot_bottiglie": tot_bottiglie,
        "bottiglie_in_giacenza": bottiglie_in_giacenza,
        "n_madri": n_madri,
        "qta_bottiglie_tot": qta_bottiglie_tot,
        "valore_carta": round(valore_carta, 2),
        "riepilogo_tipologie": [
            {"tipologia": r[0], "n_etichette": r[1], "n_bottiglie": r[2], "n_esaurite": r[3]}
            for r in riepilogo
        ],
    }


# ============================================================
# SCHEDA MADRE — endpoint aggregati per la SchedaMadreV2 (Fase 8 step 4)
# ============================================================

@router.get("/madre/{mid}/movimenti", summary="Movimenti aggregati di tutte le annate del madre")
def list_movimenti_madre(
    mid: int,
    limit: int = Query(500, ge=1, le=5000),
    current_user: Any = Depends(get_current_user),
):
    """
    Tutti i movimenti delle bottiglie collegate al madre, ordinati per data DESC.
    Include l'ANNATA della bottiglia per distinguere quale annata ha generato il movimento.
    """
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Verifica esistenza madre
    if not cur.execute(
        f"SELECT id FROM {TABELLE['madre']} WHERE id = ?", (mid,)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Vino madre non trovato")

    # Trova bottiglie del madre
    bottiglie_ids = [
        r[0] for r in cur.execute(
            f"SELECT id FROM {TABELLE['bottiglie']} WHERE madre_id = ?", (mid,)
        ).fetchall()
    ]
    if not bottiglie_ids:
        conn.close()
        return []

    placeholders = ",".join(["?"] * len(bottiglie_ids))
    rows = cur.execute(
        f"""
        SELECT m.*, b.ANNATA, b.FORMATO
        FROM vini_magazzino_movimenti m
        LEFT JOIN {TABELLE['bottiglie']} b ON b.id = m.vino_id
        WHERE m.vino_id IN ({placeholders})
        ORDER BY datetime(m.data_mov) DESC, m.id DESC
        LIMIT ?
        """,
        bottiglie_ids + [limit],
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


@router.get("/madre/{mid}/stats", summary="Statistiche aggregate del vino madre")
def stats_madre(mid: int, current_user: Any = Depends(get_current_user)):
    """
    KPI aggregati per il vino madre:
      - grado_alcolico_medio (media dei GRADO_ALCOLICO delle annate)
      - vendite_totali (somma qta VENDITA su tutto lo storico)
      - ricavo_totale (somma qta * prezzo_carta delle vendite)
      - bt_mese_medio (vendite ultimi 60gg / 2)
      - prima_vendita / ultima_vendita
      - valore_carta_attuale (somma prezzo * qta delle annate in cantina)
    """
    conn = get_magazzino_connection()
    cur = conn.cursor()

    # Verifica esistenza madre
    if not cur.execute(
        f"SELECT id FROM {TABELLE['madre']} WHERE id = ?", (mid,)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Vino madre non trovato")

    # Grado alcolico medio (sulle annate che hanno il dato)
    grado = cur.execute(
        f"""
        SELECT AVG(CAST(GRADO_ALCOLICO AS REAL))
        FROM {TABELLE['bottiglie']}
        WHERE madre_id = ?
          AND GRADO_ALCOLICO IS NOT NULL
          AND GRADO_ALCOLICO != ''
          AND CAST(GRADO_ALCOLICO AS REAL) > 0
        """,
        (mid,),
    ).fetchone()[0]

    # Bottiglie del madre
    bottiglie_ids = [
        r[0] for r in cur.execute(
            f"SELECT id FROM {TABELLE['bottiglie']} WHERE madre_id = ?", (mid,)
        ).fetchall()
    ]

    vendite_totali = 0
    ricavo_totale = 0.0
    bt_60gg = 0
    prima_vendita = None
    ultima_vendita = None
    if bottiglie_ids:
        placeholders = ",".join(["?"] * len(bottiglie_ids))
        # Vendite totali (qta + ricavo stimato via prezzo_unitario o prezzo_carta)
        r = cur.execute(
            f"""
            SELECT COALESCE(SUM(qta), 0) AS qta_tot,
                   COALESCE(SUM(qta * COALESCE(prezzo_unitario, 0)), 0) AS ricavo,
                   MIN(data_mov) AS prima,
                   MAX(data_mov) AS ultima
            FROM vini_magazzino_movimenti
            WHERE vino_id IN ({placeholders}) AND tipo = 'VENDITA'
            """,
            bottiglie_ids,
        ).fetchone()
        vendite_totali = r[0] or 0
        ricavo_totale = r[1] or 0.0
        prima_vendita = r[2]
        ultima_vendita = r[3]
        # Vendite ultimi 60gg
        bt_60gg = cur.execute(
            f"""
            SELECT COALESCE(SUM(qta), 0)
            FROM vini_magazzino_movimenti
            WHERE vino_id IN ({placeholders}) AND tipo = 'VENDITA'
              AND date(data_mov) >= date('now', '-60 days')
            """,
            bottiglie_ids,
        ).fetchone()[0]

    # Valore carta attuale (somma prezzo * qta delle annate con giacenza)
    valore_carta = cur.execute(
        f"""
        SELECT COALESCE(SUM(
            CASE WHEN COALESCE(QTA_TOTALE,0) > 0 AND PREZZO_CARTA IS NOT NULL
                 THEN PREZZO_CARTA * QTA_TOTALE ELSE 0 END), 0)
        FROM {TABELLE['bottiglie']}
        WHERE madre_id = ?
        """,
        (mid,),
    ).fetchone()[0]

    conn.close()
    return {
        "grado_alcolico_medio": round(grado, 1) if grado else None,
        "vendite_totali": vendite_totali,
        "ricavo_totale": round(ricavo_totale, 2),
        "bt_60gg": bt_60gg,
        "bt_mese_medio": round(bt_60gg / 2, 1),  # 60gg = ~2 mesi
        "prima_vendita": prima_vendita,
        "ultima_vendita": ultima_vendita,
        "valore_carta_attuale": round(valore_carta, 2),
    }


@router.get("/madre/{mid}/prezzi-storico", summary="Storico prezzi cumulativo delle annate del madre")
def prezzi_storico_madre(mid: int, current_user: Any = Depends(get_current_user)):
    """
    Per ogni annata del madre, lo storico prezzi (da `vini_prezzi_storico` se esiste).
    Restituisce array di { bottiglia_id, annata, formato, storico: [...] }.
    """
    conn = get_magazzino_connection()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Verifica esistenza madre
    if not cur.execute(
        f"SELECT id FROM {TABELLE['madre']} WHERE id = ?", (mid,)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Vino madre non trovato")

    # Esiste la tabella vini_prezzi_storico?
    has_storico = cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vini_prezzi_storico'"
    ).fetchone() is not None

    bottiglie = cur.execute(
        f"""
        SELECT id, ANNATA, FORMATO, PREZZO_CARTA, EURO_LISTINO, SCONTO, PREZZO_CALICE,
               PREZZO_CALICE_MANUALE, NOTE_PREZZO
        FROM {TABELLE['bottiglie']}
        WHERE madre_id = ?
        ORDER BY ANNATA DESC
        """,
        (mid,),
    ).fetchall()

    out = []
    for b in bottiglie:
        bd = _row_to_dict(b)
        if has_storico:
            storico = cur.execute(
                """
                SELECT data_modifica, prezzo_carta_vecchio, prezzo_carta_nuovo,
                       euro_listino_vecchio, euro_listino_nuovo
                FROM vini_prezzi_storico
                WHERE vino_id = ?
                ORDER BY data_modifica DESC
                """,
                (bd["id"],),
            ).fetchall()
            bd["storico"] = [_row_to_dict(s) for s in storico]
        else:
            bd["storico"] = []
        out.append(bd)

    conn.close()
    return out
