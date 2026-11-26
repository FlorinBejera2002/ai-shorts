// Stroke icons used by the Studio shell (top bar, rail, phone bars). Paths follow the Studio boards.
const PATHS = {
  back: "M15 18l-6-6 6-6",
  check: "M5 12l5 5 9-10",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  capture:
    "M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  inspector: "M4 4h16v16H4zM15 4v16",
  sidebar: "M4 4h16v16H4zM9 4v16",
  phone: "M7 4h10v16H7z",
  landscape: "M4 7h16v10H4z",
  square: "M5 5h14v14H5z",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  media: "M4 4h16v16H4zM7.5 9.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M4 16l5-5 4 4 2-2 5 5",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  subtitles: "M4 5h16v14H4zM10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3",
  audio: "M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4",
  elements: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  advanced: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M18 18h2",
  edit: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M18 18h2",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  warning: "M12 4l9 16H3zM12 10v4M12 17v.01",
  close: "M6 6l12 12M18 6L6 18",
  code: "M9 8l-4 4 4 4M15 8l4 4-4 4",
  lint: "M5 12l5 5 9-10",
  render: "M12 4v12M7 11l5 5 5-5M4 20h16",
} as const;

export type ShellIconName = keyof typeof PATHS;

export interface ShellIconProps {
  name: ShellIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ShellIcon({ name, size = 18, strokeWidth = 2, className }: ShellIconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
