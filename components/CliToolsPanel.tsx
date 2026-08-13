"use client";

import { CliCard } from "./CliCard";

export function CliToolsPanel() {
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      <CliCard cliId="az" />
      <CliCard cliId="gh" />
    </div>
  );
}
