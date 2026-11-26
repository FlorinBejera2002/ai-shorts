// ── Design Panel Tokens (for inline style={{}} usage) ──────────────────
// Values are CSS variables from styles/tokens.css, so they follow the app theme.
// `white` is the foreground on an accent fill (white on black in light mode).
// Tailwind classes use `panel-*` from styles/tailwind-preset.shared.js.

export const P = {
  accent: "var(--st-btn)",
  borderInput: "var(--st-sbd)",
  textMuted: "var(--st-t3)",
  white: "var(--st-on-btn)",
} as const;
