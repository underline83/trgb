// @version: v1.2-clienti-duplicati
// Gestione duplicati: suggerimenti automatici + merge manuale + auto-merge ovvi
// Flow: 1) seleziona principale (radio) → 2) spunta secondari da assorbire → 3) conferma
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";
import Tooltip from "../../components/Tooltip";

export default function ClientiDuplicati({ embedded = false }) {
  const navigate = useNavigate();
  const [duplicati, setDuplicati] = useState([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [merged, setMerged] = useState(0);
  const [filtro, setFiltro] = useState("telefono"); // default: telefono (più affidabile)

  // Auto-merge state
  const [autoPreview, setAutoPreview] = useState(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMerging, setAutoMerging] = useState(false);

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

  // Pulizia telefoni placeholder
  const handlePuliziaTel = async () => {
    if (!window.confirm("Cancellare tutti i numeri di telefono finti/placeholder dal database?\n\n(Numeri tipo +39000000000 importati da TheFork)")) return;
    try {
      const res = await apiFetch(`${API_BASE}/clienti/pulizia/telefoni-placeholder`, { method: "POST" });
      if (!res.ok) throw new Error("Errore pulizia");
      const data = await res.json();
      showToast(`Puliti ${data.cleaned} telefoni placeholder`);
      fetchDuplicati();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Normalizza testi (Title Case)
  const handleNormalizzaTesti = async () => {
    if (!window.confirm("Normalizzare nomi, cognomi e città?\n\nEs: 'MARIO ROSSI' → 'Mario Rossi'\nI nomi già in formato misto (es. McDonald) non vengono toccati.")) return;
    try {
      const res = await apiFetch(`${API_BASE}/clienti/pulizia/normalizza-testi`, { method: "POST" });
      if (!res.ok) throw new Error("Errore normalizzazione");
      const data = await res.json();
      showToast(`Normalizzati ${data.updated} clienti`);
      fetchDuplicati();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Auto-merge: preview
  const handleAutoPreview = async () => {
    setAutoLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/merge/auto-preview`);
      if (!res.ok) throw new Error("Errore preview");
      const data = await res.json();
      setAutoPreview(data);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAutoLoading(false);
    }
  };

  // Auto-merge: esegui
  const handleAutoMerge = async () => {
    if (!autoPreview || autoPreview.totale_gruppi === 0) return;
    const msg = `Unire automaticamente ${autoPreview.totale_secondari} duplicati in ${autoPreview.totale_gruppi} gruppi?\n\nIl cliente con più prenotazioni viene mantenuto. L'operazione NON è reversibile.`;
    if (!window.confirm(msg)) return;
    setAutoMerging(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/merge/auto`, { method: "POST" });
      if (!res.ok) throw new Error("Errore auto-merge");
      const data = await res.json();
      showToast(`Auto-merge completato: ${data.merged} clienti unificati${data.errors.length ? ` (${data.errors.length} errori)` : ""}`);
      setMerged((p) => p + data.merged);
      setAutoPreview(null);
      fetchDuplicati(); // ricarica lista
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setAutoMerging(false);
    }
  };

  // Merge sequenziale: per ogni secondario selezionato, chiama l'endpoint
  // secData: se presente, dopo il merge salva nome2/cognome2 come coppia
  const handleMergeBatch = async (principale_id, secondari_ids, idx, secData) => {
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
      // Se coppia: salva nome2/cognome2 dal secondario al principale
      if (secData) {
        const princRes = await apiFetch(`${API_BASE}/clienti/${principale_id}`);
        if (princRes.ok) {
          const princData = await princRes.json();
          await apiFetch(`${API_BASE}/clienti/${principale_id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...princData, nome2: secData.nome, cognome2: secData.cognome }),
          });
        }
      }
      showToast(`Merge completato: ${count} clienti unificati${secData ? " (coppia salvata)" : ""}`);
      setMerged((p) => p + count);
      setDuplicati((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      showToast(err.message, "error");
      if (count > 0) fetchDuplicati(); // ricarica se merge parziale
    } finally {
      setMerging(null);
    }
  };

  const handleIgnore = async (ids, idx) => {
    try {
      const res = await apiFetch(`${API_BASE}/clienti/duplicati/escludi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Errore");
      }
      showToast("Gruppo escluso dai duplicati");
      setDuplicati((prev) => prev.filter((_, i) => i !== idx));
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const content = (
    <>
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
              <button onClick={handleNormalizzaTesti}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-white hover:bg-sky-600 transition">
                Normalizza testi
              </button>
              <button onClick={handlePuliziaTel}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition">
                Pulisci tel. finti
              </button>
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

          {/* ── AUTO-MERGE OVVI ── */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-amber-800">Auto-merge duplicati ovvi</h3>
                <p className="text-xs text-amber-600 mt-0.5">
                  Unisce automaticamente i record con stesso telefono+cognome o stessa email+cognome.
                  Il cliente con più prenotazioni viene mantenuto come principale.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {!autoPreview ? (
                  <button onClick={handleAutoPreview} disabled={autoLoading}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50 shadow-sm">
                    {autoLoading ? "Analisi..." : "Analizza"}
                  </button>
                ) : autoPreview.totale_gruppi === 0 ? (
                  <span className="text-xs text-emerald-700 font-medium bg-emerald-100 px-3 py-1.5 rounded-lg">
                    Nessun duplicato ovvio trovato
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-amber-800 font-medium">
                      {autoPreview.totale_gruppi} gruppi, {autoPreview.totale_secondari} da eliminare
                    </span>
                    <button onClick={handleAutoMerge} disabled={autoMerging}
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition disabled:opacity-50 shadow-sm">
                      {autoMerging ? "Merge in corso..." : "Conferma Auto-Merge"}
                    </button>
                    <button onClick={() => setAutoPreview(null)}
                      className="px-3 py-2 rounded-lg text-xs text-neutral-500 hover:text-neutral-700 border border-neutral-300 bg-white transition">
                      Annulla
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* Preview dettaglio */}
            {autoPreview && autoPreview.totale_gruppi > 0 && (
              <div className="mt-3 max-h-60 overflow-y-auto border border-amber-200 rounded-lg bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-amber-50 sticky top-0">
                    <tr className="text-[10px] uppercase text-amber-700 tracking-wide">
                      <th className="px-3 py-1.5 text-left">Motivo</th>
                      <th className="px-3 py-1.5 text-left">Mantiene (principale)</th>
                      <th className="px-3 py-1.5 text-right">Pren.</th>
                      <th className="px-3 py-1.5 text-left">Elimina (secondari)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {autoPreview.gruppi.map((g, i) => (
                      <tr key={i} className="hover:bg-amber-50/50">
                        <td className="px-3 py-1.5 text-amber-700">{g.motivo}</td>
                        <td className="px-3 py-1.5 font-medium text-teal-800">
                          {g.principale.cognome} {g.principale.nome}
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold text-teal-700">{g.principale.prenotazioni}</td>
                        <td className="px-3 py-1.5 text-red-600">
                          {g.secondari.map(s => `${s.cognome} ${s.nome} (${s.prenotazioni} pren.)`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                  onIgnore={handleIgnore}
                  onNavigate={(id) => navigate(`/clienti/${id}`)}
                />
              ))}
            </div>
          )}

      {toast.show && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`} onClick={() => setToast({ ...toast, show: false })}>
          {toast.message}
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <>
      <ClientiNav current="impostazioni" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          {content}
        </div>
      </div>
    </>
  );
}

function DuplicatoCard({ gruppo, idx, merging, onMergeBatch, onIgnore, onNavigate }) {
  const clienti = gruppo.clienti || [];
  const isMerging = merging === idx;

  // Step 1: scegli il principale (radio)
  const [principale, setPrincipale] = useState(null);
  // Step 2: spunta i secondari da assorbire (checkbox)
  const [selezionati, setSelezionati] = useState(new Set());
  // Opzione coppia: salva nome2/cognome2 dal secondario
  const [comeCoppia, setComeCoppia] = useState(false);

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
    const coppiaMsg = comeCoppia ? "\n\nNome e cognome del secondario verranno salvati come coppia." : "";
    const msg = `Unire ${nomi} dentro "${princNome?.cognome} ${princNome?.nome}"?\n\nPrenotazioni e note verranno trasferite. L'operazione non è reversibile.${coppiaMsg}`;
    if (!window.confirm(msg)) return;
    // Passa i dati del secondario per la coppia
    const secData = comeCoppia && selezionati.size === 1
      ? clienti.find((c) => selezionati.has(c.id))
      : null;
    onMergeBatch(principale, [...selezionati], idx, secData);
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
        <div className="flex items-center gap-2">
          {!principale && (
            <span className="text-xs text-amber-600 font-medium">1. Scegli il principale</span>
          )}
          {principale && selezionati.size === 0 && (
            <span className="text-xs text-amber-600 font-medium">2. Spunta chi assorbire</span>
          )}
          {principale && selezionati.size > 0 && (
            <span className="text-xs text-emerald-600 font-medium">3. Conferma il merge</span>
          )}
          <Tooltip label="Non sono duplicati (es. marito e moglie)">
            <button
              onClick={() => onIgnore(clienti.map((c) => c.id), idx)}
              className="text-[11px] text-neutral-400 hover:text-red-500 transition ml-2"
            >
              Non sono duplicati
            </button>
          </Tooltip>
        </div>
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
                    <span onClick={() => onNavigate(c.id)} className="cursor-pointer hover:underline">
                      {c.cognome || "\u2014"}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 ${isPrinc ? "text-teal-700" : isSelected ? "text-red-600 line-through" : "text-neutral-600"}`}>
                    <span onClick={() => onNavigate(c.id)} className="cursor-pointer hover:underline">
                      {c.nome || "\u2014"}
                    </span>
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
          <div className="flex items-center gap-3">
            {selezionati.size === 1 && (
              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={comeCoppia}
                  onChange={(e) => setComeCoppia(e.target.checked)}
                  className="rounded border-neutral-300 text-teal-600 accent-teal-600" />
                <span className="text-neutral-600">Salva come coppia</span>
              </label>
            )}
            <button
              onClick={handleConfirm}
              disabled={isMerging}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50 shadow-sm"
            >
              {isMerging ? "Unione in corso..." : "Conferma Merge"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
