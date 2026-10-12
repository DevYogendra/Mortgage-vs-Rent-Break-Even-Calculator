import { test, expect } from '@playwright/test'

for (const [width, columns] of [[1440, 8], [1100, 6], [700, 4], [390, 2], [320, 2]]) {
  test(`all remaining forms use ${columns} columns at ${width}px and fit both themes`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const [route, name] of [['/', 'us'], ['/india/market', 'market'], ['/india/builders', 'builders']]) {
      await page.goto(route)
      const grids = page.locator('.compact-input-grid:visible')
      for (const grid of await grids.all()) expect(await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(columns)
      for (const input of await page.locator('.compact-input-grid:visible input[type=number], .compact-input-grid:visible input[type=text]').all()) {
        await expect(input).toBeVisible()
        expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      }
      if (width >= 1100) expect((await page.locator(name === 'us' ? '.result-panel' : '.compact-pool-summary').boundingBox())!.y).toBeLessThan(900)
      for (const theme of ['light', 'dark']) {
        await page.getByLabel('Color theme', { exact: true }).selectOption(theme)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: `artifacts/compact-${name}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' })
      }
      await page.getByText('Help with fields', { exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.compact-help dt').filter({ hasText: name === 'us' ? /^PMI$/ : /^Segments & effective buyers$/ })).toBeVisible()
      if (name === 'market') await page.getByText('Edit household segments', { exact: true }).click()
      if (name !== 'us') {
        await page.getByText('Buying intentions for this segment', { exact: true }).click()
        await page.getByText('Segment results & exclusions', { exact: true }).click()
        const table = page.getByRole('region', { name: 'Segment capacity results', exact: true })
        if (width < 700) {
          await table.focus(); await table.press('ArrowRight')
          await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('link', { name: 'Results', exact: false }).focus()
      await page.keyboard.press('Enter')
      await expect(page.locator(name === 'us' ? '#us-results' : '#market-results')).toBeFocused()
    }
    expect(errors).toEqual([])
  })
}

test('US fields validate live without moving focus; reset and reload restore defaults', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.compact-input-grid input[type=number]')).toHaveCount(22)
  await expect(page.getByRole('button', { name: 'Calculate break-even' })).toHaveCount(0)
  await expect(page.locator('.big-result')).toContainText('4.39%')
  await expect(page.locator('.annual-section')).toBeHidden()
  for (const [name, invalid, valid] of [
    ['Purchase price', '', '600000'], ['Down payment', '101', '20'], ['Years in the home', '1.01', '10'],
    ['Mortgage interest rate', '-1', '6.25'], ['Mortgage term', '0', '30'], ['Annual property tax', '-1', '1'],
    ['Annual homeowners insurance', '-1', '1800'], ['Annual maintenance', '-1', '1'], ['Current monthly rent', '-1', '2700'],
    ['Annual rent increase', '-100', '3'], ['Monthly renters insurance', '-1', '20'], ['Other monthly renter expenses', '-1', '0'],
    ['Annual investment return', '-100', '7'], ['Expense inflation', '-100', '3'], ['Buyer closing costs', '-1', '2'], ['Selling costs', '100', '6'],
    ['Monthly HOA', '-1', '0'], ['Extra monthly principal', '-1', '0'], ['Monthly PMI', '-1', '0'],
    ['PMI stops at loan / price', '101', '80'], ['Other monthly owner expenses', '-1', '0'], ['Tax savings from mortgage interest', '101', '0'],
  ]) {
    const input = page.getByLabel(name, { exact: true })
    await input.focus()
    const y = await page.evaluate(() => scrollY)
    await input.fill(invalid)
    await expect(input).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(y)
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input.locator('..').locator('..').locator('small')).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.locator('.result-panel')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Download calculation JSON' })).toHaveCount(0)
    await input.fill(valid)
    await expect(page.locator('.result-panel')).toBeVisible()
  }
  await page.getByLabel('Down payment unit').selectOption('dollars')
  await expect(page.getByLabel('Down payment', { exact: true })).toHaveValue('120000')
  await page.getByLabel('Purchase price', { exact: true }).fill('700000')
  await expect(page.getByLabel('Down payment', { exact: true })).toHaveValue('120000')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByLabel('Down payment unit')).toHaveValue('percent')
  await expect(page.locator('.big-result')).toContainText('4.39%')
  await page.getByLabel('Current monthly rent', { exact: true }).fill('3500')
  await page.reload()
  await expect(page.getByLabel('Current monthly rent', { exact: true })).toHaveValue('2700')
})

test('segment selector retains profile edits and reveals errors in other groups', async ({ page }) => {
  await page.goto('/india/builders')
  const selector = page.getByLabel('Household segment', { exact: true })
  await expect(page.getByLabel('Monthly take-home income — Income-backed example', { exact: true })).toHaveValue('2.5')
  await expect(page.getByLabel('Liquid purchase funds — Income-backed example', { exact: true })).toHaveValue('55')
  await page.getByLabel('Household count — Income-backed example', { exact: true }).fill('300')
  await selector.selectOption({ label: 'Constrained example' })
  await expect(page.getByLabel('Protected cash reserve — Constrained example', { exact: true })).toHaveCount(0)
  await page.getByLabel('Liquid purchase funds — Constrained example', { exact: true }).fill('-1')
  await expect(page.getByRole('alert')).toContainText('Liquid purchase funds')
  await selector.selectOption({ label: 'Income-backed example' })
  await expect(page.getByLabel('Household count — Income-backed example', { exact: true })).toHaveValue('300')
  await expect(selector.locator('option').filter({ hasText: 'Constrained example' })).toContainText('Check fields')
  await expect(page.getByRole('alert')).toContainText('Select a segment')
  await selector.selectOption({ label: 'Constrained example · Check fields' })
  await page.getByLabel('Liquid purchase funds — Constrained example', { exact: true }).fill('15')
  await expect(page.locator('.india-result h2')).toContainText('400')
  await selector.selectOption({ label: 'Wealth-backed example' })
  await page.getByRole('button', { name: 'Reset examples' }).click()
  await expect(selector.locator('option:checked')).toHaveText('Income-backed example')
  await expect(page.locator('.india-result h2')).toContainText('350')
  await page.getByLabel('Property price', { exact: true }).fill('1.8')
  await page.reload()
  await expect(page.getByLabel('Property price', { exact: true })).toHaveValue('1.5')
})
