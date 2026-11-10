import type { RiskFeatures, RiskResult } from "@/types";
import { Warnings, StatusBadge } from "./ui";

const FEATURE_LABELS: [keyof RiskFeatures, string, string?][] = [
  ["road_width", "Road width", "m"],
  ["road_type", "Road category code"],
  ["historical_work_orders", "Historical work-order input"],
  ["historical_road_repairs", "Historical road-repair input"],
  ["pothole_count", "Pothole input"],
  ["grievance_count", "Grievance input"],
  ["existing_projects", "Stored candidate conflict count"],
  ["nearby_projects", "Active projects with the same road name"],
  ["project_duration", "Project duration", "days"],
  ["lane_closure", "Lane closure indicator"],
  ["project_length", "Project length input", "m"],
  ["number_of_overlapping_utilities", "Work types in stored candidate conflicts"],
];

const LEVEL_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  LOW: { bar: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
  MEDIUM: { bar: "bg-yellow-500", text: "text-yellow-700", bg: "bg-yellow-50" },
  HIGH: { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
};

export default function RiskPanel({ result }: { result: RiskResult }) {
  const c = LEVEL_COLORS[result.risk_level] ?? LEVEL_COLORS.MEDIUM;

  return (
    <section className="panel" aria-label="Experimental risk indicator details">
      <h2 className="text-lg font-semibold mb-3">Experimental risk indicator</h2>

      <div className="flex items-end gap-4 mb-3">
        <span className={`text-3xl font-semibold ${c.text}`}>{Math.round(result.risk_score)}</span>
        <span className="text-slate-600 text-xl mb-1">/ 100</span>
        <StatusBadge status={result.risk_level} />
      </div>

      {/* Progress bar */}
      <div
        role="meter"
        aria-label="Experimental risk indicator"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={result.risk_score}
        aria-valuetext={`${Math.round(result.risk_score)} out of 100, ${result.risk_level}. Experimental ${result.model_version === "fallback" ? "deterministic fallback" : "model"}.`}
        className="w-full bg-gray-200 rounded-full h-3"
      >
        <div
          className={`${c.bar} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${result.risk_score}%` }}
        />
      </div>

      <p className="text-xs text-gray-500 mt-2">
        {result.model_version === "fallback"
          ? "Deterministic fallback · model artifact unavailable"
          : `Model version ${result.model_version}`}{" "}
        · not a disruption probability
      </p>
      <p className="text-xs muted mt-3">
        Experimental guidance only. This is not a verified prediction or probability of disruption.
        Missing historical inputs can use defaults.
      </p>
      <Warnings warnings={result.warnings} title="Indicator limitations" />
      <details className="mt-4 text-sm">
        <summary className="font-semibold">Inputs used for this indicator</summary>
        <p className="mt-3">
          Road reference: {result.road_segment_matched ? "selected" : "not matched"}. Road-segment
          historical feature row:{" "}
          {result.historical_features_available
            ? "present; completeness unverified"
            : "unavailable"}
          .
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Values returned by the server. Road-name matching is used where geometry is unavailable;
          candidate counts may include projects on the same road at different times.
        </p>
        {result.features_used ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Returned experimental indicator inputs</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-2 pr-3">
                    Input
                  </th>
                  <th scope="col" className="py-2">
                    Returned value
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_LABELS.map(([key, label, unit]) => (
                  <tr key={key} className="border-b border-slate-200">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {label}
                    </th>
                    <td className="py-2">
                      {result.features_used?.[key] == null
                        ? "Not returned"
                        : `${result.features_used[key]}${unit ? ` ${unit}` : ""}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-slate-600">
            Input values were not returned by this server. The indicator and coverage warnings above
            remain available.
          </p>
        )}
      </details>
    </section>
  );
}
