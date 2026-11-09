"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { DraftTask, OptionKey } from "@/types";

export default function PrepareProposalButton({ projectId, optionKey, tasks = [], label = "Prepare proposal" }: {
  projectId: string; optionKey: OptionKey; tasks?: DraftTask[]; label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function prepare() {
    setLoading(true);
    setError(null);
    try {
      const proposal = await api.createProposal(projectId, optionKey, tasks);
      router.push(`/proposals?plan=${encodeURIComponent(proposal.id)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the proposal.");
      setLoading(false);
    }
  }

  return <div className="mt-3">
    <button type="button" disabled={loading} onClick={() => void prepare()}
      className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">
      {loading ? "Saving draft…" : label}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
