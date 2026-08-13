"use client";

// Renders a "Nm ago" / "Nh ago" / "Nd ago" string for a Unix-second
// timestamp. Auto-refreshes every 30s so the card label stays fresh.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const REFRESH_MS = 30_000;

export function useRelativeTime(unixSeconds: number | null | undefined): string {
  const { t } = useI18n();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixSeconds);
  if (diff < 60) return t("settings.developerTools.gitSsh.relativeTime.justNow");
  if (diff < 3600) return t("settings.developerTools.gitSsh.relativeTime.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86_400) return t("settings.developerTools.gitSsh.relativeTime.hoursAgo", { n: Math.floor(diff / 3600) });
  return t("settings.developerTools.gitSsh.relativeTime.daysAgo", { n: Math.floor(diff / 86_400) });
}
