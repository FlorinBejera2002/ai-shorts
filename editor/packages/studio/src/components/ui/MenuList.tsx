// Menu panel content: neutral hover, danger items in the danger token, 8px item radius.
// Positioning and open state belong to the trigger that renders this list.
export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuListProps {
  label: string;
  items: readonly MenuItem[];
  onDone?: () => void;
  className?: string;
}

export function MenuList({ label, items, onDone, className = "" }: MenuListProps) {
  return (
    <div
      role="menu"
      aria-label={label}
      className={`flex min-w-44 flex-col gap-0.5 rounded-card bg-studio-surface p-1.5 shadow-studio ${className}`}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onDone?.();
          }}
          className={[
            "flex h-9 items-center rounded-sm px-3 text-left text-sm",
            "hover:bg-[var(--st-sub)] disabled:cursor-not-allowed disabled:opacity-45",
            item.danger ? "text-studio-danger" : "text-studio-text",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
