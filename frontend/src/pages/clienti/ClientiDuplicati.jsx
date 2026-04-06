// @version: v1.0-clienti-duplicati
// Gestione duplicati: suggerimenti automatici + merge manuale
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

export default function ClientiDuplicati() {
  const navigate = useNavigate();
  const [duplicati, setDuplicati] = useState([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(null); // id del gruppo in merge
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [merged, setMerged] = useState(0);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const fetchDuplicati = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/duplicati/suggerimenti?limit=100`);
      if (!res.ok) throw new Error("Errore caricamento");
      const data = await res.json();
      setDuplicati(data.duplicati || []);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDuplicati(); }, [fetchDuplicati]);

  const handleMerge = async (principale_id, secondario_id, idx) => {
    if (!window.confirm("Confermi il merge? Il cliente secondario verrà assorbito dal principale. Le prenotazioni e le note verranno spostate.")) return;
    setMerging(idx);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ principale_id, secondario_id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Errore merge");
      }
      const data = await res.json();
      showToast(data.message);
      setMerged((p) => p + 1);
      // Rimuovi il gruppo dalla lista
      setDuplicati((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setMerging(null);
    }
  };

  return (
    <>
      <ClientiNav current="duplicati" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">🔄 Gestione Duplicati</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Clienti con stesso nome o telefono. Seleziona il principale e unisci.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {merged > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">
                  {merged} merge completati
                </span>
              )}
              <button onClick={fetchDuplicati} disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-50">
                {loading ? "Caricamento..." : "Aggiorna"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-neutral-400">Analisi duplicati in corso...</div>
          ) : duplicati.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-neutral-700 font-medium">Nessun duplicato trovato</div>
              <div className="text-sm text-neutral-500 mt-1">Tutti i clienti sembrano univoci.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-neutral-500 mb-2">
                {duplicati.length} gruppi di possibili duplicati trovati
              </div>

              {duplicati.map((gruppo, idx) => (
                <DuplicatoCard
                  key={idx}
                  gruppo={gruppo}
                  idx={idx}
                  merging={merging}
                  onMerge={handleMerge}
                  onNavigate={(id) => navigate(`/clienti/${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {toast.show && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast({ ...toast, show: false })}>
          {toast.message}
        </div>
      )}
    </>
  );
}

function DuplicatoCard({ gruppo, idx, merging, onMerge, onNavigate }) {
  const [principale, setPrincipale] = useState(null);
  const clienti = gruppo.clienti || [];
  const isMerging = merging === idx;

  // Auto-seleziona il cliente con più prenotazioni come principale
  useEffect(() => {
    if (clienti.length >= 2) {
      const best = clienti.reduce((a, b) => (b.prenotazioni > a.prenotazioni ? b : a), clienti[0]);
      setPrincipale(best.id);
    }
  }, []);

  const secondario = clienti.find((c) => c.id !== principale);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
            gruppo.tipo === "nome" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
          }`}>
            {gruppo.tipo === "nome" ? "Stesso nome" : "Stesso telefono"}
          </span>
          <span className="text-sm font-medium text-neutral-700">{gruppo.match}</span>
          <span className="text-xs text-neutral-400">({clienti.length} record)</span>
        </div>
      </div>

      {/* Tabella clienti */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-neutral-500 uppercase tracking-wide">
              <th className="px-4 py-2 text-left w-10">★</th>
              <th className="px-4 py-2 text-left">Cognome</th>
              <th className="px-4 py-2 text-left">Nome</th>
              <th className="px-4 py-2 text-left">Telefono</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-right">Prenotazioni</th>
              <th className="px-4 py-2 text-center">Scheda</th>
            </tr>
          </thead>
          <tbody>
            {clienti.map((c) => {
              const isPrinc = principale === c.id;
              return (
                <tr key={c.id} className={`border-t border-neutral-100 ${isPrinc ? "bg-teal-50" : "hover:bg-neutral-50"}`}>
                  <td className="px-4 py-2">
                    <input
                      type="radio"
                      name={`princ-${idx}`}
                      checked={isPrinc}
                      onChange={() => setPrincipale(c.id)}
                      className="accent-teal-600"
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-neutral-800">
                    {c.cognome || "—"}
                    {isPrinc && <span className="ml-1.5 text-[10px] bg-teal-200 text-teal-800 px-1 py-0.5 rounded">PRINCIPALE</span>}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{c.nome || "—"}</td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">{c.telefono || "—"}</td>
                  <td className="px-4 py-2 text-neutral-500 text-xs truncate max-w-[180px]">{c.email || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-semibold ${c.prenotazioni > 0 ? "text-teal-700" : "text-neutral-400"}`}>
                      {c.prenotazioni}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => onNavigate(c.id)}
                      className="text-xs text-teal-600 hover:text-teal-800 hover:underline">
                      Apri
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Azioni */}
      {clienti.length === 2 && principale && secondario && (
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            <span className="font-medium text-neutral-700">{clienti.find(c => c.id === principale)?.cognome}</span>
            {" "}assorbe{" "}
            <span className="font-medium text-neutral-700">{secondario.cognome} {secondario.nome}</span>
            {" "}({secondario.prenotazioni} prenotazioni verranno trasferite)
          </div>
          <button
            onClick={() => onMerge(principale, secondario.id, idx)}
            disabled={isMerging}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50"
          >
            {isMerging ? "Unione..." : "Unisci"}
          </button>
        </div>
      )}

      {/* Per gruppi con più di 2 clienti */}
      {clienti.length > 2 && principale && (
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-100">
          <div className="text-xs text-neutral-500 mb-2">
            Gruppo con {clienti.length} clienti — unisci uno alla volta:
          </div>
          <div className="flex flex-wrap gap-2">
            {clienti.filter(c => c.id !== principale).map((sec) => (
              <button
                key={sec.id}
                onClick={() => onMerge(principale, sec.id, idx)}
                disabled={isMerging}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition disabled:opacity-50"
              >
                Unisci {sec.cognome} {sec.nome} ({sec.prenotazioni} pren.)
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
