"use client";

/**
 * Right-click context menu on top of @base-ui/react/context-menu. The
 * `Trigger` element intercepts the native contextmenu event and surfaces the
 * menu at the cursor; items fire onClick. Theming follows the same CSS
 * variables as the other primitives.
 */
import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type React from "react";

export interface ContextMenuItemProps {
  label: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Single menu entry. */
export function ContextMenuItem({ label, onClick, disabled, style }: ContextMenuItemProps) {
  return (
    <BaseContextMenu.Item
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 12px",
        minWidth: 180,
        fontSize: 13,
        color: disabled ? "var(--text-dim)" : "var(--text)",
        cursor: disabled ? "default" : "pointer",
        borderRadius: "var(--radius-control)",
        userSelect: "none",
        outline: "none",
        ...style,
      }}
    >
      {label}
    </BaseContextMenu.Item>
  );
}

/** Thin wrapper over BaseContextMenu.Root so callers can spread items as
 *  children without touching the base-ui types. */
export function ContextMenuRoot({ children }: { children: React.ReactNode }) {
  return <BaseContextMenu.Root>{children}</BaseContextMenu.Root>;
}

/** Wraps the element that should respond to right-click. Pass the rendered
 *  child as the `children` element — it must accept a ref. */
export const ContextMenuTrigger = BaseContextMenu.Trigger;

/** Portal + Positioner + Popup shell. Render exactly once per Root, after
 *  the Trigger. The popup positions itself at the cursor automatically. */
export function ContextMenuContent({ children }: { children: React.ReactNode }) {
  return (
    <BaseContextMenu.Portal>
      <BaseContextMenu.Positioner sideOffset={4}>
        <BaseContextMenu.Popup
          style={{
            background: "var(--bg-panel)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-pop)",
            padding: 4,
            minWidth: 200,
            zIndex: 1100,
            outline: "none",
          }}
        >
          {children}
        </BaseContextMenu.Popup>
      </BaseContextMenu.Positioner>
    </BaseContextMenu.Portal>
  );
}
