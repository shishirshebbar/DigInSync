"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ExtractedProject } from "@/types";

interface Props {
  onExtracted: (project: ExtractedProject) => void;
}

export default function ProjectInputForm({ onExtracted }: Props) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const extracted = await api.extractProject(description);
      onExtracted(extracted);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to extract project. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-1">Describe your infrastructure project</h2>
      <p className="text-sm text-gray-500 mb-4">
        Use plain English. AI extraction sends your description to the configured provider. Include the year in project dates.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={5}
          placeholder="e.g. We need to replace a 150m water pipeline on 80 Feet Road from November 12 to November 18. One lane will be closed."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !description.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {loading ? "Analyzing…" : "Analyze Project"}
        </button>
      </form>

      <button
        type="button"
        className="mt-4 text-sm text-blue-700 underline"
        onClick={() => onExtracted({
          project_type: null, road_name: null, start_date: null, end_date: null,
          length_m: null, lane_closure: null, organization: null,
          description: description.trim() || null,
        })}
      >
        Enter project details manually
      </button>

      <div className="mt-6 border-t pt-4">
        <p className="text-xs text-gray-400 font-medium mb-2">Example inputs:</p>
        <ul className="space-y-1">
          {[
            "Replace 150m water pipeline on 80 Feet Road, Nov 12–18, 2026. One lane closed.",
            "Telecom cable work on MG Road from Dec 1–5, 2026. Full lane closure.",
            "Drainage repair near Koramangala 5th Block, Nov 20–25, 2026.",
          ].map((ex) => (
            <li key={ex}>
              <button
                className="text-xs text-blue-600 hover:underline text-left"
                onClick={() => setDescription(ex)}
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
