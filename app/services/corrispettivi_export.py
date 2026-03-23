# app/services/corrispettivi_export.py
# @version: v1.0
# Esportazione corrispettivi da DB → Excel e generazione template
# I campi canonici sono definiti qui e sono la fonte di verità

import io
import sqlite3
from pathlib import Path
from typing import Optional, List, Dict

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side, numbers

DB_PATH = "app/data/admin_finance.sqlite3"

# ══════════════════════════════════════════════
# CANONICAL FIELDS — fonte di verità
# ══════════════════════════════════════════════

# Ordine colonne nell'Excel
CANONICAL_COLUMNS = [
    {"db": "date",             "excel": "Data",              "type": "date",   "required": True,  "description": "Data chiusura (YYYY-MM-DD)"},
    {"db": "weekday",          "excel": "Giorno",            "type": "text",   "required": False, "description": "Giorno della settimana"},
    {"db": "corrispettivi",    "excel": "Corrispettivi",     "type": "euro",   "required": False, "description": "Chiusura RT (IVA 10% + IVA 22%)"},
    {"db": "iva_10",           "excel": "IVA 10%",           "type": "euro",   "required": False, "description": "Corrispettivi aliquota 10%"},
    {"db": "iva_22",           "excel": "IVA 22%",           "type": "euro",   "required": False, "description": "Corrispettivi aliquota 22%"},
    {"db": "fatture",          "excel": "Fatture",           "type": "euro",   "required": False, "description": "Fatture emesse"},
    {"db": "corrispettivi_tot","excel": "Corrispettivi Tot",  "type": "euro",   "required": False, "description": "Corrispettivi + Fatture (calcolato se omesso)"},
    {"db": "contanti_finali",  "excel": "Contanti",          "type": "euro",   "required": False, "description": "Incasso contanti"},
    {"db": "pos_bpm",          "excel": "POS BPM",           "type": "euro",   "required": False, "description": "POS BPM (Risto)"},
    {"db": "pos_sella",        "excel": "POS Sella",         "type": "euro",   "required": False, "description": "POS Sella"},
    {"db": "theforkpay",       "excel": "TheForkPay",        "type": "euro",   "required": False, "description": "TheFork Pay"},
    {"db": "other_e_payments", "excel": "Stripe/PayPal",     "type": "euro",   "required": False, "description": "Stripe, PayPal, altri digitali"},
    {"db": "bonifici",         "excel": "Bonifici",          "type": "euro",   "required": False, "description": "Bonifici bancari"},
    {"db": "mance",            "excel": "Mance",             "type": "euro",   "required": False, "description": "Mance digitali (non incasso)"},
    {"db": "note",             "excel": "Note",              "type": "text",   "required": False, "description": "Note libere"},
    {"db": "is_closed",        "excel": "Chiuso",            "type": "int",    "required": False, "description": "1 = giorno chiuso, 0 = aperto"},
]

EXCEL_HEADERS = [c["excel"] for c in CANONICAL_COLUMNS]
DB_FIELDS = [c["db"] for c in CANONICAL_COLUMNS]

# Mapping Excel header → DB field (per import)
HEADER_TO_DB = {c["excel"].upper(): c["db"] for c in CANONICAL_COLUMNS}
# Aliases for backward compatibility with old Excel formats
HEADER_ALIASES = {
    "CORRISPETTIVI-TOT": "corrispettivi_tot",
    "CORRISPETTIVI TOT": "corrispettivi_tot",
    "POS": "pos_bpm",
    "POSBPM": "pos_bpm",
    "POS RISTO": "pos_bpm",
    "SELLA": "pos_sella",
    "POSSELLA": "pos_sella",
    "THEFORK": "theforkpay",
    "THEFORKPAY": "theforkpay",
    "PAYPAL": "other_e_payments",
    "STRIPE": "other_e_payments",
    "PAYPAL/STRIPE": "other_e_payments",
    "STRIPE/PAYPAL": "other_e_payments",
    "MANCE DIG": "mance",
    "IVA10%": "iva_10",
    "IVA22%": "iva_22",
    "IVA 10": "iva_10",
    "IVA 22": "iva_22",
    "GIORNO": "weekday",
    "DATA": "date",
}


# ══════════════════════════════════════════════
# STILI EXCEL
# ══════════════════════════════════════════════

HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
HEADER_FILL = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)
THIN_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin"),
)
EURO_FORMAT = '#,##0.00'
DATE_FORMAT = 'YYYY-MM-DD'


def _style_header(ws, ncols: int):
    """Applica stile all'header."""
    for col_idx in range(1, ncols + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = HEADER_ALIGN
        cell.border = THIN_BORDER


def _auto_width(ws, ncols: int, nrows: int):
    """Auto-width basato su contenuto."""
    for col_idx in range(1, ncols + 1):
        max_len = 0
        for row_idx in range(1, min(nrows + 2, 100)):
            val = ws.cell(row=row_idx, column=col_idx).value
            if val is not None:
                max_len = max(max_len, len(str(val)))
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = max(max_len + 3, 12)


# ══════════════════════════════════════════════
# EXPORT DB → EXCEL
# ══════════════════════════════════════════════

def export_corrispettivi_to_excel(
    year: Optional[int] = None,
    month: Optional[int] = None,
    include_shift_data: bool = True,
) -> bytes:
    """
    Esporta daily_closures + shift_closures (merged) in formato Excel canonico.
    Se year/month specificati, filtra per periodo.
    Ritorna bytes del file Excel.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    try:
        # Build query
        where_clauses = []
        params = []

        if year and month:
            ym = f"{year:04d}-{month:02d}"
            where_clauses.append("substr(date, 1, 7) = ?")
            params.append(ym)
        elif year:
            where_clauses.append("substr(date, 1, 4) = ?")
            params.append(str(year))

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        # Query daily_closures
        query = f"""
            SELECT date, weekday,
                   corrispettivi, iva_10, iva_22, fatture, corrispettivi_tot,
                   contanti_finali, pos_bpm, pos_sella, theforkpay, other_e_payments,
                   bonifici, mance, note, COALESCE(is_closed, 0) as is_closed
            FROM daily_closures
            {where_sql}
            ORDER BY date ASC
        """
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()

    # Create Excel
    wb = Workbook()
    ws = wb.active

    # Sheet name
    if year and month:
        ws.title = f"{year}-{month:02d}"
    elif year:
        ws.title = str(year)
    else:
        ws.title = "Corrispettivi"

    # Headers
    for col_idx, header in enumerate(EXCEL_HEADERS, 1):
        ws.cell(row=1, column=col_idx, value=header)

    # Data rows
    for row_idx, row in enumerate(rows, 2):
        for col_idx, col_def in enumerate(CANONICAL_COLUMNS, 1):
            val = row[col_def["db"]]
            cell = ws.cell(row=row_idx, column=col_idx)

            if col_def["type"] == "euro":
                cell.value = float(val) if val else 0.0
                cell.number_format = EURO_FORMAT
            elif col_def["type"] == "date":
                cell.value = val
            elif col_def["type"] == "int":
                cell.value = int(val) if val else 0
            else:
                cell.value = str(val) if val else ""

            cell.border = THIN_BORDER

    nrows = len(rows)
    ncols = len(EXCEL_HEADERS)
    _style_header(ws, ncols)
    _auto_width(ws, ncols, nrows)

    # Totals row
    if nrows > 0:
        total_row = nrows + 2
        ws.cell(row=total_row, column=1, value="TOTALE").font = Font(bold=True)
        for col_idx, col_def in enumerate(CANONICAL_COLUMNS, 1):
            if col_def["type"] == "euro":
                # Sum formula
                col_letter = ws.cell(row=1, column=col_idx).column_letter
                cell = ws.cell(row=total_row, column=col_idx)
                cell.value = f"=SUM({col_letter}2:{col_letter}{nrows + 1})"
                cell.number_format = EURO_FORMAT
                cell.font = Font(bold=True)
                cell.border = THIN_BORDER

    # Freeze header
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ══════════════════════════════════════════════
# TEMPLATE VUOTO
# ══════════════════════════════════════════════

def generate_template() -> bytes:
    """
    Genera un Excel template vuoto con:
    - Header canonici
    - Descrizione campi nella riga 2
    - Formattazione pronta
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Template"

    # Headers
    ncols = len(EXCEL_HEADERS)
    for col_idx, header in enumerate(EXCEL_HEADERS, 1):
        ws.cell(row=1, column=col_idx, value=header)

    _style_header(ws, ncols)

    # Description row (row 2, italic, gray)
    desc_font = Font(italic=True, color="888888", size=9)
    for col_idx, col_def in enumerate(CANONICAL_COLUMNS, 1):
        cell = ws.cell(row=2, column=col_idx, value=col_def["description"])
        cell.font = desc_font
        cell.alignment = Alignment(wrap_text=True)

    # Example row (row 3)
    example_data = {
        "date": "2026-01-15",
        "weekday": "Giovedì",
        "corrispettivi": 2450.00,
        "iva_10": 1200.00,
        "iva_22": 1250.00,
        "fatture": 150.00,
        "corrispettivi_tot": 2600.00,
        "contanti_finali": 800.00,
        "pos_bpm": 1200.00,
        "pos_sella": 350.00,
        "theforkpay": 100.00,
        "other_e_payments": 50.00,
        "bonifici": 100.00,
        "mance": 25.00,
        "note": "Esempio — eliminare questa riga",
        "is_closed": 0,
    }
    example_font = Font(color="999999", size=10)
    for col_idx, col_def in enumerate(CANONICAL_COLUMNS, 1):
        val = example_data.get(col_def["db"], "")
        cell = ws.cell(row=3, column=col_idx, value=val)
        cell.font = example_font
        if col_def["type"] == "euro":
            cell.number_format = EURO_FORMAT

    # Auto width
    _auto_width(ws, ncols, 3)

    # Instructions sheet
    ws_info = wb.create_sheet("Istruzioni")
    ws_info.cell(row=1, column=1, value="TRGB Gestionale — Template Corrispettivi").font = Font(bold=True, size=14)
    ws_info.cell(row=3, column=1, value="Istruzioni:").font = Font(bold=True)

    instructions = [
        "1. Compilare il foglio 'Template' con i dati giornalieri dei corrispettivi.",
        "2. Il campo 'Data' (YYYY-MM-DD) è obbligatorio.",
        "3. I campi numerici accettano sia formato italiano (1.234,56) che internazionale (1234.56).",
        "4. 'Corrispettivi Tot' = Corrispettivi + Fatture. Se omesso, viene calcolato automaticamente.",
        "5. 'Giorno' viene calcolato automaticamente dalla data se omesso.",
        "6. 'Chiuso' = 1 per segnare un giorno di chiusura (ferie, festivi).",
        "7. La riga di esempio (riga 3) va eliminata prima dell'import.",
        "8. Per importare, usare Vendite → Impostazioni → Import/Export.",
        "",
        "Campi calcolati automaticamente (non presenti nel template):",
        "• Totale Incassi = Contanti + POS BPM + POS Sella + TheForkPay + Stripe/PayPal + Bonifici",
        "• Differenza Cassa = Totale Incassi - Corrispettivi Tot",
    ]
    for i, line in enumerate(instructions, 4):
        ws_info.cell(row=i, column=1, value=line)

    ws_info.column_dimensions["A"].width = 80

    # Field reference
    ws_ref = wb.create_sheet("Campi")
    ws_ref.cell(row=1, column=1, value="Campo Excel").font = Font(bold=True)
    ws_ref.cell(row=1, column=2, value="Campo DB").font = Font(bold=True)
    ws_ref.cell(row=1, column=3, value="Tipo").font = Font(bold=True)
    ws_ref.cell(row=1, column=4, value="Obbligatorio").font = Font(bold=True)
    ws_ref.cell(row=1, column=5, value="Descrizione").font = Font(bold=True)

    for i, col_def in enumerate(CANONICAL_COLUMNS, 2):
        ws_ref.cell(row=i, column=1, value=col_def["excel"])
        ws_ref.cell(row=i, column=2, value=col_def["db"])
        ws_ref.cell(row=i, column=3, value=col_def["type"])
        ws_ref.cell(row=i, column=4, value="Sì" if col_def["required"] else "No")
        ws_ref.cell(row=i, column=5, value=col_def["description"])

    for col in ["A", "B", "C", "D", "E"]:
        ws_ref.column_dimensions[col].width = 20

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
