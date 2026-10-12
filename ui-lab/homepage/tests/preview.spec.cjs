const { test, expect } = require('@playwright/test');

test('desktop scene, safe navigation, motion and theme controls', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /研究数据/ })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/home-dark.png' });
  await expect(page.getByRole('button', { name: /暂停动画|播放动画/ })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('canvas')).toHaveAttribute('data-motion', 'paused');
  const frozen = await page.locator('canvas').evaluate(el => el.toDataURL());
  await page.mouse.move(1200, 350);
  await page.waitForTimeout(180);
  expect(await page.locator('canvas').evaluate(el => el.toDataURL())).toBe(frozen);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(180);
  expect(await page.locator('canvas').evaluate(el => el.toDataURL())).not.toBe(frozen);
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  await page.screenshot({ path: 'test-results/home-light.png' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const link of await page.locator('a[href^="http://127.0.0.1:8080"]').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
  }
  expect(requests.every(url => url.startsWith('http://preview/'))).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile layouts and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('canvas')).toHaveAttribute('data-motion', 'paused');
    await expect(page.locator('footer')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '实验（新标签页）', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-${width}.png`, fullPage: true });
  }
});

test('static-only server rejects writes and invalid hosts', async ({ request }) => {
  expect((await request.get('/')).status()).toBe(200);
  expect((await request.get('/api/experiments')).status()).toBe(404);
  expect((await request.post('/', { data: 'no writes' })).status()).toBe(405);
  expect((await request.get('/', { headers: { Host: 'untrusted.example' } })).status()).toBe(403);
});

test('five palettes recolor the scene, persist and work with keyboard on narrow screens', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: '选择主色调' }).click();
  const colors = [['teal', '青绿'], ['indigo', '靛蓝'], ['violet', '紫罗兰'], ['amber', '琥珀'], ['rose', '玫瑰']];
  let previous;
  for (const [key, name] of colors) {
    await page.getByRole('radio', { name, exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-palette', key);
    const canvas = await page.locator('canvas').evaluate(el => el.toDataURL());
    if (previous) expect(canvas).not.toBe(previous);
    previous = canvas;
    await expect(page.locator('canvas')).toHaveAttribute('data-motion', 'paused');
    await page.screenshot({ path: `test-results/palette-${key}-dark.png` });
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '选择主色调' })).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'rose');
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  await page.getByRole('button', { name: '选择主色调' }).click();
  for (const [key, name] of colors) {
    await page.getByRole('radio', { name, exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-palette', key);
    await page.screenshot({ path: `test-results/palette-${key}-light.png` });
  }
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '琥珀', exact: true })).toBeChecked();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await page.locator('#palette-panel').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/palette-mobile-${width}.png`, fullPage: true });
  }
  await page.mouse.click(600, 180);
  await expect(page.locator('#palette-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('drag rotates the complete disc and releases cleanly without intercepting controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#hero-title')).toHaveText('研究数据管理系统');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-motion', 'paused');
  const original = await canvas.evaluate(el => el.toDataURL());
  await page.mouse.move(1050, 480);
  await page.mouse.down();
  await page.mouse.move(1200, 570, { steps: 8 });
  const rotated = await canvas.evaluate(el => el.toDataURL());
  expect(rotated).not.toBe(original);
  await page.mouse.up();
  await page.mouse.move(1000, 400);
  expect(await canvas.evaluate(el => el.toDataURL())).toBe(rotated);
  await expect(page.locator('#orbit-control')).not.toHaveClass(/dragging/);
  await page.keyboard.press('ArrowRight');
  expect(await canvas.evaluate(el => el.toDataURL())).not.toBe(rotated);
  await page.getByRole('button', { name: '选择主色调' }).click();
  await expect(page.getByRole('radio', { name: '青绿', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: 'test-results/dragged-disc.png' });
});
