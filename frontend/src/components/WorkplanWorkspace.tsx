"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Workplan } from "@/types";
import { Notice, PageHeader } from "./ui";
import WorkplanPanel from "./WorkplanPanel";

export default function WorkplanWorkspace({ id }: { id: string }) {
  const [workplan, setWorkplan] = useState<Workplan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .getWorkplan(id)
      .then((value) => {
        if (active) {
          setWorkplan(value);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : "Workplan unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refresh]);
  return (
    <main id="main-content" className="workspace space-y-6">
      <PageHeader
        title="Approved coordination workplan"
        back={{
          href: workplan
            ? `/proposals/${encodeURIComponent(workplan.coordination_plan_id)}?view=review`
            : "/proposals",
          label: "Source proposal",
        }}
        description="A readable record of the saved tasks, responsibilities, and local coordination decision."
        actions={
          workplan && (
            <Link
              className="btn-secondary"
              href={`/projects/${encodeURIComponent(workplan.project_id)}`}
            >
              Open project analysis
            </Link>
          )
        }
      />
      {loading && (
        <p role="status" className="text-sm muted">
          Loading saved workplan…
        </p>
      )}
      {error && (
        <Notice tone="error" alert>
          {error} {workplan && "Previously loaded workplan may be out of date."}
          <button
            className="btn-secondary ml-3"
            onClick={() => {
              setLoading(true);
              setRefresh((value) => value + 1);
            }}
          >
            Retry workplan
          </button>
        </Notice>
      )}
      {workplan && <WorkplanPanel workplan={workplan} />}
    </main>
  );
}
