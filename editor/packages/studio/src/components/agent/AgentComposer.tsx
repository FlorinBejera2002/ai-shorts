// Message field of the Ana și Radu panel: text, dictation and the round send button
// (radius 16, 1px secondary-border ring). Ctrl/⌘+Enter or Enter sends; Shift+Enter breaks a line.
import { forwardRef, type FormEvent } from "react";
import { getStudioLocale, t } from "../../i18n/translate";
import { AgentIconButton } from "./AgentControls";
import { useDictation } from "./useDictation";

export interface AgentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  canSend: boolean;
  phone: boolean;
}

export const AgentComposer = forwardRef<HTMLTextAreaElement, AgentComposerProps>(
  function AgentComposer({ value, onChange, onSubmit, disabled, canSend, phone }, ref) {
    const dictation = useDictation(getStudioLocale(), (text) =>
      onChange(value.trim() ? `${value} ${text}` : text),
    );
    const size = phone ? 44 : 36;
    function submit(event: FormEvent) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
    return (
      <form
        onSubmit={submit}
        className={`flex flex-none flex-col gap-1.5 rounded-[16px] bg-[var(--st-sf)] shadow-[inset_0_0_0_1px_var(--st-sbd)] ${
          phone ? "p-3" : "p-2.5"
        }`}
      >
        <label htmlFor="agent-composer" className="sr-only">
          {t("agent.composerLabel")}
        </label>
        <textarea
          ref={ref}
          id="agent-composer"
          value={value}
          maxLength={4000}
          disabled={disabled}
          placeholder={t("agent.composerPlaceholder")}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          className={`block w-full resize-none border-0 bg-transparent px-0.5 text-sm leading-5 text-[var(--st-tx)] outline-none placeholder:text-[var(--st-t3)] ${
            phone ? "h-12" : "h-10"
          }`}
        />
        {dictation.failed ? (
          <p role="alert" className="m-0 text-xs text-[var(--st-danger)]">
            {t("agent.dictationError")}
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          {dictation.supported ? (
            <AgentIconButton
              icon="mic"
              size={size}
              label={dictation.listening ? t("agent.endDictation") : t("agent.dictate")}
              pressed={dictation.listening}
              aria-pressed={dictation.listening}
              disabled={disabled}
              onClick={dictation.toggle}
            />
          ) : (
            <span />
          )}
          <AgentIconButton
            icon="send"
            size={size}
            primary
            type="submit"
            label={t("agent.send")}
            disabled={!canSend}
          />
        </div>
      </form>
    );
  },
);
