import { redirect } from "next/navigation";
import { Suspense } from "react";
import ProposalRegister from "@/components/ProposalRegister";
export const metadata = { title: "Proposals | DigInSync" };
type Props = { searchParams: Promise<{ plan?: string; project?: string; workplan?: string }> };
async function Content({ searchParams }: Props) {
  const params = await searchParams;
  if (params.workplan) redirect(`/workplans/${encodeURIComponent(params.workplan)}`);
  if (params.plan) redirect(`/proposals/${encodeURIComponent(params.plan)}`);
  return <ProposalRegister key={params.project ?? "all"} projectId={params.project} />;
}
export default function ProposalsPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="workspace" role="status">
          Loading proposals…
        </main>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
