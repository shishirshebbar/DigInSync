import type { Workplan } from "@/types";

export default function WorkplanPanel({ workplan }: { workplan: Workplan }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Joint Workplan</h2>

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
                <td className="py-2 pr-4 text-gray-400">{task.dependency ?? "—"}</td>
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
    </div>
  );
}
