// @version: v1.2-vini-menu-riorganizzato
// Pagina Menu Vini — riorganizzata per roadmap “visiva”

import React from "react";
import { useNavigate } from "react-router-dom";

export default function ViniMenu() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "";

  const isAdmin = role === "admin";

  const Card = ({ title, desc, to, disabled, badge }) => (
    <button
      type="button"
      onClick={() => !disabled && to && navigate(to)}
      disabled={disabled}
      className={[
        "w-full text-left rounded-2xl border p-4 shadow-sm transition",
        disabled
          ? "bg-neutral-50 border-neutral-200 text-neutral-400 cursor-not-allowed"
          : "bg-white border-neutral-200 hover:bg-amber-50 hover:-translate-y-0.5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-neutral-900">{title}</div>
          <div className="mt-1 text-sm text-neutral-600">{desc}</div>
        </div>

        {badge && (
          <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-neutral-50 text-neutral-700 border-neutral-200">
            {badge}
          </span>
        )}
      </div>
    </button>
  );

  const Section = ({ title, subtitle, children }) => (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </section>
  );

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans">
      <div className="max-w-5xl mx-auto bg-white shadow-2xl rounded-3xl p-8 lg:p-10 border border-neutral-200">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-amber-900 tracking-wide font-playfair mb-2">
              🍷 Modulo Vini
            </h1>
            <p className="text-neutral-600 text-sm">
              Menu operativo (strutturato per roadmap). Qui raggruppiamo le funzioni
              per: ricerca, magazzino, movimenti, vendite e dashboard.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:-translate-y-0.5 shadow-sm transition"
            >
              ← Home
            </button>
          </div>
        </div>

        {/* 1) OPERATIVO MAGAZZINO */}
        <Section
          title="Operativo magazzino"
          subtitle="Le pagine che usi tutti i giorni (lista, dettaglio, inserimento)."
        >
          <Card
            title="Magazzino — Lista & Filtri"
            desc="Ricerca, filtri avanzati, selezione vino e vista dettaglio base."
            to="/vini/magazzino"
            badge="ATTIVO"
          />
          <Card
            title="Magazzino — Inserisci nuovo vino"
            desc="Creazione nuovo vino (con suggerimenti)."
            to="/vini/magazzino/nuovo"
            badge="ATTIVO"
          />
        </Section>

        <div className="h-px bg-neutral-200 my-8" />

        {/* 2) CARTA / DATABASE / VENDITE (legacy o già esistenti) */}
        <Section
          title="Carta & database"
          subtitle="Sezioni esistenti o legacy (da riallineare/integrare col magazzino)."
        >
          <Card
            title="Carta vini"
            desc="Gestione carta (DB storico/excel)."
            to="/vini/carta"
            badge="ESISTENTE"
          />
          <Card
            title="Database vini"
            desc="Archivio / database vini (legacy)."
            to="/vini/database"
            badge="ESISTENTE"
          />
          <Card
            title="Vendite vini"
            desc="Analisi vendite (legacy)."
            to="/vini/vendite"
            badge="ESISTENTE"
          />
          <Card
            title="Impostazioni vini"
            desc="Tool amministrativi e settaggi modulo."
            to="/vini/settings"
            badge={isAdmin ? "ADMIN" : "LIMITATO"}
            disabled={!isAdmin}
          />
        </Section>

        <div className="h-px bg-neutral-200 my-8" />

        {/* 3) ROADMAP (disabilitato, ma “visivo”) */}
        <Section
          title="Roadmap vini (da fare)"
          subtitle="Lista visiva delle prossime pagine/funzioni da sviluppare."
        >
          <Card
            title="Modifica vino (da lista o da dettaglio)"
            desc="Edit completo: anagrafica, prezzi, stato, locazioni."
            disabled
            badge="TODO"
          />
          <Card
            title="Movimenti cantina (carico/scarico/vendita/rettifica)"
            desc="UI operativa: ricerca vino → inserisci causale → aggiorna inventario."
            disabled
            badge="TODO"
          />
          <Card
            title="Vendita bottiglia / calice"
            desc="Operazione rapida con causali e aggiornamento giacenza."
            disabled
            badge="TODO"
          />
          <Card
            title="Dashboard vini"
            desc="Vendite, movimentazioni, vini fermi da tempo, alert prezzi/giacenze."
            disabled
            badge="TODO"
          />
        </Section>

        <div className="h-px bg-neutral-200 my-8" />

        {/* NOTE OPERATIVE */}
        <section className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
            Note operative (promemoria)
          </h3>
          <ul className="mt-2 text-sm text-neutral-600 list-disc pl-5 space-y-1">
            <li>Allineare filtri: prezzo &gt;&lt; tra su PREZZO_CARTA (vendita), non listino.</li>
            <li>Aggiungere checkbox “Solo giacenza positiva”.</li>
            <li>Filtri combinati con liste dipendenti: Tipologia/Nazione/Produttore/Regione.</li>
            <li>Protezione ID lato DB + gestione duplicati in inserimento (modalità C: avviso + conferma).</li>
          </ul>
        </section>
      </div>
    </div>
  );
}