// Stroke icons for the timeline card (toolbar, track headers, menus). Paths follow the
// St-Timeline boards so the editor and the design read as one set.
const PATHS = {
  cursor: "M5 3l14 8-6 2-3 6z",
  scissors:
    "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12",
  magnet: "M5 4v7a7 7 0 0 0 14 0V4h-4v7a3 3 0 0 1-6 0V4z",
  key: "M12 3l7 9-7 9-7-9z",
  split: "M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5",
  beat: "M12 4v16M7 9v6M17 9v6",
  media: "M4 4h16v16H4zM7.5 9.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M4 16l5-5 4 4 2-2 5 5",
  keyboard: "M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M11 8v6M8 11h6",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M8 11h6",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  copy: "M9 9h11v11H9zM5 15V5h10",
  arrow: "M5 12h14M13 6l6 6-6 6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff:
    "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.1-1.4",
  music: "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  subs: "M4 5h16v14H4zM10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2",
  pen: "M4 20h4L19 9l-4-4L4 16z",
  check: "M5 12l5 5 9-10",
  close: "M6 6l12 12M18 6L6 18",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M18 18h2",
  sparkle:
    "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  refresh: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5",
  send: "M12 19V5M6 11l6-6 6 6",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
} as const;

export type TimelineIconName = keyof typeof PATHS;

export interface TimelineIconProps {
  name: TimelineIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function TimelineIcon({ name, size = 16, strokeWidth = 2, className }: TimelineIconProps) {
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
      className={className}
      style={{ display: "block", flex: "none" }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
