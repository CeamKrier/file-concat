import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node18',
    clean: true,
    shims: true,
    // Bundle the core package since it exports .ts files
    noExternal: ['@fileconcat/core'],
});
