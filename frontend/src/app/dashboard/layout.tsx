export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh">
      <aside className="w-64 border-r border-sidebar-border bg-sidebar p-4">
        <div className="text-lg font-bold text-sidebar-foreground">
          ClipForge
        </div>
        <nav className="mt-8 space-y-2 text-sm text-sidebar-foreground">
          <a href="/dashboard" className="block rounded p-2 hover:bg-sidebar-accent">Home</a>
          <a href="/dashboard/create" className="block rounded p-2 hover:bg-sidebar-accent">Create</a>
          <a href="/dashboard/clips" className="block rounded p-2 hover:bg-sidebar-accent">My Clips</a>
          <a href="/dashboard/history" className="block rounded p-2 hover:bg-sidebar-accent">History</a>
          <a href="/dashboard/publish" className="block rounded p-2 hover:bg-sidebar-accent">Publish</a>
          <a href="/dashboard/brand" className="block rounded p-2 hover:bg-sidebar-accent">Brand Kit</a>
          <a href="/dashboard/settings" className="block rounded p-2 hover:bg-sidebar-accent">Settings</a>
          <a href="/dashboard/billing" className="block rounded p-2 hover:bg-sidebar-accent">Billing</a>
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
