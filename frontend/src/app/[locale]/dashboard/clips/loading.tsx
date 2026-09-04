export default function ClipsLoading() {
  return (
    <div className="animate-pulse" aria-label="Loading clips" aria-busy="true">
      <div className="h-8 w-40 rounded-lg bg-muted" />
      <div className="mt-3 h-4 w-64 rounded bg-muted" />
      <div className="mt-7 h-28 rounded-2xl bg-muted" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-border"
          >
            <div className="aspect-video bg-muted" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-4/5 rounded bg-muted" />
              <div className="h-3 w-2/5 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
