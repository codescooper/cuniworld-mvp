import {test, expect} from '@playwright/test';
const publicBase = process.env.GITHUB_PAGES === 'true' ? '/cuniworld-mvp' : '';

test('la présentation publique est autonome et le sitemap ne liste pas la gestion', async ({page, request}) => {
  const response = await page.goto(publicBase + '/decouvrir.html');
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', {level:1})).toHaveCount(1);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://cuniworld.vercel.app/decouvrir.html');
  expect(await page.locator('script').count()).toBe(0);
  expect(await page.locator('form').count()).toBe(0);
  const sitemap = await request.get(publicBase + '/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const urls = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]);
  expect(urls).toEqual(['https://cuniworld.vercel.app/decouvrir.html']);
  const robots = await request.get(publicBase + '/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /api/');
});

test('l’interface de gestion reste non indexable', async ({request}) => {
  const response = await request.get(publicBase + '/');
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/<meta name="robots" content="noindex,follow"/);
});
