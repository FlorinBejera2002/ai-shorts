import { useEffect, useState } from "react";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import {
  type BackgroundRemovalProgress,
  type BackgroundRemovalResult,
  stripQueryAndHash,
} from "./propertyPanelHelpers";
import { FlatSelectRow } from "./propertyPanelFlatPrimitives";
import { FlatToggle } from "./propertyPanelFlatToggle";
export function FlatMediaCutout({
  srcAttr,
  isVideo,
  onSetAttribute,
  onSetHtmlAttribute,
  onRemoveBackground,
}: {
  srcAttr: string;
  isVideo: boolean;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onRemoveBackground?: (
    inputPath: string,
    options: {
      createBackgroundPlate?: boolean;
      quality?: "fast" | "balanced" | "best";
      onProgress?: (progress: BackgroundRemovalProgress) => void;
    },
  ) => Promise<BackgroundRemovalResult>;
}) {
  const track = useTrackDesignInput();
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeProgress, setRemoveProgress] = useState<BackgroundRemovalProgress | null>(null);
  const [createPlate, setCreatePlate] = useState(false);
  const [quality, setQuality] = useState<"fast" | "balanced" | "best">("balanced");

  const projectSrc =
    srcAttr && !/^(?:https?:|data:|blob:)/i.test(srcAttr)
      ? stripQueryAndHash(srcAttr.startsWith("./") ? srcAttr.slice(2) : srcAttr)
      : "";
  const canRemoveBackground = Boolean(onRemoveBackground && projectSrc);

  useEffect(() => {
    setRemoveProgress(null);
    setCreatePlate(false);
  }, [srcAttr]);

  const applyCutoutResult = async (result: BackgroundRemovalResult) => {
    await onSetHtmlAttribute("src", result.outputPath);
    if (isVideo) {
      await onSetAttribute("has-audio", "");
      await onSetHtmlAttribute("muted", "true");
    }
  };

  const runBackgroundRemoval = async () => {
    if (!onRemoveBackground || !projectSrc || removeBusy) return;
    track("button", "Remove background");
    setRemoveBusy(true);
    setRemoveProgress({ status: "processing", progress: 0, stage: "Preparing" });
    try {
      const result = await onRemoveBackground(projectSrc, {
        createBackgroundPlate: isVideo && createPlate,
        quality,
        onProgress: setRemoveProgress,
      });
      await applyCutoutResult(result);
      setRemoveProgress({ status: "complete", progress: 100, stage: "Applied cutout", ...result });
    } catch (error) {
      setRemoveProgress({
        status: "failed",
        progress: 0,
        stage: "Failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div className="ml-[1px] border-l-2 border-panel-border-input py-1 pl-[10px]">
      <div className="flex min-h-6 items-center justify-between">
        <span className="flex items-baseline gap-[7px]">
          <span className="text-[11px] font-semibold text-panel-text-1">Cutout</span>
          <span className="font-mono text-[9px] text-panel-text-4">
            transparent {isVideo ? "WebM" : "PNG"}
          </span>
        </span>
        <button
          type="button"
          data-flat-media-remove-bg="true"
          disabled={!canRemoveBackground || removeBusy}
          onClick={() => void runBackgroundRemoval()}
          className="flex items-center gap-1 text-[10px] font-medium text-panel-accent disabled:cursor-not-allowed disabled:opacity-50"
          title={
            canRemoveBackground
              ? "Remove background and save a transparent asset"
              : "Select a project-local image or video asset"
          }
        >
          {removeBusy ? "Working" : "Remove BG"}
        </button>
      </div>
      <FlatSelectRow
        label="Quality"
        value={quality}
        options={["fast", "balanced", "best"]}
        tier="explicitDefault"
        onChange={(next) => setQuality(next as typeof quality)}
      />
      {isVideo && <FlatToggle label="BG plate" checked={createPlate} onChange={setCreatePlate} />}
      {removeProgress && (
        <div className="mt-1 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-panel-text-4">
            <span className="min-w-0 flex-1 truncate">
              {removeProgress.error ?? removeProgress.stage ?? "Processing"}
            </span>
            <span>{Math.round(removeProgress.progress)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-panel-hover">
            <div
              className={`h-full rounded-full ${
                removeProgress.status === "failed" ? "bg-red-400" : "bg-panel-accent"
              }`}
              style={{ width: `${Math.max(0, Math.min(100, removeProgress.progress))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
