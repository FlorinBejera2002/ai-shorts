import { useLayoutEffect, useRef } from "react";

/**
 * A ref that always holds the latest committed value. Renders never write the ref; it is
 * updated in a layout effect, before any event handler or async callback can read it.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
