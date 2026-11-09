"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ImpactMetrics, ProjectCatalog, ProposalSummary } from "@/types";
import { EmptyState, Icon, Notice, PageHeader, Panel, StatusBadge, displayDate } from "./ui";
import WorkflowTracker from "./WorkflowTracker";

export default function OperationsOverview() {
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);
  const [projects, setProjects] = useState<ProjectCatalog | null>(null);
  const [proposals, setProposals] = useState<ProposalSummary[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrors({});
      const fail = (key: string, error: unknown) => {
        if (active)
          setErrors((previous) => ({
            ...previous,
            [key]: error instanceof Error ? error.message : "Unable to load records.",
          }));
      };
      await Promise.all([
        api
          .getImpact()
          .then((value) => {
            if (active) setMetrics(value);
          })
          .catch((error) => fail("Recorded totals", error)),
        api
          .catalog()
          .then((value) => {
            if (active) setProjects(value);
          })
          .catch((error) => fail("Projects", error)),
        api
          .listProposals()
          .then((value) => {
            if (active) setProposals(value);
          })
          .catch((error) => fail("Proposals", error)),
      ]);
      if (active) setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [refresh]);
  return (
    <main id="main-content" className="workspace space-y-6">
      <PageHeader
        title="Coordination overview"
        eyebrow="Bengaluru · Operations"
        description="Bring infrastructure teams onto a shared plan. Start a project or continue reviewing saved work."
        actions={
          <button
            className="btn-secondary"
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            {loading ? "Refreshing…" : "Refresh overview"}
          </button>
        }
      />
      <div className="overview-intro">
        <div>
          <span className="eyebrow">PLAN WITH CONTEXT</span>
          <h2>Coordinate the work before it starts.</h2>
          <p>
            Review candidate projects, compare schedules, and prepare a workplan for the responsible
            teams.
          </p>
        </div>
        <Link className="btn-primary" href="/projects/new">
          Create a project
          <Icon name="arrow" size={16} />
        </Link>
      </div>
      <WorkflowTracker mode="dashboard" />
      {Object.entries(errors).map(([key, error]) => (
        <Notice key={key} tone="error" alert>
          <strong>{key}:</strong> {error}{" "}
          <button className="text-link" onClick={() => setRefresh((value) => value + 1)}>
            Retry overview
          </button>
        </Notice>
      ))}
      {(metrics || projects || proposals) && (loading || Object.keys(errors).length > 0) && (
        <p className="text-xs muted">
          Previously loaded results remain visible. Sections refreshing or reporting errors may be
          out of date.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          title="Project register"
          description="Recently saved projects and their original schedules."
          actions={
            <Link className="text-link" href="/projects">
              View all projects
            </Link>
          }
        >
          {!projects && !errors.Projects && (
            <p role="status" className="text-sm muted">
              Loading projects…
            </p>
          )}
          {projects?.items.length === 0 && (
            <EmptyState
              title="Start your first project"
              action={
                <Link href="/projects/new" className="btn-primary">
                  New project
                </Link>
              }
            >
              Add the work, location, and schedule to begin reviewing coordination opportunities.
            </EmptyState>
          )}
          <ul className="record-list">
            {projects?.items.slice(0, 5).map((project) => (
              <li key={project.id}>
                <div className="flex justify-between gap-3">
                  <Link
                    className="record-title"
                    href={`/projects/${encodeURIComponent(project.id)}`}
                  >
                    {project.road_name ?? "Unknown road"}
                  </Link>
                  <StatusBadge status={project.status} />
                </div>
                <p className="record-meta">
                  {project.organization} · {project.project_type.replaceAll("_", " ")}
                </p>
                <p className="record-meta">
                  {displayDate(project.start_date)} – {displayDate(project.end_date)}{" "}
                  <span className="text-xs">(end exclusive)</span>
                </p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="Recent proposals"
          description="Continue editing or review a recorded decision."
          actions={
            <Link className="text-link" href="/proposals">
              View all proposals
            </Link>
          }
        >
          {!proposals && !errors.Proposals && (
            <p role="status" className="text-sm muted">
              Loading proposals…
            </p>
          )}
          {proposals?.length === 0 && (
            <EmptyState title="No proposals yet">
              Open a project and review coordination options to prepare a draft.
            </EmptyState>
          )}
          <ul className="record-list">
            {proposals?.slice(0, 5).map((plan) => (
              <li key={plan.id}>
                <div className="flex justify-between gap-3">
                  <Link className="record-title" href={`/proposals/${encodeURIComponent(plan.id)}`}>
                    {plan.option_name}
                  </Link>
                  <StatusBadge status={plan.status} />
                </div>
                <p className="record-meta">
                  Revision {plan.revision} · {new Date(plan.created_at).toLocaleDateString("en-IN")}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div>
        <div className="flex justify-between items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold">Recorded workflow totals</h2>
          <Link className="text-link" href="/data-context">
            Explore data coverage
          </Link>
        </div>
        {metrics && (
          <div className="metrics-row">
            {[
              [
                "Saved projects",
                metrics.projects_total,
                `${metrics.unmapped_projects} without a road reference`,
              ],
              ["Mapped projects", metrics.mapped_projects, "User-selected location references"],
              [
                "Saved workplans",
                metrics.workplans_generated,
                `${metrics.task_count} saved tasks; includes legacy headers`,
              ],
              [
                "Recorded candidate pairs",
                metrics.conflicts_detected,
                `${metrics.high_severity_conflicts} recorded as high severity`,
              ],
            ].map(([label, value, detail]) => (
              <section className="metric" key={label}>
                <h2>{label}</h2>
                <p className="metric-value">{value}</p>
                <p>{detail}</p>
              </section>
            ))}
          </div>
        )}
        <p className="text-xs muted mt-3">
          Stored records describe this prototype database. Candidate analyses may be stale; totals
          do not measure citywide conflicts or civic savings.
        </p>
      </div>
      <p className="text-xs muted">
        Local demo · Coordination decisions do not authorize construction. Original project
        schedules are preserved.
      </p>
    </main>
  );
}
