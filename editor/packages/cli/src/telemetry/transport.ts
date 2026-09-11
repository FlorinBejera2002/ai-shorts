/** Compatibility types; SneepCut permanently disables upstream analytics. */
export type EventPropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[]
  | Readonly<Record<string, number>>;

export interface EventProperties {
  [key: string]: EventPropertyValue;
}
// Direct callers remain inert: no queue, identity, network, or child process.
export function enqueue(_event: string, _properties: EventProperties, _distinctId?: string): void {}
export async function flush(): Promise<void> {}
export function flushSync(): void {}
