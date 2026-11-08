"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { MapProps } from "./ProjectMap";
import { api } from "@/lib/api";

const EMPTY: string[] = [];

export default function MapCanvas({ data, selectedId, overlappingIds = EMPTY, onSelect }: MapProps) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lastData = useRef<MapProps["data"] | null>(null);
  const [tileError, setTileError] = useState(false);
  const [roadMessage, setRoadMessage] = useState("");

  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { scrollWheelZoom: false }).setView([12.97, 77.64], 14);
    mapRef.current = map;
    const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    if (tileUrl && tileUrl !== "none") {
      L.tileLayer(tileUrl, { maxZoom: 19, attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' })
        .on("tileerror", () => setTileError(true)).addTo(map);
    }
    const background = L.geoJSON(undefined, { style: { color: "#64748b", weight: 2, opacity: 0.4 }, interactive: false }).addTo(map);
    let alive = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function roads() {
      const ticket = ++generation;
      const bounds = map.getBounds();
      if (bounds.getEast() - bounds.getWest() > 0.35 || bounds.getNorth() - bounds.getSouth() > 0.35) {
        background.clearLayers(); setRoadMessage("Zoom in to view imported roads."); return;
      }
      try {
        const result = await api.roads("", 0, [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(","));
        if (!alive || ticket !== generation) return;
        background.clearLayers().addData(result);
        setRoadMessage(result.total === 0 ? "No imported roads in this view." : `${Math.min(result.total, result.limit)} of ${result.total} imported road segments shown. Zoom in for detail.`);
        background.bringToBack();
      } catch { if (alive && ticket === generation) setRoadMessage("Road layer unavailable. Project geometry and lists remain available."); }
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(() => void roads(), 250); }
    map.on("moveend", schedule); schedule();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element.current);
    return () => { alive = false; clearTimeout(timer); observer.disconnect(); map.remove(); mapRef.current = null; lastData.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const layers = L.geoJSON(data, {
      style: (feature) => {
        const base = feature?.properties.role === "base";
        const overlap = overlappingIds.includes(String(feature?.id));
        return { color: feature?.id === selectedId ? "#7c3aed" : base ? "#1d4ed8" : overlap ? "#be123c" : "#0f766e",
          weight: feature?.id === selectedId ? 9 : base ? 7 : 5, opacity: 0.9, dashArray: base ? undefined : "8 5" };
      },
      onEachFeature: (feature, layer) => {
        const text = document.createElement("span");
        text.textContent = `${feature.properties.role === "base" ? "Selected project" : "Road / candidate"}: ${feature.properties.road_name}`;
        layer.bindTooltip(text);
        layer.on("click", () => onSelect?.(String(feature.id)));
      },
    }).addTo(map);
    if (lastData.current !== data) {
      const bounds = layers.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.25), { maxZoom: 16, animate: !reduced });
      lastData.current = data;
    }
    return () => { layers.remove(); };
  }, [data, selectedId, overlappingIds, onSelect]);

  return <div className="space-y-2">
    <div ref={element} role="region" aria-label="Project location map. Use arrow keys to pan and plus or minus to zoom." className="map-frame" />
    <p className="text-xs text-slate-600">Blue: selected project · Teal dashed: candidate · Red dashed: overlapping dates · Purple: list selection</p>
    {tileError && <p role="status" className="text-sm text-amber-800">Background tiles unavailable. Geometry and project lists remain usable.</p>}
    <p className="text-xs text-slate-600">{roadMessage}</p>
    <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer" className="text-xs underline">Report a map issue</a>
  </div>;
}
