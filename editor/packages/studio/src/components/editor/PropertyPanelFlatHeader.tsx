// The selected element's actions (St-Inspector-Element): hide or show, copy its info, ungroup
// and clear the selection. Inside the inspector card they sit in the title row next to the
// close button (the card title already names the element); elsewhere they keep the inline
// name row.
import type { ReactNode } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { ClipboardList, Film, Square, Type, X } from "../../icons/SystemIcons";
import { t, useLocale } from "../../i18n/translate";
import { HEADER_ICON_BUTTON, InspectorHeaderActions } from "../inspector/headerSlot";
import { useIsPhone } from "../shell/useIsPhone";

const ICON_BY_KIND = { text: Type, media: Film, other: Square } as const;
const ICON_COLOR_BY_KIND = {
  text: "text-panel-accent",
  media: "text-panel-media",
  other: "text-panel-container",
} as const;

export function PropertyPanelFlatHeader({
  name,
  meta,
  elementKind,
  hidden,
  onToggleHidden,
  copied,
  onCopy,
  onClear,
  onUngroup,
  showUngroup,
}: {
  name: string;
  meta: string;
  elementKind: "text" | "media" | "other";
  hidden: boolean;
  onToggleHidden?: () => void;
  copied: boolean;
  onCopy: () => void;
  onClear: () => void;
  onUngroup?: () => void;
  showUngroup: boolean;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const Icon = ICON_BY_KIND[elementKind];
  const visibilityLabel = hidden ? t("flat.show") : t("flat.hide");
  const isPhone = useIsPhone();

  // St-M-Inspector-Element: on a phone the actions are a row of labelled pills under the
  // tabs; "Gata" closes the sheet, so there is no clear button.
  if (isPhone) {
    return (
      <div className="grid grid-cols-3 gap-2 px-4 pb-2">
        {onToggleHidden && (
          <PhoneAction
            label={hidden ? t("flat.showShort") : t("flat.hideShort")}
            title={visibilityLabel}
            onClick={() => {
              track("toggle", "Element visibility");
              onToggleHidden();
            }}
          >
            {hidden ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
          </PhoneAction>
        )}
        <PhoneAction
          label={copied ? t("flat.copied") : t("flat.copyShort")}
          title={t("flat.copyTitle")}
          onClick={() => {
            track("button", "Copy element info");
            onCopy();
          }}
        >
          <ClipboardList size={16} />
        </PhoneAction>
        {showUngroup && (
          <PhoneAction
            label={t("flat.ungroupShort")}
            title={t("flat.ungroupTitle")}
            onClick={() => {
              track("button", "Ungroup");
              onUngroup?.();
            }}
          >
            <Square size={16} />
          </PhoneAction>
        )}
      </div>
    );
  }

  // Board order: hide, copy, ungroup, clear (the card adds its own close button).
  const actions = (
    <>
      {onToggleHidden && (
        <button
          type="button"
          aria-label={visibilityLabel}
          title={visibilityLabel}
          className={HEADER_ICON_BUTTON}
          onClick={() => {
            track("toggle", "Element visibility");
            onToggleHidden();
          }}
        >
          {hidden ? <EyeSlash size={16} weight="bold" /> : <BoardGlyph d={EYE_PATH} />}
        </button>
      )}
      <button
        type="button"
        aria-label={t("flat.copy")}
        title={copied ? t("flat.copied") : t("flat.copyTitle")}
        className={HEADER_ICON_BUTTON}
        onClick={() => {
          track("button", "Copy element info");
          onCopy();
        }}
      >
        <BoardGlyph d={COPY_PATH} />
      </button>
      {showUngroup && (
        <button
          type="button"
          aria-label={t("flat.ungroup")}
          title={t("flat.ungroupTitle")}
          className={HEADER_ICON_BUTTON}
          onClick={() => {
            track("button", "Ungroup");
            onUngroup?.();
          }}
        >
          <BoardGlyph d={UNGROUP_PATH} />
        </button>
      )}
      <button
        type="button"
        aria-label={t("flat.clear")}
        title={t("flat.clear")}
        className={HEADER_ICON_BUTTON}
        onClick={() => {
          track("button", "Clear selection");
          onClear();
        }}
      >
        <X size={16} />
      </button>
    </>
  );

  return (
    <InspectorHeaderActions
      fallback={
        <div className="flex items-center gap-2.5 px-4 py-3">
          <Icon
            size={15}
            data-flat-header-icon="true"
            className={`flex-shrink-0 ${ICON_COLOR_BY_KIND[elementKind]}`}
          />
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-studio-text">{name}</span>
            <span className="truncate font-mono text-[10px] text-studio-muted">{meta}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5">{actions}</div>
        </div>
      }
    >
      {actions}
    </InspectorHeaderActions>
  );
}

const EYE_PATH =
  "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const COPY_PATH = "M9 9h11v11H9zM5 15V5h10";
const UNGROUP_PATH =
  "M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4M9 9h6v6H9z";

function BoardGlyph({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function PhoneAction({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
    >
      <span className="flex-none" aria-hidden="true">
        {children}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
