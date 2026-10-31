import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles the sources like `nest build` does (legacy decorators and their
// metadata), which class-validator, class-transformer and Nest's DI rely on.
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Loaded by Nest at boot; class-transformer needs it for implicit conversion.
    setupFiles: ['reflect-metadata'],
  },
});
