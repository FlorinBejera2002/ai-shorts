/** Inline error message for a story action that failed or was refused. */
export function StoryErrorAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border p-3 text-sm text-destructive">
      {message}
    </p>
  )
}
