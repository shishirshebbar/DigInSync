"use client";

import { useState } from "react";
import type { CoordinationOption } from "@/types";

interface Props {
  options: CoordinationOption[];
  onApprove: (planId: string) => void;
  onSimulate: () => void;
}

export default function RecommendationsPanel({ options, onApprove, onSimulate }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Coordination options</h2>

      <div className="space-y-4">
        {options.map((opt, i) => (
          <div
            key={i}
            onClick={() => setSelected(i)}
            className={`border rounded-lg p-4 cursor-pointer transition-colors ${
              selected === i
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-sm">{opt.option_name}</span>
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                Risk: {Math.round(opt.risk_score)}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-2">{opt.description}</p>
            <div className="text-xs text-gray-400 flex gap-4">
              <span>⏱ {opt.estimated_duration} days</span>
              <span>📋 {opt.schedule_impact}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Tradeoffs: {opt.tradeoffs}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onSimulate}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          What-if simulator →
        </button>
        <button
          disabled={selected === null}
          onClick={() => selected !== null && onApprove(options[selected].option_name)}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors"
        >
          Approve selected option
        </button>
      </div>
    </div>
  );
}
