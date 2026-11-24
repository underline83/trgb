// @version: v1.0 — tavoli per sala, apertura con coperti (2026-11-24)
// Modulo: comande
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Btn, EmptyState, Modal, PageLayout } from "../../components/ui";
import TrgbLoader from "../../components/TrgbLoader";
import ComandeNav, { BannerProva } from "./ComandeNav";
import { api, euro } from "./comandeApi";

const AGGIORNA_OGNI_MS = 20000;

function oraDa(ts) {
  return ts ? String(ts).slice(11, 16) : "";
}

export default function ComandeTavoli() {
  const navigate = useNavigate();
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [daAprire, setDaAprire] = useState(null); // tavolo
  const [coperti, setCoperti] = useState(2);
  const [apro, setApro] = useState(false);

  const carica = useCallback(async () => {
    try {
      setDati(await api("/comande/tavoli/"));
      setErrore(null);
    } catch (e) {
      setErrore(e.message);
    }
  }, []);

  useEffect(() => {
    carica();
    const t = setInterval(carica, AGGIORNA_OGNI_MS);
    return () => clearInterval(t);
  }, [carica]);

  const tocca = (t) => {
    if (t.conto) return navigate(`/comande/conto/${t.conto.id}`);
    setCoperti(Math.max(1, t.posti_min || 2));
    setDaAprire(t);
  };

  const apri = async () => {
    setApro(true);
    try {
      const c = await api("/comande/conti/", { method: "POST", body: { tavolo_id: daAprire.id, coperti } });
      navigate(`/comande/conto/${c.id}`);
    } catch (e) {
      setErrore(e.message);
      setDaAprire(null);
      carica();
    } finally {
      setApro(false);
    }
  };

  const aperti = dati ? dati.sale.reduce((n, s) => n + s.tavoli.filter((t) => t.conto).length, 0) : 0;

  return (
    <PageLayout
      nav={<ComandeNav current="tavoli" />}
      title="Tavoli"
      subtitle={dati ? `${aperti} ${aperti === 1 ? "tavolo aperto" : "tavoli aperti"}` : ""}
      actions={<Btn variant="secondary" size="md" onClick={carica}>↻ Aggiorna</Btn>}
    >
      <BannerProva />
      {errore && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{errore}</div>
      )}
      {!dati && !errore && <TrgbLoader />}
      {dati && dati.sale.length === 0 && (
        <EmptyState icon="🍽️" title="Nessun tavolo" description="I tavoli si disegnano in Prenotazioni › Editor Tavoli." />
      )}
      {dati &&
        dati.sale.map((s) => (
          <section key={s.zona} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">{s.zona}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {s.tavoli.map((t) => {
                const c = t.conto;
                return (
                  <button
                    key={t.id}
                    onClick={() => tocca(t)}
                    className={`min-h-[84px] rounded-2xl border p-2 text-left shadow-sm transition active:scale-[0.98] ${
                      c ? "border-rose-300 bg-rose-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-lg font-bold text-brand-ink">{t.nome}</span>
                      {c && c.da_inviare > 0 && (
                        <span className="rounded-full bg-brand-red px-1.5 text-xs font-semibold text-white">
                          {c.da_inviare}
                        </span>
                      )}
                    </div>
                    {c ? (
                      <div className="mt-1 text-xs leading-tight text-rose-900">
                        <div>👤 {c.coperti} · {oraDa(c.aperto_at)}</div>
                        <div className="font-semibold">{euro(c.totale)}</div>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-neutral-400">{t.posti_min}–{t.posti_max} posti</div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      {dati && dati.altri_conti.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Conti su tavoli tolti</h2>
          <div className="flex flex-wrap gap-2">
            {dati.altri_conti.map((c) => (
              <Btn key={c.id} variant="secondary" onClick={() => navigate(`/comande/conto/${c.id}`)}>
                {c.tavolo} · {euro(c.totale)}
              </Btn>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={!!daAprire}
        onClose={() => setDaAprire(null)}
        title={daAprire ? `Apri il tavolo ${daAprire.nome}` : ""}
        subtitle={daAprire ? daAprire.zona : ""}
        tone="rose"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDaAprire(null)}>Annulla</Btn>
            <Btn variant="primary" loading={apro} onClick={apri}>Apri</Btn>
          </>
        }
      >
        <div className="py-2 text-center">
          <div className="mb-2 text-sm text-neutral-600">Coperti</div>
          <div className="flex items-center justify-center gap-4">
            <Btn variant="secondary" size="lg" onClick={() => setCoperti((n) => Math.max(0, n - 1))}>−</Btn>
            <span className="w-14 text-4xl font-bold tabular-nums text-brand-ink">{coperti}</span>
            <Btn variant="secondary" size="lg" onClick={() => setCoperti((n) => Math.min(200, n + 1))}>+</Btn>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}
