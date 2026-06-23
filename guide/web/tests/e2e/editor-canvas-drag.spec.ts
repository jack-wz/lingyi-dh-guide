import { test, expect } from '@playwright/test';

const apiBase = process.env.E2E_API_URL || 'http://127.0.0.1:3100';

test('canvas drag moves selection and preview together', async ({ page, request }) => {
  const created = await request.post(`${apiBase}/api/templates`, {
    data: {
      name: `E2E canvas drag ${Date.now()}`,
      type: 'e2e',
      description: 'Canvas selection box follows element drag',
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const template = await created.json() as { id: string };

  await page.goto(`/editor/${template.id}`);
  await expect(page.getByTestId('video-canvas')).toBeVisible();

  // Add a text object via the "文字" tool
  await page.getByRole('button', { name: '文字' }).click();
  await expect(page.getByText('文字对象')).toBeVisible();

  // Select the object in the canvas / layers panel
  const objectButton = page.locator('[data-testid="video-canvas"] button').first();
  await objectButton.click();

  // Verify selection overlay appears (dashed border)
  const selectionOverlay = page.locator('[style*="2px dashed"]').first();
  await expect(selectionOverlay).toBeVisible();

  const boxBefore = await selectionOverlay.boundingBox();
  expect(boxBefore).not.toBeNull();

  // Drag the object 80px to the right
  await objectButton.dragTo(objectButton, {
    sourcePosition: { x: 10, y: 10 },
    targetPosition: { x: 90, y: 10 },
  });

  // After drag, selection overlay should have moved with the object
  const boxAfter = await selectionOverlay.boundingBox();
  expect(boxAfter).not.toBeNull();
  expect(boxAfter!.x).toBeGreaterThan(boxBefore!.x + 30);
});