export interface TranslationFunction {
  (key: string, values?: Record<string, unknown>): string
  raw(key: string): any
  has(key: string): boolean
}

function serverOnly(): never {
  throw new Error('next-intl/server is unavailable in the browser runtime')
}

export async function getTranslations(
  _namespace?: string
): Promise<TranslationFunction> {
  return serverOnly()
}

export async function getMessages(): Promise<Record<string, unknown>> {
  return serverOnly()
}

export function setRequestLocale(_locale?: string) {
  // The Vite runtime derives locale from React Router before rendering.
}

export function getRequestConfig<T>(factory: T): T {
  return factory
}
