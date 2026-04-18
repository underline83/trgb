// @version: v0.2-mattoni — refactor con M.I UI primitives (PageLayout, Btn, EmptyState)
// Placeholder Import/Export Ricette. Contenuto ancora da implementare.
import React from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout, Btn, EmptyState } from "../../components/ui";

export default function RicetteImport() {
  const navigate = useNavigate();

  return (
    <PageLayout
      title="📥 Import / Export Ricette"
      subtitle="Importa ed esporta ricette in formato JSON"
      actions={
        <Btn variant="secondary" size="md" onClick={() => navigate("/ricette")}>
          ← Torna al Menu Ricette
        </Btn>
      }
    >
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-8">
        <EmptyState
          icon="🛠️"
          title="Sezione Import/Export in sviluppo"
          description="A breve potrai esportare e importare ricette in formato JSON."
          watermark
        />
      </div>
    </PageLayout>
  );
}
