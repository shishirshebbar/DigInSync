"use client";

import type { CoordinationResult } from "@/types";
import PrepareProposalButton from "@/components/PrepareProposalButton";
import { Warnings } from "./ui";

export default function RecommendationsPanel({ result }: { result: CoordinationResult }) {
  return (
    <section className="panel" aria-label="Coordination options">
      <h2 className="text-lg font-semibold mb-2">Coordination options for review</h2>
      <p className="text-sm text-gray-600 mb-2">
        {result.llm_used ? "AI-generated explanation" : "Deterministic explanation"}:{" "}
        {result.explanation}
      </p>
      <p className="text-sm text-gray-600 mb-4">
        Suggested starting point: {result.recommended_option}. This is not an approval. Baseline
        experimental risk indicator: {result.baseline_risk_score}/100.
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        {result.options.map((option) => (
          <div key={option.option_name} className="option-card">
            <h3 className="font-medium text-sm">{option.option_name}</h3>
            <p className="text-sm text-gray-600 mt-2">{option.description}</p>
            <p className="text-xs text-gray-500 mt-2">Schedule: {option.schedule_impact}</p>
            <p className="text-xs text-gray-500 mt-1">Tradeoffs: {option.tradeoffs}</p>
            <p className="text-xs text-gray-500 mt-1">
              Option-specific risk and duration: not assessed.
            </p>
            <PrepareProposalButton projectId={result.project_id} optionKey={option.option_key} />
          </div>
        ))}
      </div>
      <Warnings warnings={result.warnings} title="Coordination limitations" />
    </section>
  );
}
