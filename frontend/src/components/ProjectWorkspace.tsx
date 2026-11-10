"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  ConflictResult,
  CoordinationResult,
  ProjectMapData,
  RiskResult,
  SavedProject,
} from "@/types";
import ConflictPanel from "./ConflictPanel";
import RiskPanel from "./RiskPanel";
import RecommendationsPanel from "./RecommendationsPanel";
import WhatIfSimulator from "./WhatIfSimulator";
import ProjectMap from "./ProjectMap";
import ScheduleTimeline from "./ScheduleTimeline";
import WorkflowTracker from "./WorkflowTracker";
import { useRequestGuard } from "@/lib/use-request-guard";
import { useSearchParams } from "next/navigation";
import { useMemoryState } from "@/lib/drafts";
import { PageHeader, SectionNav, StatusBadge, Warnings, Notice, displayDate } from "./ui";
import ProposalRegister from "./ProposalRegister";

type Resource = "project" | "map" | "conflicts" | "risk";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Request failed. Please retry.";

export default function ProjectWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<SavedProject | null>(null);
  const [mapData, setMapData] = useState<ProjectMapData | null>(null);
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Resource, string>>>({});
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [, setSimulationRevision] = useMemoryState(`simulation:${id}:revision`, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [coordination, setCoordination] = useMemoryState<CoordinationResult | null>(
    `coordination:${id}`,
    null,
  );
  const [coordError, setCoordError] = useState<string | null>(null);
  const [coordBusy, setCoordBusy] = useState(false);
  const params = useSearchParams();
  const requestedView = params.get("view") ?? "analysis";
  const view = ["analysis", "schedule", "coordination", "proposals"].includes(requestedView)
    ? requestedView
    : "analysis";
  const beginRetry = useRequestGuard();
  const beginCoordination = useRequestGuard();
  useEffect(() => {
    if (project) document.title = `${project.road_name ?? "Project"} | DigInSync`;
  }, [project]);

  const fetchResource = useCallback(
    async (key: Resource) => {
      if (key === "project") return { key, value: await api.getProject(id) } as const;
      if (key === "map") return { key, value: await api.projectMap(id) } as const;
      if (key === "conflicts") return { key, value: await api.analyzeConflicts(id) } as const;
      return { key, value: await api.predictRisk(id) } as const;
    },
    [id],
  );

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchResource>>) => {
    if (result.key === "project") setProject(result.value);
    if (result.key === "map") setMapData(result.value);
    if (result.key === "conflicts") setConflicts(result.value);
    if (result.key === "risk") setRisk(result.value);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setSimulationRevision((revision) => revision + 1);
      setBusy(true);
      setErrors({});
      async function one(key: Resource) {
        try {
          const result = await fetchResource(key);
          if (active) apply(result);
        } catch (error) {
          if (active) setErrors((previous) => ({ ...previous, [key]: message(error) }));
        }
      }
      await Promise.all([
        one("project"),
        one("map"),
        (async () => {
          await one("conflicts");
          if (active) await one("risk");
        })(),
      ]);
      if (active) setBusy(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [fetchResource, refresh, apply, setSimulationRevision]);

  async function retry(key: Resource) {
    const current = beginRetry();
    setSimulationRevision((revision) => revision + 1);
    setBusy(true);
    try {
      const response = await fetchResource(key);
      if (current()) {
        apply(response);
        setErrors((previous) => ({ ...previous, [key]: undefined }));
      }
    } catch (error) {
      if (current()) setErrors((previous) => ({ ...previous, [key]: message(error) }));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function coordinate(useAi: boolean) {
    const current = beginCoordination();
    setSimulationRevision((revision) => revision + 1);
    setCoordBusy(true);
    setCoordError(null);
    try {
      const response = await api.coordinate(id, useAi);
      if (current()) setCoordination(response);
    } catch (error) {
      if (current()) setCoordError(message(error));
    } finally {
      if (current()) setCoordBusy(false);
    }
  }
  const overlappingIds = useMemo(
    () =>
      conflicts?.conflicts
        .filter((item) => item.temporal_overlap)
        .map((item) => item.project_b_id) ?? [],
    [conflicts],
  );
  const timelines = useMemo(
    () =>
      mapData?.features
        .filter((item) => item.properties.start_date && item.properties.end_date)
        .map((item) => ({
          id: item.id,
          label: `${item.properties.role === "base" ? "Selected project" : item.properties.organization}: ${item.properties.road_name}`,
          start: item.properties.start_date!,
          end: item.properties.end_date!,
        })) ?? [],
    [mapData],
  );

  return (
    <main id="main-content" className="workspace space-y-6">
      <PageHeader
        title={project?.road_name ?? "Project analysis"}
        back={{ href: "/projects", label: "Projects" }}
        description={
          project
            ? `${project.organization} · ${project.project_type.replaceAll("_", " ")}`
            : "Review project evidence and prepare a coordinated plan."
        }
        actions={
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setCoordination(null);
              setRefresh((value) => value + 1);
            }}
          >
            {busy ? "Refreshing…" : "Refresh analysis"}
          </button>
        }
      />
      <WorkflowTracker mode="project" projectId={id} />
      {busy && (conflicts || risk || mapData) && (
        <p className="text-sm text-amber-900">
          Refreshing analysis. Previously loaded results remain visible until replaced.
        </p>
      )}
      {!busy && Object.values(errors).some(Boolean) && (conflicts || risk || mapData) && (
        <p className="text-sm text-amber-900">
          Some results could not be refreshed. Previously loaded panels may be out of date; review
          the operation details and retry the affected request.
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-slate-600">
          Loading available project data and analysis…
        </p>
      )}
      {Object.entries(errors).map(
        ([key, error]) =>
          error && (
            <div role="alert" key={key} className="notice-error">
              <strong>{key[0].toUpperCase() + key.slice(1)}:</strong> {error}{" "}
              <button
                disabled={busy}
                className="underline"
                onClick={() => void retry(key as Resource)}
              >
                Retry {key}
              </button>
            </div>
          ),
      )}
      {project && (
        <section className="panel" aria-label="Saved project details">
          <div className="flex flex-wrap gap-2 mb-3">
            <StatusBadge status={project.status} />
            <span className="badge">
              {project.road_segment_id ? "User-selected road reference" : "Unmapped project"}
            </span>
          </div>
          <p className="text-sm muted break-words">{project.description}</p>
          <p className="mt-3 text-sm">
            Original schedule:{" "}
            <strong>
              {displayDate(project.start_date)} – {displayDate(project.end_date)}
            </strong>{" "}
            <span className="muted">(end exclusive, {project.duration_days} days)</span>
          </p>
        </section>
      )}
      <SectionNav
        label="Project sections"
        items={[
          ["analysis", "Analysis"],
          ["schedule", "Schedule comparison"],
          ["coordination", "Coordination"],
          ["proposals", "Proposals"],
        ].map(([key, label]) => ({
          label,
          href: `/projects/${encodeURIComponent(id)}?view=${key}`,
          active: view === key,
        }))}
      />
      <div hidden={view !== "analysis"} className="space-y-6">
        {conflicts && (
          <div className="analysis-summary">
            <div>
              <span className="text-xs muted">Candidate projects</span>
              <strong>{conflicts.conflict_count}</strong>
            </div>
            <div>
              <span className="text-xs muted">Overlapping schedules</span>
              <strong>{overlappingIds.length}</strong>
            </div>
            <div>
              <span className="text-xs muted">Location basis</span>
              <strong className="text-sm">
                {conflicts.location_basis === "geometry" ? "Recorded geometry" : "Road-name match"}
              </strong>
            </div>
          </div>
        )}
        {mapData && (
          <section className="panel" aria-label="Location and candidate projects">
            <div className="panel-header">
              <div>
                <h2>Location and candidate projects</h2>
                <p>
                  500 m analysis radius when geometry is available. Location basis:{" "}
                  {mapData.location_basis === "geometry" ? "recorded geometry" : "exact road name"}.
                </p>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <ProjectMap
                data={mapData}
                selectedId={selected}
                onSelect={setSelected}
                overlappingIds={overlappingIds}
              />
              <div className="min-w-0">
                <h3 className="font-semibold mb-2">Project list</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Select a row to highlight its geometry. All actions are available from this list.
                </p>
                <ul className="space-y-2 max-h-96 overflow-y-auto">
                  {mapData.features.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-pressed={selected === item.id}
                        className={`w-full text-left rounded-lg border p-3 text-sm ${selected === item.id ? "border-violet-600 bg-violet-50" : "border-slate-200"}`}
                        onClick={() => setSelected(item.id)}
                      >
                        <strong className="block break-words">
                          {item.properties.role === "base"
                            ? "Selected project"
                            : item.properties.organization}{" "}
                          · {item.properties.road_name}
                        </strong>
                        <span>
                          {item.properties.start_date && displayDate(item.properties.start_date)} –{" "}
                          {item.properties.end_date && displayDate(item.properties.end_date)}
                        </span>
                        <span className="block text-xs text-slate-600">
                          {item.geometry
                            ? "Road geometry available"
                            : "Road name only"}
                          {overlappingIds.includes(item.id) ? " · Overlapping dates" : ""}
                        </span>
                      </button>
                      {item.id !== id && (
                        <Link
                          className="text-xs text-blue-700 underline"
                          href={`/projects/${encodeURIComponent(item.id)}`}
                        >
                          Open project workspace
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {mapData.total === 1 && (
                  <p className="mt-3 text-sm text-slate-600">
                    No candidate projects found in the current dataset for this location.
                  </p>
                )}
              </div>
            </div>
            <Warnings warnings={mapData.warnings} />
            <div className="mt-5 border-t pt-5">
              <ScheduleTimeline items={timelines} />
            </div>
          </section>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {conflicts && <ConflictPanel result={conflicts} />}
          {risk && <RiskPanel result={risk} />}
        </div>
        {errors.conflicts && risk && (
          <p className="text-sm text-amber-900">
            Conflict analysis did not complete. The indicator may use previously stored candidate
            counts; retry conflicts and then refresh the indicator before relying on this analysis.
          </p>
        )}
        <div className="next-action">
          <div>
            <h2>Move from evidence to a plan</h2>
            <p>
              Compare proposed dates or review coordination templates with the responsible teams.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href={`/projects/${id}?view=schedule`}>
              Try a schedule change
            </Link>
            <Link className="btn-primary" href={`/projects/${id}?view=coordination`}>
              Review coordination options
            </Link>
          </div>
        </div>
      </div>
      <div hidden={view !== "coordination"} className="space-y-6">
        {project && (
          <section className="panel space-y-4" aria-label="Coordination actions">
            <h2 className="text-xl font-semibold">Find a workable schedule</h2>
            <p className="text-sm text-slate-600">
              Review deterministic templates locally. Optional AI explanations send aggregate
              counts, overlap duration, location basis and the baseline experimental indicator to
              the configured provider.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={coordBusy || busy}
                className="btn-primary"
                onClick={() => void coordinate(false)}
              >
                {coordBusy ? "Preparing options…" : "Review coordination options"}
              </button>
              <button
                disabled={coordBusy || busy}
                className="btn-secondary"
                onClick={() => void coordinate(true)}
              >
                Request AI explanation
              </button>
            </div>
            {coordError && (
              <p role="alert" className="text-red-700">
                {coordError}
              </p>
            )}
            {coordination && (coordBusy || coordError) && (
              <p className="text-sm text-amber-900">
                Previously prepared coordination options remain visible and may be out of date.
              </p>
            )}
          </section>
        )}
        {coordination && <RecommendationsPanel result={coordination} />}
      </div>
      <div hidden={view !== "schedule"}>
        {project && (
          <WhatIfSimulator
            projectId={id}
            initialStartDate={project.start_date}
            initialEndDate={project.end_date}
            organization={project.organization}
            projectType={project.project_type}
            analysisBusy={busy || coordBusy}
          />
        )}
      </div>
      {view === "proposals" && <ProposalRegister projectId={id} embedded />}
      {view !== "analysis" && !project && !busy && (
        <Notice tone="warning">
          Project details are unavailable. Retry the project request above to continue.
        </Notice>
      )}
    </main>
  );
}
