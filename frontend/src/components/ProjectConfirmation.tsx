"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ExtractedProject } from "@/types";

interface Props {
  project: ExtractedProject;
  onConfirmed: (project: ExtractedProject, projectId: string) => void;
  onBack: () => void;
}

const PROJECT_TYPES = [
  "water_pipeline", "telecom", "electricity", "road_repair", "drainage", "utility", "utility_maintenance", "street_light",
];

export default function ProjectConfirmation({ project, onConfirmed, onBack }: Props) {
  const [form, setForm] = useState<ExtractedProject>({ ...project });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof ExtractedProject, value: string | number | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleConfirm() {
    if (!form.project_type || !form.road_name?.trim() || !form.start_date || !form.end_date ||
        form.lane_closure === null || !form.organization?.trim() || !form.description?.trim()) {
      setError("Complete the project type, road, dates, lane closure, organization and description before continuing.");
      return;
    }
    if (form.end_date <= form.start_date) {
      setError("End date must be after start date.");
      return;
    }
    if (form.length_m !== null && (!Number.isFinite(form.length_m) || form.length_m <= 0)) {
      setError("Length must be a positive number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await api.createProject({
        organization: form.organization.trim(),
        project_type: form.project_type,
        description: form.description.trim(),
        road_name: form.road_name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        length_m: form.length_m,
        lane_closure: form.lane_closure,
      }) as { id: string };
      onConfirmed(form, created.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-1">Confirm extracted project details</h2>
      <p className="text-sm text-gray-500 mb-5">Review all details and fill in missing or uncertain fields before analysis.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Project type">
          <select
            className="input"
            value={form.project_type ?? ""}
            onChange={(e) => update("project_type", e.target.value || null)}
          >
            <option value="">Select a project type</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>
        </Field>

        <Field label="Road name">
          <input className="input" value={form.road_name ?? ""}
            onChange={(e) => update("road_name", e.target.value || null)} />
        </Field>

        <Field label="Start date">
          <input type="date" className="input" value={form.start_date ?? ""}
            onChange={(e) => update("start_date", e.target.value || null)} />
        </Field>

        <Field label="End date">
          <input type="date" className="input" value={form.end_date ?? ""}
            onChange={(e) => update("end_date", e.target.value || null)} />
        </Field>

        <Field label="Length (metres)">
          <input type="number" className="input" value={form.length_m ?? ""}
            onChange={(e) => update("length_m", e.target.value ? Number(e.target.value) : null)} />
        </Field>

        <Field label="Lane closure">
          <select className="input" value={form.lane_closure ?? ""}
            onChange={(e) => update("lane_closure", e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Select lane impact</option>
            <option value={0}>No</option>
            <option value={1}>Yes</option>
          </select>
        </Field>

        <Field label="Organization">
          <input className="input" value={form.organization ?? ""}
            onChange={(e) => update("organization", e.target.value || null)} />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Project description">
          <textarea className="input w-full" rows={3} value={form.description ?? ""}
            onChange={(e) => update("description", e.target.value || null)} />
        </Field>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3 mt-6">
        <button onClick={onBack}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button onClick={handleConfirm} disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors">
          {loading ? "Saving…" : "Confirm & Analyze →"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
