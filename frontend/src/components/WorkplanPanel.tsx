import type { Workplan } from "@/types";
import Link from "next/link";
import { Warnings, StatusBadge, displayDate } from "./ui";

export default function WorkplanPanel({ workplan }: { workplan: Workplan }) {
  return (
    <section className="panel" aria-label="Approved workplan document">
      <h2 className="text-lg font-semibold mb-4">Joint Workplan</h2>
      <p className="mb-2 text-sm text-gray-600">
        Approved draft revision {workplan.proposal_revision} by demo reviewer{" "}
        {workplan.approved_by ?? "not recorded"}.
        {workplan.approved_at && ` ${new Date(workplan.approved_at).toLocaleString()}`}
      </p>
      <p className="mb-3 text-sm font-medium">
        Original project dates unchanged. All task end dates are exclusive.
      </p>
      <Link
        href={`/workplans/${encodeURIComponent(workplan.id)}`}
        className="mb-4 inline-block text-sm text-blue-700 underline"
      >
        Permanent workplan link
      </Link>

      <div
        className="table-region desktop-records"
        role="region"
        aria-label="Workplan tasks"
        tabIndex={0}
      >
        <table className="data-table">
          <thead>
            <tr className="border-b text-gray-500 text-xs">
              <th className="text-left py-2 pr-4">Task</th>
              <th className="text-left py-2 pr-4">Organization</th>
              <th className="text-left py-2 pr-4">Start</th>
              <th className="text-left py-2 pr-4">End</th>
              <th className="text-left py-2 pr-4">Depends on</th>
              <th className="text-left py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {workplan.tasks.map((task) => (
              <tr key={task.id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{task.task}</td>
                <td className="py-2 pr-4 text-gray-600">{task.organization}</td>
                <td className="py-2 pr-4 text-gray-600">{displayDate(task.start_date)}</td>
                <td className="py-2 pr-4 text-gray-600">{displayDate(task.end_date)}</td>
                <td className="py-2 pr-4 text-gray-600">
                  {workplan.tasks.find((item) => item.id === task.dependency)?.task ??
                    task.dependency ??
                    "—"}
                </td>
                <td className="py-2">
                  <StatusBadge status={task.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="record-list mobile-records">
        {workplan.tasks.map((task) => (
          <li key={task.id}>
            <div className="flex justify-between gap-3">
              <strong className="text-sm">{task.task}</strong>
              <StatusBadge status={task.status} />
            </div>
            <p className="record-meta">{task.organization}</p>
            <p className="record-meta">
              {displayDate(task.start_date)} – {displayDate(task.end_date)} (end exclusive)
            </p>
            <p className="record-meta">
              Depends on:{" "}
              {workplan.tasks.find((item) => item.id === task.dependency)?.task ??
                task.dependency ??
                "No dependency"}
            </p>
            {task.notes && <p className="text-sm mt-2">{task.notes}</p>}
          </li>
        ))}
      </ul>
      {workplan.tasks.some((task) => task.notes) && (
        <ul className="mt-3 space-y-1 text-sm desktop-records">
          {workplan.tasks
            .filter((task) => task.notes)
            .map((task) => (
              <li key={task.id}>
                <strong>{task.task}:</strong> {task.notes}
              </li>
            ))}
        </ul>
      )}
      <Warnings warnings={workplan.warnings} title="Workplan limitations" />
    </section>
  );
}
