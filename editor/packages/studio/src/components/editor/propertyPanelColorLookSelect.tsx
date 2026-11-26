// Field-style dropdown for the look sections (St-Inspector-Curves, -Scopes, -LUT, -AudioCarve):
// a 44px field with a 14px radius and a chevron, opening a card list in which the chosen
// option has the selected-row surface and a check mark. The list is portalled with fixed
// coordinates so the inspector's scroll area never clips it.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { LOOK_ICONS, LookIcon } from "./propertyPanelColorLookUi";

export interface LookOption<T extends string> {
  value: T;
  label: string;
}

export function LookMenuSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  name,
  popupAnchor = "self",
}: {
  /** Accessible name of the field. */
  label: string;
  value: T;
  options: readonly LookOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Stable hook for tests and screenshots: `data-look-select={name}`. */
  name: string;
  /** "parent" opens the list across the nearest positioned ancestor (a field in a grid cell). */
  popupAnchor?: "self" | "parent";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [listStyle, setListStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const root = rootRef.current;
      const anchor = popupAnchor === "parent" ? (root?.offsetParent ?? root) : root;
      const trigger = triggerRef.current;
      if (!anchor || !trigger) return;
      const box = anchor.getBoundingClientRect();
      const field = trigger.getBoundingClientRect();
      const below = window.innerHeight - field.bottom - 12;
      const up = below < 200 && field.top > below;
      setListStyle({
        left: box.left - 6,
        width: box.width + 12,
        ...(up ? { bottom: window.innerHeight - field.top + 6 } : { top: field.bottom + 6 }),
        maxHeight: Math.max(160, Math.min(288, up ? field.top - 18 : below)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, popupAnchor]);

  const openList = () => {
    if (disabled) return;
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  };
  const choose = (next: T) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (next !== value) onChange(next);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      // Escape closes the list only; it must not reach the editor (which deselects).
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + options.length) % options.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option.value);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`${popupAnchor === "self" ? "relative" : ""} min-w-0`}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        data-look-select={name}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        className={`flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md bg-studio-surface pr-3.5 pl-3.5 text-left text-[13px] font-medium text-studio-text outline-none transition-shadow hover:bg-[var(--st-sub)] focus-visible:shadow-[inset_0_0_0_2px_var(--st-btn)] disabled:cursor-not-allowed disabled:opacity-45 ${
          open
            ? "shadow-[inset_0_0_0_1.5px_var(--st-tx)]"
            : "shadow-[inset_0_0_0_1.5px_var(--st-sbd)]"
        }`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ""}</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <LookIcon d={LOOK_ICONS.chevronDown} />
        </span>
      </button>
      {open &&
        listStyle &&
        createPortal(
          <ul
            ref={listRef}
            style={listStyle}
            id={listId}
            role="listbox"
            aria-label={label}
            data-look-select-list={name}
            className="fixed z-[200] flex flex-col gap-0.5 overflow-y-auto rounded-md border border-[var(--st-bd)] bg-studio-surface p-1.5 shadow-studio"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  data-look-option={option.value}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(option.value)}
                  className={`flex min-h-[38px] cursor-pointer items-center gap-2 rounded-sm px-2.5 text-[13px] text-studio-text ${
                    isSelected ? "bg-[var(--st-sel-row)] font-semibold" : "font-medium"
                  } ${!isSelected && index === active ? "bg-[var(--st-sub)]" : ""}`}
                >
                  <span className="flex w-4 flex-none justify-center">
                    {isSelected && <LookIcon d={LOOK_ICONS.check} size={15} />}
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
