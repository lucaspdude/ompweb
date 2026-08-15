"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { OnboardingStepper } from "./OnboardingStepper";
import { OnboardingProvidersStep } from "./OnboardingProvidersStep";
import { OnboardingModelStep } from "./OnboardingModelStep";
import { OnboardingDoneStep } from "./OnboardingDoneStep";
import { OnboardingSecurityStep } from "./OnboardingSecurityStep";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

// The flow now has 4 steps instead of 6. The omp and agentDir steps were
// removed because the install script (scripts/install.sh) automatically
// installs omp and seeds ~/.omp/agent — those steps were redundant on
// first-run AND on wizard re-runs.
export type OnboardingStepIndex = 0 | 1 | 2 | 3 | 4;

const STEP_LABELS = [
  "onboarding.steps.welcome",
  "onboarding.steps.security",
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
    return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 0;
  } catch {
    return 0;
  }
}

interface Props {
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
      setStep(Math.min(last + 1, 4) as OnboardingStepIndex);
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
      const next = Math.min(s + 1, 4) as OnboardingStepIndex;
      persistStep(s);
      return next;
    });
  }, [persistStep]);

  const back = useCallback(() => {
    setStep((s) => Math.max(0, s - 1) as OnboardingStepIndex);
  }, []);

  const handleFinish = useCallback(() => {
    persistStep(4);
    onOpenChange(false);
    onFinished?.();
  }, [persistStep, onOpenChange, onFinished]);

  const handleSkipAll = useCallback(() => {
    setSkipConfirmOpen(false);
    persistStep(4);
    onOpenChange(false);
    onFinished?.();
  }, [persistStep, onOpenChange, onFinished]);

  return (
    <>
      <Dialog open={open} onOpenChange={() => { /* no-op; controlled via close action */ }}>
        <DialogContent
          ariaLabel={t("onboarding.welcome.title")}
          style={{
            width: 900,
            maxWidth: "min(94vw, 900px)",
            height: "min(82vh, 720px)",
            maxHeight: "min(94vh, 720px)",
            padding: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/*
            Fixed header — the Stepper stays visible at the top while the
            user scrolls long content (provider list, model list, etc.).
           */}
          <header
            style={{
              flexShrink: 0,
              padding: "20px 28px 16px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <OnboardingStepper
              steps={STEP_LABELS.map((key) => t(key))}
              current={step}
            />
          </header>

          {/*
            Scrollable content area. Each step renders its own layout
            inside this flex-1 + overflow:auto container, so providers
            with long lists and the model picker both stay usable
            without overflowing the dialog.
           */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "20px 28px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {step === 0 && (
              <WelcomeStep
                onStart={advance}
                onSkip={wizardMode ? handleSkipAll : () => setSkipConfirmOpen(true)}
              />
            )}
            {step === 1 && (
              <OnboardingSecurityStep
                onAdvance={advance}
                onSkip={wizardMode ? handleSkipAll : () => setSkipConfirmOpen(true)}
              />
            )}
            {step === 2 && (
              <OnboardingProvidersStep
                status={status}
                onRefresh={refresh}
              />
            )}
            {step === 3 && (
              <OnboardingModelStep
                status={status}
                onRefresh={refresh}
              />
            )}
            {step === 4 && (
              <OnboardingDoneStep
                onFinish={handleFinish}
                onOpenSettings={() => {
                  onOpenChange(false);
                  onFinished?.();
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("rocinante:open-settings"));
                  }
                }}
              />
            )}
          </div>

          {/*
            Fixed footer — the action buttons (Back / Skip / Next / Done)
            stay anchored at the bottom regardless of content scroll.
           */}
          <footer
            style={{
              flexShrink: 0,
              padding: "12px 28px 16px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Steps 1 (Security) and 4 (Done) render their own nav inside
                the content — hide the modal footer there to avoid showing
                two "advance" buttons in the same step. */}
            {step !== 1 && step !== 4 && (
              <>
                {step > 0 ? (
                  <Button variant="secondary" onClick={back}>
                    {t("onboarding.common.back")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={wizardMode ? handleSkipAll : () => setSkipConfirmOpen(true)}
                  >
                    {t("onboarding.welcome.skip")}
                  </Button>
                )}
                {step === 0 && (
                  <Button variant="primary" onClick={advance}>
                    {t("onboarding.welcome.start")}
                  </Button>
                )}
                {step === 2 && (
                  <Button variant="primary" onClick={advance}>
                    {t("onboarding.common.next")}
                  </Button>
                )}
                {step === 3 && (
                  <Button variant="primary" onClick={advance}>
                    {t("onboarding.common.next")}
                  </Button>
                )}
              </>
            )}
          </footer>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, justifyContent: "center", flex: 1, minHeight: 0 }}>
      <h2 style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>{t("onboarding.welcome.title")}</h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-muted)" }}>
        {t("onboarding.welcome.subtitle")}
      </p>
    </div>
  );
}
