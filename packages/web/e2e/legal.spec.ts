import { test, expect } from './fixtures';

for (const [path, title, heading] of [
  ['/privacy', 'Privacy Policy', 'Children and changes'],
  ['/terms', 'Terms of Service', 'Questions'],
]) {
  test(`${title} section links reach their content on desktop and phone`, async ({ page }) => {
    await page.goto(path);
    const main = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(main.locator('[aria-current="page"]')).toHaveAttribute('href', path);
    if ((page.viewportSize()?.width ?? 0) <= 600) {
      await page.locator('.legal-mobile-contents summary').click();
    }
    const contents = page.locator('.legal-contents:visible nav, .legal-mobile-contents[open] nav');
    const link = contents.getByRole('link', { name: heading, exact: true });
    const href = await link.getAttribute('href');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    const target = page.getByRole('heading', { name: heading, exact: true });
    await expect(target).toBeInViewport();
    await expect(page.locator(`section${href}`)).toContainText(heading);
    await expect(page.locator('article')).toHaveAccessibleName(title);
  });
}
