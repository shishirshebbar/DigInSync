import { Suspense } from "react";
import WorkplanWorkspace from "@/components/WorkplanWorkspace";
export const metadata = { title: "Workplan | DigInSync" };
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkplanWorkspace key={id} id={id} />;
}
export default function WorkplanPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="workspace" role="status">
          Loading workplan…
        </main>
      }
    >
      <Content params={params} />
    </Suspense>
  );
}
