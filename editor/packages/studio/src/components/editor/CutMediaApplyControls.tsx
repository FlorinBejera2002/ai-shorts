import { ApplyCutSettingToAll } from "./CutSettingsScope";
import { useCutSettingsScope } from "./cutSettingsScopeContext";

/** Each button copies only the named setting, leaving every other cut value intact. */
export function CutMediaApplyControls() {
  const scope = useCutSettingsScope();
  if (!scope) return null;
  const element = scope.selection.element;
  const attributes = [
    ["Volume", "data-volume"],
    ["Rate", "data-playback-rate"],
    ["Media start", "data-media-start"],
    ["Loop", "loop"],
    ["Mute", "muted"],
    ["Audio track", "data-has-audio"],
  ];
  return (
    <div className="space-y-2 border-t border-panel-border pt-2">
      <p className="text-[11px] text-panel-text-3">
        Changes affect this cut. Copy a setting to every source cut:
      </p>
      {element.tagName.toLowerCase() === "video" && (
        <div className="space-y-1">
          <button
            type="button"
            disabled={scope.busy}
            className="min-h-8 rounded-md border border-panel-border px-2 text-left text-[11px] text-panel-text-2 hover:bg-panel-hover disabled:opacity-40"
            onClick={() => void scope.applyPresentationToAll().catch(() => {})}
          >
            Apply image styling and static layout to all cuts
          </button>
          <p className="text-[11px] text-panel-text-3">
            Copies saved image styling, position and size. Each cut keeps its animation keyframes,
            linked masks and LUT files.
          </p>
          {scope.error && (
            <p role="alert" className="text-xs text-red-300">
              {scope.error}
            </p>
          )}
        </div>
      )}
      {attributes.map(([label, name]) => (
        <div key={name} className="flex items-center justify-between gap-2 text-xs">
          <span>{label}</span>
          <ApplyCutSettingToAll
            label={label}
            settings={[
              { type: "attribute", name, value: element.getAttribute(name) },
              ...(name === "data-has-audio"
                ? [
                    {
                      type: "attribute" as const,
                      name: "muted",
                      value: element.getAttribute("muted"),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      ))}
      {element.tagName.toLowerCase() === "video" &&
        ["object-fit", "object-position"].map((name) => (
          <div key={name} className="flex items-center justify-between gap-2 text-xs">
            <span>{name === "object-fit" ? "Fit" : "Position"}</span>
            <ApplyCutSettingToAll
              label={name}
              settings={[
                { type: "style", name, value: element.style.getPropertyValue(name) || null },
              ]}
            />
          </div>
        ))}
    </div>
  );
}
