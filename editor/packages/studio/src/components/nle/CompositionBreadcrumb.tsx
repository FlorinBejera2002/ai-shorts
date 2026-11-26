import { trackStudioEvent } from "../../utils/studioTelemetry";
import { t, useLocale } from "../../i18n/translate";
import { PreviewIcon, PreviewIconButton } from "./preview/previewChrome";

export interface CompositionLevel {
  /** Unique id — "master" or composition file path */
  id: string;
  /** Display label — "Master" or filename without extension */
  label: string;
  /** Preview URL for this composition level */
  previewUrl: string;
}

interface CompositionBreadcrumbProps {
  stack: CompositionLevel[];
  onNavigate: (index: number) => void;
  /** Phone (St-M-Preview-Breadcrumb): the row is centred above the stage. */
  centered?: boolean;
}

/** Back button and path of the open sub-composition (St-Preview-Breadcrumb). */
export function CompositionBreadcrumb({ stack, onNavigate, centered }: CompositionBreadcrumbProps) {
  useLocale();
  if (stack.length <= 1) return null;

  return (
    <nav
      aria-label={t("preview.compositionNav")}
      className={`flex min-h-9 min-w-0 flex-none items-center gap-1.5 ${centered ? "justify-center pb-3 pt-6" : ""}`}
    >
      <PreviewIconButton
        label={t("preview.backToParent")}
        title={`${t("preview.backToParent")} (Esc)`}
        size={32}
        onClick={() => {
          trackStudioEvent("navigation", {
            action: "back",
            target: stack[stack.length - 2]?.label,
          });
          onNavigate(stack.length - 2);
        }}
      >
        <PreviewIcon name="back" size={16} />
      </PreviewIconButton>
      {stack.map((level, i) => {
        const isLast = i === stack.length - 1;
        return (
          <span key={level.id} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <PreviewIcon name="chevronRight" size={14} className="text-studio-muted" />}
            {isLast ? (
              <span
                aria-current="page"
                className="min-w-0 truncate text-[13px] font-semibold text-studio-text"
              >
                {level.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  trackStudioEvent("navigation", { action: "breadcrumb", target: level.label });
                  onNavigate(i);
                }}
                className="h-8 flex-none rounded-[10px] px-2 text-[13px] font-semibold text-studio-muted hover:bg-[var(--st-sub)] hover:text-studio-text"
              >
                {level.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
