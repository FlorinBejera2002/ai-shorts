export const numberFormat = new Intl.NumberFormat('ro-RO')
export const dateTimeFormat = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })

export function initial(value: string) {
  return value.slice(0, 1).toUpperCase()
}
