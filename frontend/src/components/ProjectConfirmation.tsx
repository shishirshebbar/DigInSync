"use client";

import { cloneElement, useId, useState } from "react";
import { api } from "@/lib/api";
import type { ExtractedProject } from "@/types";
import RoadPicker from "./RoadPicker";
import { useRequestGuard } from "@/lib/use-request-guard";

interface Props {
  project: ExtractedProject;
  onConfirmed: (project: ExtractedProject, projectId: string) => void;
  onBack: () => void;
}

const PROJECT_TYPES = [
  "water_pipeline", "telecom", "electricity", "road_repair", "drainage", "utility", "utility_maintenance", "street_light",
];

type FormField = Exclude<keyof ExtractedProject, "road_segment_id">;
const FIELD_ORDER: FormField[] = ["project_type", "road_name", "start_date", "end_date", "length_m", "lane_closure", "organization", "description"];
const FIELD_LABELS: Record<FormField, string> = {
  project_type: "Project type", road_name: "Road name", start_date: "Start date", end_date: "End date",
  length_m: "Length", lane_closure: "Lane closure", organization: "Organization", description: "Project description",
};

function validate(form: ExtractedProject): Partial<Record<FormField, string>> {
  const errors: Partial<Record<FormField, string>> = {};
  for (const field of FIELD_ORDER) {
    if (field === "length_m") continue;
    const value = form[field];
    if (value == null || (typeof value === "string" && !value.trim())) errors[field] = `${FIELD_LABELS[field]} is required.`;
  }
  if (form.lane_closure != null && form.lane_closure !== 0 && form.lane_closure !== 1) errors.lane_closure = "Select whether a lane will be closed.";
  if (form.start_date && form.end_date && form.end_date <= form.start_date) errors.end_date = "End date must be after start date.";
  if (form.length_m != null && (!Number.isFinite(form.length_m) || form.length_m <= 0)) errors.length_m = "Length must be a positive number.";
  return errors;
}

export default function ProjectConfirmation({ project, onConfirmed, onBack }: Props) {
  const [form, setForm] = useState<ExtractedProject>({ ...project });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const validation = validate(form);
  const firstInvalid = FIELD_ORDER.find((field) => validation[field]);
  const displayedError = submitted && firstInvalid ? validation[firstInvalid] : error;
  const beginRequest = useRequestGuard();

  function update(field: keyof ExtractedProject, value: string | number | null) {
    setError(null);
    setForm((prev) => ({ ...prev, [field]: value, ...(field === "road_name" ? { road_segment_id: null } : {}) }));
  }

  function fieldProps(field: FormField) {
    return { name: field, required: field !== "length_m", error: touched[field] || submitted ? validation[field] : undefined,
      onBlur: () => setTouched((previous) => ({ ...previous, [field]: true })) };
  }

  async function handleConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setSubmitted(true); setError(null);
    if (firstInvalid) {
      event.currentTarget.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    const current = beginRequest();
    setLoading(true);
    setError(null);
    try {
      const created = await api.createProject({
        organization: form.organization?.trim(),
        project_type: form.project_type,
        description: form.description?.trim(),
        road_name: form.road_name?.trim(),
        road_segment_id: form.road_segment_id ?? null,
        start_date: form.start_date,
        end_date: form.end_date,
        length_m: form.length_m,
        lane_closure: form.lane_closure,
      }) as { id: string };
      if (current()) onConfirmed(form, created.id);
    } catch (err: unknown) {
      if (current()) setError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      if (current()) setLoading(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void handleConfirm(event)} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm" aria-label="Project details">
      <h2 className="text-lg font-semibold mb-1">Confirm extracted project details</h2>
      <p className="text-sm text-gray-500 mb-5">Review all details and fill in missing or uncertain fields before analysis.</p>
      <p className="mb-4 text-xs text-slate-600"><span className="required-marker" aria-hidden="true">*</span> indicates a required field. Length and road-segment selection are optional.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Project type" {...fieldProps("project_type")}>
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

        <Field label="Road name" {...fieldProps("road_name")}>
          <input className="input" value={form.road_name ?? ""}
            onChange={(e) => update("road_name", e.target.value || null)} />
        </Field>

        <Field label="Start date" {...fieldProps("start_date")}>
          <input type="date" className="input" value={form.start_date ?? ""}
            onChange={(e) => update("start_date", e.target.value || null)} />
        </Field>

        <Field label="End date" {...fieldProps("end_date")}>
          <input type="date" className="input" value={form.end_date ?? ""}
            onChange={(e) => update("end_date", e.target.value || null)} />
        </Field>

        <Field label="Length (metres)" {...fieldProps("length_m")}>
          <input type="number" step="any" className="input" value={form.length_m ?? ""}
            onChange={(e) => update("length_m", e.target.value ? Number(e.target.value) : null)} />
        </Field>

        <Field label="Lane closure" {...fieldProps("lane_closure")}>
          <select className="input" value={form.lane_closure ?? ""}
            onChange={(e) => update("lane_closure", e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Select lane impact</option>
            <option value={0}>No</option>
            <option value={1}>Yes</option>
          </select>
        </Field>

        <Field label="Organization" {...fieldProps("organization")}>
          <input className="input" value={form.organization ?? ""}
            onChange={(e) => update("organization", e.target.value || null)} />
        </Field>
      </div>

      <RoadPicker name={form.road_name ?? ""} selectedId={form.road_segment_id} onSelect={(road) => setForm((prev) => ({ ...prev, road_segment_id: road?.id ?? null, ...(road ? { road_name: road.properties.road_name } : {}) }))} />
      <div className="mt-4">
        <Field label="Project description" {...fieldProps("description")}>
          <textarea className="input w-full" rows={3} value={form.description ?? ""}
            onChange={(e) => update("description", e.target.value || null)} />
        </Field>
      </div>

      {displayedError && (
        <p role="alert" className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {displayedError}
        </p>
      )}

      <div className="flex gap-3 mt-6">
        <button type="button" onClick={onBack}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          ← Back
        </button>
        <button type="submit" disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors">
          {loading ? "Saving…" : "Confirm & Analyze →"}
        </button>
      </div>
    </form>
  );
}

interface FieldControlProps {
  id?: string;
  name?: string;
  required?: boolean;
  onBlur?: () => void;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
}

function Field({ label, name, required, error, onBlur, children }: {
  label: string; name: FormField; required: boolean; error?: string; onBlur: () => void;
  children: React.ReactElement<FieldControlProps>;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className={`field-label${error ? " field-label-error" : ""}`}><span id={labelId}>{label}</span>{required && <span className="required-marker" aria-hidden="true"> *</span>}</label>
      {cloneElement(children, { id, name, required, onBlur, "aria-required": required || undefined,
        "aria-invalid": Boolean(error), "aria-describedby": error ? errorId : undefined, "aria-labelledby": labelId })}
      <p id={errorId} className="field-feedback">{error ?? ""}</p>
    </div>
  );
}
