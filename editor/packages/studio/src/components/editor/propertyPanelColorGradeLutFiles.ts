// LUT file helpers for the LUT block (St-Inspector-LUT, St-Inspector-LUTError): validate a .cube
// before it is applied, and read each loaded file's size for its row subtitle.
import { useEffect, useState } from "react";
import { useFileManagerContextOptional } from "../../contexts/FileManagerContext";
import type { StudioLocale } from "../../i18n/dictionary";
import { buildProjectApiPath } from "../../utils/projectRouting";

const NUMBER_LINE =
  /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?(\s+[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?){2}$/;
const MAX_CUBE_SIZE = 256;

/**
 * True when the text is a readable 3D .cube LUT: a `LUT_3D_SIZE N` header and exactly N³ rows of
 * three numbers. The runtime parser is stricter about ranges; this catches the files it would
 * reject outright (wrong format, truncated, 1D LUTs) before they are applied to a clip.
 */
export function isReadableCubeLut(text: string): boolean {
  let size = 0;
  let rows = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^LUT_3D_SIZE\s+(\d+)$/i.exec(line);
    if (header) {
      size = Number(header[1]);
      continue;
    }
    if (/^[A-Z_]+(\s|$)/i.test(line) && !NUMBER_LINE.test(line)) continue;
    if (!NUMBER_LINE.test(line)) return false;
    rows += 1;
  }
  return size >= 2 && size <= MAX_CUBE_SIZE && rows === size ** 3;
}

export async function readCubeFile(file: File): Promise<boolean> {
  try {
    return isReadableCubeLut(await file.text());
  } catch {
    return false;
  }
}

/** "0,8 MB" / "0.8 MB", "12 KB": the size shown under a loaded LUT. */
const SIZE_NUMBER_FORMATS: Record<StudioLocale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }),
  ro: new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }),
  es: new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }),
};

export function formatFileSize(bytes: number, locale: StudioLocale): string {
  const format = SIZE_NUMBER_FORMATS[locale].format;
  if (bytes >= 100 * 1024) return `${format(bytes / (1024 * 1024))} MB`;
  return `${format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Sizes (bytes) of the project's LUT files, read from the preview server's Content-Length. */
export function useLutFileSizes(paths: readonly string[]): Record<string, number> {
  const files = useFileManagerContextOptional();
  const projectId = files?.projectIdRef.current ?? null;
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const key = paths.join("\n");
  useEffect(() => {
    if (!projectId || !key) return;
    const controller = new AbortController();
    for (const path of key.split("\n")) {
      const url = buildProjectApiPath(
        projectId,
        `/preview/${path.split("/").map(encodeURIComponent).join("/")}`,
      );
      fetch(url, { method: "HEAD", signal: controller.signal })
        .then((response) => {
          const length = Number(response.headers.get("content-length"));
          if (!response.ok || !Number.isFinite(length) || length <= 0) return;
          setSizes((current) =>
            current[path] === length ? current : { ...current, [path]: length },
          );
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [key, projectId]);
  return sizes;
}
