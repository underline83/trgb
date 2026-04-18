// @version: v1.1-mattoni — M.I primitives (Btn, StatusBadge, EmptyState)
// Lista template checklist (MVP, sessione 41) — solo admin/chef
// Filtri reparto/turno/attivo. Azioni: modifica, duplica, elimina, toggle attivo.

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../../config/api";
import CucinaNav from "./CucinaNav";
import { Btn, StatusBadge, EmptyState } from "../../components/ui";

const REPARTI = ["CUCINA", "BAR", "SALA", "ALTRO"];
const TURNI = ["APERTURA", "PRANZO", "POMERIGGIO", "CENA", "CHIUSURA", "GIORNATA"];

export default function CucinaTemplateList() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fReparto, setFReparto] = useState("");
  const [fTurno, setFTurno] = useState("");
  const [fAttivo, setFAttivo] = useState("");
  const [saving, setSaving] = useState(null); // id del template in save

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (fReparto) qs.set("reparto", fReparto);
    if (fTurno) qs.set("turno", fTurno);
    if (fAttivo !== "") qs.set("attivo", fAttivo);
    const url = qs.toString()
      ? `${API_BASE}/cucina/templates/?${qs.toString()}`
      : `${API_BASE}/cucina/templates/`;
    apiFetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setList)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [fReparto, fTurno, fAttivo]);

  useEffect(() => { load(); }, [load]);

  const toggleAttivo = async (t) => {
    setSaving(t.id);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/cucina/templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attivo: !t.attivo }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const duplica = async (t) => {
    setSaving(t.id);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/cucina/templates/${t.id}/duplica`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  const elimina = async (t) => {
    if (!window.confirm(`Eliminare "${t.nome}"?\n\nVerranno cancellati anche: items, istanze storiche, esecuzioni.\nAzione non reversibile.`)) {
      return;
    }
    setSaving(t.id);
    setError("");
    try {
      const res = await apiFetch(`${API_BASE}/cucina/templates/${t.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  // Raggruppa per reparto + turno
  const grouped = list.reduce((acc, t) => {
    const k = `${t.reparto} — ${t.turno || "sempre"}`;
    (acc[k] = acc[k] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-brand-cream font-sans">
      <CucinaNav current="templates" />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Header + nuovo */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-playfair font-bold text-red-900">Template checklist</h1>
            <p className="text-sm text-neutral-600 mt-1">
              Crea, attiva e modifica i template. Le istanze si generano automaticamente ogni giorno.
            </p>
          </div>
          <Btn variant="danger" size="lg" onClick={() => navigate("/cucina/templates/nuovo")}>
            + Nuovo template
          </Btn>
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-neutral-600">Reparto:</label>
            <select
              value={fReparto}
              onChange={e => setFReparto(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[40px]"
            >
              <option value="">Tutti</option>
              {REPARTI.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <label className="text-sm text-neutral-600">Turno:</label>
            <select
              value={fTurno}
              onChange={e => setFTurno(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[40px]"
            >
              <option value="">Tutti</option>
              {TURNI.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="text-sm text-neutral-600">Stato:</label>
            <select
              value={fAttivo}
              onChange={e => setFAttivo(e.target.value)}
              className="border rounded-lg px-3 py-2 min-h-[40px]"
            >
              <option value="">Tutti</option>
              <option value="true">Attivi</option>
              <option value="false">Disattivi</option>
            </select>
            {(fReparto || fTurno || fAttivo) && (
              <Btn variant="ghost" size="sm" onClick={() => { setFReparto(""); setFTurno(""); setFAttivo(""); }}>
                Reset
              </Btn>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading && <div className="text-center py-8 text-neutral-500">Caricamento...</div>}

        {!loading && list.length === 0 && (
          <EmptyState
            icon="🧩"
            title="Nessun template"
            description="Crea il tuo primo template per iniziare."
            action={
              <Btn variant="danger" size="md" onClick={() => navigate("/cucina/templates/nuovo")}>
                + Nuovo template
              </Btn>
            }
          />
        )}

        {/* Gruppi */}
        {Object.entries(grouped).map(([gruppo, ts]) => (
          <div key={gruppo} className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            <div className="px-4 py-2 bg-red-50 text-red-800 text-sm font-semibold uppercase tracking-wide">
              {gruppo}
            </div>
            <div className="divide-y divide-neutral-100">
              {ts.map(t => (
                <div key={t.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-neutral-900">{t.nome}</div>
                      <StatusBadge tone={t.attivo ? "success" : "neutral"} size="sm">
                        {t.attivo ? "ATTIVO" : "DISATTIVO"}
                      </StatusBadge>
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {t.items?.length ?? 0} item
                      {t.ora_scadenza_entro && ` · scadenza entro ${t.ora_scadenza_entro}`}
                      {t.frequenza && ` · ${t.frequenza.toLowerCase()}`}
                      {t.created_by && ` · by @${t.created_by}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.attivo ? (
                      <Btn variant="secondary" size="md" onClick={() => toggleAttivo(t)} disabled={saving === t.id} loading={saving === t.id}>
                        Disattiva
                      </Btn>
                    ) : (
                      <Btn variant="success" size="md" onClick={() => toggleAttivo(t)} disabled={saving === t.id} loading={saving === t.id}>
                        Attiva
                      </Btn>
                    )}
                    <Btn variant="chip" tone="red" size="md" onClick={() => navigate(`/cucina/templates/${t.id}`)} disabled={saving === t.id}>
                      Modifica
                    </Btn>
                    <Btn variant="secondary" size="md" onClick={() => duplica(t)} disabled={saving === t.id} loading={saving === t.id} title="Duplica con suffisso (copia)">
                      Duplica
                    </Btn>
                    <Btn variant="danger" size="md" onClick={() => elimina(t)} disabled={saving === t.id} loading={saving === t.id}>
                      Elimina
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
