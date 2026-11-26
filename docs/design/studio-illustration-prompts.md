# Studio – prompturi pentru ilustrații

Ilustrațiile Ana & Radu pentru ecranele din canvasul [Sneep Cut – Studio](https://claude.ai/artifact/6mapHfV81LVjFV4HuTYE9y).

Fiecare prompt = **Stil comun** + **Scena** ilustrației. Lipește-le împreună în generatorul de imagini și atașează ca referință 1–2 ilustrații existente (de exemplu `frontend/public/illustrations/process-edit.webp` și `load-error.webp`), ca personajele să rămână identice.

**Format de livrare:**
- pătrat 1:1, generat la 1024 px;
- exportat ca `frontend/public/illustrations/<fișier>.webp`, 480×480, cu fundal transparent.

Ștergerea folosește ilustrația existentă `delete.webp`, nu una nouă.

## Stil comun (pune-l la începutul fiecărui prompt)

```
Flat cartoon illustration, bold clean black outlines, soft cel shading, friendly expressive faces, square 1:1 composition. Two recurring characters, always identical:
- Ana: young woman, long voluminous wavy auburn hair, gold hoop earrings, orange hoodie, dark navy skinny jeans, white sneakers.
- Radu: young man, curly dark brown hair, short beard, olive green overshirt open over a white t-shirt, beige chinos, black smartwatch, white sneakers.
Behind them a single large soft light-blue circle (#cfe3fb to #b9d6f7) as the backdrop. Everything outside the circle fully transparent. A faint grey ground shadow under their feet. Full bodies visible, centred, nothing cropped. Props drawn in the same outline style in neutral greys, white and warm wood tones. No text, no letters, no numbers, no logos, no UI screenshots, no extra people.
```

## Ilustrații

| # | Fișier | Unde apare | Scena (prompt) |
|---|---|---|---|
| 1 | `studio-opening.webp` | Se deschide Studio (St-Opening, St-M-Loading) | Ana pulls open two big wooden doors shaped like a clapperboard; behind them glows a tidy editing desk with a monitor showing a play symbol. Radu steps in carrying a laptop under his arm, curious and excited. |
| 2 | `studio-empty-project.webp` | Proiect gol (St-EmptyProject) | Ana holds up a long, completely empty film strip with blank frames, smiling. Radu kneels beside an open cardboard box and lifts out the first video card, ready to place it on a long empty table. |
| 3 | `studio-nothing-selected.webp` | Inspector fără selecție (St-Empty) | Radu points with a giant mouse cursor at one of three video cards lying on a table. Ana leans in with a magnifying glass, looking at the card he points to. |
| 4 | `studio-drop.webp` | Plasare media (St-Drop) | Ana drops several video cards from above into a wide open tray on the floor; the cards are mid-air in a gentle arc. Radu holds the tray steady with both hands and grins. |
| 5 | `studio-import.webp` | Import media (St-Import) | Radu feeds a stack of video cards into a friendly box-shaped machine with a funnel on top. Ana watches a thick progress bar on the machine's side, half filled, holding a coffee cup. |
| 6 | `studio-media-empty.webp` | Bibliotecă media goală | Ana opens an empty wooden drawer of a media cabinet and shrugs, palms up. Radu, next to her, holds a small upload arrow sign pointing up, suggesting to add files. |
| 7 | `studio-rendering.webp` | Export în curs (St-Rendering, St-M-Rendering) | Radu turns a large crank on a vintage film machine; from its slot a film strip comes out and winds onto a reel. Ana stands beside it watching a round gauge with the needle halfway, focused. |
| 8 | `studio-exported.webp` | Export finalizat (St-Exported, St-M-Exported) | Ana proudly holds up a big smartphone showing a vertical video frame with a play symbol. Radu gives a thumbs up and holds a small download arrow badge. Light confetti around them. |
| 9 | `studio-export-failed.webp` | Export eșuat (St-ExportFailed) | The same vintage film machine has a tangled film strip spilling out and a small puff of grey smoke. Radu scratches his head; Ana kneels with a screwdriver, calm and ready to fix it. |
| 10 | `studio-preview-error.webp` | Previzualizare eșuată (St-PreviewError) | Ana and Radu stand in front of a small projector screen that is completely blank. Radu checks the lens of a projector on a stool; Ana holds the projector's cable, puzzled. |
| 11 | `studio-save-failed.webp` | Salvare eșuată (St-SaveFailed, St-M-SaveFailed) | Radu holds a cardboard box of video cards up toward a small cloud shape that has a gap in it, so the box can't go in. Ana holds a clipboard with a checklist and points at the cloud, reassuring. |
| 12 | `studio-offline.webp` | Conexiune pierdută (St-Offline, St-M-Offline) | Ana holds two ends of a thick cable that came unplugged; a small spark sits between the plugs. Radu holds a laptop and looks at it, waiting, one eyebrow raised. |
| 13 | `studio-crash.webp` | Studio s-a blocat (St-Crash) | A tall stack of film reels has toppled over on the floor around them. Ana catches the last reel in mid-air; Radu, surprised but smiling, starts stacking them again. |

## Variante pentru modul întunecat (opțional)

Aceeași scenă și același prompt. Schimbă doar cercul de fundal în `deep slate blue circle (#2a3a55)` și lasă exteriorul transparent. Altfel, ilustrațiile luminoase funcționează și pe întunecat, ca în restul aplicației.
