import type { Workplan } from "@/types";
import Link from "next/link";

export default function WorkplanPanel({ workplan }: { workplan: Workplan }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Joint Workplan</h2>
      <p className="mb-2 text-sm text-gray-600">Approved draft revision {workplan.proposal_revision} by demo reviewer {workplan.approved_by ?? "not recorded"}.
        {workplan.approved_at && ` ${new Date(workplan.approved_at).toLocaleString()}`}</p>
      <p className="mb-3 text-sm font-medium">Original project dates unchanged. All task end dates are exclusive.</p>
      <Link href={`/proposals?plan=${encodeURIComponent(workplan.coordination_plan_id)}&workplan=${encodeURIComponent(workplan.id)}`}
        className="mb-4 inline-block text-sm text-blue-700 underline">Permanent workplan link</Link>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
                <td className="py-2 pr-4 text-gray-600">{task.start_date}</td>
                <td className="py-2 pr-4 text-gray-600">{task.end_date}</td>
                <td className="py-2 pr-4 text-gray-600">{workplan.tasks.find((item) => item.id === task.dependency)?.task ?? task.dependency ?? "—"}</td>
                <td className="py-2">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                    {task.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {workplan.tasks.some((task) => task.notes) && <ul className="mt-3 space-y-1 text-sm">{workplan.tasks.filter((task) => task.notes).map((task) => <li key={task.id}><strong>{task.task}:</strong> {task.notes}</li>)}</ul>}
      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-amber-800">{workplan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
    </div>
  );
}
