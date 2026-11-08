import { Suspense } from "react";
import ProposalWorkspace from "@/components/ProposalWorkspace";

export default function ProposalsPage() {
  return <Suspense fallback={<p className="p-8" role="status">Loading saved proposals…</p>}>
    <ProposalWorkspace />
  </Suspense>;
}
