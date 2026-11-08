"use client";

import dynamic from "next/dynamic";
import type { MapCollection } from "@/types";

export interface MapProps {
  data: MapCollection;
  selectedId?: string | null;
  overlappingIds?: string[];
  onSelect?: (id: string) => void;
}

const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false, loading: () => <p role="status" className="map-frame p-6">Loading map…</p> });
export default function ProjectMap(props: MapProps) { return <MapCanvas {...props} />; }
