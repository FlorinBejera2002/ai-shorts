import type { ReactNode } from "react";
import type { FlatGroupDescriptor } from "./propertyPanelFlatDescriptors";
import type { PropertyPanelFlatProps } from "./propertyPanelFlatProps";
import type { useColorGradingController } from "./useColorGradingController";
import {
  FlatColorGradingAccessory,
  FlatColorGradingSection,
} from "./propertyPanelFlatColorGradingSection";
import {
  activeColorGradingEffectCount,
  FlatEffectsAccessory,
  FlatEffectsSection,
} from "./propertyPanelFlatEffectsSection";
import {
  deriveMediaOverlayPlacement,
  FlatOverlaysSection,
} from "./propertyPanelFlatOverlaysSection";

type ColorGradingController = ReturnType<typeof useColorGradingController>;

export interface GradeGroupsInput {
  controller: ColorGradingController;
  element: PropertyPanelFlatProps["element"];
  assets: PropertyPanelFlatProps["assets"];
  onImportAssets: PropertyPanelFlatProps["onImportAssets"];
  applyScopeAvailable: boolean;
  onAddMediaOverlay: PropertyPanelFlatProps["onAddMediaOverlay"];
  timing: { start: number; duration: number };
}

/**
 * Builds the Grade, Effects and (when a media overlay handler exists) Overlays
 * groups. They share one color-grading controller, so they are built together.
 */
export function buildGradeGroups({
  controller,
  element,
  assets,
  onImportAssets,
  applyScopeAvailable,
  onAddMediaOverlay,
  timing,
}: GradeGroupsInput): FlatGroupDescriptor[] {
  const groups: FlatGroupDescriptor[] = [
    {
      id: "grade",
      title: "Grade",
      summary: `${controller.grading.preset ?? "neutral"} · ${Math.round(controller.grading.intensity * 100)}%`,
      content: (
        <FlatColorGradingSection
          grading={controller.grading}
          assets={assets}
          onImportAssets={onImportAssets}
          onCommitColorGrading={controller.commitColorGrading}
          onPreviewColorGrading={controller.previewColorGrading}
          applyScope={controller.applyScope}
          applyBusy={controller.applyBusy}
          onSetApplyScope={controller.setApplyScope}
          onApplyToScope={() => void controller.applyToScope()}
          onApplyScopeAvailable={applyScopeAvailable}
          mediaMetadata={controller.mediaMetadata}
          presetPreviews={controller.presetPreviews}
          onRequestPresetPreviews={controller.requestPresetPreviews}
          captureGradedFrame={controller.captureGradedFrame}
          actionsSlot={<FlatColorGradingAccessory state={controller} />}
        />
      ),
    },
    buildEffectsGroup(controller),
  ];
  const addOverlay = onAddMediaOverlay;
  if (addOverlay) {
    groups.push({
      id: "overlays",
      title: "Overlays",
      summary: "add layer",
      content: (
        <FlatOverlaysSection
          onAddOverlay={(blockName) =>
            addOverlay(blockName, deriveMediaOverlayPlacement(element, timing))
          }
        />
      ),
    });
  }
  return groups;
}

function buildEffectsGroup(controller: ColorGradingController): FlatGroupDescriptor {
  const activeEffects = activeColorGradingEffectCount(controller.grading);
  const effectsProps = {
    grading: controller.grading,
    onCommitColorGrading: controller.commitColorGrading,
  };
  const content: ReactNode = (
    <FlatEffectsSection
      {...effectsProps}
      previews={controller.effectPreviews}
      presetPreviews={controller.presetPreviews}
      onPreviewColorGrading={controller.previewColorGrading}
      onRequestEffectPreviews={controller.requestEffectPreviews}
      onRequestPresetPreviews={controller.requestPresetPreviews}
    />
  );
  return {
    id: "effects",
    title: "Effects",
    accessory: <FlatEffectsAccessory {...effectsProps} />,
    summary: activeEffects ? `${activeEffects} active` : "none",
    content,
  };
}
