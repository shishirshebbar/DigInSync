import type { ConflictResult } from "@/types";
import { Panel, StatusBadge, Warnings } from "./ui";

export default function ConflictPanel({ result }: { result: ConflictResult }) {
  return (
    <Panel
      title="Candidate conflicts"
      description={`${result.conflicts.filter((item) => item.temporal_overlap).length} candidate(s) have overlapping dates. Candidate counts also include work scheduled at other times.`}
      actions={<span className="badge">{result.conflict_count} candidates</span>}
    >
      {result.conflict_count === 0 ? (
        <p className="text-sm muted">
          No conflicts found among the available candidates. This does not establish that work is
          safe to proceed.
        </p>
      ) : (
        <ul className="record-list">
          {result.conflicts.map((conflict) => (
            <li key={conflict.project_b_id}>
              <div className="flex justify-between items-start gap-3">
                <strong className="text-sm font-semibold">{conflict.project_b_name}</strong>
                <StatusBadge status={conflict.severity} />
              </div>
              <p className="record-meta">
                Returned score: {conflict.conflict_score}/100 · {conflict.overlap_days} overlapping
                day(s). End dates are exclusive.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {conflict.temporal_overlap && <span className="badge">Overlapping dates</span>}
                {conflict.spatial_overlap && (
                  <span className="badge">
                    {result.location_basis === "road_name"
                      ? "Same road name · unverified"
                      : "Within analysis radius"}
                  </span>
                )}
                {conflict.impact_overlap && <span className="badge">Impact conflict</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Warnings warnings={result.warnings} />
    </Panel>
  );
}
