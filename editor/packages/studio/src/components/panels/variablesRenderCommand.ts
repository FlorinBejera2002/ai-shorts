/** Shell command that renders a composition with the given variable values. */

/** POSIX single-quote escaping so the copied command survives quotes in values. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function renderCommand(compPath: string, effectiveValues: Record<string, unknown>): string {
  const json = JSON.stringify(effectiveValues);
  return `npx hyperframes render ${shellSingleQuote(compPath)} --variables ${shellSingleQuote(json)}`;
}
