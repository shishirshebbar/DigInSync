import type { ConflictResult } from "@/types";

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
};

export default function ConflictPanel({ result }: { result: ConflictResult }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Conflicts detected</h2>
        <span className={`text-sm font-medium px-3 py-1 rounded-full border ${
          result.has_high_severity ? SEVERITY_COLORS.HIGH : SEVERITY_COLORS.LOW
        }`}>
          {result.conflict_count} conflict{result.conflict_count !== 1 ? "s" : ""}
        </span>
      </div>

      {result.conflict_count === 0 ? (
        <p className="text-sm text-gray-500">No conflicts found among the available candidates. This does not establish that work is safe to proceed.</p>
      ) : (
        <ul className="space-y-3">
          {result.conflicts.map((c, i) => (
            <li key={i} className="border rounded-lg p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">
                  {c.project_a_name} ↔ {c.project_b_name}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_COLORS[c.severity]}`}>
                  {c.severity}
                </span>
              </div>
              <div className="text-xs text-gray-500 flex gap-4">
                {c.temporal_overlap && <span>⏱ {c.overlap_days}-day overlap</span>}
                {c.spatial_overlap && <span>📍 {result.location_basis === "road_name" ? "Same road name (unverified location)" : "Within specified radius"}</span>}
                {c.impact_overlap && <span>⚠️ Impact conflict</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {result.warnings.map((warning) => (
        <p key={warning} className="mt-3 text-sm text-amber-700">{warning}</p>
      ))}
    </div>
  );
}
