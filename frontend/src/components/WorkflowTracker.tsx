"use client";

import { useState } from "react";
import { getActivities, type Operation } from "@/lib/activity";
import { ActivityButton, ActivityItem, Elapsed, statusLabels, useActivities } from "./ActivityProvider";

type Mode = "entry" | "project" | "proposal" | "dashboard";
type Phase = { title: string; operations: Operation[]; waiting: string };
const phases: Record<Mode, Phase[]> = {
  entry: [
    { title: "Read description", operations: ["extract"], waiting: "Optional · AI or manual entry" },
    { title: "Review location", operations: ["roads"], waiting: "Optional · choose a road reference" },
    { title: "Confirm and save", operations: ["create"], waiting: "Awaiting your confirmation" },
  ],
  project: [
    { title: "Project and location", operations: ["project", "map"], waiting: "Awaiting project data" },
    { title: "Candidate conflicts", operations: ["conflicts"], waiting: "Waiting for analysis" },
    { title: "Experimental indicator", operations: ["risk"], waiting: "Runs after conflict request settles" },
    { title: "Coordination options", operations: ["coordinate"], waiting: "Awaiting your action" },
    { title: "Schedule comparison", operations: ["simulate"], waiting: "Optional · try proposed dates" },
    { title: "Proposal draft", operations: ["proposalCreate"], waiting: "Awaiting your choice" },
  ],
  proposal: [
    { title: "Saved proposal", operations: ["proposalRead"], waiting: "Choose a proposal" },
    { title: "Draft revision", operations: ["proposalSave"], waiting: "Save edits before deciding" },
    { title: "Local decision", operations: ["approve", "reject"], waiting: "Awaiting review and decision" },
    { title: "Saved workplan", operations: ["workplan"], waiting: "Available after approval" },
  ],
  dashboard: [
    { title: "Stored totals", operations: ["impact"], waiting: "Awaiting dashboard data" },
    { title: "Project catalog", operations: ["catalog"], waiting: "Awaiting project search" },
    { title: "Saved proposals", operations: ["proposals"], waiting: "Awaiting proposal list" },
    { title: "Ward context", operations: ["ward"], waiting: "Optional · enter a dataset identifier" },
  ],
};

export default function WorkflowTracker({ mode, projectId, proposalId, detailsReady = false }: {
  mode: Mode; projectId?: string; proposalId?: string; detailsReady?: boolean;
}) {
  const activities = useActivities();
  const [firstId] = useState(() => getActivities().at(-1)?.id ?? 0);
  const [expanded, setExpanded] = useState(false);
  const relevant = activities.filter((item) => mode === "project" ? item.projectId === projectId
    : mode === "proposal" ? proposalId ? item.proposalId === proposalId : item.operation === "proposals"
      : item.id > firstId && phases[mode].some((phase) => phase.operations.includes(item.operation)) &&
        (mode !== "entry" || item.context !== "Map road layer"));
  const running = relevant.filter((item) => item.status === "running");
  return <section className="process-panel" aria-label="Workflow progress">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="eyebrow">Follow the work</p><h2 className="text-lg font-semibold">Workflow progress</h2>
        <p className="mt-1 text-sm text-slate-600">{running.length ? `${running.length} operation(s) running. Results appear as each request finishes.` : "Confirmed results and the next actions in your workflow."}</p></div>
      <ActivityButton />
    </header>
    <ol className="process-phases" aria-label="Workflow phases">
      {phases[mode].map((phase, index) => {
        const matching = relevant.filter((item) => phase.operations.includes(item.operation));
        // A combined phase is running until every observed request has settled.
        const latestByOperation = phase.operations.map((operation) => matching.findLast((item) => item.operation === operation)).filter((item) => item !== undefined);
        const activity = [...latestByOperation].sort((a, b) => {
          const rank = { running: 4, failed: 3, warning: 2, completed: 1 };
          return rank[b.status] - rank[a.status] || b.id - a.id;
        })[0];
        const skipped = mode === "entry" && index === 0 && detailsReady && !matching.some((item) => item.status === "completed" || item.status === "warning");
        return <li key={phase.title} className={`process-phase ${activity && !skipped ? `phase-${activity.status}` : ""}`}>
          <span className="process-number" aria-hidden="true">{index + 1}</span>
          <strong className="block text-sm">{phase.title}</strong>
          <p className="mt-1 text-xs text-slate-600">{skipped ? "Skipped · manual entry" : activity ? statusLabels[activity.status] : phase.waiting}</p>
          {activity && !skipped && <p className="mt-1 text-xs text-slate-500"><Elapsed activity={activity} /></p>}
        </li>;
      })}
    </ol>
    <details className="mt-3 text-sm" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Process details{relevant.length > 0 && ` (${relevant.length} request${relevant.length === 1 ? "" : "s"})`}</summary>
      <p className="my-3 text-xs text-slate-500">These are requests observed in this browser visit. Internal server checks are explained together, without estimated percentages. Earlier saved decisions can be reviewed in their own history.</p>
      {expanded && (relevant.length ? <ol className="space-y-3" aria-label="Workflow activity">{[...relevant].reverse().map((activity) => <ActivityItem key={activity.id} activity={activity} />)}</ol>
        : <p className="text-slate-600">No requests observed for this workflow yet.</p>)}
    </details>
  </section>;
}
