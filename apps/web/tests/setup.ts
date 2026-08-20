// jest-dom's own `/vitest` entry does a bare `import {expect} from "vitest"`
// with no peer declaration, so pnpm resolves it by hoisting rather than from
// this package. When the workspace hoists a vitest major this app does not use,
// the matchers land on a different `expect` than the one running these tests and
// every jest-dom assertion fails with "Invalid Chai property". Extending here
// binds them to this package's vitest, whatever the workspace hoists.
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, expect, vi } from "vitest";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

// The augmentation shape is jest-dom's own; these extend its matcher interfaces.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
declare module "vitest" {
  interface Assertion<T = any> extends matchers.TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends matchers.TestingLibraryMatchers<any, any> {}
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: window.localStorage,
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
