// @version: v2.4-premium-stable
// Pagina Database Vini — Import Excel + Risultato
// Stile Vintage Premium allineato a Carta e Menu

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ViniDatabase() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadResult, setUploadResult] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!selectedFile) {
      alert("Seleziona un file Excel (.xlsx).");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/vini/upload?format=html",
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        throw new Error(`Errore server: ${response.status}`);
      }

      const html = await response.text();
      setUploadResult(html);

    } catch (err) {
      setUploadResult(
        `<p style="color:red;font-weight:bold;">${err.message}</p>`
      );
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-12 border border-neutral-200">

        {/* 🔙 BACK BUTTON */}
        <button
          onClick={() => navigate("/vini")}
          className="mb-6 px-5 py-2 rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-200 transition shadow-sm"
        >
          ← Torna al Menu Vini
        </button>

        {/* HEADER */}
        <h1 className="text-4xl tracking-wide font-bold text-center mb-4 text-blue-900 font-playfair">
          📦 Database Vini — Import Excel
        </h1>
        <p className="text-center text-neutral-600 mb-10">
          Carica il file <code>vini.xlsx</code> per aggiornare il database.
        </p>

        {/* UPLOAD BOX */}
        <div className="space-y-4 bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-inner mb-10">

          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setSelectedFile(e.target.files[0])}
            className="border border-gray-300 p-3 w-full rounded-lg bg-white shadow-sm"
          />

          <button
            onClick={handleUpload}
            disabled={loading}
            className={`px-6 py-3 rounded-lg text-white font-semibold shadow transition ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-700 hover:bg-blue-800"
            }`}
          >
            {loading ? "Caricamento…" : "📤 Importa file Excel"}
          </button>
        </div>

        {/* RISULTATO */}
        <div
          className="
            text-sm leading-relaxed bg-neutral-50 
            border border-neutral-300 rounded-xl 
            p-5 shadow-inner max-h-[60vh] overflow-auto
          "
          dangerouslySetInnerHTML={{ __html: uploadResult }}
        />
      </div>
    </div>
  );
}