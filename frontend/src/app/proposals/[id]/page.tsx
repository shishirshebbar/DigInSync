import { Suspense } from "react";
import ProposalWorkspace from "@/components/ProposalWorkspace";
export const metadata = { title: "Proposal review | DigInSync" };
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalWorkspace key={id} id={id} />;
}
export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="workspace" role="status">
          Loading proposal…
        </main>
      }
    >
      <Content params={params} />
    </Suspense>
  );
}
