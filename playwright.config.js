import { defineConfig } from '@playwright/test';
import process from 'node:process';

const localBaseURL = 'http://127.0.0.1:4173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseURL;

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.pw.js',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['line']],
  outputDir: 'test-results/playwright',
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: `${localBaseURL}/test/browser/naval-policy-smoke.html`,
    timeout: 20_000,
    reuseExistingServer: false,
  },
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chrome',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'reduced-motion-chrome',
      use: {
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      },
    },
  ],
});
