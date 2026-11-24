// The Creare clip stepper lives in the page header (outside the story wizard).
const stepperSelector = 'nav[aria-label="Clip creation steps"]'

export async function settleStoryNavigation(page) {
  await page.waitForFunction((selector) => {
    const steppers = Array.from(document.querySelectorAll(selector)).filter((nav) =>
      nav.getClientRects().length > 0
    )
    return steppers.length > 0 && steppers.every((nav) => nav.querySelector('[aria-current="step"]'))
  }, stepperSelector)
  const overflowing = await page.locator(stepperSelector).evaluateAll((navs) =>
    navs.some((nav) => Array.from(nav.querySelectorAll('button')).some((button) =>
      button.scrollWidth > button.clientWidth + 1
    ))
  )
  if (overflowing) throw new Error('Creare clip step labels overflow their pills')
}
