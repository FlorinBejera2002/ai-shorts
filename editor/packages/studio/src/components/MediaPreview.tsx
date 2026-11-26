// Preview of a media file picked in Avansat › Cod (St-Shell-FilePreview, St-Shell-FileError):
// image or video at the panel width with a 16px radius, audio with native controls, fonts and
// other binaries as a "Fișier binar" card, and a retryable load error with the error
// illustration.
import { useState } from "react";
import { buildProjectApiPath } from "../utils/projectRouting";
import { IMAGE_EXT, VIDEO_EXT, AUDIO_EXT } from "../utils/mediaTypes";
import { t, useLocale } from "../i18n/translate";
import { illustrationSrc } from "./ui";
import { PanelIcon } from "./sidebar/panelIcons";
import { PanelPill } from "./sidebar/panelKit";

const CARD = "rounded-[20px] bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)]";

function BinaryCard({ name }: { name: string }) {
  return (
    <div className={`flex items-center gap-3 p-4 ${CARD}`}>
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] shadow-[inset_0_0_0_1px_var(--st-bd)]">
        <PanelIcon name="fileText" size={20} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="text-[13px] font-semibold">{t("code.binary")}</b>
        <span className="truncate text-xs text-[var(--st-t2)]">{name}</span>
      </span>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-3 px-4 py-5 text-center ${CARD}`}>
      <img
        src={illustrationSrc("studio-preview-error")}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-24 w-24 object-contain"
      />
      <b className="text-[13px] font-semibold [text-wrap:balance]">{t("code.loadError")}</b>
      <PanelPill size={34} onClick={onRetry}>
        {t("common.retry")}
      </PanelPill>
    </div>
  );
}

// fallow-ignore-next-line complexity
export function MediaPreview({ projectId, filePath }: { projectId: string; filePath: string }) {
  useLocale();
  const [attempt, setAttempt] = useState(0);
  const baseUrl = buildProjectApiPath(projectId, `/preview/${filePath}`);
  const serveUrl = attempt > 0 ? `${baseUrl}?retry=${attempt}` : baseUrl;
  const name = filePath.split("/").pop() ?? filePath;
  // Keyed by path so switching files clears an earlier failure.
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const failed = failedPath === filePath;
  const setFailed = () => setFailedPath(filePath);
  const retry = () => {
    setFailedPath(null);
    setAttempt((n) => n + 1);
  };

  const isImage = IMAGE_EXT.test(filePath);
  const isVideo = VIDEO_EXT.test(filePath);
  const isAudio = AUDIO_EXT.test(filePath);

  if (!isImage && !isVideo && !isAudio) {
    return (
      <div className="flex flex-col gap-3.5">
        <BinaryCard name={name} />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex flex-col gap-3.5">
        <LoadError onRetry={retry} />
      </div>
    );
  }
  return (
    <figure className="m-0 flex flex-col gap-1.5" data-media-preview={filePath}>
      {isImage ? (
        <span className="relative block h-[150px] overflow-hidden rounded-[16px] bg-[var(--st-sub)]">
          <img
            src={serveUrl}
            alt={name}
            onError={setFailed}
            className="h-full w-full object-contain"
          />
        </span>
      ) : isVideo ? (
        <video
          src={serveUrl}
          controls
          onError={setFailed}
          className="max-h-[260px] w-full rounded-[16px] bg-[var(--st-sub)]"
        />
      ) : (
        <div className={`flex items-center gap-2.5 px-3 py-2.5 ${CARD} !rounded-md`}>
          <audio src={serveUrl} controls onError={setFailed} className="w-full" />
        </div>
      )}
      <figcaption className="truncate text-xs text-[var(--st-t2)]" title={filePath}>
        {name}
      </figcaption>
    </figure>
  );
}
