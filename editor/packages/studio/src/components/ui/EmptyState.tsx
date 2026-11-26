import type { ReactNode } from "react";
import { illustrationSrc, type StudioIllustrationName } from "./illustrations";

// Empty and error states: one illustration, one title, and at most one action.
export interface EmptyStateProps {
  illustration: StudioIllustrationName;
  title: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ illustration, title, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-4 px-6 py-8 text-center ${className}`}>
      <img
        src={illustrationSrc(illustration)}
        alt=""
        aria-hidden="true"
        className="h-32 w-32 object-contain"
        draggable={false}
      />
      <p className="font-display text-base font-semibold text-studio-text">{title}</p>
      {action}
    </div>
  );
}
