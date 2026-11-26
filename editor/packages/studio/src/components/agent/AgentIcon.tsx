// Stroke icons for the Ana și Radu panel (24px grid, paths from the Studio boards).
const PATHS = {
  chevronRight: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12l5 5 9-10",
  media: "M4 4h16v16H4zM7.5 9.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M4 16l5-5 4 4 2-2 5 5",
  subtitles: "M4 5h16v14H4zM10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3",
  range: "M4 12h16M7 8l-4 4 4 4M17 8l4 4-4 4",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  warning: "M12 4l9 16H3zM12 10v4M12 17h.01",
  refresh: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  send: "M12 19V5M6 11l6-6 6 6",
  stop: "M7 7h10v10H7z",
  play: "M7 5v14l12-7z",
  pause: "M8 5v14M16 5v14",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  sparkle:
    "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
} as const;

export type AgentIconName = keyof typeof PATHS;

export function AgentIcon({
  name,
  size = 18,
  strokeWidth = 2,
}: {
  name: AgentIconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block flex-none"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
