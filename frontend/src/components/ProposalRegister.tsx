"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api";
import type { ProposalSummary } from "@/types";
import { EmptyState, Notice, PageHeader, Panel, StatusBadge } from "./ui";

export default function ProposalRegister({
  projectId,
  embedded = false,
}: {
  projectId?: string;
  embedded?: boolean;
}) {
  const [plans, setPlans] = useState<ProposalSummary[] | null>(null);
  const statusId = useId();
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .listProposals(projectId)
      .then((value) => {
        if (active) {
          setPlans(value);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setError(failure instanceof Error ? failure.message : "Unable to load proposals.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, refresh]);
  const filtered = plans?.filter((plan) => status === "ALL" || plan.status === status);
  const content = (
    <>
      {!embedded && (
        <PageHeader
          title="Proposals"
          description={
            projectId
              ? "Saved coordination proposals for the selected project."
              : "Review drafts, recorded decisions, and the resulting coordination workplans."
          }
        />
      )}
      <Panel
        title="Saved proposals"
        description="Up to 100 recent proposals. Status filters apply to these returned records."
        actions={
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setRefresh((value) => value + 1);
            }}
          >
            Refresh list
          </button>
        }
      >
        <div className="flex flex-wrap gap-4 items-end mb-5">
          <div>
            <label className="field-label" htmlFor={statusId}>
              Status
            </label>
            <select
              id={statusId}
              className="input mt-2"
              disabled={busy}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {[
                "ALL",
                "DRAFT",
                "APPROVED",
                "REJECTED",
                "LEGACY",
                ...new Set(plans?.map((plan) => plan.status)),
              ]
                .filter((value, index, array) => array.indexOf(value) === index)
                .map((value) => (
                  <option key={value} value={value}>
                    {value === "ALL" ? "All statuses" : value.toLowerCase()}
                  </option>
                ))}
            </select>
          </div>
          {projectId && !embedded && (
            <Link className="btn-quiet" href="/proposals">
              Show all projects
            </Link>
          )}
        </div>
        {busy && (
          <p role="status" className="text-sm muted">
            Loading proposals…
          </p>
        )}
        {error && (
          <Notice tone="error" alert>
            {error} Previously loaded records may be out of date.
          </Notice>
        )}
        {filtered?.length === 0 && (
          <EmptyState
            title={plans?.length ? "No proposals with this status" : "No saved proposals yet"}
            action={
              <Link
                className="btn-secondary"
                href={
                  projectId
                    ? `/projects/${encodeURIComponent(projectId)}?view=coordination`
                    : "/projects"
                }
              >
                Review project coordination
              </Link>
            }
          >
            Prepare a proposal from a project’s coordination options or schedule comparison.
          </EmptyState>
        )}
        {!!filtered?.length && (
          <>
            <div
              className="table-region desktop-records"
              role="region"
              aria-label="Saved proposals table"
              tabIndex={0}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Coordination proposal</th>
                    <th scope="col">Status</th>
                    <th scope="col">Revision</th>
                    <th scope="col">Created</th>
                    <th scope="col">Project</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <Link href={`/proposals/${encodeURIComponent(plan.id)}`}>
                          {plan.option_name}
                        </Link>
                        <small>Proposal {plan.id.slice(0, 8)}</small>
                      </td>
                      <td>
                        <StatusBadge status={plan.status} />
                      </td>
                      <td>{plan.revision}</td>
                      <td>{new Date(plan.created_at).toLocaleDateString("en-IN")}</td>
                      <td>
                        <Link href={`/projects/${encodeURIComponent(plan.project_id)}`}>
                          Open analysis
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="record-list mobile-records">
              {filtered.map((plan) => (
                <li key={plan.id}>
                  <div className="flex justify-between gap-3">
                    <Link
                      className="record-title"
                      href={`/proposals/${encodeURIComponent(plan.id)}`}
                    >
                      {plan.option_name}
                    </Link>
                    <StatusBadge status={plan.status} />
                  </div>
                  <p className="record-meta">
                    Revision {plan.revision} ·{" "}
                    {new Date(plan.created_at).toLocaleDateString("en-IN")}
                  </p>
                  <Link
                    className="text-link inline-block mt-2"
                    href={`/projects/${encodeURIComponent(plan.project_id)}`}
                  >
                    Open project analysis
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </>
  );
  return embedded ? (
    <div className="space-y-6">{content}</div>
  ) : (
    <main id="main-content" className="workspace space-y-6">
      {content}
    </main>
  );
}
