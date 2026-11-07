"use client";

import type { CoordinationResult } from "@/types";

export default function RecommendationsPanel({ result }: { result: CoordinationResult }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-2">Coordination options for review</h2>
      <p className="text-sm text-gray-600 mb-2">
        {result.llm_used ? "AI-generated explanation" : "Deterministic explanation"}: {result.explanation}
      </p>
      <p className="text-sm text-gray-600 mb-4">
        Suggested starting point: {result.recommended_option}. This is not an approval.
        Baseline experimental risk indicator: {result.baseline_risk_score}/100.
      </p>

      <div className="space-y-4">
        {result.options.map((option) => (
          <div key={option.option_name} className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium text-sm">{option.option_name}</h3>
            <p className="text-sm text-gray-600 mt-2">{option.description}</p>
            <p className="text-xs text-gray-500 mt-2">Schedule: {option.schedule_impact}</p>
            <p className="text-xs text-gray-500 mt-1">Tradeoffs: {option.tradeoffs}</p>
            <p className="text-xs text-gray-500 mt-1">
              Option-specific risk and duration: not assessed.
            </p>
          </div>
        ))}
      </div>
      <ul className="mt-4 list-disc pl-5 text-xs text-amber-800 space-y-1">
        {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
    </div>
  );
}
