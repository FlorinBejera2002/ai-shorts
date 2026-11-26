// "Cere ajutor" for the storyboard: opens Ana și Radu with the hand-off message in the composer
// and a storyboard context chip, instead of copying a prompt for an outside agent chat.
import { t, useLocale } from "../../i18n/translate";
import { openAgent } from "../agent/agentSession";
import { OutputButton, type OutputButtonVariant } from "../output/OutputButton";
import { illustrationSrc } from "../ui/illustrations";

export const APPLY_STORYBOARD_FEEDBACK_MESSAGE =
  "Read the storyboard feedback I saved in .hyperframes/frame-comments.json and revise the frames.";

export function AgentChatMessageButton({
  message,
  label,
  contextLabel,
  onCopied,
  variant = "primary",
  stretch = false,
  height = 40,
}: {
  message: string;
  label?: string;
  /** Context chip in the agent panel; defaults to "Storyboard". */
  contextLabel?: string;
  /** Called once the message reached the agent. */
  onCopied?: () => void;
  variant?: OutputButtonVariant;
  stretch?: boolean;
  height?: number;
}) {
  useLocale();
  return (
    <OutputButton
      variant={variant}
      height={height}
      className={stretch ? "w-full" : undefined}
      onClick={() => {
        openAgent({
          context: { prompt: message, kind: "frame", label: contextLabel ?? t("story.title") },
        });
        onCopied?.();
      }}
    >
      {variant === "primary" ? (
        <img
          src={illustrationSrc("agent-avatar-duo")}
          alt=""
          aria-hidden="true"
          className="h-5 w-5 flex-none rounded-full object-cover"
        />
      ) : null}
      {label ?? t("story.askHelp")}
    </OutputButton>
  );
}
