"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ConflictResult, CoordinationResult, ProjectMapData, RiskResult, SavedProject } from "@/types";
import ConflictPanel from "./ConflictPanel";
import RiskPanel from "./RiskPanel";
import RecommendationsPanel from "./RecommendationsPanel";
import WhatIfSimulator from "./WhatIfSimulator";
import ProjectMap from "./ProjectMap";
import ScheduleTimeline from "./ScheduleTimeline";

type Resource = "project" | "map" | "conflicts" | "risk";
const message = (error: unknown) => error instanceof Error ? error.message : "Request failed. Please retry.";

export default function ProjectWorkspace({ id }: { id: string }) {
  const [project, setProject] = useState<SavedProject | null>(null);
  const [mapData, setMapData] = useState<ProjectMapData | null>(null);
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Resource, string>>>({});
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [coordination, setCoordination] = useState<CoordinationResult | null>(null);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [coordBusy, setCoordBusy] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  const fetchResource = useCallback(async (key: Resource) => {
    if (key === "project") return { key, value: await api.getProject(id) } as const;
    if (key === "map") return { key, value: await api.projectMap(id) } as const;
    if (key === "conflicts") return { key, value: await api.analyzeConflicts(id) } as const;
    return { key, value: await api.predictRisk(id) } as const;
  }, [id]);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchResource>>) => {
    if (result.key === "project") setProject(result.value);
    if (result.key === "map") setMapData(result.value);
    if (result.key === "conflicts") setConflicts(result.value);
    if (result.key === "risk") setRisk(result.value);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setBusy(true); setErrors({});
      async function one(key: Resource) {
        try { const result = await fetchResource(key); if (active) apply(result); }
        catch (error) { if (active) setErrors((previous) => ({ ...previous, [key]: message(error) })); }
      }
      await Promise.all([one("project"), one("map"), (async () => { await one("conflicts"); if (active) await one("risk"); })()]);
      if (active) setBusy(false);
    }
    void load();
    return () => { active = false; };
  }, [fetchResource, refresh, apply]);

  async function retry(key: Resource) {
    setBusy(true);
    try { apply(await fetchResource(key)); setErrors((previous) => ({ ...previous, [key]: undefined })); }
    catch (error) { setErrors((previous) => ({ ...previous, [key]: message(error) })); }
    finally { setBusy(false); }
  }
  async function coordinate(useAi: boolean) {
    setCoordBusy(true); setCoordError(null);
    try { setCoordination(await api.coordinate(id, useAi)); }
    catch (error) { setCoordError(message(error)); }
    finally { setCoordBusy(false); }
  }
  const overlappingIds = useMemo(() => conflicts?.conflicts.filter((item) => item.temporal_overlap).map((item) => item.project_b_id) ?? [], [conflicts]);
  const timelines = useMemo(() => mapData?.features.filter((item) => item.properties.start_date && item.properties.end_date).map((item) => ({ id: item.id,
    label: `${item.properties.role === "base" ? "Selected project" : item.properties.organization}: ${item.properties.road_name}`,
    start: item.properties.start_date!, end: item.properties.end_date! })) ?? [], [mapData]);

  return <main id="main-content" className="workspace space-y-6">
    <header className="flex flex-wrap justify-between items-start gap-4">
      <div><p className="eyebrow">Project workspace</p><h1 className="text-3xl font-bold tracking-tight">{project?.road_name ?? "Project analysis"}</h1>
        <p className="mt-2 text-slate-600">Review locations, compare schedules, and coordinate with the responsible teams.</p></div>
      <button className="btn-secondary" disabled={busy} onClick={() => { setCoordination(null); setRefresh((value) => value + 1); }}>{busy ? "Refreshing…" : "Refresh analysis"}</button>
    </header>
    {busy && <p role="status" className="text-sm text-slate-600">Loading available project data and analysis…</p>}
    {Object.entries(errors).map(([key, error]) => error && <div role="alert" key={key} className="notice-error">
      <strong>{key[0].toUpperCase() + key.slice(1)}:</strong> {error} <button disabled={busy} className="underline" onClick={() => void retry(key as Resource)}>Retry {key}</button>
    </div>)}
    {project && <section className="panel" aria-label="Saved project details">
      <div className="flex flex-wrap gap-2 mb-3"><span className="badge">{project.project_type.replaceAll("_", " ")}</span><span className="badge">{project.status}</span><span className="badge">{project.road_segment_id ? "User-selected road reference" : "Unmapped project"}</span></div>
      <h2 className="font-semibold text-lg">{project.organization}</h2><p className="text-slate-600 mt-1 break-words">{project.description}</p>
      <p className="mt-3 text-sm">Original schedule: <strong>{project.start_date} → {project.end_date}</strong> (end exclusive, {project.duration_days} days)</p>
      <Link href={`/proposals?project=${encodeURIComponent(id)}`} className="mt-3 inline-block text-sm text-blue-700 underline">Saved proposals for this project</Link>
    </section>}
    {mapData && <section className="panel" aria-label="Location and candidate projects">
      <div className="mb-4"><h2 className="text-xl font-semibold">Location and nearby activity</h2><p className="text-sm text-slate-600">500 m analysis radius when geometry is available. Location basis: {mapData.location_basis === "geometry" ? "recorded geometry" : "exact road name"}.</p></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ProjectMap data={mapData} selectedId={selected} onSelect={setSelected} overlappingIds={overlappingIds} />
        <div className="min-w-0"><h3 className="font-semibold mb-2">Project list</h3><p className="text-xs text-slate-500 mb-3">Select a row to highlight its geometry. All actions are available from this list.</p>
          <ul className="space-y-2 max-h-96 overflow-y-auto">{mapData.features.map((item) => <li key={item.id}>
            <button type="button" aria-pressed={selected === item.id} className={`w-full text-left rounded-lg border p-3 text-sm ${selected === item.id ? "border-violet-600 bg-violet-50" : "border-slate-200"}`} onClick={() => setSelected(item.id)}>
              <strong className="block break-words">{item.properties.role === "base" ? "Selected project" : item.properties.organization} · {item.properties.road_name}</strong>
              <span>{item.properties.start_date} → {item.properties.end_date}</span>
              <span className="block text-xs text-slate-600">{item.geometry ? "Recorded road geometry" : "Unmapped — location unverified"}{overlappingIds.includes(item.id) ? " · Overlapping dates" : ""}</span>
            </button>
            {item.id !== id && <Link className="text-xs text-blue-700 underline" href={`/projects/${encodeURIComponent(item.id)}`}>Open project workspace</Link>}
          </li>)}</ul>
          {mapData.total === 1 && <p className="mt-3 text-sm text-slate-600">No candidate projects found in the available data. This does not establish that work is safe to proceed.</p>}
        </div>
      </div>
      <div className="mt-4 space-y-1 text-sm text-amber-800">{mapData.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
      <div className="mt-5 border-t pt-5"><ScheduleTimeline items={timelines} /></div>
    </section>}
    <div className="grid gap-5 lg:grid-cols-2">{conflicts && <ConflictPanel result={conflicts} />}{risk && <RiskPanel result={risk} />}</div>
    {project && <section className="panel space-y-4" aria-label="Coordination actions">
      <h2 className="text-xl font-semibold">Find a workable schedule</h2>
      <p className="text-sm text-slate-600">Review deterministic templates locally. Optional AI explanations send aggregate counts, overlap duration, location basis and the baseline experimental indicator to the configured provider.</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={coordBusy || busy} className="btn-primary" onClick={() => void coordinate(false)}>{coordBusy ? "Preparing options…" : "Review coordination options"}</button>
        <button disabled={coordBusy || busy} className="btn-secondary" onClick={() => void coordinate(true)}>Request AI explanation</button>
        <button className="btn-secondary" onClick={() => setShowSimulator((value) => !value)}>Try a schedule change</button>
      </div>
      {coordError && <p role="alert" className="text-red-700">{coordError}</p>}
    </section>}
    {showSimulator && project && <WhatIfSimulator projectId={id} initialStartDate={project.start_date} initialEndDate={project.end_date} organization={project.organization} projectType={project.project_type} onBack={() => setShowSimulator(false)} />}
    {coordination && <RecommendationsPanel result={coordination} />}
  </main>;
}
