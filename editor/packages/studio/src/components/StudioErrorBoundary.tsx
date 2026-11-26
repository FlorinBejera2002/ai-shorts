import { Component, type ErrorInfo, type ReactNode } from "react";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { t, useLocale } from "../i18n/translate";
import { CrashFeedbackPrompt } from "./feedback/CrashFeedbackPrompt";
import { clipsUrlFromReferrer } from "./studioBackTarget";
import { OutputButton } from "./output/OutputButton";
import { illustrationSrc } from "./ui/illustrations";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Crash screen (St-Crash): title, the crash illustration and two recovery actions over the
 * Studio scrim. With a known Clips page the actions are "Înapoi la Clipuri" and "Reîncarcă
 * Studio"; without one, "Încearcă din nou" takes the back action's place, so the screen never
 * shows three buttons.
 */
function StudioCrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  useLocale();
  const clipsUrl = clipsUrlFromReferrer(document.referrer, window.location.origin);
  return (
    <div className="fixed inset-0 overflow-y-auto bg-studio-bg font-sans text-studio-text">
      <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-[var(--st-ov)] p-4">
        <dialog
          open
          role="alertdialog"
          aria-label={t("states.crashTitle")}
          title={error.message}
          className="static m-0 flex w-[440px] max-w-full flex-col gap-5 rounded-[28px] border-0 bg-studio-surface p-6 text-studio-text shadow-[var(--st-sh),0_30px_80px_rgba(21,32,53,0.28),inset_0_0_0_1px_var(--st-bd)]"
        >
          <h2 className="text-center font-display text-xl font-semibold leading-7">
            {t("states.crashTitle")}
          </h2>
          <img
            src={illustrationSrc("studio-crash")}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="mx-auto h-[168px] w-[168px] object-contain"
          />
          <div className="flex flex-wrap justify-center gap-2">
            {clipsUrl ? (
              <OutputButton
                variant="ghost"
                height={44}
                padX={18}
                onClick={() => window.location.assign(clipsUrl)}
              >
                {t("states.backToClips")}
              </OutputButton>
            ) : (
              <OutputButton variant="ghost" height={44} padX={18} onClick={onRetry}>
                {t("states.crashRetry")}
              </OutputButton>
            )}
            {/* If the error recurs immediately, "Try again" loops; a full reload always recovers. */}
            <OutputButton
              variant="primary"
              height={44}
              padX={18}
              onClick={() => window.location.reload()}
            >
              {t("states.crashReload")}
            </OutputButton>
          </div>
        </dialog>
        {/* The crash report tells us what broke; only the user can tell us what they were doing.
            This is also the one screen where they have nothing else to get on with. */}
        <CrashFeedbackPrompt />
      </div>
    </div>
  );
}

export class StudioErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Studio] Uncaught error:", error, info.componentStack);
    trackStudioEvent("crash", {
      error_message: error.message,
      error_name: error.name,
      stack_trace: error.stack?.slice(0, 4000) ?? null,
      component_stack: info.componentStack?.slice(0, 2000) ?? null,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <StudioCrashScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />
    );
  }
}
