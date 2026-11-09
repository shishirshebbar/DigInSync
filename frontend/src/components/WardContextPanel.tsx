"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { WardContext } from "@/types";

export default function WardContextPanel() {
  const [dataset, setDataset] = useState<WardContext["dataset"]>("work_orders");
  const [ward, setWard] = useState("");
  const [result, setResult] = useState<WardContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (!ward.trim() || busy) return;
    const ticket = ++generation.current;
    setBusy(true); setError(null); setResult(null);
    try {
      const response = await api.wardContext(dataset, ward.trim());
      if (ticket === generation.current) setResult(response);
    } catch (failure) {
      if (ticket === generation.current) setError(failure instanceof Error ? failure.message : "Could not look up ward records.");
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }

  return <section className="panel space-y-4" aria-label="Ward dataset context">
    <div><p className="eyebrow">Explore available data</p><h2 className="text-xl font-semibold">Ward dataset context</h2>
      <p className="mt-2 text-sm text-slate-600">Enter the ward identifier used by one source dataset. Work-order identifiers and grievance ward names have not been reconciled; search them separately.</p></div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void lookup(event)}>
      <label className="text-sm">Source dataset<select className="input mt-1" disabled={busy} value={dataset}
        onChange={(event) => { setDataset(event.target.value as WardContext["dataset"]); setResult(null); setError(null); }}>
        <option value="work_orders">Work orders</option><option value="grievances">Grievances</option>
      </select></label>
      <label className="min-w-0 grow text-sm">Ward identifier<input className="input mt-1" maxLength={200} required disabled={busy} value={ward}
        onChange={(event) => { setWard(event.target.value); setResult(null); setError(null); }} placeholder="Identifier or ward name from this dataset" /></label>
      <button className="btn-secondary" disabled={busy || !ward.trim()}>{busy ? "Looking up records…" : "Look up ward records"}</button>
    </form>
    {busy && <p role="status" className="text-sm text-blue-800">Counting matching records in the selected dataset.</p>}
    {error && <p role="alert" className="notice-error">{error} Your identifier has been kept; use Look up ward records to retry.</p>}
    {result && <div role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm">
      <strong>{result.record_count.toLocaleString()} matching record(s)</strong> · {result.ward} · {result.dataset === "work_orders" ? "Work orders" : "Grievances"}
      {result.record_count === 0 && <p className="mt-2">No records match this identifier in the selected dataset. This does not establish an absence of work or incidents.</p>}
    </div>}
    <p className="text-xs text-amber-900">Ward-level context only. Counts do not establish completeness, verified ward boundaries, or incidents near a project. This lookup does not change project analysis.</p>
  </section>;
}
