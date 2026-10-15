/** Publish late inlined source footage while paused, without waiting for Play. */
export function observeSourceSceneMedia(document: Document, onChange: () => void): () => void {
  const hosts = document.querySelectorAll("[data-source-window]");
  if (hosts.length === 0) return () => {};
  let active = true;
  let queued = false;
  const schedule = () => {
    if (!active || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (active) onChange();
    });
  };
  const observer = new MutationObserver(schedule);
  for (const host of hosts) {
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "data-src"],
    });
    host.addEventListener("loadedmetadata", schedule, true);
  }
  // Also covers metadata that finished just before the iframe's load handler.
  schedule();
  return () => {
    active = false;
    observer.disconnect();
    for (const host of hosts) host.removeEventListener("loadedmetadata", schedule, true);
  };
}
