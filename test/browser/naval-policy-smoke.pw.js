import { expect, test } from '@playwright/test';

const REQUIRED_SCENARIOS = [
  'ocean-transfer',
  'all-coasts-blocked',
  'selected-routes',
  'disabled-ui',
  'lake-water-path',
  'remote-voyage',
  'inland-rejected',
  'mobile-target-reason',
  'shared-last-action',
  'last-action-once',
  'manual-camera-cancel',
  'water-mask-safe',
  'no-straight-fallback',
  'legacy-sea-neighbors',
  'land-regressions',
];

const FIREBASE_NETWORK = /(?:firebaseio\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)/i;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

test('production naval smoke entry is isolated and complete', async ({ page }, testInfo) => {
  const consoleErrors = [];
  const pageErrors = [];
  const firebaseRequests = [];
  const networkWrites = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (FIREBASE_NETWORK.test(request.url())) firebaseRequests.push(`${request.method()} ${request.url()}`);
    if (WRITE_METHODS.has(request.method())) networkWrites.push(`${request.method()} ${request.url()}`);
  });

  if (testInfo.project.name === 'reduced-motion-chrome') {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  await page.goto('/test/browser/naval-policy-smoke.html', { waitUntil: 'domcontentloaded' });
  const output = page.locator('#smoke-result');
  await expect(output).toHaveAttribute('data-status', /^(pass|fail)$/, { timeout: 35_000 });

  const status = await output.getAttribute('data-status');
  const failedRows = await page.locator('#scenario-results [data-status="fail"]').allTextContents();
  expect({ status, failedRows }, `Smoke sonucu: ${await output.textContent()}`).toEqual({ status: 'pass', failedRows: [] });

  for (const scenarioId of REQUIRED_SCENARIOS) {
    const row = page.locator(`[data-scenario-id="${scenarioId}"]`);
    await expect(row, `${scenarioId} sonucu eksik`).toHaveCount(1);
    await expect(row, `${scenarioId} başarısız`).toHaveAttribute('data-status', 'pass');
    await expect(row.locator('small')).not.toHaveText('');
  }

  await expect(page.locator('[data-scenario-id="motion-presentation"]')).toHaveAttribute('data-status', 'pass');
  expect(await output.getAttribute('data-total')).toBe('16');
  expect(firebaseRequests).toEqual([]);
  expect(networkWrites).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    touchPoints: navigator.maxTouchPoints,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));

  if (testInfo.project.name === 'mobile-chrome') {
    expect(viewport.width).toBe(390);
    expect(viewport.height).toBe(844);
    expect(viewport.touchPoints).toBeGreaterThan(0);
    await expect(page.locator('[data-scenario-id="mobile-target-reason"] small')).toContainText('viewport=390x844');
  }

  if (testInfo.project.name === 'reduced-motion-chrome') {
    expect(viewport.reducedMotion).toBe(true);
    await expect(page.locator('[data-scenario-id="motion-presentation"] small')).toContainText('reduced-motion');
    await expect(page.locator('#map-root-b .aop-voyage-ship')).toHaveCount(0);
    await expect(page.locator('#map-root-b .aop-voyage-highlight')).toHaveCount(2);
  } else {
    expect(viewport.reducedMotion).toBe(false);
  }
});
