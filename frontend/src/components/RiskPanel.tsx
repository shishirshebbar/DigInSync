import type { RiskResult } from "@/types";

const LEVEL_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  LOW: { bar: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
  MEDIUM: { bar: "bg-yellow-500", text: "text-yellow-700", bg: "bg-yellow-50" },
  HIGH: { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
};

export default function RiskPanel({ result }: { result: RiskResult }) {
  const c = LEVEL_COLORS[result.risk_level] ?? LEVEL_COLORS.MEDIUM;

  return (
    <div className={`rounded-xl border p-6 shadow-sm ${c.bg}`}>
      <h2 className="text-lg font-semibold mb-3">Experimental risk indicator</h2>

      <div className="flex items-end gap-4 mb-3">
        <span className={`text-5xl font-bold ${c.text}`}>
          {Math.round(result.risk_score)}
        </span>
        <span className="text-gray-400 text-xl mb-1">/ 100</span>
        <span className={`ml-2 mb-1 text-lg font-semibold ${c.text}`}>
          {result.risk_level}
        </span>
      </div>

      {/* Progress bar */}
      <div role="meter" aria-label="Experimental risk indicator" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.risk_score} aria-valuetext={`${Math.round(result.risk_score)} out of 100, ${result.risk_level}. Experimental ${result.model_version === "fallback" ? "deterministic fallback" : "model"}.`} className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`${c.bar} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${result.risk_score}%` }}
        />
      </div>

      <p className="text-xs text-gray-500 mt-2">
        {result.model_version === "fallback" ? "Deterministic fallback · model artifact unavailable" : `Model version ${result.model_version}`} · not a disruption probability
      </p>
      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
    </div>
  );
}
