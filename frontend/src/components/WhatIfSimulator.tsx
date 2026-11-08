"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { SimulationResponse, SimulationResult } from "@/types";
import PrepareProposalButton from "@/components/PrepareProposalButton";
import ScheduleTimeline from "./ScheduleTimeline";

interface Props {
  projectId: string;
  initialStartDate: string;
  initialEndDate: string;
  organization: string;
  projectType: string;
  onBack: () => void;
}

export default function WhatIfSimulator({ projectId, initialStartDate, initialEndDate, organization, projectType, onBack }: Props) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimulate() {
    setResult(null);
    if (!startDate || !endDate || endDate <= startDate) {
      setError("Enter both dates; the end date must be after the start date.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setResult(await api.simulate(projectId, [
        { project_id: projectId, new_start_date: startDate, new_end_date: endDate },
      ]));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-1">What-if simulator</h2>
      <p className="text-sm text-gray-500 mb-5">
        Compare a proposed schedule for this project. This does not save or approve changes.
        The end date is exclusive. No AI call is made.
      </p>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">New start date</span>
          <input type="date" className="input w-full" value={startDate} disabled={loading}
            onChange={(e) => { setStartDate(e.target.value); setResult(null); }} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">New end date</span>
          <input type="date" className="input w-full" value={endDate} disabled={loading}
            onChange={(e) => { setEndDate(e.target.value); setResult(null); }} />
        </label>
      </div>
      <div className="flex gap-3 mb-6">
        <button onClick={onBack} className="px-4 py-2 text-sm border border-gray-300 rounded-lg">
          ← Back
        </button>
        <button onClick={handleSimulate} disabled={loading}
          className="bg-blue-600 disabled:bg-gray-300 text-white font-medium px-5 py-2 rounded-lg text-sm">
          {loading ? "Running…" : "Run simulation"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 mb-4">{error}</p>}
      {result && (
        <>
          <div className="mb-5 rounded-lg bg-slate-50 p-4 space-y-4" aria-label="Simulation comparison">
            <h3 className="font-semibold">Schedule comparison</h3>
            <Comparison label="Candidates with overlapping dates" before={result.before.temporal_overlap_count} after={result.after.temporal_overlap_count} />
            <Comparison label="Summed pair overlap days" before={result.before.conflicts.reduce((sum, item) => sum + item.overlap_days, 0)} after={result.after.conflicts.reduce((sum, item) => sum + item.overlap_days, 0)} />
            <Comparison label="Experimental indicator" before={result.before.risk_score} after={result.after.risk_score} scale={100} />
            <p className="text-xs text-slate-600">Overlap days sum project-pair overlaps, not unique road disruption days. Values describe this scenario; they are not measured civic savings.</p>
            <ScheduleTimeline items={[{ id: "before", label: "Original project", start: result.before.start_date, end: result.before.end_date }, { id: "after", label: "Proposed project", start: result.after.start_date, end: result.after.end_date }]} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <SimCard label="Before" data={result.before} />
            <SimCard label="Proposed" data={result.after} />
          </div>
          <p className="text-xs text-gray-600 mt-4">Location basis: {result.location_basis}</p>
          <p className="mt-4 text-sm text-gray-600">Save these proposed dates in a sequencing draft, then confirm tasks and responsibilities. Original project dates remain unchanged.</p>
          <PrepareProposalButton projectId={projectId} optionKey="review_sequencing" label="Prepare proposal with these dates" tasks={[{
            id: "base-project-work", task: projectType.replaceAll("_", " "), organization,
            start_date: result.after.start_date, end_date: result.after.end_date, dependency: null, notes: "Dates selected in the what-if simulator; confirm responsibilities and scope.",
          }]} />
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 space-y-1">
            {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function Comparison({ label, before, after, scale }: { label: string; before: number; after: number; scale?: number }) {
  const max = scale ?? Math.max(before, after, 1);
  const delta = Math.round((after - before) * 10) / 10;
  return <div className="text-sm"><p className="font-medium mb-2">{label} <span className="text-xs font-normal text-slate-600">{delta === 0 ? "Unchanged" : delta > 0 ? `Increased by ${delta}` : `Decreased by ${-delta}`}</span></p>
    {[["Before", before], ["Proposed", after]].map(([name, value]) => <div key={name} className="grid grid-cols-[5rem_minmax(0,1fr)_3rem] gap-2 items-center text-xs mb-1"><span>{name}</span><div className="h-2 rounded bg-slate-200" aria-hidden="true"><div className={`h-2 rounded ${name === "Before" ? "bg-slate-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, Number(value) / max * 100)}%` }} /></div><span className="text-right">{Math.round(Number(value) * 10) / 10}</span></div>)}
  </div>;
}

function SimCard({ label, data }: { label: string; data: SimulationResult }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="font-medium mb-2">{label}</h3>
      <p className="text-sm">{data.start_date} to {data.end_date} (exclusive): {data.duration_days} days</p>
      <p className="text-sm">Candidate conflicts: <strong>{data.conflict_count}</strong></p>
      <p className="text-sm">Candidates with overlapping dates: <strong>{data.temporal_overlap_count}</strong></p>
      <p className="text-sm">High severity candidate: <strong>{data.has_high_severity ? "Yes" : "No"}</strong></p>
      <p className="text-sm">Experimental indicator: <strong>{data.risk_score}/100 ({data.risk_level})</strong></p>
      <p className="text-xs text-gray-500">Model: {data.model_version}</p>
      {data.conflicts.map((item) => (
        <div key={item.project_b_id} className="text-xs border-t mt-2 pt-2">
          <p>{item.project_b_name}</p>
          <p>Conflict score: {item.conflict_score}/100 ({item.severity}); overlapping days: {item.overlap_days}</p>
        </div>
      ))}
    </div>
  );
}
