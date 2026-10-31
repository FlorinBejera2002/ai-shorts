// ── Design Panel Tokens (for inline style={{}} usage) ──────────────────
// Tailwind classes use `panel-*` from tailwind.config.js theme.extend.colors.
// This file provides the same values for inline styles where Tailwind can't reach.

export const P = {
  accent: "#5B8CFF",
  borderInput: "#2B3A52",
  textMuted: "#6B7A92",
  white: "#EEF3FB",
} as const;
