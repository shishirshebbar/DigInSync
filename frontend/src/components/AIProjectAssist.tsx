"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ExtractedProject } from "@/types";
import { useRequestGuard } from "@/lib/use-request-guard";
import { Modal, Notice } from "./ui";

const labels: Record<string, string> = {
  project_type: "Project type",
  organization: "Organization",
  description: "Project description",
  road_name: "Road name",
  start_date: "Start date",
  end_date: "End date",
  length_m: "Length (metres)",
  lane_closure: "Lane closure",
};

export default function AIProjectAssist({
  current,
  onApply,
}: {
  current: ExtractedProject;
  onApply: (value: Partial<ExtractedProject>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState<ExtractedProject | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beginRequest = useRequestGuard();
  async function extract() {
    if (busy || !description.trim()) return;
    const active = beginRequest();
    setBusy(true);
    setError(null);
    try {
      const value = await api.extractProject(description.trim());
      if (active()) {
        setSuggestions(value);
        setSelected(
          Object.keys(labels).filter(
            (key) =>
              current[key as keyof ExtractedProject] == null ||
              current[key as keyof ExtractedProject] === "",
          ),
        );
      }
    } catch (failure) {
      if (active())
        setError(
          failure instanceof Error
            ? failure.message
            : "Extraction unavailable. Continue entering details manually.",
        );
    } finally {
      if (active()) setBusy(false);
    }
  }
  function apply() {
    const changes = Object.fromEntries(
      Object.entries(suggestions ?? {}).filter(
        ([key, value]) => selected.includes(key) && value != null,
      ),
    );
    onApply(changes);
    setSuggestions(null);
    setExpanded(false);
  }
  return (
    <div className="ai-assist">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div>
          <h3 className="text-sm font-semibold">Have a written project brief?</h3>
          <p className="text-xs muted mt-1">
            Use AI to suggest details, then choose what to apply.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          aria-expanded={expanded}
          aria-controls="description-assist"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide description assistant" : "Fill from a description"}
        </button>
      </div>
      {expanded && (
        <div id="description-assist" className="mt-5 space-y-3">
          <p className="text-xs muted">
            Your description is sent to the configured AI provider. Include the year in dates and
            review all suggestions before creating the project.
          </p>
          <label className="field-label" htmlFor="extraction-description">
            Project description for AI extraction
          </label>
          <textarea
            id="extraction-description"
            className="input"
            rows={4}
            maxLength={4000}
            value={description}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the organization, work, road, dates, and lane impact…"
          />
          {error && (
            <Notice tone="error" alert>
              {error}
            </Notice>
          )}
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || !description.trim()}
            onClick={() => void extract()}
          >
            {busy ? "Reading description…" : "Review suggested details"}
          </button>
        </div>
      )}
      <Modal
        open={suggestions !== null}
        title="Review suggested details"
        onClose={() => setSuggestions(null)}
      >
        <p className="text-sm muted mb-4">
          Only selected suggestions will be applied. Replacements for details you already entered
          are unchecked.
        </p>
        <div className="space-y-3">
          {Object.entries(suggestions ?? {})
            .filter(([key, value]) => key in labels && value != null)
            .map(([key, value]) => (
              <label className="suggestion-row" key={key}>
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, key]
                        : selected.filter((item) => item !== key),
                    )
                  }
                />
                <span>
                  <strong>{labels[key]}</strong>
                  <span className="block mt-1 break-words">
                    {String(value).replaceAll("_", " ")}
                  </span>
                  {current[key as keyof ExtractedProject] != null && (
                    <small className="block muted mt-1">
                      Current: {String(current[key as keyof ExtractedProject])}
                    </small>
                  )}
                </span>
              </label>
            ))}
        </div>
        <div className="action-bar">
          <button type="button" className="btn-secondary" onClick={() => setSuggestions(null)}>
            Keep current details
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={selected.length === 0}
            onClick={apply}
          >
            Apply selected suggestions
          </button>
        </div>
      </Modal>
    </div>
  );
}
