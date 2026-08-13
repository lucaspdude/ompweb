"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(nextPath);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? t("auth.login.failed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [password, router, nextPath, submitting, t]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--text)",
        padding: "0 16px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "min(360px, 100%)",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-panel, 12px)",
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={18} aria-hidden="true" />
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{t("auth.login.title")}</h1>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("auth.login.subtitle")}</p>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("auth.login.passwordLabel")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            disabled={submitting}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--radius-control, 6px)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </label>
        {error ? (
          <p role="alert" style={{ fontSize: 12, color: "var(--danger, #d33)", margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting || password.length === 0}
          style={{
            padding: "8px 14px",
            borderRadius: "var(--radius-control, 6px)",
            border: "none",
            background: "var(--accent, #3b82f6)",
            color: "var(--accent-fg, #fff)",
            fontSize: 13,
            fontWeight: 500,
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting || password.length === 0 ? 0.6 : 1,
          }}
        >
          {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>
      </form>
    </main>
  );
}
