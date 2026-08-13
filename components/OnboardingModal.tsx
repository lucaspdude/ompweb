"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { OnboardingStepper } from "./OnboardingStepper";
import { OnboardingOmpStep } from "./OnboardingOmpStep";
import { OnboardingAgentDirStep } from "./OnboardingAgentDirStep";
import { OnboardingProvidersStep } from "./OnboardingProvidersStep";
import { OnboardingModelStep } from "./OnboardingModelStep";
import { OnboardingDoneStep } from "./OnboardingDoneStep";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

export type OnboardingStepIndex = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = [
  "onboarding.steps.welcome",
  "onboarding.steps.omp",
  "onboarding.steps.agentDir",
  "onboarding.steps.providers",
  "onboarding.steps.model",
  "onboarding.steps.done",
] as const;

const STORAGE_KEY = "rocinante:onboarding-step";

function loadLastCompletedStep(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n <= 5 ? n : 0;
  } catch {
    return 0;
  }
}

interface Props {
  /** When true, the modal acts as a setup wizard (skip is allowed in all
   * steps). When false, the modal is BLOCKING — only the "Required" steps
   * (1-4) can be advanced; the Welcome and Done steps are kept minimal. */
  wizardMode: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinished?: () => void;
}

export function OnboardingModal({ wizardMode, open, onOpenChange, onFinished }: Props) {
  const { t } = useI18n();
  const { status, refresh } = useOnboardingStatus(loadLastCompletedStep());
  const [step, setStep] = useState<OnboardingStepIndex>(0);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);

  // Resume from the last completed step when opening (D12).
  useEffect(() => {
    if (open) {
      const last = loadLastCompletedStep();
      setStep(Math.min(last + 1, 5) as OnboardingStepIndex);
    }
  }, [open]);

  const persistStep = useCallback((completed: number) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(completed));
    } catch { /* ignore */ }
  }, []);

  const advance = useCallback(() => {
    setStep((s) => {
      const next = Math.min(s + 1, 5) as OnboardingStepIndex;
      persistStep(s);
      return next;
    });
  }, [persistStep]);

  const back = useCallback(() => {
    setStep((s) => Math.max(0, s - 1) as OnboardingStepIndex);
  }, []);

  const handleFinish = useCallback(() => {
    persistStep(5);
    onOpenChange(false);
    onFinished?.();
  }, [persistStep, onOpenChange, onFinished]);

  const handleSkipAll = useCallback(() => {
    setSkipConfirmOpen(false);
    persistStep(5);
    onOpenChange(false);
    onFinished?.();
  }, [persistStep, onOpenChange, onFinished]);

  return (
    <>
      <Dialog open={open} onOpenChange={() => { /* no-op; controlled by onOpenChange via close action */ }}>
        <DialogContent
          ariaLabel={t("onboarding.welcome.title")}
          style={{ width: 720, maxWidth: "min(94vw, 720px)", padding: 0, overflow: "hidden" }}
        >
          <div style={{ padding: "20px 28px 0" }}>
            <OnboardingStepper
              steps={STEP_LABELS.map((key) => t(key))}
              current={step}
            />
          </div>
          <div style={{ padding: "16px 28px 24px", minHeight: 320 }}>
            {step === 0 && (
              <WelcomeStep
                onStart={advance}
                onSkip={wizardMode ? handleSkipAll : () => setSkipConfirmOpen(true)}
              />
            )}
            {step === 1 && (
              <OnboardingOmpStep
                status={status}
                onRefresh={refresh}
                onNext={advance}
                onBack={back}
              />
            )}
            {step === 2 && (
              <OnboardingAgentDirStep
                status={status}
                onRefresh={refresh}
                onNext={advance}
                onBack={back}
              />
            )}
            {step === 3 && (
              <OnboardingProvidersStep
                status={status}
                onRefresh={refresh}
                onNext={advance}
                onBack={back}
              />
            )}
            {step === 4 && (
              <OnboardingModelStep
                status={status}
                onRefresh={refresh}
                onNext={advance}
                onBack={back}
              />
            )}
            {step === 5 && (
              <OnboardingDoneStep
                onFinish={handleFinish}
                onOpenSettings={() => {
                  onOpenChange(false);
                  onFinished?.();
                  // Open Settings — dispatch a custom event AppShell listens for.
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("rocinante:open-settings"));
                  }
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Skip confirmation — only when blocking mode (first-run). */}
      <Dialog open={skipConfirmOpen} onOpenChange={setSkipConfirmOpen}>
        <DialogContent
          ariaLabel={t("onboarding.welcome.skipConfirmTitle")}
          style={{ width: 420, maxWidth: "min(94vw, 420px)", padding: 22 }}
        >
          <DialogTitle>{t("onboarding.welcome.skipConfirmTitle")}</DialogTitle>
          <div style={{ height: 8 }} />
          <p style={{ margin: "0 0 18px", fontSize: 13, lineHeight: 1.55, color: "var(--text-muted)" }}>
            {t("onboarding.welcome.skipConfirmBody")}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => setSkipConfirmOpen(false)}
            >
              {t("onboarding.welcome.skipConfirmClose")}
            </Button>
            <Button
              variant="danger"
              onClick={handleSkipAll}
            >
              {t("onboarding.welcome.skip")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WelcomeStep({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>{t("onboarding.welcome.title")}</h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-muted)" }}>
        {t("onboarding.welcome.subtitle")}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onSkip}>{t("onboarding.welcome.skip")}</Button>
        <Button variant="primary" onClick={onStart}>{t("onboarding.welcome.start")}</Button>
      </div>
    </div>
  );
}
