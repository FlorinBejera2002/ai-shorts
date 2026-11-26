// Typed Studio dictionaries. Each area file exports an en and a ro object with the same keys
// (enforced by dictionary.test.ts). Add a new key to the area file that owns the feature,
// in both languages, then merge that area into the objects below.
import { agentEn, agentRo } from "./messages/agent";
import { commonEn, commonRo } from "./messages/common";
import { emptyEn, emptyRo } from "./messages/empty";
import { advancedEn, advancedRo } from "./messages/advanced";
import { mediaEn, mediaRo } from "./messages/media";
import { outputEn, outputRo } from "./messages/output";
import { inspectorEn, inspectorRo } from "./messages/inspector";
import { previewEn, previewRo } from "./messages/preview";
import { shellEn, shellRo } from "./messages/shell";
import { timelineEn, timelineRo } from "./messages/timeline";
import { lookEn, lookRo } from "./messages/look";
import { lookAudioEn, lookAudioRo } from "./messages/lookAudio";

export const messagesEn = {
  ...commonEn,
  ...shellEn,
  ...agentEn,
  ...emptyEn,
  ...mediaEn,
  ...advancedEn,
  ...inspectorEn,
  ...outputEn,
  ...previewEn,
  ...timelineEn,
  ...lookEn,
  ...lookAudioEn,
} as const;

export type MessageKey = keyof typeof messagesEn;

export const messagesRo: Record<MessageKey, string> = {
  ...commonRo,
  ...shellRo,
  ...agentRo,
  ...emptyRo,
  ...mediaRo,
  ...advancedRo,
  ...outputRo,
  ...inspectorRo,
  ...previewRo,
  ...timelineRo,
  ...lookRo,
  ...lookAudioRo,
};

export type StudioLocale = "en" | "ro";

export const messages: Record<StudioLocale, Record<MessageKey, string>> = {
  en: messagesEn,
  ro: messagesRo,
};
