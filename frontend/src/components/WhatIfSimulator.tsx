"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  projectId: string;
  onBack: () => void;
}

interface SimResult {
  conflict_count: number;
  has_high_severity: boolean;
  risk_score: number;
  risk_level: string;
}

interface SimResponse {
  before: SimResult;
  after: SimResult;
  improvement: boolean;
}

export default function WhatIfSimulator({ projectId, onBack }: Props) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [result, setResult] = useState<SimResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimulate() {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.simulate(projectId, [
        { project_id: projectId, new_start_date: startDate, new_end_date: endDate },
      ]) as SimResponse;
      setResult(res);
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
        Change the schedule and see how conflicts and risk update.
      </p>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">New start date</span>
          <input type="date" className="input w-full"
            value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">New end date</span>
          <input type="date" className="input w-full"
            value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={onBack}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
          ← Back
        </button>
        <button onClick={handleSimulate} disabled={loading || !startDate || !endDate}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
          {loading ? "Running…" : "Run simulation"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</p>
      )}

      {result && (
        <div className="grid grid-cols-2 gap-4">
          <SimCard label="Before" data={result.before} />
          <SimCard label="After" data={result.after} highlight={result.improvement} />
        </div>
      )}
    </div>
  );
}

function SimCard({ label, data, highlight }: { label: string; data: SimResult; highlight?: boolean }) {
  return (
    <div className={`border rounded-lg p-4 ${highlight ? "border-green-400 bg-green-50" : "border-gray-200"}`}>
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      <p className="text-sm">Conflicts: <strong>{data.conflict_count}</strong></p>
      <p className="text-sm">
        Risk: <strong>{Math.round(data.risk_score)}</strong>
        <span className={`ml-1 text-xs ${data.risk_level === "HIGH" ? "text-red-600" : data.risk_level === "MEDIUM" ? "text-yellow-600" : "text-green-600"}`}>
          {data.risk_level}
        </span>
      </p>
    </div>
  );
}
