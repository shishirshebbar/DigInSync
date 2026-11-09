"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ExtractedProject } from "@/types";
import { clearDraft, setDraftDirty, useMemoryState, useUnloadWarning, useHydrated } from "@/lib/drafts";
import { useRequestGuard } from "@/lib/use-request-guard";
import RoadPicker from "./RoadPicker";
import { Field } from "./FormField";
import AIProjectAssist from "./AIProjectAssist";
import { Modal, Notice } from "./ui";

export const blankProject: ExtractedProject = {
  project_type: null,
  road_name: null,
  organization: null,
  description: null,
  start_date: null,
  end_date: null,
  length_m: null,
  lane_closure: null,
  road_segment_id: null,
};
type FormField = Exclude<keyof ExtractedProject, "road_segment_id">;
type Submission =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; id: string }
  | { status: "failed"; message: string };
const order: FormField[] = [
  "organization",
  "project_type",
  "description",
  "road_name",
  "start_date",
  "end_date",
  "length_m",
  "lane_closure",
];
const labels: Record<FormField, string> = {
  organization: "Organization",
  project_type: "Project type",
  description: "Project description",
  road_name: "Road name",
  start_date: "Start date",
  end_date: "End date",
  length_m: "Length (metres)",
  lane_closure: "Lane closure",
};

function validate(form: ExtractedProject) {
  const errors: Partial<Record<FormField, string>> = {};
  for (const field of order)
    if (
      field !== "length_m" &&
      (form[field] == null || (typeof form[field] === "string" && !String(form[field]).trim()))
    )
      errors[field] = `${labels[field]} is required.`;
  if (form.start_date && form.end_date && form.end_date <= form.start_date)
    errors.end_date = "End date must be after start date.";
  if (form.length_m != null && (!Number.isFinite(form.length_m) || form.length_m <= 0))
    errors.length_m = "Length must be a positive number.";
  if (form.lane_closure != null && form.lane_closure !== 0 && form.lane_closure !== 1)
    errors.lane_closure = "Select whether a lane will be closed.";
  return errors;
}

export default function ProjectConfirmation({
  project,
  onConfirmed,
}: {
  project: ExtractedProject;
  onConfirmed: (project: ExtractedProject, id: string) => void;
}) {
  const [form, setForm] = useMemoryState<ExtractedProject>("new-project", project);
  const hydrated = useHydrated();
  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submission, setSubmission] = useMemoryState<Submission>("new-project:submission", { status: "idle" });
  const busy = submission.status === "saving";
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const beginRequest = useRequestGuard();
  const errors = validate(form);
  const invalid = order.find((field) => errors[field]);
  const dirty = Object.values(form).some((value) => value != null && value !== "");
  useUnloadWarning("new-project", dirty);
  function update(field: keyof ExtractedProject, value: string | number | null) {
    setError(null);
    setForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "road_name" ? { road_segment_id: null } : {}),
    }));
  }
  function props(field: FormField) {
    return {
      name: field,
      label: labels[field],
      required: field !== "length_m",
      error: touched[field] || submitted ? errors[field] : undefined,
      onBlur: () => setTouched((previous) => ({ ...previous, [field]: true })),
    };
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setError(null);
    if (invalid) {
      event.currentTarget.querySelector<HTMLElement>(`[name="${invalid}"]`)?.focus();
      return;
    }
    const active = beginRequest();
    setSubmission({ status: "saving" });
    try {
      const created = (await api.createProject({
        organization: form.organization?.trim(),
        project_type: form.project_type,
        description: form.description?.trim(),
        road_name: form.road_name?.trim(),
        road_segment_id: form.road_segment_id ?? null,
        start_date: form.start_date,
        end_date: form.end_date,
        length_m: form.length_m,
        lane_closure: form.lane_closure,
      })) as { id: string };
      setForm(blankProject);
      clearDraft("new-project");
      setDraftDirty("new-project", false);
      setSubmission({ status: "saved", id: created.id });
      if (active()) onConfirmed(form, created.id);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Unable to save project.";
      setSubmission({ status: "failed", message });
    }
  }
  return (
    <form
      className="panel"
      aria-label="Project details"
      noValidate
      onSubmit={(event) => void create(event)}
    >
      <div className="panel-header">
        <div>
          <h2>Project details</h2>
          <p>
            <span className="required-marker" aria-hidden="true">
              *
            </span>{" "}
            Required fields. Length and road-segment selection are optional.
          </p>
        </div>
        <span className="badge">Not saved</span>
      </div>
      <fieldset disabled={busy || !hydrated}>
        <AIProjectAssist
          current={form}
          onApply={(changes) => {
            setError(null);
            setForm((previous) => ({
              ...previous,
              ...changes,
              ...(changes.road_name && changes.road_name !== previous.road_name
                ? { road_segment_id: null }
                : {}),
            }));
          }}
        />
        <section className="form-section" aria-label="Project information">
          <h3>01 · Project information</h3>
          <p className="form-section-description">
            Identify the responsible team and the work being proposed.
          </p>
          <div className="form-grid">
            <Field {...props("organization")}>
              <input
                className="input"
                maxLength={200}
                value={form.organization ?? ""}
                onChange={(event) => update("organization", event.target.value || null)}
                placeholder="Responsible agency or team"
              />
            </Field>
            <Field {...props("project_type")}>
              <select
                className="input"
                value={form.project_type ?? ""}
                onChange={(event) => update("project_type", event.target.value || null)}
              >
                <option value="">Select a project type</option>
                {[
                  "water_pipeline",
                  "telecom",
                  "electricity",
                  "road_repair",
                  "drainage",
                  "utility",
                  "utility_maintenance",
                  "street_light",
                ].map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-wide">
              <Field {...props("description")}>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={4000}
                  value={form.description ?? ""}
                  onChange={(event) => update("description", event.target.value || null)}
                  placeholder="Describe the scope and purpose of this work"
                />
              </Field>
            </div>
          </div>
        </section>
        <section className="form-section" aria-label="Project location">
          <h3>02 · Location</h3>
          <p className="form-section-description">
            Enter a road name. Optionally select an imported road as a location reference.
          </p>
          <Field {...props("road_name")}>
            <input
              className="input"
              maxLength={200}
              value={form.road_name ?? ""}
              onChange={(event) => update("road_name", event.target.value || null)}
              placeholder="e.g. 80 Feet Road"
            />
          </Field>
          <RoadPicker
            name={form.road_name ?? ""}
            selectedId={form.road_segment_id}
            onSelect={(road) =>
              setForm((previous) => ({
                ...previous,
                road_segment_id: road?.id ?? null,
                ...(road ? { road_name: road.properties.road_name } : {}),
              }))
            }
          />
        </section>
        <section className="form-section" aria-label="Schedule and extent">
          <h3>03 · Schedule and extent</h3>
          <p className="form-section-description">
            End dates are exclusive: work ending on 18 November finishes before that day begins.
          </p>
          <div className="form-grid">
            <Field {...props("start_date")}>
              <input
                className="input"
                type="date"
                value={form.start_date ?? ""}
                onChange={(event) => update("start_date", event.target.value || null)}
              />
            </Field>
            <Field {...props("end_date")}>
              <input
                className="input"
                type="date"
                value={form.end_date ?? ""}
                onChange={(event) => update("end_date", event.target.value || null)}
              />
            </Field>
            <Field {...props("length_m")}>
              <input
                className="input"
                type="number"
                step="any"
                value={form.length_m ?? ""}
                onChange={(event) =>
                  update("length_m", event.target.value ? Number(event.target.value) : null)
                }
              />
            </Field>
            <Field {...props("lane_closure")}>
              <select
                className="input"
                value={form.lane_closure ?? ""}
                onChange={(event) =>
                  update(
                    "lane_closure",
                    event.target.value === "" ? null : Number(event.target.value),
                  )
                }
              >
                <option value="">Select lane impact</option>
                <option value={0}>No</option>
                <option value={1}>Yes</option>
              </select>
            </Field>
          </div>
        </section>
      </fieldset>
      {(error || (submitted && invalid)) && (
        <Notice tone="error" alert>
          {error ?? errors[invalid!]}
        </Notice>
      )}
      {submission.status === "failed" && (
        <Notice tone="error" alert>{submission.message}</Notice>
      )}
      {submission.status === "saved" && (
        <Notice tone="success">
          Project saved. <Link className="text-link" href={`/projects/${encodeURIComponent(submission.id)}`}>Open saved project</Link>.
        </Notice>
      )}
      <div className="action-bar">
        <div>
          <p className="text-xs muted">
            {dirty
              ? "Unsaved details · kept during this browser visit"
              : "Your project is created only when you submit."}
          </p>
          <button
            className="btn-quiet"
            type="button"
            disabled={busy || !dirty}
            onClick={() => setDiscard(true)}
          >
            Discard draft
          </button>
        </div>
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating project…" : "Create project and review analysis"}
        </button>
      </div>
      <Modal open={discard} title="Discard project draft?" onClose={() => setDiscard(false)}>
        <p className="text-sm muted">This clears the project details entered during this visit.</p>
        <div className="action-bar">
          <button className="btn-secondary" type="button" onClick={() => setDiscard(false)}>
            Keep editing
          </button>
          <button
            className="btn-danger"
            type="button"
            onClick={() => {
              setForm(blankProject);
              setTouched({});
              setSubmitted(false);
              setError(null);
              clearDraft("new-project");
              setDiscard(false);
            }}
          >
            Discard details
          </button>
        </div>
      </Modal>
    </form>
  );
}
