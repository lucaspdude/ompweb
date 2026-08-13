"use client";

import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";

interface Props {
  onFinish: () => void;
  onOpenSettings: () => void;
}

export function OnboardingDoneStep({ onFinish, onOpenSettings }: Props) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>{t("onboarding.done.title")}</h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text-muted)" }}>
        {t("onboarding.done.subtitle")}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onOpenSettings}>{t("onboarding.done.openSettings")}</Button>
        <Button variant="primary" onClick={onFinish}>{t("onboarding.done.finish")}</Button>
      </div>
    </div>
  );
}
