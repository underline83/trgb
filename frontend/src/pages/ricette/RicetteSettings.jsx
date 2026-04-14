// @version: v1.0-ricette-settings
// Strumenti Ricette — Export JSON, Export PDF, Import JSON
// Visibile solo per admin
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import { isAdminRole } from "../../utils/authHelpers";
import RicetteNav from "./RicetteNav";

const FC = `${API_BASE}/foodcost`;

// ===============================================================
// SEZIONE COLLASSABILE
// ===============================================================
function Section({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-neutral-200 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 bg-neutral-50 hover:bg-neutral-100 transition text-left">
        <h2 className="text-lg font-semibold text-orange-900 font-playfair">
          {icon} {title}
        </h2>
        <span className="text-neutral-400 text-lg">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="px-6 py-5 border-t border-neutral-200">{children}</div>}
    </div>
  );
}

export default function RicetteSettings() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");
  const isAllowed = isAdminRole(role);

  const [ricette, setRicette] = useState([]);
  const [loadingRicette, setLoadingRicette] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Stato sezione Macellaio ──
  const [macCategorie, setMacCategorie] = useState([]);
  const [macConfig, setMacConfig] = useState({ widget_max_categorie: 4 });
  const [macLoading, setMacLoading] = useState(false);
  const [macMsg, setMacMsg] = useState("");
  const [macError, setMacError] = useState("");
  const [newCat, setNewCat] = useState({ nome: "", emoji: "🥩", ordine: 999 });
  const [editCatId, setEditCatId] = useState(null);
  const [editCat, setEditCat] = useState({ nome: "", emoji: "", ordine: 999, attivo: true });

  // ── Stato sezione Tipi Servizio (mig 074) ──
  const [svcTypes, setSvcTypes] = useState([]);
  const [svcLoading, setSvcLoading] = useState(false);
  const [svcMsg, setSvcMsg] = useState("");
  const [svcError, setSvcError] = useState("");
  const [newSvc, setNewSvc] = useState({ name: "", sort_order: 999 });
  const [editSvcId, setEditSvcId] = useState(null);
  const [editSvc, setEditSvc] = useState({ name: "", sort_order: 999, active: true });

  const loadSvcTypes = async () => {
    setSvcLoading(true);
    try {
      const r = await apiFetch(`${FC}/service-types?include_inactive=true`);
      if (r.ok) setSvcTypes(await r.json());
    } catch (e) {
      setSvcError("Errore caricamento tipi servizio");
    } finally {
      setSvcLoading(false);
    }
  };

  useEffect(() => { if (isAllowed) loadSvcTypes(); }, [isAllowed]);

  const showSvcMsg = (m) => { setSvcMsg(m); setTimeout(() => setSvcMsg(""), 3000); };
  const showSvcErr = (m) => { setSvcError(m); setTimeout(() => setSvcError(""), 5000); };

  const handleCreateSvc = async () => {
    if (!newSvc.name.trim()) return;
    try {
      const r = await apiFetch(`${FC}/service-types`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSvc.name.trim(),
          sort_order: Number(newSvc.sort_order) || 999,
          active: true,
        }),
      });
      if (!r.ok) { showSvcErr(`Errore: ${await r.text()}`); return; }
      setNewSvc({ name: "", sort_order: 999 });
      showSvcMsg("Tipo servizio creato");
      loadSvcTypes();
    } catch (e) { showSvcErr(e.message); }
  };

  const handleStartEditSvc = (s) => {
    setEditSvcId(s.id);
    setEditSvc({ name: s.name, sort_order: s.sort_order, active: s.active });
  };

  const handleSaveEditSvc = async (id) => {
    try {
      const r = await apiFetch(`${FC}/service-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editSvc.name.trim(),
          sort_order: Number(editSvc.sort_order) || 999,
          active: !!editSvc.active,
        }),
      });
      if (!r.ok) { showSvcErr(`Errore: ${await r.text()}`); return; }
      setEditSvcId(null);
      showSvcMsg("Tipo servizio salvato");
      loadSvcTypes();
    } catch (e) { showSvcErr(e.message); }
  };

  const handleDeleteSvc = async (id, name) => {
    if (!window.confirm(`Disattivare "${name}"? Le associazioni con piatti esistenti rimangono, ma non apparirà più tra le scelte.`)) return;
    try {
      const r = await apiFetch(`${FC}/service-types/${id}`, { method: "DELETE" });
      if (!r.ok) { showSvcErr(`Errore: ${await r.text()}`); return; }
      showSvcMsg("Tipo servizio disattivato");
      loadSvcTypes();
    } catch (e) { showSvcErr(e.message); }
  };

  // Carica categorie + config macellaio
  const loadMacellaio = async () => {
    setMacLoading(true);
    try {
      const [rCat, rCfg] = await Promise.all([
        apiFetch(`${API_BASE}/macellaio/categorie/?solo_attive=false`),
        apiFetch(`${API_BASE}/macellaio/config/`),
      ]);
      if (rCat.ok) setMacCategorie(await rCat.json());
      if (rCfg.ok) setMacConfig(await rCfg.json());
    } catch (e) {
      setMacError("Errore caricamento dati macellaio");
    } finally {
      setMacLoading(false);
    }
  };

  useEffect(() => { if (isAllowed) loadMacellaio(); }, [isAllowed]);

  const showMacMsg = (m) => { setMacMsg(m); setTimeout(() => setMacMsg(""), 3000); };
  const showMacErr = (m) => { setMacError(m); setTimeout(() => setMacError(""), 5000); };

  // CRUD categorie
  const handleCreateCat = async () => {
    if (!newCat.nome.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/macellaio/categorie/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newCat.nome.trim(),
          emoji: newCat.emoji || null,
          ordine: Number(newCat.ordine) || 999,
          attivo: true,
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        showMacErr(`Errore creazione: ${t || r.status}`);
        return;
      }
      setNewCat({ nome: "", emoji: "🥩", ordine: 999 });
      showMacMsg("Categoria creata");
      loadMacellaio();
    } catch (e) {
      showMacErr(e.message);
    }
  };

  const handleStartEdit = (c) => {
    setEditCatId(c.id);
    setEditCat({ nome: c.nome, emoji: c.emoji || "", ordine: c.ordine, attivo: c.attivo });
  };

  const handleSaveEdit = async (id) => {
    try {
      const r = await apiFetch(`${API_BASE}/macellaio/categorie/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editCat.nome.trim(),
          emoji: editCat.emoji || null,
          ordine: Number(editCat.ordine) || 999,
          attivo: !!editCat.attivo,
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        showMacErr(`Errore salvataggio: ${t || r.status}`);
        return;
      }
      setEditCatId(null);
      showMacMsg("Categoria salvata");
      loadMacellaio();
    } catch (e) {
      showMacErr(e.message);
    }
  };

  const handleDeleteCat = async (id, nome) => {
    if (!window.confirm(`Eliminare la categoria "${nome}"? Possibile solo se nessun taglio la usa.`)) return;
    try {
      const r = await apiFetch(`${API_BASE}/macellaio/categorie/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        showMacErr(`${t || r.status}`);
        return;
      }
      showMacMsg("Categoria eliminata");
      loadMacellaio();
    } catch (e) {
      showMacErr(e.message);
    }
  };

  const handleSaveConfig = async () => {
    try {
      const r = await apiFetch(`${API_BASE}/macellaio/config/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget_max_categorie: Number(macConfig.widget_max_categorie) || 4 }),
      });
      if (!r.ok) {
        showMacErr("Errore salvataggio config");
        return;
      }
      showMacMsg("Impostazioni salvate");
      loadMacellaio();
    } catch (e) {
      showMacErr(e.message);
    }
  };

  // Carica lista ricette per PDF singolo
  useEffect(() => {
    (async () => {
      setLoadingRicette(true);
      try {
        const r = await apiFetch(`${FC}/ricette`);
        if (r.ok) setRicette(await r.json());
      } catch {}
      setLoadingRicette(false);
    })();
  }, []);

  // Export JSON
  const handleExportJson = () => {
    const token = localStorage.getItem("token");
    window.open(`${FC}/ricette/export/json?token=${token}`, "_blank");
    setExportMsg("Export JSON avviato — controlla i download.");
    setTimeout(() => setExportMsg(""), 4000);
  };

  // Export PDF singola ricetta
  const handleExportPdf = (id) => {
    const token = localStorage.getItem("token");
    window.open(`${FC}/ricette/${id}/pdf?token=${token}`, "_blank");
  };

  // Import JSON
  const handleImportJson = async (file) => {
    if (!file) return;
    setImportLoading(true);
    setError("");
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.ricette || !Array.isArray(data.ricette)) {
        throw new Error("Il file JSON non contiene un array 'ricette' valido.");
      }

      let importate = 0;
      let errori = [];

      for (const ricetta of data.ricette) {
        try {
          // Per ogni ricetta, dobbiamo risolvere ingredient_id e sub_recipe_id dai nomi
          // Per ora, creiamo solo le ricette senza items (da completare manualmente)
          const payload = {
            name: ricetta.name,
            is_base: ricetta.is_base || false,
            yield_qty: ricetta.yield_qty || 1,
            yield_unit: ricetta.yield_unit || "pz",
            selling_price: ricetta.selling_price || null,
            prep_time: ricetta.prep_time || null,
            note: ricetta.note || null,
            items: [],
          };

          // Se la categoria esiste, cerchiamo di associarla
          if (ricetta.category) {
            try {
              const catResp = await apiFetch(`${FC}/ricette/categorie`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: ricetta.category }),
              });
              if (catResp.ok) {
                const cat = await catResp.json();
                payload.category_id = cat.id;
              }
            } catch {}
          }

          const resp = await apiFetch(`${FC}/ricette`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (resp.ok) {
            importate++;
          } else {
            const errText = await resp.text().catch(() => "");
            errori.push(`${ricetta.name}: ${errText || resp.status}`);
          }
        } catch (e) {
          errori.push(`${ricetta.name}: ${e.message}`);
        }
      }

      setImportResult({
        totale: data.ricette.length,
        importate,
        errori,
      });
    } catch (e) {
      setError(e.message || "Errore durante l'import JSON.");
    } finally {
      setImportLoading(false);
    }
  };

  // Access check
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-brand-cream p-6 font-sans flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-neutral-800 mb-2">Accesso riservato</h2>
          <p className="text-neutral-600 text-sm mb-4">
            Questa sezione è disponibile solo per gli amministratori.
          </p>
          <button onClick={() => navigate("/ricette")}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 shadow-sm transition">
            ← Menu Ricette
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <RicetteNav current="settings" />
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-orange-900 tracking-wide font-playfair mb-1">
            Strumenti Ricette
          </h1>
          <p className="text-neutral-600">
            Export, import, generazione PDF e strumenti di manutenzione.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div>
        )}

        {exportMsg && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">{exportMsg}</div>
        )}

        {/* ============================================= */}
        {/* SEZIONE 1: EXPORT JSON */}
        {/* ============================================= */}
        <Section title="Export ricette (JSON)" icon="📤" defaultOpen={true}>
          <p className="text-sm text-neutral-600 mb-4">
            Esporta tutte le ricette attive con i loro ingredienti in formato JSON.
            Utile per backup o per trasferire le ricette ad un'altra installazione.
          </p>
          <button onClick={handleExportJson}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-orange-700 text-white hover:bg-orange-800 shadow transition">
            Scarica JSON completo
          </button>
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 2: EXPORT PDF SINGOLA */}
        {/* ============================================= */}
        <Section title="Schede ricetta (PDF)" icon="📄">
          <p className="text-sm text-neutral-600 mb-4">
            Genera la scheda PDF di una singola ricetta con food cost, composizione e note.
          </p>
          {loadingRicette ? (
            <p className="text-sm text-neutral-400">Caricamento ricette...</p>
          ) : ricette.length === 0 ? (
            <p className="text-sm text-neutral-400">Nessuna ricetta trovata.</p>
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-600 sticky top-0">
                  <tr>
                    <th className="p-2.5 text-left font-medium">Ricetta</th>
                    <th className="p-2.5 text-left font-medium">Categoria</th>
                    <th className="p-2.5 text-center font-medium">FC %</th>
                    <th className="p-2.5 text-right font-medium">Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {ricette.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-100 hover:bg-orange-50/40 transition">
                      <td className="p-2.5 font-medium text-neutral-900">
                        {r.is_base && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1.5">Base</span>}
                        {r.name}
                      </td>
                      <td className="p-2.5 text-neutral-600">{r.category_name || "—"}</td>
                      <td className="p-2.5 text-center">
                        {r.food_cost_pct != null ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            r.food_cost_pct > 45 ? "bg-red-100 text-red-800 border-red-300"
                              : r.food_cost_pct > 35 ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                              : "bg-green-100 text-green-800 border-green-300"
                          }`}>
                            {r.food_cost_pct.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="p-2.5 text-right">
                        <button onClick={() => handleExportPdf(r.id)}
                          className="px-3 py-1 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition">
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 3: IMPORT JSON */}
        {/* ============================================= */}
        <Section title="Import ricette (JSON)" icon="📥">
          <p className="text-sm text-neutral-600 mb-4">
            Importa ricette da un file JSON (stesso formato dell'export).
            Le ricette vengono create come nuove — gli ingredienti devono già esistere nel sistema.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow transition cursor-pointer text-center ${
              importLoading ? "bg-neutral-300 text-neutral-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>
              {importLoading ? "Importazione..." : "Seleziona file JSON"}
              <input type="file" accept=".json" className="hidden"
                onChange={(e) => handleImportJson(e.target.files?.[0])} disabled={importLoading} />
            </label>
          </div>
          {importResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">Import completato</p>
              <p className="text-green-700">
                Totale nel file: <strong>{importResult.totale}</strong> — Importate: <strong>{importResult.importate}</strong>
              </p>
              {importResult.errori.length > 0 && (
                <details className="mt-2">
                  <summary className="font-semibold text-red-700 cursor-pointer">Errori ({importResult.errori.length})</summary>
                  <ul className="list-disc pl-5 text-red-600 text-xs mt-1">
                    {importResult.errori.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 4: SCELTA DEL MACELLAIO */}
        {/* ============================================= */}
        <Section title="Scelta del Macellaio" icon="🥩">
          <p className="text-sm text-neutral-600 mb-4">
            Configura le categorie dei tagli (Filetto, Controfiletto, Costata, ecc.) e il numero massimo di categorie mostrate nel widget della dashboard.
          </p>

          {macMsg && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 mb-3">{macMsg}</div>
          )}
          {macError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 mb-3">{macError}</div>
          )}

          {/* ── Config widget ── */}
          <div className="border border-neutral-200 rounded-xl p-4 mb-5 bg-neutral-50">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Categorie mostrate nel widget
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={macConfig.widget_max_categorie}
                  onChange={(e) => setMacConfig({ ...macConfig, widget_max_categorie: e.target.value })}
                  className="w-28 px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>
              <button
                onClick={handleSaveConfig}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-orange-700 text-white hover:bg-orange-800 shadow transition"
              >
                Salva impostazioni
              </button>
              <p className="text-xs text-neutral-500 flex-1 min-w-[200px]">
                Le categorie oltre questo limite saranno sommate come "+ N altre categorie".
              </p>
            </div>
          </div>

          {/* ── Lista categorie ── */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-600">
                <tr>
                  <th className="p-2.5 text-left font-medium w-16">Emoji</th>
                  <th className="p-2.5 text-left font-medium">Nome</th>
                  <th className="p-2.5 text-center font-medium w-24">Ordine</th>
                  <th className="p-2.5 text-center font-medium w-20">Attiva</th>
                  <th className="p-2.5 text-right font-medium w-40">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {macLoading ? (
                  <tr><td colSpan={5} className="p-4 text-center text-neutral-400">Caricamento…</td></tr>
                ) : macCategorie.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center text-neutral-400">Nessuna categoria configurata.</td></tr>
                ) : (
                  macCategorie.map((c) => (
                    <tr key={c.id} className="border-t border-neutral-100">
                      {editCatId === c.id ? (
                        <>
                          <td className="p-2">
                            <input
                              value={editCat.emoji}
                              onChange={(e) => setEditCat({ ...editCat, emoji: e.target.value })}
                              maxLength={4}
                              className="w-12 px-2 py-1 border border-neutral-300 rounded text-sm text-center"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={editCat.nome}
                              onChange={(e) => setEditCat({ ...editCat, nome: e.target.value })}
                              className="w-full px-2 py-1 border border-neutral-300 rounded text-sm"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              value={editCat.ordine}
                              onChange={(e) => setEditCat({ ...editCat, ordine: e.target.value })}
                              className="w-20 px-2 py-1 border border-neutral-300 rounded text-sm text-center"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={!!editCat.attivo}
                              onChange={(e) => setEditCat({ ...editCat, attivo: e.target.checked })}
                            />
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleSaveEdit(c.id)}
                                className="px-2.5 py-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                              >
                                Salva
                              </button>
                              <button
                                onClick={() => setEditCatId(null)}
                                className="px-2.5 py-1 text-xs font-semibold bg-neutral-200 hover:bg-neutral-300 rounded-lg transition"
                              >
                                Annulla
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2.5 text-center text-xl">{c.emoji || "—"}</td>
                          <td className="p-2.5 font-medium text-neutral-900">{c.nome}</td>
                          <td className="p-2.5 text-center text-neutral-600">{c.ordine}</td>
                          <td className="p-2.5 text-center">
                            {c.attivo ? (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Sì</span>
                            ) : (
                              <span className="text-xs bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">No</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => handleStartEdit(c)}
                                className="px-2.5 py-1 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition"
                              >
                                Modifica
                              </button>
                              <button
                                onClick={() => handleDeleteCat(c.id, c.nome)}
                                className="px-2.5 py-1 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition"
                              >
                                Elimina
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Nuova categoria ── */}
          <div className="border border-dashed border-neutral-300 rounded-xl p-4 bg-neutral-50">
            <p className="text-xs font-semibold text-neutral-700 mb-2">Aggiungi categoria</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-[11px] text-neutral-500 mb-1">Emoji</label>
                <input
                  value={newCat.emoji}
                  onChange={(e) => setNewCat({ ...newCat, emoji: e.target.value })}
                  maxLength={4}
                  placeholder="🥩"
                  className="w-16 px-2 py-2 border border-neutral-300 rounded-lg text-sm text-center"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[11px] text-neutral-500 mb-1">Nome categoria</label>
                <input
                  value={newCat.nome}
                  onChange={(e) => setNewCat({ ...newCat, nome: e.target.value })}
                  placeholder="es. Entrecôte"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-500 mb-1">Ordine</label>
                <input
                  type="number"
                  value={newCat.ordine}
                  onChange={(e) => setNewCat({ ...newCat, ordine: e.target.value })}
                  className="w-24 px-2 py-2 border border-neutral-300 rounded-lg text-sm text-center"
                />
              </div>
              <button
                onClick={handleCreateCat}
                disabled={!newCat.nome.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 text-white shadow transition"
              >
                Aggiungi
              </button>
            </div>
          </div>
        </Section>

        {/* ============================================= */}
        {/* SEZIONE 5: TIPI SERVIZIO (menu preventivi) */}
        {/* ============================================= */}
        <Section title="Tipi servizio (menu preventivi)" icon="🍽️">
          <p className="text-sm text-neutral-600 mb-4">
            Configura i tipi di servizio (Alla carta, Banchetto, Pranzo di lavoro, Aperitivo, …) utilizzati per classificare i piatti nei menu preventivi.
            Ogni piatto può appartenere a più tipi servizio. Disattivare un tipo lo rimuove dalle scelte nuove, ma mantiene le associazioni esistenti.
          </p>

          {svcMsg && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 mb-3">{svcMsg}</div>
          )}
          {svcError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 mb-3">{svcError}</div>
          )}

          <div className="border border-neutral-200 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-600">
                <tr>
                  <th className="p-2.5 text-left font-medium">Nome</th>
                  <th className="p-2.5 text-center font-medium w-24">Ordine</th>
                  <th className="p-2.5 text-center font-medium w-20">Attivo</th>
                  <th className="p-2.5 text-right font-medium w-40">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {svcLoading ? (
                  <tr><td colSpan={4} className="p-4 text-center text-neutral-400">Caricamento…</td></tr>
                ) : svcTypes.length === 0 ? (
                  <tr><td colSpan={4} className="p-4 text-center text-neutral-400">Nessun tipo servizio.</td></tr>
                ) : (
                  svcTypes.map((s) => (
                    <tr key={s.id} className="border-t border-neutral-100">
                      {editSvcId === s.id ? (
                        <>
                          <td className="p-2">
                            <input value={editSvc.name}
                              onChange={(e) => setEditSvc({ ...editSvc, name: e.target.value })}
                              className="w-full px-2 py-1 border border-neutral-300 rounded text-sm" />
                          </td>
                          <td className="p-2 text-center">
                            <input type="number" value={editSvc.sort_order}
                              onChange={(e) => setEditSvc({ ...editSvc, sort_order: e.target.value })}
                              className="w-20 px-2 py-1 border border-neutral-300 rounded text-sm text-center" />
                          </td>
                          <td className="p-2 text-center">
                            <input type="checkbox" checked={!!editSvc.active}
                              onChange={(e) => setEditSvc({ ...editSvc, active: e.target.checked })} />
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => handleSaveEditSvc(s.id)}
                                className="px-2.5 py-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition">Salva</button>
                              <button onClick={() => setEditSvcId(null)}
                                className="px-2.5 py-1 text-xs font-semibold bg-neutral-200 hover:bg-neutral-300 rounded-lg transition">Annulla</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2.5 font-medium text-neutral-900">{s.name}</td>
                          <td className="p-2.5 text-center text-neutral-600">{s.sort_order}</td>
                          <td className="p-2.5 text-center">
                            {s.active ? (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Sì</span>
                            ) : (
                              <span className="text-xs bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">No</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => handleStartEditSvc(s)}
                                className="px-2.5 py-1 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition">Modifica</button>
                              {s.active && (
                                <button onClick={() => handleDeleteSvc(s.id, s.name)}
                                  className="px-2.5 py-1 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition">Disattiva</button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-dashed border-neutral-300 rounded-xl p-4 bg-neutral-50">
            <p className="text-xs font-semibold text-neutral-700 mb-2">Aggiungi tipo servizio</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] text-neutral-500 mb-1">Nome</label>
                <input value={newSvc.name}
                  onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })}
                  placeholder="es. Cena aziendale"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-500 mb-1">Ordine</label>
                <input type="number" value={newSvc.sort_order}
                  onChange={(e) => setNewSvc({ ...newSvc, sort_order: e.target.value })}
                  className="w-24 px-2 py-2 border border-neutral-300 rounded-lg text-sm text-center" />
              </div>
              <button onClick={handleCreateSvc} disabled={!newSvc.name.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 text-white shadow transition">
                Aggiungi
              </button>
            </div>
          </div>
        </Section>

        {/* INFO */}
        <div className="text-xs text-neutral-500 bg-neutral-50 rounded-xl p-4 border border-neutral-200">
          <p className="font-semibold mb-1">Note:</p>
          <p>L'export JSON include tutte le ricette attive con i nomi degli ingredienti.</p>
          <p>L'import crea le ricette come nuove entry. Per aggiornare ricette esistenti, modificale singolarmente.</p>
          <p>Il PDF viene generato dal server con i dati aggiornati al momento della richiesta.</p>
        </div>

      </div>
    </div>
  );
}
