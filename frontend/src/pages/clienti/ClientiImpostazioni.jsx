// @version: v1.0-clienti-impostazioni
// Impostazioni CRM: soglie segmenti marketing configurabili
import React, { useState, useEffect } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import ClientiNav from "./ClientiNav";

const SEGMENTI_CONFIG = [
  {
    chiave: "seg_abituale_min",
    label: "Abituale — visite minime",
    desc: "Quante visite nella finestra per essere considerato abituale",
    type: "number",
    min: 1,
    max: 50,
  },
  {
    chiave: "seg_occasionale_min",
    label: "Occasionale — visite minime",
    desc: "Quante visite nella finestra per essere considerato occasionale (sotto la soglia abituale)",
    type: "number",
    min: 1,
    max: 50,
  },
  {
    chiave: "seg_finestra_mesi",
    label: "Finestra di osservazione (mesi)",
    desc: "Quanti mesi guardare indietro per contare le visite (abituale/occasionale)",
    type: "number",
    min: 1,
    max: 36,
  },
  {
    chiave: "seg_nuovo_giorni",
    label: "Nuovo — entro quanti giorni",
    desc: "Giorni dalla prima visita per considerare un cliente come nuovo",
    type: "number",
    min: 7,
    max: 365,
  },
  {
    chiave: "seg_nuovo_max_visite",
    label: "Nuovo — max visite",
    desc: "Numero massimo di visite per restare nel segmento nuovo",
    type: "number",
    min: 1,
    max: 20,
  },
  {
    chiave: "seg_perso_giorni",
    label: "Perso — dopo quanti giorni",
    desc: "Giorni senza visite per considerare un cliente come perso",
    type: "number",
    min: 30,
    max: 730,
  },
];

export default function ClientiImpostazioni() {
  const [impostazioni, setImpostazioni] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [dirty, setDirty] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  useEffect(() => {
    fetchImpostazioni();
  }, []);

  const fetchImpostazioni = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/clienti/impostazioni`);
      if (!res.ok) throw new Error("Errore caricamento");
      const data = await res.json();
      const map = {};
      (data.impostazioni || []).forEach((i) => {
        map[i.chiave] = i.valore;
      });
      setImpostazioni(map);
      setDirty(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (chiave, valore) => {
    setImpostazioni((prev) => ({ ...prev, [chiave]: valore }));
    setDirty(true);
  };

  const handleSave = async () => {
    // Validazione: occasionale_min deve essere < abituale_min
    const abMin = parseInt(impostazioni.seg_abituale_min || "5");
    const ocMin = parseInt(impostazioni.seg_occasionale_min || "1");
    if (ocMin >= abMin) {
      showToast(`La soglia occasionale (${ocMin}) deve essere inferiore a quella abituale (${abMin})`, "error");
      return;
    }

    setSaving(true);
    try {
      // Manda solo le chiavi seg_*
      const body = {};
      SEGMENTI_CONFIG.forEach((c) => {
        if (impostazioni[c.chiave] !== undefined) {
          body[c.chiave] = impostazioni[c.chiave];
        }
      });
      const res = await apiFetch(`${API_BASE}/clienti/impostazioni`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Errore salvataggio");
      showToast("Impostazioni salvate — i segmenti verranno ricalcolati al prossimo caricamento");
      setDirty(false);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm("Ripristinare i valori di default?")) return;
    setImpostazioni({
      seg_abituale_min: "5",
      seg_occasionale_min: "1",
      seg_nuovo_giorni: "90",
      seg_nuovo_max_visite: "2",
      seg_perso_giorni: "365",
      seg_finestra_mesi: "12",
    });
    setDirty(true);
  };

  // Calcola un esempio per ogni segmento basato sui valori attuali
  const esempio = () => {
    const fm = impostazioni.seg_finestra_mesi || "12";
    const ab = impostazioni.seg_abituale_min || "5";
    const oc = impostazioni.seg_occasionale_min || "1";
    const ng = impostazioni.seg_nuovo_giorni || "90";
    const nv = impostazioni.seg_nuovo_max_visite || "2";
    const pg = impostazioni.seg_perso_giorni || "365";
    return [
      { segmento: "Abituale", regola: `${ab}+ visite negli ultimi ${fm} mesi`, color: "text-teal-700 bg-teal-50" },
      { segmento: "Occasionale", regola: `${oc}-${parseInt(ab) - 1} visite negli ultimi ${fm} mesi`, color: "text-sky-700 bg-sky-50" },
      { segmento: "Nuovo", regola: `Prima visita entro ${ng} giorni, max ${nv} visite`, color: "text-emerald-700 bg-emerald-50" },
      { segmento: "Perso", regola: `Nessuna visita da ${pg}+ giorni`, color: "text-red-700 bg-red-50" },
      { segmento: "Mai venuto", regola: "Nessuna prenotazione completata", color: "text-neutral-500 bg-neutral-50" },
    ];
  };

  return (
    <>
      <ClientiNav current="impostazioni" />
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Impostazioni CRM</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Configura le soglie per la segmentazione automatica dei clienti
              </p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-neutral-400">Caricamento...</div>
          ) : (
            <>
              {/* Soglie segmenti */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden mb-6">
                <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
                  <h2 className="text-sm font-semibold text-neutral-800">Soglie segmenti marketing</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    I segmenti vengono ricalcolati in tempo reale ad ogni caricamento della lista clienti
                  </p>
                </div>
                <div className="p-5 space-y-5">
                  {SEGMENTI_CONFIG.map((cfg) => (
                    <div key={cfg.chiave} className="flex items-start gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-neutral-800">{cfg.label}</label>
                        <p className="text-xs text-neutral-500 mt-0.5">{cfg.desc}</p>
                      </div>
                      <input
                        type={cfg.type}
                        min={cfg.min}
                        max={cfg.max}
                        value={impostazioni[cfg.chiave] || ""}
                        onChange={(e) => handleChange(cfg.chiave, e.target.value)}
                        className="w-20 px-3 py-1.5 border border-neutral-300 rounded-lg text-sm text-center
                          focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
                      />
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
                  <button
                    onClick={handleReset}
                    className="text-xs text-neutral-500 hover:text-red-600 transition"
                  >
                    Ripristina default
                  </button>
                  <div className="flex items-center gap-3">
                    {dirty && (
                      <span className="text-xs text-amber-600 font-medium">Modifiche non salvate</span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!dirty || saving}
                      className="px-5 py-2 rounded-lg text-sm font-semibold bg-teal-600 text-white
                        hover:bg-teal-700 transition disabled:opacity-50 shadow-sm"
                    >
                      {saving ? "Salvataggio..." : "Salva"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview regole attuali */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100">
                  <h2 className="text-sm font-semibold text-neutral-800">Preview regole attuali</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Come vengono classificati i clienti con le soglie impostate
                  </p>
                </div>
                <div className="p-5">
                  <div className="space-y-2">
                    {esempio().map((e) => (
                      <div key={e.segmento} className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${e.color}`}>
                        <span className="text-sm font-semibold">{e.segmento}</span>
                        <span className="text-xs">{e.regola}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
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
