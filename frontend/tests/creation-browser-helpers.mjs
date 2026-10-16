export async function chooseCreationSource(page, source, locale = 'en') {
  const label = locale === 'ro' ? 'Sursa filmărilor' : 'Video source'
  const option = source === 'youtube'
    ? 'YouTube'
    : locale === 'ro' ? 'Încarcă filmări' : 'Upload videos'
  const selector = page.getByRole('combobox', { name: label, exact: true })
  await selector.click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await page.getByTestId(`creation-${source}-workspace`).waitFor({ state: 'visible' })
}
