// Sneep Cut Studio Tailwind preset.
// Every colour points at a CSS variable from styles/tokens.css, so light and dark
// follow the app theme without per-component overrides. Do not add hex values here.
// Opacity modifiers (bg-x/50) do not apply to var()-based colours; use the token
// with color-mix() or a dedicated token instead.
const token = (name) => `var(--st-${name})`;

// Legacy `neutral-*` ramp, mapped from dark to light: 950 is the canvas, 900 the card.
const neutral = {
  50: token("tx"),
  100: token("tx"),
  200: token("t2"),
  300: token("t2"),
  400: token("t2"),
  500: token("t3"),
  600: token("hd"),
  700: token("bd"),
  800: token("sub"),
  900: token("sf"),
  950: token("bg"),
};

const studioPreset = {
  theme: {
    extend: {
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        card: "var(--radius-card)",
        sheet: "var(--radius-sheet)",
      },
      boxShadow: {
        studio: token("sh"),
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        display: ['"Sora Variable"', "Sora", "Inter", "sans-serif"],
      },
      colors: {
        neutral,
        studio: {
          bg: token("bg"),
          surface: token("sf"),
          border: token("bd"),
          text: token("tx"),
          muted: token("t3"),
          accent: token("btn"),
          "on-accent": token("on-btn"),
          selected: token("sel"),
          "on-selected": token("on-sel"),
          info: token("info"),
          ok: token("ok"),
          warn: token("warn"),
          "warn-text": token("warn-text"),
          "info-bg": token("info-bg"),
          "ok-bg": token("ok-bg"),
          "warn-bg": token("warn-bg"),
          "danger-bg": token("danger-bg"),
          danger: token("danger"),
        },
        panel: {
          bg: token("sf"),
          // Open inspector-section body, recessed below the header.
          "bg-inset": token("in"),
          input: token("bg"),
          surface: token("sub"),
          hover: token("sub"),
          border: token("bd"),
          "border-input": token("sbd"),
          hairline: token("bd"),
          "text-0": token("tx"),
          "text-1": token("tx"),
          "text-2": token("t2"),
          "text-3": token("t3"),
          "text-4": token("hd"),
          "text-5": token("bd"),
          accent: token("btn"),
          danger: token("danger"),
          // Track type colours (media / generated content) predate the redesign.
          media: token("track-media"),
          container: token("track-container"),
        },
      },
    },
  },
  plugins: [],
};

export default studioPreset;
