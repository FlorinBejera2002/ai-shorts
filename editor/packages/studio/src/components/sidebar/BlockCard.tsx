// Catalog card (St-Shell-Categories, St-Shell-BlockAgent, St-Shell-VFX): poster with WebGL and
// duration badges, category dot + name, title, and the add state ("Se adaugă…", "Adăugat!",
// "Eșuat"). Hovering previews the block in the preview card; a click opens the block actions
// (Cere ajutor with a "Bloc · <name>" context chip, Adaugă la cursor, Previzualizează).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../../i18n/translate";
import { illustrationSrc } from "../ui";
import { usePlayerStore } from "../../player";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { TIMELINE_BLOCK_MIME } from "../../utils/timelineAssetDrop";
import type { BlockCategory } from "../../utils/blockCategories";
import { openAgent } from "../agent/agentSession";
import { buildAgentPrompt } from "./blockAgentPrompt";
import { useIsPhone } from "../shell/useIsPhone";
import { PanelIcon } from "./panelIcons";
import { PanelPill, PanelTag } from "./panelKit";
import { MENU_ITEM_CLASS, POPOVER_CLASS } from "./RenamePopover";
import type { MessageKey } from "../../i18n/dictionary";

export interface BlockPreviewInfo {
  videoUrl?: string;
  posterUrl?: string;
  title: string;
}

export function categoryLabel(category: BlockCategory): string {
  return t(`elements.cat.${category}` as MessageKey);
}

export interface BlockCardProps {
  name: string;
  title: string;
  description: string;
  blockType: string;
  duration?: number;
  category: BlockCategory;
  tags?: string[];
  posterUrl?: string;
  videoUrl?: string;
  onAdd?: () => void | Promise<void>;
  onPreview?: (preview: BlockPreviewInfo | null) => void;
}

type AddState = "idle" | "adding" | "added" | "failed";

function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function AddStatus({ state, onAdd }: { state: AddState; onAdd: (e: React.MouseEvent) => void }) {
  if (state === "adding") {
    return (
      <PanelPill size={30} disabled>
        {t("elements.adding")}
      </PanelPill>
    );
  }
  if (state === "added") {
    return (
      <PanelTag tone="ok" height={28} role="status">
        {t("elements.addedBang")}
      </PanelTag>
    );
  }
  if (state === "failed") {
    return (
      <PanelTag tone="danger" icon="warn" height={28} role="status">
        {t("elements.failed")}
      </PanelTag>
    );
  }
  return (
    <span className="hidden group-focus-within:inline-flex group-hover:inline-flex">
      <PanelPill size={30} icon="plus" onClick={onAdd}>
        {t("elements.add")}
      </PanelPill>
    </span>
  );
}

function BlockActionsMenu({
  anchor,
  title,
  onClose,
  onAskHelp,
  onAdd,
  onPreview,
}: {
  anchor: DOMRect;
  title: string;
  onClose: () => void;
  onAskHelp: () => void;
  onAdd?: () => void;
  onPreview: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const left = Math.min(anchor.left, window.innerWidth - 268);
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 140);
  const item = (label: string, run: () => void, icon: React.ReactNode, first = false) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClose();
        run();
      }}
      className={`${MENU_ITEM_CLASS} ${first ? "bg-[var(--st-sub)]" : ""}`}
    >
      {icon}
      <span className="flex-1">{label}</span>
    </button>
  );
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[200]" onClick={onClose}>
      <div
        ref={menuRef}
        role="menu"
        aria-label={t("elements.actionsFor", { name: title })}
        className={`absolute flex w-[260px] flex-col gap-0.5 p-1.5 ${POPOVER_CLASS}`}
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        {item(
          t("agent.askHelp"),
          onAskHelp,
          <img
            src={illustrationSrc("agent-avatar-duo")}
            alt=""
            aria-hidden="true"
            className="h-5 w-5 rounded-full object-cover"
          />,
          true,
        )}
        {onAdd ? item(t("elements.add"), onAdd, <PanelIcon name="addAtPlayhead" />) : null}
        {item(t("elements.preview"), onPreview, <PanelIcon name="play" />)}
      </div>
    </div>,
    document.body,
  );
}

// fallow-ignore-next-line complexity
export function BlockCard({
  name,
  title,
  description,
  blockType,
  duration,
  category,
  tags,
  posterUrl,
  videoUrl,
  onAdd,
  onPreview,
}: BlockCardProps) {
  useLocale();
  // St-M-Elements: taller thumbnails and the title alone under them.
  const isPhone = useIsPhone();
  const [hovered, setHovered] = useState(false);
  const [addState, setAddState] = useState<AddState>("idle");
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsWebGL = tags?.includes("html-in-canvas") || tags?.includes("webgl");
  const { activeCompPath, compositionDimensions } = useStudioShellContext();

  const showPreview = useCallback(
    () => onPreview?.({ videoUrl, posterUrl, title }),
    [onPreview, videoUrl, posterUrl, title],
  );
  const handleEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => {
      setHovered(true);
      showPreview();
    }, 300);
  }, [showPreview]);
  const handleLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHovered(false);
    if (!menuAnchor) onPreview?.(null);
  }, [onPreview, menuAnchor]);

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const runAdd = useCallback(async () => {
    if (addState !== "idle" || !onAdd) return;
    setAddState("adding");
    try {
      // Confirm only what happened: no optimistic "Adăugat!".
      await onAdd();
      setAddState("added");
    } catch {
      setAddState("failed");
    }
    resetTimer.current = setTimeout(() => setAddState("idle"), 1500);
  }, [onAdd, addState]);

  const askHelp = useCallback(() => {
    const state = usePlayerStore.getState();
    const prompt = buildAgentPrompt(title, name, description, category, blockType, {
      currentTime: state.currentTime,
      activeCompPath,
      elements: state.elements.map((el) => ({
        id: el.id,
        start: el.start,
        duration: el.duration,
        track: el.track,
        label: el.label,
        compositionSrc: el.compositionSrc,
      })),
      compositionDimensions: compositionDimensions ?? undefined,
    });
    openAgent({
      context: { prompt, label: t("elements.agentChip", { name: title }), kind: "block" },
    });
  }, [title, name, description, category, blockType, activeCompPath, compositionDimensions]);

  const openMenu = (target: HTMLElement) => setMenuAnchor(target.getBoundingClientRect());

  return (
    <figure
      className="group m-0 flex min-w-0 flex-col gap-1.5"
      draggable
      data-block-card={name}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(TIMELINE_BLOCK_MIME, JSON.stringify({ name }));
        e.dataTransfer.setData("text/plain", name);
        handleLeave(); // the hover preview must not fire mid-drag
      }}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-label={t("elements.actionsFor", { name: title })}
        onClick={(e) => openMenu(e.currentTarget)}
        className={`relative block ${isPhone ? "h-24" : "h-[46px]"} overflow-hidden rounded-[12px] bg-[var(--st-sub)] outline-none transition-shadow hover:shadow-[inset_0_0_0_1.5px_var(--st-tx)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]`}
      >
        {hovered && videoUrl ? (
          <video
            src={videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : videoUrl ? (
          <video
            src={videoUrl}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : null}
        {needsWebGL ? (
          <span className="absolute left-1.5 top-1.5 h-5 rounded-[6px] bg-studio-surface px-1.5 text-[10px] font-semibold leading-5 text-studio-text">
            {t("elements.webgl")}
          </span>
        ) : null}
        {duration != null ? (
          <span className="absolute bottom-1.5 right-1.5 rounded-[6px] bg-studio-surface px-[5px] text-[11px] font-semibold leading-4 tabular-nums text-studio-text">
            {formatSeconds(duration)}
          </span>
        ) : null}
      </button>
      {/* Category dot and title on desktop and phone alike (St-Shell-Categories,
          St-M-Shell-Categories). */}
      <figcaption className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] font-medium text-[var(--st-t2)]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--st-t2)]"
          />
          {categoryLabel(category)}
        </span>
        <b className="truncate text-[13px] font-semibold" title={description || title}>
          {title}
        </b>
      </figcaption>
      {onAdd ? (
        <AddStatus
          state={addState}
          onAdd={(e) => {
            e.stopPropagation();
            void runAdd();
          }}
        />
      ) : null}
      {menuAnchor ? (
        <BlockActionsMenu
          anchor={menuAnchor}
          title={title}
          onClose={() => {
            setMenuAnchor(null);
            onPreview?.(null);
          }}
          onAskHelp={askHelp}
          onAdd={onAdd ? () => void runAdd() : undefined}
          onPreview={() => {
            // Keep the preview up after the menu closes until the pointer leaves the card.
            showPreview();
            setHovered(true);
          }}
        />
      ) : null}
    </figure>
  );
}
