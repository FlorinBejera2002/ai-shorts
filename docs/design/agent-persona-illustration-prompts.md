# Workspace Agent cu Ana și Radu – prompturi pentru ilustrații

**Decizia:** Workspace Agent nu mai are robot. Peste tot unde apărea iconița de robot apar personajele noastre, Ana și Radu, ca și cum ei te ajută:
- butonul care deschide agentul;
- antetul panoului;
- mesajele agentului;
- butonul din bara Studio.

Scenele pentru stări (bun venit, gândește, aprobare, resurse, pauză, ajutor, navigare, finalizat, deconectat, ocupat, istoric gol, fără recomandări) există deja pe canvasul Workspace Agent. Mai jos sunt doar ilustrațiile care lipsesc.

**Cum le generezi:** fiecare prompt = **Stil comun** + **Scena**. Atașează ca referință 1–2 ilustrații existente (de exemplu `frontend/public/illustrations/process-edit.webp` și `studio-opening.webp`), ca personajele să rămână identice.

## Stil comun

```
Flat cartoon illustration, bold clean black outlines, soft cel shading, friendly expressive faces, square 1:1 composition. Two recurring characters, always identical:
- Ana: young woman, long voluminous wavy auburn hair, gold hoop earrings, orange hoodie, dark navy skinny jeans, white sneakers.
- Radu: young man, curly dark brown hair, short beard, olive green overshirt open over a white t-shirt, beige chinos, black smartwatch, white sneakers.
Behind them a single large soft light-blue circle (#cfe3fb to #b9d6f7) as the backdrop. Everything outside the circle fully transparent. No text, no letters, no numbers, no logos, no robots, no AI symbols, no extra people.
```

## 1. Avatare (cele mai importante)

Apar foarte mici (24–40 px): în butonul agentului, în antetul panoului și lângă fiecare mesaj al agentului. Trebuie să se citească la 24 px, deci:
- doar capul și umerii;
- contururi groase;
- fără detalii mărunte;
- cercul albastru umple tot pătratul.

| Fișier | Unde apare | Scena (prompt) |
|---|---|---|
| `agent-avatar-duo.webp` (512×512) | Butonul „Workspace Agent”, antetul panoului, iconița din bara Studio și din bara de sus pe telefon | AVATAR, head and shoulders only, extra thick outlines, very simple shapes readable at 24 px. Ana and Radu side by side, cheeks almost touching, both smiling warmly at the viewer; Ana slightly in front on the left, Radu on the right. The light-blue circle fills the whole square edge to edge. Plain, no props. |
| `agent-avatar-ana.webp` (512×512) | Lângă mesajele în care Ana explică sau întreabă (opțional) | AVATAR, head and shoulders only, extra thick outlines, readable at 24 px. Ana alone, friendly smile, looking at the viewer, a little hand wave near her face. The light-blue circle fills the square edge to edge. |
| `agent-avatar-radu.webp` (512×512) | Lângă pașii pe care îi execută Radu (opțional) | AVATAR, head and shoulders only, extra thick outlines, readable at 24 px. Radu alone, confident grin, looking at the viewer, sleeves rolled up. The light-blue circle fills the square edge to edge. |

## 2. Stări care nu au încă ilustrație (480×480)

| Fișier | Stare | Scena (prompt) |
|---|---|---|
| `agent-working.webp` | În lucru (acțiunea rulează) | Full bodies. Radu types fast on a laptop on a small desk while Ana hands him video cards one by one from a neat stack, both focused and cheerful, small motion lines on the keyboard. |
| `agent-failed.webp` | Eșuat (acțiunea nu a reușit) | Full bodies. A checklist board on an easel has one item crossed out with a small warning mark drawn as a shape, not text. Radu scratches his head; Ana pats his shoulder and holds a refresh arrow sign, ready to try again. |
| `agent-stopped.webp` | Oprit (utilizatorul a oprit acțiunea) | Full bodies. Ana gently closes the lid of a laptop on a desk; Radu holds a small red stop sign shape lowered at his side and gives an understanding nod. |
| `agent-listening.webp` | Dictare (agentul te ascultă) | Full bodies. Ana wears big headphones and leans forward listening attentively with a hand cupped near her ear; Radu holds a vintage microphone toward the viewer. Small sound waves drawn as simple curves. |
| `agent-typing.webp` (avatar animat, opțional) | Agentul scrie răspunsul | AVATAR, head and shoulders, same framing as agent-avatar-duo: Ana and Radu looking down thoughtfully, Ana with a pencil at her lips. Readable at 32 px. |

## Variante pentru modul întunecat (opțional)

Același prompt. Schimbă doar cercul de fundal în `deep slate blue circle (#2a3a55)`. La avatare, cercul să rămână luminos și pe întunecat, ca fețele să se vadă clar.
