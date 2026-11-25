/** Sneep Cut wordmark with the symbol for compact layouts. The console is light only. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={`brand-logo ${className ?? ''}`}>
      <img className="brand-wordmark" src="/sneepcut-logo.svg" alt="Sneep Cut" />
      <img className="brand-symbol" src="/logo-icon.svg" alt="Sneep Cut" />
    </span>
  )
}
