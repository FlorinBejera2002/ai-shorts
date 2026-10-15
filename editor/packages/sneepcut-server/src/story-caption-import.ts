type RecordValue = Record<string, unknown>;
type CaptionWord = { text: string; start: number; end: number };
type CaptionPhrase = { id: string; source: string; words: CaptionWord[] };
export type StoryCaptionMarkup = {
  html: string;
  css: string;
  animation?: string;
  font?: { id: string; weight: number; path: string };
};

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown): RecordValue {
  return isRecord(value) ? value : {};
}
function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
function color(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}
function readWord(value: unknown): CaptionWord | null {
  const word = record(value);
  if (
    typeof word.text !== "string" ||
    !word.text.trim() ||
    typeof word.start !== "number" ||
    !Number.isFinite(word.start) ||
    word.start < 0 ||
    typeof word.end !== "number" ||
    !Number.isFinite(word.end) ||
    word.end <= word.start
  )
    return null;
  return { text: word.text.trim(), start: word.start, end: word.end };
}

function captionPhrases(assets: unknown): CaptionPhrase[] {
  return (Array.isArray(assets) ? assets : []).flatMap((raw) => {
    const asset = record(raw);
    return (Array.isArray(asset.candidates) ? asset.candidates : []).map((rawCandidate) => {
      const candidate = record(rawCandidate);
      return {
        id: String(candidate.id),
        source: String(asset.id),
        words: (Array.isArray(candidate.words) ? candidate.words : [])
          .map(readWord)
          .filter((word): word is CaptionWord => word !== null),
      };
    });
  });
}

function selectedWord(
  entry: RecordValue,
  word: CaptionWord,
  phrases: CaptionPhrase[],
  selected: Set<string>,
): boolean {
  if (!phrases.length) return selected.has(String(entry.candidate_id));
  const audio = record(entry.audio);
  const shift = number(audio.in, 0, 0, 86400) - number(entry.output_in, 0, 0, 86400);
  let closest = "",
    distance = Infinity;
  for (const phrase of phrases) {
    if (phrase.source !== audio.source_id) continue;
    for (const original of phrase.words) {
      if (original.text !== word.text) continue;
      const delta =
        Math.abs(original.start - word.start - shift) + Math.abs(original.end - word.end - shift);
      if (delta <= 1 && phrase.id === entry.candidate_id) return selected.has(phrase.id);
      if (delta <= 1 && delta < distance) {
        closest = phrase.id;
        distance = delta;
      }
    }
  }
  return selected.has(closest);
}

// Only source-backed output-clock words become editable captions. The original
// transcript is data, never markup, and selective mode must retain its evidence.
export function storyCaptionMarkup(
  value: unknown,
  dimensions: { width: number; height: number },
  sourceAssets: unknown = [],
): StoryCaptionMarkup {
  const version = record(value);
  const options = record(version.render_options);
  const output = record(version.output);
  const mode =
    options.caption_mode ??
    output.caption_mode ??
    (options.captions === true || output.captions === true ? "all" : "off");
  if (mode === "off" || output.captions === false) return { html: "", css: "" };
  const selected = new Set(
    Array.isArray(output.captioned_candidate_ids)
      ? output.captioned_candidate_ids.filter((id): id is string => typeof id === "string")
      : [],
  );
  const groups: CaptionWord[][] = [];
  const phrases = mode === "selective" ? captionPhrases(sourceAssets) : [];
  const seen = new Set<string>();
  let group: CaptionWord[] = [];
  const flush = () => {
    if (group.length) groups.push(group);
    group = [];
  };
  for (const raw of Array.isArray(version.timeline) ? version.timeline : []) {
    const entry = record(raw);
    if (!entry.audio) {
      flush();
      continue;
    }
    for (const rawWord of Array.isArray(entry.words) ? entry.words : []) {
      const word = readWord(rawWord);
      if (!word) continue;
      if (mode === "selective" && !selectedWord(entry, word, phrases, selected)) {
        flush();
        continue;
      }
      const key = `${word.start}:${word.end}:${word.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const previous = group.at(-1);
      if (
        previous &&
        (word.start - previous.end > 0.5 ||
          word.start < previous.start ||
          word.end - group[0]!.start > 4.5 ||
          [...group.map((part) => part.text), word.text].join(" ").length > 76)
      )
        flush();
      group.push(word);
    }
  }
  flush();
  if (!groups.length) return { html: "", css: "" };
  const style = record(options.caption_style);
  const position = record(style.position);
  const preset = typeof style.preset === "string" ? style.preset : "classic";
  const shortEdge = Math.min(dimensions.width, dimensions.height);
  const size =
    shortEdge *
    number(style.size, 0.05, 0.02, 0.16) *
    (preset === "headline" ? 1.45 : preset === "stacked" ? 1.08 : 1);
  const weight = number(style.weight, 700, 100, 900);
  const fontId =
    typeof style.font_id === "string" &&
    /^(builtin:[a-z0-9-]+|[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i.test(
      style.font_id,
    )
      ? style.font_id
      : "builtin:inter";
  const textColor = color(style.text_color ?? options.subtitle_color, "#FFFFFF");
  const outlineColor = color(style.outline_color, "#000000");
  const outline =
    preset === "minimal"
      ? 0
      : Math.max(
          (number(style.outline, 2, 0, 8) * shortEdge) / 720,
          preset === "bold-outline" ? size * 0.075 : 0,
        );
  const shadow = preset === "minimal" ? 0 : (number(style.shadow, 0, 0, 8) * shortEdge) / 720;
  const opacity = Math.max(
    number(style.background_opacity, 0, 0, 1),
    preset === "contrast-box" ? 0.82 : 0,
  );
  const background =
    color(style.background_color, "#000000") +
    Math.round(opacity * 255)
      .toString(16)
      .padStart(2, "0");
  const highlight = color(style.highlight_color, "#FFE066");
  const align = ["left", "center", "right"].includes(String(style.align)) ? style.align : "center";
  const path = "assets/caption-font.ttf";
  const css = `@font-face{font-family:SneepCaption;src:url("${path}");font-weight:${weight};font-display:block}
.story-caption.clip{position:absolute;inset:auto;left:${number(position.x, 0.5, 0.05, 0.95) * 100}%;top:${number(position.y, options.subtitle_position === "top" ? 0.16 : options.subtitle_position === "center" ? 0.5 : 0.84, 0.05, 0.95) * 100}%;transform:translate(-50%,-50%);width:max-content;max-width:${number(style.max_width, 0.88, 0.2, 0.96) * 100}%;height:auto;z-index:3;text-align:${align};font-family:SneepCaption;font-weight:${weight};font-size:${size}px;line-height:${number(style.line_spacing, 1.15, 1, 1.8)};letter-spacing:${number(style.letter_spacing, 0, -0.05, 0.3)}em;word-spacing:${number(style.word_spacing, 0, 0, 1)}em;color:${textColor};-webkit-text-stroke:${outline}px ${outlineColor};paint-order:stroke fill;text-shadow:${shadow}px ${shadow}px ${shadow}px ${outlineColor};overflow-wrap:anywhere}
.story-caption-text{background:${background};padding:0 .14em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.story-caption-active{${preset === "active-background" ? `background:${highlight}` : `color:${highlight}`}}
.story-caption-karaoke{color:transparent;-webkit-text-stroke:0;text-shadow:none;background-image:linear-gradient(${highlight},${highlight}),linear-gradient(${textColor},${textColor});background-size:0% 100%,100% 100%;background-repeat:no-repeat;background-clip:text;-webkit-background-clip:text}`;
  const cues = groups.flatMap((words) => {
    if (preset === "word-by-word")
      return words.map((word) => ({ words: [word], start: word.start, end: word.end, active: -1 }));
    if (["active-color", "active-background"].includes(preset)) {
      const cues: { words: CaptionWord[]; start: number; end: number; active: number }[] = [];
      for (const [index, word] of words.entries()) {
        const previous = words[index - 1];
        if (previous && previous.end < word.start)
          cues.push({ words, start: previous.end, end: word.start, active: -1 });
        cues.push({
          words,
          start: word.start,
          end: Math.min(word.end, words[index + 1]?.start ?? word.end),
          active: index,
        });
      }
      return cues;
    }
    return [
      {
        words,
        start: words[0]!.start,
        end: Math.max(...words.map((word) => word.end)),
        active: -1,
      },
    ];
  });
  const animations: string[] = [];
  const html = cues
    .filter((cue) => cue.end > cue.start)
    .map((cue, index) => {
      const id = `story-caption-${index + 1}`;
      if (preset === "phrase-pop")
        animations.push(
          `window.__timelines["main"].fromTo("#${id} .story-caption-text",{scale:.88},{scale:1,duration:.12,ease:"none"},${cue.start});`,
        );
      if (preset === "subtle-fade") {
        const duration = Math.min(0.14, (cue.end - cue.start) / 2);
        animations.push(
          `window.__timelines["main"].fromTo("#${id} .story-caption-text",{opacity:0},{opacity:1,duration:${duration},ease:"none"},${cue.start}).to("#${id} .story-caption-text",{opacity:0,duration:${duration},ease:"none"},${cue.end - duration});`,
        );
      }
      const text = cue.words
        .map((word, wordIndex) => {
          const wordId = `${id}-word-${wordIndex + 1}`;
          if (preset === "karaoke")
            animations.push(
              `window.__timelines["main"].fromTo("#${wordId}",{backgroundSize:"0% 100%,100% 100%"},{backgroundSize:"100% 100%,100% 100%",duration:${word.end - word.start},ease:"none"},${word.start});`,
            );
          const className =
            preset === "karaoke"
              ? "story-caption-karaoke"
              : wordIndex === cue.active
                ? "story-caption-active"
                : "";
          return `<span id="${wordId}"${className ? ` class="${className}"` : ""}>${escape(word.text)}</span>`;
        })
        .join(" ");
      return `<div id="${id}" class="clip story-caption" data-start="${cue.start}" data-duration="${cue.end - cue.start}" data-track-index="2"><span class="story-caption-text">${text}</span></div>`;
    })
    .join("");
  return { html, css, animation: animations.join(""), font: { id: fontId, weight, path } };
}
