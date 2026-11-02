"use client";

import { useState } from "react";
import ProjectInputForm from "@/components/ProjectInputForm";
import ProjectConfirmation from "@/components/ProjectConfirmation";
import ConflictPanel from "@/components/ConflictPanel";
import RiskPanel from "@/components/RiskPanel";
import RecommendationsPanel from "@/components/RecommendationsPanel";
import WhatIfSimulator from "@/components/WhatIfSimulator";
import WorkplanPanel from "@/components/WorkplanPanel";
import type { ExtractedProject, ConflictResult, RiskResult, CoordinationOption, Workplan } from "@/types";

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
  const [options, setOptions] = useState<CoordinationOption[]>([]);
  const [workplan, setWorkplan] = useState<Workplan | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

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
              setStep("analyzing");
            }}
            onBack={() => setStep("input")}
          />
        )}

        {/* Step: Analyzing (conflicts + risk running) */}
        {step === "analyzing" && (
          <div className="text-center py-20 text-gray-500">
            <div className="animate-pulse text-blue-600 text-lg font-medium">
              Analyzing conflicts and risk…
            </div>
            <p className="text-sm mt-2">
              Querying Bengaluru road data · Running conflict engine · Predicting risk
            </p>
          </div>
        )}

        {/* Step: Conflict + Risk + Recommendations */}
        {(step === "conflicts" || step === "recommendations") && conflicts && risk && (
          <>
            <ConflictPanel result={conflicts} />
            <RiskPanel result={risk} />
            {step === "recommendations" && options.length > 0 && (
              <RecommendationsPanel
                options={options}
                onApprove={(planId) => setStep("workplan")}
                onSimulate={() => setStep("simulator")}
              />
            )}
          </>
        )}

        {/* Step: What-if simulator */}
        {step === "simulator" && projectId && (
          <WhatIfSimulator
            projectId={projectId}
            onBack={() => setStep("recommendations")}
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
