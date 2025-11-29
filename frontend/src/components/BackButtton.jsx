// @version: v1.0
import React from "react";
import { useNavigate } from "react-router-dom";

export default function BackButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/")}
      className="
        px-4 py-2 mb-6 rounded-xl border border-neutral-300 
        bg-neutral-100 text-neutral-700 font-medium
        hover:bg-neutral-200 hover:-translate-y-0.5 
        transition shadow-sm
      "
    >
      ← Torna al Menu
    </button>
  );
}