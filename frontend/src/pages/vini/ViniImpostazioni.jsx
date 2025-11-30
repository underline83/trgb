/// @version: v2.4-premium-stable
// Impostazioni Carta Vini — UI Vintage TreGobbi (Tailwind)
// - Mantiene tutta la logica esistente (drag&drop, filtri, reset)
// - Layout allineato a Home / ViniMenu / ViniCarta / ViniDatabase / ViniVendite

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
} from "@hello-pangea/dnd";
import { API_BASE } from "../../config/api";

const api = {
  tipologie: `${API_BASE}/settings/vini/tipologie`,
  nazioni: `${API_BASE}/settings/vini/nazioni`,
  regioni: (n) => `${API_BASE}/settings/vini/regioni/${n}`,
  filtri: `${API_BASE}/settings/vini/filtri`,
  reset: `${API_BASE}/settings/vini/reset`,
};

export default function ViniImpostazioni() {
  const navigate = useNavigate();

  const [tipologie, setTipologie] = useState([]);
  const [nazioni, setNazioni] = useState([]);
  const [regioni, setRegioni] = useState([]);
  const [selectedNation, setSelectedNation] = useState(null);

  const [filtri, setFiltri] = useState({
    min_qta_stampa: 1,
    mostra_negativi: false,
    mostra_senza_prezzo: false,
  });

  const [notif, setNotif] = useState("");

  const showNotif = (msg) => {
    setNotif(msg);
    setTimeout(() => setNotif(""), 1500);
  };

  useEffect(() => {
    loadTipologie();
    loadNazioni();
    loadFiltri();
  }, []);

  const loadTipologie = async () => {
    const r = await fetch(api.tipologie);
    setTipologie(await r.json());
  };

  const loadNazioni = async () => {
    const r = await fetch(api.nazioni);
    const data = await r.json();
    setNazioni(data);
    if (data.length > 0) loadRegioni(data[0].nazione);
  };

  const loadRegioni = async (nazione) => {
    setSelectedNation(nazione);
    const r = await fetch(api.regioni(nazione));
    setRegioni(await r.json());
  };

  const loadFiltri = async () => {
    const r = await fetch(api.filtri);
    const data = await r.json();

    setFiltri({
      min_qta_stampa: data.min_qta_stampa ?? 1,
      mostra_negativi: data.mostra_negativi ?? false,
      mostra_senza_prezzo: data.mostra_senza_prezzo ?? false,
    });
  };

  const saveFiltri = async () => {
    await fetch(api.filtri, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filtri),
    });
    showNotif("Filtri salvati ✔️");
  };

  const resetSettings = async () => {
    if (
      !window.confirm(
        "Ripristinare tutte le impostazioni ai valori di default?"
      )
    )
      return;

    await fetch(api.reset, { method: "POST" });
    await loadTipologie();
    await loadNazioni();
    await loadRegioni("ITALIA");
    await loadFiltri();
    showNotif("Impostazioni ripristinate ✔️");
  };

  const saveOrder = async (type, items) => {
    const url =
      type === "tipologie"
        ? api.tipologie
        : type === "nazioni"
        ? api.nazioni
        : api.regioni(selectedNation);

    const body =
      type === "regioni"
        ? items.map((r) => ({ codice: r.codice, nome: r.nome }))
        : items.map((it) =>
            type === "tipologie" ? it.nome : it.nazione
          );

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    showNotif("Salvato ✔️");
  };

  const onDragEnd = (result, type) => {
    if (!result.destination) return;

    const items =
      type === "tipologie"
        ? Array.from(tipologie)
        : type === "nazioni"
        ? Array.from(nazioni)
        : Array.from(regioni);

    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);

    if (type === "tipologie") setTipologie(items);
    if (type === "nazioni") setNazioni(items);
    if (type === "regioni") setRegioni(items);

    saveOrder(type, items);
  };

  // Colonna riordinabile (tipologie / nazioni / regioni)
  const Column = ({ title, items, type }) => (
    <div className="w-full mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
      <h2 className="text-xl font-semibold mb-4 border-b border-amber-300 pb-1 tracking-wide font-playfair text-amber-900">
        {title}
      </h2>

      <DragDropContext onDragEnd={(r) => onDragEnd(r, type)}>
        <Droppable droppableId={type}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {items.map((item, index) => (
                <Draggable
                  key={item.nome || item.nazione || item.codice}
                  draggableId={item.nome || item.nazione || item.codice}
                  index={index}
                >
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="flex items-center gap-3 p-2.5 mb-2 bg-white border border-amber-100 rounded-lg text-[17px] shadow-sm"
                      style={provided.draggableProps.style}
                    >
                      <div
                        {...provided.dragHandleProps}
                        className="cursor-grab text-xl pr-2 text-amber-700 select-none"
                      >
                        ⋮⋮
                      </div>

                      <div className="flex-1">
                        {type === "tipologie" && item.nome}
                        {type === "nazioni" && item.nazione}
                        {type === "regioni" &&
                          `${item.codice} — ${item.nome}`}
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}

              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200 space-y-8">

        {/* 🔙 Back + titolo + reset */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/vini")}
              className="self-start px-4 py-2 rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-200 transition shadow-sm"
            >
              ← Torna al Menu Vini
            </button>
            <h1 className="text-3xl sm:text-4xl font-bold font-playfair text-amber-900 tracking-wide">
              Impostazioni Carta Vini
            </h1>
            <p className="text-neutral-600">
              Ordine di tipologie, nazioni, regioni e filtri di stampa della carta.
            </p>
          </div>

          <button
            onClick={resetSettings}
            className="px-4 py-2 rounded-xl border border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200 transition font-semibold shadow-sm"
          >
            Ripristina default
          </button>
        </div>

        {/* TIPOLGIE + NAZIONI */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Column title="Tipologie" items={tipologie} type="tipologie" />
          <Column title="Nazioni" items={nazioni} type="nazioni" />
        </div>

        {/* REGIONI */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 font-playfair text-[18px]">
            <span>Regioni per nazione:</span>
            <select
              value={selectedNation || ""}
              onChange={(e) => loadRegioni(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-[16px]"
            >
              {nazioni.map((n) => (
                <option key={n.nazione} value={n.nazione}>
                  {n.nazione}
                </option>
              ))}
            </select>
          </div>

          <Column
            title={`Regioni di ${selectedNation || "-"}`}
            items={regioni}
            type="regioni"
          />
        </div>

        {/* FILTRI STAMPA */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold mb-2 border-b border-amber-300 pb-1 font-playfair text-amber-900">
            Filtri di stampa Carta Vini
          </h2>

          <div className="flex flex-wrap items-center gap-4">

            <label className="flex items-center gap-2 text-[17px]">
              <span>Quantità minima per stampare:</span>
              <input
                type="number"
                min={0}
                value={filtri.min_qta_stampa}
                onChange={(e) =>
                  setFiltri((prev) => ({
                    ...prev,
                    min_qta_stampa: parseInt(e.target.value || "0", 10),
                  }))
                }
                className="w-20 px-2 py-1 rounded-md border border-amber-300 bg-white"
              />
            </label>

            <label className="flex items-center gap-2 text-[17px]">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={filtri.mostra_negativi}
                onChange={(e) =>
                  setFiltri((prev) => ({
                    ...prev,
                    mostra_negativi: e.target.checked,
                  }))
                }
              />
              <span>Includi vini con quantità negativa</span>
            </label>

            <label className="flex items-center gap-2 text-[17px]">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={filtri.mostra_senza_prezzo}
                onChange={(e) =>
                  setFiltri((prev) => ({
                    ...prev,
                    mostra_senza_prezzo: e.target.checked,
                  }))
                }
              />
              <span>Includi vini senza prezzo</span>
            </label>

            <button
              onClick={saveFiltri}
              className="ml-auto px-4 py-2 rounded-xl border border-amber-500 bg-amber-200 text-amber-900 hover:bg-amber-300 transition font-semibold shadow-sm"
            >
              Salva filtri
            </button>
          </div>
        </div>

      </div>

      {/* NOTIFICA */}
      {notif && (
        <div className="fixed bottom-5 right-5 bg-amber-100 border border-amber-400 text-amber-900 px-4 py-2 rounded-lg shadow-lg text-sm font-medium z-50">
          {notif}
        </div>
      )}
    </div>
  );
}