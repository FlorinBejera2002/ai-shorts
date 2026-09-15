# UI component inspiration

Use these references when designing or refining Sneep Cut interface components. Adapt interaction ideas to the existing design system; do not copy visual treatments that conflict with the black-and-neutral brand palette, accessibility, or shared radius tokens.

- React Bits animations: https://reactbits.dev/pro/components?group=Animations
- Rare UI bounce sidebar: https://www.rareui.com/components/bouncesidebar
- Magic UI progressive blur: https://magicui.design/docs/components/progressive-blur
- LottieFiles animation reference: https://app.lottiefiles.com/animation/dffc0fa6-f5e3-4142-8b75-096d8edf62d5?channel=web&from=download&panel=download&source=public-animation
- 21st.dev button components: https://21st.dev/community/components/s/button

## Current adaptation principles

- Prefer subtle spring motion for state changes and focused hover feedback.
- Use progressive blur only where it improves media or scroll-edge legibility.
- Keep primary actions black through semantic foreground tokens.
- Keep form focus states visually simple: preserve the normal input border without
  adding a dark outline, double border, or focus ring.
- Respect reduced-motion preferences.
- Use Lottie only when it communicates a real state and does not compete with user media.
