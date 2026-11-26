// Stroke icons used by the left rail panels (Media, Audio, Elemente, Straturi, Avansat).
// Paths follow the St-* boards: 24px grid, 2px stroke, round caps.
const PATHS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12l5 5 9-10",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  retry: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5",
  warn: "M12 4l9 16H3zM12 10v4M12 17h.01",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  fileText: "M6 3h8l4 4v14H6zM9 13h6M9 16h4",
  fileNew: "M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6",
  folder: "M3 7h7l2 2h9v10H3z",
  folderNew: "M3 7h7l2 2h9v10H3zM12 11v6M9 14h6",
  chevronRight: "M9 6l6 6-6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  render:
    "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  addAtPlayhead: "M12 5v14M5 12h14",
  lint: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff:
    "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6",
  copy: "M9 9h11v11H9zM5 15V5h10",
  pencil: "M4 20h4L19 9l-4-4L4 16z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  volume: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6",
} as const;

export type PanelIconName = keyof typeof PATHS;

export function PanelIcon({
  name,
  size = 16,
  className,
}: {
  name: PanelIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`block flex-none ${className ?? ""}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
