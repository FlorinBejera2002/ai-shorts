export function compositionSize(aspect: unknown): { width: number; height: number } {
  switch (aspect) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "2:3":
      return { width: 1080, height: 1620 };
    default:
      return { width: 1920, height: 1080 };
  }
}
