"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/primitives";
import { SettingsTabs, type SettingsTab } from "./SettingsTabs";
import { useI18n } from "@/lib/i18n";

const SettingsTabLoading = () => <div role="status" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>Loading settings…</div>;
const ModelsConfig = dynamic(() => import("./ModelsConfig").then((module) => module.ModelsConfig), { loading: SettingsTabLoading });
const SkillsConfig = dynamic(() => import("./SkillsConfig").then((module) => module.SkillsConfig), { loading: SettingsTabLoading });
const PluginsConfig = dynamic(() => import("./PluginsConfig").then((module) => module.PluginsConfig), { loading: SettingsTabLoading });
const McpConfig = dynamic(() => import("./McpConfig").then((module) => module.McpConfig), { loading: SettingsTabLoading });
const SidebarSettings = dynamic(() => import("./SidebarSettings").then((module) => module.SidebarSettings), { loading: SettingsTabLoading });

type UpdateState = {
  currentVersion: string | null;
  availableVersion: string | null;
  updateAvailable: boolean;
};

type NativeSettings = {
  defaultThinkingLevel?: "auto" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  hideThinkingBlock?: boolean;
  textVerbosity?: "low" | "medium" | "high";
  personality?: "default" | "friendly" | "pragmatic" | "none";
  advisor?: { enabled?: boolean; subagents?: boolean; syncBacklog?: "off" | "1" | "3" | "5"; immuneTurns?: number };
  tools?: { approvalMode?: "always-ask" | "write" | "yolo"; approval?: { bash?: "allow" | "prompt" | "deny"; extension?: "allow" | "prompt" } };
  compaction?: { enabled?: boolean; midTurnEnabled?: boolean; strategy?: "snapcompact" | "handoff" | "context-full" | "shake" | "off"; autoContinue?: boolean; remoteEnabled?: boolean; keepRecentTokens?: number };
  memory?: { backend?: "off" | "local" | "mnemopi" | "hindsight" };
  autolearn?: { enabled?: boolean; autoContinue?: boolean; minToolCalls?: number };
  mnemopi?: { scoping?: "global" | "per-project" | "per-project-tagged"; autoRecall?: boolean; autoRetain?: boolean; noEmbeddings?: boolean };
  mcp?: { enableProjectConfig?: boolean; renderMarkdownResults?: boolean; notifications?: boolean; notificationDebounceMs?: number };
};

const nativeSelectStyle = {
  minHeight: 30,
  padding: "4px 26px 4px 9px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-control)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
} as const;

function NativeSetting({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0, padding: "11px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", background: "var(--bg-panel)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</div>
      <div style={{ minHeight: 30, marginTop: 7, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>{description}</span>
        <span style={{ flexShrink: 0 }}>{children}</span>
      </div>
    </div>
  );
}

export function SettingsConfig({ activeTab, advisorEnabled, onAdvisorChange, cwd, sessionId, onModelsSaved, onPluginsReloaded, onOmpUpdateAvailabilityChange, onSelectTab, onClose }: {
  activeTab: SettingsTab;
  advisorEnabled: boolean;
  onAdvisorChange: (enabled: boolean) => void;
  cwd: string | null;
  sessionId: string | null;
  onModelsSaved: () => void;
  onPluginsReloaded: () => void;
  onOmpUpdateAvailabilityChange: (available: boolean) => void;
  onSelectTab: (tab: SettingsTab) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const workspaceReady = cwd !== null;
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [restarting, setRestarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nativeSettings, setNativeSettings] = useState<NativeSettings | null>(null);
  const [nativeSettingsError, setNativeSettingsError] = useState<string | null>(null);
  const [nativeSavesInFlight, setNativeSavesInFlight] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<Set<SettingsTab>>(() => new Set(["general", activeTab]));

  useEffect(() => {
    setVisitedTabs((tabs) => tabs.has(activeTab) ? tabs : new Set([...tabs, activeTab]));
  }, [activeTab]);

  useEffect(() => {
    fetch("/api/rocinante-settings")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((data: { settings?: NativeSettings }) => setNativeSettings(data.settings ?? {}))
      .catch((error) => setNativeSettingsError(error instanceof Error ? error.message : String(error)));
  }, []);

  const saveNativeSettings = useCallback(async (next: NativeSettings) => {
    setNativeSettings(next);
    setNativeSettingsError(null);
    setNativeSavesInFlight((count) => count + 1);
    try {
      const response = await fetch("/api/rocinante-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: next }) });
      const data = await response.json() as { settings?: NativeSettings; error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setNativeSettings(data.settings ?? next);
    } catch (error) {
      setNativeSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setNativeSavesInFlight((count) => Math.max(0, count - 1));
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/rocinante-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) });
      const data = await response.json() as UpdateState & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setUpdate(data);
      onOmpUpdateAvailabilityChange(data.updateAvailable);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  }, [onOmpUpdateAvailabilityChange]);

  useEffect(() => { void checkForUpdate(); }, [checkForUpdate]);

  const installUpdate = useCallback(async () => {
    setUpdating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/rocinante-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update" }) });
      const data = await response.json() as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(t("settings.ompUpdate.updateSuccess"));
      await checkForUpdate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  }, [checkForUpdate, t]);

  const restartSessions = useCallback(async () => {
    setRestarting(true);
    try {
      const response = await fetch("/api/rocinante-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restart" }) });
      const data = await response.json() as { error?: string; sessionsRestarted?: number };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(t("settings.ompUpdate.restartSuccess", { count: data.sessionsRestarted ?? 0 }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRestarting(false);
    }
  }, [t]);

  const REASONING_LABELS: Record<string, string> = {
    auto: t("settings.modelDefaults.reasoning.auto"),
    minimal: t("settings.modelDefaults.reasoning.minimal"),
    low: t("settings.modelDefaults.reasoning.low"),
    medium: t("settings.modelDefaults.reasoning.medium"),
    high: t("settings.modelDefaults.reasoning.high"),
    xhigh: t("settings.modelDefaults.reasoning.xhigh"),
    max: t("settings.modelDefaults.reasoning.max"),
  };
  const VERBOSITY_LABELS: Record<string, string> = {
    low: t("settings.modelDefaults.verbosity.low"),
    medium: t("settings.modelDefaults.verbosity.medium"),
    high: t("settings.modelDefaults.verbosity.high"),
  };
  const PERSONALITY_LABELS: Record<string, string> = {
    default: t("settings.modelDefaults.personality.default"),
    friendly: t("settings.modelDefaults.personality.friendly"),
    pragmatic: t("settings.modelDefaults.personality.pragmatic"),
    none: t("settings.modelDefaults.personality.none"),
  };
  const STRATEGY_LABELS: Record<string, string> = {
    snapcompact: t("settings.contextManagement.strategy.snapcompact"),
    handoff: t("settings.contextManagement.strategy.handoff"),
    "context-full": t("settings.contextManagement.strategy.contextFull"),
    shake: t("settings.contextManagement.strategy.shake"),
    off: t("settings.contextManagement.strategy.off"),
  };
  const BACKEND_LABELS: Record<string, string> = {
    off: t("settings.memory.backend.off"),
    local: t("settings.memory.backend.local"),
    mnemopi: t("settings.memory.backend.mnemopi"),
    hindsight: t("settings.memory.backend.hindsight"),
  };
  const SCOPE_LABELS: Record<string, string> = {
    "per-project": t("settings.memory.scope.perProject"),
    "per-project-tagged": t("settings.memory.scope.perProjectTagged"),
    global: t("settings.memory.scope.global"),
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent ariaLabel={t("settings.title")} style={{ width: isMobile ? "calc(100vw - 16px)" : 860, maxWidth: "calc(100vw - 16px)", height: isMobile ? "calc(100dvh - 16px)" : "78vh", maxHeight: "calc(100dvh - 16px)", padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
          <DialogTitle style={{ fontSize: 16, margin: 0 }}>{t("settings.title")}</DialogTitle>
          <button type="button" onClick={onClose} aria-label={t("settings.close")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
        </header>
        <SettingsTabs active={activeTab} onSelect={onSelectTab} workspaceReady={workspaceReady} />
        <div role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: activeTab === "general" ? "flex" : "none", height: "100%", overflowY: "auto", padding: 20, flexDirection: "column", gap: 20 }}>
           {nativeSavesInFlight > 0 && <div role="status" style={{ position: "sticky", top: 0, zIndex: 5, alignSelf: "flex-start", padding: "5px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "var(--bg-panel)", color: "var(--text-muted)", fontSize: 11 }}>{t("settings.saving")}</div>}
           <section style={{ padding: "16px", border: "1px solid var(--border)", borderRadius: "var(--radius-modal)", background: "var(--bg-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600 }}><Sparkles size={15} aria-hidden="true" /> {t("settings.advisor.title")}</div>
            <p style={{ margin: "6px 0 10px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{t("settings.advisor.description")}</p>
             <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9 }}>
              <NativeSetting label={t("settings.advisor.enable")} description={t("settings.advisor.enableDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.advisor?.enabled ?? advisorEnabled} onChange={(event) => { const enabled = event.target.checked; onAdvisorChange(enabled); void saveNativeSettings({ ...(nativeSettings ?? {}), advisor: { ...(nativeSettings?.advisor ?? {}), enabled } }); }} /></NativeSetting>
              {(nativeSettings?.advisor?.enabled ?? advisorEnabled) && <NativeSetting label={t("settings.advisor.backlog")} description={t("settings.advisor.backlogDesc")}><select style={nativeSelectStyle} value={nativeSettings?.advisor?.syncBacklog ?? "off"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), advisor: { ...(nativeSettings?.advisor ?? {}), syncBacklog: event.target.value as "off" | "1" | "3" | "5" } })}><option value="off">{t("settings.advisor.backlog.off")}</option><option value="1">{t("settings.advisor.backlog.turn1")}</option><option value="3">{t("settings.advisor.backlog.turn3")}</option><option value="5">{t("settings.advisor.backlog.turn5")}</option></select></NativeSetting>}
            </div>
            {(nativeSettings?.advisor?.enabled ?? advisorEnabled) && <div style={{ marginTop: 9 }}>
              <NativeSetting label={t("settings.advisor.subagents")} description={t("settings.advisor.subagentsDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.advisor?.subagents ?? false} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), advisor: { ...(nativeSettings?.advisor ?? {}), subagents: event.target.checked } })} /></NativeSetting>
            </div>}
          </section>
          <section style={{ padding: "16px", border: "1px solid var(--border)", borderRadius: "var(--radius-modal)", background: "var(--bg-subtle)" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.toolSafety.title")}</div>
            <p style={{ margin: "6px 0 10px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{t("settings.toolSafety.description")}</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9 }}>
              <NativeSetting label={t("settings.toolSafety.approvalMode")} description={t("settings.toolSafety.approvalModeDesc")}><select style={nativeSelectStyle} value={nativeSettings?.tools?.approvalMode ?? "yolo"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), tools: { ...(nativeSettings?.tools ?? {}), approvalMode: event.target.value as "always-ask" | "write" | "yolo" } })}><option value="always-ask">{t("settings.toolSafety.approvalMode.alwaysAsk")}</option><option value="write">{t("settings.toolSafety.approvalMode.allowWrites")}</option><option value="yolo">{t("settings.toolSafety.approvalMode.autoApprove")}</option></select></NativeSetting>
              <NativeSetting label={t("settings.toolSafety.bashOverride")} description={t("settings.toolSafety.bashOverrideDesc")}><select style={nativeSelectStyle} value={nativeSettings?.tools?.approval?.bash ?? "prompt"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), tools: { ...(nativeSettings?.tools ?? {}), approval: { ...(nativeSettings?.tools?.approval ?? {}), bash: event.target.value as "allow" | "prompt" | "deny" } } })}><option value="allow">{t("settings.toolSafety.bashOverride.allow")}</option><option value="prompt">{t("settings.toolSafety.bashOverride.prompt")}</option><option value="deny">{t("settings.toolSafety.bashOverride.deny")}</option></select></NativeSetting>
              <NativeSetting label={t("settings.toolSafety.extension")} description={t("settings.toolSafety.extensionDesc")}><select style={nativeSelectStyle} value={nativeSettings?.tools?.approval?.extension ?? "prompt"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), tools: { ...(nativeSettings?.tools ?? {}), approval: { ...(nativeSettings?.tools?.approval ?? {}), extension: event.target.value as "allow" | "prompt" } } })}><option value="prompt">{t("settings.toolSafety.extension.prompt")}</option><option value="allow">{t("settings.toolSafety.extension.allow")}</option></select></NativeSetting>
            </div>
          </section>
          <section style={{ padding: "16px", border: "1px solid var(--border)", borderRadius: "var(--radius-modal)", background: "var(--bg-subtle)" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.modelDefaults.title")}</div>
            <p style={{ margin: "6px 0 10px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{t("settings.modelDefaults.description")}</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9 }}>
              <NativeSetting label={t("settings.modelDefaults.reasoning")} description={t("settings.modelDefaults.reasoningDesc")}><select style={nativeSelectStyle} value={nativeSettings?.defaultThinkingLevel ?? "high"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), defaultThinkingLevel: event.target.value as NativeSettings["defaultThinkingLevel"] })}>{["auto", "minimal", "low", "medium", "high", "xhigh", "max"].map((level) => <option key={level} value={level}>{REASONING_LABELS[level]}</option>)}</select></NativeSetting>
              <NativeSetting label={t("settings.modelDefaults.verbosity")} description={t("settings.modelDefaults.verbosityDesc")}><select style={nativeSelectStyle} value={nativeSettings?.textVerbosity ?? "medium"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), textVerbosity: event.target.value as NativeSettings["textVerbosity"] })}>{["low", "medium", "high"].map((level) => <option key={level} value={level}>{VERBOSITY_LABELS[level]}</option>)}</select></NativeSetting>
              <NativeSetting label={t("settings.modelDefaults.personality")} description={t("settings.modelDefaults.personalityDesc")}><select style={nativeSelectStyle} value={nativeSettings?.personality ?? "default"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), personality: event.target.value as NativeSettings["personality"] })}>{["default", "friendly", "pragmatic", "none"].map((value) => <option key={value} value={value}>{PERSONALITY_LABELS[value]}</option>)}</select></NativeSetting>
              <NativeSetting label={t("settings.modelDefaults.thinkingBlocks")} description={t("settings.modelDefaults.thinkingBlocksDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.hideThinkingBlock ?? false} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), hideThinkingBlock: event.target.checked })} /></NativeSetting>
             </div>
           </section>
           <section style={{ padding: "16px", border: "1px solid var(--border)", borderRadius: "var(--radius-modal)", background: "var(--bg-subtle)" }}>
             <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.contextManagement.title")}</div>
             <p style={{ margin: "6px 0 10px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{t("settings.contextManagement.description")}</p>
             <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9 }}>
               <NativeSetting label={t("settings.contextManagement.autoCompaction")} description={t("settings.contextManagement.autoCompactionDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.compaction?.enabled ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), compaction: { ...(nativeSettings?.compaction ?? {}), enabled: event.target.checked } })} /></NativeSetting>
               <NativeSetting label={t("settings.contextManagement.continueAfterCompaction")} description={t("settings.contextManagement.continueAfterCompactionDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.compaction?.autoContinue ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), compaction: { ...(nativeSettings?.compaction ?? {}), autoContinue: event.target.checked } })} /></NativeSetting>
               <NativeSetting label={t("settings.contextManagement.strategy")} description={t("settings.contextManagement.strategyDesc")}><select style={nativeSelectStyle} value={nativeSettings?.compaction?.strategy ?? "snapcompact"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), compaction: { ...(nativeSettings?.compaction ?? {}), strategy: event.target.value as NonNullable<NativeSettings["compaction"]>["strategy"] } })}><option value="snapcompact">{STRATEGY_LABELS.snapcompact}</option><option value="handoff">{STRATEGY_LABELS.handoff}</option><option value="context-full">{STRATEGY_LABELS["context-full"]}</option><option value="shake">{STRATEGY_LABELS.shake}</option><option value="off">{STRATEGY_LABELS.off}</option></select></NativeSetting>
               <NativeSetting label={t("settings.contextManagement.midTurn")} description={t("settings.contextManagement.midTurnDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.compaction?.midTurnEnabled ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), compaction: { ...(nativeSettings?.compaction ?? {}), midTurnEnabled: event.target.checked } })} /></NativeSetting>
             </div>
           </section>
           <section style={{ padding: "16px", border: "1px solid var(--border)", borderRadius: "var(--radius-modal)", background: "var(--bg-subtle)" }}>
             <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.memory.title")}</div>
             <p style={{ margin: "6px 0 10px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{t("settings.memory.description")}</p>
             <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9 }}>
               <NativeSetting label={t("settings.memory.backend")} description={t("settings.memory.backendDesc")}><select style={nativeSelectStyle} value={nativeSettings?.memory?.backend ?? "mnemopi"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), memory: { ...(nativeSettings?.memory ?? {}), backend: event.target.value as NonNullable<NativeSettings["memory"]>["backend"] } })}><option value="off">{BACKEND_LABELS.off}</option><option value="local">{BACKEND_LABELS.local}</option><option value="mnemopi">{BACKEND_LABELS.mnemopi}</option><option value="hindsight">{BACKEND_LABELS.hindsight}</option></select></NativeSetting>
               <NativeSetting label={t("settings.memory.autolearn")} description={t("settings.memory.autolearnDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.autolearn?.enabled ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), autolearn: { ...(nativeSettings?.autolearn ?? {}), enabled: event.target.checked } })} /></NativeSetting>
               <NativeSetting label={t("settings.memory.privateCapture")} description={t("settings.memory.privateCaptureDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.autolearn?.autoContinue ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), autolearn: { ...(nativeSettings?.autolearn ?? {}), autoContinue: event.target.checked } })} /></NativeSetting>
               <NativeSetting label={t("settings.memory.scope")} description={t("settings.memory.scopeDesc")}><select style={nativeSelectStyle} value={nativeSettings?.mnemopi?.scoping ?? "per-project"} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), mnemopi: { ...(nativeSettings?.mnemopi ?? {}), scoping: event.target.value as NonNullable<NativeSettings["mnemopi"]>["scoping"] } })}><option value="per-project">{SCOPE_LABELS["per-project"]}</option><option value="per-project-tagged">{SCOPE_LABELS["per-project-tagged"]}</option><option value="global">{SCOPE_LABELS.global}</option></select></NativeSetting>
               <NativeSetting label={t("settings.memory.recall")} description={t("settings.memory.recallDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.mnemopi?.autoRecall ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), mnemopi: { ...(nativeSettings?.mnemopi ?? {}), autoRecall: event.target.checked } })} /></NativeSetting>
               <NativeSetting label={t("settings.memory.retain")} description={t("settings.memory.retainDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.mnemopi?.autoRetain ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), mnemopi: { ...(nativeSettings?.mnemopi ?? {}), autoRetain: event.target.checked } })} /></NativeSetting>
              </div>
            </section>
            {nativeSettingsError && <p role="alert" style={{ margin: 0, color: "var(--status-error)", fontSize: 12 }}>{nativeSettingsError}</p>}
          <section style={{ borderTop: "1px solid var(--border)", paddingTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.ompUpdate.title")}</div>
                <div style={{ marginTop: 4, color: update?.updateAvailable ? "var(--accent)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {checking ? t("settings.ompUpdate.checking") : update?.updateAvailable ? t("settings.ompUpdate.updateAvailable", { current: update.currentVersion ?? "?", available: update.availableVersion ?? "?" }) : update?.currentVersion ? t("settings.ompUpdate.upToDate", { current: update.currentVersion }) : t("settings.ompUpdate.unavailable")}
                </div>
              </div>
              <button type="button" onClick={() => void checkForUpdate()} disabled={checking} aria-label={t("settings.ompUpdate.refreshAria")} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "transparent", color: "var(--text-muted)", cursor: checking ? "wait" : "pointer" }}><RefreshCw size={14} aria-hidden="true" /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {update?.updateAvailable && <button type="button" onClick={() => void installUpdate()} disabled={updating} style={{ padding: "7px 11px", border: "none", borderRadius: "var(--radius-control)", background: "var(--accent)", color: "var(--on-accent)", cursor: updating ? "wait" : "pointer", fontSize: 12 }}>{updating ? t("settings.ompUpdate.installing") : t("settings.ompUpdate.installButton")}</button>}
              <button type="button" onClick={() => void restartSessions()} disabled={restarting} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "transparent", color: "var(--text)", cursor: restarting ? "wait" : "pointer", fontSize: 12 }}><RotateCcw size={13} aria-hidden="true" /> {restarting ? t("settings.ompUpdate.restarting") : t("settings.ompUpdate.restartButton")}</button>
              {/* Changelog link intentionally hidden (D-Phase2-10) */}
            </div>
            {message && <p role="status" style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{message}</p>}
          </section>
          </div>
          {visitedTabs.has("models") && <div role="tabpanel" id="settings-panel-models" aria-labelledby="settings-tab-models" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: activeTab === "models" ? "flex" : "none", flexDirection: "column" }}>
            <ModelsConfig embedded onClose={onClose} onSaved={onModelsSaved} />
          </div>}
          {visitedTabs.has("mcp") && <div role="tabpanel" id="settings-panel-mcp" aria-labelledby="settings-tab-mcp" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: activeTab === "mcp" ? "flex" : "none", flexDirection: "column" }}>
            {cwd && <section style={{ padding: "16px 16px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t("settings.mcp.behaviorTitle")}</div>
              <p style={{ margin: "6px 0 12px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{t("settings.mcp.behaviorDescription")}</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9, paddingBottom: 16 }}>
                <NativeSetting label={t("settings.mcp.loadProject")} description={t("settings.mcp.loadProjectDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.mcp?.enableProjectConfig ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), mcp: { ...(nativeSettings?.mcp ?? {}), enableProjectConfig: event.target.checked } })} /></NativeSetting>
                <NativeSetting label={t("settings.mcp.renderMarkdown")} description={t("settings.mcp.renderMarkdownDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.mcp?.renderMarkdownResults ?? true} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), mcp: { ...(nativeSettings?.mcp ?? {}), renderMarkdownResults: event.target.checked } })} /></NativeSetting>
                <NativeSetting label={t("settings.mcp.notifications")} description={t("settings.mcp.notificationsDesc")}><input type="checkbox" style={{ accentColor: "var(--accent)", width: 15, height: 15, cursor: "pointer" }} checked={nativeSettings?.mcp?.notifications ?? false} onChange={(event) => void saveNativeSettings({ ...(nativeSettings ?? {}), mcp: { ...(nativeSettings?.mcp ?? {}), notifications: event.target.checked } })} /></NativeSetting>
              </div>
            </section>}
            <McpConfig cwd={cwd} sessionId={sessionId} />
            {!cwd && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12 }}>{t("settings.mcp.noWorkspace")}</p>}
            {nativeSettingsError && <p role="alert" style={{ margin: 0, color: "var(--status-error)", fontSize: 12 }}>{nativeSettingsError}</p>}
          </div>}
          {cwd && visitedTabs.has("skills") && <div role="tabpanel" id="settings-panel-skills" aria-labelledby="settings-tab-skills" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: activeTab === "skills" ? "flex" : "none", flexDirection: "column" }}>
            <SkillsConfig embedded cwd={cwd} onClose={onClose} />
          </div>}
          {cwd && visitedTabs.has("plugins") && <div role="tabpanel" id="settings-panel-plugins" aria-labelledby="settings-tab-plugins" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: activeTab === "plugins" ? "flex" : "none", flexDirection: "column" }}>
            <PluginsConfig embedded cwd={cwd} sessionId={sessionId} onClose={onClose} onReloaded={onPluginsReloaded} />
          </div>}
          {visitedTabs.has("sidebar") && (
            <div role="tabpanel" id="settings-panel-sidebar" aria-labelledby="settings-tab-sidebar" style={{ flex: 1, minHeight: 0, overflow: "hidden", display: activeTab === "sidebar" ? "flex" : "none", flexDirection: "column" }}>
              <SidebarSettings />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
