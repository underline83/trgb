# Modulo: cucina
# @version: v1.0 — logica scorte: semaforo, movimenti, freschezza, conta (2026-09-07)
# -*- coding: utf-8 -*-
"""
Servizio Scorte cucina — la logica che i router non devono duplicare.

Doc canonico: docs/modulo_scorte_cucina.md

Qui vive tutto cio' che ha una regola dietro:
  · `set_semaforo`         il tap del cuoco, e cosa succede quando diventa FINITO
  · `registra_movimento`   con `qta_precedente` ESPLICITA, mai dedotta
  · `annulla_movimento`    l'undo a 8 secondi
  · `stato_dato`           il dato che invecchia e lo dice (doc §3.1)
  · `apri_conta` / `chiudi_ripiano` / `chiudi_conta`

I router chiamano queste funzioni e non riscrivono la logica altrove: se un
giorno lo scarico deve fare anche altro, si cambia in un posto solo.

TUTTE le funzioni ricevono una `sqlite3.Connection` gia' aperta e NON committano:
il commit lo decide il chiamante, che sa se sta chiudendo una transazione piu'
grande (una conta chiude decine di righe: o vanno tutte o non ne va nessuna).
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.models.cucina_scorte_db import (
    assicura_ripiano_default,
    config_int,
    incompatibile,
    ubicazione_di_ripiano,
)
from app.services.prezzi_ingredienti import prezzo_corrente

ORIGINE_MOBILE = "CUCINA-MOBILE"


def _ora() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _num(x: Any) -> float:
    try:
        v = float(x)
        return v if v == v else 0.0   # NaN → 0
    except (TypeError, ValueError):
        return 0.0


# ─────────────────────────────────────────────────────────────
# Il dato che invecchia (doc §3.1)
# ─────────────────────────────────────────────────────────────

def soglia_freschezza(conn: sqlite3.Connection, articolo: Dict[str, Any]) -> Optional[int]:
    """Quanti giorni prima che la giacenza di questo articolo diventi una stima.

    Tre gradini, mai una costante nel codice:
      1. `giorni_dato_fresco` dell'articolo, se valorizzato (il pesce, il tartufo);
      2. il default della sua famiglia (`FRESCO` 5 gg / `SECCO` 21 gg, da config);
      3. None → il dato non invecchia mai. Meglio nessun avviso che avvisi a caso.
    """
    proprio = articolo.get("giorni_dato_fresco")
    if proprio:
        try:
            return int(proprio)
        except (TypeError, ValueError):
            pass
    famiglia = (articolo.get("famiglia_freschezza") or "SECCO").upper()
    chiave = "freschezza_fresco_gg" if famiglia == "FRESCO" else "freschezza_secco_gg"
    valore = config_int(conn, chiave, 5 if famiglia == "FRESCO" else 21)
    return valore if valore > 0 else None


def stato_dato(
    conn: sqlite3.Connection,
    articolo: Dict[str, Any],
    aggiornato_at: Optional[str],
) -> Dict[str, Any]:
    """Quanto ci si puo' fidare del numero mostrato.

    Ritorna `{stato, giorni, soglia}` con `stato` in:
      · `FRESCO`      il numero e' vero, si mostra secco
      · `DA_VERIFICARE` fermo oltre la soglia → il numero si mostra come «≈»
      · `IGNOTO`      mai movimentato ne' contato → si mostra «—», non si finge

    Vale solo per il regime MOVIMENTI: su SEMAFORO non c'e' un numero da
    invecchiare, e su CONTA la verita' e' per definizione l'ultima conta.
    """
    if (articolo.get("regime") or "").upper() != "MOVIMENTI":
        return {"stato": "FRESCO", "giorni": None, "soglia": None}
    if not aggiornato_at:
        return {"stato": "IGNOTO", "giorni": None, "soglia": None}

    soglia = soglia_freschezza(conn, articolo)
    row = conn.execute(
        "SELECT CAST(julianday('now','localtime') - julianday(?) AS INTEGER)", (aggiornato_at,)
    ).fetchone()
    giorni = row[0] if row and row[0] is not None else None
    if giorni is None or soglia is None:
        return {"stato": "FRESCO", "giorni": giorni, "soglia": soglia}
    return {
        "stato": "DA_VERIFICARE" if giorni > soglia else "FRESCO",
        "giorni": giorni,
        "soglia": soglia,
    }


# ─────────────────────────────────────────────────────────────
# Giacenza e dotazione
# ─────────────────────────────────────────────────────────────

def assicura_giacenza(
    conn: sqlite3.Connection,
    articolo_id: int,
    ripiano_id: int,
    in_dotazione: bool = True,
) -> sqlite3.Row:
    """La riga (articolo, ripiano), creandola se manca.

    `ubicazione_id` si ricava dal ripiano e non si accetta dal chiamante: e' un
    campo denormalizzato, e i campi denormalizzati si scrivono in un posto solo.
    """
    row = conn.execute(
        "SELECT * FROM cucina_giacenze WHERE articolo_id = ? AND ripiano_id = ?",
        (articolo_id, ripiano_id),
    ).fetchone()
    if row:
        return row

    ubicazione_id = ubicazione_di_ripiano(conn, ripiano_id)
    if ubicazione_id is None:
        raise ValueError(f"ripiano {ripiano_id} inesistente")
    conn.execute(
        """
        INSERT INTO cucina_giacenze (articolo_id, ripiano_id, ubicazione_id, in_dotazione)
        VALUES (?, ?, ?, ?)
        """,
        (articolo_id, ripiano_id, ubicazione_id, 1 if in_dotazione else 0),
    )
    return conn.execute(
        "SELECT * FROM cucina_giacenze WHERE articolo_id = ? AND ripiano_id = ?",
        (articolo_id, ripiano_id),
    ).fetchone()


def giacenza_totale(conn: sqlite3.Connection, articolo_id: int) -> Optional[float]:
    """La giacenza di un articolo e' SEMPRE una somma su piu' ripiani.

    Ritorna None se nessuna riga ha una quantita': «non lo so» non e' zero.
    """
    row = conn.execute(
        "SELECT SUM(qta) AS tot, COUNT(qta) AS n FROM cucina_giacenze WHERE articolo_id = ?",
        (articolo_id,),
    ).fetchone()
    if not row or not row["n"]:
        return None
    return _num(row["tot"])


# ─────────────────────────────────────────────────────────────
# Il tap del cuoco
# ─────────────────────────────────────────────────────────────

def set_semaforo(
    conn: sqlite3.Connection,
    articolo_id: int,
    ripiano_id: int,
    stato: str,
    utente: str,
) -> Dict[str, Any]:
    """Cambia lo stato del semaforo. Su FINITO alimenta la Lista Spesa.

    E' il gesto piu' usato di tutto il modulo: deve restare un tap, e deve
    essere reversibile — chi chiama espone l'annulla a 8 secondi, che qui si
    traduce in un nuovo `set_semaforo` verso lo stato precedente piu' la
    rimozione della riga di spesa appena creata (`spesa_id` nel ritorno).
    """
    assicura_giacenza(conn, articolo_id, ripiano_id)
    conn.execute(
        """
        UPDATE cucina_giacenze
           SET stato_semaforo = ?, aggiornato_at = ?, aggiornato_da = ?, origine = 'SEMAFORO'
         WHERE articolo_id = ? AND ripiano_id = ?
        """,
        (stato, _ora(), utente, articolo_id, ripiano_id),
    )

    spesa_id = None
    if stato == "FINITO":
        spesa_id = aggiungi_a_lista_spesa(conn, articolo_id, utente)

    return {"articolo_id": articolo_id, "ripiano_id": ripiano_id,
            "stato": stato, "spesa_id": spesa_id}


def aggiungi_a_lista_spesa(
    conn: sqlite3.Connection,
    articolo_id: int,
    utente: str,
) -> Optional[int]:
    """Crea la riga in `lista_spesa_items`, se non c'e' gia' da fare.

    L'anti-doppione e' sul titolo fra le righe non ancora fatte: segnare finito
    lo stesso articolo in due ripiani diversi non deve produrre due righe di
    spesa — e' una cosa sola da comprare.

    `ingredient_id` si porta dietro quando c'e': e' il ponte col food cost, ed
    e' il motivo per cui questa lista vale piu' di un foglietto.
    """
    art = conn.execute(
        "SELECT nome, ingredient_id, fornitore_freeform FROM cucina_articoli WHERE id = ?",
        (articolo_id,),
    ).fetchone()
    if not art:
        return None

    gia = conn.execute(
        "SELECT id FROM lista_spesa_items WHERE fatto = 0 AND lower(titolo) = lower(?)",
        (art["nome"],),
    ).fetchone()
    if gia:
        return gia["id"]

    cur = conn.execute(
        """
        INSERT INTO lista_spesa_items
            (titolo, ingredient_id, fornitore_freeform, note, created_by)
        VALUES (?, ?, ?, ?, ?)
        """,
        (art["nome"], art["ingredient_id"], art["fornitore_freeform"],
         "Segnato finito dalle scorte", utente),
    )
    return cur.lastrowid


def rimuovi_da_lista_spesa(conn: sqlite3.Connection, spesa_id: int) -> None:
    """Undo della riga di spesa: si cancella solo se nessuno l'ha ancora fatta."""
    conn.execute("DELETE FROM lista_spesa_items WHERE id = ? AND fatto = 0", (spesa_id,))


# ─────────────────────────────────────────────────────────────
# Movimenti
# ─────────────────────────────────────────────────────────────

def registra_movimento(
    conn: sqlite3.Connection,
    articolo_id: int,
    ripiano_id: Optional[int],
    tipo: str,
    qta_delta: float,
    utente: str,
    qta_precedente: Optional[float] = None,
    motivo: Optional[str] = None,
    origine: str = ORIGINE_MOBILE,
    lotto_id: Optional[int] = None,
    ripiano_dest_id: Optional[int] = None,
    ref_modulo: Optional[str] = None,
    ref_id: Optional[int] = None,
    aggiorna_giacenza: bool = True,
) -> Dict[str, Any]:
    """Registra un movimento e aggiorna la giacenza del ripiano.

    ⚠️ `qta_precedente` VA PASSATA quando la giacenza e' gia' stata toccata da
    chi chiama (tipicamente una rettifica da conta). Se e' None si legge dal DB
    — corretto solo finche' nessuno l'ha gia' aggiornata.

    E' il bug RETTIFICA fantasma dei vini (2026-07-18): un delta calcolato su
    una giacenza gia' allineata veniva zero, l'INSERT saltava in silenzio e il
    movimento non esisteva. Qui il movimento si scrive SEMPRE, anche a delta
    zero: una conta che conferma il dato e' un fatto, e va tracciata.
    """
    riga = None
    if ripiano_id is not None:
        riga = assicura_giacenza(conn, articolo_id, ripiano_id)

    if qta_precedente is None:
        qta_precedente = _num(riga["qta"]) if riga else 0.0
    else:
        qta_precedente = _num(qta_precedente)

    delta = _num(qta_delta)
    risultante = qta_precedente + delta

    ubicazione_id = ubicazione_di_ripiano(conn, ripiano_id) if ripiano_id else None

    cur = conn.execute(
        """
        INSERT INTO cucina_movimenti
            (articolo_id, ripiano_id, ubicazione_id, ripiano_dest_id, tipo,
             qta_delta, qta_precedente, qta_risultante, lotto_id, motivo,
             origine, ref_modulo, ref_id, utente)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (articolo_id, ripiano_id, ubicazione_id, ripiano_dest_id, tipo,
         delta, qta_precedente, risultante, lotto_id, motivo,
         origine, ref_modulo, ref_id, utente),
    )
    mov_id = cur.lastrowid

    if aggiorna_giacenza and ripiano_id is not None:
        conn.execute(
            """
            UPDATE cucina_giacenze
               SET qta = ?, aggiornato_at = ?, aggiornato_da = ?, origine = 'MOVIMENTO'
             WHERE articolo_id = ? AND ripiano_id = ?
            """,
            (risultante, _ora(), utente, articolo_id, ripiano_id),
        )

    return {
        "id": mov_id, "tipo": tipo, "qta_delta": delta,
        "qta_precedente": qta_precedente, "qta_risultante": risultante,
    }


def annulla_movimento(conn: sqlite3.Connection, mov_id: int, utente: str) -> Dict[str, Any]:
    """L'undo: riporta la giacenza a `qta_precedente` e marca il movimento.

    Soft-delete, non DELETE: un movimento annullato resta nella timeline con la
    sua ora e chi l'ha annullato. In cucina «chi ha tolto quei due chili?» e'
    una domanda che si fa davvero, e un record cancellato non risponde.
    """
    mov = conn.execute("SELECT * FROM cucina_movimenti WHERE id = ?", (mov_id,)).fetchone()
    if not mov:
        raise ValueError("movimento non trovato")
    if mov["annullato_at"]:
        raise ValueError("movimento gia' annullato")

    if mov["ripiano_id"]:
        conn.execute(
            """
            UPDATE cucina_giacenze
               SET qta = ?, aggiornato_at = ?, aggiornato_da = ?, origine = 'MOVIMENTO'
             WHERE articolo_id = ? AND ripiano_id = ?
            """,
            (mov["qta_precedente"], _ora(), utente, mov["articolo_id"], mov["ripiano_id"]),
        )
    conn.execute(
        "UPDATE cucina_movimenti SET annullato_at = ?, annullato_da = ? WHERE id = ?",
        (_ora(), utente, mov_id),
    )
    return {"id": mov_id, "qta_ripristinata": mov["qta_precedente"]}


def ultimo_movimento(
    conn: sqlite3.Connection, articolo_id: int, tipo: str
) -> Optional[float]:
    """Quanto si e' scaricato/caricato l'ultima volta.

    Serve a precompilare il gesto: scaricare deve costare un tap, con la
    quantita' dell'ultima volta gia' proposta (stesso trucco del prezzo al
    calice in cantina). Se scaricare costa un form, nessuno scarica.
    """
    row = conn.execute(
        """
        SELECT qta_delta FROM cucina_movimenti
         WHERE articolo_id = ? AND tipo = ? AND annullato_at IS NULL
         ORDER BY id DESC LIMIT 1
        """,
        (articolo_id, tipo),
    ).fetchone()
    return abs(_num(row["qta_delta"])) if row else None


# ─────────────────────────────────────────────────────────────
# Conta a ripiani
# ─────────────────────────────────────────────────────────────

def apri_conta(
    conn: sqlite3.Connection,
    utente: str,
    reparto: str = "cucina",
    data_conta: Optional[str] = None,
    ubicazioni: Optional[List[int]] = None,
) -> int:
    """Apre una sessione di conta e ci mette dentro i ripiani da fare.

    Se `ubicazioni` e' None prende tutti i posti attivi del reparto. I ripiani
    entrano in stato DA_FARE: e' la lista dei passi, ed e' cio' che permette di
    fermarsi a meta' e riprendere.
    """
    cur = conn.execute(
        "INSERT INTO cucina_conte (data, reparto, aperta_da) VALUES (?, ?, ?)",
        (data_conta or date.today().isoformat(), reparto, utente),
    )
    conta_id = cur.lastrowid

    sql = """
        SELECT r.id AS ripiano_id, r.ubicazione_id
          FROM cucina_ripiani r
          JOIN cucina_ubicazioni u ON u.id = r.ubicazione_id
         WHERE r.attivo = 1 AND u.attivo = 1 AND u.reparto = ?
    """
    args: List[Any] = [reparto]
    if ubicazioni:
        sql += f" AND u.id IN ({','.join('?' * len(ubicazioni))})"
        args.extend(ubicazioni)
    sql += " ORDER BY u.ordine, u.id, r.ordine, r.id"

    for r in conn.execute(sql, args).fetchall():
        conn.execute(
            """
            INSERT OR IGNORE INTO cucina_conte_ripiani (conta_id, ripiano_id, ubicazione_id)
            VALUES (?, ?, ?)
            """,
            (conta_id, r["ripiano_id"], r["ubicazione_id"]),
        )
    return conta_id


def foglio_ripiano(
    conn: sqlite3.Connection, conta_id: int, ripiano_id: int
) -> List[Dict[str, Any]]:
    """Il foglio di conta di un ripiano, precompilato con la quantita' attesa.

    Include tutta la dotazione, anche a zero: se un articolo che dovrebbe
    esserci non c'e', quello e' il dato piu' interessante della conta.
    """
    righe = conn.execute(
        """
        SELECT  a.id AS articolo_id, a.nome, a.um, a.confezione, a.regime,
                g.qta AS qta_attesa,
                g.stato_semaforo,
                cr.qta_contata, cr.delta, cr.note
          FROM cucina_giacenze g
          JOIN cucina_articoli a ON a.id = g.articolo_id AND a.attivo = 1
          LEFT JOIN cucina_conte_righe cr
                 ON cr.conta_id = ? AND cr.ripiano_id = g.ripiano_id
                AND cr.articolo_id = g.articolo_id
         WHERE g.ripiano_id = ? AND g.in_dotazione = 1
         ORDER BY g.ordine, a.nome
        """,
        (conta_id, ripiano_id),
    ).fetchall()
    return [dict(r) for r in righe]


def scrivi_riga_conta(
    conn: sqlite3.Connection,
    conta_id: int,
    ripiano_id: int,
    articolo_id: int,
    qta_contata: float,
    utente: str,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """Registra la quantita' trovata. Non tocca ancora la giacenza.

    La giacenza si muove solo alla chiusura del ripiano: finche' la conta e'
    aperta si puo' correggere un numero sbagliato senza generare rettifiche
    fantasma nella timeline.
    """
    riga = conn.execute(
        "SELECT qta FROM cucina_giacenze WHERE articolo_id = ? AND ripiano_id = ?",
        (articolo_id, ripiano_id),
    ).fetchone()
    attesa = _num(riga["qta"]) if riga and riga["qta"] is not None else None
    contata = _num(qta_contata)
    delta = (contata - attesa) if attesa is not None else None

    conn.execute(
        """
        INSERT INTO cucina_conte_righe
            (conta_id, ripiano_id, articolo_id, qta_attesa, qta_contata, delta, note,
             contata_da, contata_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(conta_id, ripiano_id, articolo_id) DO UPDATE SET
            qta_attesa = excluded.qta_attesa,
            qta_contata = excluded.qta_contata,
            delta = excluded.delta,
            note = excluded.note,
            contata_da = excluded.contata_da,
            contata_at = excluded.contata_at
        """,
        (conta_id, ripiano_id, articolo_id, attesa, contata, delta, note, utente, _ora()),
    )
    conn.execute(
        "UPDATE cucina_conte_ripiani SET stato = 'IN_CORSO' WHERE conta_id = ? AND ripiano_id = ? AND stato = 'DA_FARE'",
        (conta_id, ripiano_id),
    )
    return {"qta_attesa": attesa, "qta_contata": contata, "delta": delta}


def chiudi_ripiano(
    conn: sqlite3.Connection, conta_id: int, ripiano_id: int, utente: str
) -> Dict[str, Any]:
    """Consolida un ripiano: le quantita' contate diventano la verita'.

    Per articolo:
      · regime MOVIMENTI → un movimento RETTIFICA con `qta_precedente` esplicita,
        cosi' la timeline resta continua e leggibile;
      · regime CONTA / SEMAFORO → si scrive la giacenza con origine 'CONTA'.

    Gli articoli in dotazione ma non contati NON si azzerano: non contare non
    significa che non c'e'. Restano com'erano, e la riga di conta manca — il
    che si vede.
    """
    righe = conn.execute(
        """
        SELECT cr.articolo_id, cr.qta_attesa, cr.qta_contata, a.regime
          FROM cucina_conte_righe cr
          JOIN cucina_articoli a ON a.id = cr.articolo_id
         WHERE cr.conta_id = ? AND cr.ripiano_id = ? AND cr.qta_contata IS NOT NULL
        """,
        (conta_id, ripiano_id),
    ).fetchall()

    rettifiche = 0
    for r in righe:
        attesa = _num(r["qta_attesa"])
        contata = _num(r["qta_contata"])
        if (r["regime"] or "").upper() == "MOVIMENTI":
            registra_movimento(
                conn,
                articolo_id=r["articolo_id"],
                ripiano_id=ripiano_id,
                tipo="RETTIFICA",
                qta_delta=contata - attesa,
                qta_precedente=attesa,      # ← esplicita: e' il punto di tutto
                utente=utente,
                motivo=f"Conta #{conta_id}",
                origine="CONTA",
                ref_modulo="cucina",
                ref_id=conta_id,
            )
            rettifiche += 1
        else:
            conn.execute(
                """
                UPDATE cucina_giacenze
                   SET qta = ?, aggiornato_at = ?, aggiornato_da = ?, origine = 'CONTA'
                 WHERE articolo_id = ? AND ripiano_id = ?
                """,
                (contata, _ora(), utente, r["articolo_id"], ripiano_id),
            )

    conn.execute(
        """
        UPDATE cucina_conte_ripiani
           SET stato = 'CONTATO', contato_da = ?, contato_at = ?
         WHERE conta_id = ? AND ripiano_id = ?
        """,
        (utente, _ora(), conta_id, ripiano_id),
    )
    return {"righe": len(righe), "rettifiche": rettifiche}


def valorizza_conta(conn: sqlite3.Connection, conta_id: int) -> float:
    """Mette un prezzo sulle righe contate e ritorna il totale.

    E' il numero che serve al Controllo Gestione — la rimanenza, che oggi manca
    al conto economico. Gli articoli senza `ingredient_id` (carta forno,
    detersivo) non si valorizzano: restano a valore NULL e non sporcano il
    totale con zeri finti.
    """
    cur = conn.cursor()
    righe = cur.execute(
        """
        SELECT cr.id, cr.qta_contata, a.ingredient_id
          FROM cucina_conte_righe cr
          JOIN cucina_articoli a ON a.id = cr.articolo_id
         WHERE cr.conta_id = ? AND cr.qta_contata IS NOT NULL
        """,
        (conta_id,),
    ).fetchall()

    totale = 0.0
    for r in righe:
        prezzo = prezzo_corrente(cur, r["ingredient_id"])
        if prezzo is None:
            continue
        valore = _num(r["qta_contata"]) * prezzo
        totale += valore
        cur.execute(
            "UPDATE cucina_conte_righe SET prezzo_unitario = ?, valore = ? WHERE id = ?",
            (prezzo, valore, r["id"]),
        )
    return round(totale, 2)


def chiudi_conta(conn: sqlite3.Connection, conta_id: int, utente: str) -> Dict[str, Any]:
    """Chiude la sessione: valorizza e sigilla.

    Una conta chiusa non si riapre — si fa una conta nuova. Stessa disciplina
    delle migrazioni: cio' che e' stato registrato come fatto contabile resta.
    I ripiani ancora DA_FARE non bloccano la chiusura ma vengono contati nel
    ritorno: e' giusto poter chiudere una conta parziale, purche' si sappia.
    """
    conta = conn.execute("SELECT * FROM cucina_conte WHERE id = ?", (conta_id,)).fetchone()
    if not conta:
        raise ValueError("conta non trovata")
    if conta["stato"] == "CHIUSA":
        raise ValueError("conta gia' chiusa: fanne una nuova")

    non_fatti = conn.execute(
        "SELECT COUNT(*) FROM cucina_conte_ripiani WHERE conta_id = ? AND stato != 'CONTATO'",
        (conta_id,),
    ).fetchone()[0]

    totale = valorizza_conta(conn, conta_id)
    conn.execute(
        """
        UPDATE cucina_conte
           SET stato = 'CHIUSA', valore_totale = ?, chiusa_da = ?, chiusa_at = ?
         WHERE id = ?
        """,
        (totale, utente, _ora(), conta_id),
    )
    return {"conta_id": conta_id, "valore_totale": totale, "ripiani_non_contati": non_fatti}


# ─────────────────────────────────────────────────────────────
# Alert
# ─────────────────────────────────────────────────────────────

def alert_scorte(conn: sqlite3.Connection, reparto: str = "cucina") -> Dict[str, Any]:
    """Cosa non va, in una chiamata: mancanti, in scadenza, aperti da troppo,
    e i dati che hanno smesso di essere affidabili.

    Alimenta il banner in testa alla sotto-app e, in prospettiva, due checker
    M.F (`cucina_scorte_mancanti`, `cucina_scadenze`).
    """
    mancanti = [dict(r) for r in conn.execute(
        """
        SELECT a.id AS articolo_id, a.nome, a.um, g.stato_semaforo,
               u.nome AS ubicazione, r.codice AS ripiano
          FROM cucina_giacenze g
          JOIN cucina_articoli a   ON a.id = g.articolo_id AND a.attivo = 1
          JOIN cucina_ripiani r    ON r.id = g.ripiano_id
          JOIN cucina_ubicazioni u ON u.id = g.ubicazione_id
         WHERE g.stato_semaforo IN ('FINITO','ESAURIMENTO') AND a.reparto = ?
         ORDER BY CASE g.stato_semaforo WHEN 'FINITO' THEN 0 ELSE 1 END, a.nome
        """,
        (reparto,),
    ).fetchall()]

    in_scadenza = [dict(r) for r in conn.execute(
        """
        SELECT l.id AS lotto_id, l.data_scadenza, l.qta_residua, l.stato,
               a.id AS articolo_id, a.nome, a.um,
               CAST(julianday(l.data_scadenza) - julianday('now','localtime') AS INTEGER) AS giorni
          FROM cucina_lotti l
          JOIN cucina_articoli a ON a.id = l.articolo_id AND a.attivo = 1
         WHERE l.stato IN ('CHIUSO','APERTO')
           AND l.data_scadenza IS NOT NULL
           AND a.reparto = ?
           AND julianday(l.data_scadenza) - julianday('now','localtime') <= 5
         ORDER BY l.data_scadenza
        """,
        (reparto,),
    ).fetchall()]

    aperti_da_troppo = [dict(r) for r in conn.execute(
        """
        SELECT l.id AS lotto_id, l.data_apertura, a.nome, a.shelf_life_aperto_gg,
               CAST(julianday('now','localtime') - julianday(l.data_apertura) AS INTEGER) AS giorni_aperto
          FROM cucina_lotti l
          JOIN cucina_articoli a ON a.id = l.articolo_id AND a.attivo = 1
         WHERE l.stato = 'APERTO' AND l.data_apertura IS NOT NULL
           AND a.shelf_life_aperto_gg IS NOT NULL AND a.reparto = ?
           AND julianday('now','localtime') - julianday(l.data_apertura) > a.shelf_life_aperto_gg
         ORDER BY giorni_aperto DESC
        """,
        (reparto,),
    ).fetchall()]

    fresco = config_int(conn, "freschezza_fresco_gg", 5)
    secco = config_int(conn, "freschezza_secco_gg", 21)
    da_verificare = [dict(r) for r in conn.execute(
        """
        SELECT a.id AS articolo_id, a.nome, g.qta, g.aggiornato_at,
               u.nome AS ubicazione, r.codice AS ripiano,
               CAST(julianday('now','localtime') - julianday(g.aggiornato_at) AS INTEGER) AS giorni
          FROM cucina_giacenze g
          JOIN cucina_articoli a   ON a.id = g.articolo_id AND a.attivo = 1
          JOIN cucina_ripiani r    ON r.id = g.ripiano_id
          JOIN cucina_ubicazioni u ON u.id = g.ubicazione_id
         WHERE a.regime = 'MOVIMENTI' AND a.reparto = ?
           AND g.aggiornato_at IS NOT NULL
           AND julianday('now','localtime') - julianday(g.aggiornato_at)
               > COALESCE(a.giorni_dato_fresco,
                          CASE a.famiglia_freschezza WHEN 'FRESCO' THEN ? ELSE ? END)
         ORDER BY giorni DESC
        """,
        (reparto, fresco, secco),
    ).fetchall()]

    fuori_posto = [dict(r) for r in conn.execute(
        """
        SELECT a.id AS articolo_id, a.nome, a.natura, r.destinazione,
               u.nome AS ubicazione, r.codice AS ripiano
          FROM cucina_giacenze g
          JOIN cucina_articoli a   ON a.id = g.articolo_id AND a.attivo = 1
          JOIN cucina_ripiani r    ON r.id = g.ripiano_id
          JOIN cucina_ubicazioni u ON u.id = g.ubicazione_id
         WHERE a.natura IS NOT NULL AND r.destinazione IS NOT NULL
           AND r.destinazione != 'MISTO' AND a.reparto = ?
        """,
        (reparto,),
    ).fetchall()]
    fuori_posto = [f for f in fuori_posto if incompatibile(f["natura"], f["destinazione"])]

    return {
        "mancanti": mancanti,
        "in_scadenza": in_scadenza,
        "aperti_da_troppo": aperti_da_troppo,
        "da_verificare": da_verificare,
        "fuori_posto": fuori_posto,
        "totale": (len(mancanti) + len(in_scadenza) + len(aperti_da_troppo)
                   + len(da_verificare) + len(fuori_posto)),
    }
