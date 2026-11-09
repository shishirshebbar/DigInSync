"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { DraftTask, OptionKey } from "@/types";
import { useRequestGuard } from "@/lib/use-request-guard";

export default function PrepareProposalButton({
  projectId,
  optionKey,
  tasks = [],
  label = "Prepare proposal",
}: {
  projectId: string;
  optionKey: OptionKey;
  tasks?: DraftTask[];
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beginRequest = useRequestGuard();

  async function prepare() {
    const current = beginRequest();
    setLoading(true);
    setError(null);
    try {
      const proposal = await api.createProposal(projectId, optionKey, tasks);
      if (current()) router.push(`/proposals/${encodeURIComponent(proposal.id)}`);
    } catch (err: unknown) {
      if (current()) {
        setError(err instanceof Error ? err.message : "Could not save the proposal.");
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={loading}
        onClick={() => void prepare()}
        className="btn-primary"
      >
        {loading ? "Saving draft…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
