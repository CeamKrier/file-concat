---
name: browser-testing
description: Write browser-based tests using Playwright or similar tools for E2E testing, visual regression, and cross-browser compatibility. Use when adding automated UI tests or validating user flows.
---

# Browser Testing

## When to Use This Skill

Use when:
- Writing end-to-end tests
- Testing user workflows
- Validating cross-browser compatibility
- Implementing visual regression tests

## Playwright Setup

### Installation

```bash
pnpm add -D @playwright/test
npx playwright install
```

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Test Patterns

### Basic Page Test

```typescript
import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/My App/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

### User Flow Test

```typescript
test('user can upload and process files', async ({ page }) => {
  await page.goto('/');

  // Upload file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('./test-files/sample.txt');

  // Wait for processing
  await expect(page.getByText('Processing...')).toBeVisible();
  await expect(page.getByText('Processing...')).not.toBeVisible();

  // Verify result
  await expect(page.getByTestId('file-tree')).toContainText('sample.txt');
});
```

### Form Interaction

```typescript
test('form submission works', async ({ page }) => {
  await page.goto('/settings');

  // Fill form
  await page.getByLabel('Max file size').fill('64');
  await page.getByLabel('Remove empty lines').check();

  // Submit
  await page.getByRole('button', { name: 'Save' }).click();

  // Verify
  await expect(page.getByText('Settings saved')).toBeVisible();
});
```

## Locator Strategies

```typescript
// Preferred: Role-based (accessible)
page.getByRole('button', { name: 'Submit' });
page.getByRole('textbox', { name: 'Email' });
page.getByRole('checkbox', { name: 'Remember me' });

// Label-based
page.getByLabel('Password');

// Text-based
page.getByText('Welcome');
page.getByText(/welcome/i);  // Case insensitive

// Test ID (when others don't work)
page.getByTestId('submit-button');

// CSS selector (last resort)
page.locator('.submit-btn');
```

## Assertions

```typescript
// Visibility
await expect(element).toBeVisible();
await expect(element).toBeHidden();

// Content
await expect(element).toHaveText('Hello');
await expect(element).toContainText('Hello');

// Attributes
await expect(element).toHaveAttribute('disabled');
await expect(element).toHaveClass(/active/);

// Count
await expect(page.getByRole('listitem')).toHaveCount(5);

// URL
await expect(page).toHaveURL('/dashboard');
```

## Visual Regression

```typescript
test('component looks correct', async ({ page }) => {
  await page.goto('/component-demo');

  // Full page screenshot
  await expect(page).toHaveScreenshot('full-page.png');

  // Element screenshot
  const card = page.getByTestId('card');
  await expect(card).toHaveScreenshot('card.png');
});
```

## Testing Patterns

### Page Object Model

```typescript
// pages/HomePage.ts
export class HomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async uploadFile(filePath: string) {
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
  }

  get fileTree() {
    return this.page.getByTestId('file-tree');
  }
}

// tests/upload.spec.ts
test('upload flow', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.uploadFile('./test.txt');
  await expect(homePage.fileTree).toBeVisible();
});
```

### Fixtures

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    await use(page);
  },
});
```

## Running Tests

```bash
# All tests
npx playwright test

# Specific file
npx playwright test upload.spec.ts

# Headed mode
npx playwright test --headed

# Debug mode
npx playwright test --debug

# Update snapshots
npx playwright test --update-snapshots
```
