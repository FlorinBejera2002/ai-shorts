/**
 * "Bind selected element" card for the Variables panel — the promote-a-
 * property-to-variable gesture. Each action declares a variable whose default
 * is the element's current value, so binding to a NEW id never changes the
 * render. Binding to an EXISTING id instead wires the element to that
 * variable's current default (which came from another element) — the card
 * warns before committing, since that does change the render. The binding the
 * runtime resolves is written as a data-var-src / data-var-text attribute, or
 * a `<prop>: var(--id)` style.
 */

import { useMemo, useState } from "react";
import type { Composition } from "@hyperframes/sdk";
import type { DomEditSelection } from "../editor/domEditingTypes";
import { t, useLocale } from "../../i18n/translate";
import { OutputButton } from "../output/OutputButton";
import { OutputIcon } from "../output/OutputIcon";
import { VARIABLES_INPUT_CLASS } from "./VariablesValueControls";
import {
  type BindAction,
  bindActionLabel,
  buildBindActions,
  sanitizeId,
} from "./variablesBindActions";

export {
  type BindAction,
  applyBind,
  bindActionLabel,
  buildBindActions,
  rgbToHex,
} from "./variablesBindActions";

/**
 * "Leagă elementul selectat" (St-Output-VariablesBind): one row per bindable property, then the
 * variable ID with a warning when that ID already exists, and Anulează / Leagă.
 */
export function VariablesBindElement({
  selection,
  sdkSession,
  onBind,
}: {
  selection: DomEditSelection;
  sdkSession: Composition;
  onBind: (action: BindAction, id: string) => void;
}) {
  useLocale();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [idDraft, setIdDraft] = useState("");
  const actions = useMemo(() => buildBindActions(selection, sdkSession), [selection, sdkSession]);
  if (actions.length === 0) return null;
  const active = actions.find((a) => a.key === activeKey) ?? null;

  const trimmedId = sanitizeId(idDraft);
  const idIsEmpty = idDraft.trim().length === 0;
  // Binding to an id that already exists wires the element to THAT variable's existing
  // default (declared from a different element), so the render changes. Say so first.
  const existingDecl = active
    ? sdkSession.getVariableDeclarations().find((d) => d.id === trimmedId)
    : undefined;

  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-studio-surface p-4 shadow-[inset_0_0_0_1px_var(--st-bd)]">
      <b className="text-sm font-semibold leading-5">
        {t("vars.bindTitle", { label: selection.label })}
      </b>
      <div
        role="radiogroup"
        aria-label={t("vars.bindTitle", { label: selection.label })}
        className="flex flex-col gap-1.5"
      >
        {actions.map((action) => {
          const on = action.key === activeKey;
          return (
            <button
              key={action.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setActiveKey(action.key);
                setIdDraft(action.suggestedId);
              }}
              className={`flex h-[38px] items-center justify-between rounded-xl px-3 text-[13px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${
                on
                  ? "bg-[var(--st-sel)] font-semibold text-[var(--st-on-sel)]"
                  : "bg-studio-surface font-medium shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]"
              }`}
            >
              <span>{bindActionLabel(action)}</span>
              {on ? <OutputIcon name="check" size={14} strokeWidth={2.4} /> : null}
            </button>
          );
        })}
      </div>
      {active ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--st-t2)]">
              {t("vars.bindIdLabel")}
            </span>
            <input
              type="text"
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setActiveKey(null)}
              className={`${VARIABLES_INPUT_CLASS} font-mono`}
            />
          </label>
          {existingDecl ? (
            <span role="status" className="text-xs font-semibold text-[var(--st-warn)]">
              {t("vars.bindExists", { id: trimmedId })}
              {existingDecl.default !== undefined ? ` (${String(existingDecl.default)})` : ""}
            </span>
          ) : null}
          <div className="flex justify-end gap-2">
            <OutputButton variant="ghost" height={36} onClick={() => setActiveKey(null)}>
              {t("vars.cancel")}
            </OutputButton>
            <OutputButton
              variant={existingDecl ? "secondary" : "primary"}
              height={36}
              disabled={idIsEmpty}
              onClick={() => {
                setActiveKey(null);
                onBind(active, trimmedId);
              }}
            >
              {existingDecl ? t("vars.bindAnyway") : t("vars.bind")}
            </OutputButton>
          </div>
        </>
      ) : null}
    </section>
  );
}
