"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { MapCollection, MapFeature } from "@/types";
import ProjectMap from "./ProjectMap";

export default function RoadPicker({ name, selectedId, onSelect }: { name: string; selectedId?: string | null; onSelect: (road: MapFeature | null) => void }) {
  const [results, setResults] = useState<MapCollection | null>(null);
  const [preview, setPreview] = useState<MapFeature | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function search(offset = 0) {
    const value = offset ? query : name.trim();
    if (!value) { setError("Enter a road name first."); return; }
    setBusy(true); setError(null);
    try { setResults(await api.roads(value, offset)); setQuery(value); setPreview(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Road search failed."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Optional road location" className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
    <h3 className="font-semibold">Optional road location</h3>
    <p className="text-sm text-slate-600">Search imported roads using the road name above. Preview and select a segment, or continue without a location. A segment is a location reference, not a verified excavation extent.</p>
    <button type="button" className="btn-secondary" disabled={busy} onClick={() => void search()}>{busy ? "Searching…" : "Search imported roads"}</button>
    {selectedId ? <p role="status" className="text-sm text-teal-800">Location selected: {name}. <button type="button" className="underline" onClick={() => onSelect(null)}>Clear location</button></p> : <p className="text-sm text-slate-600">No road location selected. You can continue with road-name matching.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {results && <>
      {results.total === 0 && <p role="status">No imported roads match. Try another name or continue without a location.</p>}
      <ul className="space-y-2">{results.features.map((road) => <li key={road.id} className="rounded border bg-white p-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span>{road.properties.road_name} · {road.properties.road_type ?? "Road"}<span className="block text-xs text-slate-500">{road.properties.osm_id ? `OSM way ${road.properties.osm_id}` : `Segment ${road.id.slice(0, 8)}`}{road.properties.length_m ? ` · ${Math.round(road.properties.length_m)} m` : ""}</span></span>
        <div className="flex gap-3"><button type="button" className="underline" onClick={() => setPreview(road)}>Preview</button><button type="button" className="btn-secondary" onClick={() => { onSelect(road); setPreview(road); }}>Select segment</button></div>
      </li>)}</ul>
      {results.total > results.limit && <div className="flex gap-3 text-sm"><button type="button" disabled={busy || results.offset === 0} onClick={() => void search(results.offset - results.limit)}>Previous roads</button>
        <span>{results.offset + 1}–{Math.min(results.offset + results.limit, results.total)} of {results.total}</span>
        <button type="button" disabled={busy || results.offset + results.limit >= results.total} onClick={() => void search(results.offset + results.limit)}>Next roads</button></div>}
    </>}
    {preview && <ProjectMap data={{ type: "FeatureCollection", features: [preview], total: 1, limit: 1, offset: 0 }} selectedId={selectedId} />}
  </section>;
}
