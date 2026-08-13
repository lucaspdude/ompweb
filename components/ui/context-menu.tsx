"use client";

/**
 * Right-click context menu on top of @base-ui/react/context-menu. The
 * `Trigger` element intercepts the native contextmenu event and surfaces the
 * menu at the cursor; items fire onClick. Theming follows the same CSS
 * variables as the other primitives.
 *
 * The Portal wrapper is wrapped in an explicit `position: fixed; z-index:
 * 2400` div. base-ui's FloatingPortal otherwise relies on a portal root that
 * does not always end up above app-side stacking contexts that use
 * `transform`, `filter`, or `contain` — observable on this app where the
 * sidebar and chat panel both create trap contexts. Forcing a fixed,
 * `z-index: 2400` wrapper pushes the menu to the topmost layer regardless.
 * `pointer-events: none` on the wrapper keeps clicks passing through to the
 * inner Popup (which inherits back to `pointer-events: auto`).
 */
import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type React from "react";

const MENU_LAYER_Z_INDEX = 2400;

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
      <div style={{ position: "fixed", inset: 0, zIndex: MENU_LAYER_Z_INDEX, pointerEvents: "none" }}>
        <BaseContextMenu.Positioner sideOffset={4}>
          <BaseContextMenu.Popup
            style={{
              background: "var(--bg-panel)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--shadow-pop)",
              minWidth: 200,
              pointerEvents: "auto",
              outline: "none",
            }}
          >
            {children}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </div>
    </BaseContextMenu.Portal>
  );
}
