import { Share2 } from 'lucide-react'

export default function PublishPage() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">Publish</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Social media publishing
      </p>
      <div className="mt-10 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <Share2 className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Coming soon in Phase 6
        </p>
      </div>
    </div>
  )
}
