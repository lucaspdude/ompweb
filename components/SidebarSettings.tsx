"use client";

/**
 * Sidebar preferences. Web-side only — these never touch the upstream omp
 * native config.yml (which the `/api/rocinante-settings` route writes).
 *
 * D12: active-session window length (hours, default 12). Read by the
 * sidebar via localStorage at render time.
 * D18: manual project order — exposed as a "Reset order" affordance that
 * clears `omp-web:project-order`, returning the sidebar to auto-sort.
 */
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { toast } from "./ui/toast";

const ACTIVE_WINDOW_STORAGE_KEY = "omp-web:active-session-window-hours";
const ACTIVE_WINDOW_DEFAULT_HOURS = 12;
const ACTIVE_WINDOW_MIN = 1;
const ACTIVE_WINDOW_MAX = 168; // 7 days

const PROJECT_ORDER_STORAGE_KEY = "omp-web:project-order";

function readActiveWindowHours(): number {
  if (typeof window === "undefined") return ACTIVE_WINDOW_DEFAULT_HOURS;
  try {
    const raw = window.localStorage.getItem(ACTIVE_WINDOW_STORAGE_KEY);
    if (!raw) return ACTIVE_WINDOW_DEFAULT_HOURS;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < ACTIVE_WINDOW_MIN || parsed > ACTIVE_WINDOW_MAX) {
      return ACTIVE_WINDOW_DEFAULT_HOURS;
    }
    return parsed;
  } catch {
    return ACTIVE_WINDOW_DEFAULT_HOURS;
  }
}

export function SidebarSettings() {
  const { t } = useI18n();
  const [hours, setHours] = useState<number>(ACTIVE_WINDOW_DEFAULT_HOURS);

  useEffect(() => {
    setHours(readActiveWindowHours());
  }, []);

  const handleHoursChange = (next: number) => {
    if (!Number.isFinite(next)) return;
    const clamped = Math.max(ACTIVE_WINDOW_MIN, Math.min(ACTIVE_WINDOW_MAX, next));
    setHours(clamped);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(ACTIVE_WINDOW_STORAGE_KEY, String(clamped));
      } catch {
        // ignore quota / privacy-mode errors
      }
    }
  };

  const handleResetOrder = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(PROJECT_ORDER_STORAGE_KEY);
    } catch {
      // ignore
    }
    toast.info(t("settings.sidebar.orderResetToast"));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <header>
        <h2 className="display-serif" style={{ margin: 0, fontSize: 18 }}>
          {t("settings.sidebar.title")}
        </h2>
        <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
          {t("settings.sidebar.description")}
        </p>
      </header>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label
          htmlFor="sidebar-active-window"
          style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
        >
          {t("settings.sidebar.activeWindow")}
        </label>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
          {t("settings.sidebar.activeWindowDesc")}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            id="sidebar-active-window"
            type="number"
            min={ACTIVE_WINDOW_MIN}
            max={ACTIVE_WINDOW_MAX}
            step={1}
            value={hours}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(next)) handleHoursChange(next);
            }}
            style={{
              width: 80,
              padding: "6px 8px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-control)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {t("settings.sidebar.activeWindowUnit")}
          </span>
        </div>
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          type="button"
          onClick={handleResetOrder}
          style={{
            alignSelf: "flex-start",
            padding: "6px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-control)",
            background: "var(--bg-hover)",
            color: "var(--text)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {t("settings.sidebar.orderReset")}
        </button>
      </section>
    </div>
  );
}

export { ACTIVE_WINDOW_STORAGE_KEY, ACTIVE_WINDOW_DEFAULT_HOURS };
