// "Copiază gradarea la" (St-Inspector-GradeActions): two option cards, the chosen one in the
// selected colours, and a full-width primary "Aplică".
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { t } from "../../i18n/translate";
import { PillButton } from "../ui/PillButton";
import { LookBlock } from "./propertyPanelColorLookUi";

type ApplyScope = "source-file" | "project";

const OPTIONS: ReadonlyArray<{ value: ApplyScope; label: "look.copy.file" | "look.copy.project" }> =
  [
    { value: "source-file", label: "look.copy.file" },
    { value: "project", label: "look.copy.project" },
  ];

export function GradeCopyBlock({
  applyScope,
  applyBusy,
  onSetApplyScope,
  onApplyToScope,
}: {
  applyScope: ApplyScope;
  applyBusy: boolean;
  onSetApplyScope: (scope: ApplyScope) => void;
  onApplyToScope: () => void;
}) {
  const track = useTrackDesignInput();
  return (
    <LookBlock title={t("look.copyTo")} data-flat-grade-copy="true">
      <div role="radiogroup" aria-label={t("look.copyTo")} className="flex flex-col gap-2">
        {OPTIONS.map((option) => {
          const selected = applyScope === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={applyBusy}
              data-flat-grade-scope={option.value}
              onClick={() => {
                track("select", "Copy grade scope");
                onSetApplyScope(option.value);
              }}
              className={`flex min-h-[52px] items-center gap-3 rounded-md px-3.5 text-left text-[13px] font-semibold transition-colors disabled:opacity-50 ${
                selected
                  ? "bg-studio-selected text-studio-on-selected"
                  : "bg-studio-surface text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full shadow-[inset_0_0_0_1.5px_currentColor]"
              >
                {selected && <span className="h-2 w-2 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 truncate">{t(option.label)}</span>
            </button>
          );
        })}
      </div>
      <PillButton
        variant="primary"
        className="w-full"
        data-flat-grade-apply="true"
        disabled={applyBusy}
        onClick={() => {
          track("button", "Apply grade to scope");
          onApplyToScope();
        }}
      >
        {applyBusy ? t("look.applying") : t("look.apply")}
      </PillButton>
    </LookBlock>
  );
}
