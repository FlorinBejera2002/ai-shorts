import { parseHTML } from "linkedom";
import { HTTPException } from "hono/http-exception";
import {
  removeElementFromHtml,
  splitElementInHtml,
  type SourceMutationTarget,
} from "../../studio-server/src/helpers/sourceMutation";
import { fields, finite, text, type RecordValue } from "./agent-validation";

export function layerTarget(html: string, input: RecordValue): SourceMutationTarget {
  if ((input.element_id === undefined) === (input.hf_id === undefined))
    throw new HTTPException(422, { message: "Choose exactly one stable Studio layer" });
  const target =
    input.hf_id !== undefined
      ? { hfId: text(input.hf_id, 160) }
      : { id: text(input.element_id, 160) };
  const { document } = parseHTML(html);
  const matches = [...document.querySelectorAll("[id], [data-hf-id]")].filter((element) =>
    target.hfId ? element.getAttribute("data-hf-id") === target.hfId : element.id === target.id,
  );
  if (
    matches.length !== 1 ||
    ["SCRIPT", "STYLE", "LINK", "META", "HTML", "HEAD", "BODY"].includes(matches[0].tagName)
  )
    throw new HTTPException(422, { message: "Studio layer is missing, ambiguous or not editable" });
  return target;
}

export function changeLayer(
  html: string,
  name: string,
  input: RecordValue,
  requestID: string,
): string {
  const target = layerTarget(html, input);
  if (name === "studio.layer.remove") {
    fields(input, ["id", "expected_version", "element_id", "hf_id"]);
    const next = removeElementFromHtml(html, target);
    if (next === html)
      throw new HTTPException(409, { message: "Studio layer removal produced no change" });
    return next;
  }
  fields(input, ["id", "expected_version", "element_id", "hf_id", "split_time"]);
  const split = splitElementInHtml(
    html,
    target,
    finite(input.split_time, 0, 3600),
    `split-${requestID}`,
  );
  if (!split.matched)
    throw new HTTPException(422, {
      message: "Split time must fall inside the selected layer's authored timing",
    });
  return split.html;
}
