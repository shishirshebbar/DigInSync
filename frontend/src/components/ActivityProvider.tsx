"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getActivities, getServerActivities, subscribeActivities, type Activity } from "@/lib/activity";

export function useActivities() {
  return useSyncExternalStore(subscribeActivities, getActivities, getServerActivities);
}

const ActivityControls = createContext<(() => void) | null>(null);
export function ActivityButton() {
  const open = useContext(ActivityControls);
  const activities = useActivities();
  const running = activities.filter((item) => item.status === "running").length;
  return <button type="button" className="activity-trigger" aria-haspopup="dialog" onClick={() => open?.()}>
    Activity{running > 0 && <span className="activity-count">{running} running</span>}
  </button>;
}

export function Elapsed({ activity }: { activity: Activity }) {
  const [now, setNow] = useState(activity.startedAt);
  useEffect(() => {
    if (activity.finishedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity.startedAt, activity.finishedAt]);
  const seconds = Math.max(0, Math.floor(((activity.finishedAt ?? now) - activity.startedAt) / 1000));
  return <span>{seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}{!activity.finishedAt && " elapsed"}</span>;
}

export const statusLabels = { running: "Running", completed: "Completed", warning: "Completed with warnings", failed: "Needs attention" };

export function ActivityItem({ activity }: { activity: Activity }) {
  return <li className={`activity-item activity-${activity.status}`} data-operation={activity.operation}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>{activity.title}</strong><span className="process-state">{statusLabels[activity.status]}</span>
    </div>
    <p className="mt-1 text-xs text-slate-500">{activity.context} · <time dateTime={new Date(activity.startedAt).toISOString()}>{new Date(activity.startedAt).toLocaleTimeString()}</time> · <Elapsed activity={activity} /></p>
    <p className="mt-2 text-sm">{activity.summary}</p>
    <details className="mt-2 text-sm"><summary>What this operation does</summary>
      <p className="mt-2 text-slate-600">{activity.explanation}</p>
      <p className="mt-2 text-xs text-slate-500">Internal checks are described together; their individual progress is not reported by the server.</p>
    </details>
    {activity.warnings.length > 0 && <details className="mt-2 text-sm text-amber-900"><summary>{activity.warnings.length} warning(s) to review</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{activity.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </details>}
  </li>;
}

export default function ActivityProvider({ children }: { children: React.ReactNode }) {
  const activities = useActivities();
  const dialog = useRef<HTMLDialogElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const latest = activities.reduce<Activity | undefined>((last, item) => !last || (item.finishedAt ?? item.startedAt) >= (last.finishedAt ?? last.startedAt) ? item : last, undefined);

  function open() {
    trigger.current = document.activeElement as HTMLElement;
    setDrawerOpen(true);
    if (!dialog.current?.open) dialog.current?.showModal();
  }
  function close() { dialog.current?.close(); }
  return <ActivityControls.Provider value={open}>
    {children}
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{latest ? `${latest.title}: ${statusLabels[latest.status]}. ${latest.summary}` : ""}</p>
    <dialog ref={dialog} className="activity-drawer" aria-labelledby="activity-title"
      onClose={() => { setDrawerOpen(false); trigger.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="activity-drawer-content">
        <header className="flex items-start justify-between gap-4">
          <div><p className="eyebrow">This browser visit</p><h2 id="activity-title" className="text-2xl font-semibold">Activity</h2></div>
          <button type="button" className="btn-secondary" onClick={close} autoFocus>Close activity</button>
        </header>
        <p className="my-4 text-sm text-slate-600">Actual requests and confirmed results, with the latest first. History lasts until page reload. Saved proposal decisions remain in Decision history.</p>
        {drawerOpen && (activities.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm">No requests observed during this visit yet.</p>
          : <ol aria-label="Activity history" className="space-y-3">{[...activities].reverse().map((activity) => <ActivityItem key={activity.id} activity={activity} />)}</ol>)}
        <p className="mt-5 text-xs text-slate-500">Up to 100 completed requests and all running requests are shown. Request bodies, credentials and raw server logs are not stored here.</p>
      </div>
    </dialog>
  </ActivityControls.Provider>;
}
