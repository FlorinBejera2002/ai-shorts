// Display formatting for the cut inspector: clip length, aspect ratio and adjustment values.
import type { ClipAdjustment } from "../../utils/clipAdjustments";

export function formatClipLength(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function formatAspect(width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return null;
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

/** Board formats: brightness and contrast as an offset from neutral, saturation in %. */
export function formatAdjustment(property: ClipAdjustment, value: number): string {
  if (property === "brightness" || property === "contrast") {
    const offset = value - 100;
    return offset > 0 ? `+${offset}` : String(offset);
  }
  if (property === "sharpen") return String(value);
  return `${value}%`;
}
