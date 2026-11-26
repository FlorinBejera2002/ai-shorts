import { useEffect, useState } from "react";
import { t, useLocale } from "../../i18n/translate";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { Plus, X } from "../../icons/SystemIcons";
import { isTextEditableSelection, type DomEditSelection } from "./domEditing";
import type { ImportedFontAsset } from "./fontAssets";
import { normalizeTextMetricValue } from "./propertyPanelHelpers";
import { ColorField } from "./propertyPanelColor";
import { FontFamilyField } from "./propertyPanelFont";
import { PromotableControl } from "./PromotableControl";
import { FlatRow } from "./propertyPanelFlatPrimitives";
import { resolveValueTier } from "./propertyPanelValueTier";
import {
  FlatField,
  FlatInlineField,
  TextAlignSegment,
  TextCaseSegment,
  TextColorSwatches,
  TextSizeSlider,
  TextStyleSegment,
  TextWeightSelect,
  weightLabel,
} from "./propertyPanelFlatTextControls";

const isPxSize = (value: string) => /^-?\d+(?:\.\d+)?px$/.test(value.trim());
import {
  detectAvailableWeights,
  formatTextFieldPreview,
  getTextFieldColor,
  getTextStyleValue,
  TextAreaField,
} from "./propertyPanelSections";

/* ------------------------------------------------------------------ */
/*  Flat text section (design_handoff_studio_inspector, #10a)          */
/* ------------------------------------------------------------------ */

function FlatTextFieldEditor({
  field,
  styles,
  fontAssets,
  onImportFonts,
  onSetText,
  onSetTextFieldStyle,
  onPreviewTextFieldStyle,
  autoFocus = false,
}: {
  field: DomEditSelection["textFields"][number];
  styles: Record<string, string>;
  fontAssets: ImportedFontAsset[];
  onImportFonts?: (files: FileList | File[]) => Promise<ImportedFontAsset[]>;
  onSetText: (value: string, fieldKey?: string) => void;
  onSetTextFieldStyle: (fieldKey: string, property: string, value: string) => void;
  onPreviewTextFieldStyle?: (fieldKey: string, property: string, value: string) => void;
  autoFocus?: boolean;
}) {
  const track = useTrackDesignInput();
  const weight = getTextStyleValue(field, styles, "font-weight", "400");
  const weightOptions = detectAvailableWeights(
    field.computedStyles["font-family"] || styles["font-family"] || "",
  );
  const align = getTextStyleValue(field, styles, "text-align", "start");
  const textTransform = getTextStyleValue(field, styles, "text-transform", "none");
  const fontStyle = getTextStyleValue(field, styles, "font-style", "normal");

  const size = field.computedStyles["font-size"] || styles["font-size"] || "16px";
  const color = getTextFieldColor(field, styles);
  const setStyle = (property: string, value: string) =>
    onSetTextFieldStyle(field.key, property, value);
  const metricRow = (
    property: "letter-spacing" | "word-spacing" | "line-height",
    label: string,
  ) => {
    const fallback = property === "line-height" ? "normal" : "0px";
    return (
      <FlatRow
        label={label}
        value={getTextStyleValue(field, styles, property, fallback)}
        tier={resolveValueTier(field.inlineStyles[property], fallback)}
        onCommit={(next) => setStyle(property, normalizeTextMetricValue(property, next))}
        onReset={() => setStyle(property, "")}
      />
    );
  };
  const hasMetrics = ["letter-spacing", "word-spacing", "line-height", "text-transform"].some(
    (property) => Boolean(field.inlineStyles[property]),
  );

  return (
    <div className="flex flex-col gap-4 pt-3">
      <PromotableControl channel={{ kind: "text" }} enabled={field.source === "self"}>
        {({ value, onCommit }) => (
          <TextAreaField
            flat
            label={t("text.content")}
            value={value ?? field.value}
            autoFocus={autoFocus}
            onCommit={onCommit ?? ((next) => onSetText(next, field.key))}
          />
        )}
      </PromotableControl>
      <PromotableControl
        channel={{ kind: "style", prop: "font-family" }}
        enabled={field.source === "self"}
      >
        {({ value, onCommit }) => (
          <FontFamilyField
            flat
            detail={weightLabel(weight).replace(/^\d+\s+/, "")}
            value={
              value ?? (field.computedStyles["font-family"] || styles["font-family"] || "inherit")
            }
            importedFonts={fontAssets}
            onImportFonts={onImportFonts}
            onCommit={onCommit ?? ((next) => setStyle("font-family", next))}
          />
        )}
      </PromotableControl>
      <TextStyleSegment
        weight={weight}
        fontStyle={fontStyle}
        onSetStyle={(property, value) => {
          track("segmented", "Text style");
          setStyle(property, value);
        }}
      />
      {isPxSize(size) ? (
        // St-Text: "Mărime" is a slider with its value on the right.
        <TextSizeSlider
          value={size}
          onPreview={(next) => onPreviewTextFieldStyle?.(field.key, "font-size", next)}
          onCommit={(next) => setStyle("font-size", next)}
        />
      ) : (
        <FlatRow
          label={t("text.size")}
          value={size}
          tier={resolveValueTier(field.inlineStyles["font-size"], styles["font-size"] || "16px")}
          liveCommit
          onPreview={(next) => onPreviewTextFieldStyle?.(field.key, "font-size", next)}
          onCommit={(next) => setStyle("font-size", next)}
        />
      )}
      <div className="flex flex-col gap-2">
        <FlatInlineField label={t("text.color")}>
          <TextColorSwatches value={color} onCommit={(next) => setStyle("color", next)} />
        </FlatInlineField>
        <PromotableControl
          channel={{ kind: "style", prop: "color" }}
          enabled={field.source === "self"}
        >
          {({ value, onCommit }) => (
            <ColorField
              flat
              label={t("text.customColor")}
              value={value ?? color}
              onPreview={(next) => onPreviewTextFieldStyle?.(field.key, "color", next)}
              onCommit={onCommit ?? ((next) => setStyle("color", next))}
            />
          )}
        </PromotableControl>
      </div>
      <FlatField label={t("text.align")}>
        <TextAlignSegment align={align} onChange={(next) => setStyle("text-align", next)} />
      </FlatField>
      {/* Not on St-Text (its font select names the weight); kept for the other weights. */}
      <TextWeightSelect
        weight={weight}
        options={weightOptions}
        onChange={(next) => setStyle("font-weight", next)}
      />
      <TextCaseSegment
        value={textTransform}
        onChange={(next) => setStyle("text-transform", next)}
      />
      <div className="flex flex-col">
        {metricRow("line-height", t("text.lineHeight"))}
        {metricRow("letter-spacing", t("text.letterSpacing"))}
        {metricRow("word-spacing", t("text.wordSpacing"))}
      </div>
      {hasMetrics && (
        <button
          type="button"
          onClick={() => {
            track("button", "Reset text metrics");
            for (const property of [
              "line-height",
              "letter-spacing",
              "word-spacing",
              "text-transform",
            ]) {
              if (field.inlineStyles[property]) setStyle(property, "");
            }
          }}
          className="mx-auto inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold text-studio-text hover:bg-[var(--st-sub)]"
        >
          {t("text.resetMetrics")}
        </button>
      )}
    </div>
  );
}

export function FlatTextSection({
  element,
  styles,
  fontAssets,
  onImportFonts,
  onSetText,
  onSetTextFieldStyle,
  onPreviewTextFieldStyle,
  onAddTextField,
  onRemoveTextField,
}: {
  element: DomEditSelection;
  styles: Record<string, string>;
  fontAssets: ImportedFontAsset[];
  onImportFonts?: (files: FileList | File[]) => Promise<ImportedFontAsset[]>;
  onSetText: (value: string, fieldKey?: string) => void;
  onSetTextFieldStyle: (fieldKey: string, property: string, value: string) => void;
  onPreviewTextFieldStyle?: (fieldKey: string, property: string, value: string) => void;
  onAddTextField: (afterFieldKey?: string) => string | Promise<string | null> | null;
  onRemoveTextField: (fieldKey: string) => void;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(
    element.textFields[0]?.key ?? null,
  );
  // Armed by the add handler so the newly added field mounts focused. State, not
  // a ref cleared during render: Strict Mode renders twice, so the first pass
  // would eat the marker and the second would mount the field unfocused. Nothing
  // clears it on read either — `autoFocus` is a mount-only DOM prop and the
  // editor is keyed on the field, so it can only fire once per added field.
  const [autoFocusFieldKey, setAutoFocusFieldKey] = useState<string | null>(null);

  useEffect(() => {
    const nextFields = element.textFields;
    setActiveFieldKey((current) => {
      if (current && nextFields.some((field) => field.key === current)) return current;
      return nextFields[0]?.key ?? null;
    });
  }, [element.id, element.selector, element.textFields]);

  if (!isTextEditableSelection(element)) return null;
  const textFields = element.textFields;
  const activeField = textFields.find((field) => field.key === activeFieldKey) ?? textFields[0];
  if (!activeField) return null;

  const autoFocusActiveField = autoFocusFieldKey === activeField.key;

  if (textFields.length > 1) {
    return (
      <div className="space-y-2.5">
        <FlatTextLayerList
          fields={textFields}
          activeFieldKey={activeField.key}
          styles={styles}
          onSelect={(fieldKey) => {
            setAutoFocusFieldKey(null);
            setActiveFieldKey(fieldKey);
          }}
          onAdd={() =>
            void Promise.resolve(onAddTextField(activeField.key)).then((nextKey) => {
              if (!nextKey) return;
              setAutoFocusFieldKey(nextKey);
              setActiveFieldKey(nextKey);
            })
          }
          onRemove={onRemoveTextField}
        />
        <FlatTextFieldEditor
          key={activeField.key}
          field={activeField}
          styles={styles}
          fontAssets={fontAssets}
          onImportFonts={onImportFonts}
          onSetText={onSetText}
          onSetTextFieldStyle={onSetTextFieldStyle}
          onPreviewTextFieldStyle={onPreviewTextFieldStyle}
          autoFocus={autoFocusActiveField}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <FlatTextFieldEditor
        field={activeField}
        styles={styles}
        fontAssets={fontAssets}
        onImportFonts={onImportFonts}
        onSetText={onSetText}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onPreviewTextFieldStyle={onPreviewTextFieldStyle}
      />
      <button
        type="button"
        onClick={() => {
          track("button", "Add text field");
          void Promise.resolve(onAddTextField(activeField.key)).then((nextKey) => {
            if (!nextKey) return;
            setAutoFocusFieldKey(nextKey);
            setActiveFieldKey(nextKey);
          });
        }}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
      >
        <Plus size={15} />
        {t("text.addField")}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Multi-field layer list (design_handoff_studio_inspector, #10a —     */
/*  no mock exists for this row; layout originated by this plan,        */
/*  following the "left-rule nested content" convention established     */
/*  by Text's own content block, Motion's effect cards, and Media's     */
/*  cutout block. Flag for design review.)                              */
/* ------------------------------------------------------------------ */

export function FlatTextLayerList({
  fields,
  activeFieldKey,
  styles,
  onSelect,
  onAdd,
  onRemove,
}: {
  fields: DomEditSelection["textFields"];
  activeFieldKey: string;
  styles: Record<string, string>;
  onSelect: (fieldKey: string) => void;
  onAdd: () => void;
  onRemove: (fieldKey: string) => void;
}) {
  useLocale();
  const track = useTrackDesignInput();
  return (
    <div className="mb-2 flex flex-col gap-2.5">
      <div className="text-[13px] font-semibold text-studio-text">{t("text.layers")}</div>
      <div className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const active = field.key === activeFieldKey;
          return (
            <div
              key={field.key}
              data-flat-text-layer-row="true"
              data-active={active}
              onClick={() => onSelect(field.key)}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md bg-studio-surface pr-2 pl-3.5 ${
                active
                  ? "shadow-[inset_0_0_0_2px_var(--st-tx)]"
                  : "shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
              }`}
            >
              <span
                className="h-3.5 w-3.5 flex-shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--st-bd)]"
                style={{ backgroundColor: getTextFieldColor(field, styles) }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-studio-text">
                {formatTextFieldPreview(field.value) || `Text ${index + 1}`}
              </span>
              <span className="flex-shrink-0 text-xs text-studio-muted">{field.tagName}</span>
              {fields.length > 1 && (
                <button
                  type="button"
                  data-flat-text-layer-remove="true"
                  aria-label={t("text.removeField")}
                  title={t("text.removeField")}
                  onClick={(e) => {
                    e.stopPropagation();
                    track("button", "Remove text field");
                    onRemove(field.key);
                  }}
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-sub)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        data-flat-text-layer-add="true"
        onClick={() => {
          track("button", "Add text field");
          onAdd();
        }}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
      >
        <Plus size={15} />
        {t("text.addField")}
      </button>
    </div>
  );
}
