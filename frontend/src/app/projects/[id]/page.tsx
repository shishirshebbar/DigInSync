import ProjectWorkspace from "@/components/ProjectWorkspace";
import { Suspense } from "react";

async function ProjectContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectWorkspace key={id} id={id} />;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<main id="main-content" className="workspace" role="status">Loading project workspace…</main>}><ProjectContent params={params} /></Suspense>;
}
