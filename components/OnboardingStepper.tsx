"use client";

interface Props {
  steps: string[];
  current: number;
}

export function OnboardingStepper({ steps, current }: Props) {
  return (
    <div
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={steps.length}
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      {steps.map((label, idx) => {
        const isCurrent = idx === current;
        const isDone = idx < current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                background: isCurrent
                  ? "var(--accent)"
                  : isDone
                    ? "var(--accent-strong)"
                    : "var(--bg-subtle)",
                color: isCurrent || isDone ? "white" : "var(--text-muted)",
                transition: "background var(--dur-fast) var(--ease-out-warm)",
              }}
            >
              {isDone ? "✓" : idx + 1}
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: isCurrent ? 600 : 500,
              color: isCurrent ? "var(--text)" : isDone ? "var(--text-muted)" : "var(--text-dim)",
            }}>
              {label}
            </span>
            {idx < steps.length - 1 && (
              <div
                style={{
                  width: 18,
                  height: 1,
                  background: isDone ? "var(--accent-strong)" : "var(--border)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
