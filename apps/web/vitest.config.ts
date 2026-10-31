import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Dates are formatted in the local time zone: pin it (before the test workers start)
// so specs give the same output on every machine.
process.env.TZ = 'UTC';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.spec.{ts,tsx}'],
      // Pure modules run in node; hook specs opt into jsdom with a
      // `// @vitest-environment jsdom` comment at the top of the file.
      environment: 'node',
    },
  }),
);
