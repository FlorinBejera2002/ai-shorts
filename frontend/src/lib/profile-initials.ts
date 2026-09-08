export function firstNameInitials(name: string | null | undefined) {
  const firstName = name?.trim().split(/\s+/u)[0] ?? ''
  return (
    Array.from(firstName.normalize('NFC'))
      .slice(0, 2)
      .join('')
      .toLocaleUpperCase() || '?'
  )
}
