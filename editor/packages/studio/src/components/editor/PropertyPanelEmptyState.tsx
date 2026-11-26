// St-Empty: nothing selected (illustration and title only). St-Multi / St-Inspector-Multi:
// several elements selected, one card each, then "Grupează" and "Ascunde tot". The card title
// ("3 elemente") and the clear action live in the inspector title row.
import { Layers, X } from "../../icons/SystemIcons";
import type { DomEditSelection } from "./domEditingTypes";
import { canHideSelections } from "../../utils/timelineInspector";
import { EmptyState } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { HEADER_ICON_BUTTON, InspectorHeaderActions } from "../inspector/headerSlot";
import { InspectorAction } from "./inspectorControls";

function FlatEmptyState() {
  useLocale();
  return (
    <div className="flex h-full items-center justify-center pb-10">
      <EmptyState
        illustration="studio-nothing-selected"
        title={t("flat.empty")}
        className="[&>img]:h-44 [&>img]:w-44"
      />
    </div>
  );
}

const KIND_ICONS = {
  media: "M4 5h16v14H4zM4 15l5-5 5 5 2-2 4 4M15 9h.01",
  audio: "M12 3v12M8 7v6M16 7v6M4 10v2M20 10v2",
  text: "M5 6V5h14v1M12 5v14M9 19h6",
  other: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
} as const;

function elementKindIcon(element: DomEditSelection): string {
  if (element.tagName === "audio") return KIND_ICONS.audio;
  if (element.tagName === "video" || element.tagName === "img") return KIND_ICONS.media;
  if (element.textFields?.length > 0) return KIND_ICONS.text;
  return KIND_ICONS.other;
}

function SelectedElementCard({ element }: { element: DomEditSelection }) {
  return (
    <li className="flex min-h-[60px] items-center gap-3 rounded-md bg-studio-surface px-3 py-2.5 shadow-[inset_0_0_0_1.5px_var(--st-bd)]">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-bd)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={elementKindIcon(element)} />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-studio-text">{element.label}</span>
        <span className="truncate text-xs text-studio-muted">
          {element.id ? `#${element.id}` : element.selector}
          {element.tagName ? ` · ${element.tagName}` : ""}
        </span>
      </span>
    </li>
  );
}

function FlatMultiSelectState({
  multiSelectCount,
  multiSelectedElements = [],
  onGroupSelection,
  onHideAllSelected,
  onClearSelection,
}: {
  multiSelectCount: number;
  multiSelectedElements?: DomEditSelection[];
  onGroupSelection?: () => void;
  onHideAllSelected?: () => void;
  onClearSelection?: () => void;
}) {
  useLocale();
  // One predicate for both actions and for the handler's own refusal, so the
  // button and the refusal cannot disagree about what audio is.
  const hasAudio = !canHideSelections(multiSelectedElements);
  const clear = (
    <button
      type="button"
      data-flat-multiselect-clear="true"
      aria-label={t("flat.clear")}
      title={t("flat.clear")}
      onClick={onClearSelection}
      className={HEADER_ICON_BUTTON}
    >
      <X size={16} />
    </button>
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4">
      <InspectorHeaderActions
        fallback={
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[13px] font-semibold text-studio-text">
              {t("inspector.multiTitle", { n: multiSelectCount })}
            </span>
            {clear}
          </div>
        }
      >
        {clear}
      </InspectorHeaderActions>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {multiSelectedElements.map((element) => (
          <SelectedElementCard
            key={`${element.id ?? element.selector ?? ""}:${element.selectorIndex ?? 0}`}
            element={element}
          />
        ))}
      </ul>
      {/* Neither action applies to audio, so the row goes rather than showing
          an empty frame. Grouping is the LAYOUT grouper — a positioned wrapper
          around a bounding box, and an <audio> clip has none (grouping two
          produced a 0x0 div with inline left/top on elements that are never
          laid out). Hiding is visibility, which for audio doubles as mute; the
          timeline already withholds the eye on an audio track
          (`visible={!isAudioTrack}`) and this panel was the way back to the
          same write. Both handlers refuse it too — they own keyboard paths no
          hidden button can gate. */}
      {!hasAudio && (
        <div className="flex flex-none gap-2">
          <InspectorAction
            variant="secondary"
            data-flat-multiselect-group="true"
            onClick={onGroupSelection}
            className="flex-1"
          >
            <Layers size={15} />
            {t("flat.multiGroup")}
          </InspectorAction>
          <InspectorAction
            variant="secondary"
            data-flat-multiselect-hide-all="true"
            onClick={onHideAllSelected}
            className="flex-1"
          >
            {t("flat.multiHideAll")}
          </InspectorAction>
        </div>
      )}
    </div>
  );
}

export function PropertyPanelEmptyState({
  multiSelectCount,
  flat,
  multiSelectedElements,
  onGroupSelection,
  onHideAllSelected,
  onClearSelection,
}: {
  multiSelectCount: number;
  flat?: boolean;
  multiSelectedElements?: DomEditSelection[];
  onGroupSelection?: () => void;
  onHideAllSelected?: () => void;
  onClearSelection?: () => void;
}) {
  useLocale();
  if (flat) {
    return multiSelectCount > 1 ? (
      <FlatMultiSelectState
        multiSelectCount={multiSelectCount}
        multiSelectedElements={multiSelectedElements}
        onGroupSelection={onGroupSelection}
        onHideAllSelected={onHideAllSelected}
        onClearSelection={onClearSelection}
      />
    ) : (
      <FlatEmptyState />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-studio-surface px-6 text-center">
      {multiSelectCount > 1 ? (
        <p className="text-sm font-semibold text-studio-text">
          {t("inspector.multiTitle", { n: multiSelectCount })}
        </p>
      ) : (
        <FlatEmptyState />
      )}
    </div>
  );
}
