export async function settleStoryNavigation(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll(
    '[data-testid="story-wizard"] nav[data-orientation]'
  )).filter((nav) => nav.getClientRects().length && !nav.closest('[hidden]')).every((nav) => {
    const segments = Array.from(nav.querySelectorAll(':scope > ul > li'))
    const selected = segments.findIndex((segment) => segment.querySelector('[aria-current="step"]'))
    if (selected < 0) return false
    return segments.every((segment, index) => {
      const target = index === 0 ? 0 : index - 1 === selected || index === selected ? 16 : -1
      const style = getComputedStyle(segment)
      const margin = nav.dataset.orientation === 'vertical' ? style.marginTop : style.marginLeft
      return Math.abs(Number.parseFloat(margin) - target) < 0.05
    })
  }))
  const invalid = await page.locator('[data-testid="story-wizard"] nav svg path').evaluateAll(
    (paths) => paths.some((path) => /NaN|Infinity/.test(path.getAttribute('d') ?? ''))
  )
  if (invalid) throw new Error('Story step navigation generated an invalid SVG path')
}
