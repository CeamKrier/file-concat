import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// Without this, any test importing a module that reaches into `#imports`
// (the WXT alias `hn.ts` uses for `browser`) fails to resolve it.
export default defineConfig({
  plugins: [WxtVitest()],
});
