// Effect or treatment preview tile in a family (St-Inspector-EffectsList): frame with a 14px
// radius, the name under it, the active one outlined in the text colour.
import type { FocusEventHandler, MouseEventHandler, PointerEventHandler } from "react";

export interface EffectTileHandlers {
  title: string;
  onPointerEnter: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave: PointerEventHandler<HTMLButtonElement>;
  onFocus: FocusEventHandler<HTMLButtonElement>;
  onBlur: FocusEventHandler<HTMLButtonElement>;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export interface EffectTileDataAttrs {
  /** The button's own data attribute, e.g. { "data-flat-effect-option": "blur" }. */
  [buttonAttr: `data-${string}`]: string;
  imageAttr: string;
  placeholderAttr: string;
  frameAttr?: string;
  id: string;
}

export function EffectTile({
  label,
  selected,
  image,
  aspect,
  status,
  dataAttrs,
  handlers,
}: {
  label: string;
  selected: boolean;
  image: string | undefined;
  aspect: string;
  status: string;
  dataAttrs: EffectTileDataAttrs;
  handlers: EffectTileHandlers;
}) {
  const { imageAttr, placeholderAttr, frameAttr, id, ...buttonAttrs } = dataAttrs;
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...buttonAttrs}
      {...handlers}
      className="group flex min-w-0 flex-col gap-1.5 text-left focus-visible:outline-none"
    >
      <span
        {...(frameAttr ? { [frameAttr]: id } : {})}
        className={`block w-full overflow-hidden rounded-md bg-studio-surface transition-shadow group-focus-visible:shadow-[0_0_0_2px_var(--st-btn)] ${
          selected
            ? "shadow-[0_0_0_2px_var(--st-tx)]"
            : "shadow-[inset_0_0_0_1px_var(--st-bd)] group-hover:shadow-[0_0_0_1.5px_var(--st-sbd)]"
        }`}
        style={{ aspectRatio: aspect }}
      >
        {image ? (
          <img
            {...{ [imageAttr]: id }}
            src={image}
            alt=""
            draggable={false}
            className="block h-full w-full object-cover"
          />
        ) : (
          <span {...{ [placeholderAttr]: status }} className="block h-full w-full" />
        )}
      </span>
      <span
        className={`block truncate text-[12px] ${
          selected ? "font-semibold text-studio-text" : "font-medium text-studio-muted"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
