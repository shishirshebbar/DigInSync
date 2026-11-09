"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectCatalog, SavedProject } from "@/types";
import { EmptyState, Notice, PageHeader, Panel, StatusBadge, displayDate } from "./ui";

export default function ProjectRegister() {
  const [catalog, setCatalog] = useState<ProjectCatalog | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api
      .catalog(query, offset)
      .then((value) => {
        if (active) {
          setCatalog(value);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setError(failure instanceof Error ? failure.message : "Unable to load projects.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [query, offset, refresh]);
  function load(nextOffset: number) {
    setBusy(true);
    setOffset(nextOffset);
  }
  function schedule(project: SavedProject) {
    return `${displayDate(project.start_date)} – ${displayDate(project.end_date)}`;
  }
  return (
    <main id="main-content" className="workspace space-y-6">
      <PageHeader
        title="Projects"
        description="Find saved infrastructure work and continue its coordination review."
        actions={
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setRefresh((value) => value + 1);
            }}
          >
            Refresh projects
          </button>
        }
      />
      <Panel>
        <form
          className="flex flex-wrap gap-3 items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setQuery(search.trim());
            setOffset(0);
            setRefresh((value) => value + 1);
          }}
        >
          <label className="grow text-sm font-medium">
            Search by road name
            <input
              className="input mt-2"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="e.g. 80 Feet Road"
            />
          </label>
          <button className="btn-secondary" disabled={busy}>
            Search projects
          </button>
        </form>
      </Panel>
      {busy && (
        <p role="status" className="text-sm muted">
          Loading projects…
        </p>
      )}
      {error && (
        <Notice tone="error" alert>
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setBusy(true);
              setRefresh((value) => value + 1);
            }}
          >
            Retry projects
          </button>
        </Notice>
      )}
      {catalog && (busy || error) && (
        <p className="text-xs muted">
          Previously loaded records remain visible and may be out of date.
        </p>
      )}
      <Panel
        title="Saved projects"
        description={
          catalog
            ? `${catalog.total} matching record${catalog.total === 1 ? "" : "s"}`
            : "Original project schedules"
        }
      >
        {catalog?.total === 0 && (
          <EmptyState
            title="No projects found"
            action={
              <Link href="/projects/new" className="btn-primary">
                New project
              </Link>
            }
          >
            Try another road name or add a project to begin.
          </EmptyState>
        )}
        {!!catalog?.items.length && (
          <>
            <div
              className="table-region desktop-records"
              tabIndex={0}
              role="region"
              aria-label="Saved projects table"
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Project / road</th>
                    <th scope="col">Organization</th>
                    <th scope="col">Original schedule</th>
                    <th scope="col">Location</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.items.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <Link href={`/projects/${encodeURIComponent(project.id)}`}>
                          {project.road_name ?? "Unknown road"}
                        </Link>
                        <small>{project.project_type.replaceAll("_", " ")}</small>
                      </td>
                      <td>{project.organization}</td>
                      <td>
                        {schedule(project)}
                        <small>End exclusive · {project.duration_days} days</small>
                      </td>
                      <td>{project.road_segment_id ? "Road selected" : "Unmapped"}</td>
                      <td>
                        <StatusBadge status={project.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="record-list mobile-records">
              {catalog.items.map((project) => (
                <li key={project.id}>
                  <Link
                    className="record-title"
                    href={`/projects/${encodeURIComponent(project.id)}`}
                  >
                    {project.road_name ?? "Unknown road"}
                  </Link>
                  <p className="record-meta">
                    {project.organization} · {project.project_type.replaceAll("_", " ")}
                  </p>
                  <p className="record-meta">{schedule(project)} (end exclusive)</p>
                  <div className="mt-2 flex gap-2">
                    <StatusBadge status={project.status} />
                    <span className="badge">
                      {project.road_segment_id ? "Road selected" : "Unmapped"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="pagination">
              <button
                className="btn-secondary"
                disabled={busy || offset === 0}
                onClick={() => load(Math.max(0, offset - 25))}
              >
                Previous projects
              </button>
              <span>
                {catalog.offset + 1}–{Math.min(catalog.offset + catalog.limit, catalog.total)} of{" "}
                {catalog.total}
              </span>
              <button
                className="btn-secondary"
                disabled={busy || offset + 25 >= catalog.total}
                onClick={() => load(offset + 25)}
              >
                Next projects
              </button>
            </div>
          </>
        )}
      </Panel>
    </main>
  );
}
