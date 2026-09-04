/** Roles are refreshed from the database by auth(), never accepted from a body. */
export function canWriteContent(
  session: { user?: { accessRole?: string } } | null | undefined
): boolean {
  return session?.user?.accessRole === 'member'
}
