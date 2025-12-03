// @version: v1.0
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function toNumber(value) {
  if (value === "" || value == null) return 0;
  const n = Number(String(value).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export default function CorrispettiviGestione() {
  const navigate = useNavigate();

  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // YYYY-MM-DD
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // campi numerici principali
  const [corrispettivi, setCorrispettivi] = useState("");
  const [iva10, setIva10] = useState("");
  const [iva22, setIva22] = useState("");
  const [fatture, setFatture] = useState("");

  const [contantiFinali, setContantiFinali] = useState("");
  const [pos, setPos] = useState("");
  const [sella, setSella] = useState("");
  const [stripePay, setStripePay] = useState("");
  const [bonifici, setBonifici] = useState("");
  const [mance, setMance] = useState("");

  const [note, setNote] = useState("");

  const token = localStorage.getItem("token");

  // totali calcolati
  const totaleIncassi = useMemo(() => {
    return (
      toNumber(contantiFinali) +
      toNumber(pos) +
      toNumber(sella) +
      toNumber(stripePay) +
      toNumber(bonifici) +
      toNumber(mance)
    );
  }, [contantiFinali, pos, sella, stripePay, bonifici, mance]);

  const cashDiff = useMemo(() => {
    return totaleIncassi - toNumber(corrispettivi);
  }, [totaleIncassi, corrispettivi]);

  const cashDiffAbs = Math.abs(cashDiff);
  const cashStatus =
    cashDiffAbs < 0.5
      ? "ok"
      : cashDiff > 0
      ? "over"
      : "short";

  // Carica la chiusura esistente quando cambia la data
  useEffect(() => {
    const fetchDay = async () => {
      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/admin/finance/daily-closures/${date}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (res.status === 404) {
          // nessuna chiusura per quella data → reset campi
          resetForm();
          setLoading(false);
          return;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Errore nel caricamento della chiusura.");
        }

        const data = await res.json();
        // qui mappiamo i campi come definiti nel backend
        setCorrispettivi(data.corrispettivi?.toString() ?? "");
        setIva10(data.iva_10?.toString() ?? "");
        setIva22(data.iva_22?.toString() ?? "");
        setFatture(data.fatture?.toString() ?? "");

        setContantiFinali(data.contanti_finali?.toString() ?? "");
        setPos(data.pos?.toString() ?? "");
        setSella(data.sella?.toString() ?? "");
        setStripePay(data.stripe_pay?.toString() ?? "");
        setBonifici(data.bonifici?.toString() ?? "");
        setMance(data.mance?.toString() ?? "");

        setNote(data.note ?? "");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    const resetForm = () => {
      setCorrispettivi("");
      setIva10("");
      setIva22("");
      setFatture("");
      setContantiFinali("");
      setPos("");
      setSella("");
      setStripePay("");
      setBonifici("");
      setMance("");
      setNote("");
    };

    fetchDay();
  }, [date, token]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        date,
        corrispettivi: toNumber(corrispettivi),
        iva_10: toNumber(iva10),
        iva_22: toNumber(iva22),
        fatture: toNumber(fatture),
        contanti_finali: toNumber(contantiFinali),
        pos: toNumber(pos),
        sella: toNumber(sella),
        stripe_pay: toNumber(stripePay),
        bonifici: toNumber(bonifici),
        mance: toNumber(mance),
        note: note || null,
      };

      const res = await fetch(
        `${API_BASE_URL}/admin/finance/daily-closures`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Errore nel salvataggio della chiusura.");
      }

      setMessage("Chiusura salvata correttamente.");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-3xl p-10 border border-neutral-200">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              📝 Chiusura cassa giornaliera
            </h1>
            <p className="text-neutral-600 text-sm sm:text-base">
              Inserisci i valori della chiusura cassa per la data selezionata.
              Il sistema calcola automaticamente totale incassi e differenza.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => navigate("/admin/corrispettivi")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Torna ai Corrispettivi
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-200 bg-white hover:bg-neutral-50 shadow-sm transition"
            >
              ← Amministrazione
            </button>
          </div>
        </div>

        {/* DATA */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Data chiusura
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-xl bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Cambiando data vengono caricati (se presenti) i dati già salvati.
          </p>
        </div>

        {/* FORM GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* BLOCCO CORRISPETTIVI / IVA / FATTURE */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
              Corrispettivi & IVA
            </h2>

            <NumberField
              label="Corrispettivi (da RT)"
              value={corrispettivi}
              onChange={setCorrispettivi}
            />
            <NumberField
              label="IVA 10%"
              value={iva10}
              onChange={setIva10}
            />
            <NumberField
              label="IVA 22%"
              value={iva22}
              onChange={setIva22}
            />
            <NumberField
              label="Fatture (totale giorno)"
              value={fatture}
              onChange={setFatture}
            />
          </div>

          {/* BLOCCO METODI PAGAMENTO */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
              Incassi per metodo di pagamento
            </h2>

            <NumberField
              label="Contanti finali in cassa"
              value={contantiFinali}
              onChange={setContantiFinali}
            />
            <NumberField label="POS" value={pos} onChange={setPos} />
            <NumberField label="Sella" value={sella} onChange={setSella} />
            <NumberField
              label="Stripe / Pay"
              value={stripePay}
              onChange={setStripePay}
            />
            <NumberField
              label="Bonifici"
              value={bonifici}
              onChange={setBonifici}
            />
            <NumberField
              label="Mance"
              value={mance}
              onChange={setMance}
            />
          </div>
        </div>

        {/* RIEPILOGO TOTALE / CASH */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="font-medium text-neutral-700">
                Totale incassi (calcolato)
              </span>
              <span className="font-semibold text-neutral-900">
                {totaleIncassi.toFixed(2)} €
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Somma di contanti, POS, Sella, Stripe/Pay, bonifici, mance.
            </p>
          </div>

          <div
            className={`rounded-2xl px-4 py-3 text-sm border ${
              cashStatus === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex justify-between">
              <span className="font-medium">
                Differenza (Totale incassi − Corrispettivi)
              </span>
              <span className="font-semibold">
                {cashDiff.toFixed(2)} €
              </span>
            </div>
            <p className="text-xs mt-1">
              {cashStatus === "ok"
                ? "Differenza in tolleranza (≈ 0)."
                : cashDiff > 0
                ? "Incassi maggiori dei corrispettivi (CASH +)."
                : "Incassi minori dei corrispettivi (CASH −)."}
            </p>
          </div>
        </div>

        {/* NOTE */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Note (eventi, problemi, chiusure particolari)
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-xl bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 text-sm"
          />
        </div>

        {/* SALVATAGGIO + MESSAGGI */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2 rounded-xl text-sm font-semibold shadow
              ${
                saving
                  ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                  : "bg-amber-600 text-white hover:bg-amber-700 hover:-translate-y-0.5 transition"
              }`}
          >
            {saving ? "Salvataggio..." : "Salva chiusura"}
          </button>

          {message && (
            <span className="text-sm text-green-700">{message}</span>
          )}
          {error && (
            <span className="text-sm text-red-700">Errore: {error}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Campo numerico riutilizzabile con stile coerente
function NumberField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-700 mb-1">
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 border border-neutral-300 rounded-xl bg-neutral-50 text-sm
                   focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
      />
    </div>
  );
}
