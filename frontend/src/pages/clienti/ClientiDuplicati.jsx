// @version: v1.1-clienti-duplicati
// Gestione duplicati: suggerimenti automatici + merge manuale
// Flow: 1) seleziona principale (radio) → 2) spunta secondari da assorbire → 3) conferma
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

export default function ClientiDuplicati() {
  const navigate = useNavigate();
  const [duplicati, setDuplicati] = useState([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [merged, setMerged] = useState(0);
  const [filtro, setFiltro] = useState("telefono"); // default: telefono (più affidabile)

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const fetchDuplicati = useCallback(async () => {
    setLoading(true);
    try {
      const tipoParam = filtro ? `&tipo=${filtro}` : "";
      const res = await apiFetch(`${API_BASE}/clienti/duplicati/suggerimenti?limit=100${tipoParam}`);
      if (!res.ok) throw new Error("Errore caricamento");
      const data = await res.json();
      setDuplicati(data.duplicati || []);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { fetchDuplicati(); }, [fetchDuplicati]);

  // Merge sequenziale: per ogni secondario selezionato, chiama l'endpoint
  const handleMergeBatch = async (principale_id, secondari_ids, idx) => {
    setMerging(idx);
    let count = 0;
    try {
      for (const sec_id of secondari_ids) {
        const res = await apiFetch(`${API_BASE}/clienti/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ principale_id, secondario_id: sec_id }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || `Errore merge ID ${sec_id}`);
        }
        count++;
      }
      showToast(`Merge completato: ${count} clienti unificati`);
      setMerged((p) => p + count);
      setDuplicati((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      showToast(err.message, "error");
      if (count > 0) fetchDuplicati(); // ricarica se merge parziale
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
              <h1 className="text-2xl font-bold text-neutral-900">Gestione Duplicati</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Clienti con stesso nome o telefono. Per ogni gruppo: scegli il principale, spunta chi assorbire, conferma.
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

          {/* Filtri priorità */}
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xs text-neutral-500 font-medium mr-1">Cerca per:</span>
            {[
              { key: "telefono", label: "Telefono", icon: "1", desc: "Stesso numero" },
              { key: "email", label: "Email", icon: "2", desc: "Stessa email" },
              { key: "nome", label: "Nome e Cognome", icon: "3", desc: "Stesso nome" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition border ${
                  filtro === f.key
                    ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                    : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300"
                }`}
              >
                <span className="font-bold mr-1">{f.icon}.</span>
                {f.label}
                <span className="ml-1 opacity-60">— {f.desc}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-neutral-400">Analisi duplicati in corso...</div>
          ) : duplicati.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center">
              <div className="text-4xl mb-3">OK</div>
              <div className="text-neutral-700 font-medium">Nessun duplicato trovato</div>
              <div className="text-sm text-neutral-500 mt-1">Tutti i clienti sembrano univoci.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-neutral-500 mb-2">
                {duplicati.length} gruppi di possibili duplicati
              </div>

              {duplicati.map((gruppo, idx) => (
                <DuplicatoCard
                  key={idx}
                  gruppo={gruppo}
                  idx={idx}
                  merging={merging}
                  onMergeBatch={handleMergeBatch}
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

function DuplicatoCard({ gruppo, idx, merging, onMergeBatch, onNavigate }) {
  const clienti = gruppo.clienti || [];
  const isMerging = merging === idx;

  // Step 1: scegli il principale (radio)
  const [principale, setPrincipale] = useState(null);
  // Step 2: spunta i secondari da assorbire (checkbox)
  const [selezionati, setSelezionati] = useState(new Set());

  // Auto-seleziona il cliente con più prenotazioni come default
  useEffect(() => {
    if (clienti.length >= 2) {
      const best = clienti.reduce((a, b) => (b.prenotazioni > a.prenotazioni ? b : a), clienti[0]);
      setPrincipale(best.id);
    }
  }, []);

  // Quando cambia il principale, resetta i selezionati
  useEffect(() => {
    setSelezionati(new Set());
  }, [principale]);

  const toggleSecondario = (id) => {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!principale || selezionati.size === 0) return;
    const nomi = clienti
      .filter((c) => selezionati.has(c.id))
      .map((c) => `${c.cognome} ${c.nome}`.trim())
      .join(", ");
    const princNome = clienti.find((c) => c.id === principale);
    const msg = `Unire ${nomi} dentro "${princNome?.cognome} ${princNome?.nome}"?\n\nPrenotazioni e note verranno trasferite. L'operazione non è reversibile.`;
    if (!window.confirm(msg)) return;
    onMergeBatch(principale, [...selezionati], idx);
  };

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
        {!principale && (
          <span className="text-xs text-amber-600 font-medium">1. Scegli il principale</span>
        )}
        {principale && selezionati.size === 0 && (
          <span className="text-xs text-amber-600 font-medium">2. Spunta chi assorbire</span>
        )}
        {principale && selezionati.size > 0 && (
          <span className="text-xs text-emerald-600 font-medium">3. Conferma il merge</span>
        )}
      </div>

      {/* Tabella clienti */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-neutral-500 uppercase tracking-wide border-b border-neutral-100">
              <th className="px-4 py-2 text-center w-16">Princ.</th>
              <th className="px-4 py-2 text-center w-16">Unisci</th>
              <th className="px-4 py-2 text-left">Cognome</th>
              <th className="px-4 py-2 text-left">Nome</th>
              <th className="px-4 py-2 text-left">Telefono</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-right">Pren.</th>
              <th className="px-4 py-2 text-center">Scheda</th>
            </tr>
          </thead>
          <tbody>
            {clienti.map((c) => {
              const isPrinc = principale === c.id;
              const isSelected = selezionati.has(c.id);
              return (
                <tr key={c.id} className={
                  isPrinc
                    ? "bg-teal-50/70 border-t border-teal-100"
                    : isSelected
                      ? "bg-red-50/50 border-t border-red-100"
                      : "border-t border-neutral-100 hover:bg-neutral-50"
                }>
                  {/* Radio: scegli principale */}
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="radio"
                      name={`princ-${idx}`}
                      checked={isPrinc}
                      onChange={() => setPrincipale(c.id)}
                      disabled={isMerging}
                      className="accent-teal-600"
                    />
                  </td>
                  {/* Checkbox: seleziona per merge (solo se NON è il principale) */}
                  <td className="px-4 py-2.5 text-center">
                    {isPrinc ? (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">MANTIENI</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSecondario(c.id)}
                        disabled={!principale || isMerging}
                        className="accent-red-500 w-4 h-4"
                      />
                    )}
                  </td>
                  <td className={`px-4 py-2.5 font-medium ${isPrinc ? "text-teal-800" : isSelected ? "text-red-700 line-through" : "text-neutral-800"}`}>
                    {c.cognome || "\u2014"}
                  </td>
                  <td className={`px-4 py-2.5 ${isPrinc ? "text-teal-700" : isSelected ? "text-red-600 line-through" : "text-neutral-600"}`}>
                    {c.nome || "\u2014"}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs">{c.telefono || "\u2014"}</td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs truncate max-w-[180px]">{c.email || "\u2014"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-semibold ${c.prenotazioni > 0 ? "text-teal-700" : "text-neutral-400"}`}>
                      {c.prenotazioni}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
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

      {/* Barra conferma — appare solo quando c'è almeno un secondario selezionato */}
      {principale && selezionati.size > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
          <div className="text-xs text-neutral-700">
            <span className="font-semibold text-teal-700">
              {clienti.find((c) => c.id === principale)?.cognome}{" "}
              {clienti.find((c) => c.id === principale)?.nome}
            </span>
            {" "}assorbe{" "}
            <span className="font-semibold text-red-600">
              {selezionati.size} client{selezionati.size === 1 ? "e" : "i"}
            </span>
            {" \u2014 "}
            {clienti.filter((c) => selezionati.has(c.id)).reduce((s, c) => s + c.prenotazioni, 0)} prenotazioni verranno trasferite
          </div>
          <button
            onClick={handleConfirm}
            disabled={isMerging}
            className="px-5 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50 shadow-sm"
          >
            {isMerging ? "Unione in corso..." : "Conferma Merge"}
          </button>
        </div>
      )}
    </div>
  );
}
