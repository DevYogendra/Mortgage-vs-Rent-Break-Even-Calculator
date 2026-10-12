import type { Page } from '@playwright/test'

// Existing regression tests exercise the unchanged, complete calculator surface.
export async function openFullIndia(page: Page) {
  if (/\/india\/?$/.test(new URL(page.url()).pathname)) {
    await page.getByRole('button', { name: 'Full calculator', exact: true }).click()
  }
}
