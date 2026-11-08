"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ImpactMetrics, ProjectCatalog, ProposalSummary } from "@/types";

export default function Dashboard() {
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setErrors({});
      const report = (key: string, error: unknown) => { if (active) setErrors((previous) => ({ ...previous, [key]: error instanceof Error ? error.message : "Unable to load data." })); };
      await Promise.all([
        api.getImpact().then((value) => { if (active) setMetrics(value); }).catch((error) => report("Metrics", error)),
        api.catalog(query, offset).then((value) => { if (active) setCatalog(value); }).catch((error) => report("Projects", error)),
        api.listProposals().then((value) => { if (active) setProposals(value.slice(0, 10)); }).catch((error) => report("Proposals", error)),
      ]);
      if (active) setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [query, offset, refresh]);
  const statuses = Array.from(new Set(["DRAFT", "APPROVED", "REJECTED", "LEGACY", ...Object.keys(metrics?.proposal_status_counts ?? {})]));
  return <main id="main-content" className="workspace space-y-6">
    <header className="flex flex-wrap justify-between items-start gap-4"><div><p className="eyebrow">Coordination overview</p><h1 className="text-3xl font-bold tracking-tight">Project dashboard</h1><p className="mt-2 text-slate-600">Saved work, review progress, and location coverage.</p></div>
      <button className="btn-secondary" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh dashboard</button></header>
    {loading && <p role="status" className="text-sm text-slate-600">Loading dashboard…</p>}
    {Object.entries(errors).map(([key, error]) => <p key={key} role="alert" className="notice-error">{key}: {error} <button className="underline" onClick={() => setRefresh((value) => value + 1)}>Retry dashboard</button></p>)}
    {metrics && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Workflow totals">
        <Metric label="Saved projects" value={metrics.projects_total} />
        <Metric label="Mapped projects" value={metrics.mapped_projects} detail={`${metrics.unmapped_projects} unmapped`} />
        <Metric label="Saved workplans" value={metrics.workplans_generated} detail={`${metrics.task_count} saved tasks; includes legacy headers`} />
        <Metric label="Recorded candidate pairs" value={metrics.conflicts_detected} detail={`${metrics.high_severity_conflicts} recorded as high severity`} />
      </div>
      <section className="panel"><h2 className="text-xl font-semibold mb-4">Proposal review progress</h2><div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statuses.map((status) => <div key={status}><p className="text-xs text-slate-500">{status}</p><p className="text-2xl font-semibold">{metrics.proposal_status_counts[status] ?? 0}</p></div>)}
      </div></section>
      <p className="text-sm text-slate-600">Totals describe saved prototype records. Candidate pairs reflect stored analyses and may be stale; they are not current citywide conflicts. Approval does not change original project schedules. Civic savings have not been measured.</p>
    </>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="panel min-w-0"><h2 className="text-xl font-semibold mb-4">Find a project</h2>
        <form className="flex flex-wrap gap-2 mb-4" onSubmit={(event) => { event.preventDefault(); setOffset(0); setQuery(search); }}>
          <label className="grow text-sm">Road name<input className="input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="btn-secondary self-end" disabled={loading}>Search projects</button>
        </form>
        {catalog?.total === 0 && <p className="text-slate-600">No projects found. <Link href="/" className="text-blue-700 underline">Enter a project</Link> to begin.</p>}
        <ul className="divide-y">{catalog?.items.map((project) => <li key={project.id} className="py-4">
          <Link href={`/projects/${encodeURIComponent(project.id)}`} className="font-semibold text-blue-800 underline break-words">{project.road_name ?? "Unknown road"}</Link>
          <p className="text-sm text-slate-600 break-words">{project.organization} · {project.project_type.replaceAll("_", " ")}</p>
          <p className="text-xs mt-1">{project.start_date} → {project.end_date} (exclusive) · {project.road_segment_id ? "Road selected" : "No road selection"}</p>
        </li>)}</ul>
        {catalog && catalog.total > 0 && <div className="flex flex-wrap justify-between gap-2 text-sm mt-4"><button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous projects</button>
          <span>{offset + 1}–{Math.min(offset + 25, catalog.total)} of {catalog.total}</span><button disabled={loading || offset + 25 >= catalog.total} onClick={() => setOffset(offset + 25)}>Next projects</button></div>}
      </section>
      <section className="panel min-w-0"><h2 className="text-xl font-semibold mb-4">Recent proposals</h2>
        {proposals.length === 0 && <p className="text-sm text-slate-600">No proposals yet. Review coordination options in a project workspace.</p>}
        <ul className="divide-y">{proposals.map((plan) => <li className="py-3 text-sm" key={plan.id}><Link className="text-blue-800 underline" href={`/proposals?plan=${encodeURIComponent(plan.id)}`}>{plan.option_name}</Link><p className="text-xs text-slate-500 mt-1">{plan.status} · revision {plan.revision}</p></li>)}</ul>
        <Link href="/proposals" className="text-sm text-blue-700 underline">View saved proposals</Link>
        <div className="mt-5 border-t pt-4"><h3 className="font-semibold mb-2">Compare a schedule</h3><p className="text-sm text-slate-600">Open a project and choose “Try a schedule change” to compare overlapping schedules, overlap days and the experimental indicator.</p></div>
      </section>
    </div>
  </main>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return <section className="panel"><h2 className="text-xs font-medium text-slate-500">{label}</h2><p className="text-3xl font-bold tracking-tight mt-2">{value}</p>{detail && <p className="text-xs text-slate-500 mt-2">{detail}</p>}</section>;
}
