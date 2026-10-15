import { expect, test } from "bun:test";
import { storyCaptionMarkup } from "./story-caption-import";

const dimensions = { width: 1080, height: 1920 };
function version(mode = "all", preset = "classic") {
  return {
    render_options: {
      caption_mode: mode,
      caption_style: {
        font_id: "builtin:inter",
        weight: 900,
        preset,
        letter_spacing: 0.12,
        word_spacing: 0.3,
        line_spacing: 1.5,
      },
    },
    output: { captions: mode !== "off", captioned_candidate_ids: ["speech"] },
    timeline: [
      {
        candidate_id: "speech",
        audio: { source_id: "source" },
        words: [
          { text: "Știință", start: 0.2, end: 0.6 },
          { text: "<script>", start: 0.9, end: 1.4 },
        ],
      },
      {
        candidate_id: "clear",
        audio: { source_id: "source" },
        words: [{ text: "Later", start: 2, end: 2.5 }],
      },
    ],
  };
}

test("imports editable timed captions with real font request and saved spacing", () => {
  const markup = storyCaptionMarkup(version(), dimensions);
  expect(markup.font).toEqual({
    id: "builtin:inter",
    weight: 900,
    path: "assets/caption-font.ttf",
  });
  expect(markup.html).toContain('class="clip story-caption"');
  expect(markup.html).toContain('data-start="0.2"');
  expect(markup.html).toContain("Știință");
  expect(markup.html).toContain("&lt;script&gt;");
  expect(markup.html).not.toContain("<script>");
  expect(markup.css).toContain("letter-spacing:0.12em;word-spacing:0.3em");
  expect(markup.css).toContain("font-weight:900");
});

test("off mode and selective evidence cannot introduce unrequested speech", () => {
  expect(storyCaptionMarkup(version("off"), dimensions)).toEqual({ html: "", css: "" });
  const selective = storyCaptionMarkup(version("selective"), dimensions);
  expect(selective.html).toContain("Știință");
  expect(selective.html).not.toContain("Later");
});

test("word cues retain original starts and karaoke fills use measured intervals", () => {
  const words = storyCaptionMarkup(version("all", "word-by-word"), dimensions);
  expect(words.html).toContain('data-start="0.9"');
  const karaoke = storyCaptionMarkup(version("all", "karaoke"), dimensions);
  expect(karaoke.html).toContain("story-caption-karaoke");
  expect(karaoke.animation).toContain('ease:"none"},0.9)');
  expect(karaoke.animation).toContain("backgroundSize");
});

test("invalid word timings are withheld and unsafe style values are rejected", () => {
  const fixture = version();
  fixture.timeline[0]!.words[0]!.end = 0;
  fixture.render_options.caption_style.font_id = "x);background:url(https://invalid.example)";
  const markup = storyCaptionMarkup(fixture, dimensions);
  expect(markup.html).not.toContain("Știință");
  expect(markup.css).not.toContain("invalid.example");
  expect(markup.font?.id).toBe("builtin:inter");
});

test("selective narration captions follow audio words across unrelated visual cuts", () => {
  const fixture = version("selective");
  fixture.timeline[0]!.candidate_id = "visual-cut";
  const assets = [
    {
      id: "source",
      candidates: [
        { id: "speech", words: fixture.timeline[0]!.words },
        { id: "clear", words: fixture.timeline[1]!.words },
      ],
    },
  ];
  const markup = storyCaptionMarkup(fixture, dimensions, assets);
  expect(markup.html).toContain("Știință");
  expect(markup.html).not.toContain("Later");
});
