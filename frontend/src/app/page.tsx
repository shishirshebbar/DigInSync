"use client";

import { useState } from "react";
import ProjectInputForm from "@/components/ProjectInputForm";
import ProjectConfirmation from "@/components/ProjectConfirmation";
import ConflictPanel from "@/components/ConflictPanel";
import RiskPanel from "@/components/RiskPanel";
import RecommendationsPanel from "@/components/RecommendationsPanel";
import WhatIfSimulator from "@/components/WhatIfSimulator";
import WorkplanPanel from "@/components/WorkplanPanel";
import { api } from "@/lib/api";
import type { ExtractedProject, ConflictResult, RiskResult, CoordinationResult, Workplan } from "@/types";

type Step =
  | "input"
  | "confirm"
  | "analyzing"
  | "conflicts"
  | "recommendations"
  | "simulator"
  | "workplan";

export default function Home() {
  const [step, setStep] = useState<Step>("input");
  const [project, setProject] = useState<ExtractedProject | null>(null);
  const [conflicts, setConflicts] = useState<ConflictResult | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [coordination, setCoordination] = useState<CoordinationResult | null>(null);
  const [coordinationLoading, setCoordinationLoading] = useState(false);
  const [coordinationError, setCoordinationError] = useState<string | null>(null);
  const [workplan] = useState<Workplan | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  async function analyze(id: string) {
    setStep("analyzing");
    setAnalysisError(null);
    try {
      const conflictResult = await api.analyzeConflicts(id);
      const riskResult = await api.predictRisk(id);
      setConflicts(conflictResult);
      setRisk(riskResult);
      setStep("conflicts");
    } catch (error: unknown) {
      setAnalysisError(error instanceof Error ? error.message : "Analysis failed.");
    }
  }

  async function getCoordination(useAi: boolean) {
    if (!projectId) return;
    setCoordinationLoading(true);
    setCoordinationError(null);
    setCoordination(null);
    try {
      setCoordination(await api.coordinate(projectId, useAi));
      setStep("recommendations");
    } catch (error: unknown) {
      setCoordinationError(error instanceof Error ? error.message : "Coordination failed.");
    } finally {
      setCoordinationLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-blue-700">DigInSync</h1>
          <p className="text-xs text-gray-500">
            One plan. Multiple infrastructure works. One coordinated execution.
          </p>
        </div>
        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
          IBM Bobathon 2026
        </span>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Step: Natural-language input */}
        {step === "input" && (
          <ProjectInputForm
            onExtracted={(extracted) => {
              setProject(extracted);
              setStep("confirm");
            }}
          />
        )}

        {/* Step: Confirm / edit extracted details */}
        {step === "confirm" && project && (
          <ProjectConfirmation
            project={project}
            onConfirmed={(confirmed, id) => {
              setProject(confirmed);
              setProjectId(id);
              void analyze(id);
            }}
            onBack={() => setStep("input")}
          />
        )}

        {/* Step: Analyzing (conflicts + risk running) */}
        {step === "analyzing" && (
          <div className="text-center py-20 text-gray-500">
            {analysisError ? (
              <>
                <p className="text-red-700">{analysisError}</p>
                <button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white" onClick={() => projectId && void analyze(projectId)}>
                  Retry analysis
                </button>
              </>
            ) : (
              <div className="animate-pulse text-blue-600 text-lg font-medium">
                Analyzing available project data and experimental risk…
              </div>
            )}
          </div>
        )}

        {/* Step: Conflict + Risk + Recommendations */}
        {(step === "conflicts" || step === "recommendations") && conflicts && risk && (
          <>
            <ConflictPanel result={conflicts} />
            <RiskPanel result={risk} />
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-sm text-gray-600 mb-3">
                Review template options locally, or request an AI explanation. AI sends
                aggregate conflict counts, overlap duration, location basis and the baseline
                experimental risk indicator to the configured provider—not project names,
                descriptions, organizations, exact dates or locations.
              </p>
              <div className="flex flex-wrap gap-3">
                <button disabled={coordinationLoading} onClick={() => void getCoordination(false)}
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-gray-300">
                  {coordinationLoading ? "Preparing options…" : "Review coordination options"}
                </button>
                <button disabled={coordinationLoading} onClick={() => void getCoordination(true)}
                  className="rounded border border-blue-600 px-4 py-2 text-sm text-blue-700 disabled:opacity-50">
                  Request AI explanation
                </button>
                <button onClick={() => setStep("simulator")}
                  className="rounded border border-gray-400 px-4 py-2 text-sm text-gray-700">
                  Try a schedule change
                </button>
              </div>
              {coordinationError && <p role="alert" className="mt-3 text-sm text-red-700">{coordinationError}</p>}
            </div>
            {step === "recommendations" && coordination && <RecommendationsPanel result={coordination} />}
          </>
        )}

        {/* Step: What-if simulator */}
        {step === "simulator" && projectId && (
          <WhatIfSimulator
            projectId={projectId}
            initialStartDate={project?.start_date ?? ""}
            initialEndDate={project?.end_date ?? ""}
            onBack={() => setStep(coordination ? "recommendations" : "conflicts")}
          />
        )}

        {/* Step: Workplan */}
        {step === "workplan" && workplan && (
          <WorkplanPanel workplan={workplan} />
        )}
      </div>
    </main>
  );
}
