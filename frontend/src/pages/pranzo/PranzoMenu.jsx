// FILE: frontend/src/pages/pranzo/PranzoMenu.jsx
// @version: v1.0 — Modulo Pranzo del Giorno (sessione 58, 2026-04-26)
//
// Sub-modulo "Menu Pranzo" di Gestione Cucina.
// 4 tab: Oggi (editor menu del giorno) · Archivio · Catalogo piatti · Impostazioni.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { API_BASE, apiFetch } from "../../config/api";
import { Btn, PageLayout, EmptyState } from "../../components/ui";

// ─────────────────────────────────────────────────────────────
// Costanti
// ─────────────────────────────────────────────────────────────
const CATEGORIE = [
  { key: "antipasto", label: "Antipasto", emoji: "🥗" },
  { key: "primo",     label: "Primo",     emoji: "🍝" },
  { key: "secondo",   label: "Secondo",   emoji: "🥩" },
  { key: "contorno",  label: "Contorno",  emoji: "🥦" },
  { key: "dolce",     label: "Dolce",     emoji: "🍰" },
  { key: "altro",     label: "Altro",     emoji: "🍽️" },
];
const ORDINE_CAT = { antipasto: 1, primo: 2, secondo: 3, contorno: 4, dolce: 5, altro: 6 };

const todayIso = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const formatDataEstesa = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("it-IT", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return iso; }
};

const fmtPrezzo = (p) => {
  if (p === null || p === undefined || p === "") return "—";
  const n = Number(p);
  return Number.isInteger(n) ? `${n}€` : `${n.toFixed(2).replace(".", ",")}€`;
};

// ─────────────────────────────────────────────────────────────
// Tab nav
// ─────────────────────────────────────────────────────────────
function TabNav({ tab, setTab }) {
  const tabs = [
    { key: "oggi",     label: "Oggi",         emoji: "📅" },
    { key: "archivio", label: "Archivio",     emoji: "📂" },
    { key: "catalogo", label: "Catalogo",     emoji: "🍳" },
    { key: "settings", label: "Impostazioni", emoji: "⚙️" },
  ];
  return (
    <div className="flex flex-wrap gap-2 border-b border-stone-300 pb-3 mb-4">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={
            "px-4 py-2 rounded-lg text-sm font-medium transition " +
            (tab === t.key
              ? "bg-orange-100 text-orange-900 border border-orange-300"
              : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50")
          }
        >
          <span className="mr-1.5">{t.emoji}</span>{t.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 1: OGGI (editor menu del giorno)
// ─────────────────────────────────────────────────────────────
function TabOggi({ settings, catalogo, refreshArchivio }) {
  const [data, setData] = useState(todayIso());
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // form state
  const [titolo, setTitolo] = useState("");
  const [sottotitolo, setSottotitolo] = useState("");
  const [prezzo1, setPrezzo1] = useState("");
  const [prezzo2, setPrezzo2] = useState("");
  const [prezzo3, setPrezzo3] = useState("");
  const [footer, setFooter] = useState("");
  const [stato, setStato] = useState("bozza");
  const [righe, setRighe] = useState([]);

  const loadMenu = useCallback(async (d) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${d}/`);
      if (res.status === 404) {
        setMenu(null);
        applyDefaults();
      } else if (res.ok) {
        const m = await res.json();
        setMenu(m);
        setTitolo(m.titolo || "");
        setSottotitolo(m.sottotitolo || "");
        setPrezzo1(m.prezzo_1 ?? "");
        setPrezzo2(m.prezzo_2 ?? "");
        setPrezzo3(m.prezzo_3 ?? "");
        setFooter(m.footer_note || "");
        setStato(m.stato || "bozza");
        setRighe((m.righe || []).map((r, i) => ({
          piatto_id: r.piatto_id || null,
          nome: r.nome,
          categoria: r.categoria || "primo",
          ordine: r.ordine ?? i,
          note: r.note || "",
        })));
      } else {
        setMsg({ tipo: "err", text: `Errore caricamento (${res.status})` });
      }
    } catch (e) {
      setMsg({ tipo: "err", text: `Errore: ${e.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  const applyDefaults = () => {
    setTitolo("");
    setSottotitolo("");
    setPrezzo1(settings?.prezzo_1_default ?? "");
    setPrezzo2(settings?.prezzo_2_default ?? "");
    setPrezzo3(settings?.prezzo_3_default ?? "");
    setFooter("");
    setStato("bozza");
    setRighe([]);
  };

  useEffect(() => { if (settings) loadMenu(data); }, [data, settings, loadMenu]);

  const aggiungiRiga = (piatto) => {
    if (piatto) {
      setRighe([...righe, {
        piatto_id: piatto.id,
        nome: piatto.nome,
        categoria: piatto.categoria,
        ordine: righe.length,
      }]);
    } else {
      setRighe([...righe, { piatto_id: null, nome: "", categoria: "primo", ordine: righe.length }]);
    }
  };

  const aggiornaRiga = (idx, patch) => {
    setRighe(righe.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const rimuoviRiga = (idx) => setRighe(righe.filter((_, i) => i !== idx));

  const muoviRiga = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= righe.length) return;
    const arr = [...righe];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setRighe(arr.map((r, i) => ({ ...r, ordine: i })));
  };

  const ordinaPerCategoria = () => {
    const sorted = [...righe].sort(
      (a, b) =>
        (ORDINE_CAT[a.categoria] || 99) - (ORDINE_CAT[b.categoria] || 99) ||
        (a.ordine ?? 0) - (b.ordine ?? 0)
    );
    setRighe(sorted.map((r, i) => ({ ...r, ordine: i })));
  };

  const salva = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        data,
        titolo: titolo || null,
        sottotitolo: sottotitolo || null,
        prezzo_1: prezzo1 === "" ? null : Number(prezzo1),
        prezzo_2: prezzo2 === "" ? null : Number(prezzo2),
        prezzo_3: prezzo3 === "" ? null : Number(prezzo3),
        footer_note: footer || null,
        stato,
        righe: righe.filter((r) => r.nome.trim()).map((r, i) => ({
          piatto_id: r.piatto_id || null,
          nome: r.nome.trim(),
          categoria: r.categoria,
          ordine: i,
          note: r.note || null,
        })),
      };
      const res = await apiFetch(`${API_BASE}/pranzo/menu/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }
      const m = await res.json();
      setMenu(m);
      setMsg({ tipo: "ok", text: "Menu salvato." });
      refreshArchivio?.();
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const elimina = async () => {
    if (!menu) return;
    if (!window.confirm(`Eliminare il menu del ${formatDataEstesa(data)}?`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/menu/${data}/`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMenu(null);
      applyDefaults();
      setMsg({ tipo: "ok", text: "Menu eliminato." });
      refreshArchivio?.();
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    }
  };

  const apriPdf = () => {
    if (!menu) return;
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/pranzo/menu/${data}/pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch((e) => setMsg({ tipo: "err", text: `PDF: ${e.message}` }));
  };

  // ── UI ──
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Data</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-2"
          />
        </div>
        <div className="text-sm text-stone-600 italic">
          {formatDataEstesa(data)} {loading && " · caricamento…"}
        </div>
        <div className="ml-auto flex gap-2">
          <Btn variant="ghost" onClick={() => setData(todayIso())}>Oggi</Btn>
          {menu && <Btn variant="ghost" onClick={apriPdf}>📄 PDF</Btn>}
          {menu && <Btn variant="danger" onClick={elimina}>Elimina</Btn>}
          <Btn onClick={salva} loading={saving}>{menu ? "Aggiorna" : "Crea menu"}</Btn>
        </div>
      </div>

      {msg && (
        <div className={"rounded-lg px-3 py-2 text-sm " +
          (msg.tipo === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-red-50 text-red-800 border border-red-200")}>
          {msg.text}
        </div>
      )}

      {/* Testata + prezzi */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
          <h3 className="font-semibold text-stone-700">Testata (override default)</h3>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Titolo</label>
            <input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder={settings?.titolo_default || ""}
              className="w-full border border-stone-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Sottotitolo</label>
            <textarea
              value={sottotitolo}
              onChange={(e) => setSottotitolo(e.target.value)}
              rows={2}
              placeholder={settings?.sottotitolo_default || ""}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Note footer</label>
            <textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={2}
              placeholder={settings?.footer_default || ""}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
          <h3 className="font-semibold text-stone-700">Menù Business — prezzi (€)</h3>
          {[
            { lbl: "1 portata", val: prezzo1, set: setPrezzo1 },
            { lbl: "2 portate", val: prezzo2, set: setPrezzo2 },
            { lbl: "3 portate", val: prezzo3, set: setPrezzo3 },
          ].map((p) => (
            <div key={p.lbl} className="flex items-center gap-3">
              <label className="w-24 text-sm text-stone-600">{p.lbl}</label>
              <input
                type="number"
                step="0.5"
                value={p.val}
                onChange={(e) => p.set(e.target.value)}
                className="flex-1 border border-stone-300 rounded-lg px-3 py-2"
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <label className="w-24 text-sm text-stone-600">Stato</label>
            <select
              value={stato}
              onChange={(e) => setStato(e.target.value)}
              className="flex-1 border border-stone-300 rounded-lg px-3 py-2"
            >
              <option value="bozza">Bozza</option>
              <option value="pubblicato">Pubblicato</option>
              <option value="archiviato">Archiviato</option>
            </select>
          </div>
        </div>
      </div>

      {/* Piatti */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-stone-700">Piatti del giorno</h3>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={ordinaPerCategoria}>↕ Ordina per categoria</Btn>
            <Btn variant="ghost" size="sm" onClick={() => aggiungiRiga(null)}>+ Riga ad-hoc</Btn>
          </div>
        </div>

        {/* Quick-add da catalogo */}
        <CatalogoQuickAdd catalogo={catalogo} onPick={aggiungiRiga} />

        {righe.length === 0 ? (
          <div className="text-center text-stone-500 py-8 italic">
            Nessun piatto. Scegli dal catalogo qui sopra o aggiungi una riga ad-hoc.
          </div>
        ) : (
          <div className="space-y-2 mt-3">
            {righe.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 p-2 bg-stone-50 rounded-lg border border-stone-200">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => muoviRiga(i, -1)} disabled={i === 0}
                    className="text-stone-500 hover:text-stone-900 disabled:opacity-30 text-xs px-1">▲</button>
                  <button onClick={() => muoviRiga(i, +1)} disabled={i === righe.length - 1}
                    className="text-stone-500 hover:text-stone-900 disabled:opacity-30 text-xs px-1">▼</button>
                </div>
                <select
                  value={r.categoria}
                  onChange={(e) => aggiornaRiga(i, { categoria: e.target.value })}
                  className="border border-stone-300 rounded px-2 py-1 text-sm"
                >
                  {CATEGORIE.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
                </select>
                <input
                  value={r.nome}
                  onChange={(e) => aggiornaRiga(i, { nome: e.target.value, piatto_id: null })}
                  placeholder="Nome piatto"
                  className="flex-1 min-w-[200px] border border-stone-300 rounded px-2 py-1 text-sm"
                />
                {r.piatto_id && (
                  <span className="text-[10px] uppercase tracking-wide text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
                    catalogo
                  </span>
                )}
                <button
                  onClick={() => rimuoviRiga(i)}
                  className="text-red-600 hover:text-red-900 text-sm px-2"
                  title="Elimina riga"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogoQuickAdd({ catalogo, onPick }) {
  const [filter, setFilter] = useState("all");
  const list = useMemo(() => {
    if (!catalogo) return [];
    return filter === "all" ? catalogo : catalogo.filter((p) => p.categoria === filter);
  }, [catalogo, filter]);

  if (!catalogo || catalogo.length === 0) {
    return (
      <div className="text-xs text-stone-500 italic mb-2">
        Nessun piatto nel catalogo. Vai alla tab Catalogo per aggiungerne.
      </div>
    );
  }

  return (
    <div className="border border-stone-200 rounded-lg p-2 bg-stone-50/50">
      <div className="flex flex-wrap gap-1 mb-2 text-xs">
        <button
          onClick={() => setFilter("all")}
          className={"px-2 py-0.5 rounded " + (filter === "all" ? "bg-orange-100 text-orange-900" : "bg-white text-stone-600 border border-stone-200")}
        >tutti</button>
        {CATEGORIE.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={"px-2 py-0.5 rounded " + (filter === c.key ? "bg-orange-100 text-orange-900" : "bg-white text-stone-600 border border-stone-200")}
          >{c.emoji} {c.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className="text-xs bg-white border border-stone-200 rounded px-2 py-1 hover:bg-orange-50 hover:border-orange-300 text-left"
            title={p.nome}
          >
            <span className="text-[9px] uppercase tracking-wider text-stone-500 mr-1">{p.categoria}</span>
            {p.nome.length > 50 ? p.nome.slice(0, 50) + "…" : p.nome}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 2: ARCHIVIO
// ─────────────────────────────────────────────────────────────
function TabArchivio({ menus, refresh, onApri }) {
  const [filtroDa, setFiltroDa] = useState("");
  const [filtroA, setFiltroA] = useState("");

  const apriPdfData = (data) => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/pranzo/menu/${data}/pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      });
  };

  const filtered = useMemo(() => {
    return (menus || []).filter((m) => {
      if (filtroDa && m.data < filtroDa) return false;
      if (filtroA && m.data > filtroA) return false;
      return true;
    });
  }, [menus, filtroDa, filtroA]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-3 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Da</label>
          <input type="date" value={filtroDa} onChange={(e) => setFiltroDa(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">A</label>
          <input type="date" value={filtroA} onChange={(e) => setFiltroA(e.target.value)}
            className="border border-stone-300 rounded-lg px-3 py-2" />
        </div>
        <Btn variant="ghost" onClick={() => { setFiltroDa(""); setFiltroA(""); }}>Reset</Btn>
        <Btn variant="ghost" onClick={refresh}>↻ Aggiorna</Btn>
        <div className="ml-auto text-sm text-stone-500">{filtered.length} menu</div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="📂"
          title="Nessun menu in archivio"
          description="Crea il primo menu del giorno dalla tab Oggi."
        />
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Stato</th>
                <th className="text-left px-4 py-2">N. piatti</th>
                <th className="text-left px-4 py-2">Prezzi (1/2/3)</th>
                <th className="text-right px-4 py-2">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-stone-100 hover:bg-orange-50/30">
                  <td className="px-4 py-2 font-medium">
                    {formatDataEstesa(m.data)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={"text-xs px-2 py-0.5 rounded " +
                      (m.stato === "pubblicato" ? "bg-emerald-100 text-emerald-800"
                        : m.stato === "archiviato" ? "bg-stone-200 text-stone-700"
                        : "bg-amber-100 text-amber-800")}>
                      {m.stato}
                    </span>
                  </td>
                  <td className="px-4 py-2">{m.n_piatti}</td>
                  <td className="px-4 py-2 text-stone-600">
                    {fmtPrezzo(m.prezzo_1)} / {fmtPrezzo(m.prezzo_2)} / {fmtPrezzo(m.prezzo_3)}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Btn variant="ghost" size="sm" onClick={() => apriPdfData(m.data)}>📄 PDF</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => onApri(m.data)}>✏️ Apri</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 3: CATALOGO PIATTI
// ─────────────────────────────────────────────────────────────
function TabCatalogo({ catalogo, refresh }) {
  const [editing, setEditing] = useState(null); // null | {id?, nome, categoria, note}
  const [saving, setSaving] = useState(false);

  const startNew = () => setEditing({ nome: "", categoria: "primo", note: "" });
  const startEdit = (p) => setEditing({ ...p });

  const salva = async () => {
    if (!editing.nome.trim()) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const url = isNew ? `${API_BASE}/pranzo/piatti/` : `${API_BASE}/pranzo/piatti/${editing.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: editing.nome.trim(),
          categoria: editing.categoria,
          note: editing.note || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing(null);
      refresh();
    } catch (e) {
      alert(`Errore: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const elimina = async (p) => {
    if (!window.confirm(`Disattivare "${p.nome}" dal catalogo?`)) return;
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/piatti/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refresh();
    } catch (e) {
      alert(`Errore: ${e.message}`);
    }
  };

  // raggruppa per categoria
  const byCat = useMemo(() => {
    const map = {};
    (catalogo || []).forEach((p) => {
      (map[p.categoria] = map[p.categoria] || []).push(p);
    });
    return map;
  }, [catalogo]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-600">
          {(catalogo || []).length} piatti nel catalogo
        </div>
        <Btn onClick={startNew}>+ Nuovo piatto</Btn>
      </div>

      {editing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-amber-900">{editing.id ? "Modifica piatto" : "Nuovo piatto"}</h4>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-stone-500 mb-1">Nome</label>
              <input
                value={editing.nome}
                onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Categoria</label>
              <select
                value={editing.categoria}
                onChange={(e) => setEditing({ ...editing, categoria: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2"
              >
                {CATEGORIE.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-stone-500 mb-1">Note (interne, non stampate)</label>
              <input
                value={editing.note || ""}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setEditing(null)}>Annulla</Btn>
            <Btn onClick={salva} loading={saving}>Salva</Btn>
          </div>
        </div>
      )}

      {CATEGORIE.map((c) => {
        const items = byCat[c.key] || [];
        if (items.length === 0) return null;
        return (
          <div key={c.key} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-50 px-4 py-2 font-semibold text-stone-700 border-b border-stone-200">
              {c.emoji} {c.label} <span className="text-stone-400 font-normal">· {items.length}</span>
            </div>
            <div className="divide-y divide-stone-100">
              {items.map((p) => (
                <div key={p.id} className="px-4 py-2 flex items-center gap-3 hover:bg-stone-50">
                  <div className="flex-1">
                    <div className="text-sm">{p.nome}</div>
                    {p.note && <div className="text-xs text-stone-500 italic">{p.note}</div>}
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => startEdit(p)}>✏️</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => elimina(p)}>🗑️</Btn>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {(catalogo || []).length === 0 && !editing && (
        <EmptyState
          icon="🍳"
          title="Catalogo vuoto"
          description="Aggiungi i piatti che ricorrono nei pranzi di lavoro per riusarli velocemente."
          action={<Btn onClick={startNew}>+ Nuovo piatto</Btn>}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 4: IMPOSTAZIONI
// ─────────────────────────────────────────────────────────────
function TabSettings({ settings, refresh }) {
  const [form, setForm] = useState(settings || {});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { setForm(settings || {}); }, [settings]);

  const update = (k, v) => setForm({ ...form, [k]: v });

  const salva = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await apiFetch(`${API_BASE}/pranzo/settings/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titolo_default: form.titolo_default,
          sottotitolo_default: form.sottotitolo_default,
          titolo_business: form.titolo_business,
          prezzo_1_default: Number(form.prezzo_1_default),
          prezzo_2_default: Number(form.prezzo_2_default),
          prezzo_3_default: Number(form.prezzo_3_default),
          footer_default: form.footer_default,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMsg({ tipo: "ok", text: "Impostazioni salvate." });
      refresh();
    } catch (e) {
      setMsg({ tipo: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="text-stone-500">Caricamento…</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      {msg && (
        <div className={"rounded-lg px-3 py-2 text-sm " +
          (msg.tipo === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : "bg-red-50 text-red-800 border border-red-200")}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <h3 className="font-semibold text-stone-700">Testata default</h3>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Titolo</label>
          <input
            value={form.titolo_default || ""}
            onChange={(e) => update("titolo_default", e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Sottotitolo</label>
          <textarea
            value={form.sottotitolo_default || ""}
            onChange={(e) => update("sottotitolo_default", e.target.value)}
            rows={2}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Titolo box prezzi</label>
          <input
            value={form.titolo_business || ""}
            onChange={(e) => update("titolo_business", e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <h3 className="font-semibold text-stone-700">Prezzi default Menù Business (€)</h3>
        {[
          ["prezzo_1_default", "1 portata"],
          ["prezzo_2_default", "2 portate"],
          ["prezzo_3_default", "3 portate"],
        ].map(([k, lbl]) => (
          <div key={k} className="flex items-center gap-3">
            <label className="w-24 text-sm text-stone-600">{lbl}</label>
            <input
              type="number"
              step="0.5"
              value={form[k] ?? ""}
              onChange={(e) => update(k, e.target.value)}
              className="flex-1 border border-stone-300 rounded-lg px-3 py-2"
            />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
        <h3 className="font-semibold text-stone-700">Footer note (default)</h3>
        <textarea
          value={form.footer_default || ""}
          onChange={(e) => update("footer_default", e.target.value)}
          rows={3}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono"
        />
        <div className="text-xs text-stone-500">
          Suggerimento: usa <code>*</code> per il riferimento "acqua, coperto e servizio inclusi" e
          <code> **</code> per "da Lunedì a Venerdì". Il PDF preserva i ritorni a capo.
        </div>
      </div>

      <div className="flex justify-end">
        <Btn onClick={salva} loading={saving}>Salva impostazioni</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT ROOT
// ─────────────────────────────────────────────────────────────
export default function PranzoMenu() {
  const [tab, setTab] = useState("oggi");
  const [settings, setSettings] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [menus, setMenus] = useState(null);
  const [pickData, setPickData] = useState(null);

  const loadSettings = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/pranzo/settings/`);
    if (res.ok) setSettings(await res.json());
  }, []);

  const loadCatalogo = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/pranzo/piatti/`);
    if (res.ok) {
      const d = await res.json();
      setCatalogo(d.piatti || []);
    }
  }, []);

  const loadMenus = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/pranzo/menu/`);
    if (res.ok) {
      const d = await res.json();
      setMenus(d.menus || []);
    }
  }, []);

  useEffect(() => { loadSettings(); loadCatalogo(); loadMenus(); }, [loadSettings, loadCatalogo, loadMenus]);

  return (
    <PageLayout
      title="Menu Pranzo del Giorno"
      subtitle="Gestione cucina · pranzo di lavoro"
      wide
    >
      <TabNav tab={tab} setTab={setTab} />

      {tab === "oggi" && (
        <TabOggi
          settings={settings}
          catalogo={catalogo}
          refreshArchivio={loadMenus}
          key={pickData || "today"}
        />
      )}
      {tab === "archivio" && (
        <TabArchivio
          menus={menus}
          refresh={loadMenus}
          onApri={(d) => { setPickData(d); setTab("oggi"); }}
        />
      )}
      {tab === "catalogo" && <TabCatalogo catalogo={catalogo} refresh={loadCatalogo} />}
      {tab === "settings" && <TabSettings settings={settings} refresh={loadSettings} />}
    </PageLayout>
  );
}
