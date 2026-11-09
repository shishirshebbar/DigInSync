import type { DraftTask, ProposalContent } from "@/types";

export type TaskErrors = Record<string, Partial<Record<keyof DraftTask, string>>>;
export function validateProposal(content: ProposalContent): TaskErrors {
  const errors: TaskErrors = {};
  const byId = new Map(content.tasks.map((task) => [task.id, task]));
  for (const task of content.tasks) {
    const error: TaskErrors[string] = {};
    if (!task.task.trim()) error.task = "Task name is required.";
    if (!task.organization.trim()) error.organization = "Responsible organization is required.";
    if (!task.start_date) error.start_date = "Proposed start is required.";
    if (!task.end_date) error.end_date = "Proposed end is required.";
    if (task.start_date && task.end_date && task.end_date <= task.start_date)
      error.end_date = "End date must be after start date.";
    if (task.dependency) {
      const parent = byId.get(task.dependency);
      if (!parent) error.dependency = "Select a task in this proposal.";
      else if (parent.end_date > task.start_date)
        error.dependency = "The dependency must finish before this task starts.";
      const seen = new Set([task.id]);
      let current: DraftTask | undefined = task;
      while (current?.dependency) {
        if (seen.has(current.dependency)) {
          error.dependency = "Task dependencies cannot form a cycle.";
          break;
        }
        seen.add(current.dependency);
        current = byId.get(current.dependency);
      }
    }
    if (Object.keys(error).length) errors[task.id] = error;
  }
  return errors;
}
