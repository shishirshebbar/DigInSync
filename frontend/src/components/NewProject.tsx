"use client";
import { useRouter } from "next/navigation";
import ProjectConfirmation, { blankProject } from "./ProjectConfirmation";
import WorkflowTracker from "./WorkflowTracker";
import { PageHeader } from "./ui";
export default function NewProject() {
  const router = useRouter();
  return (
    <main id="main-content" className="workspace space-y-6">
      <PageHeader
        title="New project"
        back={{ href: "/projects", label: "Projects" }}
        description="Record the work, confirm its location and schedule, then review available coordination evidence."
      />
      <WorkflowTracker mode="entry" detailsReady />
      <div className="entry-layout">
        <ProjectConfirmation
          project={blankProject}
          onConfirmed={(_, id) => router.push(`/projects/${encodeURIComponent(id)}`)}
        />
        <aside className="entry-help">
          <h2>What happens next</h2>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Save the project</strong>
                <p>Your confirmed details become the original project record.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Review the evidence</strong>
                <p>
                  Inspect candidate projects, location coverage, and the experimental indicator.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Prepare a shared plan</strong>
                <p>Compare schedules and draft tasks for the responsible teams.</p>
              </div>
            </li>
          </ol>
          <p className="text-xs muted mt-6">
            A road segment is a reference, not a verified excavation extent. Missing data can limit
            the analysis.
          </p>
        </aside>
      </div>
    </main>
  );
}
