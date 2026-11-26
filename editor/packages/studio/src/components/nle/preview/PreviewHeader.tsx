// Preview card header (St-Main, St-Preview-Topology): title, the structure-lens indicator while an
// agent edit is being located, and zoom out / "Potrivește" / zoom in.
import { useSyncExternalStore, type RefObject } from "react";
import { t, useLocale } from "../../../i18n/translate";
import { studioEditLifecycle } from "../../../webmcp/writeCoordinator";
import { OutlinePill, PreviewIcon, PreviewIconButton } from "./previewChrome";
import type { PreviewZoomApi } from "./usePreviewZoom";
import { SourceImportNotice } from "../../SourceImportNotice";

function TopologyLensIndicator() {
  const lifecycle = useSyncExternalStore(
    studioEditLifecycle.subscribe,
    studioEditLifecycle.getSnapshot,
    studioEditLifecycle.getSnapshot,
  );
  if (lifecycle.phase === "idle") return null;
  return (
    <PreviewIconButton
      label={t("preview.topologyLens")}
      size={32}
      tone="selected"
      aria-pressed="true"
      onClick={() => studioEditLifecycle.dismiss(lifecycle.callId)}
    >
      <PreviewIcon name="layers" size={16} />
    </PreviewIconButton>
  );
}

export function PreviewHeader({
  zoomApiRef,
  disabled = false,
}: {
  zoomApiRef: RefObject<PreviewZoomApi | null>;
  disabled?: boolean;
}) {
  useLocale();
  return (
    <div className="flex min-h-8 flex-none items-center gap-2">
      <h2 className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold text-studio-text">
        {t("preview.title")}
      </h2>
      <SourceImportNotice placement="header" />
      <TopologyLensIndicator />
      <PreviewIconButton
        label={t("preview.zoomOut")}
        size={32}
        disabled={disabled}
        onClick={() => zoomApiRef.current?.zoomOut()}
      >
        <PreviewIcon name="zoomOut" size={16} />
      </PreviewIconButton>
      <OutlinePill height={30} disabled={disabled} onClick={() => zoomApiRef.current?.fit()}>
        {t("preview.fit")}
      </OutlinePill>
      <PreviewIconButton
        label={t("preview.zoomIn")}
        size={32}
        disabled={disabled}
        onClick={() => zoomApiRef.current?.zoomIn()}
      >
        <PreviewIcon name="zoomIn" size={16} />
      </PreviewIconButton>
    </div>
  );
}
