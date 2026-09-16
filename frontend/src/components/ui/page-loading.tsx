export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[55vh] items-center justify-center"
      aria-label={label}
      aria-busy="true"
      role="status"
    >
      <img
        src="/brand/black-loading.gif"
        alt=""
        width={96}
        height={96}
        className="size-24 object-contain"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}
