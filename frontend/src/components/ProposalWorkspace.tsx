"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AuditEvent, DemoConfig, DraftTask, Proposal, ProposalContent, ProposalSummary, Workplan } from "@/types";
import WorkplanPanel from "@/components/WorkplanPanel";
import PrepareProposalButton from "@/components/PrepareProposalButton";
import WorkflowTracker from "@/components/WorkflowTracker";
import { useRequestGuard } from "@/lib/use-request-guard";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Request failed. Please try again.";

function contentOf(plan: Proposal): ProposalContent {
  return { notes: plan.notes, tasks: plan.tasks,
    related_project_ids: plan.project_snapshots.filter((item) => item.id !== plan.project_id).map((item) => item.id) };
}

export default function ProposalWorkspace() {
  const params = useSearchParams();
  const planId = params.get("plan");
  const projectId = params.get("project") ?? undefined;
  const [plans, setPlans] = useState<ProposalSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    api.listProposals(projectId).then((rows) => {
      if (active) { setPlans(rows); setError(null); }
    }).catch((err: unknown) => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [projectId, refresh]);

  return <main id="main-content" className="min-h-screen bg-gray-50 p-4 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-blue-800">Saved coordination proposals</h1>
          <p className="mt-1 text-sm text-gray-600">Local demo review. Original project dates unchanged.</p></div>
        <Link href="/" className="text-sm text-blue-700 underline">New project / analysis</Link>
      </header>
      <WorkflowTracker key={planId ?? "list"} mode="proposal" proposalId={planId ?? undefined} />
      <div className="grid items-start gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border bg-white p-4" aria-label="Saved proposals">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recent proposals</h2>
            <button type="button" className="text-sm text-blue-700 underline" onClick={() => setRefresh((value) => value + 1)}>Refresh list</button></div>
          {projectId && <Link href="/proposals" className="text-sm text-blue-700 underline">Show all projects</Link>}
          {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
          {!plans && !error && <p role="status">Loading…</p>}
          {plans?.length === 0 && <p className="text-sm text-gray-600">No saved proposals yet. Prepare one from the coordination options.</p>}
          <ul className="mt-3 space-y-2">{plans?.map((plan) => <li key={plan.id}>
            <Link href={`/proposals?plan=${encodeURIComponent(plan.id)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`}
              aria-current={plan.id === planId ? "page" : undefined}
              className={`block rounded border p-3 text-sm ${plan.id === planId ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
              <span className="block font-medium">{plan.option_name}</span>
              <span className="text-xs text-gray-600">{plan.status} · revision {plan.revision}</span>
              <span className="mt-1 block text-xs text-gray-500">{new Date(plan.created_at).toLocaleString()}</span>
            </Link>
          </li>)}</ul>
          <p className="mt-4 text-xs text-gray-500">Showing up to 100 recent proposals.</p>
        </aside>
        {planId ? <ProposalDetail key={planId} id={planId} onChange={() => setRefresh((value) => value + 1)} />
          : <p className="rounded-xl border bg-white p-6 text-gray-600">Select a saved proposal to review its tasks, decisions, and workplan.</p>}
      </div>
    </div>
  </main>;
}

function ProposalDetail({ id, onChange }: { id: string; onChange: () => void }) {
  const [plan, setPlan] = useState<Proposal | null>(null);
  const [content, setContent] = useState<ProposalContent>({ notes: "", tasks: [], related_project_ids: [] });
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [workplan, setWorkplan] = useState<Workplan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revisionReload, setRevisionReload] = useState(0);
  const [reason, setReason] = useState("");
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const beginDecision = useRequestGuard();
  const decisionLock = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [saved, demo, history] = await Promise.allSettled([api.getProposal(id), api.demoConfig(), api.proposalEvents(id)]);
        if (!active) return;
        const failures: string[] = [];
        if (saved.status === "fulfilled") {
          setPlan(saved.value); setContent(contentOf(saved.value)); setConfirmApproval(false); setReason("");
        } else failures.push(`Proposal: ${errorMessage(saved.reason)}`);
        if (demo.status === "fulfilled") setConfig(demo.value);
        else { setConfig(null); failures.push(`Review availability: ${errorMessage(demo.reason)}`); }
        if (history.status === "fulfilled") setEvents(history.value);
        else failures.push(`Decision history: ${errorMessage(history.reason)}`);
        if (saved.status === "fulfilled" && saved.value.workplan_id) {
          try {
            const generated = await api.getWorkplan(saved.value.workplan_id);
            if (active) setWorkplan(generated);
          } catch (failure) { failures.push(`Workplan: ${errorMessage(failure)}`); }
        }
        if (active) setError(failures.length ? `Some saved details could not be loaded. Previously loaded details may be out of date. ${failures.join(" ")}` : null);
      } catch (err: unknown) { if (active) setError(errorMessage(err)); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [id, revisionReload]);

  const dirty = plan !== null && JSON.stringify(content) !== JSON.stringify(contentOf(plan));
  const editable = plan?.status === "DRAFT" && config?.enabled === true;

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(next: ProposalContent) { setContent(next); setConfirmApproval(false); }
  function updateTask(id: string, field: keyof DraftTask, value: string | null) {
    edit({ ...content, tasks: content.tasks.map((task) => task.id === id ? { ...task, [field]: value } : task) });
  }

  async function decide(action: "save" | "approve" | "reject") {
    if (!plan || decisionLock.current || loading) return;
    decisionLock.current = true;
    const current = beginDecision();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (action === "save") {
        const saved = await api.updateProposal(id, plan.revision, content);
        if (current()) { setPlan(saved); setContent(contentOf(saved)); setNotice(`Draft revision ${saved.revision} saved.`); }
      }
      if (action === "approve") {
        const generated = await api.approvePlan(id, plan.revision);
        if (current()) {
          setWorkplan(generated); setPlan({ ...plan, status: "APPROVED", workplan_id: generated.id, decided_by: generated.approved_by, decided_at: generated.approved_at });
          setNotice("Local approval recorded and workplan generated. Original project dates unchanged.");
        }
      }
      if (action === "reject") {
        const rejected = await api.rejectProposal(id, plan.revision, reason.trim());
        if (current()) { setPlan(rejected); setNotice("Local rejection recorded."); }
      }
      if (current()) { setConfirmApproval(false); setRevisionReload((value) => value + 1); onChange(); }
    } catch (err: unknown) { if (current()) { setError(errorMessage(err)); setConfirmApproval(false); } }
    finally { decisionLock.current = false; if (current()) setBusy(false); }
  }

  if (!plan) return <section className="rounded-xl border bg-white p-6">{error
    ? <><p role="alert" className="text-red-700">{error}</p><button onClick={() => setRevisionReload((value) => value + 1)} className="mt-3 underline">Retry loading proposal</button></>
    : <p role="status">Loading proposal…</p>}</section>;

  const candidateMap = new Map((plan.status === "DRAFT" ? [...plan.project_snapshots, ...plan.available_projects]
    : plan.project_snapshots).map((item) => [item.id, item]));
  const candidates = [...candidateMap.values()].filter((item) => item.id !== plan.project_id);
  const base = plan.project_snapshots.find((item) => item.id === plan.project_id);

  return <section className="space-y-5" aria-label="Proposal details">
    {notice && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
    {loading && <p role="status" className="text-sm text-slate-600">Refreshing saved proposal details and decision history. Previously loaded information remains visible.</p>}
    <Link href={`/projects/${encodeURIComponent(plan.project_id)}`} className="text-sm text-blue-700 underline">Open project analysis and map</Link>
    <div className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold">{plan.option_name}</h2>
          <p className="text-sm text-gray-500">{plan.status} · reviewed draft revision {plan.revision}</p></div>
        <button type="button" disabled={busy || loading} onClick={() => setRevisionReload((value) => value + 1)}
          className="rounded border px-3 py-2 text-sm disabled:opacity-50">{dirty ? "Discard edits and reload" : "Reload proposal"}</button>
      </div>
      <p className="text-sm">{plan.description}</p>
      <p className="text-sm text-gray-600">Tradeoffs: {plan.tradeoffs}</p>
      <p className="rounded bg-blue-50 p-3 text-sm text-blue-900">
        Demo reviewer: {config?.reviewer ?? "unavailable"}. This records a local coordination decision, not agency authorization.
        Original project dates unchanged.
      </p>
      {config && !config.enabled && <p role="status" className="text-sm text-amber-800">Demo editing and decisions are disabled on this server. Saved proposals remain readable.</p>}
      {base && <p className="text-sm"><strong>Base project:</strong> {base.organization} · {base.road_name ?? "Unknown road"}<br />
        Original dates: {base.start_date} to {base.end_date} (end exclusive).</p>}
      <details><summary className="cursor-pointer text-sm font-medium">Reviewed analysis and warnings</summary>
        {plan.analysis_snapshot.baseline && <p className="mt-2 text-sm">
          Candidate projects: {plan.analysis_snapshot.baseline.conflict_count}; overlapping schedules: {plan.analysis_snapshot.baseline.temporal_overlap_count};
          experimental indicator: {plan.analysis_snapshot.baseline.risk_score}/100. These describe the original schedule.
        </p>}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">{plan.analysis_snapshot.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </details>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <fieldset disabled={!editable || busy || loading} className="space-y-4 disabled:opacity-80">
        <legend className="mb-2 font-semibold">Proposal details</legend>
        <label className="block text-sm">Coordination notes
          <textarea className="input mt-1" rows={3} maxLength={4000} value={content.notes}
            onChange={(event) => edit({ ...content, notes: event.target.value })} />
        </label>
        <div><p className="text-sm font-medium">Participating candidate projects</p>
          <p className="mb-2 text-xs text-gray-600">The base project is included. Select additional candidates explicitly; matching is not verified proximity.</p>
          {candidates.length === 0 && <p className="text-sm text-gray-500">No additional candidates available.</p>}
          {candidates.map((item) => <label key={item.id} className="mb-2 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={content.related_project_ids.includes(item.id)} onChange={(event) => edit({
              ...content, related_project_ids: event.target.checked ? [...content.related_project_ids, item.id]
                : content.related_project_ids.filter((id) => id !== item.id),
            })} />
            <span>{item.organization} · {item.project_type} · {item.road_name}<span className="block text-xs text-gray-500">{item.start_date} to {item.end_date} (exclusive)</span></span>
          </label>)}
        </div>
        <div className="space-y-3"><h3 className="font-semibold">Proposed tasks</h3>
          <p className="text-xs text-gray-600">Confirm each organization and date. Task dates belong to this workplan. End dates are exclusive; dependencies must finish before the next task starts.</p>
          {content.tasks.length === 0 && <p className="text-sm text-gray-500">Add at least one task before approval.</p>}
          {content.tasks.map((task, index) => <div key={task.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Task {index + 1}</h4>
              {editable && <button type="button" onClick={() => edit({ ...content, tasks: content.tasks.filter((item) => item.id !== task.id)
                .map((item) => item.dependency === task.id ? { ...item, dependency: null } : item) })}
                className="text-sm text-red-700 underline">Remove task {index + 1}</button>}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Task name<input className="input mt-1" maxLength={300} value={task.task} onChange={(event) => updateTask(task.id, "task", event.target.value)} /></label>
              <label className="text-sm">Responsible organization<input className="input mt-1" maxLength={200} value={task.organization} onChange={(event) => updateTask(task.id, "organization", event.target.value)} /></label>
              <label className="text-sm">Proposed start<input className="input mt-1" type="date" value={task.start_date} onChange={(event) => updateTask(task.id, "start_date", event.target.value)} /></label>
              <label className="text-sm">Proposed end (exclusive)<input className="input mt-1" type="date" value={task.end_date} onChange={(event) => updateTask(task.id, "end_date", event.target.value)} /></label>
              <label className="text-sm">Depends on<select className="input mt-1" value={task.dependency ?? ""} onChange={(event) => updateTask(task.id, "dependency", event.target.value || null)}>
                <option value="">No dependency</option>{content.tasks.filter((item) => item.id !== task.id).map((item) => <option key={item.id} value={item.id}>{item.task || "Unnamed task"}</option>)}
              </select></label>
              <label className="text-sm">Task notes<input className="input mt-1" maxLength={2000} value={task.notes} onChange={(event) => updateTask(task.id, "notes", event.target.value)} /></label>
            </div>
          </div>)}
          {editable && <button type="button" disabled={content.tasks.length >= 100} className="rounded border px-4 py-2 text-sm" onClick={() => edit({ ...content, tasks: [...content.tasks, {
            id: crypto.randomUUID(), task: "", organization: base?.organization ?? "", start_date: base?.start_date ?? "",
            end_date: base?.end_date ?? "", dependency: null, notes: "",
          }] })}>Add task</button>}
        </div>
      </fieldset>
      {editable && <fieldset disabled={busy || loading} className="space-y-4 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} onClick={() => void decide("save")}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Working…" : "Save draft revision"}</button>
          <span role="status" className="text-sm text-gray-600">{dirty ? "Unsaved edits. Save and review before deciding." : "Viewing the saved revision."}</span></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmApproval} disabled={busy || dirty || content.tasks.length === 0}
          onChange={(event) => setConfirmApproval(event.target.checked)} />
          I reviewed the saved tasks, organizations, dates, and warnings. Approve this coordination workplan only.</label>
        <button type="button" disabled={busy || dirty || !confirmApproval || content.tasks.length === 0} onClick={() => void decide("approve")}
          className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-40">Approve and generate workplan</button>
        <div className="border-t pt-3"><label className="block text-sm">Rejection reason<textarea className="input mt-1" maxLength={2000} rows={2}
          value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
          <button type="button" disabled={busy || dirty || !reason.trim()} onClick={() => void decide("reject")}
            className="mt-2 rounded border border-red-700 px-4 py-2 text-sm text-red-700 disabled:opacity-40">Reject proposal</button></div>
      </fieldset>}
      {plan.decided_by && <p className="text-sm">{plan.status} by demo reviewer {plan.decided_by} at {plan.decided_at ? new Date(plan.decided_at).toLocaleString() : "unknown time"}.
        {plan.decision_reason && <span className="block">Reason: {plan.decision_reason}</span>}</p>}
      {plan.status !== "DRAFT" && plan.option_key && <PrepareProposalButton projectId={plan.project_id} optionKey={plan.option_key} label="Prepare a new draft" />}
    </div>
    {workplan && <WorkplanPanel workplan={workplan} />}
    <div className="rounded-xl border bg-white p-5"><h3 className="mb-3 font-semibold">Decision history</h3>
      <p className="mb-3 text-xs text-gray-500">Local decision history records the demo reviewer and saved proposal revisions.</p>
      <ol className="space-y-3">{events.map((event) => <li key={event.id} className="border-l-2 border-blue-200 pl-3 text-sm">
        <p><strong>{event.event}</strong> · revision {event.revision} · {event.actor}</p>
        <p className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</p>
        {event.details.reason && <p>{event.details.reason}</p>}
        {event.details.content && <details className="mt-1"><summary className="cursor-pointer text-xs text-blue-700">Saved revision details</summary>
          <p className="mt-2 text-xs">Notes: {event.details.content.notes || "No notes recorded."}</p>
          <ul className="mt-1 list-disc pl-4 text-xs">{event.details.content.tasks.map((task) => <li key={task.id}>
            {task.task} — {task.organization}: {task.start_date} to {task.end_date} (exclusive).
            {task.notes && ` ${task.notes}`}
          </li>)}</ul></details>}
      </li>)}</ol>
    </div>
  </section>;
}
