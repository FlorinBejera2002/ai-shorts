// Skeletons of the preview card while the composition loads for the first time
// (St-Preview-Loading): title and zoom pill, the 9:16 stage and the transport bar. The loading
// card and its scrim sit on top (PreviewStatus).
const BONE = "block flex-none bg-[var(--st-sub)] motion-safe:animate-pulse";

export function PreviewHeaderSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-8 flex-none items-center justify-between gap-2">
      <span className={`${BONE} h-3.5 w-[110px] rounded-full`} />
      <span className={`${BONE} h-[30px] w-[92px] rounded-full`} />
    </div>
  );
}

export function PreviewStageSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-studio-surface"
    >
      <span className={`${BONE} aspect-[9/16] h-full max-w-full rounded-[12px]`} />
    </div>
  );
}

export function PreviewTransportSkeleton() {
  return <span aria-hidden="true" className={`${BONE} h-11 w-full rounded-full`} />;
}
