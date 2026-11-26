// Stroke icons for the output area (export, renders, states, variables, slideshow, storyboard).
// Paths follow the Studio boards (st.js IC set) so the shapes match the designs.
const PATHS = {
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  refresh: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5",
  close: "M6 6l12 12M18 6L6 18",
  warn: "M12 4l9 16H3zM12 10v4M12 17h.01",
  copy: "M9 9h11v11H9zM5 15V5h10",
  check: "M5 12l5 5 9-10",
  info: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16v-5M12 8h.01",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  play: "M7 5v14l12-7z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  pen: "M4 20h4L19 9l-4-4L4 16z",
  publish: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M8 7l4-4 4 4",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  back: "M15 18l-6-6 6-6",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
} as const;

export type OutputIconName = keyof typeof PATHS;

export interface OutputIconProps {
  name: OutputIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function OutputIcon({ name, size = 16, strokeWidth = 2, className }: OutputIconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["block flex-none", className].filter(Boolean).join(" ")}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
