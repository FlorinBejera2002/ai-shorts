import type { SVGProps } from "react";

// Keep the component contract stable for the loader and topology animation.
export function HyperframesMark({ viewBox = "0 0 100 100", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={viewBox} fill="none" aria-hidden="true" {...props}>
      <image href="/sneepcut-symbol.svg" x="20" y="20" width="60" height="60" />
    </svg>
  );
}
