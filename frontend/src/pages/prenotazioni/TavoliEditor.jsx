// @version: v1.1-mattoni — M.I primitives (Btn) su CTA + form + layout sidebar
// Editor piantina tavoli — drag & drop SVG, Fase 2 Prenotazioni
import React, { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import { Btn } from "../../components/ui";

const ZONE = ["sala", "bottiglieria", "esterno", "privata"];
const FORME = ["rect", "circle"];
const GRID = 10; // snap-to-grid
const CANVAS_W = 900;
const CANVAS_H = 600;

const ZONE_COLORI = {
  sala: "#e0e7ff",        // indigo-100
  bottiglieria: "#fef3c7", // amber-100
  esterno: "#d1fae5",     // emerald-100
  privata: "#fce7f3",     // pink-100
};

function snap(val) {
  return Math.round(val / GRID) * GRID;
}

export default function TavoliEditor() {
  const [tavoli, setTavoli] = useState([]);
  const [combinazioni, setCombinazioni] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [layoutAttivo, setLayoutAttivo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef(null);

  // Nuovo tavolo form
  const [showNuovo, setShowNuovo] = useState(false);
  const [nuovoForm, setNuovoForm] = useState({
    nome: "", zona: "sala", posti_min: 2, posti_max: 4, forma: "rect",
  });

  // Layout form
  const [showLayoutForm, setShowLayoutForm] = useState(false);
  const [layoutForm, setLayoutForm] = useState({ nome: "", descrizione: "" });

  const flash = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load dati ──
  const loadAll = useCallback(async () => {
    try {
      const [tRes, lRes] = await Promise.all([
        apiFetch(`${API_BASE}/prenotazioni/tavoli`).then(r => r.json()),
        apiFetch(`${API_BASE}/prenotazioni/tavoli/layout`).then(r => r.json()),
      ]);
      setTavoli(tRes.tavoli || []);
      setCombinazioni(tRes.combinazioni || []);
      setLayouts(lRes.layout || []);
      const att = (lRes.layout || []).find(l => l.attivo === 1);
      setLayoutAttivo(att || null);
    } catch (e) {
      flash("err", "Errore caricamento dati");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Drag handlers ──
  const getSVGPoint = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const onMouseDown = (e, tavolo) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(tavolo.id);
    const pt = getSVGPoint(e);
    setDragOffset({ x: pt.x - tavolo.posizione_x, y: pt.y - tavolo.posizione_y });
    setDragging(tavolo.id);
  };

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const pt = getSVGPoint(e);
    setTavoli(prev => prev.map(t => {
      if (t.id !== dragging) return t;
      return {
        ...t,
        posizione_x: snap(Math.max(0, Math.min(CANVAS_W - t.larghezza, pt.x - dragOffset.x))),
        posizione_y: snap(Math.max(0, Math.min(CANVAS_H - t.altezza, pt.y - dragOffset.y))),
      };
    }));
  }, [dragging, dragOffset]);

  const onMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // ── Salva posizioni ──
  const salvaPosizioni = async () => {
    setSaving(true);
    try {
      const payload = {
        tavoli: tavoli.map(t => ({
          id: t.id,
          posizione_x: t.posizione_x,
          posizione_y: t.posizione_y,
          larghezza: t.larghezza,
          altezza: t.altezza,
        })),
      };
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/batch/posizioni`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) flash("ok", "Posizioni salvate");
      else flash("err", "Errore nel salvataggio");
    } catch {
      flash("err", "Errore di connessione");
    }
    setSaving(false);
  };

  // ── Crea tavolo ──
  const creaTavolo = async () => {
    if (!nuovoForm.nome.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...nuovoForm,
          posizione_x: 50 + Math.random() * 200,
          posizione_y: 50 + Math.random() * 200,
        }),
      });
      if (r.ok) {
        flash("ok", `Tavolo '${nuovoForm.nome}' creato`);
        setShowNuovo(false);
        setNuovoForm({ nome: "", zona: "sala", posti_min: 2, posti_max: 4, forma: "rect" });
        loadAll();
      } else {
        const err = await r.json();
        flash("err", err.detail || "Errore");
      }
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  // ── Modifica tavolo selezionato ──
  const updateSelected = async (field, value) => {
    if (!selected) return;
    setTavoli(prev => prev.map(t => t.id === selected ? { ...t, [field]: value } : t));
    try {
      await apiFetch(`${API_BASE}/prenotazioni/tavoli/${selected}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch { /* silently fail, user can retry */ }
  };

  // ── Disattiva tavolo ──
  const disattivaTavolo = async (id) => {
    if (!confirm("Disattivare questo tavolo?")) return;
    try {
      await apiFetch(`${API_BASE}/prenotazioni/tavoli/${id}`, { method: "DELETE" });
      flash("ok", "Tavolo disattivato");
      setSelected(null);
      loadAll();
    } catch {
      flash("err", "Errore");
    }
  };

  // ── Layout ──
  const salvaLayout = async () => {
    if (!layoutForm.nome.trim()) return;
    const posizioni = {};
    tavoli.forEach(t => {
      posizioni[t.id] = { x: t.posizione_x, y: t.posizione_y, w: t.larghezza, h: t.altezza };
    });
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: layoutForm.nome,
          descrizione: layoutForm.descrizione,
          tavoli_attivi: JSON.stringify(tavoli.map(t => t.id)),
          posizioni: JSON.stringify(posizioni),
        }),
      });
      if (r.ok) {
        flash("ok", `Layout '${layoutForm.nome}' salvato`);
        setShowLayoutForm(false);
        setLayoutForm({ nome: "", descrizione: "" });
        loadAll();
      } else {
        const err = await r.json();
        flash("err", err.detail || "Errore");
      }
    } catch {
      flash("err", "Errore di connessione");
    }
  };

  const attivaLayout = async (id) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/layout/${id}/attiva`, { method: "PUT" });
      if (r.ok) {
        flash("ok", "Layout attivato");
        loadAll();
      }
    } catch {
      flash("err", "Errore");
    }
  };

  const eliminaLayout = async (id) => {
    if (!confirm("Eliminare questo layout?")) return;
    try {
      await apiFetch(`${API_BASE}/prenotazioni/tavoli/layout/${id}`, { method: "DELETE" });
      flash("ok", "Layout eliminato");
      loadAll();
    } catch {
      flash("err", "Errore");
    }
  };

  const selectedTavolo = tavoli.find(t => t.id === selected);

  if (loading) return (
    <div className="min-h-screen bg-neutral-50">
      <PrenotazioniNav current="tavoli" />
      <div className="text-center py-12 text-neutral-400">Caricamento...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      <PrenotazioniNav current="tavoli" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {toast && (
          <div className={`mb-3 px-4 py-2 rounded-lg text-sm font-medium ${
            toast.type === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}>{toast.text}</div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-neutral-800">Editor Piantina</h2>
            {layoutAttivo && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {layoutAttivo.nome}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Btn variant="chip" tone="violet" size="sm" onClick={() => setShowNuovo(!showNuovo)}>+ Tavolo</Btn>
            <Btn variant="dark" size="sm" onClick={() => setShowLayoutForm(!showLayoutForm)}>Salva layout</Btn>
            <Btn variant="success" size="sm" onClick={salvaPosizioni} disabled={saving} loading={saving}>
              {saving ? "..." : "Salva posizioni"}
            </Btn>
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                className="w-6 h-6 rounded border text-xs hover:bg-neutral-100">−</button>
              <span className="text-xs text-neutral-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                className="w-6 h-6 rounded border text-xs hover:bg-neutral-100">+</button>
            </div>
          </div>
        </div>

        {/* Form nuovo tavolo */}
        {showNuovo && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Nome</label>
              <input type="text" value={nuovoForm.nome} onChange={e => setNuovoForm({ ...nuovoForm, nome: e.target.value })}
                className="px-2 py-1.5 border rounded-lg text-sm w-20" placeholder="T1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Zona</label>
              <select value={nuovoForm.zona} onChange={e => setNuovoForm({ ...nuovoForm, zona: e.target.value })}
                className="px-2 py-1.5 border rounded-lg text-sm">
                {ZONE.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Posti</label>
              <div className="flex gap-1">
                <input type="number" min={1} max={20} value={nuovoForm.posti_min}
                  onChange={e => setNuovoForm({ ...nuovoForm, posti_min: +e.target.value })}
                  className="px-2 py-1.5 border rounded-lg text-sm w-14" />
                <span className="self-center text-xs">—</span>
                <input type="number" min={1} max={20} value={nuovoForm.posti_max}
                  onChange={e => setNuovoForm({ ...nuovoForm, posti_max: +e.target.value })}
                  className="px-2 py-1.5 border rounded-lg text-sm w-14" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Forma</label>
              <select value={nuovoForm.forma} onChange={e => setNuovoForm({ ...nuovoForm, forma: e.target.value })}
                className="px-2 py-1.5 border rounded-lg text-sm">
                {FORME.map(f => <option key={f} value={f}>{f === "rect" ? "Rettangolo" : "Cerchio"}</option>)}
              </select>
            </div>
            <Btn variant="chip" tone="violet" size="md" onClick={creaTavolo}>Crea</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowNuovo(false)}>Annulla</Btn>
          </div>
        )}

        {/* Form salva layout */}
        {showLayoutForm && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Nome layout</label>
              <input type="text" value={layoutForm.nome} onChange={e => setLayoutForm({ ...layoutForm, nome: e.target.value })}
                className="px-2 py-1.5 border rounded-lg text-sm w-40" placeholder="Inverno" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Descrizione</label>
              <input type="text" value={layoutForm.descrizione} onChange={e => setLayoutForm({ ...layoutForm, descrizione: e.target.value })}
                className="px-2 py-1.5 border rounded-lg text-sm w-56" placeholder="14 tavoli interni" />
            </div>
            <Btn variant="dark" size="md" onClick={salvaLayout}>Salva</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowLayoutForm(false)}>Annulla</Btn>
          </div>
        )}

        <div className="flex gap-4">
          {/* ── Canvas SVG ── */}
          <div className="flex-1 bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="w-full"
              style={{ minHeight: 400, cursor: dragging ? "grabbing" : "default" }}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onTouchMove={onMouseMove}
              onTouchEnd={onMouseUp}
              onClick={() => setSelected(null)}
            >
              {/* Griglia */}
              <defs>
                <pattern id="grid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
                  <path d={`M ${GRID * 2} 0 L 0 0 0 ${GRID * 2}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid)" />

              {/* Tavoli */}
              {tavoli.map(t => {
                const isSelected = selected === t.id;
                const fillColor = ZONE_COLORI[t.zona] || "#f3f4f6";
                const strokeColor = isSelected ? "#4f46e5" : "#9ca3af";
                const strokeWidth = isSelected ? 2.5 : 1;

                return (
                  <g
                    key={t.id}
                    onMouseDown={(e) => onMouseDown(e, t)}
                    onTouchStart={(e) => onMouseDown(e, t)}
                    onClick={(e) => { e.stopPropagation(); setSelected(t.id); }}
                    style={{ cursor: "grab" }}
                  >
                    {t.forma === "circle" ? (
                      <ellipse
                        cx={t.posizione_x + t.larghezza / 2}
                        cy={t.posizione_y + t.altezza / 2}
                        rx={t.larghezza / 2}
                        ry={t.altezza / 2}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                      />
                    ) : (
                      <rect
                        x={t.posizione_x}
                        y={t.posizione_y}
                        width={t.larghezza}
                        height={t.altezza}
                        rx={6}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                      />
                    )}
                    <text
                      x={t.posizione_x + t.larghezza / 2}
                      y={t.posizione_y + t.altezza / 2 - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="select-none pointer-events-none"
                      fontSize="12"
                      fontWeight="bold"
                      fill="#1f2937"
                    >
                      {t.nome}
                    </text>
                    <text
                      x={t.posizione_x + t.larghezza / 2}
                      y={t.posizione_y + t.altezza / 2 + 10}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="select-none pointer-events-none"
                      fontSize="9"
                      fill="#6b7280"
                    >
                      {t.posti_min}-{t.posti_max}p
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* ── Sidebar destra: proprieta' tavolo + layout ── */}
          <div className="w-64 flex-shrink-0 space-y-4">
            {/* Proprieta' tavolo selezionato */}
            {selectedTavolo ? (
              <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
                <h3 className="font-semibold text-indigo-900 text-sm">Tavolo: {selectedTavolo.nome}</h3>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Nome</label>
                  <input type="text" value={selectedTavolo.nome}
                    onChange={e => updateSelected("nome", e.target.value)}
                    className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Zona</label>
                  <select value={selectedTavolo.zona}
                    onChange={e => updateSelected("zona", e.target.value)}
                    className="w-full px-2 py-1.5 border rounded-lg text-sm">
                    {ZONE.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Posti min</label>
                    <input type="number" min={1} max={20} value={selectedTavolo.posti_min}
                      onChange={e => updateSelected("posti_min", +e.target.value)}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Posti max</label>
                    <input type="number" min={1} max={20} value={selectedTavolo.posti_max}
                      onChange={e => updateSelected("posti_max", +e.target.value)}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Largh.</label>
                    <input type="number" min={30} max={200} step={10} value={selectedTavolo.larghezza}
                      onChange={e => {
                        const v = +e.target.value;
                        setTavoli(prev => prev.map(t => t.id === selected ? { ...t, larghezza: v } : t));
                      }}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Altez.</label>
                    <input type="number" min={30} max={200} step={10} value={selectedTavolo.altezza}
                      onChange={e => {
                        const v = +e.target.value;
                        setTavoli(prev => prev.map(t => t.id === selected ? { ...t, altezza: v } : t));
                      }}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Forma</label>
                  <select value={selectedTavolo.forma}
                    onChange={e => updateSelected("forma", e.target.value)}
                    className="w-full px-2 py-1.5 border rounded-lg text-sm">
                    {FORME.map(f => <option key={f} value={f}>{f === "rect" ? "Rettangolo" : "Cerchio"}</option>)}
                  </select>
                </div>
                <Btn variant="chip" tone="red" size="sm" onClick={() => disattivaTavolo(selectedTavolo.id)} className="w-full">
                  Disattiva tavolo
                </Btn>
              </div>
            ) : (
              <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 text-center text-sm text-neutral-400">
                Clicca un tavolo per modificarlo
              </div>
            )}

            {/* Layout */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-semibold text-neutral-800 text-sm mb-2">Layout salvati</h3>
              {layouts.length === 0 ? (
                <p className="text-xs text-neutral-400">Nessun layout salvato</p>
              ) : (
                <div className="space-y-1.5">
                  {layouts.map(l => (
                    <div key={l.id} className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-sm ${
                      l.attivo ? "bg-indigo-50 border border-indigo-200" : "bg-neutral-50 border border-neutral-100"
                    }`}>
                      <div>
                        <span className={`font-medium ${l.attivo ? "text-indigo-800" : "text-neutral-700"}`}>{l.nome}</span>
                        {l.attivo === 1 && <span className="ml-1 text-[10px] text-indigo-500">attivo</span>}
                      </div>
                      <div className="flex gap-1">
                        {l.attivo !== 1 && (
                          <button onClick={() => attivaLayout(l.id)}
                            className="text-[10px] px-1.5 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                            Attiva
                          </button>
                        )}
                        <button onClick={() => eliminaLayout(l.id)}
                          className="text-[10px] px-1.5 py-0.5 text-red-500 hover:bg-red-50 rounded">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Legenda zone */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-semibold text-neutral-800 text-sm mb-2">Zone</h3>
              <div className="space-y-1">
                {ZONE.map(z => (
                  <div key={z} className="flex items-center gap-2 text-xs">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: ZONE_COLORI[z] }}></div>
                    <span className="capitalize text-neutral-700">{z}</span>
                    <span className="text-neutral-400 ml-auto">{tavoli.filter(t => t.zona === z).length}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
