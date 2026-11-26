import { useState } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import { copyTextToClipboard } from "../utils/clipboard";
import { Dialog, PillButton, illustrationSrc } from "./ui";
import { t, useLocale } from "../i18n/translate";
import type { MessageKey } from "../i18n/dictionary";
import { openAgent } from "./agent/agentSession";
import { withContentKeys } from "./agent/stableKeys";

export interface LintFinding {
  severity: "error" | "warning";
  message: string;
  file?: string;
  fixHint?: string;
}

function findingContent(finding: LintFinding): string {
  return [finding.file ?? "", finding.message, finding.fixHint ?? ""].join("\n");
}

/** "1 eroare" / "2 erori" style counts. Romanian needs a singular form for exactly one. */
function countLabel(count: number, one: MessageKey, many: MessageKey): string {
  return count === 1 ? t(one) : t(many, { n: count });
}

/** One finding as a bordered card: severity icon, message, monospaced file path and fix hint. */
function FindingCard({ finding, tone }: { finding: LintFinding; tone: "error" | "warning" }) {
  const iconClass =
    tone === "error"
      ? "bg-[var(--st-danger-bg)] text-[var(--st-danger)]"
      : "bg-[var(--st-warn-bg)] text-[var(--st-warn)]";
  return (
    <li className="flex items-start gap-3 rounded-md border border-studio-border bg-studio-surface p-3.5">
      <span
        className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ${iconClass}`}
        aria-hidden="true"
      >
        <WarningIcon size={14} weight="fill" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-studio-text">{finding.message}</p>
        {finding.file && (
          <p className="mt-0.5 break-all font-mono text-xs text-studio-muted">{finding.file}</p>
        )}
        {finding.fixHint && <p className="mt-1 text-xs text-studio-muted">{finding.fixHint}</p>}
      </div>
    </li>
  );
}

export function LintModal({
  findings,
  projectId,
  projectDir,
  title,
  promptIntro = "Fix these SneepCut composition lint issues",
  onClose,
}: {
  findings: LintFinding[];
  projectId: string;
  /** Real on-disk project directory for the agent prompt (not the browser URL). */
  projectDir?: string | null;
  /** Dialog title. Defaults to the lint results heading; console errors pass their own. */
  title?: string;
  /** First line of the copied agent prompt. */
  promptIntro?: string;
  onClose: () => void;
}) {
  useLocale();
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const hasIssues = findings.length > 0;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const buildPrompt = () => {
    const lines = findings.map((f) => {
      let line = `[${f.severity}] ${f.message}`;
      if (f.file) line += `\n  File: ${f.file}`;
      if (f.fixHint) line += `\n  Fix: ${f.fixHint}`;
      return line;
    });
    const pathLine = projectDir ? `Project path: ${projectDir}\n\n` : "";
    return `${promptIntro} for project "${projectId}":\n\n${pathLine}${lines.join("\n\n")}`;
  };

  // Hands the findings to Ana și Radu with a context chip, then gets out of the way.
  const handleAskForHelp = () => {
    openAgent({
      context: {
        prompt: buildPrompt(),
        label: t("agent.lintChip", { n: findings.length }),
        kind: "lint",
      },
    });
    onClose();
  };

  // Developers can still take the prompt elsewhere.
  const handleCopy = async () => {
    const copied = await copyTextToClipboard(buildPrompt());
    setCopyState(copied ? "copied" : "failed");
    setTimeout(() => setCopyState("idle"), copied ? 2000 : 3000);
  };

  const copyLabel =
    copyState === "copied"
      ? t("lint.copied")
      : copyState === "failed"
        ? t("lint.copyFailed")
        : t("agent.copyPrompt");

  const summary = hasIssues
    ? `${countLabel(errors.length, "lint.errorsOne", "lint.errorsMany")} · ${countLabel(
        warnings.length,
        "lint.warningsOne",
        "lint.warningsMany",
      )}`
    : t("lint.allPassed");

  return (
    <Dialog
      open
      title={title ?? t("lint.title")}
      onClose={onClose}
      footer={
        <>
          {hasIssues && (
            <PillButton variant="ghost" onClick={() => void handleCopy()}>
              {copyLabel}
            </PillButton>
          )}
          {hasIssues && (
            <PillButton variant="secondary" onClick={handleAskForHelp}>
              <img
                src={illustrationSrc("agent-avatar-duo")}
                alt=""
                aria-hidden="true"
                className="h-5 w-5 rounded-full object-cover"
                draggable={false}
              />
              {t("agent.askHelp")}
            </PillButton>
          )}
          <PillButton variant="primary" onClick={onClose}>
            {t("common.close")}
          </PillButton>
        </>
      }
    >
      <p className="font-medium text-studio-text">{summary}</p>
      {hasIssues && (
        <ul className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {withContentKeys(errors, findingContent).map(({ key, item }) => (
            <FindingCard key={key} finding={item} tone="error" />
          ))}
          {withContentKeys(warnings, findingContent).map(({ key, item }) => (
            <FindingCard key={key} finding={item} tone="warning" />
          ))}
        </ul>
      )}
    </Dialog>
  );
}
