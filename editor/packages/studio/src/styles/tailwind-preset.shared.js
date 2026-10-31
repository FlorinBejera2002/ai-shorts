// Sneepcut Studio theme — Claude reference canvas "Editor video" (2026-10-31).
// The neutral scale is remapped to the reference navy palette so every existing
// `neutral-*` utility follows the design without touching individual components.
const navy = {
  50: "#f5f8fd",
  100: "#eef3fb",
  200: "#d8e1ee",
  300: "#b8c5d8",
  400: "#96a4ba",
  500: "#6b7a92",
  600: "#4d5d78",
  700: "#34455f",
  800: "#243147",
  900: "#151e2d",
  950: "#0b111c",
};

const studioPreset = {
  theme: {
    extend: {
      borderRadius: {
        sm: "var(--radius-sm, 0.5rem)",
        md: "var(--radius-md, 0.75rem)",
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        display: ['"Sora Variable"', "Sora", "Inter", "sans-serif"],
      },
      colors: {
        neutral: navy,
        studio: {
          bg: "#0b111c",
          surface: "#121a27",
          border: "#243147",
          text: "#eef3fb",
          muted: "#96a4ba",
          accent: "#5b8cff",
        },
        panel: {
          bg: "#121a27",
          // Open inspector-section body — slightly lighter than headers (bg)
          // so the recessed scrollable region reads distinct.
          "bg-inset": "#0f1724",
          input: "#0b111c",
          surface: "#1a2535",
          hover: "#212d40",
          border: "#243147",
          "border-input": "#2b3a52",
          hairline: "#1c283a",
          "text-0": "#eef3fb",
          "text-1": "#dbe3f0",
          "text-2": "#96a4ba",
          "text-3": "#6b7a92",
          "text-4": "#4d5d78",
          "text-5": "#34455f",
          accent: "#5b8cff",
          danger: "#f87171",
          media: "#00E3FF",
          container: "#F5A623",
        },
      },
    },
  },
  plugins: [],
};

export default studioPreset;
