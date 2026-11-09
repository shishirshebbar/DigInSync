"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProjectInputForm from "@/components/ProjectInputForm";
import ProjectConfirmation from "@/components/ProjectConfirmation";
import type { ExtractedProject } from "@/types";
import WorkflowTracker from "@/components/WorkflowTracker";

export default function Home() {
  const router = useRouter();
  const [project, setProject] = useState<ExtractedProject | null>(null);
  return <main id="main-content" className="workspace space-y-6">
    <header className="max-w-2xl space-y-3"><p className="eyebrow">Plan before the road is dug</p>
      <h1 className="text-4xl font-bold tracking-tight text-slate-900">One plan.<br />Coordinated infrastructure work.</h1>
      <p className="text-slate-600">Describe a Bengaluru project, review nearby activity, and prepare a workplan with the responsible teams.</p>
    </header>
    <ol aria-label="Project workflow" className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-slate-600">
      {["1. Enter project", "2. Review location", "3. Compare schedules", "4. Review proposal"].map((step) => <li className="rounded-lg border bg-white p-3" key={step}>{step}</li>)}
    </ol>
    <WorkflowTracker mode="entry" detailsReady={project !== null} />
    {project ? <ProjectConfirmation project={project} onBack={() => setProject(null)} onConfirmed={(_, id) => router.push(`/projects/${encodeURIComponent(id)}`)} />
      : <ProjectInputForm onExtracted={setProject} />}
    <p className="text-xs text-slate-500">Local demo. Locations depend on imported data and user confirmation. Risk indicators are experimental; approvals do not authorize construction.</p>
  </main>;
}
