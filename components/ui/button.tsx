"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const STYLE: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--accent)",
    color: "white",
    border: "none",
  },
  secondary: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid var(--border)",
  },
  danger: {
    background: "var(--accent-strong)",
    color: "white",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--text)",
    border: "none",
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", style, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      style={{
        padding: "6px 14px",
        borderRadius: "var(--radius-control)",
        fontSize: 13,
        fontWeight: variant === "primary" || variant === "danger" ? 600 : 500,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background var(--dur-fast) var(--ease-out-warm)",
        ...STYLE[variant],
        ...style,
      }}
      {...rest}
    />
  );
});
