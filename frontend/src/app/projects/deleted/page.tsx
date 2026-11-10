import Link from "next/link";
export const metadata = { title: "Project deleted | DigInSync" };

export default function ProjectDeletedPage() {
  return (
    <main id="main-content" className="workspace space-y-6">
      <div className="panel text-center py-12">
        <h1 className="text-xl font-semibold mb-2">Project deleted</h1>
        <p className="text-sm muted mb-6">The project and all its associated data have been removed.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/projects" className="btn-primary">Back to projects</Link>
          <Link href="/projects/new" className="btn-secondary">New project</Link>
        </div>
      </div>
    </main>
  );
}
