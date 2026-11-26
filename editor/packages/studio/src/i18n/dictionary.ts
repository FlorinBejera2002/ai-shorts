// Typed Studio dictionaries. Each area file exports an en, a ro and an es object with the same keys
// (enforced by dictionary.test.ts). Add a new key to the area file that owns the feature,
// in every language, then merge that area into the objects below.
import { agentEn, agentEs, agentRo } from "./messages/agent";
import { commonEn, commonEs, commonRo } from "./messages/common";
import { emptyEn, emptyEs, emptyRo } from "./messages/empty";
import { advancedEn, advancedEs, advancedRo } from "./messages/advanced";
import { mediaEn, mediaEs, mediaRo } from "./messages/media";
import { outputEn, outputEs, outputRo } from "./messages/output";
import { inspectorEn, inspectorEs, inspectorRo } from "./messages/inspector";
import { previewEn, previewEs, previewRo } from "./messages/preview";
import { shellEn, shellEs, shellRo } from "./messages/shell";
import { timelineEn, timelineEs, timelineRo } from "./messages/timeline";
import { lookEn, lookEs, lookRo } from "./messages/look";
import { lookAudioEn, lookAudioEs, lookAudioRo } from "./messages/lookAudio";

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

export const messagesEs: Record<MessageKey, string> = {
  ...commonEs,
  ...shellEs,
  ...agentEs,
  ...emptyEs,
  ...mediaEs,
  ...advancedEs,
  ...outputEs,
  ...inspectorEs,
  ...previewEs,
  ...timelineEs,
  ...lookEs,
  ...lookAudioEs,
};

export type StudioLocale = "en" | "ro" | "es";

export const messages: Record<StudioLocale, Record<MessageKey, string>> = {
  en: messagesEn,
  ro: messagesRo,
  es: messagesEs,
};
