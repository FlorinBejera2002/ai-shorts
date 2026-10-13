import { HTTPException } from "hono/http-exception";
import { isUUID } from "./store";

export type RecordValue = Record<string, unknown>;
export function record(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function fields(value: RecordValue, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new HTTPException(422, { message: "Unsupported Studio action field" });
}
export function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new HTTPException(422, { message: "Invalid Studio action text" });
  return value;
}
export function id(value: unknown): string {
  const valueID = text(value, 36);
  if (!isUUID(valueID))
    throw new HTTPException(422, { message: "Invalid Studio project identity" });
  return valueID;
}
export function version(value: unknown): string {
  const current = text(value, 80);
  if (!/^"sha256:[a-f0-9]{64}"$/.test(current))
    throw new HTTPException(422, { message: "Inspect the current Studio document before editing" });
  return current;
}
export function finite(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new HTTPException(422, { message: "Studio edit value is outside its allowed range" });
  return value;
}
