"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ImpactMetrics } from "@/types";
import WardContextPanel from "./WardContextPanel";
import { Notice, PageHeader, Panel } from "./ui";

export default function DataContext() {
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .getImpact()
      .then((value) => {
        if (active) {
          setMetrics(value);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setError(failure instanceof Error ? failure.message : "Unable to load coverage.");
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const coverage = metrics?.spatial_coverage;
  return (
    <main id="main-content" className="workspace space-y-6">
      <PageHeader
        title="Data context"
        description="Understand the available records and their geographic limitations before interpreting project analysis."
      />
      <Notice tone="warning">
        Dataset counts do not establish completeness, verified proximity, or an absence of
        incidents. Ward identifiers are not reconciled across sources.
      </Notice>
      <Panel
        title="Spatial data coverage"
        description="Counts reflect records currently stored in this database."
        actions={
          <button className="btn-secondary" onClick={() => setRefresh((value) => value + 1)}>
            Refresh coverage
          </button>
        }
      >
        {error && (
          <Notice tone="error" alert>
            {error} {metrics && "Previously loaded coverage may be out of date."}
          </Notice>
        )}
        {!metrics && !error && <p role="status">Loading coverage…</p>}
        {coverage && (
          <div
            className="table-region"
            role="region"
            aria-label="Spatial coverage table"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Dataset</th>
                  <th scope="col">Records with geometry / features</th>
                  <th scope="col">Stored records</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Road feature rows", coverage.roads_with_feature_rows, coverage.road_segments],
                  ["Work orders", coverage.geocoded_work_orders, coverage.work_orders],
                  ["Grievances", coverage.geocoded_grievances, coverage.grievances],
                  ["Road repairs", coverage.geocoded_road_repairs, coverage.road_repairs],
                  ["Potholes", coverage.geocoded_potholes, coverage.potholes],
                ].map(([label, count, total]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{Number(count).toLocaleString("en-IN")}</td>
                    <td>{Number(total).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs muted mt-4">
          A feature row does not prove its values are complete. Missing coordinates prevent reliable
          road-level proximity analysis.
        </p>
      </Panel>
      <WardContextPanel />
    </main>
  );
}
