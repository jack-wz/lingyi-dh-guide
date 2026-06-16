import { defineConfig, devices } from '@playwright/test';

const browserChannel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const e2eApiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3100';
const e2eBaseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'DISABLE_RENDER_WORKER=1 PORT=3100 npm run dev --workspace=server',
      cwd: '..',
      url: `${e2eApiUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'VITE_API_TARGET=http://127.0.0.1:3100 npm run dev -- --host 127.0.0.1 --port 5174',
      url: e2eBaseUrl,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: browserChannel,
      },
    },
  ],
});
