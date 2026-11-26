// Files the agent asked for: upload them into this Studio project's assets, then resume the run.
import { useRef, useState } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { t } from "../../i18n/translate";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { STUDIO_UPLOAD_ACCEPT, validStudioUpload } from "./agentModel";
import { AgentPill } from "./AgentControls";

export function AgentResourceUpload({
  projectId,
  phone,
  onBusy,
  onUploaded,
}: {
  projectId: string;
  phone: boolean;
  onBusy: (busy: boolean) => void;
  onUploaded: (paths: string[]) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);

  useMountEffect(() => () => controller.current?.abort());

  async function upload(list: File[]) {
    if (!list.length || pending) return;
    if (!validStudioUpload(list)) {
      setError(t("agent.uploadInvalid"));
      return;
    }
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    onBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of list) form.append("file", file);
      const response = await fetch(`${buildProjectApiPath(projectId, "/upload")}?dir=assets`, {
        method: "POST",
        body: form,
        signal: active.signal,
      });
      if (!response.ok) throw new Error(t("agent.uploadFailed"));
      const body: unknown = await response.json().catch(() => null);
      const files =
        body && typeof body === "object" && "files" in body && Array.isArray(body.files)
          ? body.files.filter((path): path is string => typeof path === "string")
          : [];
      setSaved((previous) => [...new Set([...previous, ...files])]);
      if (files.length === list.length) onUploaded(files);
      else setError(t("agent.uploadFailed"));
    } catch (cause) {
      if (!active.signal.aborted)
        setError(cause instanceof Error ? cause.message : t("agent.uploadFailed"));
    } finally {
      setPending(false);
      onBusy(false);
      controller.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={STUDIO_UPLOAD_ACCEPT}
        aria-label={t("agent.uploadMedia")}
        onChange={(event) => {
          void upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <AgentPill
        height={phone ? 44 : 36}
        icon="upload"
        disabled={pending}
        onClick={() => picker.current?.click()}
        className="self-start"
      >
        {pending ? t("agent.uploading") : t("agent.uploadMedia")}
      </AgentPill>
      {saved.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-[var(--st-t2)]">
          {saved.map((path) => (
            <li key={path} className="flex justify-between gap-2">
              <span className="truncate">{path.split("/").at(-1) ?? path}</span>
              <span className="flex-none text-[var(--st-ok)]">{t("agent.uploaded")}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-xs text-[var(--st-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
