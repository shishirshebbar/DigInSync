"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { SimulationResponse, SimulationResult } from "@/types";

interface Props {
  projectId: string;
  initialStartDate: string;
  initialEndDate: string;
  onBack: () => void;
}

export default function WhatIfSimulator({ projectId, initialStartDate, initialEndDate, onBack }: Props) {
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
          <div className="grid md:grid-cols-2 gap-4">
            <SimCard label="Before" data={result.before} />
            <SimCard label="Proposed" data={result.after} />
          </div>
          <p className="text-xs text-gray-600 mt-4">Location basis: {result.location_basis}</p>
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 space-y-1">
            {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </>
      )}
    </div>
  );
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
