# Studio: matrice de acoperire a funcționalităților

Document de referință pentru noul design al Studio (`editor/packages/studio`). Fiecare funcționalitate, control, meniu, dialog sau stare din codul actual are cel puțin o diagramă într-unul din cele două canvasuri Studio:

- [Sneep Cut – Studio](https://claude.ai/artifact/6mapHfV81LVjFV4HuTYE9y): editor, inspector de bază, panouri, agent și export, stări, conflict de fișier, previzualizare, proiect și panouri (`St-Shell-*`), cronologie (`St-Timeline-*`).
- [Sneep Cut – Studio · Inspector și export](https://claude.ai/artifact/QBAs3iPbaoKUYBhUq69snN): inspector complet (`St-Inspector-*`) și export și avansat (`St-Output-*`).

Agentul nu mai este un AI separat și nu mai are robot: este „Ana și Radu”, cu avatarul lor rotund plutind jos în dreapta și bula „Salut! Cu ce te ajutăm?”. Nimic nu este scos fără decizie explicită; excepțiile sunt notate în secțiunea finală.

Convenție: „St-X” înseamnă desktop 1440×900, „St-M-X” înseamnă telefon 390×844. Fiecare diagramă există în variantă luminoasă și în `_dark`. Fișierele sursă sunt indicate după componenta în care trăiește funcționalitatea (cale relativă la `editor/packages/studio/src`).

## Editor (shell)

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Format canvas 9:16, 16:9, 1:1, 4:5, 2:3, Original | `components/CanvasAspectSelect.tsx` | St-Shell-Canvas; St-M-Shell-PhoneMenu (grilă 3×2) |
| Format canvas salvat și eroare la schimbare | `components/CanvasAspectSelect.tsx` | St-Shell-CanvasSaved; St-Shell-CanvasError |
| Export în curs „Se randează…” | `components/EditorShell.tsx`, `components/renders/useRenderQueue.ts` | St-Shell-ExportBusy; St-M-Shell-ExportBusy |
| Reconectare Studio, „Reîncearcă conexiunea”, „Autentifică-te în același cont” | `components/EditorShell.tsx` | St-Shell-Reconnect; St-M-Shell-Reconnect |
| Erori client: sesiune expirată, autentificare necesară, clip invalid, proiect indisponibil, proiect invalid, cerere eșuată (500), conexiune eșuată (503), titlu 1–120 caractere | `components/EditorShell.tsx` | St-Shell-StudioErrors; St-M-Shell-StudioErrors |
| Căutare, filtre și import în sheetul de media pe telefon | `components/sidebar/AssetsTab.tsx`, `components/sidebar/AssetCard.tsx` | St-M-Shell-MediaFilters |
| Import în curs „Se importă…” | `components/sidebar/AssetsTab.tsx` | St-Shell-Importing; St-M-Shell-Importing |
| Instalare FFmpeg, „Alte opțiuni de instalare” | `components/renders/FfmpegRequiredNotice.tsx`, `components/renders/useFfmpegStatus.ts` | St-Shell-FFmpeg; St-M-Shell-FFmpeg |
| FFmpeg: „Se verifică…” și „Încă nu a fost găsit” | `components/renders/useFfmpegStatus.ts` | St-Shell-FFmpegChecking; St-M-Shell-FFmpegChecking; St-Shell-FFmpegMissing; St-M-Shell-FFmpegMissing |
| Bara de sus pe telefon: înapoi, titlu, stare salvare, anulare, refacere, Inspector, export | `components/EditorShell.tsx` | toate tablourile de telefon din `cov-shell` (covMobileShell) |
| Comutator Storyboard / Previzualizare pe telefon | `components/EditorShell.tsx` | segmentul din previzualizarea St-M-Shell-Storyboard (decizie: nu încape în bara de 56 px) |
| Ascundere buton Agent pe telefon (sub `sm`) | `components/EditorShell.tsx` | toate tablourile de telefon |
| Tooltip Anulează cu acțiune („Anulează Mută clipul (⌘Z)”) | `components/EditorShell.tsx` | St-Shell-UndoTip |
| Tooltip Refă cu acțiune („Refă Taie clipul (⌘⇧Z)”) | `components/EditorShell.tsx` | St-Shell-RedoTip |
| Tragere compoziție pe cronologie, zonă „Plasează pe cronologie” | `components/nle/usePreviewBlockDrop.ts`, `components/nle/TimelinePane.tsx` | St-Shell-CompsDrag |
| Tragere rând media audio, zonă „Plasează pe Muzică” | `components/nle/TimelinePane.tsx` | St-Shell-MediaRowsDrag |
| Lățimi minime și maxime: bara laterală (200 px, maxim 40%) și Inspector (280 px, maxim 40%) | `components/nle/TimelineResizeDivider.tsx`, `components/EditorShell.tsx` | St-Shell-Resize |
| Fereastră îngustă | `components/EditorShell.tsx` | St-Shell-Narrow |
| Grip de înălțime a cronologiei | `components/nle/TimelineResizeDivider.tsx` | St-Shell-TimelineResize |
| Starea de salvare „Salvat”, „Se salvează…”, „Salvare eșuată” | `components/SaveQueuePausedBanner.tsx`, `components/EditorShell.tsx` | St-SaveFailed; St-M-SaveFailed |

## Cronologie

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Tasta Esc: anulează tăierea, golește selecția, anulează glisarea, închide popoverul | `player/components/TimelineCanvas.tsx`, `components/nle/TimelinePane.tsx` | St-Timeline-ShortcutsEdit; St-M-Timeline-ShortcutsEdit |
| Cadru înapoi și înainte (K+J, K+L) | `player/components/TimelineCanvas.tsx` | St-Timeline-ShortcutsAdvanced |
| Resetare cadre cheie cu Backspace | `components/editor/KeyframeDiamond.tsx` | St-Timeline-ShortcutsAdvanced |
| Tooltip cadru cheie: adaugă la cursor, extinde animația | `components/editor/KeyframeDiamond.tsx` | St-Timeline-Tooltips (24 de tooltipuri) |
| Buton Scurtături și instrumente în bara desktop | `components/TimelineToolbar.tsx` | toate tablourile de cronologie desktop |
| Citire intrare/ieșire cu timp și butoane de golire (Zonă de lucru) | `components/TimelineToolbar.tsx`, `components/nle/TimelinePane.tsx` | St-Timeline-ShortcutsEdit |
| Lane goale și tragere deasupra | `components/nle/TimelinePane.tsx` | St-Timeline-EmptyDrop; St-Timeline-EmptyDrag; St-M-Timeline-EmptyDrop; St-M-Timeline-Drop |
| Mesaj de editare blocată | `hooks/useTimelineEditing.ts` | St-Timeline-Blocked; St-M-Timeline-Blocked |
| Valoare automată pe punct și lista completă de gesturi | `components/editor/propertyPanelAutomation.ts`, `components/editor/useVolumeAutomation.ts` | St-Timeline-AutoValue |
| Toate cele 22 de efecte FX (3 coloane) | `components/editor/propertyPanelFxPresetMenu.tsx`, `components/editor/propertyPanelFxFamily.ts` | St-Timeline-Effects; St-M-Timeline-Effects |
| Familii FX: Voce, Remediere (rumble-cut, room-gate, boom-tame, harsh-tame), Personaj (inclusiv Telefon, Interfon, Bandă, Tannoy), Spațiu | `components/editor/propertyPanelFxFamily.ts` | St-Timeline-Effects |
| Număr de noduri per efect și linii de problemă (PRESET_PROBLEM, traduse) | `components/editor/propertyPanelFxPresetStyle.ts`, `components/editor/propertyPanelFxPresetRun.tsx` | St-Timeline-Effects |
| Popover FX pe pista de muzică (Remediere, Personaj, Spațiu) | `components/editor/TimelineFxPopover.tsx` | St-Timeline-EffectsMusic |
| Ochi și mut în antetul audio, ochi pe pista ascunsă | `player/components/TimelineCanvas.tsx` | St-Timeline-Groups; St-M-Timeline-Groups |
| Video: ochi pe antetul pistei | `player/components/TimelineCanvas.tsx` | St-Timeline-Groups |
| Iconă Razor (foarfece) | `components/TimelineToolbar.tsx` | toate tablourile de cronologie |
| Eliminare buton coș din bare, „Închide golul”, pastile de riglă | `components/TimelineToolbar.tsx`, `components/editor/CanvasContextMenu.tsx` | St-Timeline-ClipMenu; St-Timeline-Ruler |
| Comutator „Cadre” în rândul de transport | `components/nle/PreviewPane.tsx`, `components/TimelineToolbar.tsx` | St-Timeline-Ruler; St-M-Timeline-Ruler |
| Divizor de înălțime fără text min/max | `components/nle/TimelineResizeDivider.tsx` | St-Timeline-Resize; St-M-Timeline-Resize |
| Antet de grup „Deschide efectele” pe vocea de voiceover | `player/components/TimelineCanvas.tsx` | St-Timeline-Groups |
| Stări prompt de interval: „Copiază promptul”, „Promptul a fost copiat”, eroare inline | `components/sidebar/PromptPreviewModal.tsx` | St-Timeline-RangeStates; St-Timeline-Range |
| Cronologie pe telefon: subtitrări, pista de efecte, tragere, selecție multiplă, încărcare, meniu clip | `components/nle/TimelinePane.tsx` | St-M-Timeline-Captions; St-M-Timeline-TrackHeads; St-M-Timeline-Drop; St-M-Timeline-Marquee; St-M-Timeline-Loading; St-M-Timeline-ClipMenu |
| Clip meniu contextual: Împarte, Duplică, Șterge | `components/editor/CanvasContextMenu.tsx`, `components/nle/TimelinePane.tsx` | St-ClipMenu; St-M-Timeline-ClipMenu |

## Previzualizare

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Zoom: HUD în centrul scenei, buton de resetare în colțul dreapta-jos | `components/nle/previewZoom.ts`, `components/nle/PreviewPane.tsx` | St-Preview-Zoom; St-M-Preview-Zoom |
| Stare zoom „Potrivit” | `components/nle/previewZoom.ts` | St-Preview-ZoomFit; St-M-Preview-ZoomFit |
| Previzualizare pe tot ecranul | `components/nle/PreviewPane.tsx` | St-Preview-Fullscreen; St-M-Preview-Fullscreen |
| Meniu viteză de redare și buclă (telefon: foaia „Redare”) | `components/nle/PreviewPane.tsx` | St-Preview-Speed; St-M-Preview-Speed |
| Popover volum și glisor | `components/nle/PreviewPane.tsx` | St-Preview-Volume; St-M-Preview-Volume |
| Previzualizare mută | `components/nle/PreviewPane.tsx` | St-Preview-Muted; St-M-Preview-Muted |
| Scurtături: Redare, Zonă de lucru, Taburi (desktop) | `components/nle/PreviewPane.tsx` | St-Preview-Shortcuts; St-M-Preview-Shortcuts |
| Scurtături: Editare, Gesturi, Mișcare și decupare (desktop) | `components/nle/PreviewPane.tsx` | St-Preview-ShortcutsEdit; St-M-Preview-ShortcutsEdit |
| Scurtături: Cadre cheie și mișcare (telefon) | `components/nle/PreviewPane.tsx` | St-M-Preview-ShortcutsMotion |
| Taburi ⌘1 / ⌘2 | `components/nle/PreviewPane.tsx` | St-Preview-Shortcuts (doar desktop, decizie) |
| Instrumente: salt la cadru, intrare și ieșire din zona de lucru | `components/nle/PreviewOverlays.tsx` | St-Preview-Tools; St-M-Preview-Tools |
| Eroare de sincronizare a subtitrărilor | `captions/hooks/useCaptionSync.ts` | St-Preview-CaptionSync; St-M-Preview-CaptionSync |
| Revenire în editorul de subtitrări | `captions/components/CaptionOverlay.tsx` | St-Preview-CaptionReenter; St-M-Preview-CaptionReenter |
| Suprapunere la încărcarea compoziției | `components/nle/PreviewPane.tsx` | St-Preview-Loading; St-M-Preview-Loading |
| Suprapunere la pregătirea resurselor | `components/nle/AssetPreviewOverlay.tsx` | St-Preview-AssetPrep; St-M-Preview-AssetPrep |
| Dialog previzualizare resursă | `components/nle/AssetPreviewOverlay.tsx` | St-Preview-AssetOverlay; St-M-Preview-AssetOverlay |
| Bara de snap: magnet, grilă, mișcare, înregistrare, popover de opțiuni grilă | `components/editor/SnapToolbar.tsx`, `components/editor/GridOverlay.tsx` | St-Preview-SnapBar; St-M-Preview-Grid |
| Buton „Opțiuni grilă” și „Grilă vizibilă (G)” | `components/editor/SnapToolbar.tsx` | St-Preview-SnapBar |
| Foaia „Opțiuni grilă”: Distanța grilei (10–500), Magnetizează la grilă | `components/editor/GridOverlay.tsx`, `components/editor/snapEngine.ts` | St-M-Preview-Grid |
| Ghiduri de snap | `components/editor/SnapGuideOverlay.tsx` | St-Preview-SnapGuides; St-M-Preview-SnapGuides |
| Selecție multiplă prin marcaj | `components/editor/MarqueeOverlay.tsx` | St-Preview-Marquee; St-M-Preview-Marquee |
| Cipuri pentru elemente în afara cadrului | `components/editor/OffCanvasIndicators.tsx` | St-Preview-OffCanvas; St-M-Preview-OffCanvas |
| Mâner de rotație | `components/editor/DomEditRotateHandle.tsx` | St-Preview-Rotate; St-M-Preview-Rotate |
| Redimensionare cu Shift și tragere (listată în scurtături) | `components/editor/domEditResizeLocal.ts`, `components/editor/DomEditSelectionChrome.tsx` | St-Preview-Resize; St-M-Preview-Resize |
| Mod decupare (eticheta „Gata” nu are sursă, de confirmat) | `components/editor/DomEditCropHandles.tsx` | St-Preview-Crop; St-M-Preview-Crop |
| Traseu de mișcare | `components/editor/MotionPathOverlay.tsx`, `components/editor/MotionPathNode.tsx` | St-Preview-MotionPath; St-M-Preview-MotionPath |
| Destinație de mișcare armată | `components/editor/motionPathCommit.ts` | St-Preview-MotionArmed; St-M-Preview-MotionArmed |
| Înregistrare gesturi („Oprește înregistrarea · 2,4 s”) | `components/editor/GestureRecordControl.tsx`, `components/editor/GestureTrailOverlay.tsx` | St-Preview-Gesture; St-M-Preview-Gesture |
| Breadcrumb compoziție și înapoi | `components/nle/CompositionBreadcrumb.tsx` | St-Preview-Breadcrumb; St-M-Preview-Breadcrumb |
| Meniu contextual pe canvas: ordine și ștergere | `components/editor/CanvasContextMenu.tsx`, `components/editor/canvasContextMenuZOrder.ts` | St-Preview-ContextMenu; St-M-Preview-ContextMenu |
| Bară de text inline | `components/editor/InlineTextToolbar.tsx` | St-Preview-TextToolbar; St-M-Preview-TextToolbar |
| Lentilă de structură (eticheta nu are sursă, de confirmat) | `components/editor/TopologyLens.tsx` | St-Preview-Topology; St-M-Preview-Topology |
| Vizualizare video original (telefon) | `components/nle/PreviewPane.tsx` | St-M-Preview-Original |
| Previzualizare eșuată cu reîncercare (telefon) | `components/nle/PreviewPane.tsx` | St-M-Preview-Error; St-PreviewError |
| Overlay de plasare „la cursor” (telefon) | `components/nle/usePreviewBlockDrop.ts` | St-M-Preview-Drop |
| Mai multe instrumente pe telefon: Comenzi rapide, Instrumente, Decupare, Grilă și magnet | `components/nle/PreviewPane.tsx` | St-M-Preview-MobileMore |

## Inspector

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Ascultă efectul sonor la tăiere (pe rând și în aplicare) | `components/editor/CutSoundEffect.tsx` | St-Inspector-SoundPick; St-M-Inspector-SoundPick; St-Inspector-SoundStates; St-Inspector-CutApply |
| Efect sonor la tăiere în panoul Sunet (fără Ascultă încă, de completat în `parts/inspector.part.js`) | `components/editor/CutSoundEffect.tsx` | St-Sound |
| Presete de caracter: Casetă (Tape), Worble ciudat (Doofus Worble), 9 presete în grilă de 2 coloane | `components/editor/propertyPanelFxPresetMenu.tsx` | St-Inspector-AudioPresets2 |
| Meniu Adaugă efect audio: Volum, Înfundat, Bas, Strălucire, Taie golurile, Lo-Fi, Mai sus sau mai jos, Îngroșare, Vârtej, Reduce noroiul, Reduce cutia, Adaugă claritate, Înmoaie asprimea, Domolește bubuitul | `components/editor/propertyPanelFxAddMenu.tsx` | St-Inspector-AudioAdd |
| „Bypass” tradus în Ocolește / Ocolit | `components/editor/propertyPanelFxNodeRow.tsx` | St-Inspector-AudioRack; St-M-Inspector-AudioRack; St-Inspector-AudioAdd |
| Umplere media (Umple, Încadrează, Întinde) și volum | `components/editor/propertyPanelMediaSection.tsx`, `components/editor/propertyPanelFlatMediaSection.tsx` | St-Inspector-Media; St-M-Inspector-MediaPhone |
| Curbe: canal Nuanță și Saturație, Principal | `components/editor/propertyPanelColorCurves.tsx` | St-Inspector-Curves; St-M-Inspector-CurvesPhone |
| Buton de reîmprospătare la scopuri, în antetul cardului | `components/editor/propertyPanelColorScopes.tsx` | St-Inspector-Scopes |
| Randări: deschide fișierul terminat (Deschide) | `components/renders/RenderQueueItem.tsx` | St-Inspector-RendersQueue; St-M-Inspector-RendersQueue |
| Randări: Șterge fișierul, cu confirmare și ilustrația de ștergere | `components/renders/RenderQueueItem.tsx` | St-Inspector-RenderDelete |
| Index de elemente: Mișcare și Timp | `components/editor/PropertyPanelFlat.tsx`, `components/editor/propertyPanelFlatMotionSection.tsx` | St-Inspector-Element; St-M-Inspector-Element |
| Mișcare, cadre cheie, traseu și aspect (intrările din index) | `components/editor/AnimationCard.tsx`, `components/editor/KeyframeNavigation.tsx`, `components/editor/ArcPathControls.tsx` | St-Inspector-AnimCard; St-Inspector-Keyframes; St-Inspector-MotionPath; St-Inspector-Layout |
| Panou telefon: MediaPhone, GradeActionsPhone, SoundPick, SubAnimPhone (animația subtitrărilor), LayersDrillPhone, CapInPhone (animația subtitrărilor de intrare), RendersSettingsPhone, CurvesPhone, FramingPhone | `components/editor/propertyPanelFlat*.tsx`, `components/renders/RenderQueuePanel.tsx` | St-M-Inspector-MediaPhone; St-M-Inspector-GradeActionsPhone; St-M-Inspector-SoundPick; St-M-Inspector-SubAnimPhone; St-M-Inspector-LayersDrillPhone; St-M-Inspector-CapInPhone; St-M-Inspector-RendersSettingsPhone; St-M-Inspector-CurvesPhone; St-M-Inspector-FramingPhone |
| Fill și Stroke pe telefon | `components/editor/propertyPanelFill.tsx` | nedesenat (lipsă de board telefon, de completat) |
| Stare goală a listei de fonturi: „Nu s-au găsit fonturi.” | `components/editor/propertyPanelFont.tsx` | St-Inspector-FontEmpty; St-M-Inspector-FontEmpty |
| Navigare între cadrele cheie: „Cadrul cheie anterior” și „Cadrul cheie următor” (etichete aria, fără text vizibil) | `components/editor/KeyframeNavigation.tsx` | St-Inspector-Keyframes (fără text vizibil) |
| Traduceri: Off → Oprit (CapIn); Slideshow → Diapozitive; Master → Principal; Print → Tipar; nume de ease în română (Încetinire, Liniar, Expo încetinire, Quad lin etc.) | `components/editor/easePresetLibrary.ts`, `components/editor/propertyPanelFlatEffectsSection.tsx` | St-Inspector-CapIn; St-Inspector-Avansat; St-Inspector-Slideshow; St-Inspector-SlideshowEmpty; St-Inspector-Curves; St-Inspector-EffectsList; St-Inspector-EasePresets; St-Inspector-EaseParams; St-Inspector-AnimCard; St-Inspector-Keyframes; St-M-Inspector-CapInPhone |
| Gramatică: „grupurile” (în loc de „grupurilor”) | `components/editor/propertyPanelFlatEffectsSection.tsx` | St-Inspector-CapIn; St-Inspector-CapOut; St-M-Inspector-CapInPhone |
| Copy de ajutor eliminat: tooltip „Opacitate”, „Niciun grup selectat”, „Niciun cuvânt selectat”, „Fără parametri” | diverse, `components/editor/propertyPanelFlat*.tsx` | St-Inspector-Feedback; St-Inspector-CapEmpty; St-Inspector-CapEmptyAnim; St-Inspector-BlockParamsNone; St-Inspector-RendersSettings; St-Inspector-RendersSettingsDR |
| Paletă de culori, swatch #facc15 (păstrat ca date utilizator, decizie pentru lead) | `components/editor/propertyPanelColor.tsx` | St-Inspector-Palette |
| Calibrare vizuală a traseului de mișcare | `components/editor/MotionPathOverlay.tsx` | St-Inspector-MotionPath |

## Panouri (bara laterală)

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Lista de compoziții | `components/sidebar/CompositionsTab.tsx` | St-Output-Compositions |
| Compoziții, sub-compoziție și breadcrumb | `components/sidebar/CompositionsTab.tsx`, `components/nle/CompositionBreadcrumb.tsx` | St-Shell-Comps; St-Shell-CompsEmpty; St-Shell-CompsRender; St-Shell-Breadcrumb; St-Output-Compositions |
| Editor de cod și arbore de fișiere (încărcare, gol, meniu, ștergere, eroare, previzualizare) | `components/editor/SourceEditor.tsx`, `components/editor/FileTree.tsx`, `components/editor/FileTreeNodes.tsx` | St-Shell-Code; St-Shell-CodeLoading; St-Shell-CodeEmpty; St-Shell-CodeMenu; St-Shell-CodeDelete; St-Shell-CodeFileDelete; St-Shell-FileError; St-Shell-FilePreview |
| Blocuri: catalog, încărcare, eroare, fără rezultate, tragere, parametri (Avansat) și agent | `components/sidebar/BlocksTab.tsx`, `components/editor/BlockParamsPanel.tsx` | St-Shell-BlocksLoading; St-Shell-BlocksError; St-Shell-BlocksNoMatch; St-Shell-BlockDrag; St-Shell-BlockAgent; St-Inspector-BlockParams; St-Inspector-BlockParamsNone |
| Lint: rezultate, fără probleme, eșec | `components/LintModal.tsx` | St-Shell-Lint; St-Shell-LintClean; St-Shell-LintFail; St-M-Shell-Lint |
| Conflict de fișier extern: banner, revizuire a ambelor versiuni, recuperare a ciornei, confirmare de suprascriere | `components/ExternalFileConflictBanner.tsx` | St-Conflict-Banner; St-Conflict-Review; St-Conflict-Failed; St-Conflict-Overwrite; St-M-Conflict-Banner; St-M-Conflict-Review; St-M-Conflict-Failed; St-M-Conflict-Overwrite |
| Feedback (NPS) | `components/feedback/StudioFeedbackCard.tsx` | St-Output-Feedback; St-Output-FeedbackFailed |
| Raport de erori din consolă (modal) | `components/feedback/CrashFeedbackPrompt.tsx` | St-Output-ConsoleErrors; St-M-Output-ConsoleErrors; St-Output-FeedbackCrash; St-Output-FeedbackReport |

## Export și avansat

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Lista de randări: ora relativă, insigna de durată, nume de fișier, numele eșuate și blocate (motivul apare ca subtitlu) | `components/renders/RenderQueueItem.tsx`, `components/renders/RenderQueuePanel.tsx` | St-Output-Rows; St-M-Output-Rows |
| Ascunde terminate (antet listă telefon) | `components/renders/RenderQueuePanel.tsx` | St-M-Output-Rows |
| Rezoluție dezactivată cu motiv (1080p nu este o scară întreagă a 720×1280) | `components/renders/renderSettings.ts` | St-Output-Resolution |
| Format MOV, WebM și MP4: explicații; gamă dinamică HDR/SDR/Auto | `components/renders/RenderQueue.tsx`, `components/renders/renderSettings.ts` | St-Output-FormatInfo; St-Output-DynamicRange; St-M-Output-DynamicRange; St-Output-ExportMov |
| Tooltipuri de calitate: Ciornă, Standard, Calitate înaltă | `components/renders/renderSettings.ts` | St-Output-QualityDraft; St-Output-QualityStandard; St-Output-QualityHigh |
| FFmpeg copiat | `components/renders/FfmpegRequiredNotice.tsx` | St-Output-FFmpegCopied |
| Variabile fără compoziție deschisă | `components/panels/VariablesPanel.tsx` | St-Output-VariablesNoComposition; St-M-Output-VariablesNoComposition |
| Formular de declarare: meniu Tip, validare (implicit, listă, ID), câmp Opțiuni | `components/panels/VariablesDeclarationForm.tsx` | St-Output-VariablesTypeMenu; St-Output-VariablesValidationDefault; St-Output-VariablesValidationEnum; St-Output-VariablesValidationId; St-Output-VariablesDeclare |
| Variabile: control enum, editare inline (Etichetă, Renunță, Salvează), tooltip „Niciun script nu citește această variabilă”, toasturi de copiere | `components/panels/VariablesValueControls.tsx`, `components/panels/VariablesRowAction.tsx` | St-Output-VariablesEnum; St-Output-VariablesCopyJson; St-Output-VariablesCopyCommand |
| Diapozitive: fără scene, fără selecție, fără ramuri, canvas dezactivat, lista de hotspot-uri | `components/panels/SlideshowPanel.tsx`, `components/panels/SlideshowSubPanels.tsx` | St-Output-SlideshowNoScenes; St-Output-SlideshowNoSelection; St-Output-SlideshowNoBranches; St-Output-SlideshowHotspotDisabled; St-Output-SlideshowHotspotList |
| Redenumire inline în diapozitive (Enter, Esc) și puncte de oprire goale | `components/panels/SlideshowSubPanels.tsx` | St-Output-SlideshowRename; St-Output-SlideshowNoHoldPoints |
| Storyboard: cadru planificat, previzualizare indisponibilă, fără sursă, nu a fost găsit, în așteptare, feedback salvat, renunțare la modificări | `components/storyboard/StoryboardFrameFocus.tsx`, `components/storyboard/frameStatus.ts` | St-Output-StoryboardFramePlanned; St-Output-StoryboardFramePreviewUnavailable; St-Output-StoryboardFrameNoSource; St-Output-StoryboardFrameNotFound; St-Output-StoryboardFramePending; St-Output-StoryboardFrameSaved; St-Output-StoryboardFrameDiscard; St-Output-StoryboardDiscard_dark |
| Storyboard: etape de revizuire (așteaptă plan, construire, animație) | `components/storyboard/StoryboardReviewGuide.tsx` | St-Output-StoryboardReviewWaiting; St-Output-StoryboardReviewBuild; St-Output-StoryboardReviewAnimation |
| Feedback NPS: Închide și Trimite | `components/feedback/StudioFeedbackCard.tsx` | St-Output-Feedback; St-Output-FeedbackFailed_dark |
| Tooltip export în curs pe compozițiile sub-compoziție | `components/sidebar/CompositionsTab.tsx` | St-Output-Compositions |

## Agent de lucru (înlocuiește AI-ul separat)

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Ana și Radu (agentul aplicației): deschis cu cipul de context (interval, bloc, rezultate lint, cadru storyboard) | `components/assistant/StudioAssistant.tsx`, `components/AskAgentModal.tsx`, `components/editor/domEditingAgentPrompt.ts` | St-Agent; St-M-Agent |
| Selecție și aprobare de la agent | `components/assistant/assistantDraft.ts` | St-AgentSelection; St-AgentApproval; St-M-AgentApproval |
| Propunere de schimbare: Aplică, Renunță | `components/assistant/assistantDraft.ts` | St-AgentApproval |
| Întrebare pe element: „Ce vrei să schimbi?” | `components/AskAgentModal.tsx` | St-AgentSelection |

## Stări

| Funcționalitate (cod) | Fișier sursă | Diagramă(e) |
| --- | --- | --- |
| Deschidere Studio dintr-un clip | `App.tsx` | St-Opening |
| Încărcare compoziție | `components/nle/PreviewPane.tsx` | St-Loading; St-M-Loading |
| Previzualizare eșuată | `components/nle/PreviewPane.tsx` | St-PreviewError; St-M-Preview-Error |
| Salvare întreruptă | `components/SaveQueuePausedBanner.tsx` | St-SaveFailed; St-M-SaveFailed |
| Sesiune pierdută | `components/EditorShell.tsx` | St-Offline; St-M-Offline |
| Eroare fatală | `components/EditorShell.tsx` | St-Crash |
| Toast după aplicarea modificării AI | `components/assistant/StudioAssistant.tsx` | St-Toast |

## Schimbări față de Studio actual

- Ana și Radu (agentul aplicației) înlocuiește asistentul creativ separat, „Ask agent” pe element și acțiunile „Copiază promptul” / „Copy to Agent” (interval de cronologie, Lint, Blocuri, storyboard). Fiecare punct de intrare deschide Ana și Radu (agentul aplicației) cu cipul de context potrivit; capacitatea rămâne aceeași.
- Limba: toate textele sunt în română cu diacritice. Etichetele în engleză au fost traduse (Bypass, Off, Slideshow, Master, Print, nume de ease).
- Vizual: fundal de canvas, carduri cu colțuri de 20–24 px, pastile de 999 px, negru pentru acțiunile principale (oțel în tema întunecată), fără albastru și fără fundaluri gri. Iconițe neutre, fără emoji.
- Unelte pentru dezvoltatori (cod, arbore de fișiere, Blocuri, Lint, Variabile, Diapozitive, Storyboard, FFmpeg, conflict de fișier, feedback) sunt grupate sub „Avansat” (bara laterală și meniul „Mai mult”) pentru ca Studio să rămână simplu pentru creatori.
- Ce rămâne deschis: Fill și Stroke pe telefon, eticheta „Gata” pentru decupare, „Lentilă de structură”, „Decupare” și „Grilă și magnet” pe telefon, și copiile vechi „Nume fișier” / „Publică” de pe St-Export, St-M-Export și St-Exported (decizie a proprietarului: păstrare sau eliminare).
