// @version: v2.2-combinazioni — combinazioni di tavoli per sala (nuova, proposte dei tavoli vicini, elimina); v2.1-dividibile — flag «dividibile in due»; v2.0-sale — sale come schede (Osteria/Dehor/Veranda), rombo, elementi non prenotabili, importa piantina
// Modulo: prenotazioni
// Editor piantina tavoli — drag & drop SVG, Fase 2 Prenotazioni
import React, { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import PrenotazioniNav from "./PrenotazioniNav";
import { Btn } from "../../components/ui";
import { CANVAS_W, CANVAS_H, COLORE_TAVOLO, FormaTavolo, FormaElemento, SchedeSale } from "./components/Piantina";

const FORME = ["rect", "circle", "diamond"];
const NOMI_FORME = { rect: "Rettangolo", circle: "Cerchio", diamond: "Rombo" };
const GRID = 10; // snap-to-grid

function snap(val) {
  return Math.round(val / GRID) * GRID;
}

export default function TavoliEditor() {
  const [tavoli, setTavoli] = useState([]);
  const [elementi, setElementi] = useState([]);
  const [sale, setSale] = useState([]);
  const [sala, setSala] = useState(null);
  const [selectedEl, setSelectedEl] = useState(null);
  const fileRef = useRef(null);
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
    nome: "", zona: "", posti_min: 2, posti_max: 4, forma: "rect",
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
      setElementi(tRes.elementi || []);
      const s = tRes.sale && tRes.sale.length ? tRes.sale : ["sala"];
      setSale(s);
      setSala((cur) => (cur && s.includes(cur) ? cur : s[0]));
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

  const onMouseDown = (e, obj, tipo = "t") => {
    e.preventDefault();
    e.stopPropagation();
    if (tipo === "t") { setSelected(obj.id); setSelectedEl(null); }
    else { setSelectedEl(obj.id); setSelected(null); }
    const pt = getSVGPoint(e);
    setDragOffset({ x: pt.x - obj.posizione_x, y: pt.y - obj.posizione_y });
    setDragging({ tipo, id: obj.id });
  };

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const pt = getSVGPoint(e);
    const sposta = (t) => ({
      ...t,
      posizione_x: snap(Math.max(0, Math.min(CANVAS_W - t.larghezza, pt.x - dragOffset.x))),
      posizione_y: snap(Math.max(0, Math.min(CANVAS_H - t.altezza, pt.y - dragOffset.y))),
    });
    if (dragging.tipo === "e") setElementi(prev => prev.map(x => (x.id === dragging.id ? sposta(x) : x)));
    else setTavoli(prev => prev.map(t => (t.id === dragging.id ? sposta(t) : t)));
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
        elementi: elementi.map(x => ({
          id: x.id, posizione_x: x.posizione_x, posizione_y: x.posizione_y,
          larghezza: x.larghezza, altezza: x.altezza,
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
          zona: nuovoForm.zona || sala || "sala",
          posizione_x: 50 + Math.random() * 200,
          posizione_y: 50 + Math.random() * 200,
        }),
      });
      if (r.ok) {
        flash("ok", `Tavolo '${nuovoForm.nome}' creato`);
        setShowNuovo(false);
        setNuovoForm({ nome: "", zona: "", posti_min: 2, posti_max: 4, forma: "rect" });
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

  // ── Elementi non prenotabili (bancone, colonne, scale…) ──
  const creaElemento = async (forma) => {
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/elementi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zona: sala || "sala", forma, posizione_x: 40, posizione_y: 40,
                               larghezza: forma === "circle" ? 30 : 120, altezza: 30 }),
      });
      if (r.ok) { flash("ok", "Elemento aggiunto: trascinalo dove serve"); loadAll(); }
      else flash("err", (await r.json()).detail || "Errore");
    } catch { flash("err", "Errore di connessione"); }
  };

  const updateElemento = async (field, value) => {
    if (!selectedEl) return;
    setElementi(prev => prev.map(x => (x.id === selectedEl ? { ...x, [field]: value } : x)));
    try {
      await apiFetch(`${API_BASE}/prenotazioni/tavoli/elementi/${selectedEl}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch { /* riprova */ }
  };

  const eliminaElemento = async (id) => {
    if (!confirm("Eliminare questo elemento?")) return;
    await apiFetch(`${API_BASE}/prenotazioni/tavoli/elementi/${id}`, { method: "DELETE" });
    setSelectedEl(null);
    loadAll();
  };

  // ── Importa piantina da file JSON ──
  const importaPiantina = async (file) => {
    if (!file) return;
    let dati;
    try { dati = JSON.parse(await file.text()); }
    catch { flash("err", "Il file non è un JSON valido"); return; }
    const nT = (dati.tavoli || []).length, nE = (dati.elementi || []).length;
    const msg = dati.sostituisci
      ? `Importare ${nT} tavoli e ${nE} elementi?\n\nI tavoli attuali verranno DISATTIVATI e gli elementi sostituiti. Le prenotazioni non cambiano.`
      : `Importare ${nT} tavoli e ${nE} elementi (aggiunti a quelli esistenti)?`;
    if (!confirm(msg)) return;
    try {
      const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/importa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dati),
      });
      const d = await r.json();
      if (r.ok) {
        flash("ok", `Piantina importata: ${d.tavoli_creati} tavoli nuovi, ${d.tavoli_aggiornati} aggiornati, ${d.elementi} elementi`);
        setSala(null);
        loadAll();
      } else flash("err", d.detail || "Errore import");
    } catch { flash("err", "Errore di connessione"); }
  };

  const nuovaSala = () => {
    const nome = (prompt("Nome della nuova sala (es. Dehor)") || "").trim();
    if (!nome) return;
    setSale(prev => (prev.includes(nome) ? prev : [...prev, nome]));
    setSala(nome);
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
  const selectedElemento = elementi.find(x => x.id === selectedEl);
  const tavoliSala = tavoli.filter(t => (t.zona || "sala") === sala);
  const elementiSala = elementi.filter(x => (x.zona || "sala") === sala);
  const conteggiSale = Object.fromEntries(sale.map(s => [s, tavoli.filter(t => (t.zona || "sala") === s).length]));

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
            <Btn variant="secondary" size="sm" onClick={() => creaElemento("rect")}>+ Elemento</Btn>
            <Btn variant="secondary" size="sm" onClick={() => creaElemento("circle")}>+ Colonna</Btn>
            <Btn variant="secondary" size="sm" onClick={nuovaSala}>+ Sala</Btn>
            <Btn variant="secondary" size="sm" onClick={() => fileRef.current && fileRef.current.click()}>Importa piantina</Btn>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { importaPiantina(e.target.files[0]); e.target.value = ""; }} />
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
              <label className="block text-xs font-medium text-neutral-600 mb-1">Sala</label>
              <select value={nuovoForm.zona || sala || ""} onChange={e => setNuovoForm({ ...nuovoForm, zona: e.target.value })}
                className="px-2 py-1.5 border rounded-lg text-sm">
                {sale.map(z => <option key={z} value={z}>{z}</option>)}
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
                {FORME.map(f => <option key={f} value={f}>{NOMI_FORME[f]}</option>)}
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

        <SchedeSale sale={sale} attiva={sala} onChange={(s) => { setSala(s); setSelected(null); setSelectedEl(null); }} conteggi={conteggiSale} />

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
              onClick={() => { setSelected(null); setSelectedEl(null); }}
            >
              {/* Griglia */}
              <defs>
                <pattern id="grid" width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
                  <path d={`M ${GRID * 2} 0 L 0 0 0 ${GRID * 2}`} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid)" />

              {/* Elementi non prenotabili */}
              {elementiSala.map(x => (
                <g key={`e${x.id}`}
                  onMouseDown={(e) => onMouseDown(e, x, "e")}
                  onTouchStart={(e) => onMouseDown(e, x, "e")}
                  onClick={(e) => { e.stopPropagation(); setSelectedEl(x.id); setSelected(null); }}
                  style={{ cursor: "grab" }}>
                  <FormaElemento e={x} stroke={selectedEl === x.id ? "#4f46e5" : "none"} strokeWidth={selectedEl === x.id ? 2 : 0} />
                </g>
              ))}

              {/* Tavoli */}
              {tavoliSala.map(t => {
                const isSelected = selected === t.id;
                const fillColor = COLORE_TAVOLO;
                const strokeColor = isSelected ? "#4f46e5" : "none";
                const strokeWidth = isSelected ? 2.5 : 0;

                return (
                  <g
                    key={t.id}
                    onMouseDown={(e) => onMouseDown(e, t)}
                    onTouchStart={(e) => onMouseDown(e, t)}
                    onClick={(e) => { e.stopPropagation(); setSelected(t.id); }}
                    style={{ cursor: "grab" }}
                  >
                    <FormaTavolo t={t} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
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
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Sala</label>
                  <select value={selectedTavolo.zona}
                    onChange={e => updateSelected("zona", e.target.value)}
                    className="w-full px-2 py-1.5 border rounded-lg text-sm">
                    {sale.map(z => <option key={z} value={z}>{z}</option>)}
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
                    {FORME.map(f => <option key={f} value={f}>{NOMI_FORME[f]}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={selectedTavolo.dividibile === 1}
                    onChange={e => updateSelected("dividibile", e.target.checked ? 1 : 0)} />
                  Dividibile in due
                  <span className="text-[11px] text-neutral-400">(dalla mappa: ✂️ Dividi → {selectedTavolo.nome}A + {selectedTavolo.nome}B)</span>
                </label>
                <Btn variant="chip" tone="red" size="sm" onClick={() => disattivaTavolo(selectedTavolo.id)} className="w-full">
                  Disattiva tavolo
                </Btn>
              </div>
            ) : selectedElemento ? (
              <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
                <h3 className="font-semibold text-indigo-900 text-sm">Elemento (non prenotabile)</h3>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Etichetta</label>
                  <input type="text" value={selectedElemento.etichetta || ""} placeholder="Bancone, colonna…"
                    onChange={e => updateElemento("etichetta", e.target.value)}
                    className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Largh.</label>
                    <input type="number" min={5} max={1000} step={5} value={selectedElemento.larghezza}
                      onChange={e => { const v = +e.target.value; setElementi(prev => prev.map(x => x.id === selectedEl ? { ...x, larghezza: v } : x)); }}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Altez.</label>
                    <input type="number" min={5} max={600} step={5} value={selectedElemento.altezza}
                      onChange={e => { const v = +e.target.value; setElementi(prev => prev.map(x => x.id === selectedEl ? { ...x, altezza: v } : x)); }}
                      className="w-full px-2 py-1.5 border rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Colore</label>
                  <input type="color" value={selectedElemento.colore || "#e2e2e2"}
                    onChange={e => updateElemento("colore", e.target.value)}
                    className="w-full h-9 border rounded-lg" />
                </div>
                <p className="text-[11px] text-neutral-400">Posizione e misure si salvano con «Salva posizioni».</p>
                <Btn variant="chip" tone="red" size="sm" onClick={() => eliminaElemento(selectedElemento.id)} className="w-full">
                  Elimina elemento
                </Btn>
              </div>
            ) : (
              <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 text-center text-sm text-neutral-400">
                Clicca un tavolo o un elemento per modificarlo
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

            {/* Combinazioni di tavoli (per la disponibilità per tavoli) */}
            <Combinazioni sala={sala} tavoli={tavoli.filter(t => (t.zona || "sala") === sala)}
              combinazioni={combinazioni} onCambio={loadAll} flash={flash} />

            {/* Sale */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h3 className="font-semibold text-neutral-800 text-sm mb-2">Sale</h3>
              <div className="space-y-1">
                {sale.map(z => (
                  <div key={z} className="flex items-center gap-2 text-xs">
                    <span className="text-neutral-700">{z}</span>
                    <span className="text-neutral-400 ml-auto">{conteggiSale[z] || 0} tavoli · {tavoli.filter(t => t.zona === z).reduce((a, t) => a + (t.posti_max || 0), 0)} posti</span>
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


// ── Combinazioni di tavoli della sala (2026-10-28) ──
// Tavoli che si uniscono per i gruppi (es. 2+3). Servono al motore della disponibilità per tavoli.
function Combinazioni({ sala, tavoli, combinazioni, onCambio, flash }) {
  const [nuova, setNuova] = useState(null);       // {ids:Set, posti_min, posti}
  const [proposte, setProposte] = useState(null);
  const nomeDi = (ids) => tavoli.filter(t => ids.includes(t.id)).map(t => t.nome).join("+");
  const idsDi = (c) => { try { return JSON.parse(c.tavoli_ids); } catch { return []; } };
  const della = combinazioni.filter(c => {
    const ids = idsDi(c);
    return c.zona ? c.zona === sala : ids.some(id => tavoli.some(t => t.id === id));
  });

  const salva = async (c) => {
    const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/combinazioni`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: c.nome, tavoli_ids: JSON.stringify(c.tavoli_ids), posti: c.posti, posti_min: c.posti_min, zona: sala }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { flash("err", d.detail || "Errore"); return false; }
    flash("ok", `Combinazione ${c.nome} salvata`);
    onCambio();
    return true;
  };
  const elimina = async (c) => {
    if (!confirm(`Eliminare la combinazione ${c.nome}?`)) return;
    await apiFetch(`${API_BASE}/prenotazioni/tavoli/combinazioni/${c.id}`, { method: "DELETE" });
    onCambio();
  };
  const caricaProposte = async () => {
    const r = await apiFetch(`${API_BASE}/prenotazioni/tavoli/combinazioni/proposte`);
    const d = await r.json().catch(() => ({ proposte: [] }));
    setProposte((d.proposte || []).filter(p => p.zona === sala));
  };
  const toggle = (id) => {
    const ids = new Set(nuova.ids);
    ids.has(id) ? ids.delete(id) : ids.add(id);
    const scelti = tavoli.filter(t => ids.has(t.id));
    setNuova({ ids, posti: scelti.reduce((a, t) => a + (t.posti_max || 0), 0), posti_min: Math.max(1, ...scelti.map(t => t.posti_min || 1)) });
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-neutral-800 text-sm">Combinazioni · {sala}</h3>
        {!nuova && <button onClick={() => setNuova({ ids: new Set(), posti: 0, posti_min: 1 })} className="text-xs text-indigo-700 hover:underline">+ Nuova</button>}
      </div>
      {della.length === 0 && !nuova && <p className="text-[11px] text-neutral-400">Nessuna: i gruppi si siedono solo sui tavoli singoli.</p>}
      {della.map(c => (
        <div key={c.id} className="flex items-center gap-2 text-xs">
          <span className="font-medium text-neutral-800">{c.nome}</span>
          <span className="text-neutral-500">{c.posti_min ? `${c.posti_min}–` : ""}{c.posti}p</span>
          <button onClick={() => elimina(c)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      ))}

      {nuova && (
        <div className="border-t border-neutral-100 pt-2 space-y-2">
          <p className="text-[11px] text-neutral-500">Spunta i tavoli che si uniscono:</p>
          <div className="flex flex-wrap gap-1">
            {tavoli.map(t => (
              <button key={t.id} onClick={() => toggle(t.id)}
                className={`text-xs px-2 py-1 rounded border ${nuova.ids.has(t.id) ? "bg-indigo-600 text-white border-indigo-600" : "border-neutral-300 text-neutral-600"}`}>
                {t.nome}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span>posti</span>
            <input type="number" min={1} value={nuova.posti_min} onChange={e => setNuova({ ...nuova, posti_min: +e.target.value })} className="w-14 px-1 py-0.5 border rounded" />
            <span>–</span>
            <input type="number" min={1} value={nuova.posti} onChange={e => setNuova({ ...nuova, posti: +e.target.value })} className="w-14 px-1 py-0.5 border rounded" />
          </div>
          <div className="flex gap-2">
            <button disabled={nuova.ids.size < 2}
              onClick={async () => { const ids = [...nuova.ids]; if (await salva({ nome: nomeDi(ids), tavoli_ids: ids, posti: nuova.posti, posti_min: nuova.posti_min })) setNuova(null); }}
              className="text-xs px-2 py-1 rounded bg-indigo-600 text-white disabled:opacity-40">Salva {nuova.ids.size >= 2 ? nomeDi([...nuova.ids]) : ""}</button>
            <button onClick={() => setNuova(null)} className="text-xs px-2 py-1 text-neutral-500">Annulla</button>
          </div>
        </div>
      )}

      <div className="border-t border-neutral-100 pt-2">
        {proposte === null ? (
          <button onClick={caricaProposte} className="text-xs text-indigo-700 hover:underline">Proponi i tavoli vicini</button>
        ) : proposte.length === 0 ? (
          <p className="text-[11px] text-neutral-400">Nessun'altra coppia di tavoli vicini da proporre.</p>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] text-neutral-500">Tavoli vicini sulla piantina:</p>
            {proposte.map(p => (
              <div key={p.nome} className="flex items-center gap-2 text-xs">
                <span className="text-neutral-700">{p.nome}</span>
                <span className="text-neutral-400">{p.posti_min}–{p.posti}p</span>
                <button onClick={async () => { if (await salva(p)) setProposte(proposte.filter(x => x.nome !== p.nome)); }}
                  className="ml-auto text-indigo-700 hover:underline">+ aggiungi</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
