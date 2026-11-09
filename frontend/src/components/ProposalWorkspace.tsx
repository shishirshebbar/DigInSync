"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  AuditEvent,
  DemoConfig,
  DraftTask,
  Proposal,
  ProposalContent,
  Workplan,
} from "@/types";
import { useMemoryState, useUnloadWarning } from "@/lib/drafts";
import { validateProposal, type TaskErrors } from "@/lib/proposal-validation";
import { useRequestGuard } from "@/lib/use-request-guard";
import PrepareProposalButton from "./PrepareProposalButton";
import WorkflowTracker from "./WorkflowTracker";
import { Field } from "./FormField";
import {
  EmptyState,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SectionNav,
  StatusBadge,
  Warnings,
  displayDate,
} from "./ui";

const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : "Request failed. Please try again.";
const contentOf = (plan: Proposal): ProposalContent => ({
  notes: plan.notes,
  tasks: plan.tasks,
  related_project_ids: plan.project_snapshots
    .filter((item) => item.id !== plan.project_id)
    .map((item) => item.id),
});

export default function ProposalWorkspace({ id }: { id: string }) {
  const params = useSearchParams();
  const [plan, setPlan] = useMemoryState<Proposal | null>(`proposal:${id}:baseline`, null);
  const [content, setContent] = useMemoryState<ProposalContent>(`proposal:${id}:content`, {
    notes: "",
    tasks: [],
    related_project_ids: [],
  });
  const dirty = plan !== null && JSON.stringify(content) !== JSON.stringify(contentOf(plan));
  const dirtyRef = useRef(dirty);
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [workplan, setWorkplan] = useState<Workplan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [showValidation, setShowValidation] = useState(false);
  const lock = useRef(false);
  const beginDecision = useRequestGuard();
  const requestedView = params.get("view");
  const view =
    requestedView === "history"
      ? "history"
      : requestedView === "review" || plan?.status !== "DRAFT" || config?.enabled !== true
        ? "review"
        : "draft";
  const editable = plan?.status === "DRAFT" && config?.enabled === true;
  const validation = validateProposal(content);
  useUnloadWarning(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (plan) document.title = `${plan.option_name} · revision ${plan.revision} | DigInSync`;
  }, [plan]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [saved, demo, history] = await Promise.allSettled([
        api.getProposal(id),
        api.demoConfig(),
        api.proposalEvents(id),
      ]);
      if (!active) return;
      const failures: string[] = [];
      if (saved.status === "fulfilled") {
        if (!dirtyRef.current) {
          setPlan(saved.value);
          setContent(contentOf(saved.value));
        } else
          failures.push(
            "Your unsaved edits have been retained. Save them, or discard them to load the current saved revision.",
          );
      } else failures.push(`Proposal: ${message(saved.reason)}`);
      if (demo.status === "fulfilled") setConfig(demo.value);
      else {
        setConfig(null);
        failures.push(`Review availability: ${message(demo.reason)}`);
      }
      if (history.status === "fulfilled") setEvents(history.value);
      else failures.push(`Decision history: ${message(history.reason)}`);
      if (saved.status === "fulfilled" && saved.value.workplan_id) {
        try {
          const value = await api.getWorkplan(saved.value.workplan_id);
          if (active) setWorkplan(value);
        } catch (failure) {
          failures.push(`Workplan: ${message(failure)}`);
        }
      }
      if (active) {
        setAcknowledged(false);
        setError(
          failures.length
            ? `Some saved details could not be refreshed. Previously loaded details may be out of date. ${failures.join(" ")}`
            : null,
        );
        setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
    // Load only on record changes or explicit refresh; edits must not trigger background reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refresh]);

  function edit(next: ProposalContent) {
    dirtyRef.current = true;
    setContent(next);
    setAcknowledged(false);
  }
  function updateTask(taskId: string, field: keyof DraftTask, value: string | null) {
    edit({
      ...content,
      tasks: content.tasks.map((task) => (task.id === taskId ? { ...task, [field]: value } : task)),
    });
  }
  function reload() {
    dirtyRef.current = false;
    setAcknowledged(false);
    setRefresh((value) => value + 1);
  }
  async function decide(action: "save" | "approve" | "reject") {
    if (!plan || lock.current || loading) return;
    if (action === "save" && Object.keys(validation).length) {
      setShowValidation(true);
      setError("Review the highlighted task fields before saving.");
      const first = content.tasks.find((task) => validation[task.id]);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `[data-task-id="${CSS.escape(first!.id)}"] [aria-invalid="true"]`,
          )
          ?.focus(),
      );
      return;
    }
    lock.current = true;
    const active = beginDecision();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === "save") {
        const saved = await api.updateProposal(id, plan.revision, content);
        if (active()) {
          dirtyRef.current = false;
          setPlan(saved);
          setContent(contentOf(saved));
          setShowValidation(false);
          setNotice(`Draft revision ${saved.revision} saved.`);
        }
      } else if (action === "approve") {
        const generated = await api.approvePlan(id, plan.revision);
        if (active()) {
          setWorkplan(generated);
          setPlan({
            ...plan,
            status: "APPROVED",
            workplan_id: generated.id,
            decided_by: generated.approved_by,
            decided_at: generated.approved_at,
          });
          setNotice(
            "Local approval recorded and workplan generated. Original project dates unchanged.",
          );
        }
      } else {
        const rejected = await api.rejectProposal(id, plan.revision, reason.trim());
        if (active()) {
          setPlan(rejected);
          setNotice("Local rejection recorded.");
          setRejectOpen(false);
        }
      }
      if (active()) {
        setAcknowledged(false);
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (active()) {
        setError(message(failure));
        setAcknowledged(false);
      }
    } finally {
      lock.current = false;
      if (active()) setBusy(false);
    }
  }

  if (!plan)
    return (
      <main id="main-content" className="workspace">
        <PageHeader
          title="Coordination proposal"
          back={{ href: "/proposals", label: "Proposals" }}
        />
        <Panel>
          {error ? (
            <>
              <Notice tone="error" alert>
                {error}
              </Notice>
              <button className="btn-secondary mt-4" onClick={reload}>
                Retry loading proposal
              </button>
            </>
          ) : (
            <p role="status">Loading proposal…</p>
          )}
        </Panel>
      </main>
    );
  const base = plan.project_snapshots.find((item) => item.id === plan.project_id);
  const candidates = [
    ...new Map(
      [...plan.project_snapshots, ...plan.available_projects].map((item) => [item.id, item]),
    ).values(),
  ].filter((item) => item.id !== plan.project_id);
  const saved = contentOf(plan);
  const sectionItems = [
    { key: "draft", label: editable ? "Draft" : "Details" },
    { key: "review", label: "Review" },
    { key: "history", label: "Decision history" },
  ].filter((item) => item.key !== "draft" || editable);
  return (
    <main id="main-content" className="workspace space-y-6">
      <PageHeader
        title={plan.option_name}
        back={{ href: "/proposals", label: "Proposals" }}
        description={`${base?.organization ?? "Coordination proposal"} · ${base?.road_name ?? "Project location unrecorded"}`}
        actions={
          <>
            <button
              className="btn-secondary"
              disabled={busy || loading}
              onClick={() => (dirty ? setDiscardOpen(true) : reload())}
            >
              {dirty ? "Discard edits and reload" : "Reload proposal"}
            </button>
            <Link
              className="btn-secondary"
              href={`/projects/${encodeURIComponent(plan.project_id)}`}
            >
              Open project analysis and map
            </Link>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={plan.status} />
        <span className="text-xs muted">
          {plan.status} · reviewed draft revision {plan.revision}
        </span>
        {dirty && <span className="badge badge-warning">Unsaved edits</span>}
      </div>
      <WorkflowTracker mode="proposal" proposalId={id} />
      {notice && (
        <div role="status">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      {loading && (
        <p role="status" className="text-xs muted">
          Refreshing saved proposal details and decision history. Previously loaded information
          remains visible.
        </p>
      )}
      {error && (
        <Notice tone="error" alert>
          {error}
        </Notice>
      )}
      {config && !config.enabled && (
        <Notice tone="warning">
          Demo editing and decisions are disabled on this server. Saved proposals remain readable.
        </Notice>
      )}
      <SectionNav
        label="Proposal sections"
        items={sectionItems.map(({ key, label }) => ({
          label,
          href: `/proposals/${encodeURIComponent(id)}?view=${key}`,
          active: view === key,
        }))}
      />

      {view === "draft" && editable && (
        <Panel
          title="Edit coordination draft"
          description="Confirm participating projects and task responsibilities. Save changes before reviewing a decision."
        >
          <fieldset disabled={busy || loading} className="space-y-6">
            <label className="field-label">
              Coordination notes
              <textarea
                className="input mt-2"
                rows={3}
                maxLength={4000}
                value={content.notes}
                onChange={(event) => edit({ ...content, notes: event.target.value })}
              />
            </label>
            <div>
              <h3 className="text-sm font-semibold">Participating candidate projects</h3>
              <p className="text-xs muted mt-1 mb-4">
                The base project is included. Add candidates explicitly; road-name matches are not
                verified proximity.
              </p>
              {!candidates.length && (
                <p className="text-sm muted">No additional candidates available.</p>
              )}
              {candidates.map((item) => (
                <label className="candidate-check" key={item.id}>
                  <input
                    type="checkbox"
                    checked={content.related_project_ids.includes(item.id)}
                    disabled={
                      !content.related_project_ids.includes(item.id) &&
                      content.related_project_ids.length >= 50
                    }
                    onChange={(event) =>
                      edit({
                        ...content,
                        related_project_ids: event.target.checked
                          ? [...content.related_project_ids, item.id]
                          : content.related_project_ids.filter((key) => key !== item.id),
                      })
                    }
                  />
                  <span>
                    {item.organization} · {item.project_type} · {item.road_name}
                    <small>
                      {displayDate(item.start_date)} – {displayDate(item.end_date)} (end exclusive)
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Proposed tasks</h3>
              <p className="text-xs muted">
                End dates are exclusive. Dependencies must finish before their dependent tasks
                start.
              </p>
              {content.tasks.length === 0 && (
                <EmptyState title="No tasks in this draft">
                  Add at least one confirmed task before approval.
                </EmptyState>
              )}
              {content.tasks.map((task, index) => (
                <TaskEditor
                  key={task.id}
                  task={task}
                  index={index}
                  tasks={content.tasks}
                  errors={showValidation ? validation[task.id] : undefined}
                  onChange={(field, value) => updateTask(task.id, field, value)}
                  onRemove={() =>
                    edit({
                      ...content,
                      tasks: content.tasks
                        .filter((item) => item.id !== task.id)
                        .map((item) =>
                          item.dependency === task.id ? { ...item, dependency: null } : item,
                        ),
                    })
                  }
                />
              ))}
              <button
                className="btn-secondary"
                type="button"
                disabled={content.tasks.length >= 100}
                onClick={() =>
                  edit({
                    ...content,
                    tasks: [
                      ...content.tasks,
                      {
                        id: crypto.randomUUID(),
                        task: "",
                        organization: base?.organization ?? "",
                        start_date: base?.start_date ?? "",
                        end_date: base?.end_date ?? "",
                        dependency: null,
                        notes: "",
                      },
                    ],
                  })
                }
              >
                Add task
              </button>
            </div>
          </fieldset>
          <div className="action-bar">
            <p role="status" className="text-xs muted">
              {dirty
                ? "Unsaved edits. Save and review before deciding."
                : "Viewing the saved revision."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={busy || loading}
                onClick={() => void decide("save")}
              >
                {busy ? "Saving…" : "Save draft revision"}
              </button>
              <Link className="btn-secondary" href={`/proposals/${id}?view=review`}>
                Review saved revision
              </Link>
            </div>
          </div>
        </Panel>
      )}

      {view === "review" && (
        <>
          {dirty && (
            <Notice tone="warning">
              This review shows the saved revision. Unsaved edits are retained in Draft and cannot
              be approved.
            </Notice>
          )}
          <Panel title="Saved proposal review" description={plan.description}>
            <dl className="document-grid">
              <div>
                <dt>Tradeoffs</dt>
                <dd>{plan.tradeoffs}</dd>
              </div>
              <div>
                <dt>Original project schedule</dt>
                <dd>
                  {base
                    ? `${displayDate(base.start_date)} – ${displayDate(base.end_date)} (end exclusive)`
                    : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt>Coordination notes</dt>
                <dd className="whitespace-pre-wrap">{plan.notes || "No notes recorded."}</dd>
              </div>
              <div>
                <dt>Participating projects</dt>
                <dd>
                  {plan.project_snapshots.map((item) => (
                    <p key={item.id}>
                      {item.organization} · {item.road_name ?? "Unknown road"}
                    </p>
                  ))}
                </dd>
              </div>
            </dl>
            <div className="mt-6">
              <h3 className="text-base font-semibold mb-3">Saved tasks</h3>
              <TaskDocument tasks={saved.tasks} />
            </div>
            {plan.analysis_snapshot.baseline && (
              <div className="analysis-summary mt-6">
                <div>
                  <span className="text-xs muted">Candidate projects</span>
                  <strong>{plan.analysis_snapshot.baseline.conflict_count}</strong>
                </div>
                <div>
                  <span className="text-xs muted">Overlapping schedules</span>
                  <strong>{plan.analysis_snapshot.baseline.temporal_overlap_count}</strong>
                </div>
                <div>
                  <span className="text-xs muted">Experimental indicator</span>
                  <strong>
                    {plan.analysis_snapshot.baseline.risk_score}
                    <span className="text-xs font-normal"> /100</span>
                  </strong>
                </div>
              </div>
            )}
            <p className="text-xs muted mt-4">
              Reviewed analysis describes the original schedule. Experimental indicators are not
              verified disruption predictions.
            </p>
            <Warnings
              warnings={plan.analysis_snapshot.warnings ?? []}
              title="Reviewed analysis and warnings"
            />
          </Panel>
          <Panel title={plan.status === "DRAFT" ? "Review decision" : "Recorded decision"}>
            <Notice>
              Demo reviewer: {config?.reviewer ?? "unavailable"}. This records a local coordination
              decision, not agency authorization. Original project dates unchanged.
            </Notice>
            {editable && (
              <fieldset className="mt-5 space-y-4" disabled={busy || loading}>
                <label className="candidate-check">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    disabled={
                      dirty ||
                      !saved.tasks.length ||
                      Object.keys(validateProposal(saved)).length > 0
                    }
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  <span>
                    I reviewed the saved tasks, organizations, dates, and warnings. Approve this
                    coordination workplan only.
                  </span>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="btn-primary"
                    disabled={dirty || !acknowledged || !saved.tasks.length}
                    onClick={() => void decide("approve")}
                  >
                    {busy ? "Recording decision…" : "Approve and generate workplan"}
                  </button>
                  <button
                    className="btn-danger"
                    disabled={dirty}
                    onClick={() => setRejectOpen(true)}
                  >
                    Reject proposal
                  </button>
                </div>
                {!saved.tasks.length && (
                  <p className="text-xs muted">
                    Add and save at least one task in Draft before approval.
                  </p>
                )}
              </fieldset>
            )}
            {plan.decided_by && (
              <p className="text-sm mt-5">
                {plan.status} by demo reviewer {plan.decided_by} at{" "}
                {plan.decided_at
                  ? new Date(plan.decided_at).toLocaleString("en-IN")
                  : "time not recorded"}
                .
                {plan.decision_reason && (
                  <span className="block mt-2">Reason: {plan.decision_reason}</span>
                )}
              </p>
            )}
            {plan.status !== "DRAFT" && plan.option_key && config?.enabled && (
              <PrepareProposalButton
                projectId={plan.project_id}
                optionKey={plan.option_key}
                label="Prepare a new draft"
              />
            )}
          </Panel>
          {(workplan || plan.workplan_id) && (
            <Panel
              title="Joint Workplan"
              description="The saved coordination document is available separately from the proposal."
            >
              <Link
                className="btn-primary"
                href={`/workplans/${encodeURIComponent(workplan?.id ?? plan.workplan_id!)}`}
              >
                Open approved workplan
              </Link>
            </Panel>
          )}
        </>
      )}

      {view === "history" && (
        <Panel
          title="Decision history"
          description="Persistent backend events for saved proposal revisions, separate from browser activity."
        >
          {!events.length && (
            <p className="text-sm muted">No events loaded. Refresh this proposal to try again.</p>
          )}
          <ol className="audit-list">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.event.replaceAll("_", " ")}</strong>
                <p className="record-meta">
                  Revision {event.revision} · {event.actor} ·{" "}
                  {new Date(event.created_at).toLocaleString("en-IN")}
                </p>
                {event.details.reason && <p className="text-sm mt-2">{event.details.reason}</p>}
                {event.details.content && (
                  <details className="mt-3">
                    <summary className="text-link">Saved revision details</summary>
                    <p className="text-sm my-3">
                      {event.details.content.notes || "No notes recorded."}
                    </p>
                    <TaskDocument tasks={event.details.content.tasks} />
                  </details>
                )}
              </li>
            ))}
          </ol>
        </Panel>
      )}
      <Modal
        open={discardOpen}
        title="Discard unsaved edits?"
        onClose={() => setDiscardOpen(false)}
      >
        <p className="text-sm muted">
          Your local edits will be replaced with the latest saved proposal.
        </p>
        <div className="action-bar">
          <button className="btn-secondary" onClick={() => setDiscardOpen(false)}>
            Keep editing
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              setDiscardOpen(false);
              reload();
            }}
          >
            Discard and reload
          </button>
        </div>
      </Modal>
      <Modal
        open={rejectOpen}
        title="Reject proposal"
        onClose={() => {
          if (!busy) setRejectOpen(false);
        }}
      >
        <label className="field-label">
          Rejection reason
          <span className="required-marker" aria-hidden="true">
            {" "}
            *
          </span>
          <textarea
            className="input mt-2"
            maxLength={2000}
            rows={4}
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <p className="text-xs muted mt-3">The reason will be saved with the local decision.</p>
        {error && (
          <Notice tone="error" alert>
            {error}
          </Notice>
        )}
        <div className="action-bar">
          <button className="btn-secondary" disabled={busy} onClick={() => setRejectOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={busy || !reason.trim()}
            onClick={() => void decide("reject")}
          >
            {busy ? "Recording rejection…" : "Record rejection"}
          </button>
        </div>
      </Modal>
    </main>
  );
}

function TaskEditor({
  task,
  index,
  tasks,
  errors,
  onChange,
  onRemove,
}: {
  task: DraftTask;
  index: number;
  tasks: DraftTask[];
  errors?: TaskErrors[string];
  onChange: (field: keyof DraftTask, value: string | null) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(!task.task.trim());
  const [touched, setTouched] = useState<string[]>([]);
  const ownErrors = validateProposal({ notes: "", related_project_ids: [], tasks })[task.id];
  function props(field: keyof DraftTask, label: string, required = false) {
    return {
      name: field,
      label,
      required,
      error: errors?.[field] ?? (touched.includes(field) ? ownErrors?.[field] : undefined),
      onBlur: () =>
        setTouched((previous) => (previous.includes(field) ? previous : [...previous, field])),
    };
  }
  return (
    <details
      className="task-editor"
      data-task-id={task.id}
      open={open || Boolean(errors)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          Task {index + 1} · {task.task || "New task"}
          <small>
            {task.organization || "Organization required"} · {task.start_date} – {task.end_date}
          </small>
        </span>
        <span className="text-xs muted">Edit details</span>
      </summary>
      <div className="form-grid">
        <Field {...props("task", "Task name", true)}>
          <input
            className="input"
            maxLength={300}
            value={task.task}
            onChange={(event) => onChange("task", event.target.value)}
          />
        </Field>
        <Field {...props("organization", "Responsible organization", true)}>
          <input
            className="input"
            maxLength={200}
            value={task.organization}
            onChange={(event) => onChange("organization", event.target.value)}
          />
        </Field>
        <Field {...props("start_date", "Proposed start", true)}>
          <input
            className="input"
            type="date"
            value={task.start_date}
            onChange={(event) => onChange("start_date", event.target.value)}
          />
        </Field>
        <Field {...props("end_date", "Proposed end (exclusive)", true)}>
          <input
            className="input"
            type="date"
            value={task.end_date}
            onChange={(event) => onChange("end_date", event.target.value)}
          />
        </Field>
        <Field {...props("dependency", "Depends on")}>
          <select
            className="input"
            value={task.dependency ?? ""}
            onChange={(event) => onChange("dependency", event.target.value || null)}
          >
            <option value="">No dependency</option>
            {tasks
              .filter((item) => item.id !== task.id)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.task || "Unnamed task"}
                </option>
              ))}
          </select>
        </Field>
        <Field {...props("notes", "Task notes")}>
          <input
            className="input"
            maxLength={2000}
            value={task.notes}
            onChange={(event) => onChange("notes", event.target.value)}
          />
        </Field>
      </div>
      <button className="btn-danger" type="button" onClick={onRemove}>
        Remove task {index + 1}
      </button>
    </details>
  );
}

export function TaskDocument({ tasks }: { tasks: DraftTask[] }) {
  if (!tasks.length) return <p className="text-sm muted">No saved tasks.</p>;
  return (
    <div className="space-y-3">
      {tasks.map((task, index) => (
        <article className="task-document" key={task.id}>
          <h4>
            {index + 1}. {task.task}
          </h4>
          <dl className="document-grid mt-3">
            <div>
              <dt>Responsible organization</dt>
              <dd>{task.organization}</dd>
            </div>
            <div>
              <dt>Schedule · end exclusive</dt>
              <dd>
                {displayDate(task.start_date)} – {displayDate(task.end_date)}
              </dd>
            </div>
            <div>
              <dt>Depends on</dt>
              <dd>
                {tasks.find((item) => item.id === task.dependency)?.task ??
                  task.dependency ??
                  "No dependency"}
              </dd>
            </div>
            {task.notes && (
              <div>
                <dt>Task notes</dt>
                <dd>{task.notes}</dd>
              </div>
            )}
          </dl>
        </article>
      ))}
    </div>
  );
}
