import type { HTMLAttributes, ReactNode } from "react";

// Studio panel card: 24px radius, surface token, soft shadow. Reuse for every panel card.
export function Card({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  return (
    <section className={`rounded-card bg-studio-surface shadow-studio ${className}`} {...rest}>
      {children}
    </section>
  );
}
